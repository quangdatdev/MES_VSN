import type { ColumnType, Generated, Kysely } from 'kysely';

type Id = Generated<number>;
type DateCol = ColumnType<Date, string | Date, string | Date>;
type NullableDateCol = ColumnType<Date | null, string | Date | null, string | Date | null>;
type Computed<T> = ColumnType<T, never, never>;
type Audit = {
  BranchCode: string;
  CreatedAt: ColumnType<Date, Date | undefined, never>;
  CreatedBy: number | null;
  ModifiedAt: Date | null;
  ModifiedBy: number | null;
};

export type SalesOrderStatus = 'NEW' | 'PLANNING' | 'IN_PRODUCTION' | 'DONE' | 'CANCELLED';
export type PoStatus = 'DRAFT' | 'CONFIRMED';
export type PlanStatus = 'PLANNED' | 'SCHEDULED' | 'IN_PRODUCTION' | 'DONE';
export type LineStatus = 'PLANNED' | 'ALLOCATED' | 'IN_PRODUCTION' | 'DONE';

export interface SalesOrderTable extends Audit {
  Id: Id;
  OrderNo: string;
  CustomerName: string;
  StyleCode: string;
  Season: string | null;
  OrderType: string | null;
  ProductName: string;
  StaffName: string | null;
  Qty: number;
  UnitName: string;
  UnitPrice: number | null;
  Amount: Computed<number | null>;
  CmPrice: number | null;
  SyncedAt: Date | null;
  ShipDate: DateCol;
  StatusCode: SalesOrderStatus;
  /**
   * Nhà máy SX: một hoặc nhiều mã (MES_Core.SysProductionFactory.Code, khóa ngầm) cách nhau dấu phẩy, theo OSM (ADR 0013 mục 9,
   * platform/catalog/factory-list.ts); NULL: chưa có
   */
  ProductionFactoryCode: ColumnType<string | null, string | null | undefined, string | null>;
  /** Nhà máy SX lấy theo OSM: người dùng không sửa tay (migration 0007) */
  IsFactoryFromOsm: ColumnType<boolean, boolean | undefined, boolean>;
  /** ProductId của BRAVO khi đơn hàng nạp từ bảng chép MES_Sync; NULL: nhập tay */
  SourceProductId: ColumnType<number | null, number | null | undefined, never>;
  /** SHA-256 các cột lấy từ BRAVO ở lần nạp gần nhất (bước nạp tăng dần, migration 0006); NULL: nhập tay hoặc chưa lấy mốc */
  SourceHash: ColumnType<string | null, string | null | undefined, string | null>;
}

export interface SalesOrderPoTable extends Audit {
  Id: Id;
  SalesOrderId: number;
  PoCode: string;
  PoNumber: string;
  CustomerName: string;
  StyleCode: string;
  Qty: number;
  Destination: string | null;
  PackingListCode: string | null;
  CustomsDeclarationNo: string | null;
  SyncedAt: Date | null;
  ShipDate: DateCol;
  StatusCode: PoStatus;
  ConfirmedAt: Date | null;
  ConfirmedBy: number | null;
}

export interface SalesOrderPoColorSizeTable extends Audit {
  Id: Id;
  SalesOrderPoId: number;
  ColorName: string;
  SizeName: string;
  Qty: number;
  SortOrder: number;
}

export interface ShipmentPlanTable extends Audit {
  Id: Id;
  PlanNo: string;
  SalesOrderId: number;
  CustomerName: string;
  StyleCode: string;
  ProductName: string;
  OrderType: string | null;
  PoBuyDate: string;
  PlanQty: number;
  CmPrice: number | null;
  Revenue: Computed<number | null>;
  SyncedAt: Date | null;
  ShipDate: DateCol;
  PlannerName: string;
  CutQty: number;
  SewnQty: number;
  EndlineQty: number;
  FinishedQty: number;
  StatusCode: PlanStatus;
}

export interface ShipmentPlanPoTable extends Audit {
  Id: Id;
  ShipmentPlanId: number;
  SalesOrderPoId: number;
}

export interface ShipmentPlanColorSizeTable extends Audit {
  Id: Id;
  ShipmentPlanId: number;
  ColorName: string;
  SizeName: string;
  OriginalQty: number;
  PlanQty: number;
  SortOrder: number;
}

export interface ShipmentPlanLineTable extends Audit {
  Id: Id;
  ShipmentPlanId: number;
  LineCode: string;
  Qty: number;
  AvgOutput: number;
  StartDate: DateCol;
  ProductionDays: number;
  OffDays: number;
  EndDate: DateCol;
  OutStartDate: NullableDateCol;
  OutEndDate: NullableDateCol;
  WarehouseStartDate: NullableDateCol;
  WarehouseEndDate: NullableDateCol;
  StatusCode: LineStatus;
  SortOrder: number;
}

export interface ShipmentPlanLineColorSizeTable extends Audit {
  Id: Id;
  ShipmentPlanLineId: number;
  ColorName: string;
  SizeName: string;
  PlanQty: number;
  AssignedQty: number;
  SortOrder: number;
}

/**
 * Phân bổ PO (order.poallocation, migration 0009): mỗi dòng khác nhau của view OSM v_OSMData một dòng, nhận diện bằng RowHash.
 * Dùng chung, không có BranchCode: ĐVCS suy từ Nhà máy SX theo danh mục. Dòng do bước làm mới của hệ thống tạo (CreatedBy trống).
 */
export interface PoAllocationTable {
  Id: Generated<number>;
  RowHash: Buffer;
  Brand: string | null;
  Season: string | null;
  PoNo: string | null;
  SoNo: string | null;
  ShipMode: string | null;
  StyleName: string | null;
  StyleNo: string | null;
  Color: string | null;
  EtdActualDate: NullableDateCol;
  EtdRevisedDate: NullableDateCol;
  /** FtyName của OSM ở lần làm mới gần nhất */
  OsmFactoryCode: string | null;
  /** Nhà máy SX hiện hành: nhập tay (mã MES_Core.SysProductionFactory.Code) hoặc theo OSM (= OsmFactoryCode) */
  ProductionFactoryCode: string | null;
  IsFactoryManual: ColumnType<boolean, boolean | undefined, boolean>;
  /** false: OSM không còn dòng nào cùng khóa SO, PO, Style No, Màu; chỉ dòng nhập tay được giữ */
  IsInOsm: ColumnType<boolean, boolean | undefined, boolean>;
  SyncedAt: Date | null;
  CreatedAt: ColumnType<Date, Date | undefined, never>;
  CreatedBy: ColumnType<number | null, number | null | undefined, never>;
  ModifiedAt: Date | null;
  ModifiedBy: number | null;
}

export interface OrderDatabase {
  PoAllocation: PoAllocationTable;
  SalesOrder: SalesOrderTable;
  SalesOrderPo: SalesOrderPoTable;
  SalesOrderPoColorSize: SalesOrderPoColorSizeTable;
  ShipmentPlan: ShipmentPlanTable;
  ShipmentPlanPo: ShipmentPlanPoTable;
  ShipmentPlanColorSize: ShipmentPlanColorSizeTable;
  ShipmentPlanLine: ShipmentPlanLineTable;
  ShipmentPlanLineColorSize: ShipmentPlanLineColorSizeTable;
}

export type OrderDb = Kysely<OrderDatabase>;
/** Dòng đọc từ DB: cột DATE về dạng Date, cột tính có giá trị. */
export type Row<T> = { [K in keyof T]: T[K] extends ColumnType<infer S, any, any> ? S : T[K] extends Generated<infer G> ? G : T[K] };
