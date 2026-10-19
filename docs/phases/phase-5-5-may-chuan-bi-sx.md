# Phase 5.5 – Module May: Kế hoạch chuẩn bị SX

**Trạng thái:** Ready for review · **Bắt đầu:** 10/10/2026 · **Thiết kế:** `docs/thiet-ke/db-sewing.md`, ADR 0009

## Mục tiêu
Màn **Kế hoạch chuẩn bị SX** (ban đầu ở Quản trị xưởng may, người dùng chuyển sang **Quản trị đơn hàng** cùng ngày) theo dõi các bước chuẩn bị sản xuất trước ngày vào chuyền của từng mã hàng. Nguồn yêu cầu:
- Cột theo file mẫu `docs/nguon/Copy of TNG TT CHUAN BI SX.xls`.
- Các bước theo ảnh danh mục `docs/nguon/danh-muc-cau-hinh-chuan-bi-san-xuat.png`.

## Chốt với người dùng (10/10/2026)
- **Cột cố định A–H:**
  - STT, Chi nhánh, Tổ SX, Mã hàng, Loại mã, Số lượng chốt UD, HS Ưu đãi VC, Ngày vào chuyền;
  - cột **Trạng thái** ban đầu ở cuối; từ task 5.5.7 (ảnh mẫu) đứng ngay sau Ngày vào chuyền.
- **Cột theo danh mục:** các cột giữa lấy từ danh mục **Cấu hình chuẩn bị SX**. Mỗi bước đang dùng là một cặp cột KH (kế hoạch) và TH (thực hiện), theo thứ tự trong danh mục.
- **Mỗi dòng là một dòng dàn chuyền** (mã hàng + chuyền + ngày vào chuyền) lấy từ Xếp chuyền.
- **Số ngày KH nhập tay ở hai nơi:**
  - danh mục giữ số ngày mặc định;
  - mỗi dòng có popup như ảnh mẫu để chỉnh riêng cho dòng đó.
- **Database mới `MES_Sewing`.** Tài khoản ứng dụng không tạo được database: người dùng hoặc quản trị CSDL tạo `MES_Sewing`, cấp `db_owner`.
- **Loại mã, Số lượng chốt UD, HS Ưu đãi VC:** nhập tay tạm, chờ BA chỉ nguồn.

## Quy tắc tạm (chờ BA xác nhận)
- **KH của một bước** = Ngày vào chuyền − Số ngày KH, tính theo ngày lịch (chưa trừ Chủ nhật, ngày lễ).
- **Số ngày KH của dòng:** lấy số chỉnh riêng nếu có, không thì lấy số mặc định trong danh mục. Đổi số mặc định thì mọi dòng chưa chỉnh riêng đổi theo. Đổi ngày vào chuyền ở Xếp chuyền thì KH cũng đổi theo.
- **TH** là ngày làm xong, nhập tay. Các module Kỹ thuật, Lab, Kế hoạch mẫu chưa có nên chưa tự lấy.
- **Trạng thái một bước:**
  - xong đúng hạn: TH ≤ KH;
  - xong trễ: TH > KH;
  - trễ: chưa có TH và đã qua KH;
  - chưa đến hạn.
- **Trạng thái dòng** (thay quy tắc cũ Hoàn thành / Trễ hạn / Đang chuẩn bị, người dùng chốt 10/10/2026, task 5.5.7):
  - Chưa đến ngày V/C: ngày vào chuyền chưa tới so với hôm nay, nhập đủ TH hay chưa cũng vậy;
  - Chưa đủ đk V/C: đã tới ngày vào chuyền mà còn bước chưa nhập TH;
  - Đủ điều kiện V/C: đã nhập đủ TH mọi bước.
- **Ô TH lớn hơn KH** của cùng bước thì tô đỏ.

## Task

| # | Task | Tiêu chí xong | Trạng thái |
|---|---|---|---|
| 5.5.1 | Thiết kế dữ liệu, ADR 0009, migration `MES_Sewing/0001` | Bảng bước chuẩn bị (danh mục), bảng dòng chuẩn bị (chép từ dàn chuyền), bảng ngày theo bước; khóa ngầm tới `MES_Order` khai báo trong `softkeys.json` | Xong: `MES_Sewing/0001`, `0002` (nhận diện nguồn, review #1), `MES_Core/0004` (chuyển nhóm menu), đã chạy trên localhost |
| 5.5.2 | Backend module `sewing` | Kết nối `MES_Sewing`; đọc dàn chuyền qua service công khai của module Đơn hàng; chép, cập nhật khi mở màn; API danh sách, chi tiết, cập nhật, xuất file; danh mục bước (thêm, sửa, ngừng dùng) | Xong (`modules/sewing`, `ScheduleFeed` của module Đơn hàng) |
| 5.5.3 | Quyền, menu, dữ liệu mẫu | Tài nguyên `order.prep` (lọc nhà máy, chuyền), menu dưới Quản trị đơn hàng; 16 bước mẫu theo ảnh; chính sách cột (Trưởng chuyền: che tên khách) | Xong (seed đã chạy) |
| 5.5.4 | Màn hình | Lưới tiêu đề 2 tầng (bước › KH/TH), tô màu trạng thái; popup từng dòng như ảnh mẫu; danh mục Cấu hình chuẩn bị SX trong Danh mục hệ thống | Xong (`/order/prep`, `PrepStepsPane`) |
| 5.5.5 | Test | Lọc nhà máy, chuyền, A00 chỉ đọc; số ngày chỉnh riêng; tính KH, trạng thái; danh mục; giao diện | Xong: `backend/test/sewing.spec.ts` (12 bài), `frontend/src/test/sewing.test.tsx` (3 bài) |
| 5.5.6 | Review `code-reviewer` | `docs/review/phase-5-5.md`, không còn CRITICAL/HIGH | Lượt 1 BLOCK (3 HIGH) → sửa hết; lượt 2 APPROVE WITH SUGGESTIONS (1 MEDIUM, 13 LOW) → sửa 11, ghi nhận 2 |
| 5.5.7 | Bố cục theo ảnh mẫu, nhập TH ngay trên bảng (người dùng yêu cầu 10/10/2026) | Dải lọc, thanh tuần T1…T53, cột Trạng thái sau Ngày vào chuyền, thứ tự Chi nhánh → Tổ SX → Mã hàng; nhập TH trên lưới, bấm Lưu thay đổi mới ghi; trạng thái mới; TH > KH tô đỏ | Xong, chờ duyệt: `PUT /sewing/prep` (lưu nhiều dòng, phát hiện sửa chen), lọc tuần trong SQL, `SheetGrid` có tiêu đề 2 tầng và lọc theo cột trên tiêu đề; review lượt 1 BLOCK, lượt 2 và 3 APPROVE WITH SUGGESTIONS, đã sửa (`docs/review/phase-5-5.md`); backend `sewing.spec.ts` 20 bài, frontend `sewing.test.tsx` 9 bài, `sheet-filter.test.tsx` 3 bài, `branch-switcher.test.tsx` 6 bài |

| 5.5.8 | Số liệu trên đầu màn (sếp yêu cầu, người dùng chốt 10/10/2026): Tổng đơn hàng, Đủ điều kiện V/C, Nguy cơ trễ hạn, Trễ hạn | 4 thẻ màu ngay dưới thanh tuần (kiểu thẻ theo ảnh mẫu người dùng gửi), theo đúng bộ lọc của lưới trừ Trạng thái, đếm theo mã hàng; nút ⓘ nói cách đếm; cột bị Ẩn/Che thì "—" | Xong, chờ duyệt: `GET /sewing/prep/summary` (đếm trong SQL qua `BaseRepository.filteredQuery`, mới), `PrepSummary.tsx`; backend `sewing.spec.ts` 26 bài (nhóm 5.5.8: 6 bài), frontend `sewing.test.tsx` 11 bài; review 2 lượt `docs/review/phase-5-5.md` mục 5.5.8, không còn CRITICAL/HIGH/MEDIUM |

## Không làm
- Tự lấy ngày TH từ module Kỹ thuật, Lab, Kế hoạch mẫu (chưa có).
- Phân quyền nhập TH theo từng bước, từng bộ phận ("Người thực hiện" mới để hiển thị).
- Lịch ngày nghỉ, ngày lễ khi tính KH.
- Danh mục bước riêng cho từng nhà máy (dùng chung toàn công ty).

## Phát sinh
- 10/10/2026 (task 5.5.8), người dùng chốt định nghĩa số liệu của sếp:
  - **Đặt ở màn Kế hoạch chuẩn bị SX**, gọn để đọc số (không biểu đồ, bấm ô không lọc lưới). Không đặt ở Kế hoạch xuất hàng: các số dựa trên bước, KH/TH chỉ có ở màn này, và module Đơn hàng không được đọc module May (ADR 0009).
  - **Đếm theo mã hàng**: một mã hàng may trên 2 chuyền tính là 1. Cả 4 ô cùng đơn vị: mỗi ô là số mã hàng có ít nhất một dòng thỏa điều kiện, nên ô con không lớn hơn Tổng; một mã hàng có thể thuộc nhiều ô.
  - **Trễ hạn** gồm cả bước quá ngày KH mà chưa làm, không chỉ bước có TH > KH (đọc đúng chữ chỉ ra 2 mã ở A01, trong khi 54 mã có bước quá hạn chưa làm).
  - **Nguy cơ trễ hạn**: bước chưa có TH mà KH là hôm nay hoặc trong 2 ngày tới.
  - Các số theo đúng bộ lọc của lưới (khoảng ngày, tuần, chi nhánh, tổ, mã hàng, loại mã, lọc theo cột), trừ ô Trạng thái; không theo trang. Tải song song với lưới, tải lại sau khi lưu ngày TH hoặc sửa popup.
  - Cột Mã hàng bị Ẩn/Che (hiện chưa vai trò nào): cả 4 ô "–", theo review 5.5.8 M1 (đếm mã hàng khác nhau trên vài dòng làm lộ các dòng có cùng mã hay không). Các bước hoặc Trạng thái bị Ẩn/Che: chỉ còn Tổng. Chờ người dùng xác nhận cách này.
  - **Giao diện** (người dùng chốt cùng ngày, theo ảnh mẫu): 4 thẻ nền dải màu chữ trắng, mỗi thẻ có ô biểu tượng, nhãn chữ hoa, số đậm và một dòng giải thích cùng hàng với số; tím Tổng, xanh Đủ điều kiện, cam Nguy cơ, đỏ Trễ hạn. Thẻ thấp 58px (người dùng yêu cầu giảm độ cao để lưới còn chỗ). Màu đậm hơn mẫu nửa bậc để chữ nhỏ đạt tương phản 4,5:1 (`quy-tac-ui-ux.md` C.1). Điện thoại: 2×2, bỏ ô biểu tượng và dòng giải thích.
- 10/10/2026 (task 5.5.7), người dùng chốt theo ảnh mẫu "Thông tin chuẩn bị sản xuất":
  - **Thanh tuần:** chọn tuần là xem việc đến hạn tới hết tuần (cả việc tồn) cộng mã vào chuyền trong tuần; mặc định tuần này, khoảng ngày mặc định từ đầu năm đến hết 3 tuần sau. Chọn tuần ngoài khoảng ngày thì khoảng ngày nới ra tới tuần đó.
  - **Thứ tự dòng** theo Chi nhánh → Tổ SX → Mã hàng như ảnh, khác quy ước chung "mới tạo lên trước" của lưới xem (ADR 0011); người chỉ xem vẫn bấm tiêu đề cột để sắp xếp.
  - **Người được sửa các bước** dùng lưới nhập (`SheetGrid`, ADR 0008). Người chỉ xem, hoặc cột các bước bị Che, vẫn dùng lưới xem (`DataGrid`) như cũ.
  - Người dùng yêu cầu thêm (10/10/2026): lưới nhập cũng có lọc ngay trên tiêu đề cột như lưới xem (Chi nhánh, Tổ SX, Mã hàng, Loại mã, Số lượng chốt UD, HS Ưu đãi VC, Ngày vào chuyền, Ngày tạo). `SheetGrid` nhận `headFilter` cho cột; ADR 0011 đã sửa phần ngoại lệ.
  - Bỏ ô Khách hàng khỏi dải lọc (ảnh mẫu không có, lưới không có cột Khách hàng); giữ ô Trạng thái để tìm nhanh dòng Chưa đủ đk V/C.
  - Bỏ tô đỏ ô KH quá hạn (cả popup): màu đỏ nay chỉ dành cho Chưa đủ đk V/C và ô TH làm trễ.
- 10/10/2026, người dùng yêu cầu thêm (ngoài task 5.5.7, thuộc khung giao diện): bấm nút nhà máy trên thanh trên cùng thì hiện danh sách chọn ngay tại chỗ (`BranchSwitcher`), không sang trang chọn nhà máy. Chọn xong ở lại màn đang mở, màn dựng lại từ đầu theo nhà máy mới; nhà máy mới không có màn đó thì về Trang chủ. Mục "Đổi nhà máy" trong menu tài khoản mở cùng danh sách. Quy tắc ghi ở `quy-tac-ui-ux.md` (dòng Đổi nhà máy).
- 10/10/2026: người dùng chuyển màn sang nhóm Quản trị đơn hàng. Mã tài nguyên đổi thành `order.prep`, đường dẫn `/order/prep`; code, database, API vẫn ở module May (ADR 0009 mục 6).
- `reset:demo`, `load:bravo` nay xóa cả Kế hoạch chuẩn bị SX (ngày đã nhập), vì Id dòng dàn chuyền bị đánh số lại.
- Chờ BA: KH tính theo ngày lịch hay ngày làm việc; quy tắc trạng thái; nguồn của Loại mã, Số lượng chốt UD, HS Ưu đãi VC; ai được nhập TH của từng bước.
