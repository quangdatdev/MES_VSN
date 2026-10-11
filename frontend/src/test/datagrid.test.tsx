import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DataGrid, type Column } from '../components/DataGrid';
import { onlyEditable, useFieldPolicy } from '../lib/fieldPolicy';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

interface Row {
  id: number;
  customerName: string;
  unitPrice?: number | '***';
  revenue?: number | '***';
  qty: number;
}

const COLUMNS: Column<Row>[] = [
  { key: 'customerName', title: 'Khách hàng' },
  { key: 'qty', title: 'Số lượng', format: 'number' },
  { key: 'unitPrice', title: 'Đơn giá', format: 'money' },
  { key: 'revenue', title: 'Doanh số', format: 'money' },
];

describe('Lưới phản chiếu chính sách cột (backend đã lọc, giao diện chỉ hiển thị cho đúng)', () => {
  beforeEach(() => {
    useSession.getState().reset('anonymous');
    useSession.getState().set({ fieldPolicies: { 'order.allocation': { unitPrice: 'HIDDEN', revenue: 'MASKED', qty: 'READONLY', customerName: 'EDITABLE' } } });
  });

  it('bỏ cột Ẩn, ô Che có kiểu riêng, tiêu đề cột Chỉ đọc có khóa', () => {
    const { result } = renderHook(() => useFieldPolicy('order.allocation'));
    render(
      <MantineProvider theme={theme}>
        <DataGrid label="lưới" columns={COLUMNS} rows={[{ id: 1, customerName: 'Khách A', qty: 1200, revenue: '***' }]} rowKey={(r) => r.id} policy={result.current} />
      </MantineProvider>,
    );
    const head = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(head).toEqual(['STT', 'Khách hàng', 'Số lượng', 'Doanh số']);
    expect(within(screen.getByRole('columnheader', { name: /Số lượng/ })).getByLabelText('chỉ đọc')).toBeInTheDocument();
    expect(screen.getByText('***').closest('.cell-masked')).not.toBeNull();
    expect(screen.getByText('1.200')).toBeInTheDocument();
  });

  it('chỉ gửi lên các trường được sửa', () => {
    const { result } = renderHook(() => useFieldPolicy('order.allocation'));
    expect(onlyEditable(result.current, { customerName: 'B', qty: 5, unitPrice: 1, note: 'x' })).toEqual({ customerName: 'B', note: 'x' });
  });
});

describe('Lưới: bàn phím', () => {
  const rows: Row[] = [1, 2, 3, 4].map((id) => ({ id, customerName: `Khách ${id}`, qty: id }));
  const renderGrid = (selectedKey: number | null) =>
    render(
      <MantineProvider theme={theme} env="test">
        <DataGrid label="Thử bàn phím" columns={COLUMNS.slice(0, 2)} rows={rows} rowKey={(r) => r.id} selectedKey={selectedKey} onRowClick={() => {}} />
      </MantineProvider>,
    );

  it('chỉ một dòng nhận Tab; mũi tên lên/xuống đi qua mọi dòng, kể cả dòng đang chọn', () => {
    renderGrid(3);
    const trs = within(screen.getByRole('table', { name: 'Thử bàn phím' })).getAllByRole('row').slice(1);
    expect(trs.map((r) => r.tabIndex)).toEqual([-1, -1, 0, -1]);
    trs[1].focus();
    fireEvent.keyDown(trs[1], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(trs[2]);
    fireEvent.keyDown(trs[2], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(trs[3]);
    fireEvent.keyDown(trs[3], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(trs[3]);
    fireEvent.keyDown(trs[3], { key: 'ArrowUp' });
    fireEvent.keyDown(trs[2], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(trs[1]);
  });

  it('chưa chọn dòng nào: dòng đầu nhận Tab', () => {
    renderGrid(null);
    const trs = within(screen.getByRole('table', { name: 'Thử bàn phím' })).getAllByRole('row').slice(1);
    expect(trs[0].tabIndex).toBe(0);
    trs[0].focus();
    fireEvent.keyDown(trs[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(trs[0]);
  });
});

describe('Lưới: tiêu đề 2 tầng', () => {
  it('cột cùng nhóm có chung ô tiêu đề tầng trên; cột không nhóm chiếm cả 2 tầng', () => {
    interface P { id: number; style: string; kh1: string; th1: string }
    render(
      <MantineProvider theme={theme} env="test">
        <DataGrid<P>
          label="Thử nhóm"
          rowKey={(r) => r.id}
          rows={[{ id: 1, style: 'A', kh1: '2026-10-01', th1: '' }]}
          columns={[
            { key: 'style', title: 'Mã hàng', field: null },
            { key: 'kh1', title: 'KH', group: 'Họp đánh giá rủi ro', field: null, format: 'date' },
            { key: 'th1', title: 'TH', group: 'Họp đánh giá rủi ro', field: null, format: 'date' },
          ]}
        />
      </MantineProvider>,
    );
    const head = within(screen.getByRole('table', { name: 'Thử nhóm' })).getAllByRole('row').slice(0, 2);
    const top = within(head[0]).getAllByRole('columnheader');
    expect(top.map((c) => c.textContent)).toEqual(['STT', 'Mã hàng', 'Họp đánh giá rủi ro']);
    expect(top[2]).toHaveAttribute('colspan', '2');
    expect(top[1]).toHaveAttribute('rowspan', '2');
    expect(within(head[1]).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['KH', 'TH']);
  });
});
