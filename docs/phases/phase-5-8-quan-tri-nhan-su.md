# Phase 5.8 – Quản trị nhân sự: Sơ đồ tổ chức, Thông tin nhân sự

**Trạng thái:** In progress (đã migrate, seed, review 2 lượt, test qua; còn người dùng kiểm trên app thật, chốt M4) · **Bắt đầu:** 11/10/2026 · **Nguồn:** `docs/nguon/KE-HOACH-MES-VSN.md` · **Thiết kế:** `docs/thiet-ke/db-hr.md`, ADR 0012

## Mục tiêu
Thay 2 trang giữ chỗ trong nhóm menu Quản trị nhân sự (`hr`, seed 10/10/2026) bằng màn chạy thật:
- **Sơ đồ tổ chức** (`hr.orgchart`, `/hr/org-chart`): cây phòng ban nhiều cấp; thêm phòng ban con hoặc cùng cấp, sửa, giải thể, khôi phục.
- **Thông tin nhân sự** (`hr.employee`, `/hr/employees`): hồ sơ nhân viên lọc theo cây phòng ban; thêm, sửa, xuất file, nhập hàng loạt bằng cách dán từ Excel.

Nghiệp vụ, quy tắc kiểm tra và bố cục lấy từ 2 màn đang chạy ở Support-Web (ASM). Không chép code (khác stack), và sửa 14 điểm yếu của bản gốc (`KE-HOACH-MES-VSN.md` mục 2.4).

## Chốt với người dùng (11/10/2026)
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Nguồn dữ liệu nhân sự | **MES tự quản**: thêm, sửa, nhập từ Excel. Khác tổng quan dự án ("Nhân sự: đã có, MES chỉ lấy về dùng"), nên ghi ngoại lệ vào ADR 0012. Bảng thiết kế để sau này chuyển sang đồng bộ chỉ phải thêm cột nguồn (`KE-HOACH-MES-VSN.md` mục 5) |
| Q2 | Sơ đồ tổ chức có phải cây `SysOrgUnit` | **Không.** Dùng bảng `Department` riêng (cây hành chính) ở database mới `MES_Hr`. Phòng ban thuộc một nhà máy thì gắn `BranchCode` (khóa ngầm). `SysOrgUnit` (ADR 0010) giữ nguyên |
| Q3 | Theo nhà máy hay dùng chung | **Dùng chung**: `hr.orgchart`, `hr.employee` đăng ký `ScopeType = 'SHARED'`. Giới hạn theo phòng ban (L3) làm sau |
| Q5 | Ai được thêm, sửa | **Thêm vai trò mới Nhân sự (`HR`)**, có `VCUE` ở cả 2 màn, kèm tài khoản mẫu `nhansu`. ADMIN giữ quyền Xem, đúng tách nhiệm vụ của ADR 0004 (không theo khuyến nghị gốc "cho ADMIN `VCUE`") |
| – | Mã nhân viên | **Sửa được, chỉ cấm trùng**; `Id` (khóa chính tự sinh) không đổi, mọi liên kết theo `Id` (ADR 0012 mục 4) |
| – | Dữ liệu | Làm màn hình với dữ liệu giả, BA bổ sung trường và dữ liệu sau |

Theo khuyến nghị của file kế hoạch (người dùng không có ý kiến khác):
- **Q4 – Chức danh:** danh mục phẳng `JobTitle`, gắn tùy chọn 1 phòng ban. Phòng ban để trống thì chức danh dùng chung; có phòng ban thì chức danh dùng cho phòng ban đó và cả nhánh con. Không làm "hoạch định vị trí". Loại phòng ban `IsFinalLevel` **chặn thật** việc thêm cấp con.
- **Q6 – Trường từ máy chấm công:** giữ 15 trường, bỏ "Mật mã". Đánh dấu nhạy cảm (`SysResourceField.IsSensitive`) cho `idNumber`, `birthDate`, `currentAddress`, `contactPhone`, `contactPerson`.
- **Q7 – Nhập hàng loạt:** dán từ Excel vào lưới nhập `SheetGrid` (ADR 0008), không thêm thư viện đọc `.xlsx`. File mẫu là CSV có sẵn tiêu đề, tạo ngay trên trình duyệt.
- **Q8 – Nối tài khoản với nhân viên:** để sau. **Chưa khai** khóa ngầm `SysUser.EmployeeCode → Employee.Code` vì mã nhân viên sửa được; khi làm thì thêm `SysUser.EmployeeId` (ADR 0012 mục 4).

## Điều chỉnh so với file kế hoạch (đối chiếu code MES ngày 11/10/2026)
1. **Vai trò `HR`.** Kiểu `Matrix` trong `backend/scripts/seed-data.ts` thêm cột thứ 7 (tùy chọn) cho `HR`, các dòng khác bỏ trống là không có quyền. Bảng ma trận trong `docs/thiet-ke/seed-demo.md` thêm cột HR.
2. **Danh sách nhân viên dạng thẻ** (bố cục Support-Web) không có tiêu đề cột, nên **không có popup lọc theo cột** và bỏ endpoint `GET /hr/employees/values`. Tìm và lọc (phòng ban gồm nhánh con, chức danh, tình trạng) vẫn chạy trong DB, sắp mới tạo lên trước, 20 thẻ/trang. Ghi ngoại lệ ADR 0011 vào ADR 0012.
3. **Số ADR 0012** đang được `docs/thiet-ke/de-xuat-metadata-driven.html` nhắc tới (đề xuất chưa chốt). Module nhân sự lấy số 0012 vì viết trước; đề xuất metadata-driven dùng số kế tiếp khi được duyệt.
4. **Kết nối `MES_Hr`.** `.env.example` (`DB_HR_NAME`), `config/env.ts` (`db.hrName`), `scripts/migrate.ts`, `scripts/check-softkeys.ts`, `modules/hr/hr.db.ts`. Tài khoản ứng dụng không tạo được database, nên **người dùng hoặc quản trị CSDL tạo `MES_Hr` và cấp `db_owner`** trước khi chạy migration (như `MES_Sewing`).
5. **`A00` và `BranchCode` của phòng ban.** Với tài nguyên `SHARED`, `BaseRepository.assertWritable` không chặn phiên `A00`, nên người có quyền ghi vẫn sửa được ở `A00` (giống Danh mục hệ thống). Riêng `Department.BranchCode` thì service **từ chối nhà máy tổng hợp** (`SysBranch.IsAggregate`), vì `A00` không gắn dữ liệu.
6. **Cây phòng ban:** dùng `Tree`/`useTree` của `@mantine/core` 9.7 (bàn phím có sẵn; trạng thái mở giữ khi tải lại).
   - **Ô chọn phòng ban** (phòng ban cha, phòng ban của nhân viên) dùng `Select` của Mantine: lựa chọn thụt lề theo cấp, tìm không dấu, khi tìm hiện đường dẫn cha.
   - Không dùng `components/TreeSelect` (nhóm không chọn được, mà phòng ban có con vẫn phải chọn được). Không dùng `TreeSelect` của Mantine (bấm nút cha chỉ mở nhánh).
7. **Seed đồng bộ `ScopeType`:** 2 tài nguyên `hr.*` đã tạo dạng `BRANCH` ngày 10/10/2026, seed nay đồng bộ phạm vi theo `seed-data.ts`, có cảnh báo và ghi chi tiết vào nhật ký `SEED`.
8. **`BaseRepository<R extends { Id: number }>`:** nới ràng buộc kiểu (bảng SHARED không có cột `BranchCode`); `createNumbered` báo lỗi rõ khi gọi cho tài nguyên SHARED.

## Task

| # | Task | Ngày | Tiêu chí xong | Phụ thuộc | Trạng thái |
|---|---|---|---|---|---|
| 5.8.0 | ADR 0012; `docs/thiet-ke/db-hr.md`; mục `hr` trong `api-contract.md` | 0,25 | Người dùng duyệt ADR và thiết kế bảng | – | Xong, chờ duyệt |
| 5.8.1 | Migration `MES_Hr/0001_hr_init.sql`; `env.ts`, `migrate.ts`, `.env.example`, `hr.db.ts`; `softkeys.json` | 0,5 | Người dùng tạo DB và chạy migration thành công; `check:softkeys` qua; **review ngay** (migration) | 5.8.0 | Xong. Người dùng tạo `MES_Hr` 11/10/2026; `npm run migrate -- MES_Hr` chạy `0001`; `check:softkeys` qua (3 khóa ngầm mới) |
| 5.8.2 | Seed: vai trò `HR`, tài khoản `nhansu`; ma trận 7 cột; `SysResource` (`SHARED`, `table`), `SysResourceField`; dữ liệu giả; `reset:demo` nạp lại dữ liệu nhân sự | 0,5 | `npm run seed` chạy lại nhiều lần không lỗi, không cấp lại quyền đã thu hồi; **review ngay** | 5.8.1 | Xong. `npm run seed` thêm 5 loại phòng ban, 12 phòng ban, 13 chức danh, 40 nhân viên |
| 5.8.3 | Backend phòng ban: cây, chi tiết, tạo, sửa, chuyển nhánh, giải thể, khôi phục, ô Người quản lý + test | 1 | Test phần phòng ban qua | 5.8.1 | Xong. `backend/test/hr.spec.ts` qua 11/11 |
| 5.8.4 | Frontend Sơ đồ tổ chức | 1,5 | Đủ hành vi mục 2.1 và 4.3; chạy thử trên trình duyệt và điện thoại | 5.8.3 | Xong (`features/hr/OrgChartPage.tsx`, `DepartmentPanel.tsx`, `DepartmentTree.tsx`); test frontend qua. Chưa chạy thử trên app thật |
| 5.8.5 | Backend nhân viên: options, danh sách (lọc nhánh con), chi tiết, tạo, sửa, xuất CSV + test | 1 | Che cột nhạy cảm ở danh sách, chi tiết, file xuất; test qua | 5.8.1 | Xong, test qua |
| 5.8.6 | Frontend Thông tin nhân sự: sidebar kéo giãn (cây và danh sách thẻ), form 4 nhóm, xuất file | 1,5 | Đủ hành vi mục 2.2 và 4.3 (trừ popup lọc theo cột) | 5.8.5 | Xong (`EmployeesPage.tsx`, `EmployeeList.tsx`, `EmployeePanel.tsx`); test frontend qua |
| 5.8.7 | Nhập từ Excel: `import/preview`, `import/commit`, popup `SheetGrid` + test | 1,25 | Dán từ Excel, sửa ô lỗi tại chỗ, lưu; mỗi dòng ghi độc lập, có kết quả từng dòng | 5.8.5, 5.8.6 | Code, test xong (`EmployeeImportModal.tsx`) |
| 5.8.8 | `code-reviewer` toàn phase, sửa phát hiện; cập nhật tài liệu | 0,5 | Không còn `CRITICAL`/`HIGH`; `npm run lint`, `npm test`, `npm run build` qua; chạy kịch bản nghiệm thu mục 7 | tất cả | Lượt 1, lượt 2 xong (`docs/review/phase-5-8.md`): lượt 2 có 1 HIGH, 6 MEDIUM, 13 LOW, đã sửa hết. Test backend, frontend qua. Còn: người dùng kiểm trên app thật |
| | **Tổng** | **~8** | | | |

**Tham chiếu chi tiết** (không chép lại ở đây):
- trường và quy tắc: `KE-HOACH-MES-VSN.md` mục 2;
- bảng: `docs/thiet-ke/db-hr.md`;
- API: `docs/thiet-ke/api-contract.md` mục 4c;
- test: mục 4.5 của kế hoạch;
- nghiệm thu: mục 7 của kế hoạch;
- đối chiếu cột Support-Web: mục 8.2.

## Không làm
- Đồng bộ từ hệ thống Nhân sự khác (Q1). Nếu BA chốt lấy về thì mở phase riêng theo mục 5 của file kế hoạch.
- Hoạch định vị trí (Công việc × Cấp bậc × Phòng ban), định biên, định mức (Q4).
- Màn sửa danh mục Loại phòng ban, Chức danh (hiện chỉ có dữ liệu seed, xem Phát sinh).
- Tải lên file `.xlsx` (Q7).
- Nối tài khoản đăng nhập với nhân viên trên giao diện (Q8).
- Phân quyền theo phòng ban (L3).
- Quá trình công tác (lịch sử đổi phòng ban, chức danh).
- Màn "Organization Chart" thống kê và màn "Nhân viên chưa có hồ sơ" của Support-Web.
- Xóa vật lý phòng ban, nhân viên.
- Chuyển dữ liệu thật từ `SupportDB_v3`: giai đoạn này chỉ dùng dữ liệu giả.

## Rủi ro
- **Mã phòng ban bất biến** (nằm trong `Path`): nhập sai mã phòng ban thì phải giải thể rồi tạo lại. Muốn sửa được như mã nhân viên thì đổi `Path` sang theo `Id` (ADR mới).
- **Tổng quan dự án đổi hướng:** nếu BA xác nhận hệ thống Nhân sự là nguồn chính, phần nhập liệu của phase này sẽ thành chỉ xem phần lấy về.
- **Mã phòng ban thật** ở Support-Web có thể chứa ký tự ngoài `A-Z0-9-` (khoảng trắng, gạch dưới). Mã nằm trong `Path`, nên khi chuyển dữ liệu thật phải ánh xạ mã.
- **Số lượng lớn:** nhà máy may có hàng nghìn công nhân. Danh sách, ô Người quản lý tìm và phân trang trên server; tìm không dấu quét bảng, vượt khoảng 10.000 người thì thêm cột tính sẵn.

## Phát sinh
- 11/10/2026, người dùng chốt **mã nhân viên sửa được**, chỉ cấm trùng; `Id` không đổi. Đã đưa vào ADR 0012 mục 4, migration (không trigger khóa mã nhân viên), API (`PUT` nhận `code`), nhật ký ghi mã cũ và mới.
- 11/10/2026, review lượt 1 (`docs/review/phase-5-8.md`): 0 CRITICAL, 0 HIGH, 6 MEDIUM, 18 LOW.
  - Đã sửa: M1, M2, M3, M5, M6 và 17/18 LOW.
  - Giữ nguyên: L10 (dò Id nhân viên đang làm qua ô người quản lý; chỉ lộ có hay không).
  - **M4 chờ người dùng chốt:** phạm vi nhà máy không có tác dụng với `hr.*` (ADR 0012 mục 5).
- 11/10/2026, lỗi giao diện tìm được khi viết test:
  - `Select` của Mantine giữ chữ cũ khi giá trị đổi thành chuỗi rỗng: chức danh vừa bị bỏ chọn (đổi phòng ban) vẫn hiện.
  - Đã sửa: ô chọn của form nhân viên nhận `null` khi trống. Có test.
- **Danh mục Loại phòng ban, Chức danh chưa có màn sửa:** chỉ có dữ liệu seed.
  - Đề xuất: thêm vào Quản trị › Danh mục hệ thống (như Cấu hình chuẩn bị SX), hoặc làm khi BA gửi danh mục thật.
  - Chờ người dùng chốt.
  - 12/10/2026, người dùng yêu cầu làm danh mục Loại phòng ban (tự thêm loại mới). Kế hoạch task 5.8.9: `phase-5-8-9-loai-phong-ban.md`, chờ chốt Q1–Q5. Chức danh chưa làm.
- 11/10/2026, người dùng tạo `MES_Hr`. Đã chạy migration, seed, `check:softkeys`, test backend.
  - Lần chạy đầu `hr.spec.ts` lỗi 1 bài do chính test: bài giải thể quên rằng `TST002` đã được chuyển sang phòng A ở bài trước, nên giải thể A bị chặn đúng luật.
  - Đã sửa test: kiểm thêm A bị chặn vì 1 nhân viên đang làm, chuyển người đó đi rồi mới giải thể.
- 11/10/2026, người dùng cài lại server 10.0.0.216 và chọn hướng sạch, không dữ liệu giả.
  - Đã thêm `SEED_SAMPLE_DATA` (mặc định `false` khi `NODE_ENV=production`) và cờ `--no-sample-data`.
  - Seed bỏ đơn hàng giả, phòng ban và nhân viên giả; vẫn nạp loại phòng ban và chức danh dùng chung.
  - `reset:demo`, `load:bravo`, `sim:board` từ chối khi `false`.
  - Review lượt 3 (`docs/review/phase-5-8.md`): H1, M1, M2, L1–L3 đã sửa.
  - Người dùng chốt luồng cài: `npm ci`, `npm run build`, `npm run migrate`. Migrate nạp dữ liệu hệ thống và chỉ tài khoản `admin` (review lượt 4). Xưởng, chuyền mẫu vẫn tạo, sửa ở màn Danh mục hệ thống.
- Chưa có màn tự đổi mật khẩu, chưa bắt đổi mật khẩu lần đầu: không ai tự đổi được mật khẩu của mình, `admin` ban đầu phải đổi bằng tài khoản quản trị khác hoặc `seed -- --reset-passwords`. Đề xuất làm sau (ngoài phạm vi 5.8).
- 11/10/2026, server .216 đọc `BRAVO_TRE` ở .225 qua linked server: thêm `DB_TRUNGGIAN_SERVER` để migrate tạo synonym 4 phần (review lượt 5). Thuộc phạm vi đồng bộ (5.2), làm theo yêu cầu khi triển khai.
  - Chờ đo trên .216: tốc độ chép qua linked server.
  - Chờ chốt: ghi chú ADR 0007 hay ADR mới.
  - Còn 2 việc phía BRAVO: cấp `EXECUTE` `ufn_Agg_Concat` cho `mesvsn_user`; `sp_refreshview` view lệch độ dài cột (`vDM_DiaDiemGiaoHang.Address`), rồi migration nới cột trong `MES_Sync`.
  - 11/10/2026: trên .216 lỗi 7347 ở `vDM_DiaDiemGiaoHang.Address` (view trên .225 ghi 192 ký tự, cột thật `NVARCHAR(512)`). Phía MES xong: `minLengths` trong `sync-gen.ts`, migration `MES_Sync/0005` nới `Address` lên 512 ở bảng chép và thủ tục, `sync-gen.spec` kiểm thêm bảng chép cùng kiểu với `#src` (review lượt 6, không còn CRITICAL/HIGH). Còn: quản trị CSDL .225 chạy `sp_refreshview`; người dùng chạy `npm run migrate` ở máy dev và .216; chưa rõ `BillingAddress` trên .225 có dài hơn 192 không.

- 12/10/2026, người dùng báo form Thêm nhân viên, Thêm phòng ban bị so le: dòng chú thích dưới nhãn (và khoảng đệm Mantine thêm cho ô có chú thích) đẩy ô đó thấp hơn các ô cùng hàng.
  - Đã sửa: ô của hai form bọc bằng `FieldCell` (`features/hr/common.tsx`). Chú thích hiện khi rê chuột, Tab tới hoặc chạm vào ô; nhãn có dấu ⓘ. Chú thích vẫn là `description` ẩn bằng CSS nên trình đọc màn hình đọc được.
  - Phạm vi: chỉ hai form này (dùng chung cho Sửa hồ sơ, Sửa phòng ban). Các màn khác giữ chú thích dưới nhãn.
