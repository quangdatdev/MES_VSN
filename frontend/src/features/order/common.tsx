import { List } from '@mantine/core';
import { useCallback } from 'react';
import { useBranchName } from '../../components/BranchName';
import type { StatusMap } from '../../components/StatusBadge';
import { useSession } from '../../store/session';

export const SALES_STATUS: StatusMap = {
  NEW: { label: 'Mới', color: 'gray' },
  PLANNING: { label: 'Đã lập kế hoạch', color: 'link' },
  IN_PRODUCTION: { label: 'Đang sản xuất', color: 'orange' },
  DONE: { label: 'Hoàn thành', color: 'teal' },
  CANCELLED: { label: 'Đã hủy', color: 'red' },
};
export const PLAN_STATUS: StatusMap = {
  PLANNED: { label: 'Chưa xếp chuyền', color: 'gray' },
  SCHEDULED: { label: 'Đã xếp chuyền', color: 'link' },
  IN_PRODUCTION: { label: 'Đang sản xuất', color: 'orange' },
  DONE: { label: 'Hoàn thành', color: 'teal' },
};
export const PO_STATUS: StatusMap = {
  DRAFT: { label: 'Chưa xác nhận', color: 'gray' },
  PARTIAL: { label: 'Xác nhận một phần', color: 'orange' },
  CONFIRMED: { label: 'Đã xác nhận', color: 'teal' },
};
export const LINE_STATUS: StatusMap = {
  PLANNED: { label: 'Chưa phân màu cỡ', color: 'gray' },
  ALLOCATED: { label: 'Đã phân màu cỡ', color: 'link' },
  IN_PRODUCTION: { label: 'Đang may', color: 'orange' },
  DONE: { label: 'Đã xong', color: 'teal' },
};
/** Phân màu cỡ của cả kế hoạch (màn Phân bổ màu cỡ): tổng giao mọi chuyền so với SL kế hoạch */
export const ALLOC_STATUS: StatusMap = {
  PLANNED: { label: 'Chưa phân màu cỡ', color: 'gray' },
  PARTIAL: { label: 'Phân một phần', color: 'orange' },
  FULL: { label: 'Đã phân đủ', color: 'teal' },
};

/** Các dòng có vấn đề trong thông báo: tối đa 5 dòng, phần còn lại gộp thành "và N dòng khác". */
export function IssueList({ items, max = 5 }: { items: string[]; max?: number }) {
  return (
    <List size="sm" spacing={2} mt={4}>
      {items.slice(0, max).map((t, i) => (
        <List.Item key={i}>{t}</List.Item>
      ))}
      {items.length > max && <List.Item>và {items.length - max} dòng khác</List.Item>}
    </List>
  );
}

/**
 * Đơn hàng, PO dùng chung toàn công ty nhưng chỉ ghi được ở ĐVCS nguồn (Chi nhánh FOB, quyết định 7.2): lý do khóa nút ghi khi
 * dòng thuộc ĐVCS khác, null khi ghi được. Chỉ để phản chiếu, máy chủ vẫn chặn (404).
 */
export function useOriginLock(what: string) {
  const current = useSession((s) => s.branch?.code);
  const branchName = useBranchName();
  return useCallback(
    (code: string | null | undefined) => (code && current && code !== current ? `${what} của ${branchName(code)}: chỉ sửa, xóa khi đang làm việc ở đơn vị cơ sở đó.` : null),
    [current, branchName, what],
  );
}
