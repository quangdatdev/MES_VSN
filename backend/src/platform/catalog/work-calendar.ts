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

export interface CalendarOffsets {
  outStartOffsetDays: number;
  outEndOffsetDays: number;
  warehouseStartOffsetDays: number;
  warehouseEndOffsetDays: number;
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

/** Ngày làm việc thứ k sau ngày số `from` (k = 0: chính `from`); null khi quá MAX_SEARCH_DAYS */
function afterWorkingDays(cal: WorkCalendar, from: number, k: number): number | null {
  let n = from;
  for (let left = k; left > 0; ) {
    n++;
    if (n - from > MAX_SEARCH_DAYS) return null;
    if (!offAt(cal, n)) left--;
  }
  return n;
}

/** Ngày làm việc đầu tiên từ `iso` trở đi (chính nó nếu là ngày làm việc) */
export function nextWorkingDay(cal: WorkCalendar, iso: string): string | null {
  const s = dayNumber(iso);
  for (let n = s; n - s < MAX_SEARCH_DAYS; n++) if (!offAt(cal, n)) return isoOf(n);
  return null;
}

export interface LineDates {
  /** Số ngày nghỉ từ Bắt đầu vào chuyền tới Kết thúc vào chuyền (tính cả hai đầu) */
  offDays: number;
  /** Kết thúc vào chuyền = Bắt đầu + Số ngày SX + Số ngày nghỉ − 1 */
  endDate: string;
  outStartDate: string;
  outEndDate: string;
  warehouseStartDate: string;
  warehouseEndDate: string;
}

/**
 * Ngày của một dòng dàn chuyền. Đếm ngày làm việc từ Bắt đầu vào chuyền (tính cả ngày đầu) cho đủ Số ngày SX; mọi ngày nghỉ gặp
 * trên đường đếm là Số ngày nghỉ, kể cả ngày nghỉ chỉ lọt vào khoảng khi ngày kết thúc bị đẩy lùi. Bắt đầu rơi vào ngày nghỉ thì
 * đếm từ ngày làm việc kế tiếp, ngày đó tính vào Số ngày nghỉ. Ngày ra chuyền, nhập kho cộng theo ngày làm việc (người dùng chốt
 * 13/10/2026); Bắt đầu ra chuyền tính từ ngày làm việc đầu tiên của dòng. null: lịch không đủ ngày làm việc trong MAX_SEARCH_DAYS.
 */
export function lineDates(cal: WorkCalendar, start: string, productionDays: number): LineDates | null {
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

/** Ngày nghỉ trong khoảng [from, to] (bảng dàn chuyền tô); `name` chỉ có ở ngày đặc biệt */
export function nonWorkingDays(cal: WorkCalendar, from: string, to: string): { date: string; name: string | null }[] {
  const out: { date: string; name: string | null }[] = [];
  for (let n = dayNumber(from), end = dayNumber(to); n <= end; n++) {
    if (offAt(cal, n)) out.push({ date: isoOf(n), name: cal.days.get(isoOf(n))?.name ?? null });
  }
  return out;
}

/** Số ngày cộng thêm hợp lệ: ngày bắt đầu ra chuyền, nhập kho không sau ngày kết thúc tương ứng (như CHECK của MES_Core/0011) */
export const offsetsInOrder = (o: CalendarOffsets) =>
  o.outStartOffsetDays <= o.outEndOffsetDays && o.outStartOffsetDays + o.warehouseStartOffsetDays <= o.outEndOffsetDays + o.warehouseEndOffsetDays;

export const offsetsOf = (o: CalendarOffsets): CalendarOffsets => ({
  outStartOffsetDays: o.outStartOffsetDays,
  outEndOffsetDays: o.outEndOffsetDays,
  warehouseStartOffsetDays: o.warehouseStartOffsetDays,
  warehouseEndOffsetDays: o.warehouseEndOffsetDays,
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
    db.selectFrom('SysWorkCalendar').select(['Id', 'BranchCode', 'WeeklyOffMask', 'OutStartOffsetDays', 'OutEndOffsetDays', 'WarehouseStartOffsetDays', 'WarehouseEndOffsetDays']).execute(),
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
        days: daysOf.get(c.Id) ?? new Map(),
      },
    ]),
  );
}
