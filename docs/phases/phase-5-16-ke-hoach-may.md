# Phase 5.16 – Kế hoạch may

Trạng thái: **In progress** (16/10/2026). Người dùng yêu cầu 15/10/2026, ảnh mẫu `docs/screens/ke-hoach-may.png`. Ngày 16/10 người dùng chốt Q1, Q4–Q8, thêm yêu cầu nhập tay Giá CM ở Thông tin đơn hàng, rồi chốt các câu còn lại theo đề xuất (Q14: vai trò mặc định nhập Giá CM là Kế hoạch, Toàn quyền sửa được; người dùng tự chỉnh vai trò sau). Làm thẳng trên `main` trong `MES` từ commit `24301de`; test trên bộ database `MES_*_T514`. Tiến độ ở `docs/update_docs/02-trang-thai.md`; mô tả theo code ghi ở `docs/update_docs/07-may.md` (module May) và `06-don-hang.md` (phần Giá CM).

## Mục tiêu

Dựng màn **Kế hoạch may** (`sewing.plan`, `/sewing/plan`, nhóm menu Quản trị xưởng may; tài nguyên đã có trong seed, hiện là trang giữ chỗ). Kế hoạch cập nhật và **chốt kế hoạch sản xuất theo ngày** cho từng chuyền, mã hàng, PO, làm căn cứ giao việc và nhập năng suất (các màn `sewing.cluster`, `sewing.output` sau này).

Đầu vào: Xếp chuyền (`MES_Order.ShipmentPlanLine` cùng kế hoạch cha `ShipmentPlan`); Giá CM nhập tay ở Thông tin đơn hàng.

Yêu cầu của người dùng (giữ nguyên ý):

1. Chọn thông tin: **Đơn vị phòng ban** (cây sơ đồ tổ chức), **Ngày** (nhập).
2. Chi tiết mỗi dòng:
   - **Chuyền sản xuất**: chỉ chuyền đã được xếp chuyền, theo điều kiện lọc; lưu mã, hiện tên.
   - **Mã hàng**: theo chuyền, lấy từ Xếp chuyền; lưu mã, hiện tên.
   - **PO/Buy date**: lấy từ Xếp chuyền, theo mã hàng.
   - **Giá CM**: lấy theo giá nhập tay ở Thông tin đơn hàng (16/10).
   - **Ngày vào chuyền** = Bắt đầu vào chuyền; **Ngày kết thúc** = Kết thúc ra chuyền (cả hai từ chi tiết dàn chuyền).
   - **Tổng kế hoạch** = Số lượng của dòng dàn chuyền.
   - **Đã giao** = lũy kế Kế hoạch ngày xưởng giao; **Còn lại** = Tổng kế hoạch − Đã giao.
   - **Kế hoạch theo linemap** (nhập), **Kế hoạch ngày xưởng giao** (nhập, lưu theo Ngày đã chọn).
   - **Doanh số kế hoạch** = Kế hoạch theo linemap × Giá CM.
   - **Từ giờ** mặc định 07:30, **Đến giờ** mặc định 17:10, chọn lại được.
3. **Cập nhật**: lưu. **Chốt**: khóa dữ liệu của ngày, không sửa được; sai thì **Hủy chốt** để sửa lại.
4. **Không được điều chỉnh dữ liệu của ngày hôm trước.**
5. (16/10) **Không được giao vượt số lượng kế hoạch**; phát sinh thêm thì phải sửa SL kế hoạch từ đầu (Xếp chuyền).
6. (16/10) Giá CM có nhiều trường hợp khác nhau: tạm thời cho **nhà máy nhập tay Giá CM ở Thông tin đơn hàng**; Kế hoạch may lấy theo giá đó.

## Người dùng đã chốt (16/10/2026)

| # | Nội dung | Chốt |
|---|---|---|
| Q1 | Kiểu mã chuyền | `NVARCHAR(20)` (chỉ ở bảng mới của phase này; xem "Mã chuyền `NVARCHAR(20)`") |
| Q4 | Ngày kết thúc | Kết thúc **ra** chuyền (`OutEndDate`) của chi tiết dàn chuyền |
| Q5 | Doanh số kế hoạch | Kế hoạch theo linemap × Giá CM (không theo ảnh); Giá CM lấy từ Thông tin đơn hàng |
| Q6 | Đã giao | Mọi ngày ≤ Ngày chọn, gồm Ngày chọn, cả ngày chưa chốt |
| Q7 | Còn lại âm | Chặn. Tổng KH ngày xưởng giao **mọi ngày** của một dòng dàn chuyền không vượt Tổng kế hoạch; muốn giao thêm thì tăng Số lượng ở Xếp chuyền trước |
| Q8 | "Công ty giao: $1" | Bỏ, ảnh bị dư |

## Đối chiếu yêu cầu với ảnh mẫu và code

| # | Yêu cầu | Ảnh mẫu, code hiện tại | Hướng làm |
|---|---|---|---|
| D1 | Mã chuyền | Mã bộ phận `MES_Hr.Department.Code VARCHAR(20)`, các bảng khác `LineCode VARCHAR(20)` | `NVARCHAR(20)` ở bảng mới (Q1 đã chốt) |
| D2 | Ngày lưu `datetime`; số lượng lưu `decimal` | Quy ước: ngày là `…Date` kiểu `DATE`; `ShipmentPlanLine.Qty` là `INT` | Đề xuất ngày `DATE`; số `DECIMAL(18,2)` nhưng chỉ nhận số nguyên ≥ 0 (Q2) |
| D3 | Chuyền → Mã hàng → PO chọn theo bậc | Ảnh không có nút Thêm dòng, lưới có sẵn 40 dòng | Đề xuất tự liệt kê + nút Thêm dòng (Q3) |
| D5 | Doanh số = linemap × Giá CM | Ảnh tính theo KH ngày xưởng giao; dòng Tổng cộng cả Giá CM | Theo yêu cầu; dòng Tổng để trống ô Giá CM |
| D8 | Lưu Giá CM, ngày, Tổng kế hoạch xuống DB | Xếp chuyền, Giá CM còn sửa được sau đó | Đề xuất lưu bản chụp, ngày đã chốt hiện bản chụp (Q11) |
| D9 | Giá CM nhập tay ở Thông tin đơn hàng, nhà máy nhập | `SalesOrder.CmPrice` đã có, MES tự quản (nạp BRAVO không ghi đè). Nhưng đơn chỉ sửa được ở **ĐVCS nguồn** (Chi nhánh FOB, `originBranch`); ĐVCS may đơn của ĐVCS khác bị khóa Sửa. Kế hoạch xuất hàng chụp Giá CM lúc lập (`ShipmentPlan.CmPrice`), sửa đơn sau đó không đổi bản chụp | Mở riêng ô Giá CM cho ĐVCS đang dùng đơn (Q14–Q16) |

## Thiết kế

### Giá CM nhập tay ở Thông tin đơn hàng (module Đơn hàng)

Đề xuất (Q14–Q16):

- **Ai sửa được:** ngoài ĐVCS nguồn như hiện nay, ĐVCS **có kế hoạch xuất hàng của đơn** (nhà máy đang may đơn đó) sửa được **riêng ô Giá CM**. Các ô khác, Xóa vẫn chỉ ở ĐVCS nguồn (giữ luật ADR 0013: ĐVCS khác không đổi được Nhà máy SX của đơn). Cùng cách với tỷ lệ cắt PO (`usedBy`), và Kế hoạch may chỉ có dòng của đơn đã có kế hoạch ở ĐVCS đó. `A00` không sửa. Quyền theo chính sách cột hiện có: `order.allocation` cột `cmPrice` mức Sửa được (mẫu: Kế hoạch).
- **Backend:** endpoint riêng `PUT /order/sales-orders/:id/cm-price` (`order.allocation:update`, cột `cmPrice` phải Sửa được), qua một repository của `SalesOrder` khai `usedBy = { table: 'ShipmentPlan', column: 'SalesOrderId' }` (điều kiện do `BaseRepository` sinh, không viết tay), chỉ ghi `CmPrice`. Không mở `usedBy` cho `SalesOrderRepository` đang dùng ở Sửa đơn (sẽ mở luôn Nhà máy SX, Xóa).
- **Đồng bộ sang kế hoạch (Q15):** cùng transaction, cập nhật `ShipmentPlan.CmPrice` của mọi kế hoạch xuất hàng của đơn (cùng database `MES_Order`), để Xếp chuyền và Kế hoạch may cùng một giá, `Revenue` của kế hoạch tính lại. Màn khác vẫn chỉ đọc kế hoạch, không đọc bảng đơn hàng (ADR 0006).
- **Giao diện Thông tin đơn hàng:** đơn của ĐVCS khác mà ĐVCS phiên có kế hoạch: nút Sửa mở popup, chỉ ô Giá CM nhập được, các ô khác chỉ xem, có dòng giải thích "Đơn của <ĐVCS nguồn>: ĐVCS này chỉ sửa Giá CM". Đơn ĐVCS khác chưa có kế hoạch ở đây: giữ khóa như cũ, lý do nêu rõ.
- **Nhật ký:** `SalesOrder` `UPDATE` có ghi "đổi Giá CM" nhưng không ghi giá trị (luật hiện có: bỏ cột nhạy cảm).
- Thay đổi luật ghi của đơn hàng dùng chung: ghi quyết định mới ở `13-quyet-dinh.md`, sửa `04-phan-quyen.md` mục 6.5, `06-don-hang.md` mục 3, 4.1; chạy `code-reviewer` vì chạm `BaseRepository`, phân quyền.

### Dòng của màn Kế hoạch may

Mỗi dòng là **một dòng dàn chuyền** (`ShipmentPlanLine`: chuyền + kế hoạch xuất hàng (mã hàng, PO/Buy date) + ngày vào chuyền + số lượng), như Kế hoạch chuẩn bị SX. Một chuyền may hai mã hàng thì hai dòng; một mã hàng tách hai đợt trên cùng chuyền thì hai dòng.

Theo đề xuất Q3, với Đơn vị phòng ban và Ngày đã chọn, màn liệt kê:
- dòng dàn chuyền của các chuyền thuộc đơn vị chọn (xưởng thì mọi chuyền dưới xưởng, chuyền thì một chuyền) có Ngày vào chuyền ≤ Ngày ≤ Ngày kết thúc;
- cộng dòng đã có số lưu ở Ngày đó (kể cả dòng đã ra khỏi khoảng ngày vì Xếp chuyền đổi ngày);
- cộng dòng người dùng tự thêm bằng **Thêm dòng**: Chuyền (chỉ chuyền có dòng dàn chuyền) → Mã hàng (theo chuyền) → PO/Buy date (theo mã hàng), cho mã vào chuyền sớm hoặc trễ hơn ngày đã xếp.

Ô **Danh sách mã hàng** (ảnh) lọc dòng đang hiện theo mã hàng.

### Mô hình dữ liệu

Database `MES_Sewing` (module May), migration `MES_Sewing/0003_sewing_day_plan.sql`:

| Bảng | Cột chính | Ràng buộc |
|---|---|---|
| `SewingDayPlan` (một chuyền, một ngày) | `Id`, `PlanDate DATE`, `LineCode NVARCHAR(20)`, `IsLocked BIT`, `LockedAt DATETIME2(3)`, `LockedBy INT`, `LockerName NVARCHAR(150)`, `BranchCode` + bộ kiểm toán | `UNIQUE (BranchCode, PlanDate, LineCode)`, `UNIQUE (Id, BranchCode)`; `CK` chốt thì phải có người chốt; `CK LEN(LineCode) > 0`; chỉ mục `(BranchCode, LineCode, PlanDate)` |
| `SewingDayPlanItem` (một dòng dàn chuyền trong ngày) | `Id`, `SewingDayPlanId`, `ShipmentPlanLineId INT`, `SourceCreatedAt DATETIME2(3)`, `ShipmentPlanId INT`, `StyleCode NVARCHAR(120)`, `ProductName NVARCHAR(150)`, `PoBuyDate NVARCHAR(40)`, `CmPrice DECIMAL(18,4) NULL`, `StartDate DATE`, `EndDate DATE`, `PlanQty DECIMAL(18,2)` (bản chụp Tổng kế hoạch), `LinemapQty DECIMAL(18,2) NULL`, `DayQty DECIMAL(18,2) NULL` (KH ngày xưởng giao), `StartTime TIME(0)`, `EndTime TIME(0)`, `BranchCode` + bộ kiểm toán | FK ghép `(SewingDayPlanId, BranchCode)`, xóa theo cha; `UNIQUE (SewingDayPlanId, ShipmentPlanLineId)`; `CK (EndTime > StartTime)`, số ≥ 0; chỉ mục `(BranchCode, ShipmentPlanLineId) INCLUDE (DayQty, SourceCreatedAt)` cho Đã giao |

- **Vì sao đầu bảng theo chuyền × ngày:** chốt theo ngày, nhưng người dùng chọn đơn vị lúc là xưởng, lúc là một chuyền. Khóa ở mức chuyền × ngày thì chọn đơn vị nào cũng thấy cùng trạng thái chốt, không có hai bản ghi chốt chồng nhau.
- `ShipmentPlanLineId` + `SourceCreatedAt`: như `SewingPrep`, vì `reset:demo`, `load:bravo` đánh số lại Id của `MES_Order` (cùng Id mà khác thời điểm tạo là dòng khác).
- Không lưu Đã giao, Còn lại, Doanh số: tính lúc đọc (như Lũy kế cắt, quyết định 13.3).
- Khóa ngầm (`softkeys.json`): `BranchCode` → `MES_Core.SysBranch.Code`; `LineCode` → `MES_Hr.Department.Code` (cùng ĐVCS); `ShipmentPlanLineId` → `MES_Order.ShipmentPlanLine.Id`; `LockedBy`, `CreatedBy` → `MES_Core.SysUser.Id`.

### Mã chuyền `NVARCHAR(20)` (Q1)

Chỉ áp cho hai bảng mới; không đổi `LineCode VARCHAR(20)` ở các bảng đã có (đổi kiểu cột có dữ liệu, có chỉ mục là migration rủi ro, ngoài phạm vi). Những chỗ phải giữ đúng:

- Mã bộ phận chỉ gồm `A–Z`, `0–9`, `-` (`CK_Department_Code`), nên chép sang `NVARCHAR` không mất ký tự; độ dài 20 bằng mã bộ phận, không cắt.
- Máy chủ chỉ nhận mã có trong `OrgService` (chuyền đang dùng của ĐVCS phiên, hoặc chuyền của dòng dàn chuyền), không nhận chuỗi tự do; độ dài kiểm ở DTO trước khi chạm DB.
- So khớp với `ShipmentPlanLine.LineCode` (`VARCHAR`) và `Department.Code` làm trong code (chuỗi JavaScript), không join chéo database. Lọc phạm vi chuyền của `BaseRepository` trên cột `NVARCHAR` không gây đổi kiểu ngầm làm mất chỉ mục (tham số chuỗi gửi dạng `NVARCHAR`).
- `check:softkeys` so cột `NVARCHAR` với `VARCHAR`: chạy thử trên bộ test, kể cả trường hợp mồ côi.
- Collation của `MES_Sewing` giống `MES_Hr` (kiểm khi tạo bộ test).

### Quy tắc tính

| Khái niệm | Quy tắc |
|---|---|
| Tổng kế hoạch | `ShipmentPlanLine.Qty` của dòng dàn chuyền |
| Đã giao (Q6) | Tổng `DayQty` của cùng dòng dàn chuyền (Id + `SourceCreatedAt`) ở mọi ngày ≤ Ngày chọn, gồm số đang gõ của Ngày chọn (giao diện tính lại ngay) |
| Còn lại | Tổng kế hoạch − Đã giao |
| Không giao vượt (Q7) | Tổng `DayQty` **mọi ngày** (kể cả ngày sau Ngày chọn đã lập trước) ≤ Tổng kế hoạch. Giao diện tô đỏ, khóa Cập nhật, nhắc "Tăng Số lượng ở Xếp chuyền trước"; máy chủ 422 |
| Doanh số kế hoạch (Q5) | Kế hoạch theo linemap × Giá CM; dòng Tổng cộng Doanh số, không cộng Giá CM |
| Giá CM | Giá nhập tay ở Thông tin đơn hàng, đọc qua `ShipmentPlan.CmPrice` (được cập nhật theo đơn, Q15) |
| Ngày kết thúc (Q4) | `ShipmentPlanLine.OutEndDate`; trống (dòng rất cũ) thì tính theo công thức ra chuyền của ĐVCS (`lineDates`) |
| Từ giờ, Đến giờ | Mặc định 07:30, 17:10 (Q13); Đến giờ phải sau Từ giờ |
| Hôm nay | Giờ Việt Nam (`todayVN`, như module May hiện có) |

### Bản chụp và nguồn đọc (Q11)

- **Ngày chưa chốt:** các cột lấy từ Xếp chuyền (Tổng kế hoạch, Giá CM, ngày, PO) hiện số **mới nhất**; Cập nhật ghi lại bản chụp.
- **Ngày đã chốt:** hiện **bản chụp lúc chốt**; Xếp chuyền, Giá CM đổi sau đó không làm đổi số đã chốt. Chốt chụp lại ngay lúc bấm.
- Module May đọc Xếp chuyền qua `ScheduleFeed` (đã được phép import, lint ranh giới không đổi): thêm `dayPlanSource(scope, { lineCodes, date })` trả Id dòng, `createdAt`, kế hoạch, chuyền, mã hàng, tên sản phẩm, PO/Buy date, Giá CM, Bắt đầu vào chuyền, Kết thúc ra chuyền, Số lượng. Đọc trực tiếp lúc mở màn, không chép sang `MES_Sewing` (màn chỉ xem một ngày, vài chục dòng).
- `ScheduleFeed` chỉ lọc ĐVCS; phạm vi người xem áp ở repository của module May (`BaseRepository`) như ADR 0009.

### Cập nhật, Chốt, Hủy chốt (máy chủ cưỡng chế)

- **Cập nhật** (`PUT /sewing/plan`): gửi `{ date, items: [{ lineId, lineCreatedAt, linemapQty, dayQty, startTime, endTime }] }`. Một transaction `MES_Sewing`, khóa ứng dụng theo (ĐVCS, dòng dàn chuyền) để hai người lưu hai ngày khác nhau không cùng vượt Tổng kế hoạch; tạo đầu bảng chuyền × ngày nếu chưa có. Kiểm (422 không ghi dòng nào):
  - Ngày không trước hôm nay (Q9); ngày sau hôm nay cho phép (lập trước).
  - Chuyền của dòng đã chốt ở ngày đó: 409 "Đã chốt, Hủy chốt trước khi sửa".
  - Dòng dàn chuyền còn tồn tại, thuộc ĐVCS phiên, trong phạm vi sửa của người lưu (chuyền); không còn thì 404 kèm `details.ids` (giao diện bỏ dòng đó, giữ phần còn lại).
  - Số nguyên ≥ 0; không giao vượt (Q7); Đến giờ sau Từ giờ.
  - Người khác vừa sửa cùng ô: 409, giao diện nạp số mới, giữ ô khác đang gõ (như Kế hoạch chuẩn bị SX).
- **Chốt** (`POST /sewing/plan/lock { date, dept }`): khóa mọi chuyền đang hiện của đơn vị chọn ở ngày đó. Còn thay đổi chưa lưu thì giao diện bắt Cập nhật trước. Chuyền chưa có bản ghi thì tạo đầu bảng với các dòng chụp từ Xếp chuyền, ô nhập trống. Ghi Người chốt, lúc chốt.
- **Hủy chốt** (`POST /sewing/plan/unlock { date, dept }`): mở khóa các chuyền đang chốt trong đơn vị chọn. Không áp cho ngày trước hôm nay (Q9).
- Nhật ký `SysAuditLog`, entity `SewingDayPlan`: `UPDATE` (ô cũ → mới), `LOCK`, `UNLOCK`.
- Phiên `A00`: chỉ xem (`AGGREGATE_READ_ONLY`).

### API `/sewing/plan`

| Phương thức, đường dẫn | Quyền | Nội dung |
|---|---|---|
| `GET /sewing/plan?date=&dept=&style=` | `view` | Dòng của ngày theo đơn vị (mã bộ phận, máy chủ tự mở rộng ra các chuyền con trong ĐVCS phiên), trạng thái chốt từng chuyền, `canEdit`, `today` |
| `GET /sewing/plan/options/lines?dept=` | `view` | Chuyền có dòng dàn chuyền (Thêm dòng) |
| `GET /sewing/plan/options/styles?line=` | `view` | Mã hàng của chuyền |
| `GET /sewing/plan/options/pos?line=&style=` | `view` | PO/Buy date (kèm Id dòng dàn chuyền) |
| `PUT /sewing/plan` | `update` | Cập nhật |
| `POST /sewing/plan/lock`, `/unlock` | `update` (Q10) | Chốt, Hủy chốt |

### Phân quyền và chính sách cột

- `sewing.plan`: bảng nguồn `SewingDayPlan`, `ScopeType = BRANCH`, chiều `FACTORY → BranchCode`, `LINE → LineCode` (Trưởng chuyền chỉ thấy chuyền mình). Bảng con `SewingDayPlanItem` theo dòng cha (`ChildRepository`).
- Ma trận mẫu hiện tại `['V','VE','VCUE','V','','']` (Quản trị Xem; Giám đốc Xem, Xuất; Kế hoạch Xem, Thêm, Sửa, Xuất; Trưởng chuyền Xem): Kế hoạch đã có Sửa nên **không cần migration cấp quyền** cho máy đã cài. Cập nhật, Chốt, Hủy chốt dùng `update` (như Xác nhận cấp BTP, quyết định 13.10), chưa tách người chốt (Q10).
- Cột đăng ký: `lineCode`, `styleCode`, `poBuyDate`, `cmPrice` (nhạy cảm, như Giá CM ở Xếp chuyền), `startDate`, `endDate`, `planQty`, `deliveredQty`, `remainQty`, `linemapQty`, `dayQty`, `planRevenue` (nhạy cảm), `startTime`, `endTime`. `remainQty` che khi `planQty` hoặc `deliveredQty` không xem được; `planRevenue` che khi `cmPrice` hoặc `linemapQty` không xem được. Body lưu dùng khóa `linemapQty`, `dayQty`, `startTime`, `endTime` (bị cưỡng chế theo chính sách cột). Thông báo vượt Tổng kế hoạch không nêu số khi người lưu không xem được `planQty`.

### Ảnh hưởng Xếp chuyền

Theo Q7, Tổng kế hoạch là trần. Điểm đăng ký như `LineSupplyGuards` (Đơn hàng không import module May): module May đăng ký hàm tra lúc khởi động; Xếp chuyền **chặn 409** khi:
- giảm Số lượng của dòng dàn chuyền xuống dưới tổng KH ngày xưởng giao mọi ngày của dòng đó (bỏ dòng = giảm về 0), nhắc giảm ở Kế hoạch may trước;
- đổi chuyền dòng đã có số ở Kế hoạch may (Q12).

Đổi ngày vẫn cho: ngày đã chốt giữ bản chụp.

### Giao diện (skill `frontend-design`, bám ảnh mẫu)

- `features/sewing/SewingPlanPage.tsx`, `sewingPlanRules.ts` (hàm thuần: Đã giao, Còn lại, vượt kế hoạch, Doanh số, dòng Tổng, kiểm giờ), mở rộng `features/sewing/api.ts`; đăng ký `/sewing/plan` ở `routes/registry.tsx` (bỏ trang giữ chỗ).
- Khung **Chọn thông tin**: Đơn vị phòng ban (`TreeSelect` cây phòng ban có chuyền của ĐVCS phiên, dựng từ `/me/lines` như `lineOptions`; chọn được nút cha hoặc chuyền), Ngày (`DateField`, mặc định hôm nay), nút **Chốt**, **Hủy chốt** bên phải; nhãn trạng thái "Đã chốt lúc … bởi …" (chốt một phần chuyền thì nêu số chuyền đã chốt). Không có "Công ty giao" (Q8).
- Khung **Danh sách mã hàng**: ô lọc mã hàng; lưới `SheetGrid` theo đúng thứ tự cột ảnh: Tổ SX · Mã hàng · PO/buydate · Giá CM · Ngày vào chuyền · Ngày kết thúc · Tổng kế hoạch · Đã giao · Còn lại · Kế hoạch theo linemap · Kế hoạch ngày xưởng giao · Doanh số kế hoạch · Từ giờ · Đến giờ. Chỉ 4 cột nhập được (linemap, ngày xưởng giao, Từ giờ, Đến giờ), dán được từ Excel. Dòng **Tổng (n)** nền xanh nhạt như ảnh, ô Giá CM để trống. Dòng của chuyền đã chốt tô xám, khóa. Giá CM trống (đơn chưa nhập) hiện "–", Doanh số trống, gợi ý nhập ở Thông tin đơn hàng.
- Nút **Cập nhật** dưới lưới (khóa khi chưa đổi gì hoặc có ô lỗi), **Thêm dòng** (Q3).
- Ngày trước hôm nay, `A00`, không có quyền Sửa: chỉ xem, nút khóa kèm lý do (`ActionButton`).
- Đổi Ngày hoặc Đơn vị khi còn ô chưa lưu: hỏi bỏ hay ở lại; rời màn khi còn nháp: `useLeaveGuard`.
- Xem trên Chrome 1366×768 và 390px, so cạnh ảnh mẫu.

## Task

| Task | Nội dung | Tiêu chí xong |
|---|---|---|
| 5.16.0 | `main` sạch (5.12.1, 5.12.2, 5.14 Q7, 5.15 đang chưa commit: người dùng quyết); dùng lại bộ database test `MES_*_T514`; ghi quyết định mục 14 vào `13-quyet-dinh.md`: 14.1 Kế hoạch may theo dòng dàn chuyền, đầu bảng chuyền × ngày, bản chụp khi chốt, khóa ngày đã qua; 14.2 ĐVCS có kế hoạch của đơn sửa được Giá CM (khác luật chỉ ĐVCS nguồn của ADR 0013), Giá CM của kế hoạch theo đơn; 14.3 không giao vượt Tổng kế hoạch | Lint, test không cần database qua |
| 5.16.1 | Đơn hàng, Giá CM: repository `usedBy`, `PUT /order/sales-orders/:id/cm-price`, cập nhật `ShipmentPlan.CmPrice`; popup Sửa của Thông tin đơn hàng chỉ mở ô Giá CM cho đơn ĐVCS khác | Test: ĐVCS nguồn, ĐVCS có kế hoạch sửa được; ĐVCS không có kế hoạch 404; `A00` 403; cột `cmPrice` Chỉ đọc 403; các trường khác không đổi; kế hoạch, Doanh số Xếp chuyền theo giá mới; nạp BRAVO giữ giá. `code-reviewer` |
| 5.16.2 | Migration `MES_Sewing/0003_sewing_day_plan.sql`, `sewing.types.ts`, `softkeys.json`; seed `sewing.plan` (bảng nguồn, phạm vi, cột, chính sách cột nhạy cảm) | `npm run migrate`, `check:softkeys` qua trên `T514` (cả bản ghi mồ côi `NVARCHAR` ↔ `VARCHAR`) |
| 5.16.3 | Đơn hàng: `ScheduleFeed.dayPlanSource`; điểm đăng ký chặn ở Xếp chuyền | Test: lọc ĐVCS, `A00`, Kết thúc ra chuyền trống; Xếp chuyền giảm SL dưới tổng đã giao, bỏ dòng, đổi chuyền dòng có số: 409 |
| 5.16.4 | Backend May: `sewing-plan.service.ts`, repository, DTO, controller; Cập nhật, Chốt, Hủy chốt, nhật ký | Test: phân quyền, `BranchCode`, `A00` chỉ đọc, ĐVCS khác, Trưởng chuyền chỉ chuyền mình; ngày trước hôm nay 422; sửa ngày đã chốt 409; Hủy chốt rồi sửa; Đã giao cộng các ngày; vượt Tổng kế hoạch (kể cả do ngày sau đã lập, hai người lưu đồng thời) 422; giờ sai; Id dàn chuyền dùng lại sau nạp lại; chính sách cột |
| 5.16.5 | Frontend: `SewingPlanPage.tsx`, `sewingPlanRules.ts`, `api.ts`, route; skill `frontend-design` | Test frontend: Đã giao, Còn lại, vượt kế hoạch, Doanh số khi gõ, dòng Tổng, khóa theo chốt và ngày cũ, hỏi khi đổi ngày còn nháp; xem trên Chrome hai khung, so ảnh |
| 5.16.6 | Script: `reset:demo`, `load:bravo` xóa dữ liệu Kế hoạch may (`backend/scripts/sewing-data.ts`); tài liệu `07-may.md` (mục mới), `06-don-hang.md` (Giá CM), `01`, `03`, `04`, `11`, `12`, `13`, `02`; `code-reviewer`, báo cáo `docs/review/phase-5-16.md` | Không còn CRITICAL/HIGH; lint, test, build qua |

Ước lượng: khoảng 6–8 ngày làm việc.

## Khác bản thiết kế ở trên khi làm

- Lần đầu lập kế hoạch cho một chuyền trong ngày (Cập nhật, Chốt phải tạo bản ghi chuyền × ngày) cần thêm quyền Thêm (Kế hoạch có sẵn trong ma trận mẫu), như lệnh cấp BTP; sửa bản ghi đã có chỉ cần Sửa.
- Nền tảng thêm `BaseRepository.allows` (kiểm một giá trị chưa có dòng có nằm trong phạm vi không) để lọc dòng dàn chuyền chưa lập theo phạm vi chuyền mà module không tự viết điều kiện.
- `LineInfo` (`/me/lines`) thêm `ancestors` (bộ phận cha từ gốc cây) để dựng cây Đơn vị phòng ban; `TreeSelect` chỉ chọn lá nên mỗi nhóm có dòng "Cả <bộ phận>".
- Khóa ứng dụng theo ĐVCS (một khóa cho mọi lần Cập nhật, Chốt của ĐVCS), không theo từng dòng dàn chuyền.
- Phát hiện người khác vừa ghi theo phiên bản của bản ghi chuyền × ngày (`versions`), không theo từng ô.
- `PUT /sewing/plan` trả `{ saved }`, giao diện tải lại lưới; Chốt, Hủy chốt nhận `dept` (máy chủ tự mở rộng ra chuyền) thay cho danh sách mã chuyền.
- `SheetGrid` thêm kiểu ô giờ `sheetTime`; dòng Tổng là một dòng khóa ở cuối lưới.
- Bỏ dòng dàn chuyền ở Xếp chuyền: chặn khi đã có số (linemap hoặc ngày xưởng giao > 0), không chỉ khi giảm dưới Đã giao.

## Việc trên máy chủ (khi deploy)

`npm run migrate` chạy `MES_Sewing/0003`, `0004` (bảng, chỉ mục mới, không có dữ liệu; chạy được khi bản cũ còn chạy) và seed dữ liệu hệ thống (bảng nguồn, cột của `sewing.plan`); deploy code. Không có migration `MES_Core`, `MES_Order`. Sau khi deploy: nhà máy nhập Giá CM ở Thông tin đơn hàng cho các đơn đang may.

## Ngoài phạm vi

- Xuất file (ảnh không có nút; ma trận đã có quyền Xuất, làm sau nếu cần).
- Nhập năng suất theo giờ, giao việc cho cụm (`sewing.output`, `sewing.cluster`): màn này chỉ là căn cứ.
- Ca qua đêm, nhiều ca một ngày; tính giờ làm theo danh mục Ca làm việc.
- Đổi `LineCode` của các bảng đã có sang `NVARCHAR`.
- Giá CM theo nhiều trường hợp (theo nhà máy, theo PO, theo thời điểm): chờ quy tắc của BA; phase này chỉ một ô nhập tay.

## Câu hỏi (người dùng chốt theo đề xuất 16/10/2026)

Q14 thêm: vai trò mặc định nhập Giá CM là Kế hoạch (chính sách cột `order.allocation.cmPrice` mức Sửa được, đã có trong seed), Toàn quyền sửa được; người dùng tự chỉnh vai trò sau.


| # | Câu hỏi | Đề xuất |
|---|---|---|
| Q2 | Ngày vào chuyền, Ngày kết thúc lưu `DATE` (không cần giờ) thay `datetime`? Số lượng lưu `DECIMAL(18,2)` theo yêu cầu nhưng chỉ cho nhập số nguyên (đơn vị là sản phẩm)? | Có cả hai |
| Q3 | Dòng của màn: (a) tự liệt kê dòng dàn chuyền có Ngày nằm trong [Ngày vào chuyền, Ngày kết thúc], cộng nút Thêm dòng chọn Chuyền → Mã hàng → PO; (b) chỉ tự liệt kê; (c) chỉ thêm tay từng dòng | (a) |
| Q9 | "Không điều chỉnh ngày hôm trước": ngày trước hôm nay (giờ Việt Nam) chỉ xem, không Cập nhật, không Chốt, không Hủy chốt, kể cả Toàn quyền? Ngày tương lai được lập trước? | Có; ngày tương lai được lập |
| Q10 | Chốt theo từng chuyền × ngày cho mọi chuyền đang hiện của đơn vị chọn (chọn xưởng thì chốt cả xưởng)? Ai được Cập nhật, ai được Chốt, Hủy chốt: chung quyền Sửa của Kế hoạch, hay tách người chốt? | Chốt theo chuyền × ngày; chung quyền Sửa (Kế hoạch) |
| Q11 | Lưu bản chụp Tổng kế hoạch, Giá CM, ngày, PO; ngày đã chốt hiện bản chụp, ngày chưa chốt hiện số mới nhất? | Có |
| Q12 | Xếp chuyền đổi chuyền một dòng đã có số Kế hoạch may: chặn (409) hay cho (số đã nhập đi theo dòng sang chuyền mới)? | Chặn |
| Q13 | Giờ mặc định 07:30 – 17:10 dùng chung mọi ĐVCS, cố định trong code; hay lấy từ danh mục Ca làm việc? | Cố định tạm; làm theo ca khi có màn năng suất |
| Q14 | ĐVCS nào nhập được Giá CM của đơn: (a) ĐVCS nguồn + ĐVCS có kế hoạch xuất hàng của đơn; (b) ĐVCS nguồn + ĐVCS có Nhà máy SX của đơn (nhập được trước khi lập kế hoạch) | (a): cùng luật với tỷ lệ cắt PO, đủ cho Kế hoạch may |
| Q15 | Sửa Giá CM ở đơn thì cập nhật luôn Giá CM của các kế hoạch xuất hàng của đơn (Xếp chuyền đổi Doanh số theo)? Không thì Xếp chuyền giữ giá lúc lập, Kế hoạch may đọc giá ở đơn, hai màn lệch nhau | Có, cập nhật theo |
| Q16 | Một đơn may ở hai ĐVCS: dùng chung **một** Giá CM (ĐVCS nào sửa cũng đổi cho cả hai), hay mỗi ĐVCS một giá riêng (cần bảng mới, ô Giá CM ở Thông tin đơn hàng hiện giá của ĐVCS phiên)? | Một giá chung (đúng một ô như yêu cầu); làm giá riêng khi BA có quy tắc |
