# ADR 0004 – Phiên đăng nhập gắn với token, trần quyền quản trị

**Trạng thái:** Accepted · **Ngày:** 09/10/2026 · **Nguồn:** review code Phase 1–4 (`docs/review/phase-1-4.md`)

## Bối cảnh
Lượt review bằng `code-reviewer` tìm ra các đường vượt quyền mà thiết kế ban đầu chưa chặn:
- Access token chỉ được kiểm chữ ký. Khi phiên bị thu hồi (đăng xuất, đặt lại mật khẩu), token còn hạn vẫn dùng được, và còn tạo được phiên mới qua `select-branch`.
- Đăng xuất đòi access token còn hạn. Token hết hạn thì cookie refresh không bị thu hồi, nên người dùng sau trên máy chung vào thẳng tài khoản người trước.
- Người giữ `admin.user:update` đặt lại được mật khẩu của admin. Người giữ `admin.permission:update` tạo được tài khoản phụ rồi gán vai trò ADMIN cho nó.

## Quyết định

### Phiên
- Access token mang `sid` (`SysUserSession.Id`). `AuthGuard` kiểm phiên chưa bị thu hồi ở mỗi request: thu hồi phiên thì token mất hiệu lực ngay, không chờ hết hạn.
- Token tạm (sau `login`) mang dấu vết mật khẩu `pwh`. Đặt lại mật khẩu thì token tạm cũ không chọn nhà máy được nữa.
- `POST /auth/logout` là `@Public`, thu hồi phiên theo cookie refresh (`SameSite=Strict`, path `/api/v1/auth`). Đăng xuất được kể cả khi access token đã hết hạn.
- Xoay refresh token có điều kiện theo hash cũ: hai request dùng cùng một token thì chỉ một request thành công.
- Đổi nhà máy bằng access token thì thu hồi phiên hiện tại rồi tạo phiên mới.
- `trust proxy` chỉ bật khi khai báo `TRUST_PROXY`. IP ghi nhật ký phải đúng định dạng IP. Mặc định không tin `X-Forwarded-For`.

### Trần quyền quản trị
- Người thao tác chỉ cấp, gỡ, hoặc quản lý những quyền nhóm `admin.*` mà **chính mình đang có**. Áp cho:
  - gán vai trò cho người dùng;
  - sửa ma trận quyền của vai trò;
  - bật, tắt, xóa vai trò;
  - đặt lại mật khẩu, tắt hoặc bật, gán vai trò hoặc nhà máy cho người dùng đang giữ quyền quản trị.
- Quyền nghiệp vụ (`order.*`, `report.*`…) **không** bị giới hạn theo người thao tác. Cấp quyền nghiệp vụ là việc của người giữ `admin.permission:update`. Vai trò ADMIN trong seed không có quyền ghi nghiệp vụ (tách nhiệm vụ) mà vẫn phải sửa được ma trận của vai trò Kế hoạch. (Từ 12/10/2026 tài khoản `admin` có thêm vai trò Toàn quyền, ADR 0014; vai trò ADMIN giữ nguyên.)
- Chặn tự nâng quyền ở cả hai chiều: không tắt, cũng không **bật lại**, vai trò mình đang giữ. Không tự đặt lại mật khẩu của mình ở màn quản trị.
- Mọi thay đổi phân quyền ghi `SysAuditLog` và tăng `PermissionVersion` **trong cùng transaction** với thay đổi. Ghi nhật ký lỗi thì hủy cả thay đổi.

## Hệ quả
- Mỗi request có thêm một truy vấn theo khóa chính vào `SysUserSession`. Chấp nhận được ở quy mô hiện tại; khi cần thì cache vài giây.
- Token cấp trước thay đổi này không có `sid`, bị từ chối một lần, rồi frontend tự refresh để lấy token mới.
- Người giữ `admin.permission:update` vẫn cấp được mọi quyền nghiệp vụ, kể cả cho tài khoản phụ do mình tạo. Đây là quyền rất mạnh, chỉ nên giao cho quản trị viên tin cậy. Muốn giới hạn hơn (theo nhóm module, theo nhà máy) thì làm ở Phase 5.1 cùng ngoại lệ theo người dùng.
