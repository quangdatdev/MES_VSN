# Phân quyền, đăng nhập và phiên

File này mô tả cách MES xác thực người dùng, giữ phiên, gắn phiên với một Đơn vị cơ sở (ĐVCS) và cưỡng chế phân quyền 5 lớp ở backend: token, guard, `PermissionService`, `BaseRepository`, chính sách cột, ngoại lệ, trần quyền quản trị, nhật ký.
Đọc trước khi sửa `backend/src/platform/auth`, `platform/permission`, `platform/data`, các API quản trị phân quyền, hoặc khi viết repository cho module mới.
API `/admin/*`, `/me`, các màn Quản trị và bảng `SysBranch`, `SysOrgUnit`: [Quản trị hệ thống](05-quan-tri-he-thong.md). Ma trận quyền mẫu, tài khoản mẫu: [Dữ liệu mẫu và kiểm thử](12-du-lieu-mau-va-kiem-thu.md). Thuật ngữ (ĐVCS, Nhà máy SX, `A00`): [Tổng quan](../PROJECT_OVERVIEW.md).

## Mục lục

1. [Tổng quan](#tong-quan)
2. [Đăng nhập và phiên](#dang-nhap-va-phien)
3. [ĐVCS và đơn vị tổng hợp A00](#dvcs-va-a00)
4. [Quyền theo vai trò (L2) và menu động](#quyen-theo-vai-tro)
5. [Guard, decorator, UserAccess, phiên bản quyền](#guard-va-decorator)
6. [BaseRepository và Resource Registry](#base-repository)
7. [Phạm vi theo phép gán (L3)](#pham-vi)
8. [Chính sách cột (L4)](#chinh-sach-cot)
9. [Ngoại lệ theo người (L5)](#ngoai-le-theo-nguoi)
10. [Trần quyền quản trị, cấm tự nâng quyền](#tran-quyen-quan-tri)
11. [Vai trò Toàn quyền](#vai-tro-toan-quyen)
12. [Nhật ký](#nhat-ky)
13. [Mã lỗi](#ma-loi)
14. [API `/auth`](#api-auth)
15. [Frontend phản chiếu quyền](#frontend)
16. [Bảng `MES_Core` của phần phân quyền](#bang-mes-core)
17. [Test bảo vệ các luật](#test)

<a id="tong-quan"></a>
## 1. Tổng quan

### Luật không được vi phạm

Luật bắt buộc nằm ở [AGENTS.md](../../AGENTS.md) mục 4 (nguồn duy nhất). File này mô tả cơ chế cưỡng chế từng luật. Ba chi tiết cưỡng chế cần nhớ:

- Không có quyền được cấp rõ ràng thì từ chối; phạm vi không hiểu được thì coi là tập rỗng, không bao giờ là "không giới hạn" (mục 6.3).
- `branchCode` trong body của `POST /auth/select-branch` là *yêu cầu chọn*, server kiểm với `SysUserBranch` rồi mới cấp token (ADR 0002). Một số API quản trị, danh mục nhận mã ĐVCS làm giá trị dữ liệu, không phải phạm vi của phiên: ĐVCS của phòng ban (`backend/src/modules/hr/hr.dto.ts`), của Nhà máy SX và lịch làm việc theo ĐVCS (`backend/src/platform/catalog/catalog.dto.ts`, `catalog.controller.ts`), ĐVCS để xem quyền hiệu lực (`backend/src/platform/admin/admin.dto.ts`). Bộ lọc theo ĐVCS trên màn (lọc theo cột `branchCode` qua `cf`, tham số `branch` của Kế hoạch chuẩn bị SX ở `backend/src/modules/sewing/sewing.dto.ts`) chỉ thu hẹp trong các dòng phiên đã xem được.
- Mọi thay đổi phân quyền ghi `SysAuditLog` và tăng `SysPermissionVersion` trong cùng transaction với thay đổi; ghi nhật ký lỗi thì hủy cả thay đổi (ADR 0004, mục 12). Đăng nhập, đăng xuất, chọn ĐVCS cũng ghi nhật ký.

### Năm lớp

| Lớp | Câu hỏi | Dữ liệu | Nơi cưỡng chế |
|---|---|---|---|
| L1 Xác thực | Bạn là ai, phiên còn không? | `SysUser`, `SysUserSession` | `AuthService`, `AuthGuard` (`backend/src/platform/auth`) |
| Lọc ĐVCS | Đang làm việc ở ĐVCS nào? | `SysBranch`, `SysUserBranch`, claim `br` của token | `AuthGuard`, `BaseRepository` |
| L2 Chức năng | Được làm hành động gì trên tài nguyên nào? | `SysRole`, `SysUserRole`, `SysResource`, `SysPermission`, `SysRolePermission`, `SysMenu` | `PermissionService`, `PermissionGuard`, `MeService.menu` |
| L3 Phạm vi dữ liệu | Thấy, sửa những dòng nào? | `SysUserRoleScope`, `SysScopeDimension`, `SysResourceScopeBinding`, `SysOrgUnit` (nút ĐVCS), tập chuyền may (`OrgService`) | `PermissionService.grantOf`, `BaseRepository.limit` |
| L4 Cột | Thấy, sửa những cột nào? | `SysResourceField`, `SysFieldPolicy` | `FieldPolicyService`, `FieldPolicyInterceptor`, `ExportService` |
| L5 Ngoại lệ theo người | Trường hợp riêng của một người? | `SysUserPermissionOverride`, `SysFieldPolicy` loại `USER` | `PermissionService.compute`, `FieldPolicyService` |

Lọc ĐVCS chính là chiều phạm vi `FACTORY` lấy từ phiên: mọi tài nguyên `BRANCH` luôn bị lọc theo ĐVCS của phiên, phạm vi L3 chỉ thu hẹp thêm.

### Thứ tự kiểm trong một request

Thứ tự của NestJS: guard → interceptor (trước handler) → pipe → handler → interceptor (sau handler). Sơ đồ cả request: [Luồng dữ liệu](../DATA_FLOWS.md) mục 2.

1. `AuthGuard`: kiểm token, phiên, ĐVCS, tính `UserAccess` (quyền kèm phạm vi), gắn `req.authUser`.
2. `PermissionGuard`: endpoint phải khai báo, không thì 403 `ENDPOINT_NOT_DECLARED` (chỉ khi request tới đây với access token hợp lệ; thiếu hoặc sai token thì bước 1 đã trả 401); kiểm đủ các mã quyền của `@RequirePermission`.
3. `FieldPolicyInterceptor` (endpoint có `@FieldResource`): body thô của `POST`, `PUT`, `PATCH` có cột không được sửa thì 403 `FIELD_READONLY`. Chạy trước `ValidationPipe`, nên trường thừa trùng mã cột bị chặn cả khi DTO sẽ bỏ nó.
4. `ValidationPipe` (DTO, `whitelist: true`): sai thì 422 `VALIDATION_FAILED`.
5. Service gọi repository với `scopeOf(user)`: repository thêm điều kiện ĐVCS, phạm vi, chặn ghi ở `A00`.
6. `FieldPolicyInterceptor` lọc dữ liệu trả về: bỏ cột Ẩn, thay cột Che bằng `"***"`, ghi nhật ký đọc cột nhạy cảm.

<a id="dang-nhap-va-phien"></a>
## 2. Đăng nhập và phiên

### 2.1 Luồng đăng nhập (một form)

1. `POST /auth/login` với tên, mật khẩu. Đúng thì nhận `preAuthToken` (token tạm) và danh sách ĐVCS người dùng được chọn.
2. Giao diện giữ nguyên form: khóa hai ô tên, mật khẩu, mở ô chọn ĐVCS ngay bên dưới, chọn sẵn ĐVCS người này làm việc lần trước trên máy (localStorage `mes.branch.<userId>`). Một ĐVCS thì vào thẳng; không có ĐVCS nào thì báo nhờ quản trị gán (ADR 0013 mục 6; chi tiết giao diện ở [Giao diện](10-giao-dien.md)).
3. `POST /auth/select-branch` kèm `Authorization: Bearer <preAuthToken>` và `{ branchCode }`. Server kiểm lại rồi tạo phiên `SysUserSession`, trả `accessToken` và đặt cookie refresh.
4. Giao diện nạp song song `/me`, `/me/menu`, `/me/permissions`, `/me/field-policies` bằng token mới.
5. Access token chỉ nằm trong bộ nhớ của tab. Mở lại trang thì giao diện gọi `POST /auth/refresh` bằng cookie để lấy token mới.

Đăng nhập dùng tài khoản của MES (`SysUser`), mật khẩu băm argon2id (`argon2`). Chưa có API để người dùng tự đổi mật khẩu; quản trị đặt lại ở màn Người dùng.

### 2.2 Hai loại token

Cả hai là JWT ký bằng `JWT_SECRET` (`JwtModule.register` trong `backend/src/platform/auth/auth.module.ts`). Claim định nghĩa ở `JwtClaims` (`auth.types.ts`).

| Token | Cấp ở | Thời hạn | Claim | Dùng được ở |
|---|---|---|---|---|
| `preAuthToken` | `POST /auth/login` | `PRE_AUTH_TTL` giây (mặc định 300) | `sub` (Id người dùng), `usr` (tên đăng nhập), `typ = 'pre'`, `pwh` (dấu vết mật khẩu) | Chỉ endpoint có `@AllowPreAuth` (hiện chỉ `select-branch`); nơi khác 401 |
| `accessToken` | `select-branch`, `refresh` | `JWT_ACCESS_TTL` giây (mặc định 900) | `sub`, `usr`, `typ = 'access'`, `br` (mã ĐVCS), `sid` (`SysUserSession.Id`) | Mọi API cần đăng nhập |

- `pwh` là 16 ký tự đầu của SHA-256 của `PasswordHash`: đặt lại mật khẩu thì token tạm cũ không chọn ĐVCS được nữa, mà token không lộ hash.
- `sid`: thu hồi phiên thì access token còn hạn cũng hết dùng ngay (ADR 0004).
- Token tạm dùng được nhiều lần trong hạn; mỗi lần `select-branch` tạo một phiên mới.
- `NODE_ENV=production` bắt buộc có `JWT_SECRET` dài ít nhất 32 ký tự (`backend/src/config/env.ts`). Máy phát triển thiếu biến này thì dùng khóa ngẫu nhiên theo tiến trình: khởi động lại backend là mọi token cũ mất hiệu lực.

### 2.3 Cookie refresh

- Tên `mes_rt`, `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`, `Max-Age` = `REFRESH_TTL_DAYS` ngày (mặc định 7). `Secure` theo `COOKIE_SECURE`; để trống thì bật khi `NODE_ENV=production`. Demo chạy HTTP trong mạng nội bộ đặt `COOKIE_SECURE=false`.
- Giá trị là 48 byte ngẫu nhiên (base64url). Database chỉ lưu SHA-256 dạng hex ở `SysUserSession.RefreshTokenHash` (duy nhất).
- Mỗi phiên là một dòng `SysUserSession`, gắn đúng một ĐVCS (`BranchCode`). Mọi tab của một trình duyệt dùng chung cookie, nên dùng chung phiên.

### 2.4 `AuthGuard` kiểm gì ở mỗi request

`backend/src/platform/auth/auth.guard.ts`, guard toàn cục chạy trước `PermissionGuard`.

1. Endpoint `@Public` mà không có `@RequirePermission` (ở method hay class): cho qua, không đọc token.
2. Đọc `Authorization: Bearer <token>`. Thiếu: 401 `UNAUTHENTICATED`.
3. Kiểm chữ ký, hạn. Hết hạn: 401 `TOKEN_EXPIRED` (giao diện tự refresh). Sai: 401 `UNAUTHENTICATED`.
4. Token tạm: chỉ qua được endpoint có `@AllowPreAuth`, không thì 401. Không kiểm phiên.
5. Access token phải có `br`, `sid`; `SysUserSession` có `Id = sid`, đúng người, `RevokedAt IS NULL`. Không thì 401 "Phiên đăng nhập đã kết thúc".
6. Đọc `SysPermissionVersion`. Kiểm ĐVCS `br` còn hoạt động và còn trong `SysUserBranch` của người này (`BranchService.isAllowed`). Tính `UserAccess` tại ĐVCS đó (có cache, mục 5.4).
7. Tài khoản đã vô hiệu: 401 "Tài khoản đã bị vô hiệu hóa." ĐVCS không còn được phép: 403 `BRANCH_NOT_ALLOWED`.
8. Gắn `req.authUser` (`AuthUser`: `userId`, `username`, `branchCode`, `isAggregate` tra từ DB, `sessionId`, `access`, `ip`) và header `X-Permission-Version`.

### 2.5 Làm mới phiên

`POST /auth/refresh` (`@Public`, chỉ dùng cookie), `AuthService.refresh`:

- Không có cookie: 401. Phiên phải tồn tại theo hash, chưa thu hồi, chưa hết hạn, có `BranchCode`; tài khoản còn hoạt động; ĐVCS còn được phép (không thì 403 `BRANCH_NOT_ALLOWED`).
- **Xoay vòng refresh token mỗi lần dùng.** Câu UPDATE có điều kiện theo hash cũ và `RevokedAt IS NULL`: hai request cùng dùng một token thì chỉ một request thắng, request kia 401; phiên vừa bị đăng xuất chen giữa không được cấp token mới.
- `ExpiresAt` đặt lại bằng hiện tại cộng `REFRESH_TTL_DAYS`, nên phiên được dùng thường xuyên không hết hạn. `IpAddress` cập nhật theo request mới.
- Trả access token mới cùng ĐVCS và đặt cookie mới. Không ghi nhật ký.
- Lỗi dưới 500 thì xóa cookie; lỗi máy chủ (5xx) giữ cookie để thử lại.

### 2.6 Đăng xuất

`POST /auth/logout` là `@Public`, trả 204: xóa cookie, thu hồi phiên theo hash của cookie (`RevokedAt`), ghi `LOGOUT`. Không cần access token còn hạn, nên máy dùng chung vẫn đăng xuất được khi token đã hết hạn (ADR 0004). Không có cookie thì không làm gì.

### 2.7 Đổi ĐVCS

Dùng lại `POST /auth/select-branch`, lần này bằng access token. Danh sách ĐVCS để đổi lấy từ `GET /me/branches`.

- Server kiểm lại: tài khoản còn hoạt động; với token tạm thì `pwh` phải khớp mật khẩu hiện tại (không thì 401 "Mật khẩu đã được đổi"); ĐVCS mới đang hoạt động và có trong `SysUserBranch` (không thì 403 `BRANCH_NOT_ALLOWED`, ghi `SELECT_BRANCH_DENIED`).
- Thu hồi phiên hiện tại (`sid` của access token) và phiên của cookie đang gửi (nếu cùng người), rồi tạo phiên mới. Token cũ hết dùng ngay.
- Ghi `SELECT_BRANCH` với `BranchCode` là ĐVCS mới.
- Đổi ĐVCS là đổi phiên, không phải tham số lọc. Giao diện chặn request của màn cũ gửi trong lúc đổi, và không gửi lại request khi refresh trả về ĐVCS khác (tab khác vừa đổi): [Giao diện](10-giao-dien.md).

### 2.8 Khóa tài khoản do đăng nhập sai

`AuthService.login`:

- Sai mật khẩu: tăng `FailedLoginCount` bằng một câu UPDATE (nhiều request song song vẫn đếm đủ). Đạt `LOGIN_MAX_FAILED` (mặc định 5) thì đặt `LockedUntilAt` = hiện tại cộng `LOGIN_LOCK_MINUTES` (mặc định 15), đặt lại bộ đếm về 0, trả 423 `ACCOUNT_LOCKED` (`details.until`). Chưa đạt: 401 `INVALID_CREDENTIALS`. Ghi `LOGIN_FAILED` kèm `{ failed, locked }`.
- Đang khóa: trả 423 ngay, không kiểm mật khẩu, ghi `LOGIN_LOCKED`.
- Đúng mật khẩu: xóa bộ đếm, `LockedUntilAt`, ghi `LastLoginAt`, ghi `LOGIN`. Câu UPDATE chỉ chạy khi tài khoản không bị khóa trong lúc đang kiểm mật khẩu; bị khóa chen giữa thì 423.
- Tài khoản không tồn tại hoặc đã vô hiệu: vẫn băm argon2 một lần (thời gian phản hồi như tài khoản có thật), trả 401 `INVALID_CREDENTIALS`, ghi `LOGIN_FAILED` kèm `{ reason: 'unknown_or_inactive' }`.
- Mở khóa: tự hết sau thời hạn, hoặc quản trị mở (`PUT /admin/users/:id` với `unlock: true`, hoặc đặt lại mật khẩu): [Quản trị hệ thống](05-quan-tri-he-thong.md).
- Khóa chỉ chặn đăng nhập. Phiên đang có vẫn refresh được. Không có giới hạn số lần thử theo IP.

### 2.9 Khi nào phiên mất hiệu lực

| Sự kiện | Phiên | Ghi chú |
|---|---|---|
| Đăng xuất | Thu hồi phiên của cookie | Access token còn hạn của phiên đó bị 401 ngay |
| Đổi ĐVCS | Thu hồi phiên cũ, tạo phiên mới | |
| Quản trị đặt lại mật khẩu | Thu hồi mọi phiên của người đó | Token tạm cũ cũng hỏng (`pwh`) |
| Quản trị vô hiệu hóa tài khoản | Thu hồi mọi phiên | Bật lại tăng phiên bản quyền để cache "đã vô hiệu" không kẹt lại |
| Gỡ ĐVCS khỏi người dùng, tắt ĐVCS | Không thu hồi | Mọi request và refresh trên phiên đó trả 403 `BRANCH_NOT_ALLOWED`; giao diện kết thúc phiên |
| `npm run seed -- --reset-passwords` | Thu hồi phiên của tài khoản mẫu | [Vận hành](11-van-hanh.md) |
| `npm run reset:demo -- --yes` | Thu hồi mọi phiên | Chỉ máy demo |
| Phiên quá `ExpiresAt` | Refresh trả 401 | |
| Đổi quyền, vai trò, phạm vi | Không thu hồi | Quyền mới áp từ request kế tiếp (mục 5.4) |

### 2.10 IP trong nhật ký

`req.ip` chỉ tin `X-Forwarded-For` khi khai `TRUST_PROXY` (`main.ts` gọi `app.set('trust proxy', ...)`). IP phải đúng định dạng (`net.isIP`) mới được ghi; không thì để trống. `UserAgent` của phiên cắt còn 255 ký tự.

### 2.11 Biến môi trường

Đọc ở `backend/src/config/env.ts`. Danh sách đầy đủ và cách đặt: [Vận hành](11-van-hanh.md).

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `JWT_SECRET` | khóa ngẫu nhiên theo tiến trình (production bắt buộc, ≥ 32 ký tự) | Khóa ký token |
| `JWT_ACCESS_TTL` | `900` | Thời hạn access token (giây) |
| `PRE_AUTH_TTL` | `300` | Thời hạn token tạm (giây) |
| `REFRESH_TTL_DAYS` | `7` | Thời hạn phiên, cookie refresh (ngày, trượt theo mỗi lần refresh) |
| `LOGIN_MAX_FAILED` | `5` | Số lần sai liên tiếp thì khóa |
| `LOGIN_LOCK_MINUTES` | `15` | Thời gian khóa (phút) |
| `COOKIE_SECURE` | `true` khi `NODE_ENV=production`, còn lại `false` | Cờ `Secure` của cookie; cũng bật HSTS và `upgrade-insecure-requests` của helmet (`app.factory.ts`) |
| `TRUST_PROXY` | không tin proxy | Giá trị `trust proxy` của Express khi chạy sau reverse proxy |

<a id="dvcs-va-a00"></a>
<a id="bo-loc-dvcs"></a>
## 3. ĐVCS và đơn vị tổng hợp A00

### 3.1 ĐVCS của phiên

- `SysBranch` là danh mục ĐVCS (ADR 0013): các mã theo danh mục chi nhánh BRAVO cộng đơn vị tổng hợp `A00` của MES. Cột chuẩn của mọi bảng nghiệp vụ là `BranchCode` = `SysBranch.Code`, mã cấm sửa (trigger). Quản lý ĐVCS: [Quản trị hệ thống](05-quan-tri-he-thong.md).
- Người dùng chỉ chọn được ĐVCS đang hoạt động có trong `SysUserBranch` của mình, kể cả `A00`.
- `SysUserBranch.IsDefault` chỉ được lưu và hiện ở màn Người dùng. Đăng nhập không dùng cột này; giao diện chọn sẵn ĐVCS lần trước theo localStorage.
- Một phiên làm việc ở đúng một ĐVCS. Mọi đọc, ghi dữ liệu theo ĐVCS đó; muốn làm ở ĐVCS khác thì đổi phiên (mục 2.7).
- Cờ tổng hợp lấy từ `SysBranch.IsAggregate` qua `BranchService` (cache 30 giây trong tiến trình), không lấy từ token hay client.

### 3.2 Bốn loại tài nguyên theo ĐVCS

| Loại | Khai báo | Đọc | Ghi | Tài nguyên hiện có |
|---|---|---|---|---|
| Theo ĐVCS | `SysResource.ScopeType = 'BRANCH'`, bảng có cột `BranchCode` có index | `BranchCode` = ĐVCS của phiên; ở `A00` không lọc ĐVCS, chỉ lọc theo phạm vi | Tạo: `BranchCode` = ĐVCS của phiên. Sửa, xóa: chỉ dòng của ĐVCS phiên. `A00`: 403 | `order.shipment`, `order.lineplan` (`ShipmentPlan`), `order.colorsize` (`ShipmentPlanLine`), `order.prep` (`SewingPrep`), `cutting.progress` (`CuttingPlan`), `cutting.supply` (`CuttingSupply`), `sewing.plan` (`SewingDayPlan`) |
| Dùng chung | `ScopeType = 'SHARED'` | Không lọc ĐVCS | Không đóng dấu ĐVCS. Ghi được cả ở `A00` | `hr.orgchart` (`Department`), `hr.employee` (`Employee`) |
| Dùng chung có ĐVCS nguồn | `SHARED`, repository khai `originBranch = true`, bảng có `BranchCode` (ĐVCS nguồn) | Không lọc ĐVCS | Tạo: `BranchCode` = ĐVCS của phiên. Sửa, xóa: dòng của ĐVCS phiên hoặc của ĐVCS đang dùng dòng (`usedBy`). `A00`: 403 | `order.allocation` (`SalesOrder`), `order.po` (`SalesOrderPo`) |
| Dùng chung, ghi theo ĐVCS của nhà máy | `SHARED`, repository khai `factoryBranchWrite = true` và `productionFactoryColumn`, bảng không có `BranchCode` | Không lọc ĐVCS | Không tạo qua repository (dòng do hệ thống chép). Sửa, xóa: dòng mà không mã nhà máy nào đã gắn ĐVCS khác (mục 6.6). `A00`: 403 | `order.poallocation` (`PoAllocation`) |

Tài nguyên `SHARED` không có bảng nguồn (`SourceTable` trống) không đi qua `BaseRepository`: nhóm `admin.*` (API quản trị tự kiểm quyền bằng `@RequirePermission`). Tài nguyên chưa có màn thật (`cutting.embroidery`, `sewing.cluster`, `sewing.output`, `sewing.balance`, nhóm `qms.*`, `finishing.*`, `report.*`) có `ScopeType = 'BRANCH'` theo mặc định của seed nhưng chưa có bảng nguồn, chưa có repository.

### 3.3 Đơn vị tổng hợp A00

- Chỉ có một đơn vị tổng hợp (index duy nhất có lọc `UX_SysBranch_Aggregate`). Không vô hiệu hóa được. Mã `A00` dành riêng: không thêm tay ĐVCS mã `A00`, chép ĐVCS từ BRAVO bỏ qua mã trùng đơn vị tổng hợp.
- Không dòng dữ liệu nghiệp vụ nào mang `BranchCode` của đơn vị tổng hợp: `BaseRepository` chặn ghi, Nhà máy SX và phòng ban không gắn được vào `A00`.
- **Đọc:** thấy dữ liệu của mọi ĐVCS, nhưng vẫn theo phạm vi. Phép gán có phạm vi `FACTORY` chỉ đọc các ĐVCS trong phạm vi (ví dụ Kế toán phụ trách A01, A02). Phép gán không giới hạn `FACTORY` đọc tất cả.
- **Ghi:** tài nguyên `BRANCH`, bảng có ĐVCS nguồn và bảng ghi theo ĐVCS của nhà máy (`factoryBranchWrite`) trả 403 `AGGREGATE_READ_ONLY`. Lệnh kiểm chạy trước khi đọc dòng, nên `PUT`, `DELETE` một Id bất kỳ ở `A00` cũng 403. Các hàm khóa dòng (`lock`, `lockBranchRow`, `lockMany`) cũng từ chối. Tài nguyên dùng chung không gắn ĐVCS (phòng ban, hồ sơ nhân viên) và danh mục hệ thống ghi được ở `A00`.
- Ngoại lệ Allow theo người ở `A00` khi không có phép gán vai trò nào có hiệu lực: tài nguyên `BRANCH` không thấy dòng nào (đóng an toàn); tài nguyên dùng chung thấy toàn bộ (ADR 0013 mục 4).
- Nhà máy SX của phiên ở `A00`: mọi nhà máy đang dùng đã gắn ĐVCS (chỉ để đọc).
- Vai trò Toàn quyền cũng chỉ đọc ở `A00` (ADR 0014).
- Hướng mở rộng (ADR 0002, chưa làm): `A00` là trường hợp đặc biệt của "nhóm ĐVCS". Cần xem theo nhóm khác (ví dụ vùng) thì thêm bảng nhóm bằng dữ liệu, không đổi cách lọc; `BranchCode` là một chiều của mô hình phạm vi đa chiều (mục 7).

<a id="quyen-theo-vai-tro"></a>
## 4. Quyền theo vai trò (L2) và menu động

### 4.1 Tài nguyên, hành động, mã quyền

- **Tài nguyên** (`SysResource`): một màn hình hoặc nhóm dữ liệu được bảo vệ, mã dạng `module.resource` (ví dụ `order.shipment`). `ModuleCode` là phần trước dấu chấm. `ScopeType` (`BRANCH`/`SHARED`) và `SourceTable` (tên bảng, không kèm tên database) dùng cho `BaseRepository`.
- **Hành động:** `view`, `create`, `update`, `delete`, `export`.
- **Quyền** (`SysPermission`): mã `<tài nguyên>:<hành động>`, ví dụ `order.po:view`. Seed tạo đủ 5 quyền cho mỗi tài nguyên; mỗi cặp (tài nguyên, hành động) duy nhất.
- Danh sách tài nguyên, đường dẫn màn, ma trận mẫu khai ở `backend/scripts/seed-data.ts` (`resources`, `ROLE_ORDER`); bảng ma trận theo vai trò: [Dữ liệu mẫu và kiểm thử](12-du-lieu-mau-va-kiem-thu.md).
- Tài nguyên hoặc quyền đang tắt (`IsActive = 0`) không được tính cho ai.

### 4.2 Vai trò và phép gán

- `SysRole`. Vai trò hệ thống (`IsSystem = 1`, do seed tạo) không tắt, không xóa được (409). "Xóa" vai trò ở màn Vai trò là đặt `IsActive = 0`; vai trò đang tắt không cấp quyền.
- `SysRolePermission`: quyền của vai trò.
- `SysUserRole`: một **phép gán** vai trò cho người dùng; một người nhiều vai trò, mỗi cặp (người, vai trò) một dòng. Mỗi phép gán có phạm vi riêng (mục 7).
- `SysUserRole.ValidFromAt`, `ValidToAt`: `PermissionService` tôn trọng (ngoài khoảng thì phép gán không hiệu lực, qua mốc thì tự tính lại), nhưng chưa có màn, API nào đặt hai cột này; phép gán tạo từ màn Người dùng luôn không thời hạn.

### 4.3 Cách tính quyền tại ĐVCS của phiên

`PermissionService.compute` (`backend/src/platform/permission/permission.service.ts`), kết quả là `UserAccess` (mục 5.3):

1. Tài khoản `IsActive = 0`: không có quyền nào, `active = false` (`AuthGuard` trả 401).
2. Lấy các phép gán của vai trò đang bật, đang trong hạn.
3. Tính phạm vi của từng phép gán tại ĐVCS của phiên (`grantOf`, mục 7). Phép gán có chiều `FACTORY` không chứa ĐVCS của phiên thì không có hiệu lực ở phiên này.
4. Hợp quyền của các vai trò có hiệu lực (chỉ quyền, tài nguyên đang bật). Mỗi quyền giữ danh sách phạm vi của các phép gán cấp nó (kết hợp OR).
5. Ngoại lệ Allow theo người còn hạn: có quyền, phạm vi theo mục 9.
6. Ngoại lệ Deny theo người còn hạn: mất quyền, thắng mọi thứ.
7. **Không có `<tài nguyên>:view` thì mất mọi hành động khác của tài nguyên đó**: chặn xem là chặn hẳn, không còn đường đọc qua xuất file hay dữ liệu trả về khi sửa (ADR 0006, bổ sung cho ADR 0005).
8. Lấy Nhà máy SX đang dùng thuộc ĐVCS của phiên (`productionFactories`; ở `A00`: mọi nhà máy đã gắn ĐVCS).

`PermissionGuard` chỉ hỏi "có mã quyền không"; `BaseRepository` hỏi thêm "phạm vi nào".

<a id="menu-dong"></a>
### 4.4 Menu động

- `SysMenu` là cây menu: nhóm (`ResourceId` trống, mã `menu.<module>`) và mục lá (`ResourceId` trỏ tài nguyên, mã `menu.<tài nguyên>`, có `Path`). `IsMobile` đánh dấu màn dùng trên điện thoại.
- `GET /me/menu` (`MeService.menu`): lấy các mục đang bật, xếp theo `SortOrder` rồi `Id`, dựng cây đệ quy. **Mục lá hiện khi tài nguyên đang bật và người dùng có `<tài nguyên>:view` tại ĐVCS của phiên** (đã tính phạm vi `FACTORY` của phép gán và ngoại lệ). **Nhóm hiện khi còn ít nhất một con hiện.** Mỗi nút trả `{ code, name, icon, path, isMobile, children }`.
- Menu do seed tạo và đồng bộ (tên, đường dẫn, thứ tự của mục hệ thống). Không có API sửa menu; `GET /admin/menus` chỉ đọc.
- Ma trận quyền ở màn Phân quyền gom tài nguyên theo nhóm menu gốc: tài nguyên có `ModuleCode` = phần sau `menu.` của nhóm. Module mới phải có nhóm menu thì tài nguyên mới hiện trong ma trận ([Quản trị hệ thống](05-quan-tri-he-thong.md)).
- Ẩn menu chỉ là phản chiếu; API của màn vẫn kiểm quyền.

<a id="guard-va-decorator"></a>
## 5. Guard, decorator, UserAccess, phiên bản quyền

### 5.1 Decorator

`backend/src/platform/auth/decorators.ts`:

| Decorator | Ý nghĩa | Đang dùng ở |
|---|---|---|
| `@Public()` | Không cần đăng nhập | `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `GET /health` |
| `@Authenticated()` | Chỉ cần access token, không đòi quyền cụ thể (việc của chính người dùng) | `MeController` (cả class), `select-branch` |
| `@AllowPreAuth()` | Nhận cả token tạm; phải đi cùng `@Authenticated` | `select-branch` |
| `@RequirePermission(...codes)` | Đòi **đủ** mọi mã quyền (AND) | Mọi API nghiệp vụ và `/admin/*` |
| `@FieldResource(code)` | Áp chính sách cột của tài nguyên cho endpoint (mục 8) | Controller của các màn có cột đăng ký |
| `@CurrentUser()` | Lấy `AuthUser` của request | Tham số controller |

- Metadata đọc bằng `getAllAndOverride`: đặt ở method thì thắng đặt ở class (ví dụ handler `@FieldResource('order.po')` trong controller khai `@FieldResource('order.shipment')`).
- `@RequirePermission` đặt ở đâu cũng thắng `@Public`, `@Authenticated`: ghép decorator không làm lọt quyền.
- Endpoint không có decorator nào trong ba loại trên: 403 `ENDPOINT_NOT_DECLARED`, khi request có access token hợp lệ. Thiếu hoặc sai token, phiên đã thu hồi thì `AuthGuard` trả 401 trước; token tạm cũng 401 vì endpoint không có `@AllowPreAuth`.
- Hai guard toàn cục đăng ký trong `AuthModule` theo thứ tự `AuthGuard` rồi `PermissionGuard`.

### 5.2 `PermissionGuard`

`backend/src/platform/auth/permission.guard.ts`:

1. Không có `@RequirePermission` mà có `@Public`: cho qua.
2. Chưa có `req.authUser`: 401.
3. Không có `@RequirePermission` mà có `@Authenticated`: cho qua.
4. Không khai báo gì: 403 `ENDPOINT_NOT_DECLARED`. Chỉ request có access token hợp lệ mới tới bước này; thiếu token, token sai, phiên đã thu hồi thì `AuthGuard` đã trả 401.
5. Có `@RequirePermission` mà token không phải access token: 401.
6. Thiếu bất kỳ mã nào trong `UserAccess.permissions`: 403 `PERMISSION_DENIED`.

### 5.3 `UserAccess`

Quyền của một người tại ĐVCS của phiên, `AuthGuard` tính một lần mỗi request và gắn vào `req.authUser.access`. Lấy lại bằng `PermissionService.accessOf(user)`.

| Trường | Ý nghĩa |
|---|---|
| `userId`, `branchCode`, `isAggregate` | Người và ĐVCS của phiên |
| `active` | Tài khoản còn hoạt động |
| `permissions` | Tập mã quyền có hiệu lực (đã tính phép gán, ngoại lệ, luật "không có view thì mất hết") |
| `grants` | Mã quyền → danh sách phạm vi (`Grant[]`, mỗi phần tử là các điều kiện AND; các phần tử OR với nhau) |
| `roleIds` | Vai trò có hiệu lực ở ĐVCS này (chính sách cột tính theo các vai trò này) |
| `rolePermissions` | Quyền của từng vai trò có hiệu lực, chưa tính ngoại lệ (chính sách cột chỉ tính vai trò có quyền xem tài nguyên) |
| `productionFactories` | Mã Nhà máy SX đang dùng thuộc ĐVCS của phiên (`A00`: mọi nhà máy đã gắn ĐVCS), cho tùy chọn `assignedFactories`, `factoryBranchWrite` của repository (ADR 0013 mục 11, mục 6.6) |
| `version` | `SysPermissionVersion.Version` lúc tính |
| `expiresAt` | Mốc (ms) gần nhất một phép gán hoặc ngoại lệ bắt đầu hay hết hiệu lực; qua mốc thì tính lại |

Một điều kiện (`Condition`) có ba dạng: `in` (giá trị thuộc danh sách), `own` (người tạo là người đang thao tác), `none` (đóng an toàn, không khớp dòng nào).

<a id="phien-ban-quyen"></a>
### 5.4 Cache quyền và phiên bản quyền

- `PermissionService` cache `UserAccess` theo `userId:branchCode` trong bộ nhớ tiến trình. Dùng lại khi `version` trùng phiên bản trong DB, cờ tổng hợp không đổi và chưa qua `expiresAt`. `AuthGuard` đọc phiên bản từ DB ở mỗi request, nên nhiều tiến trình backend vẫn thấy thay đổi ngay.
- `FieldPolicyService` cache riêng theo `userId:branchCode`, khóa thêm danh sách vai trò, hết hạn theo cả mốc của chính sách cột theo người.
- `BranchService` (dòng `SysBranch` theo mã) và `ResourceRegistry` cache 30 giây trong tiến trình. Sửa ĐVCS ở màn Quản trị xóa cache `BranchService` của tiến trình đó ngay.
- Tập chuyền may (`OrgService`) cache 30 giây trong tiến trình. Khi tính quyền có phạm vi chuyền, `PermissionService.lineCodes(version)` thấy phiên bản quyền khác lần trước thì xóa cache chuyền và đọc lại, nên `UserAccess` cache theo một phiên bản không dùng tập chuyền cũ hơn phiên bản đó, kể cả khi tiến trình khác đổi chuyền.
- `SysPermissionVersion` có đúng một dòng `Id = 1`. Thay đổi phân quyền gọi `PermissionService.bumpVersion(trx)` trong cùng transaction với thay đổi và nhật ký, rồi `clearCache()` sau khi commit.
- Các thao tác tăng phiên bản quyền:
  - Quản trị: gán vai trò, gán ĐVCS, bật/tắt tài khoản, bật/tắt/xóa vai trò, ma trận quyền của vai trò, phạm vi của phép gán, ngoại lệ, chính sách cột (theo vai trò và theo người), bật/tắt ĐVCS.
  - Danh mục hệ thống: thêm Nhà máy SX, đổi ĐVCS hoặc bật/tắt Nhà máy SX (quyền chọn mã hàng theo nhà máy).
  - Sơ đồ tổ chức: thêm bộ phận tích "Xưởng sản xuất", tích, bỏ tích, đổi ĐVCS, giải thể, khôi phục bộ phận là chuyền may. Ngoại lệ về transaction: bộ phận lưu ở `MES_Hr`, phiên bản tăng ở `MES_Core` ngay sau commit (mục 7.6).
  - Seed (cuối mỗi lần chạy), `bootstrapFullAccess`, migration `MES_Core/0004`, `0007`, `0009`, `0010`, `0012`, `0013` (`0012`, `0013` chỉ khi có cấp quyền).
  - Đặt lại mật khẩu không tăng phiên bản (thu hồi phiên thay vì vậy). Sửa tên, mô tả không tăng.
- Header `X-Permission-Version` của mọi response có access token mang dấu `accessStamp`: `version`, hoặc `version.expiresAt` khi có mốc hết hạn. `GET /me/permissions` trả cùng dấu ở `stamp`. Giao diện thấy dấu khác thì tải lại `/me`, `/me/menu`, `/me/permissions`, `/me/field-policies` và dữ liệu đang hiện (`frontend/src/store/auth.ts`).
- Chi phí mỗi request có access token: một câu `SysUserSession` theo khóa chính, một câu `SysPermissionVersion`, một câu `SysUserBranch`, cộng `SysBranch` khi cache hết hạn; tính lại `UserAccess` khi cache trống. Khi cần giảm tải có thể cache kết quả kiểm `SysUserSession` vài giây (ADR 0004, chưa làm).

<a id="base-repository"></a>
## 6. BaseRepository và Resource Registry

`backend/src/platform/data/base.repository.ts`. Mỗi module viết repository kế thừa `BaseRepository<R>` (bảng chính) hoặc `ChildRepository<R>` (bảng con), khai `table` và `resource`. Module truyền kết nối database của mình (`Kysely<any>`) và `ResourceRegistry`.

<a id="resource-registry"></a>
### 6.1 Resource Registry

`ResourceRegistry` (`resource-registry.ts`) đọc `SysResource` đang bật theo mã, kèm:

- `bindings`: chiều phạm vi → cột của bảng nguồn (`SysResourceScopeBinding`). Tài nguyên `BRANCH` **luôn** có `FACTORY → BranchCode`, kể cả khi quên khai báo (ADR 0005).
- `fields`: cột đăng ký (`SysResourceField`).

`resolve(resource, table)` chạy trước mọi thao tác của repository: tài nguyên không tồn tại, đã tắt, hoặc `SourceTable` khác `table` của repository thì ném 500 `RESOURCE_NOT_REGISTERED`. Kết quả cache 30 giây.

### 6.2 Phạm vi của request (`Scope`)

`scopeOf(user)` dựng `{ userId, branchCode, isAggregate, access }` từ `AuthUser`; token không phải access token thì 401. Service truyền `Scope` này cho mọi hàm của repository. Không có cách truyền `BranchCode` từ client vào repository.

### 6.3 Điều kiện repository tự thêm (`limit`)

Với hành động `action` (`view` khi đọc, `export` khi xuất file, `create`/`update`/`delete` khi ghi):

1. Tài nguyên `BRANCH` ở ĐVCS cụ thể: `BranchCode = <ĐVCS phiên>`.
2. Bảng có ĐVCS nguồn, hành động ghi, ở ĐVCS cụ thể: `BranchCode = <ĐVCS phiên>`, hoặc dòng đang được ĐVCS phiên dùng (`usedBy`, mục 6.5).
3. Bảng khai `factoryBranchWrite`, hành động ghi: không mã nhà máy nào của dòng thuộc nhà máy đã gắn ĐVCS khác (mục 6.6); ở `A00`: `1 = 0`.
4. Lấy phạm vi của quyền `<tài nguyên>:<action>`. Không có: điều kiện `1 = 0` (không thấy gì).
5. Mỗi phạm vi chỉ giữ điều kiện của chiều gắn với tài nguyên. Có một phạm vi không còn điều kiện nào: không lọc thêm. Không thì `OR` giữa các phạm vi, `AND` giữa các điều kiện trong một phạm vi.

Kết quả về hành vi:

| Tình huống | Kết quả |
|---|---|
| Đọc, sửa, xóa dòng của ĐVCS khác hoặc ngoài phạm vi | 404 `NOT_FOUND`, như không tồn tại |
| Tạo dòng, hoặc sửa làm giá trị cột phạm vi ra ngoài phạm vi (ví dụ chuyển sang chuyền không được giao) | 403 `SCOPE_DENIED` |
| Ghi ở `A00` trên tài nguyên `BRANCH`, bảng có ĐVCS nguồn hoặc bảng ghi theo ĐVCS của nhà máy | 403 `AGGREGATE_READ_ONLY` |
| Client gửi `Id`, `BranchCode`, `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` | Bị bỏ (`withoutSystemColumns`, không phân biệt hoa thường); repository tự đặt `BranchCode`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` |

### 6.4 Các hàm

| Hàm | Dùng cho |
|---|---|
| `list(scope, opts, action = 'view', db?)` | Danh sách có phân trang (tối đa 200 dòng/trang), tìm `q` theo `searchColumns` (bỏ `searchExclude`), điều kiện nghiệp vụ `where`, cột tính thêm `select`, sắp xếp theo danh sách trắng `sortable` (tối đa 6 cặp, luôn thêm `Id` cuối). `orderBy`: mảng `{ expr, dir }` biểu thức sắp xếp do module dựng từ danh sách trắng của màn (dùng được cột tính, ví dụ ĐVCS suy từ Nhà máy SX), thay cho `sort`, `sortable`; không nhận từ client; luôn thêm `Id` giảm dần cuối |
| `listAll(scope, opts, action = 'export')` | Mọi dòng khớp điều kiện cho xuất file, theo phạm vi của quyền `export`. Tối đa 10.000 dòng; màn có giới hạn riêng truyền `maxRows` (trần 100.000) và tự báo người dùng khi vượt (Phân bổ PO: 50.000) |
| `distinctValues(scope, col, opts)` | Giá trị khác nhau của một cột cho popup lọc theo cột (ADR 0011), trong cùng phạm vi, tối đa 1.000 |
| `getById(scope, id, action = 'view', db?, { assignedFactories })` | Một dòng; ngoài ĐVCS hay phạm vi thì 404 |
| `create`, `createNumbered`, `update`, `remove` | Ghi một dòng với đủ kiểm tra ở mục 6.3. `createNumbered` sinh số chứng từ `PREFIX-<ĐVCS>-<Id 6 chữ số>`, chỉ cho tài nguyên có `BranchCode` |
| `scoped(qb, scope, action, alias?)` | Gắn điều kiện ĐVCS và phạm vi vào câu truy vấn riêng của lớp con (thống kê, đếm) |
| `filteredQuery(scope, opts, action)` | Câu truy vấn trên đúng tập dòng của danh sách, chưa chọn cột, để đếm, thống kê |
| `branchOnly(qb, scope, alias?)` | Chỉ lọc ĐVCS, bỏ qua phạm vi: cho số liệu kiểm ràng buộc trên cả ĐVCS (không lập vượt số lượng). Không dùng để trả dòng cho người dùng |
| `scopedIds(scope, action, db?)`, `idsForGrant`, `grantsFor`, `byBranch` | Phục vụ bảng con và kiểm nhiều dòng một câu |
| `lock(scope, id, action, trx)` | Khóa một dòng (`UPDLOCK, ROWLOCK`) tới hết transaction rồi kiểm phạm vi; ngoài phạm vi thì 404 |
| `lockBranchRow(scope, id, trx)` | Khóa một dòng chỉ theo ĐVCS, không xét phạm vi, không trả dữ liệu; `Id` phải lấy từ dữ liệu máy chủ đã kiểm |
| `lockMany(scope, ids, action, trx)` | Khóa nhiều dòng theo lô 500, lọc phạm vi trước, kiểm lại sau khi khóa; trả các Id không khóa được |
| `inUseHere(scope)` | Điều kiện của màn làm việc trên bảng có ĐVCS nguồn (mục 6.5) |
| `allows(scope, action, row)` | Một dòng có các giá trị `row` (chưa cần có trong bảng) có nằm trong phạm vi của hành động không: ĐVCS (tài nguyên `BRANCH`, trừ `A00` khi xem; ghi ở `A00` thì không) và phạm vi theo cột của phép gán, cùng luật với khi ghi. Cho màn hiện dữ liệu nguồn của module khác trước khi có dòng ở bảng của mình: Kế hoạch may hiện dòng dàn chuyền chưa lập chỉ khi (ĐVCS, chuyền) trong phạm vi xem ([May](07-may.md)) |
| `otherBranchFactoryRows(qb, scope, alias?)` | Bảng khai `factoryBranchWrite`: các dòng không ghi được vì có nhà máy đã gắn ĐVCS khác, để lớp con đếm và báo lý do (mục 6.6). Không dùng để trả dòng |

Ghi nhiều dòng chia lô vì SQL Server nhận tối đa 2.100 tham số mỗi câu: 500 Id mỗi câu kiểm, khóa; câu INSERT nhiều dòng tối đa 100 dòng và không quá 2.000 tham số.

<a id="bang-dung-chung"></a>
### 6.5 Bảng dùng chung có ĐVCS nguồn: `originBranch`, `usedBy`, `inUseHere`

Đơn hàng, PO lấy từ BRAVO là dữ liệu dùng chung toàn công ty, nhưng cột `BranchCode` vẫn ghi ĐVCS nguồn (Chi nhánh FOB) (ADR 0013 mục 4, 11):

- `originBranch = true`: đọc không lọc ĐVCS; tạo mới đóng dấu ĐVCS của phiên; sửa, xóa chỉ dòng của ĐVCS phiên (dòng ĐVCS khác trả 404); `A00` không ghi được. Nhờ vậy ĐVCS khác không đổi được dữ liệu mà ĐVCS nguồn dựa vào (ví dụ Nhà máy SX của đơn).
- `usedBy = { table, column }`: ĐVCS có dòng trong bảng `table` (cùng database, có `BranchCode`) trỏ tới dòng này qua `column` cũng sửa, xóa được dòng như ĐVCS nguồn. `SalesOrderPoRepository` khai `{ table: 'ShipmentPlanPo', column: 'SalesOrderPoId' }`: ĐVCS có PO trong kế hoạch xuất hàng của mình sửa được tỷ lệ cắt của PO đó. `SalesOrderPriceRepository` (quyết định 14.3) khai `{ table: 'ShipmentPlan', column: 'SalesOrderId' }` trên bảng `SalesOrder`, chỉ dùng cho đường sửa riêng Giá CM: ĐVCS có kế hoạch xuất hàng của đơn sửa được Giá CM; `SalesOrderRepository` (Sửa đơn, Xóa) không khai `usedBy`, nên các cột khác vẫn chỉ ĐVCS nguồn sửa được.
- `inUseHere(scope)`: điều kiện lọc của màn (không phải phân quyền): dòng ĐVCS phiên đang dùng (`usedBy`), hoặc dòng người dùng nhập tay ở ĐVCS này (`CreatedBy` có giá trị và `BranchCode` = ĐVCS phiên; dòng nạp từ hệ thống nguồn để trống `CreatedBy`). Ở `A00`: của mọi ĐVCS. Màn Cập nhật tỷ lệ cắt dùng điều kiện này: [Đơn hàng](06-don-hang.md).

### 6.6 Nhà máy SX của dòng: `assignedFactories`, `factoryBranchWrite`

Repository khai `productionFactoryColumn` (cột chứa danh sách mã nhà máy cách nhau dấu phẩy) thì dùng được hai tùy chọn dưới. Danh sách nhà máy của phiên lấy từ quyền của phiên (`UserAccess.productionFactories`: nhà máy đang dùng của ĐVCS phiên), không từ client.

**Lọc theo Nhà máy SX của ĐVCS (`assignedFactories`).** `list`, `getById` nhận tùy chọn `assignedFactories: true`: chỉ dòng có ít nhất một mã nhà máy thuộc `UserAccess.productionFactories` (`STRING_SPLIT`). ĐVCS chưa có nhà máy nào thì không thấy gì. Repository không khai cột mà gọi tùy chọn này thì lỗi. Đang dùng cho popup Chọn mã hàng của Kế hoạch xuất hàng (`SalesOrderRepository`, cột `ProductionFactoryCode`): [Đơn hàng](06-don-hang.md).

**Ghi theo ĐVCS của nhà máy (`factoryBranchWrite = true`).** Cho bảng dùng chung không có cột ĐVCS mà ĐVCS giữ dòng suy từ Nhà máy SX của dòng, để danh mục đổi ĐVCS của nhà máy thì dòng theo ngay:

- Đọc, xuất file: không lọc ĐVCS.
- Sửa, xóa (`limit` với hành động ghi): chỉ dòng mà không mã nhà máy nào (tách dấu phẩy, bỏ khoảng trắng quanh mã) thuộc nhà máy **đã gắn ĐVCS** mà không nằm trong `UserAccess.productionFactories`; so không phân biệt hoa thường. Nghĩa là: dòng có nhà máy của ĐVCS phiên, dòng chưa có nhà máy, dòng có nhà máy chưa gắn ĐVCS hoặc chưa có trong danh mục đều ghi được. Dòng khác coi như không tồn tại (404). Nhà máy của ĐVCS phiên mà đã ngừng dùng không nằm trong nhà máy của phiên, nên dòng đó không ghi được (đóng an toàn).
- `A00`: `assertWritable` từ chối (403 `AGGREGATE_READ_ONLY`), điều kiện ghi là `1 = 0`.
- `create` từ chối (lỗi lập trình): luật chỉ xét dòng đã có; bảng dạng này do hệ thống chép dòng vào.
- Lớp con phải trả danh mục Nhà máy SX ở `factoryDirectory()` (interface `FactoryDirectory`: `productionFactories()` trả mã và ĐVCS), lấy từ `CatalogLookupService` của nền tảng, không tự dựng. Thiếu `productionFactoryColumn` hoặc `factoryDirectory()` thì lỗi.
- `otherBranchFactoryRows(qb, scope)` ghép sau `scoped(..., 'view')` cho ra các dòng bị chặn vì nhà máy của ĐVCS khác, để module đếm và báo lý do (`FACTORY_OF_OTHER_BRANCH`, mục 13).
- Đang dùng cho Phân bổ PO (`PoAllocationRepository`, cột `ProductionFactoryCode`): [Đơn hàng](06-don-hang.md).

### 6.7 `ChildRepository`

Bảng con theo dòng cha (màu cỡ của PO, dòng dàn chuyền, màu cỡ của chuyền…), khai `table`, `parentKey`, `parent` (repository cha), có thể khai `scopeColumns` (chiều áp thẳng lên bảng con, ví dụ `LinePlanLineRepository`: `{ LINE: 'LineCode' }`).

- Không có quyền riêng: dùng quyền, phạm vi của tài nguyên gốc qua `parent.grantsFor`.
- Dòng con nằm trong phạm vi khi thỏa **một** phép gán của hành động, xét chung điều kiện của dòng cha và của chính dòng con trong cùng phép gán đó.
- Lọc ĐVCS theo cách của cha: cha theo ĐVCS thì kèm `BranchCode` của phiên; cha dùng chung thì không lọc khi đọc, còn ghi dòng con chỉ khi cha ghi được.
- `BranchCode` của dòng mới: ĐVCS của phiên khi cha theo ĐVCS, của dòng cha khi cha dùng chung (khóa ngoại ghép ở DB bảo đảm con cùng ĐVCS với cha). Khóa tới cha (`parentKey`) và `BranchCode` do repository đặt.
- Thêm, sửa dòng con kiểm theo quyền `update` của cha. `insertMany`, `updateMany`, `removeMany` chỉ chạy trong transaction; có dòng ngoài phạm vi thì 404, không ghi gì. `insertMany` chỉ cho bảng con theo ĐVCS.
- `lockByParent` khóa mọi dòng con của một cha, để mọi đường ghi khóa theo thứ tự cha → con → cháu.

### 6.8 Transaction và khóa

- `inTransaction(db, fn)` (`transaction.ts`) giữ lỗi gốc của `fn` khi SQL Server đã tự rollback (deadlock 1205): lỗi rollback sau đó chỉ ghi log.
- `AllExceptionsFilter` đổi lỗi deadlock thành 409 `CONFLICT` "Có người khác đang lưu cùng dữ liệu… Thử lại sau vài giây".
- Khóa dùng `UPDLOCK` (không ghi), người chỉ đọc không bị chặn. Thứ tự khóa của từng module: [Đơn hàng](06-don-hang.md).
- Không có transaction chung giữa các database ([Kiến trúc](../ARCHITECTURE.md) mục 6.3).

### 6.9 Đường ghi không theo phiên

Một số việc của hệ thống đọc, ghi dữ liệu không theo phạm vi của người dùng, nên không đi qua cưỡng chế theo phiên của `BaseRepository`. Các chỗ này chỉ được gọi từ endpoint đã kiểm quyền hoặc từ tác vụ nền; ĐVCS do service lấy từ phiên (`Scope`, phiên `A00`: mọi ĐVCS) hoặc là việc của mọi ĐVCS, không nhận mã ĐVCS từ client.

- Nạp tăng dần đơn hàng BRAVO, làm mới bảng Phân bổ PO theo OSM ([Đơn hàng](06-don-hang.md)); chép dàn chuyền sang Kế hoạch chuẩn bị SX ([May](07-may.md)); đọc bảng chép ở `MES_Sync` ([Đồng bộ](09-dong-bo.md)).
- `ShipmentPlanPriceRepository.follow` (`backend/src/modules/order/order.repositories.ts`): đơn đổi Giá CM thì ghi Giá CM vào mọi kế hoạch xuất hàng của đơn ở mọi ĐVCS, trong transaction đã ghi đơn (quyết định 14.3, [Đơn hàng](06-don-hang.md)).
- `ShipmentPlanFeedRepository` (cùng file, qua `ShipmentPlanFeed`): đọc kế hoạch xuất hàng, màu cỡ của ĐVCS phiên cho module Cắt chép sang; `setCutQty` ghi cột LK cắt (`ShipmentPlan.CutQty`) theo Lũy kế (quyết định 13.6), chỉ ghi số tổng hợp, không theo quyền sửa của người xem ([Cắt](15-cat.md)).
- `LineColorSizeFeedRepository` (cùng file, qua `LineColorSizeFeed`, `LineSupplyGuards`): đọc phần giao ở Phân bổ màu cỡ gom theo chuyền, mã hàng, màu cỡ của ĐVCS phiên cho Xác nhận cấp BTP và để kiểm phần giao không xuống dưới số đã cấp; không theo phạm vi chuyền của người xem ([Cắt](15-cat.md)).
- `CuttingPlanRepository.syncFromPlans` (`backend/src/modules/cutting/cutting.repositories.ts`): mỗi lần mở màn Đồng bộ tiến độ cắt, chép kế hoạch xuất hàng của ĐVCS phiên sang `CuttingPlan` dưới khóa ứng dụng (thêm, cập nhật, dọn hoặc tách bản chép mất nguồn; `BranchCode` lấy từ kế hoạch nguồn). `copyCount`, `sourceHasEntries`, `cutTotals` cùng lớp chỉ trả số đếm, số tổng ([Cắt](15-cat.md)).
- `SewingDayPlanRepository.usageQuick` (`backend/src/modules/sewing/sewing-plan.repositories.ts`, qua `LineDayPlanGuards`): số đã lập ở Kế hoạch may của các dòng dàn chuyền, theo ĐVCS của kế hoạch Xếp chuyền đang lưu, chỉ trả số tổng ([May](07-may.md)).

<a id="pham-vi"></a>
## 7. Phạm vi theo phép gán (L3)

ADR 0005. Phạm vi gắn vào **phép gán** (một người × một vai trò), không gắn vào vai trò.

### 7.1 Khái niệm

| Thành phần | Bảng | Ý nghĩa |
|---|---|---|
| Chiều | `SysScopeDimension` | Ba chiều hệ thống do migration tạo: `FACTORY` (Đơn vị cơ sở, giá trị từ nút gốc loại `FACTORY` của cây tổ chức), `LINE` (Chuyền, chiều giá trị: mã bộ phận tích "Xưởng sản xuất", mục 7.6), `OWNER` (Người tạo). Chiều có `OrgType` lấy giá trị từ `SysOrgUnit`; chiều `OrgType` trống dùng giá trị (`ScopeValue`). Thêm chiều mới là thêm dữ liệu |
| Gắn tài nguyên | `SysResourceScopeBinding` | Tài nguyên lọc theo chiều nào, qua cột nào của bảng nguồn |
| Phạm vi | `SysUserRoleScope` | Các dòng (chiều, chế độ, đơn vị hoặc giá trị) của một phép gán |

| Chế độ | Ý nghĩa | Dùng cho chiều |
|---|---|---|
| `ALL` | Không giới hạn ở chiều này (không đi cùng giá trị khác của cùng chiều) | Mọi chiều |
| `ORG_SUBTREE` | Một nút cây tổ chức và mọi đơn vị bên dưới đúng loại của chiều | Chiều có `OrgType` (hiện chỉ `FACTORY`: nút ĐVCS là chính nó) |
| `LIST` | Danh sách đơn vị (`OrgUnitId`, đúng loại của chiều) hoặc giá trị (`ScopeValue`) | `LIST` theo đơn vị: chiều có `OrgType`; theo giá trị: chiều không có `OrgType` (gồm `LINE`), trừ `OWNER` |
| `OWN` | Chỉ dòng do chính mình tạo | `OWNER` |

Khi lưu, `AdminGrantsService.setAssignmentScope` kiểm: chiều đang bật; đơn vị đang bật; `LIST` theo đơn vị phải đúng loại của chiều; `ORG_SUBTREE` phải có ít nhất một đơn vị đúng loại đang bật trong nhánh; `LINE` chỉ nhận `ALL` hoặc `LIST` theo mã (mục 7.6); `OWNER` chỉ nhận `ALL`, `OWN`; `ALL` không đi cùng giá trị khác. Sai thì 422. DB có thêm `CK_SysUserRoleScope_Value`.

### 7.2 Cách tính (`PermissionService.grantOf`)

- **Không có dòng cho một chiều thì không giới hạn ở chiều đó.** Phép gán không có dòng nào chỉ bị giới hạn bởi ĐVCS của phiên.
- Trong một phép gán: các chiều kết hợp `AND`, nhiều giá trị của một chiều kết hợp `OR`. Giữa các phép gán cùng cấp một quyền: `OR`. Quyền và phạm vi của phép gán này không rò sang phép gán khác.
- Giá trị của chiều có `OrgType` là mã đơn vị tổ chức (`SysOrgUnit.Code`) đang bật, đúng loại. `ORG_SUBTREE` lấy các đơn vị có `Path` bắt đầu bằng `Path` của nút.
- **`LINE`:** chỉ dòng `LIST` theo giá trị góp mã, và chỉ mã đang là chuyền đang dùng (mục 7.6); không còn mã nào thì điều kiện rỗng (`none`).
- **`FACTORY` ở ĐVCS cụ thể:** phép gán chỉ có hiệu lực khi ĐVCS của phiên nằm trong phạm vi; có hiệu lực thì không thêm điều kiện (đã có lọc ĐVCS). Ví dụ "Trưởng chuyền ở A01, Giám đốc ở A02": làm việc ở A02 thì quyền Trưởng chuyền không có hiệu lực, cả menu lẫn API.
- **`FACTORY` ở `A00`:** điều kiện `BranchCode IN (<các ĐVCS trong phạm vi>)`.
- **`OWNER` + `OWN`:** cột người tạo (theo binding, thường `CreatedBy`) = người đang thao tác.
- **Đóng an toàn:** chiều đã tắt (với `FACTORY` ở ĐVCS cụ thể: phép gán không hiệu lực), đơn vị đã tắt hoặc sai loại, tổ hợp ngoài danh sách hợp lệ đều thành điều kiện rỗng (`none`), không bao giờ thành "không giới hạn".
- Tài nguyên không gắn một chiều thì chiều đó không áp cho nó. Ví dụ phạm vi chuyền không lọc Thông tin đơn hàng; phạm vi `FACTORY` không lọc tài nguyên dùng chung.
- Mỗi hành động dùng phạm vi của chính quyền đó. Phạm vi xem có thể rộng hơn phạm vi sửa và ngược lại (nhiều vai trò, ngoại lệ); module phải xử lý khi ghi nhiều dòng một lần: [Đơn hàng](06-don-hang.md).

### 7.3 Chiều gắn với tài nguyên hiện có

Dữ liệu hệ thống, seed đồng bộ đúng khai báo ở `scopeBindings` (`backend/scripts/seed-data.ts`):

| Tài nguyên | Loại | Chiều → cột |
|---|---|---|
| `order.allocation` | `SHARED` có ĐVCS nguồn | `OWNER → CreatedBy` |
| `order.po` | `SHARED` có ĐVCS nguồn | `OWNER → CreatedBy` |
| `order.shipment` | `BRANCH` | `FACTORY → BranchCode`, `OWNER → CreatedBy` |
| `order.lineplan` | `BRANCH` | `FACTORY → BranchCode`, `OWNER → CreatedBy`; bảng con dòng dàn chuyền thêm `LINE → LineCode` (`scopeColumns`) |
| `order.colorsize` | `BRANCH` | `FACTORY → BranchCode`, `LINE → LineCode`, `OWNER → CreatedBy` |
| `order.prep` | `BRANCH` | `FACTORY → BranchCode`, `LINE → LineCode` |
| `cutting.progress` | `BRANCH` | `FACTORY → BranchCode` (không chiều Chuyền, Người tạo: dòng do hệ thống chép từ kế hoạch xuất hàng) |
| `cutting.supply` | `BRANCH` | `FACTORY → BranchCode` (không chiều Chuyền, Người tạo; quyết định 13.10) |
| `sewing.plan` | `BRANCH` | `FACTORY → BranchCode`, `LINE → LineCode` (không chiều Người tạo); bảng con `SewingDayPlanItem` theo phạm vi của dòng cha |

`SysResourceScopeBinding.ColumnName` chỉ nhận ký tự định danh (CHECK), vì tên cột được ghép vào điều kiện.

### 7.4 Ví dụ (dữ liệu mẫu)

- `truongchuyen.a`: Trưởng chuyền, `LINE` `LIST` giá trị `A01-L03` (mã bộ phận chuyền mẫu tích "Xưởng sản xuất") → ở Phân bổ màu cỡ chỉ thấy kế hoạch có chuyền A01-L03 và chỉ phân màu cỡ cho chuyền đó (phần của chuyền khác chỉ thấy tổng); ở Kế hoạch chuẩn bị SX, Kế hoạch may chỉ thấy dòng chuyền A01-L03 (vai trò mẫu chỉ có quyền Xem ở hai màn này; Giá CM, Doanh số kế hoạch của Kế hoạch may bị Ẩn). Bộ phận đó bị bỏ tích hay giải thể thì người này không thấy chuyền nào (không thành không giới hạn).
- `ketoan`: Kế toán, `FACTORY` `LIST` A01, A02 → ở `A00` chỉ đọc kế hoạch của A01, A02; ở A03 không có quyền nào; đơn hàng dùng chung vẫn thấy hết.

### 7.5 Thay đổi phạm vi

- Màn Người dùng, phần phạm vi của từng vai trò: `PUT /admin/users/:id/roles/:roleId/scope` thay toàn bộ phạm vi của phép gán ([Quản trị hệ thống](05-quan-tri-he-thong.md)). Ghi `USER_ROLE_SCOPE` kèm phạm vi trước, sau.
- Gán lại vai trò so sánh khác biệt: phép gán giữ nguyên thì giữ phạm vi. Gỡ vai trò thì service xóa phạm vi trước (DB không xóa dây chuyền) và ghi phạm vi bị xóa vào nhật ký `USER_ROLES` (`removedScopes`).
- Đổi tập chuyền may ở Sơ đồ tổ chức đổi kết quả của phạm vi chuyền mà không qua màn Phân quyền: mục 7.6.

### 7.6 Chiều Chuyền (`LINE`) theo mã bộ phận

Chuyền may là bộ phận tích "Xưởng sản xuất" ở module Nhân sự ([Quyết định](13-quyet-dinh.md) mục 6.7, màn: [Nhân sự](08-nhan-su.md)). Chiều `LINE` là chiều giá trị (`OrgType` NULL): `ScopeValue` là mã bộ phận, cũng là `LineCode` của dữ liệu.

- **Tính quyền** (`PermissionService.grantOf`): chỉ dòng `LIST` theo giá trị (`OrgUnitId` trống) có tác dụng, và chỉ khi mã nằm trong tập chuyền đang dùng (`OrgService.activeLineCodes`: bộ phận đang tích, chưa giải thể, mọi ĐVCS). Dòng kiểu cũ theo nút cây tổ chức, mã của bộ phận đã bỏ tích hay giải thể, mã chuyền cũ không còn là bộ phận nào: không góp mã. Không còn mã nào thì tập rỗng, không bao giờ thành "không giới hạn".
- **Nguồn chuyền lỗi** (`LineSource.loadLines` ném lỗi): lỗi đi tới bên gọi, request của người có phạm vi chuyền bị từ chối; không dùng danh sách rỗng hay cũ, không giữ lỗi trong cache. Chưa có nguồn đăng ký thì không có chuyền nào.
- **Lưu phạm vi** (`AdminGrantsService.setAssignmentScope`, `PUT /admin/users/:id/roles/:roleId/scope`): chiều `LINE` chỉ nhận `ALL` hoặc `LIST` kèm `value` (không `orgUnitId`, không cả nhánh). Mã phải là chuyền đang dùng (máy chủ xóa cache và đọc lại nguồn chuyền trước khi kiểm); riêng mã đã lưu ở chính phép gán đó mà nay không còn là chuyền thì được giữ khi lưu lại (giữ không nới quyền; bỏ dòng cuối cùng của chiều là thành không giới hạn chuyền). Sai thì 422.
- **Danh mục cho bộ sửa** (`GET /admin/scope-catalog`): `lines` là mọi chuyền của mọi ĐVCS kể cả chuyền đã giải thể (mã, tên, ĐVCS, còn dùng, bộ phận cha; bộ phận bỏ tích không còn là chuyền nên không có); `orgUnits` chỉ còn nút `FACTORY`. `GET /admin/users/:id/access` trả thêm cho dòng chiều `LINE`: `valueName` (tên chuyền) và `valueActive` (còn là chuyền đang dùng không) để màn hình ghi "không còn tác dụng". API: [Quản trị hệ thống](05-quan-tri-he-thong.md).
- **Đổi tập chuyền** (thêm bộ phận tích sẵn, tích, bỏ tích, đổi ĐVCS, giải thể, khôi phục bộ phận đang tích; `DepartmentService`):
  - người thao tác phải có thêm `admin.permission:update` (trần quyền quản trị, thiếu thì 403 `SELF_ELEVATION_FORBIDDEN`);
  - `PermissionService.holdsLineScope(userId, code)`: người có phép gán nào mang phạm vi chuyền đúng mã đó (kể cả phép gán hết hạn, chưa tới hạn) không tự làm (403 `SELF_ELEVATION_FORBIDDEN`);
  - `lineScopeHolders(code)`: những người đang được giao phạm vi chuyền theo mã (tài khoản đang hoạt động, vai trò đang dùng, phép gán chưa hết hạn), cho màn hình báo trước (`GET /hr/departments/line-holders`) và cho nhật ký;
  - `recordLineSetChange`: sau khi `MES_Hr` đã commit, một transaction `MES_Core` ghi `LINE_SET_CHANGE` (`logStrict`) và tăng phiên bản quyền. Không có transaction chung giữa hai database nên đây là ngoại lệ có chủ đích của luật 7 (mục 1): tăng trước commit thì request chen giữa có thể tính quyền theo tập chuyền cũ rồi giữ dưới phiên bản mới. Lỗi thì thử lại 3 lần (cách 200, 400 ms); vẫn lỗi thì ghi log đủ dữ liệu để dựng lại nhật ký, xóa cache quyền của tiến trình đang chạy, trả 500 `LINE_SCOPE_UPDATE_FAILED` kèm bộ phận đã lưu (`details.department`, `details.departmentId`). Đọc lại bộ phận sau khi lưu mà lỗi thì vẫn ghi nhật ký, tăng phiên bản trước khi báo lỗi, để phạm vi chuyền không kẹt ở tập cũ. Tiến trình khác vẫn tính theo tập chuyền cũ tới lần tăng phiên bản sau.
- **Chuyển dữ liệu cũ** (migration `MES_Core/0009_line_scope_by_code.sql`, một transaction, chạy được trên database có dữ liệu): phạm vi `LIST` theo nút chuyền thành `LIST` theo mã chuyền; `ORG_SUBTREE` (cả xưởng, cả ĐVCS) thành danh sách các chuyền đang dùng trong nhánh; dòng vốn không có tác dụng (nhánh không còn chuyền đang dùng, nút đã ngừng, nút không phải chuyền) thành giá trị `~<mã nút>`, không bao giờ khớp mã bộ phận (mã bộ phận không có `~`). Không xóa dòng phạm vi nào (mất dòng là nới quyền): phép gán nào mất hết dòng chuyền thì `THROW 50091`, còn dòng theo nút thì `THROW 50092`, không đổi gì. Chiều `LINE` thành `OrgType` NULL; nút `LINE` rồi `WORKSHOP` của `SysOrgUnit` ngừng dùng. Nhật ký người `system`: `USER_ROLE_SCOPE` cho mỗi phép gán bị đổi, `SCOPE_DIMENSION_UPDATE`, `ORG_UNIT_RETIRE`; tăng phiên bản quyền.

<a id="chinh-sach-cot"></a>
## 8. Chính sách cột (L4)

ADR 0005, `backend/src/platform/permission/field-policy.service.ts`.

### 8.1 Cột đăng ký

- `SysResourceField`: cột của tài nguyên. **`Code` trùng đúng tên trường JSON** mà API nhận và trả (phân biệt hoa thường). `IsSensitive` đánh dấu cột nhạy cảm (giá, doanh số, giấy tờ nhân viên).
- Chỉ cột đã đăng ký mới chịu chính sách. Cùng một dữ liệu xuất hiện ở nhiều tài nguyên thì phải đăng ký và đặt chính sách ở **mọi** tài nguyên đó; che ở màn này không che ở màn khác.
- Danh sách cột của từng tài nguyên khai ở `resourceFields` (`backend/scripts/seed-data.ts`); seed đồng bộ tên, cờ nhạy cảm, thứ tự. Tài nguyên hiện có cột đăng ký: `order.allocation`, `order.poallocation`, `order.shipment`, `order.po`, `order.lineplan`, `order.colorsize`, `order.prep`, `cutting.progress`, `cutting.supply`, `sewing.plan`, `hr.employee`. Cột nhạy cảm hiện có: `order.allocation` (`unitPrice`, `amount`, `cmPrice`), `order.lineplan` (`cmPrice`, `revenue`), `sewing.plan` (`cmPrice`, `planRevenue`), `hr.employee` (`birthDate`, `idNumber`, `contactPhone`, `contactPerson`, `currentAddress`). Ý nghĩa từng cột: tài liệu module.

### 8.2 Mức và cách tính

| Mức | Trả về | Gửi lên |
|---|---|---|
| `HIDDEN` (Ẩn) | Bỏ khỏi JSON | 403 `FIELD_READONLY` |
| `MASKED` (Che) | `"***"` (giá trị `null` giữ `null`) | 403 `FIELD_READONLY` |
| `READONLY` (Chỉ đọc) | Nguyên giá trị | 403 `FIELD_READONLY` |
| `EDITABLE` (Sửa được) | Nguyên giá trị | Được |

Mức hiệu lực của một cột với một người tại ĐVCS của phiên (`FieldPolicyService.compute`):

1. Chính sách theo **người** (`SysFieldPolicy.SubjectType = 'USER'`) còn trong hạn dùng: dùng mức đó, thắng mọi vai trò.
2. Không có: lấy mức **mở nhất** (Sửa > Chỉ đọc > Che > Ẩn) trong các vai trò có hiệu lực ở ĐVCS của phiên **và có quyền `<tài nguyên>:view`**. Vai trò không khai báo cột đó dùng mặc định: cột thường Sửa được, cột nhạy cảm Ẩn. Vai trò không liên quan tới màn không làm mở cột mà vai trò liên quan đã ẩn hay khóa.
3. Không có vai trò liên quan nào (ví dụ chỉ có quyền nhờ Allow theo người): mặc định của cột.

Che chỉ có một kiểu (`"***"`); cần kiểu che khác (ví dụ hiện 4 số cuối) thì thêm cột cấu hình bằng migration mới (ADR 0005).

Mức Sửa được không thay quyền chức năng: vẫn cần `<tài nguyên>:update`. Chính sách theo vai trò không có hạn dùng (CHECK ở DB); chính sách theo người bắt buộc có lý do.

### 8.3 Cưỡng chế

- **`FieldPolicyInterceptor`** (interceptor toàn cục, chỉ chạy khi endpoint có `@FieldResource` và token là access token):
  - `POST`, `PUT`, `PATCH`: duyệt body thô, cả object, mảng lồng nhau (ví dụ các dòng màu cỡ); khóa nào trùng mã cột có mức khác `EDITABLE` mà giá trị khác `undefined` (kể cả `null`) thì 403 `FIELD_READONLY`, `details.fields` liệt kê mã cột.
  - Interceptor chỉ thấy khóa có trong body. Lệnh thay toàn bộ danh sách con mà gửi mảng rỗng được (bỏ hết dòng), hay lệnh đổi một cột mà có chế độ không gửi cột đó (xem trước), thì service tự kiểm mức của cột (`FieldPolicyService.levels`) trước khi đọc dữ liệu: Phân bổ PO (`po-allocation.service.ts` `setFactory`), Phân bổ màu cỡ (`color-size.service.ts` `save`), Cập nhật tỷ lệ cắt (`cut-ratio.service.ts` `updateColorSizes`, cột `qty`), Xếp chuyền (`line-plan.service.ts` `saveLines`, cột `startDate`). Kiểm chạy trước khi đọc dòng, nên Id không tồn tại cũng nhận 403 `FIELD_READONLY` (không dò được Id).
  - Dữ liệu trả về (object, mảng; trừ file `StreamableFile`): duyệt mọi object lồng nhau, bỏ cột Ẩn, thay cột Che.
- **Xuất file:** `ExportService.csv` (`backend/src/platform/export/export.service.ts`) đi qua cùng `shape` với chế độ `EXPORT`; cột Ẩn không có trong file, cột Che ra `***`. Cột phụ suy ra từ cột khác (tên theo mã) khai `field` để theo chính sách của cột gốc. Ô bắt đầu bằng `= + - @` được thêm dấu nháy để chặn công thức Excel.
- **Sắp xếp, lọc, tìm:** sắp xếp, lọc hay tìm theo cột không xem được nguyên giá trị cũng làm lộ giá trị. `safeSort` bỏ tham số sắp xếp theo cột Ẩn/Che; `unreadable` trả các cột Ẩn/Che để module bỏ bộ lọc, cột tìm kiếm; hỏi giá trị cho popup lọc theo cột Ẩn/Che trả 403 `FIELD_NOT_READABLE` (`assertFilterField`, `backend/src/platform/data/column-filter.ts`).
- **Nhật ký:** `redact(resource, data)` bỏ cột nhạy cảm khỏi dữ liệu trước khi ghi `SysAuditLog`, vì màn Nhật ký hệ thống không đi qua chính sách cột. Module gọi hàm này khi ghi nhật ký có dữ liệu của tài nguyên.
- **Luật nghiệp vụ so với cột bị Che, Ẩn:** lưu bị chặn theo một cột người dùng không xem được vẫn để lộ giá trị qua kết quả 200/422 khi thử dần (ví dụ Lũy kế cắt không vượt `planQty`, quyết định 13.7). Không Che, Ẩn cột đó với vai trò được Sửa cột bị chặn.
- **Cột suy ra:** module dựng cột từ cột nguồn (ví dụ ĐVCS của nhà máy ở Phân bổ PO) phải lấy mức chặt hơn của các cột nguồn; `AccessLevel` được export cho việc này.
- **Nhật ký đọc dữ liệu nhạy cảm:** mỗi lần trả ra cột nhạy cảm có giá trị, không bị che, ghi một dòng `SysSensitiveReadLog` (người, ĐVCS, tài nguyên, các cột, số dòng, `VIEW` hay `EXPORT`). Lỗi ghi chỉ log, không làm hỏng request.

### 8.4 Giao diện

`GET /me/field-policies` trả `{ version, resources: { "<tài nguyên>": { "<cột>": "<mức>" } } }` cho các tài nguyên người dùng có quyền xem. Giao diện dùng để ẩn cột, hiện `***`, khóa ô; backend vẫn lọc (mục 15).

<a id="ngoai-le-theo-nguoi"></a>
## 9. Ngoại lệ theo người (L5)

ADR 0005.

- `SysUserPermissionOverride`: một người × một quyền → `ALLOW` hoặc `DENY`, có `ValidFromAt`, `ValidToAt` (tùy chọn) và lý do bắt buộc (DB: không rỗng; API: tối thiểu 3 ký tự). Mỗi cặp (người, quyền) một dòng; đặt lại thì cập nhật dòng đó.
- **Thứ tự quyết định:** Deny còn hiệu lực ⇒ mất quyền. Allow còn hiệu lực ⇒ có quyền. Không thì theo hợp các phép gán. Không khớp ⇒ từ chối.
- **Phạm vi của Allow** = hợp phạm vi của mọi phép gán của người đó đang có hiệu lực ở ĐVCS của phiên. Không có phép gán nào: cả ĐVCS của phiên; ở `A00` thì đóng an toàn (điều kiện `FACTORY` rỗng: tài nguyên `BRANCH` không thấy gì, tài nguyên dùng chung thấy hết). Allow không mở rộng ra ngoài ĐVCS đã chọn.
- **Deny `:view`** chặn hẳn tài nguyên: mất menu, danh sách, xuất file và đường sửa (luật ở mục 4.3).
- **Hẹn giờ:** ngoại lệ (và phép gán) bắt đầu hay hết hạn thì quyền tự đổi ở request đầu tiên qua mốc, không cần ai đổi quyền; dấu `X-Permission-Version` đổi theo để giao diện tải lại menu.
- **Chính sách cột theo người:** `SysFieldPolicy` với `SubjectType = 'USER'`, có hạn dùng và lý do bắt buộc, thắng mọi vai trò (mục 8.2). Ví dụ mẫu: `truongchuyen.b` được xem `cmPrice` của Xếp chuyền (Chỉ đọc) đến hết năm 2026.
- **Quản trị:** không đặt, sửa, gỡ ngoại lệ hay cột riêng cho chính mình; trần quyền quản trị áp cho cả ngoại lệ: không Allow, Deny hay gỡ ngoại lệ của quyền `admin.*` mà mình không có (mục 10). API: [Quản trị hệ thống](05-quan-tri-he-thong.md).

<a id="tran-quyen-quan-tri"></a>
## 10. Trần quyền quản trị, cấm tự nâng quyền

ADR 0004. Mục tiêu: chặn đường vòng "tạo tài khoản phụ rồi gán vai trò quản trị cao hơn", "đặt lại mật khẩu của người quyền cao hơn", "tự bật lại vai trò mình đang giữ".

- `PermissionService.assertAdminCeiling(actor, codes, message)`: người thao tác phải **đang có**, tại ĐVCS của phiên, mọi quyền `admin.*` trong `codes`. Thiếu thì 403 `SELF_ELEVATION_FORBIDDEN`, thông báo kèm các quyền thiếu.
- `assignedToUser(userId)`: mọi quyền gắn với một người qua vai trò (kể cả vai trò đang tắt, phép gán hết hạn) hoặc qua Allow theo người (kể cả hết hạn). Tài khoản tạm tắt nhưng có quyền cao vẫn được coi là có quyền cao khi xét ai được quản lý nó.
- Quyền nghiệp vụ (`order.*`, `hr.*`, `report.*`…) không bị giới hạn theo người thao tác: cấp quyền nghiệp vụ là việc của người giữ `admin.permission:update`. Đây là quyền rất mạnh.

| Thao tác | Không áp cho chính mình | Trần quyền xét trên |
|---|---|---|
| Gán vai trò cho người dùng | Có | Mọi quyền đang gắn với người đó, và mọi quyền của các vai trò mới |
| Gán ĐVCS cho người dùng | Có | Mọi quyền đang gắn với người đó |
| Đặt lại mật khẩu | Có | Mọi quyền đang gắn với người đó |
| Sửa người dùng (tắt, bật, mở khóa, tên, email) | Chỉ chặn tự vô hiệu hóa mình | Mọi quyền đang gắn với người đó (khi sửa người khác) |
| Phạm vi của phép gán | Có | Mọi quyền đang gắn với người đó |
| Ngoại lệ theo người (đặt, gỡ) | Có | Mọi quyền đang gắn với người đó, và chính quyền của ngoại lệ |
| Chính sách cột theo người (đặt, gỡ) | Có | Mọi quyền đang gắn với người đó |
| Ma trận quyền của vai trò | Vai trò mình đang giữ | Quyền hiện có và quyền mới của vai trò |
| Bật, tắt, xóa vai trò | Vai trò mình đang giữ | Quyền của vai trò |
| Chính sách cột của vai trò | Vai trò mình đang giữ | Không (chỉ cột nghiệp vụ) |
| Thêm bộ phận tích "Xưởng sản xuất", tích, bỏ tích, đổi ĐVCS, giải thể, khôi phục bộ phận là chuyền may (Sơ đồ tổ chức) | Bộ phận mang mã mà mình đang được giao phạm vi chuyền (`holdsLineScope`) | Người thao tác phải có `admin.permission:update` (mục 7.6) |

"Vai trò mình đang giữ", "đang được giao phạm vi chuyền" là có dòng `SysUserRole` (và dòng phạm vi), kể cả phép gán hết hạn hay chưa tới hạn. Code: `admin-users.service.ts`, `admin-access.service.ts`, `admin-grants.service.ts` trong `backend/src/platform/admin`; `backend/src/modules/hr/department.service.ts` (`assertCanChangeLines`).

Hệ quả: quản trị không tự gán thêm ĐVCS, vai trò cho mình. Nên có ít nhất hai tài khoản giữ quyền phân quyền để sửa quyền cho nhau (ADR 0014).

<a id="vai-tro-toan-quyen"></a>
## 11. Vai trò Toàn quyền

ADR 0014. Vai trò hệ thống `FULL_ACCESS` "Toàn quyền", gán cho tài khoản `admin`. Vai trò `ADMIN` vẫn chỉ xem dữ liệu nghiệp vụ (tách nhiệm vụ); người cần quản trị mà không sửa nghiệp vụ thì chỉ gán `ADMIN`.

### 11.1 Quyền được tính thế nào

- `fullAccessLetters(r)` (`backend/scripts/seed-data.ts`): tài nguyên không thuộc `admin.*` nhận đủ `VCUDE` (xem, thêm, sửa, xóa, xuất file), kể cả hành động chưa màn nào dùng; tài nguyên `admin.*` nhận đúng các chữ của cột `ADMIN` trong ma trận mẫu.
- Quyền `admin.*` chỉ cấp khi vai trò `ADMIN` **đang có** quyền đó trong DB (`adminRoleHas`, `bootstrapFullAccess`). Nhờ vậy quyền quản trị của Toàn quyền không vượt `ADMIN`, và người chỉ giữ `ADMIN` gán, gỡ, sửa được vai trò này theo trần quyền (mục 10). Bớt quyền `admin.*` của `ADMIN` thì phải bớt cả ở Toàn quyền, nếu không người chỉ giữ `ADMIN` không quản lý được nó nữa.
- **Cột:** chính sách cột mẫu cho `FULL_ACCESS` đặt mọi cột nhạy cảm là Sửa được; cột thường theo mặc định Sửa được. Cột tính sẵn (Thành tiền, Doanh số) không có trong DTO ghi nên vẫn không nhập được. Chính sách cột lấy mức mở nhất giữa các vai trò, nên `admin` (ADMIN + Toàn quyền) thấy đủ.
- **Phạm vi:** không kèm phạm vi, nên thấy mọi dòng ở ĐVCS đang làm việc, ở mọi ĐVCS được gán.
- Tài nguyên thêm sau: seed chạy lại cấp quyền mới cho vai trò này như các vai trò mẫu (quyền `admin.*` mới chỉ khi `ADMIN` đã có). `--sync-matrix` nạp lại đủ.

### 11.2 Tạo và gán

- `bootstrapFullAccess` (`backend/scripts/seed.ts`) tạo vai trò **một lần**, trong một transaction: vai trò (`IsSystem = 1`), quyền, chính sách cột, phép gán, nhật ký `SEED` (`EntityType = 'SysRole'`), tăng phiên bản quyền. Lỗi giữa chừng thì không còn gì; lần seed sau làm lại. `npm run migrate` chạy seed nên máy chủ có vai trò này sau khi migrate.
- Gán cho tài khoản khai `extraRoles: ['FULL_ACCESS']` (chỉ `admin`) khi tài khoản đang hoạt động **và** đang giữ `ADMIN` không kèm phạm vi, còn hiệu lực (`extraRoleBlocked`). Tài khoản quản trị đã bị cố ý hạ quyền thì không nhận lại quyền qua seed; seed in cảnh báo, ghi lý do vào nhật ký.
- Máy cài mới: gán khi tạo tài khoản `admin`, cùng `ADMIN`.
- Vai trò đã có thì seed không làm lại; quản trị gỡ Toàn quyền khỏi `admin` thì seed chạy lại không gán lại. Ngoại lệ có chủ đích: `npm run seed -- --sync-matrix` và `npm run reset:demo` gán lại (cùng điều kiện trên).
- Đã có vai trò tự tạo trùng mã `FULL_ACCESS` (không phải vai trò hệ thống): seed cảnh báo, không cấp quyền, không gán.

### 11.3 Luật vẫn giữ

- `A00` chỉ đọc với dữ liệu theo ĐVCS và dữ liệu có ĐVCS nguồn; dữ liệu dùng chung không có ĐVCS nguồn vẫn ghi được.
- Ghi theo ĐVCS đang làm việc; đơn hàng, PO theo luật ĐVCS nguồn (mục 6.5).
- Không tự đổi quyền của mình: `admin` không sửa được quyền, chính sách cột của Toàn quyền vì đang giữ vai trò này; không tự gán vai trò, ĐVCS, không tự đặt lại mật khẩu.
- Vai trò hệ thống: không tắt, không xóa được; muốn bớt thì gỡ khỏi người dùng hoặc bỏ quyền trong ma trận (bằng tài khoản quản trị khác).

<a id="nhat-ky"></a>
## 12. Nhật ký

### 12.1 `SysAuditLog`

- Chỉ ghi thêm: trigger `TR_SysAuditLog_AppendOnly` chặn UPDATE, DELETE.
- `AuditService` (`backend/src/platform/audit/audit.service.ts`):
  - `log(entry)`: ghi ngoài transaction, lỗi chỉ log (không làm hỏng đăng nhập hay thao tác chính).
  - `logMany(entries)`: ghi nhiều mục sau khi thao tác chính đã commit, lô 100.
  - `logStrict(entry, trx)`: ghi trong transaction của thay đổi; lỗi thì hủy cả thay đổi. **Bắt buộc cho thay đổi phân quyền.**
- Giá trị cắt theo độ dài cột (`Username` 50, `BranchCode` 10, `EntityType` 40, `EntityId` 40, `ActionCode` 30, `IpAddress` 45). `OldValue`, `NewValue` là JSON.
- `UserId`, `Username`, `BranchCode` là người thao tác và ĐVCS của phiên; với sự kiện đăng nhập là người đăng nhập. Không ghi mật khẩu, hash, token. Dữ liệu của tài nguyên có cột nhạy cảm phải qua `FieldPolicyService.redact` trước khi ghi.
- Xem ở Quản trị › Nhật ký hệ thống (`GET /admin/audit`): [Quản trị hệ thống](05-quan-tri-he-thong.md).

Mã hành động của phần đăng nhập và phân quyền:

| `ActionCode` | `EntityType` | Khi nào | Cách ghi |
|---|---|---|---|
| `LOGIN` | `Auth` | Đăng nhập đúng mật khẩu | `log` |
| `LOGIN_FAILED` | `Auth` | Sai mật khẩu (`{ failed, locked }`), tài khoản không có hoặc đã vô hiệu (`{ reason }`) | `log` |
| `LOGIN_LOCKED` | `Auth` | Đăng nhập khi tài khoản đang khóa | `log` |
| `SELECT_BRANCH` | `Auth` | Chọn hoặc đổi ĐVCS | `log` |
| `SELECT_BRANCH_DENIED` | `Auth` | Chọn ĐVCS không được phép (`{ branchCode }`) | `log` |
| `LOGOUT` | `Auth` | Đăng xuất | `log` |
| `USER_CREATE` | `SysUser` | Tạo tài khoản | `log` |
| `USER_UPDATE` | `SysUser` | Sửa tài khoản (tên, email, bật/tắt, mở khóa) | `logStrict` |
| `PASSWORD_RESET` | `SysUser` | Quản trị đặt lại mật khẩu (không kèm giá trị) | `logStrict` |
| `USER_ROLES` | `SysUser` | Gán vai trò (`oldValue.removedScopes`: phạm vi bị xóa theo) | `logStrict` |
| `USER_BRANCHES` | `SysUser` | Gán ĐVCS | `logStrict` |
| `USER_ROLE_SCOPE` | `SysUserRoleScope` | Đặt phạm vi của phép gán | `logStrict` |
| `OVERRIDE_CREATE`, `OVERRIDE_UPDATE`, `OVERRIDE_DELETE` | `SysUserPermissionOverride` | Ngoại lệ theo người | `logStrict` |
| `USER_FIELD_POLICY_CREATE`, `USER_FIELD_POLICY_UPDATE`, `USER_FIELD_POLICY_DELETE` | `SysFieldPolicy` | Cột riêng theo người | `logStrict` |
| `ROLE_FIELD_POLICY` | `SysFieldPolicy` | Chính sách cột của vai trò | `logStrict` |
| `ROLE_CREATE` | `SysRole` | Tạo vai trò (chưa có quyền) | `log` |
| `ROLE_UPDATE`, `ROLE_DELETE`, `ROLE_PERMISSIONS` | `SysRole` | Sửa, tắt, đổi ma trận quyền của vai trò | `logStrict` |
| `BRANCH_CREATE`, `BRANCH_IMPORT` | `SysBranch` | Thêm tay ĐVCS, chép ĐVCS từ BRAVO | `log` |
| `BRANCH_UPDATE` | `SysBranch` | Sửa, bật/tắt ĐVCS | `logStrict` |
| `SEED` | `System`, `SysRole` | Seed có thay đổi; tạo vai trò Toàn quyền | Ghi trực tiếp trong script |
| `LINE_SET_CHANGE` | `Department` | Đổi tập chuyền may ở Sơ đồ tổ chức: `oldValue`, `newValue` có mã, cờ "Xưởng sản xuất", ĐVCS, còn dùng; `newValue.Operation` (`CREATE`, `TICK`, `UNTICK`, `BRANCH`, `DISSOLVE`, `RESTORE`), `newValue.AffectedUsers` (người đang được giao phạm vi chuyền mã đó: tên đăng nhập, họ tên) | `logStrict` trong transaction `MES_Core` cùng lần tăng phiên bản, ngay sau commit `MES_Hr` (mục 7.6) |
| `USER_ROLE_SCOPE`, `SCOPE_DIMENSION_UPDATE`, `ORG_UNIT_RETIRE` | `SysUserRoleScope`, `SysScopeDimension`, `SysOrgUnit` | Migration `MES_Core/0009` chuyển phạm vi chuyền sang mã, đổi chiều `LINE` thành chiều giá trị, ngừng nút Xưởng, Chuyền (người `system`) | Ghi trực tiếp trong migration |
| `ROLE_PERMISSIONS` | `SysRole` | Migration `MES_Core/0010`, `0012`, `0013` cấp quyền cho vai trò hệ thống trên máy đã cài (người `migrate`; `newValue.by` là tên file migration) | Ghi trực tiếp trong migration |

`EntityId` của thao tác trên người dùng là Id người bị thay đổi; trên vai trò là Id vai trò; `LINE_SET_CHANGE` là Id bộ phận. Mã nhật ký của danh mục (Nhà máy SX) và của module (phòng ban: `CREATE`, `UPDATE`, `DISSOLVE`, `RESTORE`): tài liệu tương ứng.

### 12.2 `SysSensitiveReadLog`

Ghi khi cột nhạy cảm được trả ra không bị che (mục 8.3). Chỉ ghi thêm (trigger). Chưa có màn hay API đọc; xem bằng truy vấn trực tiếp.

<a id="ma-loi"></a>
## 13. Mã lỗi

Dạng body lỗi: [Kiến trúc](../ARCHITECTURE.md) mục 5.1. Bảng dưới là danh sách đủ các mã lỗi máy chủ trả: mã trong `Errors` (`backend/src/common/app.exception.ts`), mã do `AllExceptionsFilter` (`backend/src/common/http-exception.filter.ts`) đặt, `VALIDATION_FAILED` của `ValidationPipe` (`backend/src/app.factory.ts`) và mã service tạo thẳng bằng `new AppException`. Thông điệp bằng tiếng Việt, trừ `BAD_REQUEST` giữ thông điệp gốc của Nest. Điểm kiểm phát ra từng mã trong một request: [Luồng dữ liệu](../DATA_FLOWS.md) mục 2, 4.2.

| HTTP | `code` | Khi nào |
|---|---|---|
| 400 (hoặc HTTP của lỗi gốc) | `BAD_REQUEST` | `HttpException` của Nest không phải `AppException`, trừ 404 và 429 (ví dụ `ParseIntPipe` gặp `:id` không phải số) |
| 401 | `UNAUTHENTICATED` | Thiếu hoặc sai token; token tạm gọi API khác; phiên đã thu hồi; tài khoản đã vô hiệu; token tạm cấp trước khi đổi mật khẩu; refresh không hợp lệ |
| 401 | `TOKEN_EXPIRED` | Access token hoặc token tạm hết hạn |
| 401 | `INVALID_CREDENTIALS` | Sai tên đăng nhập hoặc mật khẩu (không phân biệt hai trường hợp) |
| 423 | `ACCOUNT_LOCKED` | Tài khoản đang khóa tạm; `details.until` là lúc hết khóa |
| 403 | `BRANCH_NOT_ALLOWED` | Chọn ĐVCS không được gán hoặc đã tắt; phiên đang ở ĐVCS vừa bị gỡ hoặc tắt |
| 403 | `ENDPOINT_NOT_DECLARED` | Endpoint chưa khai báo quyền truy cập, với request có access token hợp lệ (thiếu, sai token thì 401 `UNAUTHENTICATED` trước, mục 5.1) |
| 403 | `PERMISSION_DENIED` | Thiếu mã quyền của `@RequirePermission`. Service kiểm thêm quyền khi decorator không diễn tả được: lưu tạo lệnh cấp BTP mới, lập Kế hoạch may lần đầu cho chuyền trong ngày cần quyền Thêm (`grantsFor(scope, 'create')`); `GET /hr/departments/line-holders` cần Thêm hoặc Sửa Sơ đồ tổ chức |
| 403 | `AGGREGATE_READ_ONLY` | Ghi ở `A00` trên dữ liệu theo ĐVCS, có ĐVCS nguồn, hoặc ghi theo ĐVCS của nhà máy |
| 403 | `SCOPE_DENIED` | Tạo, sửa dữ liệu ra ngoài phạm vi được giao |
| 403 | `FACTORY_OF_OTHER_BRANCH` | Sửa dữ liệu dùng chung ghi theo ĐVCS của nhà máy (Phân bổ PO) mà có dòng thuộc nhà máy của ĐVCS khác; không dòng nào được ghi. `details.rows`, `details.total`: số dòng bị chặn, số dòng bị áp |
| 403 | `FIELD_READONLY` | Gửi giá trị cho cột không Sửa được; `details.fields` là mã cột |
| 403 | `FIELD_NOT_READABLE` | Hỏi giá trị cho popup lọc theo cột của cột bị Ẩn hoặc Che (`assertFilterField`, `backend/src/platform/data/column-filter.ts`), hoặc của cột suy ra từ cột bị Ẩn, Che (Đồng bộ tiến độ cắt, Phân bổ PO) |
| 403 | `SELF_ELEVATION_FORBIDDEN` | Tự đổi quyền của mình, hoặc vượt trần quyền quản trị |
| 404 | `NOT_FOUND` | Không có, thuộc ĐVCS khác, hoặc ngoài phạm vi (không phân biệt); lệnh lưu nhiều dòng kèm `details.ids` là các dòng đó (Kế hoạch chuẩn bị SX, Kế hoạch may). Đường dẫn API không có: "Không tìm thấy đường dẫn." |
| 409 | `CONFLICT` | Deadlock SQL Server (`AllExceptionsFilter`, "Thử lại sau vài giây"); luật nghiệp vụ chặn, dữ liệu vừa được người khác lưu, trùng mã, chờ khóa ứng dụng quá lâu (thông điệp nói cách xử lý) |
| 422 | `CODE_IMMUTABLE` | Sửa mã (vai trò, ĐVCS…) sau khi tạo |
| 422 | `VALIDATION_FAILED` | DTO sai (`ValidationPipe`, `details` là `[{ field, messages }]`); kiểm đầu vào ở service (`details` tùy màn) |
| 429 | `TOO_MANY_REQUESTS` | `AllExceptionsFilter` đổi mọi `HttpException` 429 sang mã này; backend hiện không có giới hạn tần suất nào phát ra 429 (mục 2.8) |
| 500 | `INTERNAL_ERROR` | Lỗi không lường trước (không phải `HttpException`, không phải deadlock); máy chủ ghi log kèm `traceId` |
| 500 | `RESOURCE_NOT_REGISTERED` | Repository chạy trên tài nguyên chưa khai báo hoặc sai bảng nguồn (lỗi lập trình, không phải lỗi người dùng) |
| 500 | `LINE_SCOPE_UPDATE_FAILED` | Bộ phận chuyền may đã lưu ở `MES_Hr` nhưng sau 3 lần vẫn chưa ghi được nhật ký `LINE_SET_CHANGE` và tăng phiên bản quyền; `details.department` là bộ phận đã lưu (màn hình hiện đúng dữ liệu; `null` khi đọc lại cũng lỗi), `details.departmentId` là Id. Máy chủ ghi log đủ để dựng lại nhật ký (mục 7.6). Tạo ở `PermissionService.recordLineSetChange` |
| 503 | `SYNC_NOT_READY` | API màn Đồng bộ dữ liệu (`SyncService`, `backend/src/platform/sync/sync.service.ts`) khi chưa có `MES_Sync`, tài khoản ứng dụng chưa được cấp quyền vào, hoặc chưa chạy migration ([Đồng bộ](09-dong-bo.md)) |

Giao diện tự sinh thêm hai mã 409 không đến từ máy chủ: `BRANCH_SWITCHED`, `BRANCH_CHANGED` (request bị giữ lại vì vừa đổi ĐVCS), xem `frontend/src/lib/api.ts`.

<a id="api-auth"></a>
## 14. API `/auth`

Tiền tố `/api/v1`. `backend/src/platform/auth/auth.controller.ts`. API `/me/*`, `/admin/*`: [Quản trị hệ thống](05-quan-tri-he-thong.md).

| Method, đường dẫn | Khai báo | Body | Kết quả | Lỗi chính | Nhật ký |
|---|---|---|---|---|---|
| `POST /auth/login` | `@Public` | `{ username: string (1–50, cắt khoảng trắng), password: string (1–200) }` | 200 `{ preAuthToken, user: { id, fullName }, branches: [{ code, name, isAggregate }] }`; `branches` là ĐVCS đang hoạt động được gán, theo `SortOrder`, `Code` | 401 `INVALID_CREDENTIALS`, 423 `ACCOUNT_LOCKED`, 422 `VALIDATION_FAILED` | `LOGIN`, `LOGIN_FAILED`, `LOGIN_LOCKED` |
| `POST /auth/select-branch` | `@Authenticated`, `@AllowPreAuth`; Bearer token tạm hoặc access token | `{ branchCode: string (≤ 10) }` | 200 `{ accessToken, expiresIn, branch: { code, name, isAggregate } }`, đặt cookie `mes_rt`. Dùng cả khi đổi ĐVCS | 401 `UNAUTHENTICATED` (tài khoản tắt, mật khẩu đã đổi, phiên đã thu hồi), 403 `BRANCH_NOT_ALLOWED` | `SELECT_BRANCH`, `SELECT_BRANCH_DENIED` |
| `POST /auth/refresh` | `@Public`; cookie `mes_rt` | không | 200 như `select-branch`, cùng ĐVCS của phiên, cookie mới | 401 `UNAUTHENTICATED` (không cookie, phiên thu hồi, hết hạn, tài khoản tắt, thua khi hai request cùng xoay), 403 `BRANCH_NOT_ALLOWED`. Lỗi dưới 500 xóa cookie | không |
| `POST /auth/logout` | `@Public`; cookie `mes_rt` | không | 204, xóa cookie, thu hồi phiên của cookie | không | `LOGOUT` |

`expiresIn` là số giây sống của access token (`JWT_ACCESS_TTL`). Body JSON của mọi route tối đa 512 KB (`app.factory.ts`).

<a id="frontend"></a>
## 15. Frontend phản chiếu quyền

Frontend chỉ ẩn, hiện, khóa; mọi quyết định thật ở backend. Chi tiết khung giao diện: [Giao diện](10-giao-dien.md).

- `useCan(code)`, `<Can permission>` (`frontend/src/shell/permissions.ts`, `Can.tsx`): kiểm mã quyền trong tập `permissions` của phiên (từ `GET /me/permissions`).
- Menu lấy từ `GET /me/menu`; đường dẫn của module không có trong menu thì giao diện báo 403.
- `useFieldPolicy(resource)` (`frontend/src/lib/fieldPolicy.ts`): mức của từng cột từ `GET /me/field-policies`; cột không đăng ký coi là Sửa được. `onlyEditable` bỏ khỏi dữ liệu gửi lên những trường không được sửa (server cũng từ chối).
- Header `X-Permission-Version` khác dấu đang giữ thì tải lại quyền, menu, chính sách cột và dữ liệu đang hiện. 401 thì refresh một lần (dùng chung một lời gọi); refresh hỏng thì kết thúc phiên. 403 `BRANCH_NOT_ALLOWED` thì kết thúc phiên kèm lý do.

<a id="bang-mes-core"></a>
## 16. Bảng `MES_Core` của phần phân quyền

Trạng thái sau mọi migration trong `backend/migrations/MES_Core/` (`0001_init.sql`, `0002_scope_field_override.sql`, `0007_production_factory.sql`; các migration khác không đổi các bảng này). Kiểu TypeScript ở `backend/src/platform/database/core.types.ts`.

Quy ước chung của các bảng dưới đây:

- Thời điểm `DATETIME2(3)`, lưu UTC, mặc định `SYSUTCDATETIME()` ở cột tạo.
- `CreatedBy`, `ModifiedBy` là `SysUser.Id` (không có khóa ngoại); dòng do seed tạo để trống.
- "Cột kiểm vết danh mục" = `CreatedAt DATETIME2(3) NOT NULL` (mặc định giờ UTC hiện tại), `CreatedBy INT NULL`, `ModifiedAt DATETIME2(3) NULL`, `ModifiedBy INT NULL`.
- Bảng gán (`SysUserBranch`, `SysUserRole`, `SysRolePermission`, `SysUserRoleScope`…) không sửa tại chỗ: đổi bằng xóa rồi thêm, có `SysAuditLog`, nên chỉ có `CreatedAt`, `CreatedBy`. Bảng danh mục không xóa vật lý, dùng `IsActive`.
- `SysBranch`, `SysOrgUnit`, `SysProductionFactory`: [Quản trị hệ thống](05-quan-tri-he-thong.md).

### `SysUser`

Tài khoản đăng nhập.

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | INT IDENTITY | NOT NULL | Khóa chính |
| `Username` | VARCHAR(50) | NOT NULL | Duy nhất (`UQ_SysUser_Username`), so theo collation của database. Màn Người dùng chỉ nhận 3–50 ký tự thường, số, `.`, `_`, `-` |
| `PasswordHash` | VARCHAR(255) | NOT NULL | argon2id; không lưu mật khẩu thô |
| `FullName` | NVARCHAR(100) | NOT NULL | |
| `Email` | VARCHAR(150) | NULL | |
| `EmployeeCode` | VARCHAR(30) | NULL | Dành cho nối với hồ sơ nhân viên sau này; code hiện không dùng |
| `FailedLoginCount` | INT | NOT NULL | Mặc định 0; số lần sai liên tiếp |
| `LockedUntilAt` | DATETIME2(3) | NULL | Khóa tạm tới lúc này |
| `LastLoginAt` | DATETIME2(3) | NULL | Lần đăng nhập đúng mật khẩu gần nhất |
| `IsActive` | BIT | NOT NULL | Mặc định 1; 0 = vô hiệu hóa |
| `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` | | | Cột kiểm vết danh mục |

### `SysUserSession`

Phiên đăng nhập, mỗi phiên gắn một ĐVCS. Không xóa; dòng thu hồi, hết hạn còn lại.

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | BIGINT IDENTITY | NOT NULL | Khóa chính; claim `sid` của access token |
| `UserId` | INT | NOT NULL | FK `SysUser(Id)`; index `IX_SysUserSession_UserId` |
| `RefreshTokenHash` | VARCHAR(128) | NOT NULL | SHA-256 hex của refresh token; duy nhất (`UQ_SysUserSession_Token`) |
| `BranchCode` | VARCHAR(10) | NULL | ĐVCS của phiên (không FK); code luôn ghi; phiên không có thì refresh từ chối |
| `IssuedAt` | DATETIME2(3) | NOT NULL | Mặc định giờ UTC lúc tạo |
| `ExpiresAt` | DATETIME2(3) | NOT NULL | Hạn phiên, đặt lại mỗi lần refresh |
| `RevokedAt` | DATETIME2(3) | NULL | Lúc thu hồi; khác NULL là phiên đã kết thúc |
| `IpAddress` | VARCHAR(45) | NULL | IP lúc tạo, cập nhật khi refresh |
| `UserAgent` | VARCHAR(255) | NULL | Lúc tạo phiên |

### `SysUserBranch`

ĐVCS người dùng được chọn khi đăng nhập.

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | INT IDENTITY | NOT NULL | Khóa chính |
| `UserId` | INT | NOT NULL | FK `SysUser(Id)`; index riêng |
| `BranchId` | INT | NOT NULL | FK `SysBranch(Id)`; index riêng |
| `IsDefault` | BIT | NOT NULL | Mặc định 0; chỉ lưu và hiện ở màn Người dùng, đăng nhập không dùng |
| `CreatedAt`, `CreatedBy` | DATETIME2(3), INT | NOT NULL, NULL | |

Ràng buộc: `UQ_SysUserBranch (UserId, BranchId)`.

### `SysUserProductionFactory`

**Không còn dùng** (ADR 0013 mục 11): Nhà máy SX lấy theo ĐVCS đăng nhập, không tích theo người. Code ứng dụng không đọc, không ghi bảng này; API gán ĐVCS bỏ qua `productionFactoryIds` nếu client cũ gửi. Chỉ `backend/scripts/reset-demo.ts` xóa dòng của tài khoản mẫu và test kiểm bảng không có dòng mới. Bảng giữ nguyên, chờ chốt xóa bằng migration.

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | INT IDENTITY | NOT NULL | Khóa chính |
| `UserId` | INT | NOT NULL | FK `SysUser(Id)` |
| `ProductionFactoryId` | INT | NOT NULL | FK `SysProductionFactory(Id)`; index `IX_SysUserProductionFactory_Factory` |
| `CreatedAt`, `CreatedBy` | DATETIME2(3), INT | NOT NULL, NULL | |

Ràng buộc: `UQ_SysUserProductionFactory (UserId, ProductionFactoryId)`.

### `SysRole`

Vai trò (danh mục).

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | INT IDENTITY | NOT NULL | Khóa chính |
| `Code` | VARCHAR(30) | NOT NULL | Duy nhất; không sửa sau khi tạo (service, 422 `CODE_IMMUTABLE`). Màn Vai trò nhận 2–30 ký tự chữ hoa, số, `_`, bắt đầu bằng chữ |
| `Name` | NVARCHAR(100) | NOT NULL | |
| `Description` | NVARCHAR(255) | NULL | |
| `SortOrder` | INT | NOT NULL | Mặc định 0 |
| `IsActive` | BIT | NOT NULL | Mặc định 1; 0 = không cấp quyền |
| `IsSystem` | BIT | NOT NULL | Mặc định 0; 1 = vai trò do seed tạo, không tắt, không xóa được |
| `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` | | | Cột kiểm vết danh mục |

### `SysUserRole`

Phép gán vai trò cho người dùng.

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | INT IDENTITY | NOT NULL | Khóa chính; `SysUserRoleScope.UserRoleId` trỏ tới |
| `UserId` | INT | NOT NULL | FK `SysUser(Id)`; index riêng |
| `RoleId` | INT | NOT NULL | FK `SysRole(Id)`; index riêng |
| `ValidFromAt` | DATETIME2(3) | NULL | Bắt đầu hiệu lực; NULL = ngay. Được tính quyền, chưa có API đặt |
| `ValidToAt` | DATETIME2(3) | NULL | Hết hiệu lực (tính cả mốc này); NULL = không hạn. Không có CHECK thứ tự với `ValidFromAt` |
| `CreatedAt`, `CreatedBy` | DATETIME2(3), INT | NOT NULL, NULL | |

Ràng buộc: `UQ_SysUserRole (UserId, RoleId)`.

### `SysUserRoleScope`

Phạm vi của một phép gán (mục 7). Không có dòng cho một chiều = không giới hạn ở chiều đó.

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | INT IDENTITY | NOT NULL | Khóa chính |
| `UserRoleId` | INT | NOT NULL | FK `SysUserRole(Id)`, **không xóa dây chuyền**: service xóa phạm vi (kèm nhật ký) trước khi xóa phép gán |
| `DimensionId` | INT | NOT NULL | FK `SysScopeDimension(Id)`; index riêng |
| `ScopeMode` | VARCHAR(15) | NOT NULL | `ALL`, `ORG_SUBTREE`, `LIST`, `OWN` (`CK_SysUserRoleScope_Mode`) |
| `OrgUnitId` | INT | NULL | FK `SysOrgUnit(Id)`; index riêng. Chỉ chiều có `OrgType` (`FACTORY`) |
| `ScopeValue` | VARCHAR(60) | NULL | Giá trị cho chiều không có `OrgType`. Chiều `LINE`: mã bộ phận chuyền; `~<mã>` là phạm vi cũ vốn không có tác dụng do `MES_Core/0009` ghi (mục 7.6) |
| `CreatedAt`, `CreatedBy` | DATETIME2(3), INT | NOT NULL, NULL | |

Ràng buộc:
- `CK_SysUserRoleScope_Value`: `ORG_SUBTREE` cần `OrgUnitId`, không `ScopeValue`; `LIST` cần đúng một trong hai (`ScopeValue` không rỗng); `ALL`, `OWN` không có cả hai.
- `UQ_SysUserRoleScope (UserRoleId, DimensionId, ScopeMode, OrgUnitId, ScopeValue)`.

### `SysScopeDimension`

Danh mục chiều phạm vi. Migration `0002` tạo ba dòng hệ thống: `FACTORY` (tên "Đơn vị cơ sở" từ `0007`, `OrgType = 'FACTORY'`), `LINE` (Chuyền; `OrgType` NULL từ `0009`, trước đó `'LINE'`), `OWNER` (Người tạo, `OrgType` NULL). Code ứng dụng dựa vào ba mã này.

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | INT IDENTITY | NOT NULL | Khóa chính |
| `Code` | VARCHAR(20) | NOT NULL | Duy nhất |
| `Name` | NVARCHAR(100) | NOT NULL | |
| `Description` | NVARCHAR(255) | NULL | |
| `OrgType` | VARCHAR(10) | NULL | `FACTORY` hoặc `LINE` (CHECK `CK_SysScopeDimension_OrgType`); NULL = chiều giá trị. Hiện chỉ `FACTORY` có giá trị |
| `SortOrder` | INT | NOT NULL | Mặc định 0 |
| `IsActive` | BIT | NOT NULL | Mặc định 1; chiều tắt thì phạm vi theo chiều đó đóng an toàn |
| `IsSystem` | BIT | NOT NULL | Mặc định 0; ba chiều trên là 1 |
| `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` | | | Cột kiểm vết danh mục |

### `SysResourceScopeBinding`

Tài nguyên lọc theo chiều nào, qua cột nào của bảng nguồn (mục 7.3).

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | INT IDENTITY | NOT NULL | Khóa chính |
| `ResourceId` | INT | NOT NULL | FK `SysResource(Id)` |
| `DimensionId` | INT | NOT NULL | FK `SysScopeDimension(Id)`; index riêng |
| `ColumnName` | VARCHAR(128) | NOT NULL | Tên cột của bảng nguồn; chỉ chữ, số, `_`, không rỗng (`CK_SysResScopeBinding_Column`) |
| `CreatedAt`, `CreatedBy` | DATETIME2(3), INT | NOT NULL, NULL | |

Ràng buộc: `UQ_SysResourceScopeBinding (ResourceId, DimensionId)`.

### `SysResource`

Resource Registry: tài nguyên được bảo vệ (danh mục).

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | INT IDENTITY | NOT NULL | Khóa chính |
| `Code` | VARCHAR(60) | NOT NULL | Duy nhất; dạng `module.resource` |
| `Name` | NVARCHAR(100) | NOT NULL | Tên màn |
| `ModuleCode` | VARCHAR(30) | NOT NULL | `order`, `hr`, `admin`… |
| `ScopeType` | VARCHAR(10) | NOT NULL | `BRANCH` hoặc `SHARED` (`CK_SysResource_ScopeType`) |
| `SourceTable` | VARCHAR(128) | NULL | Tên bảng mà repository của tài nguyên đọc, không kèm tên database; phải khớp `table` của repository |
| `Description` | NVARCHAR(255) | NULL | |
| `SortOrder` | INT | NOT NULL | Mặc định 0 |
| `IsActive` | BIT | NOT NULL | Mặc định 1; tắt thì quyền, menu, repository của tài nguyên ngừng |
| `IsSystem` | BIT | NOT NULL | Mặc định 0; seed đồng bộ tên, bảng nguồn, loại phạm vi, thứ tự của dòng hệ thống |
| `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` | | | Cột kiểm vết danh mục |

### `SysResourceField`

Cột đăng ký của tài nguyên (mục 8.1).

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | INT IDENTITY | NOT NULL | Khóa chính |
| `ResourceId` | INT | NOT NULL | FK `SysResource(Id)` |
| `Code` | VARCHAR(60) | NOT NULL | Trùng tên trường JSON của API |
| `Name` | NVARCHAR(100) | NOT NULL | Tên hiện ở màn Chính sách cột |
| `Description` | NVARCHAR(255) | NULL | |
| `IsSensitive` | BIT | NOT NULL | Mặc định 0; 1 = nhạy cảm, mặc định Ẩn với vai trò không khai báo |
| `SortOrder` | INT | NOT NULL | Mặc định 0 |
| `IsActive` | BIT | NOT NULL | Mặc định 1 |
| `IsSystem` | BIT | NOT NULL | Mặc định 0 |
| `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` | | | Cột kiểm vết danh mục |

Ràng buộc: `UQ_SysResourceField (ResourceId, Code)` (đích của khóa ngoại ghép từ `SysFieldPolicy`).

### `SysPermission`

Quyền `<tài nguyên>:<hành động>` (danh mục, seed sinh).

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | INT IDENTITY | NOT NULL | Khóa chính |
| `Code` | VARCHAR(80) | NOT NULL | Duy nhất; ví dụ `order.po:view` |
| `ResourceId` | INT | NOT NULL | FK `SysResource(Id)`; index riêng |
| `ActionCode` | VARCHAR(20) | NOT NULL | `view`, `create`, `update`, `delete`, `export` |
| `Name` | NVARCHAR(150) | NOT NULL | "Xem: <tên tài nguyên>"… |
| `Description` | NVARCHAR(255) | NULL | |
| `SortOrder` | INT | NOT NULL | Mặc định 0 |
| `IsActive` | BIT | NOT NULL | Mặc định 1 |
| `IsSystem` | BIT | NOT NULL | Mặc định 0 |
| `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` | | | Cột kiểm vết danh mục |

Ràng buộc: `UQ_SysPermission_ResourceAction (ResourceId, ActionCode)`.

### `SysRolePermission`

Quyền của vai trò.

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | INT IDENTITY | NOT NULL | Khóa chính |
| `RoleId` | INT | NOT NULL | FK `SysRole(Id)`; index riêng |
| `PermissionId` | INT | NOT NULL | FK `SysPermission(Id)`; index riêng |
| `CreatedAt`, `CreatedBy` | DATETIME2(3), INT | NOT NULL, NULL | |

Ràng buộc: `UQ_SysRolePermission (RoleId, PermissionId)`.

### `SysUserPermissionOverride`

Ngoại lệ theo người (mục 9).

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | INT IDENTITY | NOT NULL | Khóa chính |
| `UserId` | INT | NOT NULL | FK `SysUser(Id)`; index riêng |
| `PermissionId` | INT | NOT NULL | FK `SysPermission(Id)`; index riêng |
| `Effect` | VARCHAR(5) | NOT NULL | `ALLOW` hoặc `DENY` |
| `ValidFromAt` | DATETIME2(3) | NULL | NULL = ngay |
| `ValidToAt` | DATETIME2(3) | NULL | NULL = không hạn; tính cả mốc này |
| `Reason` | NVARCHAR(255) | NOT NULL | Lý do, không rỗng (`CK_SysUserPermOverride_Reason`) |
| `CreatedAt`, `CreatedBy` | DATETIME2(3), INT | NOT NULL, NULL | |

Ràng buộc: `CK_SysUserPermOverride_Effect`; `CK_SysUserPermOverride_Valid` (`ValidFromAt < ValidToAt` khi có cả hai); `UQ_SysUserPermOverride (UserId, PermissionId)`.

### `SysFieldPolicy`

Chính sách cột theo vai trò hoặc theo người (mục 8).

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | INT IDENTITY | NOT NULL | Khóa chính |
| `SubjectType` | VARCHAR(10) | NOT NULL | `ROLE` hoặc `USER` (`CK_SysFieldPolicy_Subject`) |
| `SubjectId` | INT | NOT NULL | `SysRole.Id` hoặc `SysUser.Id` theo `SubjectType`; không có khóa ngoại vật lý |
| `ResourceId` | INT | NOT NULL | FK `SysResource(Id)`; index riêng |
| `FieldCode` | VARCHAR(60) | NOT NULL | Mã cột; FK ghép `(ResourceId, FieldCode)` → `SysResourceField (ResourceId, Code)` |
| `AccessLevel` | VARCHAR(10) | NOT NULL | `HIDDEN`, `MASKED`, `READONLY`, `EDITABLE` (`CK_SysFieldPolicy_Access`) |
| `CreatedAt`, `CreatedBy` | DATETIME2(3), INT | NOT NULL, NULL | |
| `ValidFromAt` | DATETIME2(3) | NULL | Chỉ dòng `USER` |
| `ValidToAt` | DATETIME2(3) | NULL | Chỉ dòng `USER`; tính cả mốc này |
| `Reason` | NVARCHAR(255) | NULL | Bắt buộc, không rỗng với dòng `USER` |

Ràng buộc:
- `UQ_SysFieldPolicy (SubjectType, SubjectId, ResourceId, FieldCode)`.
- `CK_SysFieldPolicy_UserReason`: dòng `USER` phải có lý do.
- `CK_SysFieldPolicy_Valid`: `ValidFromAt < ValidToAt` khi có cả hai.
- `CK_SysFieldPolicy_ValidUserOnly`: dòng `ROLE` không có hạn dùng.

### `SysPermissionVersion`

Phiên bản quyền (mục 5.4).

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | INT | NOT NULL | Khóa chính; chỉ được bằng 1 (`CK_SysPermissionVersion_Single`) |
| `Version` | BIGINT | NOT NULL | Migration tạo dòng `(1, 1)`; tăng 1 mỗi lần đổi phân quyền |
| `ModifiedAt` | DATETIME2(3) | NOT NULL | Mặc định giờ UTC; cập nhật mỗi lần tăng |

### `SysMenu`

Cây menu (danh mục, seed nạp, mục 4.4).

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | INT IDENTITY | NOT NULL | Khóa chính |
| `Code` | VARCHAR(60) | NOT NULL | Duy nhất; `menu.<module>` (nhóm), `menu.<tài nguyên>` (lá) |
| `Name` | NVARCHAR(100) | NOT NULL | |
| `ParentId` | INT | NULL | FK `SysMenu(Id)` (tự tham chiếu); NULL ở nhóm gốc; index riêng |
| `Path` | VARCHAR(150) | NULL | Đường dẫn màn (lá) |
| `Icon` | VARCHAR(50) | NULL | Tên biểu tượng (nhóm) |
| `ResourceId` | INT | NULL | FK `SysResource(Id)`; NULL ở nhóm; index riêng |
| `IsMobile` | BIT | NOT NULL | Mặc định 0; màn dùng trên điện thoại |
| `Description` | NVARCHAR(255) | NULL | |
| `SortOrder` | INT | NOT NULL | Mặc định 0 |
| `IsActive` | BIT | NOT NULL | Mặc định 1 |
| `IsSystem` | BIT | NOT NULL | Mặc định 0; seed đồng bộ tên, đường dẫn, thứ tự của dòng hệ thống |
| `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` | | | Cột kiểm vết danh mục |

### `SysAuditLog`

Nhật ký hệ thống, chỉ ghi thêm (mục 12.1).

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | BIGINT IDENTITY | NOT NULL | Khóa chính |
| `EventAt` | DATETIME2(3) | NOT NULL | Mặc định giờ UTC |
| `UserId` | INT | NULL | Người thao tác (NULL với việc của hệ thống) |
| `Username` | VARCHAR(50) | NULL | |
| `BranchCode` | VARCHAR(10) | NULL | ĐVCS của phiên lúc thao tác |
| `EntityType` | VARCHAR(40) | NOT NULL | `Auth`, `SysUser`, `SysRole`, tên bảng nghiệp vụ… |
| `EntityId` | VARCHAR(40) | NULL | |
| `ActionCode` | VARCHAR(30) | NOT NULL | Mục 12.1 |
| `OldValue` | NVARCHAR(MAX) | NULL | JSON |
| `NewValue` | NVARCHAR(MAX) | NULL | JSON |
| `IpAddress` | VARCHAR(45) | NULL | |

Chỉ mục: `IX_SysAuditLog_EventAt (EventAt DESC)`, `IX_SysAuditLog_Entity (EntityType, EntityId)`, `IX_SysAuditLog_UserId (UserId, EventAt DESC)`. Trigger `TR_SysAuditLog_AppendOnly` (INSTEAD OF UPDATE, DELETE) báo lỗi.

### `SysSensitiveReadLog`

Nhật ký đọc dữ liệu nhạy cảm, chỉ ghi thêm (mục 8.3).

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | BIGINT IDENTITY | NOT NULL | Khóa chính |
| `ReadAt` | DATETIME2(3) | NOT NULL | Mặc định giờ UTC |
| `UserId` | INT | NULL | |
| `Username` | VARCHAR(50) | NULL | |
| `BranchCode` | VARCHAR(10) | NULL | ĐVCS của phiên |
| `ResourceCode` | VARCHAR(60) | NOT NULL | Mã tài nguyên |
| `FieldCodes` | VARCHAR(2000) | NOT NULL | Các mã cột nhạy cảm được trả, cách nhau dấu phẩy |
| `RecordCount` | INT | NOT NULL | Số dòng (mảng, hoặc `items` của trang, còn lại 1) |
| `ActionCode` | VARCHAR(10) | NOT NULL | `VIEW` hoặc `EXPORT` (`CK_SysSensitiveReadLog_Action`) |
| `IpAddress` | VARCHAR(45) | NULL | |

Chỉ mục: `IX_SysSensitiveReadLog_ReadAt (ReadAt DESC)`, `IX_SysSensitiveReadLog_UserId (UserId, ReadAt DESC)`. Trigger `TR_SysSensitiveReadLog_AppendOnly` (INSTEAD OF UPDATE, DELETE) báo lỗi.

<a id="test"></a>
## 17. Test bảo vệ các luật

Test backend chạy trên database thật (cần migrate, seed trước), dùng tài khoản mẫu; cách chạy và bộ database test riêng: [Dữ liệu mẫu và kiểm thử](12-du-lieu-mau-va-kiem-thu.md). Sửa phần phân quyền thì phải giữ các test này qua và thêm test cho luật mới.

| File (`backend/test/`) | Luật được bảo vệ |
|---|---|
| `auth.spec.ts` | `health` công khai; không token 401; sai mật khẩu 401 `INVALID_CREDENTIALS`; thiếu dữ liệu 422; đăng nhập trả token tạm và ĐVCS được phép; token tạm không gọi được API dữ liệu; chọn ĐVCS được phép thì token mang `BranchCode`, không được phép (kể cả `A00`) 403; menu lọc theo quyền; quyền Trưởng chuyền đúng ma trận; endpoint không khai báo 403 `ENDPOINT_NOT_DECLARED`; `@RequirePermission` thiếu quyền 403, đủ 200; refresh xoay vòng, logout thu hồi; sai quá ngưỡng 423 |
| `review-fixes.spec.ts` | Sai mật khẩu song song vẫn đếm đủ và khóa; đăng xuất không cần access token; thu hồi phiên thì access token còn hạn 401; đặt lại mật khẩu làm hỏng access token và token tạm cũ; không tin `X-Forwarded-For`; `@RequirePermission` ở method thắng `@Authenticated` ở class; không tự bật lại vai trò mình giữ; người chỉ quản lý tài khoản không đặt lại mật khẩu của admin; không gán vai trò quản trị cao hơn cho tài khoản phụ; không tự đặt lại mật khẩu; vô hiệu rồi bật lại dùng được ngay; không tắt ĐVCS đang làm việc |
| `phase3.spec.ts` | Lọc ĐVCS (danh sách, Id của ĐVCS khác 404, `branchCode` client gửi bị bỏ qua, đơn hàng dùng chung đóng dấu ĐVCS phiên); `A00` đọc mọi ĐVCS, ghi 403 `AGGREGATE_READ_ONLY`, tài khoản bị vô hiệu thì token cũ 401; menu, API theo vai trò; đổi quyền có hiệu lực ngay và có nhật ký; `SELF_ELEVATION_FORBIDDEN`; mã ĐVCS không sửa được; không tạo `A00`, không tắt đơn vị tổng hợp; vai trò hệ thống không xóa được; Resource Registry từ chối bảng nguồn sai, tài nguyên lạ |
| `phase5.spec.ts` | L3: phạm vi chuyền theo mã bộ phận (Phân bổ màu cỡ, Xếp chuyền, Kế hoạch chuẩn bị SX, `A00` chỉ đọc), phạm vi chuyền kiểu cũ và mã `~…` thành rỗng, bỏ tích chuyền thì mất ngay, nguồn chuyền lỗi thì từ chối, `/admin/scope-catalog` lấy chuyền từ bộ phận, phạm vi theo ĐVCS của phép gán không rò sang phép gán khác, "chỉ của mình", Kế toán ở `A00`/A03, tổ hợp sai 422, không tự đặt phạm vi. L5: Deny xem chặn hẳn, Allow, Allow hết hạn, Allow ở `A00` đóng an toàn, ngoại lệ hẹn giờ và header phiên bản, lý do bắt buộc. L4: Ẩn mặc định, Che, theo người thắng vai trò, không sắp xếp/lọc/tìm theo cột Ẩn/Che, `FIELD_READONLY` cả trong danh sách lồng, xuất file và nhật ký đọc nhạy cảm, nhật ký không chứa giá, vai trò không liên quan không mở cột, đổi chính sách vai trò có hiệu lực ngay, xem thử quyền. Đơn hàng: `originBranch`, `usedBy`, `assignedFactories`, deadlock thành 409 |
| `full-access.spec.ts` | Toàn quyền ghi được nghiệp vụ ở ĐVCS cụ thể và thấy cột giá; ở `A00` vẫn chỉ đọc; `admin` không tự sửa quyền, chính sách cột của vai trò mình giữ; người chỉ giữ `ADMIN` gán, gỡ được Toàn quyền |
| `seed.spec.ts` | `bootstrapFullAccess`: quyền nghiệp vụ đủ, máy đã cài chưa có vai trò thì `runSeed` tạo và gán cho `admin`, quyền quản trị không vượt `ADMIN`, cột nhạy cảm Sửa được, một transaction, không gán khi `admin` bị hạ quyền, `--sync-matrix` gán lại, gỡ rồi không gán lại; seed không cấp lại vai trò, ĐVCS đã thu hồi |
| `catalog.spec.ts` | Nhà máy SX thuộc ĐVCS vào quyền của phiên ngay khi thêm, đổi ĐVCS, tắt; không còn ghi `SysUserProductionFactory`; đổi ĐVCS, bật/tắt Nhà máy SX cần `admin.permission:update`; API danh mục chuyền, xưởng cũ trả 404 |
| `column-filter.spec.ts` | Giá trị cho popup lọc trong phạm vi được xem; cột Che 403 `FIELD_NOT_READABLE`, bộ lọc theo cột đó bị bỏ |
| `po-allocation-write.spec.ts` | `factoryBranchWrite`: dòng thuộc nhà máy của ĐVCS khác 403 `FACTORY_OF_OTHER_BRANCH` (kể cả khi chỉ một dòng cùng khóa), dòng chưa có nhà máy, nhà máy chưa gắn ĐVCS hoặc chưa vào danh mục thì ĐVCS nào cũng sửa được; `A00` 403; thiếu quyền Sửa 403; cột Nhà máy SX Chỉ đọc 403 `FIELD_READONLY` |
| `hr.spec.ts` | Deny by default ở module Nhân sự; dữ liệu dùng chung sửa được ở mọi ĐVCS; cột nhạy cảm của nhân viên theo vai trò, cả file xuất; chuyền may: tích, bỏ tích, đổi ĐVCS, giải thể, khôi phục cần `admin.permission:update` và tăng phiên bản quyền, người đang giữ phạm vi mã đó không tự làm, `line-holders`, nhật ký `LINE_SET_CHANGE`, lỗi tăng phiên bản thành `LINE_SCOPE_UPDATE_FAILED` |
| `line-source.spec.ts` | `OrgService`: chưa có nguồn thì không có chuyền (đóng an toàn), nguồn lỗi đi tới bên gọi và không cache, lần đọc cũ không ghi đè sau `invalidate`, tên chuyền mồ côi |
| `phase5-line-scope-migration.spec.ts` | Migration `MES_Core/0009` trên phạm vi cũ: danh sách nút thành mã, cả nhánh thành chuyền đang dùng, dòng vô tác dụng thành `~mã`, bỏ trùng, chiều khác giữ nguyên, nhật ký, tăng phiên bản (chạy trong transaction rồi hủy) |
| `po-allocation-grant-migration.spec.ts`, `cutting-grant-migration.spec.ts`, `cutting-supply-grant-migration.spec.ts` | Migration cấp quyền cho máy đã cài (`MES_Core/0010`, `0012`, `0013`; chạy trong transaction rồi hủy): chỉ cấp cho vai trò hệ thống (`0010`: `PLANNER`, `FULL_ACCESS`; `0012`, `0013`: `PLANNER` còn quyền Xem, đã bị gỡ Xem thì không cấp), không đổi vai trò khác, chạy lại không trùng, nhật ký `ROLE_PERMISSIONS` như màn Vai trò, tăng phiên bản quyền; database chưa seed thì không làm gì |
| `shipment-plan-pos.spec.ts` | Dữ liệu PO trong khung PO của kế hoạch theo quyền, phạm vi, chính sách cột của `order.po` (ADR 0006): kế hoạch của ĐVCS khác 404, `A00` xem được; Chặn `order.po:view` thì 403 `PERMISSION_DENIED` dù xem được kế hoạch; Số lượng bị Che thì cột suy ra cũng che, Trạng thái bị Ẩn thì bỏ cả cột suy ra; PO ngoài phạm vi "chỉ bản ghi do mình tạo" không hiện, chỉ đếm (`hiddenCount`) |
| `sewing.spec.ts` | Kế hoạch chuẩn bị SX (`order.prep`): Trưởng chuyền chỉ thấy chuyền được giao, không sửa được (403); dòng ngoài chuyền được giao theo Id 404; `A00` xem mọi ĐVCS, ghi 403 `AGGREGATE_READ_ONLY` kể cả với vai trò có quyền Sửa; lưu trên bảng có dòng của ĐVCS khác hoặc ngoài chuyền được giao thì 404 kèm `details.ids`, không ghi gì; các bước Chỉ đọc thì 403 `FIELD_READONLY`, bị Ẩn thì không có trong dữ liệu và file xuất; Mã hàng bị Che thì câu báo xung đột không nêu mã hàng; Tổ SX bị Che thì không trả tên chuyền; số liệu đầu màn theo phạm vi và chính sách cột |
| `cutting.spec.ts` | Đồng bộ tiến độ cắt (`cutting.progress`): `ShipmentPlanFeed` và danh sách lọc theo ĐVCS của phiên, `A00` thấy mọi ĐVCS; kế hoạch của ĐVCS khác 404; `A00` lưu 403 `AGGREGATE_READ_ONLY`; Giám đốc, Trưởng chuyền không lưu được, Kế hoạch không Xóa số cắt (403, theo ma trận mẫu); SL KH bị Che thì +/- và Trạng thái cũng che, không lọc, không sắp xếp theo +/- (giá trị lọc 403); Trong ngày Chỉ đọc thì 403 `FIELD_READONLY`, kể cả gửi `null`; xuất file theo chính sách cột. Danh sách đủ: [Cắt](15-cat.md) |
| `cutting-supply.spec.ts` | Xác nhận cấp BTP (`cutting.supply`): `LineColorSizeFeed` lọc theo ĐVCS của phiên, `A00` thấy mọi ĐVCS; `A00` xem được; lưu 403 `AGGREGATE_READ_ONLY`, tính lưới nhập (`POST /cutting/supply/sheet`) và Xác nhận cấp cũng 403; Giám đốc không lưu được, Trưởng chuyền không xem được (403); lệnh của ĐVCS khác 404 (xem, xóa); thiếu quyền Thêm thì vẫn lưu lệnh đã có, không tạo được lệnh mới (403); SL kế hoạch bị Che thì Còn lại cũng che, câu báo vượt không nêu số; Số lượng cấp trong ngày Chỉ đọc thì 403 `FIELD_READONLY`; xuất file theo chính sách cột. Danh sách đủ: [Cắt](15-cat.md) |
| `sewing-plan.spec.ts` | Kế hoạch may (`sewing.plan`): `ScheduleFeed.dayPlanLines` lọc ĐVCS theo phiên; `A00` xem được, Cập nhật 403 `AGGREGATE_READ_ONLY`, Chốt 403; Giám đốc không lưu được; Trưởng chuyền chỉ thấy chuyền được giao, Giá CM, Doanh số kế hoạch Ẩn theo mặc định; ĐVCS khác không thấy dòng, lưu 404; lập lần đầu cho chuyền trong ngày cần quyền Thêm (403); Tổng kế hoạch bị Che thì Còn lại không trả, câu báo vượt không nêu số; Kế hoạch ngày xưởng giao Chỉ đọc thì 403 `FIELD_READONLY`; sửa riêng Giá CM theo `usedBy` (ĐVCS có kế hoạch của đơn sửa được; cột khác của đơn, đơn chưa có kế hoạch ở ĐVCS này 404; `A00` 403 `AGGREGATE_READ_ONLY`; Giám đốc 403); nhật ký không kèm giá. Danh sách đủ: [May](07-may.md) |
