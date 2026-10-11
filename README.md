# MES Vietsun

Hệ thống MES (Kế hoạch → Cắt → May → Endline → Hoàn thiện). Modular Monolith: React PWA + NestJS + SQL Server.

- Quy ước làm việc: [CLAUDE.md](CLAUDE.md)
- Kế hoạch và trạng thái các phase: [docs/phases/README.md](docs/phases/README.md)
- Tổng quan: [docs/nguon/tong-quan-du-an.md](docs/nguon/tong-quan-du-an.md)
- Phương án nền tảng: [docs/thiet-ke/de-xuat-phuong-an-nen-tang.html](docs/thiet-ke/de-xuat-phuong-an-nen-tang.html)
- Sơ đồ kiến trúc (xem bằng trình duyệt): [docs/thiet-ke/so-do-kien-truc.html](docs/thiet-ke/so-do-kien-truc.html)
- Quyết định kiến trúc: [docs/adr/](docs/adr/)

## Trạng thái
Phase 0–3 đã duyệt. Phase 4 (hoàn thiện demo) còn lượt review code bằng agent `code-reviewer`. Kịch bản demo: [docs/kich-ban-demo.md](docs/kich-ban-demo.md); tóm tắt cho lãnh đạo: [docs/tom-tat-demo.md](docs/tom-tat-demo.md).

## Cài đặt lần đầu (Windows)
Cần: Node.js 22, SQL Server 2019/2022 (Express cũng được) có đăng nhập bằng tài khoản SQL.

1. Tạo `backend/.env` từ `backend/.env.example` và điền:
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`: kết nối SQL Server.
   - `DB_CORE_NAME` (mặc định `MES_Core`) và `DB_ORDER_NAME` (module Đơn hàng, mặc định `MES_Order`). Lệnh migrate tự tạo database nếu chưa có.
   - `JWT_SECRET`: chuỗi ngẫu nhiên dài, giữ bí mật.
   - `DEMO_PASSWORD`: mật khẩu chung cho các tài khoản demo (chỉ dùng cho dữ liệu giả).
2. `npm install`
3. `npm run migrate` rồi `npm run seed`

## Chạy khi phát triển
`npm run dev:backend` và `npm run dev:frontend` (hai cửa sổ), mở http://localhost:5173.

## Chạy bản demo (một địa chỉ, mở được từ điện thoại)
1. `npm run reset:demo -- --yes`: đưa dữ liệu demo về ban đầu (xóa dữ liệu Đơn hàng nhập thử và sinh lại, đặt lại quyền, phạm vi, ngoại lệ, chính sách cột, tên nhà máy, mật khẩu demo). Chỉ chạy với SQL Server trên chính máy này; database ở máy khác bị từ chối trừ khi thêm `--allow-remote-db`.
2. `npm run demo`: build rồi chạy ở cổng `PORT` (mặc định 3000). Màn hình in địa chỉ `http://<IP máy>:3000` để mở từ máy khác.

### Mở từ điện thoại
- Điện thoại và máy demo cùng mạng Wi-Fi/LAN.
- Nếu không vào được, mở cổng trên tường lửa Windows (PowerShell chạy quyền Administrator):
  `New-NetFirewallRule -DisplayName "MES demo" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow`
- Bản demo chạy HTTP trong mạng nội bộ nên để `COOKIE_SECURE=false` (mặc định khi không đặt `NODE_ENV=production`). Cài như ứng dụng (PWA) và chạy chính thức cần HTTPS: làm ở giai đoạn triển khai.

## Tài khoản demo
`admin`, `giamdoc`, `kehoach.a`, `truongchuyen.a`, `truongchuyen.b`, `ketoan`; mật khẩu là `DEMO_PASSWORD`. Nhà máy, phạm vi, ngoại lệ của từng tài khoản: [docs/thiet-ke/seed-demo.md](docs/thiet-ke/seed-demo.md). Tình huống kiểm thử phân quyền: [docs/kich-ban-demo.md](docs/kich-ban-demo.md), mục "Kiểm thử phân quyền".

## Kiểm tra
`npm run lint`, `npm test` (test backend chạy trên database thật nên cần migrate + seed trước; chạy xong nên `npm run reset:demo -- --yes`), `npm run build`.

## Cấu trúc
```
backend/    NestJS (platform + modules + migrations)
frontend/   React + Vite (shell + modules)
docs/       nguon/ (tài liệu đầu vào) · thiet-ke/ · adr/ · phases/
.claude/    skills của dự án (frontend-design, senior-architect)
```
