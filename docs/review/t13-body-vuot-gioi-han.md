# Review task T13 – Body vượt giới hạn trả 413 thay vì 500

Phạm vi: 3 file code, `backend/src/common/http-exception.filter.ts` (`AllExceptionsFilter`), `backend/src/common/app.exception.ts` (`Errors.payloadTooLarge`), `backend/test/auth.spec.ts` (bài "body JSON vượt 512 KB…"); tài liệu 04, 12, `DATA_FLOWS`, `CODE_CONVENTIONS`, STATUS. Luật: [AGENTS.md](../../AGENTS.md) mục 6 (lỗi API dùng `AppException`/`Errors`, mã ổn định, thông điệp tiếng Việt).

Lỗi gốc: lỗi `entity.too.large` của body-parser (body JSON vượt 512 KB ở `app.factory.ts`, urlencoded vượt 100 KB mặc định của Nest) không phải `HttpException` nên `AllExceptionsFilter` trả 500 `INTERNAL_ERROR` ("Có lỗi hệ thống") và ghi log lỗi kèm stack. Bài test mới chạy với code cũ: "expected 413, got 500". Bản sửa: bộ lọc đổi lỗi này thành `Errors.payloadTooLarge(limit)`, 413 `PAYLOAD_TOO_LARGE`, thông điệp ghi mức tối đa. Các lỗi khác của body-parser giữ nguyên hành vi.

## Lượt 1 – bản sửa

Kết luận agent: APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 0 MEDIUM, 7 LOW). Agent chạy thử trên app Nest tối thiểu không cần database: bản cũ 500, bản mới 413; 524288 byte qua, 524289 byte bị chặn.
Phiên chính đã kiểm chứng: đúng cả 7 LOW.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| L1 | LOW | `http-exception.filter.ts` | 413 không còn để lại dấu vết trong log, mất tín hiệu cần nâng giới hạn | Ghi `warn` kèm `traceId`, giới hạn, cỡ body, method, đường dẫn (không ghi nội dung body) | Đóng |
| L2 | LOW | `http-exception.filter.ts`, 04 mục 13 | Chỉ nhắc bộ đọc JSON, trong khi bộ urlencoded mặc định của Nest cũng được đổi | Sửa comment và dòng 413 ở 04 | Đóng |
| L3 | LOW | `app.exception.ts`, `http-exception.filter.ts` | Mức tối đa chỉ có trong thông điệp; type guard tin `limit` là số | Thêm `details.limitBytes`; chỉ dùng `limit` khi là số hữu hạn | Đóng |
| L4 | LOW | `auth.spec.ts` | Bài không chạm database nhưng nằm trong bộ cần database | Không sửa: CI (T2) chạy test backend trên SQL Server trong container nên bài vẫn chạy | Không sửa |
| L5 | LOW | 04 mục 13, `DATA_FLOWS` mục 2, 8 | Dòng 500 chưa loại trừ body vượt giới hạn; mục 2 thiếu điểm kiểm đọc body; mục 8 nói hành vi backend | Sửa dòng 500; thêm dòng "Đọc body" ở mục 2; mục 8 nói `toastError` hiện thông điệp máy chủ | Đóng |
| L6 | LOW | STATUS | Dòng T13 thiếu kết quả lệnh, bộ database test; chưa ghi các lỗi body-parser khác còn 500 | Bổ sung dòng T13; thêm vào dòng `app.factory.ts` ở mục 8.1 (415 charset/encoding, quá 1.000 tham số, query lồng sâu còn 500; thiếu header helmet ở lỗi bộ đọc body) | Đóng |
| L7 | LOW | Cây làm việc | Lẫn thay đổi của T11 và phần cập nhật trạng thái Git trong STATUS | Commit T13 chỉ gồm file của T13; STATUS đi cùng T13 (gồm phần cập nhật trạng thái Git 21/10/2026, ghi trong thông điệp commit); T11 commit riêng | Đóng |

Sau khi sửa (21/10/2026), bộ database test `MES_*_T514`:
- `npx tsc --noEmit -p backend/tsconfig.json`, `npm run lint -w backend`, `npm run build -w backend`: qua.
- `npx jest --runInBand test/auth.spec.ts`: 17/17 qua.
