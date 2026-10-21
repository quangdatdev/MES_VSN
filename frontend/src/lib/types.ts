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

/** Nhà máy SX thuộc đơn vị cơ sở của phiên (quyết định 6.3) */
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

/** Chuyền may (GET /me/lines): bộ phận tích "Xưởng sản xuất" ở Sơ đồ tổ chức (phase 5.10); mã chuyền là mã bộ phận */
export interface LineInfo {
  code: string;
  name: string;
  branchCode: string;
  /** false: bộ phận chuyền đã giải thể (chỉ gặp ở dữ liệu đã xếp, ví dụ hàng của bảng dàn chuyền); bỏ tích thì không còn là chuyền */
  isActive?: boolean;
  /** Bộ phận cha của chuyền, để ô chọn gom nhóm; null: chuyền nằm ở gốc cây phòng ban */
  workshopCode?: string | null;
  workshopName?: string | null;
  /** Bộ phận cha từ gốc cây phòng ban tới bộ phận cha trực tiếp (ô Đơn vị phòng ban của Kế hoạch may) */
  ancestors?: { code: string; name: string }[];
}
