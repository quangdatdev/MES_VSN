# Phase 5.15 – Xác nhận cấp BTP

Trạng thái: **Ready for review** (15/10/2026; review `docs/review/phase-5-15.md` hai lượt, không còn CRITICAL, HIGH, MEDIUM mở). Người dùng yêu cầu 15/10/2026, ảnh mẫu `docs/screens/cap-ban-thanh-pham.png` (tiêu đề "Lệnh cấp BTP"); cùng ngày chốt Q1–Q13 **theo đề xuất** (cột Đề xuất ở bảng câu hỏi cuối file). Làm thẳng trên `main` trong `MES`; test trên bộ database `MES_*_T514` (dùng lại bộ của 5.14, không tạo bộ mới). Tiến độ ở `docs/update_docs/02-trang-thai.md`; mô tả theo code ở `docs/update_docs/15-cat.md`.

## Mục tiêu

Dựng màn **Xác nhận cấp BTP** (`cutting.supply`, `/cutting/supply`, hiện là trang giữ chỗ, tài nguyên đã có trong seed). Tổ cắt ghi số bán thành phẩm cấp cho từng chuyền may theo ngày, gom thành **lệnh cấp** theo mã hàng, rồi người cấp bấm Xác nhận cấp.

Đầu vào: Kế hoạch xuất hàng, Xếp chuyền, Phân bổ màu cỡ (phase 5.13, `ShipmentPlanLineColorSize.AssignedQty`), Lũy kế cắt (phase 5.14, `CuttingPlanDaily`).

Yêu cầu của người dùng (giữ nguyên ý):

1. Bấm **Thêm mới**: Ngày cấp mặc định hôm nay, sửa được; Người lập là tài khoản đăng nhập; Ghi chú.
2. Mỗi dòng chi tiết: Chuyền sản xuất (chọn trên cây sơ đồ tổ chức) → Mã hàng (theo chuyền, lấy từ Phân bổ màu cỡ) → Màu (theo mã hàng) → Cỡ (theo mã hàng + màu).
3. Số liệu mỗi dòng:
   - **SL kế hoạch**: SL giao ở Phân bổ màu cỡ theo chuyền, mã hàng, màu, cỡ.
   - **SL đồng bộ**: Lũy kế ở Đồng bộ tiến độ cắt theo mã hàng, màu, cỡ.
   - **SL đã cấp**: tổng đã cấp của mã hàng, màu, cỡ đó trong các ngày (xem Q3).
   - **SL cấp trong ngày**: nhập, lưu vào đúng Ngày cấp đang chọn.
   - **SL còn lại** = SL kế hoạch − SL đã cấp − SL cấp trong ngày.
4. Đổi Ngày cấp thì xem lại số đã cấp theo ngày đó; các cột khác không đổi.
5. Lưu thì dữ liệu lên lưới trên: Ngày lập phiếu, Số lệnh cấp (tự sinh), Chi nhánh, Mã hàng, Người lập, Người cấp (người bấm Xác nhận cấp), Trạng thái (Chưa cấp, Cấp 1 phần, Cấp toàn phần).
6. Một chuyền có nhiều mã hàng, một mã hàng thuộc nhiều chuyền. Lưới trên gom theo mã hàng: các chuyền chung mã hàng, cùng ngày, thành **một lệnh cấp**. Chọn một lệnh thì khung dưới hiện chi tiết: chuyền, màu, cỡ, SL kế hoạch, SL đồng bộ, SL đã cấp, SL cấp trong ngày, SL còn lại.
7. Nút theo ảnh: Thêm mới, Sửa, Xóa, Xác nhận cấp, Hủy duyệt.

## Điểm khác giữa yêu cầu và code, ảnh mẫu (phải chốt trước khi làm)

| # | Yêu cầu | Code, ảnh hiện tại | Đề xuất |
|---|---|---|---|
| D1 | Mã hàng lưu `VARCHAR(16)` | `StyleCode` ở mọi bảng là `NVARCHAR(120)` (`MES_Order/0003`): mã từ BRAVO dài hơn 100 ký tự, có tiếng Việt. Mã trong ảnh `30.007532-VSS012606.0247` đã 24 ký tự | Lưu `NVARCHAR(120)` như các bảng khác (Q1) |
| D2 | Màu lưu mã, hiện tên | Không bảng nào có mã màu, mã cỡ: kế hoạch, phân bổ, số cắt đều lưu **tên** (`ColorName NVARCHAR(100)`, `SizeName VARCHAR(20)`) và khớp theo tên | Lưu tên màu, tên cỡ như các bảng khác (Q2) |
| D3 | Còn lại = KH − đã cấp − trong ngày | Ảnh tính Còn lại = KH − đã cấp (dòng 2: 306 − 150 = 156, bỏ qua 50 trong ngày; dòng 5: 150 − 70 = 80) | Theo công thức của yêu cầu; Đã cấp không gồm ngày đang chọn (Q3) |
| D4 | Số lệnh cấp tự sinh dạng `005/131026/XBTP` | Quyết định 3.11: số chứng từ sinh từ `Id` (`KH-A01-000123`), không có bảng đếm | Quyết định mới: số chạy theo ĐVCS, có khóa (Q8) |
| D5 | Mã hàng theo chuyền | Một mã hàng có thể nằm ở nhiều kế hoạch xuất hàng (khác PO/Buy date), mỗi kế hoạch phân màu cỡ riêng | Gom mọi kế hoạch của ĐVCS (Q4) |
| D6 | SL đồng bộ theo mã hàng, màu, cỡ | Số cắt theo kế hoạch + màu + cỡ, **không theo chuyền** | Cộng mọi kế hoạch cùng mã hàng; cùng một số cho mọi chuyền (Q5) |

## Thiết kế đề xuất

### Mô hình dữ liệu

Số cấp lưu **theo ngày** như số cắt ở 5.14 (một ô mỗi ngày, chuyền, mã hàng, màu, cỡ). Lệnh cấp là đầu phiếu của một nhóm (ĐVCS, Ngày cấp, Mã hàng): giữ số lệnh, ghi chú, trạng thái xác nhận. Nhờ vậy:

- Thêm mới hay Sửa đều là "nhập số cấp của Ngày cấp đang chọn": đổi Ngày cấp thì nạp lại số đã lưu của ngày đó (yêu cầu 4).
- Lưu cùng ngày, cùng mã hàng lần thứ hai (chuyền khác) thì gộp vào lệnh đã có (yêu cầu 6), không sinh lệnh mới.

Database `MES_Cutting` (module Cắt), migration `MES_Cutting/0002_cutting_supply.sql`:

| Bảng | Cột chính | Ràng buộc |
|---|---|---|
| `CuttingSupply` (lệnh cấp) | `Id`, `SupplyNo VARCHAR(30)`, `SupplyDate DATE` (Ngày cấp), `StyleCode NVARCHAR(120)`, `ProductName NVARCHAR(150)` (bản chụp), `Note NVARCHAR(500)`, `StatusCode VARCHAR(20)` (`PENDING`, `PARTIAL`, `FULL`), `ConfirmedAt`, `ConfirmedBy`, `BranchCode` + bộ kiểm toán | `UNIQUE (BranchCode, SupplyNo)`, `UNIQUE (BranchCode, SupplyDate, StyleCode)`, `UNIQUE (Id, BranchCode)`; chỉ mục `(BranchCode, SupplyDate)` |
| `CuttingSupplyLine` (số cấp) | `Id`, `CuttingSupplyId`, `LineCode VARCHAR(20)`, `ColorName NVARCHAR(100)`, `SizeName VARCHAR(20)`, `Qty INT > 0`, `PlanQty INT` (bản chụp SL KH lúc lưu, chỉ để xem lại), `SortOrder`, `BranchCode` + bộ kiểm toán | FK ghép `(CuttingSupplyId, BranchCode)`, xóa theo cha; `UNIQUE (CuttingSupplyId, LineCode, ColorName, SizeName)`; chỉ mục `(BranchCode, LineCode)` |

- Không lưu SL đã cấp, SL còn lại, SL đồng bộ: tính lúc đọc (như Lũy kế cắt, quyết định 13.3).
- Khóa ngầm (`softkeys.json`): `BranchCode` → `MES_Core.SysBranch.Code`; `CuttingSupplyLine.LineCode` → `MES_Hr.Department.Code` (cùng ĐVCS); `CreatedBy`, `ConfirmedBy` → `MES_Core.SysUser`.
- Tên màu cỡ so theo collation, dùng lại `cellKey` của `cutting.repositories.ts`.

### Nguồn số liệu

- **Chuyền**: `GET /me/lines` (bộ phận tích "Xưởng sản xuất" của ĐVCS đăng nhập), ô `TreeSelect` gom theo bộ phận cha như các màn khác (`lineOptions`, quyết định 6.7).
- **Mã hàng, màu, cỡ, SL kế hoạch**: Đơn hàng thêm service công khai `LineColorSizeFeed` (export trong `order.module.ts`, mở lint ranh giới cho module Cắt): `allocationsOf(scope, { lineCode?, styleCode? })` trả `lineCode, styleCode, productName, colorName, sizeName, assignedQty` đã **cộng mọi kế hoạch** của ĐVCS phiên (chỉ dòng `AssignedQty > 0`). Đọc trực tiếp lúc cần, không chép sang `MES_Cutting` (màn chỉ tra theo một chuyền, một mã hàng; khác 5.14 phải lọc, sắp xếp cả danh sách).
- **SL đồng bộ**: tổng `CuttingPlanDaily.Qty` của mọi `CuttingPlan` cùng `StyleCode`, màu, cỡ trong ĐVCS (cùng database); gọi `CuttingProgressService.sync` trước để bản chép kế hoạch mới nhất.
- **SL đã cấp** (theo đề xuất Q3): tổng `CuttingSupplyLine.Qty` của cùng chuyền, mã hàng, màu, cỡ ở **mọi ngày khác** Ngày cấp đang chọn. Đổi Ngày cấp thì cột này và cột Trong ngày đổi; SL kế hoạch, SL đồng bộ không đổi.

### Kiểm khi lưu (máy chủ, 422 không ghi ô nào)

- Ngày cấp không sau hôm nay (giờ Việt Nam), được lùi (như 5.14, Q10).
- Chuyền thuộc ĐVCS phiên (`OrgService.assertLine`); mã hàng, màu, cỡ có trong phân bổ của chuyền đó.
- Số nguyên ≥ 0 (0 hoặc trống là xóa ô của ngày đó).
- **Còn lại ≥ 0**: tổng cấp mọi ngày của chuyền, mã hàng, màu, cỡ không vượt SL kế hoạch.
- **Không cấp vượt số đã cắt** (đề xuất Q5): tổng cấp mọi chuyền, mọi ngày của mã hàng, màu, cỡ không vượt SL đồng bộ.
- Lệnh của (Ngày cấp, Mã hàng) đã xác nhận thì không sửa được: 409 "Lệnh cấp đã xác nhận, Hủy duyệt trước khi sửa" (Q6).
- Ghi trong transaction `MES_Cutting`, khóa ứng dụng theo (ĐVCS, mã hàng) để hai người lưu cùng lúc không vượt tổng (quyết định 3.10).

### Lệnh cấp, trạng thái, số lệnh

- Lưu lần đầu cho (ĐVCS, Ngày cấp, Mã hàng): tạo `CuttingSupply`, trạng thái **Chưa cấp**; Ngày lập phiếu = `CreatedAt`.
- **Xác nhận cấp**: ghi Người cấp, thời điểm; trạng thái tính lúc xác nhận và lưu lại (Q7): mọi dòng của lệnh có Còn lại = 0 thì **Cấp toàn phần**, còn dòng > 0 thì **Cấp 1 phần**. **Hủy duyệt** đưa về Chưa cấp, xóa Người cấp.
- **Sửa**, **Xóa** chỉ với lệnh Chưa cấp. Xóa lệnh xóa mọi số cấp của lệnh, có hộp xác nhận.
- **Số lệnh cấp** `NNN/ddMMyy/XBTP` theo ảnh: `ddMMyy` là Ngày cấp, `NNN` chạy tăng theo ĐVCS, về 001 đầu mỗi năm, sinh trong transaction có `sp_getapplock` (đếm cả lệnh ngoài phạm vi người xem, chỉ lấy số lớn nhất). Ghi quyết định mới vì khác 3.11 (Q8).
- Nhật ký `SysAuditLog`: lưu (ô cũ → mới), xóa lệnh, xác nhận, hủy duyệt.

### API `/cutting/supply`

| Phương thức, đường dẫn | Quyền | Nội dung |
|---|---|---|
| `GET /cutting/supply` | `view` | Lưới trên: lọc Ngày tạo phiếu từ, đến, Số lệnh cấp, Mã hàng, Người lập, Trạng thái, `cf`, sắp xếp, phân trang |
| `GET /cutting/supply/values`, `/export` | `view`, `export` | Lọc theo cột, CSV theo chính sách cột |
| `GET /cutting/supply/:id` | `view` | Chi tiết lệnh: đầu lệnh + dòng (chuyền, màu, cỡ, SL KH, SL đồng bộ, SL đã cấp, Trong ngày, Còn lại) |
| `GET /cutting/supply/options/styles?lineCode=` | `view` | Mã hàng đã phân cho chuyền |
| `GET /cutting/supply/options/color-sizes?lineCode=&styleCode=` | `view` | Màu, cỡ của chuyền + mã hàng |
| `GET /cutting/supply/sheet?date=&items=…` | `view` | Số liệu cho các dòng đang nhập theo Ngày cấp (gọi lại khi đổi ngày) |
| `PUT /cutting/supply` | `create`/`update` | `{ date, note, items: [{ lineCode, styleCode, colorName, sizeName, dayQty }] }`; tự gom theo mã hàng thành lệnh; trả các lệnh đã tạo, sửa |
| `DELETE /cutting/supply/:id` | `delete` | Xóa lệnh Chưa cấp |
| `POST /cutting/supply/:id/confirm`, `/unconfirm` | `update` (Q9) | Xác nhận cấp, Hủy duyệt |

### Giao diện (skill `frontend-design`, bám ảnh mẫu)

- `features/cutting/CuttingSupplyPage.tsx`, `cuttingSupplyRules.ts`, mở rộng `features/cutting/api.ts`; đăng ký `/cutting/supply` ở `routes/registry.tsx`; sửa `shell.test.tsx` (đang dùng `/cutting/supply` làm ví dụ trang giữ chỗ).
- Dải lọc theo ảnh (Ngày tạo phiếu, Chi nhánh khi ở `A00`, Số lệnh cấp, Mã hàng, Người lập, Trạng thái, Tìm kiếm, Làm lại); lưới trên `DataGrid` với `StatusBadge` (xanh Cấp toàn phần, vàng Cấp 1 phần, đỏ Chưa cấp). Ảnh để 10 dòng mỗi trang; quyết định 11.4 là 100 dòng (Q13).
- Hàng nút: Thêm mới, Sửa, Xóa, Xác nhận cấp, Hủy duyệt; nút khóa kèm lý do (`ActionButton`) theo quyền và trạng thái lệnh đang chọn.
- Khung dưới: chọn lệnh ở lưới trên thì xem chi tiết (chỉ đọc). Thêm mới, Sửa thì thành form: Ngày cấp (`DateField`, khóa ngày sau hôm nay), Người lập (chỉ đọc), Ghi chú, lưới `SheetGrid` theo đúng cột ảnh, chỉ ô **SL cấp trong ngày** nhập được; Còn lại tính lại ngay khi gõ, tô đỏ khi âm hoặc vượt SL đồng bộ; nút Lưu lại, Hủy.
- Thêm dòng (Q11, đề xuất): thanh chọn trên lưới gồm Chuyền (cây) → Mã hàng → Màu (chọn nhiều, mặc định tất cả) → Cỡ (chọn nhiều, mặc định tất cả) → nút "Thêm vào lưới" sinh mỗi màu cỡ một dòng. Tránh chọn nối tiếp trong từng ô của `SheetGrid` (bản tĩnh chỉ đọc cột ở lần vẽ đầu, xem mục lỗi tiềm ẩn `SheetGrid` ở `02-trang-thai.md`).
- Đổi Ngày cấp khi còn ô chưa lưu: hỏi bỏ thay đổi hay ở lại (như 5.14). `A00`, không có quyền, lệnh đã xác nhận: chỉ xem.

### Phân quyền

- `cutting.supply`: `ScopeType = BRANCH`, bảng nguồn `CuttingSupply`, chiều `FACTORY → BranchCode`. Chiều Chuyền (Trưởng chuyền chỉ thấy lệnh có chuyền mình) chờ Q9; nếu có thì dòng con lọc qua `ChildRepository.scopeColumns = { LINE: 'LineCode' }`, tổng kiểm vẫn tính trên cả ĐVCS (`branchOnly`).
- Hành động: `view`, `create` (Thêm mới), `update` (Sửa, Xác nhận cấp, Hủy duyệt), `delete`, `export`.
- Ma trận mẫu hiện tại `['V','VE','V','','','']` (Quản trị Xem; Giám đốc Xem, Xuất; Kế hoạch Xem). Đề xuất Kế hoạch đủ Xem, Thêm, Sửa, Xóa, Xuất; Toàn quyền đủ. Máy đã cài: migration `MES_Core/0013_grant_cutting_supply.sql` theo mẫu `0012`.
- Chính sách cột: `planQty`, `cutQty` (SL đồng bộ), `suppliedQty`, `dayQty`, `remainQty`; áp cả xuất file. Body lưu dùng khóa `dayQty`.

### Ảnh hưởng màn khác (Q12)

- Phân bổ màu cỡ giảm SL giao của chuyền xuống dưới số đã cấp, Xếp chuyền xóa chuyền đã có số cấp, Kế hoạch xuất hàng xóa kế hoạch: đề xuất chặn 409 qua điểm đăng ký như `ShipmentPlanDeleteGuards` (Đơn hàng không import Cắt). Nếu không chặn: màn này tô đỏ dòng có Còn lại âm, chỉ cho giảm.
- `reset:demo`, `load:bravo` xóa dữ liệu cấp BTP cùng dữ liệu cắt (`backend/scripts/cutting-data.ts`).

## Task

| Task | Nội dung | Tiêu chí xong |
|---|---|---|
| 5.15.0 | `main` sạch; bộ database test riêng `MES_*_T515` (gồm `MES_Cutting_T515`); ghi quyết định 13.8 (lệnh cấp gom theo ngày + mã hàng, số theo ngày), 13.9 (số lệnh cấp `NNN/ddMMyy/XBTP`, khác 3.11) vào `13-quyet-dinh.md` | Lint, test không cần database qua |
| 5.15.1 | Migration `MES_Cutting/0002_cutting_supply.sql`, `softkeys.json`, `cutting.types.ts`; seed `cutting.supply` (bảng nguồn, phạm vi, cột, ma trận); `MES_Core/0013` cấp quyền máy đã cài | `npm run migrate`, `check:softkeys` qua trên `T515`; test migration cấp quyền |
| 5.15.2 | Đơn hàng: `LineColorSizeFeed` (`allocationsOf`), export, lint ranh giới; điểm đăng ký chặn giảm phân bổ, xóa chuyền nếu Q12 chọn chặn | Test: lọc ĐVCS, `A00`, cộng nhiều kế hoạch cùng mã hàng |
| 5.15.3 | Backend Cắt: `cutting-supply.service.ts`, controller, repository; lưu theo ngày, gom lệnh, số lệnh, xác nhận, hủy duyệt, xóa, xuất, nhật ký | Test: phân quyền, `BranchCode`, `A00` chỉ đọc, ĐVCS khác 404, ngày tương lai, Còn lại âm, vượt SL đồng bộ, hai chuyền cùng mã hàng cùng ngày một lệnh, đổi ngày không đổi SL KH, sửa lệnh đã xác nhận 409, số lệnh không trùng khi lưu đồng thời, chính sách cột (cả xuất file) |
| 5.15.4 | Frontend: `CuttingSupplyPage.tsx`, `cuttingSupplyRules.ts`, `api.ts`, route; skill `frontend-design` | Test frontend cho Còn lại khi gõ, đổi ngày còn ô chưa lưu, nút theo trạng thái; xem trên Chrome 1366×768 và 390px, so cạnh ảnh mẫu |
| 5.15.5 | Script: `reset:demo`, `load:bravo` xóa dữ liệu cấp BTP; tài liệu `15-cat.md` (mục mới), `01`, `03`, `04`, `06`, `11`, `12`, `13`, `02`; `code-reviewer`, báo cáo `docs/review/phase-5-15.md` | Không còn CRITICAL/HIGH; lint, test, build qua |

Ước lượng: khoảng 6–8 ngày làm việc.

## Việc trên máy chủ (khi deploy)

`npm run migrate` chạy `MES_Cutting/0002`, `MES_Core/0013` (cần `MES_Cutting` đã có từ 5.14); deploy code.

## Khác bản thiết kế ở trên khi làm

- `CuttingSupplyLine` không có cột bản chụp `PlanQty`, `CuttingSupply` không có `ProductName`: SL kế hoạch, tên sản phẩm luôn đọc lúc xem từ Phân bổ màu cỡ.
- API: lưới nhập tính bằng `POST /cutting/supply/sheet` (không phải `GET …?items=`); lưu là `PUT /cutting/supply` không có Id, body có `styles` (mã hàng của form, để Ghi chú áp được khi chỉ đổi Ghi chú) và khóa `line`, `style` thay `lineCode`, `styleCode` (chính sách cột của Chuyền, Mã hàng không chặn việc chọn dòng); Xác nhận cấp, Hủy duyệt là `POST`. Lưu cần Sửa, tạo lệnh mới cần thêm Thêm.
- Q12: chỉ cần chặn ở Phân bổ màu cỡ và Xếp chuyền; kế hoạch đã xếp chuyền vốn không xóa được ở Kế hoạch xuất hàng. Điểm đăng ký là `LineSupplyGuards`.
- Lưới lệnh cấp thêm cột Ngày cấp, Tổng SL cấp, Ghi chú; không có ô lọc Chi nhánh riêng (lọc theo cột); không có nút Tìm kiếm (lọc ngay khi đổi), "Làm lại" là Xóa lọc.
- Lần lưu đưa mọi ô của lệnh Chưa cấp về 0 thì lệnh tự bỏ (không để lệnh rỗng).
- `sim:board` giữ kế hoạch mô phỏng có mã hàng đã cấp BTP.

## Ngoài phạm vi

- In lệnh cấp, quét mã vạch bó hàng, xác nhận nhận hàng phía chuyền may.
- Cấp theo bó, theo bàn cắt; chuyển BTP qua in thêu (`cutting.embroidery`).

## Câu hỏi

| # | Câu hỏi | Đề xuất |
|---|---|---|
| Q1 | Mã hàng lưu `VARCHAR(16)` không đủ cho mã thật (mã trong ảnh đã 24 ký tự, mã BRAVO tới 120). Lưu `NVARCHAR(120)` như các bảng khác? | `NVARCHAR(120)` |
| Q2 | Hệ thống không có mã màu, mã cỡ (mọi nơi lưu tên). Lưu tên màu, tên cỡ? | Lưu tên |
| Q3 | Ảnh tính Còn lại = KH − Đã cấp, khác công thức yêu cầu. "Đã cấp" gồm những ngày nào? (a) mọi ngày khác Ngày cấp đang chọn, Còn lại = KH − Đã cấp − Trong ngày; (b) chỉ các ngày trước Ngày cấp đang chọn | (a): Còn lại luôn là số thật còn phải cấp |
| Q4 | Mã hàng có ở nhiều kế hoạch xuất hàng (khác PO/Buy date) cùng chuyền: cộng chung một dòng, hay chọn thêm kế hoạch (PO/Buy date)? | Cộng chung (lệnh cấp theo mã hàng như yêu cầu) |
| Q5 | SL đồng bộ là số cắt của mã hàng, màu, cỡ, không theo chuyền: mã hàng chạy hai chuyền thì hai dòng cùng một số. Có chặn tổng cấp mọi chuyền vượt số đã cắt không? | Chặn (không cấp hàng chưa cắt) |
| Q6 | Gom lệnh theo **Ngày cấp** hay ngày tạo phiếu? Lệnh của ngày, mã hàng đó đã xác nhận mà muốn cấp thêm cùng ngày: chặn (phải Hủy duyệt) hay tạo lệnh thứ hai? | Theo Ngày cấp; chặn, phải Hủy duyệt |
| Q7 | Trạng thái Cấp 1 phần, Cấp toàn phần tính lúc bấm Xác nhận cấp rồi giữ nguyên, hay tính lại mỗi lần xem (lệnh cũ có thể đổi khi ngày sau cấp thêm)? SL đã cấp có tính lệnh chưa xác nhận không? | Tính lúc xác nhận, giữ nguyên; SL đã cấp tính cả lệnh chưa xác nhận (để không cấp vượt) |
| Q8 | Số lệnh `NNN/ddMMyy/XBTP`: `NNN` chạy theo ĐVCS và về 001 mỗi năm? (khác quyết định 3.11 sinh số từ `Id`) | Theo ĐVCS, về 001 mỗi năm |
| Q9 | Vai trò nào lập lệnh, vai trò nào Xác nhận cấp? Người lập có tự xác nhận lệnh của mình được không? Trưởng chuyền có xem lệnh của chuyền mình không? | Kế hoạch lập và xác nhận (quyền Sửa); người lập tự xác nhận được; Trưởng chuyền chưa xem |
| Q10 | Ngày cấp: cho lùi, không cho ngày tương lai (như Đồng bộ tiến độ cắt)? | Có |
| Q11 | Thêm dòng bằng thanh chọn (Chuyền → Mã hàng → Màu, Cỡ chọn nhiều → Thêm vào lưới) thay vì chọn trong từng ô của lưới? | Thanh chọn |
| Q12 | Giảm phân bổ màu cỡ, xóa chuyền, xóa kế hoạch xuống dưới số đã cấp: chặn hay chỉ cảnh báo ở màn này? | Chặn (409) |
| Q13 | Lưới trên 10 dòng mỗi trang như ảnh, hay 100 dòng theo quy ước chung (quyết định 11.4)? | 100 dòng, vẫn đổi được |
