import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BoardBar } from '../features/order/api';
import { checkColorSize, type EditRow } from '../features/order/cutRatioRules';
import { LineBoard } from '../features/order/LineBoard';
import { fmtMoney, fmtNum, parseDmy, sumOf } from '../lib/format';
import { theme } from '../theme/theme';

describe('Định dạng số và ngày khi cột bị Che hoặc Ẩn', () => {
  it('ô Che giữ "***", ô thiếu (cột Ẩn) ra rỗng, không ra "NaN"', () => {
    expect(fmtNum(1200)).toBe(new Intl.NumberFormat('vi-VN').format(1200));
    expect(fmtNum('***')).toBe('***');
    expect(fmtNum(undefined)).toBe('');
    expect(fmtNum(Number.NaN)).toBe('');
    expect(fmtMoney('***')).toBe('***');
  });

  it('tổng một cột: có ô bị Che hoặc thiếu thì không có tổng (null), không cộng thành chuỗi hay NaN', () => {
    expect(sumOf([1, 2, 3])).toBe(6);
    expect(sumOf([])).toBe(0);
    expect(sumOf([1, '***', 3])).toBeNull();
    expect(sumOf([1, undefined])).toBeNull();
  });

  it('ngày gõ tay hiểu theo dd/mm/yyyy; ngày không có thật bị từ chối', () => {
    expect(parseDmy('05/12/2026')).toBe('2026-12-05');
    expect(parseDmy('5/1/2026')).toBe('2026-01-05');
    expect(parseDmy('25-12-2026')).toBe('2026-12-25');
    expect(parseDmy('31/02/2026')).toBeNull();
    expect(parseDmy('2026-12-05')).toBeNull();
    expect(parseDmy('abc')).toBeNull();
  });
});

describe('Bảng dàn chuyền không sập khi dữ liệu thiếu trường do phân quyền', () => {
  const bar = (patch: Partial<BoardBar>): BoardBar => ({
    id: 1,
    planId: 1,
    planNo: 'KH-A01-000001',
    lineCode: 'A01-L03',
    startDate: '2026-12-07',
    endDate: '2026-12-09',
    qty: 300,
    avgOutput: 100,
    customerName: 'Nordic Wear',
    styleCode: 'NW-01',
    poBuyDate: '4500 / 01-12',
    shipDate: '2026-12-20',
    statusCode: 'PLANNED',
    ...patch,
  });

  it('khách hàng bị Ẩn (thiếu) hoặc Che vẫn vẽ thanh; ngày bị Che thì bỏ thanh đó', () => {
    const bars = [
      bar({ id: 1, customerName: undefined as unknown as string }),
      bar({ id: 2, lineCode: 'A01-L04', customerName: '***' }),
      bar({ id: 3, lineCode: 'A01-L05', startDate: '***', endDate: '***' }),
    ];
    render(
      <MantineProvider theme={theme}>
        <LineBoard
          from="2026-12-01"
          to="2026-12-31"
          lines={[
            { code: 'A01-L03', name: 'Chuyền 3' },
            { code: 'A01-L04', name: 'Chuyền 4' },
            { code: 'A01-L05', name: 'Chuyền 5' },
          ]}
          bars={bars}
          details={false}
        />
      </MantineProvider>,
    );
    // Tắt chi tiết thì thanh không bấm được: là hình có tên đọc (kèm trạng thái), không phải nút
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    const shown = screen.getAllByRole('img');
    const labels = shown.map((b) => b.textContent);
    expect(labels).toHaveLength(2);
    expect(labels[0]).toMatch(/^NW-01, 300 sp$/);
    expect(labels[1]).toMatch(/^\*\*\*, NW-01, 300 sp$/);
    expect(shown[0]).toHaveAttribute('aria-label', expect.stringContaining('Chưa phân màu cỡ'));
  });
});

describe('Kiểm lưới màu cỡ của PO trước khi lưu', () => {
  const row = (key: number, colorName: string, sizeName: string, qty: number | null): EditRow => ({ key, colorName, sizeName, qty });

  it('dòng trống hoàn toàn bị bỏ; dòng thiếu ô được nêu và tô đỏ; tổng chỉ cộng dòng sẽ lưu', () => {
    const c = checkColorSize([row(1, 'Đen', 'S', 10), row(2, '', '', null), row(3, 'Đen', '', 5), row(4, 'Trắng', 'M', null)]);
    expect(c.lines).toEqual([{ colorName: 'Đen', sizeName: 'S', qty: 10 }]);
    expect(c.total).toBe(10);
    expect(c.issues).toEqual(['Dòng 3: thiếu Cỡ sản phẩm', 'Dòng 4: thiếu Số lượng']);
    expect(c.bad.size.has(3)).toBe(true);
    expect(c.bad.qty.has(4)).toBe(true);
    expect(c.bad.color.size).toBe(0);
  });

  it('trùng Màu + Cỡ (không phân biệt hoa thường) và cỡ sai quy tắc bị chặn', () => {
    const c = checkColorSize([row(1, 'Đen', 'M', 1), row(2, 'đen ', 'm', 2), row(3, 'Đen', 'XL+', 3)]);
    expect(c.issues).toEqual(['Dòng 2: trùng Màu + Cỡ với dòng 1 (đen / m)', 'Dòng 3: cỡ "XL+" sai quy tắc']);
    expect(c.badSize).toBe(true);
    expect([...c.bad.size]).toEqual([2, 3]);
  });
});
