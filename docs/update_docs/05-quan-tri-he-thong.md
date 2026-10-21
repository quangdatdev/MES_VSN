# Quản trị hệ thống

File này mô tả nhóm menu **Quản trị**: các màn Người dùng, Vai trò, Phân quyền, Chính sách cột, Đơn vị cơ sở, Danh mục hệ thống, Nhật ký hệ thống; toàn bộ API `/admin/*` và `/me`; các bảng danh mục của `MES_Core` (`SysBranch`, `SysOrgUnit`, `SysCatalog`, `SysCatalogItem`, `SysShift`, `SysProductionFactory`, `SysWorkCalendar`, `SysWorkCalendarDay`).
Đọc khi sửa màn quản trị, thêm danh mục, hoặc cần biết thao tác quản trị nào đổi phân quyền. Luật phân quyền (5 lớp, `BaseRepository`, trần quyền quản trị, chính sách cột, vai trò Toàn quyền) nằm ở [04-phan-quyen.md](04-phan-quyen.md); ở đây chỉ nêu phần áp vào từng màn.

## Nhóm menu Quản trị

Menu, tài nguyên và quyền là dữ liệu do seed tạo (`backend/scripts/seed-data.ts`, mảng `resources`, nhóm `admin` tên "Quản trị", icon `settings`, nằm cuối menu). Mọi tài nguyên `admin.*` có `ScopeType = SHARED`. Mỗi tài nguyên có đủ 5 quyền `view`, `create`, `update`, `delete`, `export` trong `SysPermission`, kể cả quyền chưa màn nào dùng.

| Thứ tự | Màn | Route | Tài nguyên | Seed cấp cho `ADMIN` | Frontend | Backend |
|---|---|---|---|---|---|---|
| 1 | Người dùng | `/admin/users` | `admin.user` | Xem, Thêm, Sửa, Xóa | `frontend/src/features/admin/UsersPage.tsx`, `UserAccessDrawer.tsx`, `UserBranchesDialog.tsx`, `UserEmployeeDialog.tsx` | `backend/src/platform/admin/admin-users.service.ts`, `admin-grants.service.ts` |
| 2 | Vai trò | `/admin/roles` | `admin.role` | Xem, Thêm, Sửa, Xóa | `frontend/src/features/admin/RolesPage.tsx` | `backend/src/platform/admin/admin-access.service.ts` |
| 3 | Phân quyền | `/admin/permissions` | `admin.permission` | Xem, Sửa | `frontend/src/features/admin/PermissionsPage.tsx` | `admin-access.service.ts` |
| 4 | Chính sách cột | `/admin/field-policies` | `admin.fieldpolicy` | Xem, Sửa | `frontend/src/features/admin/FieldPoliciesPage.tsx` | `admin-grants.service.ts` |
| 5 | Đơn vị cơ sở | `/admin/branches` | `admin.branch` | Xem, Thêm, Sửa | `frontend/src/features/admin/BranchesPage.tsx` | `admin-branches.service.ts`, `branch-import.ts` |
| 6 | Danh mục hệ thống | `/admin/catalogs` | `admin.catalog` | Xem, Thêm, Sửa | `frontend/src/features/admin/CatalogsPage.tsx`, `PrepStepsPane.tsx` | `backend/src/platform/catalog/*` |
| 7 | Nhật ký hệ thống | `/admin/audit` | `admin.audit` | Xem, Xuất file | `frontend/src/features/admin/AuditPage.tsx` | `admin-audit.service.ts` |
| 8 | Đồng bộ dữ liệu | `/admin/sync` | `admin.sync` | Xem, Sửa | `frontend/src/features/admin/SyncPage.tsx` | xem [09-dong-bo.md](09-dong-bo.md) |

- Vai trò `FULL_ACCESS` (Toàn quyền) có đúng các quyền `admin.*` như `ADMIN` (hàm `fullAccessLetters`). Ma trận đầy đủ các vai trò: [12-du-lieu-mau-va-kiem-thu.md](12-du-lieu-mau-va-kiem-thu.md).
- Quyền có trong ma trận nhưng không có API dùng: `admin.user:delete` (không có xóa người dùng), `admin.audit:export` (không có xuất nhật ký), `admin.catalog:delete` (danh mục không xóa). `admin.branch:create` chỉ dùng cho `POST /admin/branches`, màn hình không có nút thêm.
- Route của màn lấy theo `SysMenu.Path`; code của màn đăng ký trong `frontend/src/routes/registry.tsx` (nạp lười). Controller: `backend/src/platform/admin/admin.controller.ts` (`/admin/*`), `backend/src/platform/catalog/catalog.controller.ts` (`/admin/catalogs/*`), `backend/src/platform/me/me.controller.ts` (`/me`).

## Luật chung của các màn quản trị

### Cưỡng chế ở backend
- Mọi endpoint khai báo `@RequirePermission`; giao diện chỉ ẩn nút hoặc khóa nút kèm lý do (`IconAction`, `ActionButton` với `blockedReason`, `frontend/src/features/admin/common.tsx`).
- Dữ liệu quản trị là bảng `Sys*` dùng chung toàn công ty, service đọc ghi thẳng qua Kysely (`CORE_DB`), không đi qua `BaseRepository`. Vì vậy thao tác quản trị **ghi được cả khi đang làm việc ở đơn vị tổng hợp `A00`** (màn quản trị không hiện dòng nhắc "xem tổng hợp, chỉ đọc").

### Không tự đổi quyền của chính mình
Trả `403 SELF_ELEVATION_FORBIDDEN`:

| Thao tác | Chỗ chặn |
|---|---|
| Tự tắt tài khoản của mình (`isActive: false`) | `AdminUsersService.update` |
| Tự đặt lại mật khẩu ở màn quản trị | `AdminUsersService.resetPassword` |
| Tự gán vai trò, tự gán ĐVCS | `setRoles`, `setBranches` |
| Tự sửa phạm vi, ngoại lệ, cột riêng của mình | `AdminGrantsService.assertCanManage` |
| Bật, tắt, ngừng dùng vai trò mình đang giữ; sửa quyền hoặc chính sách cột của vai trò mình đang giữ | `AdminAccessService.assertNotOwnRole`, `AdminGrantsService.setRoleFieldPolicies` |
| Thêm, tích, bỏ tích, đổi ĐVCS, giải thể, khôi phục bộ phận chuyền may mang mã mình đang được giao phạm vi chuyền (Sơ đồ tổ chức, [08-nhan-su.md](08-nhan-su.md)) | `DepartmentService.assertCanChangeLines` (`PermissionService.holdsLineScope`) |

Tắt ĐVCS mình đang làm việc bị chặn bằng `409 CONFLICT` (phải đổi sang ĐVCS khác trước). Tự sửa họ tên, email của mình thì được.

### Trần quyền quản trị
`PermissionService.assertAdminCeiling` (`backend/src/platform/permission/permission.service.ts`): người thao tác phải đang có mọi quyền `admin.*` có liên quan, tính ở ĐVCS đang làm việc; thiếu thì `403 SELF_ELEVATION_FORBIDDEN`, thông điệp kèm "Thiếu quyền: …". Lý do và cách tính: [04-phan-quyen.md](04-phan-quyen.md). Áp ở:
- quản lý một người đang giữ quyền `admin.*` mà mình không có (sửa thông tin, đặt lại mật khẩu, gán vai trò, gán ĐVCS, phạm vi, ngoại lệ, cột riêng);
- gán cho người khác vai trò có quyền `admin.*` mình không có;
- bật, tắt, ngừng dùng vai trò có quyền `admin.*` mình không có;
- sửa quyền của vai trò mà danh sách quyền cũ hoặc mới có quyền `admin.*` mình không có;
- đặt hoặc gỡ ngoại lệ cho một quyền `admin.*` mình không có;
- các thao tác danh mục đổi phạm vi dữ liệu (bảng dưới).

Chính sách cột theo vai trò không có trần quyền, chỉ chặn vai trò mình đang giữ.

### Thao tác danh mục cần thêm `admin.permission:update`
Các thao tác này đổi phạm vi dữ liệu của người khác mà không qua màn Phân quyền, nên ngoài quyền của màn còn đòi `admin.permission:update` (kiểm bằng trần quyền, thiếu thì `403 SELF_ELEVATION_FORBIDDEN`):

| Thao tác | Quyền của màn | Lý do |
|---|---|---|
| Thêm nhà máy SX | `admin.catalog:create` | ĐVCS của nhà máy quyết định đơn hàng nào lập kế hoạch xuất hàng được ở ĐVCS đó (ADR 0013) |
| Đổi ĐVCS, bật hoặc tắt nhà máy SX | `admin.catalog:update` | Như trên. Chỉ sửa tên, mô tả, thứ tự thì không cần |

Ngoài màn quản trị, các thao tác làm đổi tập chuyền may ở Sơ đồ tổ chức cũng đòi thêm quyền này: [08-nhan-su.md](08-nhan-su.md).

### Thao tác tăng phiên bản quyền
Tăng `SysPermissionVersion` trong cùng transaction rồi xóa cache quyền, nên phiên đang mở nhận quyền mới ở request kế tiếp, không cần đăng nhập lại (cơ chế: [04-phan-quyen.md](04-phan-quyen.md)).

| Tăng phiên bản | Không tăng |
|---|---|
| Khóa hoặc mở lại tài khoản (đổi `IsActive`) | Thêm người dùng, sửa họ tên, email, mở khóa tạm |
| Gán vai trò (khi có thay đổi), gán ĐVCS (luôn) | Đặt lại mật khẩu (thu hồi mọi phiên của người đó thay vào) |
| Bật, tắt, ngừng dùng vai trò; đổi quyền của vai trò (khi có thay đổi) | Thêm vai trò, đổi tên, mô tả vai trò |
| Phạm vi, ngoại lệ, cột riêng, chính sách cột của vai trò (khi có thay đổi) | Thêm ĐVCS tay, cập nhật ĐVCS từ BRAVO |
| Bật, tắt ĐVCS | Danh mục mã-tên, ca làm việc |
| Thêm nhà máy SX; đổi ĐVCS, bật, tắt nhà máy SX | Nhà máy SX tự thêm theo OSM (chưa gắn ĐVCS) |
| Đổi tập chuyền may ở Sơ đồ tổ chức (ngay sau commit `MES_Hr`, [04-phan-quyen.md](04-phan-quyen.md)) | Đổi tên, cha, thứ tự của bộ phận chuyền may |

### Mã bất biến, không xóa vật lý
- Mã của mọi danh mục không sửa được sau khi tạo: gửi `code` khác mã cũ thì `422 CODE_IMMUTABLE`; database có trigger chặn thêm một lớp (`TR_SysBranch_CodeImmutable`, `TR_SysOrgUnit_CodeImmutable`, `TR_SysCatalogItem_CodeImmutable`, `TR_SysShift_CodeImmutable`, `TR_SysProductionFactory_CodeImmutable`).
- Danh mục không xóa vật lý; ngừng dùng bằng `IsActive = 0`. Vai trò "xóa" (`DELETE /admin/roles/:id`) cũng chỉ là đặt `IsActive = 0`.
- Bảng gán (`SysUserRole`, `SysUserBranch`, `SysUserRoleScope`, `SysRolePermission`, `SysUserPermissionOverride`, `SysFieldPolicy`) được xóa, thêm lại khi đổi, có nhật ký.

### Nhật ký
- Thay đổi phân quyền ghi `SysAuditLog` bằng `AuditService.logStrict` trong cùng transaction: ghi nhật ký lỗi thì hủy cả thay đổi.
- Thêm người dùng, thêm vai trò, thêm ĐVCS tay, cập nhật ĐVCS từ BRAVO, nhà máy SX tự thêm theo OSM ghi bằng `AuditService.log` sau khi ghi dữ liệu (lỗi ghi nhật ký chỉ ghi log máy chủ).
- `OldValue`, `NewValue` là JSON; không bao giờ chứa mật khẩu hay hash. Bảng và trigger chỉ ghi thêm: [04-phan-quyen.md](04-phan-quyen.md).

### Quy ước giao diện chung
- Popup, ngăn kéo đang nhập dở: đóng thì hỏi lại (`confirmDiscard`), rời trang thì chặn (`useLeaveGuard`); Esc đóng qua `escapeToClose`. Thao tác có hậu quả (khóa tài khoản, ngừng dùng) hỏi xác nhận kèm hậu quả (`confirmAction`).
- Thao tác bị chặn không ẩn đi mà hiện nút khóa kèm tooltip lý do (ví dụ thao tác với chính mình).
- Trạng thái màn giữ trên URL: `q`, `page` (Người dùng, Nhật ký), `entity` (Nhật ký), `role` (Phân quyền), `screen` (Chính sách cột), `c` (Danh mục hệ thống).
- Quy tắc UI/UX chung: [10-giao-dien.md](10-giao-dien.md).

## Màn Người dùng

Route `/admin/users`, cần `admin.user:view`. Danh sách tài khoản `SysUser`, mỗi trang 100 dòng, mới tạo lên đầu (`CreatedAt` giảm dần), ô tìm theo tên đăng nhập, họ tên, email (LIKE trong DB, ký tự `%`, `_`, `[` hiểu theo nghĩa đen). Cột: tên đăng nhập, họ tên (đánh dấu "Bạn"; dòng phụ "Nhân viên: Tên - Mã - Phòng ban" khi tài khoản đã gắn nhân viên), vai trò, ĐVCS, trạng thái (`Hoạt động`, `Khóa tạm` khi `LockedUntilAt` còn hiệu lực, `Đã khóa` khi `IsActive = 0`). Bấm vào một dòng mở ngăn kéo Phân quyền chi tiết.

| Thao tác | Quyền | Nội dung, luật |
|---|---|---|
| Thêm người dùng | `admin.user:create` | Tên đăng nhập `^[a-z0-9._-]{3,50}$`, không trùng (409); họ tên bắt buộc; email tùy chọn; mật khẩu ban đầu 8–100 ký tự, lưu argon2id. Tài khoản mới chưa có vai trò, ĐVCS: đăng nhập đúng mật khẩu nhưng không có ĐVCS để chọn nên chưa vào làm việc được; giao diện nhắc gán tiếp. Nhật ký `USER_CREATE` |
| Sửa thông tin | `admin.user:update` | Họ tên, email (bỏ trống là xóa email), công tắc "Cho phép đăng nhập". Tắt thì hỏi xác nhận, thu hồi mọi phiên của người đó, tăng phiên bản quyền. Không tự tắt chính mình. Nhật ký `USER_UPDATE` |
| Mở khóa tạm | `admin.user:update` | Nút trong popup Sửa khi tài khoản bị khóa do đăng nhập sai: `PUT /admin/users/:id { unlock: true }` đặt `FailedLoginCount = 0`, `LockedUntilAt = NULL`. Ngưỡng khóa: [04-phan-quyen.md](04-phan-quyen.md) |
| Đặt lại mật khẩu | `admin.user:update` | Mật khẩu mới tối thiểu 8 ký tự; xóa khóa tạm, thu hồi mọi phiên của người đó. Không áp cho chính mình. Nhật ký `PASSWORD_RESET` (không ghi mật khẩu) |
| Gán vai trò | `admin.permission:update` | Popup tích vai trò đang dùng; vai trò đã ngừng mà người đó đang giữ hiện riêng để bỏ chọn, chưa bỏ thì không lưu được. Máy chủ so khác biệt: vai trò giữ nguyên thì giữ phạm vi của nó; vai trò bị bỏ thì xóa phạm vi trước rồi xóa phép gán, phạm vi bị xóa ghi vào nhật ký `USER_ROLES`. Vai trò không có hoặc đã ngừng ⇒ 422 |
| Gán ĐVCS | `admin.permission:update` | Popup tích ĐVCS được chọn khi đăng nhập (`SysUserBranch`); mỗi ĐVCS ghi các nhà máy SX đang dùng của nó; `A00` ghi "Xem tổng hợp mọi đơn vị, chỉ đọc". ĐVCS đã ngừng đang tích phải bỏ chọn mới lưu được. Nhật ký `USER_BRANCHES` |
| Gắn nhân viên | `admin.permission:update` | Phase 5.18 (quyết định 10.3): popup chọn một nhân viên đang làm (tìm mã, tên không dấu trên máy chủ qua danh bạ nhân viên `hr.directory`; người thao tác cần quyền Xem danh bạ), bỏ chọn rồi lưu là gỡ. Màn Phân cụm trưởng dựa vào nhân viên này để biết tài khoản là tổ trưởng tổ nào ([May](07-may.md)). Một nhân viên gắn tối đa một tài khoản (`MES_Core/0017`): nhân viên đang gắn với tài khoản khác thì 409 nêu tài khoản đó, gỡ ở đó trước. Không tự gắn cho mình, theo trần quyền quản trị như gán vai trò. Nhật ký `USER_EMPLOYEE` (Id, mã nhân viên cũ, mới). Không tăng phiên bản quyền: nhân viên không nằm trong quyền đã cache, Phân cụm trưởng đọc lại mỗi request |
| Phân quyền chi tiết | `admin.user:view` để mở | Ngăn kéo bốn tab, mục dưới |

- Nhà máy SX không gán theo người: đăng nhập ĐVCS nào thì lập kế hoạch xuất hàng được cho đơn hàng của các nhà máy SX thuộc ĐVCS đó (ADR 0013). `productionFactoryIds` gửi lên bị bỏ qua.
- `PUT /admin/users/:id/branches` nhận thêm `defaultBranchId` (ĐVCS mặc định, `SysUserBranch.IsDefault`); màn hình gửi lại giá trị đang có. Không có trong danh sách thì máy chủ lấy ĐVCS đầu tiên.
- Bỏ hết ĐVCS thì người đó không đăng nhập được; phiên đang mở ở ĐVCS bị gỡ nhận `403 BRANCH_NOT_ALLOWED` ở request kế tiếp.
- Màn cần thêm `admin.role:view`, `admin.branch:view` để hiện tên vai trò, mã ĐVCS; thiếu thì hiện `#Id`.

### Ngăn kéo Phân quyền chi tiết
`UserAccessDrawer.tsx`, nạp `GET /admin/users/:id/access`. Mở cho chính mình thì chỉ xem (mọi nút sửa khóa kèm lý do). Tab ẩn vẫn giữ form đang nhập; đóng ngăn kéo khi còn form dở thì hỏi lại. Ý nghĩa từng lớp phân quyền: [04-phan-quyen.md](04-phan-quyen.md).

| Tab | Quyền sửa | Làm được gì |
|---|---|---|
| Vai trò và phạm vi | `admin.permission:update` | Mỗi phép gán vai trò hiện các dòng phạm vi; dòng chuyền hiện tên kèm mã, mã không còn là chuyền đang dùng (kể cả `~mã` của phạm vi cũ theo cây tổ chức) hiện viền xám "(không còn tác dụng)". Bộ sửa (`ScopeEditor`) sửa được ba loại: ĐVCS theo danh sách (`FACTORY`/`LIST`, chọn nút gốc của cây tổ chức); chuyền theo danh sách mã (`LINE`/`LIST`, ô chọn gom theo ĐVCS và bộ phận cha, chỉ chuyền đang dùng; đã chọn ĐVCS thì chỉ gợi ý chuyền của các ĐVCS đó, trừ chuyền đang chọn); "chỉ bản ghi do người này tạo" (`OWNER`/`OWN`). Mã chuyền đã lưu mà không còn là chuyền đang dùng: hiện riêng, giữ khi lưu; ô "Bỏ các mã này khi lưu" chỉ bật khi còn ít nhất một chuyền đang dùng (bỏ hết là không giới hạn chuyền). Bỏ hết chuyền đang giới hạn: báo trước và bấm lưu phải xác nhận "Bỏ giới hạn chuyền". Phạm vi loại khác đang có (cả nhánh `ORG_SUBTREE`, chiều khác) giữ nguyên khi lưu. Một lần sửa một vai trò |
| Ngoại lệ quyền | `admin.permission:update` | Cho phép thêm hoặc Chặn một quyền, có "Hiệu lực từ", "Đến" (để trống: ngay, không thời hạn), lý do bắt buộc (tối thiểu 3 ký tự). Mỗi người một ngoại lệ cho mỗi quyền: thêm lại cùng quyền là sửa. Ngoại lệ hết hạn hiện mờ |
| Cột riêng | `admin.fieldpolicy:update` | Mức riêng của một cột cho người này (Sửa được, Chỉ đọc, Che, Ẩn), "Hiệu lực đến", lý do bắt buộc. Thắng mọi vai trò. Màn hình không gửi "Hiệu lực từ" (API có nhận) |
| Xem thử | chỉ xem | Chọn một ĐVCS đang dùng, gọi `GET /admin/users/:id/effective`: vai trò có hiệu lực, màn hình dùng được kèm hành động, phạm vi dữ liệu từng màn, mức các cột không phải Sửa được. Người đó chưa được gán ĐVCS này thì có cảnh báo. Cần `admin.branch:view` để có danh sách ĐVCS |

Ô chọn phạm vi cần `GET /admin/scope-catalog` (chiều phạm vi, nút ĐVCS, chuyền may), ô chọn quyền cần `admin.permission:view`, ô chọn cột cần `admin.fieldpolicy:view`. Ý nghĩa phạm vi chuyền theo mã: [04-phan-quyen.md](04-phan-quyen.md).

## Màn Vai trò

Route `/admin/roles`, cần `admin.role:view`. Bảng mọi vai trò (kể cả đã ngừng) xếp theo `SortOrder`, mã: mã, tên (đánh dấu "Hệ thống"), mô tả, số quyền, số người dùng, trạng thái.

| Thao tác | Quyền | Luật |
|---|---|---|
| Thêm vai trò | `admin.role:create` | Mã `^[A-Z][A-Z0-9_]{1,29}$`, không trùng (409); `SortOrder` = lớn nhất + 10; `IsSystem = 0`. Vai trò mới chưa có quyền: cấp ở màn Phân quyền. Nhật ký `ROLE_CREATE` |
| Sửa tên, mô tả, công tắc Đang dùng | `admin.role:update` | Mã chỉ đọc. Vai trò hệ thống (`IsSystem`, gồm các vai trò seed và `FULL_ACCESS`) không có công tắc; tắt qua API ⇒ 409. Đổi trạng thái: không phải vai trò mình giữ, qua trần quyền, tăng phiên bản quyền. Nhật ký `ROLE_UPDATE` |
| Ngừng dùng | `admin.role:delete` | `DELETE /admin/roles/:id` chỉ đặt `IsActive = 0`; hỏi xác nhận, nêu số người đang giữ. Vai trò hệ thống ⇒ 409. Nhật ký `ROLE_DELETE` |
| Dùng lại | `admin.role:update` | `PUT { isActive: true }`; vai trò mình đang giữ thì bị khóa (bật lại cũng là tự cấp quyền) |

Vai trò đã ngừng: không gán thêm được cho ai, không hiện ở màn Phân quyền, Chính sách cột; người đang giữ mất quyền của nó ngay.

## Màn Phân quyền

Route `/admin/permissions`, cần `admin.permission:view`; sửa cần `admin.permission:update`.

- Chọn một vai trò đang dùng (lưu trên URL `?role=`). Chưa chọn thì mặc định vai trò đầu tiên mình không giữ.
- Ma trận: nhóm theo nhóm menu (module) → tài nguyên (màn hình) → 5 cột hành động (Xem, Thêm, Sửa, Xóa, Xuất file). Tích từng ô, cả hàng, cả cột, cả module. Ô vừa đổi có nền và dấu chấm. Nút Hoàn tác, Lưu quyền; đổi vai trò khi chưa lưu thì hỏi lại.
- Lưu gửi **toàn bộ** danh sách quyền của vai trò (`PUT /admin/roles/:id/permissions`); máy chủ so khác biệt, chỉ thêm, xóa phần đổi, trả `{ added, removed }`.
- Ma trận khóa khi: không có quyền sửa; vai trò mình đang giữ (có cảnh báo); chưa tải được quyền đã lưu (lưu lúc đó sẽ ghi đè).
- Luật máy chủ: không sửa vai trò mình giữ; mọi quyền phải tồn tại và đang dùng (422); trần quyền trên cả quyền cũ lẫn mới của vai trò; tăng phiên bản quyền; nhật ký `ROLE_PERMISSIONS`.
- Quyền nằm trong ma trận khi tài nguyên đang dùng và module có nhóm menu gốc (`SysMenu` mã `menu.<module>`). Thêm tài nguyên, menu chỉ qua seed: [12-du-lieu-mau-va-kiem-thu.md](12-du-lieu-mau-va-kiem-thu.md).
- Không có quyền Xem của một màn thì mọi hành động khác của màn đó mất hiệu lực khi tính quyền: [04-phan-quyen.md](04-phan-quyen.md).

## Màn Chính sách cột

Route `/admin/field-policies`, cần `admin.fieldpolicy:view`; sửa cần `admin.fieldpolicy:update`.

- Chọn màn hình (tài nguyên có cột đăng ký trong `SysResourceField`, lưu trên URL `?screen=`). Bảng: mỗi dòng một cột, mỗi cột một vai trò đang dùng.
- Ô chọn: trống (theo mặc định: cột thường Sửa được, cột nhạy cảm Ẩn), Sửa được, Chỉ đọc, Che (`***`), Ẩn. Người nhiều vai trò lấy mức mở nhất. Cột vai trò mình đang giữ bị khóa (biểu tượng khóa, tooltip).
- Lưu gửi từng vai trò có ô đổi (`PUT /admin/roles/:id/field-policies`), lần lượt; vai trò lỗi không chặn vai trò sau, ô của vai trò lỗi giữ trên bảng để lưu lại. Ô về trống là xóa dòng chính sách.
- Máy chủ: không sửa vai trò mình giữ (403); cột lặp hoặc không có trong danh bạ (422); tăng phiên bản quyền khi có thay đổi; nhật ký `ROLE_FIELD_POLICY`.
- Cột riêng theo người (có hạn dùng) đặt ở ngăn kéo Phân quyền chi tiết của màn Người dùng.
- Backend lọc cột trước khi trả dữ liệu, kể cả file xuất (`backend/src/platform/export/export.service.ts`). Cách tính mức, interceptor, nhật ký đọc dữ liệu nhạy cảm: [04-phan-quyen.md](04-phan-quyen.md).

## Màn Đơn vị cơ sở

Route `/admin/branches`, cần `admin.branch:view`. Đơn vị cơ sở (ĐVCS) là bảng `SysBranch`: danh sách theo danh mục chi nhánh BRAVO cộng đơn vị tổng hợp `A00` của MES (ADR 0013). Mã ĐVCS là `BranchCode` của mọi bảng nghiệp vụ.

Cột: mã, tên (đánh dấu "Đang chọn" ở ĐVCS của phiên), tên đầy đủ (`Description`), các nhà máy SX thuộc ĐVCS (nhà máy đã ngừng gạch ngang), nguồn, trạng thái.

| Nguồn | Khi nào |
|---|---|
| `Tổng hợp, chỉ đọc` | `IsAggregate = 1` |
| `BRAVO` | Mã có trong bảng chép `MES_Sync.bravo.DM_CHINHANH` |
| `Không có trong BRAVO` | Mã không còn trong BRAVO: MES không tự tắt, quản trị tự quyết |
| `MES` | Chưa đọc được `MES_Sync` (máy chưa có đồng bộ) |

| Thao tác | Quyền | Luật |
|---|---|---|
| Cập nhật từ BRAVO | `admin.branch:update` | `POST /admin/branches/import`, xem mục dưới. Toast báo mã thêm, mã đổi tên |
| Bật, tắt ĐVCS | `admin.branch:update` | Tắt hỏi xác nhận. Không tắt được `A00` (409) và ĐVCS mình đang làm việc (409). Tắt thì phiên đang ở ĐVCS đó nhận `403 BRANCH_NOT_ALLOWED` ngay request kế tiếp (về màn đăng nhập), không chọn lại được; dữ liệu giữ nguyên. Tăng phiên bản quyền. Nhật ký `BRANCH_UPDATE` |
| Đổi tên | `admin.branch:update` | Chỉ ĐVCS không có trong BRAVO (hoặc khi chưa đọc được `MES_Sync`). ĐVCS có trong BRAVO đổi tên hoặc tên đầy đủ ⇒ 409 "sửa ở BRAVO rồi đồng bộ lại" |
| Thêm ĐVCS tay | `admin.branch:create` | Chỉ qua API, cho máy chưa có đồng bộ BRAVO. Mã `^[A-Z0-9]{1,10}$`, không phải `A00`, không trùng (409). Tạo luôn nút gốc `FACTORY` cùng mã trong `SysOrgUnit`. Nhật ký `BRANCH_CREATE` |

### Cập nhật ĐVCS từ danh mục chi nhánh BRAVO
Hàm `importBravoBranches` (`backend/src/platform/admin/branch-import.ts`), dùng chung cho nút trên màn, việc tự chạy và script seed.
- Chạy: tự động sau mỗi lần nguồn đồng bộ `BRAVO.DM_CHINHANH` chép thành công (`SyncService.onSucceeded`, việc của hệ thống, nhật ký ghi người `system`); bấm nút "Cập nhật từ BRAVO"; trong `npm run seed`. Chưa có `MES_Sync` thì API trả `503 SYNC_NOT_READY`.
- Mỗi dòng BRAVO: mã = `BranchCode` cắt khoảng trắng, viết hoa, phải khớp `^[A-Z0-9]{1,10}$`; sai dạng hoặc trống thì bỏ qua. `Name` = `TenChiNhanh` (trống thì `TenDayDu`, rồi mã), cắt 100 ký tự; `Description` = `TenDayDu`, cắt 255 ký tự.
- Mã chưa có: thêm ĐVCS (`IsSystem = 1`, đang dùng, xếp cuối). Mã đã có mà tên khác: đổi tên. Mã trùng đơn vị tổng hợp: bỏ qua. Không tắt ĐVCS vắng trong BRAVO (trả về trong `missing`).
- Mỗi ĐVCS chép về có nút gốc `FACTORY` cùng mã, cùng tên trong `SysOrgUnit` (thêm nếu thiếu, đổi tên theo ĐVCS): nút này dùng cho phạm vi theo ĐVCS.
- Chạy trong một transaction, nối tiếp bằng `sp_getapplock` `MES_Core.SysBranch.Import` (chờ tối đa 30 giây).
- Có thêm hoặc đổi tên thì ghi nhật ký `BRANCH_IMPORT` và xóa cache tên ĐVCS.
- ĐVCS mới không tự gán cho ai; phải gán ở màn Người dùng.

## Màn Danh mục hệ thống

Route `/admin/catalogs`, cần `admin.catalog:view`; thêm cần `admin.catalog:create`, sửa và ngừng dùng cần `admin.catalog:update`. Không có xóa, trừ ngày nghỉ lễ, làm bù của Lịch làm việc (dùng `admin.catalog:update`).

Bố cục: cột trái là danh sách danh mục (điện thoại: ô chọn), cột phải là khung của danh mục đang chọn (lưu trên URL `?c=<mã>`, mặc định `PROD_FACTORY`). Đổi danh mục khi khung đang sửa dở thì hỏi lại. Nhóm "Danh mục MES" lấy từ `GET /admin/catalogs` (số đang dùng cạnh tên), cộng hai danh mục của module khác; nhóm "Chép từ BRAVO (chỉ xem)" lấy từ bảng `SyncSource`.

| Mã khung | Danh mục | Bảng | Ghi chú |
|---|---|---|---|
| `PROD_FACTORY` | Nhà máy SX | `SysProductionFactory` | Mỗi nhà máy thuộc một ĐVCS |
| `UNIT` | Đơn vị tính | `SysCatalog` + `SysCatalogItem` | Danh mục mã-tên |
| `ORDER_TYPE` | Loại đơn hàng | `SysCatalog` + `SysCatalogItem` | Danh mục mã-tên |
| `SHIFT` | Ca làm việc | `SysShift` | |
| `WORK_CALENDAR` | Lịch làm việc | `SysWorkCalendar` + `SysWorkCalendarDay` | Theo ĐVCS; Chi tiết dàn chuyền tự tính ngày theo lịch. Số cạnh tên là số ĐVCS đang dùng có lịch riêng |
| `PREP_STEP` | Cấu hình chuẩn bị SX | `MES_Sewing` | Module May, xem [07-may.md](07-may.md) |
| `DEPT_TYPE` | Loại phòng ban | `MES_Hr` | Module Nhân sự, xem [08-nhan-su.md](08-nhan-su.md) |
| `BRAVO.DM_*` | Danh mục chép từ BRAVO | `MES_Sync.bravo.*` | Chỉ xem |

Lưu một dòng bất kỳ thì giao diện tải lại tổng quan và các chỗ đang dùng danh mục (gợi ý của màn Đơn hàng, nhà máy SX ở màn Đơn vị cơ sở và popup gán ĐVCS, loại phòng ban ở Sơ đồ tổ chức). Ngừng dùng mục nào cũng hỏi xác nhận kèm hậu quả; dùng lại thì làm ngay.

Danh mục MES dùng chung toàn công ty, không theo ĐVCS (trừ Nhà máy SX và Lịch làm việc có cột ĐVCS), mã không sửa được, ngừng dùng bằng `IsActive`. Module nghiệp vụ đọc danh mục qua `CatalogLookupService` (mục "Dịch vụ cho module khác"), không gọi được hàm ghi của màn này.

### Chuyền may: không còn ở Danh mục hệ thống
Chuyền may là bộ phận tích "Xưởng sản xuất" ở Nhân sự › Sơ đồ tổ chức ([08-nhan-su.md](08-nhan-su.md); quyết định: [13-quyet-dinh.md](13-quyet-dinh.md) mục 6.7). API `GET /admin/catalogs/lines`, `POST /admin/catalogs/workshops`, `/lines`, `PUT /admin/catalogs/workshops/:id`, `/lines/:id` đã bỏ (gọi thì 404). Liên kết cũ `/admin/catalogs?c=LINE` hiện ghi chú chỉ sang Sơ đồ tổ chức (có link khi người xem có `hr.orgchart:view`). Cây tổ chức `SysOrgUnit` chỉ còn nút ĐVCS, tạo cùng ĐVCS (mục Đơn vị cơ sở); nút Xưởng, Chuyền cũ ngừng dùng, không xóa.

### Nhà máy SX
Bảng `SysProductionFactory` (ADR 0013). Nhà máy SX là nơi sản xuất thực tế của đơn hàng; mỗi nhà máy thuộc một ĐVCS. Đăng nhập ĐVCS nào thì popup Chọn mã hàng của Kế hoạch xuất hàng chỉ có đơn hàng có ít nhất một nhà máy SX đang dùng thuộc ĐVCS đó (danh sách nằm trong quyền của phiên, `UserAccess.productionFactories`; cách lọc: [04-phan-quyen.md](04-phan-quyen.md), nghiệp vụ: [06-don-hang.md](06-don-hang.md)). Đơn vị tổng hợp có mọi nhà máy đã gắn ĐVCS.

- **Mã là tên nhà máy theo OSM** (ví dụ `VIET DUC`, `HÙNG DŨNG`, `BM.PYEN`): tối đa 100 ký tự, có dấu, khoảng trắng; không dấu phẩy, không ký tự điều khiển, không khoảng trắng đầu cuối (khoảng trắng giữa gộp một). Không sửa được. Lý do không dấu phẩy: `SalesOrder.ProductionFactoryCode` là danh sách mã cách nhau dấu phẩy (`backend/src/platform/catalog/factory-list.ts`).
- **Tự thêm theo OSM:** sau mỗi lần nguồn đồng bộ `OSM.OSMDataFty` chép thành công và lúc backend khởi động, `CatalogService.importOsmFactories` tách mọi danh sách nhà máy trong bảng chép OSM, thêm tên chưa có trong danh mục (so trùng theo collation của database, không phân biệt hoa thường): mã = tên = tên OSM, chưa gắn ĐVCS, mô tả "Thêm tự động theo OSM", `CreatedBy` NULL. Không đổi, không bật lại nhà máy đã có. Tên dài quá 100 ký tự không thêm (ghi cảnh báo log). Nhật ký `FACTORY_IMPORT` (người `system`). Chưa đồng bộ OSM thì không làm gì. Nguồn OSM: [09-dong-bo.md](09-dong-bo.md).
- Quản trị gắn ĐVCS cho nhà máy mới; nhà máy chưa gắn có nhãn "Chưa gắn" và lọc được riêng. Nhà máy chưa gắn ĐVCS không thuộc ĐVCS nào nên đơn của nó không hiện ở Chọn mã hàng.
- Ô Nhà máy SX của đơn hàng lấy theo OSM thì khóa sửa tay; đơn chưa có trong OSM thì người dùng chọn một nhà máy đang dùng của danh mục: [06-don-hang.md](06-don-hang.md).

| Thao tác | Quyền | Luật |
|---|---|---|
| Thêm nhà máy | `admin.catalog:create` + `admin.permission:update` | Mã như trên (máy chủ viết hoa), không trùng (409); ĐVCS bắt buộc, phải có (422), không phải đơn vị tổng hợp (422), đang dùng (422). Tăng phiên bản quyền. Nhật ký `FACTORY_CREATE`. Thiếu `admin.permission:update`: nút khóa kèm lý do |
| Sửa tên, mô tả, thứ tự | `admin.catalog:update` | Không tăng phiên bản quyền. Nhật ký `FACTORY_UPDATE` |
| Đổi ĐVCS | `admin.catalog:update` + `admin.permission:update` | ĐVCS mới như khi thêm; ĐVCS đang tắt chỉ giữ được khi không đổi. Không bỏ gắn được (gửi `null` ⇒ 422). Thiếu quyền thì ô chỉ đọc, giao diện không gửi `branchCode`. Tăng phiên bản quyền |
| Bật, tắt | `admin.catalog:update` + `admin.permission:update` | Nhà máy ngừng không còn trong ô chọn Nhà máy SX của đơn hàng và không còn trong danh sách lọc Chọn mã hàng; đơn đã chọn giữ nguyên. Gửi lại đúng trạng thái đang có thì bỏ qua, không kiểm quyền. Tăng phiên bản quyền |

Ô lọc ĐVCS và ô chọn ĐVCS trong popup của khung lấy danh sách ĐVCS (kể cả đang tắt, để hiện đúng tên) từ tổng quan `GET /admin/catalogs` (`branches`), cùng quyền xem danh mục, không đòi quyền xem màn Đơn vị cơ sở. Màn Đơn vị cơ sở và popup Gán ĐVCS hiện các nhà máy của từng ĐVCS.

### Đơn vị tính, Loại đơn hàng (danh mục mã-tên)
Một loại danh mục là một dòng `SysCatalog`; mục là `SysCatalogItem`. Thêm loại danh mục mới chỉ cần thêm dòng `SysCatalog` qua seed, không cần bảng mới.

| Mã | Tên | Dùng ở |
|---|---|---|
| `UNIT` | Đơn vị tính | Mã là mã đơn vị bên BRAVO (viết hoa, không dấu); bước nạp đơn hàng BRAVO đổi mã sang tên; đơn hàng lưu **tên** (`SalesOrder.UnitName NVARCHAR(20)`) nên tên mục tối đa 20 ký tự (422), đổi tên không đổi đơn đã lưu |
| `ORDER_TYPE` | Loại đơn hàng | Đơn hàng lưu **mã** (`SalesOrder.OrderType`); ô Loại ở Thông tin đơn hàng gợi ý theo danh mục kèm tên |

- Mã `^[A-Z0-9._-]{1,30}$` (máy chủ viết hoa), không trùng trong cùng danh mục (409), không sửa. Tên tối đa 100 ký tự (Đơn vị tính 20), mô tả 300, thứ tự bỏ trống thì cuối danh sách.
- Danh mục không có hoặc đã ngừng ⇒ 404; mục của danh mục này không sửa được qua đường của danh mục khác (404).
- Ngừng dùng mục: không còn trong gợi ý khi nhập mới, dữ liệu cũ giữ nguyên và vẫn hiện đúng tên.
- Nhật ký `CATALOG_ITEM_CREATE`, `CATALOG_ITEM_UPDATE`. Không tăng phiên bản quyền.
- Giá trị đơn hàng chưa ràng buộc cứng vào danh mục (chỉ gợi ý), chưa khai khóa ngầm cho `SalesOrder.OrderType`.

### Ca làm việc
Bảng `SysShift`, dùng chung toàn công ty. Chưa màn nghiệp vụ nào đọc ca làm việc; danh mục chuẩn bị cho kế hoạch may, sản lượng theo giờ.
- Mã `^[A-Z0-9._-]{1,20}$` (viết hoa), không trùng (409), không sửa. Giờ bắt đầu, kết thúc dạng `HH:mm` (24 giờ); nghỉ 0–480 phút.
- Giờ kết thúc nhỏ hơn giờ bắt đầu là ca qua đêm. Độ dài ca = (kết thúc − bắt đầu + 1440) mod 1440 phút; bằng 0 (giờ trùng) ⇒ 422; nghỉ phải ngắn hơn độ dài ca ⇒ 422. API trả thêm `workMinutes` (độ dài − nghỉ) và `overnight`.
- Nhật ký `SHIFT_CREATE`, `SHIFT_UPDATE`.

### Lịch làm việc (phase 5.12)
Bảng `SysWorkCalendar` (mỗi ĐVCS một dòng) và `SysWorkCalendarDay` (ngày đặc biệt), khung `WorkCalendarPane.tsx`. Màn Chi tiết dàn chuyền tự tính Số ngày nghỉ, Kết thúc vào chuyền, ngày ra chuyền, nhập kho theo lịch của ĐVCS kế hoạch: [06-don-hang.md](06-don-hang.md) mục Xếp chuyền. Quyết định: [13-quyet-dinh.md](13-quyet-dinh.md) mục 6.8, 6.9, 6.11.

- **Theo ĐVCS**, như Nhà máy SX: có cột `BranchCode`, không qua `BaseRepository`; một người có `admin.catalog:update` sửa được lịch mọi ĐVCS (nhập Tết một lần cho nhiều ĐVCS). Không có lịch cho đơn vị tổng hợp (422). ĐVCS đang ngừng dùng không ghi được lịch (422), vẫn xem được nếu đã có lịch.
- **ĐVCS chưa có lịch riêng** dùng lịch mặc định viết trong code (`DEFAULT_WORK_CALENDAR`: nghỉ Chủ nhật, cộng thêm 3/3/2/5 ngày, ngưỡng làm tròn 0,5), khung hiện "Đang dùng lịch mặc định". Lần lưu cấu hình hoặc đặt ngày đầu tiên tạo dòng `SysWorkCalendar`.
- **Cấu hình tuần:** các thứ nghỉ hằng tuần (phải còn ít nhất một ngày làm việc) và 4 số ngày cộng thêm (0–60, ngày lịch, kể cả ngày nghỉ; quyết định 6.9): Bắt đầu ra chuyền tính từ bắt đầu vào chuyền, Kết thúc ra chuyền từ kết thúc vào chuyền, Bắt đầu nhập kho từ bắt đầu ra chuyền, Kết thúc nhập kho từ kết thúc ra chuyền. Số của Kết thúc ra chuyền phải từ số của Bắt đầu trở lên, và tổng (ra chuyền + nhập kho) của Kết thúc từ tổng của Bắt đầu trở lên, để ngày bắt đầu không sau ngày kết thúc kể cả dòng chỉ may một ngày (422, CHECK `CK_SysWorkCalendar_Offsets`). Lưu lại đúng cấu hình đang có (kể cả ngưỡng làm tròn) thì không ghi, không thêm nhật ký.
- **Làm tròn Số ngày SX** (`ProductionRoundUpFrom`, `DECIMAL(3,2)`, MES_Core/0014, quyết định 6.11): Số ngày SX = Số lượng / Năng suất TB; phần lẻ từ ngưỡng trở lên thì thêm một ngày, dưới thì bỏ; ít nhất 1 ngày. Nhập 0,01–1, tối đa 2 chữ số lẻ (422, CHECK `CK_SysWorkCalendar_ProductionRoundUpFrom`); mặc định 0,5 (7,3 → 7; 7,5 → 8). 0,01 gần như luôn làm tròn lên, 1 luôn bỏ phần lẻ. Ô nhập hiện ví dụ 7,3; 7,5; 7,8 theo ngưỡng đang gõ. API nhận trường `productionRoundUpFrom` tùy chọn: không gửi thì giữ số đang có. Đổi ngưỡng không tính lại dàn chuyền đã lưu: Số ngày SX của dòng đổi khi dòng được lưu lại, các ngày chỉ đổi khi người dùng bấm "Tính lại theo công thức" hoặc sửa ô nhập.
- **Ngày đặc biệt:** Nghỉ (lễ, Tết, nghỉ công ty) hoặc Làm bù (làm việc dù trùng ngày nghỉ hằng tuần), kèm tên tùy chọn. Đặt theo khoảng ngày (tối đa 62 ngày một lần, năm 2000–2100) cho một hay nhiều ĐVCS; ngày đã đặt trong khoảng được thay bằng loại, tên mới (mỗi lần đặt đều ghi và có nhật ký). Xóa theo đợt (các ngày liền nhau cùng loại, cùng tên gom thành một dòng). Xóa vật lý: dòng không có mã, không bảng nào tham chiếu.
- **Giao diện:** chọn ĐVCS (mặc định ĐVCS đăng nhập) và năm; lịch 12 tháng tô ngày nghỉ hằng tuần (xám), nghỉ lễ (cam), làm bù (xanh), bấm một ngày để mở popup đặt ngày đó (ô ngày không nằm trong thứ tự Tab; bàn phím dùng nút "Thêm ngày nghỉ, làm bù"); bảng các đợt của năm. Chỉ có quyền xem thì không có nút ghi, ô ngày không bấm được. ĐVCS đã ngừng dùng chỉ còn xem và xóa ngày.
- Sửa lịch không đổi ngày của dàn chuyền đã lưu: Chi tiết dàn chuyền giữ ngày đã lưu, báo số dòng có ngày khác công thức theo lịch hiện tại; người dùng bấm "Tính lại theo công thức" rồi Lưu (`frontend/src/features/order/LinePlanPage.tsx`, quyết định 6.10). Không có lệnh tính lại hàng loạt.
- Chưa làm (phạm vi phase 5.12): lịch theo Nhà máy SX, theo chuyền, theo ca; ngày làm nửa buổi; tăng ca; áp lịch cho Kế hoạch chuẩn bị SX (chờ BA); lấy ngày lễ từ BRAVO hay Nhân sự; tự sinh Tết theo âm lịch (Tết nhập tay mỗi năm); chép ngày nghỉ từ năm khác hoặc ĐVCS khác (câu hỏi Q35: [Trạng thái](../current/STATUS.md)).
- Nhật ký `WORK_CALENDAR_UPDATE` (cấu hình cũ, mới), `WORK_CALENDAR_DAYS_SET` (ngày cũ trong khoảng, khoảng mới; mỗi ĐVCS một dòng), `WORK_CALENDAR_DAYS_DELETE` (ngày đã xóa), loại đối tượng `SysWorkCalendar`, ghi trong cùng transaction. Không tăng phiên bản quyền.

### Cấu hình chuẩn bị SX
Danh mục các bước chuẩn bị trước ngày vào chuyền, dữ liệu ở `MES_Sewing`, API `/sewing/prep-steps` dùng quyền `admin.catalog:*`. Khung `PrepStepsPane.tsx` sửa thẳng trên bảng như bảng tính rồi lưu một lần. Luật nghiệp vụ và bảng: [07-may.md](07-may.md).

### Loại phòng ban
Danh mục loại phòng ban của Sơ đồ tổ chức, dữ liệu ở `MES_Hr`, API `/hr/department-types` dùng quyền `admin.catalog:*`. Khung `DepartmentTypesPane` trong `CatalogsPage.tsx`. Luật nghiệp vụ và bảng: [08-nhan-su.md](08-nhan-su.md).

### Danh mục chép từ BRAVO (chỉ xem)
- Danh sách là các nguồn đồng bộ nhóm `CATALOG` trong `MES_Sync.dbo.SyncSource` (`SyncService.catalogs`), kèm số dòng và lần chép thành công gần nhất. Hiện có 12 nguồn: Chi nhánh (`BRAVO.DM_CHINHANH`), Khách hàng, Mùa kinh doanh, Màu sắc, Size, Nhân viên, Nhóm (team), Người dùng BRAVO, Mã tra cứu, Địa điểm giao hàng, Quốc gia, Phương thức giao hàng (`MES_Sync/0002`).
- Khung hiện nguồn (view), số dòng, lần chép gần nhất; bảng phân trang 100 dòng, tìm theo các cột chữ (LIKE, ký tự đặc biệt hiểu theo nghĩa đen); cột khóa có biểu tượng chìa khóa; bỏ các cột kỹ thuật `SyncRowId`, `SyncRunId`, `SyncedAt`.
- Không sửa được trên MES: sửa bên BRAVO rồi bấm Đồng bộ ở màn Đồng bộ dữ liệu (liên kết hiện khi có `admin.sync:view`).
- Tên bảng lấy từ `SyncSource.TargetTable` theo mã nguồn, phải dạng `bravo.<tên>`; tên cột lấy từ `sys.columns`. Không nhận tên bảng, tên cột từ client: mã lạ hoặc không phải nguồn nhóm `CATALOG` ⇒ 404.
- Chưa có `MES_Sync`: tổng quan vẫn trả danh mục MES, nhóm BRAVO rỗng kèm `externalError`; API đọc dòng ⇒ `503 SYNC_NOT_READY`.
- Danh mục Nhân viên, Người dùng BRAVO có họ tên, tên đăng nhập: trước khi cấp `admin.catalog:view` cho vai trò ngoài quản trị cần danh sách trắng cột hoặc nhật ký đọc.

## Màn Nhật ký hệ thống

Route `/admin/audit`, cần `admin.audit:view`. Đọc `SysAuditLog`, mới nhất lên đầu, 100 dòng mỗi trang.
- Lọc: ô tìm (người thực hiện, mã hành động, `EntityId`), loại đối tượng (`entity` trên URL; chỉ nhận loại có trong danh sách lọc bên dưới, giá trị khác bị bỏ qua). API nhận thêm `from`, `to` (ISO 8601, theo `EventAt`), `userId`, màn hình chưa dùng.
- Cột: thời điểm (giờ máy, có giây), người thực hiện, ĐVCS của phiên, hành động (nhãn tiếng Việt theo `ACTION_TEXT`, mã chưa có nhãn hiện nguyên mã), đối tượng (nhãn theo `ENTITIES`, loại chưa có nhãn hiện nguyên mã) kèm `EntityId`. Dòng có giá trị cũ hoặc mới thì có nút Xem, mở popup Trước / Sau (JSON định dạng lại).
- Nhật ký chỉ ghi thêm, không sửa, xóa được (trigger). Không có xuất file.

Loại đối tượng lọc được và có nhãn (`ENTITIES` trong `frontend/src/features/admin/AuditPage.tsx`): `SysUser`, `SysRole`, `SysBranch`, `SysProductionFactory`, `SysUserRoleScope`, `SysUserPermissionOverride`, `SysFieldPolicy`, `SalesOrder`, `SalesOrderPo`, `ShipmentPlan`, `ShipmentPlanLine`, `PoAllocation`, `SyncRun`, `SysOrgUnit` (nhãn "Danh mục: xưởng, chuyền may (cũ)"), `SysScopeDimension`, `Department` ("Phòng ban, chuyền may"), `SysCatalogItem`, `SysShift`, `SysWorkCalendar`, `Auth`. Loại đối tượng, mã hành động đang được ghi mà màn chưa có nhãn: [Trạng thái](../current/STATUS.md) mục 8.1.

Mã hành động do phần quản trị ghi:

| Đối tượng (`EntityType`) | `ActionCode` |
|---|---|
| `SysUser` | `USER_CREATE`, `USER_UPDATE`, `PASSWORD_RESET`, `USER_ROLES`, `USER_BRANCHES` |
| `SysRole` | `ROLE_CREATE`, `ROLE_UPDATE`, `ROLE_DELETE`, `ROLE_PERMISSIONS` |
| `SysUserRoleScope` | `USER_ROLE_SCOPE` |
| `SysUserPermissionOverride` | `OVERRIDE_CREATE`, `OVERRIDE_UPDATE`, `OVERRIDE_DELETE` |
| `SysFieldPolicy` | `ROLE_FIELD_POLICY`, `USER_FIELD_POLICY_CREATE`, `USER_FIELD_POLICY_UPDATE`, `USER_FIELD_POLICY_DELETE` |
| `SysBranch` | `BRANCH_CREATE`, `BRANCH_UPDATE`, `BRANCH_IMPORT` |
| `SysOrgUnit` | `WORKSHOP_CREATE`, `WORKSHOP_UPDATE`, `LINE_CREATE`, `LINE_UPDATE` (danh mục cũ, không còn ghi mới; màn Nhật ký giữ nhãn "(danh mục cũ)" để đọc lịch sử); `ORG_UNIT_RETIRE` (migration `MES_Core/0009`) |
| `SysScopeDimension` | `SCOPE_DIMENSION_UPDATE` (migration `MES_Core/0009`) |
| `SysProductionFactory` | `FACTORY_CREATE`, `FACTORY_UPDATE`, `FACTORY_IMPORT` |
| `SysCatalogItem` | `CATALOG_ITEM_CREATE`, `CATALOG_ITEM_UPDATE` |
| `SysShift` | `SHIFT_CREATE`, `SHIFT_UPDATE` |
| `SysWorkCalendar` | `WORK_CALENDAR_UPDATE`, `WORK_CALENDAR_DAYS_SET`, `WORK_CALENDAR_DAYS_DELETE` |

Migration cũng ghi một số mã trên: `MES_Core/0009` ghi `USER_ROLE_SCOPE`, `SCOPE_DIMENSION_UPDATE`, `ORG_UNIT_RETIRE` (người `system`); `MES_Core/0010`, `0012`, `0013` ghi `ROLE_PERMISSIONS`, `0015` ghi `ROLE_FIELD_POLICY` (người `migrate`).

`ACTION_TEXT` có nhãn cho: mọi mã của bảng trên trừ `FACTORY_IMPORT`; mã đăng nhập `LOGIN`, `LOGIN_FAILED`, `SELECT_BRANCH`, `LOGOUT`; mã chung `CREATE`, `UPDATE`, `DELETE`; mã của Sơ đồ tổ chức `DISSOLVE`, `RESTORE`, `LINE_SET_CHANGE` ([08-nhan-su.md](08-nhan-su.md); ý nghĩa `LINE_SET_CHANGE`: [04-phan-quyen.md](04-phan-quyen.md)); mã của module Đơn hàng `CUT_RATIO_UPDATE`, `CUT_RATIO_CONFIRM`, `CUT_RATIO_UNCONFIRM`, `LINE_SCHEDULE`, `COLOR_SIZE_ALLOCATE`, `PO_ALLOCATION_FACTORY`, `PO_ALLOCATION_REFRESH`; `SYNC_START`; mã của script `SEED`, `DEMO_RESET`, `BRAVO_LOAD`.

Nhật ký đăng nhập (`Auth`), seed, script, đồng bộ và module nghiệp vụ: [04-phan-quyen.md](04-phan-quyen.md), [06-don-hang.md](06-don-hang.md), [07-may.md](07-may.md), [08-nhan-su.md](08-nhan-su.md), [15-cat.md](15-cat.md), [09-dong-bo.md](09-dong-bo.md), [11-van-hanh.md](11-van-hanh.md).

## Màn Đồng bộ dữ liệu

Route `/admin/sync`, tài nguyên `admin.sync` (Xem = theo dõi, Sửa = bấm chạy đồng bộ). Toàn bộ nội dung: [09-dong-bo.md](09-dong-bo.md). Hai việc của phần quản trị chạy sau đồng bộ: cập nhật ĐVCS sau nguồn `BRAVO.DM_CHINHANH`, thêm nhà máy SX sau nguồn `OSM.OSMDataFty` (đăng ký bằng `SyncService.onSucceeded` lúc khởi động module).

## Trang chủ

Route `/` (`frontend/src/features/home/HomePage.tsx`), mọi người đã đăng nhập. Lời chào, vai trò có hiệu lực, ĐVCS đang làm việc; ở `A00` có nhắc "chỉ đọc". Liệt kê các màn trong menu của người dùng theo nhóm: màn đã có code (có trong `routes/registry.tsx`) ghi "Dùng được" và đứng trước, màn chưa có code ghi "Đã phân quyền, chờ tài liệu nghiệp vụ". Không có màn nào thì nhắc đổi ĐVCS hoặc nhờ quản trị gán vai trò. Khung giao diện: [10-giao-dien.md](10-giao-dien.md).

## API

Tiền tố `/api/v1`. Định dạng lỗi `{ error: { code, message, details }, traceId }`; dữ liệu sai dạng ⇒ `422 VALIDATION_FAILED` kèm `details: [{ field, messages }]`; trường lạ trong body bị bỏ qua (`ValidationPipe` `whitelist`). Phân trang của quản trị: `page` từ 1, `pageSize` tối đa 100 (mặc định 100), kết quả `{ items, total, page, pageSize }`. Mọi `:id` là số nguyên (khác ⇒ 400). Quy ước chung của API: [Kiến trúc](../ARCHITECTURE.md) mục 5.1.

Cột "Lỗi đặc thù" chỉ ghi lỗi riêng của endpoint; mọi endpoint có thể trả `401`, `403 PERMISSION_DENIED`, `422 VALIDATION_FAILED`.

### Người dùng, phạm vi, ngoại lệ, cột riêng (`/admin`)

| Method, đường dẫn | Quyền | Body chính | Kết quả | Lỗi đặc thù |
|---|---|---|---|---|
| `GET /admin/users?page&pageSize&q` | `admin.user:view` | | Trang `{ id, username, fullName, email, isActive, isLocked, lastLoginAt, roleIds, branchIds, defaultBranchId, employeeId, employee }`; `employee` `{ id, code, fullName, departmentCode, departmentName, isActive }` khi đã gắn và người thao tác tra được danh bạ nhân viên, không thì `null` | |
| `GET /admin/users/employee-options?q=` | `admin.permission:update` | | `{ canSearch, items }`: tối đa 20 nhân viên đang làm khớp mã, tên (không dấu); không có `hr.directory:view` thì `canSearch = false`, rỗng | |
| `PUT /admin/users/:id/employee` | `admin.permission:update` | `{ employeeId }` (bắt buộc có mặt; `null` là gỡ) | `{ ok }` | 404; 403 chính mình (`SELF_ELEVATION_FORBIDDEN`), trần quyền, thiếu quyền xem danh bạ; 422 nhân viên không có hoặc đã nghỉ việc; 409 nhân viên đang gắn với tài khoản khác |
| `POST /admin/users` | `admin.user:create` | `{ username, fullName, email?, initialPassword }` | `201 { id }` | 409 trùng tên đăng nhập |
| `PUT /admin/users/:id` | `admin.user:update` | `{ fullName?, email? (null/'' xóa), isActive?, unlock? }` | `{ ok }` | 404; 403 tự tắt mình, trần quyền |
| `POST /admin/users/:id/reset-password` | `admin.user:update` | `{ newPassword }` (8–100) | `200 { ok }` | 404; 403 chính mình, trần quyền |
| `PUT /admin/users/:id/roles` | `admin.permission:update` | `{ roleIds }` (tối đa 50) | `{ ok }` | 404; 403 chính mình, trần quyền; 422 vai trò không có hoặc đã ngừng |
| `PUT /admin/users/:id/branches` | `admin.permission:update` | `{ branchIds, defaultBranchId? }` (tối đa 100) | `{ ok }` | 404; 403 chính mình, trần quyền; 422 ĐVCS không có hoặc đã ngừng |
| `GET /admin/users/:id/access` | `admin.user:view` | | `{ user, assignments: [{ userRoleId, roleId, roleCode, roleName, roleActive, validFromAt, validToAt, scopes: [{ id, dimension, mode, orgUnitId, orgUnitCode, orgUnitName, value, valueName, valueActive }] }], overrides: [{ id, permissionId, permissionCode, permissionName, effect, validFromAt, validToAt, reason, createdAt }], fieldPolicies: [{ id, resourceId, resourceCode, resourceName, fieldCode, fieldName, accessLevel, validFromAt, validToAt, reason }] }` | 404 |
| `GET /admin/users/:id/effective?branchCode=` | `admin.user:view` | | `{ user: { id, fullName, isActive }, branch: { code, name, isAggregate, allowed }, roles, screens: [{ code, name, actions, scope: [chuỗi mô tả] }], fieldLevels: { <tài nguyên>: { <cột>: mức } } }` | 404 người dùng; 404 ĐVCS không có hoặc đã ngừng |
| `PUT /admin/users/:id/roles/:roleId/scope` | `admin.permission:update` | `{ scopes: [{ dimension, mode, orgUnitId?, value? }] }` (tối đa 200; rỗng là không giới hạn thêm) | `{ ok }` | 403 chính mình, trần quyền; 404 chưa gán vai trò; 422 tổ hợp sai (xem dưới) |
| `POST /admin/users/:id/overrides` | `admin.permission:update` | `{ permissionId, effect: ALLOW\|DENY, validFromAt?, validToAt?, reason }` (lý do 3–255) | `200 { ok }`; đã có ngoại lệ cho quyền đó thì sửa | 403 chính mình, trần quyền (cả quyền `admin.*` của ngoại lệ); 422 quyền không có hoặc đã tắt, ngày bắt đầu không trước ngày kết thúc |
| `DELETE /admin/users/:id/overrides/:overrideId` | `admin.permission:update` | | `{ removed: true }` | 403; 404 ngoại lệ không thuộc người này |
| `POST /admin/users/:id/field-policies` | `admin.fieldpolicy:update` | `{ resourceId, fieldCode, accessLevel, validFromAt?, validToAt?, reason }` | `200 { ok }`; đã có thì sửa | 403 chính mình, trần quyền; 422 cột không có trong danh bạ, khoảng ngày sai |
| `DELETE /admin/users/:id/field-policies/:policyId` | `admin.fieldpolicy:update` | | `{ removed: true }` | 403; 404 |
| `GET /admin/scope-catalog` | `admin.user:view` | | `{ dimensions: [{ id, code, name, description, orgType }], orgUnits: [{ id, code, name, orgType, parentId, branchCode, path, isActive }] (chỉ nút `FACTORY`, kể cả đã ngừng), lines: [{ code, name, branchCode, isActive, workshopCode, workshopName }] (chuyền may của mọi ĐVCS, kể cả chuyền đã giải thể (`isActive = false`); bộ phận bỏ tích không còn là chuyền; `workshopCode`, `workshopName` là bộ phận cha) }` | 500 khi nguồn chuyền lỗi |

Trong `access`, dòng chiều `LINE` có `valueName` (tên chuyền, kể cả chuyền đã giải thể; `null` khi mã không là chuyền nào: bộ phận đã bỏ tích, chuyền cũ, `~mã`) và `valueActive` (còn là chuyền đang dùng không); chiều khác hai trường này là `null`.

Tổ hợp phạm vi hợp lệ (`AdminGrantsService.setAssignmentScope`, ADR 0005): `ALL` không kèm đơn vị hay giá trị và không đi cùng dòng khác của cùng chiều; chiều `FACTORY` (có `OrgType`) chỉ nhận `ALL`, `ORG_SUBTREE`, `LIST` với một đơn vị tổ chức đang dùng đúng loại; `ORG_SUBTREE` phải chứa ít nhất một đơn vị đúng loại của chiều; chiều `LINE` chỉ nhận `ALL` hoặc `LIST` kèm `value` là mã chuyền đang dùng (mã đã lưu ở chính phép gán đó thì được giữ dù không còn là chuyền); chiều `OWNER` chỉ nhận `ALL` hoặc `OWN`; chiều giá trị khác chỉ nhận `ALL` hoặc `LIST` kèm `value`. Dòng trùng gộp làm một. Ý nghĩa từng chế độ, phạm vi chuyền theo mã: [04-phan-quyen.md](04-phan-quyen.md).

### Vai trò, quyền, chính sách cột (`/admin`)

| Method, đường dẫn | Quyền | Body chính | Kết quả | Lỗi đặc thù |
|---|---|---|---|---|
| `GET /admin/roles` | `admin.role:view` | | `[{ id, code, name, description, isActive, isSystem, permissionCount, userCount }]` | |
| `POST /admin/roles` | `admin.role:create` | `{ code, name, description? }` | `201 { id }` | 409 trùng mã |
| `PUT /admin/roles/:id` | `admin.role:update` | `{ code? (phải trùng mã cũ), name?, description?, isActive? }` | `{ ok }` | 404; 422 `CODE_IMMUTABLE`; 409 tắt vai trò hệ thống; 403 đổi trạng thái vai trò mình giữ, trần quyền |
| `DELETE /admin/roles/:id` | `admin.role:delete` | | `{ removed: true }` (đặt `IsActive = 0`) | 404; 409 vai trò hệ thống; 403 vai trò mình giữ, trần quyền |
| `GET /admin/roles/:id/permissions` | `admin.permission:view` | | `{ permissionIds }` | 404 |
| `PUT /admin/roles/:id/permissions` | `admin.permission:update` | `{ permissionIds }` (toàn bộ, tối đa 2.000) | `{ added, removed }` | 404; 403 vai trò mình giữ, trần quyền; 422 quyền không có hoặc đã tắt |
| `GET /admin/permissions` | `admin.permission:view` | | `{ actions: [view, create, update, delete, export], modules: [{ code, name, resources: [{ id, code, name, scopeType, permissions: [{ id, code, action }] }] }] }` | |
| `GET /admin/menus` | `admin.permission:view` | | Cây menu `[{ id, code, name, path, icon, isMobile, isActive, resourceCode, children }]`. Chưa màn nào gọi | |
| `GET /admin/resource-fields` | `admin.fieldpolicy:view` | | `[{ id, code, name, fields: [{ code, name, description, isSensitive }] }]` | |
| `GET /admin/field-policies?resourceId=` | `admin.fieldpolicy:view` | | `{ resource, fields, roles (đang dùng), policies: [{ roleId, fieldCode, accessLevel }] }` | 404 tài nguyên |
| `PUT /admin/roles/:id/field-policies` | `admin.fieldpolicy:update` | `{ resourceId, policies: [{ fieldCode, accessLevel \| null }] }` (`null` xóa dòng) | `{ changed }` | 404; 403 vai trò mình giữ; 422 cột lặp, cột không có trong danh bạ |

### Đơn vị cơ sở, nhật ký (`/admin`)

| Method, đường dẫn | Quyền | Body chính | Kết quả | Lỗi đặc thù |
|---|---|---|---|---|
| `GET /admin/branches` | `admin.branch:view` | | `[{ id, code, name, description, isAggregate, isActive, isSystem, inBravo, factories: [{ code, name, isActive }] }]`; `inBravo` `null` với đơn vị tổng hợp hoặc khi chưa đọc được `MES_Sync` | |
| `POST /admin/branches/import` | `admin.branch:update` | | `200 { rows, added: [{ code, name }], updated: [{ code, from, to }], missing, skipped }` | 503 `SYNC_NOT_READY` |
| `POST /admin/branches` | `admin.branch:create` | `{ code, name, description? }` | `201 { id }` | 409 mã `A00`, trùng mã |
| `PUT /admin/branches/:id` | `admin.branch:update` | `{ code? (phải trùng), name?, description?, isActive? }` | `{ ok }` | 404; 422 `CODE_IMMUTABLE`; 409 tắt đơn vị tổng hợp, tắt ĐVCS đang làm việc, đổi tên ĐVCS có trong BRAVO |
| `GET /admin/audit?page&pageSize&q&from&to&entityType&userId` | `admin.audit:view` | | Trang `{ id (chuỗi), eventAt, username, branchCode, entityType, entityId, actionCode, oldValue, newValue, ip }` | |

### Danh mục hệ thống (`/admin/catalogs`)

Không có route `/catalog/*` riêng: danh mục nằm dưới `/admin/catalogs`.

| Method, đường dẫn | Quyền | Body chính | Kết quả | Lỗi đặc thù |
|---|---|---|---|---|
| `GET /admin/catalogs` | `admin.catalog:view` | | `{ mes: [{ code, kind (factory, item, shift, calendar), name, description, total, active, nameMax? }], external: [{ code, name, description, system, sourceObject, rowCount, lastSuccessAt, lastStatus }], externalError, branches: [{ code, name, isActive }] }`; `branches`: mọi ĐVCS trừ tổng hợp, kể cả đang tắt (ô lọc, ô chọn ĐVCS của Nhà máy SX) | |
| `GET /admin/catalogs/factories?q` | `admin.catalog:view` | | `[{ id, code, name, branchCode, branchName, description, sortOrder, isActive }]`; `q` tìm mã, tên, mô tả, mã ĐVCS | |
| `POST /admin/catalogs/factories` | `admin.catalog:create` + `admin.permission:update` | `{ code, name, branchCode, description?, sortOrder? }` | `201 { id }` | 403 thiếu `admin.permission:update`; 422 ĐVCS không có, tổng hợp, đang tắt, mã sai dạng; 409 trùng mã |
| `PUT /admin/catalogs/factories/:id` | `admin.catalog:update` (đổi ĐVCS, bật/tắt thêm `admin.permission:update`) | `{ code?, name?, branchCode?, description?, sortOrder?, isActive? }` | `{ ok }` | 404; 422 `CODE_IMMUTABLE`, ĐVCS sai; 403 thiếu quyền |
| `GET /admin/catalogs/items/:code?q` | `admin.catalog:view` | | `{ catalog: { code, name, description, nameMax }, items: [{ id, code, name, description, sortOrder, isActive }] }` | 404 danh mục không có hoặc đã ngừng |
| `POST /admin/catalogs/items/:code` | `admin.catalog:create` | `{ code, name, description?, sortOrder? }` | `201 { id }` | 404; 409 trùng mã; 422 tên dài hơn `nameMax` |
| `PUT /admin/catalogs/items/:code/:id` | `admin.catalog:update` | `{ code?, name?, description?, sortOrder?, isActive? }` | `{ ok }` | 404 (kể cả mục của danh mục khác); 422 `CODE_IMMUTABLE`, tên quá dài |
| `GET /admin/catalogs/shifts` | `admin.catalog:view` | | `[{ id, code, name, description, startTime, endTime, breakMinutes, workMinutes, overnight, sortOrder, isActive }]` | |
| `POST /admin/catalogs/shifts` | `admin.catalog:create` | `{ code, name, startTime, endTime, breakMinutes?, description?, sortOrder? }` | `201 { id }` | 409 trùng mã; 422 giờ sai dạng, giờ trùng, nghỉ không ngắn hơn ca |
| `PUT /admin/catalogs/shifts/:id` | `admin.catalog:update` | Như trên, mọi trường tùy chọn, kèm `isActive` | `{ ok }` | 404; 422 `CODE_IMMUTABLE`, như trên |
| `GET /admin/catalogs/work-calendars` | `admin.catalog:view` | | `{ defaults: { weeklyOffDays, outStartOffsetDays, outEndOffsetDays, warehouseStartOffsetDays, warehouseEndOffsetDays, productionRoundUpFrom }, items: [{ branchCode, branchName, branchActive, configured, weeklyOffDays, …4 số ngày, productionRoundUpFrom, dayCount }] }`: mọi ĐVCS đang dùng trừ tổng hợp, cộng ĐVCS đã ngừng mà có lịch riêng | |
| `PUT /admin/catalogs/work-calendars/:branchCode` | `admin.catalog:update` | `{ weeklyOffDays: [1–7] (tối đa 6), outStartOffsetDays, outEndOffsetDays, warehouseStartOffsetDays, warehouseEndOffsetDays (0–60), productionRoundUpFrom? (0,01–1, tối đa 2 chữ số lẻ; không gửi thì giữ số đang có) }` | `{ ok }`; chưa có lịch thì tạo | 404 ĐVCS không có; 422 tổng hợp, đang ngừng, nghỉ cả tuần, số ngày sai thứ tự; 409 hai người cùng tạo |
| `GET /admin/catalogs/work-calendars/:branchCode/days?year` | `admin.catalog:view` | | `[{ id, date, dayType, name }]` của năm | 404; 422 tổng hợp |
| `POST /admin/catalogs/work-calendars/days` | `admin.catalog:update` | `{ branchCodes: [mã] (1–50), from, to, dayType: OFF \| WORK, name? }` | `201 { count }` | 422 ngày không có thật, khoảng ngược, quá 62 ngày, ĐVCS tổng hợp hoặc đang ngừng; 404 ĐVCS không có; 409 người khác vừa sửa cùng lịch |
| `DELETE /admin/catalogs/work-calendars/:branchCode/days?from&to` | `admin.catalog:update` | | `{ removed: true, deleted }` (số ngày đã xóa, 0 khi không có) | 404; 422 tổng hợp, khoảng sai, ngoài năm 2000–2100, quá 366 ngày |
| `GET /admin/catalogs/external/:code/rows?page&pageSize&q` | `admin.catalog:view` | | `{ total, page, pageSize, columns: [{ name, type, key }], rows: [[giá trị]] }` | 404 mã lạ, không phải nguồn `CATALOG`; 503 `SYNC_NOT_READY` |

Endpoint của module khác dùng quyền danh mục: `GET/POST/PUT /sewing/prep-steps` ([07-may.md](07-may.md)), `GET/POST /hr/department-types`, `PUT /hr/department-types/:id` ([08-nhan-su.md](08-nhan-su.md)). Đồng bộ: `GET /admin/sync/sources`, `GET /admin/sync/runs`, `POST /admin/sync/start` ([09-dong-bo.md](09-dong-bo.md)).

### Thông tin của người đang đăng nhập (`/me`)

Mọi endpoint `/me` chỉ cần access token đã chọn ĐVCS (`@Authenticated`, không cần quyền riêng; token tạm trước khi chọn ĐVCS bị từ chối 401). Frontend gọi lại `/me`, `/me/menu`, `/me/permissions`, `/me/field-policies` khi dấu phiên bản quyền đổi: [04-phan-quyen.md](04-phan-quyen.md), [10-giao-dien.md](10-giao-dien.md).

| Method, đường dẫn | Kết quả |
|---|---|
| `GET /me` | `{ user: { id, username, fullName }, branch: { code, name, isAggregate }, roles: [{ code, name }] (vai trò có hiệu lực ở ĐVCS của phiên), productionFactories: [{ code, name, branchCode }] (nhà máy SX đang dùng thuộc ĐVCS của phiên; `A00`: mọi nhà máy đã gắn ĐVCS), permissionVersion }` |
| `GET /me/branches` | ĐVCS đang dùng mà người dùng được gán `[{ code, name, isAggregate }]` (đổi ĐVCS trên thanh trên cùng) |
| `GET /me/menu` | Cây menu đã lọc: mục lá hiện khi tài nguyên đang dùng và có `<tài nguyên>:view`; nhóm hiện khi còn ít nhất một con. `[{ code, name, icon, path, isMobile, children }]` |
| `GET /me/permissions` | `{ version, stamp, permissions: [mã quyền] }` tại ĐVCS của phiên, đã tính ngoại lệ |
| `GET /me/field-policies` | `{ version, resources: { <tài nguyên>: { <cột>: mức } } }` cho tài nguyên xem được |
| `GET /me/lines` | Chuyền may **đang dùng** (bộ phận tích "Xưởng sản xuất", chưa giải thể) của ĐVCS của phiên (`A00`: mọi ĐVCS) `[{ code, name, branchCode, isActive, workshopCode, workshopName, ancestors }]`; `workshopCode`, `workshopName` là bộ phận cha trực tiếp; `ancestors: [{ code, name }]` là các bộ phận cha từ gốc cây phòng ban tới bộ phận cha trực tiếp (rỗng khi chuyền nằm ở gốc), dùng cho ô Đơn vị phòng ban của Kế hoạch may ([07-may.md](07-may.md)). Xếp theo ĐVCS, bộ phận cha (chuyền nằm ở gốc cây phòng ban xếp cuối của ĐVCS), thứ tự, mã |
| `GET /me/branch-names` | `[{ code, name }]` mọi ĐVCS trừ tổng hợp: tên là `TenChiNhanh` của danh mục chi nhánh BRAVO, chưa đọc được thì `SysBranch.Name`; cả hai trống thì không có trong danh sách (màn hình hiện mã). Chỉ là tên hiển thị cho cột Chi nhánh, ĐVCS |

## Dịch vụ cho module khác

Module nghiệp vụ không đọc thẳng `MES_Core`; các service dưới đây là cổng chỉ đọc, có cache ngắn, được phần quản trị xóa cache khi sửa.

| Service | File | Cung cấp | Cache, xóa cache |
|---|---|---|---|
| `CatalogLookupService` | `backend/src/platform/catalog/catalog-lookup.service.ts` (module toàn cục) | `items(code)`, `activeItems(code)` (danh mục mã-tên, kể cả mục đã ngừng để dữ liệu cũ hiện đúng tên); `productionFactories()` (mọi nhà máy SX kèm ĐVCS); `workCalendar(branchCode)` (lịch làm việc của ĐVCS, chưa có thì lịch mặc định); `branchNames()`, `withBranchNames(rows)` (tên ĐVCS cho màn hình, file xuất) | 30 giây; `invalidate(code)`, `invalidateFactories()`, `invalidateBranchNames()`, `invalidateWorkCalendars()` (lần đọc lịch bắt đầu trước khi sửa không ghi vào cache). Tên ĐVCS: các request đến cùng lúc dùng chung một lần đọc, lần đọc bắt đầu trước khi sửa không ghi tên cũ vào cache, lỗi đọc BRAVO chỉ cảnh báo một lần |
| `OrgService` | `backend/src/platform/org/org.service.ts` (toàn cục) | Chuyền may từ nguồn module Nhân sự đăng ký (`registerSource(LineSource)`, [08-nhan-su.md](08-nhan-su.md)): `lines(branchCode, isAggregate, { includeInactive })` trả `LineInfo` (`code`, `name`, `branchCode`, `isActive`, `workshopCode`, `workshopName` là bộ phận cha trực tiếp, `ancestors` tùy chọn là các bộ phận cha từ gốc cây; nguồn của module Nhân sự luôn trả `ancestors`); `assertLine(branchCode, code)`: chuyền phải đang dùng và đúng ĐVCS, khác thì 422; `lineNamer()`: tên chuyền theo mã trên mọi ĐVCS, kể cả chuyền đã giải thể; mã không còn là chuyền (bộ phận bỏ tích, chuyền cũ) thì "<mã> (chuyền cũ)"; `activeLineCodes()`: mã chuyền đang dùng mọi ĐVCS (phạm vi chiều `LINE`). Chưa có nguồn thì không có chuyền; nguồn lỗi thì lỗi đi tới bên gọi | 30 giây theo tiến trình; các request cùng lúc chờ chung một lần đọc; `invalidate()` sau mọi lần ghi bộ phận, lần đọc bắt đầu trước đó không ghi vào cache |
| `UserDirectoryService` | `backend/src/platform/org/user-directory.service.ts` | `fullName(userId)` cho cột "Nhân viên lập", "Người lập" | 60 giây |
| `ExportService` | `backend/src/platform/export/export.service.ts` | `csv(user, resource, columns, rows, fileName)`: CSV UTF-8 có BOM, bỏ cột Ẩn, che cột Che (cả cột tên đi theo cột mã qua `field`), chặn chèn công thức Excel (ô bắt đầu bằng `= + - @` thêm dấu nháy), ghi nhật ký đọc dữ liệu nhạy cảm `EXPORT` | Luật cột: [04-phan-quyen.md](04-phan-quyen.md) |
| `work-calendar.ts` | `backend/src/platform/catalog/work-calendar.ts` | Hàm thuần: `lineDates(lịch, ngày bắt đầu, số ngày SX)` (số ngày nghỉ, kết thúc, ra chuyền, nhập kho); `productionDaysOf(lịch, số lượng, năng suất TB)` (Số ngày SX theo ngưỡng làm tròn của lịch, ít nhất 1); `offDaysBetween(lịch, từ, đến)` (số ngày nghỉ sau ngày đầu tới hết ngày cuối, cho Kết thúc vào chuyền nhập tay); `datesOrderError(ngày bắt đầu, năm ngày)` (lỗi thứ tự đầu tiên của các ngày nhập tay, kèm cột); `offsetsInOrder` (4 số ngày cộng thêm đúng thứ tự, như `CK_SysWorkCalendar_Offsets`); `nonWorkingDays`, `isOffDay`, `nextWorkingDay`, `presentCalendar`, `isRealDate`, `addCalendarDays`, `maskOf`, `weekdaysOf`, `DEFAULT_WORK_CALENDAR`; `readWorkCalendars(db)` đọc mọi lịch (`CatalogLookupService`, script seed, `load:bravo`, `sim:board` dùng). Bản sao giao diện: `frontend/src/lib/workCalendar.ts`, cùng bộ ca `backend/test/fixtures/work-calendar-cases.json` | |
| `factory-list.ts` | `backend/src/platform/catalog/factory-list.ts` | `splitFactories`, `joinFactories`, `normalizeFactories`, `factoryListFor`: chuẩn hóa danh sách mã nhà máy SX cách nhau dấu phẩy (bỏ khoảng trắng thừa, bỏ trùng không phân biệt hoa thường, giữ thứ tự; danh sách dài quá 400 ký tự thì không ghi) | |

## Bảng của `MES_Core` thuộc phần này

Trạng thái cuối sau mọi file trong `backend/migrations/MES_Core/` (danh sách file: [Kiến trúc](../ARCHITECTURE.md) mục 6.2). Mọi thời điểm là `DATETIME2(3)` UTC; `CreatedBy`, `ModifiedBy` là `SysUser.Id` (NULL khi do seed hoặc hệ thống ghi). Bảng người dùng, vai trò, quyền, phạm vi, phiên, nhật ký, menu: [04-phan-quyen.md](04-phan-quyen.md). Khóa ngầm từ database khác trỏ vào các bảng này khai ở `backend/migrations/softkeys.json` (loại quan hệ: [Kiến trúc](../ARCHITECTURE.md) mục 6.3).

### `SysBranch` (Đơn vị cơ sở)

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | Không | `PK_SysBranch` |
| `Code` | `VARCHAR(10)` | Không | `UQ_SysBranch_Code`. Mã ĐVCS (`A00`, `A01`…), là `BranchCode` của mọi bảng. Không sửa được (trigger) |
| `Name` | `NVARCHAR(100)` | Không | Tên ngắn; ĐVCS có trong BRAVO theo `TenChiNhanh` |
| `Description` | `NVARCHAR(255)` | Có | Tên đầy đủ (`TenDayDu` của BRAVO) |
| `IsAggregate` | `BIT` | Không | Mặc định 0. 1 = đơn vị tổng hợp (xem mọi ĐVCS, chỉ đọc, không gắn dữ liệu) |
| `SortOrder` | `INT` | Không | Mặc định 0 |
| `IsActive` | `BIT` | Không | Mặc định 1. 0 = không ai chọn được khi đăng nhập |
| `IsSystem` | `BIT` | Không | Mặc định 0. Seed và bản chép từ BRAVO đặt 1; thêm tay đặt 0 |
| `CreatedAt` | `DATETIME2(3)` | Không | Mặc định `SYSUTCDATETIME()` |
| `CreatedBy` | `INT` | Có | |
| `ModifiedAt` | `DATETIME2(3)` | Có | |
| `ModifiedBy` | `INT` | Có | |

- `UX_SysBranch_Aggregate`: chỉ mục duy nhất có lọc `(IsAggregate) WHERE IsAggregate = 1`, chỉ một đơn vị tổng hợp. Vì chỉ mục có lọc, lệnh sửa `SysBranch` phải chạy với `QUOTED_IDENTIFIER ON` (tedious mặc định ON; `sqlcmd` thêm `-I`).
- `TR_SysBranch_CodeImmutable` (AFTER UPDATE): đổi `Code` thì `RAISERROR` `CODE_IMMUTABLE` và rollback.
- Khóa ngoại trỏ tới: `SysUserBranch.BranchId` (theo `Id`), `SysOrgUnit.BranchCode`, `SysProductionFactory.BranchCode`, `SysWorkCalendar.BranchCode` (theo `Code`).

### `SysOrgUnit` (cây tổ chức; chỉ còn dùng nút ĐVCS)

Nút gốc loại `FACTORY` (mã = `BranchCode`) là ĐVCS, dùng cho phạm vi chiều `FACTORY`. Nút `WORKSHOP`, `LINE` là cây xưởng, chuyền cũ: ngừng dùng từ `MES_Core/0009`, không tạo mới, không xóa vật lý; chuyền may nay là bộ phận ở `MES_Hr` ([08-nhan-su.md](08-nhan-su.md)). Bảng, ràng buộc giữ nguyên:

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | Không | `PK_SysOrgUnit` |
| `Code` | `VARCHAR(20)` | Không | `UQ_SysOrgUnit_Code` (duy nhất toàn công ty). `CK_SysOrgUnit_Code`: chỉ chữ hoa ASCII, số, gạch ngang (so nhị phân `Latin1_General_BIN`), không rỗng. Không sửa được (trigger so nhị phân, chặn cả đổi hoa thường) |
| `Name` | `NVARCHAR(100)` | Không | |
| `Description` | `NVARCHAR(255)` | Có | Chưa dùng |
| `OrgType` | `VARCHAR(10)` | Không | `CK_SysOrgUnit_OrgType`: `FACTORY` (nút gốc = ĐVCS), `WORKSHOP`, `LINE` |
| `ParentId` | `INT` | Có | Cha; NULL ở nút gốc |
| `BranchCode` | `VARCHAR(10)` | Không | `FK_SysOrgUnit_Branch` → `SysBranch(Code)` |
| `Path` | `VARCHAR(400)` | Không | `/<mã ĐVCS>/[<mã xưởng>/]<mã nút>/`, ví dụ `/A01/A01-X01/A01-L03/`. `UX_SysOrgUnit_Path` duy nhất. Phạm vi "cả nhánh" lấy các nút có `Path` bắt đầu bằng `Path` của nút được chọn (`PermissionService`); lúc lưu, `AdminGrantsService` kiểm nhánh có nút đúng loại bằng `LIKE '<Path>%'` |
| `SortOrder` | `INT` | Không | Mặc định 0 |
| `IsActive` | `BIT` | Không | Mặc định 1 |
| `IsSystem` | `BIT` | Không | Mặc định 0; nút do seed hoặc bản chép ĐVCS từ BRAVO tạo đặt 1 |
| `CreatedAt` | `DATETIME2(3)` | Không | Mặc định `SYSUTCDATETIME()` |
| `CreatedBy` | `INT` | Có | |
| `ModifiedAt` | `DATETIME2(3)` | Có | |
| `ModifiedBy` | `INT` | Có | |
| `ParentOrgType` | `VARCHAR(10)` | Có | Thêm ở `0005`. Bản chép loại của nút cha; NULL ở nút gốc. Mọi chỗ ghi bảng phải ghi đúng cột này |

Ràng buộc giữ cây (database tự chặn, ADR 0010):

| Ràng buộc | Nội dung |
|---|---|
| `UQ_SysOrgUnit_IdBranchType` | Duy nhất `(Id, BranchCode, OrgType)`: đích của khóa ngoại ghép |
| `FK_SysOrgUnit_Parent` | `(ParentId, BranchCode, ParentOrgType)` → `(Id, BranchCode, OrgType)`: con cùng ĐVCS với cha, `ParentOrgType` đúng loại của cha, không đổi được loại của nút đang có con |
| `CK_SysOrgUnit_Level` | Cặp (loại, loại cha) hợp lệ: (`FACTORY`, NULL, không cha), (`WORKSHOP`, `FACTORY`), (`LINE`, `FACTORY` hoặc `WORKSHOP`); có `ParentOrgType IS NOT NULL` để NULL không lọt qua. Nhờ đó chuyền không làm cha, xưởng không lồng nhau, cây không có vòng |
| `CK_SysOrgUnit_Factory` | Nút `FACTORY`: không cha và `Code = BranchCode` |
| `CK_SysOrgUnit_NotSelf` | `ParentId <> Id` |
| `CK_SysOrgUnit_Path` | `Path` bắt đầu bằng `/<BranchCode>/` và kết thúc bằng `/<Code>/` |
| `TR_SysOrgUnit_PathMatchesParent` (`0006`, AFTER INSERT, UPDATE) | `Path` = `Path` của cha + `Code` + `/` (nút gốc: `/` + `Code` + `/`), sai thì lỗi `ORG_PATH_MISMATCH` và rollback. Chỉ kiểm dòng vừa ghi; `Path` của nút gốc, xưởng không đổi được nên đủ |
| `TR_SysOrgUnit_CodeImmutable` | Đổi `Code` (so nhị phân) thì lỗi `CODE_IMMUTABLE` và rollback |

- Chỉ mục: `IX_SysOrgUnit_ParentId`, `IX_SysOrgUnit_BranchCode`, `UX_SysOrgUnit_Path`.
- Bảng có trigger nên `INSERT … OUTPUT` không dùng được: thêm rồi đọc lại theo mã.
- Khóa ngoại trỏ tới: `SysUserRoleScope.OrgUnitId`. Không khóa ngầm nào trỏ tới bảng này: `LineCode` của dàn chuyền (`MES_Order.ShipmentPlanLine`), Kế hoạch chuẩn bị SX (`MES_Sewing.SewingPrep`), Kế hoạch may (`MES_Sewing.SewingDayPlan`), Cấp BTP (`MES_Cutting.CuttingSupplyLine`) trỏ tới `MES_Hr.Department.Code` (`backend/migrations/softkeys.json`).

### `SysCatalog` (loại danh mục mã-tên)

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | Không | `PK_SysCatalog` |
| `Code` | `VARCHAR(30)` | Không | `UQ_SysCatalog_Code`; `CK_SysCatalog_Code`: chữ hoa ASCII, số, gạch dưới, không rỗng |
| `Name` | `NVARCHAR(100)` | Không | |
| `Description` | `NVARCHAR(300)` | Có | |
| `SortOrder` | `INT` | Không | Mặc định 0; thứ tự trong tổng quan |
| `IsActive` | `BIT` | Không | Mặc định 1; danh mục ngừng thì không hiện, API mục trả 404 |
| `IsSystem` | `BIT` | Không | Mặc định 0; seed đặt 1 |
| `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` | | | Như bảng trên |

Dòng hiện có: `UNIT`, `ORDER_TYPE` (seed); `PROD_FACTORY` chỉ còn trên database đã seed trước `0007`, đã ngừng dùng (thay bằng `SysProductionFactory`), mục cũ giữ để đối chiếu.

### `SysCatalogItem` (mục của danh mục mã-tên)

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | Không | `PK_SysCatalogItem` |
| `CatalogId` | `INT` | Không | `FK_SysCatalogItem_Catalog` → `SysCatalog(Id)` |
| `Code` | `VARCHAR(30)` | Không | `CK_SysCatalogItem_Code`: chữ hoa ASCII, số, `.`, `_`, `-`, không rỗng. Lưu vào dữ liệu nghiệp vụ nên không sửa được |
| `Name` | `NVARCHAR(100)` | Không | Service giới hạn 20 ký tự với `UNIT` |
| `Description` | `NVARCHAR(300)` | Có | |
| `SortOrder` | `INT` | Không | Mặc định 0 |
| `IsActive` | `BIT` | Không | Mặc định 1 |
| `IsSystem` | `BIT` | Không | Mặc định 0 |
| `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` | | | |

- `UQ_SysCatalogItem_Code (CatalogId, Code)`; `IX_SysCatalogItem_Catalog (CatalogId, SortOrder)`.
- `TR_SysCatalogItem_CodeImmutable`: đổi `Code` hoặc `CatalogId` thì lỗi `CODE_IMMUTABLE` và rollback.

### `SysShift` (ca làm việc)

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | Không | `PK_SysShift` |
| `Code` | `VARCHAR(20)` | Không | `UQ_SysShift_Code`; `CK_SysShift_Code`: chữ hoa ASCII, số, `.`, `_`, `-`, không rỗng. Không sửa được (trigger `TR_SysShift_CodeImmutable`) |
| `Name` | `NVARCHAR(100)` | Không | |
| `Description` | `NVARCHAR(300)` | Có | |
| `StartTime` | `TIME(0)` | Không | |
| `EndTime` | `TIME(0)` | Không | `CK_SysShift_Times`: khác `StartTime`. Nhỏ hơn `StartTime` là ca qua đêm |
| `BreakMinutes` | `INT` | Không | Mặc định 0; `CK_SysShift_BreakMinutes` 0–480. Service còn kiểm nghỉ ngắn hơn ca |
| `SortOrder` | `INT` | Không | Mặc định 0 |
| `IsActive` | `BIT` | Không | Mặc định 1 |
| `IsSystem` | `BIT` | Không | Mặc định 0 |
| `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` | | | |

Driver trả cột `TIME` dạng `Date` ngày 1970-01-01 giờ UTC; service đổi về `HH:mm` (`hhmm` trong `catalog.service.ts`).

### `SysProductionFactory` (Nhà máy SX)

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | Không | `PK_SysProductionFactory` |
| `Code` | `NVARCHAR(100)` | Không | `UQ_SysProductionFactory_Code`. Tên nhà máy theo OSM. `CK_SysProductionFactory_Code` (`0008`): không rỗng, không dấu phẩy, không khoảng trắng đầu cuối. Không sửa được (trigger `TR_SysProductionFactory_CodeImmutable`) |
| `Name` | `NVARCHAR(100)` | Không | |
| `BranchCode` | `VARCHAR(10)` | Có | `FK_SysProductionFactory_Branch` → `SysBranch(Code)`; `IX_SysProductionFactory_Branch`. NULL = chưa gắn ĐVCS (nhà máy tự thêm theo OSM, mục chép từ `PROD_FACTORY` không trùng mã ĐVCS). Không gắn vào đơn vị tổng hợp: service kiểm (CHECK không đọc được bảng khác) |
| `Description` | `NVARCHAR(300)` | Có | Nhà máy tự thêm theo OSM ghi "Thêm tự động theo OSM" |
| `SortOrder` | `INT` | Không | Mặc định 0 |
| `IsActive` | `BIT` | Không | Mặc định 1 |
| `IsSystem` | `BIT` | Không | Mặc định 0 |
| `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` | | | `CreatedBy` NULL với nhà máy tự thêm theo OSM |

Khóa ngầm trỏ tới: `MES_Order.SalesOrder.ProductionFactoryCode` → `Code`, dạng danh sách cách nhau dấu phẩy (`softkeys.json` khai `"list": ","`).

### `SysWorkCalendar` (lịch làm việc của ĐVCS, phase 5.12)

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | Không | `PK_SysWorkCalendar` |
| `BranchCode` | `VARCHAR(10)` | Không | `FK_SysWorkCalendar_Branch` → `SysBranch(Code)`; `UQ_SysWorkCalendar_Branch`. Không phải đơn vị tổng hợp (service kiểm) |
| `WeeklyOffMask` | `TINYINT` | Không | Mặc định 64 (Chủ nhật); mỗi thứ một bit: 1 = thứ Hai … 64 = Chủ nhật; `CK_SysWorkCalendar_WeeklyOffMask` < 127 |
| `OutStartOffsetDays`, `OutEndOffsetDays`, `WarehouseStartOffsetDays`, `WarehouseEndOffsetDays` | `INT` | Không | Mặc định 3, 3, 2, 5; mỗi cột 0–60; `CK_SysWorkCalendar_Offsets`: `OutStart <= OutEnd` và `OutStart + WarehouseStart <= OutEnd + WarehouseEnd` |
| `ProductionRoundUpFrom` | `DECIMAL(3,2)` | Không | Mặc định 0,50 (`DF_SysWorkCalendar_ProductionRoundUpFrom`); `CK_SysWorkCalendar_ProductionRoundUpFrom`: 0,01–1,00. Ngưỡng làm tròn Số ngày SX (MES_Core/0014, quyết định 6.11) |
| `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` | | | Như các bảng khác |

### `SysWorkCalendarDay` (ngày nghỉ lễ, làm bù)

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | Không | `PK_SysWorkCalendarDay` |
| `WorkCalendarId` | `INT` | Không | `FK_SysWorkCalendarDay_Calendar` → `SysWorkCalendar(Id)`; `UQ_SysWorkCalendarDay_Date (WorkCalendarId, CalendarDate)` |
| `CalendarDate` | `DATE` | Không | |
| `DayType` | `VARCHAR(10)` | Không | `OFF` (nghỉ) hoặc `WORK` (làm bù), `CK_SysWorkCalendarDay_DayType` |
| `Name` | `NVARCHAR(100)` | Có | Ví dụ "Tết Nguyên đán" |
| `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` | | | Xóa vật lý được (nhật ký giữ ngày đã xóa) |

### `SysUserProductionFactory` (không còn dùng)
Bảng gán người dùng ↔ nhà máy SX tạo ở `0007`: `Id INT IDENTITY` (PK), `UserId INT` (FK → `SysUser`), `ProductionFactoryId INT` (FK → `SysProductionFactory`), `CreatedAt DATETIME2(3)` (mặc định `SYSUTCDATETIME()`), `CreatedBy INT NULL`; `UQ_SysUserProductionFactory (UserId, ProductionFactoryId)`; `IX_SysUserProductionFactory_Factory (ProductionFactoryId)`. Code không đọc, không ghi bảng này (chỉ `reset:demo` và test xóa dòng của tài khoản mẫu): nhà máy SX lấy theo ĐVCS đăng nhập (ADR 0013). Xóa bảng bằng migration khi trưởng dự án chốt.

### Migration liên quan

Danh sách file migration của `MES_Core` và nội dung từng file: [Kiến trúc](../ARCHITECTURE.md) mục 6.2. Ghi chú khi chạy một số file (theo chú thích đầu file):
- `0002_scope_field_override`, `0005_org_workshop`, `0006_org_path_guard`: dừng backend trước khi chạy; `0002` còn nêu các truy vấn phải kiểm trước.
- `0004_move_prep_to_order`: chỉ đổi khi database còn tài nguyên `sewing.prep` và chưa có `order.prep`; không thì không làm gì.
- `0006_org_path_guard`: kiểm `Path` của dữ liệu đang có trước khi tạo `TR_SysOrgUnit_PathMatchesParent`; có dòng không khớp cây thì dừng (`THROW 50001`), phải sửa dữ liệu rồi chạy lại.
- `0014_work_calendar_rounding`: lịch đã có nhận ngưỡng 0,50 (mặc định của cột); bản build cũ không đọc cột này nên chạy được trước khi deploy bản mới.

## Dữ liệu do seed tạo

Chi tiết dữ liệu mẫu, tài khoản, ma trận quyền: [12-du-lieu-mau-va-kiem-thu.md](12-du-lieu-mau-va-kiem-thu.md). Phần thuộc màn quản trị (`backend/scripts/seed.ts`, `seed-data.ts`; seed chỉ thêm phần thiếu, không ghi đè thay đổi ở màn hình):
- Luôn tạo: đơn vị tổng hợp `A00` "Toàn công ty"; nhóm menu Quản trị và 8 mục; danh mục `UNIT` (Cái, Chiếc, Bộ, PCS, Set) và `ORDER_TYPE` (SXXK, GCXK, GCND, GCND-1P, SXND); 4 ca mẫu (HC, CA1, CA2, CA3 qua đêm); chép ĐVCS từ BRAVO nếu `MES_Sync` đã có bảng chép chi nhánh.
- Cây tổ chức: nút gốc cho mỗi ĐVCS đang có (không phải tổng hợp); seed không tạo nút Xưởng, Chuyền. Xưởng, chuyền mẫu là phòng ban ở `MES_Hr`, chỉ khi có dữ liệu mẫu: [12-du-lieu-mau-va-kiem-thu.md](12-du-lieu-mau-va-kiem-thu.md).
- Chỉ khi có dữ liệu mẫu: ĐVCS mẫu `A01`–`A03`; nhà máy SX mẫu `A01`, `A01-B` (thuộc A01), `A02`, `A03`.

## Test liên quan

| File | Kiểm |
|---|---|
| `backend/test/catalog.spec.ts` | Quyền danh mục; danh mục mã-tên (mã viết hoa, trùng, bất biến, ngừng dùng mất khỏi gợi ý, nhật ký); chép ĐVCS từ BRAVO (bỏ mã sai, không đè `A00`, chạy lại không đổi, có nút gốc cây, tên theo BRAVO không sửa được); nhà máy SX (ĐVCS hợp lệ, mã bất biến, có hiệu lực ngay trong `/me`, cần `admin.permission:update`, tự thêm theo OSM); API chuyền, xưởng cũ trả 404, không tạo nút cây; database vẫn giữ cấp của cây cũ; chuyền mồ côi hiện "(chuyền cũ)"; ca làm việc; lịch làm việc (quyền, tổng hợp, nghỉ cả tuần, số ngày sai thứ tự, ngày không có thật, khoảng quá dài, đặt cho nhiều ĐVCS, ghi đè ngày đã có, xóa theo khoảng, lưu lại cấu hình cũ không thêm nhật ký, ngưỡng làm tròn, nhật ký); danh mục BRAVO chỉ xem |
| `backend/test/branch-names.spec.ts` | `CatalogLookupService.branchNames`: tên theo BRAVO, rơi về tên ở `SysBranch`, cache và đọc đồng thời |
| `backend/test/phase3.spec.ts`, `phase5.spec.ts`, `full-access.spec.ts` | Quản trị phân quyền có hiệu lực ngay, không tự đổi quyền mình, trần quyền, đổi tên và tắt ĐVCS, vai trò hệ thống: chi tiết ở [12-du-lieu-mau-va-kiem-thu.md](12-du-lieu-mau-va-kiem-thu.md) |
| `frontend/src/test/admin.test.tsx` | Popup tích vai trò: lưu đúng danh sách; mục đã ngừng còn tích thì chưa cho lưu |
| `frontend/src/test/admin-pages.test.tsx` | Chính sách cột lưu một phần khi một vai trò lỗi; khóa tài khoản hỏi trước; popup gán ĐVCS ghi nhà máy SX; thao tác với chính mình bị khóa có lý do; ngăn kéo không mất phần đang nhập; ngừng vai trò hỏi trước, nêu số người |
| `frontend/src/test/catalog-work-calendar.test.tsx` | Lịch làm việc: mở theo ĐVCS đăng nhập, ngày nghỉ gom theo đợt, xóa cả đợt sau xác nhận, thêm nghỉ thứ Bảy rồi lưu, số ngày sai thứ tự không gửi, bấm ngày trên lịch năm mở popup điền sẵn, chỉ quyền xem không có nút ghi |
| `frontend/src/test/catalog-factories.test.tsx` | Nhà máy SX khi chỉ có quyền danh mục: nút Thêm và công tắc khóa có lý do, sửa tên không gửi ĐVCS; chưa chọn danh mục thì mở Nhà máy SX, ĐVCS lấy từ tổng quan; liên kết cũ `?c=LINE` chỉ sang Sơ đồ tổ chức |
| `frontend/src/test/user-access-scope.test.tsx` | Ô Chuyền ở bộ sửa phạm vi: gom theo ĐVCS, bộ phận cha, giá trị là mã; mã không còn tác dụng giữ khi lưu, chỉ bỏ được khi còn chuyền đang dùng; bỏ hết chuyền phải xác nhận |
| `frontend/src/test/branch-name.test.tsx` | Hiện tên ĐVCS thay mã |
