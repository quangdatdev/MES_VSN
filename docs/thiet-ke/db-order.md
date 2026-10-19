# Thiết kế bảng `MES_Order` – module Đơn hàng (Phase 5.3)

Nguồn: migration `backend/migrations/MES_Order/0001_order_init.sql`, `0002_order_owner_index.sql`, `0003_order_bravo_source.sql`; ADR 0006. Quy ước như `db-core.md`: PascalCase, số ít, `DATETIME2(3)` UTC, bảng giao dịch có `BranchCode` (khóa ngầm tới `MES_Core.SysBranch.Code`, có index) và bộ cột `CreatedAt, CreatedBy, ModifiedAt, ModifiedBy`.

Bảng con mang `BranchCode` của cha qua khóa ngoại ghép `(ParentId, BranchCode)` → `UNIQUE (Id, BranchCode)` của cha: dòng con không thể khác nhà máy với dòng cha. Ngoại lệ (ADR 0013): kế hoạch → đơn hàng, PO được chọn → PO (`0005`) và PO → đơn hàng (`0008`) theo `Id`, vì kế hoạch, PO tay mang ĐVCS của phiên, có thể khác ĐVCS của đơn. `UQ_SalesOrder_IdBranch` không còn khóa ngoại nào dùng, bỏ ở migration sau.

## Bảng

| Bảng | Tài nguyên (màn) | Cột chính | Ghi chú |
|---|---|---|---|
| `SalesOrder` | `order.allocation` (Thông tin đơn hàng) | `OrderNo`, `CustomerName`, `StyleCode`, `Season`, `OrderType`, `ProductName`, `StaffName`, `Qty`, `UnitName`, **`UnitPrice`**, **`Amount`** (cột tính `Qty × UnitPrice`), **`CmPrice`**, `SyncedAt`, `ShipDate`, `StatusCode`, `ProductionFactoryCode`, `SourceProductId`, `SourceHash` | Cột in đậm là cột nhạy cảm (mặc định Ẩn). `BranchCode` hiển thị là "Chi nhánh FOB"; từ Phase 5.9 (ADR 0013) bảng dùng chung toàn công ty (`SHARED`), `BranchCode` chỉ là ĐVCS nguồn. `ProductionFactoryCode` ("Nhà máy SX", `MES_Order/0004`; `NVARCHAR(400)` từ `0007`) là một hoặc nhiều mã ở `MES_Core.SysProductionFactory` (khóa ngầm, `softkeys.json` khai `list`) cách nhau dấu phẩy, theo OSM (ADR 0013 mục 9); `IsFactoryFromOsm` = 1: lấy theo OSM, không sửa tay; = 0: người dùng chọn một nhà máy đang dùng (đơn chưa có trong OSM), NULL khi chưa chọn. Kế hoạch xuất hàng chỉ lập được cho đơn có ít nhất một nhà máy SX thuộc ĐVCS đang đăng nhập (ADR 0013 mục 11). `SourceProductId`: ProductId của BRAVO khi nạp từ bảng chép (mục Nạp từ BRAVO). `OrderNo` dạng `DH-A01-000123` (theo Id), duy nhất trong nhà máy |
| `SalesOrderPo` | `order.po` (Cập nhật tỷ lệ cắt) | `SalesOrderId`, `PoCode`, `PoNumber`, `CustomerName`, `StyleCode` (bản chụp), `Qty` (tổng màu cỡ), `Destination`, `PackingListCode`, `CustomsDeclarationNo`, `SyncedAt`, `ShipDate`, `StatusCode` (`DRAFT`, `CONFIRMED`), `ConfirmedAt`, `ConfirmedBy` | PO đã xác nhận khóa sửa màu cỡ. `PoNumber` `NVARCHAR(192)` từ `0007`. `BranchCode`: ĐVCS của đơn (PO nạp từ BRAVO) hoặc của người nhập tay. Màn Tỷ lệ cắt chỉ có PO trong kế hoạch xuất hàng của ĐVCS đăng nhập và PO nhập tay ở ĐVCS đó; ĐVCS có PO trong kế hoạch của mình sửa được PO như ĐVCS nguồn (ADR 0013 mục 11) |
| `SalesOrderPoColorSize` | con của `SalesOrderPo` | `ColorName`, `SizeName`, `Qty`, `SortOrder` | `UNIQUE (SalesOrderPoId, ColorName, SizeName)` |
| `ShipmentPlan` | `order.shipment` (Kế hoạch xuất hàng) **và** `order.lineplan` (Xếp chuyền) | `PlanNo`, `SalesOrderId`, `CustomerName`, `StyleCode`, `ProductName`, `OrderType` (bản chụp), `PoBuyDate` (chuỗi "PO/Buy date"), `PlanQty`, **`CmPrice`** (bản chụp), **`Revenue`** (cột tính `PlanQty × CmPrice`), `SyncedAt`, `ShipDate`, `PlannerName`, `CutQty`, `SewnQty`, `EndlineQty`, `FinishedQty`, `StatusCode` | Hai tài nguyên dùng chung bảng, quyền và cột riêng (ADR 0006) |
| `ShipmentPlanPo` | con của `ShipmentPlan` | `ShipmentPlanId`, `SalesOrderPoId` | PO đã chọn khi lập kế hoạch. `BranchCode` là ĐVCS của kế hoạch: "PO đang dùng ở ĐVCS" (quyền ghi PO, lọc màn Tỷ lệ cắt) tra theo chỉ mục `(SalesOrderPoId, BranchCode)` (`0008`) |
| `ShipmentPlanColorSize` | con của `ShipmentPlan` | `ColorName`, `SizeName`, `OriginalQty` (SL gốc lúc lập), `PlanQty` (SL KHXH) | |
| `ShipmentPlanLine` | con của `ShipmentPlan` ở Xếp chuyền; bảng chính của `order.colorsize` (Phân bổ màu cỡ) | `LineCode` (khóa ngầm tới `SysOrgUnit.Code`, chuyền cùng nhà máy), `Qty`, `AvgOutput`, `StartDate`, `ProductionDays`, `OffDays`, `EndDate`, `OutStartDate`, `OutEndDate`, `WarehouseStartDate`, `WarehouseEndDate`, `StatusCode` (`PLANNED`, `ALLOCATED`, `IN_PRODUCTION`, `DONE`) | Lọc theo chiều chuyền ở cả hai màn |
| `ShipmentPlanLineColorSize` | con của `ShipmentPlanLine` | `ColorName`, `SizeName`, `PlanQty` (đề xuất theo tỷ lệ), `AssignedQty` (SL giao) | |

## Chỉ mục
- Từ `0005` (Phase 5.9): khóa ngoại kế hoạch → đơn hàng, PO được chọn → PO theo `Id` (không còn ghép `BranchCode`): kế hoạch theo ĐVCS của phiên lập được cho đơn hàng dùng chung của ĐVCS khác. Khóa ngoại ghép PO → đơn hàng giữ nguyên (PO chỉ thêm ở ĐVCS của đơn; từ `0008` theo `Id`: PO tay mang ĐVCS của người nhập, có thể khác ĐVCS của đơn, ADR 0013 mục 11). Chỉ mục `SalesOrder (ProductionFactoryCode, ShipDate)` thay `(BranchCode, ProductionFactoryCode)` (bỏ ở `0007`: cột nay là danh sách, lọc bằng `STRING_SPLIT`); thêm `(CreatedAt DESC, Id DESC)` và `(CreatedBy)` ở `SalesOrder`, `SalesOrderPo`.
- Theo nhà máy + cột lọc chính: `(BranchCode, ShipDate DESC, Id DESC)` ở `SalesOrder`, `ShipmentPlan`; `(BranchCode, LineCode, StartDate)` ở `ShipmentPlanLine`.
- Theo người tạo (chiều phạm vi "chỉ của mình"): `(BranchCode, CreatedBy)` ở `SalesOrder`, `SalesOrderPo`, `ShipmentPlan`, `ShipmentPlanLine` (migration `0002`).
- Mỗi bảng con có index theo khóa tới cha.

## Khóa ngầm
Khai báo trong `backend/migrations/softkeys.json`, kiểm bằng `npm run check:softkeys -w backend` (chỉ đọc): `BranchCode` của 8 bảng → `SysBranch.Code`; `ShipmentPlanLine.LineCode` → `SysOrgUnit.Code` (loại `LINE`, cùng nhà máy); `SalesOrder.ProductionFactoryCode` → `SysProductionFactory.Code` (danh sách mã cách nhau dấu phẩy, `list`; cho phép NULL; trước Phase 5.9 là danh mục `PROD_FACTORY`); `CreatedBy`, `ConfirmedBy` → `SysUser.Id`.

## Chiều phạm vi gắn với tài nguyên (`SysResourceScopeBinding`)
| Tài nguyên | FACTORY | LINE | OWNER |
|---|---|---|---|
| `order.allocation`, `order.shipment`, `order.po`, `order.lineplan` | `BranchCode` | – | `CreatedBy` |
| `order.colorsize` | `BranchCode` | `LineCode` | `CreatedBy` |

Riêng dòng dàn chuyền đọc qua `order.lineplan` cũng lọc theo chuyền (khai báo `scopeColumns` ở `LinePlanLineRepository`, ADR 0006).

## Nạp từ BRAVO (bản xem dữ liệu thật, 10/10/2026)
Migration `0003_order_bravo_source.sql`: `StyleCode` thành `NVARCHAR(120)` (mã hàng thật có chữ tiếng Việt, dài hơn 100 ký tự), `ColorName` thành `NVARCHAR(100)` ở 3 bảng màu cỡ, thêm `SalesOrder.SourceProductId` (ProductId của BRAVO, duy nhất khi có; `NULL` là đơn nhập tay).

`npm run load:bravo -- --yes` (`backend/scripts/load-bravo-orders.ts`, chỉ SQL Server trên máy này) xóa **mọi** dữ liệu đơn hàng trong `MES_Order` rồi nạp từ bảng chép `bravo.*` của `MES_Sync` (không đọc database trung gian hay BRAVO). `npm run reset:demo -- --yes --bravo` đặt lại demo rồi nạp dữ liệu thật thay cho dữ liệu giả. Chạy lại cho cùng kết quả với cùng dữ liệu chép; nên bấm Đồng bộ trước.

Máy dùng thật không chạy `load:bravo`: từ 12/10/2026 backend tự **nạp tăng dần** sau mỗi đợt đồng bộ (ADR 0013 mục 8): thêm đơn, PO mới, cập nhật cột lấy từ BRAVO, giữ Nhà máy SX, đơn giá, kế hoạch, màu cỡ đã xác nhận hoặc đã vào kế hoạch; không xóa gì. Hai đường nạp dùng chung ánh xạ (`backend/src/modules/order/bravo-order.mapping.ts`) và câu đọc nguồn (`backend/src/platform/sync/bravo-order-source.ts`); vài chỗ khác nhau ghi ở ADR 0013 mục 8. Bật, tắt nạp tăng dần bằng `BRAVO_ORDER_IMPORT` (để trống: bật trên máy dùng thật, tắt trên máy demo, máy test).

Migration `0006_sales_order_source_hash.sql`: `SalesOrder.SourceHash CHAR(64) NULL`, SHA-256 (hex) các cột lấy từ BRAVO và cờ đóng lệnh ở lần nạp gần nhất. Nạp tăng dần dùng dấu này để biết BRAVO có đổi đơn (đổi thì ghi đè cả phần người dùng sửa, không đổi thì giữ). `NULL`: đơn nhập tay hoặc nạp trước 0006.

Đây vẫn là giả định tạm, chưa phải ánh xạ BA đã chốt (5.2.8): điểm BA chưa chốt (`anh-xa-bravo-don-hang.html`, mục Cần chốt) dùng giả định dưới đây, chốt xong thì sửa `bravo-order.mapping.ts`.

| Bảng MES | Lấy từ | Giả định, ghi chú |
|---|---|---|
| `SalesOrder` | `DM_SanPhamDonHang` (mỗi sản phẩm một đơn) | Trước khi nạp, chép ĐVCS theo danh mục chi nhánh BRAVO (Phase 5.9), rồi nạp mọi ĐVCS đang dùng trong `SysBranch` và sản phẩm có PO (cần ngày xuất). Nhà máy SX theo OSM (`MES_Sync.osm.OSMDataFty`, ghép số SO `Code` và mã hàng `StyleName`, ADR 0013 mục 9); OSM chưa có thì để trống, người dùng chọn ở Thông tin đơn hàng. Số đơn: phần trước " \| " của `Name`, trùng trong nhà máy thì thêm `-2`, `-3`. Khách: `TenTat` (câu 7). Loại: `ProductionTypeCode` – SXXK, GCND… (câu 2). Đơn giá, giá CM để trống (câu 4). Đơn vị: Cai → Cái, CHIEC → Chiếc, BO → Bộ. Đã đóng lệnh (`EndDatePrice`) → Hoàn thành; nạp cả đơn mẫu (câu 3). `CreatedBy` để trống (đơn của hệ thống nguồn) |
| `SalesOrderPo` | `ThongTinPO` | Một số PO tách nhiều dòng giao (khác ETD, nơi giao): gộp theo số PO, ngày xuất là ETD sớm nhất, nơi giao lấy theo dòng đó (điểm giao, không có thì quốc gia). Hàng nhận gia công chưa có PO riêng dùng PO của sản phẩm gốc (`ProductId_GC`): cộng ở `A00` sẽ đếm hai lần. Đơn đã đóng lệnh: PO "Đã xác nhận" |
| `SalesOrderPoColorSize` | `ThongTinPO_MauCo` | SL theo PO, không phải SL sau cân đối (câu 6). Loại cỡ khác REG ghép vào tên cỡ ("32 SHORT") thay vì thêm cột; thứ tự màu, cỡ theo BRAVO. Tên màu trùng giữa hai mã trong một PO thì kèm mã màu |
| `ShipmentPlan` và các bảng con | (mô phỏng) | BRAVO không có. Sinh bằng `backend/scripts/simulate-board.ts` (mục "Dàn chuyền mô phỏng" bên dưới). Bỏ bằng `--no-plans` |

### Dàn chuyền mô phỏng (`sim:board`)
Kế hoạch xuất hàng, dòng dàn chuyền và phân màu cỡ là dữ liệu MES tự lập; để bảng dàn chuyền có đủ tình huống khi demo, `simulate-board.ts` xếp kín mọi chuyền đang dùng (`SysOrgUnit`) quanh hôm nay. `load:bravo` gọi sau khi nạp; `npm run sim:board -- --yes` (chỉ SQL Server trên máy này) làm mới riêng phần này mà không nạp lại đơn hàng, ví dụ khi sang ngày mới hay sau khi thêm chuyền.

- **Khoảng xếp:** từ hôm nay − 42 ngày (thanh đã xong) tới hôm nay + 70 ngày (bảng mặc định xem tới hôm nay + 60). Nhà máy ít đơn thì thu khoảng lại, khoảng 1/3 là đã qua.
- **Chọn đơn:** đơn chưa có kế hoạch, chưa hủy, đang đúng trạng thái lúc nạp (xem "Trạng thái đơn" dưới đây). Đơn còn mở có ngày xuất gần hôm nay vào trước, đơn từ 600 sản phẩm trước. Thiếu đơn còn mở (dữ liệu BRAVO hiện có A02, A03 gần như không còn đơn mở gần hôm nay) thì dùng cả đơn đã đóng lệnh.
- **Ngày xuất của kế hoạch:** giữ ETD thật khi nằm trong 30 ngày sau ngày may xong, không thì ngày may xong + 7–10 ngày. Kế hoạch có thể khác ngày xuất của đơn.
- **Năng suất, số ngày:** 250–700 sp/ngày, mỗi thanh 2–14 ngày làm việc; một chuyền nhận tối đa 9.800 sản phẩm của một kế hoạch, phần dư chờ xếp. Số ngày SX, ngày kết thúc tính như màn Xếp chuyền (bỏ Chủ nhật, cộng ngày nghỉ).
- **Tình huống luôn có ở mỗi nhà máy đủ đơn:**
  - dòng đã xong, đang may, đã xếp và đã phân màu cỡ (đủ hoặc một phần), đã xếp chưa phân màu cỡ (có dòng vào chuyền trong 10 ngày tới);
  - chuyền trống giữa hai việc, một chuyền chờ việc 7–12 ngày ngay sau hôm nay, dòng có ngày nghỉ khác;
  - kế hoạch nhiều chuyền, xếp một phần, chưa xếp chuyền, đơn tách hai đợt xuất, may xong sau ngày xuất.
- **Trạng thái đơn:** đơn có kế hoạch mô phỏng mang trạng thái theo kế hoạch (Hoàn thành khi mọi kế hoạch xong, Đang sản xuất khi có kế hoạch đã vào chuyền, còn lại Đã lập kế hoạch). Xóa kế hoạch mô phỏng thì đơn không còn kế hoạch nào trở về trạng thái lúc nạp: Hoàn thành nếu nạp từ BRAVO và mọi PO "Đã xác nhận" bởi hệ thống (đã đóng lệnh), còn lại Mới. Vì vậy script chỉ chọn đơn đang đúng trạng thái đó; đơn người dùng tự đổi trạng thái không bị đụng. Đơn "Đã lập kế hoạch"/"Đang sản xuất" mà không có kế hoạch nào thì chỉ báo, không tự sửa.
- **Giữ nguyên khi chạy lại:** kế hoạch người dùng lập; kế hoạch mô phỏng người dùng đã sửa (kế hoạch, màu cỡ, dòng, phân màu cỡ có `ModifiedAt`; dòng thêm sau ở Xếp chuyền; dòng đã nhập ở Kế hoạch chuẩn bị SX), trừ khi chạy với `--all`. Thanh mô phỏng mới không xếp chồng lên dòng của chúng. Kế hoạch mô phỏng còn lại bị xóa; bản chép Kế hoạch chuẩn bị SX của dòng bị xóa tự bỏ ở lần mở màn kế tiếp (ADR 0009).
- **Kế hoạch đã may xong** luôn xếp đủ SL: chuyền kín hay vượt sức một chuyền thì phần dư thành kế hoạch chưa xếp chuyền của cùng đơn.
- Đơn đã đóng lệnh được dùng cho kế hoạch chưa xong thì đổi sang Đã lập kế hoạch/Đang sản xuất, nên hiện lại ở popup "Chọn mã hàng" của Kế hoạch xuất hàng. Chấp nhận vì là dữ liệu mô phỏng; nạp lại bằng `load:bravo` là về đúng.
- Chạy trong một transaction cho mọi nhà máy (khoảng 15 giây trên máy dev): backend đang chạy thì các màn đơn hàng chờ tới khi xong. Ghi `SysAuditLog` `BOARD_SIMULATE`.

Ngoại lệ tạm của bản nạp này:
- Script `load:bravo` đọc thẳng bảng chép trong `MES_Sync` (script chạy tay, không phải code module). Bước nạp tăng dần trong backend đi đúng ADR 0007: module Đơn hàng đọc qua `SourceFeedService`.
- `SalesOrder.SyncedAt`: lần chép gần nhất của sản phẩm, PO, màu cỡ của đơn (chỉ để hiện). Không dùng để biết BRAVO có đổi đơn: nguồn chép theo nhóm (PO, màu cỡ) chép lại cả nhóm với mốc mới dù nội dung không đổi; dùng `SourceHash`.
- `SourceProductId` không khai báo trong `softkeys.json`: nó trỏ tới dòng của hệ thống nguồn (bảng chép có thể xóa dòng khi BRAVO xóa), không phải khóa ngầm giữa hai database MES, và `check-softkeys` không đọc được schema `bravo`.

Sau khi nạp, database chứa dữ liệu thật trong khi backend mặc định nghe mọi địa chỉ (`HOST=0.0.0.0`) và tài khoản demo dùng chung `DEMO_PASSWORD`: đặt `HOST=127.0.0.1` hoặc đổi mật khẩu demo mạnh (`npm run seed -- --reset-passwords`). Script in nhắc nhở này sau mỗi lần nạp.

Các test có ghi dữ liệu trong `backend/test/phase5.spec.ts` dùng đơn hàng riêng (`TEST-P5-FIXTURE`, tạo và xóa trong test). Một số test chỉ đọc vẫn cần dữ liệu có sẵn (có đơn hàng ở A01, A02), nên chạy được trên cả dữ liệu giả của seed và dữ liệu BRAVO.
