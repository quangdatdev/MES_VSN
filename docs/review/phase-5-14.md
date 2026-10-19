# Review Phase 5.14 – Đồng bộ tiến độ cắt

## Task 5.14.1, lượt 1 (14/10/2026)

### Phạm vi

Thay đổi chưa commit trên `main` (sau `40e4177`), chỉ nền database và quyền; chưa có code module, service, API (task sau, không tính là thiếu).

- Mới: `backend/migrations/MES_Cutting/0001_cutting_progress.sql`, `backend/migrations/MES_Core/0012_grant_cutting_progress.sql`, `backend/test/cutting-grant-migration.spec.ts`.
- Sửa: `backend/src/config/env.ts`, `backend/scripts/migrate.ts`, `backend/scripts/check-softkeys.ts`, `backend/.env.example`, `backend/migrations/softkeys.json`, `backend/scripts/seed-data.ts`.
- Tài liệu (đọc trực tiếp): `docs/update_docs/03`, `04`, `11`, `12`, `13` (mục 13.1–13.5), kế hoạch `docs/phases/phase-5-14-dong-bo-tien-do-cat.md`.

Đã kiểm thêm (chỉ đọc) trên SQL Server trong `.env`:
- Collation của máy chủ và mọi database `MES_*`, `MES_*_T514`: đều `SQL_Latin1_General_CP1_CI_AS`, mức tương thích 150.
- `MES_Core` dùng chung chưa chạy `0012` (mới tới `0011`), chưa có `MES_Cutting`: đúng quy định chỉ migrate trên bộ test.
- `MES_Core_T514`: `cutting.progress` có `SourceTable = CuttingPlan`, `BRANCH`; PLANNER `view,update,export`, FULL_ACCESS `view,create,update,delete,export`, DIRECTOR `view,export`, ADMIN và LINE_LEADER `view`.
- `MES_Cutting_T514`: đủ 10 chỉ mục, `UX_CuttingPlan_ShipmentPlan` có lọc `([ShipmentPlanId] IS NOT NULL)`.

Grep danh sách database trong `backend/` (scripts, src, test), `frontend/`, `deploy/`. Chỉ `env.ts`, `migrate.ts`, `check-softkeys.ts` liệt kê theo tên; cả ba đã có `MES_Cutting`. Còn sót ở `deploy/` và tài liệu vận hành (H1, M3). Script dữ liệu demo (`reset-demo.ts`, `load-bravo-orders.ts`, `simulate-board.ts`) chưa xóa dữ liệu cắt, nhưng việc này thuộc task 5.14.5 theo kế hoạch (xem L9).

### Điểm làm tốt

- Kiểu cột khớp nguồn sau `MES_Order/0003`: `StyleCode NVARCHAR(120)`, `ColorName NVARCHAR(100)`, `SizeName VARCHAR(20)`, `PoBuyDate NVARCHAR(40)`, `PlanNo VARCHAR(30)`.
- Bảng con có khóa ngoại ghép `(CuttingPlanId, BranchCode)` tới `UQ_CuttingPlan_IdBranch`, nên số cắt không gắn sang được ĐVCS khác ở mức database.
- `CK_CuttingPlan_Source` ràng buộc hai chiều: `ShipmentPlanId` NULL khi và chỉ khi `SourceDeletedAt` có giá trị. Chỉ mục duy nhất có lọc cho phép nhiều bản chép đã mất nguồn, mỗi kế hoạch nguồn chỉ có một bản chép. Không đặt UNIQUE trên `PlanNo`, đúng, vì số kế hoạch có thể được dùng lại sau khi xóa.
- `CK_CuttingDaily_Qty CHECK (Qty > 0)` cưỡng chế "chỉ lưu số > 0".
- `0012` tốt hơn `0010`: chỉ tăng `SysPermissionVersion` khi thật sự có cấp. Không cấp thì `GROUP BY` trên tập rỗng không sinh dòng nhật ký nào. Bỏ qua vai trò thiếu hoặc vai trò không phải hệ thống bằng `JOIN … IsSystem = 1`.
- Test chạy thân migration trong transaction rồi hủy, có kiểm chạy lại không trùng, không thêm nhật ký.
- `softkeys.json` khai đủ 4 khóa ngầm. Khóa `ShipmentPlanId` có `sameBranch`, `nullable` và index (filtered unique).

---

### HIGH

**[HIGH] H1 `deploy/deploy.cjs:321`, `deploy/deploy.cjs:336-342`, `deploy/huong-dan.html:90-91, 126, 174, 194-195, 214, 219, 308-310`: deploy máy chủ sẽ làm web dừng vì thiếu database `MES_Cutting`**

- **Rủi ro:** login ứng dụng trên máy chủ không có quyền tạo database (`docs/thiet-ke/cai-dat-windows-server.html:68`: "Không sysadmin, không quyền tạo database"). Có migration mới thì `deploy.cjs` dừng bản cũ (dòng 336–339) rồi mới chạy `npm run migrate`. `migrate.ts:184` chạy theo thứ tự tên thư mục, nên lần chạy này diễn ra như sau:
  1. `MES_Core/0012` chạy và commit trước.
  2. `ensureDatabase('MES_Cutting')` (`migrate.ts:34`) lỗi quyền.
  3. Lệnh dừng. `MES_Hr`, `MES_Order`, `MES_Sewing`, `MES_Sync` chưa được migrate, seed chưa chạy.
  4. Deploy kết thúc ở trạng thái `stopped`: backend DỪNG tới khi có người tạo database hoặc `pm2 start` bản cũ bằng tay.

  Hướng dẫn máy chủ và câu hỏi của script vẫn ghi "Sao lưu 5 database" (MES_Core, MES_Order, MES_Sewing, MES_Hr, MES_Sync), không có bước nhờ quản trị CSDL tạo `MES_Cutting`. Người deploy làm đúng hướng dẫn vẫn gặp sự cố, và còn không sao lưu `MES_Cutting` ở các lần sau. Kế hoạch có ghi ở mục "Việc trên máy chủ" và quyết định 13.1 "Phải nhớ", nhưng hai file người vận hành dùng (`deploy.cjs`, `huong-dan.html`) nằm trong git và chưa được sửa.
- **Sửa:**
  1. `deploy.cjs:321`: đổi câu hỏi thành "Đã sao lưu 6 database chưa?". Tốt hơn là đọc số database từ thư mục `backend/migrations` của bản mới, để không phải sửa tay ở lần thêm module sau.
  2. `huong-dan.html`: liệt kê đủ 6 database ở mọi chỗ ghi "5 database". Thêm bước trước khi deploy bản có `MES_Cutting/0001`: quản trị CSDL tạo `MES_Cutting` (hoặc tên ở `DB_CUTTING_NAME`), cấp `db_owner` cho login ứng dụng.
  3. `migrate.ts`: kiểm trước mọi thư mục rồi mới chạy migration nào. Database chưa có mà login không có `CREATE ANY DATABASE` (`HAS_PERMS_BY_NAME(NULL, NULL, 'CREATE ANY DATABASE')`) thì dừng, kèm danh sách database cần tạo. Như vậy lỗi xảy ra trước khi `MES_Core` bị đổi.
  4. Khuyến nghị: thêm vào `preflight()` của `deploy.cjs` (dòng 173) một lệnh kiểm chỉ đọc, ví dụ `npm run migrate -- --check`, chạy **trước** khi dừng bản cũ. Thiếu database thì `fail()` lúc bản cũ còn chạy.

---

### MEDIUM

**[MEDIUM] M1 `backend/migrations/MES_Cutting/0001_cutting_progress.sql:73`: `FK_CuttingDaily_Plan … ON DELETE CASCADE` cho phép mất số cắt mà không báo lỗi**

- **Rủi ro:** yêu cầu đã chốt là kế hoạch mất nguồn mà đã có số cắt thì phải giữ bản chép, chỉ xóa bản chép khi chưa có số cắt. Lượt chép (5.14.3) sẽ "kiểm không có số cắt → `DELETE CuttingPlan`". Có hai đường làm mất số:
  - Một người lưu số cắt đúng lúc giữa bước kiểm và bước xóa (khác transaction, hoặc khác khóa ứng dụng).
  - Một lỗi logic ở service.

  Với `CASCADE`, cả hai trường hợp đều xóa luôn `CuttingDaily` mà không báo lỗi. Đây đúng là dữ liệu người dùng nhập tay, không chép lại được từ đâu. `CuttingPlanColorSize` để `CASCADE` thì hợp lý, vì đó là bản chép.
- **Sửa:** bỏ `ON DELETE CASCADE` ở `FK_CuttingDaily_Plan` (mặc định `NO ACTION`). Khi đó database tự chặn xóa kế hoạch còn số cắt: lỗi 547, service đổi thành "giữ bản chép, đặt `SourceDeletedAt`". "Xóa số cắt" (`DELETE /cutting/progress/:planId/entries`) xóa `CuttingDaily` trước một cách tường minh, rồi mới xóa `CuttingPlan` nếu kế hoạch đã mất nguồn. `reset:demo`, `load:bravo` (5.14.5) xóa `CuttingDaily` trước `CuttingPlan`. Migration chưa chạy trên database dùng chung nên sửa ngay trong file `0001` (bộ `T514` thì drop rồi tạo lại `MES_Cutting_T514`).

**[MEDIUM] M2 `backend/migrations/MES_Cutting/0001_cutting_progress.sql:43-44, 53, 64-65, 74`, `backend/scripts/migrate.ts:34`: collation khi so tên màu cỡ phụ thuộc cách tạo database**

- **Rủi ro:** `UQ_CuttingPlanColorSize`, `UQ_CuttingDaily` so `ColorName`, `SizeName` theo collation mặc định của `MES_Cutting`. Nguồn `UQ_ShipmentPlanColorSize` so theo collation mặc định của `MES_Order`. `ensureDatabase` tạo database không kèm `COLLATE`, tức lấy collation của máy chủ; database do quản trị CSDL tạo tay thì theo ý họ. Hiện mọi database cùng `SQL_Latin1_General_CP1_CI_AS` (đã kiểm), nhưng lệch nhau là chuyện có thể xảy ra:
  - `MES_Order` phân biệt hoa thường (CS) hoặc BIN, `MES_Cutting` không phân biệt (CI): hai màu "Navy" và "NAVY" hợp lệ ở nguồn sẽ trùng khóa khi chép, và lượt chép của cả ĐVCS lỗi.
  - `SizeName VARCHAR` khác code page thì ký tự ngoài ASCII bị đổi thành `?`.
  - Ngay cả khi cùng CI, so trong JavaScript (Map theo chuỗi) là so chính xác, còn SQL coi "Navy" = "NAVY" và bỏ khoảng trắng cuối. Số cắt gắn theo tên, nên chỉ cần lệch hoa thường là số có thể bị coi là "màu cỡ bị bỏ", hoặc MERGE trùng khóa.
- **Sửa:**
  1. `migrate.ts`: khi tạo `MES_Cutting` (và các database module mới), `CREATE DATABASE … COLLATE <collation của DB_ORDER_NAME>`. Database đã có thì so `DATABASEPROPERTYEX(name, 'Collation')` với `MES_Order`, lệch thì cảnh báo rõ.
  2. Ghi vào `11-van-hanh.md` (mục chuẩn bị SQL Server): 6 database phải cùng collation.
  3. Cho 5.14.3: khóa màu cỡ trong code so như database (đã cắt khoảng trắng, không phân biệt hoa thường, như `check-softkeys.ts` dùng `toUpperCase()`), hoặc khớp tên ngay trong SQL. Có test cho trường hợp đổi hoa thường tên màu ở kế hoạch.

**[MEDIUM] M3 `docs/update_docs/11-van-hanh.md:13, 32, 343, 435, 452, 499, 530, 587`: tài liệu vận hành còn ghi "5 database"**

- **Rủi ro:** dòng 143, 145, 325 đã sửa thành 6 database, nhưng các dòng trên vẫn ghi 5: yêu cầu `db_owner`, "nhờ quản trị CSDL tạo trước 5 database", kết quả migrate "cả 5 database", sao lưu trước deploy, bảng lỗi. Người vận hành làm theo sẽ thiếu `MES_Cutting` (gây H1) hoặc không sao lưu nó. `docs/thiet-ke/cai-dat-windows-server.html:68, 121, 199, 256` cũng ghi 5. File này là tài liệu cũ, người dùng tự dọn, chỉ nêu để biết.
- **Sửa:** đổi các chỗ trên thành 6 database và liệt kê tên. Có thể ghi một lần ở mục "Chuẩn bị SQL Server" rồi các chỗ khác trỏ về đó, để lần thêm module sau chỉ phải sửa một chỗ.

---

### LOW / SUGGESTION

**[LOW] L1 `backend/migrations/MES_Core/0012_grant_cutting_progress.sql:13`, `backend/test/cutting-grant-migration.spec.ts:39-49, 71`: phần FULL_ACCESS của 0012 thừa và có thể cấp lại quyền đã thu hồi tay; test dựng trạng thái không có thật**

- **Rủi ro:** `bootstrapFullAccess` (`seed.ts:627-653`) cấp `VCUDE` cho mọi tài nguyên không phải `admin.*` ngay khi tạo vai trò, nên mọi máy đã cài đều đã có đủ 5 quyền `cutting.progress` (`T514` xác nhận). Phần FULL_ACCESS của `0012` vì vậy chỉ có tác dụng khi quản trị đã cố ý gỡ một quyền; lúc đó nó cấp lại. Điều này trái với kế hoạch ("migration `MES_Core` gán thêm Sửa, Xuất cho Kế hoạch… không đổi quyền đã chỉnh tay"; kế hoạch chỉ nói tới Kế hoạch). Test dựng FULL_ACCESS "chưa có gì" rồi khẳng định kết quả là `delete, export, update` không có `view`. Trạng thái này không có thật và còn hợp thức hóa một ma trận lệch: có Sửa, Xóa mà không có Xem.
- **Sửa:** bỏ 3 dòng FULL_ACCESS khỏi `@want`, sửa test: FULL_ACCESS bắt đầu với `VCUDE`, khẳng định không đổi. Muốn giữ thì cấp đủ theo `fullAccessLetters` (cả `view`, `create`) và ghi lý do vào `13-quyet-dinh.md` mục 13.5.

**[LOW] L2 `backend/migrations/MES_Core/0012_grant_cutting_progress.sql:18-22`: Kế hoạch được cấp Sửa, Xuất cả khi quản trị đã gỡ Xem**

- **Rủi ro:** máy nào quản trị đã thu hồi `cutting.progress:view` của Kế hoạch (cố ý không cho xem màn) thì sau migrate, vai trò này lại có `update`, `export` mà không có `view`. Đây là quyền mồ côi; khi 5.14.3 có API, có thể gọi `PUT` mà không thấy màn.
- **Sửa:** chỉ cấp khi vai trò đang có `view` của tài nguyên: thêm `AND EXISTS (SELECT 1 FROM dbo.SysRolePermission v JOIN dbo.SysPermission pv ON pv.Id = v.PermissionId WHERE v.RoleId = r.Id AND pv.ResourceId = @rid AND pv.ActionCode = 'view')`. Thêm một ca test cho trường hợp này.

**[LOW] L3 `backend/migrations/MES_Core/0012_grant_cutting_progress.sql:25-31`: nhật ký gần giống màn Vai trò nhưng chưa đủ**

- **Rủi ro:** màn Vai trò (`admin-access.service.ts:133`) ghi `OldValue = {"removed":[…]}` và `NewValue = {"role":…,"added":[…]}`. `0012` (giống `0010`) không ghi `OldValue`. Ngoài ra:
  - `STRING_AGG` không có `WITHIN GROUP`, nên thứ tự mảng `added` thay đổi giữa các lần chạy.
  - JSON ghép chuỗi mà không qua `STRING_ESCAPE`. Hiện mã vai trò là mã hệ thống ASCII nên chưa lỗi; `0009` thì đã dùng `STRING_ESCAPE`.
- **Sửa:** thêm `OldValue` là `N'{"removed":[]}'`. Dùng `STRING_AGG(…) WITHIN GROUP (ORDER BY p.SortOrder)` và `STRING_ESCAPE(r.Code, 'json')`.

**[LOW] L4 `backend/test/cutting-grant-migration.spec.ts:96-106`: thiếu ca "thiếu vai trò"; ca "chưa seed" kiểm chưa đủ**

- **Rủi ro:** yêu cầu review có ý "an toàn khi thiếu vai trò", nhưng chưa có test nào cho trường hợp PLANNER không có, hoặc có PLANNER do người dùng tạo (`IsSystem = 0`). Ca thứ hai chỉ kiểm phiên bản quyền, không kiểm "không cấp, không ghi nhật ký".
- **Sửa:** thêm ca trong transaction: đặt `IsSystem = 0` cho PLANNER, chạy migration, khẳng định PLANNER không đổi và nhật ký chỉ có dòng của FULL_ACCESS (hoặc không có dòng nào nếu làm L1). Ca chưa seed kiểm thêm số dòng `SysRolePermission` và `SysAuditLog` không đổi.

**[LOW] L5 `backend/migrations/MES_Cutting/0001_cutting_progress.sql:61`: tên `CuttingDaily` không mang tiền tố bảng cha**

- **Rủi ro:** CLAUDE.md mục 5 yêu cầu "bảng con mang tiền tố bảng cha". Tiền lệ: `SewingPrepStep`, `ShipmentPlanColorSize`, `ShipmentPlanLine`. Cha của bảng này là `CuttingPlan`, nên đúng quy ước phải là `CuttingPlanDaily`. Migration chưa chạy trên database dùng chung nên đổi bây giờ rất rẻ; sau khi deploy thì phải có migration đổi tên.
- **Sửa:** đổi thành `CuttingPlanDaily` (kèm tên ràng buộc, chỉ mục, `softkeys.json`, tài liệu 03, 12, 13, kế hoạch). Giữ tên cũ thì ghi ngoại lệ vào `13-quyet-dinh.md` mục 13.3.

**[LOW] L6 `backend/migrations/MES_Cutting/0001_cutting_progress.sql:76`: chỉ mục chưa phủ cột cho danh sách**

- **Rủi ro:** danh sách tính `SUM(Qty)` và `MAX(EntryDate)` theo kế hoạch trong một ĐVCS, rồi sắp xếp, lọc theo Lũy kế. `IX_CuttingDaily_Branch (BranchCode, CuttingPlanId)` không có `Qty`, `EntryDate`. `UQ_CuttingDaily` có `EntryDate` nhưng không có `Qty`. Vì vậy mỗi lần gom phải tra từng dòng về bảng gốc (key lookup), hoặc quét cả bảng khi dữ liệu nhiều năm.
- **Sửa:** `CREATE INDEX IX_CuttingDaily_Branch ON dbo.CuttingDaily (BranchCode, CuttingPlanId) INCLUDE (Qty, EntryDate);`. Thêm `INCLUDE (Qty)` cho `UQ_CuttingDaily` nếu popup gom theo màu cỡ. Làm cùng lúc sửa M1, L5.

**[LOW] L7 `backend/migrations/softkeys.json:156-181`: chưa khai `CuttingDaily.CreatedBy`, `ModifiedBy` → `MES_Core.SysUser.Id`**

- **Rủi ro:** `CuttingDaily` là số người dùng nhập tay. Tiền lệ `PoAllocation.CreatedBy`, `ModifiedBy` (bảng có nhập tay) có khai khóa ngầm và chỉ mục có lọc. Module May thì không khai cho `SewingPrepStep`, nên tiền lệ chưa thống nhất. Không khai thì `check:softkeys` không phát hiện người nhập trỏ tới tài khoản không còn tồn tại.
- **Sửa:** khai hai khóa ngầm (`nullable`) và thêm `CREATE INDEX … (CreatedBy) WHERE CreatedBy IS NOT NULL` (tương tự cho `ModifiedBy`), như `MES_Order/0009`. Hoặc ghi rõ ở 13.3 là không khai.

**[LOW] L8 `backend/scripts/migrate.ts:17-25`, `backend/scripts/check-softkeys.ts:26`, `backend/src/config/env.ts:42-52`: ba bảng tên database viết riêng; `migrate.ts` lặng lẽ dùng tên thư mục khi không biết**

- **Rủi ro:** thêm module thì phải nhớ sửa đủ ba chỗ (lần này đủ). Nguy hiểm hơn là `dbName()` trả về chính tên thư mục khi chưa có ánh xạ. Một thư mục quên ánh xạ, chạy với bộ test (`DB_*_NAME=…_T514`), sẽ migrate thẳng lên database tên thật `MES_xxx` dùng chung. Điều này vi phạm CLAUDE.md mục 7.
- **Sửa:** gom thành một bảng ánh xạ, ví dụ `env.db.byFolder: Record<string, string>`, cho cả `migrate.ts` và `check-softkeys.ts` dùng chung. `dbName()` gặp thư mục lạ thì `throw` thay vì trả về tên thư mục.

**[LOW] L9 (nhắc cho 5.14.5) `backend/scripts/load-bravo-orders.ts:41-47`, `backend/scripts/reset-demo.ts:143-144`, `backend/scripts/simulate-board.ts:381-386`: script demo đặt lại Id kế hoạch nhưng chưa xóa dữ liệu cắt**

- **Rủi ro:** `clearOrderData` chạy `DBCC CHECKIDENT … RESEED 0` cho `ShipmentPlan`. Sau `reset:demo`/`load:bravo`, `CuttingPlan.ShipmentPlanId` cũ trỏ đúng vào kế hoạch **mới** cùng Id. Nếu cùng ĐVCS thì `check:softkeys` không phát hiện được (khóa vẫn "đúng"); chỉ `SourceCreatedAt` mới phân biệt được. Kế hoạch đã xếp việc này vào 5.14.5, nên không tính là thiếu ở 5.14.1.
- **Sửa:** 5.14.5 phải xong trước khi máy demo nào vừa có `MES_Cutting` vừa chạy các script này. Ở 5.14.3, lượt chép luôn so `Id + BranchCode + SourceCreatedAt` (như `SewingPrep`) và có test Id bị dùng lại.

**[LOW] L10 `docs/update_docs/04-phan-quyen.md:199`: câu cũ "Tài nguyên chưa có màn thật (`cutting.*`, `sewing.plan`…) cũng chưa có bảng nguồn"**

- **Rủi ro:** `cutting.progress` nay đã có bảng nguồn `CuttingPlan` (dòng 473 cùng file đã ghi), hai chỗ mâu thuẫn nhau.
- **Sửa:** đổi thành "`cutting.supply`, `cutting.embroidery`, `sewing.plan`…".

---

### Ghi chú cho task sau (không phải lỗi của 5.14.1)

- `backend/eslint.config.mjs` chưa có khối ranh giới cho `src/modules/cutting/**`: chỉ cho import `ShipmentPlanFeed`, `ShipmentPlanDeleteGuard`, `order.module` (như khối `sewing`). Thêm khối cấm `order`, `sewing`, `hr` import `../cutting/*`.
- `deploy.cjs` sẽ cảnh báo "bản này thêm biến môi trường … `DB_CUTTING_NAME`" khi `.env` máy chủ chưa có biến này. Biến có mặc định nên không cần thêm; nên ghi vào hướng dẫn để người vận hành không lo.

### Kết luận lượt 1

> Review Summary: examined 9 files (cùng 6 tài liệu), found 0 CRITICAL, 1 HIGH, 3 MEDIUM, 10 LOW findings. Top priority: H1, deploy dừng web vì login máy chủ không tạo được `MES_Cutting`, trong khi `deploy.cjs` và `huong-dan.html` vẫn ghi 5 database. Merge recommendation: **BLOCK** (chỉ chặn ở H1; phần schema và quyền đúng hướng, nên sửa luôn M1, M2 cùng L5, L6 khi còn đổi được `0001` mà không cần migration mới).

### Phản hồi lượt 1 (14/10/2026)

| Mục | Xử lý |
|---|---|
| H1 | Đã sửa. `migrate.ts` kiểm mọi database (đã có hoặc tạo được, `HAS_DBACCESS`) **trước khi chạy migration nào**; thêm `npm run migrate -- --check` chỉ làm bước kiểm. `deploy.cjs` gọi `--check` sau build, lúc bản cũ còn chạy, khi có migration mới; câu hỏi sao lưu đổi thành "các database MES". Script gốc `migrate` thêm `--` để cờ đi qua tới script backend. `huong-dan.html`: 6 database, ghi chú khi dừng ở bước Kiểm database. `11-van-hanh.md`: bước kiểm, lệnh `--check`, dòng xử lý sự cố. Thử trên bộ `T514`: `--check` báo đủ 6 database; `npm run test:deploy` 13/13 |
| M1 | Đã sửa trong `0001` (chưa chạy trên database dùng chung): `FK_CuttingPlanDaily_Plan` không còn `ON DELETE CASCADE`; ghi vào quyết định 13.4 |
| M2 | Đã sửa: database mới tạo theo collation của `MES_Core`; collation lệch thì cảnh báo; tài liệu 11 ghi 6 database cùng collation; quyết định 13.1. So tên màu cỡ (cắt khoảng trắng, không phân biệt hoa thường) làm ở 5.14.3 |
| M3 | Đã sửa các chỗ "5 database" trong `11-van-hanh.md`. `docs/thiet-ke/cai-dat-windows-server.html` là tài liệu cũ, không sửa |
| L1, L2, L3 | Đã sửa `0012`: bỏ phần Toàn quyền; chỉ cấp cho Kế hoạch khi còn quyền Xem; nhật ký `OldValue {"removed":[]}`, `STRING_AGG … WITHIN GROUP (ORDER BY p.Code)`, `STRING_ESCAPE` |
| L4 | Đã thêm bài: Kế hoạch đã bị gỡ Xem; `PLANNER` không phải vai trò hệ thống; ca chưa seed kiểm thêm nhật ký, số quyền |
| L5 | Đã đổi tên `CuttingDaily` → `CuttingPlanDaily` (migration, `softkeys.json`, tài liệu) |
| L6 | Đã thêm `INCLUDE (Qty, EntryDate)` cho `IX_CuttingPlanDaily_Branch` |
| L7 | Để lại: khai khóa ngầm `CreatedBy`, `ModifiedBy` thì phải có chỉ mục (CLAUDE.md mục 5) cho cột chỉ dùng ghi nhận; `SewingPrepStep` cũng không khai |
| L8 | Đã sửa: `backend/scripts/database-names.ts` là bảng chung cho `migrate.ts`, `check-softkeys.ts`; thư mục chưa khai thì báo lỗi |
| L9 | Ghi nhận cho task 5.14.5 (`reset:demo`, `load:bravo` xóa dữ liệu `MES_Cutting` trước khi nạp) |
| L10 | Đã sửa câu ở `04-phan-quyen.md` |
| Ghi chú `eslint` ranh giới module | Làm ở 5.14.3 cùng code module |

Bộ `MES_Cutting_T514` đã dựng lại theo `0001` mới (xóa ba bảng và dòng lịch sử trong database test rồi migrate). Sau khi sửa: lint (cả `deploy`), `tsc` qua; `cutting-grant-migration`, `po-allocation-grant-migration`, `seed.spec` 16/16; `check:softkeys` không mồ côi.

## Task 5.14.1, lượt 2 (14/10/2026)

### Phạm vi

Kiểm các bản sửa ở mục "Phản hồi lượt 1":
- `backend/scripts/migrate.ts` (`ensureDatabases`, collation, `--check`, `databaseNameOf`), `backend/scripts/database-names.ts` (mới), `check-softkeys.ts`.
- `package.json` gốc, `deploy/deploy.cjs`, `deploy/huong-dan.html`.
- `MES_Cutting/0001`, `MES_Core/0012`, `test/cutting-grant-migration.spec.ts`.
- Tài liệu 03, 04, 11, 13 (đọc thêm 12).

Đã chạy `npm run migrate -- --check`, `npm run migrate -- MES_Order`, `npm run migrate -- MES_Foo`, với cả 6 biến `DB_*_NAME` trỏ sang `*_T514`.
- npm chuyển tham số đúng tới script: lần lượt in `tsx scripts/migrate.ts --check`, `tsx scripts/migrate.ts MES_Order`, và `MES_Foo` báo "Không có thư mục migration phù hợp".
- Phần kết nối database **không chạy được**: SQL Server `10.0.0.216:1433` không trả lời (quá 15 giây) ở lúc review, dù lượt 1 vẫn kết nối được. Vì vậy chưa tự xác nhận được kết quả `--check` trên `T514`; dựa vào kết quả nhóm sửa báo ("đủ 6 database", `test:deploy` 13/13) và đọc code.

### Kết quả từng mục lượt 1

| Mục | Kết quả | Ghi chú |
|---|---|---|
| H1 | **Đã đóng** | `ensureDatabases` chạy cho mọi thư mục trước vòng `migrate()` (`migrate.ts:218`), lỗi thì "Chưa chạy migration nào". `deploy.cjs:328-332` gọi `npm run migrate -- --check` sau `preflight`, trước `pending.keep` và trước khi dừng bản cũ. `shell()` lỗi thì `fail()` ở `stage = 'prepare'`: bản cũ vẫn chạy, thư mục bản mới bị dọn. `--check` chạy cả khi `--online-migrate`. Gốc `"migrate": "npm run migrate -w backend --"`: không tham số vẫn chạy đủ, `-- MES_Order` và `-- --check` tới đúng script (đã thấy ở trên). `huong-dan.html` đủ 6 database, có ghi chú cho bước Kiểm database. Câu hỏi sao lưu đổi sang "các database MES", không phải sửa lại khi thêm module |
| M1 | **Đã đóng** | `FK_CuttingPlanDaily_Plan` không còn `ON DELETE CASCADE`. `CuttingPlanColorSize` giữ `CASCADE`, đúng vì là bản chép. Comment, quyết định 13.4, tài liệu 03 khớp nhau |
| M2 | **Đã đóng phần 5.14.1** | Database mới tạo `COLLATE` theo `MES_Core`. Tên collation lọc bằng `^[A-Za-z0-9_]+$` trước khi ghép vào câu lệnh, nên không có rủi ro chèn lệnh. Lệch collation thì cảnh báo, không dừng. Phần so tên màu cỡ để lại cho 5.14.3 (đã ghi ở 13.1) |
| M3 | **Đã đóng** | Còn một câu cũ ở `11-van-hanh.md:326` (L14) |
| L1–L3 | **Đã đóng** | `0012` chỉ cấp cho PLANNER hệ thống khi vai trò còn `view`. Nhật ký có `OldValue {"removed":[]}`, `STRING_ESCAPE`, `WITHIN GROUP (ORDER BY p.Code)`. Không còn bảng `@want` |
| L4 | **Đã đóng** | Đủ 4 bài: có Xem; đã gỡ Xem; PLANNER không phải vai trò hệ thống; chưa seed (kiểm cả phiên bản quyền, nhật ký, số quyền). Trạng thái dựng sẵn đã giống máy thật (Toàn quyền đủ 5 hành động). Kiểm `EntityId` và toàn bộ JSON |
| L5 | **Đã đóng** | Không còn `CuttingDaily` trong `backend/`, `deploy/`, `docs/update_docs/`, `docs/phases/` (grep) |
| L6 | **Đã đóng** | `IX_CuttingPlanDaily_Branch … INCLUDE (Qty, EntryDate)` |
| L7 | **Chấp nhận** | Lý do hợp lý: khai khóa ngầm thì phải có chỉ mục, và tiền lệ `SewingPrepStep` cũng không khai |
| L8 | **Đã đóng** | `databaseNameOf` báo lỗi khi gặp thư mục chưa khai. `check-softkeys.ts` dùng chung bảng này; `env` vẫn cần cho `isAvailable` |
| L9 | **Chuyển 5.14.5** | Đã ghi |
| L10 | **Đã đóng** | |

### Mục mới

**[LOW] L11 `backend/scripts/migrate.ts:121-122, 218-221`, `docs/update_docs/11-van-hanh.md:101`: `--check` không chỉ kiểm mà còn tạo database**

- **Rủi ro:** `ensureDatabases` gọi `ensureDatabase` (`CREATE DATABASE`) cho mọi thư mục trước khi kiểm quyền, kể cả ở chế độ `--check`. Bảng lệnh ở `11:101` lại ghi "Chỉ kiểm". Khi deploy thì không hại gì: database đằng nào cũng được tạo, và tạo theo đúng collation. Nhưng chạy `--check` để "xem thử" trên máy có quyền tạo database, ví dụ máy dev có `.env` trỏ máy chủ dùng chung, sẽ tạo database rỗng (`MES_Cutting`) trên máy chủ đó mà người chạy không ngờ. Dòng `11:145` có mô tả đúng, nên hai chỗ trong cùng tài liệu nói khác nhau.
- **Sửa:** chọn một trong hai.
  1. Ở `--check`: database chưa có thì chỉ kiểm `HAS_PERMS_BY_NAME(NULL, NULL, 'CREATE ANY DATABASE') = 1`, không tạo; database đã có thì kiểm `HAS_DBACCESS` và collation như hiện tại.
  2. Giữ cách làm hiện tại nhưng sửa `11:101` thành "Tạo database còn thiếu nếu tài khoản có quyền, kiểm quyền, collation; không chạy migration".

**[LOW] L12 `package.json:15`, `backend/scripts/migrate.ts:206-208`: gõ thiếu `--` thì `--check` bị npm bỏ qua, và lệnh chạy migrate thật**

- **Rủi ro:** `npm run migrate --check` (thiếu `--`): npm nhận `--check` làm cấu hình của chính nó (`npm_config_check=true`), script không thấy cờ. Kết quả là chạy migrate đầy đủ và seed, đúng điều người gõ muốn tránh. Deploy và tài liệu viết đúng; chỉ là bẫy khi gõ tay.
- **Sửa:** trong `main()`, nếu có `process.env.npm_config_check` mà không có `--check` trong `argv` thì dừng, báo "Dùng npm run migrate -- --check".

**[LOW] L13 `backend/scripts/migrate.ts:113-136`: collation gốc lấy theo `MES_Core`, trong khi quyết định 13.1 nói `MES_Cutting` phải cùng collation với `MES_Order`**

- **Rủi ro:** thấp. Mọi database bị so với `MES_Core`, nên nếu `MES_Order` lệch `MES_Core` thì vẫn có cảnh báo, nhưng `MES_Cutting` mới sẽ được tạo theo `MES_Core`, tức lệch `MES_Order`. Hiện mọi database cùng `SQL_Latin1_General_CP1_CI_AS` (đã kiểm ở lượt 1).
- **Sửa:** giữ như hiện tại, nhưng ghi ở 13.1 và `11:145` rằng mọi database MES phải cùng collation với `MES_Core` (một câu chung, thay cho "cùng `MES_Order`"). Hoặc khi tạo `MES_Cutting` thì lấy collation của `MES_Order`.

**[LOW] L14 Tài liệu còn chỗ chưa theo bản sửa**

- `docs/update_docs/12-du-lieu-mau-va-kiem-thu.md:447`: mô tả test vẫn ghi "Toàn quyền nhận Sửa, Xóa, Xuất" và chưa có hai bài mới (gỡ Xem, PLANNER không phải vai trò hệ thống). Phải ghi: Kế hoạch còn Xem thì nhận Sửa, Xuất; Toàn quyền và vai trò khác không đổi; đã gỡ Xem hoặc không phải vai trò hệ thống thì không cấp.
- `docs/update_docs/11-van-hanh.md:326`: "Thiếu một database thì migrate dừng ở database đó". Nay migrate dừng trước khi chạy migration nào; sửa cho khớp với dòng 145.

**[LOW] L15 Bộ test `MES_Core_T514` đã ghi `0012` bản cũ**

- **Rủi ro:** `0012` được sửa sau khi đã chạy trên `MES_Core_T514` (16:03, bản còn phần Toàn quyền). Database test này giữ kết quả của bản cũ, và `migrate` sẽ không chạy lại bản mới. Không ảnh hưởng database dùng chung: lượt 1 đã thấy `MES_Core` chưa chạy `0012`. Lượt này không kiểm lại được vì máy chủ SQL không trả lời. Các bài test tự dựng trạng thái nên vẫn đúng.
- **Sửa:** trước khi commit, kiểm lại `MES_Core` dùng chung chưa có dòng `0012_grant_cutting_progress.sql` trong `__MigrationHistory`. Bộ `T514` để nguyên, hoặc xóa dòng `0012` trong lịch sử rồi migrate lại nếu cần trạng thái quyền giống máy chủ cho 5.14.3.

**[SUGGESTION] S1 Chưa có test tự động cho phần đổi của `migrate.ts`**

- Đọc tham số (`--check`, tên thư mục, kết hợp hai cái), `databaseNameOf` với thư mục lạ, nhánh "không tạo được database thì chưa migrate gì": hiện chỉ kiểm bằng tay. Nên tách phần đọc tham số và thứ tự gọi thành hàm thuần rồi test không cần database, như `deploy.test.cjs` đang test `lib.cjs`.

Ghi chú: `backend/scripts/check-softkeys.ts` ở thư mục làm việc đã thành CRLF toàn file (HEAD là LF). Repo đặt `core.autocrlf=true` nên commit vẫn lưu LF, diff không bị nhiễu; chỉ nêu theo quy ước giữ kiểu xuống dòng từng file.

### Kết luận lượt 2

> Review Summary: examined 13 files (cùng 5 tài liệu), found 0 CRITICAL, 0 HIGH, 0 MEDIUM, 5 LOW findings, 1 SUGGESTION. Mọi mục HIGH, MEDIUM của lượt 1 đã đóng; L7 chấp nhận, L9 chuyển 5.14.5. Top priority: L11 (`--check` tạo database trong khi tài liệu ghi chỉ kiểm) và L14 (tài liệu 11, 12 còn câu cũ). Merge recommendation: **APPROVE WITH SUGGESTIONS**. Trước khi commit nên kiểm lại L15 khi máy chủ SQL kết nối được.

### Phản hồi lượt 2 (14/10/2026)

| Mục | Xử lý |
|---|---|
| L11 | Đã sửa: `--check` không tạo database; database chưa có thì kiểm `HAS_PERMS_BY_NAME(NULL, NULL, 'CREATE ANY DATABASE')`, không có quyền thì dừng. Thử trên bộ test với tên chưa có (`MES_Cutting_T514X`): báo "Chưa có, tài khoản tạo được khi migrate", database không bị tạo (kiểm `DB_ID` sau đó). `11-van-hanh.md` sửa theo |
| L12 | Đã sửa: thấy `npm_config_check` mà `argv` không có `--check` thì dừng "Cờ --check bị npm giữ lại…", chưa chạy migration nào (đã thử) |
| L13 | Đã thống nhất: mọi database MES cùng collation với `MES_Core` (quyết định 13.1, `03-kien-truc.md`) |
| L14 | Đã sửa `12-du-lieu-mau-va-kiem-thu.md` (mô tả 4 bài test của `cutting-grant-migration.spec.ts`) và `11-van-hanh.md` mục cài máy chủ |
| L15 | Đã kiểm chỉ đọc 14/10: `MES_Core` dùng chung đã chạy tới `0011`, chưa chạy `0012`; chưa có database `MES_Cutting`. `MES_Core_T514` đã chạy `0012` bản đầu (cấp thêm cho Toàn quyền quyền nó vốn có, Kế hoạch như bản mới): chỉ là database test |
| S1 | Để lại: chưa có test tự động cho phần đọc tham số của `migrate.ts` (đã thử tay ba trường hợp `--check` đủ, thiếu database, thiếu `--`) |

Sau khi sửa: lint (cả `deploy`), `tsc` qua; `npm run test:deploy` 13/13.

## Task 5.14.2–5.14.5, lượt 1 (15/10/2026)

### Phạm vi

Thay đổi chưa commit trên `main`. Tôi đọc toàn bộ:
- 5.14.2: `shipment-plan-feed.service.ts`, `shipment-plan-delete-guard.ts`, `ShipmentPlanFeedRepository` (`order.repositories.ts:224-286`), `order.module.ts`, `shipment.service.ts`.
- 5.14.3: `backend/src/modules/cutting/*`, `app.module.ts`, `eslint.config.mjs`, `test/cutting.spec.ts`.
- 5.14.4: `frontend/src/features/cutting/*`, `SheetGrid.tsx`, `registry.tsx`, `global.css`, `shell.test.tsx`.
- 5.14.5: `scripts/cutting-data.ts`, `reset-demo.ts`, `load-bravo-orders.ts`, `simulate-board.ts`.
- Tài liệu `15-cat.md` (mới), `01`, `14`, `README`.

Đọc thêm phần nền tảng có liên quan: `BaseRepository.distinctValues`, `FieldPolicyService.assertWritable` và interceptor, `usePagedList`, `queryClient`. Không chạy lại test (dùng kết quả nhóm báo). Máy chủ SQL lúc lượt 2 không kết nối được.

### Điểm làm tốt

- **Phân quyền (CLAUDE.md mục 4) đúng:**
  - Mọi truy vấn theo người dùng qua `CuttingPlanRepository` (`BaseRepository`) và hai `ChildRepository`; service không có SQL thô.
  - `BranchCode` chỉ lấy từ `scopeOf(user)`; DTO không có trường ĐVCS.
  - `get`, `save`, `removeEntries` đều qua `getById`/`lock` theo phạm vi, nên kế hoạch của ĐVCS khác trả 404.
  - `A00` bị chặn ghi bằng `assertWritable`; `allowed()` trả false cho A00.
  - Ghi `dayQty` bị chính sách cột chặn qua `FieldPolicyInterceptor` (`@FieldResource` cộng khóa `dayQty` trong body), kể cả khi gửi `null`.
- **Các truy vấn "của hệ thống" không lộ dữ liệu ra ngoài:**
  - `plansOf`/`versionOf` lọc theo ĐVCS của phiên.
  - `sourceHasEntries` và `exists` nhận ĐVCS từ bản ghi máy chủ (`before.BranchCode`, bản chép) và chỉ trả boolean.
  - `copyCount` chỉ trả số đếm.
- **Chính sách cột kỹ:**
  - `diffQty`, `statusCode` bị che khi `planQty` hoặc `cutQty` không xem được nguyên giá trị. Áp ở list, popup, `values` (403), lọc theo cột (bỏ qua), sắp xếp, lọc nhanh theo trạng thái, xuất file.
  - Tìm nhanh bỏ cột bị che.
- **`syncFromPlans` đúng ở các nhánh chính:**
  - Nhận diện bằng Id + ĐVCS + `SourceCreatedAt`.
  - Bản chép cũ trùng Id (Id dùng lại, hoặc ĐVCS khác) được tách ra hoặc xóa **trước** khi chèn bản mới, nên không vướng chỉ mục duy nhất có lọc.
  - Màu cỡ chép thay toàn bộ, không đụng `CuttingPlanDaily` vì số cắt gắn theo tên.
  - Có khóa ứng dụng; nguồn đọc sau khi giữ khóa.
  - Khóa ngoại không `CASCADE` (bản sửa M1) biến tình huống chép đụng lúc lưu thành lỗi 547 và rollback cả lượt chép, thay vì mất số âm thầm.
  - `cellKey` so màu cỡ như collation CI (bỏ khoảng trắng cuối, không phân biệt hoa thường); tên lưu theo bản chép, không theo chữ client gửi.
- **Chặn xóa đi theo đăng ký ngược:** Đơn hàng không import module Cắt (eslint cưỡng chế cả hai chiều). Hàm kiểm lỗi thì coi là chặn xóa (đóng an toàn).
- **Frontend:**
  - Cột lưới đọc quyền sửa qua `editRef`.
  - Đổi ngày khi còn số chưa lưu thì hỏi; có `useLeaveGuard`; Esc không đóng popup khi đang nhập.
  - `rowLabel` chỉ đổi số thứ tự khi được truyền vào. Các màn khác không truyền nên `labelled = false`, `gutter` giữ như cũ.
- **Script:** xóa số cắt trước bản chép. `sim:board` luôn giữ kế hoạch có số cắt, kể cả `--all`, có so thời điểm tạo.

---

### MEDIUM

**[MEDIUM] M4 `backend/src/modules/cutting/cutting.repositories.ts:128-131`: ĐVCS xóa kế hoạch cuối cùng thì bản chép "ma" kẹt lại**

- **Rủi ro:** cơ chế an toàn "nguồn trả rỗng mà bản chép còn kế hoạch thì không đổi gì" áp cho cả phiên của **một ĐVCS**. Ví dụ: ĐVCS mới dùng màn, lập một kế hoạch, mở Đồng bộ tiến độ cắt (có bản chép), rồi xóa kế hoạch ở Kế hoạch xuất hàng vì lập sai. Khi đó:
  - Mọi lần mở màn sau đều `skipped`, và vì không ghi `synced` nên lần nào cũng chép lại rồi lại bỏ qua.
  - Dòng vẫn hiện "Chưa cắt"; mở popup rồi lưu thì 409 "vừa bị xóa".
  - Không có nút Xóa số cắt (`canDelete` cần có số), nên người dùng không gỡ được.

  Tình trạng này kéo dài tới khi ĐVCS lập kế hoạch mới. Module May có cùng cơ chế, nhưng ở đó dòng chỉ là bản chép; ở đây dòng ma có thể nhận thao tác của người dùng.
- **Sửa:** chỉ bỏ qua khi nghi nguồn sai thật: phiên `A00` (`branchCode === null`), hoặc toàn `MES_Order` không có kế hoạch nào (thêm `repo.totalCount()` vào feed). Rỗng theo một ĐVCS là trạng thái hợp lệ: xử lý như mất nguồn (có số cắt thì tách, chưa có thì xóa). Thêm test: ĐVCS chỉ có một kế hoạch, xóa đi, mở màn thì dòng biến mất.

**[MEDIUM] M5 `backend/src/modules/cutting/cutting.repositories.ts:29-32`: truy vấn con Lũy kế không dùng được chỉ mục `INCLUDE` vừa thêm**

- **Rủi ro:** `CUT_QTY`, `LAST_CUT` lọc `d.CuttingPlanId = CuttingPlan.Id`, không có `BranchCode`. Chỉ mục phủ `IX_CuttingPlanDaily_Branch` bắt đầu bằng `BranchCode`, SQL Server không seek được khi thiếu cột đầu. Hệ quả:
  - Bộ tối ưu dùng `UQ_CuttingPlanDaily (CuttingPlanId, …)`, chỉ mục này không có `Qty`, nên phải tra từng dòng về bảng gốc (key lookup), hoặc quét cả chỉ mục.
  - Biểu thức xuất hiện tới 4 lần mỗi dòng (`CutQty`, `DIFF`, `STATUS` gọi `CUT_QTY` hai lần).
  - Lọc, sắp xếp theo Lũy kế, +/-, Trạng thái buộc tính cho mọi kế hoạch của ĐVCS trước khi phân trang.

  Bản sửa L6 vì vậy chưa có tác dụng như ý.
- **Sửa:** thêm `AND d.BranchCode = CuttingPlan.BranchCode` vào hai truy vấn con (đúng nghĩa: bảng con cùng ĐVCS với cha), để seek `(BranchCode, CuttingPlanId)` và đọc thẳng `Qty`, `EntryDate` trong chỉ mục. Muốn gọn hơn thì viết `STATUS` dùng `CUT_QTY` một lần bằng `CASE` lồng `(SELECT …)`. Kiểm kế hoạch thực thi trên bộ `T514` với vài nghìn kế hoạch.

---

### LOW / SUGGESTION

**[LOW] L16 `backend/src/modules/cutting/cutting-progress.service.ts:303-306`, `backend/src/modules/order/shipment.service.ts:465-468`: khe hở giữa xóa kế hoạch và lưu số cắt rộng hơn cần**

- **Rủi ro:** `save` kiểm `feed.exists` **trước** transaction của `MES_Cutting`; `remove` kiểm hàm chặn **trước** transaction của `MES_Order`. Thứ tự sau vẫn lọt:
  1. `save` kiểm còn kế hoạch;
  2. `remove` kiểm, chưa có số cắt;
  3. `remove` xóa kế hoạch;
  4. `save` ghi số.

  Đã chấp nhận ở quyết định 13.4 (hiện "Kế hoạch đã xóa", không mất số), nhưng khe hở thu hẹp được với chi phí nhỏ.
- **Sửa:** trong transaction của `save`, sau khi ghi số (dòng mới đang giữ khóa X), gọi lại `feed.exists`; không còn thì ném 409 để rollback. Khi đó `sourceHasEntries` của `remove` chạy sau bước ghi sẽ phải chờ khóa (READ COMMITTED không bật RCSI) rồi thấy số cắt; còn chạy trước bước ghi thì `save` thấy kế hoạch đã mất. Chỉ còn lọt ở khe giữa lần kiểm lại và commit.

**[LOW] L17 `backend/src/modules/order/order.repositories.ts:240`: `ShipmentPlanFeedRepository` không kế thừa `BaseRepository`**

- **Rủi ro:** CLAUDE.md mục 4.3 viết "mọi truy vấn dữ liệu nghiệp vụ đi qua repository kế thừa `BaseRepository`/`ChildRepository`". Tiền lệ `LinePlanLineRepository.feed` là phương thức "của hệ thống" nằm **trong** một `ChildRepository`; ở đây là lớp riêng, tự viết điều kiện `BranchCode`. Không lộ dữ liệu, vì ĐVCS lấy từ phiên, nhưng lệch quy ước và lint không bắt được.
- **Sửa:** chuyển `plans`, `colorSizes`, `version`, `createdAt` thành phương thức "của hệ thống" của `ShipmentPlanRepository`/`PlanColorSizeRepository`, như `feed`. Hoặc ghi ngoại lệ vào 13.2 kèm lý do.

**[LOW] L18 `frontend/src/features/cutting/CuttingProgressPage.tsx:164, 169-173`: số đang gõ có thể bị đè khi mạng chập chờn**

- **Rủi ro:** `refetchOnWindowFocus: false` đã tắt, nhưng `refetchOnReconnect` mặc định vẫn bật (`queryClient.ts:5` chỉ tắt focus). Dữ liệu cũ hơn 15 giây mà mất mạng rồi có lại thì truy vấn tải lại, `plan` đổi, và `useEffect` gọi `setRows(rowsOf(plan))` làm mất số đang nhập chưa lưu.
- **Sửa:** thêm `refetchOnReconnect: false` cho truy vấn popup, hoặc trong effect bỏ qua khi `dirty`.

**[LOW] L19 `frontend/src/features/cutting/CuttingProgressPage.tsx:216-217`: sau Xóa số cắt, lưới hiện lại số cũ trong chốc lát**

- **Rủi ro:** `setLoaded(null)` rồi `refetch()`. Trong lúc chờ, `plan` vẫn là dữ liệu cũ, `plan !== loaded` nên effect nạp lại các dòng cũ: `ready` = true, số cắt cũ và nút Xóa số cắt hiện lại cho tới khi tải xong. Bấm Xóa số cắt lần nữa thì máy chủ xóa 0 dòng, nhưng vẫn ghi nhật ký `DELETE_ENTRIES`.
- **Sửa:** `qc.removeQueries({ queryKey: key })` (hoặc `resetQueries`) trước khi tải lại, để popup về trạng thái đang tải. Ở máy chủ, không ghi nhật ký khi không xóa dòng nào.

**[LOW] L20 `backend/test/cutting.spec.ts`: chưa có test cho các nhánh khó của `syncFromPlans` và vài đường phụ**

- Chưa có:
  1. Id kế hoạch dùng lại (cùng Id, khác `CreatedAt`): bản chép cũ có số thì tách ra, chưa có thì xóa, bản mới được chèn.
  2. Bản chép cùng Id ở ĐVCS khác (clash).
  3. Phiên `A00` chép mọi ĐVCS.
  4. Cột `dayQty` "Chỉ đọc" thì `PUT` trả lỗi `FIELD_READONLY`.
  5. `values?field=cutQty`, `statusCode` và `sort=cutQty`: truy vấn con trong `DISTINCT`/`ORDER BY`, chưa chạy thật lần nào.
  6. M4.
- **Sửa:** thêm các bài trên. Bài 1–2 dựng trực tiếp bằng `insert` vào `CuttingPlan` với `SourceCreatedAt` lệch.

**[LOW] L21 `backend/src/modules/cutting/cutting.repositories.ts:210-218`: lượt chép đầu ghi từng kế hoạch một**

- **Rủi ro:** mỗi kế hoạch mới tốn 2 lệnh (INSERT kế hoạch có `OUTPUT`, INSERT màu cỡ), trong một transaction có giữ khóa ứng dụng. Máy chủ có vài nghìn kế hoạch thì lần mở màn đầu sau deploy có thể mất hàng chục giây; người khác mở màn cùng lúc phải chờ khóa (15 giây), quá thời gian thì thấy danh sách rỗng hoặc cũ.
- **Sửa:** chèn kế hoạch theo lô (`insert … values([...]) output inserted.Id, inserted.ShipmentPlanId`), ghép lại theo `ShipmentPlanId`, rồi chèn màu cỡ theo lô. Hoặc ghi vào `15-cat.md` mục vận hành: sau deploy, mở màn một lần bằng `A00`.

**[LOW] L22 `backend/scripts/load-bravo-orders.ts:99`: số cắt bị xóa trước khi chắc nạp đơn thành công**

- **Rủi ro:** `clearCutting()` commit ngay trong transaction của `MES_Order` (khác database). Nạp đơn lỗi thì đơn hàng được rollback nhưng số cắt đã mất. Chỉ trên máy demo, cùng cách làm với `clearSewingPrep`.
- **Sửa:** chấp nhận, ghi một dòng vào thông báo của lệnh. Hoặc xóa sau khi transaction đơn hàng commit (khi đó lượt mở màn xen giữa có thể gắn số cũ vào Id mới, nhưng `SourceCreatedAt` đã chặn được).

**[SUGGESTION] S2 `backend/src/modules/order/order.repositories.ts` (`version`): `CHECKSUM_AGG(BINARY_CHECKSUM(...))` có thể trùng**

- Hai thay đổi bù trừ nhau trong phép gộp checksum thì dấu không đổi, bản chép trễ tới lần đổi sau. Hiếm gặp, và đã có so `copyCount` đỡ trường hợp thêm, bớt. Có thể thêm `MAX(ModifiedAt)` của hai bảng vào dấu cho chắc.

### Ghi chú

- `refreshAfterClose` làm mới `['order']`, khóa danh sách `['order', 'cutting-progress', …]` nằm trong đó, nên lưới chính tải lại sau khi đóng popup đã lưu.
- Hai database không có transaction chung, nên nhật ký `SysAuditLog` ghi sau khi commit. Đúng mẫu module May.
- `15-cat.md` mô tả đúng code: không `CASCADE` ở `CuttingPlanDaily`, khe hở xóa/lưu, phân quyền. `01`, `14`, `README` đã trỏ tới file mới.

### Kết luận lượt 1 (5.14.2–5.14.5)

> Review Summary: examined 26 files (cùng 5 tài liệu), found 0 CRITICAL, 0 HIGH, 2 MEDIUM, 7 LOW findings, 1 SUGGESTION. Top priority: M4 (ĐVCS xóa kế hoạch cuối cùng thì bản chép "ma" không gỡ được) và M5 (truy vấn con Lũy kế thiếu `BranchCode` nên không dùng chỉ mục phủ). Merge recommendation: **APPROVE WITH SUGGESTIONS**. Phân quyền, lọc ĐVCS, A00, chính sách cột, chặn xóa kế hoạch đúng yêu cầu. Nên sửa M4, M5 cùng L18 trước khi deploy.

### Phản hồi Task 5.14.2–5.14.5, lượt 1 (15/10/2026)

| Mục | Xử lý |
|---|---|
| M4 | Đã sửa: "nguồn rỗng thì không đổi gì" chỉ áp cho phiên `A00`; phiên một ĐVCS vẫn chép (số cắt không bao giờ bị xóa ở bước chép, chỉ tách khỏi nguồn). Test mới trong `cutting.spec.ts` (ĐVCS giả `ZT514` chỉ có trong `MES_Cutting`): phiên `A00` gặp nguồn rỗng thì `skipped`; phiên ĐVCS thì dọn bản chép chưa có số, tách bản có số |
| M5 | Đã sửa: hai truy vấn con Lũy kế, Ngày cắt gần nhất kèm `d.BranchCode = CuttingPlan.BranchCode` để dùng chỉ mục phủ |
| L16 | Đã sửa: `save` kiểm lại `feed.exists` sau khi ghi, trước commit (khi có ô đổi) |
| L17 | Để lại: `ShipmentPlanFeedRepository` là đọc của hệ thống như `LinePlanLineRepository.feed` (tiền lệ module May), chỉ dùng qua `ShipmentPlanFeed`, lọc ĐVCS theo phiên |
| L18 | Đã sửa: popup tắt `refetchOnReconnect` |
| L19 | Đã sửa: sau Xóa số cắt bỏ dữ liệu cũ của popup trước khi tải lại; máy chủ không ghi nhật ký khi không còn số nào để xóa (kế hoạch còn nguồn) |
| L20 | Một phần: thêm test M4, `A00` nguồn rỗng, Trong ngày Chỉ đọc gửi `PUT` (403 `FIELD_READONLY`, kể cả `null`). Còn để lại: Id dùng lại, trùng ở ĐVCS khác, `values`/sắp xếp theo `cutQty`, `statusCode` |
| L21 | Để lại: lần chép đầu sau deploy chậm hơn khi nhiều kế hoạch; theo dõi khi chạy thật, cần thì ghi theo lô |
| L22 | Để lại: chỉ máy demo, cùng cách làm với Kế hoạch chuẩn bị SX |
| S2 | Đã làm: dấu phiên bản thêm `MAX(ModifiedAt)` của `ShipmentPlan`, `ShipmentPlanColorSize` |

Sau khi sửa: `cutting.spec.ts` 12/12; lint, `tsc`, build qua; frontend 33 file, 252 bài.

---

## Q7 – LK cắt, lượt 1 (15/10/2026)

### Phạm vi

Thay đổi chưa commit trên `main` sau `aa4aaf2` (`git diff`, 7 file). Tôi đọc toàn bộ:
- `order.repositories.ts` (`ShipmentPlanFeedRepository`, cả `setCutQty`), `shipment-plan-feed.service.ts`.
- `cutting-progress.service.ts`, `cutting.repositories.ts` (`cutTotals`, `syncFromPlans`, `CUT_QTY`).
- `seed-order.ts`, `simulate-board.ts`, `test/cutting.spec.ts`.

Đọc thêm để đối chiếu:
- `shipment.service.ts` (`update`, `remove`, `log`), `MES_Order/0001` (cột `CutQty`), `MES_Cutting/0001` (chỉ mục).
- Cách Kysely gán kiểu tham số (`mssql-driver.js` `#getTediousDataType`), `platform/database/db.ts`, `AuditService.log`.
- Tài liệu: `13-quyet-dinh.md` mục 13.6, `06-don-hang.md`, `12-du-lieu-mau-va-kiem-thu.md`, `15-cat.md`, `04-phan-quyen.md`, `02-trang-thai.md`.

Đã chạy `tsc --noEmit` và `eslint` trên các file đổi: qua. Không chạy jest (cần bộ database test; dùng kết quả nhóm báo).

### Điểm làm tốt

- **Câu UPDATE đúng và an toàn:**
  - Mọi giá trị là tham số của template `sql`, không nối chuỗi.
  - 400 dòng × 4 tham số = 1.600, dưới giới hạn 2.100.
  - Mảng rỗng không chạy vòng lặp nên không sinh `VALUES ()` sai cú pháp.
  - `CutQty` là `NOT NULL`, nên `p.CutQty <> v.CutQty` không bỏ sót dòng nào.
  - Join theo `Id` (khóa chính) nên seek từng dòng.
  - `Math.min(..., INT_MAX)` chặn tràn `INT`.
- **So thời điểm tạo đúng:**
  - Kysely gửi `Date` kiểu `datetime` cũ (`TYPES.DateTime`, làm tròn 1/300 giây).
  - `SourceCreatedAt` đã làm tròn một lần lúc chép. Gửi lại qua `datetime` thì giá trị vẫn nằm trên lưới đó. Cộng cả cách `DATEDIFF_BIG` đếm ranh giới, sai số tối đa khoảng 3 ms, dưới 5 ms.
  - `DATEDIFF_BIG` tránh lỗi tràn của `DATEDIFF(MILLISECOND, …)` khi hai thời điểm lệch hơn 24,8 ngày (Id dùng lại sau khi nạp lại dữ liệu). Lỗi tràn đó sẽ làm hỏng cả lô.
- **Phạm vi ĐVCS:**
  - ĐVCS lấy từ `scopeOf(user)`, lọc hai lớp: `cutTotals(branch)` và `ShipmentPlanFeed.setCutQty` lọc lại `r.branchCode === branch`.
  - Điều kiện `ON` có thêm `p.BranchCode = v.BranchCode`.
  - `save`, `removeEntries` ở `A00` bị chặn bằng `assertWritable` trước khi tới bước ghi LK cắt.
- **Ranh giới module (CLAUDE.md mục 4, 6):**
  - Module Cắt ghi qua service công khai `ShipmentPlanFeed`; SQL nằm trong repository của Đơn hàng.
  - Không có SQL thô ở service. Lint ranh giới qua.
- **Không đụng lần sửa kế hoạch:**
  - `ShipmentService.update` chỉ `set` `PoBuyDate`, `ShipDate`, `PlanQty` nên không ghi đè `CutQty`.
  - Hai bên tranh khóa dòng thì `setCutQty` chờ tối đa `requestTimeout` (15 giây); lỗi thì được bắt.
  - Không đổi `ModifiedAt`, nên ghi LK cắt không làm đổi dấu phiên bản và không gây vòng chép lại.
- **Lỗi giữa hai database:**
  - Ghi sau khi `MES_Cutting` commit. Lỗi thì log cảnh báo và bỏ dấu đã chép của ĐVCS lẫn `'*'`.
  - Tiến trình chết giữa chừng thì lúc khởi động lại bản đồ dấu rỗng, lần mở màn đầu sẽ đối chiếu.
- **Script:** `sim:board` chỉ áp `progress()` lúc chèn kế hoạch mô phỏng mới, không ghi đè kế hoạch giữ lại (có số cắt), nên `CutQty: 0` đúng. `seed-order` chạy trên kế hoạch vừa tạo.
- **Tài liệu:** `06-don-hang.md` (dòng 200, 496, 752), `12` (dòng 261, 443) khớp code.

---

### MEDIUM

**[MEDIUM] M6 `backend/src/modules/cutting/cutting-progress.service.ts:131-133, 145-158`: các lần ghi LK cắt chạy song song nên số cũ có thể đè số mới, và không tự sửa lại**

- **Rủi ro:** `pushCutQty` đọc Lũy kế (`cutTotals`) rồi mới ghi sang `MES_Order`, hai bước không giữ khóa nào. Thứ tự sau ra số sai:
  1. Lượt đối chiếu toàn ĐVCS (người B mở màn sau khi có kế hoạch vừa sửa; phiên `A00` thì đọc mọi ĐVCS) đọc Lũy kế = 10.
  2. Người A lưu số cắt: commit, `pushAfterWrite` ghi 22.
  3. Lượt đối chiếu của B ghi 10.

  `get()` sau khi lưu gọi `sync()` cũng không cứu được: nó nhập vào chính lượt của B đang chạy (`syncing`), hoặc thấy dấu không đổi. Vì `setCutQty` không đổi `ModifiedAt`, số 10 nằm đó tới khi ĐVCS có kế hoạch đổi hoặc máy chủ khởi động lại. Cùng họ lỗi này:
  - `pushAfterWrite` lỗi thì xóa dấu, nhưng một `syncOnce` cùng khóa đang chạy sẽ `synced.set(key, version)` ngay sau đó.
  - Nếu lượt đó đọc Lũy kế trước lần lưu thì lần ghi lỗi không bao giờ được thử lại.

  Không mất số gốc (ở `MES_Cutting`), nhưng màn Kế hoạch xuất hàng hiện sai lâu dài, trái lời 13.6 "lần mở màn sau đối chiếu lại".
- **Sửa (chọn một):**
  - Xếp hàng mọi lần ghi LK cắt trong tiến trình: một chuỗi promise trong service, `pushCutQty` đọc `cutTotals` **sau khi** tới lượt. Máy chủ chạy một tiến trình (đã ghi ở 13.2), nên lần ghi xếp sau commit luôn đọc số mới nhất và ghi sau cùng. Lỗi ở lượt sau xảy ra sau `synced.set` của lượt trước nên việc bỏ dấu còn hiệu lực.
  - Hoặc bọc đọc và ghi trong một transaction `MES_Cutting` giữ `sp_getapplock` riêng (`MES_Cutting.CuttingPlan.cutQty`, Exclusive, chờ 15 giây). Cách này đúng cả khi sau này chạy nhiều tiến trình.

  Thêm test: chặn `setCutQty` của lượt đối chiếu bằng `jest.spyOn` (chờ một promise), lưu số trong lúc đó, thả ra rồi kiểm `CutQty` bằng Lũy kế mới.

---

### LOW / SUGGESTION

**[LOW] L23 `backend/src/modules/cutting/cutting-progress.service.ts:128-133`, `docs/update_docs/13-quyet-dinh.md:585`, `backend/test/cutting.spec.ts:366`: đối chiếu chỉ chạy khi dấu phiên bản đổi, tài liệu và tên test nói rộng hơn**

- **Rủi ro:** "Đối chiếu toàn bộ" chỉ chạy khi `syncFromPlans` chạy, tức là dấu phiên bản đổi, số bản chép lệch, lần đầu sau khi khởi động, hoặc sau một lần ghi lỗi.
  - `CutQty` bị sửa ngoài luồng (script, SQL tay) hoặc lệch do M6 thì không được bắt lại tới lần kế hoạch đổi.
  - Bài test tên "(ghi lỗi, sửa ngoài luồng)" phải tự chạm `ShipmentPlanColorSize.ModifiedAt` thì mới đối chiếu: nó kiểm "đối chiếu khi dấu đổi", không kiểm "ghi lỗi".
- **Sửa:** ghi chính xác vào 13.6 "Phải nhớ": lệch ngoài luồng chỉ sửa khi dấu đổi hoặc khởi động lại. Đổi tên bài test. Muốn chắc hơn thì đối chiếu định kỳ (xem L26, đọc rẻ nên chạy được mỗi lần mở màn, có giới hạn tần suất).

**[LOW] L24 `backend/src/modules/cutting/cutting-progress.service.ts:367-380`: `save` ghi LK cắt sau nhật ký**

- **Rủi ro:** `this.fields.redact(...)` (đọc `MES_Core`) nằm trước `pushAfterWrite`. Nếu nó ném lỗi, request trả 500 dù số đã commit; LK cắt không được ghi và dấu đã chép không bị xóa, nên số lệch không được bắt lại (xem L23). `removeEntries` (dòng 412) đã làm đúng thứ tự.
- **Sửa:** gọi `pushAfterWrite` ngay sau transaction, trước khối nhật ký, như `removeEntries`.

**[LOW] L25 `backend/src/modules/cutting/cutting-progress.service.ts:132-137`: ghi LK cắt lỗi trong `syncOnce` làm lần sau chạy lại cả bước chép**

- **Rủi ro:** `pushCutQty` lỗi rơi vào `catch` chung. Kết quả:
  - Dấu bị xóa, lần mở màn sau chạy lại `syncFromPlans` (giữ khóa ứng dụng tới 15 giây, đọc toàn bộ nguồn) dù bản chép đã đúng.
  - `MES_Order` bị khóa lâu (ví dụ `sim:board` giữ transaction vài chục giây) thì mỗi lần mở màn đều chép lại.
  - Log ghi "Chưa chép được kế hoạch xuất hàng", trong khi chép đã xong, chỉ ghi LK cắt lỗi.
- **Sửa:** `try/catch` riêng quanh `pushCutQty`: vẫn `synced.set(key, version)`, đặt cờ `cutQtyStale` theo khóa; lần sau thấy cờ thì chỉ chạy `pushCutQty`. Câu log riêng.

**[LOW] L26 `backend/src/modules/order/order.repositories.ts:295-308`, `backend/src/modules/cutting/cutting.repositories.ts:230-242`: mỗi lần đối chiếu gửi toàn bộ kế hoạch sang `MES_Order`**

- **Rủi ro:** mỗi lần dấu đổi (bất kỳ ai sửa một kế hoạch rồi có người mở màn), lượt đối chiếu gửi mọi kế hoạch của ĐVCS (`A00`: mọi ĐVCS) thành các câu UPDATE 400 dòng, 1.600 tham số mỗi câu. Thường gần như không dòng nào đổi. Vài nghìn kế hoạch là vài chục câu lớn mỗi lượt, cộng thời gian dịch câu lệnh và khóa U trên từng dòng. Chi phí nhỏ, nhưng phình theo dữ liệu, và kéo dài khe M6.
- **Sửa:** thêm vào `ShipmentPlanFeed` hàm đọc `Id, CreatedAt, CutQty` theo ĐVCS của phiên, so ở JS (dùng `sameInstant`), chỉ gửi dòng khác. Khi đó chạy đối chiếu mỗi lần mở màn cũng rẻ (giải quyết L23).

**[LOW] L27 `backend/src/modules/order/order.repositories.ts:240, 295`; `docs/update_docs/13-quyet-dinh.md:583`; `docs/update_docs/04-phan-quyen.md:424`: ngoại lệ "việc của hệ thống" nay có ghi, chưa ghi rõ**

- **Rủi ro:** L17 được để lại với lý do `ShipmentPlanFeedRepository` là "**đọc** của hệ thống". Nay lớp này **ghi** bảng nghiệp vụ `ShipmentPlan`, không qua `BaseRepository`. Phiên `A00` (mở màn) ghi `CutQty` của mọi ĐVCS mà không qua `assertWritable`. Đây là số tổng hợp do hệ thống tính, không phải `A00` gắn dữ liệu, nên không trái luật 10. Nhưng:
  - 13.6 viết "chỉ kế hoạch của ĐVCS phiên", không nhắc `A00`.
  - `04-phan-quyen.md:424` (danh sách việc của hệ thống ghi mọi ĐVCS) chưa có mục này. Chép kế hoạch sang `MES_Cutting` cũng chưa có.
- **Sửa:** 13.6 thêm "`A00`: mọi ĐVCS; việc của hệ thống, không qua `BaseRepository`/`assertWritable`, lý do…". `04-phan-quyen.md:424` thêm "ghi LK cắt và chép kế hoạch xuất hàng của module Cắt ([Cắt](../update_docs/15-cat.md))".

**[LOW] L28 Tài liệu, vận hành chưa theo kịp**

- `docs/update_docs/15-cat.md:23`: bảng file ghi API công khai `plansOf`, `versionOf`, `exists`, thiếu `setCutQty`.
- `docs/update_docs/02-trang-thai.md:26`: còn "Còn: trả lời Q7"; chưa ghi Q7 đã chốt, việc làm, kết quả kiểm.
- **Vận hành:** máy đã có số giả ở `CutQty` (seed, `sim:board` cũ) giữ nguyên số giả tới khi ĐVCS đó (hoặc `A00`) mở màn Đồng bộ tiến độ cắt sau lần khởi động mới. ĐVCS chưa ai mở màn thì cột LK cắt vẫn là số giả.
- **Sửa:**
  - Sửa hai chỗ trên.
  - Ghi vào 13.6 hoặc `11-van-hanh.md` (việc chờ máy chủ ở 02): "sau deploy, mở màn Đồng bộ tiến độ cắt bằng `A00` một lần". Hoặc thêm migration `MES_Order` đặt `CutQty = 0` (đúng vì lần mở màn đầu sau khởi động sẽ ghi lại số thật).

**[LOW] L29 `backend/test/cutting.spec.ts:203-204, 294, 366-380`: thiếu test cho các nhánh rủi ro của `setCutQty`**

- Chưa có:
  1. Phiên A01 gọi `feed.setCutQty` với dòng của A02: trả 0, `CutQty` của A02 không đổi (lớp lọc ĐVCS của service).
  2. `createdAt` lệch quá 5 ms (Id dùng lại): không ghi.
  3. Phiên `A00` mở màn thì đối chiếu cả A01 và A02.
  4. Hơn 400 dòng (chia lô); có thể gọi thẳng repository với Id không tồn tại.
  5. Nhánh lỗi của `pushAfterWrite`: `jest.spyOn(feed, 'setCutQty').mockRejectedValueOnce(...)`. Lưu vẫn 200, `CutQty` còn số cũ; mở màn lần sau (không đổi dấu) thì đúng. Đây là lời hứa chính của 13.6 mà chưa có bài nào kiểm.
- **Sửa:** thêm các bài trên; bài 1, 2, 4 gọi thẳng `ShipmentPlanFeed` như bài đầu của file.

**[LOW] L30 `backend/src/modules/order/shipment.service.ts:412, 455-458`: nhật ký sửa kế hoạch có thể ghi `cutQty` đổi do module Cắt**

- **Rủi ro:** `before` đọc ngoài transaction. Module Cắt ghi `CutQty` giữa lúc đọc `before` và lúc `update` thì nhật ký `UPDATE` của người sửa kế hoạch hiện `cutQty` đổi như thể họ sửa. Chỉ ảnh hưởng hiển thị nhật ký.
- **Sửa:** chấp nhận; hoặc bỏ các cột lũy kế (`cutQty`, `sewnQty`…) khỏi `oldValue`/`newValue` của nhật ký sửa kế hoạch.

**[SUGGESTION] S3 `backend/src/modules/order/order.repositories.ts:299-303`: kiểu tham số trong `VALUES`**

- `CreatedAt` đi kiểu `datetime` (làm tròn 1/300 giây). Đúng nhờ dung sai 5 ms, cùng cách với `exists`.
- `BranchCode` đi kiểu `NVARCHAR(4000)`, so với `VARCHAR(10)` thì phía bảng chuyển kiểu ngầm. Vô hại vì join theo `Id`.
- Muốn chặt hơn: gửi chuỗi ISO và `CAST(v.CreatedAt AS DATETIME2(3))`, `CAST(v.BranchCode AS VARCHAR(10))` trong `VALUES`. Giữ nguyên cũng được, miễn thống nhất với `exists`, `sameInstant`.

### Kết luận lượt 1 (Q7)

> Review Summary: examined 7 files thay đổi (cùng 6 file đối chiếu và 6 tài liệu), found 0 CRITICAL, 0 HIGH, 1 MEDIUM, 8 LOW findings, 1 SUGGESTION. Top priority: M6 (các lần ghi LK cắt không tuần tự, số cũ đè số mới và không tự sửa lại tới khi kế hoạch đổi); nên sửa cùng L24 (ghi LK cắt trước nhật ký) và thêm test nhánh lỗi (L29.5). Merge recommendation: **APPROVE WITH SUGGESTIONS**. Câu UPDATE tham số hóa đúng, dưới giới hạn tham số, so thời điểm tạo đúng dung sai; phạm vi ĐVCS, `A00`, ranh giới module, quan hệ với `ShipmentService.update` đều đúng.

### Phản hồi Q7 – LK cắt, lượt 1 (15/10/2026)

| Mục | Xử lý |
|---|---|
| M6 | Đã sửa: mọi lần ghi LK cắt (sau lưu, sau Xóa số cắt, đối chiếu) giữ khóa ứng dụng `MES_Cutting.CutQty.push` (`withCutQtyLock`) và đọc Lũy kế khi đã giữ khóa: đúng cả khi pm2 chạy nhiều tiến trình. Bỏ việc xóa dấu đã chép khi ghi lỗi (đối chiếu không còn phụ thuộc dấu) |
| L23, L25 | Đã sửa: đối chiếu tách khỏi bước chép, chạy mỗi lần mở màn (`reconcileCutQty` trong `finally` của `syncOnce`), lỗi chỉ log riêng; bài test đối chiếu không còn đổi dấu phiên bản |
| L24 | Đã sửa: `save` ghi LK cắt trước nhật ký |
| L26 | Đã sửa: đối chiếu đọc `ShipmentPlanFeed.cutQtyOf` (Id, ĐVCS, thời điểm tạo, LK cắt) rồi chỉ gửi kế hoạch lệch |
| L27 | Đã ghi: quyết định 13.6, `04-phan-quyen.md` mục 6.9 (A00 ghi cột này cho mọi ĐVCS, việc của hệ thống) |
| L28 | Đã sửa `15-cat.md` (danh sách file, mục LK cắt, số giả cũ giữ tới lần mở màn đầu), `02-trang-thai.md` |
| L29 | Một phần: bài đối chiếu mỗi lần mở màn. Còn để lại: lọc ĐVCS khác, `createdAt` lệch, A00 mọi ĐVCS, hơn 400 dòng, nhánh ghi lỗi |
| L30 | Đã ghi vào quyết định 13.6 (Phải nhớ) |
| S3 | Để lại: so thời điểm tạo dùng chung dung sai 5 ms như `exists` |

Sau khi sửa: lint, `tsc` qua; `cutting.spec.ts`, `phase5.spec.ts`, `sewing.spec.ts` 85/85 trên `T514`.

## Lũy kế không vượt Kế hoạch (quyết định 13.7), lượt 1

### Phạm vi

Phần mới trong thay đổi chưa commit trên `main` sau `aa4aaf2` (phần Q7 đã review riêng, không xét lại):
- `backend/src/modules/cutting/cutting-progress.service.ts`: `save` (`await this.sync(user)`, khối `otherDays`/`over` trong transaction đã `repo.lock`), chú thích hàm.
- `backend/test/cutting.spec.ts`: bài "lưu theo ngày" (bỏ cắt vượt), bài mới "Lũy kế không vượt Kế hoạch (quyết định 13.7)…".
- `frontend/src/features/cutting/cuttingProgressRules.ts` (`overPlan`, `raisedOverPlan`, `saveIssue`), `CuttingProgressPage.tsx` (`sheet-error`, `overBefore`), `frontend/src/test/cutting-progress-rules.test.ts`.

Đọc thêm để đối chiếu:
- `syncOnce`, `syncFromPlans`, `reconcileCutQty`, `pushAfterWrite`.
- `BaseRepository.lock`, `lockBranchRow` (UPDLOCK, ROWLOCK); `platform/data/transaction.ts` (READ COMMITTED mặc định).
- `ShipmentPlanFeedRepository.version`, `colorSizes` (chỉ màu cỡ SL > 0); `cutting.dto.ts`; `scripts/cutting-data.ts` (chỉ xóa số cắt, không sinh số vượt).
- Tài liệu: `13-quyet-dinh.md` mục 13.3, 13.7; `15-cat.md`; `02-trang-thai.md` (Q36).

Đã chạy: `tsc --noEmit` backend qua; `vitest run src/test/cutting-progress-rules.test.ts` 8/8 qua. Không chạy jest backend (cần bộ database test).

### Điểm làm tốt

- **Luật đúng theo từng màu cỡ:**
  - Chặn khi `next > số đã lưu của ngày` và `otherDays + next > PlanQty`.
  - `dayQty` null hoặc 0 thành `next = 0`, không bao giờ bị chặn: xóa số luôn được.
  - Ô đã vượt (kế hoạch giảm) giảm số được, tăng thì không. Bằng Kế hoạch thì được.
- **Thứ tự kiểm đúng:**
  - Màu cỡ ngoài kế hoạch báo trước (`missing`), nên `planned.get(k)!` an toàn.
  - Lỗi ném trước mọi lệnh ghi trong transaction: 422 thì không ô nào được ghi (bài test kiểm cả ô S hợp lệ không bị ghi).
- **Chặn được đua giữa hai ngày khác nhau:**
  - `repo.lock` giữ khóa U trên dòng `CuttingPlan` tới hết transaction.
  - Mọi đường ghi `CuttingPlanDaily` của ứng dụng (`save`, `removeEntries`) đều khóa dòng này trước.
  - READ COMMITTED (kể cả khi bật RCSI) đọc `entries` bằng câu lệnh mới sau khi có khóa, nên thấy số người trước vừa commit.
- **Không khóa lồng nhau:**
  - `sync` (khóa `SYNC_LOCK`, rồi `CUT_QTY_LOCK` trong `reconcileCutQty`) chạy xong trước khi mở transaction của `save`.
  - `pushAfterWrite` chạy sau commit.
  - Không thấy chu trình khóa mới giữa `syncFromPlans` (sửa đầu kế hoạch trước, màu cỡ sau) và `save` (khóa U đầu kế hoạch, đọc màu cỡ).
- **`assertWritable` trước `sync`:** phiên `A00` bị từ chối ngay, không kéo theo một lần chép mọi ĐVCS.
- **Không lộ số:** thông báo và `details.cells` chỉ có tên màu cỡ, lấy theo bản chép, không theo chữ client gửi.
- **Frontend và backend cùng công thức:**
  - `liveCut = savedCut − savedDay + dayQty` tương đương `otherDays + next`.
  - `dayQty > savedDay` tương đương `next > cur`.
  - Kế hoạch hoặc Lũy kế bị Che, Ẩn thì frontend bỏ kiểm, máy chủ vẫn kiểm (có bài test).
- **Tài liệu:**
  - 13.3 đã thay câu cho phép cắt vượt bằng tham chiếu 13.7.
  - 13.7 ghi Q36 và việc màu cỡ đã bỏ không sửa được.
  - `15-cat.md` đã cập nhật.

---

### MEDIUM

**[MEDIUM] M7 `frontend/src/features/cutting/CuttingProgressPage.tsx:203, 264, 335`, `cuttingProgressRules.ts:66-68, 126-127`: giao diện kiểm theo Kế hoạch đã tải lúc mở popup**

Hai hệ quả: "tăng kế hoạch rồi lưu ngay" không làm được từ giao diện; kế hoạch giảm khi popup đang mở thì 422 mà lưới không chỉ ô nào.

- **Rủi ro khi kế hoạch tăng:**
  - 13.7 và `15-cat.md:35` nói "tăng kế hoạch rồi lưu ngay được, không cần mở lại popup". Máy chủ làm được (bài test gọi API).
  - Nhưng ở giao diện, `saveIssue` dùng `planQty` cũ, `raisedOverPlan` vẫn thấy vượt, `ActionButton` bị khóa (`blockedReason={issue}`).
  - Muốn lưu, người dùng phải đổi ngày hoặc đóng popup, và `confirmDiscard` sẽ bỏ số đang gõ.
  - Như vậy lần `sync` thêm vào `save` không giúp được đúng trường hợp nó được thêm vào.
- **Rủi ro khi kế hoạch giảm:**
  - Máy chủ trả 422 kèm `details.cells`, nhưng `onError` chỉ hiện toast.
  - Lưới vẫn hiện Kế hoạch cũ, không ô nào đỏ: người dùng đọc "Lũy kế vượt Kế hoạch" mà trên lưới chưa vượt.
- **Sửa (một trong hai):**
  1. Khi 422 có `details.cells` (hoặc thêm nút "Tải lại kế hoạch" cạnh dòng báo lỗi): tải lại chi tiết, dựng `rowsOf(mới)`, rồi gán lại `dayQty` đang gõ theo khóa màu/cỡ (không theo chỉ số dòng). Dòng nào không còn trong kế hoạch thì bỏ số gõ và báo.
  2. Đổi `raisedOverPlan` từ "khóa nút" sang "cảnh báo": vẫn tô đỏ và hiện câu nhắc, nhưng cho bấm Lưu để máy chủ quyết định. Gặp 422 thì làm như cách 1.

  Sau đó sửa câu trong 13.7 và `15-cat.md` cho khớp. Nếu tách hàm gộp số đang gõ vào dữ liệu mới ra `cuttingProgressRules.ts` thì thêm test cho hàm đó.

**[MEDIUM] M8 `backend/src/modules/cutting/cutting-progress.service.ts:339, 399, 414`: mỗi lần lưu đối chiếu LK cắt toàn ĐVCS hai lần và giữ khóa ứng dụng dùng chung ba lần**

- **Rủi ro:**
  - `save` giờ gọi `sync` trước (dòng 339), rồi `pushAfterWrite` (dòng 399), rồi `get` cuối hàm gọi `sync` lần nữa (dòng 414).
  - Mỗi `syncOnce`, kể cả khi dấu phiên bản không đổi, vẫn chạy:
    - `versionOf`: hai câu gộp trên `MES_Order`.
    - `copyCount`.
    - `reconcileCutQty`: `cutTotals` và `cutQtyOf` trên cả ĐVCS, trong lúc giữ khóa `MES_Cutting.CutQty.push`. Khóa này độc quyền chung cho **mọi** ĐVCS và giữ qua cả lần ghi sang `MES_Order`.
  - Tính ra mỗi lần lưu: 2 lượt quét toàn ĐVCS và 3 lần xếp hàng trên một khóa chung. Trước thay đổi chỉ có 1 lượt (trong `get`).
  - Nhiều người nhập cùng lúc, kể cả ở nhiều ĐVCS, sẽ phải xếp hàng nhau.
  - Chờ khóa quá 15 giây thì đối chiếu chỉ log rồi bỏ qua, số không sai, nhưng lần lưu có thể chậm thêm tới vài chục giây.
- **Sửa (một trong hai):**
  1. Cho `sync` một cờ bỏ đối chiếu, ví dụ `sync(user, { reconcile: false })`. Dùng cờ này cho lần `sync` trước khi kiểm và cho `get` cuối `save`. Kế hoạch vừa lưu đã có `pushAfterWrite`; các kế hoạch khác đối chiếu ở lần mở màn sau. Lưu ý: `syncing` gộp request theo ĐVCS, nên nếu đang có lượt chạy kèm đối chiếu thì request vẫn chờ lượt đó; chỉ lượt mới mới bỏ được đối chiếu.
  2. Thay `sync` trong `save` bằng bước chép lại riêng cho kế hoạch đang lưu (đọc màu cỡ của một kế hoạch qua `ShipmentPlanFeed`).

---

### LOW / SUGGESTION

**[LOW] L31 `backend/src/modules/cutting/cutting-progress.service.ts:337-344`, `backend/test/cutting.spec.ts:346`: `sync` chạy trước khi kiểm phạm vi; nguồn vừa xóa nay trả 404 thay vì 409**

- **Rủi ro:**
  - `save` với Id ngoài phạm vi (ĐVCS khác) vẫn chạy một lần chép và đối chiếu cho ĐVCS của mình rồi mới trả 404. Không lộ dữ liệu, chỉ tốn tài nguyên.
  - Kế hoạch nguồn vừa bị xóa mà bản chép chưa có số cắt: `sync` xóa bản chép, `getById` trả 404 chung chung. Trước đây trả 409 "Kế hoạch xuất hàng vừa bị xóa… Tải lại màn hình".
  - Bản chép đã có số cắt thì không sao: `sync` tách khỏi nguồn, kết quả vẫn là 409 "đã bị xóa: chỉ xem được".
  - Câu chú thích "Lưu trước khi chép lại" ở bài test dòng 346 không còn đúng, vì lần lưu tự chép lại.
  - Nhánh `feed.exists` ở dòng 342 gần như không còn bài test nào chạm tới (chỉ chạy khi `sync` lỗi hoặc có đua).
- **Sửa:**
  - Gọi `getById(scope, id, 'update')` trước `sync`, để Id ngoài phạm vi bị 404 trước khi chép.
  - Sau `sync`, gọi `getById` lần nữa. Lần đầu thấy dòng mà lần này NOT_FOUND thì trả `conflict('Kế hoạch xuất hàng vừa bị xóa…')`.
  - Sửa chú thích trong bài test.

**[LOW] L32 `cutting-progress.service.ts:112-119, 131-134, 339`: `sync` lỗi hoặc nhập vào lượt chép cũ thì kiểm theo Kế hoạch cũ**

- **Rủi ro:**
  - Hai đường dẫn tới Kế hoạch cũ:
    - `sync` lỗi (chờ `SYNC_LOCK` quá 15 giây, `MES_Order` lỗi) chỉ log, `save` chạy tiếp trên bản chép cũ.
    - `syncing` gộp request, nên `save` có thể chờ một lượt chép đã đọc nguồn **trước** lúc người dùng tăng kế hoạch.
  - Hậu quả:
    - (a) Tăng kế hoạch rồi lưu vẫn nhận 422 giả; thử lại thì được.
    - (b) Kế hoạch vừa giảm mà vẫn cho tăng tới mức cũ, Lũy kế vượt Kế hoạch mới. Đây là cùng tình trạng Q36. Khe giữa `sync` và transaction vốn có, vì hai database không có transaction chung.
  - Lần lưu có thể chờ thêm tới 15 giây vì `SYNC_LOCK`.
- **Sửa:**
  - Chấp nhận, và ghi vào 13.7 (Phải nhớ): Kế hoạch dùng để kiểm là bản chép tại lúc lưu, có thể trễ khi chép lỗi.
  - Có thể thêm vào câu 422: "Vừa tăng Kế hoạch xuất hàng thì thử lại sau ít giây", để người dùng biết cách thoát trường hợp (a).

**[LOW] L33 `cutting-progress.service.ts:362-371`: SL Kế hoạch bị Che/Ẩn vẫn dò được qua kết quả 200/422**

- **Rủi ro:**
  - Thông báo không có số (đúng 13.7), nhưng bản thân luật này là một phép so sánh.
  - Người được Sửa ô Trong ngày và xem được Lũy kế có thể dò dần `PlanQty` từng màu cỡ: nhập X, nhận 422 nghĩa là Lũy kế + X > Kế hoạch.
  - Lần dò thành công có ghi số, nhưng giảm lại được và có nhật ký.
  - Chiều ngược lại: Lũy kế bị Che mà Kế hoạch xem được thì dò ra Lũy kế.
  - Không sửa được bằng code mà vẫn giữ luật.
- **Sửa:** ghi vào 13.7 (Phải nhớ) và `04-phan-quyen.md`, phần chính sách cột của `cutting.progress`: Che SL Kế hoạch không che được giới hạn này với vai trò được Sửa Trong ngày, nên không Che/Ẩn `planQty` cho vai trò có `dayQty` Sửa được.

**[LOW] L34 `cuttingProgressRules.ts:60-63`, `CuttingProgressPage.tsx:254, 258`: màu cỡ đã bỏ khỏi kế hoạch luôn bị tô đỏ**

- **Rủi ro:**
  - Dòng `inPlan = false` có Kế hoạch 0 và Lũy kế > 0, nên `overPlan` luôn đúng.
  - Ô Lũy kế và +/- của các dòng này đỏ, chồng lên kiểu `cut-removed`.
  - Trong khi đó `overBefore` (dòng 267) lại loại các dòng này ra. Hai tín hiệu không nhất quán, dễ bị hiểu là lỗi cần sửa.
- **Sửa:** chọn một cách và ghi vào `15-cat.md`. Hoặc thêm `r.inPlan &&` vào `overPlan` (dòng đã bỏ chỉ dùng kiểu `cut-removed`), hoặc giữ tô đỏ có chủ ý.

**[LOW] L35 `backend/test/cutting.spec.ts:209-242`, `frontend/src/test/cutting-progress-rules.test.ts`: test còn thiếu**

1. Không có bài đua. Chú thích ở service dòng 355-356 khẳng định "hai người lưu hai ngày khác nhau cũng không cùng vượt", nhưng chưa có test chứng minh. Cần bài `Promise.all` hai lần `save` ở hai ngày khác nhau: mỗi lần riêng thì hợp lệ, cộng lại thì vượt. Mong đợi đúng một 200, một 422, và Lũy kế ≤ Kế hoạch.
2. Không có bài 422 khi `planQty` bị Che bằng chính sách cột. Bài này cần kiểm luật vẫn áp, và `error.message`, `details` không chứa số.
3. Chưa có hai ca: `dayQty: null` trên ô đã vượt; giảm số của một ngày khác (không phải ngày có số tăng) khi ô đã vượt.
4. Frontend: `overBefore` nằm trong component nên chưa có test. Nên tách thành `overBeforeCount(rows)` trong `cuttingProgressRules.ts` rồi test.
5. Bài 13.7:
   - Dựa vào trạng thái bài trước để lại (XS hôm qua 60, M 300), nên phụ thuộc thứ tự chạy.
   - Lệnh `save` trong `finally` mà lỗi thì che mất lỗi gốc.
   - Nên dựng kế hoạch riêng (như bài đối chiếu dùng `plan('A01', …, 'D', …)`) và dọn bằng câu xóa trực tiếp.

---

### Kết luận lượt 1 (13.7)

> Review Summary: examined 5 files (phần mới), found 0 CRITICAL, 0 HIGH, 2 MEDIUM, 5 LOW findings. Top priority: M7 (giao diện khóa nút Lưu theo Kế hoạch đã tải nên "tăng kế hoạch rồi lưu ngay" không làm được từ popup; 422 do kế hoạch giảm không chỉ ô nào), sau đó M8 (bỏ đối chiếu toàn ĐVCS khỏi đường lưu). Merge recommendation: **APPROVE WITH SUGGESTIONS**. Luật ở máy chủ đúng (tăng/giảm, ô đã vượt, ô ngoài kế hoạch, `dayQty` null/0, không ghi ô nào khi 422). Khóa dòng kế hoạch đủ để chặn đua giữa hai ngày. Không có khóa lồng nhau. Thông báo không lộ số.

### Phản hồi lượt 1 (13.7)

- **M7 – đã sửa.** Popup có nút "Tải lại kế hoạch" cạnh dòng báo vượt; lưu bị 422 cũng tự tải lại. Cả hai giữ số đang nhập theo màu cỡ (`reapply` ở `cuttingProgressRules.ts`), ô không còn sửa được theo số đã lưu. Tài liệu 13.7, `15-cat.md` ghi theo cách này.
- **M8 – đã sửa.** `sync(user, reconcile)`: đường lưu chép lại không đối chiếu LK cắt (cả lần chép trước khi kiểm và lần `get` cuối hàm), chỉ `pushAfterWrite` cho kế hoạch đang lưu.
- **L31 – đã sửa.** `save` gọi `getById` trước khi chép (ngoài phạm vi vẫn 404); sau khi chép mà bản chép bị dọn thì 409. Có bài test mới; chú thích bài kế hoạch mất nguồn đã sửa.
- **L32, L33 – ghi tài liệu.** Mục "Phải nhớ" của 13.7; `04-phan-quyen.md` mục 8 thêm khuyến nghị không Che, Ẩn `planQty` với vai trò được Sửa `dayQty`.
- **L34 – đã sửa.** Màu cỡ đã bỏ khỏi kế hoạch không tô đỏ, không tính là vượt (`overPlan` đòi `inPlan`); ghi ở 13.7.
- **L35 – phần lớn đã làm.** Bài 13.7 tách thành nhóm riêng có kế hoạch riêng (`plan(…, 'E', …)`, dọn ở `afterEach`, không còn `finally`): 422 không ghi ô nào, `details` chỉ có tên; ô đã vượt giảm được, xóa ô (`null`) được; tăng kế hoạch rồi lưu ngay; đua hai ngày bằng `Promise.all` (một 200, một 422). Frontend: `keptOverPlan` (tách từ `overBefore`), `reapply`, dòng màu cỡ đã bỏ. Còn để lại: bài 422 khi `planQty` bị Che (thông báo, `details` theo cách dựng không có số), ca giảm số của một ngày khác khi ô đã vượt.
