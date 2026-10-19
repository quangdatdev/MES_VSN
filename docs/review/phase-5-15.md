# Review Phase 5.15 – Xác nhận cấp BTP

## Lượt 1 (15/10/2026)

### Phạm vi

Thay đổi chưa commit trên `main` (sau `dec0485`), gồm cả file mới chưa track.

- Database, quyền, script: `backend/migrations/MES_Cutting/0002_cutting_supply.sql`, `backend/migrations/MES_Core/0013_grant_cutting_supply.sql`, `backend/migrations/softkeys.json`, `backend/scripts/seed-data.ts`, `cutting-data.ts`, `simulate-board.ts`, `reset-demo.ts`, `load-bravo-orders.ts`.
- Module Cắt: `backend/src/modules/cutting/cutting-supply.dto.ts`, `cutting-supply.repositories.ts`, `cutting-supply.service.ts`, `cutting.controller.ts`, `cutting.module.ts`, `cutting.types.ts`.
- Module Đơn hàng: `backend/src/modules/order/line-color-size-feed.service.ts`, `line-supply-guard.ts`, `order.repositories.ts` (`LineColorSizeFeedRepository`), `color-size.service.ts`, `line-plan.service.ts`, `order.module.ts`; `backend/eslint.config.mjs`.
- Test: `backend/test/cutting-supply.spec.ts`, `cutting-supply-grant-migration.spec.ts`; `frontend/src/test/cutting-supply-rules.test.ts`, `shell.test.tsx`.
- Frontend: `frontend/src/features/cutting/CuttingSupplyPage.tsx`, `cuttingSupplyRules.ts`, `api.ts`; `frontend/src/features/order/api.ts`, `common.tsx`; `frontend/src/theme/global.css` (phần `supply-*`); `frontend/src/routes/registry.tsx`.
- Đối chiếu với: `docs/phases/phase-5-15-xac-nhan-cap-btp.md`, `docs/update_docs/13-quyet-dinh.md` mục 13.8–13.10, `docs/update_docs/15-cat.md` phần "Xác nhận cấp BTP". Đọc thêm để kiểm hành vi: `platform/data/base.repository.ts`, `platform/data/transaction.ts`, `platform/database/db.ts`, `platform/permission/field-policy.{service,interceptor}.ts`, `scripts/seed.ts` (bước 7–9), driver `kysely` 0.28.17 (`SingleConnectionProvider`, `MssqlConnection`).

Đã chạy (không cần database): `tsc --noEmit` backend và frontend đều qua; `eslint` trên các file đổi của backend, frontend không báo lỗi; `vitest run cutting-supply-rules.test.ts shell.test.tsx`: 13/13 qua. **Không** chạy test có database (database dùng chung).

### Điểm làm tốt

- Mọi đường ghi lấy ĐVCS từ phiên: `create`, `ChildRepository.insert/updateRow/removeMany` của `BaseRepository`, `removeEmpty` và `nextSeq` lọc `scope.branchCode`, `assertWritable` ở mọi hàm ghi và ở `sheet`. Lấy, xác nhận, hủy duyệt, xóa một lệnh đều qua `getById`/`lock` theo phạm vi: ĐVCS khác 404, `A00` 403 (có test).
- Các hàm "số tổng" (`supplied`, `cutByStyle`) chỉ nhận ĐVCS do service lấy từ phiên hoặc từ lệnh đã đọc trong phạm vi, chỉ trả số tổng; `LineColorSizeFeed` lọc theo ĐVCS phiên (`A00`: mọi ĐVCS rồi service lọc theo ĐVCS của lệnh). Không tìm thấy đường nào lộ số của ĐVCS khác hay ghi sang ĐVCS khác.
- Bảng con có khóa ngoại ghép `(CuttingSupplyId, BranchCode)`, `CK_CuttingSupply_Confirm` ràng buộc hai chiều trạng thái và người cấp; `UQ_CuttingSupply_DayStyle` và `UQ_CuttingSupply_Seq` là lưới an toàn cho gom lệnh và số lệnh.
- Khóa ứng dụng theo mã hàng lấy theo thứ tự đã sắp xếp, khóa số lệnh lấy sau; không có đường nào lấy ngược thứ tự. Xác nhận cấp giữ khóa mã hàng nên trạng thái tính trên số đã cấp ổn định.
- Lập luận "đọc lại phân bổ sau khi ghi, trước commit" ở hai phía là đúng với `READ COMMITTED` có khóa (mặc định, không database nào bật RCSI): một lần giảm phần giao và một lần tăng số cấp chạy chồng nhau không thể cùng lọt. Vấn đề còn lại chỉ là treo chờ (M1).
- `Promise.all` trên cùng một transaction không lỗi trạng thái kết nối: `SingleConnectionProvider` của Kysely 0.28 xếp hàng các câu.
- Chính sách cột: khóa body `line`, `style` không trùng mã cột, `dayQty`, `note` bị cưỡng chế; `remainQty`, `otherLinesQty` che theo cột gốc; lọc, sắp xếp, tìm, popup giá trị đều bỏ cột không đọc được; câu báo vượt không nêu số khi không xem được số lượng (có test).
- `MES_Core/0013` theo đúng mẫu `0012` đã sửa sau review 5.14 (chỉ Kế hoạch còn Xem, không đụng Toàn quyền, `STRING_ESCAPE`, `WITHIN GROUP`, chỉ tăng phiên bản quyền khi có cấp), có 4 ca test. Seed cập nhật `SourceTable`, chiều phạm vi, cột cho máy đã cài.
- Frontend: cột `SheetGrid` dựng một lần, quyền sửa và ô vượt đọc qua ref đúng cách; hỏi bỏ thay đổi khi đổi Ngày cấp, chọn lệnh khác, rời trang; nút khóa kèm lý do.

---

### MEDIUM

**[MEDIUM] M1 `backend/src/modules/order/line-supply-guard.ts:105-111`, `backend/src/modules/cutting/cutting-supply.service.ts:113-117, 488-499`, `backend/src/modules/order/color-size.service.ts:292-296`, `backend/src/modules/order/line-plan.service.ts:269-291`: chờ chéo giữa hai database mà SQL Server không phát hiện được, cả hai lần lưu treo tới hết `requestTimeout` 15 giây**

Mức chắc chắn: cao về cơ chế (đã đọc đường đi của từng câu, chỉ mục, driver); trung bình về tần suất (cần hai lần lưu rơi vào cùng một khe vài chục ms).

- **Rủi ro:** hai bên đều đọc chéo database **trên kết nối khác** với transaction đang giữ khóa ghi:
  1. Phiên A, Phân bổ màu cỡ (hoặc Xếp chuyền) giảm phần giao ở chuyền L: transaction T_O (kết nối MES_Order) đã ghi `ShipmentPlanLineColorSize` và cập nhật dòng `ShipmentPlanLine` của L (khóa X, dòng 292–295), rồi `assertCovered` gọi hàm tra của module Cắt. Hàm này là `this.repo.supplied(...)` với `db` mặc định, tức chạy trên **kết nối B của pool MES_Cutting, ngoài transaction**. Câu seek `IX_CuttingSupplyLine_Branch_Line (BranchCode, LineCode)`.
  2. Phiên C, Xác nhận cấp BTP tăng số cấp ở chuyền L (mã hàng **bất kỳ**): transaction T_C (kết nối MES_Cutting) đã insert/update `CuttingSupplyLine` (khóa X trên khóa chỉ mục `(A01, L, …)`), rồi bước đọc lại (dòng 493) gọi `feed.allocationsOf` trên **kết nối D của pool MES_Order**. Câu seek `IX_ShipmentPlanLine_Branch_Line (BranchCode, LineCode)` rồi tra dòng gốc lấy `ShipmentPlanId`, chạm đúng dòng `ShipmentPlanLine` T_O đã cập nhật.
  3. B chờ khóa của T_C; D chờ khóa của T_O. T_O chờ B và T_C chờ D ở tầng Node, SQL Server không thấy. Đồ thị chờ của SQL Server chỉ có B→T_C và D→T_O, không có vòng, nên không chọn nạn nhân (không có 1205).
  4. Cách giải duy nhất là `requestTimeout` mặc định 15 giây của tedious (`db.ts` không đặt). Phía A nhận 409 "module Cắt không phản hồi" (sai nguyên nhân). Phía C nhận `ETIMEOUT`, không phải `AppException`, thành 500; hoặc thành công nếu A rollback trước.
  5. Suốt 15 giây đó, T_C giữ khóa ứng dụng `MES_Cutting.CuttingSupply:<ĐVCS>:<mã hàng>`. Nếu lần lưu có tạo lệnh, nó giữ cả `MES_Cutting.CuttingSupply.No:<ĐVCS>`. Mọi lần tạo lệnh mới của cả ĐVCS chờ theo, rồi lỗi "Hết thời gian chờ khóa" (`new Error`, thành 500).
  
  Chỉ cần cùng ĐVCS và cùng chuyền, không cần cùng mã hàng, vì cả hai câu seek theo `(BranchCode, LineCode)` và gặp khóa của dòng mã hàng khác. Dữ liệu không sai: không bên nào commit vượt. Ghi chú "Phải nhớ" ở 13.8 ("Đơn hàng tra số đã cấp trong transaction của mình", "khe nhỏ giống 13.4") không đúng với code: lần tra chạy ngoài transaction, và chỗ cần lo là chờ chéo chứ không phải lọt.
- **Sửa:**
  1. Chỉ cần **một** phía không chờ lâu. Cho hàm tra của `LineSupplyGuards` chờ khóa ngắn: `SET LOCK_TIMEOUT 3000;` trong câu (`supplied` có tham số `lockTimeoutMs`), hoặc pool riêng `requestTimeoutMs: 3000`. Hết giờ thì `assertCovered` trả 409 "Màn Xác nhận cấp BTP đang lưu số cấp cho chuyền này. Thử lại sau giây lát." T_O rollback, T_C chạy tiếp. Vẫn đúng như cũ vì phía Đơn hàng vẫn **chặn**, không bỏ qua.
  2. **Không** dùng `READPAST`/`NOLOCK` cho câu tra. `READPAST` bỏ qua dòng đang bị giảm số cấp nên đếm thiếu: phần giao giảm xuống dưới số cấp cũ mà không bị chặn, và bước đọc lại của module Cắt chỉ xét ô tăng nên cũng không bắt được.
  3. Ở `CuttingSupplyService.save`, bắt lỗi hết giờ của bước đọc lại (dòng 493) và lỗi khóa ứng dụng (`appLock`, `cutting-supply.repositories.ts:62`) thành 409 có câu tiếng Việt, không để thành 500.
  4. Sửa câu "Phải nhớ" của 13.8: hàm tra chạy ngoài transaction của Đơn hàng, có chờ chéo, và cách giải theo ý 1.

**[MEDIUM] M2 `backend/src/modules/cutting/cutting-supply.service.ts:384-388`: ô không còn trong Phân bổ màu cỡ bị chặn cả khi **giảm** số, trái 13.8 và giao diện**

Mức chắc chắn: cao.

- **Rủi ro:** `missing` lọc mọi ô có `dayQty > 0` không có trong phân bổ, trước khi biết số cũ `cur`. Kịch bản:
  1. Chuyền L5 RED/S đã cấp 30 hôm nay.
  2. Phân bổ của màu cỡ đó về 0. Đường xảy ra: khe chờ của M1, `sim:board`/script, dữ liệu trước 5.15, hoặc `AssignedQty` bị đưa về 0 ở lần lưu cũ. Dòng hiện `inPlan = false`.
  3. Giao diện vẫn cho sửa: `CuttingSupplyPage.tsx:414` (`r.inPlan || savedDay > 0`); `api.ts` ghi "chỉ giảm được".
  4. Người dùng giảm 30 → 20, máy chủ trả 422 "Chưa có trong Phân bổ màu cỡ của chuyền". Chỉ đưa về 0 mới lưu được.
  
  13.8 và `15-cat.md` ghi rõ "chặn ô **tăng** số mà không có trong Phân bổ màu cỡ… Giảm số luôn được".
- **Sửa:** bỏ kiểm `missing` trước transaction (giữ phần tên màu cỡ theo phân bổ). Trong vòng `for (const i of g.items)` (dòng 404–420), thêm `if (increased && !p) missing.push(label(...))`, rồi ném 422 cùng chỗ với `overPlan`. Thêm test: xóa thẳng phần giao trong test, giảm 30 → 20 được 200, tăng thì 422.

**[MEDIUM] M3 `frontend/src/features/cutting/cuttingSupplyRules.ts:39, 49-50`, `frontend/src/features/cutting/CuttingSupplyPage.tsx:389, 436-437, 464-468`: Chuyền, Mã hàng, Trạng thái bị Che/Ẩn thì form lỗi, dù 13.10 chọn khóa `line`/`style` chính là để hai chính sách này không chặn việc nhập**

Mức chắc chắn: cao về đường code; chỉ xảy ra khi quản trị đặt chính sách cột cho các cột này.

- **Rủi ro:**
  - `lockedStyles` gọi `s.styleCode.trimEnd()`. Khi `styleCode` bị **Ẩn**, interceptor bỏ khóa này khỏi `supplies[]`, nên ngày nào có lệnh đã xác nhận thì sinh `TypeError`. Hậu quả:
    - `pickDate`, `addRows` bắt lỗi rồi báo "Chưa tải được số của ngày đó" / "Chưa thêm được dòng": không đổi được ngày, không thêm được dòng.
    - Nhánh tải lại sau 422/409 (dòng 487) không có `.catch`, thành Promise bị từ chối không ai xử lý.
  - Form **Sửa** dựng dòng từ `GET /cutting/supply/:id`, không có khóa gốc:
    - `lineCode` bị Che thì `line = "***"`, bị Ẩn thì `line = ""`. Lưu, hoặc đổi Ngày cấp, gửi `line: "***"`, nhận 400 "Chọn chuyền sản xuất.".
    - `styleCode` bị Che/Ẩn thì `style = ""` và `stylesOf()` rỗng: nút Lưu lại khóa với lý do "Thêm ít nhất một dòng".
  - `statusCode` bị Che thì `'***' !== 'PENDING'`, nên mọi dòng của mã hàng có lệnh trong ngày bị coi là thuộc lệnh đã xác nhận và bị khóa.
- **Sửa:**
  - `lockedStyles`: bỏ qua phần tử không có `styleCode` dạng chuỗi.
  - Thêm cờ `locked: boolean` vào `supplies[]` của `sheet`. Đây không phải mã cột nên không bị che. Giao diện dùng cờ này thay cho so `statusCode`.
  - Nút Sửa: khóa kèm lý do khi `lineCode` hoặc `styleCode` không đọc được nguyên giá trị (`readable(policy, …)`). Thêm Mới vẫn dùng được vì giữ khóa đã gửi.
  - Ghi giới hạn này vào 13.10.
  - Thêm test `rowsOf` với `styleCode` vắng mặt và `statusCode` `'***'`.

---

### LOW / SUGGESTION

**[LOW] L1 `backend/src/modules/cutting/cutting-supply.service.ts:593-604` (`remove`), `568-577` (`unconfirm`): Xóa lệnh không giữ khóa mã hàng, có thể deadlock với Lưu số cấp cùng lệnh**

Mức chắc chắn: cao về thứ tự khóa.

- **Rủi ro:** hai đường khóa ngược thứ tự nhau:
  - `save` ghi dòng con (X trên `CuttingSupplyLine`) **trước**, rồi mới `repo.update` đầu lệnh.
  - `remove` khóa đầu lệnh (UPDLOCK) **trước**, rồi xóa dòng con.
  
  Hai lần chạy cùng lệnh tạo vòng chờ. SQL Server chọn nạn nhân (1205), bộ lọc trả 409, người dùng phải bấm lại. Không sai dữ liệu.
- **Sửa:** `remove` đọc `StyleCode` qua `getById(scope, id, 'delete')` trước transaction rồi `lockStyles` trước `lock`, như `confirm`. `unconfirm` không cần.

**[LOW] L2 `backend/src/modules/cutting/cutting-supply.repositories.ts:60-63`: hết giờ chờ khóa ứng dụng ném `Error` thường, thành 500**

- **Rủi ro:** người dùng thấy "Lỗi hệ thống" thay vì "đang có người lưu, thử lại". Tiền lệ `cutting.repositories.ts` cũng vậy.
- **Sửa:** ném `Errors.conflict('Đang có lần lưu khác cho mã hàng này. Thử lại sau giây lát.')`. Làm cùng M1 ý 3.

**[LOW] L3 `backend/migrations/MES_Cutting/0002_cutting_supply.sql:26, 22`, `backend/migrations/softkeys.json` (`CuttingSupply.CreatedBy`, `ConfirmedBy`): khóa ngầm chưa có chỉ mục**

- **Rủi ro:** CLAUDE.md mục 5 yêu cầu khóa ngầm "có index". Tiền lệ: `PoAllocation` có chỉ mục lọc, `ShipmentPlan` có `(BranchCode, CreatedBy)`. `check:softkeys` quét cả bảng. Ngoài ra `cutByStyle` lọc `CuttingPlan.StyleCode` mà `CuttingPlan` không có chỉ mục `(BranchCode, StyleCode)`.
- **Sửa:** `0002` mới chạy trên bộ test nên sửa thẳng file được, theo tiền lệ 5.14:
  - `CREATE INDEX IX_CuttingSupply_ConfirmedBy ON dbo.CuttingSupply (ConfirmedBy) WHERE ConfirmedBy IS NOT NULL;`
  - Chỉ mục `(BranchCode, CreatedBy)` cho `CreatedBy`.
  - Cân nhắc `IX_CuttingPlan_Branch_Style (BranchCode, StyleCode)`: thêm ở `0002` vì `0001` đã chạy.
  
  Nếu không thêm thì ghi lý do vào 13.8.

**[LOW] L4 `backend/src/modules/cutting/cutting-supply.repositories.ts:150-157`, `cutting-supply.service.ts:486`: người chỉ có quyền Sửa xóa được lệnh bằng cách đưa mọi ô về 0**

- **Rủi ro:** 13.8 có ghi "lệnh tự bỏ", nhưng 13.10 lại ghi Xóa cần quyền `delete`. Vai trò có Sửa mà không có Xóa (ví dụ quản trị gỡ Xóa của Kế hoạch) vẫn bỏ được lệnh và để lại khoảng trống số lệnh. Nhật ký ghi `DELETE`.
- **Sửa:** ghi rõ vào 13.10 là chấp nhận. Hoặc chỉ tự bỏ khi người lưu có `delete`; không có thì giữ đầu lệnh rỗng, hoặc 403 cho lần lưu đưa về 0 hết.

**[LOW] L5 `backend/src/modules/cutting/cutting-supply.service.ts:430-434`: Ghi chú áp cho mọi mã hàng trong form nên lệnh đã xác nhận làm hỏng cả lần lưu**

- **Rủi ro:** form có mã hàng A (lệnh đã xác nhận ở ngày đó, dòng xám) và B. Người dùng nhập số cho B, sửa Ghi chú, lưu: `noteChanged` trên lệnh A ném 409 cho cả lần lưu. Câu báo nhắc Hủy duyệt A dù người dùng không định sửa A.
- **Sửa:** chỉ áp Ghi chú cho lệnh Chưa cấp. Với lệnh đã xác nhận không có ô đổi thì bỏ qua Ghi chú, không ném lỗi. Hoặc frontend không gửi mã hàng có dòng khóa trong `styles`.

**[LOW] L6 `backend/src/modules/order/color-size.service.ts:263, 296`: hai lần Phân bổ màu cỡ ở hai kế hoạch khác nhau nay có thể deadlock**

- **Rủi ro:** `snapshot` (trước và sau khi ghi) đọc phần giao của **mọi** kế hoạch cùng chuyền, cùng mã hàng. Hai kế hoạch cùng mã hàng, cùng chuyền lưu chồng nhau thì mỗi bên đọc dòng bên kia đang khóa X. SQL Server phát hiện được (cùng database), trả 1205, thành 409. Trước 5.15 hai lần lưu này độc lập.
- **Sửa:** chấp nhận và ghi vào "Phải nhớ" của 13.8. Hoặc bỏ qua bước kiểm khi không có ô nào giảm: so `next` với `current` ngay trong service trước khi đọc.

**[LOW] L7 `backend/src/modules/cutting/cutting-progress.service.ts:429-443` và `save`: luật "không cấp vượt số đã cắt" (Q5) chỉ chặn một chiều**

- **Rủi ro:** Đồng bộ tiến độ cắt giảm số cắt hoặc Xóa số cắt mà không kiểm số BTP đã cấp. Lưu số cấp cũng không đọc lại số cắt sau khi ghi, và không giữ khóa chung với lưu số cắt. Kết quả: SL đã cấp > SL đồng bộ, ô SL đồng bộ tô đỏ mãi. Không có trong thiết kế (Q12 chỉ nói Phân bổ màu cỡ, Xếp chuyền).
- **Sửa:** hỏi người dùng (đề xuất ghi câu hỏi mới vào `02-trang-thai.md`): có chặn giảm số cắt xuống dưới số đã cấp không. Nếu chặn thì cùng khóa `MES_Cutting.CuttingSupply:<ĐVCS>:<mã hàng>` ở `CuttingProgressService.save`/`removeEntries` (cùng database nên đơn giản).

**[LOW] L8 `frontend/src/features/cutting/CuttingSupplyPage.tsx:309, 330, 415`: `overSyncCells` tính lại cho từng ô, O(n²) mỗi lần gõ**

- **Rủi ro:** `className` của cột SL đồng bộ gọi `fns.current.over()`, và hàm này duyệt cả lưới cho **mỗi dòng**. Lưới tối đa 2.000 dòng thì mỗi lần vẽ lại khoảng 4 triệu bước, gõ số bị khựng trên máy yếu.
- **Sửa:** tính `over` một lần mỗi lần vẽ (đã có ở dòng 503) và đưa qua ref: `overRef.current = over; useSheetColumns(editable, () => overRef.current)`. `SupplyView` làm tương tự với `useMemo`.

**[LOW] L9 `frontend/src/features/cutting/CuttingSupplyPage.tsx:151, 233-237, 480`: trạng thái chọn sau khi lưu**

- **Rủi ro:**
  - Ở form Sửa, đưa mọi ô về 0: lệnh tự bỏ, `kept` rỗng, `onSaved(null)`, `refresh(mode.id)` chọn lại Id đã bị xóa. Khung dưới hiện "Không tải được lệnh cấp".
  - Lệnh vừa tạo không thuộc trang, bộ lọc đang xem: `selected = null` trong khi `d` đã tải. Các nút báo "Chọn một dòng" dù chi tiết đang hiện.
- **Sửa:** nếu `res.saved` có lệnh `removed` trùng lệnh đang sửa thì chọn `null`. `need()` dựa vào `d` (đã đúng Id) thay vì `selected`.

**[LOW] L10 `frontend/src/features/cutting/CuttingSupplyPage.tsx:395-400, 487-495`: Promise không bắt lỗi, số gõ trong lúc tải lại bị ghi đè**

- **Rủi ro:**
  - Nhánh tải lại sau 422/409 không có `.catch`.
  - Ô người dùng gõ tiếp trong lúc tải lại bị thay bằng `typed` chụp lúc lỗi.
  - Ngày mặc định khi hỏi máy chủ lỗi dùng ngày UTC: 0–7 giờ sáng giờ Việt Nam ra hôm qua.
- **Sửa:** thêm `.catch(() => undefined)` (đã toast lỗi lưu). Dùng `setRows((prev) => …)` lấy số đang gõ từ `prev`. Ngày dự phòng dùng `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })` như `vnDay`.

**[LOW] L11 `backend/src/modules/cutting/cutting-supply.repositories.ts:56-59, 116, 133`: chú thích và kiểu tham số của hàm số tổng**

- **Rủi ro:**
  - Chú thích `appLock` ghi tên khóa "không từ client". Nhưng nhóm chỉ có trong `dto.styles` mà không có phân bổ thì dùng nguyên chữ client gửi. Vô hại (chuỗi đã giới hạn 120 ký tự, khóa đổi chữ hoa), chỉ sai chú thích.
  - `supplied`, `cutByStyle` nhận `branchCode` dạng chuỗi thô. Tiền lệ `cutTotals` cũng vậy, nhưng nếu module khác gọi qua `LineSupplyGuards` sau này thì không có gì buộc ĐVCS lấy từ phiên.
- **Sửa:** sửa chú thích. Ghi trong JSDoc của `SuppliedLookup` rằng `branchCode` phải là ĐVCS của dòng đã đọc trong phạm vi.

---

### Ghi chú

- Test backend đã có đủ phần lớn tiêu chí 5.15.3. Còn thiếu:
  - Giảm số ở dòng không còn phân bổ (M2).
  - Đổi Ghi chú khi có lệnh đã xác nhận trong form (L5).
  - Người chỉ có Sửa đưa lệnh về 0 (L4).
  - Lưu chồng giữa Phân bổ màu cỡ và lưu số cấp (M1). Có thể test đơn vị: hàm tra ném lỗi hết giờ thì `assertCovered` trả 409.
- Ca test "số lệnh không trùng khi đồng thời" dùng hai mã hàng khác nhau nên kiểm đúng khóa số lệnh, không bị khóa mã hàng che mất. Tốt.
- `filterParams` của các màn Đơn hàng nay có thêm 4 khóa: giá trị rỗng bị `qs` bỏ, còn có giá trị thì `ValidationPipe({ whitelist: true })` bỏ. Không ảnh hưởng các màn khác.

### Kết luận lượt 1

> Review Summary: examined 31 files (cùng 3 tài liệu thiết kế), found 0 CRITICAL, 0 HIGH, 3 MEDIUM, 11 LOW findings. Top priority: M1, chờ chéo giữa transaction MES_Order (`LineSupplyGuards`) và transaction MES_Cutting (lưu số cấp) mà SQL Server không phát hiện được, treo 15 giây rồi 409/500 và giữ khóa số lệnh của cả ĐVCS. Không sai dữ liệu, sửa bằng thời gian chờ khóa ngắn cho câu tra phía Đơn hàng. Merge recommendation: **APPROVE WITH SUGGESTIONS**. Phân quyền, lọc `BranchCode`, `A00` chỉ đọc, migration đều đúng. Nên sửa M1–M3 trước khi triển khai máy chủ.

---

## Lượt 2 (15/10/2026)

### Phạm vi

Các bản sửa theo lượt 1, code chưa commit:
- `backend/src/modules/cutting/cutting-supply.repositories.ts`: `suppliedQuick`, `appLock`.
- `backend/src/modules/cutting/cutting-supply.service.ts`: `onModuleInit`, `save`, `sheet`, `suppliesOf`, `remove`.
- `backend/src/modules/order/line-supply-guard.ts`.
- `backend/migrations/MES_Cutting/0003_cutting_supply_indexes.sql` (mới).
- `backend/test/cutting-supply.spec.ts`.
- `frontend/src/features/cutting/cuttingSupplyRules.ts`, `CuttingSupplyPage.tsx`, `api.ts`; `frontend/src/test/cutting-supply-rules.test.ts`.

Đã đọc thêm `kysely` 0.28.17: `Kysely.connection()` (`ConnectionBuilder`), `MssqlDriver.releaseConnection`, `MssqlConnection.[reset]`.

Đã chạy lại (không cần database): `tsc --noEmit` backend và frontend qua; `eslint` `src/modules/cutting`, `line-supply-guard.ts`, `frontend/src/features/cutting` qua; `vitest` 13/13 qua. Không chạy test có database.

### Trạng thái từng mục

| Mục | Trạng thái | Ghi chú kiểm |
|---|---|---|
| M1 | **Đã sửa** | Xem phần "Kiểm `suppliedQuick`" bên dưới. Còn một ý nhỏ (N1) |
| M2 | **Đã sửa** | Kiểm "ngoài phân bổ" nay nằm trong vòng lặp, sau khi biết `cur`: chỉ chặn khi `increased && !p`. Ô giảm số lấy tên màu cỡ client gửi, nhưng khớp dòng cũ qua `lineKey`/`cellKey` không phân biệt hoa thường, nên `updateRow`/`removeMany` vẫn trúng dòng. `p!.planQty` chỉ được đọc khi `p` có giá trị. Có test (giảm được, tăng 422) |
| M3 | **Đã sửa** | `sheet` trả `locked` theo dòng, tính trên `rows[i].styleCode` thô trước khi che; `supplies[].locked` không phải mã cột nên không bị che. `rowsOf` dùng `d.locked`, không còn `trimEnd()` trên giá trị có thể vắng. `keysHidden` khóa Thêm mới và Sửa kèm lý do. `need()` chỉ dùng `busy` khi đang nhập, nên Xóa, Xác nhận cấp, Hủy duyệt không bị khóa oan. Form Sửa chỉ mở với lệnh Chưa cấp; dòng từ `GET /:id` không có `locked` nên coi là `false`, đúng |
| L1 | **Đã sửa** | `remove` đọc `StyleCode` trong phạm vi `delete` trước transaction, rồi lấy khóa mã hàng trước UPDLOCK đầu lệnh, cùng thứ tự với `save` và `confirm`: hết vòng khóa với lưu số cấp |
| L2 | **Đã sửa** | `appLock` hết giờ ném `AppException('CONFLICT', …, 409)` |
| L3 | **Đã sửa** | `MES_Cutting/0003` có hai chỉ mục lọc `CreatedBy`, `ConfirmedBy` và `IX_CuttingPlan_Branch_Style`. Chỉ thêm chỉ mục, chạy an toàn trên máy đã cài. Tên không trùng chỉ mục nào ở `0001`, `0002` |
| L4 | Chưa sửa, ghi tài liệu | Chấp nhận. Cần ghi vào 13.10 rằng người có Sửa bỏ được lệnh bằng cách đưa mọi ô về 0 |
| L5 | Chưa sửa, ghi tài liệu | Chấp nhận tạm |
| L6 | Chưa sửa, ghi tài liệu | Chấp nhận (SQL Server phát hiện được, trả 409) |
| L7 | Chưa sửa, hỏi người dùng | Cần thêm câu hỏi vào `02-trang-thai.md` |
| L8 | **Đã sửa** (form) | `useMemo` cộng ref ở `SupplyForm`. `SupplyView` vẫn gọi `overSyncCells(rowsRef.current)` cho từng ô; chỉ xem một lệnh, ít dòng nên chấp nhận được |
| L9 | Một phần | Không chọn lại lệnh đã tự bỏ: đã sửa. Lệnh mới ngoài trang đang xem: chưa sửa, ghi tài liệu |
| L10 | **Đã sửa** | Có `.catch`. Ghép số đang gõ bằng `setRows((now) => …)`. Ngày dự phòng theo giờ Việt Nam. Còn ý nhỏ N2 |
| L11 | Một phần | Chú thích `appLock` đã sửa. `branchCode` thô giữ theo tiền lệ |

### Kiểm `suppliedQuick` (M1)

Kiểm trên mã nguồn Kysely 0.28.17 và tedious. Mức chắc chắn: cao.

- `this.db.connection().execute(cb)` mượn một kết nối từ pool tarn của `CUTTING_DB`, chạy mọi câu trong `cb` trên đúng kết nối đó (`SingleConnectionProvider`), rồi `releaseConnection` trả về pool trong `finally` của provider, kể cả khi `cb` ném lỗi. Không rò kết nối. `this.db` là instance gốc, không phải transaction, nên không rơi vào lỗi "connection() không dùng cho Transaction".
- `MssqlDriver.releaseConnection` chỉ `reset` khi cấu hình `resetConnectionsOnRelease`, mà `db.ts` không bật. Vì vậy `SET LOCK_TIMEOUT -1` trong `finally` là cần và đặt đúng chỗ: chạy trên cùng kết nối trước khi trả về pool.
- Hết 3 giây chờ khóa, SQL Server trả lỗi 1222 ("Lock request time out period exceeded"). Đây là lỗi hủy câu lệnh, không đóng kết nối. Không có transaction mở nên không có gì phải rollback. tedious trả `RequestError` (lớp con của `Error`, có `number = 1222`), Kysely ném lại. Kết nối vẫn ở trạng thái `LoggedIn`, nên `SET LOCK_TIMEOUT -1` chạy được. `assertCovered` bắt mọi lỗi thành 409 có câu tiếng Việt và ghi log mức `warn`. Lỗi 1222 không bị `isDeadlock` nhận nhầm (chỉ xét 1205), nhưng không ảnh hưởng vì đã bắt ở `assertCovered`.
- Vòng chờ của lượt 1 nay tự giải trong khoảng 3 giây:
  1. Câu tra của Đơn hàng hết giờ.
  2. T_O ném 409 và rollback, nhả khóa X ở MES_Order.
  3. Bước đọc lại phân bổ của T_C chạy tiếp, thấy phần giao chưa giảm, commit.
  
  Vẫn đúng như trước: phía Đơn hàng chỉ có thể chặn, không bao giờ bỏ qua số đã cấp. Thứ tự khóa ứng dụng mã hàng → số lệnh không đổi.
- `SET LOCK_TIMEOUT ${sql.raw(String(QUICK_LOCK_MS))}`: hằng số trong code, không có giá trị từ client.

### Mục mới

**[LOW] N1 `backend/src/modules/cutting/cutting-supply.service.ts` (bước đọc lại phân bổ sau khi ghi), `cutting-supply.repositories.ts:138-147`: còn hai đường lỗi kỹ thuật thành 500 hoặc ghi đè lỗi gốc**

Mức chắc chắn: cao về đường code, khả năng xảy ra thấp.

- **Rủi ro:**
  - Bước đọc lại của `save` vẫn có thể chờ khóa MES_Order tới `requestTimeout` 15 giây nếu một transaction Đơn hàng giữ khóa lâu vì lý do khác. Ví dụ: lần lưu Xếp chuyền lớn, hoặc `load:bravo` trên máy demo. Đây không còn là vòng chờ, nhưng `ETIMEOUT` vẫn thành 500.
  - Nếu `SET LOCK_TIMEOUT -1` trong `finally` lỗi, lỗi đó che lỗi gốc. Kết nối hỏng thì `validate` của tarn loại bỏ; nếu kết nối còn dùng được thì nó về pool với `LOCK_TIMEOUT 3000`. Gần như không xảy ra.
- **Sửa (tùy chọn):** bọc bước đọc lại trong `try/catch`, lỗi không phải `AppException` thì ném `conflict('Phân bổ màu cỡ đang được lưu ở màn khác. Thử lại sau ít giây.')`. Trong `finally` của `suppliedQuick`, khi `SET -1` lỗi thì ném lỗi gốc. Muốn chắc hơn: tạo pool riêng nhỏ (`poolMax: 2`) bật `resetConnectionsOnRelease` cho câu tra này, như `BravoOrderImportRepository` có pool riêng.

**[LOW] N2 `frontend/src/features/cutting/CuttingSupplyPage.tsx` (nhánh tải lại sau 422/409): ô vừa sửa về đúng số đã lưu trong lúc chờ tải lại sẽ nhận lại số gõ cũ**

- **Rủi ro:** `latest.get(r.key) ?? typed.get(r.key)`. Ô mà người dùng vừa đưa về đúng số đã lưu thì không còn trong `changes(now)`, nên lấy lại giá trị `typed` chụp lúc lỗi. Ngoài ra `keys` chụp lúc lỗi, nên dòng thêm bằng "Thêm vào lưới" trong lúc chờ (vài trăm ms) bị bỏ. Hiếm, vì người dùng vừa thấy toast lỗi.
- **Sửa:** dựng lại từ `now`: lấy khóa từ `keysOf(now)` khi `setRows`. Nếu ô có trong `now` thì dùng `now.dayQty`, chỉ dùng `typed` cho ô không còn trong `now`. Hoặc khóa lưới (`loadingSheet`) trong lúc tải lại.

### Kết luận lượt 2

> Review Summary: examined 9 files (bản sửa lượt 2), found 0 CRITICAL, 0 HIGH, 0 MEDIUM, 2 LOW mới (N1, N2). M1, M2, M3, L1, L2, L3, L8, L10 đã sửa đúng. L4–L7, một phần L9 chuyển sang tài liệu hoặc câu hỏi như phiên chính đã nêu. `connection()` cộng `SET LOCK_TIMEOUT` dùng đúng với Kysely 0.28 mssql: kết nối luôn trả về pool, `LOCK_TIMEOUT` được đặt lại trước khi trả, lỗi 1222 thành `Error` và được `assertCovered` đổi thành 409. Merge recommendation: **APPROVE WITH SUGGESTIONS**. Nhớ cập nhật câu "Phải nhớ" của 13.8 theo cách xử lý M1, và ghi L4–L7, L9 vào 13.10, `02-trang-thai.md`.

### Sửa sau lượt 2 (15/10/2026)

- N1: đã sửa. Bước đọc lại Phân bổ màu cỡ khi lưu số cấp lỗi (hết giờ chờ khóa, mất kết nối) trả 409 "thử lại" thay vì 500; `SET LOCK_TIMEOUT -1` lỗi thì bỏ qua, không che lỗi gốc của câu tra (`cutting-supply.service.ts`, `cutting-supply.repositories.ts`).
- N2: đã sửa. Tải lại sau lỗi lưu ghép theo lưới mới nhất: giữ số đang có ở mọi ô (kể cả ô vừa đưa về số đã lưu), giữ dòng thêm trong lúc chờ tải (`CuttingSupplyPage.tsx`).
- 13.8 "Phải nhớ" đã ghi cách xử lý M1, M2 và câu hỏi Q37; L4 (Sửa đưa ô về 0 là bỏ lệnh), L5 (Ghi chú với lệnh đã xác nhận) ghi ở 13.10; L6 (deadlock hai lần Phân bổ màu cỡ), L7 (Q37), L9 (lệnh mới ngoài trang) ghi ở `15-cat.md` mục Giới hạn hiện tại.
