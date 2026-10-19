# Phase 0 – Chốt nền móng

**Trạng thái:** Approved (08/10/2026) · **Ước lượng:** 0,5 ngày · **Phụ thuộc:** không

## Mục tiêu
Có đủ quyết định và tài liệu để Phase 1–3 làm không phải đoán: mô hình dữ liệu demo, danh sách Role/Menu mẫu, hợp đồng API, kịch bản demo.

## Việc cần làm
| # | Task | Tiêu chí hoàn thành | Trạng thái |
|---|---|---|---|
| 0.1 | Khởi tạo repo: `CLAUDE.md`, cấu trúc thư mục, `.gitignore`, ADR | Có trong repo | Done |
| 0.2 | Chốt danh sách menu demo từ tài liệu tổng quan + file mô tả giao diện Đơn hàng | Cây menu 2 cấp, mỗi mục có mã quyền `module.resource` (`docs/thiet-ke/seed-demo.md` mục 1) | Done |
| 0.3 | Chốt Role mẫu và ma trận Role × Menu × hành động | `docs/thiet-ke/seed-demo.md` mục 3–4 | Done |
| 0.4 | Chốt danh sách nhà máy giả (≥3) và tài khoản mẫu (4 tài khoản) | `docs/thiet-ke/seed-demo.md` mục 2, 5, 6, 7 | Done |
| 0.5 | Thiết kế bảng `MES_Core` cho demo (cột, kiểu, index) | `docs/thiet-ke/db-core.md`, được duyệt trước khi viết migration | Done |
| 0.6 | Hợp đồng API (đăng nhập, chọn nhà máy, `/me/menu`, API admin) | `docs/thiet-ke/api-contract.md` | Done |
| 0.7 | Chốt công nghệ: query builder, thư viện UI, quản lý state | `docs/adr/0003-cong-nghe-demo.md` (Accepted) | Done |
| 0.8 | ~~Bản chốt dữ liệu `kien-truc-tong-quan.md`~~ | Bỏ: nội dung giữ lại đã chuyển sang `phase-5-sau-demo.md`; tài liệu BA gửi sau | Dropped |

## Bảng `MES_Core` dự kiến cho demo
`SysBranch`, `SysUser`, `SysUserBranch`, `SysRole`, `SysUserRole`, `SysResource`, `SysPermission`, `SysRolePermission`, `SysMenu`, `SysUserSession`, `SysPermissionVersion`, `SysAuditLog` (chi tiết cột ở `docs/thiet-ke/db-core.md`).
Tạo sẵn (chưa có UI): `SysFieldPolicy`, `SysUserPermissionOverride`.

## Tiêu chí review (người duyệt tick)
- [x] Cây menu khớp phạm vi trong tổng quan (Đơn hàng, Cắt, May, Hoàn thiện, QMS, Báo cáo, Quản trị)
- [x] Ma trận Role × Menu hợp lý với nghiệp vụ nhà máy
- [x] Thiết kế bảng đúng quy ước `CLAUDE.md` mục 5
- [x] Hợp đồng API đủ cho cả FE và BE làm song song
- [x] Đã quyết: có, đơn vị tổng hợp `A00` (xem tất cả, chỉ đọc)

## Không làm
Không viết code ứng dụng, không tạo database thật.

## Quyết định chốt khi duyệt (08/10/2026)
- Ma trận Role, tên Role: tiếp tục như `docs/thiet-ke/seed-demo.md`, không cần BA xác nhận; chỉ cần có màn hình để đổi tên nhà máy.
- Dữ liệu demo tự sinh, cho phép người xem tự nhập liệu; docx giao diện Đơn hàng không đào sâu (tài liệu BA gửi sau).
- Mã nhà máy `A01`, `A02`…, cấm sửa; đơn vị tổng hợp `A00` xem tất cả (chỉ đọc).
- Công nghệ theo ADR 0003; UI do AI chọn là Mantine (thân thiện, không cứng nhắc).
- Mục tiêu duy nhất của đợt này: **Demo giao diện + thể hiện được phân quyền**.
