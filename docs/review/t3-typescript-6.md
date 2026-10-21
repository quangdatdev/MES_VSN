# Review task T3 – Thống nhất TypeScript 6.0.3

Phạm vi: `backend/package.json`, `frontend/package.json`, `package-lock.json`; tài liệu `AGENTS.md` mục 3.4, `ARCHITECTURE` A5, `ENGINEERING_STANDARDS` mục 8, `PROJECT_OVERVIEW` bảng công nghệ, 10, 13 mục 1.3, STATUS. Quyết định: Tech Lead 19/10/2026 chuẩn hóa sang TypeScript 6.0.3.

Lệch gốc: gốc `node_modules` đã 6.0.3 (`ts-jest`, `typescript-eslint` dùng), còn `backend`, `frontend` khai `^5.9.3` nên `nest build`, `tsc` của frontend chạy 5.9.3. Bản sửa: `backend`, `frontend` khai `~6.0.3` (không tự lên 6.1 vì `typescript-eslint` 8.71.1 nhận `< 6.1.0`); bỏ 2 bản 5.9.3 lồng trong workspace khỏi lockfile, `npm ci` sạch. `@nestjs/cli` 11.0.x ghim cứng `typescript` 5.9.3 nên npm giữ một bản lồng trong nó; 53 gói của cây `@nestjs/cli` chuyển chỗ lên gốc. TS 6.0.3 báo 0 lỗi, không phải sửa code.

## Lượt 1 – bản sửa

Kết luận agent: APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 1 MEDIUM, 4 LOW). Agent kiểm:
- `npm ls typescript` thoát 0; `backend`, `frontend`, gốc đều 6.0.3; loader của `@nestjs/cli` ra 6.0.3 từ mọi thư mục chạy.
- Peer range của `ts-jest`, `typescript-eslint`, `fork-ts-checker-webpack-plugin`, `@nestjs/schematics` nhận 6.0.3; `vite`, `vitest` không dùng `tsc` để chuyển mã.
- Lockfile: 53 khóa đổi chỗ, tập `tên@phiên bản|resolved|integrity` trùng khít; chỉ `backend`, `frontend`, `@nestjs/schematics` đổi bản TypeScript được dùng.
- TS 6.0 bỏ, đổi mặc định: không tsconfig nào dùng tùy chọn bị bỏ; `types`, `rootDir` của build khai rõ.
- Biên dịch `tsconfig.build.json` bằng 5.9.3 và 6.0.3 trong bộ nhớ: 254/254 file `.js`, `.js.map` giống từng byte (CommonJS, `__decorate`, `__metadata`).
- `npm audit`: 21 moderate như trước T3.
Phiên chính đã kiểm chứng: đúng cả 5 phát hiện.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| M1 | MEDIUM | Cây làm việc | Lẫn thay đổi comment của T1 (113 file) và 3 file chưa theo dõi không phải của phiên này | Commit T3 bằng danh sách file cụ thể; phần lẫn chỉ là comment, tên bài test (đầu ra biên dịch giống hệt) nên kết quả kiểm vẫn đúng | Đóng |
| L1 | LOW | `ENGINEERING_STANDARDS` mục 8 | "(tìm từ thư mục `backend`)" chưa đúng cơ chế loader | Sửa: loader ưu tiên `node_modules` gốc trước bản lồng; không dùng `overrides` | Đóng |
| L2 | LOW | CI | Không gì giữ TypeScript ở 6.0.x khi cài không theo lockfile | Đưa vào T2: bước kiểm `npm ls typescript` thoát 0 | Hoãn (T2) |
| L3 | LOW | `@nestjs/schematics` | `nest generate` chưa chạy thử với TS 6 | Không làm: repo không dùng `nest generate` | Không sửa |
| L4 | LOW | `PROJECT_OVERVIEW` | Ngày đọc phiên bản ở tiêu đề bảng còn 19/10 | Ghi thêm "TypeScript 21/10/2026" | Đóng |

Kết quả (21/10/2026, TS 6.0.3): `npm run lint`, `npm run typecheck`, `npm run build` qua; backend đủ 38 bộ trên `MES_*_T514`: 434 qua, 2 bỏ qua; frontend 36 file, 295/295; `test:deploy` 13/13.
