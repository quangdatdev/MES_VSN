// Kiểu dữ liệu trả về từ /api/v1/order/* (xem docs/thiet-ke/api-contract.md mục Module Đơn hàng).
// Trường có thể vắng mặt (cột Ẩn) hoặc là "***" (cột Che) tùy chính sách cột của người xem.

import type { Masked } from '../../lib/fieldPolicy';

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
  /** Mã nhà máy SX (danh mục Nhà máy SX); null: chưa chọn */
  productionFactoryCode?: Masked<string | null>;
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
