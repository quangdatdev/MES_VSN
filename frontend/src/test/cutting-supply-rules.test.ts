import { describe, expect, it } from 'vitest';
import type { SupplyRowData } from '../features/cutting/api';
import { appendRows, changes, keysOf, overSync, overSyncCells, remainOf, rowKey, rowsOf, saveIssue, settle } from '../features/cutting/cuttingSupplyRules';

// Phase 5.15: tính toán của form Xác nhận cấp BTP (Còn lại = KH − đã cấp các ngày khác − trong ngày; tổng cấp không vượt số đã cắt)
const data = (o: Partial<SupplyRowData> & { lineCode: string; colorName: string; sizeName: string }): SupplyRowData => ({
  styleCode: 'MH1',
  productName: 'Áo',
  inPlan: true,
  planQty: 100,
  syncQty: 150,
  suppliedQty: 0,
  dayQty: null,
  otherLinesQty: 0,
  lineName: `Tổ ${o.lineCode}`,
  ...o,
});

describe('cuttingSupplyRules', () => {
  it('Còn lại tính khi gõ; dòng bị Che thì không tính', () => {
    const [r] = rowsOf([data({ lineCode: 'L3', colorName: 'RED', sizeName: 'S', planQty: 140, suppliedQty: 20, dayQty: 50 })]);
    expect(remainOf(r)).toBe(70);
    expect(remainOf({ ...r, dayQty: 60 })).toBe(60);
    expect(remainOf({ ...r, planQty: '***' })).toBe('***');
    expect(remainOf({ ...r, planQty: undefined })).toBeUndefined();
  });

  it('chỉ gửi ô đã sửa; 0 là xóa số của ngày', () => {
    const rows = rowsOf([data({ lineCode: 'L3', colorName: 'RED', sizeName: 'S', dayQty: 5 }), data({ lineCode: 'L5', colorName: 'RED', sizeName: 'S' })]);
    expect(changes(rows)).toEqual([]);
    const next = rows.map((r, i) => (i === 0 ? { ...r, dayQty: null } : { ...r, dayQty: 7 }));
    expect(changes(next)).toEqual([
      { line: 'L3', style: 'MH1', colorName: 'RED', sizeName: 'S', dayQty: 0 },
      { line: 'L5', style: 'MH1', colorName: 'RED', sizeName: 'S', dayQty: 7 },
    ]);
  });

  it('Còn lại âm do ô vừa tăng thì không lưu được; giảm số luôn được', () => {
    const [r] = rowsOf([data({ lineCode: 'L5', colorName: 'RED', sizeName: 'S', planQty: 10, dayQty: 30 })]);
    expect(saveIssue([{ ...r, dayQty: 31 }])).toContain('Số lượng còn lại âm');
    expect(saveIssue([{ ...r, dayQty: 25 }])).toBeNull();
    expect(saveIssue([r])).toBe('Chưa có thay đổi nào');
  });

  it('tổng cấp mọi chuyền vượt Số lượng đồng bộ: tính cả số đã lưu của chuyền ngoài lưới, không đếm trùng dòng trong lưới', () => {
    // Đã cắt 150. L3 đã cấp 20 (ngày khác) + 50 (hôm nay); L5 đã cấp 30 hôm nay; chuyền ngoài lưới đã cấp 10
    const rows = rowsOf([
      data({ lineCode: 'L3', colorName: 'RED', sizeName: 'S', planQty: 140, suppliedQty: 20, dayQty: 50, otherLinesQty: 40 }),
      data({ lineCode: 'L5', colorName: 'RED', sizeName: 'S', planQty: 50, suppliedQty: 0, dayQty: 30, otherLinesQty: 80 }),
    ]);
    expect(overSyncCells(rows).size).toBe(0);
    // 110 (+40 đã lưu ở chuyền khác) = 150: vừa đủ
    expect(overSyncCells(rows.map((r, i) => (i === 0 ? { ...r, dayQty: 90 } : r))).size).toBe(0);
    const over = rows.map((r, i) => (i === 0 ? { ...r, dayQty: 91 } : r));
    const cells = overSyncCells(over);
    expect(over.every((r) => overSync(r, cells))).toBe(true);
    expect(saveIssue(over)).toContain('số lượng đồng bộ');
    // Vượt sẵn mà chỉ giảm: không chặn
    const kept = rowsOf([data({ lineCode: 'L3', colorName: 'RED', sizeName: 'S', syncQty: 10, dayQty: 50 })]);
    expect(overSyncCells([{ ...kept[0], dayQty: 40 }]).size).toBe(0);
  });

  it('dòng chỉ xem (lệnh đã xác nhận) giữ nguyên khi dán, số lẻ, âm về rỗng; thêm dòng bỏ dòng đã có', () => {
    // Máy chủ đánh dấu dòng của lệnh đã xác nhận (Trạng thái, Mã hàng có thể bị che nên giao diện không tự so)
    const rows = rowsOf([data({ lineCode: 'L3', colorName: 'RED', sizeName: 'S', locked: true }), data({ lineCode: 'L3', colorName: 'RED', sizeName: 'M', locked: true })]);
    expect(rows.every((r) => r.locked)).toBe(true);
    const editable = (r: (typeof rows)[number]) => !r.locked;
    expect(settle(rows.map((r) => ({ ...r, dayQty: 9 })), rows, editable).map((r) => r.dayQty)).toEqual([null, null]);
    const open = rows.map((r) => ({ ...r, locked: false }));
    expect(settle(open.map((r, i) => ({ ...r, dayQty: i ? -1 : 2.5 })), open, editable).map((r) => r.dayQty)).toEqual([null, null]);
    const more = rowsOf([data({ lineCode: 'L3', colorName: 'red', sizeName: 's' }), data({ lineCode: 'L5', colorName: 'RED', sizeName: 'S' })]);
    expect(appendRows(rows, more).map((r) => r.line + r.sizeName)).toEqual(['L3S', 'L3M', 'L5S']);
    expect(rowKey(keysOf(rows)[0])).toBe(rows[0].key);
  });
});
