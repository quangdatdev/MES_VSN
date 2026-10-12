import { Injectable } from '@nestjs/common';
import { sql, type RawBuilder } from 'kysely';
import { AppException, Errors } from '../../common/app.exception';
import { AuditService } from '../../platform/audit/audit.service';
import type { AuthUser } from '../../platform/auth/auth.types';
import { CatalogLookupService } from '../../platform/catalog/catalog-lookup.service';
import { allOf, assertFilterField, columnFilterWhere, parseColumnFilters, presentValues, VALUES_LIMIT, type FilterKind, type FilterSpec } from '../../platform/data/column-filter';
import { scopeOf } from '../../platform/data/base.repository';
import { ExportService } from '../../platform/export/export.service';
import { SourceFeedService } from '../../platform/feed/source-feed.service';
import { FieldPolicyService, MASK, type AccessLevel } from '../../platform/permission/field-policy.service';
import { PermissionService } from '../../platform/permission/permission.service';
import { PoAllocationFactoryDto, PoAllocationQuery, PoAllocationValuesQuery } from './order.dto';
import { escapeLike, day } from './order.util';
import { PoAllocationRepository, type PoAllocationListRow } from './po-allocation.repository';

const RESOURCE = 'order.poallocation';
/** Số dòng tối đa của một lần xuất file: cả bảng (khoảng 25.000 dòng) vẫn xuất được một lần */
export const PO_ALLOCATION_EXPORT_MAX = 50_000;

/** Trường JSON (trùng mã cột đăng ký ở SysResourceField của order.poallocation) → cột của bảng PoAllocation; branchCode là cột tính */
const COLUMNS = {
  brand: 'Brand',
  season: 'Season',
  po: 'PoNo',
  so: 'SoNo',
  shipMode: 'ShipMode',
  styleName: 'StyleName',
  styleNo: 'StyleNo',
  color: 'Color',
  etdActual: 'EtdActualDate',
  etdRevised: 'EtdRevisedDate',
  factoryName: 'ProductionFactoryCode',
  branchCode: null,
  osmFactoryName: 'OsmFactoryCode',
  isFactoryManual: 'IsFactoryManual',
  isInOsm: 'IsInOsm',
} as const;
type Field = keyof typeof COLUMNS;
const FIELDS = Object.keys(COLUMNS) as Field[];
/**
 * Trường suy ra từ Nhà máy SX: mức chính sách cột theo mức chặt hơn của chính nó và của Nhà máy SX (Nhà máy SX bị Ẩn thì không có,
 * bị Che thì cũng che), vì biết ĐVCS, nhà máy theo OSM, dấu nhập tay là đoán được phần nào Nhà máy SX.
 */
const FACTORY_DERIVED: Field[] = ['branchCode', 'osmFactoryName', 'isFactoryManual', 'isInOsm'];
const kindOf = (f: Field): FilterKind => (f === 'etdActual' || f === 'etdRevised' ? 'date' : f === 'isFactoryManual' || f === 'isInOsm' ? 'number' : 'text');
/**
 * Dữ liệu OSM không có ngày tạo: mặc định ETD-Revised mới nhất lên trước (100 dòng đầu, xem thêm thì sang trang). Cột đó bị Ẩn
 * hoặc Che thì lấy cột kế tiếp người xem được xem: xếp theo cột không được xem cũng làm lộ giá trị (review 5.1 #2).
 */
const SORT_PRIORITY: Field[] = ['etdRevised', 'etdActual', 'brand', 'season', 'po', 'so', 'shipMode', 'styleName', 'styleNo', 'color', 'factoryName', 'branchCode', 'osmFactoryName', 'isFactoryManual', 'isInOsm'];
const isDate = (f: Field) => f === 'etdRevised' || f === 'etdActual';

type Level = AccessLevel | undefined;
type Sort = { field: Field; dir: 'asc' | 'desc' };

/** ĐVCS của nhà máy theo danh mục: CASE theo mã (so theo collation của cột như danh mục); nhà máy chưa gắn ĐVCS thì trống */
function branchExpr(factories: { code: string; branchCode: string }[]): RawBuilder<unknown> {
  return factories.length
    ? sql`(CASE PoAllocation.ProductionFactoryCode ${sql.join(factories.map((f) => sql`WHEN ${f.code} THEN ${f.branchCode}`), sql` `)} END)`
    : sql`CAST(NULL AS VARCHAR(10))`;
}

/** Danh sách trắng lọc theo cột (ADR 0011): trường JSON → cột; ĐVCS theo bảng tra của danh mục lúc gọi */
function filterSpec(branch: RawBuilder<unknown>): FilterSpec {
  return Object.fromEntries(FIELDS.map((f) => [f, { expr: COLUMNS[f] ?? branch, kind: kindOf(f) }]));
}

/**
 * Trường JSON trùng mã cột đăng ký ở SysResourceField (order.poallocation) để chính sách cột áp đúng; `id`, `rowNo` không phải
 * cột (khóa dòng của lưới). Trường suy ra từ Nhà máy SX theo cả mức của Nhà máy SX (`factoryLevel`).
 */
function present(r: PoAllocationListRow, rowNo: number, factoryLevel: Level) {
  const out: Record<string, unknown> = {
    id: Number(r.Id),
    rowNo,
    brand: r.Brand,
    season: r.Season,
    po: r.PoNo,
    so: r.SoNo,
    shipMode: r.ShipMode,
    styleName: r.StyleName,
    styleNo: r.StyleNo,
    color: r.Color,
    etdActual: day(r.EtdActualDate),
    etdRevised: day(r.EtdRevisedDate),
    factoryName: r.ProductionFactoryCode,
  };
  if (factoryLevel !== 'HIDDEN') {
    const m = <T>(v: T) => (factoryLevel === 'MASKED' && v != null ? MASK : v);
    out.branchCode = m(r.BranchCode);
    out.osmFactoryName = m(r.OsmFactoryCode);
    out.isFactoryManual = m(!!r.IsFactoryManual);
    out.isInOsm = m(!!r.IsInOsm);
  }
  return out;
}

const EXPORT_COLUMNS = [
  { key: 'brand', label: 'Brand' },
  { key: 'season', label: 'Season' },
  { key: 'po', label: 'PO' },
  { key: 'so', label: 'SO' },
  { key: 'shipMode', label: 'Ship mode' },
  { key: 'styleName', label: 'Style name' },
  { key: 'styleNo', label: 'Style No' },
  { key: 'color', label: 'Màu' },
  { key: 'etdActual', label: 'ETD-Actual' },
  { key: 'etdRevised', label: 'ETD-Revised' },
  { key: 'factoryName', label: 'Nhà máy SX' },
  { key: 'branchName', label: 'Đơn vị cơ sở', field: 'branchCode' },
  { key: 'manualText', label: 'Nhập tay', field: 'isFactoryManual' },
  { key: 'osmFactoryName', label: 'Nhà máy SX theo OSM' },
];
/** Cột xuất file chỉ có khi xem được Nhà máy SX */
const FACTORY_EXPORT_KEYS = new Set(['branchName', 'manualText', 'osmFactoryName']);

const invalid = (msg: string) => new AppException('VALIDATION_FAILED', msg, 422);

/**
 * Màn "Phân bổ PO" (Quản trị đơn hàng): PO được phân cho nhà máy SX nào, theo OSM (view v_OSMData đã chép), đọc bảng làm việc
 * MES_Order.PoAllocation qua PoAllocationRepository (Phase 5.10). Dữ liệu dùng chung toàn công ty; cột Đơn vị cơ sở là ĐVCS quản lý
 * nhà máy SX theo danh mục. Nhà máy SX sửa tay được theo khóa SO, PO, Style No, Màu; bước làm mới theo OSM giữ giá trị nhập tay.
 */
@Injectable()
export class PoAllocationService {
  constructor(
    private readonly repo: PoAllocationRepository,
    private readonly feed: SourceFeedService,
    private readonly fields: FieldPolicyService,
    private readonly permissions: PermissionService,
    private readonly catalogs: CatalogLookupService,
    private readonly exporter: ExportService,
    private readonly audit: AuditService,
  ) {}

  /** Trường người dùng không được xem nguyên giá trị (Ẩn, Che), kể cả trường suy ra từ Nhà máy SX */
  private async blind(user: AuthUser): Promise<Set<Field>> {
    const blind = (await this.fields.unreadable(user, RESOURCE, FIELDS)) as Set<Field>;
    if (blind.has('factoryName')) for (const f of FACTORY_DERIVED) blind.add(f);
    return blind;
  }

  /** Mức của cột Nhà máy SX với người dùng (các trường suy ra đi theo) */
  private async factoryLevel(user: AuthUser): Promise<Level> {
    const { levels } = await this.fields.levels(await this.permissions.accessOf(user), RESOURCE);
    return levels.get('factoryName') as Level;
  }

  /** Bảng tra nhà máy → ĐVCS (nhà máy chưa gắn ĐVCS không có: cột Đơn vị cơ sở trống) */
  private async branchCase() {
    const factories = (await this.catalogs.productionFactories()).filter((f) => f.branchCode).map((f) => ({ code: f.code, branchCode: f.branchCode! }));
    return branchExpr(factories);
  }

  /**
   * Sắp xếp theo một trường của danh sách trắng mà người dùng xem được; không có thì theo cột mặc định đầu tiên xem được. Thứ tự
   * phụ theo các cột xem được (để phân trang ổn định, cuối cùng là Id), cột Ẩn/Che không quyết định thứ tự.
   */
  private sort(sort: string | undefined, blind: Set<Field>): Sort[] {
    const readable = SORT_PRIORITY.filter((f) => !blind.has(f));
    const [field, dir] = (sort ?? '').split(':') as [Field, string];
    const picked: Sort | null = readable.includes(field)
      ? { field, dir: dir === 'asc' ? 'asc' : 'desc' }
      : readable[0]
        ? { field: readable[0], dir: isDate(readable[0]) ? 'desc' : 'asc' }
        : null;
    if (!picked) return [];
    return [picked, ...readable.filter((f) => f !== picked.field).map((f) => ({ field: f, dir: 'asc' as const }))];
  }

  private orderBy(sort: Sort[], branch: RawBuilder<unknown>) {
    return sort.map((s) => ({ expr: COLUMNS[s.field] ? sql.ref(`PoAllocation.${COLUMNS[s.field]}`) : branch, dir: s.dir }));
  }

  /**
   * Điều kiện của dải lọc và lọc theo cột: `customer` là Brand, `season` là Season (chọn từ danh sách, so bằng), `style` tìm trong
   * Style No, Style name, `q` tìm trong PO, SO (ô tìm của repository). Bỏ phần lọc, tìm theo trường người dùng không được xem nguyên
   * giá trị (lọc rồi xem còn dòng nào là dò ra giá trị, review 5.1 lượt 2 N3). `except`: cột đang mở popup lọc.
   */
  private criteria(q: PoAllocationQuery, blind: Set<Field>, branch: RawBuilder<unknown>, except?: string) {
    const spec = filterSpec(branch);
    const filters = parseColumnFilters(q.cf, spec).filter((f) => !blind.has(f.field as Field));
    const customer = q.customer?.trim();
    const season = q.season?.trim();
    const style = q.style?.trim();
    const styleCols = (['styleNo', 'styleName'] as const).filter((f) => !blind.has(f)).map((f) => COLUMNS[f]);
    const where = allOf(
      customer && !blind.has('brand') ? (qb) => qb.where('Brand', '=', customer) : null,
      season && !blind.has('season') ? (qb) => qb.where('Season', '=', season) : null,
      style && styleCols.length ? (qb) => qb.where((eb: any) => eb.or(styleCols.map((c) => eb(c, 'like', escapeLike(style))))) : null,
      columnFilterWhere(filters, spec, except),
    );
    const searchExclude = (['po', 'so'] as const).filter((f) => blind.has(f)).map((f) => COLUMNS[f]);
    return { q: q.q, where, searchExclude, spec };
  }

  async list(user: AuthUser, q: PoAllocationQuery) {
    const scope = scopeOf(user);
    const [blind, factoryLevel, branch] = await Promise.all([this.blind(user), this.factoryLevel(user), this.branchCase()]);
    const c = this.criteria(q, blind, branch);
    const [page, syncedAt] = await Promise.all([
      this.repo.list(scope, { page: q.page, pageSize: q.pageSize, q: c.q, where: c.where, searchExclude: c.searchExclude, select: () => [branch.as('BranchCode')], orderBy: this.orderBy(this.sort(q.sort, blind), branch) }),
      this.repo.lastSyncedAt(scope),
    ]);
    const offset = (page.page - 1) * page.pageSize;
    return {
      items: (page.items as PoAllocationListRow[]).map((r, i) => present(r, offset + i + 1, factoryLevel)),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
      /** Lần chép OSM gần nhất có trong bảng; null: chưa đồng bộ, chưa làm mới lần nào */
      syncedAt,
      /** Nguồn đồng bộ đang bật; false: máy chủ chưa khai database OSM của nguồn này (chỉ hỏi khi bảng chưa có dòng nào) */
      sourceActive: syncedAt ? true : await this.sourceActive(),
    };
  }

  /** Máy chưa có MES_Sync cũng mở được màn (dữ liệu ở MES_Order): coi như nguồn chưa bật */
  private async sourceActive(): Promise<boolean> {
    try {
      return await this.feed.osmPoSourceActive();
    } catch (e) {
      if (e instanceof AppException && e.code === 'SYNC_NOT_READY') return false;
      throw e;
    }
  }

  /** Giá trị của một cột cho popup lọc theo cột, theo các bộ lọc khác đang áp */
  async values(user: AuthUser, q: PoAllocationValuesQuery) {
    const branch = await this.branchCase();
    const col = await assertFilterField(this.fields, user, RESOURCE, filterSpec(branch), q.field);
    const blind = await this.blind(user);
    if (blind.has(q.field as Field)) throw new AppException('FIELD_NOT_READABLE', 'Bạn không được xem nguyên giá trị của cột này nên không lọc theo cột này được.', 403);
    const c = this.criteria(q, blind, branch, q.field);
    const res = await this.repo.distinctValues(scopeOf(user), col, { q: c.q, where: c.where, searchExclude: c.searchExclude, search: q.search, limit: VALUES_LIMIT });
    return { values: presentValues(res.rows, col.kind), truncated: res.truncated };
  }

  /**
   * Gợi ý cho ô chọn Brand, Season và danh sách nhà máy SX đang dùng (popup Đổi nhà máy SX, gom theo ĐVCS). Mảng chuỗi không đi
   * qua chính sách cột được nên cột Ẩn hoặc Che trả rỗng tại đây.
   */
  async options(user: AuthUser) {
    const scope = scopeOf(user);
    const blind = await this.blind(user);
    const [brands, seasons, factories] = await Promise.all([
      blind.has('brand') ? [] : this.repo.distinct(scope, 'Brand'),
      blind.has('season') ? [] : this.repo.distinct(scope, 'Season'),
      blind.has('factoryName') ? [] : this.catalogs.productionFactories(),
    ]);
    return { brands, seasons, factories: factories.filter((f) => f.isActive).map((f) => ({ code: f.code, name: f.name, branchCode: f.branchCode })) };
  }

  async export(user: AuthUser, q: PoAllocationQuery) {
    const scope = scopeOf(user);
    const [blind, factoryLevel, branch, names] = await Promise.all([this.blind(user), this.factoryLevel(user), this.branchCase(), this.catalogs.branchNames()]);
    const c = this.criteria(q, blind, branch);
    const opts = { q: c.q, where: c.where, searchExclude: c.searchExclude };
    const total = await this.repo.countFor(scope, opts, 'export');
    if (total > PO_ALLOCATION_EXPORT_MAX) {
      throw invalid(`Có ${total.toLocaleString('vi-VN')} dòng, xuất tối đa ${PO_ALLOCATION_EXPORT_MAX.toLocaleString('vi-VN')} dòng một lần. Lọc bớt rồi xuất lại.`);
    }
    const rows = (await this.repo.listAll(scope, { ...opts, select: () => [branch.as('BranchCode')], orderBy: this.orderBy(this.sort(q.sort, blind), branch), maxRows: PO_ALLOCATION_EXPORT_MAX })) as PoAllocationListRow[];
    const items = rows.map((r, i) => {
      const o = present(r, i + 1, factoryLevel);
      const code = o.branchCode as string | null | undefined;
      const manual = o.isFactoryManual;
      return {
        ...o,
        branchName: code == null ? null : code === MASK ? MASK : (names.get(code) ?? code),
        manualText: manual == null ? null : manual === MASK ? MASK : manual ? (o.isInOsm === false ? 'Nhập tay, không còn trong OSM' : 'Nhập tay') : null,
      };
    });
    const columns = factoryLevel === 'HIDDEN' ? EXPORT_COLUMNS.filter((col) => !FACTORY_EXPORT_KEYS.has(col.key)) : EXPORT_COLUMNS;
    return this.exporter.csv(user, RESOURCE, columns, items, 'phan-bo-po.csv');
  }

  /**
   * Nhà máy mới phải là nhà máy đang dùng của danh mục (ĐVCS nào cũng được, quyết định 5.10 Q2); so không phân biệt hoa thường như
   * collation, lưu đúng mã của danh mục.
   */
  private async factoryCode(name: string): Promise<string> {
    const f = (await this.catalogs.productionFactories()).find((x) => x.isActive && x.code.toUpperCase() === name.toUpperCase());
    if (!f) throw invalid(`Nhà máy SX "${name}" không có trong danh mục Nhà máy SX hoặc đã ngừng dùng.`);
    return f.code;
  }

  /**
   * Đổi Nhà máy SX (task 5.10.4): `ids` là dòng đang thấy; máy chủ đổi thành khóa SO, PO, Style No, Màu và áp cho mọi dòng cùng
   * khóa (quyết định 5.10 Q5). `factoryName` null là "Theo OSM": bỏ nhập tay. `dryRun`: chỉ trả số dòng, số khóa sẽ bị áp, không
   * ghi. Luật ĐVCS (Q2) do PoAllocationRepository (BaseRepository, factoryBranchWrite) dựng; đơn vị tổng hợp bị từ chối.
   */
  async setFactory(user: AuthUser, dto: PoAllocationFactoryDto) {
    const scope = scopeOf(user);
    await this.repo.assertWritable(scope);
    const ids = [...new Set(dto.ids)];
    const factory = dto.factoryName === undefined ? undefined : dto.factoryName === null ? null : await this.factoryCode(dto.factoryName);
    if (factory === undefined && !dto.dryRun) throw invalid('Chọn nhà máy SX, hoặc "Theo OSM" để bỏ nhập tay.');
    const result = await this.repo.withWriteLock(async (trx) => {
      const t = await this.repo.target(scope, ids, trx);
      if (t.found < ids.length) throw Errors.notFound('Có dòng đã chọn không còn trong Phân bổ PO (dữ liệu vừa được làm mới theo OSM). Tải lại trang rồi chọn lại.');
      if (t.otherBranch > 0) throw Errors.factoryOfOtherBranch(t.otherBranch, t.rows);
      // Mọi dòng xem được đều phải ghi được: không ghi một phần nhóm
      if (t.writable < t.rows) throw Errors.scopeDenied();
      if (dto.dryRun || factory === undefined) return { rows: t.rows, keys: t.keys, removed: 0, groups: t.groups, written: false };
      const done = factory === null ? await this.repo.resetToOsm(scope, ids, trx) : { updated: await this.repo.setManual(scope, ids, factory, trx), removed: 0 };
      if (done.updated + done.removed !== t.rows) throw Errors.conflict('Dữ liệu Phân bổ PO vừa đổi. Tải lại trang rồi thử lại.');
      return { rows: t.rows, keys: t.keys, removed: done.removed, groups: t.groups, written: true };
    });
    if (result.written) {
      await this.audit.log({
        userId: user.userId,
        username: user.username,
        branchCode: user.branchCode,
        entityType: 'PoAllocation',
        actionCode: 'PO_ALLOCATION_FACTORY',
        oldValue: {
          groups: result.groups.map((g) => ({ po: g.PoNo, so: g.SoNo, styleNo: g.StyleNo, color: g.Color, factory: g.ProductionFactoryCode, manual: !!g.IsFactoryManual, rows: Number(g.n) })),
        },
        newValue: { factory, manual: factory !== null, rows: result.rows, keys: result.keys, removed: result.removed },
      });
    }
    return { rows: result.rows, keys: result.keys, removed: result.removed, dryRun: !result.written };
  }
}
