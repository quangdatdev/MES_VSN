import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScopeCatalog, ScopeLine, UserAccessInfo } from '../features/admin/types';
import { scopeLineGroups, UserAccessDrawer } from '../features/admin/UserAccessDrawer';
import { api } from '../lib/api';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

// Phạm vi chiều Chuyền theo mã bộ phận (phase 5.10, task 5.10.10): ô Chuyền lấy chuyền từ /admin/scope-catalog, gửi mã (value)

type Call = { path: string; method: string; body: unknown };
let calls: Call[] = [];

function serve(routes: (path: string) => unknown) {
  vi.mocked(api).mockImplementation((async (path: string, opts?: { method?: string; body?: unknown }) => {
    const method = opts?.method ?? 'GET';
    if (method !== 'GET') {
      calls.push({ path, method, body: opts?.body });
      return {};
    }
    return routes(path);
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

const line = (code: string, workshopCode: string | null, isActive = true, workshopName: string | null = workshopCode ? 'Xưởng may' : null): ScopeLine => ({
  code,
  name: `Chuyền ${code.slice(-2)}`,
  branchCode: code.slice(0, 3),
  isActive,
  workshopCode,
  workshopName,
});

describe('Ô chọn chuyền ở phạm vi người dùng', () => {
  // Thứ tự như API (ĐVCS, nhóm, thứ tự, mã; chuyền nằm thẳng dưới gốc sau cùng của ĐVCS); hai bộ phận cha trùng tên
  const lines = [
    line('A01-L03', 'A01-X01'),
    line('A01-L04', 'A01-X01', false),
    line('A01-L02', 'A01-X02'),
    line('A01-L01', null),
    line('A02-L01', null),
  ];

  it('gom theo ĐVCS và bộ phận cha (tên nhóm kèm mã); giữ thứ tự API; bỏ chuyền đã ngừng; giá trị là mã chuyền', () => {
    expect(scopeLineGroups(lines, new Set())).toEqual([
      { group: 'ĐVCS A01 – Xưởng may (A01-X01)', items: [{ value: 'A01-L03', label: 'Chuyền 03 (A01-L03)' }] },
      { group: 'ĐVCS A01 – Xưởng may (A01-X02)', items: [{ value: 'A01-L02', label: 'Chuyền 02 (A01-L02)' }] },
      { group: 'ĐVCS A01', items: [{ value: 'A01-L01', label: 'Chuyền 01 (A01-L01)' }] },
      { group: 'ĐVCS A02', items: [{ value: 'A02-L01', label: 'Chuyền 01 (A02-L01)' }] },
    ]);
  });

  it('đã chọn ĐVCS thì chỉ gợi ý chuyền của ĐVCS đó, nhưng chuyền đang chọn vẫn hiện để bỏ chọn được', () => {
    expect(scopeLineGroups(lines, new Set(['A02'])).map((g) => g.group)).toEqual(['ĐVCS A02']);
    expect(scopeLineGroups(lines, new Set(['A02']), ['A01-L03']).map((g) => g.group)).toEqual(['ĐVCS A01 – Xưởng may (A01-X01)', 'ĐVCS A02']);
  });
});

describe('Phân quyền chi tiết: phạm vi chuyền theo mã bộ phận', () => {
  const catalog: ScopeCatalog = {
    dimensions: [],
    orgUnits: [{ id: 1, code: 'A01', name: 'Nhà máy 1', orgType: 'FACTORY', parentId: null, branchCode: 'A01', path: '/A01/', isActive: true }],
    lines: [line('A01-L03', 'A01-X01'), line('A01-L05', 'A01-X01'), line('A01-L07', 'A01-X02', false)],
  };
  const scope = (id: number, value: string, valueName: string | null, valueActive: boolean) => ({
    id,
    dimension: 'LINE',
    mode: 'LIST',
    orgUnitId: null,
    orgUnitCode: null,
    orgUnitName: null,
    value,
    valueName,
    valueActive,
  });
  const access = (scopes: UserAccessInfo['assignments'][number]['scopes']): UserAccessInfo => ({
    user: { id: 2, username: 'tc.test', fullName: 'Trưởng chuyền thử' },
    assignments: [{ userRoleId: 9, roleId: 4, roleCode: 'LINE_LEADER', roleName: 'Trưởng chuyền', roleActive: true, validFromAt: null, validToAt: null, scopes }],
    overrides: [],
    fieldPolicies: [],
  });

  beforeEach(() => {
    calls = [];
    useSession.getState().set({
      status: 'ready',
      user: { id: 1, username: 'admin', fullName: 'Quản trị' },
      branch: { code: 'A01', name: 'Nhà máy 1', isAggregate: false },
      roles: [],
      permissions: new Set(['admin.permission:update']),
    });
  });

  async function openEditor(info: UserAccessInfo) {
    serve((path) => {
      if (path === '/admin/users/2/access') return info;
      if (path === '/admin/scope-catalog') return catalog;
      if (path === '/admin/branches' || path === '/admin/resource-fields') return [];
      throw new Error(`Chưa giả: ${path}`);
    });
    renderPage(<UserAccessDrawer userId={2} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa phạm vi' }));
    return screen.findByRole('button', { name: 'Lưu phạm vi' });
  }

  const sentScopes = () => (calls.find((c) => c.method === 'PUT')!.body as { scopes: object[] }).scopes;

  it('hiện tên chuyền; mã không còn là chuyền ghi rõ "không còn tác dụng", chỉ đọc, vẫn gửi lại khi lưu; chuyền mới gửi theo mã', async () => {
    const save = await openEditor(access([scope(11, 'A01-L03', 'Chuyền 03', true), scope(12, 'A01-L07', 'Chuyền 07', false)]));
    expect(screen.getByText('Chuyền: Chuyền 03 (A01-L03)')).toBeInTheDocument();
    expect(screen.getByText('Chuyền: Chuyền 07 (A01-L07) (không còn tác dụng)')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Không còn là chuyền đang dùng: Chuyền 07 (A01-L07)');

    fireEvent.click(screen.getByRole('combobox', { name: 'Chuyền' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Chuyền 05 (A01-L05)' }));
    fireEvent.click(save);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].path).toBe('/admin/users/2/roles/4/scope');
    expect(sentScopes()).toEqual([
      { dimension: 'LINE', mode: 'LIST', value: 'A01-L03' },
      { dimension: 'LINE', mode: 'LIST', value: 'A01-L05' },
      { dimension: 'LINE', mode: 'LIST', value: 'A01-L07' },
    ]);
  });

  it('bỏ mã không còn tác dụng chỉ được khi còn chuyền đang dùng (không thành không giới hạn)', async () => {
    const save = await openEditor(access([scope(11, 'A01-L03', 'Chuyền 03', true), scope(12, 'A01-L99', null, false)]));
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('Không còn là chuyền đang dùng: A01-L99.');
    const drop = within(note).getByRole('checkbox', { name: 'Bỏ các mã này khi lưu' });
    expect(drop).toBeEnabled();
    fireEvent.click(drop);
    fireEvent.click(save);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(sentScopes()).toEqual([{ dimension: 'LINE', mode: 'LIST', value: 'A01-L03' }]);
  });

  it('chỉ còn mã không còn tác dụng (kể cả "~mã" của phạm vi cũ theo cây tổ chức): không bỏ được, chưa có thay đổi thì không lưu', async () => {
    const save = await openEditor(access([scope(12, '~A01-X02', null, false)]));
    expect(screen.getByText('Chuyền: A01-X02, phạm vi cũ theo cây tổ chức (không còn tác dụng)')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Không còn là chuyền đang dùng: A01-X02, phạm vi cũ theo cây tổ chức.');
    expect(within(screen.getByRole('note')).getByRole('checkbox', { name: 'Bỏ các mã này khi lưu' })).toBeDisabled();
    expect(screen.getByText(/Chọn ít nhất một chuyền đang dùng trước/)).toBeInTheDocument();
    expect(save).toHaveAttribute('aria-disabled', 'true');
  });

  it('bỏ hết chuyền đang chọn: báo trước vai trò sẽ không còn giới hạn chuyền', async () => {
    await openEditor(access([scope(11, 'A01-L03', 'Chuyền 03', true)]));
    expect(screen.queryByText(/vai trò này sẽ không còn giới hạn chuyền/)).not.toBeInTheDocument();
    const field = screen.getByRole('combobox', { name: 'Chuyền' });
    fireEvent.keyDown(field, { key: 'Backspace' });
    expect(await screen.findByText(/vai trò này sẽ không còn giới hạn chuyền/)).toBeInTheDocument();
  });
});
