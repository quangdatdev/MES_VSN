import { Inject, Injectable } from '@nestjs/common';
import { AppException, Errors } from '../../common/app.exception';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { ResourceRegistry } from '../data/resource-registry';
import { CORE_DB, type CoreDb } from '../database/database.module';
import { OrgService } from '../org/org.service';
import { BranchService } from '../permission/branch.service';
import { FieldPolicyService } from '../permission/field-policy.service';
import { LINE_DIMENSION, PermissionService, type Condition } from '../permission/permission.service';
import { AssignmentScopeDto, OverrideDto, RoleFieldPoliciesDto, UserFieldPolicyDto } from './admin.dto';

const invalid = (msg: string) => new AppException('VALIDATION_FAILED', msg, 422);

function validRange(from?: string | null, to?: string | null) {
  const f = from ? new Date(from) : null;
  const t = to ? new Date(to) : null;
  if (f && t && f >= t) throw invalid('Ngày bắt đầu phải trước ngày kết thúc.');
  return { ValidFromAt: f, ValidToAt: t };
}

/**
 * Quản trị L3 (phạm vi theo phép gán), L4 (chính sách cột), L5 (ngoại lệ theo người) – ADR 0005.
 * Mọi thay đổi: không tự áp cho chính mình, tôn trọng trần quyền quản trị (ADR 0004), ghi audit và tăng
 * PermissionVersion trong cùng transaction để hiệu lực ngay.
 */
@Injectable()
export class AdminGrantsService {
  constructor(
    @Inject(CORE_DB) private readonly db: CoreDb,
    private readonly audit: AuditService,
    private readonly permissions: PermissionService,
    private readonly fields: FieldPolicyService,
    private readonly registry: ResourceRegistry,
    private readonly branches: BranchService,
    private readonly org: OrgService,
  ) {}

  private logStrict(trx: CoreDb, actor: AuthUser, entityType: string, id: number | string, action: string, oldValue?: unknown, newValue?: unknown) {
    return this.audit.logStrict(
      { userId: actor.userId, username: actor.username, branchCode: actor.branchCode, entityType, entityId: id, actionCode: action, oldValue, newValue, ip: actor.ip },
      trx,
    );
  }

  private async commit(fn: (trx: CoreDb) => Promise<void>) {
    await this.db.transaction().execute(async (trx) => {
      await fn(trx);
      await this.permissions.bumpVersion(trx);
    });
    this.permissions.clearCache();
    this.fields.clearCache();
  }

  /** Người bị thay đổi không phải chính mình, và không giữ quyền quản trị mà người thao tác không có. */
  private async assertCanManage(actor: AuthUser, userId: number) {
    if (userId === actor.userId) throw Errors.selfElevation('Bạn không được tự thay đổi phạm vi, ngoại lệ hay chính sách cột của chính mình.');
    const u = await this.db.selectFrom('SysUser').select('Id').where('Id', '=', userId).executeTakeFirst();
    if (!u) throw Errors.notFound('Không tìm thấy người dùng.');
    await this.permissions.assertAdminCeiling(actor, await this.permissions.assignedToUser(userId), 'Tài khoản này có quyền quản trị mà bạn không có nên bạn không thay đổi được.');
  }

  // ---------- Danh mục ----------

  /**
   * Danh mục cho bộ sửa phạm vi: chiều, nút ĐVCS của cây tổ chức (chiều FACTORY), chuyền may (chiều LINE, phase 5.10): bộ phận tích
   * "Xưởng sản xuất" của mọi ĐVCS qua OrgService, kể cả đã ngừng để phạm vi cũ còn hiện tên; nhóm là bộ phận cha.
   */
  async catalog() {
    const dimensions = await this.db.selectFrom('SysScopeDimension').select(['Id', 'Code', 'Name', 'Description', 'OrgType']).where('IsActive', '=', true).orderBy('SortOrder').execute();
    const orgUnits = await this.db
      .selectFrom('SysOrgUnit')
      .select(['Id', 'Code', 'Name', 'OrgType', 'ParentId', 'BranchCode', 'Path', 'IsActive'])
      .where('OrgType', '=', 'FACTORY')
      .orderBy('BranchCode')
      .orderBy('SortOrder')
      .orderBy('Code')
      .execute();
    const lines = await this.org.lines('', true, { includeInactive: true });
    return {
      dimensions: dimensions.map((d) => ({ id: d.Id, code: d.Code, name: d.Name, description: d.Description, orgType: d.OrgType })),
      orgUnits: orgUnits.map((o) => ({ id: o.Id, code: o.Code, name: o.Name, orgType: o.OrgType, parentId: o.ParentId, branchCode: o.BranchCode, path: o.Path, isActive: !!o.IsActive })),
      lines: lines.map((l) => ({ code: l.code, name: l.name, branchCode: l.branchCode, isActive: l.isActive, workshopCode: l.workshopCode, workshopName: l.workshopName })),
    };
  }

  /** Tài nguyên có cột đăng ký, kèm danh sách cột (cho màn Chính sách cột và tab cột riêng của người dùng). */
  async resourceFields() {
    const rows = await this.db
      .selectFrom('SysResourceField as f')
      .innerJoin('SysResource as r', 'r.Id', 'f.ResourceId')
      .select(['r.Id as ResourceId', 'r.Code as ResourceCode', 'r.Name as ResourceName', 'r.SortOrder as ResourceSort', 'f.Code', 'f.Name', 'f.Description', 'f.IsSensitive', 'f.SortOrder'])
      .where('f.IsActive', '=', true)
      .where('r.IsActive', '=', true)
      .orderBy('r.SortOrder')
      .orderBy('f.SortOrder')
      .execute();
    const out: { id: number; code: string; name: string; fields: { code: string; name: string; description: string | null; isSensitive: boolean }[] }[] = [];
    for (const r of rows) {
      let res = out.find((x) => x.id === r.ResourceId);
      if (!res) out.push((res = { id: r.ResourceId, code: r.ResourceCode, name: r.ResourceName, fields: [] }));
      res.fields.push({ code: r.Code, name: r.Name, description: r.Description, isSensitive: !!r.IsSensitive });
    }
    return out;
  }

  // ---------- Một người dùng: phép gán + phạm vi, ngoại lệ, cột riêng ----------

  async userAccess(userId: number) {
    const user = await this.db.selectFrom('SysUser').select(['Id', 'Username', 'FullName']).where('Id', '=', userId).executeTakeFirst();
    if (!user) throw Errors.notFound('Không tìm thấy người dùng.');
    const assignments = await this.db
      .selectFrom('SysUserRole as ur')
      .innerJoin('SysRole as r', 'r.Id', 'ur.RoleId')
      .select(['ur.Id', 'ur.RoleId', 'r.Code', 'r.Name', 'r.IsActive', 'ur.ValidFromAt', 'ur.ValidToAt'])
      .where('ur.UserId', '=', userId)
      .orderBy('r.SortOrder')
      .execute();
    const scopes = assignments.length
      ? await this.db
          .selectFrom('SysUserRoleScope as s')
          .innerJoin('SysScopeDimension as d', 'd.Id', 's.DimensionId')
          .leftJoin('SysOrgUnit as o', 'o.Id', 's.OrgUnitId')
          .select(['s.Id', 's.UserRoleId', 'd.Code as Dimension', 's.ScopeMode', 's.OrgUnitId', 'o.Code as OrgUnitCode', 'o.Name as OrgUnitName', 's.ScopeValue'])
          .where('s.UserRoleId', 'in', assignments.map((a) => a.Id))
          .orderBy('s.Id')
          .execute()
      : [];
    const overrides = await this.db
      .selectFrom('SysUserPermissionOverride as o')
      .innerJoin('SysPermission as p', 'p.Id', 'o.PermissionId')
      .select(['o.Id', 'o.PermissionId', 'p.Code', 'p.Name', 'o.Effect', 'o.ValidFromAt', 'o.ValidToAt', 'o.Reason', 'o.CreatedAt'])
      .where('o.UserId', '=', userId)
      .orderBy('p.Code')
      .execute();
    const policies = await this.db
      .selectFrom('SysFieldPolicy as fp')
      .innerJoin('SysResource as r', 'r.Id', 'fp.ResourceId')
      .leftJoin('SysResourceField as f', (j) => j.onRef('f.ResourceId', '=', 'fp.ResourceId').onRef('f.Code', '=', 'fp.FieldCode'))
      .select(['fp.Id', 'fp.ResourceId', 'r.Code as ResourceCode', 'r.Name as ResourceName', 'fp.FieldCode', 'f.Name as FieldName', 'fp.AccessLevel', 'fp.ValidFromAt', 'fp.ValidToAt', 'fp.Reason'])
      .where('fp.SubjectType', '=', 'USER')
      .where('fp.SubjectId', '=', userId)
      .orderBy('r.SortOrder')
      .execute();
    // Phạm vi chuyền lưu theo mã: kèm tên chuyền và cờ "còn là chuyền đang dùng" để màn hình chỉ ra mã không còn tác dụng
    const lines = scopes.some((s) => s.Dimension === LINE_DIMENSION && s.ScopeValue) ? await this.org.lines('', true, { includeInactive: true }) : [];
    const lineOf = new Map(lines.map((l) => [l.code, l]));
    return {
      user: { id: user.Id, username: user.Username, fullName: user.FullName },
      assignments: assignments.map((a) => ({
        userRoleId: a.Id,
        roleId: a.RoleId,
        roleCode: a.Code,
        roleName: a.Name,
        roleActive: !!a.IsActive,
        validFromAt: a.ValidFromAt,
        validToAt: a.ValidToAt,
        scopes: scopes
          .filter((s) => s.UserRoleId === a.Id)
          .map((s) => {
            const line = s.Dimension === LINE_DIMENSION && s.ScopeValue ? lineOf.get(s.ScopeValue) : undefined;
            return {
              id: s.Id,
              dimension: s.Dimension,
              mode: s.ScopeMode,
              orgUnitId: s.OrgUnitId,
              orgUnitCode: s.OrgUnitCode,
              orgUnitName: s.OrgUnitName,
              value: s.ScopeValue,
              // Chiều chuyền: tên chuyền (kể cả đã ngừng) và còn là chuyền đang dùng không; chiều khác: null
              valueName: line?.name ?? null,
              valueActive: s.Dimension === LINE_DIMENSION && s.ScopeValue ? !!line?.isActive : null,
            };
          }),
      })),
      overrides: overrides.map((o) => ({
        id: o.Id,
        permissionId: o.PermissionId,
        permissionCode: o.Code,
        permissionName: o.Name,
        effect: o.Effect,
        validFromAt: o.ValidFromAt,
        validToAt: o.ValidToAt,
        reason: o.Reason,
        createdAt: o.CreatedAt,
      })),
      fieldPolicies: policies.map((p) => ({
        id: p.Id,
        resourceId: p.ResourceId,
        resourceCode: p.ResourceCode,
        resourceName: p.ResourceName,
        fieldCode: p.FieldCode,
        fieldName: p.FieldName ?? p.FieldCode,
        accessLevel: p.AccessLevel,
        validFromAt: p.ValidFromAt,
        validToAt: p.ValidToAt,
        reason: p.Reason,
      })),
    };
  }

  /** Thay toàn bộ phạm vi của một phép gán (người dùng × vai trò). Danh sách rỗng: không giới hạn thêm. */
  async setAssignmentScope(actor: AuthUser, userId: number, roleId: number, dto: AssignmentScopeDto) {
    await this.assertCanManage(actor, userId);
    const assignment = await this.db
      .selectFrom('SysUserRole as ur')
      .innerJoin('SysRole as r', 'r.Id', 'ur.RoleId')
      .select(['ur.Id', 'r.Code'])
      .where('ur.UserId', '=', userId)
      .where('ur.RoleId', '=', roleId)
      .executeTakeFirst();
    if (!assignment) throw Errors.notFound('Người dùng chưa được gán vai trò này.');

    const dims = await this.db.selectFrom('SysScopeDimension').select(['Id', 'Code', 'OrgType']).where('IsActive', '=', true).execute();
    const orgIds = [...new Set(dto.scopes.map((s) => s.orgUnitId).filter((x): x is number => typeof x === 'number'))];
    const orgs = orgIds.length ? await this.db.selectFrom('SysOrgUnit').select(['Id', 'Code', 'OrgType', 'Path', 'IsActive']).where('Id', 'in', orgIds).execute() : [];
    const before = await this.db
      .selectFrom('SysUserRoleScope as s')
      .innerJoin('SysScopeDimension as d', 'd.Id', 's.DimensionId')
      .leftJoin('SysOrgUnit as o', 'o.Id', 's.OrgUnitId')
      .select(['d.Code', 's.ScopeMode', 'o.Code as OrgCode', 's.ScopeValue'])
      .where('s.UserRoleId', '=', assignment.Id)
      .execute();
    // Chiều chuyền (phase 5.10): mã phải là chuyền đang dùng, đọc lại nguồn chuyền (tiến trình khác có thể vừa tích bộ phận).
    // Mã đã lưu ở phép gán này mà nay không còn là chuyền thì được giữ khi lưu lại: giữ không nới quyền (mã đó không có tác dụng),
    // còn bắt bỏ thì bộ sửa bỏ dòng cuối cùng của chiều là thành không giới hạn chuyền
    const lineValues = dto.scopes.some((s) => s.dimension === LINE_DIMENSION && s.mode === 'LIST');
    if (lineValues) this.org.invalidate();
    const activeLines = lineValues ? await this.org.activeLineCodes() : new Set<string>();
    const storedLines = new Set(before.filter((b) => b.Code === LINE_DIMENSION && b.ScopeMode === 'LIST' && !b.OrgCode && b.ScopeValue).map((b) => b.ScopeValue!));

    const rows: { DimensionId: number; ScopeMode: string; OrgUnitId: number | null; ScopeValue: string | null; label: string }[] = [];
    for (const s of dto.scopes) {
      const dim = dims.find((d) => d.Code === s.dimension);
      if (!dim) throw invalid(`Chiều phạm vi "${s.dimension}" không tồn tại hoặc đã tắt.`);
      const org = s.orgUnitId != null ? orgs.find((o) => o.Id === s.orgUnitId) : undefined;
      const value = s.value?.trim() || null;
      // Tổ hợp hợp lệ theo ADR 0005; chiều chuyền là chiều giá trị từ MES_Core/0009 (xét trước OrgType: database chưa chạy 0009 vẫn đúng luật mới)
      if (s.mode === 'ALL') {
        if (s.orgUnitId != null || value) throw invalid('Phạm vi "Tất cả" không kèm đơn vị hay giá trị.');
      } else if (dim.Code === LINE_DIMENSION) {
        if (s.mode !== 'LIST' || s.orgUnitId != null || !value) throw invalid('Chiều Chuyền chỉ nhận Tất cả hoặc Danh sách mã chuyền (không chọn theo cây tổ chức hay cả xưởng).');
        if (!activeLines.has(value) && !storedLines.has(value)) throw invalid(`Mã ${value} không phải chuyền may đang dùng (bộ phận tích "Xưởng sản xuất" ở Sơ đồ tổ chức).`);
      } else if (dim.OrgType) {
        if (s.mode !== 'ORG_SUBTREE' && s.mode !== 'LIST') throw invalid(`Chiều ${dim.Code} chỉ nhận Tất cả, Cả nhánh hoặc Danh sách đơn vị.`);
        if (!org || !org.IsActive) throw invalid(`Đơn vị tổ chức của chiều ${dim.Code} không tồn tại hoặc đã tắt.`);
        if (value) throw invalid('Phạm vi theo đơn vị tổ chức không kèm giá trị tự do.');
        if (s.mode === 'LIST' && org.OrgType !== dim.OrgType) throw invalid(`Đơn vị ${org.Code} không phải loại ${dim.OrgType} nên không dùng trong danh sách của chiều ${dim.Code}.`);
        if (s.mode === 'ORG_SUBTREE') {
          // Cả nhánh phải chứa ít nhất một đơn vị đúng loại của chiều, nếu không phạm vi lưu được mà không có tác dụng
          const hit = await this.db
            .selectFrom('SysOrgUnit')
            .select('Id')
            .where('OrgType', '=', dim.OrgType)
            .where('IsActive', '=', true)
            .where('Path', 'like', `${org.Path.replace(/[%_[]/g, (c) => `[${c}]`)}%`)
            .executeTakeFirst();
          if (!hit) throw invalid(`Nhánh ${org.Code} không có đơn vị loại ${dim.OrgType} nào nên không dùng được cho chiều ${dim.Code}.`);
        }
      } else if (dim.Code === 'OWNER') {
        if (s.mode !== 'OWN') throw invalid('Chiều Người tạo chỉ nhận Tất cả hoặc Chỉ của mình.');
        if (s.orgUnitId != null || value) throw invalid('Phạm vi "Chỉ của mình" không kèm đơn vị hay giá trị.');
      } else {
        if (s.mode !== 'LIST' || !value || s.orgUnitId != null) throw invalid(`Chiều ${dim.Code} chỉ nhận Tất cả hoặc Danh sách giá trị.`);
      }
      const row = { DimensionId: dim.Id, ScopeMode: s.mode, OrgUnitId: s.mode === 'ALL' || s.mode === 'OWN' ? null : (org?.Id ?? null), ScopeValue: value, label: `${dim.Code}:${s.mode}:${org?.Code ?? value ?? ''}` };
      if (!rows.some((r) => r.label === row.label)) rows.push(row);
    }
    for (const d of dims) {
      const forDim = rows.filter((r) => r.DimensionId === d.Id);
      if (forDim.some((r) => r.ScopeMode === 'ALL') && forDim.length > 1) throw invalid(`Chiều ${d.Code}: "Tất cả" không đi cùng giá trị khác.`);
    }

    await this.commit(async (trx) => {
      await trx.deleteFrom('SysUserRoleScope').where('UserRoleId', '=', assignment.Id).execute();
      if (rows.length) {
        await trx
          .insertInto('SysUserRoleScope')
          .values(rows.map(({ label: _label, ...r }) => ({ ...r, UserRoleId: assignment.Id, CreatedBy: actor.userId })) as any)
          .execute();
      }
      await this.logStrict(
        trx,
        actor,
        'SysUserRoleScope',
        userId,
        'USER_ROLE_SCOPE',
        { role: assignment.Code, scopes: before.map((b) => `${b.Code}:${b.ScopeMode}:${b.OrgCode ?? b.ScopeValue ?? ''}`) },
        { role: assignment.Code, scopes: rows.map((r) => r.label) },
      );
    });
  }

  async upsertOverride(actor: AuthUser, userId: number, dto: OverrideDto) {
    await this.assertCanManage(actor, userId);
    const perm = await this.db.selectFrom('SysPermission').select(['Id', 'Code']).where('Id', '=', dto.permissionId).where('IsActive', '=', true).executeTakeFirst();
    if (!perm) throw invalid('Quyền không tồn tại hoặc đã tắt.');
    // Trần quyền quản trị áp cả cho ngoại lệ: không Allow hay Deny quyền quản trị mà mình không có
    await this.permissions.assertAdminCeiling(actor, [perm.Code], 'Không đặt được ngoại lệ cho quyền quản trị mà bạn không có.');
    const range = validRange(dto.validFromAt, dto.validToAt);
    const reason = dto.reason.trim();
    const before = await this.db.selectFrom('SysUserPermissionOverride').selectAll().where('UserId', '=', userId).where('PermissionId', '=', perm.Id).executeTakeFirst();
    await this.commit(async (trx) => {
      if (before) {
        await trx.updateTable('SysUserPermissionOverride').set({ Effect: dto.effect, ...range, Reason: reason }).where('Id', '=', before.Id).execute();
      } else {
        await trx.insertInto('SysUserPermissionOverride').values({ UserId: userId, PermissionId: perm.Id, Effect: dto.effect, ...range, Reason: reason, CreatedBy: actor.userId } as any).execute();
      }
      await this.logStrict(
        trx,
        actor,
        'SysUserPermissionOverride',
        userId,
        before ? 'OVERRIDE_UPDATE' : 'OVERRIDE_CREATE',
        before && { permission: perm.Code, effect: before.Effect, validFromAt: before.ValidFromAt, validToAt: before.ValidToAt, reason: before.Reason },
        { permission: perm.Code, effect: dto.effect, ...range, reason },
      );
    });
  }

  async removeOverride(actor: AuthUser, userId: number, overrideId: number) {
    await this.assertCanManage(actor, userId);
    const row = await this.db
      .selectFrom('SysUserPermissionOverride as o')
      .innerJoin('SysPermission as p', 'p.Id', 'o.PermissionId')
      .select(['o.Id', 'p.Code', 'o.Effect', 'o.Reason'])
      .where('o.Id', '=', overrideId)
      .where('o.UserId', '=', userId)
      .executeTakeFirst();
    if (!row) throw Errors.notFound('Không tìm thấy ngoại lệ.');
    await this.permissions.assertAdminCeiling(actor, [row.Code], 'Không gỡ được ngoại lệ của quyền quản trị mà bạn không có.');
    await this.commit(async (trx) => {
      await trx.deleteFrom('SysUserPermissionOverride').where('Id', '=', row.Id).execute();
      await this.logStrict(trx, actor, 'SysUserPermissionOverride', userId, 'OVERRIDE_DELETE', { permission: row.Code, effect: row.Effect, reason: row.Reason });
    });
  }

  async upsertUserFieldPolicy(actor: AuthUser, userId: number, dto: UserFieldPolicyDto) {
    await this.assertCanManage(actor, userId);
    const field = await this.db
      .selectFrom('SysResourceField as f')
      .innerJoin('SysResource as r', 'r.Id', 'f.ResourceId')
      .select(['f.Code', 'r.Code as ResourceCode'])
      .where('f.ResourceId', '=', dto.resourceId)
      .where('f.Code', '=', dto.fieldCode)
      .where('f.IsActive', '=', true)
      .executeTakeFirst();
    if (!field) throw invalid('Cột không tồn tại trong danh bạ tài nguyên.');
    const range = validRange(dto.validFromAt, dto.validToAt);
    const reason = dto.reason.trim();
    const before = await this.db
      .selectFrom('SysFieldPolicy')
      .selectAll()
      .where('SubjectType', '=', 'USER')
      .where('SubjectId', '=', userId)
      .where('ResourceId', '=', dto.resourceId)
      .where('FieldCode', '=', field.Code)
      .executeTakeFirst();
    await this.commit(async (trx) => {
      if (before) {
        await trx.updateTable('SysFieldPolicy').set({ AccessLevel: dto.accessLevel, ...range, Reason: reason }).where('Id', '=', before.Id).execute();
      } else {
        await trx
          .insertInto('SysFieldPolicy')
          .values({ SubjectType: 'USER', SubjectId: userId, ResourceId: dto.resourceId, FieldCode: field.Code, AccessLevel: dto.accessLevel, ...range, Reason: reason, CreatedBy: actor.userId } as any)
          .execute();
      }
      await this.logStrict(
        trx,
        actor,
        'SysFieldPolicy',
        userId,
        before ? 'USER_FIELD_POLICY_UPDATE' : 'USER_FIELD_POLICY_CREATE',
        before && { field: `${field.ResourceCode}.${field.Code}`, level: before.AccessLevel, validToAt: before.ValidToAt, reason: before.Reason },
        { field: `${field.ResourceCode}.${field.Code}`, level: dto.accessLevel, ...range, reason },
      );
    });
  }

  async removeUserFieldPolicy(actor: AuthUser, userId: number, policyId: number) {
    await this.assertCanManage(actor, userId);
    const row = await this.db
      .selectFrom('SysFieldPolicy')
      .select(['Id', 'ResourceId', 'FieldCode', 'AccessLevel', 'Reason'])
      .where('Id', '=', policyId)
      .where('SubjectType', '=', 'USER')
      .where('SubjectId', '=', userId)
      .executeTakeFirst();
    if (!row) throw Errors.notFound('Không tìm thấy chính sách cột.');
    await this.commit(async (trx) => {
      await trx.deleteFrom('SysFieldPolicy').where('Id', '=', row.Id).execute();
      await this.logStrict(trx, actor, 'SysFieldPolicy', userId, 'USER_FIELD_POLICY_DELETE', { resourceId: row.ResourceId, field: row.FieldCode, level: row.AccessLevel, reason: row.Reason });
    });
  }

  // ---------- Chính sách cột theo vai trò ----------

  async fieldPolicyMatrix(resourceId: number) {
    const resource = await this.db.selectFrom('SysResource').select(['Id', 'Code', 'Name']).where('Id', '=', resourceId).executeTakeFirst();
    if (!resource) throw Errors.notFound('Không tìm thấy tài nguyên.');
    const fields = await this.db
      .selectFrom('SysResourceField')
      .select(['Code', 'Name', 'Description', 'IsSensitive'])
      .where('ResourceId', '=', resourceId)
      .where('IsActive', '=', true)
      .orderBy('SortOrder')
      .execute();
    const roles = await this.db.selectFrom('SysRole').select(['Id', 'Code', 'Name']).where('IsActive', '=', true).orderBy('SortOrder').execute();
    const policies = await this.db
      .selectFrom('SysFieldPolicy')
      .select(['SubjectId', 'FieldCode', 'AccessLevel'])
      .where('SubjectType', '=', 'ROLE')
      .where('ResourceId', '=', resourceId)
      .execute();
    return {
      resource: { id: resource.Id, code: resource.Code, name: resource.Name },
      fields: fields.map((f) => ({ code: f.Code, name: f.Name, description: f.Description, isSensitive: !!f.IsSensitive })),
      roles: roles.map((r) => ({ id: r.Id, code: r.Code, name: r.Name })),
      policies: policies.map((p) => ({ roleId: p.SubjectId, fieldCode: p.FieldCode, accessLevel: p.AccessLevel })),
    };
  }

  /** Đặt chính sách cột của một vai trò trên một tài nguyên. Không sửa được vai trò mình đang giữ. */
  async setRoleFieldPolicies(actor: AuthUser, roleId: number, dto: RoleFieldPoliciesDto) {
    const role = await this.db.selectFrom('SysRole').select(['Id', 'Code']).where('Id', '=', roleId).executeTakeFirst();
    if (!role) throw Errors.notFound('Không tìm thấy vai trò.');
    const own = await this.db.selectFrom('SysUserRole').select('Id').where('UserId', '=', actor.userId).where('RoleId', '=', roleId).executeTakeFirst();
    if (own) throw Errors.selfElevation('Bạn đang giữ vai trò này nên không được tự sửa chính sách cột của nó.');
    const dup = dto.policies.map((p) => p.fieldCode).find((c, i, all) => all.indexOf(c) !== i);
    if (dup) throw invalid(`Cột ${dup} bị lặp.`);
    const fields = await this.db.selectFrom('SysResourceField').select('Code').where('ResourceId', '=', dto.resourceId).where('IsActive', '=', true).execute();
    const known = new Set(fields.map((f) => f.Code));
    const unknown = dto.policies.filter((p) => !known.has(p.fieldCode)).map((p) => p.fieldCode);
    if (unknown.length) throw invalid(`Cột không có trong danh bạ tài nguyên: ${unknown.join(', ')}.`);

    const current = await this.db
      .selectFrom('SysFieldPolicy')
      .select(['Id', 'FieldCode', 'AccessLevel'])
      .where('SubjectType', '=', 'ROLE')
      .where('SubjectId', '=', roleId)
      .where('ResourceId', '=', dto.resourceId)
      .execute();
    const changes = dto.policies.filter((p) => (current.find((c) => c.FieldCode === p.fieldCode)?.AccessLevel ?? null) !== (p.accessLevel ?? null));
    if (changes.length === 0) return { changed: 0 };

    await this.commit(async (trx) => {
      for (const p of changes) {
        const cur = current.find((c) => c.FieldCode === p.fieldCode);
        if (cur && !p.accessLevel) await trx.deleteFrom('SysFieldPolicy').where('Id', '=', cur.Id).execute();
        else if (cur) await trx.updateTable('SysFieldPolicy').set({ AccessLevel: p.accessLevel! }).where('Id', '=', cur.Id).execute();
        else await trx.insertInto('SysFieldPolicy').values({ SubjectType: 'ROLE', SubjectId: roleId, ResourceId: dto.resourceId, FieldCode: p.fieldCode, AccessLevel: p.accessLevel!, CreatedBy: actor.userId } as any).execute();
      }
      await this.logStrict(
        trx,
        actor,
        'SysFieldPolicy',
        roleId,
        'ROLE_FIELD_POLICY',
        { role: role.Code, resourceId: dto.resourceId, fields: Object.fromEntries(changes.map((c) => [c.fieldCode, current.find((x) => x.FieldCode === c.fieldCode)?.AccessLevel ?? null])) },
        { role: role.Code, resourceId: dto.resourceId, fields: Object.fromEntries(changes.map((c) => [c.fieldCode, c.accessLevel ?? null])) },
      );
    });
    return { changed: changes.length };
  }

  // ---------- Xem thử quyền thực tế ----------

  /** Một người thấy gì ở một nhà máy: quyền, phạm vi theo từng màn hình, mức của từng cột. Để quản trị kiểm tra cấu hình. */
  async effective(userId: number, branchCode: string) {
    const user = await this.db.selectFrom('SysUser').select(['Id', 'FullName', 'IsActive']).where('Id', '=', userId).executeTakeFirst();
    if (!user) throw Errors.notFound('Không tìm thấy người dùng.');
    const branch = await this.branches.findActiveByCode(branchCode);
    if (!branch) throw Errors.notFound('Không tìm thấy nhà máy.');
    const allowed = await this.branches.isAllowed(userId, branchCode);
    const access = await this.permissions.getAccess(userId, branch);
    const roles = access.roleIds.length ? await this.db.selectFrom('SysRole').select(['Code', 'Name']).where('Id', 'in', access.roleIds).orderBy('SortOrder').execute() : [];
    const resources = await this.db.selectFrom('SysResource').select(['Code', 'Name']).where('IsActive', '=', true).orderBy('SortOrder').execute();

    const dimName: Record<string, string> = { FACTORY: 'Nhà máy', LINE: 'Chuyền', OWNER: 'Người tạo' };
    const describe = (c: Condition) => {
      const name = dimName[c.dim] ?? c.dim;
      return c.kind === 'own' ? 'Chỉ bản ghi do mình tạo' : c.kind === 'in' ? `${name}: ${c.values.join(', ')}` : `${name}: không có dữ liệu`;
    };
    const screens = [];
    for (const r of resources) {
      const actions = ['view', 'create', 'update', 'delete', 'export'].filter((a) => access.permissions.has(`${r.Code}:${a}`));
      if (actions.length === 0) continue;
      const info = await this.registry.info(r.Code);
      const bound = (g: { conditions: Condition[] }) => g.conditions.filter((c) => info?.bindings.has(c.dim));
      const grants = access.grants.get(`${r.Code}:view`) ?? access.grants.get(`${r.Code}:${actions[0]}`) ?? [];
      const sets = grants.map(bound);
      screens.push({
        code: r.Code,
        name: r.Name,
        actions,
        scope: sets.length === 0 || sets.some((s) => s.length === 0) ? [] : sets.map((s) => s.map(describe).join(' và ')),
      });
    }
    const fieldLevels: Record<string, Record<string, string>> = {};
    for (const [code, entry] of await this.fields.all(access)) {
      if (access.permissions.has(`${code}:view`)) fieldLevels[code] = Object.fromEntries(entry.levels);
    }
    return {
      user: { id: user.Id, fullName: user.FullName, isActive: !!user.IsActive },
      branch: { code: branch.code, name: branch.name, isAggregate: branch.isAggregate, allowed: !!allowed },
      roles: roles.map((r) => ({ code: r.Code, name: r.Name })),
      screens,
      fieldLevels,
    };
  }
}
