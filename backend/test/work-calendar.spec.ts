import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addCalendarDays,
  datesOrderError,
  DEFAULT_WORK_CALENDAR,
  isOffDay,
  isRealDate,
  lineDates,
  maskOf,
  MAX_SEARCH_DAYS,
  nextWorkingDay,
  nonWorkingDays,
  offDaysBetween,
  offsetsInOrder,
  presentCalendar,
  productionDaysOf,
  weekdaysOf,
  type CalendarDay,
  type WorkCalendar,
} from '../src/platform/catalog/work-calendar';

// Không cần database: hàm tính ngày dàn chuyền theo lịch ĐVCS (phase 5.12). Bộ ca chung với bản frontend ở fixtures
interface JsonCalendar {
  weeklyOffDays: number[];
  outStartOffsetDays: number;
  outEndOffsetDays: number;
  warehouseStartOffsetDays: number;
  warehouseEndOffsetDays: number;
  productionRoundUpFrom: number;
  days: CalendarDay[];
}
const fixture: {
  calendars: Record<string, JsonCalendar>;
  rounding: { name: string; roundUpFrom: number; qty: number; avgOutput: number; expect: number }[];
  cases: { name: string; calendar: string; start: string; productionDays: number; expect: unknown }[] } = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'work-calendar-cases.json'), 'utf8'),
);
const calendarOf = ({ weeklyOffDays, days, ...offsets }: JsonCalendar): WorkCalendar => ({ ...offsets, weeklyOffMask: maskOf(weeklyOffDays), days: new Map(days.map((d) => [d.date, d])) });

describe('Lịch làm việc: tính ngày dòng dàn chuyền', () => {
  it.each(fixture.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(lineDates(calendarOf(fixture.calendars[c.calendar]), c.start, c.productionDays)).toEqual(c.expect);
  });

  it('Kết thúc vào chuyền = Bắt đầu + Số ngày SX + Số ngày nghỉ, ra chuyền, nhập kho cộng ngày lịch, với mọi ngày bắt đầu trong một năm có Tết', () => {
    const cal = calendarOf(fixture.calendars.tet2027);
    for (let i = 0; i < 400; i++) {
      const start = addCalendarDays('2026-12-01', i);
      for (const days of [1, 3, 9, 20]) {
        const d = lineDates(cal, start, days)!;
        expect(d.endDate).toBe(addCalendarDays(start, days + d.offDays));
        // Ngày bắt đầu không tính: kết thúc luôn sau ngày bắt đầu
        expect(d.endDate > start).toBe(true);
        expect(isOffDay(cal, d.endDate)).toBe(false);
        expect(d.outStartDate).toBe(addCalendarDays(start, cal.outStartOffsetDays));
        expect(d.outEndDate).toBe(addCalendarDays(d.endDate, cal.outEndOffsetDays));
        expect(d.warehouseStartDate).toBe(addCalendarDays(d.outStartDate, cal.warehouseStartOffsetDays));
        expect(d.warehouseEndDate).toBe(addCalendarDays(d.outEndDate, cal.warehouseEndOffsetDays));
        // Thứ tự ngày đúng khi số ngày cộng thêm hợp lệ
        expect(d.outStartDate <= d.outEndDate && d.warehouseStartDate <= d.warehouseEndDate).toBe(true);
        expect(d.outEndDate >= d.endDate && d.warehouseEndDate >= d.outEndDate).toBe(true);
      }
    }
  });

  it('lịch gần như nghỉ hết: trả null, không chạy mãi', () => {
    // Chỉ làm Chủ nhật, mà mọi Chủ nhật trong khoảng tìm đều đặt nghỉ
    const days = new Map<string, CalendarDay>();
    for (let i = 0; i <= MAX_SEARCH_DAYS + 7; i++) {
      const date = addCalendarDays('2026-10-04', i);
      days.set(date, { date, dayType: 'OFF', name: null });
    }
    const cal: WorkCalendar = { ...DEFAULT_WORK_CALENDAR, weeklyOffMask: maskOf([1, 2, 3, 4, 5, 6]), days };
    expect(lineDates(cal, '2026-10-05', 1)).toBeNull();
    expect(nextWorkingDay(cal, '2026-10-05')).toBeNull();
    // Ngày làm việc thưa: số ngày cộng thêm lớn vẫn tính được (cộng ngày lịch, không tìm ngày làm việc)
    const sparse: WorkCalendar = { ...DEFAULT_WORK_CALENDAR, weeklyOffMask: maskOf([1, 2, 3, 4, 5, 6]), outStartOffsetDays: 60, outEndOffsetDays: 60, days: new Map() };
    expect(lineDates(sparse, '2026-10-04', 1)).toEqual({ offDays: 6, endDate: '2026-10-11', outStartDate: '2026-12-03', outEndDate: '2026-12-10', warehouseStartDate: '2026-12-05', warehouseEndDate: '2026-12-15' });
    expect(lineDates(DEFAULT_WORK_CALENDAR, '2026-10-05', Number.NaN)).toBeNull();
  });

  it('ngày nhập tay: số ngày nghỉ đếm sau ngày bắt đầu tới ngày kết thúc; thứ tự các ngày; ngày theo công thức luôn hợp lệ', () => {
    const cal = calendarOf(fixture.calendars.tet2027);
    expect(offDaysBetween(cal, '2027-02-01', '2027-02-14')).toBe(7);
    expect(offDaysBetween(cal, '2027-02-04', '2027-02-04')).toBe(0);
    for (const c of fixture.cases) {
      const d = lineDates(calendarOf(fixture.calendars[c.calendar]), c.start, c.productionDays)!;
      expect(datesOrderError(c.start, d)).toBeNull();
      expect(offDaysBetween(calendarOf(fixture.calendars[c.calendar]), c.start, d.endDate)).toBe(d.offDays);
    }
    const ok = { endDate: '2026-12-10', outStartDate: '2026-12-08', outEndDate: '2026-12-13', warehouseStartDate: '2026-12-10', warehouseEndDate: '2026-12-18' };
    expect(datesOrderError('2026-12-05', ok)).toBeNull();
    expect(datesOrderError('2026-12-05', { ...ok, endDate: '2026-12-05' })).toBeNull();
    expect(datesOrderError('2026-12-05', { ...ok, endDate: '2026-12-04' })?.key).toBe('endDate');
    expect(datesOrderError('2026-12-05', { ...ok, outStartDate: '2026-12-04' })?.key).toBe('outStartDate');
    expect(datesOrderError('2026-12-05', { ...ok, outEndDate: '2026-12-07' })?.key).toBe('outEndDate');
    expect(datesOrderError('2026-12-05', { ...ok, warehouseStartDate: '2026-12-07' })?.key).toBe('warehouseStartDate');
    expect(datesOrderError('2026-12-05', { ...ok, warehouseEndDate: '2026-12-09' })?.key).toBe('warehouseEndDate');
    expect(datesOrderError('2026-12-05', { ...ok, warehouseEndDate: '2032-12-31' })).toEqual({ key: 'warehouseEndDate', message: 'Ngày cách ngày bắt đầu vào chuyền quá 6 năm.' });
  });

  it.each(fixture.rounding.map((c) => [c.name, c] as const))('Số ngày SX làm tròn theo ngưỡng của lịch: %s', (_name, c) => {
    expect(productionDaysOf({ productionRoundUpFrom: c.roundUpFrom }, c.qty, c.avgOutput)).toBe(c.expect);
  });

  it('ngày nghỉ trong khoảng cho bảng dàn chuyền: Chủ nhật, ngày lễ có tên, làm bù không có', () => {
    const cal = calendarOf(fixture.calendars.tet2027);
    expect(nonWorkingDays(cal, '2027-02-03', '2027-02-15')).toEqual([
      ...['04', '05', '06', '07', '08', '09', '10'].map((d) => ({ date: `2027-02-${d}`, name: 'Tết Nguyên đán' })),
    ]);
    expect(nonWorkingDays(DEFAULT_WORK_CALENDAR, '2026-10-05', '2026-10-18')).toEqual([
      { date: '2026-10-11', name: null },
      { date: '2026-10-18', name: null },
    ]);
  });

  it('mặt nạ ngày nghỉ hằng tuần, ngày có thật, thứ tự số ngày cộng thêm, dạng trả giao diện', () => {
    expect(maskOf([7])).toBe(64);
    expect(maskOf([6, 7])).toBe(96);
    expect(weekdaysOf(96)).toEqual([6, 7]);
    expect(isRealDate('2026-02-28')).toBe(true);
    expect(isRealDate('2026-02-30')).toBe(false);
    expect(isRealDate('2026-2-3')).toBe(false);
    expect(offsetsInOrder(DEFAULT_WORK_CALENDAR)).toBe(true);
    expect(offsetsInOrder({ outStartOffsetDays: 4, outEndOffsetDays: 3, warehouseStartOffsetDays: 0, warehouseEndOffsetDays: 9 })).toBe(false);
    expect(DEFAULT_WORK_CALENDAR.productionRoundUpFrom).toBe(0.5);
    expect(offsetsInOrder({ outStartOffsetDays: 3, outEndOffsetDays: 3, warehouseStartOffsetDays: 6, warehouseEndOffsetDays: 5 })).toBe(false);
    expect(presentCalendar(calendarOf(fixture.calendars.sundayWork))).toEqual(fixture.calendars.sundayWork);
  });
});
