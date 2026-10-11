import { Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import type { ReactNode } from 'react';

interface ConfirmOptions {
  title: string;
  /** Điều sẽ xảy ra sau khi bấm: người dùng cần biết hậu quả trước khi quyết. */
  consequence: ReactNode;
  /** Tên hành động trên nút, ví dụ "Xóa đơn hàng", không dùng "Đồng ý" chung chung. */
  confirmLabel: string;
  /** Mặc định "Giữ lại": trong hộp hỏi xóa, chữ "Hủy" dễ đọc thành "hủy dữ liệu". */
  cancelLabel?: string;
  /** Thao tác phá hoặc bỏ dữ liệu: nút màu đỏ. */
  danger?: boolean;
  onConfirm: () => void;
}

/**
 * Mantine bắt phím Esc trên cả cửa sổ: Esc bấm để đóng hộp xác nhận cũng tới popup hoặc ngăn kéo bên dưới, và popup đó
 * lại gọi confirmDiscard (hộp hỏi bật lên ngay sau khi vừa đóng). Vì vậy đếm hộp đang mở, và đánh dấu đúng lần bấm Esc
 * xảy ra khi còn hộp mở: listener này đăng ký từ lúc nạp module nên chạy trước listener của mọi popup.
 */
let openCount = 0;
let escapeInConfirm = false;
if (typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || openCount === 0) return;
      escapeInConfirm = true;
      setTimeout(() => {
        escapeInConfirm = false;
      }, 0);
    },
    { capture: true },
  );
}

const confirmBusy = () => openCount > 0 || escapeInConfirm;

/** Hộp xác nhận dùng chung: nút giữ lại bên trái, nút hành động bên phải mang đúng tên việc sẽ làm. */
export function confirmAction({ title, consequence, confirmLabel, cancelLabel = 'Giữ lại', danger = true, onConfirm }: ConfirmOptions) {
  openCount += 1;
  let counted = true;
  const release = () => {
    if (!counted) return;
    counted = false;
    openCount = Math.max(0, openCount - 1);
  };
  modals.openConfirmModal({
    title,
    children: typeof consequence === 'string' ? <Text size="sm">{consequence}</Text> : consequence,
    labels: { confirm: confirmLabel, cancel: cancelLabel },
    confirmProps: danger ? { color: 'red' } : undefined,
    // Mantine gọi onConfirm trước khi đóng hộp: thôi đếm trước, để việc làm tiếp (đóng popup, rời màn) không bị chặn
    onConfirm: () => {
      release();
      onConfirm();
    },
    onClose: release,
  });
}

/**
 * Đóng popup, ngăn kéo hoặc bỏ phần đang sửa: còn thay đổi chưa lưu thì hỏi lại, chưa đổi gì thì làm ngay.
 * Dùng cho nút Hủy, dấu x, Esc và các thao tác làm mất phần đang nhập (đổi dòng, chọn lại).
 */
export function confirmDiscard(dirty: boolean, discard: () => void, consequence = 'Những gì bạn vừa nhập sẽ mất.') {
  if (confirmBusy()) return;
  if (!dirty) {
    discard();
    return;
  }
  confirmAction({ title: 'Bỏ các thay đổi chưa lưu?', consequence, confirmLabel: 'Bỏ thay đổi', cancelLabel: 'Tiếp tục sửa', onConfirm: discard });
}
