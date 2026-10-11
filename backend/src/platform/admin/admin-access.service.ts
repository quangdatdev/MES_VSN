import { Inject, Injectable } from '@nestjs/common';
import { AppException, Errors } from '../../common/app.exception';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { CORE_DB, type CoreDb } from '../database/database.module';
import { PermissionService } from '../permission/permission.service';
import { RoleCreateDto, RolePermissionsDto, RoleUpdateDto } from './admin.dto';

/** Vai trò, quyền, menu: toàn bộ là dữ liệu, đổi qua màn Admin. */
@Injectable()
export class AdminAccessService {
  constructor(
    @Inject(CORE_DB) private readonly db: CoreDb,
    private readonly audit: AuditService,
    private readonly permissions: PermissionService,
  ) {}

  private log(actor: AuthUser, id: number | string, action: string, oldValue?: unknown, newValue?: unknown, entityType = 'SysRole') {
    return this.audit.log({ userId: actor.userId, username: actor.username, branchCode: actor.branchCode, entityType, entityId: id, actionCode: action, oldValue, newValue });
  }

  private logStrict(trx: CoreDb, actor: AuthUser, id: number, action: string, oldValue?: unknown, newValue?: unknown) {
    return this.audit.logStrict({ userId: actor.userId, username: actor.username, branchCode: actor.branchCode, entityType: 'SysRole', entityId: id, actionCode: action, oldValue, newValue }, trx);
  }

  async listRoles() {
    const roles = await this.db.selectFrom('SysRole').selectAll().orderBy('SortOrder').orderBy('Code').execute();
    const perms = await this.db.selectFrom('SysRolePermission').select((eb) => ['RoleId', eb.fn.countAll<number>().as('n')]).groupBy('RoleId').execute();
    const users = await this.db.selectFrom('SysUserRole').select((eb) => ['RoleId', eb.fn.countAll<number>().as('n')]).groupBy('RoleId').execute();
    return roles.map((r) => ({
      id: r.Id,
      code: r.Code,
      name: r.Name,
      description: r.Description,
      isActive: !!r.IsActive,
      isSystem: !!r.IsSystem,
      permissionCount: Number(perms.find((p) => p.RoleId === r.Id)?.n ?? 0),
      userCount: Number(users.find((u) => u.RoleId === r.Id)?.n ?? 0),
    }));
  }

  async createRole(actor: AuthUser, dto: RoleCreateDto) {
    const exists = await this.db.selectFrom('SysRole').select('Id').where('Code', '=', dto.code).executeTakeFirst();
    if (exists) throw Errors.conflict('Mã vai trò đã được dùng.');
    const max = await this.db.selectFrom('SysRole').select((eb) => eb.fn.max('SortOrder').as('m')).executeTakeFirst();
    const row = await this.db
      .insertInto('SysRole')
      .values({ Code: dto.code, Name: dto.name.trim(), Description: dto.description ?? null, SortOrder: (max?.m ?? 0) + 10, IsActive: true, IsSystem: false, CreatedBy: actor.userId } as any)
      .output('inserted.Id')
      .executeTakeFirstOrThrow();
    await this.log(actor, row.Id, 'ROLE_CREATE', undefined, { code: dto.code, name: dto.name });
    return { id: row.Id };
  }

  async updateRole(actor: AuthUser, id: number, dto: RoleUpdateDto) {
    const before = await this.db.selectFrom('SysRole').select(['Code', 'Name', 'Description', 'IsActive', 'IsSystem']).where('Id', '=', id).executeTakeFirst();
    if (!before) throw Errors.notFound('Không tìm thấy vai trò.');
    if (dto.code !== undefined && dto.code !== before.Code) throw Errors.codeImmutable();
    if (dto.isActive === false && before.IsSystem) throw Errors.conflict('Vai trò hệ thống không thể vô hiệu hóa.');
    const activeChanged = dto.isActive !== undefined && dto.isActive !== !!before.IsActive;
    // Bật lại vai trò mình đang giữ cũng là tự cấp lại quyền, nên chặn cả hai chiều.
    if (activeChanged) await this.assertCanChangeRole(actor, id);

    const set: Record<string, unknown> = {};
    if (dto.name !== undefined) set.Name = dto.name.trim();
    if (dto.description !== undefined) set.Description = dto.description?.trim() || null;
    if (dto.isActive !== undefined) set.IsActive = dto.isActive;
    await this.db.transaction().execute(async (trx) => {
      await trx.updateTable('SysRole').set({ ...set, ModifiedAt: new Date(), ModifiedBy: actor.userId } as any).where('Id', '=', id).execute();
      if (activeChanged) await this.permissions.bumpVersion(trx);
      await this.logStrict(trx, actor, id, 'ROLE_UPDATE', before, set);
    });
    if (activeChanged) this.permissions.clearCache();
  }

  async deleteRole(actor: AuthUser, id: number) {
    const role = await this.db.selectFrom('SysRole').select(['Code', 'IsSystem']).where('Id', '=', id).executeTakeFirst();
    if (!role) throw Errors.notFound('Không tìm thấy vai trò.');
    if (role.IsSystem) throw Errors.conflict('Vai trò hệ thống không thể xóa.');
    await this.assertCanChangeRole(actor, id);
    // Không xóa vật lý danh mục: chỉ vô hiệu hóa (quy ước CLAUDE.md mục 5).
    await this.db.transaction().execute(async (trx) => {
      await trx.updateTable('SysRole').set({ IsActive: false, ModifiedAt: new Date(), ModifiedBy: actor.userId }).where('Id', '=', id).execute();
      await this.permissions.bumpVersion(trx);
      await this.logStrict(trx, actor, id, 'ROLE_DELETE', { code: role.Code });
    });
    this.permissions.clearCache();
  }

  async getRolePermissions(roleId: number): Promise<number[]> {
    const role = await this.db.selectFrom('SysRole').select('Id').where('Id', '=', roleId).executeTakeFirst();
    if (!role) throw Errors.notFound('Không tìm thấy vai trò.');
    const rows = await this.db.selectFrom('SysRolePermission').select('PermissionId').where('RoleId', '=', roleId).execute();
    return rows.map((r) => r.PermissionId);
  }

  /** Đặt lại toàn bộ quyền của vai trò. Không được sửa quyền của vai trò mà chính mình đang giữ. */
  async setRolePermissions(actor: AuthUser, roleId: number, dto: RolePermissionsDto) {
    const role = await this.db.selectFrom('SysRole').select(['Code']).where('Id', '=', roleId).executeTakeFirst();
    if (!role) throw Errors.notFound('Không tìm thấy vai trò.');
    await this.assertNotOwnRole(actor, roleId, 'Bạn đang giữ vai trò này nên không được tự sửa quyền của nó.');

    const wanted = [...new Set(dto.permissionIds)];
    const valid = wanted.length ? await this.db.selectFrom('SysPermission').select(['Id', 'Code']).where('Id', 'in', wanted).where('IsActive', '=', true).execute() : [];
    if (valid.length !== wanted.length) throw new AppException('VALIDATION_FAILED', 'Có quyền không tồn tại.', 422);

    const currentRows = await this.db
      .selectFrom('SysRolePermission as rp')
      .innerJoin('SysPermission as p', 'p.Id', 'rp.PermissionId')
      .select(['rp.PermissionId', 'p.Code'])
      .where('rp.RoleId', '=', roleId)
      .execute();
    // Không cấp, cũng không gỡ, quyền quản trị mà chính mình không có.
    await this.permissions.assertAdminCeiling(
      actor,
      [...currentRows.map((r) => r.Code), ...valid.map((v) => v.Code)],
      'Vai trò này liên quan quyền quản trị mà bạn không có.',
    );
    const currentIds = new Set(currentRows.map((r) => r.PermissionId));
    const wantedIds = new Set(valid.map((v) => v.Id));
    const added = valid.filter((v) => !currentIds.has(v.Id));
    const removed = currentRows.filter((r) => !wantedIds.has(r.PermissionId));
    if (added.length === 0 && removed.length === 0) return { added: 0, removed: 0 };

    await this.db.transaction().execute(async (trx) => {
      if (removed.length) await trx.deleteFrom('SysRolePermission').where('RoleId', '=', roleId).where('PermissionId', 'in', removed.map((r) => r.PermissionId)).execute();
      // Chia lô: SQL Server giới hạn 2100 tham số mỗi câu.
      for (let i = 0; i < added.length; i += 500) {
        const chunk = added.slice(i, i + 500).map((a) => ({ RoleId: roleId, PermissionId: a.Id, CreatedBy: actor.userId }));
        await trx.insertInto('SysRolePermission').values(chunk as any).execute();
      }
      await this.permissions.bumpVersion(trx);
      await this.logStrict(trx, actor, roleId, 'ROLE_PERMISSIONS', { removed: removed.map((r) => r.Code) }, { role: role.Code, added: added.map((a) => a.Code) });
    });
    this.permissions.clearCache();
    return { added: added.length, removed: removed.length };
  }

  /** Quyền nhóm theo module → tài nguyên → hành động, để dựng ma trận. */
  async listPermissions() {
    const groups = await this.db.selectFrom('SysMenu').select(['Code', 'Name', 'SortOrder']).where('ParentId', 'is', null).orderBy('SortOrder').execute();
    const resources = await this.db.selectFrom('SysResource').select(['Id', 'Code', 'Name', 'ModuleCode', 'ScopeType', 'SortOrder']).where('IsActive', '=', true).orderBy('SortOrder').execute();
    const perms = await this.db.selectFrom('SysPermission').select(['Id', 'Code', 'ResourceId', 'ActionCode', 'SortOrder']).where('IsActive', '=', true).orderBy('SortOrder').execute();
    return {
      actions: ['view', 'create', 'update', 'delete', 'export'],
      modules: groups.map((g) => {
        const module = g.Code.replace(/^menu\./, '');
        return {
          code: module,
          name: g.Name,
          resources: resources
            .filter((r) => r.ModuleCode === module)
            .map((r) => ({
              id: r.Id,
              code: r.Code,
              name: r.Name,
              scopeType: r.ScopeType,
              permissions: perms.filter((p) => p.ResourceId === r.Id).map((p) => ({ id: p.Id, code: p.Code, action: p.ActionCode })),
            })),
        };
      }),
    };
  }

  async listMenus() {
    const rows = await this.db
      .selectFrom('SysMenu as m')
      .leftJoin('SysResource as r', 'r.Id', 'm.ResourceId')
      .select(['m.Id', 'm.Code', 'm.Name', 'm.ParentId', 'm.Path', 'm.Icon', 'm.IsMobile', 'm.IsActive', 'm.SortOrder', 'r.Code as ResourceCode'])
      .orderBy('m.SortOrder')
      .execute();
    const node = (r: (typeof rows)[number]) => ({ id: r.Id, code: r.Code, name: r.Name, path: r.Path, icon: r.Icon, isMobile: !!r.IsMobile, isActive: !!r.IsActive, resourceCode: r.ResourceCode });
    return rows.filter((r) => r.ParentId === null).map((g) => ({ ...node(g), children: rows.filter((c) => c.ParentId === g.Id).map(node) }));
  }

  /** Bật, tắt, xóa vai trò: không phải vai trò mình đang giữ, và không chứa quyền quản trị mình không có. */
  private async assertCanChangeRole(actor: AuthUser, roleId: number) {
    await this.assertNotOwnRole(actor, roleId);
    await this.permissions.assertAdminCeiling(actor, await this.permissions.assignedToRoles([roleId]), 'Vai trò này có quyền quản trị mà bạn không có.');
  }

  private async assertNotOwnRole(actor: AuthUser, roleId: number, msg?: string) {
    const own = await this.db.selectFrom('SysUserRole').select('Id').where('UserId', '=', actor.userId).where('RoleId', '=', roleId).executeTakeFirst();
    if (own) throw Errors.selfElevation(msg);
  }
}
