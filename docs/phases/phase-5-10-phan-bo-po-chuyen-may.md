# Phase 5.10 – Nhà máy SX nhập tay ở Phân bổ PO, chuyền may theo bộ phận Xưởng sản xuất

**Trạng thái:** Ready for review (13/10/2026; code ở nhánh `phase-5-10`, chưa gộp `main`, chưa push) · **Bắt đầu:** 12/10/2026 · **Quyết định liên quan:** `13-quyet-dinh.md` mục 3.5, 6.4, 6.5, 7.6, 7.8, 10.2, 10.4 (sẽ thêm hai mục mới, xem 5.10.0)

## Mục tiêu

Yêu cầu A: Phân bổ PO.
- Người có quyền sửa được Nhà máy SX của một dòng hoặc nhiều dòng Phân bổ PO; `A00` không sửa được.
- Dòng đã sửa tay mang dấu "Nhập tay", thấy được trên lưới và lọc được.
- Đồng bộ OSM lại thì Nhà máy SX của dòng nhập tay giữ nguyên, các cột khác (Brand, Season, Ship mode, ETD…) cập nhật theo OSM. Dòng không nhập tay cập nhật toàn bộ theo OSM.
- Bỏ được dấu "Nhập tay" để dòng quay lại theo OSM.
- Kiểm được bằng test: đồng bộ giả lập đổi `FtyName` và `ETD` ở bảng chép, chạy bước làm mới, dòng nhập tay giữ nhà máy, ETD đổi.

Yêu cầu B: Chuyền may.
- Form bộ phận (Sơ đồ tổ chức) có ô tích "Xưởng sản xuất".
- Mọi ô chọn "Chuyền may" (Xếp chuyền, Phân bổ màu cỡ, Kế hoạch chuẩn bị SX, ô lọc Chuyền) chỉ liệt kê bộ phận được tích, có ĐVCS bằng ĐVCS đăng nhập; ở `A00` liệt kê của mọi ĐVCS (chỉ đọc).
- Bỏ danh mục chuyền may cũ: ngăn Chuyền, Xưởng ở Danh mục hệ thống và API `/admin/catalogs/lines`, `/workshops`.
- Phân quyền theo chuyền (Trưởng chuyền chỉ thấy chuyền được giao) vẫn đúng sau khi đổi nguồn.

## Chốt với người dùng

| # | Câu hỏi | Đề xuất | Chốt |
|---|---|---|---|
| Q1 | Sửa Nhà máy SX ở Phân bổ PO có lan sang Nhà máy SX của đơn hàng (Thông tin đơn hàng, Chọn mã hàng) không? | Không lan. Hai nguồn OSM đang độc lập (`vOSMDataFty` cho đơn, `v_OSMData` cho Phân bổ PO) | Không lan |
| Q2 | ĐVCS nào được sửa một dòng Phân bổ PO? | Dòng có nhà máy hiện tại thuộc ĐVCS đăng nhập hoặc chưa gắn ĐVCS; chọn sang nhà máy nào cũng được (theo tinh thần mục 7.2: ĐVCS khác không đổi dữ liệu mà ĐVCS khác dựa vào) | Theo ĐVCS của nhà máy, như đề xuất |
| Q3 | Phân quyền theo chuyền chuyển sang bộ phận thế nào? | Phạm vi chiều `LINE` lưu theo mã bộ phận (chiều giá trị), bỏ hẳn nút Xưởng, Chuyền khỏi `SysOrgUnit`; mất phạm vi "cả xưởng" (giao diện chưa dùng, Q18 ở `02`) | Lưu theo mã bộ phận |
| Q4 | Chuyền cũ (`A01-L01`…) và dữ liệu đang gắn vào chúng? | Script chép chuyền, xưởng cũ thành bộ phận cùng mã, được tích; kế hoạch, chuẩn bị SX, phạm vi đã có giữ nguyên. Chạy thử trước, máy chủ chạy khi được cho phép | **Bỏ, Nhân sự tạo mới**: không chép chuyền cũ; dữ liệu đang gắn mã chuyền cũ thành mồ côi (hệ quả ở mục Rủi ro). Bỏ task 5.10.13 |
| Q5 | Nhà máy nhập tay gắn vào dòng Phân bổ PO theo khóa nào? Số đếm 12/10/2026 trên `MES_Sync` máy chủ: 25.105 dòng khác nhau; theo SO+PO+Style No+Màu có 23.585 khóa, 1.420 khóa nhiều dòng, 786 khóa OSM chia nhiều nhà máy; thêm ETD-REVISED còn 74 khóa nhiều nhà máy; 1.625 dòng OSM chưa có nhà máy | SO + PO + Style No + Màu | SO + PO + Style No + Màu: một lần sửa áp cho mọi dòng cùng khóa (kể cả phần OSM chia nhiều nhà máy), màn báo trước số dòng bị áp |
| Q6 | Khóa đã nhập tay về nhà máy ĐVCS A; OSM thêm vào khóa đó một dòng mới phân cho nhà máy ĐVCS B. Dòng mới xử lý thế nào? (review A, L7) | Theo nhóm nhập tay | Theo nhóm nhập tay (13/10/2026): dòng mới nhận nhà máy nhập tay của A; B muốn đổi thì nhờ A |

Điểm tự chọn theo hướng hợp lý, người dùng có thể đổi:
- Ô tích "Xưởng sản xuất" đánh dấu **chính bộ phận đó là một chuyền** trong ô chọn; ô chọn gom nhóm theo bộ phận cha (thay cấp Xưởng cũ). Cột `Department.IsProductionWorkshop`.
- Bộ phận được tích bắt buộc có ĐVCS (ràng buộc ở database). Tích, bỏ tích, đổi ĐVCS của bộ phận đã tích là đổi phạm vi dữ liệu: đòi thêm `admin.permission:update`, tăng phiên bản quyền (như chuyển chuyền cũ ở mục 6.5). Vai trò Nhân sự vẫn sửa tên, cha, người phụ trách bình thường.
- Quyền Sửa Phân bổ PO (`order.poallocation:update`) cấp cho vai trò Kế hoạch (`PLANNER`) và Toàn quyền; vai trò khác giữ như cũ.
- Dòng Phân bổ PO không còn trong OSM: dòng không nhập tay thì xóa khỏi bảng; dòng nhập tay thì giữ, đánh dấu "Không còn trong OSM".
- Một lần sửa nhiều dòng: tích chọn dòng trên lưới rồi bấm "Đổi nhà máy SX".

## Thiết kế tóm tắt

### A. Phân bổ PO có bảng ở `MES_Order`

Hiện màn đọc thẳng bảng chép `MES_Sync.osm.OSMData`; bảng này bị xóa rồi chép lại toàn bộ mỗi lần đồng bộ, `SyncRowId` đổi, không có khóa dòng ổn định, khoảng 1/6 số dòng trùng nguyên dòng. Không thể gắn dấu "Nhập tay" vào đó.

Phương án chọn: bảng `MES_Order.dbo.PoAllocation` là bản làm việc của MES.
- Một bước làm mới chạy sau mỗi đợt đồng bộ có nguồn `OSM.OSMData` và lúc khởi động (theo mẫu `OsmFactoryService`, đọc qua `SourceFeedService`). Bước này upsert theo `RowKey`: cột OSM luôn cập nhật; `ProductionFactoryCode` chỉ cập nhật khi `IsFactoryManual = 0`; `OsmFactoryCode` luôn giữ giá trị OSM mới nhất để màn hiện "OSM: …" cạnh giá trị nhập tay.
- Bảng `PoAllocation`: mỗi dòng khác nhau của OSM một dòng, nhận diện bằng `RowHash` (băm nguyên 11 cột OSM, duy nhất) để `Id` không đổi khi dòng không đổi. Khóa nhập tay (Q5) là `SoNo, PoNo, StyleNo, Color` (có chỉ mục); `SoNo`, `Color` có thể `NULL`. Cột: các cột OSM (`Brand, Season, PoNo, SoNo, ShipMode, StyleName, StyleNo, Color, EtdActualDate, EtdRevisedDate`), `OsmFactoryCode` (FtyName của OSM), `ProductionFactoryCode` (giá trị hiện hành: nhập tay hoặc theo OSM), `IsFactoryManual`, `IsInOsm`, `SyncedAt`, `CreatedAt/By`, `ModifiedAt/By` (người nhập tay). Độ dài cột theo bảng chép (`PO NVARCHAR(102)`, `StyleNo NVARCHAR(122)`, `Color NVARCHAR(164)`, `FtyName NVARCHAR(510)`).
- Bước làm mới: lấy bản đồ khóa → nhà máy từ các dòng `IsFactoryManual = 1`; upsert theo `RowHash`; dòng có khóa trong bản đồ nhận nhà máy nhập tay, dòng khác nhận `OsmFactoryCode`; dòng không còn trong OSM thì xóa, trừ khi khóa của nó nhập tay và OSM không còn dòng nào cùng khóa: giữ lại, `IsInOsm = 0` (để nhà máy nhập tay không mất khi OSM tạm thiếu PO). Ghi theo lô qua bảng tạm, không vượt 2.100 tham số.
- Ghi: `PUT /order/po-allocations/factory` nhận `ids` của dòng đang thấy; máy chủ đổi `ids` thành khóa và áp cho mọi dòng cùng khóa; có chế độ xem trước (`dryRun`) trả số dòng sẽ bị áp để popup báo. Luật ĐVCS (Q2): mọi dòng của các khóa bị áp phải có nhà máy hiện tại thuộc ĐVCS đăng nhập, hoặc chưa có nhà máy, hoặc nhà máy chưa gắn ĐVCS; điều kiện dựng ở `BaseRepository` (mở rộng `productionFactoryColumn`/`assigned` của mục 7.3), không viết trong service. `A00` bị từ chối.
- Chốt an toàn: bảng chép rỗng, hoặc số dòng giảm quá 20% so với bảng, thì không xóa dòng vắng (tránh lỗi "nguồn FULL xóa phần lớn bảng" ghi ở `02-trang-thai.md`).
- Màn đọc qua repository kế thừa `BaseRepository` (`SHARED`), nên lọc, sắp xếp, popup giá trị, xuất file theo giá trị đã gộp nhập tay; ĐVCS vẫn suy từ Nhà máy SX theo danh mục.
- Phương án loại: ghép bảng ghi đè lúc đọc (truyền danh sách ghi đè làm tham số, vướng giới hạn 2.100 tham số và phải join giữa database).

Hệ quả: thay mục 7.8 ("không có bảng ở `MES_Order`, câu đọc ở lớp đồng bộ"). Thêm mục quyết định mới.

### B. Chuyền may là bộ phận Xưởng sản xuất

- Dữ liệu nghiệp vụ chỉ lưu mã chuyền (`ShipmentPlanLine.LineCode`, `SewingPrep.LineCode`, `VARCHAR(20)`), cùng định dạng với `Department.Code` (duy nhất, không sửa được). Bộ phận dùng đúng mã chuyền cũ thì không phải đổi cột nào.
- `OrgService` (nền tảng) giữ vai trò cửa duy nhất cho danh sách chuyền, đổi nguồn: module Nhân sự đăng ký một `LineSource` vào `OrgService` (nền tảng không import module; module Đơn hàng, May không import Nhân sự). `/me/lines` giữ nguyên hợp đồng, `workshopCode/Name` là bộ phận cha.
- Phạm vi chiều `LINE` lưu `ScopeValue` = mã bộ phận; `PermissionService` chỉ giữ mã đang là chuyền đang dùng (đóng an toàn). Nút gốc `FACTORY` của `SysOrgUnit` giữ nguyên vì phạm vi ĐVCS cần.
- Lọc ĐVCS của ô chọn lấy ĐVCS từ phiên (token), viết rõ trong truy vấn của nguồn chuyền vì `hr.orgchart` là tài nguyên dùng chung.

Hệ quả: thay mục 6.4, 6.5 (phần Xưởng, Chuyền), sửa mục 10.2 ("cây phòng ban riêng, không dùng `SysOrgUnit`": nay bộ phận được tích là chuyền), mục 3.5 (chiều `LINE` thành chiều giá trị). Thêm mục quyết định mới.

## Task

| # | Việc | Người làm | Trạng thái |
|---|---|---|---|
| 5.10.0 | **Chuẩn bị, phiên chính làm tuần tự.** (1) Người dùng cho phép commit phần đang dở (5.1.9, 5.9.14) lên nhánh nền `phase-5-10` (không push); thiếu bước này thì worktree tách từ `HEAD` sẽ thiếu code mới của `po-allocation.service.ts`, `order.controller.ts`, `seed.ts`… (2) Chốt Q1–Q4, ghi hai mục quyết định nháp vào `13-quyet-dinh.md`. (3) Đếm trên database máy chủ (chỉ đọc, chỉ in số đếm): ở `MES_Sync.osm.OSMData` số khóa ứng viên trùng, số khóa có hơn một `FtyName`, chốt cột của `RowKey`; số dòng `ShipmentPlanLine`, `SewingPrep` đang gắn chuyền cũ (hệ quả Q4). (4) Viết hợp đồng giữa các luồng và commit lên `phase-5-10`: interface `LineSource` và bản giả cho test ở `backend/src/platform/org`, quy ước "phạm vi `LINE` lưu theo mã", đặt số migration (bảng dưới). 0,5 ngày | Phiên chính | Xong: commit `17cca79` (phần đang dở), `394caa1` (hợp đồng), `f2ec748` (phần nền); Q1–Q5 chốt; mục 6.7, 7.9 nháp ở `13-quyet-dinh.md`; migrate + seed thử trên bộ `MES_*_T510Z` qua, nguồn chuyền trả 12 chuyền A01, 26 chuyền ở `A00` |
| 5.10.1 | Migration `MES_Order/0009_po_allocation.sql` (bảng `PoAllocation`: cột OSM, `RowKey` duy nhất, `ProductionFactoryCode`, `OsmFactoryCode`, `IsFactoryManual`, `IsInOsm`, `CreatedAt/By`, `ModifiedAt/By`, chỉ mục cho lọc, sắp xếp mặc định); `order.types.ts`; `softkeys.json` (`ProductionFactoryCode` → `SysProductionFactory.Code`, `ModifiedBy` → `SysUser.Id`) | Agent A | Xong (A `015de57`); chưa chạy trên database dùng chung |
| 5.10.2 | Bước làm mới sau đồng bộ `OSM.OSMData` và lúc khởi động: transaction có khóa ứng dụng, upsert theo lô, giữ nhà máy của dòng nhập tay, chốt an toàn 20%, nhật ký `PO_ALLOCATION_REFRESH` (người `system`). Test trên database: đổi `FtyName`, `ETD` ở bảng chép → dòng nhập tay giữ nhà máy, ETD đổi; dòng thường đổi cả hai; nguồn rỗng không xóa gì | Agent A | Xong (A `ac16777`); `po-allocation-refresh.spec` 4/4 |
| 5.10.3 | Đọc màn từ `PoAllocation` qua repository (`SHARED`): `list`, `values`, `options`, `export` giữ hành vi cũ (sắp xếp mặc định, 100 dòng, xuất 50.000 dòng, ĐVCS theo mức chính sách cột của Nhà máy SX); thêm cột `isFactoryManual`, `osmFactoryName`. Bỏ đường đọc cũ ở `osm-po-source.ts`, giữ phần đọc nguồn cho 5.10.2 | Agent A | Xong (A `ac16777`); `po-allocation.spec` 7/7 |
| 5.10.4 | Ghi: `PUT /order/po-allocations/factory` body `{ ids, factoryName }` (`factoryName: null` là "Theo OSM"); `@RequirePermission('order.poallocation:update')`; `A00` bị từ chối; luật ĐVCS theo Q2; nhà máy phải đang dùng trong danh mục; chính sách cột của `factoryName` tự áp qua `FieldPolicyInterceptor` (khóa định danh trong body không trùng tên cột đã đăng ký); nhật ký `PO_ALLOCATION_FACTORY` có giá trị trước, sau. Seed: ma trận thêm `U` cho `PLANNER`, `resourceFields` thêm `isFactoryManual`; migration `MES_Core/0010` cấp quyền cho máy đã cài, tăng phiên bản quyền. Test: không quyền 403, `A00` 403, ĐVCS khác 404, cột Chỉ đọc 403, nhiều dòng một lần | Agent A | Xong (A `ac16777`); `po-allocation-write.spec` 10/10; mã lỗi `FACTORY_OF_OTHER_BRANCH` |
| 5.10.5 | Frontend Phân bổ PO (skill `frontend-design`): cột "Nhập tay", tích chọn dòng, nút "Đổi nhà máy SX" mở popup chọn nhà máy (gom theo ĐVCS), "Theo OSM" để bỏ nhập tay; nút ẩn ở `A00` và khi thiếu quyền, nút khóa nói lý do; danh sách nhà máy trả qua `/order/po-allocations/options`. Test frontend | Agent A | Xong (A `8826dc4`, `08623db`); `po-allocation.test.tsx` 10/10 |
| 5.10.6 | Migration `MES_Hr/0002_department_production_workshop.sql`: `Department.IsProductionWorkshop BIT NOT NULL DEFAULT 0`, `CHECK (IsProductionWorkshop = 0 OR BranchCode IS NOT NULL)`, chỉ mục có lọc `(BranchCode, Code) WHERE IsProductionWorkshop = 1`. `hr.types.ts`, DTO, `DepartmentService`: luật quyền khi tích, bỏ tích, đổi ĐVCS (điểm tự chọn), tăng phiên bản quyền và xóa cache chuyền khi tập chuyền đổi, nhật ký. Test `hr.spec.ts` | Agent B1 | Xong (B1 `0feb64e`); `hr.spec` 16/16, thêm bài chặn tự đổi phạm vi ở tích hợp |
| 5.10.7 | Nguồn chuyền: `HrModule` đăng ký `LineSource` thật; `OrgService.lines` = bộ phận được tích của ĐVCS phiên (`A00`: mọi ĐVCS), kể cả bộ phận đã giải thể khi `includeInactive` (để hiện tên dữ liệu cũ); `assertLine` đòi đang dùng; lint ranh giới qua | Agent B1 | Xong (nền `f2ec748`, B1 `0feb64e`); `line-source.spec` 4/4 |
| 5.10.8 | Frontend Nhân sự và ô chọn: ô tích "Xưởng sản xuất" ở `DepartmentPanel`, huy hiệu trên cây; `lib/lines.ts` gom theo bộ phận cha; `LinePlanPage` bỏ nhãn `code.split('-').pop()`. Test frontend | Agent B1 | Xong (B1 `0feb64e`); `hr.test.tsx`, `tree-select.test.tsx` qua |
| 5.10.9 | Migration `MES_Core/0009_line_scope_by_code.sql`: chiều `LINE` bỏ `OrgType`; phạm vi `LINE` dạng `LIST` chuyển `OrgUnitId` → `ScopeValue` = mã (không xóa dòng phạm vi: xóa là thành "không giới hạn"; mã cũ không khớp bộ phận nào thì đóng an toàn, người đó không thấy chuyền nào tới khi gán lại); `ORG_SUBTREE` (cả xưởng) trải thành danh sách chuyền đang dùng của xưởng; kiểm `UQ_SysUserRoleScope`; tăng phiên bản quyền; nút `WORKSHOP`, `LINE` đặt `IsActive = 0` (không xóa). Chạy được trên database có dữ liệu | Agent B2 | Xong (B2 `f42566c`); kiểm trên dữ liệu phạm vi cũ, `phase5-line-scope-migration.spec` 1/1 |
| 5.10.10 | `PermissionService.grantOf` lọc chiều `LINE` theo mã đang dùng (qua `OrgService`); `/admin/scope-catalog` trả chuyền từ nguồn mới; `setAssignmentScope` kiểm giá trị `LINE`; `UserAccessDrawer` gửi `value`. Test `phase5.spec.ts`: Trưởng chuyền chỉ thấy chuyền mình ở Phân bổ màu cỡ, Chuẩn bị SX; chuyền bị bỏ tích thì mất; mã không phải chuyền bị từ chối | Agent B2 | Xong (B2 `f42566c`); `phase5.spec` 41/41, `user-access-scope.test.tsx` 6/6 |
| 5.10.11 | Bỏ danh mục cũ: API `lines`, `workshops` ở `catalog.controller.ts`, hàm ở `catalog.service.ts`, DTO; `LinesPane`, khung mặc định của Danh mục hệ thống; `FactoriesPane` lấy danh sách ĐVCS từ nguồn khác; xóa, sửa test cũ (`catalog.spec.ts`, `catalog-lines.test.tsx`) | Agent B3 | Xong (B3 `2f7d59e`) |
| 5.10.12 | Dữ liệu mẫu, script (chỉ dữ liệu mẫu của máy demo, không phải chép chuyền cũ): `hrDepartments` mẫu có bộ phận chuyền mã `A01-L01…` được tích, có ĐVCS, để đơn hàng mẫu, dàn chuyền mô phỏng có chuyền; seed bỏ tạo `WORKSHOP`/`LINE`, phạm vi mẫu Trưởng chuyền ghi theo mã; `reset-demo.ts`; `script-db.readLines` (dùng ở `simulate-board.ts`, `load-bravo-orders.ts`) đọc `MES_Hr`; `softkeys.json` đổi đích hai cột `LineCode` sang `MES_Hr.Department.Code` | Agent B3 | Xong (B3 `2f7d59e`, phạm vi mẫu theo mã ở tích hợp) |
| 5.10.13 | ~~Script chép chuyền cũ thành bộ phận~~: bỏ theo Q4. Thay bằng: chỗ hiện tên chuyền (Phân bổ màu cỡ, Chuẩn bị SX, Xếp chuyền) không tìm thấy bộ phận thì hiện mã kèm "(chuyền cũ)", không lỗi; bài test cho dòng mồ côi | Agent B3 | Xong (B3 `2f7d59e`; `lineNamer` gom về `OrgService` ở tích hợp) |
| 5.10.14 | Tích hợp: gộp nhánh theo thứ tự B1 → B2 → B3 → A vào `phase-5-10`, giải xung đột; bỏ bản giả `LineSource` mặc định; một bộ database test mới, migrate, seed mẫu; `npm run lint && npm test && npm run build`; mở thử trên trình duyệt (màn rộng, điện thoại) | Phiên chính | Xong `0fe1600`: gộp 4 nhánh (xung đột `catalog-lines.test.tsx`: giữ xóa); lint, build qua; bộ `MES_*_T510I`: backend 310 qua, 2 bỏ qua, 2 hỏng (cần dữ liệu BRAVO đã chép, bộ test mới không có); frontend 166/166. Chưa mở thử trên trình duyệt |
| 5.10.15 | Review: hai agent `code-reviewer` chạy song song (luồng A; luồng B1–B3, có lượt riêng về phân quyền); phiên chính kiểm chứng, sửa, lượt kiểm bản sửa; báo cáo `docs/review/phase-5-10.md` | Phiên chính + 2 agent | Lượt 1: A và B đều APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH; 2 + 2 MEDIUM) → sửa `54e4c3d`, `c520ee2` (agent A), `08b3df4` (agent B1), `d00f122`; bộ `MES_*_T510J`: backend 328 qua, 2 bỏ qua, 2 hỏng (cần dữ liệu BRAVO); frontend 173/173; lint, build qua. Lượt 2 (kiểm bản sửa): APPROVE WITH SUGGESTIONS, 5 LOW → sửa `eca2b89` (N1, N5), `6a6121c` (N2, N4), N3 ghi tài liệu. Kiểm cuối bộ `MES_*_T510K`: backend 330 qua, 2 bỏ qua, 2 hỏng (cần dữ liệu BRAVO); frontend 174/174; lint, build qua |
| 5.10.16 | Tài liệu (chỉ phiên chính viết): `06`, `08`, `05`, `04`, `07`, `03` (migration, khóa ngầm), `09`, `12`, `13` (hai mục mới, bảng tra), `02` (trạng thái, việc máy chủ, đóng Q14, Q15, Q18); xóa bộ database test, dọn worktree | Phiên chính | Xong: agent tài liệu (một người viết) sửa `01`, `03`, `04`, `05`, `06`, `07`, `08`, `09`, `10`, `11`, `12`, `13` (mục 6.7, 7.9 hết "đang làm"); phiên chính sửa `02`. Worktree đã dọn; database test `MES_*_T510*` (70) người dùng giữ lại, tự xử lý sau |

### Phần nền đã làm ở 5.10.0 (để bốn luồng chạy độc lập)

- Commit phần đang dở lên nhánh `phase-5-10` (`17cca79`); hợp đồng `LineSource` (`394caa1`).
- Lấy từ 5.10.6, 5.10.7, 5.10.12 về làm trước: migration `MES_Hr/0002_department_production_workshop.sql` (cột `IsProductionWorkshop`, `CHECK` có ĐVCS, chỉ mục có lọc), `hr.types.ts`; `HrLineSource` (`backend/src/modules/hr/hr-line-source.ts`) đăng ký vào `OrgService` lúc khởi động; `OrgService` bỏ nguồn `SysOrgUnit`, không có nguồn thì không có chuyền (đóng an toàn), thêm `activeLineCodes()`; dữ liệu mẫu `hrDepartments` có NM3, xưởng mẫu `A01-X01…` (loại `PHONG`), chuyền mẫu `A01-L01…` (loại `BO_PHAN`, tích "Xưởng sản xuất"), `seedHr` ghi cờ.
- Đổi sở hữu so với bảng dưới: B1 không viết lại migration, nguồn chuyền (chỉ kiểm, bổ sung); `seed.ts` chia hai vùng: B2 sửa phần ghi phạm vi mẫu (theo mã chuyền), B3 sửa phần tạo nút Xưởng, Chuyền ở `SysOrgUnit`.
- Database test của agent không xóa trong lúc làm; phiên chính xóa mọi bộ `MES_*_T510*` ở 5.10.16.

### Số migration đặt trước

| Database | File | Luồng |
|---|---|---|
| `MES_Order` | `0009_po_allocation.sql` | A |
| `MES_Core` | `0009_line_scope_by_code.sql` | B2 |
| `MES_Core` | `0010_grant_poallocation_update.sql` | A |
| `MES_Hr` | `0002_department_production_workshop.sql` | B1 |

## Chia việc cho agent, git worktree

Bốn agent viết code chạy song song sau 5.10.0, mỗi agent một worktree tách từ nhánh nền `phase-5-10`. Phiên chính giữ phần tuần tự: chuẩn bị, tích hợp, review, tài liệu.

```
5.10.0 (phiên chính) ──┬── Agent A  : 5.10.1 → 5.10.5   (Phân bổ PO)            ─┐
                       ├── Agent B1 : 5.10.6 → 5.10.8   (bộ phận, nguồn chuyền)   │
                       ├── Agent B2 : 5.10.9 → 5.10.10  (phạm vi chuyền)          ├── 5.10.14 → 5.10.15 → 5.10.16
                       └── Agent B3 : 5.10.11 → 5.10.13 (dọn cũ, seed, mồ côi)    ┘   (phiên chính, 2 code-reviewer)
```

| Agent | Worktree, nhánh | File sở hữu (chỉ agent này sửa) | Bộ database test | Ước lượng |
|---|---|---|---|---|
| A | `../MES-wt-510a`, `p510-a-po-allocation` | `backend/src/platform/data/base.repository.ts` (chỉ thêm tùy chọn cho luật ĐVCS theo nhà máy, không đổi hành vi cũ), `backend/src/modules/order/po-allocation*`, `order.controller.ts`, `order.dto.ts`, `order.repositories.ts`, `order.types.ts`, `backend/src/platform/sync/osm-po-source.ts`, `platform/feed/source-feed.service.ts`, `platform/sync/sync.service.ts` (chỉ phần gọi lại sau đồng bộ), `migrations/MES_Order/0009`, `MES_Core/0010`, `seed-data.ts` (chỉ dòng `order.poallocation` và `resourceFields` của nó), `frontend/src/features/order/PoAllocationPage.tsx`, `features/order/api.ts`, test `po-allocation*` | `MES_*_T510A` | 2 ngày |
| B1 | `../MES-wt-510b1`, `p510-b1-hr-line-source` | `backend/src/modules/hr/*`, `backend/src/platform/org/*` (trừ interface đã chốt), `migrations/MES_Hr/0002`, `frontend/src/features/hr/*`, `frontend/src/lib/lines.ts`, `lib/types.ts` (`LineInfo`), `features/order/LinePlanPage.tsx`, `features/sewing/PrepPlanPage.tsx` (nếu cần), test `hr*`, `tree-select*` | `MES_*_T510B1` | 1,5 ngày |
| B2 | `../MES-wt-510b2`, `p510-b2-line-scope` | `backend/src/platform/permission/permission.service.ts`, `platform/admin/admin-grants.service.ts`, `admin-users.service.ts` (phần phạm vi), `migrations/MES_Core/0009`, `frontend/src/features/admin/UserAccessDrawer.tsx`, test `phase5*` | `MES_*_T510B2` | 1,5 ngày |
| B3 | `../MES-wt-510b3`, `p510-b3-drop-old-lines` | `backend/src/platform/catalog/catalog.*`, `backend/scripts/seed.ts`, `seed-data.ts` (phần chuyền, `hrDepartments`, phạm vi mẫu), `reset-demo.ts`, `script-db.ts`, `hr-data.ts`, `color-size.service.ts`, `line-plan.service.ts`, `sewing/prep*.service.ts` (chỉ phần tên chuyền mồ côi), `migrations/softkeys.json`, `frontend/src/features/admin/CatalogsPage.tsx`, `features/admin/AuditPage.tsx`, test `catalog*`, `seed*`, `simulate-board*`, `sewing*` | `MES_*_T510B3` | 1,25 ngày |

Luật chung cho agent (đưa vào lời gọi mỗi agent):
- Chỉ sửa file trong cột "File sở hữu". Cần sửa file của luồng khác thì ghi vào báo cáo, phiên chính làm khi tích hợp.
- Không sửa `docs/` (thư mục này nằm trong `.gitignore` nên không có trong worktree; đọc tài liệu ở cây chính theo đường dẫn tuyệt đối). Cuối việc trả về đoạn ghi chú "tài liệu cần sửa" để phiên chính viết.
- Commit trên nhánh của worktree (người dùng đã cho phép ở 5.10.0), không gộp vào `main`, không push.
- Test backend chỉ chạy trên bộ database test riêng của agent (ghi đè `DB_*_NAME` bằng biến môi trường), `--runInBand`, xong xóa đúng bộ đó. Không chạy migration, seed lên database dùng chung.
- `backend/.env` không có trong worktree: phiên chính chép file vào mỗi worktree trước khi giao việc (không in nội dung). `node_modules`: `npm ci` trong worktree.
- Xong việc khi `npm run lint`, test của luồng, `npm run build` qua trên worktree; báo cáo danh sách file đổi, migration, điểm chưa chắc.

## Phạm vi review

- Luồng A: `backend/src/modules/order/po-allocation*`, `order.controller.ts`, `order.dto.ts`, `order.repositories.ts`, `backend/src/platform/sync/osm-po-source.ts`, `platform/feed/source-feed.service.ts`, `platform/sync/sync.service.ts`, `migrations/MES_Order/0009_*`, `MES_Core/0010_*`, `seed-data.ts`, `softkeys.json`, `frontend/src/features/order/PoAllocationPage.tsx`, `api.ts`, test liên quan.
- Luồng B (lượt riêng về phân quyền): `backend/src/modules/hr/*`, `backend/src/platform/org/*`, `platform/permission/permission.service.ts`, `platform/admin/admin-grants.service.ts`, `admin-users.service.ts`, `platform/catalog/*`, `migrations/MES_Hr/0002_*`, `MES_Core/0009_*`, `softkeys.json`, `backend/scripts/seed*.ts`, `reset-demo.ts`, `script-db.ts`, `hr-data.ts`, script mới, `frontend/src/features/hr/*`, `features/admin/UserAccessDrawer.tsx`, `CatalogsPage.tsx`, `lib/lines.ts`, test liên quan.

## Không làm

- Lan Nhà máy SX nhập tay ở Phân bổ PO sang `SalesOrder.ProductionFactoryCode` (nếu Q1 chốt "không lan").
- Xóa bảng `SysOrgUnit` (nút `FACTORY` còn dùng cho phạm vi ĐVCS) hay xóa vật lý nút Xưởng, Chuyền cũ.
- Phạm vi theo phòng ban cho dữ liệu nhân sự (mục 10.4, câu hỏi Q11 ở `02`).
- Lịch tự đồng bộ OSM; sửa chốt "xóa quá 20%" cho các nguồn FULL ở `sync-gen.ts` (chỉ thêm chốt ở bước làm mới Phân bổ PO).
- Chạy migration, script chuyển chuyền lên database máy chủ: ghi vào việc chờ ở `02`, chạy khi người dùng cho phép.

## Rủi ro

- **Worktree thiếu code chưa commit:** worktree tách từ commit, không mang thay đổi đang dở trong cây chính. Không làm 5.10.0 bước (1) thì luồng A sửa trên bản cũ của `po-allocation.service.ts`, `order.controller.ts`, gộp lại sẽ mất việc của 5.9.14.
- **Khóa dòng OSM chưa chắc duy nhất:** một khóa có nhiều `FtyName` (OSM chia một PO, màu cho nhiều nhà máy) thì phải thêm cột vào khóa hoặc gộp; chốt bằng số đếm ở 5.10.0 trước khi agent A viết migration.
- **Phân quyền Trưởng chuyền:** chuyển phạm vi sai thì Trưởng chuyền thấy hết hoặc không thấy gì. Migration `MES_Core/0009` phải có test trên database có phạm vi mẫu (`truongchuyen.a`, `truongchuyen.b`) và cả trường hợp "cả xưởng".
- **Quyền đổi phạm vi chuyển sang tay Nhân sự:** tích, bỏ tích bộ phận đổi phạm vi dữ liệu; nếu không đòi `admin.permission:update` thì vai trò Nhân sự gián tiếp đổi được dữ liệu Trưởng chuyền thấy.
- **Xung đột khi gộp:** `seed-data.ts` (A và B3 sửa vùng khác nhau), `softkeys.json` (A và B3), `sync.service.ts`. Gộp theo thứ tự cố định, phiên chính giải.
- **Hệ quả của Q4 (bỏ chuyền cũ) trên máy chủ:** dòng dàn chuyền, chuẩn bị SX đang gắn mã chuyền cũ `A01-L01…` thành mồ côi: còn mã, mất tên; không hiện trên bảng dàn chuyền (bảng liệt kê theo chuyền đang có); `check:softkeys` sẽ báo các dòng này. Trưởng chuyền đang được giao chuyền cũ không thấy chuyền nào tới khi quản trị gán lại theo bộ phận mới. Nhân sự tạo bộ phận trùng mã chuyền cũ thì dữ liệu và phạm vi cũ tự khớp lại: cần báo người dùng trước khi tạo.
- **Dữ liệu dùng thật:** nếu máy chủ đã có kế hoạch thật gắn chuyền mẫu, cần quyết lại Q4 trước khi deploy; phiên chính đếm (chỉ đọc) số dòng `ShipmentPlanLine`, `SewingPrep` có `LineCode` ở 5.10.0.
- **Tải máy chủ SQL:** bốn bộ database test cùng lúc trên một SQL Server; `seed.spec` đã chậm (120 giây mỗi bài). Có thể phải chạy test lần lượt giữa các agent.

## Phát sinh

Việc để bước tích hợp 5.10.14 (phiên chính):
- B3 (`2f7d59e`): `PrepPlanPage.tsx` dùng `row.lineName` do API Chuẩn bị SX trả (dòng mồ côi hiện "(chuyền cũ)"); `LinePlanPage.tsx` ô chọn của dòng mồ côi chỉ hiện mã; gom `lineNamer` (đang có ở `modules/order/line-plan.service.ts` và `modules/sewing`) về `OrgService`; sửa comment "Danh mục hệ thống › Chuyền may" ở `frontend/src/lib/lines.ts`, `lib/types.ts`; xóa CSS chết `.tree-*` ở `theme/global.css` (khoảng dòng 2148–2197).
- B3: `GET /admin/catalogs` thêm `branches` (nguồn ĐVCS cho ngăn Nhà máy SX, cùng quyền xem Danh mục); link cũ `?c=LINE` hiện ghi chú chỉ sang Sơ đồ tổ chức.
- B3: seed mới không gán `LINE_LEADER` cho `truongchuyen.a/b` cho tới khi gộp B2 (vùng phạm vi mẫu ở `seed.ts` còn tra nút chuyền); kiểm lại sau khi gộp B2.
- Máy chủ (`NODE_ENV=production` trong `.env`): `sim:board`, `reset:demo` bị `assertDemoMachine` chặn, đúng thiết kế.
- B1 (`0feb64e`): **chặn tự nâng phạm vi** (CLAUDE.md 4.8): người có phép gán phạm vi `LINE` chứa mã X không được tích, bỏ tích, đổi ĐVCS, giải thể, khôi phục bộ phận X (như `assertCanMove` cũ chặn người được giao xưởng). Cần hàm ở `PermissionService` (sau khi gộp B2) gọi từ `DepartmentService`.
- B1: `frontend/src/features/order/LineBoard.tsx:57` còn nhãn `line.code.split('-').pop()?.replace(/^L/, '')`: bỏ, chỉ hiện tên chuyền.
- B1: lỗi 403 khi thiếu `admin.permission:update` dùng lại mã `SELF_ELEVATION_FORBIDDEN` (qua `assertAdminCeiling`, như danh mục cũ); cân nhắc giữ hay mã riêng khi review.
- A (`015de57`…`08623db`): mỗi lần làm mới cập nhật `SyncedAt` mọi dòng (khóa leo thang cả bảng, màn đọc chờ vài giây): cân nhắc chỉ cập nhật dòng đổi và lưu mốc chép ở chỗ khác. Lần làm mới đầu trên máy chủ gửi khoảng 25.000 dòng trong một tham số JSON (khoảng 7 MB), chưa đo thời gian thật.
- A: độ dài cột theo số ký tự thật của bảng chép (`PO` 51, `StyleNo` 61, `Color` 82, `FtyName` 255; các số 102/122/164/510 trong kế hoạch là byte). Không khai khóa ngầm `PoAllocation.ProductionFactoryCode` (tên OSM của `v_OSMData` không tự vào danh mục). Biến mới `PO_ALLOCATION_REFRESH`, mã lỗi mới `FACTORY_OF_OTHER_BRANCH`, tùy chọn `BaseRepository` mới `factoryBranchWrite`, `orderBy`, `listAll({ maxRows })`.
- A, B1, B3: chưa mở thử giao diện trên trình duyệt (đăng nhập cần mật khẩu demo, không đưa vào công cụ theo CLAUDE.md mục 7): người dùng kiểm trên app sau tích hợp.
- Tài liệu luồng A (5.10.16) xong ở `06`, `13`, `04`, `03`, `09`, `11`, `12`. Còn cho lượt tài liệu B: `01-tong-quan.md` (dòng "Phân bổ PO chỉ xem"), `03`/`06` khóa ngầm `LineCode`, mục 8.6 của `06`, `12` còn `catalog-lines.test.tsx`; thông tin cờ `setup-env` và mô tả file test đang nằm hai chỗ (`11`/`12`, `06`/`12`).
- Code, mức thấp, chưa sửa: nhà máy đã ngừng dùng của chính ĐVCS bị báo `FACTORY_OF_OTHER_BRANCH` ("ĐVCS khác", dễ hiểu sai); cột ĐVCS của Phân bổ PO tra nguyên `FtyName` nên trống khi là danh sách nhiều nhà máy (dữ liệu thật hiện không có, `FtyName` dài nhất 11 ký tự) trong khi luật ghi tách theo dấu phẩy; mô tả nguồn `OSM.OSMData` trong `MES_Sync/0007` (`SyncSource`) còn ghi "Phân bổ PO đọc bảng chép này" (cần migration mới nếu sửa).
- B1: cache chuyền 30 giây theo tiến trình; chạy nhiều tiến trình backend thì tiến trình khác có thể tính quyền theo danh sách chuyền cũ tới lần tăng phiên bản sau (hiện chạy một tiến trình). Ghi vào tài liệu.
