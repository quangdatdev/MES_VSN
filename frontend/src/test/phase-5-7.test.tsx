import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PermissionsPage from '../features/admin/PermissionsPage';
import { UserAccessDrawer } from '../features/admin/UserAccessDrawer';
import UsersPage from '../features/admin/UsersPage';
import CutRatioPage from '../features/order/CutRatioPage';
import { api } from '../lib/api';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

// Phase 5.7: lỗi đúng/sai đã sửa và các chỗ gọi API đổi thứ tự (song song, chỉ gọi khi cần)

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

function serve(routes: (path: string) => unknown) {
  vi.mocked(api).mockImplementation((async (path: string) => routes(path ?? '')) as unknown as typeof api);
}
const paths = () => vi.mocked(api).mock.calls.map((c) => String(c[0]));

/** Đường dẫn hiện tại của router, để kiểm URL sau khi màn tự sửa trang */
function Where() {
  const loc = useLocation();
  return <output data-testid="where">{`${loc.pathname}${loc.search}`}</output>;
}

function renderPage(ui: ReactNode, path = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider theme={theme} env="test">
      <ModalsProvider>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={[path]}>
            {ui}
            <Where />
          </MemoryRouter>
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>,
  );
}

function signIn(permissions: string[]) {
  useSession.getState().reset('anonymous');
  useSession.getState().set({
    status: 'ready',
    user: { id: 1, username: 'admin', fullName: 'Quản trị' },
    branch: { code: 'A01', name: 'Nhà máy 1', isAggregate: false },
    roles: [],
    permissions: new Set(permissions),
  });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => vi.mocked(api).mockReset());

describe('Người dùng: link cũ có trang vượt trang cuối (L1)', () => {
  it('150 người, 100 dòng một trang, mở page=3: về trang 2 (trước đây tính theo 20 dòng nên kẹt ở trang rỗng)', async () => {
    signIn(['admin.user:view']);
    const user = (id: number) => ({ id, username: `nguoi${id}`, fullName: `Người ${id}`, email: null, isActive: true, isLocked: false, lastLoginAt: null, roleIds: [], branchIds: [], defaultBranchId: null });
    serve((p) => {
      if (p.startsWith('/admin/users?page=3')) return { items: [], total: 150, page: 3, pageSize: 100 };
      if (p.startsWith('/admin/users?page=2')) return { items: [user(101)], total: 150, page: 2, pageSize: 100 };
      return [];
    });
    renderPage(<UsersPage />, '/admin/users?page=3');
    expect(await screen.findByText('nguoi101')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/users?page=2');
    expect(paths().some((p) => p.startsWith('/admin/users?page=8'))).toBe(false);
  });
});

describe('Phân quyền chi tiết: tab Xem thử (M10)', () => {
  it('chỉ gọi tính quyền thực tế khi mở tab Xem thử lần đầu', async () => {
    signIn(['admin.permission:update']);
    serve((p) => {
      if (p === '/admin/users/2/access') return { user: { id: 2, username: 'dat.le', fullName: 'Lê Đạt' }, assignments: [], overrides: [], fieldPolicies: [] };
      if (p === '/admin/branches') return [{ id: 1, code: 'A01', name: 'Nhà máy 1', isActive: true, isAggregate: false }];
      if (p.startsWith('/admin/users/2/effective')) return { menu: [], permissions: [], fieldPolicies: [], scopes: [] };
      return [];
    });
    renderPage(<UserAccessDrawer userId={2} onClose={() => {}} />);
    await screen.findByRole('tab', { name: 'Ngoại lệ quyền' });
    await waitFor(() => expect(paths()).toContain('/admin/users/2/access'));
    expect(paths().some((p) => p.includes('/effective'))).toBe(false);
    fireEvent.click(screen.getByRole('tab', { name: 'Xem thử' }));
    await waitFor(() => expect(paths().some((p) => p.startsWith('/admin/users/2/effective'))).toBe(true));
  });
});

describe('Cập nhật tỷ lệ cắt: mở link có sẵn mã hàng, PO (A3)', () => {
  it('danh sách PO và màu cỡ gọi song song theo URL, không chờ danh sách mã hàng; chỉ hiện khi mã hàng, PO có trong lưới', async () => {
    signIn(['order.po:view']);
    const styles = deferred<unknown>();
    const style = { salesOrderId: 5, customerName: 'KHÁCH THỬ', styleCode: 'MA-05', branchCode: 'A01', poCount: 1, confirmedCount: 0, qty: 100, shipDate: '2026-11-15', statusCode: 'DRAFT' };
    const po = { id: 9, salesOrderId: 5, poCode: 'PO-09', poNumber: '4500009', customerName: 'KHÁCH THỬ', styleCode: 'MA-05', qty: 100, destination: null, packingListCode: null, customsDeclarationNo: null, syncedAt: null, shipDate: '2026-11-15', statusCode: 'DRAFT', branchCode: 'A01' };
    serve((p) => {
      if (p.startsWith('/order/cut-ratio/styles')) return styles.promise;
      if (p.startsWith('/order/cut-ratio/pos/9/color-sizes')) return { po, lines: [{ id: 1, colorName: 'Đen', sizeName: 'M', qty: 100 }] };
      if (p.startsWith('/order/cut-ratio/pos')) return { items: [po], total: 1, page: 1, pageSize: 100 };
      return [];
    });
    renderPage(<CutRatioPage />, '/order/cut-ratio?so=5&po=9');
    await waitFor(() => {
      expect(paths().some((p) => p.startsWith('/order/cut-ratio/pos?') && p.includes('salesOrderId=5'))).toBe(true);
      expect(paths()).toContain('/order/cut-ratio/pos/9/color-sizes');
    });
    // Danh sách mã hàng chưa về: chưa hiện PO (mã hàng chưa chắc còn trong lưới)
    expect(within(screen.getByRole('table', { name: 'Danh sách PO' })).queryByText('4500009')).not.toBeInTheDocument();
    styles.resolve({ items: [style], total: 1, page: 1, pageSize: 100 });
    expect(await within(screen.getByRole('table', { name: 'Danh sách PO' })).findByText('4500009')).toBeInTheDocument();
    expect(await within(screen.getByRole('table', { name: 'Chi tiết màu cỡ' })).findByText('Đen')).toBeInTheDocument();
  });
});

describe('Phân quyền: bản nháp theo vai trò (M8)', () => {
  it('quyền của vai trò trên URL tải song song với danh sách vai trò; vừa tải xong không có ô nào bị tô "chưa lưu"', async () => {
    signIn(['admin.permission:view', 'admin.permission:update']);
    const roles = deferred<unknown>();
    serve((p) => {
      if (p === '/admin/roles') return roles.promise;
      if (p === '/admin/permissions') return { actions: ['view'], modules: [{ code: 'order', name: 'Đơn hàng', resources: [{ id: 1, code: 'order.po', name: 'Tỷ lệ cắt', scopeType: 'BRANCH', permissions: [{ id: 11, code: 'order.po:view', action: 'view' }] }] }] };
      if (p === '/admin/roles/3/permissions') return { permissionIds: [11] };
      return [];
    });
    renderPage(<PermissionsPage />, '/admin/permissions?role=3');
    await waitFor(() => expect(paths()).toContain('/admin/roles/3/permissions'));
    roles.resolve([{ id: 3, code: 'PLANNER', name: 'Kế hoạch', description: null, isActive: true, isSystem: false, permissionCount: 1, userCount: 0 }]);
    const box = await screen.findByRole('checkbox', { name: 'Kế hoạch – Đơn hàng – Tỷ lệ cắt: Xem' });
    expect(box).toBeChecked();
    expect(screen.queryByText(/Chưa lưu:/)).not.toBeInTheDocument();
    // Tích bỏ một ô: ô đó "chưa lưu"; tích lại: hết
    fireEvent.click(box);
    expect(await screen.findByRole('checkbox', { name: 'Kế hoạch – Đơn hàng – Tỷ lệ cắt: Xem (chưa lưu)' })).not.toBeChecked();
    expect(screen.getByText('Chưa lưu: +0 / −1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Tỷ lệ cắt: Xem/ }));
    expect(screen.queryByText(/Chưa lưu:/)).not.toBeInTheDocument();
  });
});
