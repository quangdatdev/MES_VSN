# ADR 0003 – Lựa chọn công nghệ cho Demo

**Trạng thái:** Accepted (08/10/2026; phần UI do AI chọn theo yêu cầu "thân thiện, không khô cứng") · **Ngày:** 08/10/2026

Mục tiêu chọn: nhanh cho Demo 2 ngày nhưng không phải làm lại khi lên nền tảng đầy đủ. Mỗi lựa chọn có lý do và đường lui.

| Hạng mục | Đề xuất | Lý do | Ghi chú / đường lui |
|---|---|---|---|
| Quản lý repo | npm workspaces (`backend`, `frontend`) | Đơn giản, không thêm công cụ | Chuyển pnpm/turbo sau nếu cần |
| Truy cập dữ liệu | **Kysely** + dialect MSSQL (tedious) | Query builder có kiểu; dễ chèn điều kiện `BranchCode` ở một chỗ (`BaseRepository`); vẫn viết T-SQL khi cần | Không dùng ORM nặng vì khó đảm bảo mọi truy vấn đi qua một cổng |
| Migration | **File `.sql` có version** trong `backend/migrations/<Database>/`, chạy bằng runner nhỏ, lịch sử lưu ở bảng `__MigrationHistory` của từng database | T-SQL thuần dễ review; khớp quy tắc "AI chỉ tạo file, người duyệt và chạy" | Runner chỉ chạy khi người dùng gọi lệnh, không tự chạy lúc khởi động |
| Mật khẩu | argon2id | Chuẩn hiện hành | Cần gói có bản dựng sẵn cho Windows; nếu vướng thì dùng bcrypt |
| Token | `@nestjs/jwt`; access ngắn hạn + refresh lưu hash trong `SysUserSession` | Thu hồi được phiên | Chi tiết ở `docs/thiet-ke/api-contract.md` |
| Kiểm tra dữ liệu vào | `class-validator` + `class-transformer` | Chuẩn của NestJS | |
| Test backend | Jest + supertest (test ma trận phân quyền ở mức API) | Phân quyền và lọc `BranchCode` bắt buộc có test | Cần SQL Server thật cho test tích hợp |
| UI | **Mantine 7** + `mantine-datatable` + Tabler Icons, locale tiếng Việt | Giao diện mặc định đã mềm mại (bo góc, đổ bóng nhẹ, hiệu ứng chuyển), có sẵn dark mode, bảng, form, modal, thông báo, Spotlight (Ctrl+K tìm menu), date picker; ít "cảm giác template" hơn Ant Design và nhanh hơn dựng shadcn từ đầu | Tùy biến theme (màu thương hiệu, font, bo góc) trong một file; đường lui: shadcn/ui nếu cần thiết kế riêng hoàn toàn |
| Font | Be Vietnam Pro (gói `@fontsource`, tự host) | Hiển thị dấu tiếng Việt đẹp; không phụ thuộc Internet trong mạng nhà máy | |
| Trải nghiệm | Skeleton khi tải, trạng thái rỗng có hướng dẫn, toast phản hồi, xác nhận khi xóa, phím tắt, hiệu ứng chuyển nhẹ | Tránh cảm giác khô cứng | Dùng skill `frontend-design` khi dựng Phase 2 |
| Dữ liệu từ server (FE) | TanStack Query | Cache theo `permissionVersion`, xử lý tải/lỗi | |
| Trạng thái phiên (FE) | Zustand | Nhỏ gọn; chỉ giữ user/nhà máy/quyền | |
| Router (FE) | React Router, route lazy theo module | | |
| PWA | `vite-plugin-pwa` (manifest + service worker tối thiểu) | Cài lên màn hình điện thoại | HTTPS bắt buộc khi cài; Demo trong mạng nội bộ cần chứng chỉ nội bộ |
| Test FE | Vitest + Testing Library cho `Can`/guard route | | |
| SQL Server dev | SQL Server Developer hoặc container; 4 database: `MES_Core`, `MES_Demo` (+ 2 database test) | Khớp quyết định tách database | Cần đầu mối hạ tầng nếu dùng server chung |
| Lint ranh giới module | `eslint-plugin-boundaries` hoặc tương đương | Module không import module khác | |

## Hệ quả
- Phase 1 chỉ cài các gói trên, không thêm thư viện lớn khác khi chưa ghi vào ADR này.
- Nếu Dev Lead muốn thay (ví dụ TypeORM thay Kysely), phải sửa ADR và `CLAUDE.md` trước khi viết code, vì `BaseRepository` phụ thuộc lựa chọn này.

## Cập nhật khi dựng Phase 1–2 (09/10/2026)
- NestJS khóa ở **11** và Kysely ở **0.28** (CommonJS): bản mới hơn (NestJS 12, Kysely 0.29) chỉ hỗ trợ ESM, làm Jest và công cụ phức tạp hơn mà Demo không cần.
- TypeScript khóa ở **5.9** (ts-jest chưa dùng được với TypeScript 7).
- Mantine thực tế là **9.x** (cùng họ API với 7), React 19, Vite 8, React Router 7. Không dùng `vite-plugin-pwa`: Phase 2 chỉ có manifest.
- Mật khẩu: argon2id chạy được trên Windows, không cần bcrypt.

## Đổi phong cách giao diện (08/10/2026)
- Theo mẫu của khách `docs/nguon/giaodien.html`: thanh icon tối bên trái (nhóm chức năng), thanh trên 44px, **menu con là dải tab nằm ngang** phía trên nội dung, chữ Inter 13px + JetBrains Mono cho mã/số, màu cam `#ea580c` trên nền xám slate, bo góc nhỏ, mật độ cao.
- Thay phong cách denim/chỉ vàng và font Be Vietnam Pro. Trên điện thoại thanh nhóm chuyển xuống đáy màn hình.

## Đổi design system theo Orange Cart (09/10/2026)
- Theo yêu cầu của khách, toàn bộ màu, chữ, nút, ô nhập làm theo `docs/nguon/orange-cart-DESIGN.md`. Bố cục giữ nguyên: thanh nhóm bên trái, dải menu con ngang, rút gọn còn icon.
- Màu: thanh bên + thanh trên navy `#232F3E`, dải menu con `#37475A`, cam `#FF9900` chỉ làm nền/vạch đánh dấu (không dùng cho chữ trên nền trắng), chữ `#0F1111`/`#565959`, viền `#D5D9D9`, liên kết và ô tích `#007185`, quầng focus `#C8F3FA`. Trạng thái: thành công `#067D62`, cảnh báo `#CC5500`, lỗi `#B12704`.
- Nút chính màu vàng gold `#FFD814` chữ đen, bo 8px; ô nhập cao 31px, viền `#888C8C`, bo 4px. Thanh trên có ô tìm màn hình lớn với nút cam `#FEBD69` (mở Ctrl + K).
- Chữ **Source Sans 3** (có bộ ký tự tiếng Việt), thân 14px, bảng 13px; JetBrains Mono cho mã/số. Thay Inter.
- Token nằm ở `frontend/src/theme/global.css` (biến `--app-*`, `--brand`, `--link`…) và `frontend/src/theme/theme.ts` (thang màu Mantine, shade 6 là màu chuẩn). Có chế độ tối tương ứng.
## Đổi màu chủ đạo theo logo Vietsun, chuẩn bị triển khai (11/10/2026)
- Theo yêu cầu người dùng, màu chủ đạo lấy từ logo: cam `#F39830` (chữ S, mặt trời) thay `#FF9900`; thanh bên + thanh trên xám than `#2B2C2D`, dải menu con `#3F4041` thay navy (thang Mantine `navy` đổi thành `charcoal`, shade 5–6 là hai màu xám chữ trong logo `#686869`, `#4D4E4E`). Chế độ tối giữ nguyên.
- Nút chính màu cam `#F39830` chữ đen (chữ trắng trên cam chỉ đạt 2,3:1), di chuột `#E0851D`; thay vàng gold `#FFD814`. Nút tìm trên thanh trên `#F8B562`. Liên kết, ô tích, quầng focus vẫn xanh `#007185`.
- Màn đăng nhập: chỉ còn tên đăng nhập, mật khẩu, "Nhớ tài khoản và mật khẩu"; bỏ nút tài khoản mẫu và các chú thích. Mật khẩu do trình quản lý mật khẩu của trình duyệt giữ, ứng dụng chỉ nhớ tên đăng nhập. Tài khoản nhiều nhà máy chọn nhà máy bằng ô chọn ngay trên màn đăng nhập (chọn sẵn nhà máy người đó làm việc lần trước trên máy đó, lưu theo từng người), bỏ trang `/select-branch` dạng thẻ (link cũ về Trang chủ). Bỏ dở bước chọn nhà máy thì đăng xuất hẳn, thu hồi cookie nếu máy chủ đã cấp. API không đổi.
