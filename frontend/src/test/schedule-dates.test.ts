import { describe, expect, it } from 'vitest';
import { adjustedKeys, computeLine, fillGaps, settleDates, storedOf, type SettleRow } from '../features/order/scheduleDates';
import { datesOrderError, offDaysBetween, toCalendar } from '../lib/workCalendar';

// Popup Chi tiết dàn chuyền: năm cột ngày theo công thức, sửa tay được (15/10/2026); sửa Số lượng, Năng suất TB, Bắt đầu vào
// chuyền thì tính lại theo công thức

// Ngưỡng 0,01 (làm tròn lên) giữ ví dụ 1000/300 = 4 ngày; quy tắc làm tròn kiểm ở work-calendar.test.ts
const SUNDAYS_JSON = { weeklyOffDays: [7], outStartOffsetDays: 3, outEndOffsetDays: 3, warehouseStartOffsetDays: 2, warehouseEndOffsetDays: 5, productionRoundUpFrom: 0.01, days: [] };
const sundays = toCalendar(SUNDAYS_JSON);
/** 1000/300 = 4 ngày SX sau thứ Bảy 05/12/2026, nghỉ Chủ nhật 06/12 */
const formula = { endDate: '2026-12-10', outStartDate: '2026-12-08', outEndDate: '2026-12-13', warehouseStartDate: '2026-12-10', warehouseEndDate: '2026-12-18' };
const saved: SettleRow = { key: 1, qty: 1000, avgOutput: 300, startDate: '2026-12-05', ...formula };
const settle = (next: SettleRow) => settleDates([saved], [next], sundays)[0];

describe('Ngày dàn chuyền: công thức và điều chỉnh tay', () => {
  it('dòng mới đủ số lượng, năng suất, ngày bắt đầu: điền năm ngày theo công thức; thiếu ô nhập thì để trống', () => {
    expect(settleDates([], [{ key: 2, qty: 1000, avgOutput: 300, startDate: '2026-12-05' }], sundays)[0]).toMatchObject(formula);
    const blank = settleDates<SettleRow>([], [{ key: 3, qty: 1000, avgOutput: null, startDate: '2026-12-05' }], sundays)[0];
    expect([blank.endDate ?? null, blank.warehouseEndDate ?? null]).toEqual([null, null]);
  });

  it('sửa tay một ngày: giữ ngày đó, các ngày khác không đổi; dòng không đổi giữ nguyên đối tượng', () => {
    expect(settle({ ...saved, outStartDate: '2026-12-09' })).toEqual({ ...saved, outStartDate: '2026-12-09' });
    expect(settleDates([saved], [saved], sundays)[0]).toBe(saved);
  });

  it('sửa số lượng, năng suất hoặc ngày bắt đầu sau khi đã điều chỉnh tay: năm ngày tính lại theo công thức', () => {
    const adjusted = { ...saved, endDate: '2026-12-15', warehouseEndDate: '2026-12-30' };
    // 1300/300 = 5 ngày: 07–11/12
    expect(settleDates([adjusted], [{ ...adjusted, qty: 1300 }], sundays)[0]).toMatchObject({
      endDate: '2026-12-11',
      outStartDate: '2026-12-08',
      outEndDate: '2026-12-14',
      warehouseStartDate: '2026-12-10',
      warehouseEndDate: '2026-12-19',
    });
    expect(settleDates([adjusted], [{ ...adjusted, avgOutput: 200 }], sundays)[0]).toMatchObject({ endDate: '2026-12-11' });
    expect(settleDates([adjusted], [{ ...adjusted, startDate: '2026-12-07' }], sundays)[0]).toMatchObject({ endDate: '2026-12-11', outStartDate: '2026-12-10' });
  });

  it('dán cả dòng (ngày bắt đầu và ngày ra chuyền cùng lượt): giữ ngày đã dán, ngày khác theo công thức', () => {
    expect(settle({ ...saved, startDate: '2026-12-07', outStartDate: '2026-12-12' })).toMatchObject({ endDate: '2026-12-11', outStartDate: '2026-12-12', warehouseStartDate: '2026-12-12' });
  });

  it('xóa trống một ô ngày: lấy lại ngày theo công thức', () => {
    expect(settle({ ...saved, outStartDate: '2026-12-09' }).outStartDate).toBe('2026-12-09');
    const manual: SettleRow = { ...saved, outStartDate: '2026-12-09' };
    expect(settleDates([manual], [{ ...manual, outStartDate: null }], sundays)[0].outStartDate).toBe('2026-12-08');
  });

  it('cột không được sửa theo chính sách cột: giữ ngày đã lưu (kể cả ngày người khác chỉnh tay), chỉ tính lại khi ô nhập đổi', () => {
    const manual: SettleRow = { ...saved, endDate: '2026-12-20' };
    expect(fillGaps([manual], sundays)[0]).toBe(manual);
    expect(settleDates([manual], [{ ...manual, outStartDate: '2026-12-09' }], sundays, ['endDate'])[0].endDate).toBe('2026-12-20');
    expect(settleDates([manual], [{ ...manual, qty: 1300 }], sundays, ['endDate'])[0].endDate).toBe('2026-12-11');
    // Dòng mới: cột khóa luôn theo công thức (nhân bản dòng không chép ngày của cột không sửa được)
    expect(settleDates([], [{ ...manual, key: 9 }], sundays, ['endDate'])[0].endDate).toBe('2026-12-10');
  });

  it('mở popup: chỉ điền ô ngày trống theo công thức, không đổi ngày đã lưu', () => {
    const partial: SettleRow = { ...saved, outStartDate: '2026-12-06', warehouseEndDate: null };
    expect(fillGaps([partial], sundays)[0]).toEqual({ ...partial, warehouseEndDate: '2026-12-18' });
    expect(fillGaps([saved], sundays)[0]).toBe(saved);
  });

  it('dòng ngoài phạm vi sửa: không tính lại, hiện số đã lưu', () => {
    const other: SettleRow = { ...saved, key: 5, editable: false, endDate: '2026-12-20' };
    expect(settleDates([], [other], sundays)[0]).toBe(other);
    expect(storedOf({ productionDays: 4 })).toEqual({ productionDays: 4, formula: null });
  });

  it('Số ngày SX theo ngưỡng làm tròn của lịch: 1000/300 = 3,33 → 3 ngày với ngưỡng 0,5, 4 ngày với 0,01', () => {
    expect(computeLine(toCalendar({ ...SUNDAYS_JSON, productionRoundUpFrom: 0.5 }), saved).productionDays).toBe(3);
    expect(computeLine(sundays, saved).productionDays).toBe(4);
  });

  it('ô khác công thức, số ngày nghỉ đếm tới ngày kết thúc đang có, thứ tự ngày', () => {
    const f = computeLine(sundays, saved).formula;
    expect(adjustedKeys(saved, f)).toEqual([]);
    expect(adjustedKeys({ ...saved, endDate: '2026-12-14', warehouseEndDate: '2026-12-20' }, f)).toEqual(['endDate', 'warehouseEndDate']);
    expect(adjustedKeys(saved, null)).toEqual([]);
    expect(offDaysBetween(sundays, '2026-12-05', '2026-12-14')).toBe(2);
    expect(offDaysBetween(sundays, '2026-12-05', '2026-12-05')).toBe(0);
    expect(datesOrderError('2026-12-05', formula)).toBeNull();
    expect(datesOrderError('2026-12-05', { ...formula, endDate: '2026-12-04' })).toEqual({ key: 'endDate', message: 'Kết thúc vào chuyền trước ngày bắt đầu vào chuyền.' });
    expect(datesOrderError('2026-12-05', { ...formula, outEndDate: '2026-12-07' })?.key).toBe('outEndDate');
    expect(datesOrderError('2026-12-05', { ...formula, warehouseStartDate: '2026-12-07' })?.key).toBe('warehouseStartDate');
    expect(datesOrderError('2026-12-05', { ...formula, warehouseEndDate: '2032-12-31' })?.message).toBe('Ngày cách ngày bắt đầu vào chuyền quá 6 năm.');
  });
});
