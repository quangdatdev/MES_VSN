import { useEffect, useId } from 'react';
import { confirmDiscard } from './confirm';

/**
 * Chặn rời màn khi còn thay đổi chưa lưu (ma trận quyền, chính sách cột, popup đang nhập...).
 * Ứng dụng dùng BrowserRouter nên không có useBlocker: các lối rời màn của khung (menu, tab, đổi nhà máy, tìm màn hình,
 * đăng xuất) gọi `guardedLeave`; tải lại hoặc đóng tab thì trình duyệt tự hỏi qua `beforeunload`.
 * Nút Back của trình duyệt chưa chặn được.
 */
const dirtySources = new Set<string>();

function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  // Trình duyệt cũ chỉ hỏi khi có returnValue
  e.returnValue = '';
}

export function useLeaveGuard(dirty: boolean) {
  const id = useId();
  useEffect(() => {
    if (!dirty) return;
    dirtySources.add(id);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      dirtySources.delete(id);
      if (dirtySources.size === 0) window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty, id]);
}

/**
 * Rời màn hiện tại: còn thay đổi chưa lưu thì hỏi lại trước. Không tự xóa cờ: màn bị gỡ thì cleanup của useLeaveGuard
 * gỡ cờ; màn không bị gỡ (điều hướng tới chính nó) thì phần đang sửa vẫn còn và cờ phải còn.
 */
export function guardedLeave(leave: () => void) {
  confirmDiscard(dirtySources.size > 0, leave);
}
