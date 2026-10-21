import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserEmployeeDialog } from '../features/admin/UserEmployeeDialog';
import type { AdminUser } from '../features/admin/types';
import ClusterLeaderPage from '../features/sewing/ClusterLeaderPage';
import type { ClusterDetail, ClusterItem } from '../features/sewing/api';
import { afterSave, assignedOf, changes, discard, employeeLabel, isDirty, rowsOf } from '../features/sewing/clusterLeaderRules';
import { api } from '../lib/api';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

const item = (over: Partial<ClusterItem> = {}): ClusterItem => ({
  id: 1,
  code: 'CAP-BTP',
  name: 'Cấp BTP',
  sortOrder: 10,
  leaderEmployeeId: null,
  leaderCode: null,
  leaderName: null,
  leaderDepartment: null,
  leaderActive: null,
  ...over,
});

const LAN = { leaderEmployeeId: 7, leaderCode: 'NV2101', leaderName: 'Lê Thị Lan', leaderDepartment: 'Chuyền 01', leaderActive: true };

describe('Phân cụm trưởng: luật', () => {
  it('nhãn người theo ảnh mẫu "Tên - Mã - Phòng ban", thiếu phần nào bỏ phần đó', () => {
    expect(employeeLabel({ fullName: 'Lê Thị Lan', code: 'NV2101', departmentName: 'Chuyền 01' })).toBe('Lê Thị Lan - NV2101 - Chuyền 01');
    expect(employeeLabel({ fullName: null, code: 'NV2101', departmentName: null })).toBe('NV2101');
  });

  it('dòng từ máy chủ; chọn dở giữ khi cụm trưởng đã lưu không đổi, bỏ khi người khác vừa đổi; thân lệnh chỉ cụm đã đổi', () => {
    const rows = rowsOf([item(), item({ id: 2, code: 'TUI', name: 'Cụm túi', ...LAN })]);
    expect(rows[1]).toMatchObject({ saved: 7, value: 7, pick: { id: 7, fullName: 'Lê Thị Lan', code: 'NV2101', departmentName: 'Chuyền 01', active: true } });
    expect(assignedOf(rows)).toBe(1);
    const picked = rows.map((r) => (r.id === 1 ? { ...r, value: 9, pick: { id: 9, code: 'NV2102', fullName: 'Trần Văn Minh', departmentName: null, active: true } } : r));
    expect(changes(picked)).toEqual([{ id: 1, leaderEmployeeId: 9, previous: null }]);
    expect(assignedOf(picked)).toBe(2);
    // Tải lại: cụm 1 chưa ai đổi thì giữ người đang chọn; cụm 2 bỏ cụm trưởng (null) được gửi là previous 7
    const cleared = picked.map((r) => (r.id === 2 ? { ...r, value: null, pick: null } : r));
    const keep = new Map(cleared.filter(isDirty).map((r) => [r.id, r]));
    const again = rowsOf([item(), item({ id: 2, code: 'TUI', name: 'Cụm túi', ...LAN })], keep);
    expect(changes(again)).toEqual([
      { id: 1, leaderEmployeeId: 9, previous: null },
      { id: 2, leaderEmployeeId: null, previous: 7 },
    ]);
    // Người khác vừa phân cụm 1 (lỗi 409): ô lấy người mới, bỏ phần chọn dở
    const conflict = rowsOf([item({ ...LAN, leaderEmployeeId: 5, leaderName: 'Người khác' }), item({ id: 2, code: 'TUI', name: 'Cụm túi', ...LAN })], keep);
    expect(conflict[0]).toMatchObject({ saved: 5, value: 5, pick: { fullName: 'Người khác' } });
    expect(isDirty(conflict[0])).toBe(false);
  });

  it('cột bị Che: không sửa, không đếm; Lưu xong chỉ các dòng đã gửi thành đã lưu; Bỏ thay đổi về người đã lưu', () => {
    const masked = rowsOf([item({ leaderEmployeeId: '***' })]);
    expect(masked[0].masked).toBe(true);
    expect(assignedOf(masked)).toBeNull();
    const rows = rowsOf([item(), item({ id: 2, ...LAN })]);
    const edited = rows.map((r) => ({ ...r, value: 9, pick: { id: 9, code: 'NV9', fullName: 'Chín', departmentName: null, active: true } }));
    const sent = edited.filter((r) => r.id === 1);
    const saved = afterSave(edited, sent);
    expect(isDirty(saved[0])).toBe(false);
    expect(isDirty(saved[1])).toBe(true);
    expect(discard(saved)[1]).toMatchObject({ value: 7, pick: { fullName: 'Lê Thị Lan' } });
  });
});

function signIn(permissions: string[], fieldPolicies: Record<string, Record<string, 'HIDDEN' | 'MASKED' | 'READONLY' | 'EDITABLE'>> = {}) {
  useSession.getState().reset('anonymous');
  useSession.getState().set({
    status: 'ready',
    user: { id: 9, username: 'truongchuyen.a', fullName: 'Nguyễn Văn Tâm' },
    branch: { code: 'A01', name: 'Nhà máy 1', isAggregate: false },
    roles: [],
    permissions: new Set(permissions),
    fieldPolicies,
  });
}

function serve(routes: (path: string, opts?: { method?: string; body?: unknown }) => unknown) {
  vi.mocked(api).mockImplementation((async (path: string, opts?: { method?: string; body?: unknown }) => routes(path ?? '', opts)) as unknown as typeof api);
}

function renderPage(ui: ReactNode, path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider theme={theme} env="test">
      <ModalsProvider>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>,
  );
}

const STYLE = 'AGFL-2906';
const detailOf = (over: Partial<ClusterDetail> = {}): ClusterDetail => ({
  team: { id: 3, branchCode: 'A01', lineCode: 'A01-L03', lineName: 'Chuyền 03' },
  teamLeaders: [{ id: 131, code: 'NV2001', fullName: 'Nguyễn Văn Tâm' }],
  styleCode: STYLE,
  styleLabel: 'Trung bình/S27',
  canEdit: true,
  readOnlyReason: null,
  canSearch: true,
  items: [item(), item({ id: 2, code: 'TUI', name: 'CỤM TÚI NGỰC', sortOrder: 20, ...LAN })],
  ...over,
});

const routes = (detail: ClusterDetail, sent: unknown[] = []) => (path: string, opts?: { method?: string; body?: unknown }) => {
  if (path === '/sewing/cluster/teams') return { linked: true, leader: true, items: [{ id: 3, branchCode: 'A01', lineCode: 'A01-L03', lineName: 'Chuyền 03', canEdit: detail.canEdit }] };
  if (path.startsWith('/sewing/cluster/styles')) return { items: [{ styleCode: STYLE, styleLabel: 'Trung bình/S27', clusters: 2, assigned: 1 }, { styleCode: 'AGJK-2739', styleLabel: null, clusters: 8, assigned: 0 }] };
  if (path.startsWith('/sewing/cluster/employees')) return { canSearch: true, items: [{ id: 9, code: 'NV2102', fullName: 'Trần Văn Minh', departmentName: 'Chuyền 03' }] };
  if (path.startsWith('/sewing/cluster?')) return detail;
  if (path === '/sewing/cluster' && opts?.method === 'PUT') {
    sent.push(opts.body);
    return { saved: 1 };
  }
  return [];
};

describe('Phân cụm trưởng: màn hình', () => {
  beforeEach(() => vi.mocked(api).mockReset());

  it('tổ trưởng một tổ: tổ chọn sẵn; bảng theo ảnh; chọn cụm trưởng rồi Lưu gửi đúng cụm, người, người lúc mở màn', async () => {
    signIn(['sewing.cluster:view', 'sewing.cluster:update']);
    const sent: unknown[] = [];
    serve(routes(detailOf(), sent));
    renderPage(<ClusterLeaderPage />, `/sewing/cluster?style=${STYLE}`);
    expect(await screen.findByText('Cấp BTP')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Chọn tổ' })).toHaveValue('Chuyền 03');
    expect(screen.getByRole('combobox', { name: 'Chọn mã hàng' })).toHaveValue(`${STYLE} - Trung bình/S27`);
    expect(screen.getByText('Nguyễn Văn Tâm (NV2001)')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['STT', 'Tên cụm', 'Tên cụm trưởng']);
    expect(screen.getByRole('combobox', { name: 'Tên cụm trưởng của cụm CỤM TÚI NGỰC' })).toHaveValue('Lê Thị Lan - NV2101 - Chuyền 01');
    expect(screen.getByText('Đã phân 1/2 cụm')).toBeInTheDocument();
    const saveButton = screen.getByRole('button', { name: 'Lưu' });
    expect(saveButton).toHaveAttribute('data-disabled');

    fireEvent.click(screen.getByRole('combobox', { name: 'Tên cụm trưởng của cụm Cấp BTP' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Trần Văn Minh - NV2102 - Chuyền 03' }));
    expect(screen.getByText('Đã phân 2/2 cụm')).toBeInTheDocument();
    expect(saveButton).not.toHaveAttribute('data-disabled');
    fireEvent.click(saveButton);
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ teamId: 3, style: STYLE, items: [{ id: 1, leaderEmployeeId: 9, previous: null }] });
  });

  it('không phải tổ trưởng: chỉ xem, nêu lý do của máy chủ; Lưu khóa kèm lý do', async () => {
    signIn(['sewing.cluster:view', 'sewing.cluster:update']);
    serve(routes(detailOf({ canEdit: false, readOnlyReason: 'Chỉ tổ trưởng của tổ này mới phân cụm trưởng được.' })));
    renderPage(<ClusterLeaderPage />, `/sewing/cluster?line=A01-L03&style=${STYLE}`);
    expect(await screen.findByText('Cấp BTP')).toBeInTheDocument();
    expect(screen.getAllByText('Chỉ tổ trưởng của tổ này mới phân cụm trưởng được.').length).toBeGreaterThan(0);
    expect(screen.queryByRole('combobox', { name: 'Tên cụm trưởng của cụm Cấp BTP' })).toBeNull();
    expect(screen.getByText('Chưa phân')).toBeInTheDocument();
    expect(screen.getByText('Lê Thị Lan - NV2101 - Chuyền 01')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu' })).toHaveAttribute('data-disabled');
  });

  it('cột Tên cụm trưởng bị Ẩn: bảng không có cột, đầu màn báo cột ẩn', async () => {
    signIn(['sewing.cluster:view', 'sewing.cluster:update'], { 'sewing.cluster': { leaderEmployeeId: 'HIDDEN' } });
    serve(routes(detailOf({ items: [{ id: 1, code: 'CAP-BTP', name: 'Cấp BTP', sortOrder: 10 }] })));
    renderPage(<ClusterLeaderPage />, `/sewing/cluster?style=${STYLE}`);
    expect(await screen.findByText('Cấp BTP')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['STT', 'Tên cụm']);
    expect(screen.getByText('1 cột ẩn')).toBeInTheDocument();
  });

  it('chưa chọn mã hàng khi tổ có nhiều mã: hướng dẫn chọn, chưa tải bảng', async () => {
    signIn(['sewing.cluster:view']);
    serve(routes(detailOf()));
    renderPage(<ClusterLeaderPage />, '/sewing/cluster');
    expect(await screen.findByText('Chọn mã hàng để phân cụm trưởng.')).toBeInTheDocument();
    expect(vi.mocked(api).mock.calls.some((c) => String(c[0]).startsWith('/sewing/cluster?'))).toBe(false);
  });
});

describe('Quản trị › Người dùng: gắn nhân viên cho tài khoản', () => {
  beforeEach(() => vi.mocked(api).mockReset());

  const user: AdminUser = { id: 21, username: 'totruong.a', fullName: 'Trần Thị Ngọc Lan', email: null, isActive: true, isLocked: false, lastLoginAt: null, roleIds: [], branchIds: [], defaultBranchId: null, employeeId: null, employee: null };

  it('tìm trên máy chủ, chọn người rồi Lưu thay đổi gửi đúng Id; chưa đổi gì thì khóa nút', async () => {
    signIn(['admin.user:view', 'admin.permission:update']);
    const sent: unknown[] = [];
    serve((path, opts) => {
      if (path.startsWith('/admin/users/employee-options')) return { canSearch: true, items: [{ id: 133, code: 'NV2003', fullName: 'Trần Thị Ngọc Lan', departmentCode: 'A01-L01', departmentName: 'Chuyền 01', isActive: true }] };
      if (opts?.method === 'PUT') {
        sent.push({ path, body: opts.body });
        return { ok: true };
      }
      return [];
    });
    const done = vi.fn(async () => undefined);
    renderPage(<UserEmployeeDialog user={user} onClose={() => undefined} onDone={done} />, '/admin/users');
    const save = await screen.findByRole('button', { name: 'Lưu thay đổi' });
    expect(save).toHaveAttribute('data-disabled');
    fireEvent.click(screen.getByRole('combobox', { name: 'Nhân viên' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Trần Thị Ngọc Lan - NV2003 - Chuyền 01' }));
    expect(save).not.toHaveAttribute('data-disabled');
    fireEvent.click(save);
    await waitFor(() => expect(sent).toEqual([{ path: '/admin/users/21/employee', body: { employeeId: 133 } }]));
    await waitFor(() => expect(done).toHaveBeenCalled());
  });

  it('không có quyền tra Danh bạ nhân viên: nói rõ lý do', async () => {
    signIn(['admin.user:view', 'admin.permission:update']);
    serve((path) => (path.startsWith('/admin/users/employee-options') ? { canSearch: false, items: [] } : []));
    renderPage(<UserEmployeeDialog user={user} onClose={() => undefined} onDone={async () => undefined} />, '/admin/users');
    expect(await screen.findByText(/chưa được xem Danh bạ nhân viên/)).toBeInTheDocument();
  });
});
