# Review Phase 5.12 – Lịch làm việc theo ĐVCS, tự tính ngày dàn chuyền – 13/10/2026

Phạm vi: nhánh `phase-5-12` (worktree `MES-wt-512`), chưa commit. 34 file:

- **Migration, kiểu:** `backend/migrations/MES_Core/0011_work_calendar.sql`, `core.types.ts`.
- **Backend danh mục:** `backend/src/platform/catalog/` (`work-calendar.ts` mới, `catalog.service.ts`, `catalog.controller.ts`, `catalog.dto.ts`, `catalog-lookup.service.ts`).
- **Backend Đơn hàng:** `backend/src/modules/order/` (`line-plan.service.ts`, `order.dto.ts`, `order.util.ts`).
- **Script:** `backend/scripts/seed.ts`, `seed-data.ts`, `seed-order.ts`, `simulate-board.ts`, `load-bravo-orders.ts`, `reset-demo.ts`.
- **Frontend:** `frontend/src/lib/workCalendar.ts`, `features/admin/WorkCalendarPane.tsx`, `CatalogsPage.tsx`, `types.ts`, `AuditPage.tsx`, `features/order/LinePlanPage.tsx`, `LineBoard.tsx`, `api.ts`, `scheduleDates.ts`, `theme/global.css`.
- **Test:** backend và frontend.

Trọng tâm: phân quyền endpoint mới, ĐVCS của lịch khi lưu dàn chuyền, thuật toán tính ngày và độ khớp hai bản, ràng buộc migration, nhật ký, đồng thời, cache, script seed/reset, ẩn hiện theo quyền, khả năng tiếp cận.

## Lượt 1 (agent `code-reviewer`)

Kết luận agent: **APPROVE WITH SUGGESTIONS**. 0 CRITICAL, 0 HIGH, 2 MEDIUM, 10 LOW.

Phần agent kiểm và thấy đúng:
- **Phân quyền:** 5 endpoint đều có `@RequirePermission`. `branchCode` của danh mục được tra lại trong `SysBranch`. `A00` bị chặn.
- **Lịch khi lưu:** `saveLines` không có cách nào dùng lịch của ĐVCS khác. Trường ngày client gửi bị bỏ qua (`whitelist`).
- **Thuật toán:** tính tay lại 4 ca thấy khớp; đẳng thức Kết thúc = Bắt đầu + SX + Nghỉ − 1 đúng; vòng lặp có giới hạn; bản frontend giống từng dòng bản backend.
- **Migration:** `CK_SysWorkCalendar_Offsets` đủ giữ thứ tự ngày; tên bảng, cột đúng quy ước.
- **Ghi dữ liệu:** xóa rồi thêm trong một transaction; trùng UNIQUE thành 409; mọi lần ghi có `logStrict`.
- **Cache:** `calendarGen` chặn ghi lịch cũ vào cache.
- **Script:** seed không ghi đè lịch đã sửa; `reset-demo` xóa rồi nạp lại; ngày lễ mẫu đúng lịch nghỉ thật 2026.
- **Giao diện:** người chỉ có quyền xem không thấy nút ghi.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| M1 | MEDIUM | `LinePlanPage.tsx` (`outdated`, `outdatedCount`) | Sửa số lượng, năng suất hay ngày của một dòng đã lưu thì cảnh báo "ngày khác lịch hiện tại" hiện sai, vì so số đã lưu với ngày tính từ ô vừa sửa | Tách phần tính sang `features/order/scheduleDates.ts`. `isOutdated` chỉ báo khi ô nhập còn như lúc lưu, so với số đã lưu của chính dòng (`savedById`). Test `schedule-dates.test.ts` có ca sửa số lượng, năng suất, ngày bắt đầu | Đã sửa |
| M2 | MEDIUM | `WorkCalendarPane.tsx`, file kế hoạch phase | Code khác thiết kế đề xuất ở 4 điểm mà chưa ghi: (1) chưa có chép ngày từ năm khác hoặc ĐVCS khác; (2) công thức nằm ở nút "Cách tính ngày" thay vì tooltip tiêu đề cột; (3) chi tiết kế hoạch trả mọi ngày đặc biệt qua mọi năm; (4) DTO bỏ hẳn trường cũ thay vì nhận rồi bỏ qua | (3) sửa: chỉ trả ngày từ dòng vào chuyền sớm nhất, hoặc một năm trước hôm nay, trở đi (`presentCalendar(cal, from)`). (1), (2), (4) ghi vào mục "Phát sinh" của file kế hoạch và hỏi người dùng khi báo cáo. (4) cho kết quả tương đương và `06-don-hang.md` đã ghi đúng | Đã sửa (3); (1), (2), (4) chờ người dùng |
| L1 | LOW | `catalog-lookup.service.ts` (`workCalendar`) | Hết hạn cache thì bảng dàn chuyền ở `A00` đọc lịch N lần cùng lúc | Gộp các lần đọc cùng lúc (`loadingCalendars`), giữ `calendarGen` | Đã sửa |
| L2 | LOW | `catalog.service.ts` (`checkRange`, `deleteWorkCalendarDays`) | Năm `0000` lọt qua kiểm tra rồi thành 500 ở SQL Server; xóa không giới hạn độ dài khoảng | Năm 2000–2100 cho cả đặt và xóa; xóa tối đa 366 ngày một lần. Test thêm ở `catalog.spec.ts` | Đã sửa |
| L3 | LOW | `WorkCalendarPane.tsx` | ĐVCS đã ngừng dùng vẫn hiện nút Lưu, Thêm, ô ngày bấm được; máy chủ trả 422 | Nút ghi chỉ hiện khi ĐVCS đang dùng; giữ nút Xóa (máy chủ cho xóa). Test thêm | Đã sửa |
| L4 | LOW | `LinePlanPage.tsx` | Dòng ngoài phạm vi sửa (không gửi lên) hiện ngày tính lại thay vì số đã lưu | Dòng `!mine` hiện `storedOf` (số đã lưu), cả trên thanh xem trước | Đã sửa |
| L5 | LOW | `line-plan.service.ts` (`saveLines`) | Lấy lịch theo ĐVCS phiên; đúng hiện tại, sai nếu tài nguyên đổi cách lọc ĐVCS | Lấy theo `BranchCode` của kế hoạch (đọc trước transaction; ĐVCS của kế hoạch không sửa được) | Đã sửa |
| L6 | LOW | `LineBoard.tsx` | `title` trên lớp nền có `pointer-events: none` không bao giờ hiện | Bỏ; tên ngày lễ hiện ở tiêu đề cột | Đã sửa |
| L7 | LOW | `WorkCalendarPane.tsx` | Nhóm chip thiếu `role="group"`, lỗi chưa nối `aria-describedby`; ô ngày chỉ xem là `<span>` có `aria-label` nhưng không có role | Thêm nhãn nhóm, `aria-describedby`, `role="img"` cho ô chỉ xem | Đã sửa |
| L8 | LOW | `catalog.service.ts` | Số ĐVCS có lịch riêng đếm cả ĐVCS ngừng dùng; lưu lại cấu hình y hệt vẫn ghi nhật ký; `ensureCalendar` tạo lịch không có nhật ký riêng | Chỉ đếm ĐVCS đang dùng; không ghi khi không đổi (test đếm nhật ký); comment giải thích vì sao `ensureCalendar` không có nhật ký riêng | Đã sửa |
| L9 | LOW | `simulate-board.ts`, `seed-order.ts` | Dấu `!` làm script lỗi `TypeError` khó hiểu khi lịch gần nghỉ hết | Báo lỗi có tên ĐVCS và chỗ kiểm lịch | Đã sửa |
| L10 | LOW | test | Thiếu test: sửa dòng không báo lệch; 409 hai người cùng tạo lịch; bảng dàn chuyền ở `A00`; năm ngoài khoảng | Thêm: `schedule-dates.test.ts`; `catalog.spec.ts` (năm 0000, xóa quá dài, `A00` tô ngày nghỉ riêng từng ĐVCS, không ghi nhật ký khi không đổi). Chưa thêm test 409 đồng thời (cần hai transaction chen nhau; luật dựa vào UNIQUE như các danh mục khác) | Đã sửa một phần |
| L11 | LOW | `catalog.service.ts:116`, `phase5.spec.ts:1075`, `WorkCalendarPane.tsx` | Thiếu khoảng trắng sau `=`; nút năm đi quá 2000–2100 | Sửa định dạng; khóa nút năm ở biên | Đã sửa |
| L12 | LOW | `AuditPage.tsx` | (Agent ghi nhận đúng) nhãn nhật ký mới | | Không phải lỗi |

Sau khi sửa (13/10):
- **Lint, build:** `npm run lint`, `npm run build` qua.
- **Frontend:** 30 file, 217 bài qua.
- **Backend (bộ database test `MES_*_T512`):** `work-calendar`, `simulate-board`, `simulate-board.db`, `catalog`, `phase5` có 87 qua, 2 hỏng. Hai bài hỏng là bài chép BRAVO của `catalog.spec.ts`; chúng cần bảng chép BRAVO có dữ liệu, đã biết từ phase 5.10, không liên quan.
- **Toàn bộ backend** (`jest --runInBand`, bộ T512): 31 bộ, 349 bài qua, 2 bỏ qua, 2 hỏng (đúng hai bài chép BRAVO nói trên). Dòng log `LINE_SCOPE_UPDATE_FAILED` trong lúc chạy là của bài test Nhân sự cố tình gây lỗi đó.

Không còn CRITICAL, HIGH; M1 đã sửa, M2 đã sửa phần dữ liệu, phần thiết kế ghi vào "Phát sinh" chờ người dùng.

## 5.12.1 Công thức ngày dàn chuyền (15/10/2026)

Agent `code-reviewer`, thay đổi chưa commit trên `main`: `lineDates` hai bản (`work-calendar.ts`, `workCalendar.ts`), bộ ca chung, test, popover "Cách tính ngày", nhãn Lịch làm việc. Người review tính tay lại cả 9 ca của bộ ca chung và các số trong `phase5.spec.ts`, đều đúng; hai bản hàm khớp; vòng lặp có chặn; `offsetsInOrder`/CHECK vẫn giữ ngày bắt đầu không sau ngày kết thúc (vì kết thúc vào chuyền luôn sau ngày bắt đầu); `seed-order.ts`, `simulate-board.ts`, `scheduleDates.ts`, `LineBoard.tsx` không vỡ.

| Mức | Phát hiện | Xử lý |
|---|---|---|
| MEDIUM | Thanh bảng dàn chuyền tính cả ngày bắt đầu (không tính sản xuất): dòng SX 1 ngày chiếm 2 ngày; seed, mô phỏng không cho dòng sau bắt đầu đúng ngày kết thúc dòng trước | Hỏi người dùng (Q38, `02-trang-thai.md`); giữ nguyên tới khi chốt |
| MEDIUM | Dòng đã lưu theo công thức cũ nằm lẫn dòng mới; chỉ tính lại khi mở Chi tiết và Lưu | Ghi việc số 13 ở mục Máy chủ; script tính lại hàng loạt chờ người dùng quyết (Q38) |
| LOW | `productionDays` NaN trả kết quả `endDate = start` | Đã sửa: trả null, có test |
| LOW | `06-don-hang.md` mục test còn ghi "− 1"; 6.8 ghi "ngày làm việc cộng thêm" | Đã sửa |
| LOW | Chú thích, `plan.endDate` cũ trong `line-plan-schedule.test.tsx` | Đã sửa |
| LOW | Test yếu: chưa kiểm kết thúc > bắt đầu, ca lịch thưa chỉ kiểm khác null, thiếu ca bắt đầu đúng ngày Tết | Đã thêm cả ba |
| LOW | Dữ liệu test chèn thẳng `EndDate = StartDate` ở vài spec | Không đổi: không đi qua `lineDates` |
| LOW | Dữ liệu demo sau `reset:demo`, `sim:board` mỗi dòng dài thêm 1 ngày | Ghi nhận, không có test khóa ngày mẫu |

Kiểm tra sau khi sửa: lint, build qua; backend `work-calendar`, `simulate-board` 30/30; frontend `work-calendar`, `schedule-dates`, `line-plan-schedule` 19/19 (cùng `catalog-work-calendar`: 23/23 trước lượt sửa LOW); `phase5.spec.ts` trên `MES_*_T514` 45/45 (trước lượt sửa LOW, lượt này không đổi số mong đợi của file đó).

Không còn CRITICAL, HIGH.

## 5.12.2 Năm ngày dàn chuyền sửa tay được (15/10/2026)

Agent `code-reviewer`, thay đổi chưa commit trên `main`. Lượt 1: 0 CRITICAL, 1 HIGH, 2 MEDIUM, 8 LOW.

| Mức | Phát hiện | Xử lý |
|---|---|---|
| HIGH | Người có cột Ngày kết thúc SX Chỉ đọc bấm Lưu là đè Kết thúc vào chuyền đã chỉnh tay của mọi dòng mình sửa được (giao diện tính lại cột khóa lúc mở popup, máy chủ coi thiếu ngày là theo công thức) | Đã sửa: máy chủ `pickDates` giữ ngày đã lưu khi không gửi và ô nhập không đổi (đọc dòng dưới khóa); giao diện `fillGaps` lúc mở, cột khóa chỉ tính lại khi ô nhập đổi. Test backend (`phase5`), frontend (`schedule-dates`, `line-plan-schedule`) |
| MEDIUM | Giao diện cũ chưa tải lại (không gửi ngày) xóa ngày chỉnh tay | Đã sửa cùng gốc với HIGH |
| MEDIUM | Tài liệu lệch code (6.8, 6.10, bảng cột `ShipmentPlanLine`, `02-trang-thai.md`) | Đã sửa |
| LOW | Ô "nhập cùng lượt" nhận ra bằng giá trị khác trước | Ghi giới hạn trong comment `settleDates` và `06-don-hang.md` |
| LOW | `setRows(settleDates(rows, …))` dùng `rows` closure | Không lỗi (người review đã kiểm) |
| LOW | `offDaysOf` không nhớ kết quả | Đã sửa: `WeakMap` theo dòng |
| LOW | Chế độ tối: ô vừa sai vừa khác công thức mất dấu góc | Đã sửa: luật `.sheet-error` dùng `background-color` |
| LOW | Dấu góc chỉ nhìn bằng mắt, không nêu ngày theo công thức | Chưa làm: `SheetGrid` chưa có `title` cho ô; popover và thông báo trên lưới giải thích |
| LOW | Câu "Các cột xám tự tính" trong popover cũ | Đã sửa |
| LOW | Luật thứ tự chưa kiểm Kết thúc ra chuyền ≥ Kết thúc vào chuyền…; nút tính lại cả dòng Đang may; `endDate` Ẩn/Che | Hỏi (Q39, `02-trang-thai.md`) |
| LOW | Thiếu test | Đã thêm: `endDate` Chỉ đọc không gửi, giữ ngày đã lưu; dòng không đổi giữ ngày; đổi năng suất tính lại |

Kiểm tra sau khi sửa: lint, build qua; frontend toàn bộ 34 file, 268 bài; backend `work-calendar`, `simulate-board`, `phase5` trên `MES_*_T514` 76/76.

Không còn CRITICAL, HIGH.

## 5.12.3 Làm tròn Số ngày SX theo ngưỡng của lịch ĐVCS (15/10/2026)

Agent `code-reviewer`, phần 5.12.3 của thay đổi chưa commit. Người review so `productionDaysOf` với phép tính BigInt trên 2.000.600 ca (mọi ngưỡng 0,01–1, số lượng tới 10.000.000, năng suất tới 1.000.000): không lệch; không tràn số; mssql trả `DECIMAL` ra number, mọi chỗ đọc có `Number()`; migration `0014` đúng cú pháp, chạy được khi bản cũ còn chạy. Lượt 1: 0 CRITICAL, 1 HIGH, 1 MEDIUM, 6 LOW.

| Mức | Phát hiện | Xử lý |
|---|---|---|
| HIGH | Ô ngưỡng ở Lịch làm việc gần như không gõ được: `onChange` ép chuỗi gõ dở ("0,", "0,70") thành 0, `clampBehavior="strict"` chặn tiếp | Đã sửa: form giữ `number \| string`, kẹp khi rời ô (`blur`), đổi ra số khi kiểm, xem ví dụ, gửi. Test gõ từng bước "", "0", "0,", "0,3", "0,7", "0,70" |
| MEDIUM | Tài liệu sở hữu thiếu trường mới (API `GET`/`PUT` lịch, bảng cột `SysWorkCalendar`, danh sách migration ở `05`; `calendar` của `GET /order/line-plans/:id` ở `06`) | Đã sửa |
| LOW | Dòng đã lưu: Số ngày SX tính lại theo ngưỡng mới, ngày giữ nguyên | Chủ ý (6.10, 6.11); ghi rõ ở việc máy chủ số 14 |
| LOW | Thông điệp 422 của DTO nói sai lỗi khi gửi chuỗi | Đã sửa: một thông điệp chung cho kiểu, khoảng, số chữ số lẻ |
| LOW | Thiếu test nối dây ngưỡng (giao diện, máy chủ đọc ngưỡng đã lưu) | Đã thêm: `computeLine` với ngưỡng 0,5; `catalog.spec` lưu 0,7 rồi `CatalogLookupService.workCalendar` đọc đúng, tính 7,69 → 7, 7,7 → 8 |
| LOW | Ngưỡng 0,01 không đúng hẳn cách cũ (1001/1000) | Giữ: ghi "gần như"; cho phép 0 thì cần đổi CHECK của `0014` (đã chạy trên bộ test), hỏi người dùng nếu cần |
| LOW | `toCalendar` thiếu ngưỡng thì bỏ phần lẻ | Đã sửa: mặc định 0,5 |
| LOW | Chữ giữ chỗ trong `02-trang-thai.md`, thiếu mục review | Đã sửa |

Ghi chú của người review: ngưỡng gắn với lịch của ĐVCS, không theo từng Nhà máy SX; một ĐVCS nhiều nhà máy cần ngưỡng khác nhau thì phải hỏi lại người dùng.

Kiểm tra sau khi sửa: lint, build qua; frontend toàn bộ 34 file, 282 bài; backend toàn bộ trên `MES_*_T514` 36 bộ, 405 qua, 2 bỏ qua (trước lượt sửa), `catalog.spec` 16/16 sau lượt sửa.

Không còn CRITICAL, HIGH.
