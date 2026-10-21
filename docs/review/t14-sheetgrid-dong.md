# Review task T14 – `SheetGrid` dùng bản động `DynamicDataSheetGrid`

Phạm vi: `frontend/src/components/SheetGrid.tsx` (đổi lưới sang bản động, `handleActive` bỏ qua khi lưới báo lại cùng ô), comment ở `ColorSizePage.tsx`, `CuttingProgressPage.tsx`, `CuttingSupplyPage.tsx`, `SewingPlanPage.tsx`; test mới `frontend/src/test/sheet-grid-props.test.tsx`; tài liệu 10 mục 9.3, STATUS. Kế hoạch cũ: `git show 98d19db:docs/phases/sheetgrid-ban-dong.md`.

Lệch gốc: `react-datasheet-grid` 4.x xuất `DataSheetGrid` là bản tĩnh, chỉ đọc `columns`, `rowClassName`, `gutterColumn`, `createRow`, `onActiveCellChange`… ở lần vẽ đầu. Chạy thử trên Chrome (bộ `MES_*_T514`, tài khoản thử tạm đã vô hiệu sau khi xong), bản tĩnh có lỗi thật ở 3 màn: Kế hoạch chuẩn bị SX không vạch dòng đang chọn; Nhập nhân viên từ Excel bấm Kiểm tra mà ô lỗi không đỏ; Cập nhật tỷ lệ cắt có câu báo dòng trùng mà ô không đỏ. Với bản động cả ba hết; các màn khác không đổi hành vi (gõ ngày TH, số cắt, Phân màu cỡ, ô Chuyền, Kế hoạch may, Cấu hình chuẩn bị SX, Xác nhận cấp BTP), không lỗi console; gõ số lượng ở Cập nhật tỷ lệ cắt không bị ngắt khi cột dựng lại giữa chừng.

## Lượt 1 – bản sửa

Kết luận agent: APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 2 MEDIUM, 5 LOW). Agent đọc mã thư viện: bản tĩnh giữ cố định 14 prop; bản động khi cột đổi thì xử lý lại cột, gắn lại 8 trình nghe trên trang, gọi lại `onActiveCellChange` với cùng ô; không có vòng lặp vẽ; đổi dòng chọn ở Kế hoạch chuẩn bị SX vẽ 2 lần thay 1; không màn nào dựng `columns` mỗi lần vẽ.
Phiên chính đã kiểm chứng: đúng cả 7 phát hiện.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| M1 | MEDIUM | `frontend/src/test`, STATUS | Không test nào bắt được nếu đổi ngược về bản tĩnh; chưa đo số lần vẽ | Thêm `sheet-grid-props.test.tsx` (3 bài): hỏng 3/3 khi đổi về bản tĩnh. Đo số lần vẽ: ghi NEEDS VERIFICATION ở STATUS (chưa có công cụ đo lưới nhập) | Đóng một phần |
| M2 | MEDIUM | 10 mục 9.3, comment `SheetGrid.tsx`, `ColorSizePage.tsx` | Lý do "để không vẽ lại cả lưới mỗi phím" chưa đúng (lưới vốn vẽ lại mọi ô mỗi lần `value` đổi); xếp `createRow` sai nhóm | Viết lại theo prop: nhóm làm thư viện xử lý lại (`columns`, `selectedKey`, `indexOffset`, có hay không `rowLabel`), nhóm đọc qua ref; nêu `onActiveRowChange` có thể được gọi lại | Đóng |
| L1 | LOW | `SheetGrid.tsx` (`handleActive`) | Lưới báo lại cùng ô khi cột đổi làm tắt cờ đang gõ dở (chặn rời màn mất tác dụng) | Chỉ xử lý khi ô thật sự đổi; test chứng minh (hỏng khi bỏ phần chặn lặp) | Đóng |
| L2 | LOW | STATUS | Chưa ghi STT trang 2 ở Kế hoạch chuẩn bị SX, ô Chuyền khi danh sách chuyền tải sau | Ghi vào dòng T14 (theo mã, chưa thử trên trình duyệt: bộ test chỉ 18 dòng); STT theo `indexOffset` có test | Đóng |
| L3 | LOW | STATUS | Ghi "Xong" trước khi có file review | Tạo file này, commit cùng task | Đóng |
| L4 | LOW | STATUS mục 8.1 | Ghi mã hàng lấy từ bộ database test | Bỏ mã, ghi "một kế hoạch đã xếp chuyền ở bộ test" | Đóng |
| L5 | LOW | `CuttingProgressPage.tsx` | Comment "dữ liệu đổi" chưa rõ | Viết lại lý do (hàm `editable` dựng lại mỗi lần vẽ) | Đóng |

Không làm task 3 của kế hoạch cũ (bỏ các ref ở màn): các ref giữ cột không xử lý lại mỗi phím gõ, vẫn cần với bản động.

Sau khi sửa (21/10/2026): frontend `tsc --noEmit`, eslint, `vite build` qua; vitest 37 file, 298/298. Thử lại trên Chrome sau khi đổi `handleActive`: vạch dòng chọn ở Kế hoạch chuẩn bị SX đúng. Lỗi có sẵn thấy khi thử: mở popup Chi tiết dàn chuyền là nút Lưu bật sẵn, có ở cả bản tĩnh, ghi STATUS mục 8.1.
