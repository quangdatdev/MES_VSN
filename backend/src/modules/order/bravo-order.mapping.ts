// Ánh xạ đơn hàng BRAVO (bảng chép trong MES_Sync) sang MES_Order: hàm thuần, không đọc ghi database. Dùng chung cho bước nạp
// tăng dần sau mỗi lần đồng bộ (BravoOrderImportService) và lệnh nạp lại toàn bộ `load:bravo`. Giả định khi BA chưa chốt
// (anh-xa-bravo-don-hang.html, mục Cần chốt) ghi ở docs/update_docs/06-don-hang.md mục 8.2.
import { createHash } from 'crypto';
import { factoryListFor } from '../../platform/catalog/factory-list';
import type { BravoOrderSource, SourceCell, SourceOrder } from '../../platform/feed/source-feed.service';

export interface Cell {
  color: string;
  size: string;
  qty: number;
}

export interface BuiltPo {
  poNumber: string;
  shipDate: string;
  /** Lần chép gần nhất của các dòng PO (ThongTinPO) */
  syncedAt: Date;
  destination: string | null;
  cells: Cell[];
  qty: number;
}

/** Cột của đơn hàng lấy từ BRAVO: nạp lại thì ghi đè. Cột MES tự quản (Nhà máy SX, đơn giá, giá CM) không nằm ở đây. */
export interface OrderFields {
  CustomerName: string;
  StyleCode: string;
  Season: string | null;
  OrderType: string | null;
  ProductName: string;
  StaffName: string | null;
  Qty: number;
  UnitName: string;
  ShipDate: string;
}

export interface BuiltOrder {
  productId: number;
  branchCode: string;
  orderNo: string;
  /** Đã đóng lệnh bên BRAVO (EndDatePrice) */
  closed: boolean;
  /**
   * Lần chép gần nhất của sản phẩm, PO, màu cỡ của đơn (cột "Ngày đồng bộ"). Không dùng để biết BRAVO có đổi đơn: nguồn chép
   * theo nhóm (PO, màu cỡ) chép lại cả nhóm với mốc mới dù nội dung không đổi; dùng `hash`
   */
  syncedAt: Date;
  fields: OrderFields;
  /** Dấu nội dung (SalesOrder.SourceHash, xem sourceHash): đổi khi và chỉ khi dữ liệu BRAVO của đơn đổi */
  hash: string;
  pos: BuiltPo[];
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** Bỏ ký tự điều khiển (xuống dòng trong mã hàng BRAVO), gộp khoảng trắng, cắt theo độ dài cột */
export const clean = (s: string | null | undefined, max: number) => {
  const v = (s ?? '').replace(/\p{Cc}+/gu, ' ').replace(/\s+/g, ' ').trim();
  return v ? v.slice(0, max) : null;
};
/**
 * Ghép màu cỡ với PO như SQL Server so CustomerPONo (VARCHAR, collation CI): chỉ bỏ dấu cách cuối (không bỏ tab, xuống dòng,
 * khoảng trắng đầu), không phân biệt hoa thường
 */
const poKey = (productId: number, poNo: string) => `${productId}|${poNo.replace(/ +$/, '').toUpperCase()}`;
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
const later = (a: Date, b: Date | null | undefined) => (b && b.getTime() > a.getTime() ? b : a);

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

/**
 * Số đơn: phần trước " | " của Name (số SO). Cột VARCHAR(30): số có ký tự ngoài ASCII thì dùng SP-<ProductId>.
 * Một SO có vài sản phẩm thì thêm -2, -3 để không trùng trong nhà máy (`used` giữ các số đã cấp, theo nhà máy, chữ hoa).
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

/**
 * Dựng đơn hàng MES từ dữ liệu BRAVO. Sản phẩm chưa có PO thì chưa có ngày xuất (cột bắt buộc): bỏ qua, đếm theo ĐVCS ở
 * `skipped`. `numberOf` cấp số đơn (chỉ gọi cho sản phẩm được dựng, theo thứ tự ProductId); `unitNames` đổi mã đơn vị tính
 * BRAVO (không dấu) sang tên ở danh mục Đơn vị tính.
 */
export function buildOrders(src: BravoOrderSource, numberOf: (o: SourceOrder) => string, unitNames: Map<string, string>) {
  const posByProduct = group(src.pos, (p) => p.ProductId);
  const cellsByPo = group(src.cells, (c) => poKey(c.ProductId, c.CustomerPONo));
  const cellsByProduct = group(src.cells, (c) => c.ProductId);
  const built: BuiltOrder[] = [];
  const skipped = new Map<string, number>();

  for (const o of src.orders) {
    const pos: BuiltPo[] = [];
    let syncedAt = o.SyncedAt;
    const dupNames = duplicateColorNames(o.PoProductId ? (cellsByProduct.get(o.PoProductId) ?? []) : []);
    for (const p of o.PoProductId ? (posByProduct.get(o.PoProductId) ?? []) : []) {
      const list = cellsByPo.get(poKey(p.ProductId, p.CustomerPONo)) ?? [];
      const cells = buildCells(list, dupNames);
      if (!cells.length) continue;
      syncedAt = later(syncedAt, p.SyncedAt);
      for (const c of list) syncedAt = later(syncedAt, c.SyncedAt);
      pos.push({
        poNumber: clean(p.CustomerPONo, 192) ?? '(trống)',
        shipDate: ymd(p.Etd),
        syncedAt: p.SyncedAt,
        destination: clean(p.Destination, 60),
        cells,
        qty: cells.reduce((s, c) => s + c.qty, 0),
      });
    }
    if (!pos.length) {
      skipped.set(o.BranchCode, (skipped.get(o.BranchCode) ?? 0) + 1);
      continue;
    }
    const orderNo = numberOf(o);
    const closed = o.EndDatePrice !== null;
    const fields: OrderFields = {
      CustomerName: clean(o.Customer, 100) ?? '(Chưa có khách hàng)',
      StyleCode: clean(o.StyleName, 120) ?? orderNo,
      Season: clean(o.Season, 20),
      OrderType: clean(o.ProductionTypeCode, 30),
      ProductName: clean(o.ProductName, 150) ?? orderNo,
      StaffName: clean(o.Staff, 100),
      Qty: Math.max(0, Math.round(o.Qty ?? 0)),
      UnitName: clean(unitNames.get((o.Unit ?? '').trim().toUpperCase()), 20) ?? clean(o.Unit, 20) ?? 'Chiếc',
      ShipDate: pos.map((p) => p.shipDate).sort()[0],
    };
    built.push({ productId: o.ProductId, branchCode: o.BranchCode, orderNo, closed, syncedAt, fields, hash: sourceHash(o, fields.ShipDate), pos });
  }
  return { built, skipped };
}

/**
 * Dấu nội dung phần lấy từ BRAVO của đơn, tính trên dữ liệu BRAVO chưa ánh xạ (review 5.9.10 M4.3): đổi tên ở danh mục
 * Đơn vị tính của MES hay đổi cách ánh xạ không làm dấu đổi, nên không ghi đè hàng loạt phần người dùng sửa. `shipDate`: ngày
 * xuất sớm nhất trong các PO được nạp. Đổi danh sách giá trị thì đổi tiền tố phiên bản (lần nạp sau coi mọi đơn là BRAVO đổi).
 */
export function sourceHash(o: SourceOrder, shipDate: string) {
  const unit = (o.Unit ?? '').trim().toUpperCase();
  const values = ['v1', o.Customer, o.StyleName, o.Season, o.ProductionTypeCode, o.ProductName, o.Staff, o.Qty, unit, o.EndDatePrice !== null, shipDate];
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

// ---------- Nạp tăng dần: so dữ liệu BRAVO với MES_Order ----------

/** Đơn hàng MES (mọi đơn, kể cả nhập tay: cần số đơn đã dùng để cấp số cho đơn mới) */
export interface MesOrder {
  Id: number;
  SourceProductId: number | null;
  BranchCode: string;
  OrderNo: string;
  CustomerName: string;
  StyleCode: string;
  SyncedAt: Date | null;
  ModifiedBy: number | null;
  SourceHash: string | null;
}

/** PO của đơn nạp từ BRAVO, kèm màu cỡ và cờ đã nằm trong kế hoạch xuất hàng */
export interface MesPo {
  Id: number;
  SalesOrderId: number;
  PoNumber: string;
  ShipDate: Date;
  Destination: string | null;
  StatusCode: string;
  CreatedBy: number | null;
  /** Người dùng đã lưu màu cỡ, xác nhận hoặc hủy xác nhận PO */
  ModifiedBy: number | null;
  inPlan: boolean;
  /** Theo SortOrder rồi Id */
  cells: (Cell & { createdBy: number | null })[];
}

export interface MesState {
  orders: MesOrder[];
  pos: MesPo[];
}

export interface ImportPlan {
  /** Nhà máy SX của đơn mới theo OSM (danh sách mã, quyết định 7.6); OSM chưa có đơn này thì để trống, người dùng chọn tay */
  newOrders: (BuiltOrder & { factoryCode: string | null; factoryFromOsm: boolean })[];
  /**
   * Ghi cột lấy từ BRAVO, dấu nội dung; trạng thái Mới → Hoàn thành khi `closed` (tính trong câu ghi). `force`: BRAVO đổi đơn
   * sau lần nạp trước, ghi đè cả khi người dùng đã sửa đơn ở MES; không `force` thì chỉ ghi đơn chưa ai sửa
   */
  orderUpdates: { id: number; fields: OrderFields; closed: boolean; hash: string; syncedAt: Date; force: boolean }[];
  /**
   * Đơn nạp trước khi có dấu nội dung mà người dùng đã sửa: chỉ ghi dấu làm mốc (và Mới → Hoàn thành khi đóng lệnh), giữ phần
   * người dùng sửa. Thay đổi BRAVO từ lần nạp đó tới nay của các đơn này không được ghi (không biết người dùng hay BRAVO đổi)
   */
  hashUpdates: { id: number; hash: string; closed: boolean }[];
  /** PO mới của đơn đã có */
  newPos: { salesOrderId: number; branchCode: string; customer: string; style: string; closed: boolean; po: BuiltPo }[];
  poUpdates: { id: number; shipDate: string; destination: string | null; syncedAt: Date }[];
  /** Thay màu cỡ: PO chưa xác nhận, chưa vào kế hoạch, người dùng chưa đụng tới màu cỡ */
  cellUpdates: { poId: number; salesOrderId: number; cells: Cell[]; qty: number }[];
  /** Màu cỡ BRAVO đổi nhưng PO đã xác nhận, đã vào kế hoạch hoặc đã sửa tay ở MES: giữ của MES */
  cellsKept: number[];
  /** Đơn nạp từ BRAVO mà nay BRAVO đổi chi nhánh nhận đơn (ĐVCS bất biến ở MES): không cập nhật */
  branchChanged: number[];
  /** Đơn mới có danh sách nhà máy theo OSM dài quá cột: thêm đơn với Nhà máy SX trống (ProductId) */
  factoryTooLong: number[];
  /** Đơn nạp từ BRAVO không còn trong bảng chép hoặc không còn PO; PO nạp từ BRAVO không còn: giữ, chờ BA chốt cách xử lý */
  goneOrders: number;
  gonePos: number;
  /** Sản phẩm BRAVO chưa có PO nên chưa nạp, theo ĐVCS */
  skipped: Map<string, number>;
}

/**
 * Khóa ghép số PO giữa BRAVO và MES: không phân biệt hoa thường; ký tự ngoài ASCII thành "?". Trước MES_Order/0007 cột PoNumber
 * là VARCHAR, chữ tiếng Việt lưu thành "?" (0007 đã sửa "(tr?ng)" của PO không có số; PO nhập tay cũ có thể còn): hai phía
 * cùng quy về "?" nên vẫn khớp.
 */
const poNumberKey = (s: string) => s.toUpperCase().replace(/[^\x20-\x7E]/g, '?');
const sameCells = (a: Cell[], b: Cell[]) => a.length === b.length && a.every((c, i) => c.color === b[i].color && c.size === b[i].size && c.qty === b[i].qty);

/**
 * So dữ liệu BRAVO với MES_Order, ra việc cần ghi. Không xóa gì. Quy tắc (quyết định 7.7):
 * - Sản phẩm mới (có PO, ĐVCS đang dùng): thêm đơn, PO, màu cỡ như `load:bravo`; Nhà máy SX theo OSM nếu OSM có (quyết định 7.6).
 * - Đơn đã có, biết BRAVO đổi hay không theo dấu nội dung (SourceHash), không theo mốc chép:
 *   - dấu khác: BRAVO đã đổi đơn, cột lấy từ BRAVO theo BRAVO, kể cả khi người dùng đã sửa ở MES;
 *   - dấu giống: không ghi gì, giữ phần người dùng sửa;
 *   - chưa có dấu (đơn nạp trước migration 0006): đơn chưa ai sửa thì theo BRAVO; đã sửa thì chỉ lấy dấu làm mốc.
 *   Nhà máy SX, đơn giá, giá CM, số đơn, ĐVCS giữ của MES. Trạng thái chỉ đổi Mới → Hoàn thành khi BRAVO đóng lệnh.
 * - PO: thêm PO mới; ngày xuất, nơi giao theo BRAVO (trừ PO người dùng tự thêm); màu cỡ chỉ thay khi PO chưa xác nhận, chưa vào
 *   kế hoạch, người dùng chưa lưu màu cỡ hay xác nhận PO (ModifiedBy, CreatedBy của ô).
 */
export function planImport(
  src: BravoOrderSource,
  state: MesState,
  opts: { branches: string[]; unitNames: Map<string, string>; osmFactories: Map<number, string> | null },
): ImportPlan {
  const { unitNames, osmFactories } = opts;
  const mesBySource = new Map(state.orders.filter((o) => o.SourceProductId != null).map((o) => [o.SourceProductId!, o]));
  const used = new Set(state.orders.map((o) => `${o.BranchCode}|${o.OrderNo.toUpperCase()}`));
  const { built, skipped } = buildOrders(src, (o) => mesBySource.get(o.ProductId)?.OrderNo ?? orderNumber(o.Name, o.ProductId, o.BranchCode, used), unitNames);
  const posByOrder = group(state.pos, (p) => p.SalesOrderId);
  const plan: ImportPlan = { newOrders: [], orderUpdates: [], hashUpdates: [], newPos: [], poUpdates: [], cellUpdates: [], cellsKept: [], branchChanged: [], factoryTooLong: [], goneOrders: 0, gonePos: 0, skipped };

  for (const o of built) {
    const m = mesBySource.get(o.productId);
    if (!m) {
      const { code: factoryCode, tooLong } = factoryListFor(osmFactories?.get(o.productId));
      if (tooLong) plan.factoryTooLong.push(o.productId);
      plan.newOrders.push({ ...o, factoryCode, factoryFromOsm: factoryCode != null });
      continue;
    }
    if (m.BranchCode !== o.branchCode) {
      plan.branchChanged.push(o.productId);
      continue;
    }
    const changed = m.SourceHash != null && m.SourceHash !== o.hash;
    const update = changed || (m.SourceHash == null && m.ModifiedBy == null);
    if (update) plan.orderUpdates.push({ id: m.Id, fields: o.fields, closed: o.closed, hash: o.hash, syncedAt: later(o.syncedAt, m.SyncedAt), force: changed });
    else if (m.SourceHash == null) plan.hashUpdates.push({ id: m.Id, hash: o.hash, closed: o.closed });
    // Bản chụp khách hàng, mã hàng của PO mới: như đơn sau lần nạp này
    const header = update ? { customer: o.fields.CustomerName, style: o.fields.StyleCode } : { customer: m.CustomerName, style: m.StyleCode };

    // Hai PO BRAVO có thể cùng số sau khi làm sạch (chỉ khác khoảng trắng): ghép lần lượt với các PO MES cùng số theo Id
    const mesPos = (posByOrder.get(m.Id) ?? []).sort((a, b) => a.Id - b.Id);
    const byNo = group(mesPos, (p) => poNumberKey(p.PoNumber));
    const matched = new Set<number>();
    for (const bp of o.pos) {
      const ex = byNo.get(poNumberKey(bp.poNumber))?.find((p) => !matched.has(p.Id));
      if (!ex) {
        plan.newPos.push({ salesOrderId: m.Id, branchCode: m.BranchCode, ...header, closed: o.closed, po: bp });
        continue;
      }
      matched.add(ex.Id);
      // Chỉ theo nội dung: mốc chép của PO tăng cả khi BRAVO không đổi. PO người dùng tự thêm (ghép theo số PO) giữ ngày xuất,
      // nơi giao người dùng nhập
      if (ex.CreatedBy == null && (ymd(ex.ShipDate) !== bp.shipDate || (ex.Destination ?? null) !== bp.destination)) {
        plan.poUpdates.push({ id: ex.Id, shipDate: bp.shipDate, destination: bp.destination, syncedAt: bp.syncedAt });
      }
      if (!sameCells(ex.cells, bp.cells)) {
        const untouched = ex.StatusCode === 'DRAFT' && !ex.inPlan && ex.ModifiedBy == null && ex.cells.every((c) => c.createdBy == null);
        if (untouched) plan.cellUpdates.push({ poId: ex.Id, salesOrderId: m.Id, cells: bp.cells, qty: bp.qty });
        else plan.cellsKept.push(ex.Id);
      }
    }
    plan.gonePos += mesPos.filter((p) => p.CreatedBy == null && !matched.has(p.Id)).length;
  }
  const builtIds = new Set(built.map((o) => o.productId));
  const branches = new Set(opts.branches);
  // Chỉ đếm đơn của ĐVCS có trong lần đọc này: ĐVCS đang tắt thì không đọc nguồn của nó, không coi là đơn đã mất
  plan.goneOrders = state.orders.filter((m) => m.SourceProductId != null && !builtIds.has(m.SourceProductId) && branches.has(m.BranchCode)).length;
  return plan;
}
