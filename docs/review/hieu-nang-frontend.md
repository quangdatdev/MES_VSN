# Rà hiệu năng frontend theo react-best-practices – 11/10/2026

**Trạng thái:** đã thực hiện ở phase 5.7 (11/10/2026), kết quả ở mục 8. Mục 1–7 giữ nguyên như lúc đề xuất.

**Phạm vi:** toàn bộ `frontend/src`, khoảng 12.000 dòng không tính test.
- Phần dùng chung do phiên chính rà: `components`, `shell`, `lib`, `store`, cấu hình build.
- Các màn nghiệp vụ do ba agent rà song song: Đơn hàng; May và Danh mục; Quản trị.
- Mọi phát hiện ghi dưới đây đã được đọc lại mã nguồn để kiểm. Những ước lượng quá tay đã hạ mức, ví dụ ma trận quyền thực tế khoảng 50 tài nguyên chứ không phải 300.

**Bộ quy tắc:** `.claude/skills/react-best-practices`. Bỏ mục Server-Side và hydration vì frontend là Vite SPA.

## 1. Kết luận

**Nền đã tốt.** Không cần đổi thư viện hay kiến trúc:
- Route nạp lười theo màn.
- Nạp quyền dùng `Promise.all`.
- TanStack Query đặt `staleTime` 15 giây và tắt tải lại khi quay về tab.
- Cột lưới đặt ở cấp module.
- Ô tìm có debounce.
- `SheetGrid` đọc callback qua ref; react-datasheet-grid tự ảo hóa dòng và cột, nên lưới nhập vài trăm dòng không phải vấn đề.

**Vấn đề chính là vẽ lại thừa, không phải mạng hay gói JS.** Có hai nguyên nhân gốc:
1. **Chữ đang gõ nằm ở state cấp trang**, ở cả ô lọc lẫn lưới sửa. Mỗi phím gõ làm cả trang render lại.
2. **`DataGrid` không memo theo dòng.** Trang render lại là cả 100 dòng vẽ lại theo.

Hai điều cộng lại thành 1.500 đến 4.100 ô vẽ lại mỗi phím gõ. Nặng nhất là:
- Kế hoạch chuẩn bị SX: 41 cột.
- Tỷ lệ cắt: khi sửa màu cỡ.
- Popup Dàn chuyền.
- Chính sách cột.

**Thứ hai là gọi API thừa:**
- Sau khi lưu, màn làm mới cả nhóm dữ liệu trước khi đóng popup.
- Một số chỗ gọi nối tiếp 2 đến 3 lượt trong khi có thể gọi song song.

**Kèm theo có 3 lỗi đúng/sai** (mục 3.1).

## 2. Số đo nền

Đo bằng `vite build` ngày 11/10/2026.

| Phần | Kích thước nén (min) | Gzip | Ghi chú |
|---|---|---|---|
| JS tải lần đầu (`index` + `api`) | 653 kB | khoảng 210 kB | react-dom, react-router, Mantine, floating-ui, TanStack Query |
| CSS tải lần đầu | 352 kB | 63 kB | Trong đó `@mantine/core/styles.css` gốc là 294 kB |
| Gói lưới nhập `SheetGrid` | 105 kB | 30 kB | Chỉ tải ở màn có lưới nhập |
| Màn lớn nhất (`UsersPage`) | 68 kB | 21 kB | Gồm cả ngăn kéo phân quyền và `DateTimePicker` |

Trong mạng LAN thì mức này chấp nhận được. Phần tối ưu gói tải vì vậy để ưu tiên thấp (mục 3.5).

**Vì sao chưa đo trên trình duyệt thật:** database ở máy này có dữ liệu BRAVO thật, còn mật khẩu demo nằm trong `.env`. CLAUDE.md mục 7 cấm đưa cả hai vào prompt. Cách đo đề xuất nằm ở mục 5.

## 3. Phát hiện

Mức tác động tính theo kích thước dữ liệu thật và tần suất dùng: màn nghiệp vụ dùng hằng ngày được ưu tiên hơn màn quản trị.

### 3.1 Lỗi đúng/sai

| # | Vị trí | Chuyện gì xảy ra | Cách sửa |
|---|---|---|---|
| L1 | `admin/UsersPage.tsx:58`, `admin/AuditPage.tsx:120` | `useClampPage` tính theo 20 dòng/trang trong khi lưới tải 100. Mở link cũ có trang vượt trang cuối, ví dụ tổng 150 dòng mà `page=3`: màn nhảy sang trang 8, vẫn rỗng, rồi kẹt ở dòng "Chưa có người dùng nào". | Một hằng `PAGE_SIZE` dùng chung cho `queryFn`, `useClampPage` và `Pager`, như `order/common.tsx` đã làm. Thêm test. |
| L2 | `admin/PrepStepsPane.tsx:86-89` | Lưu xong thì `setDraft(null)`. Phần người dùng gõ thêm trong lúc đang lưu bị xóa mất, vì lưới vẫn sửa được khi đang lưu. | Khóa lưới khi đang lưu, hoặc chỉ bỏ các dòng đã gửi như `afterSave` của PrepPlanPage. |
| L3 | `order/LineBoard.tsx:136` | Khóa của thanh có chỉ số (`${b.id}-${i}`). Sửa ngày làm thứ tự thanh đổi, các thanh phía sau bị dựng lại và Popover đang mở bị đóng. | Khóa theo id kèm loại thanh (đã lưu hay xem trước). Không dùng riêng `b.id`: khi chưa điền xong, thanh đã lưu và thanh xem trước của cùng một dòng có thể trùng id. |

### 3.2 Thành phần dùng chung (lợi cho nhiều màn cùng lúc)

| # | Mức | Vị trí | Chuyện gì xảy ra | Cách sửa |
|---|---|---|---|---|
| C1 | CAO | `components/DataGrid.tsx:167`, `:410-474` | Không memo theo dòng. Mỗi lần trang render lại là vẽ lại toàn bộ dòng × cột: gõ lọc, bấm chọn dòng, mở popup, cờ đang tải đổi. | Tách `GridRow = memo(...)`. DataGrid tự đọc `rowKey`, `onRowClick`, `onRowDoubleClick` qua ref như SheetGrid, nên trang không phải bọc `useCallback`. Memo `visible` theo `columns` và `policy`. Một dòng chỉ vẽ lại khi dữ liệu dòng, trạng thái chọn hay tích, độ rộng hoặc cột đổi. |
| C2 | TRUNG BÌNH | `components/DataGrid.tsx:68-77` (`Masked`) | Mỗi ô bị Che là một Tooltip Mantine, và hook floating-ui chạy ở mỗi lần render kể cả khi Tooltip đóng. Nếu cột bước của Kế hoạch chuẩn bị SX bị Che thì có 3.200 Tooltip. | Dùng `title` và `aria-label`, giữ biểu tượng khóa. |
| C3 | CAO | `order/common.tsx:168` (`useUrlFilter`, 5 màn Đơn hàng), `sewing/PrepPlanPage.tsx:293`, `admin/UsersPage.tsx:38`, AuditPage, CatalogsPage (LinesPane, ExternalPane), StylePicker của ShipmentPage, BoardFilters của LinePlanPage | Chữ đang gõ ở ô lọc nằm trong state của trang. Truy vấn đã debounce, nhưng mỗi phím vẫn render lại cả trang và lưới. | Một ô nhập dùng chung giữ chữ đang gõ cục bộ, đẩy lên sau 300 ms (Enter thì đẩy ngay), và nhận lại giá trị khi bấm Xóa lọc, Back/Forward hay đổi nhà máy. Ô chọn và ô ngày ghi lên URL ngay, đặt lại trang trong cùng lần ghi; cách này sửa luôn A4. |
| C4 | TRUNG BÌNH | `components/SheetGrid.tsx:102-110` (`dateCell`) | Thư viện mặc định `continuousUpdates = true`, nên mỗi phím gõ trong ô ngày gọi `onChange` của trang. Chữ gõ dở như "20/10" đã được hiểu thành ngày, làm Alert "Ngày TH không được sau hôm nay" hiện rồi tắt, lưới nhảy. | Đặt `continuousUpdates: false` cho ô ngày: ghi khi Enter hoặc rời ô. Ô số giữ nguyên, vì số còn lại cần tính theo từng phím. Cần test: bấm Lưu khi ô đang sửa vẫn lấy giá trị mới; rời màn vẫn được hỏi lại. |
| C5 | THẤP | `components/SheetGrid.tsx:617` | `createRow` truyền thẳng vào thư viện. Popup tạo hàm mới mỗi lần render (`LinePlanPage.tsx:411`) nên lưới render lại. | Đọc qua ref như các callback khác. |
| C6 | THẤP | `components/BranchName.tsx:14-23` | Mỗi ô Chi nhánh tạo một observer `useQuery`, tức 100 đến 200 observer mỗi lưới. | Trang gọi `useBranchName()` một lần; cột vẽ bằng hàm đó (các trang đã memo `columns` theo `branchName`). |
| C7 | THẤP | `components/ColumnFilter.tsx:495-497` | Popup lọc theo cột có tới 500 Checkbox Mantine. Tích một ô là vẽ lại cả 500. | Đo trước. Chậm thì memo từng dòng giá trị hoặc dùng checkbox gốc. |

### 3.3 Màn hình

| # | Mức | Vị trí | Chuyện gì xảy ra | Cách sửa |
|---|---|---|---|---|
| M1 | CAO | `order/CutRatioPage.tsx:119`, `:365` | State sửa màu cỡ nằm ở cấp trang. Mỗi phím gõ trong lưới sửa vẽ lại cả lưới mã hàng và lưới PO, khoảng 1.500 ô. | Tách khối sửa (dòng, kiểm, SheetGrid, Lưu/Hủy) thành component con giữ state riêng, đặt `useLeaveGuard` trong con. |
| M2 | CAO | `sewing/PrepPlanPage.tsx:397-413`, `:109-117` | Khi nhập TH, mỗi phím tính lại 100 × 16 mục kèm ghép chuỗi nhãn. `withEdits` luôn trả Map mới kể cả khi không có gì đổi, nên cả trang render lại: WeekStrip, bộ lọc, PrepSummary. | `withEdits` trả lại `prev` khi không đổi. `onGridChange` chỉ xét các dòng có đối tượng khác cũ. Nhãn chỉ dựng khi cần. Làm cùng C4. |
| M3 | CAO | `sewing/PrepPlanPage.tsx:805-822` | Chế độ xem truyền vào lưới prop mới mỗi lần render: `rowKey`, `onSort`, `empty`, `footer`, và `loadValues={valuesLoader(...)}` dù dòng 428 đã có bản ổn định. Vì vậy `useMemo` cột ở dòng 536 mất tác dụng. | Dùng `loadValues` ổn định và callback ổn định. Hưởng lợi đầy đủ khi có C1 và C3. |
| M4 | TRUNG BÌNH | `sewing/WeekStrip.tsx:67-75` | Không memo: 53 Tooltip render lại mỗi lần trang render. `onPick` là hàm mới mỗi lần (`PrepPlanPage.tsx:759`). | Bọc `memo`. `onPick` dùng `useCallback` và tính phần nới ngày bên trong `setFilter(f => ...)`. Memo cả PrepSummary. |
| M5 | TRUNG BÌNH | `sewing/PrepPlanPage.tsx:546-549` | Cột bước bị Che thì có 32 cột × 100 dòng ô Masked. | Gộp thành một cột "Các bước chuẩn bị: ***". Làm cùng C2. |
| M6 | TRUNG BÌNH | `order/LinePlanPage.tsx:326-348`, `order/LineBoard.tsx:43`, `:138` | Trong popup Dàn chuyền, `bars` phụ thuộc toàn bộ `rows`. Mỗi phím gõ, kể cả ở cột không ảnh hưởng thanh, dựng lại `LineBoard` (không memo), và mỗi thanh có một Popover riêng. | Memo `LineBoard`, `renderActions` ổn định. `bars` chỉ tính theo các trường ảnh hưởng thanh, hoặc dùng `useDeferredValue(rows)`. Một Popover chung neo vào thanh được bấm. |
| M7 | TRUNG BÌNH | `admin/FieldPoliciesPage.tsx:52-57`, `:197-229` | Bảng Select có số cột × số vai trò ô, ví dụ 30 × 10 là 300 Select. Đổi một ô là vẽ lại tất cả: mỗi ô nhận mảng `data` mới, object `styles` mới, còn `setCell` không ổn định. | `PolicyCell = memo(...)` chỉ nhận prop kiểu nguyên thủy. Đưa `data` ra hằng cấp module. `setCell` dùng hàm cập nhật. Màu chữ chuyển sang `data-level` cộng CSS. Cân nhắc `NativeSelect`. |
| M8 | TRUNG BÌNH | `admin/PermissionsPage.tsx:56-58`, `:75`, `:118`, `:188-254` | Mỗi cú tích vẽ lại cả ma trận, khoảng 250 Checkbox cộng các ô chọn cả hàng, cả cột. Bản nháp chép từ dữ liệu bằng `useEffect`, nên ở lần render đầu mọi ô đã lưu bị tô "đã đổi", badge "Chưa lưu" và chặn rời màn bật lên một nhịp. URL đã có `role` nhưng vẫn chờ danh sách vai trò về rồi mới gọi quyền của vai trò. | `ResourceRow = memo(...)`, `toggle` dùng `useCallback`, tính sẵn Map. Bản nháp gắn với `roleId` như FieldPoliciesPage. Gọi quyền ngay theo `role` trên URL. |
| M9 | TRUNG BÌNH | `admin/UsersPage.tsx:38`, `:82-85`, `:99-128` | Ô tìm ở gốc trang: mỗi phím vẽ lại 100 dòng, mỗi dòng có tới 5 nút kèm Tooltip. | Áp C3. Dùng Map `roleById`, `branchById`. |
| M10 | TRUNG BÌNH | `admin/UserAccessDrawer.tsx:96-106`, `:574` | Tab "Xem thử" luôn được mount (Tabs giữ mount), nên mỗi lần mở ngăn kéo đều gọi `/effective` (server tính quyền thật) dù không mở tab đó. | Chỉ mount khi mở tab lần đầu. Các tab có form giữ nguyên như cũ. |
| M11 | TRUNG BÌNH | `admin/CatalogsPage.tsx:953-998` (ExternalPane), `:344-432` (LinesPane) | Mỗi phím tìm vẽ lại 100 dòng × 15–40 cột BRAVO; ô trống dùng `<Text span>`. Mỗi dòng của cây chuyền có 2–4 Tooltip. | Áp C3. Ô trống đổi sang `<span className="cell-empty">`. Tính cột id trong `useMemo`. |
| M12 | THẤP | `admin/SyncPage.tsx:91`, `:103-106` | Trong lúc đồng bộ, đồng hồ đổi mỗi giây làm render lại cả trang lẫn ngăn kéo lịch sử. | Tách component nhỏ `<Ago>` đọc đồng hồ dùng chung. |
| M13 | THẤP | Nhiều chỗ, xem cột bên | Mảng hoặc hàm mới mỗi lần render làm cột lưới tính lại:<br>• `CutRatioPage.tsx:293`, `:303`, `:336`: `columns`, `loadValues`<br>• `order/common.tsx:74-86`, `PrepPlanPage.tsx:77`: `?? []` (nặng nhất khi `/me/lines` chưa về)<br>• `ShipmentPage.tsx:288-291`: `sheetRows`<br>• `LinePlanPage.tsx:411`: `newLine` | `useMemo`; hằng `EMPTY` ở cấp module. |

### 3.4 Gọi API

| # | Mức | Vị trí | Chuyện gì xảy ra | Cách sửa |
|---|---|---|---|---|
| A1 | TRUNG BÌNH | `SalesOrderPage.tsx:264`, `ShipmentPage.tsx:250`, `CutRatioPage.tsx:499`, `LinePlanPage.tsx:371`, `ColorSizePage.tsx:178`; `PrepPlanPage.tsx:583`, `:918` | Popup làm mới cả nhóm `['order']` trước khi đóng. TanStack tải lại ngay các query của chính popup rồi bỏ đi: chi tiết, bảng dàn chuyền 68 ngày, bản nháp. `['order','options']` (3 câu DISTINCT) cũng bị gọi lại sau mọi lần lưu. Ở PrepPlanPage, lệnh `await` chờ cả các query phụ; nếu một query phụ lỗi thì ô vừa lưu vẫn kẹt trong nháp. | Đóng popup trước, làm mới sau. Chỉ chờ khóa danh sách. Khóa `options` chỉ làm mới khi ghi đơn hàng. |
| A2 | TRUNG BÌNH | `admin/UserAccessDrawer.tsx:113-116` | Mỗi lần lưu trong ngăn kéo: làm mới cả `['admin']` (7–8 query), xong mới làm mới `user-access` lần nữa. Nút Lưu chờ cả hai lượt. | `Promise.all` các khóa thật sự bị ảnh hưởng: `user-access`, `effective`, và danh sách người dùng nếu thao tác đổi thứ hiện trên danh sách. |
| A3 | TRUNG BÌNH | `order/CutRatioPage.tsx:135-157` | F5 hay mở link phải đợi 3 lượt nối tiếp (mã hàng → PO → màu cỡ) dù URL đã có `so` và `po`. | Gọi PO và màu cỡ song song theo id trên URL. |
| A4 | TRUNG BÌNH | `sewing/PrepPlanPage.tsx:293-316`, `order/common.tsx` (`changeFilter`) | Trang ghi lên URL ngay, còn bộ lọc trễ 300 ms. Kết quả là 2 lượt gọi danh sách, có thể nháy "Không có việc…". | Làm cùng C3. |
| A5 | THẤP | `sewing/PrepPlanPage.tsx:330-337` | Cờ `typesOpen` không về `false`. Từ lần mở đầu, mỗi lần đổi lọc hay lưu đều gọi thêm `/values?field=styleType`. | Đặt lại cờ khi đóng danh sách. |
| A6 | THẤP | `UserAccessDrawer.tsx:396-405`, `order/common.tsx:134`, `LinePlanPage.tsx:174` | Select quyền (khoảng 250 lựa chọn) và Autocomplete khách hàng vẽ hết lựa chọn. | Thêm `limit` 50–100. |
| A7 | THẤP | `CatalogsPage.tsx:108-114`, `FieldPoliciesPage.tsx:37-43`, `ShipmentPage.tsx:201-225` | Còn vài chỗ chờ nối tiếp một lượt. | Nạp trước theo id trên URL. Riêng ShipmentPage cần đổi backend nên chỉ ghi nhận. |
| A8 | THẤP | `lib/api.ts` | `api()` không nhận `AbortSignal`. Lật trang hay đổi lọc nhanh thì request cũ vẫn chạy tới DB. | Thêm tham số `signal`, `queryFn` truyền `signal` của TanStack vào. |

### 3.5 Gói tải

| # | Mức | Việc | Ghi chú |
|---|---|---|---|
| G1 | THẤP | Tách thư viện (react, router, Mantine, floating-ui, TanStack) khỏi code ứng dụng thành chunk riêng | Hiện mỗi lần triển khai có sửa khung hay `lib/api.ts`, máy người dùng phải tải lại khoảng 210 kB gzip. Tách ra thì chỉ tải lại phần ứng dụng nhỏ. Kiểm cú pháp cấu hình của Vite 8 (Rolldown) khi làm. |
| G2 | THẤP | Nạp trước chunk của màn | Hiện chunk màn chỉ tải sau khi làm mới phiên và 4 API quyền xong, mất thêm một lượt khứ hồi. Nên nạp chunk theo URL hiện tại song song lúc khởi động, và nạp trước khi rê chuột hoặc focus vào menu, Spotlight. |
| G3 | THẤP | `UserAccessDrawer.tsx:15` import `levelColor` từ `FieldPoliciesPage` | Kéo code của màn khác vào. Chuyển hàm này sang `admin/common.tsx`. |
| G4 | Tùy chọn | Nhập CSS Mantine theo từng component; nạp lười các popup chứa SheetGrid | Lợi nhỏ, rủi ro thiếu style. Chỉ làm nếu đo trên điện thoại thấy cần. |

### 3.6 Đã làm tốt (để khỏi sửa nhầm)

- **Tải dữ liệu:**
  - Route lazy; `fetchAccess` gọi 4 API song song.
  - `keepPreviousData` khi lật trang.
  - Các khóa dùng chung (`['admin','roles']`, `PREP_STEPS_KEY`…) giúp không gọi trùng.
  - Polling của SyncPage tự dừng.
- **Lưới nhập:** `SheetGrid` đọc callback qua ref. PrepPlanPage giữ đối tượng của dòng không đổi (`rowCache`), còn `sheetCols` không phụ thuộc nháp.
- **Popup và state:**
  - Popup chỉ mount khi mở.
  - Form con giữ state riêng trong ngăn kéo phân quyền.
  - FieldPoliciesPage gắn bản nháp với màn đang xem, không dùng `useEffect`.
- **Gói tải:** icon Tabler tách theo từng icon; Mantine import theo tên.

## 4. Kế hoạch điều chỉnh

| Đợt | Việc | Tiêu chí xong | Công |
|---|---|---|---|
| 0. Đo nền | Viết phép đo bằng `<Profiler>` với dữ liệu giả, để ngoài bộ test mặc định:<br>• DataGrid 100 × 15 và 100 × 41: bấm chọn dòng, gõ lọc<br>• ma trận Chính sách cột 30 × 10<br>• nhập TH ở lưới Kế hoạch chuẩn bị SX<br>Chạy Chrome Performance với CPU chậm 4× cho 3 thao tác (mục 5). | Có bảng số trước khi sửa, ghi vào file này | 0,5 ngày |
| 1. Lỗi đúng/sai | L1, L2, L3 | Có test cho L1, L2; lint và test qua | 0,5 ngày |
| 2. Dùng chung | C1, C2, C3 (thành phần chung và áp vào một màn mẫu), C4, C5, C6 | • Test DataGrid và SheetGrid hiện có vẫn qua<br>• Test mới: chọn dòng chỉ vẽ lại 2 dòng; gõ ô lọc không render lại trang<br>• Test C4: bấm Lưu khi ô ngày đang sửa | 1,5–2 ngày |
| 3. Màn nặng | M1 đến M11, M13; áp C3 cho các màn còn lại | Số đo đợt 0 giảm rõ; hành vi không đổi (test hiện có qua, thử tay theo kịch bản của từng phase) | 2–2,5 ngày |
| 4. Gọi API | A1 đến A6; A8 tùy chọn | Lưu một lần không còn request thừa (xem tab Network); F5 Tỷ lệ cắt còn 1 lượt chờ | 1 ngày |
| 5. Gói tải (tùy chọn) | G1 đến G3 | Build qua; chunk thư viện giữ nguyên hash khi chỉ sửa code ứng dụng | 0,5 ngày |
| 6. Review và đo lại | Chạy `code-reviewer`; đo lại như đợt 0; ghi kết quả. Bổ sung vào `quy-tac-ui-ux.md` vài quy tắc:<br>• state đang gõ đặt ở component nhỏ nhất<br>• prop truyền vào lưới phải ổn định<br>• đóng popup trước rồi mới làm mới dữ liệu | Không còn phát hiện CAO mở | 0,5 ngày |

- **Tổng:** khoảng 6,5–8 ngày công.
- **Bản tối thiểu:** đợt 1, đợt 2, cộng M1, M2, M3, M6 và A1. Khoảng 3–3,5 ngày công, xử lý được phần giật khi gõ ở các màn dùng hằng ngày.

**Rủi ro và cách giữ an toàn**
- **Memo dòng của DataGrid (C1):** cột có `render` đọc giá trị ngoài dòng (tên chi nhánh, chính sách cột) phải đổi `columns` khi giá trị đó đổi, nếu không ô sẽ hiện giá trị cũ. Rà từng màn khi áp.
- **Tách state ô lọc (C3):** phải giữ đồng bộ hai chiều giữa URL và ô khi Back/Forward, Xóa lọc, đổi nhà máy.
- **Ô ngày ghi khi rời ô (C4):** đổi cách nhập nên cần anh/chị đồng ý (mục 7).
- **Không thêm thư viện, không đổi kiến trúc:** không cần ADR mới.

## 5. Cách đo trước và sau

1. **Phép đo bằng dữ liệu giả** (`<Profiler>` trong vitest): số liệu chỉ để so trước và sau trên cùng máy, không phải thời gian thật trên trình duyệt.
2. **Chrome Performance, CPU chậm 4×**, ba thao tác:
   - gõ 10 ký tự ở ô lọc Mã hàng của Xếp chuyền;
   - gõ một ngày ở lưới nhập TH của Kế hoạch chuẩn bị SX;
   - tích 10 ô ở Phân quyền.

   Ghi thời gian xử lý tương tác (INP) và số task dài. Anh/chị đăng nhập sẵn trên Chrome thì tôi chạy đo bằng script chỉ lấy số thời gian, không đọc dữ liệu trên màn.
3. **Kích thước gói:** chạy `vite build` và so với bảng ở mục 2.

## 6. Không làm trong đợt này (ghi nhận)

- **Không ảo hóa DataGrid:** lưới đã phân trang 100 dòng; memo theo dòng là đủ.
- **Không bật React Compiler:** đổi chuỗi build (`@vitejs/plugin-react` 6 trên Rolldown) nên cần ADR riêng, và không thay được việc đặt state đúng chỗ. Có thể cân nhắc sau khi xong đợt 3.
- **Việc cần đổi backend:**
  - `GET` kế hoạch xuất hàng trả kèm dữ liệu nháp (A7);
  - một endpoint khởi động gộp `/me`, menu, quyền, chính sách cột;
  - lưu Chính sách cột theo lô (`FieldPoliciesPage.tsx:79-86` đang lưu tuần tự từng vai trò; backend vẫn xếp hàng ở `SysPermissionVersion`).

## 7. Cần anh/chị quyết

1. **Xếp việc này vào đâu.** Đề xuất mở phase con mới "5.7 Tối ưu hiệu năng frontend", làm sau khi các phase 5.1–5.6 được duyệt: các sửa đổi chạm vào file của 5.3, 5.4, 5.5, 5.6, sửa giữa lúc đang duyệt sẽ khó đối chiếu.
2. **Bản đầy đủ** (6,5–8 ngày) hay **bản tối thiểu** (3–3,5 ngày).
3. **Ô ngày của lưới nhập ghi khi Enter hoặc rời ô** thay vì ghi theo từng phím (C4): đồng ý không?
4. **Cách đo trên Chrome:** anh/chị đăng nhập sẵn để tôi đo (chỉ lấy số), hay chỉ dùng phép đo bằng dữ liệu giả.

## 8. Kết quả thực hiện (phase 5.7)

Người dùng bảo "thực hiện tối ưu theo kế hoạch". Bốn điểm ở mục 7 được hiểu như sau (`docs/phases/phase-5-7-hieu-nang-frontend.md`):
- làm ngay, thành phase 5.7;
- làm bản đầy đủ trừ G4;
- ô ngày ghi khi rời ô;
- chỉ đo bằng dữ liệu giả.

### 8.1 Số đo trước và sau

**Cách đo:**
- Lệnh `npm run perf -w frontend` (`src/perf/*.perf.tsx`), dữ liệu giả, React bản phát triển trong jsdom.
- Số là thời gian React vẽ cho một thao tác, lấy trung vị.
- Code gốc và code sau khi sửa đo xen kẽ hai lượt trên cùng máy, cùng lúc. Code gốc chạy trong một git worktree tạm, đã xóa sau khi đo.
- Máy lúc đo chậm hơn lúc lấy số nền ở mục 2: bộ test của code gốc mất 24,6 giây, so với 18,4 giây lúc đầu phiên. Vì vậy chỉ so hai cột trong bảng với nhau, không so với số ở mục 2.

| Thao tác | Code gốc (ms) | Sau tối ưu (ms) |
|---|---|---|
| Thông tin đơn hàng: mỗi phím gõ ô Mã hàng | 131 / 106 | 0,9 / 1,0 |
| Thông tin đơn hàng: bấm chọn dòng | 134 / 119 | 24 / 34 |
| Kế hoạch chuẩn bị SX: mỗi phím gõ ô Mã hàng | 71 / 67 | 0,7 / 1,2 |
| Kế hoạch chuẩn bị SX: bấm chọn dòng | 143 / 104 | 29 / 49 |
| Chính sách cột (30 cột × 10 vai trò): đổi một ô | 916 / 914 | 47 / 49 |
| Phân quyền (50 màn × 5 hành động): tích một ô | 171 / 178 | 27 / 27 |
| Người dùng (100 dòng): mỗi phím gõ ô tìm | 829 / 827 | 0,9 / 1,0 |
| Lưới 100 dòng × 18 cột: bấm chọn dòng | 52 / 39 | 4,6 / 6,6 |
| Lưới 100 dòng × 18 cột: trang render lại vì việc khác | 14 / 12 | 3,3 / 5,5 |
| Lưới 100 dòng × 41 cột, 32 ô Che mỗi dòng: dựng lưới | 1.707 / 1.621 | 579 / 847 |
| Lưới 100 dòng × 41 cột, 32 ô Che mỗi dòng: bấm chọn dòng | 646 / 531 | 21 / 27 |
| Popup lọc theo cột 500 giá trị: tích một giá trị | 90 / 166 | 15 / 15 |

- **Bấm chọn dòng:** phần còn lại (24–49 ms) là dải lọc, nút thao tác và tiêu đề lưới vẽ lại. Riêng các dòng chỉ còn 2 dòng vẽ lại (test `render-cost.test.tsx`).
- **Bản build thật:** React production nhanh hơn bản phát triển vài lần, nên thời gian thật trên trình duyệt thấp hơn các số trên.

**Gói tải** (`vite build`):

| Phần | Trước | Sau |
|---|---|---|
| JS tải lần đầu | 668 kB, 207 kB gzip, 2 file | 671 kB, 208 kB gzip, 5 file |
| JS phải tải lại khi chỉ sửa khung, màn hình | 148 kB gzip (`index`) | 70 kB gzip (`index`). `vendor-react` 81 kB và `vendor-query` 10 kB giữ nguyên tên file. Gói `api` (46 kB, phần Mantine dùng chung cùng `lib/api.ts`) chỉ đổi khi sửa `lib/api.ts`, store |
| CSS | 1 file 352 kB, 64 kB gzip | Không đổi (1 file) |

Đã kiểm: sửa một chữ trong `AppLayout` rồi build lại, chỉ file `index-*.js` đổi tên.

Hai cách đã thử rồi bỏ:
- **Gom cả JS của Mantine vào một gói riêng:** các thành phần chỉ màn khác dùng bị kéo vào gói đầu, lần tải đầu tăng khoảng 37 kB gzip.
- **Tách CSS của Mantine ra file riêng:** file này nạp sau CSS ứng dụng nên các ghi đè trong `global.css` (cỡ nút, ô nhập, chữ) mất tác dụng ở bản build. Lỗi do review lượt 1 phát hiện; đã bỏ trước khi kết thúc phase.

### 8.2 Trạng thái từng mục

| Mục | Kết quả |
|---|---|
| L1, L2, L3 | Đã sửa, mỗi lỗi có test. Đã kiểm test hỏng khi trả code về như cũ (L2, L3) |
| C1 | `GridRow` memo; DataGrid đọc hàm của trang qua ref; nút lọc trên tiêu đề memo, dùng hàm ổn định theo cột |
| C2 | `Masked` dùng `title` |
| C3 | `DebouncedTextInput`, `DebouncedAutocomplete`. `useUrlFilter` giữ bộ lọc ở state (đọc từ URL lúc mở màn), mỗi lần đổi ghi URL cùng lúc về trang 1; ô chọn và ô ngày ghi ngay (sửa luôn A4). Áp cho 5 màn Đơn hàng, popup Chọn mã hàng, bộ lọc bảng dàn chuyền, Kế hoạch chuẩn bị SX, Người dùng, Nhật ký, các khung của Danh mục |
| C4 | Đã làm. Kiểm trên Chrome thật bằng trang tạm, dữ liệu giả, đã xóa sau khi kiểm: gõ dở không ghi; bấm Lưu khi ô đang sửa vẫn lấy giá trị mới; Esc bỏ phần đang gõ; ô số vẫn ghi theo phím |
| C5, C6 | Đã làm (`withBranchNames`) |
| C7 | Đã làm: dòng giá trị memo, popup 500 giá trị từ 90–166 ms xuống 15 ms |
| M1–M5, M7–M13 | Đã làm |
| M6 | `LineBoard` memo, từng hàng chuyền memo, `bars` chỉ tính lại khi trường làm đổi thanh đổi. Không gộp thành một Popover chung: phải dựng lại nút của thanh khi mở, mất focus bàn phím; memo theo hàng đã đủ |
| A1 | `useAfterClose`: popup đóng hẳn rồi mới làm mới, chỉ truy vấn đang hiện trên trang tải lại. Gợi ý của ô lọc chuyển sang khóa riêng `ORDER_OPTIONS_KEY`. Kế hoạch chuẩn bị SX chỉ chờ khóa danh sách |
| A2, A3, A4, A5 | Đã làm |
| A6 | Chỉ thêm `limit` cho ô gợi ý Khách hàng. Không thêm cho ô chọn quyền, ô chọn chuyền ở Quản trị: các ô này người dùng cuộn theo nhóm để chọn, giới hạn sẽ giấu lựa chọn |
| A7 | Danh mục: tải cây chuyền song song với tổng quan. Phân quyền: tải quyền theo vai trò trên URL song song với danh sách vai trò. Phân quyền chi tiết: danh mục nhà máy, chuyền tải khi sửa phạm vi (tải trước khi rê chuột vào nút). Kế hoạch xuất hàng cần đổi backend nên chưa làm |
| A8 | Không làm. Máy chủ không hủy câu SQL khi trình duyệt ngắt request nên lợi ích thấp |
| G1 | Tách `vendor-react`, `vendor-query` (chỉ TanStack Query và zustand). CSS giữ một file |
| G2 | `preloadPage`: tải code của màn theo URL lúc mở trang, song song với khôi phục phiên; tải trước khi rê chuột hoặc Tab tới liên kết menu, thẻ ở Trang chủ |
| G3 | `levelColor` chuyển sang `admin/common.tsx` |
| G4 | Không làm, như kế hoạch |

### 8.3 Đổi hành vi nhìn thấy

1. Ô ngày của lưới nhập ghi khi Enter, Tab hoặc rời ô; Esc là bỏ (C4). Đang gõ dở thì lưới vẫn tính là chưa lưu: tải lại trang, đóng tab hay rời màn đều được hỏi lại.
2. Kế hoạch chuẩn bị SX: khi cột các bước bị Che, lưới có một cột "Các bước chuẩn bị" với `***` thay cho hai cột mỗi bước (M5).
3. Nút "Xóa lọc" hiện sau khi ngừng gõ 300 ms, không hiện ngay từ phím đầu.
4. Ô Che rê chuột hiện lý do bằng chú thích của trình duyệt (`title`) thay cho Tooltip của Mantine.
5. Người dùng, Nhật ký hệ thống, Kế hoạch chuẩn bị SX: URL giữ nguyên chữ đã gõ ở ô tìm (kể cả khoảng trắng cuối), truy vấn cắt khoảng trắng.

### 8.4 Giới hạn đã biết

- **Màn Đơn hàng:** bộ lọc chỉ đọc URL lúc mở màn, như trước phase. Bấm lại đúng mục menu đang mở (URL mất bộ lọc) hoặc Back, Forward giữa các lần lọc thì ô lọc và danh sách không theo URL. Ghi URL kiểu replace nên hiếm gặp.
- **Lưu xong gỡ khung sửa (có từ trước phase):** khung sửa màu cỡ ở Cập nhật tỷ lệ cắt gỡ ngay khi lưu xong, phần gõ thêm trong lúc chờ lưu mất.
- **Cấu hình chuẩn bị SX:** đang giữ nháp vì có gõ thêm trong lúc lưu thì bước mới người khác vừa thêm chưa hiện, tới khi lưu hoặc hoàn tác.

