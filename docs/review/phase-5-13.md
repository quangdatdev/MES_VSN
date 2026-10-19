# Review Phase 5.13 – Phân bổ màu cỡ theo kế hoạch xuất hàng – 14/10/2026

## Tình trạng

- **Đã duyệt** (14/10) sau bốn lượt `code-reviewer` (lượt 4 có một lần kiểm lại). Không còn CRITICAL, HIGH.
- Còn mở hai mục, đều không chặn duyệt: L7 (chấp nhận) và L11 (hoãn, cần migration).
- Làm thẳng trên `main` trong `MES`, đã commit `676fd94` (chưa push), không có migration. R1 đã trả lời (duyệt); R2 đã làm theo đề xuất: `LoginPage.tsx` để ngoài commit, chờ bạn xác nhận ba dòng chữ.

## Cần bạn trả lời

Mỗi câu có đề xuất. Bạn chỉ cần trả lời "đồng ý" hoặc chọn phương án khác.

| # | Câu hỏi | Bối cảnh | Đề xuất |
|---|---|---|---|
| R1 | ✅ (14/10: duyệt, commit `676fd94`) Duyệt phase 5.13, gồm cả phần gộp ô và khóa màu cỡ vừa thêm? | Màn đã xem và dùng thử. Gộp ô ở lượt 3; khóa Màu, Cỡ, nút Thêm chép màu cỡ, căn giữa ô gộp ở lượt 4 | Duyệt |
| R2 | ✅ (14/10: người dùng tự commit `40e4177`) Commit thế nào với `LoginPage.tsx`? | File có thay đổi chưa commit **không thuộc phase này**, 3 dòng chữ ở trang đăng nhập: "MES System" → "MES VSN"; "Hệ thống dành cho sản xuất VIETSUN" → "Hệ thống quản lý sản xuất VIETSUN"; chân trang "MES System" → "HQ5". Không rõ ai sửa, có giữ không | Commit phase 5.13 riêng (26 file), để `LoginPage.tsx` ngoài. Bạn xác nhận ba dòng chữ đó rồi commit sau |
| R3 | ✅ (14/10: không push, không deploy lúc này) Deploy lên máy chủ sau khi commit? | Việc máy chủ số 8 (`02-trang-thai.md`): chỉ deploy code, không có migration. Kế hoạch đã phân màu cỡ theo cách cũ có thể lệch vài sản phẩm theo màu cỡ: popup tô đỏ, người dùng sửa rồi lưu | Deploy khi bạn sắp xếp được giờ, rồi kiểm trên app |
| R4 | ✅ (14/10: sửa trong worktree `MES-wt-r4`, nhánh `fix-cut-ratio-qty`, chưa commit) Sửa lỗi mức **Cao** ở Cập nhật tỷ lệ cắt? | Ngoài phase, tìm thấy ở lượt 2 (N1). Người có quyền sửa PO mà cột Số lượng ở mức Chỉ đọc, Ẩn hoặc Che vẫn xóa được hết màu cỡ của PO, đưa Số lượng PO về 0, bằng cách gửi `lines: []` (`cut-ratio.service.ts` `updateColorSizes`). Ghi ở `02-trang-thai.md` mục lỗi tiềm ẩn | Sửa ngay trong một task nhỏ riêng, cùng cách N1 (service kiểm mức cột), kèm test |
| R5 | ✅ (14/10: phase riêng sau 5.14, kế hoạch `docs/phases/sheetgrid-ban-dong.md`) Sửa `SheetGrid` dùng chung? | Thư viện lưới nhập chỉ đọc cột ở lần vẽ đầu. Popup này đã tránh bằng `ref`. Các màn khác có thể bị: Cập nhật tỷ lệ cắt không tô đỏ ô sai phát sinh sau; Chi tiết dàn chuyền mở khi danh sách chuyền chưa tải xong thì ô Chuyền không có lựa chọn. Mới suy ra từ mã thư viện, chưa chạy thử | Làm phase riêng: chạy thử từng màn trước, rồi đổi `SheetGrid` sang bản động của thư viện |
| R6 | ✅ (14/10: đã xóa `T512` cùng 14 bộ `T510*`, 75 database; giữ `_Test`, `T514`) Xóa bộ database test `MES_*_T512`? | Đây là câu (3) của Q35. Bộ này dùng cho test của 5.12 và 5.13, nằm trên SQL Server dùng chung | Xóa sau khi R1–R3 xong. Bạn chạy hoặc cho phép chạy lệnh xóa |
| R7 | Đồng ý các mục chấp nhận, hoãn? | L7: thông báo 409 có thể nêu tổng đã giao của chuyền ngoài phạm vi xem. L11: chỉ mục cho danh sách gom, cần migration. P5: khối dài cuộn mất dòng có chữ thì ô gộp trông trống. Q2–Q5 của lượt 4: dòng dán quá cuối lưới mà không có chuyền, số vẫn được giữ (chép màu cỡ dòng cuối); chèn dưới dòng có màu cỡ không còn trong kế hoạch thì chép màu cỡ lạ đó; nhân bản nhiều dòng một lúc tách khối gộp; ô gộp của lưới xem chỉ tô màu chọn theo dòng đầu | Đồng ý. L11 làm khi danh sách chậm |

## Phạm vi

26 file, không tính tài liệu:

- **Backend Đơn hàng:** `backend/src/modules/order/` (`color-size.service.ts`, `order.repositories.ts`, `line-plan.service.ts`, `shipment.service.ts`, `order.util.ts`, `order.dto.ts`, `order.rules.ts`, `order.controller.ts`, `order.module.ts`).
- **Script:** `backend/scripts/simulate-board.ts`, `seed-order.ts`.
- **Frontend:**
  - `frontend/src/features/order/`: `ColorSizePage.tsx`, `colorSizeRules.ts` (mới), `linePlanRules.ts` (mới, lượt 2), `LinePlanPage.tsx`, `api.ts`, `common.tsx`.
  - `frontend/src/components/DataGrid.tsx` (lượt 4: `rowSpan` cho cột), `SheetGrid.tsx` (lượt 4: `addAtActive`, `deleteReason`, `keepAnchor`).
  - `frontend/src/theme/global.css`.
- **Test:**
  - Backend: `backend/test/phase5.spec.ts`, `catalog.spec.ts`, `simulate-board.db.spec.ts`, `simulate-board.spec.ts`.
  - Frontend: `frontend/src/test/color-size.test.tsx` (mới), `line-plan-rules.test.ts` (mới), `sheet.test.ts`.

Quyết định liên quan: 3.10, 7.1, 7.3, 7.10 (`13-quyet-dinh.md`). `frontend/src/features/auth/LoginPage.tsx` cũng có thay đổi chưa commit, không thuộc phase này nên không review (xem R2).

Trọng tâm review:
- Phạm vi chuyền khi gom một dòng mỗi kế hoạch.
- Chính sách cột của các trường mới: mảng chuyền, NSBQ, phần đã giao của chuyền khác.
- Luật tổng theo màu cỡ và theo chuyền.
- Khóa và thứ tự ghi giữa ba màn cùng ghi phần giao.
- Câu SQL Server, script mô phỏng, lưới nhập.

## Lượt 1 (agent `code-reviewer`)

Kết luận agent: **APPROVE WITH SUGGESTIONS**. 0 CRITICAL, 0 HIGH, 5 MEDIUM, 12 LOW.

Phần agent kiểm và thấy đúng:
- **Phân quyền:** danh sách lọc ĐVCS và phạm vi trên dòng dàn chuyền trước khi gom; kế hoạch cùng ĐVCS nhờ khóa ngoại ghép. Phần đã giao của chuyền ngoài phạm vi chỉ trả tổng. Lọc, sắp xếp, popup giá trị theo cột Chuyền may chỉ thấy chuyền trong phạm vi. Lưu kiểm có chuyền sửa được rồi mới khóa kế hoạch theo Id client gửi, nên không dò được kế hoạch. `A00` bị chặn hai lớp.
- **Chính sách cột:** mảng chuyền, NSBQ bị Che thành `***`, bị Ẩn thì bỏ khóa; `lineName` bỏ theo `lineCode`; `hiddenQty` theo mức của `assignedQty`; file xuất áp theo `field`; câu lỗi 422 không nêu số khi Số lượng kế hoạch bị Ẩn hoặc Che.
- **Đồng thời:** cả ba đường ghi (Phân bổ màu cỡ, Xếp chuyền, sửa Kế hoạch xuất hàng) khóa dòng `ShipmentPlan` trước nên chạy lần lượt.
- **SQL:** `STRING_AGG ... WITHIN GROUP` đúng; bảng dẫn xuất không có ORDER BY; phân trang luôn có ORDER BY kèm Id; số tham số mỗi câu trong giới hạn.
- **Script:** dữ liệu mô phỏng, dữ liệu mẫu theo luật mới (chỉ lưu phần giao > 0, `PlanQty` là SL KHXH).
- **Lưới nhập:** cột dựng một lần, tổng và lỗi đọc qua `ref` nên ô đỏ, cột Còn lại cập nhật trên lưới tĩnh; popup toàn màn hình trên điện thoại, nút khóa có lý do, hỏi lại trước khi bỏ phần đang nhập.

Phiên chính đã kiểm chứng: cả 17 phát hiện đúng (đọc code, chạy test), không có phát hiện sai. M1: agent nhắc phải hỏi người dùng vì code khác tài liệu; ở đây tài liệu là thiết kế của chính phase này (`06-don-hang.md` mục 4.6, file kế hoạch), code lệch thiết kế nên sửa code theo thiết kế, không cần hỏi.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| M1 | MEDIUM | `order.repositories.ts` (`hasLines`), `color-size.service.ts` (`where`) | Lọc cột Chuyền may kiểu `notIn` hiểu là "kế hoạch không có chuyền nào bị bỏ tích", trái 06 mục 4.6 ("có ít nhất một chuyền đã chọn"): cùng một tập chuyền được tích cho hai kết quả tùy cách bấm ở popup lọc | `hasLines(codes, mode)` tách chuỗi mã đã gom bằng `STRING_SPLIT`; `notIn` là còn ít nhất một chuyền không bị bỏ tích. Không dùng truy vấn con agent đề xuất: chuỗi đã gom chỉ có chuyền trong phạm vi xem nên không cần câu phạm vi thứ hai. `STRING_SPLIT` đã dùng ở `BaseRepository`, migration `MES_Order/0007` đòi compatibility level ≥ 130. Test `phase5.spec.ts`: `notIn [L05]` và `in [L03]` cùng cho 1 kế hoạch, `notIn [L03, L05]` cho 0 | Đã sửa |
| M2 | MEDIUM | `colorSizeRules.ts` (`analyze`) | Dòng khóa (chuyền xem được, không sửa được) có màu cỡ không còn trong kế hoạch vẫn bị tính "Có dòng chưa chọn màu, cỡ" và khóa nút Lưu, trong khi người dùng không sửa, không xóa được dòng đó và máy chủ không kiểm dòng của chuyền khác | Dòng khóa không tính lỗi màu cỡ lạ. Test `color-size.test.tsx` | Đã sửa |
| M3 | MEDIUM | `shipment.service.ts` (`update`) | Kế hoạch cũ đang giao lệch vài sản phẩm ở một màu cỡ thì mọi lần sửa SL KHXH đều 409, kể cả khi chỉ tăng màu cỡ khác | Chỉ chặn màu cỡ đang giảm (SL mới nhỏ hơn SL đang lưu, đọc dưới khóa kế hoạch). Xếp chuyền làm tương tự: chỉ chặn dòng đang giảm số lượng (`line-plan.service.ts`). Test `phase5.spec.ts`: dữ liệu giao 250 > SL 200 vẫn sửa được màu cỡ khác, giảm đúng màu cỡ đó thì 409 | Đã sửa |
| M4 | MEDIUM | `ColorSizePage.tsx` (khung theo chuyền, ô Đã giao, chân popup) | Số lượng giao bị Ẩn hoặc Che thì popup hiện "0", "còn N", thanh 0%: người xem hiểu nhầm là chưa giao | Không xem được Số lượng giao (`readable(policy, 'assignedQty')`) thì hiện như máy chủ trả (`***`, –), không tính còn, đủ, vượt; popup chỉ xem, nói lý do. Test `color-size.test.tsx` (Che) | Đã sửa |
| M5 | MEDIUM | test | Thiếu test chính sách cột cho các trường mới và test kế hoạch ĐVCS khác theo Id | `phase5.spec.ts` thêm bài dùng chính sách cột theo người (tài khoản test `test.alloccol`): xem, lưu kế hoạch A01 khi đang ở A02 trả 404; Chuyền may bị Che ở danh sách, chi tiết, CSV, popup giá trị trả 403; Số lượng giao bị Ẩn (lưu có dòng trả 403 `FIELD_READONLY`) rồi bị Che; Số lượng kế hoạch bị Ẩn thì câu lỗi 422 không nêu số. Frontend: bài Số lượng giao bị Che | Đã sửa |
| L1 | LOW | `color-size.service.ts` (`save`) | Ghi phần giao trước dòng dàn chuyền, ngược thứ tự kế hoạch → dòng → màu cỡ (13 mục 3.10) | Ghi dòng dàn chuyền trước, phần giao sau | Đã sửa |
| L2 | LOW | `simulate-board.ts` (`clearSimulated`) | Lần sửa chỉ bỏ bớt phần giao không để lại dấu, `sim:board` xóa mất kế hoạch người dùng đã sửa (máy demo) | `save` ghi `ModifiedAt`, `ModifiedBy` cho chuyền có phần giao đổi, kể cả khi trạng thái không đổi; `clearSimulated` đã coi dòng có `ModifiedAt` là người dùng sửa. Test `phase5.spec.ts` (chuyền Đang may đổi phần giao có `ModifiedAt`, chuyền không đổi thì không). Bài test này lộ ra chuyền chỉ bị đổi thứ tự dòng (phần giao các chuyền xen kẽ nhau theo `SortOrder`) cũng bị ghi `ModifiedAt`: sửa để chỉ thêm, bỏ, sửa số lượng giao mới tính là đổi | Đã sửa |
| L3 | LOW | `LinePlanPage.tsx` (`saveLines`) | Hỏi lại khi bỏ chuyền chỉ dựa vào `statusCode`: cột này bị Ẩn hoặc Che thì phần giao bị xóa không hỏi. Đổi chuyền của dòng thì phần giao đi theo mà tài liệu không nói | Không đọc được `statusCode` thì hỏi cho mọi dòng đã lưu bị bỏ. Ghi hành vi đổi chuyền ở 06 mục 4.5. Không thêm cờ `hasAllocation` agent đề xuất | Đã sửa |
| L4 | LOW | `ColorSizePage.tsx` (tiêu đề, toast) | Mã hàng bị Ẩn thì tiêu đề thành "undefined (KH-…)", bị Che thì thừa dấu cách | Tiêu đề, toast chỉ ghép phần đọc được | Đã sửa |
| L5 | LOW | `ColorSizePage.tsx` (hỏi lại khi chia theo SL chuyền) | Câu hỏi ghi "Bấm Hủy" nhưng nút là "Giữ lại" | Nút đổi thành "Giữ số cũ", câu khớp tên nút | Đã sửa |
| L6 | LOW | `color-size.service.ts` (`save`) | Câu lỗi "Dòng N" đánh số theo dữ liệu gửi lên (đã bỏ dòng trống, dòng 0, dòng khóa), khác số thứ tự trên lưới | Câu lỗi nêu chuyền, màu, cỡ | Đã sửa |
| L7 | LOW | `order.util.ts` (`assignedVisible`) | Thông báo 409 của Xếp chuyền, Kế hoạch xuất hàng có thể nêu tổng đã giao của chuyền ngoài phạm vi xem của người sửa ở Phân bổ màu cỡ | Chấp nhận: người sửa có quyền trên chính kế hoạch đó, chỉ lộ tổng (như `totalExcept`). Ghi ở 06 mục 5 | Chấp nhận |
| L8 | LOW | `order.repositories.ts` | `any` không có lý do (`allocationOrder`, `planQuery`, `planLineValues`) | Comment lý do ở `allocationOrder`, `planQuery` (câu trên bảng dẫn xuất lồng hai tầng, Kysely không suy được kiểu); `planLineValues` bỏ `any` | Đã sửa |
| L9 | LOW | `order.module.ts`, `order.repositories.ts` | Thụt lề sai, `///` thay cho `//` | Sửa | Đã sửa |
| L10 | LOW | file kế hoạch phase | Bảng task chưa cập nhật | Cập nhật bảng task, ghi phần thay đổi sau review ở mục Phát sinh | Đã sửa |
| L11 | LOW | `order.repositories.ts` (`planQuery`) | Mỗi lần gọi danh sách đều gom mọi dòng dàn chuyền trong phạm vi; lọc trên chuỗi đã nối không dùng được chỉ mục. Chấp nhận được ở quy mô hiện tại | Không sửa: chỉ mục gợi ý `(BranchCode, ShipmentPlanId) INCLUDE (…)` cần migration, chỉ làm khi dữ liệu lớn và người dùng đồng ý | Hoãn |
| L12 | LOW | `order.repositories.ts` (`allocationStatus`) | Mã `ALLOCATED` mang hai nghĩa trong cùng một kết quả: "Đã phân đủ" ở mức kế hoạch, "Đã phân màu cỡ" ở dòng dàn chuyền | Mức kế hoạch dùng `FULL` (`PLANNED`, `PARTIAL`, `FULL`), cả backend, frontend, tài liệu | Đã sửa |

Phiên chính tự thêm khi sửa: chuyền ở `A00` không còn `editable` (trước đây giao diện có thể hiện chuyền "sửa được" ở `A00`, máy chủ vẫn chặn).

Sau khi sửa (14/10):
- **Lint, build:** `npm run lint` (backend, frontend, `deploy`), `npm run build` qua.
- **Frontend:** 31 file, 233 bài qua (`color-size.test.tsx` 11 bài).
- **Backend liên quan** (bộ database test `MES_*_T512`): `phase5`, `column-filter`, `catalog`, `simulate-board.db`, `simulate-board`, `shipment-plan-lines-service`, `shipment-plan-pos`: 7 bộ, 100 bài qua.
- **Toàn bộ backend** (`jest --runInBand`, bộ T512): 32 bộ, 355 bài qua, 2 bỏ qua. Sau phần sửa L2 (cách đánh dấu chuyền đổi), `phase5.spec.ts` chạy lại 45/45.
- **Giao diện:** Chrome không giao diện với backend thử trên bộ T512 (tài khoản Kế hoạch): danh sách, popup, chia theo SL chuyền ở 1366×768 và 390px, không tràn ngang.

MEDIUM đã sửa hết; LOW đã sửa trừ L7 (chấp nhận, đã ghi tài liệu) và L11 (hoãn, cần migration; ghi ở `02-trang-thai.md`).

## Lượt 2 – kiểm bản sửa lượt 1 (agent `code-reviewer`)

Kết luận agent: **APPROVE WITH SUGGESTIONS**. 0 CRITICAL, 0 HIGH, 1 MEDIUM, 5 LOW.

Agent xác nhận các mục của lượt 1 đã đóng: M1–M5, L1–L10, L12 và phần `editable` ở `A00`. L11 chưa đóng vì chưa ghi vào `02-trang-thai.md` (N5). Agent chạy `tsc --noEmit` (backend, frontend), `eslint` trên các file của phase, `vitest` các bài liên quan; không chạy test có database.

Phiên chính đã kiểm chứng: cả 6 phát hiện đúng. N1: `FieldPolicyService.assertWritable` chỉ duyệt khóa có trong body, `{ rows: [] }` không có khóa nào. Cùng kiểu lỗi có ở Cập nhật tỷ lệ cắt (`cut-ratio.service.ts` `updateColorSizes`, DTO cho `lines: []`), ngoài phase.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| N1 | MEDIUM | `color-size.service.ts` (`save`) | Người có `order.colorsize:update` mà cột Số lượng giao không Sửa được (Chỉ đọc, Ẩn, Che) vẫn bỏ hết phần giao của các chuyền mình sửa được bằng `rows: []`. Có từ trước phase | Service kiểm mức cột Số lượng giao trước khi đọc kế hoạch (403 `FIELD_READONLY`, như `po-allocation.service.ts` `setFactory`). Test `phase5.spec.ts`: Chỉ đọc, `rows: []` trả 403, phần giao giữ nguyên. Quy tắc ghi ở `04-phan-quyen.md` mục 8.3. Lỗi cùng kiểu ở Cập nhật tỷ lệ cắt ghi ở `02-trang-thai.md` mục lỗi tiềm ẩn, hỏi người dùng | Đã sửa |
| N2 | LOW | `colorSizeRules.ts` (`analyze`), `color-size.service.ts` (`get`) | Ô Đã giao của popup có thể nhỏ hơn cột Số lượng giao của danh sách: phần giao cũ của chuyền ngoài phạm vi cho màu cỡ đã bỏ khỏi kế hoạch không có trong `hiddenQty` | Ghi cách tính ở 06 mục 4.6. Không thêm trường API: chỉ xảy ra với dữ liệu cũ, vì Kế hoạch xuất hàng đã chặn bỏ màu cỡ đang có phần giao | Ghi tài liệu |
| N3 | LOW | `ColorSizePage.tsx` (`LineMeters`) | SL đã xếp bị Ẩn, Che mà Số lượng giao xem được thì thanh vẽ 0% | Chỉ vẽ thanh khi biết cả hai số. Test `color-size.test.tsx` (SL đã xếp bị Ẩn; bài đầu kiểm thanh có thật để khẳng định "không vẽ thanh" có nghĩa) | Đã sửa |
| N4 | LOW | test | Thiếu test: (a) `rows: []` khi Chỉ đọc; (b) Xếp chuyền với dữ liệu cũ giao vượt SL chuyền; (c) hỏi lại L3; (d) M4 khi Ẩn, tiêu đề L4; (e) so CSV phụ thuộc CRLF | (a) như N1. (b) `phase5.spec.ts`: chuyền giao 750 > SL 700, lưu giữ 700 được, giảm còn 699 thì 409. (c) Tách bộ lọc dòng cần hỏi lại thành `linePlanRules.ts` (`droppedAllocated`), test `line-plan-rules.test.ts`; không test qua giao diện vì lưới nhập không vẽ ở jsdom. (d) `color-size.test.tsx`: Số lượng giao bị Ẩn; Mã hàng bị Che, Ẩn. (e) Tìm dòng có mã hàng của fixture | Đã sửa |
| N5 | LOW | `02-trang-thai.md`, báo cáo này | 02 còn ghi In progress, số test cũ, chưa có L11; báo cáo còn chỗ chờ điền | Cập nhật 02 (trạng thái, L11, việc máy chủ số 8, lỗi tiềm ẩn), điền kết quả | Đã sửa |
| N6 | LOW | `LinePlanPage.tsx` (toast lưu dàn chuyền) | Mã hàng bị Ẩn thì toast "undefined (KH-…)", bị Che thì "*** (KH-…)". Có từ trước | `planLabel` dùng chung cho toast và tiêu đề popup Chi tiết dàn chuyền (tiêu đề có cùng lỗi) | Đã sửa |

Sau khi sửa (14/10):
- **Lint, build:** `npm run lint`, `npm run build` qua.
- **Frontend:** 32 file, 240 bài qua (chạy hai lần).
- **Toàn bộ backend** (`jest --runInBand`, bộ T512): 32 bộ, 355 bài qua, 2 bỏ qua.

Sau lượt 2: không còn CRITICAL, HIGH; còn mở L7 (chấp nhận), L11 (hoãn, cần migration).

## Lượt 3 – gộp ô Màu, Cỡ, SL KH ở popup (agent `code-reviewer`)

Người dùng yêu cầu sau khi xem màn (14/10): một màu cỡ tách cho nhiều chuyền thì gộp ô Màu, Cỡ, SL KH như ô merge của Excel. Chỉ đổi hiển thị, database giữ nguyên.

Phạm vi: `colorSizeRules.ts` (`mergeRuns`, `mergeClass`), `ColorSizePage.tsx`, `DataGrid.tsx` (thêm `className` cho cột), `global.css`, `color-size.test.tsx`, tài liệu 06, 10.

Kết luận agent: **APPROVE WITH SUGGESTIONS**. 0 CRITICAL, 0 HIGH, 1 MEDIUM, 6 LOW.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| P1 | MEDIUM | `colorSizeRules.ts` (`mergeRuns`) | Khối gộp lẫn dòng khóa (nền xám) và dòng sửa được (nền vàng): ô gộp loang màu, chữ nằm ở dòng người dùng không sửa được. Gặp ở tài khoản trưởng chuyền | Dòng khóa chỉ gộp với dòng khóa. Test `color-size.test.tsx` | Đã sửa |
| P2 | LOW | `global.css` | Rê chuột ở lưới xem tô một dòng của khối | Ô gộp giữ nền khi rê chuột | Đã sửa |
| P3 | LOW | `ColorSizePage.tsx`, `global.css` | Chữ ô nối tiếp bị gỡ khỏi trình đọc màn hình | Ẩn khỏi mắt bằng `clip`, chữ vẫn trong DOM | Đã sửa |
| P4 | LOW | `06-don-hang.md` | Câu tài liệu dễ hiểu nhầm lưới xem có cột Còn lại | Sửa câu | Đã sửa |
| P5 | LOW | `ColorSizePage.tsx` | Cuộn qua mất dòng đầu khối thì dòng nối tiếp trông trống | Giữ như Excel | Chấp nhận (R7) |
| P6 | LOW | `ColorSizePage.tsx` | Ô ở dòng nối tiếp vẫn sửa được, dễ tưởng đổi cả khối | Lượt 4: Màu, Cỡ thành ô chỉ đọc theo yêu cầu người dùng | Đã đóng (lượt 4) |
| P7 | LOW | `ColorSizePage.tsx` | Gán `ref.current` khi render | Giữ, cùng mẫu `checkRef` đã có | Chấp nhận |

Sau khi sửa (14/10):
- **Lint, build:** qua.
- **Frontend:** 32 file, 242 bài qua.
- **Giao diện:** Chrome (1366) với bộ T512, tài khoản Kế hoạch: khối gộp đúng; xóa dòng đầu khối thì dòng dưới hiện lại chữ. Lưới chỉ xem kiểm bằng test (trên bộ T512 chưa đăng nhập được tài khoản chỉ xem).
- Không chạy lại test backend: lượt này không đổi backend.

Không còn CRITICAL, HIGH. Còn mở: L7 (chấp nhận), L11 (hoãn, cần migration).

## Lượt 4 – khóa Màu, Cỡ; nút Thêm chép màu cỡ; căn giữa ô gộp (agent `code-reviewer`)

Người dùng yêu cầu sau khi xem màn (14/10):
- Màu SP, Cỡ SP, Số lượng KH cố định, không cho sửa.
- Thêm dòng tự chép màu, cỡ, SL KH, không bắt chọn tay lại.
- Ô gộp căn giữa cả ngang và dọc.

Thay đổi:
- `ColorSizePage.tsx`: Màu, Cỡ thành ô chỉ đọc; dòng mới chép màu cỡ của dòng ngay trên (`settleNew`); mỗi màu cỡ giữ ít nhất một dòng (`lastOfCell`, `lostCells`); lưới xem gộp bằng `rowSpan`.
- `SheetGrid.tsx`: `addAtActive` (Thêm chèn dưới dòng đang chọn, chọn sẵn ô nhập được đầu tiên), `deleteReason`, `keepAnchor`, biến CSS `--sheet-row-h`.
- `DataGrid.tsx`: `rowSpan` thay `className` của lượt 3.
- `colorSizeRules.ts`: `mergeRuns`, `mergeClass` có vị trí trong khối; chữ ở dòng giữa khối, khối chẵn dòng dời lên nửa dòng.

Kết luận agent lần đầu: **BLOCK**. 0 CRITICAL, 1 HIGH, 3 MEDIUM, 7 LOW. Kiểm lại sau khi sửa: **APPROVE WITH SUGGESTIONS**, 0 CRITICAL, 0 HIGH, 1 MEDIUM mới (đã sửa), 4 LOW.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| Q1 | HIGH | `SheetGrid.tsx`, `ColorSizePage.tsx` | Dòng neo của nút Thêm, chèn dòng nhớ theo sự kiện chọn ô. Xóa dòng thì thư viện giữ chỉ số ô mà không báo: Thêm, Shift+Enter, menu chèn tạo dòng mang màu cỡ của dòng đã xóa, nằm dưới khối khác | Dòng mới không nhớ màu cỡ: `createRow` tạo dòng trống, `settleNew` chép màu cỡ của dòng ngay trên chỗ chèn. Neo của nút Thêm sau khi xóa là dòng ở chỉ số ô đang chọn (`keepAnchor`). Test `color-size.test.tsx`, `sheet.test.ts`. Chrome: xóa dòng thứ hai của khối S rồi Thêm, dòng mới mang màu cỡ của dòng đang thấy chọn | Đã sửa |
| Q2 | MEDIUM | `ColorSizePage.tsx` | Xóa nhiều dòng một lúc lách luật giữ ít nhất một dòng mỗi màu cỡ (`blockedDeletes` xét từng dòng) | `lostCells` chặn cả lần đổi làm mất hết dòng sửa được của một màu cỡ. Test | Đã sửa |
| Q3 | MEDIUM | `colorSizeRules.ts` (`mergeRuns`) | Màu cỡ có cả dòng khóa và dòng sửa được thì không gộp (cách sửa P1 của lượt 3), trái yêu cầu gộp | Bỏ điều kiện khóa: bốn cột gộp nay đều chỉ đọc, cùng nền. Test | Đã sửa |
| Q4 | MEDIUM | `ColorSizePage.tsx` | Dán quá cuối lưới tạo dòng chép màu cỡ của ô bắt đầu dán | Dòng vừa tạo đã có chuyền hoặc số (do dán) bị bỏ, nhắc người dùng. Test | Đã sửa |
| Q5 | MEDIUM | `SheetGrid.tsx` | Kiểm lại: dời neo trước khi màn nhận dữ liệu, lần xóa bị màn từ chối vẫn dời neo | Dời neo trong effect theo `value` (chỉ khi dữ liệu đổi thật) | Đã sửa |
| Q6 | LOW | `SheetGrid.tsx` | Sau Thêm chọn ô cùng cột cũ, có thể là ô chỉ đọc | Chọn ô nhập được đầu tiên (Chuyền) | Đã sửa |
| Q7 | LOW | `global.css` | `top: -16px` gắn cứng chiều cao dòng | `--sheet-row-h` do SheetGrid đặt | Đã sửa |
| Q8 | LOW | `DataGrid.tsx`, `global.css` | Điều kiện của `rowSpan` chưa ghi; ô gộp mất nền dòng đang chọn | JSDoc; nền ô gộp theo dòng đang chọn | Đã sửa |
| Q9 | LOW | `ColorSizePage.tsx` | Dự phòng `newRow` tạo dòng không sửa được | Bỏ, dòng mới luôn qua `settleNew` | Đã sửa |
| Q10 | LOW | test | Đường chèn của `addAtActive` chưa có test | Tách `keepAnchor`, `settleNew`, `lostCells` thành hàm thuần có test; đường chèn kiểm trên Chrome (lưới không vẽ ở jsdom) | Đã sửa |
| Q11 | LOW | `global.css` | Khối dài cuộn mất dòng có chữ thì ô gộp trông trống | Như P5: số chuyền mỗi kế hoạch hiện 1–4 | Chấp nhận (R7) |
| Q12 | LOW | `SheetGrid.tsx` | Toast chặn xóa chỉ nêu lý do của dòng đầu | Ít gặp | Chấp nhận |
| Q13 | LOW | `colorSizeRules.ts` (`settleNew`) | Kiểm lại: dòng dán quá cuối mà không ghi được giá trị nào vẫn được giữ, chép màu cỡ dòng cuối | Vô hại (dòng trống không gửi lên) | Chấp nhận (R7) |
| Q14 | LOW | `colorSizeRules.ts` (`settleNew`) | Kiểm lại: chèn dưới dòng có màu cỡ không còn trong kế hoạch thì chép màu cỡ đó | Có số giao thì `analyze` báo lỗi, không sai dữ liệu | Chấp nhận (R7) |
| Q15 | LOW | thư viện (`duplicateRows`) | Kiểm lại: nhân bản nhiều dòng một lúc chèn sau dòng cuối vùng chọn, tách khối gộp | Có từ trước, dữ liệu vẫn đúng | Chấp nhận (R7) |
| Q16 | LOW | `global.css` | Kiểm lại: ô gộp của lưới xem chỉ tô màu chọn theo dòng đầu | Lưới xem của popup không chọn dòng | Chấp nhận (R7) |

Sau khi sửa (14/10):
- **Lint, build:** qua.
- **Frontend:** 32 file, 246 bài qua. Một lần chạy toàn bộ báo 32 file hỏng mà không bài nào chạy (lỗi khởi động bộ chạy test); chạy lại qua hết, chạy riêng từng file cũng qua.
- **Giao diện:** Chrome (1366) với bộ T512, tài khoản Kế hoạch: Thêm khi chưa chọn có nhắc; chọn ô rồi Thêm chèn dòng chép màu cỡ ngay dưới, ô Chuyền được chọn; xóa dòng rồi Thêm đúng màu cỡ; khối 2 và 4 dòng chữ nằm giữa khối.
- Không chạy lại test backend: lượt này không đổi backend.

Không còn CRITICAL, HIGH. Còn mở: L7 (chấp nhận), L11 (hoãn, cần migration).

## Sau lượt 4 – bỏ khung theo dõi từng chuyền

Người dùng yêu cầu (14/10): bỏ khung tổng giao của từng chuyền ở đầu popup, vì kế hoạch có thể nhiều chuyền. Xóa hẳn `LineMeters` (`ColorSizePage.tsx`) và CSS `.alloc-line*`, không chỉ ẩn. Luật chuyền giao vượt SL đã xếp (`analyze`, máy chủ) giữ nguyên, lỗi vẫn hiện ở khung cảnh báo. Mục N3 của lượt 2 (thanh của chuyền) không còn áp dụng.

Chỉ xóa code hiển thị, không thêm logic, nên không chạy thêm lượt `code-reviewer`. Kiểm: lint, build qua; frontend 32 file, 246 bài qua (bài của khung theo chuyền đổi sang kiểm ô Đã giao, chân popup, nút Chia theo SL chuyền).
