import type { ColumnType, Generated } from 'kysely';

type Id = Generated<number>;
type Created = ColumnType<Date, Date | undefined, never>;
type Audit = {
  CreatedAt: Created;
  CreatedBy: number | null;
  ModifiedAt: Date | null;
  ModifiedBy: number | null;
};

export interface SysBranchTable extends Audit {
  Id: Id;
  Code: string;
  Name: string;
  Description: string | null;
  IsAggregate: boolean;
  SortOrder: number;
  IsActive: boolean;
  IsSystem: boolean;
}

export interface SysUserTable extends Audit {
  Id: Id;
  Username: string;
  PasswordHash: string;
  FullName: string;
  Email: string | null;
  EmployeeCode: string | null;
  FailedLoginCount: number;
  LockedUntilAt: Date | null;
  LastLoginAt: Date | null;
  IsActive: boolean;
}

export interface SysUserBranchTable {
  Id: Id;
  UserId: number;
  BranchId: number;
  IsDefault: boolean;
  CreatedAt: Created;
  CreatedBy: number | null;
}

export interface SysRoleTable extends Audit {
  Id: Id;
  Code: string;
  Name: string;
  Description: string | null;
  SortOrder: number;
  IsActive: boolean;
  IsSystem: boolean;
}

export interface SysUserRoleTable {
  Id: Id;
  UserId: number;
  RoleId: number;
  ValidFromAt: Date | null;
  ValidToAt: Date | null;
  CreatedAt: Created;
  CreatedBy: number | null;
}

export interface SysResourceTable extends Audit {
  Id: Id;
  Code: string;
  Name: string;
  ModuleCode: string;
  ScopeType: 'BRANCH' | 'SHARED';
  SourceTable: string | null;
  Description: string | null;
  SortOrder: number;
  IsActive: boolean;
  IsSystem: boolean;
}

export interface SysPermissionTable extends Audit {
  Id: Id;
  Code: string;
  ResourceId: number;
  ActionCode: string;
  Name: string;
  Description: string | null;
  SortOrder: number;
  IsActive: boolean;
  IsSystem: boolean;
}

export interface SysRolePermissionTable {
  Id: Id;
  RoleId: number;
  PermissionId: number;
  CreatedAt: Created;
  CreatedBy: number | null;
}

export interface SysMenuTable extends Audit {
  Id: Id;
  Code: string;
  Name: string;
  ParentId: number | null;
  Path: string | null;
  Icon: string | null;
  ResourceId: number | null;
  IsMobile: boolean;
  Description: string | null;
  SortOrder: number;
  IsActive: boolean;
  IsSystem: boolean;
}

export interface SysUserSessionTable {
  Id: Generated<string>;
  UserId: number;
  RefreshTokenHash: string;
  BranchCode: string | null;
  IssuedAt: Created;
  ExpiresAt: Date;
  RevokedAt: Date | null;
  IpAddress: string | null;
  UserAgent: string | null;
}

export interface SysPermissionVersionTable {
  Id: number;
  Version: string;
  ModifiedAt: Date;
}

export interface SysAuditLogTable {
  Id: Generated<string>;
  EventAt: Created;
  UserId: number | null;
  Username: string | null;
  BranchCode: string | null;
  EntityType: string;
  EntityId: string | null;
  ActionCode: string;
  OldValue: string | null;
  NewValue: string | null;
  IpAddress: string | null;
}

/** Cấp của cây tổ chức (quyết định 6.4): Nhà máy → Xưởng → Chuyền; chuyền cũng được nằm thẳng dưới nhà máy */
export type OrgType = 'FACTORY' | 'WORKSHOP' | 'LINE';
export type ScopeMode = 'ALL' | 'ORG_SUBTREE' | 'LIST' | 'OWN';
export type AccessLevel = 'HIDDEN' | 'MASKED' | 'READONLY' | 'EDITABLE';

export interface SysOrgUnitTable extends Audit {
  Id: Id;
  Code: string;
  Name: string;
  Description: string | null;
  OrgType: OrgType;
  ParentId: number | null;
  /** Loại của nút cha (khóa ngoại ghép giữ đúng), NULL ở nút nhà máy */
  ParentOrgType: OrgType | null;
  BranchCode: string;
  Path: string;
  SortOrder: number;
  IsActive: boolean;
  IsSystem: boolean;
}

export interface SysScopeDimensionTable extends Audit {
  Id: Id;
  Code: string;
  Name: string;
  Description: string | null;
  OrgType: OrgType | null;
  SortOrder: number;
  IsActive: boolean;
  IsSystem: boolean;
}

export interface SysResourceScopeBindingTable {
  Id: Id;
  ResourceId: number;
  DimensionId: number;
  ColumnName: string;
  CreatedAt: Created;
  CreatedBy: number | null;
}

export interface SysUserRoleScopeTable {
  Id: Id;
  UserRoleId: number;
  DimensionId: number;
  ScopeMode: ScopeMode;
  OrgUnitId: number | null;
  ScopeValue: string | null;
  CreatedAt: Created;
  CreatedBy: number | null;
}

export interface SysResourceFieldTable extends Audit {
  Id: Id;
  ResourceId: number;
  Code: string;
  Name: string;
  Description: string | null;
  IsSensitive: boolean;
  SortOrder: number;
  IsActive: boolean;
  IsSystem: boolean;
}

export interface SysFieldPolicyTable {
  Id: Id;
  SubjectType: 'ROLE' | 'USER';
  SubjectId: number;
  ResourceId: number;
  FieldCode: string;
  AccessLevel: AccessLevel;
  ValidFromAt: Date | null;
  ValidToAt: Date | null;
  Reason: string | null;
  CreatedAt: Created;
  CreatedBy: number | null;
}

export interface SysUserPermissionOverrideTable {
  Id: Id;
  UserId: number;
  PermissionId: number;
  Effect: 'ALLOW' | 'DENY';
  ValidFromAt: Date | null;
  ValidToAt: Date | null;
  Reason: string;
  CreatedAt: Created;
  CreatedBy: number | null;
}

export interface SysSensitiveReadLogTable {
  Id: Generated<string>;
  ReadAt: Created;
  UserId: number | null;
  Username: string | null;
  BranchCode: string | null;
  ResourceCode: string;
  FieldCodes: string;
  RecordCount: number;
  ActionCode: 'VIEW' | 'EXPORT';
  IpAddress: string | null;
}

/** Loại danh mục đơn giản (mã, tên): UNIT, ORDER_TYPE… (migration MES_Core 0003) */
export interface SysCatalogTable extends Audit {
  Id: Id;
  Code: string;
  Name: string;
  Description: string | null;
  SortOrder: number;
  IsActive: boolean;
  IsSystem: boolean;
}

export interface SysCatalogItemTable extends Audit {
  Id: Id;
  CatalogId: number;
  Code: string;
  Name: string;
  Description: string | null;
  SortOrder: number;
  IsActive: boolean;
  IsSystem: boolean;
}

/** Nhà máy SX (MES_Core/0007, quyết định 6.2): mỗi nhà máy thuộc một Đơn vị cơ sở; mã lưu ở SalesOrder.ProductionFactoryCode */
export interface SysProductionFactoryTable extends Audit {
  Id: Id;
  Code: string;
  Name: string;
  /** ĐVCS quản lý (SysBranch.Code, không phải đơn vị tổng hợp). NULL: chưa gắn */
  BranchCode: string | null;
  Description: string | null;
  SortOrder: number;
  IsActive: boolean;
  IsSystem: boolean;
}

/** Nhà máy SX từng được tích cho người dùng. Không còn dùng từ quyết định 6.3 (lọc theo nhà máy của ĐVCS); giữ bảng, chờ xóa */
export interface SysUserProductionFactoryTable {
  Id: Id;
  UserId: number;
  ProductionFactoryId: number;
  CreatedAt: Created;
  CreatedBy: number | null;
}

/** Ca làm việc. Cột TIME đọc ra Date ngày 1970-01-01 giờ UTC, ghi vào bằng chuỗi "HH:mm" */
export interface SysShiftTable extends Audit {
  Id: Id;
  Code: string;
  Name: string;
  Description: string | null;
  StartTime: ColumnType<Date, string, string>;
  EndTime: ColumnType<Date, string, string>;
  BreakMinutes: number;
  SortOrder: number;
  IsActive: boolean;
  IsSystem: boolean;
}

/** Lịch làm việc của một ĐVCS (MES_Core/0011, phase 5.12). ĐVCS chưa có dòng dùng lịch mặc định (work-calendar.ts) */
export interface SysWorkCalendarTable extends Audit {
  Id: Id;
  BranchCode: string;
  /** Ngày nghỉ hằng tuần, mỗi thứ một bit: 1 = thứ Hai … 64 = Chủ nhật */
  WeeklyOffMask: number;
  OutStartOffsetDays: number;
  OutEndOffsetDays: number;
  WarehouseStartOffsetDays: number;
  WarehouseEndOffsetDays: number;
  /** DECIMAL(3,2), MES_Core/0014: ngưỡng làm tròn Số ngày SX */
  ProductionRoundUpFrom: Generated<number>;
}

/** Ngày đặc biệt của lịch: OFF nghỉ (lễ, Tết), WORK làm bù. Cột DATE đọc ra Date lúc 00:00 UTC */
export interface SysWorkCalendarDayTable extends Audit {
  Id: Id;
  WorkCalendarId: number;
  CalendarDate: ColumnType<Date, string, string>;
  DayType: 'OFF' | 'WORK';
  Name: string | null;
}

export interface CoreDatabase {
  SysCatalog: SysCatalogTable;
  SysCatalogItem: SysCatalogItemTable;
  SysShift: SysShiftTable;
  SysWorkCalendar: SysWorkCalendarTable;
  SysWorkCalendarDay: SysWorkCalendarDayTable;
  SysProductionFactory: SysProductionFactoryTable;
  SysUserProductionFactory: SysUserProductionFactoryTable;
  SysOrgUnit: SysOrgUnitTable;
  SysScopeDimension: SysScopeDimensionTable;
  SysResourceScopeBinding: SysResourceScopeBindingTable;
  SysUserRoleScope: SysUserRoleScopeTable;
  SysResourceField: SysResourceFieldTable;
  SysFieldPolicy: SysFieldPolicyTable;
  SysUserPermissionOverride: SysUserPermissionOverrideTable;
  SysSensitiveReadLog: SysSensitiveReadLogTable;
  SysBranch: SysBranchTable;
  SysUser: SysUserTable;
  SysUserBranch: SysUserBranchTable;
  SysRole: SysRoleTable;
  SysUserRole: SysUserRoleTable;
  SysResource: SysResourceTable;
  SysPermission: SysPermissionTable;
  SysRolePermission: SysRolePermissionTable;
  SysMenu: SysMenuTable;
  SysUserSession: SysUserSessionTable;
  SysPermissionVersion: SysPermissionVersionTable;
  SysAuditLog: SysAuditLogTable;
}
