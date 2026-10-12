import { sql, type Kysely } from 'kysely';

/**
 * Phân bổ PO theo nhà máy: bảng chép osm.OSMData của nguồn đồng bộ OSM.OSMData (view gốc OSM v_OSMData, task 5.9.12). Module
 * Đơn hàng chép các dòng khác nhau của bảng này vào bảng làm việc MES_Order.PoAllocation sau mỗi đợt đồng bộ (task 5.10.2) và
 * màn Phân bổ PO đọc bảng đó; lớp đồng bộ chỉ còn cung cấp nguồn (chỉ đọc).
 */
export const OSM_PO_SOURCE = 'OSM.OSMData';

/** Một dòng khác nhau của bảng chép (view có dòng trùng nguyên dòng). Tên trường theo nghĩa; cột ngày của view là DATE */
export interface OsmPoSourceRow {
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
  /** FtyName của OSM */
  factoryName: string | null;
  /** Lần chép gần nhất có dòng này */
  syncedAt: Date | null;
}

/** Trường → cột của bảng chép (tên cột theo view OSM) */
const COLUMNS: [keyof OsmPoSourceRow, string][] = [
  ['brand', 'Brand'],
  ['season', 'Season'],
  ['po', 'PO'],
  ['so', 'SO'],
  ['shipMode', 'Ship mode'],
  ['styleName', 'StyleName'],
  ['styleNo', 'StyleNo'],
  ['color', 'Color'],
  ['etdActual', 'ETD-Actual'],
  ['etdRevised', 'ETD-REVISED'],
  ['factoryName', 'FtyName'],
];
const DATE_COLUMNS = new Set(['ETD-Actual', 'ETD-REVISED']);

/** Bảng chép đã có chưa (máy chưa chạy migration MES_Sync/0007 thì chưa) */
async function tableReady(sync: Kysely<any>) {
  const t = await sql<{ id: number | null }>`SELECT OBJECT_ID(N'osm.OSMData', N'U') AS id`.execute(sync);
  return t.rows[0]?.id != null;
}

/**
 * Mọi dòng khác nhau của bảng chép, cho bước làm mới bảng Phân bổ PO. Cột chữ gom theo phép so nhị phân (BIN2): hai dòng chỉ
 * khác chữ hoa, chữ thường là hai dòng, và lần đọc nào cũng ra đúng giá trị như nhau (gom theo collation không phân biệt hoa
 * thường thì SQL Server trả một biến thể bất kỳ, dấu dòng đổi qua lại giữa các lần làm mới). null: chưa có bảng chép.
 */
export async function readOsmPoSource(sync: Kysely<any>): Promise<OsmPoSourceRow[] | null> {
  if (!(await tableReady(sync))) return null;
  const key = (c: string) => (DATE_COLUMNS.has(c) ? sql.ref(c) : sql`${sql.ref(c)} COLLATE Latin1_General_BIN2`);
  const select = sql.join(COLUMNS.map(([f, c]) => sql`${key(c)} AS ${sql.ref(f)}`));
  const group = sql.join(COLUMNS.map(([, c]) => key(c)));
  const res = await sql<OsmPoSourceRow>`SELECT ${select}, MAX(SyncedAt) AS syncedAt FROM osm.[OSMData] GROUP BY ${group}`.execute(sync);
  return res.rows;
}

/**
 * Nguồn OSM.OSMData đang bật chưa: máy không khai database ứng dụng OSM (DB_OSM_APP_NAME) thì migrate tắt nguồn, màn Đồng bộ dữ
 * liệu không hiện nguồn này. Màn Phân bổ PO chưa có dữ liệu cần biết để không bảo người dùng đi chạy một nguồn họ không tìm thấy.
 */
export async function readOsmPoSourceActive(sync: Kysely<any>): Promise<boolean> {
  const r = await sql<{ IsActive: boolean }>`SELECT IsActive FROM dbo.SyncSource WHERE Code = ${OSM_PO_SOURCE}`.execute(sync);
  return !!r.rows[0]?.IsActive;
}
