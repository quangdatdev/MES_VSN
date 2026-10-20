# Quy ước code

| Mục | Nội dung |
|---|---|
| Mục đích | Quy ước đặt tên, cấu trúc, API, kiểm dữ liệu, xử lý lỗi, truy cập database, tái sử dụng, tổ chức test |
| Đối tượng | Dev, reviewer, AI agent khi viết hoặc sửa code |
| Nguồn quy tắc | Luật bắt buộc (phân quyền, ranh giới, an toàn) ở [AGENTS.md](../AGENTS.md); file này mô tả cách làm cụ thể, có ví dụ và chỗ tham chiếu |
| Đối chiếu code | Commit `98d19db` trên `main` (19/10/2026) |

Nhãn trạng thái của từng quy ước:

| Nhãn | Nghĩa |
|---|---|
| **CURRENT** | Cách làm đang có trong code, đã kiểm |
| **APPROVED** | Quy tắc mới đã được Tech Lead duyệt, code có thể chưa theo hết |
| **PROPOSED** | Đề xuất, chưa duyệt: không bắt buộc (hiện không còn mục nào; các đề xuất trước đây được Tech Lead duyệt 19/10/2026) |
| **NEEDS VERIFICATION** | Chưa đủ bằng chứng |

## 1. Đặt tên

### 1.1 Database — CURRENT

- Bảng, cột: PascalCase, tiếng Anh, không dấu, **số ít**; bảng con mang tiền tố bảng cha (`SalesOrderPoColorSize`); tiền tố `Sys` cho bảng lõi ở `MES_Core` (`SysUser`, tránh từ khóa `User`). Không lặp tên bảng vào tên cột (`Name`, không `BranchName`); riêng `BranchCode` là tên chuẩn.
- Khóa chính `Id`; khóa ngoại, khóa ngầm `<BảngĐích>Id`; ngày `…Date`; thời điểm `…At` kiểu `DATETIME2(3)` giờ UTC; cờ `Is…`; khoảng phút `…Minutes`.
- Bảng danh mục: `Id, Code, Name, Description, SortOrder, IsActive, IsSystem, CreatedAt, CreatedBy, ModifiedAt, ModifiedBy`. Bảng giao dịch: `Id`, cột nghiệp vụ, `BranchCode VARCHAR(10)`, `CreatedAt, CreatedBy, ModifiedAt, ModifiedBy`.
- Đối chiếu từ khóa dành riêng của SQL Server trước khi đặt tên mới.

### 1.2 Code — CURRENT

| Đối tượng | Quy ước | Ví dụ |
|---|---|---|
| Định danh TypeScript | Tiếng Anh, camelCase/PascalCase | `CuttingProgressService`, `scopeOf` |
| File backend | kebab-case theo vai trò | `cutting-progress.service.ts`, `cutting.repositories.ts`, `cutting.dto.ts`, `cutting.types.ts`, `cutting.db.ts`, `cutting.module.ts` |
| File frontend | Màn hình PascalCase `…Page.tsx`; API của khối `api.ts`; luật thuần `…Rules.ts` | `features/cutting/CuttingProgressPage.tsx`, `features/cutting/cuttingProgressRules.ts` |
| Mã quyền | `module.resource:action`, hành động `view`, `create`, `update`, `delete`, `export` | `cutting.progress:update` |
| Mã menu | `menu.<module>` (nhóm), `menu.<tài nguyên>` (lá) | `menu.order.po` (`frontend/src/shell/permissions.ts`, `resourceOf`) |
| Mã lỗi API | UPPER_SNAKE, ổn định | `AGGREGATE_READ_ONLY` |
| Khóa ứng dụng SQL | `<Database>.<Bảng>.<việc>` | `MES_Cutting.CuttingPlan.sync` |
| Khóa `localStorage` | Tiền tố `mes.` (màn Nhân sự dùng `hr.`) | `mes.nav.collapsed`, `mes.branch.<userId>` |

### 1.3 Ngôn ngữ — CURRENT

- Định danh, tên bảng, cột, biến môi trường: tiếng Anh.
- Chữ trên giao diện, thông điệp lỗi API, comment, tài liệu: tiếng Việt có đầy đủ dấu. Thông điệp lỗi nói rõ chuyện gì xảy ra và cách xử lý.
- Comment chỉ giải thích "vì sao", không mô tả lại code.
- Trên giao diện, `SysBranch` luôn gọi là "Đơn vị cơ sở" (cột ngắn "ĐVCS"), không gọi là "nhà máy".

Đúng:

```ts
// Route tĩnh (values, export) khai báo trước route ":id" để không bị hiểu nhầm thành Id.
```

Tránh:

```ts
// Gọi service để lưu
```

## 2. Cấu trúc file và module

### 2.1 Backend — CURRENT

```
backend/src/modules/<module>/
  <module>.module.ts         khai controller, provider; imports module khác qua API công khai
  <module>.controller.ts     route + decorator quyền, mỗi handler gọi một hàm service
  *.service.ts               luật nghiệp vụ, transaction
  <module>.repositories.ts   lớp con BaseRepository/ChildRepository
  <module>.dto.ts            DTO class-validator
  <module>.types.ts          kiểu bảng Kysely
  <module>.db.ts             kết nối database của module (createDb) + đóng khi tắt
backend/migrations/MES_<Module>/NNNN_ten.sql
```

Tham chiếu: `backend/src/modules/cutting/`. Thêm module mới cần thêm khối luật lint riêng ở `backend/eslint.config.mjs` (flat config không gộp luật cùng tên giữa các khối) và biến tên database ở `backend/src/config/env.ts`, `backend/scripts/database-names.ts`.

### 2.2 Frontend — CURRENT

```
frontend/src/features/<khối>/
  <Tên>Page.tsx     màn hình, đăng ký ở routes/registry.tsx
  api.ts            gọi API của khối qua lib/api.ts
  types.ts          kiểu dữ liệu của khối (khi cần)
  <tên>Rules.ts     luật tính thuần (không React), test riêng
```

Thêm màn: đăng ký đường dẫn ở `frontend/src/routes/registry.tsx`, tài nguyên và menu ở `backend/scripts/seed-data.ts`.

## 3. Controller, service, utility

### 3.1 Controller mỏng — CURRENT

Mỗi handler khai quyền và gọi đúng một hàm service. `@FieldResource` đặt ở controller của màn có cột đăng ký. Route tĩnh khai trước route `:id`.

Đúng (`backend/src/modules/cutting/cutting.controller.ts`):

```ts
@Controller('cutting/progress')
@FieldResource('cutting.progress')
export class CuttingProgressController {
  @Get('export') @RequirePermission('cutting.progress:export')
  export(@CurrentUser() u: AuthUser, @Query() q: CuttingListQuery) { return this.service.export(u, q); }

  @Put(':id') @RequirePermission('cutting.progress:update')
  save(@CurrentUser() u: AuthUser, @id() pid: number, @Body() dto: CuttingSaveDto) { return this.service.save(u, pid, dto); }
}
```

Tránh: handler không có decorator quyền (bị 403 `ENDPOINT_NOT_DECLARED`), đọc `branchCode` từ `@Query`/`@Body`/`@Headers` để lọc dữ liệu, gọi database trong controller.

### 3.2 Service — CURRENT

Khuôn ghi dữ liệu: `scopeOf(user)` → `assertWritable` → `getById(…, 'update')` → kiểm luật → `inTransaction` (khóa, đọc lại, ghi) → nhật ký.

Đúng (rút gọn từ `CuttingProgressService.save`, `backend/src/modules/cutting/cutting-progress.service.ts`):

```ts
const scope = scopeOf(user);
await this.repo.assertWritable(scope);
await this.repo.getById(scope, id, 'update');
const result = await inTransaction(this.db, async (trx) => {
  await this.repo.lock(scope, id, 'update', trx);
  const row = await this.repo.getById(scope, id, 'update', trx);
  // kiểm luật, ghi bảng con qua ChildRepository
});
```

### 3.3 Kiểm tra xuyên module bằng đăng ký ngược — CURRENT

Module phụ thuộc đăng ký hàm kiểm vào API công khai của module được phụ thuộc; module được phụ thuộc không import ngược. Ví dụ: `SewingPlanService` gọi `this.guards.register(...)` vào `LineDayPlanGuards` của module Đơn hàng; `HrLineSource` đăng ký vào `OrgService`. Danh sách: [ARCHITECTURE.md](ARCHITECTURE.md) mục 4.

### 3.4 Khác biệt giữa ĐVCS nằm trong cấu hình — CURRENT

Không rẽ nhánh theo mã ĐVCS, nhà máy cụ thể; khác biệt nằm trong bảng cấu hình (Lịch làm việc theo ĐVCS, Nhà máy SX gắn ĐVCS). Ngoại lệ có chủ ý: mã `A00` dành cho đơn vị tổng hợp bị chặn khi thêm ĐVCS tay (`backend/src/platform/admin/admin-branches.service.ts`). Dữ liệu `A01` trong `frontend/src/perf/*`, `frontend/src/test/*` là dữ liệu giả.

### 3.5 Frontend

| Quy ước | Trạng thái | Tham chiếu |
|---|---|---|
| Lưới xem dùng `DataGrid`, lưới nhập dùng `SheetGrid` | CURRENT | `frontend/src/components/DataGrid.tsx`, `SheetGrid.tsx`; [13](update_docs/13-quyet-dinh.md) mục 11.1 |
| Ẩn/hiện theo quyền bằng `useCan`, `<Can>`, `useFieldPolicy`; chặn ghi ở `A00` bằng `useCanWrite` | CURRENT; ba màn tự đọc `branch.isAggregate` (`PrepPlanPage.tsx`, `SewingPlanPage.tsx`, `CuttingProgressPage.tsx`) | `shell/permissions.ts`, `shell/Can.tsx`, `lib/fieldPolicy.ts`, `features/order/common.tsx` |
| Token chỉ trong bộ nhớ, không `localStorage`/`sessionStorage` | CURRENT | `store/session.ts` |
| Khóa truy vấn TanStack Query của dữ liệu theo ĐVCS có mã ĐVCS; chỉ làm mới khóa bị ảnh hưởng | CURRENT ở phần lớn màn; lệch ở `SewingPlanPage.tsx` (khóa thiếu ĐVCS) và hai màn Cắt (làm mới cả nhóm `['order']`) | [10 Giao diện](update_docs/10-giao-dien.md) mục 8.4 |
| Quy tắc UI/UX (một nút chính, nút khóa nói lý do, cỡ chữ, tương phản, màn 360px…) và quy tắc hiệu năng (`columns` ổn định, không Tooltip trong ô lặp, không tách CSS Mantine…) | CURRENT, kiểm bằng review, không có công cụ | [10 Giao diện](update_docs/10-giao-dien.md) mục 12, 13 |

## 4. API contract và kiểu dữ liệu

### 4.1 Route — CURRENT

- Dạng `/api/v1/<khối>/<tài nguyên số nhiều, kebab-case>`; hành động phụ là đoạn con: `/:id/confirm`, `/values` (popup lọc), `/export` (xuất file).
- **APPROVED (19/10/2026):** mọi `DELETE` trả **200 kèm `{ removed: true }`** (như `DELETE /cutting/supply/:id`). `DELETE /cutting/progress/:id/entries` (xóa số cắt, không xóa kế hoạch) hiện trả 200 kèm số đã xóa `{ removedDays, removedRows, planRemoved }` (`CuttingProgressService.removeEntries`); Tech Lead chốt 20/10/2026 đổi theo chuẩn (Q52). Hiện còn trả 204 (`@HttpCode(204)`): `DELETE /order/sales-orders/:id`, `/order/cut-ratio/pos/:id`, `/order/shipment-plans/:id`, `/admin/users/:id/overrides/:overrideId`, `/admin/users/:id/field-policies/:policyId`, `/admin/roles/:id`: đổi ở task T7 (sửa cả frontend nếu đang chờ body rỗng). `POST /auth/logout` không phải lệnh xóa dữ liệu, giữ 204.

### 4.2 DTO — CURRENT

- Mỗi tham số query, body có DTO `class-validator`. Query số dùng `@Type(() => Number)`. Chuỗi có `MaxLength`. Ngày chỉ có ngày kiểm hai lớp: regex dạng và `IsISO8601({ strict: true })` (để ngày không có thật không tới SQL Server thành 500).
- Sắp xếp, lọc theo danh sách trắng do máy chủ dựng (`CUTTING_SORT`, `CUTTING_FILTER: FilterSpec`), không nhận tên cột từ client.

Đúng (`backend/src/modules/cutting/cutting.dto.ts`):

```ts
export class CuttingListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize: number = 100;
  @IsOptional() @DateOnly() @RealDate() shipFrom?: string;
  @IsOptional() @IsString() @MaxLength(20000, { message: 'Bộ lọc theo cột quá dài.' }) cf?: string;
}
```

Tránh: nhận `any` làm body; ghép tên cột từ query vào `orderBy`.

### 4.3 Kiểu dùng chung — CURRENT

Không có gói kiểu chung giữa backend và frontend. Kiểu API ở frontend khai trong `frontend/src/lib/types.ts`, `features/*/types.ts`, `features/*/api.ts`. Kiểu bảng backend ở `<module>.types.ts` và `platform/database/core.types.ts`.

## 5. Kiểm dữ liệu và xử lý lỗi

| Quy ước | Trạng thái | Tham chiếu |
|---|---|---|
| Lỗi nghiệp vụ dùng `Errors.*` (`AppException` có `code`, `message`, `status`, `details`) | CURRENT | `backend/src/common/app.exception.ts` |
| Có mã lỗi tạo bằng `new AppException` ngoài `Errors`: `FIELD_NOT_READABLE` (`platform/data/column-filter.ts`, `cutting-progress.service.ts`, `po-allocation.service.ts`), `LINE_SCOPE_UPDATE_FAILED` (`permission.service.ts`) | CURRENT (lệch) | APPROVED (19/10/2026): gom vào `Errors`, task T10 |
| Thông điệp tiếng Việt nói cách xử lý; số liệu cấu trúc đặt ở `details` | CURRENT | `Errors.factoryOfOtherBranch` |
| Lỗi validate: 422 `VALIDATION_FAILED` từ `ValidationPipe`; DTO lồng nhau chỉ lấy `constraints` cấp đầu nên mất thông điệp con | CURRENT | `backend/src/app.factory.ts` |
| Deadlock thành 409 `CONFLICT`; lỗi khác không phải `HttpException` thành 500 `INTERNAL_ERROR` kèm `traceId` | CURRENT | `common/http-exception.filter.ts` |
| Không nuốt lỗi im lặng; Promise luôn được `await` | CURRENT, kiểm bằng review (lint không bật luật type-checked) | `backend/eslint.config.mjs` |
| Frontend hiện lỗi qua `ApiError` + `toastError`; không tự dịch mã lỗi trừ màn đăng nhập | CURRENT | `frontend/src/lib/api.ts`, `lib/notify.ts` |

Đúng:

```ts
throw Errors.conflict('Kế hoạch xuất hàng vừa bị xóa nên không lưu được số cắt. Tải lại màn hình.');
```

Tránh:

```ts
throw new Error('Không lưu được');           // thành 500 INTERNAL_ERROR, mất mã lỗi
throw new HttpException('Conflict', 409);    // mã BAD_REQUEST chung chung, thông điệp tiếng Anh
```

## 6. Truy cập database

### 6.1 Repository — CURRENT

Mỗi bảng nghiệp vụ có repository kế thừa `BaseRepository<R>` (bảng chính) hoặc `ChildRepository<R>` (bảng con), khai `table` và `resource`; tài nguyên phải có trong `SysResource` đúng bảng nguồn.

Đúng (`backend/src/modules/cutting/cutting.repositories.ts`):

```ts
export class CuttingPlanRepository extends BaseRepository<CuttingPlanRow> {
  protected readonly table = 'CuttingPlan';
  protected readonly resource = 'cutting.progress';
  protected readonly sortable = ['Id', 'SourceCreatedAt'];
  constructor(@Inject(CUTTING_DB) db: CuttingDb, registry: ResourceRegistry) { super(db, registry); }
}

export class CuttingPlanDailyRepository extends ChildRepository<CuttingPlanDailyRow> {
  protected readonly table = 'CuttingPlanDaily';
  protected readonly parentKey = 'CuttingPlanId';
}
```

Tránh: `this.db.selectFrom('CuttingPlan').where('BranchCode', '=', dto.branchCode)` trong service (tự viết điều kiện phân quyền, lấy ĐVCS từ client).

Hiện trạng lệch: 7 repository trong module không kế thừa `BaseRepository` và service nền tảng truy vấn thẳng `MES_Core` ([ARCHITECTURE.md](ARCHITECTURE.md) mục 10, A1). Tech Lead chốt 19/10/2026 là **nợ kỹ thuật**: không lấy làm mẫu cho code mới.

**APPROVED (19/10/2026):** service nghiệp vụ được dựng mảnh biểu thức `` sql`…` `` (cột tính, điều kiện, biểu thức sắp xếp) rồi **truyền cho repository** (ví dụ `backend/src/modules/order/line-plan.service.ts`, `po-allocation.service.ts`): không tính là SQL thô. Service vẫn không tự chạy câu truy vấn (`this.db` trong service chỉ dùng cho `inTransaction`) và không dùng mảnh đó để tự viết điều kiện phân quyền.

### 6.2 Câu SQL — CURRENT

| Quy ước | Lý do |
|---|---|
| `UPDATE`, `DELETE` luôn có `WHERE` | Tránh ghi cả bảng |
| Chia lô: 500 Id mỗi câu kiểm, khóa; `INSERT` nhiều dòng tối đa 100 dòng, không quá 2.000 tham số | SQL Server nhận tối đa 2.100 tham số mỗi câu (`base.repository.ts`, `backend/scripts/script-db.ts`) |
| Bảng có trigger không dùng `INSERT … OUTPUT` | SQL Server không cho `OUTPUT` không kèm `INTO` trên bảng có trigger |
| Khóa dòng bằng `UPDLOCK` theo thứ tự cha → con | Người chỉ đọc không bị chặn; tránh khóa chéo ([DATA_FLOWS.md](DATA_FLOWS.md) mục 4.3) |
| Không truy vấn trong vòng lặp với dữ liệu lớn | Hiệu năng |

### 6.3 Migration — CURRENT

- Schema chỉ đổi bằng file mới `backend/migrations/<Database>/NNNN_ten.sql` (số tiếp theo); không sửa file đã chạy.
- Bảng theo ĐVCS có `BranchCode VARCHAR(10)` có chỉ mục; bảng con có khóa ngoại ghép `(ParentId, BranchCode)` tới `UNIQUE (Id, BranchCode)` của cha.
- Cột trỏ sang database khác thêm dòng vào `backend/migrations/softkeys.json` và chỉ mục.
- Danh mục không xóa vật lý; dùng `IsActive`. Dùng `NULL` cho "không có", không chèn dòng đại diện.
- Tiêu chuẩn chạy, rollback: [ENGINEERING_STANDARDS.md](ENGINEERING_STANDARDS.md) mục 6.

## 7. Tái sử dụng code

| Quy ước | Trạng thái |
|---|---|
| Dùng service nền tảng thay vì tự làm: `ExportService` (xuất file), `AuditService` (nhật ký), `CatalogLookupService` (tên, danh mục BRAVO), `OrgService` (chuyền), `FieldPolicyService` (chính sách cột) | CURRENT |
| Dùng thành phần ở `frontend/src/components`, tiện ích ở `frontend/src/lib` trước khi viết mới | CURRENT |
| `features/order/common.tsx`, `features/order/api.ts` đang được màn Cắt, May dùng làm thư viện chung | CURRENT (lệch). APPROVED (19/10/2026): chuyển phần dùng chung sang `components`/`lib`, task T9 |
| Không dùng `mantine-datatable` (có trong `package.json`, không file nào import) | CURRENT |
| Luật tính thuần của màn đặt ở `features/<khối>/<tên>Rules.ts`, test không cần vẽ màn | CURRENT |

## 8. Tổ chức test

| Quy ước | Trạng thái | Tham chiếu |
|---|---|---|
| Backend: một thư mục phẳng `backend/test/*.spec.ts`, đặt tên theo chủ đề hoặc phase | CURRENT | `backend/jest.config.js` (`testRegex: test/.*\.spec\.ts$`) |
| Test API dựng `AppModule` thật bằng `configureApp`, gọi bằng supertest, đăng nhập tài khoản mẫu bằng `DEMO_PASSWORD` | CURRENT | `backend/test/auth.spec.ts` |
| Dữ liệu thử có tiền tố riêng (`TEST-…`, `TST…`, tài khoản `test.…`) và dọn khi xong | CURRENT | [12](update_docs/12-du-lieu-mau-va-kiem-thu.md) |
| Test migration chạy thân migration trong transaction rồi hủy | CURRENT | `backend/test/*-grant-migration.spec.ts`, `phase5-line-scope-migration.spec.ts` |
| `backend/test/setup-env.ts` tắt việc chạy nền (`BRAVO_ORDER_IMPORT`, `OSM_FACTORY_UPDATE`, `PO_ALLOCATION_REFRESH`) | CURRENT | |
| Frontend: thư mục phẳng `frontend/src/test/*.test.ts(x)`, API giả trong từng file, jsdom | CURRENT | `frontend/vite.config.ts`, `frontend/src/test/setup.ts` |
| Đo hiệu năng ở `frontend/src/perf/*.perf.tsx`, không nằm trong `npm test`, không có ngưỡng | CURRENT | `frontend/vitest.perf.config.ts` |
| Luật phân quyền, lọc ĐVCS mới phải có test | CURRENT (bắt buộc theo [AGENTS.md](../AGENTS.md)) | [ENGINEERING_STANDARDS.md](ENGINEERING_STANDARDS.md) mục 1 |
