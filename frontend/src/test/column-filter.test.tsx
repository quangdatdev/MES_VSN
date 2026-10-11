import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataGrid, type Column } from '../components/DataGrid';
import { parseColumnFilters, serializeColumnFilters, type ColumnFilter, type ColumnFilters, type LoadValues } from '../lib/columnFilter';
import { useFieldPolicy } from '../lib/fieldPolicy';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

interface Row {
  id: number;
  customerName: string | null;
  qty: number;
}

const COLUMNS: Column<Row>[] = [
  { key: 'customerName', title: 'Khách hàng', filterKey: 'customerName' },
  { key: 'qty', title: 'Số lượng', format: 'number', filterKey: 'qty' },
];
const ROWS: Row[] = [
  { id: 1, customerName: 'Khách A', qty: 1200 },
  { id: 2, customerName: 'Khách B', qty: 300 },
];

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MantineProvider theme={theme} env="test">
        {ui}
      </MantineProvider>
    </QueryClientProvider>
  );
}

describe('Bộ lọc theo cột trên URL', () => {
  it('đọc, ghi tham số cf; phần sai dạng bị bỏ qua thay vì hỏng cả màn', () => {
    const f: ColumnFilters = { customerName: { mode: 'notIn', values: ['Khách B', null] }, qty: { mode: 'in', values: [300] } };
    expect(parseColumnFilters(serializeColumnFilters(f)!)).toEqual(f);
    expect(serializeColumnFilters({})).toBeUndefined();
    expect(parseColumnFilters('{hỏng')).toEqual({});
    expect(parseColumnFilters('{"a":{"like":"x"},"b":{"in":["x",{"y":1}]}}')).toEqual({ b: { mode: 'in', values: ['x'] } });
  });
});

describe('Lưới: kéo giãn độ rộng cột', () => {
  beforeEach(() => localStorage.clear());

  it('bàn phím trên tay kéo đổi độ rộng, lưu theo lưới; Đặt lại độ rộng cột về như cũ', () => {
    const { container } = render(wrap(<DataGrid label="Thử kéo cột" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />));
    const table = container.querySelector('table')!;
    expect(table).not.toHaveAttribute('data-fixed');
    const handle = screen.getByRole('separator', { name: 'Độ rộng cột Khách hàng' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(table).toHaveAttribute('data-fixed');
    const saved = JSON.parse(localStorage.getItem('mes.grid.widths:Thử kéo cột')!);
    // jsdom không đo được bề rộng nên cột lấy độ rộng mặc định 120, cộng 10
    expect(saved.customerName).toBe(130);
    expect(handle).toHaveAttribute('aria-valuenow', '130');
    fireEvent.keyDown(handle, { key: 'ArrowLeft', shiftKey: true });
    expect(JSON.parse(localStorage.getItem('mes.grid.widths:Thử kéo cột')!).customerName).toBe(80);
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại độ rộng cột' }));
    expect(table).not.toHaveAttribute('data-fixed');
    expect(localStorage.getItem('mes.grid.widths:Thử kéo cột')).toBeNull();
  });

  it('kéo chuột đổi độ rộng; mở lại màn vẫn giữ độ rộng đã kéo; chữ bị cắt rê chuột xem đủ', () => {
    const first = render(wrap(<DataGrid label="Thử kéo chuột" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />));
    const handle = screen.getByRole('separator', { name: 'Độ rộng cột Số lượng' });
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 160, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 160, pointerId: 1 });
    expect(JSON.parse(localStorage.getItem('mes.grid.widths:Thử kéo chuột')!).qty).toBe(180);
    first.unmount();
    const { container } = render(wrap(<DataGrid label="Thử kéo chuột" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />));
    expect(container.querySelector('table')).toHaveAttribute('data-fixed');
    const cols = container.querySelectorAll('col');
    // STT, Khách hàng, Số lượng, cột đệm
    expect(cols).toHaveLength(4);
    expect((cols[2] as HTMLElement).style.width).toBe('180px');
    expect(screen.getByText('Khách A')).toHaveAttribute('title', 'Khách A');
  });

  it('độ rộng đã lưu hỏng (sửa tay, bản cũ) thì bỏ qua', () => {
    localStorage.setItem('mes.grid.widths:Thử hỏng', '{"customerName":"rộng"}');
    const { container } = render(wrap(<DataGrid label="Thử hỏng" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />));
    expect(container.querySelector('table')).not.toHaveAttribute('data-fixed');
  });
});

describe('Lưới: lọc theo giá trị của cột (giá trị lấy từ DB)', () => {
  beforeEach(() => {
    useSession.getState().reset('anonymous');
    useSession.getState().set({ fieldPolicies: { 'order.allocation': { qty: 'MASKED' } } });
  });

  const values = ['Khách A', 'Khách B', null];
  const setup = (current?: ColumnFilter) => {
    const load = vi.fn<LoadValues>(async (_field, search) => ({ values: search ? values.filter((v) => v?.includes(search)) : values, truncated: false }));
    const onFilter = vi.fn();
    render(
      wrap(
        <DataGrid
          label="Thử lọc"
          columns={COLUMNS.slice(0, 1)}
          rows={ROWS}
          rowKey={(r) => r.id}
          columnFilters={current ? { customerName: current } : {}}
          onColumnFilter={onFilter}
          loadValues={load}
        />,
      ),
    );
    return { load, onFilter };
  };
  const open = (name = 'Lọc theo cột Khách hàng') => fireEvent.click(screen.getByRole('button', { name }));
  const apply = () => fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));

  it('mặc định chọn hết; bỏ tích một giá trị rồi Áp dụng thì lọc bỏ giá trị đó; ô trống hiện (Trống)', async () => {
    const { load, onFilter } = setup();
    open();
    const b = await screen.findByRole('checkbox', { name: 'Khách B' });
    expect(load).toHaveBeenCalledWith('customerName', '');
    expect(screen.getByRole('checkbox', { name: '(Trống)' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '(Chọn tất cả)' })).toBeChecked();
    fireEvent.click(b);
    expect(screen.getByRole('checkbox', { name: '(Chọn tất cả)' })).toHaveAttribute('data-indeterminate', 'true');
    apply();
    expect(onFilter).toHaveBeenCalledWith('customerName', { mode: 'notIn', values: ['Khách B'] });
  });

  it('bỏ Chọn tất cả thì chưa áp dụng được (nói lý do); tích một giá trị thì chỉ giữ giá trị đó', async () => {
    const { onFilter } = setup();
    open();
    fireEvent.click(await screen.findByRole('checkbox', { name: '(Chọn tất cả)' }));
    expect(screen.getByRole('button', { name: 'Áp dụng' })).toHaveAttribute('aria-disabled', 'true');
    apply();
    expect(onFilter).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Khách A' }));
    apply();
    expect(onFilter).toHaveBeenCalledWith('customerName', { mode: 'in', values: ['Khách A'] });
  });

  it('gõ tìm thì hỏi lại DB; Áp dụng chỉ giữ các giá trị đang tích trong kết quả tìm (như Excel)', async () => {
    const { load, onFilter } = setup();
    open();
    await screen.findByRole('checkbox', { name: 'Khách B' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Tìm giá trị của cột Khách hàng' }), { target: { value: 'A' } });
    await screen.findByRole('checkbox', { name: '(Chọn tất cả kết quả tìm)' });
    expect(load).toHaveBeenLastCalledWith('customerName', 'A');
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Khách B' })).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Áp dụng' })).not.toHaveAttribute('aria-disabled'));
    apply();
    expect(onFilter).toHaveBeenCalledWith('customerName', { mode: 'in', values: ['Khách A'] });
  });

  it('gõ rồi Enter ngay: tìm luôn chứ không áp dụng trạng thái cũ; Enter lần nữa mới áp dụng', async () => {
    const { load, onFilter } = setup();
    open();
    await screen.findByRole('checkbox', { name: 'Khách B' });
    const box = screen.getByRole('textbox', { name: 'Tìm giá trị của cột Khách hàng' });
    fireEvent.change(box, { target: { value: 'A' } });
    expect(screen.getByRole('button', { name: 'Áp dụng' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onFilter).not.toHaveBeenCalled();
    await waitFor(() => expect(load).toHaveBeenLastCalledWith('customerName', 'A'));
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Khách B' })).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Áp dụng' })).not.toHaveAttribute('aria-disabled'));
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onFilter).toHaveBeenCalledWith('customerName', { mode: 'in', values: ['Khách A'] });
  });

  it('tìm ra quá nhiều giá trị chữ có dấu: chưa áp dụng được, nói lý do (URL quá dài máy chủ từ chối)', async () => {
    // 40 tên dài có dấu: dưới 500 giá trị nhưng mã hóa URL vượt ngưỡng
    const many = Array.from({ length: 40 }, (_v, i) => `CÔNG TY TNHH MAY MẶC XUẤT NHẬP KHẨU ĐỒNG NAI VIỆT NAM CHI NHÁNH SỐ ${i}`);
    const load = vi.fn<LoadValues>(async (_field, search) => ({ values: search ? many : ['Khách A'], truncated: false }));
    const onFilter = vi.fn();
    render(wrap(<DataGrid label="Thử dài" columns={COLUMNS.slice(0, 1)} rows={ROWS} rowKey={(r) => r.id} columnFilters={{}} onColumnFilter={onFilter} loadValues={load} />));
    open();
    await screen.findByRole('checkbox', { name: 'Khách A' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Tìm giá trị của cột Khách hàng' }), { target: { value: 'CÔNG' } });
    await screen.findByRole('checkbox', { name: '(Chọn tất cả kết quả tìm)' });
    expect(load).toHaveBeenLastCalledWith('customerName', 'CÔNG');
    const button = screen.getByRole('button', { name: 'Áp dụng' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.mouseEnter(button);
    expect(await screen.findByText(/Chọn quá nhiều giá trị/)).toBeInTheDocument();
    apply();
    expect(onFilter).not.toHaveBeenCalled();
  });

  it('cột đang lọc: nút đổi tên và vạch dưới tiêu đề; Xóa lọc bỏ bộ lọc của cột', async () => {
    const { onFilter } = setup({ mode: 'notIn', values: ['Khách B'] });
    expect(screen.getByRole('columnheader', { name: /Khách hàng/ })).toHaveAttribute('data-filtered');
    open('Đang lọc cột Khách hàng: bỏ 1 giá trị');
    expect(await screen.findByRole('checkbox', { name: 'Khách B' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Khách A' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa lọc' }));
    expect(onFilter).toHaveBeenCalledWith('customerName', null);
  });

  it('lỗi tải giá trị có nút Thử lại; cột bị Che không có nút lọc', async () => {
    const load = vi.fn<LoadValues>().mockRejectedValueOnce(new Error('mạng')).mockResolvedValue({ values: ['Khách A'], truncated: true });
    const { result } = renderHook(() => useFieldPolicy('order.allocation'));
    render(wrap(<DataGrid label="Thử lỗi" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} policy={result.current} columnFilters={{}} onColumnFilter={() => {}} loadValues={load} />));
    expect(screen.queryByRole('button', { name: 'Lọc theo cột Số lượng' })).toBeNull();
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('checkbox', { name: 'Khách A' })).toBeInTheDocument();
    expect(screen.getByText(/Chỉ hiện 1 giá trị đầu/)).toBeInTheDocument();
  });
});
