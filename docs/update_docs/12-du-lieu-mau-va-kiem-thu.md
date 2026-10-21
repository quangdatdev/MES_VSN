# Dữ liệu mẫu và kiểm thử

File này mô tả dữ liệu do seed nạp (dữ liệu hệ thống và dữ liệu mẫu), ma trận quyền mẫu, tài khoản demo, kịch bản demo, kịch bản kiểm thử phân quyền bằng tay và bộ test tự động.
Đọc khi chuẩn bị demo, khi cần biết một tài khoản mẫu thấy gì, khi sửa `backend/scripts/seed-data.ts`, hoặc trước khi chạy test.
Cách chạy lệnh `migrate`, `seed`, `reset:demo` và các chốt an toàn: [Vận hành](11-van-hanh.md). Ý nghĩa các lớp quyền: [Phân quyền](04-phan-quyen.md).

## Hai loại dữ liệu seed

Nguồn: `backend/scripts/seed-data.ts` (khai báo), `backend/scripts/seed.ts` (`runSeed`), `seed-order.ts` (đơn hàng giả), `hr-data.ts` (nhân sự), `sewing-data.ts`. `npm run migrate` luôn gọi seed **không** dữ liệu mẫu; `npm run seed` thêm dữ liệu mẫu khi `SEED_SAMPLE_DATA=true` (mặc định trừ khi `NODE_ENV=production`).

| Phần | Luôn nạp (dữ liệu hệ thống) | Chỉ khi có dữ liệu mẫu |
|---|---|---|
| Đơn vị cơ sở (`SysBranch`) | `A00` Toàn công ty (đơn vị tổng hợp); ĐVCS chép từ danh mục chi nhánh BRAVO nếu `MES_Sync` đã đồng bộ | `A01`, `A02`, `A03` |
| Vai trò (`SysRole`) | 8 vai trò hệ thống, kể cả Toàn quyền | – |
| Tài nguyên, quyền, menu | 34 tài nguyên × 5 hành động = 170 quyền; 8 nhóm menu, 34 mục menu | – |
| Ma trận quyền, chính sách cột của vai trò | Theo bảng mẫu bên dưới | – |
| Phạm vi dữ liệu của tài nguyên, cột đăng ký | Có | – |
| Cây tổ chức (`SysOrgUnit`) | Nút gốc cho mỗi ĐVCS đang có, không phải tổng hợp (ĐVCS chép từ BRAVO thì bước chép tạo nút gốc). Không tạo nút Xưởng, Chuyền | – |
| Danh mục (`SysCatalog`, `SysCatalogItem`, `SysShift`) | Đơn vị tính, Loại đơn hàng, 4 ca làm việc | – |
| Nhà máy SX (`SysProductionFactory`) | – | `A01`, `A01-B`, `A02`, `A03` |
| Lịch làm việc (`SysWorkCalendar`, `SysWorkCalendarDay`) | – (ĐVCS chưa có lịch dùng lịch mặc định trong code) | Mỗi ĐVCS mẫu chưa có lịch: lịch mặc định kèm ngày lễ, Tết 2026–2027 gần đúng ghi "(mẫu)"; `A01` thêm Chủ nhật làm bù 15/11/2026, `A02` thêm ngày nghỉ riêng 20/11/2026 (`workCalendarSample` ở `seed-data.ts`). `reset:demo` xóa mọi lịch, seed nạp lại |
| Tài khoản | `admin` | 7 tài khoản demo còn lại |
| `MES_Order` | – | Đơn hàng, PO, kế hoạch, dàn chuyền giả |
| `MES_Sewing` | Danh mục bước chuẩn bị SX `CB01`–`CB16` | – |
| `MES_Hr` | 5 loại phòng ban, 7 chức danh dùng chung | Phòng ban (kể cả xưởng, chuyền may mẫu), chức danh theo phòng ban, 40 nhân viên giả |

Quy tắc chạy lại (chỉ thêm phần thiếu, phần nào luôn đồng bộ theo code, không cấp lại quyền đã thu hồi): [Vận hành › Seed](11-van-hanh.md#seed).

## Dữ liệu hệ thống

### Đơn vị cơ sở

| Mã | Tên | Tổng hợp | Ghi chú |
|---|---|---|---|
| `A00` | Toàn công ty | Có | Luôn có. Xem mọi ĐVCS, chỉ đọc dữ liệu theo ĐVCS, không gắn dữ liệu |
| `A01` | Nhà máy 1 | Không | Mẫu |
| `A02` | Nhà máy 2 | Không | Mẫu |
| `A03` | Nhà máy 3 | Không | Mẫu |

Có `MES_Sync.bravo.DM_CHINHANH` thì seed thêm mã còn thiếu và đổi tên ĐVCS theo BRAVO (`backend/scripts/bravo-branches.ts`, ADR 0013). Thứ tự hiển thị theo `SortOrder` 0, 10, 20, 30.

### Vai trò

Thứ tự trong bảng là `SortOrder` 10, 20, … 80. Mọi vai trò seed là vai trò hệ thống (`IsSystem = 1`): không xóa được ở màn Vai trò.

| Mã | Tên | Mô tả |
|---|---|---|
| `ADMIN` | Quản trị hệ thống | Quản lý người dùng, vai trò, phân quyền; chỉ xem dữ liệu nghiệp vụ (tách nhiệm vụ, ADR 0004) |
| `DIRECTOR` | Giám đốc | Xem và xuất mọi nghiệp vụ, kể cả Doanh thu; không tạo, sửa |
| `PLANNER` | Kế hoạch | Toàn quyền khối Đơn hàng; lập kế hoạch may và hoàn thiện |
| `LINE_LEADER` | Trưởng chuyền | Phân cụm, bấm năng suất, ghi tiến độ gấp xếp, đóng thùng; phân màu cỡ cho chuyền mình |
| `QC` | Kiểm hàng | Danh mục lỗi, kiểm Endline, báo cáo chất lượng |
| `ACCOUNTANT` | Kế toán | Xem và xuất đơn hàng, doanh thu; thấy giá nhưng không sửa |
| `HR` | Nhân sự | Quản lý sơ đồ tổ chức và hồ sơ nhân viên; không xem nghiệp vụ sản xuất (ADR 0012) |
| `FULL_ACCESS` | Toàn quyền | Mọi quyền xem, thêm, sửa, xóa, xuất file và quản trị; thấy, sửa mọi cột nhạy cảm. Vẫn theo luật chung (ADR 0014) |

### Tài nguyên, quyền, menu

- Mỗi tài nguyên trong `resources` của `seed-data.ts` sinh một dòng `SysResource`, 5 quyền `SysPermission` mã `<tài nguyên>:<hành động>` với hành động `view`, `create`, `update`, `delete`, `export` (tên quyền dạng "Xem: Thông tin đơn hàng"), và một mục menu lá `menu.<tài nguyên>` dưới nhóm `menu.<module>`.
- 8 nhóm menu theo thứ tự: `order` Quản trị đơn hàng, `cutting` Quản trị nhà cắt, `sewing` Quản trị xưởng may, `qms` Quản trị chất lượng, `finishing` Quản trị hoàn thiện, `hr` Quản trị nhân sự, `report` Báo cáo quản trị, `admin` Quản trị.
- Mục menu đánh dấu điện thoại (`SysMenu.IsMobile`): `sewing.cluster`, `sewing.output`, `qms.endline`.
- Danh sách màn, đường dẫn, màn nào đã có nội dung: [Tổng quan](../PROJECT_OVERVIEW.md) mục 2.2.

<a id="ma-tran-quyen-mau"></a>

### Ma trận quyền mẫu

Ký hiệu: **V** xem, **C** thêm, **U** sửa, **D** xóa, **E** xuất file, `–` không có. Không có quyền xem thì các hành động khác của tài nguyên cũng không dùng được. Cột Phạm vi: **B** theo ĐVCS (`BRANCH`), **S** dùng chung toàn công ty (`SHARED`); mặc định nhóm `admin` là S, còn lại là B. Thứ tự cột vai trò theo `ROLE_ORDER`; cột Toàn quyền tính theo quy tắc riêng (mục dưới), không có trong `matrix` của `seed-data.ts`.

| Tài nguyên | Màn | Phạm vi | ADMIN | DIRECTOR | PLANNER | LINE_LEADER | QC | ACCOUNTANT | HR | Toàn quyền |
|---|---|---|---|---|---|---|---|---|---|---|
| `order.allocation` | Thông tin đơn hàng | S | V | VE | VCUDE | – | – | VE | – | VCUDE |
| `order.poallocation` | Phân bổ PO | S | V | VE | VUE | – | – | VE | – | VCUDE |
| `order.shipment` | Kế hoạch xuất hàng | B | V | VE | VCUDE | – | – | VE | – | VCUDE |
| `order.po` | Cập nhật tỷ lệ cắt | S | V | VE | VCUDE | V | – | VE | – | VCUDE |
| `order.lineplan` | Xếp chuyền | B | V | VE | VCUDE | V | – | VE | – | VCUDE |
| `order.colorsize` | Phân bổ màu cỡ | B | V | VE | VCUDE | VU | – | VE | – | VCUDE |
| `order.prep` | Kế hoạch chuẩn bị SX | B | V | VE | VUE | V | – | – | – | VCUDE |
| `cutting.progress` | Đồng bộ tiến độ cắt | B | V | VE | VUE | V | – | – | – | VCUDE |
| `cutting.supply` | Xác nhận cấp BTP | B | V | VE | VCUDE | – | – | – | – | VCUDE |
| `cutting.embroidery` | Quản lý in thêu | B | V | VE | V | – | – | – | – | VCUDE |
| `sewing.plan` | Kế hoạch may | B | V | VE | VCUE | V | – | – | – | VCUDE |
| `sewing.cluster` | Phân cụm trưởng | B | V | VE | V | VCU | – | – | – | VCUDE |
| `sewing.output` | Bấm năng suất cụm | B | V | VE | V | VCU | V | – | – | VCUDE |
| `sewing.balance` | Biểu đồ cân bằng chuyền | B | V | VE | V | V | – | – | – | VCUDE |
| `qms.defect` | Danh mục lỗi | B | V | VE | V | V | VCUD | – | – | VCUDE |
| `qms.endline` | Kiểm Endline | B | V | VE | V | V | VCUE | – | – | VCUDE |
| `qms.report` | Báo cáo chất lượng | B | V | VE | V | V | VE | – | – | VCUDE |
| `finishing.plan` | Kế hoạch hoàn thiện | B | V | VE | VCUE | V | – | – | – | VCUDE |
| `finishing.folding` | Tiến độ gấp xếp | B | V | VE | V | VCU | – | – | – | VCUDE |
| `finishing.packing` | Tiến độ đóng thùng | B | V | VE | V | VCU | – | – | – | VCUDE |
| `hr.orgchart` | Sơ đồ tổ chức | S | V | VE | – | – | – | – | VCUE | VCUDE |
| `hr.employee` | Thông tin nhân sự | S | V | VE | – | – | – | – | VCUE | VCUDE |
| `report.prepare` | Kế hoạch chuẩn bị sản xuất | B | V | VE | VE | – | – | – | – | VCUDE |
| `report.progress` | Tiến độ sản xuất | B | V | VE | VE | – | – | VE | – | VCUDE |
| `report.revenue` | Doanh thu nhà máy | B | V | VE | – | – | – | VE | – | VCUDE |
| `report.hourly` | Sản lượng theo giờ | B | V | VE | V | V | – | – | – | VCUDE |
| `admin.user` | Người dùng | S | VCUD | – | – | – | – | – | – | VCUD |
| `admin.role` | Vai trò | S | VCUD | – | – | – | – | – | – | VCUD |
| `admin.permission` | Phân quyền | S | VU | – | – | – | – | – | – | VU |
| `admin.fieldpolicy` | Chính sách cột | S | VU | – | – | – | – | – | – | VU |
| `admin.branch` | Đơn vị cơ sở | S | VCU | – | – | – | – | – | – | VCU |
| `admin.catalog` | Danh mục hệ thống | S | VCU | – | – | – | – | – | – | VCU |
| `admin.audit` | Nhật ký hệ thống | S | VE | – | – | – | – | – | – | VE |
| `admin.sync` | Đồng bộ dữ liệu | S | VU | – | – | – | – | – | – | VU |

Ghi chú:

- `order.prep` không có Thêm, Xóa: dòng do hệ thống chép từ Xếp chuyền (ADR 0009). `hr.*`, `admin.catalog` không có Xóa: phòng ban giải thể, nhân viên nghỉ việc, danh mục ngừng dùng.
- `admin.sync`: Xem là theo dõi, Sửa là bấm chạy đồng bộ.
- `cutting.progress`: Sửa là nhập số cắt trong ngày, Xóa là Xóa số cắt của một kế hoạch (mẫu chỉ Toàn quyền có); không có Thêm: dòng do hệ thống chép từ kế hoạch xuất hàng (quyết định 13.5). Máy đã cài nhận Sửa, Xuất của Kế hoạch qua migration `MES_Core/0012_grant_cutting_progress.sql`.
- `cutting.supply`: Thêm là tạo lệnh cấp mới khi lưu; Sửa là lưu số cấp của lệnh đã có, Xác nhận cấp, Hủy duyệt; Xóa là xóa lệnh Chưa cấp (quyết định 13.10). Máy đã cài nhận Thêm, Sửa, Xóa, Xuất của Kế hoạch qua migration `MES_Core/0013_grant_cutting_supply.sql`.
- `sewing.plan`: Sửa là Cập nhật, Chốt, Hủy chốt; lập Kế hoạch may lần đầu cho một chuyền trong ngày cần thêm quyền Thêm (`backend/src/modules/sewing/sewing-plan.service.ts`); màn không có Xóa (dòng lấy từ Xếp chuyền).
- `order.poallocation`: Sửa là đổi Nhà máy SX (không có Thêm, Xóa trên màn; dòng do bước làm mới theo OSM chép vào). Máy đã cài có sẵn quyền `order.poallocation:update` trong database nên seed không nạp lại ô này của ma trận: migration `MES_Core/0010_grant_poallocation_update.sql` cấp cho vai trò hệ thống `PLANNER`, `FULL_ACCESS` (nếu chưa có), ghi nhật ký `ROLE_PERMISSIONS`, tăng phiên bản quyền.
- Ma trận chỉ nạp cho vai trò, quyền mới tạo; quản trị đổi ở màn Phân quyền thì seed chạy lại không ghi đè (trừ `--sync-matrix`, `reset:demo`).

<a id="vai-tro-toan-quyen"></a>

### Vai trò Toàn quyền

Quyết định: ADR 0014. Cách tính quyền thực tế khi một người có nhiều vai trò, trần quyền quản trị, luật `A00`: [Phân quyền](04-phan-quyen.md).

- **Quyền** (`fullAccessLetters`, `backend/scripts/seed-data.ts`): tài nguyên nghiệp vụ được `VCUDE`; tài nguyên `admin.*` đúng bằng chữ của ADMIN trong `seed-data.ts`, **và chỉ những quyền vai trò `ADMIN` đang có trong database lúc cấp**. Lý do: người thao tác chỉ gán, sửa được vai trò có quyền `admin.*` mà chính mình có (trần quyền quản trị, ADR 0004); giữ phần giao để người giữ ADMIN vẫn gán, gỡ được Toàn quyền.
- **Cột**: mọi cột nhạy cảm (`S` trong `resourceFields`) mức Sửa được. Cột tính sẵn (Thành tiền, Doanh số) vẫn không nhập được.
- **Phạm vi**: phép gán không kèm phạm vi.
- **Tạo** (`bootstrapFullAccess`, bước 9b của `runSeed`, `backend/scripts/seed.ts`): chưa có vai trò thì seed tạo **một lần**, trong một transaction: vai trò (`IsSystem = 1`), quyền theo `fullAccessLetters`, chính sách cột, phép gán cho `admin` đã có (nếu đủ điều kiện), nhật ký `SEED` (`EntityType = SysRole`), tăng phiên bản quyền. Bước tạo vai trò thường (bước 2), ma trận (bước 5), chính sách cột (bước 9) bỏ qua vai trò này khi nó chưa có. Vai trò đã có thì chỉ nhận quyền của tài nguyên, cột thêm sau.
- **Gán cho `admin`** (khai `extraRoles` trong `users`): máy đã có `admin` thì gán ngay lúc tạo vai trò (bước 9b); máy cài mới thì gán khi seed tạo tài khoản `admin` (bước 10); `--sync-matrix` / `reset:demo` thì gán lại ở bước 10. Điều kiện: tài khoản đang hoạt động và đang giữ `ADMIN` không kèm phạm vi, còn hiệu lực; không thì in cảnh báo "Không gán vai trò Toàn quyền…", không gán. Vai trò đã có thì seed chạy thường không gán lại, kể cả khi quản trị đã gỡ khỏi `admin`.
- Máy đã có vai trò người dùng tự tạo trùng mã `FULL_ACCESS` (không phải vai trò hệ thống): seed cảnh báo, không cấp quyền, không gán.

### Phạm vi dữ liệu của tài nguyên và cột đăng ký

Ý nghĩa Resource Registry, chiều phạm vi, mức cột: [Phân quyền](04-phan-quyen.md).

Bảng nguồn (`SysResource.SourceTable`) và chiều phạm vi gắn cột (`SysResourceScopeBinding`, khai ở `scopeBindings`):

| Tài nguyên | Bảng nguồn | Chiều phạm vi → cột |
|---|---|---|
| `order.allocation` | `SalesOrder` | `OWNER` → `CreatedBy` |
| `order.poallocation` | `PoAllocation` | – |
| `order.shipment` | `ShipmentPlan` | `FACTORY` → `BranchCode`, `OWNER` → `CreatedBy` |
| `order.po` | `SalesOrderPo` | `OWNER` → `CreatedBy` |
| `order.lineplan` | `ShipmentPlan` | `FACTORY` → `BranchCode`, `OWNER` → `CreatedBy` |
| `order.colorsize` | `ShipmentPlanLine` | `FACTORY` → `BranchCode`, `LINE` → `LineCode`, `OWNER` → `CreatedBy` |
| `order.prep` | `SewingPrep` | `FACTORY` → `BranchCode`, `LINE` → `LineCode` |
| `cutting.progress` | `CuttingPlan` | `FACTORY` → `BranchCode` |
| `cutting.supply` | `CuttingSupply` | `FACTORY` → `BranchCode` |
| `sewing.plan` | `SewingDayPlan` | `FACTORY` → `BranchCode`, `LINE` → `LineCode` |
| `hr.orgchart` | `Department` | – |
| `hr.employee` | `Employee` | – |

Cột đăng ký (`SysResourceField`, khai ở `resourceFields`; mã trùng khóa JSON của API). Cột đánh dấu **(nhạy cảm)** mặc định Ẩn khi vai trò không khai chính sách.

| Tài nguyên | Cột |
|---|---|
| `order.allocation` | `orderNo` Số đơn, `customerName` Khách hàng, `styleCode` Mã hàng, `season` Season, `orderType` Loại, `productName` Tên sản phẩm, `productionFactoryCode` Nhà máy SX, `staffName` Nhân viên lập, `qty` Số lượng, `unitName` Đơn vị tính, `unitPrice` Đơn giá **(nhạy cảm)**, `amount` Thành tiền **(nhạy cảm)**, `cmPrice` Giá CM **(nhạy cảm)**, `syncedAt` Ngày đồng bộ, `shipDate` Ngày xuất hàng, `statusCode` Trạng thái |
| `order.poallocation` | `brand`, `season`, `po`, `so`, `shipMode`, `styleName`, `styleNo`, `color` Màu, `etdActual` ETD-Actual, `etdRevised` ETD-Revised, `factoryName` Nhà máy SX, `branchCode` Đơn vị cơ sở, `isFactoryManual` Nhập tay, `osmFactoryName` Nhà máy SX theo OSM, `isInOsm` Còn trong OSM |
| `order.shipment` | `planNo` Số kế hoạch, `customerName`, `styleCode`, `productName`, `poBuyDate` PO/Buy date, `syncedAt`, `shipDate`, `plannerName` Nhân viên lập, `planQty` Số lượng KH, `cutQty` LK cắt, `sewnQty` LK May ra, `endlineQty` LK Endline, `finishedQty` LK Hoàn thiện, `statusCode` |
| `order.po` | `poCode` Mã PO, `poNumber` PO#, `customerName`, `styleCode`, `qty`, `syncedAt`, `shipDate`, `destination` Đích đến, `packingListCode` Mã PKL, `customsDeclarationNo` Số tờ khai, `statusCode` |
| `order.lineplan` | `planNo`, `customerName`, `styleCode`, `orderType` Loại đơn hàng, `poBuyDate`, `planQty` SL kế hoạch, `scheduledQty` SL đã xếp chuyền, `remainingQty` SL còn lại, `cmPrice` Giá CM **(nhạy cảm)**, `revenue` Doanh số **(nhạy cảm)**, `syncedAt`, `startDate` Ngày bắt đầu SX, `endDate` Ngày kết thúc SX, `shipDate`, `statusCode` |
| `order.colorsize` | `customerName`, `styleCode`, `poBuyDate`, `lineCode` Chuyền may, `startDate` Ngày bắt đầu chuyền, `avgOutput` NSBQ chuyền, `endDate` Ngày kết thúc chuyền, `shipDate`, `qty` Số lượng kế hoạch, `assignedQty` Số lượng giao, `statusCode` |
| `order.prep` | `lineCode` Tổ SX, `planNo`, `customerName`, `styleCode`, `productName`, `styleType` Loại mã, `lineQty` SL của chuyền, `confirmedQty` Số lượng chốt UD, `priorityFactor` HS Ưu đãi VC, `startDate` Ngày vào chuyền, `steps` Các bước chuẩn bị (KH, TH), `statusCode` |
| `cutting.progress` | `planNo` Số kế hoạch, `customerName`, `styleCode`, `productName`, `poBuyDate`, `shipDate`, `planQty` Số lượng KH, `dayQty` Trong ngày, `cutQty` Lũy kế cắt, `diffQty` +/-, `lastCutDate` Ngày cắt gần nhất, `statusCode` |
| `cutting.supply` | `supplyNo` Số lệnh cấp, `supplyDate` Ngày cấp, `styleCode` Mã hàng, `creatorName` Người lập, `confirmerName` Người cấp, `note` Ghi chú, `lineCode` Chuyền sản xuất, `planQty` Số lượng kế hoạch, `syncQty` Số lượng đồng bộ, `suppliedQty` Số lượng đã cấp, `dayQty` Số lượng cấp trong ngày, `remainQty` Số lượng còn lại, `statusCode` Trạng thái |
| `sewing.plan` | `lineCode` Tổ SX, `styleCode` Mã hàng, `poBuyDate` PO/Buy date, `cmPrice` Giá CM **(nhạy cảm)**, `startDate` Ngày vào chuyền, `endDate` Ngày kết thúc, `planQty` Tổng kế hoạch, `deliveredQty` Đã giao, `remainQty` Còn lại, `linemapQty` Kế hoạch theo linemap, `dayQty` Kế hoạch ngày xưởng giao, `planRevenue` Doanh số kế hoạch **(nhạy cảm)**, `startTime` Từ giờ, `endTime` Đến giờ |
| `hr.employee` | `email`, `birthPlace` Nơi sinh, `hometown` Nguyên quán, `birthDate` Ngày sinh **(nhạy cảm)**, `idNumber` Số CMND/CCCD **(nhạy cảm)**, `contactPhone` Điện thoại liên lạc **(nhạy cảm)**, `contactPerson` Người liên hệ **(nhạy cảm)**, `currentAddress` Địa chỉ hiện tại **(nhạy cảm)** |

`hr.employee` chỉ đăng ký thông tin cá nhân: mã, tên, phòng ban, chức danh, tình trạng là khung của màn, ẩn đi thì không lưu được hồ sơ.

<a id="chinh-sach-cot-mau"></a>

### Chính sách cột mẫu

`roleFieldPolicies` trong `seed-data.ts`. Mức: Ẩn (`HIDDEN`), Che (`MASKED`, trả `***`), Chỉ đọc (`READONLY`), Sửa được (`EDITABLE`). Vai trò không khai thì cột nhạy cảm Ẩn.

| Vai trò | Tài nguyên | Cột | Mức |
|---|---|---|---|
| `DIRECTOR`, `ACCOUNTANT` | `order.allocation` | `unitPrice`, `amount`, `cmPrice` | Chỉ đọc |
| `DIRECTOR`, `ACCOUNTANT` | `order.lineplan` | `cmPrice`, `revenue` | Chỉ đọc |
| `DIRECTOR`, `PLANNER` | `sewing.plan` | `cmPrice`, `planRevenue` | Chỉ đọc (Giá CM nhập ở Thông tin đơn hàng) |
| `PLANNER` | `order.allocation` | `unitPrice`, `amount` | Chỉ đọc |
| `PLANNER` | `order.allocation` | `cmPrice` | Sửa được |
| `PLANNER` | `order.lineplan` | `cmPrice`, `revenue` | Chỉ đọc |
| `LINE_LEADER` | `order.lineplan`, `order.colorsize`, `order.po`, `order.prep` | `customerName` | Che |
| `HR` | `hr.employee` | `birthDate`, `idNumber`, `contactPhone`, `contactPerson`, `currentAddress` | Sửa được |
| `DIRECTOR` | `hr.employee` | 5 cột trên | Che |
| `FULL_ACCESS` | mọi tài nguyên | mọi cột nhạy cảm | Sửa được |

- `ADMIN`, `QC`, `ACCOUNTANT` (ở `hr.employee`) không khai: cột nhạy cảm Ẩn. `LINE_LEADER` ở `sewing.plan` không khai: Giá CM, Doanh số kế hoạch Ẩn. Tài khoản `quantri` dùng để minh họa "quản trị chỉ xem, không thấy giá".
- Chính sách tính theo tài nguyên: màn nào có cùng dữ liệu thì phải khai ở màn đó. Seed che tên khách hàng với Trưởng chuyền ở bốn màn Xếp chuyền, Phân bổ màu cỡ, Cập nhật tỷ lệ cắt, Kế hoạch chuẩn bị SX. Đồng bộ tiến độ cắt (`cutting.progress`) cũng có cột `customerName` và Trưởng chuyền có quyền Xem, nhưng `roleFieldPolicies` không khai cột này nên ở màn đó Trưởng chuyền thấy rõ tên khách.
- Kế hoạch không bị Che Doanh số vì thấy số lượng và giá CM nên tự tính ra được.

### Danh mục và ca làm việc

| Danh mục | Mục (mã: tên) |
|---|---|
| `UNIT` Đơn vị tính | `CAI` Cái, `CHIEC` Chiếc, `BO` Bộ, `PCS` PCS, `SET` Set. Mã là mã đơn vị bên BRAVO (viết hoa không dấu); đơn hàng lưu tên |
| `ORDER_TYPE` Loại đơn hàng | `SXXK` Sản xuất xuất khẩu, `GCXK` Gia công xuất khẩu, `GCND` Gia công nội địa, `GCND-1P` Gia công nội địa 1 phần, `SXND` Sản xuất nội địa |

| Ca | Tên | Giờ | Nghỉ (phút) |
|---|---|---|---|
| `HC` | Hành chính | 07:30–16:30 | 60 |
| `CA1` | Ca 1 | 06:00–14:00 | 30 |
| `CA2` | Ca 2 | 14:00–22:00 | 30 |
| `CA3` | Ca 3 (qua đêm) | 22:00–06:00 | 30 |

Mục danh mục và ca seed tạo với `IsSystem = 0`: sửa, ngừng dùng được ở Quản trị › Danh mục hệ thống.

### Danh mục bước chuẩn bị SX (`MES_Sewing.PrepStep`)

16 bước `CB01`–`CB16` (`prepSteps` trong `seed-data.ts`): tên, số ngày kế hoạch, người thực hiện, nguồn dữ liệu, ví dụ `CB01` Họp đánh giá rủi ro (0 ngày, P.Công nghệ), `CB09` Thiết kế chuyền (0 ngày, NV TKC), `CB16` Tài liệu kỹ thuật (1 ngày, P.Kỹ thuật). Seed chỉ thêm bước còn thiếu theo mã, không sửa bước đã có. Ý nghĩa: [May](07-may.md).

### Danh mục nhân sự dùng chung (`MES_Hr`)

- Loại phòng ban (mã, tên, cấp): `CONG_TY` Công ty (1), `KHOI` Khối (2), `NHA_MAY` Nhà máy (2), `PHONG` Phòng (3), `BO_PHAN` Bộ phận (4, cấp cuối).
- Chức danh dùng chung: `GD` Giám đốc, `PGD` Phó giám đốc, `TP` Trưởng phòng, `NV` Nhân viên, `QDNM` Quản đốc nhà máy, `TT` Tổ trưởng, `CNM` Công nhân may.

Hai danh mục này luôn nạp vì thiếu thì không thêm được phòng ban, nhân viên nào. Ý nghĩa: [Nhân sự](08-nhan-su.md).

## Dữ liệu mẫu (`SEED_SAMPLE_DATA=true`)

Toàn bộ là dữ liệu giả: tên người, khách hàng hư cấu; số CCCD đầu `999`, điện thoại đầu `0900`, email miền `.example`.

### Nhà máy SX mẫu

| Mã | Tên | ĐVCS |
|---|---|---|
| `A01` | Nhà máy 1 | `A01` |
| `A01-B` | Nhà máy 1B | `A01` |
| `A02` | Nhà máy 2 | `A02` |
| `A03` | Nhà máy 3 | `A03` |

`A01` có hai nhà máy để thấy một ĐVCS nhiều nhà máy. Chọn mã hàng khi lập kế hoạch xuất hàng lọc theo mọi nhà máy SX thuộc ĐVCS đang đăng nhập (ADR 0013 mục 11, [Đơn hàng](06-don-hang.md)); không có phép gán nhà máy theo người.

<a id="tai-khoan-demo"></a>

### Tài khoản demo

Mật khẩu ban đầu của mọi tài khoản là giá trị `DEMO_PASSWORD` trong `backend/.env` (không ghi trong repo). Không dữ liệu mẫu thì chỉ có `admin`.

| Username | Họ tên | Vai trò | ĐVCS được chọn | Mặc định | Phạm vi, ngoại lệ, cột riêng |
|---|---|---|---|---|---|
| `admin` | Quản trị hệ thống | `ADMIN`, `FULL_ACCESS` | `A00`, `A01`, `A02`, `A03` | `A00` | – |
| `quantri` | Ngô Văn Quân | `ADMIN` | `A00`–`A03` | `A00` | – (minh họa quản trị chỉ xem, cột giá Ẩn) |
| `giamdoc` | Phạm Quốc Hưng | `DIRECTOR` | `A00`, `A01` | `A00` | – |
| `kehoach.a` | Lê Thị Mai | `PLANNER` | `A01` | `A01` | – |
| `truongchuyen.a` | Nguyễn Văn Tâm | `LINE_LEADER` | `A01` | `A01` | Chuyền: danh sách mã `A01-L03` (bộ phận chuyền mẫu; phạm vi chuyền lưu theo mã, [Phân quyền](04-phan-quyen.md)) |
| `truongchuyen.b` | Hoàng Minh Bảo | `LINE_LEADER` | `A01` | `A01` | Chuyền `A01-L03`; ngoại lệ Cho phép `order.shipment:view` đến hết 31/12/2026 (giờ Việt Nam); cột riêng `order.lineplan.cmPrice` Chỉ đọc đến hết 31/12/2026 |
| `ketoan` | Đỗ Thu Hà | `ACCOUNTANT` | `A00`–`A03` | `A00` | ĐVCS: danh sách `A01`, `A02` (ở `A03` không có quyền gì; ở `A00` chỉ đọc dữ liệu theo ĐVCS của hai đơn vị này) |
| `nhansu` | Trịnh Thu Hằng | `HR` | `A00`–`A03` | `A00` | – (dữ liệu nhân sự dùng chung toàn công ty) |

Lý do ngoại lệ, cột riêng mẫu ghi trong `seed-data.ts`. Tài khoản một ĐVCS vào thẳng ứng dụng sau bước mật khẩu; nhiều ĐVCS thì form đăng nhập hiện ô chọn ĐVCS.

### Đơn hàng giả (`MES_Order`)

`backend/scripts/seed-order.ts`. Script sinh nhiều kế hoạch xuất hàng cho một đơn ở cùng ĐVCS và gắn mọi PO của đơn vào mỗi kế hoạch, như `sim:board`: khác luật mỗi ĐVCS một kế hoạch mỗi đơn, mỗi PO một kế hoạch ([Quyết định](13-quyet-dinh.md) 15.1, 15.2); việc chờ: [Trạng thái](../current/STATUS.md). Sinh xác định theo hạt giống (chạy lại trên database trống cho cùng kết quả), chỉ cho ĐVCS mẫu chưa có đơn hàng nào. Mốc tiến độ cố định là ngày demo 09/10/2026; bảng dàn chuyền bắt đầu quanh tuần 05/10/2026.

| | `A01` | `A02` | `A03` | Tổng |
|---|---|---|---|---|
| Đơn hàng | 16 | 10 | 8 | 34 |
| PO (1–3 mỗi đơn) | 31 | 19 | 15 | 65 |
| Kế hoạch xuất hàng | 16 | 10 | 9 | 35 |
| Dòng dàn chuyền | 18 | 10 | 10 | 38 |

- Khách hàng hư cấu: Nordic Trail AB, Alpenhaus GmbH, Coastline Apparel Ltd, Sakura Sports KK, Maple Workwear Inc, Baltic Knit OÜ. Loại đơn `SXXK` hoặc `GCND`, đơn vị tính "Chiếc".
- Mỗi PO 2–3 màu × 4–5 cỡ; tổng màu cỡ các PO bằng số lượng đơn. Khoảng một nửa PO đã xác nhận.
- Nhà máy SX: phần lớn cùng mã với chi nhánh nhận đơn; một phần đơn của `A01` ở `A01-B`, vài đơn của chi nhánh `A02` cũng ở `A01-B` (để thấy kế hoạch lập cho đơn của ĐVCS khác).
- Khoảng 4/5 đơn có kế hoạch, một số tách hai đợt xuất; khoảng 3/4 kế hoạch đợt đầu đã xếp 1–3 chuyền. Ở `A01`, chuyền 3 (`A01-L03`) luôn có việc để demo Trưởng chuyền 3.
- Dòng đã vào chuyền trước ngày demo ở trạng thái Đang may; kế hoạch tương ứng có lũy kế may ra, Endline, hoàn thiện tỷ lệ với thời gian đã may; LK cắt để 0 (lấy từ Đồng bộ tiến độ cắt, quyết định 13.6).
- Số chứng từ theo Id: `DH-<ĐVCS>-<Id 6 số>`, `PO-…`, `KH-…`. Người tạo (`CreatedBy`) là `kehoach.a`.

Thay bằng đơn hàng BRAVO đã chép: `npm run load:bravo -- --yes` hoặc `npm run reset:demo -- --yes --bravo`; dàn chuyền mô phỏng: `npm run sim:board -- --yes` ([Vận hành](11-van-hanh.md)).

### Nhân sự giả (`MES_Hr`)

`backend/scripts/hr-data.ts`. Phòng ban, chức danh theo phòng ban thêm khi còn thiếu theo mã; nhân viên chỉ khi bảng `Employee` còn trống.

- 13 phòng ban: `VSN` Công ty Vietsun; `VP` Khối văn phòng với `HCNS`, `KT`, `KH`; `NM1` Nhà máy 1 (ĐVCS `A01`) với `NM1-CAT`, `NM1-MAY`, `NM1-QC`; `NM2` Nhà máy 2 (ĐVCS `A02`) với `NM2-MAY` và `NM2-HT` đã giải thể (để thử ô "Hiện phòng ban giải thể"); `NM3` Nhà máy 3 (ĐVCS `A03`).
- Xưởng, chuyền may mẫu (`hrLineDepartments` trong `seed-data.ts`): xưởng là phòng ban loại `PHONG` mã `<ĐVCS>-Xnn` tên "Xưởng nn"; chuyền là bộ phận loại `BO_PHAN` tích "Xưởng sản xuất", mã `<ĐVCS>-Lnn` tên "Chuyền nn", cùng ĐVCS. Mã chuyền mẫu là mã mà đơn hàng giả, dàn chuyền mô phỏng, phạm vi của Trưởng chuyền mẫu dùng.

  | ĐVCS | Xưởng (cha) | Chuyền |
  |---|---|---|
  | `A01` | `A01-X01` (dưới `NM1`) gồm L01–L06; `A01-X02` gồm L07–L12 | 12 chuyền `A01-L01` … `A01-L12` |
  | `A02` | `A02-X01` (dưới `NM2`) gồm L01–L04; `A02-X02` gồm L05–L08 | 8 chuyền |
  | `A03` | không chia xưởng: chuyền nằm thẳng dưới `NM3` | 6 chuyền |
- 6 chức danh theo phòng ban: `KTT`, `KTV` (Kế toán), `CVNS` (HCNS), `NVKH` (Kế hoạch), `CNC` (Bộ phận cắt), `NVQC` (Bộ phận QC).
- 40 nhân viên mã `NV1001`–`NV1040` (mã chấm công trùng mã), người đầu tiên của một số nhóm làm quản lý phòng ban; vài người đã nghỉ việc để thử bộ lọc tình trạng.

## Kịch bản demo

Khoảng 12 phút. Nói rõ ngay từ đầu: dữ liệu demo là dữ liệu giả (trừ khi đã nạp BRAVO bằng `--bravo`); module Đơn hàng, Kế hoạch chuẩn bị SX, Đồng bộ tiến độ cắt, Xác nhận cấp BTP, Kế hoạch may, Nhân sự, Quản trị đã có màn; các màn Cắt, May còn lại, QMS, Hoàn thiện, Báo cáo mới có menu và phân quyền.

### Chuẩn bị (15 phút trước)

1. Máy demo có SQL Server, `backend/.env`, đã `npm run migrate` và `npm run seed` ([Vận hành](11-van-hanh.md)).
2. `npm run reset:demo -- --yes`.
3. `npm run demo`; mở thử địa chỉ `http://<IP máy demo>:3000` trên điện thoại (cùng Wi-Fi; không vào được thì mở cổng tường lửa).
4. Gợi ý bố trí: máy chiếu hiển thị máy demo; điện thoại đăng nhập `truongchuyen.a`.

### Các bước trình bày

| Bước | Ai, ở đâu | Làm gì | Điều cần thấy, cần nói |
|---|---|---|---|
| 1. Đăng nhập (1 phút) | `giamdoc`, máy demo | Nhập tên, mật khẩu | Form hiện ô Đơn vị cơ sở chỉ có Toàn công ty (`A00`) và Nhà máy 1 (`A01`): mỗi người chỉ thấy ĐVCS được gán. Chọn Toàn công ty, bấm Vào làm việc: trang chủ báo đang xem tổng hợp mọi ĐVCS, chỉ đọc |
| 2. Dữ liệu dùng chung, dữ liệu theo ĐVCS (2 phút) | `giamdoc`, `A00` | Mở Quản trị đơn hàng › Thông tin đơn hàng, rồi Kế hoạch xuất hàng. Bấm ĐVCS trên thanh trên cùng, chọn Nhà máy 1, mở lại hai màn | Thông tin đơn hàng: đơn toàn công ty, cột Chi nhánh FOB, Nhà máy SX, đủ cột Đơn giá, Thành tiền, Giá CM; không có nút Thêm, Sửa, Xóa; có Xuất file. Ở `A01` vẫn đủ đơn (đơn hàng dùng chung, ADR 0013). Kế hoạch xuất hàng: ở `A00` có kế hoạch mọi ĐVCS, ở `A01` chỉ còn `KH-A01-…`. Lọc nằm ở máy chủ, người dùng không tự đổi ĐVCS trong yêu cầu gửi lên |
| 3. Luồng Đơn hàng (3 phút) | `kehoach.a` (vào thẳng Nhà máy 1) | Thông tin đơn hàng: chọn một đơn `DH-A01-…`, bấm Sửa | Chip có biểu tượng khóa ghi số cột chỉ đọc; Đơn giá chỉ đọc, Giá CM sửa được. Đơn của chi nhánh khác: Sửa, Xóa bị khóa kèm lý do |
| | | Kế hoạch xuất hàng › Thêm kế hoạch › Chọn mã hàng: chọn mã còn số lượng, tích PO, nhập PO/Buy date; nhập SL KHXH; lưu | Chỉ có đơn có Nhà máy SX thuộc ĐVCS đang làm (Nhà máy 1, 1B), kể cả vài đơn của chi nhánh `A02`. Lưới màu cỡ có Số lượng gốc, SL đã tạo KHXH, SL còn lại; nhập vượt còn lại bị chặn. Chọn một kế hoạch: khung PO của kế hoạch bên dưới ghi SL đã xác nhận, chưa xác nhận |
| | | Xếp chuyền: mở kế hoạch vừa tạo, thêm dòng chuyền (chuyền, số lượng, năng suất TB, ngày vào chuyền), lưu. Chuyển sang Bảng dàn chuyền | Ngày kết thúc tự tính theo Lịch làm việc của ĐVCS (ĐVCS chưa có lịch: nghỉ Chủ nhật; lịch mẫu thêm ngày lễ, Tết và ngày làm bù). Bảng dàn chuyền: mỗi chuyền một hàng, ô trống là chuyền rảnh |
| 4. Trưởng chuyền (1 phút) | `truongchuyen.a`, điện thoại | Mở menu Quản trị đơn hàng, Phân bổ màu cỡ, Xếp chuyền | Menu chỉ có Cập nhật tỷ lệ cắt, Xếp chuyền, Phân bổ màu cỡ, Kế hoạch chuẩn bị SX. Phân bổ màu cỡ chỉ có kế hoạch có chuyền `A01-L03`, cột Chuyền may chỉ chuyền 3, cột Khách hàng hiện `***`; mở kế hoạch nhập được số lượng giao cho chuyền 3. Xếp chuyền không có cột Giá CM, Doanh số; bảng dàn chuyền chỉ có chuyền 3 |
| 5. Đổi quyền có hiệu lực ngay (2 phút) | `admin`, máy demo, chọn Nhà máy 1 | Quản trị › Chính sách cột, Màn hình: Phân bổ màu cỡ; dòng Trưởng chuyền, cột Khách hàng: Che → Chỉ đọc; bấm Lưu 1 thay đổi | Điện thoại tải lại trang: tên khách hiện rõ, không cần đăng nhập lại. Đổi lại Che, lưu. Dòng Quản trị hệ thống, Toàn quyền bị khóa với lời nhắc "Bạn đang giữ vai trò này nên không tự sửa được": không ai tự nâng quyền cho mình |
| 6. Ngoại lệ cho một người (1 phút) | `admin` | Quản trị › Người dùng, dòng `truongchuyen.b`, nút Phân quyền chi tiết; tab Ngoại lệ quyền, rồi tab Xem thử | Ngoại lệ Cho phép xem Kế hoạch xuất hàng, hết hạn 31/12/2026, có lý do. Xem thử: người này dùng được màn nào, phạm vi nào, cột nào ẩn hay che |
| 7. Nhật ký (30 giây) | `admin` | Quản trị › Nhật ký hệ thống, bấm Xem ở một dòng | Có đăng nhập, lập kế hoạch, đổi chính sách cột vừa làm, kèm trước/sau. Nhật ký sửa đơn hàng không chứa giá |
| 8. Kết (1 phút) | | | Đã có: khung, phân quyền 5 lớp, module Đơn hàng, Kế hoạch chuẩn bị SX, Đồng bộ tiến độ cắt, Xác nhận cấp BTP, Kế hoạch may, Nhân sự, đồng bộ BRAVO/OSM. Chưa có: [Tổng quan](../PROJECT_OVERVIEW.md) mục 2.4, việc chờ: [Trạng thái](../current/STATUS.md) |

Sau buổi demo: `npm run reset:demo -- --yes`. Sự cố khi demo: [Vận hành › Xử lý sự cố](11-van-hanh.md).

## Kiểm thử phân quyền bằng tay

Mỗi tình huống: đăng nhập ai, làm gì, phải thấy gì. Mở mỗi tài khoản ở một cửa sổ ẩn danh riêng. Xong chạy `npm run reset:demo -- --yes`. Năm lớp: **L1** ĐVCS, **L2** vai trò → màn và hành động, **L3** phạm vi theo phép gán (ĐVCS, chuyền, người tạo), **L4** cột, **L5** ngoại lệ theo người ([Phân quyền](04-phan-quyen.md)).

### A. ĐVCS và vai trò (L1, L2)

| # | Tài khoản, ĐVCS | Thao tác | Kết quả đúng |
|---|---|---|---|
| A1 | `giamdoc`, `A00` | Mở Thông tin đơn hàng | Đơn toàn công ty; không có Thêm, Sửa, Xóa; có Xuất file |
| A2 | `giamdoc` | Đăng nhập | Ô ĐVCS chỉ có `A00`, `A01`. Gọi chọn `A02` qua API: 403 `BRANCH_NOT_ALLOWED` |
| A3 | `kehoach.a`, `A01` | Mở các màn Đơn hàng | Đủ nút thêm, sửa, xóa, xuất file theo ma trận (Kế hoạch chuẩn bị SX: sửa, xuất file) |
| A4 | `truongchuyen.a` | Xem menu; gõ thẳng `/order/info` | Không có Thông tin đơn hàng, Phân bổ PO, Kế hoạch xuất hàng; Báo cáo chỉ có Sản lượng theo giờ; không có nhóm Quản trị. Đường dẫn gõ tay báo chưa có quyền |
| A5 | `quantri`, `A01` | Mở Thông tin đơn hàng | Xem được, không có Thêm; không có cột Đơn giá, Thành tiền, Giá CM |
| A6 | Người có quyền ghi, ở `A00` | Thêm, sửa, xóa kế hoạch hoặc đơn hàng qua API | 403 `AGGREGATE_READ_ONLY` |
| A7 | `admin` bỏ `order.po:view` của vai trò Kế hoạch (`PLANNER`) ở Phân quyền | `kehoach.a` mất menu Cập nhật tỷ lệ cắt và API trả 403 ngay ở lần tải kế tiếp (không cần đăng nhập lại) |

### B. Phạm vi (L3)

| # | Tài khoản, ĐVCS | Thao tác | Kết quả đúng |
|---|---|---|---|
| B1 | `truongchuyen.a` | Phân bổ màu cỡ | Chỉ kế hoạch có chuyền `A01-L03`, cột Chuyền may chỉ chuyền 3; mở kế hoạch không có chuyền 3 theo Id: 404 |
| B2 | `truongchuyen.a` | Xếp chuyền, mở một kế hoạch nhiều chuyền | Chỉ thấy dòng chuyền 3; Bảng dàn chuyền chỉ có chuyền 3 |
| B3 | `ketoan`, `A00` | Kế hoạch xuất hàng; Thông tin đơn hàng | Kế hoạch chỉ của `A01`, `A02`; đơn hàng thấy hết (dùng chung) |
| B4 | `ketoan`, `A03` | Xem menu | Không có màn nghiệp vụ nào: phép gán của Kế toán chỉ có hiệu lực ở `A01`, `A02` |
| B5 | `admin` › Người dùng › `truongchuyen.a` › Phân quyền chi tiết › Vai trò và phạm vi › Sửa phạm vi: thêm chuyền `A01-L05`, Lưu phạm vi | `truongchuyen.a` tải lại Phân bổ màu cỡ | Có thêm kế hoạch của chuyền 5, cột Chuyền may có cả chuyền 5. Bỏ hết chuyền: màn báo trước, bấm lưu phải xác nhận "Bỏ giới hạn chuyền"; đồng ý thì thấy mọi chuyền của `A01` (không giới hạn) |
| B6 | `admin`, như B5 với `giamdoc`: bật "Chỉ bản ghi do chính người này tạo" ở vai trò Giám đốc | `giamdoc` (`A01`) tải lại Thông tin đơn hàng | Danh sách trống vì đơn mẫu do `kehoach.a` tạo. Tắt lại thì đủ đơn |
| B7 | `kehoach.a`, `A01` | Gọi kế hoạch của ĐVCS khác theo Id (xem, sửa, xóa); gửi `branchCode=A02` trong query, body | 404; `branchCode` của client bị bỏ qua |
| B8 | `admin`, `A01` › Nhân sự › Sơ đồ tổ chức › bộ phận `A01-L03` › Sửa: bỏ tích "Xưởng sản xuất", lưu | `truongchuyen.a` tải lại Phân bổ màu cỡ | Không còn kế hoạch nào (phạm vi chuyền thành rỗng, không thành không giới hạn); chuyền 3 không còn trong ô chọn Chuyền. Tích lại: hỏi trước "2 người sẽ thấy dữ liệu chuyền này" (`truongchuyen.a`, `truongchuyen.b`), lưu thì thấy lại. `nhansu` mở cùng bộ phận: ô tích khóa, nói cần quyền sửa Phân quyền |

### C. Cột (L4)

| # | Tài khoản | Thao tác | Kết quả đúng |
|---|---|---|---|
| C1 | `kehoach.a` | Thông tin đơn hàng | Đơn giá, Thành tiền có khóa ở tiêu đề; trong form sửa là ô chỉ đọc. Giá CM sửa được |
| C2 | `kehoach.a` | Xếp chuyền | Giá CM, Doanh số chỉ đọc |
| C3 | `truongchuyen.a` | Phân bổ màu cỡ, Xếp chuyền, Cập nhật tỷ lệ cắt, Kế hoạch chuẩn bị SX | Khách hàng hiện `***`; chip khóa liệt kê cột ẩn, che; cột bị che không có nút lọc, máy chủ cũng bỏ lọc, tìm theo cột đó |
| C4 | `giamdoc`, rồi `quantri` | Xuất file Thông tin đơn hàng | File của `giamdoc` có cột giá; của `quantri` không có |
| C5 | `admin` › Chính sách cột, Thông tin đơn hàng, dòng Kế hoạch × Giá CM: Ẩn, lưu | `kehoach.a` tải lại | Cột Giá CM mất khỏi lưới, form, file xuất |
| C6 | Như C5 nhưng chọn Che | `kehoach.a` tải lại | Cột còn, giá trị `***`; không sắp xếp theo cột đó |
| C7 | Kỹ thuật | DevTools › Network, phản hồi `/api/v1/order/sales-orders` của `quantri` | Không có `unitPrice`, `amount`, `cmPrice`: máy chủ bỏ cột, không chỉ giấu ở giao diện |
| C8 | Kỹ thuật | Gửi giá trị cho cột Chỉ đọc qua API | 403 `FIELD_READONLY` |
| C9 | `nhansu`, `giamdoc`, `quantri` | Thông tin nhân sự | Nhân sự thấy, sửa 5 cột giấy tờ, liên lạc; Giám đốc thấy `***`; Quản trị không thấy cột |

### D. Ngoại lệ theo người (L5)

| # | Tài khoản | Thao tác | Kết quả đúng |
|---|---|---|---|
| D1 | `truongchuyen.b` | Xem menu | Có Kế hoạch xuất hàng (chỉ xem), `truongchuyen.a` không có |
| D2 | `truongchuyen.b` | Xếp chuyền | Thấy Giá CM (chỉ đọc); `truongchuyen.a` không thấy |
| D3 | `admin` › `kehoach.a` › Ngoại lệ quyền › Thêm ngoại lệ: Chặn, "Thông tin đơn hàng" – Xóa, ghi lý do, Lưu ngoại lệ | `kehoach.a` tải lại | Nút Xóa đơn mất (Chặn thắng vai trò). Gỡ ngoại lệ thì có lại |
| D4 | `admin`: ngoại lệ Cho phép cho `truongchuyen.a`, "Kế hoạch xuất hàng" – Xem, hạn đến 3 phút sau | `truongchuyen.a` tải lại ngay, rồi sau 3 phút | Lúc đầu có màn; quá hạn tự mất |
| D5 | `admin`: tab Cột riêng của `truongchuyen.a`, Phân bổ màu cỡ, Khách hàng, Chỉ đọc, ghi lý do | `truongchuyen.a` tải lại | Tên khách hiện rõ; `truongchuyen.b` vẫn `***` (cột riêng thắng chính sách vai trò) |
| D6 | `admin`: tab Xem thử của `ketoan`, chọn `A00`, `A01`, `A03` | – | `A00`, `A01`: các màn Đơn hàng xem, xuất file, phạm vi ĐVCS `A01`, `A02`; `A03`: không có màn nào |

### E. Không tự nâng quyền, nhật ký

| # | Thao tác | Kết quả đúng |
|---|---|---|
| E1 | `admin` › Chính sách cột hoặc Phân quyền, chọn vai trò Quản trị hệ thống hoặc Toàn quyền | Bị khóa, nhắc đang giữ vai trò này |
| E2 | `admin` tự thêm ngoại lệ, đổi vai trò, ĐVCS, đặt lại mật khẩu của chính mình | Bị từ chối (403 `SELF_ELEVATION_FORBIDDEN`) |
| E3 | `admin` đổi mã ĐVCS qua API | 422 `CODE_IMMUTABLE` |
| E4 | `admin` › Nhật ký hệ thống sau các bước trên | Mỗi lần đổi phạm vi, ngoại lệ, chính sách cột có một dòng, kèm trước/sau và lý do |

### F. Ràng buộc nghiệp vụ

| # | Tài khoản | Thao tác | Kết quả đúng |
|---|---|---|---|
| F1 | `kehoach.a` | Kế hoạch xuất hàng, nhập SL KHXH lớn hơn SL còn lại | Báo lỗi, không lưu |
| F2 | `kehoach.a` | Cập nhật tỷ lệ cắt: chọn PO, Xác nhận, rồi sửa màu cỡ | Bị khóa; Hủy xác nhận thì sửa lại được |
| F3 | `kehoach.a` | Xếp chuyền: tổng số lượng các chuyền lớn hơn SL kế hoạch | Báo lỗi, không lưu |
| F4 | `kehoach.a` | Xóa một kế hoạch đã xếp chuyền | Báo "Kế hoạch đã được xếp chuyền nên không xóa được…" |

### G. Đồng bộ dữ liệu (cần `MES_Sync` và biến nguồn, [Đồng bộ](09-dong-bo.md))

| # | Tài khoản | Thao tác | Kết quả đúng |
|---|---|---|---|
| G1 | `kehoach.a` | Tìm màn Đồng bộ dữ liệu | Không có trong menu; gọi API bị từ chối |
| G2 | `admin` | Quản trị › Đồng bộ dữ liệu › Đồng bộ tất cả | Các nguồn lần lượt chạy rồi Thành công hoặc Lỗi kèm lý do |
| G3 | `admin` | Đồng bộ tất cả lần nữa | Mỗi nguồn chỉ đọc vài dòng quanh mốc |
| G4 | `admin` | Lọc nguồn Có lỗi; bấm Lịch sử của một nguồn | Từng lần chạy: người chạy, mốc, số dòng, lỗi |
| G5 | `admin` | Nhật ký hệ thống, lọc "Đồng bộ dữ liệu" | Có dòng "Chạy đồng bộ" cho mỗi lần bấm |

Tình huống khó làm bằng tay đã có test tự động (bảng dưới): hai người cùng lập kế hoạch hết SL còn lại, khóa chéo, dòng bị xóa bên nguồn đồng bộ, lần chạy đồng bộ mồ côi.

## Test tự động

### Backend (Jest)

- `npm test -w backend` = `jest --runInBand`: chạy tuần tự, timeout mỗi bài 30 giây (`backend/jest.config.js`), file `backend/test/*.spec.ts`.
- `backend/test/setup-env.ts` đặt `BRAVO_ORDER_IMPORT=false`, `OSM_FACTORY_UPDATE=false`, `PO_ALLOCATION_REFRESH=false`: app dựng trong test không tự nạp đơn hàng BRAVO, cập nhật Nhà máy SX hay làm mới Phân bổ PO xen vào bài test (bài test Phân bổ PO gọi thẳng bước làm mới, chỉ cho Brand riêng của bài).
- Phần lớn bài chạy **trên database thật** theo `backend/.env`: dựng `AppModule` thật, gọi API bằng supertest, đăng nhập tài khoản mẫu bằng `DEMO_PASSWORD`. Cần trước: `npm run migrate`, `npm run seed` với dữ liệu mẫu (`SEED_SAMPLE_DATA=true`).
- Bài tự tạo dữ liệu thử có tiền tố riêng (`TEST-…`, `TST…`, tài khoản `test.…`; bài ghi dữ liệu Đơn hàng ở `phase5.spec.ts` dùng đơn riêng `TEST-P5-FIXTURE`, còn bài chỉ đọc cần có đơn hàng ở `A01`, `A02` nên chạy được trên cả dữ liệu giả và dữ liệu BRAVO) và dọn khi xong; tài khoản thử chỉ bị vô hiệu, không xóa; nhật ký giữ lại. Không có chốt chặn database: không chạy trên database dùng thật ([Vận hành › Chốt chặn](11-van-hanh.md#chot-chan-an-toan-cua-script)).
- Chạy trên database demo thì xong nên `npm run reset:demo -- --yes`.
- Bài refresh phiên trong `auth.spec.ts` gọi qua HTTP: cần `COOKIE_SECURE=false` (hoặc không đặt `NODE_ENV=production`), không thì cookie `Secure` không được gửi lại.
- `sync.spec.ts` có 2 bài chép dữ liệu thật chỉ chạy khi `DB_TRUNGGIAN_NAME` cùng máy SQL Server (không qua linked server); không thì bỏ qua.
- `catalog.spec.ts`: có `MES_Sync` thì kiểm cả danh mục BRAVO, đòi `bravo.DM_CHINHANH` (và danh mục cỡ) đã có dữ liệu.

<a id="bo-database-test-rieng"></a>

### Bộ database test riêng

Dùng khi `backend/.env` trỏ tới database dùng chung (máy chủ) hoặc không muốn đụng dữ liệu demo. Biến môi trường của phiên thắng `.env`, nên chỉ cần đặt tên database khác trong phiên terminal. Ví dụ PowerShell, tên `MES_*_Test` (tên khác cũng được):

```
$env:DB_CORE_NAME='MES_Core_Test'; $env:DB_ORDER_NAME='MES_Order_Test'; $env:DB_SEWING_NAME='MES_Sewing_Test'
$env:DB_HR_NAME='MES_Hr_Test'; $env:DB_SYNC_NAME='MES_Sync_Test'; $env:DB_CUTTING_NAME='MES_Cutting_Test'
$env:SEED_SAMPLE_DATA='true'; $env:COOKIE_SECURE='false'
npm run migrate
npm run seed
npm test -w backend
```

- Login không có quyền tạo database thì quản trị CSDL tạo trước 6 database `…_Test`, cấp `db_owner`.
- `.env` có `NODE_ENV=production` thì `SEED_SAMPLE_DATA=true` phải đặt rõ (mặc định là `false`) và `.env` phải có `JWT_SECRET` ≥ 32 ký tự.
- Synonym nguồn đồng bộ của `MES_Sync_Test` trỏ tới cùng database nguồn trong `.env` (chỉ đọc). Bộ mới cần đồng bộ hai nguồn Chi nhánh (`vDM_CHINHANH`) và Size (`vDM_Size`) trước khi chạy `catalog.spec.ts`: chạy backend trong cùng phiên (`npm run dev:backend`), đăng nhập `admin`, chép hai nguồn ở Quản trị › Đồng bộ dữ liệu.
- Mọi lệnh phải chạy trong cùng phiên terminal đã đặt biến. Mở phiên mới là quay về database trong `.env`.
- Xong thì xóa 6 database test (thao tác không hoàn tác, kiểm đúng tên trước khi xóa).

### Danh sách file test backend

| File | Cần DB | Kiểm gì |
|---|---|---|
| `auth.spec.ts` | Có | Đăng nhập, token tạm, chọn ĐVCS (được, không được, `A00`), menu lọc theo quyền, deny by default, `@RequirePermission`, refresh xoay vòng, đăng xuất, khóa tạm 423, body vượt 512 KB trả 413 |
| `review-fixes.spec.ts` | Có | Sai mật khẩu song song vẫn khóa, đăng xuất không cần access token, token hết dùng khi thu hồi phiên hay đặt lại mật khẩu, không tin `X-Forwarded-For`, không tự nâng quyền, trần quyền quản trị, không tắt ĐVCS đang làm |
| `phase3.spec.ts` | Có | Lọc theo ĐVCS (danh sách, theo Id, `branchCode` client bị bỏ qua), đơn hàng dùng chung, `A00` chỉ đọc, quyền theo vai trò, đổi quyền có hiệu lực ngay kèm nhật ký, `SELF_ELEVATION_FORBIDDEN`, `CODE_IMMUTABLE`, Resource Registry từ chối bảng lạ |
| `phase5.spec.ts` | Có | Phạm vi chuyền theo mã bộ phận (kiểu cũ và `~mã` thành rỗng, bỏ tích thì mất ngay, nguồn chuyền lỗi thì từ chối, `/admin/scope-catalog`), người tạo, Kế toán theo ĐVCS; ngoại lệ Chặn, Cho phép, hết hạn, hẹn giờ; chính sách cột (ẩn, che, chỉ đọc, xuất file, nhật ký); Chọn mã hàng theo Nhà máy SX của ĐVCS; lập kế hoạch cho đơn ĐVCS khác; Tỷ lệ cắt theo kế hoạch của ĐVCS; cột Số lượng không Sửa được thì không bỏ hết màu cỡ của PO được (`lines: []` trả 403); cột Ngày bắt đầu SX không Sửa được thì không bỏ hết dòng dàn chuyền được (`lines: []` trả 403); vượt SL, hai người cùng lập, Xếp chuyền, khóa chéo, PO đã xác nhận; Phân bổ màu cỡ theo kế hoạch (một dòng mỗi kế hoạch, tách màu cỡ cho hai chuyền, tổng theo màu cỡ và theo chuyền, phạm vi chuyền, không giảm dưới phần đã giao ở Xếp chuyền, Kế hoạch xuất hàng) |
| `full-access.spec.ts` | Có | Vai trò Toàn quyền: `admin` ghi nghiệp vụ ở ĐVCS cụ thể, thấy giá, `A00` vẫn chỉ đọc, không tự sửa vai trò mình giữ; người chỉ giữ ADMIN gán, gỡ được |
| `seed.spec.ts` | Có (chạy seed `coreOnly`) | `admin` nhận ĐVCS mẫu vừa tạo, thứ tự menu theo `seed-data`, tạo và gán Toàn quyền (cả máy đã cài chưa có vai trò), `--sync-matrix`, không gán lại vai trò, ĐVCS đã thu hồi; cây tổ chức chỉ còn nút ĐVCS (không tạo nút Xưởng, Chuyền) |
| `catalog.spec.ts` | Có (BRAVO tùy chọn) | Danh mục hệ thống: quyền, danh mục mã-tên, chép ĐVCS từ BRAVO, Nhà máy SX theo ĐVCS, lịch làm việc (dùng năm 2031, trả lịch như cũ khi xong), API chuyền, xưởng cũ trả 404, chuyền mồ côi "(chuyền cũ)", ràng buộc cấp của cây cũ, ca, danh mục BRAVO chỉ xem, tên chi nhánh, nhà máy OSM tự thêm |
| `column-filter.spec.ts` | Một phần | Đọc tham số lọc theo cột; lưới 100 dòng theo ngày tạo, lọc trong DB, giá trị popup theo phạm vi, cột bị che, cột ngoài danh sách trắng |
| `hr.spec.ts` | Có (`MES_Hr`) | Quyền Nhân sự, phòng ban (mã, cây, Path, giải thể), nhân viên, tìm không dấu, dữ liệu dùng chung, cột nhạy cảm, nhập Excel, người quản lý, loại phòng ban; chuyền may (ô "Xưởng sản xuất", quyền sửa Phân quyền, `/me/lines`, chặn người giữ phạm vi mã đó, `line-holders`, `LINE_SET_CHANGE`, `LINE_SCOPE_UPDATE_FAILED`) |
| `work-calendar.spec.ts` | Không | Hàm tính ngày dàn chuyền theo lịch ĐVCS, bộ ca chung với frontend (`test/fixtures/work-calendar-cases.json`) |
| `line-source.spec.ts` | Không | `OrgService` với nguồn chuyền giả: không có nguồn thì không có chuyền, lọc ĐVCS, `assertLine`, cache, `invalidate`, đọc chung, nguồn lỗi, tên chuyền mồ côi |
| `phase5-line-scope-migration.spec.ts` | Có (rollback) | Thân migration `MES_Core/0009` trên phạm vi kiểu cũ: mã chuyền, cả nhánh, `~mã`, bỏ trùng, nhật ký, phiên bản; hủy cả transaction |
| `sewing.spec.ts` | Có (`MES_Sewing`) | Kế hoạch chuẩn bị SX: chép từ dàn chuyền, KH và trạng thái, lưu trên bảng, xung đột, kiểm đầu vào, phạm vi, `A00`, chính sách cột, danh mục bước, số liệu đầu màn, chuyền mồ côi |
| `cutting.spec.ts` | Có (`MES_Cutting`) | Đồng bộ tiến độ cắt: `ShipmentPlanFeed`, chép kế hoạch, popup theo ngày, Lũy kế, +/-, kiểm đầu vào, phân quyền, `A00`, chính sách cột, màu cỡ bị bỏ, chặn xóa kế hoạch có số cắt, kế hoạch mất nguồn, cột LK cắt của Kế hoạch xuất hàng, xuất file ([Cắt](15-cat.md) mục Test) |
| `po-allocation.spec.ts` | Có (`MES_Sync/0007`, `MES_Order/0009`) | Màn Phân bổ PO trên dữ liệu chép thử (ghi vào `osm.OSMData` rồi chạy bước làm mới): quyền, dòng trùng tính một lần, giữ `Id`, dải lọc, lọc theo cột (ĐVCS, ngày, dấu nhập tay), popup lọc, chính sách cột thật, gợi ý, xuất file, danh mục vài trăm nhà máy |
| `po-allocation-refresh.spec.ts` | Có (`MES_Sync/0007`, `MES_Order/0009`) | Bước làm mới Phân bổ PO: lần đầu, không ghi lại dòng không đổi, dòng nhập tay giữ nhà máy khi ETD, `FtyName` đổi, khóa vắng khỏi OSM, nguồn rỗng, nguồn giảm quá ngưỡng, ngưỡng 100, giảm hai lần liên tiếp không làm phình mốc, OSM trở lại thì làm đủ, khóa có lại, tên nhà máy chưa có trong danh mục |
| `po-allocation-write.spec.ts` | Có (`MES_Sync/0007`, `MES_Order/0009`) | Đổi Nhà máy SX: quyền Sửa, `A00`, xem trước, áp mọi dòng cùng khóa, luật ĐVCS theo nhà máy, nhà máy chưa gắn ĐVCS hoặc chưa vào danh mục, nhà máy mới phải đang dùng, "Theo OSM", cột Chỉ đọc, dữ liệu sai 422, 409 khi bước làm mới giữ khóa |
| `po-allocation-grant-migration.spec.ts` | Có (rollback) | Thân migration `MES_Core/0010` chạy trong transaction rồi hủy: cấp quyền Sửa cho `PLANNER`, Toàn quyền, không trùng khi chạy lại, nhật ký, bảng nguồn, phiên bản quyền; database chưa seed thì không làm gì |
| `cutting-grant-migration.spec.ts` | Có (rollback) | Thân migration `MES_Core/0012` chạy trong transaction rồi hủy: Kế hoạch đang có Xem nhận Sửa, Xuất, nhật ký cùng dạng màn Vai trò; Toàn quyền, Trưởng chuyền, Giám đốc không đổi; chạy lại không trùng, không thêm nhật ký; Kế hoạch đã bị gỡ Xem, hoặc `PLANNER` không phải vai trò hệ thống: không cấp; database chưa seed không làm gì |
| `sewing-plan.spec.ts` | Có (`MES_Sewing`) | Kế hoạch may: dòng dàn chuyền theo ngày, đơn vị; Cập nhật, Đã giao, giao vượt, ngày đã qua, phiên bản; Chốt, Hủy chốt, bản chụp; Xếp chuyền không giảm, bỏ, đổi chuyền dòng đã có số; phân quyền, chính sách cột; sửa riêng Giá CM ở ĐVCS có kế hoạch, kế hoạch đổi giá theo; nhật ký ([May](07-may.md) phần Kế hoạch may, Test) |
| `cutting-supply.spec.ts` | Có (`MES_Cutting`) | Xác nhận cấp BTP: `LineColorSizeFeed`, ô chọn, lưới theo Ngày cấp, gom lệnh, số lệnh, kiểm khi lưu, Xác nhận cấp, Hủy duyệt, xóa, chặn giảm Phân bổ màu cỡ, Xếp chuyền dưới số đã cấp, phân quyền, chính sách cột, xuất file ([Cắt](15-cat.md) phần Xác nhận cấp BTP, Test) |
| `cutting-supply-grant-migration.spec.ts` | Có (rollback) | Thân migration `MES_Core/0013` như `cutting-grant-migration.spec.ts`: Kế hoạch đang có Xem nhận Thêm, Sửa, Xóa, Xuất |
| `shipment-plan-pos.spec.ts` | Có | Khung PO của kế hoạch: SL đã xác nhận, chưa xác nhận, theo ĐVCS, quyền xem PO, chính sách cột, PO ngoài phạm vi; popup chọn PO chỉ có PO chưa nằm trong kế hoạch nào (cả khi Thêm và Chọn mã hàng lúc Sửa, quyết định 15.2); Ngày xuất bị Ẩn thì không xếp theo ngày xuất |
| `bravo-import.db.spec.ts` | Có | Nạp tăng dần đơn hàng BRAVO vào `MES_Order` với nguồn giả: thêm, giữ phần người dùng sửa, đóng lệnh, PO tay, câu ghi kiểm lại, khóa chéo, Nhà máy SX theo OSM |
| `simulate-board.db.spec.ts` | Có (rollback) | Phần ghi DB của dàn chuyền mô phỏng; chuyền đọc từ `MES_Hr` (bộ phận đang tích, chưa giải thể, đúng ĐVCS); mọi thay đổi trong transaction bị hủy; giữ kế hoạch có số cắt, kể cả `--all` |
| `sync.spec.ts` | Có (`MES_Sync`) | Quyền màn Đồng bộ, 18 nguồn BRAVO, `SYNC_NOT_READY`, thủ tục chép KEY/PARTITION trên bảng mẫu (xóa dòng, lỗi giữa chừng, khóa NULL, chặn xóa quá 20%), việc sau đồng bộ, lần chạy mồ côi, nhật ký |
| `bravo-import.spec.ts` | Không | So dữ liệu BRAVO với `MES_Order` của bước nạp tăng dần (dấu nội dung, ghép PO, màu cỡ, không xóa) |
| `bravo-import-service.spec.ts` | Không | Thử lại khi khóa chéo, xếp lần chạy sau, không ghi nhật ký khi không đổi |
| `osm-factory-service.spec.ts` | Không | Cập nhật Nhà máy SX theo OSM: không ghi khi chưa đồng bộ, nhật ký, thử lại |
| `load-bravo.spec.ts` | Không | Hàm thuần nạp BRAVO: gộp màu cỡ, số đơn hàng |
| `branch-names.spec.ts` | Không | Tên chi nhánh lấy từ BRAVO hay từ Quản trị, cache, không lỗi khi thiếu `MES_Sync` |
| `po-allocation-service.spec.ts` | Không | Service Phân bổ PO: điều kiện lọc, bỏ trường Ẩn/Che, sắp xếp mặc định, cảnh báo lần làm mới, cột suy ra từ Nhà máy SX, xuất file; đổi Nhà máy SX: `A00` bị từ chối trước khi đọc gì, cột Chỉ đọc bị từ chối cả khi xem trước, nhà máy phải đang dùng, dòng của ĐVCS khác, dòng không còn, ghi lệch số dòng, xem trước không giữ khóa, nhật ký |
| `shipment-plan-pos-service.spec.ts` | Không | Service khung PO của kế hoạch: tính SL, mức cột suy ra, thứ tự theo cột xem được |
| `shipment-plan-lines-service.spec.ts` | Không | Màu cỡ của `GET /shipment-plans/:id` (khung Màu cỡ): mức cột suy ra, thiếu quyền xem PO |
| `simulate-board.spec.ts` | Không | Xếp lịch dàn chuyền mô phỏng: không chồng lịch, ngày kết thúc, trạng thái, màu cỡ, cùng dữ liệu cho cùng kết quả |
| `sync-gen.spec.ts` | Không | Thủ tục chép trong migration `MES_Sync` mới nhất khớp đầu ra hiện tại của `sync-gen.ts` |
| `serve-web.spec.ts` | Không | Phục vụ giao diện đã build (`--serve-web`, `backend/src/serve-web.ts`): đường dẫn của ứng dụng một trang trả `index.html`, file code có thật trả đúng file, file code không còn trả 404 (không trả `index.html`), API không bị trả `index.html`, chưa build giao diện thì báo rõ |

### Frontend (Vitest)

- `npm test -w frontend` = `vitest run`: jsdom, không cần backend (API giả trong từng file), timeout 15 giây (`frontend/vite.config.ts`). `frontend/src/test/setup.ts` dọn DOM sau mỗi bài, nới thời gian chờ `findBy`/`waitFor` lên 4 giây, giả `matchMedia`, `ResizeObserver`, `scrollIntoView`, `document.fonts`.

| File | Kiểm gì |
|---|---|
| `login.test.tsx` | Form đăng nhập một bước: sai mật khẩu, chưa có ĐVCS, một ĐVCS vào thẳng, nhiều ĐVCS chọn ngay trên form, token tạm hết hạn, đăng nhập tài khoản khác, nhớ mật khẩu nhờ trình duyệt |
| `session.test.ts` | Đăng xuất, ĐVCS bị gỡ (403 `BRANCH_NOT_ALLOWED`), làm mới token một lần cho nhiều request, đổi ĐVCS ở tab khác |
| `chunk-reload.test.ts` | Tải lại trang khi thiếu file code của màn (tab mở từ bản build trước): nhận đúng lỗi tải file code; máy chủ trả lời thì tải lại một lần; vừa tải lại mà vẫn thiếu thì báo lỗi, quá 10 giây thì tải lại được; lỗi khác, máy chủ không trả lời, không dùng được `sessionStorage` thì báo lỗi gốc; mất mạng thì chờ có mạng |
| `shell.test.tsx` | `Can` ẩn/hiện theo quyền, chuyển hướng theo trạng thái đăng nhập, 403/404 theo menu, đường dẫn cũ, trang giữ chỗ khóa ghi ở `A00` |
| `branch-switcher.test.tsx` | Đổi ĐVCS trên thanh trên cùng: ở lại màn nếu có, hỏi khi còn thay đổi chưa lưu, máy chủ từ chối |
| `branch-name.test.tsx` | Hiện tên chi nhánh thay mã |
| `admin.test.tsx` | Hộp gán vai trò, ĐVCS: tích, bỏ tích, mục đã ngừng |
| `admin-pages.test.tsx` | Chính sách cột lưu nhiều vai trò, khóa tài khoản phải xác nhận, gán ĐVCS kèm Nhà máy SX, thao tác với chính mình bị khóa có lý do, không mất form ở Phân quyền chi tiết, tắt vai trò phải xác nhận |
| `phase-5-7.test.tsx` | Trang vượt trang cuối, Xem thử chỉ gọi khi mở tab, Tỷ lệ cắt mở theo URL, bản nháp Phân quyền |
| `catalog-work-calendar.test.tsx` | Danh mục Lịch làm việc: đợt nghỉ, xóa, cấu hình tuần, popup đặt ngày, chỉ quyền xem |
| `work-calendar.test.ts` | Hàm tính ngày ở giao diện ra đúng bộ ca chung với máy chủ |
| `line-plan-schedule.test.tsx` | Chi tiết dàn chuyền: ngày tự tính theo lịch, báo dòng cần tính lại, nội dung gửi khi lưu, lưới chỉ xem |
| `schedule-dates.test.ts` | Ngày dàn chuyền: điền theo công thức, sửa tay một ngày, tính lại khi đổi số lượng, năng suất, ngày bắt đầu, dán cả dòng, xóa ô thì lấy lại công thức; cột không được sửa giữ ngày đã lưu; mở popup chỉ điền ô trống; dòng ngoài phạm vi sửa không tính lại; Số ngày SX theo ngưỡng làm tròn của lịch |
| `line-plan-rules.test.ts` | Xếp chuyền: bỏ dòng đã lưu thì hỏi lại (xem được Trạng thái: chỉ dòng Đã phân màu cỡ; cột Trạng thái bị Ẩn, Che: mọi dòng đã lưu sửa được; giữ đủ dòng thì không hỏi) |
| `color-size.test.tsx` | Phân bổ màu cỡ: luật của popup (dòng lúc mở, dòng khóa, tổng theo màu cỡ và theo chuyền, chia theo SL chuyền, nhãn chuyền); dòng gom theo kế hoạch, khung theo chuyền, chia rồi lưu, cảnh báo vượt, người chỉ xem |
| `cutting-progress-rules.test.ts` | Đồng bộ tiến độ cắt: dòng Tổng, +/- = Lũy kế − Kế hoạch, Lũy kế khi đang gõ, chỉ gửi ô đã sửa, dòng không sửa được, cột bị Che |
| `cutting-supply-rules.test.ts` | Xác nhận cấp BTP: Còn lại khi gõ, chỉ gửi ô đã sửa, Còn lại âm, vượt Số lượng đồng bộ (không đếm trùng dòng trong lưới), dòng của lệnh đã xác nhận chỉ xem, thêm dòng bỏ dòng đã có |
| `catalog-factories.test.tsx` | Danh mục Nhà máy SX khi chỉ có quyền sửa danh mục; khung mặc định Nhà máy SX, ĐVCS lấy từ tổng quan; liên kết cũ `?c=LINE` chỉ sang Sơ đồ tổ chức |
| `user-access-scope.test.tsx` | Ô Chuyền ở bộ sửa phạm vi: gom theo ĐVCS, bộ phận cha, giá trị là mã; mã không còn tác dụng; bỏ hết chuyền phải xác nhận |
| `tree-select.test.tsx` | Ô chọn dạng cây: mở, tìm không dấu, bàn phím, trình đọc màn hình |
| `datagrid.test.tsx` | Lưới phản chiếu chính sách cột, bàn phím, tiêu đề hai tầng |
| `column-filter.test.tsx` | Bộ lọc theo cột trên URL, kéo giãn cột, popup lọc theo giá trị từ DB |
| `render-cost.test.tsx` | Lưới chỉ vẽ lại dòng đổi, ô lọc chữ chờ ngừng gõ, ô ngày ghi khi rời ô, bảng dàn chuyền giữ thanh, làm mới sau khi popup đóng |
| `confirm.test.tsx` | Hỏi lại khi bỏ thay đổi chưa lưu |
| `sheet.test.ts` | Lưới nhập kiểu bảng tính: khóa ô, chặn xóa dòng, đọc số, ngày gõ hoặc dán từ Excel |
| `sheet-filter.test.tsx` | Nút lọc trên tiêu đề lưới nhập |
| `sheet-typing.test.tsx` | Đang gõ dở trong lưới thì rời màn phải hỏi |
| `order.test.tsx` | Định dạng số, ngày khi cột bị che hoặc ẩn; bảng dàn chuyền không sập khi thiếu trường; kiểm lưới màu cỡ PO |
| `cut-ratio-edit.test.tsx` | Cập nhật tỷ lệ cắt: hỏi khi đang sửa mà chọn PO khác; PO của đơn ĐVCS khác trong kế hoạch ở đây sửa được, xóa bị khóa |
| `shipment-plan-pos.test.tsx` | Khung PO của kế hoạch: hướng dẫn, không có quyền, cột bị che, ẩn, lỗi tải, PO ngoài phạm vi; khung Màu cỡ của kế hoạch: số đã lưu kèm tổng, SL KHXH bị Ẩn, Che, không có quyền xem PO, mở Sửa thì tải lại kế hoạch, lỗi tải |
| `shipment-plan-add-po.test.tsx` | Kế hoạch xuất hàng, thêm PO khi Sửa: Chọn mã hàng chỉ có PO chưa lập kế hoạch, Số lượng gốc cộng dồn, SL KHXH giữ nguyên, Lưu gửi PO thêm kèm lưới; bỏ PO vừa thêm thì về như cũ; không có quyền xem PO thì nút Chọn mã hàng khóa, không gọi API PO |
| `po-allocation.test.tsx` | Màn Phân bổ PO: đủ cột, dòng nhập tay (vạch, huy hiệu, nhà máy theo OSM, không còn trong OSM), chưa đồng bộ OSM, cột bị ẩn hoặc che, sắp xếp mặc định; đổi Nhà máy SX (nút khóa khi chưa tích, xem trước, nhà máy gom theo ĐVCS, "Theo OSM", máy chủ từ chối và Thử lại, `A00`, cột Chỉ đọc); cảnh báo lần làm mới bằng chữ (số dòng OSM, mốc; dòng cũ trùng dòng mới; cách xử lý chỉ cho người chạy được đồng bộ) |
| `sewing.test.tsx` | Kế hoạch chuẩn bị SX: tuần ISO, trạng thái, nháp ô TH, chế độ xem và nhập, bước bị che, số liệu đầu màn, danh mục bước |
| `sewing-plan.test.tsx` | Kế hoạch may: luật tính (Đã giao, Còn lại, Doanh số = linemap × Giá CM, không giao vượt, dòng Tổng, ô giờ, ô Đơn vị theo sơ đồ tổ chức); màn hình (các cột, Cập nhật, Chốt, Hủy chốt, ngày đã qua chỉ xem, thiếu quyền Thêm, chỉ có quyền Xem, cột bị Ẩn); Thông tin đơn hàng sửa riêng Giá CM cho đơn của ĐVCS khác có kế hoạch ở đây |
| `prep-steps-save.test.tsx` | Cấu hình chuẩn bị SX: gõ thêm trong lúc lưu không mất |
| `hr.test.tsx` | Cây phòng ban, chức danh theo phòng ban, file mẫu nhập Excel, Sơ đồ tổ chức (kể cả ô "Xưởng sản xuất": khóa nói lý do, báo trước người được giao chuyền, đổi ĐVCS, khôi phục, đã lưu mà chưa cập nhật phân quyền; ĐVCS mặc định theo phòng ban cha: điền sẵn, đổi theo cha, chọn tay thì giữ, cha không có ĐVCS thì giữ giá trị đã lưu, ĐVCS đã tắt thì không lấy, chuyền thiếu quyền thì không đổi, báo phòng ban con giữ ĐVCS, cache bị xóa không mất form), Thông tin nhân sự, không mất form trên điện thoại |

<a id="do-hieu-nang"></a>

### Đo hiệu năng

`npm run perf -w frontend`: Vitest với `frontend/vitest.perf.config.ts`, chỉ chạy `frontend/src/perf/**/*.perf.tsx`, tuần tự, timeout 120 giây, in bảng kết quả ra console. Số đo là thời gian React vẽ (Profiler) trong jsdom, bản phát triển, dữ liệu giả; chỉ dùng để so trước và sau trên cùng máy. Không nằm trong `npm test`. Quy tắc hiệu năng giao diện: [Giao diện](10-giao-dien.md).

| File | Đo |
|---|---|
| `datagrid.perf.tsx` | Lưới xem 100 dòng: lúc dựng, bấm chọn dòng, trang render lại vì state khác |
| `filter.perf.tsx` | Popup lọc theo cột 500 giá trị: tích một giá trị |
| `pages.perf.tsx` | Màn thật với dữ liệu giả: Thông tin đơn hàng (gõ lọc, chọn dòng), Kế hoạch chuẩn bị SX 16 bước, Chính sách cột 30 cột × 10 vai trò, Phân quyền 50 màn × 5 hành động, Người dùng 100 dòng |

`frontend/src/perf/measure.tsx` là phần dùng chung (bọc Profiler, dựng provider).
