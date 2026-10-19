# Review Phase 5.8 – 11/10/2026 (lượt 1: phần rủi ro cao, trước khi chạy migration)

**Phạm vi:** 24 file.
- `backend/migrations/MES_Hr/0001_hr_init.sql`, `backend/migrations/softkeys.json`
- `backend/src/platform/data/base.repository.ts` (ràng buộc kiểu)
- `backend/src/modules/hr/*` (10 file), `backend/test/hr.spec.ts`
- `backend/scripts/seed-data.ts`, `seed.ts`, `hr-data.ts`, `reset-demo.ts`, `migrate.ts`, `check-softkeys.ts`
- `backend/src/config/env.ts`, `backend/.env.example`, `backend/eslint.config.mjs`

**Kết luận agent:** APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 6 MEDIUM, 18 LOW).

**Agent đã kiểm, đúng:**
- migration chạy được (batch, CHECK, khóa ngoại vòng, chỉ mục có lọc);
- trigger `Path` với câu `UPDATE` cả nhánh;
- điều kiện `LEFT(Path, n)`;
- `DELETE` cả bảng tự tham chiếu;
- tìm không dấu không chèn SQL được;
- quyền đúng cả 15 endpoint, deny by default;
- cột nhạy cảm ở danh sách, chi tiết, file xuất, nhật ký;
- seed không cấp lại quyền đã thu hồi;
- đồng bộ `ScopeType` không ảnh hưởng tài nguyên khác.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| M1 | MEDIUM | `employee.service.ts`, `employee-import.service.ts` | Ghi nhân viên không xếp hàng với giải thể, chuyển nhánh: có thể có nhân viên đang làm trong phòng ban vừa giải thể | Thêm, sửa, nhập nhân viên chạy trong transaction, giữ khóa `MES_Hr.Department` chế độ Shared (`lockTreeShared`), đọc lại phòng ban, chức danh của chính dòng trong khóa (`freshContext`) | Đóng |
| M2 | MEDIUM | `hr-data.ts`, `seed.ts`, `reset-demo.ts` | Database đã tạo mà chưa migrate: seed hỏng giữa chừng (mất nhật ký cấp quyền), reset làm demo mất ma trận quyền | `hrDbState()` phân biệt chưa có, chưa migrate, sẵn sàng. Seed bỏ qua phần Nhân sự khi chưa sẵn sàng. Reset kiểm trước khi chạm `MES_Core`, dừng nếu chưa migrate | Đóng |
| M3 | MEDIUM | `employee-import.service.ts` `parseDate` | Ô chỉ có năm ("1990") thành ngày năm 1905, không báo lỗi | Số ngày kiểu Excel chỉ nhận 5–6 chữ số; test `parseDate('1990') === null` | Đóng |
| M4 | MEDIUM | `base.repository.ts`, `permission.service.ts` | Tài nguyên SHARED không có cột nhà máy: vai trò Nhân sự gán phạm vi nhà máy vẫn xem, sửa toàn công ty | Ghi vào ADR 0012 mục 5; tạm thời không gán phạm vi nhà máy cho vai trò Nhân sự. **Chờ người dùng chốt** giữ hay chặn | Chờ chốt |
| M5 | MEDIUM | `employee-import.service.ts` | Lỗi lạ của từng dòng bị nuốt, không có log | `Logger.error` kèm số dòng, mã nhân viên, mã lỗi SQL (không ghi giá trị ô) | Đóng |
| M6 | MEDIUM | `db-hr.md`, file phase | Chưa có tài liệu thiết kế bảng; file phase mâu thuẫn ADR | Viết `docs/thiet-ke/db-hr.md`; sửa file phase (Q8, rủi ro mã nhân viên, trạng thái); thêm vào CLAUDE.md mục 1 | Đóng |
| L1 | LOW | `0001_hr_init.sql` CHECK mã | `LIKE` trên VARCHAR bỏ qua khoảng trắng cuối | Thêm `DATALENGTH(x) = LEN(x)` vào 5 CHECK mã | Đóng |
| L2 | LOW | `Employee.Email`, `EMAIL` | Email có dấu bị đổi khi ghi VARCHAR | Mẫu kiểm chỉ nhận ASCII in được (máy chủ và màn hình); ghi lý do ở migration | Đóng |
| L3 | LOW | chỉ mục `Employee` | Chỉ mục `EmploymentStatus` vô dụng | `IX_Employee_Department_Status (DepartmentId, EmploymentStatus)` | Đóng |
| L4 | LOW | `Employee.EmployeeType` | Lặp tên bảng | Đổi thành `StaffType` (khóa JSON `staffType`) | Đóng |
| L5 | LOW | `softkeys.json` | Không phát hiện phòng ban gắn `A00` | `"where": "IsAggregate = '0'"` | Đóng |
| L6 | LOW | tìm kiếm | Collation cũ; nạp cả cây để lấy `Path` | `Latin1_General_100_CI_AI`; `DepartmentRepository.pathOf` | Đóng |
| L7 | LOW | file xuất | Phòng ban trùng tên không dán lại được | Xuất phòng ban, chức danh dạng `[MÃ] Tên`; nhập nhận dạng này cho cả chức danh | Đóng |
| L8 | LOW | `department.service.ts` `parentFor` | `.catch(() => null)` nuốt mọi lỗi | Chỉ bắt `NOT_FOUND` | Đóng |
| L9 | LOW | `department.service.ts` | Kiểm nhà máy cả khi không đổi; ô chọn có nhà máy đã tắt | Chỉ kiểm khi đổi; ô chọn chỉ nhà máy đang dùng | Đóng |
| L10 | LOW | `isActiveEmployee` | Người có quyền sửa sơ đồ mà không xem được hồ sơ dò được Id nhân viên đang làm | Không sửa: chỉ lộ có hay không | Bỏ |
| L11 | LOW | xem trước nhập | Khóa `errors.idNumber` làm chính sách cột ghi nhật ký đọc giả | Lỗi dạng danh sách `[{ field, message }]` | Đóng |
| L12 | LOW | nhật ký | Không biết cột nhạy cảm nào bị đổi; nhập chỉ có một dòng `IMPORT` | Cột nhạy cảm ghi "(đã đổi)"; nhập ghi mỗi người một dòng `CREATE` cùng dòng `IMPORT` | Đóng |
| L13 | LOW | `hr-data.ts` | Sinh nhân viên giả không trong transaction | Bọc transaction | Đóng |
| L14 | LOW | `eslint.config.mjs` | Module khác vẫn import được nội bộ `hr` | Thêm `NO_HR` vào luật của `order`, `sewing` | Đóng |
| L15 | LOW | `createNumbered` | Gọi cho tài nguyên SHARED thì lỗi khi chạy | Báo lỗi rõ ngay đầu hàm | Đóng |
| L16 | LOW | `seed.ts` | Đổi `ScopeType` chỉ ghi số đếm | `console.warn` và ghi `scopeChanges` vào nhật ký `SEED` | Đóng |
| L17 | LOW | `clearHr`, `reset-demo` | Xóa cả bảng danh mục mà thông báo không nói | Thông báo, chú thích, `db-hr.md` nói rõ (loại phòng ban, Id đổi) | Đóng |
| L18 | LOW | `hr.spec.ts` | Thiếu ca test | Thêm: Nhân sự ở phiên `A01` thấy và sửa dữ liệu toàn công ty; xuất file thấy CCCD và ghi `SysSensitiveReadLog` EXPORT; `parseDate('1990')`; nhật ký "(đã đổi)". Chưa thêm ca cột không được sửa khi nhập (seed chưa có vai trò nào có quyền thêm mà cột bị khóa) | Đóng một phần |

Phát hiện thêm khi viết test frontend (không thuộc báo cáo agent):
- `Select` của Mantine giữ nhãn cũ khi giá trị đổi thành chuỗi rỗng, nên chức danh bị bỏ chọn vẫn hiện.
- Đã sửa (`EmployeePanel.tsx`, `selectProps`), có test.

**Lint, test, build sau khi sửa:**
- `npm run lint` (backend, frontend) qua;
- frontend 123 test qua (`hr.test.tsx` 8 bài);
- `npm run build` qua.
- Sau khi người dùng tạo `MES_Hr` (11/10/2026):
  - `npm run migrate -- MES_Hr`, `npm run seed`, `check:softkeys` qua;
  - test backend 15 bộ, 201 bài qua (`hr.spec.ts` 11 bài); test tự dọn hết dữ liệu `TST`.

**Còn lại trước khi chuyển Ready for review:**
- kiểm trên app thật (máy tính, điện thoại);
- review lượt 2 phần giao diện theo `docs/thiet-ke/quy-tac-ui-ux.md`.

---

# Review Phase 5.8 – 11/10/2026 (lượt 2: giao diện)

**Phạm vi:** 14 file.
- `frontend/src/features/hr/` (11 file), `frontend/src/routes/registry.tsx`
- phần `hr-*` của `frontend/src/theme/global.css`, `frontend/src/test/hr.test.tsx`

**Kết luận agent:** BLOCK (0 CRITICAL, 1 HIGH, 6 MEDIUM, 13 LOW). Sau khi sửa: không còn CRITICAL/HIGH mở.

**Agent đã kiểm, đúng:**
- dùng đúng thành phần chung (`WorkPage`, `ActionButton`, `confirmAction`, `confirmDiscard`, `useLeaveGuard`, `DebouncedTextInput`, `DateField`, `SheetGrid`);
- nút ghi ẩn theo `useCan`, phiên `A00` có quyền Nhân sự vẫn thấy nút ghi (ADR 0012 mục 5);
- chính sách cột: cột Ẩn không hiện, cột Che hiện `***`, khi lưu không gửi `***` hay cột không được sửa;
- khóa truy vấn, làm mới sau khi ghi, không gọi API theo từng phím, không vòng lặp URL;
- đúng hợp đồng API; bàn phím, aria, heading; CSS theo biến, có chế độ tối.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| H1 | HIGH | `OrgChartPage.tsx`, `EmployeesPage.tsx` (điện thoại) | Đổi tab gỡ hẳn form: mất phần đang nhập, tắt luôn chặn rời màn | Giữ cả hai khung, ẩn khung không xem bằng `hidden`. Test ở cả 2 màn: đổi tab rồi quay lại vẫn còn chữ, chọn mục khác vẫn hỏi lại | Đóng |
| M1 | MEDIUM | `OrgChartPage.tsx` | Lưu xong không mở nhánh tới phòng ban vừa thêm, vừa chuyển: hàm mở dùng cây cũ (chưa có phòng ban mới) | Mở theo phòng ban cha (cha luôn có trong cây cũ). Test: thêm phòng ban con dưới phòng ban chưa có con | Đóng |
| M2 | MEDIUM | `DepartmentPanel.tsx`, `EmployeePanel.tsx` | Chọn lại đúng thao tác thêm, bấm Bỏ thay đổi: form giữ chữ cũ mà trang tưởng đã sạch | Mode thêm mới mang số lượt `seq`, dùng làm `key` của form. Test | Đóng |
| M3 | MEDIUM | `EmployeePanel.tsx` | Đang sửa mà tải lại hồ sơ lỗi (mạng chập chờn) thì form bị thay bằng thông báo lỗi | Đã có dữ liệu thì giữ form; ở khung xem chỉ báo lỗi nhỏ phía trên | Đóng |
| M4 | MEDIUM | `EmployeesPage.tsx` | Sửa xong danh sách nhảy sang phòng ban của nhân viên, về trang 1 | Chỉ khi thêm mới mới chuyển phòng ban (kèm bỏ lọc chức danh); sửa thì giữ bộ lọc, trang. Test | Đóng |
| M5 | MEDIUM | `EmployeesPage.tsx`, `api.ts` | Link có `?dept=` tải danh sách cả công ty một lượt trước, hiện nhầm một nhịp | Chưa biết phạm vi thì chưa tải (`useEmployees(f, enabled)`); Xuất file khóa, nói lý do. Test | Đóng |
| M6 | MEDIUM | `DepartmentTree.tsx`, CSS | Vùng chạm trên cây 22px (quy-tac H.2) | Màn cảm ứng: dòng 40px, mũi tên và nút ⋯ 32px. Mũi tên là `button` (quy-tac I.2), không là điểm dừng của Tab | Đóng |
| L1 | LOW | `common.tsx` | Ô chọn phòng ban mất thụt lề khi đã có giá trị | So chữ tìm với nhãn của giá trị đang chọn (như Mantine) | Đóng |
| L2 | LOW | `DepartmentPanel.tsx` (ô Người quản lý) | Gửi nhãn người đang chọn làm chữ tìm | Bỏ qua chữ tìm trùng một nhãn trong danh sách | Đóng |
| L3 | LOW | 2 màn | Lỗi tải cây lần đầu hiện cùng "Chưa có phòng ban nào" | Chưa có dữ liệu thì chỉ báo lỗi | Đóng |
| L4 | LOW | `DepartmentTree.tsx`, `EmployeeList.tsx` | `memo` của dòng cây, thẻ nhân viên không có tác dụng | Hàm ổn định qua ref (như `SheetGrid`); style của dòng giữ một object theo nội dung | Đóng |
| L5 | LOW | `OrgChartPage.tsx` | Bỏ tích "Hiện phòng ban đã giải thể" khi đang sửa phòng ban đã giải thể: form "Sửa undefined" | Hỏi trước rồi về khung xem; form sửa không dựng khi phòng ban không còn | Đóng |
| L6 | LOW | `EmployeeImportModal.tsx` | File mẫu ghi "Tình trạng *", lưới không bắt buộc | Dùng chung một điều kiện. Test | Đóng |
| L7 | LOW | `EmployeeList.tsx` | Link cũ có trang vượt trang cuối báo nhầm "chưa có nhân viên" | `useClampPage` | Đóng |
| L8 | LOW | `EmployeePanel.tsx` | Ô ngày bị Che hiện "Invalid Date" | Mọi ô bị Che hiện `***` dạng chữ chỉ đọc | Đóng |
| L9 | LOW | `OrgChartPage.tsx` | Menu nút Thêm phòng ban lặng lẽ bỏ mục | Hiện mục bị khóa kèm lý do, như menu chuột phải | Đóng |
| L10 | LOW | `DepartmentTree.tsx` | Đang tìm thì mũi tên không làm gì | Mở, thu gọn được trong lúc tìm (chỉ áp cho kết quả tìm đó) | Đóng |
| L11 | LOW | `EmployeePanel.tsx` | Nhân viên trên URL không còn: "Thử lại" vô ích | Báo "Không thấy nhân viên này" kèm nút Bỏ chọn | Đóng |
| L12 | LOW | CSS `.hr-span-2`, `.hr-fact[data-wide]` | Khung hẹp một cột mà ô rộng chiếm 2 cột, có thể tràn ngang | Container query trên `.hr-panel` | Đóng |
| L13 | LOW | lặt vặt | Tự đảo ngày; tên chưa thống nhất; rỗng chưa gợi ý bước tiếp; Hủy không khóa khi đang lưu; `as never` | `fmtDate`; "Đang làm việc", "Thứ tự trong cùng cấp"; gợi ý Thêm nhân viên hoặc Nhập từ Excel; khóa Hủy và đóng popup khi đang lưu; dùng kiểu `RenderTreeNodePayload` | Đóng |
| T | – | `hr.test.tsx` | Thiếu test | Thêm 6 bài (H1 ở 2 màn, M1, M2, M4, M5) và một ý cho L6. Chưa thêm: chính sách cột trên giao diện, lỗi 409/422 gắn dưới ô, vai trò chỉ xem, luồng popup nhập, đồng bộ URL | Đóng một phần |

Phát hiện thêm khi viết test (không thuộc báo cáo agent):
- `lib/confirm.tsx` đếm số hộp hỏi đang mở bằng biến dùng chung cả module.
- Một bài test kết thúc khi hộp hỏi còn mở thì `confirmDiscard` ở các bài sau bị bỏ qua.
- Đã sửa trong test: đóng hộp bằng "Tiếp tục sửa" (`keepEditing`), như các test khác của dự án.

**Lint, test, build sau khi sửa:**
- `npm run lint`, `tsc` (frontend) qua;
- frontend 129 test qua (`hr.test.tsx` 14 bài);
- `npm run build` qua.

**Còn lại trước khi chuyển Ready for review:**
- người dùng kiểm trên app thật (máy tính, điện thoại);
- M4 lượt 1 chờ người dùng chốt.

---

# Review Phase 5.8 – 11/10/2026 (lượt 3: seed không dữ liệu mẫu)

**Bối cảnh:** người dùng cần cài lại server 10.0.0.216 sạch, không dữ liệu giả, và chọn hướng "Sạch, không dữ liệu giả".

**Thay đổi:**
- `SEED_SAMPLE_DATA` (`env.ts`): đọc chặt `true`/`false`, mặc định `false` khi `NODE_ENV=production`.
- Cờ `npm run seed -- --no-sample-data`.
- Chốt chung `assertDemoMachine` cho `reset:demo`, `load:bravo`, `sim:board`, `clearHr`, `clearSewingPrep`.

**Phạm vi:**
- `backend/src/config/env.ts`, `backend/.env.example`
- `backend/scripts/seed.ts`, `hr-data.ts`, `local-db.ts`, `reset-demo.ts`, `load-bravo-orders.ts`, `simulate-board.ts`, `sewing-data.ts`

**Kết luận agent:** BLOCK (0 CRITICAL, 2 HIGH, 2 MEDIUM, 4 LOW). Sau khi sửa: H1 đóng, H2 chờ người dùng chốt phạm vi.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| H1 | HIGH | `seed.ts` bước 13, `hr-data.ts` | Tắt dữ liệu mẫu thì bỏ cả loại phòng ban và chức danh. Hai danh mục này chưa có màn sửa nên module Nhân sự không tạo được phòng ban, nhân viên nào | `seedHr(db, { sample })`: luôn nạp 5 loại phòng ban và 7 chức danh dùng chung; phòng ban mẫu, chức danh gắn phòng ban mẫu, nhân viên giả chỉ khi có dữ liệu mẫu | Đóng |
| H2 | HIGH | `seed.ts` bước 10, `seed-data.ts` | Vẫn tạo 7 tài khoản demo dùng chung `DEMO_PASSWORD`, kèm ngoại lệ, phạm vi mẫu. Lệch `cai-dat-windows-server.html` ("không tạo tài khoản demo") | Giữ như phạm vi người dùng đã chọn ("vẫn tạo tài khoản"); tài liệu cài đặt ghi bắt buộc đổi mật khẩu `admin`, khóa tài khoản không dùng ngay sau seed. **Chờ người dùng chốt** có bỏ tài khoản mẫu khi `false` không | Chờ chốt |
| M1 | MEDIUM | `env.ts` | Thiếu biến hoặc gõ sai (`0`, `no`) thì vẫn nạp dữ liệu giả | Đọc chặt (không phân biệt hoa thường, giá trị khác báo lỗi); mặc định `false` khi `NODE_ENV=production` | Đóng |
| M2 | MEDIUM | `simulate-board.ts`, `load-bravo-orders.ts` | Không xét biến: máy `false` mà thiếu `NODE_ENV=production` vẫn sinh, xóa dữ liệu | `assertDemoMachine` trong `local-db.ts`, dùng ở mọi script sinh hay xóa dữ liệu mẫu | Đóng |
| L1 | LOW | `reset-demo.ts` | Chạy thử vẫn bảo chạy lại với `--yes` rồi mới báo lỗi | Kiểm ngay đầu `main` | Đóng |
| L2 | LOW | `seed.ts` nhật ký SEED | Ghi `sampleData: true` cả khi `coreOnly` | Ghi `!coreOnly && sampleData` | Đóng |
| L3 | LOW | cờ dòng lệnh | `npm run seed --no-sample-data` thiếu `--` thì npm nuốt cờ | Máy thật dựa vào biến `.env` (mặc định theo `NODE_ENV`); tài liệu ghi đúng `-- --no-sample-data` | Đóng |
| L4 | LOW | `seed.ts` bước 6 | Xưởng và 26 chuyền mẫu vẫn vào máy thật | **Chờ người dùng chốt**, cùng H2 | Chờ chốt |

**Kiểm sau khi sửa:**
- `tsc`, `eslint` (backend) qua.
- Test `seed`, `hr`, `load-bravo`, `simulate-board` (2 bộ): 32 bài qua.
- `npm run seed -- --no-sample-data` ở máy dev in dòng "Bỏ qua dữ liệu mẫu", không thêm gì.
- `SEED_SAMPLE_DATA=false` thì `reset:demo` từ chối ngay.
- `SEED_SAMPLE_DATA=0` báo lỗi.
- `NODE_ENV=production` không đặt biến thì giá trị là `false`.

**Tài liệu đã cập nhật:**
- `CLAUDE.md` mục 8, `README.md`, `backend/.env.example`
- `docs/thiet-ke/cai-dat-windows-server.html`, `seed-demo.md`, `db-hr.md`

---

# Review Phase 5.8 – 11/10/2026 (lượt 4: migrate nạp dữ liệu hệ thống và tài khoản admin)

**Bối cảnh:** người dùng tự xóa, tạo lại database trên server và chốt luồng cài lần đầu: `npm ci` → `npm run build` → `npm run migrate`; migrate phải tạo bảng và có tài khoản đăng nhập. Lệnh `reinstall` viết trước đó đã gỡ theo yêu cầu (còn trong commit `67d2325`).

**Thay đổi:**
- `npm run migrate` chạy đủ:
  - kiểm `DEMO_PASSWORD` trước khi tạo bảng;
  - migrate mọi database rồi `runSeed({ sampleData: false })`: dữ liệu hệ thống và **chỉ tài khoản `admin`**;
  - kiểm `admin` có vai trò, quyền, nhà máy.
- `seed.ts`: không dữ liệu mẫu thì chỉ tạo `admin`. Lượt 3 H2 (7 tài khoản dùng chung mật khẩu) đóng theo thay đổi này.

**Kết luận agent:** BLOCK vì 1 HIGH (tài liệu); 0 CRITICAL, 2 MEDIUM, 7 LOW. Sau khi sửa: không còn CRITICAL/HIGH.

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| H1 | HIGH | Tài liệu bảo "đổi mật khẩu admin sau khi vào" nhưng không ai tự đổi được mật khẩu của mình (API chặn tự đặt lại) | README, `.env.example`, tài liệu cài đặt ghi 2 cách làm được: tạo tài khoản quản trị riêng rồi vô hiệu hóa `admin`; hoặc đổi `DEMO_PASSWORD` rồi `seed -- --reset-passwords`. Màn tự đổi mật khẩu, bắt đổi lần đầu: ghi Phát sinh | Đóng |
| M1 | MEDIUM | Seed lỗi giữa chừng lần cài đầu thì chạy lại không tự cấp quyền, gán vai trò cho admin | Migrate kiểm `admin` sau khi nạp, thiếu thì cảnh báo kèm `npm run seed -- --sync-matrix`; lỗi nạp dữ liệu báo riêng kèm lệnh này | Đóng |
| M2 | MEDIUM | `DEMO_PASSWORD` buộc nằm trong `.env`, không kiểm độ dài | Production đòi ít nhất 8 ký tự (như màn Người dùng). Cách (a) vô hiệu hóa `admin` làm mật khẩu trong `.env` hết tác dụng; seed không bật lại tài khoản đã vô hiệu | Đóng |
| L | LOW | Bỏ chốt `require.main`; thông báo lỗi chung; thư mục không sắp xếp; câu chữ cũ; nhật ký SEED không biết nguồn gọi; tài liệu lỗi thời, thiếu `MES_Hr`, `nhansu`; cảnh báo `NODE_ENV` | Đã sửa hết | Đóng |

**Kiểm sau khi sửa:**
- `tsc`, `eslint` qua; test `seed`, `hr` qua.
- `npm run migrate` ở máy dev: không migration mới, seed không thêm gì, không cảnh báo admin.
- Chưa thử trên database trống (máy dev không có quyền tạo database): người dùng chạy trên server.

---

# Review – 11/10/2026 (lượt 5: synonym qua linked server)

**Bối cảnh:** trên 10.0.0.216 đồng bộ lỗi "Synonym 'bravo.src_DM_CHINHANH' refers to an invalid object". Sau khi tạo lại database, migrate tạo synonym 3 phần trong khi `BRAVO_TRE` ở máy .225 (qua linked server `LS_BRAVO`).

**Thay đổi:**
- Biến `DB_TRUNGGIAN_SERVER`: migrate tạo synonym `[server].[BRAVO_TRE].[dbo].[view]` (ADR 0007 đã tính trước).
- Cảnh báo khi không thấy linked server.
- Xóa và tạo synonym trong một transaction.

**Kết luận agent:** APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 2 MEDIUM, 5 LOW).

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| M1 | MEDIUM | Linked server chưa đặt `query timeout` (mặc định 600 giây) | Thêm `sp_serveroption … 'query timeout', '3600'` vào bước B4 tài liệu cài đặt | Đóng (người dùng chạy trên .216) |
| M2 | MEDIUM | Thủ tục chép lọc view từ xa bằng bảng tạm cục bộ: có thể kéo cả view qua mạng mỗi lần chép tăng dần | Cần đo trên .216 (actual plan, thời gian một nguồn KEY và `ThongTinPO`). Chậm thì sửa `sync-gen.ts render()` + migration mới | Chờ đo |
| L1 | LOW | `sync-gen`, bài test chép thật kết nối thẳng database trung gian | Test bỏ qua khi có `DB_TRUNGGIAN_SERVER`; `db-sync.md` ghi sync-gen chạy ở máy kết nối thẳng được | Đóng |
| L2 | LOW | Gõ sai tên linked server thì tới lúc đồng bộ mới lỗi | Migrate cảnh báo khi không thấy trong `sys.servers` | Đóng |
| L3 | LOW | Tài liệu lệch (quy tắc tên, chú thích `.env.example`, câu cũ) | Đã sửa | Đóng |
| L4 | LOW | ADR 0007 ghi "không dùng linked server tới BRAVO", nay `LS_BRAVO` trỏ tới máy chứa cả `B8R2_VIETSUN` | Không tự sửa ADR; hỏi người dùng ghi chú bổ sung hay ADR mới | Chờ chốt |
| L5 | LOW | Xóa, tạo synonym không cùng transaction | Gộp một transaction | Đóng |

**Kiểm:**
- `tsc`, `eslint` qua; `sync.spec` 15/15.
- Ở máy dev: đặt biến thì 18 synonym 4 phần và có cảnh báo không thấy linked server; bỏ biến thì về 3 phần, chạy lại báo "đã đúng".

---

# Review – 11/10/2026 (lượt 6: nới `DM_DiaDiemGiaoHang.Address`)

**Bối cảnh:** trên .216 nguồn địa điểm giao hàng lỗi 7347: view `vDM_DiaDiemGiaoHang` trên .225 còn ghi `Address` 192 ký tự, cột thật `NVARCHAR(512)`, có dòng 197 ký tự. Phía BRAVO cần `sp_refreshview`; phía MES bảng chép và `#src` (sinh từ database trung gian máy dev, 192) phải nới để không lỗi 2628 sau khi refresh.

**Thay đổi:**
- `sync-gen.ts`: `minLengths` trong `SourceDef`, `widen()` áp trong `render()`; `vDM_DiaDiemGiaoHang` khai `Address: 512`.
- Migration `MES_Sync/0005_sync_widen_diadiem_address.sql`: `ALTER COLUMN [Address] NVARCHAR(512)` (viết tay) và thủ tục sinh lại (khác 0004 đúng một dòng).
- `sync-gen.spec.ts`: bảng chép (CREATE TABLE cuối + các ALTER sau đó) cùng kiểu và NULL/NOT NULL với `#src`; test đơn vị `widen()`.

**Kết luận agent:** APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 1 MEDIUM, 4 LOW).

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| M1 | MEDIUM | 7347 chỉ lộ cột đầu tiên có dòng dài; cột khác (`BillingAddress`, `Name`, `BuyerName`, cột của 17 view còn lại) có thể cũng lệch giữa máy dev và .225 | Nhờ DBA refresh và so độ dài cột các view MES đọc trên .225; lệch thì gộp vào `minLengths` và một migration | Chờ số liệu .225 |
| L1 | LOW | Test bỏ NULL/NOT NULL: ALTER ghi nhầm `NOT NULL` vẫn qua | So cả nullability (cột khóa nguồn KEY là `NOT NULL`) | Đóng |
| L2 | LOW | Test lấy CREATE TABLE đầu tiên, tính cả ALTER trong `/* */`, ALTER khác mẫu bị bỏ qua | Lấy CREATE TABLE cuối, chỉ áp ALTER sau nó, bỏ khối `/* */`; ghi mẫu một dòng ở test và `db-sync.md` | Đóng |
| L3 | LOW | `minLengths` trên cột khóa nguồn KEY: không ALTER được cột trong PRIMARY KEY | `widen()` báo lỗi; ghi ở `db-sync.md` | Đóng |
| L4 | LOW | Tài liệu thiếu thứ tự hai bước và lỗi giữa chừng | Thêm vào `db-sync.md` và bảng rủi ro `cai-dat-windows-server.html` (kèm 7359 nếu gặp thì chạy lại) | Đóng |

**Kiểm:**
- `tsc`, `npm run lint` qua; `sync-gen.spec` 38/38, `sync.spec` 15/15.
- Kiểm ngược trên bản sao 0005: bỏ ALTER, ALTER có `--`, ALTER trong `/* */`, ALTER ghi `NOT NULL` đều làm test báo lỗi.
- Chưa chạy migrate (người dùng chạy ở máy dev và .216).
