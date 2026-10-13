import { describe, expect, it, vi } from 'vitest';
import { isChunkLoadError, withChunkRecovery } from '../lib/chunkReload';

// Tab mở từ trước khi triển khai bản mới mở một màn chưa tải: file code cũ đã bị thay thì tải lại trang một lần.
const missing = () => new TypeError('Failed to fetch dynamically imported module: http://may-chu/assets/AuditPage-old.js');

function fakeWindow(opts: { onLine?: boolean; storage?: Storage; serverUp?: boolean } = {}) {
  const store = new Map<string, string>();
  const storage =
    opts.storage ??
    ({
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as unknown as Storage);
  const reload = vi.fn();
  const fetch = vi.fn(async () => {
    if (opts.serverUp === false) throw new TypeError('Failed to fetch');
    return new Response('{"status":"ok"}', { status: 200 });
  });
  const listeners = new Map<string, () => void>();
  const navigator = { onLine: opts.onLine ?? true };
  const win = {
    navigator,
    sessionStorage: storage,
    location: { reload },
    fetch,
    addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
  } as unknown as Window;
  const goOnline = () => {
    navigator.onLine = true;
    listeners.get('online')?.();
  };
  return { win, reload, fetch, goOnline };
}

/** Chờ các promise đang dở chạy tiếp (fetch giả, then) */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('Tải lại trang khi thiếu code của màn', () => {
  it('nhận đúng lỗi tải file code của các trình duyệt, không nhận lỗi khác', () => {
    expect(isChunkLoadError(missing())).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: x.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/x.css'))).toBe(true);
    expect(isChunkLoadError(new ReferenceError('x is not defined'))).toBe(false);
    expect(isChunkLoadError('chuỗi')).toBe(false);
  });

  it('lần đầu: máy chủ trả lời thì tải lại trang và chờ, không ném lỗi', async () => {
    const { win, reload, fetch } = fakeWindow();
    let settled = false;
    void withChunkRecovery(() => Promise.reject(missing()), win)().finally(() => (settled = true));
    await settle();
    expect(fetch).toHaveBeenCalledWith('/api/v1/health', expect.objectContaining({ cache: 'no-store' }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
  });

  it('vừa tải lại mà vẫn thiếu thì ném lỗi, không tải lại vòng; quá 10 giây thì tải lại được', async () => {
    const { win, reload } = fakeWindow();
    const load = withChunkRecovery(() => Promise.reject(missing()), win);
    void load();
    await settle();
    await expect(load()).rejects.toThrow('dynamically imported module');
    expect(reload).toHaveBeenCalledTimes(1);
    const later = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11_000);
    try {
      void load();
      await settle();
      expect(reload).toHaveBeenCalledTimes(2);
    } finally {
      later.mockRestore();
    }
  });

  it('lỗi không phải thiếu file code thì ném lỗi gốc, không tải lại', async () => {
    const { win, reload } = fakeWindow();
    await expect(withChunkRecovery(() => Promise.reject(new ReferenceError('bug')), win)()).rejects.toThrow('bug');
    expect(reload).not.toHaveBeenCalled();
  });

  it('máy chủ không trả lời (đang dừng để migrate) thì ném lỗi, không tải lại', async () => {
    const { win, reload } = fakeWindow({ serverUp: false });
    await expect(withChunkRecovery(() => Promise.reject(missing()), win)()).rejects.toThrow('dynamically imported module');
    expect(reload).not.toHaveBeenCalled();
  });

  it('mất mạng thì chờ có mạng rồi tải lại code của màn', async () => {
    const { win, reload, goOnline } = fakeWindow({ onLine: false });
    const page = { default: 'màn' };
    let calls = 0;
    const load = withChunkRecovery(() => (++calls === 1 ? Promise.reject(missing()) : Promise.resolve(page)), win);
    const result = load();
    await settle();
    expect(calls).toBe(1);
    goOnline();
    await expect(result).resolves.toBe(page);
    expect(calls).toBe(2);
    expect(reload).not.toHaveBeenCalled();
  });

  it('không dùng được sessionStorage thì ném lỗi gốc, không tải lại', async () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    } as unknown as Storage;
    const { win, reload } = fakeWindow({ storage: broken });
    await expect(withChunkRecovery(() => Promise.reject(missing()), win)()).rejects.toThrow('dynamically imported module');
    expect(reload).not.toHaveBeenCalled();
  });
});
