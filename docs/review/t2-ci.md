# Review task T2 – Dựng CI GitHub Actions

Phạm vi: `.github/workflows/ci.yml` (mới), `backend/test/catalog.spec.ts`; tài liệu `ENGINEERING_STANDARDS` (đầu file, mục 1.4, 8, 9), `DEVELOPMENT_WORKFLOW` mục 4.1, 4.3, `ARCHITECTURE` A6, 13 mục 16.4, STATUS. Quyết định: Tech Lead 19/10/2026 duyệt CI theo cú pháp GitHub Actions và các bước ở `ENGINEERING_STANDARDS` mục 9.

Nội dung: job `checks` (`npm ci`, `npm ls typescript`, lint, build, `typecheck`, test frontend, `test:deploy`) và job `backend-test` (SQL Server 2019 trong container, mật khẩu sinh mỗi lần chạy, `migrate`, `seed` dữ liệu mẫu, test backend). Thử điều kiện CI trên bộ database mới `MES_*_CI21` ở SQL Server test (máy dev không có Docker): 37/38 bộ qua, 2 bài `catalog.spec.ts` hỏng vì bảng chép BRAVO rỗng (đúng như STATUS đã ghi); sửa `catalog.spec.ts` để chỉ chạy các bài đó khi bảng chép có dữ liệu.

## Lượt 1 – bản sửa

Kết luận agent: APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 3 MEDIUM, 8 LOW). Agent kiểm: YAML đọc được; quét 1.807 import tương đối so với tên file trong git, không lệch hoa thường; `TZ=UTC` test frontend 295/295; lockfile có đủ gói native `linux-x64`; không lệnh Windows trong test; `migrate --check` thoát 0 khi `sa` có quyền tạo database, thoát 1 khi chưa kết nối được; thiếu `backend/.env` không sao; mật khẩu đủ chính sách; không dùng secret, quyền `contents: read` đủ.
Phiên chính đã kiểm chứng: đúng cả 11 phát hiện.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| M1 | MEDIUM | `ci.yml` (chờ SQL Server) | Mỗi lần thử chờ kết nối tới 30 giây, 60 vòng thành khoảng 40 phút, nuốt hết lỗi, không kiểm container đã dừng | Hạn 5 phút, container dừng thì báo ngay, in lỗi lần thử cuối và log container | Đóng |
| M2 | MEDIUM | `catalog.spec.ts` | `catch` đổi lỗi đọc bảng chép thành "bỏ qua", bài vẫn báo qua, thông điệp sai nguyên nhân | Bỏ `catch`: lỗi đọc làm `beforeAll` hỏng | Đóng |
| M3 | MEDIUM | `ARCHITECTURE` A6, `DEVELOPMENT_WORKFLOW` 4.3, STATUS | Ghi "Xong", CURRENT khi CI chưa chạy lần nào, chưa cưỡng chế | A6 thêm NEEDS VERIFICATION; 4.3 giữ APPROVED (cưỡng chế ở T6); STATUS ghi Ready for review, N5 còn mở | Đóng |
| L1 | LOW | `ENGINEERING_STANDARDS` | Vài chỗ còn "CI chưa dựng", "Chạy tay" | Sửa | Đóng |
| L2 | LOW | `ci.yml` | `actions/*@v4` chạy runtime Node 20 (GitHub đang ngừng) | Lên `@v5` | Đóng |
| L3 | LOW | `ci.yml` | `ubuntu-latest`, `2019-latest` tự đổi bản | Ghim `ubuntu-24.04`; ảnh SQL Server giữ `2019-latest` (chưa kiểm được tag CU), ghi rõ thời điểm so với máy chủ | Đóng một phần |
| L4 | LOW | `ci.yml` | Container chưa giới hạn bộ nhớ, cổng mở mọi địa chỉ | `MSSQL_MEMORY_LIMIT_MB=2048`, `-p 127.0.0.1:1433:1433` | Đóng |
| L5 | LOW | `ci.yml` (`concurrency`) | Push sát nhau lên `main` làm commit trước không có kết quả | Chỉ hủy lần cũ với PR; group gồm tên workflow | Đóng |
| L6 | LOW | `ci.yml` | CI dùng `sa`, máy chủ dùng login `db_owner` | Ghi nợ N15 (PROPOSED, hỏi trước vì ngoài các bước đã duyệt) | Hoãn |
| L7 | LOW | `catalog.spec.ts` | Gộp điều kiện chi nhánh và cỡ; bài bỏ qua vẫn báo qua | Tách `branchesCopied`, `sizesCopied`; cảnh báo nói rõ bảng nào chưa đồng bộ; ghi lỗ hổng ở `ENGINEERING_STANDARDS` mục 1.4 | Đóng |
| L8 | LOW | `ci.yml` (comment `npm ls`) | Comment nói "cài không theo lockfile" trong khi CI luôn `npm ci` | Sửa comment | Đóng |

Sau khi sửa (21/10/2026): `catalog.spec.ts` 16/16 trên `MES_*_CI21` (in cảnh báo bỏ qua `DM_CHINHANH`, `DM_Size`) và trên `MES_*_T514` (kiểm đủ); lint, `tsc` backend qua. Workflow chưa chạy trên GitHub: NEEDS VERIFICATION tới lần push đầu.

Lần chạy đầu trên GitHub (21/10/2026, push `f0df12b` lên `main`, run `39557020051`): xanh cả hai job (`checks` 1,6 phút, `backend-test` 2,6 phút), mọi bước `success`. Số bài test trong log chưa xem được vì tải log cần đăng nhập GitHub.
