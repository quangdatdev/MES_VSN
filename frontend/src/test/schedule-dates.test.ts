import { describe, expect, it } from 'vitest';
import type { ScheduleLine } from '../features/order/api';
import { computeLine, isOutdated, storedOf } from '../features/order/scheduleDates';
import { toCalendar } from '../lib/workCalendar';

// Popup Chi tiết dàn chuyền (phase 5.12, review M1): chỉ báo "ngày khác lịch hiện tại" khi dòng đã lưu chưa bị sửa ô nhập nào

const sundays = toCalendar({ weeklyOffDays: [7], outStartOffsetDays: 3, outEndOffsetDays: 3, warehouseStartOffsetDays: 2, warehouseEndOffsetDays: 5, days: [] });
const withHoliday = toCalendar({ weeklyOffDays: [7], outStartOffsetDays: 3, outEndOffsetDays: 3, warehouseStartOffsetDays: 2, warehouseEndOffsetDays: 5, days: [{ date: '2026-12-07', dayType: 'OFF', name: 'Nghỉ thử' }] });
/** Máy chủ đã lưu theo lịch chỉ nghỉ Chủ nhật: 1000/300 = 4 ngày từ thứ Bảy 05/12/2026 */
const saved = {
  id: 11,
  lineCode: 'A01-L12',
  qty: 1000,
  avgOutput: 300,
  startDate: '2026-12-05',
  productionDays: 4,
  offDays: 1,
  endDate: '2026-12-09',
  outStartDate: '2026-12-09',
  outEndDate: '2026-12-12',
  warehouseStartDate: '2026-12-11',
  warehouseEndDate: '2026-12-18',
} as ScheduleLine;

describe('Ngày đã lưu khác cách tính theo lịch hiện tại', () => {
  it('lịch không đổi, dòng chưa sửa: không báo', () => {
    expect(isOutdated(saved, saved, computeLine(sundays, saved))).toBe(false);
  });

  it('lịch có thêm ngày nghỉ, dòng chưa sửa: báo', () => {
    expect(isOutdated(saved, saved, computeLine(withHoliday, saved))).toBe(true);
  });

  it('người dùng sửa số lượng, năng suất hoặc ngày bắt đầu: không báo dù ngày khác đi', () => {
    for (const edit of [{ qty: 1300 }, { avgOutput: 200 }, { startDate: '2026-12-08' }]) {
      const row = { ...saved, ...edit };
      expect(isOutdated(saved, row, computeLine(sundays, row))).toBe(false);
    }
  });

  it('ngày ra chuyền, nhập kho nhập tay trước phase 5.12: báo để tính lại', () => {
    const manual = { ...saved, outStartDate: '2026-12-06', warehouseEndDate: null };
    expect(isOutdated(manual, manual, computeLine(sundays, manual))).toBe(true);
  });

  it('dòng ngoài phạm vi sửa hiện số đã lưu, không tính lại', () => {
    expect(storedOf(saved)).toEqual({
      productionDays: 4,
      dates: { offDays: 1, endDate: '2026-12-09', outStartDate: '2026-12-09', outEndDate: '2026-12-12', warehouseStartDate: '2026-12-11', warehouseEndDate: '2026-12-18' },
    });
    expect(storedOf({ ...saved, endDate: undefined }).dates).toBeNull();
  });
});
