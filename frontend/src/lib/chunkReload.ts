const RELOAD_AT_KEY = 'mes.chunkReloadAt';
/** Vừa tải lại trong khoảng này mà vẫn thiếu file thì không tải lại nữa, để lỗi hiện ra thay vì tải lại mãi */
const RELOAD_GUARD_MS = 10_000;
/**
 * Lỗi tải file code (Chrome, Edge, Firefox, Safari) hoặc CSS đi kèm (Vite); lỗi khác (bug khi chạy code của màn) thì
 * tải lại trang cũng không khỏi
 */
const CHUNK_LOAD_ERROR = /dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

export const isChunkLoadError = (error: unknown) => error instanceof Error && CHUNK_LOAD_ERROR.test(error.message);

/** Máy chủ đang trả lời: tải lại mới ra trang mới. Đang dừng (triển khai có migration) thì tải lại chỉ ra trang lỗi của trình duyệt */
async function serverUp(win: Window) {
  try {
    const res = await win.fetch('/api/v1/health', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Lỗi tải code của một màn (tab mở từ trước khi triển khai bản mới, file code cũ đã bị thay): tải lại trang một lần để
 * nhận bản mới. Mất mạng thì chờ có mạng rồi gọi lại `retry`. Dùng ở React.lazy, không nghe `vite:preloadError` cả trang:
 * tải trước màn lúc rê chuột (preloadPage) lỗi thì không được tải lại trang ngang khi người dùng đang nhập liệu.
 * Tải lại thì trả promise không bao giờ xong (màn chờ tới lúc trang tải lại); không tải lại thì ném lỗi cho ErrorBoundary.
 */
export async function recoverFromChunkError<T>(error: unknown, retry: () => Promise<T>, win: Window = window): Promise<T> {
  if (!isChunkLoadError(error)) throw error;
  if (win.navigator.onLine === false) {
    return new Promise<T>((resolve, reject) => win.addEventListener('online', () => void retry().then(resolve, reject), { once: true }));
  }
  if (!(await serverUp(win))) throw error;
  const now = Date.now();
  let recent: boolean;
  try {
    recent = now - (Number(win.sessionStorage.getItem(RELOAD_AT_KEY)) || 0) < RELOAD_GUARD_MS;
    if (!recent) win.sessionStorage.setItem(RELOAD_AT_KEY, String(now));
  } catch {
    // Không đọc, ghi được mốc thì không chặn được tải lại vòng: để lỗi hiện ra
    throw error;
  }
  if (recent) throw error;
  win.location.reload();
  return new Promise<T>(() => {});
}

/** Loader của React.lazy có tự phục hồi khi thiếu file code (xem recoverFromChunkError) */
export function withChunkRecovery<T>(load: () => Promise<T>, win: Window = window): () => Promise<T> {
  const attempt = (): Promise<T> => load().catch((e: unknown) => recoverFromChunkError(e, attempt, win));
  return attempt;
}
