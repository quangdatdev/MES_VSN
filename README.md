# MES Vietsun

Hệ thống MES cho Vietsun (may mặc, nhiều nhà máy): Đơn hàng → Phân bổ PO → Kế hoạch xuất hàng → Tỷ lệ cắt → Xếp chuyền → Chuẩn bị SX → Cắt → May → QMS → Hoàn thiện → Báo cáo. Modular Monolith: React + NestJS + SQL Server.

## Bắt đầu

```
npm install
npm run migrate
npm run seed            # máy demo
npm run dev:backend     # http://localhost:3000/api/v1
npm run dev:frontend    # http://localhost:5173
```

Cần Node.js 22, SQL Server 2019/2022, `backend/.env` tạo từ `backend/.env.example`. Hướng dẫn đủ: [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) mục 7.

## Tài liệu

| Tài liệu | Nội dung |
|---|---|
| [AGENTS.md](AGENTS.md) | Quy tắc bắt buộc cho người và AI coding agent (`CLAUDE.md` import file này) |
| [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) | Hệ thống là gì, phạm vi, thuật ngữ, công nghệ, cài đặt |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layer, module, phụ thuộc, database, ranh giới |
| [docs/DATA_FLOWS.md](docs/DATA_FLOWS.md) | Đăng nhập, đọc ghi, xuyên module, đồng bộ |
| [docs/CODE_CONVENTIONS.md](docs/CODE_CONVENTIONS.md) | Quy ước code, database |
| [docs/ENGINEERING_STANDARDS.md](docs/ENGINEERING_STANDARDS.md) | Test, bảo mật, migration, Definition of Done |
| [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md) | Quy trình task, review, nhánh, cập nhật tài liệu |
| [docs/current/STATUS.md](docs/current/STATUS.md) | Trạng thái hiện tại, việc chờ, câu hỏi mở |
| [docs/update_docs/README.md](docs/update_docs/README.md) | Tài liệu tham chiếu theo module, vận hành, dữ liệu mẫu, quyết định |
