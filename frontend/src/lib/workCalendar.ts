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
    days: new Map(json.days.map((d) => [d.date, d])),
  };
}

function offAt(cal: WorkCalendar, n: number): boolean {
  const special = cal.days.get(isoOf(n));
  if (special) return special.dayType === 'OFF';
  return (cal.weeklyOffMask & weekdayBit(n)) !== 0;
}

export const isOffDay = (cal: WorkCalendar, iso: string) => offAt(cal, dayNumber(iso));

function afterWorkingDays(cal: WorkCalendar, from: number, k: number): number | null {
  let n = from;
  for (let left = k; left > 0; ) {
    n++;
    if (n - from > MAX_SEARCH_DAYS) return null;
    if (!offAt(cal, n)) left--;
  }
  return n;
}

/**
 * Ngày của một dòng dàn chuyền, cùng công thức với máy chủ: đếm ngày làm việc từ Bắt đầu vào chuyền (tính cả ngày đầu) cho đủ Số
 * ngày SX, ngày nghỉ gặp trên đường là Số ngày nghỉ; ra chuyền, nhập kho cộng theo ngày làm việc. null: ngày sai dạng, hoặc lịch
 * không đủ ngày làm việc.
 */
export function lineDates(cal: WorkCalendar, start: string, productionDays: number): LineDates | null {
  if (!ISO_DAY.test(start)) return null;
  const s = dayNumber(start);
  if (!Number.isFinite(s)) return null;
  const target = Math.max(1, Math.trunc(productionDays));
  let n = s;
  let worked = 0;
  let offDays = 0;
  let first = -1;
  for (;;) {
    if (n - s >= MAX_SEARCH_DAYS) return null;
    if (offAt(cal, n)) offDays++;
    else {
      if (first < 0) first = n;
      if (++worked === target) break;
    }
    n++;
  }
  const outStart = afterWorkingDays(cal, first, cal.outStartOffsetDays);
  const outEnd = afterWorkingDays(cal, n, cal.outEndOffsetDays);
  if (outStart === null || outEnd === null) return null;
  const warehouseStart = afterWorkingDays(cal, outStart, cal.warehouseStartOffsetDays);
  const warehouseEnd = afterWorkingDays(cal, outEnd, cal.warehouseEndOffsetDays);
  if (warehouseStart === null || warehouseEnd === null) return null;
  return {
    offDays,
    endDate: isoOf(n),
    outStartDate: isoOf(outStart),
    outEndDate: isoOf(outEnd),
    warehouseStartDate: isoOf(warehouseStart),
    warehouseEndDate: isoOf(warehouseEnd),
  };
}

/** Số ngày cộng thêm hợp lệ: ngày bắt đầu ra chuyền, nhập kho không sau ngày kết thúc tương ứng (như máy chủ) */
export const offsetsInOrder = (o: CalendarOffsets) =>
  o.outStartOffsetDays <= o.outEndOffsetDays && o.outStartOffsetDays + o.warehouseStartOffsetDays <= o.outEndOffsetDays + o.warehouseEndOffsetDays;
