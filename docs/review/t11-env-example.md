# Review task T11 – Bổ sung 8 biến vào `backend/.env.example`

Phạm vi: `backend/.env.example`, `deploy/huong-dan.html`, `docs/ENGINEERING_STANDARDS.md` mục 2, `docs/update_docs/11-van-hanh.md` (câu sau bảng biến), STATUS. Quyết định: Q48 (bổ sung đủ biến vào `.env.example`).

Lỗi gốc: `backend/src/config/env.ts` đọc 8 biến mà `.env.example` không có (`NODE_ENV`, `DB_ENCRYPT`, `DB_TRUST_CERT`, `JWT_ACCESS_TTL`, `PRE_AUTH_TTL`, `REFRESH_TTL_DAYS`, `LOGIN_MAX_FAILED`, `LOGIN_LOCK_MINUTES`), nên người cài không biết có các biến này và `deploy.cjs` (chỉ cảnh báo biến có trong `.env.example`) không nhắc. Bản sửa: thêm đủ 8 biến, để trống (lấy mặc định), `NODE_ENV` ở dạng dòng comment, kèm chú thích mặc định và đơn vị.

## Lượt 1 – bản sửa

Kết luận agent: APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 1 MEDIUM, 8 LOW). Agent đối chiếu `env.ts`, dotenv 18.0.6, Jest, express, `deploy.cjs`, `lib.cjs`; để trống cả 8 biến chạy y như không khai báo; `.env.example` và `env.ts` cùng 35 biến; `test:deploy` 13/13.
Phiên chính đã kiểm chứng: đúng cả 9 phát hiện.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| M1 | MEDIUM | STATUS mục 3, `huong-dan.html` (xử lý sự cố) | Hai nơi hướng dẫn trái nhau khi `deploy.cjs` cảnh báo biến mới; nếu cảnh báo có `NODE_ENV` thì "không cần thêm" là sai (máy chủ đang không chạy production) | Thống nhất hai nơi: biến ghi "Để trống" thì không cần thêm; có `NODE_ENV` thì thêm `NODE_ENV=production`; không thêm dòng trùng tên | Đóng |
| L1 | LOW | `.env.example` | Dòng `NODE_ENV=` trống chép xuống cuối `.env` sẽ đè `NODE_ENV=production` (dòng sau đè dòng trước) | Đổi thành dòng comment `# NODE_ENV=production`; `envKeys` của `deploy.cjs` vẫn đếm dòng comment | Đóng |
| L2 | LOW | `.env.example` | "COOKIE_SECURE mặc định bật" dễ hiểu nhầm vì file mẫu đặt `false` | Ghi "để trống thì bật, file này đặt false cho HTTP" | Đóng |
| L3 | LOW | `.env.example` | Chưa nói vì sao không đặt `NODE_ENV` thành biến môi trường của Windows | Thêm lý do (`npm ci` bỏ devDependencies) | Đóng |
| L4 | LOW | `.env.example` | `DB_ENCRYPT`, `DB_TRUST_CERT` đọc khác các cờ `flag()` (phân biệt hoa thường, không báo lỗi); "tin chứng chỉ" là không kiểm chứng chỉ | Chú thích rõ; không đổi cách đọc (đổi hành vi) | Đóng |
| L5 | LOW | `ENGINEERING_STANDARDS.md` mục 2 | Mô tả cảnh báo của `deploy.cjs` rộng hơn thực tế | Sửa: chỉ biến bản mới thêm so với bản đang chạy | Đóng |
| L6 | LOW | `ENGINEERING_STANDARDS.md` mục 2 | Không có gì tự kiểm `env.ts` khớp `.env.example` | Ghi nợ N12 (PROPOSED, hỏi trước khi làm) | Hoãn |
| L7 | LOW | STATUS dòng T11 | Ghi "[11] bảng biến" trong khi sửa câu sau bảng | Sửa | Đóng |
| L8 | LOW (có từ trước) | `11-van-hanh.md`, `12` | Tài liệu nói chốt `NODE_ENV=production` chạy cả với `npm test`; Jest đặt `NODE_ENV=test` trước khi nạp `.env` | Ghi STATUS mục 8.2 (NEEDS VERIFICATION), không sửa trong T11 | Hoãn |

Sau khi sửa (21/10/2026): đối chiếu lại bằng script, `.env.example` khớp đủ 35 biến `env.ts` đọc; `npm run test:deploy` 13/13. Không có code chạy đổi nên không chạy lint, build, test backend.
