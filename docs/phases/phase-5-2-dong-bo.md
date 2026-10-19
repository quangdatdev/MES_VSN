# Phase 5.2 – Đồng bộ dữ liệu BRAVO qua database trung gian

**Trạng thái:** Ready for review (5.2.1–5.2.7; 5.2.8 chờ BA) · **Bắt đầu:** 10/10/2026 · **Quyết định:** ADR 0007 · **Thiết kế:** `docs/thiet-ke/db-sync.md`

## Mục tiêu
Chép dữ liệu từ database trung gian của BRAVO (`DB_TRUNGGIAN_NAME`, chỉ có view) vào MES, chỉ lấy phần thay đổi sau lần đồng bộ trước, và có màn hình kiểm soát. Chưa ánh xạ sang bảng nghiệp vụ (theo chỉ đạo 10/10/2026: "chưa nói đến đúng sai và map như nào").

## Chốt với người dùng (10/10/2026)
- Không đọc thẳng BRAVO; chỉ đọc view của database trung gian.
- Bảng chép đặt ở database riêng `MES_Sync` (quản trị CSDL tạo vì `mes_user` không có quyền tạo database).
- Đợt đầu 18 view: Đơn hàng và danh mục liên quan.
- AI được chạy migrate và seed trên SQL Server localhost để chạy thử, test.

## Task

| # | Task | Tiêu chí xong | Trạng thái |
|---|---|---|---|
| 5.2.1 | Khảo sát view, ánh xạ sơ bộ sang module Đơn hàng | `docs/thiet-ke/anh-xa-bravo-don-hang.html` | Xong |
| 5.2.2 | `MES_Sync`: bảng điều khiển, thủ tục điều phối, dọn lần chạy mồ côi | `0001_sync_core.sql` | Xong, đã chạy trên localhost 10/10 |
| 5.2.3 | Sinh bảng chép + thủ tục chép tăng dần cho 18 view | `sync-gen.ts`, `0002_bravo_order_sources.sql`, `0003` (sửa lỗi 8155 ở thủ tục nhóm, phát hiện khi chạy test), `0004` (chặn khóa NULL, chốt xóa hàng loạt); synonym tạo lại khi migrate | Xong, đã chạy |
| 5.2.4 | API `/admin/sync` + hàng đợi chạy nền, quyền `admin.sync`, nhật ký | `platform/sync`, seed | Xong |
| 5.2.5 | Màn Quản trị › Đồng bộ dữ liệu | Bảng nguồn, mốc, kết quả, lỗi, lịch sử, chép lại toàn bộ | Xong |
| 5.2.6 | Test | `backend/test/sync.spec.ts`: quyền, bảng mẫu KEY/PARTITION, lỗi giữa transaction, lần chạy mồ côi, nhật ký, dữ liệu thật | Xong: 15/15 + 18 bài đối chiếu migration (`sync-gen.spec.ts`); toàn backend 109/109, frontend 19/19 |
| 5.2.7 | Review `code-reviewer` | `docs/review/phase-5-2.md`, không còn CRITICAL/HIGH | Lượt 1 BLOCK (1 HIGH, 5 MEDIUM) → sửa; lượt 2 APPROVE WITH SUGGESTIONS (1 MEDIUM, 7 LOW) → sửa hết, 1 test hoãn có lý do |
| 5.2.8a | Nạp thử dữ liệu thật vào `MES_Order` để xem (người dùng yêu cầu 10/10/2026) | `MES_Order/0003` (nới mã hàng, tên màu; khóa nguồn `SourceProductId`), `scripts/load-bravo-orders.ts` (`npm run load:bravo -- --yes`), giả định ở `db-order.md` mục "Nạp từ BRAVO"; kế hoạch, dàn chuyền mô phỏng | Xong, đã chạy: 1.521 đơn, 7.698 PO, 37.652 ô màu cỡ (A01–A03); 120 kế hoạch mô phỏng. Review lượt 3 APPROVE WITH SUGGESTIONS (4 MEDIUM, 11 LOW) → sửa, còn MEDIUM #4 (dữ liệu thật mở cho LAN) chờ người dùng chọn; test backend 116/116, frontend 19/19 |
| 5.2.8b | Dàn chuyền mô phỏng đủ màu, đủ tình huống (người dùng yêu cầu 10/10/2026) | Mọi chuyền có việc quanh hôm nay; đủ trạng thái thanh, mức phân màu cỡ, chuyền trống, nhiều chuyền, xếp một phần, chưa xếp, tách đợt, trễ ngày xuất; chạy lại giữ phần người dùng lập, sửa | Xong: `scripts/simulate-board.ts` (`npm run sim:board -- --yes`, `load:bravo` dùng chung), `scripts/script-db.ts`; quy tắc ở `db-order.md` mục "Dàn chuyền mô phỏng". Đã chạy local: A01 164 kế hoạch/179 dòng, A02 68/82, A03 76/76. Test `simulate-board.spec.ts` 15 bài, `simulate-board.db.spec.ts` 1 bài (tự hủy transaction); review `docs/review/phase-5-2.md` lượt 4–5 |
| 5.2.8 | Ánh xạ bảng chép → `MES_Order` | Sau khi BA trả lời 8 câu hỏi trong file khảo sát | Chưa làm |

## Chạy thử thật (10/10/2026, màn Đồng bộ dữ liệu, tài khoản admin)
- Lần đầu (chép toàn bộ): 14/18 nguồn thành công, số dòng khớp khảo sát (sản phẩm đơn hàng 7.523, PO khách 83.684 trong khoảng 0,5 giây, màu cỡ bảng cân đối 23.154). 4 nguồn lỗi 229 "EXECUTE permission … ufn_Agg_Concat" như dự kiến (khách hàng, địa điểm giao hàng, thông tin PO, màu cỡ PO).
- Lần sau (tăng dần): mỗi nguồn đọc vài đến vài chục dòng trong khoảng lùi 10 phút, 0 dòng ghi lại; lâu nhất khoảng 1 giây (màu cỡ bảng cân đối, có đối soát số dòng từng nhóm).

## Sửa kèm
- Màn Người dùng: tích ô trong hộp Gán vai trò / Gán nhà máy làm sập màn hình (đọc `e.currentTarget` trong hàm cập nhật state). Đã sửa, có test `frontend/src/test/admin.test.tsx`.

## Không làm
- Ánh xạ sang bảng nghiệp vụ, lịch tự chạy, OSM/GSD.
- Cấp quyền trên database BRAVO (việc của quản trị CSDL; xem ADR 0007 mục Hệ quả).

## Phát sinh
- 10/10/2026 (5.2.8b): dữ liệu BRAVO đang chép gần như không có đơn còn mở gần hôm nay ở A02 (mới nhất 05/2026) và A03 (7 đơn còn mở, đều dưới 600 sản phẩm), nên dàn chuyền mô phỏng dùng cả đơn đã đóng lệnh và ngày xuất của kế hoạch tính theo dàn chuyền. A04, A05 chưa có chuyền nên chưa có dàn chuyền. Kế hoạch chuẩn bị SX: theo yêu cầu người dùng, đã nhập ngày TH mẫu cho 8 dòng ở A01 qua API, bằng tài khoản kehoach.a (như nhập tay, có nhật ký): 3 dòng Đủ điều kiện V/C (1 dòng có 3 bước xong trễ), 2 dòng Chưa đủ đk V/C làm dở, 3 dòng sắp vào chuyền (làm sớm vài bước, xong hết sớm, chỉnh riêng số ngày KH 2 bước). Không viết thành script vì chỉ là dữ liệu nhập tay một lần; sim:board giữ các dòng này khi chạy lại, load:bravo và reset:demo thì xóa. Chưa có tình huống "chuyền đã ngừng dùng còn việc" vì cần đổi danh mục chuyền ở `MES_Core`.
- 10/10/2026: quản trị CSDL đã xử lý quyền, cả 18 nguồn chép thành công (4 view trước lỗi quyền giờ đọc được).
- Nạp dữ liệu thật (5.2.8a) cần sửa kèm: kiểm hợp lệ mã hàng, PO#, cỡ, tên màu ở API và form (dữ liệu thật có chữ tiếng Việt, dấu cách, ngoặc); ô "Loại" gợi ý theo dữ liệu thay cho FOB/CMT cố định; popup "Chọn mã hàng" bỏ đơn đã hoàn thành/hủy và mặc định lọc từ 30 ngày trước; test Phase 5 tự tạo đơn hàng riêng thay vì dựa vào dữ liệu seed.
- A04, A05 (2.000 sản phẩm) chưa nạp vì MES chưa có hai nhà máy này; thêm ở màn Nhà máy rồi chạy lại `load:bravo`. Sản phẩm chưa có PO trong `ThongTinPO` (phần lớn A02) chưa nạp vì chưa có ngày xuất.
- `mes_user` đang đọc thẳng được `B8R2_VIETSUN` và thiếu quyền `EXECUTE` hàm `ufn_Agg_Concat`: 4 nguồn (`vDM_KHACHHANG`, `vDM_DiaDiemGiaoHang`, `vThongTinPO`, `vThongTinPO_MauCo`) sẽ báo lỗi cho tới khi quản trị CSDL xử lý.
- `vBaoCao_OSM_XuatHang` cần linked server `DB_OSM_TRE` chưa có (chưa đưa vào đồng bộ).
