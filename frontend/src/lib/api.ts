import { useSession } from '../store/session';
import { queryClient } from './queryClient';

const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
  }
}

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Ghi đè token (dùng token tạm khi chọn nhà máy) */
  token?: string | null;
  /** Không tự refresh khi 401 (dùng cho chính lệnh refresh/login) */
  noRefresh?: boolean;
}

export interface RefreshResult {
  ok: boolean;
  /** Cookie refresh dùng chung giữa các tab: tab khác đã đổi nhà máy thì phiên này cũng sang nhà máy đó. */
  branchChanged: boolean;
}

let refreshing: Promise<RefreshResult> | null = null;
let branchSwitch: Promise<unknown> | null = null;

/**
 * Tab này đang đổi nhà máy: máy chủ thu hồi phiên cũ ngay lúc nhận lệnh đổi. Request của màn cũ bị 401 trong lúc đó thì
 * không làm mới phiên (sẽ báo nhầm "từ một tab khác", hoặc làm mới bằng cookie cũ rồi bị đăng xuất): chờ đổi xong rồi báo
 * thao tác chưa được gửi.
 */
export function duringBranchSwitch<T>(work: () => Promise<T>): Promise<T> {
  const run = work();
  branchSwitch = run;
  const clear = () => {
    if (branchSwitch === run) branchSwitch = null;
  };
  run.then(clear, clear);
  return run;
}
let versionHandler: ((stamp: string) => void) | null = null;
let branchChangedHandler: (() => void) | null = null;

/** Gắn hàm được gọi khi server báo phiên bản phân quyền đã đổi (header X-Permission-Version, dạng chuỗi). */
export function onPermissionVersionChange(fn: (stamp: string) => void) {
  versionHandler = fn;
}

/** Gắn hàm được gọi khi refresh trả về nhà máy khác nhà máy đang hiển thị. */
export function onBranchChanged(fn: () => void) {
  branchChangedHandler = fn;
}

async function send(path: string, opts: Options, token: string | null) {
  return fetch(BASE + path, {
    method: opts.method ?? 'GET',
    credentials: 'include',
    headers: {
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

/** Kết thúc phiên phía client: xóa cache, xóa store, thu hồi cookie refresh nếu còn. */
export function endSession(notice: string | null) {
  queryClient.clear();
  useSession.getState().reset('anonymous', notice);
  void fetch(`${BASE}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => undefined);
}

/** Xin access token mới bằng cookie refresh. Dùng chung một lời gọi khi nhiều request cùng hết hạn. */
export function refreshSession(): Promise<RefreshResult> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return { ok: false, branchChanged: false };
      const data = await res.json();
      const current = useSession.getState().branch;
      const branchChanged = !!current && current.code !== data.branch.code;
      if (branchChanged) queryClient.clear();
      useSession.getState().set({ accessToken: data.accessToken, branch: data.branch });
      if (branchChanged) branchChangedHandler?.();
      return { ok: true, branchChanged };
    } catch {
      return { ok: false, branchChanged: false };
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

/**
 * Gửi kèm token hiện tại, dùng chung cho api() và download(): 401 thì làm mới phiên một lần (phiên đã sang nhà máy
 * khác thì không gửi lại), làm mới hỏng thì kết thúc phiên, nhà máy bị thu hồi thì kết thúc phiên, báo đổi phiên bản quyền.
 */
async function sendAuthed(path: string, opts: Options): Promise<Response> {
  const session = useSession.getState();
  const token = opts.token !== undefined ? opts.token : session.accessToken;
  let res = await send(path, opts, token);

  if (res.status === 401 && branchSwitch && opts.token === undefined && path !== '/auth/select-branch') {
    await branchSwitch.catch(() => undefined);
    throw new ApiError(409, 'BRANCH_SWITCHED', 'Bạn vừa đổi nhà máy nên thao tác này chưa được gửi. Kiểm tra lại rồi làm lại.');
  }

  if (res.status === 401 && !opts.noRefresh && opts.token === undefined && session.status === 'ready') {
    const r = await refreshSession();
    if (r.ok && r.branchChanged) {
      // Không gửi lại: yêu cầu này được tạo khi màn hình còn ở nhà máy cũ, gửi lại sẽ ghi nhầm nhà máy.
      const name = useSession.getState().branch?.name ?? 'nhà máy khác';
      throw new ApiError(409, 'BRANCH_CHANGED', `Phiên đã chuyển sang ${name} từ một tab khác. Thao tác chưa được gửi, hãy kiểm tra lại rồi làm lại.`);
    }
    if (r.ok) res = await send(path, opts, useSession.getState().accessToken);
    if (res.status === 401) {
      endSession('Phiên đăng nhập đã kết thúc. Hãy đăng nhập lại.');
    }
  }

  if (res.status === 403 && session.status === 'ready' && path !== '/auth/select-branch') {
    const body = await res.clone().json().catch(() => null);
    if (body?.error?.code === 'BRANCH_NOT_ALLOWED') {
      endSession('Nhà máy bạn đang làm việc không còn được cấp hoặc đã tạm tắt. Hãy đăng nhập lại và chọn nhà máy khác.');
    }
  }

  const version = res.headers.get('X-Permission-Version');
  if (version && versionHandler) versionHandler(version);
  return res;
}

export async function api<T = void>(path: string, opts: Options = {}): Promise<T> {
  const res = await sendAuthed(path, opts);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? 'ERROR', e?.message ?? 'Có lỗi xảy ra. Vui lòng thử lại.', e?.details);
  }
  return data as T;
}

/** Tải file do server sinh (CSV xuất theo chính sách cột), cùng cách xử lý phiên như api(). */
export async function download(path: string, fallbackName: string): Promise<void> {
  const res = await sendAuthed(path, {});
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? 'Không tải được file. Thử lại sau.');
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
