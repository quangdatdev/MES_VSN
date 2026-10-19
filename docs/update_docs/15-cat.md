# Module Cắt: Đồng bộ tiến độ cắt, Xác nhận cấp BTP

File này mô tả module Cắt đang có trong code: màn Đồng bộ tiến độ cắt (phase 5.14), cách kế hoạch xuất hàng được chép từ module Đơn hàng, chặn xóa kế hoạch đã có số cắt, API `/cutting/progress`; màn Xác nhận cấp BTP (phase 5.15, phần cuối file), API `/cutting/supply`; database `MES_Cutting`.
Đọc khi sửa các màn này, hoặc đổi cấu trúc kế hoạch xuất hàng, Phân bổ màu cỡ bên module Đơn hàng (module Cắt chép, đọc từ đó).
Quyết định: [Quyết định](13-quyet-dinh.md) mục 13. Luật chung của `BaseRepository`, chính sách cột: [Phân quyền](04-phan-quyen.md). `SheetGrid`, `DataGrid`, lọc theo cột: [Giao diện](10-giao-dien.md). Kế hoạch xuất hàng: [Đơn hàng](06-don-hang.md).

## Tổng quan

Tổ cắt nhập số đã cắt mỗi ngày theo màu cỡ của từng kế hoạch xuất hàng. Mỗi dòng của màn là **một kế hoạch xuất hàng** của ĐVCS (lập kế hoạch xong là có, không chờ xếp chuyền). Bấm đúp một dòng (hoặc chọn dòng rồi bấm Nhập số cắt) mở popup theo ảnh `docs/screens/dong-bo-tien-do-cat.png`.

| Màn | Đường dẫn | Quyền | Frontend | Backend |
|---|---|---|---|---|
| Đồng bộ tiến độ cắt | `/cutting/progress` (nhóm Quản trị nhà cắt) | `cutting.progress:view`, `:update` (nhập số), `:delete` (Xóa số cắt), `:export` | `frontend/src/features/cutting/CuttingProgressPage.tsx`, `cuttingProgressRules.ts`, `api.ts` | `backend/src/modules/cutting/cutting.controller.ts`, `cutting-progress.service.ts`, `cutting.repositories.ts` |

**Các file khác của module:**

| File | Vai trò |
|---|---|
| `backend/src/modules/cutting/cutting.module.ts` | Khai module; import `OrderModule` để dùng `ShipmentPlanFeed`, `ShipmentPlanDeleteGuards` |
| `backend/src/modules/cutting/cutting.db.ts` | Kết nối riêng tới `MES_Cutting` (`DB_CUTTING_NAME`, mặc định `MES_Cutting`) |
| `backend/src/modules/cutting/cutting.types.ts` | Kiểu Kysely của 3 bảng |
| `backend/src/modules/cutting/cutting.dto.ts` | DTO, mã trạng thái `CUTTING_STATUSES`, giới hạn `MAX_DAY_QTY` (1.000.000), `MAX_SAVE_CELLS` (2.000) |
| `backend/src/modules/order/shipment-plan-feed.service.ts` | API công khai của Đơn hàng: `plansOf`, `versionOf`, `exists`, `cutQtyOf`, `setCutQty` (đọc, ghi cột LK cắt qua `ShipmentPlanFeedRepository` trong `order.repositories.ts`) |
| `backend/src/modules/order/shipment-plan-delete-guard.ts` | Điểm đăng ký chặn xóa kế hoạch (`ShipmentPlanDeleteGuards`), gọi trong `ShipmentService.remove` |
| `backend/scripts/cutting-data.ts` | `hasCuttingDb`, `clearCutting`, `plansWithCuts` cho các script |
| `frontend/src/routes/registry.tsx` | Đăng ký `/cutting/progress` → `features/cutting/CuttingProgressPage` |

Ranh giới module (lint `backend/eslint.config.mjs`): module Cắt chỉ import `order.module`, `shipment-plan-feed.service`, `shipment-plan-delete-guard`, `line-color-size-feed.service`, `line-supply-guard` của Đơn hàng; Đơn hàng, Nhân sự không import module Cắt.

## Quy tắc tính (quyết định 13.3)

- **Trong ngày**: số cắt của một màu cỡ trong Ngày nhập liệu đang chọn. Lưu một dòng mỗi kế hoạch, màu, cỡ, ngày; chỉ số > 0 (nhập 0 hoặc xóa ô là xóa dòng). Số nguyên, tối đa 1.000.000 mỗi ô.
- **Lũy kế** = tổng Trong ngày của mọi ngày, tính lúc đọc (không lưu sẵn).
- **+/-** = Lũy kế − Kế hoạch (theo ảnh mẫu): âm là còn thiếu, dương là cắt dư (chỉ còn khi kế hoạch giảm sau khi cắt).
- **Lũy kế không vượt Kế hoạch** của màu cỡ (quyết định 13.7): lần lưu làm một màu cỡ tăng số mà Lũy kế vượt thì 422, không ghi ô nào; muốn cắt thêm thì điều chỉnh Kế hoạch xuất hàng trước (lần lưu chép lại kế hoạch trước khi kiểm). Màu cỡ đã vượt (kế hoạch giảm sau khi cắt) chỉ giảm được số. Popup tô đỏ ô Lũy kế, +/- đang vượt (trừ màu cỡ đã bỏ khỏi kế hoạch), khóa nút Lưu lại, nêu màu cỡ và có nút "Tải lại kế hoạch" (giữ số đang nhập); lưu bị 422 cũng tự tải lại.
- Đổi Ngày nhập liệu chỉ đổi cột Trong ngày; Lũy kế, +/- luôn tính trên mọi ngày.
- Ngày nhập liệu được lùi, không được sau hôm nay theo giờ Việt Nam (máy chủ kiểm, lịch trên giao diện khóa ngày sau).
- **Trạng thái** của kế hoạch, tính lúc đọc: Chưa cắt (Lũy kế 0), Đang cắt (0 < Lũy kế < SL KH), Đã cắt đủ (Lũy kế ≥ SL KH), Kế hoạch đã xóa (`SOURCE_DELETED`, mục dưới).
- Tên màu cỡ so như collation của database (không phân biệt hoa thường, bỏ khoảng trắng cuối): `cellKey` ở `cutting.repositories.ts`. Tên lưu theo bản chép của kế hoạch, không theo chữ client gửi.

## Chép kế hoạch từ module Đơn hàng (quyết định 13.2)

Mỗi lần mở màn, mở popup, lọc giá trị hoặc xuất file, `CuttingProgressService.sync` so dấu phiên bản `ShipmentPlanFeed.versionOf` (số kế hoạch, số dòng màu cỡ, `MAX(ModifiedAt)` và `CHECKSUM_AGG(BINARY_CHECKSUM(...))` của `ShipmentPlan` và `ShipmentPlanColorSize` có SL > 0, theo ĐVCS của phiên; `A00`: mọi ĐVCS) với dấu đã chép (giữ trong bộ nhớ tiến trình) và số bản chép còn nguồn. Khác thì `CuttingPlanRepository.syncFromPlans`:

1. Một transaction của `MES_Cutting`, khóa ứng dụng `MES_Cutting.CuttingPlan.sync` (chờ tối đa 15 giây), đọc nguồn sau khi giữ khóa.
2. Kế hoạch nhận diện bằng Id + ĐVCS + thời điểm tạo (dung sai 5 ms). Khớp thì cập nhật đầu kế hoạch đã đổi; màu cỡ đổi thì thay toàn bộ dòng màu cỡ của kế hoạch đó. Không khớp thì thêm mới.
3. Bản chép mất nguồn (kế hoạch bị xóa, hoặc Id đã thuộc kế hoạch khác): còn số cắt thì giữ, đặt `ShipmentPlanId = NULL`, `SourceDeletedAt`; chưa có thì xóa.
4. Phiên `A00` mà nguồn trả rỗng trong khi bản chép còn kế hoạch (nhầm database, đang nạp lại): không đổi gì (log cảnh báo). Phiên một ĐVCS thì vẫn chép, để ĐVCS xóa kế hoạch cuối cùng của mình thì bản chép đi theo; số cắt không bao giờ bị xóa ở bước này.

Chép lỗi (hết thời gian chờ khóa, mất kết nối `MES_Order`): màn vẫn trả bản chép hiện có, lần sau chép lại. Số cắt gắn theo kế hoạch và tên màu cỡ, nên chép lại không làm mất số; màu cỡ bị bỏ khỏi kế hoạch mà còn số cắt vẫn hiện ở cuối popup (Kế hoạch 0, chỉ xem).

## Cột LK cắt của Kế hoạch xuất hàng (quyết định 13.6)

Lũy kế cắt của mỗi kế hoạch (mọi ngày, mọi màu cỡ, kể cả màu cỡ đã bỏ khỏi kế hoạch) được ghi sang `MES_Order.ShipmentPlan.CutQty` (cột LK cắt của màn Kế hoạch xuất hàng) qua `ShipmentPlanFeed.setCutQty`:
- ngay sau mỗi lần lưu có ô đổi và sau Xóa số cắt, khi `MES_Cutting` đã commit (`pushAfterWrite`); lỗi thì chỉ log cảnh báo;
- đối chiếu mỗi lần mở màn, popup, lọc giá trị, xuất file (`reconcileCutQty`, sau bước chép): so Lũy kế với `ShipmentPlanFeed.cutQtyOf`, chỉ ghi kế hoạch lệch (kế hoạch mới, lần ghi sau khi lưu bị lỗi, sửa ngoài luồng).

Mọi lần ghi giữ khóa ứng dụng `MES_Cutting.CutQty.push` (`withCutQtyLock`, chờ tối đa 15 giây) và đọc Lũy kế khi đã giữ khóa, nên các tiến trình backend (pm2 cluster) lần lượt, số cũ không ghi đè số mới. Chỉ ghi kế hoạch khớp Id + ĐVCS + thời điểm tạo và đang khác số, không đổi `ModifiedAt`. Phiên `A00` mở màn thì đối chiếu kế hoạch của mọi ĐVCS (việc của hệ thống, mục 6.9 của [Phân quyền](04-phan-quyen.md)). Seed, `sim:board` để cột này 0; máy đang có số giả cũ ở cột này giữ tới lần đầu ĐVCS đó (hoặc `A00`) mở màn Đồng bộ tiến độ cắt.

## Chặn xóa kế hoạch xuất hàng (quyết định 13.4)

- Lúc khởi động, module Cắt đăng ký vào `ShipmentPlanDeleteGuards`: kế hoạch có số cắt thì trả câu "Kế hoạch đã có số cắt ở Đồng bộ tiến độ cắt. Xóa số cắt của kế hoạch trước khi xóa kế hoạch."
- `DELETE /order/shipment-plans/:id` gọi các hàm đã đăng ký trước transaction xóa; có lý do thì 409. Hàm kiểm lỗi (không kết nối được `MES_Cutting`) thì cũng chặn.
- Hai database không có transaction chung. Lưu số cắt kiểm kế hoạch nguồn còn tồn tại (`ShipmentPlanFeed.exists`) trước khi ghi và lần nữa sau khi ghi, trước commit; không còn thì 409. Nếu vẫn lọt (lưu đúng lúc kế hoạch đang bị xóa, hoặc kế hoạch mất qua script), lần chép sau đánh dấu "Kế hoạch đã xóa": giữ số, chỉ xem, chỉ còn Xóa số cắt.
- **Xóa số cắt** (`DELETE /cutting/progress/:id/entries`): xóa số cắt mọi ngày của kế hoạch, có hộp xác nhận nêu số ngày và Lũy kế, ghi nhật ký. Kế hoạch đã mất nguồn thì xóa luôn bản chép.

## Màn Đồng bộ tiến độ cắt

### Lưới chính

Khung như Phân bổ màu cỡ: `WorkPage`, dải lọc chung của khối Đơn hàng (`OrderFilters`: Ngày xuất hàng từ, đến, Khách hàng, Mã hàng, Trạng thái), `DataGrid` 100 dòng mỗi trang, lọc và sắp xếp theo cột ở máy chủ, chân lưới cộng SL kế hoạch và đã cắt của trang.

Cột: Số kế hoạch, Chi nhánh (tên ĐVCS), Khách hàng, Mã hàng, Tên sản phẩm, PO/Buy date, Ngày xuất hàng, Số lượng KH, Lũy kế cắt, +/-, Ngày cắt gần nhất, Trạng thái, Ngày tạo kế hoạch. Mặc định mới tạo trước. Ô tìm nhanh (`q`) tìm trong Số kế hoạch, Mã hàng, Khách hàng, PO/Buy date, Tên sản phẩm.

### Popup nhập số cắt

- Thông tin chung (chỉ đọc): Chi nhánh, Khách hàng, Mã hàng, PO/Buy Date, Số lượng KH; dưới là Ngày nhập liệu (mặc định hôm nay theo máy chủ). Ảnh mẫu vẽ Chi nhánh, Khách hàng dạng ô chọn nhưng popup mở từ một kế hoạch nên chỉ đọc.
- Lưới `SheetGrid` (số dòng cố định, không thêm, xóa dòng): STT, Màu, Cỡ, Kế hoạch, Trong ngày (ô nhập duy nhất), Lũy kế, + / -. Dòng Tổng ghim đầu lưới, STT "-", nền xanh nhạt (`.cut-total` trong `global.css`); màu cỡ chưa cắt để trống ô Lũy kế, Tổng chưa nhập để trống ô Trong ngày, như ảnh. STT của dòng Tổng dùng prop `rowLabel` của `SheetGrid`.
- Đang gõ thì Lũy kế = Lũy kế đã lưu − số đã lưu của ngày đang xem + số đang gõ; +/- và dòng Tổng tính lại ngay (`cuttingProgressRules.ts`).
- Lưu lại: chỉ gửi các ô đã sửa (0 là xóa). Lưu xong popup vẫn mở để nhập ngày khác; danh sách tải lại khi đóng.
- Đổi Ngày nhập liệu khi còn ô chưa lưu: hỏi bỏ thay đổi hay ở lại.
- Chỉ đọc khi: không có quyền Sửa, cột Trong ngày không Sửa được theo chính sách cột, đang ở `A00` (câu báo chế độ tổng hợp), kế hoạch đã xóa (khung đỏ báo).
- Nút Xóa số cắt (bên phải, chữ đỏ) chỉ hiện khi có quyền Xóa và kế hoạch có số cắt; bị khóa khi còn ô chưa lưu.

### Xuất file

CSV cùng bộ lọc, theo chính sách cột, tối đa 10.000 dòng: Số kế hoạch, Chi nhánh, Khách hàng, Mã hàng, Tên sản phẩm, PO/Buy date, Ngày xuất hàng, Số lượng KH, Lũy kế cắt, +/-, Ngày cắt gần nhất, Trạng thái.

## Phân quyền và chính sách cột

- Tài nguyên `cutting.progress`, `BRANCH`, bảng nguồn `CuttingPlan`, chiều `FACTORY → BranchCode` (không chiều Chuyền, Người tạo). Mọi truy vấn của người dùng qua `CuttingPlanRepository` (`BaseRepository`) và hai `ChildRepository`. `A00` chỉ đọc (`AGGREGATE_READ_ONLY`). Kế hoạch ĐVCS khác: 404.
- Ma trận mẫu: Kế hoạch Xem, Sửa, Xuất; Quản trị, Trưởng chuyền Xem; Giám đốc Xem, Xuất; Toàn quyền đủ (gồm Xóa). Máy đã cài: migration `MES_Core/0012` (chỉ cấp cho Kế hoạch khi còn quyền Xem).
- Cột đăng ký: `planNo`, `customerName`, `styleCode`, `productName`, `poBuyDate`, `shipDate`, `planQty`, `dayQty`, `cutQty`, `diffQty`, `lastCutDate`, `statusCode`. Body lưu dùng khóa `dayQty` nên chính sách "Trong ngày" được cưỡng chế khi ghi.
- `planQty` hoặc `cutQty` bị Ẩn, Che thì +/- và Trạng thái (suy ra được hai cột đó) trả `***`, không lọc, không sắp xếp, không hỏi giá trị theo hai cột này (403 ở `/values`); riêng trạng thái Kế hoạch đã xóa vẫn hiện.

## API `/cutting/progress`

| Phương thức, đường dẫn | Quyền | Nội dung |
|---|---|---|
| `GET /cutting/progress` | `view` | Danh sách (`page`, `pageSize` ≤ 200, `q`, `sort`, `shipFrom`, `shipTo`, `customer`, `style`, `status`, `cf`); trả thêm `today` |
| `GET /cutting/progress/values` | `view` | Giá trị một cột cho popup lọc (`field`, `search`) |
| `GET /cutting/progress/export` | `export` | CSV |
| `GET /cutting/progress/:id?date=YYYY-MM-DD` | `view` | Popup: đầu kế hoạch, `branchName`, `date`, `today`, `entryDays`, `canEdit`, `canDelete`, `items[]` (`colorName`, `sizeName`, `inPlan`, `planQty`, `dayQty`, `cutQty`, `diffQty`). Ngày sau hôm nay: 422 |
| `PUT /cutting/progress/:id` | `update` | `{ date, items: [{ colorName, sizeName, dayQty }] }`; trả như `GET :id` của ngày đó. 422: ngày sau hôm nay, số âm, số lẻ, màu cỡ ngoài kế hoạch, gửi trùng. 409: kế hoạch đã xóa |
| `DELETE /cutting/progress/:id/entries` | `delete` | Xóa số cắt; trả `{ removedDays, removedRows, planRemoved }` |

## Database `MES_Cutting`

Migration `backend/migrations/MES_Cutting/0001_cutting_progress.sql`. `npm run migrate` tạo database theo collation của `MES_Core` nếu tài khoản có quyền; không thì quản trị CSDL tạo trước (cùng collation), cấp `db_owner` ([Vận hành](11-van-hanh.md)).

| Bảng | Cột chính | Ràng buộc, chỉ mục |
|---|---|---|
| `CuttingPlan` | `Id`, `ShipmentPlanId` (NULL khi mất nguồn), `SourceCreatedAt`, `PlanNo`, `CustomerName`, `StyleCode`, `ProductName`, `PoBuyDate`, `ShipDate`, `PlanQty`, `SourceDeletedAt`, `SourceSyncedAt`, `BranchCode` + bộ kiểm toán | `UQ_CuttingPlan_IdBranch (Id, BranchCode)`; `CK_CuttingPlan_Source` (còn nguồn thì chưa đánh dấu xóa, và ngược lại); `UX_CuttingPlan_ShipmentPlan` duy nhất có lọc `ShipmentPlanId IS NOT NULL`; `IX_CuttingPlan_Branch_ShipDate` |
| `CuttingPlanColorSize` | `CuttingPlanId`, `ColorName`, `SizeName`, `PlanQty`, `SortOrder`, `BranchCode` | FK ghép tới cha, xóa theo cha; `UQ (CuttingPlanId, ColorName, SizeName)`; `IX_..._Branch` |
| `CuttingPlanDaily` | `CuttingPlanId`, `ColorName`, `SizeName`, `EntryDate`, `Qty > 0`, `BranchCode` + bộ kiểm toán | FK ghép tới cha **không** xóa theo cha; `UQ (CuttingPlanId, ColorName, SizeName, EntryDate)`; `IX_CuttingPlanDaily_Branch (BranchCode, CuttingPlanId) INCLUDE (Qty, EntryDate)` |

Khóa ngầm (`softkeys.json`): `BranchCode` của 3 bảng → `MES_Core.SysBranch.Code`; `CuttingPlan.ShipmentPlanId` → `MES_Order.ShipmentPlan.Id` (cùng ĐVCS, có thể NULL).

## Nhật ký

`SysAuditLog`, ghi sau khi `MES_Cutting` commit: `CuttingPlan` / `UPDATE` (kế hoạch, ngày, các ô cũ → mới) khi lưu; `CuttingPlan` / `DELETE_ENTRIES` (số ngày, Lũy kế, số dòng) khi Xóa số cắt.

## Script

- `reset:demo`, `load:bravo`: xóa toàn bộ dữ liệu `MES_Cutting` (số cắt rồi bản chép), vì Id kế hoạch được đánh số lại.
- `sim:board`: luôn giữ kế hoạch mô phỏng đã có số cắt, kể cả `--all` (`plansWithCuts`, đọc trước transaction của `MES_Order`).
- Seed chưa có số cắt mẫu: bản chép kế hoạch chỉ sinh khi mở màn.

## Test

| File | Kiểm gì |
|---|---|
| `backend/test/cutting.spec.ts` | `ShipmentPlanFeed` (lọc ĐVCS, `A00`, dấu phiên bản); danh sách một dòng mỗi kế hoạch chưa xếp chuyền; popup, ngày tương lai, ĐVCS khác 404; lưu theo ngày, Lũy kế không đổi khi xem ngày khác, 0 là xóa, tên khác hoa thường, nhật ký; Lũy kế không vượt Kế hoạch (422 không ghi ô nào, kế hoạch giảm thì vẫn giảm số, tăng kế hoạch thì lưu ngay); kiểm đầu vào; phân quyền (`A00`, Giám đốc, Trưởng chuyền, Kế hoạch không Xóa); chính sách cột (+/-, Trạng thái che theo SL KH); màu cỡ bị bỏ; chặn xóa kế hoạch rồi Xóa số cắt; kế hoạch mất nguồn; LK cắt bên Kế hoạch xuất hàng sau lưu, Xóa số cắt và đối chiếu khi lệch; chép lại khi ĐVCS không còn kế hoạch; Trong ngày Chỉ đọc; xuất file |
| `backend/test/cutting-grant-migration.spec.ts` | Migration `MES_Core/0012` |
| `backend/test/simulate-board.db.spec.ts` | `sim:board` giữ kế hoạch có số cắt, kể cả `--all` |
| `frontend/src/test/cutting-progress-rules.test.ts` | Dòng Tổng, +/-, Lũy kế khi gõ, chỉ gửi ô đã sửa, dòng không sửa được, cột bị Che, Lũy kế vượt Kế hoạch (tô đỏ, chặn tăng, cho giảm) |

## Giới hạn hiện tại

- Chưa theo bàn cắt, lớp vải, chuyền; chưa kết nối máy cắt.
- Hai người sửa cùng một ô cùng ngày: người lưu sau ghi đè (có nhật ký); ô khác nhau thì không ghi đè nhau.

## Xác nhận cấp BTP (phase 5.15)

Tổ cắt ghi số bán thành phẩm (BTP) cấp cho từng chuyền may theo ngày, chuyền, mã hàng, màu, cỡ. Số cấp tự gom thành **lệnh cấp**: một lệnh mỗi ĐVCS, Ngày cấp, mã hàng (các chuyền chung mã hàng cấp cùng ngày vào một lệnh). Người cấp bấm Xác nhận cấp. Màn theo ảnh `docs/screens/cap-ban-thanh-pham.png`. Quyết định 13.8–13.10; kế hoạch `docs/phases/phase-5-15-xac-nhan-cap-btp.md`.

| Màn | Đường dẫn | Quyền | Frontend | Backend |
|---|---|---|---|---|
| Xác nhận cấp BTP | `/cutting/supply` (nhóm Quản trị nhà cắt) | `cutting.supply:view`, `:create` (tạo lệnh mới khi lưu), `:update` (lưu số cấp, Xác nhận cấp, Hủy duyệt), `:delete`, `:export` | `frontend/src/features/cutting/CuttingSupplyPage.tsx`, `cuttingSupplyRules.ts`, `api.ts` | `backend/src/modules/cutting/cutting-supply.service.ts`, `cutting-supply.repositories.ts`, `cutting-supply.dto.ts`, `cutting.controller.ts` (`CuttingSupplyController`) |

API công khai của Đơn hàng dùng ở đây: `backend/src/modules/order/line-color-size-feed.service.ts` (`LineColorSizeFeed.allocationsOf`, `stylesOf`: Phân bổ màu cỡ gom theo chuyền, mã hàng, màu, cỡ, cộng mọi kế hoạch; repository `LineColorSizeFeedRepository` trong `order.repositories.ts`) và `line-supply-guard.ts` (`LineSupplyGuards`).

### Quy tắc tính (quyết định 13.8)

| Cột | Cách tính |
|---|---|
| SL kế hoạch | SL giao ở Phân bổ màu cỡ của chuyền, mã hàng, màu, cỡ, cộng mọi kế hoạch xuất hàng của ĐVCS (một mã hàng có thể ở nhiều kế hoạch: mỗi ĐVCS một kế hoạch mỗi đơn từ phase 5.17, dữ liệu cũ có thể nhiều kế hoạch ở cùng ĐVCS) |
| SL đồng bộ | Lũy kế cắt (Đồng bộ tiến độ cắt) của mã hàng, màu, cỡ, cộng mọi kế hoạch của ĐVCS, kể cả kế hoạch đã xóa còn số cắt. Không theo chuyền: mã hàng chạy hai chuyền thì hai dòng cùng một số |
| SL đã cấp | Tổng số cấp các ngày **khác** Ngày cấp đang xem, của chuyền, mã hàng, màu, cỡ (cả lệnh chưa xác nhận) |
| SL cấp trong ngày | Nhập; lưu vào Ngày cấp đang chọn |
| SL còn lại | SL kế hoạch − SL đã cấp − SL cấp trong ngày (ảnh mẫu tính KH − Đã cấp: không theo ảnh, Q3) |

- Đổi Ngày cấp: nạp lại số đã lưu của ngày đó cho các dòng đang có trong form (SL cấp trong ngày, SL đã cấp, SL còn lại đổi; SL kế hoạch, SL đồng bộ giữ). Đổi khi còn ô chưa lưu thì hỏi bỏ thay đổi.
- Lưu chỉ gửi ô đã sửa (0 là xóa số của ngày đó). Máy chủ chặn (422, không ghi ô nào) ô **tăng** số mà: không có trong Phân bổ màu cỡ của chuyền; làm Còn lại âm; làm tổng cấp mọi chuyền, mọi ngày của màu cỡ vượt SL đồng bộ. Giảm số luôn được (phân bổ giảm sau khi cấp: dòng tô đỏ, chỉ giảm được). Ngày cấp không sau hôm nay (giờ Việt Nam), được lùi.
- Tên mã hàng, màu, cỡ ghi theo Phân bổ màu cỡ, không theo chữ client gửi; so như collation (không phân biệt hoa thường, bỏ khoảng trắng cuối).
- Lưu gom ô theo mã hàng: có lệnh của (Ngày cấp, mã hàng) thì ghi vào đó, chưa có thì tạo lệnh mới (cần quyền Thêm). Lần lưu đưa mọi ô của một lệnh Chưa cấp về 0 thì lệnh tự bỏ. Ghi chú (khi đổi) áp cho lệnh của mọi mã hàng trong form.
- Hai lần lưu cùng mã hàng lần lượt (khóa ứng dụng `MES_Cutting.CuttingSupply:<ĐVCS>:<MÃ HÀNG>`, chờ tối đa 15 giây, hết giờ 409); sau khi ghi, trước commit, đọc lại Phân bổ màu cỡ: phần giao vừa giảm ở lần lưu chen giữa thì 409.
- Dòng đã bỏ khỏi Phân bổ màu cỡ mà còn số cấp (`inPlan` false, SL kế hoạch 0): chỉ giảm được số; tăng thì 422 "Chưa có trong Phân bổ màu cỡ".

### Lệnh cấp, trạng thái, số lệnh

- Số lệnh `NNN/ddMMyy/XBTP` (quyết định 13.9): `ddMMyy` là Ngày cấp, `NNN` tăng trong ĐVCS, về 001 đầu mỗi năm của Ngày cấp. Sinh khi giữ khóa `MES_Cutting.CuttingSupply.No:<ĐVCS>`.
- Trạng thái: **Chưa cấp** (chưa xác nhận); **Xác nhận cấp** ghi Người cấp, lúc cấp và tính **Cấp toàn phần** (mọi dòng của lệnh có Còn lại ≤ 0) hoặc **Cấp 1 phần**, giữ nguyên tới khi Hủy duyệt. **Hủy duyệt** về Chưa cấp, bỏ người cấp.
- Lệnh đã xác nhận: không lưu số, không đổi Ghi chú, không xóa (409 "Hủy duyệt trước"). Trong form, dòng của mã hàng có lệnh đã xác nhận ở Ngày cấp đang xem hiện xám, chỉ xem.
- Xóa lệnh Chưa cấp xóa mọi số cấp của lệnh.
- Người lập, người cấp lưu tên chụp lúc ghi (`CreatorName`, `ConfirmerName`), như Nhân viên lập của kế hoạch xuất hàng.

### Chặn giảm phần giao dưới số đã cấp (Q12)

`LineSupplyGuards` (Đơn hàng): module Cắt đăng ký hàm tra số đã cấp lúc khởi động (`CuttingSupplyRepository.suppliedQuick`: chờ khóa tối đa 3 giây để không treo khi lần lưu số cấp cùng chuyền đang giữ khóa và chờ đọc phân bổ; hết giờ thì Đơn hàng trả 409 "thử lại"). Phân bổ màu cỡ (`ColorSizeService.save`) và Xếp chuyền (`LinePlanService.saveLines`: xóa dòng, đổi chuyền) chụp phần giao theo chuyền, mã hàng, màu, cỡ (cộng mọi kế hoạch) trước khi ghi, kiểm sau khi ghi, trước commit: ô **giảm** xuống dưới số đã cấp thì 409 "Phần giao mới thấp hơn số bán thành phẩm đã cấp cho chuyền (…). Giảm số cấp ở màn Xác nhận cấp BTP trước." Không nêu số khi người sửa không xem được số lượng. Không tra được số đã cấp thì cũng chặn. Kế hoạch đã xếp chuyền không xóa được ở Kế hoạch xuất hàng nên không cần chặn ở đó; Kế hoạch xuất hàng đã chặn giảm SL màu cỡ dưới phần giao (phase 5.13).

### Màn Xác nhận cấp BTP

- **Dải lọc** (theo ảnh): Ngày tạo phiếu từ, đến (ngày theo giờ Việt Nam của lúc tạo); Số lệnh cấp; Mã hàng; Người lập (gợi ý theo giá trị có trong dữ liệu); Trạng thái; Xóa lọc. Lọc ngay khi đổi (không có nút Tìm kiếm; "Làm lại" của ảnh là Xóa lọc). Chi nhánh lọc bằng nút lọc trên tiêu đề cột (ảnh có ô Chi nhánh riêng, chỉ có nghĩa ở `A00`).
- **Lưới lệnh cấp** (`DataGrid`, 100 dòng mỗi trang, mới tạo trước; ảnh để 10 dòng: Q13): Ngày tạo phiếu, Số lệnh cấp, Ngày cấp, Chi nhánh, Mã hàng, Tổng SL cấp, Người lập, Người cấp, Trạng thái (đỏ Chưa cấp, vàng Cấp 1 phần, xanh Cấp toàn phần), Ghi chú. Lọc, sắp xếp theo cột ở máy chủ.
- **Hàng nút:** Thêm mới, Sửa, Xóa, Xác nhận cấp, Hủy duyệt; nút khóa kèm lý do theo quyền, trạng thái lệnh đang chọn và khi đang nhập form. Xác nhận cấp, Hủy duyệt, Xóa có hộp xác nhận.
- **Khung dưới:** chọn lệnh thì xem chi tiết (Ngày cấp, Người lập, Người cấp, Ghi chú, lưới chỉ xem). Thêm mới, Sửa thì thành form: Ngày cấp (mặc định hôm nay theo máy chủ, không chọn ngày sau), Người lập (tài khoản đăng nhập, chỉ đọc), Ghi chú; thanh thêm dòng Chuyền sản xuất (cây sơ đồ tổ chức, `/me/lines`) → Mã hàng (đã phân màu cỡ cho chuyền) → Màu, Cỡ (chọn nhiều, để trống là tất cả) → Thêm vào lưới (mỗi màu cỡ một dòng, bỏ dòng đã có; Q11). Lưới `SheetGrid`: Chuyền sản xuất, Mã hàng, Màu sản phẩm, Cỡ sản phẩm, SL kế hoạch, SL đồng bộ, SL đã cấp, SL cấp trong ngày (ô nhập duy nhất), SL còn lại. Còn lại tính lại khi gõ; ô Còn lại âm, ô SL đồng bộ của màu cỡ vượt số đã cắt tô đỏ và khóa Lưu lại. Nút "Bỏ N dòng chưa nhập số" bỏ các dòng vừa thêm mà chưa có số. Lưu xong khung dưới về xem lệnh vừa lưu (khi lưu đúng một lệnh) và lưới trên tải lại.
- Đang nhập form: lưới lệnh thu nhỏ (`.supply-split[data-editing]` trong `global.css`), chọn lệnh khác hỏi bỏ thay đổi.
- Chỉ đọc khi: không có quyền Sửa, `A00`, cột SL cấp trong ngày không Sửa được theo chính sách cột. Cột Chuyền sản xuất hoặc Mã hàng bị Ẩn, Che: Thêm mới, Sửa bị khóa kèm lý do (khóa của dòng không đọc được). Dòng của lệnh đã xác nhận do máy chủ đánh dấu (`rows[].locked` của `sheet`), không suy từ Trạng thái, Mã hàng (có thể bị che).

### API `/cutting/supply`

| Phương thức, đường dẫn | Quyền | Nội dung |
|---|---|---|
| `GET /cutting/supply` | `view` | Lưới lệnh cấp (`page`, `pageSize` ≤ 200, `q`, `sort`, `createdFrom`, `createdTo`, `supplyNo`, `style`, `creator`, `status`, `cf`); trả thêm `today` |
| `GET /cutting/supply/values` | `view` | Giá trị một cột cho popup lọc |
| `GET /cutting/supply/export` | `export` | CSV theo chính sách cột |
| `GET /cutting/supply/options/styles?line=` | `view` | Mã hàng đã phân màu cỡ cho chuyền (`styleCode`, `productName`) |
| `GET /cutting/supply/options/color-sizes?line=&style=` | `view` | Màu, cỡ đã phân cho chuyền và mã hàng |
| `POST /cutting/supply/sheet` | `view` | `{ date, items: [{ line, style, colorName, sizeName }] }` trả `{ date, today, rows, supplies }`: số của các dòng theo Ngày cấp (mỗi dòng có thêm `locked`) và lệnh đã có của ngày đó (`id`, `supplyNo`, `styleCode`, `statusCode`, `locked`, `note`). Không ghi gì; `A00`: 403 |
| `PUT /cutting/supply` | `update` (thêm `create` khi phải tạo lệnh) | `{ date, note?, styles, items: [{ line, style, colorName, sizeName, dayQty }] }`; trả `saved` (lệnh tạo, sửa, tự bỏ) và lưới tính lại. 422: ngày sau hôm nay, gửi trùng, ngoài phân bổ, Còn lại âm, vượt SL đồng bộ. 409: lệnh đã xác nhận, phân bổ vừa đổi |
| `GET /cutting/supply/:id` | `view` | Chi tiết lệnh: đầu lệnh, `rows`, `canEdit`, `canDelete`, `canConfirm`, `canUnconfirm` |
| `POST /cutting/supply/:id/confirm` | `update` | Xác nhận cấp; 409 nếu đã xác nhận |
| `POST /cutting/supply/:id/unconfirm` | `update` | Hủy duyệt; 409 nếu chưa xác nhận |
| `DELETE /cutting/supply/:id` | `delete` | Xóa lệnh Chưa cấp |

Mỗi dòng (`rows`): `lineCode`, `lineName`, `styleCode`, `productName`, `colorName`, `sizeName`, `inPlan`, `planQty`, `syncQty`, `suppliedQty`, `dayQty`, `remainQty`, `otherLinesQty` (đã cấp mọi ngày cho chuyền khác cùng mã hàng, màu, cỡ: giao diện tự kiểm vượt SL đồng bộ).

### Phân quyền và chính sách cột (quyết định 13.10)

- Tài nguyên `cutting.supply`, `BRANCH`, bảng nguồn `CuttingSupply`, chiều `FACTORY → BranchCode` (không chiều Chuyền, Người tạo). Truy vấn qua `CuttingSupplyRepository` (`BaseRepository`) và `CuttingSupplyLineRepository` (`ChildRepository`); số tổng (đã cấp, đã cắt) tính theo ĐVCS của phiên hoặc của lệnh đã đọc trong phạm vi, chỉ trả số. `A00` chỉ đọc; lệnh ĐVCS khác: 404.
- Ma trận mẫu: Kế hoạch Xem, Thêm, Sửa, Xóa, Xuất; Quản trị Xem; Giám đốc Xem, Xuất; Toàn quyền đủ; Trưởng chuyền chưa xem. Máy đã cài: migration `MES_Core/0013` (chỉ cấp cho Kế hoạch khi còn quyền Xem).
- Cột đăng ký: `supplyNo`, `supplyDate`, `styleCode`, `creatorName`, `confirmerName`, `note`, `lineCode`, `planQty`, `syncQty`, `suppliedQty`, `dayQty`, `remainQty`, `statusCode`. `remainQty` che khi `planQty`, `suppliedQty` hoặc `dayQty` không xem được nguyên giá trị; `otherLinesQty` che khi `suppliedQty` không xem được. Mã chuyền bị Ẩn, Che thì không trả tên chuyền. Body lưu dùng khóa `line`, `style` (không bị chính sách của Chuyền, Mã hàng chặn), `dayQty`, `note` (bị cưỡng chế).

### Database (`MES_Cutting/0002_cutting_supply.sql`)

| Bảng | Cột chính | Ràng buộc, chỉ mục |
|---|---|---|
| `CuttingSupply` | `Id`, `SupplyNo`, `SupplyYear`, `SupplySeq`, `SupplyDate`, `StyleCode NVARCHAR(120)`, `Note NVARCHAR(500)`, `StatusCode` (`PENDING`, `PARTIAL`, `FULL`), `CreatorName`, `ConfirmedAt`, `ConfirmedBy`, `ConfirmerName`, `BranchCode` + bộ kiểm toán | `UNIQUE (Id, BranchCode)`, `(BranchCode, SupplyNo)`, `(BranchCode, SupplyYear, SupplySeq)`, `(BranchCode, SupplyDate, StyleCode)`; `CK_CuttingSupply_Confirm` (Chưa cấp thì chưa có người cấp, đã xác nhận thì phải có); `IX_CuttingSupply_Branch_Created`, `IX_CuttingSupply_Branch_Style`; `IX_CuttingSupply_CreatedBy`, `IX_CuttingSupply_ConfirmedBy` (`0003`) |
| `CuttingSupplyLine` | `CuttingSupplyId`, `LineCode VARCHAR(20)`, `ColorName`, `SizeName`, `Qty > 0`, `SortOrder`, `BranchCode` + bộ kiểm toán | FK ghép tới lệnh, xóa theo lệnh; `UNIQUE (CuttingSupplyId, LineCode, ColorName, SizeName)`; `IX_CuttingSupplyLine_Branch_Line (BranchCode, LineCode) INCLUDE (…)` |

Khóa ngầm (`softkeys.json`): `BranchCode` của hai bảng → `MES_Core.SysBranch.Code`; `CreatedBy`, `ConfirmedBy` → `MES_Core.SysUser.Id`; `CuttingSupplyLine.LineCode` → `MES_Hr.Department.Code` (cùng ĐVCS). Migration `MES_Cutting/0003_cutting_supply_indexes.sql` thêm chỉ mục cho hai khóa người dùng và `IX_CuttingPlan_Branch_Style (BranchCode, StyleCode)` cho SL đồng bộ.

### Nhật ký

`SysAuditLog`, entity `CuttingSupply`, ghi sau khi `MES_Cutting` commit: `CREATE` (lệnh mới kèm ô), `UPDATE` (ngày, ghi chú, ô cũ → mới), `DELETE` (xóa lệnh, hoặc lệnh tự bỏ khi mọi ô về 0), `CONFIRM`, `UNCONFIRM`.

### Script

- `reset:demo`, `load:bravo`: xóa cả lệnh cấp BTP (`clearCutting` trong `backend/scripts/cutting-data.ts`).
- `sim:board`: giữ kế hoạch mô phỏng có mã hàng đã cấp BTP ở ĐVCS của nó (`plansWithSupply`, theo mã hàng, rộng hơn theo chuyền), như kế hoạch có số cắt.

### Test

| File | Kiểm gì |
|---|---|
| `backend/test/cutting-supply.spec.ts` | `LineColorSizeFeed` (cộng mọi kế hoạch, lọc ĐVCS, `A00`); ô chọn mã hàng, màu cỡ; lưới theo ngày (Đã cấp các ngày khác, Còn lại, `otherLinesQty`); gom một lệnh mỗi ngày mỗi mã hàng, số lệnh; kiểm khi lưu (Còn lại âm, vượt SL đồng bộ, ngoài phân bổ, ngày tương lai, số âm, gửi trùng, giảm số luôn được); Xác nhận cấp (Cấp 1 phần, Cấp toàn phần), lệnh đã xác nhận không sửa, không xóa, Hủy duyệt; lệnh tự bỏ, Xóa lệnh; số lệnh khi tạo đồng thời; Phân bổ màu cỡ, Xếp chuyền không giảm dưới số đã cấp; phân quyền (`A00`, Giám đốc, Trưởng chuyền, ĐVCS khác, thiếu quyền Thêm); chính sách cột; xuất file |
| `backend/test/cutting-supply-grant-migration.spec.ts` | Migration `MES_Core/0013` |
| `frontend/src/test/cutting-supply-rules.test.ts` | Còn lại khi gõ, ô đã sửa, Còn lại âm, vượt SL đồng bộ (không đếm trùng dòng trong lưới), dòng chỉ xem, thêm dòng |

### Giới hạn hiện tại

- Chưa in lệnh cấp, chưa quét mã bó, chưa có bước chuyền may xác nhận nhận hàng; chưa cấp theo bó, bàn cắt.
- Lưới chi tiết hiện mọi dòng của lệnh, không phân trang như ảnh mẫu.
- Xác nhận cấp dùng quyền Sửa: chưa tách được người lập và người cấp bằng quyền.
- Màn Đồng bộ tiến độ cắt chưa chặn giảm, Xóa số cắt xuống dưới số đã cấp (Q37): SL đồng bộ có thể nhỏ hơn số đã cấp, ô SL đồng bộ tô đỏ ở form, chỉ giảm được số cấp.
- Hai lần lưu Phân bổ màu cỡ của hai kế hoạch cùng chuyền, cùng mã hàng chạy cùng lúc có thể bị SQL Server chọn một bên làm nạn nhân deadlock (409, lưu lại).
- Lệnh vừa tạo nằm ngoài trang đang xem của lưới trên (đang lọc, sắp xếp khác) thì không tự hiện chi tiết.
