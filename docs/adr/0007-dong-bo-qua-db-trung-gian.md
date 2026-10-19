# ADR 0007 – Đồng bộ BRAVO qua database trung gian, chép vào MES_Sync bằng thủ tục tăng dần

**Trạng thái:** Accepted · **Ngày:** 10/10/2026 · **Phase:** 5.2 · **Nguồn:** chỉ đạo của người dùng ngày 10/10/2026, khảo sát `docs/thiet-ke/anh-xa-bravo-don-hang.html`

## Bối cảnh
- CLAUDE.md mục 3 ghi hệ thống ngoài "chỉ chạm ở lớp đồng bộ (Linked Server + Stored Procedure), chỉ đọc". Ngày 10/10/2026 người dùng chốt cụ thể hơn: **không kéo trực tiếp từ BRAVO**, chỉ đọc qua **database trung gian** do phía BRAVO quản lý (tên trong `DB_TRUNGGIAN_NAME`, hiện là `BRAVO_TRE`, chỉ có view). Database BRAVO thật (`B8R2_VIETSUN`) MES không được đọc.
- Người dùng yêu cầu: tạo bảng chứa dữ liệu kéo từ database trung gian; màn hình kiểm soát đồng bộ; nút đồng bộ truyền tham số vào stored procedure để chỉ lấy dòng có `ModifiedAt` hoặc `CreatedAt` phát sinh sau lần đồng bộ gần nhất, không đổ cả bảng.
- `mes_user` không có quyền tạo database; người dùng chọn database riêng `MES_Sync` (quản trị CSDL tạo), phạm vi đợt đầu 18 view của Đơn hàng và danh mục liên quan.

## Quyết định

### Nơi lưu
- Database **`MES_Sync`** (`DB_SYNC_NAME`): dữ liệu hệ thống dùng chung toàn công ty, không theo nhà máy, không đi qua `BaseRepository`.
  - Schema theo hệ thống nguồn: `bravo` (sau này `osm`, `gsd`). Bảng chép **giữ nguyên tên cột của view** để đối chiếu với nguồn; tên bảng là tên view bỏ chữ `v` đầu (`vDM_SanPhamDonHang` → `bravo.DM_SanPhamDonHang`). Đây là ngoại lệ có chủ đích với quy ước đặt tên ở CLAUDE.md mục 5, chỉ áp cho bảng chép.
  - Mỗi bảng chép thêm `SyncedAt` (lần cuối dòng được ghi) và `SyncRunId`.
  - `dbo.SyncSource` (danh mục nguồn, mốc dữ liệu), `dbo.SyncRun` (mỗi lần chạy: mốc dùng, số dòng, lỗi, người bấm).
- Module nghiệp vụ (ví dụ Đơn hàng) **không đọc** `MES_Sync` trực tiếp; bước đưa dữ liệu chép vào bảng nghiệp vụ (ánh xạ) làm ở phase sau, qua service công khai của lớp đồng bộ.

### Đọc nguồn
- Thủ tục chỉ đọc view qua **synonym** `bravo.src_<Bảng>` → `[<DB_TRUNGGIAN_NAME>].[dbo].[<view>]`. `npm run migrate` tạo lại synonym theo `.env`, nên đổi tên database trung gian chỉ cần sửa `.env` rồi migrate, không sửa thủ tục. Database trung gian ở máy khác (qua linked server) cần thêm tên máy vào synonym; khi đó sửa `linkSyncSources` trong `scripts/migrate.ts`.
- Tên biến `DB_TRUNGGIAN_NAME` do người dùng đặt (ngoại lệ với quy ước định danh tiếng Anh ở CLAUDE.md mục 6), giữ nguyên để khớp `.env` của người dùng.
- Cấu trúc bảng chép và thủ tục **sinh từ cấu trúc view thật** bằng `backend/scripts/sync-gen.ts`; thêm nguồn = thêm cấu hình rồi sinh migration mới.

### Chép tăng dần
- Mỗi nguồn có **mốc dữ liệu** `WatermarkAt` = `ModifiedAt`/`CreatedAt` lớn nhất đã nhận, **theo giờ của nguồn** (không phải UTC, không phải giờ bấm).
- Lần chạy tăng dần gọi `bravo.usp_Sync_<Bảng> @SinceAt = mốc − OverlapMinutes` (mặc định 10 phút) và chỉ đọc dòng có `ModifiedAt >= @SinceAt OR CreatedAt >= @SinceAt`. Lùi mốc để không sót dòng ghi trễ hoặc làm tròn (`smalldatetime`); dòng giống hệt không ghi lại nên lùi mốc không tốn ghi.
- Mốc mới không lùi, không vượt giờ hiện tại của máy chủ (dòng ghi nhầm ngày tương lai không làm các lần sau bỏ sót). Lỗi thì giữ mốc cũ.
- View không có cột thời gian dùng được (`vDM_CHINHANH`, `vDM_PhuongThucGiaoHang`; `vDM_Size` luôn ghi 01/01/1900) chép **toàn bộ mỗi lần** (vài trăm dòng).
- **Đối soát khóa** ở mỗi lần chép tăng dần (sau review 5.2): đọc thêm riêng cột khóa (hoặc cột nhóm kèm số dòng) của cả view.
  - KEY: dòng có trong bảng chép mà không còn bên nguồn thì xóa; dòng có bên nguồn mà bảng chép chưa có (ngày tháng NULL, lần trước bị sót) thì đọc thêm.
  - PARTITION: nhóm có số dòng khác bảng chép (mất dòng, dòng đổi sang nhóm khác) hoặc không còn bên nguồn thì đọc lại hoặc xóa cả nhóm.
  - Khóa NULL hoặc trùng ở bước đối soát cũng dừng, không xóa (review lượt 2). Chép tăng dần là nút bấm thường ngày nên có **chốt xóa hàng loạt**: định xóa quá 20% bảng chép và quá 100 dòng thì dừng, báo dùng "Chép lại toàn bộ" (có xác nhận).
- **Chép lại toàn bộ** (nút riêng, có xác nhận): bỏ qua mốc, đọc lại cả view. Màn hình hiện lần chép toàn bộ gần nhất của từng nguồn.
- **Giới hạn đã biết** (cần chép lại toàn bộ định kỳ để bắt):
  - cột lấy từ bảng khác trong view (tên, số tổng hợp) đổi mà `ModifiedAt` của dòng không đổi;
  - dòng có `ModifiedAt` và `CreatedAt` đều NULL: thấy khi thêm hoặc xóa (đối soát), không thấy khi sửa nội dung;
  - PARTITION: một dòng rời nhóm và một dòng khác vào cùng nhóm đó mà không đổi ngày, số dòng của nhóm giữ nguyên;
  - BRAVO ghi `ModifiedAt` theo giờ máy trạm lệch quá `OverlapMinutes` (cần xác minh với phía BRAVO).

### Khớp dòng
- **KEY** (khóa duy nhất đã kiểm trên dữ liệu thật): cập nhật dòng có cột khác, thêm dòng mới; khóa trùng hoặc thiếu khóa thì dừng, không ghi.
- **PARTITION** (view tổng hợp, không có khóa tin được: `vThongTinPO`, `vThongTinPO_MauCo`, `vBangCanDoiSanXuat_MauCo_Tong`): nhóm nào có dòng đổi hoặc lệch số dòng thì đọc lại cả nhóm, xóa nhóm cũ, chèn nhóm mới.
- So "dòng có đổi" **theo byte** (`EXCEPT` trên `VARBINARY` cho cột chuỗi, an toàn với NULL): collation không phân biệt hoa/thường sẽ bỏ sót "Nike" → "NIKE". Bảng chép và bảng tạm giữ **collation của cột nguồn** (không vỡ ký tự VARCHAR, không xung đột collation khi MES_Sync tạo với collation khác).
- Chép toàn bộ mà nguồn trả 0 dòng trong khi bảng chép đang có dữ liệu thì dừng (tránh xóa sạch khi view tạm hỏng).

### Chạy và kiểm soát
- Màn **Quản trị › Đồng bộ dữ liệu** (`admin.sync`: Xem = theo dõi, Sửa = bấm chạy). Bấm thì xếp hàng mỗi nguồn một `SyncRun` rồi trả về ngay; backend chạy lần lượt trong nền, màn hình tự tải lại khi có nguồn đang chạy. Mỗi lần bấm ghi `SysAuditLog` (`SYNC_START`).
- Mỗi nguồn tối đa một lần đang chờ/đang chạy (chỉ mục duy nhất có lọc): bấm hai lần không chép chồng.
- `dbo.usp_SyncRun_Execute` nhận việc bằng cập nhật có điều kiện và giữ **khóa ứng dụng theo nguồn** suốt lần chạy. Tiến trình MES chết giữa chừng thì phiên SQL đóng, khóa nhả, `usp_SyncRun_RecoverStale` (chạy khi khởi động và trước mỗi lần bấm) đánh dấu lần đó lỗi. Dữ liệu chép trong một transaction nên không có trạng thái nửa vời.
- Mỗi lần chép chạy trên **kết nối riêng**, giới hạn 60 phút; xong hoặc quá giờ thì đóng hẳn kết nối (phiên SQL kết thúc, transaction dở bị hủy, khóa nhả, `RecoverStale` đánh lỗi). Pool dùng cho màn hình giữ giới hạn thời gian mặc định và báo lỗi ngay khi không vào được database.

## Hệ quả
- CLAUDE.md mục 3 cập nhật: đồng bộ BRAVO qua database trung gian + stored procedure trong `MES_Sync`, không dùng linked server tới BRAVO.
- Tài khoản ứng dụng vẫn đang có quyền đọc thẳng `B8R2_VIETSUN` và thiếu quyền `EXECUTE` hàm `ufn_Agg_Concat` mà 4 view gọi (khảo sát 10/10/2026). Nguyên tắc chỉ được bảo đảm ở code; quản trị CSDL cần chọn: database trung gian chứa bảng chép (khuyên dùng) hoặc bật cross-database ownership chaining, rồi thu hồi quyền đọc BRAVO của `mes_user`. Trong lúc chờ, 4 nguồn đó báo lỗi rõ ràng trên màn hình.
- Lớp ánh xạ từ bảng chép sang `MES_Order` (đơn hàng, PO, màu cỡ) và câu hỏi nghiệp vụ trong `anh-xa-bravo-don-hang.html` làm ở bước sau của 5.2.
- Chưa có lịch tự chạy; khi cần sẽ thêm (SQL Agent hoặc bộ hẹn giờ trong backend) dùng chung `usp_SyncRun_Execute`.
