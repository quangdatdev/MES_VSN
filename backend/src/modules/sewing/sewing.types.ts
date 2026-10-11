import type { ColumnType, Generated, Kysely } from 'kysely';

type Id = Generated<number>;
type DateCol = ColumnType<Date, string | Date, string | Date>;
type NullableDateCol = ColumnType<Date | null, string | Date | null | undefined, string | Date | null>;
type Audit = {
  CreatedAt: ColumnType<Date, Date | undefined, never>;
  CreatedBy: number | null;
  ModifiedAt: Date | null;
  ModifiedBy: number | null;
};

/** Danh mục "Cấu hình chuẩn bị SX": một bước chuẩn bị, dùng chung toàn công ty. */
export interface PrepStepTable extends Audit {
  Id: Id;
  Code: string;
  Name: string;
  Description: string | null;
  PlanDays: number;
  Performer: string | null;
  DataSource: string | null;
  SortOrder: number;
  IsActive: boolean;
  IsSystem: ColumnType<boolean, boolean | undefined, never>;
}

/** Một dòng dàn chuyền (bản chép từ MES_Order, ADR 0009) cùng các cột nhập tay. */
export interface SewingPrepTable extends Audit {
  Id: Id;
  ShipmentPlanLineId: number;
  ShipmentPlanId: number;
  PlanNo: string;
  CustomerName: string;
  StyleCode: string;
  ProductName: string;
  LineCode: string;
  LineQty: number;
  StartDate: DateCol;
  StyleType: string | null;
  ConfirmedQty: number | null;
  PriorityFactor: ColumnType<number | null, number | null | undefined, number | null>;
  SourceSyncedAt: ColumnType<Date, Date, Date>;
  /** Thời điểm tạo dòng dàn chuyền nguồn: cùng Id, nhà máy, kế hoạch nhưng khác thời điểm tạo là dòng khác (Id bị dùng lại) */
  SourceCreatedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  BranchCode: string;
}

/** Số ngày KH chỉnh riêng (NULL: theo danh mục) và ngày thực hiện của một bước, cho một dòng. */
export interface SewingPrepStepTable extends Audit {
  Id: Id;
  SewingPrepId: number;
  PrepStepId: number;
  PlanDays: number | null;
  DoneDate: NullableDateCol;
  BranchCode: string;
}

export interface SewingDatabase {
  PrepStep: PrepStepTable;
  SewingPrep: SewingPrepTable;
  SewingPrepStep: SewingPrepStepTable;
}

export type SewingDb = Kysely<SewingDatabase>;
/** Dòng đọc từ DB: cột DATE về dạng Date, cột tự sinh có giá trị. */
export type Row<T> = { [K in keyof T]: T[K] extends ColumnType<infer S, any, any> ? S : T[K] extends Generated<infer G> ? G : T[K] };
