# Tài liệu MES Vietsun

Bộ tài liệu viết lại theo **mã nguồn hiện tại** (12/10/2026), thay cho các tài liệu cũ bị sửa chồng nhiều lần trong `docs/`. Mỗi thông tin chỉ nằm ở một file; file khác cần thì dẫn link.

## Đọc theo thứ tự nào

| Bạn là | Đọc |
|---|---|
| Người mới vào dự án | 01 → 03 → 04 → tài liệu module đang làm → 14 |
| Người cài, vận hành máy chủ | 11, rồi 02 (việc còn chờ trên máy chủ) |
| Người làm màn hình | 10, tài liệu module, 04 (phần chính sách cột) |
| Người trình demo, kiểm thử phân quyền | 12 |
| Bắt đầu mỗi phiên làm việc | 02 |

## Mục lục

| File | Nội dung |
|---|---|
| [01-tong-quan.md](01-tong-quan.md) | Hệ thống là gì, menu và màn hình đã có, hệ thống ngoài, phần chưa làm, **thuật ngữ** |
| [02-trang-thai.md](02-trang-thai.md) | Trạng thái từng phase, việc còn phải làm trên máy chủ, câu hỏi chờ người dùng và BA |
| [03-kien-truc.md](03-kien-truc.md) | Thành phần, cấu trúc thư mục, đường đi của một request, ranh giới module, danh sách database và migration, khóa ngầm, quy ước code và database |
| [04-phan-quyen.md](04-phan-quyen.md) | Đăng nhập, phiên, ĐVCS và `A00`, 5 lớp phân quyền, `BaseRepository`, phạm vi, chính sách cột, ngoại lệ, trần quyền quản trị, vai trò Toàn quyền, nhật ký, mã lỗi, API `/auth`, bảng phân quyền của `MES_Core` |
| [05-quan-tri-he-thong.md](05-quan-tri-he-thong.md) | Các màn Quản trị, API `/admin/*` (kể cả `/admin/catalogs/*`), `/me`, bảng danh mục của `MES_Core` |
| [06-don-hang.md](06-don-hang.md) | Module Đơn hàng: màn hình, luật nghiệp vụ, API `/order`, bảng `MES_Order`, nạp đơn hàng từ BRAVO, dàn chuyền mô phỏng |
| [07-may.md](07-may.md) | Module May: Kế hoạch chuẩn bị SX, Cấu hình chuẩn bị SX, API `/sewing`, bảng `MES_Sewing` |
| [08-nhan-su.md](08-nhan-su.md) | Module Nhân sự: Sơ đồ tổ chức, Thông tin nhân sự, nhập Excel, Loại phòng ban, API `/hr`, bảng `MES_Hr` |
| [09-dong-bo.md](09-dong-bo.md) | Đồng bộ BRAVO, OSM vào `MES_Sync`, thủ tục chép, màn Đồng bộ dữ liệu, API `/admin/sync`, thêm nguồn mới |
| [10-giao-dien.md](10-giao-dien.md) | Khung frontend, thành phần dùng chung, gọi API, quy tắc UI/UX, quy tắc hiệu năng, theme |
| [11-van-hanh.md](11-van-hanh.md) | Cài đặt, biến môi trường, lệnh, migrate, seed, script, triển khai máy chủ, xử lý sự cố |
| [12-du-lieu-mau-va-kiem-thu.md](12-du-lieu-mau-va-kiem-thu.md) | Dữ liệu seed, vai trò và ma trận quyền mẫu, tài khoản demo, kịch bản demo, cách chạy test |
| [13-quyet-dinh.md](13-quyet-dinh.md) | Các quyết định kiến trúc đang hiệu lực (gộp ADR 0001–0014) |
| [15-cat.md](15-cat.md) | Module Cắt: Đồng bộ tiến độ cắt, chép kế hoạch xuất hàng, chặn xóa kế hoạch có số cắt; Xác nhận cấp BTP (lệnh cấp, số lệnh, chặn giảm phân bổ dưới số đã cấp); API `/cutting`, bảng `MES_Cutting` |
| [14-quy-trinh-lam-viec.md](14-quy-trinh-lam-viec.md) | Làm việc theo phase, review code, định nghĩa "xong", an toàn khi dùng AI, **đổi gì thì sửa file nào** |

## Giữ bộ tài liệu gọn

- Đổi code thì sửa đúng một file sở hữu thông tin đó (bảng ở [Quy trình làm việc](14-quy-trinh-lam-viec.md)). Không chép cùng nội dung sang file khác.
- Viết trạng thái hiện tại. Lịch sử thay đổi đã có ở git; trạng thái, việc chờ chỉ ghi ở [02-trang-thai.md](02-trang-thai.md).
- Quyết định kiến trúc mới: thêm mục vào [13-quyet-dinh.md](13-quyet-dinh.md) (ghi lý do, hệ quả), sửa tài liệu khối liên quan.

## Tài liệu cũ: thay bằng gì

Bảng này để dọn `docs/`. "Thay hết" là nội dung đã chuyển sang bộ mới, file cũ có thể bỏ hoặc đưa vào lưu trữ. "Giữ" là tài liệu đầu vào hoặc bản đề xuất, không viết lại.

| Tài liệu cũ | Thay bằng | Ghi chú |
|---|---|---|
| `CLAUDE.md` | – | Giữ, đã rút gọn (12/10/2026): kế hoạch tổng quan, quy tắc bắt buộc, lệnh dùng hằng ngày, dẫn sang `docs/update_docs` |
| `docs/thiet-ke/de-xuat-phuong-an-nen-tang.html` | 04, 13 | Thay hết; phần "thiết kế sẵn, làm sau" đã ghi ở 01 mục Chưa có |
| `docs/thiet-ke/so-do-kien-truc.html` | 03 | Thay hết |
| `docs/thiet-ke/db-core.md` | 04 (bảng phân quyền), 05 (bảng danh mục) | Thay hết |
| `docs/thiet-ke/db-order.md` | 06 | Thay hết |
| `docs/thiet-ke/db-sewing.md` | 07 | Thay hết |
| `docs/thiet-ke/db-hr.md` | 08 | Thay hết |
| `docs/thiet-ke/db-sync.md` | 09 | Thay hết |
| `docs/thiet-ke/api-contract.md` | 04 (`/auth`), 05 (`/admin`, `/admin/catalogs`, `/me`), 06, 07, 08, 09 | Thay hết |
| `docs/thiet-ke/seed-demo.md` | 12 | Thay hết |
| `docs/thiet-ke/quy-tac-ui-ux.md` | 10 | Thay hết |
| `docs/thiet-ke/cai-dat-windows-server.html` | 11 | Thay hết |
| `docs/thiet-ke/anh-xa-bravo-don-hang.html` | 06 (ánh xạ đang chạy), 02 (câu hỏi BA) | Giữ làm danh sách câu hỏi gửi BA tới khi BA trả lời |
| `docs/thiet-ke/de-xuat-metadata-driven.html` | – | Giữ: bản đề xuất chưa duyệt (02, Q7) |
| `docs/adr/0001`–`0014` | 13 | Nội dung đang hiệu lực đã gộp; ADR cũ có thể đưa vào lưu trữ |
| `docs/phases/*.md` | 02 (trạng thái, việc chờ), 14 (quy trình) | Phần lịch sử, nhật ký review không chuyển |
| `docs/review/README.md` | 14 | Thay hết |
| `docs/review/phase-*.md`, `hieu-nang-frontend.md`, `man-dang-nhap.md` | – | Báo cáo review từng lượt, chỉ còn giá trị lịch sử. Quy tắc rút ra đã vào 10, 14 |
| `docs/kich-ban-demo.md`, `docs/tom-tat-demo.md` | 12 | Thay hết |
| `docs/nguon/*` | – | Giữ: tài liệu đầu vào (tổng quan dự án, mô tả giao diện của BA, file mẫu, ảnh mẫu) |
| `docs/bao-cao/*`, `docs/screens/*` | – | Giữ hoặc lưu trữ: báo cáo tiến độ, ảnh chụp màn hình |
