import type { Kysely } from 'kysely';
import type { CoreDatabase } from '../database/core.types';

/**
 * Lịch làm việc theo ĐVCS (phase 5.12) và cách tính ngày của dòng dàn chuyền. Hàm thuần, không đọc DB (trừ readWorkCalendars).
 * Bản sao ở frontend/src/lib/workCalendar.ts để xem trước khi gõ: hai bản chạy chung bộ ca test/fixtures/work-calendar-cases.json,
 * máy chủ tính lại khi lưu.
 */

export type CalendarDayType = 'OFF' | 'WORK';

/** Ngày đặc biệt: OFF nghỉ (lễ, Tết, nghỉ công ty), WORK làm việc dù trùng ngày nghỉ hằng tuần (làm bù) */
export interface CalendarDay {
  date: string;
  dayType: CalendarDayType;
  name: string | null;
}

/** Cấu hình số của lịch: số ngày cộng thêm cho ra chuyền, nhập kho và ngưỡng làm tròn Số ngày SX */
export interface CalendarOffsets {
  outStartOffsetDays: number;
  outEndOffsetDays: number;
  warehouseStartOffsetDays: number;
  warehouseEndOffsetDays: number;
  /** Số ngày SX = Số lượng / Năng suất TB: phần lẻ từ số này trở lên thì làm tròn lên một ngày, dưới thì bỏ (0,01–1; 15/10/2026) */
  productionRoundUpFrom: number;
}

export interface WorkCalendar extends CalendarOffsets {
  /** Ngày nghỉ hằng tuần, mỗi thứ một bit: 1 = thứ Hai … 64 = Chủ nhật */
  weeklyOffMask: number;
  /** Ngày đặc biệt theo YYYY-MM-DD */
  days: ReadonlyMap<string, CalendarDay>;
}

/** ĐVCS chưa có lịch: nghỉ Chủ nhật như trước phase 5.12; số ngày cộng thêm theo yêu cầu người dùng 13/10/2026 */
export const DEFAULT_WORK_CALENDAR: WorkCalendar = {
  weeklyOffMask: 64,
  outStartOffsetDays: 3,
  outEndOffsetDays: 3,
  warehouseStartOffsetDays: 2,
  warehouseEndOffsetDays: 5,
  // Người dùng yêu cầu 15/10/2026: 7,3 → 7 ngày, 7,5 → 8 ngày
  productionRoundUpFrom: 0.5,
  days: new Map(),
};

/** Khoảng tìm ngày làm việc tối đa: lịch nghỉ gần hết (nhập nhầm) không làm vòng lặp chạy mãi */
export const MAX_SEARCH_DAYS = 3 * 366;

const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const isoOf = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
/** Ngày số 0 (01/01/1970) là thứ Năm: bit 8 */
const weekdayBit = (n: number) => 1 << ((((n + 3) % 7) + 7) % 7);

/** Chuỗi YYYY-MM-DD là ngày có thật (loại 2026-02-30) */
export const isRealDate = (iso: string) => ISO_DAY.test(iso) && Number.isFinite(dayNumber(iso)) && isoOf(dayNumber(iso)) === iso;

export const addCalendarDays = (iso: string, n: number) => isoOf(dayNumber(iso) + n);

/** Thứ trong tuần theo ISO (1 = thứ Hai … 7 = Chủ nhật) có trong mặt nạ */
export const weekdaysOf = (mask: number) => [1, 2, 3, 4, 5, 6, 7].filter((d) => (mask & (1 << (d - 1))) !== 0);
export const maskOf = (weekdays: readonly number[]) => weekdays.reduce((m, d) => m | (1 << (d - 1)), 0);

function offAt(cal: WorkCalendar, n: number): boolean {
  const special = cal.days.get(isoOf(n));
  if (special) return special.dayType === 'OFF';
  return (cal.weeklyOffMask & weekdayBit(n)) !== 0;
}

export const isOffDay = (cal: WorkCalendar, iso: string) => offAt(cal, dayNumber(iso));

/** Ngày làm việc đầu tiên từ `iso` trở đi (chính nó nếu là ngày làm việc) */
export function nextWorkingDay(cal: WorkCalendar, iso: string): string | null {
  const s = dayNumber(iso);
  for (let n = s; n - s < MAX_SEARCH_DAYS; n++) if (!offAt(cal, n)) return isoOf(n);
  return null;
}

export interface LineDates {
  /** Số ngày nghỉ sau Bắt đầu vào chuyền, tới Kết thúc vào chuyền (không tính ngày bắt đầu) */
  offDays: number;
  /** Kết thúc vào chuyền = Bắt đầu + Số ngày SX + Số ngày nghỉ */
  endDate: string;
  outStartDate: string;
  outEndDate: string;
  warehouseStartDate: string;
  warehouseEndDate: string;
}

/**
 * Ngày của một dòng dàn chuyền, theo công thức người dùng chốt 15/10/2026 (cách tính 13/10 cộng lố so với thực tế xưởng):
 * Kết thúc vào chuyền = Bắt đầu + Số ngày SX + Số ngày nghỉ, tức ngày làm việc thứ Số ngày SX kể từ sau ngày bắt đầu; Số ngày nghỉ
 * là mọi ngày nghỉ gặp trên đường đếm, kể cả ngày nghỉ chỉ lọt vào khi ngày kết thúc bị đẩy lùi. Ngày ra chuyền, nhập kho cộng
 * ngày lịch, không bỏ qua ngày nghỉ (bắt đầu 15/10 cộng 3 là 18/10 dù là Chủ nhật). null: lịch không đủ ngày làm việc trong
 * MAX_SEARCH_DAYS.
 */
export function lineDates(cal: WorkCalendar, start: string, productionDays: number): LineDates | null {
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

/** Số ngày nghỉ sau `from` tới hết `to` (Kết thúc vào chuyền nhập tay: số ngày nghỉ đếm lại theo ngày đã nhập) */
export function offDaysBetween(cal: WorkCalendar, from: string, to: string): number {
  let count = 0;
  for (let n = dayNumber(from) + 1, end = dayNumber(to); n <= end; n++) if (offAt(cal, n)) count++;
  return count;
}

/**
 * Thứ tự các ngày của một dòng (nhập tay được từ 15/10/2026): lỗi đầu tiên kèm cột, hoặc null. Ngày theo công thức luôn qua.
 * Giới hạn xa nhất giữ vòng đếm số ngày nghỉ ngắn.
 */
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

/** Ngày nghỉ trong khoảng [from, to] (bảng dàn chuyền tô); `name` chỉ có ở ngày đặc biệt */
export function nonWorkingDays(cal: WorkCalendar, from: string, to: string): { date: string; name: string | null }[] {
  const out: { date: string; name: string | null }[] = [];
  for (let n = dayNumber(from), end = dayNumber(to); n <= end; n++) {
    if (offAt(cal, n)) out.push({ date: isoOf(n), name: cal.days.get(isoOf(n))?.name ?? null });
  }
  return out;
}

/** Số ngày cộng thêm hợp lệ: ngày bắt đầu ra chuyền, nhập kho không sau ngày kết thúc tương ứng (như CHECK của MES_Core/0011) */
export const offsetsInOrder = (o: Omit<CalendarOffsets, 'productionRoundUpFrom'>) =>
  o.outStartOffsetDays <= o.outEndOffsetDays && o.outStartOffsetDays + o.warehouseStartOffsetDays <= o.outEndOffsetDays + o.warehouseEndOffsetDays;

/**
 * Số ngày SX của một dòng: Số lượng / Năng suất TB, phần lẻ từ ngưỡng của lịch trở lên thì thêm một ngày; ít nhất 1 ngày. Tính bằng
 * số nguyên (phần dư so với ngưỡng theo phần trăm) để 7,5 không thành 7,4999 do số thực.
 */
export function productionDaysOf(cal: Pick<CalendarOffsets, 'productionRoundUpFrom'>, qty: number, avgOutput: number): number {
  const whole = Math.floor(qty / avgOutput);
  const rest = qty - whole * avgOutput;
  const roundUp = rest > 0 && rest * 100 >= Math.round(cal.productionRoundUpFrom * 100) * avgOutput;
  return Math.max(1, whole + (roundUp ? 1 : 0));
}

export const offsetsOf = (o: CalendarOffsets): CalendarOffsets => ({
  outStartOffsetDays: o.outStartOffsetDays,
  outEndOffsetDays: o.outEndOffsetDays,
  warehouseStartOffsetDays: o.warehouseStartOffsetDays,
  warehouseEndOffsetDays: o.warehouseEndOffsetDays,
  productionRoundUpFrom: o.productionRoundUpFrom,
});

/**
 * Lịch dạng JSON cho giao diện (cùng dạng đầu vào của bản frontend). `from`: chỉ ngày đặc biệt từ ngày này trở đi (cách tính chỉ
 * nhìn về sau ngày bắt đầu), để số ngày trả về không tăng mãi theo số năm đã nhập.
 */
export function presentCalendar(cal: WorkCalendar, from?: string) {
  return {
    weeklyOffDays: weekdaysOf(cal.weeklyOffMask),
    ...offsetsOf(cal),
    days: [...cal.days.values()].filter((d) => !from || d.date >= from).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** Mọi lịch đã cấu hình theo mã ĐVCS (ĐVCS không có trong kết quả dùng DEFAULT_WORK_CALENDAR) */
export async function readWorkCalendars(db: Kysely<CoreDatabase>): Promise<Map<string, WorkCalendar>> {
  const [calendars, days] = await Promise.all([
    db.selectFrom('SysWorkCalendar').select(['Id', 'BranchCode', 'WeeklyOffMask', 'OutStartOffsetDays', 'OutEndOffsetDays', 'WarehouseStartOffsetDays', 'WarehouseEndOffsetDays', 'ProductionRoundUpFrom']).execute(),
    db.selectFrom('SysWorkCalendarDay').select(['WorkCalendarId', 'CalendarDate', 'DayType', 'Name']).orderBy('CalendarDate').execute(),
  ]);
  const daysOf = new Map<number, Map<string, CalendarDay>>();
  for (const d of days) {
    const date = d.CalendarDate.toISOString().slice(0, 10);
    const map = daysOf.get(d.WorkCalendarId) ?? new Map<string, CalendarDay>();
    map.set(date, { date, dayType: d.DayType, name: d.Name });
    daysOf.set(d.WorkCalendarId, map);
  }
  return new Map(
    calendars.map((c) => [
      c.BranchCode,
      {
        weeklyOffMask: c.WeeklyOffMask,
        outStartOffsetDays: c.OutStartOffsetDays,
        outEndOffsetDays: c.OutEndOffsetDays,
        warehouseStartOffsetDays: c.WarehouseStartOffsetDays,
        warehouseEndOffsetDays: c.WarehouseEndOffsetDays,
        productionRoundUpFrom: Number(c.ProductionRoundUpFrom),
        days: daysOf.get(c.Id) ?? new Map(),
      },
    ]),
  );
}
