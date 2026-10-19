# Phase 5.1 – Nâng phân quyền (L3 phạm vi, L4 cột, L5 ngoại lệ)

**Trạng thái:** Ready for review (09/10/2026; làm cùng module Đơn hàng – Phase 5.3, theo chỉ đạo của người dùng; còn task 5.1.6) · **Ước lượng:** 6 ngày công, gồm 0,5 ngày review · **Phụ thuộc:** Phase 4 duyệt

## Mục tiêu
Hoàn thành mô hình phân quyền 5 lớp trước khi nạp dữ liệu thật (`docs/thiet-ke/de-xuat-phuong-an-nen-tang.html` mục 4 và 6). Demo hiện có L1 (đăng nhập) và L2 (Role, quyền chức năng) cộng lọc theo nhà máy. Phase này thêm:
- **L5 – Ngoại lệ theo người dùng:** Allow/Deny một quyền cho riêng một người, có hạn dùng và lý do.
- **L4 – Theo cột:** ẩn, che (`***`), chỉ đọc theo cột, theo Role hoặc theo người. Backend lọc trước khi trả; frontend chỉ phản chiếu.
- **L3 – Phạm vi theo chuyền:** phạm vi gắn vào **phép gán** Role (`ALL`, `ORG_SUBTREE`, `LIST`, `OWN`), tổ chức theo cây Nhà máy → Chuyền.
- Các mục bảo mật đã hoãn từ review Phase 1–4 (`docs/review/phase-1-4.md`) thuộc nhóm 5.1.

Kết quả đo được: một kịch bản demo mới, ví dụ "Trưởng chuyền 3 chỉ thấy PO của chuyền 3, không thấy đơn giá; riêng anh X được xem đơn giá đến 31/12". Kịch bản chạy bằng dữ liệu cấu hình, không sửa code.

## Quy tắc đánh giá (đã chốt ở phương án nền tảng mục 4.1)
1. Có Deny của user còn hiệu lực ⇒ từ chối.
2. Có Allow của user còn hiệu lực ⇒ cho phép (vẫn bị giới hạn phạm vi).
3. Hợp quyền của mọi phép gán Role đang hiệu lực. **Phạm vi tính theo từng phép gán** rồi mới hợp lại.
4. Không khớp gì ⇒ từ chối.

Chính sách cột khi một người có nhiều Role: lấy mức **mở nhất** (Sửa > Chỉ đọc > Che > Ẩn). Chính sách theo người thắng mọi Role. Cột đánh dấu nhạy cảm mặc định Ẩn.

## Việc cần làm
| # | Task | Tiêu chí hoàn thành | Ước lượng | Trạng thái |
|---|---|---|---|---|
| 5.1.1 | Thiết kế chi tiết, ADR 0005, migration | ADR 0005 chốt cách đánh giá L3/L4/L5 và cache. Migration `MES_Core/0002`: `SysResourceField`, `SysOrgUnit`, `SysScopeDimension`, `SysUserRoleScope`, `SysResourceScopeBinding`, index `SysAuditLog(UserId)`, ràng buộc một đơn vị tổng hợp. Migration `MES_Demo/0002`: cột `UnitPrice`, `Amount`, `LineCode` cho `DemoPo`. **Người duyệt chạy migration** | 0,5 | Xong. Migration đã chạy trên SQL Server máy dev (người dùng cho phép). `MES_Demo/0002` bỏ vì PO demo được thay bằng module Đơn hàng (ADR 0006) |
| 5.1.2 | L5 ngoại lệ theo người dùng | `PermissionService` áp thứ tự Deny > Allow > Role, tính cả hạn dùng. Cache hết hạn theo mốc `ValidFrom`/`ValidTo` gần nhất (review #23). API và tab "Ngoại lệ" ở màn Người dùng, bắt buộc lý do, có audit. Trần quyền `admin.*` áp cả cho ngoại lệ. Test | 0,75 | Xong (tab Ngoại lệ quyền trong ngăn kéo Phân quyền chi tiết ở màn Người dùng) |
| 5.1.3 | L4 backend: đăng ký cột và lọc cột | Khai báo cột trong `SysResourceField` (cờ nhạy cảm; che luôn là `***`). `FieldPolicyService` tính mức hiệu lực. Response bỏ cột Ẩn, che cột Che; ghi vào cột Chỉ đọc, Che, Ẩn bị từ chối 403 `FIELD_READONLY`. Dùng chung một chỗ cho xem, sửa và **xuất file**. Test | 1 | Xong (`FieldPolicyService` + interceptor `@FieldResource`, `ExportService`) |
| 5.1.4 | L4 frontend và màn quản trị cột | `GET /me/field-policies`; lưới PO ẩn cột, hiện `***`, khóa ô theo chính sách; màn "Chính sách cột" (Role hoặc người × tài nguyên × cột). Đổi chính sách thì tăng `PermissionVersion` | 1 | Xong (màn Quản trị › Chính sách cột; tab Cột riêng theo người; lưới `DataGrid` ẩn cột, ô Che có kiểu riêng, khóa ô chỉ đọc) |
| 5.1.5 | L3 phạm vi theo chuyền | Cây `SysOrgUnit` (Nhà máy → Chuyền, seed chuyền giả). Gán vai trò đổi sang so sánh khác biệt, xóa phạm vi kèm audit trước khi xóa phép gán (không có xóa dây chuyền trong DB). `reset-demo.ts` và phần dọn dữ liệu của test xóa `SysUserRoleScope` trước khi xóa `SysUserRole`. Test "thêm vai trò không làm mất phạm vi vai trò cũ". `BaseRepository` sinh điều kiện theo phép gán: `ALL`, `ORG_SUBTREE`, `LIST`, `OWN`; nhiều chiều kết hợp AND, nhiều giá trị OR. Màn gán phạm vi khi gán Role. Test kịch bản "Nam: Trưởng chuyền ở A, Xem báo cáo ở B" | 1,5 | Xong (12 chuyền A01, 8 A02, 6 A03; gán phạm vi trong tab Vai trò và phạm vi; chưa có màn quản lý cây tổ chức, chuyền do seed tạo) |
| 5.1.6 | Mục bảo mật hoãn từ review Phase 1–4 | Rate limit đăng nhập và refresh (#7); phát hiện dùng lại refresh token, hạn tuyệt đối của phiên (#8); IP trong audit qua interceptor (#36); nhật ký đọc dữ liệu nhạy cảm | 0,75 | Một phần: nhật ký đọc dữ liệu nhạy cảm và IP trong audit (lấy ở AuthGuard) đã có. **Còn:** rate limit (#7), dùng lại refresh token và hạn tuyệt đối của phiên (#8) |
| 5.1.7 | Ma trận test, kịch bản demo mới, kiểm khóa ngầm | Script chỉ đọc kiểm bản ghi mồ côi theo `softkeys.json` (CLAUDE.md mục 5; còn thiếu từ Phase 1), kể cả điều kiện kèm (`LineCode` là chuyền cùng nhà máy; mở rộng `softkeys.json` để khai báo điều kiện này). Seed điền đơn giá, chuyền cho 36 PO mẫu và tạo lại phạm vi mẫu. Test tự động cho 5 người mẫu của phương án nền tảng mục 4.4 (Giám đốc, Kế hoạch A, Trưởng chuyền 3, Trưởng chuyền 3 có ngoại lệ, Kế toán). Cập nhật `docs/thiet-ke/seed-demo.md` và `docs/kich-ban-demo.md` | 0,5 | Xong (`npm run check:softkeys -w backend`; người mẫu: giamdoc, kehoach.a, truongchuyen.a, truongchuyen.b, ketoan) |
| 5.1.8 | Review: `code-reviewer` + lượt bảo mật riêng | `docs/review/phase-5-1.md`, không còn `CRITICAL`/`HIGH` mở | 0,5 | Xong 2 lượt (xem `docs/review/phase-5-1.md`) |
| 5.1.9 | Vai trò Toàn quyền (người dùng yêu cầu 12/10/2026, ADR 0014) | Vai trò hệ thống `FULL_ACCESS`: mọi quyền nghiệp vụ, quyền quản trị bằng ADMIN, mọi cột nhạy cảm Sửa được; seed gán cho tài khoản `admin` (một lần khi vai trò mới tạo). Giữ luật A00 chỉ xem, ghi theo ĐVCS, không tự đổi quyền mình. Test `seed.spec`, `hr.spec` | 0,5 | Xong code, test, review 2 lượt (`docs/review/phase-5-1.md`). Chờ người dùng chạy seed trên máy chủ |

## Quyết định cần chốt trước khi viết code
| # | Vấn đề | Đề xuất | Người quyết |
|---|---|---|---|
| Q1 | Cột nhạy cảm cho demo | `UnitPrice` (đơn giá), `Amount` (thành tiền) của PO giả; mặc định Ẩn, Giám đốc thấy, Kế hoạch chỉ đọc. Danh sách thật do BA chốt khi làm module | Người dùng / BA |
| Q2 | Nguồn danh sách chuyền | Seed chuyền giả (`A01-L01`…), sau này đồng bộ từ Nhân sự/GSD (5.2) | Người dùng |
| Q3 | Mã 423 khi khóa tài khoản (mâu thuẫn còn treo từ Phase 4) | Giữ 423 theo `api-contract.md`; rate limit (5.1.6) giảm rủi ro dò tài khoản | Người dùng |
| Q4 | Nhật ký đọc dữ liệu nhạy cảm | Bảng riêng `SysSensitiveReadLog`, chỉ ghi thêm (phase 5 mục "Quyết định cần chốt") | Ban lãnh đạo / Dev Lead |
| Q5 | Rate limit ở đâu | Trong ứng dụng (`@nestjs/throttler`, theo IP và theo tên đăng nhập); Nginx thêm lớp ngoài khi triển khai | Dev Lead |

## Đã chốt (09/10/2026)
- Q1: cột nhạy cảm demo là `UnitPrice` (đơn giá) và `Amount` (thành tiền) của PO giả.
- Q2: làm đủ L3 + L4 + L5; chuyền giả `A01-L01`…, đồng bộ chuyền thật ở 5.2.
- Q3: giữ 423 khi khóa tài khoản.
- Q4, Q5: theo đề xuất (bảng `SysSensitiveReadLog`; rate limit trong ứng dụng).
- Migration do người dùng tự chạy (`npm run migrate`).

## Tiêu chí review
- [ ] Deny theo người thắng mọi Role; Allow theo người vẫn bị giới hạn phạm vi; hết hạn thì mất hiệu lực đúng giờ
- [ ] Cột Ẩn không có trong JSON (kể cả xuất file); cột Che trả `***`; ghi vào cột không được sửa bị từ chối
- [ ] Phạm vi tính theo từng phép gán: quyền sửa ở nhà máy A không rò sang nhà máy B
- [ ] Đổi chính sách cột, ngoại lệ, phạm vi: hiệu lực ngay, có audit, tăng `PermissionVersion`
- [ ] Không tự nâng quyền qua ngoại lệ hay chính sách cột của chính mình
- [ ] Frontend chỉ phản chiếu; backend cưỡng chế ở mọi đường (list, get, sửa, xuất)
- [ ] `code-reviewer` và lượt bảo mật không còn `CRITICAL`/`HIGH`

## Phát sinh (09/10/2026, người dùng chỉ đạo)
- Bỏ qua đồng bộ BRAVO/OSM/GSD trong đợt này, đẩy hết luồng: hoàn thành 5.1 và dựng luôn module Đơn hàng (Phase 5.3) có dữ liệu giả để tự kiểm thử phân quyền, ẩn/che cột (`phase-5-3-module-don-hang.md`, ADR 0006).
- Màn PO demo được thay bằng module Đơn hàng (bỏ `MES_Demo`, `DemoPo`).
- Người dùng cho phép AI tự chạy migration và seed trên SQL Server **localhost** trong đợt này.
- Mật khẩu demo đặt là `admin` (`DEMO_PASSWORD` trong `backend/.env`, không commit). Test dùng mật khẩu riêng cho tài khoản thử nên không phụ thuộc độ dài mật khẩu demo.
- Việc chưa làm, cần người dùng quyết: task 5.1.6 phần rate limit và refresh token; màn quản lý cây tổ chức (thêm, tắt chuyền).

## Kết quả (09/10/2026)
- Backend: `PermissionService` tính quyền theo (người dùng, nhà máy) với Deny > Allow > Role và phạm vi theo phép gán; `BaseRepository`/`ChildRepository` sinh điều kiện L3; `FieldPolicyService` + interceptor cưỡng chế L4 cho xem, sửa, xuất file; API quản trị phạm vi, ngoại lệ, chính sách cột, xem thử quyền.
- Frontend: màn Chính sách cột; ngăn kéo Phân quyền chi tiết (vai trò và phạm vi, ngoại lệ, cột riêng, xem thử); lưới dữ liệu phản chiếu chính sách cột.
- Test: 76 test backend (Phase 1–5), 18 test frontend; lint, build qua.

## Không làm
Ủy quyền tạm thời, luồng phê duyệt, kiểm tra tách nhiệm vụ (SoD), SSO/AD, chính sách theo ca hoặc thiết bị (phương án nền tảng mục 9, "Thiết kế sẵn, làm sau"). Đồng bộ chuyền thật từ Nhân sự/GSD (5.2). Module nghiệp vụ thật (5.3 trở đi).

## Rủi ro
- Phase dài nhất từ đầu dự án và chạm lõi phân quyền. Thứ tự cắt khi thiếu thời gian (theo phương án nền tảng): giao diện quản trị nâng cao ⇒ che cột phức tạp ⇒ ngoại lệ theo người. **Không cắt:** L3 và việc cưỡng chế ở backend.
- Migration chỉ do người duyệt chạy. Task 5.1.2 trở đi chờ migration 5.1.1.
- Mỗi request thêm truy vấn chính sách cột và phạm vi: cache theo `PermissionVersion` giống quyền chức năng.
