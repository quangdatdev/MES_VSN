# Task 5.8.9 – Danh mục Loại phòng ban

**Trạng thái:** Đang làm · **Ngày:** 12/10/2026 · **Thuộc:** Phase 5.8, mục Phát sinh "Danh mục Loại phòng ban, Chức danh chưa có màn sửa" · **Liên quan:** `docs/thiet-ke/db-hr.md`, ADR 0012

## Mục tiêu
Tự thêm loại phòng ban mới (ví dụ Tổ, Xưởng, Ban, Chi nhánh); sửa tên, cấp, cấp cuối, thứ tự; ngừng dùng loại không còn dùng. Loại mới hiện ngay trong ô "Loại phòng ban" ở màn Sơ đồ tổ chức.

## Chốt với người dùng (12/10/2026)

| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Đặt màn ở đâu, ai được sửa | **Tạm gom vào Quản trị › Danh mục hệ thống** "để dễ quản lý" (phương án B), như Cấu hình chuẩn bị SX. Quyền `admin.catalog`: chỉ vai trò Quản trị thêm, sửa. Ghi ngoại lệ vào ADR 0012 mục 6 |
| Q2 | Bật "Cấp cuối" cho loại đang có phòng ban có con | Theo khuyến nghị: **chặn**. Tính cả phòng ban đã giải thể và phòng ban con đã giải thể, vì khôi phục không kiểm lại cấp cuối (cùng luật `anyChildren` khi đổi loại một phòng ban). Thông báo nêu tối đa 3 phòng ban kèm tổng số |
| Q3 | Ngừng dùng loại đang có phòng ban dùng | Theo khuyến nghị: **cho ngừng**. Phòng ban đang gán giữ nguyên loại, vẫn sửa được các trường khác; không chọn được cho phòng ban mới hay khi đổi loại (luật đã có). Hộp xác nhận nêu số phòng ban đang dùng |
| Q4 | Cấp (`LevelOrder`) | Theo khuyến nghị: **chỉ để sắp xếp**, không ràng buộc "con phải cấp lớn hơn cha" (dữ liệu mẫu có Khối và Nhà máy cùng cấp 2 dưới Công ty) |
| Q5 | 5 loại nạp sẵn (`IsSystem`) | Theo khuyến nghị: **sửa được như loại tự thêm**; mã không đổi được (áp cho mọi loại); bảng gắn nhãn "Nạp sẵn" |

Q2–Q5 lấy theo khuyến nghị của bản kế hoạch đầu (người dùng chỉ đổi Q1, không có ý kiến khác).

**Hệ quả của Q1:**
- Vai trò Nhân sự (`nhansu`) chỉ thấy loại phòng ban trong ô chọn của màn Sơ đồ tổ chức, không sửa được danh mục.
- Muốn Nhân sự tự sửa thì cấp `admin.catalog` cho vai trò này ở màn Phân quyền. Quyền đó sửa được cả các danh mục khác: chuyền may (ảnh hưởng phân quyền theo chuyền), ca, đơn vị tính, nhà máy SX.
- Khi tách quyền riêng cho Nhân sự (phương án A của bản đầu: menu Danh mục nhân sự, tài nguyên `hr.catalog`) thì chỉ đổi quyền ở controller và chuyển khung sang màn mới. API, luật, bảng giữ nguyên.

## Hiện trạng (đối chiếu code ngày 12/10/2026)
- **Bảng `MES_Hr.DepartmentType` đã đủ cột:** `Code` (bất biến, trigger `TR_DepartmentType_CodeImmutable`), `Name`, `Description`, `LevelOrder` (0–99), `IsFinalLevel`, `SortOrder`, `IsActive`, `IsSystem`, cột người tạo, người sửa. **Không cần migration.**
- **5 loại nạp sẵn** (`IsSystem = 1`): `CONG_TY` (cấp 1), `KHOI` (2), `NHA_MAY` (2), `PHONG` (3), `BO_PHAN` (4, cấp cuối). Máy dùng thật (`SEED_SAMPLE_DATA=false`) cũng có. Seed chạy lại chỉ thêm mã còn thiếu, không ghi đè tên đã sửa, không bật lại loại đã ngừng (`scripts/hr-data.ts`).
- **Luật đã có sẵn, giữ nguyên:**
  - máy chủ từ chối loại đã ngừng khi thêm phòng ban hoặc đổi loại (`DepartmentService.typeFor`);
  - ô chọn của form ẩn loại đã ngừng, trừ loại phòng ban đang gán (`DepartmentPanel.tsx`);
  - loại cấp cuối không thêm được phòng ban con (`parentFor`);
  - đổi một phòng ban sang loại cấp cuối bị chặn khi phòng ban đó có con, kể cả con đã giải thể (`anyChildren`).
- **Khôi phục phòng ban không kiểm lại cấp cuối** (`restore` chỉ kiểm cha đang dùng), nên Q2 tính cả dòng đã giải thể.

## Thiết kế

### Luật ở máy chủ
- **Mã:** đúng mẫu `^[A-Z0-9_-]{1,20}$` (khớp CHECK của bảng), ứng dụng tự viết hoa. Trùng mã, kể cả loại đã ngừng, trả 409. `PUT` gửi mã khác trả 422 `CODE_IMMUTABLE` (như Sơ đồ tổ chức); trigger chặn thêm một lớp.
- **Tên:** bắt buộc, tối đa 100 ký tự. Trùng tên với loại khác (không phân biệt hoa thường) trả 409, để ô chọn không có hai dòng giống nhau.
- **Khác:** mô tả tối đa 300 ký tự; cấp 0–99; thứ tự 0–1.000.000, thêm mới để trống thì lấy lớn nhất + 10.
- **Khóa:** thêm, sửa loại giữ khóa ứng dụng `MES_Hr.Department` chế độ Exclusive (`lockTree`), cùng khóa với thêm, chuyển phòng ban. Nhờ vậy không lọt phòng ban con mới vào loại vừa thành cấp cuối, không lọt phòng ban mới vào loại vừa ngừng, và kiểm trùng tên không bị hai người cùng lách.
- **Nhật ký:** `SysAuditLog` với `EntityType = 'DepartmentType'`, `CREATE`, `UPDATE` kèm giá trị trước và sau.

### API (bổ sung `api-contract.md` mục 4c)

| Endpoint | Quyền | Nội dung |
|---|---|---|
| `GET /hr/department-types` | `admin.catalog:view` | Mọi loại, kể cả đã ngừng: `id, code, name, description, levelOrder, isFinalLevel, sortOrder, isActive, isSystem, departmentCount` (số phòng ban đang dùng loại) |
| `POST /hr/department-types` | `admin.catalog:create` | `code, name, description?, levelOrder, isFinalLevel, sortOrder?` |
| `PUT /hr/department-types/:id` | `admin.catalog:update` | Chỉ phần đổi: `name, description, levelOrder, isFinalLevel, sortOrder, isActive` |

- `GET /hr/departments/options` giữ nguyên, màn Sơ đồ tổ chức không đổi API.
- Backend nằm trong module `hr` (bảng ở `MES_Hr`):
  - `HrCatalogRepository` thêm thêm, sửa, đếm phòng ban theo loại, tìm phòng ban có con theo loại;
  - service mới `DepartmentTypeService`, controller `DepartmentTypeController`, DTO trong `hr.dto.ts`.
- **Không qua `BaseRepository`:** theo tiền lệ danh mục (`PrepStepRepository`, `SysCatalogItem`), vì bảng danh mục không có cột nhà máy. Quyền cưỡng chế ở controller bằng `@RequirePermission`.

### Quyền, menu
Không đổi seed, không thêm tài nguyên: dùng quyền `admin.catalog` sẵn có (Quản trị `VCU`).

### Giao diện
- Mục **Loại phòng ban** trong nhóm "Danh mục MES" ở cột trái màn Danh mục hệ thống (và ô chọn danh mục trên điện thoại), đếm số loại đang dùng. Khung nằm trong `features/admin/CatalogsPage.tsx`, dùng chung `PaneHead`, `StatusCell`, `EditButton`, `confirmStop` như khung Nhà máy SX. Dựng theo skill `frontend-design` và `docs/thiet-ke/quy-tac-ui-ux.md`.
- **Bảng:** Mã · Tên (nhãn "Nạp sẵn") · Cấp · Cấp cuối · Thứ tự · Số phòng ban · Mô tả · Trạng thái (công tắc) · nút Sửa. Xếp theo cấp rồi thứ tự, đúng thứ tự trên cây. Loại đã ngừng hiện mờ. Ô tìm lọc tại chỗ (danh mục nhỏ).
- **Hộp Thêm, Sửa:** Mã (khóa khi sửa), Tên, Cấp (chú thích "Số nhỏ đứng trước khi các phòng ban cùng cha"), Cấp cuối (chú thích "Phòng ban loại này không có phòng ban con"), Thứ tự, Mô tả.
- **Công tắc ngừng dùng** có hộp xác nhận nêu số phòng ban đang dùng loại đó.
- **Cảnh báo** trên bảng khi không còn loại nào đang dùng mà không phải cấp cuối (khi đó không thêm được phòng ban gốc hay phòng ban có con).
- **Quy tắc UI/UX:** đóng hộp đang nhập dở thì hỏi lại; không có quyền sửa thì ẩn nút Thêm, Sửa, công tắc thành nhãn; đủ trạng thái tải, lỗi, rỗng; trên điện thoại bảng cuộn ngang trong khung.
- **Sau khi lưu:** làm mới danh mục và các truy vấn `['hr', 'departments']` (ô chọn loại, cây phòng ban hiện tên loại, xếp theo cấp).

## Test

**Backend:** thêm bài "Loại phòng ban" vào `backend/test/hr.spec.ts`. Chạy trên bộ database `MES_*_Test`. Loại test mã tiền tố `TST_`, xóa khi xong như dữ liệu test khác của `hr.spec.ts`.
1. Quyền: `admin` thêm, sửa được; `nhansu`, `giamdoc`, `kehoach.a` không có `admin.catalog` nên trả 403.
2. Mã: chữ thường tự viết hoa; khoảng trắng, ký tự lạ trả 422; trùng mã (kể cả loại đã ngừng) trả 409; `PUT` gửi mã khác trả 422.
3. Trùng tên với loại khác trả 409.
4. Loại mới dùng được ngay: `GET /hr/departments/options` trả loại mới; tạo phòng ban với loại mới trả 201.
5. Cấp cuối: loại có phòng ban có con (kể cả con đã giải thể) bật cấp cuối trả 422; loại không có con bật được, sau đó thêm con vào phòng ban loại đó trả 422.
6. Ngừng dùng: tạo phòng ban với loại đã ngừng trả 422; phòng ban cũ vẫn sửa tên được; `departmentCount` đúng.
7. Nhật ký có dòng `DepartmentType` cho thêm và sửa.

**Frontend:** `frontend/src/test/catalog-department-types.test.tsx`.
- Bảng hiện đủ cột, nhãn "Nạp sẵn", loại đã ngừng hiện mờ.
- Không có quyền sửa thì không có nút Thêm, Sửa.
- Hộp sửa khóa ô mã, chỉ gửi phần đổi.
- Ngừng dùng hỏi xác nhận kèm số phòng ban.

## Task

| # | Task | Ngày | Tiêu chí xong | Trạng thái |
|---|---|---|---|---|
| 5.8.9a | Chốt Q1–Q5. Cập nhật `db-hr.md`, `api-contract.md` mục 4c, ADR 0012 (ngoại lệ mục 6) | 0,25 | Người dùng duyệt | Q1 chốt B, Q2–Q5 theo khuyến nghị |
| 5.8.9b | Backend: repository, service, controller, DTO, nhật ký + test | 0,75 | 7 ý test mục Test qua; `hr.spec.ts` cũ vẫn qua | – |
| 5.8.9c | Frontend: mục Loại phòng ban ở Danh mục hệ thống, bảng, hộp thêm/sửa + test | 0,75 | Đủ hành vi mục Giao diện; test Danh mục hệ thống cũ vẫn qua; kiểm trên trình duyệt | – |
| 5.8.9d | `code-reviewer`, sửa phát hiện | 0,25 | Không còn CRITICAL/HIGH; `npm run lint`, `npm test`, `npm run build` qua; ghi lượt review mới vào `docs/review/phase-5-8.md` | – |
| | **Tổng** | **~2** | | |

## Triển khai lên máy chủ
- Không có migration, không đổi seed. Chỉ deploy code mới.
- Deploy là hành động khó đảo ngược: hỏi người dùng trước khi làm (CLAUDE.md mục 7).

## Không làm
- **Màn sửa Chức danh (`JobTitle`):** làm sau theo cùng mẫu (ước thêm khoảng 1,5 ngày vì có ràng buộc phòng ban và nhánh con).
- Quyền riêng cho vai trò Nhân sự sửa danh mục (phương án A), cho tới khi người dùng yêu cầu.
- Xóa vật lý loại phòng ban; sửa mã loại.
- Ràng buộc cấp cha–con theo `LevelOrder` (Q4).
- Màu, biểu tượng riêng theo loại trên cây phòng ban.
- Nhập loại phòng ban từ Excel, xuất file; đổi loại hàng loạt cho nhiều phòng ban.

## Rủi ro
- **Đổi Cấp đổi ngay thứ tự** các phòng ban cùng cha trên cây, kể cả với người khác đang xem. Chấp nhận; form có chú thích.
- **Danh mục không qua `BaseRepository`** (theo tiền lệ): người review cần biết lý do, đã ghi ở mục API.
- **Chung khóa với thao tác cây:** lưu loại có thể chờ tối đa 10 giây khi người khác đang sửa sơ đồ tổ chức; quá thời gian thì báo "thử lại".
