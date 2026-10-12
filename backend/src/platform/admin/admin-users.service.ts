import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { sql } from 'kysely';
import { AppException, Errors } from '../../common/app.exception';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { CORE_DB, type CoreDb } from '../database/database.module';
import { PermissionService } from '../permission/permission.service';
import { PageQuery, ResetPasswordDto, UserBranchesDto, UserCreateDto, UserRolesDto, UserUpdateDto } from './admin.dto';

const like = (q: string) => `%${q.replace(/[%_[]/g, (c) => `[${c}]`)}%`;

@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(CORE_DB) private readonly db: CoreDb,
    private readonly audit: AuditService,
    private readonly permissions: PermissionService,
  ) {}

  private log(actor: AuthUser, id: number | string, action: string, oldValue?: unknown, newValue?: unknown) {
    return this.audit.log({ userId: actor.userId, username: actor.username, branchCode: actor.branchCode, entityType: 'SysUser', entityId: id, actionCode: action, oldValue, newValue });
  }

  private logStrict(trx: CoreDb, actor: AuthUser, id: number, action: string, oldValue?: unknown, newValue?: unknown) {
    return this.audit.logStrict({ userId: actor.userId, username: actor.username, branchCode: actor.branchCode, entityType: 'SysUser', entityId: id, actionCode: action, oldValue, newValue }, trx);
  }

  async list(q: PageQuery) {
    const base = () => {
      let qb = this.db.selectFrom('SysUser');
      if (q.q?.trim()) {
        const l = like(q.q.trim());
        qb = qb.where((eb) => eb.or([eb('Username', 'like', l), eb('FullName', 'like', l), eb('Email', 'like', l)]));
      }
      return qb;
    };
    const total = await base().select(sql<number>`COUNT(*)`.as('n')).executeTakeFirstOrThrow();
    const rows = await base()
      .select(['Id', 'Username', 'FullName', 'Email', 'IsActive', 'LockedUntilAt', 'LastLoginAt'])
      // Tài khoản mới tạo lên đầu (100 dòng đầu, xem thêm thì sang trang), như các màn danh sách khác
      .orderBy('CreatedAt', 'desc')
      .orderBy('Id', 'desc')
      .offset((q.page - 1) * q.pageSize)
      .fetch(q.pageSize)
      .execute();
    const ids = rows.map((r) => r.Id);
    const roles = ids.length ? await this.db.selectFrom('SysUserRole').select(['UserId', 'RoleId']).where('UserId', 'in', ids).execute() : [];
    const branches = ids.length ? await this.db.selectFrom('SysUserBranch').select(['UserId', 'BranchId', 'IsDefault']).where('UserId', 'in', ids).execute() : [];
    const now = Date.now();
    return {
      total: Number(total.n),
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((r) => ({
        id: r.Id,
        username: r.Username,
        fullName: r.FullName,
        email: r.Email,
        isActive: !!r.IsActive,
        isLocked: !!r.LockedUntilAt && r.LockedUntilAt.getTime() > now,
        lastLoginAt: r.LastLoginAt,
        roleIds: roles.filter((x) => x.UserId === r.Id).map((x) => x.RoleId),
        branchIds: branches.filter((x) => x.UserId === r.Id).map((x) => x.BranchId),
        defaultBranchId: branches.find((x) => x.UserId === r.Id && x.IsDefault)?.BranchId ?? null,
      })),
    };
  }

  async create(actor: AuthUser, dto: UserCreateDto) {
    const exists = await this.db.selectFrom('SysUser').select('Id').where('Username', '=', dto.username).executeTakeFirst();
    if (exists) throw Errors.conflict('Tên đăng nhập đã được dùng.');
    const hash = await argon2.hash(dto.initialPassword, { type: argon2.argon2id });
    const row = await this.db
      .insertInto('SysUser')
      .values({ Username: dto.username, PasswordHash: hash, FullName: dto.fullName.trim(), Email: dto.email ?? null, FailedLoginCount: 0, IsActive: true, CreatedBy: actor.userId } as any)
      .output('inserted.Id')
      .executeTakeFirstOrThrow();
    await this.log(actor, row.Id, 'USER_CREATE', undefined, { username: dto.username, fullName: dto.fullName });
    return { id: row.Id };
  }

  async update(actor: AuthUser, id: number, dto: UserUpdateDto) {
    const before = await this.db.selectFrom('SysUser').select(['Username', 'FullName', 'Email', 'IsActive']).where('Id', '=', id).executeTakeFirst();
    if (!before) throw Errors.notFound('Không tìm thấy người dùng.');
    if (id === actor.userId && dto.isActive === false) throw Errors.selfElevation('Bạn không thể tự vô hiệu hóa tài khoản của mình.');
    if (id !== actor.userId) await this.assertCanManage(actor, id);

    const set: Record<string, unknown> = {};
    if (dto.fullName !== undefined) set.FullName = dto.fullName.trim();
    if (dto.email !== undefined) set.Email = dto.email?.trim() || null;
    if (dto.isActive !== undefined) set.IsActive = dto.isActive;
    if (dto.unlock) {
      set.FailedLoginCount = 0;
      set.LockedUntilAt = null;
    }
    const activeChanged = dto.isActive !== undefined && dto.isActive !== !!before.IsActive;

    await this.db.transaction().execute(async (trx) => {
      await trx.updateTable('SysUser').set({ ...set, ModifiedAt: new Date(), ModifiedBy: actor.userId } as any).where('Id', '=', id).execute();
      if (dto.isActive === false) await this.revokeSessions(id, trx);
      // Bật lại cũng phải tăng version: cache quyền đang nhớ "đã vô hiệu" của user này.
      if (activeChanged) await this.permissions.bumpVersion(trx);
      await this.logStrict(trx, actor, id, 'USER_UPDATE', before, set);
    });
    if (activeChanged) this.permissions.clearCache();
  }

  async resetPassword(actor: AuthUser, id: number, dto: ResetPasswordDto) {
    if (id === actor.userId) throw Errors.selfElevation('Không tự đặt lại mật khẩu của chính mình ở màn quản trị.');
    await this.assertUser(id);
    await this.assertCanManage(actor, id);
    const hash = await argon2.hash(dto.newPassword, { type: argon2.argon2id });
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('SysUser')
        .set({ PasswordHash: hash, FailedLoginCount: 0, LockedUntilAt: null, ModifiedAt: new Date(), ModifiedBy: actor.userId })
        .where('Id', '=', id)
        .execute();
      await this.revokeSessions(id, trx);
      await this.logStrict(trx, actor, id, 'PASSWORD_RESET');
    });
  }

  async setRoles(actor: AuthUser, id: number, dto: UserRolesDto) {
    if (id === actor.userId) throw Errors.selfElevation('Bạn không được tự thay đổi vai trò của chính mình.');
    await this.assertUser(id);
    await this.assertCanManage(actor, id);
    const roleIds = [...new Set(dto.roleIds)];
    const valid = roleIds.length
      ? await this.db.selectFrom('SysRole').select(['Id', 'Code']).where('Id', 'in', roleIds).where('IsActive', '=', true).execute()
      : [];
    if (valid.length !== roleIds.length) throw new AppException('VALIDATION_FAILED', 'Có vai trò không tồn tại hoặc đã bị vô hiệu.', 422);
    await this.permissions.assertAdminCeiling(
      actor,
      await this.permissions.assignedToRoles(valid.map((r) => r.Id)),
      'Không thể gán vai trò có quyền quản trị mà bạn không có.',
    );

    // So sánh khác biệt: phép gán giữ nguyên thì giữ nguyên phạm vi của nó (ADR 0005)
    const current = await this.db
      .selectFrom('SysUserRole as ur')
      .innerJoin('SysRole as r', 'r.Id', 'ur.RoleId')
      .select(['ur.Id', 'ur.RoleId', 'r.Code'])
      .where('ur.UserId', '=', id)
      .execute();
    const wanted = new Set(valid.map((r) => r.Id));
    const removed = current.filter((c) => !wanted.has(c.RoleId));
    const added = valid.filter((v) => !current.some((c) => c.RoleId === v.Id));
    if (removed.length === 0 && added.length === 0) return;
    // Gỡ vai trò mà mình không đủ trần quyền cũng bị chặn (assertCanManage đã xét mọi quyền hiện có của người này)
    const droppedScopes = removed.length
      ? await this.db
          .selectFrom('SysUserRoleScope as s')
          .innerJoin('SysScopeDimension as d', 'd.Id', 's.DimensionId')
          .leftJoin('SysOrgUnit as o', 'o.Id', 's.OrgUnitId')
          .select(['s.UserRoleId', 'd.Code', 's.ScopeMode', 'o.Code as OrgCode', 's.ScopeValue'])
          .where('s.UserRoleId', 'in', removed.map((r) => r.Id))
          .execute()
      : [];

    await this.db.transaction().execute(async (trx) => {
      if (removed.length) {
        // Không có xóa dây chuyền ở DB: xóa phạm vi trước, ghi lại trong audit để phạm vi không mất âm thầm
        await trx.deleteFrom('SysUserRoleScope').where('UserRoleId', 'in', removed.map((r) => r.Id)).execute();
        await trx.deleteFrom('SysUserRole').where('Id', 'in', removed.map((r) => r.Id)).execute();
      }
      if (added.length) {
        await trx.insertInto('SysUserRole').values(added.map((r) => ({ UserId: id, RoleId: r.Id, CreatedBy: actor.userId })) as any).execute();
      }
      await this.permissions.bumpVersion(trx);
      await this.logStrict(
        trx,
        actor,
        id,
        'USER_ROLES',
        {
          roles: current.map((c) => c.Code),
          removedScopes: droppedScopes.map((s) => `${removed.find((r) => r.Id === s.UserRoleId)?.Code}/${s.Code}:${s.ScopeMode}:${s.OrgCode ?? s.ScopeValue ?? ''}`),
        },
        { roles: valid.map((r) => r.Code), added: added.map((a) => a.Code), removed: removed.map((r) => r.Code) },
      );
    });
    this.permissions.clearCache();
  }

  /**
   * Đơn vị cơ sở được chọn khi đăng nhập (SysUserBranch). Nhà máy SX lập kế hoạch xuất hàng được theo ĐVCS đăng nhập (danh
   * mục Nhà máy SX), không tích theo người (ADR 0013 mục 11).
   */
  async setBranches(actor: AuthUser, id: number, dto: UserBranchesDto) {
    if (id === actor.userId) throw Errors.selfElevation('Bạn không được tự thay đổi đơn vị cơ sở của chính mình.');
    await this.assertUser(id);
    await this.assertCanManage(actor, id);
    const branchIds = [...new Set(dto.branchIds)];
    const valid = branchIds.length
      ? await this.db.selectFrom('SysBranch').select(['Id', 'Code']).where('Id', 'in', branchIds).where('IsActive', '=', true).execute()
      : [];
    if (valid.length !== branchIds.length) throw new AppException('VALIDATION_FAILED', 'Có đơn vị cơ sở không tồn tại hoặc đã bị vô hiệu.', 422);
    const defaultId = dto.defaultBranchId && branchIds.includes(dto.defaultBranchId) ? dto.defaultBranchId : valid[0]?.Id;

    const current = await this.db
      .selectFrom('SysUserBranch as ub')
      .innerJoin('SysBranch as b', 'b.Id', 'ub.BranchId')
      .select('b.Code')
      .where('ub.UserId', '=', id)
      .execute();
    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('SysUserBranch').where('UserId', '=', id).execute();
      if (valid.length) {
        await trx
          .insertInto('SysUserBranch')
          .values(valid.map((b) => ({ UserId: id, BranchId: b.Id, IsDefault: b.Id === defaultId, CreatedBy: actor.userId })) as any)
          .execute();
      }
      await this.permissions.bumpVersion(trx);
      await this.logStrict(
        trx,
        actor,
        id,
        'USER_BRANCHES',
        { branches: current.map((c) => c.Code) },
        { branches: valid.map((b) => b.Code) },
      );
    });
    this.permissions.clearCache();
  }

  /** Không quản lý được tài khoản đang giữ quyền quản trị mà mình không có (đặt lại mật khẩu, tắt, đổi vai trò...). */
  private async assertCanManage(actor: AuthUser, targetId: number) {
    await this.permissions.assertAdminCeiling(
      actor,
      await this.permissions.assignedToUser(targetId),
      'Tài khoản này có quyền quản trị mà bạn không có nên bạn không thay đổi được.',
    );
  }

  private async assertUser(id: number) {
    const u = await this.db.selectFrom('SysUser').select('Id').where('Id', '=', id).executeTakeFirst();
    if (!u) throw Errors.notFound('Không tìm thấy người dùng.');
  }

  private async roleCodes(userId: number): Promise<string[]> {
    const rows = await this.db
      .selectFrom('SysUserRole as ur')
      .innerJoin('SysRole as r', 'r.Id', 'ur.RoleId')
      .select('r.Code')
      .where('ur.UserId', '=', userId)
      .execute();
    return rows.map((r) => r.Code);
  }

  private async revokeSessions(userId: number, executor: CoreDb = this.db) {
    await executor.updateTable('SysUserSession').set({ RevokedAt: new Date() }).where('UserId', '=', userId).where('RevokedAt', 'is', null).execute();
  }
}
