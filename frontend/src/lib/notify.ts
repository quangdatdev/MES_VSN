import { notifications } from '@mantine/notifications';
import { ApiError } from './api';

export const toastOk = (message: string, title = 'Đã lưu') => notifications.show({ color: 'teal', title, message });

/**
 * Cảnh báo không phải lỗi máy chủ (thao tác bị chặn ngay trên giao diện), ví dụ xóa dòng đang may. `sticky`: không tự
 * đóng, dùng khi phần người dùng vừa nhập đã mất mà họ không bấm gì (phải đọc được).
 */
export const toastWarn = (message: string, title: string, sticky = false) =>
  notifications.show({ color: 'orange', title, message, autoClose: sticky ? false : 8000 });

/** Lỗi phân quyền kèm cách xử lý: người dùng biết phải nhờ ai, không chỉ biết là "bị từ chối". */
const HINT: Record<string, string> = {
  FIELD_READONLY: 'Nếu cần sửa, nhờ quản trị viên mở cột này ở Chính sách cột.',
  SCOPE_DENIED: 'Nếu cần làm việc với dữ liệu này, nhờ quản trị viên mở rộng phạm vi của bạn.',
};

/** Thông báo lỗi giữ lâu hơn thông báo thành công: thường có cách xử lý cần đọc hết. */
export function toastError(e: unknown, title = 'Chưa thực hiện được') {
  const message = e instanceof ApiError ? [e.message, HINT[e.code]].filter(Boolean).join(' ') : 'Không kết nối được máy chủ. Thử lại sau.';
  notifications.show({ color: 'red', title, message, autoClose: 10000 });
}
