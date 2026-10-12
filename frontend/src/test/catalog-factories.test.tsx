import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import CatalogsPage from '../features/admin/CatalogsPage';
import { api } from '../lib/api';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

// Nhà máy SX (ADR 0013 mục 11, review 5.9.13 M2): ĐVCS của nhà máy quyết định đơn nào lập kế hoạch được ở đơn vị đó, nên thêm,
// đổi ĐVCS, bật/tắt nhà máy cần thêm quyền sửa phân quyền. Chỉ có quyền sửa danh mục thì vẫn sửa được tên.

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

const factory = { id: 5, code: 'VIET DUC', name: 'Việt Đức', branchCode: null, branchName: null, description: null, sortOrder: 10, isActive: true };

describe('Danh mục Nhà máy SX: chỉ có quyền sửa danh mục', () => {
  it('nút Thêm, công tắc bị khóa có lý do; sửa tên được, không gửi ĐVCS', async () => {
    useSession.getState().reset('anonymous');
    useSession.getState().set({
      status: 'ready',
      user: { id: 1, username: 'danhmuc', fullName: 'Quản lý danh mục' },
      branch: { code: 'A01', name: 'VSN', isAggregate: false },
      roles: [],
      permissions: new Set(['admin.catalog:view', 'admin.catalog:create', 'admin.catalog:update']),
    });
    const calls: { path: string; method: string; body: unknown }[] = [];
    vi.mocked(api).mockImplementation((async (path: string, opts?: { method?: string; body?: unknown }) => {
      const method = opts?.method ?? 'GET';
      if (method !== 'GET') {
        calls.push({ path, method, body: opts?.body });
        return {};
      }
      if (path === '/admin/catalogs') return { mes: [{ code: 'PROD_FACTORY', kind: 'factory', name: 'Nhà máy SX', description: null, total: 1, active: 1 }], external: [], externalError: null };
      if (path === '/admin/catalogs/lines') return { branches: [{ code: 'A01', name: 'VSN', isActive: true }], workshops: [], items: [] };
      if (path.startsWith('/admin/catalogs/factories')) return [factory];
      return [];
    }) as unknown as typeof api);

    render(
      <MantineProvider theme={theme} env="test">
        <ModalsProvider>
          <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter initialEntries={['/admin/catalogs?c=PROD_FACTORY']}>
              <CatalogsPage />
            </MemoryRouter>
          </QueryClientProvider>
        </ModalsProvider>
      </MantineProvider>,
    );
    const toggle = await screen.findByRole('switch', { name: 'Đang dùng: VIET DUC' });
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Thêm nhà máy' })).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Sửa VIET DUC' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sửa nhà máy SX VIET DUC' });
    expect(within(dialog).getByText(/cần thêm quyền sửa phân quyền/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Tên nhà máy' }), { target: { value: 'Việt Đức 2' } });
    // Nhà máy chưa gắn ĐVCS mà không chọn được: vẫn lưu được tên
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ path: '/admin/catalogs/factories/5', method: 'PUT' });
    expect(JSON.parse(JSON.stringify(calls[0].body))).toEqual({ name: 'Việt Đức 2', description: null, sortOrder: 10 });
  });
});
