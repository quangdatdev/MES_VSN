import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { sql, type Kysely, type Updateable, type Selectable } from 'kysely';
import { AppException, Errors } from '../../common/app.exception';
import { sqlErrorNumbers } from '../../common/db-errors';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import type { CoreDatabase, SysCatalogItemTable, SysProductionFactoryTable, SysShiftTable, SysWorkCalendarTable } from '../database/core.types';
import { CORE_DB, type CoreDb } from '../database/database.module';
import { PermissionService } from '../permission/permission.service';
import { OSM_FACTORY_SOURCE } from '../sync/bravo-order-source';
import { SyncService } from '../sync/sync.service';
import { CatalogLookupService } from './catalog-lookup.service';
import { FACTORY_CODE_MAX, OSM_FACTORY_NOTE, splitFactories } from './factory-list';
import {
  CatalogItemCreateDto,
  CatalogItemUpdateDto,
  FactoryCreateDto,
  FactoryUpdateDto,
  ShiftCreateDto,
  ShiftUpdateDto,
  WorkCalendarDaysDto,
  WorkCalendarUpdateDto,
} from './catalog.dto';
import { addCalendarDays, DEFAULT_WORK_CALENDAR, isRealDate, maskOf, offsetsInOrder, offsetsOf, weekdaysOf, type CalendarOffsets } from './work-calendar';

/** Mẫu LIKE "chứa chuỗi": thoát %, _, [ để người dùng gõ ký tự này vẫn tìm đúng chữ. */
const containsLike = (s: string) => `%${s.replace(/[%_[]/g, (c) => `[${c}]`)}%`;

const invalid = (msg: string) => new AppException('VALIDATION_FAILED', msg, 422);
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
/** Một lần đặt ngày đặc biệt dài tối đa bấy nhiêu ngày (Tết dài nhất khoảng 9–10 ngày) */
const MAX_CALENDAR_RANGE_DAYS = 62;
/** Xóa theo khoảng tối đa một năm: gọi nhầm API không xóa sạch lịch nhiều năm một lần */
const MAX_DELETE_RANGE_DAYS = 366;
/** Năm nhận được, như ô năm của API; DATE của SQL Server không nhận năm 0000 (lỗi chuyển kiểu thành 500) */
const calendarYearOk = (iso: string) => isRealDate(iso) && iso >= '2000-01-01' && iso <= '2100-12-31';
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
/** Cột DATE so với chuỗi YYYY-MM-DD (kiểu Kysely của cột là Date khi đọc) */
const dateRef = (column: string) => sql<string>`${sql.ref(column)}`;
const daySpan = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;

/**
 * Danh mục hệ thống (Phase 5.4). Danh mục MES (nhà máy SX, ca làm việc, danh mục mã-tên trong SysCatalog) thêm, sửa,
 * ngừng dùng được; không xóa vật lý, mã không sửa được. Danh mục chép từ BRAVO chỉ xem, đọc qua lớp đồng bộ (ADR 0007).
 * Dùng chung toàn công ty, không theo nhà máy, không đi qua BaseRepository (như các bảng Sys* khác).
 * Chuyền may không còn ở đây (phase 5.10): chuyền là bộ phận tích "Xưởng sản xuất" của module Nhân sự.
 */
@Injectable()
export class CatalogService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger('Catalog');

  constructor(
    @Inject(CORE_DB) private readonly db: CoreDb,
    private readonly audit: AuditService,
    private readonly permissions: PermissionService,
    private readonly sync: SyncService,
    private readonly lookup: CatalogLookupService,
  ) {}

  onModuleInit() {
    // Tên nhà máy mới trong OSM tự vào danh mục Nhà máy SX (ADR 0013 mục 9): quản trị gắn ĐVCS
    this.sync.onSucceeded(OSM_FACTORY_SOURCE, () => this.importOsmFactories());
  }

  /** Lúc khởi động: đợt đồng bộ OSM chạy khi backend dừng, hoặc lần thêm trước bị lỗi giữa chừng */
  onApplicationBootstrap() {
    void this.importOsmFactories().catch((e) => {
      if (e instanceof AppException && e.code === 'SYNC_NOT_READY') return;
      this.logger.error(`Thêm nhà máy SX theo OSM lúc khởi động lỗi: ${(e as Error).message}`, (e as Error).stack);
    });
  }

  private entry(actor: AuthUser, entityType: string, entityId: number, actionCode: string, oldValue?: unknown, newValue?: unknown) {
    return { userId: actor.userId, username: actor.username, branchCode: actor.branchCode, entityType, entityId, actionCode, oldValue, newValue, ip: actor.ip ?? null };
  }

  // ---------------- Tổng quan ----------------

  async overview() {
    const [catalogs, shifts, factories, branches, calendars] = await Promise.all([
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
        .selectFrom('SysShift')
        .select([sql<number>`COUNT(*)`.as('Total'), sql<number>`SUM(CASE WHEN IsActive = 1 THEN 1 ELSE 0 END)`.as('Active')])
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('SysProductionFactory')
        .select([sql<number>`COUNT(*)`.as('Total'), sql<number>`SUM(CASE WHEN IsActive = 1 THEN 1 ELSE 0 END)`.as('Active')])
        .executeTakeFirstOrThrow(),
      this.db.selectFrom('SysBranch').select(['Code', 'Name', 'IsActive']).where('IsAggregate', '=', false).orderBy('SortOrder').orderBy('Code').execute(),
      this.db
        .selectFrom('SysWorkCalendar as c')
        .innerJoin('SysBranch as b', 'b.Code', 'c.BranchCode')
        .select(sql<number>`COUNT(*)`.as('Total'))
        .where('b.IsActive', '=', true)
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
          code: 'PROD_FACTORY',
          kind: 'factory',
          name: 'Nhà máy SX',
          description: 'Nơi sản xuất thực tế của đơn hàng (cột Nhà máy SX), mỗi nhà máy thuộc một đơn vị cơ sở. Đăng nhập đơn vị cơ sở nào thì lập kế hoạch xuất hàng được cho đơn hàng của các nhà máy thuộc đơn vị đó.',
          ...count(factories),
        },
        ...catalogs.map((c) => ({ code: c.Code, kind: 'item', name: c.Name, description: c.Description, nameMax: NAME_MAX[c.Code] ?? 100, ...count(c) })),
        { code: 'SHIFT', kind: 'shift', name: 'Ca làm việc', description: 'Ca làm, giờ bắt đầu, kết thúc, thời gian nghỉ: dùng cho kế hoạch may, sản lượng theo giờ.', ...count(shifts) },
        {
          code: 'WORK_CALENDAR',
          kind: 'calendar',
          name: 'Lịch làm việc',
          description: 'Ngày nghỉ hằng tuần, nghỉ lễ, Tết, ngày làm bù và số ngày ra chuyền, nhập kho của từng đơn vị cơ sở: Chi tiết dàn chuyền dùng để tự tính ngày.',
          // total: số ĐVCS đang dùng; active: số ĐVCS đang dùng đã có lịch riêng (còn lại dùng lịch mặc định)
          total: branches.filter((b) => b.IsActive).length,
          active: Number(calendars.Total),
        },
      ],
      external,
      externalError,
      // ĐVCS (kể cả đang tắt, để hiện đúng tên) cho ô lọc và ô chọn ĐVCS của Nhà máy SX: cùng quyền xem danh mục, không đòi
      // quyền xem màn Đơn vị cơ sở
      branches: branches.map((b) => ({ code: b.Code, name: b.Name, isActive: !!b.IsActive })),
    };
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

  // ---------------- Nhà máy SX (ADR 0013) ----------------

  /** Mọi nhà máy SX kèm tên ĐVCS; `q`: tìm mã, tên, mô tả, mã ĐVCS trong DB. */
  async factories(search?: string) {
    const q = search?.trim();
    let qb = this.db
      .selectFrom('SysProductionFactory as f')
      .leftJoin('SysBranch as b', 'b.Code', 'f.BranchCode')
      .select(['f.Id', 'f.Code', 'f.Name', 'f.BranchCode', 'b.Name as BranchName', 'f.Description', 'f.SortOrder', 'f.IsActive']);
    if (q) {
      const l = containsLike(q);
      qb = qb.where((eb) => eb.or([eb('f.Code', 'like', l), eb('f.Name', 'like', l), eb('f.Description', 'like', l), eb('f.BranchCode', 'like', l)]));
    }
    const rows = await qb.orderBy('f.SortOrder').orderBy('f.Code').execute();
    return rows.map((r) => ({
      id: r.Id,
      code: r.Code,
      name: r.Name,
      branchCode: r.BranchCode,
      branchName: r.BranchName,
      description: r.Description,
      sortOrder: r.SortOrder,
      isActive: !!r.IsActive,
    }));
  }

  /**
   * ĐVCS của nhà máy quyết định đơn hàng nào lập kế hoạch xuất hàng được ở ĐVCS đó, và qua kế hoạch, ai sửa được tỷ lệ cắt của
   * PO (ADR 0013 mục 11): thêm nhà máy, đổi ĐVCS, bật, tắt nhà máy đòi thêm quyền sửa phân quyền (review 5.9.13 M2).
   */
  private assertCanScope(actor: AuthUser) {
    return this.permissions.assertAdminCeiling(actor, ['admin.permission:update'], 'Nhà máy SX gắn đơn vị cơ sở quyết định đơn hàng nào lập kế hoạch được ở đơn vị đó.');
  }

  /** ĐVCS gắn nhà máy: phải có, không phải đơn vị tổng hợp; đang tắt thì chỉ giữ được khi không đổi */
  private async factoryBranch(code: string, current?: string | null) {
    const b = await this.db.selectFrom('SysBranch').select(['Code', 'IsAggregate', 'IsActive']).where('Code', '=', code).executeTakeFirst();
    if (!b) throw invalid(`Không có đơn vị cơ sở ${code}.`);
    if (b.IsAggregate) throw invalid('Đơn vị tổng hợp không có nhà máy SX. Chọn một đơn vị cơ sở cụ thể.');
    if (!b.IsActive && b.Code !== current) throw invalid(`Đơn vị cơ sở ${code} đang ngừng dùng.`);
    return b.Code;
  }

  async createFactory(actor: AuthUser, dto: FactoryCreateDto) {
    await this.assertCanScope(actor);
    const branchCode = await this.factoryBranch(dto.branchCode);
    const max = await this.db.selectFrom('SysProductionFactory').select((eb) => eb.fn.max('SortOrder').as('m')).executeTakeFirst();
    const message = `Mã nhà máy SX ${dto.code} đã được dùng.`;
    if (await this.db.selectFrom('SysProductionFactory').select('Id').where('Code', '=', dto.code).executeTakeFirst()) throw Errors.conflict(message);
    const id = await unique(
      () =>
        this.db.transaction().execute(async (trx) => {
          const row = await trx
            .insertInto('SysProductionFactory')
            .values({ Code: dto.code, Name: dto.name, BranchCode: branchCode, Description: dto.description || null, SortOrder: dto.sortOrder ?? (max?.m ?? 0) + 10, IsActive: true, IsSystem: false, CreatedBy: actor.userId })
            .output('inserted.Id')
            .executeTakeFirstOrThrow();
          // Nhà máy mới thuộc ĐVCS: đổi danh sách nhà máy SX trong quyền của phiên ở ĐVCS đó (lọc popup Chọn mã hàng)
          await this.permissions.bumpVersion(trx);
          await this.audit.logStrict(this.entry(actor, 'SysProductionFactory', row.Id, 'FACTORY_CREATE', undefined, { code: dto.code, name: dto.name, branchCode }), trx);
          return row.Id;
        }),
      message,
    );
    this.lookup.invalidateFactories();
    this.permissions.clearCache();
    return { id };
  }

  /**
   * Sửa tên, ĐVCS, mô tả, thứ tự, bật/tắt; mã không sửa được. Đổi ĐVCS, bật/tắt đổi danh sách nhà máy SX trong quyền của
   * phiên ở ĐVCS đó (lọc popup Chọn mã hàng) nên tăng phiên bản quyền.
   */
  async updateFactory(actor: AuthUser, id: number, dto: FactoryUpdateDto) {
    const before = await this.db.selectFrom('SysProductionFactory').select(['Code', 'Name', 'BranchCode', 'Description', 'SortOrder', 'IsActive']).where('Id', '=', id).executeTakeFirst();
    if (!before) throw Errors.notFound('Không tìm thấy nhà máy SX.');
    if (dto.code !== undefined && dto.code !== before.Code) throw Errors.codeImmutable();
    const set: Updateable<SysProductionFactoryTable> = {};
    if (dto.name !== undefined) set.Name = dto.name;
    if (dto.branchCode !== undefined && dto.branchCode !== before.BranchCode) set.BranchCode = await this.factoryBranch(dto.branchCode, before.BranchCode);
    if (dto.description !== undefined) set.Description = dto.description || null;
    if (dto.sortOrder !== undefined) set.SortOrder = dto.sortOrder;
    // Chỉ ghi khi khác giá trị đang có: gửi lại đúng giá trị cũ (đọc trước khi người khác vừa đổi) không bật, tắt lại mà bỏ qua kiểm quyền
    if (dto.isActive !== undefined && dto.isActive !== !!before.IsActive) set.IsActive = dto.isActive;
    if (!Object.keys(set).length) return;
    const accessChanged = set.IsActive !== undefined || set.BranchCode !== undefined;
    if (accessChanged) await this.assertCanScope(actor);
    await this.db.transaction().execute(async (trx) => {
      await trx.updateTable('SysProductionFactory').set({ ...set, ModifiedAt: new Date(), ModifiedBy: actor.userId }).where('Id', '=', id).execute();
      if (accessChanged) await this.permissions.bumpVersion(trx);
      await this.audit.logStrict(this.entry(actor, 'SysProductionFactory', id, 'FACTORY_UPDATE', before, set), trx);
    });
    this.lookup.invalidateFactories();
    if (accessChanged) this.permissions.clearCache();
  }

  /**
   * Thêm vào danh mục Nhà máy SX các tên nhà máy có trong bảng chép OSM mà danh mục chưa có: mã = tên = tên theo OSM, chưa gắn
   * ĐVCS (quản trị gắn ở Danh mục hệ thống). Không đổi, không tắt nhà máy đã có. Chạy sau mỗi lần đồng bộ nguồn OSM và lúc khởi
   * động; chưa đồng bộ OSM thì không làm gì. Thêm từng tên, SQL Server tự so trùng theo collation (WHERE NOT EXISTS); tên vừa
   * được thêm cùng lúc (người tạo tay, lần chạy khác) thì bỏ qua, các tên khác vẫn thêm (review OSM L4).
   */
  async importOsmFactories(): Promise<{ added: string[] }> {
    const lists = await this.sync.osmFactoryLists();
    if (!lists) return { added: [] };
    const names = [...new Map(lists.flatMap((l) => splitFactories(l)).map((n) => [n.toUpperCase(), n])).values()];
    const tooLong = names.filter((n) => n.length > FACTORY_CODE_MAX);
    if (tooLong.length) this.logger.warn(`Tên nhà máy OSM dài quá ${FACTORY_CODE_MAX} ký tự, không thêm vào danh mục (đơn hàng mang tên này không lập kế hoạch được ở đơn vị nào): ${tooLong.join(' | ')}`);
    const max = await this.db.selectFrom('SysProductionFactory').select((eb) => eb.fn.max('SortOrder').as('m')).executeTakeFirst();
    let sort = max?.m ?? 0;
    const added: string[] = [];
    for (const code of names.filter((n) => n.length <= FACTORY_CODE_MAX)) {
      try {
        const r = await sql`
          INSERT INTO dbo.SysProductionFactory (Code, Name, BranchCode, Description, SortOrder, IsActive, IsSystem, CreatedBy)
          SELECT ${code}, ${code}, NULL, ${OSM_FACTORY_NOTE}, ${sort + 10}, 1, 0, NULL
          WHERE NOT EXISTS (SELECT 1 FROM dbo.SysProductionFactory WHERE Code = ${code})`.execute(this.db);
        if (Number(r.numAffectedRows ?? 0) > 0) {
          sort += 10;
          added.push(code);
        }
      } catch (e) {
        if (!isDuplicate(e)) throw e;
      }
    }
    if (added.length) {
      this.lookup.invalidateFactories();
      await this.audit.log({ userId: null, username: 'system', entityType: 'SysProductionFactory', actionCode: 'FACTORY_IMPORT', newValue: { by: 'OSM', added } });
      this.logger.log(`Thêm ${added.length} nhà máy SX theo OSM: ${added.join(', ')}`);
    }
    return { added };
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

  // ---------------- Lịch làm việc theo ĐVCS (phase 5.12) ----------------

  /** Mọi ĐVCS (trừ đơn vị tổng hợp) kèm lịch riêng hoặc lịch mặc định, số ngày đặc biệt đã nhập */
  async workCalendars() {
    const [branches, calendars, counts] = await Promise.all([
      this.db.selectFrom('SysBranch').select(['Code', 'Name', 'IsActive']).where('IsAggregate', '=', false).orderBy('SortOrder').orderBy('Code').execute(),
      this.db.selectFrom('SysWorkCalendar').selectAll().execute(),
      this.db.selectFrom('SysWorkCalendarDay').select(['WorkCalendarId', sql<number>`COUNT(*)`.as('N')]).groupBy('WorkCalendarId').execute(),
    ]);
    const byBranch = new Map(calendars.map((c) => [c.BranchCode, c]));
    const dayCount = new Map(counts.map((c) => [c.WorkCalendarId, Number(c.N)]));
    const defaults = { weeklyOffDays: weekdaysOf(DEFAULT_WORK_CALENDAR.weeklyOffMask), ...offsetsOf(DEFAULT_WORK_CALENDAR) };
    return {
      defaults,
      // ĐVCS đã ngừng dùng chỉ hiện khi đã có lịch riêng (dàn chuyền cũ của nó vẫn tính theo lịch đó)
      items: branches
        .filter((b) => b.IsActive || byBranch.has(b.Code))
        .map((b) => {
          const c = byBranch.get(b.Code);
          return {
            branchCode: b.Code,
            branchName: b.Name,
            branchActive: !!b.IsActive,
            configured: !!c,
            ...(c ? { weeklyOffDays: weekdaysOf(c.WeeklyOffMask), ...this.offsetsOfRow(c) } : defaults),
            dayCount: c ? (dayCount.get(c.Id) ?? 0) : 0,
          };
        }),
    };
  }

  private offsetsOfRow(r: Pick<Selectable<SysWorkCalendarTable>, 'OutStartOffsetDays' | 'OutEndOffsetDays' | 'WarehouseStartOffsetDays' | 'WarehouseEndOffsetDays' | 'ProductionRoundUpFrom'>): CalendarOffsets {
    return {
      outStartOffsetDays: r.OutStartOffsetDays,
      outEndOffsetDays: r.OutEndOffsetDays,
      warehouseStartOffsetDays: r.WarehouseStartOffsetDays,
      warehouseEndOffsetDays: r.WarehouseEndOffsetDays,
      productionRoundUpFrom: Number(r.ProductionRoundUpFrom),
    };
  }

  private offsetColumns(o: CalendarOffsets) {
    return {
      OutStartOffsetDays: o.outStartOffsetDays,
      OutEndOffsetDays: o.outEndOffsetDays,
      WarehouseStartOffsetDays: o.warehouseStartOffsetDays,
      WarehouseEndOffsetDays: o.warehouseEndOffsetDays,
      ProductionRoundUpFrom: o.productionRoundUpFrom,
    };
  }

  /** ĐVCS của lịch: phải có, không phải đơn vị tổng hợp; ghi thì phải đang dùng */
  private async calendarBranch(code: string, write: boolean) {
    const b = await this.db.selectFrom('SysBranch').select(['Code', 'IsAggregate', 'IsActive']).where('Code', '=', code).executeTakeFirst();
    if (!b) throw Errors.notFound(`Không có đơn vị cơ sở ${code}.`);
    if (b.IsAggregate) throw invalid('Đơn vị tổng hợp không có lịch làm việc. Chọn một đơn vị cơ sở cụ thể.');
    if (write && !b.IsActive) throw invalid(`Đơn vị cơ sở ${code} đang ngừng dùng.`);
    return b.Code;
  }

  /** Ngày đặc biệt của một ĐVCS trong năm */
  async workCalendarDays(branchCode: string, year: number) {
    const code = await this.calendarBranch(branchCode, false);
    const rows = await this.db
      .selectFrom('SysWorkCalendarDay as d')
      .innerJoin('SysWorkCalendar as c', 'c.Id', 'd.WorkCalendarId')
      .select(['d.Id', 'd.CalendarDate', 'd.DayType', 'd.Name'])
      .where('c.BranchCode', '=', code)
      .where(dateRef('d.CalendarDate'), '>=', `${year}-01-01`)
      .where(dateRef('d.CalendarDate'), '<=', `${year}-12-31`)
      .orderBy('d.CalendarDate')
      .execute();
    return rows.map((r) => ({ id: r.Id, date: dayOf(r.CalendarDate), dayType: r.DayType, name: r.Name }));
  }

  /**
   * Id lịch của ĐVCS; chưa có thì tạo theo lịch mặc định, cùng transaction với lần ghi. Không có nhật ký riêng: lịch tạo ngầm
   * mang đúng giá trị mặc định (như khi chưa có dòng), nhật ký của lần đặt ngày đi kèm đã ghi ĐVCS và Id lịch.
   */
  private async ensureCalendar(trx: Kysely<CoreDatabase>, actor: AuthUser, branchCode: string) {
    const has = await trx.selectFrom('SysWorkCalendar').select('Id').where('BranchCode', '=', branchCode).executeTakeFirst();
    if (has) return has.Id;
    const row = await trx
      .insertInto('SysWorkCalendar')
      .values({ BranchCode: branchCode, WeeklyOffMask: DEFAULT_WORK_CALENDAR.weeklyOffMask, ...this.offsetColumns(DEFAULT_WORK_CALENDAR), CreatedBy: actor.userId })
      .output('inserted.Id')
      .executeTakeFirstOrThrow();
    return row.Id;
  }

  /** Ngày nghỉ hằng tuần, số ngày cộng thêm của một ĐVCS; chưa có lịch thì tạo */
  async updateWorkCalendar(actor: AuthUser, branchCode: string, dto: WorkCalendarUpdateDto) {
    const code = await this.calendarBranch(branchCode, true);
    const mask = maskOf(dto.weeklyOffDays);
    if (mask >= 127) throw invalid('Phải còn ít nhất một ngày làm việc trong tuần.');
    if (!offsetsInOrder(dto)) {
      throw invalid('Số ngày cộng thêm làm ngày bắt đầu sau ngày kết thúc: Kết thúc ra chuyền phải cộng từ bằng Bắt đầu ra chuyền trở lên, và tổng của Kết thúc ra chuyền với Kết thúc nhập kho phải từ bằng tổng của hai ngày bắt đầu trở lên.');
    }
    await unique(
      () =>
        this.db.transaction().execute(async (trx) => {
          const before = await trx.selectFrom('SysWorkCalendar').selectAll().where('BranchCode', '=', code).executeTakeFirst();
          // Ngưỡng làm tròn không gửi (giao diện cũ): giữ số đang có, chưa có lịch thì mặc định
          const config: CalendarOffsets = {
            ...dto,
            productionRoundUpFrom: dto.productionRoundUpFrom ?? (before ? Number(before.ProductionRoundUpFrom) : DEFAULT_WORK_CALENDAR.productionRoundUpFrom),
          };
          const values = { WeeklyOffMask: mask, ...this.offsetColumns(config) };
          // Gửi lại đúng cấu hình đang có (bấm Lưu hai lần): không ghi, không thêm nhật ký
          if (before && (Object.keys(values) as (keyof typeof values)[]).every((k) => Number(before[k]) === values[k])) return;
          let id: number;
          if (before) {
            id = before.Id;
            await trx.updateTable('SysWorkCalendar').set({ ...values, ModifiedAt: new Date(), ModifiedBy: actor.userId }).where('Id', '=', id).execute();
          } else {
            id = (await trx.insertInto('SysWorkCalendar').values({ BranchCode: code, ...values, CreatedBy: actor.userId }).output('inserted.Id').executeTakeFirstOrThrow()).Id;
          }
          const old = before ? { weeklyOffDays: weekdaysOf(before.WeeklyOffMask), ...this.offsetsOfRow(before) } : undefined;
          await this.audit.logStrict(this.entry(actor, 'SysWorkCalendar', id, 'WORK_CALENDAR_UPDATE', old, { branchCode: code, weeklyOffDays: weekdaysOf(mask), ...offsetsOf(config) }), trx);
        }),
      'Lịch của đơn vị cơ sở này vừa được người khác tạo. Tải lại rồi thử lại.',
    );
    this.lookup.invalidateWorkCalendars();
  }

  private checkRange(from: string, to: string) {
    if (!calendarYearOk(from) || !calendarYearOk(to)) throw invalid('Ngày không có thật hoặc ngoài khoảng năm 2000–2100.');
    if (from > to) throw invalid('Ngày kết thúc phải từ ngày bắt đầu trở đi.');
    if (daySpan(from, to) > MAX_CALENDAR_RANGE_DAYS) throw invalid(`Mỗi lần đặt tối đa ${MAX_CALENDAR_RANGE_DAYS} ngày.`);
  }

  /**
   * Đặt ngày nghỉ hoặc làm bù cho mọi ngày trong khoảng, ở một hay nhiều ĐVCS (ĐVCS chưa có lịch thì tạo theo mặc định). Ngày đã
   * đặt trước đó trong khoảng được thay bằng loại, tên mới. Mỗi ĐVCS một dòng nhật ký (ngày cũ, khoảng mới).
   */
  async setWorkCalendarDays(actor: AuthUser, dto: WorkCalendarDaysDto) {
    this.checkRange(dto.from, dto.to);
    const codes: string[] = [];
    for (const c of dto.branchCodes) codes.push(await this.calendarBranch(c, true));
    const dates = Array.from({ length: daySpan(dto.from, dto.to) }, (_, i) => addCalendarDays(dto.from, i));
    const name = dto.name?.trim() || null;
    await unique(
      () =>
        this.db.transaction().execute(async (trx) => {
          for (const code of codes) {
            const id = await this.ensureCalendar(trx, actor, code);
            const old = await this.daysIn(trx, id, dto.from, dto.to);
            // Thay cả khoảng: không bảng nào tham chiếu dòng ngày đặc biệt, Id đổi không ảnh hưởng gì
            await trx.deleteFrom('SysWorkCalendarDay').where('WorkCalendarId', '=', id).where(dateRef('CalendarDate'), '>=', dto.from).where(dateRef('CalendarDate'), '<=', dto.to).execute();
            await trx
              .insertInto('SysWorkCalendarDay')
              .values(dates.map((date) => ({ WorkCalendarId: id, CalendarDate: date, DayType: dto.dayType, Name: name, CreatedBy: actor.userId })))
              .execute();
            const newValue = { branchCode: code, from: dto.from, to: dto.to, dayType: dto.dayType, name };
            await this.audit.logStrict(this.entry(actor, 'SysWorkCalendar', id, 'WORK_CALENDAR_DAYS_SET', old.length ? old : undefined, newValue), trx);
          }
        }),
      'Lịch của đơn vị cơ sở vừa được người khác sửa. Tải lại rồi thử lại.',
    );
    this.lookup.invalidateWorkCalendars();
    return { count: dates.length * codes.length };
  }

  private async daysIn(db: Kysely<CoreDatabase>, calendarId: number, from: string, to: string) {
    const rows = await db
      .selectFrom('SysWorkCalendarDay')
      .select(['CalendarDate', 'DayType', 'Name'])
      .where('WorkCalendarId', '=', calendarId)
      .where(dateRef('CalendarDate'), '>=', from)
      .where(dateRef('CalendarDate'), '<=', to)
      .orderBy('CalendarDate')
      .execute();
    return rows.map((d) => ({ date: dayOf(d.CalendarDate), dayType: d.DayType, name: d.Name }));
  }

  /** Xóa ngày đặc biệt trong khoảng của một ĐVCS (nhập nhầm, bỏ một đợt nghỉ) */
  async deleteWorkCalendarDays(actor: AuthUser, branchCode: string, from: string, to: string) {
    const code = await this.calendarBranch(branchCode, false);
    if (!calendarYearOk(from) || !calendarYearOk(to) || from > to) throw invalid('Khoảng ngày không hợp lệ.');
    if (daySpan(from, to) > MAX_DELETE_RANGE_DAYS) throw invalid(`Mỗi lần xóa tối đa ${MAX_DELETE_RANGE_DAYS} ngày.`);
    const cal = await this.db.selectFrom('SysWorkCalendar').select('Id').where('BranchCode', '=', code).executeTakeFirst();
    if (!cal) return { deleted: 0 };
    const deleted = await this.db.transaction().execute(async (trx) => {
      const old = await this.daysIn(trx, cal.Id, from, to);
      if (!old.length) return 0;
      await trx.deleteFrom('SysWorkCalendarDay').where('WorkCalendarId', '=', cal.Id).where(dateRef('CalendarDate'), '>=', from).where(dateRef('CalendarDate'), '<=', to).execute();
      await this.audit.logStrict(this.entry(actor, 'SysWorkCalendar', cal.Id, 'WORK_CALENDAR_DAYS_DELETE', old, { branchCode: code, from, to }), trx);
      return old.length;
    });
    if (deleted) this.lookup.invalidateWorkCalendars();
    return { deleted };
  }

  // ---------------- Danh mục chép từ BRAVO (chỉ xem) ----------------

  externalRows(code: string, page: number, pageSize: number, q?: string) {
    return this.sync.catalogRows(code, page, pageSize, q);
  }
}
