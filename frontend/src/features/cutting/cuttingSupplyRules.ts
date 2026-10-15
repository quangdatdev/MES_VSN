// Tính toán của form Xác nhận cấp BTP (phase 5.15, quyết định 13.8), tách khỏi giao diện để test. Máy chủ tính lại và kiểm khi lưu.
import { MASK } from '../../lib/fieldPolicy';
import type { SupplyKey, SupplyRowData } from './api';

/** Một dòng của lưới nhập: một chuyền, mã hàng, màu, cỡ */
export interface SupplyRow {
  key: string;
  line: string;
  lineName: string;
  style: string;
  productName: string | null;
  colorName: string;
  sizeName: string;
  inPlan: boolean;
  /** Số hoặc "***" (Che); undefined khi cột bị Ẩn */
  planQty: number | string | undefined;
  syncQty: number | string | undefined;
  /** Đã cấp ở các ngày khác Ngày cấp */
  suppliedQty: number | string | undefined;
  /** Số đang nhập của Ngày cấp */
  dayQty: number | null;
  /** Số đã lưu của Ngày cấp (để biết ô nào đã sửa) */
  savedDay: number | null;
  otherLinesQty: number | string | undefined;
  /** Ô Số lượng cấp trong ngày bị Che: không hiện, không sửa */
  dayMasked: boolean;
  /** Lệnh của mã hàng ở Ngày cấp đã xác nhận: chỉ xem tới khi Hủy duyệt */
  locked: boolean;
}

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
/** Khóa dòng như máy chủ so (mã chuyền chữ hoa; mã hàng, màu, cỡ không phân biệt hoa thường, bỏ khoảng trắng cuối) */
export const rowKey = (k: SupplyKey) =>
  [k.line.trim().toUpperCase(), k.style.trimEnd().toLowerCase(), k.colorName.trimEnd().toLowerCase(), k.sizeName.trimEnd().toLowerCase()].join('\u0000');
const cellOf = (r: SupplyRow) => [r.style.trimEnd().toLowerCase(), r.colorName.trimEnd().toLowerCase(), r.sizeName.trimEnd().toLowerCase()].join('\u0000');

/**
 * Dòng của lưới từ dữ liệu máy chủ. `keys`: khóa đã gửi (cùng thứ tự với `data`), để giữ mã chuyền, mã hàng khi các cột đó bị Che;
 * không có thì lấy từ dữ liệu. Dòng của lệnh đã xác nhận do máy chủ đánh dấu (`locked`).
 */
export function rowsOf(data: SupplyRowData[], keys?: SupplyKey[]): SupplyRow[] {
  return data.map((d, i) => {
    const k = keys?.[i];
    const line = k?.line ?? text(d.lineCode);
    const style = typeof d.styleCode === 'string' && d.styleCode !== MASK ? d.styleCode : (k?.style ?? '');
    return {
      key: rowKey({ line, style, colorName: d.colorName, sizeName: d.sizeName }),
      line,
      lineName: d.lineName ?? (d.lineCode === MASK ? MASK : line),
      style,
      productName: d.productName,
      colorName: d.colorName,
      sizeName: d.sizeName,
      inPlan: d.inPlan,
      planQty: d.planQty,
      syncQty: d.syncQty,
      suppliedQty: d.suppliedQty,
      dayQty: num(d.dayQty),
      savedDay: num(d.dayQty),
      otherLinesQty: d.otherLinesQty,
      dayMasked: d.dayQty === MASK,
      locked: !!d.locked,
    };
  });
}

/** Khóa gửi lên máy chủ của các dòng */
export const keysOf = (rows: SupplyRow[]): SupplyKey[] => rows.map((r) => ({ line: r.line, style: r.style, colorName: r.colorName, sizeName: r.sizeName }));

/** Thêm dòng mới vào cuối lưới, bỏ dòng đã có (cùng chuyền, mã hàng, màu, cỡ) */
export function appendRows(rows: SupplyRow[], fresh: SupplyRow[]): SupplyRow[] {
  const have = new Set(rows.map((r) => r.key));
  return [...rows, ...fresh.filter((r) => !have.has(r.key))];
}

/** Còn lại khi đang gõ = SL kế hoạch − Đã cấp (ngày khác) − Trong ngày. Một trong các số bị Che, Ẩn thì không tính. */
export function remainOf(r: SupplyRow): number | string | undefined {
  if (typeof r.planQty === 'number' && typeof r.suppliedQty === 'number' && !r.dayMasked) return r.planQty - r.suppliedQty - (r.dayQty ?? 0);
  return r.planQty === MASK || r.suppliedQty === MASK || r.dayMasked ? MASK : undefined;
}

/** Ô đang tăng số so với số đã lưu (chỉ ô tăng mới bị chặn khi vượt: giảm số luôn được) */
const raised = (r: SupplyRow) => (r.dayQty ?? 0) > (r.savedDay ?? 0);

/** Còn lại âm (để tô đỏ), cả dòng đã âm từ trước vì phân bổ giảm sau khi cấp */
export function negative(r: SupplyRow): boolean {
  const v = remainOf(r);
  return typeof v === 'number' && v < 0;
}

/**
 * Tổng cấp (mọi chuyền, mọi ngày) theo mã hàng, màu, cỡ sau khi lưu, so với Số lượng đồng bộ (đã cắt): số đã lưu của mọi chuyền, thay
 * phần của các dòng trong lưới bằng số đang nhập. Trả khóa màu cỡ đang vượt (không tính được thì bỏ qua: máy chủ vẫn kiểm).
 */
export function overSyncCells(rows: SupplyRow[]): Set<string> {
  const groups = new Map<string, SupplyRow[]>();
  for (const r of rows) groups.set(cellOf(r), [...(groups.get(cellOf(r)) ?? []), r]);
  const out = new Set<string>();
  for (const [cell, list] of groups) {
    const first = list[0];
    if (typeof first.syncQty !== 'number' || typeof first.otherLinesQty !== 'number') continue;
    if (list.some((r) => typeof r.suppliedQty !== 'number' || r.dayMasked)) continue;
    // Đã lưu của mọi chuyền = phần của chuyền khác (theo dòng đầu) + đã lưu của chính dòng đầu
    const savedAll = first.otherLinesQty + (first.suppliedQty as number) + (first.savedDay ?? 0);
    const savedHere = list.reduce((n, r) => n + (r.suppliedQty as number) + (r.savedDay ?? 0), 0);
    const typedHere = list.reduce((n, r) => n + (r.suppliedQty as number) + (r.dayQty ?? 0), 0);
    if (savedAll - savedHere + typedHere > first.syncQty && list.some(raised)) out.add(cell);
  }
  return out;
}

/** Dòng vượt Số lượng đồng bộ (thuộc màu cỡ đang vượt) */
export const overSync = (r: SupplyRow, cells: Set<string>) => cells.has(cellOf(r));

/** Dòng vừa tăng số làm Còn lại âm: không lưu được */
export const raisedNegative = (rows: SupplyRow[]) => rows.filter((r) => negative(r) && raised(r));

/** Lưới vừa đổi: bỏ thay đổi ở dòng chỉ xem; số âm, số lẻ về rỗng */
export function settle(next: SupplyRow[], prev: SupplyRow[], editable: (r: SupplyRow) => boolean): SupplyRow[] {
  const before = new Map(prev.map((r) => [r.key, r]));
  // Lưới không thêm, xóa dòng; dòng lạ (không có trong lần trước) bỏ qua
  return next
    .filter((r) => before.has(r.key))
    .map((r) => {
      const old = before.get(r.key)!;
      if (!editable(old)) return old;
      const v = r.dayQty;
      return { ...old, dayQty: v === null || !Number.isInteger(v) || v < 0 ? null : v };
    });
}

/** Ô đã sửa so với lần tải (gửi lên máy chủ, chỉ các ô này): 0 là xóa số của ngày */
export function changes(rows: SupplyRow[]) {
  return rows.filter((r) => (r.dayQty ?? 0) !== (r.savedDay ?? 0)).map((r) => ({ line: r.line, style: r.style, colorName: r.colorName, sizeName: r.sizeName, dayQty: r.dayQty ?? 0 }));
}

/** Số lớn nhất một ô nhận (như máy chủ) */
export const MAX_SUPPLY_QTY = 1_000_000;

const names = (rows: SupplyRow[]) => {
  const list = rows.map((r) => `${r.lineName}, ${r.colorName}/${r.sizeName}`);
  return `${list.slice(0, 3).join('; ')}${list.length > 3 ? ` và ${list.length - 3} dòng khác` : ''}`;
};

/** Lý do chưa lưu được (null: lưu được). `noteChanged`: chỉ đổi Ghi chú cũng là có thay đổi. */
export function saveIssue(rows: SupplyRow[], noteChanged = false): string | null {
  const big = rows.filter((r) => (r.dayQty ?? 0) > MAX_SUPPLY_QTY);
  if (big.length) return `Số cấp trong ngày tối đa ${MAX_SUPPLY_QTY.toLocaleString('vi-VN')} mỗi dòng (${names(big)}).`;
  const neg = raisedNegative(rows);
  if (neg.length) return `Số lượng còn lại âm ở ${names(neg)}: cấp vượt số lượng kế hoạch của chuyền.`;
  const cells = overSyncCells(rows);
  if (cells.size) return `Tổng cấp vượt số lượng đồng bộ (đã cắt) ở ${names(rows.filter((r) => overSync(r, cells) && raised(r)))}.`;
  return changes(rows).length || noteChanged ? null : 'Chưa có thay đổi nào';
}
