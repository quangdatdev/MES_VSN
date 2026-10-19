# Kiến trúc

File này mô tả cách hệ thống được dựng: thành phần, cấu trúc thư mục, đường đi của một request, các database và quan hệ giữa chúng, quy ước code và database. Đọc trước khi thêm module, thêm bảng hoặc thêm API.

## Sơ đồ tổng thể

```
Trình duyệt (PC, điện thoại)
   │  HTTPS/HTTP, REST /api/v1, cookie refresh
   ▼
Backend NestJS (Modular Monolith, một tiến trình)
   ├─ platform/   nền tảng: auth, phân quyền, BaseRepository, quản trị, danh mục, đồng bộ, nhật ký, xuất file
   └─ modules/    nghiệp vụ: order (Đơn hàng), sewing (May), cutting (Cắt), hr (Nhân sự)
   │  T-SQL (Kysely + tedious), mỗi database một pool kết nối
   ▼
SQL Server 2019/2022
   MES_Core   MES_Order   MES_Sewing   MES_Cutting   MES_Hr   MES_Sync
                                                                │ synonym (chỉ đọc), có thể qua linked server
                                                                ▼
                              Database trung gian BRAVO (view)   Database OSM (view)
```

- Một tiến trình backend phục vụ API. Bản demo, máy chủ nội bộ có thể phục vụ luôn giao diện đã build bằng cờ `--serve-web` (`backend/src/serve-web.ts`): mọi đường dẫn `GET` không bắt đầu bằng `/api/` hay `/assets/` trả `frontend/dist/index.html`. Máy chủ chạy bằng pm2 (cluster một tiến trình), cập nhật bằng `deploy/deploy.cjs` không hạ web ([Vận hành](11-van-hanh.md#cap-nhat-ban-moi-len-may-chu), [Quyết định](13-quyet-dinh.md) mục 1.7).
- Chưa có WebSocket, chưa có hàng đợi ngoài; đồng bộ chạy trong tiến trình backend ([Đồng bộ](09-dong-bo.md)).

## Công nghệ

| Phần | Công nghệ | Ghi chú |
|---|---|---|
| Backend | Node.js 22, NestJS 11, TypeScript 5.9 (strict), CommonJS | Không nâng NestJS 12 khi chưa chuyển cả dự án sang ESM |
| Truy cập database | Kysely 0.28 (`MssqlDialect`), tedious, tarn | Không nâng Kysely 0.29 (ESM) |
| Xác thực | `@nestjs/jwt`, argon2 (băm mật khẩu), cookie-parser, helmet | Chi tiết ở [Phân quyền](04-phan-quyen.md) |
| Kiểm dữ liệu vào | class-validator, class-transformer (`ValidationPipe` toàn cục, `whitelist`) | Lỗi trả `422 VALIDATION_FAILED` |
| Database | SQL Server 2019/2022 (Express dùng được), đăng nhập bằng tài khoản SQL | Cần mức tương thích 130+ (`STRING_SPLIT`) |
| Frontend | React 19, Vite, Mantine 9, TanStack Query 5, Zustand 5, React Router 7, `react-datasheet-grid` (lưới nhập) | `mantine-datatable` có trong `package.json` nhưng không dùng. PWA mới có manifest, chưa có service worker. Chi tiết ở [Giao diện](10-giao-dien.md) |
| Test | Jest + supertest (backend, chạy trên database thật), Vitest + Testing Library (frontend) | [Dữ liệu mẫu và kiểm thử](12-du-lieu-mau-va-kiem-thu.md) |

Repo là npm workspace hai gói `backend`, `frontend` (`package.json` ở gốc).

## Cấu trúc thư mục

```
backend/
  src/
    main.ts, app.module.ts, app.factory.ts   khởi động, cấu hình dùng chung cho main và test e2e
    config/env.ts                            đọc backend/.env, giá trị mặc định, chốt chặn production
    common/                                  AppException + bảng mã lỗi, bộ lọc lỗi toàn cục, nhận diện deadlock
    platform/
      auth/          đăng nhập, phiên, AuthGuard, PermissionGuard, decorator khai báo quyền
      permission/    PermissionService (quyền, phạm vi, phiên bản quyền), BranchService, FieldPolicyService + interceptor
      data/          BaseRepository, ChildRepository, ResourceRegistry, lọc theo cột (column-filter), inTransaction
      database/      createDb, kết nối MES_Core (CORE_DB), kiểu bảng MES_Core
      admin/         API /admin/*: người dùng, vai trò, phân quyền, chính sách cột, ĐVCS, nhật ký
      catalog/       API /admin/catalogs/*: danh mục hệ thống, Nhà máy SX; CatalogLookupService
      sync/          lớp đồng bộ BRAVO, OSM (MES_Sync), API /admin/sync/*
      feed/          SourceFeedService: cổng chỉ đọc dữ liệu đã chép cho module nghiệp vụ
      org/           OrgService (chuyền may, nguồn do module Nhân sự đăng ký: LineSource), UserDirectoryService (tên người dùng)
      me/            API /me/*: thông tin, menu, quyền, chính sách cột của phiên
      audit/         AuditService ghi SysAuditLog
      export/        ExportService: xuất CSV theo đúng chính sách cột
    modules/
      order/         module Đơn hàng (MES_Order)
      sewing/        module May (MES_Sewing)
      cutting/       module Cắt (MES_Cutting)
      hr/            module Nhân sự (MES_Hr)
    health.controller.ts                     GET /api/v1/health (công khai)
  migrations/<Database>/NNNN_ten.sql         migration theo từng database; softkeys.json: khóa ngầm
  scripts/                                   migrate, seed, reset-demo, load-bravo, simulate-board, sync-gen, check-softkeys…
  test/                                      test Jest (*.spec.ts)
frontend/
  src/
    main.tsx, App.tsx                        khởi động, provider, route gốc
    shell/                                   layout, menu, đổi ĐVCS, guard, Can
    routes/                                  bảng đường dẫn → màn (lazy-load), trang giữ chỗ, 403/404
    components/                              thành phần dùng chung: DataGrid, SheetGrid, ColumnFilter, TreeSelect…
    features/<khối>/                         màn hình: auth, home, order, sewing, hr, admin, module, errors
    lib/                                     gọi API, định dạng, xác nhận, chống mất dữ liệu đang nhập…
    store/                                   Zustand: auth (token, khôi phục phiên), session (ĐVCS, menu, quyền)
    theme/                                   theme Mantine, global.css
    perf/, test/                             đo hiệu năng, test Vitest
docs/                                        tài liệu (nằm trong .gitignore: không vào git)
.claude/agents, .claude/skills               agent code-reviewer; skill frontend-design, senior-architect, react-best-practices
```

`backend/src/modules/.gitkeep`, `frontend/src/modules/.gitkeep`, `frontend/src/shell/.gitkeep` là thư mục giữ chỗ, chưa dùng.

## Backend

### Các khối nền tảng được nạp

`backend/src/app.module.ts` nạp: `DatabaseModule`, `PermissionModule`, `AuditModule`, `DataModule`, `OrgModule`, `ExportModule`, `AuthModule`, `MeModule`, `AdminModule`, `SyncModule`, `SourceFeedModule`, `CatalogModule`, `OrderModule`, `SewingModule`, `HrModule`.

- `DatabaseModule` (toàn cục) chỉ giữ kết nối `MES_Core` (`CORE_DB`). Mỗi module nghiệp vụ tự tạo kết nối tới database của mình (`order.db.ts`, `sewing.db.ts`, `hr.db.ts`; lớp đồng bộ có `sync.db.ts`) và tự đóng khi tắt ứng dụng.
- `PermissionModule` (toàn cục) đăng ký `FieldPolicyInterceptor` làm interceptor toàn cục.
- `AuthModule` đăng ký hai guard toàn cục theo thứ tự: `AuthGuard` rồi `PermissionGuard`.

### Đường đi của một request

```
HTTP /api/v1/...
 → helmet, cookie-parser, bộ đọc JSON (tối đa 512 KB)
 → AuthGuard           đọc Bearer token, kiểm phiên; gắn req.authUser
 → PermissionGuard     endpoint phải khai báo @Public, @Authenticated hoặc @RequirePermission('module.resource:action');
                       không khai báo thì 403 ENDPOINT_NOT_DECLARED (deny by default)
 → FieldPolicyInterceptor (endpoint có @FieldResource): kiểm body thô; có cột không được sửa → 403 FIELD_READONLY
 → ValidationPipe      DTO class-validator, bỏ trường thừa; sai thì 422 VALIDATION_FAILED
 → Controller → Service → Repository (kế thừa BaseRepository/ChildRepository: lọc ĐVCS, phạm vi, chặn ghi ở A00)
 ← FieldPolicyInterceptor: bỏ cột Ẩn, che cột Che (***) trong dữ liệu trả về
 ← AllExceptionsFilter: mọi lỗi thành { error: { code, message, details }, traceId }
```

- `BranchCode` của phiên lấy từ token do server cấp, không bao giờ nhận từ body, query, header.
- Lỗi nghiệp vụ dùng `AppException` với mã ổn định (`backend/src/common/app.exception.ts`, đối tượng `Errors`). Deadlock của SQL Server thành `409 CONFLICT` "thử lại sau vài giây". Lỗi khác 500 ghi log kèm `traceId`.
- Chi tiết từng lớp phân quyền: [Phân quyền](04-phan-quyen.md).

### Ranh giới module

- Module nghiệp vụ không import phần bên trong module khác; chỉ dùng API công khai. Lint cưỡng chế bằng `no-restricted-imports` trong `backend/eslint.config.mjs`:
  - `sewing` chỉ được dùng `OrderModule` và `ScheduleFeed` (`order/schedule-feed.service.ts`) của module Đơn hàng (đọc dàn chuyền).
  - `order` không phụ thuộc `sewing`; `hr` không phụ thuộc `order`, `sewing`; không module nào import phần bên trong `hr`.
  - Không module nghiệp vụ nào import `platform/sync/*`: dữ liệu chép từ BRAVO, OSM đọc qua `SourceFeedService` (`platform/feed`), tên và danh mục BRAVO qua `CatalogLookupService` (`platform/catalog`).
  - `platform` (`src/platform/**`) không import `modules`: module cấp dữ liệu cho nền tảng bằng cách đăng ký vào service của nền tảng lúc khởi động (module Nhân sự đăng ký `LineSource` vào `OrgService`, [Nhân sự](08-nhan-su.md)).
  - Thêm module mới thì phải thêm khối luật tương ứng (flat config không gộp luật cùng tên giữa các khối).
- Module đọc dữ liệu nền tảng qua service công khai: `OrgService` (chuyền may), `UserDirectoryService` (tên người dùng), `BranchService` (ĐVCS), `CatalogLookupService`, `ExportService`, `AuditService`. Không module nào đọc thẳng bảng `MES_Core`.
- Module nghiệp vụ mới theo khuôn: `<module>.module.ts`, `<module>.controller.ts`, `*.service.ts`, `<module>.repositories.ts` (lớp con của `BaseRepository`), `<module>.dto.ts`, `<module>.types.ts` (kiểu bảng), `<module>.db.ts` (kết nối), migration ở `backend/migrations/MES_<Module>/`.

### Kết nối và transaction

- `createDb(database, opts)` (`backend/src/platform/database/db.ts`) tạo một `Kysely` cho một database: pool tối đa 10 kết nối (đổi được), tùy chọn `requestTimeoutMs` (thủ tục đồng bộ cần lâu hơn mặc định 15 giây), `failFast` (không thử lại khi không mở được kết nối).
- `inTransaction(db, fn)` (`backend/src/platform/data/transaction.ts`) giữ lỗi gốc khi SQL Server đã tự rollback (deadlock), để người dùng nhận đúng thông báo "thử lại".
- **Không có transaction chung giữa các database.** Thao tác chạm hai database phải tự xử lý thứ tự và trường hợp lỗi giữa chừng.

## Frontend (tóm tắt)

- Ứng dụng một trang. `App.tsx`: `/login` (chỉ khi chưa đăng nhập), `/` Trang chủ, mọi đường dẫn khác qua `FallbackRoute`: có trong menu và đã đăng ký màn thì nạp lười màn đó, có trong menu mà chưa có màn thì trang giữ chỗ, thuộc module mà không có trong menu thì 403, còn lại 404.
- Khi phát triển, Vite chạy cổng 5173 và chuyển `/api` sang `http://localhost:3000` để cookie refresh (`SameSite=Strict`) cùng origin.
- Giao diện chỉ ẩn/hiện theo quyền; mọi kiểm soát thật nằm ở backend.
- Chi tiết: [Giao diện](10-giao-dien.md).

## Database

Mỗi module một database. Tên thật đặt qua `.env` (mặc định như cột đầu). Bảng của từng database mô tả ở tài liệu của khối sở hữu.

| Database | Biến môi trường | Sở hữu | Nội dung | Tài liệu bảng |
|---|---|---|---|---|
| `MES_Core` | `DB_CORE_NAME` | nền tảng | Người dùng, vai trò, quyền, phiên, nhật ký, menu, tài nguyên; ĐVCS (kèm nút gốc cây tổ chức cho phạm vi), danh mục, Nhà máy SX | [Phân quyền](04-phan-quyen.md), [Quản trị hệ thống](05-quan-tri-he-thong.md) |
| `MES_Order` | `DB_ORDER_NAME` | `order` | Đơn hàng, PO, màu cỡ, kế hoạch xuất hàng, xếp chuyền, Phân bổ PO | [Đơn hàng](06-don-hang.md) |
| `MES_Sewing` | `DB_SEWING_NAME` | `sewing` | Kế hoạch chuẩn bị SX, danh mục bước chuẩn bị, Kế hoạch may | [May](07-may.md) |
| `MES_Cutting` | `DB_CUTTING_NAME` | `cutting` | Đồng bộ tiến độ cắt: bản chép kế hoạch xuất hàng và màu cỡ (`CuttingPlan`, `CuttingPlanColorSize`), số cắt theo ngày (`CuttingPlanDaily`); Xác nhận cấp BTP: lệnh cấp (`CuttingSupply`), số cấp theo chuyền, màu, cỡ (`CuttingSupplyLine`) | [Cắt](15-cat.md) |
| `MES_Hr` | `DB_HR_NAME` | `hr` | Loại phòng ban, phòng ban (bộ phận tích "Xưởng sản xuất" là chuyền may), chức danh, nhân viên | [Nhân sự](08-nhan-su.md) |
| `MES_Sync` | `DB_SYNC_NAME` | nền tảng (`platform/sync`) | Bảng chép BRAVO (`bravo.*`), OSM (`osm.*`), nguồn và nhật ký đồng bộ, thủ tục chép | [Đồng bộ](09-dong-bo.md) |

`MES_Demo` (màn PO demo cũ) đã bỏ, không còn migration hay code; database cũ trên máy nào còn thì xóa tay được.

### Migration

- File `backend/migrations/<Database>/NNNN_ten.sql`, chạy theo thứ tự tên file. Mỗi file chạy trong **một transaction**, tách lô theo dòng `GO`. Đã chạy thì ghi tên vào `dbo.__MigrationHistory` của database đó (chỉ lưu tên file: sửa file đã chạy không có tác dụng, phải thêm file mới).
- `npm run migrate` chạy mọi database rồi nạp dữ liệu hệ thống (seed không dữ liệu mẫu); `npm run migrate -- MES_Order` chỉ chạy một database, không seed. Chi tiết, điều kiện, xử lý lỗi: [Vận hành](11-van-hanh.md).
- Migration của `MES_Sync` có phần sinh tự động bằng `backend/scripts/sync-gen.ts` (không sửa tay, xem [Đồng bộ](09-dong-bo.md)). Sau mỗi lần migrate `MES_Sync`, script tạo lại synonym trỏ tới database nguồn theo `.env`.

| Database | File | Nội dung |
|---|---|---|
| `MES_Core` | `0001_init` | Bảng lõi: người dùng, ĐVCS, vai trò, quyền, menu, tài nguyên, phiên, nhật ký, chính sách cột, ngoại lệ, phiên bản quyền |
| | `0002_scope_field_override` | Phân quyền phạm vi (cây `SysOrgUnit`, chiều phạm vi, phạm vi theo phép gán), cột đăng ký, nhật ký đọc dữ liệu nhạy cảm; chỉ một đơn vị tổng hợp |
| | `0003_catalog` | Danh mục hệ thống: `SysCatalog`, `SysCatalogItem`, `SysShift` |
| | `0004_move_prep_to_order` | Đổi mã tài nguyên `sewing.prep` → `order.prep`, đường dẫn `/sewing/prep` → `/order/prep` (giữ Id) |
| | `0005_org_workshop` | Cây tổ chức thêm cấp Xưởng: gốc → Xưởng → Chuyền, ràng buộc cấp trong database |
| | `0006_org_path_guard` | Siết ràng buộc cấp và đường dẫn (`Path`) của cây tổ chức |
| | `0007_production_factory` | `SysBranch` thành Đơn vị cơ sở; danh mục Nhà máy SX `SysProductionFactory`; bảng `SysUserProductionFactory` |
| | `0008_factory_code_osm` | Mã Nhà máy SX là tên nhà máy OSM (`NVARCHAR(100)`, không dấu phẩy, không khoảng trắng đầu cuối) |
| | `0009_line_scope_by_code` | Phạm vi chiều Chuyền theo mã bộ phận (chiều giá trị): chuyển phạm vi cũ theo nút cây tổ chức sang mã, ngừng nút Xưởng, Chuyền của `SysOrgUnit`, nhật ký, tăng phiên bản quyền. Dừng backend trước khi chạy; chạy cùng bản build có nguồn chuyền mới ([Vận hành](11-van-hanh.md)) |
| | `0010_grant_poallocation_update` | Máy đã cài: cấp `order.poallocation:update` cho vai trò hệ thống Kế hoạch, Toàn quyền; đặt bảng nguồn `PoAllocation`; nhật ký `ROLE_PERMISSIONS`; tăng phiên bản quyền. Database chưa seed: không làm gì |
| | `0011_work_calendar` | Lịch làm việc theo ĐVCS: `SysWorkCalendar`, `SysWorkCalendarDay` (phase 5.12) |
| | `0012_grant_cutting_progress` | Máy đã cài: cấp `cutting.progress` Sửa, Xuất cho vai trò hệ thống Kế hoạch khi vai trò còn quyền Xem (không cấp cho Toàn quyền: đã có từ seed); nhật ký `ROLE_PERMISSIONS` cùng dạng màn Vai trò; tăng phiên bản quyền khi có cấp. Bảng nguồn `CuttingPlan` do seed đặt. Database chưa seed: không làm gì |
| | `0013_grant_cutting_supply` | Máy đã cài: cấp `cutting.supply` Thêm, Sửa, Xóa, Xuất cho vai trò hệ thống Kế hoạch khi vai trò còn quyền Xem (như `0012`); nhật ký `ROLE_PERMISSIONS`; tăng phiên bản quyền khi có cấp. Bảng nguồn `CuttingSupply` do seed đặt. Database chưa seed: không làm gì |
| | `0014_work_calendar_rounding` | Cột `SysWorkCalendar.ProductionRoundUpFrom`: ngưỡng làm tròn Số ngày SX (5.12.3) |
| `MES_Order` | `0001_order_init` | Bảng đơn hàng, PO, màu cỡ, kế hoạch xuất hàng, xếp chuyền; khóa ngoại ghép `(…, BranchCode)` |
| | `0002_order_owner_index` | Chỉ mục `CreatedBy` cho phạm vi "do mình tạo" |
| | `0003_order_bravo_source` | Nhận dữ liệu BRAVO: nới mã hàng, tên màu; khóa nguồn |
| | `0004_sales_order_factory` | Cột Nhà máy SX của đơn hàng |
| | `0005_shared_sales_order` | Đơn hàng, PO dùng chung toàn công ty; kế hoạch nối đơn hàng theo `Id` |
| | `0006_sales_order_source_hash` | `SourceHash` cho bước nạp tăng dần |
| | `0007_factory_osm_po_number` | Nhà máy SX là danh sách mã theo OSM; `PoNumber NVARCHAR(192)` |
| | `0008_po_used_by_plan_branch` | Khóa ngoại PO → đơn hàng theo `Id`; chỉ mục PO trong kế hoạch theo ĐVCS |
| | `0009_po_allocation` | Bảng làm việc Phân bổ PO `PoAllocation` (Nhà máy SX nhập tay) và bảng trạng thái lần làm mới `PoAllocationRefresh` |
| `MES_Sewing` | `0001_sewing_prep` | Danh mục bước chuẩn bị, kế hoạch chuẩn bị SX và ngày từng bước |
| | `0002_sewing_prep_source` | Nhận diện dòng dàn chuyền nguồn chắc hơn; chỉ mục khóa ngầm |
| | `0003_sewing_day_plan` | Kế hoạch may: `SewingDayPlan` (một chuyền, một ngày, trạng thái chốt; `LineCode NVARCHAR(20)`), `SewingDayPlanItem` (một dòng dàn chuyền trong ngày: số nhập và bản chụp từ Xếp chuyền; xóa theo cha) |
| | `0004_sewing_day_plan_item_created_by` | Chỉ mục khóa ngầm `SewingDayPlanItem.CreatedBy` |
| `MES_Cutting` | `0001_cutting_progress` | `CuttingPlan` (bản chép đầu kế hoạch; mất nguồn mà còn số cắt thì `ShipmentPlanId = NULL`, `SourceDeletedAt`), `CuttingPlanColorSize`, `CuttingPlanDaily` (một dòng mỗi kế hoạch, màu, cỡ, ngày; `Qty > 0`); khóa ngoại ghép `(CuttingPlanId, BranchCode)`: bảng màu cỡ chép xóa theo cha, bảng số cắt không (lỡ xóa kế hoạch còn số cắt thì database từ chối). Database phải cùng collation với `MES_Core`, `MES_Order` |
| | `0002_cutting_supply` | `CuttingSupply` (lệnh cấp BTP, một lệnh mỗi ĐVCS, Ngày cấp, mã hàng; số lệnh theo ĐVCS và năm), `CuttingSupplyLine` (số cấp theo chuyền, màu, cỡ; `Qty > 0`; xóa theo lệnh) |
| | `0003_cutting_supply_indexes` | Chỉ mục `CuttingSupply (CreatedBy)`, `(ConfirmedBy)` (có lọc NOT NULL), `CuttingPlan (BranchCode, StyleCode)` |
| `MES_Hr` | `0001_hr_init` | Loại phòng ban, phòng ban, chức danh, nhân viên |
| | `0002_department_production_workshop` | Cột `Department.IsProductionWorkshop` (bộ phận là chuyền may), bắt buộc có ĐVCS khi tích, chỉ mục có lọc cho nguồn chuyền |
| `MES_Sync` | `0001_sync_core` | `SyncSource`, `SyncRun`, thủ tục điều phối |
| | `0002_bravo_order_sources` | 18 bảng chép BRAVO (đơn hàng, PO, màu cỡ, danh mục) và thủ tục chép (sinh tự động) |
| | `0003_sync_procs_name_columns` | Sửa thủ tục chép (lỗi 8155) |
| | `0004_sync_guard_keys_mass_delete` | Thủ tục chép dừng khi khóa NULL/trùng hoặc xóa quá 20% bảng |
| | `0005_osm_factory_source` | Nguồn OSM `vOSMDataFty` → `osm.OSMDataFty` |
| | `0006_sync_execute_osm` | Thủ tục điều phối chạy được nguồn schema `osm` |
| | `0007_osm_po_allocation` | Nguồn OSM `v_OSMData` → `osm.OSMData` (màn Phân bổ PO) |

### Khóa ngầm giữa các database

Khóa ngoại vật lý chỉ có trong cùng database. Cột trỏ sang database khác là **khóa ngầm**: khai báo ở `backend/migrations/softkeys.json`, có chỉ mục, kiểm bản ghi mồ côi bằng `npm run check:softkeys -w backend` (chỉ đọc, thoát mã 1 khi có mồ côi; database chưa có thì bỏ qua kèm cảnh báo).

| Từ | Tới | Điều kiện |
|---|---|---|
| `MES_Order.SalesOrder`, `SalesOrderPo`, `SalesOrderPoColorSize`, `ShipmentPlan`, `ShipmentPlanPo`, `ShipmentPlanColorSize`, `ShipmentPlanLine`, `ShipmentPlanLineColorSize` `.BranchCode` | `MES_Core.SysBranch.Code` | |
| `MES_Order.ShipmentPlanLine.LineCode` | `MES_Hr.Department.Code` | Cùng ĐVCS; không lọc theo cờ "Xưởng sản xuất" (bộ phận bỏ tích, giải thể vẫn hợp lệ). Mã chuyền cũ không còn là bộ phận nào là mồ côi |
| `MES_Order.SalesOrder.ProductionFactoryCode` | `MES_Core.SysProductionFactory.Code` | Có thể NULL; danh sách mã cách nhau dấu phẩy, từng mã phải có |
| `MES_Order.SalesOrder.CreatedBy`, `SalesOrderPo.CreatedBy`, `SalesOrderPo.ConfirmedBy`, `ShipmentPlan.CreatedBy`, `ShipmentPlanLine.CreatedBy` | `MES_Core.SysUser.Id` | Có thể NULL |
| `MES_Order.PoAllocation.CreatedBy`, `PoAllocation.ModifiedBy` | `MES_Core.SysUser.Id` | Có thể NULL. `PoAllocation.ProductionFactoryCode` không khai: tên nhà máy của `v_OSMData` không tự vào danh mục ([Đơn hàng](06-don-hang.md)) |
| `MES_Sync.SyncRun.CreatedBy` | `MES_Core.SysUser.Id` | Có thể NULL |
| `MES_Sewing.SewingPrep.BranchCode`, `SewingPrepStep.BranchCode` | `MES_Core.SysBranch.Code` | |
| `MES_Sewing.SewingPrep.ShipmentPlanLineId` | `MES_Order.ShipmentPlanLine.Id` | Cùng ĐVCS |
| `MES_Sewing.SewingPrep.ShipmentPlanId` | `MES_Order.ShipmentPlan.Id` | Cùng ĐVCS |
| `MES_Sewing.SewingPrep.LineCode` | `MES_Hr.Department.Code` | Như `ShipmentPlanLine.LineCode` |
| `MES_Sewing.SewingDayPlan.BranchCode`, `SewingDayPlanItem.BranchCode` | `MES_Core.SysBranch.Code` | |
| `MES_Sewing.SewingDayPlan.LineCode` | `MES_Hr.Department.Code` | Cùng ĐVCS; cột `NVARCHAR(20)` trỏ tới mã `VARCHAR(20)` (phase 5.16 Q1), so trong code |
| `MES_Sewing.SewingDayPlan.LockedBy`, `SewingDayPlan.CreatedBy` | `MES_Core.SysUser.Id` | Có thể NULL |
| `MES_Sewing.SewingDayPlanItem.ShipmentPlanLineId`, `SewingDayPlanItem.ShipmentPlanId` | `MES_Order.ShipmentPlanLine.Id`, `MES_Order.ShipmentPlan.Id` | Cùng ĐVCS; dòng nguồn nhận diện kèm `SourceCreatedAt` |
| `MES_Cutting.CuttingPlan.BranchCode`, `CuttingPlanColorSize.BranchCode`, `CuttingPlanDaily.BranchCode` | `MES_Core.SysBranch.Code` | |
| `MES_Cutting.CuttingPlan.ShipmentPlanId` | `MES_Order.ShipmentPlan.Id` | Cùng ĐVCS; có thể NULL (kế hoạch đã xóa mà còn số cắt, quyết định 13.2) |
| `MES_Hr.Department.BranchCode` | `MES_Core.SysBranch.Code` | Có thể NULL; không phải đơn vị tổng hợp |
| `MES_Hr.Department.CreatedBy`, `Employee.CreatedBy` | `MES_Core.SysUser.Id` | Có thể NULL |

Thêm cột trỏ sang database khác thì thêm dòng vào `softkeys.json` (trường `from`, `to`, tùy chọn `where`, `sameBranch`, `catalog`, `list`, `nullable`) và chỉ mục cho cột đó.

## Quy ước database

- Tên bảng, cột: PascalCase, không dấu, tiếng Anh, **số ít**; bảng con mang tiền tố bảng cha (`SalesOrderPoColorSize`). Không lặp tên bảng vào tên cột (`Name`, không `BranchName`); riêng `BranchCode` là tên chuẩn đã chốt.
- Tiền tố `Sys` cho bảng lõi ở `MES_Core` (tránh từ khóa như `User`).
- Khóa chính `Id`; khóa ngoại/ngầm `<BảngĐích>Id`; ngày `…Date`; thời điểm `…At` kiểu `DATETIME2(3)` giờ UTC; cờ `Is…`; khoảng phút `…Minutes`.
- **Bảng danh mục:** `Id, Code, Name, Description, SortOrder, IsActive, IsSystem, CreatedAt, CreatedBy, ModifiedAt, ModifiedBy`. Không xóa vật lý, ngừng dùng bằng `IsActive`. Mã không sửa sau khi tạo (có trigger hoặc kiểm ở service, tùy bảng).
- **Bảng giao dịch:** `Id`, cột nghiệp vụ, `BranchCode`, `CreatedAt, CreatedBy, ModifiedAt, ModifiedBy`.
- `BranchCode` kiểu `VARCHAR(10)`, có chỉ mục, cấm sửa sau khi tạo. Bảng theo ĐVCS bắt buộc có cột này; bảng con mang `BranchCode` của cha và có khóa ngoại ghép `(ParentId, BranchCode)` tới `UNIQUE (Id, BranchCode)` của cha, để dòng con không bao giờ khác ĐVCS với dòng cha.
- Bảng dùng chung toàn công ty phải khai báo `ScopeType = 'SHARED'` trong `SysResource`; chưa khai báo thì repository từ chối chạy (`500 RESOURCE_NOT_REGISTERED`).
- Không chèn dòng đại diện cho "không có", dùng `NULL`.
- Schema chỉ đổi qua migration có số thứ tự; mỗi database một thư mục. Trước khi đặt tên bảng, cột mới, đối chiếu từ khóa dành riêng của SQL Server.

## Quy ước code

- TypeScript strict ở cả hai gói. Mã định danh, tên biến tiếng Anh; giao diện, thông điệp lỗi, comment, tài liệu tiếng Việt có dấu.
- Không SQL thô trong controller, service; mọi truy vấn nghiệp vụ đi qua repository kế thừa `BaseRepository`/`ChildRepository`. Module không tự viết điều kiện phân quyền. (SQL thô có trong migration, script, thủ tục đồng bộ và một số truy vấn nền tảng có lý do riêng.)
- Mã lỗi API nhất quán qua `Errors`/`AppException`; frontend xử lý theo `error.code`.
- Khác biệt giữa các ĐVCS, nhà máy nằm trong bảng cấu hình, không rẽ nhánh `if (ĐVCS)` trong code.
- Comment chỉ giải thích "vì sao", không mô tả lại code.
- Backend và frontend chưa có gói `shared` dùng chung kiểu: kiểu API ở frontend khai báo trong `frontend/src/lib/types.ts` và `features/*/types.ts`, `features/*/api.ts`.
- Lint: `npm run lint` (ESLint, `--max-warnings 0` cả hai gói). Luật ranh giới import chỉ có ở backend; frontend chưa có (màn Quản trị đang import `features/hr`, `features/sewing`).
