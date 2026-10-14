// Kiểu dữ liệu trả về từ /api/v1/cutting/progress (phase 5.14, quyết định 13 ở docs/update_docs/13-quyet-dinh.md).
// Trường có thể vắng mặt (cột Ẩn) hoặc là "***" (cột Che) tùy chính sách cột của người xem.

import type { Masked } from '../../lib/fieldPolicy';

export type CuttingStatus = 'NOT_STARTED' | 'CUTTING' | 'DONE' | 'SOURCE_DELETED';

/** Một dòng của màn: một kế hoạch xuất hàng của ĐVCS */
export interface CuttingPlan {
  id: number;
  planNo?: Masked<string>;
  customerName?: Masked<string>;
  styleCode?: Masked<string>;
  productName?: Masked<string>;
  poBuyDate?: Masked<string>;
  branchCode?: Masked<string>;
  shipDate?: Masked<string> | null;
  planQty?: Masked<number>;
  cutQty?: Masked<number>;
  /** Lũy kế − Kế hoạch: âm là còn thiếu, dương là cắt dư */
  diffQty?: Masked<number>;
  lastCutDate?: Masked<string> | null;
  statusCode?: Masked<CuttingStatus>;
  /** Kế hoạch xuất hàng nguồn đã bị xóa mà còn số cắt: chỉ xem, chỉ còn Xóa số cắt */
  sourceDeleted: boolean;
  createdAt?: Masked<string>;
}

/** Một màu cỡ trong popup theo Ngày nhập liệu */
export interface CuttingCell {
  colorName: string;
  sizeName: string;
  /** false: màu cỡ đã bị bỏ khỏi kế hoạch mà còn số cắt (Kế hoạch 0, chỉ xem) */
  inPlan: boolean;
  planQty?: Masked<number>;
  /** Số của ngày đang xem; null là chưa nhập */
  dayQty?: Masked<number> | null;
  /** Lũy kế mọi ngày */
  cutQty?: Masked<number>;
  diffQty?: Masked<number>;
}

export interface CuttingDetail extends Omit<CuttingPlan, 'lastCutDate'> {
  branchName?: Masked<string>;
  /** Ngày nhập liệu đang xem (YYYY-MM-DD) */
  date: string;
  /** Hôm nay theo giờ Việt Nam: không chọn được ngày sau */
  today: string;
  /** Số ngày đã có số cắt (hộp xác nhận Xóa số cắt) */
  entryDays: number;
  canEdit: boolean;
  canDelete: boolean;
  items: CuttingCell[];
}
