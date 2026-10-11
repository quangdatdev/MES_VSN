// Nạp đơn hàng thật vào MES_Order từ bảng chép BRAVO trong MES_Sync, thay cho đơn hàng giả của seed.
// Chỉ đọc bảng chép của MES (schema bravo trong MES_Sync), không đọc database trung gian hay database BRAVO (ADR 0007).
// Ánh xạ theo docs/thiet-ke/anh-xa-bravo-don-hang.html; điểm BA chưa chốt dùng giả định ghi ở docs/thiet-ke/db-order.md
// (mục "Nạp từ BRAVO"). Đây là bản nạp để xem dữ liệu thật, chưa phải lớp ánh xạ đồng bộ của 5.2.8.
//
// Kế hoạch xuất hàng, dàn chuyền, phân màu cỡ là dữ liệu MES tự lập, BRAVO không có: script sinh mô phỏng xếp kín các chuyền
// quanh hôm nay (simulate-board.ts, người lập "Lập tự động (mô phỏng)"). Bỏ phần này bằng --no-plans.
//
// Dùng: npm run load:bravo -- --yes [--no-plans]
// Chỉ SQL Server trên máy này. Xóa mọi dữ liệu đơn hàng trong MES_Order (kể cả đơn nhập tay) rồi nạp lại.
import { sql, type Kysely } from 'kysely';
import { env } from '../src/config/env';
import type { CoreDatabase } from '../src/platform/database/core.types';
import { createDb } from '../src/platform/database/db';
import type { OrderDatabase } from '../src/modules/order/order.types';
import { MAX_COLOR_SIZE_ROWS, SIZE_NAME } from '../src/modules/order/order.rules';
import { clearSewingPrep } from './sewing-data';
import { assertDemoMachine } from './local-db';
import { docNoSql, insertAll, localToday, readLines } from './script-db';
import { simulateBranch } from './simulate-board';

/** Con trước cha: không có xóa dây chuyền ở DB */
const ORDER_TABLES = [
  'ShipmentPlanLineColorSize',
  'ShipmentPlanLine',
  'ShipmentPlanColorSize',
  'ShipmentPlanPo',
  'ShipmentPlan',
  'SalesOrderPoColorSize',
  'SalesOrderPo',
  'SalesOrder',
] as const;

interface SourceOrder {
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
interface SourcePo {
  ProductId: number;
  CustomerPONo: string;
  Etd: Date;
  SyncedAt: Date;
  Destination: string | null;
}
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
}
interface Cell {
  color: string;
  size: string;
  qty: number;
}
interface BuiltPo {
  poNumber: string;
  shipDate: string;
  syncedAt: Date;
  destination: string | null;
  cells: Cell[];
  qty: number;
  id?: number;
}
interface BuiltOrder {
  src: SourceOrder;
  orderNo: string;
  customer: string;
  style: string;
  productName: string;
  shipDate: string;
  closed: boolean;
  pos: BuiltPo[];
  id?: number;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** Bỏ ký tự điều khiển (xuống dòng trong mã hàng BRAVO), gộp khoảng trắng, cắt theo độ dài cột */
const clean = (s: string | null | undefined, max: number) => {
  const v = (s ?? '').replace(/\p{Cc}+/gu, ' ').replace(/\s+/g, ' ').trim();
  return v ? v.slice(0, max) : null;
};
const poKey = (productId: number, poNo: string) => `${productId}|${poNo.trim().toUpperCase()}`;
const group = <T, K>(rows: T[], key: (r: T) => K) => {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
};

export async function clearOrderData(trx: Kysely<OrderDatabase>) {
  for (const table of ORDER_TABLES) {
    await trx.deleteFrom(table).execute();
    // Bảng chưa từng có dòng nào thì RESEED 0 làm dòng đầu mang Id 0: chỉ đặt lại khi bảng đã dùng
    await sql`IF (SELECT last_value FROM sys.identity_columns WHERE object_id = OBJECT_ID(${`dbo.${table}`})) IS NOT NULL
              DBCC CHECKIDENT (${sql.lit(`dbo.${table}`)}, RESEED, 0) WITH NO_INFOMSGS`.execute(trx);
  }
}

const colorBase = (c: SourceCell) => clean(c.ColorName, 100) ?? c.ColorCode ?? String(c.ColorId);

/** Tên màu (chữ thường) dùng cho hai mã màu khác nhau trong cùng một đơn: danh mục màu BRAVO có tên trùng nhau */
export function duplicateColorNames(cells: SourceCell[]) {
  const ids = new Map<string, Set<number>>();
  for (const c of cells) {
    const n = colorBase(c).toLowerCase();
    ids.set(n, (ids.get(n) ?? new Set()).add(c.ColorId));
  }
  return new Set([...ids].filter(([, s]) => s.size > 1).map(([n]) => n));
}

/**
 * Lưới màu × cỡ của một PO: gộp dòng cùng màu, cỡ; cỡ khác REG (SHORT, LONG…) ghép vào tên cỡ để không cộng nhầm hai cỡ.
 * `dupNames` tính theo cả đơn để một màu mang cùng một tên ở mọi PO của đơn (kế hoạch gộp màu cỡ theo tên).
 */
export function buildCells(list: SourceCell[], dupNames: Set<string>): Cell[] {
  const merged = new Map<string, Cell & { colorStt: number; sizeStt: number }>();
  for (const c of list) {
    const base = colorBase(c);
    const color = dupNames.has(base.toLowerCase()) ? `${base.slice(0, 90)} (${c.ColorCode ?? c.ColorId})` : base;
    const type = c.SizeType?.trim().toUpperCase();
    const size = `${c.SizeCode.trim().toUpperCase()}${type && type !== 'REG' ? ` ${type}` : ''}`.slice(0, 20);
    const qty = Math.max(0, Math.round(c.Qty));
    const k = `${color.toLowerCase()}|${size}`;
    const cur = merged.get(k);
    if (cur) {
      cur.qty += qty;
      cur.colorStt = Math.min(cur.colorStt, c.ColorStt ?? 9999);
      cur.sizeStt = Math.min(cur.sizeStt, c.SizeStt ?? 9999);
    } else merged.set(k, { color, size, qty, colorStt: c.ColorStt ?? 9999, sizeStt: c.SizeStt ?? 9999 });
  }
  // Giữ thứ tự màu, cỡ như BRAVO
  return [...merged.values()]
    .sort((a, b) => a.colorStt - b.colorStt || a.color.localeCompare(b.color) || a.sizeStt - b.sizeStt || a.size.localeCompare(b.size))
    .map(({ color, size, qty }) => ({ color, size, qty }));
}

async function readSource(sync: Kysely<any>, branches: string[]) {
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
  // PO tách nhiều dòng giao (khác ETD, nơi giao): gộp theo số PO, lấy ETD sớm nhất và nơi giao của dòng đó
  const pos = (
    await sql<SourcePo>`
      WITH r AS (
        SELECT t.ProductId, t.CustomerPONo, t.DestinationId, t.RowId_Nationality,
               MIN(t.EstimatedTimeDelivery) OVER (PARTITION BY t.ProductId, t.CustomerPONo) AS Etd,
               MAX(t.SyncedAt) OVER (PARTITION BY t.ProductId, t.CustomerPONo) AS LastSyncedAt,
               ROW_NUMBER() OVER (PARTITION BY t.ProductId, t.CustomerPONo ORDER BY t.EstimatedTimeDelivery, t.SyncRowId) AS Rn
        FROM bravo.ThongTinPO t WHERE t.EstimatedTimeDelivery IS NOT NULL AND t.CustomerPONo IS NOT NULL)
      SELECT r.ProductId, r.CustomerPONo, r.Etd, r.LastSyncedAt AS SyncedAt, COALESCE(d.Name, q.Name) AS Destination
      FROM r
      LEFT JOIN bravo.DM_DiaDiemGiaoHang d ON d.DestinationId = r.DestinationId
      LEFT JOIN bravo.DM_QuocGia q ON q.RowId_Nationality = r.RowId_Nationality
      WHERE r.Rn = 1
      ORDER BY r.ProductId, r.Etd, r.CustomerPONo`.execute(sync)
  ).rows;
  const cells = (
    await sql<SourceCell>`
      SELECT m.ProductId, m.CustomerPONo, m.ColorId, c.Name AS ColorName, c.Code AS ColorCode, m.SizeCode, m.SizeType,
             SUM(m.Quantity) AS Qty, MIN(m.Color_Stt) AS ColorStt, MIN(m.Size_Stt) AS SizeStt
      FROM bravo.ThongTinPO_MauCo m
      LEFT JOIN bravo.DM_MauSac c ON c.ColorId = m.ColorId
      WHERE m.SizeCode IS NOT NULL AND m.CustomerPONo IS NOT NULL AND m.ColorId IS NOT NULL
      GROUP BY m.ProductId, m.CustomerPONo, m.ColorId, c.Name, c.Code, m.SizeCode, m.SizeType`.execute(sync)
  ).rows;
  return { orders, pos, cells };
}

/**
 * Số đơn: phần trước " | " của Name (số SO). Cột VARCHAR(30): số có ký tự ngoài ASCII thì dùng SP-<ProductId>.
 * Một SO có vài sản phẩm thì thêm -2, -3 để không trùng trong nhà máy (`used` giữ các số đã cấp, theo nhà máy).
 */
export function orderNumber(name: string | null, productId: number, branch: string, used: Set<string>) {
  const cut = name?.indexOf(' | ') ?? -1;
  const so = cut > 0 ? clean(name!.slice(0, cut), 30) : null;
  const base = so && /^[\x20-\x7E]+$/.test(so) ? so : `SP-${productId}`;
  let no = base;
  for (let n = 2; used.has(`${branch}|${no.toUpperCase()}`); n++) no = `${base.slice(0, 30 - String(n).length - 1)}-${n}`;
  used.add(`${branch}|${no.toUpperCase()}`);
  return no;
}

function build(src: Awaited<ReturnType<typeof readSource>>) {
  const posByProduct = group(src.pos, (p) => p.ProductId);
  const cellsByPo = group(src.cells, (c) => poKey(c.ProductId, c.CustomerPONo));
  const cellsByProduct = group(src.cells, (c) => c.ProductId);
  const usedNo = new Set<string>();
  const built: BuiltOrder[] = [];
  const skipped = new Map<string, number>();

  for (const o of src.orders) {
    const pos: BuiltPo[] = [];
    const dupNames = duplicateColorNames(o.PoProductId ? (cellsByProduct.get(o.PoProductId) ?? []) : []);
    for (const p of o.PoProductId ? (posByProduct.get(o.PoProductId) ?? []) : []) {
      const cells = buildCells(cellsByPo.get(poKey(p.ProductId, p.CustomerPONo)) ?? [], dupNames);
      if (!cells.length) continue;
      pos.push({
        poNumber: clean(p.CustomerPONo, 40) ?? '(trống)',
        shipDate: ymd(p.Etd),
        syncedAt: p.SyncedAt,
        destination: clean(p.Destination, 60),
        cells,
        qty: cells.reduce((s, c) => s + c.qty, 0),
      });
    }
    // Đơn chưa có PO thì chưa có ngày xuất (cột bắt buộc): chưa nạp
    if (!pos.length) {
      skipped.set(o.BranchCode, (skipped.get(o.BranchCode) ?? 0) + 1);
      continue;
    }
    const orderNo = orderNumber(o.Name, o.ProductId, o.BranchCode, usedNo);
    built.push({
      src: o,
      orderNo,
      customer: clean(o.Customer, 100) ?? '(Chưa có khách hàng)',
      style: clean(o.StyleName, 120) ?? orderNo,
      productName: clean(o.ProductName, 150) ?? orderNo,
      shipDate: pos.map((p) => p.shipDate).sort()[0],
      closed: o.EndDatePrice !== null,
      pos,
    });
  }
  return { built, skipped };
}

export async function loadBravoOrders({ plans = !process.argv.includes('--no-plans') }: { plans?: boolean } = {}) {
  assertDemoMachine('load-bravo-orders');
  // Xóa và chèn cả bảng trong một transaction: giới hạn mỗi câu 10 phút thay vì 15 giây mặc định
  const long = { requestTimeoutMs: 10 * 60_000 };
  const core = createDb<CoreDatabase>(env.db.coreName);
  // Bảng chép bravo.* sinh theo cột của view (sync-gen.ts), không có kiểu Kysely: chỉ đọc bằng sql có kiểu dòng ở trên
  const sync = createDb<any>(env.db.syncName, long);
  const order = createDb<OrderDatabase>(env.db.orderName, long);
  try {
    const { branches, linesOf, plannerId } = await readLines(core);
    if (!branches.length) throw new Error('MES_Core chưa có nhà máy nào đang dùng: chạy npm run seed trước.');
    // Đơn vị tính BRAVO (mã không dấu) đổi sang tên theo danh mục Đơn vị tính (Quản trị › Danh mục hệ thống)
    const unitNames = new Map(
      (await core.selectFrom('SysCatalogItem as i').innerJoin('SysCatalog as c', 'c.Id', 'i.CatalogId').select(['i.Code', 'i.Name']).where('c.Code', '=', 'UNIT').execute()).map((u) => [u.Code, u.Name]),
    );

    const ready = await sql<{ N: number }>`SELECT COUNT(*) AS N FROM bravo.DM_SanPhamDonHang`.execute(sync).catch(() => null);
    if (!ready?.rows[0]?.N) {
      throw new Error(`Bảng chép BRAVO trong ${env.db.syncName} chưa có dữ liệu: vào màn Đồng bộ dữ liệu, bấm Đồng bộ (cần ThongTinPO, ThongTinPO_MauCo và các danh mục) rồi chạy lại.`);
    }
    const source = await readSource(sync, branches);
    const { built, skipped } = build(source);
    const today = localToday();
    const stats: Record<string, Record<string, number>> = {};
    const bump = (b: string, k: string, n = 1) => ((stats[b] ??= {})[k] = (stats[b][k] ?? 0) + n);

    // Xóa bản chép Kế hoạch chuẩn bị SX trước khi nạp (Id dòng dàn chuyền sẽ được đánh số lại, ADR 0009). Làm trước, không làm
    // sau: lượt mở màn xen giữa thì chép lại dòng cũ, sau khi nạp dấu phiên bản đổi và lượt sau thay hết
    const prep = await clearSewingPrep();
    if (prep) console.log(`Đã xóa ${prep} dòng Kế hoạch chuẩn bị SX cũ trong ${env.db.sewingName} (danh mục bước giữ nguyên).`);

    await order.transaction().execute(async (trx) => {
      await clearOrderData(trx);

      const orderRows = await insertAll(
        trx,
        'SalesOrder',
        built.map((o) => ({
          OrderNo: o.orderNo,
          CustomerName: o.customer,
          StyleCode: o.style,
          Season: clean(o.src.Season, 20),
          OrderType: clean(o.src.ProductionTypeCode, 30),
          ProductName: o.productName,
          StaffName: clean(o.src.Staff, 100),
          Qty: Math.max(0, Math.round(o.src.Qty ?? 0)),
          UnitName: clean(unitNames.get((o.src.Unit ?? '').trim().toUpperCase()), 20) ?? clean(o.src.Unit, 20) ?? 'Chiếc',
          UnitPrice: null,
          CmPrice: null,
          SyncedAt: o.src.SyncedAt,
          ShipDate: o.shipDate,
          StatusCode: o.closed ? 'DONE' : 'NEW',
          SourceProductId: o.src.ProductId,
          BranchCode: o.src.BranchCode,
          CreatedBy: null,
        })),
        ['Id', 'SourceProductId'],
      );
      const orderId = new Map(orderRows.map((r) => [r.SourceProductId as number, r.Id as number]));
      for (const o of built) {
        o.id = orderId.get(o.src.ProductId);
        bump(o.src.BranchCode, 'đơn hàng');
        if (o.closed) bump(o.src.BranchCode, 'đã đóng lệnh');
      }

      const poList = built.flatMap((o) => o.pos.map((p) => ({ o, p })));
      const poRows = await insertAll(
        trx,
        'SalesOrderPo',
        poList.map(({ o, p }, i) => ({
          SalesOrderId: o.id,
          PoCode: `~${i}`,
          PoNumber: p.poNumber,
          CustomerName: o.customer,
          StyleCode: o.style,
          Qty: p.qty,
          Destination: p.destination,
          PackingListCode: null,
          CustomsDeclarationNo: null,
          SyncedAt: p.syncedAt,
          ShipDate: p.shipDate,
          // Đơn đã đóng lệnh bên BRAVO: PO coi như đã xác nhận (khóa sửa màu cỡ)
          StatusCode: o.closed ? 'CONFIRMED' : 'DRAFT',
          ConfirmedAt: o.closed ? p.syncedAt : null,
          ConfirmedBy: null,
          BranchCode: o.src.BranchCode,
          CreatedBy: null,
        })),
        ['Id', 'PoCode'],
      );
      const poId = new Map(poRows.map((r) => [r.PoCode as string, r.Id as number]));
      poList.forEach(({ o, p }, i) => {
        p.id = poId.get(`~${i}`);
        bump(o.src.BranchCode, 'PO');
      });

      const cellRows = poList.flatMap(({ o, p }) => p.cells.map((c, k) => ({ SalesOrderPoId: p.id, ColorName: c.color, SizeName: c.size, Qty: c.qty, SortOrder: k, BranchCode: o.src.BranchCode, CreatedBy: null })));
      await insertAll(trx, 'SalesOrderPoColorSize', cellRows);
      for (const r of cellRows) bump(r.BranchCode, 'ô màu cỡ');
      // Dữ liệu nguồn mà màn hình không lưu lại được theo quy tắc nhập tay (order.dto.ts): báo để biết trước, không chặn nạp
      for (const { o, p } of poList) {
        if (p.cells.length > MAX_COLOR_SIZE_ROWS) bump(o.src.BranchCode, `PO quá ${MAX_COLOR_SIZE_ROWS} ô màu cỡ`);
        const odd = p.cells.filter((c) => !SIZE_NAME.test(c.size)).length;
        if (odd) bump(o.src.BranchCode, 'ô có cỡ ngoài quy tắc nhập tay', odd);
      }

      if (plans) {
        for (const b of branches) {
          const s = await simulateBranch(trx, { branch: b, lines: linesOf(b), today, plannerId });
          if (s.plans) bump(b, 'kế hoạch mô phỏng', s.plans);
          if (s.lines) bump(b, 'dòng dàn chuyền mô phỏng', s.lines);
        }
      }

      // Số PO theo Id như khi tạo trên màn hình (PO-<nhà máy>-<Id 6 số>); số kế hoạch do simulateBranch đặt. Không lọc
      // BranchCode: bảng vừa xóa sạch rồi nạp lại mọi nhà máy, mỗi dòng lấy mã nhà máy của chính nó
      await sql`UPDATE dbo.SalesOrderPo SET PoCode = ${sql.raw(docNoSql('PO'))} WHERE PoCode LIKE '~%'`.execute(trx);
    });

    for (const [b, n] of skipped) bump(b, 'chưa nạp (chưa có PO)', n);
    // Nhà máy có trong BRAVO mà MES chưa có: báo số lượng để biết cần thêm nhà máy
    const others = await sql<{ BranchCode: string; N: number }>`
      SELECT LTRIM(RTRIM(BranchCode)) AS BranchCode, COUNT(*) AS N FROM bravo.DM_SanPhamDonHang
      WHERE LTRIM(RTRIM(ISNULL(BranchCode, ''))) NOT IN (${sql.join(branches)}) GROUP BY LTRIM(RTRIM(BranchCode))`.execute(sync);
    for (const r of others.rows) bump(r.BranchCode || '(trống)', 'chưa nạp (MES chưa có nhà máy)', r.N);

    await core
      .insertInto('SysAuditLog')
      .values({ EntityType: 'System', ActionCode: 'BRAVO_LOAD', NewValue: JSON.stringify({ by: 'scripts/load-bravo-orders.ts', plans, stats }) } as any)
      .execute();
    return stats;
  } finally {
    await core.destroy();
    await sync.destroy();
    await order.destroy();
  }
}

async function main() {
  assertDemoMachine('load-bravo-orders');
  if (!process.argv.includes('--yes')) {
    console.log(
      [
        `Lệnh này xóa mọi dữ liệu đơn hàng trong ${env.db.orderName} (máy chủ ${env.db.host}), kể cả đơn nhập tay,`,
        `và Kế hoạch chuẩn bị SX trong ${env.db.sewingName} (ngày đã nhập; danh mục bước giữ nguyên),`,
        `rồi nạp đơn hàng, PO, màu cỡ thật từ bảng chép BRAVO trong ${env.db.syncName}.`,
        'Kế hoạch xuất hàng và dàn chuyền được sinh mô phỏng, xếp kín các chuyền quanh hôm nay (bỏ bằng --no-plans).',
        'Chạy lại với: npm run load:bravo -- --yes',
      ].join('\n'),
    );
    return;
  }
  const stats = await loadBravoOrders();
  console.log('Đã nạp dữ liệu BRAVO:');
  console.table(stats);
  console.warn(
    [
      'Lưu ý: database giờ chứa dữ liệu thật (khách hàng, PO, số lượng). Backend mặc định nghe trên mọi địa chỉ (HOST=0.0.0.0)',
      'và các tài khoản demo dùng chung DEMO_PASSWORD: ai trong mạng LAN biết mật khẩu demo đều xem được.',
      'Nên đặt HOST=127.0.0.1 trong backend/.env, hoặc đổi DEMO_PASSWORD mạnh rồi chạy npm run seed -- --reset-passwords.',
    ].join('\n'),
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Nạp dữ liệu BRAVO lỗi:', e.message ?? e);
    process.exit(1);
  });
}
