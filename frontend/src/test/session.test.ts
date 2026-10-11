import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, duringBranchSwitch } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { logout } from '../store/auth';
import { useSession } from '../store/session';

// Phiên phía client (docs/review/phase-1-4.md): đăng xuất, nhà máy bị gỡ, đổi nhà máy ở tab khác, refresh dùng chung.
type Reply = { status: number; body?: unknown; headers?: Record<string, string> };
const json = (r: Reply) =>
  new Response(r.body === undefined ? null : JSON.stringify(r.body), {
    status: r.status,
    headers: { 'Content-Type': 'application/json', ...(r.headers ?? {}) },
  });

let calls: { url: string; method: string; auth: string | null }[] = [];
function mockFetch(route: (url: string, method: string, auth: string | null) => Reply) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const auth = headers.Authorization ?? null;
      calls.push({ url, method, auth });
      return json(route(url, method, auth));
    }),
  );
}

function ready(branchCode = 'A01') {
  useSession.getState().reset('ready');
  useSession.getState().set({ accessToken: 'old', branch: { code: branchCode, name: `Nhà máy ${branchCode}`, isAggregate: false } });
  queryClient.setQueryData(['demo-po', branchCode], { items: [1, 2, 3] });
}

beforeEach(async () => {
  // refreshSession giữ lời gọi đang chạy tới hết tick hiện tại; chờ để test sau không dùng lại kết quả của test trước.
  await new Promise((r) => setTimeout(r, 0));
  ready();
});
afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe('Đăng xuất', () => {
  it('gọi /auth/logout không cần access token, xóa store và cache', async () => {
    mockFetch(() => ({ status: 204 }));
    await logout();
    const call = calls.find((c) => c.url.endsWith('/auth/logout'))!;
    expect(call.method).toBe('POST');
    expect(call.auth).toBeNull();
    expect(useSession.getState().status).toBe('anonymous');
    expect(useSession.getState().accessToken).toBeNull();
    expect(queryClient.getQueryData(['demo-po', 'A01'])).toBeUndefined();
  });

  it('mất kết nối khi đăng xuất: vẫn xóa phiên phía client và báo người dùng', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await logout();
    expect(useSession.getState().status).toBe('anonymous');
    expect(useSession.getState().notice).toMatch(/đóng trình duyệt/);
  });
});

describe('Nhà máy của phiên bị gỡ hoặc tắt', () => {
  it('403 BRANCH_NOT_ALLOWED => kết thúc phiên, xóa cache, có lý do ở màn đăng nhập', async () => {
    mockFetch((url) =>
      url.endsWith('/order/sales-orders') ? { status: 403, body: { error: { code: 'BRANCH_NOT_ALLOWED', message: 'x' } } } : { status: 204 },
    );
    await expect(api('/order/sales-orders')).rejects.toBeInstanceOf(ApiError);
    expect(useSession.getState().status).toBe('anonymous');
    expect(useSession.getState().notice).toMatch(/không còn được cấp/);
    expect(queryClient.getQueryData(['demo-po', 'A01'])).toBeUndefined();
  });
});

describe('Làm mới token', () => {
  it('nhiều request cùng hết hạn chỉ gọi refresh một lần, rồi gửi lại bằng token mới', async () => {
    mockFetch((url, _m, auth) => {
      if (url.endsWith('/auth/refresh')) return { status: 200, body: { accessToken: 'new', branch: { code: 'A01', name: 'Nhà máy A01', isAggregate: false } } };
      return auth === 'Bearer new' ? { status: 200, body: { ok: true } } : { status: 401, body: { error: { code: 'TOKEN_EXPIRED' } } };
    });
    const results = await Promise.all([api('/a'), api('/b'), api('/c')]);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('tab khác đã đổi nhà máy: không gửi lại thao tác ghi, báo BRANCH_CHANGED', async () => {
    mockFetch((url, _m, auth) => {
      if (url.endsWith('/auth/refresh')) return { status: 200, body: { accessToken: 'new', branch: { code: 'A02', name: 'Nhà máy A02', isAggregate: false } } };
      if (url.endsWith('/me') || url.includes('/me/')) return { status: 200, body: {} };
      return auth === 'Bearer new' ? { status: 201, body: {} } : { status: 401, body: { error: { code: 'TOKEN_EXPIRED' } } };
    });
    const err = await api('/order/sales-orders', { method: 'POST', body: { qty: 1 } }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('BRANCH_CHANGED');
    const posts = calls.filter((c) => c.url.endsWith('/order/sales-orders') && c.method === 'POST');
    expect(posts).toHaveLength(1); // chỉ lần gửi đầu (bị 401), không gửi lại sang A02
    expect(useSession.getState().branch?.code).toBe('A02');
    expect(queryClient.getQueryData(['demo-po', 'A01'])).toBeUndefined();
  });

  it('chính tab này đang đổi nhà máy: request của màn cũ bị 401 thì không làm mới phiên, không đăng xuất, báo BRANCH_SWITCHED', async () => {
    mockFetch((url) => (url.endsWith('/auth/refresh') ? { status: 200, body: { accessToken: 'new', branch: { code: 'A02', name: 'Nhà máy A02', isAggregate: false } } } : { status: 401, body: { error: { code: 'SESSION_REVOKED' } } }));
    let done!: () => void;
    const switching = duringBranchSwitch(() => new Promise<void>((r) => (done = r)));
    const pending = api('/order/sales-orders').catch((e) => e);
    await new Promise((r) => setTimeout(r, 0));
    done();
    await switching;
    const err = await pending;
    expect((err as ApiError).code).toBe('BRANCH_SWITCHED');
    expect(calls.some((c) => c.url.endsWith('/auth/refresh') || c.url.endsWith('/auth/logout'))).toBe(false);
    expect(useSession.getState()).toMatchObject({ status: 'ready', branch: { code: 'A01' } });
  });

  it('refresh thất bại => kết thúc phiên', async () => {
    mockFetch((url) => (url.endsWith('/auth/refresh') ? { status: 401 } : url.endsWith('/auth/logout') ? { status: 204 } : { status: 401, body: { error: { code: 'TOKEN_EXPIRED' } } }));
    await expect(api('/order/sales-orders')).rejects.toBeInstanceOf(ApiError);
    expect(useSession.getState().status).toBe('anonymous');
    expect(useSession.getState().notice).toMatch(/kết thúc/);
  });
});
