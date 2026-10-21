# Review task T10 – Gom mã lỗi lẻ vào `Errors`

Phạm vi: `backend/src/common/app.exception.ts` (`Errors.fieldNotReadable`, `Errors.lineScopeUpdateFailed`), `backend/src/platform/data/column-filter.ts`, `backend/src/modules/order/po-allocation.service.ts`, `backend/src/modules/cutting/cutting-progress.service.ts`, `backend/src/platform/permission/permission.service.ts`; `docs/CODE_CONVENTIONS.md` mục 5, STATUS. Quyết định: Q47 (gom mã lỗi lẻ vào `Errors`).

Lệch gốc: `FIELD_NOT_READABLE` (3 chỗ, cùng thông điệp) và `LINE_SCOPE_UPDATE_FAILED` (hằng riêng ở `permission.service.ts`) tạo bằng `new AppException` ngoài `Errors`. Bản sửa: thêm 2 hàm vào `Errors`, đổi 4 chỗ dùng, bỏ hằng không còn ai dùng. Hành vi API không đổi.

## Lượt 1 – bản sửa

Kết luận agent: APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 0 MEDIUM, 4 LOW). Agent so từng byte UTF-8 với `HEAD`: mã, HTTP, thông điệp, `details` của cả 2 mã giữ nguyên; hằng bỏ đi không chỗ nào import; ngoài `Errors` chỉ còn 4 mã đã có (`VALIDATION_FAILED`, `CONFLICT`, `NOT_FOUND`, `PERMISSION_DENIED`).
Phiên chính đã kiểm chứng: đúng cả 4 LOW.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| L1 | LOW | STATUS | Chưa chuyển T10 sang đã xong, chưa đóng nợ N9 | Đã cập nhật | Đóng |
| L2 | LOW | `CODE_CONVENTIONS.md` mục 5 | "Mã đã có" dễ hiểu là "đã có trong `Errors`"; chưa nói cách cưỡng chế | Ghi rõ "mã đã có trong bảng mã lỗi (04 mục 13)", "kiểm bằng review" | Đóng |
| L3 | LOW | `app.exception.ts` (`lineScopeUpdateFailed`) | JSDoc nêu dạng `details.department` mà lớp chung không ràng buộc | Comment ghi `details` do bên gọi truyền, giữ kiểu `unknown` (ranh giới nền tảng, module) | Đóng |
| L4 | LOW | `app.exception.ts` (`fieldNotReadable`) | Comment tả "khi nào" chứ chưa nói "vì sao" | Viết lại theo lý do (trả danh sách giá trị làm lộ nguyên giá trị) | Đóng |

Sau khi sửa (21/10/2026), bộ database test `MES_*_T514`:
- `npm run lint -w backend`, `npx tsc --noEmit -p backend/tsconfig.json`, `npm run build -w backend`: qua.
- `npx jest --runInBand test/column-filter.spec.ts test/hr.spec.ts test/po-allocation-service.spec.ts test/cutting.spec.ts test/phase5.spec.ts`: 119/119 qua (chạy trước lượt sửa comment, tài liệu).
