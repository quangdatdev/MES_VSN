# Review Phase 5.1 – Nâng phân quyền

Phase 5.1 chạm lõi phân quyền và migration, nên review ngay sau mỗi phần rủi ro cao (CLAUDE.md mục 2), không chờ cuối phase. Lượt review cuối phase (task 5.1.8) sẽ ghi tiếp vào file này.

## Migration task 5.1.1 – 09/10/2026
Phạm vi: `backend/migrations/MES_Core/0002_scope_field_override.sql`, `backend/migrations/MES_Demo/0002_demo_po_price_line.sql`, `backend/migrations/softkeys.json`; đối chiếu với ADR 0005, db-core.md. Agent chỉ đọc, không chạy migration.

| Lượt | Kết luận agent | Phát hiện |
|---|---|---|
| 1 | BLOCK | 0 CRITICAL, 1 HIGH, 4 MEDIUM, 11 LOW |
| 2 (sau khi sửa) | APPROVE WITH SUGGESTIONS | 0 CRITICAL, 0 HIGH, 1 MEDIUM, 5 LOW (đã sửa tiếp, xem dưới) |

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| 1 | HIGH | `ON DELETE CASCADE` ở `SysUserRoleScope` cộng quy tắc "không có dòng = không giới hạn": gán lại vai trò (xóa hết rồi thêm) làm mất phạm vi chuyền một cách âm thầm, tức là **nới quyền**, không có audit | Bỏ CASCADE. Service xóa phạm vi kèm audit trước khi xóa phép gán; gán vai trò đổi sang so sánh khác biệt (task 5.1.5). Đóng an toàn: đơn vị hoặc chiều đã tắt, tổ hợp lạ coi là tập rỗng (ADR 0005) | Đóng |
| 2 | MEDIUM | `SysOrgUnit` nhận cây mâu thuẫn (chuyền khác nhà máy cha, mã có `/` `_`, nút nhà máy sai mã) | CHECK mã (chữ hoa ASCII, số, gạch ngang; collation nhị phân), CHECK nút nhà máy và chuyền, FK ghép `(ParentId, BranchCode)`, `Path` duy nhất và khớp mã, không tự làm cha | Đóng |
| 3 | MEDIUM | Chưa thêm được chiều không thuộc cây tổ chức bằng dữ liệu, trái ADR | Thêm `ScopeValue` và CHECK; ma trận tổ hợp hợp lệ ghi trong ADR | Đóng |
| 4 | MEDIUM | Chính sách cột theo người không có hạn dùng và lý do, nên không cấu hình được "anh X xem đơn giá đến 31/12" | Thêm `ValidFromAt`, `ValidToAt`, `Reason`. Lý do bắt buộc với dòng `USER`; chỉ dòng `USER` có hạn dùng (lượt 2) | Đóng |
| 5 | MEDIUM | Khóa ngầm chưa có script kiểm bản ghi mồ côi (thiếu từ Phase 1) | Task 5.1.7, kể cả điều kiện "chuyền cùng nhà máy" | Hoãn có lý do (là code, không phải migration) |
| 6 | LOW | `Amount` có thể tràn số | `DECIMAL(29,2)` | Đóng |
| 7 | LOW | Ba chiều hệ thống chỉ có khi chạy seed | INSERT trong migration (`IsSystem = 1`) | Đóng |
| 8 | LOW | Các mục khác: `FieldCodes` ngắn, `ColumnName` không kiểm, `Override.Reason` cho NULL, tên `ScopeType` dễ nhầm, index thừa, trigger so sánh theo collation, `ScopeValue` rỗng, CHECK `LEN(NULL)` cho qua | Sửa hết trong migration | Đóng |
| 9 | LOW | `reset-demo.ts` và phần dọn dữ liệu của test xóa `SysUserRole` trực tiếp sẽ lỗi FK khi đã có phạm vi | Ghi vào tiêu chí task 5.1.5 | Hoãn có lý do (code) |
| 10 | LOW | Tài liệu lệch (db-core.md, chú thích migration, `softkeys.json` chưa khai báo điều kiện kèm) | Đã sửa tài liệu; mở rộng `softkeys.json` ở task 5.1.7 | Đóng / hoãn |

Ghi chú vận hành (đã ghi đầu file migration):
- Dừng backend trước khi chạy.
- Kiểm `SysBranch` có đúng một dòng `IsAggregate = 1`; `SysFieldPolicy` và `SysUserPermissionOverride` đang rỗng.
- Sau migration, lệnh sửa `SysBranch` chạy ngoài ứng dụng cần `QUOTED_IDENTIFIER ON`.

## Cuối phase 5.1 và module Đơn hàng (5.3) – 09/10/2026
Phạm vi: toàn bộ `backend/src/platform/{permission,data,auth,admin,me,org,export}`, `backend/src/modules/order/*`, migration `MES_Order/0001`, `0002`, `softkeys.json`, seed, test `phase5.spec.ts`; lượt 2 thêm frontend (`DataGrid`, `features/order/*`, `features/admin/*`, store, `lib/api.ts`). Agent chỉ đọc; phiên chính kiểm chứng rồi sửa.

| Lượt | Kết luận agent | Phát hiện |
|---|---|---|
| 1 | BLOCK | 0 CRITICAL, 1 HIGH, 11 MEDIUM, 18 LOW |
| 2 | APPROVE WITH SUGGESTIONS | 0 CRITICAL, 0 HIGH, 9 MEDIUM, 25 LOW (kiểm chứng lượt 1 và review mới frontend) |
| 3 | APPROVE WITH SUGGESTIONS | 0 CRITICAL, 0 HIGH, 2 MEDIUM, 8 LOW (kiểm chứng bản sửa lượt 2) |
| 4 | APPROVE WITH SUGGESTIONS | 0 CRITICAL, 0 HIGH, 1 MEDIUM, 4 LOW (hẹp: khóa dòng, bản sửa lượt 3) |
| 5 | APPROVE WITH SUGGESTIONS | 0 CRITICAL, 0 HIGH, 1 MEDIUM, 2 LOW (hẹp: bản sửa lượt 4) |
| 6 | APPROVE WITH SUGGESTIONS | 0 CRITICAL, 0 HIGH, 1 MEDIUM, 3 LOW (hẹp: `inTransaction`, `ensureVisible`) |

### Lượt 1
| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| 1 | HIGH | Chặn (Deny) `:view` không chặn xuất file và đọc dòng qua PUT | Quy tắc mới: không có `:view` thì mọi hành động khác của tài nguyên cũng mất (`PermissionService.compute`, ADR 0005 bổ sung). Test Deny view → export, PUT trả 403 | Đóng |
| 2 | MEDIUM | Sắp xếp được theo cột Ẩn (lộ thứ tự giá) | `FieldPolicyService.safeSort`: cột Ẩn/Che quay về sắp xếp mặc định; giao diện bỏ nút sắp xếp ở cột Che. Có test | Đóng |
| 3 | MEDIUM | Giá rò qua nhật ký | Audit nghiệp vụ bỏ cột nhạy cảm theo `SysResourceField.IsSensitive` (`redact`) | Đóng |
| 4 | MEDIUM | Đọc chéo tài nguyên lọc cột theo nhầm tài nguyên | Popup chọn mã hàng lọc theo `order.allocation`, PO theo `order.po` | Đóng |
| 5 | MEDIUM | Phạm vi chuyền không áp khi đọc dòng dàn chuyền qua Xếp chuyền | Chọn hướng chặt: `ChildRepository.scopeColumns` (LINE→`LineCode`) ở `LinePlanLineRepository`, áp cả bảng dàn chuyền (ADR 0006). Có test | Đóng |
| 6 | MEDIUM | Vai trò không liên quan làm mở cột | Chỉ tính vai trò có `<resource>:view` (ADR 0005 bổ sung). Có test | Đóng |
| 7 | MEDIUM | Lập kế hoạch vượt số lượng (OWN, đồng thời) | SL đã lập tính theo nhà máy (`branchOnly`), kiểm trong transaction sau khi khóa dòng `SalesOrder` (`lock`). Test hai request đồng thời | Đóng |
| 8 | MEDIUM | Lưu dàn chuyền đồng thời | Khóa dòng `ShipmentPlan` đầu transaction | Đóng |
| 9 | MEDIUM | `addWorkingDays` lặp từng ngày, chặn event loop | Kiểm `qty ≤ PlanQty`, giới hạn 366 ngày trước khi tính; tính theo tuần O(1) | Đóng |
| 10 | MEDIUM | Phân màu cỡ nhận nguyên số liệu client | Chỉ nhận `assignedQty` cho màu cỡ đã có, mỗi ô ≤ SL KH; màu cỡ lạ 422 | Đóng |
| 11 | MEDIUM | `softkeys.json` lỗi thời | Viết lại cho `MES_Order`, thêm `scripts/check-softkeys.ts` (chỉ đọc, kết quả không có bản ghi mồ côi) | Đóng |
| 12 | MEDIUM | Thiếu ADR 0006, tài liệu lệch | ADR 0006, cập nhật ADR 0005, `db-order.md`, `seed-demo.md`, `api-contract.md`, phases | Đóng |
| 13–16 | LOW | Lỗi 500 từ đầu vào (màu cỡ trùng, cỡ không ASCII, xóa đồng thời), ghi rỗng ở A00 | 422 cho trùng, regex ASCII, đổi lỗi FK thành 409, `assertWritable` đầu `update` | Đóng |
| 17 | LOW | `mergeRow` chọn khóa không phân biệt hoa thường sai thứ tự | Ưu tiên khóa của dữ liệu mới | Đóng |
| 18 | LOW | Seed không dọn liên kết chiều cũ | Seed đồng bộ liên kết chiều của tài nguyên hệ thống | Đóng |
| 19 | LOW | Che doanh số với Kế hoạch vô tác dụng | Đổi thành Chỉ đọc, ghi lý do trong seed | Đóng |
| 20 | LOW | 500 khi `fieldCode` trùng | 422 | Đóng |
| 21 | LOW | `ORG_SUBTREE` sai loại đơn vị vẫn lưu | Kiểm loại đơn vị theo chiều, 422 | Đóng |
| 22 | LOW | `as any` không ghi lý do | Giữ; dọn khi khai báo `Insertable` cho repository | Hoãn |
| 23 | LOW | Thiếu index `CreatedBy`; `PoBuyDate` là chuỗi | Migration `MES_Order/0002`. `PoBuyDate` giữ tên theo mô tả của BA ("PO/Buy date" là chuỗi), ghi trong `db-order.md` | Đóng |
| 24 | LOW | Xuất file cắt ở 10.000 dòng không báo | Chấp nhận cho giai đoạn dữ liệu giả | Hoãn |
| 25 | LOW | Ghi `SysSensitiveReadLog` không chờ | `await`, lỗi thì không trả dữ liệu | Đóng |
| 26 | LOW | Quyền hết hạn theo giờ không đổi `X-Permission-Version` | Header mang `version.mốcHếtHạn`, frontend so `stamp` | Đóng |
| 27 | LOW | `assertLine` cache 30 giây | Chấp nhận (chưa có màn sửa cây tổ chức) | Hoãn |
| 28 | LOW | Sửa, xóa dòng dàn chuyền đang may; giảm SL làm `AssignedQty` vượt | Chặn theo trạng thái (409), giới hạn lại `AssignedQty` | Đóng |
| 29 | LOW | Audit dàn chuyền sai `entityType` | `ShipmentPlan` | Đóng |
| 30 | LOW | Thiếu test | Thêm test OWN, Deny view (xuất file, PUT), sắp xếp cột Ẩn, `FIELD_READONLY` lồng, Allow ở A00, `ORG_SUBTREE`, ngoại lệ hẹn giờ, phạm vi chuyền ở dòng dàn chuyền, sửa dòng ngoài phạm vi. Chưa có test riêng cho cột riêng hết hạn theo giờ (dùng chung cơ chế mốc hết hạn với ngoại lệ đã có test) | Đóng |

### Lượt 2
Kiểm chứng bản sửa lượt 1: #1, #3, #6, #7, #9, #10, #13, #15, #17, #18, #20, #21, #23, #25, #26, #28 đúng. Các mục sửa chưa đủ được tách thành phát hiện mới bên dưới (#2 → N5, #4 → N4, #5 → N1 và N9, #8 → N2, #11 → N11, #16 → N6, #19 → N3, #29 → N13).

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| N1 | MEDIUM | Lỗi phát sinh từ #5: người chỉ sửa được một chuyền thì kiểm "tổng ≤ SL kế hoạch" chỉ cộng dòng của mình; xóa hết dòng của mình làm kế hoạch về "Chưa xếp chuyền" | `LinePlanLineRepository.totalExcept` (chỉ lọc nhà máy, chỉ trả số tổng) cộng dòng ngoài phạm vi vào tổng và trạng thái. Giao diện hiện "Trong đó ở chuyền khác". Có test | Đóng |
| N2 | MEDIUM | `ShipmentService.update` không khóa kế hoạch: đua với lưu dàn chuyền (deadlock hoặc SL kế hoạch < SL đã xếp) | Khóa theo một thứ tự ở mọi đường: đơn hàng → kế hoạch; khóa kế hoạch trước khi đọc SL đã xếp và ghi màu cỡ | Đóng |
| N3 | MEDIUM | Cột Che/Ẩn vẫn dò được qua bộ lọc, ô tìm nhanh, gợi ý khách hàng và qua màn khác có cùng dữ liệu (Tỷ lệ cắt) | `FieldPolicyService.unreadable` + `readableQuery`: bỏ tham số lọc và cột tìm kiếm theo cột Ẩn/Che ở mọi danh sách, xuất file, bảng dàn chuyền, popup chọn mã hàng; `options` trả rỗng. Seed thêm Che khách hàng ở `order.po` cho Trưởng chuyền. Giao diện ẩn ô lọc tương ứng. Ghi vào ADR 0006: chính sách cột tính theo màn hình, phải khai báo ở mọi màn có cùng dữ liệu. Có test | Đóng |
| N4 | LOW | `originalQty` (SL PO theo màu cỡ) ở lưới lập kế hoạch không qua chính sách cột của `order.po` | Chấp nhận: là dữ liệu bắt buộc để lập kế hoạch, chỉ người có quyền lập kế hoạch xuất hàng mới gọi được | Chấp nhận |
| N5 | LOW | Phân bổ màu cỡ không qua `safeSort` | Thêm `sort()` qua `safeSort` | Đóng |
| N6 | LOW | Lưu phân màu cỡ ở A00 không bị từ chối khi giá trị không đổi | `assertWritable` đầu `save` | Đóng |
| N7 | LOW | `lock()` là một câu UPDATE (thành lần ghi khi có trigger, Change Tracking) | `SELECT … WITH (UPDLOCK, ROWLOCK)` trong phạm vi của hành động; khóa U không chặn người đọc | Đóng |
| N8 | LOW | Bảng con kiểm cha với quyền `update` cả khi tạo mới | Hoãn: chưa vai trò nào có `create` mà thiếu `update`; làm khi ma trận cần | Hoãn |
| N9 | LOW | Tổng đã xếp và số chuyền ở danh sách tính mọi chuyền, chi tiết chỉ hiện chuyền trong phạm vi | Giữ số của cả kế hoạch (người lập kế hoạch cần); popup dàn chuyền giải thích phần ở chuyền khác | Đóng |
| N10 | LOW | Mốc hết hạn của cột riêng theo người chưa đổi `X-Permission-Version` | Hoãn: máy chủ đã cưỡng chế đúng giờ, giao diện đúng sau khi tải lại trang | Hoãn |
| N11 | LOW | `softkeys.json` thiếu `CreatedBy` của 4 bảng con và `ModifiedBy`; `ConfirmedBy` chưa có index | Hoãn: gộp vào migration kế tiếp của `MES_Order` (cần thêm index) | Hoãn |
| N12 | LOW | `lineName` lộ mã chuyền khi cột chuyền bị Che/Ẩn | Không trả `lineName` khi `lineCode` không xem được | Đóng |
| N13 | LOW | Audit phân màu cỡ sai cặp `entityType`/`entityId` | `ShipmentPlanLine` + Id dòng dàn chuyền; bộ lọc Nhật ký cập nhật | Đóng |
| N14 | LOW | `draft()` đọc bằng kết nối khác trong lúc transaction đang mở | Lượt 2 định hoãn; lượt 3 chỉ ra transaction đang chờ khóa cũng giữ kết nối nên dễ cạn pool hơn đánh giá. Đã sửa ở lượt 3: `draft()` và `BaseRepository.list` nhận transaction | Đóng |
| N15 | LOW | Mã cột `startDate`/`endDate` của kế hoạch trùng khóa của dòng dàn chuyền lồng bên trong | Hoãn: đổi mã cột cần đổi seed và dữ liệu chính sách đã lưu; giao diện đã chặn sửa khi cột này không sửa được | Hoãn |
| N16 | LOW | Gán U/D/E/C mà không có V thì vô tác dụng, không cảnh báo | Hoãn: thêm cảnh báo ở ma trận quyền và form ngoại lệ | Hoãn |
| N17 | LOW | `idsForGrant` công khai, nhận phép gán tùy ý | Hoãn: chưa có chỗ dùng sai; xem xét lint ranh giới | Hoãn |
| N18 | LOW | Dòng đang may vẫn đổi được số lượng | Chờ BA xác nhận | Hoãn |
| F1 | MEDIUM | Tổng hiện "NaN" hoặc ghép chuỗi khi cột số bị Che/Ẩn | `fmtNum`/`fmtMoney` nhận mọi kiểu, `sumOf` trả null khi có ô Che/thiếu; ẩn dòng tổng tương ứng. Có test | Đóng |
| F2 | MEDIUM | Sập trang Xếp chuyền khi khách hàng hoặc ngày bị Ẩn/Che | Bảng dàn chuyền bỏ qua thanh không có ngày, nhãn không lỗi khi thiếu tên; popup không tính ngày từ "***"; `PageErrorBoundary` bao nội dung trang. Có test | Đóng |
| F3 | MEDIUM | Gõ tay ngày bị hiểu thành tháng/ngày | `DateField` dùng `parseDmy` (dd/mm/yyyy, từ chối ngày không có thật). Có test | Đóng |
| F4 | MEDIUM | Form sửa kế hoạch điền từ bộ nhớ đệm cũ, lưu đè thay đổi của người khác | Luôn tải lại khi mở, chỉ điền form một lần từ dữ liệu vừa tải; nút Lưu chờ điền xong | Đóng |
| F5 | MEDIUM | Form chỉ phản chiếu chính sách ở ô giá | Mọi ô theo chính sách (Ẩn, Che, Chỉ đọc), không gửi trường không sửa được, không kiểm ô bị khóa; thiếu quyền nhập trường bắt buộc thì báo và khóa nút | Đóng |
| F6 | MEDIUM | Bộ sửa phạm vi xóa âm thầm phạm vi nó không hiển thị được (nới quyền) | Giữ nguyên các dòng phạm vi đó khi lưu và hiển thị cho quản trị viên biết | Đóng |
| F7 | LOW | Cột bị Che vẫn có nút sắp xếp | Bỏ nút (làm trong lượt 1) | Đóng |
| F8 | LOW | Lỗi chỉ đọc/ngoài phạm vi chỉ có câu chung | Máy chủ nêu tên cột; giao diện thêm cách xử lý (nhờ quản trị viên) | Đóng |
| F9 | LOW | Nhãn trợ năng của ô nhập trong lưới | Sửa ở bảng nhập dàn chuyền (tên cột + chuyền); các lưới nhập còn lại làm sau | Hoãn một phần |
| F10 | LOW | Xem thử quyền gắn cứng `A01`, không hiện lỗi; gỡ cột riêng không xác nhận | Mặc định nhà máy đầu tiên trong danh mục, hiện lỗi, thêm hộp xác nhận | Đóng |
| F11 | LOW | Biểu tượng khóa ở Chính sách cột chỉ xét vai trò ở nhà máy hiện tại | Hoãn: máy chủ chặn đúng (403) | Hoãn |
| F12 | LOW | `ModalsProvider` bọc ngoài `QueryClientProvider` | Đổi thứ tự | Đóng |
| F13 | LOW | Tải file không xử lý đổi nhà máy, phiên bản quyền, hết phiên | `download` dùng chung `sendAuthed` với `api` | Đóng |
| F14 | LOW | Popup chọn mã hàng không xuống một cột trên điện thoại | `Grid` theo cỡ màn hình | Đóng |
| F15 | LOW | Câu "theo phạm vi được giao" suy đoán sai khi đang lọc | Chỉ hiện khi không lọc và đã thấy toàn bộ dữ liệu | Đóng |
| F16 | LOW | Thiếu test giao diện | `order.test.tsx`: định dạng ô Che/thiếu, tổng, ngày dd/mm, bảng dàn chuyền thiếu trường. Chưa có test cho bộ sửa phạm vi và so phiên bản quyền khi tải file | Đóng một phần |

Kết quả sau sửa: 74 test backend, 18 test frontend; lint, kiểm kiểu qua. Lượt 3 review lại phần sửa (đụng `platform/data`, `permission`).

### Lượt 3
Kiểm chứng bản sửa lượt 2: N1, N2, N5, N6, N7, N12, N13, F1–F8, F10, F12–F16 đúng; N3 đúng phần đã làm nhưng chưa đủ (P1). Test mới chứng minh đúng điều chúng nói và dọn dữ liệu.

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| P1 | MEDIUM | Lọc theo trạng thái, ngày xuất, chuyền vẫn dò được giá trị khi các cột đó bị Ẩn/Che | `readableQuery` bỏ cả `status`, `line`, `shipFrom`/`shipTo`; giao diện ẩn các ô lọc này. Có test (trạng thái bị Che) | Đóng |
| P2 | MEDIUM | Phạm vi xem rộng hơn phạm vi sửa (nhiều vai trò) thì không lưu được dàn chuyền; phần "chuyền khác" lệch giữa giao diện và máy chủ | Chi tiết trả `editable` cho từng dòng; dòng không sửa được hiện chỉ đọc, không gửi lên; tổng tính theo phạm vi sửa như máy chủ. Test dùng người có hai vai trò | Đóng |
| P3 | LOW | `lock()` đọc bảng hai lần (truy vấn con không UPDLOCK), có thể deadlock khi nâng khóa | Khóa bằng một tham chiếu bảng (`lockBranchRow`), rồi kiểm phạm vi bằng `getById` trong cùng transaction | Đóng |
| P4 | LOW | Xếp chuyền và Phân màu cỡ khóa ngược thứ tự (deadlock) | `ChildRepository.lockByParent`: lưu dàn chuyền khóa kế hoạch → các dòng dàn chuyền → mới chạm màu cỡ | Đóng |
| P5 | LOW | Xóa kế hoạch không khóa, deadlock ra 500 | Khóa kế hoạch và kiểm đã xếp chuyền trong transaction | Đóng |
| P6 | LOW | Sửa số lượng kế hoạch đòi quyền xem đơn hàng; giao diện luôn gửi số lượng | Khóa đơn hàng chỉ theo nhà máy (`lockBranchRow`, không trả dữ liệu); giao diện chỉ gửi số lượng khi có đổi | Đóng |
| P7 | LOW | Thông báo vượt số lượng nêu SL kế hoạch khi cột đó bị Che | Xếp chuyền: không nêu số khi `planQty`/`scheduledQty` bị Ẩn/Che. Kế hoạch xuất hàng: chấp nhận như N4 (SL còn lại là dữ liệu bắt buộc để lập kế hoạch) | Đóng |
| P8 | LOW | Form sửa kế hoạch kẹt khi tải lỗi, có thể điền từ dữ liệu cũ | Chỉ điền khi lần tải vừa rồi thành công; hiện lỗi tải | Đóng |
| P9 | LOW | Tab Xem thử quyền trống khi không có quyền xem Nhà máy, không báo gì | Hiện thông báo lỗi | Đóng |
| P10 | LOW | Chính sách Che mới ở `order.po` chỉ có hiệu lực sau khi seed lại | Ghi chú: chạy `npm run reset:demo -- --yes` (hoặc `npm run seed -- --sync-matrix`) trước khi demo và trước khi chạy test | Đóng |

Kết quả sau sửa: 74 test backend (test N1, N3 mở rộng cho P1, P2), 18 test frontend; lint, kiểm kiểu qua. Lượt 4 review hẹp phần khóa (`platform/data`).

### Lượt 4
Kiểm chứng: không còn kiểu giữ khóa S trong lúc chờ khóa U; thứ tự khóa của 5 đường ghi (lập, sửa, xóa kế hoạch; lưu dàn chuyền; phân màu cỡ) không tạo vòng; N14, P1, P2, P5–P8 đúng.

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| M1 | MEDIUM | Lưu dàn chuyền xóa âm thầm dòng nằm trong phạm vi sửa nhưng ngoài phạm vi xem (ngoại lệ Cho phép lấy hợp mọi phép gán; vai trò chỉ có quyền sửa). Lỗi có từ trước P2 | Dòng "của mình" = sửa được ∩ xem được; dòng còn lại tính vào tổng, không bị xóa. Có test (ngoại lệ Cho phép, dòng chuyền 5 vẫn còn) | Đóng |
| L1 | LOW | Xóa kế hoạch ở A00 lấy khóa trước khi bị từ chối, trả 409 thay vì 403 | `lockBranchRow`, `lockByParent` gọi `assertWritable` đầu hàm (khóa chỉ dùng cho đường ghi) | Đóng |
| L2 | LOW | `lockBranchRow`, `lockByParent` công khai, không xét L3 | Ghi rõ trong JSDoc: Id phải lấy từ dữ liệu máy chủ đã kiểm phạm vi. Mọi nơi gọi hiện đúng | Đóng |
| L3 | LOW | Deadlock đọc–ghi (READ COMMITTED có khóa) ra lỗi 500 | Bộ lọc lỗi đổi lỗi 1205 thành 409 "Có người khác đang lưu cùng dữ liệu… thử lại" (lượt 5 bổ sung: giữ lỗi gốc trong transaction). Bật `READ_COMMITTED_SNAPSHOT` cho `MES_Order` để sau, cùng migration kế tiếp (N11) | Đóng một phần |
| L4 | LOW | P7 chưa có test; thông báo lỗi tải nhà máy luôn đổ cho thiếu quyền | Test: SL kế hoạch bị Che thì thông báo vượt số lượng không có chữ số. Thông báo phân biệt 403 và lỗi khác | Đóng |

Kết quả sau sửa: 75 test backend, 18 test frontend; lint, kiểm kiểu qua. Lượt 5 review hẹp bản sửa M1, L1–L4.

### Lượt 5
Kiểm chứng: M1 đúng (chỉ dòng sửa được và xem được mới bị xóa hoặc sửa; không còn đường nào khác xóa dòng dàn chuyền); L1, L2 đúng (7 chỗ gọi khóa đều là đường ghi); test M1 và P7 chứng minh đúng (code cũ làm test fail).

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| T1 | MEDIUM | Deadlock trong transaction vẫn ra 500: SQL Server đã tự rollback, lệnh rollback Kysely gửi sau đó lỗi 3903 và che mất lỗi 1205 gốc. Đã đo thực tế: không có bản sửa thì lỗi nhận được là 3903 | `inTransaction` (`platform/data/transaction.ts`) giữ lỗi gốc của giao dịch; dùng ở mọi transaction của module Đơn hàng và `createNumbered`. `isDeadlock` nhận cả mảng `errors` của driver. Test: hai giao dịch khóa chéo, lỗi nhận được là 1205 | Đóng |
| T2 | LOW | Vẫn thêm hoặc chuyển dòng được sang chuyền chỉ sửa được mà không thấy | Dòng ghi xong phải còn trong phạm vi xem, không thì 403 `SCOPE_DENIED` (rollback). Có test | Đóng |
| T3 | LOW | Assert của test P7 còn yếu | Kiểm thêm nội dung thông báo và số lượng dòng chuyền 5 sau khi lưu | Đóng |

Kết quả sau sửa: 76 test backend, 18 test frontend; lint, kiểm kiểu qua. Lượt 6 review hẹp `inTransaction`.

### Lượt 6
Kiểm chứng: `inTransaction` đúng (trả giá trị, giữ `AppException`, không mở transaction lồng, lỗi khóa ngoại khi xóa vẫn được `isReferenceError` bắt); `ensureVisible` không chặn nhầm trường hợp hợp lệ, lỗi 403 làm rollback cả lần lưu.

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| U1 | MEDIUM | `isDeadlock` không nhận trường hợp driver ném thẳng mảng lỗi (một request nhận nhiều lỗi) | Nhận cả mảng. Có test | Đóng |
| U2 | LOW | Lỗi rollback bị bỏ mà không để lại dấu vết | Ghi log cảnh báo khi rollback lỗi sau lỗi của giao dịch | Đóng |
| U3 | LOW | Test chưa chứng minh lần lưu bị từ chối được rollback; nhánh chuyển dòng sang chuyền không thấy chưa có test | Kiểm lại dữ liệu sau lỗi 403; thêm ca chuyển dòng chuyền 3 sang chuyền 5 | Đóng |
| U4 | LOW | Test deadlock chưa kiểm phần đổi sang 409, có thể treo nếu một bên lỗi sớm | Kiểm bộ lọc lỗi trả 409 `CONFLICT`; chờ tối đa 10 giây | Đóng |
| – | Ngoài phạm vi | Transaction ở `platform/admin` vẫn dùng `transaction().execute` (deadlock ở màn Quản trị vẫn ra 500) | Các transaction này không khóa dòng nên khả năng deadlock thấp; chuyển sang `inTransaction` ở lần sửa màn Quản trị kế tiếp | Hoãn |

Bản sửa lượt 6 nhỏ (nhận mảng lỗi, ghi log, test), phiên chính kiểm bằng test; không chạy thêm lượt agent. Kết quả cuối: 76 test backend, 18 test frontend; lint, kiểm kiểu, build qua. Không còn phát hiện CRITICAL/HIGH mở.

## Task 5.1.9 – Vai trò Toàn quyền (ADR 0014, 12/10/2026)
Phạm vi: `scripts/seed.ts`, `scripts/seed-data.ts`, test `seed.spec.ts`, `hr.spec.ts`, `full-access.spec.ts`, ADR 0014, tài liệu seed và kịch bản demo.

**Lượt 1:** APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 4 MEDIUM, 5 LOW).

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| M1 | MEDIUM | Seed gán Toàn quyền cho `admin` đã có mà không xét `admin` có bị cố ý hạ quyền không | Chỉ gán khi `admin` đang hoạt động và giữ ADMIN không phạm vi, còn hiệu lực; không đủ thì cảnh báo, ghi lý do vào nhật ký | Đóng |
| M2 | MEDIUM | Quyền `admin.*` lấy từ ma trận tĩnh, có thể vượt ADMIN đang có trong DB (người giữ ADMIN bị trần quyền chặn) | Lấy phần giao với quyền ADMIN đang có trong DB, cả khi cấp quyền mới | Đóng |
| M3 | MEDIUM | Tạo vai trò, ma trận, gán, nhật ký, tăng phiên bản không nguyên tử | `bootstrapFullAccess`: một transaction cho tất cả, kể cả nhật ký và tăng phiên bản | Đóng |
| M4 | MEDIUM | Test xóa thật vai trò, không khôi phục | Test chạy trong transaction rồi hủy; test gỡ phép gán chụp lại và trả đúng phép gán cũ | Đóng |
| L1 | LOW | Kịch bản demo A5, C4, C7 dùng `admin` để minh họa "chỉ xem" | Thêm tài khoản mẫu `quantri` (chỉ ADMIN), sửa kịch bản | Đóng |
| L2 | LOW | ADR chưa nêu: A00 vẫn ghi được dữ liệu dùng chung không gắn ĐVCS, `--sync-matrix` gán lại, vai trò hệ thống không tắt được | Viết lại ADR 0014 | Đóng |
| L3 | LOW | `VCUDE` cấp cả hành động chưa có màn nào | Người dùng chốt "mọi quyền" | Chấp nhận |
| L4 | LOW | Mật khẩu tài khoản thử cố định | Sinh ngẫu nhiên mỗi lần chạy | Đóng |
| L5 | LOW | Thiếu test hành vi luật an toàn với Toàn quyền | `full-access.spec.ts`: ghi ở A01, A00 bị chặn, không tự sửa quyền, người chỉ có ADMIN gán, gỡ được | Đóng |

**Lượt 2 (kiểm bản sửa):** APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 0 MEDIUM, 6 LOW), đã sửa: `--sync-matrix` áp cùng điều kiện khi gán (không nới quyền admin đã bị giới hạn); `reset:demo` lần đầu không ghi cảnh báo mâu thuẫn (bước 10 gán); vai trò tự tạo trùng mã `FULL_ACCESS` thì cảnh báo, không cấp quyền; test chặn tự sửa quyền gửi đúng dữ liệu đang có, kiểm mã lỗi; bootstrap chỉ xét tài khoản theo `sampleData`, `addRole` báo rõ khi thiếu vai trò; thêm test `--sync-matrix`.

Test trên bộ database riêng `MES_*_TCR` (cài mới: migrate → seed; đã xóa): backend 283 qua, 2 bỏ qua; frontend 158 qua; lint, build qua.

**Lượt 3 (lỗi phát hiện khi rà code viết bộ tài liệu mới):** bản sửa lượt 2 đổi điều kiện ở bước 2 của `runSeed` thành `!isSystemFullAccess`, hàm này trả `true` khi vai trò chưa có, nên trên máy đã có `admin` vai trò bị tạo như vai trò thường và không gán cho `admin`, không có nhật ký `SEED`. Test cũ không bắt được vì chỉ gọi `bootstrapFullAccess` thẳng và bộ test cài mới. Sửa: bước 2 bỏ qua `FULL_ACCESS` khi chưa có hoặc không phải vai trò hệ thống (đọc `IsSystem` cùng câu, bỏ hàm `isSystemFullAccess`); thêm bài `seed.spec` "máy đã cài trước khi có vai trò Toàn quyền" (chạy `runSeed` như `npm run migrate`, kiểm gán `admin`, nhật ký, số quyền, chính sách cột; hỏng với điều kiện cũ). Review `code-reviewer`: APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 1 MEDIUM, 6 LOW). M1: database đã chạy seed bản lỗi phải xử lý tay; máy chủ kiểm chỉ đọc chưa có vai trò nên không bị. Đã sửa L1 (bài mới xóa trong transaction, tự lành), L3 (bỏ `isSystemFullAccess`), L6 một phần (kiểm số quyền, chính sách cột); `seed.spec` chờ 120 giây mỗi bài. Còn mở (LOW, ghi ở `docs/update_docs/02-trang-thai.md`): phép gán Toàn quyền không theo hạn của ADMIN; `reset:demo` đụng vai trò tự tạo trùng mã; bài test sửa phép gán của mọi người giữ vai trò (chỉ chạy trên bộ test).

Test trên bộ `MES_*_TCR` cài mới (đã xóa): backend 284 qua, 2 bỏ qua; lint, kiểm kiểu qua.
