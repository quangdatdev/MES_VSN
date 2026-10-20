# Review task T17 – Xếp chuyền: chặn bỏ dòng dàn chuyền khi cột Ngày bắt đầu SX không Sửa được

Phạm vi: 2 file, `backend/src/modules/order/line-plan.service.ts` (`LinePlanService.saveLines`), `backend/test/phase5.spec.ts` (bài "Xếp chuyền: cột Ngày bắt đầu SX không Sửa được…"). Theo đúng mẫu T12 ([t12-cap-nhat-ty-le-cat.md](t12-cap-nhat-ty-le-cat.md)). Luật: [AGENTS.md](../../AGENTS.md) mục 4.1, 4.9.

Lỗi gốc (HIGH, review T12 phát hiện): `ScheduleDto.lines` nhận mảng rỗng; body `{ lines: [] }` không có khóa `startDate` nên `FieldPolicyInterceptor` cho qua. Người có `order.lineplan:update` mà Ngày bắt đầu SX ở mức Chỉ đọc, Ẩn, Che vẫn bỏ được các dòng dàn chuyền chưa có số (chưa cấp BTP, chưa có Kế hoạch may, chưa may) cùng phần giao màu cỡ. Bản sửa: sau `assertWritable`, kiểm mức cột `startDate` bằng `FieldPolicyService.levels`, không phải Sửa được thì 403 `FIELD_READONLY`, trước khi đọc kế hoạch. Không đổi hành vi khác: mọi dòng bắt buộc có `startDate` nên lưu có dòng khi cột này không Sửa được vốn đã bị interceptor chặn, giao diện khóa cả màn theo cùng cột (`LinePlanPage.tsx`, `canEdit`).

## Lượt 1 – bản sửa

Kết luận agent: APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 0 MEDIUM, 4 LOW).
Phiên chính đã kiểm chứng: đúng cả 4 LOW.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| L1 | LOW | `line-plan.service.ts` (`saveLines`) | Mẫu kiểm mức cột lặp lần thứ 4 (`po-allocation`, `color-size`, `cut-ratio`, `line-plan`), tên cột viết cứng | Không sửa trong T17 (sửa nền tảng); thêm vào nợ N10 ở [STATUS](../current/STATUS.md) | Hoãn |
| L2 | LOW | `docs/current/STATUS.md` | Chưa đóng lỗi ở mục 8.1, chưa ghi T17, N10, Q22 | Đã cập nhật | Đóng |
| L3 | LOW | `backend/test/phase5.spec.ts` (bài mới) | Chưa có bài kiểm `A00` chạy trước kiểm cột cho endpoint này | Thêm ca tài khoản tạm Kế hoạch ở `A00`, Ngày bắt đầu SX Chỉ đọc, `lines: []` => 403 `AGGREGATE_READ_ONLY` | Đóng |
| L4 | LOW | `backend/test/phase5.spec.ts` (bài mới) | Chưa khẳng định "chỉ Ngày kết thúc SX Chỉ đọc thì vẫn bỏ được dòng" (không đổi hành vi khác) | Thêm ca `endDate` Chỉ đọc, `startDate` Sửa được, `lines: []` => 200 | Đóng |

Sau khi sửa (20/10/2026), bộ database test `MES_*_T514`:
- `npm run lint -w backend`, `npm run build -w backend`: qua.
- `npx jest --runInBand test/phase5.spec.ts`: 52/52 qua.
- Bài mới chạy với `line-plan.service.ts` của `HEAD` (chưa sửa): hỏng ("expected 403, got 200"); với bản sửa: qua.
- `sewing-plan.spec.ts`, `cutting-supply.spec.ts` (cũng lưu Xếp chuyền): lần chạy chung đầu tiên 4 bài của `sewing-plan.spec.ts` hỏng, không giữ được log; chạy riêng 10/10, chạy chung thêm 3 lần đều 21/21. Nguyên nhân lần hỏng: NEEDS VERIFICATION (bản sửa chỉ thêm 403 khi `startDate` không Sửa được, hai bộ này không đặt chính sách cột đó).
