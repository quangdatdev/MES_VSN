# Module Đơn hàng

Module Đơn hàng (nhóm menu "Quản trị đơn hàng"): các màn hình, luật nghiệp vụ, API `/order/*`, database `MES_Order`, cách đơn hàng BRAVO vào `MES_Order` và dữ liệu mô phỏng.
Đọc khi sửa bất kỳ màn, API hay bảng nào của đơn hàng, PO, kế hoạch xuất hàng, xếp chuyền, phân bổ màu cỡ. Luật chung của phân quyền (`BaseRepository`, chính sách cột, phạm vi) ở [Phân quyền](04-phan-quyen.md); lớp chép dữ liệu BRAVO, OSM ở [Đồng bộ](09-dong-bo.md); lệnh chạy ở [Vận hành](11-van-hanh.md).

## 1. Tổng quan

### Luồng dữ liệu

```
BRAVO (qua MES_Sync) ──nạp──► Thông tin đơn hàng (SalesOrder) ──► PO + màu cỡ (SalesOrderPo, SalesOrderPoColorSize)
OSM (qua MES_Sync) ───────────► Nhà máy SX của đơn (SalesOrder.ProductionFactoryCode)
OSM v_OSMData (qua MES_Sync) ─làm mới─► Phân bổ PO (PoAllocation: bản làm việc, Nhà máy SX nhập tay được)

Kế hoạch xuất hàng (ShipmentPlan): chọn đơn hàng theo Nhà máy SX của ĐVCS đăng nhập, chọn PO, nhập SL theo màu cỡ
   ├─ PO của kế hoạch (ShipmentPlanPo) ──► Cập nhật tỷ lệ cắt: sửa, xác nhận màu cỡ của PO
   ├─ SL kế hoạch theo màu cỡ (ShipmentPlanColorSize)
   └─ Xếp chuyền: dòng dàn chuyền (ShipmentPlanLine) ──► Phân bổ màu cỡ: màu cỡ của kế hoạch chia cho các chuyền đã xếp (ShipmentPlanLineColorSize)
                                                     └──► Kế hoạch chuẩn bị SX (module May, xem 07-may.md)
```

Module May (Kế hoạch chuẩn bị SX, Kế hoạch may) và module Cắt (Đồng bộ tiến độ cắt, Xác nhận cấp BTP) đọc, kiểm dữ liệu đơn hàng qua API công khai (mục 9); thứ tự gọi của từng luồng xuyên module: [Luồng dữ liệu](../DATA_FLOWS.md) mục 5.

### Dữ liệu dùng chung và dữ liệu theo ĐVCS

| Dữ liệu | Phạm vi | Ý nghĩa của `BranchCode` |
|---|---|---|
| Đơn hàng, PO, màu cỡ của PO | Dùng chung toàn công ty (`SHARED`, ADR 0013): mọi ĐVCS đọc được | ĐVCS nguồn ("Chi nhánh FOB"): ĐVCS nhận đơn ở BRAVO, hoặc ĐVCS của người nhập tay. Chỉ ĐVCS nguồn ghi được, trừ ngoại lệ PO trong kế hoạch (mục 3) |
| Kế hoạch xuất hàng, PO của kế hoạch, SL theo màu cỡ, dòng dàn chuyền, phân màu cỡ | Theo ĐVCS (`BRANCH`) | ĐVCS của phiên lập kế hoạch. Đơn vị tổng hợp `A00` đọc mọi ĐVCS, không ghi |
| Phân bổ PO (OSM) | Dùng chung (`SHARED`): mọi ĐVCS đọc được | Không có cột. ĐVCS giữ dòng suy từ Nhà máy SX hiện hành theo danh mục Nhà máy SX: chỉ ĐVCS đó đổi được Nhà máy SX của dòng (mục 4.2). `A00` chỉ đọc |

Một ĐVCS lập kế hoạch được cho đơn hàng của ĐVCS khác, miễn đơn có Nhà máy SX thuộc ĐVCS đó (ADR 0013 mục 11). Lý do: nhà máy may thực tế thường khác chi nhánh nhận đơn.

### Vị trí code

| Phần | Đường dẫn |
|---|---|
| Module NestJS | `backend/src/modules/order/order.module.ts` (6 controller; 13 repository của màn hình kế thừa `BaseRepository`, `ChildRepository` cộng 5 repository của việc hệ thống `ShipmentPlanPriceRepository`, `ShipmentPlanFeedRepository`, `LineColorSizeFeedRepository`, `BravoOrderImportRepository`, `PoAllocationRefreshRepository` (mục 3); 12 service; 3 điểm đăng ký kiểm tra `ShipmentPlanDeleteGuards`, `LineSupplyGuards`, `LineDayPlanGuards`; xuất cho module khác `ScheduleFeed`, `ShipmentPlanFeed`, `ShipmentPlanDeleteGuards`, `LineColorSizeFeed`, `LineSupplyGuards`, `LineDayPlanGuards`) |
| Controller | `backend/src/modules/order/order.controller.ts` |
| DTO, kiểm dữ liệu vào | `backend/src/modules/order/order.dto.ts`, `order.rules.ts` (quy tắc cỡ, số dòng màu cỡ tối đa) |
| Repository | `backend/src/modules/order/order.repositories.ts`; Phân bổ PO ở `po-allocation.repository.ts` (`PoAllocationRepository`, `PoAllocationRefreshRepository`); nạp BRAVO ở `bravo-order-import.repository.ts` |
| Service theo màn | `sales-order.service.ts`, `po-allocation.service.ts`, `shipment.service.ts`, `cut-ratio.service.ts`, `line-plan.service.ts`, `color-size.service.ts` |
| Kiểu bảng (Kysely), kết nối | `order.types.ts`, `order.db.ts` (database riêng `MES_Order`, biến `DB_ORDER_NAME`) |
| Tiện ích | `order.util.ts` (lọc nghiệp vụ, ngày làm việc, chia theo tỷ lệ, mã lỗi) |
| Nạp BRAVO, Nhà máy SX theo OSM | `bravo-order.mapping.ts`, `bravo-order-import.service.ts`, `bravo-order-import.repository.ts`, `osm-factory.service.ts` |
| Làm mới Phân bổ PO theo OSM | `po-allocation-refresh.service.ts` |
| API cho module khác | `schedule-feed.service.ts` (May), `line-day-plan-guard.ts` (May đăng ký), `shipment-plan-feed.service.ts`, `shipment-plan-delete-guard.ts`, `line-color-size-feed.service.ts`, `line-supply-guard.ts` (Cắt); luật import: [ARCHITECTURE](../ARCHITECTURE.md) mục 4 |
| Migration | `backend/migrations/MES_Order/` (danh sách file: [ARCHITECTURE](../ARCHITECTURE.md) mục 6.2) |
| Script | `backend/scripts/load-bravo-orders.ts`, `simulate-board.ts`, `seed-order.ts`, `bravo-branches.ts` |
| Frontend | `frontend/src/features/order/*` (đăng ký route ở `frontend/src/routes/registry.tsx`) |

Ranh giới import (lint, `backend/eslint.config.mjs`): module Đơn hàng không import module May, Cắt, Nhân sự và lớp đồng bộ (`platform/sync`); dữ liệu chép từ BRAVO, OSM đọc qua cổng `platform/feed/source-feed.service.ts` (ADR 0007). Module khác chỉ import `order.module` và các file ở dòng "API cho module khác"; file nào được import ở từng module: [ARCHITECTURE](../ARCHITECTURE.md) mục 4.

## 2. Màn hình và tài nguyên

Thứ tự trong menu "Quản trị đơn hàng" (menu, tài nguyên, quyền là dữ liệu do `npm run migrate`/`seed` nạp từ `backend/scripts/seed-data.ts`):

| Màn | Route | Tài nguyên | `ScopeType` | Bảng nguồn | Component | API |
|---|---|---|---|---|---|---|
| Thông tin đơn hàng | `/order/info` | `order.allocation` | `SHARED` | `SalesOrder` | `SalesOrderPage.tsx` | `/order/sales-orders` |
| Phân bổ PO | `/order/po-allocation` | `order.poallocation` | `SHARED` | `PoAllocation` | `PoAllocationPage.tsx` | `/order/po-allocations` |
| Kế hoạch xuất hàng | `/order/shipment` | `order.shipment` | `BRANCH` | `ShipmentPlan` | `ShipmentPage.tsx` | `/order/shipment-plans` |
| Cập nhật tỷ lệ cắt | `/order/cut-ratio` | `order.po` | `SHARED` | `SalesOrderPo` | `CutRatioPage.tsx` | `/order/cut-ratio` |
| Xếp chuyền (danh sách, chi tiết dàn chuyền, bảng dàn chuyền) | `/order/line-plan` | `order.lineplan` | `BRANCH` | `ShipmentPlan` | `LinePlanPage.tsx`, `LineBoard.tsx` | `/order/line-plans` |
| Phân bổ màu cỡ | `/order/color-size` | `order.colorsize` | `BRANCH` | `ShipmentPlanLine` | `ColorSizePage.tsx` | `/order/color-size` |
| Kế hoạch chuẩn bị SX | `/order/prep` | `order.prep` | `BRANCH` | `MES_Sewing.SewingPrep` | thuộc module May | xem [Module May](07-may.md) |

- Mỗi tài nguyên có đủ 5 quyền `view`, `create`, `update`, `delete`, `export` (mã `order.<tài nguyên>:<hành động>`). Vai trò nào có quyền nào: ma trận ở [Dữ liệu mẫu và kiểm thử](12-du-lieu-mau-va-kiem-thu.md).
- `order.shipment` và `order.lineplan` cùng đọc bảng `ShipmentPlan` nhưng là hai tài nguyên: quyền, phạm vi, chính sách cột riêng (ADR 0006). Xếp chuyền có giá CM, doanh số; Kế hoạch xuất hàng không trả hai cột này.
- Chiều phạm vi gắn với tài nguyên (`SysResourceScopeBinding`, seed `scopeBindings`):

| Tài nguyên | `FACTORY` (ĐVCS) | `LINE` (chuyền) | `OWNER` (người tạo) |
|---|---|---|---|
| `order.allocation`, `order.po` | – (dùng chung) | – | `CreatedBy` |
| `order.shipment`, `order.lineplan` | `BranchCode` | – | `CreatedBy` |
| `order.colorsize` | `BranchCode` | `LineCode` | `CreatedBy` |

Dòng dàn chuyền đọc qua màn Xếp chuyền cũng lọc theo chiều chuyền (`LinePlanLineRepository.scopeColumns = { LINE: 'LineCode' }`), dù bảng chính `ShipmentPlan` không có cột chuyền.

## 3. Cách module dùng `BaseRepository`

Mọi truy vấn của màn hình đi qua repository trong `order.repositories.ts` và `po-allocation.repository.ts`. Ý nghĩa các tùy chọn (`originBranch`, `usedBy`, `productionFactoryColumn`, `assignedFactories`, `factoryBranchWrite`, `orderBy`, `inUseHere`, `scopeColumns`, `branchOnly`, `lock`, `createNumbered`) ở [Phân quyền](04-phan-quyen.md); bảng dưới chỉ ghi module khai báo gì.

| Repository | Bảng | Tài nguyên | Khai báo đặc biệt |
|---|---|---|---|
| `SalesOrderRepository` | `SalesOrder` | `order.allocation` | `originBranch`; `productionFactoryColumn = 'ProductionFactoryCode'` (cho Chọn mã hàng); `distinct()` gợi ý ô lọc |
| `SalesOrderPriceRepository` | `SalesOrder` | `order.allocation` | `originBranch`; `usedBy = ShipmentPlan.SalesOrderId`; chỉ cho đường sửa riêng Giá CM (`setCmPrice`, `writableIds`), quyết định 14.3 |
| `ShipmentPlanPriceRepository` | `ShipmentPlan` | (việc của hệ thống) | `follow(salesOrderId, cmPrice, trx)`: Giá CM của mọi kế hoạch của đơn theo giá của đơn, mọi ĐVCS, không đổi `ModifiedAt` |
| `SalesOrderPoRepository` | `SalesOrderPo` | `order.po` | `originBranch`; `usedBy = ShipmentPlanPo.SalesOrderPoId`; `styles()` gom PO theo đơn; `usedInPlans()`; `inAnyPlan()` (PO đã nằm trong kế hoạch, kiểm khi lập, thêm PO). Biểu thức `poFreeExpr` (PO chưa vào kế hoạch nào), `orderWithoutPlanIn(branch)` (đơn chưa có kế hoạch ở ĐVCS) cho popup chọn |
| `PoColorSizeRepository` | `SalesOrderPoColorSize` | con của PO | |
| `ShipmentPlanRepository` | `ShipmentPlan` | `order.shipment` | `plannedBySalesOrder()` (tùy chọn `sharingPoIds`: chỉ kế hoạch dùng chung PO), `planOfOrder()` (kế hoạch của đơn ở ĐVCS phiên), `scheduledQty()`, `hasSchedule()`, `assignedByColorSize()` (tổng đã giao theo màu cỡ, cho luật sửa SL KHXH) |
| `PlanColorSizeRepository`, `PlanPoRepository` | `ShipmentPlanColorSize`, `ShipmentPlanPo` | con của kế hoạch | |
| `LinePlanRepository` | `ShipmentPlan` | `order.lineplan` | `listWithSchedule()` kèm tổng đã xếp, ngày bắt đầu, kết thúc |
| `LinePlanLineRepository` | `ShipmentPlanLine` | con của `LinePlanRepository` | `scopeColumns LINE`; `totalExcept()`, `inRange()`; cho `ScheduleFeed` của module May (chỉ lọc ĐVCS, không theo phạm vi người xem): `feed()`, `feedVersion()` (Kế hoạch chuẩn bị SX), `dayPlanFeed()` (Kế hoạch may) |
| `LinePlanAllocationRepository` | `ShipmentPlanLineColorSize` | con ở màn Xếp chuyền | |
| `LineAllocationRepository` | `ShipmentPlanLine` | `order.colorsize` | Bảng gom một dòng mỗi kế hoạch (`planPage()`, `planAll()`, `planRow()`, `planValues()`, `planLineValues()`; `ALLOCATION_FILTER`, `hasLines()`); `planLines()`, `planColorSizes()` (SL KHXH của kế hoạch có chuyền trong phạm vi xem), `assignedOutside()` |
| `LineColorSizeRepository` | `ShipmentPlanLineColorSize` | con ở màn Phân bổ màu cỡ | |
| `PoAllocationRepository` | `PoAllocation` | `order.poallocation` | `productionFactoryColumn = 'ProductionFactoryCode'`; `factoryBranchWrite`; `factoryDirectory()` trả `CatalogLookupService`; `sortable = ['Id']` (service sắp xếp bằng `ListOptions.orderBy`); `target()`, `setManual()`, `resetToOsm()`, `withWriteLock()` cho lần đổi Nhà máy SX; `refreshState()`, `countFor()`, `distinct()` |
| `ShipmentPlanFeedRepository` | `ShipmentPlan`, `ShipmentPlanColorSize` | (việc của hệ thống, cho `ShipmentPlanFeed`) | Chỉ lọc ĐVCS do service truyền từ phiên (`null`: mọi ĐVCS); `plans()`, `colorSizes()`, `version()`, `createdAt()`, `cutQtyOf()`, `setCutQty()` (ghi LK cắt, không đổi `ModifiedAt`) |
| `LineColorSizeFeedRepository` | `ShipmentPlanLineColorSize` nối `ShipmentPlanLine`, `ShipmentPlan` | (việc của hệ thống, cho `LineColorSizeFeed`, `LineSupplyGuards`) | Chỉ lọc ĐVCS; `totals()` (SL giao > 0 gom theo chuyền, mã hàng, màu, cỡ; nhận transaction của Đơn hàng khi kiểm số BTP đã cấp), `styles()` |
| `BravoOrderImportRepository` | `SalesOrder`, `SalesOrderPo`, `SalesOrderPoColorSize` | (việc của hệ thống) | Kết nối riêng; `apply()` (nạp tăng dần, mục 8.3), `applyOsmFactories()` (mục 8.4) |
| `PoAllocationRefreshRepository` | `PoAllocation`, `PoAllocationRefresh` | (việc của hệ thống) | Kết nối riêng; `refresh()` (mục 8.8) |

Repository ghi "(việc của hệ thống)" không kế thừa `BaseRepository`, không lọc theo phạm vi người xem; chỉ được gọi từ service đã kiểm quyền hoặc từ tác vụ nền (các đường ghi không theo phiên: [Luồng dữ liệu](../DATA_FLOWS.md) mục 5).

Luật ghi rút ra từ các khai báo trên:

- **Đơn hàng:** mọi ĐVCS đọc được; thêm thì `BranchCode` = ĐVCS của phiên; sửa, xóa chỉ ở ĐVCS nguồn (ĐVCS khác nhận 404). Nhờ vậy ĐVCS khác không đổi được Nhà máy SX của đơn (đổi là lách được bộ lọc Chọn mã hàng). Riêng Giá CM: ĐVCS có kế hoạch xuất hàng của đơn cũng sửa được, qua đường riêng (quyết định 14.3, mục 4.1).
- **PO:** ghi được (sửa màu cỡ, xác nhận, hủy xác nhận, xóa) ở ĐVCS nguồn **hoặc** ở ĐVCS có PO đó trong kế hoạch xuất hàng của mình (`ShipmentPlanPo.BranchCode`). Hai ĐVCS cùng đưa một PO vào kế hoạch thì cả hai sửa được (ADR 0013 mục 11); từ phase 5.17 mỗi PO chỉ vào một kế hoạch (quyết định 15.2), nên trường hợp này chỉ còn ở dữ liệu lập trước phase 5.17.
- **Màn Cập nhật tỷ lệ cắt** chỉ liệt kê PO "đang dùng ở ĐVCS này" (`inUseHere`): PO nằm trong kế hoạch xuất hàng của ĐVCS phiên, hoặc PO nhập tay ở ĐVCS này (`CreatedBy` có giá trị, `BranchCode` = ĐVCS). `A00`: PO trong kế hoạch của mọi ĐVCS và mọi PO nhập tay. Đây là lọc của màn, không phải phân quyền: PO vẫn đọc được qua popup Chọn mã hàng, qua `GET .../pos/:id/color-sizes`.
- **Phân bổ PO** (`factoryBranchWrite`): mọi ĐVCS đọc được; sửa chỉ dòng mà Nhà máy SX hiện hành không thuộc nhà máy của ĐVCS khác; `A00` không ghi được. Luật đầy đủ ở mục 4.2.
- **Chọn mã hàng** (`assignedFactories`): chỉ đơn có ít nhất một mã trong `ProductionFactoryCode` (danh sách cách nhau dấu phẩy, tách bằng `STRING_SPLIT`) thuộc các nhà máy SX đang dùng của ĐVCS phiên; `A00`: mọi nhà máy đã gắn ĐVCS. Danh sách nhà máy lấy từ quyền của phiên (`UserAccess.productionFactories`), không từ client. Đổi nhà máy, đổi ĐVCS của nhà máy ở danh mục làm tăng phiên bản quyền nên có hiệu lực ngay.
- **Bảng con** (`ChildRepository`): `BranchCode` của dòng con chép từ dòng cha (cha theo ĐVCS thì là ĐVCS phiên); khóa tới cha và `BranchCode` do repository đặt; ghi dòng con chỉ khi ghi được dòng cha.
- **Số liệu ràng buộc tính trên dữ liệu ngoài phạm vi người xem, chỉ trả tổng:**
  - SL đã lập kế hoạch của một đơn (`plannedBySalesOrder`) cộng mọi kế hoạch của đơn ở **mọi ĐVCS**, không theo phạm vi người xem: đơn dùng chung thì SL gốc dùng chung, người chỉ thấy kế hoạch của mình cũng không lập vượt.
  - Tổng SL dàn chuyền của một kế hoạch (`totalExcept`) chỉ lọc ĐVCS, không theo phạm vi chuyền: người chỉ sửa được chuyền mình không xếp vượt SL kế hoạch.
  - Tổng giao theo màu cỡ của các chuyền khác của kế hoạch (`assignedOutside`), tổng giao của cả kế hoạch ở danh sách Phân bổ màu cỡ, tổng đã giao theo màu cỡ khi sửa SL KHXH (`assignedByColorSize`): chỉ lọc ĐVCS, không theo phạm vi chuyền.
- **Thứ tự khóa** ở mọi đường ghi: đơn hàng → kế hoạch → dòng dàn chuyền → màu cỡ (`lock`, `lockBranchRow`, `lockByParent`; ADR 0006). Lưu phân màu cỡ khóa kế hoạch (`lockBranchRow` của `ShipmentPlanRepository`) rồi mới đọc dòng dàn chuyền, phần giao. Bước nạp BRAVO khóa đơn theo Id tăng dần trước khi ghi PO (mục 8.3). Khóa chéo (lỗi SQL 1205) trả 409 `CONFLICT` để người dùng lưu lại.
- **Số chứng từ theo Id** (`createNumbered`): `DH-<ĐVCS>-<Id 6 số>` (đơn hàng), `PO-<ĐVCS>-<Id 6 số>` (PO), `KH-<ĐVCS>-<Id 6 số>` (kế hoạch). ĐVCS là ĐVCS của phiên lúc tạo.

## 4. Các màn hình

Thành phần dùng chung của giao diện (lưới `DataGrid`, lưới nhập `SheetGrid`, lọc theo cột, phân trang 100 dòng theo ngày tạo, bộ lọc trên URL, hỏi lại khi rời màn có dữ liệu chưa lưu) mô tả ở [Giao diện](10-giao-dien.md). Mọi lưới danh sách mặc định 100 dòng mới tạo lên đầu, lọc và sắp xếp chạy trong database (ADR 0011). Nút ghi ẩn ở `A00` (`useCanWrite`), máy chủ vẫn chặn.

Dải lọc chung (`OrderFilters` trong `frontend/src/features/order/common.tsx`): Ngày xuất hàng từ–đến, Khách hàng, Mã hàng, ô tìm nhanh (tùy màn), Season, Trạng thái, Chuyền (tùy màn). Ô lọc theo cột bị Ẩn, Che không hiện (máy chủ cũng bỏ tham số đó).

### 4.1 Thông tin đơn hàng (`order.allocation`)

Danh sách đơn hàng toàn công ty (BRAVO nạp vào, hoặc nhập tay), không lọc theo ĐVCS.

- **Cột:** Số đơn, Khách hàng, Mã hàng, Season, Loại, Tên sản phẩm, Chi nhánh FOB (tên ĐVCS), Nhà máy SX (hiện tên theo danh mục, danh sách thì cách nhau dấu phẩy), Nhân viên lập, Số lượng, Đơn vị tính, Đơn giá (USD), Thành tiền (USD), Giá CM (USD), Ngày đồng bộ, Ngày xuất hàng, Trạng thái, Ngày tạo. Chân lưới cộng số lượng của trang.
- **Thao tác:** Thêm đơn hàng, Sửa (bấm đúp dòng), Xóa, Xuất file.
- **Luật:**
  - Số đơn tự sinh `DH-<ĐVCS phiên>-<Id>`; Chi nhánh FOB = ĐVCS của phiên lúc thêm. Đơn của ĐVCS khác: nút Sửa, Xóa khóa kèm lý do (`useOriginLock`), máy chủ trả 404.
  - Mã hàng lưu chữ hoa; cho chữ tiếng Việt, dấu cách, ngoặc; chặn xuống dòng, ký tự ẩn; tối đa 120 ký tự.
  - Thành tiền là cột tính (`Qty × UnitPrice`), không nhập.
  - **Nhà máy SX:**
    - Đơn có trong OSM (`IsFactoryFromOsm = 1`): ô chỉ xem, ghi "Lấy theo OSM"; gửi giá trị khác giá trị đang có thì 409 (gửi lại đúng giá trị đang có thì bỏ qua).
    - Đơn chưa có trong OSM: chọn **một** nhà máy đang dùng của danh mục Nhà máy SX (ô chọn gom theo ĐVCS); mã lạ hoặc đã ngừng thì 422; giữ nguyên giá trị hiện tại thì không kiểm (nhà máy cũ đã ngừng, hoặc danh sách theo OSM trước đây). Để trống là bỏ chọn.
    - Đơn chưa có Nhà máy SX thì không hiện ở popup Chọn mã hàng của ĐVCS nào.
  - Loại: gợi ý theo danh mục Loại đơn hàng (`ORDER_TYPE`) cộng giá trị đã có trong dữ liệu; Đơn vị tính gợi ý theo danh mục `UNIT` (danh mục ở [Quản trị hệ thống](05-quan-tri-he-thong.md)). Mặc định đơn vị "Chiếc".
  - Trạng thái chọn tay (Mới, Đã lập kế hoạch, Đang sản xuất, Hoàn thành, Đã hủy); máy chủ không tự đổi khi lập kế hoạch (mục 4.7).
  - Xóa đơn đã có PO hoặc kế hoạch: 409 (gợi ý đổi trạng thái sang Hủy).
  - Ô nhập theo chính sách cột: Ẩn thì không có ô, Che hiện `***`, Chỉ đọc khóa. Thêm mới cần sửa được đủ 5 trường bắt buộc (Khách hàng, Mã hàng, Tên sản phẩm, Số lượng, Ngày xuất hàng), thiếu thì nút Thêm khóa kèm lý do. Khi sửa chỉ gửi trường đã đổi.
  - Nhật ký `SysAuditLog` (`SalesOrder`, `CREATE`/`UPDATE`/`DELETE`) bỏ cột nhạy cảm (giá) trước khi ghi. Vì giá bị bỏ, `UPDATE` ghi thêm `changedFields`: ở Sửa đơn là tên các trường giá có đổi (`unitPrice`, `cmPrice`; không có giá nào đổi thì không có khóa này); ở đường sửa riêng Giá CM là `['cmPrice']`, hoặc `[]` khi giá gửi lên bằng giá đang có (`SalesOrderService.update`, `updateCmPrice`).
  - **Giá CM** (phase 5.16, quyết định 14.3): nhập tay, một giá mỗi đơn dùng chung mọi ĐVCS (nạp BRAVO không ghi đè). Đơn của ĐVCS khác mà ĐVCS phiên có kế hoạch xuất hàng của đơn (danh sách, chi tiết trả `cmPriceEditable`): nút Sửa mở popup chỉ có ô Giá CM nhập được (các ô khác chỉ xem, dòng giải thích), lưu qua `PUT /:id/cm-price`; Xóa vẫn khóa. Cần `order.allocation:update` và cột `cmPrice` Sửa được (mẫu: Kế hoạch, Toàn quyền). Sửa Giá CM ở đường nào (cả Sửa đơn của ĐVCS nguồn) thì Giá CM của mọi kế hoạch xuất hàng của đơn đổi theo trong cùng transaction: Doanh số Xếp chuyền, Giá CM ở Kế hoạch may theo giá mới.

### 4.2 Phân bổ PO (`order.poallocation`)

PO được phân cho nhà máy SX nào, theo view OSM `v_OSMData`. Màn đọc bảng làm việc `MES_Order.PoAllocation` qua `PoAllocationRepository` (kế thừa `BaseRepository`); bảng do bước làm mới chép từ bảng chép `MES_Sync.osm.OSMData` sau mỗi đợt đồng bộ (mục 8.8). Nhà máy SX đổi tay được và giữ qua các lần đồng bộ. Service: `backend/src/modules/order/po-allocation.service.ts`; quyết định: [Quyết định](13-quyet-dinh.md) mục 7.8, 7.9.

- **Cột:** Brand, Season, PO, SO, Ship mode, Style name, Style No, Màu, ETD-Actual, ETD-Revised, Nhà máy SX, Nhập tay, Đơn vị cơ sở. Không có cột số lượng (view không có). Mỗi dòng khác nhau của OSM là một dòng (dòng trùng nguyên dòng của view tính một lần); `id` là `PoAllocation.Id`, `rowNo` là số thứ tự trong danh sách đang xem.
- **Nhà máy SX** là giá trị hiện hành: nhập tay, hoặc theo OSM (`FtyName`). Ô của dòng nhập tay có vạch cam. Cột Nhập tay hiện huy hiệu "Nhập tay", kèm "OSM: <nhà máy>" khi nhà máy theo OSM khác giá trị nhập tay, hoặc huy hiệu "Không còn trong OSM" khi OSM không còn dòng nào cùng khóa (mục 8.8). Lọc theo cột Nhập tay có hai giá trị "Nhập tay", "Theo OSM".
- **Đơn vị cơ sở:** ĐVCS của Nhà máy SX hiện hành theo danh mục Nhà máy SX (`SysProductionFactory.BranchCode`; mã nhà máy là tên theo OSM). Service gửi bảng tra mã → ĐVCS của các nhà máy đã gắn ĐVCS bằng **một** tham số JSON (`OPENJSON`, hàm `branchExpr`), dùng chung cho cột, lọc, sắp xếp, nên danh mục vài trăm nhà máy vẫn không vượt giới hạn 2.100 tham số. Nhà máy chưa gắn ĐVCS, chưa vào danh mục, dòng không có nhà máy: trống ("–"). Bảng tra so nguyên giá trị, nên `FtyName` là danh sách nhiều nhà máy thì cũng trống.
- **Lọc:** Brand, Season (chọn, so bằng; tham số `customer`, `season`), Mã hàng (chứa, trong Style No hoặc Style name; tham số `style`), PO, SO (chứa; tham số `q`), lọc theo cột mọi cột của lưới. Danh sách trắng của máy chủ có thêm `osmFactoryName`, `isInOsm`; `isFactoryManual`, `isInOsm` lọc theo số 1/0.
- **Thứ tự mặc định:** ETD-Revised mới nhất trước (OSM không có ngày tạo, ngoại lệ của ADR 0011). Cột đó bị Ẩn/Che thì theo cột mặc định kế tiếp xem được (ETD-Actual, Brand, …). Service dựng biểu thức sắp xếp từ danh sách trắng của màn (`ListOptions.orderBy`, gồm cả cột tính ĐVCS); thứ tự phụ chỉ có `Id` giảm dần, để thứ tự mặc định dùng được chỉ mục `IX_PoAllocation_EtdRevised`.
- **Chính sách cột của các cột suy ra từ Nhà máy SX** (Đơn vị cơ sở, nhà máy theo OSM, Nhập tay, Còn trong OSM; biết chúng là đoán được phần nào Nhà máy SX): Nhà máy SX bị Ẩn thì không có các cột đó (lưới và file xuất); bị Che thì chúng cũng `***`. Khi đó không lọc, sắp xếp, hỏi giá trị theo chúng được, và không đổi được Nhà máy SX.
- **Đầu màn:** "Đồng bộ OSM lúc …" là lần chép OSM của dữ liệu đang có trong bảng (`syncedAt`, lấy từ `PoAllocationRefresh.SourceSyncedAt`). Chưa có dữ liệu (`syncedAt` null): lưới hướng dẫn chạy nguồn "Phân bổ PO theo nhà máy (OSM)" ở màn Đồng bộ dữ liệu (có link khi người xem có `admin.sync:update`); nguồn đang tắt (máy chủ chưa khai `DB_OSM_APP_NAME`) hoặc máy chưa có `MES_Sync` (`sourceActive = false`) thì nhắc nhờ IT.
- **Cảnh báo lần làm mới:** lần làm mới gần nhất bị bỏ qua vì bảng chép rỗng (`EMPTY`) hoặc phải giữ dòng không còn trong OSM vì nguồn giảm quá ngưỡng (`SHRINK`) thì trang trả `lastRefresh` (chỉ số đếm) và màn hiện khung cam, mọi thông tin là chữ (đọc được trên điện thoại, không cần rê chuột):
  - `EMPTY`: lần làm mới bị bỏ qua, lưới vẫn là dữ liệu lần trước.
  - `SHRINK`: số dòng không còn trong OSM được giữ, ngưỡng; lưới có thể có cả dòng cũ lẫn dòng mới của cùng PO cho tới lần làm mới đủ; dòng chữ phụ "OSM có N dòng; lần làm mới đủ gần nhất có M dòng" (`sourceRows`, `previousRows`: mốc đã dùng, mục 8.8).
  - Người có `admin.sync:update` thấy cách xử lý: `EMPTY` thì kiểm view OSM rồi chạy lại đồng bộ nguồn "Phân bổ PO theo nhà máy (OSM)"; `SHRINK` thì kiểm dữ liệu OSM rồi đồng bộ lại, OSM thật sự bớt PO thì đặt `PO_ALLOCATION_MAX_SHRINK_PERCENT=100`, khởi động lại backend, đồng bộ lại rồi trả về giá trị cũ ([Vận hành](11-van-hanh.md)). Người khác chỉ thấy "Báo quản trị kiểm OSM."
- **Xuất file** tối đa 50.000 dòng (`listAll` với `maxRows`); quá thì 422, không cắt ngầm. Cột: Brand, Season, PO, SO, Ship mode, Style name, Style No, Màu, ETD-Actual, ETD-Revised, Nhà máy SX, Đơn vị cơ sở (tên), Nhập tay ("Nhập tay" hoặc trống), Còn trong OSM ("Có", "Không"), Nhà máy SX theo OSM. Bốn cột sau cùng không có khi Nhà máy SX bị Ẩn; mỗi cột theo chính sách của trường của nó (`field`), nên "Còn trong OSM" bị Ẩn riêng thì không lộ qua cột khác.
- `load:bravo`, `reset:demo` không xóa hai bảng Phân bổ PO: nhà máy nhập tay giữ qua các lệnh đó.

**Đổi Nhà máy SX** (`PUT /order/po-allocations/factory`, `PoAllocationService.setFactory`):

- **Ai đổi được:** có `order.poallocation:update`, cột Nhà máy SX Sửa được, phiên không ở `A00`. Nút "Đổi nhà máy SX" ẩn ở `A00`, khi thiếu quyền, khi Nhà máy SX bị Ẩn hoặc Che; cột Chỉ đọc thì nút khóa nói lý do; chưa tích dòng nào thì nút khóa "Tích chọn các dòng cần đổi trong lưới trước".
- **Thao tác:** tích dòng trên lưới (ô tích chỉ có khi đổi được). Dòng đã tích chỉ có hiệu lực ở trang, thứ tự, bộ lọc lúc tích: đổi trang hay lọc là bỏ chọn. Chân lưới ghi "Đã chọn N dòng" kèm "Bỏ chọn". Popup hỏi máy chủ trước (`dryRun`) số dòng, số nhóm SO/PO/Style/Màu sẽ bị áp; chọn "Chọn nhà máy" (nhà máy đang dùng của danh mục, gom theo ĐVCS: ĐVCS đang làm việc trước, nhà máy chưa gắn ĐVCS cuối) hoặc "Theo OSM (bỏ nhập tay)" (báo trước số dòng nhập tay không còn trong OSM sẽ bị bỏ). Máy chủ từ chối thì popup nói lý do, nút lưu khóa, có nút "Thử lại". Lưu xong đóng popup rồi làm mới lưới.
- **Áp theo khóa:** máy chủ đổi `ids` (dòng đang thấy, tối đa 500) thành khóa SO + PO + Style No + Màu và áp cho **mọi dòng cùng khóa**, kể cả dòng ở trang khác và phần OSM chia cho nhà máy khác (so bằng `INTERSECT`: hai ô cùng trống là bằng nhau, chữ so theo collation của cột). OSM chia một khóa cho nhiều nhà máy thì nhập tay gộp cả khóa về một nhà máy.
- **Luật ĐVCS** (`factoryBranchWrite` của `BaseRepository`): mọi dòng cùng khóa phải có Nhà máy SX hiện hành thuộc nhà máy đang dùng của ĐVCS đăng nhập (`UserAccess.productionFactories`), hoặc chưa có nhà máy, hoặc nhà máy chưa gắn ĐVCS, chưa có trong danh mục. Có dòng thuộc nhà máy đã gắn ĐVCS khác: 403 `FACTORY_OF_OTHER_BRANCH` kèm số dòng, không dòng nào được đổi. Nhà máy của chính ĐVCS mà đã ngừng dùng cũng bị tính như vậy (đóng an toàn). Nhà máy mới chọn được của ĐVCS nào cũng được; đổi sang nhà máy của ĐVCS khác thì sau đó ĐVCS này không sửa được nhóm đó nữa.
- **Kiểm khác:** `A00` bị từ chối (403 `AGGREGATE_READ_ONLY`) trước khi đọc gì. Cột Nhà máy SX không Sửa được: 403 `FIELD_READONLY`, kể cả khi chỉ xem trước (`FieldPolicyInterceptor` chỉ chặn khi body có `factoryName`, service kiểm thêm). Nhà máy mới phải là nhà máy đang dùng của danh mục (so không phân biệt hoa thường, lưu đúng mã của danh mục), không thì 422. Có `id` không còn (bước làm mới vừa xóa) hoặc không xem được: 404, nhắc tải lại trang. Không ghi một phần nhóm: trong các dòng cùng khóa có dòng xem được mà không sửa được, hoặc ngược lại, thì 403 `SCOPE_DENIED`.
- **Ghi:** chọn nhà máy thì `ProductionFactoryCode` = mã nhà máy, `IsFactoryManual = 1`, `ModifiedAt`, `ModifiedBy` = người sửa. "Theo OSM" (`factoryName: null`) thì dòng còn trong OSM trở về `OsmFactoryCode`, `IsFactoryManual = 0`; dòng chỉ còn vì nhập tay (`IsInOsm = 0`) bị xóa.
- **Đồng thời:** lần ghi chạy trong transaction có khóa ứng dụng `MES_Order.PoAllocation` (`sp_getapplock`, dùng chung với bước làm mới), chờ tối đa 10 giây; bước làm mới đang chạy lâu hơn thì 409 "thử lại sau ít phút". Phạm vi được đọc lại trong khóa; số dòng ghi lệch số đã đếm thì 409, hủy cả lần ghi. Xem trước không giữ khóa, không ghi.
- **Nhật ký** `PO_ALLOCATION_FACTORY` (`EntityType = PoAllocation`): giá trị trước là các nhóm (khóa, nhà máy, có nhập tay không, số dòng); giá trị sau là nhà máy mới, số dòng, số khóa, số dòng bị bỏ. Ghi sau khi commit.
- **Không lan** sang Nhà máy SX của đơn hàng (`SalesOrder.ProductionFactoryCode`, mục 8.4): hai nguồn OSM độc lập (`vOSMDataFty` cho đơn, `v_OSMData` cho Phân bổ PO).

### 4.3 Kế hoạch xuất hàng (`order.shipment`)

Kế hoạch của ĐVCS phiên (A00: mọi ĐVCS người xem được xem), mỗi kế hoạch cho một đơn hàng. Mỗi ĐVCS có tối đa **một** kế hoạch cho một đơn, mỗi PO chỉ nằm trong một kế hoạch trên toàn công ty (phase 5.17, quyết định 15.1, 15.2); muốn thêm số lượng thì mở kế hoạch, thêm PO.

- **Lưới trên:** Số kế hoạch, Khách hàng, Mã hàng, Tên sản phẩm, PO/Buy date, ĐVCS, Ngày đồng bộ, Ngày xuất hàng, Nhân viên lập, Số lượng KH, LK cắt, LK May ra, LK Endline, LK Hoàn thiện, Trạng thái, Ngày tạo. Ô tìm nhanh "PO/Buy date". Chân lưới cộng SL kế hoạch của trang.
- **Thao tác:** Thêm kế hoạch, Sửa (bấm đúp), Xóa, Xuất file.
- **Khung dưới lưới** (theo dòng đang chọn): nút chuyển "Màu cỡ" (mặc định) / "PO" ở tiêu đề khung, kèm số kế hoạch; chỉ phần đang xem gọi API.
- **Khung "Màu cỡ"** (task 5.9.15): Tên màu SP, Tên cỡ SP, Số lượng gốc, SL đã tạo KHXH, SL còn lại, SL KHXH, cùng cột với lưới màu cỡ của popup Sửa; chân lưới cộng Số lượng gốc và SL KHXH.
  - Nguồn: `GET /order/shipment-plans/:id` (cùng dữ liệu và bộ nhớ đệm với popup Sửa; popup vẫn tải lại khi mở), chỉ cần `order.shipment:view`. SL KHXH là số đã lưu của kế hoạch; SL đã tạo KHXH là của các kế hoạch khác cùng đơn có dùng chung PO với kế hoạch này, ở mọi ĐVCS (quyết định 15.3); SL còn lại = gốc − đã tạo (không âm).
  - Số lượng gốc là số lúc lưu SL kế hoạch lần cuối. Popup Sửa lấy theo màu cỡ hiện tại của PO, nên sau khi sửa tỷ lệ cắt của PO mà chưa lưu lại kế hoạch thì hai nơi có thể khác nhau.
  - Cột theo chính sách cột của cột nguồn (mục 5): SL KHXH, SL đã tạo KHXH theo "Số lượng KH" (`planQty`) của kế hoạch; Số lượng gốc theo "Số lượng" (`qty`) của Cập nhật tỷ lệ cắt, không có quyền `order.po:view` thì như Ẩn; SL còn lại theo mức chặt hơn của hai cột. Ẩn thì không có cột, Che thì `***`; khi đó chân lưới không cộng cột đó.
  - Đổi Màu cỡ/PO chỉ đổi lưới, khung và nút chuyển giữ nguyên (không mất focus khi chọn bằng phím mũi tên).
- **Khung "PO của kế hoạch"** (task 5.9.14): PO#, Mã PO, Đích đến, Ngày xuất hàng, Số lượng, Trạng thái, Ngày xác nhận, SL đã xác nhận, SL chưa xác nhận; tiêu đề có tóm tắt "Đã xác nhận: <SL> (<n> PO)", "Chưa xác nhận: …"; chân lưới ghi tổng và "Số lượng là của cả PO; kế hoạch này lấy <SL>".
  - Xác nhận làm ở Cập nhật tỷ lệ cắt, theo cả PO, nên SL đã/chưa xác nhận là của cả PO (dữ liệu lập trước phase 5.17 có PO nằm trong nhiều kế hoạch): SL đã xác nhận = SL PO nếu PO "Đã xác nhận", ngược lại 0; SL chưa xác nhận ngược lại.
  - Cần cả quyền `order.po:view`; không có thì khung báo lý do, không gọi API. PO ngoài phạm vi xem ở `order.po` không hiện, đếm ở `hiddenCount` ("Bạn không được xem n PO").
  - Theo chính sách cột của `order.po` (mục 5). Thứ tự: ngày xuất rồi số PO, chỉ theo cột xem được nguyên giá trị; không còn cột nào thì theo Id.
- **Popup Thêm/Sửa kế hoạch:** ĐVCS, Khách hàng, Mã hàng (chỉ xem), PO/Buy date (bắt buộc), SL sản phẩm (tổng, tự tính), Ngày đồng bộ, Ngày xuất hàng (mặc định ngày xuất của đơn). Lưới màu cỡ: Tên màu SP, Tên cỡ SP, Số lượng gốc, SL đã tạo KHXH, SL còn lại, **SL KHXH** (nhập, dán cả cột từ Excel; vượt SL còn lại tô đỏ). Nút "Điền theo SL còn lại".
  - Số lượng gốc = tổng màu cỡ của các PO đã chọn; SL đã tạo KHXH = tổng SL KHXH của **các kế hoạch khác có dùng chung ít nhất một PO** với các PO đang xét, ở **mọi ĐVCS** (quyết định 15.3; dữ liệu mới không dùng chung PO nên bằng 0, chỉ dữ liệu lập trước phase 5.17 còn trừ); SL còn lại = gốc − đã tạo (không âm).
  - Sửa: đổi PO/Buy date, ngày xuất, SL theo màu cỡ, **thêm PO** (nút "Chọn mã hàng", dưới đây); không đổi được đơn hàng, không bỏ PO đã chọn. Khi sửa SL, lưới lấy màu cỡ hiện tại của các PO: Số lượng gốc được ghi lại theo màu cỡ hiện tại, màu cỡ không còn trong PO bị bỏ.
  - **Thêm PO khi sửa** (phase 5.17): nút "Chọn mã hàng" mở popup "Thêm PO vào kế hoạch <số>": Khách hàng, Mã hàng của kế hoạch (chỉ xem), Số lượng các PO đang chọn, bảng PO của đúng đơn hàng **chưa nằm trong kế hoạch nào** (cùng cột với bảng PO chi tiết ở dưới, nguồn `GET /:id/candidate-pos`). Xác nhận thì lưới màu cỡ tải lại theo PO của kế hoạch cộng PO thêm: Số lượng gốc cộng dồn, màu cỡ mới hiện thêm dòng với SL KHXH trống, SL KHXH đã nhập giữ nguyên (người dùng tự chỉnh, Q3). Dòng "n PO của kế hoạch + m PO thêm" kèm nút "Bỏ PO vừa thêm"; mở lại popup thì PO đã thêm giữ dấu tích. PO thêm chỉ ghi khi bấm Lưu thay đổi (gửi `addPoIds` kèm cả lưới màu cỡ). Nút khóa kèm lý do khi cột Số lượng KH không sửa được hoặc thiếu quyền xem PO ở Cập nhật tỷ lệ cắt.
- **Popup "Chọn mã hàng"** (`StylePicker`):
  - Bảng mã hàng: Khách hàng, Mã hàng, Chi nhánh FOB, Nhà máy SX, SL đơn hàng, SL đã tạo KH, SL còn lại, Ngày đồng bộ, Ngày xuất hàng. Chỉ đơn có Nhà máy SX thuộc ĐVCS đang làm việc (mục 3), đơn có Chi nhánh FOB nào cũng được; bỏ đơn Hoàn thành, Đã hủy, đơn **đã có kế hoạch ở ĐVCS phiên** (đầu popup ghi: mở kế hoạch đó để thêm PO); tối đa 200 đơn theo ngày xuất tăng dần (đủ 200 thì nhắc lọc thêm). Mặc định lọc ngày xuất từ hôm nay − 30 ngày. Đầu popup ghi các nhà máy của ĐVCS; ĐVCS chưa có nhà máy thì nhắc gắn ở Quản trị › Danh mục hệ thống › Nhà máy SX.
  - SL còn lại ở bảng này = SL đơn hàng (`SalesOrder.Qty`) − tổng SL KHXH mọi kế hoạch của đơn.
  - Bảng "PO chi tiết" của mã đã chọn: tích chọn PO (PO, Số lượng, Đích đến, Ngày đồng bộ, Ngày xuất hàng, trạng thái Tỷ lệ cắt). Chỉ PO **chưa nằm trong kế hoạch nào** (mọi ĐVCS); chọn được cả PO chưa xác nhận. Không còn PO nào thì bảng ghi "Mã hàng này không còn PO chưa lập kế hoạch".
  - Nhập PO/Buy date (chuỗi tham chiếu, ví dụ `4500123 / 15-11`, không phải kiểu ngày) rồi Xác nhận.
- **Luật máy chủ:**
  - Lập mới: đơn phải có Nhà máy SX thuộc ĐVCS phiên (không thì 404 ở PO của đơn, lưới màu cỡ, lệnh tạo), không ở trạng thái Hoàn thành/Đã hủy (422). PO của đơn đọc qua phạm vi xem của `order.po`, nên người lập cần cả quyền xem Cập nhật tỷ lệ cắt (thiếu thì danh sách PO rỗng, lệnh tạo 422). Lệnh tạo khóa đơn hàng tới hết transaction rồi đọc lại đơn (nhà máy có thể vừa đổi) và tính lại SL còn lại: hai người ở bất kỳ ĐVCS nào cùng lập cho một đơn phải lần lượt.
  - Mỗi ĐVCS một kế hoạch mỗi đơn (quyết định 15.1): lệnh tạo kiểm sau khi khóa đơn hàng, đơn đã có kế hoạch ở ĐVCS phiên (không theo phạm vi người lập, `ShipmentPlanRepository.planOfOrder`) thì 409, câu báo nêu số kế hoạch khi người lập xem được kế hoạch đó và cột Số kế hoạch không bị Ẩn/Che. Không có chỉ mục UNIQUE: dữ liệu cũ có thể còn nhiều kế hoạch cho một đơn, vẫn sửa được.
  - Mỗi PO một kế hoạch (quyết định 15.2): lập, thêm PO kiểm lại dưới khóa đơn hàng; PO đã nằm trong kế hoạch nào (mọi ĐVCS, kể cả chính kế hoạch đang sửa) thì 409, câu báo không nêu số PO (cột có thể bị Ẩn), `details.poIds`. Tổng PO một kế hoạch tối đa 100 (422).
  - Thêm PO khi sửa (`addPoIds`): phải gửi kèm `lines` (422 nếu thiếu), nên cần cột Số lượng KH Sửa được (interceptor chặn `planQty`). PO của kế hoạch đọc lại sau khi khóa đơn (hai người cùng thêm PO vào một kế hoạch thì lần lượt). PO thêm phải thuộc đơn của kế hoạch, xem được ở `order.po` (422, kiểm trước luật "đã nằm trong kế hoạch"). Đơn phải còn lập kế hoạch được như lúc lập mới: còn Nhà máy SX thuộc ĐVCS phiên, chưa Hoàn thành/Đã hủy (422 ở `GET /:id/candidate-pos`, `GET /draft` có `addPoIds`, `PUT`; câu hỏi xác nhận luật này: Q41 ở [Trạng thái](../current/STATUS.md)). Sửa SL của PO đã có thì không đòi các điều kiện này.
  - `basePoIds` (giao diện gửi khi gửi `lines`): tập PO lưới màu cỡ trên màn dựng theo. Khác PO đang lưu (người khác vừa thêm PO) thì 409 "Kế hoạch vừa được thêm PO ở nơi khác…", không lưu lưới cũ đè mất màu cỡ của PO mới (review 5.17 M1). Không gửi thì không kiểm (giao diện cũ).
  - Mỗi màu cỡ: không lặp, phải có trong các PO đã chọn, SL KHXH ≤ SL còn lại; ít nhất một màu cỡ > 0 (vi phạm: 422, `details` liệt kê dòng vượt).
  - Kế hoạch mang ĐVCS phiên, số `KH-<ĐVCS>-<Id>`, trạng thái "Chưa xếp chuyền". Chụp từ đơn: khách hàng, mã hàng, tên sản phẩm, loại, giá CM, ngày đồng bộ (ADR 0006: màn khác không phải đọc bảng đơn hàng). Nhân viên lập = họ tên người lập.
  - Sửa kế hoạch đã lập không đòi đơn còn Nhà máy SX thuộc ĐVCS; kế hoạch phải xem được. Giảm SL kế hoạch xuống dưới SL đã xếp chuyền: 409.
  - Giảm SL KHXH của một màu cỡ xuống dưới tổng đã giao cho chuyền ở Phân bổ màu cỡ, hoặc bỏ màu cỡ đã giao: 409, câu báo và `details` liệt kê màu cỡ (nêu số đã giao khi người sửa xem được Số lượng giao của Phân bổ màu cỡ). Giảm phần giao ở Phân bổ màu cỡ trước. Chỉ xét màu cỡ đang bị giảm (SL mới nhỏ hơn SL đang lưu, đọc dưới khóa kế hoạch): kế hoạch đang giao lệch vài sản phẩm (dữ liệu chia theo tỷ lệ của cách làm cũ) vẫn sửa được các màu cỡ khác.
  - Xóa kế hoạch đã có dòng dàn chuyền: 409 (xóa dàn chuyền ở Xếp chuyền trước). Xóa kế hoạch xóa cả SL theo màu cỡ và PO của kế hoạch.
  - Xóa kế hoạch đã có số cắt ở Đồng bộ tiến độ cắt: 409 (Xóa số cắt ở màn đó trước). Module Cắt đăng ký vào `ShipmentPlanDeleteGuards` (`shipment-plan-delete-guard.ts`), `ShipmentService.remove` gọi trước transaction xóa (quyết định 13.4, [Cắt](15-cat.md)). Hàm kiểm lỗi (không kết nối được `MES_Cutting`) thì cũng 409 "Chưa kiểm được dữ liệu phụ thuộc của kế hoạch (module khác không phản hồi). Thử lại sau."
  - Kế hoạch xuất hàng (đầu kế hoạch, SL KHXH theo màu cỡ) là nguồn của module Cắt qua `ShipmentPlanFeed` (`shipment-plan-feed.service.ts`): đổi cột của `ShipmentPlan`, `ShipmentPlanColorSize` thì xem lại bản chép bên đó.
  - LK cắt lấy từ màn Đồng bộ tiến độ cắt (quyết định 13.6, [Cắt](15-cat.md)): module Cắt ghi Lũy kế vào cột `CutQty` sau mỗi lần lưu và khi chép kế hoạch. LK May ra, LK Endline, LK Hoàn thiện chưa có nguồn: chỉ dữ liệu mẫu, mô phỏng điền; sau này lấy từ module May, QMS, Hoàn thiện.
  - Nhật ký: `ShipmentPlan` `CREATE`/`UPDATE`/`DELETE`; `UPDATE` có thêm PO thì giá trị sau có `poIds` (sau khi thêm), `addedPoIds`.

### 4.4 Cập nhật tỷ lệ cắt (`order.po`)

Ba khung: Danh sách mã hàng → Danh sách PO của mã đã chọn → Chi tiết màu cỡ của PO đã chọn. Mã hàng, PO đang chọn, bộ lọc, "Người lập", trang của hai lưới nằm trên URL (`so`, `po`, `mine`, `cf`/`page` cho lưới mã hàng, `pcf`/`ppage` cho lưới PO).

- **Danh sách mã hàng:** gom PO "đang dùng ở ĐVCS này" (mục 3) theo đơn hàng, một dòng mỗi đơn (kể cả khi PO tay mang ĐVCS khác ĐVCS của đơn): Khách hàng, Mã hàng, Chi nhánh FOB (của đơn hàng, đọc bằng truy vấn con), Số PO, Trạng thái (Đã xác nhận khi mọi PO đã xác nhận, Xác nhận một phần, Chưa xác nhận). Mã có PO mới tạo gần nhất lên đầu. Lọc thêm "Người lập: PO do tôi lập" (`createdBy=me`).
- **Danh sách PO:** Mã PO, PO#, Số lượng, Ngày đồng bộ, Ngày xuất hàng, Đích đến, Mã PKL, Số tờ khai, Trạng thái, Ngày tạo; mỗi dòng có `inPlan` (PO nằm trong kế hoạch xuất hàng nào đó, mọi ĐVCS).
- **Chi tiết màu cỡ:** Màu SP, Cỡ sản phẩm, Số lượng, Trạng thái.
- **Thao tác:**
  - **Sửa tỷ lệ:** thay toàn bộ màu cỡ của PO (lưới kiểu bảng tính, dán ba cột Màu, Cỡ, Số lượng từ Excel), Số lượng PO tính lại bằng tổng. PO đã xác nhận phải Hủy xác nhận trước (409). Cần sửa được cột Số lượng (`qty`): máy chủ kiểm mức cột trước khi đọc PO (`CutRatioService.updateColorSizes`), nên cả lệnh bỏ hết màu cỡ (`lines: []`, body không có khóa `qty`) cũng nhận 403 `FIELD_READONLY` khi cột Chỉ đọc, Ẩn, Che.
  - **Xác nhận:** khóa tỷ lệ cho khâu cắt; PO chưa có số lượng (tổng 0) thì 409. **Hủy xác nhận** mở lại để sửa.
  - **Xóa PO:** PO đã xác nhận hoặc đã nằm trong kế hoạch xuất hàng (của bất kỳ ĐVCS nào) không xóa được (409; nút khóa sẵn theo `inPlan`).
  - **Thêm PO** (cần thêm quyền `order.allocation:view` để đọc khách hàng, mã hàng của đơn): PO#, Ngày xuất hàng (bắt buộc), Đích đến, Mã PKL, Số tờ khai, lưới màu cỡ (ít nhất một dòng). Chỉ thêm cho mã hàng đang có trên màn ở ĐVCS phiên (có PO trong kế hoạch của ĐVCS, hoặc PO tay ở đây), khác thì 422 "Lập kế hoạch xuất hàng trước". PO mới mang ĐVCS phiên, số `PO-<ĐVCS>-<Id>`, trạng thái Chưa xác nhận; khách hàng, mã hàng chụp từ đơn.
- **Quy tắc màu cỡ** (máy chủ `order.dto.ts`, `order.rules.ts`; giao diện kiểm trước ở `cutRatioRules.ts`): Màu tối đa 100 ký tự; Cỡ tối đa 20 ký tự gồm chữ không dấu, số, dấu chấm, gạch ngang, gạch chéo, ngoặc, dấu cách (`^[A-Za-z0-9.\-/() ]{1,20}$`, ví dụ "32 SHORT", "2T(XS)"), lưu chữ hoa; Số lượng 0–10.000.000; tối đa 300 dòng; Màu + Cỡ không lặp (không phân biệt hoa thường). PO# tối đa 192 ký tự, cho chữ tiếng Việt, lưu chữ hoa, chặn xuống dòng và ký tự ẩn.
- **Đồng thời:** sửa màu cỡ, xác nhận, hủy xác nhận, xóa đều khóa dòng PO tới hết transaction rồi mới đọc trạng thái: ĐVCS nguồn và các ĐVCS có PO trong kế hoạch thao tác cùng lúc phải lần lượt.
- Nhật ký: `SalesOrderPo` `CREATE`, `CUT_RATIO_UPDATE` (màu cỡ trước, sau), `CUT_RATIO_CONFIRM`, `CUT_RATIO_UNCONFIRM`, `DELETE`.
- Hệ quả: PO BRAVO chưa vào kế hoạch xuất hàng nào của ĐVCS thì không hiện ở màn này.

### 4.5 Xếp chuyền (`order.lineplan`)

Hai tab (tab nằm trên URL `?view=board`):

- **Danh sách:** kế hoạch xuất hàng của ĐVCS kèm số liệu từ dàn chuyền: Khách hàng, Mã hàng, Loại đơn hàng, ĐVCS, SL kế hoạch, SL đã xếp chuyền, SL còn lại, Doanh số (USD), Ngày đồng bộ, Ngày bắt đầu SX (ngày vào chuyền sớm nhất), Ngày kết thúc SX (muộn nhất), Ngày xuất hàng, Trạng thái, Ngày tạo. Chân lưới: "Đã xếp chuyền trang này".
- **Bảng dàn chuyền** (`LineBoard.tsx`): mỗi chuyền một hàng, mỗi ngày một cột, mỗi dòng dàn chuyền một thanh. Mặc định từ hôm nay − 7 tới hôm nay + 60; tối đa 190 ngày. Ngày nghỉ tô theo lịch làm việc của ĐVCS (phase 5.12, [Quản trị hệ thống](05-quan-tri-he-thong.md) mục Lịch làm việc): ngày mọi ĐVCS đang hiện cùng nghỉ tô suốt bảng và tiêu đề (rê chuột thấy tên ngày lễ), ngày chỉ một ĐVCS nghỉ (đơn vị tổng hợp xem chuyền nhiều ĐVCS) tô trên hàng chuyền của ĐVCS đó. Lọc Khách hàng, Mã hàng; bật/tắt thông tin chi tiết khi bấm thanh. Hàng gồm chuyền đang dùng của ĐVCS (bộ phận tích "Xưởng sản xuất", [Nhân sự](08-nhan-su.md)), cộng chuyền đã giải thể nhưng còn việc trong khoảng ngày; nhãn hàng là tên chuyền, đã giải thể thì kèm "(đã ngừng)". Chuyền mồ côi (mã không còn là bộ phận chuyền nào: chuyền cũ trước khi chuyền là bộ phận, bộ phận đã bỏ tích) không có hàng. Thanh lọc theo phạm vi chuyền của người xem.
- **Popup "Chi tiết dàn chuyền"** (bấm đúp kế hoạch ở tab Danh sách, nút "Chi tiết dàn chuyền", hoặc bấm thanh rồi "Mở chi tiết dàn chuyền"): thông tin kế hoạch (có Giá CM nếu xem được), lưới nhập dàn chuyền, bảng dàn chuyền xem trước (thanh đang sửa thay thanh đã lưu).
  - Cột lưới: Chuyền (chọn theo cây bộ phận cha › chuyền; ô đóng hiện tên chuyền, hai chuyền trùng tên thì kèm mã; dòng đã xếp vào chuyền không còn trong ô chọn (bộ phận đã giải thể, hoặc đã chuyển sang ĐVCS khác) hiện "(đã ngừng)"; chuyền mồ côi (bộ phận đã bỏ tích, chuyền cũ) hiện "<mã> (chuyền cũ)" do máy chủ trả ở `lineName`), Số lượng, Năng suất TB, Bắt đầu vào chuyền (người dùng nhập bốn cột này); Số ngày SX, Số ngày nghỉ (tự tính, chỉ đọc); Kết thúc vào chuyền, Bắt đầu ra chuyền, Kết thúc ra chuyền, Bắt đầu nhập kho, Kết thúc nhập kho (điền theo công thức, sửa tay được: quyết định 6.10); Phân màu cỡ (trạng thái dòng). Nút "Cách tính ngày" nêu công thức theo đúng lịch của ĐVCS kế hoạch.
  - Giao diện tính ngày theo công thức bằng `frontend/src/lib/workCalendar.ts` theo lịch máy chủ trả kèm chi tiết (`calendar`); phần riêng của popup ở `features/order/scheduleDates.ts` (`settleDates`):
    - mở popup: giữ ngày đã lưu, chỉ điền ô trống theo công thức (`fillGaps`);
    - sửa Số lượng, Năng suất TB hoặc Bắt đầu vào chuyền (kể cả dòng mới): năm cột ngày tính lại theo công thức, trừ ô ngày được nhập, dán cùng lượt (dán cả dòng từ Excel giữ ngày đã dán; ô dán trùng đúng ngày cũ thì theo công thức, vì lưới không cho biết ô nào vừa được ghi);
    - sửa tay một ô ngày: giữ nguyên, không kéo theo ngày khác; xóa trống ô ngày: lấy lại ngày theo công thức;
    - Số ngày nghỉ đếm theo lịch từ sau Bắt đầu tới Kết thúc vào chuyền đang có (sửa tay ngày kết thúc thì đếm lại);
    - ô ngày khác công thức có tam giác cam ở góc (class `sheet-adjusted`); popup báo số dòng có ngày khác công thức (điều chỉnh tay, hoặc lưu theo lịch, cách tính cũ), nút "Tính lại theo công thức" đưa mọi ô của các dòng đó về công thức (chưa lưu). Mở popup không tự tính lại ngày đã lưu;
    - ngày sai thứ tự (luật dưới) tô đỏ ô, chặn Lưu với lý do; thanh xem trước trên bảng dàn chuyền dùng Kết thúc vào chuyền của dòng.
    Dòng ngoài phạm vi sửa (không gửi lên) hiện số đã lưu. Người chỉ được xem thấy số máy chủ đã lưu.
  - Dòng mới nhận sẵn phần SL kế hoạch còn lại. Sửa được khi có `order.lineplan:update` **và** sửa được cột "Ngày bắt đầu SX" (`startDate`) của chính sách cột.
- **Luật máy chủ khi lưu** (`PUT /order/line-plans/:id/lines`, cả bảng một transaction):
  - Số ngày SX = Số lượng / Năng suất TB, phần lẻ từ ngưỡng của lịch ĐVCS trở lên thì làm tròn lên một ngày, dưới thì bỏ, ít nhất 1 ngày (`productionDaysOf`, mặc định 0,5: 7,3 → 7; 7,5 → 8; quyết định 6.11); quá 366 ngày: 422. Kết thúc vào chuyền, Bắt đầu/Kết thúc ra chuyền, Bắt đầu/Kết thúc nhập kho: lấy ngày client gửi (`endDate`, `outStartDate`, `outEndDate`, `warehouseStartDate`, `warehouseEndDate`, tùy chọn); ngày không gửi thì giữ ngày đã lưu nếu dòng cũ không đổi số lượng, năng suất, ngày bắt đầu (người không sửa được cột Ngày kết thúc SX, giao diện cũ không đè ngày người khác chỉnh tay), còn lại tính theo lịch làm việc của ĐVCS của kế hoạch (`ShipmentPlan.BranchCode`; hàm `lineDates` ở `backend/src/platform/catalog/work-calendar.ts`, đọc lịch qua `CatalogLookupService.workCalendar`). Số ngày nghỉ luôn do máy chủ đếm tới Kết thúc vào chuyền (`offDaysBetween`); `offDays` client gửi bị bỏ (ValidationPipe `whitelist`).
  - Thứ tự ngày (`datesOrderError`, cùng bản ở giao diện), sai thì 422 "Dòng N: …": Kết thúc vào chuyền và Bắt đầu ra chuyền không trước Bắt đầu vào chuyền; Kết thúc ra chuyền và Bắt đầu nhập kho không trước Bắt đầu ra chuyền; Kết thúc nhập kho không trước Bắt đầu nhập kho; không ngày nào quá 6 năm sau Bắt đầu vào chuyền. Ngày theo công thức luôn qua.
  - `endDate` là cột "Ngày kết thúc SX" của chính sách cột: người không sửa được cột này gửi `endDate` thì 403 `FIELD_READONLY` (`FieldPolicyInterceptor`); giao diện khóa ô, giữ ngày đã lưu, chỉ tính lại khi ô nhập đổi, không gửi. Bốn ngày còn lại chưa có cột chính sách riêng, sửa được khi sửa được dòng.
  - Kết thúc vào chuyền = ngày làm việc thứ (Số ngày SX) đếm từ sau Bắt đầu vào chuyền (ngày bắt đầu không tính); Số ngày nghỉ = số ngày nghỉ (nghỉ hằng tuần, nghỉ lễ, Tết; ngày làm bù là ngày làm việc) gặp trên đường đếm, kể cả ngày nghỉ chỉ lọt vào khoảng khi ngày kết thúc bị đẩy lùi. Luôn có Kết thúc = Bắt đầu + Số ngày SX + Số ngày nghỉ (người dùng chốt 15/10/2026, quyết định 6.9). Ví dụ: bắt đầu thứ Năm 15/10/2026, SX 3 ngày: 16, 17, (Chủ nhật 18 nghỉ), 19 → kết thúc 19/10, nghỉ 1.
  - Bắt đầu ra chuyền = Bắt đầu vào chuyền + 3; Kết thúc ra chuyền = Kết thúc vào chuyền + 3; Bắt đầu nhập kho = Bắt đầu ra chuyền + 2; Kết thúc nhập kho = Kết thúc ra chuyền + 5. Đơn vị là ngày lịch, không bỏ qua ngày nghỉ (15/10 + 3 = 18/10 dù là Chủ nhật); số ngày lấy theo cấu hình của ĐVCS (mặc định 3/3/2/5). Lịch không đủ ngày làm việc trong khoảng 3 năm: 422.
  - Chuyền phải là chuyền đang dùng của ĐVCS phiên khi xếp việc mới vào (dòng mới hoặc dòng đổi chuyền; `OrgService.assertLine`); dòng cũ giữ chuyền thì không kiểm (chuyền đã giải thể, chuyền mồ côi sau khi đã xếp không khóa việc lưu).
  - Tổng SL dàn chuyền (gồm dòng ở chuyền ngoài phạm vi sửa của người lưu) không vượt SL kế hoạch (422; người không xem được SL kế hoạch, SL đã xếp thì thông báo không nêu số).
  - Dòng "Đang may" hoặc "Đã xong" không xóa, không chuyển chuyền (409).
  - Chỉ thêm, sửa, xóa dòng vừa sửa được vừa xem được; dòng ghi xong phải còn trong phạm vi xem (403 `SCOPE_DENIED`). Chi tiết trả cờ `editable` từng dòng; dòng không sửa được tô xám, không gửi lên, không bị coi là đã xóa.
  - Không phân màu cỡ (phase 5.13): dòng mới chưa có phần giao; kế hoạch có dòng dàn chuyền thì hiện một dòng ở Phân bổ màu cỡ, người dùng chia màu cỡ ở đó.
  - Giảm số lượng của một dòng xuống dưới tổng đã giao cho dòng đó ở Phân bổ màu cỡ: 409, câu báo và `details` liệt kê chuyền (nêu số khi người lưu xem được Số lượng giao của Phân bổ màu cỡ); chỉ xét dòng đang giảm số lượng. Bỏ dòng đã phân màu cỡ thì phần giao của dòng đó bị xóa theo; giao diện hỏi lại trước khi lưu, nêu tên chuyền (không xem được cột Trạng thái thì hỏi cho mọi dòng đã lưu bị bỏ). Đổi chuyền của một dòng thì phần giao đi theo dòng sang chuyền mới, không hỏi.
  - Trạng thái kế hoạch Chưa xếp chuyền ↔ Đã xếp chuyền theo việc còn dòng nào không (chỉ khi kế hoạch đang ở một trong hai trạng thái này).
  - Khóa kế hoạch rồi khóa các dòng dàn chuyền trước khi chạm màu cỡ (cùng thứ tự với Phân bổ màu cỡ).
  - Kế hoạch may (phase 5.16, quyết định 14.2): dòng đã có số ở Kế hoạch may không bỏ, không đổi chuyền; không giảm Số lượng xuống dưới tổng Kế hoạch ngày xưởng giao mọi ngày: 409, nêu chuyền (nêu số khi người lưu xem được Đã giao ở Kế hoạch may). Tra qua `LineDayPlanGuards` sau khi ghi dòng dàn chuyền, trước commit (dòng đang giữ khóa ghi nên lần Cập nhật Kế hoạch may chạy chồng phải chờ và đọc số mới; câu tra chờ khóa tối đa 3 giây); không tra được thì 409 "thử lại".
  - Nhật ký: `ShipmentPlan` `LINE_SCHEDULE` (dòng trước, sau).

### 4.6 Phân bổ màu cỡ (`order.colorsize`)

Mỗi dòng là một kế hoạch xuất hàng đã xếp chuyền (phase 5.13): lưu dàn chuyền ở Xếp chuyền thì kế hoạch hiện ở đây, một dòng dù xếp nhiều chuyền. Mở dòng để chia màu cỡ của kế hoạch cho các chuyền đã xếp. Màn: `frontend/src/features/order/ColorSizePage.tsx`, luật của popup `colorSizeRules.ts`; service `backend/src/modules/order/color-size.service.ts`.

- **Cột:** Khách hàng, Mã hàng, PO/Buy date, ĐVCS, Ngày xuất hàng (của kế hoạch); Chuyền may (các chuyền trong phạm vi xem, nối theo thứ tự dàn chuyền; tên tra trên mọi ĐVCS kể cả chuyền đã giải thể, mã không còn là chuyền thì "<mã> (chuyền cũ)", mã chuyền bị Ẩn/Che thì không trả tên); Ngày bắt đầu chuyền (sớm nhất), NSBQ chuyền (kế hoạch xếp nhiều chuyền: trung bình cộng NSBQ các chuyền trong phạm vi xem, không theo SL, làm tròn sản phẩm; lọc, sắp xếp được; người dùng yêu cầu 16/10/2026, thay Q3 liệt kê từng chuyền), Ngày kết thúc chuyền (muộn nhất); Số lượng kế hoạch (SL của kế hoạch); Số lượng giao (tổng giao mọi chuyền của kế hoạch); Trạng thái: Chưa phân màu cỡ (chưa giao gì), Phân một phần, Đã phân đủ (tổng giao bằng SL kế hoạch), tính lúc đọc (Q4); Ngày tạo (lúc lưu dòng dàn chuyền đầu tiên, mặc định mới lên trước).
- Người chỉ có phạm vi một chuyền thấy kế hoạch có chuyền đó, cột Chuyền may chỉ có chuyền đó, kèm câu "Bạn đang thấy dữ liệu của <chuyền> theo phạm vi được giao"; Số lượng kế hoạch, Số lượng giao, Trạng thái vẫn là của cả kế hoạch.
- **Lọc:** dải lọc có Trạng thái (ba mức trên) và Chuyền. Lọc Chuyền (dải lọc và lọc theo cột) là kế hoạch có ít nhất một chuyền đã chọn trong số chuyền xem được, cột vẫn hiện đủ các chuyền; giá trị của popup lọc là từng chuyền. Popup lọc gửi các chuyền được tích (`in`) hoặc các chuyền bị bỏ tích (`notIn`): với `notIn`, kế hoạch còn ít nhất một chuyền không bị bỏ tích thì vẫn hiện, nên hai cách chọn cùng một tập chuyền cho cùng kết quả (`hasLines`, tách chuỗi mã bằng `STRING_SPLIT`).
- **Popup "Phân màu cỡ cho chuyền":**
  - Đầu popup: Khách hàng, Mã hàng, PO/Buy date, Ngày xuất hàng, SL kế hoạch, Đã giao. Không có khung theo dõi tổng giao của từng chuyền (người dùng bỏ 14/10: kế hoạch có thể nhiều chuyền); chuyền giao vượt SL đã xếp vẫn được kiểm và liệt kê ở khung cảnh báo. Phần đã giao cho chuyền ngoài phạm vi xem chỉ có tổng (một câu trên lưới). Ô Đã giao và chân popup tính theo lưới cộng phần của chuyền ngoài phạm vi xem cho các màu cỡ còn trong kế hoạch; phần giao cũ của chuyền ngoài phạm vi cho màu cỡ đã bị bỏ khỏi kế hoạch (dữ liệu của cách làm cũ) không có trong popup nhưng vẫn tính ở cột Số lượng giao, Trạng thái của danh sách.
  - Lưới nhập (`SheetGrid`): Màu SP, Cỡ SP, Số lượng KH (SL KHXH của màu cỡ) lấy từ kế hoạch xuất hàng, chỉ đọc (người dùng yêu cầu 14/10: cố định, không chọn lại màu, cỡ), Còn lại (SL KH trừ tổng giao mọi chuyền, gồm phần ngoài phạm vi; âm tô đỏ), Chuyền (chọn trong các chuyền đã xếp của kế hoạch mà người dùng sửa được; một chuyền có hai dòng dàn chuyền thì kèm ngày vào chuyền), **Số lượng giao** (nhập). Cột Còn lại không có trong mô tả của BA: thêm để tách một màu cỡ cho nhiều chuyền không phải tự trừ.
  - Mở ra: theo thứ tự màu cỡ của kế hoạch, mỗi phần giao đã lưu một dòng; màu cỡ chưa có dòng sửa được thì thêm một dòng trống (người dùng chỉ sửa được một chuyền thì chọn sẵn chuyền đó, không tính là đã đổi). Tách một màu cỡ cho chuyền khác: chọn một ô của màu cỡ đó rồi bấm "Thêm N dòng" (hoặc chuột phải: chèn, nhân bản dòng; Shift+Enter): dòng mới nằm ngay dưới, chép màu, cỡ của dòng ngay trên nó (`settleNew`: màu cỡ theo vị trí chèn, không theo ô đã chọn trước đó), bỏ chuyền và số, ô Chuyền của dòng mới được chọn sẵn; chưa chọn ô nào thì nhắc chọn trước. Dán quá cuối lưới không thêm dòng (không biết màu cỡ của dòng thừa): bỏ phần thừa và nhắc. Mỗi màu cỡ của kế hoạch giữ ít nhất một dòng người dùng sửa được, vì màu cỡ không thêm lại được: nút xóa của dòng cuối mờ kèm lý do (`lastOfCell`), xóa nhiều dòng một lúc mà mất hết dòng của một màu cỡ thì cả lần xóa bị bỏ (`lostCells`); không giao thì để trống Số lượng giao. Dòng của chuyền không sửa được tô xám, không xóa được, không gửi lên.
  - Gộp ô (chỉ hiển thị, dữ liệu vẫn mỗi chuyền một dòng): các dòng liền nhau cùng màu cỡ hiện Màu SP, Cỡ SP, Số lượng KH, Còn lại (lưới chỉ xem: Màu, Cỡ, SL KH) một lần, căn giữa cả ngang và dọc của khối, các ô của khối không có viền ngang, như ô merge của Excel (`mergeRuns`, `mergeClass` trong `colorSizeRules.ts`). Bốn cột này căn giữa ở mọi dòng cho thẳng cột. Lưới nhập vẽ từng dòng riêng: chữ đặt ở dòng giữa khối, khối chẵn dòng dời lên nửa dòng; các dòng khác ẩn chữ khỏi mắt (trình đọc màn hình vẫn đọc). Lưới chỉ xem dùng `rowSpan` của bảng. Dòng của chuyền không sửa được gộp chung với dòng sửa được (bốn cột gộp đều chỉ đọc, cùng nền). Dòng mới luôn nằm cạnh dòng cùng màu cỡ nên khối luôn liền.
  - Nút "Chia theo SL chuyền": phần chưa giao của mỗi màu cỡ chia lần lượt cho các chuyền sửa được theo SL đã xếp của từng chuyền (`lineShares`: tổng mỗi chuyền không vượt SL chuyền, mỗi màu cỡ không vượt phần chưa giao; cùng cách chia của dàn chuyền mô phỏng); đã có số thì hỏi lại. Khóa khi SL kế hoạch hoặc SL chuyền bị Che, Ẩn.
  - Kiểm ngay trên lưới, cùng luật với máy chủ: có SL giao mà chưa chọn chuyền, màu cỡ không có trong kế hoạch, một chuyền một màu cỡ hai dòng, màu cỡ giao vượt SL KH, chuyền giao vượt SL đã xếp: tô đỏ ô, khung cảnh báo liệt kê, nút Lưu khóa kèm lý do. Dòng trống, dòng 0 không gửi lên. Dòng khóa (chuyền không sửa được) không bị tính lỗi màu cỡ không có trong kế hoạch, vì người dùng không sửa, không xóa được nó.
  - Cột Số lượng giao bị Ẩn, Che: ô Đã giao hiện như máy chủ trả (`***`, –), chân popup không có tổng; popup chỉ xem.
  - Lưới nhập dựng cột một lần, đọc tổng và lỗi mới nhất qua `ref` (`SheetGrid` là lưới tĩnh, [Giao diện](10-giao-dien.md) mục 9.3).
  - Sửa được khi có `order.colorsize:update`, cột `assignedQty` Sửa được, xem được cột `lineCode` và kế hoạch có chuyền trong phạm vi sửa; không thì lưới chỉ xem kèm câu nói lý do.
- **Luật máy chủ** (`PUT /order/color-size/:planId`): thay toàn bộ phần giao của các chuyền người dùng sửa được (vừa sửa được vừa xem được, như Xếp chuyền); chuyền khác giữ nguyên và vẫn tính vào tổng.
  - Chuyền phải là dòng dàn chuyền của kế hoạch trong phạm vi sửa; màu, cỡ phải có trong kế hoạch (so không phân biệt hoa thường, bỏ khoảng trắng hai đầu, ghi theo tên của kế hoạch); một chuyền một màu cỡ một dòng. Vi phạm: 422.
  - Tổng giao của một màu cỡ trên mọi chuyền (phần của chuyền ngoài phạm vi chỉ đọc tổng) không vượt SL KHXH của màu cỡ; chỉ xét màu cỡ người dùng có giao, nên dữ liệu cũ lệch của chuyền khác không chặn việc lưu phần của mình. Tổng giao của một chuyền không vượt SL đã xếp cho chuyền đó (người dùng chốt Q2). Vi phạm: 422, câu báo và `details` liệt kê; không nêu số khi người lưu không xem được Số lượng kế hoạch.
  - Kiểm kế hoạch có chuyền người dùng sửa được (không thì 404) rồi mới khóa kế hoạch theo Id; đọc dòng dàn chuyền, phần giao sau khi khóa.
  - Ghi: dòng dàn chuyền trước, phần giao sau (thứ tự kế hoạch → dòng → màu cỡ). Trạng thái dòng dàn chuyền Chưa phân màu cỡ ↔ Đã phân màu cỡ theo tổng giao của chuyền > 0 (chỉ khi dòng đang ở một trong hai trạng thái này); chuyền có phần giao đổi (thêm, bỏ, sửa số lượng giao; không tính đổi thứ tự dòng, bản chụp SL KHXH) được ghi người, lúc sửa (`ModifiedBy`, `ModifiedAt`), để dàn chuyền mô phỏng biết kế hoạch đã có người sửa kể cả khi chỉ bớt phần giao. Phần giao không đổi giữ nguyên; dòng đổi, dòng bỏ (kể cả dòng 0 của cách làm cũ) xóa rồi thêm lại theo lô.
  - Câu lỗi nêu chuyền, màu, cỡ (không nêu số dòng: giao diện bỏ dòng trống, dòng 0, dòng khóa khi gửi nên thứ tự khác số thứ tự trên lưới).
  - Nhật ký `ShipmentPlan` `COLOR_SIZE_ALLOCATE` (Id kế hoạch; phần giao trước, sau của các chuyền đã lưu, kèm mã chuyền).
- Phần giao luôn đúng khi màn khác đổi: Xếp chuyền không giảm SL chuyền dưới phần đã giao, Kế hoạch xuất hàng không giảm SL KHXH của màu cỡ dưới phần đã giao (409, mục 4.3, 4.5); bỏ dòng dàn chuyền thì xóa phần giao của dòng đó.
- Phần giao (cộng mọi kế hoạch cùng mã hàng) của một chuyền, màu, cỡ không giảm xuống dưới số BTP đã cấp ở Xác nhận cấp BTP: lưu Phân bổ màu cỡ, lưu Xếp chuyền (xóa dòng, đổi chuyền) trả 409 (quyết định 13.8, [Cắt](15-cat.md)). Module Cắt đăng ký vào `LineSupplyGuards` (`line-supply-guard.ts`); hai service chụp phần giao trước khi ghi và kiểm sau khi ghi, trước commit, chỉ xét ô giảm. Không tra được số đã cấp (lần lưu số cấp cùng chuyền giữ khóa quá 3 giây, hoặc module Cắt không phản hồi) thì 409 "thử lại".

### 4.7 Trạng thái và ai đổi

| Bảng | Mã | Nhãn trên màn | Ai đặt |
|---|---|---|---|
| `SalesOrder` | `NEW` | Mới | Mặc định khi thêm; nạp BRAVO đơn chưa đóng lệnh |
| | `PLANNING`, `IN_PRODUCTION` | Đã lập kế hoạch, Đang sản xuất | Chỉ người dùng chọn tay, hoặc dữ liệu mẫu, mô phỏng. Lập kế hoạch **không** tự đổi trạng thái đơn |
| | `DONE` | Hoàn thành | Người dùng; nạp BRAVO khi đơn đóng lệnh (`EndDatePrice`): đơn mới vào thẳng Hoàn thành, đơn đã có chỉ đổi Mới → Hoàn thành |
| | `CANCELLED` | Đã hủy | Người dùng |
| `SalesOrderPo` | `DRAFT`, `CONFIRMED` | Chưa xác nhận, Đã xác nhận | Nút Xác nhận/Hủy xác nhận (`ConfirmedAt`, `ConfirmedBy`). PO của đơn đã đóng lệnh nạp từ BRAVO vào ở Đã xác nhận, `ConfirmedBy` trống. Danh sách mã hàng thêm `PARTIAL` (Xác nhận một phần), chỉ tính khi trả về |
| `ShipmentPlan` | `PLANNED`, `SCHEDULED` | Chưa xếp chuyền, Đã xếp chuyền | Tạo kế hoạch; lưu dàn chuyền |
| | `IN_PRODUCTION`, `DONE` | Đang sản xuất, Hoàn thành | Chưa có đường nào của ứng dụng đặt; chỉ dữ liệu mẫu, mô phỏng (chờ module sản xuất) |
| `ShipmentPlanLine` | `PLANNED`, `ALLOCATED` | Chưa phân màu cỡ, Đã phân màu cỡ | Dòng mới; lưu phân màu cỡ (tổng giao của chuyền > 0) |
| | `IN_PRODUCTION`, `DONE` | Đang may, Đã xong | Chưa có đường nào của ứng dụng đặt; chỉ dữ liệu mẫu, mô phỏng. Dòng ở hai trạng thái này không xóa, không đổi chuyền được |
| Kế hoạch ở màn Phân bổ màu cỡ | `PLANNED`, `PARTIAL`, `FULL` | Chưa phân màu cỡ, Phân một phần, Đã phân đủ | Không lưu: tính lúc đọc từ tổng giao mọi chuyền so với SL kế hoạch. Mã đủ là `FULL`, khác `ALLOCATED` của dòng dàn chuyền vì hai mã cùng nằm trong kết quả của popup |

## 5. Chính sách cột

Cột đăng ký cho Chính sách cột (`SysResourceField`, seed `resourceFields`; mã cột trùng khóa JSON của API). Cột **nhạy cảm** (đánh dấu S) mặc định Ẩn, đọc được thì ghi nhật ký đọc dữ liệu nhạy cảm; cơ chế chung ở [Phân quyền](04-phan-quyen.md), chính sách mẫu theo vai trò ở [Dữ liệu mẫu và kiểm thử](12-du-lieu-mau-va-kiem-thu.md).

| Tài nguyên | Cột đăng ký |
|---|---|
| `order.allocation` | `orderNo`, `customerName`, `styleCode`, `season`, `orderType`, `productName`, `productionFactoryCode`, `staffName`, `qty`, `unitName`, `unitPrice` (S), `amount` (S), `cmPrice` (S), `syncedAt`, `shipDate`, `statusCode` |
| `order.poallocation` | `brand`, `season`, `po`, `so`, `shipMode`, `styleName`, `styleNo`, `color`, `etdActual`, `etdRevised`, `factoryName`, `branchCode`, `isFactoryManual`, `osmFactoryName`, `isInOsm` |
| `order.shipment` | `planNo`, `customerName`, `styleCode`, `productName`, `poBuyDate`, `syncedAt`, `shipDate`, `plannerName`, `planQty`, `cutQty`, `sewnQty`, `endlineQty`, `finishedQty`, `statusCode` |
| `order.po` | `poCode`, `poNumber`, `customerName`, `styleCode`, `qty`, `syncedAt`, `shipDate`, `destination`, `packingListCode`, `customsDeclarationNo`, `statusCode` |
| `order.lineplan` | `planNo`, `customerName`, `styleCode`, `orderType`, `poBuyDate`, `planQty`, `scheduledQty`, `remainingQty`, `cmPrice` (S), `revenue` (S), `syncedAt`, `startDate`, `endDate`, `shipDate`, `statusCode` |
| `order.colorsize` | `customerName`, `styleCode`, `poBuyDate`, `lineCode`, `startDate`, `avgOutput`, `endDate`, `shipDate`, `qty`, `assignedQty`, `statusCode` |

Cách module áp:

- Mỗi controller khai báo `@FieldResource(<tài nguyên>)`: dữ liệu trả về bỏ cột Ẩn, cột Che thành `"***"`; dữ liệu gửi lên có khóa (kể cả trong mảng lồng như `lines[].qty`, `lines[].planQty`, `rows[].assignedQty`, `lines[].startDate`) mà người dùng không sửa được thì 403 `FIELD_READONLY`. Vì vậy giao diện chỉ gửi trường được sửa.
- Hai endpoint dùng chính sách của `order.po` thay cho của kế hoạch (`@FieldResource('order.po')` ở handler): `GET /shipment-plans/candidates/:id/pos` và `GET /shipment-plans/:id/pos`. Lý do: interceptor áp theo tên khóa, mà hai tài nguyên cùng có `statusCode`, `shipDate`, `syncedAt`.
- Popup Chọn mã hàng (`candidates`): service áp chính sách của `order.allocation` (dữ liệu đọc từ Thông tin đơn hàng, ADR 0006); SL còn lại suy ra được SL đơn hàng nên theo cùng mức của `qty`.
- **Cột suy ra theo cột nguồn:**
  - "PO của kế hoạch": Ngày xác nhận theo `statusCode`; SL đã xác nhận, SL chưa xác nhận theo mức chặt hơn của `qty` và `statusCode`. Bị Che thì luôn `***`, kể cả khi giá trị trống hay bằng 0 (để trống là lộ trạng thái).
  - Màu cỡ của kế hoạch (`GET /shipment-plans/:id`, `presentPlanLine`): `originalQty` theo `qty` của `order.po` (thiếu `order.po:view` thì như Ẩn); `plannedQty` theo `planQty`; `remainingQty` theo mức chặt hơn của hai cột. Lưới màu cỡ của popup (`GET /shipment-plans/draft`) chưa áp. Giao diện chỉ mở popup cho người có quyền thêm, sửa, nhưng `/draft`, `/candidates` chỉ đòi `order.shipment:view`: người chỉ xem có thêm `order.po:view` gọi thẳng API vẫn đọc được số chưa áp (có từ trước 5.9.15; mục "Cao", câu hỏi Q34 ở [Trạng thái](../current/STATUS.md)).
  - Phân bổ PO: `branchCode`, `osmFactoryName`, `isFactoryManual`, `isInOsm` theo mức chặt hơn của chính nó và `factoryName` (mục 4.2).
  - Phân bổ màu cỡ: tên chuyền không trả khi `lineCode` bị Ẩn/Che. Popup: khóa lồng trong `lines[]`, `colorSizes[]`, `rows[]` theo cùng mã (`qty` của chuyền và của màu cỡ theo Số lượng kế hoạch, `assignedQty` theo Số lượng giao); `hiddenQty` theo `assignedQty`. Thân lệnh lưu chỉ có `assignedQty` là cột đăng ký (`lineId` không phải), nên cần Sửa được cột Số lượng giao; service kiểm mức của cột này trước khi đọc kế hoạch, kể cả khi `rows` rỗng (bỏ hết phần giao, body không có khóa nào để `FieldPolicyInterceptor` chặn): 403 `FIELD_READONLY`.
  - Thông báo 409 của Xếp chuyền, Kế hoạch xuất hàng về phần đã giao nêu số (chỉ tổng của chuyền, của màu cỡ) khi người sửa có quyền xem Phân bổ màu cỡ và xem được cột Số lượng giao ở đó (`assignedVisible`); không xét phạm vi chuyền của người đó ở Phân bổ màu cỡ, như tổng của `totalExcept`.
- **Không lọc, tìm, sắp xếp, gợi ý theo cột bị Ẩn/Che** (dò được giá trị): `readableQuery` (`order.util.ts`) bỏ tham số lọc và cột tìm kiếm; `FieldPolicyService.safeSort` bỏ sắp xếp; `/options` trả rỗng cho cột đó; `/values` của cột đó trả 403 `FIELD_NOT_READABLE`. Danh sách lọc theo giá trị (`FILTER` ở từng service) không có cột giá (liệt kê giá trị là lộ giá mà không ghi nhật ký đọc).
- **Cột tính sẵn không nhập được:** `Amount` (Thành tiền), `Revenue` (Doanh số) là cột tính trong DB; `scheduledQty`, `remainingQty`, ngày bắt đầu, kết thúc SX tính từ dòng dàn chuyền.
- Nhật ký sửa đơn hàng bỏ cột nhạy cảm (`FieldPolicyService.redact`).

## 6. API `/order/*`

Tiền tố `/api/v1`. Mọi endpoint cần đăng nhập và quyền ghi ở cột "Quyền" (nhiều quyền thì cần đủ tất cả). Lỗi kiểm dữ liệu vào: 422 `VALIDATION_FAILED`. Dòng không có, của ĐVCS khác, ngoài phạm vi: 404 `NOT_FOUND`. Ghi ở `A00`: 403 `AGGREGATE_READ_ONLY`. Khóa chéo: 409 `CONFLICT`. Mã lỗi chung ở [Luồng dữ liệu](../DATA_FLOWS.md) mục 2, 4.2. Các `DELETE` của module hiện trả 204 không có body (`@HttpCode(204)` ở `order.controller.ts`); quy ước đã duyệt là 200 kèm `{ removed: true }`: [Quy ước code](../CODE_CONVENTIONS.md) mục 4.1.

**Tham số danh sách chung** (`OrderListQuery`): `page` (mặc định 1), `pageSize` (mặc định 100, tối đa 200), `q` (tìm nhanh, ≤60), `sort` (`trường:asc|desc`, theo danh sách trắng của màn; mặc định `createdAt:desc`), `shipFrom`, `shipTo` (`YYYY-MM-DD`), `customer` (chứa), `style` (chứa), `season` (bằng, chỉ đơn hàng), `status` (bằng), `line` (kế hoạch có chuyền đó, chỉ Phân bổ màu cỡ), `cf` (lọc theo cột, JSON, xem [Giao diện](10-giao-dien.md)). Kết quả `{ items, total, page, pageSize }`. Endpoint `/values` nhận thêm `field` (trường của danh sách trắng) và `search`, trả `{ values, truncated }` (tối đa 500 giá trị). Endpoint `/export` trả CSV UTF-8 có BOM, cùng bộ lọc, qua cùng chính sách cột, tối đa 10.000 dòng (riêng Phân bổ PO: 50.000; Phân bổ PO, Phân bổ màu cỡ quá giới hạn thì 422, các màn khác cắt ở giới hạn).

### Thông tin đơn hàng – `/order/sales-orders`

| Method, path | Quyền | Body, tham số | Kết quả | Lỗi đặc thù |
|---|---|---|---|---|
| `GET /` | `order.allocation:view` | Tham số chung | Trang đơn hàng: `{ id, orderNo, customerName, styleCode, season, orderType, productName, staffName, qty, unitName, unitPrice, amount, cmPrice, syncedAt, shipDate, statusCode, branchCode, productionFactoryCode, factoryFromOsm, createdAt, modifiedAt, cmPriceEditable }`. `cmPriceEditable`: đơn của ĐVCS khác mà phiên sửa được Giá CM qua `PUT /:id/cm-price` (ĐVCS phiên có kế hoạch xuất hàng của đơn); đơn của ĐVCS phiên và mọi đơn ở phiên `A00`: `false` | |
| `GET /options` | `order.allocation:view` | | `{ customers, seasons, orderTypes, orderTypeNames, units, factories: [{ code, name, branchCode, isActive }] }` (nhà máy gồm cả mục đã ngừng để hiện tên; cột bị Ẩn/Che thì rỗng) | |
| `GET /values` | `order.allocation:view` | `field`, `search` + tham số chung | `{ values, truncated }` | 403 `FIELD_NOT_READABLE` |
| `GET /export` | `order.allocation:export` | Tham số chung | CSV `thong-tin-don-hang-<ĐVCS>.csv` (Chi nhánh FOB, Nhà máy SX ghi tên) | |
| `GET /:id` | `order.allocation:view` | | Một đơn, cùng trường như danh sách (kèm `cmPriceEditable`) | 404 |
| `POST /` | `order.allocation:create` | `{ customerName, styleCode, productName, qty, shipDate, season?, orderType?, staffName?, unitName?, unitPrice?, cmPrice?, statusCode?, productionFactoryCode? }` | Đơn vừa tạo (201) | 422 nhà máy SX lạ, đã ngừng |
| `PUT /:id` | `order.allocation:update` | Các trường như POST, chỉ gửi trường đổi | Đơn sau khi sửa | 404 (ĐVCS khác); 409 đổi Nhà máy SX theo OSM; 422 nhà máy lạ |
| `PUT /:id/cm-price` | `order.allocation:update` | `{ cmPrice: number \| null }` (bắt buộc gửi khóa) | Đơn sau khi sửa, kèm `cmPriceEditable` | 404 (ĐVCS không phải nguồn, không có kế hoạch của đơn); 403 `AGGREGATE_READ_ONLY`, `FIELD_READONLY`; 422 |
| `DELETE /:id` | `order.allocation:delete` | | 204 | 404; 409 đơn đã có PO, kế hoạch |

### Phân bổ PO – `/order/po-allocations`

| Method, path | Quyền | Body, tham số | Kết quả | Lỗi đặc thù |
|---|---|---|---|---|
| `GET /` | `order.poallocation:view` | `page`, `pageSize`, `sort`, `customer` (Brand), `season`, `style`, `q` (PO, SO), `cf` | `{ items: [{ id, rowNo, brand, season, po, so, shipMode, styleName, styleNo, color, etdActual, etdRevised, factoryName, branchCode, osmFactoryName, isFactoryManual, isInOsm }], total, page, pageSize, syncedAt, sourceActive, lastRefresh }`. `lastRefresh`: `null`, hoặc `{ at, reason (EMPTY, SHRINK), sourceRows, previousRows, keptAbsent, maxShrinkPercent }`. Máy chưa có `MES_Sync` vẫn trả trang, `sourceActive = false` | |
| `GET /options` | `order.poallocation:view` | | `{ brands, seasons, factories: [{ code, name, branchCode }] }` (Brand, Season đang có trong bảng; nhà máy đang dùng của danh mục cho popup Đổi nhà máy SX; cột bị Ẩn/Che thì rỗng) | |
| `GET /values` | `order.poallocation:view` | `field`, `search` + bộ lọc | `{ values, truncated }` | 403 `FIELD_NOT_READABLE` (kể cả cột suy ra khi Nhà máy SX bị Ẩn/Che) |
| `GET /export` | `order.poallocation:export` | Bộ lọc | CSV `phan-bo-po.csv` | 422 quá 50.000 dòng |
| `PUT /factory` | `order.poallocation:update` | `{ ids: number[] (1–500), factoryName?, dryRun?: boolean }`. `factoryName`: mã nhà máy của danh mục (≤ 100 ký tự, không dấu phẩy, không ký tự điều khiển); `null` là "Theo OSM"; bỏ trống chỉ khi `dryRun` | `{ rows, keys, removed, removable, dryRun }`: số dòng, số khóa bị áp, số dòng đã bỏ, số dòng không còn trong OSM sẽ bị bỏ nếu chọn "Theo OSM" | 403 `AGGREGATE_READ_ONLY`, `FIELD_READONLY`, `FACTORY_OF_OTHER_BRANCH` (`details.rows`, `details.total`), `SCOPE_DENIED`; 404 dòng không còn; 409 đang làm mới, dữ liệu vừa đổi; 422 nhà máy lạ hoặc đã ngừng, thiếu nhà máy |

### Kế hoạch xuất hàng – `/order/shipment-plans`

| Method, path | Quyền | Body, tham số | Kết quả | Lỗi đặc thù |
|---|---|---|---|---|
| `GET /` | `order.shipment:view` | Tham số chung | Trang kế hoạch: `{ id, planNo, salesOrderId, customerName, styleCode, productName, poBuyDate, branchCode, syncedAt, shipDate, plannerName, planQty, cutQty, sewnQty, endlineQty, finishedQty, statusCode, createdAt }` | |
| `GET /values`, `GET /export` | `:view`, `:export` | | Như mục chung; file `ke-hoach-xuat-hang-<ĐVCS>.csv` | |
| `GET /candidates` | `order.shipment:view` | `shipFrom`, `shipTo`, `customer`, `style` | Mảng (tối đa 200): `{ salesOrderId, orderNo, customerName, styleCode, productName, branchCode, productionFactoryCode, orderQty, plannedQty, remainingQty, syncedAt, shipDate }` | |
| `GET /candidates/:id/pos` | `order.shipment:view` | `:id` = Id đơn hàng | Mảng PO `{ id, poCode, poNumber, qty, destination, syncedAt, shipDate, statusCode }`, tối đa 200. PO đọc qua phạm vi xem của `order.po`: không có phép gán xem `order.po` thì mảng rỗng | 404 đơn không có nhà máy SX của ĐVCS |
| `GET /draft` | `order.shipment:view` | `salesOrderId`; lập mới: `poIds` (`1,2,…`, tối đa 100, bắt buộc); sửa: `excludePlanId`, `addPoIds?` (PO thêm; PO của kế hoạch máy chủ tự đọc, `poIds` bị bỏ qua) | Lưới màu cỡ `[{ colorName, sizeName, originalQty, plannedQty, remainingQty }]` | 404 (lập mới: đơn không có nhà máy SX của ĐVCS; sửa: kế hoạch không xem được); 422 PO không thuộc đơn hoặc không xem được ở `order.po`, kế hoạch không thuộc mã hàng |
| `GET /:id` | `order.shipment:view` | | Kế hoạch + `poIds` + `lines: [{ colorName, sizeName, originalQty, plannedQty, remainingQty, planQty }]` | 404 |
| `GET /:id/candidate-pos` | `order.shipment:update` **và** `order.po:view` | | PO chưa nằm trong kế hoạch nào của đơn hàng của kế hoạch, cột như `GET /candidates/:id/pos` (chính sách cột `order.po`), tối đa 200 | 403 `A00`, thiếu quyền; 404 kế hoạch không sửa được; 422 đơn không còn Nhà máy SX của ĐVCS, đã Hoàn thành/Hủy |
| `GET /:id/pos` | `order.shipment:view` **và** `order.po:view` | | `{ items: [{ id, poCode, poNumber, destination, shipDate, qty, statusCode, confirmedAt, confirmedQty, unconfirmedQty }], hiddenCount }` | 403 thiếu `order.po:view`; 404 kế hoạch không xem được |
| `POST /` | `order.shipment:create` | `{ salesOrderId, poIds (1–100), poBuyDate (1–40 ký tự), shipDate?, lines: [{ colorName, sizeName, planQty }] (1–300) }` | Kế hoạch vừa tạo (201) | 404 đơn không có nhà máy SX của ĐVCS; 409 đơn đã có kế hoạch ở ĐVCS phiên, PO đã nằm trong kế hoạch; 422 đơn Hoàn thành/Hủy, vượt SL còn lại (`details`), màu cỡ lặp, lạ, tất cả bằng 0 |
| `PUT /:id` | `order.shipment:update` | `{ poBuyDate?, shipDate?, lines?, addPoIds? (1–100, cần `lines`), basePoIds? }` | Kế hoạch sau khi sửa | 409 SL dưới SL đã xếp chuyền; 409 SL KHXH của màu cỡ dưới phần đã giao ở Phân bổ màu cỡ, bỏ màu cỡ đã giao (`details`); 409 PO thêm đã nằm trong kế hoạch, `basePoIds` khác PO đang lưu; 422 như POST, `addPoIds` thiếu `lines`, quá 100 PO, đơn không còn lập kế hoạch được |
| `DELETE /:id` | `order.shipment:delete` | | 204 | 409 đã xếp chuyền; 409 đã có số cắt ở Đồng bộ tiến độ cắt; 409 chưa kiểm được dữ liệu phụ thuộc (module Cắt không phản hồi) |

### Cập nhật tỷ lệ cắt – `/order/cut-ratio`

| Method, path | Quyền | Body, tham số | Kết quả | Lỗi đặc thù |
|---|---|---|---|---|
| `GET /styles` | `order.po:view` | `shipFrom`, `shipTo`, `customer`, `style`, `createdBy=me`, `page`, `pageSize`, `cf` (`customerName`, `styleCode`, `branchCode`) | Trang mã hàng: `{ salesOrderId, customerName, styleCode, branchCode, poCount, confirmedCount, qty, shipDate, statusCode (CONFIRMED, PARTIAL, DRAFT), createdAt }` | |
| `GET /styles/values` | `order.po:view` | `field`, `search` + bộ lọc | `{ values, truncated }` | 403 `FIELD_NOT_READABLE` |
| `GET /pos` | `order.po:view` | `salesOrderId?` + tham số chung | Trang PO: `{ id, salesOrderId, poCode, poNumber, customerName, styleCode, qty, destination, packingListCode, customsDeclarationNo, syncedAt, shipDate, statusCode, confirmedAt, branchCode, createdAt, inPlan }` | |
| `GET /pos/values`, `GET /pos/export` | `order.po:view`, `order.po:export` | `salesOrderId?` + tham số chung | File `ty-le-cat-<ĐVCS>.csv` | |
| `GET /pos/:id/color-sizes` | `order.po:view` | | `{ po, lines: [{ id, colorName, sizeName, qty }] }` | 404 |
| `POST /pos` | `order.po:create` (và phạm vi xem `order.allocation`) | `{ salesOrderId, poNumber, shipDate, destination?, packingListCode?, customsDeclarationNo?, lines: [{ colorName, sizeName, qty }] (1–300) }` | PO vừa tạo (201) | 404 không xem được đơn; 422 mã hàng chưa có PO ở ĐVCS này, màu cỡ lặp; 409 đơn vừa bị xóa |
| `PUT /pos/:id/color-sizes` | `order.po:update` | `{ lines: [{ colorName, sizeName, qty }] }` (0–300) | `{ po, lines }` | 403 `AGGREGATE_READ_ONLY` (`A00`); 403 `FIELD_READONLY` khi cột Số lượng không Sửa được, kể cả `lines: []` và Id không có (kiểm trước khi đọc PO); 404 (không ghi được PO); 409 PO đã xác nhận |
| `POST /pos/:id/confirm` | `order.po:update` | | PO (200) | 409 đã xác nhận, tổng SL bằng 0 |
| `POST /pos/:id/unconfirm` | `order.po:update` | | PO (200) | 409 chưa xác nhận |
| `DELETE /pos/:id` | `order.po:delete` | | 204 | 409 đã xác nhận, đã nằm trong kế hoạch |

### Xếp chuyền – `/order/line-plans`

| Method, path | Quyền | Body, tham số | Kết quả | Lỗi đặc thù |
|---|---|---|---|---|
| `GET /` | `order.lineplan:view` | Tham số chung | Trang: `{ id, planNo, customerName, styleCode, orderType, branchCode, poBuyDate, planQty, scheduledQty, remainingQty, cmPrice, revenue, syncedAt, startDate, endDate, shipDate, statusCode, lineCount, createdAt }` | |
| `GET /values`, `GET /export` | `:view`, `:export` | | File `xep-chuyen-<ĐVCS>.csv` | |
| `GET /board` | `order.lineplan:view` | `from`, `to` (bắt buộc), `style?`, `customer?` | `{ from, to, nonWorkingDays: { <mã ĐVCS>: [{ date, name }] }, lines: [{ code, name, branchCode, isActive }], bars: [{ id, planId, planNo, lineCode, startDate, endDate, qty, avgOutput, customerName, styleCode, poBuyDate, shipDate, statusCode }] }` | 422 khoảng ngày âm hoặc quá 190 ngày |
| `GET /:id` | `order.lineplan:view` | | Kế hoạch + `lines: [{ id, lineCode, lineName, qty, avgOutput, startDate, productionDays, offDays, endDate, outStartDate, outEndDate, warehouseStartDate, warehouseEndDate, statusCode, editable }]`, `calendar: { weeklyOffDays, outStartOffsetDays, outEndOffsetDays, warehouseStartOffsetDays, warehouseEndOffsetDays, productionRoundUpFrom, days: [{ date, dayType, name }] }` (lịch của ĐVCS kế hoạch; ngày đặc biệt từ dòng vào chuyền sớm nhất, hoặc một năm trước hôm nay, trở đi) | 404 |
| `PUT /:id/lines` | `order.lineplan:update` | `{ lines: [{ id?, lineCode, qty, avgOutput, startDate, endDate?, outStartDate?, outEndDate?, warehouseStartDate?, warehouseEndDate? }] }` (tối đa 100; `lineCode` `^[A-Z0-9-]{1,20}$`; trường khác bị bỏ qua) | Chi tiết sau khi lưu | 422 chuyền lạ/ngừng/khác ĐVCS, ngày sai thứ tự, quá 366 ngày, lịch không đủ ngày làm việc, vượt SL kế hoạch, dòng không thuộc kế hoạch; 409 xóa/chuyển dòng đang may, giảm số lượng dưới phần đã giao ở Phân bổ màu cỡ (`details`), xóa, chuyển dòng làm phần giao xuống dưới số BTP đã cấp (`details`); 409 bỏ, đổi chuyền dòng đã có số ở Kế hoạch may, giảm số lượng dưới tổng đã giao ở Kế hoạch may (`details`); 409 "thử lại" khi không tra được số BTP đã cấp hoặc số đã lập ở Kế hoạch may; 403 `SCOPE_DENIED`, `FIELD_READONLY` (gửi `endDate` khi cột Ngày kết thúc SX không sửa được) |

### Phân bổ màu cỡ – `/order/color-size`

| Method, path | Quyền | Body, tham số | Kết quả | Lỗi đặc thù |
|---|---|---|---|---|
| `GET /` | `order.colorsize:view` | Tham số chung (`q` không dùng) | Trang, một dòng mỗi kế hoạch có dòng dàn chuyền trong phạm vi xem: `{ id (Id kế hoạch), planNo, customerName, styleCode, poBuyDate, branchCode, lineCode: string[], lineName?: string[], startDate, avgOutput: number (trung bình cộng NSBQ các chuyền trong phạm vi xem, làm tròn), endDate, shipDate, qty, assignedQty, statusCode (PLANNED, PARTIAL, FULL), createdAt }` | |
| `GET /values`, `GET /export` | `:view`, `:export` | | `values?field=lineCode` trả từng mã chuyền, `values?field=avgOutput` trả số trung bình. File `phan-bo-mau-co-<ĐVCS>.csv`: Chuyền may (tên), NSBQ trung bình, Trạng thái ghi chữ | 422 xuất quá 10.000 kế hoạch |
| `GET /:id` | `order.colorsize:view` | `:id` là Id kế hoạch | Như dòng danh sách, kèm `lines: [{ id, lineCode, lineName, qty, avgOutput, startDate, endDate, statusCode, assignedQty, editable }]` (dòng dàn chuyền trong phạm vi xem; `qty` là SL đã xếp), `colorSizes: [{ colorName, sizeName, qty, hiddenQty }]` (`qty` là SL KHXH; `hiddenQty` tổng đã giao cho chuyền ngoài phạm vi xem), `rows: [{ id, lineId, colorName, sizeName, assignedQty }]` (phần giao > 0 của chuyền trong phạm vi xem) | 404 kế hoạch không có chuyền nào trong phạm vi xem |
| `PUT /:id` | `order.colorsize:update` | `{ rows: [{ lineId, colorName, sizeName, assignedQty }] }` (tối đa 3.000; dòng giao 0 bỏ qua) | Chi tiết sau khi lưu | 404 kế hoạch không có chuyền trong phạm vi sửa; 422 chuyền không thuộc kế hoạch hoặc ngoài phạm vi sửa, màu cỡ lạ, lặp, giao vượt SL KH của màu cỡ hoặc SL đã xếp của chuyền (`details`); 409 phần giao xuống dưới số BTP đã cấp (`details`); 409 "thử lại" khi không tra được số BTP đã cấp; 403 `AGGREGATE_READ_ONLY`, `FIELD_READONLY` |

## 7. Database `MES_Order`

Một database riêng của module (biến `DB_ORDER_NAME`, mặc định `MES_Order`). Quy ước chung (PascalCase, `DATETIME2(3)` UTC, bộ cột kiểm toán) ở [Quy ước code](../CODE_CONVENTIONS.md) mục 1.1.

### Migration

Danh sách file và nội dung từng file: [ARCHITECTURE](../ARCHITECTURE.md) mục 6.2. Ghi chú riêng của module: `0007_factory_osm_po_number.sql` đòi database có compatibility level từ 130 (`STRING_SPLIT`; `OPENJSON` của bước làm mới Phân bổ PO ở `0009` cũng cần), thấp hơn thì dừng (`THROW 50000`: nhờ quản trị CSDL nâng rồi chạy lại migrate); cùng file đó bỏ Nhà máy SX đoán theo mã chi nhánh ở đơn BRAVO chưa ai sửa và đổi `PoNumber` `(tr?ng)` thành `(trống)` ở PO nạp từ BRAVO.

Bảng dưới là trạng thái sau `0009`. Tám bảng đơn hàng, kế hoạch có bộ cột kiểm toán `CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()`, `CreatedBy INT NULL`, `ModifiedAt DATETIME2(3) NULL`, `ModifiedBy INT NULL` và `BranchCode VARCHAR(10) NOT NULL` (khóa ngầm → `MES_Core.SysBranch.Code`); bảng chỉ liệt kê lại khi có ý nghĩa riêng. Hai bảng Phân bổ PO ở cuối mục không có `BranchCode`.

### `SalesOrder` – đơn hàng (`order.allocation`)

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | không | PK |
| `OrderNo` | `VARCHAR(30)` | không | Số đơn: `DH-<ĐVCS>-<Id>` khi nhập tay; số SO của BRAVO khi nạp. Duy nhất trong `BranchCode` |
| `CustomerName` | `NVARCHAR(100)` | không | Khách hàng |
| `StyleCode` | `NVARCHAR(120)` | không | Mã hàng (chữ hoa khi nhập tay) |
| `Season` | `VARCHAR(20)` | có | |
| `OrderType` | `NVARCHAR(30)` | có | Loại (mã danh mục `ORDER_TYPE`, ví dụ SXXK, GCND) |
| `ProductName` | `NVARCHAR(150)` | không | Tên sản phẩm |
| `StaffName` | `NVARCHAR(100)` | có | Người lập đơn bên BRAVO (không phải tài khoản MES) |
| `Qty` | `INT` | không | ≥ 0 |
| `UnitName` | `NVARCHAR(20)` | không | Mặc định `N'Chiếc'` |
| `UnitPrice` | `DECIMAL(18,4)` | có | ≥ 0; nhạy cảm |
| `Amount` | cột tính `CAST(Qty * UnitPrice AS DECIMAL(29,2)) PERSISTED` | có | Thành tiền; nhạy cảm |
| `CmPrice` | `DECIMAL(18,4)` | có | Giá CM, ≥ 0; nhạy cảm |
| `SyncedAt` | `DATETIME2(3)` | có | Ngày đồng bộ: lần chép gần nhất của sản phẩm, PO, màu cỡ của đơn (chỉ để hiện) |
| `ShipDate` | `DATE` | không | Ngày xuất hàng |
| `StatusCode` | `VARCHAR(20)` | không | `NEW` (mặc định), `PLANNING`, `IN_PRODUCTION`, `DONE`, `CANCELLED` (CHECK) |
| `BranchCode` | `VARCHAR(10)` | không | ĐVCS nguồn (Chi nhánh FOB) |
| `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` | | | `CreatedBy` NULL: đơn nạp từ BRAVO. `ModifiedBy` có giá trị: người dùng đã sửa (bước nạp dùng để giữ phần sửa) |
| `SourceProductId` | `INT` | có | `ProductId` của BRAVO (`DM_SanPhamDonHang`); NULL: nhập tay. Duy nhất khi có giá trị |
| `ProductionFactoryCode` | `NVARCHAR(400)` | có | Nhà máy SX: một hoặc nhiều mã `SysProductionFactory.Code` cách nhau dấu phẩy, dạng chuẩn (không khoảng trắng quanh dấu phẩy, không trùng, giữ thứ tự OSM; `backend/src/platform/catalog/factory-list.ts`). Khóa ngầm dạng danh sách |
| `SourceHash` | `CHAR(64)` | có | SHA-256 (hex) dữ liệu BRAVO chưa ánh xạ của đơn ở lần nạp gần nhất (mục 8.2); NULL: nhập tay |
| `IsFactoryFromOsm` | `BIT` | không | Mặc định 0. 1: Nhà máy SX theo OSM, không sửa tay |

Ràng buộc, chỉ mục: `UQ_SalesOrder_IdBranch UNIQUE (Id, BranchCode)` (không còn khóa ngoại nào dùng); `UX_SalesOrder_Branch_OrderNo UNIQUE (BranchCode, OrderNo)`; `UX_SalesOrder_SourceProduct UNIQUE (SourceProductId) WHERE SourceProductId IS NOT NULL`; `IX_SalesOrder_Branch_ShipDate (BranchCode, ShipDate DESC, Id DESC)`; `IX_SalesOrder_Branch_Style (BranchCode, StyleCode)`; `IX_SalesOrder_Branch_CreatedBy (BranchCode, CreatedBy)`; `IX_SalesOrder_CreatedAt (CreatedAt DESC, Id DESC)`; `IX_SalesOrder_CreatedBy (CreatedBy)`. Không có chỉ mục trên `ProductionFactoryCode` (lọc bằng `STRING_SPLIT`).

### `SalesOrderPo` – PO của đơn hàng (`order.po`)

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | không | PK |
| `SalesOrderId` | `INT` | không | FK `FK_SalesOrderPo_SalesOrder` → `SalesOrder(Id)` |
| `PoCode` | `VARCHAR(30)` | không | Mã PO `PO-<ĐVCS>-<Id>`; duy nhất trong `BranchCode` |
| `PoNumber` | `NVARCHAR(192)` | không | PO# của khách (chữ hoa khi nhập tay); PO BRAVO không có số: `(trống)`. PO nhập tay trước `MES_Order/0007` (cột còn là `VARCHAR`) có chữ tiếng Việt thì vẫn còn dấu "?" đã lưu |
| `CustomerName` | `NVARCHAR(100)` | không | Bản chụp từ đơn lúc tạo PO |
| `StyleCode` | `NVARCHAR(120)` | không | Bản chụp từ đơn lúc tạo PO |
| `Qty` | `INT` | không | ≥ 0; luôn bằng tổng màu cỡ (service ghi cùng transaction) |
| `Destination` | `NVARCHAR(60)` | có | Đích đến |
| `PackingListCode` | `VARCHAR(30)` | có | Mã PKL (BRAVO chưa có nguồn) |
| `CustomsDeclarationNo` | `VARCHAR(30)` | có | Số tờ khai (BRAVO chưa có nguồn) |
| `SyncedAt` | `DATETIME2(3)` | có | Lần chép gần nhất của các dòng PO ở BRAVO |
| `ShipDate` | `DATE` | không | Ngày xuất (ETD sớm nhất khi nạp BRAVO) |
| `StatusCode` | `VARCHAR(20)` | không | `DRAFT` (mặc định), `CONFIRMED` (CHECK) |
| `ConfirmedAt` | `DATETIME2(3)` | có | |
| `ConfirmedBy` | `INT` | có | Khóa ngầm → `SysUser.Id`; NULL ở PO đã xác nhận: hệ thống xác nhận khi nạp đơn đóng lệnh |
| `BranchCode` | `VARCHAR(10)` | không | ĐVCS của đơn (PO BRAVO) hoặc của người nhập tay (có thể khác ĐVCS của đơn) |
| `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` | | | `CreatedBy` NULL: PO nạp từ BRAVO; có giá trị: PO nhập tay |

Ràng buộc, chỉ mục: `UQ_SalesOrderPo_IdBranch UNIQUE (Id, BranchCode)` (cho khóa ngoại ghép của màu cỡ); `UX_SalesOrderPo_Branch_PoCode UNIQUE (BranchCode, PoCode)`; `IX_SalesOrderPo_Branch_Order (BranchCode, SalesOrderId)`; `IX_SalesOrderPo_SalesOrderId (SalesOrderId)`; `IX_SalesOrderPo_Branch_CreatedBy (BranchCode, CreatedBy)`; `IX_SalesOrderPo_CreatedAt (CreatedAt DESC, Id DESC)`; `IX_SalesOrderPo_CreatedBy (CreatedBy)`.

### `SalesOrderPoColorSize` – màu cỡ của PO

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | không | PK |
| `SalesOrderPoId` | `INT` | không | Cùng `BranchCode`: FK ghép `FK_SalesOrderPoColorSize_Po (SalesOrderPoId, BranchCode)` → `SalesOrderPo(Id, BranchCode)` |
| `ColorName` | `NVARCHAR(100)` | không | Màu |
| `SizeName` | `VARCHAR(20)` | không | Cỡ (chữ hoa) |
| `Qty` | `INT` | không | ≥ 0 |
| `SortOrder` | `INT` | không | Mặc định 0; thứ tự hiện |
| `BranchCode` + bộ kiểm toán | | | `BranchCode` chép từ PO. `CreatedBy` có giá trị: người dùng đã lưu màu cỡ (bước nạp không thay màu cỡ của PO đó) |

Ràng buộc, chỉ mục: `UQ_SalesOrderPoColorSize UNIQUE (SalesOrderPoId, ColorName, SizeName)`; `IX_SalesOrderPoColorSize_Branch (BranchCode, SalesOrderPoId)`.

### `ShipmentPlan` – kế hoạch xuất hàng (`order.shipment`, `order.lineplan`)

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | không | PK |
| `PlanNo` | `VARCHAR(30)` | không | `KH-<ĐVCS>-<Id>`; duy nhất trong `BranchCode` |
| `SalesOrderId` | `INT` | không | FK `FK_ShipmentPlan_SalesOrder` → `SalesOrder(Id)` (đơn có thể thuộc ĐVCS khác) |
| `CustomerName` | `NVARCHAR(100)` | không | Bản chụp từ đơn |
| `StyleCode` | `NVARCHAR(120)` | không | Bản chụp |
| `ProductName` | `NVARCHAR(150)` | không | Bản chụp |
| `OrderType` | `NVARCHAR(30)` | có | Bản chụp |
| `PoBuyDate` | `NVARCHAR(40)` | không | Chuỗi tham chiếu "PO/Buy date" theo thuật ngữ BA (ví dụ `4500123 / 15-11`), không phải kiểu ngày |
| `PlanQty` | `INT` | không | ≥ 0; tổng SL KHXH theo màu cỡ |
| `CmPrice` | `DECIMAL(18,4)` | có | Giá CM chụp từ đơn lúc lập, ≥ 0; đổi theo đơn mỗi khi Giá CM của đơn đổi (quyết định 14.3) |
| `Revenue` | cột tính `CAST(PlanQty * CmPrice AS DECIMAL(29,2)) PERSISTED` | có | Doanh số |
| `SyncedAt` | `DATETIME2(3)` | có | Chụp từ đơn |
| `ShipDate` | `DATE` | không | Ngày xuất của kế hoạch (có thể khác đơn) |
| `PlannerName` | `NVARCHAR(150)` | không | Họ tên người lập; kế hoạch mô phỏng: `Lập tự động (mô phỏng)` |
| `CutQty`, `SewnQty`, `EndlineQty`, `FinishedQty` | `INT` | không | Mặc định 0; lũy kế cắt, may ra, endline, hoàn thiện. `CutQty` do module Cắt ghi (bản sao Lũy kế, quyết định 13.6); ba cột sau hiện là số mẫu |
| `StatusCode` | `VARCHAR(20)` | không | `PLANNED` (mặc định), `SCHEDULED`, `IN_PRODUCTION`, `DONE` (CHECK) |
| `BranchCode` + bộ kiểm toán | | | `BranchCode`: ĐVCS lập kế hoạch |

Ràng buộc, chỉ mục: `UQ_ShipmentPlan_IdBranch UNIQUE (Id, BranchCode)`; `UX_ShipmentPlan_Branch_PlanNo UNIQUE (BranchCode, PlanNo)`; `IX_ShipmentPlan_Branch_ShipDate (BranchCode, ShipDate DESC, Id DESC)`; `IX_ShipmentPlan_SalesOrderId (SalesOrderId)`; `IX_ShipmentPlan_Branch_CreatedBy (BranchCode, CreatedBy)`.

### `ShipmentPlanPo` – PO đã chọn khi lập kế hoạch

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | không | PK |
| `ShipmentPlanId` | `INT` | không | FK ghép `FK_ShipmentPlanPo_Plan (ShipmentPlanId, BranchCode)` → `ShipmentPlan(Id, BranchCode)` |
| `SalesOrderPoId` | `INT` | không | FK `FK_ShipmentPlanPo_Po` → `SalesOrderPo(Id)` (PO có thể thuộc ĐVCS khác) |
| `BranchCode` + bộ kiểm toán | | | `BranchCode` = ĐVCS của kế hoạch: là điều kiện "PO đang dùng ở ĐVCS này" (quyền ghi PO, lọc màn Tỷ lệ cắt) |

Ràng buộc, chỉ mục: `UQ_ShipmentPlanPo UNIQUE (ShipmentPlanId, SalesOrderPoId)`; `IX_ShipmentPlanPo_Branch (BranchCode, ShipmentPlanId)`; `IX_ShipmentPlanPo_Po_Branch (SalesOrderPoId, BranchCode)`.

### `ShipmentPlanColorSize` – SL kế hoạch theo màu cỡ

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | không | PK |
| `ShipmentPlanId` | `INT` | không | FK ghép `FK_ShipmentPlanColorSize_Plan (ShipmentPlanId, BranchCode)` → `ShipmentPlan(Id, BranchCode)` |
| `ColorName` | `NVARCHAR(100)` | không | |
| `SizeName` | `VARCHAR(20)` | không | |
| `OriginalQty` | `INT` | không | ≥ 0; SL gốc của các PO đã chọn tại lần lập (hoặc lần sửa SL gần nhất) |
| `PlanQty` | `INT` | không | ≥ 0; SL KHXH |
| `SortOrder` | `INT` | không | Mặc định 0 |
| `BranchCode` + bộ kiểm toán | | | |

Ràng buộc, chỉ mục: `UQ_ShipmentPlanColorSize UNIQUE (ShipmentPlanId, ColorName, SizeName)`; `IX_ShipmentPlanColorSize_Branch (BranchCode, ShipmentPlanId)`.

### `ShipmentPlanLine` – dòng dàn chuyền (`order.colorsize`; con của kế hoạch ở `order.lineplan`)

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | không | PK; khóa ngầm từ `MES_Sewing.SewingPrep.ShipmentPlanLineId`, `MES_Sewing.SewingDayPlanItem.ShipmentPlanLineId` |
| `ShipmentPlanId` | `INT` | không | FK ghép `FK_ShipmentPlanLine_Plan (ShipmentPlanId, BranchCode)` → `ShipmentPlan(Id, BranchCode)` |
| `LineCode` | `VARCHAR(20)` | không | Chuyền: mã bộ phận tích "Xưởng sản xuất"; khóa ngầm → `MES_Hr.Department.Code` (cùng ĐVCS, không lọc theo cờ) |
| `Qty` | `INT` | không | > 0 |
| `AvgOutput` | `INT` | không | > 0; năng suất trung bình, sản phẩm mỗi ngày |
| `StartDate` | `DATE` | không | Ngày vào chuyền |
| `ProductionDays` | `INT` | không | > 0; server tính |
| `OffDays` | `INT` | không | ≥ 0, mặc định 0; số ngày nghỉ theo lịch ĐVCS từ sau ngày vào chuyền tới ngày kết thúc, server tính (trước phase 5.12 là "ngày nghỉ khác" nhập tay) |
| `EndDate` | `DATE` | không | Kết thúc vào chuyền: theo công thức hoặc người dùng điều chỉnh tay (5.12.2); `CHECK (EndDate >= StartDate)` |
| `OutStartDate`, `OutEndDate` | `DATE` | có | Ngày bắt đầu, kết thúc ra chuyền: theo công thức hoặc điều chỉnh tay (5.12.2); dòng rất cũ có thể trống, giao diện điền theo công thức khi mở |
| `WarehouseStartDate`, `WarehouseEndDate` | `DATE` | có | Ngày bắt đầu, kết thúc nhập kho; như trên |
| `StatusCode` | `VARCHAR(20)` | không | `PLANNED` (mặc định), `ALLOCATED`, `IN_PRODUCTION`, `DONE` (CHECK) |
| `SortOrder` | `INT` | không | Mặc định 0 |
| `BranchCode` + bộ kiểm toán | | | |

Ràng buộc, chỉ mục: `UQ_ShipmentPlanLine_IdBranch UNIQUE (Id, BranchCode)`; `IX_ShipmentPlanLine_Branch_Line (BranchCode, LineCode, StartDate)`; `IX_ShipmentPlanLine_ShipmentPlanId (ShipmentPlanId)`; `IX_ShipmentPlanLine_Branch_CreatedBy (BranchCode, CreatedBy)`.

### `ShipmentPlanLineColorSize` – phần giao màu cỡ cho dòng dàn chuyền

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | không | PK |
| `ShipmentPlanLineId` | `INT` | không | FK ghép `FK_ShipmentPlanLineColorSize_Line (ShipmentPlanLineId, BranchCode)` → `ShipmentPlanLine(Id, BranchCode)` |
| `ColorName` | `NVARCHAR(100)` | không | |
| `SizeName` | `VARCHAR(20)` | không | |
| `PlanQty` | `INT` | không | ≥ 0; SL KHXH của màu cỡ ở kế hoạch lúc lưu phần giao (bản chụp, không dùng để kiểm). Dòng lưu trước phase 5.13: SL đề xuất theo tỷ lệ của dòng |
| `AssignedQty` | `INT` | không | ≥ 0; SL giao của chuyền cho màu cỡ. Màn Phân bổ màu cỡ chỉ lưu dòng > 0; dòng 0 của cách làm trước phase 5.13 (đề xuất khi lưu dàn chuyền) bị bỏ qua khi đọc, bị xóa ở lần lưu kế tiếp của chuyền đó. Tổng theo màu cỡ, theo chuyền do service kiểm, DB không ràng buộc |
| `SortOrder` | `INT` | không | Mặc định 0 |
| `BranchCode` + bộ kiểm toán | | | |

Ràng buộc, chỉ mục: `UQ_ShipmentPlanLineColorSize UNIQUE (ShipmentPlanLineId, ColorName, SizeName)`; `IX_ShipmentPlanLineColorSize_Branch (BranchCode, ShipmentPlanLineId)`.

### `PoAllocation` – Phân bổ PO (`order.poallocation`)

Bản làm việc của MES theo view OSM `v_OSMData`: mỗi dòng khác nhau của OSM một dòng. Dùng chung, không có `BranchCode`: ĐVCS suy từ Nhà máy SX theo danh mục, để danh mục đổi ĐVCS của nhà máy thì dòng theo ngay. Bước làm mới (mục 8.8) thêm, sửa, xóa dòng theo OSM; người dùng chỉ đổi Nhà máy SX (mục 4.2).

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `BIGINT IDENTITY` | không | PK; giữ nguyên khi dòng OSM không đổi |
| `RowHash` | `VARBINARY(32)` | không | SHA-256 của 11 cột OSM (mục 8.8); duy nhất |
| `Brand`, `Season` | `NVARCHAR(50)` | có | |
| `PoNo` | `NVARCHAR(51)` | có | PO |
| `SoNo` | `NVARCHAR(50)` | có | SO |
| `ShipMode` | `NVARCHAR(50)` | có | Ship mode |
| `StyleName` | `NVARCHAR(59)` | có | |
| `StyleNo` | `NVARCHAR(61)` | có | |
| `Color` | `NVARCHAR(82)` | có | Màu |
| `EtdActualDate`, `EtdRevisedDate` | `DATE` | có | ETD-Actual, ETD-REVISED |
| `OsmFactoryCode` | `NVARCHAR(255)` | có | `FtyName` của OSM ở lần làm mới gần nhất (có thể là danh sách cách nhau dấu phẩy) |
| `ProductionFactoryCode` | `NVARCHAR(255)` | có | Nhà máy SX hiện hành: nhập tay (mã của danh mục Nhà máy SX) hoặc theo OSM (= `OsmFactoryCode`) |
| `IsFactoryManual` | `BIT` | không | Mặc định 0. 1: nhập tay, bước làm mới giữ nhà máy |
| `IsInOsm` | `BIT` | không | Mặc định 1. 0: OSM không còn dòng nào cùng khóa SO, PO, Style No, Màu; dòng được giữ vì đang nhập tay |
| `CreatedAt`, `CreatedBy` | | | `CreatedBy` trống: dòng do bước làm mới tạo |
| `ModifiedAt`, `ModifiedBy` | | có | Người nhập tay hoặc bỏ nhập tay Nhà máy SX gần nhất; bước làm mới không đổi |

Độ dài cột chữ theo số ký tự của bảng chép `osm.OSMData`. Không có cột thời điểm chép theo dòng: giữ cột đó là ghi lại mọi dòng mỗi lần làm mới (khóa cả bảng); thời điểm chép là thông tin của cả bảng, ở `PoAllocationRefresh`.

Ràng buộc, chỉ mục: `UQ_PoAllocation_RowHash UNIQUE (RowHash)`; `CK_PoAllocation_Kept CHECK (IsInOsm = 1 OR IsFactoryManual = 1)`; `IX_PoAllocation_Key (PoNo, SoNo, StyleNo, Color)` (khóa nhập tay); `IX_PoAllocation_EtdRevised (EtdRevisedDate DESC, Id DESC)` (thứ tự mặc định); `IX_PoAllocation_Factory (ProductionFactoryCode)`; `IX_PoAllocation_Manual (IsFactoryManual) INCLUDE (PoNo, SoNo, StyleNo, Color, ProductionFactoryCode) WHERE IsFactoryManual = 1`; `IX_PoAllocation_CreatedBy`, `IX_PoAllocation_ModifiedBy` (có lọc `IS NOT NULL`).

### `PoAllocationRefresh` – trạng thái lần làm mới Phân bổ PO

Một dòng (`Id = 1`, CHECK), migration tạo sẵn; chỉ bước làm mới ghi. Màn Phân bổ PO đọc để hiện thời điểm chép OSM và cảnh báo.

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT` | không | PK, luôn 1 |
| `RefreshedAt` | `DATETIME2(3)` | có | Lần làm mới gần nhất, kể cả lần bị bỏ qua; NULL: chưa làm mới lần nào |
| `SourceSyncedAt` | `DATETIME2(3)` | có | Lần chép OSM (`SyncedAt` của bảng chép) của dữ liệu đang có; lần bị bỏ qua không đổi cột này |
| `SourceRows` | `INT` | không | Số dòng khác nhau của nguồn ở lần đó |
| `PreviousRows` | `INT` | không | Mốc đã dùng để so với nguồn ở lần đó (`BaselineRows` lúc đó; chưa có thì số dòng đang có trong OSM của bảng) |
| `BaselineRows` | `INT` | có | Mốc so của chốt giảm: số dòng nguồn của lần làm mới đủ gần nhất; chỉ ghi khi `SkippedReason` NULL. NULL: chưa có lần làm đủ nào (mục 8.8) |
| `InsertedRows`, `UpdatedRows`, `RemovedRows` | `INT` | không | Số dòng thêm, sửa, xóa |
| `MissingManualRows` | `INT` | không | Dòng nhập tay vừa được đánh dấu không còn trong OSM |
| `KeptAbsentRows` | `INT` | không | Dòng không còn trong OSM mà không xóa (cũng không đánh dấu) vì nguồn giảm quá ngưỡng |
| `UnknownFactories` | `INT` | không | Số tên nhà máy của nguồn chưa có trong danh mục Nhà máy SX |
| `MaxShrinkPercent` | `TINYINT` | không | Ngưỡng giảm đã áp (0–100, CHECK) |
| `SkippedReason` | `VARCHAR(10)` | có | NULL: làm đủ; `EMPTY`: nguồn rỗng, không làm gì; `SHRINK`: nguồn giảm quá ngưỡng, không xóa dòng vắng (CHECK) |

### Khóa ngầm

Khai báo ở `backend/migrations/softkeys.json`, danh sách đầy đủ là chính file đó (loại quan hệ: [Kiến trúc](../ARCHITECTURE.md) mục 6.3). Phần của `MES_Order`: `BranchCode` của 8 bảng → `SysBranch.Code`; `ShipmentPlanLine.LineCode` → `MES_Hr.Department.Code` (dòng gắn mã chuyền cũ không còn là bộ phận nào là mồ côi, `check:softkeys` báo); `SalesOrder.ProductionFactoryCode` → `SysProductionFactory.Code` (danh sách); `CreatedBy` của `SalesOrder`, `SalesOrderPo`, `ShipmentPlan`, `ShipmentPlanLine`, `SalesOrderPo.ConfirmedBy`, `PoAllocation.CreatedBy`, `PoAllocation.ModifiedBy` → `SysUser.Id`. `PoAllocation.ProductionFactoryCode` không khai khóa ngầm: dòng chưa nhập tay mang `FtyName` của `v_OSMData`, tên này không tự vào danh mục Nhà máy SX (danh mục chỉ tự thêm tên của `vOSMDataFty`), khai thì `check:softkeys` báo mồ côi giả; giá trị nhập tay đã kiểm với danh mục lúc ghi. Chiều ngược (cùng ĐVCS): `MES_Sewing.SewingPrep.ShipmentPlanId`, `ShipmentPlanLineId`; `MES_Sewing.SewingDayPlanItem.ShipmentPlanId`, `ShipmentPlanLineId`; `MES_Cutting.CuttingPlan.ShipmentPlanId` (NULL khi kế hoạch đã xóa mà còn số cắt) trỏ vào `MES_Order`. `SalesOrder.SourceProductId` không phải khóa ngầm (trỏ tới dòng của BRAVO, bảng chép có thể mất dòng).

## 8. Đơn hàng từ BRAVO và dữ liệu mô phỏng

Lớp chép (bảng `MES_Sync.bravo.*`, `osm.*`, thủ tục chép, màn Đồng bộ dữ liệu) ở [Đồng bộ](09-dong-bo.md). Phần này nói dữ liệu đi từ bảng chép vào `MES_Order` thế nào. Lệnh chạy, biến môi trường đầy đủ ở [Vận hành](11-van-hanh.md).

| Đường nạp | Ở đâu | Khi nào | Xóa dữ liệu? |
|---|---|---|---|
| Nạp tăng dần | `BravoOrderImportService` (backend) | Sau mỗi đợt đồng bộ có chép nguồn đơn hàng, và một lần lúc khởi động. Bật/tắt bằng `BRAVO_ORDER_IMPORT` | Không xóa gì |
| Nhà máy SX theo OSM | `OsmFactoryService` (backend) | Sau mỗi đợt đồng bộ có chép `OSM.OSMDataFty` hoặc `BRAVO.DM_SanPhamDonHang`, và lúc khởi động. Bật/tắt bằng `OSM_FACTORY_UPDATE` | Không |
| Làm mới Phân bổ PO | `PoAllocationRefreshService` (backend) | Sau mỗi đợt đồng bộ có chép `OSM.OSMData`, và lúc khởi động. Bật/tắt bằng `PO_ALLOCATION_REFRESH` | Xóa dòng `PoAllocation` không còn trong OSM, trừ dòng nhập tay; có chốt khi nguồn rỗng hoặc giảm mạnh (mục 8.8) |
| `load:bravo` | `backend/scripts/load-bravo-orders.ts` | Chạy tay, chỉ máy demo | Xóa hết dữ liệu `MES_Order` rồi nạp lại |
| `sim:board` | `backend/scripts/simulate-board.ts` | Chạy tay, chỉ máy demo | Xóa, sinh lại kế hoạch mô phỏng |

### 8.1 Nguồn đọc

Câu đọc ở `backend/src/platform/sync/bravo-order-source.ts` (`readBravoOrderSource`, `readOsmFactories`), module lấy qua `SourceFeedService.orderSource()`, `osmFactories()`. Chỉ đọc sản phẩm của các ĐVCS đang dùng (`SysBranch.IsActive = 1`, không phải đơn vị tổng hợp), so `UPPER(TRIM(BranchCode))`.

| Dữ liệu | Bảng chép | Cách đọc |
|---|---|---|
| Đơn hàng | `bravo.DM_SanPhamDonHang` nối `DM_KHACHHANG` (khách), `DM_MuaKinhDoanh` (mùa), `DM_NHANVIEN` (nhân viên) | Mỗi sản phẩm một dòng. `PoProductId`: chính sản phẩm nếu có dòng ở `ThongTinPO`; không thì sản phẩm gốc `ProductId_GC` (hàng nhận gia công chưa có PO riêng dùng PO của sản phẩm gốc) |
| PO | `bravo.ThongTinPO` nối `DM_DiaDiemGiaoHang`, `DM_QuocGia` | Bỏ dòng thiếu ETD hoặc số PO. Gộp theo (sản phẩm, số PO): ETD sớm nhất, nơi giao của dòng có ETD sớm nhất (điểm giao, không có thì quốc gia), mốc chép lớn nhất |
| Màu cỡ | `bravo.ThongTinPO_MauCo` nối `DM_MauSac` | Bỏ dòng thiếu cỡ, số PO, mã màu. Cộng SL theo (sản phẩm, số PO, mã màu, cỡ, loại cỡ) |
| Nhà máy SX | `osm.OSMDataFty` ghép `bravo.DM_SanPhamDonHang` | `OSMDataFty.SO = DM_SanPhamDonHang.Code` và `StyleNo = StyleName` (mã hàng theo BRAVO, nên người dùng sửa mã hàng ở MES không làm mất ghép). Gộp mọi `FtyName` của sản phẩm. Bảng chép OSM chưa có hoặc trống: `null` (không làm gì) |
| Phân bổ PO | `osm.OSMData` | `readOsmPoSource` (`backend/src/platform/sync/osm-po-source.ts`) qua `SourceFeedService.osmPoRows()`: mọi dòng khác nhau của bảng chép (mục 8.8). Chưa có bảng chép: `null` |

### 8.2 Ánh xạ (`backend/src/modules/order/bravo-order.mapping.ts`)

Hàm thuần, không đọc ghi database, dùng chung cho nạp tăng dần và `load:bravo`. Đây là **giả định tạm** khi BA chưa chốt ánh xạ (các câu hỏi còn mở ở [Trạng thái](../current/STATUS.md)). Mọi chuỗi qua `clean`: bỏ ký tự điều khiển, gộp khoảng trắng, cắt theo độ dài cột.

| Cột MES | Lấy từ | Quy tắc |
|---|---|---|
| `SalesOrder.SourceProductId` | `ProductId` | Một sản phẩm BRAVO = một đơn hàng MES |
| `SalesOrder.BranchCode` | `DM_SanPhamDonHang.BranchCode` | Chi nhánh nhận đơn. Đơn đã có thì không đổi (BRAVO đổi chi nhánh: bỏ qua, đếm trong log) |
| `SalesOrder.OrderNo` | Phần trước `" \| "` của `Name` (số SO) | ≤ 30 ký tự ASCII in được; không có hoặc có ký tự ngoài ASCII thì `SP-<ProductId>`. Trùng trong cùng ĐVCS (không phân biệt hoa thường) thì thêm `-2`, `-3`. Đơn đã có giữ số cũ |
| `CustomerName` | `DM_KHACHHANG.TenTat`, không có thì `TenTat_OSM` | Trống: `(Chưa có khách hàng)` |
| `StyleCode` | `StyleName` | Trống: dùng số đơn |
| `Season` | `DM_MuaKinhDoanh.Name` | |
| `OrderType` | `ProductionTypeCode` | Loại hình sản xuất (SXXK, GCND…) |
| `ProductName` | `Description_DetailSO`, rồi `Description`, rồi `StyleName` | Trống: dùng số đơn |
| `StaffName` | `DM_NHANVIEN.Name` | |
| `Qty` | `TotalQuantity_SO` | Làm tròn, không âm |
| `UnitName` | `Unit` | Đổi theo danh mục Đơn vị tính `UNIT` (mã = mã BRAVO viết hoa không dấu); không có trong danh mục thì giữ mã; trống thì "Chiếc" |
| `ShipDate` | | Ngày xuất sớm nhất trong các PO được nạp |
| `StatusCode` | `EndDatePrice` | Có giá trị (đã đóng lệnh): `DONE`; không: `NEW` |
| `UnitPrice`, `CmPrice` | | NULL (MES tự quản) |
| `SyncedAt` | | Mốc chép lớn nhất của sản phẩm, các PO, các ô màu cỡ |
| `ProductionFactoryCode`, `IsFactoryFromOsm` | OSM | Đơn mới: danh sách theo OSM (dạng chuẩn), khóa sửa tay; OSM chưa có: NULL, 0. Danh sách dài quá 400 ký tự: NULL, báo trong log |
| `SourceHash` | | SHA-256 của `['v1', khách, StyleName, mùa, ProductionTypeCode, tên hàng, nhân viên, SL, mã đơn vị tính, đã đóng lệnh, ngày xuất]` trên dữ liệu BRAVO **chưa ánh xạ**: đổi tên ở danh mục Đơn vị tính của MES hay đổi cách ánh xạ không làm dấu đổi. Đổi danh sách giá trị thì đổi tiền tố phiên bản |
| `CreatedBy` | | NULL (dữ liệu của hệ thống nguồn) |
| `SalesOrderPo.PoNumber` | `CustomerPONo` | Trống: `(trống)` |
| `PoCode` | | `PO-<ĐVCS của đơn>-<Id>` |
| `ShipDate`, `Destination`, `SyncedAt` | PO đã gộp | |
| `CustomerName`, `StyleCode` | | Bản chụp của đơn |
| `Qty` | | Tổng màu cỡ của PO |
| `StatusCode`, `ConfirmedAt` | | Đơn đã đóng lệnh: `CONFIRMED`, `ConfirmedAt` = mốc chép của PO, `ConfirmedBy` NULL; còn lại `DRAFT` |
| `PackingListCode`, `CustomsDeclarationNo` | | NULL |
| `BranchCode` | | ĐVCS của đơn |
| `SalesOrderPoColorSize.ColorName` | `DM_MauSac.Name`, không có thì `Code`, rồi `ColorId` | Hai mã màu khác nhau trùng tên (không phân biệt hoa thường) trong cùng đơn: thêm mã màu, `"<tên> (<mã>)"`, ở mọi PO của đơn |
| `SizeName` | `SizeCode` + `SizeType` | Chữ hoa; loại cỡ khác `REG` ghép vào tên cỡ (`"32 SHORT"`), ≤ 20 ký tự |
| `Qty` | `Quantity` | Cộng các dòng cùng màu, cỡ; làm tròn, không âm |
| `SortOrder` | `Color_Stt`, `Size_Stt` | Giữ thứ tự màu, cỡ của BRAVO |

- Ghép màu cỡ với PO như SQL Server so `CustomerPONo`: bỏ dấu cách cuối, không phân biệt hoa thường (khoảng trắng đầu, tab, xuống dòng là PO khác).
- PO không có ô màu cỡ nào bị bỏ. Sản phẩm không còn PO nào (chưa có ngày xuất, cột bắt buộc) thì **chưa nạp**, đếm theo ĐVCS.
- SL màu cỡ là SL theo PO, không phải SL sau cân đối sản xuất.

### 8.3 Nạp tăng dần (`bravo-order-import.service.ts`, `bravo-order-import.repository.ts`)

ADR 0013 mục 8: đơn mới tự vào sau mỗi đợt đồng bộ mà không mất kế hoạch đã lập.

- **Khi chạy:** đăng ký `SourceFeedService.onOrderSourceSynced`: chạy một lần khi hàng đợi đồng bộ của tiến trình chạy hết, nếu có ít nhất một nguồn câu đọc dùng tới chép thành công (`BRAVO.DM_CHINHANH`, `DM_SanPhamDonHang`, `ThongTinPO`, `ThongTinPO_MauCo`, `DM_KHACHHANG`, `DM_MuaKinhDoanh`, `DM_NHANVIEN`, `DM_MauSac`, `DM_DiaDiemGiaoHang`, `DM_QuocGia`). Thêm một lần lúc khởi động. Bảng chép chưa có đơn nào: không làm gì. Máy chưa có `MES_Sync`: log cảnh báo.
- **Bật, tắt:** `BRAVO_ORDER_IMPORT` (`true`/`false`). Để trống: bật khi không dùng dữ liệu mẫu (máy dùng thật), tắt trên máy demo, máy test (`backend/src/config/env.ts`). Log khởi động ghi trạng thái.
- **Quy tắc so (`planImport`)**, không xóa gì:

| Trường hợp | Làm gì |
|---|---|
| Sản phẩm mới (có PO, ĐVCS đang dùng) | Thêm đơn, PO, màu cỡ như ánh xạ; Nhà máy SX theo OSM nếu có |
| Đơn đã có, `SourceHash` khác dấu mới | BRAVO đã đổi đơn: ghi các cột lấy từ BRAVO (khách hàng, mã hàng, mùa, loại, tên hàng, nhân viên, SL, đơn vị, ngày xuất), dấu mới, `SyncedAt`, **kể cả khi người dùng đã sửa ở MES** |
| `SourceHash` giống | Không ghi gì: giữ phần người dùng sửa (nguồn chép theo nhóm chép lại cả nhóm với mốc mới dù nội dung không đổi, nên không dùng `SyncedAt` để biết BRAVO đổi) |
| `SourceHash` trống (đơn nạp trước `0006`) | Chưa ai sửa (`ModifiedBy` trống): ghi theo BRAVO kèm dấu. Đã sửa: chỉ ghi dấu làm mốc |
| Luôn giữ của MES | Nhà máy SX, đơn giá, giá CM, số đơn, ĐVCS. Trạng thái chỉ đổi Mới → Hoàn thành khi BRAVO đóng lệnh (tính trong câu ghi) |
| PO mới của đơn đã có | Thêm PO (bản chụp khách hàng, mã hàng như đơn sau lần nạp). Ghép PO theo số PO (không phân biệt hoa thường, ký tự ngoài ASCII quy về `?`); hai PO BRAVO cùng số ghép lần lượt với PO MES cùng số theo Id |
| PO đã có, ngày xuất hoặc nơi giao khác | Ghi theo BRAVO (người dùng không sửa được hai cột này), trừ PO người dùng tự thêm được ghép theo số (giữ giá trị người dùng nhập) |
| Màu cỡ của PO đã có khác | Thay khi PO chưa xác nhận, chưa vào kế hoạch xuất hàng nào, người dùng chưa xác nhận/lưu PO (`ModifiedBy` trống) và chưa lưu màu cỡ (mọi ô `CreatedBy` trống); còn lại giữ của MES, đếm "PO giữ màu cỡ" |
| PO tay của ĐVCS khác ĐVCS của đơn | Không ghép với PO BRAVO trùng số: BRAVO thêm PO riêng, PO tay giữ nguyên |
| Đơn, PO không còn ở BRAVO; đơn BRAVO đổi chi nhánh | Chỉ đếm trong log, chờ BA chốt |

- **Đồng thời:**
  - Một transaction, khóa ứng dụng `MES_Order.BravoImport` (`sp_getapplock`, chờ tối đa 10 giây; dùng chung với `load:bravo` và bước cập nhật Nhà máy SX theo OSM).
  - Đọc trạng thái MES trong khóa rồi so; mỗi câu ghi bắt đầu bằng `SET DEADLOCK_PRIORITY LOW`: khóa chéo với thao tác người dùng thì SQL Server hủy bước nạp, không hủy thao tác của người dùng. Bị hủy (1205) thì thử lại sau 2 rồi 10 giây.
  - Khóa (UPDLOCK) mọi đơn sẽ chạm tới theo Id tăng dần trước khi thêm, sửa PO: cùng thứ tự với lập kế hoạch xuất hàng, nên kế hoạch lập chen giữa chờ và thấy màu cỡ mới.
  - Câu ghi kiểm lại điều kiện (đơn chưa ai sửa, PO chưa xác nhận, chưa vào kế hoạch, chưa sửa tay) để không đè phần người dùng vừa sửa trong lúc so.
  - Trong một tiến trình không chạy chồng: yêu cầu đến lúc đang nạp thì xếp đúng một lần chạy sau; lỗi của lần đó trả về bên gọi để đợt đồng bộ sau thử lại.
  - Kết nối riêng (một kết nối, câu tối đa 2 phút), không chiếm pool của màn hình.
- **Ghi:** không đi qua `BaseRepository` (việc của hệ thống, không có phiên; như `SewingPrepRepository`, ADR 0009). `BranchCode` lấy từ BRAVO hoặc từ đơn đã có, `CreatedBy` NULL.
- **Nhật ký:** `SysAuditLog` `BRAVO_IMPORT` (người `system`, `entityType = SalesOrder`) khi có ghi dữ liệu, kèm số đơn mới theo ĐVCS, đơn cập nhật, PO mới, PO cập nhật, PO thay màu cỡ, PO giữ màu cỡ (tối đa 50 Id), đơn đổi chi nhánh, đơn/PO không còn, sản phẩm chưa có PO, đơn có danh sách nhà máy quá dài. Log máy chủ mỗi lần chạy.

### 8.4 Nhà máy SX theo OSM (`osm-factory.service.ts`)

ADR 0013 mục 9: Nhà máy SX của đơn lấy theo view OSM `vOSMDataFty` (đã chép vào `MES_Sync.osm.OSMDataFty`).

- **Khi chạy:** sau mỗi đợt đồng bộ có chép `OSM.OSMDataFty` hoặc `BRAVO.DM_SanPhamDonHang`, và lúc khởi động. Chạy cả khi `BRAVO_ORDER_IMPORT=false` (chỉ đụng cột Nhà máy SX của đơn đã có). Tắt bằng `OSM_FACTORY_UPDATE=false` (mặc định bật; test tắt).
- **Quy tắc** (`BravoOrderImportRepository.applyOsmFactories`, chỉ đơn có `SourceProductId`):
  - OSM có đơn: ghi danh sách theo OSM (dạng chuẩn), `IsFactoryFromOsm = 1` (khóa sửa tay), kể cả khi trước đó người dùng đã chọn tay.
  - Trước đó theo OSM mà nay OSM không còn: mở khóa (`IsFactoryFromOsm = 0`), giữ giá trị.
  - Chưa từng có trong OSM: giữ nhà máy người dùng chọn.
  - Danh sách dài quá 400 ký tự: không ghi, log tối đa 50 `ProductId`.
- Bảng chép OSM chưa có, chưa đồng bộ, hoặc ghép không ra sản phẩm nào: không làm gì (không mở khóa hàng loạt).
- Cùng khóa ứng dụng, cùng cách thử lại khi khóa chéo như bước nạp. Nhật ký `OSM_FACTORY_IMPORT` khi có cập nhật hoặc mở khóa.
- Tên nhà máy mới trong OSM được tự thêm vào danh mục Nhà máy SX sau mỗi lần chép nguồn `OSM.OSMDataFty` và lúc khởi động (`CatalogService.importOsmFactories`, `backend/src/platform/catalog/catalog.service.ts`), chưa gắn ĐVCS ([Quản trị hệ thống](05-quan-tri-he-thong.md)). Nhà máy chưa gắn ĐVCS thì đơn không hiện ở Chọn mã hàng của ĐVCS nào.

### 8.5 `load:bravo` (`backend/scripts/load-bravo-orders.ts`)

Chỉ cho máy demo: thay toàn bộ đơn hàng giả bằng dữ liệu đã chép trong `MES_Sync`. Máy đặt `SEED_SAMPLE_DATA=false` hoặc database không ở máy này thì từ chối (`assertDemoMachine`).

1. Chép ĐVCS theo danh mục chi nhánh BRAVO `bravo.DM_CHINHANH` (`bravo-branches.ts`, nhật ký `BRANCH_IMPORT`) để không bỏ đơn của ĐVCS MES chưa có.
2. Đòi `bravo.DM_SanPhamDonHang` có dữ liệu.
3. Trong một transaction của `MES_Order` có khóa ứng dụng `MES_Order.BravoImport` (chờ tối đa 10 giây): xóa bản chép Kế hoạch chuẩn bị SX (danh mục bước giữ nguyên) và Kế hoạch may trong `MES_Sewing`, xóa dữ liệu `MES_Cutting` (số cắt, bản chép kế hoạch, lệnh cấp BTP); các bước này chạy trên kết nối riêng của từng database, tự commit, không hủy theo khi transaction đơn hàng lỗi (`clearSewingPrep`, `clearSewingDayPlan`, `clearCutting`). Rồi xóa **mọi** dòng 8 bảng đơn hàng, kế hoạch của `MES_Order` (kể cả đơn nhập tay, kế hoạch người dùng lập; không đụng hai bảng Phân bổ PO) và đặt lại identity, rồi nạp đơn, PO, màu cỡ theo cùng ánh xạ.
4. Sinh dàn chuyền mô phỏng cho từng ĐVCS (mục 8.6), trừ khi có `--no-plans`.
5. Ghi nhật ký `BRAVO_LOAD`, in bảng thống kê theo ĐVCS (đơn, PO, ô màu cỡ, đơn chưa có Nhà máy SX, PO quá 300 ô, ô có cỡ ngoài quy tắc nhập tay, sản phẩm chưa nạp) và nhắc database đã chứa dữ liệu thật.

Khác nạp tăng dần:
- Máy chưa có dữ liệu OSM: Nhà máy SX tạm bằng mã chi nhánh nhận đơn nếu có nhà máy đang dùng cùng mã, **không khóa** sửa tay (để tài khoản mẫu thấy đơn ở Chọn mã hàng).
- PO của mọi đơn đã đóng lệnh vào ở trạng thái Đã xác nhận (nạp tăng dần chỉ đặt cho PO mới; đơn đóng lệnh sau khi đã nạp chỉ đổi đơn sang Hoàn thành).
- Số đơn cấp lại từ đầu.
- Đọc danh mục Đơn vị tính kể cả khi cả danh mục bị ngừng (nạp tăng dần thì để mã BRAVO).

### 8.6 Dàn chuyền mô phỏng (`backend/scripts/simulate-board.ts`)

BRAVO không có kế hoạch xuất hàng, dàn chuyền (dữ liệu MES tự lập). Script sinh để bảng dàn chuyền, Xếp chuyền, Phân bổ màu cỡ có đủ tình huống khi demo. `load:bravo` gọi `simulateBranch` sau khi nạp; `npm run sim:board -- --yes` làm mới riêng phần này (chỉ máy demo).

- **Nhận diện:** kế hoạch mô phỏng có `PlannerName = 'Lập tự động (mô phỏng)'`, `CreatedBy` = Id tài khoản `kehoach.a` (nếu có).
- **Chọn đơn:** theo từng ĐVCS, đơn có **Chi nhánh FOB** = ĐVCS đó (không theo Nhà máy SX), chưa có kế hoạch nào, đang ở trạng thái lúc nạp (Hoàn thành nếu nạp từ BRAVO và mọi PO "Đã xác nhận" bởi hệ thống, còn lại Mới), có PO của chính ĐVCS. Đơn còn mở có ngày xuất gần hôm nay vào trước, đơn từ 600 sản phẩm trước; thiếu thì dùng cả đơn đã đóng lệnh.
- **Xếp lịch** (`planBoard`, hàm thuần, xác định theo ĐVCS và ngày):
  - Khoảng xếp: hôm nay − 42 ngày tới hôm nay + 70 ngày; ĐVCS ít đơn thì thu khoảng lại (khoảng 1/3 đã qua).
  - Lần lượt lấy chuyền đang dùng rảnh sớm nhất (bộ phận tích "Xưởng sản xuất", chưa giải thể, của ĐVCS, đọc từ `MES_Hr` bằng `readLines` ở `backend/scripts/script-db.ts`; chưa có `MES_Hr` thì không có chuyền nào, dàn chuyền để trống). Năng suất 250–700 sp/ngày, mỗi thanh 2–14 ngày làm việc; một chuyền nhận tối đa 9.800 sản phẩm của một kế hoạch. Số ngày SX, số ngày nghỉ, ngày kết thúc, ra chuyền, nhập kho tính như màn Xếp chuyền theo lịch làm việc của ĐVCS (`readWorkCalendars`); không vào chuyền ngày nghỉ; không chồng lên dòng có sẵn. `seed-order.ts` (đơn hàng mẫu) tính cùng cách.
  - Ngày xuất của kế hoạch: giữ ETD thật khi nằm trong 30 ngày sau ngày may xong; không thì ngày may xong + 7–10 ngày.
  - Phần giao màu cỡ chia lần lượt cho các chuyền của kế hoạch (`lineShares` ở `order.util.ts`: tổng mỗi chuyền không vượt SL chuyền, mỗi màu cỡ không vượt SL kế hoạch), chỉ lưu phần giao > 0, `PlanQty` là SL KHXH của màu cỡ; đúng luật của màn Phân bổ màu cỡ.
  - Luôn có ở mỗi ĐVCS đủ đơn: dòng đã xong, đang may, đã phân màu cỡ đủ hoặc một phần, chưa phân màu cỡ (có dòng vào chuyền trong 10 ngày tới); chuyền trống giữa hai việc, một chuyền chờ việc 7–12 ngày; kế hoạch nhiều chuyền, xếp một phần, chưa xếp chuyền, đơn tách hai đợt xuất, may xong sau ngày xuất.
  - Trạng thái dòng theo ngày so với hôm nay; kế hoạch, đơn mang trạng thái theo dòng. Lũy kế may, endline, hoàn thiện tính theo phần thời gian đã may; LK cắt để 0 (lấy từ Đồng bộ tiến độ cắt, quyết định 13.6).
- **Chạy lại:** xóa kế hoạch mô phỏng cũ (cùng PO, màu cỡ, dòng, phân màu cỡ của chúng) và trả đơn không còn kế hoạch nào về trạng thái lúc nạp. Giữ nguyên (trừ khi có `--all`): kế hoạch người dùng lập; kế hoạch mô phỏng người dùng đã sửa (kế hoạch, màu cỡ, dòng, phân màu cỡ có `ModifiedAt`; dòng thêm sau ở Xếp chuyền, phân màu cỡ lưu sau ở Phân bổ màu cỡ quá 10 phút sau lúc lập kế hoạch; dòng đã nhập ở Kế hoạch chuẩn bị SX, đọc từ `MES_Sewing` trước transaction). Luôn giữ, kể cả `--all` (đọc trước transaction của `MES_Order`): kế hoạch đã có số cắt (`plansWithCuts`, quyết định 13.4) và kế hoạch có mã hàng đã cấp BTP ở ĐVCS của nó (`plansWithSupply`, quyết định 13.8), đọc từ `MES_Cutting`; kế hoạch có dòng dàn chuyền đã có bản ghi ở Kế hoạch may (`dayPlanLines`, đọc từ `MES_Sewing`, quyết định 14.2). Đơn ở Đã lập kế hoạch/Đang sản xuất mà không có kế hoạch nào thì chỉ báo.
- Chạy trong một transaction cho mọi ĐVCS (màn đơn hàng chờ tới khi xong). Nhật ký `BOARD_SIMULATE` ghi ở `MES_Core` sau khi `MES_Order` đã commit.

### 8.7 Dữ liệu giả (`backend/scripts/seed-order.ts`)

`npm run seed` trên máy dùng dữ liệu mẫu sinh đơn hàng giả cho từng ĐVCS mẫu, xác định theo hạt giống: đơn hàng → PO + màu cỡ → kế hoạch xuất hàng (một số tách hai đợt) → dòng dàn chuyền → phân màu cỡ; tiến độ tính theo ngày cố định 09/10/2026. Một số đơn của `A01`, `A02` có Nhà máy SX `A01-B` (thuộc ĐVCS `A01`) để thấy kế hoạch lập cho đơn của ĐVCS khác. Số lượng, tài khoản dùng để thử: [Dữ liệu mẫu và kiểm thử](12-du-lieu-mau-va-kiem-thu.md).

### 8.8 Làm mới Phân bổ PO theo OSM (`po-allocation-refresh.service.ts`)

Bảng chép `osm.OSMData` bị chép lại toàn bộ mỗi lần đồng bộ, có dòng trùng nguyên dòng, không có khóa dòng ổn định, nên không gắn được dấu nhập tay vào đó. MES giữ bản làm việc `PoAllocation` (mục 7) và làm mới nó từ bảng chép.

- **Khi chạy:** đăng ký `SourceFeedService.onOsmPoSynced` (`onQueueDrained` với nguồn `OSM.OSMData`): một lần khi hàng đợi đồng bộ của tiến trình chạy hết, nếu nguồn đó chép thành công. Thêm một lần lúc khởi động. Bật, tắt bằng `PO_ALLOCATION_REFRESH` (mặc định bật; test tắt). Chưa có bảng chép: không làm gì; máy chưa có `MES_Sync`: log cảnh báo.
- **Nguồn:** `SourceFeedService.osmPoRows()` (mục 8.1): mọi dòng khác nhau của bảng chép; hai dòng chỉ khác hoa thường là hai dòng (cách gom: [Đồng bộ](09-dong-bo.md)).
- **Nhận diện dòng:** `RowHash` = SHA-256 của 11 cột (bỏ khoảng trắng cuối như phép so của SQL Server; hàm `poRowHash`). Dòng OSM không đổi giữ `Id`; một cột OSM đổi (ETD, `FtyName`…) là dòng mới, dòng cũ bị xóa.
- **Quy tắc** (`PoAllocationRefreshRepository.refresh`; nguồn gửi bằng một tham số JSON vào bảng tạm, mọi bước trong một câu):
  - Bản đồ khóa SO + PO + Style No + Màu → nhà máy nhập tay lấy từ các dòng `IsFactoryManual = 1` trước khi xóa gì. Dòng nguồn có khóa trong bản đồ nhận nhà máy nhập tay và dấu nhập tay, kể cả dòng mới OSM thêm vào khóa đó và phân cho nhà máy của ĐVCS khác (theo nhóm nhập tay; ĐVCS kia muốn đổi thì nhờ ĐVCS đang giữ nhóm). Dòng khác nhận `FtyName`.
  - `OsmFactoryCode` luôn là `FtyName` mới nhất (màn hiện "OSM: …" cạnh giá trị nhập tay).
  - Dòng còn trong OSM: chỉ ghi khi Nhà máy SX, dấu nhập tay hoặc dấu "còn trong OSM" đổi (`EXISTS … EXCEPT`); dòng không đổi không bị ghi lại, nên lần làm mới không khóa cả bảng. Dòng mới của OSM: thêm.
  - Dòng không còn trong OSM: xóa; riêng dòng nhập tay mà OSM không còn dòng nào cùng khóa thì giữ, `IsInOsm = 0`, để nhà máy nhập tay không mất khi OSM tạm thiếu PO. Khóa đó có lại trong OSM thì dòng mới nhận nhà máy nhập tay, dòng giữ tạm bị xóa.
  - Không đổi `ModifiedAt`, `ModifiedBy` (người nhập tay); dòng mới có `CreatedBy` trống.
- **Chốt an toàn:**
  - Nguồn rỗng (bảng chép không có dòng nào): bỏ qua cả lần làm mới, giữ nguyên bảng, ghi trạng thái `EMPTY`, log cảnh báo, nhật ký. Bảng còn trống (máy chưa đồng bộ OSM lần nào) thì không báo gì.
  - Nguồn giảm quá `PO_ALLOCATION_MAX_SHRINK_PERCENT` (mặc định 20) so với **mốc** (số dòng nguồn × 100 < mốc × (100 − ngưỡng), hàm `shrinkGuard`): vẫn thêm, sửa, nhưng không xóa, không đánh dấu dòng vắng, chỉ đếm (`KeptAbsentRows`), ghi trạng thái `SHRINK`. Trong lúc đó dòng OSM đổi ETD, `FtyName` được thêm là dòng mới mà dòng cũ chưa xóa, nên lưới có thể có cả dòng cũ lẫn dòng mới của cùng PO; màn cảnh báo tới lần làm mới đủ kế tiếp. Ngưỡng 100 là không chặn, 0 là giảm một dòng cũng giữ.
  - **Mốc** (`PoAllocationRefresh.BaselineRows`) là số dòng nguồn của lần làm mới đủ gần nhất (`SkippedReason` NULL); chưa có lần làm đủ nào thì dùng số dòng `IsInOsm = 1` của bảng. Chỉ lần làm đủ mới đổi mốc; lần bị bỏ qua (`EMPTY`) và lần giữ dòng vắng (`SHRINK`) giữ nguyên mốc (số dòng của bảng ở lần giữ dòng vắng phình dần, không dùng làm mốc). `PreviousRows` ghi mốc đã dùng ở mỗi lần. OSM trở lại cỡ cũ thì lần sau tự làm đủ và dọn dòng vắng.
  - Không có cờ "cho qua một lần": OSM thật sự bớt nhiều PO thì quản trị đặt `PO_ALLOCATION_MAX_SHRINK_PERCENT=100`, khởi động lại backend, đồng bộ lại, rồi trả biến về giá trị cũ ([Vận hành](11-van-hanh.md)).
- **Tên nhà máy chưa có trong danh mục:** đếm các tên `FtyName` (tách danh sách dấu phẩy) không có trong danh mục Nhà máy SX, ghi `UnknownFactories`, log cảnh báo và nhật ký kèm tối đa 20 tên. Luật ĐVCS theo nhà máy (mục 4.2) coi các dòng đó như nhà máy chưa gắn ĐVCS: ĐVCS nào cũng đổi được Nhà máy SX của chúng. Danh mục không tự thêm tên của `v_OSMData` (chỉ tự thêm tên của `vOSMDataFty`, mục 8.4); tên được thêm vào danh mục và gắn ĐVCS ([Quản trị hệ thống](05-quan-tri-he-thong.md)) thì các dòng đó theo luật ĐVCS như dòng khác.
- **Đồng thời:** một transaction có khóa ứng dụng `MES_Order.PoAllocation` (chờ tối đa 30 giây; dùng chung với lần đổi Nhà máy SX), câu ghi `SET DEADLOCK_PRIORITY LOW`: khóa chéo với thao tác người dùng thì SQL Server hủy bước làm mới; bị hủy thì thử lại sau 2 rồi 10 giây. Trong một tiến trình không chạy chồng: yêu cầu đến lúc đang chạy thì xếp đúng một lần chạy sau. Kết nối riêng (một kết nối, câu tối đa 2 phút), không chiếm pool của màn hình.
- **Ghi:** không đi qua `BaseRepository` (việc của hệ thống, không có phiên; như bước nạp BRAVO).
- **Trạng thái:** mỗi lần làm mới ghi bảng một dòng `PoAllocationRefresh` (mục 7) trong cùng transaction.
- **Nhật ký:** `PO_ALLOCATION_REFRESH` (người `system`, `EntityType = PoAllocation`) khi có thêm, sửa, xóa, đánh dấu, khôi phục dòng, khi bị bỏ qua hoặc giữ dòng vắng, hoặc có tên nhà máy chưa có trong danh mục. Log máy chủ mỗi lần chạy.

## 9. Module khác dùng dữ liệu Đơn hàng

API công khai cho module Cắt (`ShipmentPlanFeed`, `ShipmentPlanDeleteGuards`, `LineColorSizeFeed`, `LineSupplyGuards`) mô tả ở [Cắt](15-cat.md). `LineColorSizeFeed` (`line-color-size-feed.service.ts`) trả Phân bổ màu cỡ gom theo chuyền, mã hàng, màu, cỡ (cộng mọi kế hoạch, chỉ SL giao > 0) theo ĐVCS phiên (`A00`: mọi ĐVCS): đổi cột của `ShipmentPlanLine`, `ShipmentPlanLineColorSize` thì xem lại màn Xác nhận cấp BTP.

`ScheduleFeed` (`backend/src/modules/order/schedule-feed.service.ts`) dùng bởi module May để chép dòng dàn chuyền sang Kế hoạch chuẩn bị SX (ADR 0009):

- `linesOf(scope)`: mọi dòng dàn chuyền của ĐVCS phiên (`A00`: mọi ĐVCS) kèm số kế hoạch, khách hàng, mã hàng, tên sản phẩm, chuyền, SL, ngày vào chuyền, `createdAt` (cùng Id mà khác thời điểm tạo là dòng khác, vì Id được dùng lại sau khi nạp lại đơn hàng).
- `versionOf(scope)`: dấu phiên bản (số dòng + `CHECKSUM_AGG(BINARY_CHECKSUM(...))` các cột được chép) để module May chỉ chép lại khi đổi.
- Chỉ lọc ĐVCS, không theo phạm vi người dùng: kết quả không trả thẳng cho người dùng mà đi qua repository của module May (lọc theo quyền `order.prep`). Xem [Module May](07-may.md).
- `dayPlanLines(scope, { lineCodes?, activeOn?, ids? })` (phase 5.16, Kế hoạch may): dòng dàn chuyền của các chuyền đang chạy ở ngày `activeOn` (Ngày vào chuyền ≤ ngày ≤ Kết thúc ra chuyền; trống thì Kết thúc vào chuyền + số ngày ra chuyền của lịch ĐVCS), hoặc mọi dòng của các chuyền, cộng dòng trong `ids`; kèm PO/Buy date, Giá CM, số lượng. Đọc thẳng lúc mở màn, không chép.

`LineDayPlanGuards` (`line-day-plan-guard.ts`, quyết định 14.2): module May đăng ký hàm tra số đã lập ở Kế hoạch may; Xếp chuyền gọi sau khi ghi dàn chuyền, trước commit (`LinePlanService.saveLines`, mục 4.5). Đổi cột `ShipmentPlanLine` (Số lượng, chuyền, ngày) thì xem lại màn Kế hoạch may.

## 10. Test

| File | Phủ |
|---|---|
| `backend/test/phase5.spec.ts` (mục "Module Đơn hàng", "L3", "L4") | Chọn mã hàng theo Nhà máy SX của ĐVCS; Nhà máy SX theo OSM dạng danh sách, khóa sửa tay; đơn, PO dùng chung chỉ ghi ở ĐVCS nguồn; lập kế hoạch cho đơn ĐVCS khác, sửa tỷ lệ cắt PO trong kế hoạch; A00 chỉ đọc; thêm PO tay; vượt SL còn lại, hai người cùng lập; mỗi ĐVCS một kế hoạch mỗi đơn, mỗi PO một kế hoạch, thêm PO khi sửa, SL đã tạo KHXH chỉ trừ kế hoạch dùng chung PO (phase 5.17); xếp chuyền (số ngày nghỉ, kết thúc, ra chuyền, nhập kho theo lịch ĐVCS, ngày client gửi bị bỏ qua, ngày nghỉ quản trị vừa đặt có hiệu lực ở lần lưu sau và trên bảng dàn chuyền; phạm vi chuyền; dòng đang may); xác nhận tỷ lệ cắt; PO#, cỡ dạng BRAVO; chính sách cột, phạm vi trên các màn đơn hàng |
| `backend/test/phase5.spec.ts` (mục "L3": Phân bổ màu cỡ, phase 5.13) | Một dòng mỗi kế hoạch, chuyền theo thứ tự dàn chuyền, NSBQ trung bình các chuyền (lọc, sắp xếp, Trưởng chuyền chỉ tính chuyền mình), lọc theo chuyền; Trưởng chuyền chỉ thấy, sửa chuyền mình, tổng màu cỡ gồm chuyền khác; tách một màu cỡ cho hai chuyền; vượt SL kế hoạch của màu cỡ, vượt SL đã xếp của chuyền, chuyền khác, màu cỡ lạ, lặp; trạng thái chuyền và kế hoạch; Xếp chuyền không đề xuất, không giảm chuyền dưới phần đã giao; Kế hoạch xuất hàng không giảm, không bỏ màu cỡ đã giao |
| `backend/test/shipment-plan-pos.spec.ts`, `shipment-plan-pos-service.spec.ts` | Khung PO của kế hoạch: SL đã/chưa xác nhận, quyền `order.po:view`, cột suy ra, thứ tự theo cột xem được, `hiddenCount`; popup chọn PO (Thêm mới, `GET /:id/candidate-pos`) chỉ có PO chưa lập kế hoạch |
| `backend/test/shipment-plan-lines-service.spec.ts` | Màu cỡ của `GET /shipment-plans/:id`: mức cột suy ra của Số lượng gốc, SL đã tạo KHXH, SL còn lại; thiếu `order.po:view` |
| `backend/test/po-allocation.spec.ts`, `po-allocation-service.spec.ts` | Màn Phân bổ PO: quyền, dòng trùng tính một lần, giữ `Id` khi OSM không đổi, lọc, sắp xếp, cột suy ra theo chính sách cột của Nhà máy SX, cảnh báo lần làm mới, xuất file, danh mục vài trăm nhà máy không vượt giới hạn tham số |
| `backend/test/po-allocation-refresh.spec.ts` | Bước làm mới: chỉ ghi dòng đổi, dòng nhập tay giữ nhà máy khi ETD, `FtyName` đổi, khóa vắng khỏi OSM, nguồn rỗng, nguồn giảm quá ngưỡng, ngưỡng 100, giảm hai lần liên tiếp không làm phình mốc và OSM trở lại thì làm đủ, khóa có lại, tên nhà máy chưa có trong danh mục |
| `backend/test/po-allocation-write.spec.ts` | Đổi Nhà máy SX: quyền Sửa, `A00`, xem trước, áp cả khóa, luật ĐVCS theo nhà máy, nhà máy chưa gắn ĐVCS hoặc chưa vào danh mục, "Theo OSM", cột Chỉ đọc, 422, 409 khi đang làm mới |
| `backend/test/po-allocation-grant-migration.spec.ts` | Migration `MES_Core/0010` cấp quyền Sửa Phân bổ PO cho máy đã cài |
| `backend/test/bravo-import.spec.ts` | Hàm so `planImport` và danh sách nhà máy OSM |
| `backend/test/bravo-import.db.spec.ts` | Nạp tăng dần trên database: giữ phần người dùng sửa, ghi kiểm lại, khóa chéo, Nhà máy SX theo OSM, ghi nhiều lô |
| `backend/test/bravo-import-service.spec.ts`, `osm-factory-service.spec.ts` | Thử lại khi khóa chéo, xếp lần chạy, nhật ký |
| `backend/test/load-bravo.spec.ts` | Lưới màu cỡ, số đơn của ánh xạ |
| `backend/test/simulate-board.spec.ts`, `simulate-board.db.spec.ts` | Xếp lịch mô phỏng (cả lịch có đợt nghỉ dài, làm bù); xóa, giữ kế hoạch khi chạy lại (rollback) |
| `backend/test/work-calendar.spec.ts`, `frontend/src/test/work-calendar.test.ts` | Hàm tính ngày dàn chuyền theo lịch, bộ ca chung `backend/test/fixtures/work-calendar-cases.json` (kết quả tính tay); đẳng thức Kết thúc = Bắt đầu + SX + Nghỉ, ra chuyền, nhập kho cộng ngày lịch cho mọi ngày bắt đầu trong một năm có Tết; lịch nghỉ gần hết trả null |
| `frontend/src/test/color-size.test.tsx` | Luật popup phân màu cỡ (`colorSizeRules.ts`: dòng lúc mở, dòng khóa, tổng theo màu cỡ và theo chuyền, màu cỡ vượt chỉ do chuyền khác, chia theo SL chuyền, nhãn chuyền); màn: dòng gom, chia rồi lưu, cảnh báo vượt, chính sách cột, người chỉ xem, lưới xem gộp ô |
| `frontend/src/test/schedule-dates.test.ts` | Năm cột ngày: điền theo công thức, giữ ngày sửa tay, tính lại khi sửa số lượng, năng suất, ngày bắt đầu, giữ ngày dán cùng lượt, xóa ô lấy lại công thức, cột khóa theo chính sách cột, ô khác công thức, thứ tự ngày |
| `frontend/src/test/line-plan-schedule.test.tsx` | Popup Chi tiết dàn chuyền: giữ ngày đã lưu khác công thức, báo, Tính lại theo công thức rồi gửi năm ngày; thanh xem trước theo lịch; ngày nghỉ tô trên tiêu đề bảng; người chỉ xem thấy số đã lưu với tên cột mới |
| `frontend/src/test/shipment-plan-add-po.test.tsx` | Nút "Chọn mã hàng" của popup Sửa: chỉ PO chưa lập kế hoạch, Số lượng gốc cộng dồn, SL KHXH giữ nguyên, Lưu gửi `addPoIds` kèm lưới, Bỏ PO vừa thêm, khóa khi thiếu quyền xem PO |
| `frontend/src/test/order.test.tsx`, `cut-ratio-edit.test.tsx`, `po-allocation.test.tsx`, `shipment-plan-pos.test.tsx` | Định dạng ô bị Che/Ẩn, bảng dàn chuyền thiếu trường, kiểm lưới màu cỡ, hỏi lại khi đổi PO đang sửa, khóa Xóa PO trong kế hoạch, màn Phân bổ PO (kể cả đổi Nhà máy SX), khung Màu cỡ và khung PO của kế hoạch (chuyển qua lại, chính sách cột của SL KHXH) |

Cách chạy, database test riêng: [Dữ liệu mẫu và kiểm thử](12-du-lieu-mau-va-kiem-thu.md).
