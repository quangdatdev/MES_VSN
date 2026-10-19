# Review Phase 1–4 – 09/10/2026

**Phạm vi:** 85 file, chia ba lượt. Mỗi lượt do agent `code-reviewer` chạy độc lập, chỉ đọc. Phiên chính đọc lại code để kiểm chứng từng phát hiện trước khi sửa.

| Lượt | File | Kết luận agent | Phát hiện |
|---|---|---|---|
| 1 – Lõi bảo mật backend | 29 file: `platform/auth`, `data`, `permission`, `me`, `database`, `audit`, `common`, `config/env.ts`, `app.factory.ts`, `app.module.ts`, `main.ts`, `health.controller.ts` | BLOCK | 0 CRITICAL, 3 HIGH, 4 MEDIUM, 7 LOW |
| 2 – Quản trị, dữ liệu, script | 21 file: `platform/admin`, `modules/demo-po`, `migrations/**`, `scripts/*` | BLOCK | 0 CRITICAL, 1 HIGH, 6 MEDIUM, 12 LOW |
| 3 – Frontend và test | 35 file: `frontend/src/**`, `backend/test/*` | BLOCK | 1 CRITICAL, 0 HIGH, 7 MEDIUM, 9 LOW |

**Kết quả sau khi sửa:**
- 1 CRITICAL và 4 HIGH đã đóng, mỗi lỗi có test chứng minh.
- 17 MEDIUM: 15 đã sửa (2 trong số đó sửa phần chính), 1 sửa một phần và chờ người dùng chọn (#6), 1 hoãn kèm lý do (#7).
- 28 LOW: 13 đã sửa (2 sửa phần chính), 6 sửa một phần, 9 hoãn kèm lý do.

Không phát hiện nào bị đánh giá là "không phải lỗi": mọi phát hiện đều khớp với code khi kiểm lại.

Quyết định mới phát sinh từ review được ghi ở `docs/adr/0004-phien-dang-nhap-va-tran-quyen-quan-tri.md`.

## CRITICAL / HIGH

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| 1 | CRITICAL | `auth.controller.ts` logout, `store/auth.ts` | Access token đã hết hạn thì đăng xuất không thu hồi phiên. Người sau trên máy dùng chung bấm F5 là vào tài khoản người trước. | `POST /auth/logout` thành `@Public`, thu hồi phiên theo cookie refresh, luôn xóa cookie. Frontend đăng xuất không cần token, xóa cache; mất mạng thì báo người dùng. Test backend và frontend. | Đóng |
| 2 | HIGH | `auth.service.ts` login | Khóa sau 5 lần sai bị vượt bằng request song song: bộ đếm ghi đè nhau, nhánh sai còn gỡ khóa. | Tăng `FailedLoginCount` nguyên tử bằng `OUTPUT`, quyết định khóa theo giá trị trong DB. Nhánh sai không bao giờ ghi `LockedUntilAt = NULL`. Nhánh đúng chỉ xóa bộ đếm khi không bị khóa. Test gửi 15 request song song. | Đóng |
| 3 | HIGH | `main.ts` trust proxy, `audit.service.ts` | Client tự đặt `X-Forwarded-For` để giả IP trong nhật ký, hoặc gửi chuỗi dài làm hỏng INSERT để xóa dấu vết đăng nhập. | `trust proxy` chỉ bật khi có `TRUST_PROXY`; IP phải qua `isIP`; nhật ký cắt chuỗi theo độ dài cột. Địa chỉ lắng nghe đọc từ `HOST`. Test. | Đóng |
| 4 | HIGH | `auth.service.ts` select-branch, `auth.guard.ts` | Token cũ vẫn dùng được và còn tạo phiên mới sau khi admin thu hồi mọi phiên hoặc đặt lại mật khẩu. | Access token mang `sid`, `AuthGuard` kiểm phiên chưa thu hồi. Token tạm mang dấu vết mật khẩu. Đổi nhà máy thì thu hồi phiên hiện tại. `selectBranch` kiểm `IsActive`. Test. | Đóng |
| 5 | HIGH | `admin-access.service.ts` updateRole | Tự bật lại vai trò mình đang giữ sau khi bị người khác tắt, tức là tự cấp lại quyền. | Chặn cả hai chiều bật/tắt vai trò mình giữ; thêm trần quyền quản trị. Test. | Đóng |

## MEDIUM

| # | Lượt | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| 6 | 1 | `auth.service.ts` | Lộ tài khoản có tồn tại hay không (qua thời gian phản hồi và mã 423) | Thời gian phản hồi: luôn chạy argon2 với hash giả. **Mã 423 giữ nguyên** theo `api-contract.md` mục 2; tài liệu mâu thuẫn với checklist review, cần người dùng chọn. | Sửa một phần |
| 7 | 1 | `app.factory.ts` | Chưa có giới hạn tần suất (rate limit) cho đăng nhập và refresh | Để Phase 5.1: cần chốt cách triển khai (Nginx hay `@nestjs/throttler`) và proxy thật. Lỗi khóa tài khoản (#2) đã sửa nên dò mật khẩu vẫn bị chặn theo từng tài khoản. | Hoãn |
| 8 | 1 | `auth.service.ts` refresh | Xoay refresh token không nguyên tử; lỗi 5xx cũng xóa cookie | UPDATE có điều kiện theo hash cũ và `RevokedAt IS NULL`; 5xx giữ cookie. Phát hiện dùng lại token và hạn tuyệt đối để Phase 5.1. | Đóng (phần chính) |
| 9 | 1 | `permission.guard.ts` | `@Authenticated`/`@Public` ở class ghi đè `@RequirePermission` ở method | Đọc `REQUIRE_PERMISSION` trước ở cả hai guard. Test. | Đóng |
| 10 | 2 | `admin-users.service.ts` | Người chỉ có `admin.user:update` đặt lại được mật khẩu hoặc tắt tài khoản admin | Trần quyền quản trị (ADR 0004). Test. | Đóng |
| 11 | 2 | `admin-users.service.ts`, `admin-access.service.ts` | Gán vai trò không có trần: tạo tài khoản phụ rồi gán ADMIN | Trần quyền cho nhóm `admin.*`. Quyền nghiệp vụ vẫn cấp được theo thiết kế (ADR 0004). Test. | Đóng |
| 12 | 2 | `admin-users.service.ts` | Bật lại user không tăng `PermissionVersion`, user bị báo "đã vô hiệu" | Đổi `IsActive` theo chiều nào cũng tăng version. Test. | Đóng |
| 13 | 2 | admin services | Tăng version và ghi audit nằm ngoài transaction; lỗi audit bị nuốt | `bumpVersion(trx)` và `audit.logStrict(trx)` trong cùng transaction, xóa cache sau khi commit. | Đóng |
| 14 | 2 | `scripts/reset-demo.ts` | Không kiểm đang chạy trên database demo | Từ chối khi `NODE_ENV=production`, hoặc khi `DB_HOST` không phải SQL Server trên chính máy (trừ khi có `--allow-remote-db`). In tên máy chủ trong lời nhắc. | Đóng |
| 15 | 2 | `scripts/seed.ts` | Chạy lại seed âm thầm cấp lại quyền đã bị thu hồi, không có audit | Chỉ nạp ma trận cho vai trò hoặc quyền vừa tạo; `--sync-matrix` để nạp đủ (reset-demo dùng). Ghi audit `SEED`. | Đóng |
| 16 | 3 | `App.tsx`, `store/auth.ts` | Cache TanStack Query không bị xóa khi đăng xuất, đổi nhà máy hay đổi quyền | Tách `lib/queryClient.ts`. `clear()` khi kết thúc phiên và khi đổi nhà máy; `invalidateQueries()` khi `X-Permission-Version` đổi. Test. | Đóng |
| 17 | 3 | `lib/api.ts` | Nhà máy của phiên bị gỡ hoặc tắt thì người dùng kẹt ở lỗi 403 | 403 `BRANCH_NOT_ALLOWED` thì kết thúc phiên, màn đăng nhập hiện lý do. Test. | Đóng |
| 18 | 3 | `lib/api.ts` | Nhiều tab: refresh đổi nhà máy ngầm, thao tác ghi bị gửi lại sang nhà máy mới | Refresh trả nhà máy khác thì không gửi lại request; báo `BRANCH_CHANGED`, nạp lại menu và quyền. Test. | Đóng |
| 19 | 3 | `store/auth.ts` loadAccess | Kết quả cũ đè phiên mới (đổi nhà máy, đăng xuất) | Bỏ kết quả nếu phiên đã kết thúc hoặc khác nhà máy; tạm ngừng xử lý version trong lúc đổi nhà máy. | Đóng |
| 20 | 3 | `PermissionsPage.tsx` | Tải quyền lỗi mà ma trận vẫn cho Lưu, ghi đè mất quyền của vai trò | Khóa ma trận và nút Lưu khi chưa tải xong hoặc lỗi; có nút Tải lại; xóa bản nháp khi đổi vai trò. | Đóng |
| 21 | 3 | `BranchesPage.tsx` | Tắt nhà máy bằng một cú bấm, kể cả nhà máy đang làm việc | Hỏi xác nhận khi tắt. Ẩn công tắc ở nhà máy đang chọn; backend trả 409. Test backend. | Đóng |
| 22 | 3 | test | Thiếu test phiên và phân quyền | Thêm 13 test backend (`test/review-fixes.spec.ts`) và 6 test frontend (`src/test/session.test.ts`). Test giao diện PoPage ở A00 để Phase 5. | Đóng phần chính |

## LOW

| # | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| 23 | `permission.service.ts` | Cache quyền không hết hạn theo `ValidTo` của vai trò | Chưa có code ghi `ValidFrom`/`ValidTo`; làm cùng quyền có thời hạn ở Phase 5.1 | Hoãn |
| 24 | `base.repository.ts` | An toàn dựa vào nơi gọi | Loại cột hệ thống (không phân biệt hoa thường), kẹp `pageSize` ≤ 100, SHARED không gắn `BranchCode`; thêm `scoped()` cho lớp con. Danh sách cột được ghi để Phase 5 | Đóng phần chính |
| 25 | `http-exception.filter.ts` | AppException 5xx không được log | Log kèm traceId. Ánh xạ mã theo status để sau | Đóng phần chính |
| 26 | `auth.service.ts` | Đăng nhập khi đang khóa không có audit | Ghi `LOGIN_LOCKED` | Đóng |
| 27 | `env.ts` | Mặc định kết nối DB chưa an toàn cho production | Production bắt buộc `JWT_SECRET` ≥ 32 ký tự. `DB_ENCRYPT` theo môi trường để Phase 5.8 (triển khai) | Một phần |
| 28 | `main.ts`, eslint | Promise nổi, `any` không lý do | `bootstrap().catch`. Bật rule `no-floating-promises`/`no-explicit-any` cùng dọn `any` ở Phase 5 | Một phần |
| 29 | `permission.guard.ts` | Đọc version hai lần mỗi request | Tối ưu hiệu năng, để sau | Hoãn |
| 30 | `admin-users.service.ts` | Tự đặt lại mật khẩu của mình qua API admin | Chặn, trả `SELF_ELEVATION_FORBIDDEN`; ẩn nút ở giao diện. Test | Đóng |
| 31 | admin services | Đặt lại mật khẩu, access token cũ còn dùng được 15 phút | Đóng cùng #4 (`sid`) | Đóng |
| 32 | DTO admin, PO | `null` lọt qua `@IsOptional` gây 500; ngày ISO dạng lạ | `ValidateIf(v !== undefined)` cho cột NOT NULL; ngày `YYYY-MM-DD`. Test | Đóng |
| 33 | `demo-po.repository.ts` | `nextPoNo` tự viết điều kiện `BranchCode`, hỏng sau số 999 | Dùng `scoped()` của BaseRepository; lấy số sau tiền tố `DEMO-A01-`; kiểm ghi trước | Đóng |
| 34 | admin services | Kiểm trùng rồi mới insert, gửi đồng thời trả 500 | Bắt lỗi unique trả 409 ở Phase 5 | Hoãn |
| 35 | admin services | Insert từng dòng; `listRoles` tải cả bảng | Insert theo lô ≤ 500; đếm bằng `GROUP BY` | Đóng |
| 36 | admin, PO | Audit thiếu IP; `newValue` ghi ý định | `newValue` ghi đúng trường đã đổi. IP qua audit interceptor ở Phase 5.1 | Một phần |
| 37 | nhiều file | `as any` khi `set()`/`insert` | Sửa kiểu cột nullable trong `core.types.ts` ở Phase 5 | Hoãn |
| 38 | migration | Thiếu index `SysAuditLog(UserId)`, ràng buộc một đơn vị tổng hợp | Cần migration `0002` (người duyệt chạy); Phase 5.1 | Hoãn |
| 39 | `migrate.ts`, `.env.example` | Ứng dụng và migration dùng chung login `sa` | Tách login ứng dụng/migration và `DENY UPDATE, DELETE` trên `SysAuditLog` **trước UAT** (Phase 5.8) | Hoãn |
| 40 | `migrate.ts` | `__MigrationHistory` không lưu checksum | Phase 5 | Hoãn |
| 41 | `seed.ts` | `--reset-passwords` không thu hồi phiên, không audit | Thu hồi phiên của tài khoản demo; audit `SEED` | Đóng |
| 42 | `LoginPage`, guards | Tài khoản một nhà máy thấy màn chọn nhà máy chớp lên | Trải nghiệm, để sau | Hoãn |
| 43 | `store/auth.ts` | Đổi nhà máy sau 15 phút báo hết hạn | Đổi nhà máy cho `api()` tự làm mới token | Đóng |
| 44 | `PoPage.tsx` | Xóa dòng cuối trang cuối thì kẹt trang rỗng | Lùi một trang | Đóng |
| 45 | `PoPage.tsx` | Không có quyền thêm vẫn thấy nút "Thêm PO" | Ẩn nút; A00 vẫn hiện nút khóa kèm lý do; câu trạng thái trống theo quyền | Đóng |
| 46 | màn quản trị | Lỗi tải chỉ thấy bảng rỗng; bị đẩy ra không rõ lý do | Màn đăng nhập hiện lý do. Dòng lỗi kèm Thử lại ở các màn danh sách để Phase 5 | Một phần |
| 47 | test | DOM không được dọn giữa các test; khẳng định audit yếu | `afterEach(cleanup)`. Khẳng định audit theo mốc để sau | Một phần |
| 48 | `PoPage.tsx`, `LoginPage.tsx` | `SortHead` khai báo trong render làm mất focus; link `href="#"` | Bỏ link giả. `SortHead` để Phase 5 | Một phần |
| 49 | `UsersPage`, `RolesPage` | Không xóa được email; mô tả rỗng lưu `''` | Gửi `null`; backend chuẩn hóa `'' → null` | Đóng |
| 50 | `lib/types.ts` | Kiểu dữ liệu chép tay giữa frontend và backend | Gói `shared` ở Phase 5 (ghi vào mục Phát sinh) | Hoãn |

Ghi chú khác từ lượt 1: `npm audit` báo 2 lỗi mức moderate ở `sprintf-js`, phụ thuộc của `tedious`. Lỗi này không nhận dữ liệu từ client nên rủi ro thấp. Không chạy `npm audit fix --force` vì lệnh đó hạ `tedious` xuống bản cũ. Theo dõi bản `tedious` mới.

## Lint và test sau khi sửa
- `npm run lint`: backend và frontend, 0 lỗi, 0 cảnh báo.
- `npx tsc --noEmit` backend; `npm run build` frontend: qua.
- Backend: 46/46 test qua (33 cũ + 13 mới trong `test/review-fixes.spec.ts`).
- Frontend: 12/12 test qua (6 cũ + 6 mới trong `src/test/session.test.ts`).
- Đã thử lại trên trình duyệt:
  - khôi phục phiên cũ (token không có `sid` được refresh tự động);
  - đăng xuất, sau đó refresh trả 401;
  - `kehoach.a` thêm PO, số tự sinh `DEMO-A01-013`, rồi xóa PO đó;
  - `admin` không thấy nút "Thêm PO".
