# ADR 0001 – Kiến trúc nền tảng

**Trạng thái:** Accepted · **Ngày:** 08/10/2026

## Bối cảnh
MES Vietsun cần xây nhanh, tách khỏi GSD, về sau thêm nhiều module. Nguồn: `docs/nguon/tong-quan-du-an.md`.

## Quyết định
1. **Modular Monolith**: React + TypeScript (PWA) + NestJS + SQL Server. Module giao tiếp qua service công khai và sự kiện, không đọc bảng của nhau.
2. **Mỗi module một database** (`MES_Core`, `MES_Order`, …) để dễ nhìn và backup theo module.
3. **Phân quyền ở Backend**; giao diện chỉ ẩn/hiện.
4. **Giai đoạn Demo**: quyền chức năng theo Role × Menu × hành động + lọc dữ liệu theo nhà máy bằng cột `BranchCode`. Mô hình đích 5 lớp (xem `docs/thiet-ke/de-xuat-phuong-an-nen-tang.html`); các bảng của phần chưa làm được tạo sẵn.

## Hệ quả
- FK vật lý chỉ trong cùng database; giữa database dùng khóa ngầm + linter + script kiểm bản ghi mồ côi.
- Không có transaction chung giữa database; backup phải đồng bộ thời điểm.
- Báo cáo xuyên module gom về `MES_Report` hoặc view công bố.
