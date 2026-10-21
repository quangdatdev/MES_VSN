// Kiểu dữ liệu trả về từ /api/v1/order/* (xem docs/ARCHITECTURE.md mục 5.1, docs/update_docs/06-don-hang.md mục 6).
// Trường có thể vắng mặt (cột Ẩn) hoặc là "***" (cột Che) tùy chính sách cột của người xem.

import type { Masked } from '../../lib/fieldPolicy';
import type { Paged } from '../../lib/types';
import type { WorkCalendarJson } from '../../lib/workCalendar';

export type { Masked };

export interface SalesOrder {
  id: number;
  orderNo: string;
  customerName: string;
  styleCode: string;
  season: string | null;
  orderType: string | null;
  productName: string;
  staffName: string | null;
  qty: number;
  unitName: string;
  unitPrice?: Masked<number | null>;
  amount?: Masked<number | null>;
  cmPrice?: Masked<number | null>;
  syncedAt: string | null;
  shipDate: string;
  statusCode: string;
  branchCode: string;
  /** Mã nhà máy SX (danh mục Nhà máy SX), theo OSM có thể là nhiều mã cách nhau dấu phẩy; null: chưa có */
  productionFactoryCode?: Masked<string | null>;
  /** Nhà máy SX lấy theo OSM: không chọn tay được */
  factoryFromOsm?: boolean;
  /** Đơn của ĐVCS khác mà ĐVCS đang làm việc có kế hoạch xuất hàng của đơn: sửa riêng được Giá CM (quyết định 14.3) */
  cmPriceEditable?: boolean;
}

/**
 * Một dòng phân bổ PO theo nhà máy, lấy từ OSM (màn Phân bổ PO). Dòng trùng nguyên dòng của OSM chỉ có một. `id` không đổi khi dòng
 * OSM không đổi (đổi ETD, nhà máy theo OSM thì là dòng mới); `rowNo` là số thứ tự trong danh sách đang xem. Mọi cột đều theo chính
 * sách cột: vắng mặt khi bị Ẩn, "***" khi bị Che.
 */
export interface PoAllocation {
  id: number;
  rowNo: number;
  brand?: Masked<string | null>;
  season?: Masked<string | null>;
  po?: Masked<string | null>;
  so?: Masked<string | null>;
  shipMode?: Masked<string | null>;
  styleName?: Masked<string | null>;
  styleNo?: Masked<string | null>;
  color?: Masked<string | null>;
  etdActual?: Masked<string | null>;
  etdRevised?: Masked<string | null>;
  /** Tên nhà máy SX theo OSM (cũng là mã trong danh mục Nhà máy SX) */
  factoryName?: Masked<string | null>;
  /**
   * Đơn vị cơ sở quản lý nhà máy SX theo danh mục Nhà máy SX; null: nhà máy chưa gắn ĐVCS hoặc chưa có trong danh mục. Theo cả
   * chính sách của cột Nhà máy SX (Nhà máy SX bị Ẩn thì không có, bị Che thì bị che)
   */
  branchCode?: Masked<string | null>;
  /** Nhà máy SX do người dùng nhập tay (đồng bộ OSM lại vẫn giữ). Theo cả chính sách của cột Nhà máy SX, như `branchCode` */
  isFactoryManual?: Masked<boolean>;
  /** Nhà máy SX theo OSM ở lần đồng bộ gần nhất (khác `factoryName` khi nhập tay). Theo cả chính sách của cột Nhà máy SX */
  osmFactoryName?: Masked<string | null>;
  /** false: OSM không còn dòng nào cùng SO, PO, Style No, Màu; dòng được giữ vì đang nhập tay. Theo cả chính sách của Nhà máy SX */
  isInOsm?: Masked<boolean>;
}

/**
 * Lần làm mới gần nhất không làm đủ: EMPTY bảng chép OSM rỗng (bỏ qua cả lần), SHRINK số dòng giảm quá `maxShrinkPercent` (vẫn thêm,
 * sửa nhưng giữ `keptAbsent` dòng không còn trong OSM). Màn cảnh báo để người xem báo quản trị kiểm OSM.
 */
export interface PoAllocationRefreshNotice {
  at: string;
  reason: 'EMPTY' | 'SHRINK';
  sourceRows: number;
  previousRows: number;
  keptAbsent: number;
  maxShrinkPercent: number;
}

export interface PoAllocationPage extends Paged<PoAllocation> {
  /** Lần chép OSM của dữ liệu đang có; null: chưa đồng bộ lần nào */
  syncedAt: string | null;
  /** Nguồn đồng bộ đang bật; false: máy chủ chưa khai database OSM của nguồn này */
  sourceActive: boolean;
  /** Lần làm mới gần nhất bị bỏ qua hoặc giữ dòng vắng; null: bình thường */
  lastRefresh: PoAllocationRefreshNotice | null;
}

/** Gợi ý của màn Phân bổ PO: Brand, Season ở dải lọc; nhà máy SX đang dùng (popup Đổi nhà máy SX, gom theo ĐVCS) */
export interface PoAllocationOptions {
  brands: string[];
  seasons: string[];
  factories: { code: string; name: string; branchCode: string | null }[];
}

/**
 * Kết quả của PUT /order/po-allocations/factory: số dòng, số nhóm SO/PO/Style No/Màu bị áp (mọi dòng cùng khóa với dòng đã chọn);
 * `removed`: dòng không còn trong OSM đã bỏ khi chọn "Theo OSM"; `removable`: số dòng như vậy sẽ bị bỏ nếu chọn "Theo OSM" (xem
 * trước); `dryRun`: chỉ xem trước, chưa ghi
 */
export interface PoAllocationFactoryResult {
  rows: number;
  keys: number;
  removed: number;
  removable: number;
  dryRun: boolean;
}

export interface ShipmentPlan {
  id: number;
  planNo: string;
  salesOrderId: number;
  customerName: string;
  styleCode: string;
  productName: string;
  poBuyDate: string;
  branchCode: string;
  syncedAt: string | null;
  shipDate: string;
  plannerName: string;
  planQty: number;
  cutQty: number;
  sewnQty: number;
  endlineQty: number;
  finishedQty: number;
  statusCode: string;
}

export interface PlanLine {
  colorName: string;
  sizeName: string;
  originalQty: number;
  plannedQty: number;
  remainingQty: number;
  planQty?: number;
}

/** Dòng màu cỡ của GET /shipment-plans/:id: số theo chính sách cột của cột nguồn (Ẩn thì không có khóa, Che thì "***") */
export interface PlanDetailLine {
  colorName: string;
  sizeName: string;
  originalQty?: Masked<number>;
  plannedQty?: Masked<number>;
  remainingQty?: Masked<number>;
  planQty?: Masked<number>;
}

export interface ShipmentPlanDetail extends ShipmentPlan {
  poIds: number[];
  lines: PlanDetailLine[];
}

export interface Candidate {
  salesOrderId: number;
  orderNo: string;
  customerName: string;
  styleCode: string;
  productName: string;
  branchCode: string;
  productionFactoryCode?: string | null;
  orderQty: number;
  plannedQty: number;
  remainingQty: number;
  syncedAt: string | null;
  shipDate: string;
}

export interface CandidatePo {
  id: number;
  poCode: string;
  poNumber: string;
  qty: number;
  destination: string | null;
  syncedAt: string | null;
  shipDate: string;
  statusCode: string;
}

/**
 * Một PO của kế hoạch xuất hàng (khung "PO của kế hoạch", task 5.9.14), theo chính sách cột của Cập nhật tỷ lệ cắt. Số lượng
 * là của cả PO. Ngày xác nhận theo cột Trạng thái; SL đã xác nhận, chưa xác nhận theo mức chặt hơn của Số lượng và Trạng thái
 */
export interface PlanPo {
  id: number;
  poCode?: Masked<string>;
  poNumber?: Masked<string>;
  destination?: Masked<string> | null;
  shipDate?: Masked<string>;
  qty?: Masked<number>;
  statusCode?: Masked<'DRAFT' | 'CONFIRMED'>;
  confirmedAt?: Masked<string> | null;
  confirmedQty?: Masked<number>;
  unconfirmedQty?: Masked<number>;
}

export interface PlanPoList {
  items: PlanPo[];
  /** PO của kế hoạch nằm ngoài phạm vi người dùng được xem ở Cập nhật tỷ lệ cắt */
  hiddenCount: number;
}

export interface CutStyle {
  salesOrderId: number;
  customerName: string;
  styleCode: string;
  branchCode: string;
  poCount: number;
  confirmedCount: number;
  qty: number;
  shipDate: string;
  statusCode: 'CONFIRMED' | 'PARTIAL' | 'DRAFT';
}

export interface Po {
  id: number;
  salesOrderId: number;
  poCode: string;
  poNumber: string;
  customerName: string;
  styleCode: string;
  qty: number;
  destination: string | null;
  packingListCode: string | null;
  customsDeclarationNo: string | null;
  syncedAt: string | null;
  shipDate: string;
  statusCode: 'DRAFT' | 'CONFIRMED';
  branchCode: string;
  /** Có trong lưới PO của màn Tỷ lệ cắt: PO đã nằm trong kế hoạch xuất hàng nào đó (không xóa được) */
  inPlan?: boolean;
}

export interface PoColorSize {
  id: number;
  colorName: string;
  sizeName: string;
  qty: number;
}

export interface LinePlan {
  id: number;
  planNo: string;
  customerName: string;
  styleCode: string;
  orderType: string | null;
  branchCode: string;
  poBuyDate: string;
  planQty: number;
  scheduledQty: number;
  remainingQty: number;
  cmPrice?: Masked<number | null>;
  revenue?: Masked<number | null>;
  syncedAt: string | null;
  startDate: string | null;
  endDate: string | null;
  shipDate: string;
  statusCode: string;
  lineCount: number;
}

export interface ScheduleLine {
  id?: number;
  lineCode: string;
  lineName?: string;
  qty: number;
  avgOutput: number;
  startDate: string;
  productionDays?: number;
  offDays: number;
  endDate?: string;
  outStartDate: string | null;
  outEndDate: string | null;
  warehouseStartDate: string | null;
  warehouseEndDate: string | null;
  statusCode?: string;
  /** Dòng nằm trong phạm vi sửa của người xem (phạm vi xem có thể rộng hơn phạm vi sửa) */
  editable?: boolean;
}

export interface LinePlanDetail extends LinePlan {
  lines: ScheduleLine[];
  /** Lịch làm việc của ĐVCS kế hoạch: tính trước số ngày nghỉ, kết thúc, ra chuyền, nhập kho khi gõ (phase 5.12) */
  calendar: WorkCalendarJson;
}

export interface BoardBar {
  id: number;
  planId: number;
  planNo: string;
  lineCode: string;
  startDate: string;
  endDate: string;
  qty: number;
  avgOutput: number;
  customerName: string;
  styleCode: string;
  poBuyDate: string;
  shipDate: string;
  statusCode: string;
}

export interface Board {
  from: string;
  to: string;
  lines: { code: string; name: string; branchCode: string; isActive: boolean }[];
  bars: BoardBar[];
  /** Ngày nghỉ theo lịch ĐVCS trong khoảng đang xem, theo mã ĐVCS; `name` chỉ có ở ngày lễ, Tết */
  nonWorkingDays?: Record<string, { date: string; name: string | null }[]>;
}

/** Trạng thái phân màu cỡ của một kế hoạch: tổng giao mọi chuyền so với SL kế hoạch (phase 5.13) */
export type AllocationStatus = 'PLANNED' | 'PARTIAL' | 'FULL';

/**
 * Một dòng của màn Phân bổ màu cỡ: một kế hoạch đã xếp chuyền (`id` là Id kế hoạch). Chuyền là mảng theo thứ tự dàn chuyền, NSBQ là trung bình các chuyền đó,
 * chỉ gồm chuyền trong phạm vi xem; SL kế hoạch, SL giao, trạng thái là của cả kế hoạch. Cột bị Che là "***", bị Ẩn thì không có.
 */
export interface Allocation {
  id: number;
  planNo: string;
  customerName?: Masked<string>;
  styleCode?: Masked<string>;
  poBuyDate?: Masked<string>;
  branchCode: string;
  lineCode?: Masked<string[]>;
  /** Tên chuyền cùng thứ tự với `lineCode`; không có khi mã chuyền bị Ẩn hoặc Che (tên suy ra được mã) */
  lineName?: string[];
  startDate?: Masked<string>;
  avgOutput?: Masked<number>;
  endDate?: Masked<string>;
  shipDate?: Masked<string>;
  qty?: Masked<number>;
  assignedQty?: Masked<number>;
  statusCode?: Masked<AllocationStatus>;
  createdAt: string;
}

/** Một chuyền (dòng dàn chuyền) của kế hoạch trong popup phân màu cỡ */
export interface AllocationLine {
  id: number;
  lineCode?: Masked<string>;
  lineName?: string;
  /** SL đã xếp cho chuyền ở Xếp chuyền: tổng giao của chuyền không vượt số này */
  qty?: Masked<number>;
  avgOutput?: Masked<number>;
  startDate?: Masked<string>;
  endDate?: Masked<string>;
  statusCode?: Masked<string>;
  /** Tổng giao đã lưu của chuyền */
  assignedQty?: Masked<number>;
  /** Người xem sửa được phần giao của chuyền này */
  editable: boolean;
}

/** Một màu cỡ của kế hoạch: SL KHXH; `hiddenQty`: tổng đã giao cho chuyền ngoài phạm vi xem của người xem */
export interface AllocationCell {
  colorName: string;
  sizeName: string;
  qty?: Masked<number>;
  hiddenQty?: Masked<number>;
}

/** Một phần giao đã lưu: chuyền (Id dòng dàn chuyền), màu cỡ, SL giao */
export interface AllocationRow {
  id: number;
  lineId: number;
  colorName: string;
  sizeName: string;
  assignedQty?: Masked<number>;
}

export interface AllocationDetail extends Allocation {
  lines: AllocationLine[];
  colorSizes: AllocationCell[];
  rows: AllocationRow[];
}
