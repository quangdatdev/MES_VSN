# Lưới "PO của kế hoạch" trên màn Kế hoạch xuất hàng (task 5.9.14)

- **Trạng thái:** Xong code, test, review (lượt 10 APPROVE WITH SUGGESTIONS, đã sửa; lượt 11 APPROVE, `docs/review/phase-5-9.md`), 12/10/2026. Không có migration. Còn: deploy code mới, người dùng kiểm trên app. Khác kế hoạch ban đầu: thứ tự PO chỉ theo cột xem được (review M1); hàng tối thiểu 260px/250px cho màn thấp
- **Ngày lập kế hoạch:** 12/10/2026. Người dùng chốt "làm theo đề xuất" cho mọi câu ở mục 8.
- **Thuộc phase:** task **5.9.14** của phase 5.9 (đặt số 5.9.13 lúc lập kế hoạch, nhưng phiên song song đã dùng 5.9.13 cho Chọn mã hàng theo ĐVCS, Tỷ lệ cắt theo kế hoạch).

## 1. Yêu cầu

> Trên màn hình kế hoạch xuất hàng, tôi cần add thêm một lưới con. Để user có thể kiểm tra nhanh, trên kế hoạch xuất hàng đó, thì những PO nào đã xác nhận số lượng bao nhiêu, còn lại bao nhiêu chưa xác nhận.

Ảnh người dùng gửi là phần mềm cũ "ĐƠN HÀNG", tab Kế hoạch xuất hàng. Vùng khoanh đỏ là khung chi tiết nằm dưới lưới chính, hiện thông tin của kế hoạch đang chọn. Màn web hiện chỉ có lưới chính, chi tiết chỉ xem được trong popup Sửa.

## 2. Hiểu yêu cầu theo dữ liệu đang có

| Khái niệm | Dữ liệu trong MES |
|---|---|
| PO "đã xác nhận" | PO đã bấm **Xác nhận** ở màn Cập nhật tỷ lệ cắt: `SalesOrderPo.StatusCode = 'CONFIRMED'`, kèm `ConfirmedAt`, `ConfirmedBy`. Xác nhận theo **cả PO**, không theo từng màu cỡ. PO của đơn BRAVO đã đóng lệnh được nạp vào ở trạng thái "Đã xác nhận" (`ConfirmedBy` trống). Nhãn đã có sẵn: `PO_STATUS` ở `frontend/src/features/order/common.tsx` |
| PO của một kế hoạch | `ShipmentPlanPo`: các PO được tích ở popup "Chọn mã hàng" khi lập kế hoạch |
| Số lượng của PO | `SalesOrderPo.Qty` (tổng màu cỡ của PO) |
| Số lượng kế hoạch | `ShipmentPlan.PlanQty`, nhập theo màu cỡ (`ShipmentPlanColorSize`), **không chia theo từng PO** |

Vì vậy, với mỗi PO của kế hoạch đang chọn:

- **SL đã xác nhận** = SL của PO nếu PO đã xác nhận, ngược lại 0.
- **SL chưa xác nhận** = SL của PO nếu PO chưa xác nhận, ngược lại 0.
- Chân lưới cộng tổng: số PO, tổng SL, tổng đã xác nhận, tổng chưa xác nhận.

Không cần migration, không cần dữ liệu mới. Không dùng OSM: view `v_OSMData` không có cột số lượng.

## 3. Phạm vi

**Làm**

1. Khung dưới lưới chính của Kế hoạch xuất hàng: lưới "PO của kế hoạch" cho kế hoạch đang chọn, kèm tóm tắt đã xác nhận / chưa xác nhận.
2. API đọc PO của một kế hoạch, đi qua phân quyền và chính sách cột của Cập nhật tỷ lệ cắt (`order.po`), theo ADR 0006: "dữ liệu đọc từ tài nguyên khác lọc theo chính sách cột của tài nguyên nguồn".
3. Test backend, frontend; cập nhật tài liệu; review bằng `code-reviewer` (có đụng chính sách cột).

**Không làm**

- Xác nhận hoặc hủy xác nhận PO ngay tại lưới con. Việc này vẫn ở Cập nhật tỷ lệ cắt (quyền `order.po:update`, xác nhận khóa sửa màu cỡ).
- Lọc theo cột, sắp xếp, phân trang, xuất file cho lưới con. Mỗi kế hoạch chỉ có vài chục PO; đây là ngoại lệ nhỏ của ADR 0011, giống lưới màu cỡ của Cập nhật tỷ lệ cắt.
- Đổi bảng hay migration.
- Các mục ở phần 8 khi chưa được chốt.

## 4. Thiết kế

### 4.1 Giao diện

```
┌ Kế hoạch xuất hàng ─────────────────────── [Xuất file] [Xóa] [Sửa] [+ Thêm kế hoạch] ┐
│ [Dải lọc như hiện tại]                                                               │
│ ┌ Danh sách kế hoạch xuất hàng (lưới hiện có, 100 dòng/trang) ───────────────────┐   │
│ │ ...                                                                            │   │
│ │ ▌KH-A01-000123  ASICS EUROPE  VSSO12512.0346  ...   (dòng đang chọn)            │   │
│ │ Trang 1/8                                       Tổng SL kế hoạch trang này: ... │   │
│ └────────────────────────────────────────────────────────────────────────────────┘   │
│ PO của kế hoạch KH-A01-000123     (Đã xác nhận 12.400, 3 PO) (Chưa xác nhận 3.100, 2 PO) │
│ ┌────────────────────────────────────────────────────────────────────────────────┐   │
│ │ STT  PO#   Mã PO  Đích đến  Ngày xuất  Số lượng  Trạng thái     Ngày XN  SL đã XN  SL chưa XN │
│ │ 1    4500… PO-…   DE        22/04/2026    5.000  Đã xác nhận   10/10    5.000         0 │
│ │ 2    4500… PO-…   NL        22/04/2026    3.100  Chưa xác nhận           0      3.100 │
│ │ Tổng 5 PO: 15.500. Đã xác nhận 12.400, chưa xác nhận 3.100. Kế hoạch lấy 869.         │
│ └────────────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Bố cục:** thân trang chia hai hàng: lưới kế hoạch ở trên (khoảng 3/5 chiều cao), khung PO ở dưới (khoảng 2/5). Thêm lớp CSS `split-rows` cạnh `split-stack` trong `frontend/src/theme/global.css`. Màn hình ≤ 767px: hai khung xếp dọc, cao theo nội dung như `split-stack` hiện tại.
- **Chọn dòng:** dùng lại `selectedId` đang có (nút Sửa, Xóa cũng dùng). Bấm một dòng thì khung dưới tải PO của kế hoạch đó. Bấm đúp vẫn mở popup Sửa như cũ.
- **Cột lưới con** (khóa trùng mã cột của `order.po` để `useFieldPolicy('order.po')` ẩn, che đúng cột):

| Khóa | Tiêu đề | Ghi chú |
|---|---|---|
| `poNumber` | PO# | |
| `poCode` | Mã PO | |
| `destination` | Đích đến | |
| `shipDate` | Ngày xuất hàng | |
| `qty` | Số lượng | |
| `statusCode` | Trạng thái | Badge theo `PO_STATUS`: "Đã xác nhận" (teal), "Chưa xác nhận" (xám) |
| `confirmedAt` | Ngày xác nhận | Theo mức của `statusCode` |
| `confirmedQty` | SL đã xác nhận | Suy ra từ `qty` và `statusCode`, theo mức chặt hơn của hai cột |
| `unconfirmedQty` | SL chưa xác nhận | Như trên |

- **Tóm tắt** (bên phải tiêu đề khung): hai badge "Đã xác nhận 12.400, 3 PO" và "Chưa xác nhận 3.100, 2 PO". Tổng tính ở client bằng `sumOf`: có ô bị Che hoặc Ẩn thì không hiện số, chỉ hiện số PO.
- **Chân lưới:** tổng như hình. Câu "Kế hoạch lấy 869" lấy `planQty` của dòng đang chọn ở lưới chính (đã qua chính sách cột `order.shipment`), chỉ hiện khi xem được. Câu này nói rõ số trong lưới là của cả PO, không phải phần của kế hoạch.
- **Trạng thái rỗng, lỗi, không quyền:**
  - Chưa chọn dòng: "Bấm một kế hoạch ở lưới trên để xem PO."
  - Kế hoạch không có PO: "Kế hoạch này chưa gắn PO."
  - Không có quyền `order.po:view` (kiểm ở client bằng `useCan`, server cũng chặn): "Bạn không được xem PO (màn Cập nhật tỷ lệ cắt) nên không thấy trạng thái xác nhận." Không gọi API.
  - Có PO bị phạm vi dữ liệu che (ví dụ phạm vi "chỉ của mình" ở `order.po`): dòng chú thích "Còn N PO bạn không được xem."
  - Lỗi tải: dùng `error`, `onRetry` của `DataGrid` như các lưới khác.
- **Làm mới:** query key `['order', 'shipment-pos', planId]` nằm dưới `['order']`, nên lần làm mới sau khi lưu, xóa ở màn này cũng tải lại khung dưới.
- Làm theo `docs/thiet-ke/quy-tac-ui-ux.md` và skill `frontend-design`; chỉ dùng thành phần dùng chung (`DataGrid`, `StatusBadge`, `pane`, `pane-title`).

### 4.2 API

`GET /order/shipment-plans/:id/pos`, quyền `order.shipment:view`.

```json
{
  "items": [
    {
      "id": 101, "poCode": "PO-A01-000101", "poNumber": "4500123", "destination": "DE",
      "shipDate": "2026-04-22", "qty": 5000, "statusCode": "CONFIRMED",
      "confirmedAt": "2026-10-10T03:00:00.000Z", "confirmedQty": 5000, "unconfirmedQty": 0
    }
  ],
  "hiddenCount": 0
}
```

Xử lý ở `ShipmentService.planPos(user, id)`:

1. `plans.getById(scope, id)`: kế hoạch phải xem được theo ĐVCS và phạm vi của `order.shipment`, không thì 404 như `GET /:id`.
2. Không có `order.po:view` trong `UserAccess.grants`: 403 với thông điệp tiếng Việt. Không để `BaseRepository` âm thầm trả rỗng (`WHERE FALSE`), vì người dùng sẽ tưởng kế hoạch không có PO.
3. Đọc liên kết bằng `planPos.listByParent(scope, id)`, rồi đọc PO bằng `pos.listAll(scope, { where: Id in (...) , sort: 'ShipDate:asc' }, 'view')`. Lưu ý `listAll` mặc định là hành động `export`, phải truyền `'view'`. `BaseRepository` áp phạm vi của `order.po`; `hiddenCount` = số liên kết − số PO đọc được.
4. Tính `confirmedQty`, `unconfirmedQty` theo mức cột (`fields.levels`) của `qty` và `statusCode`: một trong hai Ẩn thì bỏ khóa; một trong hai Che thì trả `'***'`. `confirmedAt` theo mức của `statusCode`. Làm như cột Đơn vị cơ sở của Phân bổ PO (`po-allocation.service.ts`, hàm `present`): cột suy ra theo chính sách của cột nguồn.
5. Handler khai báo `@FieldResource('order.po')` để ghi đè `@FieldResource('order.shipment')` của controller (interceptor dùng `getAllAndOverride`, ưu tiên handler). Lý do ở mục 7.1.

Không trả `planQty`: cột đó thuộc `order.shipment`, client đã có từ lưới chính.

### 4.3 File dự kiến sửa

| File | Việc |
|---|---|
| `backend/src/modules/order/order.controller.ts` | Thêm `@Get(':id/pos')` có `@FieldResource('order.po')` vào `ShipmentController` |
| `backend/src/modules/order/shipment.service.ts` | `planPos()` theo mục 4.2; nhận thêm `PermissionService` nếu cần đọc mức cột |
| `frontend/src/features/order/api.ts` | Kiểu `PlanPo`, `PlanPoList` |
| `frontend/src/features/order/ShipmentPage.tsx` | Bố cục hai hàng, component `PlanPoPane` |
| `frontend/src/theme/global.css` | Lớp `split-rows` và bản điện thoại |
| `docs/thiet-ke/api-contract.md` | Dòng endpoint mới ở bảng Đơn hàng |
| `docs/phases/phase-5-9-don-vi-co-so.md`, `docs/phases/README.md` | Task 5.9.14, nhật ký |
| `docs/review/phase-5-9.md` | Lượt review mới |

## 5. Các bước làm

| Bước | Việc | Tiêu chí xong | Ước lượng |
|---|---|---|---|
| 1 | Backend: endpoint và `planPos` | Gọi được trên dữ liệu thử; 403, 404 đúng; khóa suy ra theo chính sách cột | 0,5 ngày |
| 2 | Test backend (mục 6) | Qua trên bộ database test riêng (không chạy trên database máy chủ) | 0,5 ngày |
| 3 | Frontend: khung dưới, CSS, kiểu dữ liệu, test | Lint, tsc, build qua; test frontend qua; xem được trên điện thoại (DevTools) | 0,5–1 ngày |
| 4 | Tài liệu | `api-contract.md`, file phase, `README.md` cập nhật | 0,1 ngày |
| 5 | Review `code-reviewer` | Không còn CRITICAL/HIGH mở; kết quả ghi `docs/review/phase-5-9.md` | 0,25 ngày |
| 6 | Kiểm trên app | Bằng dữ liệu giả hoặc script đọc DOM; không chụp màn hình có dữ liệu thật | 0,1 ngày |

## 6. Test

**Backend, có database** (bài mới `backend/test/shipment-plan-pos.spec.ts`, dùng đơn thử riêng theo kiểu `TEST-P5-FIXTURE` của `phase5.spec.ts`, tạo và xóa trong bài):

- Kế hoạch gắn 3 PO, xác nhận 2 PO: đủ 3 dòng, `confirmedQty`, `unconfirmedQty` đúng, `hiddenCount = 0`.
- Kế hoạch của ĐVCS khác với phiên (không phải `A00`): 404.
- Người có `order.shipment:view` nhưng bị thu hồi `order.po:view`: 403.
- Chính sách cột thật (qua `PUT /admin/roles/:id/field-policies`): `qty` Che thì `qty`, `confirmedQty`, `unconfirmedQty` là `'***'`; `statusCode` Ẩn thì không có `statusCode`, `confirmedAt` và hai cột suy ra. Trả lại chính sách cũ trong `finally`.
- Mức của cột cùng tên ở `order.shipment` (ví dụ `shipDate`, `statusCode` bị Ẩn ở Kế hoạch xuất hàng) không ảnh hưởng cột của PO trong endpoint mới.

**Backend, không database** (unit test service với mock): suy ra cột theo các tổ hợp mức của `qty` và `statusCode`; `hiddenCount`.

**Frontend** (`frontend/src/test/shipment-plan-pos.test.tsx`):

- Chưa chọn dòng thì hiện hướng dẫn; chọn dòng thì gọi `/order/shipment-plans/:id/pos` và hiện badge tổng.
- Không có `order.po:view`: hiện thông báo, không gọi API.
- Có ô `'***'`: không hiện tổng số lượng.
- `hiddenCount > 0`: hiện dòng chú thích.

Chạy đủ `npm run lint`, `npm test`, `npm run build` trước khi báo xong.

## 7. Rủi ro và lưu ý

### 7.1 Trùng tên trường giữa hai tài nguyên

`FieldPolicyInterceptor` duyệt cả JSON lồng nhau và áp mức cột theo **tên khóa**. `ShipmentController` khai báo `@FieldResource('order.shipment')`, trong khi `order.shipment` và `order.po` cùng có `statusCode`, `shipDate`, `syncedAt`. Để mặc định thì trạng thái xác nhận của PO sẽ bị ẩn theo cột "Trạng thái" của kế hoạch. Cách xử lý: khai báo `@FieldResource('order.po')` ở handler mới (mục 4.2 bước 5).

**Phát hiện kèm, đã sửa trong task này (mục 8 câu 7):** `GET /order/shipment-plans/candidates/:id/pos` (popup Chọn mã hàng) đang bị áp chính sách hai lần: service áp `order.po`, rồi interceptor áp `order.shipment`. Kết quả là `statusCode`, `shipDate`, `syncedAt` của PO trong popup đi theo cả mức của cột cùng tên ở Kế hoạch xuất hàng. Lỗi này chỉ làm che nhiều hơn, không lộ dữ liệu (mức LOW). Đã sửa bằng một dòng `@FieldResource('order.po')` cho handler đó, kèm bài test (`shipment-plan-pos.spec.ts`, kiểm ngược: bỏ dòng sửa thì bài test hỏng).

### 7.2 Các lưu ý khác

- **Số của cả PO, không phải phần của kế hoạch.** Một PO có thể được nhiều kế hoạch dùng (xuất nhiều đợt), và SL kế hoạch nhập theo màu cỡ chứ không theo PO. Giao diện phải ghi rõ (chân lưới, mục 4.1). Muốn tính theo phần của kế hoạch thì xem mục 8, câu 1.
- **PO dùng chung, kế hoạch theo ĐVCS** (ADR 0013): PO của đơn thuộc ĐVCS khác vẫn hiện, đúng với cách lập kế hoạch hiện nay.
- **Phạm vi "chỉ của mình" ở `order.po`:** PO nạp từ BRAVO có `CreatedBy` trống, nên người bị giới hạn theo người tạo sẽ không thấy các PO này. Đây là lý do có `hiddenCount`.
- **Xác nhận đổi ở màn khác:** lưới con không tự cập nhật theo thời gian thực (chưa có WebSocket). Dữ liệu tải lại khi chọn lại kế hoạch, khi làm mới, và theo cấu hình react-query hiện có.

## 8. Đã chốt (12/10/2026: theo đề xuất)

| # | Câu hỏi | Đề xuất |
|---|---|---|
| 1 | "SL đã xác nhận / còn lại" tính theo **cả PO** (A), hay theo **SL của kế hoạch** (B: với mỗi màu cỡ của kế hoạch, phần SL KHXH có PO đã xác nhận đứng sau, phần còn lại là chưa xác nhận)? | **A** cho bản đầu: đúng với dữ liệu hiện có, dễ đối chiếu với màn Cập nhật tỷ lệ cắt. B phải quy ước chia SL khi một PO nằm trong nhiều kế hoạch |
| 2 | Lưới con chỉ hiện PO **của kế hoạch**, hay mọi PO **của mã hàng**, kèm cột "Thuộc kế hoạch này"? | PO của kế hoạch, đúng câu yêu cầu |
| 3 | Thêm cột "Xác nhận PO" (ví dụ "3/5") ở lưới chính để lọc nhanh các kế hoạch còn PO chưa xác nhận, không cần bấm từng dòng? | Làm sau, task riêng: phải sửa câu đọc danh sách, lọc và sắp xếp theo cột |
| 4 | Khung dưới có thêm tab "Màu cỡ" như phần mềm cũ không (SL gốc, đã tạo KHXH, còn lại, SL KHXH)? | Chưa cần: popup Sửa đã có. Nếu muốn thì dùng lại `GET /order/shipment-plans/:id`, không cần API mới |
| 5 | Có cột "Người xác nhận" không? | Chưa: phải thêm hàm tra tên hàng loạt ở `UserDirectoryService` (hiện chỉ có `fullName` cho một người) |
| 6 | Có nút mở thẳng màn Cập nhật tỷ lệ cắt của mã hàng để đi xác nhận không? | Có thể thêm sau, chỉ hiện khi có `order.po:update` |
| 7 | Sửa luôn lỗi nhỏ ở mục 7.1 (popup Chọn mã hàng) trong task này? | Có, một dòng kèm test |
