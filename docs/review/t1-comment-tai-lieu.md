# Review task T1 – Sửa comment trong code trỏ tới tài liệu đã xóa

Phạm vi: 116 file code (`backend/src`, `backend/scripts`, `backend/test`, `frontend/src`, `backend/.env.example`), `backend/eslint.config.mjs`, trường `status` của `backend/migrations/softkeys.json`; tài liệu `CODE_CONVENTIONS` mục 1.3, 13 (dòng hướng dẫn đầu file, bảng tra ADR), `update_docs/README`, STATUS. Quyết định: Tech Lead 19/10/2026 sửa comment trỏ tài liệu cũ sang đường dẫn mới.

Lệch gốc: ngày 19/10/2026 đã xóa ADR, `docs/thiet-ke/*.md`, file phase sau khi gộp vào bộ tài liệu mới; comment trong code còn 224 chỗ "ADR 00xx" và 12 chỗ `docs/thiet-ke/*.md`. Cách làm: 5 agent sửa song song theo thư mục, cùng một hướng dẫn: "ADR 00xx [mục Y]" thành "quyết định X.Y" (mục của 13 có dòng **Nguồn** nhắc đúng ADR và khớp ý comment), đường dẫn cũ thành tài liệu thay theo bảng ở `update_docs/README`; chỉ đổi chữ, giữ kiểu xuống dòng; không sửa migration đã chạy. Phiên chính sửa thêm tên bài test, 2 `console.warn`, 1 `throw new Error` trong test, dòng chú thích migration do `sync-gen.ts` sinh, và 2 comment sai đã ghi ở STATUS.

## Lượt 1 – bản sửa

Kết luận agent: APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 1 MEDIUM, 9 LOW). Agent đối chiếu cả 224 chỗ "ADR" với ADR gốc và mục 13 được chọn: không chỗ nào sai, vài chỗ nên chỉnh. Kiểm bằng script trên `git diff -U0`: chỉ đổi chữ quanh tham chiếu; không đổi thụt lề, khoảng trắng, kiểu xuống dòng; `sync-gen.spec.ts` 20/20.
Phiên chính đã kiểm chứng: đúng cả 10 phát hiện.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| M1 | MEDIUM | `backend/eslint.config.mjs` | Còn 7 chỗ "ADR 0007/0009/0012", 4 chỗ trong thông điệp lint, trong khi tài liệu ghi đã đổi hết | Đổi sang "quyết định 1.2" (ranh giới module) | Đóng |
| L1 | LOW | `backend/migrations/softkeys.json` (trường `status`) | Còn 5 "ADR 00xx"; không phải migration, code không đọc trường này | Đổi sang 6.2, 7.6, 9.2, 10.3, 7.1; STATUS ghi đúng 20 file migration `.sql` để nguyên | Đóng |
| L2 | LOW | Tên 2 bài ở `phase5.spec.ts` | Mục chưa đủ (`usedBy` là 7.2, Thêm PO tay là 7.4) | Sửa thành "7.2, 7.3, 7.4" và "7.2, 7.4" | Đóng |
| L3 | LOW | `admin-grants.service.ts`, `phase5.spec.ts` | "L3, L4, L5 – 3.5, 3.6, 3.7" lệch thứ tự (L4 là 3.7, L5 là 3.6) | Sửa thành "3.5, 3.7, 3.6" | Đóng |
| L4 | LOW | STATUS dòng T1 | Thiếu `throw new Error` trong danh sách chuỗi đã đổi; câu "mọi dòng chứa tham chiếu" chưa đúng hẳn; link báo cáo chưa có | Sửa dòng T1, tạo file này. Build đã chạy (phiên chính) | Đóng |
| L5 | LOW | `update_docs/README` | Còn nói bảng tra ADR dùng cho comment trong code | Sửa: dùng cho comment trong migration đã chạy | Đóng |
| L6 | LOW (có từ trước) | Bảng tra ADR cuối 13 | Thiếu mục so với các dòng **Nguồn** | Bổ sung "nhắc ở …" cho 10 ADR (đối chiếu bằng script) | Đóng |
| L7 | LOW | `phase3.spec.ts` (comment đầu file) | Số kịch bản theo `seed-demo.md` cũ, file 12 đánh số A1–G5 | Ghi rõ là số của file cũ (`git show 98d19db:…`); viết lại theo nội dung: PROPOSED ở STATUS 8.1 | Đóng |
| L8 | LOW | STATUS mục 8 | 2 dòng mới đặt ở 8.2 (tài liệu) trong khi là vấn đề của code; sót `department.service.ts` trích `KE-HOACH-MES-VSN.md` | Chuyển sang 8.1, thêm dòng | Đóng |
| L9 | LOW | `seed.spec.ts`, `org.service.ts` | Hai câu đọc gượng | Viết lại | Đóng |

Sau khi sửa (21/10/2026): không còn tham chiếu tới tài liệu đã xóa trong `backend/src`, `backend/scripts`, `backend/test`, `frontend/src`, `deploy`, `README.md`, `backend/.env.example`, `backend/eslint.config.mjs` (chỉ còn trong 20 migration `.sql` đã chạy); `npm run lint`, `npm run typecheck`, `npm run build` qua. Không chạy test backend vì chỉ đổi comment, tên bài test, chuỗi thông báo.
