import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isOffDay, isoWeekday, lineDates, offsetsInOrder, productionDaysOf, toCalendar, type WorkCalendarJson } from '../lib/workCalendar';

// Bộ ca chung với backend (backend/test/work-calendar.spec.ts): bản tính ở giao diện phải ra đúng như máy chủ
const fixture: {
  calendars: Record<string, WorkCalendarJson>;
  rounding: { name: string; roundUpFrom: number; qty: number; avgOutput: number; expect: number }[];
  cases: { name: string; calendar: string; start: string; productionDays: number; expect: unknown }[] } = JSON.parse(
  // jsdom thay URL toàn cục, readFileSync không nhận: đổi sang đường dẫn file
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../backend/test/fixtures/work-calendar-cases.json'), 'utf8'),
);

describe('Lịch làm việc ở giao diện: cùng kết quả với máy chủ', () => {
  it.each(fixture.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(lineDates(toCalendar(fixture.calendars[c.calendar]), c.start, c.productionDays)).toEqual(c.expect);
  });

  it.each(fixture.rounding.map((c) => [c.name, c] as const))('Số ngày SX làm tròn theo ngưỡng của lịch: %s', (_name, c) => {
    expect(productionDaysOf({ productionRoundUpFrom: c.roundUpFrom }, c.qty, c.avgOutput)).toBe(c.expect);
  });

  it('ngày đang gõ dở, sai dạng: không tính', () => {
    const cal = toCalendar(fixture.calendars.default);
    expect(lineDates(cal, '2026-10-', 3)).toBeNull();
    expect(lineDates(cal, '', 3)).toBeNull();
  });

  it('thứ trong tuần, ngày nghỉ, thứ tự số ngày cộng thêm', () => {
    expect(isoWeekday('2026-10-11')).toBe(7);
    expect(isoWeekday('2026-10-12')).toBe(1);
    const cal = toCalendar(fixture.calendars.tet2027);
    expect(isOffDay(cal, '2027-02-07')).toBe(true);
    expect(isOffDay(cal, '2027-02-14')).toBe(false);
    expect(isOffDay(cal, '2027-02-11')).toBe(false);
    expect(offsetsInOrder(fixture.calendars.default)).toBe(true);
    expect(offsetsInOrder({ outStartOffsetDays: 4, outEndOffsetDays: 3, warehouseStartOffsetDays: 2, warehouseEndOffsetDays: 5 })).toBe(false);
  });
});
