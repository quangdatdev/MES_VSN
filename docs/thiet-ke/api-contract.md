# Hợp đồng API (Phase 0, cập nhật Phase 5.1 và 5.3 ngày 09/10/2026, Phase 5.6 ngày 10/10/2026, Phase 5.8 ngày 11/10/2026)

> Để Backend (Phase 1, 3) và Frontend (Phase 2) làm song song. Đây là thiết kế để duyệt; thay đổi sau khi duyệt phải cập nhật file này trước.
> Tiền tố: `/api/v1`. JSON, UTF-8. Thời điểm theo ISO 8601 UTC.

## 1. Quy ước chung

- **Xác thực:** `Authorization: Bearer <accessToken>`. Access token sống ngắn (đề xuất 15 phút), mang `userId`, `BranchCode` và `sid` (phiên). Phiên bị thu hồi thì token còn hạn cũng bị từ chối 401. Refresh token nằm trong cookie `HttpOnly; Secure; SameSite=Strict`, path `/api/v1/auth`. Frontend và API cùng origin qua Nginx.
- **Hai loại token:** `preAuthToken` (sau `login`, sống 5 phút, chỉ gọi được `select-branch`) và `accessToken` (sau khi chọn nhà máy). `preAuthToken` gọi API khác ⇒ 401.
- **`BranchCode` không bao giờ là tham số lọc.** Ngoại lệ duy nhất là body của `select-branch`: đó là *yêu cầu chọn*, server kiểm với `SysUserBranch` rồi mới cấp token.
- **Phân trang:** `?page=1&pageSize=100` (mặc định 100 từ Phase 5.6; tối đa 200, quản trị tối đa 100) ⇒ `{ "items": [], "total": 0, "page": 1, "pageSize": 100 }`. Sắp xếp: `?sort=field:asc`; danh sách nghiệp vụ mặc định `createdAt:desc` (mới tạo lên trước), người dùng ở màn Quản trị cũng theo ngày tạo giảm dần.
- **Lọc theo cột (Phase 5.6, ADR 0011):** danh sách nghiệp vụ nhận thêm `cf` là JSON `{"<trường>": {"in": [...]}}` hoặc `{"<trường>": {"notIn": [...]}}` (`null` là ô trống; chuỗi rỗng coi như trống). Chỉ các trường trong danh sách trắng của màn; trường lạ, dạng sai, quá 500 giá trị ⇒ 422. Cột bị Ẩn/Che: bộ lọc bị bỏ qua. Ngày dạng `YYYY-MM-DD`; `createdAt` lọc theo ngày giờ Việt Nam. Xuất file áp cùng bộ lọc.
- **Giá trị cho popup lọc:** `GET <danh sách>/values?field=<trường>&search=<chữ>&<các bộ lọc đang áp, kể cả cf>` ⇒ `{ "values": [...], "truncated": false }`, tối đa 500 giá trị khác nhau (ô trống `null` ở cuối), trong phạm vi phân quyền và theo các bộ lọc khác (không theo bộ lọc của chính trường đó). `search` tìm chữ (LIKE), ngày theo `dd/mm/yyyy`, số bỏ dấu chấm nghìn. Trường lạ ⇒ 422; trường bị Ẩn/Che ⇒ 403 `FIELD_NOT_READABLE`. Không có cột giá (nhạy cảm).
- **Lỗi:**
```json
{ "error": { "code": "BRANCH_NOT_ALLOWED", "message": "Bạn không được phép chọn nhà máy này.", "details": null }, "traceId": "..." }
```

| HTTP | Khi nào | Ví dụ `code` |
|---|---|---|
| 400/422 | Dữ liệu không hợp lệ | `VALIDATION_FAILED` |
| 401 | Chưa/sai/hết hạn token | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED` |
| 403 | Không đủ quyền | `PERMISSION_DENIED`, `BRANCH_NOT_ALLOWED`, `AGGREGATE_READ_ONLY`, `SELF_ELEVATION_FORBIDDEN`, `SCOPE_DENIED` (tạo/sửa dữ liệu ra ngoài phạm vi được giao), `FIELD_READONLY` (gửi giá trị cho cột không được sửa; `details.fields` liệt kê cột), `FIELD_NOT_READABLE` (hỏi giá trị lọc của cột bị Ẩn/Che) |
| 404 | Không có, **không thuộc nhà máy hiện tại** hoặc **nằm ngoài phạm vi** (không phân biệt) | `NOT_FOUND` |
| 409 | Xung đột (trùng mã, đang được dùng) | `CONFLICT` |
| 423 | Tài khoản bị khóa tạm | `ACCOUNT_LOCKED` |

Thông điệp lỗi trả tiếng Việt; `code` ổn định để FE xử lý.

## 2. Xác thực và phiên

| Method & đường dẫn | Quyền | Mô tả |
|---|---|---|
| `POST /auth/login` | công khai | Body `{ username, password }` ⇒ `{ preAuthToken, user: { id, fullName }, branches: [{ code, name, isAggregate }] }`. Sai mật khẩu đếm vào `FailedLoginCount`, vượt ngưỡng ⇒ 423. Ghi audit `LOGIN` / `LOGIN_FAILED` |
| `POST /auth/select-branch` | `preAuthToken` hoặc access token | Body `{ branchCode }` ⇒ `{ accessToken, expiresIn, branch: { code, name, isAggregate } }` và set cookie refresh. Không thuộc `SysUserBranch` ⇒ 403 `BRANCH_NOT_ALLOWED`. Dùng cả khi **đổi nhà máy**: thu hồi phiên hiện tại, tạo phiên mới (token mới thay token cũ). Token tạm cấp trước khi đổi mật khẩu bị từ chối 401. Chọn đơn vị tổng hợp `A00` cũng phải được gán trong `SysUserBranch`. Audit `SELECT_BRANCH` |
| `POST /auth/refresh` | cookie refresh | Cấp access token mới, giữ nguyên nhà máy. Từ chối nếu phiên đã thu hồi, tài khoản bị vô hiệu, hoặc nhà máy không còn được phép |
| `POST /auth/logout` | công khai (cookie refresh) | Thu hồi phiên theo cookie, xóa cookie. Không cần access token còn hạn (ADR 0004). Audit `LOGOUT` |

## 3. Thông tin người dùng hiện tại

| Method & đường dẫn | Mô tả |
|---|---|
| `GET /me` | `{ user: { id, username, fullName }, branch: { code, name, isAggregate }, roles: [{ code, name }], productionFactories: [{ code, name, branchCode }], permissionVersion: 17 }`. `roles` chỉ gồm vai trò có hiệu lực ở đơn vị cơ sở của phiên. `productionFactories`: nhà máy SX đang dùng thuộc ĐVCS của phiên (đơn vị tổng hợp: mọi nhà máy đã gắn ĐVCS), ADR 0013 mục 11 |
| `GET /me/branches` | Danh sách nhà máy user được phép chọn `[ { code, name, isAggregate } ]` (dùng khi đổi nhà máy) |
| `GET /me/menu` | Cây menu đã lọc theo quyền xem: `[ { code, name, icon, path, isMobile, children: [ … ] } ]`. Nhóm không có con nào hiện thì bị loại |
| `GET /me/permissions` | `{ version: 17, stamp: "17.1798736400000", permissions: ["order.po:view", …] }` – quyền tại nhà máy của phiên (phép gán có thể giới hạn nhà máy; ngoại lệ Allow/Deny đã tính) |
| `GET /me/field-policies` | `{ version, resources: { "order.allocation": { "unitPrice": "READONLY", … } } }` – mức của từng cột đã đăng ký (`HIDDEN`, `MASKED`, `READONLY`, `EDITABLE`) cho tài nguyên người dùng xem được |
| `GET /me/branch-names` | Tên chi nhánh theo mã nhà máy `[ { code, name } ]`, mọi nhà máy (trừ `A00`): `TenChiNhanh` của danh mục chi nhánh BRAVO (`MES_Sync`), chi nhánh BRAVO chưa có hoặc chưa đọc được thì tên ở Quản trị › Nhà máy. Màn hình hiện tên này ở cột, ô Chi nhánh (Chi nhánh FOB) thay cho mã; file xuất của các màn cũng ghi tên. Chỉ là tên hiển thị, dữ liệu vẫn lọc theo nhà máy của phiên |
| `GET /me/lines` | Chuyền đang hoạt động của nhà máy đang làm việc `[ { code, name, branchCode, isActive, workshopCode, workshopName } ]`, xếp theo cây (xưởng rồi chuyền; chuyền không thuộc xưởng sau cùng). `workshopCode`/`workshopName` `null` khi chuyền nằm thẳng dưới nhà máy (ADR 0010) |

Frontend cache theo dấu phiên bản quyền. Mọi response có header `X-Permission-Version` dạng `version` hoặc `version.mốcHếtHạn` (đổi khi quản trị đổi quyền **và** khi phép gán, ngoại lệ tới giờ bắt đầu/hết hạn); khi khác `stamp` đang giữ, FE gọi lại `/me`, `/me/menu`, `/me/permissions`, `/me/field-policies`. FE chỉ dùng dữ liệu này để ẩn/hiện; mọi quyết định thật nằm ở Backend.

## 4. API module Đơn hàng (Phase 5.3, ADR 0006)

Database `MES_Order`. Mọi controller khai báo `@FieldResource(<tài nguyên>)`: dữ liệu trả về bỏ cột Ẩn, cột Che trả `"***"`; dữ liệu gửi lên có cột không Sửa được ⇒ 403 `FIELD_READONLY`. Xuất file (`…/export`) trả CSV UTF-8 có BOM, đi qua cùng chính sách cột, cần quyền `:export`. Không sắp xếp được theo cột Ẩn/Che. Danh sách nhận bộ lọc chung `shipFrom`, `shipTo` (YYYY-MM-DD), `customer` (một phần tên), `style` (một phần mã), `season`, `status`, `line`, `q`, `cf` (lọc theo cột). Mỗi danh sách có `/values` cho popup lọc theo cột (mục 1): `sales-orders/values`, `shipment-plans/values`, `line-plans/values`, `color-size/values`, `cut-ratio/styles/values`, `cut-ratio/pos/values`. Mỗi dòng trả thêm `createdAt`.

| Method & đường dẫn | Quyền | Mô tả |
|---|---|---|
| `GET /order/sales-orders` · `/options` · `/export` · `/:id` | `order.allocation:view` (`export`) | Thông tin đơn hàng; `options` trả `{ customers, seasons, orderTypes, orderTypeNames, units, factories }` để gợi ý ô lọc, ô Loại (theo danh mục Loại đơn hàng kèm giá trị đã có), Đơn vị tính (theo danh mục) và Nhà máy SX (`factories: [{ code, name, isActive }]`, kể cả mục đã ngừng để lưới hiện tên); cột bị Ẩn/Che thì rỗng |
| `POST /order/sales-orders` · `PUT /:id` · `DELETE /:id` | `order.allocation:create/update/delete` | Nhập tay (chưa đồng bộ). Số đơn tự sinh `DH-<nhà máy>-<Id>`. Xóa đơn đã có PO/kế hoạch ⇒ 409. `productionFactoryCode` (Nhà máy SX): mã mục đang dùng của danh mục `PROD_FACTORY`, `null`/rỗng là bỏ chọn; mã lạ hoặc đã ngừng ⇒ 422 |
| `GET /order/po-allocations` · `/values` · `/options` · `/export` | `order.poallocation:view` (`export`) | Phân bổ PO theo nhà máy SX lấy từ OSM (task 5.9.12): đọc bảng chép `MES_Sync.osm.OSMData` qua lớp đồng bộ, chỉ xem, dùng chung toàn công ty (không lọc ĐVCS). Dòng trùng nguyên dòng của OSM tính một lần. Mỗi dòng `{ rowNo, brand, season, po, so, shipMode, styleName, styleNo, color, etdActual, etdRevised, factoryName, branchCode }` (`rowNo`: số thứ tự trong danh sách đang xem, không có Id; `branchCode`: ĐVCS của nhà máy theo danh mục Nhà máy SX, `null` khi nhà máy chưa gắn ĐVCS), trang trả thêm `syncedAt` (lần chép gần nhất, `null` khi chưa đồng bộ) và `sourceActive` (nguồn `OSM.OSMData` đang bật; `false` khi máy chủ chưa khai `DB_OSM_APP_NAME`). `branchCode` theo cả chính sách cột của `factoryName`: Nhà máy SX bị Ẩn thì không có trường này (file xuất bỏ cột Đơn vị cơ sở), bị Che thì `"***"`; khi đó lọc, sắp xếp theo `branchCode` bị bỏ, `values?field=branchCode` ⇒ 403 `FIELD_NOT_READABLE`. Bộ lọc: `customer` = Brand và `season` (so bằng), `style` (một phần Style No hoặc Style name), `q` (một phần PO hoặc SO), `cf` (mọi cột, kể cả `branchCode`). Mặc định `etdRevised:desc` (cột này bị Ẩn/Che thì cột mặc định kế tiếp xem được). `options` trả `{ brands, seasons }`. Xuất tối đa 50.000 dòng, quá thì 422. Không có dòng `createdAt` (OSM không có ngày tạo). Máy chưa có `MES_Sync` ⇒ 503 `SYNC_NOT_READY` |
| `GET /order/shipment-plans` · `/export` · `/:id` | `order.shipment:view` (`export`) | Kế hoạch xuất hàng; `/:id` kèm `poIds` và lưới màu cỡ `{ colorName, sizeName, originalQty, plannedQty, remainingQty, planQty }` |
| `GET /order/shipment-plans/candidates` · `/candidates/:salesOrderId/pos` · `/draft?salesOrderId&poIds=1,2&excludePlanId` | `order.shipment:view` | Popup "Chọn mã hàng": đơn hàng còn số lượng, bỏ đơn Hoàn thành/Hủy, tối đa 200 theo ngày xuất (lọc theo chính sách cột của Thông tin đơn hàng), PO của đơn (theo chính sách cột của Cập nhật tỷ lệ cắt), lưới màu cỡ SL gốc / đã tạo / còn lại. Từ Phase 5.9 (ADR 0013 mục 11): chỉ đơn có ít nhất một Nhà máy SX thuộc ĐVCS của phiên theo danh mục Nhà máy SX, đơn có Chi nhánh FOB nào cũng được (đơn ngoài danh sách: PO, `draft` lập mới 404); mỗi dòng trả thêm `productionFactoryCode`; SL đã tạo tính kế hoạch ở mọi ĐVCS. `draft` có `excludePlanId` (sửa kế hoạch) thì kế hoạch phải xem được và đúng đơn hàng |
| `GET /order/shipment-plans/:id/pos` | `order.shipment:view` và `order.po:view` | Khung "PO của kế hoạch" (task 5.9.14): `{ items: [{ id, poCode, poNumber, destination, shipDate, qty, statusCode, confirmedAt, confirmedQty, unconfirmedQty }], hiddenCount }`, PO đã chọn khi lập kế hoạch, theo ngày xuất rồi số PO, bỏ cột người dùng không xem được nguyên giá trị (không còn cột nào thì theo Id; `candidates/:id/pos` cũng vậy). Kế hoạch không xem được (ĐVCS khác, ngoài phạm vi) ⇒ 404. Áp chính sách cột của Cập nhật tỷ lệ cắt (`@FieldResource('order.po')` ở handler, thay cho của kế hoạch; `candidates/:id/pos` cũng vậy). SL đã xác nhận, chưa xác nhận tính theo cả PO, theo mức chặt hơn của `qty` và `statusCode`; `confirmedAt` theo `statusCode`; bị Che luôn `"***"`. `hiddenCount`: PO của kế hoạch ngoài phạm vi được xem ở `order.po` |
| `POST /order/shipment-plans` | `order.shipment:create` | `{ salesOrderId, poIds, poBuyDate, shipDate?, lines: [{ colorName, sizeName, planQty }] }`. Vượt SL còn lại hoặc màu cỡ lặp ⇒ 422. Khóa đơn hàng đến hết transaction (hai người cùng lập không vượt, kể cả ở hai ĐVCS). Đơn phải có nhà máy SX thuộc ĐVCS của phiên (đọc lại sau khi khóa), khác thì 404. Kế hoạch mang ĐVCS của phiên, số `KH-<ĐVCS>-<Id>` (Phase 5.9) |
| `PUT /order/shipment-plans/:id` · `DELETE /:id` | `order.shipment:update/delete` | Sửa PO/Buy date, ngày xuất, SL theo màu cỡ; không giảm dưới SL đã xếp chuyền (409). Xóa kế hoạch đã xếp chuyền ⇒ 409 |
| `GET /order/cut-ratio/styles` | `order.po:view` | Danh sách mã hàng gom từ PO, một dòng mỗi đơn hàng, có phân trang (Phase 5.6): `?page&pageSize&cf` ⇒ `{ items, total, page, pageSize }`, mã có PO mới tạo gần nhất lên đầu; `?createdBy=me` = "Người lập" là mình; lọc theo cột: `customerName`, `styleCode`, `branchCode` (Chi nhánh FOB của đơn hàng). Từ 5.9.13 (ADR 0013 mục 11) màn Tỷ lệ cắt (`styles`, `pos`, hai `/values`, `export`) chỉ có PO nằm trong kế hoạch xuất hàng của ĐVCS của phiên và PO nhập tay ở ĐVCS đó; đơn vị tổng hợp: kế hoạch của mọi ĐVCS và mọi PO nhập tay |
| `GET /order/cut-ratio/pos?salesOrderId=` · `/pos/export` · `/pos/:id/color-sizes` | `order.po:view` (`export`) | Danh sách PO, chi tiết màu cỡ. Mỗi dòng của danh sách PO có `inPlan` (PO đã nằm trong kế hoạch xuất hàng nào đó: không xóa được) |
| `POST /order/cut-ratio/pos` | `order.po:create` (và `order.allocation:view` để lấy khách hàng, mã hàng) | Thêm PO tay kèm màu cỡ. Chỉ cho đơn đang có PO trên màn ở ĐVCS của phiên (trong kế hoạch của ĐVCS, hoặc PO tay ở đây), khác thì 422; PO mang ĐVCS của phiên. Đơn vừa bị xóa ⇒ 409 |
| `PUT /order/cut-ratio/pos/:id/color-sizes` · `POST /pos/:id/confirm` · `/unconfirm` · `DELETE /pos/:id` | `order.po:update` (`delete`) | "Cập nhật" (thay toàn bộ màu cỡ, tính lại SL PO), "Xác nhận", "Hủy xác nhận", "Xóa PO". PO đã xác nhận không sửa, không xóa (409); PO đã có kế hoạch không xóa (409). Ghi được ở ĐVCS của PO hoặc ĐVCS có PO trong kế hoạch xuất hàng của mình (ADR 0013 mục 11), khác thì 404; khóa PO tới hết lần ghi |
| `GET /order/line-plans` · `/export` · `/:id` | `order.lineplan:view` (`export`) | Xếp chuyền: kế hoạch kèm SL đã xếp, còn lại, ngày BĐ/KT SX, giá CM, doanh số; `/:id` kèm dòng dàn chuyền (lọc theo phạm vi chuyền của người xem) |
| `GET /order/line-plans/board?from&to&style&customer` | `order.lineplan:view` | Bảng dàn chuyền: `{ lines: [...], bars: [...] }`, tối đa 190 ngày, lọc theo phạm vi chuyền |
| `PUT /order/line-plans/:id/lines` | `order.lineplan:update` | `{ lines: [{ id?, lineCode, qty, avgOutput, startDate, offDays?, outStartDate?, outEndDate?, warehouseStartDate?, warehouseEndDate? }] }`. Server tính số ngày SX, ngày kết thúc (bỏ Chủ nhật); chuyền khác nhà máy hoặc quá 366 ngày ⇒ 422; tổng vượt SL kế hoạch ⇒ 422; dòng đang may không xóa, không đổi chuyền (409). Dòng mới được đề xuất phân màu cỡ theo tỷ lệ |
| `GET /order/color-size` · `/export` · `/:id` | `order.colorsize:view` (`export`) | Phân bổ màu cỡ: mỗi dòng một chuyền của một kế hoạch, lọc theo phạm vi chuyền |
| `PUT /order/color-size/:id` | `order.colorsize:update` | `{ rows: [{ colorName, sizeName, assignedQty }] }` – chỉ màu cỡ đã có của dòng, mỗi ô không vượt SL KH (422) |

Ở `A00`, mọi API ghi trên tài nguyên theo nhà máy trả 403 `AGGREGATE_READ_ONLY`. Dòng trả về luôn mang `branchCode`.

## 4b. API module May (Phase 5.5, ADR 0009)

Database `MES_Sewing`. Màn nằm ở nhóm Quản trị đơn hàng (tài nguyên `order.prep`, đường dẫn màn `/order/prep`), API thuộc module May. Kế hoạch chuẩn bị SX khai báo `@FieldResource('order.prep')`. Cột `steps` (Các bước chuẩn bị) áp chính sách cột cho cả nhóm cột KH, TH và các cột bước trong file xuất.

| Method & đường dẫn | Quyền | Mô tả |
|---|---|---|
| `GET /sewing/prep?page&pageSize&q&sort&startFrom&startTo&branch&customer&style&styleType&line&status&week&cf` · `/values` | `order.prep:view` | Trước khi đọc, chép dòng dàn chuyền của nhà máy đang làm việc (A00: mọi nhà máy) từ module Đơn hàng. Chỉ chép khi dàn chuyền đổi. Trả `{ items, total, page, pageSize, today, stepInfo }`; `stepInfo` là các bước đang dùng theo thứ tự cột (khóa `steps` dành cho cột của từng dòng, chịu chính sách cột). Mỗi dòng: `{ id, branchCode, planNo, customerName, styleCode, productName, lineCode, lineQty, startDate, styleType, confirmedQty, priorityFactor, steps: [{ stepId, planDays, custom, planDate, doneDate, state }], statusCode, createdAt, canEdit }`. `state`: `DONE`, `DONE_LATE`, `OVERDUE`, `PENDING`; `statusCode` (task 5.5.7): `NOT_DUE` Chưa đến ngày V/C, `NOT_READY` Chưa đủ đk V/C, `READY` Đủ điều kiện V/C (lọc được bằng `status`). `canEdit`: dòng nằm trong phạm vi sửa (A00: luôn `false`). `branch` (A01…): lọc trong phạm vi đã xem được, dùng cho ô Đơn vị của phiên A00, không đổi nhà máy của phiên; lựa chọn của ô lấy từ `/values?field=branchCode` (nhà máy đang có dòng, không phải nhà máy tài khoản được gán). `styleType`: Loại mã đúng bằng. `week`: một ngày trong tuần (thứ Hai – Chủ nhật): dòng có bước đang dùng đến hạn KH tới hết Chủ nhật mà chưa có TH, cộng dòng vào chuyền trong tuần; người không xem được các bước thì chỉ lọc theo ngày vào chuyền. Thứ tự mặc định Chi nhánh → Tổ SX → Mã hàng → Ngày vào chuyền; `sort` nhận một hoặc nhiều cặp `trường:chiều` cách nhau dấu phẩy. Lọc theo phạm vi nhà máy và chuyền |
| `PUT /sewing/prep` | `order.prep:update` | Lưu ngày TH nhập trên bảng, nhiều dòng một transaction: `{ items: [{ id, steps: [{ stepId, doneDate, previous? }] }] }` (tối đa 500 dòng, 5.000 ô). `doneDate: null` là xóa ngày TH (bước còn số ngày chỉnh riêng thì giữ số ngày). `previous`: ngày lúc tải bảng; ô trong DB khác `previous` và khác ngày mới ⇒ 409 `CONFLICT`, `details.cells: [{ id, stepId, doneDate }]`, không ghi gì. Ngày sau hôm nay, dòng hoặc bước gửi hai lần, bước không có ⇒ 422; dòng không còn hoặc ngoài phạm vi sửa ⇒ 404 `NOT_FOUND`, `details.ids` là các Id (trong số Id đã gửi) không lưu được, không ghi gì. Chính sách cột `steps` không phải Sửa ⇒ 403 `FIELD_READONLY`. Trả `{ rows, cells }` (số dòng, số ô thật sự đổi); ghi `SysAuditLog` mỗi dòng sau khi commit. Body JSON tối đa 512 KB (mọi route; 5.000 ô khoảng 370 KB) |
| `GET /sewing/prep/summary` | `order.prep:view` | Số liệu trên đầu màn (task 5.5.8). Nhận cùng tham số lọc như danh sách (`page`, `pageSize`, `sort` bỏ qua; `status` bỏ qua để các số không về 0 khi đang lọc một trạng thái); chép dàn chuyền trước khi đếm như danh sách. Trả `{ today, total, ready, atRisk, late }`, mỗi số là số **mã hàng** (nhà máy + mã hàng) khác nhau: `total` trong các dòng khớp lọc; `ready` có dòng Đủ điều kiện V/C; `atRisk` có bước đang dùng chưa có TH mà KH trong [hôm nay, hôm nay + 2]; `late` có dòng Chưa đủ đk V/C có bước trễ (TH sau KH, hoặc qua KH chưa có TH). Cột `styleCode` bị Ẩn/Che ⇒ cả 4 số `null` (đếm mã hàng khác nhau làm lộ các dòng có cùng mã hay không); cột `steps` hoặc `statusCode` bị Ẩn/Che ⇒ `ready`, `atRisk`, `late` là `null`. Mã hàng so theo collation của database như bộ lọc Mã hàng. Lọc theo phạm vi nhà máy và chuyền như danh sách; A00 đếm mọi nhà máy (cùng mã ở hai nhà máy là 2) |
| `GET /sewing/prep/export` | `order.prep:export` | File CSV: cột cố định, Trạng thái (ngay sau Ngày vào chuyền), cặp cột "<bước> - KH", "<bước> - TH" |
| `GET /sewing/prep/:id` | `order.prep:view` | Một dòng cho popup cập nhật, kèm `stepInfo` (bước đang dùng cùng bước đã ngừng mà dòng còn ngày đã nhập; trạng thái chỉ tính bước đang dùng) và `today` (giờ Việt Nam) |
| `PUT /sewing/prep/:id` | `order.prep:update` | `{ styleType?, confirmedQty?, priorityFactor?, steps?: [{ stepId, planDays?, doneDate? }] }`, chỉ gửi phần đã đổi. `planDays` bằng số của danh mục hoặc `null` là theo danh mục. Bỏ cả số ngày lẫn ngày thực hiện thì xóa dòng con. Ngày thực hiện sau hôm nay, bước không có, bước gửi hai lần ⇒ 422 |
| `GET /sewing/prep-steps` | `admin.catalog:view` | Danh mục Cấu hình chuẩn bị SX (kể cả bước ngừng dùng) |
| `POST /sewing/prep-steps` | `admin.catalog:create` | `{ code, name, planDays, performer?, dataSource?, description? }`. Mã tự viết hoa, trùng ⇒ 409; bước mới nằm cuối |
| `PUT /sewing/prep-steps` | `admin.catalog:update` | Lưu nhiều bước một lần: `{ items: [{ id, name?, planDays?, performer?, dataSource?, description?, sortOrder?, isActive? }] }`, trong một transaction. Không xóa; mã không đổi |

## 4c. API module Nhân sự (Phase 5.8, ADR 0012)

Database `MES_Hr` (`docs/thiet-ke/db-hr.md`). Dữ liệu dùng chung toàn công ty: không lọc theo nhà máy của phiên, ghi được cả ở phiên `A00`. Thông tin nhân sự khai báo `@FieldResource('hr.employee')`. Route tĩnh khai báo trước `:id`.

**Sơ đồ tổ chức (`hr.orgchart`)**

| Method & đường dẫn | Quyền | Mô tả |
|---|---|---|
| `GET /hr/departments/tree?includeDissolved=0\|1` | `hr.orgchart:view` | `{ items }`: danh sách phẳng, màn tự dựng cây. Mỗi phòng ban: `{ id, code, name, nameEn, departmentTypeId, typeCode, typeName, levelOrder, isFinalLevel, parentId, path, managerEmployeeId, managerCode, managerName, branchCode, establishedDate, dissolvedDate, sortOrder, isActive, activeEmployees, createdAt, modifiedAt }`. `activeEmployees`: người đang làm trực tiếp trong phòng ban. Thứ tự: cấp của loại, thứ tự, tên |
| `GET /hr/departments/options` | `hr.orgchart:view` | `{ types: [{ id, code, name, levelOrder, isFinalLevel, isActive }], factories: [{ code, name }] }` (nhà máy đang dùng) |
| `GET /hr/departments/manager-options?q&selected` | `hr.orgchart:view` (và quyền xem hồ sơ nhân viên, repository lọc) | Tối đa 20 nhân viên đang làm khớp mã hoặc tên (không dấu): `[{ id, code, fullName, departmentName, isActive }]`; `selected` luôn có trong kết quả |
| `GET /hr/departments/:id` | `hr.orgchart:view` | Một phòng ban, cùng dạng như trên |
| `POST /hr/departments` | `hr.orgchart:create` | `{ code, name, nameEn?, departmentTypeId, parentId?, managerEmployeeId?, branchCode?, establishedDate?, sortOrder? }`. Mã tự viết hoa, `[A-Z0-9-]{1,20}`; trùng mã (kể cả phòng ban đã giải thể) ⇒ 409. Cha không có, đã giải thể, hoặc thuộc loại cấp cuối ⇒ 422. Nhà máy không đang dùng hoặc là `A00` ⇒ 422. Người quản lý không phải nhân viên đang làm ⇒ 422 |
| `PUT /hr/departments/:id` | `hr.orgchart:update` | Như trên, chỉ gửi phần đã đổi. Gửi `code` khác ⇒ 422 `CODE_IMMUTABLE`. Đổi `parentId`: cha mới không phải chính nó hay nút trong nhánh ⇒ 422; cả nhánh đổi `Path` theo. Đổi sang loại cấp cuối khi còn phòng ban con ⇒ 422 |
| `POST /hr/departments/:id/dissolve` | `hr.orgchart:update` | `{ dissolvedDate? }` (mặc định hôm nay, giờ Việt Nam). Còn phòng ban con đang dùng hoặc nhân viên đang làm ⇒ 409, thông báo nêu số lượng; đã giải thể ⇒ 409; ngày trước ngày thành lập ⇒ 422 |
| `POST /hr/departments/:id/restore` | `hr.orgchart:update` | Phòng ban cha đã giải thể ⇒ 422; đang dùng ⇒ 409 |

**Thông tin nhân sự (`hr.employee`)**

| Method & đường dẫn | Quyền | Mô tả |
|---|---|---|
| `GET /hr/employees/options` | `hr.employee:view` | `{ departments: [{ id, code, name, parentId, path, isActive }], jobTitles: [{ id, code, name, departmentId, isActive }], genders, statuses, fields: [{ key, label, group, type, required, max }], groups }`. `fields` định nghĩa một chỗ (`employee-fields.ts`) cho form, lưới nhập, file mẫu |
| `GET /hr/employees?page&pageSize&q&departmentId&jobTitleId&status` | `hr.employee:view` | Thẻ nhân viên, mặc định 20 mỗi trang, mới tạo trước. `departmentId` lấy cả nhánh con. `q` tìm mã, mã chấm công, tên, tên tiếng Anh, email (trừ khi email bị Ẩn/Che), tên chức danh; không dấu. Mỗi thẻ: `{ id, code, timekeepingCode, fullName, gender, departmentId, departmentName, jobTitleId, jobTitleName, employmentStatus, startDate, createdAt }` (không có giấy tờ, liên lạc) |
| `GET /hr/employees/export` | `hr.employee:export` | CSV mọi dòng khớp bộ lọc, cùng thứ tự cột với lưới nhập; phòng ban, chức danh dạng `[MÃ] Tên`; qua chính sách cột (cột Ẩn không có, cột Che `***`, có ghi `SysSensitiveReadLog` EXPORT) |
| `POST /hr/employees/import/preview` | `hr.employee:create` | `{ rows: [{ <khóa trường>: chữ }] }`, tối đa 500 dòng. Trả `{ rows: [{ index, header, ok, errors: [{ field, message }], resolved: { departmentName?, jobTitleName? } }] }`. Dòng đầu trùng tên cột (kể cả tên gọi khác, dấu `*`) là dòng tiêu đề. Phòng ban dò theo mã, tên không dấu, `[MÃ] Tên`; chức danh dò trong số chức danh dùng được cho phòng ban. Ngày: dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, số ngày Excel (5–6 chữ số). Trùng mã trong lô và trong hệ thống báo theo ô |
| `POST /hr/employees/import/commit` | `hr.employee:create` | Cùng dạng body. Kiểm lại từ đầu, thêm từng dòng hợp lệ độc lập (khóa chung của cây, đọc lại phòng ban, chức danh). Trả `{ created, failed, results: [{ index, ok, id?, code?, message?, skipped? }] }`. Nhật ký: mỗi người một dòng `CREATE` cùng một dòng `IMPORT` |
| `POST /hr/employees` | `hr.employee:create` | Khóa theo `fields`. Bắt buộc: `code`, `fullName`, `gender`, `departmentId`, `jobTitleId`; `employmentStatus` mặc định 1; `timekeepingCode` trống lấy theo `code`. Trùng mã hoặc mã chấm công ⇒ 409; chức danh không dùng cho phòng ban, phòng ban đã giải thể, đang làm mà có `endDate` ⇒ 422. Lỗi kèm `details.fields: { <khóa>: thông báo }` |
| `GET /hr/employees/:id` | `hr.employee:view` | Hồ sơ đủ các khóa của `fields` (ngày YYYY-MM-DD) cùng `departmentCode`, `departmentName`, `jobTitleName`, `createdAt`, `modifiedAt` |
| `PUT /hr/employees/:id` | `hr.employee:update` | Chỉ gửi phần đã đổi. **Đổi mã được** (Id giữ nguyên), chỉ cấm trùng ⇒ 409. `timekeepingCode: null` lấy theo mã nhân viên. Kiểm chức danh khi đổi phòng ban hoặc chức danh |

## 5. API quản trị (Phase 3)

Tất cả yêu cầu quyền tương ứng và ghi `SysAuditLog` (trước/sau). Người dùng không được tự sửa Role/quyền của chính mình (kể cả bật lại vai trò mình đang giữ, tự đặt lại mật khẩu) ⇒ 403 `SELF_ELEVATION_FORBIDDEN`. Trần quyền quản trị (ADR 0004): không cấp, gỡ hay quản lý quyền `admin.*` mà mình không có ⇒ 403 `SELF_ELEVATION_FORBIDDEN`. Thay đổi phân quyền ghi audit và tăng `PermissionVersion` trong cùng transaction.

| Method & đường dẫn | Quyền | Mô tả |
|---|---|---|
| `GET /admin/users` | `admin.user:view` | Phân trang, `?q=` |
| `POST /admin/users` | `admin.user:create` | Tạo user `{ username, fullName, email?, initialPassword }` |
| `PUT /admin/users/:id` | `admin.user:update` | Sửa thông tin, khóa/mở khóa, bật/tắt |
| `POST /admin/users/:id/reset-password` | `admin.user:update` | Đặt lại mật khẩu, thu hồi mọi phiên (access token đang mở mất hiệu lực ngay). Không áp cho chính mình |
| `PUT /admin/users/:id/roles` | `admin.permission:update` | Body `{ roleIds: [] }`. So sánh khác biệt: vai trò giữ nguyên thì giữ phạm vi; vai trò bị bỏ thì xóa phạm vi kèm audit |
| `PUT /admin/users/:id/branches` | `admin.permission:update` | Body `{ branchIds: [], defaultBranchId? }`: đơn vị cơ sở được chọn khi đăng nhập. Ghi `USER_BRANCHES`, tăng `PermissionVersion`. Từ 5.9.13 (ADR 0013 mục 11) không còn tích nhà máy SX theo người: `productionFactoryIds` gửi lên bị bỏ qua, `GET /admin/users` không còn trường này, bỏ `GET /admin/users/production-factories` |
| `GET /admin/roles` · `POST` · `PUT /:id` · `DELETE /:id` | `admin.role:*` | CRUD vai trò; `IsSystem` không xóa được; `DELETE` chỉ vô hiệu hóa (không xóa vật lý) |
| `GET /admin/roles/:id/permissions` | `admin.permission:view` | Danh sách `permissionId` đang gán |
| `PUT /admin/roles/:id/permissions` | `admin.permission:update` | Body `{ permissionIds: [] }`; tăng `PermissionVersion` |
| `GET /admin/permissions` | `admin.permission:view` | Quyền nhóm theo module → tài nguyên → hành động (dựng ma trận) |
| `GET /admin/menus` | `admin.permission:view` | Cây menu kèm tài nguyên (để hiển thị ma trận theo menu) |
| `GET /admin/branches` · `POST` · `PUT /:id` | `admin.branch:*` | Đơn vị cơ sở (ADR 0013). `GET` trả thêm `inBravo` (có trong danh mục chi nhánh BRAVO; `null` với `A00` hoặc khi chưa đọc được `MES_Sync`) và `factories: [{ code, name, isActive }]`. Không sửa `Code` (422 `CODE_IMMUTABLE`); ĐVCS có trong BRAVO không đổi tên, tên đầy đủ được (409); `A00` không tắt được. `POST` chỉ còn cho máy chưa có đồng bộ BRAVO (màn hình không có nút thêm) |
| `POST /admin/branches/import` | `admin.branch:update` | Cập nhật ĐVCS theo danh mục chi nhánh BRAVO đã chép: thêm mã thiếu, đổi tên theo BRAVO, không tắt mã vắng → `{ rows, added: [{ code, name }], updated, missing, skipped }`. Cũng tự chạy sau mỗi lần đồng bộ `BRAVO.DM_CHINHANH` thành công. Ghi `BRANCH_IMPORT` khi có thay đổi. `503 SYNC_NOT_READY` khi chưa có `MES_Sync` |
| `GET /admin/audit` | `admin.audit:view` | `?from&to&entityType&userId`, phân trang |
| `GET /admin/sync/sources` | `admin.sync:view` | Nguồn đồng bộ kèm mốc dữ liệu, lần chạy gần nhất, số dòng trong MES. `503 SYNC_NOT_READY` khi chưa có `MES_Sync` |
| `GET /admin/sync/runs` | `admin.sync:view` | `?sourceId&page&pageSize`: lịch sử chạy của một nguồn |
| `POST /admin/sync/start` | `admin.sync:update` | `{ sourceIds?: number[], full?: boolean }` → `202 { batchId, queued, skipped }`; chạy nền, ghi `SYNC_START` |
| `GET /admin/catalogs` | `admin.catalog:view` | Tổng quan: `{ mes: [{ code, kind (line, factory, item, shift), name, description, total, active }], external: [{ code, name, sourceObject, rowCount, lastSuccessAt }], externalError }`. Chưa có `MES_Sync` thì `external` rỗng kèm `externalError` |
| `GET/POST /admin/catalogs/lines` · `PUT /admin/catalogs/lines/:id` | `admin.catalog:view/create/update` | Chuyền may: `{ branchCode, code, name, sortOrder?, workshopId? }`.<br>Mã bắt đầu bằng mã nhà máy, không trùng, không sửa (`422 CODE_IMMUTABLE`).<br>Sửa `name`, `sortOrder`, `isActive`, `workshopId` (`null`: thẳng dưới nhà máy; xưởng nhà máy khác `422`; xưởng đã ngừng `409`; bật chuyền khi xưởng đang ngừng `409`).<br>Chuyển xưởng cần thêm `admin.permission:update`; người đang được giao phạm vi cả xưởng cũ hay mới nhận `403 SELF_ELEVATION_FORBIDDEN`.<br>`GET` trả `{ branches, workshops: [{ id, code, name, branchCode, sortOrder, isActive, activeLines }], items: [{ id, code, name, branchCode, workshopId, sortOrder, isActive }] }`. `?q&branch` (Phase 5.6): lọc trên máy chủ, chỉ nhà máy đó; tìm trúng xưởng thì cả xưởng, trúng chuyền thì chuyền kèm xưởng chứa nó; `branches` luôn đủ, `activeLines` luôn đếm trên mọi chuyền.<br>Ghi `LINE_CREATE`/`LINE_UPDATE` (ADR 0010) |
| `POST /admin/catalogs/workshops` · `PUT /admin/catalogs/workshops/:id` | `admin.catalog:create/update` | Xưởng: `{ branchCode, code, name, sortOrder? }`; mã như mã chuyền (bắt đầu bằng mã nhà máy, duy nhất trên cả cây, không sửa).<br>Sửa `name`, `sortOrder`, `isActive`; còn chuyền đang dùng thì không ngừng được (`409`).<br>Ghi `WORKSHOP_CREATE`/`WORKSHOP_UPDATE` (ADR 0010) |
| `GET/POST /admin/catalogs/factories` · `PUT /admin/catalogs/factories/:id` | `admin.catalog:view/create/update` | Nhà máy SX (Phase 5.9, ADR 0013): `{ code, name, branchCode, description?, sortOrder? }`. `branchCode` phải là ĐVCS có thật, không phải đơn vị tổng hợp, đang dùng (giữ nguyên ĐVCS đang tắt thì được) ⇒ khác thì 422. Mã chữ hoa, không trùng (409), không sửa (422 `CODE_IMMUTABLE`). Sửa `name`, `branchCode`, `description`, `sortOrder`, `isActive`. Thêm nhà máy, đổi `branchCode`, bật/tắt đổi danh sách nhà máy SX trong quyền của phiên ở ĐVCS đó: tăng `PermissionVersion` và cần thêm `admin.permission:update` (thiếu ⇒ 403 `SELF_ELEVATION_FORBIDDEN`), ADR 0013 mục 11. `GET ?q` trả `[{ id, code, name, branchCode, branchName, description, sortOrder, isActive }]`. Ghi `FACTORY_CREATE`/`FACTORY_UPDATE` |
| `GET/POST /admin/catalogs/items/:code` · `PUT /admin/catalogs/items/:code/:id` | `admin.catalog:view/create/update` | Danh mục mã-tên (`UNIT`, `ORDER_TYPE`; `PROD_FACTORY` ngừng dùng từ Phase 5.9): `{ code, name, description?, sortOrder? }`; `GET ?q` tìm mã, tên, mô tả trong DB (Phase 5.6); ghi `CATALOG_ITEM_CREATE`/`UPDATE` |
| `GET/POST /admin/catalogs/shifts` · `PUT /admin/catalogs/shifts/:id` | `admin.catalog:view/create/update` | Ca làm việc: `{ code, name, startTime: "HH:mm", endTime, breakMinutes, description?, sortOrder? }`; trả thêm `workMinutes`, `overnight`. Ghi `SHIFT_CREATE`/`UPDATE` |
| `GET /admin/catalogs/external/:code/rows` | `admin.catalog:view` | Danh mục chép từ BRAVO, chỉ đọc: `?page&pageSize&q` → `{ total, columns: [{ name, type, key }], rows: [[...]] }`; `code` phải là nguồn nhóm `CATALOG` trong `SyncSource`, khác thì `404` |
| `GET /admin/users/:id/access` | `admin.user:view` | Phép gán kèm phạm vi, ngoại lệ, cột riêng của một người |
| `GET /admin/users/:id/effective?branchCode=` | `admin.user:view` | Xem thử: quyền, phạm vi theo màn hình, mức cột của người đó ở một nhà máy |
| `GET /admin/scope-catalog` | `admin.user:view` | Chiều phạm vi và cây tổ chức (nhà máy, chuyền) |
| `PUT /admin/users/:id/roles/:roleId/scope` | `admin.permission:update` | Body `{ scopes: [{ dimension: "FACTORY"\|"LINE"\|"OWNER", mode: "ALL"\|"ORG_SUBTREE"\|"LIST"\|"OWN", orgUnitId?, value? }] }` – thay phạm vi của phép gán; tổ hợp sai ⇒ 422 |
| `POST /admin/users/:id/overrides` · `DELETE /admin/users/:id/overrides/:overrideId` | `admin.permission:update` | Ngoại lệ `{ permissionId, effect: "ALLOW"\|"DENY", validFromAt?, validToAt?, reason }` (lý do bắt buộc); trần quyền `admin.*` áp cả cho ngoại lệ |
| `GET /admin/resource-fields` | `admin.fieldpolicy:view` | Tài nguyên có cột đăng ký, kèm cột và cờ nhạy cảm |
| `GET /admin/field-policies?resourceId=` | `admin.fieldpolicy:view` | Ma trận vai trò × cột của một tài nguyên |
| `PUT /admin/roles/:id/field-policies` | `admin.fieldpolicy:update` | `{ resourceId, policies: [{ fieldCode, accessLevel \| null }] }`; không sửa vai trò mình đang giữ |
| `POST /admin/users/:id/field-policies` · `DELETE …/:policyId` | `admin.fieldpolicy:update` | Cột riêng theo người `{ resourceId, fieldCode, accessLevel, validFromAt?, validToAt?, reason }` |

## 6. Thứ tự áp dụng ở Backend cho một request dữ liệu

1. `AuthGuard`: xác thực access token (loại `preAuthToken`).
2. `PermissionGuard`: `@RequirePermission('order.po:view')`; thiếu ⇒ 403. Endpoint không khai báo quyền ⇒ CI báo lỗi.
3. Repository nền tảng: đọc tài nguyên trong `SysResource`; thêm điều kiện phạm vi L3 từ phạm vi của quyền đang dùng (`SysResourceScopeBinding`); `BRANCH` ⇒ gắn `BranchCode = <token>` cho mọi thao tác (list, getById, create, update, delete); nếu nhà máy trong token là đơn vị tổng hợp (`IsAggregate`, server tra từ `SysBranch`, không tin client) ⇒ bỏ điều kiện lọc cho thao tác đọc và từ chối thao tác ghi; `SHARED` ⇒ không gắn; chưa khai báo ⇒ từ chối.
4. `FieldPolicyInterceptor` (endpoint có `@FieldResource`): kiểm cột trong dữ liệu gửi lên, lọc cột trong dữ liệu trả về, ghi `SysSensitiveReadLog` khi trả cột nhạy cảm.
5. Audit cho thao tác ghi / quản trị.

## 7. Chưa nằm trong Demo

WebSocket/realtime, đồng bộ (`/sync/*`, hoãn theo chỉ đạo 09/10/2026), rate limit đăng nhập.
