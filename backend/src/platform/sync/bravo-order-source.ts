import { sql, type Kysely } from 'kysely';

/** Một sản phẩm đơn hàng BRAVO (DM_SanPhamDonHang): mỗi sản phẩm thành một đơn hàng MES */
export interface SourceOrder {
  ProductId: number;
  BranchCode: string;
  Name: string | null;
  StyleName: string | null;
  ProductName: string | null;
  Unit: string | null;
  Qty: number | null;
  EndDatePrice: Date | null;
  ProductionTypeCode: string | null;
  SyncedAt: Date;
  Customer: string | null;
  Season: string | null;
  Staff: string | null;
  PoProductId: number | null;
}

/** Một PO (ThongTinPO) đã gộp các dòng giao cùng số PO */
export interface SourcePo {
  ProductId: number;
  CustomerPONo: string;
  Etd: Date;
  SyncedAt: Date;
  Destination: string | null;
}

/** Một ô màu × cỡ của PO (ThongTinPO_MauCo), đã cộng các dòng trùng */
export interface SourceCell {
  ProductId: number;
  CustomerPONo: string;
  ColorId: number;
  ColorName: string | null;
  ColorCode: string | null;
  SizeCode: string;
  SizeType: string | null;
  Qty: number;
  ColorStt: number | null;
  SizeStt: number | null;
  /** Lần chép gần nhất của các dòng gộp vào ô này */
  SyncedAt?: Date | null;
}

export interface BravoOrderSource {
  orders: SourceOrder[];
  pos: SourcePo[];
  cells: SourceCell[];
}

/**
 * Nguồn đồng bộ mà bước nạp đơn hàng đọc tới (bảng trong câu đọc dưới đây): một trong các nguồn này chép xong thì nạp lại.
 * Thêm bảng vào câu đọc thì thêm mã nguồn ở đây.
 */
export const BRAVO_ORDER_SOURCE_CODES = [
  'BRAVO.DM_CHINHANH',
  'BRAVO.DM_SanPhamDonHang',
  'BRAVO.ThongTinPO',
  'BRAVO.ThongTinPO_MauCo',
  'BRAVO.DM_KHACHHANG',
  'BRAVO.DM_MuaKinhDoanh',
  'BRAVO.DM_NHANVIEN',
  'BRAVO.DM_MauSac',
  'BRAVO.DM_DiaDiemGiaoHang',
  'BRAVO.DM_QuocGia',
];

/**
 * Nguồn mà bước cập nhật Nhà máy SX theo OSM đọc tới: chép xong thì cập nhật lại (sản phẩm BRAVO mang số SO, mã hàng để ghép).
 */
export const OSM_FACTORY_SOURCE = 'OSM.OSMDataFty';
export const OSM_FACTORY_SOURCE_CODES = [OSM_FACTORY_SOURCE, 'BRAVO.DM_SanPhamDonHang'];

/** Bảng chép OSM đã có và đã đồng bộ ít nhất một lần chưa: chưa thì không cập nhật gì (không coi mọi đơn là "OSM không có") */
async function osmReady(sync: Kysely<any>) {
  const t = await sql<{ id: number | null }>`SELECT OBJECT_ID(N'osm.OSMDataFty', N'U') AS id`.execute(sync);
  if (t.rows[0]?.id == null) return false;
  const n = await sql<{ n: number }>`SELECT COUNT(*) AS n FROM osm.OSMDataFty`.execute(sync);
  return (n.rows[0]?.n ?? 0) > 0;
}

/**
 * Nhà máy SX theo OSM của từng sản phẩm BRAVO (ProductId → FtyName, danh sách cách nhau dấu phẩy). Ghép như người dùng chốt
 * 12/10/2026: số SO của sản phẩm (DM_SanPhamDonHang.Code) = vOSMDataFty.SO và mã hàng = StyleNo; mã hàng lấy theo BRAVO
 * (StyleName, cùng kết quả với SalesOrder.StyleCode lúc chốt) để người dùng sửa mã hàng ở MES không làm mất ghép. Ghép giữa hai
 * bảng chép trong MES_Sync: view OSM chậm, không đọc từng dòng. null khi chưa có bảng chép OSM hoặc chưa đồng bộ.
 */
export async function readOsmFactories(sync: Kysely<any>): Promise<Map<number, string> | null> {
  if (!(await osmReady(sync))) return null;
  // Một sản phẩm khớp nhiều dòng OSM (dòng trùng, hoặc sau này khác nhà máy): gộp mọi danh sách, bên đọc bỏ mã trùng
  const rows = await sql<{ ProductId: number; FtyName: string | null }>`
    SELECT p.ProductId, STRING_AGG(CAST(f.FtyName AS NVARCHAR(MAX)), N',') AS FtyName
    FROM bravo.DM_SanPhamDonHang p
    JOIN osm.OSMDataFty f ON f.SO = p.Code AND f.StyleNo = p.StyleName
    WHERE f.FtyName IS NOT NULL
    GROUP BY p.ProductId`.execute(sync);
  return new Map(rows.rows.map((r) => [r.ProductId, r.FtyName ?? '']));
}

/** Các danh sách nhà máy khác nhau trong bảng chép OSM (để thêm tên nhà máy mới vào danh mục); null khi chưa có, chưa đồng bộ */
export async function readOsmFactoryLists(sync: Kysely<any>): Promise<string[] | null> {
  if (!(await osmReady(sync))) return null;
  const rows = await sql<{ FtyName: string }>`SELECT DISTINCT FtyName FROM osm.OSMDataFty WHERE FtyName IS NOT NULL`.execute(sync);
  return rows.rows.map((r) => r.FtyName);
}

/**
 * Đọc đơn hàng, PO, màu cỡ BRAVO đã chép trong MES_Sync (chỉ đọc, quyết định 8.1) của các ĐVCS `branches`. Dùng chung cho bước
 * nạp tăng dần sau mỗi lần đồng bộ (BravoOrderImportService) và lệnh `load:bravo`. Bảng chép bravo.* sinh theo cột của view
 * (sync-gen.ts), không có kiểu Kysely: đọc bằng sql có kiểu dòng.
 */
export async function readBravoOrderSource(sync: Kysely<any>, branches: string[]): Promise<BravoOrderSource> {
  if (!branches.length) return { orders: [], pos: [], cells: [] };
  const orders = (
    await sql<SourceOrder>`
      WITH own AS (SELECT ProductId, COUNT(*) N FROM bravo.ThongTinPO GROUP BY ProductId)
      SELECT p.ProductId, UPPER(LTRIM(RTRIM(p.BranchCode))) AS BranchCode, p.Name, p.StyleName,
             COALESCE(NULLIF(p.Description_DetailSO, ''), NULLIF(p.Description, ''), p.StyleName) AS ProductName,
             p.Unit, p.TotalQuantity_SO AS Qty, p.EndDatePrice, p.ProductionTypeCode, p.SyncedAt,
             COALESCE(NULLIF(k.TenTat, ''), k.TenTat_OSM) AS Customer, s.Name AS Season, e.Name AS Staff,
             -- Hàng nhận gia công chưa có PO riêng: dùng PO của sản phẩm gốc ở nhà máy giao (ProductId_GC)
             CASE WHEN own.ProductId IS NOT NULL THEN p.ProductId WHEN g.ProductId IS NOT NULL THEN g.ProductId END AS PoProductId
      FROM bravo.DM_SanPhamDonHang p
      LEFT JOIN own ON own.ProductId = p.ProductId
      LEFT JOIN own g ON own.ProductId IS NULL AND g.ProductId = p.ProductId_GC
      LEFT JOIN bravo.DM_KHACHHANG k ON k.CustomerId = p.CustomerId
      LEFT JOIN bravo.DM_MuaKinhDoanh s ON s.SalesSeasonId = p.SalesSeasonId
      LEFT JOIN bravo.DM_NHANVIEN e ON e.EmployeeId = p.EmployeeId
      WHERE UPPER(LTRIM(RTRIM(p.BranchCode))) IN (${sql.join(branches)})
      ORDER BY p.ProductId`.execute(sync)
  ).rows;
  // Chỉ PO, màu cỡ của sản phẩm thuộc các ĐVCS này, kể cả sản phẩm gốc của hàng nhận gia công (ProductId_GC)
  const wanted = sql`
    WITH sp AS (SELECT ProductId, ProductId_GC FROM bravo.DM_SanPhamDonHang WHERE UPPER(LTRIM(RTRIM(BranchCode))) IN (${sql.join(branches)})),
    want AS (SELECT ProductId FROM sp UNION SELECT ProductId_GC FROM sp WHERE ProductId_GC IS NOT NULL)`;
  // PO tách nhiều dòng giao (khác ETD, nơi giao): gộp theo số PO, lấy ETD sớm nhất và nơi giao của dòng đó
  const pos = (
    await sql<SourcePo>`
      ${wanted},
      r AS (
        SELECT t.ProductId, t.CustomerPONo, t.DestinationId, t.RowId_Nationality,
               MIN(t.EstimatedTimeDelivery) OVER (PARTITION BY t.ProductId, t.CustomerPONo) AS Etd,
               MAX(t.SyncedAt) OVER (PARTITION BY t.ProductId, t.CustomerPONo) AS LastSyncedAt,
               ROW_NUMBER() OVER (PARTITION BY t.ProductId, t.CustomerPONo ORDER BY t.EstimatedTimeDelivery, t.SyncRowId) AS Rn
        FROM bravo.ThongTinPO t
        WHERE t.EstimatedTimeDelivery IS NOT NULL AND t.CustomerPONo IS NOT NULL AND t.ProductId IN (SELECT ProductId FROM want))
      SELECT r.ProductId, r.CustomerPONo, r.Etd, r.LastSyncedAt AS SyncedAt, COALESCE(d.Name, q.Name) AS Destination
      FROM r
      LEFT JOIN bravo.DM_DiaDiemGiaoHang d ON d.DestinationId = r.DestinationId
      LEFT JOIN bravo.DM_QuocGia q ON q.RowId_Nationality = r.RowId_Nationality
      WHERE r.Rn = 1
      ORDER BY r.ProductId, r.Etd, r.CustomerPONo`.execute(sync)
  ).rows;
  const cells = (
    await sql<SourceCell>`
      ${wanted}
      SELECT m.ProductId, m.CustomerPONo, m.ColorId, c.Name AS ColorName, c.Code AS ColorCode, m.SizeCode, m.SizeType,
             SUM(m.Quantity) AS Qty, MIN(m.Color_Stt) AS ColorStt, MIN(m.Size_Stt) AS SizeStt, MAX(m.SyncedAt) AS SyncedAt
      FROM bravo.ThongTinPO_MauCo m
      LEFT JOIN bravo.DM_MauSac c ON c.ColorId = m.ColorId
      WHERE m.SizeCode IS NOT NULL AND m.CustomerPONo IS NOT NULL AND m.ColorId IS NOT NULL AND m.ProductId IN (SELECT ProductId FROM want)
      GROUP BY m.ProductId, m.CustomerPONo, m.ColorId, c.Name, c.Code, m.SizeCode, m.SizeType`.execute(sync)
  ).rows;
  return { orders, pos, cells };
}
