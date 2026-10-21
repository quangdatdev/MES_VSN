# Quyết định kiến trúc

File này gộp các quyết định kiến trúc **đang hiệu lực** từ ADR 0001–0014, xếp theo chủ đề. Phần ADR đã bị quyết định sau thay thì không chép lại. Đọc khi cần biết vì sao hệ thống làm như vậy, trước khi đổi một quy tắc, hoặc khi hai tài liệu nói khác nhau.

Mỗi quyết định gồm: nội dung đang áp dụng, lý do, điều phải nhớ (hệ quả, giới hạn), nguồn ADR và chỗ trong code. Cách vận hành chi tiết nằm ở tài liệu của từng khối (có link). Quyết định mà code chưa làm hoặc làm khác: bảng ở mục "Quyết định chưa khớp code" cuối file.

## Dùng file này thế nào

- Quyết định ở đây là căn cứ cho quy tắc và ý định; code là căn cứ cho hiện trạng (mục 16.2). Tài liệu nói khác code, hoặc khác quyết định ở đây: báo Tech Lead, không tự chọn bên nào.
- Đổi hoặc thêm quyết định: sửa mục ở đây (hoặc thêm mục mới vào đúng chủ đề, đánh số tiếp), ghi lý do, hệ quả, nguồn (task, người chốt), rồi sửa tài liệu của khối liên quan. Quy trình: [Quy trình phát triển](../DEVELOPMENT_WORKFLOW.md) mục 6.
- Thuật ngữ (ĐVCS, Nhà máy SX, `A00`, PO, KHXH…): [Tổng quan](../PROJECT_OVERVIEW.md).
- Dòng **Nguồn** nhắc `docs/phases/…`, `docs/adr/…`, `docs/thiet-ke/…`: các file đó đã xóa ngày 19/10/2026 sau khi chuyển nội dung còn hiệu lực vào bộ tài liệu; cần đọc bản gốc thì `git show 98d19db:<đường dẫn>`. Comment trong code trích "quyết định X.Y": số mục của file này (đổi từ "ADR 00xx" ở task T1, 21/10/2026). Migration đã chạy không sửa nên comment trong `backend/migrations` còn trích "ADR 00xx": tra bảng tra ADR cuối file.

## 1. Nền tảng và công nghệ

### 1.1 Modular Monolith, mỗi module một database
- **Áp dụng:** một backend NestJS chia `platform/` (nền tảng) và `modules/` (nghiệp vụ `order`, `sewing`, `cutting`, `hr`); frontend React một trang. Mỗi module nghiệp vụ có database riêng (`MES_Order`, `MES_Sewing`, `MES_Cutting`, `MES_Hr`); bảng lõi `Sys*` ở `MES_Core`; dữ liệu chép từ hệ thống ngoài ở `MES_Sync`.
- **Lý do:** dựng nhanh, triển khai một tiến trình; tách database để dễ nhìn và sao lưu theo module.
- **Phải nhớ:** không có transaction chung giữa các database; sao lưu các database phải cùng thời điểm. Module mới dùng database mới, không thêm bảng vào database của module khác.
- **Nguồn:** ADR 0001 mục 1–2 và Hệ quả. Code: `backend/src/app.module.ts`, `backend/src/modules/*/*.db.ts`. Chi tiết: [Kiến trúc](../ARCHITECTURE.md).

### 1.2 Module chỉ dùng API công khai của nhau, lint cưỡng chế
- **Áp dụng:** module không import phần bên trong module khác và không đọc bảng của module khác. Module May đọc dàn chuyền qua `ScheduleFeed`. `OrderModule` xuất `ScheduleFeed`, `ShipmentPlanFeed`, `ShipmentPlanDeleteGuards`, `LineColorSizeFeed`, `LineSupplyGuards`, `LineDayPlanGuards`: module May, Cắt dùng các API này và đăng ký hàm kiểm vào các `*Guards`, nên module Đơn hàng không import ngược (mục 13.4, 13.8, 14.2). Module nghiệp vụ đọc dữ liệu chép từ BRAVO, OSM qua `SourceFeedService`, tên và danh mục BRAVO qua `CatalogLookupService`, dữ liệu nền tảng qua service của `platform`. Nền tảng không import module: module cấp dữ liệu cho nền tảng bằng cách đăng ký vào service của nền tảng (module Nhân sự đăng ký nguồn chuyền `LineSource` vào `OrgService`, mục 6.7). `backend/eslint.config.mjs` chặn bằng `no-restricted-imports`.
- **Lý do:** giữ module tách được và phụ thuộc một chiều (Đơn hàng không biết May).
- **Phải nhớ:** thêm module thì thêm khối luật lint riêng cho nó (flat config không gộp luật cùng tên giữa các khối). Luật ranh giới chỉ có ở backend. Chưa có hạ tầng sự kiện giữa module.
- **Nguồn:** ADR 0001 mục 1; ADR 0003 (lint ranh giới); ADR 0007 mục Nơi lưu; ADR 0009 Hệ quả; ADR 0012. Code: `backend/eslint.config.mjs`, `backend/src/modules/order/schedule-feed.service.ts`, `backend/src/platform/feed/source-feed.service.ts`.

### 1.3 Công nghệ backend, phiên bản khóa
- **Áp dụng:** Node.js 22, NestJS 11, TypeScript 6.0.x strict (CommonJS), Kysely 0.28 với tedious cho SQL Server, `class-validator`/`class-transformer`, argon2id cho mật khẩu, `@nestjs/jwt` cho token.
- **Lý do:** Kysely là query builder có kiểu, cho chèn điều kiện phân quyền ở một chỗ (`BaseRepository`) mà vẫn viết T-SQL khi cần; ORM nặng khó bảo đảm mọi truy vấn đi qua một cổng. NestJS 12 và Kysely 0.29 chỉ hỗ trợ ESM.
- **Phải nhớ:** không nâng NestJS 12, Kysely 0.29 khi chưa chuyển cả dự án sang ESM; TypeScript: Tech Lead duyệt 19/10/2026 chuẩn hóa sang 6.0.3 (thay quy tắc cũ "giữ 5.9 vì ts-jest"); đã nâng `backend`, `frontend` lên `~6.0.3` ở task T3 (21/10/2026), không lên 6.1 khi `typescript-eslint` chưa nhận. Thay thư viện truy cập dữ liệu là viết lại `BaseRepository`: phải có quyết định mới trước khi viết code.
- **Nguồn:** ADR 0003 bảng công nghệ, mục "Cập nhật khi dựng Phase 1–2". Code: `backend/package.json`.

### 1.4 Migration là file `.sql` có số thứ tự, người chạy
- **Áp dụng:** `backend/migrations/<Database>/NNNN_ten.sql`, chạy bằng `backend/scripts/migrate.ts`; tên file đã chạy lưu ở `dbo.__MigrationHistory` của từng database. Runner chỉ chạy khi gọi `npm run migrate`, không chạy lúc backend khởi động.
- **Lý do:** T-SQL thuần dễ review; khớp quy tắc AI tạo file migration, người duyệt và chạy.
- **Phải nhớ:** lịch sử chỉ lưu tên file, không có checksum: sửa file đã chạy không có tác dụng, phải thêm file mới. Quy tắc AI với migration: [AGENTS.md](../../AGENTS.md) mục 7; lệnh: [Vận hành](11-van-hanh.md).
- **Nguồn:** ADR 0003 bảng công nghệ (Migration). Code: `backend/scripts/migrate.ts`.

### 1.5 Frontend
- **Áp dụng:** React 19 + Vite, Mantine 9, TanStack Query cho dữ liệu máy chủ, Zustand cho trạng thái phiên (chỉ trong bộ nhớ), React Router 7 với màn nạp lười theo đường dẫn. PWA chỉ có manifest, không có service worker.
- **Lý do:** Mantine có sẵn bảng, form, modal, thông báo, Spotlight (Ctrl+K tìm màn), date picker, chế độ tối; giao diện mặc định mềm, nhanh hơn tự dựng.
- **Phải nhớ:** cài PWA lên màn hình điện thoại cần HTTPS. Thêm thư viện lớn phải có quyết định ghi ở đây (như `react-datasheet-grid`, mục 11.1).
- **Nguồn:** ADR 0003 bảng công nghệ và mục "Cập nhật khi dựng Phase 1–2". Code: `frontend/package.json`, `frontend/src/routes/registry.tsx`, `frontend/index.html`.

### 1.6 Test chạy trên database thật
- **Áp dụng:** backend dùng Jest + supertest trên SQL Server thật, kiểm ma trận phân quyền ở mức API; frontend dùng Vitest + Testing Library.
- **Lý do:** phân quyền và lọc ĐVCS nằm trong câu SQL, chỉ kiểm đúng được trên database thật.
- **Phải nhớ:** phân quyền và lọc ĐVCS bắt buộc có test. Cách chạy, bộ database test riêng: [Dữ liệu mẫu và kiểm thử](12-du-lieu-mau-va-kiem-thu.md).
- **Nguồn:** ADR 0003 bảng công nghệ. Code: `backend/jest.config.js`, `backend/test/`, `frontend/src/test/`.

### 1.7 Triển khai máy chủ: thư mục release, pm2 cluster reload
- **Áp dụng:** máy chủ Windows chạy backend (kèm giao diện, `--serve-web`) bằng pm2, cluster một tiến trình. Mỗi lần cập nhật, `deploy/deploy.cjs` chép đúng một commit ra `<root>\releases\<thời điểm>`, `npm ci` + build ở đó trong lúc bản cũ vẫn chạy, migrate, trỏ junction `<root>\current` sang bản mới rồi `pm2 reload`. Bản mới có file migration mới thì dừng bản cũ trong lúc migrate (trừ `--online-migrate`). Trước khi chuyển kiểm cấu hình `.env` với bản mới; sau khi chuyển, bản mới không chạy ổn định mà không có migration mới thì tự quay về bản trước. Giữ 3 bản đã chạy được để quay về (`--rollback`, không migrate lùi). Một `.env` ở `<root>\shared`, chép vào từng bản (kể cả bản quay về). Giao diện tự tải lại trang khi thiếu file code của màn mà máy chủ đang trả lời (`frontend/src/lib/chunkReload.ts`); `/assets/` thiếu file trả 404.
- **Lý do:** trước đó mỗi lần cập nhật phải dừng pm2 suốt `npm ci` và build (vài phút): `npm ci` xóa `node_modules` đang bị tiến trình giữ khóa (gói native `argon2`), build xóa `dist` đang phục vụ. Người dùng yêu cầu bớt hạ web, chọn mức "gần như 0" (13/10/2026). Script viết bằng Node thay vì PowerShell 5.1 vì `ConvertFrom-Json` hỏng với `pm2 jlist` (khóa `Path`/`PATH` trùng), `Remove-Item -Recurse` có thể đi xuyên junction xóa thư mục đích.
- **Phải nhớ:**
  - `pm2 reload` tắt cứng tiến trình cũ (pm2 chỉ báo tắt qua tin nhắn với `stop`, `restart`, `delete`): request đang xử lý đúng lúc chuyển bị cắt. Muốn tắt êm cả lúc reload phải đổi cách (nhiều tiến trình sau reverse proxy, hoặc API nội bộ của pm2): cần quyết định mới.
  - Không chạy hai tiến trình lâu dài (`instances` > 1) khi chưa rà bộ nhớ đệm trong tiến trình; việc lúc khởi động đã khóa bằng `sp_getapplock` nên chạy chồng vài giây lúc reload là an toàn.
  - Backend phải tìm `.env`, `frontend/dist` theo vị trí thật của `main.js`, không theo thư mục làm việc (junction và `cwd` của pm2 dựa vào điều này).
  - Mỗi bản có `node_modules` riêng (tốn đĩa). Migration có file mới vẫn làm web gián đoạn ngắn.
  - Script chỉ xóa thư mục do nó tạo (trong `releases`, tên theo thời điểm, có `.commit`) và chỉ làm việc trong thư mục có `.mes-deploy`; hàm xóa, junction có test (`npm run test:deploy`). Không tự đổi quyền thư mục, chỉ cảnh báo.
- **Nguồn:** yêu cầu của người dùng 13/10/2026 (git pull trên máy chủ, giao diện qua `--serve-web`, gián đoạn gần như 0); review `docs/review/trien-khai-khong-gian-doan.md`. Code: `deploy/deploy.cjs`, `deploy/lib.cjs`, `deploy/ecosystem.config.cjs`, `backend/src/main.ts`, `backend/src/serve-web.ts`, `frontend/src/lib/chunkReload.ts`. Chi tiết: [Vận hành](11-van-hanh.md#cap-nhat-ban-moi-len-may-chu).

## 2. Database

### 2.1 Khóa ngoại vật lý chỉ trong cùng database
- **Áp dụng:** quan hệ giữa hai database là khóa ngầm: khai báo ở `backend/migrations/softkeys.json`, có chỉ mục, kiểm bản ghi mồ côi bằng `npm run check:softkeys -w backend` (chỉ đọc).
- **Lý do:** SQL Server không có khóa ngoại giữa database; database đã tách theo module.
- **Phải nhớ:** ghi vào hai database phải tự xử lý trường hợp lỗi giữa chừng. Danh sách khóa ngầm: `backend/migrations/softkeys.json` (loại quan hệ: [Kiến trúc](../ARCHITECTURE.md) mục 6.3).
- **Nguồn:** ADR 0001 Hệ quả. Code: `backend/scripts/check-softkeys.ts`.

### 2.2 Báo cáo xuyên module gom về một chỗ
- **Áp dụng:** báo cáo cần dữ liệu nhiều module sẽ gom về database `MES_Report` hoặc qua view công bố, không để module đọc bảng của nhau. Hiện chưa có báo cáo nào.
- **Nguồn:** ADR 0001 Hệ quả.

## 3. Phân quyền

Cơ chế chi tiết, bảng, API: [Phân quyền](04-phan-quyen.md).

### 3.1 Backend cưỡng chế, mặc định từ chối
- **Áp dụng:** mọi kiểm soát quyền nằm ở backend; giao diện chỉ ẩn hiện. Mọi endpoint phải khai báo `@Public`, `@Authenticated` hoặc `@RequirePermission('module.resource:action')`; không khai báo thì `403 ENDPOINT_NOT_DECLARED`. `@RequirePermission` ở method thắng `@Public` ở class.
- **Lý do:** ẩn nút không chặn được người gọi thẳng API; quên khai báo không được thành lỗ hổng.
- **Phải nhớ:** quyền, vai trò là dữ liệu trong `MES_Core`, cấp qua màn Quản trị.
- **Nguồn:** ADR 0001 mục 3; ADR 0002. Code: `backend/src/platform/auth/permission.guard.ts`.

### 3.2 `BranchCode` chỉ lấy từ token
- **Áp dụng:** sau đăng nhập, người dùng chọn một ĐVCS trong danh sách `SysUserBranch` của mình; server cấp access token mang `BranchCode`. Mọi điều kiện lọc và giá trị ghi `BranchCode` lấy từ token. Ngoại lệ duy nhất: body của `POST /auth/select-branch` là yêu cầu chọn, server kiểm với `SysUserBranch` rồi mới cấp token. Đổi ĐVCS là cấp token mới.
- **Lý do:** client tự đặt được body, query, header; tin chúng là lộ dữ liệu ĐVCS khác.
- **Phải nhớ:** `BranchCode` là mã ngắn `VARCHAR(10)`, cấm sửa sau khi tạo. Repository ghi đè mọi `BranchCode` client gửi.
- **Nguồn:** ADR 0002. Code: `backend/src/platform/auth/auth.guard.ts`, `auth.service.ts` (`selectBranch`).

### 3.3 `BaseRepository` là cổng duy nhất tới bảng nghiệp vụ
- **Áp dụng:** mọi truy vấn dữ liệu nghiệp vụ đi qua lớp con của `BaseRepository`/`ChildRepository`; repository tự thêm điều kiện ĐVCS và phạm vi cho list, getById, create, update, delete, xuất file, popup giá trị. Tài nguyên phải khai báo trong `SysResource` (Resource Registry) đúng bảng nguồn và `ScopeType` (`BRANCH` hoặc `SHARED`); chưa khai báo thì `500 RESOURCE_NOT_REGISTERED`. Tài nguyên `BRANCH` luôn được coi là gắn chiều `FACTORY` qua `BranchCode`, dù quên khai báo.
- **Lý do:** điều kiện phân quyền chỉ viết ở một chỗ; module không thể quên hay viết sai.
- **Phải nhớ:** cấm SQL thô trong controller, service; module không tự viết điều kiện phân quyền. Bảng danh mục dùng chung không có cột ĐVCS (`PrepStep`, `DepartmentType`, `JobTitle`, danh mục ở `MES_Core`) không qua `BaseRepository`; quyền kiểm ở controller (sửa danh mục cần `admin.catalog:*`).
- **Nguồn:** ADR 0002; ADR 0005 mục L3. Code: `backend/src/platform/data/base.repository.ts`, `resource-registry.ts`.

### 3.4 Đơn vị tổng hợp `A00`
- **Áp dụng:** `SysBranch.IsAggregate = 1` (chỉ một đơn vị, có chỉ mục duy nhất). Chọn `A00` thì đọc dữ liệu mọi ĐVCS, theo hợp phạm vi của các phép gán (mục 3.5); mọi thao tác ghi dữ liệu theo ĐVCS bị từ chối `403 AGGREGATE_READ_ONLY`. Không dòng dữ liệu nào mang `BranchCode = 'A00'`. Cờ tổng hợp do server tra từ `SysBranch`.
- **Lý do:** lãnh đạo cần xem toàn công ty mà không vô tình ghi dữ liệu không thuộc ĐVCS nào.
- **Phải nhớ:** dữ liệu dùng chung không gắn ĐVCS (phòng ban, hồ sơ nhân viên, danh mục) vẫn ghi được ở `A00`; trừ Phân bổ PO, nơi ĐVCS giữ dòng suy từ Nhà máy SX (mục 7.9). `A00` là của MES, không có trong BRAVO.
- **Nguồn:** ADR 0002; ADR 0005 Hệ quả; ADR 0012 mục 5; ADR 0013 mục 1. Code: `BaseRepository.assertWritable`, `backend/src/platform/permission/branch.service.ts`.

### 3.5 Phạm vi theo phép gán (L3)
- **Áp dụng:** mỗi phép gán vai trò (`SysUserRole`) mang phạm vi riêng (`SysUserRoleScope`): chiều (`FACTORY`, `LINE`, `OWNER`, hoặc chiều tự thêm) với `ScopeMode` `ALL`, `ORG_SUBTREE`, `LIST`, `OWN`. Tài nguyên khai chiều nào lọc qua cột nào ở `SysResourceScopeBinding`.
  - Phép gán không khai báo phạm vi ở một chiều thì không bị giới hạn ở chiều đó (ĐVCS vẫn luôn giới hạn theo phiên).
  - `FACTORY` dạng `LIST` làm phép gán chỉ có hiệu lực ở các ĐVCS đó; ở `A00` thì chỉ đọc các ĐVCS đó.
  - Trong một phép gán các chiều kết hợp AND, nhiều giá trị một chiều kết hợp OR; giữa các phép gán cùng cấp một quyền kết hợp OR. Quyền và phạm vi của phép gán này không rò sang phép gán khác.
  - Tài nguyên không gắn một chiều thì chiều đó không áp cho nó (ví dụ phạm vi chuyền không lọc bảng không có cột chuyền).
  - Ghi dòng ngoài phạm vi trả 404 như không tồn tại; tạo hoặc sửa dòng sang giá trị chiều ngoài phạm vi trả `403 SCOPE_DENIED`.
- **Lý do:** một người có thể là Trưởng chuyền ở ĐVCS này và chỉ xem báo cáo ở ĐVCS khác; cấu hình bằng dữ liệu, không bằng code.
- **Phải nhớ:** đóng an toàn: phạm vi trỏ tới đơn vị tổ chức hay chiều đã tắt, mã chuyền không còn là chuyền đang dùng, hoặc tổ hợp không hợp lệ, được coi là tập rỗng, không bao giờ là "không giới hạn". Tổ hợp hợp lệ:
  - `FACTORY` (chiều có `OrgType`) dùng `ALL`, `ORG_SUBTREE`, `LIST` theo `OrgUnitId`;
  - `LINE` là chiều giá trị (mục 6.7): chỉ `ALL`, hoặc `LIST` theo mã bộ phận chuyền (`ScopeValue`); dòng kiểu cũ theo nút cây tổ chức và giá trị `~mã` do migration ghi cho phạm vi cũ vốn không có tác dụng đều là tập rỗng;
  - `OWNER` dùng `ALL`, `OWN`; chiều khác dùng `ALL`, `LIST` theo `ScopeValue`.

  Xóa phép gán phải xóa phạm vi trước (không có `ON DELETE CASCADE`) và ghi nhật ký. Gán lại vai trò so khác biệt để giữ phạm vi của phép gán không đổi.
- **Nguồn:** ADR 0005 mục Dữ liệu, L3, Hệ quả; phase 5.10 (chiều `LINE`). Code: `backend/src/platform/permission/permission.service.ts` (`grantOf`), `BaseRepository.limit`, migration `MES_Core/0002_scope_field_override.sql`, `0009_line_scope_by_code.sql`.

### 3.6 Ngoại lệ theo người (L5)
- **Áp dụng:** thứ tự quyết định: Deny theo người còn hiệu lực thì từ chối; Allow theo người còn hiệu lực thì cho phép; không có thì xét hợp các phép gán; không khớp thì từ chối. Phạm vi của Allow là hợp phạm vi mọi phép gán đang hiệu lực ở ĐVCS của phiên; không có phép gán nào thì chỉ ĐVCS của phiên (ở `A00` thì không thấy gì).
- **Lý do:** cần mở hoặc chặn một quyền cho đúng một người, có thời hạn, không phải tạo vai trò mới.
- **Phải nhớ:** ngoại lệ bắt buộc có lý do, có hạn dùng tùy chọn. Allow không mở rộng ra ngoài ĐVCS đã chọn với tài nguyên theo ĐVCS; nhưng với tài nguyên dùng chung (đơn hàng, PO), Allow ở `A00` thấy toàn bộ. Trần quyền quản trị (mục 4.2) áp cho cả ngoại lệ; không tự đặt ngoại lệ cho mình.
- **Nguồn:** ADR 0005 mục L5; ADR 0013 mục 4. Code: `PermissionService.compute`, `backend/src/platform/admin/admin-grants.service.ts`.

### 3.7 Chính sách cột (L4)
- **Áp dụng:** mỗi cột đăng ký ở `SysResourceField` (mã trùng tên trường JSON của API, cờ nhạy cảm) có mức `HIDDEN`, `MASKED`, `READONLY`, `EDITABLE` với từng người dùng:
  1. chính sách theo người còn trong hạn dùng thắng mọi vai trò;
  2. không có thì lấy mức mở nhất (Sửa được > Chỉ đọc > Che > Ẩn) trong các vai trò đang hiệu lực ở ĐVCS của phiên **và có quyền xem tài nguyên đó**;
  3. vai trò không khai báo cột: cột thường Sửa được, cột nhạy cảm Ẩn.
- **Cưỡng chế một chỗ** cho xem, sửa, xuất file: cột Ẩn bị bỏ khỏi JSON, cột Che trả `"***"`, gửi giá trị cho cột không Sửa được bị `403 FIELD_READONLY`. Mỗi lần trả cột nhạy cảm không che thì ghi `SysSensitiveReadLog` (bảng chỉ ghi thêm). Frontend nhận mức qua `GET /me/field-policies` và chỉ phản chiếu.
- **Lý do:** đơn giá, doanh số, giấy tờ nhân viên chỉ một số người được thấy; ẩn ở giao diện không đủ.
- **Phải nhớ:**
  - Mức Sửa được không thay quyền chức năng: vẫn cần `:update`.
  - Không sắp xếp, lọc, tìm, gợi ý, hỏi giá trị popup theo cột Ẩn hoặc Che (dò được giá trị). Máy chủ bỏ tham số đó; popup giá trị trả `403 FIELD_NOT_READABLE`.
  - Chính sách tính theo màn hình (tài nguyên), không theo dữ liệu: cùng một dữ liệu hiện ở nhiều màn thì phải đặt chính sách ở mọi màn đó.
  - Dữ liệu đọc từ tài nguyên khác lọc theo chính sách cột của tài nguyên nguồn (ví dụ popup Chọn mã hàng theo `order.allocation` và `order.po`).
  - Nhật ký nghiệp vụ không chứa cột nhạy cảm (màn Nhật ký không đi qua chính sách cột).
  - Chính sách theo vai trò không có hạn dùng (database chặn); chính sách theo người bắt buộc có lý do.
- **Nguồn:** ADR 0005 mục L4; ADR 0006 mục "Bổ sung cho ADR 0005" và "Bổ sung sau review 5.1 lượt 2"; ADR 0011 mục 1. Code: `backend/src/platform/permission/field-policy.service.ts`, `field-policy.interceptor.ts`, `backend/src/platform/export/export.service.ts`.

### 3.8 Không có quyền xem là mất cả tài nguyên
- **Áp dụng:** thiếu `:view` (kể cả do Deny theo người) thì mọi hành động khác của tài nguyên đó cũng bị gỡ.
- **Lý do:** không còn đường đọc qua xuất file hay qua dữ liệu trả về sau khi sửa.
- **Nguồn:** ADR 0006 mục "Bổ sung cho ADR 0005". Code: `PermissionService.compute`.

### 3.9 Cache quyền và phiên bản quyền
- **Áp dụng:** quyền, phạm vi, chính sách cột tính theo cặp (người dùng, ĐVCS của phiên), cache theo `SysPermissionVersion` và mốc sớm nhất một phép gán, ngoại lệ hay chính sách theo người bắt đầu hoặc hết hiệu lực. Response mang header `X-Permission-Version` dạng `version.mốc`; đổi thì giao diện tải lại menu, quyền, chính sách cột.
- **Lý do:** mỗi request không phải tính lại quyền; quyền có hạn dùng tự hết mà không cần ai đổi gì.
- **Phải nhớ:** mọi thay đổi ảnh hưởng quyền hay phạm vi (phân quyền, chính sách cột, ngoại lệ, đổi tập chuyền may, đổi ĐVCS của nhà máy SX, bật tắt nhà máy, bật tắt ĐVCS) phải tăng phiên bản quyền trong cùng transaction (mục 4.4). Ngoại lệ duy nhất: đổi tập chuyền may lưu ở `MES_Hr`, tăng phiên bản ở `MES_Core` ngay sau commit (mục 6.7).
- **Nguồn:** ADR 0005 mục "Cache và hiệu lực"; ADR 0006; ADR 0013 mục 11; phase 5.10. Code: `PermissionService` (`accessStamp`, `bumpVersion`, `recordLineSetChange`), `frontend/src/store/auth.ts`.

### 3.10 Bảng con, ràng buộc tổng, khóa dòng
- **Áp dụng:**
  - `ChildRepository`: dòng con nằm trong phạm vi khi thỏa **một** phép gán, xét chung điều kiện của dòng cha và của chính dòng con (`scopeColumns`, ví dụ dòng dàn chuyền `LINE → LineCode`). Khóa tới cha, `BranchCode` do repository đặt; khóa ngoại ghép `(ParentId, BranchCode)` giữ con cùng ĐVCS với cha.
  - Số liệu kiểm ràng buộc (ví dụ tổng SL đã xếp chuyền của một kế hoạch) tính trên cả ĐVCS bằng `branchOnly`, gồm cả dòng ngoài phạm vi người xem, chỉ trả tổng. SL đã lập kế hoạch của một đơn hàng dùng chung cộng kế hoạch ở mọi ĐVCS (mục 7.3).
  - Thao tác cùng lúc trên một đối tượng xếp hàng bằng `lock` (`UPDLOCK`, không ghi), theo thứ tự đơn hàng → kế hoạch → dòng dàn chuyền → màu cỡ ở mọi đường ghi; `lockBranchRow` chỉ để xếp hàng, không xét phạm vi, không trả dữ liệu.
  - Transaction có khóa chạy qua `inTransaction`; bị chọn làm nạn nhân deadlock (1205) thì trả `409 CONFLICT` "thử lại", không phải 500.
- **Lý do:** người chỉ sửa được chuyền của mình vẫn không được xếp vượt SL kế hoạch; hai người lưu cùng lúc không phá ràng buộc.
- **Phải nhớ:** phạm vi xem và phạm vi sửa có thể khác nhau (nhiều vai trò, ngoại lệ): dòng xem được mà không sửa được hiện chỉ đọc; lưu cả bảng chỉ chạm dòng vừa xem được vừa sửa được.
- **Nguồn:** ADR 0006 mục "Bảng con trong khung phân quyền", "Bổ sung sau review 5.1 lượt 2". Code: `base.repository.ts` (`ChildRepository`, `lock`, `lockMany`, `branchOnly`), `backend/src/platform/data/transaction.ts`, `backend/src/common/http-exception.filter.ts`.

### 3.11 Số chứng từ theo `Id`
- **Áp dụng:** số đơn, kế hoạch, PO nhập tay dạng `DH-<ĐVCS>-000123`, `KH-…`, `PO-…` do `BaseRepository.createNumbered` sinh từ `Id`.
- **Lý do:** không phải đọc dữ liệu của người khác để tìm số kế tiếp, nên người chỉ thấy bản ghi của mình không sinh trùng số.
- **Phải nhớ:** ngoại lệ: số lệnh cấp BTP chạy theo ĐVCS và năm (mục 13.9).
- **Nguồn:** ADR 0006 mục "Phạm vi và dữ liệu". Code: `BaseRepository.createNumbered`.

## 4. Phiên đăng nhập và quản trị quyền

### 4.1 Phiên gắn với token
- **Áp dụng:**
  - Access token mang `sid` (`SysUserSession.Id`); `AuthGuard` kiểm phiên chưa bị thu hồi ở mỗi request, nên thu hồi phiên là token mất hiệu lực ngay.
  - Token tạm sau `login` mang dấu vết mật khẩu `pwh`: đặt lại mật khẩu thì token tạm cũ không chọn ĐVCS được nữa.
  - Refresh token chỉ lưu hash; cookie `httpOnly`, `SameSite=Strict`, path `/api/v1/auth`; mỗi lần dùng thì xoay, có điều kiện theo hash cũ (hai request cùng token chỉ một thắng).
  - `POST /auth/logout` là `@Public`, thu hồi phiên theo cookie: đăng xuất được kể cả khi access token đã hết hạn.
  - Đổi ĐVCS bằng access token thì thu hồi phiên hiện tại rồi tạo phiên mới.
  - `trust proxy` chỉ bật khi khai `TRUST_PROXY`; IP ghi nhật ký phải đúng định dạng IP.
- **Lý do:** đóng các đường vượt quyền: token còn hạn sau khi đăng xuất, máy dùng chung vào thẳng phiên người trước, giả IP qua `X-Forwarded-For`.
- **Phải nhớ:** mỗi request thêm một truy vấn theo khóa chính vào `SysUserSession`.
- **Nguồn:** ADR 0004 mục Phiên. Code: `backend/src/platform/auth/auth.guard.ts`, `auth.service.ts`, `auth.controller.ts`, `backend/src/main.ts`.

### 4.2 Trần quyền quản trị
- **Áp dụng:** người thao tác chỉ cấp, gỡ, quản lý những quyền nhóm `admin.*` mà chính mình đang có. Áp cho: gán vai trò, sửa ma trận quyền, bật tắt xóa vai trò, ngoại lệ, và mọi thao tác trên tài khoản đang giữ quyền quản trị (đặt lại mật khẩu, khóa, gán vai trò hay ĐVCS). Quyền nghiệp vụ (`order.*`, `hr.*`…) không bị giới hạn theo người thao tác.
- **Lý do:** chặn đường vòng "tạo tài khoản phụ rồi gán vai trò cao hơn", hay đặt lại mật khẩu của người quyền cao hơn.
- **Phải nhớ:** người giữ `admin.permission:update` cấp được mọi quyền nghiệp vụ, kể cả cho tài khoản phụ do mình tạo: chỉ giao cho quản trị viên tin cậy. Các thao tác đổi phạm vi dữ liệu ngoài màn Phân quyền cũng đòi `admin.permission:update`: thêm bộ phận tích "Xưởng sản xuất", tích, bỏ tích, đổi ĐVCS, giải thể, khôi phục bộ phận là chuyền may (mục 6.7); thêm nhà máy SX, đổi ĐVCS hay bật tắt nhà máy SX.
- **Nguồn:** ADR 0004 mục "Trần quyền quản trị"; ADR 0010 mục 3; ADR 0013 mục 11; phase 5.10. Code: `PermissionService.assertAdminCeiling`, `backend/src/platform/admin/*.service.ts`, `backend/src/platform/catalog/catalog.service.ts`, `backend/src/modules/hr/department.service.ts`.

### 4.3 Không tự đổi quyền của mình
- **Áp dụng:** ở màn quản trị không ai tự sửa vai trò, ĐVCS, phạm vi, ngoại lệ, chính sách cột theo người, mật khẩu, trạng thái của chính mình; không tắt, cũng không bật lại vai trò mình đang giữ; không sửa ma trận quyền hay chính sách cột của vai trò mình giữ; người có phép gán mang phạm vi chuyền theo một mã (kể cả phép gán hết hạn hay chưa tới hạn) không tự thêm, tích, bỏ tích, đổi ĐVCS, giải thể, khôi phục bộ phận mang mã đó. Vi phạm trả `403 SELF_ELEVATION_FORBIDDEN`.
- **Lý do:** chặn tự nâng quyền ở cả hai chiều.
- **Phải nhớ:** cần ít nhất hai tài khoản giữ quyền phân quyền để sửa được quyền của nhau. Đổi mật khẩu của chính mình hiện chưa có màn.
- **Nguồn:** ADR 0004; ADR 0005 mục L5; ADR 0010 mục 3; ADR 0014; phase 5.10. Code: `admin-users.service.ts`, `admin-access.service.ts`, `admin-grants.service.ts`, `backend/src/modules/hr/department.service.ts`, `PermissionService.holdsLineScope`.

### 4.4 Nhật ký và phiên bản quyền trong cùng transaction
- **Áp dụng:** mọi thay đổi phân quyền ghi `SysAuditLog` và tăng `SysPermissionVersion` trong cùng transaction với thay đổi; ghi nhật ký lỗi thì hủy cả thay đổi. Đăng nhập, đăng xuất, chọn ĐVCS cũng ghi nhật ký. `SysAuditLog`, `SysSensitiveReadLog` chỉ ghi thêm (trigger chặn sửa, xóa).
- **Lý do:** không có thay đổi quyền nào không để lại dấu vết.
- **Phải nhớ:** ngoại lệ duy nhất là đổi tập chuyền may: dữ liệu ở `MES_Hr`, nhật ký và phiên bản ở `MES_Core`, ghi ngay sau commit, lỗi thì báo rõ (mục 6.7).
- **Nguồn:** ADR 0004; ADR 0005 mục "Cache và hiệu lực". Code: `backend/src/platform/audit/audit.service.ts` (`logStrict`), migration `MES_Core/0001_init.sql`, `0002_scope_field_override.sql`.

## 5. Vai trò Toàn quyền

### 5.1 Quyền của vai trò `FULL_ACCESS`
- **Áp dụng:** vai trò hệ thống "Toàn quyền" có mọi hành động nghiệp vụ (Xem, Thêm, Sửa, Xóa, Xuất file) trên mọi tài nguyên, kể cả tài nguyên thêm sau (seed cấp tiếp); quyền `admin.*` đúng bằng của ADMIN theo seed, trừ quyền ADMIN không còn có trong database lúc cấp; mọi cột nhạy cảm Sửa được (cột tính sẵn vẫn không nhập được); không kèm phạm vi.
- **Lý do:** cần một tài khoản vừa phân quyền vừa sửa được dữ liệu nghiệp vụ mà vẫn giữ luật an toàn.
- **Phải nhớ:** quyền quản trị bằng ADMIN để người giữ ADMIN vẫn gán, sửa được vai trò này (mục 4.2). Bớt quyền `admin.*` thì bớt ở cả ADMIN và Toàn quyền. Vai trò hệ thống: không tắt, không xóa được ở màn Vai trò.
- **Nguồn:** ADR 0014 mục "Quyền của vai trò". Code: `backend/scripts/seed-data.ts` (`fullAccessLetters`), `backend/scripts/seed.ts` (`bootstrapFullAccess`).

### 5.2 Tạo và gán
- **Áp dụng:** seed tạo vai trò một lần trong một transaction (vai trò, quyền, chính sách cột, phép gán, nhật ký `SEED`, tăng phiên bản quyền). Máy cài mới: gán cho `admin` cùng ADMIN. Máy đã cài: chỉ gán khi `admin` đang hoạt động và đang giữ ADMIN không kèm phạm vi, còn hiệu lực. Vai trò đã có thì seed không làm lại; riêng `npm run seed -- --sync-matrix` và `npm run reset:demo` gán lại theo mẫu, cùng điều kiện trên.
- **Phải nhớ:** máy đã có vai trò tự tạo trùng mã `FULL_ACCESS` thì seed cảnh báo, không cấp quyền, không gán.
- **Nguồn:** ADR 0014 mục "Tạo và gán". Code: `backend/scripts/seed.ts`.

### 5.3 Luật an toàn giữ nguyên, tách nhiệm vụ còn ở vai trò ADMIN
- **Áp dụng:** Toàn quyền vẫn theo luật chung: `A00` chỉ đọc dữ liệu theo ĐVCS; ghi theo ĐVCS đang làm việc (đơn hàng, PO theo mục 7.2); không tự đổi quyền của mình. Vai trò ADMIN vẫn chỉ xem dữ liệu nghiệp vụ (tách nhiệm vụ); tài khoản `admin` có thêm Toàn quyền nên không còn bị tách nhiệm vụ.
- **Phải nhớ:** tài khoản `admin` rất mạnh: mật khẩu mạnh, ít người dùng chung. Muốn quản trị mà không sửa nghiệp vụ thì chỉ gán ADMIN (tài khoản mẫu `quantri`).
- **Nguồn:** ADR 0014 (thay một phần ADR 0004); ADR 0004 mục "Trần quyền quản trị".

## 6. Đơn vị cơ sở, Nhà máy SX, cây tổ chức

### 6.1 `SysBranch` là Đơn vị cơ sở theo BRAVO
- **Áp dụng:** bảng `SysBranch` và cột `BranchCode` giữ nguyên tên nhưng mang nghĩa Đơn vị cơ sở (ĐVCS). Danh sách lấy theo danh mục chi nhánh BRAVO đã chép (`MES_Sync.bravo.DM_CHINHANH`) bằng `importBravoBranches`: thêm mã còn thiếu, đặt `Name` = `TenChiNhanh`, `Description` = `TenDayDu`, tạo hoặc đổi tên nút gốc của cây tổ chức; không tắt mã vắng trong BRAVO (màn hình đánh dấu). Hàm chạy sau mỗi lần đồng bộ `BRAVO.DM_CHINHANH`, khi bấm "Cập nhật từ BRAVO" (`POST /admin/branches/import`), trong `seed` và `load:bravo`.
- **Lý do:** người dùng được phân quyền theo đơn vị kế toán của BRAVO; đổi tên bảng, cột sẽ chạm mọi bảng, khóa ngầm, nhật ký.
- **Phải nhớ:** tên ĐVCS có trong BRAVO sửa ở BRAVO, MES từ chối đổi (`409`); mã cấm sửa. Ai được vào ĐVCS nào do quản trị MES quyết. Seed chỉ tạo `A01`–`A03` khi có dữ liệu mẫu. Giao diện gọi là "Đơn vị cơ sở" (cột ngắn "ĐVCS"), chiều phạm vi `FACTORY` tên "Đơn vị cơ sở".
- **Nguồn:** ADR 0013 mục 1, 7 (thay nghĩa "nhà máy" của ADR 0002). Code: `backend/src/platform/admin/branch-import.ts`, `admin-branches.service.ts`, `backend/scripts/bravo-branches.ts`.

### 6.2 Danh mục Nhà máy SX
- **Áp dụng:** `SysProductionFactory` ở `MES_Core`; mỗi nhà máy gắn một ĐVCS (`BranchCode`, khóa ngoại tới `SysBranch.Code`, có thể `NULL`, không được là đơn vị tổng hợp). Mã nhà máy là tên theo OSM (`NVARCHAR(100)`, không dấu phẩy, không khoảng trắng đầu cuối), không sửa được; ngừng dùng bằng `IsActive`. Sau mỗi lần chép nguồn `OSM.OSMDataFty`, tên nhà máy chưa có tự thêm vào danh mục (chưa gắn ĐVCS, nhật ký `FACTORY_IMPORT`); nhà máy đã có không bị đổi, tắt.
- **Lý do:** một ĐVCS có nhiều nhà máy sản xuất; nhà máy quyết định đơn hàng nào lập kế hoạch được ở ĐVCS nào.
- **Phải nhớ:** thêm nhà máy, đổi ĐVCS, bật tắt nhà máy là đổi phạm vi dữ liệu: cần thêm `admin.permission:update` và tăng phiên bản quyền. Tên quá 100 ký tự không vào danh mục (ghi log).
- **Nguồn:** ADR 0013 mục 2, 9, 11. Code: `backend/src/platform/catalog/catalog.service.ts`, `factory-list.ts`, migration `MES_Core/0007_production_factory.sql`, `0008_factory_code_osm.sql`.

### 6.3 Nhà máy SX của phiên theo ĐVCS đăng nhập
- **Áp dụng:** `UserAccess.productionFactories` là các nhà máy đang dùng có `BranchCode` bằng ĐVCS của phiên; ở `A00` là mọi nhà máy đã gắn ĐVCS. Không tích nhà máy theo từng người.
- **Lý do:** phân quyền lập kế hoạch theo nhà máy sản xuất thật mà không phải quản lý danh sách nhà máy cho từng người.
- **Phải nhớ:** muốn lập kế hoạch cho nhà máy của ĐVCS khác thì phải được gán ĐVCS đó và đăng nhập vào. Bảng `SysUserProductionFactory` còn trong database nhưng không đọc.
- **Nguồn:** ADR 0013 mục 11 (thay mục 3). Code: `PermissionService.compute`.

### 6.4 Cây tổ chức `SysOrgUnit`: chỉ còn nút ĐVCS
- **Áp dụng:** `SysOrgUnit` chỉ còn dùng nút gốc loại `FACTORY` (`Code` = `BranchCode`, hiển thị là ĐVCS) cho phạm vi chiều `FACTORY` (Đơn vị cơ sở). Nút được tạo khi thêm ĐVCS, chép ĐVCS từ BRAVO và khi seed. Phần Xưởng (`WORKSHOP`), Chuyền (`LINE`) của cây đã thay bằng mục 6.7: không tạo mới, nút cũ ngừng dùng (`IsActive = 0`), không xóa vật lý. Database vẫn giữ các ràng buộc cấp của cây (cột `ParentOrgType`, khóa ngoại ghép `(ParentId, BranchCode, ParentOrgType)` → `(Id, BranchCode, OrgType)`, `CK_SysOrgUnit_Level`, trigger buộc `Path` = `Path` của cha + `Code` + `/`). Mã nút không sửa được.
- **Lý do:** phạm vi theo ĐVCS cần nút gốc; giữ bảng và ràng buộc để không đụng dữ liệu, nhật ký cũ.
- **Phải nhớ:** bảng có trigger nên thêm dòng không dùng `INSERT … OUTPUT` (thêm rồi đọc lại theo mã).
- **Nguồn:** ADR 0010 mục 1, 2 (phần Xưởng, Chuyền thay bằng mục 6.7); ADR 0013 mục 7; phase 5.10. Code: migration `MES_Core/0005_org_workshop.sql`, `0006_org_path_guard.sql`, `0009_line_scope_by_code.sql`, `backend/src/platform/admin/admin-branches.service.ts`, `branch-import.ts`, `backend/scripts/seed.ts`.

### 6.5 Chuyển chuyền, ngừng xưởng
- **Áp dụng:** không còn áp dụng: danh mục Xưởng, Chuyền và thao tác chuyển chuyền giữa xưởng đã bỏ. Ý chính chuyển sang bộ phận chuyền may ở mục 6.7: đổi tập chuyền là đổi phạm vi dữ liệu, đòi thêm `admin.permission:update`, người đang được giao phạm vi không tự làm.
- **Nguồn:** ADR 0010 mục 3, 4.

### 6.6 Đăng nhập một form
- **Áp dụng:** màn đăng nhập chỉ có tên, mật khẩu, "Nhớ tài khoản và mật khẩu". Đúng mật khẩu thì hai ô khóa lại, ô ĐVCS mở ngay dưới, chọn sẵn ĐVCS người đó dùng lần trước trên máy đó, nút đổi thành "Vào làm việc"; chỉ có một ĐVCS thì vào thẳng. Ứng dụng chỉ nhớ tên đăng nhập; mật khẩu do trình duyệt giữ. Đường dẫn cũ `/select-branch` về Trang chủ. API giữ `/auth/login` rồi `/auth/select-branch`.
- **Lý do:** bớt một trang, không lộ dấu vết demo.
- **Nguồn:** ADR 0003 mục cuối; ADR 0013 mục 6. Code: `frontend/src/features/auth/LoginPage.tsx`, `frontend/src/store/auth.ts`, `frontend/src/App.tsx`.

### 6.7 Chuyền may là bộ phận tích "Xưởng sản xuất"
- **Áp dụng:**
  - Bộ phận (`MES_Hr.Department`) có cờ `IsProductionWorkshop`; bộ phận được tích là một chuyền may, bắt buộc có ĐVCS (CHECK ở database). Mã chuyền là mã bộ phận: dữ liệu nghiệp vụ giữ mã (`ShipmentPlanLine.LineCode`, `SewingPrep.LineCode`, khóa ngầm → `MES_Hr.Department.Code`).
  - Nguồn chuyền: module Nhân sự đăng ký `LineSource` (`HrLineSource`) vào `OrgService` lúc khởi động; module Đơn hàng, May chỉ hỏi `OrgService`; nền tảng không import module (lint). Chưa có nguồn đăng ký thì không có chuyền nào; nguồn lỗi thì request cần tập chuyền bị từ chối, không bao giờ thành "không giới hạn chuyền".
  - Ô chọn Chuyền may chỉ liệt kê bộ phận đang tích, chưa giải thể của ĐVCS đăng nhập (`A00`: mọi ĐVCS), gom theo bộ phận cha.
  - Phạm vi chiều `LINE` lưu theo mã bộ phận (chiều giá trị, mục 3.5); chỉ mã đang là chuyền đang dùng có tác dụng. Không còn phạm vi "cả xưởng".
  - Thêm bộ phận tích sẵn, tích, bỏ tích, đổi ĐVCS của bộ phận đang tích, giải thể, khôi phục bộ phận đang tích là đổi phạm vi dữ liệu: đòi thêm `admin.permission:update`; người đang được giao phạm vi chuyền theo đúng mã đó không tự làm (mục 4.3); màn hình báo trước những người sẽ thấy dữ liệu chuyền. Đổi tên, cha, thứ tự của bộ phận không đổi phạm vi.
  - Sau khi lưu ở `MES_Hr`: nhật ký bắt buộc `LINE_SET_CHANGE` (cờ, ĐVCS, còn dùng hay không trước và sau, những người đang được giao phạm vi mã đó) và tăng phiên bản quyền trong một transaction `MES_Core`.
  - Danh mục Chuyền, Xưởng ở Danh mục hệ thống bỏ; cây `SysOrgUnit` chỉ còn nút ĐVCS (mục 6.4).
- **Lý do:** người dùng chốt quản lý chuyền ở danh mục bộ phận, không giữ hai danh mục. Đổi tập chuyền làm đổi dữ liệu Trưởng chuyền thấy mà không qua màn Phân quyền, nên chịu cùng luật như đổi phân quyền.
- **Phải nhớ:**
  - Ngoại lệ của mục 4.4: `MES_Hr` và `MES_Core` không có transaction chung, nên nhật ký và phiên bản quyền ghi ngay sau commit của `MES_Hr` (tăng trước commit thì request chen giữa có thể tính quyền theo tập chuyền cũ rồi giữ trong cache dưới phiên bản mới). Lỗi thì thử lại 3 lần; vẫn lỗi thì ghi log đủ dữ liệu để dựng lại nhật ký, xóa cache quyền của tiến trình đang chạy và trả `500 LINE_SCOPE_UPDATE_FAILED` kèm bộ phận đã lưu. Khi đó tiến trình backend khác vẫn tính quyền theo tập chuyền cũ tới lần tăng phiên bản sau.
  - Thiếu quyền thứ hai trả `SELF_ELEVATION_FORBIDDEN` (qua trần quyền quản trị), không có mã lỗi riêng.
  - Tập chuyền được cache 30 giây theo từng tiến trình. Mỗi khi thấy phiên bản quyền mới, `PermissionService` tải lại tập chuyền trước khi tính quyền. Ô chọn chuyền của tiến trình khác thấy thay đổi sau tối đa 30 giây.
  - Chuyền cũ (`A01-L01`…) không chép sang bộ phận (Q4). Dữ liệu gắn mã chuyền cũ thành mồ côi: còn mã, hiện "<mã> (chuyền cũ)", không có hàng trên bảng dàn chuyền, không xếp việc mới vào được; `check:softkeys` báo. Trưởng chuyền đang được giao chuyền cũ không thấy chuyền nào tới khi được gán lại. Bộ phận tạo sau trùng mã chuyền cũ thì dữ liệu và phạm vi cũ khớp lại.
  - Phạm vi chuyền theo nút cây tổ chức do migration chuyển sang mã: danh sách nút thành mã chuyền, "cả xưởng" trải thành danh sách chuyền đang dùng của xưởng; dòng vốn không có tác dụng thành giá trị `~mã`, không bao giờ khớp mã bộ phận. Chi tiết: [Phân quyền](04-phan-quyen.md).
  - Đổi ĐVCS của chuyền: kế hoạch đã xếp ở ĐVCS cũ còn mã, còn tên (tên tra trên mọi ĐVCS) nhưng không còn hàng trên bảng dàn chuyền, ô chọn của ĐVCS cũ.
- **Nguồn:** phase 5.10 (`docs/phases/phase-5-10-phan-bo-po-chuyen-may.md`, Q3, Q4). Thay phần Xưởng, Chuyền của mục 6.4, 6.5; đổi chiều `LINE` ở mục 3.5; đổi mục 10.2. Code: `backend/src/platform/org/line-source.ts`, `org.service.ts`, `backend/src/modules/hr/hr-line-source.ts`, `department.service.ts`, `backend/src/platform/permission/permission.service.ts` (`grantOf`, `lineCodes`, `holdsLineScope`, `recordLineSetChange`), migration `MES_Hr/0002_department_production_workshop.sql`, `MES_Core/0009_line_scope_by_code.sql`.

### 6.8 Lịch làm việc theo ĐVCS; ngày của dàn chuyền do máy chủ tính
- **Áp dụng:**
  - Danh mục `SysWorkCalendar` (mỗi ĐVCS một dòng: thứ nghỉ hằng tuần, 4 số ngày cộng thêm cho ra chuyền, nhập kho; ban đầu là ngày làm việc, đổi thành ngày lịch ở mục 6.9) và `SysWorkCalendarDay` (ngày nghỉ lễ, Tết, ngày làm bù) ở `MES_Core`. Có cột `BranchCode`, không cho đơn vị tổng hợp, sửa ở Danh mục hệ thống bằng `admin.catalog:update`, không qua `BaseRepository` (như mục 6.2); một người sửa được lịch mọi ĐVCS, đặt một khoảng ngày cho nhiều ĐVCS một lần.
  - ĐVCS chưa có lịch riêng dùng lịch mặc định viết trong code (nghỉ Chủ nhật, cộng thêm 3/3/2/5), không chèn dòng đại diện.
  - Ngày đặc biệt xóa vật lý được: ngoại lệ với quy ước "danh mục không xóa vật lý", vì dòng không có mã, không bảng nào tham chiếu, nhật ký giữ ngày đã xóa.
  - Dòng dàn chuyền: người dùng chỉ nhập chuyền, số lượng, năng suất, ngày bắt đầu vào chuyền. Máy chủ tính số ngày nghỉ, kết thúc vào chuyền, bắt đầu, kết thúc ra chuyền, nhập kho (công thức: mục 6.9, thay cách tính ban đầu "bắt đầu + SX + nghỉ − 1, cộng ngày làm việc") theo lịch của ĐVCS kế hoạch, bỏ qua giá trị client gửi. Giao diện hiện các cột này chỉ đọc, không cho sửa tay (năm cột ngày mở sửa tay ở mục 6.10).
  - Giao diện có bản sao hàm tính để xem trước khi gõ; hai bản chạy chung một bộ ca test có kết quả tính tay.
  - Sửa lịch không tính lại dàn chuyền đã lưu; dòng được tính lại khi người dùng bấm Lưu, popup báo số dòng có ngày khác lịch hiện tại (đổi ở mục 6.10: Lưu giữ ngày đang có, tính lại bằng nút "Tính lại theo công thức").
- **Lý do:** người dùng yêu cầu 13/10/2026 hệ thống tự tính để hạn chế nhập lại; các ĐVCS nghỉ khác nhau, nên khác biệt nằm ở bảng cấu hình (CLAUDE.md mục 6), không rẽ nhánh theo mã ĐVCS. Quản trị giữ danh mục để nhập Tết một lần cho nhiều ĐVCS. Không tự tính lại hàng loạt để dàn chuyền không đổi dưới tay người đang theo dõi.
- **Phải nhớ:**
  - Thay quy tắc tạm "bỏ Chủ nhật, chưa có lịch nghỉ lễ" của module Đơn hàng. Kế hoạch chuẩn bị SX chưa dùng lịch (mục 9.5; bảng chưa khớp code #16).
  - Công thức người dùng gửi ghi "Kết thúc = Bắt đầu + Số ngày SX – Số ngày nghỉ"; người dùng chốt là cộng (Q1 phase 5.12).
  - Cách đếm ngày bắt đầu, đơn vị số ngày cộng thêm: đã đổi ở mục 6.9. Số ngày cộng thêm phải giữ ngày bắt đầu không sau ngày kết thúc (CHECK `CK_SysWorkCalendar_Offsets`).
  - Đổi công thức thì sửa cả `backend/src/platform/catalog/work-calendar.ts` và `frontend/src/lib/workCalendar.ts`, cập nhật bộ ca `backend/test/fixtures/work-calendar-cases.json`.
- **Nguồn:** phase 5.12 (`docs/phases/phase-5-12-lich-lam-viec-dan-chuyen.md`, Q1–Q5 chốt 13/10/2026). Code: `work-calendar.ts`, `catalog.service.ts`, `catalog-lookup.service.ts`, `backend/src/modules/order/line-plan.service.ts`, migration `MES_Core/0011_work_calendar.sql`.

### 6.9 Công thức ngày dàn chuyền theo cách xưởng đang làm (15/10/2026)
- **Áp dụng:**
  - Kết thúc vào chuyền = Bắt đầu vào chuyền + Số ngày SX + Số ngày nghỉ: ngày làm việc thứ Số ngày SX đếm từ **sau** ngày bắt đầu (ngày bắt đầu không tính, kể cả khi là ngày làm việc). Số ngày nghỉ = số ngày nghỉ theo lịch ĐVCS gặp trên đường đếm, kể cả ngày nghỉ chỉ lọt vào khi ngày kết thúc bị đẩy lùi; vẫn tự tính, chỉ đọc.
  - Bắt đầu ra chuyền = Bắt đầu vào chuyền + 3; Kết thúc ra chuyền = Kết thúc vào chuyền + 3; Bắt đầu nhập kho = Bắt đầu ra chuyền + 2; Kết thúc nhập kho = Kết thúc ra chuyền + 5. Cộng **ngày lịch**, không bỏ qua Chủ nhật, ngày lễ; kết quả rơi vào ngày nghỉ vẫn giữ (bắt đầu 15/10/2026 thì bắt đầu ra chuyền 18/10, Chủ nhật). Số ngày vẫn lấy từ cấu hình lịch của ĐVCS (mặc định 3/3/2/5).
- **Lý do:** người dùng báo 15/10/2026 cách tính 13/10 cộng ngày lố so với thực tế xưởng, gửi công thức mới kèm ví dụ; chọn bỏ "− 1" (đúng công thức gửi) và giữ số ngày nghỉ tự tính.
- **Phải nhớ:**
  - Thay hai điểm của mục 6.8: kết thúc không còn "− 1"; ra chuyền, nhập kho không còn cộng ngày làm việc. Bắt đầu ra chuyền tính từ đúng ngày người dùng nhập, không từ ngày làm việc đầu tiên.
  - Cột `OffsetDays` của `SysWorkCalendar` giữ tên, đổi nghĩa thành ngày lịch; comment trong `MES_Core/0011` (đã chạy, không sửa) còn ghi "ngày làm việc".
  - Không đổi dữ liệu đã lưu: dòng dàn chuyền cũ giữ ngày tính theo 6.8; popup Chi tiết dàn chuyền báo dòng có ngày khác công thức, tính lại bằng nút "Tính lại theo công thức" (mục 6.10).
- **Nguồn:** yêu cầu người dùng 15/10/2026. Code: `backend/src/platform/catalog/work-calendar.ts` (`lineDates`), `frontend/src/lib/workCalendar.ts`, bộ ca `backend/test/fixtures/work-calendar-cases.json`.

### 6.10 Năm ngày của dàn chuyền sửa tay được (15/10/2026)
- **Áp dụng:**
  - Kết thúc vào chuyền, Bắt đầu/Kết thúc ra chuyền, Bắt đầu/Kết thúc nhập kho: giao diện điền theo công thức (mục 6.9), người dùng sửa tay từng ô. Sửa Số lượng, Năng suất TB hoặc Bắt đầu vào chuyền thì năm ngày tính lại theo công thức (bỏ ngày sửa tay trước đó). Sửa tay một ngày không kéo theo ngày khác.
  - Máy chủ lưu ngày client gửi; ngày không gửi thì giữ ngày đã lưu nếu dòng cũ không đổi số lượng, năng suất, ngày bắt đầu, còn lại (dòng mới, ô nhập đổi) tính theo công thức (`pickDates`, đọc dòng đã lưu dưới khóa). Kiểm thứ tự ngày (`datesOrderError`), không kiểm ngày có khớp công thức. Số ngày SX, Số ngày nghỉ vẫn do máy chủ tính; Số ngày nghỉ đếm theo lịch tới Kết thúc vào chuyền đã lưu.
  - Kết thúc vào chuyền theo chính sách cột "Ngày kết thúc SX" (`endDate`) của `order.lineplan`; bốn ngày còn lại theo quyền sửa dòng.
- **Lý do:** người dùng yêu cầu 15/10/2026: thực tế xưởng có lúc lệch công thức, người kế hoạch cần chỉnh; thay quyết định "sáu cột tự tính chỉ đọc" (Q3 phase 5.12) của mục 6.8.
- **Phải nhớ:**
  - Không có cờ "đã điều chỉnh tay" trong database: giao diện so ngày đang có với công thức theo lịch hiện tại để đánh dấu ô, nên ngày lưu theo lịch, cách tính cũ cũng hiện là khác công thức. Mở popup không tự tính lại; Lưu gửi đúng ngày đang thấy.
  - Người không sửa được cột Ngày kết thúc SX (không gửi `endDate`), giao diện cũ chưa tải lại (không gửi ngày nào) lưu kế hoạch thì không đè ngày người khác đã chỉnh tay: dòng không đổi ô nhập giữ ngày đã lưu (review 5.12.2 H1). Giao diện của người đó khóa ô, giữ ngày đã lưu, chỉ tính lại khi ô nhập đổi.
  - Lịch đổi sau khi lưu: Lưu lại mà không bấm "Tính lại theo công thức" thì ngày giữ nguyên, chỉ Số ngày nghỉ đếm lại theo lịch mới.
  - Bốn cột ngày chưa có trong danh sách cột của chính sách cột; cần chặn riêng thì thêm cột vào seed (`seed-data.ts`) và kiểm như `endDate`.
- **Nguồn:** yêu cầu người dùng 15/10/2026. Code: `work-calendar.ts` (`offDaysBetween`, `datesOrderError`, bản sao ở `frontend/src/lib/workCalendar.ts`), `order.dto.ts` (`ScheduleLineDto`), `line-plan.service.ts` (`saveLines`), `frontend/src/features/order/scheduleDates.ts` (`settleDates`, `adjustedKeys`), `LinePlanPage.tsx`.

### 6.11 Làm tròn Số ngày SX theo ngưỡng của lịch làm việc ĐVCS (15/10/2026)
- **Áp dụng:**
  - Số ngày SX = Số lượng / Năng suất TB; phần lẻ từ ngưỡng trở lên thì thêm một ngày, dưới thì bỏ; ít nhất 1 ngày. Thay "làm tròn lên" trước đây.
  - Ngưỡng là cấu hình của lịch làm việc mỗi ĐVCS (`SysWorkCalendar.ProductionRoundUpFrom`, `DECIMAL(3,2)`, 0,01–1, MES_Core/0014), sửa ở Danh mục hệ thống › Lịch làm việc cùng số ngày cộng thêm. Mặc định 0,5 (7,3 → 7; 7,5 → 8), kể cả ĐVCS chưa có lịch riêng.
  - Tính bằng số nguyên (phần dư × 100 so với ngưỡng × 100 × năng suất), hai bản `productionDaysOf` ở backend và frontend chạy chung bộ ca `rounding` trong `work-calendar-cases.json`.
- **Lý do:** người dùng yêu cầu 15/10/2026, muốn linh động theo nhà máy như Lịch làm việc. Chọn một ngưỡng thay vì vài kiểu làm tròn cố định: một số bao được làm tròn lên (0,01), làm tròn nửa lên (0,5), bỏ phần lẻ (1) và mức giữa; khác biệt giữa ĐVCS nằm ở bảng cấu hình (CLAUDE.md mục 6).
- **Phải nhớ:**
  - Dòng ít hơn một ngày (ví dụ 100 / 300) vẫn là 1 ngày.
  - Đổi ngưỡng không tính lại dàn chuyền đã lưu (như đổi lịch, mục 6.10). Máy chủ tính lại Số ngày SX mỗi lần lưu dòng; ngày giữ nguyên nếu ô nhập không đổi.
  - Dữ liệu mẫu (`seed-order.ts`, `sim:board`) tính cùng hàm nên số ngày của dòng mẫu đổi sau `reset:demo`, `sim:board`.
- **Nguồn:** yêu cầu người dùng 15/10/2026. Code: `work-calendar.ts` (`productionDaysOf`), `catalog.service.ts`, `catalog.dto.ts`, `line-plan.service.ts`, `frontend/src/lib/workCalendar.ts`, `scheduleDates.ts`, `WorkCalendarPane.tsx`; migration `MES_Core/0014_work_calendar_rounding.sql`.

## 7. Module Đơn hàng

Màn hình, luật nghiệp vụ, bảng, API: [Đơn hàng](06-don-hang.md).

### 7.1 Database và tài nguyên
- **Áp dụng:** database `MES_Order`. Sáu màn ứng với sáu tài nguyên: Thông tin đơn hàng `order.allocation` (`SalesOrder`), Phân bổ PO `order.poallocation` (`PoAllocation`), Kế hoạch xuất hàng `order.shipment` (`ShipmentPlan`), Cập nhật tỷ lệ cắt `order.po` (`SalesOrderPo`), Xếp chuyền `order.lineplan` (`ShipmentPlan`), Phân bổ màu cỡ `order.colorsize` (`ShipmentPlanLine`). Kế hoạch chuẩn bị SX `order.prep` nằm cùng nhóm menu nhưng thuộc module May (mục 9.4).
- **Lý do:** hai tài nguyên dùng chung một bảng là hợp lệ vì Resource Registry kiểm theo tài nguyên → bảng; mỗi tài nguyên có quyền, phạm vi, cột riêng (Xếp chuyền có giá CM, doanh số; Kế hoạch xuất hàng không có).
- **Nguồn:** ADR 0006 mục "Phạm vi và dữ liệu"; ADR 0013 mục 10. Code: `backend/scripts/seed-data.ts` (`resources`), `backend/src/modules/order/order.repositories.ts`.

### 7.2 Đơn hàng, PO dùng chung; ghi theo ĐVCS nguồn
- **Áp dụng:** `order.allocation` và `order.po` có `ScopeType = 'SHARED'`, chỉ còn chiều `OWNER → CreatedBy`. Cột `BranchCode` của `SalesOrder`, `SalesOrderPo` là ĐVCS nguồn (Chi nhánh FOB). Repository khai `originBranch`:
  - đọc không lọc ĐVCS: mọi ĐVCS xem được;
  - tạo mới đóng dấu ĐVCS của phiên; sửa, xóa chỉ dòng của ĐVCS đang làm việc, dòng ĐVCS khác trả 404; `A00` không ghi được;
  - PO còn khai `usedBy` (`ShipmentPlanPo.SalesOrderPoId`): ĐVCS có PO trong kế hoạch xuất hàng của mình cũng sửa, xóa được PO đó (kể cả màu cỡ, xác nhận).
  - `ChildRepository` lọc ĐVCS theo cách của cha: cha dùng chung thì dòng con chép `BranchCode` của cha và chỉ ghi được khi cha ghi được.
- **Lý do:** Thông tin đơn hàng phải lấy hết dữ liệu BRAVO, không lọc ĐVCS; nhưng ĐVCS khác không được đổi Nhà máy SX hay SL gốc mà ĐVCS khác dựa vào. Nhiều đơn may ở nhà máy thuộc ĐVCS khác ĐVCS nhận đơn, nên ĐVCS lập kế hoạch phải sửa được tỷ lệ cắt PO trong kế hoạch của mình.
- **Phải nhớ:** chỉ người làm việc ở ĐVCS nhận đơn mới chọn được Nhà máy SX cho đơn. Hai ĐVCS cùng đưa một PO vào kế hoạch thì cả hai sửa được: từ phase 5.17 mỗi PO chỉ thuộc một kế hoạch (mục 15.2 thay phần này, Tech Lead xác nhận 19/10/2026), nên trường hợp này chỉ còn ở dữ liệu lập trước đó; sửa màu cỡ, xác nhận, hủy xác nhận khóa dòng PO nên phải lần lượt. Ngoại lệ Allow ở `A00` với tài nguyên dùng chung thấy toàn bộ đơn hàng.
- **Nguồn:** ADR 0013 mục 4, 11 (thay phạm vi theo nhà máy của ADR 0006). Code: `BaseRepository` (`originBranch`, `usedBy`, `limit`), `order.repositories.ts` (`SalesOrderRepository`, `SalesOrderPoRepository`).

### 7.3 Kế hoạch xuất hàng theo ĐVCS phiên, Chọn mã hàng theo nhà máy
- **Áp dụng:** kế hoạch xuất hàng, xếp chuyền, phân màu cỡ là tài nguyên theo ĐVCS (`BRANCH`). Popup Chọn mã hàng, PO của đơn, lưới màu cỡ khi lập mới và lệnh tạo kế hoạch chỉ nhận đơn có ít nhất một mã trong `ProductionFactoryCode` thuộc `UserAccess.productionFactories` (mục 6.3); điều kiện do `BaseRepository` dựng (`productionFactoryColumn`, tùy chọn `assignedFactories`, `STRING_SPLIT`). Kế hoạch nối đơn hàng, PO theo `Id` (không theo `BranchCode`), nên lập được kế hoạch cho đơn của ĐVCS khác.
- **Lý do:** ĐVCS lập kế hoạch cho nhà máy của mình, dù đơn do ĐVCS khác nhận.
- **Phải nhớ:** đơn chưa có Nhà máy SX, hoặc chỉ có nhà máy chưa gắn ĐVCS, không hiện ở ĐVCS nào. SL đã lập của một đơn cộng kế hoạch ở mọi ĐVCS. Lệnh tạo đọc lại đơn sau khi khóa. Sửa kế hoạch đã lập không đòi nhà máy còn thuộc ĐVCS.
- **Nguồn:** ADR 0013 mục 5, 11. Code: `BaseRepository.assigned`, `backend/src/modules/order/shipment.service.ts`, migration `MES_Order/0005_shared_sales_order.sql`.

### 7.4 Cập nhật tỷ lệ cắt theo kế hoạch của ĐVCS
- **Áp dụng:** danh sách mã hàng, lưới PO, popup lọc và file xuất của màn chỉ có PO nằm trong kế hoạch xuất hàng của ĐVCS đăng nhập, cộng PO nhập tay ở ĐVCS đó (`CreatedBy` có giá trị); `A00` thấy PO trong kế hoạch của mọi ĐVCS cộng mọi PO nhập tay. Điều kiện dựng bằng `BaseRepository.inUseHere`. Thêm PO tay chỉ cho mã hàng đang có PO trên màn ở ĐVCS này; PO mới mang ĐVCS của phiên; PO nối đơn hàng theo `Id`.
- **Lý do:** mỗi ĐVCS chỉ làm việc với PO mình đã lên kế hoạch.
- **Phải nhớ:** đây là lọc của màn, không phải phân quyền: PO vẫn đọc được ở màn khác. PO BRAVO chưa vào kế hoạch nào không hiện ở màn này. Danh sách mã hàng một dòng mỗi đơn, cột Chi nhánh đọc `SalesOrder.BranchCode` bằng truy vấn con (ngoại lệ có chủ đích).
- **Nguồn:** ADR 0013 mục 11. Code: `BaseRepository.inUseHere`, `backend/src/modules/order/cut-ratio.service.ts`, migration `MES_Order/0008_po_used_by_plan_branch.sql`.

### 7.5 Bản chụp dữ liệu, ngoại lệ đặt tên
- **Áp dụng:** PO và kế hoạch chép khách hàng, mã hàng, tên sản phẩm (kế hoạch chép cả giá CM) lúc tạo; `OriginalQty` của kế hoạch là SL gốc tại lúc lập. `ShipmentPlan.PoBuyDate` là chuỗi tham chiếu "PO/Buy date" (ví dụ `4500123 / 15-11`), không phải ngày dù có đuôi `…Date`.
- **Lý do:** màn của một tài nguyên không phải đọc bảng của tài nguyên khác, nên người chỉ có quyền Xếp chuyền vẫn thấy khách hàng, mã hàng; sửa tỷ lệ cắt sau đó không đổi kế hoạch đã lập.
- **Nguồn:** ADR 0006 mục "Phạm vi và dữ liệu". Code: migration `MES_Order/0001_order_init.sql`, `shipment.service.ts`.

### 7.6 Nhà máy SX theo OSM
- **Áp dụng:** `SalesOrder.ProductionFactoryCode NVARCHAR(400)` là danh sách mã nhà máy dạng chuẩn (cách nhau dấu phẩy, bỏ trùng); `IsFactoryFromOsm = 1` khi lấy theo OSM. `OsmFactoryService` chạy sau mỗi đợt đồng bộ có chép nguồn OSM hoặc sản phẩm BRAVO, và lúc khởi động: đơn có trong OSM nhận danh sách theo OSM và khóa sửa tay (máy chủ từ chối đổi, `409`); đơn trước theo OSM mà nay không còn thì mở khóa, giữ giá trị; đơn chưa có trong OSM giữ nhà máy người dùng chọn. Ghép theo `bravo.DM_SanPhamDonHang.Code = osm.OSMDataFty.SO` và `StyleName = StyleNo`.
- **Lý do:** OSM là nơi phân bổ nhà máy thật; một đơn có thể may ở nhiều nhà máy.
- **Phải nhớ:** bật tắt bằng `OSM_FACTORY_UPDATE` (mặc định bật, test tắt); chạy cả khi nạp đơn hàng tự động tắt. Danh sách dài quá 400 ký tự không ghi vào đơn. Chưa đồng bộ OSM thì không làm gì. Máy demo chưa có OSM: `load:bravo` giữ giả định nhà máy cùng mã chi nhánh nhận đơn.
- **Nguồn:** ADR 0013 mục 9. Code: `backend/src/modules/order/osm-factory.service.ts`, `backend/src/platform/catalog/factory-list.ts`, migration `MES_Order/0007_factory_osm_po_number.sql`.

### 7.7 Nạp tăng dần đơn hàng BRAVO
- **Áp dụng:** backend tự nạp đơn hàng, PO, màu cỡ từ bảng chép BRAVO vào `MES_Order` một lần sau mỗi đợt đồng bộ có nguồn liên quan chép thành công, và một lần lúc khởi động. Đọc qua `SourceFeedService` (không import lớp đồng bộ); phần so khác là hàm thuần dùng chung với `load:bravo` (`bravo-order.mapping.ts`); phần ghi là việc của hệ thống, không theo phiên, ghi mọi ĐVCS.
  - Biết BRAVO có đổi đơn hay không theo dấu nội dung `SalesOrder.SourceHash` (SHA-256 của dữ liệu BRAVO chưa ánh xạ), không theo mốc chép.
  - Dấu khác thì các cột lấy từ BRAVO theo BRAVO; dấu giống thì giữ phần người dùng sửa. Nhà máy SX, đơn giá, giá CM, số đơn, ĐVCS, trạng thái là của MES (trạng thái chỉ đổi Mới → Hoàn thành khi BRAVO đóng lệnh).
  - Màu cỡ PO chỉ thay khi PO chưa xác nhận, chưa vào kế hoạch, người dùng chưa sửa. Không xóa gì.
  - Một transaction có khóa ứng dụng `MES_Order.BravoImport` (dùng chung với `load:bravo`), mỗi câu ghi `SET DEADLOCK_PRIORITY LOW` để khóa chéo thì SQL Server hủy bước nạp chứ không hủy thao tác người dùng; tự thử lại sau 2 rồi 10 giây. Nhật ký `BRAVO_IMPORT` (người `system`).
- **Lý do:** đơn mới từ BRAVO tự vào mà không mất kế hoạch đã lập; `load:bravo` xóa hết rồi nạp lại nên chỉ dùng cho máy demo.
- **Phải nhớ:** bật tắt bằng `BRAVO_ORDER_IMPORT`; để trống thì bật trên máy dùng thật (không dữ liệu mẫu), tắt trên máy demo; test luôn tắt. Ánh xạ đang là giả định tạm chờ BA; đơn, PO bị xóa ở BRAVO chưa xử lý (chỉ đếm trong log).
- **Nguồn:** ADR 0013 mục 8, 11 (L4). Code: `backend/src/modules/order/bravo-order-import.service.ts`, `bravo-order-import.repository.ts`, `bravo-order.mapping.ts`, `backend/src/platform/sync/bravo-order-source.ts`, `backend/src/config/env.ts`.

### 7.8 Phân bổ PO theo OSM
- **Áp dụng:** màn Phân bổ PO hiện view OSM `v_OSMData` đã chép vào `MES_Sync.osm.OSMData` (không đọc thẳng OSM mỗi lần mở màn), qua bảng làm việc `MES_Order.PoAllocation` (mục 7.9): 11 cột của view, cộng ĐVCS suy từ Nhà máy SX theo danh mục và dấu nhập tay. Tài nguyên `order.poallocation` dùng chung, đọc qua `BaseRepository`. Mỗi dòng khác nhau của view là một dòng (dòng trùng nguyên dòng tính một lần); mặc định ETD-Revised mới nhất lên trước, 100 dòng mỗi trang; xuất file tối đa 50.000 dòng.
- **Lý do:** view OSM chậm và nằm ở máy khác; chép một lần rồi đọc trong MES.
- **Phải nhớ:** các cột suy ra từ Nhà máy SX (ĐVCS, nhà máy theo OSM, dấu nhập tay, dấu còn trong OSM) lấy mức chặt hơn giữa chính sách cột của chúng và của Nhà máy SX (Nhà máy SX bị Ẩn thì không có; bị Che thì cũng che). Cột mặc định để sắp xếp bị Ẩn/Che thì dùng cột kế tiếp xem được. Chưa có lịch tự chép: màn hiện thời điểm chép OSM của dữ liệu đang có.
- **Nguồn:** ADR 0013 mục 10; ADR 0011 mục 3 (ngoại lệ); phase 5.10. Code: `backend/src/modules/order/po-allocation.service.ts`, `po-allocation.repository.ts`.

### 7.9 Phân bổ PO có bảng làm việc, Nhà máy SX nhập tay
- **Áp dụng:**
  - `MES_Order.PoAllocation` là bản làm việc của MES: mỗi dòng khác nhau của `v_OSMData` một dòng, nhận diện bằng `RowHash` (SHA-256 của 11 cột). Bước làm mới chạy sau mỗi đợt đồng bộ có nguồn `OSM.OSMData` và lúc khởi động, đọc nguồn qua `SourceFeedService`, chỉ ghi dòng đổi; trạng thái lần làm mới gần nhất ở bảng một dòng `PoAllocationRefresh`.
  - Nhà máy SX sửa tay được (`order.poallocation:update`), gắn theo khóa SO + PO + Style No + Màu: một lần sửa áp cho mọi dòng cùng khóa, dòng mang dấu `IsFactoryManual`. Đồng bộ lại thì nhà máy nhập tay giữ nguyên, cột khác theo OSM; dòng mới OSM thêm vào khóa đã nhập tay cũng nhận nhà máy nhập tay, kể cả khi OSM phân nó cho nhà máy của ĐVCS khác. "Theo OSM" bỏ dấu nhập tay.
  - Một lần sửa chỉ được ghi khi mọi dòng bị áp có Nhà máy SX hiện hành thuộc nhà máy đang dùng của ĐVCS đăng nhập, hoặc chưa có nhà máy, hoặc nhà máy chưa gắn ĐVCS, chưa có trong danh mục; không thì `403 FACTORY_OF_OTHER_BRANCH`, không dòng nào đổi. Nhà máy mới chọn của ĐVCS nào cũng được. `A00` không sửa. Điều kiện do `BaseRepository` dựng (tùy chọn `factoryBranchWrite`), không viết trong service.
  - Khóa nhập tay vắng khỏi OSM: giữ dòng nhập tay, đánh dấu không còn trong OSM (`IsInOsm = 0`). Dòng không nhập tay vắng khỏi OSM thì xóa.
  - Chốt nguồn: bảng chép rỗng thì bỏ qua cả lần làm mới. Nguồn ít hơn mốc quá `PO_ALLOCATION_MAX_SHRINK_PERCENT` (mặc định 20%) thì vẫn thêm, sửa, chỉ bỏ bước xóa (giữ dòng vắng, không đánh dấu). Mốc là số dòng nguồn của lần làm mới đủ gần nhất (`PoAllocationRefresh.BaselineRows`), chỉ lần làm đủ mới đổi mốc; chưa có thì dùng số dòng đang có trong OSM của bảng. Cả hai ghi nhật ký và màn cảnh báo.
- **Lý do:** bảng chép OSM chép lại toàn bộ mỗi lần đồng bộ, có dòng trùng nguyên dòng, không có khóa dòng ổn định, nên không gắn được dấu nhập tay. Khóa nhập tay SO + PO + Style No + Màu do người dùng chốt; một khóa có thể có nhiều dòng OSM (khác ETD, khác nhà máy), nên một lần sửa áp cho cả khóa. Luật ĐVCS theo tinh thần mục 7.2: ĐVCS khác không đổi dữ liệu mà ĐVCS khác dựa vào. Chốt giảm nguồn chỉ bỏ bước xóa để bảng vẫn nhận dòng mới, dòng đổi khi chốt bật.
- **Phải nhớ:**
  - Không lan sang Nhà máy SX của đơn hàng (mục 7.6 giữ nguyên): hai nguồn OSM độc lập (`vOSMDataFty` cho đơn, `v_OSMData` cho Phân bổ PO).
  - OSM chia một khóa cho nhiều nhà máy thì nhập tay gộp cả khóa về một nhà máy; màn báo trước số dòng bị áp.
  - Khóa đã nhập tay về nhà máy của ĐVCS A, OSM thêm vào khóa đó một dòng phân cho nhà máy của ĐVCS B: dòng mới theo nhà máy của A; B muốn đổi thì nhờ A.
  - Tên nhà máy của `v_OSMData` không tự vào danh mục Nhà máy SX (chỉ tên của `vOSMDataFty` tự thêm, mục 6.2). Nhà máy chưa có trong danh mục được coi như chưa gắn ĐVCS: ĐVCS nào cũng đổi được dòng đó. Bước làm mới đếm, ghi log và nhật ký các tên này. Cũng vì vậy `PoAllocation.ProductionFactoryCode` không khai khóa ngầm.
  - Nhà máy của chính ĐVCS mà đã ngừng dùng bị coi như nhà máy của ĐVCS khác (đóng an toàn).
  - OSM thật sự bớt nhiều PO thì quản trị cho qua chốt bằng cấu hình (đặt ngưỡng 100, khởi động lại backend, đồng bộ lại): [Vận hành](11-van-hanh.md).
  - Lần ghi của người dùng và bước làm mới nối tiếp nhau bằng khóa ứng dụng `MES_Order.PoAllocation`; làm mới đang chạy lâu thì lần ghi nhận `409`.
- **Nguồn:** phase 5.10 (`docs/phases/phase-5-10-phan-bo-po-chuyen-may.md`, Q1, Q2, Q5, Q6). Code: `backend/src/modules/order/po-allocation.repository.ts`, `po-allocation-refresh.service.ts`, `po-allocation.service.ts`, `backend/src/platform/data/base.repository.ts` (`factoryBranchWrite`), migration `MES_Order/0009`, `MES_Core/0010`.

### 7.10 Phân bổ màu cỡ theo kế hoạch, kiểm theo màu cỡ và theo chuyền
- **Áp dụng:** màn Phân bổ màu cỡ có một dòng mỗi kế hoạch xuất hàng đã xếp chuyền; popup chia màu cỡ của kế hoạch (SL KHXH) cho các dòng dàn chuyền của kế hoạch. Phần giao lưu ở `ShipmentPlanLineColorSize` (dòng dàn chuyền, màu, cỡ, SL giao > 0), không thêm bảng. Luật, máy chủ cưỡng chế và giao diện kiểm trước:
  - tổng giao của một màu cỡ trên mọi chuyền không vượt SL KHXH của màu cỡ;
  - tổng giao của một chuyền không vượt SL đã xếp cho chuyền đó ở Xếp chuyền;
  - một chuyền một màu cỡ một dòng.
  Lưu dàn chuyền không còn đề xuất phân màu cỡ theo tỷ lệ. Xếp chuyền không giảm SL của chuyền, Kế hoạch xuất hàng không giảm SL KHXH của màu cỡ xuống dưới phần đã giao (409; chỉ xét khi đang giảm, nên dữ liệu cũ lệch không khóa các lần sửa khác); bỏ dòng dàn chuyền thì xóa phần giao của nó, đổi chuyền thì phần giao đi theo dòng.
- **Lý do:** người dùng yêu cầu 14/10/2026: số lượng mỗi chuyền chốt ở Xếp chuyền, chi tiết màu cỡ từng chuyền nhập ở Phân bổ màu cỡ, một màu cỡ tách được cho nhiều chuyền. Gom theo kế hoạch, không theo mã hàng, vì SL kế hoạch theo màu cỡ và dòng dàn chuyền đều thuộc một kế hoạch (người dùng chốt Q1). Giữ phần giao theo dòng dàn chuyền để trạng thái chuyền, dữ liệu cũ và module May vẫn theo dòng.
- **Phải nhớ:**
  - Tài nguyên `order.colorsize` vẫn có bảng nguồn `ShipmentPlanLine` và chiều `LINE`: danh sách gom các dòng trong phạm vi (như danh sách mã hàng của Tỷ lệ cắt). Trưởng chuyền chỉ thấy, sửa chuyền mình; phần của chuyền khác chỉ đọc dạng tổng.
  - Màu cỡ vượt chỉ chặn khi người lưu có giao ở màu cỡ đó: dữ liệu cũ lệch của chuyền khác không chặn việc lưu phần của mình.
  - Trạng thái của kế hoạch ở màn (`PLANNED`, `PARTIAL`, `FULL`: Chưa phân màu cỡ, Phân một phần, Đã phân đủ) tính lúc đọc; trạng thái dòng dàn chuyền (`ALLOCATED`: Đã phân màu cỡ) vẫn lưu.
  - Dòng giao 0 của cách làm cũ còn trong bảng: bỏ qua khi đọc, xóa khi lưu lại chuyền đó; không cần migration.
  - Cột NSBQ chuyền của danh sách là trung bình cộng NSBQ các dòng dàn chuyền trong phạm vi xem, làm tròn sản phẩm, máy chủ tính trong câu gom nên lọc, sắp xếp được (người dùng yêu cầu 16/10/2026, thay Q3 "liệt kê từng chuyền"). Trung bình theo chuyền, không theo SL đã xếp.
- **Nguồn:** phase 5.13 (`docs/phases/phase-5-13-phan-bo-mau-co-theo-ke-hoach.md`, Q1–Q4). Code: `backend/src/modules/order/color-size.service.ts`, `order.repositories.ts` (`LineAllocationRepository`), `line-plan.service.ts`, `shipment.service.ts`, `frontend/src/features/order/ColorSizePage.tsx`, `colorSizeRules.ts`.

## 8. Đồng bộ dữ liệu từ hệ thống ngoài

Cơ chế, bảng, màn hình: [Đồng bộ](09-dong-bo.md).

### 8.1 Chỉ đọc view, chép vào `MES_Sync`
- **Áp dụng:** MES không đọc database BRAVO thật; chỉ đọc view của database trung gian (`DB_TRUNGGIAN_NAME`) và view OSM (`DB_OSM_NAME`, `DB_OSM_APP_NAME`), qua synonym `<schema>.src_<Bảng>` mà `npm run migrate` tạo lại theo `.env` (có thể qua linked server: `DB_TRUNGGIAN_SERVER`, `DB_OSM_SERVER`, `DB_OSM_APP_SERVER`). Dữ liệu chép vào `MES_Sync`, schema theo hệ thống nguồn (`bravo`, `osm`); tên bảng là tên view bỏ chữ `v` đầu, **giữ nguyên tên cột của view**, thêm `SyncedAt`, `SyncRunId`. `dbo.SyncSource` giữ danh mục nguồn và mốc; `dbo.SyncRun` giữ từng lần chạy.
- **Lý do:** phía BRAVO chỉ cho đọc qua database trung gian; giữ tên cột nguồn để đối chiếu.
- **Phải nhớ:** `MES_Sync` là dữ liệu hệ thống dùng chung, không theo ĐVCS, không qua `BaseRepository`. Module nghiệp vụ không đọc `MES_Sync` trực tiếp (mục 1.2). Tên bảng chép, tên biến `DB_TRUNGGIAN_NAME` là ngoại lệ có chủ đích với quy ước đặt tên. Database nguồn khai ở một chỗ: `backend/scripts/source-databases.ts`; máy không khai database OSM thì migrate tắt các nguồn OSM.
- **Nguồn:** ADR 0007 mục "Nơi lưu", "Đọc nguồn"; ADR 0013 mục 9, 10. Code: `backend/scripts/migrate.ts` (`linkSyncSources`), `backend/scripts/source-databases.ts`.

### 8.2 Chép tăng dần theo mốc
- **Áp dụng:** mỗi nguồn có mốc `WatermarkAt` = `ModifiedAt`/`CreatedAt` lớn nhất đã nhận, theo giờ của nguồn. Lần chạy tăng dần gọi `usp_Sync_<Bảng> @SinceAt = mốc − OverlapMinutes` (mặc định 10 phút). Mốc mới không lùi, không vượt giờ máy chủ; lỗi thì giữ mốc cũ. View không có cột thời gian dùng được chép toàn bộ mỗi lần. Mỗi lần tăng dần còn đối soát khóa với cả view (thêm dòng bị sót, xóa dòng không còn). "Chép lại toàn bộ" là nút riêng có xác nhận.
- **Lý do:** không đổ cả bảng mỗi lần; lùi mốc để không sót dòng ghi trễ hay làm tròn giờ.
- **Phải nhớ:** chốt xóa hàng loạt: định xóa quá 20% bảng chép và quá 100 dòng thì dừng, yêu cầu chép lại toàn bộ. Nguồn trả 0 dòng khi bảng chép đang có dữ liệu thì dừng. Giới hạn đã biết (cần chép lại toàn bộ định kỳ): cột lấy từ bảng khác trong view đổi mà `ModifiedAt` không đổi; dòng không có ngày tháng bị sửa nội dung; dòng rời nhóm và dòng khác vào cùng nhóm; giờ máy trạm BRAVO lệch quá `OverlapMinutes`.
- **Nguồn:** ADR 0007 mục "Chép tăng dần". Code: migration `MES_Sync/0001_sync_core.sql`, `0004_sync_guard_keys_mass_delete.sql`.

### 8.3 Khớp dòng
- **Áp dụng:** nguồn có khóa tin được (KEY) thì cập nhật dòng có cột khác, thêm dòng mới; khóa trùng hoặc thiếu thì dừng, không ghi. View tổng hợp không có khóa (PARTITION) thì nhóm nào đổi hoặc lệch số dòng thì xóa cả nhóm cũ, chèn nhóm mới. So "dòng có đổi" theo byte (`EXCEPT` trên giá trị nhị phân), bảng chép giữ collation của cột nguồn.
- **Lý do:** collation không phân biệt hoa thường sẽ bỏ sót "Nike" → "NIKE"; giữ collation nguồn để không vỡ ký tự `VARCHAR`.
- **Nguồn:** ADR 0007 mục "Khớp dòng". Code: `backend/scripts/sync-gen.ts`.

### 8.4 Chạy và kiểm soát
- **Áp dụng:** màn Quản trị › Đồng bộ dữ liệu (`admin.sync`: Xem để theo dõi, Sửa để bấm chạy). Bấm thì xếp hàng mỗi nguồn một `SyncRun` rồi trả về ngay; backend chạy lần lượt trong nền. Mỗi nguồn tối đa một lần đang chờ hoặc đang chạy (chỉ mục duy nhất có lọc). `usp_SyncRun_Execute` giữ khóa ứng dụng theo nguồn suốt lần chạy; `usp_SyncRun_RecoverStale` (lúc khởi động và trước mỗi lần bấm) đánh lỗi lần chạy mồ côi. Mỗi lần chép chạy trên kết nối riêng, tối đa 60 phút, dữ liệu chép trong một transaction. Mỗi lần bấm ghi `SysAuditLog` `SYNC_START`.
- **Lý do:** bấm hai lần không chép chồng; tiến trình chết giữa chừng không để trạng thái nửa vời.
- **Phải nhớ:** chưa có lịch tự chạy; khi cần thì dùng chung `usp_SyncRun_Execute`. Việc chạy sau đồng bộ (chép ĐVCS, cập nhật Nhà máy SX, nạp đơn hàng, làm mới Phân bổ PO) đăng ký qua `SyncService.onSucceeded`, `onQueueDrained`.
- **Nguồn:** ADR 0007 mục "Chạy và kiểm soát"; ADR 0013 mục 1, 8, 9. Code: `backend/src/platform/sync/sync.service.ts`, `sync.db.ts`, `sync.controller.ts`.

### 8.5 Cấu trúc bảng chép sinh từ view thật
- **Áp dụng:** bảng chép và thủ tục chép sinh từ cấu trúc view thật bằng `backend/scripts/sync-gen.ts`; thêm nguồn là thêm cấu hình rồi sinh migration mới, không viết tay.
- **Nguồn:** ADR 0007 mục "Đọc nguồn"; ADR 0013 mục 9, 10. Code: `backend/scripts/sync-gen.ts`.

### 8.6 Chiều ra: hệ thống khác lấy dữ liệu MES qua API (21/10/2026)
- **Áp dụng:** dữ liệu MES đưa ra hệ thống khác bằng API của chính MES (`GET`, JSON), mỗi nhu cầu một endpoint ở module sở hữu dữ liệu. Quyền là `<tài nguyên>:export` (dữ liệu ra khỏi MES như xuất file; vẫn cần `:view`, mục 3.8). Dữ liệu đọc qua `BaseRepository` và trả qua chính sách cột như màn. Bên gọi đăng nhập bằng tài khoản MES (`/auth/login` → `/auth/select-branch` → `accessToken`), dùng vai trò có sẵn có quyền đó; không thêm cơ chế xác thực riêng (API key), không tạo vai trò riêng. Lấy tăng dần theo `from`/`to` trên lúc đổi của dòng; `to` không muộn hơn lúc gọi trừ 1 phút; dòng rời trạng thái trả Id ở `removedIds`; dòng bị xóa đối chiếu bằng danh sách Id. Chạy HTTP trong mạng nội bộ. API đầu tiên: `GET /order/color-size/sync`, `/sync/ids` (dòng dàn chuyền Đã phân màu cỡ, [Đơn hàng](06-don-hang.md)).
- **Lý do:** cần gấp trong khi linked server tới database trung gian đang gặp sự cố; API giữ đủ 5 lớp phân quyền, không phải cấp quyền đọc bảng MES cho tài khoản database bên ngoài; về sau còn nhiều trường hợp đẩy dữ liệu ra ngoài.
- **Phải nhớ:** API đẩy ra mới dùng lại cùng khuôn (tham số, `removedIds`, danh sách Id, mã lỗi) và có hướng dẫn cho bên gọi ở `docs/tich-hop/`. Mọi vai trò có quyền xuất của tài nguyên (Giám đốc, Kế hoạch, Kế toán, Toàn quyền ở `order.colorsize`) đều gọi được API; muốn tách quyền gọi API khỏi quyền xuất file thì cần tài nguyên riêng. HTTP: mật khẩu, token, dữ liệu đi dạng rõ trong mạng nội bộ (người dùng chấp nhận). Database `DB_TRUNGGIAN` với view `vMES_XepChuyen_DaPhanMauCo` trên SQL Server máy chủ giữ nguyên cho hướng linked server về sau; view đó đọc thẳng bảng MES, nằm ngoài migration và ngoài lớp phân quyền. Chưa có: phân trang (quá 10.000 dòng thì 422), chỉ mục theo lúc đổi, báo dòng xóa tức thì (cần bảng ghi dòng xóa).
- **Nguồn:** người dùng 20–21/10/2026 (Q53); review [t18-api-dong-bo-dan-chuyen.md](../review/t18-api-dong-bo-dan-chuyen.md). Code: `backend/src/modules/order/color-size.service.ts` (`sync`, `syncIds`), `order.repositories.ts` (`changedLines`, `allocatedIds`). Hướng dẫn cho bên gọi: [docs/tich-hop/api-dong-bo-dan-chuyen.md](../tich-hop/api-dong-bo-dan-chuyen.md).

## 9. Module May

Màn hình, bảng, API: [May](07-may.md).

### 9.1 Database `MES_Sewing`, bản chép dòng dàn chuyền
- **Áp dụng:** Kế hoạch chuẩn bị SX lưu ở `MES_Sewing`. Mỗi dòng dàn chuyền (`MES_Order.ShipmentPlanLine`) có một dòng `SewingPrep` chép mã hàng, chuyền, số lượng, ngày vào chuyền, `BranchCode`, `LineCode`; lọc ĐVCS, chuyền (`order.prep`: `FACTORY → BranchCode`, `LINE → LineCode`), phân trang, lọc trạng thái chạy trong `MES_Sewing` qua `BaseRepository`.
- **Lý do:** đúng "mỗi module một database"; phân quyền, sắp xếp, lọc trạng thái chạy được trong SQL thay vì ghép dữ liệu hai database trong ứng dụng. Đã cân nhắc và không chọn (ADR 0009): lưu ở `MES_Order` (lệch quy ước mỗi module một database); không chép mà ghép dữ liệu trong ứng dụng (không phân trang, lọc, phân quyền trong SQL được); đồng bộ bằng sự kiện khi lưu Xếp chuyền (module Đơn hàng phải biết module May, chưa có hạ tầng sự kiện); lưu sẵn ngày KH (phải tính lại mọi dòng khi đổi danh mục hay ngày vào chuyền).
- **Phải nhớ:** `order.prep` không gắn chiều Người tạo (dòng do hệ thống chép), nên vai trò "Chỉ của mình" vẫn thấy theo ĐVCS, chuyền.
- **Nguồn:** ADR 0009 mục 1, 2 và Hệ quả. Code: `backend/src/modules/sewing/sewing.repositories.ts`.

### 9.2 Chép qua `ScheduleFeed` khi mở màn
- **Áp dụng:** mỗi lần mở màn hoặc xuất file, module May chép lại theo ĐVCS của phiên (`A00`: mọi ĐVCS) khi "dấu phiên bản" của dàn chuyền (số dòng + `BINARY_CHECKSUM` các cột được chép) đổi, hoặc số dòng bản chép lệch nguồn. Bước chép là việc của hệ thống, không theo quyền người xem; một lần chép tại một thời điểm (`sp_getapplock`). Dòng nguồn nhận diện bằng `Id` + ĐVCS + kế hoạch + thời điểm tạo (`SourceCreatedAt`, dung sai 5 ms).
- **Lý do:** đơn giản và luôn đúng; Đơn hàng không phải biết May (không phụ thuộc ngược), chưa có hạ tầng sự kiện.
- **Phải nhớ:** nguồn rỗng mà bản chép còn dòng thì không xóa gì; chép lỗi thì vẫn trả bản chép hiện có, ghi log. Dòng dàn chuyền bị bỏ thì dòng chuẩn bị và ngày đã nhập bị xóa ở lần mở màn sau (log cảnh báo kèm Id). `reset:demo`, `load:bravo` xóa bản chép trước khi nạp. Dấu đã chép giữ trong bộ nhớ tiến trình.
- **Nguồn:** ADR 0009 mục 3 và Hệ quả. Code: `backend/src/modules/order/schedule-feed.service.ts`, `sewing.repositories.ts` (`SewingPrepRepository`).

### 9.3 Danh mục bước `PrepStep`
- **Áp dụng:** danh mục bước chuẩn bị dùng chung toàn công ty, ở `MES_Sewing`; không xóa vật lý, mã bất biến (trigger); quản lý ở Quản trị › Danh mục hệ thống với quyền `admin.catalog:*`. Ngày theo bước (`SewingPrepStep`) lưu số ngày KH chỉnh riêng (`NULL`: theo danh mục) và ngày thực hiện; khóa ngoại ghép `(SewingPrepId, BranchCode)`, xóa theo dòng cha.
- **Nguồn:** ADR 0009 mục 4, 5. Code: migration `MES_Sewing/0001_sewing_prep.sql`, `backend/src/modules/sewing/prep-step.service.ts`.

### 9.4 Màn nằm ở nhóm Quản trị đơn hàng
- **Áp dụng:** tài nguyên `order.prep`, đường dẫn màn `/order/prep` (menu gom nhóm theo tiền tố mã tài nguyên); code và database vẫn thuộc module May (`modules/sewing`, `MES_Sewing`), API `/api/v1/sewing/prep`. Đường dẫn cũ `/sewing/prep` tự chuyển sang `/order/prep`.
- **Nguồn:** ADR 0009 mục 6 và Hệ quả. Code: migration `MES_Core/0004_move_prep_to_order.sql`, `frontend/src/routes/FallbackRoute.tsx`.

### 9.5 KH và trạng thái tính lúc đọc
- **Áp dụng:** ngày KH = Ngày vào chuyền − số ngày KH; trạng thái và lọc theo trạng thái tính trong SQL lúc đọc, không lưu sẵn.
- **Lý do:** đổi danh mục hay ngày vào chuyền thì KH đổi theo ngay, không phải tính lại mọi dòng.
- **Phải nhớ:** chưa trừ ngày nghỉ, ngày lễ; chưa tự lấy ngày TH từ module khác; chưa phân quyền nhập TH theo bộ phận.
- **Nguồn:** ADR 0009 mục 7 và Hệ quả. Code: `sewing.repositories.ts`, `backend/src/modules/sewing/prep.service.ts`.

## 10. Module Nhân sự

Màn hình, bảng, API: [Nhân sự](08-nhan-su.md).

### 10.1 MES tự quản dữ liệu nhân sự trong `MES_Hr`
- **Áp dụng:** thêm, sửa, nhập hàng loạt nhân sự ngay trong MES; database riêng `MES_Hr` gồm `DepartmentType`, `Department`, `JobTitle`, `Employee`.
- **Lý do:** có màn chạy được trước khi BA trả lời; khác tổng quan dự án (ghi hệ thống Nhân sự đã có) là ngoại lệ đã chốt.
- **Phải nhớ:** nếu sau này lấy từ hệ thống Nhân sự khác thì thêm nguồn đồng bộ qua `MES_Sync` và cột nhận diện nguồn, bảng giữ nguyên; hai màn có thể chuyển sang chỉ xem.
- **Nguồn:** ADR 0012 mục 1, 2.

### 10.2 Cây phòng ban riêng, mã phòng ban không sửa
- **Áp dụng:** cây phòng ban `Department` riêng, không dùng `SysOrgUnit`; có nút cấp công ty không thuộc ĐVCS nào. Phòng ban thuộc một ĐVCS thì gắn `BranchCode` (khóa ngầm, không gắn `A00`). `Path` = `Path` của cha + `Code` + `/`, trigger giữ khớp cây, nên mã phòng ban không sửa được. Chuyển phòng ban sang cha khác cập nhật `Path` cả nhánh trong một câu; cha mới không được nằm trong nhánh con của chính nó.
- **Lý do:** `SysOrgUnit` bắt buộc gốc là ĐVCS, không chứa được văn phòng, khối cấp công ty.
- **Phải nhớ:** muốn sửa được mã phòng ban phải đổi `Path` sang theo `Id`: quyết định mới. Bảng có trigger không dùng `INSERT … OUTPUT`. Cây phòng ban cũng là nơi quản lý chuyền may: bộ phận tích "Xưởng sản xuất" là chuyền, mã bộ phận là mã chuyền (mục 6.7); mã không sửa được nên dữ liệu đã xếp vào chuyền không bị lệch.
- **Nguồn:** ADR 0012 mục 3 và Hệ quả; phase 5.10. Code: migration `MES_Hr/0001_hr_init.sql`, `0002_department_production_workshop.sql`, `backend/src/modules/hr/department.service.ts`.

### 10.3 Mã nhân viên sửa được, liên kết theo `Id`
- **Áp dụng:** `Employee.Code` sửa được, chỉ cấm trùng; `Employee.Id` không đổi; mọi liên kết tới nhân viên đi theo `Id` (`Department.ManagerEmployeeId`, khóa ngầm `EmployeeId` từ module khác sau này). Đổi mã ghi nhật ký kèm mã cũ, mã mới.
- **Lý do:** liên kết theo chuỗi mã thì đổi mã phải sửa dây chuyền nhiều bảng.
- **Phải nhớ:** chưa nối tài khoản với nhân viên; khi làm thì thêm `SysUser.EmployeeId`, không nối theo mã.
- **Nguồn:** ADR 0012 mục 4. Code: `backend/src/modules/hr/employee.service.ts`.

### 10.4 Dữ liệu nhân sự dùng chung toàn công ty
- **Áp dụng:** `hr.orgchart`, `hr.employee` có `ScopeType = 'SHARED'`; đọc, ghi vẫn qua `BaseRepository`; ghi được ở `A00`.
- **Lý do:** hồ sơ nhân sự không thuộc riêng ĐVCS nào.
- **Phải nhớ:** tài nguyên dùng chung không có cột ĐVCS nên phạm vi ĐVCS, chuyền không lọc dữ liệu nhân sự: phép gán có phạm vi ĐVCS chỉ quyết định phép gán có hiệu lực ở ĐVCS của phiên hay không; khi có hiệu lực thì thấy, sửa, xuất mọi hồ sơ, kể cả cột nhạy cảm. Chưa chốt có chặn trường hợp này không; tạm thời không gán phạm vi ĐVCS cho người dùng vai trò Nhân sự. Phạm vi theo phòng ban làm sau.
- **Nguồn:** ADR 0012 mục 5. Code: `backend/src/modules/hr/hr.repositories.ts`, `PermissionService.grantOf`.

### 10.5 Vai trò Nhân sự, cột nhạy cảm
- **Áp dụng:** vai trò `HR` có Xem, Thêm, Sửa, Xuất file ở cả hai màn, không có Xóa (phòng ban giải thể, nhân viên nghỉ việc). ADMIN chỉ Xem; Giám đốc Xem và Xuất file. Năm cột nhạy cảm, mặc định Ẩn: `idNumber`, `birthDate`, `currentAddress`, `contactPhone`, `contactPerson`; Nhân sự sửa được, Giám đốc thấy `***`. Không lưu mã PIN máy chấm công.
- **Nguồn:** ADR 0012 mục 6, 8. Code: `backend/scripts/seed-data.ts`.

### 10.6 Chức danh, nhập hàng loạt, danh sách nhân viên
- **Áp dụng:**
  - Chức danh là danh mục phẳng `JobTitle`: không gắn phòng ban thì dùng chung, gắn phòng ban thì dùng cho phòng ban đó và cả nhánh con; máy chủ kiểm chức danh hợp với phòng ban của nhân viên. Loại phòng ban có `IsFinalLevel` thì không thêm được phòng ban con.
  - Nhập hàng loạt bằng cách dán từ Excel vào `SheetGrid` (không thêm thư viện đọc `.xlsx`); máy chủ kiểm và dò phòng ban, chức danh (xem trước), rồi ghi từng dòng độc lập. File mẫu là CSV.
  - Danh sách nhân viên là thẻ bên cạnh form, không có popup lọc theo cột (ngoại lệ mục 11.2); tìm, lọc chạy trong database, không phân biệt dấu, hoa thường, kể cả chữ "đ"; mới tạo lên trước, 20 thẻ mỗi trang.
- **Nguồn:** ADR 0012 mục 7, 9, 10. Code: `employee.service.ts`, `employee-import.service.ts`, `hr.repositories.ts`.

## 11. Lưới dữ liệu

Thành phần, cách dùng: [Giao diện](10-giao-dien.md).

### 11.1 Lưới nhập kiểu bảng tính dùng `SheetGrid`
- **Áp dụng:** mọi lưới nhập liệu dùng `frontend/src/components/SheetGrid.tsx`, bọc `react-datasheet-grid` 4.11.6 (MIT): chọn vùng, Ctrl+C/Ctrl+V với Excel, kéo điền, menu chuột phải tiếng Việt, dán quá cuối thì thêm dòng. Lưới chỉ xem và cột bị Che dùng `DataGrid`. Ô bắt buộc tô vàng, ô chỉ đọc tô xám, ô sai tô đỏ; ô khóa theo dòng không nhận dán hay xóa.
- **Lý do:** cần copy và dán từ Excel; AG Grid Community thiếu dán vùng (bản trả phí), Handsontable không miễn phí cho thương mại, Glide Data Grid khó theo theme, tự viết thì nhiều việc và dễ lỗi.
- **Phải nhớ:** `package.json` gốc có `overrides` buộc `react-resize-detector` dùng React 19 của dự án; nâng React hay thư viện lưới thì kiểm `npm ls react react-dom` còn một bản. Popup có lưới nhập tắt đóng bằng Esc. Lưới không có hoàn tác. Module sau (Cắt, May, QMS…) dùng `SheetGrid`, không tự dựng ô nhập.
- **Nguồn:** ADR 0008. Code: `frontend/src/components/SheetGrid.tsx`, `package.json` (`overrides`).

### 11.2 Lọc theo cột chạy trên máy chủ, danh sách trắng theo màn
- **Áp dụng:** client gửi `cf` dạng JSON `{"<trường>": {"in": [...]}}` hoặc `{"notIn": [...]}` (`null` hoặc chuỗi rỗng là ô trống). Mỗi service khai `FilterSpec`: trường JSON → biểu thức SQL do máy chủ dựng; client chỉ gửi giá trị, đi qua tham số. Kiểu cột `text`, `number`, `date`, `day`, `datetime` (`CreatedAt` UTC lọc theo ngày giờ Việt Nam, UTC+7).
- **Lý do:** lọc đúng trên toàn bộ dữ liệu trong phạm vi, kể cả phần chưa tải; không nhận SQL từ client.
- **Phải nhớ:** trường ngoài danh sách, dạng sai, quá 500 giá trị trả 422; `cf` tối đa 8.000 ký tự ở máy chủ, giao diện chặn khi chuỗi đã mã hóa URL vượt 6.000. Không đưa cột giá (đơn giá, thành tiền, giá CM, doanh số) vào danh sách trắng. Cột bị Ẩn hoặc Che: bộ lọc bị bỏ, không có nút lọc.
- **Nguồn:** ADR 0011 mục 1 và Hệ quả. Code: `backend/src/platform/data/column-filter.ts`, `frontend/src/lib/columnFilter.ts`.

### 11.3 Giá trị của popup lọc lấy từ database
- **Áp dụng:** `GET <danh sách>/values?field&search&<bộ lọc đang áp>` chạy `BaseRepository.distinctValues`, đi qua cùng điều kiện ĐVCS, phạm vi, ô tìm, bộ lọc nghiệp vụ như danh sách; bỏ bộ lọc của chính cột đang mở. Tối đa 500 giá trị, nhiều hơn thì báo `truncated`; cột ngày xếp mới nhất trước.
- **Phải nhớ:** mỗi lần mở popup là một truy vấn `SELECT DISTINCT`; cột tính từ bảng con lọc bằng truy vấn con, chậm hơn.
- **Nguồn:** ADR 0011 mục 2. Code: `BaseRepository.distinctValues`.

### 11.4 Mặc định 100 dòng, mới tạo lên trước
- **Áp dụng:** danh sách nghiệp vụ mặc định 100 dòng (tối đa 200), xếp `createdAt:desc` rồi `Id` giảm dần, có cột Ngày tạo. Màn Quản trị (người dùng, nhật ký, lịch sử đồng bộ, danh mục BRAVO) cũng 100 dòng.
- **Ngoại lệ:** Kế hoạch chuẩn bị SX xếp Chi nhánh → Tổ SX → Mã hàng → Ngày vào chuyền, cột Ngày tạo là thời điểm tạo dòng dàn chuyền gốc; Phân bổ PO xếp ETD-Revised mới nhất trước (mục 7.8); danh sách nhân viên 20 thẻ (mục 10.6).
- **Phải nhớ:** đơn nạp từ BRAVO có ngày tạo là lúc nạp. Khi bảng lớn cần thêm chỉ mục theo `CreatedAt` qua migration.
- **Nguồn:** ADR 0011 mục 3, 5. Code: các `*.dto.ts` (`pageSize`), `defaultSort` của repository.

### 11.5 Kéo giãn cột là tiện ích riêng của người xem
- **Áp dụng:** chưa kéo cột nào thì bảng co theo nội dung; kéo lần đầu thì chuyển sang bố cục cố định. Độ rộng lưu `localStorage` theo tên lưới, không lưu lên máy chủ. Bấm đúp tay kéo để vừa nội dung, phím mũi tên để đổi, nút ở ô STT để đặt lại.
- **Nguồn:** ADR 0011 mục 4. Code: `frontend/src/components/DataGrid.tsx`.

### 11.6 Ô tìm ở Quản trị cũng hỏi máy chủ
- **Áp dụng:** tìm ở mục danh mục (`GET /admin/catalogs/items/:code?q`) và nhà máy SX (`GET /admin/catalogs/factories?q`) chạy trong database. Lưới nhập của Kế hoạch chuẩn bị SX có cùng nút lọc theo cột, cùng tham số `cf`, cùng nguồn giá trị với lưới xem.
- **Ngoại lệ:** nút nhóm ở màn Đồng bộ dữ liệu (Tất cả, Danh mục, Đơn hàng, Có lỗi) lọc trên trình duyệt vì danh sách nguồn cố định, nhỏ, cần đủ để đếm.
- **Nguồn:** ADR 0011 mục 5. Code: `backend/src/platform/catalog/catalog.controller.ts`.

## 12. Giao diện

Quy tắc chi tiết, token: [Giao diện](10-giao-dien.md).

### 12.1 Mantine, thân thiện, không khô cứng
- **Áp dụng:** giao diện dựng bằng Mantine với theme riêng: trạng thái tải, rỗng có hướng dẫn, thông báo phản hồi, xác nhận khi xóa, phím tắt, chế độ tối. Bố cục: thanh nhóm chức năng bên trái (thu gọn còn icon), thanh trên cùng có ô tìm màn hình (Ctrl+K), dải menu con nằm ngang phía trên nội dung; trên điện thoại thanh nhóm chuyển xuống đáy màn hình.
- **Lý do:** giao diện là thứ lãnh đạo nhìn thấy; mẫu bố cục theo khách.
- **Đã thay một phần (13/10/2026):** thanh trên chạy hết chiều ngang, chứa logo; thanh bên nằm dưới thanh trên (mục 12.3).
- **Nguồn:** ADR 0003 bảng công nghệ (UI, Trải nghiệm), mục "Đổi phong cách giao diện", "Đổi design system theo Orange Cart". Code: `frontend/src/shell/AppLayout.tsx`.

### 12.2 Màu theo logo Vietsun, chữ Source Sans 3
- **Áp dụng:** màu chủ đạo cam `#F39830` (chỉ làm nền hoặc vạch, không làm chữ trên nền trắng), thanh bên và thanh trên xám than `#2B2C2D`, dải menu con `#3F4041`; nút chính nền cam chữ đen; liên kết, ô tích, quầng focus xanh `#007185`. Chữ Source Sans 3, mã và số JetBrains Mono, tự host qua `@fontsource`. Token nằm ở `frontend/src/theme/global.css` (biến CSS) và `frontend/src/theme/theme.ts` (thang màu Mantine `brand`, `charcoal`…, shade 6 là màu chuẩn).
- **Lý do:** chữ trắng trên cam chỉ đạt tương phản 2,3:1; font tự host chạy được trong mạng nhà máy không có Internet.
- **Đã thay một phần (13/10/2026):** màu thanh trên, dải menu con, nền trang, ô tích, phân trang, vị trí logo theo mục 12.3. Phần còn hiệu lực: cam `#F39830` không làm chữ trên nền trắng, nút chính chữ đen, xanh `#007185` cho liên kết, vòng focus, font. Riêng màn đăng nhập: font Inter, nút chính chữ trắng trên cam đậm (mục 12.4).
- **Nguồn:** ADR 0003 mục "Đổi design system theo Orange Cart", "Đổi màu chủ đạo theo logo Vietsun". Code: `frontend/src/theme/global.css`, `theme.ts`, `frontend/src/main.tsx`.

### 12.3 Design system theo mẫu 12/10/2026 (phase 5.11)
- **Áp dụng:**
  - Khung: thanh trên trắng chạy hết chiều ngang, chứa logo (không còn logo ở thanh bên); thanh bên xám than `#2B2C2D` nằm dưới thanh trên, mục đang mở nền `#3A3B3D`, vạch và biểu tượng cam, mũi tên ">" chỉ để trang trí; dải menu con nền sáng, tab đang mở chữ cam đậm và vạch cam; nền trang xám nhạt `#F3F4F6`, mọi màn nằm trong một thẻ trắng.
  - Màu: xám trung tính (chữ `#111827`, chữ phụ `#4B5563`, đường kẻ `#E5E7EB`); cam logo `#F39830` giữ làm màu chủ đạo, chữ trên nền cam vẫn đen; chữ màu cam dùng cam đậm `--brand-ink` `#A4560A`; ô tích, phân trang màu cam; xanh `#007185` giữ làm màu phụ (hộp thông tin, dòng đang đứng trong ô chọn, vòng focus, dàn chuyền); viền ô nhập giữ tương phản 3:1.
  - Mật độ giữ như cũ (ô nhập, nút 31px). Font giữ Source Sans 3.
  - Màn đăng nhập: nền tối có ảnh nhà máy, mặt trời cam, khẩu hiệu bên trái, thẻ đăng nhập bên phải, ngày giờ, chân trang. Riêng màn này được viết hoa nút và nhãn trang trí (bằng CSS), nút có biểu tượng mũi tên, ô nhập không có dấu *. "Quên mật khẩu?" chỉ mở hướng dẫn liên hệ quản trị viên.
- **Lý do:** người dùng gửi hai ảnh mẫu (12/10/2026) và yêu cầu đổi theo. Các điểm mẫu trái quy tắc tương phản (chữ trắng trên cam 2,3:1, chữ cam sáng trên nền trắng, viền ô nhập khoảng 1,5:1) giữ theo quy tắc cũ, người dùng đã chốt (Q1, Q7 ở kế hoạch phase 5.11).
- **Phải nhớ:** chỉ đổi frontend; token nằm ở `global.css` (`--app-topbar`, `--app-tabbar`, `--brand-ink` mới) và `theme.ts`. Ảnh nền nhà máy, logo bản nền tối là bản tạm cho tới khi có tài sản gốc: thay file ở `frontend/public`, không sửa code.
- **Nguồn:** `docs/phases/phase-5-11-dang-nhap-va-mau-giao-dien.md` (Q1–Q8). Code: `frontend/src/theme/global.css`, `theme.ts`, `frontend/src/shell/AppLayout.tsx`, `frontend/src/features/auth/LoginPage.tsx`.
- **Đã thay một phần (13/10/2026):** riêng màn đăng nhập dùng font Inter và nút chính chữ trắng trên cam đậm (mục 12.4).

### 12.4 Màn đăng nhập bám ảnh mẫu (phase 5.11, 13/10/2026)
- **Áp dụng:** chỉ ở màn đăng nhập.
  - Font Inter (`@fontsource/inter`, chỉ bộ chữ Latin và tiếng Việt, nét 400–700): import trong `LoginPage.tsx`, đặt lại `--mantine-font-family` trên `.login-shell`. Các màn khác giữ Source Sans 3.
  - Nút chính ("Đăng nhập", "Vào làm việc") chữ trắng 19px đậm trên cam đậm `#D9730D` (di chuột `#C2660B`), tương phản 3,3:1, đạt chuẩn cho chữ lớn (từ 18,67px đậm). Màu gắn qua prop `vars` của nút vì theme gắn màu nút chính bằng biến CSS inline.
  - Khẩu hiệu giữa trang là giá trị cốt lõi của công ty: Trust, Passion, Innovation, Sustainability, mỗi giá trị một dòng, chữ đầu cam theo bộ nhận diện Vietsun (một cột thì nằm ngang, tự xuống dòng). Thay "Kết nối dữ liệu / Kiến tạo hiệu quả" và đoạn mô tả của ảnh mẫu theo yêu cầu người dùng 13/10/2026.
  - Thẻ và ô nhập cùng nền xám nhạt `--app-section`, ô trắng lại khi đang gõ; viền ô giữ 3:1. Logo `logo-vs.png` đổi sang bản nền trong suốt (tạo từ `Logo VS.png` bằng cách đổi màu trắng thành trong suốt).
  - Bố cục co theo khung hình: xem [Giao diện](10-giao-dien.md) mục 11.2.
- **Lý do:** 13/10/2026 người dùng xem màn đăng nhập, yêu cầu "phải theo giống hình" (`docs/screens/VIETSUN MES Login Portal.png`) và chọn hai phương án này khi được hỏi lại Q1 và font. Chữ trắng đúng màu cam của ảnh chỉ đạt 2,5:1 nên chọn cam đậm hơn, chữ to hơn.
- **Phải nhớ:** nút chính ở các màn khác vẫn chữ đen trên cam `#F39830` (mục 12.2, 12.3). Đổi màu nút đăng nhập thì sửa `--login-cta`, `--login-cta-hover` trong `global.css`.
- **Nguồn:** câu trả lời của người dùng ngày 13/10/2026; review `docs/review/phase-5-11.md`. Code: `frontend/src/features/auth/LoginPage.tsx`, `frontend/src/theme/global.css`, `frontend/public/logo-vs.png`.

## 13. Module Cắt

Màn hình, bảng, API: [Cắt](15-cat.md). Kế hoạch, câu hỏi đã chốt: `docs/phases/phase-5-14-dong-bo-tien-do-cat.md` (phase 5.14).

### 13.1 Database `MES_Cutting`, bản chép kế hoạch xuất hàng
- **Áp dụng:** module `backend/src/modules/cutting`, database riêng `MES_Cutting` (biến `DB_CUTTING_NAME`). Màn Đồng bộ tiến độ cắt (`cutting.progress`) có một dòng mỗi kế hoạch xuất hàng, không đòi đã xếp chuyền. Đầu kế hoạch và SL KHXH theo màu cỡ chép sang `CuttingPlan`, `CuttingPlanColorSize`; lọc ĐVCS, phân trang, lọc theo cột, sắp xếp theo Lũy kế chạy trong `MES_Cutting` qua `BaseRepository`. `CuttingPlan.ShipmentPlanId` là khóa ngầm sang `MES_Order.ShipmentPlan`.
- **Lý do:** người dùng chốt Q2 ngày 14/10/2026; đúng "mỗi module một database" và tiền lệ module May (mục 9.1).
- **Phải nhớ:** máy chủ phải tạo được database mới (tài khoản SQL cần `CREATE DATABASE`, hoặc quản trị CSDL tạo trước); `npm run migrate` kiểm mọi database trước khi chạy migration nào, `deploy.cjs` gọi `npm run migrate -- --check` lúc bản cũ còn chạy. Mọi database MES cùng collation với `MES_Core` (tên màu, cỡ chép từ `MES_Order` sang `MES_Cutting` và so khớp theo collation): migrate tạo database mới theo collation của `MES_Core`, lệch thì cảnh báo. Tên database khai một chỗ: `backend/scripts/database-names.ts`.
- **Nguồn:** phase 5.14 Q2. Code: `backend/src/modules/cutting`, `backend/scripts/database-names.ts`, migration `MES_Cutting/0001_cutting_progress.sql`.

### 13.2 Chép qua `ShipmentPlanFeed` khi mở màn
- **Áp dụng:** Đơn hàng có service công khai `ShipmentPlanFeed` (`plansOf`, `versionOf`, lọc ĐVCS của phiên như `ScheduleFeed`). Mỗi lần mở màn hoặc xuất file, module Cắt chép lại khi dấu phiên bản đổi; một lần chép tại một thời điểm. Nhận diện kế hoạch nguồn bằng `Id` + ĐVCS + thời điểm tạo.
- **Lý do:** giống mục 9.2: Đơn hàng không phụ thuộc module Cắt, chưa có hạ tầng sự kiện.
- **Phải nhớ:** chép lại không được làm mất số cắt: số cắt gắn theo kế hoạch và tên màu cỡ, không theo dòng màu cỡ chép. Phiên `A00` gặp nguồn rỗng thì không chép (nhầm database); phiên một ĐVCS vẫn chép. Kế hoạch không còn ở nguồn mà đã có số cắt thì giữ bản chép, đánh dấu `SourceDeletedAt` ("Kế hoạch đã xóa", chỉ đọc, chỉ còn Xóa số cắt); chưa có số cắt thì xóa bản chép. Màu cỡ bị bỏ khỏi kế hoạch mà đã có số cắt: hiện cuối lưới, Kế hoạch 0, chỉ đọc.
- **Nguồn:** phase 5.14 Q5. Code: `backend/src/modules/order/shipment-plan-feed.service.ts`, `cutting.repositories.ts` (`syncFromPlans`).

### 13.3 Số cắt theo ngày, Lũy kế, +/-
- **Áp dụng:** `CuttingPlanDaily` lưu số cắt của một màu cỡ trong một ngày (`EntryDate`), một dòng mỗi kế hoạch, màu, cỡ, ngày, chỉ số > 0 (nhập 0 hoặc xóa ô là xóa dòng). Lũy kế = tổng mọi ngày, tính lúc đọc, không lưu sẵn. **+/- = Lũy kế − Kế hoạch** (âm là còn thiếu, dương là cắt dư). Xem lại một ngày khác chỉ đổi cột Trong ngày; Lũy kế, +/- vẫn tính trên mọi ngày. Ngày nhập liệu được lùi, không được sau hôm nay (giờ Việt Nam), máy chủ cưỡng chế. Lũy kế của màu cỡ không vượt Kế hoạch (mục 13.7). Lưu chỉ gửi các ô đã sửa.
- **Lý do:** người dùng chốt 14/10/2026: Q1 theo ảnh mẫu `docs/screens/dong-bo-tien-do-cat.png` (yêu cầu viết bằng chữ ghi ngược lại), Q6; ảnh có dòng Lũy kế vượt kế hoạch 1. Gửi từng ô để hai người sửa hai ô khác nhau không ghi đè nhau.
- **Nguồn:** phase 5.14 Q1, Q6. Code: `cutting-progress.service.ts`, `frontend/src/features/cutting/cuttingProgressRules.ts`.

### 13.4 Không xóa kế hoạch xuất hàng đã có số cắt
- **Áp dụng:** Đơn hàng có điểm đăng ký công khai `ShipmentPlanDeleteGuard`: module khác đăng ký hàm trả lý do kế hoạch chưa xóa được. Xóa kế hoạch xuất hàng gọi các hàm đó trước, có lý do thì 409. Module Cắt đăng ký: kế hoạch có số cắt thì phải Xóa số cắt ở màn Đồng bộ tiến độ cắt trước (quyền `cutting.progress:delete`, có xác nhận, ghi `SysAuditLog`). Lưu số cắt kiểm lại kế hoạch còn ở nguồn.
- **Lý do:** người dùng chốt Q5 ngày 14/10/2026. Đăng ký ngược (như `SyncService.onSucceeded`) để Đơn hàng không import module Cắt.
- **Phải nhớ:** hai database không có transaction chung: lưu số cắt đúng lúc kế hoạch đang bị xóa vẫn có thể lọt, khi đó kế hoạch hiện "Kế hoạch đã xóa" (mục 13.2). `reset:demo`, `load:bravo`, `sim:board` xóa dữ liệu cắt của kế hoạch chúng xóa (chỉ máy demo). Bảng số cắt `CuttingPlanDaily` có khóa ngoại tới `CuttingPlan` **không** xóa theo cha: Xóa số cắt xóa số cắt trước rồi mới xóa bản chép; lỡ xóa bản chép còn số cắt thì database từ chối.
- **Nguồn:** phase 5.14 Q5. Code: `backend/src/modules/order/shipment-plan-delete-guard.ts`, `shipment.service.ts` (`remove`), `cutting-progress.service.ts` (`onModuleInit`, `removeEntries`), `backend/scripts/cutting-data.ts`.

### 13.5 Quyền màn Đồng bộ tiến độ cắt
- **Áp dụng:** `cutting.progress` theo ĐVCS (`BRANCH`), bảng nguồn `CuttingPlan`, không chiều Chuyền, không chiều Người tạo (dòng do hệ thống chép). Hành động: Xem, Sửa (nhập số trong ngày), Xóa (Xóa số cắt), Xuất; không có Thêm. Ma trận mẫu: Kế hoạch Xem, Sửa, Xuất; Toàn quyền có hết; vai trò khác như trước. Máy đã cài nhận quyền mới của Kế hoạch qua migration `MES_Core`. Chính sách cột cho SL kế hoạch, Trong ngày, Lũy kế, +/-. Trưởng chuyền bị Che Khách hàng như ở các màn Đơn hàng (Q51, Tech Lead 20/10/2026); máy đã cài nhận bằng migration `MES_Core/0015` (Tech Lead chọn 21/10/2026, vì seed không thêm chính sách mẫu cho vai trò, cột đã có).
- **Lý do:** người dùng chốt Q4 ngày 14/10/2026: tạm cho Kế hoạch nhập, `admin` (Toàn quyền) để thử, người dùng tự gán vai trò khác ở màn Quản trị.
- **Nguồn:** phase 5.14 Q4; Q51, task T16. Code: `backend/scripts/seed-data.ts`, migration `MES_Core/0012_grant_cutting_progress.sql`, `0015_mask_cutting_progress_customer.sql`.

### 13.6 Cột LK cắt của Kế hoạch xuất hàng lấy từ Đồng bộ tiến độ cắt
- **Áp dụng:** `MES_Order.ShipmentPlan.CutQty` là bản sao của Lũy kế cắt (tổng số cắt mọi ngày, mọi màu cỡ của kế hoạch, kể cả màu cỡ đã bỏ khỏi kế hoạch). Module Cắt ghi qua `ShipmentPlanFeed.setCutQty` (chỉ kế hoạch của ĐVCS phiên, khớp Id + ĐVCS + thời điểm tạo, chỉ khi số khác, không đổi `ModifiedAt`): ngay sau mỗi lần lưu, Xóa số cắt (sau khi `MES_Cutting` commit), và đối chiếu mỗi lần mở màn Đồng bộ tiến độ cắt (chỉ ghi kế hoạch lệch). Mọi lần ghi giữ khóa ứng dụng `MES_Cutting.CutQty.push` và đọc Lũy kế khi đã giữ khóa. Seed, `sim:board` không điền số giả cho cột này nữa (luôn 0).
- **Lý do:** người dùng chốt Q7 ngày 15/10/2026. Giữ cột trong `MES_Order` để màn Kế hoạch xuất hàng lọc, sắp xếp, xuất file theo LK cắt trong SQL như cũ; Đơn hàng vẫn không phụ thuộc module Cắt. Khóa ứng dụng để các tiến trình backend (pm2 cluster) ghi lần lượt, số cũ không đè số mới (review Q7 M6).
- **Phải nhớ:** số gốc ở `MES_Cutting`; cột này có thể trễ khi lần ghi sau khi lưu lỗi (log cảnh báo) tới lần mở màn sau. Phiên `A00` mở màn thì ghi cột này cho mọi ĐVCS: việc của hệ thống, không phải người dùng ghi dữ liệu theo ĐVCS ([Phân quyền](04-phan-quyen.md) mục 6.9). Kế hoạch đã có số cắt không xóa được (mục 13.4) nên không có số mồ côi. Nhật ký sửa kế hoạch xuất hàng có thể thấy `cutQty` đổi giữa hai ảnh trước, sau (do module Cắt ghi chen giữa), không phải người sửa đổi. LK May ra, LK Endline, LK Hoàn thiện vẫn là số mẫu.
- **Nguồn:** phase 5.14 Q7; review `docs/review/phase-5-14.md` mục Q7. Code: `shipment-plan-feed.service.ts` (`cutQtyOf`, `setCutQty`), `order.repositories.ts` (`ShipmentPlanFeedRepository`), `cutting-progress.service.ts` (`reconcileCutQty`, `pushAfterWrite`), `cutting.repositories.ts` (`cutTotals`, `withCutQtyLock`).

### 13.7 Lũy kế cắt không vượt Kế hoạch của màu cỡ
- **Áp dụng:** lưu số cắt mà làm Lũy kế (mọi ngày) của một màu cỡ vượt SL Kế hoạch xuất hàng của màu cỡ đó thì 422 `VALIDATION_FAILED` ("Lũy kế vượt Kế hoạch ở …. Muốn cắt thêm, điều chỉnh Kế hoạch xuất hàng trước."), `details.cells` liệt kê màu cỡ, không ghi ô nào của lần lưu. Chỉ chặn ô tăng số: kế hoạch xuất hàng giảm sau khi đã cắt thì màu cỡ đã vượt vẫn giảm được số (tô đỏ, có dòng nhắc). Máy chủ chép lại kế hoạch trước khi kiểm (không đối chiếu LK cắt ở bước này) và kiểm trong transaction đã khóa kế hoạch (hai người lưu hai ngày khác nhau không cùng vượt). Giao diện kiểm cùng luật theo Kế hoạch đã tải khi Kế hoạch xem được (`raisedOverPlan`): tô đỏ, khóa nút Lưu lại, có nút "Tải lại kế hoạch" (tải lại mà giữ số đang nhập, `reapply`), nên tăng kế hoạch xuất hàng ở màn khác rồi quay lại lưu không phải đóng popup; lưu bị 422 cũng tự tải lại như vậy. Kế hoạch bị Che, Ẩn thì chỉ máy chủ kiểm. Màu cỡ đã bỏ khỏi kế hoạch (Kế hoạch 0) không tô đỏ, không tính là vượt (có dòng nhắc riêng, không sửa được). Thay câu "Cắt vượt kế hoạch được phép" của mục 13.3.
- **Lý do:** người dùng chốt 15/10/2026: ảnh mẫu của BA (dòng Lũy kế vượt 1) mô tả sai; muốn cắt vượt thì phải điều chỉnh Kế hoạch xuất hàng trước.
- **Phải nhớ:** màn Kế hoạch xuất hàng chưa chặn giảm SL màu cỡ xuống dưới Lũy kế cắt (câu hỏi Q36 ở [Trạng thái](../current/STATUS.md)), nên +/- vẫn có thể dương. Màu cỡ đã bỏ khỏi kế hoạch vốn không sửa được (mục 13.3). Thông báo lỗi nêu tên màu cỡ, không nêu số; dù vậy người được Sửa Trong ngày vẫn dò được SL Kế hoạch bị Che, Ẩn bằng cách nhập dần (200 hay 422): không Che `planQty` với vai trò được Sửa `dayQty` ([Phân quyền](04-phan-quyen.md) mục 8). Bước chép lại trước khi lưu lỗi (chỉ log) hoặc lần lưu nhập vào một lượt chép đang chạy đã đọc nguồn trước khi kế hoạch đổi thì kiểm theo Kế hoạch cũ: có thể 422 sai hoặc cho vượt mức kế hoạch vừa giảm; lần lưu sau theo kế hoạch mới.
- **Nguồn:** phase 5.14, yêu cầu ngày 15/10/2026. Code: `cutting-progress.service.ts` (`save`), `frontend/src/features/cutting/cuttingProgressRules.ts` (`overPlan`, `raisedOverPlan`, `saveIssue`).

### 13.8 Xác nhận cấp BTP: số cấp theo ngày, lệnh cấp gom theo Ngày cấp và mã hàng
- **Áp dụng:**
  - Số bán thành phẩm cấp cho chuyền lưu theo ngày ở `MES_Cutting.CuttingSupplyLine` (một dòng mỗi lệnh, chuyền, màu, cỡ; `Qty > 0`). Lệnh cấp `CuttingSupply` là đầu phiếu của nhóm (ĐVCS, Ngày cấp, Mã hàng), `UNIQUE (BranchCode, SupplyDate, StyleCode)`: lưu thêm chuyền cùng ngày cùng mã hàng thì gộp vào lệnh đã có; lần lưu đưa mọi ô của lệnh Chưa cấp về 0 thì lệnh tự bỏ. Màu cỡ lưu theo tên như mọi bảng màu cỡ; mã hàng `NVARCHAR(120)` như `ShipmentPlan.StyleCode` (Q1, Q2).
  - SL kế hoạch của một dòng = SL giao ở Phân bổ màu cỡ của chuyền, mã hàng, màu, cỡ, cộng mọi kế hoạch xuất hàng của ĐVCS (Q4), đọc thẳng qua API công khai `LineColorSizeFeed` của Đơn hàng (không chép). SL đồng bộ = Lũy kế cắt của mã hàng, màu, cỡ (mọi kế hoạch, kể cả kế hoạch đã xóa còn số cắt), không theo chuyền (Q5). SL đã cấp = tổng các ngày khác Ngày cấp đang xem; SL còn lại = SL kế hoạch − SL đã cấp − SL cấp trong ngày (Q3). Không lưu các số này.
  - Lưu chỉ gửi ô đã sửa; máy chủ chặn (422, không ghi ô nào) ô tăng số mà: không có trong Phân bổ màu cỡ của chuyền; làm Còn lại âm; làm tổng cấp mọi chuyền, mọi ngày của màu cỡ vượt SL đồng bộ. Giảm số luôn được. Ngày cấp không sau hôm nay (giờ Việt Nam), được lùi (Q10). Hai lần lưu cùng mã hàng xếp hàng bằng khóa ứng dụng theo (ĐVCS, mã hàng).
  - Trạng thái: Chưa cấp khi chưa xác nhận; bấm Xác nhận cấp thì ghi người cấp và tính Cấp toàn phần (mọi dòng của lệnh có Còn lại ≤ 0) hoặc Cấp 1 phần, rồi giữ nguyên (Q7). Lệnh đã xác nhận không sửa (kể cả Ghi chú), không xóa; Hủy duyệt đưa về Chưa cấp. Số đã cấp tính cả lệnh chưa xác nhận.
  - Phân bổ màu cỡ, Xếp chuyền không giảm phần giao (cộng mọi kế hoạch cùng mã hàng) xuống dưới số đã cấp của chuyền, màu, cỡ: 409 (Q12). Đơn hàng mở điểm đăng ký `LineSupplyGuards`, module Cắt đăng ký hàm tra số đã cấp; Đơn hàng chụp phần giao trước khi ghi, kiểm sau khi ghi, trước commit; chỉ xét ô giảm. Kế hoạch đã xếp chuyền vốn không xóa được nên không cần chặn ở Kế hoạch xuất hàng.
- **Lý do:** người dùng yêu cầu 15/10/2026 (ảnh `docs/screens/cap-ban-thanh-pham.png`) và chốt Q1–Q13 theo đề xuất. Lưu theo ngày như số cắt (13.3) để đổi Ngày cấp là xem lại số của ngày đó, và lệnh tự gom theo mã hàng như yêu cầu.
- **Phải nhớ:** hai database không có transaction chung. Lưu số cấp đọc phân bổ trước, rồi đọc lại sau khi ghi, trước commit (409 nếu phân bổ vừa giảm); Đơn hàng tra số đã cấp trong transaction của mình. Hai bên cùng chạy trên cùng chuyền có thể chờ khóa của nhau qua hai database (SQL Server không thấy vòng chờ, không có 1205): câu tra số đã cấp của Đơn hàng chỉ chờ khóa 3 giây (`SET LOCK_TIMEOUT`, `suppliedQuick`), hết giờ thì Đơn hàng trả 409 "thử lại" và nhả khóa, lần lưu số cấp đi tiếp (review 5.15 M1). Không tra được số đã cấp (không kết nối được `MES_Cutting`, hết giờ chờ khóa) thì Đơn hàng chặn lần giảm phần giao. Dòng đã bỏ khỏi Phân bổ màu cỡ mà còn số cấp: chỉ giảm được số (review 5.15 M2). Màn Đồng bộ tiến độ cắt chưa chặn giảm số cắt xuống dưới số đã cấp (câu hỏi Q37). Ảnh mẫu tính Còn lại = KH − Đã cấp (bỏ qua số trong ngày): theo công thức người dùng nêu, không theo ảnh.
- **Nguồn:** phase 5.15 (`docs/phases/phase-5-15-xac-nhan-cap-btp.md`). Code: `backend/src/modules/cutting/cutting-supply.service.ts`, `cutting-supply.repositories.ts`, `backend/src/modules/order/line-color-size-feed.service.ts`, `line-supply-guard.ts`, migration `MES_Cutting/0002_cutting_supply.sql`.

### 13.9 Số lệnh cấp BTP chạy theo ĐVCS và năm
- **Áp dụng:** số lệnh dạng `NNN/ddMMyy/XBTP` theo ảnh mẫu: `ddMMyy` là Ngày cấp, `NNN` tăng dần trong ĐVCS, về 1 đầu mỗi năm (năm của Ngày cấp), tối thiểu 3 chữ số. Lưu `SupplyYear`, `SupplySeq` riêng (`UNIQUE (BranchCode, SupplyYear, SupplySeq)`) và chuỗi `SupplyNo`; sinh trong transaction giữ khóa ứng dụng theo ĐVCS, đọc số lớn nhất của mọi lệnh trong ĐVCS (kể cả ngoài phạm vi người lập), không trả dòng nào. Khác mục 3.11 (số theo `Id`).
- **Lý do:** người dùng chốt Q8 (15/10/2026): số chạy liền như ảnh mẫu. `cutting.supply` chỉ lọc theo ĐVCS, không có phạm vi theo người, nên đọc số lớn nhất không lộ dữ liệu ngoài phạm vi.
- **Phải nhớ:** lệnh bị xóa để lại khoảng trống số; số không dùng lại. Lệnh lùi Ngày cấp sang năm trước nhận số tiếp theo của năm đó. Sắp xếp theo Số lệnh dùng năm rồi số thứ tự, không so chuỗi.
- **Nguồn:** phase 5.15 Q8. Code: `CuttingSupplyRepository.nextSeq`, `supplyNoOf` (`cutting-supply.service.ts`).

### 13.10 Quyền màn Xác nhận cấp BTP
- **Áp dụng:** `cutting.supply` theo ĐVCS (`BRANCH`), bảng nguồn `CuttingSupply`, không chiều Chuyền, Người tạo. Xem; Thêm (tạo lệnh mới khi lưu); Sửa (lưu số cấp của lệnh đã có, Xác nhận cấp, Hủy duyệt); Xóa (lệnh Chưa cấp); Xuất. Lưu số cấp là `PUT` cần Sửa, lần lưu phải tạo lệnh mới thì cần thêm Thêm (403 nếu thiếu). Người lập tự xác nhận được (Q9). Ma trận mẫu: Kế hoạch Xem, Thêm, Sửa, Xóa, Xuất; Quản trị Xem; Giám đốc Xem, Xuất; Toàn quyền đủ; Trưởng chuyền chưa xem. Máy đã cài nhận quyền của Kế hoạch qua migration `MES_Core/0013`. Chính sách cột cho số lệnh, mã hàng, người lập, người cấp, ghi chú, chuyền, các cột số lượng, trạng thái; Còn lại che khi SL kế hoạch, đã cấp hoặc trong ngày bị Ẩn, Che.
- **Lý do:** người dùng chốt Q9 (15/10/2026) theo đề xuất. Dùng Sửa cho Xác nhận cấp như xác nhận PO ở Cập nhật tỷ lệ cắt: khung quyền chỉ có 5 hành động.
- **Phải nhớ:** muốn tách người lập và người cấp thì cần hành động riêng (chưa có trong khung quyền); hiện chỉ ghi lại người cấp. Người chỉ có Sửa (không có Xóa) vẫn bỏ được một lệnh Chưa cấp bằng cách đưa mọi ô về 0 (lệnh tự bỏ, nhật ký `DELETE`). Body lưu dùng khóa `line`, `style` (không phải `lineCode`, `styleCode`) nên Chỉ đọc ở hai cột này không chặn việc chọn dòng; Ẩn, Che hai cột này thì form không dựng được dòng (khóa của dòng bị che): giao diện khóa Thêm mới, Sửa kèm lý do (review 5.15 M3). `dayQty`, `note` vẫn bị cưỡng chế khi ghi. Ghi chú đổi thì áp cho lệnh của mọi mã hàng trong form: một lệnh trong đó đã xác nhận thì cả lần lưu 409.
- **Nguồn:** phase 5.15 Q9. Code: `backend/scripts/seed-data.ts`, migration `MES_Core/0013_grant_cutting_supply.sql`, `cutting.controller.ts` (`CuttingSupplyController`).

## 14. Kế hoạch may

### 14.1 Kế hoạch may theo dòng dàn chuyền, chốt theo chuyền × ngày
- **Áp dụng:** mỗi dòng của màn Kế hoạch may (`sewing.plan`, `/sewing/plan`) là một dòng dàn chuyền (`MES_Order.ShipmentPlanLine`) trong một ngày. Dữ liệu ở `MES_Sewing`: `SewingDayPlan` (một chuyền, một ngày; giữ trạng thái chốt, người chốt), `SewingDayPlanItem` (một dòng dàn chuyền trong ngày: Kế hoạch theo linemap, Kế hoạch ngày xưởng giao, Từ giờ, Đến giờ, cùng bản chụp Tổng kế hoạch, Giá CM, PO/Buy date, ngày từ Xếp chuyền). Màn liệt kê dòng dàn chuyền của các chuyền thuộc đơn vị chọn có Ngày vào chuyền ≤ ngày ≤ Kết thúc ra chuyền, dòng đã có số ở ngày đó, cộng dòng người dùng thêm bằng Thêm dòng. Đọc Xếp chuyền thẳng qua `ScheduleFeed` lúc mở màn, không chép. Ngày chưa chốt hiện số mới nhất của Xếp chuyền; Cập nhật, Chốt chụp lại; ngày đã chốt hiện bản chụp. Chốt, Hủy chốt áp cho mọi chuyền đang hiện của đơn vị chọn. Ngày trước hôm nay (giờ Việt Nam) chỉ xem: không Cập nhật, Chốt, Hủy chốt, kể cả Toàn quyền; ngày sau hôm nay lập trước được. Cập nhật, Chốt, Hủy chốt dùng quyền Sửa. Mã chuyền ở hai bảng mới là `NVARCHAR(20)`; bảng cũ giữ `VARCHAR(20)`.
- **Lý do:** người dùng yêu cầu 15/10/2026 (ảnh `docs/screens/ke-hoach-may.png`), chốt Q1–Q13 ngày 16/10/2026. Chốt ở mức chuyền × ngày để chọn đơn vị là xưởng hay một chuyền cũng thấy cùng trạng thái chốt. Mã chuyền `NVARCHAR(20)` theo người dùng chốt (Q1).
- **Phải nhớ:** lần đầu lập kế hoạch cho một chuyền trong ngày (Cập nhật, Chốt phải tạo bản ghi chuyền × ngày) cần thêm quyền Thêm, như tạo lệnh cấp BTP (13.10); Kế hoạch có sẵn. Dòng dàn chuyền chưa có bản ghi chỉ hiện khi (ĐVCS, chuyền) trong phạm vi xem, kiểm bằng `BaseRepository.allows`. Đã giao = tổng Kế hoạch ngày xưởng giao của cùng dòng dàn chuyền ở mọi ngày ≤ ngày chọn (cả ngày chưa chốt); Doanh số = Kế hoạch theo linemap × Giá CM (không theo ảnh). Dòng dàn chuyền nhận diện bằng Id + thời điểm tạo (Id được dùng lại sau `reset:demo`, `load:bravo`). Mã chuyền ở bảng mới so với `VARCHAR` của bảng khác trong code, không join chéo database.
- **Nguồn:** phase 5.16 (`docs/phases/phase-5-16-ke-hoach-may.md`).

### 14.2 Không giao vượt Tổng kế hoạch
- **Áp dụng:** tổng Kế hoạch ngày xưởng giao **mọi ngày** của một dòng dàn chuyền không vượt Số lượng của dòng đó (Tổng kế hoạch): Cập nhật vượt thì 422, không ghi ô nào. Muốn giao thêm thì tăng Số lượng ở Xếp chuyền trước. Xếp chuyền không giảm Số lượng (kể cả bỏ dòng) xuống dưới tổng đã giao, không đổi chuyền dòng đã có số ở Kế hoạch may: 409. Đơn hàng mở điểm đăng ký `LineDayPlanGuards`, module May đăng ký hàm tra (Đơn hàng không import module May).
- **Lý do:** người dùng chốt Q7, Q12 ngày 16/10/2026.
- **Phải nhớ:** hai database không có transaction chung: lần Cập nhật đọc lại dòng dàn chuyền sau khi ghi, trước commit; Xếp chuyền tra số đã giao sau khi ghi dòng dàn chuyền, trước commit (đang giữ khóa ghi, lần Cập nhật chạy chồng phải chờ); câu tra chờ khóa tối đa 3 giây, hết giờ thì Xếp chuyền 409 "thử lại" (review 5.16 H1). Không tra được số đã giao thì Xếp chuyền chặn lần giảm, bỏ dòng, đổi chuyền.
- **Nguồn:** phase 5.16 Q7, Q12.

### 14.3 ĐVCS có kế hoạch xuất hàng của đơn sửa được Giá CM
- **Áp dụng:** ngoài ĐVCS nguồn (Chi nhánh FOB), ĐVCS có kế hoạch xuất hàng của đơn sửa được **riêng Giá CM** của đơn ở Thông tin đơn hàng (`PUT /order/sales-orders/:id/cm-price`, cần `order.allocation:update` và cột `cmPrice` Sửa được). Điều kiện do `BaseRepository` sinh (`usedBy = ShipmentPlan.SalesOrderId`) ở một repository riêng chỉ ghi `CmPrice`; Sửa các cột khác, Xóa đơn vẫn chỉ ở ĐVCS nguồn. Một đơn một Giá CM dùng chung mọi ĐVCS. Sửa Giá CM (ở cả đường sửa đơn) thì cập nhật luôn Giá CM chụp ở mọi kế hoạch xuất hàng của đơn trong cùng transaction, nên Doanh số Xếp chuyền và Kế hoạch may theo giá mới. Vai trò mặc định nhập được: Kế hoạch (chính sách cột đã có), Toàn quyền.
- **Lý do:** người dùng yêu cầu 16/10/2026: Giá CM có nhiều trường hợp, tạm cho nhà máy nhập tay; chốt Q14–Q16. Thay một phần luật "sửa đơn chỉ ở ĐVCS nguồn" của ADR 0013 mục 4, 11 (chỉ cho cột này).
- **Phải nhớ:** đơn may ở hai ĐVCS thì ĐVCS nào sửa cũng đổi giá cho cả hai; giá riêng theo ĐVCS, theo PO chờ quy tắc của BA. Bước ghi giá sang kế hoạch là việc của hệ thống (ghi kế hoạch của mọi ĐVCS, không đổi `ModifiedAt`), như ghi LK cắt (mục 13.6). Nạp BRAVO không ghi đè Giá CM. Nhật ký `SalesOrder` không ghi giá trị giá (cột nhạy cảm).
- **Nguồn:** phase 5.16 Q14–Q16.

## 15. Kế hoạch xuất hàng

### 15.1 Mỗi ĐVCS một kế hoạch xuất hàng cho một đơn hàng
- **Áp dụng:** một đơn hàng có tối đa một kế hoạch xuất hàng ở mỗi ĐVCS. Lập kế hoạch thứ hai ở cùng ĐVCS: 409, câu báo nêu số kế hoạch đang có khi người lập xem được kế hoạch đó. Popup Chọn mã hàng (Thêm mới) không hiện đơn đã có kế hoạch ở ĐVCS phiên. Muốn thêm số lượng thì mở kế hoạch đó, bấm "Chọn mã hàng" để thêm PO (mục 15.2). ĐVCS khác vẫn lập kế hoạch riêng cho cùng đơn được (đơn có nhà máy SX ở nhiều ĐVCS). Cưỡng chế ở service dưới khóa đơn hàng (lần lập nào cũng khóa đơn), không có chỉ mục UNIQUE.
- **Lý do:** người dùng yêu cầu 16/10/2026, chốt Q1 (theo ĐVCS), Q2 (dữ liệu cũ giữ nguyên, chỉ chặn lập thêm, vì đang là dữ liệu test).
- **Phải nhớ:** dữ liệu lập trước phase 5.17 có thể còn nhiều kế hoạch cho một đơn ở cùng ĐVCS; các kế hoạch đó vẫn sửa được, hệ thống không tự gộp. Chưa có chức năng bỏ PO khỏi kế hoạch. Muốn thêm chỉ mục UNIQUE `(BranchCode, SalesOrderId)` thì dọn dữ liệu đó trước.
- **Nguồn:** phase 5.17 (`docs/phases/phase-5-17-khxh-mot-ke-hoach-moi-don.md`) Q1, Q2.

### 15.2 Mỗi PO chỉ thuộc một kế hoạch, thêm PO khi sửa
- **Áp dụng:** một PO chỉ nằm trong một kế hoạch xuất hàng trên toàn công ty. Popup chọn PO (Thêm mới, và "Chọn mã hàng" khi Sửa) chỉ hiện PO chưa nằm trong kế hoạch nào; lập, thêm PO kiểm lại dưới khóa đơn hàng (PO đã có kế hoạch: 409). Sửa kế hoạch được **thêm** PO của đúng đơn hàng của kế hoạch (`PUT /:id` có `addPoIds`, gửi kèm số lượng theo màu cỡ), không bỏ PO. Số lượng gốc cộng dồn theo màu cỡ của các PO; SL KHXH đã có giữ nguyên, người dùng tự chỉnh (màu cỡ mới để trống). Thêm PO cần quyền Sửa kế hoạch, quyền xem PO ở Cập nhật tỷ lệ cắt và cột Số lượng KH Sửa được.
- **Lý do:** người dùng yêu cầu 16/10/2026 (Q3, Q4, Q5). PO đã được gán nhà máy SX ở Phân bổ PO nên một PO chỉ sản xuất ở một nơi (người dùng trả lời Q6 (a)). Thay phần "hai ĐVCS cùng đưa một PO vào kế hoạch" của ADR 0013 mục 11 cho dữ liệu mới; luật quyền ghi PO theo `ShipmentPlanPo.BranchCode` giữ nguyên.
- **Phải nhớ:** không lọc PO theo bảng Phân bổ PO: bảng đó theo khóa OSM (PO, SO, Style, Màu), không nối thẳng với `SalesOrderPo`. Dữ liệu cũ có thể còn PO nằm trong nhiều kế hoạch. Giới hạn 100 PO mỗi kế hoạch giữ nguyên (cả PO thêm sau). Thêm PO theo cùng điều kiện với lập mới: đơn còn Nhà máy SX thuộc ĐVCS phiên, chưa Hoàn thành/Đã hủy (lựa chọn khi sửa review 5.17 M2, chờ người dùng xác nhận); sửa SL của PO đã có thì không đòi. Lưu lưới màu cỡ gửi kèm tập PO lưới dựng theo (`basePoIds`), khác PO đang lưu thì 409. Dữ liệu mẫu (`seed-order.ts`) và `sim:board` vẫn sinh nhiều kế hoạch mỗi đơn, gắn mọi PO (chưa sửa, câu hỏi Q40): trên máy demo nút "Chọn mã hàng" khi Sửa thường không có PO.
- **Nguồn:** phase 5.17 Q3–Q6.

### 15.3 SL đã tạo KHXH chỉ trừ kế hoạch dùng chung PO
- **Áp dụng:** ở lưới màu cỡ (popup Thêm/Sửa, khung Màu cỡ), "SL đã tạo KHXH" là tổng SL KHXH theo màu cỡ của **các kế hoạch khác có dùng chung ít nhất một PO** với các PO đang xét (mọi ĐVCS); SL còn lại = Số lượng gốc − SL đã tạo KHXH. Với dữ liệu mới (mục 15.2) cột này bằng 0. Cột SL đã tạo KH, SL còn lại của bảng mã hàng ở popup Chọn mã hàng vẫn tính theo cả đơn (SL đơn hàng trừ mọi kế hoạch của đơn).
- **Lý do:** trước đây trừ mọi kế hoạch của đơn theo màu cỡ, nên ĐVCS lập với PO khác bị chặn sai (A lập PO1 Đỏ/M 100, B lập PO2 Đỏ/M 100 thì B còn lại 0). Người dùng chốt Q6 (b) ngày 16/10/2026.
- **Nguồn:** phase 5.17 Q6.

## 16. Tài liệu, quy trình, công cụ

### 16.1 Tài liệu hai lớp, mỗi quy tắc một nguồn
- **Áp dụng:** lớp chính thức gồm `AGENTS.md` (quy tắc bắt buộc; `CLAUDE.md` import file này và chỉ thêm phần riêng của Claude Code), `docs/PROJECT_OVERVIEW.md`, `ARCHITECTURE.md`, `DATA_FLOWS.md`, `CODE_CONVENTIONS.md`, `ENGINEERING_STANDARDS.md`, `DEVELOPMENT_WORKFLOW.md`; trạng thái ở `docs/current/STATUS.md`; tài liệu module (`docs/update_docs/04`–`13`, `15`) làm tham chiếu chi tiết. Mỗi thông tin một nguồn, nơi khác dẫn link; bỏ cơ chế giữ `CLAUDE.md` và tài liệu khác cùng nội dung. `docs/` nằm trong git.
- **Lý do:** bộ `update_docs` lệch code sau các phase 5.12–5.17, trùng với ADR, `thiet-ke`, file phase; `docs/` không có lịch sử git.
- **Phải nhớ:** số mục 3–6 của `AGENTS.md` được comment trong code trích ("CLAUDE.md mục 4.5"), không đổi số. Tài liệu đã bị thay (`01`, `02`, `03`, `14`, ADR, file phase, `thiet-ke/*.md`…) đã xóa ngày 19/10/2026 sau khi chuyển nội dung; bản gốc ở commit `98d19db`, bảng "đã xóa → đọc ở đâu" ở [mục lục tài liệu tham chiếu](README.md); bảng đổi gì sửa file nào ở [DEVELOPMENT_WORKFLOW](../DEVELOPMENT_WORKFLOW.md) mục 6.
- **Nguồn:** Tech Lead duyệt 19/10/2026 theo `docs/DOCS_STANDARDIZATION_PLAN.md`.

### 16.2 Căn cứ khi tài liệu và code khác nhau
- **Áp dụng:** code và cấu hình là căn cứ cho hiện trạng; file này là căn cứ cho quy tắc và ý định. Thấy lệch thì báo Tech Lead, không tự chọn.
- **Nguồn:** Tech Lead duyệt 19/10/2026.

### 16.3 Ngoại lệ truy cập dữ liệu là nợ kỹ thuật
- **Áp dụng:** các repository trong module không kế thừa `BaseRepository` (`HrCatalogRepository`, `PrepStepRepository`, `ShipmentPlanPriceRepository`, `ShipmentPlanFeedRepository`, `LineColorSizeFeedRepository`, `BravoOrderImportRepository`, `PoAllocationRefreshRepository`), `HrLineSource` đọc thẳng `Department`, service nền tảng truy vấn thẳng `MES_Core` là nợ kỹ thuật, không phải quy tắc được phép. Code mới không lấy làm mẫu.
- **Nguồn:** Tech Lead chốt 19/10/2026. Hiện trạng: [ARCHITECTURE](../ARCHITECTURE.md) mục 10.

### 16.4 Mô hình nhánh và CI
- **Áp dụng:** `main` (bản chạy trên máy chủ), `develop` (tích hợp), `feature/<phase>-<tên>` từ `develop` gộp qua PR có CI và review, `hotfix/<tên>` từ `main` gộp về cả hai. CI viết theo cú pháp GitHub Actions ở `.github/workflows/` (chạy trên GitHub; Gitea Actions của máy chủ git nội bộ dùng lại được).
- **Phải nhớ:** áp dụng khi Tech Lead bảo bắt đầu; tới lúc đó làm trên `main`. Bước kiểm cụ thể của CI, quy định PR, kiểu gộp còn là đề xuất ([DEVELOPMENT_WORKFLOW](../DEVELOPMENT_WORKFLOW.md) mục 4).
- **Nguồn:** Tech Lead duyệt 19/10/2026.

## Bảng tra ADR

| ADR | Tên | Trạng thái ADR | Mục trong file này | Phần không còn hiệu lực |
|---|---|---|---|---|
| 0001 | Kiến trúc nền tảng | Accepted | 1.1, 1.2, 2.1, 2.2, 3.1 | Mục 4 (Demo chỉ Role × Menu + lọc nhà máy): đã đủ 5 lớp theo ADR 0005 |
| 0002 | Phân quyền theo `BranchCode` | Accepted, bị ADR 0013 thay một phần | 3.2, 3.3, 3.4; nhắc ở 3.1, 6.1 | "Nhà máy" nay là ĐVCS (ADR 0013); `A00` không còn đọc tất cả vô điều kiện mà theo phạm vi (ADR 0005); danh mục ĐVCS theo BRAVO, không thêm tay ở màn Quản trị |
| 0003 | Công nghệ cho Demo | Accepted | 1.3–1.6, 6.6, 12.1, 12.2; nhắc ở 1.2 | Mantine 7 (thực tế 9); `vite-plugin-pwa`; font Be Vietnam Pro, Inter; màu denim, navy, nút vàng gold; database `MES_Demo`; bcrypt dự phòng; trang chọn nhà máy dạng thẻ |
| 0004 | Phiên đăng nhập, trần quyền quản trị | Accepted, bị ADR 0014 thay một phần | 4.1–4.4, 5.3 | Tách nhiệm vụ không còn áp cho tài khoản `admin` (vẫn áp cho vai trò ADMIN) |
| 0005 | Phạm vi (L3), cột (L4), ngoại lệ (L5) | Accepted | 3.5–3.9, 4.4; nhắc ở 3.3, 3.4, 4.3 | Ví dụ `DemoPo`, migration `MES_Demo/0002` (đã bỏ cùng màn PO demo); chiều `LINE` theo cây tổ chức (`OrgType = 'LINE'`, cả nhánh): nay là chiều giá trị theo mã chuyền (phase 5.10, mục 3.5, 6.7) |
| 0006 | Module Đơn hàng | Accepted, bị ADR 0013 thay một phần | 3.7, 3.8, 3.10, 3.11, 7.1, 7.5; nhắc ở 3.9, 7.2 | Đơn hàng, PO lọc theo nhà máy (nay dùng chung, mục 7.2); khóa ngoại ghép kế hoạch → đơn, PO → đơn (nay theo `Id`); dữ liệu chỉ do seed sinh (nay nạp từ BRAVO) |
| 0007 | Đồng bộ qua database trung gian | Accepted | 1.2, 8.1–8.5 | "Database trung gian ở máy khác thì sửa `linkSyncSources`": nay khai `DB_TRUNGGIAN_SERVER`; "ánh xạ sang `MES_Order` làm sau": đã có nạp tăng dần (mục 7.7) |
| 0008 | Lưới nhập kiểu bảng tính | Accepted | 11.1 | – |
| 0009 | Module May, Kế hoạch chuẩn bị SX | Accepted | 9.1–9.5; nhắc ở 1.2 | – |
| 0010 | Cây Nhà máy → Xưởng → Chuyền | Accepted, bị ADR 0013 và phase 5.10 thay một phần | 6.4, 6.5; nhắc ở 4.2, 4.3 | Cấp gốc nay gọi là ĐVCS; cấp Xưởng, Chuyền, chuyển chuyền giữa xưởng, phạm vi cả xưởng: thay bằng bộ phận tích "Xưởng sản xuất" (mục 6.7) |
| 0011 | Lưới xem dữ liệu, lọc theo cột | Accepted (Tech Lead duyệt 19/10/2026) | 11.2–11.6, 7.8; nhắc ở 3.7 | Ô tìm ở cây xưởng, chuyền của Danh mục hệ thống (mục 5): danh mục đó đã bỏ |
| 0012 | Module Nhân sự | Accepted | 10.1–10.6; nhắc ở 1.2, 3.4 | Cây phòng ban tách hẳn khỏi cây sản xuất: nay bộ phận tích "Xưởng sản xuất" là chuyền may (mục 6.7, 10.2) |
| 0013 | Đơn vị cơ sở, Nhà máy SX, đơn hàng dùng chung | Accepted (Tech Lead duyệt 19/10/2026) | 6.1–6.3, 6.6, 7.2–7.8, 8.1, 8.4, 8.5, 15.2; nhắc ở 3.4, 3.6, 3.9, 4.2, 6.4, 7.1 | Mục 11 phần nhiều ĐVCS cùng đưa một PO vào kế hoạch: từ phase 5.17 mỗi PO một kế hoạch (mục 15.2), chỉ còn ở dữ liệu cũ; mục 3 (tích Nhà máy SX theo người, `productionFactoryIds`): thay bằng mục 11; mục 4 "PO chỉ thêm ở ĐVCS của đơn" (`GetOptions.sameBranch`): thay bằng mục 11; Nhà máy SX tạm cùng mã chi nhánh nhận đơn: thay bằng theo OSM (mục 9), trừ máy demo chưa có OSM; mục 10 phần Phân bổ PO chỉ Xem, Xuất file, đọc bảng chép qua lớp đồng bộ (`SourceFeedService.osmPo*`, không qua `BaseRepository`), 12 cột đăng ký: thay bằng bảng làm việc `PoAllocation`, Nhà máy SX nhập tay (phase 5.10, mục 7.9) |
| 0014 | Vai trò Toàn quyền | Accepted (Tech Lead duyệt 19/10/2026) | 5.1–5.3; nhắc ở 4.3 | – |

## Quyết định chưa khớp code

"Chưa làm": quyết định hoặc việc ADR đã định mà code chưa có. "Code khác": code làm khác lời ADR. Mỗi dòng đã đối chiếu với code hiện tại.

| # | Quyết định | Nguồn | Trạng thái | Code hiện tại |
|---|---|---|---|---|
| 1 | Lint ranh giới module (`eslint-plugin-boundaries` hoặc tương đương) | ADR 0003 | Code khác (một phần) | Dùng `no-restricted-imports` trong `backend/eslint.config.mjs`, cho `modules/order`, `sewing`, `cutting`, `hr`, và cho `src/platform/**` (nền tảng không import `modules`); không có luật cho frontend. Frontend có import chéo giữa các khối màn: `frontend/src/features/admin/CatalogsPage.tsx` dùng `features/hr/*`, `features/sewing/api`; `PrepStepsPane.tsx` dùng `features/sewing/api`; màn Cắt, Kế hoạch may dùng `features/order/common.tsx`, `features/order/api.ts` |
| 2 | Khóa ngầm có "linter" kiểm cùng script mồ côi | ADR 0001 Hệ quả | Chưa làm | Chỉ có `backend/scripts/check-softkeys.ts` (kiểm mồ côi trên dữ liệu). Không có bước nào báo cột mới trỏ sang database khác mà chưa khai trong `softkeys.json` |
| 3 | Module giao tiếp qua service công khai **và sự kiện** | ADR 0001 mục 1 | Chưa làm | Chưa có hạ tầng sự kiện; chỉ có service công khai (`ScheduleFeed`, `SourceFeedService`…) |
| 4 | Báo cáo xuyên module gom về `MES_Report` hoặc view công bố | ADR 0001 Hệ quả | Chưa làm | Chưa có module báo cáo; menu `report.*` là trang giữ chỗ |
| 5 | Menu là dữ liệu, chỉnh qua màn Quản trị | ADR 0002 | Code khác | `SysMenu` chỉ do seed tạo, đổi tên, đổi thứ tự (`backend/scripts/seed.ts`); API chỉ có `GET /admin/menus`, không có màn sửa menu. Seed chạy lại ghi đè tên, thứ tự menu hệ thống |
| 6 | `mantine-datatable` cho bảng | ADR 0003 | Code khác | Gói có trong `frontend/package.json` nhưng không file nào import; lưới xem là `DataGrid` tự viết (`frontend/src/components/DataGrid.tsx`) |
| 7 | Danh sách ĐVCS theo danh mục chi nhánh BRAVO | ADR 0013 mục 1 | Code khác (một phần) | `POST /admin/branches` (quyền `admin.branch:create`, `AdminBranchesService.create`) vẫn thêm tay được ĐVCS; giao diện không còn nút nhưng API không kiểm máy đã có đồng bộ BRAVO hay chưa |
| 8 | Mỗi lần trả cột nhạy cảm không che thì ghi `SysSensitiveReadLog` | ADR 0005 mục L4 | Code khác (một phần) | `FieldPolicyService.logSensitive` bắt lỗi khi ghi nhật ký và chỉ ghi log máy chủ: dữ liệu vẫn trả về dù không ghi được nhật ký |
| 9 | Giới hạn người giữ `admin.permission:update` theo nhóm module hoặc ĐVCS | ADR 0004 Hệ quả | Chưa làm | Người giữ quyền này cấp được mọi quyền nghiệp vụ cho mọi tài khoản (trừ chính mình) |
| 10 | Phạm vi theo phòng ban cho dữ liệu nhân sự; chốt có chặn phép gán có phạm vi ĐVCS với `hr.*` | ADR 0012 mục 5 | Chưa làm, chưa chốt | Như mô tả ở mục 10.4 |
| 11 | Nối tài khoản với nhân viên bằng `SysUser.EmployeeId` | ADR 0012 mục 4 | Chưa làm | Chưa có cột, chưa có khóa ngầm |
| 12 | Xóa bảng `SysUserProductionFactory` bằng migration sau khi chốt | ADR 0013 mục 11 | Chưa làm (chờ chốt) | Bảng còn (migration `MES_Core/0007`), code không đọc; `backend/scripts/reset-demo.ts` vẫn xóa dòng của tài khoản mẫu |
| 13 | Nút "Đồng bộ" ở Thông tin đơn hàng thay cho nhập tay; BA quyết giữ quyền thêm, sửa tay hay không | ADR 0006 Hệ quả | Chưa làm (chờ BA) | Đơn mới vào bằng nạp tăng dần sau đồng bộ ở màn Đồng bộ dữ liệu (mục 7.7); Thông tin đơn hàng vẫn cho Thêm, Sửa, Xóa tay (`order.controller.ts`) |
| 14 | Ánh xạ đơn hàng BRAVO theo đặc tả BA; xử lý đơn, PO bị xóa ở BRAVO | ADR 0013 Hệ quả, mục 8 | Chưa làm (chờ BA) | Giả định tạm trong `backend/src/modules/order/bravo-order.mapping.ts`; đơn, PO không còn ở BRAVO chỉ đếm trong log |
| 15 | Lịch tự chạy đồng bộ | ADR 0007 Hệ quả | Chưa làm (ADR ghi là việc sau) | Chỉ chạy khi bấm ở màn Đồng bộ dữ liệu; không có bộ hẹn giờ trong backend |
| 16 | Kế hoạch chuẩn bị SX: lấy ngày TH từ Kỹ thuật, Lab; phân quyền nhập TH theo bộ phận; trừ ngày nghỉ, ngày lễ | ADR 0009 Hệ quả | Chưa làm (ADR ghi là việc sau) | KH = Ngày vào chuyền − số ngày lịch |
| 17 | Chỉ mục `(BranchCode, CreatedAt)` khi bảng lớn | ADR 0011 Hệ quả | Một phần | `MES_Order/0005` có `IX_SalesOrder_CreatedAt`, `IX_SalesOrderPo_CreatedAt` (`CreatedAt`, `Id`); các bảng khác chưa có |
| 18 | Vai trò Nhân sự, Giám đốc có Xuất file ở cả hai màn Nhân sự | ADR 0012 mục 6 | Chưa làm (một phần) | Quyền `hr.orgchart:export` có trong seed nhưng Sơ đồ tổ chức không có chức năng xuất (không có endpoint, không có nút); chỉ Thông tin nhân sự có `GET /hr/employees/export` |
