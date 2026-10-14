// Tính toán của popup Đồng bộ tiến độ cắt (phase 5.14, quyết định 13.3), tách khỏi giao diện để test. Máy chủ tính lại khi lưu.
import { MASK } from '../../lib/fieldPolicy';
import type { CuttingCell, CuttingDetail } from './api';

/** Khóa của dòng Tổng ghim đầu lưới */
export const TOTAL_KEY = '__total__';

/** Một dòng của lưới nhập: một màu cỡ, hoặc dòng Tổng */
export interface CutRow {
  key: string;
  colorName: string;
  sizeName: string;
  inPlan: boolean;
  total: boolean;
  /** Số hoặc "***" (Che); undefined khi cột bị Ẩn */
  planQty: number | string | undefined;
  /** Số đang nhập của ngày đang xem */
  dayQty: number | null;
  /** Số đã lưu của ngày đang xem (để tính Lũy kế khi đang gõ, và biết ô nào đã sửa) */
  savedDay: number | null;
  /** Lũy kế đã lưu (mọi ngày) */
  savedCut: number | string | undefined;
  /** Ô Trong ngày bị Che: không hiện, không sửa */
  dayMasked: boolean;
}

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/** Dòng của lưới từ dữ liệu máy chủ: dòng Tổng đầu tiên, rồi màu cỡ theo thứ tự kế hoạch (màu cỡ đã bỏ ở cuối) */
export function rowsOf(detail: Pick<CuttingDetail, 'items'>): CutRow[] {
  const cells = detail.items.map((c: CuttingCell, i): CutRow => ({
    key: `${i}:${c.colorName}\u0000${c.sizeName}`,
    colorName: c.colorName,
    sizeName: c.sizeName,
    inPlan: c.inPlan,
    total: false,
    planQty: c.planQty,
    dayQty: num(c.dayQty),
    savedDay: num(c.dayQty),
    savedCut: c.cutQty,
    dayMasked: c.dayQty === MASK,
  }));
  return [totalRow(cells), ...cells];
}

/** Lũy kế khi đang gõ: Lũy kế đã lưu − số đã lưu của ngày đang xem + số đang nhập. Lũy kế bị Che, Ẩn thì giữ nguyên. */
export function liveCut(r: CutRow): number | string | undefined {
  if (typeof r.savedCut !== 'number') return r.savedCut;
  return r.savedCut - (r.savedDay ?? 0) + (r.dayQty ?? 0);
}

/** +/- = Lũy kế − Kế hoạch (theo ảnh mẫu): âm là còn thiếu, dương là cắt dư. Một trong hai không có số thì không tính. */
export function diffOf(r: CutRow): number | string | undefined {
  const cut = liveCut(r);
  if (typeof cut === 'number' && typeof r.planQty === 'number') return cut - r.planQty;
  return cut === MASK || r.planQty === MASK ? MASK : undefined;
}

/** Dòng Tổng: cộng các màu cỡ; cột nào có ô bị Che thì tổng cũng che */
function totalRow(cells: CutRow[]): CutRow {
  const sum = (pick: (r: CutRow) => number | string | null | undefined) => {
    let n = 0;
    for (const r of cells) {
      const v = pick(r);
      if (v === MASK) return MASK;
      if (typeof v === 'number') n += v;
      else if (v === undefined) return undefined;
    }
    return n;
  };
  const day = sum((r) => (r.dayMasked ? MASK : r.dayQty));
  const savedDay = sum((r) => r.savedDay);
  return {
    key: TOTAL_KEY,
    colorName: `Tổng (${cells.length})`,
    sizeName: '',
    inPlan: true,
    total: true,
    planQty: sum((r) => r.planQty),
    // Như ảnh mẫu: chưa nhập gì trong ngày thì ô Tổng để trống
    dayQty: typeof day === 'number' && day > 0 ? day : null,
    savedDay: typeof savedDay === 'number' ? savedDay : null,
    savedCut: sum((r) => r.savedCut),
    dayMasked: day === MASK,
  };
}

/** Lưới vừa đổi: bỏ mọi thay đổi ở dòng Tổng, dòng chỉ xem; số âm, số lẻ về rỗng; tính lại dòng Tổng */
export function settle(next: CutRow[], prev: CutRow[], editable: (r: CutRow) => boolean): CutRow[] {
  const before = new Map(prev.map((r) => [r.key, r]));
  const cells = next
    .filter((r) => !r.total)
    .map((r) => {
      const old = before.get(r.key);
      if (!old) return r;
      if (!editable(old)) return old;
      const v = r.dayQty;
      return { ...old, dayQty: v === null || !Number.isInteger(v) || v < 0 ? null : v };
    });
  return [totalRow(cells), ...cells];
}

/** Ô đã sửa so với lần tải (gửi lên máy chủ, chỉ các ô này): 0 là xóa số của ngày */
export function changes(rows: CutRow[]) {
  return rows.filter((r) => !r.total && (r.dayQty ?? 0) !== (r.savedDay ?? 0)).map((r) => ({ colorName: r.colorName, sizeName: r.sizeName, dayQty: r.dayQty ?? 0 }));
}

/** Số lớn nhất một ô nhận (như máy chủ) */
export const MAX_DAY_QTY = 1_000_000;

/** Lý do chưa lưu được (null: lưu được) */
export function saveIssue(rows: CutRow[]): string | null {
  const over = rows.filter((r) => !r.total && (r.dayQty ?? 0) > MAX_DAY_QTY);
  if (over.length) return `Số trong ngày tối đa ${MAX_DAY_QTY.toLocaleString('vi-VN')} mỗi màu cỡ (${over.map((r) => `${r.colorName}/${r.sizeName}`).slice(0, 3).join(', ')}).`;
  return changes(rows).length ? null : 'Chưa có thay đổi nào';
}
