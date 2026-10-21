# Trạng thái hiện tại

| Mục | Nội dung |
|---|---|
| Mục đích | Nơi duy nhất ghi trạng thái: việc đang làm và kế hoạch phase, trạng thái phase, việc chờ trên máy chủ, câu hỏi mở, nợ kỹ thuật, lỗi đã biết. Đọc đầu mỗi phiên để không làm lại việc đã làm; cập nhật trước khi commit |
| Đối tượng | Mọi phiên làm việc (người, AI), Tech Lead |
| Ảnh chụp | 21/10/2026. Bản trạng thái cũ (`docs/update_docs/02-trang-thai.md`, có chi tiết từng câu hỏi trước 19/10) đã xóa: `git show 98d19db:docs/update_docs/02-trang-thai.md` |

Kế hoạch phase mới ghi ở mục 1 theo khuôn ở [DEVELOPMENT_WORKFLOW](../DEVELOPMENT_WORKFLOW.md) mục 2.1.

## 1. Đang làm

### 1.1 Chuẩn hóa tài liệu (theo `docs/DOCS_STANDARDIZATION_PLAN.md`)

| Việc | Trạng thái |
|---|---|
| Giai đoạn 1–3: kiểm kê, khảo sát code, bản đồ hợp nhất | Xong; Tech Lead duyệt các quyết định ở mục 7 |
| Đưa `docs/` vào git làm mốc | Xong: commit `98d19db`, đã lên `origin/main` |
| Giai đoạn 4: `AGENTS.md`, `CLAUDE.md`, 6 file ở `docs/`, file này; rút gọn `README.md`; sửa tài liệu module nói khác code | Xong, commit `2f3648a` |
| T4: chuyển nội dung chỉ còn ở tài liệu cũ rồi xóa 59 file (`update_docs/01`, `02`, `03`, `14`, `docs/adr/*`, `docs/phases/*`, 11 file `thiet-ke`, `review/README.md`, `yeu-cau.md`, `bao-cao/*`) | Xong, commit `2f3648a`. Bảng "đã xóa → đọc ở đâu": [update_docs/README](../update_docs/README.md) |
| Q49: dọn worktree, nhánh đã gộp | Xong: gỡ `MES-wt-511`, `MES-wt-512`, `MES-wt-r4`; xóa 8 nhánh cục bộ đã gộp (gồm `fix-cut-ratio-qty`, gỡ sau khi T12 commit). Repo chỉ còn nhánh `main` |
| T12: sửa lỗi HIGH ở Cập nhật tỷ lệ cắt (`CutRatioService.updateColorSizes` kiểm mức cột `qty` trước khi đọc PO, kể cả `lines: []`) | Xong, commit `33888e8`. Review [t12-cap-nhat-ty-le-cat.md](../review/t12-cap-nhat-ty-le-cat.md) |
| T17: sửa lỗi HIGH cùng loại ở Xếp chuyền (`LinePlanService.saveLines` kiểm mức cột `startDate` trước khi đọc kế hoạch, kể cả `lines: []`), theo mẫu T12 | Xong, commit `ba752c3`. Review [t17-xep-chuyen-ngay-bat-dau.md](../review/t17-xep-chuyen-ngay-bat-dau.md): APPROVE WITH SUGGESTIONS, 3/4 LOW đã sửa, L1 gộp vào N10. Một lần chạy chung `sewing-plan.spec.ts` + `cutting-supply.spec.ts` hỏng 4 bài, không lặp lại (3 lần sau 21/21): NEEDS VERIFICATION |
| T18: API đồng bộ dòng dàn chuyền Đã phân màu cỡ cho hệ thống khác, `GET /api/v1/order/color-size/sync?from=&to=` (người dùng yêu cầu gấp 20/10/2026, thay cho view ở `DB_TRUNGGIAN`, Q53) | Xong, commit `f7f34e0`. Review [t18-api-dong-bo-dan-chuyen.md](../review/t18-api-dong-bo-dan-chuyen.md): REQUEST CHANGES (1 HIGH, 6 MEDIUM, 7 LOW), đã sửa H1, M3, M4, M5, L1, L6; M1, M6 người dùng chốt 21/10 (Q53); M2, L5 vào nợ N11. Lint, build backend qua; `phase5.spec.ts` 57/57 trên `MES_*_T514` (5 bài mới); cả bộ backend 427 qua, 2 bỏ qua (chạy trước lượt sửa theo review). Tài liệu: [06](../update_docs/06-don-hang.md) bảng API Phân bổ màu cỡ, [13](../update_docs/13-quyet-dinh.md) mục 8.6, hướng dẫn cho Dev bên gọi [docs/tich-hop/api-dong-bo-dan-chuyen.md](../tich-hop/api-dong-bo-dan-chuyen.md) (21/10) |
| T19: sửa lỗi triển khai treo ở câu hỏi `Unlink of file '.git/objects/pack/...' failed. Should I try again? (y/n)` (máy chủ, 21/10/2026). Nguyên nhân: tiến trình `git pull` còn giữ file pack trong lúc gc tự động của `git merge` con xóa pack cũ; Windows không cho xóa, trả lời `y` không bao giờ qua. Đã tái hiện trên máy dev (Git 2.51.0.windows.1): `git pull` để lại 2 pack cũ, `git fetch` + `git merge` riêng thì không. Máy chủ chưa xác minh có chương trình khác (VS Code, TortoiseGit) cùng giữ file: NEEDS VERIFICATION | Đã sửa, commit `5f54917`: `deploy/deploy.cjs` thay `git pull --ff-only` bằng `git fetch` rồi `git merge --ff-only @{upstream}`; thêm dòng xử lý sự cố ở `deploy/huong-dan.html`; [11](../update_docs/11-van-hanh.md) bước 2. Lint `deploy`, `test:deploy` 13/13 qua. Máy chủ chỉ dùng cách mới từ lần triển khai sau khi bản sửa lên `origin` (đã lên `origin` 21/10/2026) |
| T13: kiểm body vượt 512 KB | Xong 21/10/2026. Bài mới ở `auth.spec.ts` chứng minh trước đây trả 500 `INTERNAL_ERROR`; sửa `AllExceptionsFilter` đổi lỗi `entity.too.large` của body-parser (JSON 512 KB, urlencoded 100 KB) thành 413 `PAYLOAD_TOO_LARGE` (`Errors.payloadTooLarge`, `details.limitBytes`), ghi cảnh báo vào log. Lint, build backend qua; `auth.spec.ts` 17/17 trên `MES_*_T514`. Review [t13-body-vuot-gioi-han.md](../review/t13-body-vuot-gioi-han.md): APPROVE WITH SUGGESTIONS, 7 LOW (6 đã xử lý, L4 không sửa). Tài liệu: [04](../update_docs/04-phan-quyen.md) mục 13, 14; [DATA_FLOWS](../DATA_FLOWS.md) mục 2, 8; [CODE_CONVENTIONS](../CODE_CONVENTIONS.md) mục 5; [12](../update_docs/12-du-lieu-mau-va-kiem-thu.md) |
| T11: bổ sung 8 biến vào `backend/.env.example` | Xong 21/10/2026: `NODE_ENV`, `DB_ENCRYPT`, `DB_TRUST_CERT`, `JWT_ACCESS_TTL`, `PRE_AUTH_TTL`, `REFRESH_TTL_DAYS`, `LOGIN_MAX_FAILED`, `LOGIN_LOCK_MINUTES` để trống (lấy mặc định), kèm chú thích; đối chiếu bằng script: `.env.example` khớp đủ các biến `env.ts` đọc. `test:deploy` 13/13. Review [t11-env-example.md](../review/t11-env-example.md): APPROVE WITH SUGGESTIONS (1 MEDIUM, 8 LOW): đã sửa hướng dẫn xử lý cảnh báo biến mới ở mục 3 và `huong-dan.html`, đổi `NODE_ENV` thành dòng comment `# NODE_ENV=production` (chép thêm khối mẫu xuống cuối `.env` không đè giá trị đã có), chú thích rõ cách đọc `DB_ENCRYPT`, `DB_TRUST_CERT`; bài test tự đối chiếu ghi nợ N12. Tài liệu: [11](../update_docs/11-van-hanh.md) câu sau bảng biến, [ENGINEERING_STANDARDS](../ENGINEERING_STANDARDS.md) mục 2, `deploy/huong-dan.html` |
| T10: gom `FIELD_NOT_READABLE`, `LINE_SCOPE_UPDATE_FAILED` vào `Errors` | Xong 21/10/2026: `Errors.fieldNotReadable`, `Errors.lineScopeUpdateFailed`; 4 chỗ dùng (`column-filter.ts`, `po-allocation.service.ts`, `cutting-progress.service.ts`, `permission.service.ts`) đổi sang `Errors`, bỏ hằng `LINE_SCOPE_UPDATE_FAILED`. Mã, HTTP, thông điệp, `details` giữ nguyên từng byte (review so với `HEAD`). Lint, `tsc --noEmit`, build backend qua; `column-filter`, `hr`, `po-allocation-service`, `cutting`, `phase5` 119/119 trên `MES_*_T514`. Review [t10-gom-ma-loi.md](../review/t10-gom-ma-loi.md): APPROVE WITH SUGGESTIONS, 4 LOW đã sửa. Tài liệu: [CODE_CONVENTIONS](../CODE_CONVENTIONS.md) mục 5 |
| T16: che tên khách hàng cho Trưởng chuyền ở Đồng bộ tiến độ cắt (Q51) | Xong 21/10/2026: dòng mới ở `roleFieldPolicies` (máy cài mới); migration `MES_Core/0015_mask_cutting_progress_customer.sql` cho máy đã cài (Q55): chỉ thêm khi vai trò hệ thống `LINE_LEADER` chưa có chính sách cho cột này, nhật ký `ROLE_FIELD_POLICY`, tăng phiên bản quyền. Test: `cutting-mask-migration.spec.ts` (mới, 4 bài, chạy trong transaction rồi hủy), bài mới ở `cutting.spec.ts` (che ở danh sách, popup; không dò được qua tìm nhanh, lọc, `/values`). Đã `migrate` `MES_Core_T514`; 2 bộ 22/22. Review [t16-che-khach-hang-cat.md](../review/t16-che-khach-hang-cat.md): APPROVE WITH SUGGESTIONS (3 MEDIUM, 5 LOW đã sửa). Tài liệu: [04](../update_docs/04-phan-quyen.md), [05](../update_docs/05-quan-tri-he-thong.md), [12](../update_docs/12-du-lieu-mau-va-kiem-thu.md), [13](../update_docs/13-quyet-dinh.md) mục 13.5, [15](../update_docs/15-cat.md), [ARCHITECTURE](../ARCHITECTURE.md) mục 6.2, [ENGINEERING_STANDARDS](../ENGINEERING_STANDARDS.md) mục 1.1 |
| T8: kiểm kiểu `backend/scripts`, `backend/test` | Xong 21/10/2026: lệnh `npm run typecheck` (gốc) → `tsc --noEmit -p tsconfig.json` (backend, gồm `src`, `scripts`, `test`); hiện 0 lỗi. Đã thử đặt một lỗi kiểu ở `test/`, một ở `scripts/`: lệnh báo đúng 2 lỗi, thoát mã 2 (file thử đã xóa). Thêm vào Definition of Done, các bước CI, lệnh ở `AGENTS.md` mục 8. Review [t8-typecheck.md](../review/t8-typecheck.md): APPROVE WITH SUGGESTIONS (1 MEDIUM, 6 LOW): thêm `typecheck` vào mọi danh sách kiểm; `typecheck` gốc chỉ chạy backend (đúng phạm vi Q44; frontend kiểm kiểu trong `build`); 3 điểm có từ trước ghi nợ N13, N14 và mục 8.1. Tài liệu: [ENGINEERING_STANDARDS](../ENGINEERING_STANDARDS.md) mục 1.4, 9, 10; [11](../update_docs/11-van-hanh.md) bảng lệnh, bước triển khai; [PROJECT_OVERVIEW](../PROJECT_OVERVIEW.md) mục 7; [DEVELOPMENT_WORKFLOW](../DEVELOPMENT_WORKFLOW.md) mục 3, 4 |
| T7: mọi `DELETE` trả 200 kèm `{ removed: true }` (Q42, Q52, Q54) | Xong 21/10/2026: 6 route bỏ `@HttpCode(204)` (`/order/sales-orders/:id`, `/order/cut-ratio/pos/:id`, `/order/shipment-plans/:id`, `/admin/users/:id/overrides/:overrideId`, `/admin/users/:id/field-policies/:policyId`, `/admin/roles/:id`); `DELETE /cutting/progress/:id/entries` trả `{ removed: true, removedDays, removedRows, planRemoved }`, `DELETE /admin/catalogs/work-calendars/:branchCode/days` trả `{ removed: true, deleted }`. Frontend không đổi (không chỗ nào chờ body rỗng). Lint, `typecheck`, build backend qua; 8 bộ backend liên quan 144/144 trên `MES_*_T514`, sau lượt sửa `cutting`, `catalog` 34/34; frontend `catalog-work-calendar` 7/7. Review [t7-delete-removed.md](../review/t7-delete-removed.md): APPROVE WITH SUGGESTIONS (1 MEDIUM, 4 LOW). Còn để Tech Lead biết: `removedRows` vẫn trả dù màn không đọc (giữ để không bớt trường). Tài liệu: [CODE_CONVENTIONS](../CODE_CONVENTIONS.md) mục 4.1; bảng API ở [05](../update_docs/05-quan-tri-he-thong.md), [06](../update_docs/06-don-hang.md), [15](../update_docs/15-cat.md) |
| T3: thống nhất TypeScript 6.0.3 | Xong 21/10/2026: `backend`, `frontend` khai `~6.0.3` (không tự lên 6.1 vì `typescript-eslint` 8 nhận `< 6.1.0`); bỏ 2 bản 5.9.3 lồng trong workspace khỏi `package-lock.json`, `npm ci` sạch. `@nestjs/cli` khai riêng `typescript` 5.9.3 nên npm giữ một bản trong `node_modules/@nestjs/cli`, cây `@nestjs/cli` (53 gói) chuyển từ `backend/node_modules` lên gốc, không gói nào đổi phiên bản; `nest build` dùng bản 6.0.3 của dự án. TS 6.0.3 báo 0 lỗi ở backend, frontend, không phải sửa code. `npm run lint`, `typecheck`, `build` qua; backend đủ 38 bộ: 434 qua, 2 bỏ qua (`MES_*_T514`); frontend 36 file, 295/295; `test:deploy` 13/13. Review [t3-typescript-6.md](../review/t3-typescript-6.md): APPROVE WITH SUGGESTIONS (1 MEDIUM, 4 LOW); đầu ra `nest build` bằng 6.0.3 giống từng byte bản 5.9.3 (254 file). Tài liệu: `AGENTS.md` mục 3.4, [ARCHITECTURE](../ARCHITECTURE.md) A5, [ENGINEERING_STANDARDS](../ENGINEERING_STANDARDS.md) mục 8, [PROJECT_OVERVIEW](../PROJECT_OVERVIEW.md), [10](../update_docs/10-giao-dien.md), [13](../update_docs/13-quyet-dinh.md) mục 1.3 |
| T1: sửa comment trong code trỏ tới tài liệu đã xóa | Xong 21/10/2026: 236 tham chiếu (232 dòng) trong 116 file (`backend/src`, `scripts`, `test`, `frontend/src`, `.env.example`), thêm `backend/eslint.config.mjs` (7 chỗ, gồm thông điệp lint) và trường `status` của `backend/migrations/softkeys.json` (code không đọc trường này): "ADR 00xx" thành "quyết định X.Y" (số mục của [13](../update_docs/13-quyet-dinh.md), chọn theo dòng **Nguồn** và ý của comment), `docs/thiet-ke/*.md` thành tài liệu thay ở [update_docs/README](../update_docs/README.md). Chuỗi chạy thật bị đổi: 14 tên bài test, 2 `console.warn` của script, 1 `throw new Error` trong `sync.spec.ts`, dòng chú thích migration do `sync-gen.ts` sinh. Sửa 2 comment sai đã biết (`sewing.plan` cần quyền Thêm khi lập Kế hoạch may lần đầu; logo `logo-vs.png` nền trong suốt). Không sửa 20 file migration `.sql` đã chạy (còn trích ADR: tra bảng tra ADR cuối 13, đã bổ sung mục còn thiếu). Chỉ đổi chữ: dòng bị đổi đều chứa tham chiếu cũ, trừ 2 comment trên và một dòng nối của comment nhiều dòng; `git diff --check` sạch. Lint, `typecheck`, build qua; `sync-gen.spec.ts` 20/20. Review [t1-comment-tai-lieu.md](../review/t1-comment-tai-lieu.md): APPROVE WITH SUGGESTIONS (1 MEDIUM, 9 LOW), agent đối chiếu cả 224 chỗ "ADR", không chỗ nào sai. Tài liệu: [CODE_CONVENTIONS](../CODE_CONVENTIONS.md) mục 1.3, [13](../update_docs/13-quyet-dinh.md), [update_docs/README](../update_docs/README.md) |
| T2: dựng CI GitHub Actions | Xong 21/10/2026: lần chạy đầu trên GitHub (push `f0df12b`, run `39557020051`) xanh cả hai job: `checks` 1,6 phút, `backend-test` 2,6 phút, mọi bước `success`. Số bài test trong log: chưa xem được (tải log cần đăng nhập GitHub), NEEDS VERIFICATION. Đã xóa `MES_*_CI21` (Tech Lead đồng ý). Review [t2-ci.md](../review/t2-ci.md): APPROVE WITH SUGGESTIONS (3 MEDIUM, 8 LOW). Nội dung: `.github/workflows/ci.yml`, job `checks` (`npm ci`, `npm ls typescript`, lint, build, `typecheck`, test frontend, `test:deploy`) và job `backend-test` (SQL Server 2019 trong container, mật khẩu sinh mỗi lần chạy, `migrate`, `seed` dữ liệu mẫu, test backend). `catalog.spec.ts` bỏ qua phần danh mục BRAVO khi bảng chép chưa có dữ liệu (trước đây chỉ kiểm có `MES_Sync`, nên hỏng trên database mới). Thử điều kiện CI trên bộ mới `MES_*_CI21` (không database trung gian, không OSM, `NODE_ENV` trống): trước khi sửa 37/38 bộ qua, 2 bài `catalog.spec.ts` hỏng đúng như dự kiến; sau khi sửa `catalog.spec.ts` 16/16 trên `CI21` (bỏ qua phần BRAVO) và trên `T514` (kiểm đủ). Máy này không có Docker nên chưa chạy được đúng container. NEEDS VERIFICATION tới lần chạy đầu: khác biệt Linux (phân biệt hoa thường đường dẫn import), ảnh `mssql/server:2019-latest`. Tài liệu: [ENGINEERING_STANDARDS](../ENGINEERING_STANDARDS.md) mục 9, [DEVELOPMENT_WORKFLOW](../DEVELOPMENT_WORKFLOW.md) mục 4, [ARCHITECTURE](../ARCHITECTURE.md) A6, [13](../update_docs/13-quyet-dinh.md) mục 16.4 |
| T9: chuyển phần dùng chung khỏi `features/order/common.tsx`, `features/order/api.ts` | Xong 21/10/2026 (Q46): `components/StatusBadge.tsx`, `EmptyState.tsx`, `ExportButton.tsx`, `OrderFilters.tsx`; `lib/pagedList.ts` (`usePagedList`, `OrderFilter`, `emptyFilter`), `lib/orderOptions.ts` (`useCustomers`), `lib/lines.ts` (`useLines`, `useLinesState`), `lib/notify.ts` (`loadError`), `lib/fieldPolicy.ts` (`readable`); `useCanWrite` ở `shell/permissions.ts`, `PICK_ROW` ở `components/ActionButton.tsx`; `FactoryOption` sang `lib/orderOptions.ts`. Chỉ chuyển chỗ: review so cây cú pháp, 34 khai báo trùng từng ký tự, 9 màn không đổi dòng code nào ngoài import, không sinh vòng import; `common.tsx` còn bảng trạng thái, `IssueList`, `useOriginLock`. Màn Cắt, May không còn import `features/order`. Frontend lint, `tsc`, build qua; 36 file, 295/295. Review [t9-frontend-dung-chung.md](../review/t9-frontend-dung-chung.md): APPROVE WITH SUGGESTIONS (2 MEDIUM, 8 LOW). Tài liệu: [ARCHITECTURE](../ARCHITECTURE.md) mục 5.3, 8, 10 A3; [CODE_CONVENTIONS](../CODE_CONVENTIONS.md) mục 7; [06](../update_docs/06-don-hang.md); [10](../update_docs/10-giao-dien.md); [13](../update_docs/13-quyet-dinh.md) bảng chưa khớp #1 |
| T14: `SheetGrid` dùng bản động `DynamicDataSheetGrid` | Xong 21/10/2026: đổi một chỗ ở `SheetGrid.tsx`; `handleActive` bỏ qua khi lưới báo lại cùng ô (bản động báo lại mỗi khi cột đổi, làm mất cờ đang gõ dở của chặn rời màn); giữ các ref của màn (Phân màu cỡ, Cấp phát cắt, Kế hoạch may, Nhập số cắt) vì chúng giữ cột không dựng lại mỗi phím gõ, chỉ sửa comment còn nói "bản tĩnh". Agent soát 10 màn: `columns` đều `useMemo` theo thứ không đổi mỗi phím, trừ Cập nhật tỷ lệ cắt (dựng lại khi tập ô lỗi đổi, lưới nhỏ); Kế hoạch chuẩn bị SX vẽ lại cả lưới khi đổi dòng chọn (lưới lớn nhất). Chạy thử trên Chrome (bộ `MES_*_T514`, tài khoản thử tạm): bản tĩnh có lỗi thật ở 3 màn, bản động hết: (a) Kế hoạch chuẩn bị SX không vạch dòng đang chọn; (b) Nhập nhân viên từ Excel bấm Kiểm tra báo "1 có lỗi" mà không ô nào đỏ (bản động: 4 ô đỏ, sửa ô thì về chưa kiểm); (c) Cập nhật tỷ lệ cắt có câu báo dòng trùng mà ô không đỏ. Không đổi hành vi khác: gõ ngày TH, gõ số cắt (Tổng, Lũy kế đổi ngay), Phân màu cỡ (Còn lại ô gộp, Thêm chèn dưới dòng chọn), ô Chuyền ở Chi tiết dàn chuyền, Kế hoạch may, Cấu hình chuẩn bị SX, Xác nhận cấp BTP; không lỗi console. Chưa mở lưới Kế hoạch xuất hàng (cột là hằng). Bản động còn sửa STT ở trang 2 của Kế hoạch chuẩn bị SX (bản tĩnh giữ 1..100) và ô Chuyền khi danh sách chuyền tải xong sau khi mở Chi tiết dàn chuyền: theo mã, chưa thử trên trình duyệt (bộ test chỉ 18 dòng; chưa giảm tốc mạng). Test mới `sheet-grid-props.test.tsx` (3 bài: giữ tham chiếu prop, vạch dòng chọn và STT theo prop mới, giữ cờ gõ dở khi lưới báo lại cùng ô): hỏng 3/3 khi đổi về bản tĩnh, hỏng bài cờ gõ dở khi bỏ phần chặn lặp. Chưa đo số lần vẽ bằng công cụ (kế hoạch cũ đòi "không tệ hơn bản tĩnh"): NEEDS VERIFICATION; theo mã thư viện, lưới vẽ lại mọi ô đang hiện mỗi lần `value` đổi ở cả hai bản, đổi dòng chọn ở Kế hoạch chuẩn bị SX nay vẽ 2 lần thay 1. Chưa thử màn điện thoại (lưới nhập dùng trên máy tính). Frontend lint, `tsc`, 37 file, 298/298. Review [t14-sheetgrid-dong.md](../review/t14-sheetgrid-dong.md): APPROVE WITH SUGGESTIONS (2 MEDIUM, 5 LOW). Tài liệu: [10](../update_docs/10-giao-dien.md) mục 9.3 |
| T6: áp dụng mô hình nhánh, bảo vệ nhánh | Đang làm 21/10/2026: đã tạo `develop` từ `main` và push lên `origin`. Còn lại: **Tech Lead bật bảo vệ nhánh** trên GitHub (máy dev không có GitHub CLI): Settings › Branches (hoặc Rules › Rulesets), cho cả `main` và `develop`: (1) bắt PR trước khi gộp, ít nhất 1 người duyệt; (2) bắt status check qua: `Lint, kiểm kiểu, build, test frontend và triển khai`, `Test backend trên SQL Server tạo mới` (đã có sau lần chạy đầu), nhánh phải cập nhật với nhánh đích; (3) chặn force push, chặn xóa nhánh. Settings › General › Pull Requests: bật Squash merge (feature → develop) và Merge commit (develop → main, hotfix). Xong thì báo để ghi Xong. Từ khi bật: task mới làm trên `feature/*` từ `develop` |
| Bộ database test trên máy chủ | Còn `MES_*_T514` (6 database) dùng cho các task sau. Đã xóa `MES_*_CI21` (21/10/2026, bộ thử điều kiện CI ở T2), `MES_*_T5R4`, `MES_*_Test` (20/10/2026); Tech Lead đồng ý từng lần |
| Giai đoạn 5: kiểm liên kết, tính nhất quán | Xong (kết quả trong báo cáo của phiên) |
| T15: bổ sung tài liệu module còn thiếu so với code (`04`–`08`, `10`–`12`, `15`) | Xong, commit `672f0a3`. Kết quả, điểm còn NEEDS VERIFICATION: mục 8.2 |

Làm trên `main` theo chỉ đạo 19/10/2026 ("theo dõi trên nhánh main trước") tới hết loạt T1–T16; từ T6 (21/10/2026) có `develop`, task mới đi qua `feature/*` và PR. Mục đích đợt này: chốt, chuẩn hóa source và tài liệu, không xây tính năng mới (Tech Lead 20/10/2026). Sửa code gồm các lỗi lệch quy tắc đã duyệt (T12, T17), lỗi triển khai (T19) và API người dùng yêu cầu gấp (T18, Q53); không đổi database thật, CI/CD.

### 1.2 Việc tiếp theo đã duyệt, chưa làm

Tech Lead 19/10/2026: các việc sửa code làm **sau khi chốt tài liệu**, mỗi việc một task. Tech Lead 21/10/2026: làm tiếp T1–T16 trên `main` ở thư mục MES (không có phiên khác cùng sửa); mỗi task xong (lint, build, test, review) thì một commit riêng, chưa push; T6 làm cuối, sau khi CI (T2) chạy được trên GitHub, hỏi trước mỗi lần push hay đổi cài đặt GitHub; **bỏ T5** (giữ tên tài liệu module hiện tại). Thứ tự làm: T13, T11, T10, T7, T16, T8, T3, T1, T9, T14, T2, T6.

| # | Việc | Ghi chú |
|---|---|---|
| ~~T5~~ | ~~Đổi tên, chuyển chỗ tài liệu module `docs/update_docs/*`~~ | Bỏ (Tech Lead 21/10/2026): giữ tên hiện tại |

### 1.3 Phase 5.18: Phân cụm trưởng

Ready for review 21/10/2026 (code, test, review xong; **chưa commit**), nhánh `feature/5.18-phan-cum-truong` (từ `develop`). Người dùng yêu cầu 21/10/2026 (ngoài đợt chuẩn hóa), ảnh mẫu `docs/screens/phan-cum-truong.png`. Quyết định liên quan: [13](../update_docs/13-quyet-dinh.md) mục 1.2, 3.3, 3.5, 9.1, 10.3, 12, 16.3.

**Mục tiêu** (đầu vào: Cập nhật cụm, Phân tổ trưởng; đầu ra: Nhập năng suất cụm). Dữ liệu đầu vào sẽ lấy từ GSD, người dùng tích hợp sau; phase này dựng màn và luồng lưu trên dữ liệu giả lập.
1. Màn `/sewing/cluster` (tài nguyên `sewing.cluster`, đang là trang giữ chỗ) theo bố cục ảnh mẫu: Chọn tổ, Chọn mã hàng, bảng STT · Tên cụm · Tên cụm trưởng, nút Lưu. Dùng được trên điện thoại (menu đã đánh dấu điện thoại).
2. Tổ: lấy từ cây sơ đồ tổ chức (tổ là chuyền may, mã bộ phận). Người đăng nhập là tổ trưởng (theo dữ liệu Phân tổ trưởng, qua nhân viên gắn với tài khoản) chỉ thấy tổ mình và sửa được; người không phải tổ trưởng thấy mọi tổ trong phạm vi, chỉ xem. Luôn giao với phạm vi quyền (ĐVCS, chuyền).
3. Chọn mã hàng: mã hàng đã được phân cụm cho tổ (mã hàng + chuyền ở dữ liệu Phân cụm). Tên cụm: danh sách cụm của mã hàng ở tổ, hiện tên, lưu mã.
4. Tên cụm trưởng: nhân viên đang làm việc (khác nghỉ việc), tìm theo mã hoặc tên không dấu, hiện "Tên - Mã - Phòng ban"; lưu `EmployeeId` kèm mã chụp lúc lưu.
5. Máy chủ cưỡng chế: quyền `sewing.cluster`, ĐVCS, phạm vi chuyền, `A00` chỉ đọc, chỉ tổ trưởng của tổ mới lưu, chính sách cột của cột Tên cụm trưởng; ghi nhật ký.

**Chốt với người dùng**

| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Màn biết người đăng nhập là tổ trưởng tổ nào bằng cách nào? | Người dùng chọn 21/10/2026: nối tài khoản với nhân viên bằng cột mới `SysUser.EmployeeId` (quyết định 10.3). Tổ = dữ liệu Phân tổ trưởng của nhân viên đó, giao với phạm vi quyền. Seed gắn tài khoản mẫu; ô gắn nhân viên ở Quản trị › Người dùng làm ở 5.18.5 |
| Q2 | Người có quyền xem mà không phải tổ trưởng thấy gì? | Người dùng chọn: mọi tổ trong phạm vi, chỉ xem; chỉ tổ trưởng của tổ đó lưu được |
| Q3 | Cụm trưởng lưu gì ("view tên lưu mã" so với quyết định 10.3)? | Người dùng chọn: khóa `EmployeeId`, chụp kèm mã nhân viên lúc lưu; màn hiện theo hồ sơ hiện tại |
| Q4 | Dữ liệu giả lập Phân cụm, Phân tổ trưởng đặt ở đâu? | Người dùng chọn: bảng ở `MES_Sewing` có cột nguồn (`SourceSystem`, `SourceKey`); `npm run seed` sinh mẫu (`SourceSystem = 'DEMO'`). Khi nối GSD: đồng bộ GSD → `MES_Sync`, rồi chép vào các bảng này (như Kế hoạch chuẩn bị SX chép dàn chuyền), màn và luồng lưu không đổi |
| Q5 | Trưởng chuyền không có quyền `hr.employee`, lấy danh sách nhân viên cho ô Tên cụm trưởng từ đâu? | Tự chọn (người dùng có thể đổi): tài nguyên mới `hr.directory` "Danh bạ nhân viên" (`SHARED`, bảng `Employee`, không có menu) đi qua `BaseRepository`, chỉ trả mã, tên, phòng ban, tình trạng. Module Nhân sự đăng ký nguồn vào nền tảng (`EmployeeDirectoryService`, như `LineSource`), không đọc thẳng bảng (quyết định 16.3). Ma trận mẫu: Xem cho Quản trị, Giám đốc, Kế hoạch, Trưởng chuyền, Nhân sự (Toàn quyền theo luật chung) |
| Q6 | Giao diện theo ảnh mẫu tới đâu? | Tự chọn: bố cục theo ảnh; màu, chữ theo design system đã chốt (quyết định 12), không chép khung xanh đậm, tiêu đề đỏ |
| Q7 | Một nhân viên làm cụm trưởng nhiều cụm? Bỏ cụm trưởng? | Tự chọn: không chặn; nút × ở ô bỏ cụm trưởng (cụm về chưa phân) |
| Q8 | Cột đăng ký chính sách cột | Tự chọn: chỉ `leaderEmployeeId` (Tên cụm trưởng), cột nhập duy nhất của màn |
| Q9 | Cấu trúc bảng | Tự chọn: `SewingTeam` (tổ, bảng nguồn của `sewing.cluster`, phạm vi `FACTORY` → `BranchCode`, `LINE` → `LineCode`), bảng con `SewingTeamLeader` (Phân tổ trưởng) và `SewingTeamCluster` (Phân cụm: mã hàng, cụm, thứ tự; cột nhập cụm trưởng). Lý do: một tài nguyên một bảng nguồn, mọi đọc ghi qua `BaseRepository`/`ChildRepository` |
| Q10 | Dữ liệu mẫu | Tự chọn: thêm tài khoản mẫu `totruong.a` (Trưởng chuyền, A01, phạm vi chuyền A01-L01, A01-L02) là tổ trưởng hai tổ; `truongchuyen.a`, `truongchuyen.b` gắn nhân viên tổ trưởng A01-L03. Mỗi tổ mẫu 2–3 mã hàng (lấy mã hàng đã xếp chuyền nếu có), mỗi mã 8–10 cụm theo ảnh mẫu |
| Q11 | Phân cụm trưởng có ngày hiệu lực? | Tự chọn: không; mỗi cụm một cụm trưởng hiện tại, lịch sử ở Nhật ký |
| Q12 | Một nhân viên gắn nhiều tài khoản? | Tự chọn sau review M4: không; chỉ mục duy nhất có lọc (`MES_Core/0017`), gắn trùng thì 409 nêu tài khoản đang giữ |
| Q13 | Chữ nút lưu | Tự chọn: "Lưu" theo ảnh mẫu (như "Cập nhật" của Kế hoạch may), khác quy tắc "Lưu thay đổi" (10 mục 12.A3) |

**Task**

| # | Việc | Trạng thái |
|---|---|---|
| 5.18.1 | Nền: `MES_Core/0016` (`SysUser.EmployeeId`), `0017` (một nhân viên một tài khoản), tra nhân viên của tài khoản, danh bạ nhân viên (`hr.directory`, `EmployeeDirectoryService`, `HrEmployeeSource`), seed nhận tài nguyên không có menu; khóa ngầm | Xong 21/10/2026; `0016`, `0017` đã chạy trên `MES_Core_T514` |
| 5.18.2 | `MES_Sewing/0005`: `SewingTeam`, `SewingTeamLeader`, `SewingTeamCluster`; `sewing.cluster` gắn bảng, phạm vi, cột; dữ liệu mẫu (seed, `reset:demo`); khóa ngầm | Xong 21/10/2026; migrate, seed đã chạy trên `MES_*_T514` (26 tổ, 702 cụm, 21 nhân viên mẫu, tài khoản `totruong.a`, gắn 3 tài khoản mẫu; sau review bỏ 17 tổ trưởng tự chọn, còn 4 tổ trưởng ở `A01-L01`..`L03`). `reset:demo` chưa chạy thử: chỉ chạy trên SQL Server của máy này, `.env` trỏ máy chủ (NEEDS VERIFICATION) |
| 5.18.3 | API `/sewing/cluster` (tổ, mã hàng, cụm, tìm nhân viên, lưu) và test backend | Xong 21/10/2026: `cluster-leader.spec.ts` 13/13 (`MES_*_T514`) |
| 5.18.4 | Màn Phân cụm trưởng, test frontend, chạy thử trên Chrome (máy tính, điện thoại) | Xong 21/10/2026: `cluster-leader.test.tsx` 9/9; frontend 38 file, 307/307; thử trên Chrome 1280×800, 1093×560, 390×844, chế độ tối (tài khoản thử tạm `ui518` trên T514, đã vô hiệu) |
| 5.18.5 | Gắn nhân viên cho tài khoản ở Quản trị › Người dùng (API, giao diện, nhật ký, không tự gắn cho mình) và test | Xong 21/10/2026: `PUT /admin/users/:id/employee`, `GET /admin/users/employee-options`, `UserEmployeeDialog.tsx`; test trong hai file test của phase |
| 5.18.6 | Tài liệu (07, 08, 05, 12, 13, ARCHITECTURE, PROJECT_OVERVIEW), review `code-reviewer`, STATUS | Xong 21/10/2026: tài liệu 04, 05, 07, 08, 10, 11, 12, 13 (10.3, 10.7, 3.3, mục 17 mới), ARCHITECTURE, DATA_FLOWS, PROJECT_OVERVIEW; review [phase-5-18.md](../review/phase-5-18.md): APPROVE WITH SUGGESTIONS (4 MEDIUM, 8 LOW), đã sửa 4 MEDIUM, 6 LOW; lint, typecheck, build qua; cả bộ backend sau lượt sửa 39 bộ, 447 qua, 2 bỏ qua (`MES_*_T514`); `check:softkeys` trên T514: các khóa mới OK, 3 giá trị mồ côi có sẵn ở `SewingPrep` (bản chép Kế hoạch chuẩn bị SX, chép lại khi mở màn), không thuộc phase này |

**Phạm vi review:** `backend/migrations/MES_Core/0016_*`, `MES_Sewing/0005_*`, `softkeys.json`; `backend/src/platform/org/*`, `platform/admin/admin-users.service.ts`, `admin.dto.ts`, `admin.controller.ts`, `platform/database/core.types.ts`; `backend/src/modules/hr/` (danh bạ, `hr.module.ts`); `backend/src/modules/sewing/cluster-*`, `sewing.module.ts`, `sewing.types.ts`; `backend/scripts/seed-data.ts`, `seed.ts`, `cluster-data.ts`, `reset-demo.ts`; test backend mới; `frontend/src/features/sewing/ClusterLeader*`, `features/admin/UsersPage.tsx`, `routes/registry.tsx`, test frontend mới.

**Không làm:** nối GSD thật (đồng bộ, đối chiếu mã chuyền, nhân viên của GSD với MES); màn Phân tổ trưởng, Cập nhật cụm trong MES; Bấm năng suất cụm; xuất file; hiệu lực theo ngày; ẩn menu theo dữ liệu tổ trưởng (menu vẫn theo quyền).

**Rủi ro, phát sinh**
- Đợt từ 19/10/2026 là chuẩn hóa, không xây tính năng mới (Tech Lead 20/10/2026); phase này do người dùng giao 21/10/2026.
- Tài khoản chưa gắn nhân viên thì chỉ xem; quản trị gắn ở Quản trị › Người dùng.
- ~~Seed gắn lại tài khoản đã gỡ, thêm nhân viên giả vào bảng có dữ liệu thật (review M2, M3)~~: đã sửa.
- Câu hỏi mới: Q56, Q57 (mục 4.1).
- Nối GSD cần bảng đối chiếu mã tổ, mã nhân viên của GSD với mã bộ phận, `Employee.Id` của MES.
- Tổ trưởng ở GSD mà không có phạm vi chuyền tương ứng ở MES thì không thấy tổ (giao hai lớp): cần quy trình gán phạm vi cho tổ trưởng.
- `hr.directory` mở mã, tên, phòng ban của nhân viên đang làm cho vai trò sản xuất (Q5): mức nhạy cảm thấp, cần Tech Lead xác nhận.

## 2. Trạng thái phase

Git (21/10/2026): mọi code của các phase dưới đây và các task T4, T12, T15, T17–T19 đã commit trên `main`; `main` trùng `origin/main` ở `5f54917` (T19). `origin` chỉ còn nhánh `main`; máy này chỉ còn nhánh `main`, không còn worktree. `githq5/main` lần đọc gần nhất ở `24301de` (21/10/2026 không đọc được `githq5`: lỗi xác thực). Nhánh `feature/docs-chuan-hoa` trên `origin` đã xóa (Q50). Trạng thái duyệt theo bản trạng thái cũ, cập nhật theo Tech Lead 19/10/2026.

| Phase | Nội dung | Trạng thái | Còn lại |
|---|---|---|---|
| 0–4 | Nền móng, khung backend, frontend, phân quyền động, hoàn thiện demo | Approved | – |
| 5.1 | Phạm vi, chính sách cột, ngoại lệ; vai trò Toàn quyền | Ready for review | Chưa làm: giới hạn tần suất đăng nhập, phát hiện dùng lại refresh token, hạn tuyệt đối của phiên |
| 5.2 | Đồng bộ BRAVO qua database trung gian | Ready for review (trừ 5.2.8) | 5.2.8 ánh xạ đơn hàng BRAVO theo đặc tả BA (đang giả định tạm) |
| 5.3 | Module Đơn hàng | Ready for review | Quy tắc tạm chờ BA |
| 5.4 | Danh mục hệ thống | Ready for review | Phần Xưởng, Chuyền đã thay ở 5.10 |
| 5.5 | Kế hoạch chuẩn bị SX | Ready for review | Chờ BA |
| 5.6 | Lưới xem dữ liệu, lọc theo cột | Ready for review | – |
| 5.7 | Hiệu năng frontend | Ready for review | – |
| 5.8 | Sơ đồ tổ chức, Thông tin nhân sự | In progress | Người dùng kiểm trên app; chốt Q11 |
| 5.8.9 | Danh mục Loại phòng ban | Code có, test backend có | Chưa có test frontend; chưa ghi kết quả review |
| 5.9 | ĐVCS, Nhà máy SX, nạp tăng dần BRAVO, Phân bổ PO, khung PO, khung Màu cỡ của kế hoạch | In progress | Kiểm trên app; Q33, Q34 |
| 5.10 | Nhà máy SX nhập tay ở Phân bổ PO; chuyền may là bộ phận "Xưởng sản xuất" | Ready for review | – |
| 5.11 | Màn đăng nhập, màu giao diện theo ảnh mẫu | In progress | 5.11.4 (rà từng màn), 5.11.5 (tài liệu, review); logo, ảnh nền là bản tạm |
| 5.12, 5.12.1–5.12.3 | Lịch làm việc theo ĐVCS; công thức ngày dàn chuyền; năm ngày sửa tay; làm tròn Số ngày SX | Ready for review | Q35, Q38, Q39 |
| 5.13 | Phân bổ màu cỡ theo kế hoạch | Approved | – |
| 5.13.1, 5.13.2 | NSBQ trung bình; sửa bố cục Cập nhật tỷ lệ cắt | Ready for review | – |
| 5.14 | Đồng bộ tiến độ cắt, LK cắt (13.6), Lũy kế không vượt Kế hoạch (13.7) | Approved (Tech Lead xác nhận 19/10/2026) | Q36 |
| 5.15 | Xác nhận cấp BTP | Ready for review | Q37 |
| 5.16 | Kế hoạch may, Giá CM | Ready for review | – |
| 5.17 | Mỗi ĐVCS một KHXH mỗi đơn, mỗi PO một kế hoạch | Ready for review | Q40, Q41 |
| 5.18 | Phân cụm trưởng (dữ liệu GSD giả lập) | Ready for review (chưa commit) | Mục 1.3; Q56, Q57 |
| Triển khai | `deploy/deploy.cjs` không hạ web | Ready for review | Q32 |

QMS, Hoàn thiện, Báo cáo, Quản lý in thêu, các màn May còn lại: chưa bắt đầu.

Kết quả kiểm tra gần nhất: cả bộ backend 427 bài qua, 2 bỏ qua (T18, 20/10/2026, bộ `MES_*_T514`, chạy trước lượt sửa theo review); frontend 36 file, 295 bài (phase 5.17 tự ghi).

## 3. Máy chủ

Tech Lead xác nhận 19/10/2026: máy chủ chạy bản mới nhất kéo từ `origin`, Node.js 22; mọi việc chờ trên máy chủ của các phase tới 5.17 (migrate, seed Toàn quyền, `JWT_SECRET`, gắn ĐVCS cho nhà máy, chuyền may, `MES_Cutting`, chuyển sang `deploy.cjs`, khai lịch làm việc, Giá CM) đã làm xong. Sau đó (21/10/2026): có việc chờ do các task chuẩn hóa, ghi ở các dòng dưới.

- Cờ `BRAVO_ORDER_IMPORT` trên máy chủ chỉ bật, tắt khi Tech Lead bảo ([AGENTS.md](../../AGENTS.md) mục 7).
- Dàn chuyền lưu trước 5.12.1 giữ ngày theo cách tính cũ tới khi người dùng bấm "Tính lại theo công thức" rồi Lưu.
- 20/10/2026, người dùng yêu cầu: đã tạo database `DB_TRUNGGIAN` (mặc định của máy, chủ sở hữu là tài khoản ứng dụng) và view `dbo.vMES_XepChuyen_DaPhanMauCo` trên SQL Server 10.0.0.216 (`VSC-DC03\MES_VSN`). Ngoài migration, `npm run migrate` không biết tới. Khác với database trung gian BRAVO (`DB_TRUNGGIAN_NAME` = `BRAVO_TRE`, máy 10.0.0.225). Cùng ngày người dùng chuyển sang API (T18). Người dùng 21/10/2026: **để yên** database, view này; mục tiêu sau là linked server, đang gặp sự cố (Q53).
- T18 (API đồng bộ dàn chuyền) khi triển khai: không có migration, seed. Người dùng 21/10/2026: không tạo vai trò riêng; bên gọi dùng một tài khoản MES có vai trò sẵn có với `order.colorsize:view` và `order.colorsize:export` (thiếu `:view` thì mất mọi quyền khác của tài nguyên, bị 403), ví dụ Giám đốc (chỉ xem, xuất); gán ĐVCS `A00` (đọc mọi ĐVCS theo phạm vi phép gán) hoặc từng ĐVCS. Chạy HTTP (người dùng chấp nhận). Gửi cho Dev bên gọi: [docs/tich-hop/api-dong-bo-dan-chuyen.md](../tich-hop/api-dong-bo-dan-chuyen.md), kèm địa chỉ máy chủ và tài khoản.
- T11 khi triển khai: không có migration. Lần triển khai đầu sau T11, `deploy.cjs` in cảnh báo (không dừng) các biến bản mới thêm vào `backend/.env.example` mà `shared\.env` chưa có. `DB_ENCRYPT`, `DB_TRUST_CERT`, `JWT_ACCESS_TTL`, `PRE_AUTH_TTL`, `REFRESH_TTL_DAYS`, `LOGIN_MAX_FAILED`, `LOGIN_LOCK_MINUTES`: không cần thêm, để trống là giữ mặc định như trước. Danh sách có `NODE_ENV`: máy chủ đang không chạy chế độ production, thêm `NODE_ENV=production` rồi `--sync-env` (`deploy/huong-dan.html` mục 3). NEEDS VERIFICATION: chưa đọc `.env` của máy chủ.
- T16 khi triển khai: migration `MES_Core/0015` (chỉ thêm dữ liệu; `deploy.cjs` tự chạy `migrate`, chạy được với `--online-migrate`), có hiệu lực ngay khi commit vì code che cột đã có từ 5.14; không cần nhập liệu sau triển khai. Vai trò Trưởng chuyền trên máy chủ đã có mức khác cho cột Khách hàng ở màn này thì giữ nguyên.

- Phase 5.18 (Phân cụm trưởng) khi triển khai (chưa gộp, chưa commit): migration `MES_Core/0016_user_employee` (thêm cột), `0017_user_employee_unique` (chỉ mục duy nhất) và `MES_Sewing/0005_cluster_leader` (thêm bảng), bản cũ còn chạy không đọc, chạy được trước khi deploy (`--online-migrate`). `migrate` tự nạp tài nguyên mới `hr.directory` (Xem cho Quản trị, Giám đốc, Kế hoạch, Trưởng chuyền, Nhân sự, Toàn quyền) và gắn bảng `SewingTeam` cho `sewing.cluster`. Máy chủ không dữ liệu mẫu nên **không có tổ, cụm nào**: màn báo chưa có dữ liệu Phân cụm tới khi nối GSD (hoặc khi Tech Lead cho chạy seed dữ liệu mẫu). Sau triển khai: quản trị gắn nhân viên cho tài khoản tổ trưởng ở Quản trị › Người dùng.

Thêm việc mới cho máy chủ: ghi ở đây, kèm migration, có dừng bản cũ khi migrate không, việc nhập liệu sau triển khai.

## 4. Câu hỏi mở

### 4.1 Chờ Tech Lead, người dùng

Đã trả lời: Q2, Q4, Q5, Q42–Q50 (19/10/2026), Q51, Q52 (20/10/2026), Q53, Q54, Q55 (21/10/2026) (mục 7).

| # | Câu hỏi |
|---|---|
| Q6 | Tách quy tắc "PO trong kế hoạch ghi được" thành quyết định riêng? |
| Q7 | Hướng metadata-driven (`docs/thiet-ke/de-xuat-metadata-driven.html`): chưa chốt; đề xuất ghi "ADR 0012" nhưng số này đã là ADR Nhân sự |
| Q8 | Xóa bảng `SysUserProductionFactory` bằng migration? |
| Q9 | Giữ hay bỏ vai trò `ADMIN_EDIT` trên máy chủ? |
| Q10 | ĐVCS `A06` không có trong BRAVO: giữ hay tắt? Giữ `POST /admin/branches` không? |
| Q11 | Phạm vi ĐVCS không có tác dụng với dữ liệu nhân sự (`hr.*`): chốt? |
| Q12 | Quyền seed cấp mà không có chức năng (`admin.user:delete`, `admin.audit:export`, `hr.orgchart:export`): bỏ quyền hay làm chức năng? |
| Q13 | Menu chỉ do seed quản lý, hay làm màn sửa menu? |
| Q16 | Màn đặt hạn dùng phép gán, màn xem nhật ký đọc dữ liệu nhạy cảm, quy định dọn `SysUserSession`? |
| Q17 | Màn tự đổi mật khẩu, bắt đổi mật khẩu lần đầu? |
| Q19 | Vai trò Nhân sự có sửa được Loại phòng ban không? |
| Q20 | Lịch tự đồng bộ BRAVO, OSM? |
| Q21 | Lập kế hoạch xuất hàng cần thêm quyền xem `order.po`: đúng ý? |
| Q22 | Đặt cột "Ngày bắt đầu SX" Chỉ đọc là khóa cả Xếp chuyền: có chủ ý? Từ T17 máy chủ cưỡng chế đủ điều này (cả `lines: []`). Nếu không chủ ý thì phải đổi cùng lúc 3 chỗ: kiểm ở `LinePlanService.saveLines`, `canEdit` ở `LinePlanPage.tsx`, `startDate` bắt buộc trong `ScheduleLineDto` |
| Q23 | Dàn chuyền mô phỏng chọn đơn theo Chi nhánh FOB: cần sửa? |
| Q24 | Mã hàng bị Ẩn/Che thì 4 ô số liệu của Chuẩn bị SX hiện "–": đồng ý? |
| Q25 | Bảng ở các màn Quản trị chuyển sang `DataGrid`? |
| Q26 | Popup Chọn mã hàng chưa áp chính sách cột của `order.po` ở giao diện: sửa? |
| Q27 | Lọc Nhà máy SX theo từng nhà máy trong danh sách; cột Chi nhánh trong file xuất Tỷ lệ cắt? |
| Q28 | PWA (service worker, HTTPS)? Gỡ `mantine-datatable`? Trình duyệt ở nhà máy? |
| Q29 | Luật lint ranh giới cho frontend `features/*`? |
| Q30 | HTTPS, reverse proxy cho máy chủ |
| Q31 | Đổi ĐVCS của phòng ban có lan xuống nhánh con không? |
| Q32 | pm2 tự chạy khi khởi động máy bằng cách nào, tài khoản nào? |
| Q33 | Khung dưới Kế hoạch xuất hàng: giữ cả "Màu cỡ" và "PO"? Số lượng gốc theo lúc lưu hay theo PO hiện tại? |
| Q34 | Siết quyền `/shipment-plans/draft`, `/candidates` |
| Q35 | Lịch làm việc: chép ngày nghỉ từ năm trước/ĐVCS khác; nút "Cách tính ngày" |
| Q36 | Chặn giảm SL màu cỡ dưới Lũy kế cắt? |
| Q37 | Chặn giảm số cắt dưới số BTP đã cấp? |
| Q38 | Ngày bắt đầu vào chuyền có là ngày bận? Lệnh tính lại hàng loạt? |
| Q39 | (cần BA) thứ tự ngày nhập tay, nút tính lại bỏ qua dòng Đang may/Đã xong, chính sách cột cho 4 cột ngày |
| Q40 | Sửa `seed-order.ts`, `sim:board` theo quyết định 15.1, 15.2? |
| Q41 | Thêm PO khi Sửa theo cùng điều kiện lập mới: đúng ý? |
| Q56 | Phân cụm trưởng (5.18): tổ trưởng vắng thì ai phân cụm trưởng thay (hiện không ai, kể cả Toàn quyền)? Người vừa là tổ trưởng vừa có vai trò xem rộng (Quản đốc, Kế hoạch) hiện chỉ thấy tổ mình: có cần xem cả các tổ khác (chỉ đọc)? |
| Q57 | Xác nhận các điểm tự chọn của phase 5.18 (STATUS mục 1.3): Q5 tài nguyên `hr.directory` (Trưởng chuyền tra được mã, tên, phòng ban nhân viên đang làm toàn công ty), Q9 cấu trúc bảng, Q12 một nhân viên một tài khoản, Q13 nút "Lưu" theo ảnh |

### 4.2 Chờ BA

- Ánh xạ đơn hàng BRAVO (5.2.8): đặc tả chính thức; xử lý đơn, PO bị xóa ở BRAVO; ngày tạo lấy ngày chứng từ hay lúc nạp. Câu hỏi chi tiết: `docs/thiet-ke/anh-xa-bravo-don-hang.html`.
- Ghép OSM theo mã hàng: `DM_SanPhamDonHang.StyleName` hay `StyleName_OSM`.
- Quy tắc tạm của Đơn hàng: làm tròn số ngày SX, số ngày ra chuyền, nhập kho 3/3/2/5; lũy kế may, Endline, hoàn thiện chỉ do seed, mô phỏng điền; ràng buộc Loại, Đơn vị tính vào danh mục.
- Kế hoạch chuẩn bị SX: ngày KH theo ngày lịch hay ngày làm việc; quy tắc trạng thái; nguồn của Loại mã, Số lượng chốt UD, HS Ưu đãi VC; ai nhập TH từng bước.
- Danh mục thật: chức danh, loại phòng ban, danh mục lỗi, ca làm việc theo nhà máy.
- Từ điển chỉ số (sản lượng cắt, tỷ lệ cắt, năng suất cụm, cân bằng chuyền, DHU, tiến độ, doanh thu): mỗi chỉ số tính ở một tầng, công thức do BA chốt trước khi làm module tương ứng.
- File đầu vào: Tech Lead đưa dần vào `docs/nguon/ba/`. Điều kiện đầu vào của mỗi module: tài liệu BA đầy đủ (công thức, tiêu chí nghiệm thu) bàn giao trước ít nhất 1 tuần.

### 4.3 Phía BRAVO, hạ tầng, theo dõi

- Cấp `EXECUTE` hàm `ufn_Agg_Concat` cho tài khoản đọc của MES nếu nguồn `vDM_KHACHHANG`, `vDM_DiaDiemGiaoHang`, `vThongTinPO`, `vThongTinPO_MauCo` báo lỗi quyền.
- `sp_refreshview` các view lệch độ dài cột (`vDM_DiaDiemGiaoHang.Address`); bảng chép vẫn `NVARCHAR(192)` (`MES_Sync/0002`).
- Đo tốc độ chép qua linked server; nguồn `vBaoCao_OSM_XuatHang` chưa đưa vào đồng bộ.
- **Theo dõi:** theo khảo sát 10/10/2026, tài khoản ứng dụng vẫn có quyền đọc thẳng database BRAVO thật; nguyên tắc "chỉ đọc database trung gian" mới được bảo đảm ở code. Tech Lead 19/10/2026: ứng dụng đấu nối nội bộ, chỉ ghi lại để theo dõi.

## 5. Lộ trình chưa lên lịch

Chuyển từ kế hoạch lộ trình sau demo (`git show 98d19db:docs/phases/phase-5-sau-demo.md`). Chưa có ngày, chưa duyệt chi tiết.

| Việc | Khi |
|---|---|
| Module Cắt còn lại (in thêu), May (phân cụm, bấm năng suất, WebSocket realtime), Endline/QMS, Hoàn thiện, Báo cáo | Theo tài liệu BA |
| Tách login database của ứng dụng với login chạy migration; `DENY UPDATE, DELETE` trên `SysAuditLog`; `DB_ENCRYPT` theo môi trường | Bắt buộc trước UAT |
| Máy chủ Production không dùng Windows 10 (hết hỗ trợ 10/2025) | Trước UAT |
| VPN/Wifi Site-to-Site; hiệu năng, sao lưu, phục hồi, runbook | Giai đoạn ổn định, triển khai |
| Lưu phiên bản dữ liệu chuẩn (định mức, sơ đồ chuyền) cho từng PO, lệnh: định mức đổi không đổi lịch sử | Khi làm module dùng định mức |
| Ghi vết bảng sản lượng bằng trigger database hay tầng ứng dụng | Trước module sản lượng |
| Gói `shared` dùng chung kiểu dữ liệu backend, frontend; checksum migration; bắt lỗi unique trả 409 (còn sót ở `prep-step.service.ts`) | Chưa lên lịch |

## 6. Nợ kỹ thuật

| # | Nợ | Ghi chú |
|---|---|---|
| N1 | 7 repository trong module không kế thừa `BaseRepository`; `HrLineSource` đọc thẳng `Department`; service nền tảng truy vấn thẳng `MES_Core`, có SQL thô | Tech Lead chốt là nợ kỹ thuật ([13](../update_docs/13-quyet-dinh.md) mục 16.3) |
| N2 | `MES_Order/0009` bị sửa sau lần commit đầu (`54e4c3d`, `6a6121c`) | Máy chủ chạy bản mới nhất; quy tắc không sửa migration đã chạy giữ nguyên |
| ~~N3~~ | ~~Comment trong code trỏ tới tài liệu đã xóa~~ | Xong ở T1 (21/10/2026); còn trong migration đã chạy (không sửa) |
| ~~N4~~ | ~~TypeScript lẫn 5.9.3 và 6.0.3~~ | Xong ở T3 (21/10/2026) |
| ~~N5~~ | ~~Chưa có CI~~ | Xong ở T2: lần chạy đầu trên GitHub xanh (21/10/2026) |
| N6 | Frontend không có ranh giới import (`features/admin` dùng `features/hr`, `features/sewing`) | Q29. Cắt, May không còn phụ thuộc `features/order` (T9, 21/10/2026) |
| N7 | Khóa truy vấn của `SewingPlanPage.tsx` thiếu mã ĐVCS; hai màn Cắt làm mới cả nhóm `['order']` | Trái [10](../update_docs/10-giao-dien.md) mục 8.4 |
| ~~N8~~ | ~~6 route `DELETE` trả 204~~ | Xong ở T7 (21/10/2026) |
| ~~N9~~ | ~~Mã lỗi tạo ngoài `Errors`~~ | Xong ở T10 (21/10/2026) |
| N10 | Kiểm mức cột trong service lặp lại ở `PoAllocationService.setFactory`, `ColorSizeService.save`, `CutRatioService.updateColorSizes`, `LinePlanService.saveLines`, tên cột viết cứng | PROPOSED: hàm dùng chung ở `FieldPolicyService` (đọc tên cột từ `SysResourceField`, `levels()` đã trả `fields`); sửa nền tảng nên cần review riêng |
| N11 | API đồng bộ `GET /order/color-size/sync` (T18): không phân trang (quá 10.000 dòng thì 422, review M2); quét toàn bảng `ShipmentPlanLine` mỗi lần gọi, chưa có chỉ mục theo lúc đổi (L5); dòng bị xóa chỉ biết qua `/sync/ids` | PROPOSED: phân trang theo `(changedAt, Id)`; chỉ mục `ModifiedAt`, `CreatedAt` (migration); bảng ghi dòng xóa nếu bên nhận cần báo tức thì |
| N12 | Không có bài test tự đối chiếu tên biến `env.ts` đọc với `backend/.env.example` (T11 đối chiếu một lần bằng script) | PROPOSED: bài trong `deploy/deploy.test.cjs` so `process.env.X`, `flag('X')`, `percent('X')` của `env.ts` với `lib.envKeys`; cần hỏi trước khi làm (đợt chuẩn hóa) |
| N13 | `backend/tsconfig.build.json` kế thừa `types: ["node", "jest"]`: biến toàn cục của Jest (`describe`, `expect`) biên dịch qua ở code chạy thật, đến lúc chạy mới `ReferenceError` (hiện `src` không dùng; review T8) | PROPOSED: `"types": ["node"]` trong `tsconfig.build.json` |
| N14 | `@types/node` 26.x trong khi máy dev, máy chủ chạy Node 22: kiểm kiểu chấp nhận API chỉ có từ Node 23 (review T8) | PROPOSED: ghim `@types/node@^22`; đổi phụ thuộc nên hỏi Tech Lead |
| N15 | CI chạy migrate, seed, test bằng `sa` (sysadmin), máy chủ dùng login `db_owner`: migration cần quyền cấp server qua CI nhưng hỏng khi triển khai (review T2) | PROPOSED: trong job tạo login có `dbcreator` rồi chạy bằng login đó; ngoài các bước đã duyệt nên hỏi trước |

## 7. Quyết định của đợt chuẩn hóa (Tech Lead, 19/10/2026): ghi ở đâu

| Quyết định | Ghi ở |
|---|---|
| Tài liệu hai lớp, mỗi quy tắc một nguồn, `docs/` vào git, `docs/current/` chỉ có file này; code là căn cứ hiện trạng, quyết định là căn cứ quy tắc; ngoại lệ truy cập dữ liệu là nợ kỹ thuật; mô hình nhánh, CI | [13](../update_docs/13-quyet-dinh.md) mục 16 |
| TypeScript 6.0.3 (`ts-jest` đã chạy 6.0.3) | [13](../update_docs/13-quyet-dinh.md) mục 1.3; T3 |
| 15.2 thay một phần 7.2; ADR 0011, 0013, 0014 Accepted | [13](../update_docs/13-quyet-dinh.md) mục 7.2, bảng tra ADR |
| Hai ngoại lệ an toàn AI còn hiệu lực | [AGENTS.md](../../AGENTS.md) mục 7 |
| Mảnh `` sql`…` `` dựng trong service truyền cho repository không tính là SQL thô (Q43) | [AGENTS.md](../../AGENTS.md) mục 4.3, [CODE_CONVENTIONS](../CODE_CONVENTIONS.md) mục 6.1 |
| `DELETE` trả 200 kèm `{ removed: true }` (Q42); gom mã lỗi vào `Errors` (Q47) | [CODE_CONVENTIONS](../CODE_CONVENTIONS.md) mục 4.1, 5; T7, T10 |
| Kiểm kiểu `backend/scripts`, `backend/test` (Q44); bổ sung `.env.example` (Q48); các bước CI | [ENGINEERING_STANDARDS](../ENGINEERING_STANDARDS.md) mục 1.4, 2, 9; T8, T11, T2 |
| Chuyển phần dùng chung `features/order/common.tsx` (Q46) | [ARCHITECTURE](../ARCHITECTURE.md) mục 10 A3; T9 |
| Remote chính `origin` (Q45); kế hoạch phase trong STATUS; PR, squash, bảo vệ nhánh, commit, xung đột, revert | [DEVELOPMENT_WORKFLOW](../DEVELOPMENT_WORKFLOW.md) mục 2, 4, 5 |
| Máy chủ Node 22, đã làm hết việc chờ; 5.14 Approved | Mục 2, 3 |
| Body > 512 KB: ghi lại, test sau khi xong tài liệu | T13 |
| Q51: che tên khách cho Trưởng chuyền ở Đồng bộ tiến độ cắt; Q52: `DELETE /cutting/progress/:id/entries` đổi theo chuẩn Q42 (20/10/2026) | T16; [CODE_CONVENTIONS](../CODE_CONVENTIONS.md) mục 4.1, T7 |
| Q53 (người dùng 21/10/2026): dữ liệu đẩy ra hệ thống khác qua API của MES (về sau còn nhiều trường hợp); tài khoản MES với vai trò sẵn có, không tạo vai trò riêng; chạy HTTP; để yên `DB_TRUNGGIAN` cho hướng linked server | [13](../update_docs/13-quyet-dinh.md) mục 8.6; mục 3; T18; N11 |
| Q54 (21/10/2026): mọi `DELETE` trả 200 có `removed: true`; `DELETE /cutting/progress/:id/entries` và `DELETE /admin/catalogs/work-calendars/:branchCode/days` giữ thêm số liệu màn đang dùng (`planRemoved`, số ngày đã xóa) | [CODE_CONVENTIONS](../CODE_CONVENTIONS.md) mục 4.1; T7 |
| Q55 (21/10/2026): chính sách cột mẫu mới cho vai trò, cột đã có đưa vào máy đã cài bằng migration `MES_Core` (như `0012`, `0013` cấp quyền) | [13](../update_docs/13-quyet-dinh.md) mục 13.5; T16 (`MES_Core/0015`) |
| Xóa tài liệu cũ (T4); dọn worktree, nhánh (Q49); xóa nhánh `feature/docs-chuan-hoa` trên `origin` (Q50) | Mục 1.1, 2 |
| Quyền đọc thẳng BRAVO chỉ theo dõi; chừa `docs/nguon/ba/`; không xử lý thông tin nhạy cảm trong tài liệu (IP là máy test nội bộ) | Mục 4.3; `docs/nguon/ba/README.md` |

## 8. Lỗi đã biết, chưa sửa

### 8.1 Code

Phát hiện khi rà code để viết tài liệu; chưa chạy thử từng trường hợp. Mức: **Cao** có thể mất, lộ dữ liệu hoặc sai số liệu; **Trung bình** người dùng gặp được; **Thấp** hiếm hoặc chỉ ở giao diện.

| Mức | Vị trí | Vấn đề |
|---|---|---|
| Cao | `backend/scripts/sync-gen.ts` (nhánh `FULL`) | Nguồn chép toàn bộ chỉ chặn khi view trả 0 dòng, không có chốt "xóa quá 20%" |
| Cao | `backend/src/platform/data/base.repository.ts` (`listAll`) | Xuất file các lưới cắt im lặng ở 10.000 dòng (trừ Phân bổ PO báo 422) |
| Cao | `backend/src/modules/order/shipment.service.ts` (`draft`) | Số lượng ở popup không đi qua chính sách cột của cột nguồn; `/draft`, `/candidates` chỉ đòi `order.shipment:view` (Q34) |
| Trung bình | `backend/src/modules/order/cut-ratio.service.ts` (`setConfirmed`) | Xác nhận, hủy xác nhận PO đổi cột Trạng thái mà không xét mức cột: chờ quyết cưỡng chế hay coi là hành động nghiệp vụ. Thêm: 409 "PO chưa có số lượng màu cỡ" cho người không xem được `qty` biết Số lượng PO có bằng 0; `confirmBlocked` ở `CutRatioPage.tsx` cũng không xét `statusCode` |
| Trung bình | `backend/src/platform/admin/admin.dto.ts` | `fullName`, `description` dài hơn cột thì 500 thay vì 422 |
| Trung bình | `backend/src/platform/auth/auth.controller.ts` (refresh) | Hai tab làm mới cùng lúc: bên thua xóa cookie |
| Trung bình | `backend/src/platform/auth/auth.service.ts` | 423 với tài khoản có thật, 401 với tên không tồn tại: dò được tài khoản; chưa giới hạn tần suất |
| Trung bình | `permission.service.ts` (`accessStamp`), `field-policy.service.ts` | `X-Permission-Version` không tính mốc hiệu lực của chính sách cột theo người |
| Trung bình | `field-policy.service.ts` (`logSensitive`) | Ghi nhật ký đọc dữ liệu nhạy cảm lỗi thì vẫn trả dữ liệu |
| Trung bình | `shipment.service.ts` (`create`) | Trạng thái Hoàn thành/Đã hủy của đơn chỉ kiểm trước khi khóa |
| Trung bình | `frontend/src/features/order/LinePlanPage.tsx` (popup Chi tiết dàn chuyền) | Mở popup là nút Lưu bật sẵn dù chưa sửa gì: đã thấy trên Chrome điều khiển qua DevTools (21/10/2026, một kế hoạch đã xếp chuyền ở bộ test), có ở cả bản lưới tĩnh và động nên không do T14; nguyên nhân chưa tìm |
| Trung bình | `frontend/src/lib/api.ts` | Body lỗi không phải JSON (502 HTML) bị báo "Không kết nối được máy chủ" |
| Trung bình | `backend/test/*`, `npm test` | Không có chốt chặn database |
| Thấp | `backend/src/app.factory.ts` | Lỗi DTO lồng nhau mất thông điệp con; `ParseIntPipe` và JSON sai cú pháp trả thông điệp tiếng Anh; lỗi khác của body-parser (415 charset, encoding; quá 1.000 tham số urlencoded; query lồng quá sâu) vẫn thành 500 `INTERNAL_ERROR`; phản hồi lỗi của bộ đọc body thiếu header của helmet (đăng ký trước helmet) |
| Thấp | `backend/src/platform/admin/*` | Nhật ký `USER_CREATE`, `ROLE_CREATE`, `BRANCH_CREATE` ghi ngoài transaction, không ghi IP; `importBravoBranches` hết giờ chờ khóa trả 500 |
| Thấp | `po-allocation.service.ts`, `base.repository.ts` (`factoryBranchWrite`) | Nhà máy đã ngừng của chính ĐVCS bị báo "ĐVCS khác"; cột ĐVCS trống khi `FtyName` là danh sách |
| Thấp | `po-allocation.service.ts` (`OPENJSON`) | Sắp xếp, lọc, xuất 50.000 dòng có thể chậm, chưa đo |
| Thấp | `backend/test/po-allocation*.spec.ts` | Chạy nhầm trên database thật ghi đè dòng trạng thái `PoAllocationRefresh` |
| Thấp | `backend/src/platform/org/org.service.ts` | Cache chuyền 30 giây theo tiến trình |
| Thấp | `MES_Sync/0007` | Mô tả nguồn `OSM.OSMData` cũ; sửa cần migration mới |
| Thấp | `backend/migrations/softkeys.json` | Chưa khai `CreatedBy` của `PrepStep`, `SewingPrepStep`, `DepartmentType`, bảng con `MES_Order`, `CuttingPlan`, `CuttingPlanDaily`, mọi `ModifiedBy` |
| Thấp | `backend/src/modules/sewing/prep-step.service.ts` (`create`) | Hai người thêm cùng mã cùng lúc: người sau nhận 500 thay vì 409 |
| Thấp | `backend/src/modules/sewing/prep.service.ts` (`filter`) | Lọc tuần có thể sót bước có số ngày KH trên khoảng 21 |
| Thấp | `backend/src/platform/database/db.ts` | `DB_HOST` dạng `MAY\INSTANCE` không kết nối được |
| Thấp | `backend/src/config/env.ts` | `COOKIE_SECURE` chỉ nhận `true` viết thường; `TRUST_PROXY` truyền nguyên chuỗi |
| Thấp | `backend/scripts/seed.ts` | Phép gán ADMIN có hạn dùng thì phép gán Toàn quyền vẫn không hạn |
| Thấp | `backend/scripts/reset-demo.ts` | Vai trò tự tạo trùng mã `FULL_ACCESS` bị đổi tên, xóa quyền (chỉ máy demo) |
| Thấp | `frontend/src/shell/permissions.ts` | Menu chỉ đọc 2 tầng; `MODULE_PREFIXES` viết cứng |
| Thấp | `SyncPage.tsx`, `AuditPage.tsx`, `sync-gen.ts` | Chữ trên màn Đồng bộ chỉ nói BRAVO; lỗi 50004 nhắc tên nút cũ. Màn Nhật ký hiện nguyên mã khi chưa có nhãn: mã hành động `FACTORY_IMPORT`, `IMPORT`, `LOGIN_LOCKED`, `SELECT_BRANCH_DENIED`, `BRAVO_IMPORT`, `OSM_FACTORY_IMPORT`, `CONFIRM`, `UNCONFIRM`, `DELETE_ENTRIES` (có thể còn mã khác ghi qua biến); ô lọc đối tượng thiếu `DepartmentType`, `Employee`, `PrepStep`, `SewingPrep`, `SewingDayPlan`, `CuttingPlan`, `CuttingSupply`, còn lọc `ShipmentPlanLine` mà không code nào ghi loại này |
| Thấp | `frontend/vitest.perf.config.ts` | Không được kiểm kiểu ở đâu (`frontend/tsconfig.json` chỉ gồm `src`, `vite.config.ts`); chạy `tsc` riêng báo TS5097 ở `import base from './vite.config.ts'` (review T8) |
| Thấp | `backend/scripts/seed-data.ts` (danh mục Cấu hình chuẩn bị SX) | Trích `docs/nguon/danh-muc-cau-hinh-chuan-bi-san-xuat.png`: file không có trong repo (chỉ có ở commit `49633f1`, không thuộc lịch sử `main`); cần nguồn thay thế hoặc bỏ tham chiếu (T1 để nguyên) |
| Thấp | `backend/src/modules/hr/department.service.ts` (comment đầu `class`) | Trích `KE-HOACH-MES-VSN.md mục 2.4`: file không có trong repo (như dòng `08-nhan-su.md` ở mục 8.2) |
| Thấp | `backend/test/phase3.spec.ts` (comment đầu file) | Số kịch bản "1–4, 7, 8, 10, 11, 14–17" theo `seed-demo.md` cũ (đã ghi chú trong comment), nay 12 đánh số A1–G5: PROPOSED viết lại theo nội dung |
| Thấp | `frontend/src/features/sewing/PrepPlanPage.tsx` | Tự viết `useLines` giống hệt `lib/lines.ts` (cùng khóa truy vấn, `staleTime`): nên dùng hàm chung (review T9) |
| Thấp | Nhiều nơi | Code không dùng: `mantine-datatable`, `BranchName`, `onlyEditable`, prop `widthKey`, `AdminUsersService.roleCodes`, ảnh `frontend/public/Logo VS.png`, `logo-vs-mark.png`; comment cũ "Chưa đồng bộ BRAVO" |

### 8.2 Tài liệu module (task T15, 20/10/2026)

Đã bổ sung cho khớp code: `04` (tài nguyên `cutting.*`, `sewing.plan` ở mục 3.2, 7.3, 8.1; đường ghi không theo phiên; danh sách mã lỗi đủ; test bảo vệ luật), `05` (`ancestors` của `/me/lines`; bảng migration thay bằng link [ARCHITECTURE](../ARCHITECTURE.md) mục 6.2; màn Nhật ký; `work-calendar.ts`), `06` (vị trí code, repository hệ thống, mã 409 của API, khóa ngầm chiều ngược, `load:bravo`, `sim:board`), `07` (Kế hoạch may trong tổng quan, ranh giới, mục Database), `08` (`HrLineSource`, nơi dùng chuyền, khóa ngầm chiều ngược, ranh giới với module Cắt), `10` (khung, theme, token sau 5.11; manifest; `lib/`; bảng màn; danh sách test chuyển về `12`), `11` (`DB_HOST`, `reset:demo`, `sim:board --all`, `--sync-env`), `12` (`sewing.plan` ở bảng phạm vi, cột, chính sách cột mẫu; đủ 37 file test backend, 36 file test frontend), `15` (kết quả `DELETE`, `confirm`, ranh giới).

Còn **NEEDS VERIFICATION**:

| File | Điểm |
|---|---|
| `08-nhan-su.md` | Chỉ mục `IX_Department_ProductionWorkshop` không phủ cột `Path` mà `HrLineSource` nay đọc thêm: chưa đo plan thực thi |
| `08-nhan-su.md` | Mục 2.4 dẫn `docs/nguon/KE-HOACH-MES-VSN.md`: file không có trong repo (chỉ có ở commit `957c09c`, không thuộc lịch sử `main`); cần nguồn thay thế hoặc bỏ tham chiếu |
| `10-giao-dien.md` | Số đo màn đăng nhập (585px, 360×640, 960×599) ở mục 11.2: không kiểm được từ code |
| `11-van-hanh.md` mục "Bảng biến", "Xử lý sự cố"; `12` mục bộ database test | Ghi chốt `NODE_ENV=production` chạy cả với `npm test`; đọc code thì Jest đặt `NODE_ENV=test` trước khi `env.ts` nạp `.env` (dotenv không ghi đè) nên chốt không chạy trong `npm test -w backend` (review T11) |
| `11-van-hanh.md` | Thư mục triển khai phải nằm trên ổ NTFS của chính máy chủ (script tạo junction, `deploy/lib.cjs`): code không kiểm điều này |
