import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Branch } from './types';

/**
 * Nhà máy tài khoản được chọn (cả đơn vị tổng hợp A00 nếu được gán), lấy mới từ máy chủ: danh sách trong phiên chỉ có
 * lúc đăng nhập. `enabled`: chỉ tải khi cần (mở danh sách đổi nhà máy). Đây là nhà máy được gán, không phải nhà máy xem
 * được: phiên A00 xem mọi nhà máy, ô lọc theo nhà máy lấy giá trị từ dữ liệu (`/values?field=branchCode`).
 */
export function useBranchChoices(enabled = true) {
  return useQuery({ queryKey: ['me', 'branches'], queryFn: () => api<Branch[]>('/me/branches'), enabled, staleTime: 30_000 });
}
