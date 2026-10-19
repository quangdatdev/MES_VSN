# Review Phase 5.3 – Module Đơn hàng (phần bổ sung)

Review chính của Phase 5.3 làm chung với 5.1 (`docs/review/phase-5-1.md`). File này ghi các lượt review cho phần bổ sung sau đó.

## 5.3.7 – Chi nhánh FOB, Nhà máy SX (10/10/2026)
Người dùng yêu cầu: màn Thông tin đơn hàng đổi "Chi nhánh SX" thành "Chi nhánh FOB", thêm cột "Nhà máy SX" chọn tay từ danh mục nhà máy sản xuất. Có migration (`MES_Order/0004`) và seed nên review ngay. Agent chỉ đọc, chạy `tsc --noEmit` hai phía và `npm run lint` (đều qua).

Phạm vi: migration `MES_Order/0004`, `softkeys.json`, `check-softkeys.ts`, `order.types.ts`, `order.dto.ts`, `order.repositories.ts`, `sales-order.service.ts`, `catalog-lookup.service.ts`, `seed-data.ts`, `seed.ts`, `reset-demo.ts`, `test/catalog.spec.ts`, `SalesOrderPage.tsx`, `common.tsx`, `api.ts`, tài liệu thiết kế.

| Lượt | Kết luận agent | Phát hiện |
|---|---|---|
| 1 | APPROVE WITH SUGGESTIONS | 0 CRITICAL, 0 HIGH, 0 MEDIUM, 7 LOW |

Agent kiểm và xác nhận đúng: `BranchCode` không nhận từ client, `A00` bị chặn ghi ở repository; chính sách cột áp ở xem, sửa, xuất file (đổi mã sang tên nhưng giữ khóa `productionFactoryCode`), sắp xếp, gợi ý; migration `VARCHAR(30)` khớp `SysCatalogItem.Code`, có index, khóa ngầm đã khai báo, `check-softkeys` truyền mã danh mục dạng tham số; cache `CatalogLookupService` được làm mới khi sửa danh mục; reset-demo không xóa vật lý; frontend chỉ gửi trường đã đổi.

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| 1 | LOW | Gửi lại đúng mã nhà máy hiện tại (đã ngừng) bị 422; client gửi đủ mọi trường không lưu được đơn cũ | Giữ nguyên giá trị hiện tại thì không kiểm | Đóng (test) |
| 2 | LOW | Sắp xếp theo mã nhà máy trong khi lưới hiện tên | Bỏ sắp xếp cột Nhà máy SX (tên nằm ở database khác) | Đóng |
| 3 | LOW | Cột mới trùng thứ tự với cột cũ trên DB đã seed | Seed đặt lại thứ tự cột hệ thống khi khác seed | Đóng (đã chạy seed, thứ tự đúng) |
| 4 | LOW | Seed thêm mục Nhà máy sản xuất cho nhà máy tạo sau, không chỉ "mục ban đầu" | Giữ hành vi (như mọi danh mục: chỉ thêm mục còn thiếu, không sửa, không bật lại); sửa mô tả ở `seed-data.ts`, `db-core.md` | Đóng (tài liệu) |
| 5 | LOW | Tài liệu sót: danh sách danh mục ở api-contract, khóa ngầm ở db-order, giải thích khóa `catalog` ở `softkeys.json` | Bổ sung | Đóng |
| 6 | LOW | Test thiếu: mức Che, xuất file khi Ẩn, file xuất ghi tên, chuỗi rỗng, A00 | Thêm assert Che (`***`, gợi ý rỗng, file xuất không lộ tên), Ẩn (file xuất không có cột), file xuất ghi tên, chuỗi rỗng là bỏ chọn. A00 chặn ghi đã có test chung ở Phase 3/5 (không có vai trò mẫu nào vừa có quyền sửa vừa vào A00) | Đóng |
| 7 | LOW | Nút chọn nhà máy trên đầu trang vẫn ghi "Chi nhánh SX", cùng màn có "Nhà máy SX" nghĩa khác | Ngoài yêu cầu (chỉ đổi trong màn Thông tin đơn hàng): hỏi người dùng | Chờ người dùng |

Ghi chú nghiệp vụ của agent: đơn hàng vẫn chỉ hiện ở nhà máy của `BranchCode` (chi nhánh FOB); người của nhà máy được chọn ở "Nhà máy SX" không thấy đơn đó. Nếu cần, chờ BA chốt.

**Kết quả:** không còn CRITICAL/HIGH/MEDIUM; LOW #7 chờ người dùng. Test backend 124/124, frontend 19/19, lint, build, `check:softkeys` qua.

## 5.3.8 – Lưới nhập kiểu bảng tính, đổi tên và thứ tự nhóm menu (10/10/2026)
Người dùng yêu cầu: đổi tên, thứ tự nhóm menu; lưới nhập liệu dễ copy và dán, được dùng thư viện ngoài nhưng hợp giao diện hiện tại. Có sửa seed nên review ngay. Thư viện chọn: `react-datasheet-grid` (ADR 0008).

Phạm vi: `components/SheetGrid.tsx`, khối `.sheet-*` trong `global.css`, `CutRatioPage.tsx`, `ShipmentPage.tsx`, `ColorSizePage.tsx`, `LinePlanPage.tsx`, `test/sheet.test.ts`, `backend/scripts/seed-data.ts`, `seed.ts`, `package.json` (gốc, frontend), ADR 0008, tài liệu seed và phase.

| Lượt | Kết luận agent | Phát hiện |
|---|---|---|
| 1 | BLOCK | 0 CRITICAL, 1 HIGH, 5 MEDIUM, 9 LOW |

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| 1 | HIGH | Dán nhiều dòng quá cuối lưới dàn chuyền: thư viện hỏi ô khóa với dòng chưa có (undefined), hàm khóa theo dòng lỗi, không dán được gì, không báo | Hàm khóa ô và tô ô chịu được dòng chưa có (dòng mới không khóa) | Đóng (test đơn vị; thử trên trình duyệt: dán 4 dòng từ ô Chuyền, dán cột số quá cuối lưới) |
| 2 | MEDIUM | Menu chuột phải lệch chỗ trong popup (khung Modal có transform) | Đưa menu ra `document.body` | Đóng (thử: menu đúng vị trí con trỏ) |
| 3 | MEDIUM | `seed.ts` bước 4 lỗi kiểm kiểu | Tách biến; backend `tsc --noEmit` qua | Đóng |
| 4 | MEDIUM | Enter ở ô "Thêm N dòng" (và Shift+Enter khi đang sửa ô) gửi form Thêm PO | Chặn hành vi mặc định của Enter trong ô của lưới | Đóng (thử: không gửi form) |
| 5 | MEDIUM | Esc trong lưới đóng popup, mất phần đang nhập | Popup có lưới nhập tắt "Esc để đóng" | Đóng (thử) |
| 6 | MEDIUM | `overrides` ghim React 19.3.0, nâng React sẽ có hai bản | Dùng `^19.0.0`; ADR ghi bước kiểm `npm ls react` | Đóng (`npm ls`: một bản) |
| 7 | LOW | Nhân bản dòng ngoài phạm vi sửa giữ nguyên chuyền ngoài phạm vi | Bản sao bỏ trống chuyền | Đóng |
| 8 | LOW | Thêm nhiều dòng một lần thì mọi dòng nhận cùng số lượng còn lại | Chỉ dòng đầu nhận | Đóng |
| 9 | LOW | Prop tạo mới mỗi lần vẽ làm lưới tính lại cột, vẽ lại ô | Hằng số, `useCallback` đọc qua ref | Đóng |
| 10 | LOW | Thanh cuộn riêng vào được bằng Tab; ô thư viện thiếu nhãn | `tabIndex={-1}`; ghi giới hạn trong ADR | Đóng |
| 11 | LOW | Firefox ẩn cả thanh cuộn dọc | Chấp nhận tạm, giả định máy dùng Chrome/Edge (cần xác nhận); ghi ADR | Đóng (tài liệu) |
| 12 | LOW | `any` không ghi lý do, comment lặp | Sửa | Đóng |
| 13 | LOW | Thiếu test chặn xóa dòng, ô khóa | Tách `blockedDeletes` + test; test ô khóa với dòng chưa có | Đóng |
| 14 | LOW | Seed không đồng bộ thứ tự tài nguyên hệ thống | Đồng bộ `SortOrder` khi `IsSystem` | Đóng |
| 15 | LOW | Kịch bản demo còn tên nhóm menu cũ | Sửa | Đóng |

Sau khi sửa: test backend 124/124, frontend 25/25, lint, kiểm kiểu hai phía, build qua.

| Lượt | Kết luận agent | Phát hiện |
|---|---|---|
| 2 | APPROVE WITH SUGGESTIONS | 15 phát hiện lượt 1 đóng đúng; 1 LOW mới |

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| 16 | LOW | Có `createRow` mà thiếu `duplicateRow` thì nhân bản dòng giữ nguyên khóa, hai dòng trùng `rowKey` | Kiểu của `SheetGrid` bắt buộc có cả hai hoặc không có cả hai | Đóng |

**Kết quả 5.3.8:** không còn CRITICAL/HIGH/MEDIUM/LOW mở. Test backend 124/124, frontend 25/25, lint, kiểm kiểu, build qua.

## 5.3.9 – Rà soát UI/UX toàn bộ giao diện (10/10/2026)
Người dùng yêu cầu rà lại toàn bộ giao diện theo quy tắc UI/UX trước khi làm màn mới. Kết quả thành bộ quy tắc `docs/thiet-ke/quy-tac-ui-ux.md`.

**Cách rà:**
- 3 agent đọc code theo một bộ quy tắc chung: khung ứng dụng, module Đơn hàng, nhóm Quản trị. Tổng khoảng 170 phát hiện, trong đó 14 HIGH.
- Kiểm trên trình duyệt ở 1440px, 390px, 360px, chế độ tối. Dữ liệu thật được che trước khi chụp.
- Lighthouse (truy cập) và thử bằng bàn phím.

**Lỗi tìm thêm trên trình duyệt:**
- Điện thoại mất phần đầu trang: `.app-body` thiếu `min-height: 0`.
- Popup dàn chuyền tràn ngang trên điện thoại: lưới dùng `1fr`.
- Vòng focus cam của Mantine chỉ đạt 2,1:1.
- Nút phân trang thiếu tên; tên đọc của nút trên thanh trên khác chữ hiển thị.

**Cách sửa:**
- Phiên chính sửa phần dùng chung: theme, `global.css`, `DataGrid`, `Pager`, `SheetGrid`, `AppLayout`, thêm `ActionButton`, `lib/confirm.tsx`, `lib/leaveGuard.ts`, `lib/useUrlParams.ts`, `lib/useMobile.ts`, `fmtDateTime`.
- 2 agent sửa song song module Đơn hàng và nhóm Quản trị (mỗi bên một nhóm file).
- Phiên chính so từng thay đổi với bản chụp trước khi sửa, gộp phần viết trùng (`useUrlParams`), sửa lỗi Esc lặp ở hộp xác nhận.

Phạm vi review: 49 file (danh sách trong lời gọi agent), gồm mọi file frontend đã đổi và 3 file test mới.

| Lượt | Kết luận agent | Phát hiện |
|---|---|---|
| 1 | APPROVE WITH SUGGESTIONS | 0 CRITICAL, 0 HIGH, 6 MEDIUM, 18 LOW |

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| M1 | MEDIUM | Mũi tên lên/xuống trong lưới không tới được dòng đang chọn | Chuyển tới dòng kề có `tabindex`; test `datagrid.test.tsx` | Đóng |
| M2 | MEDIUM | Bật giảm chuyển động thì vòng tải, khung chờ nháy loạn | `animation-iteration-count: 1`, vạch đang tải đứng yên | Đóng |
| M3 | MEDIUM | Mở lại chính màn đang sửa (Ctrl+K) xóa cờ chưa lưu, sau đó rời màn không hỏi | Không xóa cờ khi rời màn (cờ tự gỡ khi màn bị gỡ); bỏ qua điều hướng tới chính màn đang mở | Đóng |
| M4 | MEDIUM | Nút đổi khóa/mở bị dựng lại, mất focus bàn phím | Luôn bọc Tooltip (tắt khi không có lý do) | Đóng |
| M5 | MEDIUM | Đang sửa phạm vi vai trò A, bấm sửa vai trò B mất phần đã chọn | Khóa "Sửa phạm vi" của vai trò khác, nói lý do | Đóng |
| M6 | MEDIUM | Trang trên URL vượt trang cuối: lưới báo rỗng, chân bảng "151-120" | `useClampPage` về trang cuối; Pager chặn số | Đóng |
| L1–L18 | LOW | Cảnh báo nháy ở chọn nhà máy; popup quản trị chưa chặn F5; viền focus ô nhiều giá trị; Esc trong ô giờ; Esc hai popup lồng; `returnValue`; Hoàn tác, điền tự động không hỏi; "—"; nút đồng bộ khi đang gửi; closure cũ; Lưu khi chưa đổi; tách `cutRatioRules.ts`… | Sửa | Đóng |
| L6, L8, L9, L18 | LOW | Độ bền đếm hộp xác nhận khi Mantine bỏ `onClose` lồng nhau; bộ lọc không theo Back; request thừa trước debounce; giá trị mặc định "Chiếc", ca 07:30–16:30 | Không sửa: hiện không có chỗ gọi lồng; URL ghi kiểu replace nên Back không đổi lọc; ảnh hưởng nhỏ; là giá trị chuẩn của công ty, không phải đoán | Hoãn có lý do |

| Lượt | Kết luận agent | Phát hiện |
|---|---|---|
| 2 | APPROVE WITH SUGGESTIONS | Các mục lượt 1 đóng đúng; 5 LOW mới |

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| 1 | LOW | Khối giảm chuyển động của vạch đang tải bị quy tắc gốc viết sau đè | Tăng độ đặc hiệu | Đóng |
| 2 | LOW | Esc trong ô ngày (lịch đang mở) đóng luôn popup Đơn hàng (có từ trước) | `DateField` đặt `data-mantine-stop-propagation` khi lịch mở; thử trên trình duyệt: Esc lần 1 đóng lịch, lần 2 đóng popup | Đóng |
| 3 | LOW | `?page=Infinity` gõ tay làm lưới lỗi mãi | `pageOf` chỉ nhận số nguyên an toàn | Đóng |
| 4 | LOW | Việc làm trong `onConfirm` gọi `confirmDiscard` bị chặn vì hộp chưa đóng | Thôi đếm trước khi gọi `onConfirm` | Đóng |
| 5 | LOW | Comment lỗi thời, `clearButtonProps` trùng mặc định theme | Sửa | Đóng |

**Kết quả 5.3.9:** không còn CRITICAL/HIGH/MEDIUM mở. Frontend: test 38/38 (8 file), lint, kiểm kiểu, build qua; console trình duyệt không lỗi.

**Chưa làm, chờ người dùng/BA chốt:**
- thuật ngữ BA trên tiêu đề cột (SL KHXH, NSBQ chuyền, KT, BĐ…);
- chữ "Chi nhánh SX" trên thanh trên;
- cột Chi nhánh ở các màn (liên quan yêu cầu Chi nhánh FOB / Nhà máy SX đang chờ làm).

## 5.3.10 – Cột Chi nhánh hiện tên chi nhánh (10/10/2026)

Phạm vi:
- `GET /me/branch-names`, `CatalogLookupService.branchNames` (đọc `bravo.DM_CHINHANH` qua `SyncService`);
- file xuất của 5 màn;
- `components/BranchName.tsx` ở 6 màn nghiệp vụ;
- test và tài liệu.

| Lượt | Kết luận agent | Phát hiện |
|---|---|---|
| 1 | APPROVE WITH SUGGESTIONS | 0 CRITICAL, 0 HIGH, 2 MEDIUM, 8 LOW |

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| 1 | MEDIUM | Một chi nhánh hai tên trên cùng màn: phụ đề, thanh trên dùng tên ở Quản trị › Nhà máy, cột dùng `TenChiNhanh`. Phụ đề Thông tin đơn hàng còn gắn nhãn "(Chi nhánh FOB)" cho tên kia | Phụ đề, thông báo trong 4 màn nghiệp vụ dùng cùng tên với cột. Thanh trên, trang chủ, màn chọn nhà máy và nguồn tên ở Quản trị › Nhà máy: hỏi người dùng (CLAUDE.md mục 1) | Đóng phần màn nghiệp vụ; chờ người dùng phần còn lại |
| 2 | MEDIUM | Test không giữ được việc lấy `TenChiNhanh` (so API với file xuất, cả hai cùng một hàm), chưa có ca lỗi MES_Sync, tên rỗng | Test đơn vị `branch-names.spec.ts` (5 ca, không cần DB); e2e tách bài riêng, khi có MES_Sync so thẳng với bảng chép; test frontend chờ lần tải lỗi | Đóng |
| 3 | LOW | Mã chỉ có ở BRAVO (văn phòng, A00) lọt vào danh sách | Chỉ ghi đè mã có trong SysBranch (trừ đơn vị tổng hợp) | Đóng (test) |
| 4 | LOW | Tên ở Quản trị › Nhà máy rỗng thì ô Chi nhánh trống | Bỏ tên rỗng, hiện mã | Đóng (test) |
| 5 | LOW | Cache hết hạn thì mỗi request đọc một lần; sửa nhà máy không xóa cache; máy chưa có MES_Sync cảnh báo mỗi 30 giây | Gộp lần đọc đang chạy; sửa, thêm nhà máy thì xóa cache; chỉ cảnh báo khi đổi trạng thái | Đóng (test) |
| 6 | LOW | Cột tên trong file xuất không theo chính sách cột của cột mã (tiềm ẩn: `branchCode` chưa đăng ký) | `ExportColumn.field`: Ẩn, Che cột mã thì ẩn, che cột tên | Đóng |
| 7 | LOW | Ô lọc chuyền khi xem A00 nhóm theo "Nhà máy A01"; file xuất tỷ lệ cắt không có cột Chi nhánh | Nhóm ghi "tên chi nhánh (mã)". File xuất tỷ lệ cắt thiếu cột từ trước, ghi Phát sinh | Đóng phần ô lọc |
| 8 | LOW | Ô chỉ hiện tên, không đối chiếu được với mã trên thanh trên | Rê chuột thấy mã | Đóng |
| 9 | LOW | Kế hoạch chuẩn bị SX tự viết lại phần thêm tên | Dùng `withBranchNames` | Đóng |
| 10 | LOW | Chưa có lint chặn module nghiệp vụ import lớp đồng bộ; Phát sinh ghi sai về sắp xếp | Luật `no-restricted-imports` (`NO_SYNC`); sửa câu | Đóng |

Agent xác nhận đúng:
- ranh giới module, ADR 0007 (chỉ đọc 2 cột bảng chép);
- `/me/branch-names` cần access token, không nhận mã nhà máy từ client;
- xử lý khi chưa có hoặc mất MES_Sync (failFast, cache cả kết quả dự phòng);
- chặn chèn công thức trong file xuất;
- xóa cache frontend khi đổi nhà máy, đăng xuất.

Lượt xác minh (chung lượt 6 của `docs/review/phase-5-4.md`): mọi mục 5.3.10 đã đóng. Phát hiện thêm N4 (tên cũ còn trong cache sau khi sửa nhà máy) đã sửa, có test.

**Kết quả 5.3.10:**
- Không còn CRITICAL, HIGH, MEDIUM mở.
- Chờ người dùng chốt: thanh trên ("Chi nhánh SX A01 …"), trang chủ, màn chọn nhà máy vẫn dùng tên ở Quản trị › Nhà máy.
