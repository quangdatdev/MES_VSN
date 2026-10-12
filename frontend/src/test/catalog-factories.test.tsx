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
// Phase 5.10: không còn khung Chuyền may; Nhà máy SX là khung mặc định, danh sách ĐVCS đi kèm tổng quan danh mục.

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

const factory = { id: 5, code: 'VIET DUC', name: 'Việt Đức', branchCode: null, branchName: null, description: null, sortOrder: 10, isActive: true };
const overview = {
  mes: [{ code: 'PROD_FACTORY', kind: 'factory', name: 'Nhà máy SX', description: null, total: 1, active: 1 }],
  external: [],
  externalError: null,
  branches: [
    { code: 'A01', name: 'VSN', isActive: true },
    { code: 'A09', name: 'Đơn vị đã tắt', isActive: false },
  ],
};

function signIn(permissions: string[]) {
  useSession.getState().reset('anonymous');
  useSession.getState().set({
    status: 'ready',
    user: { id: 1, username: 'danhmuc', fullName: 'Quản lý danh mục' },
    branch: { code: 'A01', name: 'VSN', isAggregate: false },
    roles: [],
    permissions: new Set(permissions),
  });
}

/** Giả API: ghi lại lệnh ghi và mọi đường đã gọi */
function mockApi() {
  const calls: { path: string; method: string; body: unknown }[] = [];
  const paths: string[] = [];
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation((async (path: string, opts?: { method?: string; body?: unknown }) => {
    const method = opts?.method ?? 'GET';
    paths.push(path);
    if (method !== 'GET') {
      calls.push({ path, method, body: opts?.body });
      return {};
    }
    if (path === '/admin/catalogs') return overview;
    if (path.startsWith('/admin/catalogs/factories')) return [factory];
    return [];
  }) as unknown as typeof api);
  return { calls, paths };
}

function renderAt(url: string) {
  return render(
    <MantineProvider theme={theme} env="test">
      <ModalsProvider>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter initialEntries={[url]}>
            <CatalogsPage />
          </MemoryRouter>
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>,
  );
}

describe('Danh mục Nhà máy SX: chỉ có quyền sửa danh mục', () => {
  it('nút Thêm, công tắc bị khóa có lý do; sửa tên được, không gửi ĐVCS', async () => {
    signIn(['admin.catalog:view', 'admin.catalog:create', 'admin.catalog:update']);
    const { calls } = mockApi();
    renderAt('/admin/catalogs?c=PROD_FACTORY');
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

describe('Danh mục hệ thống sau khi bỏ khung Chuyền may (phase 5.10)', () => {
  it('chưa chọn danh mục thì mở Nhà máy SX; ô ĐVCS lấy từ tổng quan, không gọi API chuyền cũ', async () => {
    signIn(['admin.catalog:view', 'admin.catalog:create', 'admin.catalog:update', 'admin.permission:update']);
    const { calls, paths } = mockApi();
    renderAt('/admin/catalogs');
    expect(await screen.findByRole('heading', { name: 'Nhà máy SX' })).toBeInTheDocument();
    expect(await screen.findByRole('switch', { name: 'Đang dùng: VIET DUC' })).toBeInTheDocument();
    // Ô lọc theo ĐVCS có mọi ĐVCS của tổng quan
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo đơn vị cơ sở' }));
    const filter = await screen.findByRole('listbox', { name: 'Lọc theo đơn vị cơ sở' });
    expect(within(filter).getByRole('option', { name: 'VSN (A01)' })).toBeInTheDocument();
    expect(within(filter).getByRole('option', { name: 'Đơn vị đã tắt (A09)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo đơn vị cơ sở' }));

    // Popup sửa: ĐVCS đang tắt không chọn được cho nhà máy chưa gắn đơn vị; chọn A01 rồi lưu gửi đúng mã
    fireEvent.click(screen.getByRole('button', { name: 'Sửa VIET DUC' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sửa nhà máy SX VIET DUC' });
    fireEvent.click(within(dialog).getByRole('combobox', { name: 'Đơn vị cơ sở' }));
    const pick = await screen.findByRole('listbox', { name: 'Đơn vị cơ sở' });
    expect(within(pick).queryByRole('option', { name: /Đơn vị đã tắt/ })).toBeNull();
    fireEvent.click(within(pick).getByRole('option', { name: 'VSN (A01)' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ path: '/admin/catalogs/factories/5', method: 'PUT', body: { branchCode: 'A01' } });
    expect(paths.some((p) => p.startsWith('/admin/catalogs/lines') || p.startsWith('/admin/catalogs/workshops'))).toBe(false);
    // Không còn mục Chuyền may ở cột danh mục
    expect(screen.queryByRole('button', { name: /Chuyền may/ })).toBeNull();
  });

  it('liên kết cũ tới khung Chuyền may chỉ đường sang Sơ đồ tổ chức', async () => {
    signIn(['admin.catalog:view', 'hr.orgchart:view']);
    mockApi();
    renderAt('/admin/catalogs?c=LINE');
    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent('Chuyền may không còn ở Danh mục hệ thống');
    expect(within(note).getByRole('link', { name: 'Sơ đồ tổ chức' })).toHaveAttribute('href', '/hr/org-chart');
  });
});
