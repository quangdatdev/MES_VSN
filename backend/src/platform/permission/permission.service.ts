import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';
import { Errors } from '../../common/app.exception';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { CORE_DB, type CoreDb } from '../database/database.module';
import type { OrgType, ScopeMode } from '../database/core.types';
import { OrgService } from '../org/org.service';

/** Quyền nhóm quản trị: chỉ người đang có quyền đó mới cấp hoặc quản lý người có quyền đó (xem quyết định 4.2). */
const ADMIN_PREFIX = 'admin.';

/**
 * Chiều Chuyền (phase 5.10, MES_Core/0009): chiều giá trị, ScopeValue là mã bộ phận tích "Xưởng sản xuất" (MES_Hr), không theo
 * cây tổ chức. Chỉ dạng ALL hoặc LIST theo giá trị hợp lệ; mã nào không còn là chuyền đang dùng thì không có tác dụng.
 */
export const LINE_DIMENSION = 'LINE';

/** Trạng thái của một bộ phận xét theo tập chuyền may: có tích "Xưởng sản xuất", thuộc ĐVCS nào, còn dùng không */
export interface LineState {
  isProductionWorkshop: boolean;
  branchCode: string | null;
  isActive: boolean;
}

/** Một lần đổi tập chuyền may (thêm, tích, bỏ tích, đổi ĐVCS, giải thể, khôi phục bộ phận tích "Xưởng sản xuất") */
export interface LineSetChange {
  departmentId: number;
  code: string;
  operation: 'CREATE' | 'TICK' | 'UNTICK' | 'BRANCH' | 'DISSOLVE' | 'RESTORE';
  /** null khi thêm mới */
  before: LineState | null;
  after: LineState;
}

/** Người đang có phép gán mang phạm vi chuyền theo một mã: chỉ tên đăng nhập, họ tên */
export interface LineScopeHolder {
  username: string;
  fullName: string;
}

/** Mã nhật ký của một lần đổi tập chuyền may (SysAuditLog.ActionCode) */
export const LINE_SET_CHANGE = 'LINE_SET_CHANGE';
const LINE_CHANGE_ATTEMPTS = 3;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Một điều kiện của phạm vi trên một chiều. `none` là đóng an toàn: không khớp bản ghi nào. */
export type Condition =
  | { dim: string; kind: 'in'; values: string[] }
  | { dim: string; kind: 'own' }
  | { dim: string; kind: 'none' };

/** Phạm vi của một phép gán: các điều kiện kết hợp AND. Không có điều kiện = không giới hạn (ngoài nhà máy của phiên). */
export interface Grant {
  conditions: Condition[];
}

export interface BranchRef {
  code: string;
  isAggregate: boolean;
}

/** Quyền của một người tại nhà máy của phiên. Mỗi quyền kèm danh sách phạm vi (OR) để BaseRepository sinh điều kiện. */
export interface UserAccess {
  userId: number;
  branchCode: string;
  isAggregate: boolean;
  active: boolean;
  permissions: Set<string>;
  grants: Map<string, Grant[]>;
  /** Vai trò đang có hiệu lực ở nhà máy này (chính sách cột lấy theo các vai trò này). */
  roleIds: number[];
  /** Quyền của từng vai trò đang hiệu lực: chính sách cột chỉ tính vai trò có quyền xem tài nguyên. */
  rolePermissions: Map<number, Set<string>>;
  /**
   * Mã nhà máy SX (đang dùng) thuộc ĐVCS của phiên theo danh mục Nhà máy SX (quyết định 6.3); đơn vị tổng hợp: mọi nhà máy
   * đã gắn ĐVCS. BaseRepository lọc theo danh sách này khi bên gọi yêu cầu (popup chọn mã hàng lúc lập kế hoạch xuất hàng).
   */
  productionFactories: string[];
  version: string;
  /** Mốc (ms) gần nhất một phép gán hay ngoại lệ bắt đầu hoặc hết hiệu lực; qua mốc thì tính lại. */
  expiresAt: number | null;
}

interface OrgUnit {
  id: number;
  code: string;
  orgType: OrgType;
  path: string;
  active: boolean;
}

interface ScopeRow {
  userRoleId: number;
  dimCode: string;
  dimOrgType: OrgType | null;
  dimActive: boolean;
  mode: ScopeMode;
  orgUnitId: number | null;
  value: string | null;
}

const isValidNow = (from: Date | null, to: Date | null, now: number) =>
  (!from || from.getTime() <= now) && (!to || to.getTime() >= now);

/** Mốc kế tiếp làm thay đổi kết quả: lúc bắt đầu hiệu lực, hoặc ngay sau lúc hết hiệu lực. */
function nextBoundary(from: Date | null, to: Date | null, now: number): number | null {
  const marks = [from?.getTime(), to ? to.getTime() + 1 : undefined].filter((t): t is number => t !== undefined && t > now);
  return marks.length ? Math.min(...marks) : null;
}

const minOf = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));

/**
 * Dấu phiên bản quyền gửi cho giao diện (header X-Permission-Version): đổi khi quản trị đổi quyền (version)
 * và khi một phép gán hay ngoại lệ tới giờ bắt đầu hoặc hết hạn (mốc hết hạn), để giao diện tải lại menu.
 */
export const accessStamp = (a: Pick<UserAccess, 'version' | 'expiresAt'>) => (a.expiresAt ? `${a.version}.${a.expiresAt}` : a.version);

/**
 * L2 + L3 + L5 (quyết định 3.5, 3.6): quyền của user tại nhà máy của phiên.
 *  1. Deny theo người còn hiệu lực ⇒ mất quyền.
 *  2. Allow theo người còn hiệu lực ⇒ có quyền, phạm vi = hợp phạm vi mọi phép gán đang hiệu lực ở nhà máy này.
 *  3. Hợp quyền của các phép gán Role đang hiệu lực, phạm vi tính theo từng phép gán.
 *  4. Còn lại: từ chối.
 * Cache theo (user, nhà máy), mất hiệu lực khi SysPermissionVersion đổi hoặc qua mốc ValidFromAt/ValidToAt gần nhất.
 */
@Injectable()
export class PermissionService {
  private cache = new Map<string, UserAccess>();
  /** Phiên bản quyền lúc tập chuyền được tải lại lần cuối (xem lineCodes). */
  private linesVersion: string | null = null;
  private readonly logger = new Logger('Permission');

  constructor(
    @Inject(CORE_DB) private readonly db: CoreDb,
    private readonly org: OrgService,
    private readonly audit: AuditService,
  ) {}

  async getVersion(): Promise<string> {
    const row = await this.db.selectFrom('SysPermissionVersion').select('Version').where('Id', '=', 1).executeTakeFirstOrThrow();
    return String(row.Version);
  }

  /** Truyền transaction để version tăng cùng lúc với thay đổi quyền; sau khi commit gọi clearCache(). */
  async bumpVersion(executor: CoreDb = this.db): Promise<void> {
    await sql`UPDATE dbo.SysPermissionVersion SET Version = Version + 1, ModifiedAt = SYSUTCDATETIME() WHERE Id = 1`.execute(executor);
    this.cache.clear();
  }

  clearCache(): void {
    this.cache.clear();
  }

  /** Quyền của người đang thao tác: dùng kết quả AuthGuard đã tính cho request, không thì tính lại. */
  async accessOf(user: AuthUser): Promise<UserAccess> {
    if (user.access) return user.access;
    if (user.tokenType !== 'access' || !user.branchCode) throw Errors.unauthenticated();
    return this.getAccess(user.userId, { code: user.branchCode, isAggregate: user.isAggregate });
  }

  async getAccess(userId: number, branch: BranchRef, version?: string): Promise<UserAccess> {
    const v = version ?? (await this.getVersion());
    const key = `${userId}:${branch.code}`;
    const hit = this.cache.get(key);
    if (hit && hit.version === v && hit.isAggregate === branch.isAggregate && (hit.expiresAt === null || Date.now() < hit.expiresAt)) {
      return hit;
    }
    const access = await this.compute(userId, branch, v);
    this.cache.set(key, access);
    return access;
  }

  private async compute(userId: number, branch: BranchRef, version: string): Promise<UserAccess> {
    const now = Date.now();
    const empty: UserAccess = {
      userId,
      branchCode: branch.code,
      isAggregate: branch.isAggregate,
      active: false,
      permissions: new Set(),
      grants: new Map(),
      roleIds: [],
      rolePermissions: new Map(),
      productionFactories: [],
      version,
      expiresAt: null,
    };
    const user = await this.db.selectFrom('SysUser').select('IsActive').where('Id', '=', userId).executeTakeFirst();
    if (!user?.IsActive) return empty;

    let expiresAt: number | null = null;

    const assignments = await this.db
      .selectFrom('SysUserRole as ur')
      .innerJoin('SysRole as r', 'r.Id', 'ur.RoleId')
      .select(['ur.Id', 'ur.RoleId', 'ur.ValidFromAt', 'ur.ValidToAt'])
      .where('ur.UserId', '=', userId)
      .where('r.IsActive', '=', true)
      .execute();
    for (const a of assignments) expiresAt = minOf(expiresAt, nextBoundary(a.ValidFromAt, a.ValidToAt, now));
    const live = assignments.filter((a) => isValidNow(a.ValidFromAt, a.ValidToAt, now));

    const scopes = await this.loadScopes(live.map((a) => a.Id));
    const orgUnits = scopes.some((s) => s.orgUnitId !== null) ? await this.loadOrgUnits() : new Map<number, OrgUnit>();
    const lineCodes = scopes.some((s) => s.dimCode === LINE_DIMENSION && s.mode === 'LIST') ? await this.lineCodes(version) : new Set<string>();

    // Phép gán nào có hiệu lực ở nhà máy này, và phạm vi của nó
    const effective: { roleId: number; grant: Grant }[] = [];
    for (const a of live) {
      const grant = this.grantOf(scopes.filter((s) => s.userRoleId === a.Id), orgUnits, lineCodes, branch);
      if (grant) effective.push({ roleId: a.RoleId, grant });
    }

    const roleIds = [...new Set(effective.map((e) => e.roleId))];
    const rolePerms = roleIds.length
      ? await this.db
          .selectFrom('SysRolePermission as rp')
          .innerJoin('SysPermission as p', 'p.Id', 'rp.PermissionId')
          .innerJoin('SysResource as res', 'res.Id', 'p.ResourceId')
          .select(['rp.RoleId', 'p.Code'])
          .where('rp.RoleId', 'in', roleIds)
          .where('p.IsActive', '=', true)
          .where('res.IsActive', '=', true)
          .execute()
      : [];

    const grants = new Map<string, Grant[]>();
    for (const e of effective) {
      for (const p of rolePerms.filter((x) => x.RoleId === e.roleId)) {
        const list = grants.get(p.Code) ?? [];
        if (!list.includes(e.grant)) list.push(e.grant);
        grants.set(p.Code, list);
      }
    }

    const overrides = await this.db
      .selectFrom('SysUserPermissionOverride as o')
      .innerJoin('SysPermission as p', 'p.Id', 'o.PermissionId')
      .innerJoin('SysResource as res', 'res.Id', 'p.ResourceId')
      .select(['p.Code', 'o.Effect', 'o.ValidFromAt', 'o.ValidToAt'])
      .where('o.UserId', '=', userId)
      .where('p.IsActive', '=', true)
      .where('res.IsActive', '=', true)
      .execute();
    for (const o of overrides) expiresAt = minOf(expiresAt, nextBoundary(o.ValidFromAt, o.ValidToAt, now));
    const liveOverrides = overrides.filter((o) => isValidNow(o.ValidFromAt, o.ValidToAt, now));

    // Allow: phạm vi là hợp mọi phép gán đang hiệu lực ở nhà máy này; không có phép gán thì chỉ nhà máy của phiên
    // (ở A00 không có "nhà máy của phiên" nên đóng an toàn).
    const allowScope: Grant[] = effective.length
      ? [...new Set(effective.map((e) => e.grant))]
      : [{ conditions: branch.isAggregate ? [{ dim: 'FACTORY', kind: 'none' }] : [] }];
    for (const o of liveOverrides.filter((x) => x.Effect === 'ALLOW')) grants.set(o.Code, allowScope);
    // Deny thắng mọi thứ, xét sau cùng
    for (const o of liveOverrides.filter((x) => x.Effect === 'DENY')) grants.delete(o.Code);
    // Không có quyền xem thì mất mọi hành động khác của tài nguyên: chặn xem là chặn hẳn,
    // không còn đường đọc qua xuất file hay qua dữ liệu trả về khi sửa (review 5.1 #1)
    for (const code of [...grants.keys()]) {
      const resource = code.slice(0, code.lastIndexOf(':'));
      if (!code.endsWith(':view') && !grants.has(`${resource}:view`)) grants.delete(code);
    }

    const rolePermissions = new Map<number, Set<string>>();
    for (const p of rolePerms) rolePermissions.set(p.RoleId, (rolePermissions.get(p.RoleId) ?? new Set()).add(p.Code));

    // Danh mục đổi ĐVCS của nhà máy, bật, tắt nhà máy thì tăng phiên bản quyền (CatalogService)
    const factoryQuery = this.db.selectFrom('SysProductionFactory').select('Code').where('IsActive', '=', true);
    const factories = await (branch.isAggregate ? factoryQuery.where('BranchCode', 'is not', null) : factoryQuery.where('BranchCode', '=', branch.code))
      .orderBy('Code')
      .execute();

    return {
      ...empty,
      active: true,
      permissions: new Set(grants.keys()),
      grants,
      roleIds,
      rolePermissions,
      productionFactories: factories.map((f) => f.Code),
      expiresAt,
    };
  }

  /**
   * Phạm vi của một phép gán tại nhà máy của phiên; null nếu phép gán không có hiệu lực ở nhà máy này.
   * Tổ hợp ngoài danh sách hợp lệ, đơn vị tổ chức hay chiều đã tắt: coi là tập rỗng, không bao giờ là "không giới hạn".
   */
  private grantOf(rows: ScopeRow[], orgUnits: Map<number, OrgUnit>, lineCodes: Set<string>, branch: BranchRef): Grant | null {
    const conditions: Condition[] = [];
    const byDim = new Map<string, ScopeRow[]>();
    for (const r of rows) byDim.set(r.dimCode, [...(byDim.get(r.dimCode) ?? []), r]);

    for (const [dim, list] of byDim) {
      const first = list[0];
      if (!first.dimActive) {
        if (dim === 'FACTORY' && !branch.isAggregate) return null;
        conditions.push({ dim, kind: 'none' });
        continue;
      }
      if (list.some((r) => r.mode === 'ALL')) continue;

      if (dim === LINE_DIMENSION) {
        // Chỉ dòng LIST theo giá trị có tác dụng, và chỉ khi mã đang là chuyền đang dùng. Dòng kiểu cũ (theo nút, cả nhánh) hay
        // database chưa chạy MES_Core/0009 thì không góp mã nào: không còn mã nào là tập rỗng, không bao giờ thành "không giới hạn"
        const codes = new Set(list.filter((r) => r.mode === 'LIST' && r.orgUnitId === null && r.value && lineCodes.has(r.value)).map((r) => r.value!));
        conditions.push(codes.size ? { dim, kind: 'in', values: [...codes].sort() } : { dim, kind: 'none' });
        continue;
      }

      if (first.dimOrgType) {
        const codes = new Set<string>();
        for (const r of list) {
          const unit = r.orgUnitId !== null ? orgUnits.get(r.orgUnitId) : undefined;
          if (!unit?.active) continue;
          if (r.mode === 'LIST' && r.value === null && unit.orgType === first.dimOrgType) codes.add(unit.code);
          if (r.mode === 'ORG_SUBTREE') {
            for (const u of orgUnits.values()) {
              if (u.active && u.orgType === first.dimOrgType && u.path.startsWith(unit.path)) codes.add(u.code);
            }
          }
        }
        if (dim === 'FACTORY') {
          // Ở nhà máy cụ thể: phép gán chỉ có hiệu lực khi nhà máy nằm trong phạm vi. Ở A00: chỉ đọc các nhà máy trong phạm vi.
          if (!branch.isAggregate) {
            if (!codes.has(branch.code)) return null;
            continue;
          }
        }
        conditions.push(codes.size ? { dim, kind: 'in', values: [...codes].sort() } : { dim, kind: 'none' });
        continue;
      }

      if (dim === 'OWNER') {
        conditions.push(list.every((r) => r.mode === 'OWN') ? { dim, kind: 'own' } : { dim, kind: 'none' });
        continue;
      }
      const values = list.filter((r) => r.mode === 'LIST' && r.orgUnitId === null && r.value).map((r) => r.value!);
      conditions.push(values.length === list.length ? { dim, kind: 'in', values: [...new Set(values)].sort() } : { dim, kind: 'none' });
    }
    return { conditions };
  }

  private async loadScopes(userRoleIds: number[]): Promise<ScopeRow[]> {
    if (userRoleIds.length === 0) return [];
    const rows = await this.db
      .selectFrom('SysUserRoleScope as s')
      .innerJoin('SysScopeDimension as d', 'd.Id', 's.DimensionId')
      .select(['s.UserRoleId', 'd.Code', 'd.OrgType', 'd.IsActive', 's.ScopeMode', 's.OrgUnitId', 's.ScopeValue'])
      .where('s.UserRoleId', 'in', userRoleIds)
      .execute();
    return rows.map((r) => ({
      userRoleId: r.UserRoleId,
      dimCode: r.Code,
      dimOrgType: r.OrgType,
      dimActive: !!r.IsActive,
      mode: r.ScopeMode,
      orgUnitId: r.OrgUnitId,
      value: r.ScopeValue,
    }));
  }

  /**
   * Mã chuyền đang dùng (bộ phận tích "Xưởng sản xuất", OrgService). Nơi đổi tập chuyền tăng phiên bản quyền sau khi commit MES_Hr;
   * OrgService cache 30 giây theo từng tiến trình nên thấy phiên bản mới là tải lại tập chuyền trước khi tính quyền: UserAccess
   * cache theo phiên bản không giữ tập chuyền cũ hơn phiên bản của nó (kể cả khi tiến trình khác đổi chuyền). Lần đọc chuyền bắt
   * đầu trước invalidate() không được ghi đè cache (OrgService đếm lượt invalidate, phase 5.10 luồng B1).
   */
  private async lineCodes(version: string): Promise<Set<string>> {
    if (this.linesVersion !== version) {
      this.org.invalidate();
      this.linesVersion = version;
    }
    return this.org.activeLineCodes();
  }

  private async loadOrgUnits(): Promise<Map<number, OrgUnit>> {
    const rows = await this.db.selectFrom('SysOrgUnit').select(['Id', 'Code', 'OrgType', 'Path', 'IsActive']).execute();
    return new Map(rows.map((r) => [r.Id, { id: r.Id, code: r.Code, orgType: r.OrgType, path: r.Path, active: !!r.IsActive }]));
  }

  /**
   * Mọi quyền gắn với user qua vai trò hoặc Allow theo người, kể cả vai trò đang tắt hay user đang bị vô hiệu:
   * tài khoản tạm tắt nhưng có quyền cao vẫn được coi là có quyền cao khi xét ai được quản lý nó.
   */
  async assignedToUser(userId: number): Promise<string[]> {
    const viaRole = await this.db
      .selectFrom('SysUserRole as ur')
      .innerJoin('SysRolePermission as rp', 'rp.RoleId', 'ur.RoleId')
      .innerJoin('SysPermission as p', 'p.Id', 'rp.PermissionId')
      .select('p.Code')
      .distinct()
      .where('ur.UserId', '=', userId)
      .execute();
    const viaAllow = await this.db
      .selectFrom('SysUserPermissionOverride as o')
      .innerJoin('SysPermission as p', 'p.Id', 'o.PermissionId')
      .select('p.Code')
      .where('o.UserId', '=', userId)
      .where('o.Effect', '=', 'ALLOW')
      .execute();
    return [...new Set([...viaRole, ...viaAllow].map((r) => r.Code))];
  }

  async assignedToRoles(roleIds: number[]): Promise<string[]> {
    if (roleIds.length === 0) return [];
    const rows = await this.db
      .selectFrom('SysRolePermission as rp')
      .innerJoin('SysPermission as p', 'p.Id', 'rp.PermissionId')
      .select('p.Code')
      .distinct()
      .where('rp.RoleId', 'in', roleIds)
      .execute();
    return rows.map((r) => r.Code);
  }

  /**
   * Người dùng có phép gán nào mang phạm vi chuyền (chiều LINE) theo đúng mã này không, kể cả phép gán đã hết hạn hay chưa tới
   * hạn: tích, bỏ tích, giải thể bộ phận chuyền đó là đổi phạm vi của chính họ (CLAUDE.md mục 4.8), như người được giao cả xưởng
   * không tự chuyển chuyền trước phase 5.10.
   */
  async holdsLineScope(userId: number, code: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('SysUserRoleScope as s')
      .innerJoin('SysUserRole as ur', 'ur.Id', 's.UserRoleId')
      .innerJoin('SysScopeDimension as d', 'd.Id', 's.DimensionId')
      .select('s.Id')
      .where('ur.UserId', '=', userId)
      .where('d.Code', '=', LINE_DIMENSION)
      .where('s.ScopeValue', '=', code)
      .executeTakeFirst();
    return !!row;
  }

  /**
   * Người đang có phép gán mang phạm vi chuyền theo đúng mã này: tài khoản đang hoạt động, vai trò đang dùng, phép gán chưa hết hạn
   * (kể cả chưa tới hạn). Phạm vi của họ đang "ngủ" khi mã chưa là chuyền đang dùng: thêm, tích, khôi phục bộ phận mã đó làm họ thấy
   * dữ liệu chuyền đó; bỏ tích, giải thể làm họ mất. Màn hình báo trước danh sách này, nhật ký LINE_SET_CHANGE ghi lại.
   */
  async lineScopeHolders(code: string, db: CoreDb = this.db): Promise<LineScopeHolder[]> {
    const rows = await db
      .selectFrom('SysUserRoleScope as s')
      .innerJoin('SysUserRole as ur', 'ur.Id', 's.UserRoleId')
      .innerJoin('SysUser as u', 'u.Id', 'ur.UserId')
      .innerJoin('SysRole as r', 'r.Id', 'ur.RoleId')
      .innerJoin('SysScopeDimension as d', 'd.Id', 's.DimensionId')
      .select(['u.Username', 'u.FullName'])
      .distinct()
      .where('d.Code', '=', LINE_DIMENSION)
      .where('s.ScopeMode', '=', 'LIST')
      .where('s.ScopeValue', '=', code)
      .where('u.IsActive', '=', true)
      .where('r.IsActive', '=', true)
      .where((eb) => eb.or([eb('ur.ValidToAt', 'is', null), eb('ur.ValidToAt', '>=', new Date())]))
      .orderBy('u.Username')
      .execute();
    return rows.map((r) => ({ username: r.Username, fullName: r.FullName }));
  }

  /**
   * Ghi một lần đổi tập chuyền may sau khi bộ phận đã lưu ở MES_Hr: một transaction MES_Core gồm nhật ký bắt buộc LINE_SET_CHANGE
   * (cờ, ĐVCS, trạng thái trước và sau, người đang được giao phạm vi chuyền đó) và tăng phiên bản quyền (mục 4.4). MES_Hr và
   * MES_Core không có transaction chung nên bước này chạy sau commit của MES_Hr; lỗi thì thử lại. Vẫn lỗi thì ghi log đủ dữ liệu
   * để dựng lại nhật ký, xóa cache quyền của tiến trình này (tiến trình này tính lại theo tập chuyền mới) và báo lỗi cho người
   * dùng: không im lặng. `details` đi kèm lỗi (ví dụ bộ phận đã lưu, để màn hình hiện đúng dữ liệu).
   */
  async recordLineSetChange(actor: AuthUser, change: LineSetChange, details: unknown = null): Promise<void> {
    const state = (s: LineState | null) => (s ? { Code: change.code, IsProductionWorkshop: s.isProductionWorkshop, BranchCode: s.branchCode, IsActive: s.isActive } : undefined);
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= LINE_CHANGE_ATTEMPTS; attempt++) {
      try {
        await this.db.transaction().execute(async (trx) => {
          const affectedUsers = await this.lineScopeHolders(change.code, trx);
          await this.audit.logStrict(
            {
              userId: actor.userId,
              username: actor.username,
              branchCode: actor.branchCode,
              entityType: 'Department',
              entityId: change.departmentId,
              actionCode: LINE_SET_CHANGE,
              oldValue: state(change.before),
              newValue: { ...state(change.after), Operation: change.operation, AffectedUsers: affectedUsers },
              ip: actor.ip,
            },
            trx,
          );
          await this.bumpVersion(trx);
        });
        this.clearCache();
        return;
      } catch (e) {
        lastError = e;
        if (attempt < LINE_CHANGE_ATTEMPTS) await pause(200 * attempt);
      }
    }
    this.clearCache();
    this.logger.error(
      `Đã lưu bộ phận ${change.code} nhưng không ghi được ${LINE_SET_CHANGE} và không tăng được phiên bản quyền sau ${LINE_CHANGE_ATTEMPTS} lần: ${(lastError as Error)?.message}. ` +
        `Dữ liệu để dựng lại: ${JSON.stringify({ actor: { userId: actor.userId, username: actor.username, branchCode: actor.branchCode }, change })}`,
    );
    throw Errors.lineScopeUpdateFailed(change.code, details);
  }

  /**
   * Trần quyền quản trị: người thao tác phải đang có mọi quyền admin.* trong `codes` (tại nhà máy đang làm việc).
   * Chặn đường vòng "tạo tài khoản phụ rồi gán vai trò quản trị cao hơn", hoặc đặt lại mật khẩu của người quyền cao hơn.
   * Quyền nghiệp vụ không bị giới hạn: cấp quyền nghiệp vụ là việc của người giữ admin.permission:update.
   */
  async assertAdminCeiling(actor: AuthUser, codes: Iterable<string>, message: string): Promise<void> {
    const own = (await this.accessOf(actor)).permissions;
    const missing = [...new Set(codes)].filter((c) => c.startsWith(ADMIN_PREFIX) && !own.has(c));
    if (missing.length) throw Errors.selfElevation(`${message} Thiếu quyền: ${missing.sort().join(', ')}.`);
  }
}
