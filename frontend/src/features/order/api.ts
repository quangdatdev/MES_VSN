// Kiểu dữ liệu trả về từ /api/v1/order/* (xem docs/thiet-ke/api-contract.md mục Module Đơn hàng).
// Trường có thể vắng mặt (cột Ẩn) hoặc là "***" (cột Che) tùy chính sách cột của người xem.

import type { Masked } from '../../lib/fieldPolicy';
import type { Paged } from '../../lib/types';

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
}

/**
 * Một dòng phân bổ PO theo nhà máy, lấy từ OSM (màn Phân bổ PO, chỉ xem). Dòng trùng nguyên dòng của OSM chỉ có một. Không có Id:
 * `rowNo` là số thứ tự trong danh sách đang xem. Mọi cột đều theo chính sách cột: vắng mặt khi bị Ẩn, "***" khi bị Che.
 */
export interface PoAllocation {
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
}

export interface PoAllocationPage extends Paged<PoAllocation> {
  /** Lần chép gần nhất của nguồn OSM này; null: chưa đồng bộ lần nào */
  syncedAt: string | null;
  /** Nguồn đồng bộ đang bật; false: máy chủ chưa khai database OSM của nguồn này */
  sourceActive: boolean;
}

/** Nhà máy SX (ô chọn chỉ cho nhà máy đang dùng; nhà máy đã ngừng để hiện tên ở đơn hàng cũ), gom theo đơn vị cơ sở */
export interface FactoryOption {
  code: string;
  name: string;
  isActive: boolean;
  branchCode: string | null;
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

export interface ShipmentPlanDetail extends ShipmentPlan {
  poIds: number[];
  lines: PlanLine[];
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
}

export interface Allocation {
  id: number;
  planId: number;
  planNo: string;
  customerName: string;
  styleCode: string;
  poBuyDate: string;
  branchCode: string;
  lineCode: string;
  /** Không có khi mã chuyền bị Ẩn hoặc Che (tên suy ra được mã) */
  lineName?: string;
  startDate: string;
  avgOutput: number;
  endDate: string;
  shipDate: string;
  qty: number;
  assignedQty: Masked<number>;
  statusCode: string;
}

export interface AllocationRow {
  id?: number;
  colorName: string;
  sizeName: string;
  planQty: number;
  assignedQty: number;
}

export interface AllocationDetail extends Allocation {
  rows: AllocationRow[];
}

/** Bộ lọc chung của các lưới theo mô tả giao diện. */
export interface OrderFilter {
  shipFrom: string;
  shipTo: string;
  customer: string;
  style: string;
  season: string;
  status: string;
  line: string;
  /** Tìm nhanh (số chứng từ, PO/Buy date...) */
  q: string;
}

export const emptyFilter: OrderFilter = { shipFrom: '', shipTo: '', customer: '', style: '', season: '', status: '', line: '', q: '' };
