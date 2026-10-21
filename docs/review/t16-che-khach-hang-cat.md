# Review task T16 – Che tên khách hàng cho Trưởng chuyền ở Đồng bộ tiến độ cắt

Phạm vi: `backend/migrations/MES_Core/0015_mask_cutting_progress_customer.sql` (mới), `backend/test/cutting-mask-migration.spec.ts` (mới), `backend/scripts/seed-data.ts` (`roleFieldPolicies`), `backend/test/cutting.spec.ts`; tài liệu 04, 05, 12, 13 mục 13.5, 15, `ARCHITECTURE` mục 6.2, `ENGINEERING_STANDARDS` mục 1.1, STATUS. Quyết định: Q51 (che như các màn Đơn hàng), Q55 (máy đã cài nhận bằng migration). Luật: [AGENTS.md](../../AGENTS.md) mục 4.7, 4.9.

Lệch gốc: Trưởng chuyền có quyền Xem `cutting.progress` nhưng `roleFieldPolicies` không khai cột `customerName` của tài nguyên này, nên thấy rõ tên khách trong khi 4 màn Đơn hàng, Chuẩn bị SX cùng dữ liệu đã che. Bản sửa: thêm dòng mức Che vào seed (máy cài mới); seed không thêm chính sách mẫu cho vai trò, cột đã có nên máy đã cài nhận qua migration `MES_Core/0015` theo mẫu `0012`, `0013`.

## Lượt 1 – bản sửa

Kết luận agent: APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 3 MEDIUM, 5 LOW). Agent kiểm: migration thỏa mọi ràng buộc của `SysFieldPolicy`, chạy lại không trùng, một transaction, nhật ký cùng dạng `setRoleFieldPolicies`, chỉ tăng phiên bản quyền khi có thêm, không cần xóa cache (cache khóa theo phiên bản); máy cài mới (seed) và máy đã cài (migration) ra cùng trạng thái; backend chặn mọi đường dò tên khách (tìm nhanh, `customer=`, `cf`, sắp xếp, `/values`, popup, xuất file); frontend không vỡ.
Phiên chính đã kiểm chứng: đúng cả 8 phát hiện.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| M1 | MEDIUM | `cutting.spec.ts` (bài mới) | Chỉ kiểm `/values`; danh sách cột loại khỏi tìm nhanh của màn Cắt là code riêng, chưa bài nào chạy với cột bị Che | Thêm: tìm nhanh theo tên khách (Kế hoạch ra, Trưởng chuyền không), `customer=` và `cf` bị bỏ qua, popup trả `***` | Đóng |
| M2 | MEDIUM | STATUS | T16 còn ở việc chờ; mục 3 ghi "Không còn việc chờ" trong khi máy chủ cần chạy `0015` | Chuyển T16 sang đã xong, thêm việc triển khai ở mục 3, ghi Q54, Q55 | Đóng |
| M3 | MEDIUM | 04 (phiên bản quyền, bảng nhật ký, bảng test), 05 (nhật ký của migration) | Chưa nhắc `0015`, `ROLE_FIELD_POLICY` từ migration | Đã bổ sung | Đóng |
| L1 | LOW | `cutting-mask-migration.spec.ts` | Thiếu bài "database chưa seed" như file mẫu | Thêm bài | Đóng |
| L2 | LOW | `0015_…sql` (chú thích) | "kể cả bỏ che" chưa đúng: về "Mặc định" là xóa dòng, migration vẫn thêm | Sửa chú thích thành "đã đặt một mức (kể cả Sửa được)". File mới chạy trên bộ test `MES_*_T514`, chưa commit, chỉ đổi chú thích | Đóng |
| L3 | LOW | `seed-data.ts` | Dòng mới không ghi máy đã cài nhận qua `0015` | Thêm chú thích | Đóng |
| L4 | LOW | `ENGINEERING_STANDARDS.md` mục 1.1 | Số file test backend còn 37 | Sửa 38 | Đóng |
| L5 | LOW | 13 mục 13.5 | Chưa ghi Q51 và lựa chọn đưa vào máy đã cài bằng migration | Đã ghi | Đóng |

Sau khi sửa (21/10/2026), bộ database test `MES_*_T514` (đã `npm run migrate -- MES_Core`, chạy `0015`):
- `npm run lint -w backend`, `npx tsc --noEmit -p backend/tsconfig.json`: qua.
- `npx jest --runInBand test/cutting-mask-migration.spec.ts test/cutting.spec.ts`: 22/22 qua.
- Bài API mới dựa trên dữ liệu đã có chính sách: cùng dòng `TEST-P514-A`, Kế hoạch (không có chính sách cho cột này) thấy rõ tên khách.
