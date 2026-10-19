# ADR 0005 – Phạm vi theo phép gán (L3), quyền theo cột (L4), ngoại lệ theo người (L5)

**Trạng thái:** Accepted · **Ngày:** 09/10/2026 · **Phase:** 5.1 · **Nguồn:** phương án nền tảng mục 4–6, ADR 0002, ADR 0004

## Bối cảnh
Demo có L1 (đăng nhập) và L2 (Role → quyền `module.resource:action`), cộng lọc theo nhà máy đã chọn ở phiên (ADR 0002). Trước khi nạp dữ liệu thật cần ba lớp còn lại: phạm vi theo chuyền, ẩn hoặc che cột, ngoại lệ theo người. Mục tiêu là cấu hình bằng dữ liệu, backend cưỡng chế, và không làm hỏng những gì ADR 0002 đã chốt.

Phần lớn mô hình đã có ở phương án nền tảng. ADR này chốt các chi tiết còn để ngỏ: phạm vi khi phép gán không khai báo gì, phạm vi của Allow theo người, cột khi có nhiều Role, và chỗ cưỡng chế.

## Quyết định

### Dữ liệu (migration `MES_Core/0002`, `MES_Demo/0002`)

| Bảng | Vai trò |
|---|---|
| `SysOrgUnit` | Cây tổ chức Nhà máy → Chuyền (sau này có thể thêm Xưởng giữa). `Code` cấm sửa, chỉ gồm chữ, số, gạch ngang; nút nhà máy là gốc, có `Code` trùng `SysBranch.Code`; nút con luôn cùng nhà máy với cha (ràng buộc trong DB); `Path` dạng `/A01/A01-L03/` để lọc cả nhánh |
| `SysScopeDimension` | Danh mục chiều phạm vi. Ba chiều hệ thống `FACTORY`, `LINE`, `OWNER` do migration tạo. Chiều có `OrgType` lấy giá trị từ cây tổ chức; chiều không có `OrgType` dùng giá trị tự do (ví dụ khách hàng). Thêm chiều mới chỉ là thêm dữ liệu |
| `SysResourceScopeBinding` | Tài nguyên lọc theo chiều nào, qua cột nào. Ví dụ `order.po`: `FACTORY`→`BranchCode`, `LINE`→`LineCode`, `OWNER`→`CreatedBy` |
| `SysUserRoleScope` | Phạm vi của **một phép gán** `SysUserRole`: chiều + `ScopeMode` (`ALL`, `ORG_SUBTREE`, `LIST`, `OWN`) + đơn vị tổ chức (`OrgUnitId`) hoặc giá trị tự do (`ScopeValue`). **Không xóa dây chuyền:** muốn xóa phép gán, service phải xóa phạm vi trước và ghi audit cả phần phạm vi bị xóa |
| `SysResourceField` | Cột của tài nguyên (khóa trùng tên trường JSON của API), cờ nhạy cảm |
| `SysFieldPolicy` (đã có) | Role hoặc User × tài nguyên × cột → `HIDDEN`, `MASKED`, `READONLY`, `EDITABLE`. Thêm FK tới `SysResourceField`, hạn dùng (`ValidFromAt`, `ValidToAt`) và lý do (bắt buộc với chính sách theo người) |
| `SysUserPermissionOverride` (đã có) | Allow/Deny một quyền cho một người, có hạn dùng; lý do chuyển thành bắt buộc |
| `SysSensitiveReadLog` | Nhật ký đọc dữ liệu nhạy cảm (cột nhạy cảm được trả ra không bị che), chỉ ghi thêm |

`DemoPo` thêm `UnitPrice`, `Amount` (cột tính, bằng `Qty × UnitPrice`) và `LineCode` (khóa ngầm tới `SysOrgUnit.Code`).

### L3 – Phạm vi tính theo từng phép gán
- Mỗi phép gán Role mang phạm vi riêng. Quyền và phạm vi của một phép gán không rò sang phép gán khác.
- **Phép gán không khai báo phạm vi ở một chiều thì không bị giới hạn ở chiều đó.** Mọi phép gán hiện có vẫn chạy như trước. Riêng chiều nhà máy vẫn luôn bị giới hạn bởi nhà máy đã chọn ở phiên (ADR 0002).
- Chiều `FACTORY` với `LIST` giới hạn phép gán chỉ có hiệu lực ở các nhà máy đó. Ví dụ "Nam là Trưởng chuyền ở A01, Xem báo cáo ở A02": khi Nam làm việc ở A02, quyền của Trưởng chuyền không có hiệu lực (menu và API đều tính theo nhà máy của phiên). Ở `A00` (tổng hợp, chỉ đọc), mỗi phép gán chỉ cho đọc dữ liệu của nhà máy trong phạm vi của nó.
- Chiều `LINE`: `ORG_SUBTREE` (một nút và mọi chuyền bên dưới), `LIST` (các chuyền cụ thể). `OWN` thuộc chiều `OWNER`: chỉ bản ghi mình tạo.
- Trong một phép gán, các chiều kết hợp bằng AND, nhiều giá trị của cùng một chiều kết hợp bằng OR. Giữa các phép gán cùng cấp một quyền, kết hợp bằng OR.
- Tài nguyên `ScopeType = BRANCH` luôn được coi là gắn chiều `FACTORY` qua cột `BranchCode`, dù có hay không dòng `SysResourceScopeBinding` (tránh quên khai báo thì mất lọc nhà máy).
- **Tổ hợp hợp lệ** (service kiểm khi lưu, `BaseRepository` kiểm khi đọc):
  - chiều có `OrgType` (`FACTORY`, `LINE`): `ALL`, `ORG_SUBTREE` hoặc `LIST` theo `OrgUnitId`;
  - `OWNER`: `ALL` hoặc `OWN`;
  - chiều `OrgType NULL` khác: `ALL` hoặc `LIST` theo `ScopeValue`.
- **Đóng an toàn:** phạm vi trỏ tới đơn vị tổ chức đã tắt, chiều đã tắt, hoặc tổ hợp ngoài danh sách trên được coi là tập rỗng (không thấy gì), không bao giờ coi là "không giới hạn".
- Tài nguyên không gắn với một chiều thì chiều đó không áp cho tài nguyên ấy. Ví dụ báo cáo không có cột chuyền thì phạm vi chuyền không lọc báo cáo đó.
- `BaseRepository` là nơi duy nhất sinh điều kiện, từ `SysResourceScopeBinding` và phạm vi của quyền đang dùng (`view` khi đọc; `create`, `update`, `delete` khi ghi). Ghi một bản ghi nằm ngoài phạm vi trả 404, như với nhà máy khác. Tạo bản ghi có giá trị chiều (ví dụ `LineCode`) ngoài phạm vi trả 403 `SCOPE_DENIED`.

### L5 – Ngoại lệ theo người
- Thứ tự quyết định: Deny của người còn hiệu lực ⇒ từ chối. Allow của người còn hiệu lực ⇒ cho phép. Không thì xét hợp các phép gán. Không khớp ⇒ từ chối.
- **Phạm vi của Allow theo người** = hợp phạm vi của mọi phép gán của người đó đang có hiệu lực ở nhà máy của phiên. Không có phép gán nào thì giới hạn ở nhà máy của phiên. Allow không bao giờ mở rộng ra ngoài nhà máy đã chọn.
- Ngoại lệ bắt buộc có lý do. Trần quyền `admin.*` của ADR 0004 áp cho cả ngoại lệ: không tự đặt ngoại lệ cho chính mình, không Allow quyền quản trị mình không có.

### L4 – Theo cột
- Mức hiệu lực của một cột với một người, theo thứ tự:
  1. Có chính sách theo **người** còn trong hạn dùng thì dùng chính sách đó (thắng mọi Role). Ví dụ: "riêng anh X được xem đơn giá đến 31/12".
  2. Không có thì lấy mức **mở nhất** trong các Role đang có hiệu lực ở nhà máy của phiên (Sửa > Chỉ đọc > Che > Ẩn). Chính sách theo Role không có hạn dùng (DB chặn).
  3. Role không khai báo cột: cột thường là Sửa được, **cột nhạy cảm là Ẩn**.
- Cưỡng chế ở backend, một chỗ dùng chung cho xem, sửa và xuất file:
  - cột Ẩn bị bỏ khỏi JSON;
  - cột Che trả `"***"` (một cách che duy nhất; cần kiểu khác thì thêm cột ở migration sau);
  - client gửi giá trị cho cột không phải Sửa được thì bị từ chối 403 `FIELD_READONLY`.
- Mức Sửa được của cột không thay quyền chức năng: vẫn cần `:update` (L2).
- Mỗi lần trả cột nhạy cảm không bị che, ghi một dòng `SysSensitiveReadLog` (ai, tài nguyên, cột, số bản ghi, xem hay xuất).
- Frontend nhận chính sách qua `GET /me/field-policies` (cache theo `PermissionVersion`) để ẩn cột, hiện `***`, khóa ô. Frontend chỉ phản chiếu.

### Cache và hiệu lực
- Quyền, phạm vi và chính sách cột tính theo cặp (người dùng, nhà máy của phiên), cache theo `PermissionVersion` **và** mốc hết hạn sớm nhất của phép gán, ngoại lệ hoặc chính sách cột theo người (`ValidFromAt`, `ValidToAt`). Qua mốc thì tính lại, không chờ ai đổi quyền (review Phase 1–4, #23).
- Mọi thay đổi phạm vi, chính sách cột, ngoại lệ đều tăng `PermissionVersion` và ghi audit trong cùng transaction (ADR 0004).

## Hệ quả
- `PermissionService` trả về "quyền kèm phạm vi" thay vì một tập mã quyền. `PermissionGuard` vẫn chỉ hỏi "có quyền không"; `BaseRepository` hỏi thêm "phạm vi nào".
- Gán lại vai trò cho người dùng phải giữ phạm vi của các phép gán không đổi. API gán vai trò đổi từ "xóa hết rồi thêm lại" sang so sánh khác biệt; `reset-demo` và seed xóa phạm vi trước khi xóa phép gán, rồi tạo lại phạm vi mẫu.
- `A00` kết hợp với phạm vi theo phép gán: không còn "đọc tất cả" vô điều kiện mà đọc theo hợp các phạm vi. Người không khai báo phạm vi vẫn đọc tất cả như trước.
- Thêm vài truy vấn khi tính quyền lúc cache trống. Kết quả được cache nên mỗi request không tốn thêm truy vấn.

## Cập nhật 09/10/2026 (khi triển khai cùng module Đơn hàng)
- Ví dụ trong ADR này dùng `DemoPo` (`MES_Demo/0002`). Màn PO demo đã được thay bằng module Đơn hàng (ADR 0006), migration `MES_Demo/0002` không chạy và bị bỏ. Cột nhạy cảm của demo nay là `unitPrice`, `amount`, `cmPrice` (Thông tin đơn hàng) và `cmPrice`, `revenue` (Xếp chuyền); chiều chuyền gắn với `order.colorsize` qua `ShipmentPlanLine.LineCode`.
- Năm quy tắc bổ sung sau review (Deny xem chặn hẳn tài nguyên; chính sách cột chỉ tính vai trò có quyền xem; không sắp xếp theo cột Ẩn/Che; nhật ký không chứa cột nhạy cảm; dữ liệu đọc từ tài nguyên khác lọc theo tài nguyên nguồn) và cách bảng con nhận phạm vi được ghi ở ADR 0006, mục "Bổ sung cho ADR 0005".
