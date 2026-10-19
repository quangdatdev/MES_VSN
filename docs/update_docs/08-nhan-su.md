# Module Nhân sự: Sơ đồ tổ chức và Thông tin nhân sự

File này mô tả module Nhân sự đang có trong code: màn Sơ đồ tổ chức, màn Thông tin nhân sự (kèm nhập nhân viên từ Excel), danh mục Loại phòng ban, trường nhạy cảm, API `/hr/*` và database `MES_Hr`.
Đọc khi sửa hai màn này, thêm trường cho hồ sơ nhân viên, hoặc nối module khác với nhân viên, phòng ban.
Luật chung của `BaseRepository`, chính sách cột, vai trò Toàn quyền: [Phân quyền](04-phan-quyen.md). `SheetGrid`, `WorkPage`, quy tắc UI chung: [Giao diện](10-giao-dien.md).

## Tổng quan

MES **tự quản dữ liệu nhân sự**: thêm, sửa, nhập hàng loạt ngay trong MES, không lấy về từ hệ thống khác (ADR 0012 mục 1). Nếu sau này lấy từ hệ thống Nhân sự khác thì thêm nguồn đồng bộ qua `MES_Sync` và cột nhận diện nguồn, bảng giữ nguyên. Nghiệp vụ lấy theo hai màn của Support-Web nhưng không chép code, và sửa các điểm yếu của bản gốc (mã đổi được qua API, cha nằm trong nhánh con, giải thể làm mồ côi phòng ban con, chức danh không kiểm theo phòng ban, lộ CCCD…), xem `docs/nguon/KE-HOACH-MES-VSN.md` mục 2.4.

| Màn | Đường dẫn | Quyền | Frontend | Backend |
|---|---|---|---|---|
| Sơ đồ tổ chức | `/hr/org-chart` (nhóm menu Quản trị nhân sự) | `hr.orgchart:view`, `:create`, `:update` | `frontend/src/features/hr/OrgChartPage.tsx`, `DepartmentPanel.tsx`, `DepartmentTree.tsx` | `backend/src/modules/hr/hr.controller.ts` (`DepartmentController`), `department.service.ts` |
| Thông tin nhân sự | `/hr/employees` (nhóm menu Quản trị nhân sự) | `hr.employee:view`, `:create`, `:update`, `:export` | `EmployeesPage.tsx`, `EmployeeList.tsx`, `EmployeePanel.tsx`, `EmployeeImportModal.tsx` | `hr.controller.ts` (`EmployeeController`), `employee.service.ts`, `employee-import.service.ts`, `employee-fields.ts` |
| Loại phòng ban (danh mục) | `/admin/catalogs?c=DEPT_TYPE` (Quản trị › Danh mục hệ thống) | `admin.catalog:view`, `:create`, `:update` | `frontend/src/features/admin/CatalogsPage.tsx` (`DepartmentTypesPane`, `DepartmentTypeDialog`) | `hr.controller.ts` (`DepartmentTypeController`), `department-type.service.ts` |

**Các file khác của module:**

| File | Vai trò |
|---|---|
| `backend/src/modules/hr/hr.module.ts` | Khai module; không phụ thuộc module nghiệp vụ khác |
| `backend/src/modules/hr/hr-line-source.ts` | `HrLineSource`: nguồn chuyền may (bộ phận tích "Xưởng sản xuất") đăng ký vào `OrgService` của nền tảng lúc khởi động (mục Chuyền may) |
| `backend/src/modules/hr/hr.db.ts` | Kết nối riêng tới `MES_Hr` (tên lấy từ `DB_HR_NAME`, mặc định `MES_Hr`) |
| `backend/src/modules/hr/hr.types.ts` | Kiểu Kysely của 4 bảng |
| `backend/src/modules/hr/hr.dto.ts` | DTO và bộ kiểm đầu vào |
| `backend/src/modules/hr/hr.repositories.ts` | `DepartmentRepository`, `EmployeeRepository` (qua `BaseRepository`), `HrCatalogRepository` (loại phòng ban, chức danh) |
| `backend/src/modules/hr/employee-fields.ts` | Định nghĩa **một chỗ** các trường của hồ sơ (khóa API, cột DB, nhãn, nhóm, kiểu, bắt buộc, độ dài, tên gọi khác khi dán Excel) |
| `frontend/src/features/hr/api.ts`, `types.ts` | Hook gọi API, khóa truy vấn `HR_KEYS`, kiểu dữ liệu |
| `frontend/src/features/hr/tree.ts` | Dựng cây từ danh sách phẳng, lọc cây, lựa chọn phòng ban thụt lề, bỏ dấu (`fold`) |
| `frontend/src/features/hr/common.tsx` | `DepartmentSelect` (ô chọn phòng ban dạng cây), `FieldCell` (ô form có chú thích dạng tooltip), `WorkshopBadge` (dấu "Xưởng sản xuất"), `Splitter`, `useStoredSize`, `Fact`, `Trail`, `LoadError` |
| `backend/scripts/hr-data.ts` | `hrDbState`, `seedHr`, `seedHrIfReady`, `clearHr` |

**Ranh giới module** (lint ở `backend/eslint.config.mjs`): module Nhân sự không import module Đơn hàng, May, Đồng bộ; module khác không được import phần bên trong module Nhân sự. Module Đơn hàng, May lấy chuyền may qua `OrgService` của nền tảng, nơi module Nhân sự đăng ký nguồn chuyền.

## Dữ liệu dùng chung toàn công ty

- `hr.orgchart`, `hr.employee` khai `ScopeType = 'SHARED'` (ADR 0012 mục 5): không lọc theo ĐVCS của phiên. Đọc, ghi vẫn qua `BaseRepository`: tài nguyên chưa khai báo thì từ chối, không có quyền thì không thấy gì.
- **Ghi được ở mọi ĐVCS, kể cả `A00`**, vì dữ liệu không thuộc nhà máy nào (`BaseRepository.assertWritable` chỉ chặn `A00` với tài nguyên `BRANCH` hoặc có ĐVCS nguồn). Hai màn đặt `aggregateNote={false}` để không hiện ghi chú "A00 chỉ đọc". Khóa truy vấn frontend không kèm ĐVCS.
- Bảng `Department`, `Employee` không có cột phạm vi `BranchCode`. `Department.BranchCode` chỉ là thuộc tính "phòng ban của ĐVCS nào", service tự ghi, không phải cột phạm vi do nền tảng đặt.
- **Phạm vi nhà máy, chuyền không có tác dụng với `hr.*`**: gán vai trò Nhân sự kèm phạm vi nhà máy `A01` thì người đó vẫn xem, sửa, xuất mọi hồ sơ toàn công ty. Tạm thời không gán phạm vi nhà máy cho người dùng vai trò Nhân sự; cách xử lý lâu dài còn chờ chốt ([Trạng thái](02-trang-thai.md)). Giới hạn theo phòng ban (L3) chưa làm.

## Vai trò và quyền

- **Vai trò Nhân sự (`HR`)**: Xem, Thêm, Sửa, Xuất file ở cả hai màn. Quản trị (`ADMIN`) chỉ Xem, Giám đốc Xem + Xuất file, các vai trò khác không có quyền (ADR 0012 mục 6, đúng tách nhiệm vụ của ADR 0004). Vai trò Toàn quyền có mọi quyền nghiệp vụ. Ma trận đầy đủ, tài khoản mẫu `nhansu`: [Dữ liệu mẫu](12-du-lieu-mau-va-kiem-thu.md).
- **Không có quyền Xóa và không có API xóa**: phòng ban thì giải thể, nhân viên thì chuyển tình trạng Nghỉ việc.
- **Giải thể, khôi phục phòng ban** đi theo quyền `hr.orgchart:update` (xóa mềm).
- **Chuyền may:** thêm bộ phận tích "Xưởng sản xuất", tích, bỏ tích, đổi ĐVCS, giải thể, khôi phục bộ phận là chuyền cần thêm `admin.permission:update` (mục Chuyền may). Vai trò Nhân sự mẫu không có quyền này: sửa tên, cha, thứ tự của chuyền được, các thao tác trên thì cần người giữ quyền sửa Phân quyền (ví dụ `admin`).
- **Ô Người quản lý** ở Sơ đồ tổ chức cần thêm `hr.employee:view`: repository lọc theo quyền xem hồ sơ; không có quyền thì ô chỉ hiện người quản lý hiện tại, không tìm được.
- **Danh sách phòng ban, chức danh cho ô chọn** ở Thông tin nhân sự (`GET /hr/employees/options`) chỉ cần `hr.employee:view`, không cần quyền Sơ đồ tổ chức.
- **Danh mục Loại phòng ban** dùng quyền `admin.catalog` (vai trò Quản trị có `VCU`), là ngoại lệ so với ADR 0012 mục 6: vai trò Nhân sự chỉ thấy loại phòng ban trong ô chọn, không sửa được danh mục. Muốn Nhân sự tự sửa thì phải cấp `admin.catalog`, mà quyền đó sửa được cả các danh mục hệ thống khác.
- Quyền Xuất file của `hr.orgchart` có trong ma trận nhưng màn Sơ đồ tổ chức chưa có nút, chưa có API xuất.

## Trường nhạy cảm và chính sách cột

Thông tin nhân sự khai `@FieldResource('hr.employee')`: chính sách cột áp cho mọi endpoint của `EmployeeController` (cơ chế chung: [Phân quyền](04-phan-quyen.md)). Sơ đồ tổ chức không có chính sách cột.

**Cột đăng ký** (`SysResourceField`, mã trùng khóa JSON của API). Chỉ đăng ký thông tin cá nhân; mã, tên, phòng ban, chức danh, tình trạng là khung của màn (ẩn đi thì không lưu được hồ sơ) nên không đăng ký.

| Mã cột | Tên | Nhạy cảm (mặc định Ẩn) |
|---|---|---|
| `email` | Email | |
| `birthPlace` | Nơi sinh | |
| `hometown` | Nguyên quán | |
| `birthDate` | Ngày sinh | Có |
| `idNumber` | Số CMND/CCCD | Có |
| `contactPhone` | Điện thoại liên lạc | Có |
| `contactPerson` | Người liên hệ | Có |
| `currentAddress` | Địa chỉ hiện tại | Có |

Chính sách mẫu cho 5 cột nhạy cảm: Nhân sự Sửa được, Giám đốc Che (`***`), Toàn quyền Sửa được, vai trò khác Ẩn (mặc định).

**Tác dụng trên màn này:**
- Thẻ trong danh sách không bao giờ có giấy tờ, liên lạc; chỉ hồ sơ chi tiết có, và đã qua chính sách cột (cột Ẩn không có khóa, cột Che là `***`).
- File xuất qua chính sách cột như màn hình; xuất cột nhạy cảm ghi `SysSensitiveReadLog` loại `EXPORT`.
- Email bị Ẩn/Che thì ô tìm không tìm theo email.
- Gửi lên khóa của cột không ở mức Sửa được (form, hay một dòng của lưới nhập Excel) thì 403 `FIELD_READONLY` cho cả request.
- Nhật ký không ghi giá trị cột nhạy cảm: thay bằng chữ "(đã đổi)" để biết giấy tờ, liên lạc nào bị sửa (`EmployeeService.auditValue`).
- Kết quả kiểm tra nhập Excel trả lỗi dạng danh sách `{ field, message }`, không phải object theo mã cột, để chính sách cột không coi là đọc dữ liệu nhạy cảm.
- Frontend: form không hiện cột Ẩn; cột Che hiện `***` chỉ đọc; form thêm mới chỉ hiện cột được sửa; lưới nhập Excel và file mẫu chỉ có cột được sửa; `PolicyHint` báo các cột bị ẩn, che.

## Màn Sơ đồ tổ chức

Cây phòng ban của công ty (ADR 0012 mục 3): có nút cấp công ty không thuộc ĐVCS nào (văn phòng, khối), không dùng cây `SysOrgUnit` của phần quản trị (cây đó chỉ còn nút ĐVCS). Bộ phận tích "Xưởng sản xuất" là một **chuyền may** (mục Chuyền may): Sơ đồ tổ chức cũng là nơi quản lý chuyền.

### Bố cục

- Bên trái: cây phòng ban (`DepartmentTree`, dựng trên `Tree` của Mantine), ô tìm (tên hoặc mã, không dấu; đang tìm thì mở các nhánh có kết quả), ô tích "Hiện phòng ban đã giải thể", số phòng ban đang dùng. Mỗi dòng cây: tên, nhãn "Đã giải thể", dấu "Xưởng SX" (bộ phận là chuyền may; chữ kèm biểu tượng kim chỉ, rê chuột thấy ĐVCS), mã ĐVCS (nếu gắn), số nhân viên đang làm **trực tiếp** trong phòng ban, nút `⋯`. Cột trái kéo giãn được (260–560 px, nhớ trên trình duyệt).
- Bên phải: thông tin phòng ban đang chọn, hoặc form thêm, sửa ngay tại chỗ.
- URL: `?dept=<mã phòng ban>` (phòng ban đang chọn), `&all=1` (hiện phòng ban đã giải thể). Mã trên URL không có trong cây thì báo "Không thấy phòng ban", gợi ý bật hiện phòng ban đã giải thể.
- Bàn phím trên cây: mũi tên để đi, phải/trái để mở/thu, Enter để chọn, Shift+F10 hoặc phím menu để mở menu của nút.
- Điện thoại: hai tab Cây phòng ban / Thông tin; tab ẩn chứ không gỡ, nên đổi tab giữa chừng không mất form.

### Thao tác

| Thao tác | Ở đâu | Quyền | Ghi chú |
|---|---|---|---|
| Xem phòng ban | Bấm tên trên cây | `view` | Đường dẫn từ gốc (bấm để chuyển), mã, loại, ĐVCS, ngày giải thể, tên tiếng Anh, người quản lý, phòng ban cha, ngày thành lập, thứ tự; số nhân viên đang làm trực tiếp, số phòng ban con; liên kết "Xem nhân viên cả nhánh" sang `/hr/employees?dept=<mã>` (khi có `hr.employee:view`) |
| Thêm phòng ban con | Chuột phải hoặc `⋯` trên cây; nút "Thêm phòng ban" | `create` | Điền sẵn cha. Không có với phòng ban đã giải thể hoặc thuộc loại cấp cuối |
| Thêm phòng ban cùng cấp | Như trên | `create` | Điền sẵn cha và loại của phòng ban đang chọn. Không có với phòng ban đã giải thể |
| Thêm phòng ban gốc | Nút "Thêm phòng ban" | `create` | Không có cha |
| Sửa | Nút Sửa | `update` | Chỉ gửi phần đã đổi so với dữ liệu đã lưu; không có gì đổi thì nút Lưu khóa |
| Giải thể | Nút Giải thể, có hộp xác nhận | `update` | Nút khóa sẵn (kèm lý do) khi còn phòng ban con đang dùng hoặc nhân viên đang làm, hoặc bộ phận là chuyền may mà thiếu `admin.permission:update`. Ngày giải thể là hôm nay |
| Khôi phục | Nút Khôi phục (phòng ban đã giải thể) | `update` | Nút khóa sẵn khi phòng ban cha đã giải thể, hoặc bộ phận là chuyền may mà thiếu `admin.permission:update`. Khôi phục chuyền may: báo trước người sẽ thấy lại dữ liệu chuyền (mục Chuyền may) |

**Form thêm, sửa:** Mã phòng ban (chỉ nhập khi thêm) · Tên phòng ban · Tên tiếng Anh · Loại phòng ban (chỉ loại đang dùng, cộng loại đang gán; loại cấp cuối ghi kèm "(cấp cuối)") · Phòng ban cha (`DepartmentSelect`: thụt lề theo cấp, tìm không dấu, hiện đường dẫn cha khi tìm; bỏ chính nó, nhánh con của nó và phòng ban cấp cuối) · Người quản lý (tìm trên máy chủ theo mã hoặc tên, 20 người đang làm) · Đơn vị cơ sở (ĐVCS đang dùng, không có `A00`; bộ phận là chuyền may mà thiếu `admin.permission:update` thì chỉ đọc kèm lý do; mặc định theo phòng ban cha, xem dưới) · Ngày thành lập · Thứ tự trong cùng cấp · ô tích "Xưởng sản xuất" (mục Chuyền may). Chú thích của ô hiện khi rê chuột, Tab tới hoặc chạm (`FieldCell`); riêng ô tích "Xưởng sản xuất" hiện mô tả và lý do khóa ngay dưới ô. Bỏ dở form thì hỏi lại; rời màn khi đang sửa thì hỏi.

**ĐVCS mặc định theo phòng ban cha, chọn tay lại được** (chỉ ở giao diện; máy chủ không tự gán):
- Chỉ lấy ĐVCS của cha khi ĐVCS đó còn trong danh sách đang dùng (`factories` của `/hr/departments/options`). Form chờ tải xong danh sách này mới dựng; tải lỗi thì báo lỗi kèm Thử lại và Hủy, không dựng form với danh sách rỗng. Danh sách giữ bản cũ khi cache bị xóa (`keepPreviousData`), để form đang sửa không bị gỡ.
- Thêm mới: điền sẵn ĐVCS của cha.
- Sửa phòng ban chưa có ĐVCS mà cha có: điền sẵn, coi như thay đổi chưa lưu. Nút Lưu mở ngay và gửi `branchCode`; Hủy không hỏi vì người dùng chưa sửa gì. Nút Lưu và câu hỏi "Bỏ các thay đổi chưa lưu?" cùng so với dữ liệu đã lưu.
- Đổi phòng ban cha: ĐVCS đổi theo cha mới. Cha mới không có ĐVCS đang dùng thì ô về giá trị đã lưu (thêm mới: trống), không xóa ngầm ĐVCS đã lưu. Ô Phòng ban cha không bỏ chọn khi bấm lại đúng cha đang chọn; bỏ cha bằng nút xóa.
- Không đổi theo cha nữa khi người dùng tự chọn hoặc xóa ở ô ĐVCS, khi phòng ban đang có ĐVCS khác ĐVCS của cha (đã chọn tay từ trước), hoặc khi ô ĐVCS chỉ đọc (chuyền may, người thiếu `admin.permission:update`).
- Đổi ĐVCS (chọn tay hay theo cha) của phòng ban có con: hỏi trước khi lưu, nói chỉ phòng ban này đổi, các phòng ban con giữ ĐVCS hiện tại (máy chủ không lan xuống).
- Chú thích của ô ĐVCS nói đang lấy theo phòng ban cha nào.

Lưu xong: chọn phòng ban vừa lưu, mở đường tới nó trên cây (giữ các nút đang mở). Vừa giải thể mà đang ẩn phòng ban giải thể thì chuyển về phòng ban cha.

### Cây và đường dẫn `Path`

- `Path` = `Path` của cha + `Code` + `/`; gốc là `/` + `Code` + `/` (ví dụ `/VSN/VP/KT/`). Lọc cả nhánh bằng `LEFT(Path, LEN(@path)) = @path` (không dùng `LIKE` để mã không thành ký tự đại diện; dấu `/` cuối giữ cho `KT` không khớp `KT2`).
- Vì mã nằm trong `Path`, **mã phòng ban không sửa được**. Muốn sửa được thì phải đổi `Path` sang theo `Id`, cần quyết định mới ở [13-quyet-dinh.md](13-quyet-dinh.md).
- Trigger `TR_Department_PathMatchesParent` giữ `Path` khớp cha và khớp các con trực tiếp, nên cây không có vòng lặp.
- Chuyển phòng ban sang cha khác: một câu `UPDATE` đổi `Path` cả nhánh và `ParentId` của chính nút (`DepartmentRepository.moveSubtree`), để trigger thấy cây đã khớp sau câu lệnh.
- Máy chủ trả cây dạng **danh sách phẳng** kèm `parentId`, `path`, xếp theo cấp của loại (`LevelOrder`), thứ tự (`SortOrder`), tên, Id; trình duyệt tự dựng cây (`tree.ts`). Nút có cha không nằm trong danh sách (cha đã giải thể bị ẩn) thành gốc.

### Luật nghiệp vụ và chốt chặn (máy chủ)

Code: `DepartmentService`.

| Luật | Lỗi |
|---|---|
| Mã: tự cắt khoảng trắng, viết hoa, khớp `^[A-Z0-9-]{1,20}$` (chữ hoa không dấu, số, gạch ngang) | 422 |
| Mã duy nhất toàn bảng, kể cả phòng ban đã giải thể | 409 |
| Mã không sửa được: gửi `code` khác khi sửa | 422 `CODE_IMMUTABLE`; trigger `TR_Department_CodeImmutable` chặn thêm một lớp (so nhị phân, đổi hoa thường hay thêm khoảng trắng cuối cũng bị chặn) |
| Tên bắt buộc, tối đa 255 ký tự; tên tiếng Anh tối đa 255 | 422 |
| Loại phòng ban phải có trong danh mục và đang dùng (khi thêm, khi đổi loại) | 422 |
| Đổi sang loại cấp cuối khi phòng ban có phòng ban con (kể cả con đã giải thể) | 422 |
| Phòng ban cha phải tồn tại, đang dùng, không thuộc loại cấp cuối | 422 |
| Cha mới không phải chính nó, không nằm trong nhánh của nó | 422 |
| `Path` (kể cả của mọi phòng ban con sau khi chuyển) không vượt 400 ký tự | 422 |
| Người quản lý phải là nhân viên đang làm việc (chỉ kiểm khi đổi) | 422 |
| ĐVCS phải đang dùng và không phải đơn vị tổng hợp (`A00`). Chỉ kiểm khi đổi (và khi vừa tích "Xưởng sản xuất", kể cả giữ nguyên ĐVCS), để phòng ban của ĐVCS đã tắt vẫn sửa được tên | 422 |
| Bộ phận tích "Xưởng sản xuất" phải có ĐVCS (khi thêm, tích, sửa ĐVCS; database có `CK_Department_ProductionWorkshopBranch`) | 422 |
| Thêm bộ phận tích sẵn, tích, bỏ tích, đổi ĐVCS của bộ phận đang tích, giải thể, khôi phục bộ phận đang tích: người thao tác phải có thêm `admin.permission:update` | 403 `SELF_ELEVATION_FORBIDDEN` (thông báo kèm quyền thiếu) |
| Như dòng trên, khi người thao tác đang được giao phạm vi chuyền theo đúng mã bộ phận đó (kể cả phép gán hết hạn, chưa tới hạn) | 403 `SELF_ELEVATION_FORBIDDEN` |
| Ngày thành lập không sau ngày giải thể | 422 (DB còn `CK_Department_Dates`) |
| Giải thể: phòng ban đang dùng | 409 nếu đã giải thể |
| Giải thể: ngày (mặc định hôm nay giờ Việt Nam) không trước ngày thành lập | 422 |
| Giải thể: không còn phòng ban con đang dùng, không còn nhân viên đang làm trực tiếp trong phòng ban. Thông báo nêu số lượng và việc cần làm | 409 |
| Khôi phục: phòng ban đang giải thể; phòng ban cha (nếu có) đang dùng | 409 nếu đang dùng; 422 nếu cha đã giải thể |

- **Khóa cây:** thêm, sửa (kể cả chuyển nhánh), giải thể, khôi phục chạy nối tiếp nhờ khóa ứng dụng `sp_getapplock 'MES_Hr.Department'` chế độ Exclusive, chờ tối đa 10 giây (`DepartmentRepository.lockTree`); quá thời gian thì 409 "Có người khác đang sửa sơ đồ tổ chức". Ghi hồ sơ nhân viên giữ cùng khóa ở chế độ Shared (`lockTreeShared`), nên không có nhân viên đang làm lọt vào phòng ban vừa giải thể.
- **Khôi phục không kiểm lại cấp cuối** của phòng ban cha; vì vậy bật cấp cuối cho một loại tính cả phòng ban con đã giải thể (mục Loại phòng ban).
- Nhật ký `SysAuditLog`, `EntityType = 'Department'`: `CREATE` (phòng ban mới), `UPDATE` (giá trị trước và các cột đổi, kèm `Path` mới và số nút đã chuyển khi đổi cha), `DISSOLVE`, `RESTORE` (kèm cờ `IsProductionWorkshop`). Đổi tập chuyền may thêm `LINE_SET_CHANGE` (mục Chuyền may).

### Chuyền may: bộ phận tích "Xưởng sản xuất"

Quyết định: [Quyết định](13-quyet-dinh.md) mục 6.7. Phạm vi chuyền của Trưởng chuyền theo mã bộ phận: [Phân quyền](04-phan-quyen.md) mục 7.6.

- Bộ phận tích "Xưởng sản xuất" (`Department.IsProductionWorkshop = 1`) là một chuyền may của ĐVCS gắn với nó: mã chuyền là mã bộ phận, tên chuyền là tên bộ phận, nhóm trong ô chọn là bộ phận cha. Chuyền hiện ở mọi ô chọn Chuyền may (Xếp chuyền, Kế hoạch chuẩn bị SX, ô lọc Chuyền, Tổ SX, ô Chuyền ở bộ sửa phạm vi) qua `OrgService` của nền tảng.
- **Nguồn chuyền** `HrLineSource` (`backend/src/modules/hr/hr-line-source.ts`): đăng ký vào `OrgService` lúc khởi động; đọc thẳng bảng `Department` (không qua `BaseRepository`: đây là danh mục cho mọi người đăng nhập qua `/me/lines`, không phải dữ liệu nhân sự theo quyền `hr.orgchart`; `OrgService` lọc ĐVCS). Trả bộ phận đang tích có ĐVCS, kể cả đã giải thể (`isActive = false`, để dữ liệu cũ hiện tên), xếp theo ĐVCS, bộ phận cha (bộ phận ở gốc cây xếp sau), thứ tự, mã. Bộ phận bỏ tích không còn trong nguồn: dữ liệu gắn mã đó thành chuyền mồ côi ("<mã> (chuyền cũ)").
- **Ô tích** "Xưởng sản xuất" ở form thêm, sửa (`DepartmentPanel.tsx`): mô tả "Hiện trong ô chọn Chuyền may của đơn vị cơ sở đã chọn." hiện sẵn; ô khóa, lý do hiện ngay dưới ô (kèm biểu tượng khóa) khi:
  - thiếu `admin.permission:update`: "Cần thêm quyền sửa Phân quyền: danh sách chuyền may quyết định Trưởng chuyền thấy dữ liệu nào.";
  - chưa tích mà chưa chọn ĐVCS: "Chọn đơn vị cơ sở trước: chuyền may phải thuộc một đơn vị cơ sở."

  Đang tích mà xóa ĐVCS: báo lỗi ở ô ĐVCS, không gửi; bỏ tích thì hết lỗi. Bộ phận đang tích, người thiếu quyền: ô ĐVCS chỉ đọc, Giải thể và Khôi phục khóa, đều nói lý do; đổi tên, cha, thứ tự vẫn lưu được (không đổi phạm vi). Đầu khung thông tin và dòng cây có dấu "Xưởng sản xuất" (`WorkshopBadge`).
- **Báo trước khi lưu:**
  - Thêm bộ phận tích sẵn, tích, khôi phục chuyền: màn hình hỏi `GET /hr/departments/line-holders?code=<mã>` ai đang được giao phạm vi chuyền theo mã này (phạm vi đó đang "ngủ" vì mã chưa là chuyền đang dùng, lưu xong thì có tác dụng). Có người thì hộp xác nhận nêu số người và tối đa 10 tên; "Xem lại" thì chưa lưu. Không hỏi được máy chủ thì báo lỗi, không lưu.
  - Đổi ĐVCS của chuyền (chọn tay, hoặc đổi theo phòng ban cha mới): hộp xác nhận nói kế hoạch đã xếp vào chuyền ở ĐVCS cũ vẫn giữ mã nhưng không còn hàng trên bảng dàn chuyền, ô chọn Chuyền may của ĐVCS cũ không còn chuyền này.
- **Sau khi lưu** (máy chủ): xóa cache chuyền của `OrgService` ở mọi lần ghi bộ phận (đổi tên, cha cũng đổi ô chọn), ghi nhật ký thường, đọc lại bộ phận, rồi nếu tập chuyền đổi thì ghi `LINE_SET_CHANGE` và tăng phiên bản quyền trong một transaction `MES_Core` (đọc lại lỗi thì vẫn ghi bước này trước khi báo lỗi) (cơ chế, lỗi `LINE_SCOPE_UPDATE_FAILED`: [Phân quyền](04-phan-quyen.md) mục 7.6). Giao diện làm mới ô chọn chuyền (`['me', 'lines']`).
- **Đã lưu mà chưa cập nhật được phân quyền** (500 `LINE_SCOPE_UPDATE_FAILED`, kèm `details.department`, `details.departmentId`): màn hình đóng form, hiện bộ phận đã lưu và báo "Đã lưu, chưa cập nhật phân quyền" (hoặc "Đã giải thể…", "Đã khôi phục…"), không coi như chưa lưu.

## Danh mục Loại phòng ban

Loại phòng ban (Công ty, Khối, Nhà máy, Phòng, Bộ phận…) dùng ở ô "Loại phòng ban" của Sơ đồ tổ chức. Nằm ở Quản trị › Danh mục hệ thống, nhóm "Danh mục MES", mục "Loại phòng ban".

- **Bảng:** Mã · Tên (nhãn "Nạp sẵn" với loại do seed tạo, `IsSystem = 1`) · Cấp · Cấp cuối · Thứ tự · Số phòng ban đang dùng loại (chưa giải thể) · Mô tả · Trạng thái (công tắc) · nút Sửa. Xếp theo cấp rồi thứ tự, đúng thứ tự trên cây. Loại đã ngừng hiện mờ. Ô tìm lọc tại chỗ, gõ không dấu vẫn ra.
- **Hộp thêm, sửa:** Mã (khóa khi sửa) · Tên loại · Cấp (0–99) · Thứ tự (để trống là xếp cuối) · Cấp cuối · Mô tả. Khi sửa chỉ gửi phần đã đổi. Lỗi trùng mã, trùng tên, bật cấp cuối bị chặn hiện ngay ở ô tương ứng.
- **Cảnh báo** khi không còn loại nào đang dùng mà không phải cấp cuối: lúc đó không thêm được phòng ban gốc hay phòng ban có con.
- **Ngừng dùng** hỏi xác nhận, nêu số phòng ban đang dùng loại đó.

**Luật ở máy chủ** (`DepartmentTypeService`):

| Luật | Lỗi |
|---|---|
| Mã tự cắt khoảng trắng, viết hoa, khớp `^[A-Z0-9_-]{1,20}$` | 422 |
| Mã duy nhất, kể cả loại đã ngừng | 409 |
| Mã không sửa được (gửi `code` khác) | 422 `CODE_IMMUTABLE`; trigger chặn thêm |
| Tên 1–100 ký tự, không trùng tên loại khác (không phân biệt hoa thường, có phân biệt dấu) | 422; trùng 409 |
| Mô tả ≤ 300; Cấp 0–99; Thứ tự 0–1.000.000, thêm mới để trống thì bằng lớn nhất + 10 | 422 |
| Bật Cấp cuối khi có phòng ban thuộc loại này đang có phòng ban con, **kể cả phòng ban đã giải thể** (vì khôi phục không kiểm lại cấp cuối). Thông báo nêu tối đa 3 phòng ban kèm tổng số | 422 |
| Ngừng dùng: được, kể cả khi đang có phòng ban dùng. Phòng ban đó giữ loại, vẫn sửa được; không chọn được loại này khi thêm phòng ban hay đổi loại | |

- **Cấp (`LevelOrder`) chỉ để sắp xếp** các phòng ban cùng cha (số nhỏ đứng trước), không ràng buộc "con phải cấp lớn hơn cha". Đổi Cấp thì thứ tự trên cây đổi ngay.
- Thêm, sửa giữ cùng khóa cây Exclusive với thao tác phòng ban, nên không lọt phòng ban con mới vào loại vừa thành cấp cuối, hay phòng ban mới vào loại vừa ngừng.
- Không xóa vật lý. Không qua `BaseRepository` (bảng danh mục không có cột nhà máy); quyền cưỡng chế ở controller.
- Nhật ký `EntityType = 'DepartmentType'`, `CREATE`, `UPDATE` kèm giá trị trước và sau.
- Lưu xong, frontend làm mới các truy vấn `['hr', 'departments']` (ô chọn loại, tên loại trên cây).

**Chức danh (`JobTitle`)** chưa có màn sửa: chỉ có dữ liệu seed. Chức danh không gắn phòng ban thì dùng chung toàn công ty; gắn một phòng ban thì dùng cho phòng ban đó và cả nhánh con (ADR 0012 mục 7).

## Màn Thông tin nhân sự

### Bố cục

- Cột trái chia hai khối, kéo đổi được độ rộng (280–720 px) và chiều cao khối cây (140–700 px), nhớ trên trình duyệt:
  - **Cây phòng ban** (cùng `DepartmentTree`, không có menu thêm) với mục "Tất cả phòng ban" ở đầu và ô tìm phòng ban.
  - **Danh sách nhân viên** dạng thẻ (`EmployeeList`): chữ cái đầu của tên làm ảnh đại diện, họ tên, chức danh, phòng ban, mã, nhãn "Nghỉ việc".
- Bên phải: hồ sơ đang chọn, hoặc form thêm, sửa.
- URL: `?dept=<mã phòng ban>&emp=<Id nhân viên>&q=…&title=<Id chức danh>&status=1|2&page=…`. Mở link có phòng ban thì đợi danh mục phòng ban tải xong mới tải danh sách (không tải cả công ty trước).
- Điện thoại: hai tab Danh sách / Hồ sơ; chọn phòng ban trong ngăn kéo từ dưới lên.

### Danh sách

- **Chọn phòng ban thì lấy cả nhánh con** (theo `Path`). Đổi phòng ban: bỏ nhân viên đang xem, về trang 1, bỏ lọc chức danh, giữ chữ tìm và tình trạng.
- **Tìm** (`q`): mã nhân viên, mã chấm công, tên, tên tiếng Anh, email (trừ khi email bị Ẩn/Che), tên chức danh. Không phân biệt dấu, hoa thường, kể cả chữ "đ": hai vế đổi đ → d rồi so theo `Latin1_General_100_CI_AI` (`foldedLike`). Không dùng chỉ mục (quét bảng), đủ nhanh với vài nghìn người.
- **Lọc**: chức danh (chỉ chức danh dùng được ở phòng ban đang chọn hoặc ở một phòng ban trong nhánh của nó), tình trạng (Tất cả / Đang làm việc / Nghỉ việc).
- **Thứ tự**: mới tạo lên trước; 20 thẻ mỗi trang. Trang trên URL vượt trang cuối thì về trang cuối.
- Danh sách là thẻ, không có tiêu đề cột nên **không có popup lọc theo cột**: ngoại lệ của ADR 0011 (ADR 0012 mục 10). Tìm, lọc vẫn chạy trong database.

### Hồ sơ

Hiện theo 4 nhóm: Thông tin chung · Chấm công · Thông tin cá nhân · Giấy tờ và liên hệ; mỗi nhóm chỉ hiện các trường có trong dữ liệu trả về (cột Ẩn không có). Đầu hồ sơ: họ tên, chức danh, phòng ban, mã, nhãn tình trạng (Nghỉ việc kèm ngày nghỉ). Danh sách trường, nhóm, nhãn lấy từ `GET /hr/employees/options` (`fields`, `groups`), định nghĩa ở `employee-fields.ts`; ánh xạ khóa API ↔ cột DB ở mục [bảng `Employee`](#employee-hồ-sơ-nhân-viên).

### Thêm, sửa hồ sơ

Nút **Thêm nhân viên** (điền sẵn phòng ban đang chọn nếu đang dùng) và nút **Sửa** trên hồ sơ. Form cùng 4 nhóm; ô bắt buộc tô vàng.

| Luật | Ở đâu kiểm | Lỗi |
|---|---|---|
| Bắt buộc khi thêm: mã, tên, giới tính, phòng ban, chức danh. Tình trạng để trống là Đang làm việc | Form và máy chủ | 422 |
| Mã nhân viên, mã chấm công: chữ hoa không dấu, số, `.`, `_`, `-`, tối đa 30 ký tự; tự viết hoa | Form và máy chủ | 422 |
| **Mã nhân viên sửa được**, chỉ cấm trùng; `Id` không đổi nên mọi liên kết giữ nguyên (ADR 0012 mục 4) | Máy chủ, `UQ_Employee_Code` | 409 |
| Mã chấm công để trống thì lấy theo mã nhân viên (khi sửa: theo mã sau khi đổi). Không trùng với mã chấm công của người khác | Máy chủ, `UX_Employee_TimekeepingCode` | 409 |
| Email: dạng `tên@miền.đuôi`, chỉ ký tự ASCII in được (cột `VARCHAR` làm mất dấu tiếng Việt); không kiểm sâu hơn | Form và máy chủ | 422 |
| Chức danh phải đang dùng và dùng được cho phòng ban: chức danh chung, hoặc gắn với chính phòng ban đó hay một phòng ban cha. Chỉ kiểm khi đổi phòng ban hoặc chức danh | Form (ô chọn chỉ có chức danh hợp lệ; đổi phòng ban thì bỏ chức danh không hợp lệ) và máy chủ | 422 |
| Phòng ban đã giải thể: không chọn được khi thêm, khi đổi phòng ban, hoặc khi đưa người nghỉ việc trở lại làm. Hồ sơ cũ ở phòng ban đã giải thể vẫn sửa được các trường khác | Máy chủ | 422 |
| Đang làm việc thì không có ngày nghỉ việc; ngày nghỉ việc không trước ngày bắt đầu làm việc | Form (ô Ngày nghỉ việc chỉ mở khi tình trạng là Nghỉ việc; chuyển về Đang làm việc thì xóa ngày) và máy chủ, `CK_Employee_EndDate` | 422 |
| Độ dài các trường chữ theo cột (bảng `Employee`) | Máy chủ | 422 |

- Lỗi kèm `details.fields: { <khóa>: thông báo }`; form gắn lỗi vào đúng ô. Chỉ trùng mã/mã chấm công thì 409 `CONFLICT`, còn lại 422 `VALIDATION_FAILED`.
- Sửa chỉ gửi phần đã đổi và được sửa theo chính sách cột; máy chủ chỉ kiểm quy tắc trên các trường vừa đổi, để hồ sơ cũ không bị chặn vì phòng ban đã giải thể hay chức danh đã ngừng mà người dùng không đụng tới.
- Ghi trong transaction có khóa cây chế độ Shared; phòng ban, chức danh đọc lại ngay lúc ghi.
- Lưu xong khi thêm: cây chuyển sang phòng ban của người vừa thêm, danh sách về trang 1, chọn người đó. Lưu xong khi sửa: giữ bộ lọc, trang đang xem. Số người đang làm trên cây phòng ban cập nhật theo.
- Đang sửa dở mà chọn nhân viên, phòng ban khác, bấm thêm mới, hay rời màn thì hỏi lại.
- Nhật ký `EntityType = 'Employee'`: `CREATE` (hồ sơ mới), `UPDATE` (giá trị cũ, mới của các trường đổi; đổi mã thì có cả mã cũ và mới). Cột nhạy cảm ghi "(đã đổi)".

### Xuất file

Nút **Xuất file** (`hr.employee:export`) gọi `GET /hr/employees/export` theo bộ lọc đang chọn (phòng ban cả nhánh, tìm, chức danh, tình trạng), mọi trang. File CSV `nhan-su-<YYYY-MM-DD>.csv` **cùng thứ tự, cùng tên cột với lưới nhập**, nên sửa xong dán lại được: phòng ban, chức danh dạng `[MÃ] Tên` (hai phòng ban cùng tên vẫn dò đúng), giới tính, tình trạng dạng chữ, "Cho phép chấm công" là Có/Không. Qua chính sách cột như mục Trường nhạy cảm.

### Nhập từ Excel

Nhập nhiều hồ sơ một lần bằng cách **dán từ Excel vào lưới nhập** (`SheetGrid`), không tải file `.xlsx` lên (ADR 0012 mục 9). Chỉ thêm mới, không sửa hồ sơ đã có. Nút "Nhập từ Excel" cần `hr.employee:create`. Code: `EmployeeImportModal.tsx`, `employee-import.service.ts`.

**Luồng:**
1. Bấm **Tải file mẫu**: CSV có BOM (Excel đọc đúng tiếng Việt), chỉ một dòng tiêu đề, cùng thứ tự cột với lưới. Cột bắt buộc có dấu `*` (trừ Tình trạng, vì để trống là Đang làm việc).
2. Điền trong Excel, chép các dòng, chọn ô đầu của lưới rồi Ctrl+V. Dán cả dòng tiêu đề cũng được.
3. Bấm **Kiểm tra** → `POST /hr/employees/import/preview`. Máy chủ đọc, dò phòng ban, chức danh và báo lỗi theo ô; không ghi gì.
4. Sửa ô lỗi ngay trên lưới (dòng vừa sửa trở về "Chưa kiểm"), kiểm tra lại.
5. Bấm **Lưu n dòng hợp lệ** (khóa tới khi mọi dòng đã kiểm) → `POST /hr/employees/import/commit` với các dòng hợp lệ. Dòng đã lưu rời khỏi lưới; dòng không lưu được ở lại và được kiểm lại tự động để hiện lỗi.

**Định dạng ô** (`readRow`, `readCell`):

| Trường | Nhận |
|---|---|
| Cột lưới | Đúng danh sách trường của `employee-fields.ts`, trừ cột người nhập không được sửa theo chính sách cột |
| Dòng tiêu đề | Chỉ xét dòng đầu: có ít nhất 2 ô và ≥ 60% số ô có chữ trùng tên cột hoặc tên gọi khác của cột đó (bỏ dấu, bỏ `*` cuối, không phân biệt hoa thường). Dòng đó được bỏ qua |
| Mã nhân viên, mã chấm công | Tự viết hoa; chữ không dấu, số, `.`, `_`, `-` |
| Ngày | `dd/mm/yyyy`, `dd-mm-yyyy`, `dd.mm.yyyy`, `yyyy-mm-dd`, hoặc số ngày kiểu Excel (5–6 chữ số, ô ngày dán thành số). Năm 1900–2100, ngày phải có thật. Ô chỉ có năm ("1990") là lỗi |
| Giới tính | Nam / Nữ / Khác (không dấu cũng được), `1`/`2`/`3`, `M`/`F`, `Male`/`Female`/`Other` |
| Tình trạng | Đang làm việc / Đang làm / Làm việc / Nghỉ việc / Đã nghỉ việc / Đã nghỉ / Nghỉ, `1`/`2`, `Active`/`Inactive`. Để trống: Đang làm việc |
| Cho phép chấm công | Có: `x`, Có, C, 1, true, yes, y, Cho phép. Không: Không, K, 0, false, no, n, Không cho phép |
| Phòng ban | Mã (không phân biệt hoa thường), tên (không dấu), hoặc dạng `[MÃ] Tên`, `MÃ - Tên`. Chỉ phòng ban đang dùng. Nhiều phòng ban trùng tên thì báo dùng mã; phòng ban đã giải thể báo riêng |
| Chức danh | Mã, tên, `[MÃ] Tên`, `MÃ - Tên`, dò trong số chức danh dùng được cho phòng ban của dòng (dòng chưa có phòng ban: mọi chức danh đang dùng). Trùng tên thì báo dùng mã |
| Chữ khác | Cắt khoảng trắng đầu cuối; quá độ dài của cột là lỗi (báo độ dài đang có). Ô dài hơn 1.000 ký tự bị cắt trước khi đọc |

**Luật kiểm:** như form (bắt buộc, chức danh theo phòng ban, ngày nghỉ việc…), cộng trùng mã nhân viên, mã chấm công **trong cùng lô** ("Trùng mã với dòng n") và **trong hệ thống**. Mã chấm công để trống được kiểm trùng trên giá trị sẽ ghi (mã nhân viên).

**Giới hạn:** tối đa 500 dòng mỗi lần (`IMPORT_MAX_ROWS`; giới hạn 512 KB của request JSON); vượt thì màn báo chia làm nhiều lần.

**Báo lỗi:**
- Ô lỗi tô đỏ; cột cuối "Kết quả kiểm tra": Chưa kiểm / Dòng tiêu đề, bỏ qua / Hợp lệ (kèm tên phòng ban đã dò) / n lỗi.
- Dưới lưới là danh sách lỗi "Dòng n (mã): <tên cột>: <lỗi>".
- Dòng tổng: số dòng, số hợp lệ, số lỗi, số chưa kiểm.
- Sau khi lưu: thông báo số người đã thêm; còn dòng không lưu được (thường do người khác vừa thêm trùng mã, hoặc dữ liệu vừa đổi) thì cảnh báo không tự đóng.

**Ở máy chủ:** `preview` chỉ đọc. `commit` **kiểm lại từ đầu** (không tin kết quả xem trước), rồi thêm từng dòng hợp lệ **độc lập**, mỗi dòng một transaction có khóa cây Shared và đọc lại phòng ban, chức danh: dòng lỗi không chặn dòng khác. Lỗi bất ngờ của một dòng ghi log máy chủ (số dòng, mã, mã lỗi SQL; không ghi giá trị ô) và trả câu chung. Kết quả theo thứ tự dòng gửi lên. Nhật ký: mỗi người thêm được một dòng `CREATE` (kèm `via: 'IMPORT'`), cộng một dòng `IMPORT` tổng với số lượng.

Đóng hộp khi còn dòng đã dán chưa lưu thì hỏi lại; đang lưu thì chưa đóng được. Esc không đóng hộp (Esc trong lưới là thoát sửa ô).

## API `/hr/*`

Tiền tố `/api/v1`. Mọi endpoint cần đăng nhập. Route tĩnh (`tree`, `options`, `manager-options`, `line-holders`, `export`, `import/*`) khai trước `:id`. Ngày dạng `YYYY-MM-DD`, phải là ngày có thật. Mã lỗi chung: [Phân quyền](04-phan-quyen.md).

### Sơ đồ tổ chức: `/hr/departments`

| Method | Đường dẫn | Quyền | Body / tham số | Kết quả | Lỗi đặc thù |
|---|---|---|---|---|---|
| GET | `/hr/departments/tree` | `hr.orgchart:view` | `includeDissolved=0\|1` | `{ items }`: danh sách phẳng. Mỗi phòng ban: `{ id, code, name, nameEn, departmentTypeId, typeCode, typeName, levelOrder, isFinalLevel, parentId, path, managerEmployeeId, managerCode, managerName, branchCode, establishedDate, dissolvedDate, sortOrder, isActive, isProductionWorkshop, activeEmployees, createdAt, modifiedAt }`; `activeEmployees` là số người đang làm trực tiếp | |
| GET | `/hr/departments/options` | `hr.orgchart:view` | | `{ types: [{ id, code, name, levelOrder, isFinalLevel, isActive }], factories: [{ code, name }] }`. `types` gồm cả loại đã ngừng; `factories` là ĐVCS đang dùng, không có `A00` | |
| GET | `/hr/departments/manager-options` | `hr.orgchart:view` (và repository lọc theo `hr.employee:view`) | `q` (≤ 60), `selected` (Id) | Tối đa 20 nhân viên đang làm khớp mã hoặc tên (không dấu), xếp theo tên: `[{ id, code, fullName, departmentName, isActive }]`. `selected` luôn có trong kết quả (kể cả đã nghỉ) | Không có `hr.employee:view` thì danh sách rỗng |
| GET | `/hr/departments/line-holders` | `hr.orgchart:view` + `admin.permission:update`, và `hr.orgchart:create` hoặc `:update` (kiểm ở service) | `code` (mã bộ phận, viết hoa) | `{ code, holders: [{ username, fullName }] }`: người đang được giao phạm vi chuyền theo mã này (tài khoản đang hoạt động, vai trò đang dùng, phép gán chưa hết hạn) | 403 thiếu quyền; 422 mã sai dạng |
| POST | `/hr/departments` | `hr.orgchart:create` | `{ code, name, nameEn?, departmentTypeId, parentId?, managerEmployeeId?, branchCode?, establishedDate?, sortOrder?, isProductionWorkshop? }`. `sortOrder` 0–1.000.000, mặc định 0 | 201, phòng ban như `tree` | 409 trùng mã; 422 các luật ở mục Sơ đồ tổ chức; 409 khi chờ khóa cây quá 10 giây; 403 `SELF_ELEVATION_FORBIDDEN` (chuyền may); 500 `LINE_SCOPE_UPDATE_FAILED` (đã lưu, kèm `details.department`) |
| GET | `/hr/departments/:id` | `hr.orgchart:view` | | Một phòng ban, cùng dạng | 404 |
| PUT | `/hr/departments/:id` | `hr.orgchart:update` | Như POST, chỉ gửi phần đã đổi; `name`, `departmentTypeId`, `sortOrder` không nhận `null`; `parentId: null` là chuyển thành gốc | Phòng ban sau khi lưu | 422 `CODE_IMMUTABLE` khi gửi mã khác; 422 cha không hợp lệ, cấp cuối, `Path` quá dài, chuyền may thiếu ĐVCS; 404; 403, 500 như POST |
| POST | `/hr/departments/:id/dissolve` | `hr.orgchart:update` | `{ dissolvedDate? }` (mặc định hôm nay, giờ Việt Nam) | Phòng ban sau khi giải thể | 409 đã giải thể, còn con đang dùng hoặc nhân viên đang làm (nêu số lượng); 422 ngày trước ngày thành lập; 403, 500 như POST (chuyền may) |
| POST | `/hr/departments/:id/restore` | `hr.orgchart:update` | | Phòng ban sau khi khôi phục | 409 đang dùng; 422 cha đã giải thể; 403, 500 như POST (chuyền may) |

### Loại phòng ban: `/hr/department-types`

| Method | Đường dẫn | Quyền | Body | Kết quả | Lỗi đặc thù |
|---|---|---|---|---|---|
| GET | `/hr/department-types` | `admin.catalog:view` | | Mọi loại kể cả đã ngừng, xếp theo cấp, thứ tự, Id: `[{ id, code, name, description, levelOrder, isFinalLevel, sortOrder, isActive, isSystem, departmentCount }]`; `departmentCount` là số phòng ban chưa giải thể dùng loại | |
| POST | `/hr/department-types` | `admin.catalog:create` | `{ code, name, description?, levelOrder, isFinalLevel, sortOrder? }` | 201, loại vừa tạo (`departmentCount: 0`) | 409 trùng mã, trùng tên |
| PUT | `/hr/department-types/:id` | `admin.catalog:update` | Chỉ phần đã đổi: `name, description, levelOrder, isFinalLevel, sortOrder, isActive` (không nhận `null`, trừ `description`) | Loại sau khi lưu, kèm `departmentCount` | 422 `CODE_IMMUTABLE`; 409 trùng tên; 422 bật cấp cuối bị chặn; 404 |

### Thông tin nhân sự: `/hr/employees`

Khai `@FieldResource('hr.employee')`: dữ liệu gửi lên và trả về qua chính sách cột.

| Method | Đường dẫn | Quyền | Body / tham số | Kết quả | Lỗi đặc thù |
|---|---|---|---|---|---|
| GET | `/hr/employees/options` | `hr.employee:view` | | `{ departments: [{ id, code, name, parentId, path, isActive }], jobTitles: [{ id, code, name, departmentId, isActive }], genders, statuses, fields: [{ key, label, group, type, required, max }], groups }` (mọi phòng ban, chức danh kể cả đã ngừng; màn tự lọc) | |
| GET | `/hr/employees` | `hr.employee:view` | `page`, `pageSize` (mặc định 20, tối đa 200), `q` (≤ 60), `departmentId` (cả nhánh con; Id không có thì không khớp ai), `jobTitleId`, `status` (1, 2) | `{ items, total, page, pageSize }`; mỗi thẻ `{ id, code, timekeepingCode, fullName, gender, departmentId, departmentName, jobTitleId, jobTitleName, employmentStatus, startDate, createdAt }`; mới tạo trước | |
| GET | `/hr/employees/export` | `hr.employee:export` | Như danh sách (không phân trang) | File CSV (mục Xuất file) | |
| POST | `/hr/employees/import/preview` | `hr.employee:create` | `{ rows: [{ <khóa trường>: chữ }] }`, 1–500 dòng | `{ rows: [{ index, header, ok, errors: [{ field, message }], resolved: { departmentName?, jobTitleName? } }] }` | 403 `FIELD_READONLY` nếu có cột không được sửa |
| POST | `/hr/employees/import/commit` | `hr.employee:create` | Cùng dạng | `{ created, failed, results: [{ index, ok, id?, code?, message?, skipped? }] }` | Như trên |
| POST | `/hr/employees` | `hr.employee:create` | Khóa theo `fields` (bảng `Employee`) | 201, hồ sơ đầy đủ | 422 (kèm `details.fields`); 409 trùng mã, mã chấm công |
| GET | `/hr/employees/:id` | `hr.employee:view` | | Hồ sơ: mọi khóa của `fields` (ngày `YYYY-MM-DD`, cờ boolean) cùng `id, departmentCode, departmentName, jobTitleName, createdAt, modifiedAt` | 404 |
| PUT | `/hr/employees/:id` | `hr.employee:update` | Chỉ phần đã đổi; cột bắt buộc không nhận `null`; `timekeepingCode: null` là lấy theo mã nhân viên | Hồ sơ sau khi lưu | 422; 409 trùng mã; 404 |

## Database `MES_Hr`

Migration: `backend/migrations/MES_Hr/0001_hr_init.sql` (bốn bảng), `0002_department_production_workshop.sql` (cột `Department.IsProductionWorkshop`, ràng buộc, chỉ mục). Quản trị CSDL tạo `MES_Hr` trống và cấp `db_owner` cho tài khoản ứng dụng trước khi chạy migrate: [Vận hành](11-van-hanh.md). Quy ước: PascalCase, số ít, thời điểm `DATETIME2(3)` giờ UTC, ngày `DATE`. Không có `BranchCode` bắt buộc (dữ liệu dùng chung).

CHECK định dạng mã của mọi bảng có thêm `DATALENGTH(Code) = LEN(Code)`: `LIKE` trên `VARCHAR` bỏ qua khoảng trắng cuối nên `'NV1 '` sẽ lọt mẫu ký tự. Bảng có trigger thì ứng dụng không dùng `INSERT … OUTPUT`: thêm rồi đọc lại theo mã.

Mọi bảng có 4 cột kiểm vết: `CreatedAt DATETIME2(3) NOT NULL` mặc định `SYSUTCDATETIME()`, `CreatedBy INT NULL`, `ModifiedAt DATETIME2(3) NULL`, `ModifiedBy INT NULL`. Các bảng dưới không lặp lại 4 cột này.

### `DepartmentType`: loại phòng ban

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | Không | `PK_DepartmentType` |
| `Code` | `VARCHAR(20)` | Không | `UQ_DepartmentType_Code`. `CK_DepartmentType_Code`: chỉ `A-Z 0-9 _ -`, không rỗng, không khoảng trắng cuối. Bất biến (trigger) |
| `Name` | `NVARCHAR(100)` | Không | Tên loại (ứng dụng chặn trùng) |
| `Description` | `NVARCHAR(300)` | Có | |
| `LevelOrder` | `INT` | Không | Cấp, mặc định 0, `CK_DepartmentType_LevelOrder` 0–99. Chỉ để sắp xếp cây |
| `IsFinalLevel` | `BIT` | Không | Mặc định 0. Cấp cuối: phòng ban loại này không có phòng ban con |
| `SortOrder` | `INT` | Không | Mặc định 0 |
| `IsActive` | `BIT` | Không | Mặc định 1 |
| `IsSystem` | `BIT` | Không | Mặc định 0. Seed đặt 1 cho 5 loại nạp sẵn; sửa được như loại tự thêm |

Trigger `TR_DepartmentType_CodeImmutable` (AFTER UPDATE, so nhị phân): đổi `Code` thì báo `CODE_IMMUTABLE` và rollback.

### `Department`: phòng ban

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | Không | `PK_Department` |
| `Code` | `VARCHAR(20)` | Không | `UQ_Department_Code`. `CK_Department_Code`: chỉ `A-Z 0-9 -` (mã nằm trong `Path`), không rỗng, không khoảng trắng cuối. Bất biến (trigger) |
| `Name` | `NVARCHAR(255)` | Không | |
| `NameEn` | `NVARCHAR(255)` | Có | Tên tiếng Anh |
| `DepartmentTypeId` | `INT` | Không | `FK_Department_Type` → `DepartmentType.Id` |
| `ParentId` | `INT` | Có | `FK_Department_Parent` → `Department.Id`; `NULL` là gốc. `CK_Department_NotSelf`: khác `Id` |
| `Path` | `VARCHAR(400)` | Không | `UX_Department_Path` (duy nhất). `CK_Department_Path`: bắt đầu bằng `/`, kết thúc bằng `/<Code>/`. Khớp cây do trigger kiểm |
| `ManagerEmployeeId` | `INT` | Có | `FK_Department_Manager` → `Employee.Id` (thêm sau khi tạo `Employee`) |
| `BranchCode` | `VARCHAR(10)` | Có | ĐVCS của phòng ban (khóa ngầm), không gắn `A00` (ứng dụng kiểm) |
| `EstablishedDate` | `DATE` | Có | Ngày thành lập |
| `DissolvedDate` | `DATE` | Có | Ngày giải thể |
| `SortOrder` | `INT` | Không | Mặc định 0. Thứ tự giữa các phòng ban cùng cấp |
| `IsActive` | `BIT` | Không | Mặc định 1. `0` là đã giải thể |
| `IsProductionWorkshop` | `BIT` | Không | Mặc định 0 (`0002`). `1`: bộ phận là chuyền may (ô "Xưởng sản xuất"); mã bộ phận là mã chuyền |

Ràng buộc khác: `CK_Department_Dissolved` (đang dùng thì `DissolvedDate` `NULL`; đã giải thể thì phải có), `CK_Department_Dates` (`DissolvedDate ≥ EstablishedDate` khi có cả hai), `CK_Department_ProductionWorkshopBranch` (`IsProductionWorkshop = 0` hoặc có `BranchCode`). Chỉ mục: `UX_Department_Path`, `IX_Department_ParentId`, `IX_Department_BranchCode`, `IX_Department_ManagerEmployeeId`, `IX_Department_ProductionWorkshop` (`BranchCode, Code`, có lọc `WHERE IsProductionWorkshop = 1`, kèm `Name, ParentId, IsActive, SortOrder`; nguồn chuyền đọc chỉ mục này). Trigger:
- `TR_Department_CodeImmutable` (AFTER UPDATE, so nhị phân): chặn đổi `Code`.
- `TR_Department_PathMatchesParent` (AFTER INSERT, UPDATE): `Path` của dòng vừa ghi phải bằng `Path` của cha + `Code` + `/` (gốc: `/Code/`), và `Path` của các con trực tiếp phải khớp dòng vừa ghi; sai thì báo `DEPARTMENT_PATH_MISMATCH` và rollback.

### `JobTitle`: chức danh

Không đặt tên `Position` (từ khóa dành riêng của ODBC).

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | Không | `PK_JobTitle` |
| `Code` | `VARCHAR(30)` | Không | `UQ_JobTitle_Code`. `CK_JobTitle_Code`: chỉ `A-Z 0-9 . _ -`, không rỗng, không khoảng trắng cuối. Bất biến (trigger `TR_JobTitle_CodeImmutable`) |
| `Name` | `NVARCHAR(150)` | Không | |
| `Description` | `NVARCHAR(300)` | Có | |
| `DepartmentId` | `INT` | Có | `FK_JobTitle_Department` → `Department.Id`. `NULL`: dùng chung; có giá trị: dùng cho phòng ban đó và cả nhánh con. `IX_JobTitle_DepartmentId` |
| `SortOrder` | `INT` | Không | Mặc định 0 |
| `IsActive` | `BIT` | Không | Mặc định 1 |
| `IsSystem` | `BIT` | Không | Mặc định 0 |

### `Employee`: hồ sơ nhân viên

Một bảng cho cả thông tin chung và 15 trường theo file xuất của máy chấm công (Support-Web tách hai bảng nối bằng chuỗi mã). Không lưu "Mật mã" (PIN máy chấm công). Không xóa vật lý: nghỉ việc là `EmploymentStatus = 2`. Cột "Khóa API" là khóa JSON của API, trùng mã cột ở chính sách cột; nhóm là nhóm trên form.

| Cột | Kiểu | NULL | Khóa API · nhãn · nhóm | Ghi chú |
|---|---|---|---|---|
| `Id` | `INT IDENTITY` | Không | `id` | `PK_Employee`. Không bao giờ đổi; mọi liên kết tới nhân viên đi theo `Id` |
| `Code` | `VARCHAR(30)` | Không | `code` · Mã nhân viên · chung | `UQ_Employee_Code`. `CK_Employee_Code`: chỉ `A-Z 0-9 . _ -`, không khoảng trắng cuối. **Sửa được** (không có trigger) |
| `TimekeepingCode` | `VARCHAR(30)` | Có | `timekeepingCode` · Mã chấm công · chung | `CK_Employee_TimekeepingCode` như `Code`. `UX_Employee_TimekeepingCode` duy nhất khi khác `NULL`. Ứng dụng luôn điền (trống thì bằng mã nhân viên) |
| `FullName` | `NVARCHAR(255)` | Không | `fullName` · Tên nhân viên · chung | |
| `FullNameEn` | `NVARCHAR(255)` | Có | `fullNameEn` · Tên tiếng Anh · chung | |
| `Email` | `VARCHAR(150)` | Có | `email` · Email · chung | Chỉ ASCII, ứng dụng kiểm |
| `Gender` | `TINYINT` | Không | `gender` · Giới tính · chung | `CK_Employee_Gender`: 1 Nam, 2 Nữ, 3 Khác |
| `DepartmentId` | `INT` | Không | `departmentId` · Phòng ban · chung | `FK_Employee_Department` → `Department.Id` |
| `JobTitleId` | `INT` | Không | `jobTitleId` · Chức danh · chung | `FK_Employee_JobTitle` → `JobTitle.Id`. `IX_Employee_JobTitleId` |
| `EmploymentStatus` | `TINYINT` | Không | `employmentStatus` · Tình trạng · chung | Mặc định 1. `CK_Employee_EmploymentStatus`: 1 Đang làm việc, 2 Nghỉ việc |
| `StartDate` | `DATE` | Có | `startDate` · Ngày bắt đầu làm việc · chung | |
| `EndDate` | `DATE` | Có | `endDate` · Ngày nghỉ việc · chung | `CK_Employee_EndDate`: chỉ có khi `EmploymentStatus = 2`, không trước `StartDate` |
| `TimekeepingName` | `NVARCHAR(255)` | Có | `timekeepingName` · Tên chấm công · chấm công | |
| `CardCode` | `NVARCHAR(50)` | Có | `cardCode` · Mã thẻ · chấm công | |
| `StaffType` | `NVARCHAR(100)` | Có | `staffType` · Loại nhân viên · chấm công | Chính thức, Thời vụ… Không đặt `EmployeeType` (lặp tên bảng) |
| `IsTimekeepingAllowed` | `BIT` | Có | `isTimekeepingAllowed` · Cho phép chấm công · chấm công | `NULL` là chưa rõ |
| `Nickname` | `NVARCHAR(255)` | Có | `nickname` · Tên thường gọi · cá nhân | |
| `BirthDate` | `DATE` | Có | `birthDate` · Ngày sinh · cá nhân | Nhạy cảm |
| `BirthPlace` | `NVARCHAR(255)` | Có | `birthPlace` · Nơi sinh · cá nhân | |
| `Hometown` | `NVARCHAR(255)` | Có | `hometown` · Nguyên quán · cá nhân | |
| `Ethnicity` | `NVARCHAR(100)` | Có | `ethnicity` · Dân tộc · cá nhân | |
| `Nationality` | `NVARCHAR(100)` | Có | `nationality` · Quốc tịch · cá nhân | |
| `IdNumber` | `NVARCHAR(50)` | Có | `idNumber` · Số CMND/CCCD · giấy tờ | Nhạy cảm |
| `IdIssuePlace` | `NVARCHAR(255)` | Có | `idIssuePlace` · Nơi cấp · giấy tờ | |
| `ContactPhone` | `NVARCHAR(50)` | Có | `contactPhone` · Điện thoại liên lạc · giấy tờ | Nhạy cảm |
| `ContactPerson` | `NVARCHAR(255)` | Có | `contactPerson` · Người liên hệ · giấy tờ | Nhạy cảm |
| `CurrentAddress` | `NVARCHAR(500)` | Có | `currentAddress` · Địa chỉ hiện tại · giấy tờ | Nhạy cảm |

Chỉ mục: `UQ_Employee_Code`, `UX_Employee_TimekeepingCode` (có lọc `WHERE TimekeepingCode IS NOT NULL`), `IX_Employee_Department_Status (DepartmentId, EmploymentStatus)` (lọc theo phòng ban, đếm người đang làm của từng nút cây, chặn giải thể), `IX_Employee_JobTitleId`.

### Khóa ngầm

Khai ở `backend/migrations/softkeys.json`, kiểm bằng `npm run check:softkeys -w backend`.

| Cột | Trỏ tới | Ghi chú |
|---|---|---|
| `Department.BranchCode` | `MES_Core.SysBranch.Code` với `IsAggregate = 0` | Cho phép `NULL`; gắn `A00` thì `check:softkeys` báo |
| `Department.CreatedBy` | `MES_Core.SysUser.Id` | Cho phép `NULL` |
| `Employee.CreatedBy` | `MES_Core.SysUser.Id` | Cho phép `NULL` |

Chiều ngược (khai ở module dùng): `MES_Order.ShipmentPlanLine.LineCode`, `MES_Sewing.SewingPrep.LineCode` → `Department.Code`, cùng ĐVCS, không lọc theo cờ (bộ phận đã bỏ tích, giải thể vẫn là đích hợp lệ; mã không còn là bộ phận nào là chuyền cũ mồ côi).

**Chưa có liên kết tài khoản ↔ nhân viên:** không khai khóa ngầm `SysUser.EmployeeCode → Employee.Code` vì mã nhân viên sửa được. Khi nối tài khoản với nhân viên thì thêm cột `SysUser.EmployeeId` (ADR 0012 mục 4). Module khác sau này trỏ tới nhân viên bằng `EmployeeId`.

## Dữ liệu mẫu và script

Code: `backend/scripts/hr-data.ts`, dữ liệu ở cuối `backend/scripts/seed-data.ts` (`hrDepartmentTypes`, `hrDepartments`, `hrJobTitles`, `hrStaffing`).

- `npm run seed` (bước 13) gọi `seedHrIfReady`: chỉ chạy khi `MES_Hr` đã tạo **và** đã migrate (`hrDbState`); chưa thì cảnh báo và bỏ qua, không làm hỏng phần đã seed của database khác. Chỉ thêm phần còn thiếu theo mã, không sửa mục đã có (người dùng có thể đã sửa trên màn):
  - Luôn nạp: 5 loại phòng ban (`CONG_TY` cấp 1, `KHOI` 2, `NHA_MAY` 2, `PHONG` 3, `BO_PHAN` 4 cấp cuối; `IsSystem = 1`) và các chức danh dùng chung (không gắn phòng ban).
  - Chỉ khi có dữ liệu mẫu (`SEED_SAMPLE_DATA` không phải `false`): phòng ban mẫu (1 đã giải thể; các nhà máy, bộ phận gắn `A01`–`A03`; xưởng và chuyền may mẫu tích "Xưởng sản xuất", mã như `A01-L03`; danh sách: [Dữ liệu mẫu và kiểm thử](12-du-lieu-mau-va-kiem-thu.md)), chức danh gắn phòng ban mẫu, và 40 nhân viên giả (chỉ khi bảng `Employee` còn trống, sinh xác định theo hạt giống, trong một transaction, có người nghỉ việc, gán người quản lý). Tên, giấy tờ hư cấu: CCCD đầu `999`, điện thoại đầu `0900`, email miền `.example`.
- `npm run reset:demo -- --yes` gọi `clearHr`: xóa toàn bộ loại phòng ban, phòng ban, chức danh, nhân viên để seed nạp lại (kể cả chuyền may mẫu, trước khi nạp lại đơn hàng và dàn chuyền); Id đổi sau mỗi lần. Script dàn chuyền (`sim:board`, `load:bravo`) đọc chuyền từ `MES_Hr` (`readLines` ở `backend/scripts/script-db.ts`): bộ phận đang tích, chưa giải thể, có ĐVCS. Chỉ chạy trên máy demo (`assertDemoMachine`). Khi module khác có khóa ngầm `EmployeeId` thì phải xét lại script này.
- Chi tiết lệnh: [Vận hành](11-van-hanh.md); tài khoản thử, kịch bản: [Dữ liệu mẫu và kiểm thử](12-du-lieu-mau-va-kiem-thu.md).

## Test

| File | Nội dung chính |
|---|---|
| `backend/test/hr.spec.ts` | Chạy trên DB thật. Đọc ngày nhiều định dạng, nhận dòng tiêu đề; không có quyền 403, chỉ xem không ghi được; thêm, sửa, chuyển nhánh phòng ban (mã, cha, `Path`, không gắn `A00`); nhân viên (trùng mã 409, chức danh ngoài phạm vi 422, đổi mã giữ Id); lọc nhánh con, tìm không dấu; dữ liệu dùng chung ở phiên một nhà máy; cột nhạy cảm (Nhân sự thấy, Giám đốc `***`, Quản trị không thấy, Toàn quyền thấy, file xuất, nhật ký đọc nhạy cảm); giải thể, khôi phục; nhập Excel; người quản lý; loại phòng ban (quyền, mã, trùng, cấp cuối, ngừng dùng, nhật ký); chuyền may (tích thiếu ĐVCS 422, thiếu quyền sửa Phân quyền 403, `/me/lines` theo ĐVCS và gom theo bộ phận cha, bỏ tích, giải thể thì mất ngay, đổi tên, cha không cần quyền thêm, đổi ĐVCS cần, người đang giữ phạm vi mã đó không tự đổi, `line-holders`, nhật ký `LINE_SET_CHANGE`, lỗi tăng phiên bản thành `LINE_SCOPE_UPDATE_FAILED`) |
| `backend/test/line-source.spec.ts` | `OrgService` với nguồn chuyền giả: đóng an toàn khi chưa có nguồn, lọc ĐVCS, `assertLine`, cache và `invalidate`, đọc chung, nguồn lỗi, tên chuyền mồ côi |
| `frontend/src/test/hr.test.tsx` | Hàm cây, chức danh theo phòng ban, file mẫu; Sơ đồ tổ chức (mở theo URL, thêm con/cùng cấp, cấp cuối, khóa giải thể, chọn phòng ban vừa thêm, điện thoại giữ form); Thông tin nhân sự (bỏ chức danh không hợp lệ, hỏi khi bỏ dở, giữ bộ lọc sau khi sửa, chỉ tải theo phòng ban trên link); ô "Xưởng sản xuất" (khóa nói lý do, cần ĐVCS, dấu trên cây, ô ĐVCS chỉ đọc khi thiếu quyền, báo trước người được giao chuyền, đổi ĐVCS, khôi phục, đã lưu mà chưa cập nhật phân quyền); ĐVCS mặc định theo phòng ban cha (điền sẵn, đổi theo cha, chọn hoặc xóa tay thì giữ, đã chọn tay từ trước thì giữ, cha không có ĐVCS thì giữ giá trị đã lưu, ĐVCS đã tắt thì không lấy, chuyền thiếu quyền thì không đổi, báo phòng ban con giữ ĐVCS, cache bị xóa không mất form, tải danh mục lỗi có Thử lại) |

Chưa có test frontend riêng cho bảng Loại phòng ban.

## Giới hạn hiện tại

- Chưa có màn sửa Chức danh; chưa có "hoạch định vị trí" (công việc × cấp bậc × phòng ban), định biên.
- Chưa nối tài khoản đăng nhập với nhân viên; chưa phân quyền theo phòng ban (L3).
- Chưa tải lên file `.xlsx` (chỉ dán vào lưới); chưa nhập để sửa hàng loạt hồ sơ đã có.
- Chưa có quá trình công tác (lịch sử đổi phòng ban, chức danh), chưa xuất file Sơ đồ tổ chức.
- Mã phòng ban không sửa được (nằm trong `Path`); nhập sai thì giải thể rồi tạo lại.
- Tìm không dấu quét bảng; vượt khoảng 10.000 nhân viên thì cần cột tính sẵn chứa chữ đã bỏ dấu.
