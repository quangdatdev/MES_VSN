# Phase 5.17 – Kế hoạch xuất hàng: mỗi đơn một kế hoạch, thêm PO khi sửa

Trạng thái: **Ready for review** (16/10/2026), chưa commit. Người dùng yêu cầu 16/10/2026, chốt Q1–Q6 cùng ngày và cho làm. Quyết định 15.1–15.3 (`docs/update_docs/13-quyet-dinh.md`). Làm thẳng trên `main` trong `MES` (theo cách của 5.13–5.16), test trên bộ database `MES_*_T514`. Tiến độ ghi ở `docs/update_docs/02-trang-thai.md`; mô tả theo code ở `docs/update_docs/06-don-hang.md` mục 4.3 và phần API Kế hoạch xuất hàng.

## Mục tiêu

Yêu cầu của người dùng (giữ nguyên ý):

1. Một đơn hàng (mã hàng) chỉ được nằm trong **một** kế hoạch xuất hàng.
2. Muốn điều chỉnh số lượng thì mở dòng kế hoạch đó để sửa.
3. Popup Sửa hiển thị như lúc thêm mới, nhưng chỉ có thông tin của đúng mã hàng của kế hoạch. Có thêm nút **"Chọn mã hàng"**: lọc theo mã hàng của kế hoạch, chỉ hiện PO của mã hàng đó; người dùng chọn PO, thêm xuống lưới, **Số lượng gốc cộng dồn**.
4. PO đã chọn rồi thì không hiện lại, tránh trùng dữ liệu.

Ví dụ của người dùng: đơn có 2 PO. Lần 1 lập kế hoạch với PO thứ nhất. Lần 2 mở lại chính kế hoạch đó, bấm "Chọn mã hàng", popup chỉ còn PO thứ hai (chưa lên kế hoạch).

## Người dùng đã chốt (16/10/2026)

| # | Nội dung | Chốt |
|---|---|---|
| Q1 | "Một đơn một kế hoạch" tính ở đâu | **Theo ĐVCS**: mỗi ĐVCS tối đa một kế hoạch cho một đơn hàng |
| Q2 | Dữ liệu cũ đã có nhiều kế hoạch cho một đơn | Giữ nguyên, chỉ chặn lập thêm (dữ liệu hiện là dữ liệu test). Không thêm chỉ mục UNIQUE ở database (dữ liệu cũ vi phạm); luật cưỡng chế ở service dưới khóa đơn hàng |
| Q3 | Thêm PO thì SL KHXH | Chỉ **Số lượng gốc** cộng thêm. SL KHXH giữ số đang có, người dùng tự điều chỉnh (màu cỡ mới có SL KHXH trống) |
| Q4 | Bỏ PO khỏi kế hoạch khi sửa | Không làm |
| Q5 | PO "đã chọn" | PO đã nằm trong kế hoạch thì không hiện ở popup thêm PO (xem Q6 cho PO ở kế hoạch của ĐVCS khác) |

## Q6 (người dùng chốt 16/10/2026)

(a) Người dùng: "tại màn hình Phân bổ PO, mình đã quy định PO đó thuộc mã hàng đó, được sản xuất ở nhà máy nào rồi", tức một PO chỉ sản xuất ở một nơi: làm theo đề xuất (a), mỗi PO một kế hoạch trên toàn công ty. Không lọc PO theo bảng Phân bổ PO (bảng đó theo khóa OSM PO, SO, Style, Màu, không nối thẳng với `SalesOrderPo`). (b) Theo đề xuất.

| # | Câu hỏi | Đề xuất |
|---|---|---|
| Q6 | Tính theo ĐVCS (Q1) nên ĐVCS A và B có thể cùng có kế hoạch cho một đơn. (a) PO đã nằm trong kế hoạch của ĐVCS A có hiện cho ĐVCS B chọn không? (b) "SL đã tạo KHXH" hiện trừ SL KHXH của **mọi** kế hoạch khác của đơn theo màu cỡ, kể cả khi các kế hoạch dùng PO khác nhau: A lập PO1 (Đỏ/M 100), B lập PO2 (Đỏ/M 100) thì B có gốc 100, đã tạo 100, còn lại 0, không lập được | (a) Không hiện: mỗi PO chỉ thuộc một kế hoạch trên toàn công ty, đúng ý "không trùng dữ liệu". (b) Khi PO không dùng chung, SL còn lại = Số lượng gốc của PO của kế hoạch trừ SL KHXH của các kế hoạch khác **có dùng chung PO** (chỉ còn ở dữ liệu cũ). Dữ liệu mới thì "SL đã tạo KHXH" bằng 0; giữ cột cho dữ liệu cũ |

## Đối chiếu yêu cầu với code hiện tại

| # | Yêu cầu | Code hiện tại | Hướng làm |
|---|---|---|---|
| D1 | Một đơn một kế hoạch mỗi ĐVCS | Lập bao nhiêu kế hoạch cũng được; `create` đã khóa đơn hàng (`orders.lock`) | Sau khóa, đơn đã có kế hoạch ở ĐVCS phiên: 409 kèm số kế hoạch. Popup Thêm mới bỏ đơn đã có kế hoạch ở ĐVCS phiên |
| D2 | Thêm PO khi sửa | Sửa không đổi được PO (`update` dùng `before.poIds`); nút Chọn mã hàng chỉ có khi thêm mới | `PUT /:id` nhận `addPoIds` (chỉ thêm); API mới liệt kê PO chưa dùng của đơn |
| D3 | Không hiện PO đã chọn | Popup hiện mọi PO của đơn; một PO nằm trong nhiều kế hoạch được (ADR 0013 mục 11) | Lọc PO đã nằm trong kế hoạch (phạm vi theo Q6); máy chủ kiểm lại dưới khóa |
| D4 | Số lượng gốc cộng dồn | `draft` đã tính gốc = tổng màu cỡ của các PO truyền vào | Truyền PO cũ + PO mới; khi sửa, `draft` đọc PO của kế hoạch ở máy chủ, client chỉ gửi `addPoIds` |
| D5 | SL KHXH người dùng tự chỉnh (Q3) | Lưới điền SL KHXH đã lưu; nút "Điền theo SL còn lại" | Giữ số đã lưu; màu cỡ mới trống; lưu vẫn qua `checkLines` (≤ SL còn lại, ít nhất một màu cỡ > 0) |

## Thiết kế

### Backend (`backend/src/modules/order`)

- **`create`:** trong transaction, sau `orders.lock` và `assignedOrder`, kiểm `ShipmentPlan` cùng `SalesOrderId` ở ĐVCS phiên (qua `ShipmentPlanRepository`, hàm mới ví dụ `existingForOrder(scope, salesOrderId, trx)`). Có thì 409 `CONFLICT`: "Đơn hàng này đã có kế hoạch <số>. Mở kế hoạch đó để thêm PO." Kiểm thêm PO gửi lên chưa nằm trong kế hoạch nào (theo Q6).
- **`candidates`:** bỏ đơn đã có kế hoạch ở ĐVCS phiên (điều kiện `NOT EXISTS` trong repository, không SQL thô ở service). `A00` không lập nên không đổi.
- **`candidatePos` (lập mới):** bỏ PO đã nằm trong kế hoạch (theo Q6).
- **API mới `GET /order/shipment-plans/:id/candidate-pos`:** quyền `order.shipment:update` và `order.po:view`, `@FieldResource('order.po')`. Kế hoạch phải sửa được (`getById(..., 'update')`, `A00`: 403). Trả PO của đúng đơn của kế hoạch, chưa nằm trong kế hoạch nào (theo Q6), qua phạm vi và chính sách cột `order.po`, cùng cột với `candidates/:id/pos`. Đơn đổi Nhà máy SX sau khi lập không khóa việc này (như luật Sửa hiện tại).
- **`GET /draft` khi sửa:** nhận `planId` + `addPoIds`; máy chủ tự lấy PO đang có của kế hoạch. Bỏ cách client gửi lại toàn bộ `poIds` khi sửa (URL dài, đụng giới hạn 100).
- **`PUT /:id`:** DTO thêm `addPoIds?: number[]` (1–100, số nguyên). Có `addPoIds` thì bắt buộc có `lines` (gốc đổi). Trong transaction: khóa đơn (`lockBranchRow`) → khóa kế hoạch (thứ tự khóa hiện có) → kiểm từng PO: thuộc đơn của kế hoạch, xem được ở `order.po`, chưa nằm trong kế hoạch nào (theo Q6; 409 nếu vừa có người lấy) → ghi `ShipmentPlanPo` → `draft` trên PO cũ + mới → `checkLines` → ghi màu cỡ như hiện nay. Cần cột `planQty` sửa được (giống sửa SL). Tổng PO của một kế hoạch tối đa 100 (giữ giới hạn hiện có; kiểm ở bước 5.17.0 xem dữ liệu có đơn nào nhiều hơn).
- **Nhật ký:** `UPDATE` ghi `poIds` trước, sau.
- Các luật 409 hiện có (dưới SL đã xếp chuyền, dưới phần đã giao ở Phân bổ màu cỡ) không đổi: thêm PO chỉ tăng gốc, SL KHXH do người dùng chỉnh.

### Frontend (`frontend/src/features/order/ShipmentPage.tsx`, skill `frontend-design`)

- Popup Sửa có nút "Chọn mã hàng" (cùng chỗ với lúc thêm mới). Mở popup gọn: đầu ghi Khách hàng, Mã hàng của kế hoạch (chỉ xem), không có bảng chọn đơn, không có ô PO/Buy date (đã có ở popup Sửa); chỉ bảng PO chưa dùng để tích chọn, ô tổng số lượng các PO đang tích, Xác nhận.
- Xác nhận: lưới màu cỡ tải lại theo PO cũ + mới. Số lượng gốc cộng dồn, màu cỡ mới hiện thêm dòng, SL KHXH giữ số đang nhập (Q3). Dòng "n PO của kế hoạch + m PO thêm"; mở lại "Chọn mã hàng" thì PO đã thêm (chưa lưu) giữ dấu tích. Thêm PO tính là có thay đổi (hỏi trước khi đóng).
- Nút khóa kèm lý do: không có `order.po:view`, cột Số lượng KH không sửa được, đang ở `A00`.
- Popup Thêm mới: ghi chú "Đơn đã có kế hoạch ở đơn vị này không hiện ở đây; mở kế hoạch đó để thêm PO". Lỗi 409 từ máy chủ hiện số kế hoạch.

### Ảnh hưởng màn khác

- Cập nhật tỷ lệ cắt: PO mới vào kế hoạch hiện ở màn này (`inUseHere`), ĐVCS sửa được PO đó.
- Đồng bộ tiến độ cắt: bản chép theo dấu phiên bản của kế hoạch; màu cỡ mới cần chép thêm. Kiểm lại bằng test (`cutting.spec.ts`).
- Xếp chuyền, Phân bổ màu cỡ: SL kế hoạch tăng khi người dùng tăng SL KHXH; không có đường giảm mới.
- `15-cat.md`: câu "một mã hàng có thể ở nhiều kế hoạch" sửa lại (mỗi ĐVCS một kế hoạch; dữ liệu cũ có thể nhiều).

## Task

| Task | Nội dung | Ước lượng | Tiêu chí xong |
|---|---|---|---|
| 5.17.0 | Chốt Q6; truy vấn chỉ đọc trên `T514`: số PO lớn nhất của một đơn, số đơn có nhiều kế hoạch; quyết định mới ở `13-quyet-dinh.md` (thay ADR 0013 mục 11 phần PO dùng chung) | 0,5 ngày | Quyết định ghi xong, biết giới hạn 100 PO có đủ không |
| 5.17.1 | Backend: một kế hoạch mỗi đơn mỗi ĐVCS (`create`, `candidates`, `candidatePos`) | 0,5 ngày | Test: lập lần hai 409; ĐVCS khác lập được; hai người cùng lập thì người sau 409; `A00` 403 |
| 5.17.2 | Backend: thêm PO khi sửa (API mới, `draft`, `PUT addPoIds`, nhật ký) | 1 ngày | Test: PO đơn khác 422; PO đã dùng 409; PO ngoài phạm vi `order.po` bị từ chối; `planQty` Chỉ đọc bị chặn; gốc cộng dồn đúng; 403 thiếu quyền; ĐVCS khác 404 |
| 5.17.3 | Frontend: nút "Chọn mã hàng" ở popup Sửa, popup PO, lưới cộng dồn, ghi chú popup Thêm mới | 1 ngày | Test vitest (`shipment-plan-*.test.tsx`); xem trên Chrome 1366×768, 390px với backend trỏ `T514` |
| 5.17.4 | Tài liệu (`06-don-hang.md`, `15-cat.md`, `02-trang-thai.md`), `code-reviewer` (báo cáo `docs/review/phase-5-17.md`), lint, test, build | 0,5–1 ngày | Không còn CRITICAL/HIGH |

Không có migration (Q2: không thêm chỉ mục UNIQUE). Máy chủ: chỉ deploy code.

## Khác bản thiết kế ở trên khi làm

- `GET /draft` khi sửa dùng tham số có sẵn `excludePlanId` (không thêm `planId`) cùng `addPoIds`; `poIds` gửi lên khi sửa bị bỏ qua (giao diện cũ vẫn chạy).
- Thêm PO theo cùng điều kiện lập mới (review M2): đơn còn Nhà máy SX thuộc ĐVCS, chưa Hoàn thành/Đã hủy. Chờ người dùng xác nhận (Q41 ở `02-trang-thai.md`).
- `PUT /:id` có thêm `basePoIds` (review M1): lưới dựng theo tập PO cũ thì 409.
- Số kế hoạch ở câu 409 "đã có kế hoạch" chỉ nêu khi cột Số kế hoạch xem được.
- Dữ liệu mẫu, `sim:board` chưa theo luật mới (Q40).

## Ngoài phạm vi

- Bỏ PO khỏi kế hoạch (Q4).
- Gộp các kế hoạch cũ của cùng đơn (Q2).
- Chỉ mục UNIQUE `(BranchCode, SalesOrderId)` ở `ShipmentPlan`: làm sau khi dọn dữ liệu test, nếu người dùng muốn.
- Q34 (siết quyền `/draft`, `/candidates`) giữ nguyên trạng thái câu hỏi; API mới của phase này đã đòi `:update`.
