import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SheetGrid, sheetDate } from '../components/SheetGrid';
import { guardedLeave } from '../lib/leaveGuard';
import { theme } from '../theme/theme';

// Phase 5.7 (review): ô ngày chỉ ghi khi rời ô, nên lúc đang gõ dở lưới tự báo "chưa lưu" để rời màn vẫn được hỏi lại.

// jsdom không đo được kích thước: cho khung lưới cao 400px để lưới được vẽ
vi.mock('@mantine/hooks', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@mantine/hooks')>();
  return { ...mod, useElementSize: () => ({ ref: { current: null }, width: 900, height: 400 }) };
});

interface Row {
  id: number;
  d: string | null;
}

describe('Lưới nhập: gõ dở trong ô', () => {
  it('đang gõ trong lưới thì rời màn phải hỏi lại; Esc bỏ phần đang gõ thì thôi hỏi', async () => {
    const { container } = render(
      <MantineProvider theme={theme} env="test">
        <ModalsProvider>
          <SheetGrid<Row> label="Lưới thử" value={[{ id: 1, d: null }]} onChange={() => undefined} columns={[sheetDate<Row>('d', 'Ngày')]} rowKey={(r) => r.id} />
        </ModalsProvider>
      </MantineProvider>,
    );
    const leave = vi.fn();
    act(() => guardedLeave(leave));
    expect(leave).toHaveBeenCalledTimes(1);

    // Ô của thư viện không vẽ ở jsdom: gắn tạm một ô nhập giống ô của thư viện vào khung lưới
    const inner = container.querySelector('.dsg-container')!;
    const cell = document.createElement('input');
    cell.className = 'dsg-input';
    inner.appendChild(cell);
    // Chữ tìm của ô chọn (chuyền, trạng thái) không tính là dữ liệu chờ ghi
    const search = document.createElement('input');
    search.className = 'sheet-select';
    inner.appendChild(search);
    fireEvent.input(search);
    act(() => guardedLeave(leave));
    expect(leave).toHaveBeenCalledTimes(2);

    fireEvent.input(cell);
    act(() => guardedLeave(leave));
    expect(leave).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Bỏ các thay đổi chưa lưu?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục sửa' }));

    fireEvent.keyDown(cell, { key: 'Escape' });
    act(() => guardedLeave(leave));
    expect(leave).toHaveBeenCalledTimes(3);
  });
});
