# Trạng thái hiện tại

| Mục | Nội dung |
|---|---|
| Mục đích | Nơi duy nhất ghi trạng thái: việc đang làm và kế hoạch phase, trạng thái phase, việc chờ trên máy chủ, câu hỏi mở, nợ kỹ thuật, lỗi đã biết. Đọc đầu mỗi phiên để không làm lại việc đã làm; cập nhật trước khi commit |
| Đối tượng | Mọi phiên làm việc (người, AI), Tech Lead |
| Ảnh chụp | 19/10/2026. Bản trạng thái cũ (`docs/update_docs/02-trang-thai.md`, có chi tiết từng câu hỏi trước 19/10) đã xóa: `git show 98d19db:docs/update_docs/02-trang-thai.md` |

Kế hoạch phase mới ghi ở mục 1 theo khuôn ở [DEVELOPMENT_WORKFLOW](../DEVELOPMENT_WORKFLOW.md) mục 2.1.

## 1. Đang làm

### 1.1 Chuẩn hóa tài liệu (theo `docs/DOCS_STANDARDIZATION_PLAN.md`)

| Việc | Trạng thái |
|---|---|
| Giai đoạn 1–3: kiểm kê, khảo sát code, bản đồ hợp nhất | Xong; Tech Lead duyệt các quyết định ở mục 7 |
| Đưa `docs/` vào git làm mốc | Xong: commit `98d19db`, đã lên `origin/main` |
| Giai đoạn 4: `AGENTS.md`, `CLAUDE.md`, 6 file ở `docs/`, file này; rút gọn `README.md`; sửa tài liệu module nói khác code | Xong, chưa commit |
| T4: chuyển nội dung chỉ còn ở tài liệu cũ rồi xóa 59 file (`update_docs/01`, `02`, `03`, `14`, `docs/adr/*`, `docs/phases/*`, 11 file `thiet-ke`, `review/README.md`, `yeu-cau.md`, `bao-cao/*`) | Xong, chưa commit. Bảng "đã xóa → đọc ở đâu": [update_docs/README](../update_docs/README.md) |
| Q49: dọn worktree, nhánh đã gộp | Xong: gỡ `MES-wt-511`, `MES-wt-512`, `MES-wt-r4`; xóa 8 nhánh cục bộ đã gộp (gồm `fix-cut-ratio-qty`, gỡ sau khi T12 commit). Repo chỉ còn nhánh `main` |
| T12: sửa lỗi HIGH ở Cập nhật tỷ lệ cắt (`CutRatioService.updateColorSizes` kiểm mức cột `qty` trước khi đọc PO, kể cả `lines: []`) | Xong, commit `33888e8`. Review [t12-cap-nhat-ty-le-cat.md](../review/t12-cap-nhat-ty-le-cat.md) |
| T17: sửa lỗi HIGH cùng loại ở Xếp chuyền (`LinePlanService.saveLines` kiểm mức cột `startDate` trước khi đọc kế hoạch, kể cả `lines: []`), theo mẫu T12 | Xong 20/10/2026 trên `main`. Lint, build backend qua; `phase5.spec.ts` 52/52 trên `MES_*_T514`; bài mới hỏng với code cũ. Review [t17-xep-chuyen-ngay-bat-dau.md](../review/t17-xep-chuyen-ngay-bat-dau.md): APPROVE WITH SUGGESTIONS, 3/4 LOW đã sửa, L1 gộp vào N10. Một lần chạy chung `sewing-plan.spec.ts` + `cutting-supply.spec.ts` hỏng 4 bài, không lặp lại (3 lần sau 21/21): NEEDS VERIFICATION |
| T18: API đồng bộ dòng dàn chuyền Đã phân màu cỡ cho hệ thống khác, `GET /api/v1/order/color-size/sync?from=&to=` (người dùng yêu cầu gấp 20/10/2026, thay cho view ở `DB_TRUNGGIAN`, Q53) | Xong 20/10/2026 trên `main`, chưa commit. Review [t18-api-dong-bo-dan-chuyen.md](../review/t18-api-dong-bo-dan-chuyen.md): REQUEST CHANGES (1 HIGH, 6 MEDIUM, 7 LOW), đã sửa H1, M3, M4, M5, L1, L6; M1, M6 người dùng chốt 21/10 (Q53); M2, L5 vào nợ N11. Lint, build backend qua; `phase5.spec.ts` 57/57 trên `MES_*_T514` (5 bài mới); cả bộ backend 427 qua, 2 bỏ qua (chạy trước lượt sửa theo review). Tài liệu: [06](../update_docs/06-don-hang.md) bảng API Phân bổ màu cỡ, [13](../update_docs/13-quyet-dinh.md) mục 8.6, hướng dẫn cho Dev bên gọi [docs/tich-hop/api-dong-bo-dan-chuyen.md](../tich-hop/api-dong-bo-dan-chuyen.md) (21/10) |
| T19: sửa lỗi triển khai treo ở câu hỏi `Unlink of file '.git/objects/pack/...' failed. Should I try again? (y/n)` (máy chủ, 21/10/2026). Nguyên nhân: tiến trình `git pull` còn giữ file pack trong lúc gc tự động của `git merge` con xóa pack cũ; Windows không cho xóa, trả lời `y` không bao giờ qua. Đã tái hiện trên máy dev (Git 2.51.0.windows.1): `git pull` để lại 2 pack cũ, `git fetch` + `git merge` riêng thì không. Máy chủ chưa xác minh có chương trình khác (VS Code, TortoiseGit) cùng giữ file: NEEDS VERIFICATION | Đã sửa 21/10/2026 trên `main`, chưa commit: `deploy/deploy.cjs` thay `git pull --ff-only` bằng `git fetch` rồi `git merge --ff-only @{upstream}`; thêm dòng xử lý sự cố ở `deploy/huong-dan.html`; [11](../update_docs/11-van-hanh.md) bước 2. Lint `deploy`, `test:deploy` 13/13 qua. Máy chủ chỉ dùng cách mới từ lần triển khai sau khi bản sửa lên `origin` |
| Bộ database test trên máy chủ | Còn `MES_*_T514` (6 database) dùng cho các task sau; đã xóa `MES_*_T5R4`, `MES_*_Test` (20/10/2026, Tech Lead chọn) |
| Giai đoạn 5: kiểm liên kết, tính nhất quán | Xong (kết quả trong báo cáo của phiên) |
| T15: bổ sung tài liệu module còn thiếu so với code (`04`–`08`, `10`–`12`, `15`) | Xong 20/10/2026, chưa commit. Kết quả, điểm còn NEEDS VERIFICATION: mục 8.2 |

Làm trên `main` theo chỉ đạo 19/10/2026 ("theo dõi trên nhánh main trước"). Mục đích đợt này: chốt, chuẩn hóa source và tài liệu, không xây tính năng mới (Tech Lead 20/10/2026). Sửa code chỉ gồm các lỗi lệch quy tắc đã duyệt (T12, T17); không đổi database thật, CI/CD.

### 1.2 Việc tiếp theo đã duyệt, chưa làm

Tech Lead 19/10/2026: các việc sửa code làm **sau khi chốt tài liệu**, mỗi việc một task.

| # | Việc | Ghi chú |
|---|---|---|
| T13 | Test body vượt 512 KB trả 413 hay 500 | [DATA_FLOWS](../DATA_FLOWS.md) mục 8 |
| T1 | Sửa comment trong code trỏ tới tài liệu đã xóa | ~250 chỗ "ADR 00xx", ~12 chỗ `docs/thiet-ke/*.md` (ví dụ `backend/src/common/app.exception.ts`), 4 chỗ `11-van-hanh.md`; 17 file trích "CLAUDE.md mục…" đang đúng số mục của `AGENTS.md`. Tạm thời tra bảng ở [update_docs/README](../update_docs/README.md) |
| T2 | Dựng CI GitHub Actions | Các bước: [ENGINEERING_STANDARDS](../ENGINEERING_STANDARDS.md) mục 9; 2 bài `catalog.spec.ts` cần dữ liệu BRAVO |
| T3 | Thống nhất TypeScript 6.0.3 | `ts-jest` đã chạy 6.0.3 (Tech Lead xác nhận); `backend`, `frontend` còn khai `^5.9.3` |
| T6 | Áp dụng mô hình nhánh, bật bảo vệ nhánh `main`, `develop` trên GitHub | Khi Tech Lead bảo bắt đầu ([DEVELOPMENT_WORKFLOW](../DEVELOPMENT_WORKFLOW.md) mục 4) |
| T7 | Mọi `DELETE` trả 200 kèm `{ removed: true }` | 6 route còn 204, và `DELETE /cutting/progress/:id/entries` đổi theo chuẩn (Q52): [CODE_CONVENTIONS](../CODE_CONVENTIONS.md) mục 4.1; sửa cả giao diện đang đọc body cũ |
| T16 | Che tên khách hàng (`customerName`, mức Che) cho Trưởng chuyền ở `cutting.progress` (Q51) | Thêm dòng vào `roleFieldPolicies` (`backend/scripts/seed-data.ts`), như 4 màn Đơn hàng, Chuẩn bị SX; máy đã cài cần cách đưa dòng mới vào (kiểm seed có thêm chính sách cột còn thiếu không, hay cần migration); sửa [12](../update_docs/12-du-lieu-mau-va-kiem-thu.md) mục chính sách cột mẫu |
| T8 | Kiểm kiểu `backend/scripts`, `backend/test` | [ENGINEERING_STANDARDS](../ENGINEERING_STANDARDS.md) mục 1.4 |
| T9 | Chuyển phần dùng chung của `features/order/common.tsx`, `features/order/api.ts` sang `components`/`lib` | [ARCHITECTURE](../ARCHITECTURE.md) mục 10 A3 |
| T10 | Gom `FIELD_NOT_READABLE`, `LINE_SCOPE_UPDATE_FAILED` vào `Errors` | [CODE_CONVENTIONS](../CODE_CONVENTIONS.md) mục 5 |
| T11 | Bổ sung 8 biến vào `backend/.env.example` | [ENGINEERING_STANDARDS](../ENGINEERING_STANDARDS.md) mục 2 |
| T14 | `SheetGrid` dùng bản động `DynamicDataSheetGrid` | Kế hoạch cũ chờ duyệt (bản gốc: `git show 98d19db:docs/phases/sheetgrid-ban-dong.md`). Task: (1) chạy thử từng màn dùng `SheetGrid`, ghi lỗi thật; (2) đổi sang `DynamicDataSheetGrid`, giữ `useMemo` cho `columns` và các hàm truyền vào, đo số lần vẽ không tệ hơn (`render-cost.test.tsx`); (3) bỏ các cách tránh không còn cần (`ref` đọc lỗi ở Phân màu cỡ, cột dựng theo `sig` ở Tỷ lệ cắt); (4) sửa [10](../update_docs/10-giao-dien.md) mục 9.3, review. Rủi ro: màn dựng `columns` trong lúc render sẽ chậm khi gõ; chạy thử lại nút Thêm ở Phân màu cỡ (`addAtActive`, `keepAnchor`) |
| T5 | Đổi tên, chuyển chỗ tài liệu module `docs/update_docs/*` (nếu Tech Lead muốn) | Sau T1 vì code trỏ tới `11-van-hanh.md` |

## 2. Trạng thái phase

Git (19/10/2026): mọi code của các phase dưới đây đã commit trên `main`; `main` trùng `origin/main` ở commit mốc tài liệu `98d19db`; `githq5/main` chậm hơn (ở `24301de`). Nhánh `feature/docs-chuan-hoa` trên `origin` đã xóa (Q50). Trạng thái duyệt theo bản trạng thái cũ, cập nhật theo Tech Lead 19/10/2026.

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
| Triển khai | `deploy/deploy.cjs` không hạ web | Ready for review | Q32 |

QMS, Hoàn thiện, Báo cáo, Quản lý in thêu, các màn May còn lại: chưa bắt đầu.

Kết quả kiểm tra: đợt chuẩn hóa tài liệu 19/10/2026 không đổi code nên không chạy lint, test, build. Số liệu gần nhất do phase 5.17 tự ghi: backend 37 bộ, 421 bài qua, 2 bỏ qua (bộ `MES_*_T514`); frontend 36 file, 295 bài.

## 3. Máy chủ

Tech Lead xác nhận 19/10/2026: máy chủ chạy bản mới nhất kéo từ `origin`, Node.js 22; mọi việc chờ trên máy chủ của các phase tới 5.17 (migrate, seed Toàn quyền, `JWT_SECRET`, gắn ĐVCS cho nhà máy, chuyền may, `MES_Cutting`, chuyển sang `deploy.cjs`, khai lịch làm việc, Giá CM) đã làm xong. **Không còn việc chờ.**

- Cờ `BRAVO_ORDER_IMPORT` trên máy chủ chỉ bật, tắt khi Tech Lead bảo ([AGENTS.md](../../AGENTS.md) mục 7).
- Dàn chuyền lưu trước 5.12.1 giữ ngày theo cách tính cũ tới khi người dùng bấm "Tính lại theo công thức" rồi Lưu.
- 20/10/2026, người dùng yêu cầu: đã tạo database `DB_TRUNGGIAN` (mặc định của máy, chủ sở hữu là tài khoản ứng dụng) và view `dbo.vMES_XepChuyen_DaPhanMauCo` trên SQL Server 10.0.0.216 (`VSC-DC03\MES_VSN`). Ngoài migration, `npm run migrate` không biết tới. Khác với database trung gian BRAVO (`DB_TRUNGGIAN_NAME` = `BRAVO_TRE`, máy 10.0.0.225). Cùng ngày người dùng chuyển sang API (T18). Người dùng 21/10/2026: **để yên** database, view này; mục tiêu sau là linked server, đang gặp sự cố (Q53).
- T18 (API đồng bộ dàn chuyền) khi triển khai: không có migration, seed. Người dùng 21/10/2026: không tạo vai trò riêng; bên gọi dùng một tài khoản MES có vai trò sẵn có với `order.colorsize:view` và `order.colorsize:export` (thiếu `:view` thì mất mọi quyền khác của tài nguyên, bị 403), ví dụ Giám đốc (chỉ xem, xuất); gán ĐVCS `A00` (đọc mọi ĐVCS theo phạm vi phép gán) hoặc từng ĐVCS. Chạy HTTP (người dùng chấp nhận). Gửi cho Dev bên gọi: [docs/tich-hop/api-dong-bo-dan-chuyen.md](../tich-hop/api-dong-bo-dan-chuyen.md), kèm địa chỉ máy chủ và tài khoản.

Thêm việc mới cho máy chủ: ghi ở đây, kèm migration, có dừng bản cũ khi migrate không, việc nhập liệu sau triển khai.

## 4. Câu hỏi mở

### 4.1 Chờ Tech Lead, người dùng

Đã trả lời: Q2, Q4, Q5, Q42–Q50 (19/10/2026), Q51, Q52 (20/10/2026), Q53 (21/10/2026) (mục 7).

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
| N3 | Comment trong code trỏ tới tài liệu đã xóa | T1 |
| N4 | TypeScript lẫn 5.9.3 và 6.0.3 | T3 |
| N5 | Chưa có CI | T2 |
| N6 | Frontend không có ranh giới import; Cắt, May phụ thuộc `features/order/common.tsx` | T9, Q29 |
| N7 | Khóa truy vấn của `SewingPlanPage.tsx` thiếu mã ĐVCS; hai màn Cắt làm mới cả nhóm `['order']` | Trái [10](../update_docs/10-giao-dien.md) mục 8.4 |
| N8 | 6 route `DELETE` trả 204 | T7 |
| N9 | Mã lỗi tạo ngoài `Errors` | T10 |
| N10 | Kiểm mức cột trong service lặp lại ở `PoAllocationService.setFactory`, `ColorSizeService.save`, `CutRatioService.updateColorSizes`, `LinePlanService.saveLines`, tên cột viết cứng | PROPOSED: hàm dùng chung ở `FieldPolicyService` (đọc tên cột từ `SysResourceField`, `levels()` đã trả `fields`); sửa nền tảng nên cần review riêng |
| N11 | API đồng bộ `GET /order/color-size/sync` (T18): không phân trang (quá 10.000 dòng thì 422, review M2); quét toàn bảng `ShipmentPlanLine` mỗi lần gọi, chưa có chỉ mục theo lúc đổi (L5); dòng bị xóa chỉ biết qua `/sync/ids` | PROPOSED: phân trang theo `(changedAt, Id)`; chỉ mục `ModifiedAt`, `CreatedAt` (migration); bảng ghi dòng xóa nếu bên nhận cần báo tức thì |

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
| Trung bình | `frontend/src/components/SheetGrid.tsx` | `DataSheetGrid` là bản tĩnh: cột, `createRow`… chỉ đọc lần vẽ đầu (task T14). Ngoài ra lưới gọi `onChange` với giá trị không đổi khi mở popup Chi tiết dàn chuyền trong Chrome không giao diện, làm nút Lưu bật sẵn; chưa kiểm trên trình duyệt thật |
| Trung bình | `frontend/src/lib/api.ts` | Body lỗi không phải JSON (502 HTML) bị báo "Không kết nối được máy chủ" |
| Trung bình | `backend/test/*`, `npm test` | Không có chốt chặn database |
| Trung bình | `backend/.env.example` | Thiếu 8 biến nên `deploy.cjs` không cảnh báo khi thiếu (T11) |
| Thấp | `backend/src/app.factory.ts` | Lỗi DTO lồng nhau mất thông điệp con; `ParseIntPipe` trả thông điệp tiếng Anh; body vượt 512 KB có thể thành 500 (T13) |
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
| Thấp | Comment cũ | `backend/scripts/seed-data.ts` (khai `sewing.plan`) ghi "không dùng Thêm" trong khi lập Kế hoạch may lần đầu cho chuyền trong ngày cần quyền Thêm (`sewing-plan.service.ts`, `ensureHeaders`); `frontend/src/components/BrandMark.tsx` ghi logo gốc "nền trắng đặc" trong khi `logo-vs.png` đã nền trong suốt. Sửa cùng task T1 |
| Thấp | Nhiều nơi | Code không dùng: `mantine-datatable`, `BranchName`, `onlyEditable`, prop `widthKey`, `AdminUsersService.roleCodes`, ảnh `frontend/public/Logo VS.png`, `logo-vs-mark.png`; comment cũ "Chưa đồng bộ BRAVO" |

### 8.2 Tài liệu module (task T15, 20/10/2026)

Đã bổ sung cho khớp code: `04` (tài nguyên `cutting.*`, `sewing.plan` ở mục 3.2, 7.3, 8.1; đường ghi không theo phiên; danh sách mã lỗi đủ; test bảo vệ luật), `05` (`ancestors` của `/me/lines`; bảng migration thay bằng link [ARCHITECTURE](../ARCHITECTURE.md) mục 6.2; màn Nhật ký; `work-calendar.ts`), `06` (vị trí code, repository hệ thống, mã 409 của API, khóa ngầm chiều ngược, `load:bravo`, `sim:board`), `07` (Kế hoạch may trong tổng quan, ranh giới, mục Database), `08` (`HrLineSource`, nơi dùng chuyền, khóa ngầm chiều ngược, ranh giới với module Cắt), `10` (khung, theme, token sau 5.11; manifest; `lib/`; bảng màn; danh sách test chuyển về `12`), `11` (`DB_HOST`, `reset:demo`, `sim:board --all`, `--sync-env`), `12` (`sewing.plan` ở bảng phạm vi, cột, chính sách cột mẫu; đủ 37 file test backend, 36 file test frontend), `15` (kết quả `DELETE`, `confirm`, ranh giới).

Còn **NEEDS VERIFICATION**:

| File | Điểm |
|---|---|
| `08-nhan-su.md` | Chỉ mục `IX_Department_ProductionWorkshop` không phủ cột `Path` mà `HrLineSource` nay đọc thêm: chưa đo plan thực thi |
| `08-nhan-su.md` | Mục 2.4 dẫn `docs/nguon/KE-HOACH-MES-VSN.md`: file không có trong repo (chỉ có ở commit `957c09c`, không thuộc lịch sử `main`); cần nguồn thay thế hoặc bỏ tham chiếu |
| `10-giao-dien.md` | Số đo màn đăng nhập (585px, 360×640, 960×599) ở mục 11.2: không kiểm được từ code |
| `11-van-hanh.md` | Thư mục triển khai phải nằm trên ổ NTFS của chính máy chủ (script tạo junction, `deploy/lib.cjs`): code không kiểm điều này |
