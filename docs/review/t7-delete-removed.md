# Review task T7 – Mọi `DELETE` trả 200 kèm `{ removed: true }`

Phạm vi: `backend/src/modules/order/order.controller.ts`, `backend/src/platform/admin/admin.controller.ts`, `backend/src/modules/cutting/cutting-progress.service.ts` (`removeEntries`), `backend/src/platform/catalog/catalog.service.ts` (`deleteWorkCalendarDays`); 9 file test backend, `frontend/src/test/catalog-work-calendar.test.tsx`; tài liệu `CODE_CONVENTIONS` mục 4.1, 05, 06, 15, STATUS. Quyết định: Q42 (mọi `DELETE` trả 200 kèm `{ removed: true }`), Q52, Q54 (2 route có số liệu màn đang dùng giữ số liệu cạnh `removed: true`).

Lệch gốc: 6 route `DELETE` trả 204 không body (`@HttpCode(204)`); `DELETE /cutting/progress/:id/entries` trả `{ removedDays, removedRows, planRemoved }`, `DELETE /admin/catalogs/work-calendars/:branchCode/days` trả `{ deleted }`, không có `removed`. Bản sửa: bỏ `@HttpCode(204)`, controller trả `{ removed: true }`; 2 route có số liệu trả thêm `removed: true`. Frontend không cần sửa: 6 chỗ gọi bỏ qua kết quả, 2 màn có số liệu vẫn đọc được trường cũ.

## Lượt 1 – bản sửa

Kết luận agent: APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 1 MEDIUM, 4 LOW). Agent kiểm: `backend/src` có đúng 9 route `@Delete`, cả 9 trả 200 kèm `removed: true`; `@HttpCode(204)` chỉ còn ở `POST /auth/logout`; 3 route Đơn hàng nay đi qua `FieldPolicyInterceptor` nhưng không có mã cột trùng tên trường trả về; không script nào gọi các route này.
Phiên chính đã kiểm chứng: đúng cả 5 phát hiện.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| M1 | MEDIUM | `06-don-hang.md` (đầu mục API) | Câu cũ "các `DELETE` của module hiện trả 204" mâu thuẫn với bảng và code | Thay bằng link quy ước | Đóng |
| L1 | LOW | `cutting.spec.ts`, `catalog.spec.ts` | Chưa có bài cho nhánh "không còn gì để xóa" vừa ghi thành quy ước | Thêm: Xóa số cắt lần hai trả `{ removed: true, removedDays: 0, removedRows: 0, planRemoved: false }`; xóa lại khoảng ngày đã trống trả `{ removed: true, deleted: 0 }` | Đóng |
| L2 | LOW | `CuttingProgressPage.tsx`, `WorkCalendarPane.tsx` | Kiểu `api<...>` chưa ghi `removed` | Không sửa: không chỗ nào đọc `removed`, giữ phạm vi T7 ở backend | Không sửa |
| L3 | LOW | `cutting-progress.service.ts` | Vẫn trả `removedRows` dù màn không đọc | Giữ để không bớt trường trong đợt chuẩn hóa; ghi ở STATUS để Tech Lead biết | Không sửa |
| L4 | LOW | `CODE_CONVENTIONS.md` mục 4.1 | Ví dụ nhánh trả số 0 chưa đủ | Thêm "Xóa số cắt khi đã hết số" | Đóng |

Sau khi sửa (21/10/2026), bộ database test `MES_*_T514`:
- `npm run lint -w backend`, `npm run typecheck`, `npm run build -w backend`: qua.
- 8 bộ `catalog`, `cutting-supply`, `cutting`, `full-access`, `phase3`, `phase5`, `review-fixes`, `shipment-plan-pos`: 144/144 qua; sau lượt sửa `cutting`, `catalog`: 34/34 qua.
- Frontend `catalog-work-calendar.test.tsx`: 7/7 qua.
