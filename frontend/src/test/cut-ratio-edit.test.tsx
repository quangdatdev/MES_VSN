import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import CutRatioPage from '../features/order/CutRatioPage';
import { api } from '../lib/api';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

// Phase 5.7 (M1): khung sửa màu cỡ giữ các dòng đang sửa trong chính nó; trang vẫn biết "đã đổi" để hỏi lại khi chọn PO khác.
// Lưới bảng tính không vẽ ô ở jsdom: thay bằng lưới giả có nút sửa dòng đầu.

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

vi.mock('../components/SheetGrid', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../components/SheetGrid')>();
  return {
    ...mod,
    SheetGrid: ({ value, onChange }: { value: { qty: number | null }[]; onChange: (rows: { qty: number | null }[]) => void }) => (
      <button type="button" onClick={() => onChange(value.map((r, i) => (i === 0 ? { ...r, qty: (r.qty ?? 0) + 1 } : r)))}>
        Tăng số lượng dòng 1
      </button>
    ),
  };
});

const po = (id: number, poNumber: string) => ({ id, salesOrderId: 5, poCode: `PO-${id}`, poNumber, customerName: 'KHÁCH THỬ', styleCode: 'MA-05', qty: 100, destination: null, packingListCode: null, customsDeclarationNo: null, syncedAt: null, shipDate: '2026-11-15', statusCode: 'DRAFT', branchCode: 'A01' });

describe('Cập nhật tỷ lệ cắt: đang sửa màu cỡ', () => {
  it('đã sửa mà chọn PO khác thì hỏi lại; chưa sửa gì thì chuyển ngay', async () => {
    useSession.getState().reset('anonymous');
    useSession.getState().set({
      status: 'ready',
      user: { id: 1, username: 'kehoach', fullName: 'Kế hoạch' },
      branch: { code: 'A01', name: 'Nhà máy 1', isAggregate: false },
      roles: [],
      permissions: new Set(['order.po:view', 'order.po:update']),
    });
    const style = { salesOrderId: 5, customerName: 'KHÁCH THỬ', styleCode: 'MA-05', branchCode: 'A01', poCount: 2, confirmedCount: 0, qty: 200, shipDate: '2026-11-15', statusCode: 'DRAFT' };
    vi.mocked(api).mockImplementation((async (path: string) => {
      if (path.startsWith('/order/cut-ratio/styles')) return { items: [style], total: 1, page: 1, pageSize: 100 };
      const m = /^\/order\/cut-ratio\/pos\/(\d+)\/color-sizes/.exec(path);
      if (m) return { po: po(Number(m[1]), m[1] === '9' ? '4500009' : '4500010'), lines: [{ id: 1, colorName: 'Đen', sizeName: 'M', qty: 100 }] };
      if (path.startsWith('/order/cut-ratio/pos')) return { items: [po(9, '4500009'), po(10, '4500010')], total: 2, page: 1, pageSize: 100 };
      return [];
    }) as unknown as typeof api);

    render(
      <MantineProvider theme={theme} env="test">
        <ModalsProvider>
          <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter initialEntries={['/order/cut-ratio?so=5&po=9']}>
              <CutRatioPage />
            </MemoryRouter>
          </QueryClientProvider>
        </ModalsProvider>
      </MantineProvider>,
    );
    const poTable = () => screen.getByRole('table', { name: 'Danh sách PO' });
    await within(poTable()).findByText('4500009');
    await within(screen.getByRole('table', { name: 'Chi tiết màu cỡ' })).findByText('Đen');
    fireEvent.click(screen.getByRole('button', { name: 'Sửa tỷ lệ' }));

    // Chưa sửa gì: chọn PO khác thì chuyển ngay, không hỏi
    fireEvent.click(within(poTable()).getByText('4500010').closest('tr')!);
    expect(screen.queryByText('Bỏ các thay đổi chưa lưu?')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tăng số lượng dòng 1' })).not.toBeInTheDocument());

    // Sửa một dòng rồi chọn PO khác: hỏi lại, chọn Tiếp tục sửa thì vẫn đang sửa
    await within(screen.getByRole('table', { name: 'Chi tiết màu cỡ' })).findByText('Đen');
    fireEvent.click(screen.getByRole('button', { name: 'Sửa tỷ lệ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tăng số lượng dòng 1' }));
    fireEvent.click(within(poTable()).getByText('4500009').closest('tr')!);
    expect(await screen.findByText('Bỏ các thay đổi chưa lưu?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục sửa' }));
    expect(screen.getByRole('button', { name: 'Tăng số lượng dòng 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).not.toHaveAttribute('aria-disabled');
  });
});
