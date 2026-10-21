# Tiêu chuẩn kỹ thuật

| Mục | Nội dung |
|---|---|
| Mục đích | Tiêu chuẩn về test, bảo mật, phân quyền và phạm vi dữ liệu, toàn vẹn dữ liệu, transaction, migration, nhật ký, kiểm phụ thuộc, cổng chất lượng, Definition of Done |
| Đối tượng | Dev, reviewer, AI agent; Tech Lead khi duyệt |
| Nguồn quy tắc | Luật phân quyền, an toàn AI ở [AGENTS.md](../AGENTS.md); quy trình review ở [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) |
| Đối chiếu code | Commit `98d19db` trên `main` (19/10/2026) |

Cột "Tự động" cho biết tiêu chuẩn có được công cụ kiểm không. Repo **chưa có CI và chưa có git hook**: mọi kiểm "tự động" chỉ chạy khi có người gọi lệnh (`npm run lint`, `npm test`, `npm run build`) hoặc lúc ứng dụng chạy.

## 1. Testing

### 1.1 Hiện trạng

| Bộ test | Lệnh | Phạm vi | Ghi chú |
|---|---|---|---|
| Backend | `npm test -w backend` (`jest --runInBand`) | 38 file `backend/test/*.spec.ts` | Phần lớn dựng `AppModule` thật, gọi API bằng supertest **trên SQL Server thật** theo `backend/.env`; timeout 30 giây mỗi bài |
| Frontend | `npm test -w frontend` (`vitest run`) | 36 file `frontend/src/test/*.test.ts(x)` | jsdom, API giả trong từng file, không cần backend |
| Triển khai | `npm run test:deploy` (`node --test deploy/deploy.test.cjs`) | Hàm thuần của `deploy/deploy.cjs` trên thư mục tạm | Không cần database, pm2 |
| Hiệu năng | `npm run perf -w frontend` | `frontend/src/perf/*.perf.tsx` | Chỉ in số đo, không có ngưỡng, không nằm trong `npm test` |

`npm test` ở gốc chạy backend → frontend → deploy; phần trước lỗi thì dừng. Danh sách file và nội dung từng file: [12 Dữ liệu mẫu và kiểm thử](update_docs/12-du-lieu-mau-va-kiem-thu.md).

### 1.2 Yêu cầu

| Yêu cầu | Trạng thái | Tự động |
|---|---|---|
| Luật phân quyền, lọc `BranchCode` mới phải có test (danh sách, theo Id, ghi, `A00`, ngoài phạm vi 404) | CURRENT, bắt buộc | Không (review kiểm có test) |
| Sửa lỗi `CRITICAL`/`HIGH` thì thêm test chứng minh đã sửa khi làm được | CURRENT | Không |
| Test dùng dữ liệu giả, tiền tố riêng (`TEST-…`, `TST…`, `test.…`), dọn khi xong | CURRENT | Không |
| Test migration chạy thân migration trong transaction rồi hủy | CURRENT | Có, khi chạy `npm test` |
| Ngưỡng coverage | Không có; không đặt khi chưa được duyệt | – |

Test đang bảo vệ các luật bắt buộc ([AGENTS.md](../AGENTS.md) mục 4):

| Luật | Test |
|---|---|
| Deny by default | `backend/test/auth.spec.ts` (`ENDPOINT_NOT_DECLARED`), `hr.spec.ts` |
| Lọc `BranchCode` ở danh sách, theo Id; bỏ qua `branchCode` client gửi | `backend/test/phase3.spec.ts` |
| `A00` chỉ đọc (`AGGREGATE_READ_ONLY`) | `phase3.spec.ts`, `full-access.spec.ts`, `cutting.spec.ts`, `sewing.spec.ts` |
| Không tự nâng quyền, trần quyền quản trị | `phase3.spec.ts`, `review-fixes.spec.ts` |
| Phạm vi, chính sách cột, ngoại lệ | `phase5.spec.ts`, `column-filter.spec.ts`, `sewing-plan.spec.ts`, `cutting-supply.spec.ts` |
| Phản chiếu quyền ở giao diện | `frontend/src/test/shell.test.tsx`, `session.test.ts`, `datagrid.test.tsx` |

Chưa có test tự quét mọi route để bảo đảm có khai báo quyền (lần quét tĩnh ngày 19/10/2026: 161 route đều có).

### 1.3 Bộ database test riêng

**Bắt buộc** khi `backend/.env` trỏ tới database dùng chung hoặc database có dữ liệu cần giữ. Code không có chốt chặn nào cho `npm test`: chạy nhầm sẽ ghi, sửa dữ liệu trên đúng database trong `.env`.

1. Trong một phiên terminal, đặt tên database khác cho cả 6 biến (biến của phiên thắng `.env`, `backend/src/config/env.ts`): `DB_CORE_NAME`, `DB_ORDER_NAME`, `DB_SEWING_NAME`, `DB_CUTTING_NAME`, `DB_HR_NAME`, `DB_SYNC_NAME`; thêm `SEED_SAMPLE_DATA=true`, `COOKIE_SECURE=false`.
2. Trong cùng phiên: `npm run migrate`, `npm run seed`, `npm test -w backend`.
3. Xong thì xóa đúng 6 database của bộ đó (kiểm tên trước khi xóa). Bộ đang có phiên khác dùng thì đặt tên bộ riêng.

Lệnh mẫu PowerShell và lưu ý (synonym nguồn đồng bộ, `NODE_ENV=production`): [12](update_docs/12-du-lieu-mau-va-kiem-thu.md) mục "Bộ database test riêng".

### 1.4 Lỗ hổng đã biết

| Lỗ hổng | Bằng chứng | Trạng thái |
|---|---|---|
| Lỗi kiểu trong `backend/test`, `backend/scripts` không lệnh nào bắt | `backend/jest.config.js` đặt `diagnostics: false`; `tsconfig.build.json` chỉ build `src`; script chạy bằng `tsx`; lint không bật luật type-checked | APPROVED (19/10/2026): thêm bước kiểm kiểu cho `backend/scripts`, `backend/test` (`tsc --noEmit`), chạy cả trong CI. Chưa làm: task T8 ([STATUS](current/STATUS.md)) |
| Test không có chốt chặn database | `backend/test/*` | Chờ quyết. CI dùng database tạo mới mỗi lần chạy nên không bị ảnh hưởng; chạy tay vẫn phải theo mục 1.3 |
| Màn Cắt không có test vẽ màn, chỉ có test luật thuần | `frontend/src/test/cutting-*-rules.test.ts` | Ghi nhận |

## 2. Bảo mật

| Tiêu chuẩn | Hiện trạng | Tự động |
|---|---|---|
| Bí mật chỉ ở `backend/.env` (git ignore `.env`, `.env.*`, `*.pem`, `*.key`…); `backend/.env.example` chỉ có tên biến, giá trị mẫu | CURRENT. `.env.example` có đủ mọi biến `env.ts` đọc (T11, 21/10/2026; chưa có bài test tự đối chiếu, nợ N12); `deploy.cjs` cảnh báo biến mà bản mới thêm vào `.env.example` (so với bản đang chạy) nhưng `.env` của máy chủ chưa có | `.gitignore`: có |
| `NODE_ENV=production` bắt buộc `JWT_SECRET` ≥ 32 ký tự, `DEMO_PASSWORD` ≥ 8 ký tự | CURRENT (`backend/src/config/env.ts`) | Có, lúc nạp cấu hình |
| Mật khẩu băm argon2id; tài khoản không tồn tại vẫn băm một lần (thời gian phản hồi như nhau) | CURRENT (`AuthService.login`) | Lúc chạy |
| Cookie refresh `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`, `Secure` theo `COOKIE_SECURE`; token không lưu `localStorage` | CURRENT | Lúc chạy |
| helmet; HSTS khi `COOKIE_SECURE`; không bật CORS | CURRENT (`app.factory.ts`) | Lúc chạy |
| Đầu vào qua DTO, `whitelist`; sắp xếp, lọc theo danh sách trắng | CURRENT | Lúc chạy |
| Lỗi trả về không lộ chi tiết nội bộ (500 chỉ có `traceId`) | CURRENT (`http-exception.filter.ts`) | Lúc chạy |
| Xuất CSV chặn công thức Excel | CURRENT (`ExportService`) | Lúc chạy |
| Nhật ký không chứa cột nhạy cảm | CURRENT, kiểm bằng review | Không |
| Giới hạn tần suất đăng nhập, phát hiện dùng lại refresh token | Chưa có | – |

## 3. Phân quyền và phạm vi dữ liệu

Luật: [AGENTS.md](../AGENTS.md) mục 4. Chi tiết cơ chế: [04 Phân quyền](update_docs/04-phan-quyen.md). Checklist reviewer dùng mỗi lần review (mục này là nguồn duy nhất của checklist):

- [ ] Mọi endpoint có `@Public`, `@Authenticated` hoặc `@RequirePermission`; quyền đúng hành động (đọc `view`, xuất `export`, ghi `create`/`update`/`delete`).
- [ ] `BranchCode` chỉ lấy từ token (`AuthUser`, `scopeOf(user)`), không đọc từ body, query, header.
- [ ] Dữ liệu nghiệp vụ chỉ qua lớp con của `BaseRepository`/`ChildRepository`; không SQL thô hay điều kiện phân quyền tự viết trong controller, service.
- [ ] `getById`, update, delete, xuất file, popup giá trị cũng lọc ĐVCS và phạm vi; dòng ĐVCS khác hoặc ngoài phạm vi trả 404.
- [ ] `A00` đọc được; ghi dữ liệu theo ĐVCS bị từ chối (`AGGREGATE_READ_ONLY`).
- [ ] Tài nguyên mới khai ở `backend/scripts/seed-data.ts` (`ScopeType`, bảng nguồn, chiều phạm vi, cột đăng ký, cờ nhạy cảm); bảng dùng chung có cột `BranchCode` thì khai `originBranch`.
- [ ] Dữ liệu trả về qua `FieldPolicyInterceptor` (`@FieldResource`) hoặc `FieldPolicyService.shape`; không sắp xếp, lọc, tìm, gợi ý theo cột Ẩn/Che; xuất file qua `ExportService`; dữ liệu lấy từ tài nguyên khác theo chính sách cột của tài nguyên nguồn.
- [ ] Không tự nâng quyền: không sửa vai trò, quyền, ĐVCS, phạm vi, trạng thái của chính mình; trần quyền `admin.*`; thao tác làm đổi phạm vi dữ liệu đòi `admin.permission:update`.
- [ ] Thay đổi phân quyền, đăng nhập, ghi dữ liệu quan trọng có `SysAuditLog`; đổi quyền hay phạm vi tăng phiên bản quyền trong cùng transaction.
- [ ] Module không import phần bên trong module khác, không đọc `MES_Sync`; `npm run lint` qua.
- [ ] Frontend chỉ ẩn/hiện; nút ghi ẩn ở `A00` nhưng backend vẫn chặn.

Cưỡng chế lúc chạy: `AuthGuard`, `PermissionGuard`, `FieldPolicyInterceptor`, `BaseRepository`, `ResourceRegistry` ([DATA_FLOWS.md](DATA_FLOWS.md) mục 2). Test: mục 1.2.

## 4. Toàn vẹn dữ liệu

| Tiêu chuẩn | Hiện trạng | Tự động |
|---|---|---|
| Khóa ngoại vật lý trong cùng database; bảng con có khóa ngoại ghép `(ParentId, BranchCode)` để con không khác ĐVCS với cha | CURRENT (migration) | Có, database cưỡng chế |
| Khóa ngầm giữa các database khai ở `softkeys.json`, có chỉ mục | CURRENT | Một phần: `check:softkeys` kiểm bản ghi mồ côi khi có người chạy; không có bước báo cột mới chưa khai |
| Mã danh mục không sửa (trigger hoặc kiểm ở service), không xóa vật lý | CURRENT | Có (trigger, `CODE_IMMUTABLE`) |
| Ràng buộc tổng (không lập vượt số lượng, không giảm dưới phần đã giao, đã cắt, đã cấp) kiểm trong transaction đang giữ khóa | CURRENT ([DATA_FLOWS.md](DATA_FLOWS.md) mục 4, 5) | Lúc chạy |
| `UPDATE`, `DELETE` có `WHERE`; chia lô theo giới hạn 2.100 tham số | CURRENT | Không (review) |
| Thủ tục chép đồng bộ dừng khi khóa NULL/trùng hoặc xóa quá 20% (nguồn tăng dần) | CURRENT. Nguồn chép toàn bộ chỉ chặn khi view trả 0 dòng (lỗi đã biết, [STATUS](current/STATUS.md)) | Lúc chạy |

## 5. Transaction và đồng thời

| Tiêu chuẩn | Hiện trạng |
|---|---|
| Ghi nhiều bước dùng `inTransaction` (`platform/data/transaction.ts`) | CURRENT ở module nghiệp vụ; nền tảng (`admin`, `catalog`) gọi thẳng `db.transaction()` |
| Khóa theo thứ tự đơn hàng → kế hoạch → dòng dàn chuyền → màu cỡ; `UPDLOCK` | CURRENT ([DATA_FLOWS.md](DATA_FLOWS.md) mục 4.3) |
| Deadlock 1205 thành 409 "thử lại" | CURRENT (`AllExceptionsFilter`) |
| Việc có thể chạy chồng giữa tiến trình (việc lúc khởi động, đồng bộ, chép kế hoạch sang Cắt) khóa bằng `sp_getapplock` | CURRENT |
| Không có transaction chung giữa các database: kiểm lại trước commit, chờ khóa chéo tối đa 3 giây rồi 409, ghi số tổng hợp sau commit, đánh dấu nguồn mất | CURRENT ([DATA_FLOWS.md](DATA_FLOWS.md) mục 5) |
| Một tiến trình backend (pm2 `instances: 1`); cache trong tiến trình (quyền theo phiên bản; ĐVCS, tài nguyên, chuyền 30 giây) | CURRENT. Chạy nhiều tiến trình cần rà cache trước (13 mục 1.7) |

## 6. Migration và rollback

| Tiêu chuẩn | Hiện trạng | Tự động |
|---|---|---|
| Schema chỉ đổi bằng file mới `backend/migrations/<Database>/NNNN_ten.sql`; không sửa file đã chạy | CURRENT | Không: `__MigrationHistory` chỉ lưu tên file, không checksum, sửa file cũ không bị phát hiện |
| Mỗi file một transaction, tách lô theo `GO`; file lỗi không để lại gì | CURRENT (`backend/scripts/migrate.ts`) | Có |
| Migrate chỉ chạy khi gọi `npm run migrate`, không chạy lúc backend khởi động | CURRENT | – |
| Chạy thử trên bộ database test riêng trước; migration phải chạy được trên database đang có dữ liệu thật (giá trị cũ, thời gian khóa bảng) | CURRENT | Không |
| AI chỉ tạo file; chạy lên database dùng chung khi được phép ([AGENTS.md](../AGENTS.md) mục 7) | CURRENT | Không |
| Triển khai có file migration mới: `deploy.cjs` hỏi đã sao lưu chưa, dừng bản cũ khi migrate (trừ `--online-migrate` cho migration chỉ thêm bảng, cột cho phép NULL hoặc có DEFAULT) | CURRENT ([11 Vận hành](update_docs/11-van-hanh.md)) | Có |
| Rollback: `deploy.cjs --rollback` về bản code trước; **không có migration lùi**, cần thì phục hồi sao lưu | CURRENT | – |

## 7. Nhật ký và audit

| Tiêu chuẩn | Hiện trạng |
|---|---|
| Thay đổi phân quyền ghi `SysAuditLog` bằng `AuditService.logStrict` trong cùng transaction, tăng `SysPermissionVersion`; lỗi ghi nhật ký thì hủy cả thay đổi | CURRENT |
| Đăng nhập, đăng xuất, chọn ĐVCS, đồng bộ (`SYNC_START`), ghi dữ liệu nghiệp vụ có nhật ký | CURRENT; phần lớn ghi sau commit bằng `AuditService.log`, lỗi ghi nhật ký chỉ ghi log máy chủ |
| Đọc cột nhạy cảm không che ghi `SysSensitiveReadLog` | CURRENT, lệch một phần: ghi lỗi thì vẫn trả dữ liệu (`FieldPolicyService.logSensitive`) |
| Lỗi 500 ghi log máy chủ kèm `traceId` trả cho client | CURRENT |
| Log của pm2 ở thư mục triển khai (`logs/`) | CURRENT ([11 Vận hành](update_docs/11-van-hanh.md)) |

## 8. Kiểm phụ thuộc và bảo mật thư viện

| Tiêu chuẩn | Hiện trạng | Tự động |
|---|---|---|
| Cài theo `package-lock.json` (`npm ci` khi triển khai) | CURRENT | Có (`deploy.cjs`) |
| Khóa phiên bản NestJS 11, Kysely 0.28; `react-datasheet-grid` ghim 4.11.6 | CURRENT ([AGENTS.md](../AGENTS.md) mục 3) | Không |
| TypeScript 6.0.3 | APPROVED (19/10/2026). Tech Lead xác nhận `ts-jest` đang chạy với 6.0.3 (gói ở gốc `node_modules`); `backend`, `frontend` vẫn khai `^5.9.3` và `nest build`, `tsc` của frontend dùng 5.9.3. Thống nhất ở task T3 | – |
| `npm audit` | Agent `code-reviewer` tự chạy khi review; không có lịch, không có ngưỡng | Không |
| Gỡ gói không dùng (`mantine-datatable`) | Chưa làm (câu hỏi ở [STATUS](current/STATUS.md)) | – |

## 9. Build và cổng chất lượng

| Cổng | Lệnh | Hiện trạng |
|---|---|---|
| Lint | `npm run lint`: ESLint backend (`src`, `scripts`, `test`), frontend (`src`), `deploy`; `--max-warnings 0`; luật ranh giới module ở backend | Chạy tay |
| Kiểm kiểu | `npm run build`: `nest build` (backend `src`), `tsc --noEmit` + `vite build` (frontend) | Chạy tay; `deploy.cjs` chạy build khi triển khai |
| Test | `npm test` | Chạy tay; `deploy.cjs` **không** chạy test, không chạy lint |
| Kiểm trước khi chuyển bản | `deploy.cjs`: `npm ci`, build, có `frontend/dist/index.html`, nạp `env.js` với `.env` mới, `migrate --check` khi có migration mới, chờ `/api/v1/health` | Tự động khi triển khai |
| CI | – | **Chưa có** (task T2). APPROVED (19/10/2026): GitHub Actions ở `.github/workflows/`, chạy trên GitHub (`origin`); Gitea Actions của máy chủ git nội bộ dùng lại được khi bật runner |

**Các bước CI — APPROVED (19/10/2026), chưa dựng:** chạy trên mỗi PR vào `develop`, `main`, theo thứ tự:

1. `npm ci`.
2. `npm run lint`.
3. `npm run build`.
4. Kiểm kiểu `backend/scripts`, `backend/test` (bước mới, task T8).
5. `npm test -w frontend`, `npm run test:deploy`.
6. Test backend trên SQL Server chạy trong container của job: database tạo mới mỗi lần chạy, `npm run migrate`, `npm run seed` với dữ liệu mẫu, rồi `npm test -w backend`. Không trỏ tới database nào ngoài container; `sync.spec.ts` tự bỏ qua bài cần database trung gian cùng máy; 2 bài của `catalog.spec.ts` (chép ĐVCS từ BRAVO, danh mục BRAVO chỉ xem) đòi bảng chép BRAVO có dữ liệu nên hỏng trên bộ database mới: task T2 phải xử lý (nạp dữ liệu giả vào bảng chép hoặc bỏ qua có điều kiện).

PR chỉ được gộp khi mọi bước qua ([DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) mục 4.3). Không đặt ngưỡng coverage.

## 10. Definition of Done kỹ thuật

Một task chỉ xong khi đủ các mục dưới. Cột "Kiểm bằng" nói rõ mục nào có công cụ.

| # | Điều kiện | Kiểm bằng |
|---|---|---|
| 1 | `npm run lint`, `npm run build` qua | Lệnh (chạy tay) |
| 2 | Test liên quan qua, nhất là test phân quyền và lọc `BranchCode`; luật phân quyền mới có bài test mới; test backend chạy trên bộ database test riêng | Lệnh (chạy tay) |
| 3 | Đúng [AGENTS.md](../AGENTS.md) mục 4–6: không SQL thô ngoài repository, không `BranchCode` từ client, endpoint có khai báo quyền, tài nguyên mới đã khai ở seed | Lint (ranh giới), lúc chạy (khai báo quyền), review |
| 4 | Migration (nếu có): file đã tạo, đã review; đã chạy trên database được phép hoặc đã ghi vào [STATUS](current/STATUS.md) mục việc chờ máy chủ; có khóa ngầm mới thì `check:softkeys` qua | Lệnh, review |
| 5 | Đã qua `code-reviewer`, không còn `CRITICAL`/`HIGH` mở; `MEDIUM`/`LOW` đã sửa hoặc ghi lý do ([DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) mục 3) | Review |
| 6 | Giao diện (nếu có): đã mở thử trên trình duyệt ở màn rộng và màn điện thoại theo [10 Giao diện](update_docs/10-giao-dien.md) | Thủ công |
| 7 | Tài liệu đã cập nhật theo bảng sở hữu ([DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) mục 6); quyết định mới ở [13](update_docs/13-quyet-dinh.md); trạng thái ở [STATUS](current/STATUS.md) | Review |
| 8 | Dữ liệu test, tài khoản test, bộ database test tạo ra trong lúc làm đã dọn | Thủ công |
