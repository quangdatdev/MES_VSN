import { buildCells, duplicateColorNames, orderNumber } from '../src/modules/order/bravo-order.mapping';
import type { SourceCell } from '../src/platform/sync/bravo-order-source';

// Không cần database: các hàm thuần nạp đơn hàng BRAVO (src/modules/order/bravo-order.mapping.ts)
const cell = (over: Partial<SourceCell>): SourceCell => ({
  ProductId: 1,
  CustomerPONo: 'PO1',
  ColorId: 10,
  ColorName: 'Navy',
  ColorCode: 'C10',
  SizeCode: 'M',
  SizeType: 'REG',
  Qty: 5,
  ColorStt: 1,
  SizeStt: 1,
  ...over,
});

describe('Nạp BRAVO: lưới màu cỡ', () => {
  it('gộp dòng cùng màu cỡ; loại cỡ khác REG ghép vào tên cỡ; SL âm thành 0; giữ thứ tự màu, cỡ của BRAVO', () => {
    const rows = [
      cell({ SizeCode: 'L', SizeStt: 2, Qty: 3 }),
      cell({ SizeCode: 'm', SizeStt: 1, Qty: 2 }),
      cell({ SizeCode: 'M', SizeStt: 1, Qty: 4 }),
      cell({ SizeCode: '32', SizeType: 'SHORT', SizeStt: 3, Qty: 7 }),
      cell({ SizeCode: '32', SizeType: 'REG', SizeStt: 3, Qty: 1 }),
      cell({ ColorId: 11, ColorName: 'Đen\r\n', ColorStt: 0, Qty: -2 }),
    ];
    expect(buildCells(rows, new Set())).toEqual([
      { color: 'Đen', size: 'M', qty: 0 },
      { color: 'Navy', size: 'M', qty: 6 },
      { color: 'Navy', size: 'L', qty: 3 },
      { color: 'Navy', size: '32', qty: 1 },
      { color: 'Navy', size: '32 SHORT', qty: 7 },
    ]);
  });

  it('hai mã màu cùng tên trong một đơn: kèm mã màu ở mọi PO của đơn, kể cả PO chỉ có một trong hai', () => {
    const po1 = [cell({ ColorId: 10, ColorCode: 'C10' }), cell({ ColorId: 12, ColorName: 'navy', ColorCode: 'C12' })];
    const po2 = [cell({ CustomerPONo: 'PO2', ColorId: 10, ColorCode: 'C10' })];
    const dup = duplicateColorNames([...po1, ...po2]);
    expect(buildCells(po1, dup).map((c) => c.color)).toEqual(['Navy (C10)', 'navy (C12)']);
    expect(buildCells(po2, dup).map((c) => c.color)).toEqual(['Navy (C10)']);
    expect(buildCells(po2, duplicateColorNames(po2)).map((c) => c.color)).toEqual(['Navy']);
  });
});

describe('Nạp BRAVO: số đơn hàng', () => {
  it('lấy số SO trước " | "; trùng trong nhà máy thêm -2, -3; nhà máy khác không tính trùng', () => {
    const used = new Set<string>();
    expect(orderNumber('SO.001 | Áo, ST1', 1, 'A01', used)).toBe('SO.001');
    expect(orderNumber('so.001 | Quần, ST2', 2, 'A01', used)).toBe('so.001-2');
    expect(orderNumber('SO.001 | Áo, ST3', 3, 'A01', used)).toBe('SO.001-3');
    expect(orderNumber('SO.001 | Áo, ST1', 4, 'A02', used)).toBe('SO.001');
  });

  it('không có " | " hoặc số SO có ký tự ngoài ASCII (cột VARCHAR) thì dùng SP-<ProductId>; cắt vừa 30 ký tự', () => {
    const used = new Set<string>();
    expect(orderNumber('Không có dấu tách', 7, 'A01', used)).toBe('SP-7');
    expect(orderNumber(null, 8, 'A01', used)).toBe('SP-8');
    expect(orderNumber('SỐ-01 | Áo', 9, 'A01', used)).toBe('SP-9');
    const long = 'X'.repeat(40);
    expect(orderNumber(`${long} | Áo`, 10, 'A01', used)).toBe('X'.repeat(30));
    expect(orderNumber(`${long} | Áo`, 11, 'A01', used)).toBe(`${'X'.repeat(28)}-2`);
  });
});
