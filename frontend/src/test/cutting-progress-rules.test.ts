import { describe, expect, it } from 'vitest';
import type { CuttingCell } from '../features/cutting/api';
import { changes, diffOf, liveCut, rowsOf, saveIssue, settle, TOTAL_KEY, type CutRow } from '../features/cutting/cuttingProgressRules';

// Đồng bộ tiến độ cắt (phase 5.14, quyết định 13.3): +/- = Lũy kế − Kế hoạch như ảnh mẫu; Lũy kế tính trên mọi ngày, số đang gõ
// thay số đã lưu của ngày đang xem; dòng Tổng ghim đầu lưới

const cell = (colorName: string, sizeName: string, planQty: number, dayQty: number | null, cutQty: number, inPlan = true): CuttingCell => ({
  colorName,
  sizeName,
  inPlan,
  planQty,
  dayQty,
  cutQty,
  diffQty: cutQty - planQty,
});
// Như ảnh mẫu: XS chưa cắt, M đã cắt 6.373 (hôm khác), S cắt vượt 1
const sample = [cell('DUSTED BLUE_401', '(REG) XS', 1396, null, 0), cell('DUSTED BLUE_401', '(REG) M', 6379, null, 6373), cell('PERFORMANCE', '(REG) S', 4358, 1000, 4359)];
const all = () => true;

describe('Đồng bộ tiến độ cắt: tính toán của popup', () => {
  it('dòng Tổng ghim đầu, +/- = Lũy kế − Kế hoạch (âm là còn thiếu, dương là cắt dư)', () => {
    const rows = rowsOf({ items: sample });
    expect(rows[0]).toMatchObject({ key: TOTAL_KEY, total: true, colorName: 'Tổng (3)', planQty: 12133, savedCut: 10732, dayQty: 1000 });
    expect(diffOf(rows[0])).toBe(10732 - 12133);
    expect(rows.slice(1).map(diffOf)).toEqual([-1396, -6, 1]);
  });

  it('Lũy kế khi đang gõ: thay số đã lưu của ngày đang xem bằng số đang nhập; tổng tính lại', () => {
    const rows = rowsOf({ items: sample });
    const typed = rows.map((r) => (r.sizeName === '(REG) S' ? { ...r, dayQty: 1200 } : r.sizeName === '(REG) XS' ? { ...r, dayQty: 50 } : r));
    const next = settle(typed, rows, all);
    const s = next.find((r) => r.sizeName === '(REG) S')!;
    expect(liveCut(s)).toBe(4559);
    expect(diffOf(s)).toBe(201);
    expect(liveCut(next.find((r) => r.sizeName === '(REG) XS')!)).toBe(50);
    expect(liveCut(next[0])).toBe(10732 + 200 + 50);
    expect(next[0].dayQty).toBe(1250);
  });

  it('chỉ gửi ô đã sửa; xóa số đã lưu gửi 0; không đổi gì thì chưa lưu được', () => {
    const rows = rowsOf({ items: sample });
    expect(changes(rows)).toEqual([]);
    expect(saveIssue(rows)).toBe('Chưa có thay đổi nào');
    const edited = settle(
      rows.map((r) => (r.sizeName === '(REG) S' ? { ...r, dayQty: null } : r.sizeName === '(REG) M' ? { ...r, dayQty: 6 } : r)),
      rows,
      all,
    );
    expect(changes(edited)).toEqual([
      { colorName: 'DUSTED BLUE_401', sizeName: '(REG) M', dayQty: 6 },
      { colorName: 'PERFORMANCE', sizeName: '(REG) S', dayQty: 0 },
    ]);
    expect(saveIssue(edited)).toBeNull();
  });

  it('dòng Tổng, màu cỡ đã bỏ khỏi kế hoạch, dòng không sửa được giữ nguyên; số âm, số lẻ thành rỗng', () => {
    const rows = rowsOf({ items: [...sample, cell('OLD', 'XL', 0, 5, 5, false)] });
    const editable = (r: CutRow) => !r.total && r.inPlan;
    const typed = rows.map((r) => (r.total ? { ...r, dayQty: 99 } : r.colorName === 'OLD' ? { ...r, dayQty: 9 } : r.sizeName === '(REG) XS' ? { ...r, dayQty: -3 } : r.sizeName === '(REG) M' ? { ...r, dayQty: 2.5 } : r));
    const next = settle(typed, rows, editable);
    expect(next.find((r) => r.colorName === 'OLD')!.dayQty).toBe(5);
    expect(next.find((r) => r.sizeName === '(REG) XS')!.dayQty).toBeNull();
    expect(next.find((r) => r.sizeName === '(REG) M')!.dayQty).toBeNull();
    expect(next[0].dayQty).toBe(1005);
    expect(changes(next)).toEqual([]);
  });

  it('cột bị Che: Lũy kế, +/-, tổng hiện "***", không tính', () => {
    const masked: CuttingCell[] = [{ colorName: 'A', sizeName: 'S', inPlan: true, planQty: '***', dayQty: 3, cutQty: 10, diffQty: '***' }];
    const rows = rowsOf({ items: masked });
    expect(rows[0].planQty).toBe('***');
    expect(diffOf(rows[1])).toBe('***');
    expect(liveCut(rows[1])).toBe(10);
  });

  it('quá số lớn nhất một ô: chưa lưu được, nêu màu cỡ', () => {
    const rows = rowsOf({ items: sample });
    const next = settle(rows.map((r) => (r.sizeName === '(REG) XS' ? { ...r, dayQty: 2_000_000 } : r)), rows, all);
    expect(saveIssue(next)).toContain('DUSTED BLUE_401/(REG) XS');
  });
});
