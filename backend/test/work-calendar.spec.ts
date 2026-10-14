import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addCalendarDays,
  DEFAULT_WORK_CALENDAR,
  isOffDay,
  isRealDate,
  lineDates,
  maskOf,
  MAX_SEARCH_DAYS,
  nextWorkingDay,
  nonWorkingDays,
  offsetsInOrder,
  presentCalendar,
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
  days: CalendarDay[];
}
const fixture: { calendars: Record<string, JsonCalendar>; cases: { name: string; calendar: string; start: string; productionDays: number; expect: unknown }[] } = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'work-calendar-cases.json'), 'utf8'),
);
const calendarOf = ({ weeklyOffDays, days, ...offsets }: JsonCalendar): WorkCalendar => ({ ...offsets, weeklyOffMask: maskOf(weeklyOffDays), days: new Map(days.map((d) => [d.date, d])) });

describe('Lịch làm việc: tính ngày dòng dàn chuyền', () => {
  it.each(fixture.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(lineDates(calendarOf(fixture.calendars[c.calendar]), c.start, c.productionDays)).toEqual(c.expect);
  });

  it('Kết thúc vào chuyền = Bắt đầu + Số ngày SX + Số ngày nghỉ − 1, với mọi ngày bắt đầu trong một năm có Tết', () => {
    const cal = calendarOf(fixture.calendars.tet2027);
    for (let i = 0; i < 400; i++) {
      const start = addCalendarDays('2026-12-01', i);
      for (const days of [1, 3, 9, 20]) {
        const d = lineDates(cal, start, days)!;
        expect(d.endDate).toBe(addCalendarDays(start, days + d.offDays - 1));
        expect(isOffDay(cal, d.endDate)).toBe(false);
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
    // Đủ ngày làm việc nhưng số ngày cộng thêm vượt khoảng tìm
    const sparse: WorkCalendar = { ...DEFAULT_WORK_CALENDAR, weeklyOffMask: maskOf([1, 2, 3, 4, 5, 6]), outStartOffsetDays: 60, outEndOffsetDays: 60, days: new Map() };
    expect(lineDates(sparse, '2026-10-04', 1)).not.toBeNull();
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
    expect(offsetsInOrder({ outStartOffsetDays: 3, outEndOffsetDays: 3, warehouseStartOffsetDays: 6, warehouseEndOffsetDays: 5 })).toBe(false);
    expect(presentCalendar(calendarOf(fixture.calendars.sundayWork))).toEqual(fixture.calendars.sundayWork);
  });
});
