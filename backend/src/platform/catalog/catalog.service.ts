import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql, type Insertable, type Updateable } from 'kysely';
import { AppException, Errors } from '../../common/app.exception';
import { sqlErrorNumbers } from '../../common/db-errors';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import type { SysCatalogItemTable, SysOrgUnitTable, SysShiftTable } from '../database/core.types';
import { CORE_DB, type CoreDb } from '../database/database.module';
import { OrgService } from '../org/org.service';
import { PermissionService } from '../permission/permission.service';
import { SyncService } from '../sync/sync.service';
import { CatalogLookupService } from './catalog-lookup.service';
import { CatalogItemCreateDto, CatalogItemUpdateDto, LineCreateDto, LineUpdateDto, ShiftCreateDto, ShiftUpdateDto, WorkshopCreateDto, WorkshopUpdateDto } from './catalog.dto';

/** Mẫu LIKE "chứa chuỗi": thoát %, _, [ để người dùng gõ ký tự này vẫn tìm đúng chữ. */
const containsLike = (s: string) => `%${s.replace(/[%_[]/g, (c) => `[${c}]`)}%`;

const invalid = (msg: string) => new AppException('VALIDATION_FAILED', msg, 422);
const TREE_LOCK = 'MES_Core.SysOrgUnit';
/** Trùng chỉ mục duy nhất: hai người tạo cùng mã cùng lúc (lần kiểm trước khi ghi không chặn được) */
const isDuplicate = (e: unknown) => sqlErrorNumbers(e).some((n) => n === 2601 || n === 2627);
async function unique<T>(work: () => Promise<T>, message: string): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (isDuplicate(e)) throw Errors.conflict(message);
    throw e;
  }
}
/** Cột TIME về dạng Date 1970-01-01 giờ UTC (tedious useUTC) */
const hhmm = (d: Date) => d.toISOString().slice(11, 16);
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Độ dài ca theo phút; giờ kết thúc nhỏ hơn giờ bắt đầu là ca qua đêm */
const shiftMinutes = (start: string, end: string) => (minutesOf(end) - minutesOf(start) + 1440) % 1440;
/**
 * Tên mục ngắn hơn 100 ký tự khi dữ liệu nghiệp vụ lưu tên (không lưu mã): SalesOrder.UnitName là NVARCHAR(20).
 * Đổi tên đơn vị tính không đổi đơn hàng đã lưu tên cũ.
 */
const NAME_MAX: Record<string, number> = { UNIT: 20 };

/**
 * Danh mục hệ thống (Phase 5.4). Danh mục MES (chuyền may, ca làm việc, danh mục mã-tên trong SysCatalog) thêm, sửa,
 * ngừng dùng được; không xóa vật lý, mã không sửa được. Danh mục chép từ BRAVO chỉ xem, đọc qua lớp đồng bộ (ADR 0007).
 * Dùng chung toàn công ty, không theo nhà máy, không đi qua BaseRepository (như các bảng Sys* khác).
 */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger('Catalog');

  constructor(
    @Inject(CORE_DB) private readonly db: CoreDb,
    private readonly audit: AuditService,
    private readonly permissions: PermissionService,
    private readonly org: OrgService,
    private readonly sync: SyncService,
    private readonly lookup: CatalogLookupService,
  ) {}

  private entry(actor: AuthUser, entityType: string, entityId: number, actionCode: string, oldValue?: unknown, newValue?: unknown) {
    return { userId: actor.userId, username: actor.username, branchCode: actor.branchCode, entityType, entityId, actionCode, oldValue, newValue, ip: actor.ip ?? null };
  }

  // ---------------- Tổng quan ----------------

  async overview() {
    const [catalogs, lines, shifts] = await Promise.all([
      this.db
        .selectFrom('SysCatalog as c')
        .leftJoin('SysCatalogItem as i', 'i.CatalogId', 'c.Id')
        .select(['c.Code', 'c.Name', 'c.Description', sql<number>`COUNT(i.Id)`.as('Total'), sql<number>`SUM(CASE WHEN i.IsActive = 1 THEN 1 ELSE 0 END)`.as('Active')])
        .where('c.IsActive', '=', true)
        .groupBy(['c.Id', 'c.Code', 'c.Name', 'c.Description', 'c.SortOrder'])
        .orderBy('c.SortOrder')
        .orderBy('c.Code')
        .execute(),
      this.db
        .selectFrom('SysOrgUnit')
        .select([sql<number>`COUNT(*)`.as('Total'), sql<number>`SUM(CASE WHEN IsActive = 1 THEN 1 ELSE 0 END)`.as('Active')])
        .where('OrgType', '=', 'LINE')
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('SysShift')
        .select([sql<number>`COUNT(*)`.as('Total'), sql<number>`SUM(CASE WHEN IsActive = 1 THEN 1 ELSE 0 END)`.as('Active')])
        .executeTakeFirstOrThrow(),
    ]);
    const count = (r: { Total: number; Active: number | null }) => ({ total: Number(r.Total), active: Number(r.Active ?? 0) });
    // Danh mục BRAVO đọc qua MES_Sync: chưa có database đồng bộ thì vẫn trả danh mục MES, kèm lý do
    let external: Awaited<ReturnType<SyncService['catalogs']>> = [];
    let externalError: string | null = null;
    try {
      external = await this.sync.catalogs();
    } catch (e) {
      if (!(e instanceof AppException)) this.logger.warn(`Không đọc được danh mục BRAVO: ${(e as Error).message}`);
      externalError = e instanceof AppException ? e.message : 'Chưa đọc được danh mục chép từ BRAVO.';
    }
    return {
      mes: [
        {
          code: 'LINE',
          kind: 'line',
          name: 'Chuyền may',
          description: 'Xưởng và chuyền của từng nhà máy. Chuyền dùng ở Xếp chuyền, Phân bổ màu cỡ và phạm vi phân quyền; xưởng gom chuyền để ô chọn, báo cáo dễ nhìn.',
          ...count(lines),
        },
        ...catalogs.map((c) => ({ code: c.Code, kind: 'item', name: c.Name, description: c.Description, nameMax: NAME_MAX[c.Code] ?? 100, ...count(c) })),
        { code: 'SHIFT', kind: 'shift', name: 'Ca làm việc', description: 'Ca làm, giờ bắt đầu, kết thúc, thời gian nghỉ: dùng cho kế hoạch may, sản lượng theo giờ.', ...count(shifts) },
      ],
      external,
      externalError,
    };
  }

  // ---------------- Xưởng, chuyền may (cây SysOrgUnit: Nhà máy → Xưởng → Chuyền, ADR 0010) ----------------

  /**
   * Cây xưởng, chuyền. Có `q` hoặc `branch` thì lọc trên máy chủ: chỉ nhà máy đó; tìm (LIKE trong DB) trúng xưởng thì
   * hiện cả xưởng, trúng chuyền thì hiện chuyền kèm xưởng chứa nó. Số chuyền đang dùng của xưởng luôn đếm trên mọi
   * chuyền (khóa nút ngừng xưởng dựa vào số này). Danh sách nhà máy luôn đủ (nút chọn nhà máy).
   */
  async lines(filter: { q?: string; branch?: string } = {}) {
    const q = filter.q?.trim();
    let nodes = this.db.selectFrom('SysOrgUnit').where('OrgType', 'in', ['WORKSHOP', 'LINE']);
    if (filter.branch) nodes = nodes.where('BranchCode', '=', filter.branch);
    const [branches, rows, hits] = await Promise.all([
      this.db.selectFrom('SysBranch').select(['Code', 'Name', 'IsActive']).where('IsAggregate', '=', false).orderBy('SortOrder').orderBy('Code').execute(),
      nodes.select(['Id', 'Code', 'Name', 'OrgType', 'ParentId', 'ParentOrgType', 'BranchCode', 'SortOrder', 'IsActive']).orderBy('BranchCode').orderBy('SortOrder').orderBy('Code').execute(),
      q
        ? nodes
            .select('Id')
            .where((eb) => eb.or([eb('Code', 'like', containsLike(q)), eb('Name', 'like', containsLike(q))]))
            .execute()
        : null,
    ]);
    const lines = rows.filter((r) => r.OrgType === 'LINE');
    const hit = hits ? new Set(hits.map((h) => h.Id)) : null;
    const workshopOf = (l: (typeof rows)[number]) => (l.ParentOrgType === 'WORKSHOP' ? l.ParentId : null);
    const shownLine = (l: (typeof rows)[number]) => !hit || hit.has(l.Id) || (workshopOf(l) !== null && hit.has(workshopOf(l)!));
    const shownWorkshop = (w: (typeof rows)[number]) => !hit || hit.has(w.Id) || lines.some((l) => workshopOf(l) === w.Id && hit.has(l.Id));
    return {
      branches: branches.map((b) => ({ code: b.Code, name: b.Name, isActive: !!b.IsActive })),
      workshops: rows
        .filter((r) => r.OrgType === 'WORKSHOP' && shownWorkshop(r))
        .map((w) => ({
          id: w.Id,
          code: w.Code,
          name: w.Name,
          branchCode: w.BranchCode,
          sortOrder: w.SortOrder,
          isActive: !!w.IsActive,
          activeLines: lines.filter((l) => l.ParentId === w.Id && l.IsActive).length,
        })),
      items: lines.filter(shownLine).map((r) => ({
        id: r.Id,
        code: r.Code,
        name: r.Name,
        branchCode: r.BranchCode,
        workshopId: r.ParentOrgType === 'WORKSHOP' ? r.ParentId : null,
        sortOrder: r.SortOrder,
        isActive: !!r.IsActive,
      })),
    };
  }

  /** Nhà máy nhận xưởng, chuyền mới: nhà máy thật đang dùng; mã bắt đầu bằng mã nhà máy, chưa nút nào dùng */
  private async branchFor(dto: { branchCode: string; code: string }, what: 'chuyền' | 'xưởng', example: string) {
    const branch = await this.db.selectFrom('SysBranch').select(['Code', 'Name', 'IsActive', 'IsAggregate']).where('Code', '=', dto.branchCode).executeTakeFirst();
    if (!branch || branch.IsAggregate) throw Errors.notFound('Không có nhà máy này.');
    if (!branch.IsActive) throw Errors.conflict(`Nhà máy đang tắt, bật lại nhà máy trước khi thêm ${what}.`);
    // Mã chuyền là khóa ngầm trong dữ liệu nghiệp vụ (ShipmentPlanLine.LineCode); mã mọi nút nằm trong Path nên duy nhất toàn công ty
    if (!dto.code.startsWith(`${dto.branchCode}-`)) throw invalid(`Mã ${what} bắt đầu bằng mã nhà máy, ví dụ ${dto.branchCode}-${example}.`);
    const used = await this.db.selectFrom('SysOrgUnit').select('Id').where('Code', '=', dto.code).executeTakeFirst();
    if (used) throw Errors.conflict(`Mã ${dto.code} đã được dùng.`);
    return branch;
  }

  /**
   * Các thay đổi cây chạy nối tiếp: quy tắc "chuyền đang dùng thì xưởng của nó đang dùng" kiểm trong transaction, nên một người
   * ngừng xưởng cùng lúc người khác chuyển chuyền vào xưởng đó không lách qua được.
   */
  private async lockTree(trx: CoreDb) {
    const r = await sql<{ r: number }>`DECLARE @r INT; EXEC @r = sp_getapplock @Resource = ${TREE_LOCK}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000; SELECT @r AS r`.execute(trx);
    if ((r.rows[0]?.r ?? -1) < 0) throw Errors.conflict('Có người khác đang sửa danh mục chuyền, thử lại sau.');
  }

  /**
   * Thêm một nút cây rồi đọc lại Id, Path theo mã (duy nhất). Không dùng OUTPUT: SysOrgUnit có trigger kiểm Path (MES_Core/0006),
   * mà SQL Server không cho OUTPUT không kèm INTO trên bảng có trigger.
   */
  private async insertNode(trx: CoreDb, values: Insertable<SysOrgUnitTable>) {
    await trx.insertInto('SysOrgUnit').values(values).execute();
    return trx.selectFrom('SysOrgUnit').select(['Id', 'Path']).where('Code', '=', values.Code).executeTakeFirstOrThrow();
  }

  /** Nút nhà máy của cây; nhà máy thêm sau seed chưa có nút này thì tạo luôn */
  private async factoryNode(trx: CoreDb, branch: { Code: string; Name: string }, actor: AuthUser) {
    const factory = await trx.selectFrom('SysOrgUnit').select(['Id', 'Path']).where('OrgType', '=', 'FACTORY').where('BranchCode', '=', branch.Code).executeTakeFirst();
    if (factory) return factory;
    return this.insertNode(trx, { Code: branch.Code, Name: branch.Name, OrgType: 'FACTORY', ParentId: null, ParentOrgType: null, BranchCode: branch.Code, Path: `/${branch.Code}/`, SortOrder: 0, IsActive: true, IsSystem: false, CreatedBy: actor.userId });
  }

  /** Cha của chuyền: xưởng đang dùng của đúng nhà máy, hoặc nút nhà máy khi không chọn xưởng */
  private async lineParent(trx: CoreDb, branchCode: string, workshopId: number | null, factory: () => Promise<{ Id: number; Path: string }>) {
    if (workshopId === null) return { ...(await factory()), OrgType: 'FACTORY' as const, Code: null };
    const w = await trx.selectFrom('SysOrgUnit').select(['Id', 'Code', 'Name', 'Path', 'BranchCode', 'IsActive']).where('Id', '=', workshopId).where('OrgType', '=', 'WORKSHOP').executeTakeFirst();
    if (!w || w.BranchCode !== branchCode) throw invalid(`Xưởng đã chọn không thuộc nhà máy ${branchCode}.`);
    if (!w.IsActive) throw Errors.conflict(`${w.Name} (${w.Code}) đang ngừng dùng, bật lại xưởng trước.`);
    return { Id: w.Id, Path: w.Path, OrgType: 'WORKSHOP' as const, Code: w.Code };
  }

  /**
   * Chuyền mới nằm dưới xưởng đã chọn hoặc thẳng dưới nhà máy. Cây tổ chức nằm trong quyền đã tính sẵn (phạm vi theo cả nhánh):
   * tăng phiên bản quyền để tính lại.
   */
  async createLine(actor: AuthUser, dto: LineCreateDto) {
    const branch = await this.branchFor(dto, 'chuyền', 'L01');
    const id = await unique(
      () =>
        this.db.transaction().execute(async (trx) => {
          await this.lockTree(trx);
          const parent = await this.lineParent(trx, branch.Code, dto.workshopId ?? null, () => this.factoryNode(trx, branch, actor));
          const max = await trx.selectFrom('SysOrgUnit').select((eb) => eb.fn.max('SortOrder').as('m')).where('OrgType', '=', 'LINE').where('BranchCode', '=', branch.Code).executeTakeFirst();
          const row = await this.insertNode(trx, {
            Code: dto.code,
            Name: dto.name,
            OrgType: 'LINE',
            ParentId: parent.Id,
            ParentOrgType: parent.OrgType,
            BranchCode: branch.Code,
            Path: `${parent.Path}${dto.code}/`,
            SortOrder: dto.sortOrder ?? (max?.m ?? 0) + 1,
            IsActive: true,
            IsSystem: false,
            CreatedBy: actor.userId,
          });
          await this.permissions.bumpVersion(trx);
          await this.audit.logStrict(this.entry(actor, 'SysOrgUnit', row.Id, 'LINE_CREATE', undefined, { code: dto.code, name: dto.name, branchCode: branch.Code, workshop: parent.Code }), trx);
          return row.Id;
        }),
      `Mã ${dto.code} đã được dùng.`,
    );
    this.permissions.clearCache();
    this.org.invalidate();
    return { id };
  }

  /**
   * Đổi tên, thứ tự, xưởng, ngừng dùng chuyền. Ngừng dùng: chuyền không còn trong ô chọn khi xếp việc mới, người được giao phạm vi
   * theo chuyền này mất dữ liệu của chuyền (quyền tính lại ngay); dòng đã xếp vào chuyền vẫn giữ, vẫn sửa được.
   * Chuyển xưởng: mã chuyền giữ nguyên nên dữ liệu đã xếp không đổi; người được giao cả xưởng cũ mất chuyền này, cả xưởng mới thì
   * thấy và sửa được dữ liệu của chuyền. Đó là đổi phạm vi dữ liệu nên cần quyền sửa phân quyền, và người đang được giao cả xưởng
   * cũ hay mới không tự làm được (như không tự sửa phạm vi của mình ở màn Phân quyền).
   */
  async updateLine(actor: AuthUser, id: number, dto: LineUpdateDto) {
    let scopeChanged = false;
    let changed = false;
    await this.db.transaction().execute(async (trx) => {
      await this.lockTree(trx);
      const before = await trx
        .selectFrom('SysOrgUnit as l')
        .leftJoin('SysOrgUnit as p', 'p.Id', 'l.ParentId')
        .select(['l.Code', 'l.Name', 'l.SortOrder', 'l.IsActive', 'l.ParentId', 'l.ParentOrgType', 'l.BranchCode', 'l.Path', 'p.Code as ParentCode'])
        .where('l.Id', '=', id)
        .where('l.OrgType', '=', 'LINE')
        .executeTakeFirst();
      if (!before) throw Errors.notFound('Không tìm thấy chuyền.');
      if (dto.code !== undefined && dto.code !== before.Code) throw Errors.codeImmutable();
      const set: Updateable<SysOrgUnitTable> = {};
      if (dto.name !== undefined) set.Name = dto.name;
      if (dto.sortOrder !== undefined) set.SortOrder = dto.sortOrder;
      if (dto.isActive !== undefined) set.IsActive = dto.isActive;
      const workshopBefore = before.ParentOrgType === 'WORKSHOP' ? before.ParentId : null;
      const workshopAfter = dto.workshopId === undefined ? workshopBefore : dto.workshopId;
      const moving = workshopAfter !== workshopBefore;
      let workshopCode: string | null = null;
      if (moving) await this.assertCanMove(trx, actor, [workshopBefore, workshopAfter]);
      // Chuyền đang dùng thì xưởng của nó đang dùng: kiểm khi chuyển xưởng và khi bật lại chuyền
      if (moving || dto.isActive === true) {
        const factory = () => trx.selectFrom('SysOrgUnit').select(['Id', 'Path']).where('OrgType', '=', 'FACTORY').where('BranchCode', '=', before.BranchCode).executeTakeFirstOrThrow();
        const parent = await this.lineParent(trx, before.BranchCode, workshopAfter, factory);
        if (moving) Object.assign(set, { ParentId: parent.Id, ParentOrgType: parent.OrgType, Path: `${parent.Path}${before.Code}/` });
        workshopCode = parent.Code;
      }
      if (!Object.keys(set).length) return;
      changed = true;
      // Tên, thứ tự không có trong quyền đã tính: chỉ bật/tắt và chuyển xưởng mới tăng phiên bản quyền
      scopeChanged = dto.isActive !== undefined || moving;
      await trx.updateTable('SysOrgUnit').set({ ...set, ModifiedAt: new Date(), ModifiedBy: actor.userId }).where('Id', '=', id).execute();
      if (scopeChanged) await this.permissions.bumpVersion(trx);
      // Nhật ký ghi mã xưởng cũ, mới (không chỉ Id) để đọc được chuyền chuyển từ đâu sang đâu
      const workshopOf = before.ParentOrgType === 'WORKSHOP' ? before.ParentCode : null;
      const old = { Name: before.Name, SortOrder: before.SortOrder, IsActive: before.IsActive, Workshop: workshopOf, Path: before.Path };
      const shown: Record<string, unknown> = { ...set };
      delete shown.ParentId;
      delete shown.ParentOrgType;
      await this.audit.logStrict(this.entry(actor, 'SysOrgUnit', id, 'LINE_UPDATE', old, moving ? { ...shown, Workshop: workshopCode } : shown), trx);
    });
    if (scopeChanged) this.permissions.clearCache();
    if (changed) this.org.invalidate();
  }

  /**
   * Chuyển chuyền giữa xưởng đổi phạm vi dữ liệu của người được giao cả xưởng (ORG_SUBTREE theo Path) mà không qua màn Phân quyền:
   * người thao tác phải có quyền sửa phân quyền, và không được đang giữ phạm vi cả xưởng cũ hay mới (tự nới phạm vi của mình).
   */
  private async assertCanMove(trx: CoreDb, actor: AuthUser, workshopIds: (number | null)[]) {
    await this.permissions.assertAdminCeiling(actor, ['admin.permission:update'], 'Chuyển chuyền sang xưởng khác làm đổi phạm vi dữ liệu của người được giao cả xưởng.');
    const ids = workshopIds.filter((x): x is number => x !== null);
    if (!ids.length) return;
    const own = await trx
      .selectFrom('SysUserRoleScope as s')
      .innerJoin('SysUserRole as ur', 'ur.Id', 's.UserRoleId')
      .innerJoin('SysOrgUnit as o', 'o.Id', 's.OrgUnitId')
      .select(['o.Name', 'o.Code'])
      .where('ur.UserId', '=', actor.userId)
      .where('s.ScopeMode', '=', 'ORG_SUBTREE')
      .where('s.OrgUnitId', 'in', ids)
      .executeTakeFirst();
    if (own) throw Errors.selfElevation(`Bạn đang được giao phạm vi cả ${own.Name} (${own.Code}) nên không tự chuyển chuyền vào hay ra khỏi xưởng này. Nhờ quản trị viên khác làm.`);
  }
  /** Xưởng gom chuyền của một nhà máy (ADR 0010). Xưởng mới chưa có chuyền nên quyền đã tính không đổi. */
  async createWorkshop(actor: AuthUser, dto: WorkshopCreateDto) {
    const branch = await this.branchFor(dto, 'xưởng', 'X01');
    const id = await unique(
      () =>
        this.db.transaction().execute(async (trx) => {
          await this.lockTree(trx);
          const factory = await this.factoryNode(trx, branch, actor);
          const max = await trx.selectFrom('SysOrgUnit').select((eb) => eb.fn.max('SortOrder').as('m')).where('OrgType', '=', 'WORKSHOP').where('BranchCode', '=', branch.Code).executeTakeFirst();
          const row = await this.insertNode(trx, {
            Code: dto.code,
            Name: dto.name,
            OrgType: 'WORKSHOP',
            ParentId: factory.Id,
            ParentOrgType: 'FACTORY',
            BranchCode: branch.Code,
            Path: `${factory.Path}${dto.code}/`,
            SortOrder: dto.sortOrder ?? (max?.m ?? 0) + 1,
            IsActive: true,
            IsSystem: false,
            CreatedBy: actor.userId,
          });
          await this.audit.logStrict(this.entry(actor, 'SysOrgUnit', row.Id, 'WORKSHOP_CREATE', undefined, { code: dto.code, name: dto.name, branchCode: branch.Code }), trx);
          return row.Id;
        }),
      `Mã ${dto.code} đã được dùng.`,
    );
    this.org.invalidate();
    return { id };
  }

  /**
   * Đổi tên, thứ tự, ngừng dùng xưởng. Xưởng còn chuyền đang dùng thì không ngừng được: chuyền đang dùng luôn nằm trong xưởng
   * đang dùng, nên người được giao cả xưởng không mất chuyền âm thầm.
   */
  async updateWorkshop(actor: AuthUser, id: number, dto: WorkshopUpdateDto) {
    let activeChanged = false;
    let changed = false;
    await this.db.transaction().execute(async (trx) => {
      await this.lockTree(trx);
      const before = await trx.selectFrom('SysOrgUnit').select(['Code', 'Name', 'SortOrder', 'IsActive']).where('Id', '=', id).where('OrgType', '=', 'WORKSHOP').executeTakeFirst();
      if (!before) throw Errors.notFound('Không tìm thấy xưởng.');
      if (dto.code !== undefined && dto.code !== before.Code) throw Errors.codeImmutable();
      const set: Updateable<SysOrgUnitTable> = {};
      if (dto.name !== undefined) set.Name = dto.name;
      if (dto.sortOrder !== undefined) set.SortOrder = dto.sortOrder;
      if (dto.isActive !== undefined) set.IsActive = dto.isActive;
      if (!Object.keys(set).length) return;
      if (dto.isActive === false) {
        const active = await trx.selectFrom('SysOrgUnit').select(sql<number>`COUNT(*)`.as('n')).where('ParentId', '=', id).where('IsActive', '=', true).executeTakeFirstOrThrow();
        const n = Number(active.n);
        if (n > 0) throw Errors.conflict(`Xưởng còn ${n} chuyền đang dùng: chuyển các chuyền sang xưởng khác hoặc ngừng dùng chúng trước.`);
      }
      changed = true;
      activeChanged = dto.isActive !== undefined;
      await trx.updateTable('SysOrgUnit').set({ ...set, ModifiedAt: new Date(), ModifiedBy: actor.userId }).where('Id', '=', id).execute();
      // Phạm vi "cả xưởng" chỉ có hiệu lực khi xưởng đang dùng (PermissionService bỏ qua nút đã ngừng)
      if (activeChanged) await this.permissions.bumpVersion(trx);
      await this.audit.logStrict(this.entry(actor, 'SysOrgUnit', id, 'WORKSHOP_UPDATE', before, set), trx);
    });
    if (activeChanged) this.permissions.clearCache();
    if (changed) this.org.invalidate();
  }

  // ---------------- Danh mục mã-tên (SysCatalog + SysCatalogItem) ----------------

  private async catalog(code: string) {
    const c = await this.db.selectFrom('SysCatalog').select(['Id', 'Code', 'Name', 'Description']).where('Code', '=', code).where('IsActive', '=', true).executeTakeFirst();
    if (!c) throw Errors.notFound('Không có danh mục này.');
    return c;
  }

  private checkName(catalogCode: string, name: string | undefined) {
    const max = NAME_MAX[catalogCode];
    if (max && name !== undefined && name.length > max) throw invalid(`Tên tối đa ${max} ký tự (đơn hàng lưu tên này trong cột ${max} ký tự).`);
  }

  /** Mục của một danh mục; `q`: tìm mã, tên, mô tả trong DB. */
  async items(catalogCode: string, search?: string) {
    const c = await this.catalog(catalogCode);
    const q = search?.trim();
    let qb = this.db.selectFrom('SysCatalogItem').select(['Id', 'Code', 'Name', 'Description', 'SortOrder', 'IsActive']).where('CatalogId', '=', c.Id);
    if (q) qb = qb.where((eb) => eb.or([eb('Code', 'like', containsLike(q)), eb('Name', 'like', containsLike(q)), eb('Description', 'like', containsLike(q))]));
    const rows = await qb
      .orderBy('SortOrder')
      .orderBy('Code')
      .execute();
    return {
      catalog: { code: c.Code, name: c.Name, description: c.Description, nameMax: NAME_MAX[c.Code] ?? 100 },
      items: rows.map((r) => ({ id: r.Id, code: r.Code, name: r.Name, description: r.Description, sortOrder: r.SortOrder, isActive: !!r.IsActive })),
    };
  }

  async createItem(actor: AuthUser, catalogCode: string, dto: CatalogItemCreateDto) {
    const c = await this.catalog(catalogCode);
    this.checkName(c.Code, dto.name);
    const used = await this.db.selectFrom('SysCatalogItem').select('Id').where('CatalogId', '=', c.Id).where('Code', '=', dto.code).executeTakeFirst();
    if (used) throw Errors.conflict(`Mã ${dto.code} đã có trong ${c.Name}.`);
    const max = await this.db.selectFrom('SysCatalogItem').select((eb) => eb.fn.max('SortOrder').as('m')).where('CatalogId', '=', c.Id).executeTakeFirst();
    const id = await unique(
      () =>
        this.db.transaction().execute(async (trx) => {
          const row = await trx
            .insertInto('SysCatalogItem')
            .values({ CatalogId: c.Id, Code: dto.code, Name: dto.name, Description: dto.description || null, SortOrder: dto.sortOrder ?? (max?.m ?? 0) + 10, IsActive: true, IsSystem: false, CreatedBy: actor.userId })
            .output('inserted.Id')
            .executeTakeFirstOrThrow();
          await this.audit.logStrict(this.entry(actor, 'SysCatalogItem', row.Id, 'CATALOG_ITEM_CREATE', undefined, { catalog: c.Code, code: dto.code, name: dto.name }), trx);
          return row.Id;
        }),
      `Mã ${dto.code} đã có trong ${c.Name}.`,
    );
    this.lookup.invalidate(c.Code);
    return { id };
  }

  async updateItem(actor: AuthUser, catalogCode: string, id: number, dto: CatalogItemUpdateDto) {
    const c = await this.catalog(catalogCode);
    const before = await this.db.selectFrom('SysCatalogItem').select(['Code', 'Name', 'Description', 'SortOrder', 'IsActive']).where('Id', '=', id).where('CatalogId', '=', c.Id).executeTakeFirst();
    if (!before) throw Errors.notFound('Không tìm thấy mục này.');
    if (dto.code !== undefined && dto.code !== before.Code) throw Errors.codeImmutable();
    this.checkName(c.Code, dto.name);
    const set: Updateable<SysCatalogItemTable> = {};
    if (dto.name !== undefined) set.Name = dto.name;
    if (dto.description !== undefined) set.Description = dto.description || null;
    if (dto.sortOrder !== undefined) set.SortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) set.IsActive = dto.isActive;
    if (!Object.keys(set).length) return;
    await this.db.transaction().execute(async (trx) => {
      await trx.updateTable('SysCatalogItem').set({ ...set, ModifiedAt: new Date(), ModifiedBy: actor.userId }).where('Id', '=', id).execute();
      await this.audit.logStrict(this.entry(actor, 'SysCatalogItem', id, 'CATALOG_ITEM_UPDATE', { catalog: c.Code, ...before }, set), trx);
    });
    this.lookup.invalidate(c.Code);
  }

  // ---------------- Ca làm việc ----------------

  async shifts() {
    const rows = await this.db.selectFrom('SysShift').selectAll().orderBy('SortOrder').orderBy('Code').execute();
    return rows.map((r) => {
      const start = hhmm(r.StartTime);
      const end = hhmm(r.EndTime);
      return {
        id: r.Id,
        code: r.Code,
        name: r.Name,
        description: r.Description,
        startTime: start,
        endTime: end,
        breakMinutes: r.BreakMinutes,
        workMinutes: shiftMinutes(start, end) - r.BreakMinutes,
        overnight: minutesOf(end) < minutesOf(start),
        sortOrder: r.SortOrder,
        isActive: !!r.IsActive,
      };
    });
  }

  private checkShift(start: string, end: string, breakMinutes: number) {
    const total = shiftMinutes(start, end);
    if (total === 0) throw invalid('Giờ kết thúc phải khác giờ bắt đầu.');
    if (breakMinutes >= total) throw invalid('Thời gian nghỉ phải ngắn hơn độ dài ca.');
  }

  async createShift(actor: AuthUser, dto: ShiftCreateDto) {
    this.checkShift(dto.startTime, dto.endTime, dto.breakMinutes ?? 0);
    const used = await this.db.selectFrom('SysShift').select('Id').where('Code', '=', dto.code).executeTakeFirst();
    if (used) throw Errors.conflict(`Mã ca ${dto.code} đã được dùng.`);
    const max = await this.db.selectFrom('SysShift').select((eb) => eb.fn.max('SortOrder').as('m')).executeTakeFirst();
    const id = await unique(
      () =>
        this.db.transaction().execute(async (trx) => {
          const row = await trx
            .insertInto('SysShift')
            .values({
              Code: dto.code,
              Name: dto.name,
              Description: dto.description || null,
              StartTime: dto.startTime,
              EndTime: dto.endTime,
              BreakMinutes: dto.breakMinutes ?? 0,
              SortOrder: dto.sortOrder ?? (max?.m ?? 0) + 10,
              IsActive: true,
              IsSystem: false,
              CreatedBy: actor.userId,
            })
            .output('inserted.Id')
            .executeTakeFirstOrThrow();
          await this.audit.logStrict(
            this.entry(actor, 'SysShift', row.Id, 'SHIFT_CREATE', undefined, { code: dto.code, name: dto.name, startTime: dto.startTime, endTime: dto.endTime, breakMinutes: dto.breakMinutes ?? 0 }),
            trx,
          );
          return row.Id;
        }),
      `Mã ca ${dto.code} đã được dùng.`,
    );
    return { id };
  }

  async updateShift(actor: AuthUser, id: number, dto: ShiftUpdateDto) {
    const row = await this.db.selectFrom('SysShift').selectAll().where('Id', '=', id).executeTakeFirst();
    if (!row) throw Errors.notFound('Không tìm thấy ca làm việc.');
    if (dto.code !== undefined && dto.code !== row.Code) throw Errors.codeImmutable();
    const before = { name: row.Name, description: row.Description, startTime: hhmm(row.StartTime), endTime: hhmm(row.EndTime), breakMinutes: row.BreakMinutes, sortOrder: row.SortOrder, isActive: !!row.IsActive };
    this.checkShift(dto.startTime ?? before.startTime, dto.endTime ?? before.endTime, dto.breakMinutes ?? before.breakMinutes);
    const set: Updateable<SysShiftTable> = {};
    if (dto.name !== undefined) set.Name = dto.name;
    if (dto.description !== undefined) set.Description = dto.description || null;
    if (dto.startTime !== undefined) set.StartTime = dto.startTime;
    if (dto.endTime !== undefined) set.EndTime = dto.endTime;
    if (dto.breakMinutes !== undefined) set.BreakMinutes = dto.breakMinutes;
    if (dto.sortOrder !== undefined) set.SortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) set.IsActive = dto.isActive;
    if (!Object.keys(set).length) return;
    await this.db.transaction().execute(async (trx) => {
      await trx.updateTable('SysShift').set({ ...set, ModifiedAt: new Date(), ModifiedBy: actor.userId }).where('Id', '=', id).execute();
      await this.audit.logStrict(this.entry(actor, 'SysShift', id, 'SHIFT_UPDATE', before, set), trx);
    });
  }

  // ---------------- Danh mục chép từ BRAVO (chỉ xem) ----------------

  externalRows(code: string, page: number, pageSize: number, q?: string) {
    return this.sync.catalogRows(code, page, pageSize, q);
  }
}
