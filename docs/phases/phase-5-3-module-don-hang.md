# Phase 5.3 – Module Đơn hàng (dữ liệu giả, chưa đồng bộ)

**Trạng thái:** Ready for review (09/10/2026) · **Phụ thuộc:** 5.1 (khung phân quyền 5 lớp) · **Nguồn:** `docs/nguon/BẢNG MÔ TẢ GIAO DIỆN MES - ĐƠN HÀNG.docx`, ADR 0006

Làm cùng đợt với 5.1 theo chỉ đạo của người dùng ngày 09/10/2026: bỏ đồng bộ (5.2), dựng một module thật có dữ liệu giả để kiểm thử phân quyền, ẩn/che cột. Module thay màn PO demo.

## Mục tiêu
Năm màn theo mô tả giao diện của BA, chạy trên database `MES_Order`, đi qua đủ năm lớp phân quyền:
1. **Thông tin đơn hàng** – lọc ngày xuất hàng, khách hàng, mã hàng, season, trạng thái; thêm, sửa, xóa tay (thay nút Đồng bộ trong giai đoạn này); xuất file.
2. **Kế hoạch xuất hàng** – danh sách kèm lũy kế cắt, may ra, Endline, hoàn thiện; Tạo mới/Sửa (popup B2) với "Chọn mã hàng" (popup B3: mã hàng còn số lượng, PO chi tiết có ô chọn, PO/Buy date); lưới màu cỡ SL gốc, SL đã tạo KHXH, SL còn lại, SL KHXH.
3. **Cập nhật tỷ lệ cắt** – Danh sách mã hàng → Danh sách PO → Chi tiết màu cỡ; Cập nhật, Xóa PO, Xác nhận, Hủy xác nhận; Thêm PO tay.
4. **Xếp chuyền** – danh sách kế hoạch (SL kế hoạch, đã xếp, còn lại, doanh số, ngày BĐ/KT SX); đúp chuột mở "Chi tiết dàn chuyền" (thông tin chung, bảng nhập liệu dàn chuyền, bảng dàn chuyền Gantt có Chủ nhật, ô chuyền trống); tab Bảng dàn chuyền toàn nhà máy.
5. **Phân bổ màu cỡ** – mỗi dòng một chuyền của một kế hoạch; đúp chuột mở popup phân màu cỡ cho chuyền.

Quy ước chung của BA: lưới kéo kín chân trang, có cuộn dọc và ngang, phân trang; ô vàng bắt buộc nhập, ô xám chỉ đọc.

## Việc đã làm
| # | Task | Kết quả | Trạng thái |
|---|---|---|---|
| 5.3.1 | Thiết kế dữ liệu, ADR 0006, migration `MES_Order/0001`, `0002` | 8 bảng, FK ghép `(ParentId, BranchCode)`; index `CreatedBy` cho chiều "chỉ của mình" | Xong, đã chạy trên máy dev |
| 5.3.2 | Backend: repository, service, controller 5 màn | `backend/src/modules/order/*`; mọi truy vấn qua `BaseRepository`/`ChildRepository`; `@FieldResource` cho từng controller; khóa dòng khi lập kế hoạch, lưu dàn chuyền | Xong |
| 5.3.3 | Dữ liệu giả | `backend/scripts/seed-order.ts`: 34 đơn hàng, 65 PO, 35 kế hoạch, 38 dòng dàn chuyền (A01: 16 đơn, chuyền 3 luôn có việc) | Xong |
| 5.3.4 | Frontend 5 màn | `frontend/src/features/order/*`, lưới dùng chung `DataGrid`, bảng dàn chuyền `LineBoard`, ô ngày dd/mm/yyyy | Xong |
| 5.3.5 | Test | `backend/test/phase5.spec.ts` (luồng module + phân quyền), `frontend/src/test/datagrid.test.tsx`, `frontend/src/test/order.test.tsx` | Xong |
| 5.3.6 | Review | Chung với 5.1 (`docs/review/phase-5-1.md`) | Xong |
| 5.3.7 | Thông tin đơn hàng: "Chi nhánh SX" đổi thành "Chi nhánh FOB"; thêm cột "Nhà máy SX" chọn tay từ danh mục Nhà máy sản xuất (người dùng yêu cầu 10/10/2026) | Migration `MES_Order/0004`, danh mục `PROD_FACTORY` (seed theo nhà máy), cột `productionFactoryCode` đăng ký chính sách cột, khóa ngầm trong `softkeys.json`; test trong `backend/test/catalog.spec.ts`; review `docs/review/phase-5-3.md` | Xong |
| 5.3.8 | Lưới nhập kiểu bảng tính (người dùng yêu cầu 10/10/2026): copy, dán nhiều ô từ Excel thay cho từng ô nhập riêng | `components/SheetGrid.tsx` (react-datasheet-grid, ADR 0008) cho 5 lưới: sửa tỷ lệ cắt, thêm PO, SL KHXH, phân màu cỡ, dàn chuyền; test `frontend/src/test/sheet.test.ts`; review `docs/review/phase-5-3.md` | Xong |
| 5.3.9 | Rà soát UI/UX toàn bộ giao diện (người dùng yêu cầu 10/10/2026) theo bộ quy tắc mới `docs/thiet-ke/quy-tac-ui-ux.md`: mọi màn Đơn hàng, Quản trị, đăng nhập, chọn nhà máy, trang chủ, khung ứng dụng | Thành phần chung mới: `ActionButton`, `lib/confirm.tsx`, `lib/leaveGuard.ts`, `lib/useUrlParams.ts`, `lib/useMobile.ts`, `fmtDateTime`; sửa theme, `global.css`, `DataGrid`, `Pager`, `SheetGrid`, `AppLayout` và cả 14 màn; test `confirm.test.tsx`, `admin-pages.test.tsx`, bổ sung `datagrid.test.tsx`, `order.test.tsx`; review `docs/review/phase-5-3.md` | Xong |
| 5.3.10 | Cột Chi nhánh hiện tên chi nhánh thay mã A01 (người dùng yêu cầu 10/10/2026): Chi nhánh FOB ở Thông tin đơn hàng và cột, ô Chi nhánh ở các màn khác lấy `TenChiNhanh` trong danh mục chi nhánh BRAVO | `GET /me/branch-names` (`CatalogLookupService.branchNames`, đọc `bravo.DM_CHINHANH` qua `SyncService`; chưa có thì tên ở Quản trị › Nhà máy), `components/BranchName.tsx` cho Thông tin đơn hàng, Kế hoạch xuất hàng (lưới, popup, ô chọn SO), Cập nhật tỷ lệ cắt, Xếp chuyền, Phân bổ màu cỡ, Kế hoạch chuẩn bị SX; file xuất ghi tên. Test `backend/test/catalog.spec.ts`, `frontend/src/test/branch-name.test.tsx` | Xong, đã review (`docs/review/phase-5-3.md`) |

## Quy tắc tạm (chờ BA xác nhận)
- Số ngày SX = làm tròn lên (số lượng / năng suất TB); ngày kết thúc = ngày làm việc thứ (số ngày SX + ngày nghỉ) tính từ ngày vào chuyền, bỏ Chủ nhật. Chưa có lịch nghỉ lễ.
- Dòng dàn chuyền mới được đề xuất phân màu cỡ theo tỷ lệ của kế hoạch; màn Phân bổ màu cỡ chỉ nhập số lượng giao (≤ SL KH của từng ô).
- PO đã xác nhận tỷ lệ cắt thì khóa sửa; muốn sửa phải Hủy xác nhận.
- Lũy kế cắt, may ra, Endline, hoàn thiện là số giả từ seed; sẽ lấy từ module Cắt, May, QMS, Hoàn thiện.

## Không làm
Đồng bộ BRAVO/OSM/GSD (5.2); lịch nghỉ lễ, ca làm; tính năng suất từ GSD; in, xuất Excel định dạng (đang xuất CSV mở được bằng Excel).

## Phát sinh
- 10/10/2026 (5.3.7): `BranchCode` của đơn hàng là chi nhánh nhận đơn, hiển thị "Chi nhánh FOB" ở màn Thông tin đơn hàng; nơi may thực tế chọn ở cột "Nhà máy SX". Các màn khác vẫn ghi "Chi nhánh"; nút chọn nhà máy trên đầu trang vẫn ghi "Chi nhánh SX". Script nạp BRAVO để trống Nhà máy SX (chọn tay).
- 10/10/2026: người dùng đổi tên và thứ tự nhóm menu: Quản trị đơn hàng, Quản trị nhà cắt, Quản trị xưởng may, Quản trị chất lượng, Quản trị hoàn thiện, Báo cáo quản trị (Quản trị giữ cuối). Seed đồng bộ tên, thứ tự nhóm menu hệ thống (`seed-demo.md` mục 1).
- 10/10/2026 (5.3.8): lưới nhập dùng thư viện ngoài `react-datasheet-grid` (ADR 0008). Màn chỉ xem và cột bị Che vẫn dùng `DataGrid`. Lưới chưa có hoàn tác (Ctrl+Z).
- 10/10/2026 (5.3.9): đợt UI/UX đổi hành vi người dùng thấy:
  - **Không mất phần đang nhập:** bấm nền mờ không đóng popup. Đóng popup, đổi dòng, rời màn hoặc F5 khi còn thay đổi chưa lưu thì hỏi lại. Nút Back của trình duyệt chưa chặn được.
  - **Nút và trạng thái:** nút bị khóa nói lý do khi rê chuột, chạm hoặc Tab tới. Bộ lọc, trang, sắp xếp nằm trên URL.
  - **Chữ thống nhất:** nút ghi "Thêm …", "Lưu thay đổi". Trạng thái ghi "Đang dùng/Ngừng dùng" (người dùng: "Hoạt động/Đã khóa/Khóa tạm"). "Xóa vai trò" đổi thành "Ngừng dùng vai trò".
  - **Bỏ giá trị điền sẵn:** PO mới không còn sẵn "Đen / S M L XL"; dòng chuyền mới không còn năng suất 400 và ngày hôm nay.
  - **Điện thoại:** sửa lỗi mất phần đầu trang (thanh trên, tiêu đề, bộ lọc) và lỗi popup dàn chuyền tràn ngang.
  - **Giữ nguyên chờ người dùng/BA chốt:** thuật ngữ BA (SL KHXH, NSBQ, KT, BĐ…), nút "Chi nhánh SX" trên thanh trên, cột Chi nhánh ở các màn.
- 10/10/2026 (5.3.10): cột, ô Chi nhánh ở các màn nghiệp vụ hiện `TenChiNhanh` (danh mục chi nhánh BRAVO) thay mã. Nút "Chi nhánh SX" trên thanh trên, màn chọn nhà máy và Quản trị › Nhà máy vẫn dùng tên ở Quản trị › Nhà máy, có thể khác `TenChiNhanh` (dữ liệu local đang khác ở A03, A04, A05). Cột Chi nhánh không sắp xếp được, như trước. Khi xem A00, ô lọc chuyền nhóm theo "tên chi nhánh (mã)". File xuất Cập nhật tỷ lệ cắt chưa có cột Chi nhánh (có từ trước), chờ người dùng xác nhận có cần không.

## Tiêu chí review
- [x] Mọi endpoint khai báo quyền đúng hành động; dữ liệu qua `BaseRepository`/`ChildRepository`, không SQL thô trong service
- [x] Cột nhạy cảm (đơn giá, thành tiền, giá CM, doanh số) đi qua chính sách cột ở xem, sửa, xuất file, popup đọc chéo tài nguyên
- [x] Phạm vi chuyền áp cả ở Phân bổ màu cỡ và ở dòng dàn chuyền của màn Xếp chuyền
- [x] Không lập kế hoạch vượt số lượng, kể cả hai người lập cùng lúc
- [x] Giao diện đúng quy ước BA: lưới kín trang, ô vàng bắt buộc, ô xám chỉ đọc
