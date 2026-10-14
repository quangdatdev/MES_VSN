import { describe, expect, it } from 'vitest';
import { blockedDeletes, keepAnchor, parseQty, parseSheetDate, sheetNumber, sheetSelect } from '../components/SheetGrid';

interface Row {
  key: number;
  qty: number | null;
  lineCode: string;
  locked?: boolean;
}

describe('Lưới nhập kiểu bảng tính: khóa ô, chặn xóa dòng', () => {
  it('dán quá cuối lưới: thư viện hỏi ô khóa với dòng chưa có (undefined) thì không lỗi, không khóa', () => {
    const col = sheetNumber<Row>('qty', 'Số lượng', { required: true, disabled: (r) => !!r.locked });
    const disabled = col.disabled as (o: { rowData: Row | undefined; rowIndex: number }) => boolean;
    expect(disabled({ rowData: undefined, rowIndex: 5 })).toBe(false);
    expect(disabled({ rowData: { key: 1, qty: 1, lineCode: '', locked: true }, rowIndex: 0 })).toBe(true);
    expect(disabled({ rowData: { key: 2, qty: 1, lineCode: '' }, rowIndex: 1 })).toBe(false);
    const sel = sheetSelect<Row>('Chuyền', { options: () => [], get: (r) => r.lineCode, set: (r, v) => ({ ...r, lineCode: v ?? '' }) }, { disabled: (r) => !!r.locked });
    expect((sel.disabled as (o: { rowData: Row | undefined; rowIndex: number }) => boolean)({ rowData: undefined, rowIndex: 3 })).toBe(false);
  });

  it('ô bắt buộc tô vàng, ô khóa không tô, ô sai tô đỏ', () => {
    const col = sheetNumber<Row>('qty', 'Số lượng', { required: true, disabled: (r) => !!r.locked, error: (r) => (r.qty ?? 0) > 10 });
    const cls = col.cellClassName as (o: { rowData: unknown; rowIndex: number }) => string | undefined;
    expect(cls({ rowData: { key: 1, qty: 1, lineCode: '' }, rowIndex: 0 })).toBe('sheet-required');
    expect(cls({ rowData: { key: 1, qty: 1, lineCode: '', locked: true }, rowIndex: 0 })).toBeUndefined();
    expect(cls({ rowData: { key: 1, qty: 99, lineCode: '' }, rowIndex: 0 })).toBe('sheet-error');
    expect(cls({ rowData: undefined, rowIndex: 0 })).toBeUndefined();
  });

  it('chỉ chặn khi dòng bị bỏ đi là dòng không được xóa; thêm, sửa, xóa dòng được phép thì cho qua', () => {
    const rows: Row[] = [
      { key: 1, qty: 1, lineCode: 'A', locked: true },
      { key: 2, qty: 2, lineCode: 'B' },
    ];
    const key = (r: Row) => r.key;
    const can = (r: Row) => !r.locked;
    expect(blockedDeletes(rows, [rows[0]], key, can)).toEqual([]);
    expect(blockedDeletes(rows, [rows[1]], key, can).map(key)).toEqual([1]);
    expect(blockedDeletes(rows, [{ ...rows[0], qty: 5 }, rows[1], { key: 3, qty: null, lineCode: '' }], key, can)).toEqual([]);
    expect(blockedDeletes(rows, [], key, can).map(key)).toEqual([1]);
  });
});

describe('Lưới nhập kiểu bảng tính: dòng neo của nút Thêm (addAtActive)', () => {
  it('dòng đã nhớ còn thì giữ; bị xóa thì nhớ dòng đang ở chỉ số ô đang chọn (thư viện giữ chỉ số), không có thì bỏ', () => {
    const key = (r: { id: number }) => r.id;
    const rows = [{ id: 1 }, { id: 3 }];
    expect(keepAnchor({ key: 1, col: 2 }, rows, key, 0)).toEqual({ key: 1, col: 2 });
    expect(keepAnchor({ key: 2, col: 2 }, rows, key, 1)).toEqual({ key: 3, col: 2 });
    expect(keepAnchor({ key: 2, col: 2 }, rows, key, 5)).toBeNull();
    expect(keepAnchor({ key: 2, col: 2 }, rows, key, null)).toBeNull();
    expect(keepAnchor(null, rows, key, 0)).toBeNull();
  });
});

describe('Lưới nhập kiểu bảng tính: đọc giá trị gõ hoặc dán từ Excel', () => {
  it('số lượng theo kiểu Việt Nam lẫn kiểu Anh, có nhóm nghìn, có ",00"', () => {
    expect(parseQty('1200')).toBe(1200);
    expect(parseQty('1.200')).toBe(1200);
    expect(parseQty('1,200')).toBe(1200);
    expect(parseQty('1 200')).toBe(1200);
    expect(parseQty('1 200')).toBe(1200);
    expect(parseQty('1.234.567')).toBe(1234567);
    expect(parseQty('1.234,00')).toBe(1234);
    expect(parseQty('12.0')).toBe(12);
    expect(parseQty(' 42 ')).toBe(42);
    expect(parseQty('0')).toBe(0);
  });

  it('số âm, số lẻ, chữ, ô trống: null (ô trống để người nhập thấy ngay)', () => {
    expect(parseQty('-5')).toBeNull();
    expect(parseQty('1,5')).toBeNull();
    expect(parseQty('12.34')).toBeNull();
    expect(parseQty('abc')).toBeNull();
    expect(parseQty('')).toBeNull();
    expect(parseQty('99999999999999999999')).toBeNull();
  });

  it('ngày dd/mm/yyyy, d/m/yyyy, yyyy-mm-dd, dd/mm (năm nay); ngày không có thật: null', () => {
    expect(parseSheetDate('05/12/2026')).toBe('2026-12-05');
    expect(parseSheetDate('5/1/2027')).toBe('2027-01-05');
    expect(parseSheetDate('05-12-2026')).toBe('2026-12-05');
    expect(parseSheetDate('2026-12-05')).toBe('2026-12-05');
    expect(parseSheetDate('2026-12-05T00:00:00')).toBe('2026-12-05');
    expect(parseSheetDate('05/12')).toBe(`${new Date().getFullYear()}-12-05`);
    expect(parseSheetDate('31/02/2026')).toBeNull();
    expect(parseSheetDate('hôm nay')).toBeNull();
    expect(parseSheetDate('')).toBeNull();
  });
});
