# Review Phase 5.6 – 10/10/2026

Phạm vi:
- **Backend (khoảng 20 file):**
  - `platform/data/column-filter.ts` (mới), `base.repository.ts`;
  - `modules/order/*.service.ts`, `order.repositories.ts`, `order.dto.ts`, `order.controller.ts`;
  - `modules/sewing/{prep.service,sewing.dto,sewing.controller,sewing.repositories}.ts`;
  - `platform/catalog/{catalog.service,catalog.controller,catalog.dto}.ts`;
  - `platform/admin/{admin.dto,admin-users.service}.ts`, `platform/sync/sync.dto.ts`;
  - `test/column-filter.spec.ts` (mới).
- **Frontend (khoảng 20 file):**
  - `lib/columnFilter.ts`, `components/ColumnFilter.tsx` (mới), `components/DataGrid.tsx`;
  - `lib/useUrlParams.ts`;
  - `features/order/*` (5 trang + `common.tsx`), `features/sewing/PrepPlanPage.tsx`;
  - `features/admin/{CatalogsPage,UsersPage,AuditPage,SyncPage}.tsx`;
  - `theme/global.css`;
  - `test/column-filter.test.tsx` (mới), `test/catalog-lines.test.tsx`.

Kết luận agent `code-reviewer`: **APPROVE WITH SUGGESTIONS**. Không có CRITICAL, không có HIGH; 3 MEDIUM, 10 LOW, 1 gợi ý làm cứng. Phiên chính đã kiểm chứng từng mục rồi mới sửa.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| M1 | MEDIUM | `components/ColumnFilter.tsx` | Gõ tìm rồi Enter hoặc Áp dụng trong 300 ms thì áp dụng trạng thái cũ (có thể xóa mất bộ lọc), không theo kết quả tìm | Tự debounce: chữ gõ chưa kịp tìm thì nút Áp dụng khóa ("Đang tìm giá trị…"). Enter lúc đó tìm ngay; xem kết quả rồi Enter lần nữa mới áp dụng. Test "gõ rồi Enter ngay" | Đóng |
| M2 | MEDIUM | `ColumnFilter.tsx`, `order.dto.ts`, `sewing.dto.ts` | Tìm rồi Áp dụng nhiều tên có dấu: `cf` quá dài, máy chủ trả 431 hoặc 422 với câu chung "Dữ liệu không hợp lệ." | Giao diện chặn khi `cf` đã mã hóa URL vượt 6.000 ký tự, nói cách sửa. Máy chủ chặn trên 8.000 ký tự với câu "Bộ lọc theo cột quá dài…" (`parseColumnFilters`); DTO chỉ còn chặn chuỗi vô lý (20.000). Test cả hai phía | Đóng |
| M3 | MEDIUM | `CutRatioPage.tsx` | Đổi dải lọc hoặc "Người lập" không về trang 1 của danh sách mã hàng | Đổi dải lọc, Người lập thì xóa `page`, `ppage` | Đóng |
| L1 | LOW | `base.repository.ts` `distinctValues` | Cột ngày quá 500 giá trị thì popup chỉ hiện các ngày cũ nhất | Cột ngày xếp mới nhất lên trước (`newestFirst`). Test cập nhật | Đóng |
| L2 | LOW | `global.css` `.grid-resize` | Tay kéo 7 px khó chạm trên điện thoại | Màn cảm ứng: 12 px. Không tới 24 px vì sẽ che nút lọc sát mép phải; ghi lý do trong CSS | Đóng (một phần) |
| L3 | LOW | `prep.service.ts` | Ngày tạo hiện `SourceCreatedAt ?? CreatedAt`, nhưng lọc và sắp xếp theo `SourceCreatedAt` | Hiện đúng `SourceCreatedAt` (luôn có sau lần chép đầu), cùng nguồn với lọc, sắp xếp | Đóng |
| L4 | LOW | `column-filter.ts` | Ô chỉ có khoảng trắng: SQL coi là trống, popup lại coi là giá trị | `normalize`, `presentValues` coi chuỗi toàn khoảng trắng là trống. Test | Đóng |
| L5 | LOW | `prep.service.ts` `values()` | Mỗi lần mở popup, gõ tìm đều chép dàn chuyền lại (có thể chờ khóa 15 giây) | Bỏ bước chép ở `values()`: `list()` đã chép ngay trước | Đóng |
| L6 | LOW | `format.ts`, `column-filter.ts` | Lưới hiện giờ theo máy, bộ lọc theo UTC+7 cố định | Ghi giả định "mọi máy đặt giờ Việt Nam" vào ADR 0011 | Đóng (ghi tài liệu) |
| L7 | LOW | `common.tsx`, `PrepPlanPage.tsx`, `CutRatioPage.tsx` | Dòng "Lọc theo cột" liệt kê cả bộ lọc mà máy chủ bỏ qua (cột bị Che) | Chỉ liệt kê cột xem được (`readable(policy, …)`) | Đóng |
| L8 | LOW | `CutRatioPage.tsx` | Bộ lọc PO (`pcf`) còn nguyên khi đổi mã hàng; Xuất file áp `pcf` khi chưa chọn mã | Đổi mã hàng thì xóa `pcf`; Xuất file chỉ gửi `pcf` khi đã chọn mã. Phần dải lọc gửi kèm Xuất file PO có từ trước Phase 5.6, giữ nguyên | Đóng |
| L9 | LOW | `DataGrid.tsx` | Tay kéo (`role="separator"`, nhận focus) thiếu `aria-valuenow` khi chưa kéo | Luôn có `aria-valuenow`, kèm `aria-valuetext` ("Tự co theo nội dung" hoặc "… px") | Đóng |
| L10 | LOW | test | Thiếu test `/values` với phạm vi "chỉ bản ghi do mình tạo"; thiếu test M1, M2 | Thêm test ở `phase5.spec.ts` (người chỉ xem bản ghi của mình không thấy tên khách của đơn người khác) và 2 test frontend | Đóng |
| G1 | Gợi ý | `base.repository.ts` | `distinctValues` nhận `RawBuilder` tùy ý | Đổi sang nhận `FilterColumn` (cột của danh sách trắng) và tự dựng biểu thức; `search` là chữ, đi qua tham số | Đóng |

Agent đã kiểm và xác nhận không phải lỗi:
- **Chèn tên cột, biểu thức:** không được. `field` qua regex rồi `hasOwnProperty`, khóa `__proto__` bị 422.
- **`distinctValues` đi qua cùng lọc nhà máy, phạm vi L3 như `list()`:** đúng ở cả Phân bổ màu cỡ (`withPlanFilter`) và danh sách mã hàng (`scoped`).
- **Cột Ẩn/Che không lộ** qua `/values`, `cf`, `q`, sort. Không có cột giá trong danh sách trắng.
- **SQL:** `notIn` với NULL đúng; ngày UTC → giờ Việt Nam đúng; `DISTINCT … ORDER BY alias OFFSET/FETCH` hợp lệ; số tham số dưới 2.100; đếm danh sách mã hàng trên truy vấn con đúng.
- **`CatalogService.lines`:** `activeLines` đếm trên mọi chuyền; không gửi `q` thì phản hồi như cũ.

Kiểm tra trên app thật (Chrome chạy ngầm, tài khoản kehoach.a, nhà máy A01):
- **Thông tin đơn hàng:** 100 dòng, "Hiển thị 1-100 trong 1.103 dòng", mới tạo lên trước.
- **Lọc theo cột:** popup "Khách hàng" lấy 17 khách hàng từ DB. Chọn HOUDINI thì URL mang `cf`, còn 33 dòng; dải lọc nhắc "Lọc theo cột: Khách hàng".
- **Kéo cột:** bằng phím (cộng dồn), lưu độ rộng; không tiêu đề nào bị cụt khi chuyển sang độ rộng cố định.
- **Kế hoạch chuẩn bị SX:** tiêu đề 2 tầng đúng khi kéo cột KH.
- **Điện thoại 360 px:** popup không tràn, trạng thái hiện tên tiếng Việt.

Lint/test sau khi sửa:
- **Backend:** lint sạch, build qua, `npm test` **163/163**.
- **Frontend:** lint sạch, build qua, **83/83**.
