export interface Branch {
  code: string;
  name: string;
  isAggregate: boolean;
}

export interface UserInfo {
  id: number;
  username: string;
  fullName: string;
}

export interface RoleInfo {
  code: string;
  name: string;
}

export interface MenuNode {
  code: string;
  name: string;
  icon: string | null;
  path: string | null;
  isMobile: boolean;
  children: MenuNode[];
}

export interface LoginResponse {
  preAuthToken: string;
  user: { id: number; fullName: string };
  branches: Branch[];
}

export interface SelectBranchResponse {
  accessToken: string;
  expiresIn: number;
  branch: Branch;
}

/** Nhà máy SX được tích cho người dùng (ADR 0013) */
export interface ProductionFactory {
  code: string;
  name: string;
  branchCode: string | null;
}

export interface MeResponse {
  user: UserInfo;
  branch: Branch | null;
  roles: RoleInfo[];
  /** Không có ở máy chủ cũ hơn Phase 5.9 */
  productionFactories?: ProductionFactory[];
  permissionVersion: number;
}

export interface PermissionsResponse {
  version: number;
  /** Dấu phiên bản quyền, khớp header X-Permission-Version */
  stamp: string;
  permissions: string[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type AccessLevel = 'HIDDEN' | 'MASKED' | 'READONLY' | 'EDITABLE';

export interface FieldPoliciesResponse {
  version: number;
  resources: Record<string, Record<string, AccessLevel>>;
}

export interface LineInfo {
  code: string;
  name: string;
  branchCode: string;
  /** false: chuyền đã ngừng dùng (chỉ gặp ở dữ liệu đã xếp, ví dụ hàng của bảng dàn chuyền) */
  isActive?: boolean;
  /** Xưởng của chuyền (Danh mục hệ thống › Chuyền may); null: chuyền nằm thẳng dưới nhà máy */
  workshopCode?: string | null;
  workshopName?: string | null;
}
