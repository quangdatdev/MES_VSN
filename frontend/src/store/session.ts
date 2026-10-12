import { create } from 'zustand';
import type { AccessLevel, Branch, MenuNode, ProductionFactory, RoleInfo, UserInfo } from '../lib/types';

/**
 * Trạng thái phiên chỉ nằm trong bộ nhớ (không lưu localStorage).
 * Frontend chỉ dùng quyền/menu để ẩn hiện; quyết định thật nằm ở Backend.
 */
export type SessionStatus = 'booting' | 'anonymous' | 'preauth' | 'ready';

interface SessionState {
  status: SessionStatus;
  accessToken: string | null;
  preAuthToken: string | null;
  /** Danh sách nhà máy được chọn (từ login hoặc /me/branches) */
  choices: Branch[];
  pendingName: string | null;
  /** Người vừa qua bước mật khẩu (token tạm), để chọn sẵn nhà máy lần trước của đúng người đó */
  pendingUserId: number | null;
  /** Lý do phiên vừa kết thúc, hiện ở màn đăng nhập (bị đẩy ra, đăng xuất chưa báo được máy chủ). */
  notice: string | null;
  user: UserInfo | null;
  branch: Branch | null;
  roles: RoleInfo[];
  /** Nhà máy SX thuộc ĐVCS của phiên: popup Chọn mã hàng của kế hoạch xuất hàng chỉ có đơn hàng của các nhà máy này (máy chủ lọc) */
  productionFactories: ProductionFactory[];
  permissions: Set<string>;
  permissionVersion: number | null;
  /** Dấu phiên bản quyền (version + mốc hết hạn), so với header X-Permission-Version để biết khi nào tải lại */
  permissionStamp: string | null;
  menu: MenuNode[];
  /** Mức của từng cột theo tài nguyên (L4). Chỉ để ẩn cột, hiện ***, khóa ô; backend vẫn lọc. */
  fieldPolicies: Record<string, Record<string, AccessLevel>>;
  /**
   * Số lần người dùng tự đổi nhà máy trong phiên: màn đang mở dựng lại từ đầu theo số này (đã hỏi lại phần chưa lưu).
   * Tab khác đổi nhà máy thì không tăng: màn giữ phần đang nhập, lệnh ghi bị chặn bằng BRANCH_CHANGED.
   */
  switchCount: number;
  set: (patch: Partial<Omit<SessionState, 'set' | 'reset'>>) => void;
  reset: (status?: SessionStatus, notice?: string | null) => void;
}

const empty = {
  accessToken: null,
  preAuthToken: null,
  choices: [] as Branch[],
  pendingName: null,
  pendingUserId: null,
  notice: null,
  user: null,
  branch: null,
  roles: [] as RoleInfo[],
  productionFactories: [] as ProductionFactory[],
  permissions: new Set<string>(),
  permissionVersion: null,
  permissionStamp: null,
  menu: [] as MenuNode[],
  fieldPolicies: {} as Record<string, Record<string, AccessLevel>>,
  switchCount: 0,
};

export const useSession = create<SessionState>((set) => ({
  status: 'booting',
  ...empty,
  set: (patch) => set(patch),
  reset: (status = 'anonymous', notice = null) => set({ ...empty, permissions: new Set<string>(), status, notice }),
}));
