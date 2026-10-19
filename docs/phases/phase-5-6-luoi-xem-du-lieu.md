# Phase 5.6 – Lưới xem dữ liệu: kéo giãn cột, 100 dòng theo ngày tạo, lọc theo cột trên máy chủ

**Trạng thái:** Ready for review · **Bắt đầu:** 10/10/2026 · **Thiết kế:** ADR 0011 · **Review:** `docs/review/phase-5-6.md`

## Mục tiêu
Yêu cầu của người dùng (10/10/2026) cho các màn xem dữ liệu:
1. Người xem tự chỉnh được độ rộng cột.
2. Chỉ tải 100 dòng đầu, theo ngày tạo. Cần xem hết thì bấm phân trang.
3. Ô lọc, ô tìm phải query trong cơ sở dữ liệu, không tìm trong dữ liệu đã hiển thị.
4. Trên đầu mỗi cột có mũi tên nhỏ chỉ xuống. Bấm vào thì hiện bộ lọc chọn giá trị của cột đó, theo ảnh `docs/nguon/filter-column-view.png`.

## Phạm vi
- **Lưới dùng chung `DataGrid`:** mọi màn có lưới (Đơn hàng, May, popup chi tiết, Danh mục) kéo giãn được cột.
- **Lọc theo cột và 100 dòng theo ngày tạo, ở các màn:**
  - Thông tin đơn hàng;
  - Kế hoạch xuất hàng;
  - Xếp chuyền (danh sách);
  - Phân bổ màu cỡ;
  - Cập nhật tỷ lệ cắt (danh sách mã hàng và danh sách PO);
  - Kế hoạch chuẩn bị SX.
- **Quản trị:**
  - Người dùng, Nhật ký hệ thống, lịch sử Đồng bộ dữ liệu, danh mục BRAVO: 100 dòng;
  - Người dùng xếp theo ngày tạo;
  - ô tìm cây xưởng, chuyền và ô tìm mục danh mục hỏi máy chủ.

## Không làm
- **Bảng HTML thường ở Quản trị** (người dùng, vai trò, nhật ký, danh mục…): chưa có kéo cột, lọc theo cột. Các màn này chưa dùng `DataGrid`. Xem mục Phát sinh.
- **Bảng dàn chuyền (Gantt):** không phải lưới.
- **"Text Filter"** (bắt đầu bằng, bằng, khác…) như DevExpress: popup có ô tìm "chứa chữ" chạy trong DB.
- **Index mới cho `CreatedAt`:** chưa thêm. Dữ liệu hiện vài nghìn dòng; khi bảng lớn thì thêm qua migration.

## Task

| # | Task | Tiêu chí xong | Trạng thái |
|---|---|---|---|
| 5.6.1 | Nền tảng lọc theo cột ở backend | `platform/data/column-filter.ts` gồm: đọc và kiểm `cf`, điều kiện `in`/`notIn` có xét ô trống, danh sách trắng `FilterSpec`, kiểu `text`/`number`/`date`/`day`/`datetime`. `BaseRepository.distinctValues` đi qua cùng lọc nhà máy, phạm vi L3 như `list()`. Cột Ẩn/Che: bỏ bộ lọc, hỏi giá trị thì 403 | Xong |
| 5.6.2 | Các màn Đơn hàng, May ở backend | Có `FilterSpec` (không có cột giá) và route `/values`. `cf` áp cả cho xuất file. Mặc định `pageSize` 100, sắp xếp `createdAt:desc`, trả `createdAt`. Danh sách mã hàng Tỷ lệ cắt có phân trang | Xong |
| 5.6.3 | `DataGrid`: kéo giãn cột | Kéo mép tiêu đề, bấm đúp vừa nội dung, phím mũi tên, nút đặt lại ở ô STT. Lưu theo lưới trên trình duyệt; đọc lỗi thì coi như chưa kéo. Tiêu đề 2 tầng vẫn đúng (`colgroup`) | Xong |
| 5.6.4 | `DataGrid`: nút lọc trên tiêu đề, popup lọc | Mũi tên trên cột có `filterKey`; cột đang lọc thành phễu tô màu, có vạch dưới tiêu đề. Popup gồm: ô tìm (hỏi DB, debounce 300 ms), "(Chọn tất cả)", danh sách giá trị, "(Trống)", Áp dụng, Hủy, Xóa lọc. Nút khóa nói lý do. Đủ trạng thái tải, lỗi, rỗng, quá 500. Bộ lọc nằm trên URL (`cf`) | Xong |
| 5.6.5 | Các màn: cột lọc, cột Ngày tạo, 100 dòng | 6 màn ở mục Phạm vi. Dải lọc nhắc "Lọc theo cột: …", Xóa lọc xóa cả bộ lọc theo cột. Tên chi nhánh, tên chuyền, tên trạng thái hiện đúng trong popup | Xong |
| 5.6.6 | Quản trị: 100 dòng, ô tìm hỏi máy chủ | Người dùng, Nhật ký, lịch sử đồng bộ, danh mục BRAVO 100 dòng; người dùng mới tạo lên đầu. `GET /admin/catalogs/lines?q&branch`, `GET /admin/catalogs/items/:code?q` | Xong |
| 5.6.7 | Test, tài liệu, review | Backend: `test/column-filter.spec.ts`. Frontend: `src/test/column-filter.test.tsx`, sửa `catalog-lines.test.tsx`. Cập nhật ADR 0011, `api-contract.md`, `quy-tac-ui-ux.md`. Review `docs/review/phase-5-6.md` | Xong: APPROVE WITH SUGGESTIONS, 3 MEDIUM + 10 LOW đã sửa; backend 163 test, frontend 83 test |

## Phát sinh
- **Tab nhóm ở màn Đồng bộ dữ liệu** (Tất cả, Danh mục, Đơn hàng, Có lỗi) vẫn lọc trên trình duyệt:
  - đây là tab trên danh sách cố định 18 nguồn, cần đủ danh sách để đếm số trên tab;
  - không phải ô tìm dữ liệu (ADR 0011 mục 5).
  - Người dùng muốn chuyển cả phần này lên máy chủ thì báo.
- **Bảng ở màn Quản trị** (Người dùng, Nhật ký…) chưa kéo cột, chưa lọc theo cột: cần chuyển sang `DataGrid`. Nhật ký hệ thống là ứng viên đầu tiên, vì dữ liệu tăng mãi. Chờ người dùng quyết.
- **Dữ liệu nạp từ BRAVO:** ngày tạo là lúc nạp. Khi chốt ánh xạ (5.2.8) cân nhắc dùng ngày chứng từ BRAVO.
- **Làm song song với phiên khác:** phiên khác (cây xưởng, chuyền, tên chi nhánh) cùng sửa `common.tsx`, các trang Đơn hàng, `PrepPlanPage.tsx`, `global.css`. Hai bên chỉ thay đúng đoạn và báo trước khi chạy test có đụng dữ liệu dùng chung (`seed.spec`).

## Checklist review
- [ ] Bộ lọc theo cột không nhận tên cột, biểu thức từ client. Chỉ giá trị, đi qua tham số.
- [ ] `distinctValues` đi qua lọc nhà máy, phạm vi L3 như `list()`; A00 đọc mọi nhà máy; nhà máy khác không thấy giá trị.
- [ ] Cột Ẩn/Che: không lọc được, không có giá trị (403), giao diện không có nút lọc. Không có cột giá trong danh sách trắng.
- [ ] `notIn` và ô trống đúng (NULL, chuỗi rỗng).
- [ ] Mặc định 100 dòng, mới tạo lên trước, ở cả 6 màn và danh sách mã hàng Tỷ lệ cắt.
- [ ] Kéo cột: chuột, bấm đúp, bàn phím, đặt lại; lưu và đọc lại; tiêu đề 2 tầng (Kế hoạch chuẩn bị SX).
- [ ] Popup lọc: chọn tất cả, bỏ vài giá trị, tìm rồi áp dụng (như Excel), Xóa lọc, lỗi tải, quá 500 giá trị.
- [ ] Điện thoại 360 px: popup 288 px không tràn; nút lọc, tay kéo vẫn bấm được.
