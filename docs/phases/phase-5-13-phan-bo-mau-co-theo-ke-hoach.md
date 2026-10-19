# Phase 5.13 – Phân bổ màu cỡ theo kế hoạch xuất hàng

Trạng thái: **Ready for review** (14/10/2026; người dùng yêu cầu và chốt Q1–Q4 cùng ngày, chọn đúng các phương án đề xuất; review `docs/review/phase-5-13.md`). Làm thẳng trên `main` trong thư mục `MES` (chưa commit). Quyết định liên quan ([Quyết định](../update_docs/13-quyet-dinh.md)): 3.10 (bảng con, ràng buộc tổng, khóa dòng), 7.1, 7.3; quyết định mới 7.10.

## Mục tiêu

Người dùng yêu cầu 14/10/2026 đổi luồng màn **Phân bổ màu cỡ** ([Đơn hàng](../update_docs/06-don-hang.md) mục 4.6):

1. Ở Xếp chuyền, người lập kế hoạch quyết định mỗi chuyền may tổng bao nhiêu sản phẩm. Bấm Lưu dàn chuyền thì kế hoạch hiện **một dòng** ở Phân bổ màu cỡ.
2. Bấm đúp đúng dòng đó mở bảng chi tiết. Ở đây người dùng nhập chính xác mỗi chuyền may màu nào, cỡ nào, bao nhiêu.
3. Một màu cỡ có thể tách cho nhiều chuyền với số lượng khác nhau, nhưng tổng giao của màu cỡ đó không vượt SL kế hoạch của nó.
4. Đầu vào giống bảng màu cỡ của Kế hoạch xuất hàng, chỉ cần Màu, Cỡ, Số lượng.
5. Kế hoạch xếp nhiều chuyền vẫn là một dòng; cột Chuyền may nối các chuyền đã xếp.
6. Cột của bảng chi tiết: Màu SP, Cỡ SP, Số lượng KH lấy từ kế hoạch xuất hàng; Chuyền cho chọn; Số lượng giao nhập, không vượt SL kế hoạch.

Điều kiểm được:

- Lưu dàn chuyền không còn tự đề xuất phân màu cỡ. Kế hoạch có ít nhất một dòng dàn chuyền thì có đúng một dòng ở Phân bổ màu cỡ (kế hoạch có 3 chuyền vẫn 1 dòng, cột Chuyền may "Chuyền 1, Chuyền 2, Chuyền 3").
- Popup hiện mọi màu cỡ của kế hoạch với SL KH = SL KHXH của kế hoạch. Chọn chuyền trong các chuyền đã xếp, nhập SL giao; tách một màu cỡ thành nhiều dòng cho nhiều chuyền.
- Máy chủ từ chối (422): tổng giao của một màu cỡ vượt SL KH của nó; tổng giao của một chuyền vượt SL đã xếp cho chuyền đó (Q2); chuyền không thuộc kế hoạch; màu cỡ không có trong kế hoạch; một chuyền một màu cỡ hai dòng.
- Trưởng chuyền chỉ thấy, sửa phần của chuyền mình; tổng kiểm vẫn tính phần chuyền khác (có test).

## Thiết kế

### Dữ liệu (không cần migration)

Dùng lại `ShipmentPlanLineColorSize`: mỗi dòng là một phần giao (dòng dàn chuyền, màu, cỡ, SL giao).

- Chỉ lưu dòng có SL giao > 0. Dòng 0 của cách cũ (đề xuất theo tỷ lệ) bị bỏ qua khi đọc và bị xóa khi lưu lại phân màu cỡ của chuyền đó.
- `PlanQty` đổi nghĩa thành bản chụp SL KHXH của màu cỡ ở kế hoạch lúc lưu (không dùng để kiểm).
- UNIQUE (`ShipmentPlanLineId`, `ColorName`, `SizeName`) giữ nguyên: một chuyền một màu cỡ một dòng.
- Trạng thái dòng dàn chuyền giữ: Đã phân màu cỡ khi chuyền có SL giao > 0.

### Danh sách (`GET /order/color-size`, `values`, `export`)

Một dòng mỗi kế hoạch có ít nhất một dòng dàn chuyền trong phạm vi xem của người dùng. `id` là Id kế hoạch.

| Cột | Cách tính |
|---|---|
| Khách hàng, Mã hàng, PO/Buy date, ĐVCS, Ngày xuất hàng | Của kế hoạch |
| Chuyền may (`lineCode`) | Các chuyền trong phạm vi xem, nối theo thứ tự dàn chuyền; tên ở `lineName` |
| Ngày bắt đầu chuyền, Ngày kết thúc chuyền | Sớm nhất, muộn nhất của các chuyền đó |
| NSBQ chuyền (`avgOutput`) | Liệt kê từng chuyền, cùng thứ tự cột Chuyền may (Q3); không lọc, không sắp xếp |
| Số lượng kế hoạch (`qty`) | SL kế hoạch xuất hàng |
| Số lượng giao (`assignedQty`) | Tổng giao mọi chuyền của kế hoạch (chỉ trả tổng) |
| Trạng thái (`statusCode`) | `PLANNED` Chưa phân màu cỡ (giao 0), `PARTIAL` Phân một phần, `FULL` Đã phân đủ (giao ≥ SL kế hoạch) (Q4) |
| Ngày tạo | Lúc dòng dàn chuyền đầu tiên được lưu |

Truy vấn gom `ShipmentPlanLine` đã lọc phạm vi bằng `BaseRepository.scoped` (như `SalesOrderPoRepository.styles`), rồi lọc, sắp xếp, phân trang trên kết quả gom. Lọc theo chuyền (dải lọc, lọc theo cột): kế hoạch có ít nhất một chuyền đã chọn trong phạm vi xem. Xuất file quá 10.000 dòng thì 422.

### Popup (`GET`, `PUT /order/color-size/:planId`)

- `GET` trả kế hoạch (cùng cột danh sách), `lines` (chuyền trong phạm vi xem: Id dòng dàn chuyền, chuyền, SL đã xếp, NSBQ, ngày, trạng thái, SL đã giao, `editable`), `colorSizes` (màu, cỡ, SL KH; `hiddenQty`: SL đã giao cho chuyền ngoài phạm vi xem, chỉ tổng), `rows` (phần giao của chuyền trong phạm vi xem).
- `PUT { rows: [{ lineId, colorName, sizeName, assignedQty }] }`: thay toàn bộ phân màu cỡ của các chuyền người dùng sửa được. Chuyền xem được mà không sửa được, chuyền không xem được giữ nguyên và vẫn tính vào tổng.
- Khóa kế hoạch rồi mới đọc dòng dàn chuyền, phân màu cỡ (cùng thứ tự với Xếp chuyền, sửa kế hoạch xuất hàng). Nhật ký `ShipmentPlan` `COLOR_SIZE_ALLOCATE`.

### Màn khác

- **Xếp chuyền:** dòng mới không còn đề xuất màu cỡ; đổi số lượng không chia lại. Giảm SL của chuyền xuống dưới số đã giao: 409 (chỉ xét dòng đang giảm). Xóa chuyền đã phân màu cỡ: phân màu cỡ của chuyền đó bị xóa, giao diện hỏi trước khi lưu (không đọc được cột Trạng thái thì hỏi cho mọi dòng đã lưu bị bỏ). Đổi chuyền của dòng: phần giao đi theo dòng.
- **Kế hoạch xuất hàng:** sửa SL KHXH của một màu cỡ xuống dưới tổng đã giao, hoặc bỏ màu cỡ đã giao: 409 (chỉ xét màu cỡ đang giảm, nên kế hoạch cũ đang giao lệch vẫn sửa được màu cỡ khác).

## Chốt với người dùng

| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Một dòng gom theo kế hoạch xuất hàng hay theo mã hàng? | **Theo kế hoạch xuất hàng** (mã hàng + PO/Buy date, như một dòng ở Xếp chuyền) |
| Q2 | Tổng SL giao của một chuyền có bị giới hạn bởi SL đã xếp cho chuyền đó? | **Không được vượt**: popup hiện từng chuyền đã giao / SL xếp chuyền, vượt thì không lưu; Xếp chuyền không giảm SL chuyền dưới số đã giao |
| Q3 | NSBQ chuyền của dòng gom hiện thế nào? | **Liệt kê từng chuyền** ("450, 600"), cùng thứ tự cột Chuyền may |
| Q4 | Trạng thái của dòng gom? | **So với SL kế hoạch**: Chưa phân màu cỡ, Phân một phần, Đã phân đủ |

Điểm tự chọn theo hướng hợp lý (người dùng có thể đổi):

- Ô Chuyền của popup chỉ có các chuyền đã xếp cho kế hoạch ở Xếp chuyền. Một chuyền có hai dòng dàn chuyền trong cùng kế hoạch thì là hai lựa chọn, kèm ngày vào chuyền.
- Popup mở ra mỗi màu cỡ một dòng (đã giao thì mỗi chuyền một dòng). Người dùng chỉ sửa được một chuyền thì dòng chưa giao chọn sẵn chuyền đó.
- Nút "Chia theo SL chuyền": chia phần chưa giao của mỗi màu cỡ cho các chuyền sửa được theo phần SL chuyền còn trống (thay cho nút "Điền theo SL kế hoạch" cũ).
- Trưởng chuyền thấy tổng giao cả kế hoạch ở danh sách và tổng đã giao cho chuyền khác ở popup (chỉ số tổng, như "Trong đó bạn không sửa được" ở Xếp chuyền).

## Task

| # | Việc | Trạng thái |
|---|---|---|
| 5.13.1 | Backend: repository gom theo kế hoạch, service, DTO, controller; Xếp chuyền bỏ đề xuất, chặn giảm SL dưới số đã giao; Kế hoạch xuất hàng chặn giảm SL KHXH dưới số đã giao; test | Xong |
| 5.13.2 | Frontend: danh sách gom, popup chọn chuyền, tách dòng, kiểm tổng; Xếp chuyền hỏi khi xóa chuyền đã phân; test | Xong |
| 5.13.3 | Script mô phỏng, dữ liệu mẫu: không chèn dòng 0; nhận biết phân màu cỡ người dùng thêm | Xong |
| 5.13.4 | Tài liệu (`06`, `13`, `02`, `12` nếu đổi), review `code-reviewer` | Xong (hai lượt review: 0 CRITICAL, 0 HIGH; còn L7 chấp nhận, L11 hoãn) |

## Phạm vi review

`backend/src/modules/order/color-size.service.ts`, `order.repositories.ts`, `order.dto.ts`, `order.controller.ts`, `line-plan.service.ts`, `shipment.service.ts`, `order.util.ts`; `backend/scripts/simulate-board.ts`, `seed-order.ts`; test backend sửa, thêm; `frontend/src/features/order/ColorSizePage.tsx`, `colorSizeRules.ts`, `linePlanRules.ts`, `LinePlanPage.tsx`, `api.ts`, `common.tsx`; test frontend thêm.

## Không làm

- Migration, đổi bảng.
- Phân màu cỡ ngay trong popup Chi tiết dàn chuyền.
- Kế hoạch chuẩn bị SX (module May) theo màu cỡ.
- Tự sửa phân màu cỡ khi dàn chuyền, kế hoạch đổi (máy chủ chặn, người dùng sửa).

## Rủi ro

- Dữ liệu cũ (mô phỏng, dữ liệu mẫu) chia theo tỷ lệ có thể lệch vài sản phẩm so với luật mới do làm tròn: popup tô đỏ, phải sửa mới lưu được.
- Nhiều test backend dựa trên API cũ (mỗi dòng một chuyền) phải viết lại.

## Phát sinh

- `react-datasheet-grid` 4.11 xuất `DataSheetGrid` là bản "tĩnh" (`StaticDataSheetGrid`): `columns`, `createRow`, `duplicateRow`, `rowKey`, `rowClassName`… chỉ đọc ở lần vẽ đầu. Popup phân màu cỡ ban đầu dựng lại cột theo lỗi nên ô đỏ, cột Còn lại không đổi (thấy khi gõ thật trên Chrome); đã sửa bằng cách dựng cột một lần, đọc tổng và lỗi qua `ref`. `SheetGrid` dùng chung chưa sửa (ngoài phạm vi, hỏi người dùng): ghi ở [Trạng thái](../update_docs/02-trang-thai.md) mục lỗi tiềm ẩn.
- Một lần chạy toàn bộ test frontend lúc máy đang chạy test backend có một bài của `column-filter.test.tsx` hỏng ("Áp dụng" chưa khóa), chạy lại riêng ba lần đều qua: bài chập chờn khi máy bận, không liên quan phase này.
- Đổi so với thiết kế sau review (`docs/review/phase-5-13.md`): mã Đã phân đủ của kế hoạch là `FULL` (không dùng `ALLOCATED` vì trùng mã trạng thái dòng dàn chuyền trong cùng kết quả); luật 409 của Xếp chuyền, Kế hoạch xuất hàng chỉ xét dòng, màu cỡ đang giảm; lọc Chuyền kiểu bỏ tích (`notIn`) cho cùng kết quả với kiểu tích (`in`); dòng khóa có màu cỡ không còn trong kế hoạch không chặn lưu; Số lượng giao bị Ẩn, Che thì popup không tính còn, đủ, vượt; chuyền có phần giao đổi được ghi `ModifiedAt`; chuyền ở `A00` không có `editable`.
- Sau lượt review 2: lưu phân màu cỡ kiểm cột Số lượng giao Sửa được ngay trong service (kể cả `rows: []`); thanh của chuyền chỉ vẽ khi biết cả số đã giao và SL đã xếp; tiêu đề, toast của Chi tiết dàn chuyền không còn "undefined", "***" khi Mã hàng bị Ẩn, Che; bộ lọc dòng cần hỏi lại khi lưu dàn chuyền tách ra `linePlanRules.ts`. Thấy lỗi cùng kiểu N1 ở Cập nhật tỷ lệ cắt (ngoài phase): ghi [Trạng thái](../update_docs/02-trang-thai.md) mục lỗi tiềm ẩn, hỏi người dùng.
- 14/10, người dùng yêu cầu sau khi duyệt màn: một màu cỡ tách cho nhiều chuyền thì gộp ô Màu, Cỡ, Số lượng KH (thêm cả Còn lại, cũng là số theo màu cỡ) như ô merge của Excel, chỉ hiển thị, database giữ nguyên. Làm bằng lớp CSS theo khối dòng liền nhau (`mergeRuns`) ở lưới nhập, `rowSpan` ở lưới xem.
- 14/10, người dùng yêu cầu tiếp: Màu SP, Cỡ SP, SL KH cố định, không sửa; Thêm dòng tự chép màu, cỡ (không chọn tay lại); ô gộp căn giữa ngang và dọc. Màu, Cỡ thành ô chỉ đọc; `SheetGrid` thêm `addAtActive` (Thêm chèn dưới dòng đang chọn), `deleteReason`; dòng mới chép màu cỡ của dòng ngay trên (`settleNew`); mỗi màu cỡ giữ ít nhất một dòng (`lastOfCell`, `lostCells`); `DataGrid` thêm `rowSpan` (bỏ `className` vừa thêm). Review lượt 4 có 1 HIGH (dòng neo trỏ dòng đã xóa), đã sửa.
- 14/10, người dùng yêu cầu bỏ khung theo dõi tổng giao của từng chuyền ở đầu popup (kế hoạch có thể nhiều chuyền): xóa hẳn component `LineMeters` và CSS `.alloc-line*`; kiểm chuyền giao vượt SL đã xếp giữ nguyên (khung cảnh báo).
