import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../lib/api';
import { useLeaveGuard } from '../lib/leaveGuard';
import { queryClient } from '../lib/queryClient';
import type { Branch, MenuNode } from '../lib/types';
import { AppLayout } from '../shell/AppLayout';
import { BranchSwitcher } from '../shell/BranchSwitcher';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

const A00: Branch = { code: 'A00', name: 'Toàn công ty', isAggregate: true };
const A01: Branch = { code: 'A01', name: 'Nhà máy 1', isAggregate: false };
const A02: Branch = { code: 'A02', name: 'Nhà máy 2', isAggregate: false };
const leaf = (code: string, path: string): MenuNode => ({ code, name: code, icon: null, path, isMobile: false, children: [] });
const menuOf = (paths: string[]): MenuNode[] => [{ code: 'menu.order', name: 'Đơn hàng', icon: null, path: null, isMobile: false, children: paths.map((p) => leaf(p, p)) }];

/** Máy chủ giả: chọn nhà máy nào thì /me trả nhà máy đó, menu theo nhà máy. `fail`: lệnh nào trả lỗi */
function serve(menus: Record<string, string[]>, fail: { select?: boolean; me?: boolean } = {}) {
  let current = A01;
  vi.mocked(api).mockImplementation((async (path: string, opts?: { body?: { branchCode?: string } }) => {
    if (path === '/me/branches') return [A00, A01, A02];
    if (path === '/auth/select-branch') {
      if (fail.select) throw new ApiError(403, 'BRANCH_NOT_ALLOWED', 'Bạn không được làm việc ở nhà máy này.');
      current = [A00, A01, A02].find((b) => b.code === opts?.body?.branchCode)!;
      return { accessToken: 'token-moi', expiresIn: 900, branch: current };
    }
    if (path === '/me' && fail.me) throw new TypeError('Failed to fetch');
    if (path === '/me') return { user: { id: 1, username: 'u', fullName: 'Người dùng' }, branch: current, roles: [], permissionVersion: 1 };
    if (path === '/me/menu') return menuOf(menus[current.code] ?? []);
    if (path === '/me/permissions') return { permissions: [], version: 1, stamp: 's' };
    if (path === '/me/field-policies') return { resources: {} };
    return [];
  }) as unknown as typeof api);
}

function Where() {
  const { pathname } = useLocation();
  return <p data-testid="where">{pathname}</p>;
}

/** Màn có phần đang nhập (đếm số lần bấm) và còn thay đổi chưa lưu khi `dirty` */
function Screen({ dirty = false }: { dirty?: boolean }) {
  const [n, setN] = useState(0);
  const { search } = useLocation();
  useLeaveGuard(dirty);
  return (
    <div>
      <button type="button" onClick={() => setN((x) => x + 1)}>
        Đã bấm {n}
      </button>
      <p data-testid="search">{search}</p>
    </div>
  );
}

function renderAt(path: string) {
  return render(
    <MantineProvider theme={theme} env="test">
      <ModalsProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[path]}>
            <BranchSwitcher />
            <Routes>
              <Route path="*" element={<Where />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>,
  );
}

describe('Đổi nhà máy trên thanh trên cùng', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    queryClient.clear();
    useSession.getState().reset('anonymous');
    useSession.getState().set({ status: 'ready', accessToken: 't', user: { id: 1, username: 'u', fullName: 'Người dùng' }, branch: A01, permissions: new Set(), menu: menuOf(['/order/prep']), permissionStamp: 's' });
  });

  it('bấm vào nhà máy trên thanh trên cùng mở danh sách để chọn ngay tại chỗ, không sang trang chọn nhà máy; nhà máy đang chọn có đánh dấu', async () => {
    serve({ A01: ['/order/prep'] });
    renderAt('/order/prep');
    const button = screen.getByRole('combobox', { name: 'Chi nhánh SX A01 Nhà máy 1, đổi nhà máy' });
    fireEvent.click(button);
    // Tên đọc lấy từ chữ đang hiện; nhà máy đang làm việc báo bằng aria-selected
    expect(await screen.findByRole('option', { name: /Nhà máy 1\s*A01/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /Toàn công ty\s*A00, xem tổng hợp, chỉ đọc/ })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('option', { name: /Nhà máy 2\s*A02/ })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/order/prep');
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('chọn nhà máy khác: đổi phiên, ở lại màn đang mở nếu nhà máy mới có màn đó, không có thì về Trang chủ', async () => {
    serve({ A02: ['/order/prep'], A00: ['/order/info'] });
    renderAt('/order/prep');
    fireEvent.click(screen.getByRole('combobox', { name: /đổi nhà máy/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Nhà máy 2/ }));
    await waitFor(() => expect(useSession.getState().branch?.code).toBe('A02'));
    expect(screen.getByTestId('where')).toHaveTextContent('/order/prep');
    expect(vi.mocked(api).mock.calls.find((c) => c[0] === '/auth/select-branch')?.[1]).toMatchObject({ method: 'POST', body: { branchCode: 'A02' } });

    fireEvent.click(screen.getByRole('combobox', { name: /đổi nhà máy/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Toàn công ty/ }));
    await waitFor(() => expect(useSession.getState().branch?.code).toBe('A00'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
  });

  it('chọn lại đúng nhà máy đang làm việc thì không gọi máy chủ', async () => {
    serve({ A01: ['/order/prep'] });
    renderAt('/order/prep');
    fireEvent.click(screen.getByRole('combobox', { name: /đổi nhà máy/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Nhà máy 1/ }));
    expect(vi.mocked(api).mock.calls.some((c) => c[0] === '/auth/select-branch')).toBe(false);
  });

  it('còn thay đổi chưa lưu: hỏi lại; Tiếp tục sửa thì không đổi nhà máy, Bỏ thay đổi thì mới đổi', async () => {
    serve({ A02: ['/order/prep'] });
    render(
      <MantineProvider theme={theme} env="test">
        <ModalsProvider>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/order/prep']}>
              <BranchSwitcher />
              <Screen dirty />
            </MemoryRouter>
          </QueryClientProvider>
        </ModalsProvider>
      </MantineProvider>,
    );
    const pick = async () => {
      fireEvent.click(screen.getByRole('combobox', { name: /đổi nhà máy/ }));
      fireEvent.click(await screen.findByRole('option', { name: /Nhà máy 2/ }));
    };
    await pick();
    fireEvent.click(await screen.findByRole('button', { name: 'Tiếp tục sửa' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tiếp tục sửa' })).not.toBeInTheDocument());
    expect(vi.mocked(api).mock.calls.some((c) => c[0] === '/auth/select-branch')).toBe(false);
    expect(useSession.getState().branch?.code).toBe('A01');

    await pick();
    fireEvent.click(await screen.findByRole('button', { name: 'Bỏ thay đổi' }));
    await waitFor(() => expect(useSession.getState().branch?.code).toBe('A02'));
  });

  it('máy chủ không cho đổi: giữ nguyên phiên; đổi được mà chưa nạp được quyền: kết thúc phiên kèm lý do, không để phiên lệch máy chủ', async () => {
    serve({ A02: ['/order/prep'] }, { select: true });
    renderAt('/order/prep');
    fireEvent.click(screen.getByRole('combobox', { name: /đổi nhà máy/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Nhà máy 2/ }));
    await waitFor(() => expect(vi.mocked(api).mock.calls.some((c) => c[0] === '/auth/select-branch')).toBe(true));
    await waitFor(() => expect(screen.getByRole('combobox', { name: /đổi nhà máy/ })).not.toHaveAttribute('aria-busy'));
    expect(useSession.getState()).toMatchObject({ status: 'ready', branch: A01, accessToken: 't' });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    serve({ A02: ['/order/prep'] }, { me: true });
    fireEvent.click(screen.getByRole('combobox', { name: /đổi nhà máy/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Nhà máy 2/ }));
    await waitFor(() => expect(useSession.getState().status).toBe('anonymous'));
    expect(useSession.getState().notice).toContain('Đã chuyển sang Nhà máy 2 nhưng chưa tải được menu và quyền');
    vi.restoreAllMocks();
  });

  it('tự đổi nhà máy: màn mở lại từ đầu, bỏ bộ lọc trên URL của nhà máy cũ; tab khác đổi nhà máy: màn giữ phần đang nhập', async () => {
    serve({ A01: ['/order/prep'], A02: ['/order/prep'] });
    useSession.getState().set({ menu: menuOf(['/order/prep']) });
    render(
      <MantineProvider theme={theme} env="test">
        <ModalsProvider>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/order/prep?line=A01-L03']}>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route path="/order/prep" element={<Screen />} />
                  <Route path="*" element={<Where />} />
                </Route>
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        </ModalsProvider>
      </MantineProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Đã bấm 0' }));
    expect(screen.getByRole('button', { name: 'Đã bấm 1' })).toBeInTheDocument();

    // Tab khác đổi nhà máy (làm mới phiên trả nhà máy khác): không dựng lại màn
    act(() => useSession.getState().set({ branch: A02 }));
    expect(screen.getByRole('button', { name: 'Đã bấm 1' })).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('?line=A01-L03');

    // Tự đổi ở thanh trên cùng: màn mở lại từ đầu, URL không còn bộ lọc cũ
    fireEvent.click(screen.getByRole('combobox', { name: /đổi nhà máy/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Nhà máy 1/ }));
    expect(await screen.findByRole('button', { name: 'Đã bấm 0' })).toBeInTheDocument();
    expect(useSession.getState().branch?.code).toBe('A01');
    expect(screen.getByTestId('search')).toBeEmptyDOMElement();
  });
});
