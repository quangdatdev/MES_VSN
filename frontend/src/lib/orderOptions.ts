import { useQuery } from '@tanstack/react-query';
import { useCan } from '../shell/permissions';
import { useSession } from '../store/session';
import { api } from './api';
import { ORDER_OPTIONS_KEY } from './queryKeys';

/** Nhà máy SX (ô chọn chỉ cho nhà máy đang dùng; nhà máy đã ngừng để hiện tên ở đơn hàng cũ), gom theo đơn vị cơ sở */
export interface FactoryOption {
  code: string;
  name: string;
  isActive: boolean;
  branchCode: string | null;
}

// Mảng rỗng dùng chung khi chưa có dữ liệu: mảng mới mỗi lần vẽ làm cột lưới, danh sách chọn tính lại liên tục
const NO_STRINGS: string[] = [];
const NO_NAMES: Record<string, string> = {};
const NO_FACTORIES: FactoryOption[] = [];

/** Khách hàng để gợi ý trong ô lọc; người không xem được Thông tin đơn hàng vẫn gõ tay được. */
export function useCustomers() {
  const can = useCan('order.allocation:view');
  const branch = useSession((s) => s.branch?.code);
  const q = useQuery({
    queryKey: [...ORDER_OPTIONS_KEY, branch],
    queryFn: () =>
      api<{ customers: string[]; seasons: string[]; orderTypes: string[]; orderTypeNames: Record<string, string>; units: string[]; factories: FactoryOption[] }>('/order/sales-orders/options'),
    enabled: can,
    staleTime: 60_000,
  });
  const d = q.data;
  // Loại đơn hàng, đơn vị tính, nhà máy sản xuất theo Quản trị › Danh mục hệ thống (Loại kèm các giá trị đã có trong dữ liệu)
  return {
    customers: d?.customers ?? NO_STRINGS,
    seasons: d?.seasons ?? NO_STRINGS,
    orderTypes: d?.orderTypes ?? NO_STRINGS,
    orderTypeNames: d?.orderTypeNames ?? NO_NAMES,
    units: d?.units ?? NO_STRINGS,
    factories: d?.factories ?? NO_FACTORIES,
  };
}
