# Phase 5.14 – Đồng bộ tiến độ cắt

Trạng thái: **Ready for review** (15/10/2026). Người dùng yêu cầu và trả lời Q1–Q8 cùng ngày; Q7 cần nói rõ lại (cuối file). Làm trên `main` từ commit `40e4177`. Xong 5.14.0–5.14.6 (bảng số cắt đổi tên thành `CuttingPlanDaily` theo review; `sim:board` giữ kế hoạch có số cắt kể cả `--all`; không làm số cắt mẫu trong seed); tiến độ chi tiết ở `docs/update_docs/02-trang-thai.md`.

## Mục tiêu

Người dùng yêu cầu 14/10/2026 dựng màn **Đồng bộ tiến độ cắt** (`cutting.progress`, `/cutting/progress`, hiện là trang giữ chỗ), theo ảnh `docs/screens/dong-bo-tien-do-cat.png`:

1. Lấy khung của màn Phân bổ màu cỡ (phase 5.13: một dòng mỗi kế hoạch, bấm đúp dòng mở popup có lưới nhập).
2. Đầu vào là Kế hoạch xuất hàng (lưới chi tiết màu cỡ). Khác Phân bổ màu cỡ: **chỉ cần có kế hoạch xuất hàng** là có dòng ở màn này, không đòi đã xếp chuyền.
3. Bấm đúp một dòng mở popup:
   - Thông tin chung: Chi nhánh, Khách hàng, Mã hàng, PO/Buy date, Số lượng KH lấy từ kế hoạch (chỉ đọc); Ngày nhập liệu nhập vào.
   - Thông tin chi tiết: Màu, Cỡ, Kế hoạch lấy từ kế hoạch; Trong ngày nhập vào, lưu theo Ngày nhập liệu; Lũy kế = tổng số tổ cắt đã cắt ở mọi ngày; **+/- = Lũy kế − Kế hoạch** (theo ảnh: âm là còn thiếu, dương là cắt dư; Q1).
4. Đổi Ngày nhập liệu thì cột Trong ngày hiện số của ngày đó; Lũy kế và +/- luôn tính trên mọi ngày đã nhập, không theo ngày đang xem.
5. Kế hoạch xuất hàng đã có số cắt thì **không xóa được**; muốn xóa phải xóa số cắt ở màn này trước (Q5).

Điều kiểm được:

- Kế hoạch xuất hàng vừa lập (chưa xếp chuyền) có ngay một dòng ở màn này khi mở màn.
- Popup hiện mọi màu cỡ của kế hoạch với Kế hoạch = SL KHXH của màu cỡ; dòng Tổng ở đầu lưới (Kế hoạch, Lũy kế, +/-).
- Nhập Trong ngày ngày 14/10, lưu, đổi sang 13/10: cột Trong ngày hiện số của 13/10 (trống nếu chưa nhập), Lũy kế, +/- không đổi. Quay lại 14/10 thấy lại số đã lưu.
- Cột LK cắt của màn chính bằng tổng Lũy kế của popup.
- Xóa kế hoạch xuất hàng đã có số cắt: 409, thông báo phải xóa số cắt trước. Xóa số cắt rồi thì xóa được.
- Máy chủ chặn: ghi ở `A00`; ghi kế hoạch của ĐVCS khác (404); ngày nhập liệu sau hôm nay; số âm, số lẻ; màu cỡ không có trong kế hoạch (422). Có test.

## Thiết kế

### Module, database

Module mới `backend/src/modules/cutting` (`controller → service → repository`), database mới **`MES_Cutting`** (Q2), theo tiền lệ module May (quyết định 9.1, 9.2): module Cắt đọc kế hoạch qua service công khai của Đơn hàng rồi chép sang database của mình.

- Biến môi trường `DB_CUTTING_NAME` (mặc định `MES_Cutting`); `migrate.ts`, `check-softkeys.ts`, bộ database test thêm database này.
- Đơn hàng thêm service công khai `ShipmentPlanFeed` (file mới, repository riêng): `plansOf(scope)` trả đầu kế hoạch và màu cỡ (SL KHXH > 0), `versionOf(scope)` trả dấu phiên bản (số dòng + `BINARY_CHECKSUM` của `ShipmentPlan`, `ShipmentPlanColorSize`), lọc theo ĐVCS của phiên như `ScheduleFeed`.
- Mỗi lần mở màn hoặc xuất file, module Cắt chép lại khi dấu phiên bản đổi (một lần chép tại một thời điểm, `sp_getapplock`), như quyết định 9.2.

### Chặn xóa kế hoạch đã có số cắt (Q5)

Đơn hàng vẫn không import module Cắt. Đơn hàng mở một điểm đăng ký công khai `ShipmentPlanDeleteGuard` (cùng kiểu `SyncService.onSucceeded`): module khác đăng ký hàm kiểm "kế hoạch này còn dữ liệu phụ thuộc không". `ShipmentService.remove` gọi các hàm đã đăng ký trước khi xóa; có hàm trả lý do thì 409 với lý do đó.

- Module Cắt đăng ký lúc khởi động: kế hoạch có `CuttingPlanDaily` với `Qty > 0` thì trả "Kế hoạch đã có số cắt ở Đồng bộ tiến độ cắt. Xóa số cắt của kế hoạch trước khi xóa kế hoạch."
- Hai database không có transaction chung: người khác có thể lưu số cắt đúng lúc kế hoạch đang bị xóa. Lưu số cắt kiểm lại kế hoạch còn tồn tại qua `ShipmentPlanFeed` (404 nếu đã xóa). Nếu vẫn lọt, hoặc kế hoạch mất qua đường khác, màn hiện kế hoạch với cảnh báo **"Kế hoạch đã xóa"**: giữ số đã nhập, chỉ đọc, chỉ còn nút Xóa số cắt.
- Màu cỡ bị bỏ khỏi kế hoạch khi đã có số cắt: giữ số, hiện ở cuối lưới với Kế hoạch 0, chỉ đọc, có cảnh báo.
- Script: `reset:demo`, `load:bravo` xóa toàn bộ dữ liệu `MES_Cutting` trước khi nạp; `sim:board` giữ kế hoạch mô phỏng đã có số cắt, kể cả `--all` (đổi khi làm 5.14.5: đúng luật phải Xóa số cắt trước).

### Bảng trong `MES_Cutting`

| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `CuttingPlan` | `Id`, `ShipmentPlanId`, `SourceCreatedAt`, `PlanNo`, `CustomerName`, `StyleCode`, `ProductName`, `PoBuyDate`, `ShipDate`, `PlanQty`, `SourceDeletedAt`, `BranchCode` + bộ kiểm toán | Bản chép đầu kế hoạch. Khóa ngầm `ShipmentPlanId` → `MES_Order.ShipmentPlan(Id)` (khai `softkeys.json`). Nhận diện dòng nguồn bằng `Id` + ĐVCS + `SourceCreatedAt` như `SewingPrep`. `SourceDeletedAt` có giá trị: kế hoạch đã xóa mà còn số cắt |
| `CuttingPlanColorSize` | `Id`, `CuttingPlanId`, `ColorName`, `SizeName`, `PlanQty`, `SortOrder`, `BranchCode` | Bản chép màu cỡ của kế hoạch; chép lại thay toàn bộ theo kế hoạch |
| `CuttingPlanDaily` | `Id`, `CuttingPlanId`, `ColorName`, `SizeName`, `EntryDate DATE`, `Qty INT > 0`, `BranchCode` + bộ kiểm toán | Số cắt trong ngày. `UNIQUE (CuttingPlanId, ColorName, SizeName, EntryDate)`; chỉ mục `(BranchCode, CuttingPlanId)`. Gắn theo tên màu cỡ, không theo `CuttingPlanColorSize.Id`, để chép lại không mất số đã nhập |

- FK ghép `(CuttingPlanId, BranchCode)` như các bảng con khác; `BranchCode` cấm sửa sau khi tạo.
- Không lưu Lũy kế: tính bằng `SUM` lúc đọc (lọc, sắp xếp theo LK cắt chạy được trong SQL vì cùng database).

### Danh sách (`GET /cutting/progress`, `values`, `export`)

Một dòng mỗi kế hoạch xuất hàng trong phạm vi ĐVCS của phiên (`A00`: mọi ĐVCS, chỉ đọc). Bấm đúp dòng mở popup (Q8).

| Cột | Nguồn |
|---|---|
| Số kế hoạch, Khách hàng, Mã hàng, Tên sản phẩm, PO/Buy date, ĐVCS, Ngày xuất hàng, SL kế hoạch | Bản chép kế hoạch |
| LK cắt | Tổng `CuttingPlanDaily.Qty` của kế hoạch |
| +/- | LK cắt − SL kế hoạch |
| Ngày cắt gần nhất | `MAX(EntryDate)` |
| Trạng thái | Tính lúc đọc: Chưa cắt (LK 0), Đang cắt (0 < LK < KH), Đã cắt đủ (LK ≥ KH), Kế hoạch đã xóa |

Phân trang, lọc theo cột, sắp xếp, ô tìm nhanh PO/Buy date, xuất CSV dùng chung `column-filter`, `ExportService` như các màn đơn hàng.

### Popup và API

- `GET /cutting/progress/:planId?date=YYYY-MM-DD`: đầu kế hoạch (Chi nhánh = tên ĐVCS của kế hoạch, Khách hàng, Mã hàng, PO/Buy date, SL KH); mỗi màu cỡ: Kế hoạch, Trong ngày (số của `date`), Lũy kế (mọi ngày), +/-. Không có `date` thì lấy hôm nay.
- `PUT /cutting/progress/:planId` nhận `{ date, items: [{ colorName, sizeName, qty | null }] }`, chỉ các ô đã sửa: `qty` > 0 thì ghi đè số của ngày đó, `0`/`null` thì xóa số của ngày đó. Hai người sửa hai ô khác nhau không ghi đè nhau. Ngày sau hôm nay (giờ Việt Nam) thì 422; ngày lùi không giới hạn (Q6); cắt vượt kế hoạch được phép (ảnh có dòng vượt 1). Ghi `SysAuditLog` (kế hoạch, ngày, ô cũ → mới).
- `DELETE /cutting/progress/:planId/entries`: Xóa số cắt, xóa mọi ngày của kế hoạch, có hộp xác nhận ghi rõ số ngày và tổng số sẽ xóa; ghi `SysAuditLog`. Kế hoạch đã xóa ở Đơn hàng thì xóa luôn bản chép.
- Giao diện theo ảnh: hàng trên năm ô chỉ đọc (Chi nhánh, Khách hàng, Mã hàng, PO/Buy Date, Số lượng KH; ảnh vẽ Chi nhánh, Khách hàng dạng ô chọn nhưng popup mở từ một kế hoạch nên để chỉ đọc), dưới là Ngày nhập liệu (`DateInput`, mặc định hôm nay, không chọn được ngày tương lai). Lưới `SheetGrid`: STT, Màu, Cỡ, Kế hoạch, Trong ngày (ô nhập số), Lũy kế, +/-; dòng Tổng nền xanh nhạt ở đầu; nút Lưu lại, Hủy, và Xóa số cắt (khi có quyền).
- Lũy kế trên popup cập nhật ngay khi gõ: Lũy kế đã lưu − số đã lưu của ngày đang xem + số đang gõ.
- Đổi Ngày nhập liệu khi còn ô chưa lưu: hỏi Lưu / Bỏ thay đổi / Ở lại.
- Không có quyền sửa, đang ở `A00`, hoặc kế hoạch đã xóa: popup chỉ đọc, vẫn đổi ngày để xem.

### Phân quyền (Q4)

- `cutting.progress`: `ScopeType = BRANCH`, bảng nguồn `CuttingPlan`, không chiều Chuyền, không chiều Người tạo (dòng do hệ thống chép). Mọi truy vấn qua `BaseRepository`/`ChildRepository`.
- Hành động: `view`; `update` (nhập Trong ngày); `delete` (Xóa số cắt); `export`. Không `create` (dòng tự có).
- Ma trận mẫu: Kế hoạch **Xem, Sửa, Xuất** (không Xóa); Toàn quyền có hết (tài khoản `admin` dùng để thử). Vai trò khác giữ như hiện tại (Quản trị, Trưởng chuyền: Xem; Giám đốc: Xem, Xuất). Ai được Xóa số cắt người dùng tự gán ở màn Quản trị.
- Máy đã cài: migration `MES_Core` gán thêm Sửa, Xuất cho Kế hoạch (như `0010`), không đổi quyền đã chỉnh tay.
- Chính sách cột: SL kế hoạch, Trong ngày, Lũy kế, +/- (áp cả xuất file).

## Cách làm (Q3)

Không tạo worktree. Chờ người dùng commit 5.13 và xong phiên làm việc đang sửa `main`, rồi làm thẳng trên `main` trong `MES`. Đầu phiên kiểm `git status` sạch (không còn thay đổi của phiên khác) trước khi sửa. Test backend trên bộ database riêng `MES_*_T514` (gồm `MES_Cutting_T514`).

## Task

| Task | Nội dung | Tiêu chí xong |
|---|---|---|
| 5.14.0 | Kiểm `main` sạch; tạo bộ database test `T514`; ghi quyết định mới vào `13-quyet-dinh.md` (mục 11 Module Cắt: database, chép, chặn xóa kế hoạch qua điểm đăng ký) | Lint, test không cần database qua |
| 5.14.1 | `MES_Cutting`: biến `DB_CUTTING_NAME`, `migrate.ts`, `check-softkeys.ts`, migration `MES_Cutting/0001_cutting_progress.sql`, `softkeys.json`; `SysResource` của `cutting.progress` (bảng nguồn, phạm vi), ma trận mẫu, migration `MES_Core` gán quyền cho máy đã cài | `npm run migrate` tạo được database trên bộ test; `check:softkeys` qua |
| 5.14.2 | Đơn hàng: `ShipmentPlanFeed` (`plansOf`, `versionOf`), `ShipmentPlanDeleteGuard` gọi trong `ShipmentService.remove` | Test: lọc ĐVCS, `A00`, dấu phiên bản đổi khi sửa SL màu cỡ; xóa kế hoạch bị chặn khi hàm đăng ký trả lý do |
| 5.14.3 | Backend Cắt: chép bản sao, danh sách, `values`, `export`, chi tiết theo ngày, lưu, Xóa số cắt, đăng ký chặn xóa, nhật ký | Test: phân quyền, `BranchCode`, `A00` chỉ đọc, ĐVCS khác 404, ngày tương lai, số âm, chính sách cột (cả xuất file), Lũy kế không đổi khi xem ngày khác, xóa kế hoạch có số cắt 409 rồi xóa số cắt thì xóa được, kế hoạch đã xóa, màu cỡ bị bỏ |
| 5.14.4 | Frontend: `features/cutting/CuttingProgressPage.tsx`, `cuttingProgressRules.ts`, `api.ts`; thay trang giữ chỗ; popup theo ảnh (skill `frontend-design`) | Test frontend cho +/-, Lũy kế khi gõ, đổi ngày còn ô chưa lưu, chỉ đọc; xem trên Chrome 1366×768 và 390px, so cạnh ảnh mẫu |
| 5.14.5 | Script: `reset:demo`, `load:bravo` xóa dữ liệu cắt; `sim:board` giữ kế hoạch có số cắt; không làm số cắt mẫu trong seed (bản chép chỉ sinh khi mở màn) | Chạy các script trên bộ test không lỗi |
| 5.14.6 | Tài liệu: file mới cho module Cắt trong `docs/update_docs/` (bảng sở hữu ở `14-quy-trinh-lam-viec.md`), `01`, `03`, `04`, `06` (chặn xóa kế hoạch), `11` (biến mới, việc máy chủ), `12`, `13`, `02`; chạy `code-reviewer`, báo cáo `docs/review/phase-5-14.md` | Không còn CRITICAL/HIGH; lint, test, build qua |

Ước lượng: khoảng 5–7 ngày làm việc.

## Việc trên máy chủ (khi deploy)

- Tạo database `MES_Cutting`: tài khoản SQL của ứng dụng cần quyền `CREATE DATABASE`, không có thì quản trị SQL Server tạo trước.
- Thêm `DB_CUTTING_NAME` vào `.env` nếu tên khác mặc định; `npm run migrate` (`MES_Cutting/0001`, migration `MES_Core` gán quyền); deploy.

## Ngoài phạm vi

- Cắt theo bàn cắt, lớp vải, chuyền; kết nối máy cắt; Xác nhận cấp BTP, Quản lý in thêu.
- Cột LK cắt của Kế hoạch xuất hàng: chờ trả lời Q7.

## Câu hỏi

| # | Câu hỏi | Trả lời |
|---|---|---|
| Q1 | +/- theo yêu cầu (Kế hoạch − Lũy kế) hay theo ảnh (Lũy kế − Kế hoạch) | Theo ảnh (14/10) |
| Q2 | Database của module Cắt | `MES_Cutting` riêng (14/10) |
| Q3 | Commit 5.13 rồi tách worktree? | Không tách worktree; chờ commit 5.13 và xong phiên kia rồi mới bắt đầu (14/10) |
| Q4 | Vai trò nào được nhập số cắt | Kế hoạch: Xem, Sửa, Xuất; `admin` (Toàn quyền) có hết để thử; người dùng tự gán vai trò sau (14/10) |
| Q5 | Kế hoạch bị xóa khi đã có số cắt | Giữ số, cảnh báo "Kế hoạch đã xóa"; không cho xóa kế hoạch đã có số cắt, phải xóa số cắt trước (14/10) |
| Q6 | Ngày nhập liệu | Cho ngày lùi, không cho ngày tương lai (14/10) |
| Q7 | Màn Kế hoạch xuất hàng (lưới trên) có cột **LK cắt** (`ShipmentPlan.CutQty`), hiện chỉ là số mẫu. Có lấy Lũy kế của màn này hiện vào cột đó không? | Chờ người dùng. Lũy kế trong popup đã chốt: tổng số tổ cắt đã cắt ở mọi ngày |
| Q8 | Mở popup bấm một lần hay bấm đúp | Bấm đúp (14/10) |
