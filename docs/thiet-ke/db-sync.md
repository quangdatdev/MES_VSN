# Thiết kế `MES_Sync` – dữ liệu chép từ hệ thống ngoài (Phase 5.2)

Nguồn: migration `backend/migrations/MES_Sync/0001_sync_core.sql`, `0002_bravo_order_sources.sql` (bảng chép, thủ tục, nguồn), `0003`, `0004` (chỉ sinh lại thủ tục: sửa lỗi 8155, thêm chặn khóa NULL và chốt xóa hàng loạt), `0005` (nới `Address` của địa điểm giao hàng lên `NVARCHAR(512)`) – sinh bởi `backend/scripts/sync-gen.ts`; ADR 0007. Test `backend/test/sync-gen.spec.ts` bảo đảm thủ tục trong migration mới nhất khớp với script. Khảo sát nguồn: `docs/thiet-ke/anh-xa-bravo-don-hang.html`.

## Tạo database (một lần, bằng tài khoản quản trị)
`mes_user` không có quyền tạo database. Quản trị CSDL chạy:
```sql
CREATE DATABASE MES_Sync;   -- collation nào cũng được: bảng chép giữ collation của cột nguồn
GO
USE MES_Sync;
CREATE USER mes_user FOR LOGIN mes_user;
ALTER ROLE db_owner ADD MEMBER mes_user;
```
Rồi `npm run migrate` (tạo bảng, thủ tục, synonym theo `DB_TRUNGGIAN_NAME`; database trung gian ở máy khác thì thêm `DB_TRUNGGIAN_SERVER` = tên linked server, synonym thành `[server].[database].[dbo].[view]`) và `npm run seed` (thêm màn và quyền `admin.sync` cho vai trò Quản trị).

## Bảng điều khiển (schema `dbo`)

| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `SyncSource` | `Code` (`BRAVO.DM_SanPhamDonHang`), `Name`, `SystemCode`, `GroupCode` (`CATALOG`, `ORDER`), `SourceObject` (view), `SourceSynonym`, `TargetTable`, `ProcName`, `SyncModeCode` (`INCREMENTAL`, `FULL`), `KeyColumns`, `OverlapMinutes`, `WatermarkAt`, `LastRunId`, `SortOrder`, `IsActive` | Một dòng mỗi view nguồn. `WatermarkAt` theo giờ của nguồn. Chỉ migration ghi các cột cấu hình |
| `SyncRun` | `SyncSourceId`, `BatchId` (một lần bấm), `ModeCode`, `StatusCode` (`QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`), `SinceAt`, `PrevWatermarkAt`, `NewWatermarkAt`, `ReadCount`, `InsertedCount`, `UpdatedCount`, `DeletedCount`, `TargetCount`, `QueuedAt`, `StartedAt`, `FinishedAt`, `ErrorMessage`, `CreatedBy` (người bấm) | `UX_SyncRun_Active`: mỗi nguồn tối đa một lần đang chờ/đang chạy. `CreatedBy` là khóa ngầm tới `MES_Core.SysUser.Id` |

## Thủ tục

| Thủ tục | Việc |
|---|---|
| `dbo.usp_SyncRun_Execute @RunId` | Giữ khóa ứng dụng `MES_Sync:<Code>`, nhận việc (`QUEUED` → `RUNNING`), tính `@SinceAt = WatermarkAt − OverlapMinutes` (NULL nếu chép toàn bộ), gọi thủ tục chép của nguồn, ghi kết quả và mốc mới, lỗi thì ghi `ErrorMessage` và giữ mốc |
| `dbo.usp_SyncRun_RecoverStale` | Lần `RUNNING` mà khóa của nguồn không còn ai giữ (tiến trình đã chết) → `FAILED` |
| `bravo.usp_Sync_<Bảng> @SinceAt, @RunId, OUTPUT…` | Đọc view qua synonym vào bảng tạm, kiểm khóa, ghi vào bảng chép trong một transaction, trả số dòng đọc/mới/đổi/xóa, mốc lớn nhất, tổng số dòng |

## Bảng chép (schema `bravo`)
Cột giữ nguyên tên và kiểu của view, cộng `SyncedAt`, `SyncRunId`. Nguồn KEY có khóa chính theo cột khóa; nguồn PARTITION có `SyncRowId` tự tăng và chỉ mục theo cột nhóm.

| Nhóm | View | Bảng | Khớp | Cách lấy |
|---|---|---|---|---|
| Danh mục | `vDM_CHINHANH` | `bravo.DM_CHINHANH` | KEY `BranchCode` | Toàn bộ |
| | `vDM_KHACHHANG` | `bravo.DM_KHACHHANG` | KEY `CustomerId` | Tăng dần |
| | `vDM_MuaKinhDoanh` | `bravo.DM_MuaKinhDoanh` | KEY `SalesSeasonId` | Tăng dần |
| | `vDM_MauSac` | `bravo.DM_MauSac` | KEY `ColorId` | Tăng dần |
| | `vDM_Size` | `bravo.DM_Size` | KEY `SizeId` | Toàn bộ (ngày luôn 1900) |
| | `vDM_NHANVIEN` | `bravo.DM_NHANVIEN` | KEY `EmployeeId` | Tăng dần |
| | `vDM_TEAM` | `bravo.DM_TEAM` | KEY `TeamId` | Tăng dần |
| | `vDM_NGUOISUDUNG` | `bravo.DM_NGUOISUDUNG` | KEY `UserId` | Tăng dần |
| | `vDM_LOOKUP` | `bravo.DM_LOOKUP` | KEY `ParentCode, Code` | Tăng dần |
| | `vDM_DiaDiemGiaoHang` | `bravo.DM_DiaDiemGiaoHang` | KEY `DestinationId` | Tăng dần |
| | `vDM_QuocGia` | `bravo.DM_QuocGia` | KEY `RowId_Nationality` | Tăng dần |
| | `vDM_PhuongThucGiaoHang` | `bravo.DM_PhuongThucGiaoHang` | KEY `Id` | Toàn bộ |
| Đơn hàng | `vDM_SanPhamDonHang` | `bravo.DM_SanPhamDonHang` | KEY `ProductId` | Tăng dần |
| | `vDM_POKH` | `bravo.DM_POKH` | KEY `CustomerPOId` | Tăng dần |
| | `vThongTinPO` | `bravo.ThongTinPO` | PARTITION `ProductId` | Tăng dần |
| | `vThongTinPO_MauCo` | `bravo.ThongTinPO_MauCo` | PARTITION `ProductId, CustomerPONo` | Tăng dần |
| | `vBangCanDoiSanXuat` | `bravo.BangCanDoiSanXuat` | KEY `ProduceId` | Tăng dần |
| | `vBangCanDoiSanXuat_MauCo_Tong` | `bravo.BangCanDoiSanXuat_MauCo_Tong` | PARTITION `ProduceId` | Tăng dần |

Khóa KEY đã kiểm trên dữ liệu ngày 10/10/2026 (số giá trị khác nhau bằng số dòng), trừ `vDM_KHACHHANG`, `vDM_DiaDiemGiaoHang` đang lỗi quyền (khóa theo mô tả của BRAVO). Khóa trùng khi chạy thì thủ tục dừng và báo lỗi, không ghi.

Đọc lúc chạy (chỉ đọc, ngoài lớp ánh xạ): `bravo.DM_CHINHANH.TenChiNhanh` là tên chi nhánh hiện ở cột Chi nhánh của các màn (`CatalogLookupService.branchNames`, cache 30 giây). Chưa có `MES_Sync` hoặc chưa chép được thì dùng tên ở Quản trị › Nhà máy, không báo lỗi.

## Lưu ý cho lớp ánh xạ (5.2.8)
- Bản nạp để xem dữ liệu thật (chưa phải lớp ánh xạ): `npm run load:bravo -- --yes`, giả định ghi ở `db-order.md` mục "Nạp từ BRAVO".
- Đọc bảng chép theo **khóa nguồn** (`KeyColumns`). Không dùng `SyncRowId` hay `SyncedAt` để nhận biết dòng đổi: nguồn PARTITION xóa rồi chèn lại cả nhóm nên hai cột này đổi kể cả khi nội dung không đổi.
- Số đọc/mới/đổi/xóa của nguồn PARTITION là gần đúng (nhóm không có khóa dòng).
- Chép tăng dần có đối soát khóa nhưng không thấy cột lấy từ bảng khác trong view đổi mà ngày sửa không đổi, và không thấy dòng có `ModifiedAt`/`CreatedAt` NULL bị sửa nội dung (chỉ thấy khi thêm hoặc xóa) (ADR 0007, mục Giới hạn): chạy "Chép lại toàn bộ" định kỳ.
- Chép tăng dần dừng (lỗi 50004) nếu đối soát định xóa quá 20% bảng chép và quá 100 dòng: kiểm tra view, xóa thật thì dùng "Chép lại toàn bộ".

## Nguồn OSM (12/10/2026, ADR 0013 mục 9)
- Nguồn `OSM.OSMDataFty`: view `vOSMDataFty` của database OSM (`DB_OSM_NAME`; khác máy SQL thì thêm `DB_OSM_SERVER` là tên linked server), chép vào schema `osm` (`MES_Sync/0005`, sinh bởi `sync-gen` với `system: 'OSM'`). Chép toàn bộ mỗi lần, theo nhóm `SO` (view có dòng trùng nguyên dòng, không dùng khóa được).
- `usp_SyncRun_Execute` chạy được thủ tục chép của schema `bravo` và `osm` (`MES_Sync/0006`).
- Migrate tạo synonym theo từng database nguồn (`backend/scripts/source-databases.ts`): BRAVO tới `DB_TRUNGGIAN_NAME`; OSM tới `DB_OSM_NAME`, riêng view `v_OSMData` tới `DB_OSM_APP_NAME`. Database OSM không khai trong `.env` thì migrate tắt các nguồn đọc ở database đó (không hiện, không báo lỗi khi "Đồng bộ tất cả"), khai rồi chạy lại migrate thì bật.
- Sau khi chép: danh mục Nhà máy SX tự thêm tên nhà máy mới (`CatalogService.importOsmFactories`); hàng đợi chạy hết thì cập nhật Nhà máy SX của đơn hàng (`OsmFactoryService`).
- Nguồn `OSM.OSMData` (task 5.9.12): view gốc `v_OSMData` của database ứng dụng OSM (`DB_OSM_APP_NAME`, trên máy chủ là `NTB_DB` qua linked server `DB_OSM_APP_SERVER=DB_OSM_TRE`), chép vào `osm.OSMData` (`MES_Sync/0007`). 11 cột: Brand, Season, PO, SO, `Ship mode`, StyleName, StyleNo, Color, `ETD-Actual`, `ETD-REVISED`, FtyName (một nhà máy mỗi dòng). Khoảng 30.000 dòng, khoảng 1/6 trùng nguyên dòng, không cột thời gian: chép toàn bộ mỗi lần, theo nhóm `PO`. Màn Quản trị đơn hàng › Phân bổ PO đọc bảng này qua `SourceFeedService` (`platform/sync/osm-po-source.ts`), bỏ dòng trùng, ĐVCS của nhà máy tra từ danh mục Nhà máy SX. Không có lịch tự chạy: dữ liệu mới tới lần bấm Đồng bộ gần nhất, màn hiện thời điểm đó.

## Thêm nguồn
`sync-gen` đọc cấu trúc cột của view ở database nguồn khai trong `scripts/source-databases.ts`: cùng máy SQL Server thì kết nối thẳng database đó; có `..._SERVER` (linked server) thì đọc `sys.columns` qua tên 4 phần từ `master` của máy MES. View đọc ở database khác database mặc định của hệ thống thì thêm vào `views` của database đó trong `source-databases.ts`.

1. Thêm một dòng vào `SOURCES` trong `backend/scripts/sync-gen.ts` (kiểm khóa trên dữ liệu thật trước).
2. `npx tsx scripts/sync-gen.ts <TênBảng> --out migrations/MES_Sync/NNNN_<ten>.sql` (chỉ nguồn mới; không sửa migration đã chạy). Dùng `--out`, không dùng `> file`: PowerShell 5.1 ghi UTF-16 làm hỏng chữ tiếng Việt.
3. `npm run migrate` (tạo bảng, thủ tục, synonym).

## Sửa thủ tục chép đã chạy
Sửa `render()` trong `sync-gen.ts`, rồi `npx tsx scripts/sync-gen.ts --procs-only --out migrations/MES_Sync/NNNN_<ten>.sql` (chỉ `CREATE OR ALTER PROCEDURE`, không đụng bảng chép và `SyncSource`), viết lý do ở 2 dòng đầu file, `npm run migrate`. `sync-gen.spec.ts` báo nếu quên bước này.

## Nguồn thật dài hơn view ở máy dev
`sync-gen` lấy kiểu cột từ database trung gian của máy chạy script. Bản ở máy dev cũ hơn máy chủ BRAVO thì cột có thể ngắn hơn nguồn thật, lần chép trên server lỗi cắt chuỗi (2628).
1. Khai báo `minLengths: { <Cột>: <số ký tự> }` cho nguồn trong `SOURCES` (chỉ nới, không thu hẹp). Không dùng cho cột khóa của nguồn KEY: SQL Server không cho `ALTER COLUMN` cột trong khóa chính, cần migration xóa rồi tạo lại khóa.
2. `npx tsx scripts/sync-gen.ts <Bảng> --procs-only --out migrations/MES_Sync/NNNN_<ten>.sql`, rồi thêm tay ở đầu file `ALTER TABLE bravo.[<Bảng>] ALTER COLUMN [<Cột>] <kiểu> COLLATE <collation như bảng chép> NULL;` và `GO`. Viết trên một dòng đúng mẫu này để test đọc được. Ví dụ: `0005`.
3. `sync-gen.spec.ts` báo nếu thủ tục chưa sinh lại, hoặc bảng chép khác kiểu với bảng tạm `#src` (quên `ALTER COLUMN`).

Lỗi 7347 "returned data that does not match expected data length" khi đọc qua linked server là việc phía máy chủ BRAVO, MES không sửa được: view trong database trung gian còn ghi độ dài cột cũ (bảng gốc đã nới sau khi tạo view). Quản trị CSDL bên BRAVO chạy `EXEC sp_refreshview N'dbo.<view>';` trong database trung gian (không đổi câu lệnh view, không đụng dữ liệu), rồi nới cột bên MES như trên nếu độ dài mới lớn hơn bảng chép. Lỗi 7347 chỉ báo cột đầu tiên có dòng dài hơn: refresh và so độ dài mọi view MES đọc, gộp các cột lệch vào một migration. Giữa hai bước (refresh bên BRAVO, migrate bên MES) nguồn đó lỗi 7347 hoặc 2628, không mất dữ liệu (thủ tục dừng, giữ mốc).
