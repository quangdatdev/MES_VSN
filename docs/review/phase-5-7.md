# Review Phase 5.7 – 11/10/2026

**Phạm vi:** toàn bộ thay đổi frontend của phase 5.7 (`git diff` so với commit `bk1`).
- 33 file sửa.
- 9 file mới: `components/DebouncedInput.tsx`, `lib/afterClose.ts`, `lib/useStable.ts`, `lib/queryKeys.ts`, `src/perf/*`, `vitest.perf.config.ts` và các test mới.

Kế hoạch và mã phát hiện (L, C, M, A, G): `docs/review/hieu-nang-frontend.md`.

## Lượt 1

**Kết luận agent:** BLOCK (2 HIGH, 2 MEDIUM, 7 LOW).

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| 1 | HIGH | `frontend/vite.config.ts` | Nhóm `vendor-mantine-css` làm CSS Mantine nạp sau CSS ứng dụng ở bản build. Các ghi đè của `global.css` (cỡ nút, ô nhập, chữ badge, nền body) mất tác dụng | Bỏ nhóm CSS. Kiểm bản build: còn một file CSS, `.mantine-Button-root` của ứng dụng nằm sau `.m_77c9d27d` của Mantine | Đóng |
| 2 | HIGH | `components/DebouncedInput.tsx` | Giá trị vừa đẩy quay về chậm (React Router đổi URL trong `startTransition`) hoặc đã bị cắt khoảng trắng thì bị coi là "đổi từ ngoài", ghi đè chữ đang gõ (mất dấu cách, mất phím) | Ô giữ hàng đợi các chữ đã đẩy; giá trị quay về khớp hàng đợi thì giữ chữ đang gõ; ref gán sau khi vẽ. Bộ lọc Đơn hàng giữ ở state (ô nhận giá trị ngay). Người dùng, Nhật ký ghi nguyên chữ lên URL, cắt khoảng trắng lúc dựng truy vấn. Test: giá trị quay về chậm, dấu cách cuối | Đóng |
| 3 | MEDIUM | `order/common.tsx` | Rời ô (ghi URL) rồi bấm Xóa lọc trong cùng nhịp chuyển tiếp: ô vẫn hiện chữ cũ trong khi đã bỏ lọc | Bộ lọc Đơn hàng ở state nên hai thao tác là hai lần cập nhật riêng. Người dùng, Nhật ký: Xóa tìm kiếm, Xóa bộ lọc dựng lại ô (key) | Đóng |
| 4 | MEDIUM | `components/SheetGrid.tsx` | Ô ngày ghi khi rời ô: gõ dở rồi tải lại trang, đóng tab, rời màn bằng phím tắt thì mất mà không được hỏi | Lưới tự giữ cờ "đang gõ dở" (sự kiện gõ trong khung lưới), gắn `useLeaveGuard`; hết khi ô ghi, chuyển ô hoặc Esc. Test `sheet-typing.test.tsx`. Phần "Esc đóng popup": không phải lỗi, các popup có lưới nhập sửa được đã đặt `closeOnEscape` false | Đóng |
| 5 | LOW | `vite.config.ts` | `vendor-query` kéo cả `@tanstack/react-virtual` (của lưới nhập) vào gói đầu | Mẫu chỉ còn `@tanstack/react-query`, `query-core`, `zustand`; react-virtual nằm trong gói SheetGrid | Đóng |
| 6 | LOW | `admin/PermissionsPage.tsx` | Lưu xong bỏ cả các ô tích thêm trong lúc chờ lưu | Chỉ bỏ bản nháp khi vẫn đúng bản lúc bấm Lưu | Đóng |
| 7 | LOW | CutRatioPage (khung sửa màu cỡ), PrepStepsPane | Lưu xong gỡ khung sửa (có từ trước phase); PrepStepsPane giữ nháp thì bước mới của người khác chưa hiện tới khi lưu hoặc hủy | Ghi nhận, không sửa trong phase này | Hoãn |
| 8 | LOW | `DataGrid.tsx`, `lib/useStable.ts` | Ghi ref trong lúc vẽ; lượt vẽ chuyển tiếp bỏ dở có thể để lại giá trị | `DebouncedInput` đã chuyển sang gán sau khi vẽ. DataGrid và `useStableByKey`: lượt vẽ bỏ dở chỉ làm gọi hàm mới hơn hoặc mất memo một lần, không sai dữ liệu. Không sửa | Bỏ |
| 9 | LOW | `admin/CatalogsPage.tsx` | Viết tay khóa `['order-options']` trùng `ORDER_OPTIONS_KEY` | Khóa chuyển sang `lib/queryKeys.ts`, hai nơi dùng chung | Đóng |
| 10 | LOW | Test | Thiếu test: ô lọc (dấu cách, giá trị quay về), `withEdits` trả `prev`, khung sửa báo "đã đổi" | Thêm vào `render-cost.test.tsx`, `sewing.test.tsx`, `cut-ratio-edit.test.tsx`. `onGridChange` chỉ dòng đổi: jsdom không vẽ ô của lưới nhập nên chưa có test | Đóng một phần |
| 11 | LOW | `test/setup.ts`, `vite.config.ts` | Nâng thời gian chờ của test có thể che chậm thật | Giữ: code gốc trong worktree tạm cũng hỏng đúng các test đó khi chạy song song. Lý do ghi ở mục Phát sinh của file phase | Bỏ |
| 12 | LOW | Tài liệu | File phase, file kế hoạch, quy tắc UI/UX chưa cập nhật lúc review | Đã cập nhật | Đóng |

**Phần agent kiểm và xác nhận không phải lỗi:**
- Không màn nào hiện giá trị cũ sau khi memo dòng.
- Các comparator không bỏ sót prop.
- CutRatioPage gọi PO theo id trên URL vẫn đi qua lọc nhà máy, phạm vi của máy chủ.
- Cột bước bị Che gộp một cột đúng.
- Các khóa làm mới dữ liệu đủ.

**Lint/test sau khi sửa:**
- `eslint` qua, `npm run build -w frontend` qua.
- Frontend: 20 tệp test, 114 test qua.

## Lượt 2

**Kết luận agent:** APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 0 MEDIUM, 6 LOW). Agent kiểm lại và xác nhận các chỗ sửa của lượt 1 đúng:
- thứ tự CSS ở bản build;
- các luồng của ô lọc (đẩy nhiều lần, giá trị quay về, đổi từ ngoài, Enter, rời ô, Autocomplete);
- Xóa lọc;
- cờ "đang gõ dở";
- `closeOnEscape` của 5 popup có lưới nhập.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| 1 | LOW | `components/DebouncedInput.tsx` | Đẩy "ABC" rồi xóa hết trước khi "ABC" kịp quay về: ô rỗng nhưng vẫn lọc "ABC" (chỉ ô đọc thẳng URL) | So với chữ đẩy gần nhất còn chờ quay về. Thêm test | Đóng |
| 2 | LOW | `components/SheetGrid.tsx` | Chữ tìm của ô chọn (chuyền, trạng thái) bật cờ "đang gõ dở", có đường thôi sửa không tắt cờ: hỏi lại sai khi F5 hay rời màn | Chỉ tính ô nhập của thư viện (`input.dsg-input`). Test có ca chữ tìm của ô chọn | Đóng |
| 3 | LOW | `admin/PermissionsPage.tsx` (và `FieldPoliciesPage.tsx` cùng kiểu) | Ref đọc trong hàm cập nhật bản nháp gán giữa lúc vẽ; đổi vai trò đi qua startTransition có thể làm ô vừa tích rơi vào vai trò mới | Gán trong `useLayoutEffect` ở cả hai màn | Đóng |
| 4 | LOW | `sewing/PrepPlanPage.tsx` | Ô Mã hàng không cắt khoảng trắng khi dựng truy vấn (có từ trước) | `filter.style.trim()` | Đóng |
| 5 | LOW | `order/common.tsx` | Bộ lọc Đơn hàng chỉ đọc URL lúc mở màn, không theo Back/Forward (như trước phase) | Ghi vào giới hạn đã biết (`hieu-nang-frontend.md` mục 8.4) | Hoãn |
| 6 | LOW | Tài liệu | Mô tả `useUrlFilter` sai, đánh số mục 8.3, thiếu quy tắc "bên nhận lưu nguyên chữ" | Đã sửa; thêm quy tắc vào `quy-tac-ui-ux.md` mục J | Đóng |

**Lint/test sau khi sửa:**
- `eslint` qua, `npm run build -w frontend` qua.
- Frontend: 20 tệp test, 115 test qua.
- Backend không đổi nên không chạy.
