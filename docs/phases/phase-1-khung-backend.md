# Phase 1 – Khung backend, đăng nhập, chọn nhà máy

**Trạng thái:** Approved (09/10/2026) · **Ước lượng:** 0,75 ngày · **Phụ thuộc:** Phase 0 (đã duyệt)

## Mục tiêu
Backend NestJS chạy được, có database `MES_Core`, đăng nhập và chọn nhà máy (kể cả đơn vị tổng hợp `A00`); token mang `BranchCode`; API trả menu theo quyền. Theo `docs/thiet-ke/db-core.md` và `docs/thiet-ke/api-contract.md`.

## Việc cần làm
| # | Task | Tiêu chí hoàn thành | Trạng thái |
|---|---|---|---|
| 1.1 | Dựng NestJS + TypeScript strict, `.env`/`.env.example`, lint, test (npm workspaces) | `npm run dev:backend` chạy, test mẫu qua | Done |
| 1.2 | Kết nối SQL Server bằng Kysely; runner migration `.sql` theo từng database | Chạy migration `MES_Core` trên máy dev | Done |
| 1.3 | Migration + seed `MES_Core`: 4 nhà máy (`A00` tổng hợp, `A01–A03`), 5 Role, 27 tài nguyên/135 quyền, menu, ma trận Role–quyền, 4 tài khoản (mật khẩu từ `DEMO_PASSWORD`) | Seed khớp `docs/thiet-ke/seed-demo.md` | Done |
| 1.4 | Auth: đăng nhập (argon2id), token tạm + access token ngắn hạn + refresh (cookie HttpOnly) | Sai mật khẩu bị từ chối; khóa tạm sau N lần sai | Done |
| 1.5 | `select-branch`: kiểm `SysUserBranch`, cấp token có `BranchCode`, trả `isAggregate` | Chọn nhà máy không được phép ⇒ 403 | Done |
| 1.6 | `PermissionGuard` + `@RequirePermission` | Test: không quyền ⇒ 403; endpoint không khai báo ⇒ 403 `ENDPOINT_NOT_DECLARED` (kiểm lúc chạy, có test; chưa có kiểm tĩnh trong CI) | Done |
| 1.7 | `/me`, `/me/menu`, `/me/permissions`, header `X-Permission-Version` | Trả đúng theo Role | Done |
| 1.8 | Ghi `SysAuditLog` cho đăng nhập, đổi nhà máy | Có bản ghi sau mỗi thao tác | Done |
| 1.9 | Khung `softkeys.json` (có `ownerModule`) | `backend/migrations/softkeys.json`, có dòng mẫu (linter/script mồ côi làm ở Phase 3) | Done |

## Tiêu chí review
- [ ] Chạy được từ đầu theo hướng dẫn
- [ ] Token có `BranchCode`, client không ép được nhà máy khác; `A00` chỉ chọn được khi được gán
- [ ] Deny by default được chứng minh bằng test
- [ ] Migration đúng thư mục database, đúng quy ước đặt tên
- [ ] Không có bí mật trong repo

## Không làm
Phân quyền theo cột, ngoại lệ user, đồng bộ hệ thống ngoài, realtime, module nghiệp vụ, API quản trị và dữ liệu PO (Phase 3).

## Rủi ro
SQL Server trên máy dev/UAT chưa sẵn ⇒ dùng bản Developer hoặc container để không bị chặn; cần đầu mối hạ tầng sớm.

## Kết quả (đã chạy thật trên SQL Server máy dev)
- Database `MES_Core` mới tạo trên SQL Server Express (`DESKTOP-ENV2QGO\SQLEXPRESS`); database `MES_DEMO` có sẵn của bạn **không bị động tới**.
- Migration `0001_init.sql`: 14 bảng; seed: 4 nhà máy, 5 vai trò, 27 tài nguyên, 135 quyền, 34 mục menu, 164 dòng gán quyền, 4 tài khoản.
- 16 test tích hợp qua (`npm test -w backend`), lint sạch, build qua.
- Bổ sung ngoài hợp đồng ban đầu: `GET /me/branches` (để đổi nhà máy); trigger chặn sửa `SysBranch.Code` và chặn sửa/xóa `SysAuditLog`.
- Khóa phiên bản: NestJS 11, Kysely 0.28, TypeScript 5.9 (NestJS 12 và Kysely 0.29 chỉ hỗ trợ ESM, làm Jest/tooling phức tạp).
- `backend/.env` được thêm `JWT_SECRET` (ngẫu nhiên) và `DEMO_PASSWORD`; các dòng cũ giữ nguyên.
