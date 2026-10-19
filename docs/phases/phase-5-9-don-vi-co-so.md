# Phase 5.9 – Đơn vị cơ sở, Nhà máy SX, đăng nhập một form

**Trạng thái:** In progress (code, review, test frontend và backend, build xong; database máy chủ đã migrate tới `MES_Order/0006`, đã nạp đơn hàng; còn người dùng deploy code mới lên máy chủ, kiểm trên app, chốt các điểm ở Phát sinh) · **Bắt đầu:** 11/10/2026 · **Quyết định:** ADR 0013

## Mục tiêu
Theo yêu cầu người dùng sau khi triển khai lên máy chủ (11/10/2026):
1. "Chi nhánh SX" đổi thành **Đơn vị cơ sở** (ĐVCS), danh sách theo danh mục chi nhánh BRAVO (`MES_Sync.bravo.DM_CHINHANH`).
2. Danh mục **Nhà máy SX**, mỗi nhà máy gắn một ĐVCS.
3. Màn Người dùng: ngoài ĐVCS, tích thêm Nhà máy SX.
4. **Thông tin đơn hàng** lấy hết dữ liệu BRAVO, không lọc theo ĐVCS.
5. **Kế hoạch xuất hàng › Chọn mã hàng:** chỉ đơn hàng có Nhà máy SX thuộc các nhà máy được tích.
6. **Đăng nhập** không sang trang khác: đúng mật khẩu thì ô ĐVCS hiện ngay trên form.

## Chốt với người dùng (11/10/2026)
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Chọn mã hàng lọc theo nhà máy nào | **Mọi nhà máy được tích**, bất kể ĐVCS đang đăng nhập. Kế hoạch mang ĐVCS của phiên |
| Q2 | Máy chủ đã có đơn hàng BRAVO chưa | **Đã có** (nạp bằng `load:bravo`): chỉ cần bỏ lọc ĐVCS; lệnh nạp lấy đủ ĐVCS |
| Q3 | Giữ đơn vị tổng hợp A00 | **Giữ** |
| Q4 | Chạy migration ở đâu | Người dùng cấp tài khoản SQL Server của database máy chủ (dữ liệu demo), AI thao tác trực tiếp trên đó, không dùng localhost. Tài khoản do người dùng tự điền `backend/.env`. Khác CLAUDE.md mục 7, ghi ở ADR 0013 |

Tự chọn theo hướng hợp lý (người dùng có thể đổi):
- tên ĐVCS có trong BRAVO không sửa ở MES;
- ĐVCS vắng trong BRAVO không tự tắt;
- nhà máy SX quản lý ở Danh mục hệ thống (bảng riêng `SysProductionFactory`), màn ĐVCS chỉ hiện danh sách;
- màn Cập nhật tỷ lệ cắt (PO) cũng dùng chung toàn công ty như đơn hàng;
- đơn hàng, PO: mọi ĐVCS xem được, nhưng chỉ ĐVCS nhận đơn (Chi nhánh FOB) sửa, xóa, chọn Nhà máy SX, thêm PO được (review 5.9 H1). Đơn của ĐVCS chưa ai được gán thì chưa ai chọn được Nhà máy SX;
- `load:bravo` gán tạm Nhà máy SX cùng mã với chi nhánh nhận đơn (nếu nhà máy đó đang dùng);
- đơn từ BRAVO chưa có Nhà máy SX, người dùng chọn ở Thông tin đơn hàng.

## Task
| # | Việc | Trạng thái |
|---|---|---|
| 5.9.1 | ADR 0013; migration `MES_Core/0007_production_factory.sql` (bảng nhà máy SX, gán cho người dùng, chép `PROD_FACTORY`, đổi tên chiều `FACTORY`), `MES_Order/0005_shared_sales_order.sql` (khóa ngoại theo Id, chỉ mục); `softkeys.json` | Xong, đã chạy trên database máy chủ |
| 5.9.2 | Chép ĐVCS từ BRAVO: `branch-import.ts`, tự chạy sau đồng bộ `BRAVO.DM_CHINHANH`, `POST /admin/branches/import`, seed, `load:bravo`, `reset:demo`; màn Quản trị › Đơn vị cơ sở | Xong |
| 5.9.3 | Danh mục Nhà máy SX: `/admin/catalogs/factories`, ngăn Nhà máy SX ở Danh mục hệ thống; ô Nhà máy SX ở Thông tin đơn hàng gom theo ĐVCS | Xong |
| 5.9.4 | Gán Nhà máy SX cho người dùng: `PUT /admin/users/:id/branches` thêm `productionFactoryIds`, `UserAccess.productionFactories`, `/me` trả `productionFactories`; popup gán ĐVCS và nhà máy SX ở màn Người dùng | Xong |
| 5.9.5 | `BaseRepository`: `originBranch`, `productionFactoryColumn` + `assignedFactories`; `ChildRepository` lọc ĐVCS theo cha. Đơn hàng, PO sang `SHARED`; Chọn mã hàng, PO, lưới màu cỡ, tạo kế hoạch lọc theo nhà máy SX; SL đã lập tính mọi ĐVCS | Xong |
| 5.9.6 | Màn đăng nhập một form; đổi chữ "nhà máy" thành "đơn vị cơ sở" trên giao diện | Xong |
| 5.9.7 | Test: backend (`phase3`, `phase5`, `catalog` sửa và thêm bài), frontend (đăng nhập, quản trị, đổi ĐVCS) | Frontend 144 qua. Backend 12/10/2026 chạy trên bộ database `MES_*_Test` riêng trên máy chủ (migrate → seed mẫu → đồng bộ danh mục chi nhánh, cỡ từ database trung gian): **220 qua, 2 bỏ qua** (bài cần database trung gian cùng máy); sau review lượt 3, 4 của 5.9.10: **232 qua, 2 bỏ qua**, 18 bộ. Đã xóa bộ `MES_*_Test`. Lần chạy đầu lộ hai lỗi đã sửa: (1) cài máy demo mới theo `migrate` rồi `seed` thì admin không có ĐVCS mẫu (seed nay gán ĐVCS, nhà máy SX vừa tạo trong lần chạy cho tài khoản mẫu đã có; thêm bài ở `seed.spec`); (2) `column-filter.spec` còn kỳ vọng đơn hàng lọc theo ĐVCS, sửa theo ADR 0013 và kiểm phạm vi ĐVCS bằng Kế hoạch xuất hàng |
| 5.9.8 | Review `code-reviewer` (`docs/review/phase-5-9.md`) | Lượt 1 BLOCK (1 HIGH) đã sửa; lượt 2 APPROVE WITH SUGGESTIONS, đã sửa 1 MEDIUM, 6 LOW |
| 5.9.9 | Triển khai lên database máy chủ: dừng backend cũ → `npm run migrate` không tham số (chạy cả seed) → build, chạy bản mới; kiểm trên app thật | Đã migrate, seed (11/10/2026): 0007, 0005; `order.allocation`, `order.po` sang `SHARED`; ĐVCS A01–A05 theo BRAVO (A03 `VSN-PM` → `VAC`, A04 `VSNT` → `VSN-NT`), A06 giữ, đánh dấu không có trong BRAVO; nhà máy SX A01–A03 chép từ danh mục cũ; nút cây tổ chức A04, A05. 12/10/2026 người dùng đồng ý nạp đơn hàng lần đầu: `load:bravo --no-plans --allow-remote-db` (NODE_ENV tạm `development` cho riêng lần chạy) lúc mọi bảng đơn hàng, kế hoạch còn trống: 5.291 đơn (A01 2.418, A02 1.215, A03 152, A04 1.349, A05 157), 22.717 PO, 129.307 ô màu cỡ; 5.440 sản phẩm chưa có PO chưa nạp. Còn: người dùng deploy code mới, kiểm trên app |
| 5.9.10 | Nạp tăng dần đơn hàng BRAVO sau mỗi đợt đồng bộ (người dùng chốt 12/10/2026, ADR 0013 mục 8): `SyncService.onQueueDrained`, `bravo-order-source.ts`, cổng `BravoFeedService`, `bravo-order.mapping.ts` (dùng chung với `load:bravo`), `BravoOrderImportRepository`/`Service`, `BranchService.activeCodes` | Xong. Review lượt 3 BLOCK (H1: biết BRAVO đổi theo `SyncedAt` sai với nguồn chép theo nhóm) đã sửa bằng dấu nội dung `SalesOrder.SourceHash`, migration `MES_Order/0006` (đã chạy trên database máy chủ 12/10/2026, chỉ thêm cột NULL); cờ `BRAVO_ORDER_IMPORT`; nạp lúc khởi động. Chạy thử không ghi trên dữ liệu máy chủ: đọc nguồn ~2 giây, đọc MES ~1 giây; lần đầu ghi lại 5.291 đơn kèm dấu (chưa đơn nào bị sửa tay, không đơn nào bị coi là BRAVO đổi), so lại sau đó không còn gì. Chạy thử bắt được hai lỗi đã sửa: `EXISTS` trong danh sách cột; số PO "(trống)" lưu mất dấu ở cột `VARCHAR` làm 34 PO bị coi là mới |
| 5.9.11 | Nhà máy SX theo OSM, số PO dài (người dùng yêu cầu 12/10/2026, ADR 0013 mục 9): nguồn đồng bộ `OSM.OSMDataFty` (`MES_Sync/0005`, `0006`, `DB_OSM_NAME`); `SalesOrder.ProductionFactoryCode NVARCHAR(400)` danh sách nhà máy, `IsFactoryFromOsm`, `SalesOrderPo.PoNumber NVARCHAR(192)` (`MES_Order/0007`); mã nhà máy `NVARCHAR(100)` (`MES_Core/0008`); danh mục tự thêm tên nhà máy OSM; `OsmFactoryService`; lọc Chọn mã hàng theo danh sách (`STRING_SPLIT`); khóa sửa tay ở Thông tin đơn hàng | Xong. Review lượt 5 APPROVE WITH SUGGESTIONS (4 MEDIUM, 12 LOW), đã sửa hoặc ghi lý do chấp nhận (`docs/review/phase-5-9.md`). Backend 242 qua, 2 bỏ qua (bộ `MES_*_Test`, đã xóa); frontend 144 qua. Máy chủ 12/10/2026: migrate `MES_Core/0008`, `MES_Order/0007`, `MES_Sync/0005`, `0006`; đồng bộ OSM 3.511 dòng; danh mục thêm 25 nhà máy; 2.874 đơn nhận Nhà máy SX theo OSM, 2.417 đơn để trống chờ chọn; 34 PO "(trống)" sửa lại dấu |
| 5.9.12 | Màn Phân bổ PO (người dùng yêu cầu 12/10/2026, ADR 0013 mục 10): Quản trị đơn hàng, ngay sau Thông tin đơn hàng; dữ liệu view OSM `DB_OSM_TRE.NTB_DB.dbo.v_OSMData` chép vào `MES_Sync.osm.OSMData` (nguồn `OSM.OSMData`, `MES_Sync/0007`, `DB_OSM_APP_NAME`, `DB_OSM_APP_SERVER`; người dùng chốt chép qua lớp đồng bộ, không đọc thẳng); 11 cột của view cộng Đơn vị cơ sở theo danh mục Nhà máy SX; tài nguyên `order.poallocation` (chỉ Xem, Xuất file); `scripts/source-databases.ts`; seed cập nhật thứ tự menu lá | Xong code, test. Review lượt 6 APPROVE WITH SUGGESTIONS (3 MEDIUM, 9 LOW), lượt 7 kiểm bản sửa APPROVE WITH SUGGESTIONS (5 LOW), đã sửa hoặc ghi lý do (`docs/review/phase-5-9.md`). Test trên bộ database riêng `MES_*_TPO` (đã xóa): backend 260 qua, 2 bỏ qua, cộng bài chính sách cột thật; frontend 149 qua; chép thử 30.028 dòng qua linked server ~4 giây; trang ~0,25 giây trên 25.105 dòng sau khi bỏ trùng. **Chưa migrate máy chủ:** lệnh `npm run migrate` bị chặn bởi phân quyền của công cụ, chờ người dùng chạy (chỉ còn `MES_Sync/0007`) rồi đồng bộ nguồn "Phân bổ PO theo nhà máy (OSM)" |
| 5.9.13 | Chọn mã hàng theo ĐVCS đăng nhập, Cập nhật tỷ lệ cắt theo kế hoạch của ĐVCS (người dùng yêu cầu 12/10/2026, ADR 0013 mục 11). Chốt: mọi nhà máy thuộc ĐVCS (bỏ tích nhà máy theo người), "được lên kế hoạch" là kế hoạch xuất hàng của ĐVCS đăng nhập, PO nhập tay vẫn hiện. `UserAccess.productionFactories` theo `SysProductionFactory.BranchCode`; danh mục đổi ĐVCS, thêm, bật/tắt nhà máy tăng phiên bản quyền; bỏ tích nhà máy ở màn Người dùng (API, giao diện, seed; bảng giữ); `BaseRepository.usedBy`, `inUseHere`: PO trong kế hoạch của ĐVCS ghi được như ĐVCS nguồn, màn Tỷ lệ cắt chỉ có PO đang dùng ở ĐVCS; Thêm PO cho mã hàng đang dùng ở ĐVCS, PO mang ĐVCS của phiên; migration `MES_Order/0008` (khóa ngoại PO → đơn theo `Id`, chỉ mục `ShipmentPlanPo`); danh sách mã hàng một dòng mỗi đơn; nút Xóa PO khóa sẵn khi PO đã vào kế hoạch | Xong code, test. Review lượt 8 APPROVE WITH SUGGESTIONS (2 MEDIUM, 10 LOW), lượt 9 kiểm bản sửa APPROVE WITH SUGGESTIONS (3 LOW), đã sửa: khóa PO khi sửa tỷ lệ, xác nhận, xóa; thêm, đổi ĐVCS, bật/tắt nhà máy cần thêm quyền sửa phân quyền; bước nạp BRAVO không ghép PO tay của ĐVCS khác (`docs/review/phase-5-9.md`). Test trên bộ `MES_*_TCR` (đã xóa): backend 264 qua, 2 bỏ qua; frontend 152 qua; lint, build qua. **Chưa migrate máy chủ:** `npm run migrate -- MES_Order` bị phân quyền của công cụ chặn, chờ người dùng chạy (chỉ `MES_Order/0008`, chạy trước khi deploy code mới). Máy chủ: `dat.le` tích VIET DUC (A02) nhưng chưa được gán A02; 18 nhà máy gia công ngoài chưa gắn ĐVCS (670 đơn chỉ có các nhà máy này, chưa lập kế hoạch được ở đâu) |
| 5.9.14 | Khung "PO của kế hoạch" ở Kế hoạch xuất hàng (người dùng yêu cầu 12/10/2026, chốt "theo đề xuất" ở `phase-5-9-14-po-xac-nhan-khxh.md`): chọn một kế hoạch thì thấy PO đã chọn khi lập, PO nào đã xác nhận ở Cập nhật tỷ lệ cắt, SL đã xác nhận / chưa xác nhận theo cả PO, tổng; `GET /order/shipment-plans/:id/pos` (`order.shipment:view` và `order.po:view`, chính sách cột của `order.po` ở handler, cột suy ra theo cột nguồn, thứ tự chỉ theo cột xem được, `hiddenCount`); sửa kèm popup Chọn mã hàng áp chính sách cột của `order.po` thay cho cột cùng tên của kế hoạch; lớp CSS `split-rows`. Không migration | Xong code, test. Review lượt 10 APPROVE WITH SUGGESTIONS (1 MEDIUM, 6 LOW), đã sửa hoặc ghi lý do (`docs/review/phase-5-9.md`). Test trên bộ `MES_*_TPP`: backend 272 qua, 2 bỏ qua (1 bài `catalog.spec` quá giờ lúc máy bận, chạy riêng qua); sau khi sửa các bài liên quan 63 qua; frontend 158 qua; lint, build qua. Kiểm giao diện bằng dữ liệu giả ở 1366×768, 1920×1080, điện thoại. Còn: deploy code mới (không cần migrate), người dùng kiểm trên app |

## Phạm vi review
Backend:
- `platform/data/base.repository.ts`
- `platform/permission/permission.service.ts`
- `platform/admin/*` (branch-import, branches, users, controller, dto, module)
- `platform/catalog/*`, `platform/sync/*`, `platform/me/me.service.ts`
- `modules/order/*` (repositories, sales-order, shipment, controller, types)
- migration `MES_Core/0007`, `MES_Order/0005`, `softkeys.json`
- `scripts/seed*.ts`, `reset-demo.ts`, `load-bravo-orders.ts`, `bravo-branches.ts`
- 5.9.14: `modules/order/order.controller.ts` (`:id/pos`, `@FieldResource('order.po')` ở hai handler), `shipment.service.ts` (`posOfPlan`, `presentPlanPo`, `poSort`), `platform/permission/field-policy.service.ts` (xuất kiểu `AccessLevel`), `po-allocation.service.ts` (dùng kiểu đó); frontend `ShipmentPage.tsx`, `features/order/api.ts`, `theme/global.css`; test `shipment-plan-pos*.spec.ts`, `shipment-plan-pos.test.tsx`
- 5.9.13: migration `MES_Order/0008`, `platform/data/base.repository.ts` (`usedBy`, `inUseHere`, ghi bảng `originBranch`), `permission.service.ts`, `catalog.service.ts`, `admin-users.service.ts`, `admin.controller.ts`, `admin.dto.ts`, `me.service.ts`, `modules/order/order.repositories.ts`, `cut-ratio.service.ts`, `shipment.service.ts`, `scripts/seed*.ts`; frontend `UserBranchesDialog.tsx`, `UsersPage.tsx`, `CutRatioPage.tsx`, `ShipmentPage.tsx`, `CatalogsPage.tsx`; test `phase5.spec.ts`, `catalog.spec.ts`, `column-filter.spec.ts`, `admin-pages.test.tsx`, `cut-ratio-edit.test.tsx`
- 5.9.12: migration `MES_Sync/0007`, `scripts/source-databases.ts`, `migrate.ts` (synonym theo database nguồn), `sync-gen.ts` (nguồn `v_OSMData`, đọc cột qua linked server), `seed.ts` (thứ tự menu lá), `seed-data.ts`, `config/env.ts`, `platform/sync/osm-po-source.ts`, `sync.repository.ts`, `sync.service.ts`, `platform/feed/source-feed.service.ts`, `modules/order/po-allocation.service.ts`, `order.controller.ts`, `order.dto.ts`, `order.module.ts`; frontend `PoAllocationPage.tsx`, `features/order/api.ts`, `routes/registry.tsx`; test `po-allocation*.spec.ts`, `seed.spec.ts`, `sync-gen.spec.ts`, `po-allocation.test.tsx`
- 5.9.11: migration `MES_Order/0007`, `MES_Core/0008`, `MES_Sync/0005`, `0006`, `softkeys.json`, `scripts/sync-gen.ts`, `migrate.ts`, `check-softkeys.ts`, `platform/feed/*`, `platform/catalog/factory-list.ts`, `catalog.service.ts`, `catalog.dto.ts`, `platform/data/base.repository.ts` (`assigned`), `modules/order/osm-factory.service.ts`, `sales-order.service.ts`, `order.dto.ts`; frontend `SalesOrderPage`, `ShipmentPage`, `CutRatioPage`, `CatalogsPage`, `factoryLabel.ts`
- 5.9.10: migration `MES_Order/0006`, `config/env.ts` (`BRAVO_ORDER_IMPORT`), `platform/sync/bravo-order-source.ts`, `sync.service.ts` (`onQueueDrained`), `platform/bravo/*`, `modules/order/bravo-order.mapping.ts`, `bravo-order-import.repository.ts`, `bravo-order-import.service.ts`, `platform/permission/branch.service.ts`, test `bravo-import.spec.ts`, `bravo-import.db.spec.ts`, `sync.spec.ts`

Frontend:
- `features/auth/LoginPage.tsx`
- `features/admin/BranchesPage.tsx`, `UsersPage.tsx`, `UserBranchesDialog.tsx`, `CatalogsPage.tsx`
- `features/order/SalesOrderPage.tsx`, `ShipmentPage.tsx`
- `store/*`, chữ ở các màn còn lại

## Không làm
- Ánh xạ đơn hàng theo BA chốt (5.2.8): bước nạp tăng dần (5.9.10) dùng giả định tạm; xử lý đơn, PO bị xóa ở BRAVO.
- ~~Lọc màn Cập nhật tỷ lệ cắt~~ (12/10/2026 người dùng yêu cầu lọc theo kế hoạch xuất hàng của ĐVCS, 5.9.13); lọc Xếp chuyền theo nhà máy SX.
- Đổi tên bảng, cột `SysBranch`, `BranchCode` trong code.

## Phát sinh
- ~~Máy chủ chưa có đơn của A04, A05; `MES_Order.SalesOrder` trống~~: 12/10/2026 người dùng đồng ý nạp lần đầu bằng `load:bravo --no-plans` (bảng đang trống), từ nay đơn mới vào bằng bước nạp tăng dần (5.9.10).
- ~~Test backend trên database máy chủ~~: 12/10/2026 người dùng chọn bộ database test riêng `MES_*_Test` trên cùng máy chủ (migrate + seed mẫu, chạy test, xong xóa bộ test).
- ~~Một bộ phận chung chọn Nhà máy SX cho đơn của mọi ĐVCS~~: 12/10/2026 người dùng chốt giữ như hiện tại (chỉ ĐVCS nhận đơn chọn).
- ~~Cột `SalesOrderPo.PoNumber` là `VARCHAR`~~: 12/10/2026 người dùng yêu cầu đổi sang `NVARCHAR(192)` (5.9.11).
- ~~Danh mục Nhà máy SX trên máy chủ có 5 mục tạo tay (A01 "Nhà máy VSN-ĐN", A02 "Nhà máy VĐC", A03, NM04, NM05) trùng nghĩa với tên OSM~~: kiểm 12/10/2026 thấy 5 mục đã tắt, các nhà máy OSM đã gắn ĐVCS (trừ 18 xưởng gia công ngoài chưa gắn).
- Popup Chọn mã hàng (`CANDIDATE_PO_COLS`) không áp chính sách cột của `order.po` ở giao diện: cột PO bị Ẩn vẫn hiện thành cột trống (máy chủ đã bỏ dữ liệu, không lộ). Phát hiện ở review 5.9.14, có từ trước: sửa khi người dùng đồng ý.
- Bảng `SysUserProductionFactory` không còn dùng từ 5.9.13 (lọc theo ĐVCS): chờ người dùng chốt xóa bằng migration.
- `.env` máy chủ đặt `NODE_ENV=production` nhưng không có `JWT_SECRET`: backend bản này từ chối khởi động khi thiếu. Kiểm lại `.env` trên máy chạy backend trước khi deploy.
- ĐVCS A06 (VSN-DN) không có trong BRAVO, đang bật: chờ người dùng quyết giữ hay tắt.
- Ghép OSM theo mã hàng `DM_SanPhamDonHang.StyleName = vOSMDataFty.StyleNo` (cùng kết quả câu người dùng đưa). BRAVO còn cột `StyleName_OSM`: chờ BA xác nhận cột nào đúng.
- Lọc theo cột Nhà máy SX ở Thông tin đơn hàng đang khớp nguyên danh sách ("VIET DUC,VSN-DN"), chưa lọc theo từng nhà máy trong danh sách: làm sau nếu cần.
- 12/10/2026 người dùng yêu cầu **tạm tắt** nạp tăng dần: `BRAVO_ORDER_IMPORT=false` trong `backend/.env`. Đơn đã nạp vẫn hiện; đơn mới từ BRAVO chưa vào cho tới khi người dùng bật lại (`true`, khởi động lại backend).
