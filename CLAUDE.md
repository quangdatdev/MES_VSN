# CLAUDE.md – MES Vietsun

Quy tắc bắt buộc của repo nằm ở `AGENTS.md` (nguồn duy nhất, dùng chung cho mọi AI coding agent) và được nạp vào đây:

@AGENTS.md

## Riêng cho Claude Code

- Comment trong code trích "CLAUDE.md mục 3", "mục 4.5", "mục 4.8", "mục 5", "mục 6": đó là số mục của `AGENTS.md` ở trên.
- Skill của dự án (`.claude/skills/`):
  - `frontend-design`: **bắt buộc** khi dựng mới hoặc sửa giao diện. Hướng thiết kế đã chốt ở [13 Quyết định](docs/update_docs/13-quyet-dinh.md) mục 12 và [10 Giao diện](docs/update_docs/10-giao-dien.md) là "brief" và luôn thắng gợi ý của skill; không tự đổi màu, font, bố cục.
  - `senior-architect`: khi cần quyết định kỹ thuật, so sánh phương án, vẽ sơ đồ. Ràng buộc đã chốt của MES (SQL Server, NestJS, mỗi module một database, `BaseRepository`) thắng nội dung chung của skill.
  - `react-best-practices`: khi rà, tối ưu hiệu năng frontend. Phần Next.js, Server Components, SWR không áp dụng (ứng dụng Vite một trang, TanStack Query).
- Agent `code-reviewer` (`.claude/agents/code-reviewer.md`): khi nào chạy, checklist của MES, mức chặn, mẫu báo cáo ở [DEVELOPMENT_WORKFLOW](docs/DEVELOPMENT_WORKFLOW.md) mục 3. Agent đang khai cả `Write`, `Edit`: mỗi lần gọi phải yêu cầu chỉ đọc.
