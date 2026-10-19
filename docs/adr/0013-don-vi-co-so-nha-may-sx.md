# ADR 0013 – Đơn vị cơ sở theo BRAVO, Nhà máy SX, đơn hàng dùng chung

**Trạng thái:** Proposed (làm theo yêu cầu người dùng ngày 11/10/2026, chờ duyệt cùng Phase 5.9) · **Ngày:** 11/10/2026

Thay một phần ADR 0002 (nghĩa của `BranchCode`), ADR 0006 (phạm vi của Thông tin đơn hàng, PO), ADR 0010 (tên cấp gốc của cây tổ chức).

## Bối cảnh
Sau khi triển khai lên máy chủ, người dùng yêu cầu ba điều chỉnh:

1. **Danh mục "Chi nhánh SX" đổi thành "Đơn vị cơ sở" (ĐVCS).**
   - Danh sách ĐVCS lấy y như danh mục chi nhánh BRAVO đã đồng bộ (`MES_Sync.bravo.DM_CHINHANH`).
   - Người dùng được phân quyền theo ĐVCS.
   - Trong một ĐVCS có thể có nhiều nhà máy sản xuất. Cần danh mục Nhà máy SX, mỗi nhà máy gắn với một ĐVCS.
   - Ở màn Người dùng, ngoài ĐVCS còn tích thêm Nhà máy SX.
2. **Phạm vi dữ liệu:**
   - Thông tin đơn hàng lấy hết dữ liệu BRAVO đã đồng bộ, không lọc theo ĐVCS.
   - Kế hoạch xuất hàng, khi bấm "Chọn mã hàng", chỉ hiện đơn hàng có Nhà máy SX thuộc các nhà máy người dùng được tích.
3. **Màn đăng nhập không sang trang khác:** nhập đúng mật khẩu thì ô ĐVCS hiện ngay trên cùng form.

Hiện trạng trước thay đổi:
- `SysBranch` (mã `A01…`, đơn vị tổng hợp `A00`) vừa là phạm vi đăng nhập, vừa lọc mọi bảng nghiệp vụ.
- Mã trong `DM_CHINHANH` (`A01`–`A05`) trùng mã `SysBranch`.
- Đơn hàng nạp từ BRAVO mang `BranchCode` của chi nhánh nhận đơn, hiển thị là "Chi nhánh FOB".
- "Nhà máy SX" (`SalesOrder.ProductionFactoryCode`) là danh mục mã-tên `PROD_FACTORY`, không gắn ĐVCS và không dùng để lọc.

## Quyết định

### 1. `SysBranch` giữ nguyên bảng, đổi nghĩa thành Đơn vị cơ sở
- Giữ `BranchCode`, token, `SysUserBranch`, `BaseRepository`. Không đổi tên bảng hay cột: mọi bảng nghiệp vụ, khóa ngầm, nhật ký đang dùng mã này.
- Danh sách ĐVCS theo `DM_CHINHANH`. Hàm `importBravoBranches` (`backend/src/platform/admin/branch-import.ts`):
  - thêm mã còn thiếu;
  - đặt `Name` = `TenChiNhanh`, `Description` = `TenDayDu`;
  - **không tắt** mã vắng trong BRAVO: ai được vào đâu do quản trị MES quyết. Màn hình đánh dấu "Không có trong BRAVO".
- Hàm chạy ở ba chỗ:
  - tự động sau mỗi lần đồng bộ nguồn `BRAVO.DM_CHINHANH` thành công (`SyncService.onSucceeded`);
  - nút "Cập nhật từ BRAVO" (`POST /admin/branches/import`, quyền `admin.branch:update`);
  - script `seed` và `load:bravo`.
- **Tên ĐVCS có trong BRAVO sửa ở BRAVO**, MES từ chối đổi (409). Mã vẫn cấm sửa.
- Đơn vị tổng hợp `A00` giữ nguyên, là của MES (người dùng chốt giữ).
- Seed chỉ tạo `A01`–`A03` mẫu khi có dữ liệu mẫu. Máy dùng thật lấy ĐVCS từ BRAVO.

### 2. Danh mục Nhà máy SX (`SysProductionFactory`)
- Bảng danh mục mới ở `MES_Core`. `BranchCode` là khóa ngoại tới `SysBranch.Code`:
  - nhà máy chép từ `PROD_FACTORY` không trùng mã ĐVCS nào thì để `NULL`;
  - service không cho gắn vào đơn vị tổng hợp.
- Migration `MES_Core/0007` chép mục của `PROD_FACTORY` sang, giữ mã, nên đơn hàng đã chọn nhà máy vẫn trỏ đúng. Danh mục cũ ngừng dùng (không xóa).
- Quản lý ở Quản trị › Danh mục hệ thống › Nhà máy SX (`/admin/catalogs/factories`). Mã không sửa được; ngừng dùng bằng `IsActive`.
- Màn Đơn vị cơ sở hiện các nhà máy của từng ĐVCS.

### 3. Người dùng được tích Nhà máy SX (`SysUserProductionFactory`)
> **Thay bằng mục 11 từ 12/10/2026:** nhà máy SX lấy theo ĐVCS đăng nhập, không tích theo người. Bảng còn nhưng không dùng.

- Bảng gán như `SysUserBranch`.
- Lưu cùng ĐVCS trong một lần gọi (`PUT /admin/users/:id/branches`, thêm `productionFactoryIds`; không gửi thì giữ nguyên). Có `SysAuditLog`, tăng `SysPermissionVersion`.
- Không bắt nhà máy thuộc ĐVCS được gán: người dùng chốt lọc theo **mọi nhà máy được tích**, dù đang làm việc ở ĐVCS nào.
- `PermissionService` đưa mã nhà máy đang dùng vào `UserAccess.productionFactories`. Ngừng một nhà máy cũng tăng phiên bản quyền.

### 4. Thông tin đơn hàng và PO dùng chung toàn công ty
- `order.allocation` (`SalesOrder`) và `order.po` (`SalesOrderPo`) đổi `ScopeType` sang `SHARED`, bỏ chiều phạm vi `FACTORY → BranchCode`, giữ `OWNER`.
- Cột `BranchCode` của hai bảng còn lại, chỉ mang nghĩa ĐVCS nguồn (Chi nhánh FOB). `BaseRepository` thêm cờ `originBranch` cho loại bảng này:
  - **đọc** không lọc ĐVCS: mọi ĐVCS xem được;
  - **ghi** như bảng theo ĐVCS (review 5.9 H1):
    - tạo mới đóng dấu ĐVCS của phiên (không nhận từ client);
    - sửa, xóa chỉ dòng của ĐVCS đang làm việc, dòng ĐVCS khác trả 404;
    - đơn vị tổng hợp không ghi được.
  - Nhờ vậy người ở ĐVCS khác không đổi được Nhà máy SX của đơn (đổi là lách được bộ lọc Chọn mã hàng), không sửa được SL gốc của PO mà ĐVCS khác dựa vào. Nhà máy SX của đơn do ĐVCS nhận đơn chọn.
- ~~PO chỉ thêm ở ĐVCS của đơn (`GetOptions.sameBranch`). Khóa ngoại ghép PO–đơn hàng giữ nguyên.~~ Từ mục 11: PO thêm ở ĐVCS đang dùng mã hàng, mang ĐVCS của phiên; ĐVCS có PO trong kế hoạch của mình sửa được PO đó (`usedBy`).
- `ChildRepository` lọc ĐVCS theo cách của bảng cha. Cha dùng chung:
  - dòng con chép `BranchCode` của dòng cha, nên khóa ngoại ghép con–cha vẫn đúng;
  - ghi dòng con chỉ khi cha ghi được.
- Hệ quả, cần người dùng biết:
  - màn Cập nhật tỷ lệ cắt (cũng là PO) thấy PO của mọi ĐVCS, sửa được PO của ĐVCS mình;
  - ngoại lệ Allow theo người ở `A00` trên tài nguyên dùng chung thấy toàn bộ đơn hàng (không còn "đóng an toàn" theo ĐVCS);
  - **chỉ người đang làm việc ở đúng ĐVCS nhận đơn (Chi nhánh FOB) mới chọn được Nhà máy SX cho đơn đó**. Đơn của ĐVCS chưa ai được gán, mà không có nhà máy SX cùng mã, sẽ không hiện ở Chọn mã hàng cho tới khi có người của ĐVCS đó chọn nhà máy. Cần người dùng chốt; nếu muốn một bộ phận chung chọn nhà máy cho mọi đơn thì cần quyền riêng (Phát sinh của Phase 5.9);
  - kế toán có phạm vi ĐVCS A01, A02 vẫn thấy mọi đơn hàng;
  - đơn hàng của ĐVCS mới chỉ có sau khi nạp lại từ BRAVO.

### 5. Kế hoạch xuất hàng vẫn theo ĐVCS của phiên, chọn đơn theo Nhà máy SX
- Popup Chọn mã hàng (`candidates`), PO của đơn, lưới màu cỡ khi lập mới, và lệnh tạo kế hoạch chỉ nhận đơn hàng có `ProductionFactoryCode` thuộc `UserAccess.productionFactories` (từ mục 11: nhà máy thuộc ĐVCS đăng nhập).
  - Điều kiện do `BaseRepository` dựng (`productionFactoryColumn` + `assignedFactories`), module không tự viết.
  - Đơn chưa chọn Nhà máy SX không hiện.
- Lệnh tạo đọc lại đơn sau khi khóa, đề phòng nhà máy của đơn vừa đổi.
- Kế hoạch lập ở ĐVCS của phiên, cho đơn hàng của ĐVCS khác được. Vì vậy migration `MES_Order/0005` đổi khóa ngoại ghép `(…, BranchCode)` sang khóa ngoại theo `Id` ở hai chỗ:
  - kế hoạch → đơn hàng;
  - PO được chọn → PO.

  Khóa ngoại ghép PO → đơn hàng giữ nguyên, vì PO chỉ thêm ở ĐVCS của đơn (đổi sang theo `Id` ở `MES_Order/0008`, mục 11).
- SL đã lập (`plannedBySalesOrder`) cộng kế hoạch ở mọi ĐVCS: đơn dùng chung thì số lượng gốc cũng dùng chung.
- Sửa kế hoạch đã lập không đòi nhà máy còn được tích. Kế hoạch phải xem được trong phạm vi.

### 6. Đăng nhập một form
- Đúng mật khẩu:
  - hai ô tên, mật khẩu khóa lại;
  - ô ĐVCS mở ra ngay dưới, chọn sẵn ĐVCS lần trước;
  - nút đổi thành "Vào làm việc".
- Một ĐVCS thì vào thẳng.
- API không đổi (`/auth/login` rồi `/auth/select-branch`).

### 7. Chữ trên giao diện
Mọi chỗ "nhà máy" mang nghĩa `SysBranch` đổi thành "đơn vị cơ sở" (cột dạng ngắn "ĐVCS"):
- thanh trên cùng;
- màn Quản trị (menu `admin.branch` tên "Đơn vị cơ sở");
- chiều phạm vi `FACTORY` (tên trong DB đổi ở migration 0007);
- màn Nhân sự, các màn Đơn hàng, May.

"Nhà máy SX" giữ nguyên tên. Cây Chuyền may: cấp gốc là ĐVCS.

### 8. Nạp tăng dần đơn hàng BRAVO sau mỗi đợt đồng bộ (bổ sung 12/10/2026)
Người dùng chốt ngày 12/10/2026: Thông tin đơn hàng phải lấy hết dữ liệu BRAVO đã đồng bộ, đơn mới tự vào mà không mất kế hoạch đã lập. `load:bravo` xóa hết rồi nạp lại nên chỉ dùng cho máy demo.

- **Khi nào chạy:** backend tự chạy một lần sau mỗi đợt đồng bộ, khi hàng đợi chạy hết và có ít nhất một nguồn mà câu đọc đơn hàng dùng tới chép thành công (đơn hàng, PO, màu cỡ, chi nhánh, khách hàng, mùa, nhân viên, màu, nơi giao, quốc gia); và một lần lúc backend khởi động (lần đầu sau khi triển khai, đợt đồng bộ chạy lúc backend dừng). Bấm Đồng bộ ở màn Đồng bộ dữ liệu là nạp lại. Lần nạp lỗi thì đợt đồng bộ sau thử lại; bị SQL Server hủy vì khóa chéo với thao tác người dùng thì tự thử lại sau 2 rồi 10 giây. Trong một tiến trình không chạy chồng: yêu cầu đến lúc đang nạp thì xếp đúng một lần chạy sau.
- **Bật, tắt:** biến `BRAVO_ORDER_IMPORT` (`true`/`false`). Để trống: bật trên máy dùng thật (không dữ liệu mẫu), tắt trên máy demo (đơn giả không bị trộn đơn thật; máy demo nạp bằng `load:bravo`). Test luôn tắt (`test/setup-env.ts`). Backend ghi log trạng thái bật, tắt lúc khởi động.
- **Câu đọc nguồn:** chỉ PO, màu cỡ của sản phẩm thuộc các ĐVCS đang dùng (kể cả sản phẩm gốc của hàng nhận gia công), trên kết nối riêng không giới hạn 15 giây.
- **Đường đi (ADR 0007):** lớp đồng bộ đọc bảng chép (`platform/sync/bravo-order-source.ts`), module Đơn hàng lấy qua cổng `SourceFeedService` (`platform/feed`, trước tên `BravoFeedService`), không import lớp đồng bộ. Phần so khác là hàm thuần (`modules/order/bravo-order.mapping.ts`), dùng chung ánh xạ với `load:bravo`. Phần ghi ở `BravoOrderImportRepository`: việc của hệ thống, không theo phiên, ghi mọi ĐVCS, `BranchCode` lấy từ BRAVO hoặc từ đơn đã có (như `SewingPrepRepository`, ADR 0009).
- **Quy tắc ghi:**
  - sản phẩm BRAVO mới, đã có PO, thuộc ĐVCS đang dùng: thêm đơn, PO, màu cỡ như `load:bravo` (Nhà máy SX tạm cùng mã chi nhánh nhận đơn nếu có);
  - đơn đã có: biết BRAVO có đổi đơn hay không theo **dấu nội dung** `SalesOrder.SourceHash` (migration `MES_Order/0006`), không theo mốc chép `SyncedAt`: nguồn chép theo nhóm (PO, màu cỡ) chép lại cả nhóm với mốc mới dù nội dung không đổi (review 5.9.10 H1). Dấu là SHA-256 của dữ liệu BRAVO **chưa ánh xạ** (khách hàng, mã hàng, mùa, loại, tên hàng, nhân viên, SL, mã đơn vị tính, đóng lệnh, ngày xuất sớm nhất của các PO, kèm tiền tố phiên bản): đổi tên trong danh mục Đơn vị tính của MES hay sửa cách ánh xạ không làm đơn bị ghi đè hàng loạt (review M4.3);
    - dấu khác: các cột lấy từ BRAVO (khách hàng, mã hàng, mùa, loại, tên hàng, nhân viên, SL, đơn vị, ngày xuất) theo BRAVO, kể cả khi người dùng đã sửa ở MES;
    - dấu giống: không ghi gì, giữ phần người dùng sửa;
    - chưa có dấu (đơn nạp trước 0006): đơn chưa ai sửa (`ModifiedBy` trống) thì ghi lại theo BRAVO kèm dấu; đã sửa thì chỉ ghi dấu làm mốc (và Mới → Hoàn thành nếu BRAVO đã đóng lệnh). Thay đổi BRAVO từ lần nạp trước tới lúc lấy mốc của các đơn này không được ghi, vì không biết người dùng hay BRAVO đổi;
  - giữ của MES: Nhà máy SX, đơn giá, giá CM, số đơn, ĐVCS, trạng thái (chỉ đổi Mới → Hoàn thành khi BRAVO đóng lệnh, tính ngay trong câu ghi);
  - PO: thêm PO mới; ngày xuất, nơi giao theo BRAVO khi khác (người dùng không sửa được), trừ PO người dùng tự thêm được ghép theo số PO (giữ ngày, nơi giao người dùng nhập); màu cỡ chỉ thay khi PO chưa xác nhận, chưa vào kế hoạch xuất hàng, người dùng chưa lưu màu cỡ hay xác nhận PO (`ModifiedBy` của PO, `CreatedBy` của ô), còn lại giữ của MES;
  - không xóa gì. Đơn, PO không còn ở BRAVO, đơn BRAVO đổi chi nhánh nhận đơn chỉ đếm trong log, chờ BA chốt.
- **Nhật ký:** `SysAuditLog` `BRAVO_IMPORT` (người `system`) khi có ghi dữ liệu, kèm số PO giữ màu cỡ của MES; log máy chủ mỗi lần chạy.
- **Đồng thời:** một transaction (`inTransaction`, giữ lỗi 1205 gốc) có khóa ứng dụng `MES_Order.BravoImport` (dùng chung với `load:bravo`), trên kết nối riêng. Mỗi câu ghi mở đầu bằng `SET DEADLOCK_PRIORITY LOW` (mỗi câu đi qua `sp_executesql`, SET đứng riêng hết tác dụng ngay sau câu đó, review M4.1): khóa chéo với thao tác người dùng thì SQL Server hủy bước nạp, không hủy thao tác của người dùng (có test). Trước khi thêm, sửa PO, khóa mọi đơn sẽ chạm tới theo Id tăng dần, cùng thứ tự với lập kế hoạch xuất hàng (khóa đơn rồi đọc PO, màu cỡ). Câu ghi kiểm lại điều kiện (đơn chưa ai sửa, PO chưa xác nhận, chưa vào kế hoạch, chưa sửa tay) để không đè phần người dùng vừa sửa trong lúc so.
- `SalesOrder.SyncedAt` (Ngày đồng bộ) từ nay là lần chép gần nhất của sản phẩm, PO, màu cỡ của đơn, chỉ ghi khi nạp ghi đơn đó.
- Hai đường nạp dùng chung câu đọc và ánh xạ nhưng không hoàn toàn cùng kết quả: đơn đóng lệnh sau khi đã nạp thì nạp tăng dần chỉ đổi đơn sang Hoàn thành, PO giữ trạng thái (`load:bravo` đặt PO "Đã xác nhận"); số đơn mới phụ thuộc số đã có (hậu tố `-2`); danh mục Đơn vị tính bị ngừng cả danh mục thì nạp tăng dần để tên đơn vị là mã BRAVO, `load:bravo` vẫn đổi sang tên.

### 9. Nhà máy SX theo OSM (bổ sung 12/10/2026)
Người dùng yêu cầu 12/10/2026: Nhà máy SX của đơn hàng lấy theo view OSM `DB_OSM.dbo.vOSMDataFty` (cột `FtyName`), ghép theo số SO và mã hàng; cột là `NVARCHAR` vì có tên tiếng Việt. Chốt (AskUserQuestion): chép view vào `MES_Sync`; tách từng nhà máy để phân quyền; OSM có thì theo OSM, khóa sửa tay; bước cập nhật chạy riêng sau đồng bộ OSM.

- **Dữ liệu OSM (đo trên máy chủ):** 3.511 dòng, mỗi cặp SO + mã hàng một giá trị. `FtyName` là **danh sách nhà máy cách nhau dấu phẩy** ("VIET DUC,VSN-DN"), khoảng 45 tổ hợp, có xưởng gia công ngoài (MEKO, KINGTEX, HÙNG DŨNG…). Ghép được 2.874/5.291 đơn. View chậm (nối từng dòng quá 2 phút), không đọc theo từng đơn.
- **Đồng bộ (ADR 0007):** nguồn `OSM.OSMDataFty` ở màn Đồng bộ dữ liệu, chép toàn bộ mỗi lần vào `MES_Sync.osm.OSMDataFty` (theo nhóm SO: view có dòng trùng nguyên dòng). `DB_OSM_NAME` (và `DB_OSM_SERVER` khi khác máy SQL) trong `.env`, migrate tạo synonym. `sync-gen.ts` sinh nguồn theo hệ thống (schema `bravo`, `osm`); `usp_SyncRun_Execute` cho chạy thủ tục chép của schema `osm` (`MES_Sync/0006`).
- **Ghép:** trong `MES_Sync`, `bravo.DM_SanPhamDonHang.Code = osm.OSMDataFty.SO` và `StyleName = StyleNo` (mã hàng theo BRAVO; cùng kết quả với `SalesOrder.StyleCode` lúc chốt, người dùng sửa mã hàng ở MES không làm mất ghép). Module Đơn hàng đọc qua cổng `SourceFeedService` (đổi tên từ `BravoFeedService`).
- **Lưu:** `SalesOrder.ProductionFactoryCode NVARCHAR(400)` là danh sách mã nhà máy dạng chuẩn (bỏ khoảng trắng quanh dấu phẩy, bỏ trùng, `platform/catalog/factory-list.ts`); `IsFactoryFromOsm` = 1 khi theo OSM (`MES_Order/0007`). Mã nhà máy (`SysProductionFactory.Code`) là tên theo OSM: `NVARCHAR(100)`, không dấu phẩy, không khoảng trắng đầu cuối (`MES_Core/0008`).
- **Danh mục:** sau mỗi lần chép nguồn OSM, tên nhà máy chưa có trong danh mục Nhà máy SX tự thêm (mã = tên = tên OSM, chưa gắn ĐVCS, nhật ký `FACTORY_IMPORT`). Quản trị gắn ĐVCS, tích cho người dùng. Không đổi, không tắt nhà máy đã có. Các mục tạo tay trước đây (A01 "Nhà máy VSN-ĐN"…) giữ nguyên, quản trị tự quyết tắt.
- **Cập nhật Nhà máy SX (`OsmFactoryService`):** sau mỗi đợt đồng bộ có chép nguồn OSM hoặc sản phẩm BRAVO, và lúc khởi động; chạy cả khi `BRAVO_ORDER_IMPORT=false`. Đơn nạp từ BRAVO có trong OSM nhận danh sách theo OSM, khóa sửa tay; đơn trước đó theo OSM mà nay OSM không còn thì mở khóa, giữ giá trị; đơn chưa có trong OSM giữ nhà máy người dùng chọn. Chưa đồng bộ OSM (bảng chép trống) thì không làm gì. Dùng chung khóa ứng dụng với bước nạp đơn hàng; nhật ký `OSM_FACTORY_IMPORT`. Đơn mới (nạp tăng dần, `load:bravo`) nhận nhà máy theo OSM ngay khi thêm, thay giả định "cùng mã chi nhánh nhận đơn" trước đây.
- **Phân quyền Chọn mã hàng (`BaseRepository.assigned`):** đơn hiện ra khi có ít nhất một mã trong danh sách trùng nhà máy SX được tích cho người dùng (`STRING_SPLIT`; từ mục 11: nhà máy thuộc ĐVCS đăng nhập). Danh sách nhà máy vẫn lấy từ quyền của phiên, không từ client.
- **Thông tin đơn hàng:** đơn theo OSM: ô Nhà máy SX chỉ xem, ghi "Lấy theo OSM"; máy chủ từ chối đổi (409). Đơn chưa có trong OSM: chọn một nhà máy đang dùng của danh mục.
- **Giá trị đoán cũ:** `MES_Order/0007` bỏ Nhà máy SX đoán theo mã chi nhánh nhận đơn (cách nạp trước mục này) ở đơn nạp từ BRAVO chưa ai sửa (`ModifiedBy` trống, `ProductionFactoryCode = BranchCode`); đơn có trong OSM nhận lại nhà máy ở lần cập nhật theo OSM, đơn không có thì để trống cho người dùng chọn (review M2).
- **Máy demo:** `load:bravo` trên máy chưa có dữ liệu OSM giữ giả định cũ (nhà máy cùng mã chi nhánh, không khóa) để tài khoản mẫu thấy đơn ở Chọn mã hàng; `reset:demo` không tắt nhà máy do OSM tự thêm (review M3). Máy không khai `DB_OSM_NAME`: migrate tắt nguồn OSM (không báo đỏ khi "Đồng bộ tất cả").
- **Bật, tắt:** `OSM_FACTORY_UPDATE` (mặc định bật; test tắt). Danh sách nhà máy theo OSM dài quá 400 ký tự: không ghi vào đơn (để trống), ghi log; tên nhà máy dài quá 100 ký tự không vào danh mục.
- **Số PO:** `SalesOrderPo.PoNumber NVARCHAR(192)` (`MES_Order/0007`, người dùng yêu cầu cùng ngày); nhập tay được chữ tiếng Việt, tối đa 192 ký tự. 0007 sửa "(tr?ng)" của PO không có số đã nạp. Bảng chép BRAVO vẫn giữ `CustomerPONo VARCHAR(32)` theo view nguồn.

### 10. Màn Phân bổ PO theo OSM (bổ sung 12/10/2026, task 5.9.12)
Người dùng yêu cầu 12/10/2026: màn "Phân bổ PO" trong Quản trị đơn hàng, ngay sau Thông tin đơn hàng, lấy dữ liệu từ view gốc OSM `DB_OSM_TRE.NTB_DB.dbo.v_OSMData` (`DB_OSM_TRE` là linked server), đủ thông tin đơn hàng và nhà máy. Chốt (AskUserQuestion): **chép vào `MES_Sync`** qua lớp đồng bộ như mục 9 (không đọc thẳng OSM mỗi lần mở màn); màn hiện **đủ 11 cột của view cộng Đơn vị cơ sở** của nhà máy.

- **Dữ liệu (đo trên máy chủ):** khoảng 30.000 dòng, khoảng 1/6 trùng nguyên dòng, không cột thời gian, không khóa. `FtyName` một nhà máy mỗi dòng (25 tên, có dòng trống). Đọc hết qua linked server khoảng 0,8 giây.
- **Đồng bộ:** nguồn `OSM.OSMData` (`MES_Sync/0007`, sinh bởi `sync-gen`), chép toàn bộ mỗi lần theo nhóm `PO` vào `osm.OSMData`. View nằm ở database khác `vOSMDataFty`: thêm `DB_OSM_APP_NAME`, `DB_OSM_APP_SERVER` (máy chủ: `NTB_DB`, `DB_OSM_TRE`). Database nguồn khai một chỗ ở `backend/scripts/source-databases.ts` (migrate tạo synonym, `sync-gen` đọc cột qua linked server). Không có lịch tự chạy: màn hiện thời điểm chép gần nhất.
- **Đọc:** module Đơn hàng gọi `SourceFeedService.osmPo*`; câu đọc ở lớp đồng bộ (`platform/sync/osm-po-source.ts`), không đi qua `BaseRepository` (ADR 0007: `MES_Sync` không theo nhà máy). Bỏ dòng trùng (`DISTINCT`), phân trang ổn định theo mọi cột. Lọc theo cột, popup giá trị (ADR 0011) chạy trong `MES_Sync`.
- **Đơn vị cơ sở:** ĐVCS của nhà máy theo danh mục Nhà máy SX (`SysProductionFactory.BranchCode`, mã nhà máy là tên OSM). Hai database khác nhau nên module truyền bảng tra mã → ĐVCS (vài chục nhà máy) vào câu đọc, so theo collation của cột như danh mục. Nhà máy chưa gắn ĐVCS, chưa vào danh mục, dòng không có nhà máy: ĐVCS trống. Lúc chốt (máy chủ 12/10/2026) mọi tên nhà máy của view đã có trong danh mục (`vOSMDataFty` gom từ chính view này), 12/30 nhà máy đã gắn ĐVCS. `FtyName` một nhà máy mỗi dòng; nếu sau này có dòng là danh sách thì ĐVCS của dòng đó trống.
- **ĐVCS theo chính sách cột của Nhà máy SX** (review lượt 6 M2): ĐVCS suy ra từ nhà máy nên lấy mức chặt hơn của hai cột. Nhà máy SX bị Ẩn thì không có ĐVCS (lưới bỏ cột, file xuất bỏ cột); bị Che thì ĐVCS cũng che. Cả hai trường hợp không lọc, sắp xếp, hỏi giá trị theo ĐVCS được.
- **Phân quyền:** tài nguyên `order.poallocation` (`SHARED`, chỉ Xem, Xuất file; ma trận như Thông tin đơn hàng trừ quyền ghi). 12 cột đăng ký cho Chính sách cột; lọc, tìm, sắp xếp, gợi ý Brand/Season bỏ cột bị Ẩn/Che.
- **Thứ tự mặc định:** OSM không có ngày tạo nên ngoại lệ của ADR 0011: ETD-REVISED mới nhất lên trước, 100 dòng mỗi trang. Cột đó bị Ẩn/Che thì theo cột mặc định kế tiếp xem được; thứ tự phụ chỉ theo cột xem được (review lượt 6 M1). Xuất file tối đa 50.000 dòng (cả bảng sau khi bỏ trùng vẫn xuất được), quá thì báo lọc bớt.

### 11. Chọn mã hàng theo ĐVCS đăng nhập, Tỷ lệ cắt theo kế hoạch của ĐVCS (bổ sung 12/10/2026, task 5.9.13)
Người dùng yêu cầu 12/10/2026:
1. popup Chọn mã hàng lọc theo nhà máy thuộc ĐVCS đang đăng nhập, theo danh mục Nhà máy SX;
2. màn Cập nhật tỷ lệ cắt chỉ hiện PO đã được lên kế hoạch.

Chốt (AskUserQuestion):
- **mọi nhà máy thuộc ĐVCS**, bỏ tích nhà máy theo người (thay mục 3);
- "được lên kế hoạch" là có trong **kế hoạch xuất hàng của ĐVCS đang đăng nhập**;
- **PO nhập tay vẫn hiện**.

**Chọn mã hàng**
- `UserAccess.productionFactories` là các nhà máy đang dùng có `BranchCode` = ĐVCS của phiên. Đơn vị tổng hợp: mọi nhà máy đã gắn ĐVCS (chỉ đọc).
- `BaseRepository.assigned` lọc danh sách như mục 9. Đơn có nhà máy ở hai ĐVCS (danh sách OSM) hiện ở cả hai ĐVCS. Đơn chỉ có nhà máy chưa gắn ĐVCS thì không hiện ở ĐVCS nào.
- Thêm nhà máy, đổi ĐVCS hay bật, tắt nhà máy ở danh mục làm tăng phiên bản quyền: có hiệu lực ngay, không cần đăng nhập lại.
- Các thao tác đó đổi phạm vi dữ liệu nên cần thêm quyền `admin.permission:update` (như chuyển chuyền sang xưởng khác). Chỉ có `admin.catalog:update` thì vẫn sửa được tên, mô tả, thứ tự (review 5.9.13 M2).

**Bỏ tích nhà máy theo người**
- Màn Người dùng bỏ cột và phần tích Nhà máy SX. Hộp gán ĐVCS ghi các nhà máy của từng đơn vị.
- API bỏ `productionFactoryIds` (client cũ gửi lên thì bị bỏ qua) và `GET /admin/users/production-factories`. Seed không gán nhà máy cho tài khoản mẫu.
- Bảng `SysUserProductionFactory` giữ nguyên, không đọc nữa. Xóa bảng bằng migration sau khi người dùng chốt.

**Cập nhật tỷ lệ cắt**
- Danh sách mã hàng, lưới PO, popup lọc theo cột và file xuất chỉ có:
  - PO nằm trong kế hoạch xuất hàng của ĐVCS đang đăng nhập (`ShipmentPlanPo.BranchCode`);
  - PO nhập tay ở ĐVCS này: `CreatedBy` có giá trị, `BranchCode` = ĐVCS. PO nạp từ BRAVO để trống `CreatedBy`.
- Đơn vị tổng hợp: PO trong kế hoạch của mọi ĐVCS, cộng mọi PO nhập tay.
- `BaseRepository.inUseHere` dựng điều kiện từ khai báo `usedBy` của repository. Đây là lọc của màn, không phải phân quyền: PO vẫn đọc được ở màn khác, ví dụ chọn PO trong popup Chọn mã hàng.

**Quyền ghi PO (sửa mục 4)**
- Đo trên máy chủ 12/10/2026: 1.111/2.874 đơn có Nhà máy SX thuộc ĐVCS khác ĐVCS nhận đơn (ví dụ 772 đơn của A01 may ở VIET DUC thuộc A02). ĐVCS lập kế hoạch phải sửa được tỷ lệ cắt của PO trong kế hoạch của mình.
- `BaseRepository` thêm khai báo `usedBy` cho bảng `originBranch`. Ghi (sửa, xóa, ghi dòng con) được ở ĐVCS nguồn **hoặc** ở ĐVCS có dòng trỏ tới; với PO là `ShipmentPlanPo` của ĐVCS đó.
- Hai ĐVCS cùng đưa một PO vào kế hoạch thì cả hai sửa được. ĐVCS nguồn vẫn sửa được. Sửa màu cỡ, xác nhận, hủy xác nhận khóa dòng PO tới hết lần ghi rồi mới đọc trạng thái, nên hai ĐVCS thao tác cùng lúc phải lần lượt (review 5.9.13 M1).
- Đơn hàng (kể cả Nhà máy SX) giữ quy tắc mục 4.

**Thêm PO tay**
- Chỉ thêm cho mã hàng đang có PO trên màn ở ĐVCS này: PO trong kế hoạch của ĐVCS, hoặc PO tay đã nhập ở đây. Thay quy tắc "chỉ ở ĐVCS của đơn"; bỏ `GetOptions.sameBranch`.
- PO mới mang ĐVCS của phiên. `MES_Order/0008` đổi khóa ngoại ghép PO → đơn hàng sang theo `Id` (màu cỡ giữ khóa ngoại ghép với PO) và thêm chỉ mục `ShipmentPlanPo (SalesOrderPoId, BranchCode)`.
- Danh sách mã hàng gom theo đơn, một dòng mỗi đơn; cột Chi nhánh lấy theo đơn hàng (Chi nhánh FOB). Repository của PO đọc `SalesOrder.BranchCode` bằng truy vấn con (`poOrderBranchExpr`): ngoại lệ có chủ đích với nguyên tắc "danh sách mã hàng dựng từ chính bảng PO", vì cột này không nhạy cảm, mọi ĐVCS xem được ở Thông tin đơn hàng; chính sách cột theo cột `branchCode` của `order.po` (review 5.9.13 L5).
- Bước nạp BRAVO (mục 8) không ghép PO BRAVO với PO tay của ĐVCS khác ĐVCS của đơn dù trùng số: PO BRAVO thuộc ĐVCS nhận đơn nên thêm PO mới, PO tay giữ nguyên (review 5.9.13 L4).

**Giao diện**
- Màn Tỷ lệ cắt bỏ khóa "PO của ĐVCS khác". Nút Xóa PO khóa sẵn khi PO đã vào kế hoạch (`inPlan` trong lưới PO).
- Popup Chọn mã hàng ghi các nhà máy của ĐVCS đang làm việc. ĐVCS chưa có nhà máy thì nhắc gắn ở Danh mục hệ thống.

**Hệ quả**
- Muốn lập kế hoạch cho nhà máy của ĐVCS khác thì người dùng phải được gán ĐVCS đó và đăng nhập vào.
- PO BRAVO chưa vào kế hoạch nào không hiện ở màn Tỷ lệ cắt (trước 5.9.13 màn hiện mọi PO).

## Mâu thuẫn với tài liệu đã có (đã báo người dùng)
- **CLAUDE.md mục 1b, 5:** "mã cấm sửa, tên sửa được". Từ ADR này, tên ĐVCS có trong BRAVO theo BRAVO, không sửa ở MES.
- **CLAUDE.md mục 4.5:** bảng nghiệp vụ theo nhà máy bắt buộc có `BranchCode`. Đơn hàng, PO nay `SHARED` nhưng vẫn giữ `BranchCode` làm ĐVCS nguồn (`originBranch`).
- **CLAUDE.md mục 7:** "AI chỉ tạo migration, không chạy lên DB dùng chung". Ngày 11/10/2026 người dùng cho AI thao tác trực tiếp trên database của máy chủ (dữ liệu demo, chưa chạy thật) bằng tài khoản người dùng tự điền vào `backend/.env`.
- **ADR 0006:** module Đơn hàng lọc theo nhà máy. Đơn hàng, PO nay dùng chung.

## Hệ quả, việc còn lại
- Đơn của ĐVCS mới (thêm sau, hoặc vừa bật lại) tự vào ở đợt đồng bộ kế tiếp (mục 8), không cần chạy lại `load:bravo`.
- Đơn từ BRAVO chưa có Nhà máy SX (OSM chưa có). Phải chọn ở Thông tin đơn hàng thì ĐVCS của nhà máy đó mới lập được kế hoạch (mục 11). Nếu BA chốt BRAVO có cột nhà máy sản xuất thì ánh xạ ở 5.2.8.
- Bước nạp tăng dần (mục 8) dùng giả định tạm của `db-order.md` (mục "Nạp từ BRAVO"); BA chốt thì sửa ánh xạ ở `bravo-order.mapping.ts` (5.2.8). Chưa xử lý đơn, PO bị xóa ở BRAVO.
- ~~Nạp tăng dần và `load:bravo` gán tạm Nhà máy SX cùng mã với chi nhánh nhận đơn~~: thay bằng Nhà máy SX theo OSM (mục 9). Đơn chưa có trong OSM (khoảng 46% lúc chốt) để trống tới khi người dùng chọn hoặc OSM có.
- ~~Cột `SalesOrderPo.PoNumber` là `VARCHAR`~~: đã đổi sang `NVARCHAR(192)` (mục 9). PO nhập tay trước 0007 có chữ tiếng Việt vẫn còn dấu "?" đã lưu.
- Máy dùng thật cài mới: seed gán cho admin `A00` cộng các ĐVCS mẫu `A01`–`A03` đang có (có `MES_Sync` lúc migrate thì là các mã đó chép từ BRAVO; không có thì chỉ `A00`). ĐVCS do backend chép về sau (sau đồng bộ, màn Quản trị) không tự gán, mà admin không tự gán cho mình được. Cần một quản trị viên thứ hai, hoặc quản trị CSDL gán (review 5.9 L4). Riêng ĐVCS, nhà máy SX do chính một lần `seed` tạo ra (ĐVCS mẫu trên máy demo, hoặc ĐVCS BRAVO lần seed đó chép về) được gán cho tài khoản mẫu đã có theo cấu hình mẫu, vì chưa ai kịp thu hồi (sửa 12/10/2026: máy demo cài theo `migrate` rồi `seed` trước đó admin không vào được A01–A03).
- Triển khai lên máy đang chạy:
  1. dừng backend cũ (code cũ đọc danh mục `PROD_FACTORY` mà 0007 đã ngừng);
  2. chạy `npm run migrate` **không tham số** (seed đi kèm đổi `order.allocation`, `order.po` sang `SHARED`, đổi tên menu, chép ĐVCS);
  3. build, chạy bản mới;
  4. (từ 5.9.10, 5.9.11) `npm run migrate` có `MES_Order/0006`, `0007`, `MES_Core/0008`, `MES_Sync/0005`, `0006`; `.env` có `DB_OSM_NAME`; máy dùng thật kiểm `.env` có `NODE_ENV=production` hoặc `SEED_SAMPLE_DATA=false` (hay đặt `BRAVO_ORDER_IMPORT=true`), rồi xem log khởi động có dòng "Nạp đơn hàng BRAVO tự động đang bật";
  5. (5.9.11) bấm Đồng bộ nguồn "Nhà máy sản xuất của đơn hàng (OSM)" (cùng sản phẩm BRAVO), rồi ở Danh mục hệ thống › Nhà máy SX gắn ĐVCS cho các nhà máy mới (từ 5.9.13 không còn tích nhà máy cho người dùng).
  6. (5.9.12) `.env` thêm `DB_OSM_APP_NAME=NTB_DB`, `DB_OSM_APP_SERVER=DB_OSM_TRE`; chạy `npm run migrate` không tham số (`MES_Sync/0007`, synonym tới `v_OSMData`, tài nguyên và menu Phân bổ PO, thứ tự menu); bấm Đồng bộ nguồn "Phân bổ PO theo nhà máy (OSM)". Thiếu biến thì migrate tắt nguồn, màn Phân bổ PO báo máy chủ chưa cấu hình.
  7. (5.9.13) chạy `npm run migrate` (`MES_Order/0008`) **trước** khi chạy bản mới, lúc không có bước nạp BRAVO đang chạy (migration khóa bảng PO; quá thời gian thì tự hủy, chạy lại được). Kiểm mỗi nhà máy SX đang dùng đã gắn đúng ĐVCS và người lập kế hoạch được gán đúng ĐVCS ở Quản trị › Người dùng.
