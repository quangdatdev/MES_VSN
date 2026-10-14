import type { ColumnType, Generated, Kysely } from 'kysely';

type Id = Generated<number>;
type DateCol = ColumnType<Date, string | Date, string | Date>;
type Audit = {
  CreatedAt: ColumnType<Date, Date | undefined, never>;
  CreatedBy: number | null;
  ModifiedAt: Date | null;
  ModifiedBy: number | null;
};

/** Bản chép đầu kế hoạch xuất hàng (MES_Order.ShipmentPlan), quyết định 13.1, 13.2. */
export interface CuttingPlanTable extends Audit {
  Id: Id;
  /** NULL: kế hoạch nguồn đã bị xóa mà còn số cắt (SourceDeletedAt có giá trị) */
  ShipmentPlanId: number | null;
  SourceCreatedAt: ColumnType<Date, Date, Date>;
  PlanNo: string;
  CustomerName: string;
  StyleCode: string;
  ProductName: string;
  PoBuyDate: string;
  ShipDate: DateCol;
  PlanQty: number;
  SourceDeletedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  SourceSyncedAt: ColumnType<Date, Date, Date>;
  BranchCode: string;
}

/** Bản chép SL KHXH theo màu cỡ của kế hoạch */
export interface CuttingPlanColorSizeTable extends Audit {
  Id: Id;
  CuttingPlanId: number;
  ColorName: string;
  SizeName: string;
  PlanQty: number;
  SortOrder: number;
  BranchCode: string;
}

/** Số cắt trong một ngày của một màu cỡ (Qty > 0) */
export interface CuttingPlanDailyTable extends Audit {
  Id: Id;
  CuttingPlanId: number;
  ColorName: string;
  SizeName: string;
  EntryDate: DateCol;
  Qty: number;
  BranchCode: string;
}

export interface CuttingDatabase {
  CuttingPlan: CuttingPlanTable;
  CuttingPlanColorSize: CuttingPlanColorSizeTable;
  CuttingPlanDaily: CuttingPlanDailyTable;
}

export type CuttingDb = Kysely<CuttingDatabase>;
/** Dòng đọc từ DB: cột DATE về dạng Date, cột tự sinh có giá trị. */
export type Row<T> = { [K in keyof T]: T[K] extends ColumnType<infer S, any, any> ? S : T[K] extends Generated<infer G> ? G : T[K] };
