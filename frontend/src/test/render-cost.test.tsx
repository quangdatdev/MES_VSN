import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataGrid, Masked, type Column } from '../components/DataGrid';
import { DebouncedTextInput } from '../components/DebouncedInput';
import { sheetDate, sheetNumber } from '../components/SheetGrid';
import type { BoardBar } from '../features/order/api';
import { LineBoard } from '../features/order/LineBoard';
import { useAfterClose } from '../lib/afterClose';
import { theme } from '../theme/theme';

// Phase 5.7: các tối ưu vẽ lại phải giữ nguyên hành vi. Mỗi test khóa một điều đã đổi.

const wrap = (ui: React.ReactNode) => (
  <MantineProvider theme={theme} env="test">
    {ui}
  </MantineProvider>
);

describe('Lưới xem: chỉ vẽ lại dòng đổi', () => {
  interface Row {
    id: number;
    name: string;
  }
  const ROWS: Row[] = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `Dòng ${i + 1}` }));
  let renders = 0;
  const COLS: Column<Row>[] = [
    {
      key: 'name',
      title: 'Tên',
      render: (r) => {
        renders++;
        return r.name;
      },
    },
  ];

  function Page() {
    const [selected, setSelected] = useState<number | null>(null);
    const [, setTick] = useState(0);
    return (
      <>
        <button type="button" onClick={() => setTick((t) => t + 1)}>
          Đổi state khác
        </button>
        {/* rowKey, onRowClick viết tại chỗ như các màn: lưới vẫn không vẽ lại dòng không đổi */}
        <DataGrid label="Lưới thử" columns={COLS} rows={ROWS} rowKey={(r) => r.id} selectedKey={selected} onRowClick={(r) => setSelected(r.id)} />
      </>
    );
  }

  it('bấm chọn dòng chỉ vẽ lại dòng cũ và dòng mới; trang render lại vì việc khác thì không vẽ lại dòng nào', () => {
    renders = 0;
    render(wrap(<Page />));
    expect(renders).toBe(20);
    const rows = within(screen.getByRole('table', { name: 'Lưới thử' })).getAllByRole('row').slice(1);
    // Chưa chọn thì dòng đầu nhận Tab: chọn dòng 4 vẽ lại dòng 4 (chọn) và dòng 1 (thôi nhận Tab)
    fireEvent.click(rows[3]);
    expect(renders).toBe(22);
    expect(rows[3]).toHaveAttribute('aria-current', 'true');
    expect(rows[3]).toHaveAttribute('tabindex', '0');
    fireEvent.click(rows[7]);
    expect(renders).toBe(24);
    expect(rows[3]).not.toHaveAttribute('aria-current');
    fireEvent.click(screen.getByRole('button', { name: 'Đổi state khác' }));
    expect(renders).toBe(24);
  });

  it('ô bị Che nói lý do bằng title (không dựng Tooltip cho từng ô)', () => {
    render(wrap(<Masked />));
    expect(screen.getByText('***').closest('.cell-masked')).toHaveAttribute('title', 'Bị che theo phân quyền của bạn');
  });
});

describe('Ô lọc chữ: gõ không lọc ngay', () => {
  afterEach(() => vi.useRealTimers());

  it('chỉ báo khi ngừng gõ 300 ms; Enter báo ngay; giá trị đổi từ ngoài (Xóa lọc) bỏ lượt báo đang chờ', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { rerender } = render(wrap(<DebouncedTextInput aria-label="Mã hàng" value="" onChange={onChange} />));
    const input = screen.getByLabelText('Mã hàng');
    fireEvent.change(input, { target: { value: 'M' } });
    fireEvent.change(input, { target: { value: 'MA' } });
    expect(input).toHaveValue('MA');
    act(() => vi.advanceTimersByTime(299));
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('MA');

    rerender(wrap(<DebouncedTextInput aria-label="Mã hàng" value="MA" onChange={onChange} />));
    fireEvent.change(input, { target: { value: 'MA-1' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('MA-1');

    // Đang gõ dở thì bấm Xóa lọc: ô về rỗng, chữ đang chờ không được báo nữa
    rerender(wrap(<DebouncedTextInput aria-label="Mã hàng" value="MA-1" onChange={onChange} />));
    fireEvent.change(input, { target: { value: 'MA-12' } });
    rerender(wrap(<DebouncedTextInput aria-label="Mã hàng" value="" onChange={onChange} />));
    expect(input).toHaveValue('');
    act(() => vi.advanceTimersByTime(500));
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe('Ô lọc chữ: giá trị quay về chậm (URL đổi trong startTransition)', () => {
  afterEach(() => vi.useRealTimers());

  it('đã đẩy "AB", gõ thêm "C" trước khi giá trị quay về: giữ "ABC" và đẩy tiếp; dấu cách cuối không bị bỏ', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const ui = (value: string) => wrap(<DebouncedTextInput aria-label="Tìm" value={value} onChange={onChange} />);
    const { rerender } = render(ui(''));
    const input = screen.getByLabelText('Tìm');
    fireEvent.change(input, { target: { value: 'AB' } });
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).toHaveBeenLastCalledWith('AB');
    fireEvent.change(input, { target: { value: 'ABC' } });
    // Giá trị vừa đẩy quay về sau khi người dùng đã gõ thêm
    rerender(ui('AB'));
    expect(input).toHaveValue('ABC');
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).toHaveBeenLastCalledWith('ABC');
    rerender(ui('ABC'));

    fireEvent.change(input, { target: { value: 'ABC ' } });
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).toHaveBeenLastCalledWith('ABC ');
    rerender(ui('ABC '));
    fireEvent.change(input, { target: { value: 'ABC D' } });
    expect(input).toHaveValue('ABC D');
  });

  it('đẩy "XY" rồi xóa hết trước khi "XY" kịp quay về: vẫn đẩy chữ rỗng, ô giữ rỗng', () => {
    const onChange = vi.fn();
    const ui = (value: string) => wrap(<DebouncedTextInput aria-label="Tìm" value={value} onChange={onChange} />);
    const { rerender } = render(ui(''));
    const input = screen.getByLabelText('Tìm');
    fireEvent.change(input, { target: { value: 'XY' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('XY');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('');
    rerender(ui('XY'));
    rerender(ui(''));
    expect(input).toHaveValue('');
  });
});

describe('Lưới nhập: ô ngày ghi khi rời ô', () => {
  it('ô ngày không ghi theo từng phím (gõ dở "20/10" không thành ngày); ô số vẫn ghi theo phím', () => {
    type R = { d: string | null; n: number | null };
    // keyColumn của thư viện bọc cột gốc: cờ nằm ở columnData của cột gốc
    const original = (c: unknown) => (c as { columnData: { original: { columnData: { continuousUpdates: boolean } } } }).columnData.original.columnData;
    expect(original(sheetDate<R>('d', 'Ngày')).continuousUpdates).toBe(false);
    expect(original(sheetNumber<R>('n', 'Số')).continuousUpdates).toBe(true);
  });
});

describe('Bảng dàn chuyền: thanh giữ nguyên khi đổi thứ tự', () => {
  const bar = (patch: Partial<BoardBar>): BoardBar => ({
    id: 1,
    planId: 1,
    planNo: 'KH-A01-000001',
    lineCode: 'A01-L03',
    startDate: '2026-12-07',
    endDate: '2026-12-08',
    qty: 300,
    avgOutput: 100,
    customerName: 'Khách thử',
    styleCode: 'MA-01',
    poBuyDate: '4500 / 01-12',
    shipDate: '2026-12-20',
    statusCode: 'PLANNED',
    ...patch,
  });
  const lines = [{ code: 'A01-L03', name: 'Chuyền 3' }];

  it('sửa ngày làm thanh đổi chỗ: chi tiết đang mở của thanh không bị đóng', async () => {
    const a = bar({ id: 1, styleCode: 'MA-01' });
    const b = bar({ id: 2, styleCode: 'MA-02', startDate: '2026-12-14', endDate: '2026-12-15' });
    const { rerender } = render(wrap(<LineBoard from="2026-12-01" to="2026-12-31" lines={lines} bars={[a, b]} />));
    fireEvent.click(screen.getByRole('button', { name: /MA-02/ }));
    expect(await screen.findByText(/kế hoạch KH-A01-000001/)).toBeInTheDocument();
    // MA-02 dời lên trước MA-01: vị trí trong danh sách của chuyền đổi từ 1 sang 0
    const moved = { ...b, startDate: '2026-12-02', endDate: '2026-12-03' };
    rerender(wrap(<LineBoard from="2026-12-01" to="2026-12-31" lines={lines} bars={[a, moved]} />));
    expect(screen.getByText(/kế hoạch KH-A01-000001/)).toBeInTheDocument();
  });
});

describe('Làm mới sau khi popup đóng hẳn', () => {
  function Detail() {
    useQuery({ queryKey: ['thu', 'chi-tiet'], queryFn: detailFn });
    return <p>Chi tiết</p>;
  }
  const detailFn = vi.fn(async () => 'chi tiết');
  const listFn = vi.fn(async () => 'danh sách');

  function Page() {
    const qc = useQueryClient();
    useQuery({ queryKey: ['thu', 'danh-sach'], queryFn: listFn });
    const [open, setOpen] = useState(true);
    const refresh = useAfterClose(() => qc.invalidateQueries({ queryKey: ['thu'] }));
    return (
      <>
        {open && <Detail />}
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            refresh();
          }}
        >
          Lưu
        </button>
      </>
    );
  }

  it('lưu xong: danh sách trên trang tải lại, chi tiết của popup vừa đóng không bị tải lại rồi bỏ đi', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Page />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(detailFn).toHaveBeenCalledTimes(1));
    expect(listFn).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(listFn).toHaveBeenCalledTimes(2));
    expect(detailFn).toHaveBeenCalledTimes(1);
    // Chi tiết chỉ bị đánh dấu cũ: mở lại popup thì tải lại
    expect(qc.getQueryState(['thu', 'chi-tiet'])?.isInvalidated).toBe(true);
  });
});
