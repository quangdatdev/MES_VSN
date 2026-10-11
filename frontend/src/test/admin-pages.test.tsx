import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FieldPoliciesPage from '../features/admin/FieldPoliciesPage';
import RolesPage from '../features/admin/RolesPage';
import { UserAccessDrawer } from '../features/admin/UserAccessDrawer';
import UsersPage from '../features/admin/UsersPage';
import { api, ApiError } from '../lib/api';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});


type Call = { path: string; method: string; body: unknown };
let calls: Call[] = [];

/** Giả máy chủ: mỗi đường dẫn trả dữ liệu cố định, ghi lại lệnh ghi để kiểm. */
function serve(routes: (path: string, method: string, body: unknown) => unknown) {
  vi.mocked(api).mockImplementation((async (path: string, opts?: { method?: string; body?: unknown }) => {
    const method = opts?.method ?? 'GET';
    if (method !== 'GET') calls.push({ path, method, body: opts?.body });
    return routes(path, method, opts?.body);
  }) as unknown as typeof api);
}

function renderPage(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider theme={theme} env="test">
      <ModalsProvider>
        <QueryClientProvider client={qc}>
          <MemoryRouter>{ui}</MemoryRouter>
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>,
  );
}

function signIn(permissions: string[]) {
  useSession.getState().set({
    status: 'ready',
    user: { id: 1, username: 'admin', fullName: 'Quản trị' },
    branch: { code: 'A01', name: 'Nhà máy 1', isAggregate: false },
    roles: [],
    permissions: new Set(permissions),
  });
}

function pick(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(within(screen.getByRole('listbox', { name: label })).getByRole('option', { name: option }));
}

beforeEach(() => {
  calls = [];
  useSession.getState().reset('anonymous');
});

describe('Chính sách cột: lưu nhiều vai trò, một vai trò lỗi', () => {
  it('chỉ bỏ khỏi bản nháp vai trò đã lưu xong, phần lỗi vẫn giữ để lưu lại', async () => {
    signIn(['admin.fieldpolicy:update']);
    serve((path) => {
      if (path === '/admin/resource-fields') return [{ id: 1, code: 'order.po', name: 'PO', fields: [] }];
      if (path.startsWith('/admin/field-policies')) {
        return {
          resource: { id: 1, code: 'order.po', name: 'PO' },
          fields: [{ code: 'price', name: 'Giá', description: null, isSensitive: false }],
          roles: [{ id: 10, code: 'PLAN', name: 'Kế hoạch' }, { id: 20, code: 'ACC', name: 'Kế toán' }],
          policies: [],
        };
      }
      if (path === '/admin/roles/10/field-policies') return {};
      if (path === '/admin/roles/20/field-policies') throw new ApiError(403, 'SELF_ELEVATION', 'Không đủ quyền');
      throw new Error(`Chưa giả: ${path}`);
    });
    renderPage(<FieldPoliciesPage />);
    await screen.findByRole('combobox', { name: 'Giá với Kế hoạch' });
    pick('Giá với Kế hoạch', 'Ẩn');
    pick('Giá với Kế toán', 'Che');
    expect(screen.getByRole('combobox', { name: 'Giá với Kế hoạch (chưa lưu)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu 2 thay đổi' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu 1 thay đổi' })).toBeInTheDocument());
    expect(calls.map((c) => c.path)).toEqual(['/admin/roles/10/field-policies', '/admin/roles/20/field-policies']);
    // Kế toán lỗi: vẫn còn trên bảng, vẫn đánh dấu chưa lưu
    expect(screen.getByRole('combobox', { name: 'Giá với Kế toán (chưa lưu)' })).toHaveValue('Che');
    expect(screen.getByRole('combobox', { name: 'Giá với Kế hoạch' })).toBeInTheDocument();
  });
});

describe('Người dùng: khóa tài khoản phải xác nhận', () => {
  const user = { id: 2, username: 'dat.le', fullName: 'Lê Đạt', email: null, isActive: true, isLocked: false, lastLoginAt: null, roleIds: [], branchIds: [], defaultBranchId: null };

  it('tắt Cho phép đăng nhập rồi Lưu: hỏi trước, chỉ gửi khi bấm Khóa tài khoản', async () => {
    signIn(['admin.user:update']);
    serve((path, method) => {
      if (path.startsWith('/admin/users?')) return { items: [user], total: 1, page: 1, pageSize: 20 };
      if (path === '/admin/roles' || path === '/admin/branches') return [];
      if (path === '/admin/users/2' && method === 'PUT') return {};
      throw new Error(`Chưa giả: ${path}`);
    });
    renderPage(<UsersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa thông tin' }));
    fireEvent.click(screen.getByRole('switch', { name: /Cho phép đăng nhập/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    const confirm = await screen.findByRole('button', { name: 'Khóa tài khoản' });
    expect(screen.getByText('Khóa tài khoản dat.le?')).toBeInTheDocument();
    expect(calls).toEqual([]);
    fireEvent.click(confirm);
    await waitFor(() => expect(calls).toEqual([{ path: '/admin/users/2', method: 'PUT', body: { fullName: 'Lê Đạt', email: null, isActive: false } }]));
  });

  it('thao tác với chính mình không ẩn đi mà bị khóa, có lý do', async () => {
    signIn(['admin.user:update', 'admin.permission:update']);
    serve((path) => {
      if (path.startsWith('/admin/users?')) return { items: [{ ...user, id: 1, username: 'admin' }], total: 1, page: 1, pageSize: 20 };
      if (path === '/admin/roles' || path === '/admin/branches') return [];
      throw new Error(`Chưa giả: ${path}`);
    });
    renderPage(<UsersPage />);
    const assign = await screen.findByRole('button', { name: 'Gán vai trò' });
    expect(assign).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(assign);
    expect(screen.queryByText('Vai trò của admin')).not.toBeInTheDocument();
  });
});

describe('Phân quyền chi tiết: không mất phần đang nhập', () => {
  it('đổi tab vẫn giữ form; đóng ngăn kéo khi đang nhập dở thì hỏi lại', async () => {
    signIn(['admin.permission:update']);
    serve((path) => {
      if (path === '/admin/users/2/access') return { user: { id: 2, username: 'dat.le', fullName: 'Lê Đạt' }, assignments: [], overrides: [], fieldPolicies: [] };
      if (path === '/admin/permissions') return { actions: ['view'], modules: [] };
      if (path === '/admin/scope-catalog') return { dimensions: [], orgUnits: [] };
      if (path === '/admin/branches' || path === '/admin/resource-fields') return [];
      throw new Error(`Chưa giả: ${path}`);
    });
    const onClose = vi.fn();
    renderPage(<UserAccessDrawer userId={2} onClose={onClose} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Ngoại lệ quyền' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm ngoại lệ' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Lý do/ }), { target: { value: 'Xem kế hoạch' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Cột riêng' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Ngoại lệ quyền' }));
    expect(screen.getByRole('textbox', { name: /Lý do/ })).toHaveValue('Xem kế hoạch');

    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tiếp tục sửa' }));
    expect(onClose).not.toHaveBeenCalled();
    // Esc trong ngăn kéo hỏi lại; Esc trong hộp hỏi chỉ đóng hộp hỏi, không bật hộp hỏi mới
    fireEvent.keyDown(screen.getByRole('textbox', { name: /Lý do/ }), { key: 'Escape' });
    const keep = await screen.findByRole('button', { name: 'Tiếp tục sửa' });
    fireEvent.keyDown(keep, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tiếp tục sửa' })).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Bỏ thay đổi' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mở cho chính mình: nút sửa bị khóa, có lời nhắc', async () => {
    signIn(['admin.permission:update']);
    serve((path) => {
      if (path === '/admin/users/1/access') return { user: { id: 1, username: 'admin', fullName: 'Quản trị' }, assignments: [], overrides: [], fieldPolicies: [] };
      if (path === '/admin/branches' || path === '/admin/resource-fields') return [];
      throw new Error(`Chưa giả: ${path}`);
    });
    renderPage(<UserAccessDrawer userId={1} onClose={() => {}} />);
    expect(await screen.findByText(/Đây là tài khoản của bạn/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Ngoại lệ quyền' }));
    expect(await screen.findByRole('button', { name: 'Thêm ngoại lệ' })).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('Vai trò: tắt Đang dùng phải xác nhận', () => {
  it('nêu số người bị ảnh hưởng, chỉ gửi khi bấm Ngừng dùng vai trò', async () => {
    signIn(['admin.role:update']);
    const role = { id: 5, code: 'PLAN', name: 'Kế hoạch', description: null, isActive: true, isSystem: false, permissionCount: 3, userCount: 4 };
    serve((path, method) => {
      if (path === '/admin/roles' && method === 'GET') return [role];
      if (path === '/admin/roles/5' && method === 'PUT') return {};
      throw new Error(`Chưa giả: ${path}`);
    });
    renderPage(<RolesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa vai trò Kế hoạch' }));
    fireEvent.click(screen.getByRole('switch', { name: /Đang dùng/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(await screen.findByText(/4 người dùng đang giữ vai trò này/)).toBeInTheDocument();
    expect(calls).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Ngừng dùng vai trò' }));
    await waitFor(() => expect(calls).toEqual([{ path: '/admin/roles/5', method: 'PUT', body: { name: 'Kế hoạch', description: '', isActive: false } }]));
  });
});
