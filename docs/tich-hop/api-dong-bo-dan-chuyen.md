# API đồng bộ dàn chuyền đã phân màu cỡ – MES Vietsun

Tài liệu cho lập trình viên của hệ thống khác cần lấy dữ liệu xếp chuyền từ MES. Ngày: 21/10/2026.

API trả các **dòng dàn chuyền đã phân màu cỡ**. Mỗi dòng ứng với một chuyền may được giao làm một kế hoạch xuất hàng, gồm khách hàng, mã hàng, PO/Buy date, chuyền, số lượng cấp cho chuyền, ngày vào chuyền và ngày ra chuyền. Bên gọi lấy tăng dần theo thời gian: mỗi lần chỉ nhận các dòng đã thay đổi kể từ lần lấy trước.

## 1. Kết nối

| Mục | Giá trị |
|---|---|
| Địa chỉ gốc (`BASE_URL`) | `http://<máy chủ MES>:<cổng>/api/v1`, quản trị MES cung cấp |
| Giao thức | HTTP, dữ liệu JSON UTF-8 |
| Tài khoản | Quản trị MES cấp một tài khoản MES có quyền **Xem** và **Xuất file** ở màn Phân bổ màu cỡ |
| Đơn vị cơ sở (ĐVCS) | Mã chi nhánh theo BRAVO (`A01`, `A02`…). `A00` là đơn vị tổng hợp: lấy dữ liệu mọi ĐVCS mà tài khoản được giao |

Sai mật khẩu nhiều lần liên tiếp (mặc định 5 lần) thì tài khoản bị khóa một thời gian (mặc định 15 phút, lỗi 423). Không thử lại liên tục khi đăng nhập lỗi.

## 2. Đăng nhập

Đăng nhập có hai bước. Kết quả là `accessToken`, mặc định có hạn 15 phút.

### Bước 1: `POST /auth/login`

```http
POST {BASE_URL}/auth/login
Content-Type: application/json

{ "username": "<tên đăng nhập>", "password": "<mật khẩu>" }
```

Kết quả 200:

```json
{
  "preAuthToken": "eyJhbGciOi...",
  "user": { "id": 42, "fullName": "Tài khoản đồng bộ" },
  "branches": [
    { "code": "A00", "name": "Tổng công ty", "isAggregate": true },
    { "code": "A01", "name": "Nhà máy 1", "isAggregate": false }
  ]
}
```

`preAuthToken` mặc định có hạn 5 phút, chỉ dùng cho bước 2. `branches` là các ĐVCS tài khoản được chọn.

### Bước 2: `POST /auth/select-branch`

```http
POST {BASE_URL}/auth/select-branch
Authorization: Bearer <preAuthToken>
Content-Type: application/json

{ "branchCode": "A00" }
```

Kết quả 200:

```json
{
  "accessToken": "eyJhbGciOi...",
  "expiresIn": 900,
  "branch": { "code": "A00", "name": "Tổng công ty", "isAggregate": true }
}
```

- `expiresIn` là thời hạn của `accessToken`, tính bằng giây. Đọc từ kết quả, đừng gắn cứng 900.
- Mọi lệnh gọi sau gửi header `Authorization: Bearer <accessToken>`.
- Dùng lại `accessToken` cho tới khi gần hết hạn, đừng đăng nhập lại mỗi lần gọi.
- Gặp 401 thì làm lại bước 1 và bước 2.

## 3. Lấy dòng thay đổi: `GET /order/color-size/sync`

```http
GET {BASE_URL}/order/color-size/sync?from=2026-10-15
Authorization: Bearer <accessToken>
```

### Tham số

| Tham số | Bắt buộc | Dạng | Ý nghĩa |
|---|---|---|---|
| `from` | Có | `YYYY-MM-DD`, hoặc ngày giờ ISO 8601 **có múi giờ** (`2026-10-15T08:00:00+07:00`, `2026-10-15T01:00:00Z`) | Ngày lấy: lấy các dòng thay đổi từ thời điểm này (tính cả thời điểm này). Chỉ có ngày thì tính từ 0 giờ ngày đó, giờ Việt Nam |
| `to` | Không | Như `from` | Lấy tới trước thời điểm này (không tính thời điểm này). Chỉ có ngày thì tính hết ngày đó. Bỏ trống: lấy tới lúc gọi trừ 1 phút |

Lưu ý:

- **Mã hóa URL:** dấu `+` của múi giờ phải viết `%2B` (`from=2026-10-15T08:00:00%2B07:00`), nếu không máy chủ đọc thành dấu cách và trả 422. Dùng hàm mã hóa tham số của thư viện HTTP là đủ.
- **Ngày giờ thiếu múi giờ** (`2026-10-15T08:00:00`) bị từ chối (422).
- **`from` trước 2000-01-01** được tính là 2000-01-01 (MES không có dữ liệu trước đó). Năm viết thiếu chữ số như `0001-01-01` bị từ chối (422).
- **`to` không bao giờ muộn hơn lúc gọi trừ 1 phút:** dòng đang lưu dở trên MES không bị bỏ sót, vì sẽ có ở lần lấy sau. Dòng vừa sửa dưới 1 phút trước chưa có trong kết quả.

### Kết quả 200

```json
{
  "from": "2026-10-14T17:00:00.000Z",
  "to": "2026-10-21T02:14:00.000Z",
  "total": 1,
  "items": [
    {
      "id": 1021,
      "planId": 517,
      "planNo": "KH-A01-000123",
      "branchCode": "A01",
      "customerName": "KHÁCH HÀNG A",
      "styleCode": "STYLE-0001",
      "poBuyDate": "PO-TEST / 30-06",
      "lineCode": "C1",
      "lineName": "CHUYỀN MAY 1",
      "qty": 450,
      "assignedQty": 450,
      "startDate": "2026-10-15",
      "endDate": "2026-10-27",
      "outStartDate": "2026-10-18",
      "outEndDate": "2026-10-30",
      "changedAt": "2026-10-16T03:12:45.120Z"
    }
  ],
  "removedIds": [1022]
}
```

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `from`, `to` | chuỗi ngày giờ UTC | Khoảng thời gian thực tế máy chủ đã lấy. **Lưu `to` để làm `from` cho lần sau** |
| `total` | số | Số phần tử của `items` |
| `items[].id` | số | Khóa duy nhất của dòng dàn chuyền. Dùng làm khóa khi ghi vào hệ thống của bạn |
| `planId`, `planNo` | số, chuỗi | Id và số của kế hoạch xuất hàng chứa dòng |
| `branchCode` | chuỗi | ĐVCS lập kế hoạch |
| `customerName` | chuỗi | Khách hàng |
| `styleCode` | chuỗi | Mã hàng |
| `poBuyDate` | chuỗi | PO/Buy date |
| `lineCode`, `lineName` | chuỗi | Mã chuyền, tên chuyền |
| `assignedQty` | số | **Số lượng cấp cho chuyền**: tổng số lượng giao các màu cỡ ở màn Phân bổ màu cỡ |
| `qty` | số | Số lượng đã xếp cho chuyền ở màn Xếp chuyền. `assignedQty` có thể nhỏ hơn số này khi mới phân một phần |
| `startDate`, `endDate` | `YYYY-MM-DD` | Bắt đầu vào chuyền, kết thúc vào chuyền |
| `outStartDate`, `outEndDate` | `YYYY-MM-DD` hoặc `null` | Bắt đầu ra chuyền, kết thúc ra chuyền |
| `changedAt` | chuỗi ngày giờ UTC | Lúc dòng thay đổi gần nhất trên MES |
| `removedIds` | mảng số | Id các dòng thay đổi trong khoảng nhưng **không còn** ở trạng thái Đã phân màu cỡ (ví dụ người dùng bỏ hết phần giao). Xóa các dòng này nếu hệ thống của bạn đang giữ. Có thể gồm Id bạn chưa từng nhận: bỏ qua |

Các điểm cần biết khi đọc kết quả:

- **Chỉ có dòng Đã phân màu cỡ:** `items` không chứa dòng mới xếp chuyền mà chưa phân màu cỡ.
- **Một dòng là một chuyền:** kế hoạch xếp trên nhiều chuyền thì có nhiều dòng cùng `planId`.
- **Ngày giờ** (`from`, `to`, `changedAt`) luôn trả theo UTC. Các ngày sản xuất là ngày lịch, không có giờ.
- **Cột bị che theo phân quyền:** tài khoản bị giới hạn cột trên MES sẽ thấy giá trị `"***"` hoặc không có trường đó. Gặp trường hợp này thì báo quản trị MES.

## 4. Đối chiếu dòng đã xóa: `GET /order/color-size/sync/ids`

Dòng dàn chuyền bị xóa trên MES (xóa ở Xếp chuyền hoặc xóa kế hoạch xuất hàng) không còn dấu vết, nên `sync` không báo được. Lệnh này trả Id của **mọi** dòng đang ở trạng thái Đã phân màu cỡ:

```http
GET {BASE_URL}/order/color-size/sync/ids
Authorization: Bearer <accessToken>
```

```json
{ "ids": [1015, 1021, 1030] }
```

Dòng nào hệ thống của bạn đang giữ mà không có trong `ids` thì xóa.

## 5. Quy trình đồng bộ đề xuất

1. **Lần đầu:** gọi `sync?from=2000-01-01`, ghi toàn bộ `items` theo `id`, lưu `to` của kết quả.
2. **Mỗi chu kỳ** (ví dụ 5–15 phút một lần):
   1. Gọi `sync?from=<to đã lưu>`, dùng nguyên chuỗi đã lưu, không cắt bớt.
   2. Với mỗi phần tử của `items`: có `id` rồi thì cập nhật, chưa có thì thêm (upsert).
   3. Xóa các dòng có Id trong `removedIds`.
   4. Lưu `to` mới, chỉ sau khi đã ghi xong dữ liệu. Lần gọi lỗi thì giữ `to` cũ để lần sau lấy lại.
3. **Mỗi ngày một lần** (hoặc mỗi chu kỳ nếu số dòng ít): gọi `sync/ids`, xóa các dòng không còn trong danh sách.
4. **Lấy chồng an toàn:** muốn chắc chắn hơn, có thể lùi `from` vài phút so với `to` đã lưu. Vì ghi theo `id` nên dòng lấy lặp không bị trùng.
5. **Quá 10.000 dòng một lần:** máy chủ trả 422. Chia khoảng thời gian nhỏ hơn bằng `to`, rồi lấy lần lượt.

Ví dụ một chu kỳ:

```text
token  = đăng nhập (mục 2), hoặc dùng lại token còn hạn
r      = GET /order/color-size/sync?from={lastTo}
ghi theo id: r.items (thêm hoặc cập nhật)
xóa theo id: r.removedIds
lastTo = r.to              // lưu bền, chỉ sau khi ghi xong
```

## 6. Ví dụ `curl`

```bash
BASE=http://<máy chủ MES>:<cổng>/api/v1

PRE=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"username":"<tên đăng nhập>","password":"<mật khẩu>"}' | jq -r .preAuthToken)

TOKEN=$(curl -s -X POST "$BASE/auth/select-branch" -H "Authorization: Bearer $PRE" \
  -H "Content-Type: application/json" -d '{"branchCode":"A00"}' | jq -r .accessToken)

curl -s -G "$BASE/order/color-size/sync" -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "from=2026-10-15T00:00:00+07:00"

curl -s "$BASE/order/color-size/sync/ids" -H "Authorization: Bearer $TOKEN"
```

`--data-urlencode` tự mã hóa dấu `+`.

## 7. Lỗi

Mọi lỗi trả cùng một dạng:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Dữ liệu không hợp lệ.", "details": [{ "field": "from", "messages": ["..."] }] }, "traceId": "8f0c…" }
```

| HTTP | `code` | Khi nào | Xử lý |
|---|---|---|---|
| 401 | `INVALID_CREDENTIALS` | Sai tên đăng nhập hoặc mật khẩu | Kiểm cấu hình, không thử lại liên tục |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED` | Thiếu token, token hết hạn hoặc phiên bị thu hồi | Đăng nhập lại (mục 2) |
| 403 | `PERMISSION_DENIED` | Tài khoản thiếu quyền Xem hoặc Xuất file ở Phân bổ màu cỡ | Báo quản trị MES |
| 403 | `BRANCH_NOT_ALLOWED` | Tài khoản không được giao ĐVCS đã chọn | Chọn ĐVCS trong `branches` của bước 1 |
| 422 | `VALIDATION_FAILED` | Tham số sai, `to` không sau `from`, quá 10.000 dòng | Đọc `message`, `details`; sửa tham số hoặc chia nhỏ khoảng |
| 423 | `ACCOUNT_LOCKED` | Sai mật khẩu nhiều lần | Chờ hết thời gian trong `details.until` |
| 500 | `INTERNAL_ERROR` | Lỗi máy chủ | Thử lại sau; báo MES kèm `traceId` |

## 8. Giới hạn hiện tại

- **Đổi tên chuyền** trên MES không làm dòng thay đổi: `lineName` cập nhật ở lần dòng đó đổi tiếp. Dùng `lineCode` làm khóa của chuyền.
- **Thu hẹp phạm vi của tài khoản** (bớt ĐVCS, bớt chuyền): các dòng ngoài phạm vi mới không được báo xóa qua `sync`, nhưng sẽ không còn trong `sync/ids`.
- **Máy chủ đang chạy dữ liệu demo:** khi MES nạp lại dữ liệu demo, Id các dòng thay đổi. Lúc đó xóa dữ liệu đã chép và lấy lại từ đầu (mục 5 bước 1).
- **Kết nối HTTP không mã hóa:** chỉ dùng trong mạng nội bộ.
