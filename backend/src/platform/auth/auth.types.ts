import type { UserAccess } from '../permission/permission.service';

export type TokenType = 'pre' | 'access';

export interface JwtClaims {
  sub: number;
  usr: string;
  typ: TokenType;
  /** BranchCode đã chọn (chỉ có ở access token). Server cấp, client không tự đặt. */
  br?: string;
  /** SysUserSession.Id (chỉ có ở access token): thu hồi phiên thì token hết hiệu lực ngay, không chờ hết hạn. */
  sid?: string;
  /** Dấu vết mật khẩu (chỉ có ở token tạm): đặt lại mật khẩu thì token tạm cũ không chọn nhà máy được nữa. */
  pwh?: string;
}

export interface AuthUser {
  userId: number;
  username: string;
  tokenType: TokenType;
  branchCode?: string;
  sessionId?: string;
  passwordMark?: string;
  /** Tra từ SysBranch ở mỗi request, không lấy từ token. */
  isAggregate: boolean;
  /** Quyền và phạm vi tại nhà máy của phiên, AuthGuard tính một lần cho mỗi request (access token). */
  access?: UserAccess;
  /** IP của request (đã kiểm định dạng), cho nhật ký. */
  ip?: string | null;
}

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}
