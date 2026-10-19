# Phase 5 – Sau demo (lộ trình, sẽ chia nhỏ khi bắt đầu)

**Trạng thái:** In progress (09/10/2026, bắt đầu từ 5.1) · **Phụ thuộc:** Demo được duyệt; có tài khoản AI nâng cấp (theo mục tiêu demo)

Phase này sẽ được tách thành các phase con khi bắt đầu, có file riêng và checklist review như trên. Khung dự kiến, bám lộ trình 8 tuần trong `docs/nguon/tong-quan-du-an.md`:

| Phase con | Nội dung | Ghi chú |
|---|---|---|
| [5.1 Nâng phân quyền](phase-5-1-nang-phan-quyen.md) | Ẩn/che/chỉ đọc theo cột, ngoại lệ theo user, phạm vi theo chuyền, audit đầy đủ, ma trận test | **Ready for review** (còn rate limit, refresh token của 5.1.6) |
| 5.2 Đồng bộ dữ liệu | BRAVO qua database trung gian (không đọc thẳng BRAVO), stored procedure chép tăng dần vào `MES_Sync`, màn Đồng bộ dữ liệu (ADR 0007); OSM/GSD sau | Hoãn 09/10/2026; **làm lại từ 10/10/2026** theo chỉ đạo, xem `phase-5-2-dong-bo.md` |
| [5.3 Module Đơn hàng](phase-5-3-module-don-hang.md) | 5 màn theo mô tả của BA: Thông tin đơn hàng, Kế hoạch xuất hàng, Cập nhật tỷ lệ cắt, Xếp chuyền, Phân bổ màu cỡ | **Ready for review** (dữ liệu giả, chưa đồng bộ; ADR 0006) |
| 5.4 Cắt | Ghi nhận sản lượng, cấp BTP, in thêu | |
| 5.5 May + Mobile | Phân cụm, bấm năng suất, WebSocket realtime | |
| 5.6 Endline / QMS | Danh mục lỗi, kiểm Endline | |
| 5.7 Hoàn thiện + Báo cáo | Gấp xếp, đóng thùng, báo cáo cốt lõi | |
| 5.8 Ổn định & triển khai | Hiệu năng, sao lưu/phục hồi, runbook, VPN/Wifi Site-to-Site | |

Việc hoãn từ review Phase 1–4 (`docs/review/phase-1-4.md`):
- **5.1:** rate limit đăng nhập/refresh (#7); phát hiện dùng lại refresh token và hạn tuyệt đối (#8); cache quyền theo `ValidTo` (#23); IP trong audit qua interceptor (#36); migration `0002` thêm index `SysAuditLog(UserId)` và ràng buộc một đơn vị tổng hợp (#38).
- **5.8, bắt buộc trước UAT:** tách login DB của ứng dụng và migration, `DENY UPDATE, DELETE` trên `SysAuditLog` (#39); `DB_ENCRYPT` theo môi trường (#27).
- **Khi làm module đầu tiên:** gói `shared` cho kiểu dữ liệu (#50); bắt lỗi unique trả 409 (#34); bỏ `as any` bằng kiểu cột nullable (#37); checksum migration (#40).

Điều kiện đầu vào cho mỗi module: tài liệu BA đầy đủ (công thức, tiêu chí nghiệm thu) bàn giao trước ít nhất 1 tuần.

Mỗi phase con kết thúc bằng một lượt `code-reviewer` (`docs/review/README.md`); 5.1, 5.2 và 5.8 thêm một lượt review riêng về bảo mật vì chạm phân quyền, kết nối hệ thống ngoài và máy chủ chính thức. Ước lượng mỗi phase con cộng thêm khoảng 0,25 ngày cho review và sửa.

## Quyết định cần chốt trước khi bắt đầu từng nhóm
(Chuyển từ bản nháp `kien-truc-tong-quan.md` đã bỏ; tài liệu BA sẽ gửi sau.)

| Vấn đề | Chốt trước | Đề xuất | Người quyết |
|---|---|---|---|
| Quy tắc ưu tiên khi BRAVO và OSM khác nhau | 5.2 | Theo tài liệu BA | BA + đầu mối BRAVO/OSM |
| "OSM (database)" có phải CSDL SharePoint không (không được đọc trực tiếp) | 5.2 | Chỉ đọc qua bảng/view trung gian được chỉ định | Đầu mối OSM |
| Tầng ghi vết bảng nghiệp vụ: trigger database hay tầng ứng dụng | 5.3 | Trigger cho bảng sản lượng dùng để quản trị; đổi sau là viết lại | Dev Lead |
| Lưu phiên bản dữ liệu chuẩn (định mức, sơ đồ chuyền) cho từng PO/lệnh | 5.3 | Lưu phiên bản đã dùng; định mức đổi không đổi lịch sử | BA + Dev Lead |
| Nhật ký đọc dữ liệu nhạy cảm (đơn giá, doanh thu) | 5.1 | Bảng riêng, chỉ ghi thêm | Ban lãnh đạo / Dev Lead |
| Khóa ngoại vật lý trong từng database nghiệp vụ | trước DDL mỗi module | Có trong cùng database; giữa database là khóa ngầm + linter + script mồ côi | Dev Lead |
| Server Production: Win10 hay Windows Server/Linux | trước UAT | Không dùng Win10 (hết hỗ trợ 10/2025) | Đầu mối hạ tầng |
| Từ điển chỉ số (sản lượng cắt, tỷ lệ cắt, năng suất cụm, cân bằng chuyền, DHU, tiến độ, doanh thu) | từng module | Mỗi chỉ số tính ở một tầng duy nhất; công thức do BA chốt | BA |

Nguyên tắc sở hữu dữ liệu: mỗi bảng đúng **một** module được ghi; module khác chỉ đọc qua service hoặc view công bố. Dữ liệu từ BRAVO/OSM/GSD do lớp đồng bộ ghi. Khai báo `ownerModule` trong `softkeys.json`.
