# ADR 0010 – Cây tổ chức có cấp Xưởng: Nhà máy → Xưởng → Chuyền

**Trạng thái:** Accepted (người dùng chọn phương án B ngày 10/10/2026; duyệt cùng Phase 5.4) · **Ngày:** 10/10/2026

## Bối cảnh
Danh mục chuyền may (Phase 5.4) chỉ có hai cấp: Nhà máy → Chuyền. Người dùng muốn thiết kế lại theo dạng cây như bảng bộ phận
(ô chọn "Phòng ban cha" dạng cây), ví dụ:

```
Nhà máy A01
└─ Xưởng 01
   └─ Chuyền 02
```

Mục đích: gom dữ liệu linh hoạt hơn, ô chọn chuyền dễ nhìn hơn.

Hiện trạng: chuyền đã nằm trong `SysOrgUnit` (ADR 0005), là cây có:
- `ParentId`;
- `Path` (`/A01/A01-L03/`), dùng cho phạm vi "cả nhánh";
- `OrgType` (`FACTORY`, `LINE`);
- khóa ngoại ghép giữ con cùng nhà máy với cha;
- `Code` cấm sửa.

Ba phương án đã cân nhắc với người dùng:

| | A. Cây + `IsGroup` | B. Cây + loại nút | C. Mỗi cấp một bảng |
|---|---|---|---|
| Linh hoạt số cấp | Cao | Cao | Thấp: thêm cấp phải sửa migration, code |
| Báo cáo theo xưởng | Mơ hồ khi các nhà máy khác số cấp | Rõ | Rõ |
| Hợp với code đã có | Phải sửa phân quyền (chiều `LINE` lọc theo loại) | Gần như giữ nguyên | Viết lại cây và phân quyền |
| Ràng buộc dữ liệu | Tự giữ | Tự giữ, có quy tắc theo loại | Khóa ngoại thường |

## Quyết định
Người dùng chọn **B**:
- giữ `SysOrgUnit`, thêm loại `WORKSHOP`;
- không thêm cột `IsGroup`: nút nhóm là nút khác `LINE`.

1. **Cấp cố định**, database tự giữ (migration `MES_Core/0005_org_workshop.sql`):
   - Nhà máy là gốc (`Code` = `BranchCode`, như trước).
   - Xưởng chỉ nằm dưới nhà máy, không lồng nhau.
   - Chuyền nằm dưới xưởng, hoặc thẳng dưới nhà máy (mọi chuyền trước 0005, và nhà máy chưa chia xưởng).
   - Cách giữ:
     - cột `ParentOrgType` chép loại của nút cha;
     - khóa ngoại ghép `(ParentId, BranchCode, ParentOrgType)` → `(Id, BranchCode, OrgType)` buộc bản chép đúng;
     - `CK_SysOrgUnit_Level` giới hạn cặp (loại, loại cha).
   - Kết quả: chuyền không làm cha được, cây không có vòng lặp, không đổi được loại của nút đang có con, con luôn cùng nhà máy với cha.
   - `MES_Core/0006_org_path_guard.sql` (review 5.4.8):
     - tạo lại `CK_SysOrgUnit_Level` cho database đã chạy bản 0005 đầu (thiếu `ParentOrgType IS NOT NULL`);
     - thêm trigger buộc `Path` = `Path` của cha + `Code` + `/`. Phân quyền "cả nhánh" lọc theo `Path`, màn hình đi theo `ParentId`, nên hai thứ này không được lệch.
   - Vì có trigger, chèn vào `SysOrgUnit` không dùng `OUTPUT` (SQL Server không cho trên bảng có trigger): thêm rồi đọc lại theo mã.
2. **Dữ liệu nghiệp vụ vẫn gắn vào chuyền** (`LineCode`; khóa ngầm trong `softkeys.json` vẫn lọc `OrgType = 'LINE'`). Xưởng chỉ để gom.
3. **Chuyển chuyền sang xưởng khác:**
   - đổi `ParentId`, `ParentOrgType`, `Path`; mã chuyền giữ nguyên nên kế hoạch đã xếp không đổi;
   - tăng phiên bản quyền, vì phạm vi "cả nhánh" theo `Path` đổi theo;
   - đây là đổi phạm vi dữ liệu mà không qua màn Phân quyền (review 5.4.8 M2), nên:
     - người chuyển phải có `admin.permission:update`, ngoài `admin.catalog:update`;
     - người đang được giao phạm vi cả xưởng cũ hoặc cả xưởng mới không tự chuyển được (`403 SELF_ELEVATION_FORBIDDEN`), như không tự sửa phạm vi của mình (ADR 0004);
     - giao diện hỏi lại, nêu rõ hậu quả: người được giao cả xưởng cũ mất chuyền, cả xưởng mới thấy và sửa được dữ liệu của chuyền.
   - Thêm chuyền mới vào xưởng không cần thêm quyền: chuyền mới chưa có dữ liệu. Giống thêm chuyền vào nhà máy trước đây.
4. **Chuyền đang dùng phải nằm trong xưởng đang dùng**, nên:
   - không ngừng được xưởng còn chuyền đang dùng;
   - không thêm hoặc chuyển chuyền vào xưởng đã ngừng;
   - không bật lại chuyền khi xưởng của nó đang ngừng.

   Nhờ vậy người được giao phạm vi cả xưởng không mất chuyền âm thầm: `PermissionService` bỏ qua nút đã ngừng. Các thay đổi cây chạy nối tiếp bằng `sp_getapplock` (`MES_Core.SysOrgUnit`) để hai người sửa cùng lúc không lách quy tắc.
5. **API** (`/admin/catalogs`):
   - `GET lines` trả thêm `workshops` (kèm số chuyền đang dùng) và `workshopId` của từng chuyền;
   - thêm `POST workshops`, `PUT workshops/:id`;
   - `POST/PUT lines` nhận `workshopId` (`null`: thẳng dưới nhà máy).
   - Mã xưởng như mã chuyền: bắt đầu bằng mã nhà máy, duy nhất trên cả cây, không sửa.
   - Nhật ký `WORKSHOP_CREATE`, `WORKSHOP_UPDATE`.
6. **`OrgService`** (`/me/lines`):
   - trả thêm `workshopCode`, `workshopName`;
   - xếp theo cây: nhà máy, xưởng, chuyền; chuyền không thuộc xưởng xếp cuối.
   - Ô chọn chuyền ở Xếp chuyền, Phân bổ màu cỡ, Kế hoạch chuẩn bị SX và màn phạm vi người dùng gom theo xưởng. Chưa chia xưởng thì danh sách phẳng như cũ.
   - Ô chọn một chuyền (lưới dàn chuyền, ô lọc) dùng `TreeSelect`: xưởng thu gọn được, chỉ mở sẵn xưởng của chuyền đang chọn; gõ không dấu tìm theo tên chuyền, mã, tên hoặc mã xưởng; xem nhiều nhà máy (A00) thì thêm cấp nhà máy. Ô chọn nhiều chuyền ở màn phạm vi người dùng vẫn là danh sách có tiêu đề nhóm.
7. **Màn Danh mục hệ thống › Chuyền may** đổi sang bảng cây (đường chấm theo cấp, mở/thu gọn xưởng), có thêm/sửa xưởng và ô Xưởng ở popup chuyền.

## Giả định đang dùng (chưa có câu trả lời của BA)
- Số cấp cố định Nhà máy → Xưởng → Chuyền.
  - Cần thêm cấp (Cụm, Tổ) thì thêm loại mới bằng migration và ADR mới.
  - Bảng loại riêng (`SysOrgType`) chỉ làm khi các nhà máy cần tự đặt cấp khác nhau.
- Chuyển chuyền sang xưởng khác thì mọi số liệu gom theo xưởng (kể cả của tháng trước) đổi theo xưởng mới.
  - Chưa có báo cáo nào gom theo xưởng.
  - Cần giữ lịch sử thì lưu mã xưởng vào giao dịch lúc ghi, hoặc lưu cha theo thời gian hiệu lực.
- Phạm vi "cả xưởng" (`ORG_SUBTREE` trên nút xưởng, chiều `LINE`):
  - backend đã chạy, có test;
  - màn phạm vi người dùng chưa có ô chọn "cả xưởng" (vẫn chọn từng chuyền), phạm vi loại này đang gán được qua API.

## Hệ quả
- Mọi chỗ ghi `SysOrgUnit` phải ghi `ParentOrgType` và `Path` đúng (service danh mục, seed, reset-demo). Ghi tay sai cấp hoặc sai `Path` bị database chặn.
- Seed tạo xưởng mẫu cho A01, A02 (A03 không chia xưởng):
  - chỉ khi nhà máy chưa có xưởng nào đang dùng (database mới, hoặc trước 0005); xưởng vừa tạo nhận chuyền mẫu đang nằm thẳng dưới nhà máy;
  - nhà máy đã có xưởng (mẫu hay tự chia) thì giữ nguyên cách chia;
  - chuyền mẫu còn thiếu chỉ vào xưởng mẫu khi xưởng đó đang dùng.
- Tổng quan Danh mục hệ thống vẫn đếm chuyền, không đếm xưởng.
