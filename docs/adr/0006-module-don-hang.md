# ADR 0006 – Module Đơn hàng trên khung phân quyền 5 lớp, thay màn PO demo

**Trạng thái:** Accepted · **Ngày:** 09/10/2026 · **Phase:** 5.3 (làm cùng đợt 5.1) · **Nguồn:** `docs/nguon/BẢNG MÔ TẢ GIAO DIỆN MES - ĐƠN HÀNG.docx`, ADR 0002, ADR 0005

## Bối cảnh
Ngày 09/10/2026 người dùng quyết định: **bỏ qua đồng bộ BRAVO/OSM/GSD (5.2) trong đợt này**, đẩy hết luồng phân quyền 5.1 và dựng một module nghiệp vụ thật có dữ liệu giả để tự kiểm thử phân quyền, ẩn/che cột. Module chọn là Đơn hàng vì đã có mô tả giao diện của BA (5 màn). Màn PO demo (`MES_Demo.DemoPo`) được thay hẳn, không chạy song song.

## Quyết định

### Phạm vi và dữ liệu
- Database riêng **`MES_Order`** (CLAUDE.md mục 3: mỗi module một database). Migration `MES_Order/0001_order_init.sql`, `0002_order_owner_index.sql`. `MES_Demo` và module `demo-po` bị gỡ; database `MES_Demo` cũ có thể xóa tay.
- Chưa đồng bộ: dữ liệu do seed sinh (xác định theo hạt giống, chạy lại cho cùng kết quả) và **cho nhập tay** ở Thông tin đơn hàng, Thêm PO. Khi làm 5.2, dữ liệu đồng bộ ghi vào cùng bảng; cột `SyncedAt` là "Ngày đồng bộ".
- 5 màn ứng với 5 tài nguyên đã có trong menu (mã tài nguyên giữ nguyên để không đổi dữ liệu phân quyền):

| Màn (BA) | Tài nguyên | Bảng chính | Bảng con |
|---|---|---|---|
| Thông tin đơn hàng | `order.allocation` | `SalesOrder` | – |
| Kế hoạch xuất hàng | `order.shipment` | `ShipmentPlan` | `ShipmentPlanColorSize`, `ShipmentPlanPo` |
| Cập nhật tỷ lệ cắt | `order.po` | `SalesOrderPo` | `SalesOrderPoColorSize` |
| Xếp chuyền (+ bảng dàn chuyền) | `order.lineplan` | `ShipmentPlan` | `ShipmentPlanLine` → `ShipmentPlanLineColorSize` |
| Phân bổ màu cỡ | `order.colorsize` | `ShipmentPlanLine` | `ShipmentPlanLineColorSize` |

- **Hai tài nguyên dùng chung một bảng** (`ShipmentPlan` cho Kế hoạch xuất hàng và Xếp chuyền) là hợp lệ: Resource Registry kiểm theo tài nguyên → bảng; mỗi tài nguyên có quyền, phạm vi, cột riêng. Xếp chuyền có cột giá CM, doanh số (nhạy cảm) mà Kế hoạch xuất hàng không có.
- **Bản chụp dữ liệu:** PO và kế hoạch chép khách hàng, mã hàng, tên sản phẩm (và kế hoạch chép giá CM) lúc tạo. Màn của tài nguyên này không phải đọc bảng của tài nguyên khác, nên người chỉ có quyền Xếp chuyền vẫn thấy khách hàng, mã hàng. `OriginalQty` của kế hoạch là SL gốc tại lúc lập; sửa tỷ lệ cắt sau đó không đổi kế hoạch đã lập.
- **Số chứng từ theo Id** (`DH-A01-000123`, `KH-…`, `PO-…`) do `BaseRepository.createNumbered` sinh: không đọc dữ liệu của người khác nên người có phạm vi "chỉ của mình" không sinh trùng số.
- Ngoại lệ đặt tên: `ShipmentPlan.PoBuyDate` là chuỗi tham chiếu "PO/Buy date" theo thuật ngữ BA (ví dụ `4500123 / 15-11`), không phải kiểu DATE dù có đuôi `…Date`.

### Bảng con trong khung phân quyền
- `ChildRepository` (platform): dòng con nằm trong phạm vi khi thỏa **một phép gán** của hành động, xét chung điều kiện của dòng cha và của chính dòng con trong phép gán đó. Không có phép gán ⇒ không thấy gì. Khóa tới cha, `BranchCode` do repository đặt; khóa ngoại ghép `(ParentId, BranchCode)` ở DB bảo đảm con cùng nhà máy với cha.
- Bảng con có cột của một chiều phạm vi thì khai báo `scopeColumns` (ví dụ dòng dàn chuyền: `LINE → LineCode`). Nhờ vậy **phạm vi chuyền áp cả khi đọc dòng dàn chuyền qua màn Xếp chuyền** (chi tiết, bảng dàn chuyền), không chỉ ở màn Phân bổ màu cỡ (review 5.1 #5). Danh sách kế hoạch (bảng chính, không có cột chuyền) vẫn không lọc theo chuyền.
- Số liệu kiểm ràng buộc (tổng SL đã lập kế hoạch của một đơn hàng) tính trên **cả nhà máy** qua `BaseRepository.branchOnly`, không theo phạm vi người xem; chỉ trả tổng, không trả dòng của người khác.
- Thao tác cùng lúc trên một đối tượng được xếp hàng bằng `BaseRepository.lock` (khóa dòng đến hết transaction): lập kế hoạch khóa đơn hàng, lưu dàn chuyền khóa kế hoạch, phân màu cỡ khóa dòng dàn chuyền.

### Bổ sung cho ADR 0005 (sau review 5.1)
- **Không có quyền xem thì mất mọi hành động khác của tài nguyên.** Deny `:view` chặn hẳn tài nguyên (không còn xuất file, không còn đọc dòng qua dữ liệu trả về khi sửa).
- **Chính sách cột chỉ tính các vai trò có quyền xem tài nguyên đó.** Vai trò không liên quan (không khai báo cột nên theo mặc định Sửa được) không làm mở cột mà vai trò liên quan đã ẩn hoặc khóa.
- **Không sắp xếp theo cột Ẩn hoặc Che** (sắp xếp cũng làm lộ thứ tự giá trị). Tham số sắp xếp theo cột đó bị bỏ, dùng mặc định.
- **Nhật ký nghiệp vụ không chứa cột nhạy cảm** (màn Nhật ký hệ thống không đi qua chính sách cột).
- **Dữ liệu đọc từ tài nguyên khác lọc theo chính sách cột của tài nguyên nguồn** (popup Chọn mã hàng của Kế hoạch xuất hàng lọc theo Thông tin đơn hàng và Cập nhật tỷ lệ cắt).
- Header `X-Permission-Version` mang dấu "version.mốc hết hạn": phép gán hay ngoại lệ tới giờ bắt đầu, hết hạn thì giao diện cũng tải lại menu và chính sách cột.

### Bổ sung sau review 5.1 lượt 2
- **Không lọc, không tìm, không gợi ý theo cột Ẩn hoặc Che.** Lọc "khách hàng chứa N" rồi xem còn dòng nào là dò ra được giá trị bị che. Máy chủ bỏ tham số lọc và cột tìm kiếm đó (`FieldPolicyService.unreadable`, `readableQuery`), danh sách gợi ý trả rỗng; giao diện ẩn ô lọc tương ứng.
- **Chính sách cột tính theo màn hình (tài nguyên), không theo dữ liệu.** Cùng một dữ liệu (ví dụ tên khách hàng) xuất hiện ở nhiều màn thì quản trị viên phải đặt chính sách ở **mọi** màn đó; che ở Xếp chuyền mà không che ở Cập nhật tỷ lệ cắt thì người có quyền xem màn kia vẫn thấy. Seed mẫu che khách hàng của Trưởng chuyền ở cả ba màn Xếp chuyền, Phân bổ màu cỡ, Cập nhật tỷ lệ cắt.
- **Ràng buộc tổng trên bảng con tính cả dòng ngoài phạm vi.** Người chỉ sửa được chuyền của mình vẫn không xếp vượt SL kế hoạch: tổng gồm cả dòng ở chuyền khác (chỉ lọc nhà máy, chỉ trả số tổng).
- **Không lọc theo trạng thái, ngày, chuyền** khi các cột đó bị Ẩn hoặc Che (cùng lý do).
- **Thứ tự khóa:** đơn hàng → kế hoạch → dòng dàn chuyền → màu cỡ, ở mọi đường ghi. `lock()` dùng `UPDLOCK` với một tham chiếu bảng (không ghi, người chỉ đọc không bị chặn), rồi kiểm phạm vi trong cùng transaction. Khóa chỉ để xếp hàng ràng buộc trên cả nhà máy dùng `lockBranchRow` (không xét phạm vi, không trả dữ liệu).
- **Phạm vi xem có thể rộng hơn phạm vi sửa** (nhiều vai trò): chi tiết dàn chuyền đánh dấu dòng sửa được; dòng còn lại chỉ đọc và được tính vào tổng như dòng ngoài phạm vi.
- **Phạm vi sửa cũng có thể rộng hơn phạm vi xem** (ngoại lệ Cho phép lấy hợp mọi phép gán): lưu dàn chuyền chỉ thêm, sửa, xóa dòng vừa sửa được vừa xem được; dòng ghi xong phải còn xem được.
- **Transaction có khóa dòng chạy qua `inTransaction`** (`platform/data/transaction.ts`): giữ lỗi gốc khi SQL Server đã tự rollback. Bị chọn làm nạn nhân deadlock (1205) thì người dùng nhận 409 "thử lại", không phải 500.

## Hệ quả
- Test phân quyền Phase 3 chạy trên Thông tin đơn hàng thay cho PO demo; test Phase 5 phủ L3/L4/L5 và luồng module (`backend/test/phase5.spec.ts`).
- Khi có tài liệu BA chính thức (công thức tỷ lệ cắt, năng suất, lịch nghỉ), các quy tắc tạm hiện tại (ngày kết thúc bỏ Chủ nhật, đề xuất phân màu cỡ theo tỷ lệ, SL KH chia đều) phải đối chiếu lại.
- Khi làm 5.2, nút "Đồng bộ" ở Thông tin đơn hàng sẽ thay cho việc nhập tay; quyền thêm/sửa tay khi đó do BA quyết có giữ hay không.
