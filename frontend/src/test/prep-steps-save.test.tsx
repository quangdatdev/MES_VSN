import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PrepStepsPane } from '../features/admin/PrepStepsPane';
import type { PrepStep } from '../features/sewing/api';
import { api } from '../lib/api';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

// Phase 5.7, lỗi L2: lưới vẫn sửa được trong lúc đang lưu; lưu xong không được xóa phần gõ thêm.
// Lưới bảng tính không vẽ ô ở jsdom (không đo được kích thước): thay bằng lưới giả có nút sửa từng dòng.

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

vi.mock('../components/SheetGrid', () => ({
  SheetGrid: ({ value, onChange }: { value: { name: string }[]; onChange: (rows: { name: string }[]) => void }) => {
    const edit = (i: number) => onChange(value.map((r, j) => (j === i ? { ...r, name: `${r.name}+` } : r)));
    return (
      <div>
        <output data-testid="rows">{value.map((r) => r.name).join(' | ')}</output>
        <button type="button" onClick={() => edit(0)}>Sửa dòng 1</button>
        <button type="button" onClick={() => edit(1)}>Sửa dòng 2</button>
      </div>
    );
  },
  sheetNumber: () => ({}),
  sheetReadonly: () => ({}),
  sheetText: () => ({}),
  sheetSelect: () => ({}),
}));

const step = (id: number, name: string): PrepStep => ({ id, code: `CB0${id}`, name, description: null, planDays: id, performer: null, dataSource: null, sortOrder: id * 10, isActive: true });

describe('Cấu hình chuẩn bị SX: gõ thêm trong lúc đang lưu', () => {
  it('lưu xong vẫn giữ ô vừa gõ thêm; lần lưu sau chỉ gửi ô đó', async () => {
    useSession.getState().reset('anonymous');
    useSession.getState().set({
      status: 'ready',
      user: { id: 1, username: 'admin', fullName: 'Quản trị' },
      branch: { code: 'A01', name: 'Nhà máy 1', isAggregate: false },
      roles: [],
      permissions: new Set(['admin.catalog:view', 'admin.catalog:update']),
    });
    let server = [step(1, 'Bước 1'), step(2, 'Bước 2')];
    let release: () => void = () => {};
    const puts: { items: { id: number; name: string }[] }[] = [];
    vi.mocked(api).mockImplementation((async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (opts?.method === 'PUT') {
        const body = opts.body as { items: { id: number; name: string }[] };
        puts.push(body);
        await new Promise<void>((r) => (release = r));
        server = server.map((s) => ({ ...s, name: body.items.find((i) => i.id === s.id)?.name ?? s.name }));
        return undefined;
      }
      if (path === '/sewing/prep-steps') return server;
      return [];
    }) as unknown as typeof api);

    render(
      <MantineProvider theme={theme} env="test">
        <ModalsProvider>
          <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter>
              <PrepStepsPane />
            </MemoryRouter>
          </QueryClientProvider>
        </ModalsProvider>
      </MantineProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('rows')).toHaveTextContent('Bước 1 | Bước 2'));
    fireEvent.click(screen.getByRole('button', { name: 'Sửa dòng 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].items.map((i) => i.name)).toEqual(['Bước 1+']);

    // Đang chờ máy chủ: gõ thêm dòng 2
    fireEvent.click(screen.getByRole('button', { name: 'Sửa dòng 2' }));
    release();
    await waitFor(() => expect(screen.getByTestId('rows')).toHaveTextContent('Bước 1+ | Bước 2+'));
    // Danh mục tải lại xong: dòng 1 đã lưu, dòng 2 vẫn là thay đổi chưa lưu
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).not.toHaveAttribute('aria-disabled'));
    expect(screen.getByTestId('rows')).toHaveTextContent('Bước 1+ | Bước 2+');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1].items.map((i) => i.name)).toEqual(['Bước 2+']);
    release();
  });
});
