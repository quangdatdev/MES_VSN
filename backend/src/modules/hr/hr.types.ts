import type { ColumnType, Generated, Kysely } from 'kysely';

type Id = Generated<number>;
type NullableDateCol = ColumnType<Date | null, string | Date | null | undefined, string | Date | null>;
type Audit = {
  CreatedAt: ColumnType<Date, Date | undefined, never>;
  CreatedBy: number | null;
  ModifiedAt: Date | null;
  ModifiedBy: number | null;
};

/** Loại phòng ban (Công ty, Khối, Phòng, Bộ phận...): LevelOrder sắp xếp cây, IsFinalLevel không thêm cấp con được. */
export interface DepartmentTypeTable extends Audit {
  Id: Id;
  Code: string;
  Name: string;
  Description: string | null;
  LevelOrder: number;
  IsFinalLevel: boolean;
  SortOrder: number;
  IsActive: boolean;
  IsSystem: ColumnType<boolean, boolean | undefined, boolean>;
}

/** Phòng ban trong cây hành chính (ADR 0012 mục 3). Path = Path của cha + Code + '/'. */
export interface DepartmentTable extends Audit {
  Id: Id;
  Code: string;
  Name: string;
  NameEn: string | null;
  DepartmentTypeId: number;
  ParentId: number | null;
  Path: string;
  ManagerEmployeeId: number | null;
  /** Phòng ban thuộc một nhà máy (khóa ngầm MES_Core.SysBranch.Code) */
  BranchCode: string | null;
  EstablishedDate: NullableDateCol;
  DissolvedDate: NullableDateCol;
  SortOrder: number;
  IsActive: boolean;
  /** Tích "Xưởng sản xuất": bộ phận là một chuyền may trong ô chọn Chuyền may (phase 5.10); bắt buộc có BranchCode */
  IsProductionWorkshop: ColumnType<boolean, boolean | undefined, boolean>;
}

/** Chức danh. DepartmentId NULL: dùng chung; có giá trị: dùng cho phòng ban đó và cả nhánh con. */
export interface JobTitleTable extends Audit {
  Id: Id;
  Code: string;
  Name: string;
  Description: string | null;
  DepartmentId: number | null;
  SortOrder: number;
  IsActive: boolean;
  IsSystem: ColumnType<boolean, boolean | undefined, boolean>;
}

/** Hồ sơ nhân viên. Mã sửa được, liên kết theo Id (ADR 0012 mục 4). */
export interface EmployeeTable extends Audit {
  Id: Id;
  Code: string;
  TimekeepingCode: string | null;
  FullName: string;
  FullNameEn: string | null;
  Email: string | null;
  Gender: number;
  DepartmentId: number;
  JobTitleId: number;
  EmploymentStatus: number;
  StartDate: NullableDateCol;
  EndDate: NullableDateCol;
  TimekeepingName: string | null;
  CardCode: string | null;
  StaffType: string | null;
  IsTimekeepingAllowed: boolean | null;
  Nickname: string | null;
  BirthDate: NullableDateCol;
  BirthPlace: string | null;
  Hometown: string | null;
  Ethnicity: string | null;
  Nationality: string | null;
  IdNumber: string | null;
  IdIssuePlace: string | null;
  ContactPhone: string | null;
  ContactPerson: string | null;
  CurrentAddress: string | null;
}

export interface HrDatabase {
  DepartmentType: DepartmentTypeTable;
  Department: DepartmentTable;
  JobTitle: JobTitleTable;
  Employee: EmployeeTable;
}

export type HrDb = Kysely<HrDatabase>;
/** Dòng đọc từ DB: cột DATE về dạng Date, cột tự sinh có giá trị. */
export type Row<T> = { [K in keyof T]: T[K] extends ColumnType<infer S, any, any> ? S : T[K] extends Generated<infer G> ? G : T[K] };
