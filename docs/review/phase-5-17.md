# Review Phase 5.17 – Kế hoạch xuất hàng: mỗi ĐVCS một kế hoạch mỗi đơn, mỗi PO một kế hoạch, thêm PO khi sửa

## Lượt 1 (16/10/2026)

### Phạm vi

Thay đổi chưa commit trên `main` (sau `4aa23f0`), gồm cả file mới chưa track.

- Backend: `backend/src/modules/order/order.repositories.ts` (`poFreeExpr`, `orderWithoutPlanIn`, `SalesOrderPoRepository.inAnyPlan`, `ShipmentPlanRepository.plannedBySalesOrder` với `sharingPoIds`, `planOfOrder`), `shipment.service.ts` (`candidates`, `candidatePos`, `planCandidatePos`, `freePos`, `draftFor`, `withAdded`, `create`, `update`), `order.dto.ts` (`DraftQuery`, `ShipmentPlanUpdateDto.addPoIds`), `order.controller.ts` (`GET :id/candidate-pos`, `GET draft`).
- Test: `backend/test/phase5.spec.ts`, `backend/test/shipment-plan-pos.spec.ts`, `frontend/src/test/shipment-plan-add-po.test.tsx` (mới).
- Frontend: `frontend/src/features/order/ShipmentPage.tsx` (`PlanDialog`, `PlanPoPicker` mới, ghi chú ở `StylePicker`).
- Tài liệu: `docs/phases/phase-5-17-khxh-mot-ke-hoach-moi-don.md`, `docs/update_docs/13-quyet-dinh.md` mục 15.1–15.3, `06-don-hang.md` mục 4.3 và bảng API.
- Đọc thêm để kiểm hành vi: `backend/src/platform/data/base.repository.ts` (`limit`, `branchOnly`, `allows`, `lockBranchRow`, `ChildRepository.insert`), `backend/scripts/seed-order.ts`, `backend/scripts/simulate-board.ts`, `frontend/src/lib/queryClient.ts`, migration `MES_Order/0001`, `0008` (chỉ mục `ShipmentPlanPo`, `ShipmentPlan`).

Không chạy test có database, không chạy migrate/seed (database dùng chung). Lượt này chạy lại `vitest` cho `shipment-plan-add-po.test.tsx` (3/3 qua). Phiên chính đã chạy `tsc`, lint backend/frontend, test backend `phase5.spec`, `shipment-plan-pos.spec`, `phase3.spec`, `cutting.spec` trên `MES_*_T514` (92/92), frontend 36 file 295 bài, build.

### Điểm làm tốt

- **Deny by default giữ nguyên.** API mới `GET /:id/candidate-pos` đòi cả `order.shipment:update` lẫn `order.po:view`, có `@FieldResource('order.po')`. Service gọi `assertWritable` (`A00` trả 403) rồi `getById(..., 'update')`, nên kế hoạch ĐVCS khác hoặc ngoài phạm vi sửa trả 404 (có test). Dữ liệu PO đi qua `pos.list` (phạm vi L3 của `order.po`), `fields.shape` và `poSort`, nên không xếp theo cột bị Ẩn/Che (có test khi Ngày xuất bị Ẩn).
- **`BranchCode` lấy từ token.** `orderWithoutPlanIn(scope.branchCode)` và `planOfOrder` (qua `branchOnly`) chỉ dùng ĐVCS của phiên. `planPos.insert` lấy `BranchCode` của dòng PO-kế hoạch từ phiên (`branchFor`). Client không gửi ĐVCS ở đâu cả.
- **Không SQL thô ở service.** Hai biểu thức `NOT EXISTS` mới nằm ở file repository, theo đúng tiền lệ `poInPlanExpr`. Điều kiện phân quyền vẫn do `BaseRepository` dựng.
- **Thứ tự khóa không đổi.** `create` khóa đơn hàng (`orders.lock` → `lockBranchRow`, UPDLOCK theo `Id`, không lọc ĐVCS vì đơn hàng dùng chung) rồi mới kiểm `planOfOrder` và `inAnyPlan`. `update` có `lines` thì khóa đơn (`lockBranchRow`), đọc lại PO của kế hoạch, kiểm PO thêm, rồi mới khóa kế hoạch. Như vậy mọi đường ghi `ShipmentPlanPo` xếp hàng trên đúng một dòng `SalesOrder`, vì PO thêm phải thuộc đơn của kế hoạch (`draft` kiểm `SalesOrderId`, sai thì rollback 422). Không có vòng khóa mới với Xếp chuyền (chỉ khóa kế hoạch), Xóa kế hoạch (chỉ khóa kế hoạch) và sửa Giá CM (đơn rồi kế hoạch). Kiểm "đã có kế hoạch" và "PO đã dùng" chạy dưới khóa, nên hai người cùng lập không lọt (có test chạy song song).
- **Câu báo lỗi giữ kín.** 409 "PO đã nằm trong kế hoạch" không nêu số PO, chỉ trả `details.poIds` là Id client vừa gửi. 409 "đơn đã có kế hoạch" chỉ nêu số kế hoạch khi người lập xem được dòng đó (`allows(scope, 'view', existing)` xét cả phạm vi `OWNER`). Ngoại lệ về chính sách cột: xem L1.
- **`inAnyPlan` theo phạm vi xem của `order.po`.** Người không có `order.po:view` thì không bao giờ nhận 409, chỉ nhận 422 từ `draft`, nên không dò được PO nào đã vào kế hoạch.
- **Logic 15.3 đúng.** `plannedBySalesOrder` chỉ trừ kế hoạch có dùng chung ít nhất một PO. `sharingPoIds` rỗng trả `[]` (không sinh `IN ()`). `detail`, `draft`, `update` dùng cùng một cách tính. Bảng mã hàng của popup Thêm mới vẫn trừ theo cả đơn, đúng 15.3 (có test 1.800/1.200).
- **Tương thích với frontend cũ lúc deploy.** Bản giao diện cũ gửi `poIds` kèm `excludePlanId`: máy chủ bỏ `poIds` và tự đọc PO của kế hoạch, ra cùng kết quả. `PUT` không có `addPoIds` chạy như trước. Popup Thêm mới cũ nhận danh sách đã lọc. Lập trùng thì 409 có câu báo rõ.
- Đổi `GET draft` khi sửa sang "máy chủ đọc PO của kế hoạch, client chỉ gửi PO thêm" làm hẹp bề mặt API: trước đây client gửi `poIds` tùy ý.
- Frontend: `closeOnEscape` của popup Sửa tắt khi `PlanPoPicker` mở, nên Esc chỉ đóng popup trên cùng. Thêm PO tính là có thay đổi (hỏi trước khi đóng, `useLeaveGuard`). Lưu bị khóa khi lưới màu cỡ đang tải lại (`isPlaceholderData && isFetching`). Nút "Chọn mã hàng" khóa kèm lý do khi thiếu `order.po:view` hoặc `planQty` không sửa được.

---

### CRITICAL

Không có.

### HIGH

Không có.

---

### MEDIUM

**[MEDIUM] M1 `backend/src/modules/order/shipment.service.ts:493-523` (`update`), `frontend/src/features/order/ShipmentPage.tsx:453` (`queryKey` của draft): lưới cũ lưu đè thì mất các dòng màu cỡ của PO người khác vừa thêm**

Mức chắc chắn: cao về cơ chế (đã đọc đường code). Khả năng xảy ra: thấp đến vừa, cần hai người cùng sửa một kế hoạch.

- **Rủi ro:** trước 5.17, tập PO của một kế hoạch không bao giờ đổi, nên lưới màu cỡ client gửi lên luôn khớp tập màu cỡ máy chủ tính. Nay tập này lớn dần:
  1. A mở Sửa kế hoạch K (PO1), lưới có màu cỡ của PO1.
  2. B mở K, thêm PO2 (màu cỡ mới Xanh/S, Xanh/M), nhập SL KHXH, lưu.
  3. A sửa SL một màu cỡ của PO1, bấm Lưu. `lines` chỉ có màu cỡ của PO1, không có `addPoIds`. Máy chủ đọc lại `savedPos = {PO1, PO2}` dưới khóa đơn và tính `draft` trên cả hai PO. `checkLines` chấp nhận (`lines` là tập con). Sau đó `removeWhere` xóa mọi dòng `ShipmentPlanColorSize` rồi chèn lại theo `lines` của A.

  Kết quả: màu cỡ của PO2 cùng SL KHXH B vừa nhập biến mất, không báo gì. `ShipmentPlanPo` vẫn có PO2, nên khung Màu cỡ (đọc từ `ShipmentPlanColorSize`) và lưới PO của kế hoạch không khớp nhau. Guard Phân bổ màu cỡ chỉ chặn khi màu cỡ đã được giao cho chuyền. Ngoài hai người mở cùng lúc, còn một đường khác: `queryKey` của draft khi sửa nay là `[…, salesOrderId, planId, added]`, không còn tập PO. `staleTime` mặc định là 15 giây (`lib/queryClient.ts`), nên A đóng rồi mở lại popup trong vòng 15 giây sau khi B lưu thì `existing` tải mới (dòng "2 PO của kế hoạch") nhưng lưới màu cỡ vẫn lấy bộ nhớ đệm cũ của 1 PO. A lưu là mất đúng như trên.
- **Sửa:**
  1. Frontend: thêm tập PO của kế hoạch vào khóa, ví dụ `planId ? \`${planId}:${plan?.poIds.join(',')}\` : poIds.join(',')`, hoặc đặt `refetchOnMount: 'always'` cho draft khi sửa.
  2. Máy chủ (khóa an toàn, giữ tương thích): `ShipmentPlanUpdateDto` nhận thêm `basePoIds?: number[]`, là tập PO mà lưới của client dựa vào. Frontend gửi `plan.poIds`. Trong `update`, sau khi đọc `savedPos` dưới khóa, nếu `basePoIds` có mà khác `savedPos` thì trả 409 "Kế hoạch vừa được thêm PO, mở lại để tải lưới mới". Client cũ không gửi trường này thì vẫn chạy như cũ. Không nên bắt `lines` phải đủ mọi màu cỡ của draft: test và API hiện cho gửi một phần `lines`, ví dụ `phase5.spec.ts` sửa với một dòng.
  3. Test: B thêm PO rồi A lưu với `basePoIds` cũ thì 409, dòng màu cỡ của PO2 còn nguyên.

**[MEDIUM] M2 `backend/src/modules/order/shipment.service.ts:304-309` (`planCandidatePos`), `:487-497` (`update` có `addPoIds`): thêm PO không kiểm đơn còn thuộc nhà máy SX của ĐVCS, cũng không kiểm trạng thái đơn**

Mức chắc chắn: cao (đọc đường code). Tác động: phải hỏi người dùng. Thiết kế ghi "đơn đổi nhà máy SX không khóa việc này", nhưng quyết định 15.2 người dùng chốt không nói điều này.

- **Rủi ro:** lập mới đòi `assignedOrder` (đơn có Nhà máy SX thuộc ĐVCS phiên) và đơn chưa `DONE`/`CANCELLED`. Thêm PO thì chỉ đòi kế hoạch sửa được. Lý do 15.2 (Q6 (a)) là "PO đã gán nhà máy ở Phân bổ PO nên chỉ sản xuất ở một nơi". Nhưng giả sử đơn O đã chuyển Nhà máy SX hẳn sang A01, A02 vẫn còn kế hoạch cũ của O. Khi đó A02 thêm được mọi PO mới chưa lập kế hoạch của O vào kế hoạch của mình, và:
  - A01 (nơi đang sản xuất) không lập được kế hoạch cho các PO đó nữa, vì mỗi PO một kế hoạch trên toàn công ty.
  - A02 được quyền ghi tỷ lệ cắt của các PO đó qua `usedBy` (`ShipmentPlanPo.BranchCode`), dù đơn không còn thuộc nhà máy nào của A02.

  Sửa số lượng của PO đã có trong kế hoạch là việc khác: không giành thêm PO nào. Tương tự, đơn đã Hủy hay Hoàn thành vẫn nhận thêm PO, tức là vẫn tăng được Số lượng gốc, trong khi lập mới cấm.
- **Sửa (đề xuất, cần người dùng chốt rồi ghi vào 15.2):**
  1. `planCandidatePos` và nhánh `addPoIds` của `update` (dưới khóa đơn) gọi `assignedOrder(scope, plan.SalesOrderId, trx)` và kiểm `StatusCode` như `create`. Sửa SL của PO cũ (không có `addPoIds`) giữ luật hiện tại.
  2. Frontend: 404/422 từ `candidate-pos` hiện lý do ("Đơn không còn thuộc nhà máy SX của đơn vị này" hoặc "Đơn đã hoàn thành/đã hủy").
  3. Test: đổi Nhà máy SX của đơn sang ĐVCS khác thì `candidate-pos` và `PUT addPoIds` bị từ chối, còn `PUT lines` vẫn 200.
  4. Nếu người dùng giữ cách hiện tại: ghi rõ vào 15.2 "Phải nhớ" cùng hệ quả về quyền ghi tỷ lệ cắt.

**[MEDIUM] M3 `backend/scripts/seed-order.ts:118-160`, `backend/scripts/simulate-board.ts:218-221, 280, 514`: dữ liệu mẫu và `sim:board` vẫn sinh dữ liệu trái 15.1, 15.2**

Mức chắc chắn: cao.

- **Rủi ro:** `seed-order.ts` tách một số đơn thành hai đợt (`batches`), tức hai kế hoạch cùng ĐVCS cho một đơn, và mỗi kế hoạch gắn **mọi** PO của đơn. `simulate-board.ts` cũng sinh kế hoạch đợt 1 hoặc đợt `+2` cho cùng đơn, rồi gắn mọi PO (`posOf.get(p.orderId)`). Sau `reset:demo` hoặc `sim:board`, máy demo có ngay dữ liệu "mới" mà 15.1, 15.2 cấm. 15.1 "Phải nhớ" chỉ nói tới "dữ liệu lập trước phase 5.17". Trên máy demo, nút "Chọn mã hàng" ở popup Sửa gần như luôn trống, vì mọi PO đã nằm trong kế hoạch, nên không trình diễn được tính năng của phase này. Đơn tách đợt vẫn trừ lẫn nhau theo 15.3 (dùng chung PO) nên số không sai, nhưng hành vi khác hẳn dữ liệu thật.
- **Sửa:** một trong hai cách:
  1. Sửa hai script: mỗi đơn một kế hoạch mỗi ĐVCS, mỗi PO một kế hoạch. Có thể để một phần PO chưa lập kế hoạch cho demo nút "Chọn mã hàng". Nếu cần đợt, chia PO giữa các kế hoạch thay vì chia số lượng.
  2. Giữ nguyên, nhưng ghi ngoại lệ vào 15.1/15.2 "Phải nhớ" và `12-du-lieu-mau-va-kiem-thu.md`, kèm câu hỏi ở `02-trang-thai.md`.

---

### LOW / SUGGESTION

**[LOW] L1 `backend/src/modules/order/shipment.service.ts:433-436`: câu báo 409 nêu Số kế hoạch không xét chính sách cột `planNo`**

- **Rủi ro:** `planNo` là cột đã đăng ký của `order.shipment` (`seed-data.ts:217`), quản trị đặt Ẩn hoặc Che được. `allows(scope, 'view', existing)` chỉ xét ĐVCS và phạm vi dòng. Người bị Ẩn cột Số kế hoạch vẫn đọc được số này qua câu báo. Mức thấp vì số kế hoạch ít nhạy cảm. Tiền lệ: L4 của 5.16.
- **Sửa:** `const lv = (await this.fields.levels(scope.access, RESOURCE)).levels.get('planNo'); const readable = lv !== 'HIDDEN' && lv !== 'MASKED';` rồi chỉ nêu số khi `readable && allows(...)`. Thêm một ca vào test 15.1. Sửa câu 15.1 thành "khi người lập xem được kế hoạch đó và cột Số kế hoạch".

**[LOW] L2 `frontend/src/features/order/ShipmentPage.tsx:849, 860, 509`: PO vừa bị người khác lấy vẫn được tích ngầm khi mở lại popup, lý do khóa Lưu không đúng**

- **Rủi ro:** người dùng thêm PO P (chưa lưu), người khác đưa P vào kế hoạch khác. Lưới draft trả 409 "Có một PO đã nằm trong kế hoạch… Mở lại danh sách PO rồi chọn lại". Làm theo câu báo: `PlanPoPicker` khởi tạo `ids = selected` (vẫn có P), nhưng danh sách tải mới không có dòng P. P vẫn được tích mà không thấy, không bỏ tích được. Bấm Xác nhận thì bị khóa "Chưa đổi PO nào", hoặc gửi lại P và lại 409. Trong lúc đó `lines` rỗng nên nút Lưu báo "Nhập SL KHXH cho ít nhất một màu cỡ", không đúng lý do thật. Lối ra duy nhất là "Bỏ PO vừa thêm", và câu báo không nhắc tới.
- **Sửa:** khi `pos.data` về, lọc `ids` theo các dòng còn trong danh sách (hoặc `onConfirm` chỉ nhận Id có trong `pos.data`) và báo "n PO vừa được kế hoạch khác lấy, đã bỏ chọn". Trong `saveBlocked`, khi `draft.error` thì trả "Chưa tải được màu cỡ" trước nhánh `total <= 0`. Câu 409 của máy chủ đổi thành "…Bỏ PO vừa thêm hoặc mở lại danh sách PO." Thêm test vitest: draft trả 409 sau khi thêm PO.

**[LOW] L3 `backend/test/phase5.spec.ts`, `backend/test/shipment-plan-pos.spec.ts`, `frontend/src/test/shipment-plan-add-po.test.tsx`: thiếu test cho các tiêu chí 5.17.2 và tranh chấp**

- Chưa có:
  - `PUT addPoIds` với PO của đơn khác (tiêu chí 5.17.2 "PO đơn khác 422"; `GET draft?addPoIds=` cũng vậy).
  - `addPoIds` với PO ngoài phạm vi L3 của `order.po` (tiêu chí "PO ngoài phạm vi `order.po` bị từ chối").
  - Hai `PUT` cùng thêm một PO vào hai kế hoạch của hai ĐVCS, hoặc `PUT` A01 song song với `POST` A02 cùng PO: một 200/201, một 409. Đây là bài chứng minh khóa đơn giữ được 15.2. Hiện chỉ có bài hai lần `POST` song song.
  - 409 "đơn đã có kế hoạch" khi người lập chỉ thấy kế hoạch mình tạo (`OWNER`): câu báo không có số kế hoạch.
  - Ca M1 (`basePoIds` cũ thì 409), ca M2 nếu sửa.
  - Frontend: Esc khi `PlanPoPicker` mở chỉ đóng popup trên; draft lỗi 409 sau khi thêm PO (L2); đóng popup Sửa sau khi thêm PO thì hỏi trước.
- **Sửa:** thêm các bài trên. Bài song song có thể theo mẫu `Promise.all` của bài "hai người cùng lập".

**[LOW] L4 Tài liệu chưa khớp code sau 5.17**

- `docs/update_docs/02-trang-thai.md:34`: dòng 5.17 vẫn ghi "Chờ duyệt kế hoạch… còn Q6… Chưa sửa code".
- `docs/update_docs/06-don-hang.md:101`: "Hai ĐVCS cùng đưa một PO vào kế hoạch thì cả hai sửa được", và dòng 183 "(một PO có thể nằm trong nhiều kế hoạch)". Từ 15.2 thì chỉ còn đúng với dữ liệu cũ. Chú thích `posOfPlan` (`shipment.service.ts:335-336`) cũng vậy.
- `docs/update_docs/13-quyet-dinh.md`, bảng tra ADR, dòng 0013: cột "Phần không còn hiệu lực" chưa ghi phần "PO dùng chung giữa nhiều kế hoạch" của mục 11 (đã thay bằng 15.2).
- **Sửa:** cập nhật các chỗ trên. Câu ở `06-don-hang.md` ghi "dữ liệu lập trước phase 5.17".

**[LOW] L5 `backend/src/modules/order/order.repositories.ts:211-215`, `shipment.service.ts:386-397`: dọn nhỏ ở `inAnyPlan`/`withAdded`**

- `inAnyPlan` chọn `PoNumber` mà không ai dùng. Cột này có thể bị Ẩn, nên tốt nhất đừng đọc ra để tránh lỡ đưa vào câu báo sau này. Chỉ chọn `Id`.
- `withAdded` kiểm "đã nằm trong kế hoạch" trước khi `draft` kiểm PO thuộc đơn. PO của đơn khác mà đã vào kế hoạch thì nhận 409 thay vì 422 như tài liệu ghi. Có thể thêm `.where('SalesOrderId', '=', salesOrderId)` vào `inAnyPlan` (truyền đơn vào) để PO đơn khác luôn ra 422 ở `draft`.

---

### Ghi chú

- **Thứ tự deploy:** frontend mới gọi `GET draft` khi sửa mà không có `poIds`. Backend cũ đòi `poIds` (`@Matches` bắt buộc) nên trả 400. Deploy backend trước, frontend sau, hoặc cùng lúc như `npm run demo`. Ngược lại thì ổn (xem Điểm làm tốt). Nên ghi một dòng vào `11-van-hanh.md` hoặc ghi chú deploy của phase.
- **Dữ liệu cũ (Q2):** kế hoạch cũ có PO dùng chung một phần (X: PO1+PO2, Y: PO2+PO3) thì "SL đã tạo KHXH" của Y trừ toàn bộ SL của X, kể cả phần thuộc PO1. Như vậy là trừ dư, nghĩa là chặt hơn chứ không lỏng hơn, và đúng lời 15.3. Không cần sửa, chỉ cần biết.
- **Kế hoạch không có PO** (chỉ có thể có ở dữ liệu nạp tay): `draftFor` khi sửa nay luôn gọi API (trước đây frontend chặn khi `poIds` rỗng). `pos.list` với `Id in []` có thể lỗi SQL. Code ứng dụng không tạo được kế hoạch như vậy (DTO đòi ít nhất 1 PO, khóa ngoại chặn xóa PO), nên chỉ cần nhớ.
- Quyền của `GET draft` (Q34) giữ nguyên trạng thái câu hỏi. Đường sửa mới không mở rộng gì thêm: chỉ đọc PO của kế hoạch xem được cộng PO trong phạm vi `order.po`.

### Kết luận lượt 1

> Review Summary: examined 9 files (7 file code, test sửa; 1 test frontend mới; tài liệu 15.1–15.3, 06-don-hang), found 0 CRITICAL, 0 HIGH, 3 MEDIUM, 5 LOW findings. Top priority: M1 – lưới màu cỡ cũ (người khác vừa thêm PO, hoặc bộ nhớ đệm 15 giây) lưu đè làm mất dòng màu cỡ của PO mới mà không báo; M2 cần người dùng chốt có cho thêm PO khi đơn không còn thuộc nhà máy SX của ĐVCS hay đã hủy. Merge recommendation: **APPROVE WITH SUGGESTIONS**. Luật phân quyền (deny by default, `BaseRepository`, `BranchCode` từ token, `A00` chỉ đọc, phạm vi L3, chính sách cột của API mới) và thứ tự khóa đơn hàng → kế hoạch đều đúng. Nên sửa M1 (ít nhất phần khóa truy vấn ở frontend) trước khi chuyển Ready for review.

## Kết quả sửa sau lượt 1 (phiên chính, 16/10/2026)

| Mục | Xử lý |
|---|---|
| M1 | Đã sửa. Frontend: khóa truy vấn draft có tập PO của kế hoạch; khi gửi `lines` thì gửi `basePoIds` (PO lúc dựng lưới). Backend: `basePoIds` khác PO đang lưu (đọc sau khóa đơn) thì 409. Test `phase5.spec.ts` (bài "thêm PO: … lưới dựng theo tập PO cũ => 409"), `shipment-plan-add-po.test.tsx` kiểm `basePoIds` |
| M2 | Đã sửa theo hướng chặn: `openOrder` (đơn còn Nhà máy SX thuộc ĐVCS, chưa Hoàn thành/Đã hủy, 422) ở `GET /:id/candidate-pos`, `GET /draft` có `addPoIds`, `PUT` có `addPoIds` (dưới khóa đơn). Sửa SL của PO đã có không đổi. Ghi ở 15.2, chờ người dùng xác nhận (Q41) |
| M3 | Chưa sửa script; ghi ngoại lệ ở 15.2, `12-du-lieu-mau-va-kiem-thu.md`, câu hỏi Q40 |
| L1 | Đã sửa: số kế hoạch trong câu 409 chỉ nêu khi cột `planNo` không Ẩn/Che và người lập xem được kế hoạch |
| L2 | Đã sửa: `PlanPoPicker` bỏ dấu tích PO không còn trong danh sách, Xác nhận là bỏ PO đó; nút Lưu báo "Chưa tải được màu cỡ" khi draft lỗi; câu 409 đổi thành "Bỏ PO đó rồi chọn lại" |
| L3 | Đã thêm: PO đơn khác 422, `basePoIds` cũ 409, đơn Hoàn thành 422, `PUT` A01 song song `POST` A02 cùng PO (một bên 409, PO chỉ ở một kế hoạch). Chưa thêm: 409 với phạm vi `OWNER`, Esc khi hai popup |
| L4 | Đã sửa `02-trang-thai.md`, `06-don-hang.md` (mục 3, 4.3), chú thích `posOfPlan`, bảng tra ADR 0013 |
| L5 | Đã sửa: `inAnyPlan` chỉ chọn `Id`; `withAdded` kiểm PO thuộc đơn (422) trước luật "đã nằm trong kế hoạch" |
| Ghi chú | Kế hoạch không có PO: `draft` trả mảng rỗng, không chạy `IN ()`. Thứ tự deploy ghi ở `02-trang-thai.md` việc máy chủ số 15 |
