import { ActionIcon, Alert, Button, Group, Skeleton, Stack, Text, Tooltip, VisuallyHidden, type ActionIconProps, type MantineSpacing } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { ChangeEvent, KeyboardEvent, ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import type { AccessLevel } from './types';

/** Lỗi máy chủ có thông điệp riêng; không có phản hồi thì nói rõ là chưa kết nối được. */
export const loadErrorText = (e: unknown, what: string) => (e instanceof ApiError ? e.message : `Không tải được ${what}. Kiểm tra kết nối rồi thử lại.`);

/** Báo lỗi tải đặt phía trên bảng, kèm nút Thử lại: bảng trống mà không có lời nào thì người dùng tưởng chưa có dữ liệu. */
export function LoadError({ error, what, onRetry, retrying, mb = 'sm' }: { error: unknown; what: string; onRetry: () => void; retrying?: boolean; mb?: MantineSpacing }) {
  return (
    <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} py={8} mb={mb}>
      <Group justify="space-between" gap="sm" wrap="wrap">
        <Text size="sm">{loadErrorText(error, what)}</Text>
        <Button size="xs" variant="default" loading={retrying} onClick={onRetry}>
          Thử lại
        </Button>
      </Group>
    </Alert>
  );
}

/** Dòng giả khi đang tải lần đầu: không hiện "0 dòng" hay "chưa có" như thể đã tải xong. */
export function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={`loading-${i}`} aria-hidden={i > 0 || undefined}>
          {Array.from({ length: cols }, (_, j) => (
            <td key={j}>
              {i === 0 && j === 0 && <VisuallyHidden role="status">Đang tải…</VisuallyHidden>}
              <Skeleton h={14} my={2} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Dòng báo bảng rỗng; `action` cho lối ra (xóa tìm kiếm, thêm mục đầu tiên). */
export function EmptyRow({ colSpan, children, action }: { colSpan: number; children: ReactNode; action?: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ whiteSpace: 'normal' }}>
        <Stack align="center" gap={6} py="md">
          <Text c="dimmed" size="sm" ta="center">{children}</Text>
          {action}
        </Stack>
      </td>
    </tr>
  );
}

/**
 * Dải lọc ngay dưới tiêu đề, cùng kiểu với dải lọc của màn nghiệp vụ. Màn quản trị không dùng WorkPage: dòng nhắc
 * "xem tổng hợp, chỉ đọc" của WorkPage không đúng với dữ liệu quản trị (vẫn sửa được khi đang ở đơn vị tổng hợp).
 */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="work-filters" style={{ marginBottom: 'var(--mantine-spacing-sm)' }}>
      <Group gap="sm" align="flex-end" wrap="wrap">
        {children}
      </Group>
    </div>
  );
}

type IconActionProps = Omit<ActionIconProps, 'children'> & {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Có lý do thì nút trông như bị khóa, bấm không làm gì, tooltip nói vì sao (nút disabled không hiện được tooltip). */
  blockedReason?: string | null;
};

/** Nút chỉ có icon: luôn có tooltip nêu tên việc; bị khóa thì nêu thêm lý do. */
export function IconAction({ label, icon, onClick, blockedReason, color = 'gray', ...rest }: IconActionProps) {
  return (
    <Tooltip
      label={blockedReason ? <><b>{label}</b><br />{blockedReason}</> : label}
      multiline={!!blockedReason}
      maw={300}
      events={{ hover: true, focus: true, touch: !!blockedReason }}
    >
      <ActionIcon
        variant="subtle"
        color={color}
        aria-label={label}
        {...rest}
        data-disabled={blockedReason ? true : undefined}
        aria-disabled={blockedReason ? true : undefined}
        onClick={(e) => {
          // Nút trong dòng bảng bấm được: không để cú bấm lan ra dòng (mở ngăn kéo chi tiết)
          e.stopPropagation();
          if (!blockedReason) onClick();
        }}
      >
        {icon}
      </ActionIcon>
    </Tooltip>
  );
}


/**
 * Esc đóng popup, ngăn kéo qua `close` (thường là confirmDiscard). Thay cho closeOnEscape của Mantine: cách đó nghe phím
 * trên cả cửa sổ, nên Esc bấm trong hộp xác nhận mở chồng lên cũng tới popup bên dưới và hộp hỏi lại bật lên ngay sau
 * khi vừa đóng. Sự kiện React chỉ nổi lên trong cây của popup này; hộp xác nhận nằm ở cây khác.
 */
export const escapeToClose = (close: () => void) => ({
  closeOnEscape: false,
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape' || !(e.target instanceof HTMLElement)) return;
    // Ô chọn đang mở danh sách, hoặc Esc bấm trong dropdown (ô chọn giờ của DateTimePicker): Esc chỉ đóng phần đó
    if (e.target.dataset.mantineStopPropagation === 'true' || e.target.closest('.mantine-Popover-dropdown')) return;
    close();
  },
});


/** Ô mã tự viết hoa khi gõ (mã vai trò, nhà máy, danh mục đều viết hoa). */
export const upper = (set: (v: string) => void) => (e: ChangeEvent<HTMLInputElement>) => set(e.currentTarget.value.toUpperCase());

/** Email đúng dạng; để trống được (ô không bắt buộc). */
export const emailError = (v: string) => (!v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : 'Email chưa đúng dạng, ví dụ ten@congty.vn');

/** Màu của một mức chính sách cột (Badge, chữ trong ô) */
export function levelColor(l: AccessLevel | ''): string {
  return l === 'EDITABLE' ? 'teal' : l === 'READONLY' ? 'link' : l === 'MASKED' ? 'orange' : l === 'HIDDEN' ? 'red' : 'gray';
}
