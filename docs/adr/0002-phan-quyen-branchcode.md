# ADR 0002 – Phân quyền theo nhà máy bằng BranchCode (giai đoạn Demo)

**Trạng thái:** Accepted · **Ngày:** 08/10/2026 (cập nhật: đơn vị tổng hợp `A00`, mã `A01…`)

## Quyết định
- Sau đăng nhập, người dùng **chọn một nhà máy** trong danh sách `SysUserBranch` của mình. Server cấp token chứa `BranchCode`.
- `BranchCode` là mã ngắn (`A01`, `A02`…), `VARCHAR(10)`, **cấm sửa sau khi tạo**. Tên hiển thị (`Name`) sửa được ở màn Quản trị.
- **Đơn vị tổng hợp `A00`** (`SysBranch.IsAggregate = 1`): chọn `A00` thì xem dữ liệu của **tất cả** nhà máy. Ở `A00` chỉ đọc; mọi thao tác ghi trên dữ liệu theo nhà máy bị từ chối (`AGGREGATE_READ_ONLY`). Không có dòng dữ liệu nào mang `BranchCode = 'A00'`. Cờ `IsAggregate` do server tra từ `SysBranch`, không tin client.
- Mọi truy vấn dữ liệu nghiệp vụ đi qua `BaseRepository`, tự thêm `BranchCode = <phiên>` (list, getById, create, update, delete); riêng đơn vị tổng hợp thì bỏ điều kiện lọc khi đọc.
- `BranchCode` **không bao giờ** nhận từ client làm điều kiện lọc hay giá trị ghi. Ngoại lệ duy nhất: body của `select-branch` là *yêu cầu chọn*, server kiểm với `SysUserBranch` rồi mới cấp token.
- Bảng theo nhà máy bắt buộc có cột `BranchCode` có index; bảng dùng chung phải đánh dấu "shared" trong Resource Registry, không đánh dấu thì repository từ chối.
- Đổi nhà máy = cấp token mới sau khi kiểm lại quyền.
- Quyền, Role, Menu, danh mục nhà máy là dữ liệu trong `MES_Core`, chỉnh qua màn Admin.

## Hướng mở rộng
`A00` là trường hợp đặc biệt của "nhóm nhà máy". Khi cần xem một nhóm (ví dụ vùng), thêm bảng nhóm nhà máy bằng dữ liệu, không đổi cách lọc. `BranchCode` là trường hợp một chiều của mô hình phạm vi đa chiều (nhà máy, chuyền, của tôi).
