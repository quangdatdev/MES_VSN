// Kiểu dữ liệu trả về từ /api/v1/cutting/progress (phase 5.14) và /api/v1/cutting/supply (phase 5.15), quyết định 13 ở
// docs/update_docs/13-quyet-dinh.md.
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

// ---------- Xác nhận cấp BTP (phase 5.15) ----------

/** Chưa cấp (chưa xác nhận); Cấp 1 phần, Cấp toàn phần tính lúc bấm Xác nhận cấp */
export type SupplyStatus = 'PENDING' | 'PARTIAL' | 'FULL';

/** Một lệnh cấp: một ĐVCS, một Ngày cấp, một mã hàng */
export interface Supply {
  id: number;
  supplyNo?: Masked<string>;
  supplyDate?: Masked<string>;
  styleCode?: Masked<string>;
  branchCode?: Masked<string>;
  branchName?: Masked<string>;
  creatorName?: Masked<string>;
  confirmerName?: Masked<string> | null;
  confirmedAt?: string | null;
  note?: Masked<string> | null;
  statusCode?: Masked<SupplyStatus>;
  /** Tổng số cấp của lệnh */
  dayQty?: Masked<number>;
  createdAt: string;
}

/** Một dòng chi tiết: chuyền, mã hàng, màu, cỡ theo Ngày cấp */
export interface SupplyRowData {
  lineCode?: Masked<string>;
  lineName?: string;
  styleCode?: Masked<string>;
  productName: string | null;
  colorName: string;
  sizeName: string;
  /** Có trong Phân bổ màu cỡ của chuyền (false: phân bổ đã bỏ mà còn số cấp, chỉ giảm được) */
  inPlan: boolean;
  planQty?: Masked<number>;
  syncQty?: Masked<number>;
  /** Đã cấp ở các ngày khác Ngày cấp */
  suppliedQty?: Masked<number>;
  /** Số của Ngày cấp; null là chưa cấp */
  dayQty?: Masked<number> | null;
  remainQty?: Masked<number>;
  /** Đã cấp (mọi ngày) cho chuyền khác cùng mã hàng, màu, cỡ */
  otherLinesQty?: Masked<number>;
  /** Lưới nhập: lệnh của mã hàng ở Ngày cấp đã xác nhận, dòng chỉ xem */
  locked?: boolean;
}

export interface SupplyDetail extends Supply {
  today: string;
  rows: SupplyRowData[];
  canEdit: boolean;
  canDelete: boolean;
  canConfirm: boolean;
  canUnconfirm: boolean;
}

/** Lệnh đã có của một mã hàng ở Ngày cấp đang nhập */
export interface SupplyOfDay {
  id: number;
  supplyNo: string;
  styleCode: string;
  statusCode: SupplyStatus;
  /** Lệnh đã xác nhận cấp */
  locked: boolean;
  note: string | null;
}

/** Lưới nhập tính theo Ngày cấp (POST /cutting/supply/sheet) */
export interface SupplySheet {
  date: string;
  today: string;
  rows: SupplyRowData[];
  supplies: SupplyOfDay[];
}

/** Kết quả lưu: các lệnh vừa tạo, sửa, tự bỏ (hết số) kèm lưới tính lại */
export interface SupplySaveResult extends SupplySheet {
  saved: { id: number; supplyNo: string; styleCode: string; created: boolean; removed: boolean }[];
}

/** Khóa của một dòng gửi lên máy chủ */
export interface SupplyKey {
  line: string;
  style: string;
  colorName: string;
  sizeName: string;
}
