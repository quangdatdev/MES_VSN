# Review task T8 – Kiểm kiểu `backend/scripts`, `backend/test`

Phạm vi: `backend/package.json`, `package.json` (lệnh `typecheck`); tài liệu `AGENTS.md` mục 8, `ENGINEERING_STANDARDS` mục 1.4, 9, 10, `11-van-hanh.md`, `PROJECT_OVERVIEW` mục 7, `DEVELOPMENT_WORKFLOW` mục 3, 4, STATUS. Quyết định: Q44 (thêm bước `tsc --noEmit` cho `backend/scripts`, `backend/test`, chạy cả trong CI).

Lỗ hổng gốc: Jest chạy với `diagnostics: false`, `nest build` chỉ build `src` (`tsconfig.build.json`), script chạy bằng `tsx`: lỗi kiểu trong `backend/test`, `backend/scripts` không lệnh nào bắt. Bản sửa: lệnh `npm run typecheck` (gốc) → `tsc --noEmit -p tsconfig.json` (backend, `tsconfig.json` gồm `src`, `scripts`, `test`). Hiện 0 lỗi; đặt thử một lỗi kiểu ở `test/`, một ở `scripts/` thì lệnh báo đúng 2 lỗi, thoát mã 2.

## Lượt 1 – bản sửa

Kết luận agent: APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 1 MEDIUM, 6 LOW). Agent so danh sách file tsc nạp với file trên đĩa: 184/184 file `.ts` của `src`, `scripts`, `test`; frontend `build` đã phủ `src/test`.
Phiên chính đã kiểm chứng: đúng cả 7 phát hiện.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| M1 | MEDIUM | `PROJECT_OVERVIEW` mục 7, 11 bước triển khai B.1, `DEVELOPMENT_WORKFLOW` mục 3, 4, `ENGINEERING_STANDARDS` đầu file | Các danh sách kiểm chạy tay chưa có `typecheck` | Đã thêm | Đóng |
| L1 | LOW | `ENGINEERING_STANDARDS` mục 1.4 | "CI chạy ở bước 4" đọc như CI đã có; "lỗi kiểu do `typecheck` bắt" nói quá vì nhiều chỗ dùng `any` | Sửa câu chữ | Đóng |
| L2 | LOW | 11 bảng lệnh gốc | "`npm run build` chỉ kiểm `src`" dễ hiểu nhầm (frontend có kiểm `src/test`) | Sửa câu chữ | Đóng |
| L3 | LOW | `package.json` | `typecheck` gốc chỉ chạy backend trong khi `lint`, `test`, `build` chạy cả hai | Không sửa: Q44 chỉ nói backend, frontend đã kiểm kiểu trong `build` (DoD có cả `build`); tài liệu ghi rõ "kiểm kiểu backend" | Không sửa |
| L4 | LOW (có từ trước) | `backend/tsconfig.build.json` | Kế thừa `types: ["node", "jest"]` nên code chạy thật biên dịch qua khi lỡ dùng biến của Jest | Ghi nợ N13 (PROPOSED) | Hoãn |
| L5 | LOW (có từ trước) | `@types/node` 26.x | Máy chạy Node 22, kiểm kiểu chấp nhận API mới hơn | Ghi nợ N14 (PROPOSED, hỏi Tech Lead) | Hoãn |
| L6 | LOW (có từ trước) | `frontend/vitest.perf.config.ts` | Không được kiểm kiểu ở đâu, chạy riêng báo TS5097 | Ghi STATUS mục 8.1 | Hoãn |

Sau khi sửa (21/10/2026): `npm run typecheck` qua (0 lỗi), `npm run lint -w backend`, `npm run build -w backend` qua. Không đổi code chạy nên không chạy test.
