import { lineDates, type WorkCalendar } from '../../lib/workCalendar';
import type { ScheduleLine } from './api';

/**
 * Ngày của dòng dàn chuyền trên popup Chi tiết dàn chuyền (phase 5.12): tính trước theo lịch ĐVCS khi gõ, cùng công thức với máy
 * chủ (lib/workCalendar.ts), hoặc số máy chủ đã lưu với dòng người xem không sửa được.
 */

/** Số ngày sản xuất tối đa của một dòng, như máy chủ */
export const MAX_PRODUCTION_DAYS = 366;

/** Ô người dùng nhập; có thể trống khi đang gõ */
export interface LineInput {
  qty: number | null;
  avgOutput: number | null;
  startDate: string | null;
}

export const DATE_KEYS = ['endDate', 'outStartDate', 'outEndDate', 'warehouseStartDate', 'warehouseEndDate'] as const;
type DateKey = (typeof DATE_KEYS)[number];

export interface ShownDates extends Record<Exclude<DateKey, 'endDate'>, string | null> {
  offDays: number;
  endDate: string;
}
/** Phần số đã lưu của một dòng */
type StoredLine = Partial<Pick<ScheduleLine, 'productionDays' | 'offDays' | DateKey>>;

export interface Computed {
  productionDays?: number;
  /** Số ngày nghỉ và các ngày; null khi thiếu dữ liệu, quá 366 ngày, hoặc lịch không đủ ngày làm việc */
  dates: ShownDates | null;
}

export const NOT_YET: Computed = { dates: null };

export function computeLine(calendar: WorkCalendar | null, l: LineInput): Computed {
  if (!calendar || !l.qty || !l.avgOutput || !l.startDate) return NOT_YET;
  const productionDays = Math.ceil(l.qty / l.avgOutput);
  return { productionDays, dates: productionDays > MAX_PRODUCTION_DAYS ? null : lineDates(calendar, l.startDate, productionDays) };
}

/** Số máy chủ đã lưu của dòng (dòng ngoài phạm vi sửa không gửi lên, nên hiện đúng số trong database) */
export function storedOf(l: StoredLine): Computed {
  if (!l.endDate) return NOT_YET;
  return {
    productionDays: l.productionDays,
    dates: {
      offDays: l.offDays ?? 0,
      endDate: l.endDate,
      outStartDate: l.outStartDate ?? null,
      outEndDate: l.outEndDate ?? null,
      warehouseStartDate: l.warehouseStartDate ?? null,
      warehouseEndDate: l.warehouseEndDate ?? null,
    },
  };
}

/**
 * Dòng đã lưu mà số ngày nghỉ hay các ngày khác cách tính theo lịch hiện tại: lịch vừa đổi, hoặc ngày nhập tay trước phase 5.12.
 * Chỉ khi ô nhập của dòng còn như lúc lưu: người dùng vừa sửa số lượng, năng suất, ngày thì ngày khác đi là đương nhiên.
 */
export function isOutdated(saved: ScheduleLine, row: LineInput, now: Computed): boolean {
  if (saved.qty !== row.qty || saved.avgOutput !== row.avgOutput || saved.startDate !== row.startDate || !now.dates) return false;
  const was = storedOf(saved).dates;
  return !was || was.offDays !== now.dates.offDays || DATE_KEYS.some((k) => was[k] !== now.dates![k]);
}
