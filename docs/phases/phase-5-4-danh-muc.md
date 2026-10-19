# Phase 5.4 – Danh mục hệ thống

**Trạng thái:** Ready for review (5.4.8 xong 10/10/2026) · **Bắt đầu:** 10/10/2026 · **Thiết kế:** `docs/thiet-ke/db-core.md` mục "Bổ sung ở Phase 5.4", ADR 0010

## Mục tiêu
Một màn Quản trị › Danh mục hệ thống để xem, kiểm tra và điều chỉnh các danh mục dùng trong MES.

## Chốt với người dùng (10/10/2026)
- Một màn, hai nhóm: danh mục MES tự quản (thêm, sửa, ngừng dùng) và danh mục chép từ BRAVO (chỉ xem; sửa bên BRAVO rồi bấm Đồng bộ).
- Danh mục MES đợt đầu: Chuyền may, Đơn vị tính, Loại đơn hàng, Ca làm việc.
- Mặc định (không hỏi lại): menu ở Quản trị, chỉ vai trò Quản trị có Xem/Thêm/Sửa (cấp thêm ở màn Phân quyền), không có Xóa – danh mục ngừng dùng bằng `IsActive` (CLAUDE.md mục 5), mã không sửa được sau khi tạo.

## Task

| # | Task | Tiêu chí xong | Trạng thái |
|---|---|---|---|
| 5.4.1 | Bảng danh mục | `MES_Core/0003_catalog.sql`: `SysCatalog`, `SysCatalogItem` (danh mục mã, tên dùng chung), `SysShift` (ca có giờ); trigger cấm sửa mã. Chuyền may dùng `SysOrgUnit` sẵn có | Xong, đã chạy trên localhost |
| 5.4.2 | API `/admin/catalogs` | `platform/catalog`: tổng quan; chuyền (tạo nút nhà máy nếu thiếu, tăng phiên bản quyền, làm mới cache chuyền); danh mục mã-tên; ca làm (ca qua đêm, nghỉ ngắn hơn ca); danh mục BRAVO chỉ đọc qua `SyncService` (tên bảng từ `SyncSource`, cột từ `sys.columns`); nhật ký mọi thay đổi | Xong |
| 5.4.3 | Quyền, menu, dữ liệu mẫu | `admin.catalog` (ADMIN: VCU); seed Đơn vị tính (mã BRAVO → tên), Loại đơn hàng (SXXK, GCND…), 4 ca mẫu; seed chạy lại không ghi đè | Xong |
| 5.4.4 | Màn hình | `CatalogsPage.tsx`: cột trái danh sách danh mục (điện thoại: ô chọn), cột phải bảng + hộp thêm/sửa, công tắc ngừng dùng (chuyền có xác nhận), danh mục BRAVO phân trang + tìm | Xong |
| 5.4.5 | Dùng danh mục ở nơi khác | Ô Loại, Đơn vị tính ở Thông tin đơn hàng gợi ý theo danh mục; script nạp BRAVO đổi đơn vị tính theo danh mục `UNIT`; dữ liệu giả dùng mã Loại của danh mục | Xong |
| 5.4.6 | Test | `backend/test/catalog.spec.ts` (7 bài: quyền, mã bất biến/trùng, ngừng dùng ảnh hưởng gợi ý và ô chọn chuyền, ca qua đêm, BRAVO chỉ đọc + chống tên bảng lạ, ngừng chuyền đã có kế hoạch: vẫn lưu được, người được giao chuyền mất dữ liệu ngay) | Xong |
| 5.4.7 | Review `code-reviewer` | `docs/review/phase-5-4.md`, không còn CRITICAL/HIGH | Lượt 1 BLOCK (1 HIGH: ngừng chuyền khóa việc lưu Xếp chuyền; 4 MEDIUM) → sửa; lượt 2 APPROVE WITH SUGGESTIONS (9 LOW) → sửa; 3 LOW hoãn có lý do. Test backend 123/123, frontend 19/19 |
| 5.4.8 | Cây Nhà máy → Xưởng → Chuyền (người dùng chọn phương án B ngày 10/10/2026, ADR 0010) | Migration `MES_Core/0005_org_workshop.sql`: loại `WORKSHOP`, `ParentOrgType` + khóa ngoại ghép + `CK_SysOrgUnit_Level` để database giữ đúng cấp. API thêm, sửa, ngừng xưởng; chuyển chuyền giữa xưởng; chuyền đang dùng phải ở xưởng đang dùng. `/me/lines` có xưởng; ô chọn chuyền ở Xếp chuyền, Phân bổ màu cỡ, Kế hoạch chuẩn bị SX, phạm vi người dùng gom theo xưởng. Màn Chuyền may thành bảng cây. Seed xưởng mẫu A01, A02. Theo phản hồi người dùng (ô chọn chuyền trong lưới dàn chuyền dài, khó tìm): ô chọn một chuyền dùng `components/TreeSelect`, xưởng thu gọn được, gõ không dấu tìm theo tên chuyền, mã, tên hoặc mã xưởng. Test backend +4 bài (`catalog.spec.ts`), frontend +20 bài (`catalog-lines.test.tsx`, `tree-select.test.tsx`); review `code-reviewer` 4 lượt (lượt 3–6) | Xong: đã chạy migration và seed trên localhost; review lượt 3–6 (`docs/review/phase-5-4.md`) |

## Sửa kèm (cùng ngày, theo yêu cầu người dùng)
- Chú thích dưới tiêu đề mọi màn chuyển thành tooltip khi rê chuột, chạm hoặc Tab vào tiêu đề (`components/PageTitle.tsx`).
- Logo thu gọn: logo mới không vuông, co vừa ô, không bị cắt; `icon-192.png` sinh lại thành ảnh vuông 192×192.

## Không làm
- Xóa vật lý danh mục; sửa danh mục BRAVO trên MES.
- Ràng buộc cứng Loại, Đơn vị tính của đơn hàng vào danh mục (vẫn nhập tay được, chỉ gợi ý) – chờ BA chốt.
- Ca làm việc theo từng nhà máy (hiện dùng chung toàn công ty).

## Phát sinh
- Chưa có màn nào dùng ca làm việc; chuẩn bị cho module May và báo cáo sản lượng theo giờ.
- Ngừng dùng chuyền ảnh hưởng phân quyền: người được giao phạm vi theo chuyền đó mất dữ liệu của chuyền ngay; thêm chuyền làm phạm vi "theo cây nhà máy" thấy chuyền mới. Vì vậy chỉ vai trò Quản trị có quyền sửa danh mục.
- Danh mục BRAVO Nhân viên, Người dùng BRAVO có họ tên, tên đăng nhập: trước khi cấp `admin.catalog:view` cho vai trò khác cần danh sách trắng cột hoặc nhật ký đọc (review 5.4 #11).
- Seed sinh đủ 5 hành động cho mọi tài nguyên nên có `admin.catalog:delete` dù không có thao tác xóa (không cấp cho ai, review #12).
- `SalesOrder.OrderType` mới chỉ gợi ý theo danh mục, chưa khai báo khóa ngầm trong `softkeys.json`: làm khi BA chốt ràng buộc cứng (review #17).
- 5.4.8, giả định chờ BA (ADR 0010):
  - cấp cố định Nhà máy → Xưởng → Chuyền, xưởng không lồng nhau;
  - chuyển chuyền sang xưởng khác thì số liệu gom theo xưởng đổi theo, kể cả tháng trước (chưa có báo cáo theo xưởng).
- 5.4.8: phạm vi "cả xưởng" chạy ở backend (có test) nhưng màn phạm vi người dùng vẫn chọn từng chuyền. Cần thì thêm ô chọn "cả xưởng" ở bước sau (đụng phần quản trị quyền, review ngay).
