# ADR 0012 – Module Nhân sự: Sơ đồ tổ chức và Thông tin nhân sự

**Trạng thái:** Accepted (người dùng chốt Q1–Q5 ngày 11/10/2026, chốt mã nhân viên sửa được cùng ngày; duyệt cùng Phase 5.8) · **Ngày:** 11/10/2026

## Bối cảnh
Nhóm menu Quản trị nhân sự (`hr`) có 2 màn giữ chỗ từ 10/10/2026: Sơ đồ tổ chức (`hr.orgchart`) và Thông tin nhân sự (`hr.employee`).
Kế hoạch `docs/nguon/KE-HOACH-MES-VSN.md` lấy nghiệp vụ từ 2 màn đang chạy ở Support-Web (ASM), nhưng không chép code. Kế hoạch còn treo 8 câu hỏi (Q1–Q8).

Hai chỗ mâu thuẫn với tài liệu đã có:
- tổng quan dự án ghi hệ thống Nhân sự "Đã có, MES chỉ lấy về dùng";
- khuyến nghị gốc cho vai trò ADMIN quyền ghi, trái ADR 0004 (ADMIN không ghi dữ liệu nghiệp vụ).

## Quyết định

1. **MES tự quản dữ liệu nhân sự (Q1).**
   - Thêm, sửa, nhập hàng loạt ngay trong MES. Đây là ngoại lệ so với tổng quan dự án, người dùng chọn để có màn chạy được trước khi BA trả lời.
   - Nếu sau này lấy về từ hệ thống Nhân sự khác: thêm nguồn đồng bộ qua `MES_Sync` (ADR 0007) và cột nhận diện nguồn. Bảng giữ nguyên.

2. **Database riêng `MES_Hr`**, theo nguyên tắc mỗi module một database.
   - Gồm 4 bảng: `DepartmentType`, `Department`, `JobTitle`, `Employee`.
   - Thiết kế chi tiết: `docs/thiet-ke/db-hr.md`.

3. **Cây phòng ban riêng, không dùng `SysOrgUnit` (Q2).**
   - Cây hành chính có nút cấp công ty không thuộc nhà máy nào (văn phòng, khối). `SysOrgUnit` thì bắt buộc gốc là nhà máy (ADR 0010).
   - Phòng ban thuộc một nhà máy thì gắn `BranchCode` (khóa ngầm tới `MES_Core.SysBranch`). Không gắn được đơn vị tổng hợp `A00`.
   - `Path` = `Path` của cha + `Code` + `/`, như `SysOrgUnit`. Trigger giữ `Path` khớp cây, nên mã phòng ban **không sửa được** (mã nằm trong `Path`).
   - Chuyển phòng ban sang cha khác thì cập nhật `Path` cả nhánh trong một câu lệnh. Cha mới không được nằm trong nhánh con của chính nó.

4. **Mã nhân viên sửa được, chỉ cấm trùng (người dùng chốt 11/10/2026).**
   - `Employee.Id` (khóa chính tự sinh) không bao giờ đổi. Mọi liên kết tới nhân viên đi theo `Id`:
     - người quản lý phòng ban: `Department.ManagerEmployeeId`;
     - khóa ngầm từ module khác sau này: `EmployeeId`.
   - Không liên kết theo chuỗi mã. Support-Web liên kết bằng mã nên đổi mã phải cập nhật dây chuyền 6 bảng; MES tránh được việc đó.
   - Đổi mã ghi nhật ký kèm mã cũ và mã mới.
   - Vì mã đổi được, **chưa khai khóa ngầm** `SysUser.EmployeeCode → Employee.Code`. Khi nối tài khoản với nhân viên (Q8), thêm cột `SysUser.EmployeeId`.

5. **Dùng chung toàn công ty (Q3).**
   - `hr.orgchart`, `hr.employee` khai `ScopeType = 'SHARED'`.
   - Seed đồng bộ cột `ScopeType` cho tài nguyên hệ thống: 2 tài nguyên này đã tạo dạng `BRANCH` lúc seed 10/10/2026.
   - Đọc, ghi vẫn qua `BaseRepository`: tài nguyên chưa khai báo thì từ chối, không có quyền thì không thấy gì.
   - Ghi được ở phiên `A00` như Danh mục hệ thống, vì dữ liệu không thuộc nhà máy nào.
   - Giới hạn theo phòng ban (phạm vi L3) làm sau.
   - **Phạm vi nhà máy, chuyền không có tác dụng với `hr.*`** (review 5.8 M4): tài nguyên SHARED không có cột nhà máy.
     - Ví dụ: gán vai trò Nhân sự kèm phạm vi nhà máy `A01` thì người đó vẫn xem, sửa, xuất mọi hồ sơ toàn công ty, kể cả cột nhạy cảm.
     - Chưa chốt: giữ như vậy (chỉ ghi chú) hay chặn (phép gán có phạm vi nhà máy coi như không có quyền với `hr.*`) cho tới khi làm phạm vi theo phòng ban.
     - Tạm thời: không gán phạm vi nhà máy cho người dùng vai trò Nhân sự.

6. **Vai trò mới Nhân sự `HR` (Q5).**
   - Có quyền Xem, Thêm, Sửa, Xuất file ở cả 2 màn. Không có quyền Xóa: phòng ban giải thể, nhân viên nghỉ việc.
   - ADMIN giữ quyền Xem, Giám đốc giữ Xem + Xuất file. Đúng tách nhiệm vụ của ADR 0004.

7. **Chức danh là danh mục phẳng `JobTitle` (Q4).**
   - Không có phòng ban: dùng chung toàn công ty. Có phòng ban: dùng cho phòng ban đó và cả nhánh con.
   - Không làm "hoạch định vị trí" (Công việc × Cấp bậc × Phòng ban) như Support-Web.
   - Máy chủ kiểm chức danh nằm trong phạm vi phòng ban của nhân viên. Support-Web khai điều kiện này nhưng không dùng.
   - Loại phòng ban có `IsFinalLevel` thì không thêm được phòng ban con.

8. **Trường từ máy chấm công (Q6).**
   - Giữ 15 trường, bỏ "Mật mã" (PIN máy chấm công, Support-Web lưu chữ thường).
   - 5 cột đăng ký nhạy cảm (`SysResourceField.IsSensitive`), mặc định Ẩn, che theo vai trò:
     - `idNumber`, `birthDate`, `currentAddress`, `contactPhone`, `contactPerson`.
   - Vai trò Nhân sự được sửa các cột này; Giám đốc thấy `***`.

9. **Nhập hàng loạt bằng cách dán từ Excel (Q7).**
   - Dán vào lưới nhập `SheetGrid` (ADR 0008), không thêm thư viện đọc `.xlsx`.
   - Máy chủ kiểm và dò phòng ban, chức danh (xem trước), rồi ghi từng dòng độc lập: dòng lỗi không chặn dòng khác.
   - File mẫu là CSV có sẵn tiêu đề, cùng thứ tự cột với lưới.

10. **Ngoại lệ ADR 0011 cho danh sách nhân viên.**
    - Danh sách là các thẻ bên cạnh form (bố cục Support-Web), không có tiêu đề cột, nên không có popup lọc theo cột.
    - Tìm, lọc theo phòng ban (gồm nhánh con), chức danh, tình trạng vẫn chạy trong DB. Mới tạo lên trước, 20 thẻ mỗi trang.
    - Tìm không phân biệt dấu, hoa thường, kể cả chữ "đ".

## Hệ quả
- Thêm biến `DB_HR_NAME` (mặc định `MES_Hr`). Quản trị CSDL tạo database và cấp `db_owner` cho tài khoản ứng dụng trước khi chạy migration (như `MES_Sewing`).
- Bảng có trigger (`Department`, `DepartmentType`, `JobTitle`) không dùng `INSERT … OUTPUT`: thêm rồi đọc lại theo mã (như `SysOrgUnit`).
- Nếu BA chốt hệ thống Nhân sự khác là nguồn chính, 2 màn chuyển sang chỉ xem phần lấy về (`KE-HOACH-MES-VSN.md` mục 5).
- Muốn sửa được mã phòng ban thì phải đổi `Path` sang theo `Id`. Đó là quyết định mới, cần ADR mới.
