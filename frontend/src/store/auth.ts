import { api, duringBranchSwitch, endSession, onBranchChanged, onPermissionVersionChange, refreshSession } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import type { Branch, FieldPoliciesResponse, LoginResponse, MeResponse, MenuNode, PermissionsResponse, SelectBranchResponse } from '../lib/types';
import { useSession } from './session';

const s = () => useSession.getState();

/** Người dùng, menu, quyền, chính sách cột của phiên mang `token` (mặc định: token đang dùng), dạng gán thẳng vào store */
async function fetchAccess(token?: string) {
  const opts = token === undefined ? {} : { token };
  const [me, menu, perms, fields] = await Promise.all([
    api<MeResponse>('/me', opts),
    api<MenuNode[]>('/me/menu', opts),
    api<PermissionsResponse>('/me/permissions', opts),
    api<FieldPoliciesResponse>('/me/field-policies', opts),
  ]);
  return {
    status: 'ready' as const,
    user: me.user,
    branch: me.branch,
    roles: me.roles,
    menu,
    permissions: new Set(perms.permissions),
    permissionVersion: perms.version,
    permissionStamp: perms.stamp,
    fieldPolicies: fields.resources,
    preAuthToken: null,
    choices: [],
    notice: null,
  };
}

/** Nạp thông tin người dùng, menu và quyền sau khi đã có access token. */
export async function loadAccess() {
  const access = await fetchAccess();
  // Trong lúc chờ, phiên có thể đã đổi (đổi nhà máy, đăng xuất): kết quả cũ không được đè lên phiên mới.
  const now = s();
  if (now.status === 'anonymous' || (now.branch && now.branch.code !== access.branch?.code)) return;
  s().set(access);
}

/** Khi mở lại trang: thử khôi phục phiên bằng cookie refresh. */
export async function bootstrap() {
  if ((await refreshSession()).ok) {
    try {
      await loadAccess();
      return;
    } catch {
      /* rơi xuống anonymous */
    }
  }
  s().reset('anonymous');
}

export async function login(username: string, password: string) {
  const r = await api<LoginResponse>('/auth/login', { method: 'POST', body: { username, password }, token: null, noRefresh: true });
  s().set({ status: 'preauth', preAuthToken: r.preAuthToken, choices: r.branches, pendingName: r.user.fullName, notice: null });
  return r;
}

let switching = false;

/**
 * Chọn hoặc đổi nhà máy. Sau khi chọn, server cấp access token mang BranchCode. Menu, quyền, chính sách cột nạp bằng token
 * mới rồi mới đổi phiên một lần: màn đang mở không dựng lại theo quyền của nhà máy cũ. `applied` chạy ngay sau khi đổi,
 * cùng một lần vẽ (điều hướng theo menu mới). Trả `false` khi phiên đã kết thúc giữa chừng (đăng xuất, nạp quyền lỗi):
 * bên gọi không báo đổi thành công.
 */
export async function selectBranch(branch: Branch, applied?: () => void): Promise<boolean> {
  const state = s();
  switching = true;
  try {
    // Truy vấn đang chạy của màn cũ không cần nữa (bộ đệm sẽ xóa): hủy để ít request bị phiên cũ (đã thu hồi) chặn
    if (state.status === 'ready') await queryClient.cancelQueries();
    const work = async () => {
      const r = await api<SelectBranchResponse>(
        '/auth/select-branch',
        // Đang làm việc (đổi nhà máy): để api() tự làm mới token nếu đã hết hạn. Token tạm thì không làm mới được.
        state.status === 'preauth'
          ? { method: 'POST', body: { branchCode: branch.code }, token: state.preAuthToken, noRefresh: true }
          : { method: 'POST', body: { branchCode: branch.code } },
      );
      try {
        return { r, access: await fetchAccess(r.accessToken) };
      } catch (e) {
        // Máy chủ đã chuyển phiên (cookie refresh) sang nhà máy mới mà chưa nạp được quyền: giữ phiên cũ trên màn sẽ lệch
        // với máy chủ, nên kết thúc phiên kèm lý do. Phiên đã kết thúc (nhà máy bị thu hồi: api() đã ghi lý do) thì để
        // nguyên. Lúc đăng nhập (token tạm) thì chưa có gì để lệch: chọn lại được.
        if (state.status === 'ready' && s().status === 'ready') {
          const why = e instanceof TypeError ? ' (mất kết nối)' : '';
          endSession(`Đã chuyển sang ${r.branch.name} nhưng chưa tải được menu và quyền${why}. Hãy đăng nhập lại.`);
        }
        throw e;
      }
    };
    const { r, access } = state.status === 'ready' ? await duringBranchSwitch(work) : await work();
    if (s().status === 'anonymous') {
      // Đăng xuất trong lúc đang đổi: lệnh đăng xuất có thể đã dùng cookie cũ, cookie lúc này là của phiên mới. Thu hồi nốt.
      void api('/auth/logout', { method: 'POST', token: null, noRefresh: true }).catch(() => undefined);
      return false;
    }
    queryClient.clear();
    s().set({ ...access, accessToken: r.accessToken, switchCount: s().switchCount + 1 });
    applied?.();
    return true;
  } finally {
    switching = false;
  }
}

export async function fetchBranchChoices() {
  const list = await api<Branch[]>('/me/branches');
  s().set({ choices: list });
  return list;
}

/** Đăng xuất dựa vào cookie refresh, nên vẫn thu hồi được phiên khi access token đã hết hạn. */
export async function logout() {
  let notice: string | null = null;
  try {
    await api('/auth/logout', { method: 'POST', token: null, noRefresh: true });
  } catch {
    notice = 'Chưa báo được máy chủ để đăng xuất (mất kết nối). Nếu đây là máy dùng chung, hãy đóng trình duyệt.';
  }
  queryClient.clear();
  s().reset('anonymous', notice);
}

// Quyền đổi trên server (header X-Permission-Version) => tải lại menu, quyền và dữ liệu đang hiển thị.
let reloading = false;
onPermissionVersionChange((stamp) => {
  const { status, permissionStamp } = s();
  if (status !== 'ready' || permissionStamp === null || stamp === permissionStamp || reloading || switching) return;
  reloading = true;
  loadAccess()
    .then(() => queryClient.invalidateQueries())
    .catch(() => undefined)
    .finally(() => (reloading = false));
});

// Tab khác đã đổi nhà máy (cookie dùng chung): nạp lại menu, quyền theo nhà máy mới.
onBranchChanged(() => {
  void loadAccess().catch(() => undefined);
});
