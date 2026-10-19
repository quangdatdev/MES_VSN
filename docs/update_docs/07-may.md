# Module May: Kế hoạch chuẩn bị SX, Kế hoạch may

File này mô tả module May đang có trong code: màn Kế hoạch chuẩn bị SX (phần đầu), màn Kế hoạch may (phase 5.16, phần cuối file), danh mục Cấu hình chuẩn bị SX, cách dòng kế hoạch được chép từ dàn chuyền của module Đơn hàng, API `/sewing/*` và database `MES_Sewing`.
Đọc khi sửa màn này, sửa danh mục bước chuẩn bị, hoặc đổi cấu trúc dàn chuyền bên module Đơn hàng (vì module May chép từ đó).
Luật chung của `BaseRepository`, chính sách cột: [Phân quyền](04-phan-quyen.md). `SheetGrid`, `DataGrid`, `TreeSelect`, lọc theo cột: [Giao diện](10-giao-dien.md). Dàn chuyền, Xếp chuyền: [Đơn hàng](06-don-hang.md).

## Tổng quan

Màn Kế hoạch chuẩn bị SX theo dõi các bước chuẩn bị sản xuất (họp rủi ro, mẫu PP, nguyên phụ liệu, thiết kế chuyền…) trước ngày một mã hàng vào chuyền. Mỗi dòng của màn là **một dòng dàn chuyền** (mã hàng + chuyền + ngày vào chuyền) lập ở Xếp chuyền; mỗi bước chuẩn bị là một cặp cột KH (kế hoạch) và TH (thực hiện).

| Màn | Đường dẫn | Quyền | Frontend | Backend |
|---|---|---|---|---|
| Kế hoạch chuẩn bị SX | `/order/prep` (nhóm menu Quản trị đơn hàng) | `order.prep:view`, `:update`, `:export` | `frontend/src/features/sewing/PrepPlanPage.tsx`, `PrepSummary.tsx`, `WeekStrip.tsx`, `api.ts` | `backend/src/modules/sewing/sewing.controller.ts` (`PrepController`), `prep.service.ts`, `sewing.repositories.ts` |
| Cấu hình chuẩn bị SX (danh mục bước) | `/admin/catalogs?c=PREP_STEP` (Quản trị › Danh mục hệ thống) | `admin.catalog:view`, `:create`, `:update` | `frontend/src/features/admin/PrepStepsPane.tsx` (gắn trong `CatalogsPage.tsx`) | `sewing.controller.ts` (`PrepStepController`), `prep-step.service.ts` |

**Màn thuộc nhóm Đơn hàng, code và dữ liệu thuộc module May** (ADR 0009 mục 6):
- Menu nhóm theo tiền tố mã tài nguyên, nên tài nguyên là `order.prep` và đường dẫn `/order/prep`. Migration `backend/migrations/MES_Core/0004_move_prep_to_order.sql` đổi mã cũ `sewing.prep` sang `order.prep` tại chỗ (giữ Id, nên quyền và chính sách cột đã cấp không mất).
- Code backend ở `backend/src/modules/sewing`, API giữ tiền tố `/api/v1/sewing/prep`, dữ liệu ở database `MES_Sewing`.
- Đường dẫn cũ `/sewing/prep` tự chuyển sang `/order/prep` (`frontend/src/routes/FallbackRoute.tsx`, bảng `MOVED`).

**Các file khác của module:**

| File | Vai trò |
|---|---|
| `backend/src/modules/sewing/sewing.module.ts` | Khai module; import `OrderModule` để dùng `ScheduleFeed` |
| `backend/src/modules/sewing/sewing.db.ts` | Kết nối riêng tới `MES_Sewing` (tên lấy từ `DB_SEWING_NAME`, mặc định `MES_Sewing`) |
| `backend/src/modules/sewing/sewing.types.ts` | Kiểu Kysely của 5 bảng (`PrepStep`, `SewingPrep`, `SewingPrepStep`, `SewingDayPlan`, `SewingDayPlanItem`) |
| `backend/src/modules/sewing/sewing.dto.ts` | DTO, bộ kiểm đầu vào, mã trạng thái `PREP_STATUSES` |
| `backend/scripts/sewing-data.ts` | `hasSewingDb`, `clearSewingPrep` cho các script seed, reset |
| `frontend/src/routes/registry.tsx` | Đăng ký `/order/prep` → `features/sewing/PrepPlanPage` |

**Ranh giới module** (lint ở `backend/eslint.config.mjs`): module May chỉ được import `OrderModule` và `schedule-feed.service` của module Đơn hàng; module Đơn hàng không được import module May. Module May không đọc bảng của `MES_Order`.

## Quy tắc tính

| Khái niệm | Quy tắc | Code |
|---|---|---|
| Số ngày KH của một bước, một dòng | Số chỉnh riêng của dòng (`SewingPrepStep.PlanDays`) nếu có, không thì số mặc định của danh mục (`PrepStep.PlanDays`). Gửi số bằng số mặc định thì không lưu là chỉnh riêng, để đổi danh mục sau này dòng vẫn theo | `stepValue`, `PrepService.update` |
| KH (ngày kế hoạch) | Ngày vào chuyền − số ngày KH, tính theo **ngày lịch** (chưa trừ Chủ nhật, ngày lễ). Tính lúc đọc, không lưu sẵn: đổi danh mục hay đổi ngày vào chuyền ở Xếp chuyền thì KH đổi ngay | `stepValue`, các biểu thức SQL trong `SewingPrepRepository` |
| TH (ngày thực hiện) | Ngày làm xong, nhập tay. Không được sau hôm nay | `PrepService.update`, `saveDone` |
| Hôm nay | Theo giờ Việt Nam (`Asia/Ho_Chi_Minh`), vì máy chủ có thể đặt giờ UTC. API trả `today` để màn hình dùng cùng mốc | `todayVN` |
| Trạng thái một bước (`state`) | `DONE`: có TH, TH ≤ KH; `DONE_LATE`: TH > KH; `OVERDUE`: chưa có TH, hôm nay đã qua KH; `PENDING`: còn lại | `stepValue` |
| Trạng thái vào chuyền của dòng (`statusCode`) | Xem bảng dưới. Chỉ xét các bước **đang dùng** | `prepStatus`, `SewingPrepRepository.statusFilter` |

| `statusCode` | Nhãn | Điều kiện |
|---|---|---|
| `NOT_DUE` | Chưa đến ngày V/C | Ngày vào chuyền sau hôm nay (nhập đủ TH hay chưa cũng vậy) |
| `NOT_READY` | Chưa đủ đk V/C | Đã đến ngày vào chuyền, còn bước đang dùng chưa có TH |
| `READY` | Đủ điều kiện V/C | Đã đến ngày vào chuyền, mọi bước đang dùng có TH |

Hàm ở service (`prepStatus`) và điều kiện SQL (`statusFilter`) phải giữ cùng quy tắc: danh sách tính trạng thái bằng hàm, còn lọc theo trạng thái chạy trong SQL để phân trang đúng.

**Bước đã ngừng dùng** (`PrepStep.IsActive = 0`): không còn là cột trên lưới, không tính vào trạng thái, không có trong file xuất. Ngày đã nhập vẫn giữ; popup chi tiết của dòng vẫn hiện bước đó (kèm chữ "đã ngừng dùng") nếu dòng còn dữ liệu của bước.

## Chép dòng từ dàn chuyền (ADR 0009)

Bảng `SewingPrep` là **bản chép** của các dòng dàn chuyền (`MES_Order.ShipmentPlanLine` cùng kế hoạch cha), cộng các cột nhập tay. Chép để lọc nhà máy, chuyền, phân trang, lọc trạng thái chạy ngay trong `MES_Sewing` qua `BaseRepository`.

**Nguồn:** `ScheduleFeed` (`backend/src/modules/order/schedule-feed.service.ts`), service công khai của module Đơn hàng:
- `linesOf(scope)`: mọi dòng dàn chuyền của nhà máy trong phiên (`A00`: mọi nhà máy), gồm Id, kế hoạch, số kế hoạch, khách hàng, mã hàng, tên sản phẩm, chuyền, số lượng, ngày vào chuyền, `BranchCode`, thời điểm tạo.
- `versionOf(scope)`: dấu phiên bản `"<số dòng>:<checksum>"` (`COUNT(*)` và `CHECKSUM_AGG(BINARY_CHECKSUM(...))` các cột được chép, phân biệt hoa thường).
- Mã nhà máy lấy từ `Scope` do server cấp, không nhận từ client. Việc chép không theo quyền người xem; người dùng chỉ thấy dữ liệu qua `SewingPrepRepository`.

**Khi nào chép:** trước khi đọc ở `GET /sewing/prep`, `GET /sewing/prep/summary`, `GET /sewing/prep/export` (`PrepService.sync`). Các endpoint khác (`values`, `:id`, các lệnh ghi) không chép.

**Quy trình** (`PrepService.syncOnce`, `SewingPrepRepository.syncFromSchedule`):
1. Khóa theo nhà máy của phiên (`'*'` cho `A00`). Request đến sau trong lúc đang chép thì chờ lần đang chạy (map `syncing`), không chép lần hai.
2. Đọc dấu phiên bản. Dấu bằng dấu đã chép lần trước (giữ trong bộ nhớ tiến trình, map `synced`) **và** số dòng bản chép bằng số dòng nguồn thì bỏ qua. Số dòng lệch (bản chép bị xóa ngoài luồng chép) thì chép lại. Khởi động lại máy chủ thì chép lại một lần.
3. Trong một transaction của `MES_Sewing`: giữ khóa ứng dụng `sp_getapplock 'MES_Sewing.SewingPrep.sync'` (Exclusive, chờ tối đa 15 giây), rồi mới đọc nguồn, để không dùng ảnh cũ. Khóa ứng dụng thay cho khóa phạm vi trên bảng, nên phiên `A00` và phiên nhà máy không deadlock.
4. Đối chiếu từng dòng nguồn với bản chép theo `ShipmentPlanLineId`. Hai dòng là "cùng một dòng nguồn" khi trùng Id **và** trùng `BranchCode`, `ShipmentPlanId`, `SourceCreatedAt` (sai lệch dưới 5 ms vẫn coi là trùng, vì driver gửi ngày giờ theo kiểu `datetime` cũ). Lý do: `reset:demo`, `load:bravo` đánh số lại Id của `MES_Order`; cùng Id mà khác dòng thì ngày đã nhập không được gắn sang mã hàng khác.
   - Có và cùng nguồn: cập nhật các cột chép nếu khác (`SourceSyncedAt` = lúc chép).
   - Không có, hoặc Id đã thuộc dòng khác: thêm dòng mới; dòng cũ cùng Id (kể cả ở bản chép của nhà máy khác) bị xóa.
   - Bản chép không còn nguồn: xóa, ngày theo bước xóa theo (`ON DELETE CASCADE`). Dòng bị xóa có dữ liệu người dùng đã nhập thì log máy chủ ghi cảnh báo kèm Id.
5. Chốt an toàn: nguồn trả rỗng mà bản chép còn dòng (nhầm database, đang nạp lại) thì không xóa gì và không lưu dấu; nguồn lẫn dòng của nhà máy khác khi đang chép một nhà máy thì báo lỗi, không ghi gì.
6. Chép lỗi (hết thời gian chờ khóa, mất kết nối `MES_Order`): ghi log `SewingPrepSync`, bỏ dấu đã lưu, **vẫn trả bản chép hiện có**; lần mở màn sau chép lại.

**Hệ quả cho người dùng:** Xếp chuyền giữ nguyên Id dòng khi sửa, nên đổi số lượng, ngày, chuyền không làm mất ngày đã nhập. Bỏ dòng dàn chuyền thì dòng chuẩn bị cùng ngày đã nhập mất ở lần mở màn sau. Máy chủ chạy nhiều tiến trình thì mỗi tiến trình tự chép một lần.

## Màn Kế hoạch chuẩn bị SX

### Hai chế độ lưới

| Điều kiện | Lưới | Hành vi |
|---|---|---|
| Có `order.prep:update`, phiên không phải `A00`, cột "Các bước" (`steps`) ở mức Sửa được | Lưới nhập `SheetGrid` | Gõ, dán ngày TH vào ô; bấm Lưu thay đổi mới ghi. Thứ tự dòng luôn theo mặc định |
| Còn lại (chỉ xem, phiên `A00`, hoặc cột các bước Chỉ đọc, Che) | Lưới xem `DataGrid` | Bấm tiêu đề để sắp xếp. Cột các bước bị Che thì gộp thành một cột `***` |

Cả hai lưới: 100 dòng mỗi trang (`Pager`), cột số thứ tự do lưới đánh, tiêu đề **hai tầng** (tên bước ở trên, KH và TH ở dưới), lọc theo cột trên tiêu đề (ADR 0011), bấm đúp một dòng để mở popup chi tiết.

**Thứ tự cột:** ĐVCS · Tổ SX · Mã hàng · Loại mã · Số lượng chốt UD · HS Ưu đãi VC · Ngày vào chuyền · Trạng thái · (KH, TH của từng bước đang dùng, theo `SortOrder` của danh mục) · Ngày tạo. Cột bị Ẩn theo chính sách cột thì không có. Tổ SX hiện tên chuyền do máy chủ trả (`lineName`: tra trên mọi ĐVCS, kể cả chuyền đã giải thể; mã không còn là chuyền (bộ phận đã bỏ tích, chuyền cũ) thì "<mã> (chuyền cũ)"; chưa có thì tra `/me/lines`), rê chuột thấy mã. Chuyền may là bộ phận tích "Xưởng sản xuất": [Nhân sự](08-nhan-su.md). Ngày tạo là thời điểm tạo dòng dàn chuyền gốc (`SourceCreatedAt`).

**Thứ tự dòng mặc định:** ĐVCS → Tổ SX → Mã hàng → Ngày vào chuyền, để các mã của cùng một tổ nằm liền nhau như file mẫu (khác quy ước "mới tạo lên trước" của lưới xem).

**Tô màu:**

| Ô | Khi nào | Cách hiện |
|---|---|---|
| Trạng thái | `NOT_READY` | Nền đỏ đậm, chữ trắng (`prep-alarm`) |
| Trạng thái | `READY` | Nền xanh nhạt (`prep-ready`) |
| TH | TH sau ngày KH (làm trễ) | Nền đỏ nhạt, góc tam giác, kèm chữ ẩn "Xong sau ngày KH" cho trình đọc màn hình (`prep-late`, `.prep-th[data-late]`) |
| TH (lưới nhập) | Ngày sau hôm nay | Viền đỏ báo lỗi; nút Lưu bị khóa |
| TH (lưới nhập) | Vừa nhập, chưa lưu | Tô màu `prep-dirty` |
| KH | Số ngày KH chỉnh riêng cho dòng | Dấu `*` sau ngày; rê chuột thấy số ngày |

Chú thích màu nằm cạnh thanh phân trang (`Legend`). Ô KH quá hạn không tô màu: màu đỏ chỉ dành cho Chưa đủ đk V/C và ô TH làm trễ. Màu khai ở `frontend/src/theme/global.css` (biến `--prep-*`).

### Dải lọc

Mọi bộ lọc ghi lên URL (gửi link là giữ đúng cách xem). Ô của cột người dùng không được xem nguyên giá trị (Ẩn, Che) thì không hiện, và máy chủ cũng bỏ qua tham số đó.

| Ô | Tham số API | Ghi chú |
|---|---|---|
| Từ ngày, Đến ngày | `startFrom`, `startTo` | Lọc theo Ngày vào chuyền. Mặc định từ 01/01 năm nay (thấy cả việc tồn) đến Chủ nhật của tuần thứ 3 sau tuần này. Xóa trắng có chủ ý thì URL ghi `all` để phân biệt với "chưa chọn" |
| Đơn vị | `branch` | Chỉ hiện ở phiên `A00`. Lựa chọn là các ĐVCS đang có dòng trong phạm vi xem được (lấy qua `/values?field=branchCode`), không phải ĐVCS tài khoản được gán. Lọc trong phạm vi đã xem được, không đổi ĐVCS của phiên |
| Tổ SX | `line` | `TreeSelect` gom theo bộ phận cha của chuyền, nguồn `/me/lines` (tìm theo tên, mã tổ hoặc tên bộ phận). So bằng |
| Mã hàng | `style` | Gõ một phần mã, chờ ngừng gõ rồi mới gọi. So `LIKE` |
| Loại mã | `styleType` | Lựa chọn là các giá trị đang có theo các bộ lọc khác, tải khi mở ô. So bằng |
| Trạng thái | `status` | `NOT_READY`, `NOT_DUE`, `READY` |
| Xóa lọc | | Bỏ mọi bộ lọc, bỏ chọn tuần, bỏ lọc theo cột |

Máy chủ còn nhận `customer` (khách hàng, `LIKE`) và `q` (tìm trong mã hàng, khách hàng, tên sản phẩm, số kế hoạch) nhưng màn hiện không có ô cho hai tham số này.

### Thanh tuần

`WeekStrip.tsx`: các nút T1…T53 theo tuần ISO (thứ Hai – Chủ nhật), có nút đổi năm (2000–2100). Tuần trong khoảng Từ ngày – Đến ngày tô xanh nhạt, tuần đang chọn nền cam, tuần này gạch chân.

- **Chọn tuần W** (tham số `week`, một ngày bất kỳ trong tuần): hiện các dòng có bước đang dùng **đến hạn KH tới hết Chủ nhật của W mà chưa có TH** (kể cả việc tồn từ các tuần trước), cộng các dòng **vào chuyền trong W** (`SewingPrepRepository.weekFilter`). Điều kiện tuần cộng dồn với khoảng ngày và các bộ lọc khác (AND).
- Mặc định (URL chưa có `week`): tuần này. Bấm lại tuần đang chọn thì bỏ chọn, xem cả khoảng ngày (URL ghi `week=all`).
- Chọn tuần nằm ngoài khoảng ngày thì khoảng ngày tự nới ra tới tuần đó.
- Không xem được Ngày vào chuyền thì không có thanh tuần (máy chủ cũng bỏ `week`). Không xem được các bước thì máy chủ chỉ lọc dòng vào chuyền trong tuần, vì điều kiện "còn bước chưa có TH" làm lộ ngày đã nhập.

### Dải 4 số tổng hợp

`PrepSummary.tsx` gọi `GET /sewing/prep/summary` song song với lưới, theo **đúng bộ lọc của lưới trừ ô Trạng thái** (đang lọc một trạng thái thì các số không về 0), không theo trang. Mọi số **đếm theo mã hàng** (cặp ĐVCS + mã hàng; một mã may trên nhiều chuyền tính là 1); một mã có thể thuộc nhiều ô nên các ô không cộng lại bằng Tổng.

| Thẻ | Khóa | Đếm mã hàng có… |
|---|---|---|
| Tổng đơn hàng (tím) | `total` | Ít nhất một dòng khớp bộ lọc |
| Đủ điều kiện V/C (xanh) | `ready` | Dòng ở trạng thái `READY` |
| Nguy cơ trễ hạn (cam) | `atRisk` | Bước đang dùng chưa có TH mà KH trong [hôm nay, hôm nay + 2] |
| Trễ hạn (đỏ) | `late` | Dòng `NOT_READY` có bước trễ: TH sau KH, hoặc đã qua KH mà chưa có TH |

- Số nào suy ra từ cột người xem không được xem nguyên giá trị thì máy chủ trả `null`, thẻ hiện "–": cột Mã hàng bị Ẩn/Che thì cả 4 số; cột các bước hoặc Trạng thái bị Ẩn/Che thì 3 số sau.
- Nút ⓘ mở giải thích cách đếm. Tải lỗi thì có nút thử lại. Lưu ngày TH hoặc lưu popup thì số liệu tải lại (`refreshPrepSummary`).
- Điện thoại: thẻ xếp 2×2, bỏ biểu tượng và dòng giải thích.

### Nhập ngày TH trên lưới

Chỉ ở chế độ lưới nhập. Code: `PrepPlanPage.tsx` (các hàm thuần `withEdits`, `withoutSaved`, `afterSave`, `withoutCells`, `draftItems` có test riêng).

- Gõ ngày vào ô TH (`dd/mm/yyyy` hoặc `dd/mm`), dán nhiều ô từ Excel, Delete để xóa ngày. Ô của dòng ngoài phạm vi sửa (`canEdit = false`) bị khóa sẵn.
- Ô đã đổi giữ trong **bản nháp** (qua đổi trang, đổi bộ lọc), nhớ ngày lúc bắt đầu sửa (`previous`). Sửa về đúng ngày đã lưu thì ô rời nháp. Trạng thái của dòng tính lại ngay theo ngày đang hiện (`liveStatus`).
- Nút **Lưu thay đổi (n ô)** gửi `PUT /sewing/prep` với ảnh chụp nháp lúc bấm; ô gõ thêm trong lúc đang lưu vẫn ở lại nháp. Nút bị khóa khi chưa đổi gì, có ngày sau hôm nay, hoặc vượt 500 dòng / 5.000 ô.
- **Xung đột** (409, người khác vừa sửa ô): máy chủ không ghi gì; màn thay các ô đó bằng ngày mới của người kia, giữ các ô khác đang nhập, báo để lưu lại.
- **Dòng không còn** (404 kèm `details.ids`: dòng dàn chuyền đã bị bỏ, hoặc ngoài phạm vi sửa): máy chủ không ghi gì; màn bỏ ô nháp của các dòng đó, giữ phần còn lại để lưu tiếp.
- **Bỏ thay đổi** hỏi lại trước khi bỏ. Rời màn khi còn nháp thì hỏi (`useLeaveGuard`). Mở popup chi tiết của dòng đang có ô chưa lưu bị chặn.
- Tab khác đổi ĐVCS của phiên: nháp bị bỏ (máy chủ không nhận nữa) và có thông báo không tự đóng.

### Popup chi tiết một dòng

Mở bằng bấm đúp, hoặc nút **Sửa chi tiết** / **Xem chi tiết** sau khi chọn dòng. Tên trong file mẫu: "Hướng dẫn, chỉ dẫn và điều chỉnh số ngày kế hoạch theo mã hàng". Gọi `GET /sewing/prep/:id`, lưu bằng `PUT /sewing/prep/:id`.

- Phần đầu (chỉ xem): Tổ SX, Ngày vào chuyền, Kế hoạch, Khách hàng, Tên sản phẩm, SL của chuyền.
- Ba ô nhập tay: Loại mã (≤ 50 ký tự), Số lượng chốt UD (số nguyên 0–100.000.000), HS Ưu đãi VC (≥ 0, 2 chữ số thập phân). Ba cột này tạm nhập tay, chờ BA chỉ nguồn. Mỗi ô theo chính sách cột của chính nó.
- Bảng các bước: Nội dung · Số ngày KH (sửa được) · KH (tính lại ngay khi đổi số ngày) · TH (sửa được) · Người thực hiện · Nguồn dữ liệu đầu vào. Xóa trắng Số ngày KH là quay về số mặc định của danh mục.
- Sửa được khi: có `order.prep:update`, không ở `A00`, dòng trong phạm vi sửa. Sửa các bước thêm điều kiện cột `steps` ở mức Sửa được. Chỉ gửi phần đã đổi. Nút Lưu khóa khi chưa đổi, có TH sau hôm nay, hoặc số ngày > 365.
- Esc không đóng popup khi đang sửa bảng (Esc trong lưới là thoát sửa ô). Điện thoại: popup toàn màn hình.

### Xuất file

Nút **Xuất file** (cần `order.prep:export`) gọi `GET /sewing/prep/export` với cùng bộ lọc và sắp xếp, mọi trang. File CSV `ke-hoach-chuan-bi-sx-<mã ĐVCS phiên>.csv`, cột: Chi nhánh (tên ĐVCS) · Tổ SX · Mã hàng · Loại mã · Số lượng chốt UD · HS Ưu đãi VC · Ngày vào chuyền · Trạng thái (nhãn tiếng Việt) · rồi cặp "<tên bước> - KH", "<tên bước> - TH" cho từng bước đang dùng. Chính sách cột của "Các bước" áp cho cả nhóm cột bước: không xem được thì không có cột bước nào.

## Danh mục Cấu hình chuẩn bị SX

Các bước chuẩn bị trước ngày vào chuyền, **dùng chung toàn công ty**, thứ tự (`SortOrder`) là thứ tự cột ở màn Kế hoạch chuẩn bị SX. Nằm ở Quản trị › Danh mục hệ thống, nhóm "Danh mục MES", mục "Cấu hình chuẩn bị SX" (đếm số bước đang dùng).

- **Bảng sửa như bảng tính** (`SheetGrid`, khi có `admin.catalog:update`): Thứ tự · Mã (chỉ xem) · Nội dung · Số ngày KH · Người thực hiện · Nguồn dữ liệu đầu vào · Trạng thái (Đang dùng / Ngừng dùng). Dán được từ Excel. Bấm **Lưu thay đổi** gửi các dòng đã đổi trong một lần (`PUT /sewing/prep-steps`, một transaction: một dòng sai thì không lưu dòng nào). **Hoàn tác** đưa bảng về lần lưu gần nhất. Không có quyền sửa thì là bảng chỉ xem.
- Ô bắt buộc: Thứ tự, Nội dung, Số ngày KH (0–365). Lỗi hiện ngay trên bảng, nút Lưu bị khóa tới khi sửa xong.
- **Ngừng dùng** một bước hỏi xác nhận: cột của bước không còn hiện ở màn Kế hoạch, không tính vào trạng thái; ngày đã nhập giữ nguyên, bật lại lúc nào cũng được.
- **Thêm bước** (khi có `admin.catalog:create`, và bảng không có thay đổi chưa lưu): hộp nhập Mã (chữ hoa không dấu, số, `.`, `_`, `-`, tối đa 30 ký tự; tự viết hoa; không đổi được sau khi tạo), Nội dung, Số ngày KH, Người thực hiện, Nguồn dữ liệu đầu vào. Bước mới xếp cuối (`SortOrder` lớn nhất + 10).
- Đổi Số ngày KH ở danh mục thì mọi dòng **chưa chỉnh riêng** đổi KH theo ngay.
- Không xóa vật lý; mã bất biến (DTO không nhận đổi mã, trigger chặn ở DB). "Người thực hiện" chỉ để hiển thị, chưa dùng để phân quyền nhập TH.
- Lưu lúc người dùng còn gõ tiếp: ô gõ thêm vẫn giữ trong bản nháp, lần lưu sau chỉ gửi ô đó (`frontend/src/test/prep-steps-save.test.tsx`).

Danh mục không qua `BaseRepository` (bảng không có cột nhà máy, như các danh mục khác); quyền cưỡng chế ở controller bằng `admin.catalog:*`.

## Phân quyền và chính sách cột

**Tài nguyên `order.prep`** (bảng nguồn `SewingPrep`, phạm vi theo nhà máy):
- Hành động dùng: `view`, `update`, `export`. Không có Thêm, Xóa: dòng do hệ thống chép từ Xếp chuyền. Ma trận mẫu (Kế hoạch `VUE`, Giám đốc `VE`, Quản trị `V`, Trưởng chuyền `V`, vai trò khác không có): [Dữ liệu mẫu](12-du-lieu-mau-va-kiem-thu.md).
- Chiều phạm vi: `FACTORY` → `BranchCode`, `LINE` → `LineCode`. Không gắn `OWNER`: dòng không có người tạo, nên vai trò được gán "chỉ của mình" vẫn thấy theo nhà máy, chuyền (chiều không gắn thì không áp).
- Phiên `A00`: đọc mọi nhà máy trong phạm vi, mọi lệnh ghi bị từ chối (`AGGREGATE_READ_ONLY`), danh sách trả `canEdit = false` cho mọi dòng.
- Bảng con `SewingPrepStep` không có quyền riêng, phạm vi theo dòng cha (`ChildRepository`).

**Cột đăng ký** (`SysResourceField`, mã trùng khóa JSON của API; không có cột nhạy cảm):

| Mã cột | Tên | Ghi chú |
|---|---|---|
| `lineCode` | Tổ SX | |
| `planNo` | Số kế hoạch | Chỉ ở popup |
| `customerName` | Khách hàng | Chỉ ở popup. Mẫu: Trưởng chuyền bị Che |
| `styleCode` | Mã hàng | |
| `productName` | Tên sản phẩm | Chỉ ở popup |
| `styleType` | Loại mã | Nhập tay |
| `lineQty` | SL của chuyền | Chỉ ở popup |
| `confirmedQty` | Số lượng chốt UD | Nhập tay |
| `priorityFactor` | HS Ưu đãi VC | Nhập tay |
| `startDate` | Ngày vào chuyền | |
| `steps` | Các bước chuẩn bị (KH, TH) | Một mã cho cả nhóm cột KH, TH và cột bước trong file xuất |
| `statusCode` | Trạng thái | |

**Cách chính sách cột ảnh hưởng màn này** (cơ chế chung ở [Phân quyền](04-phan-quyen.md)):
- Cột Ẩn hoặc Che thì không lọc, không tìm, không sắp xếp theo cột đó (máy chủ bỏ tham số; lọc theo cột trả 403 `FIELD_NOT_READABLE`), vì lọc, sắp xếp cũng làm lộ giá trị.
- Danh mục bước trả ở khóa riêng `stepInfo`, còn `steps` là khóa của cột (bị Che thì thành `***`). Nhờ vậy cột các bước bị Che thì lưới vẫn có tên bước.
- Gửi lên khóa `steps`, `styleType`… mà cột không ở mức Sửa được thì 403 `FIELD_READONLY`, kể cả khóa nằm sâu trong `items` của `PUT /sewing/prep`.
- Câu báo xung đột nêu "mã hàng (tổ)" của dòng; nếu Mã hàng hoặc Tổ SX bị Ẩn/Che thì chỉ nêu "dòng <Id>".
- Nhật ký ghi giá trị đã qua `FieldPolicyService.redact` (bỏ cột nhạy cảm; màn Nhật ký không đi qua chính sách cột).

## API `/sewing/*`

Tiền tố `/api/v1`. Mọi endpoint cần đăng nhập. `PrepController` có `@FieldResource('order.prep')`: chính sách cột áp cho dữ liệu gửi lên và trả về. Route tĩnh (`values`, `summary`, `export`) khai trước `:id`. Mã lỗi chung (401, 403 `PERMISSION_DENIED`, 422 `VALIDATION_FAILED` của DTO…): [Phân quyền](04-phan-quyen.md).

**Tham số lọc dùng chung** (`PrepListQuery`) cho `GET /sewing/prep`, `/values`, `/summary`, `/export`:

| Tham số | Kiểu | Ý nghĩa |
|---|---|---|
| `page`, `pageSize` | số | Mặc định 1 và 100; `pageSize` tối đa 200 |
| `q` | chữ ≤ 60 | Tìm `LIKE` trong mã hàng, khách hàng, tên sản phẩm, số kế hoạch (bỏ cột bị Ẩn/Che) |
| `sort` | chữ ≤ 40 | Một hoặc nhiều cặp `trường:asc\|desc` cách nhau dấu phẩy (tối đa 6). Trường: `startDate`, `styleCode`, `lineCode`, `customerName`, `branchCode`, `createdAt`. Trường lạ hoặc bị Ẩn/Che thì bỏ; không còn trường nào thì theo mặc định |
| `startFrom`, `startTo` | `YYYY-MM-DD` | Khoảng ngày vào chuyền (ngày phải có thật) |
| `customer`, `style` | chữ | `LIKE` theo khách hàng (≤ 100), mã hàng (≤ 120) |
| `line` | chữ ≤ 20 | Mã chuyền, so bằng |
| `branch` | `[A-Za-z0-9_-]{1,10}` | Lọc một ĐVCS trong phạm vi đã xem được |
| `styleType` | chữ ≤ 50 | Loại mã, so bằng |
| `status` | `NOT_DUE`, `NOT_READY`, `READY` | Lọc trạng thái (tính trong SQL) |
| `week` | `YYYY-MM-DD` | Một ngày trong tuần đang chọn ở thanh tuần |
| `cf` | JSON ≤ 20.000 ký tự | Lọc theo cột (ADR 0011). Cột lọc được: `branchCode`, `lineCode`, `styleCode`, `styleType`, `confirmedQty`, `priorityFactor`, `startDate`, `createdAt` |

| Method | Đường dẫn | Quyền | Body / tham số | Kết quả | Lỗi đặc thù |
|---|---|---|---|---|---|
| GET | `/sewing/prep` | `order.prep:view` | Tham số lọc | `{ items, total, page, pageSize, today, stepInfo }`. `stepInfo`: các bước đang dùng theo thứ tự cột `{ id, code, name, description, planDays, performer, dataSource, sortOrder, isActive }`. Mỗi dòng: `{ id, branchCode, planNo, customerName, styleCode, productName, lineCode, lineName, lineQty, startDate, styleType, confirmedQty, priorityFactor, createdAt, steps: [{ stepId, planDays, custom, planDate, doneDate, state }], statusCode, canEdit }`. `lineName`: tên chuyền (chuyền mồ côi "<mã> (chuyền cũ)"), không có khi Tổ SX bị Ẩn hoặc Che | Chép dàn chuyền trước khi đọc |
| GET | `/sewing/prep/values` | `order.prep:view` | Tham số lọc + `field` (bắt buộc), `search` (≤ 60) | `{ values, truncated }`: các giá trị khác nhau của cột theo các bộ lọc khác (không lọc theo chính cột đó) | Cột ngoài danh sách 422; cột bị Ẩn/Che 403 `FIELD_NOT_READABLE` |
| GET | `/sewing/prep/summary` | `order.prep:view` | Tham số lọc (`page`, `pageSize`, `sort`, `status` bỏ qua) | `{ today, total, ready, atRisk, late }`, số `null` khi người xem không được xem cột liên quan | Chép dàn chuyền trước khi đếm (trừ khi Mã hàng bị Ẩn/Che) |
| GET | `/sewing/prep/export` | `order.prep:export` | Tham số lọc | File CSV (mục Xuất file) | Chép dàn chuyền trước khi đọc |
| PUT | `/sewing/prep` | `order.prep:update` | `{ items: [{ id, steps: [{ stepId, doneDate, previous? }] }] }`: 1–500 dòng, mỗi dòng 1–200 bước, tổng tối đa 5.000 ô. `doneDate` bắt buộc có mặt, `null` là xóa ngày TH. `previous`: ngày lúc tải bảng | `{ rows, cells }`: số dòng, số ô thật sự đổi (ô gửi trùng ngày đã lưu không tính) | 422: dòng hoặc bước gửi hai lần, bước không có trong danh mục, ngày sau hôm nay, quá 5.000 ô. 404 `NOT_FOUND` kèm `details.ids` (Id trong số đã gửi): dòng không còn hoặc ngoài phạm vi sửa, không ghi gì. 409 `CONFLICT` kèm `details.cells: [{ id, stepId, doneDate }]`: ô trong DB khác `previous` và khác ngày mới gửi, không ghi gì. 403 `AGGREGATE_READ_ONLY` ở `A00`. 403 `FIELD_READONLY` khi cột `steps` không ở mức Sửa được |
| GET | `/sewing/prep/:id` | `order.prep:view` | | Một dòng như trên, kèm `stepInfo` (bước đang dùng cộng bước đã ngừng mà dòng còn dữ liệu) và `today` | 404 khi ngoài phạm vi xem |
| PUT | `/sewing/prep/:id` | `order.prep:update` | `{ styleType?, confirmedQty?, priorityFactor?, steps?: [{ stepId, planDays?, doneDate? }] }`, chỉ gửi phần đã đổi (tối đa 200 bước). `planDays` `null` hoặc bằng số của danh mục là theo danh mục. Bỏ cả số ngày lẫn ngày TH thì xóa dòng con | Dòng sau khi lưu (cùng dạng `GET /:id`) | 422: ngày TH sau hôm nay, bước không có, bước gửi hai lần, `planDays` ngoài 0–365. 404 ngoài phạm vi sửa. 403 `AGGREGATE_READ_ONLY`, `FIELD_READONLY` |
| GET | `/sewing/prep-steps` | `admin.catalog:view` | | Mọi bước kể cả đã ngừng, theo `SortOrder`, `Id`: `[{ id, code, name, description, planDays, performer, dataSource, sortOrder, isActive }]` | |
| POST | `/sewing/prep-steps` | `admin.catalog:create` | `{ code, name, planDays, performer?, dataSource?, description? }`. `code` tự cắt khoảng trắng, viết hoa, khớp `^[A-Z0-9._-]{1,30}$`; `name` 1–150; `planDays` 0–365; `performer` ≤ 100; `dataSource` ≤ 500; `description` ≤ 300 | 201, bước vừa tạo | 409 trùng mã |
| PUT | `/sewing/prep-steps` | `admin.catalog:update` | `{ items: [{ id, name?, planDays?, performer?, dataSource?, description?, sortOrder?, isActive? }] }`, tối đa 200; `name`, `planDays`, `sortOrder`, `isActive` không nhận `null`; `sortOrder` 0–1.000.000 | `{ updated, items }`: số bước thật sự đổi và cả danh mục sau khi lưu | 422 một bước gửi hai lần; 404 Id không có (cả lần lưu bị bỏ). Không có trường đổi mã |

**Cách lưu `PUT /sewing/prep`** (`PrepService.saveDone`), một transaction của `MES_Sewing`:
1. Kiểm đầu vào (trùng, bước không có, ngày sau hôm nay, số ô).
2. `lockMany`: lọc các Id trong phạm vi sửa rồi khóa `UPDLOCK` theo thứ tự Id; dòng phải xem được nữa. Có Id không khóa được thì 404 kèm danh sách Id.
3. So từng ô: ngày mới bằng ngày đang lưu thì bỏ qua; ngày đang lưu khác `previous` thì là xung đột. Có xung đột thì 409, không ghi ô nào.
4. Ghi theo lô: thêm dòng con cho ô chưa có; xóa dòng con khi bỏ ngày TH mà không có số ngày chỉnh riêng; còn lại sửa gom theo ngày mới (giữ số ngày chỉnh riêng).
5. Sau khi commit mới ghi nhật ký (mỗi dòng một mục), vì nhật ký nằm ở `MES_Core`: lần lưu bị hủy (409, 404, deadlock) không để lại nhật ký.

`PUT /sewing/prep/:id` (`PrepService.update`) cũng chạy trong một transaction: khóa dòng (`lock`), đọc trạng thái trước, sửa cột nhập tay qua `BaseRepository.update`, thêm/sửa/xóa dòng con, đọc lại, rồi ghi nhật ký sau khi commit.

## Database `MES_Sewing`

Migration: `backend/migrations/MES_Sewing/0001_sewing_prep.sql`, `0002_sewing_prep_source.sql`. Quản trị CSDL tạo database trước và cấp `db_owner` (tài khoản ứng dụng không có quyền `CREATE DATABASE`); cách chạy migrate: [Vận hành](11-van-hanh.md). Quy ước như `MES_Order`: thời điểm `DATETIME2(3)` giờ UTC; bảng con mang `BranchCode` của cha và khóa ngoại ghép `(ParentId, BranchCode)` tới `UNIQUE (Id, BranchCode)` của cha.

### `PrepStep`: danh mục bước chuẩn bị

Dùng chung toàn công ty, không có `BranchCode`.

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | Không | `PK_PrepStep` |
| `Code` | `VARCHAR(30)` | Không | `UQ_PrepStep_Code`. `CK_PrepStep_Code`: chỉ `A-Z 0-9 . _ -` (so nhị phân), không rỗng. Bất biến (trigger) |
| `Name` | `NVARCHAR(150)` | Không | Nội dung bước, tên cột trên màn |
| `Description` | `NVARCHAR(300)` | Có | Màn chưa có ô nhập; API nhận |
| `PlanDays` | `INT` | Không | Số ngày KH mặc định, mặc định 0, `CK_PrepStep_PlanDays` 0–365 |
| `Performer` | `NVARCHAR(100)` | Có | Bộ phận, người thực hiện (chỉ hiển thị) |
| `DataSource` | `NVARCHAR(500)` | Có | Chỉ dẫn lấy ngày thực hiện từ đâu |
| `SortOrder` | `INT` | Không | Mặc định 0. Thứ tự cột trên màn |
| `IsActive` | `BIT` | Không | Mặc định 1. Ngừng dùng thay cho xóa |
| `IsSystem` | `BIT` | Không | Mặc định 0. Ứng dụng không ghi cột này (seed để 0) |
| `CreatedAt` | `DATETIME2(3)` | Không | Mặc định `SYSUTCDATETIME()` |
| `CreatedBy` | `INT` | Có | Người tạo (seed để `NULL`) |
| `ModifiedAt`, `ModifiedBy` | `DATETIME2(3)`, `INT` | Có | Lần sửa gần nhất |

Chỉ mục `IX_PrepStep_Sort (SortOrder, Id)`. Trigger `TR_PrepStep_CodeImmutable` (AFTER UPDATE): đổi `Code` thì báo `CODE_IMMUTABLE` và rollback.

### `SewingPrep`: dòng kế hoạch chuẩn bị

Một dòng dàn chuyền. Các cột từ `ShipmentPlanLineId` tới `StartDate` là **bản chép**, ứng dụng ghi đè mỗi lần chép; ba cột nhập tay chỉ người dùng sửa.

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | Không | `PK_SewingPrep` |
| `ShipmentPlanLineId` | `INT` | Không | Khóa ngầm tới dòng dàn chuyền. `UX_SewingPrep_Line` (duy nhất) |
| `ShipmentPlanId` | `INT` | Không | Khóa ngầm tới kế hoạch xuất hàng. `IX_SewingPrep_Plan` |
| `PlanNo` | `VARCHAR(30)` | Không | Số kế hoạch (chép) |
| `CustomerName` | `NVARCHAR(100)` | Không | Khách hàng (chép) |
| `StyleCode` | `NVARCHAR(120)` | Không | Mã hàng (chép); cùng kiểu với `MES_Order` vì mã BRAVO có chữ tiếng Việt |
| `ProductName` | `NVARCHAR(150)` | Không | Tên sản phẩm (chép) |
| `LineCode` | `VARCHAR(20)` | Không | Mã chuyền (chép). Cột phạm vi chiều `LINE` |
| `LineQty` | `INT` | Không | Số lượng của chuyền (chép) |
| `StartDate` | `DATE` | Không | Ngày vào chuyền (chép) |
| `StyleType` | `NVARCHAR(50)` | Có | Loại mã, nhập tay |
| `ConfirmedQty` | `INT` | Có | Số lượng chốt UD, nhập tay. `CK_SewingPrep_ConfirmedQty` ≥ 0 |
| `PriorityFactor` | `DECIMAL(9,2)` | Có | HS Ưu đãi VC, nhập tay. `CK_SewingPrep_PriorityFactor` ≥ 0 |
| `SourceSyncedAt` | `DATETIME2(3)` | Không | Lần chép gần nhất có đổi dòng này |
| `BranchCode` | `VARCHAR(10)` | Không | ĐVCS, lấy từ dòng nguồn. Cột phạm vi chiều `FACTORY` |
| `CreatedAt` | `DATETIME2(3)` | Không | Mặc định `SYSUTCDATETIME()`: lúc tạo bản chép (dòng bị tạo lại khi Id nguồn đổi) |
| `CreatedBy` | `INT` | Có | Luôn `NULL` (dòng do hệ thống chép) |
| `ModifiedAt`, `ModifiedBy` | `DATETIME2(3)`, `INT` | Có | Lần sửa cột nhập tay gần nhất (`BaseRepository.update`) |
| `SourceCreatedAt` | `DATETIME2(3)` | Có | Thêm ở `0002`. Thời điểm tạo dòng dàn chuyền nguồn, để nhận diện khi Id bị dùng lại; là "Ngày tạo" trên màn. `NULL` ở dòng chép trước `0002`, lần chép sau điền |

Ràng buộc, chỉ mục: `UQ_SewingPrep_IdBranch (Id, BranchCode)` (đích của khóa ngoại ghép), `UX_SewingPrep_Line (ShipmentPlanLineId)`, `IX_SewingPrep_Branch_Start (BranchCode, StartDate, Id)`, `IX_SewingPrep_Branch_Line (BranchCode, LineCode)`, `IX_SewingPrep_Plan (ShipmentPlanId)`.

### `SewingPrepStep`: số ngày chỉnh riêng và ngày TH theo bước

Bảng con của `SewingPrep`. Chỉ có dòng khi người dùng đã nhập; bước chưa có dòng là theo danh mục, chưa thực hiện. Bỏ cả số ngày lẫn ngày TH thì dòng bị xóa.

| Cột | Kiểu | NULL | Ghi chú |
|---|---|---|---|
| `Id` | `INT IDENTITY` | Không | `PK_SewingPrepStep` |
| `SewingPrepId` | `INT` | Không | Dòng cha |
| `PrepStepId` | `INT` | Không | `FK_SewingPrepStep_Step` → `PrepStep.Id` |
| `PlanDays` | `INT` | Có | Số ngày KH chỉnh riêng; `NULL` là theo danh mục. `CK_SewingPrepStep_PlanDays` 0–365 |
| `DoneDate` | `DATE` | Có | Ngày thực hiện (TH) |
| `BranchCode` | `VARCHAR(10)` | Không | Của dòng cha, do repository đặt |
| `CreatedAt` | `DATETIME2(3)` | Không | Mặc định `SYSUTCDATETIME()` |
| `CreatedBy` | `INT` | Có | Người nhập đầu tiên |
| `ModifiedAt`, `ModifiedBy` | `DATETIME2(3)`, `INT` | Có | Lần sửa gần nhất |

Ràng buộc, chỉ mục: `FK_SewingPrepStep_Prep (SewingPrepId, BranchCode)` → `SewingPrep (Id, BranchCode)` `ON DELETE CASCADE`; `UQ_SewingPrepStep (SewingPrepId, PrepStepId)`; `IX_SewingPrepStep_Branch (BranchCode, SewingPrepId)`.

### Khóa ngầm

Khai ở `backend/migrations/softkeys.json`, kiểm bản ghi mồ côi bằng `npm run check:softkeys -w backend` (cơ chế chung: [Kiến trúc](../ARCHITECTURE.md) mục 6.3).

| Cột | Trỏ tới | Điều kiện |
|---|---|---|
| `SewingPrep.ShipmentPlanLineId` | `MES_Order.ShipmentPlanLine.Id` | Cùng nhà máy |
| `SewingPrep.ShipmentPlanId` | `MES_Order.ShipmentPlan.Id` | Cùng nhà máy |
| `SewingPrep.LineCode` | `MES_Hr.Department.Code` | Mã bộ phận tích "Xưởng sản xuất", cùng nhà máy; không lọc theo cờ (bộ phận đã bỏ tích, giải thể vẫn hợp lệ; mã chuyền cũ không còn là bộ phận nào là mồ côi) |
| `SewingPrep.BranchCode` | `MES_Core.SysBranch.Code` | |
| `SewingPrepStep.BranchCode` | `MES_Core.SysBranch.Code` | |

Không có transaction chung giữa `MES_Sewing` và `MES_Order`/`MES_Core`: bản chép có thể trễ so với dàn chuyền tới lần mở màn sau; nhật ký (`MES_Core`) ghi sau khi commit.

## Nhật ký

Ghi `SysAuditLog` (`MES_Core`) qua `AuditService`:

| `EntityType` | `ActionCode` | Khi nào | Giá trị |
|---|---|---|---|
| `SewingPrep` | `UPDATE` | Lưu popup một dòng | Toàn bộ dòng trước và sau, bỏ cột nhạy cảm (`FieldPolicyService.redact`; `order.prep` hiện không có cột nhạy cảm) |
| `SewingPrep` | `UPDATE` | Lưu ngày TH trên lưới, mỗi dòng có đổi một mục | Mã hàng, chuyền, ngày vào chuyền và các bước đổi kèm ngày TH cũ, mới |
| `PrepStep` | `CREATE`, `UPDATE` | Thêm bước, lưu bảng danh mục (mỗi bước đổi một mục) | Bước trước và sau |

Việc chép dàn chuyền không ghi nhật ký; chỉ log máy chủ (`SewingPrepSync`) khi xóa dòng có dữ liệu đã nhập hoặc khi chép lỗi.

## Dữ liệu mẫu và script

- `npm run seed` (`backend/scripts/seed.ts`, bước 12): thêm các bước còn thiếu theo mã từ `prepSteps` trong `backend/scripts/seed-data.ts` (16 bước `CB01`…`CB16` theo ảnh danh mục mẫu), không sửa bước đã có. Chạy cả khi `SEED_SAMPLE_DATA=false`. Máy chưa có `MES_Sewing` thì bỏ qua và cảnh báo.
- `reset:demo`, `load:bravo` gọi `clearSewingPrep` (`backend/scripts/sewing-data.ts`): xóa hết `SewingPrep` (ngày theo bước xóa theo), giữ danh mục bước, vì Id dòng dàn chuyền bị đánh số lại. Chỉ chạy trên máy demo (`assertDemoMachine`).
- `sim:board` giữ các kế hoạch mô phỏng có dòng đã nhập ở Kế hoạch chuẩn bị SX (dòng có `ModifiedAt` hoặc có `SewingPrepStep`); `--all` xóa cả các kế hoạch đó.
- Chi tiết các lệnh: [Vận hành](11-van-hanh.md); dữ liệu mẫu, tài khoản thử: [Dữ liệu mẫu và kiểm thử](12-du-lieu-mau-va-kiem-thu.md).

## Test

| File | Nội dung chính |
|---|---|
| `backend/test/sewing.spec.ts` | Chạy trên DB thật. Quy tắc KH và trạng thái; chép khi mở màn, chỉ chép khi dàn chuyền đổi, Id bị dùng lại, nguồn rỗng, nguồn lẫn nhà máy; thanh tuần; sửa một dòng; lưu trên lưới (xung đột 409, dòng không còn 404, nhật ký chỉ ghi khi lưu thành công); kiểm đầu vào 422; phạm vi Trưởng chuyền, `A00` chỉ đọc; danh mục bước (chỉ quản trị sửa, bước mới thành cột); chính sách cột (Chỉ đọc, Ẩn, Che các bước, che tên khách); số liệu tổng hợp; chuyền mồ côi hiện "<mã> (chuyền cũ)", Tổ SX bị Che thì không trả tên |
| `frontend/src/test/sewing.test.tsx` | Tuần ISO; các hàm nháp ô TH; lưới xem và lưới nhập (tiêu đề 2 tầng, vị trí cột Trạng thái); các bước bị Che; dải số liệu; bộ lọc theo cột bị Ẩn; bảng danh mục bước chỉ xem và sửa |
| `frontend/src/test/prep-steps-save.test.tsx` | Gõ thêm trong lúc đang lưu danh mục bước |

## Giới hạn hiện tại

- Ngày TH nhập tay; chưa tự lấy từ module Kỹ thuật, Lab, Kế hoạch mẫu (chưa có).
- Chưa phân quyền nhập TH theo từng bước hay bộ phận ("Người thực hiện" chỉ để hiển thị).
- KH tính theo ngày lịch, chưa trừ ngày nghỉ, ngày lễ.
- Danh mục bước dùng chung, chưa có danh mục riêng theo nhà máy.
- Dấu phiên bản đã chép giữ trong bộ nhớ của tiến trình máy chủ: chạy nhiều tiến trình thì mỗi tiến trình chép một lần. Số dòng dàn chuyền rất lớn thì cân nhắc chép tăng dần theo `ModifiedAt` (ADR 0009).
- Loại mã, Số lượng chốt UD, HS Ưu đãi VC nhập tay tạm, chờ BA chỉ nguồn. Các câu hỏi còn chờ BA: [Trạng thái](../current/STATUS.md).

## Kế hoạch may (phase 5.16)

Kế hoạch sản xuất theo ngày cho từng dòng dàn chuyền (chuyền + mã hàng + PO của Xếp chuyền), làm căn cứ giao việc, nhập năng suất. Màn theo ảnh `docs/screens/ke-hoach-may.png`. Quyết định 14.1–14.3 ([Quyết định](13-quyet-dinh.md)); kế hoạch phase 5.16 đã xóa sau khi chuyển nội dung (bản gốc: `git show 98d19db:docs/phases/phase-5-16-ke-hoach-may.md`).

| Màn | Đường dẫn | Quyền | Frontend | Backend |
|---|---|---|---|---|
| Kế hoạch may | `/sewing/plan` (nhóm Quản trị xưởng may) | `sewing.plan:view`, `:update` (Cập nhật, Chốt, Hủy chốt), `:create` (lần đầu lập kế hoạch cho chuyền trong ngày) | `frontend/src/features/sewing/SewingPlanPage.tsx`, `sewingPlanRules.ts`, `api.ts` | `backend/src/modules/sewing/sewing-plan.service.ts`, `sewing-plan.repositories.ts`, `sewing-plan.dto.ts`, `sewing.controller.ts` (`SewingPlanController`) |

### Dòng của màn

Với Đơn vị phòng ban và Ngày đã chọn, màn liệt kê:
- dòng dàn chuyền của các chuyền thuộc đơn vị (chính chuyền, hoặc chuyền có một bộ phận cha là đơn vị; không chọn: mọi chuyền của ĐVCS phiên) có Ngày vào chuyền ≤ ngày ≤ Ngày kết thúc;
- cộng dòng đã có bản ghi ở ngày đó (kể cả dòng đã ra khỏi khoảng ngày vì Xếp chuyền đổi ngày);
- cộng dòng người dùng thêm bằng **Thêm dòng**: Chuyền → Mã hàng → PO/Buy date trong mọi dòng dàn chuyền của các chuyền thuộc đơn vị (`GET /sewing/plan/options`, rồi tải lại lưới với `extra`).

Dòng dàn chuyền đọc thẳng qua `ScheduleFeed.dayPlanLines` của module Đơn hàng lúc mở màn, không chép (khác Kế hoạch chuẩn bị SX). Dòng chưa có bản ghi ở `MES_Sewing` cũng chỉ hiện khi giá trị (ĐVCS, chuyền) nằm trong phạm vi xem: `BaseRepository.allows` ([Phân quyền](04-phan-quyen.md)). Dòng có bản ghi mà dòng dàn chuyền không còn (hoặc Id đã thuộc dòng khác) hiện theo bản chụp, chữ nghiêng, chỉ xem (`sourceGone`). Chuyền đã chốt mà có dòng chưa có trong bản chụp (Xếp chuyền thêm, đổi ngày sau khi chốt): dòng đó hiện số mới nhất, chỉ xem; Thêm dòng khóa chuyền đã chốt.

### Quy tắc tính

| Cột | Quy tắc |
|---|---|
| Tổ SX | Tên chuyền (`OrgService.lineNamer`), rê chuột thấy mã |
| Mã hàng, PO/buydate | Của kế hoạch xuất hàng của dòng dàn chuyền |
| Giá CM | `ShipmentPlan.CmPrice`: theo giá nhập ở Thông tin đơn hàng (quyết định 14.3) |
| Ngày vào chuyền | `ShipmentPlanLine.StartDate` |
| Ngày kết thúc | Kết thúc ra chuyền (`OutEndDate`); dòng rất cũ chưa có thì Kết thúc vào chuyền + số ngày ra chuyền của lịch ĐVCS |
| Tổng kế hoạch | Số lượng của dòng dàn chuyền |
| Đã giao | Tổng Kế hoạch ngày xưởng giao của cùng dòng dàn chuyền ở mọi ngày ≤ ngày đang xem (cả ngày chưa chốt); giao diện tính lại khi gõ (`otherBefore` + số đang gõ) |
| Còn lại | Tổng kế hoạch − Đã giao |
| Kế hoạch theo linemap, Kế hoạch ngày xưởng giao | Nhập, số nguyên ≥ 0, lưu theo ngày đang xem |
| Doanh số kế hoạch | Kế hoạch theo linemap × Giá CM (làm tròn 2 số lẻ) |
| Từ giờ, Đến giờ | Mặc định 07:30, 17:10 (cố định, Q13); Đến giờ sau Từ giờ |
| Dòng Tổng (n) | Cuối lưới, nền xanh: cộng các cột số của các dòng đang hiện (theo ô lọc mã hàng), không cộng Giá CM |

**Không giao vượt** (quyết định 14.2): tổng Kế hoạch ngày xưởng giao **mọi ngày** (trước, ngày đang xem, sau) không vượt Tổng kế hoạch; chỉ chặn khi số của ngày đang xem tăng. Giao diện tô đỏ, khóa Cập nhật; máy chủ 422. Muốn giao thêm thì tăng Số lượng ở Xếp chuyền.

### Cập nhật, Chốt, Hủy chốt

- **Cập nhật** (`PUT /sewing/plan`): chỉ gửi ô đã sửa của dòng sửa được; xong thì chỉ các ô đã gửi thành đã lưu (ô gõ thêm trong lúc lưu vẫn chờ). Một transaction `MES_Sewing`, khóa ứng dụng `MES_Sewing.SewingDayPlan.<ĐVCS>` (chờ tối đa 10 giây, hết giờ 409). Tạo bản ghi chuyền × ngày khi chưa có (cần quyền Thêm; giao diện khóa nút kèm lý do khi thiếu, nhận ra chuyền chưa có bản ghi qua `version = "0"`); chụp lại các cột từ Xếp chuyền; sau khi ghi đọc lại dòng dàn chuyền: dòng mất, đổi chuyền, Số lượng giảm xuống dưới tổng đã giao thì 409. Lỗi: 422 (ngày đã qua, số, giờ, giao vượt, gửi trùng); 404 kèm `details.ids` (dòng không còn, khác thời điểm tạo, ngoài phạm vi sửa: giao diện bỏ số đã gõ của các dòng đó); 409 (chuyền đã chốt; người khác vừa ghi cùng chuyền cùng ngày, tức `versions` lúc mở màn khác phiên bản hiện tại; Xếp chuyền vừa đổi).
- **Chốt** (`POST /sewing/plan/lock { date, dept, versions }`): khóa mọi chuyền đang hiện của đơn vị trong ngày, trong phạm vi sửa; chuyền chưa có bản ghi thì tạo kèm các dòng đang chạy (ô nhập trống); chụp lại các cột từ Xếp chuyền; ghi người chốt (tên chụp), lúc chốt. Còn ô chưa cập nhật thì giao diện khóa nút.
- **Hủy chốt** (`POST /sewing/plan/unlock`): mở các chuyền đang chốt của đơn vị trong ngày; người khác vừa ghi chuyền đó sau lúc mở màn (`versions`) thì 409.
- `versions` là `[{ line, version }]`: khóa `line` (không phải mã cột `lineCode`) để chính sách cột của Tổ SX không chặn lần ghi, như quyết định 13.10. Câu báo lỗi không nêu chuyền khi Tổ SX không xem được, nêu Id dòng dàn chuyền khi Mã hàng hoặc Tổ SX không xem được.
- Ngày đã chốt hiện bản chụp; ngày chưa chốt hiện số mới nhất của Xếp chuyền (Cập nhật ghi lại bản chụp).
- **Ngày trước hôm nay** (giờ Việt Nam): chỉ xem, không Cập nhật, Chốt, Hủy chốt (422), kể cả Toàn quyền. Ngày sau hôm nay lập trước được. Phiên `A00`: chỉ xem.

### Màn hình

- Dải trên: Đơn vị phòng ban (`TreeSelect` dựng từ `/me/lines`: cây bộ phận cha `ancestors` tới chuyền (tên, mã các bộ phận cha tới gốc cây trả cho mọi người đăng nhập, như tên bộ phận cha trực tiếp trước đây: mức nhạy cảm thấp, chấp nhận); mỗi nhóm có dòng "Cả <bộ phận>"; dòng đầu là mọi chuyền), Ngày (mặc định hôm nay), dải trạng thái chốt (Chưa chốt; Đã chốt kèm người, lúc chốt; Đã chốt n/m chuyền; Ngày đã qua, chỉ xem), nút Chốt, Hủy chốt (khóa kèm lý do). Ngày, đơn vị ghi lên URL (`?date=&dept=`); đổi khi còn ô chưa cập nhật thì hỏi lại.
- Khung dưới: ô **Danh sách mã hàng** (lọc theo mã hàng, tên sản phẩm), nút Thêm dòng; lưới `SheetGrid` đúng thứ tự cột ảnh, 4 ô nhập (ô giờ `sheetTime` hiểu "7:30", "7h30", "730"); nút **Cập nhật**, Bỏ thay đổi. Dòng của chuyền đã chốt, ngoài phạm vi sửa: ô khóa xám. Rời màn khi còn ô chưa cập nhật thì hỏi (`useLeaveGuard`).
- Cột bị Ẩn thì không có cột; bị Che hiện `***`.

### API `/sewing/plan`

| Phương thức, đường dẫn | Quyền | Nội dung |
|---|---|---|
| `GET /sewing/plan?date=&dept=&extra=` | `view` | `{ date, today, editableDay, lines, items }`. `lines`: `branchCode`, `lineCode`, `lineName`, `locked`, `lockedAt`, `lockerName`, `version`, `canEdit`. Mỗi item có khóa trùng mã cột, cộng `lineId`, `lineCreatedAt`, `otherBefore`, `otherAfter`, `saved`, `locked`, `sourceGone`, `canEdit` |
| `GET /sewing/plan/options?dept=` | `view` | Dòng dàn chuyền của các chuyền thuộc đơn vị (Thêm dòng) |
| `PUT /sewing/plan` | `update` (thêm `create` khi phải tạo bản ghi) | `{ date, items: [{ lineId, lineCreatedAt, linemapQty?, dayQty?, startTime?, endTime? }], versions? }`; trả `{ saved }` |
| `POST /sewing/plan/lock`, `/unlock` | `update` (`lock` tạo bản ghi thì cần `create`) | `{ date, dept?, versions? }`; trả `{ locked }`, `{ unlocked }` |

### Phân quyền và chính sách cột

- `sewing.plan`: `ScopeType = BRANCH`, bảng nguồn `SewingDayPlan`, chiều `FACTORY → BranchCode`, `LINE → LineCode` (Trưởng chuyền chỉ thấy chuyền mình). Bảng con `SewingDayPlanItem` theo dòng cha (`ChildRepository`). Ma trận mẫu: Quản trị Xem; Giám đốc Xem, Xuất; Kế hoạch Xem, Thêm, Sửa, Xuất; Trưởng chuyền Xem; Toàn quyền đủ (màn chưa có Xuất file).
- Cột đăng ký: `lineCode`, `styleCode`, `poBuyDate`, `cmPrice` (nhạy cảm), `startDate`, `endDate`, `planQty`, `deliveredQty`, `remainQty`, `linemapQty`, `dayQty`, `planRevenue` (nhạy cảm), `startTime`, `endTime`. Mẫu: Giám đốc, Kế hoạch xem Giá CM, Doanh số (Chỉ đọc); vai trò khác mặc định Ẩn. Số suy ra trả null khi cột gốc không xem được: `remainQty` (từ `planQty`, `deliveredQty`), `planRevenue` (từ `cmPrice`, `linemapQty`), `otherBefore`, `otherAfter`. Tên chuyền không trả khi Tổ SX bị Ẩn, Che; tên sản phẩm không trả khi Mã hàng bị Ẩn, Che. Đã giao của hai ngày liền nhau trừ nhau ra Kế hoạch ngày xưởng giao: người xem được Đã giao suy ra được số trong ngày (theo định nghĩa của cột). Câu báo giao vượt không nêu số khi Tổng kế hoạch hoặc Đã giao không xem được.

### Database (`MES_Sewing/0003_sewing_day_plan.sql`, `0004_sewing_day_plan_item_created_by.sql`)

| Bảng | Cột chính | Ràng buộc, chỉ mục |
|---|---|---|
| `SewingDayPlan` (một chuyền, một ngày) | `Id`, `PlanDate DATE`, `LineCode NVARCHAR(20)` (Q1), `IsLocked`, `LockedAt`, `LockedBy`, `LockerName NVARCHAR(150)`, `BranchCode` + bộ kiểm toán | `UNIQUE (Id, BranchCode)`, `UNIQUE (BranchCode, PlanDate, LineCode)`; `CK_SewingDayPlan_Lock`; `IX_SewingDayPlan_Branch_Line (BranchCode, LineCode, PlanDate)`; chỉ mục có lọc trên `LockedBy`, `CreatedBy` |
| `SewingDayPlanItem` (một dòng dàn chuyền trong ngày) | `Id`, `SewingDayPlanId`, `ShipmentPlanLineId`, `SourceCreatedAt`, `ShipmentPlanId`, `StyleCode`, `ProductName`, `PoBuyDate`, `CmPrice DECIMAL(18,4)`, `StartDate`, `EndDate`, `PlanQty DECIMAL(18,2)` (bản chụp), `LinemapQty`, `DayQty DECIMAL(18,2)`, `StartTime`, `EndTime TIME(0)`, `SortOrder`, `BranchCode` + bộ kiểm toán | FK ghép tới cha, xóa theo cha; `UNIQUE (SewingDayPlanId, ShipmentPlanLineId)`; `CHECK` số ≥ 0, `EndTime > StartTime`, `EndDate ≥ StartDate`; `IX_SewingDayPlanItem_Branch_Line (BranchCode, ShipmentPlanLineId) INCLUDE (…)`, `IX_SewingDayPlanItem_Plan`, `IX_SewingDayPlanItem_CreatedBy` (có lọc, `0004`) |

Khóa ngầm (`softkeys.json`): `BranchCode` của hai bảng → `MES_Core.SysBranch.Code`; `SewingDayPlan.LineCode` (NVARCHAR) → `MES_Hr.Department.Code` (VARCHAR, cùng ĐVCS); `LockedBy`, `CreatedBy` của hai bảng → `MES_Core.SysUser.Id`; `SewingDayPlanItem.ShipmentPlanLineId` → `MES_Order.ShipmentPlanLine.Id`, `ShipmentPlanId` → `MES_Order.ShipmentPlan.Id` (cùng ĐVCS). Mã chuyền ở bảng mới so với mã `VARCHAR` của bảng khác trong code, không join chéo database.

### Chặn ở Xếp chuyền (quyết định 14.2)

Đơn hàng mở điểm đăng ký `LineDayPlanGuards` (`backend/src/modules/order/line-day-plan-guard.ts`); module May đăng ký `SewingDayPlanRepository.usageQuick` lúc khởi động (chờ khóa tối đa 3 giây). Lưu dàn chuyền (`LinePlanService.saveLines`), sau khi ghi dòng dàn chuyền, trước commit (đang giữ khóa ghi nên lần Cập nhật Kế hoạch may chạy chồng phải chờ và đọc số mới; hai bên chờ nhau qua hai database thì câu tra hết giờ, Xếp chuyền 409 "thử lại"): dòng bị bỏ hoặc đổi chuyền mà đã có số (linemap hoặc ngày xưởng giao > 0), dòng giảm Số lượng dưới tổng đã giao mọi ngày: 409, câu báo nêu chuyền (nêu số khi người lưu xem được Đã giao ở Kế hoạch may). Không tra được: 409 "thử lại".

### Nhật ký

`SysAuditLog`, entity `SewingDayPlan` (Id bản ghi chuyền × ngày), ghi sau khi `MES_Sewing` commit: `UPDATE` (mỗi dòng gửi lên: số cũ, mới), `LOCK`, `UNLOCK`. Bỏ cột nhạy cảm.

### Script

- `reset:demo`, `load:bravo` gọi `clearSewingDayPlan` (`backend/scripts/sewing-data.ts`): xóa hết bản ghi Kế hoạch may (Id dòng dàn chuyền đánh số lại). Máy chưa chạy `MES_Sewing/0003` thì bỏ qua.
- `sim:board` luôn giữ (kể cả `--all`) kế hoạch mô phỏng có dòng dàn chuyền đã có bản ghi ở Kế hoạch may (`dayPlanLines`).

### Test

| File | Nội dung chính |
|---|---|
| `backend/test/sewing-plan.spec.ts` | `ScheduleFeed.dayPlanLines` (khoảng ngày, Kết thúc ra chuyền trống, ĐVCS, `A00`); lưới theo đơn vị phòng ban, Thêm dòng; Cập nhật, Đã giao các ngày, Doanh số, giao vượt (cả ngày sau), giờ, số lẻ, gửi trùng, ngày đã qua, dòng khác thời điểm tạo, ĐVCS khác; phiên bản 409; Chốt, bản chụp, Hủy chốt, ngày đã qua; Xếp chuyền giảm, bỏ, đổi chuyền 409; phân quyền (`A00`, Giám đốc, Trưởng chuyền, ĐVCS khác, thiếu quyền Thêm); chính sách cột; Giá CM nhập ở ĐVCS có kế hoạch, kế hoạch đổi theo; nhật ký |
| `frontend/src/test/sewing-plan.test.tsx` | Luật tính (Đã giao, Còn lại, Doanh số, giao vượt, dòng Tổng, thân lệnh, lọc mã hàng, ô giờ, cây Đơn vị phòng ban); màn: Chốt gửi đúng ngày, đơn vị, phiên bản; trạng thái chốt, ngày đã qua; chỉ có quyền Xem; popup sửa riêng Giá CM ở Thông tin đơn hàng |

### Giới hạn hiện tại

- Chưa có Xuất file; chưa nhập năng suất theo giờ, chưa giao việc cho cụm (màn này chỉ là căn cứ).
- Giờ mặc định cố định 07:30 – 17:10, không ca qua đêm, chưa theo danh mục Ca làm việc.
- Cập nhật, Chốt, Hủy chốt chung quyền Sửa: chưa tách người chốt.
- Hai database không có transaction chung: hai bên kiểm lại sau khi ghi, chờ nhau thì Xếp chuyền hết giờ chờ, trả 409 (quyết định 14.2).
- Tổ SX bị Che với người xem: mã chuyền là `***` nên giao diện không gửi phiên bản (`versions`), máy chủ không phát hiện người khác vừa ghi cùng chuyền cùng ngày (người lưu sau thắng; chuyền đã chốt vẫn bị chặn); hộp Thêm dòng không chọn được chuyền (review 5.16 N1). Không Che Tổ SX với vai trò được Sửa Kế hoạch may.
