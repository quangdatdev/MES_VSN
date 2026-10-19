# ADR 0008 – Lưới nhập liệu kiểu bảng tính

**Trạng thái:** Accepted (người dùng cho phép dùng thư viện ngoài, 10/10/2026; duyệt cùng Phase 5.3) · **Ngày:** 10/10/2026

## Bối cảnh
Các lưới nhập liệu dạng bảng trước đây đặt một ô nhập Mantine riêng cho mỗi ô. Có 5 lưới như vậy:
- màu cỡ khi sửa tỷ lệ cắt và khi thêm PO;
- số lượng kế hoạch xuất hàng;
- số lượng giao khi phân màu cỡ;
- dàn chuyền.

Cách cũ không chọn được vùng ô, không dán được nhiều ô từ Excel, và phải bấm vào từng ô. Người dùng yêu cầu nhập liệu thân thiện, copy và dán dễ, cho phép dùng thư viện ngoài nhưng phải giữ giao diện hiện tại. ADR 0003 quy định thư viện lớn phải được ghi lại.

## Quyết định
Dùng **`react-datasheet-grid` 4.11.6** (MIT) cho lưới nhập. Thư viện được bọc trong thành phần dùng chung `frontend/src/components/SheetGrid.tsx`. Lưới chỉ xem vẫn dùng `DataGrid`.

**SheetGrid cung cấp**
- Chọn vùng bằng chuột hoặc Shift + mũi tên.
- Ctrl+C, Ctrl+V qua lại với Excel, kéo góc vùng chọn để điền xuống.
- Menu chuột phải tiếng Việt để chèn, nhân bản, xóa dòng.
- Dán quá cuối lưới thì tự thêm dòng; lưới có số dòng cố định thì bỏ phần thừa.

**Cột dựng sẵn**
- Số nguyên đọc "1.234", "1,234", "1 234", "1.234,00"; chép ra số trơn.
- Ngày hiện và gõ dd/mm/yyyy, nhận cả yyyy-mm-dd và dd/mm.
- Chữ.
- Chọn từ danh sách: gõ để lọc, Enter chọn; dán theo mã hoặc tên.
- Chỉ xem hoặc tự tính.

**Giao diện, phân quyền**
- Ô bắt buộc tô vàng, ô chỉ đọc tô xám, ô sai tô đỏ, theo quy ước BA.
- Màu, chữ, viền lấy từ biến theme của `global.css`, có dark mode.
- Ô bị khóa theo dòng (ngoài phạm vi sửa, dòng đang may) không nhận dán hoặc xóa. Dòng không được xóa thì nút xóa mờ, xóa bằng menu bị chặn.
- Màn chỉ xem hoặc cột bị Che vẫn dùng `DataGrid` để giữ cách hiện `***`. Máy chủ vẫn kiểm mọi giá trị như trước.

## Phương án đã cân nhắc
| Phương án | Lý do không chọn |
|---|---|
| AG Grid Community | Chọn vùng và dán từ clipboard thuộc bản Enterprise (trả phí) |
| Handsontable | Giấy phép không miễn phí cho dùng thương mại |
| Glide Data Grid | Vẽ bằng canvas, khó theo theme Mantine; khai báo hỗ trợ tới React 18 |
| Tự viết trên `DataGrid` | Nhiều việc (chọn vùng, bàn phím, dán, kéo điền) và dễ lỗi hơn thư viện đã dùng rộng rãi |

## Hệ quả và lưu ý kỹ thuật
- **Gói phụ `react-resize-detector@7`** khai báo hỗ trợ tới React 18, nên npm cài kèm một bản `react-dom` 18 riêng và màn hình lỗi. `package.json` gốc có `overrides` buộc gói này dùng `react`/`react-dom` `^19.0.0`, tức dùng chung bản của dự án. Nâng React thì chạy `npm ls react react-dom` và kiểm chỉ còn một bản. Gói này còn import `findDOMNode`, React 19 đã bỏ. Hàm đó chỉ nằm trong nhánh thành phần lớp mà thư viện lưới không dùng; bản build production đã kiểm.
- **Thanh cuộn ngang gốc** làm phép đo chiều cao của thư viện lệch một nhịp khi lưới ít dòng (cao theo nội dung): lưới co giãn liên tục, rõ nhất ở màn hình phóng to 125%. Vì vậy:
  - ẩn thanh cuộn ngang gốc, dùng thanh cuộn riêng đồng bộ với lưới;
  - viền khung vẽ bằng `outline`, không dùng `border`;
  - lưới đặt tuyệt đối trong khung để chiều cao lưới không đẩy ngược chiều cao khung.
  Firefox không ẩn riêng được thanh cuộn ngang, nên ẩn cả hai (`scrollbar-width: none`): cuộn ngang bằng thanh riêng, cuộn dọc bằng bánh xe chuột hoặc phím. Chấp nhận tạm với giả định máy ở nhà máy dùng Chrome hoặc Edge; cần xác nhận lại.
- **Menu chuột phải** được đưa ra `document.body`. Khung Modal có `transform`, nên menu định vị `fixed` theo con trỏ sẽ lệch nếu nằm trong Modal.
- **Phím Esc** trong lưới là thoát sửa ô hoặc bỏ vùng chọn. Popup có lưới nhập tắt "Esc để đóng" (`closeOnEscape`), đóng bằng nút Hủy hoặc dấu ×, để không mất phần đang nhập.
- **Phím Enter** trong ô của lưới không gửi form chứa lưới, ví dụ popup Thêm PO.
- **Khả năng truy cập:**
  - ô của thư viện không có nhãn riêng như ô nhập cũ, nên trình đọc màn hình đọc kém hơn;
  - điều hướng bàn phím đầy đủ: Tab vào lưới, dùng mũi tên, Enter để sửa, Esc để thoát;
  - vùng lưới có nhãn (`role="region"`).
- Lưới không có hoàn tác (Ctrl+Z). Hủy bằng nút Hủy của màn hình như trước.
- Nâng phiên bản `react-datasheet-grid` hoặc bỏ `overrides` phải kiểm lại hai lưu ý trên.
- Lưới nhập của các module sau (Cắt, May, QMS…) dùng `SheetGrid`, không tự dựng ô nhập riêng.
