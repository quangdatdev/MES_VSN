# Review Phase 5.9 – 11/10/2026

Phạm vi: 63 file sửa, 5 file mới (backend `platform/data`, `platform/admin`, `platform/catalog`, `platform/permission`, `platform/sync`, `platform/me`, `modules/order`, migration `MES_Core/0007`, `MES_Order/0005`, `softkeys.json`, `scripts/*`; frontend đăng nhập, quản trị, đơn hàng, chữ toàn giao diện). ADR 0013.

## Lượt 1
Kết luận agent: **BLOCK** (0 CRITICAL, 1 HIGH, 2 MEDIUM, 9 LOW). Phiên chính đọc lại code, xác nhận cả 12 phát hiện đúng.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| H1 | HIGH | `sales-order.service.ts`, `base.repository.ts` | Đơn hàng, PO dùng chung (`SHARED`). Người có quyền ghi ở một ĐVCS sửa, xóa được đơn, PO của mọi ĐVCS: đổi Nhà máy SX của đơn ĐVCS khác sang nhà máy mình được tích là lập được kế hoạch, lách bộ lọc. Cũng sửa được SL gốc (màu cỡ PO) mà ĐVCS khác dựa vào | Bảng `originBranch`: đọc vẫn dùng chung, nhưng tạo, sửa, xóa chỉ dòng của ĐVCS đang làm việc (`limit()` lọc `BranchCode` khi hành động ghi), dòng ĐVCS khác 404. `ChildRepository` ghi dòng con chỉ khi cha ghi được. Như cách ghi trước Phase 5.9. Test mới ở `phase5.spec.ts` | Đóng |
| M1 | MEDIUM | `scripts/load-bravo-orders.ts` | Đơn nạp từ BRAVO không có Nhà máy SX nên popup Chọn mã hàng luôn rỗng | Giả định tạm (ADR 0013, `db-order.md`): đơn may ở nhà máy SX cùng mã với chi nhánh nhận đơn nếu nhà máy đó đang dùng; báo số đơn chưa có nhà máy | Đóng |
| M2 | MEDIUM | `order.repositories.ts` (`styles()`), migration `0005` | PO thêm từ ĐVCS khác mang ĐVCS của phiên, nên màn Tỷ lệ cắt hiện hai dòng cùng một đơn | PO chỉ thêm ở ĐVCS của đơn (`GetOptions.sameBranch`). Migration `0005` giữ khóa ngoại ghép PO–đơn hàng | Đóng |
| L1 | LOW | `admin.dto.ts` | `productionFactoryIds: null` xóa sạch nhà máy đã tích | `@Optional()`: null bị 422, không gửi thì giữ nguyên | Đóng |
| L2 | LOW | `catalog.dto.ts`, `admin.dto.ts` | Regex `^A\d{2}$` từ chối mã ĐVCS khác dạng của BRAVO | Dùng `^[A-Z0-9]{1,10}$` như cột `SysBranch.Code` | Đóng |
| L3 | LOW | `branch-import.ts` | ĐVCS chép về không có nút gốc trong cây tổ chức: chưa giới hạn vai trò theo ĐVCS đó được; nút cũ giữ tên "Nhà máy 1" | Khi chép thì tạo hoặc đổi tên nút `SysOrgUnit` loại `FACTORY`; làm mới cache cây | Đóng |
| L4 | LOW | `seed.ts` | Máy dùng thật cài mới: admin chỉ có A00; ĐVCS chép sau không tự gán, admin không tự gán cho mình được | Ghi vào ADR 0013 và phase: cần admin thứ hai hoặc quản trị CSDL gán. Máy chủ hiện tại admin đã có ĐVCS | Hoãn (tài liệu) |
| L5 | LOW | `branch-import.ts` | Bấm Cập nhật từ BRAVO đúng lúc việc tự chạy sau đồng bộ đang chạy: trùng khóa, lỗi 500 | `sp_getapplock` trong transaction | Đóng |
| L6 | LOW | `LoginPage.tsx` | Mật khẩu nằm lại trong form lúc chọn ĐVCS (máy dùng chung) | Xóa mật khẩu sau khi đăng nhập đúng, ô hiện dấu che; có test | Đóng |
| L7 | LOW | `CatalogsPage.tsx` | Khung Nhà máy SX không báo lỗi tải danh sách ĐVCS; màn ĐVCS chậm cập nhật cột Nhà máy SX | Báo lỗi, trạng thái tải trong popup; lưu xong làm mới màn ĐVCS và danh sách ở màn Người dùng | Đóng |
| L8 | LOW | `UsersPage.tsx` | Người có quyền phân quyền nhưng thiếu quyền xem Danh mục hệ thống không tích được nhà máy SX | API `GET /admin/users/production-factories` theo quyền `admin.user:view` | Đóng |
| L9 | LOW | test | Thiếu test cho H1, chép ĐVCS, chặn đổi tên ĐVCS theo BRAVO | Thêm test ở `phase5.spec.ts`, `catalog.spec.ts`. Allow ở A00 trên tài nguyên dùng chung thấy toàn bộ đơn hàng: ghi ở ADR 0013 | Đóng |

Sau khi sửa:
- frontend: tsc, eslint qua; vitest 144/144; build qua;
- backend: tsc, eslint, build qua.

Test backend chờ chạy migration trên database máy chủ.

## Lượt 2
Kết luận agent: **APPROVE WITH SUGGESTIONS** (0 CRITICAL, 0 HIGH, 1 MEDIUM, 6 LOW). Xác nhận đóng H1, M1, M2, L1–L3, L5–L9; L4 hoãn (tài liệu) được chấp nhận.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| 2.1 | MEDIUM | `SalesOrderPage.tsx`, `CutRatioPage.tsx` | Giao diện chưa phản chiếu quy tắc ghi mới: nút Sửa, Xóa, nháy đúp, Thêm PO, Xác nhận vẫn mở với đơn, PO của ĐVCS khác; lưu xong mới nhận 404. Màn Tỷ lệ cắt ẩn cột Chi nhánh FOB | Hook `useOriginLock`: các nút ghi khóa kèm lý do "… của <ĐVCS>: chỉ sửa, xóa khi đang làm việc ở đơn vị cơ sở đó"; nháy đúp không mở popup sửa; luôn hiện Chi nhánh FOB ở màn Tỷ lệ cắt. Giữ 404 ở máy chủ cho thống nhất với các tài nguyên khác | Đóng |
| 2.2 | LOW | ADR 0013, `db-order.md` | Ghi sai "0005 đổi cả khóa ngoại PO → đơn hàng" | Sửa thành hai chỗ; ghi rõ chi tiết L4 | Đóng |
| 2.3 | LOW | ADR 0013, file phase | Hệ quả H1 (chỉ ĐVCS nhận đơn chọn được Nhà máy SX) chưa nêu để người dùng chốt | Thêm vào "Hệ quả", "Tự chọn", "Phát sinh"; hỏi người dùng | Đóng (chờ người dùng chốt) |
| 2.4 | LOW | migration `0005` | Thiếu chỉ mục cho phạm vi "chỉ của mình" sau khi bỏ lọc ĐVCS | Thêm `IX_SalesOrder_CreatedBy`, `IX_SalesOrderPo_CreatedBy` (0005 chưa chạy) | Đóng |
| 2.5 | LOW | vận hành | Chạy migrate kèm tên database thì seed không chạy, đơn hàng chưa dùng chung; backend cũ đọc danh mục đã ngừng | Ghi trình tự triển khai vào ADR và 5.9.9 | Đóng |
| 2.6 | LOW | `admin.dto.ts`, `admin-branches.service.ts` | Tạo ĐVCS bằng tay vẫn regex `A\d{2}`, không tạo nút cây tổ chức | Regex như mã ĐVCS; tạo nút `FACTORY` trong cùng transaction | Đóng |
| 2.7 | LOW | `phase5.spec.ts` | Thiếu sửa SL kế hoạch lập cho đơn ĐVCS khác; thiếu xóa, xác nhận PO ĐVCS khác | Thêm vào hai bài test | Đóng |

Sau khi sửa:
- backend: tsc, eslint qua;
- frontend: tsc, eslint, vitest qua (xem 5.9.9 cho test backend trên database máy chủ).

## Lượt 3 – task 5.9.10 nạp tăng dần đơn hàng BRAVO (12/10/2026)
Phạm vi: 17 file (`platform/sync/bravo-order-source.ts`, `sync.service.ts`, `sync.repository.ts`, `platform/bravo/*`, `modules/order/bravo-order.mapping.ts`, `bravo-order-import.repository.ts`, `bravo-order-import.service.ts`, `order.module.ts`, `branch.service.ts`, `scripts/load-bravo-orders.ts`, `eslint.config.mjs`, test). Kết luận agent: **BLOCK** (0 CRITICAL, 1 HIGH, 3 MEDIUM, 9 LOW). Phiên chính kiểm chứng: H1 đúng (đọc thủ tục PARTITION ở `MES_Sync/0004`: xóa và chèn lại cả nhóm trong khoảng lùi với `SyncedAt` mới); L9 đúng (thử trên máy chủ: `CAST(N'ươăđốéàĐ' AS VARCHAR)` ra `uoad?éàÐ`); các phát hiện còn lại đúng theo code.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| H1 | HIGH | `bravo-order.mapping.ts` | Biết "BRAVO đổi đơn" theo `SyncedAt`, mà nguồn PO, màu cỡ (PARTITION) chép lại cả nhóm với mốc mới dù không đổi: phần người dùng sửa bị ghi đè | Dấu nội dung `SalesOrder.SourceHash` (migration `MES_Order/0006`): SHA-256 các cột lấy từ BRAVO và cờ đóng lệnh. Dấu khác mới ghi đè; giống thì không ghi; chưa có dấu thì đơn chưa ai sửa ghi lại theo BRAVO, đã sửa chỉ lấy mốc. PO chỉ cập nhật khi ngày xuất, nơi giao khác. Test thuần và test DB "chép lại với mốc mới, nội dung không đổi" | Đóng |
| M1 | MEDIUM | `bravo-order-import.repository.ts` | Câu ghi gán lại trạng thái đọc lúc so | Truyền cờ đóng lệnh, tính `CASE WHEN Closed = 1 AND StatusCode = 'NEW' THEN 'DONE' ELSE StatusCode END` trong câu ghi; test DB đơn Hủy giữ trạng thái | Đóng |
| M2 | MEDIUM | service, `sync.spec` | Không tắt được nạp tự động; test đồng bộ kích hoạt nạp thật | Biến `BRAVO_ORDER_IMPORT` (`env.ts`, `.env.example`): để trống thì bật trên máy dùng thật, tắt trên máy demo, máy test | Đóng |
| M3 | MEDIUM | test | Thiếu test kiểm lại lúc ghi, ranh giới lô, H1, đóng lệnh | Thêm bài DB: người dùng sửa đơn, xác nhận PO giữa lúc so và lúc ghi; 130 đơn (qua lô đơn 105, lô PO 125, lô ô 285); đóng lệnh; nguồn chép lại mốc mới. Thêm bài thuần cho H1, lấy mốc, L1, L4 | Đóng |
| L1 | LOW | mapping, repository | PO người dùng lưu lưới màu cỡ rỗng bị coi là chưa sửa | Thêm điều kiện `SalesOrderPo.ModifiedBy` trống (cả khi so và trong câu ghi) | Đóng |
| L2 | LOW | repository | Lập kế hoạch chen giữa có thể chụp màu cỡ cũ | Thay màu cỡ khóa dòng đơn (`UPDLOCK`) trước PO, cùng thứ tự với lập kế hoạch; kết nối riêng `DEADLOCK_PRIORITY LOW`, bị hủy thì thử lại | Đóng |
| L3 | LOW | `db-order.md` | "Hai đường nạp cho cùng kết quả" không đúng hẳn | Sửa tài liệu, liệt kê chỗ khác ở ADR 0013 mục 8 | Đóng |
| L4 | LOW | mapping `poKey` | Bỏ khoảng trắng đầu khác SQL Server, hai PO nhận gộp màu cỡ | Chỉ bỏ khoảng trắng cuối như SQL Server; test thuần | Đóng |
| L5 | LOW | `sync.service.ts` | Nạp lỗi hoặc khởi động lại thì mất việc chờ; triển khai xong không tự nạp | Lỗi thì giữ cờ chờ; nạp một lần lúc khởi động; thử lại khi bị hủy vì khóa chéo; không chạy chồng trong tiến trình | Đóng |
| L6 | LOW | service | Mỗi đợt ghi một dòng `BRAVO_IMPORT` dù không đổi | Chỉ ghi khi có ghi dữ liệu; số PO giữ màu cỡ, đơn đổi chi nhánh ở log máy chủ | Đóng |
| L7 | LOW | `load-bravo-orders.ts` | Lấy khóa sau khi đã xóa Kế hoạch chuẩn bị SX | Lấy khóa trước, xóa phần May trong transaction đã có khóa | Đóng |
| L8 | LOW | `sync.service.ts` | Log lỗi thiếu stack | Ghi stack | Đóng |
| L9 | LOW | mapping `asVarchar` | Giả định mọi ký tự ngoài ASCII thành "?" | Bỏ so cột của đơn (đã dùng dấu nội dung); chỉ còn khóa ghép số PO (nguồn vốn VARCHAR, chỉ chữ giữ chỗ "(trống)" mất dấu), ghi rõ giới hạn | Đóng |

Sau khi sửa:
- backend: tsc, eslint qua; test thuần 18/18; test DB liên quan 69 qua, 2 bỏ qua (bộ `MES_*_Test`);
- chạy thử không ghi trên dữ liệu máy chủ: lần đầu ghi lại 5.291 đơn kèm dấu (không đơn nào bị coi là BRAVO đổi), so lại sau đó không còn gì.

## Lượt 4 – kiểm bản sửa lượt 3 (12/10/2026)
Kết luận agent: **APPROVE WITH SUGGESTIONS** (0 CRITICAL, 0 HIGH, 3 MEDIUM, 8 LOW). Xác nhận đóng H1, M1, M2, L1, L3, L6–L9; M3, L4, L5 đóng phần lớn; L2 chưa đóng thực chất. Phiên chính kiểm chứng M4.1 trên database (`SET DEADLOCK_PRIORITY LOW` đứng riêng thì câu sau quay về 0, cùng câu thì -5) và M4.2 (Kysely rollback sau 1205 ném 3903 che lỗi gốc, dự án đã có `inTransaction` cho việc này).

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| M4.1 | MEDIUM | repository | `SET DEADLOCK_PRIORITY LOW` đứng riêng hết tác dụng sau câu (mỗi câu qua `sp_executesql`) | Hàm `low()` gắn `SET DEADLOCK_PRIORITY LOW;` vào đầu từng câu ghi, câu khóa. Test DB tạo khóa chéo thật (người dùng giữ khóa đơn rồi xin khóa ứng dụng): bước nạp bị hủy, người dùng chạy tiếp | Đóng |
| M4.2 | MEDIUM | repository, service | Lỗi rollback 3903 che 1205: không thử lại | `inTransaction`; test DB kiểm `isDeadlock` của lỗi nhận được; test service thử lại sau 2 giây | Đóng |
| M4.3 | MEDIUM | mapping | Dấu nội dung tính trên giá trị đã ánh xạ: đổi tên đơn vị tính ở MES làm ghi đè hàng loạt | Băm dữ liệu BRAVO chưa ánh xạ (mã đơn vị tính, khách hàng, mã hàng… ngày xuất sớm nhất), tiền tố phiên bản `v1`; test thuần đổi `unitNames` không ghi gì | Đóng |
| L4.1 | LOW | mapping `poKey` | `/\s+$/` bỏ cả tab, xuống dòng cuối | `/ +$/` như SQL Server; test thuần CR LF cuối | Đóng |
| L4.2 | LOW | repository | Chèn PO trước khi khóa đơn | Khóa mọi đơn sẽ chạm tới (Id tăng dần) ở đầu phần ghi, trước khi thêm, sửa PO | Đóng |
| L4.3 | LOW | service | Lỗi của lần chạy lại theo `again` không về bên gọi | Hàng đợi `running`/`queued`: gọi lúc đang nạp nhận promise của lần xếp sau; test service | Đóng |
| L4.4 | LOW | mapping | PO người dùng tự thêm bị BRAVO ghi đè ngày xuất, nơi giao | Bỏ qua cập nhật PO có `CreatedBy`; test thuần; ghi ADR | Đóng |
| L4.5 | LOW | repository | Đơn chỉ lấy mốc không đổi Mới → Hoàn thành | Câu ghi dấu có `CASE` theo cờ đóng lệnh; ghi giới hạn vào ADR | Đóng |
| L4.6 | LOW | 0006, ADR 0013 | Tài liệu lệch code | Sửa chú thích 0006 (chỉ chú thích, migrate không so checksum), ADR mục 8, hệ quả, trình tự triển khai | Đóng |
| L4.7 | LOW | `bravo-order-source.ts` | Câu đọc PO, màu cỡ đọc toàn bộ, giới hạn 15 giây | Lọc theo sản phẩm của ĐVCS đang dùng (kể cả sản phẩm gốc gia công); đọc trên kết nối riêng (`createSyncRunner`) | Đóng |
| L4.8 | LOW | service, `.env.example` | Log khởi động thiếu; không biết bật hay tắt; hẹn giờ thử lại khi tắt app | Log trạng thái cờ; lỗi khác `SYNC_NOT_READY` ghi `error` kèm stack; dừng thử lại khi tắt app; thêm bước kiểm cờ vào trình tự triển khai (ADR) | Đóng |
| L4.9 | LOW | test | Test dựa vào `.env` để tắt nạp; thiếu test giữ cờ chờ, khóa chéo; seed không ghi ai được gán | `test/setup-env.ts` (jest `setupFiles`) đặt `BRAVO_ORDER_IMPORT=false`; thêm bài `sync.spec` giữ cờ chờ khi lỗi, bài khóa chéo, bài service; nhật ký `SEED` ghi `newGrants`. Bài seed vẫn kiểm trạng thái DB (máy demo cài theo migrate rồi seed) | Đóng |

Sau khi sửa:
- backend: tsc, eslint, build qua; toàn bộ test trên bộ `MES_*_Test`: 232 qua, 2 bỏ qua (bài cần database trung gian cùng máy), 18 bộ;
- chạy thử không ghi trên dữ liệu máy chủ với cách băm mới: lần đầu ghi lại 5.291 đơn kèm dấu (không đơn nào bị coi là BRAVO đổi), so lại sau đó không còn gì; câu đọc đã lọc vẫn đủ 13.906 PO.

## Lượt 5 – task 5.9.11 Nhà máy SX theo OSM, số PO NVARCHAR (12/10/2026)
Phạm vi: 44 file (migration `MES_Order/0007`, `MES_Core/0008`, `MES_Sync/0005`, `0006`, `softkeys.json`, `sync-gen.ts`, `migrate.ts`, `check-softkeys.ts`, `platform/sync/*`, `platform/feed/*`, `platform/catalog/*`, `base.repository.ts`, `modules/order/*`, `load-bravo-orders.ts`, 5 file frontend, test). Kết luận agent: **APPROVE WITH SUGGESTIONS** (0 CRITICAL, 0 HIGH, 4 MEDIUM, 12 LOW). Một lỗi HIGH (DTO chặn dấu phẩy nên lưu lại danh sách nhà máy bị 422) phiên chính đã sửa trong lúc agent đang review. Phiên chính kiểm chứng các phát hiện bằng đọc code.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| M1 | MEDIUM | mapping, `load-bravo-orders.ts` | Danh sách OSM dài quá 400 ký tự làm lỗi cả lần nạp | `factoryListFor`: dài quá thì thêm đơn với Nhà máy SX trống, báo `factoryTooLong`; dùng chung ở nạp tăng dần, `load:bravo`, cập nhật OSM; test thuần | Đóng |
| M2 | MEDIUM | `applyOsmFactories` | Đơn không có trong OSM giữ nhà máy đoán theo mã chi nhánh của cách nạp cũ, trái ADR | `MES_Order/0007` bỏ giá trị đoán ở đơn nạp từ BRAVO chưa ai sửa (`ModifiedBy` trống, mã = chi nhánh); ghi ADR | Đóng |
| M3 | MEDIUM | `reset-demo.ts`, `load-bravo-orders.ts` | Máy demo: `reset:demo --bravo` tắt nhà máy OSM, đơn không có nhà máy, popup Chọn mã hàng trống | `load:bravo` trên máy chưa có dữ liệu OSM giữ giả định cũ (không khóa); `reset:demo` không tắt nhà máy do OSM thêm | Đóng |
| M4 | MEDIUM | test | Thiếu test tự thêm danh mục, service OSM, thủ tục PARTITION + FULL chạy thật, nhánh `getById` của bộ lọc | Thêm `osm-factory-service.spec.ts`; bài `importOsmFactories` ở `catalog.spec`; bài chép toàn bộ theo nhóm ở `sync.spec`; `candidates/:id/pos` và mã khác hoa thường ở `phase5.spec` | Đóng |
| L1 | LOW | `sales-order.service.ts` | Người dùng chọn nhà máy đúng lúc OSM khóa đơn: ghi giá trị tay | Chấp nhận: cửa sổ rất hẹp, lần cập nhật OSM sau ghi lại giá trị OSM (giá trị khác thì luôn ghi) | Chấp nhận |
| L2 | LOW | `osm-factory.service.ts` | Không thử lại khi khóa chéo | Thử lại sau 2, 10 giây như bước nạp; dừng khi tắt app; test | Đóng |
| L3 | LOW | `bravo-order-source.ts` | `MAX(FtyName)` bỏ bớt khi nhiều dòng; ghép theo `StyleName` hay `StyleName_OSM` | `STRING_AGG` gộp mọi danh sách, bên đọc bỏ trùng. Cột ghép mã hàng: hỏi BA (Phát sinh) | Đóng một phần |
| L4 | LOW | `catalog.service.ts` | Thêm danh mục "hết hoặc không": trùng do collation, chạy chồng làm rollback cả lần | Thêm từng tên bằng `INSERT … WHERE NOT EXISTS`, trùng thì bỏ qua; chạy thêm lúc khởi động | Đóng |
| L5 | LOW | `catalog.dto.ts` | Mã tạo tay không gộp khoảng trắng như danh sách OSM | Transform gộp khoảng trắng; tên OSM quá 100 ký tự ghi log nêu rõ hệ quả | Đóng |
| L6 | LOW | `order.dto.ts` | Độ dài PO# đếm theo code point, đổi chữ hoa sau khi kiểm | Đổi chữ hoa trước, `MaxLength(192)` đếm UTF-16 | Đóng |
| L7 | LOW | `sales-order.service.ts` | Cờ `factoryFromOsm` không theo chính sách cột | Chấp nhận: chỉ lộ việc nhà máy lấy theo OSM, không lộ giá trị | Chấp nhận |
| L8 | LOW | `SalesOrderPage.tsx` | Ô chọn hiện chuỗi thô của danh sách đã mở khóa; lọc theo cột khớp nguyên chuỗi | Ô chọn hiện tên, nhóm "Theo OSM trước đây". Lọc theo từng nhà máy trong danh sách: để sau (Phát sinh) | Đóng một phần |
| L9 | LOW | `sync-gen.ts` | Chép toàn bộ không có chốt xóa hàng loạt | Chấp nhận như mọi nguồn chép toàn bộ (chỉ chặn view trả 0 dòng); mở khóa giữ giá trị, lần sau sửa lại | Chấp nhận |
| L10 | LOW | `MES_Order/0007` | `STRING_SPLIT` cần mức tương thích 130 | Migration kiểm, báo rõ nếu thấp hơn | Đóng |
| L11 | LOW | `migrate.ts` | Máy không có OSM: nguồn OSM đỏ mỗi lần đồng bộ | Migrate tắt nguồn OSM khi thiếu `DB_OSM_NAME`, bật lại khi có | Đóng |
| L12 | LOW | tài liệu | Tên cũ `BravoFeedService`, chỉ mục đã bỏ, khóa ngầm `PROD_FACTORY`, thiếu bước triển khai | Sửa ADR 0013, `db-order.md`; thêm bước gắn ĐVCS, tích nhà máy vào trình tự triển khai | Đóng |

## Lượt 6 – task 5.9.12 màn Phân bổ PO theo OSM (12/10/2026)
Phạm vi: 22 file (migration `MES_Sync/0007`, `scripts/source-databases.ts`, `migrate.ts`, `sync-gen.ts`, `seed-data.ts`, `config/env.ts`, `platform/sync/osm-po-source.ts`, `sync.repository.ts`, `sync.service.ts`, `platform/feed/source-feed.service.ts`, `modules/order/po-allocation.service.ts`, `order.controller.ts`, `order.module.ts`; frontend `PoAllocationPage.tsx`, `api.ts`, `registry.tsx`; test).
Kết luận agent: APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 3 MEDIUM, 9 LOW).

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| M1 | MEDIUM | `po-allocation.service.ts`, `osm-po-source.ts` | Mặc định xếp theo ETD-Revised (cột đã đăng ký) và thứ tự phụ theo mọi cột, kể cả cột bị Ẩn/Che: thứ tự làm lộ giá trị | Chọn cột sắp xếp xem được đầu tiên (ETD-Revised → ETD-Actual → các cột theo view); thứ tự phụ chỉ theo cột xem được, cột Ẩn/Che đứng cuối cho phân trang ổn định; test. `FieldPolicyService.safeSort` không kiểm cột mặc định: không sửa ở nền tảng trong task này (màn khác mặc định theo `createdAt` chưa đăng ký; Kế hoạch chuẩn bị SX cần rà riêng) | Đóng |
| M2 | MEDIUM | `po-allocation.service.ts` | Cột ĐVCS suy ra từ Nhà máy SX nhưng không theo chính sách cột của Nhà máy SX | ĐVCS theo mức chặt hơn của hai cột: Nhà máy SX bị Ẩn thì không có ĐVCS (file xuất bỏ cột), bị Che thì ĐVCS che; không lọc, xếp, hỏi giá trị ĐVCS được. Giao diện bỏ cột hoặc bỏ nút lọc, sắp xếp tương ứng; test backend, frontend | Đóng |
| M3 | MEDIUM | `seed.ts` | Database đã seed: menu lá giữ thứ tự cũ, "Phân bổ PO" đứng sau "Kế hoạch xuất hàng" | Seed cập nhật thứ tự menu lá hệ thống theo `seed-data` (không có màn nào sửa thứ tự menu; seed luôn tăng `SysPermissionVersion`); bài mới ở `seed.spec.ts` | Đóng |
| L1 | LOW | `po-allocation-service.spec.ts` | Mock thiếu tham số, `tsc` báo lỗi (jest tắt kiểm kiểu) | Khai đủ tham số; `tsc -p tsconfig.json` qua | Đóng |
| L2 | LOW | `PoAllocationPage.tsx` | Nguồn đang tắt (chưa khai database) mà màn vẫn bảo đi chạy nguồn | API trả `sourceActive`; nguồn tắt thì nhờ IT cấu hình, phần kỹ thuật ở tooltip; test | Đóng |
| L3 | LOW | `order.dto.ts` | Season tối đa 20 ký tự, cột OSM 50 | DTO riêng `PoAllocationQuery` theo độ dài cột OSM | Đóng |
| L4 | LOW | `osm-po-source.ts` | ĐVCS trống nếu tên nhà máy chỉ có ở `v_OSMData` hoặc `FtyName` là danh sách | Kiểm trên máy chủ (chỉ đọc): 0 tên chưa vào danh mục (`vOSMDataFty` gom từ chính view này), không dòng nào có dấu phẩy. Ghi giới hạn ở ADR 0013 mục 10 | Chấp nhận |
| L5 | LOW | `osm-po-source.ts` | Mỗi trang 3 câu song song, `MAX(SyncedAt)` quét bảng | Đo trên 25.105 dòng: trang ~0,25 giây, popup 0,1–0,25 giây. Tối ưu khi dữ liệu lớn hơn | Chấp nhận |
| L6 | LOW | `osm-po-source.ts` | CASE tốn 2 tham số mỗi nhà máy, không có chốt | Danh mục 30 nhà máy, chỉ vượt 2.100 tham số khi quá ~790 nhà máy có ĐVCS | Chấp nhận |
| L7 | LOW | `migrate.ts` | Bật nguồn trước khi kiểm tên database, linked server | Kiểm tên trước lệnh bật | Đóng |
| L8 | LOW | `features/order/api.ts` | Kiểu `PoAllocation` chưa phản ánh Ẩn/Che | Mọi cột optional, `Masked` | Đóng |
| L9 | LOW | tài liệu | Thiếu 5.9.12 ở phase, ADR, `db-sync.md`, `api-contract.md`, `seed-demo.md`, CLAUDE.md 8.1, ngoại lệ ADR 0011 | Đã cập nhật | Đóng |

Lint, `tsc` backend và frontend qua. Test chạy trên bộ database riêng `MES_*_TPO` (phiên khác đang giữ bộ `MES_*_Test`): backend toàn bộ 256 qua, 2 bỏ qua (lượt đầu 2 bài `catalog.spec` lỗi vì bộ mới chưa chép danh mục chi nhánh, cỡ BRAVO; chép xong qua), sau khi sửa chạy lại 36 bài liên quan qua; frontend 148 qua (23 bộ), build qua.

## Lượt 7 – kiểm bản sửa lượt 6 (12/10/2026)
Kết luận agent: APPROVE WITH SUGGESTIONS. Ba MEDIUM lượt 6 đã đóng đúng; 0 CRITICAL, 0 HIGH, 0 MEDIUM mới; 5 LOW.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| L1 | LOW | `PoAllocationPage.tsx` | ETD-Revised bị Ẩn/Che: URL, chỉ báo sắp xếp vẫn là ETD-Revised trong khi máy chủ xếp theo cột khác | Giao diện chọn mặc định theo cùng thứ tự ưu tiên với máy chủ; test | Đóng |
| L2 | LOW | `PoAllocationPage.tsx` | Link cũ có lọc ĐVCS, người bị Ẩn/Che Nhà máy SX vẫn thấy "Lọc theo cột: Đơn vị cơ sở" | Bỏ ĐVCS khỏi câu nhắc khi Nhà máy SX không xem được | Đóng |
| L3 | LOW | `PoAllocationPage.tsx` | Câu nhắc chính sách cột không nói cột ĐVCS cũng mất/bị che | Câu nhắc tính cả ĐVCS; test | Đóng |
| L4 | LOW | `api-contract.md`, ADR 0013 | Chưa ghi `sourceActive`, quy tắc ĐVCS theo Nhà máy SX | Đã ghi | Đóng |
| L5 | LOW | ADR 0013 | Thiếu bước triển khai 5.9.12 | Thêm bước 6 | Đóng |

Gợi ý thêm bài test có chính sách cột thật trong DB: đã thêm vào `po-allocation.spec.ts` (Che Nhà máy SX cho vai trò Kế hoạch), qua. Sau lượt 7: backend toàn bộ 260 qua, 2 bỏ qua (chạy trước khi thêm bài trên; `po-allocation.spec.ts` 6 bài qua sau khi thêm), frontend 149 qua, lint qua. Lượt chạy frontend song song với test backend có 1 bài lỗi chập chờn (máy bận), chạy lại qua.


## Lượt 8 – task 5.9.13 Chọn mã hàng theo ĐVCS, Tỷ lệ cắt theo kế hoạch của ĐVCS (12/10/2026)
Phạm vi: 31 file (`git diff` và migration mới `MES_Order/0008`). Kết luận agent: **APPROVE WITH SUGGESTIONS** (0 CRITICAL, 0 HIGH, 2 MEDIUM, 10 LOW). Agent kiểm và xác nhận đúng: SQL của `usedBy`/`inUseHere` (tên bảng, cột từ hằng; tham chiếu `[SalesOrderPo].[Id]` trong UPDATE/DELETE và khi lồng trong `ChildRepository`), đơn vị tổng hợp không ghi được, không đường ghi nào mở quyền quá mức (không nhét được PO đơn khác vào kế hoạch), bỏ khóa ngoại ghép không phá khóa ngoại màu cỡ → PO, bước nạp BRAVO, `load:bravo`; migration 0008 an toàn trên dữ liệu có sẵn; cache quyền làm mới đủ.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| M1 | MEDIUM | `cut-ratio.service.ts` | Sửa màu cỡ, Xác nhận không khóa dòng PO; nay nhiều ĐVCS cùng ghi một PO: PO "đã xác nhận" có thể mang tỷ lệ khác | `updateColorSizes`, `setConfirmed` chạy trong transaction, khóa PO (`pos.lock`) rồi mới đọc trạng thái; màu cỡ cũ cho nhật ký đọc trong cùng transaction. Chỉ khóa PO rồi màu cỡ, cùng thứ tự với bước nạp BRAVO | Đóng |
| M2 | MEDIUM | `catalog.service.ts` | `admin.catalog:update` nay quyết định phạm vi dữ liệu (đổi ĐVCS của nhà máy là đổi đơn ở Chọn mã hàng, quyền sửa tỷ lệ cắt): tự nới phạm vi | Thêm nhà máy, đổi ĐVCS, bật/tắt nhà máy cần thêm `admin.permission:update` (`assertAdminCeiling`, như chuyển chuyền sang xưởng khác); giao diện khóa nút Thêm, công tắc, ô ĐVCS kèm lý do; test `catalog.spec` | Đóng |
| L1 | LOW | `api-contract.md` | Hợp đồng API còn "nhà máy được tích", `productionFactoryIds`; thiếu `inPlan`, lọc màn Tỷ lệ cắt, 422 Thêm PO | Đã cập nhật | Đóng |
| L2 | LOW | `cut-ratio.service.ts`, migration 0008 | Deploy code trước migrate: Thêm PO khác ĐVCS vướng khóa ngoại cũ thành 500; migrate cần khóa bảng | `create` bắt lỗi khóa ngoại trả 409; bước triển khai ghi migrate trước, lúc không nạp BRAVO | Đóng |
| L3 | LOW | vận hành | Người được tích nhà máy ngoài ĐVCS được gán mất đơn; nhà máy chưa gắn ĐVCS | Chạy truy vấn chỉ đọc trên máy chủ: `dat.le` tích VIET DUC (A02) nhưng chưa được gán A02; 18 nhà máy (xưởng gia công ngoài) chưa gắn ĐVCS, 670 đơn chỉ có các nhà máy này. Báo người dùng | Chấp nhận (báo người dùng) |
| L4 | LOW | `bravo-order-import.repository.ts` | Bước nạp ghép PO BRAVO với PO tay của ĐVCS khác cùng số | Câu đọc trạng thái bỏ PO tay khác ĐVCS của đơn: BRAVO thêm PO mới, PO tay giữ nguyên; test `bravo-import.db.spec`; ghi ADR | Đóng |
| L5 | LOW | `order.repositories.ts` | `poOrderBranchExpr` đọc `SalesOrder` từ repository của PO | Ghi là ngoại lệ có chủ đích (cột không nhạy cảm, chính sách cột theo `order.po`) ở ADR 0013 mục 11 | Đóng |
| L6 | LOW | `phase5.spec.ts` | Thiếu test: PO trong kế hoạch ĐVCS khác, A00, Thêm PO nhờ PO tay | Thêm 3 tình huống | Đóng |
| L7 | LOW | `CutRatioPage.tsx` | Phụ đề sai nghĩa ở A00; lý do khóa Xóa khó hiểu | Phụ đề riêng cho đơn vị tổng hợp; "có thể của đơn vị khác" | Đóng |
| L8 | LOW | `catalog.service.ts` | Comment, log còn chữ "tích" | Sửa chữ | Đóng |
| L9 | LOW | `db-order.md`, `0001` | `UQ_SalesOrder_IdBranch` không còn ai tham chiếu; câu chung về khóa ngoại ghép có ngoại lệ | Ghi ngoại lệ ở `db-order.md`; bỏ UQ ở migration sau | Chấp nhận |
| L10 | LOW | ADR 0013 | Đổi quyết định đã chốt ngay trong ADR cũ thay vì ADR mới | Theo cách làm của mục 8–10: mục 11 ghi rõ phần thay thế, mục 3, 4 đánh dấu. Chờ người dùng chốt có tách ADR 0014 không | Chờ người dùng |

Sau khi sửa: backend 264 qua, 2 bỏ qua (bộ `MES_*_TCR`), frontend 151 qua, lint, build qua.

## Lượt 9 – kiểm bản sửa lượt 8 (12/10/2026)
Kết luận agent: **APPROVE WITH SUGGESTIONS**. M1, M2 và các LOW lượt 8 đã đóng đúng (kiểm cả thứ tự khóa với bước nạp BRAVO, lập kế hoạch; không lách được kiểm quyền danh mục; bộ lọc L4 không đổi số đếm PO mất, PO nạp lại ổn định). 0 CRITICAL, 0 HIGH, 0 MEDIUM, 3 LOW mới.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| L1 | LOW | `cut-ratio.service.ts` `remove` | Xóa màu cỡ trước khi khóa PO (ngược thứ tự với sửa màu cỡ), kiểm Đã xác nhận ngoài transaction | Khóa PO trong transaction, đọc lại trạng thái, `usedInPlans` qua transaction, rồi mới xóa | Đóng |
| L2 | LOW | `catalog.service.ts` `updateFactory` | `before` đọc ngoài transaction, `IsActive` luôn ghi khi client gửi: gửi lại giá trị cũ đúng lúc người khác vừa đổi thì bật/tắt lại mà không kiểm quyền | Chỉ ghi `IsActive` khi khác giá trị đang có (như `BranchCode`) | Đóng |
| L3 | LOW | `CatalogsPage.tsx`, test | Ô ĐVCS chỉ đọc vẫn có dấu bắt buộc; chưa có test giao diện cho trường hợp thiếu quyền | Bỏ dấu bắt buộc, placeholder "Chưa gắn"; test `catalog-factories.test.tsx` (nút Thêm, công tắc khóa có lý do; lưu tên không gửi ĐVCS) | Đóng |
| – | Ghi chú | `usedExpr`, `shipment.service.ts` | Khóa chéo hiếm giữa sửa màu cỡ và đưa cùng PO vào kế hoạch ở cùng ĐVCS: 1205 thành 409 "Thử lại" | Chấp nhận (cửa sổ rất hẹp, không mất dữ liệu) | Chấp nhận |

Sau lượt 9: backend 264 qua, 2 bỏ qua (bộ `MES_*_TCR`, đã xóa), frontend 152 qua, lint, build qua.

## Lượt 10 – task 5.9.14 khung "PO của kế hoạch" ở Kế hoạch xuất hàng (12/10/2026)
Phạm vi: 8 file (`order.controller.ts`, `shipment.service.ts`; frontend `ShipmentPage.tsx`, `api.ts`, `global.css`; test `shipment-plan-pos.spec.ts`, `shipment-plan-pos-service.spec.ts`, `shipment-plan-pos.test.tsx`). Kết luận agent: **APPROVE WITH SUGGESTIONS** (0 CRITICAL, 0 HIGH, 1 MEDIUM, 6 LOW). Agent kiểm và xác nhận đúng: cột suy ra (`confirmedAt`, `confirmedQty`, `unconfirmedQty`) theo mức chặt hơn của Số lượng và Trạng thái, Che luôn `"***"` kể cả khi trống hay 0; ghi đè `@FieldResource('order.po')` ở handler không để lọt cột của `order.shipment`; guard đòi đủ `order.shipment:view` và `order.po:view` (403 trước khi đọc kế hoạch); kế hoạch ĐVCS khác 404, A00 xem được; phạm vi OWNER của `order.po` áp đúng, `hiddenCount` không lộ thêm (GET `/:id` đã trả `poIds`); không SQL thô, không `BranchCode` từ client; frontend không lộ tổng khi có ô Che/Ẩn.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| M1 | MEDIUM | `shipment.service.ts` `posOfPlan` | Thứ tự dòng cố định theo Ngày xuất, PO# kể cả khi hai cột bị Ẩn/Che: lộ thứ tự giá trị (như review 5.9 lượt 6 M1) | Hàm `poSort(levels)`: chỉ xếp theo cột xem được nguyên giá trị, không còn cột nào thì theo Id; unit test 4 tổ hợp, bài DB "Ngày xuất bị Ẩn"; sửa `api-contract.md` | Đóng |
| L1 | LOW | `shipment.service.ts` `candidatePos` | Popup Chọn mã hàng cũng xếp cố định theo Ngày xuất (có từ trước) | Dùng chung `poSort`; bài DB kiểm popup xếp theo PO#, không có `shipDate` | Đóng |
| L2 | LOW | `ShipmentPage.tsx` | Câu "Số lượng là của cả PO" mất khi SL kế hoạch bị Ẩn/Che | Luôn hiện khi cột Số lượng không bị Ẩn; chỉ phần "kế hoạch này lấy X" theo SL kế hoạch | Đóng |
| L3 | LOW | `global.css` | Màn thấp: hai hàng 3fr/2fr thấp hơn nội dung tối thiểu | Kiểm DevTools (dữ liệu giả): 1366×768 lưới dưới tràn khỏi khung 71px (không chồng, vùng chính cuộn). `grid-template-rows: minmax(260px, 3fr) minmax(250px, 2fr)`: hết tràn, vùng chính cuộn 48px; 1920×1080 hai khung 488/325px, không cuộn | Đóng |
| L4 | LOW | `ShipmentPage.tsx` | Điện thoại: chọn dòng thì khung PO ở ngoài màn hình | Không tự cuộn: kéo trang khỏi nút Sửa/Xóa ở đầu trang (cũng dùng dòng đang chọn); giống Cập nhật tỷ lệ cắt | Chấp nhận |
| L5 | LOW | `shipment.service.ts` | Kiểu `Level` khai lại như `po-allocation.service.ts` | `field-policy.service.ts` xuất kiểu `AccessLevel`; hai service dùng `AccessLevel \| undefined` (module không import thẳng `core.types`) | Đóng |
| L6 | LOW | test, tài liệu | Thiếu bài frontend cho lỗi tải + Thử lại, Trạng thái bị Che; `setRolePolicy(null)` trả về rỗng thay vì mức cũ; chưa ghi 5.9.14 ở phase, README | Thêm 2 bài frontend; cập nhật tài liệu. `setRolePolicy(null)` giữ như `phase5.spec` (seed không có chính sách PLANNER trên các cột này, chạy trên bộ database test riêng) | Đóng (phần test chính sách: chấp nhận) |
| – | Ghi chú | `ShipmentPage.tsx` `CANDIDATE_PO_COLS` | Ngoài phạm vi, có từ trước: popup Chọn mã hàng không truyền `policy`, cột PO bị Ẩn vẫn hiện thành cột trống | Ghi vào mục Phát sinh của phase 5.9 | Phát sinh |

Test trên bộ database riêng `MES_*_TPP` (phiên khác đang giữ `MES_*_Test`): backend toàn bộ 272 qua, 2 bỏ qua, 1 bài `catalog.spec` quá 30 giây lúc máy chạy song song test frontend và build (chạy riêng `catalog.spec` 19/19 qua). Sau khi sửa: các bài liên quan (`shipment-plan-pos*`, `po-allocation*`, `phase5`) 63 qua; frontend 158 qua; lint, build qua. Kiểm ngược: bỏ `@FieldResource('order.po')` ở hai handler thì bài "cột cùng tên" hỏng.

## Lượt 11 – kiểm bản sửa lượt 10 (12/10/2026)
Kết luận agent: **APPROVE**. M1 và các LOW lượt 10 đã đóng đúng; 0 CRITICAL, 0 HIGH, 0 MEDIUM, 0 LOW mở. Agent đối chiếu `poSort` với `ordered()` của `BaseRepository` (cột trong danh sách sắp xếp được, `Id` thêm cuối không lặp khi đã là `Id:asc`, `Id` không phải cột đăng ký nên không lộ gì), `fields.levels` trong `candidatePos` đọc sau kiểm đơn hàng, cùng `access` với interceptor; khối điện thoại vẫn thắng `minmax` của `split-rows`. Chạy lại: unit backend 4/4, frontend 6/6, `tsc`, eslint qua.

Ghi chú: bài DB "Ngày xuất bị Ẩn" không phân biệt `PoNumber:asc` với `Id:asc` (PO tạo theo thứ tự số); unit test đã phủ 4 tổ hợp. Working tree có `scripts/seed-data.ts`, `seed.ts` đổi theo ADR 0014 của phiên khác: không thuộc 5.9.14, cần lượt review riêng, tách khỏi commit của 5.9.14.

## Task 5.9.15: khung Màu cỡ của kế hoạch (13/10/2026)
Phạm vi: 2 file chưa commit trên `main` (`frontend/src/features/order/ShipmentPage.tsx`, `frontend/src/test/shipment-plan-pos.test.tsx`; bỏ qua `deploy/huong-dan.html`), đối chiếu backend `ShipmentService.get`/`draft`, `FieldPolicyService.shape`, mã cột của `order.shipment` trong seed. Kết luận agent: **BLOCK** (0 CRITICAL, 2 HIGH, 2 MEDIUM, 5 LOW). Hai HIGH có gốc ở backend (`GET /:id` đã trả các số này cho người chỉ có `order.shipment:view` từ trước), nhưng thay đổi này đưa chúng lên khung mặc định cho mọi người xem, nên điều kiện chấp nhận của review 5.1 N4, P7 ("chỉ người có quyền lập kế hoạch mới gọi") không còn đúng ở giao diện. Sửa đúng cần chạm backend, ngoài phạm vi "chỉ frontend": chờ người dùng quyết.

Agent kiểm và xác nhận đúng:
- Bộ nhớ đệm dùng chung với popup Sửa không làm điền form từ dữ liệu cũ: popup vẫn `refetchOnMount: 'always'` và chỉ điền khi `isSuccess && isFetchedAfterMount`; `isFetchedAfterMount` tính theo observer của popup (so `dataUpdateCount` lúc popup mount), nên lần tải trước của khung không được dùng để điền (trừ trường hợp hẹp ở L2). Lưu xong, `useAfterClose` làm mới `['order']` nên khung tải lại.
- Đổi kế hoạch không hiện dòng của kế hoạch cũ (khóa theo id, không `keepPreviousData`); chưa chọn kế hoạch thì không gọi API; chỉ khung đang xem gọi API; khung PO giữ nguyên logic 5.9.14, chỉ đổi tiêu đề.
- Không lỗi TDZ: `NO_PLAN_LINES`, `lineKey` chỉ được dùng trong thân hàm; `PLAN_LINE_COLUMNS` trải `LINE_COLUMNS` sau khi khai báo.
- `rowKey` không trùng trong thực tế: `UQ_ShipmentPlanColorSize (ShipmentPlanId, ColorName, SizeName)` và collation không phân biệt hoa thường chặn trùng ở DB (trừ L1).
- Cột SL KHXH theo `planQty` của `order.shipment`: Ẩn thì `DataGrid` bỏ cột, Che thì ô `Masked`; tổng SL KHXH bỏ khi có ô Che hoặc thiếu (`sumOf` trả `null`). Tổng SL KHXH bằng `planQty` của dòng ở lưới trên nên không lộ thêm.
- `SegmentedControl` (Mantine 9.7.1) render `role="radiogroup"` nhận `aria-label`, mỗi lựa chọn là radio có nhãn; vùng chạm cỡ `xs` khoảng 28px (≥ 24px, mục H.2 của `10-giao-dien.md`).
- Cột khai ở cấp module, dòng của `DataGrid` memo, không vẽ lại thừa (mục 13.2).

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| H1 | HIGH | `ShipmentPage.tsx:217-218` (cột `plannedQty`, `remainingQty` có `field: null`); gốc ở `backend/src/modules/order/shipment.service.ts:193-199` (`get`), `:301-303` (`draft`, qua `draftFor`) | SL đã tạo KHXH là tổng SL KHXH của các kế hoạch khác cùng đơn (mọi ĐVCS, mọi người lập); SL còn lại = gốc − số đó. `order.shipment` không có mã cột `plannedQty`, `remainingQty` nên interceptor không chạm, hai cột không theo mức của `planQty`. Người bị Che/Ẩn "Số lượng KH" vẫn suy ra được: đơn có 2 kế hoạch thì SL đã tạo KHXH của kế hoạch này chính là SL KHXH theo màu cỡ của kế hoạch kia; xem được cả N kế hoạch (N ≥ 2) của một đơn thì giải ra hết (`S = Σx/(N−1)`, `p_i = S − x_i`). Trái mục 8.3 "Cột suy ra" của `04-phan-quyen.md`. Review 5.1 P7 chỉ chấp nhận cho người lập kế hoạch; khung mới hiện mặc định cho cả người chỉ xem (seed: Giám đốc, Kế toán, ngoại lệ theo người). Cùng họ, có từ trước: `candidates` trả `plannedQty` (tổng SL KHXH của đơn) theo chính sách của `order.allocation` | Đề xuất: backend `get`, `draftFor` (không đụng `draft` nội bộ mà `create`/`update` dùng để kiểm SL còn lại) đưa `plannedQty`, `remainingQty` qua mức của `planQty` theo kiểu `derived()` của `presentPlanPo` (Ẩn bỏ khóa, Che `***`); test DB (Che/Ẩn `planQty` thì hai cột Che/không có). Frontend: lọc cột theo `policy.level('planQty')` như `PlanPoPane` làm với cột suy ra; test. Nếu người dùng chấp nhận để lộ: ghi `13-quyet-dinh.md` rồi hạ mức | Mở, chờ người dùng (sửa backend ngoài phạm vi "chỉ frontend") |
| H2 | HIGH | `ShipmentPage.tsx:216` (cột `originalQty`), `:236`, `:257` (tổng số lượng gốc); gốc ở `shipment.service.ts:199` | Số lượng gốc là SL màu cỡ của các PO trong kế hoạch, tổng gần như bằng tổng SL PO. Khung PO ngay cạnh (5.9.14) đòi `order.po:view` và bỏ tổng khi `qty` của `order.po` bị Che/Ẩn; khung Màu cỡ (mặc định) hiện cả từng ô lẫn tổng cho người không có `order.po:view` hoặc bị Che/Ẩn SL PO. Đây là mục "Cao" đã ghi ở `02-trang-thai.md` (Lỗi tiềm ẩn); review 5.1 N4 chấp nhận vì "chỉ người có quyền lập kế hoạch mới gọi được", khung mới làm điều kiện đó sai ở giao diện. Bài test `shipment-plan-pos.test.tsx:234-240` đang khóa hành vi này (người không có `order.po:view` thấy "số lượng gốc 85") | Đề xuất: backend `get` lấy mức `qty` của `order.po` (coi như Ẩn khi thiếu `order.po:view`) cho `originalQty`; `remainingQty` lấy mức chặt hơn của `planQty` và `qty`; `draftFor` giữ như N4 (người lập cần `order.po:view`). Frontend: bỏ cột và phần "số lượng gốc" ở chân lưới theo `useCan('order.po:view')`, `useFieldPolicy('order.po').level('qty')`; `fmtNum(originalSum)` cần nhánh `null`. Hoặc người dùng chốt "Số lượng gốc là dữ liệu của kế hoạch, không theo `order.po`" ở `13-quyet-dinh.md` (gộp với Q33) | Mở, chờ người dùng |
| M1 | MEDIUM | `ShipmentPage.tsx:193` | Đổi "Màu cỡ"/"PO" là đổi component gốc (`PlanLinePane` ↔ `PlanPoPane`), React gỡ cả khung kể cả `SegmentedControl` đang giữ focus: người dùng bàn phím bấm mũi tên trong nhóm radio thì focus rơi về `body`, phải Tab lại từ đầu trang (mục F.2). `EmployeesPage` đặt `SegmentedControl` ngoài phần đổi nên không bị. Chỉ báo trượt của `SegmentedControl` cũng không chạy | Đề xuất: `PlanDetailPane` dựng `.pane` và tiêu đề (switcher ở vị trí cố định), chỉ đổi phần lưới; tóm tắt của khung PO đưa vào tiêu đề qua slot (tách `usePlanPos(plan, enabled)` lên `PlanDetailPane` với `enabled: view === 'pos' && canView`, hoặc khung con nhận `titleExtra`). Test: focus radio "Màu cỡ", nhấn mũi tên phải, `document.activeElement` là radio "PO" | Mở |
| M2 | MEDIUM | `ShipmentPage.tsx:216-218`, `:224-226` | Khung lấy Số lượng gốc và tập màu cỡ lúc lưu kế hoạch, còn SL đã tạo KHXH tính ở hiện tại; popup Sửa lấy theo màu cỡ hiện tại của PO. Sửa tỷ lệ cắt hoặc nạp lại BRAVO làm giảm SL PO thì khung vẫn hiện SL KHXH ≤ SL còn lại, mở popup thì dòng đó tô đỏ "vượt SL còn lại"; màu cỡ mới thêm vào PO không có ở khung. Người dùng yêu cầu "lấy từ thông tin bên trong popup", giao diện không có dấu hiệu nào cho khác biệt này (chỉ ghi ở `06-don-hang.md`) | Chờ Q33. Trong lúc chờ: tiêu đề cột "Số lượng gốc (lúc lưu)" hoặc câu ở chân lưới "Số lượng gốc là số lúc lưu kế hoạch; mở Sửa để xem theo PO hiện tại"; ghi thêm vào Q33 là SL còn lại và tập màu cỡ cũng khác | Chờ người dùng |
| L1 | LOW | `ShipmentPage.tsx:174` | `lineKey` nối bằng `\|`: màu `A\|B` cỡ `C` trùng khóa với màu `A` cỡ `B\|C` (key React trùng; ở popup hai dòng dùng chung một ô `qty`). Có từ trước, nay dùng thêm ở khung | Nối bằng `\u0000` như `csKey` của backend (`order.util.ts:119`) | Mở |
| L2 | LOW | `ShipmentPage.tsx:229-233` với `:392-397`, `:403` | Bấm đúp dòng chưa có trong bộ nhớ đệm: lần bấm đầu đã cho khung gọi `GET /:id`; popup mở khi request đó chưa xong thì `refetchOnMount: 'always'` nhập vào request đang chạy (React Query không gửi lại) và `isFetchedAfterMount` vẫn đúng, form điền từ request gửi trước khi popup mở vài trăm ms. Rủi ro F4 (review 5.1) chỉ còn trong cửa sổ độ trễ một request | Không bắt buộc. Muốn chặt: popup gọi `existing.refetch({ cancelRefetch: true })` một lần khi mount, hoặc ghi comment nêu trường hợp này | Đề xuất chấp nhận |
| L3 | LOW | `shipment-plan-pos.test.tsx:207-279` | Thiếu test: (a) khung đã tải chi tiết, máy chủ đổi SL, bấm đúp mở Sửa thì popup gọi lại API (2 lần `GET /order/shipment-plans/7`) và hiện số mới; (b) bài Ẩn/Che không kiểm SL đã tạo KHXH, SL còn lại (H1) và đang khẳng định hành vi của H2; (c) giữ focus khi đổi khung bằng bàn phím (M1) | Thêm (a) ngay (không phụ thuộc quyết định); (b), (c) theo cách sửa H1, H2, M1 | Mở |
| L4 | LOW | `ShipmentPage.tsx:199` | `Group wrap="nowrap"` (switcher + số kế hoạch) cùng hai badge tóm tắt của khung PO nằm trên một hàng flex không xuống dòng (`.pane-title`); báo cáo nói đã xem 390px nhưng không rõ đã xem khung PO có badge chưa (mục H.1: 360px không cuộn ngang) | Xem khung PO có badge ở 360/390px; tràn thì cho `.pane-title` `flex-wrap: wrap` hoặc `Group wrap="wrap"` | Mở |
| L5 | LOW | `ShipmentPage.tsx:221` | Cột SL KHXH có `render` nên không qua ô trống "–" của `formatValue`: thiếu giá trị (chính sách cột ở trình duyệt cũ hơn máy chủ, mục `X-Permission-Version` ở `02-trang-thai.md`) thì ô trống trơn thay vì "–" (mục G.2) | `render: (l) => (typeof l.planQty === 'number' ? <b>{fmtNum(l.planQty)}</b> : <span className="cell-empty">–</span>)` | Mở |
| – | Ghi chú | `ShipmentPage.tsx:180` | Lựa chọn Màu cỡ/PO không lên URL (mục F.1); dòng đang chọn của màn này cũng chưa lên URL, F5 mất cả hai | Giữ nguyên | Chấp nhận |

Agent chạy: `vitest run src/test/shipment-plan-pos.test.tsx` 9/9 qua; eslint hai file sạch. Không sửa code.

### Lượt 2 – kiểm bản sửa lượt 1 (13/10/2026)
Phạm vi: `backend/src/modules/order/shipment.service.ts`, `backend/test/shipment-plan-lines-service.spec.ts` (mới), `frontend/src/features/order/ShipmentPage.tsx`, `frontend/src/test/shipment-plan-pos.test.tsx`; tài liệu `06-don-hang.md`, `12-du-lieu-mau-va-kiem-thu.md`, `02-trang-thai.md`. Kết luận agent: **APPROVE WITH SUGGESTIONS** (0 CRITICAL, 0 HIGH, 1 MEDIUM, 4 LOW mới). H1, H2 đã đóng ở `GET /:id` và giao diện; M1, L1, L4, L5 đóng; M2 đóng phần giao diện, phần còn lại chờ Q33; L2 chấp nhận; L3 đóng trừ (a) còn yếu (N2). Điều kiện "xong" còn thiếu: chạy test backend có database trên bộ database test riêng (N4) và sửa câu chữ của mục "Cao" (N1).

Trả lời hai câu hỏi kiểm thêm:
- `update()` đổi từ `get()` sang `detail()` **không đổi hành vi, không đổi kiểm quyền**: `detail()` chính là thân của `get()` cũ (cùng `scopeOf(user)`, `plans.getById(scope, id)` hành động `view`, `listByParent` của màu cỡ và PO, `plannedMap`), trả số thật như `get()` cũ trả trước khi có interceptor. `update()` chỉ dùng `before.salesOrderId`, `before.poIds` (để khóa đơn, tính draft) và ghi `before` vào nhật ký: cả ba giống hệt trước. Nếu giữ `get()` thì nhật ký sẽ ghi `***`/thiếu số tùy chính sách cột của người sửa, nên tách là đúng. Kiểm quyền ghi vẫn ở `assertWritable`, `plans.lock(..., 'update')`, `getById(..., 'update', trx)` như cũ.
- **Không còn chỗ nào gọi `ShipmentService.get()` trong code**: chỉ `order.controller.ts:163` (`GET /order/shipment-plans/:id`). Các `this.get(user, id)` ở `color-size.service.ts:153,183`, `line-plan.service.ts:217,290` là `get` của service khác. Frontend chỉ đọc `GET /:id` ở khung Màu cỡ và popup Sửa; popup chỉ dùng `lines[].planQty` (điền ô, `savedQty`), các cột suy ra của popup lấy từ `GET /draft`, nên Che/Ẩn ở `get` không làm hỏng popup.

Agent kiểm và xác nhận đúng:
- `presentPlanLine`: `originalQty` theo `qty` của `order.po`, `plannedQty` theo `planQty`, `remainingQty` theo mức chặt hơn; Ẩn bỏ khóa, Che `***`, Chỉ đọc giữ số; `planQty` để interceptor áp theo tên khóa (cùng `access`, cùng mức với `own.levels.get('planQty')`). Mã `plannedQty`, `remainingQty`, `originalQty` không phải mã cột đã đăng ký nên interceptor không ghi đè giá trị đã suy ra.
- Thiếu `order.po:view` thì coi `qty` như Ẩn: cần thiết, vì `FieldPolicyService.compute` trả mức mặc định Sửa được khi không vai trò nào có quyền xem tài nguyên. `access.permissions` là cùng tập quyền mà `PermissionGuard` dùng (gồm ngoại lệ theo người).
- `detail()` lỗi 404 thì `Promise.all` trả 404, không lộ gì thêm; `fields.levels` có bộ nhớ đệm theo người và ĐVCS.
- `presentPlanPo` dùng `derived`/`withDerived` cho kết quả giống hệt (thứ tự khóa, bỏ khóa `undefined`); `shipment-plan-pos-service.spec.ts` vẫn qua.
- Frontend lọc cột giống máy chủ (`!canViewPo || qty HIDDEN` bỏ Số lượng gốc; `planQty` HIDDEN bỏ SL đã tạo KHXH; SL còn lại bỏ khi một trong hai bị Ẩn); Che thì máy chủ đã trả `***`, `DataGrid` hiện ô `Masked`. Chân lưới có nhánh `null` cho từng tổng, câu "Số lượng gốc là số lúc lưu kế hoạch." chỉ hiện khi có tổng số lượng gốc.
- M1: `SegmentedControl` nằm cố định trong `PlanDetailPane` (`.pane` › `.pane-title` › `Group`), chỉ lưới và tóm tắt đổi; `usePlanPos` chỉ tải khi đang xem PO và có `order.po:view`. Bài test kiểm `poRadio.isConnected` sau hai lần đổi là phép kiểm đủ cho việc không gỡ nút.
- L1: `\u0000` chỉ dùng làm key React và khóa của object `qty`, không vào thuộc tính DOM hay dữ liệu gửi lên (`SheetGrid` chỉ dùng `rowKey` làm key của `react-datasheet-grid`).

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| N1 | MEDIUM | `backend/src/modules/order/order.controller.ts:151,159` (`candidates`, `draft` chỉ đòi `order.shipment:view`); `shipment.service.ts:345` (`draftFor`); câu chữ ở `02-trang-thai.md` mục "Cao" (`draft`) và `06-don-hang.md:279` | Tài liệu ghi lưới của popup "chỉ người lập kế hoạch dùng" (lý do chấp nhận của review 5.1 N4, P7), nhưng API chỉ đòi `order.shipment:view`. Người chỉ xem có thêm `order.po:view` (seed: Giám đốc, Kế toán) gọi thẳng `GET /draft?salesOrderId=…&poIds=…&excludePlanId=<id>` (lấy `salesOrderId`, `poIds` từ `GET /:id`) là nhận `originalQty`, `plannedQty`, `remainingQty` chưa áp chính sách: đi vòng được phần sửa H1, H2 ở mức API. `GET /candidates` tương tự với `plannedQty` của cả đơn. Có từ trước 5.9.15, giao diện không còn hiện cho người chỉ xem | Đề xuất (ít dòng): `draftFor` đòi `order.shipment:update` khi có `excludePlanId`, `order.shipment:create` khi lập mới; `candidates`, `candidatePos` đòi `order.shipment:create` (guard chỉ có "đủ mọi quyền" nên kiểm trong service hoặc tách endpoint; popup Thêm/Sửa vốn chỉ mở khi có `create`/`update`), kèm test 403. Khi đó lý do chấp nhận N4, P7 mới đúng. Nếu chưa làm: sửa câu ở `02-trang-thai.md`, `06-don-hang.md:279` thành "mọi người có `order.shipment:view` và `order.po:view` gọi được" | Mở |
| N2 | LOW | `frontend/src/test/shipment-plan-pos.test.tsx:271-286` | Bài "khung đã tải rồi mở Sửa" chỉ chứng minh popup gọi lại API (2 lần `GET /7`), chưa chứng minh popup điền từ lần tải mới: tiêu đề "Sửa kế hoạch …" hiện ngay từ dữ liệu trong bộ nhớ đệm, và bỏ điều kiện `isFetchedAfterMount` ở `PlanDialog` thì bài vẫn qua | Lần gọi `GET /7` thứ hai trả SL KHXH khác (ví dụ Red/36 = 9), kiểm ô "SL sản phẩm" bằng tổng mới (9 + 40 = 49) hoặc ô SL KHXH của lưới nhập là 9 | Mở |
| N3 | LOW | `shipment.service.ts:234` | `scope.access.permissions.has('order.po:view')` là chỗ đầu tiên trong `backend/src/modules` tự kiểm quyền (CLAUDE.md mục 4.3: không để module tự viết điều kiện phân quyền). Hành vi đúng, nhưng quy tắc "thiếu quyền xem tài nguyên thì mọi cột như Ẩn" nên nằm ở platform để nơi khác dùng lại (khung PO, sau này các màn đọc chéo tài nguyên) | Thêm hàm ở `FieldPolicyService`, ví dụ `readableLevels(access, resource)`: không có `${resource}:view` thì mọi cột `HIDDEN`; `get` gọi hàm đó | Mở |
| N4 | LOW | `backend/test/*` có database | Đổi đường đọc có chính sách cột (`GET /:id`) nhưng chưa chạy bộ test backend có database; mục 7, 9 của CLAUDE.md đòi test liên quan qua trên bộ database test riêng (đổi `DB_*_NAME`, `--runInBand`, xong xóa). Hai bài mới mock `fields.levels`, chưa có bài đi qua `FieldPolicyInterceptor` thật | Chạy `phase5.spec` (mục L4, Module Đơn hàng), `shipment-plan-pos.spec` trên bộ `MES_*_T…` riêng (tạo database trên máy chủ dùng chung cần người dùng cho phép); thêm một bài HTTP: vai trò Kế hoạch bị Che `planQty` thì `lines[].plannedQty`, `remainingQty`, `planQty` là `***`; người không có `order.po:view` thì không có `originalQty` | Chờ người dùng |
| N5 | LOW | `frontend/src/features/order/api.ts:136-148` | `ShipmentPlanDetail.lines` vẫn khai `originalQty`, `plannedQty`, `remainingQty: number` trong khi `GET /:id` nay có thể bỏ khóa hoặc trả `***` (test phải ép kiểu `'***' as unknown as number`). Code hiện tại xử lý đúng (`sumOf`, `DataGrid`), nhưng kiểu sai thì phép tính sau này trên các trường đó không bị `tsc` bắt | Kiểu riêng cho dòng của `GET /:id`: `number \| typeof MASK \| undefined` cho ba cột suy ra và `planQty` | Mở |
| – | Ghi chú | `02-trang-thai.md` Q33 | M2: chân lưới đã ghi "Số lượng gốc là số lúc lưu kế hoạch."; Q33 chưa nói SL còn lại (tính từ số gốc lúc lưu) và tập màu cỡ cũng khác popup | Thêm một câu vào Q33 | Mở |

Agent chạy: frontend `vitest run src/test/shipment-plan-pos.test.tsx` 11/11 qua; backend `npx jest test/shipment-plan-lines-service.spec.ts test/shipment-plan-pos-service.spec.ts` 6/6 qua (không database); eslint 4 file sạch; `tsc --noEmit` backend qua. Không chạy test có database (`.env` trỏ database dùng chung). Không sửa code.
