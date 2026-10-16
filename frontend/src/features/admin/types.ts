export interface AdminUser {
  id: number;
  username: string;
  fullName: string;
  email: string | null;
  isActive: boolean;
  isLocked: boolean;
  lastLoginAt: string | null;
  roleIds: number[];
  branchIds: number[];
  defaultBranchId: number | null;
}

export interface AdminRole {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  permissionCount: number;
  userCount: number;
}

/** Đơn vị cơ sở (SysBranch, ADR 0013) */
export interface AdminBranch {
  id: number;
  code: string;
  name: string;
  /** Tên đầy đủ theo BRAVO */
  description: string | null;
  isAggregate: boolean;
  isActive: boolean;
  isSystem: boolean;
  /** Có trong danh mục chi nhánh BRAVO không; null: đơn vị tổng hợp hoặc chưa đọc được MES_Sync */
  inBravo: boolean | null;
  factories: { code: string; name: string; isActive: boolean }[];
}

export interface BranchImportResult {
  rows: number;
  added: { code: string; name: string }[];
  updated: { code: string }[];
  missing: string[];
  skipped: string[];
}

/** Nhà máy SX (Quản trị › Danh mục hệ thống) */
export interface AdminFactory {
  id: number;
  code: string;
  name: string;
  branchCode: string | null;
  branchName: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

/** Loại phòng ban (MES_Hr, task 5.8.9): sửa ở Danh mục hệ thống, ô chọn loại ở Sơ đồ tổ chức */
export interface AdminDepartmentType {
  id: number;
  code: string;
  name: string;
  description: string | null;
  /** Chỉ để xếp các phòng ban cùng cha: số nhỏ đứng trước */
  levelOrder: number;
  /** Phòng ban loại này không có phòng ban con */
  isFinalLevel: boolean;
  sortOrder: number;
  isActive: boolean;
  /** Nạp sẵn khi cài đặt; sửa được như loại khác */
  isSystem: boolean;
  /** Số phòng ban chưa giải thể đang dùng loại này */
  departmentCount: number;
}

export interface PermissionMatrix {
  actions: string[];
  modules: {
    code: string;
    name: string;
    resources: {
      id: number;
      code: string;
      name: string;
      scopeType: 'BRANCH' | 'SHARED';
      permissions: { id: number; code: string; action: string }[];
    }[];
  }[];
}

export interface AuditRow {
  id: string;
  eventAt: string;
  username: string | null;
  branchCode: string | null;
  entityType: string;
  entityId: string | null;
  actionCode: string;
  oldValue: string | null;
  newValue: string | null;
  ip: string | null;
}

export const ACTION_LABEL: Record<string, string> = { view: 'Xem', create: 'Thêm', update: 'Sửa', delete: 'Xóa', export: 'Xuất file' };

export type AccessLevel = 'HIDDEN' | 'MASKED' | 'READONLY' | 'EDITABLE';

export interface ResourceFields {
  id: number;
  code: string;
  name: string;
  fields: { code: string; name: string; description: string | null; isSensitive: boolean }[];
}

export interface FieldPolicyMatrix {
  resource: { id: number; code: string; name: string };
  fields: { code: string; name: string; description: string | null; isSensitive: boolean }[];
  roles: { id: number; code: string; name: string }[];
  policies: { roleId: number; fieldCode: string; accessLevel: AccessLevel }[];
}

/** Chuyền may cho phạm vi chiều Chuyền (phase 5.10): bộ phận tích "Xưởng sản xuất"; nhóm là bộ phận cha */
export interface ScopeLine {
  code: string;
  name: string;
  branchCode: string;
  /** false: bỏ tích hoặc bộ phận đã giải thể (phạm vi cũ còn mã này thì không có tác dụng) */
  isActive: boolean;
  workshopCode: string | null;
  workshopName: string | null;
}

export interface ScopeCatalog {
  dimensions: { id: number; code: string; name: string; description: string | null; orgType: string | null }[];
  /** Nút ĐVCS của cây tổ chức (chiều Đơn vị cơ sở) */
  orgUnits: { id: number; code: string; name: string; orgType: 'FACTORY'; parentId: number | null; branchCode: string; path: string; isActive: boolean }[];
  /** Chuyền của mọi ĐVCS, kể cả đã ngừng; phạm vi chiều Chuyền lưu mã chuyền (value) */
  lines: ScopeLine[];
}

export interface UserAccessInfo {
  user: { id: number; username: string; fullName: string };
  assignments: {
    userRoleId: number;
    roleId: number;
    roleCode: string;
    roleName: string;
    roleActive: boolean;
    validFromAt: string | null;
    validToAt: string | null;
    scopes: {
      id: number;
      dimension: string;
      mode: string;
      orgUnitId: number | null;
      orgUnitCode: string | null;
      orgUnitName: string | null;
      value: string | null;
      /** Chiều Chuyền: tên chuyền của mã (kể cả đã ngừng); null khi mã không còn là bộ phận chuyền hoặc chiều khác */
      valueName: string | null;
      /** Chiều Chuyền: mã còn là chuyền đang dùng (false: không có tác dụng); chiều khác: null */
      valueActive: boolean | null;
    }[];
  }[];
  overrides: { id: number; permissionId: number; permissionCode: string; permissionName: string; effect: 'ALLOW' | 'DENY'; validFromAt: string | null; validToAt: string | null; reason: string; createdAt: string }[];
  fieldPolicies: { id: number; resourceId: number; resourceCode: string; resourceName: string; fieldCode: string; fieldName: string; accessLevel: AccessLevel; validFromAt: string | null; validToAt: string | null; reason: string | null }[];
}

export interface EffectiveAccess {
  user: { id: number; fullName: string; isActive: boolean };
  branch: { code: string; name: string; isAggregate: boolean; allowed: boolean };
  roles: { code: string; name: string }[];
  screens: { code: string; name: string; actions: string[]; scope: string[] }[];
  fieldLevels: Record<string, Record<string, AccessLevel>>;
}

export const LEVELS: { value: AccessLevel; label: string; hint: string }[] = [
  { value: 'EDITABLE', label: 'Sửa được', hint: 'Xem và sửa (vẫn cần quyền Sửa của màn hình)' },
  { value: 'READONLY', label: 'Chỉ đọc', hint: 'Xem được, không sửa' },
  { value: 'MASKED', label: 'Che', hint: 'Thấy cột nhưng giá trị là ***' },
  { value: 'HIDDEN', label: 'Ẩn', hint: 'Không có cột này, kể cả khi xuất file' },
];

// ---- Đồng bộ dữ liệu (ADR 0007) ----
export type SyncStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
export type SyncMode = 'INCREMENTAL' | 'FULL';

export interface SyncRunInfo {
  id: number;
  status: SyncStatus;
  mode: SyncMode;
  /** Giờ của nguồn (BRAVO), dạng "YYYY-MM-DDTHH:mm:ss" không múi giờ */
  sinceAt: string | null;
  readCount: number | null;
  insertedCount: number | null;
  updatedCount: number | null;
  deletedCount: number | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
}

export interface SyncSourceInfo {
  id: number;
  code: string;
  name: string;
  description: string | null;
  system: string;
  /** CATALOG, ORDER; nhóm khác hiện là "Khác" */
  group: string;
  sourceObject: string;
  targetTable: string;
  mode: SyncMode;
  keyColumns: string;
  overlapMinutes: number;
  /** Giờ của nguồn, không múi giờ */
  watermarkAt: string | null;
  lastSuccessAt: string | null;
  /** Lần chép toàn bộ thành công gần nhất (UTC) */
  lastFullAt: string | null;
  targetCount: number | null;
  lastRun: SyncRunInfo | null;
}

export interface SyncRunRow extends SyncRunInfo {
  batchId: string;
  prevWatermarkAt: string | null;
  newWatermarkAt: string | null;
  targetCount: number | null;
  createdBy: string | null;
}

// ---------- Danh mục hệ thống ----------

export interface MesCatalog {
  code: string;
  /** factory: nhà máy SX (SysProductionFactory); item: danh mục mã, tên (SysCatalog); shift: ca làm việc; calendar: lịch làm việc theo ĐVCS */
  kind: 'factory' | 'item' | 'shift' | 'calendar';
  name: string;
  description: string | null;
  total: number;
  active: number;
  /** Độ dài tối đa của tên mục (danh mục mã-tên); Đơn vị tính 20 vì đơn hàng lưu tên */
  nameMax?: number;
}

export interface ExternalCatalog {
  code: string;
  name: string;
  description: string | null;
  system: string;
  sourceObject: string;
  rowCount: number | null;
  lastSuccessAt: string | null;
  lastStatus: string | null;
}

export interface CatalogOverview {
  mes: MesCatalog[];
  external: ExternalCatalog[];
  /** Không đọc được danh mục BRAVO (chưa có MES_Sync…): vẫn dùng được danh mục MES */
  externalError: string | null;
  /** ĐVCS (trừ đơn vị tổng hợp, kể cả đang tắt) cho ô lọc, ô chọn đơn vị của Nhà máy SX */
  branches: { code: string; name: string; isActive: boolean }[];
}

export interface CatalogItem {
  id: number;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface CatalogShift {
  id: number;
  code: string;
  name: string;
  description: string | null;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  workMinutes: number;
  overnight: boolean;
  sortOrder: number;
  isActive: boolean;
}

export interface ExternalRows {
  total: number;
  page: number;
  pageSize: number;
  columns: { name: string; type: string; key: boolean }[];
  rows: (string | number | boolean | null)[][];
}

// ---------- Lịch làm việc theo ĐVCS (phase 5.12) ----------

export interface WorkCalendarConfig {
  /** Thứ nghỉ hằng tuần theo ISO: 1 = thứ Hai … 7 = Chủ nhật */
  weeklyOffDays: number[];
  outStartOffsetDays: number;
  outEndOffsetDays: number;
  warehouseStartOffsetDays: number;
  warehouseEndOffsetDays: number;
  /** Ngưỡng làm tròn Số ngày SX (0,01–1; MES_Core/0014) */
  productionRoundUpFrom: number;
}

export interface WorkCalendarItem extends WorkCalendarConfig {
  branchCode: string;
  branchName: string;
  branchActive: boolean;
  /** false: chưa có lịch riêng, đang dùng lịch mặc định */
  configured: boolean;
  dayCount: number;
}

export interface WorkCalendarList {
  defaults: WorkCalendarConfig;
  items: WorkCalendarItem[];
}

export interface WorkCalendarDayRow {
  id: number;
  date: string;
  dayType: 'OFF' | 'WORK';
  name: string | null;
}
