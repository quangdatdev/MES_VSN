# Review task T12 – Cập nhật tỷ lệ cắt: chặn đổi màu cỡ khi cột Số lượng không Sửa được

Phạm vi: 2 file, `backend/src/modules/order/cut-ratio.service.ts` (`CutRatioService.updateColorSizes`), `backend/test/phase5.spec.ts` (bài "Cập nhật tỷ lệ cắt: cột Số lượng không Sửa được…"). Quyết định liên quan: [13](../update_docs/13-quyet-dinh.md) mục 3.7 (chính sách cột). Luật: [AGENTS.md](../../AGENTS.md) mục 4.1, 4.9.

Lỗi gốc (HIGH): người có `order.po:update` mà cột Số lượng (`qty`) ở mức Chỉ đọc, Ẩn, Che vẫn xóa hết màu cỡ của PO, đưa Số lượng PO về 0, bằng body `{ lines: [] }`: `FieldPolicyInterceptor` chỉ chặn khi body có khóa `qty`. Bản sửa lấy từ worktree `MES-wt-r4` (nhánh `fix-cut-ratio-qty`), áp lên `main`: service gọi `assertWritable`, rồi kiểm mức cột `qty` bằng `FieldPolicyService.levels` trước khi khóa, đọc PO (như `ColorSizeService.save`).

## Lượt 1 – bản sửa

Kết luận agent: APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 0 MEDIUM, 4 LOW trong diff; ngoài diff: 1 HIGH, 1 MEDIUM có sẵn).
Phiên chính đã kiểm chứng: đúng cả 4 LOW và phát hiện HIGH ngoài diff (đọc `line-plan.service.ts` `saveLines`, `order.dto.ts` `ScheduleDto`).

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| L1 | LOW | `backend/test/phase5.spec.ts` (bài mới) | Hỏng giữa chừng thì PO thử mất màu cỡ, bài sau hỏng dây chuyền | Bọc cả bài trong `finally` trả lại màu cỡ khi khác lúc đầu | Đóng |
| L2 | LOW | `backend/test/phase5.spec.ts` (bài mới) | Thiếu ca chính sách theo người và ca body có dòng | Thêm ca chính sách theo người (tài khoản tạm `test.cutratioqty`, dọn trong `finally`) và ca body có dòng khi Chỉ đọc | Đóng |
| L3 | LOW | `cut-ratio.service.ts`, `color-size.service.ts` | Hai service lặp mẫu kiểm mức cột, tên cột viết cứng | Để sau: thêm hàm dùng chung ở `FieldPolicyService` là sửa nền tảng, ngoài phạm vi T12; ghi nợ kỹ thuật ở [STATUS](../current/STATUS.md) | Hoãn |
| L4 | LOW | `docs/update_docs/06-don-hang.md`, `docs/current/STATUS.md` | Bảng API thiếu 403; STATUS còn ghi bản sửa chỉ ở worktree | Đã sửa bảng API, mục 4.4 của 06, 04 mục 8.3, STATUS | Đóng |
| H1 | HIGH (có sẵn, ngoài diff) | `backend/src/modules/order/line-plan.service.ts` (`saveLines`) | `PUT /order/line-plans/:id/lines` với `{ lines: [] }` không có khóa `startDate` nên interceptor cho qua: người có `order.lineplan:update` mà Ngày bắt đầu SX không Sửa được vẫn xóa được dòng dàn chuyền chưa có số và phần giao màu cỡ | Không sửa trong T12; ghi [STATUS](../current/STATUS.md) mục Lỗi đã biết, chờ Tech Lead (liên quan Q22) | Mở |
| M1 | MEDIUM (có sẵn, đã biết) | `cut-ratio.service.ts` (`setConfirmed`) | Xác nhận đổi Trạng thái không xét mức cột `statusCode`; 409 "PO chưa có số lượng" cho người không xem được `qty` biết Số lượng có bằng 0 | Ghi thêm vào dòng đã có ở STATUS | Mở |

Sau khi sửa (20/10/2026), bộ database test `MES_*_T514` (`migrate`, `seed` dữ liệu mẫu, không có migration mới):
- `npm run lint -w backend`: qua; `npm run build -w backend`: qua.
- `npx jest --runInBand test/phase5.spec.ts`: 51/51 qua.
- Bài mới chạy với `cut-ratio.service.ts` của `HEAD` (chưa sửa): hỏng ("expected 403, got 200"); với bản sửa: qua.
