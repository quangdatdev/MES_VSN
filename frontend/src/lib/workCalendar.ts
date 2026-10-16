/**
 * Lịch làm việc theo ĐVCS (phase 5.12): bản sao của backend/src/platform/catalog/work-calendar.ts để màn Chi tiết dàn chuyền
 * tính trước các ngày khi gõ. Hai bản chạy chung bộ ca backend/test/fixtures/work-calendar-cases.json; khi lưu, máy chủ tính lại
 * và kết quả của máy chủ là chuẩn.
 */

export type CalendarDayType = 'OFF' | 'WORK';

export interface CalendarDay {
  date: string;
  dayType: CalendarDayType;
  name: string | null;
}

export interface CalendarOffsets {
  outStartOffsetDays: number;
  outEndOffsetDays: number;
  warehouseStartOffsetDays: number;
  warehouseEndOffsetDays: number;
  /** Phần lẻ của Số lượng / Năng suất TB từ số này trở lên thì làm tròn lên một ngày (0,01–1) */
  productionRoundUpFrom: number;
}

/** Lịch như máy chủ trả (chi tiết kế hoạch, danh mục): thứ nghỉ theo ISO, 1 = thứ Hai … 7 = Chủ nhật */
export interface WorkCalendarJson extends CalendarOffsets {
  weeklyOffDays: number[];
  days: CalendarDay[];
}

export interface WorkCalendar extends CalendarOffsets {
  weeklyOffMask: number;
  days: ReadonlyMap<string, CalendarDay>;
}

export interface LineDates {
  offDays: number;
  endDate: string;
  outStartDate: string;
  outEndDate: string;
  warehouseStartDate: string;
  warehouseEndDate: string;
}

/** Như máy chủ: khoảng tìm ngày làm việc tối đa */
const MAX_SEARCH_DAYS = 3 * 366;
const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const isoOf = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
/** Ngày số 0 (01/01/1970) là thứ Năm */
const weekdayBit = (n: number) => 1 << ((((n + 3) % 7) + 7) % 7);

export const WEEKDAYS = [
  { value: 1, short: 'T2', label: 'Thứ Hai' },
  { value: 2, short: 'T3', label: 'Thứ Ba' },
  { value: 3, short: 'T4', label: 'Thứ Tư' },
  { value: 4, short: 'T5', label: 'Thứ Năm' },
  { value: 5, short: 'T6', label: 'Thứ Sáu' },
  { value: 6, short: 'T7', label: 'Thứ Bảy' },
  { value: 7, short: 'CN', label: 'Chủ nhật' },
] as const;

export const maskOf = (weekdays: readonly number[]) => weekdays.reduce((m, d) => m | (1 << (d - 1)), 0);

/** Thứ trong tuần theo ISO (1 = thứ Hai … 7 = Chủ nhật) */
export const isoWeekday = (iso: string) => ((((dayNumber(iso) + 3) % 7) + 7) % 7) + 1;

export function toCalendar(json: WorkCalendarJson): WorkCalendar {
  return {
    weeklyOffMask: maskOf(json.weeklyOffDays),
    outStartOffsetDays: json.outStartOffsetDays,
    outEndOffsetDays: json.outEndOffsetDays,
    warehouseStartOffsetDays: json.warehouseStartOffsetDays,
    warehouseEndOffsetDays: json.warehouseEndOffsetDays,
    // Máy chủ cũ (trước MES_Core/0014) không trả ngưỡng: dùng mặc định như máy chủ
    productionRoundUpFrom: json.productionRoundUpFrom ?? 0.5,
    days: new Map(json.days.map((d) => [d.date, d])),
  };
}

function offAt(cal: WorkCalendar, n: number): boolean {
  const special = cal.days.get(isoOf(n));
  if (special) return special.dayType === 'OFF';
  return (cal.weeklyOffMask & weekdayBit(n)) !== 0;
}

export const isOffDay = (cal: WorkCalendar, iso: string) => offAt(cal, dayNumber(iso));

/**
 * Ngày của một dòng dàn chuyền, cùng công thức với máy chủ: Kết thúc vào chuyền là ngày làm việc thứ Số ngày SX kể từ sau Bắt đầu
 * vào chuyền, ngày nghỉ gặp trên đường là Số ngày nghỉ; ra chuyền, nhập kho cộng ngày lịch. null: ngày sai dạng, hoặc lịch không
 * đủ ngày làm việc.
 */
export function lineDates(cal: WorkCalendar, start: string, productionDays: number): LineDates | null {
  if (!ISO_DAY.test(start)) return null;
  const s = dayNumber(start);
  if (!Number.isFinite(s) || Number.isNaN(productionDays)) return null;
  const target = Math.max(1, Math.trunc(productionDays));
  let n = s;
  let offDays = 0;
  for (let worked = 0; worked < target; ) {
    n++;
    if (n - s > MAX_SEARCH_DAYS) return null;
    if (offAt(cal, n)) offDays++;
    else worked++;
  }
  const outStart = s + cal.outStartOffsetDays;
  const outEnd = n + cal.outEndOffsetDays;
  return {
    offDays,
    endDate: isoOf(n),
    outStartDate: isoOf(outStart),
    outEndDate: isoOf(outEnd),
    warehouseStartDate: isoOf(outStart + cal.warehouseStartOffsetDays),
    warehouseEndDate: isoOf(outEnd + cal.warehouseEndOffsetDays),
  };
}

export const DATE_KEYS = ['endDate', 'outStartDate', 'outEndDate', 'warehouseStartDate', 'warehouseEndDate'] as const;
export type DateKey = (typeof DATE_KEYS)[number];
export type LineDateValues = Pick<LineDates, DateKey>;

/** Như máy chủ: số ngày nghỉ sau `from` tới hết `to` */
export function offDaysBetween(cal: WorkCalendar, from: string, to: string): number {
  let count = 0;
  for (let n = dayNumber(from) + 1, end = dayNumber(to); n <= end; n++) if (offAt(cal, n)) count++;
  return count;
}

/** Như máy chủ: thứ tự các ngày của một dòng (nhập tay được), lỗi đầu tiên kèm cột hoặc null */
export function datesOrderError(start: string, d: LineDateValues): { key: DateKey; message: string } | null {
  const limit = isoOf(dayNumber(start) + 2 * MAX_SEARCH_DAYS);
  const far = DATE_KEYS.find((k) => d[k] > limit);
  if (far) return { key: far, message: 'Ngày cách ngày bắt đầu vào chuyền quá 6 năm.' };
  const rules: [DateKey, boolean, string][] = [
    ['endDate', d.endDate < start, 'Kết thúc vào chuyền trước ngày bắt đầu vào chuyền.'],
    ['outStartDate', d.outStartDate < start, 'Bắt đầu ra chuyền trước ngày bắt đầu vào chuyền.'],
    ['outEndDate', d.outEndDate < d.outStartDate, 'Kết thúc ra chuyền trước ngày bắt đầu ra chuyền.'],
    ['warehouseStartDate', d.warehouseStartDate < d.outStartDate, 'Bắt đầu nhập kho trước ngày bắt đầu ra chuyền.'],
    ['warehouseEndDate', d.warehouseEndDate < d.warehouseStartDate, 'Kết thúc nhập kho trước ngày bắt đầu nhập kho.'],
  ];
  const hit = rules.find(([, wrong]) => wrong);
  return hit ? { key: hit[0], message: hit[2] } : null;
}

/** Như máy chủ: Số ngày SX = Số lượng / Năng suất TB, phần lẻ từ ngưỡng của lịch trở lên thì thêm một ngày; ít nhất 1 ngày */
export function productionDaysOf(cal: Pick<CalendarOffsets, 'productionRoundUpFrom'>, qty: number, avgOutput: number): number {
  const whole = Math.floor(qty / avgOutput);
  const rest = qty - whole * avgOutput;
  const roundUp = rest > 0 && rest * 100 >= Math.round(cal.productionRoundUpFrom * 100) * avgOutput;
  return Math.max(1, whole + (roundUp ? 1 : 0));
}

/** Số ngày cộng thêm hợp lệ: ngày bắt đầu ra chuyền, nhập kho không sau ngày kết thúc tương ứng (như máy chủ) */
export const offsetsInOrder = (o: Omit<CalendarOffsets, 'productionRoundUpFrom'>) =>
  o.outStartOffsetDays <= o.outEndOffsetDays && o.outStartOffsetDays + o.warehouseStartOffsetDays <= o.outEndOffsetDays + o.warehouseEndOffsetDays;
