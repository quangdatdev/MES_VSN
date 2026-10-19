# Phase 3 – Phân quyền động, màn Admin, màn PO demo

**Trạng thái:** Approved (09/10/2026) · **Ước lượng:** 1 ngày · **Phụ thuộc:** Phase 1 và Phase 2 đã tích hợp

## Mục tiêu
Chứng minh khi demo: (1) dữ liệu tự lọc theo nhà máy đã chọn, và `A00` xem được tất cả; (2) quản trị viên đổi quyền và tên nhà máy trên màn Admin, có hiệu lực ngay; (3) người xem tự nhập liệu PO và thấy dữ liệu tách theo nhà máy.

## Việc cần làm
| # | Task | Tiêu chí hoàn thành | Trạng thái |
|---|---|---|---|
| 3.1 | `BaseRepository` tự thêm `BranchCode` vào mọi truy vấn (list, getById, create, update, delete); `A00` bỏ lọc khi đọc, từ chối khi ghi | Test: user A01 không đọc/sửa được bản ghi A02 | Done |
| 3.2 | Resource Registry: `ScopeType` `BRANCH`/`SHARED` | Bảng chưa khai báo ⇒ repository từ chối | Done |
| 3.3 | Database `MES_Demo`, bảng `DemoPo`, seed 36 dòng xác định | 12 dòng mỗi nhà máy | Done |
| 3.4 | API `DemoPo`: list, get, create, update, delete theo `docs/thiet-ke/api-contract.md` | Đổi nhà máy ⇒ kết quả đổi; tạo mới gắn `BranchCode` từ token | Done |
| 3.5 | API quản trị: user, role, ma trận quyền, gán Role và nhà máy, nhà máy (đổi tên, không đổi `Code`) | Không tự nâng quyền | Done |
| 3.6 | Vô hiệu cache quyền (`PermissionVersion`) | Đổi quyền ⇒ user thấy thay đổi ở lần tải kế tiếp | Done |
| 3.7 | Màn Admin: Người dùng, Vai trò, Phân quyền (ma trận Role × Menu × hành động, thao tác nhanh theo hàng/cột), Nhà máy (đổi tên tại chỗ, thêm mới) | Thao tác không tải lại trang, có phản hồi toast | Done |
| 3.8 | Màn "PO chi tiết" demo: lưới phân trang, tìm kiếm, thêm/sửa bằng popup (trường bắt buộc tô vàng, trường chỉ đọc màu xám theo mô tả giao diện), xóa có xác nhận; ở `A00` hiện cột Nhà máy và khóa nút ghi | Chạy đủ kịch bản `docs/thiet-ke/seed-demo.md` mục 7 | Done |
| 3.9 | Ghi và xem `SysAuditLog` thay đổi phân quyền (màn đơn giản) | Có bản ghi, xem được | Done |
| 3.10 | Bộ test ma trận theo 18 kịch bản trong `docs/thiet-ke/seed-demo.md` | Chạy trong `npm test` | Done |

## Tiêu chí review
- [x] Không có đường nào đọc dữ liệu nhà máy khác (kể cả gọi theo Id)
- [x] `BranchCode` không bao giờ nhận từ client
- [x] `A00` xem được tất cả nhưng không ghi được
- [x] Đổi tên nhà máy, thêm Role/nhà máy mới chỉ bằng dữ liệu
- [x] Đổi quyền trên Admin: hiệu lực đúng như mô tả
- [x] Người dùng không tự cấp quyền cho chính mình
- [x] Có audit log cho thay đổi phân quyền

## Không làm
Ẩn/che cột, ngoại lệ theo user (bảng đã tạo, chưa có UI), phạm vi theo chuyền, module nghiệp vụ thật.

## Rủi ro
Phase chặt nhất. Thứ tự cắt khi thiếu thời gian: (1) xem audit trên giao diện, (2) thêm nhà máy mới (chỉ đổi tên), (3) thao tác nhanh theo hàng/cột ở ma trận. **Không cắt:** 3.1, 3.2, quyền ở 3.5, 3.8 (đọc + thêm), 3.10.

## Kết quả
- **Database demo:** dùng `MES_DEMO` có sẵn (rỗng) của bạn, nay có bảng `DemoPo` (migration `MES_Demo/0001_demo_po.sql`) và 36 PO giả sinh xác định, 12 dòng mỗi nhà máy (`npm run seed`).
- **BaseRepository** (`backend/src/platform/data/`): tự thêm `BranchCode` cho list/getById/update/delete; `A00` đọc không lọc, ghi bị 403 `AGGREGATE_READ_ONLY`; `BranchCode` khi tạo luôn lấy từ token. **Resource Registry:** repository chỉ chạy khi `SysResource` khai báo đúng phạm vi và bảng nguồn (seed đặt `SourceTable = DemoPo` cho `order.po`).
- **API:** `/demo/po` (CRUD, tìm, sắp xếp, phân trang) và `/admin/*` (người dùng, vai trò, ma trận quyền, gán vai trò/nhà máy, nhà máy, nhật ký). Chặn tự nâng quyền: không sửa vai trò, nhà máy, trạng thái của chính mình, không sửa quyền của vai trò mình đang giữ. Mọi thay đổi ghi `SysAuditLog` và tăng `PermissionVersion`.
- **Giao diện:** màn PO chi tiết (lưới phân trang, tìm, sắp xếp, popup thêm/sửa với trường bắt buộc tô vàng và chỉ đọc tô xám, xóa có xác nhận, ở `A00` khóa nút ghi và hiện cột Nhà máy) và 5 màn Quản trị (Người dùng, Vai trò, Phân quyền dạng ma trận có chọn cả hàng/cột, Nhà máy đổi tên tại chỗ và thêm mới, Nhật ký).
- **Test:** `backend/test/phase3.spec.ts` (kịch bản 1-4, 7, 8, 10, 11, 14-17; các kịch bản 5, 6, 9, 12, 13, 18 nằm ở `auth.spec.ts`) cùng 2 test cho Resource Registry. Backend 33 test qua, frontend 6 test qua, lint và build qua.
- **Phát sinh:** thêm `DELETE /admin/roles/:id` (vô hiệu hóa, không xóa vật lý); test A00 tạo tài khoản `test.planner` (đã vô hiệu hóa, còn trong danh sách người dùng vì không xóa vật lý được).
