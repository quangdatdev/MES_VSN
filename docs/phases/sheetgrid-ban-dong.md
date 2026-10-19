# SheetGrid dùng bản động của thư viện (chưa đặt số phase)

Trạng thái: **Chờ duyệt kế hoạch** (14/10/2026). Người dùng chọn làm phase riêng **sau 5.14** (câu R5 của [review 5.13](../review/phase-5-13.md)). Không làm song song với 5.14: cùng sửa `SheetGrid.tsx` và các màn có lưới nhập.

## Vấn đề

`react-datasheet-grid` 4.11 xuất `DataSheetGrid` là bản tĩnh (`StaticDataSheetGrid`). Bản tĩnh chỉ đọc `columns`, `createRow`, `duplicateRow`, `rowKey`, `rowClassName`, `addRowsComponent` ở lần vẽ đầu; prop đổi sau đó bị bỏ qua. Bản động là `DynamicDataSheetGrid`, đọc lại prop mỗi lần vẽ.

- **Đã thấy thật:** popup Phân màu cỡ (5.13), khi cột dựng lại theo lỗi thì ô đỏ và cột Còn lại không đổi. Màn này đã tránh bằng cách đọc qua `ref` (`checkRef`, `mergeRef`).
- **Mới suy ra từ mã, chưa chạy thử:**
  - Cập nhật tỷ lệ cắt (`useColorSizeSheet`, `CutRatioPage.tsx`) dựng lại cột khi tập ô lỗi đổi. Ô sai phát sinh sau lần vẽ đầu có thể không tô đỏ; khung cảnh báo vẫn đúng.
  - Chi tiết dàn chuyền (`LinePlanPage.tsx`) mở khi danh sách chuyền chưa tải xong: ô Chuyền có thể không có lựa chọn tới khi mở lại.
  - Vạch dòng đang chọn (`selectedKey`, `rowClassName`) không đổi theo dòng chọn.

## Phạm vi

Các màn dùng `SheetGrid`: Cập nhật tỷ lệ cắt (`CutRatioPage.tsx`), Chi tiết dàn chuyền (`LinePlanPage.tsx`), Kế hoạch xuất hàng (`ShipmentPage.tsx`), Phân bổ màu cỡ (`ColorSizePage.tsx`), Kế hoạch chuẩn bị SX (`PrepPlanPage.tsx`), bước chuẩn bị (`PrepStepsPane.tsx`), nhập nhân viên (`EmployeeImportModal.tsx`), cùng màn Đồng bộ tiến độ cắt của 5.14 nếu dùng `SheetGrid`.

## Task

| Task | Nội dung | Tiêu chí xong |
|---|---|---|
| 1 | Chạy thử từng màn trên Chrome với bộ database test riêng, ghi màn nào lỗi thật, lỗi gì | Bảng kết quả theo màn: lỗi thấy được hay không |
| 2 | `SheetGrid` dùng `DynamicDataSheetGrid`. Giữ `useMemo` cho `columns` và các hàm truyền vào, để lưới không dựng lại cột mỗi lần gõ | Lint, test qua; đo số lần vẽ khi gõ không tệ hơn bản tĩnh (`render-cost.test.tsx`, React Profiler) |
| 3 | Bỏ các cách tránh không còn cần (`ref` đọc lỗi ở Phân màu cỡ, cột dựng theo `sig` ở Tỷ lệ cắt) hoặc giữ nếu đo thấy chậm | Các lỗi ở task 1 hết khi chạy thử lại |
| 4 | Tài liệu `10-giao-dien.md` mục 9.3 (bỏ đoạn "Cột chỉ đọc ở lần vẽ đầu"), `02-trang-thai.md` mục lỗi tiềm ẩn; review `code-reviewer` | Không còn CRITICAL, HIGH |

## Rủi ro

- Bản động vẽ lại khi `columns` đổi tham chiếu. Màn nào dựng cột ngay trong lúc render (không `useMemo`) thì chậm khi gõ. Task 2 phải soát mọi chỗ truyền `columns`.
- `SheetGrid` mới thêm `addAtActive`, `keepAnchor` (5.13) dựa vào ref `latest`. Bản động không đổi cách này, nhưng cần chạy thử lại nút Thêm ở Phân màu cỡ.
