import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { sql, type Updateable } from 'kysely';
import { AppException, Errors } from '../../common/app.exception';
import { sqlErrorNumbers } from '../../common/db-errors';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import type { SysCatalogItemTable, SysProductionFactoryTable, SysShiftTable } from '../database/core.types';
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
} from './catalog.dto';

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
    const [catalogs, shifts, factories, branches] = await Promise.all([
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

  // ---------------- Danh mục chép từ BRAVO (chỉ xem) ----------------

  externalRows(code: string, page: number, pageSize: number, q?: string) {
    return this.sync.catalogRows(code, page, pageSize, q);
  }
}
