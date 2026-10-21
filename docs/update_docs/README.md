# Tài liệu tham chiếu theo module

Lớp tài liệu chính thức là [AGENTS.md](../../AGENTS.md) và các file ở `docs/`: [PROJECT_OVERVIEW](../PROJECT_OVERVIEW.md), [ARCHITECTURE](../ARCHITECTURE.md), [DATA_FLOWS](../DATA_FLOWS.md), [CODE_CONVENTIONS](../CODE_CONVENTIONS.md), [ENGINEERING_STANDARDS](../ENGINEERING_STANDARDS.md), [DEVELOPMENT_WORKFLOW](../DEVELOPMENT_WORKFLOW.md); trạng thái ở [docs/current/STATUS.md](../current/STATUS.md). Thư mục này giữ tài liệu chi tiết theo module, vận hành, dữ liệu mẫu và quyết định kiến trúc, làm tham chiếu cho lớp chính thức. Tài liệu nào sở hữu thông tin nào: [DEVELOPMENT_WORKFLOW](../DEVELOPMENT_WORKFLOW.md) mục 6.

## Mục lục

| File | Nội dung |
|---|---|
| [04-phan-quyen.md](04-phan-quyen.md) | Đăng nhập, phiên, ĐVCS và `A00`, 5 lớp phân quyền, `BaseRepository`, phạm vi, chính sách cột, ngoại lệ, trần quyền, vai trò Toàn quyền, nhật ký, mã lỗi, API `/auth`, bảng phân quyền `MES_Core` |
| [05-quan-tri-he-thong.md](05-quan-tri-he-thong.md) | Màn Quản trị, API `/admin/*`, `/admin/catalogs/*`, `/me`, bảng danh mục `MES_Core`, Lịch làm việc |
| [06-don-hang.md](06-don-hang.md) | Module Đơn hàng: màn, luật, API `/order`, bảng `MES_Order`, nạp đơn hàng BRAVO, dàn chuyền mô phỏng, Giá CM |
| [07-may.md](07-may.md) | Module May: Kế hoạch chuẩn bị SX, Cấu hình chuẩn bị SX, Kế hoạch may, API `/sewing`, bảng `MES_Sewing` |
| [08-nhan-su.md](08-nhan-su.md) | Module Nhân sự: Sơ đồ tổ chức, chuyền may, Thông tin nhân sự, nhập Excel, Loại phòng ban, API `/hr`, bảng `MES_Hr` |
| [09-dong-bo.md](09-dong-bo.md) | Đồng bộ BRAVO, OSM vào `MES_Sync`, thủ tục chép, màn Đồng bộ dữ liệu, API `/admin/sync`, thêm nguồn |
| [10-giao-dien.md](10-giao-dien.md) | Khung frontend, thành phần dùng chung, gọi API, quy tắc UI/UX, quy tắc hiệu năng, theme |
| [11-van-hanh.md](11-van-hanh.md) | Cài đặt, biến môi trường, lệnh, migrate, seed, script, triển khai máy chủ, sự cố |
| [12-du-lieu-mau-va-kiem-thu.md](12-du-lieu-mau-va-kiem-thu.md) | Dữ liệu seed, vai trò và ma trận quyền mẫu, tài khoản demo, kịch bản demo, kiểm thử tay, danh sách file test |
| [13-quyet-dinh.md](13-quyet-dinh.md) | Quyết định kiến trúc đang hiệu lực (căn cứ cho quy tắc); bảng tra ADR cho comment còn trích ADR trong migration đã chạy |
| [15-cat.md](15-cat.md) | Module Cắt: Đồng bộ tiến độ cắt, Xác nhận cấp BTP, API `/cutting`, bảng `MES_Cutting` |

Tên file giữ số thứ tự cũ: code trỏ tới một số file (ví dụ `11-van-hanh.md`); Tech Lead 21/10/2026 chốt không đổi tên (bỏ task T5).

## Tài liệu khác trong `docs/`

| Tài liệu | Vai trò |
|---|---|
| `docs/review/phase-*.md`, `hieu-nang-frontend.md`, `man-dang-nhap.md`, `trien-khai-khong-gian-doan.md` | Báo cáo review từng lượt (lịch sử); báo cáo mới ghi ở `docs/review/phase-<số>.md` theo [DEVELOPMENT_WORKFLOW](../DEVELOPMENT_WORKFLOW.md) mục 3 |
| `docs/thiet-ke/anh-xa-bravo-don-hang.html` | Câu hỏi gửi BA về ánh xạ đơn hàng BRAVO, giữ tới khi BA trả lời |
| `docs/thiet-ke/de-xuat-metadata-driven.html` | Đề xuất chưa duyệt (Q7 ở [STATUS](../current/STATUS.md)) |
| `docs/nguon/tong-quan-du-an.md` | Tài liệu đầu vào: đề xuất tổng quan dự án 08/10/2026, không sửa |
| `docs/nguon/yeu-cau/mau-mo-ta-yeu-cau.html` | Mẫu mô tả yêu cầu cho BA |
| `docs/nguon/ba/` | File đầu vào của BA, Tech Lead đưa dần vào |
| `docs/screens/*` | Ảnh mẫu giao diện người dùng gửi |
| `docs/tich-hop/*` | Hướng dẫn gọi API của MES cho lập trình viên hệ thống khác (chiều ra, [13](13-quyet-dinh.md) mục 8.6): `api-dong-bo-dan-chuyen.md` |
| `docs/DOCS_STANDARDIZATION_PLAN.md` | Kế hoạch chuẩn hóa tài liệu |

## Tài liệu đã xóa (19/10/2026)

Đã xóa sau khi chuyển nội dung còn hiệu lực. Bản gốc lấy lại bằng `git show 98d19db:<đường dẫn>`. Comment trong code đã đổi sang tài liệu thay thế (task T1, 21/10/2026); riêng migration đã chạy không sửa nên còn trích các file này. Bảng dưới cho biết đọc ở đâu thay thế.

| Tài liệu đã xóa | Đọc thay ở |
|---|---|
| `docs/update_docs/01-tong-quan.md` | [PROJECT_OVERVIEW](../PROJECT_OVERVIEW.md) |
| `docs/update_docs/02-trang-thai.md` | [STATUS](../current/STATUS.md) |
| `docs/update_docs/03-kien-truc.md` | [ARCHITECTURE](../ARCHITECTURE.md) (database, migration, khóa ngầm, ranh giới), [CODE_CONVENTIONS](../CODE_CONVENTIONS.md) (quy ước) |
| `docs/update_docs/14-quy-trinh-lam-viec.md` | [AGENTS.md](../../AGENTS.md), [DEVELOPMENT_WORKFLOW](../DEVELOPMENT_WORKFLOW.md), [ENGINEERING_STANDARDS](../ENGINEERING_STANDARDS.md), [CLAUDE.md](../../CLAUDE.md) |
| `docs/adr/0001`–`0014` ("ADR 00xx mục …" trong comment của migration đã chạy) | [13-quyet-dinh.md](13-quyet-dinh.md), bảng tra ADR cuối file |
| `docs/phases/*.md` (gồm kế hoạch `sheetgrid-ban-dong.md`) | [STATUS](../current/STATUS.md) (trạng thái, việc chờ); quyết định ở [13](13-quyet-dinh.md) |
| `docs/thiet-ke/api-contract.md` | [ARCHITECTURE](../ARCHITECTURE.md) mục 5.1 (contract chung); mục API của 04–09, 15 |
| `docs/thiet-ke/db-core.md` | [04](04-phan-quyen.md) mục 16, [05](05-quan-tri-he-thong.md) |
| `docs/thiet-ke/db-order.md`, `db-sewing.md`, `db-hr.md`, `db-sync.md` | [06](06-don-hang.md), [07](07-may.md), [08](08-nhan-su.md), [09](09-dong-bo.md) |
| `docs/thiet-ke/seed-demo.md` | [12](12-du-lieu-mau-va-kiem-thu.md) |
| `docs/thiet-ke/quy-tac-ui-ux.md` | [10](10-giao-dien.md) mục 12, 13 |
| `docs/thiet-ke/so-do-kien-truc.html`, `de-xuat-phuong-an-nen-tang.html`, `cai-dat-windows-server.html` | [ARCHITECTURE](../ARCHITECTURE.md), [04](04-phan-quyen.md), [11](11-van-hanh.md) |
| `docs/review/README.md` | [DEVELOPMENT_WORKFLOW](../DEVELOPMENT_WORKFLOW.md) mục 3, [ENGINEERING_STANDARDS](../ENGINEERING_STANDARDS.md) mục 3 |
| `docs/yeu-cau.md` | `docs/nguon/yeu-cau/mau-mo-ta-yeu-cau.html` (cùng mẫu) |
| `docs/bao-cao/ban-do-mes-vietsun.html` | [STATUS](../current/STATUS.md) (ảnh chụp trạng thái 13–14/10/2026, không còn dùng) |
