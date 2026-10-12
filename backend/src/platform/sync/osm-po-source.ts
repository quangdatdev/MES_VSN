import { sql, type ExpressionBuilder, type Kysely, type SelectQueryBuilder, type SqlBool } from 'kysely';
import { AppException } from '../../common/app.exception';
import { columnFilterWhere, newestFirst, valueExpr, valueSearch, type ColumnFilter, type FilterKind, type FilterSpec } from '../data/column-filter';

/**
 * Phân bổ PO theo nhà máy: bảng chép osm.OSMData của nguồn đồng bộ OSM.OSMData (view gốc OSM v_OSMData, task 5.9.12).
 *
 * Trường JSON của một dòng phân bổ PO → cột của bảng chép osm.OSMData (tên cột theo view OSM). `branchCode`: ĐVCS quản lý nhà
 * máy SX, tra từ danh mục Nhà máy SX (MES_Core) do bên gọi truyền vào, không có trong bảng chép.
 */
const COLUMNS = {
  brand: 'Brand',
  season: 'Season',
  po: 'PO',
  so: 'SO',
  shipMode: 'Ship mode',
  styleName: 'StyleName',
  styleNo: 'StyleNo',
  color: 'Color',
  etdActual: 'ETD-Actual',
  etdRevised: 'ETD-REVISED',
  factoryName: 'FtyName',
  branchCode: 'BranchCode',
} as const;
export type OsmPoField = keyof typeof COLUMNS;
export const OSM_PO_FIELDS = Object.keys(COLUMNS) as OsmPoField[];
const SOURCE_COLUMNS = OSM_PO_FIELDS.filter((f) => f !== 'branchCode').map((f) => COLUMNS[f]);
const kindOf = (f: OsmPoField): FilterKind => (f === 'etdActual' || f === 'etdRevised' ? 'date' : 'text');

/** Danh sách trắng lọc theo cột (ADR 0011): trường JSON → cột của tập dòng phân bổ PO */
export const OSM_PO_FILTER: FilterSpec = Object.fromEntries(OSM_PO_FIELDS.map((f) => [f, { expr: COLUMNS[f], kind: kindOf(f) }]));

/** Một dòng phân bổ PO theo OSM. Dòng trùng nguyên dòng của view chỉ tính một lần */
export interface OsmPoRow {
  brand: string | null;
  season: string | null;
  po: string | null;
  so: string | null;
  shipMode: string | null;
  styleName: string | null;
  styleNo: string | null;
  color: string | null;
  etdActual: Date | null;
  etdRevised: Date | null;
  factoryName: string | null;
  branchCode: string | null;
}

/** Điều kiện trên tập dòng phân bổ PO. Bên gọi đã bỏ trường người dùng không được xem nguyên giá trị */
export interface OsmPoCriteria {
  /** Nhà máy SX (mã danh mục, là tên theo OSM) → ĐVCS. Nhà máy không có ở đây (chưa gắn ĐVCS, chưa vào danh mục): ĐVCS trống */
  factoryBranches: { code: string; branchCode: string }[];
  /** Bộ lọc theo cột, đã kiểm theo OSM_PO_FILTER */
  filters: ColumnFilter[];
  /** Cột đang mở popup lọc: không lọc theo chính nó */
  except?: string;
  /** Bằng đúng giá trị (ô chọn ở dải lọc) */
  equals?: { field: OsmPoField; value: string }[];
  /** Chứa chữ ở ít nhất một trong các trường (ô gõ ở dải lọc) */
  contains?: { text: string; fields: OsmPoField[] }[];
}

export interface OsmPoSort {
  field: OsmPoField;
  dir: 'asc' | 'desc';
}

/** Số dòng tối đa của một lần xuất file: cả bảng chép (khoảng 25.000 dòng sau khi bỏ dòng trùng) vẫn xuất được một lần */
export const OSM_PO_EXPORT_MAX = 50_000;
const MAX_PAGE_SIZE = 200;
const escapeLike = (s: string) => `%${s.replace(/[%_[]/g, (c) => `[${c}]`)}%`;

/** Bảng chép đã có chưa (máy chưa chạy migration MES_Sync/0007 thì chưa) */
async function tableReady(sync: Kysely<any>) {
  const t = await sql<{ id: number | null }>`SELECT OBJECT_ID(N'osm.OSMData', N'U') AS id`.execute(sync);
  return t.rows[0]?.id != null;
}

/**
 * Tập dòng phân bổ PO: các dòng khác nhau của bảng chép (view có dòng trùng nguyên dòng), kèm ĐVCS của nhà máy SX. Mã nhà máy
 * đi qua tham số; so với FtyName theo collation của cột (không phân biệt hoa thường, bỏ khoảng trắng cuối như danh mục).
 */
function rowsOf(sync: Kysely<any>, c: OsmPoCriteria): SelectQueryBuilder<any, any, object> {
  const branch = c.factoryBranches.length
    ? sql`CASE d.[FtyName] ${sql.join(c.factoryBranches.map((f) => sql`WHEN ${f.code} THEN ${f.branchCode}`), sql` `)} END`
    : sql`CAST(NULL AS NVARCHAR(10))`;
  const cols = sql.join(SOURCE_COLUMNS.map((n) => sql.ref(n)));
  const x = sql`(SELECT d.*, ${branch} AS [BranchCode] FROM (SELECT DISTINCT ${cols} FROM osm.[OSMData]) d)`.as('x');
  let qb = sync.selectFrom(x) as SelectQueryBuilder<any, any, object>;
  for (const e of c.equals ?? []) qb = qb.where(sql.ref(COLUMNS[e.field]), '=', e.value);
  for (const t of c.contains ?? []) {
    if (!t.fields.length) {
      qb = qb.where(sql<SqlBool>`1 = 0`);
      continue;
    }
    const like = escapeLike(t.text);
    qb = qb.where((eb: ExpressionBuilder<any, any>) => eb.or(t.fields.map((f) => eb(sql.ref(COLUMNS[f]), 'like', like))));
  }
  return columnFilterWhere(c.filters, OSM_PO_FILTER, c.except)(qb);
}

/** Thứ tự đầy đủ: theo `sort` rồi mọi cột còn lại, để phân trang ổn định (dòng đã bỏ trùng nên không có hai dòng cùng thứ tự) */
function ordered(qb: SelectQueryBuilder<any, any, object>, sort: OsmPoSort[]) {
  const seen = new Set<OsmPoField>();
  let out = qb.selectAll();
  for (const s of [...sort, ...OSM_PO_FIELDS.map((field) => ({ field, dir: 'asc' as const }))]) {
    if (seen.has(s.field)) continue;
    seen.add(s.field);
    out = out.orderBy(sql.ref(COLUMNS[s.field]), s.dir);
  }
  return out;
}

const present = (r: Record<string, unknown>): OsmPoRow => {
  const out = {} as Record<OsmPoField, unknown>;
  for (const f of OSM_PO_FIELDS) out[f] = r[COLUMNS[f]] ?? null;
  return out as unknown as OsmPoRow;
};

/** Lần chép gần nhất của bảng chép; null khi chưa có bảng hoặc chưa đồng bộ lần nào */
async function lastSynced(sync: Kysely<any>): Promise<Date | null> {
  const r = await sql<{ at: Date | null }>`SELECT MAX(SyncedAt) AS at FROM osm.[OSMData]`.execute(sync);
  return r.rows[0]?.at ?? null;
}

/**
 * Nguồn OSM.OSMData đang bật chưa: máy không khai database ứng dụng OSM (DB_OSM_APP_NAME) thì migrate tắt nguồn, màn Đồng bộ dữ
 * liệu không hiện nguồn này. Màn hình cần biết để không bảo người dùng đi chạy một nguồn họ không tìm thấy.
 */
async function sourceActive(sync: Kysely<any>): Promise<boolean> {
  const r = await sql<{ IsActive: boolean }>`SELECT IsActive FROM dbo.SyncSource WHERE Code = N'OSM.OSMData'`.execute(sync);
  return !!r.rows[0]?.IsActive;
}

/** Một trang phân bổ PO (chỉ đọc). Chưa có bảng chép, chưa đồng bộ thì trang rỗng, `syncedAt` null */
export async function readOsmPoPage(sync: Kysely<any>, c: OsmPoCriteria, page: number, pageSize: number, sort: OsmPoSort[]) {
  const size = Math.min(Math.max(1, Math.trunc(pageSize) || 1), MAX_PAGE_SIZE);
  const at = Math.max(1, Math.trunc(page) || 1);
  if (!(await tableReady(sync))) return { total: 0, page: at, pageSize: size, rows: [] as OsmPoRow[], syncedAt: null, sourceActive: false };
  const [count, rows, syncedAt] = await Promise.all([
    rowsOf(sync, c).select(sql<number>`COUNT(*)`.as('n')).executeTakeFirstOrThrow(),
    ordered(rowsOf(sync, c), sort).offset((at - 1) * size).fetch(size).execute(),
    lastSynced(sync),
  ]);
  // Đã có dữ liệu thì chắc chắn nguồn từng chạy; chỉ hỏi lại khi chưa đồng bộ lần nào
  return { total: Number(count.n), page: at, pageSize: size, rows: rows.map(present), syncedAt, sourceActive: syncedAt ? true : await sourceActive(sync) };
}

/** Các giá trị khác nhau của một trường cho popup lọc theo cột, theo các điều kiện khác đang áp; lấy thêm một để biết còn nữa */
export async function readOsmPoValues(sync: Kysely<any>, c: OsmPoCriteria, field: OsmPoField, search: string | undefined, limit: number) {
  if (!(await tableReady(sync))) return { rows: [] as unknown[], truncated: false };
  const col = OSM_PO_FILTER[field];
  let qb = rowsOf(sync, { ...c, except: field });
  const s = valueSearch(col, search);
  if (s) qb = qb.where(s);
  const rows = (await qb
    .select(valueExpr(col).as('v'))
    .distinct()
    .orderBy('v', newestFirst(col) ? 'desc' : 'asc')
    .offset(0)
    .fetch(limit + 1)
    .execute()) as { v: unknown }[];
  return { rows: rows.slice(0, limit).map((r) => r.v), truncated: rows.length > limit };
}

/** Mọi dòng khớp điều kiện, cho xuất file. Quá OSM_PO_EXPORT_MAX dòng thì báo người dùng lọc bớt, không cắt ngầm */
export async function readOsmPoAll(sync: Kysely<any>, c: OsmPoCriteria, sort: OsmPoSort[]): Promise<OsmPoRow[]> {
  if (!(await tableReady(sync))) return [];
  const count = await rowsOf(sync, c).select(sql<number>`COUNT(*)`.as('n')).executeTakeFirstOrThrow();
  if (Number(count.n) > OSM_PO_EXPORT_MAX) {
    throw new AppException('VALIDATION_FAILED', `Có ${Number(count.n).toLocaleString('vi-VN')} dòng, xuất tối đa ${OSM_PO_EXPORT_MAX.toLocaleString('vi-VN')} dòng một lần. Lọc bớt rồi xuất lại.`, 422);
  }
  const rows = await ordered(rowsOf(sync, c), sort).offset(0).fetch(OSM_PO_EXPORT_MAX).execute();
  return rows.map(present);
}

/** Các giá trị đang có của một trường, cho ô chọn ở dải lọc (Brand, Season) */
export async function readOsmPoDistinct(sync: Kysely<any>, field: 'brand' | 'season'): Promise<string[]> {
  if (!(await tableReady(sync))) return [];
  const col = sql.ref(COLUMNS[field]);
  const rows = await sql<{ v: string }>`SELECT DISTINCT ${col} AS v FROM osm.[OSMData] WHERE ${col} IS NOT NULL AND ${col} <> N'' ORDER BY v`.execute(sync);
  return rows.rows.map((r) => r.v);
}
