# Đồng bộ dữ liệu từ hệ thống ngoài (`MES_Sync`)

Lớp đồng bộ chép view của BRAVO (qua database trung gian) và OSM vào database `MES_Sync`, rồi các phần khác của MES đọc bảng chép đó. File này mô tả nguyên tắc, bảng và thủ tục của `MES_Sync`, cách migrate nối tới database nguồn, hàng đợi chạy trong backend, màn Quản trị › Đồng bộ dữ liệu, API `/admin/sync/*` và cách thêm nguồn bằng `sync-gen`.
Đọc khi: sửa hoặc thêm nguồn đồng bộ, xử lý lỗi đồng bộ trên máy chủ, hoặc viết code đọc dữ liệu chép từ BRAVO, OSM.

## Nguyên tắc

- **Chỉ đọc hệ thống ngoài** (ADR 0007). BRAVO: MES chỉ đọc **view của database trung gian** (`DB_TRUNGGIAN_NAME`), không đọc thẳng database BRAVO. OSM: chỉ đọc view của database OSM (`DB_OSM_NAME`, `DB_OSM_APP_NAME`). Không ghi, không xóa gì bên nguồn.
- Thủ tục chép chỉ đọc view qua **synonym** (`bravo.src_<Bảng>`, `osm.src_<Bảng>`). Synonym do `npm run migrate` tạo lại theo `.env`, nên đổi tên database nguồn hoặc chuyển sang linked server chỉ cần sửa `.env` rồi migrate, không sửa thủ tục.
- Database nguồn ở máy SQL Server khác thì đi qua **linked server** (tùy chọn, biến `..._SERVER`); synonym thành tên 4 phần `[server].[database].[dbo].[view]`.
- Dữ liệu chép nằm ở **`MES_Sync`**, dùng chung toàn công ty: không có `BranchCode`, không đi qua `BaseRepository`. Quyền được kiểm ở API của màn Đồng bộ (`admin.sync`) và ở API của từng màn đọc dữ liệu chép.
- **Module nghiệp vụ không đọc `MES_Sync` trực tiếp**: lấy dữ liệu nghiệp vụ qua `SourceFeedService` (`backend/src/platform/feed`), tên và danh mục qua `CatalogLookupService`. Lint chặn module `order`, `sewing`, `hr` import `platform/sync/*` (mẫu `NO_SYNC` gắn vào luật của từng module trong `backend/eslint.config.mjs`; thêm module mới phải gắn thêm).
- Mỗi hệ thống nguồn một schema: `bravo`, `osm`. Bảng điều khiển và thủ tục điều phối ở `dbo`.
- Bảng chép **giữ nguyên tên, kiểu và collation cột của view**, tên bảng là tên view bỏ tiền tố `v`/`v_` (`vDM_SanPhamDonHang` → `bravo.DM_SanPhamDonHang`, `v_OSMData` → `osm.OSMData`). Đây là ngoại lệ có chủ đích với quy ước đặt tên của dự án, chỉ áp cho bảng chép (ADR 0007).
- Bảng chép, thủ tục chép và dòng `SyncSource` **sinh tự động** bằng `backend/scripts/sync-gen.ts` từ cấu trúc view thật. Không sửa tay migration sinh ra.
- **Không có lịch tự chạy.** Đồng bộ chỉ chạy khi người có quyền bấm ở màn Đồng bộ dữ liệu; backend khởi động thì chạy tiếp các lần còn trong hàng đợi.
- Tên biến `DB_TRUNGGIAN_NAME` là tiếng Việt không dấu, giữ nguyên để khớp `.env` đã có (ngoại lệ quy ước định danh, ADR 0007).

## Luồng tổng thể

```
View nguồn: database trung gian BRAVO (DB_TRUNGGIAN_NAME) / database OSM (DB_OSM_NAME, DB_OSM_APP_NAME)
   │   (qua linked server nếu khác máy SQL Server)
   ▼  synonym bravo.src_<Bảng>, osm.src_<Bảng>          ← npm run migrate tạo lại theo .env
<schema>.usp_Sync_<Bảng>  ← dbo.usp_SyncRun_Execute  ← hàng đợi dbo.SyncRun  ← POST /api/v1/admin/sync/start
   │                                                                              (màn Quản trị › Đồng bộ dữ liệu)
   ▼
Bảng chép bravo.<Bảng>, osm.<Bảng> trong MES_Sync
   │
   ├─ SyncService (chỉ đọc) → AdminBranchesService, CatalogLookupService, CatalogService   (MES_Core)
   └─ SourceFeedService (chỉ đọc) → BravoOrderImportService, OsmFactoryService, PoAllocationRefreshService (ghi MES_Order),
                                     PoAllocationService (màn Phân bổ PO hỏi nguồn có bật)
```

## Database nguồn

Khai một chỗ ở `backend/scripts/source-databases.ts` (`SOURCE_DATABASES`). Cả `migrate.ts` (tạo synonym) và `sync-gen.ts` (đọc cấu trúc view) dùng danh sách này.

| Hệ thống (`SystemCode`) | Database | Linked server | View đọc ở đây | Thiếu biến thì |
|---|---|---|---|---|
| `BRAVO` | `DB_TRUNGGIAN_NAME` | `DB_TRUNGGIAN_SERVER` | mọi view BRAVO | migrate cảnh báo, không tạo synonym; nguồn vẫn bật và báo lỗi khi chạy |
| `OSM` | `DB_OSM_APP_NAME` | `DB_OSM_APP_SERVER` | chỉ `v_OSMData` | migrate **tắt** nguồn (`IsActive = 0`): không hiện ở màn Đồng bộ, không báo lỗi khi "Đồng bộ tất cả" |
| `OSM` | `DB_OSM_NAME` | `DB_OSM_SERVER` | mọi view OSM còn lại (`vOSMDataFty`) | như trên |

Một view thuộc database nào: `sourceDatabaseOf(system, view)` chọn mục có `views` chứa tên view (so không phân biệt hoa thường), không có thì mục không khai `views` của hệ thống đó.

### Biến môi trường

Chỉ nêu tác dụng với đồng bộ; bảng đầy đủ ở [Vận hành](11-van-hanh.md). Cấu hình đọc ở `backend/src/config/env.ts`.

| Biến | Tác dụng |
|---|---|
| `DB_SYNC_NAME` | Tên database chứa bảng chép và nhật ký đồng bộ, mặc định `MES_Sync` |
| `DB_TRUNGGIAN_NAME` | Database trung gian chứa view BRAVO. Trống: không tạo synonym BRAVO |
| `DB_TRUNGGIAN_SERVER` | Tên linked server tới máy chứa database trung gian; cùng máy thì để trống |
| `DB_OSM_NAME`, `DB_OSM_SERVER` | Database OSM chứa `vOSMDataFty` và linked server tới nó. Trống: tắt nguồn `OSM.OSMDataFty` |
| `DB_OSM_APP_NAME`, `DB_OSM_APP_SERVER` | Database ứng dụng OSM chứa `v_OSMData` và linked server tới nó. Trống: tắt nguồn `OSM.OSMData` |
| `BRAVO_ORDER_IMPORT` | Bật, tắt việc nạp tăng dần đơn hàng sau đồng bộ (mặc định bật khi không dùng dữ liệu mẫu) |
| `OSM_FACTORY_UPDATE` | Bật, tắt việc cập nhật Nhà máy SX của đơn hàng theo OSM sau đồng bộ (mặc định bật) |
| `PO_ALLOCATION_REFRESH`, `PO_ALLOCATION_MAX_SHRINK_PERCENT` | Bật, tắt việc làm mới bảng Phân bổ PO sau đồng bộ nguồn `OSM.OSMData` (mặc định bật); ngưỡng giảm nguồn của bước đó (mặc định 20) |

Tên database và linked server phải đúng dạng (`assertSourceNames`): database chỉ gồm chữ, số, `_`, `-`; linked server thêm được `.` và `\` (dạng `MAY\INSTANCE`). Sai dạng thì migrate và `sync-gen` dừng.

### Migrate tạo synonym, bật/tắt nguồn

`backend/scripts/migrate.ts`, hàm `linkSyncSources` → `linkSourceDatabase`, chạy **sau mỗi lần migrate `MES_Sync`** (kể cả khi không có migration mới; `npm run migrate` hoặc `npm run migrate -- MES_Sync`). Với từng mục của `SOURCE_DATABASES`:

1. Lấy các dòng `SyncSource` cùng `SystemCode` có view thuộc database này, kèm đích hiện tại của synonym (`sys.synonyms.base_object_name`).
2. Có tên database thì kiểm dạng tên. Mục `optional` (OSM): đặt `IsActive = 1` nếu có tên, `0` nếu không, rồi dừng nếu không có tên. Mục BRAVO thiếu tên: in cảnh báo rồi dừng.
3. Có linked server thì kiểm `sys.servers` (`is_linked = 1`, `is_data_access_enabled = 1`); không thấy thì cảnh báo nhưng vẫn tạo synonym (`CREATE SYNONYM` không kiểm đích, đồng bộ sẽ lỗi lúc chạy).
4. Đích mới là `[server].[database].[dbo].[view]` hoặc `[database].[dbo].[view]`. Synonym đã trỏ đúng thì bỏ qua; khác thì `DROP SYNONYM` rồi `CREATE SYNONYM` trong một transaction (lượt đồng bộ chạy cùng lúc không thấy synonym bị thiếu).

`ensureDatabase` thử tạo `MES_Sync` nếu chưa có; tài khoản trong `.env` không có quyền tạo database thì báo nhờ quản trị CSDL tạo và cấp `db_owner`. Tài khoản ứng dụng còn cần quyền đọc các view nguồn (và quyền mà view cần bên database nguồn, xem [Lỗi hay gặp](#lỗi-hay-gặp)).

## Các nguồn đang có

20 nguồn: 18 BRAVO (`MES_Sync/0002`), 2 OSM (`0005`, `0007`). Thứ tự hiển thị là `SortOrder`.

| `SortOrder` | Mã nguồn (`Code`) | View | Bảng chép | Nhóm | Khớp | Khóa / cột nhóm | Cách lấy | Số cột dữ liệu | Ghi chú |
|---|---|---|---|---|---|---|---|---|---|
| 10 | `BRAVO.DM_CHINHANH` | `vDM_CHINHANH` | `bravo.DM_CHINHANH` | `CATALOG` | KEY | `BranchCode` | Toàn bộ | 10 | View không có cột thời gian. Mỗi dòng là một ĐVCS (ADR 0013) |
| 20 | `BRAVO.DM_KHACHHANG` | `vDM_KHACHHANG` | `bravo.DM_KHACHHANG` | `CATALOG` | KEY | `CustomerId` | Tăng dần | 12 | |
| 30 | `BRAVO.DM_MuaKinhDoanh` | `vDM_MuaKinhDoanh` | `bravo.DM_MuaKinhDoanh` | `CATALOG` | KEY | `SalesSeasonId` | Tăng dần | 7 | |
| 40 | `BRAVO.DM_MauSac` | `vDM_MauSac` | `bravo.DM_MauSac` | `CATALOG` | KEY | `ColorId` | Tăng dần | 7 | |
| 50 | `BRAVO.DM_Size` | `vDM_Size` | `bravo.DM_Size` | `CATALOG` | KEY | `SizeId` | Toàn bộ | 7 | `CreatedAt`/`ModifiedAt` của view luôn là 01/01/1900, không dùng làm mốc được |
| 60 | `BRAVO.DM_NHANVIEN` | `vDM_NHANVIEN` | `bravo.DM_NHANVIEN` | `CATALOG` | KEY | `EmployeeId` | Tăng dần | 11 | |
| 70 | `BRAVO.DM_TEAM` | `vDM_TEAM` | `bravo.DM_TEAM` | `CATALOG` | KEY | `TeamId` | Tăng dần | 11 | |
| 80 | `BRAVO.DM_NGUOISUDUNG` | `vDM_NGUOISUDUNG` | `bravo.DM_NGUOISUDUNG` | `CATALOG` | KEY | `UserId` | Tăng dần | 12 | |
| 90 | `BRAVO.DM_LOOKUP` | `vDM_LOOKUP` | `bravo.DM_LOOKUP` | `CATALOG` | KEY | `ParentCode, Code` | Tăng dần | 8 | |
| 100 | `BRAVO.DM_DiaDiemGiaoHang` | `vDM_DiaDiemGiaoHang` | `bravo.DM_DiaDiemGiaoHang` | `CATALOG` | KEY | `DestinationId` | Tăng dần | 12 | |
| 110 | `BRAVO.DM_QuocGia` | `vDM_QuocGia` | `bravo.DM_QuocGia` | `CATALOG` | KEY | `RowId_Nationality` | Tăng dần | 8 | |
| 120 | `BRAVO.DM_PhuongThucGiaoHang` | `vDM_PhuongThucGiaoHang` | `bravo.DM_PhuongThucGiaoHang` | `CATALOG` | KEY | `Id` | Toàn bộ | 4 | View không có cột thời gian |
| 130 | `BRAVO.DM_SanPhamDonHang` | `vDM_SanPhamDonHang` | `bravo.DM_SanPhamDonHang` | `ORDER` | KEY | `ProductId` | Tăng dần | 36 | Mỗi sản phẩm là một đơn hàng MES |
| 140 | `BRAVO.DM_POKH` | `vDM_POKH` | `bravo.DM_POKH` | `ORDER` | KEY | `CustomerPOId` | Tăng dần | 12 | |
| 150 | `BRAVO.ThongTinPO` | `vThongTinPO` | `bravo.ThongTinPO` | `ORDER` | PARTITION | `ProductId` | Tăng dần | 21 | Thay cả nhóm dòng của sản phẩm có thay đổi |
| 160 | `BRAVO.ThongTinPO_MauCo` | `vThongTinPO_MauCo` | `bravo.ThongTinPO_MauCo` | `ORDER` | PARTITION | `ProductId, CustomerPONo` | Tăng dần | 14 | Thay cả nhóm dòng của PO có thay đổi |
| 170 | `BRAVO.BangCanDoiSanXuat` | `vBangCanDoiSanXuat` | `bravo.BangCanDoiSanXuat` | `ORDER` | KEY | `ProduceId` | Tăng dần | 14 | |
| 180 | `BRAVO.BangCanDoiSanXuat_MauCo_Tong` | `vBangCanDoiSanXuat_MauCo_Tong` | `bravo.BangCanDoiSanXuat_MauCo_Tong` | `ORDER` | PARTITION | `ProduceId` | Tăng dần | 16 | Thay cả nhóm dòng của bảng cân đối có thay đổi |
| 190 | `OSM.OSMDataFty` | `vOSMDataFty` | `osm.OSMDataFty` | `ORDER` | PARTITION | `SO` | Toàn bộ | 5 | Không có cột thời gian; có dòng trùng nguyên dòng. `FtyName` là danh sách nhà máy cách nhau dấu phẩy |
| 200 | `OSM.OSMData` | `v_OSMData` | `osm.OSMData` | `ORDER` | PARTITION | `PO` | Toàn bộ | 11 | Không có cột thời gian; có dòng trùng nguyên dòng. Bước làm mới Phân bổ PO chép bảng này sang `MES_Order.PoAllocation` |

- **Cách lấy** là `SyncSource.SyncModeCode`: `INCREMENTAL` (Tăng dần) hoặc `FULL` (Toàn bộ mỗi lần). Mọi nguồn tăng dần dùng hai cột `ModifiedAt` và `CreatedAt` của view làm mốc; kiểu `SMALLDATETIME`, riêng `DM_MuaKinhDoanh`, `DM_POKH` là `DATETIME`.
- **Khớp** (`match` trong `sync-gen.ts`, không lưu trong DB): KEY là có khóa duy nhất (đã kiểm trên dữ liệu thật), cập nhật từng dòng; PARTITION là không có khóa tin được (view tổng hợp, dòng trùng nguyên dòng), thay cả nhóm dòng theo cột nhóm.
- **Nhóm** (`GroupCode`): `CATALOG` hiện thêm ở màn Danh mục hệ thống (chỉ xem); `ORDER` chỉ ở màn Đồng bộ.
- Số cột dữ liệu không tính các cột kỹ thuật bên dưới.
- Bảng chép chưa có code nào đọc (ngoài màn xem danh mục): `DM_Size`, `DM_TEAM`, `DM_NGUOISUDUNG`, `DM_LOOKUP`, `DM_PhuongThucGiaoHang` (xem được ở Danh mục hệ thống), `DM_POKH`, `BangCanDoiSanXuat`, `BangCanDoiSanXuat_MauCo_Tong`.

### Cột của bảng chép

Cột dữ liệu: tên, kiểu, collation như view nguồn (hiện mọi cột chuỗi là `SQL_Latin1_General_CP1_CI_AS`). Kiểu chi tiết từng cột tra ở câu `CREATE TABLE` trong `backend/migrations/MES_Sync/0002_bravo_order_sources.sql` (BRAVO), `0005_osm_factory_source.sql`, `0007_osm_po_allocation.sql` (OSM); không migration nào sau đó đổi bảng chép.

Cột kỹ thuật và khóa:

| Cột / ràng buộc | Kiểu | Có ở | Ghi chú |
|---|---|---|---|
| Cột khóa | như view, `NOT NULL` | KEY | `PK_<Bảng>` trên cột khóa. Cột khác đều `NULL` |
| `SyncRowId` | `BIGINT IDENTITY` `NOT NULL` | PARTITION | `PK_<Bảng>`. Cộng chỉ mục `IX_<Bảng>_Partition` trên cột nhóm; mọi cột dữ liệu `NULL` |
| `SyncedAt` | `DATETIME2(3)` `NOT NULL` | mọi bảng | Lần cuối dòng được ghi, giờ UTC |
| `SyncRunId` | `BIGINT` `NULL` | mọi bảng | `SyncRun.Id` của lần ghi dòng đó (không có FK) |

Không dùng `SyncRowId` hay `SyncedAt` để nhận biết dòng đổi: nguồn PARTITION xóa rồi chèn lại cả nhóm nên hai cột này đổi kể cả khi nội dung giữ nguyên. Đọc bảng chép theo khóa nguồn (`KeyColumns`).

Cột dữ liệu của bảng BRAVO (thứ tự như bảng):

| Bảng | Cột |
|---|---|
| `DM_CHINHANH` | `MaChiNhanh`, `TenChiNhanh`, `BranchCode`, `TenDayDu`, `TenDayDu_TA`, `DiaChi`, `DiaChi_TA`, `TaxCode`, `Tel`, `Fax` |
| `DM_KHACHHANG` | `MaKhachHang`, `TenTat`, `CustomerId`, `MaKhachHang_Bravo`, `TenTat_OSM`, `NgungSuDung_KD`, `CustomerTypeList`, `BranchCode_GC`, `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` |
| `DM_MuaKinhDoanh` | `SalesSeasonId`, `Code`, `Name`, `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` |
| `DM_MauSac` | `ColorId`, `Code`, `Name`, `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` |
| `DM_Size` | `SizeId`, `Code`, `Name`, `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` |
| `DM_NHANVIEN` | `EmployeeId`, `Code`, `Name`, `Name2`, `ShortName`, `DeptId`, `FileNo`, `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` |
| `DM_TEAM` | `TeamId`, `Code`, `Name`, `Name2`, `EmployeeId`, `TeamType`, `CustomerIdList`, `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` |
| `DM_NGUOISUDUNG` | `UserId`, `UserName`, `FullName`, `EmployeeId`, `DeptId`, `CustomerIdList`, `TeamId`, `TeamId_List`, `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` |
| `DM_LOOKUP` | `Code`, `Name`, `ParentCode`, `ParentLinkCode`, `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` |
| `DM_DiaDiemGiaoHang` | `DestinationId`, `Code`, `Name`, `BuyerName`, `Address`, `BillingAddress`, `CustomerId`, `RowId_Nationality`, `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` (`Address`, `BillingAddress` là `NVARCHAR(192)`) |
| `DM_QuocGia` | `RowId_Nationality`, `Code`, `Name`, `Name2`, `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` |
| `DM_PhuongThucGiaoHang` | `PhuongThucGH`, `TenTatPhuongThucGH`, `ParentCode`, `Id` |
| `DM_SanPhamDonHang` | `ProductId`, `BranchCode`, `Code` (số SO), `Name`, `Description_DetailSO`, `Unit`, `TotalQuantity_SO`, `BizDocId`, `ItemId`, `CustomerId`, `EmployeeId`, `TeamId`, `TeamId_Pattern`, `DeptId`, `Description`, `SalesSeasonId`, `SalesOrderQuantityTypeCode`, `ProductionTypeCode`, `TypeSOCode`, `StyleName` (mã hàng), `StyleName_OSM`, `ItemClassCode`, `Items_OSMCode`, `Gender_OSMCode`, `Function_OSMCode`, `CustomerPONoList`, `CustomerPOIdList`, `EndDatePrice`, `ProductId_GC`, `BizDocId_PO_GC`, `BizDocId_SO`, `Brand`, `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` |
| `DM_POKH` | `CustomerPOId`, `BranchCode`, `BizDocId`, `CustomerPONo`, `DocDate`, `Description`, `OriginalCustomerPONo`, `POType`, `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` |
| `ThongTinPO` | `BranchCode`, `BizDocId`, `ItemId`, `ProductId`, `CustomerPONo`, `CustomerPOId`, `CustomerPOType`, `CustomerPONoDate`, `DestinationId`, `RowId_Nationality`, `ShipViaCode`, `EstSyncMaterialDate`, `EstimatedTimeDelivery`, `EstimatedTimeDelivery_Original`, `RowIdList_SO`, `Quantity9`, `Description`, `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` |
| `ThongTinPO_MauCo` | `ProductId`, `CustomerPONo`, `RowIdList_SO`, `ColorId`, `SizeIndex`, `SizeCode`, `SizeType`, `Color_Stt`, `Size_Stt`, `Quantity`, `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` |
| `BangCanDoiSanXuat` | `BranchCode`, `ProduceId`, `DocNo`, `DocDate`, `CustomerId`, `BizDocId_SO`, `EmployeeId`, `TeamId`, `DeptId`, `Description`, `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` |
| `BangCanDoiSanXuat_MauCo_Tong` | `ProduceId`, `SizeIndex`, `Size_Stt`, `Color_Stt`, `ProductId`, `ColorId`, `SizeCode`, `SizeType`, `OriginalQty`, `SampleQty`, `ToleranceQty`, `FinalQty`, `CreatedAt`, `CreatedBy`, `ModifiedAt`, `ModifiedBy` |

Bảng OSM (đọc trực tiếp bởi màn hình nên ghi đủ kiểu; mọi cột `NULL`):

| Bảng | Cột | Kiểu | Ghi chú |
|---|---|---|---|
| `osm.OSMDataFty` | `Brand` | `NVARCHAR(50)` | |
| | `StyleName` | `NVARCHAR(59)` | |
| | `StyleNo` | `NVARCHAR(61)` | Mã hàng, ghép với `DM_SanPhamDonHang.StyleName` |
| | `SO` | `NVARCHAR(50)` | Cột nhóm; ghép với `DM_SanPhamDonHang.Code` |
| | `FtyName` | `NVARCHAR(4000)` | Danh sách nhà máy SX cách nhau dấu phẩy |
| `osm.OSMData` | `Brand`, `Season` | `NVARCHAR(50)` | |
| | `PO` | `NVARCHAR(51)` | Cột nhóm |
| | `SO` | `NVARCHAR(50)` | |
| | `Ship mode` | `NVARCHAR(50)` | Tên cột có dấu cách (giữ như view) |
| | `StyleName`, `StyleNo` | `NVARCHAR(59)`, `NVARCHAR(61)` | |
| | `Color` | `NVARCHAR(82)` | |
| | `ETD-Actual`, `ETD-REVISED` | `DATE` | Tên cột có dấu gạch ngang |
| | `FtyName` | `NVARCHAR(255)` | Một nhà máy mỗi dòng |

## Bảng điều khiển và thủ tục (schema `dbo`)

### `dbo.SyncSource`

Mỗi dòng là một view nguồn được chép sang một bảng. Dòng do migration ghi (`sync-gen`); backend chỉ đổi `LastRunId` (khi xếp hàng), thủ tục điều phối đổi `WatermarkAt`, migrate đổi `IsActive` của nguồn OSM. Không có màn hình sửa cấu hình.

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | không | `PK_SyncSource` |
| `Code` | `VARCHAR(60)` | không | `<SystemCode>.<Bảng>`, ví dụ `BRAVO.DM_SanPhamDonHang`. `UQ_SyncSource_Code` |
| `Name` | `NVARCHAR(200)` | không | Tên hiện trên màn hình |
| `Description` | `NVARCHAR(500)` | có | Ghi chú (vì sao chép toàn bộ, cách khớp…) |
| `SystemCode` | `VARCHAR(20)` | không | `BRAVO`, `OSM` (test dùng `TEST`) |
| `GroupCode` | `VARCHAR(20)` | không | `CATALOG`, `ORDER` |
| `SourceObject` | `NVARCHAR(128)` | không | Tên view bên database nguồn (schema `dbo`) |
| `SourceSynonym` | `NVARCHAR(128)` | không | `bravo.src_<Bảng>` / `osm.src_<Bảng>` |
| `TargetTable` | `NVARCHAR(128)` | không | `bravo.<Bảng>` / `osm.<Bảng>` |
| `ProcName` | `NVARCHAR(128)` | không | `bravo.usp_Sync_<Bảng>` / `osm.usp_Sync_<Bảng>` |
| `SyncModeCode` | `VARCHAR(20)` | không | `INCREMENTAL`, `FULL` (`CK_SyncSource_Mode`) |
| `KeyColumns` | `NVARCHAR(200)` | không | Cột khóa (KEY) hoặc cột nhóm (PARTITION), cách nhau `, ` |
| `OverlapMinutes` | `INT` | không | Mặc định 10. Số phút lùi mốc mỗi lần chép tăng dần. `CK_SyncSource_Overlap`: 1–1440 |
| `WatermarkAt` | `DATETIME2(0)` | có | Mốc dữ liệu: `ModifiedAt`/`CreatedAt` lớn nhất đã nhận, **theo giờ của nguồn** (không phải UTC). NULL: chưa có mốc, hoặc nguồn `FULL` |
| `LastRunId` | `BIGINT` | có | Lần chạy mới nhất (`FK_SyncSource_LastRun` → `SyncRun.Id`) |
| `SortOrder` | `INT` | không | Mặc định 0; `sync-gen` ghi (vị trí trong `SOURCES` + 1) × 10 |
| `IsActive` | `BIT` | không | Mặc định 1. Nguồn tắt không hiện, không chạy |
| `IsSystem` | `BIT` | không | Mặc định 1 |
| `CreatedAt` | `DATETIME2(3)` | không | Mặc định `SYSUTCDATETIME()` |
| `CreatedBy`, `ModifiedAt`, `ModifiedBy` | `INT`, `DATETIME2(3)`, `INT` | có | Dành cho thay đổi cấu hình; code hiện không ghi |

### `dbo.SyncRun`

Mỗi lần chép một nguồn. Một lần bấm tạo một dòng cho mỗi nguồn, cùng `BatchId`.

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `BIGINT IDENTITY` | không | `PK_SyncRun`. Backend nhận về dạng chuỗi |
| `SyncSourceId` | `INT` | không | `FK_SyncRun_SyncSource` |
| `BatchId` | `UNIQUEIDENTIFIER` | không | Gom các nguồn của cùng một lần bấm; cũng là `EntityId` trong nhật ký `SYNC_START` |
| `ModeCode` | `VARCHAR(20)` | không | Lúc xếp hàng là cách người dùng chọn; lúc chạy ghi lại cách thực tế (`FULL` khi không có mốc lọc). `CK_SyncRun_Mode` |
| `StatusCode` | `VARCHAR(20)` | không | `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED` (`CK_SyncRun_Status`) |
| `SinceAt` | `DATETIME2(0)` | có | Mốc lọc đã dùng (giờ của nguồn); NULL là lấy toàn bộ |
| `PrevWatermarkAt` | `DATETIME2(0)` | có | Mốc của nguồn lúc bắt đầu |
| `NewWatermarkAt` | `DATETIME2(0)` | có | Mốc sau khi chạy thành công |
| `ReadCount` | `INT` | có | Số dòng đọc vào bảng tạm `#src` |
| `InsertedCount`, `UpdatedCount`, `DeletedCount` | `INT` | có | Số dòng thêm, đổi, xóa. Nguồn PARTITION là số gần đúng |
| `TargetCount` | `INT` | có | Số dòng của bảng chép sau khi chạy |
| `QueuedAt` | `DATETIME2(3)` | không | Mặc định `SYSUTCDATETIME()` |
| `StartedAt`, `FinishedAt` | `DATETIME2(3)` | có | UTC |
| `ErrorMessage` | `NVARCHAR(2000)` | có | Lỗi kèm `[lỗi <số>, <thủ tục> dòng <n>]` |
| `CreatedAt` | `DATETIME2(3)` | không | Mặc định `SYSUTCDATETIME()` |
| `CreatedBy` | `INT` | có | Người bấm. Khóa ngầm tới `MES_Core.SysUser.Id` (`backend/migrations/softkeys.json`) |
| `ModifiedAt`, `ModifiedBy` | `DATETIME2(3)`, `INT` | có | `ModifiedAt` cập nhật khi đổi trạng thái |

Chỉ mục:

| Chỉ mục | Cột | Vì sao |
|---|---|---|
| `IX_SyncRun_SyncSourceId` | `(SyncSourceId, Id DESC)` | Lịch sử của một nguồn |
| `IX_SyncRun_BatchId` | `(BatchId)` | |
| `IX_SyncRun_CreatedBy` | `(CreatedBy)` | Khóa ngầm có chỉ mục |
| `UX_SyncRun_Active` | `UNIQUE (SyncSourceId) WHERE StatusCode IN ('QUEUED','RUNNING')` | Mỗi nguồn tối đa một lần đang chờ hoặc đang chạy: bấm hai lần không chép chồng |
| `IX_SyncRun_Succeeded` | `(SyncSourceId, Id) INCLUDE (ModeCode, FinishedAt, TargetCount) WHERE StatusCode = 'SUCCEEDED'` | Màn hình hỏi lần thành công gần nhất mỗi 2 giây khi đang chạy |

### Thủ tục

| Thủ tục | Migration đang hiệu lực | Việc |
|---|---|---|
| `dbo.usp_SyncRun_Execute @RunId` | `0006` (thay bản `0001`, chỉ thêm schema `osm`) | Chạy một lần đã xếp hàng |
| `dbo.usp_SyncRun_RecoverStale` | `0001` | Đánh dấu lỗi các lần "đang chạy" đã mồ côi |
| `bravo.usp_Sync_<Bảng>` | `0004` (thay `0002`, `0003`) | Chép một nguồn BRAVO |
| `osm.usp_Sync_<Bảng>` | `0005`, `0007` | Chép một nguồn OSM |

Lịch sử migration `MES_Sync`: `0001` bảng điều khiển và thủ tục điều phối; `0002` 18 nguồn BRAVO; `0003` sinh lại thủ tục chép (sửa lỗi 8155: biểu thức so theo byte trong bảng dẫn xuất chưa đặt tên cột, làm nguồn PARTITION luôn lỗi); `0004` sinh lại thủ tục chép (chặn khóa NULL và trùng ở bước đối soát, chốt xóa hàng loạt, ghi cả cột khóa); `0005` nguồn `OSM.OSMDataFty` và schema `osm`; `0006` cho `usp_SyncRun_Execute` chạy thủ tục schema `osm`; `0007` nguồn `OSM.OSMData`.

## Chép một nguồn

### Điều phối: `dbo.usp_SyncRun_Execute`

1. Đọc lần chạy `@RunId` đang `QUEUED` cùng nguồn của nó; không có thì thoát (lần đó đã được nơi khác nhận).
2. Giữ **khóa ứng dụng** `MES_Sync:<Code>` (`sp_getapplock`, `Exclusive`, chủ khóa là phiên, chờ tối đa 5 giây). Không giữ được thì ghi `FAILED` "Nguồn này đang được đồng bộ ở nơi khác…". Khóa giữ suốt lần chạy: tiến trình MES chết giữa chừng thì phiên SQL đóng, khóa tự nhả.
3. Nhận việc bằng `UPDATE … SET StatusCode = 'RUNNING' WHERE StatusCode = 'QUEUED'` (gọi nhiều lần, từ nhiều tiến trình cũng chỉ một nơi chạy).
4. Đọc mốc sau khi đã giữ khóa. `@Since` = NULL nếu lần chạy là `FULL`, nguồn là `FULL`, hoặc chưa có mốc; còn lại `WatermarkAt − OverlapMinutes`. Ghi `SinceAt`, `PrevWatermarkAt`, `ModeCode` thực tế.
5. Kiểm `ProcName`: đúng hai phần, schema thuộc `bravo` hoặc `osm`, thủ tục tồn tại; sai thì lỗi 50010 "Không tìm thấy thủ tục chép của nguồn này. Chạy npm run migrate."
6. Gọi thủ tục chép với `@SinceAt`, `@RunId`, nhận các số đếm và `@MaxStampAt`.
7. Tính mốc mới (mục dưới), rồi trong **một transaction** ghi `SyncSource.WatermarkAt` và đổi lần chạy sang `SUCCEEDED` kèm số đếm.
8. Lỗi bất kỳ (`CATCH`): rollback, ghi `FAILED` với thông báo, số lỗi, tên thủ tục, dòng; **giữ nguyên mốc** để lần sau đọc lại từ mốc cũ. Cuối cùng nhả khóa.

### Mốc dữ liệu

- Mốc là giờ của nguồn, lưu `DATETIME2(0)` không múi giờ; API trả dạng `YYYY-MM-DDTHH:mm:ss` không có `Z`, màn hình hiện nguyên giờ đó.
- Lần chép tăng dần lùi `OverlapMinutes` (mặc định 10 phút, tối thiểu 1) để không sót dòng ghi trễ hoặc bị làm tròn (`SMALLDATETIME` tròn phút, mốc `DATETIME2(0)` tròn giây). Dòng đọc lại mà không đổi thì không ghi, nên lùi mốc không tốn ghi.
- Mốc mới: nguồn `FULL` thì NULL; lần chạy không có mốc lọc thì lấy `@MaxStampAt`; chép tăng dần thì **không lùi mốc** (giữ mốc cũ nếu `@MaxStampAt` NULL hoặc nhỏ hơn). Mốc **không vượt giờ hiện tại** của SQL Server chứa `MES_Sync` (`SYSDATETIME()`), để một dòng ghi nhầm ngày tương lai không làm các lần sau bỏ sót dữ liệu.
- `@MaxStampAt` = giá trị lớn nhất của `ModifiedAt`, `CreatedAt` (ép `DATETIME2(0)`) trong các dòng đã đọc.

### Thủ tục chép `<schema>.usp_Sync_<Bảng>`

Tham số chung: `@SinceAt DATETIME2(0)`, `@RunId BIGINT`, và các tham số ra `@ReadCount`, `@InsertedCount`, `@UpdatedCount`, `@DeletedCount`, `@MaxStampAt`, `@TargetCount`. Mọi thủ tục `SET XACT_ABORT ON`, `SET LOCK_TIMEOUT 600000` (chờ khóa tối đa 10 phút), đọc view qua synonym vào bảng tạm `#src`, kiểm, rồi ghi bảng chép trong **một transaction** (lỗi giữa chừng thì không ghi gì). Dòng ghi mới hoặc ghi lại nhận `SyncedAt = SYSUTCDATETIME()` và `SyncRunId = @RunId`.

**So "dòng có đổi" theo byte**: cột chuỗi ép `VARBINARY(MAX)` rồi so bằng `EXCEPT` (an toàn với NULL). Collation không phân biệt hoa thường sẽ bỏ sót "Nike" → "NIKE" và khoảng trắng cuối. Bảng chép và bảng tạm giữ collation của cột nguồn nên không vỡ ký tự `VARCHAR`, không xung đột collation khi `MES_Sync` tạo với collation khác.

**KEY, chép tăng dần** (`@SinceAt` có giá trị):

1. `#src` ← dòng của view có `ModifiedAt >= @SinceAt OR CreatedAt >= @SinceAt`.
2. **Đối soát khóa**: `#alive` ← riêng cột khóa của cả view. Dừng nếu có khóa NULL (50003), khóa trùng (50001), view trả 0 dòng mà bảng chép đang có dữ liệu (50002), hoặc **định xóa hàng loạt** (50004, mục Chốt chặn).
3. Đọc thêm vào `#src` các dòng có khóa trong `#alive` mà bảng chép chưa có (ngày tháng NULL, hoặc lần trước bị sót).
4. Kiểm lại `#src`: khóa NULL (50003), khóa trùng (50001).
5. Transaction: xóa dòng có khóa không còn trong `#alive`; cập nhật dòng có ít nhất một cột khác (ghi cả cột khóa, vì khóa chỉ đổi hoa/thường hoặc khoảng trắng cuối vẫn khớp khóa chính theo collation CI); thêm khóa mới. Số đếm là `@@ROWCOUNT` của từng câu.

**KEY, chép toàn bộ** (`@SinceAt` NULL, gồm nguồn `FULL` và nút Chép lại từ đầu): `#src` ← cả view; kiểm khóa NULL, khóa trùng, view 0 dòng; transaction xóa dòng không còn trong `#src`, cập nhật dòng khác, thêm dòng mới. Không có chốt xóa hàng loạt: chép toàn bộ là cách xóa thật những dòng đã mất bên nguồn.

**PARTITION, chép tăng dần**:

1. `#keys` ← các nhóm có dòng `ModifiedAt`/`CreatedAt` từ `@SinceAt`.
2. **Đối soát số dòng từng nhóm**: `#alive` ← cột nhóm và số dòng của cả view. Dừng nếu view 0 dòng (50002) hoặc định xóa hàng loạt (50004).
3. Thêm vào `#keys` các nhóm có số dòng khác bảng chép (mất dòng, dòng chuyển sang nhóm khác, nhóm thiếu ngày tháng) và các nhóm có trong bảng chép mà không còn bên nguồn.
4. `#src` ← mọi dòng của view thuộc các nhóm trong `#keys`. So nhóm an toàn với NULL (`INTERSECT`), nên nhóm có giá trị NULL cũng được xử lý.
5. Transaction: xóa cả nhóm cũ trong `#keys`, chèn lại nhóm mới.

**PARTITION, chép toàn bộ** (gồm hai nguồn OSM): `#src` ← cả view; dừng nếu view 0 dòng mà bảng chép đang có dữ liệu (50002); transaction xóa hết bảng chép rồi chèn lại toàn bộ. Dòng trùng nguyên dòng được chép đủ.

Nguồn PARTITION không có khóa dòng nên số thêm, đổi, xóa là **gần đúng** (thêm: dòng của nhóm mới; đổi: dòng mới hoặc khác trong nhóm đã có; xóa: dòng cũ không còn, trừ đi số đổi).

### Chốt chặn

| Mã lỗi | Khi nào | Áp cho | Thông báo (rút gọn) |
|---|---|---|---|
| 50001 | Khóa trùng trong `#src` hoặc `#alive` | KEY | "View nguồn trả về khóa trùng (…). Không chép…; báo bên quản lý database trung gian/OSM" |
| 50002 | View trả 0 dòng trong khi bảng chép đang có dữ liệu | mọi nguồn | "View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép…" |
| 50003 | Có dòng thiếu khóa | KEY | "View nguồn có dòng thiếu khóa (…)" |
| 50004 | Chép tăng dần mà đối soát định xóa **quá 100 dòng và quá 20%** bảng chép | KEY, PARTITION chép tăng dần | "Lần đồng bộ này sẽ xóa X/Y dòng vì không còn bên nguồn (quá 20% bảng chép)… nếu bên BRAVO xóa thật thì dùng Chép lại toàn bộ" |
| 50010 | `ProcName` sai dạng, ngoài schema `bravo`/`osm`, hoặc chưa có thủ tục | mọi nguồn | "Không tìm thấy thủ tục chép của nguồn này. Chạy npm run migrate." |

Ngưỡng 50004 là hằng `MASS_DELETE_MIN_ROWS = 100`, `MASS_DELETE_PERCENT = 20` trong `sync-gen.ts`. Lý do: chép tăng dần là nút bấm thường ngày, không hỏi lại; view trả thiếu (lỗi bên nguồn) không được xóa bảng chép. Xóa thật thì dùng nút Chép lại từ đầu (có hộp xác nhận).

### Dọn lần chạy mồ côi: `dbo.usp_SyncRun_RecoverStale`

Với mỗi lần `RUNNING`: thử giữ khóa `MES_Sync:<Code>` không chờ. Giữ được nghĩa là không ai đang chạy (tiến trình đã dừng, mất kết nối, quá giờ) → ghi `FAILED` "Lần đồng bộ bị ngắt giữa chừng… Phần chưa ghi xong đã được hủy, mốc giữ nguyên; chạy lại để tiếp tục." Lần đang chạy thật vẫn giữ khóa nên không bị đụng. Được gọi khi backend khởi động, trước mỗi lần xếp hàng, sau khi một lần chạy lỗi kết nối, và khi màn hình thấy lần `RUNNING` đã quá 61 phút.

### Giới hạn đã biết

Chép tăng dần có đối soát khóa vẫn **không thấy** (cần thỉnh thoảng chạy Chép lại từ đầu, ADR 0007):

- cột lấy từ bảng khác trong view (tên, số tổng hợp) đổi mà `ModifiedAt` của dòng không đổi;
- dòng có `ModifiedAt` và `CreatedAt` đều NULL bị sửa nội dung (chỉ thấy khi thêm hoặc xóa);
- PARTITION: một dòng rời nhóm và một dòng khác vào cùng nhóm mà không đổi ngày, số dòng của nhóm giữ nguyên;
- BRAVO ghi `ModifiedAt` theo giờ máy trạm lệch quá `OverlapMinutes` (chưa xác minh với phía BRAVO).

Nguồn `FULL` (chi nhánh, size, phương thức giao hàng, hai nguồn OSM) chỉ có chốt "0 dòng", không có chốt xóa hàng loạt. Bước làm mới Phân bổ PO có chốt riêng khi bảng chép rỗng hoặc giảm mạnh ([Đơn hàng](06-don-hang.md)).

## Backend

### Thành phần

| File | Vai trò |
|---|---|
| `backend/src/platform/sync/sync.module.ts` | `SyncModule`, xuất `SyncService` |
| `backend/src/platform/sync/sync.controller.ts` | API `/admin/sync/*` |
| `backend/src/platform/sync/sync.service.ts` | Hàng đợi chạy nền, việc sau đồng bộ, các hàm đọc cho phần khác của MES |
| `backend/src/platform/sync/sync.repository.ts` | Truy cập `MES_Sync` (Kysely, không qua `BaseRepository`) |
| `backend/src/platform/sync/sync.db.ts` | Pool `SYNC_DB` cho màn hình (giới hạn câu lệnh mặc định 15 giây, `failFast`); `createSyncRunner()` tạo kết nối riêng cho một lần chép (`poolMax 1`, giới hạn `SYNC_RUN_TIMEOUT_MS` = 60 phút) |
| `backend/src/platform/sync/sync.types.ts` | Kiểu bảng `SyncSource`, `SyncRun`, `bravo.DM_CHINHANH` |
| `backend/src/platform/sync/sync.dto.ts` | `SyncStartDto`, `SyncRunsQuery` |
| `backend/src/platform/sync/bravo-order-source.ts` | Câu đọc đơn hàng, PO, màu cỡ BRAVO; Nhà máy SX theo OSM; danh sách mã nguồn kích hoạt việc sau đồng bộ |
| `backend/src/platform/sync/osm-po-source.ts` | Nguồn Phân bổ PO: mã nguồn `OSM_PO_SOURCE` (`OSM.OSMData`), câu đọc mọi dòng khác nhau của `osm.OSMData` (`readOsmPoSource`), nguồn có bật không (`readOsmPoSourceActive`) |
| `backend/src/platform/feed/source-feed.module.ts`, `source-feed.service.ts` | `SourceFeedModule` toàn cục: cổng chỉ đọc cho module nghiệp vụ |

### Hàng đợi và chạy nền

- **Bấm đồng bộ** (`SyncService.start`): dọn lần mồ côi (`RecoverStale`), lấy nguồn đang bật, chọn theo `sourceIds` (bỏ trống là mọi nguồn đang bật), rồi `SyncRepository.enqueue`: mỗi nguồn một transaction chèn `SyncRun` `QUEUED` và trỏ `SyncSource.LastRunId` tới nó. Nguồn đã có lần chờ/đang chạy thì chỉ mục `UX_SyncRun_Active` báo trùng (2601/2627) và nguồn bị bỏ qua. Ghi `SysAuditLog` (`EntityType = 'SyncRun'`, `EntityId = BatchId`, `ActionCode = 'SYNC_START'`, `NewValue = { mode, queued: [mã nguồn], skipped: [mã nguồn] }`). Trả về ngay; cuối cùng luôn gọi `kick()` (kể cả khi lỗi giữa chừng hoặc mọi nguồn bị bỏ qua).
- **Chạy hàng đợi** (`kick` → `drain`): mỗi tiến trình backend tối đa một vòng chạy; gọi thêm khi đang chạy thì vòng sau quét lại. Vòng lặp lấy các `SyncRun` `QUEUED` theo `Id`, chạy lần lượt từng lần bằng `EXEC dbo.usp_SyncRun_Execute` trên kết nối riêng (`createSyncRunner`), đóng kết nối ngay khi xong. Thủ tục tự ghi kết quả hoặc lỗi; lỗi tới được Node.js chỉ là lỗi kết nối hoặc quá 60 phút, khi đó đánh `FAILED` "Không gọi được thủ tục đồng bộ: …" nếu lần đó còn `QUEUED`, rồi dọn mồ côi. Đóng kết nối là kết thúc phiên SQL: transaction dở bị hủy, khóa ứng dụng nhả.
- **Khởi động** (`onModuleInit`): hỏi `MES_Sync` đã có và vào được chưa (qua kết nối `MES_Core`: `DB_ID` và `HAS_DBACCESS`), có thì dọn mồ côi rồi chạy tiếp hàng đợi; chưa có thì chỉ ghi cảnh báo.
- `GET /admin/sync/sources` cũng chạy lại hàng đợi nếu thấy lần `QUEUED` (lần trước lỗi giữa chừng), và dọn mồ côi nếu có lần `RUNNING` đã quá 61 phút.
- Nhiều tiến trình backend cùng trỏ một `MES_Sync` vẫn an toàn: mọi tiến trình đều có thể chạy hàng đợi, thủ tục nhận việc bằng cập nhật có điều kiện và khóa ứng dụng.

Chống chạy chồng có ba lớp: `UX_SyncRun_Active` (mỗi nguồn một lần chờ/đang chạy), `UPDATE … WHERE StatusCode = 'QUEUED'` (một nơi nhận việc), khóa ứng dụng `MES_Sync:<Code>` (một phiên chép một nguồn).

### Việc sau đồng bộ

`SyncService` cho phần khác đăng ký việc chạy sau đồng bộ. Chỉ lần chạy **thành công trong chính tiến trình này** mới kích hoạt. Việc lỗi chỉ ghi log, không làm hỏng lần đồng bộ đã xong.

- `onSucceeded(code, work)`: chạy ngay sau khi nguồn `code` chép thành công (trong vòng hàng đợi, trước nguồn kế tiếp).
- `onQueueDrained(codes, work)`: đánh dấu chờ khi một nguồn trong `codes` chép thành công; chạy **một lần** khi hàng đợi chạy hết (một lần bấm nhiều nguồn chỉ chạy một lần, sau khi mọi nguồn đã chép). Việc lỗi thì giữ cờ chờ, lần hàng đợi chạy hết sau đó (kể cả đợt chỉ chép nguồn khác) thử lại.

| Đăng ký ở | Cách đăng ký | Nguồn kích hoạt | Việc |
|---|---|---|---|
| `backend/src/platform/admin/admin-branches.service.ts` | `onSucceeded` | `BRAVO.DM_CHINHANH` | Cập nhật Đơn vị cơ sở theo danh mục chi nhánh BRAVO (`importFromBravo`), xem [Quản trị hệ thống](05-quan-tri-he-thong.md) |
| `backend/src/platform/catalog/catalog.service.ts` | `onSucceeded` | `OSM.OSMDataFty` | Thêm tên nhà máy mới của OSM vào danh mục Nhà máy SX (`importOsmFactories`) |
| `backend/src/modules/order/bravo-order-import.service.ts` | `SourceFeedService.onOrderSourceSynced` → `onQueueDrained(BRAVO_ORDER_SOURCE_CODES)`; chỉ khi `BRAVO_ORDER_IMPORT` bật | `BRAVO.DM_CHINHANH`, `DM_SanPhamDonHang`, `ThongTinPO`, `ThongTinPO_MauCo`, `DM_KHACHHANG`, `DM_MuaKinhDoanh`, `DM_NHANVIEN`, `DM_MauSac`, `DM_DiaDiemGiaoHang`, `DM_QuocGia` | Nạp tăng dần đơn hàng BRAVO vào `MES_Order` |
| `backend/src/modules/order/osm-factory.service.ts` | `SourceFeedService.onOsmFactorySynced` → `onQueueDrained(OSM_FACTORY_SOURCE_CODES)`; chỉ khi `OSM_FACTORY_UPDATE` bật | `OSM.OSMDataFty`, `BRAVO.DM_SanPhamDonHang` | Cập nhật Nhà máy SX của đơn hàng theo OSM |
| `backend/src/modules/order/po-allocation-refresh.service.ts` | `SourceFeedService.onOsmPoSynced` → `onQueueDrained([OSM_PO_SOURCE])`; chỉ khi `PO_ALLOCATION_REFRESH` bật | `OSM.OSMData` | Làm mới bảng Phân bổ PO (`MES_Order.PoAllocation`) theo OSM, giữ Nhà máy SX nhập tay |

Ba việc của module Đơn hàng còn chạy một lần lúc backend khởi động. Luật nạp và cập nhật ở [Đơn hàng](06-don-hang.md). Danh sách mã nguồn kích hoạt nằm ở `bravo-order-source.ts`: thêm bảng vào câu đọc đơn hàng thì phải thêm mã nguồn vào `BRAVO_ORDER_SOURCE_CODES`.

### Đọc dữ liệu đã chép

Mọi câu đọc chỉ đọc, đều nằm trong `platform/sync`. Bọc bởi `SyncService.ready()`: máy chưa có `MES_Sync`, không vào được, hoặc chưa migrate (lỗi 208) thì báo `SYNC_NOT_READY` (503).

| Dữ liệu | Bảng chép | Hàm | Ai dùng |
|---|---|---|---|
| Tên chi nhánh theo mã ĐVCS | `bravo.DM_CHINHANH` (`BranchCode`, `TenChiNhanh`) | `SyncService.branchNames` | `CatalogLookupService.branchNames` (cache 30 giây; đọc lỗi thì dùng tên ở Quản trị › Đơn vị cơ sở) → cột Chi nhánh/ĐVCS các màn, `/me/branch-names` |
| Danh mục chi nhánh để chép thành ĐVCS | `bravo.DM_CHINHANH` | `SyncService.bravoBranches` | `AdminBranchesService`; script seed đọc trực tiếp qua `backend/scripts/bravo-branches.ts` |
| Danh mục BRAVO chỉ xem | nguồn nhóm `CATALOG` có `TargetTable` thuộc `bravo.` | `SyncService.catalogs`, `catalogRows` | Màn Danh mục hệ thống (`GET /admin/catalogs`, `GET /admin/catalogs/external/:code/rows`), xem [Quản trị hệ thống](05-quan-tri-he-thong.md). Tên bảng lấy từ `SyncSource` theo mã, không nhận từ client |
| Đơn hàng, PO, màu cỡ | `DM_SanPhamDonHang`, `ThongTinPO`, `ThongTinPO_MauCo`, `DM_KHACHHANG`, `DM_MuaKinhDoanh`, `DM_NHANVIEN`, `DM_MauSac`, `DM_DiaDiemGiaoHang`, `DM_QuocGia` | `readBravoOrderSource` qua `SourceFeedService.orderSource` (kết nối riêng, giới hạn 60 phút vì bảng lớn dần) | Nạp tăng dần đơn hàng; `npm run load:bravo` dùng chung câu đọc |
| Nhà máy SX theo OSM của từng sản phẩm | `osm.OSMDataFty` ghép `bravo.DM_SanPhamDonHang` (`Code = SO`, `StyleName = StyleNo`) | `readOsmFactories`, `readOsmFactoryLists` qua `SourceFeedService.osmFactories`, `SyncService.osmFactoryLists` | `OsmFactoryService`, nạp đơn hàng, `CatalogService.importOsmFactories`. Bảng chép OSM chưa có hoặc trống thì trả `null` (không coi mọi đơn là "OSM không có") |
| Phân bổ PO theo nhà máy | `osm.OSMData`: mọi dòng khác nhau, gom theo 11 cột với chữ so nhị phân (`Latin1_General_BIN2`: hai dòng chỉ khác hoa thường là hai dòng, lần đọc nào cũng ra cùng giá trị), kèm `MAX(SyncedAt)` | `readOsmPoSource` qua `SourceFeedService.osmPoRows` | Bước làm mới bảng Phân bổ PO (`PoAllocationRefreshService`), xem [Đơn hàng](06-don-hang.md). Chưa có bảng chép thì trả `null` (không làm gì) |
| Nguồn Phân bổ PO có bật không | `dbo.SyncSource` (`Code = 'OSM.OSMData'`) | `readOsmPoSourceActive` qua `SourceFeedService.osmPoSourceActive` | Màn Phân bổ PO khi chưa có dữ liệu: nguồn tắt thì nhắc nhờ IT thay vì bảo đi đồng bộ |

`npm run load:bravo` (`backend/scripts/load-bravo-orders.ts`) là script, đọc thẳng bảng chép trong `MES_Sync` bằng kết nối riêng; vẫn không đọc database trung gian hay database BRAVO.

### Khi chưa có `MES_Sync`

- Backend vẫn khởi động bình thường, ghi cảnh báo.
- API `/admin/sync/*` và mọi hàm đọc trả `503 SYNC_NOT_READY` ("Chưa có database đồng bộ (MES_Sync), tài khoản ứng dụng chưa được cấp quyền vào, hoặc chưa chạy migration…"). `SyncService` nhớ trạng thái đã vào được; mất kết nối kiểu `ELOGIN`, `ESOCKET`, `ETIMEOUT` thì hỏi lại.
- Các nơi dùng tự xử lý: tên chi nhánh lấy từ `SysBranch`, Danh mục hệ thống vẫn hiện danh mục MES kèm lý do, việc lúc khởi động của module Đơn hàng chỉ ghi cảnh báo, màn Phân bổ PO (đọc `MES_Order`) vẫn mở và coi như nguồn chưa bật.

## API

Tiền tố `/api/v1`. Controller `backend/src/platform/sync/sync.controller.ts`. Lỗi chung: `503 SYNC_NOT_READY` như trên.

| Phương thức, đường dẫn | Quyền | Vào | Ra |
|---|---|---|---|
| `GET /admin/sync/sources` | `admin.sync:view` | – | Mảng nguồn **đang bật**, theo `SortOrder`: `id`, `code`, `name`, `description`, `system`, `group`, `sourceObject`, `targetTable`, `mode`, `keyColumns`, `overlapMinutes`, `watermarkAt` (giờ nguồn), `lastSuccessAt`, `lastFullAt` (lần chép toàn bộ thành công gần nhất), `targetCount` (số dòng sau lần thành công gần nhất), `lastRun` (lần chạy theo `LastRunId`: `id`, `status`, `mode`, `sinceAt`, các số đếm, `queuedAt`, `startedAt`, `finishedAt`, `durationMs`, `errorMessage`; null nếu chưa chạy) |
| `GET /admin/sync/runs` | `admin.sync:view` | Query `sourceId` (bắt buộc, ≥ 1), `page` (mặc định 1), `pageSize` (1–100, mặc định 100) | `{ total, page, pageSize, items }`, mới nhất trước. Mỗi lần: như `lastRun` cộng `batchId`, `prevWatermarkAt`, `newWatermarkAt`, `targetCount`, `createdBy` (họ tên người bấm, null nếu không có) |
| `POST /admin/sync/start` | `admin.sync:update` | `{ sourceIds?: number[] (tối đa 100, số nguyên ≥ 1), full?: boolean }`. Bỏ trống `sourceIds`: mọi nguồn đang bật. `full = true`: bỏ qua mốc, chép lại toàn bộ | `202 { batchId, queued (số nguồn đã xếp), skipped (tên các nguồn bị bỏ qua vì đang chờ/đang chạy) }`. `404` nếu có nguồn không tồn tại hoặc đã tắt, hoặc không còn nguồn nào đang bật; `422` nếu dữ liệu gửi sai |

Thời điểm `queuedAt`, `startedAt`, `finishedAt`, `lastSuccessAt`, `lastFullAt` là UTC; `watermarkAt`, `sinceAt`, `prevWatermarkAt`, `newWatermarkAt` là giờ của nguồn, không múi giờ.

## Màn Quản trị › Đồng bộ dữ liệu

- File `frontend/src/features/admin/SyncPage.tsx`, kiểu dữ liệu ở `frontend/src/features/admin/types.ts`. Route `/admin/sync` (`frontend/src/routes/registry.tsx`), menu `admin.sync` "Đồng bộ dữ liệu" trong nhóm Quản trị.
- Quyền: `admin.sync:view` để vào màn, xem nguồn và lịch sử; `admin.sync:update` để thấy ô chọn và hai nút chạy. Theo dữ liệu seed, vai trò `ADMIN` có Xem và Sửa; vai trò Toàn quyền (`FULL_ACCESS`) có đúng quyền quản trị của `ADMIN` (ADR 0014). Xem [Dữ liệu mẫu](12-du-lieu-mau-va-kiem-thu.md).

Bố cục và thao tác:

| Phần | Nội dung |
|---|---|
| Nút **Đồng bộ tất cả** / **Đồng bộ N nguồn** | Chép tăng dần mọi nguồn đang bật, hoặc các nguồn đang chọn mà đang hiện (chọn rồi đổi bộ lọc thì nguồn khuất không chạy ngầm) |
| Nút **Chép lại từ đầu** / **Chép lại từ đầu N nguồn** | Hộp xác nhận, rồi gửi `full: true`: bỏ qua mốc, đọc lại cả view, xóa dòng không còn bên nguồn. Nặng hơn, nên chạy ngoài giờ cao điểm |
| Bộ lọc | Tất cả / Danh mục / Đơn hàng / Có lỗi, kèm số lượng; lưu ở tham số URL `group` |
| Dòng trạng thái | Đang chạy bao nhiêu nguồn, bao nhiêu nguồn chờ; hoặc lần chạy gần nhất xong lúc nào, bao nhiêu nguồn lỗi; chưa chạy lần nào thì gợi ý chạy Đồng bộ tất cả |
| Bảng nguồn | Nhóm theo `group` (Danh mục, Đơn hàng; nhóm lạ hiện "Khác"). Cột: chọn, Nguồn (rê chuột thấy tên view), Cách lấy (Tăng dần / Toàn bộ mỗi lần, tooltip giải thích), Mốc dữ liệu (giờ nguồn, kèm lần chép toàn bộ gần nhất; nguồn `FULL` ghi "Không dùng"), Lần chạy gần nhất (trạng thái, bao lâu trước), Kết quả (số đọc, mới, đổi, xóa; đang chạy thì thời gian đã chạy; lỗi thì thông báo lỗi), Dòng trong MES, nút **Lịch sử** |
| Ngăn **Lịch sử** | View nguồn, bảng trong MES, khóa, cách lấy, ghi chú; bảng các lần chạy (bắt đầu, người chạy hoặc "Hệ thống", lấy từ mốc nào, trạng thái, đọc, mới, đổi, xóa, thời gian) và dòng lỗi; 100 lần mỗi trang |

- Khi có nguồn đang chờ hoặc đang chạy, danh sách nguồn và ngăn lịch sử tự tải lại mỗi 2 giây; đồng hồ "x phút trước" nhảy mỗi giây (thường 30 giây), chỉ vẽ lại các ô thời gian.
- Bấm chạy: thông báo số nguồn đã xếp hàng và các nguồn bị bỏ qua vì đang chạy.
- Lỗi `SYNC_NOT_READY`: ẩn bảng và nút, hiện khung cam "Chưa dùng được màn Đồng bộ… Liên hệ IT" (chi tiết kỹ thuật trong tooltip).
- Màn khác dẫn tới đây: Phân bổ PO (người có `admin.sync:update`, khi chưa đồng bộ) và Danh mục hệ thống (người có `admin.sync:view`).

## Thêm hoặc sửa nguồn (`sync-gen`)

`backend/scripts/sync-gen.ts` đọc cấu trúc cột thật của view (`sys.columns`) ở database nguồn rồi sinh SQL: bảng chép, thủ tục chép, dòng `SyncSource`. Database cùng máy SQL Server thì kết nối thẳng database đó; có linked server thì đọc danh mục hệ thống qua tên 4 phần từ `master` của máy MES. Script chỉ đọc danh mục hệ thống, không đọc dữ liệu.

Chạy trong thư mục `backend`:

```
npx tsx scripts/sync-gen.ts --out migrations/MES_Sync/NNNN_ten.sql                 # mọi nguồn trong SOURCES
npx tsx scripts/sync-gen.ts DM_MauSac DM_Size --out migrations/MES_Sync/NNNN_ten.sql # chỉ các nguồn có tên bảng này
npx tsx scripts/sync-gen.ts --procs-only --out migrations/MES_Sync/NNNN_ten.sql    # chỉ CREATE OR ALTER thủ tục chép
```

Dùng `--out`, không dùng `> file`: PowerShell 5.1 ghi UTF-16 và làm hỏng chữ tiếng Việt. Tên nguồn trên dòng lệnh là tên bảng chép (`tableName(view)`), ví dụ `OSMData`.

Khai báo một nguồn (`SourceDef` trong `SOURCES`): `system` (`BRAVO` mặc định, `OSM`), `view`, `name`, `group` (`CATALOG`/`ORDER`), `match` (`KEY`/`PARTITION`), `columns` (cột khóa hoặc cột nhóm), `mode` (`INCREMENTAL`/`FULL`), `description`. Script từ chối khi: view không có cột khóa đã khai; nguồn `INCREMENTAL` thiếu `ModifiedAt` hoặc `CreatedAt`; cột kiểu không so sánh hoặc chèn lại được (`text`, `ntext`, `image`, `xml`, `geography`, `geometry`, `hierarchyid`, `timestamp`, `sql_variant`); collation lạ; thiếu biến database nguồn trong `.env`.

### Thêm nguồn của hệ thống đã có (BRAVO, OSM)

1. Kiểm khóa trên dữ liệu thật (số giá trị khác nhau bằng số dòng) để chọn `KEY` hay `PARTITION`; view không có cột thời gian dùng được thì `FULL`.
2. Thêm một dòng **vào cuối** `SOURCES` (`SortOrder` tính theo vị trí). View nằm ở database khác database mặc định của hệ thống đó thì thêm tên view vào `views` của mục tương ứng trong `backend/scripts/source-databases.ts`.
3. Sinh migration **mới** chỉ cho nguồn đó: `npx tsx scripts/sync-gen.ts <Bảng> --out migrations/MES_Sync/NNNN_<ten>.sql`. Không sửa migration đã chạy.
4. `npm run migrate` (người duyệt chạy): tạo bảng, thủ tục, dòng `SyncSource`, synonym.
5. Code muốn đọc bảng mới: thêm câu đọc trong `platform/sync`, mở qua `SourceFeedService` (module nghiệp vụ) hoặc `SyncService` (nền tảng); nếu cần chạy việc sau đồng bộ thì đăng ký `onSucceeded`/`onQueueDrained`.

### Thêm hệ thống nguồn mới (ví dụ GSD)

Ngoài các bước trên:

- `sync-gen.ts`: thêm vào kiểu `SourceSystem`, và sửa `schemaOf`, `originOf` (hiện chỉ phân biệt `OSM`, mọi hệ thống khác rơi vào schema `bravo`); câu báo lỗi 50004 cũng chỉ phân biệt `OSM`/`BRAVO`. Script tự in `CREATE SCHEMA` cho schema khác `bravo`.
- `source-databases.ts`: thêm mục mới (kiểu `system` cũng phải mở rộng), biến tên database và linked server; thêm biến vào `backend/src/config/env.ts` và `backend/.env.example`.
- Migration mới sửa `dbo.usp_SyncRun_Execute` để chấp nhận schema mới trong danh sách schema được chạy (như `0006` đã làm cho `osm`); thiếu bước này mọi lần chạy lỗi 50010.

### Sửa thủ tục chép đã chạy

Sửa `render()` trong `sync-gen.ts`, rồi sinh `--procs-only` (mọi nguồn, hoặc chỉ nguồn bị ảnh hưởng) ra migration mới, ghi lý do ở hai dòng đầu file, `npm run migrate`. `backend/test/sync-gen.spec.ts` (không cần database) dựng lại cột từ bảng tạm `#src` của thủ tục **mới nhất** trong các migration `MES_Sync` và so với đầu ra hiện tại của `render()`: sửa script mà quên sinh migration thì test báo.

### View nguồn đổi cấu trúc

`sync-gen` chỉ sinh `CREATE TABLE` (nguồn mới) và `CREATE OR ALTER PROCEDURE`; **không sinh `ALTER TABLE`**. Khi view thêm cột hoặc nới độ dài cột (bảng chép ngắn hơn nguồn gây lỗi 2628 cắt chuỗi), cần migration có `ALTER TABLE <schema>.[<Bảng>] ALTER COLUMN …` (hoặc `ADD`) viết tay, kèm thủ tục sinh lại bằng `--procs-only` từ view mới. Cột trong khóa chính của nguồn KEY không `ALTER COLUMN` được, phải xóa và tạo lại khóa. Hiện chưa có migration nào như vậy.

## Lỗi hay gặp

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Màn hiện "Chưa dùng được màn Đồng bộ", API 503 `SYNC_NOT_READY` | Chưa có `MES_Sync`, tài khoản ứng dụng chưa có quyền vào, hoặc chưa migrate | Quản trị CSDL tạo database, cấp `db_owner`; chạy `npm run migrate` |
| Mọi nguồn BRAVO lỗi không tìm thấy đối tượng `bravo.src_<Bảng>` | `DB_TRUNGGIAN_NAME` trống lúc migrate nên chưa có synonym | Khai biến, chạy lại `npm run migrate` (hoặc `npm run migrate -- MES_Sync`) |
| Không thấy nguồn OSM trên màn hình; màn Phân bổ PO báo máy chủ chưa cấu hình | Thiếu `DB_OSM_NAME` / `DB_OSM_APP_NAME` lúc migrate nên nguồn bị tắt | Khai biến rồi migrate lại để bật |
| Lỗi đọc qua linked server ngay khi chạy | Linked server sai tên hoặc chưa bật Data Access (migrate đã cảnh báo) | Sửa `..._SERVER` hoặc cấu hình linked server, migrate lại |
| Lỗi 229 thiếu quyền `EXECUTE` ở một số view BRAVO (`vDM_KHACHHANG`, `vDM_DiaDiemGiaoHang`, `vThongTinPO`, `vThongTinPO_MauCo`) | View gọi hàm nằm bên database BRAVO mà tài khoản MES không có quyền chạy | Việc của quản trị CSDL phía BRAVO (cấp quyền, hoặc đổi cách view truy cập). Các nguồn khác vẫn chép bình thường |
| Lỗi 7347 "returned data that does not match expected data length" khi đọc qua linked server | View trong database nguồn còn giữ độ dài cột cũ sau khi bảng gốc được nới | Quản trị CSDL phía nguồn chạy `EXEC sp_refreshview N'dbo.<view>'`; nếu độ dài mới lớn hơn bảng chép thì nới bảng chép (mục View nguồn đổi cấu trúc). Lỗi chỉ báo cột đầu tiên lệch: kiểm mọi cột |
| Lỗi 2628 cắt chuỗi khi ghi bảng chép | Cột nguồn dài hơn cột bảng chép | Nới bảng chép bằng migration (mục View nguồn đổi cấu trúc) |
| 50001 / 50003 khóa trùng, thiếu khóa | Dữ liệu view vi phạm khóa đã kiểm | Báo bên quản lý database nguồn; không chép cho tới khi sửa (mốc giữ nguyên) |
| 50002 view trả 0 dòng | View tạm hỏng hoặc bị lọc sai | Kiểm view bên nguồn; bảng chép giữ nguyên |
| 50004 sẽ xóa X/Y dòng | Đối soát thấy quá nhiều dòng biến mất | Kiểm view; nếu bên nguồn xóa thật thì chạy Chép lại từ đầu cho nguồn đó |
| 50010 không tìm thấy thủ tục | Chưa migrate, hoặc schema nguồn chưa được `usp_SyncRun_Execute` chấp nhận | `npm run migrate`; hệ thống mới thì xem mục Thêm hệ thống nguồn mới |
| "Nguồn này đang được đồng bộ ở nơi khác" | Lần khác của cùng nguồn đang giữ khóa | Chờ lần đó xong rồi chạy lại |
| "Lần đồng bộ bị ngắt giữa chừng…" | Backend dừng, mất kết nối hoặc chạy quá 60 phút khi đang chép | Chạy lại; phần dở đã hủy, mốc giữ nguyên |
| Bấm chạy mà nguồn bị "bỏ qua vì đang chạy" | Nguồn đã có lần chờ hoặc đang chạy | Chờ lần đó xong |

## Kiểm thử

- `backend/test/sync-gen.spec.ts`: không cần database; mỗi nguồn trong `SOURCES` có thủ tục mới nhất trong migration đúng bằng đầu ra của `render()`.
- `backend/test/sync.spec.ts`: cần `MES_Sync` đã migrate và seed. Kiểm quyền `admin.sync`, 18 nguồn BRAVO, `SYNC_NOT_READY` khi mất database, dữ liệu gửi sai; thủ tục sinh từ `render()` chạy trên bảng mẫu tự tạo (hệ thống `TEST`) cho KEY tăng dần, lỗi giữa transaction, khóa NULL, chốt xóa hàng loạt, PARTITION tăng dần, PARTITION chép toàn bộ kiểu OSM; việc sau đồng bộ chạy đúng một lần và thử lại khi lỗi; lần chạy lỗi giữ mốc; không chép chồng; dọn lần mồ côi; nhật ký `SYNC_START`. Hai bài chép dữ liệu thật chỉ chạy khi có `DB_TRUNGGIAN_NAME` cùng máy (không linked server).
- Cách chạy test và bộ database test: [Dữ liệu mẫu và kiểm thử](12-du-lieu-mau-va-kiem-thu.md).
