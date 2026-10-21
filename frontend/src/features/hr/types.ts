// Kiểu dữ liệu của module Nhân sự, khớp API /hr/* (backend/src/modules/hr, quyết định 10.1)

/** Phòng ban trong cây (GET /hr/departments/tree, /hr/departments/:id) */
export interface Department {
  id: number;
  code: string;
  name: string;
  nameEn: string | null;
  departmentTypeId: number;
  typeCode: string;
  typeName: string;
  levelOrder: number;
  isFinalLevel: boolean;
  parentId: number | null;
  path: string;
  managerEmployeeId: number | null;
  managerCode: string | null;
  managerName: string | null;
  branchCode: string | null;
  establishedDate: string | null;
  dissolvedDate: string | null;
  sortOrder: number;
  isActive: boolean;
  /** Tích "Xưởng sản xuất": bộ phận là một chuyền may trong ô chọn Chuyền may của ĐVCS của nó (phase 5.10) */
  isProductionWorkshop: boolean;
  /** Nhân viên đang làm, chỉ tính trực tiếp trong phòng ban */
  activeEmployees: number;
  createdAt: string;
  modifiedAt: string | null;
}

/** Người đang được giao phạm vi chuyền theo một mã (GET /hr/departments/line-holders): thấy dữ liệu chuyền đó khi mã thành chuyền */
export interface LineHolders {
  code: string;
  holders: { username: string; fullName: string }[];
}

export interface DepartmentType {
  id: number;
  code: string;
  name: string;
  levelOrder: number;
  isFinalLevel: boolean;
  isActive: boolean;
}

export interface DepartmentOptions {
  types: DepartmentType[];
  factories: { code: string; name: string }[];
}

export interface ManagerOption {
  id: number;
  code: string;
  fullName: string;
  departmentName: string | null;
  isActive: boolean;
}

/** Phòng ban để chọn và lọc ở màn Thông tin nhân sự */
export interface PickDepartment {
  id: number;
  code: string;
  name: string;
  parentId: number | null;
  path: string;
  isActive: boolean;
}

export interface JobTitleOption {
  id: number;
  code: string;
  name: string;
  departmentId: number | null;
  isActive: boolean;
}

export type EmployeeFieldType = 'code' | 'text' | 'email' | 'date' | 'bool' | 'gender' | 'status' | 'department' | 'jobTitle';
export type EmployeeFieldGroup = 'general' | 'timekeeping' | 'personal' | 'contact';

/** Một trường của hồ sơ: máy chủ định nghĩa một chỗ cho form, lưới nhập, file mẫu (employee-fields.ts) */
export interface EmployeeField {
  key: string;
  label: string;
  group: EmployeeFieldGroup;
  type: EmployeeFieldType;
  required: boolean;
  max: number | null;
}

export interface EmployeeOptions {
  departments: PickDepartment[];
  jobTitles: JobTitleOption[];
  genders: { value: number; label: string }[];
  statuses: { value: number; label: string }[];
  fields: EmployeeField[];
  groups: Record<EmployeeFieldGroup, string>;
}

/** Thẻ trong danh sách nhân viên */
export interface EmployeeCard {
  id: number;
  code: string;
  timekeepingCode: string | null;
  fullName: string;
  gender: number;
  departmentId: number;
  departmentName: string;
  jobTitleId: number;
  jobTitleName: string;
  employmentStatus: number;
  startDate: string | null;
  createdAt: string;
}

/** Hồ sơ đầy đủ: các khóa theo EmployeeField; cột bị Ẩn không có, cột bị Che là "***" */
export type EmployeeDetail = {
  id: number;
  departmentCode: string;
  departmentName: string;
  jobTitleName: string;
  createdAt: string;
  modifiedAt: string | null;
} & Record<string, string | number | boolean | null>;

export interface ImportPreviewRow {
  index: number;
  header: boolean;
  ok: boolean;
  /** Lỗi theo ô (danh sách, không phải object theo mã cột: khóa trùng mã cột nhạy cảm bị chính sách cột coi là đọc dữ liệu) */
  errors: { field: string; message: string }[];
  resolved: { departmentName?: string; jobTitleName?: string };
}

export interface ImportCommitResult {
  created: number;
  failed: number;
  results: { index: number; ok: boolean; id?: number; code?: string; message?: string; skipped?: boolean }[];
}
