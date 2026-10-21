import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { act, fireEvent, render } from '@testing-library/react';
import { forwardRef, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SheetGrid, sheetNumber, sheetText } from '../components/SheetGrid';
import { guardedLeave } from '../lib/leaveGuard';
import { theme } from '../theme/theme';

// Task T14: SheetGrid dùng bản động của react-datasheet-grid (đọc lại cột, vạch dòng chọn, cột STT khi tham chiếu đổi). jsdom không
// vẽ ô của thư viện: thay lưới bằng bản giả ghi lại prop nhận được. Đổi ngược về bản tĩnh (DataSheetGrid) thì bản giả không được gọi.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const calls: any[] = [];
vi.mock('react-datasheet-grid', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-datasheet-grid')>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Fake = forwardRef((props: any, _ref) => {
    calls.push(props);
    return (
      <div className="dsg-container">
        <input className="dsg-input" data-testid="cell" />
      </div>
    );
  });
  return { ...mod, DynamicDataSheetGrid: Fake };
});

vi.mock('@mantine/hooks', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@mantine/hooks')>();
  return { ...mod, useElementSize: () => ({ ref: { current: null }, width: 900, height: 400 }) };
});

interface Row {
  id: number;
  name: string;
  qty: number | null;
}

const COLUMNS = [sheetText<Row>('name', 'Tên'), sheetNumber<Row>('qty', 'Số lượng')];
const wrap = (node: ReactNode) => (
  <MantineProvider theme={theme} env="test">
    <ModalsProvider>{node}</ModalsProvider>
  </MantineProvider>
);
const last = () => calls[calls.length - 1];

describe('SheetGrid dùng bản động của lưới', () => {
  it('giữ tham chiếu các prop của lưới khi dữ liệu đổi và hàm của màn viết tại chỗ', () => {
    const rows: Row[] = [{ id: 1, name: 'A', qty: 1 }];
    const props = (value: Row[]) => (
      <SheetGrid<Row> label="Lưới thử" value={value} onChange={() => undefined} columns={COLUMNS} rowKey={(r) => r.id} createRow={() => ({ id: 9, name: '', qty: null })} duplicateRow={(r) => ({ ...r, id: 10 })} selectedKey={1} />
    );
    const { rerender } = render(wrap(props(rows)));
    const before = last();
    rerender(wrap(props([...rows, { id: 2, name: 'B', qty: 2 }])));
    const after = last();
    expect(after.value).toHaveLength(2);
    for (const key of ['columns', 'gutterColumn', 'rowClassName', 'stickyRightColumn', 'addRowsComponent', 'createRow', 'duplicateRow', 'rowKey', 'onChange', 'onActiveCellChange']) {
      expect(after[key], key).toBe(before[key]);
    }
  });

  it('vạch dòng chọn theo selectedKey mới; STT theo indexOffset mới', () => {
    const rows: Row[] = [
      { id: 1, name: 'A', qty: 1 },
      { id: 2, name: 'B', qty: 2 },
    ];
    const props = (selectedKey: number, indexOffset: number) => (
      <SheetGrid<Row> label="Lưới thử" value={rows} onChange={() => undefined} columns={COLUMNS} rowKey={(r) => r.id} selectedKey={selectedKey} indexOffset={indexOffset} />
    );
    const { rerender } = render(wrap(props(1, 0)));
    expect(last().rowClassName({ rowData: rows[0] })).toBe('sheet-row-selected');
    rerender(wrap(props(2, 100)));
    const p = last();
    expect(p.rowClassName({ rowData: rows[0] })).toBeUndefined();
    expect(p.rowClassName({ rowData: rows[1] })).toBe('sheet-row-selected');
    const Gutter = p.gutterColumn.component;
    const { container } = render(<Gutter rowData={rows[0]} rowIndex={0} />);
    expect(container.textContent).toBe('101');
  });

  it('lưới báo lại cùng ô khi cột đổi thì vẫn giữ cờ đang gõ dở (rời màn vẫn hỏi lại); chọn ô khác thì thôi', async () => {
    const rows: Row[] = [{ id: 1, name: 'A', qty: 1 }];
    const props = (columns: typeof COLUMNS) => <SheetGrid<Row> label="Lưới thử" value={rows} onChange={() => undefined} columns={columns} rowKey={(r) => r.id} />;
    const { rerender, getByTestId, findByText, getByRole } = render(wrap(props(COLUMNS)));
    act(() => last().onActiveCellChange({ cell: { row: 0, col: 0 } }));
    fireEvent.input(getByTestId('cell'));
    // Cột mới (ví dụ danh sách chuyền tải xong): thư viện báo lại đúng ô đang chọn
    rerender(wrap(props([...COLUMNS])));
    act(() => last().onActiveCellChange({ cell: { row: 0, col: 0 } }));
    const leave = vi.fn();
    act(() => guardedLeave(leave));
    expect(leave).not.toHaveBeenCalled();
    expect(await findByText('Bỏ các thay đổi chưa lưu?')).toBeInTheDocument();
    fireEvent.click(getByRole('button', { name: 'Tiếp tục sửa' }));

    act(() => last().onActiveCellChange({ cell: { row: 0, col: 1 } }));
    act(() => guardedLeave(leave));
    expect(leave).toHaveBeenCalledTimes(1);
  });
});
