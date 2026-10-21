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

/** Một dòng dàn chuyền (bản chép từ MES_Order, quyết định 9.1) cùng các cột nhập tay. */
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

/** Kế hoạch may (phase 5.16, quyết định 14.1): một chuyền trong một ngày, giữ trạng thái chốt. */
export interface SewingDayPlanTable extends Audit {
  Id: Id;
  PlanDate: DateCol;
  LineCode: string;
  IsLocked: ColumnType<boolean, boolean | undefined, boolean>;
  LockedAt: Date | null;
  LockedBy: number | null;
  LockerName: string | null;
  BranchCode: string;
}

/**
 * Một dòng dàn chuyền trong ngày của chuyền: số nhập (linemap, ngày xưởng giao, giờ) và bản chụp từ Xếp chuyền lúc Cập nhật, Chốt.
 * Cột TIME đọc ra là Date (1970-01-01 theo UTC), ghi bằng chuỗi "HH:mm".
 */
export interface SewingDayPlanItemTable extends Audit {
  Id: Id;
  SewingDayPlanId: number;
  ShipmentPlanLineId: number;
  SourceCreatedAt: ColumnType<Date, Date, Date>;
  ShipmentPlanId: number;
  StyleCode: string;
  ProductName: string;
  PoBuyDate: string;
  CmPrice: number | null;
  StartDate: DateCol;
  EndDate: DateCol;
  PlanQty: number;
  LinemapQty: number | null;
  DayQty: number | null;
  StartTime: ColumnType<Date, string | undefined, string>;
  EndTime: ColumnType<Date, string | undefined, string>;
  SortOrder: ColumnType<number, number | undefined, number>;
  BranchCode: string;
}

/** Nguồn của dòng Phân cụm trưởng: seed giả lập, hoặc đồng bộ GSD (MES_Sewing/0005) */
export type ClusterSource = 'DEMO' | 'GSD';

/** Phân cụm trưởng (phase 5.18): một tổ là một chuyền may; dòng do hệ thống chép từ GSD (đang giả lập). */
export interface SewingTeamTable extends Audit {
  Id: Id;
  LineCode: string;
  SourceSystem: ClusterSource;
  SourceKey: string | null;
  SourceSyncedAt: ColumnType<Date, Date, Date>;
  BranchCode: string;
}

/** Tổ trưởng của tổ (Phân tổ trưởng của GSD): nhân viên MES_Hr.Employee.Id */
export interface SewingTeamLeaderTable extends Audit {
  Id: Id;
  SewingTeamId: number;
  EmployeeId: number;
  SourceKey: string | null;
  SourceSyncedAt: ColumnType<Date, Date, Date>;
  BranchCode: string;
}

/** Cụm của một mã hàng ở tổ (Phân cụm của GSD) cùng cụm trưởng tổ trưởng chọn (cột Leader*) */
export interface SewingTeamClusterTable extends Audit {
  Id: Id;
  SewingTeamId: number;
  StyleCode: string;
  StyleLabel: string | null;
  Code: string;
  Name: string;
  SortOrder: ColumnType<number, number | undefined, number>;
  SourceKey: string | null;
  SourceSyncedAt: ColumnType<Date, Date, Date>;
  LeaderEmployeeId: number | null;
  LeaderEmployeeCode: string | null;
  BranchCode: string;
}

export interface SewingDatabase {
  PrepStep: PrepStepTable;
  SewingPrep: SewingPrepTable;
  SewingPrepStep: SewingPrepStepTable;
  SewingDayPlan: SewingDayPlanTable;
  SewingDayPlanItem: SewingDayPlanItemTable;
  SewingTeam: SewingTeamTable;
  SewingTeamLeader: SewingTeamLeaderTable;
  SewingTeamCluster: SewingTeamClusterTable;
}

export type SewingDb = Kysely<SewingDatabase>;
/** Dòng đọc từ DB: cột DATE về dạng Date, cột tự sinh có giá trị. */
export type Row<T> = { [K in keyof T]: T[K] extends ColumnType<infer S, any, any> ? S : T[K] extends Generated<infer G> ? G : T[K] };
