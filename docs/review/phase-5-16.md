# Review Phase 5.16 – Kế hoạch may, sửa riêng Giá CM

## Lượt 1 (16/10/2026)

### Phạm vi

Thay đổi chưa commit trên `main` (sau `24301de`), gồm cả file mới chưa track.

- Database, quyền, script: `backend/migrations/MES_Sewing/0003_sewing_day_plan.sql`, `backend/migrations/softkeys.json`, `backend/scripts/seed-data.ts`, `sewing-data.ts`, `reset-demo.ts`, `load-bravo-orders.ts`, `simulate-board.ts`; `backend/eslint.config.mjs`.
- Nền tảng: `backend/src/platform/data/base.repository.ts` (`allows`), `platform/org/org.service.ts`, `line-source.ts`; `backend/src/modules/hr/hr-line-source.ts` (`ancestors`).
- Module May: `sewing-plan.dto.ts`, `sewing-plan.repositories.ts`, `sewing-plan.service.ts`, `sewing.controller.ts`, `sewing.module.ts`, `sewing.types.ts`.
- Module Đơn hàng: `schedule-feed.service.ts` (`dayPlanLines`), `order.repositories.ts` (`dayPlanFeed`, `SalesOrderPriceRepository`, `ShipmentPlanPriceRepository`), `line-day-plan-guard.ts`, `line-plan.service.ts`, `sales-order.service.ts`, `order.controller.ts`, `order.dto.ts`, `order.module.ts`.
- Test: `backend/test/sewing-plan.spec.ts`; `frontend/src/test/sewing-plan.test.tsx`.
- Frontend: `frontend/src/features/sewing/SewingPlanPage.tsx`, `sewingPlanRules.ts`, `api.ts`; `frontend/src/components/SheetGrid.tsx`; `frontend/src/features/order/SalesOrderPage.tsx`, `api.ts`; `frontend/src/lib/types.ts`; `frontend/src/routes/registry.tsx`; `frontend/src/theme/global.css`.
- Đối chiếu với: `docs/phases/phase-5-16-ke-hoach-may.md`, `docs/update_docs/13-quyet-dinh.md` mục 14.1–14.3, `docs/update_docs/07-may.md` mục "Kế hoạch may". Đọc thêm để kiểm hành vi: `platform/permission/field-policy.{service,interceptor}.ts`, `scripts/seed.ts` (bước 7–9), `modules/order/shipment.service.ts` (`update`, `remove`), `shipment-plan-delete-guard.ts`, `MES_Order/0001` (`ShipmentPlan`), `MES_Hr/0001` (`Department`).

Không chạy test có database, không chạy migrate/seed (database dùng chung). Phiên chính đã chạy lint, `tsc`, test backend trên `MES_*_T514`, test frontend, build; lượt này chỉ đọc code.

### Điểm làm tốt

- Mọi endpoint mới có `@RequirePermission` đúng hành động; `@FieldResource('sewing.plan')` ở mức controller nên `FieldPolicyInterceptor` áp cả body `PUT /sewing/plan`, `lock`, `unlock` và lọc dữ liệu trả về. `PUT /order/sales-orders/:id/cm-price` nằm dưới `@FieldResource('order.allocation')`, nên cột `cmPrice` Chỉ đọc hoặc Ẩn thì bị 403 trước khi vào service (có test).
- `BranchCode` luôn lấy từ `Scope`. `ScheduleFeed.dayPlanLines` lọc ĐVCS bằng `branchOf(scope)`; Id `extra` và `items[].lineId` do client gửi đều đi qua lọc ĐVCS ở SQL, rồi qua `allows` để lọc phạm vi chuyền. Dòng ĐVCS khác trả 404 (có test).
- `A00` bị chặn ở cả ba đường ghi: `assertDay`, `assertWritable`, `BaseRepository.create/update`. `editableDay`/`canEdit` luôn `false` ở `A00`.
- `allows` dùng đúng `rowSatisfies` và cách chọn điều kiện theo `bindings` của `assertRowInScope`/`limit`: không có phép gán thì từ chối; có phép gán không ràng buộc chiều nào của tài nguyên thì cho; ĐVCS khớp đúng chuỗi. Với `sewing.plan` (BRANCH, FACTORY → BranchCode, LINE → LineCode), kết quả trùng với điều kiện SQL của `limit`. Riêng lỗ hổng cho loại tài nguyên khác: xem M2.
- `SalesOrderPriceRepository` chỉ ghi `CmPrice` (DTO một khóa, `whitelist`), dùng `usedBy` do `BaseRepository` sinh. `SalesOrderRepository` của Sửa đơn và Xóa không đổi, nên ĐVCS khác không đổi được Nhà máy SX, số lượng, hay xóa đơn (có test 404). Thứ tự khóa đơn hàng → kế hoạch của `updateCmPrice` trùng với `ShipmentService.update` (`orders.lockBranchRow` rồi `plans.lock`). Xếp chuyền chỉ khóa kế hoạch, không chạm đơn hàng. Không có vòng khóa.
- Ghi Giá CM sang kế hoạch mọi ĐVCS (`ShipmentPlanPriceRepository.follow`) hợp với 14.3 (Q16, một đơn một giá) và tiền lệ 13.6. Id đơn lấy từ dòng đã đọc trong phạm vi ghi, trong cùng transaction. `Revenue` là cột tính `PERSISTED` nên tự tính lại.
- Mọi lần ghi của Kế hoạch may trong một ĐVCS xếp hàng sau khóa ứng dụng `MES_Sewing.SewingDayPlan.<ĐVCS>`. Số tổng các ngày (`totals`) đọc trong transaction dưới khóa đó, nên hai người lưu hai ngày khác nhau không thể cùng vượt Tổng kế hoạch.
- `usageQuick` theo đúng mẫu `suppliedQuick` đã kiểm ở 5.15: `connection()` mượn một kết nối, đặt `SET LOCK_TIMEOUT 3000`, đặt lại `-1` trong `finally` mà không che lỗi gốc. `assertKept` không tra được thì chặn (409), không bỏ qua.
- Chính sách cột: `remainQty`, `planRevenue`, `otherBefore`, `otherAfter`, `lineName` không trả khi cột gốc Ẩn/Che. Câu báo vượt không nêu số khi `planQty`/`deliveredQty` không xem được. Nhật ký qua `redact` nên không có `cmPrice`, `planRevenue` (có test).
- Migration đúng quy ước: PascalCase, số ít, bảng con mang tiền tố cha, khóa ngoại ghép `(SewingDayPlanId, BranchCode)` xóa theo cha, `CK_SewingDayPlan_Lock` ràng buộc hai chiều, `UQ_SewingDayPlan_DayLine` là lưới an toàn cho đầu bảng trùng. Có chỉ mục cho `LineCode`, `ShipmentPlanLineId`, `ShipmentPlanId`, `LockedBy`, `CreatedBy`. `NVARCHAR(20)` đúng Q1 và chỉ ở bảng mới. `Department.Code` có `CK` chỉ `A–Z0–9-` và `UNIQUE`, nên chép sang `NVARCHAR` không mất ký tự, và tra tên bộ phận cha theo mã không nhầm ĐVCS.
- `SheetGrid` chỉ thêm (`parseTime`, `timeCell`, `sheetTime`), không đổi hành vi cột cũ.
- Script: `clearSewingDayPlan` có `assertDemoMachine`, bỏ qua khi chưa có bảng. `sim:board` luôn giữ kế hoạch có dòng đã lập ở Kế hoạch may, kể cả `--all`.

---

### HIGH

**[HIGH] H1 `backend/src/modules/order/line-plan.service.ts:292-301` (gọi `assertKept` trước khi ghi), `backend/src/modules/sewing/sewing-plan.service.ts:329-332`: Xếp chuyền tra số đã giao trước khi ghi, nên một lần lưu chạy chồng vẫn giao vượt được (trái 14.2)**

Mức chắc chắn: cao về cơ chế (đã lần theo từng câu khóa). Khả năng xảy ra thấp: cần hai lần lưu rơi vào cùng một khe vài chục đến vài trăm ms.

- **Rủi ro:** với hai database không có transaction chung, luật "không bên nào lọt" chỉ đúng khi **cả hai** phía ghi trước rồi mới đọc phía kia. Phía Kế hoạch may làm đúng: ghi, rồi đọc lại Số lượng. Phía Xếp chuyền thì đọc trước. Lúc gọi `assertKept`, transaction Xếp chuyền mới giữ khóa U (`plans.lock`, `lines.lockByParent`), mà khóa U tương thích với khóa S của câu đọc lại bên May. Kịch bản (dòng L, Số lượng 100, chưa có số giao):
  1. Xếp chuyền T_O: giữ U trên L, gọi `assertKept`. `usageQuick` đọc `SewingDayPlanItem`, thấy đã giao 0, cho qua.
  2. Kế hoạch may T_S: ghi `DayQty = 80` (khóa X). Đọc lại Số lượng qua `dayPlanLines`: chỉ gặp khóa U nên **không chờ**, đọc được 100, cho qua, commit.
  3. T_O ghi `Qty = 50` (dòng 329), commit.
  
  Kết quả: đã giao 80 > Tổng kế hoạch 50, đúng điều 14.2 cấm. Đổi chuyền cũng vậy: T_S không kiểm chuyền ở bước đọc lại, nên dòng có số vẫn chuyển được sang chuyền khác (Q12). Khe hở kéo dài từ `assertKept` tới khi ghi dòng: gồm đọc phân màu cỡ, `supplyGuards.snapshot` (đọc chéo MES_Cutting), xóa phân màu cỡ. Câu "Phải nhớ" của 14.2 ("Xếp chuyền tra số đã giao trong transaction của mình") chưa đủ: tra trong transaction nhưng trước khi ghi thì vẫn lọt.
- **Sửa:**
  1. Chuyển `assertKept` xuống **sau** khi ghi dòng dàn chuyền, trước commit, cùng chỗ với `supplyGuards.assertCovered` (dòng 335). Vẫn dùng `existing` (giá trị trước khi ghi) để dựng `LineChange`.
  2. Chờ chéo khi đó tự giải trong khoảng 3 giây, như M1 của 5.15. T_S chờ khóa X của T_O ở bước đọc lại; `usageQuick` của T_O chờ khóa X của T_S tối đa 3 giây rồi lỗi 1222. T_O trả 409 và rollback, T_S chạy tiếp và đọc đúng Số lượng cũ. Không bên nào lọt.
  3. Bước đọc lại của `SewingPlanService.save` kiểm thêm chuyền và thời điểm tạo, không chỉ Số lượng: `now.get(l.id)?.lineCode !== l.lineCode || !sameInstant(now.get(l.id)!.createdAt, l.createdAt)` thì 409.
  4. Sửa câu "Phải nhớ" của 14.2 và đoạn "Chặn ở Xếp chuyền" của `07-may.md` (hiện ghi "trước khi ghi").
  5. Test đơn vị nếu được: giả lập hàm tra ném lỗi hết giờ thì `assertKept` trả 409 (đã có nhánh này).

**[HIGH] H2 `backend/src/modules/sewing/sewing-plan.service.ts:165-169, 179-184` (`present`): ngày đã chốt có dòng dàn chuyền chưa có trong bản chụp thì `GET /sewing/plan` lỗi 500 cho cả ngày, và không Hủy chốt được từ giao diện**

Mức chắc chắn: cao (đọc đường code). Khả năng xảy ra: cao trong vận hành thường ngày.

- **Rủi ro:** khi đầu bảng đã chốt, `live = undefined`, nên `present` đọc `s!.PlanQty`, `s!.CmPrice`, `s!.StyleCode`, `s!.StartDate`… Nhưng `merge` vẫn đưa vào dòng nguồn không có bản ghi (`saved: undefined`) cho chuyền đã chốt. `Number(s!.PlanQty)` khi đó ném `TypeError`, request thành 500. Các đường dẫn tới lỗi này:
  - Sau khi Chốt ngày D, Xếp chuyền thêm một dòng mới vào chuyền L có khoảng ngày chứa D, hoặc đổi ngày một dòng cũ để khoảng ngày chứa D. Guard chỉ chặn bỏ, giảm, đổi chuyền, không chặn thêm hay đổi ngày.
  - Người dùng bấm **Thêm dòng** chọn một PO của chuyền đã chốt. `extra` đưa dòng đó vào lưới; `AddLineDialog` không khóa chuyền đã chốt.
  - Id dòng dàn chuyền được dùng lại (khác `SourceCreatedAt`), hoặc dòng đổi chuyền khi chưa có số (bản ghi cũ nằm ở đầu bảng chuyền cũ).
  
  Hậu quả: lưới của ngày D, ở mọi đơn vị có chuyền L (cả "Mọi chuyền"), hiện "Không tải được kế hoạch may" với mọi người. Nút Hủy chốt bị khóa vì `dayReason` là "Đang tải…" khi chưa có `data`. Qua ngày thì không Hủy chốt được nữa (Q9), nên ngày D lỗi mãi. Test hiện có chỉ đổi PO, Số lượng của dòng đã chụp. Ca test chèn đầu bảng đã chốt không có dòng con (dòng 266–276) cũng gặp đúng lỗi này nếu gọi `GET` ngày hôm qua, chuyền L5.
- **Sửa:**
  1. Theo 14.1 ("ngày đã chốt hiện bản chụp"), dòng nguồn không có trong bản chụp của chuyền đã chốt thì **không hiện**, hoặc hiện số mới nhất kèm cờ `notInSnapshot` (chỉ xem). Cách tối thiểu: `const live = (!h?.IsLocked || !s) && !r.sourceGone ? r.source : undefined;` cộng `canEdit = false` khi chuyền đã chốt (đã có).
  2. Giao diện: `AddLineDialog` khóa (hoặc ghi chú) PO của chuyền đang chốt trong ngày.
  3. Thêm test: Chốt, rồi thêm một dòng dàn chuyền vào chuyền đó ở ngày đã chốt, `GET` trả 200; `extra` trỏ tới dòng của chuyền đã chốt, `GET` trả 200.
  4. Ghi cách hiện dòng này vào `07-may.md`.

---

### MEDIUM

**[MEDIUM] M1 `frontend/src/features/sewing/SewingPlanPage.tsx:130, 133, 151`, `backend/src/modules/sewing/sewing-plan.dto.ts:50-53`: khóa body `versions[].lineCode` trùng mã cột `lineCode`, nên Tổ SX không Sửa được thì Cập nhật, Chốt, Hủy chốt đều 403**

Mức chắc chắn: cao (`FieldPolicyService.assertWritable` duyệt cả object lồng nhau và chặn mọi khóa trùng mã cột không ở mức Sửa được).

- **Rủi ro:** quản trị đặt Tổ SX (`lineCode`) của `sewing.plan` là Chỉ đọc. Đây là cấu hình tự nhiên, vì cột này không bao giờ nhập. Khi đó mọi `PUT /sewing/plan`, `POST /lock`, `/unlock` từ giao diện đều trả `FIELD_READONLY` "Tổ SX". Màn không lưu, không chốt được, câu báo khó hiểu. Đặt Che thì `lines[].lineCode` về `***`: kiểm phiên bản mất tác dụng (`given.has(c)` luôn sai), và vẫn bị 403. Ở 5.15, quyết định 13.10 đã chọn khóa `line`/`style` riêng chính để tránh đúng lỗi này. Test hiện có không gửi `versions` khi đổi chính sách cột nên không bắt được.
- **Sửa:**
  - Đổi khóa body thành `line` (hoặc `key`), giữ `lineCode` ở dữ liệu trả về.
  - `lines[]` trả thêm một khóa không trùng mã cột (ví dụ `key` hoặc `line`) để giao diện gửi lại khi Tổ SX bị Che.
  - Thêm test: `lineCode` Chỉ đọc, Cập nhật kèm `versions` trả 200.

**[MEDIUM] M2 `backend/src/platform/data/base.repository.ts:340-351` (`allows`): khác luật ghi với tài nguyên dùng chung có ĐVCS nguồn (`originBranch`, `usedBy`) và `factoryBranchWrite`**

Mức chắc chắn: cao về đường code. Hiện chưa khai thác được: chỗ gọi duy nhất là `SewingDayPlanRepository` (BRANCH).

- **Rủi ro:** JSDoc và `04-phan-quyen.md` ghi "cùng luật với khi ghi", nhưng với hành động ghi, `allows` chỉ chặn `A00` rồi xét phép gán:
  - Repository `originBranch` (ví dụ `SalesOrderRepository`): `limit` ghi chỉ cho dòng có `BranchCode` = ĐVCS phiên, hoặc dòng được `usedBy` dùng. `allows(scope, 'update', { BranchCode: 'A02' })` từ phiên A01 lại trả `true`.
  - `factoryBranchWrite` (ví dụ `PoAllocation`): không xét nhà máy đã gắn ĐVCS khác.
  
  Đây là API công khai của `BaseRepository`. Module sau này dùng `allows` để quyết định có ghi qua đường riêng (như đã dùng ở Kế hoạch may) sẽ mở ghi chéo ĐVCS mà không ai thấy.
- **Sửa:** đóng an toàn. Ở đầu `allows`: `if (WRITE_ACTIONS.has(action) && (this.originBranch || this.factoryBranchWrite)) throw new Error('allows() chưa hỗ trợ luật ghi của tài nguyên dùng chung có ĐVCS nguồn/nhà máy')`. Hoặc cài đủ luật: `originBranch` thì `BranchCode` của `row` phải là ĐVCS phiên, `usedBy` không tra được từ `row` thì từ chối. Thêm test đơn vị cho `allows` với tài nguyên `originBranch`. Sửa câu mô tả ở `04-phan-quyen.md`.

---

### LOW / SUGGESTION

**[LOW] L1 `frontend/src/features/order/SalesOrderPage.tsx:291`: đường sửa riêng Giá CM mặc định gửi `cmPrice: null` khi khóa đã bị bỏ**

- **Rủi ro:** vòng lọc ở trên xóa `body.cmPrice` khi giá không đổi, rồi `body.cmPrice ?? null` gửi `null`. Máy chủ hiểu là **bỏ giá**: xóa Giá CM của đơn và của kế hoạch ở mọi ĐVCS. Hiện nút Lưu bị khóa khi form không có thay đổi, và các ô khác chỉ xem, nên khó gặp. Nhưng giá trị mặc định này là kiểu hỏng không an toàn: chỉ một thay đổi nhỏ (một ô khác làm form "dirty", hay đổi cách so `isDirty`) là thành xóa giá cho cả công ty.
- **Sửa:** gửi thẳng giá trị form: `{ cmPrice: v.cmPrice === '' ? null : v.cmPrice }`. Hoặc giá không đổi thì không gọi API, đóng popup.

**[LOW] L2 `frontend/src/features/sewing/SewingPlanPage.tsx:137`: số gõ trong lúc đang Cập nhật bị coi là đã lưu rồi mất**

- **Rủi ro:** `mutationFn` chụp `changes(rows)` lúc bấm. `onSuccess` lại đặt `saved` = giá trị **hiện tại** của mọi dòng, kể cả ô người dùng gõ tiếp trong lúc chờ. Ô đó hết "dirty", rồi lần tải lại ghi đè bằng số cũ của máy chủ, không có cảnh báo.
- **Sửa:** chỉ cập nhật `saved` theo đúng các ô đã gửi (giữ `sent` trong `mutate(variables)`). Hoặc khóa lưới khi `save.isPending`.

**[LOW] L3 `backend/src/modules/sewing/sewing-plan.service.ts:343-351`, `docs/update_docs/13-quyet-dinh.md` 14.1: lần đầu lập kế hoạch cần quyền Thêm, nhưng 14.1 ghi "dùng quyền Sửa", và giao diện không phản chiếu**

- **Rủi ro:** `07-may.md` có ghi quyền `create`, còn 14.1 (văn bản thắng) chỉ nói `update`. Vai trò có Sửa mà không có Thêm vẫn thấy Cập nhật, Chốt mở, rồi nhận 403 "cần quyền Thêm".
- **Sửa:** ghi `create` vào 14.1. `editableDay`/`lines[].canEdit` trả thêm cờ `canCreate`, để giao diện khóa kèm lý do cho chuyền chưa có bản ghi.

**[LOW] L4 `backend/src/modules/sewing/sewing-plan.service.ts:271, 276, 278, 298, 303, 332`, `backend/src/modules/order/line-day-plan-guard.ts:67-70`: câu báo lỗi nêu tên chuyền, mã hàng mà không xét chính sách cột**

- **Rủi ro:** `save` luôn dùng `org.lineNamer()` và `l.styleCode`. Người có Tổ SX hoặc Mã hàng bị Che vẫn đọc được giá trị thật trong toast 409/422. Chỉ là dòng trong phạm vi sửa của họ, nên mức lộ thấp.
- **Sửa:** dùng `blind` như `get`: không đọc được thì nêu "dòng thứ n" hoặc `lineId`.

**[LOW] L5 `backend/src/modules/sewing/sewing-plan.service.ts:180, 223`: `productName` không đăng ký cột, vẫn trả khi Mã hàng bị Che/Ẩn**

- **Rủi ro:** tên sản phẩm thường đủ để nhận ra mã hàng. Ô lọc "Danh sách mã hàng" cũng tìm theo `productName`. Ngoài ra `deliveredQty` của hai ngày liền nhau trừ nhau ra `dayQty`, nên Che riêng `dayQty` không giấu được số. Cái sau là bản chất định nghĩa Đã giao.
- **Sửa:** đăng ký `productName` vào `sewing.plan` (seed), hoặc không trả khi `styleCode` không đọc được. Ghi giới hạn về `dayQty`/`deliveredQty` vào `07-may.md`.

**[LOW] L6 `backend/src/modules/order/sales-order.service.ts:276-287`: nhật ký sửa Giá CM không cho biết đã đổi gì**

- **Rủi ro:** `redact` bỏ `cmPrice` ở cả `oldValue` và `newValue`, nên dòng `UPDATE` của `SalesOrder` có hai giá trị giống hệt nhau. Phase 5.16 ghi "có ghi 'đổi Giá CM' nhưng không ghi giá trị", nhưng hiện chưa có dấu này. Lần đổi giá của ĐVCS khác làm đổi Doanh số ở ĐVCS nguồn mà không để lại dấu đọc được.
- **Sửa:** ghi thêm `changed: ['cmPrice']` (khóa không phải mã cột), hoặc `actionCode: 'UPDATE_CM_PRICE'`. Cũng vậy ở đường Sửa đơn khi `cmPrice` đổi.

**[LOW] L7 `backend/src/modules/sewing/sewing-plan.repositories.ts:38`: `@LockTimeout = 15000` bằng `requestTimeout` mặc định 15 giây của tedious**

- **Rủi ro:** khi chờ khóa ĐVCS hết giờ, request có thể hết giờ trước, ra `ETIMEOUT` (500) thay vì 409 `BUSY`. Tiền lệ có ở `cutting-supply.repositories.ts`, `sewing.repositories.ts`. Khóa này giữ cả ĐVCS, nên một lần lưu chậm (chờ đọc MES_Order) dồn mọi lần lưu khác.
- **Sửa:** hạ `@LockTimeout` còn khoảng 10000 cho các khóa ứng dụng trên đường request.

**[LOW] L8 `backend/migrations/MES_Sewing/0003_sewing_day_plan.sql`, `backend/migrations/softkeys.json`: `SewingDayPlanItem.CreatedBy` chưa khai khóa ngầm, chưa có chỉ mục**

- **Rủi ro:** tiền lệ bảng con `ShipmentPlanLine.CreatedBy` có khai. `check:softkeys` không kiểm cột này.
- **Sửa:** thêm vào `softkeys.json` (`nullable: true`). Chỉ mục có lọc như bảng cha: `0003` mới chạy trên bộ test nên sửa thẳng file được, theo tiền lệ 5.14. Nếu không làm thì ghi lý do.

**[LOW] L9 `backend/src/modules/sewing/sewing-plan.service.ts:413-430` (`unlock`): Hủy chốt không kiểm `versions`**

- **Rủi ro:** A mở màn thấy đã chốt. B Hủy chốt, sửa, chốt lại. A bấm Hủy chốt thì mở lần chốt của B mà không được báo. Không sai số, chỉ mất trạng thái chốt.
- **Sửa:** `unlock` gọi `staleLines(headers, dto.versions, …)` như `lock`. Giao diện đã gửi `versions`.

**[LOW] L10 `backend/src/modules/hr/hr-line-source.ts:39-53`: `/me/lines` nay trả tên mọi bộ phận cha tới gốc cây cho mọi người đăng nhập**

- **Rủi ro:** trước chỉ có bộ phận cha trực tiếp. Nay có cả các cấp trên (tên, mã), ngoài quyền `hr.orgchart`. Đó chỉ là tên bộ phận có chuyền bên dưới, mức nhạy cảm thấp.
- **Sửa:** chấp nhận. Ghi một câu vào `09-nhan-su.md`/`04-phan-quyen.md`, chỗ mô tả `/me/lines`.

---

### Ghi chú

- Kiểu so `LineCode`: cột `ShipmentPlanLine.LineCode VARCHAR` so với tham số `NVARCHAR` của tedious. Chú thích của `dayPlanFeed` ghi "vẫn tìm theo chỉ mục". Điều này chỉ đúng khi collation là Windows (`Latin1_General_*`). Với collation SQL (`SQL_Latin1_General_*`), SQL Server đổi kiểu cột, nên quét chỉ mục. Đây là hành vi có sẵn của mọi câu lọc chuỗi trong dự án, không phải lỗi mới; nên kiểm collation thật của máy chủ khi tối ưu sau.
- Thiếu test cho các tiêu chí ở 5.16.3–5.16.4:
  - Chốt rồi thêm, đổi ngày dòng dàn chuyền (H2).
  - Xếp chuyền và Kế hoạch may lưu chồng nhau (H1, test đơn vị hàm tra).
  - Tổ SX Chỉ đọc khi gửi `versions` (M1).
  - Sửa đơn của ĐVCS nguồn với `cmPrice` không đổi: không gọi `follow`.
- Không thấy SQL thô ngoài repository, không có điều kiện phân quyền tự viết trong service: `allowed()` gọi `allows` của repository, `totals` dùng `branchOnly`. `usageQuick` và `follow` là việc của hệ thống, nhận ĐVCS, Id từ dữ liệu máy chủ.

### Kết luận lượt 1

> Review Summary: examined 38 files (cùng 3 tài liệu thiết kế), found 0 CRITICAL, 2 HIGH, 2 MEDIUM, 10 LOW findings. Top priority: H2, `GET /sewing/plan` lỗi 500 cho cả ngày khi chuyền đã chốt có dòng dàn chuyền chưa có trong bản chụp (Xếp chuyền thêm hoặc đổi ngày dòng sau khi chốt, hoặc Thêm dòng), và không Hủy chốt được từ giao diện. H1: Xếp chuyền tra số đã giao trước khi ghi nên lần lưu chồng vẫn giao vượt; sửa bằng cách chuyển `assertKept` xuống sau khi ghi (hàm tra đã có chờ khóa 3 giây). Merge recommendation: **BLOCK** tới khi sửa H1, H2. Phân quyền (ĐVCS, phạm vi chuyền, `A00`), đường sửa riêng Giá CM, migration đều đúng; nên sửa M1, M2 cùng lượt.

---

## Lượt 2 (16/10/2026)

### Phạm vi

Các bản sửa theo lượt 1, code chưa commit:
- `backend/src/modules/order/line-plan.service.ts` (`dayPlanChanges`, `assertKept` sau khi ghi), `line-day-plan-guard.ts` (chú thích).
- `backend/src/modules/sewing/sewing-plan.service.ts` (`present`, `blind`, `labels`, `save`, `unlock`), `sewing-plan.dto.ts` (`SewingPlanLineVersionDto.line`), `sewing-plan.repositories.ts` (`@LockTimeout`).
- `backend/src/platform/data/base.repository.ts` (`allows`).
- `backend/src/modules/order/sales-order.service.ts` (`changedFields`).
- `backend/migrations/MES_Sewing/0004_sewing_day_plan_item_created_by.sql` (mới), `backend/migrations/softkeys.json`.
- `backend/test/sewing-plan.spec.ts`.
- `frontend/src/features/sewing/SewingPlanPage.tsx`, `frontend/src/features/order/SalesOrderPage.tsx`.

Chỉ đọc code. Phiên chính đã chạy: `tsc`, lint backend; 6 bộ test (121 bài) trên `MES_*_T514` kèm migrate `0004`; `tsc`, lint frontend; `sewing-plan.test` 10/10.

### Trạng thái từng mục

| Mục | Trạng thái | Ghi chú kiểm |
|---|---|---|
| H1 | **Đã sửa** | `assertKept` chạy sau `lines.removeWhere` và `lines.updateRow`/`insertOne`, cạnh `assertCovered`, trước commit. Lúc tra, T_O đã giữ khóa X trên mọi dòng gửi lên và đã xóa dòng bị bỏ. Câu đọc lại của Kế hoạch may phải chờ T_O xong, nên đọc được Số lượng mới hoặc thấy dòng mất. `usageQuick` chờ khóa của T_S tối đa 3 giây, hết giờ thì T_O trả 409 và rollback. Chờ chéo tự giải, không bên nào lọt. `dayPlanChanges` tính từ `existing` (giá trị trước khi ghi), đúng. Bước đọc lại của `save` nay bắt cả dòng mất, khác thời điểm tạo, đổi chuyền. Chú thích `line-day-plan-guard.ts` đã khớp code |
| H2 | **Đã sửa** | `live = (!locked && !sourceGone) \|\| !s ? source : undefined`. Dòng `sourceGone` luôn có `s`; dòng không có `s` luôn có `source`. Nhờ vậy không còn nhánh nào đọc `s!` khi `s` không có. Dòng đó `canEdit = false` vì chuyền đã chốt. `AddLineDialog` khóa chuyền đã chốt, ghi "(đã chốt)". Có test (`extra` trỏ tới dòng của chuyền đã chốt) |
| M1 | **Đã sửa** | Khóa body là `line`, không trùng mã cột, nên Tổ SX Chỉ đọc không còn chặn Cập nhật, Chốt, Hủy chốt. Còn ý nhỏ khi Tổ SX bị **Che**: xem N1 |
| M2 | **Đã sửa** | `allows` ném lỗi khi gặp hành động ghi trên bảng `originBranch`/`factoryBranchWrite` (đóng an toàn, lỗi lập trình). Chặn `A00` cho BRANCH vẫn giữ. Không ảnh hưởng chỗ gọi hiện có (BRANCH) |
| L1 | **Đã sửa** | Gửi `v.cmPrice` đang hiện trong ô, không còn mặc định `null` |
| L2 | **Đã sửa** | `onSuccess` chỉ đánh dấu đã lưu các ô đã gửi (`variables`). Ô gõ thêm trong lúc chờ vẫn chưa lưu, nên lần tải lại giữ nó qua `keep` |
| L3 | **Đã sửa** | Khóa Cập nhật, Chốt kèm lý do khi chưa có quyền Thêm mà chuyền chưa có bản ghi (phiên bản `"0"`). 14.1 đã ghi. Máy chủ vẫn 403 như cũ |
| L4 | **Đã sửa** (Kế hoạch may) | `labels()` theo `lineCode`, `styleCode`: không đọc được thì nêu số chuyền hoặc Id dòng. Câu báo của `LineDayPlanGuards` ở Xếp chuyền theo chính sách cột của `order.lineplan`, không cần đổi |
| L5 | **Đã sửa** | `productName` không trả khi Mã hàng Ẩn/Che, ở cả `get` và `options`. Phần `dayQty`/`deliveredQty` cần ghi tài liệu |
| L6 | **Đã sửa** | Nhật ký có `changedFields` (`cmPrice`, `unitPrice` khi đổi). Khóa này không phải mã cột nên `redact` không bỏ, cũng không lộ giá |
| L7 | **Đã sửa** | `@LockTimeout = 10000` < `requestTimeout` 15 giây, nên hết giờ thì ra 409 `BUSY` |
| L8 | **Đã sửa** | `MES_Sewing/0004` thêm chỉ mục có lọc trên `CreatedBy`, chỉ thêm chỉ mục nên chạy an toàn trên máy đã cài. Tên chỉ mục không trùng. Đã khai trong `softkeys.json` |
| L9 | **Đã sửa** | `unlock` kiểm `versions` của các chuyền đang chốt |
| L10 | Chưa sửa, ghi tài liệu | Như phiên chính đã nêu |

### Mục mới

**[LOW] N1 `frontend/src/features/sewing/SewingPlanPage.tsx:132-135, 321`, `backend/src/modules/sewing/sewing-plan.service.ts:121-134`: Tổ SX bị Che thì bỏ qua kiểm phiên bản, và lựa chọn chuyền gộp thành `***`**

- **Rủi ro:** `lines[].lineCode` bị Che thành `***`, nên giao diện gửi `versions: [{ line: '***' }]`. Máy chủ không thấy chuyền nào khớp, nên bỏ qua bước kiểm "người khác vừa ghi". Hai người cùng sửa một chuyền khi đó thành "người lưu sau thắng", không có 409. Chuyền đã chốt vẫn được chặn (409), nên không sửa được ngày đã chốt. Các bộ `fresh`, `lockedLines` (Thêm dòng) cũng theo `***`. Chỉ gặp khi quản trị đặt Che cho Tổ SX.
- **Sửa (tùy chọn):** `lines[]` trả thêm một khóa không trùng mã cột, ví dụ `key` là mã chuyền thật hoặc một mã băm theo ĐVCS và mã chuyền, rồi giao diện dùng khóa này cho `versions`, `fresh`, `lockedLines`. Không làm thì ghi giới hạn vào `07-may.md`.

### Kết luận lượt 2

> Review Summary: examined 11 files (bản sửa lượt 2), found 0 CRITICAL, 0 HIGH, 0 MEDIUM, 1 LOW mới (N1). H1, H2, M1, M2 và L1–L9 đã sửa đúng; L10 chuyển sang tài liệu. Kiểm sau khi ghi ở Xếp chuyền cộng `LOCK_TIMEOUT` 3 giây của `usageQuick` giữ được luật 14.2 khi hai bên lưu chồng, chờ chéo tự giải bằng 409 ở phía Xếp chuyền. Merge recommendation: **APPROVE WITH SUGGESTIONS**. Còn lại: ghi L10 và phần `dayQty`/`deliveredQty` của L5 vào tài liệu; N1 sửa hoặc ghi giới hạn.

### Xử lý sau lượt 2 (phiên chính)

- **L5, L10:** đã ghi tài liệu ở `docs/update_docs/07-may.md` (mục Kế hoạch may: Phân quyền và chính sách cột; Màn hình).
- **N1:** sửa phần không cần lộ mã chuyền: máy chủ trả `firstOfDay` từng dòng; giao diện xét quyền Thêm theo `firstOfDay` và `version = "0"` (không theo mã chuyền); `versions` bỏ chuyền có mã bị Che (không gửi `***`). Phần còn lại (Tổ SX bị Che thì không kiểm được người khác vừa ghi, Thêm dòng không chọn được chuyền) **chấp nhận**, ghi giới hạn ở `07-may.md`: trả mã chuyền thật dưới khóa khác sẽ lộ đúng giá trị đang bị Che. Không Che Tổ SX với vai trò được Sửa Kế hoạch may.
