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
 * Đọc đơn hàng, PO, màu cỡ BRAVO đã chép trong MES_Sync (chỉ đọc, ADR 0007) của các ĐVCS `branches`. Dùng chung cho bước
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
