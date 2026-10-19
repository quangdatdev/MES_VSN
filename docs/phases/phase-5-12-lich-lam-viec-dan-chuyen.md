# Phase 5.12 – Lịch làm việc theo ĐVCS, tự tính ngày ở Chi tiết dàn chuyền

Trạng thái: **Ready for review** (13/10/2026; lập kế hoạch 13/10/2026; người dùng chốt Q1–Q5 cùng ngày: Q3 chỉ đọc, còn lại theo đề xuất). Commit `92f2817` (nhánh `phase-5-12`, worktree `MES-wt-512`), gộp vào `main` bằng `507318b` ngày 14/10/2026, đã lên `origin/main`. Quyết định liên quan ([Quyết định](../update_docs/13-quyet-dinh.md)): 3.3 (danh mục dùng chung không qua `BaseRepository`), 6.2 (danh mục Nhà máy SX gắn ĐVCS), 9.5 và mục chưa khớp #16 (Kế hoạch chuẩn bị SX chưa trừ ngày nghỉ).

## Mục tiêu

Người dùng yêu cầu 13/10/2026: ở popup **Chi tiết dàn chuyền** (Xếp chuyền, [Đơn hàng](../update_docs/06-don-hang.md) mục 4.5), hệ thống tự tính các cột để người lập kế hoạch nhập lại ít nhất. Kèm theo là một danh mục **cấu hình ngày làm việc theo từng ĐVCS**.

| Cột | Hiện tại | Sau phase |
|---|---|---|
| Số ngày SX | Tự tính: làm tròn lên (Số lượng / Năng suất TB) | Giữ nguyên |
| Số ngày nghỉ | Nhập tay ("ngày nghỉ khác"; Chủ nhật đã tự bỏ) | Tự tính: số ngày nghỉ theo lịch ĐVCS (ngày nghỉ trong tuần, lễ, Tết; trừ ngày làm bù) từ Bắt đầu vào chuyền tới Kết thúc vào chuyền |
| Kết thúc vào chuyền (đang tên "Ngày kết thúc") | Tự tính, chỉ bỏ Chủ nhật | Ngày làm việc thứ (Số ngày SX) tính từ Bắt đầu vào chuyền, theo lịch ĐVCS; bằng Bắt đầu + Số ngày SX + Số ngày nghỉ − 1 (Q1) |
| Bắt đầu ra chuyền | Nhập tay | Bắt đầu vào chuyền + 3 ngày (Q2) |
| Kết thúc ra chuyền | Nhập tay | Kết thúc vào chuyền + 3 ngày |
| Bắt đầu nhập kho | Nhập tay | Bắt đầu ra chuyền + 2 ngày |
| Kết thúc nhập kho | Nhập tay | Kết thúc ra chuyền + 5 ngày |

Điều kiểm được:

- Một dòng chỉ cần nhập Chuyền, Số lượng, Năng suất TB, Bắt đầu vào chuyền. Sáu cột còn lại hiện ngay khi gõ, thanh xem trước trên bảng dàn chuyền đổi theo. Khi lưu, máy chủ tính lại, không dùng số client gửi.
- Cùng đầu vào, hai ĐVCS có lịch nghỉ khác nhau cho ra ngày khác nhau (có test).
- Quản trị thêm ngày nghỉ Tết vào lịch một ĐVCS: mở lại kế hoạch của ĐVCS đó, lưu, thấy ngày đã tính theo lịch mới.
- Bảng dàn chuyền tô ngày nghỉ theo lịch ĐVCS của từng chuyền, không chỉ tô Chủ nhật.

## Thiết kế đề xuất

### Dữ liệu (`MES_Core`, migration `0011_work_calendar.sql`)

Làm theo mẫu Nhà máy SX: danh mục đặt ở `MES_Core`, có cột `BranchCode` (khóa ngoại `SysBranch.Code`), sửa ở màn Danh mục hệ thống bằng quyền `admin.catalog`, không qua `BaseRepository` (quyết định 3.3, 6.2).

- `SysWorkCalendar`: mỗi ĐVCS một dòng. Gồm `Id`, `BranchCode` (UNIQUE), các ngày nghỉ trong tuần (mặc định Chủ nhật), 4 số ngày lệch `OutStartOffsetDays` (3), `OutEndOffsetDays` (3), `WarehouseStartOffsetDays` (2), `WarehouseEndOffsetDays` (5), cùng `CreatedAt/By`, `ModifiedAt/By`. CHECK: trong tuần có ít nhất một ngày làm việc; mỗi số lệch từ 0 đến 60.
- `SysWorkCalendarDay`: ngày đặc biệt của một lịch. Gồm `Id`, `WorkCalendarId` (khóa ngoại), `CalendarDate DATE`, `DayType` (`OFF` là nghỉ lễ, Tết, nghỉ công ty; `WORK` là làm bù), `Name NVARCHAR(100)` (ví dụ "Tết Nguyên đán"), cùng `Created`/`Modified`. UNIQUE (`WorkCalendarId`, `CalendarDate`).
- ĐVCS chưa có dòng lịch thì dùng lịch mặc định viết trong code (nghỉ Chủ nhật, lệch 3/3/2/5), màn danh mục hiện chữ "Mặc định". Lần lưu đầu tạo dòng. Không chèn dòng đại diện.
- Không tạo lịch cho ĐVCS tổng hợp (`A00`), giống Nhà máy SX.
- Ngày đặc biệt xóa vật lý (dùng khi nhập nhầm ngày) và có ghi nhật ký. Đây là ngoại lệ với quy ước "danh mục không xóa vật lý", vì dòng này không có mã và không bảng nào tham chiếu tới. Ghi thành quyết định mới ở `13-quyet-dinh.md`, nhóm 6, cạnh 6.2.

### Hàm tính, chỉ viết một chỗ ở backend

Hàm thuần (không gọi DB) đặt ở `backend/src/platform/catalog/work-calendar.ts`, gồm `isOffDay` và `scheduleDates({ start, productionDays, calendar })`. Hàm trả `offDays`, `endDate`, `outStartDate`, `outEndDate`, `warehouseStartDate`, `warehouseEndDate`.

- Đếm ngày làm việc từ Bắt đầu vào chuyền (tính cả ngày đầu) cho đủ Số ngày SX. Số ngày nghỉ là mọi ngày nghỉ gặp trên đường đếm, kể cả ngày nghỉ chỉ lọt vào khoảng sau khi ngày kết thúc bị đẩy lùi. Cách lấy khoảng [bắt đầu, bắt đầu + Số ngày SX] rồi đếm ngày nghỉ một lần sẽ thiếu các ngày này.
- Bắt đầu vào chuyền rơi vào ngày nghỉ thì đếm từ ngày làm việc kế tiếp, và ngày đó tính vào Số ngày nghỉ. Nhờ vậy đẳng thức Kết thúc = Bắt đầu + SX + Nghỉ − 1 luôn đúng.
- Giữ giới hạn Số ngày SX ≤ 366. Hàm chỉ tìm trong khoảng tối đa khoảng 3 năm; quá thì trả 422 "Lịch nghỉ của ĐVCS không đủ ngày làm việc".
- Ngày ra chuyền, nhập kho cộng theo ngày làm việc hay ngày lịch: theo Q2.
- Module Đơn hàng đọc lịch qua `CatalogLookupService.workCalendar(branchCode, from, to)` (cache 30 giây; sửa danh mục thì gọi `invalidateWorkCalendar()`), không đọc thẳng `MES_Core`.
- Frontend có bản sao hàm ở `frontend/src/lib/workCalendar.ts` để xem trước khi gõ. Hai bản chạy chung một bộ ca kiểm (cùng bảng đầu vào và kết quả) để không lệch nhau. Khi lưu, kết quả của máy chủ là chuẩn.
- Thay `addWorkingDays` ở `order.util.ts` và bản sao trong `LinePlanPage.tsx`.

### Chi tiết dàn chuyền

- `GET /order/line-plans/:id` trả thêm `calendar` của ĐVCS kế hoạch: ngày nghỉ trong tuần, số ngày lệch, các ngày đặc biệt trong khoảng cần dùng. Chỉ cần quyền `order.lineplan:view`, không cần quyền danh mục.
- `saveLines` không đọc `offDays` và 4 ngày ra chuyền, nhập kho từ client nữa, mà tính bằng hàm trên theo lịch ĐVCS của kế hoạch. DTO vẫn nhận các trường cũ (rồi bỏ qua) trong một bản phát hành, để giao diện cũ chưa tải lại không bị 422.
- Lưới: 6 cột chuyển sang chỉ đọc, đổi tên theo yêu cầu: Bắt đầu vào chuyền, Số ngày nghỉ, Kết thúc vào chuyền, Bắt đầu ra chuyền, Kết thúc ra chuyền, Bắt đầu nhập kho, Kết thúc nhập kho. Tiêu đề cột có tooltip ghi công thức. Ô vàng nhắc nhập chỉ còn ở 4 ô nhập.
- Dòng đã lưu có ngày khác với ngày tính theo lịch hiện tại (lịch vừa đổi) thì popup nhắc "Lịch nghỉ đã đổi, bấm Lưu để tính lại". Không tự tính lại hàng loạt.
- Bảng dàn chuyền: `GET /order/line-plans/board` trả thêm ngày nghỉ của từng ĐVCS trong khoảng đang xem. `LineBoard` tô ngày nghỉ theo ĐVCS của từng chuyền, vì `A00` xem chuyền của nhiều ĐVCS cùng lúc.

### Danh mục hệ thống

Thêm khung "Lịch làm việc" vào `CatalogsPage` (một `kind` mới trong `overview`):

- Chọn ĐVCS.
- Phần cấu hình: ngày nghỉ trong tuần, 4 số ngày lệch.
- Bảng ngày đặc biệt theo năm. Thêm được một ngày hoặc một khoảng ngày (ví dụ Tết 7 ngày), chọn áp cho nhiều ĐVCS một lần; chép ngày đặc biệt từ năm khác hoặc ĐVCS khác; xóa.

API ở `/admin/catalogs/work-calendars…`, quyền `admin.catalog:view|create|update` (Q4). Nhật ký ghi trong transaction (`logStrict`), như Nhà máy SX. Dựng giao diện theo skill `frontend-design`.

### Script, dữ liệu mẫu

- `seed-order.ts`, `simulate-board.ts`: dùng hàm mới với lịch của ĐVCS. Seed máy demo thêm vài ngày lễ mẫu cho `A01`, `A02`.
- `reset-demo.ts`: đặt lại lịch mẫu.
- Sửa test theo luật mới: `simulate-board.spec.ts`, `phase5.spec.ts` (đoạn "Xếp chuyền: số ngày SX, ngày kết thúc bỏ Chủ nhật").

## Chốt với người dùng

| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Công thức gửi ghi "Kết thúc vào chuyền = Bắt đầu vào chuyền + Số ngày SX **–** Số ngày nghỉ". Trừ thì càng nhiều ngày nghỉ càng kết thúc sớm, ngược với ý nghĩa. Có phải là **cộng**? | **Cộng** (theo đề xuất), tính cả ngày đầu: Bắt đầu + SX + Nghỉ − 1. Ví dụ: vào chuyền thứ Hai 05/10/2026, SX 10 ngày, nghỉ Chủ nhật 11/10 thì kết thúc thứ Năm 15/10 |
| Q2 | "+3, +3, +2, +5 ngày" là ngày lịch hay ngày làm việc? Cố định cho mọi ĐVCS hay đặt theo từng ĐVCS? | **Ngày làm việc** (theo đề xuất) theo lịch ĐVCS (không rơi vào Chủ nhật, lễ); số ngày lệch đặt trong cấu hình từng ĐVCS, mặc định 3/3/2/5 |
| Q3 | Sáu cột tự tính có cho sửa tay không? | **Chỉ đọc, không cho chỉnh** (người dùng chốt), luôn theo công thức. Cho sửa tay thì cần thêm cờ "sửa tay" cho từng ô, nếu không thì đổi Bắt đầu vào chuyền sẽ tính đè số đã sửa; làm sau nếu cần |
| Q4 | Ai sửa lịch làm việc? | **Quản trị** (`admin.catalog`, theo đề xuất), như các danh mục khác; nhập Tết một lần cho nhiều ĐVCS. Nếu Kế hoạch từng ĐVCS tự sửa thì cần tài nguyên quyền riêng và chỉ sửa được ĐVCS đăng nhập |
| Q5 | Dòng cũ đã nhập tay Ngày nghỉ, ngày ra chuyền, nhập kho: lần Lưu kế tiếp sẽ bị tính lại theo công thức. Có cần giữ số cũ? | **Không giữ** (theo đề xuất); không chạy tính lại hàng loạt, dòng chỉ được tính lại khi người dùng Lưu |

Điểm tự chọn theo hướng hợp lý (người dùng có thể đổi):

- Tên bảng, tên cột như mục Dữ liệu.
- Lịch theo ĐVCS của kế hoạch, không theo nhà máy hay chuyền.
- ĐVCS chưa có lịch thì dùng lịch mặc định trong code.
- Ngày đặc biệt xóa vật lý.
- DTO giữ trường cũ thêm một bản phát hành.
- Dòng Đang may, Đã xong vẫn được tính lại ngày khi Lưu, như cách tính Ngày kết thúc hiện nay.

## Task

Ước lượng tổng: 5–6 ngày công.

| # | Việc | Trạng thái |
|---|---|---|
| 5.12.0 | Worktree `D:\Thispc\WorkSpace-BuildWeb\MES-wt-512`, nhánh `phase-5-12` tách từ `main`; chép `backend/.env`, chạy `npm install`; bộ database test riêng `MES_*_T512` | Xong 13/10: worktree từ `28001c4`, chép `.env`, `npm install`; bộ `MES_*_T512` đã migrate và seed mẫu (chưa xóa, chờ người dùng) |
| 5.12.1 | Migration `MES_Core/0011_work_calendar.sql`, kiểu Kysely, hàm tính thuần `work-calendar.ts` kèm test đơn vị cho các ca biên: bắt đầu vào ngày nghỉ, Tết dài, làm bù Chủ nhật, ngày nghỉ lọt vào khi đẩy lùi, lịch không đủ ngày làm (0,5–1 ngày) | Xong 13/10. `work-calendar.spec.ts` 12/12 (8 ca tính tay trong `backend/test/fixtures/work-calendar-cases.json`). Migration đã chạy trên bộ test T512, **chưa chạy trên máy chủ** |
| 5.12.2 | API danh mục lịch (`catalog.service`, `catalog.controller`), `CatalogLookupService.workCalendar`, nhật ký; test backend cho quyền, `A00`, ngày trùng, áp nhiều ĐVCS. Chạy `code-reviewer` (migration, `/admin/*`) (1 ngày) | Xong 13/10. `catalog.spec.ts` có bài lịch làm việc; nhãn nhật ký ở màn Nhật ký |
| 5.12.3 | Khung "Lịch làm việc" ở Danh mục hệ thống (`frontend-design`), test frontend (1 ngày) | Xong 13/10: `WorkCalendarPane.tsx` (lịch 12 tháng, bấm ngày để đặt), `catalog-work-calendar.test.tsx` 4/4. Đã xem trên Chrome không giao diện với backend thử (1366×768, 1366×1500, 390×844) |
| 5.12.4 | Backend dàn chuyền: `saveLines` tính theo lịch, `get` trả lịch, board trả ngày nghỉ; sửa `phase5.spec.ts`, thêm test lịch `A01` khác `A02` (1 ngày) | Xong 13/10. Thay bài "lịch A01 khác A02" bằng: quản trị đặt ngày nghỉ cho A01 thì lần lưu sau và bảng dàn chuyền đổi theo, client gửi ngày bị bỏ qua (`phase5.spec.ts`) |
| 5.12.5 | Frontend Chi tiết dàn chuyền: bản frontend của hàm tính kèm bộ ca chung, cột chỉ đọc và tên mới, nhắc lịch đổi, `LineBoard` tô ngày nghỉ; test popup (hiện chưa có test popup này) (1–1,5 ngày) | Xong 13/10: `line-plan-schedule.test.tsx` 2/2, `work-calendar.test.ts` 10/10 |
| 5.12.6 | Script `seed-order`, `simulate-board`, `reset-demo` và test; tài liệu (`06`, `05`, `12`, `13`, `02`); `code-reviewer` cả phase; lint, test, build (0,5–1 ngày) | Script, tài liệu xong 13/10 (`06`, `05`, `12`, `13` mục 6.8). Xong 13/10 sau review: lint, build qua; frontend 30 file, 217/217; backend toàn bộ trên T512: 349 qua, 2 bỏ qua, 2 hỏng đã biết (cần dữ liệu chép BRAVO). Review `docs/review/phase-5-12.md`: 0 CRITICAL, 0 HIGH, M1 đã sửa, M2 sửa phần dữ liệu (phần thiết kế ở "Phát sinh") |

### Worktree, chạy song song

- Làm ở worktree `MES-wt-512` (nhánh `phase-5-12`, tách từ `main` `28001c4`). Phiên Kế hoạch xuất hàng đang có thay đổi chưa commit trong `MES` (`shipment.service.ts`, `ShipmentPage.tsx`, test). Làm ở worktree thì hai phiên không chạm vào nhau, và không đổi nhánh dưới chân phiên kia.
- `docs/` bị git-ignore nên worktree không có. Tài liệu sửa ở `MES/docs`; sửa từng đoạn nhỏ vì phiên kia cũng sửa `06-don-hang.md`, `02-trang-thai.md`.
- `vite.config.ts` gắn proxy cứng sang cổng 3000. Muốn mở giao diện của worktree trong lúc `MES` đang chạy dev server thì có hai cách: dùng API giả như phase 5.11, hoặc dừng dev server của `MES` trước.
- Chạy song song (tùy chọn): sau 5.12.1, khi bảng và hàm tính đã chốt, nhóm danh mục (5.12.2–5.12.3) và nhóm dàn chuyền (5.12.4–5.12.5) không phụ thuộc nhau. Có thể tách hai nhánh `p512-a`, `p512-b` như phase 5.10, rồi gộp về `phase-5-12`.
- Gộp vào `main` khi người dùng đã duyệt và phiên Kế hoạch xuất hàng đã commit. File có thể đụng nhau: `frontend/src/features/order/api.ts`. Trước khi gộp, kiểm lại chưa ai dùng số migration `MES_Core/0011`.

## Phạm vi review

- `backend/migrations/MES_Core/0011_*`, `backend/src/platform/catalog/*`, `backend/src/platform/database/core.types.ts`.
- `backend/src/modules/order/line-plan.service.ts`, `order.dto.ts`, `order.util.ts`, `order.repositories.ts` (nếu sửa).
- `backend/scripts/seed.ts`, `seed-data.ts`, `seed-order.ts`, `simulate-board.ts`, `reset-demo.ts`.
- `frontend/src/features/admin/CatalogsPage.tsx` và khung mới, `frontend/src/features/order/LinePlanPage.tsx`, `LineBoard.tsx`, `api.ts`, `frontend/src/lib/workCalendar.ts`.
- Test thêm, sửa ở `backend/test`, `frontend/src/test`.

## Không làm

- Lịch theo Nhà máy SX, theo chuyền, theo ca; ngày làm nửa buổi; tăng ca.
- Áp lịch cho Kế hoạch chuẩn bị SX (mục chưa khớp #16, chờ BA chốt ngày lịch hay ngày làm việc). Lịch dùng lại được khi BA chốt.
- Tự tính lại hàng loạt dàn chuyền khi lịch đổi.
- Lấy ngày lễ từ BRAVO hay Nhân sự; tự sinh Tết theo âm lịch (Tết nhập tay mỗi năm).
- Đăng ký các cột của dòng dàn chuyền vào chính sách cột (hiện chưa cột nào được đăng ký).

## Rủi ro

- Hàm tính ở frontend và backend lệch nhau: giảm bằng bộ ca chung; khi lưu, máy chủ là chuẩn.
- Ngày của dòng cũ đổi khi Lưu lại (Q5); thanh trên dàn chuyền mô phỏng cũng đổi.
- Chưa có lịch thật cho từng ĐVCS: trước khi quản trị nhập, kết quả bằng luật cũ (chỉ bỏ Chủ nhật) cộng các ngày lệch.
- Phiên khác cùng sửa tài liệu `06`, `02`.

## Phát sinh

- Bỏ "chép ngày đặc biệt từ năm khác hoặc ĐVCS khác" khỏi khung Lịch làm việc: đặt một khoảng ngày cho nhiều ĐVCS một lần đã đủ cho Tết; Tết theo âm lịch nên chép từ năm trước không đúng ngày. Làm sau nếu người dùng cần.
- Lưới nhập (`react-datasheet-grid`) gọi `onChange` với giá trị không đổi ngay khi mở popup Chi tiết dàn chuyền trong Chrome không giao diện, làm nút Lưu bật sẵn và thanh hiện "đang sửa". Bản trước phase 5.12 cũng vậy (đã thử lại bản gốc), có thể chỉ xảy ra khi trang không có focus. Chưa sửa (ngoài phạm vi): kiểm trên trình duyệt thật; nếu có thật thì cho `SheetGrid` bỏ lần đổi không làm khác giá trị.
- Màn Nhật ký: thêm nhãn cho `SysWorkCalendar`, `WORK_CALENDAR_*`.
- Khác thiết kế (review M2, chờ người dùng xem): công thức nằm ở nút "Cách tính ngày" (popover theo đúng lịch ĐVCS) thay vì tooltip từng tiêu đề cột, vì lưới nhập không có chỗ gắn tooltip tiêu đề; DTO bỏ hẳn các trường cũ thay vì nhận rồi bỏ qua (ValidationPipe `whitelist` bỏ trường thừa nên giao diện cũ vẫn lưu được, kết quả như nhau); chi tiết kế hoạch chỉ trả ngày đặc biệt từ dòng vào chuyền sớm nhất (hoặc một năm trước hôm nay) trở đi.
- Review lượt 1: `docs/review/phase-5-12.md` (0 CRITICAL, 0 HIGH; M1 và các LOW đã sửa trừ test 409 đồng thời).
