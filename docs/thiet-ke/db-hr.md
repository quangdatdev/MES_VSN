# Thiết kế database MES_Hr (module Nhân sự)

Module Nhân sự, Phase 5.8, ADR 0012. Migration: `backend/migrations/MES_Hr/`.

**Tạo database:**
- Quản trị CSDL tạo `MES_Hr` trống và cấp `db_owner` cho tài khoản ứng dụng (tài khoản ứng dụng không có quyền `CREATE DATABASE`), rồi chạy `npm run migrate`.
- Trong lúc database đã tạo mà chưa migrate, `npm run seed` bỏ qua phần Nhân sự, còn `npm run reset:demo` dừng trước khi chạm `MES_Core`.

**Quy ước** như các database khác: PascalCase, số ít, thời điểm `DATETIME2(3)` giờ UTC, ngày `DATE`.

**Dữ liệu dùng chung toàn công ty** (`SysResource.ScopeType = 'SHARED'`), không có `BranchCode` bắt buộc. Đọc, ghi vẫn qua `BaseRepository`: tài nguyên chưa khai báo thì từ chối, không có quyền thì không thấy gì.

## Bảng

| Bảng | Tài nguyên | Cột chính | Ghi chú |
|---|---|---|---|
| `DepartmentType` | danh mục (chưa có màn sửa) | `Code` (bất biến, trigger), `Name`, `Description`, `LevelOrder` (0–99), `IsFinalLevel`, `SortOrder`, `IsActive`, `IsSystem` | Công ty, Khối, Nhà máy, Phòng, Bộ phận. `LevelOrder` sắp xếp cây. `IsFinalLevel`: không thêm phòng ban con được (máy chủ chặn) |
| `Department` | `hr.orgchart` | `Code` VARCHAR(20) (bất biến, trigger), `Name`, `NameEn`, `DepartmentTypeId`, `ParentId`, `Path` VARCHAR(400), `ManagerEmployeeId`, `BranchCode` (NULL), `EstablishedDate`, `DissolvedDate`, `SortOrder`, `IsActive` | Cây phòng ban hành chính (xem mục Cây) |
| `JobTitle` | danh mục (chưa có màn sửa) | `Code` (bất biến, trigger), `Name`, `Description`, `DepartmentId` (NULL), `SortOrder`, `IsActive`, `IsSystem` | `DepartmentId` NULL: dùng chung; có giá trị: dùng cho phòng ban đó và cả nhánh con. Không đặt tên `Position` (từ khóa ODBC) |
| `Employee` | `hr.employee` | `Code` VARCHAR(30) (sửa được, duy nhất), `TimekeepingCode` (duy nhất khi có), `FullName`, `FullNameEn`, `Email` VARCHAR(150), `Gender` (1 Nam, 2 Nữ, 3 Khác), `DepartmentId`, `JobTitleId`, `EmploymentStatus` (1 Đang làm việc, 2 Nghỉ việc), `StartDate`, `EndDate` + 15 cột theo file máy chấm công | Không xóa vật lý: nghỉ việc là `EmploymentStatus = 2` |

**15 cột theo file máy chấm công** (đều không bắt buộc; không lưu "Mật mã"):
- `TimekeepingName`, `CardCode`, `StaffType`, `IsTimekeepingAllowed`;
- `Nickname`, `BirthDate`, `BirthPlace`, `Hometown`, `Ethnicity`, `Nationality`;
- `IdNumber`, `IdIssuePlace`, `ContactPhone`, `ContactPerson`, `CurrentAddress`.

`StaffType` là "Loại" của máy chấm công, không đặt `EmployeeType` (lặp tên bảng).

## Mã và liên kết (ADR 0012 mục 3, 4)

**Mã phòng ban** chỉ gồm chữ hoa ASCII, số, gạch ngang (mã nằm trong `Path` và điều kiện so `Path`).
- Không sửa được: trigger `TR_Department_CodeImmutable` so sánh nhị phân.
- Muốn sửa được thì phải đổi `Path` sang theo `Id`. Đó là quyết định mới, cần ADR mới.

**Mã nhân viên** gồm chữ hoa, số, dấu chấm, gạch dưới, gạch ngang; ứng dụng tự viết hoa.
- **Sửa được**, chỉ cấm trùng (`UQ_Employee_Code`).
- `Employee.Id` không bao giờ đổi; mọi liên kết tới nhân viên đi theo `Id`.

**Mã chấm công:**
- Để trống khi lưu thì ứng dụng lấy theo mã nhân viên.
- Duy nhất qua chỉ mục có lọc `UX_Employee_TimekeepingCode ... WHERE TimekeepingCode IS NOT NULL`.

**CHECK định dạng mã** có thêm `DATALENGTH(Code) = LEN(Code)`: `LIKE` trên VARCHAR bỏ qua khoảng trắng cuối, nên `'NV1 '` lọt qua mẫu ký tự (review 5.8 L1).

**Email** chỉ nhận ký tự ASCII in được, do ứng dụng kiểm (`EMAIL` ở `employee-fields.ts`). Cột VARCHAR bảng mã 1252 đổi chữ có dấu trước khi CHECK chạy, nên DB không tự bắt được.

## Cây phòng ban

**Đường dẫn:**
- `Path` = `Path` của cha + `Code` + `/`; gốc là `/` + `Code` + `/`. Ví dụ `/VSN/VP/KT/`.
- Lọc cả nhánh bằng `LEFT(Path, LEN(@path)) = @path` (không dùng `LIKE`, tránh ký tự đại diện). Dấu `/` ở cuối giữ cho `KT` không khớp nhầm `KT2`.

**Trigger `TR_Department_PathMatchesParent`** (AFTER INSERT, UPDATE) kiểm hai điều:
- `Path` của dòng vừa ghi khớp cha;
- `Path` của các con trực tiếp khớp dòng vừa ghi.

Đổi cha mà quên cập nhật nhánh thì bị chặn. `Path` duy nhất và khớp cha nên cây không có vòng lặp.

**Chuyển phòng ban sang cha khác:**
- Một câu `UPDATE` đổi `Path` của cả nhánh và `ParentId` của chính nút, để trigger thấy cây đã khớp sau câu lệnh.
- Máy chủ kiểm trước:
  - cha mới đang dùng, không phải cấp cuối, không nằm trong nhánh của nút;
  - `Path` dài nhất của nhánh sau khi chuyển không vượt 400 ký tự.

**Thay đổi cấu trúc** (thêm, chuyển, giải thể, khôi phục) giữ khóa ứng dụng `sp_getapplock 'MES_Hr.Department'` ở chế độ **Exclusive**.
- Thêm, sửa, nhập nhân viên giữ khóa này ở chế độ **Shared**, rồi đọc lại phòng ban và chức danh của chính dòng đang ghi (review 5.8 M1).
- Kết quả: không có nhân viên đang làm lọt vào phòng ban vừa giải thể.

**Giải thể** = `IsActive = 0` kèm `DissolvedDate` (`CK_Department_Dissolved`).
- Bị chặn khi còn phòng ban con đang dùng hoặc nhân viên đang làm (trực tiếp trong phòng ban). Thông báo nêu số lượng.
- Khôi phục cần phòng ban cha đang dùng.

**Bảng có trigger** (`DepartmentType`, `Department`, `JobTitle`) không dùng `INSERT ... OUTPUT`: thêm rồi đọc lại theo mã.

**`Department.BranchCode`** là thuộc tính "phòng ban của nhà máy nào", không phải cột phạm vi.
- `DepartmentRepository` tự ghi cột này (`insertNode`, `updateNode` qua `scoped`), vì `create`/`update` của nền tảng luôn bỏ `BranchCode` do client gửi.
- Không gắn được đơn vị tổng hợp `A00` (máy chủ kiểm, `check:softkeys` cũng báo).

## Chỉ mục

| Bảng | Chỉ mục |
|---|---|
| `DepartmentType` | `UQ_DepartmentType_Code` |
| `Department` | `UQ_Department_Code`, `UX_Department_Path`, `IX_Department_ParentId`, `IX_Department_BranchCode`, `IX_Department_ManagerEmployeeId` |
| `JobTitle` | `UQ_JobTitle_Code`, `IX_JobTitle_DepartmentId` |
| `Employee` | `UQ_Employee_Code`, `UX_Employee_TimekeepingCode` (có lọc), `IX_Employee_Department_Status (DepartmentId, EmploymentStatus)` (lọc theo phòng ban, đếm người đang làm của từng nút cây, chặn giải thể), `IX_Employee_JobTitleId` |

## Khóa ngoại (trong `MES_Hr`)

| Cột | Trỏ tới |
|---|---|
| `Department.DepartmentTypeId` | `DepartmentType.Id` |
| `Department.ParentId` | `Department.Id` (tự tham chiếu) |
| `Department.ManagerEmployeeId` | `Employee.Id` (thêm sau khi tạo `Employee`) |
| `JobTitle.DepartmentId` | `Department.Id` |
| `Employee.DepartmentId` | `Department.Id` |
| `Employee.JobTitleId` | `JobTitle.Id` |

## Khóa ngầm (`migrations/softkeys.json`)

| Cột | Trỏ tới |
|---|---|
| `Department.BranchCode` | `MES_Core.SysBranch.Code` với `IsAggregate = '0'` (gắn `A00` thì `check:softkeys` báo) |
| `Department.CreatedBy`, `Employee.CreatedBy` | `MES_Core.SysUser.Id` |

**Chưa khai** `SysUser.EmployeeCode → Employee.Code`: mã nhân viên sửa được. Khi nối tài khoản với nhân viên (Q8 của kế hoạch), thêm cột `SysUser.EmployeeId`.

## Tìm kiếm

**Tìm nhân viên** (ô tìm của danh sách, ô Người quản lý):
- Phạm vi tìm: mã nhân viên, mã chấm công, tên, tên tiếng Anh, email, tên chức danh.
- Không phân biệt dấu, hoa thường, kể cả chữ "đ": hai vế cùng đổi đ → d rồi so theo `Latin1_General_100_CI_AI`.
- Không dùng chỉ mục (quét bảng), đủ nhanh với vài nghìn nhân viên. Vượt khoảng 10.000 người thì thêm cột tính sẵn chứa chữ đã bỏ dấu.
- Email bị Ẩn, Che theo chính sách cột thì không tìm theo email.

## Cột nhạy cảm (`SysResourceField` của `hr.employee`)

**Đăng ký:**
- `email`, `birthPlace`, `hometown`;
- 5 cột nhạy cảm (mặc định Ẩn): `birthDate`, `idNumber`, `contactPhone`, `contactPerson`, `currentAddress`.

Mã, tên, phòng ban, chức danh, tình trạng là khung của màn, không đăng ký (ẩn đi thì không lưu được hồ sơ, và phòng ban, chức danh còn đi kèm cột tên).

**Chính sách mẫu:**
- vai trò Nhân sự: Sửa được;
- Giám đốc: Che;
- vai trò khác: Ẩn (mặc định).

**Nhật ký** không ghi giá trị cột nhạy cảm, chỉ ghi dấu "(đã đổi)".

## Dữ liệu giả và reset

**Seed** (`scripts/hr-data.ts`, dữ liệu ở cuối `scripts/seed-data.ts`):
- thêm phần còn thiếu theo mã: 5 loại phòng ban, 12 phòng ban (1 đã giải thể, 2 nhà máy gắn `A01`, `A02`), 13 chức danh;
- 40 nhân viên giả, có người nghỉ việc, chỉ khi bảng `Employee` còn trống, sinh trong một transaction.
- Tên, mã hư cấu: CCCD đầu `999`, điện thoại đầu `0900`, email miền `.example`.
- `SEED_SAMPLE_DATA=false` (máy dùng thật): chỉ nạp 5 loại phòng ban và 7 chức danh dùng chung (không gắn phòng ban). Hai danh mục này chưa có màn sửa, thiếu thì không thêm được phòng ban, nhân viên. Bỏ phòng ban mẫu, chức danh gắn với phòng ban mẫu, nhân viên giả.

**`npm run reset:demo -- --yes`:**
- xóa toàn bộ `MES_Hr` (loại phòng ban, phòng ban, chức danh, nhân viên) rồi seed nạp lại; Id đổi sau mỗi lần;
- chỉ chạy trên máy demo (`assertDemoMachine`: SQL Server cùng máy, không `NODE_ENV=production`, không `SEED_SAMPLE_DATA=false`), như `clearSewingPrep`;
- khi module khác có khóa ngầm `EmployeeId` thì phải xét lại.
