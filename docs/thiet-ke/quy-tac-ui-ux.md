# Quy tắc UI/UX – MES Vietsun

Áp dụng khi dựng hoặc sửa màn hình. Mỗi màn mới đối chiếu danh sách này trước khi báo xong. Agent `code-reviewer` dùng danh sách này khi review phần giao diện.

Bộ quy tắc rút từ đợt rà soát toàn bộ giao diện ngày 10/10/2026 (`docs/review/phase-5-3.md`, mục 5.3.9). Design system (màu, chữ, bố cục) giữ theo ADR 0003: tài liệu này không đổi giao diện, chỉ quy định cách dùng cho đúng và đều.

## Dùng thành phần chung, không tự dựng lại

| Việc | Dùng | Ghi chú |
|---|---|---|
| Khung màn nghiệp vụ | `components/WorkPage` | Tiêu đề, nút, dải lọc, thân kéo kín đến chân trang; tự báo chế độ tổng hợp A00 |
| Lưới chỉ xem | `components/DataGrid` | Truyền `error` và `onRetry`; cột tên dài đặt `maxWidth`; cột mã `format: 'code'`. Kéo giãn cột có sẵn (ADR 0011) |
| Lọc theo giá trị của cột (mũi tên trên tiêu đề) | `filterKey` của cột + `usePagedList().grid` (màn Đơn hàng) hoặc `useColumnFilters` + `valuesLoader` (`lib/columnFilter.ts`) | Máy chủ khai báo `FilterSpec` và endpoint `/values` (ADR 0011). Dải lọc truyền `columns` để hiện "Lọc theo cột: …" và để Xóa lọc xóa luôn |
| Lưới nhập | `components/SheetGrid` | ADR 0008. Ô bắt buộc tự có dấu `*` ở tiêu đề |
| Ô chọn có nhóm (chuyền theo xưởng) | `components/TreeSelect`, lựa chọn từ `lineOptions` (`lib/lines.ts`) | Nhóm thu gọn được, mở sẵn nhóm của giá trị đang chọn; gõ không dấu tìm theo tên, mã, tên nhóm. Cột chọn của `SheetGrid` dùng sẵn |
| Chân bảng, phân trang | `components/Pager` | |
| Nút bị khóa | `components/ActionButton` với `blockedReason` | Không dùng `disabled` trơn khi người dùng cần biết lý do |
| Hộp xác nhận | `confirmAction` (`lib/confirm.tsx`) | Không dùng `window.confirm` hay `modals.openConfirmModal` trực tiếp |
| Bỏ thay đổi khi đóng, đổi dòng | `confirmDiscard(dirty, discard)` | Nút Hủy, dấu x, Esc của popup có nhập liệu. Esc trong hộp hỏi chỉ đóng hộp hỏi. Hai popup chồng nhau thì popup dưới tắt `closeOnEscape` khi popup trên đang mở |
| Rời màn khi chưa lưu | `useLeaveGuard(dirty)` (`lib/leaveGuard.ts`) | Menu, tab, đổi nhà máy, đăng xuất, F5 đều hỏi lại. Nút Back của trình duyệt chưa chặn được |
| Đổi nhà máy | `BranchSwitcher` (thanh trên cùng), `selectBranch` | Chọn ngay trong danh sách thả xuống, không sang trang khác. Đã hỏi lại phần chưa lưu thì màn đang mở dựng lại từ đầu theo nhà máy mới, URL bỏ bộ lọc của nhà máy cũ; nhà máy mới không có màn đó thì về Trang chủ. Tab khác đổi nhà máy thì màn không dựng lại (giữ phần đang nhập). `BRANCH_CHANGED` chỉ chặn request đầu tiên phát hiện việc đổi (lần làm mới phiên); sau đó phiên đã là nhà máy mới, nên màn có phần đang nhập gắn với dữ liệu của nhà máy (Id dòng, nháp trên lưới) phải tự xử lý khi `branch` đổi như Kế hoạch chuẩn bị SX: bỏ phần đó và báo bằng thông báo không tự đóng (`toastWarn(..., true)`). Request của màn cũ bị 401 trong lúc chính tab này đang đổi thì báo `BRANCH_SWITCHED`, không làm mới phiên |
| Popup lớn trên điện thoại | `fullScreen={useMobile()}` | |
| Bộ lọc, trang trên URL | `useUrlParams`, `pageOf`, `useClampPage` (`lib/useUrlParams.ts`) | Trang vượt trang cuối (link cũ) tự về trang cuối |
| Ngày, giờ, số | `fmtDate`, `fmtDateTime`, `fmtNum`, `fmtMoney` (`lib/format.ts`) | Không dùng `toLocaleString`: kiểu đó đặt giờ trước ngày |
| Thông báo | `toastOk`, `toastWarn`, `toastError` (`lib/notify.ts`) | |

## A. Nhất quán, phân cấp
1. Mỗi màn, popup, ngăn kéo có tối đa **một nút chính** (cam). Nút phụ `variant="default"`.
2. **Nút xóa** dùng `variant="default" color="red"`. Nút xác nhận trong hộp hỏi xóa màu đỏ.
3. **Chữ nút thống nhất:**
   - tạo mới: "Thêm <đối tượng>", ở cả nút mở popup lẫn nút gửi;
   - lưu khi sửa: "Lưu thay đổi";
   - đóng popup: "Hủy", hoặc "Đóng" khi chỉ xem;
   - giữ lại trong hộp hỏi xóa: "Giữ lại" (chữ "Hủy" ở đây dễ đọc thành "hủy dữ liệu").
4. **Footer popup:** Hủy bên trái nút chính, cả nhóm canh phải.
5. **Một khái niệm, một tên:**
   - cùng một trường thì viết cùng một kiểu ở mọi màn (ví dụ "PO/Buy date");
   - trạng thái: "Đang dùng / Ngừng dùng" cho danh mục, vai trò, nhà máy; "Hoạt động / Đã khóa / Khóa tạm" cho người dùng.
6. **Bộ lọc:** đặt ở dải lọc ngay dưới tiêu đề, cùng thứ tự giữa các màn (Ngày, Khách hàng, Mã hàng, …), có "Xóa lọc".

## B. Chữ
1. **Cỡ chữ:** tối thiểu 12px cho mọi chữ, kể cả badge, chú thích, chữ lỗi dưới ô. CSS chung đã nâng mặc định của Mantine.
2. **Số:** canh phải, `tabular-nums`, phân cách nghìn kiểu Việt Nam.
3. **Ngày:** `dd/mm/yyyy`. Thời điểm: `dd/mm/yyyy HH:mm`.
4. **Cách viết:**
   - viết hoa đầu câu, không VIẾT HOA cả nhãn;
   - không nối chuỗi "A · B · C";
   - không thêm "→" vào nút.
5. **Gọi tên theo người dùng hiểu:**
   - không lộ mã kỹ thuật (tên bảng, mã quyền `order.po:view`, lệnh `npm`); cần cho IT thì đưa vào tooltip;
   - thuật ngữ nghiệp vụ lấy theo tài liệu BA, không tự đổi.
6. **Đoạn văn:** dưới khoảng 80 ký tự mỗi dòng (`maw` cho Alert, đoạn giới thiệu).

## C. Màu, tương phản
1. **Tương phản:** chữ ≥ 4,5:1; viền ô nhập và vòng focus ≥ 3:1 ở **cả chế độ sáng lẫn tối**.
2. **Cam `#F39830` (màu logo):** chỉ làm nền hoặc vạch, không làm chữ trên nền trắng. Nút chính nền cam chữ đen.
3. **Trạng thái không chỉ bằng màu:** luôn có chữ hoặc icon. Ô đổi chưa lưu, ô sai, thanh Gantt cũng vậy.
4. **Màu trong code:** dùng biến (`--app-*`, `var(--mantine-color-<màu>-text)`). Màu hex cứng thì phải khai thêm giá trị cho chế độ tối.

## D. Form, nhập liệu
1. **Nhãn và ô bắt buộc:**
   - mọi ô có nhãn hiển thị, không chỉ placeholder;
   - ô bắt buộc có dấu `*` (`withAsterisk`);
   - ô nhập vàng là bắt buộc, xám là chỉ đọc, đỏ là sai (quy ước BA).
2. **Báo lỗi:**
   - lỗi hiện ngay dưới ô (hoặc tô đỏ ô lưới) và nói rõ cách sửa, ví dụ "Đen / M: còn lại 120, đang nhập 150";
   - kiểm khi rời ô (`validateInputOnBlur`), không đợi bấm Lưu.
3. **Nút Lưu:**
   - có `loading` để chống bấm hai lần;
   - khóa khi chưa đổi gì hoặc còn lỗi, và nói lý do (`ActionButton`).
4. **Không làm mất phần đang nhập:**
   - popup không đóng khi bấm nền (mặc định theme);
   - Hủy, dấu x, Esc, đổi dòng, chọn lại đều qua `confirmDiscard`;
   - rời màn qua `useLeaveGuard`.
5. **Giá trị điền sẵn:** không điền giá trị trông như người dùng đã nhập (màu "Đen", năng suất 400…). Chỉ điền giá trị suy ra từ dữ liệu (số lượng còn lại).
6. **Mã không đổi được sau khi tạo:** ô dùng `readOnly` + `field-readonly` + mô tả lý do, không dùng `disabled`.

## E. Phản hồi, trạng thái
Mỗi vùng dữ liệu có đủ 4 trạng thái:
1. **Đang tải:** Skeleton hoặc Loader, không hiện "0 dòng".
2. **Lỗi:** thông báo kèm nút "Thử lại".
3. **Rỗng:** phân biệt "không khớp bộ lọc" (kèm "Xóa lọc") với "chưa có gì" (gợi ý bước tiếp theo).
4. **Có dữ liệu:** đổi trang hoặc lọc thì giữ dữ liệu cũ (`keepPreviousData`) và hiện dấu hiệu đang tải. DataGrid tự làm.

Thêm:
- **Thông báo thành công** nêu đối tượng ("Đã xóa đơn hàng SO-…"). Thông báo lỗi giữ lâu hơn (10 giây).
- **Thao tác nguy hiểm** (xóa, khóa tài khoản, ngừng dùng, chép lại từ đầu) hỏi lại bằng `confirmAction`, nêu hậu quả.

## F. Điều hướng, bàn phím
1. **Tên tab trình duyệt:** AppLayout tự đặt theo màn ("Xếp chuyền – MES Vietsun").
2. **Trạng thái danh sách trên URL:** bộ lọc, trang, sắp xếp, tab lưu bằng `useSearchParams` với `{ replace: true }`, nên F5, Back và gửi link không mất ngữ cảnh.
3. **Bàn phím:**
   - mọi điều khiển tới được bằng bàn phím;
   - vòng focus nhìn rõ: xanh trên nền sáng, trắng trên nền xám than (thanh bên, thanh trên);
   - có lối tắt "Bỏ qua tới nội dung chính".
4. **Nút chỉ có icon:** có `aria-label` và Tooltip cùng chữ.
5. **Tên đọc của nút:** chứa chữ đang hiển thị (WCAG 2.5.3). Không đặt `aria-label` khác hẳn chữ trên nút.

## G. Bảng
1. **Tiêu đề cột** dính khi cuộn. Bảng mật độ cao dùng `.table-frame[data-fill]`.
2. **Sắp xếp và phân trang:** có chỉ báo sắp xếp; phân trang có tổng số dòng.
3. **Nội dung ô:**
   - chữ dài cắt gọn, rê chuột xem đủ;
   - ô trống ghi "–".
4. **Dòng đang chọn:**
   - nổi bật;
   - mất khi dòng không còn trong danh sách sau lọc hoặc đổi trang;
   - nút Sửa, Xóa lấy dữ liệu mới nhất của dòng, không dùng bản chụp cũ.
5. **Số dòng, thứ tự (ADR 0011):**
   - lưới xem dữ liệu tải 100 dòng đầu, mới tạo lên trước; xem thêm thì sang trang;
   - lưới nghiệp vụ có cột "Ngày tạo" (`format: 'datetime'`), sắp xếp và lọc được.
6. **Độ rộng cột:**
   - `DataGrid` cho kéo mép phải tiêu đề, bấm đúp để vừa nội dung, phím mũi tên trên tay kéo;
   - độ rộng lưu theo tên lưới (`label`, hoặc `widthKey` khi hai lưới cùng tên) trên trình duyệt đó; nút ở ô STT đặt lại.
7. **Lọc, tìm luôn chạy trong DB:**
   - ô lọc, ô tìm gửi tham số lên máy chủ, không lọc mảng đã tải về;
   - cột có giá trị lặp lại (mã, tên, trạng thái, ngày, số lượng) đặt `filterKey`, máy chủ khai báo cùng trường trong `FilterSpec`;
   - không đưa cột giá, cột nhạy cảm vào lọc theo cột;
   - cột tính trên trình duyệt hoặc theo ngày hôm nay (trạng thái chuẩn bị SX) thì lọc bằng ô ở dải lọc;
   - cột đang lọc có phễu tô màu và vạch dưới tiêu đề; dải lọc nhắc "Lọc theo cột: …".

## H. Điện thoại, chạm
1. **Bề rộng 360px:**
   - dùng được, không cuộn ngang cả trang; bảng cuộn ngang trong khung;
   - lưới CSS dùng `minmax(0, 1fr)`, không dùng `1fr` (nội dung rộng sẽ đẩy tràn).
2. **Vùng chạm:** ≥ 24×24px (ô tích, nút icon `size="md"`). Trên điện thoại, ô nhập và nút cao 40px (CSS chung).
3. **Popup lớn** toàn màn hình trên điện thoại.

## I. Ngữ nghĩa, truy cập
1. **Heading:** mỗi màn một `h1`, các mục con `h2`, `h3` theo thứ tự.
2. **Phần tử bấm được** là `button` hoặc `a`, không dùng `div` có `onClick`.
3. **Ô tích trong ma trận** có nhãn đọc được (vai trò, màn hình, hành động).
4. **Hiệu ứng** tôn trọng `prefers-reduced-motion` (theme và CSS chung đã bật).

## J. Hiệu năng cảm nhận
1. **Ô tìm kiếm, ô lọc chữ:**
   - dùng `DebouncedTextInput`, `DebouncedAutocomplete` (`components/DebouncedInput.tsx`): chữ đang gõ nằm trong ô, chờ ngừng gõ 300 ms, Enter hoặc rời ô thì lọc ngay;
   - không giữ chữ đang gõ ở state của cả màn: mỗi phím sẽ vẽ lại cả màn và lưới bên dưới (phase 5.7);
   - bên nhận lưu nguyên chữ ô đẩy ra, chỉ cắt khoảng trắng (hay viết hoa) lúc dựng truy vấn. Giá trị quay về ô khác chữ đã đẩy thì bị coi là "đổi từ ngoài" và ghi đè chữ đang gõ;
   - ô lọc nên đọc state của màn, không đọc thẳng URL: React Router đổi URL trong `startTransition` nên giá trị về chậm một nhịp.
2. **Khi tải:** không nháy trống, không nhảy bố cục.
3. **State đặt ở component nhỏ nhất cần nó:**
   - lưới đang sửa trong một khung của màn (ví dụ sửa màu cỡ ở Cập nhật tỷ lệ cắt) tách thành component con giữ các dòng;
   - trang chỉ nhận cờ "đã đổi" để hỏi lại khi rời.
4. **Prop truyền vào lưới phải ổn định:**
   - `columns` khai báo ở cấp module hoặc `useMemo`, kể cả mảng rỗng khi chưa có dữ liệu (dùng hằng, không `?? []` tại chỗ);
   - cột có `render` đọc dữ liệu ngoài dòng (tên chi nhánh, tên chuyền) thì đưa dữ liệu đó vào phụ thuộc của `columns`;
   - cột Chi nhánh dùng `withBranchNames(columns, branchName)`: một truy vấn cho cả trang, không mỗi ô một truy vấn;
   - `DataGrid` tự đọc `rowKey`, `onRowClick` qua ref nên viết tại chỗ được; hàm lấy giá trị lọc (`loadValues`) phải ổn định theo bộ lọc.
5. **Bảng, ma trận lớn tự dựng (không dùng `DataGrid`):**
   - tách dòng hoặc ô thành component `memo` nhận prop kiểu nguyên thủy;
   - hàm đổi ô ổn định (`useCallback` với hàm cập nhật state);
   - ví dụ: Chính sách cột, Phân quyền, Người dùng.
6. **Tooltip trong ô lặp nhiều lần** (ô bị Che, ô trạng thái): dùng `title`. Mỗi Tooltip của Mantine chạy bộ định vị ở mọi lần vẽ, kể cả khi đóng.
7. **Sau khi lưu trong popup:**
   - đóng popup rồi mới làm mới dữ liệu, dùng `useAfterClose` (`lib/afterClose.ts`);
   - làm mới đúng các khóa bị ảnh hưởng, không cả nhóm `['admin']`.
8. **Lưới nhập:** ô ngày ghi khi Enter, Tab hoặc rời ô (Esc là bỏ); ô số, ô chữ ghi theo từng phím.
9. **Đo trước và sau khi tối ưu:** chạy `npm run perf -w frontend`. Phép đo dùng dữ liệu giả, không nằm trong `npm test`.
