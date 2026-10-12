import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/app.exception';
import type { AuthUser } from '../../platform/auth/auth.types';
import { CatalogLookupService } from '../../platform/catalog/catalog-lookup.service';
import { assertFilterField, parseColumnFilters, presentValues, VALUES_LIMIT } from '../../platform/data/column-filter';
import { ExportService } from '../../platform/export/export.service';
import { OSM_PO_FIELDS, OSM_PO_FILTER, SourceFeedService, type OsmPoCriteria, type OsmPoField, type OsmPoRow, type OsmPoSort } from '../../platform/feed/source-feed.service';
import { FieldPolicyService, MASK, type AccessLevel } from '../../platform/permission/field-policy.service';
import { PermissionService } from '../../platform/permission/permission.service';
import { PoAllocationQuery, PoAllocationValuesQuery } from './order.dto';
import { day } from './order.util';

const RESOURCE = 'order.poallocation';
/**
 * Dữ liệu OSM không có ngày tạo: mặc định ETD-Revised mới nhất lên trước (100 dòng đầu, xem thêm thì sang trang). Cột đó bị Ẩn
 * hoặc Che thì lấy cột kế tiếp người xem được xem: xếp theo cột không được xem cũng làm lộ giá trị (review 5.1 #2).
 */
const SORT_PRIORITY: OsmPoField[] = [...new Set<OsmPoField>(['etdRevised', 'etdActual', ...OSM_PO_FIELDS])];
const isDate = (f: OsmPoField) => f === 'etdRevised' || f === 'etdActual';

type Level = AccessLevel | undefined;

/**
 * Trường JSON trùng mã cột đăng ký ở SysResourceField (order.poallocation) để chính sách cột áp đúng. Đơn vị cơ sở suy ra từ
 * Nhà máy SX nên theo cả mức của Nhà máy SX (`factoryLevel`): Nhà máy SX bị Ẩn thì không có ĐVCS, bị Che thì ĐVCS cũng bị che.
 */
function present(r: OsmPoRow, rowNo: number, factoryLevel: Level) {
  const out: Record<string, unknown> = {
    rowNo,
    brand: r.brand,
    season: r.season,
    po: r.po,
    so: r.so,
    shipMode: r.shipMode,
    styleName: r.styleName,
    styleNo: r.styleNo,
    color: r.color,
    etdActual: day(r.etdActual),
    etdRevised: day(r.etdRevised),
    factoryName: r.factoryName,
  };
  if (factoryLevel !== 'HIDDEN') out.branchCode = factoryLevel === 'MASKED' && r.branchCode != null ? MASK : r.branchCode;
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
];

/**
 * Màn "Phân bổ PO" (Quản trị đơn hàng): phân bổ PO theo nhà máy SX lấy từ view OSM v_OSMData đã chép vào MES_Sync (task 5.9.12),
 * đọc qua cổng SourceFeedService (ADR 0007), chỉ xem. Dữ liệu dùng chung toàn công ty, không lọc ĐVCS; cột Đơn vị cơ sở là ĐVCS
 * quản lý nhà máy SX theo danh mục Nhà máy SX.
 */
@Injectable()
export class PoAllocationService {
  constructor(
    private readonly feed: SourceFeedService,
    private readonly fields: FieldPolicyService,
    private readonly permissions: PermissionService,
    private readonly catalogs: CatalogLookupService,
    private readonly exporter: ExportService,
  ) {}

  /** Trường người dùng không được xem nguyên giá trị (Ẩn, Che). ĐVCS suy ra từ Nhà máy SX nên cũng tính là không xem được */
  private async blind(user: AuthUser): Promise<Set<OsmPoField>> {
    const blind = (await this.fields.unreadable(user, RESOURCE, OSM_PO_FIELDS)) as Set<OsmPoField>;
    if (blind.has('factoryName')) blind.add('branchCode');
    return blind;
  }

  /** Mức của cột Nhà máy SX với người dùng (ĐVCS đi theo) */
  private async factoryLevel(user: AuthUser): Promise<Level> {
    const { levels } = await this.fields.levels(await this.permissions.accessOf(user), RESOURCE);
    return levels.get('factoryName') as Level;
  }

  /**
   * Sắp xếp theo một trường của danh sách trắng mà người dùng xem được; không có thì theo cột mặc định đầu tiên xem được. Thứ tự
   * phụ theo các cột xem được trước, cột Ẩn/Che chỉ đứng cuối (để phân trang ổn định) nên không quyết định thứ tự giữa các dòng
   * khác nhau ở phần người xem thấy.
   */
  private sort(sort: string | undefined, blind: Set<OsmPoField>): OsmPoSort[] {
    const readable = SORT_PRIORITY.filter((f) => !blind.has(f));
    const [field, dir] = (sort ?? '').split(':') as [OsmPoField, string];
    const picked: OsmPoSort | null = readable.includes(field)
      ? { field, dir: dir === 'asc' ? 'asc' : 'desc' }
      : readable[0]
        ? { field: readable[0], dir: isDate(readable[0]) ? 'desc' : 'asc' }
        : null;
    if (!picked) return [];
    return [picked, ...readable.filter((f) => f !== picked.field).map((f) => ({ field: f, dir: 'asc' as const }))];
  }

  /**
   * Điều kiện của dải lọc và lọc theo cột: `customer` là Brand, `season` là Season (chọn từ danh sách, so bằng), `style` tìm
   * trong StyleNo, StyleName, `q` tìm trong PO, SO. Bỏ phần lọc, tìm theo trường người dùng không được xem nguyên giá trị (lọc
   * rồi xem còn dòng nào là dò ra giá trị, review 5.1 lượt 2 N3).
   */
  private async criteria(q: PoAllocationQuery, blind: Set<OsmPoField>): Promise<OsmPoCriteria> {
    const readable = (fs: OsmPoField[]) => fs.filter((f) => !blind.has(f));
    const equals: OsmPoCriteria['equals'] = [];
    if (q.customer?.trim() && !blind.has('brand')) equals.push({ field: 'brand', value: q.customer.trim() });
    if (q.season?.trim() && !blind.has('season')) equals.push({ field: 'season', value: q.season.trim() });
    const contains: OsmPoCriteria['contains'] = [];
    for (const [text, fs] of [
      [q.style, readable(['styleNo', 'styleName'])],
      [q.q, readable(['po', 'so'])],
    ] as const) {
      if (text?.trim() && fs.length) contains.push({ text: text.trim(), fields: [...fs] });
    }
    const filters = parseColumnFilters(q.cf, OSM_PO_FILTER).filter((f) => !blind.has(f.field as OsmPoField));
    // Nhà máy chưa gắn ĐVCS không có trong bảng tra: cột Đơn vị cơ sở trống
    const factoryBranches = (await this.catalogs.productionFactories()).filter((f) => f.branchCode).map((f) => ({ code: f.code, branchCode: f.branchCode! }));
    return { factoryBranches, filters, equals, contains };
  }

  async list(user: AuthUser, q: PoAllocationQuery) {
    const blind = await this.blind(user);
    const [page, factoryLevel] = await Promise.all([this.feed.osmPoPage(await this.criteria(q, blind), q.page, q.pageSize, this.sort(q.sort, blind)), this.factoryLevel(user)]);
    const offset = (page.page - 1) * page.pageSize;
    return {
      items: page.rows.map((r, i) => present(r, offset + i + 1, factoryLevel)),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
      /** Lần đồng bộ gần nhất của nguồn OSM này; null: chưa đồng bộ lần nào */
      syncedAt: page.syncedAt,
      /** Nguồn đồng bộ đang bật; false: máy chủ chưa khai database OSM của nguồn này */
      sourceActive: page.sourceActive,
    };
  }

  /** Giá trị của một cột cho popup lọc theo cột, theo các bộ lọc khác đang áp */
  async values(user: AuthUser, q: PoAllocationValuesQuery) {
    const col = await assertFilterField(this.fields, user, RESOURCE, OSM_PO_FILTER, q.field);
    const blind = await this.blind(user);
    if (blind.has(q.field as OsmPoField)) throw new AppException('FIELD_NOT_READABLE', 'Bạn không được xem nguyên giá trị của cột này nên không lọc theo cột này được.', 403);
    const res = await this.feed.osmPoValues(await this.criteria(q, blind), q.field as OsmPoField, q.search, VALUES_LIMIT);
    return { values: presentValues(res.rows, col.kind), truncated: res.truncated };
  }

  /** Gợi ý cho ô chọn Brand, Season. Mảng chuỗi không đi qua chính sách cột được nên cột Ẩn hoặc Che trả rỗng tại đây */
  async options(user: AuthUser) {
    const blind = await this.fields.unreadable(user, RESOURCE, ['brand', 'season']);
    const { brands, seasons } = await this.feed.osmPoOptions();
    return { brands: blind.has('brand') ? [] : brands, seasons: blind.has('season') ? [] : seasons };
  }

  async export(user: AuthUser, q: PoAllocationQuery) {
    const blind = await this.blind(user);
    const [rows, factoryLevel, names] = await Promise.all([
      this.feed.osmPoAll(await this.criteria(q, blind), this.sort(q.sort, blind)),
      this.factoryLevel(user),
      this.catalogs.branchNames(),
    ]);
    const items = rows.map((r, i) => {
      const o = present(r, i + 1, factoryLevel);
      const code = o.branchCode as string | null | undefined;
      return { ...o, branchName: code == null ? null : code === MASK ? MASK : (names.get(code) ?? code) };
    });
    const columns = factoryLevel === 'HIDDEN' ? EXPORT_COLUMNS.filter((c) => c.key !== 'branchName') : EXPORT_COLUMNS;
    return this.exporter.csv(user, RESOURCE, columns, items, 'phan-bo-po.csv');
  }
}
