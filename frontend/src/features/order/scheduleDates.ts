import { DATE_KEYS, lineDates, productionDaysOf, type DateKey, type LineDates, type WorkCalendar } from '../../lib/workCalendar';
import type { ScheduleLine } from './api';

/**
 * Ngày của dòng dàn chuyền trên popup Chi tiết dàn chuyền. Công thức theo lịch ĐVCS (lib/workCalendar.ts, cùng máy chủ) điền
 * năm cột ngày; người dùng sửa tay được từng cột (15/10/2026), sửa Số lượng, Năng suất TB hoặc Bắt đầu vào chuyền thì cả năm
 * cột tính lại theo công thức.
 */

export { DATE_KEYS };
export type { DateKey };

/** Số ngày sản xuất tối đa của một dòng, như máy chủ */
export const MAX_PRODUCTION_DAYS = 366;

/** Ô người dùng nhập; có thể trống khi đang gõ */
export interface LineInput {
  qty: number | null;
  avgOutput: number | null;
  startDate: string | null;
}

/** Dòng của lưới: ô nhập, năm ngày (trống khi chưa tính được) */
export interface SettleRow extends LineInput, Partial<Record<DateKey, string | null>> {
  key: number;
  editable?: boolean;
}

export interface Computed {
  productionDays?: number;
  /** Ngày theo công thức; null khi thiếu dữ liệu, quá 366 ngày, lịch không đủ ngày làm việc, hoặc dòng không sửa được */
  formula: LineDates | null;
}

export const NOT_YET: Computed = { formula: null };

export function computeLine(calendar: WorkCalendar | null, l: LineInput): Computed {
  if (!calendar || !l.qty || !l.avgOutput || !l.startDate) return NOT_YET;
  const productionDays = productionDaysOf(calendar, l.qty, l.avgOutput);
  return { productionDays, formula: productionDays > MAX_PRODUCTION_DAYS ? null : lineDates(calendar, l.startDate, productionDays) };
}

/** Số máy chủ đã lưu của dòng ngoài phạm vi sửa (không gửi lên, không tính lại) */
export const storedOf = (l: Pick<ScheduleLine, 'productionDays'>): Computed => ({ productionDays: l.productionDays, formula: null });

/**
 * Điền năm cột ngày sau một lần sửa lưới (`prev` → `next`, khớp dòng theo `key`):
 * - dòng vừa đổi Số lượng, Năng suất TB hoặc Bắt đầu vào chuyền (hoặc dòng mới): ngày theo công thức, trừ ô ngày được nhập, dán
 *   cùng lượt (dán cả dòng từ Excel giữ ngày đã dán);
 * - dòng khác: giữ ngày đang có, ô ngày bị xóa trống thì lấy lại ngày theo công thức;
 * - cột trong `locked` (chính sách cột không cho sửa) không coi là vừa nhập: chỉ đổi khi ô nhập đổi, như máy chủ giữ ngày đã lưu
 *   khi không nhận ngày đó (review 5.12.2 H1).
 * Ô "nhập cùng lượt" nhận ra bằng giá trị khác trước: dán trùng đúng ngày cũ cùng lúc đổi ô nhập thì ô đó theo công thức (thư viện
 * không cho biết ô nào vừa được ghi).
 * Dòng không đổi giữ nguyên đối tượng (lưới nhớ kết quả theo đối tượng dòng).
 */
export function settleDates<T extends SettleRow>(prev: readonly T[], next: readonly T[], calendar: WorkCalendar | null, locked: readonly DateKey[] = []): T[] {
  const before = new Map(prev.map((r) => [r.key, r]));
  return next.map((r) => {
    if (r.editable === false) return r;
    const old = before.get(r.key);
    if (old === r) return r;
    const inputsChanged = !old || old.qty !== r.qty || old.avgOutput !== r.avgOutput || old.startDate !== r.startDate;
    const formula = computeLine(calendar, r).formula;
    let out = r;
    for (const k of DATE_KEYS) {
      const value = r[k] ?? null;
      const typed = !locked.includes(k) && value !== null && (!old || (old[k] ?? null) !== value);
      const want = (inputsChanged ? !typed : value === null) ? (formula?.[k] ?? (inputsChanged ? null : value)) : value;
      if (want !== (out[k] ?? null)) out = { ...out, [k]: want };
    }
    return out;
  });
}

/** Lúc mở popup: giữ ngày đã lưu (kể cả ngày điều chỉnh tay, kể cả cột không sửa được), chỉ điền ô trống theo công thức */
export function fillGaps<T extends SettleRow>(rows: readonly T[], calendar: WorkCalendar | null): T[] {
  return rows.map((r) => {
    if (r.editable === false || DATE_KEYS.every((k) => r[k] != null)) return r;
    const formula = computeLine(calendar, r).formula;
    return formula ? { ...r, ...Object.fromEntries(DATE_KEYS.filter((k) => r[k] == null).map((k) => [k, formula[k]])) } : r;
  });
}

/** Cột ngày của dòng khác ngày theo công thức (đã điều chỉnh tay, hoặc lưu theo lịch, cách tính cũ) */
export function adjustedKeys(row: Partial<Record<DateKey, string | null>>, formula: LineDates | null): DateKey[] {
  return formula ? DATE_KEYS.filter((k) => (row[k] ?? null) !== formula[k]) : [];
}
