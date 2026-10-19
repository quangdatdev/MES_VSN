# Phase 5.7 – Tối ưu hiệu năng frontend

**Trạng thái:** Ready for review · **Bắt đầu:** 11/10/2026 · **Kế hoạch và phát hiện:** `docs/review/hieu-nang-frontend.md` · **Review:** `docs/review/phase-5-7.md`

## Mục tiêu
Người dùng yêu cầu (11/10/2026) rà frontend theo bộ quy tắc `react-best-practices`, rồi thực hiện tối ưu theo kế hoạch đã lập. Nguyên nhân chính là **vẽ lại thừa**: chữ đang gõ nằm ở state cấp trang, còn `DataGrid` không memo theo dòng. Kèm theo là gọi API thừa sau khi lưu, vài chuỗi gọi nối tiếp, và 3 lỗi đúng/sai.

## Phạm vi
Toàn bộ `frontend/src`. Mã phát hiện (L, C, M, A, G) theo `docs/review/hieu-nang-frontend.md`.

## Không làm
- **Không đổi backend.** Các việc cần backend chỉ ghi nhận ở mục 6 của file kế hoạch.
- **Không thêm thư viện, không bật React Compiler, không ảo hóa `DataGrid`.**
- **G4** (CSS Mantine theo component, nạp lười popup chứa lưới nhập) chỉ làm nếu đo thấy cần.

## Quyết định khi bắt đầu
Người dùng bảo "thực hiện tối ưu theo kế hoạch". Bốn điểm ở mục 7 của file kế hoạch được hiểu như sau:
1. Làm ngay, dưới dạng phase 5.7. Không chờ 5.1–5.6 duyệt.
2. Làm bản đầy đủ, trừ G4.
3. Ô ngày của lưới nhập ghi khi Enter hoặc rời ô (C4).
4. Chỉ đo bằng dữ liệu giả, không đăng nhập trình duyệt.

Người dùng muốn khác thì báo, sửa lại được.

## Task

| # | Task | Tiêu chí xong | Trạng thái |
|---|---|---|---|
| 5.7.0 | Đo nền | Phép đo `<Profiler>` với dữ liệu giả, để ngoài bộ test mặc định; số trước khi sửa ghi vào file kế hoạch | Xong: `npm run perf -w frontend` (`src/perf/`, `vitest.perf.config.ts`) |
| 5.7.1 | Lỗi đúng/sai L1–L3 | Có test cho L1, L2; lint và test qua | Xong: test cho cả L1, L2, L3 (`phase-5-7.test.tsx`, `prep-steps-save.test.tsx`, `render-cost.test.tsx`) |
| 5.7.2 | Dùng chung C1–C7 | Test hiện có qua. Test mới: chọn dòng chỉ vẽ lại dòng đổi; ô lọc gõ không render lại trang; bấm Lưu khi ô ngày đang sửa | Xong. Bấm Lưu khi ô ngày đang sửa kiểm trên Chrome thật (jsdom không vẽ ô của lưới nhập) |
| 5.7.3 | Các màn M1–M13 | Số đo giảm rõ; hành vi không đổi | Xong (M6 làm theo cách khác, xem file kế hoạch mục 8.2) |
| 5.7.4 | Gọi API A1–A8 | Lưu một lần không còn request thừa; F5 Tỷ lệ cắt chỉ chờ 1 lượt | Xong, trừ A8 (không làm) và một phần A6, A7 (lý do ở mục 8.2) |
| 5.7.5 | Gói tải G1–G3 | Build qua; chunk thư viện tách khỏi code ứng dụng | Xong: sửa code ứng dụng chỉ đổi `index-*.js` |
| 5.7.6 | Review, đo lại, tài liệu | `code-reviewer`; số sau khi sửa; quy tắc hiệu năng trong `quy-tac-ui-ux.md` | Xong: lượt 1 BLOCK (2 HIGH, 2 MEDIUM) đã sửa; lượt 2 APPROVE WITH SUGGESTIONS, 5 LOW đã sửa, 1 ghi nhận. Số đo trước/sau ở `hieu-nang-frontend.md` mục 8.1. Frontend 115 test qua |

## Phát sinh
- **Test chạy song song quá thời gian chờ:** khi chạy cả bộ, 3–4 test màn hình (Chính sách cột, Danh mục chuyền, Kế hoạch chuẩn bị SX, popup lọc) quá mốc 1 giây của `findBy` hoặc 5 giây mỗi test.
  - Code gốc trong worktree tạm cũng hỏng đúng các test này, ở cùng thời điểm, nên không phải lỗi do phase này.
  - Chạy riêng từng tệp thì qua.
  - Đã nâng `asyncUtilTimeout` lên 4 giây (`src/test/setup.ts`) và `testTimeout` lên 15 giây (`vite.config.ts`). Đây chỉ là thời gian chờ tối đa, test vẫn qua ngay khi phần tử xuất hiện.
- **Lệnh mới:** `npm run perf -w frontend`. Chưa thêm vào CLAUDE.md mục 8; cần người dùng đồng ý.
- **Kế hoạch xuất hàng (A7):** `GET /order/shipment-plans/:id` trả kèm dữ liệu nháp thì popup Sửa bớt được một lượt chờ. Cần đổi backend nên chỉ ghi nhận.

## Checklist review
- [ ] Không đổi hành vi nhìn thấy, trừ các điểm ở mục 8.3 của file kế hoạch (C4 ô ngày ghi khi rời ô, M5 cột bước bị Che gộp một cột) và các lỗi L1–L3.
- [ ] Lưới không hiện giá trị cũ sau khi memo dòng: cột có `render` đọc dữ liệu ngoài dòng phải đổi theo.
- [ ] Ô lọc giữ đồng bộ với URL khi Back/Forward, Xóa lọc, đổi nhà máy.
- [ ] Không mất phần đang nhập (lưới nhập, popup, ngăn kéo) và rời màn vẫn được hỏi lại.
- [ ] Sau khi lưu, dữ liệu trên màn vẫn được làm mới đúng.
