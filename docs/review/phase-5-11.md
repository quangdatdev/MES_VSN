# Review Phase 5.11 (5.11.0–5.11.3) – 13/10/2026

Phạm vi: commit `f4434fc` trên nhánh `phase-5-11` (worktree `MES-wt-511`), 14 file, chỉ frontend: `frontend/index.html`, `frontend/public/` (`login-bg.webp`, `logo-vs-dark.png`, `logo-vs-sun.png`, `manifest.webmanifest`), `frontend/src/components/BrandMark.tsx`, `frontend/src/env.d.ts`, `frontend/src/features/auth/LoginPage.tsx`, `frontend/src/shell/AppLayout.tsx`, `frontend/src/shell/BranchSwitcher.tsx`, `frontend/src/test/login.test.tsx`, `frontend/src/theme/global.css`, `frontend/src/theme/theme.ts`, `frontend/vite.config.ts`.

Trọng tâm (theo yêu cầu, trước khi đẩy lên máy chủ production): lỗi chạy, luồng đăng nhập, bố cục 360px và chế độ tối, tương phản, focus, bàn phím, CSS rò rỉ sang màn khác, build, đường dẫn tài sản khi backend chạy `--serve-web`, bí mật hoặc dữ liệu thật.

Kết luận agent: **BLOCK** (chỉ vì HIGH-1, sửa bằng một quy tắc CSS là đẩy được; không có lỗi chức năng hay lỗi đăng nhập).

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| 1 | HIGH | `frontend/src/theme/theme.ts:26-28`, `frontend/src/theme/global.css:10`, `:92-95` | Chế độ sáng: viền ô nhập và ô tích còn 2,54:1 (dưới 3:1), trái quyết định 12.3; production hiện là 3,40:1 | Bỏ giới hạn chế độ tối của quy tắc `--input-bd`, thêm quy tắc viền ô tích chưa tích (trừ ô unstyled, ô lỗi, ô khóa). Đo lại trong Chrome: sáng `#8a9099`, tối `#6b7889`, ô unstyled trong suốt | Đã sửa (`bc31cb2`) |
| 2 | MEDIUM | `theme.ts:72`, `:100`, `:102`; `global.css:4-9`, `:219-222`, `:670-679` | Token, theme đổi toàn cục đi lên production trước 5.11.4 (rà từng màn) và 5.11.5 (tài liệu, review) | Người dùng chọn đẩy lên máy chủ trước 5.11.4 để xem trên app thật | Chấp nhận, rà ở 5.11.4 |
| 3 | LOW | `global.css:1199-1201` | `.table-frame[data-fill]` vẫn trừ 210px, khung mới cao thêm 36px: màn Phân quyền cuộn hai lớp nhiều hơn | | Mở |
| 4 | LOW | `LoginPage.tsx:354`, `:203-204` | Nhãn "Ghi nhớ đăng nhập" không nói là trình duyệt sẽ hỏi lưu mật khẩu (máy dùng chung) | | Mở |
| 5 | LOW | `LoginPage.tsx:306`, `:322`, `:187-188` | Placeholder trùng chữ với thông báo lỗi ("Nhập tên đăng nhập", "Nhập mật khẩu") | | Mở |
| 6 | LOW | `global.css:897-911`, `:1112-1173` | Từ 481 đến 860px, giờ ở góc phải đè lên mặt trời; từ 861 đến 1100px, dòng "MES SYSTEM" đè lên cung cam | | Mở |
| 7 | LOW | `frontend/index.html:6-7` | `theme-color` theo hệ điều hành, không theo nút sáng/tối; màn đăng nhập luôn tối nhưng thanh trạng thái trắng | | Mở |
| 8 | LOW | `global.css:1003-1006`, `theme.ts:72` | `.login-submit { font-weight: 700 }` không có tác dụng (style inline 600 của theme thắng) | | Mở |
| 9 | LOW | `BrandMark.tsx:13`, `:23` | Logo nền tối `loading="lazy"`: đổi sang chế độ tối thì logo trống một nhịp; comment nói sai một nửa | | Mở |
| 10 | LOW | `frontend/public/logo-vs-mark.png`, `frontend/public/Logo VS.png` | Tài sản không còn dùng (239 KB) và file trùng | | Mở |
| 11 | LOW | `vite.config.ts:6`, `:24`; `LoginPage.tsx:140` | Số phiên bản luôn là `0.1.0` vì không có bước nào tăng số khi triển khai | | Mở |
| 12 | LOW | `backend/src/serve-web.ts:12` (không đổi trong commit) | Ảnh tạm trong `public/` có cache 1 giờ: thay file cùng tên thì máy người dùng còn giữ ảnh cũ tới 1 giờ | | Mở |

Lint/test (chạy trong worktree, không sửa file): `tsc --noEmit` qua, `eslint src --max-warnings 0` qua, `vitest run`: 26 file, 194 bài qua, `vite build` qua (build ra thư mục tạm, không đụng `frontend/dist`).

---

## Chi tiết

### [HIGH] `frontend/src/theme/theme.ts:26-28` – Viền ô nhập, ô tích ở chế độ sáng tụt xuống 2,54:1

Thang `gray` mới đổi shade 4 từ `#888c8c` sang `#9ca3af`. Ở chế độ sáng, Mantine lấy viền ô nhập (`--input-bd`), viền ô tích và `--mantine-color-default-border` từ `gray-4`. Token `--app-input-line: #8a9099` (`global.css:10`, 3,22:1) được khai để giữ mức 3:1, nhưng quy tắc gán nó vào ô nhập (`global.css:92-95`) chỉ nằm trong `:root[data-mantine-color-scheme='dark']`. Kết quả là ở chế độ sáng, token này không áp vào ô nào.

Đo trên Chrome headless (bản build, API giả): ô Tài khoản, ô Mật khẩu, ô tích "Ghi nhớ đăng nhập" đều có `border-top-color: rgb(156, 163, 175)`. Tương phản trên nền trắng là 2,54:1, trên dải lọc `.work-filters` (`--app-section` `#f7f8fa`) là 2,39:1. Bản production hiện tại đạt 3,40:1.

- **Rủi ro:** áp cho mọi ô nhập, ô chọn, ô ngày, ô số và ô tích chưa tích trên mọi màn, ở chế độ sáng (chế độ đa số người dùng đang dùng). Màn hình rẻ dưới đèn xưởng khó thấy ô ở đâu, đúng lý do kế hoạch 5.11 nêu ở điểm tự chọn 3 ("Ô trắng nằm trên dải lọc xám nhạt, viền nhạt thì khó thấy ô ở đâu"). Ô tích chưa tích trong ma trận Phân quyền, màn Đồng bộ, Người dùng gần như chìm vào nền. Đây là lỗi WCAG 1.4.11, trái quyết định 12.3 ("viền ô nhập giữ tương phản 3:1"), và kém hơn bản đang chạy.
- **Sửa:** áp `--app-input-line` cho cả hai chế độ. Mỗi chế độ đã có giá trị riêng nên chỉ cần bỏ phần chọn chế độ tối ở quy tắc hiện có, thêm ô tích:

  ```css
  /* global.css, thay cho quy tắc ở dòng 92-95 */
  .mantine-Input-input:not([data-error]):not(:focus):not(:focus-within) {
    --input-bd: var(--app-input-line);
  }
  .mantine-Checkbox-input:not(:checked):not([data-indeterminate]) {
    border-color: var(--app-input-line);
  }
  ```

  Không nên chỉ đổi `gray-4` về màu đậm hơn: shade này còn làm viền nút `variant="default"` và một số thành phần khác, đổi thì lan rộng hơn. Sửa theo cách trên còn chữa luôn một lỗi có sẵn từ trước: ô tích chưa tích ở chế độ tối (`dark-4` `#3e4a57` trên `#151c24`) chỉ đạt 1,90:1. Sửa xong thì đo lại bằng DevTools (`getComputedStyle(input).borderTopColor` phải là `rgb(138, 144, 153)` ở chế độ sáng).

### [MEDIUM] `theme.ts`, `global.css` – Thay đổi toàn cục lên production khi chưa rà từng màn (5.11.4)

`02-trang-thai.md` ghi rõ 5.11.4 (rà từng màn) và 5.11.5 (tài liệu `10-giao-dien.md`, `code-reviewer`) chưa làm. CLAUDE.md mục 9 chỉ tính là "xong" khi đã sửa tài liệu sở hữu và đã qua review. Đẩy commit này lên production là đẩy luôn các thay đổi áp cho mọi màn:

- `Checkbox`, `Pagination` sang cam (`theme.ts:100`, `:102`). Trong ma trận Phân quyền, ô đã đổi có nền `--brand-soft` (cam nhạt) và ô tích giờ cũng cam (2,1:1 so với nền ô). Phân biệt "ô vừa đổi" với "ô đang tích" giờ chủ yếu dựa vào dấu chấm.
- `--app-line` từ `#d5d9d9` sang `#e5e7eb` (1,42:1 xuống 1,24:1), `--app-section` nhạt hơn (`global.css:6-8`). Đường kẻ và dòng tiêu đề của bảng mật độ cao (`.dense-table`, `.grid`) mờ hơn, khó dò theo dòng.
- Nút cả ứng dụng từ đậm 400 lên 600 (`theme.ts:72`). Nút rộng hơn, thanh công cụ của lưới có thể xuống dòng.
- Vùng làm việc trên máy tính hẹp đi khoảng 54px: thanh bên 224 lên 240px, thẻ nội dung thêm lề 16px mỗi bên, viền 2px, padding thêm 4px (`global.css:219-222`, `:670-679`). Ở máy 1366px, các màn rộng (Xếp chuyền, dàn chuyền, Kế hoạch chuẩn bị SX) cuộn ngang nhiều hơn.
- `h1` từ 21 lên 24px, bo góc `sm` từ 4 lên 6px.

- **Rủi ro:** người dùng production thấy các màn nghiệp vụ đổi khác mà chưa ai kiểm. Có thể gặp nút xuống dòng, bảng khó đọc, màn Phân quyền khó nhìn ô đã đổi. Tài liệu `10-giao-dien.md` lệch với code.
- **Sửa:** một trong hai cách. (a) Trước khi đẩy, xem nhanh ở 1366px, sáng và tối các màn: Phân quyền, Chính sách cột, Người dùng, Đồng bộ, Danh mục, Phân bổ PO, Xếp chuyền, Kế hoạch chuẩn bị SX, Nhân viên; sửa chỗ vỡ rồi mới đẩy. (b) Chờ xong 5.11.4, 5.11.5 rồi mới đẩy. Nếu vẫn đẩy ngay thì ghi vào `02-trang-thai.md` là production đang chạy bản chưa rà từng màn.

### [LOW] `frontend/src/theme/global.css:1199-1201` – Chiều cao `.table-frame[data-fill]` chưa tính khung mới

`max-height: calc(100dvh - 210px)` được tính theo khung cũ (thanh trên 56, dải menu con 40, padding 16 + 24, tổng 136px). Khung mới là 64 + 48 + lề dưới 16 + viền 2 + padding 18 + 24, tổng 172px, cao thêm 36px.
- **Rủi ro:** màn Phân quyền (`PermissionsPage.tsx:197`, chỗ duy nhất dùng `data-fill` trên `.table-frame`) vốn đã cuộn hai lớp (vùng chính và bảng), nay vùng chính cuộn thêm 36px. Lúc cuộn bảng, người dùng dễ cuộn nhầm cả trang.
- **Sửa:** đổi thành `calc(100dvh - 246px)`. Tốt hơn là chuyển màn này sang bố cục `WorkPage` (`.work-page` cao 100%, bảng `flex: 1`) để không còn phụ thuộc chiều cao khung.

### [LOW] `frontend/src/features/auth/LoginPage.tsx:354` – Nhãn "Ghi nhớ đăng nhập" giấu việc lưu mật khẩu

Hành vi vẫn như cũ (`:203-204`): tích ô thì nhớ tên đăng nhập trong `localStorage` và gọi `navigator.credentials.store` để trình duyệt hỏi lưu mật khẩu. Nhãn cũ "Nhớ tài khoản và mật khẩu" nói rõ việc này. Nhãn mới thường được hiểu là "giữ phiên đăng nhập". Kế hoạch đã chốt nhãn này (điểm tự chọn 6), nên ở đây chỉ ghi mức LOW.
- **Rủi ro:** trên máy dùng chung ở xưởng, người dùng tích ô vì nghĩ chỉ là "giữ đăng nhập", gặp hộp hỏi của Chrome và bấm Lưu. Người sau dùng máy đó có thể tự điền mật khẩu của họ.
- **Sửa:** giữ nhãn theo mẫu, thêm mô tả dưới ô, ví dụ `description="Nhớ tên đăng nhập, trình duyệt có thể hỏi lưu mật khẩu. Không tích trên máy dùng chung."`. Cách khác là để hộp "Quên mật khẩu?" nhắc thêm điều này.

### [LOW] `LoginPage.tsx:306`, `:322` – Placeholder trùng thông báo lỗi

Placeholder "Nhập tên đăng nhập", "Nhập mật khẩu" trùng nguyên văn với lỗi kiểm ở `:187-188`. Bấm Đăng nhập khi ô trống thì trong ô có chữ đỏ (placeholder ở trạng thái lỗi), dưới ô lại có đúng dòng chữ ấy (đã chụp màn 360px).
- **Rủi ro:** trông như lỗi hiện hai lần, trình đọc màn hình đọc lặp. Không ảnh hưởng chức năng.
- **Sửa:** đổi lỗi thành "Chưa nhập tên đăng nhập" / "Chưa nhập mật khẩu", hoặc bỏ placeholder vì nhãn đã đủ rõ. Nếu đổi chữ lỗi thì sửa cả `login.test.tsx`: bài "Quên mật khẩu" đang dựa vào việc không có chữ "Nhập tên đăng nhập" để chứng minh form chưa gửi.

### [LOW] `global.css:897-911`, `:1112-1173` – Giờ, khẩu hiệu đè lên mặt trời ở màn vừa

Ở các màn 481–860px, giờ nằm góc trên bên phải còn mặt trời nhỏ cũng ở góc trên bên phải: chụp ở 768px thấy chữ "16:40" xám nhạt nằm trên vòng kim loại sáng. Ở 861–1100px (chụp 1024px), vạch và chữ "MES SYSTEM" nằm đè lên cung cam, dòng "Kiến tạo hiệu quả" xuống hai dòng.
- **Rủi ro:** chỉ là thẩm mỹ, giờ khó đọc trên máy tính bảng.
- **Sửa:** ẩn `.login-clock` tới 860px (hiện mới ẩn tới 480px), hoặc đặt cho giờ một nền tối mờ (`background: rgba(0,0,0,.45); padding: 4px 10px; border-radius: 999px`). Ở 861–1100px thì tăng `padding-left` của `.login-hero` hoặc thu nhỏ `.login-sun`.

### [LOW] `frontend/index.html:6-7` – `theme-color` không theo chế độ của ứng dụng

Thẻ meta chọn màu theo `prefers-color-scheme` của hệ điều hành. Ứng dụng có nút sáng/tối riêng (Mantine lưu trong `localStorage`), còn màn đăng nhập thì luôn tối (`#1d1e20`).
- **Rủi ro:** trên Android, điện thoại đặt chế độ sáng thì thanh địa chỉ trắng nằm trên màn đăng nhập tối. Người dùng chọn tối trong ứng dụng thì thanh địa chỉ vẫn trắng. Chỉ là thẩm mỹ.
- **Sửa:** trong `LoginPage` và `AppLayout`, dùng effect đặt `content` của `meta[name="theme-color"]` theo `useComputedColorScheme`; màn đăng nhập luôn đặt `#1d1e20`.

### [LOW] `global.css:1003-1006` – `font-weight: 700` của nút đăng nhập không có tác dụng

Theme gán `Button.styles.root.fontWeight = 600` (`theme.ts:72`), và Mantine đặt giá trị này thành style inline, thắng mọi class. Đo được `font-weight: 600`, style inline là `font-weight: 600; ...`.
- **Rủi ro:** không có, chỉ là CSS chết gây hiểu nhầm.
- **Sửa:** bỏ dòng `font-weight` trong `.login-submit`, hoặc đặt `fw={700}` trên nút. Về lâu dài, nên đổi `styles` của Button trong theme sang `classNames` để CSS ghi đè được.

### [LOW] `frontend/src/components/BrandMark.tsx:13`, `:23` – Logo nền tối tải lười

`loading="lazy"` trên ảnh chế độ tối nên khi bấm sang chế độ tối, logo trống cho tới lúc tải xong (20 KB, nhanh trong mạng LAN). Comment ở dòng 13 nói "Ảnh bị ẩn ... không tải", nhưng ở chế độ tối thì ảnh sáng (không có `lazy`) vẫn được tải.
- **Rủi ro:** logo nháy trống một nhịp. Không ảnh hưởng chức năng.
- **Sửa:** bỏ `loading="lazy"` (hai ảnh đều nhỏ), hoặc giữ nguyên và sửa comment cho đúng.

### [LOW] `frontend/public/logo-vs-mark.png`, `frontend/public/Logo VS.png` – Tài sản thừa

Sau commit này không còn code nào dùng `logo-vs-mark.png` (239 KB). `Logo VS.png` có từ trước, trùng byte với `logo-vs.png`, tên lại có dấu cách.
- **Rủi ro:** bản triển khai nặng thêm, dễ nhầm file khi thay logo thật.
- **Sửa:** giữ `logo-vs-mark.png` qua một lần triển khai (tab mở từ trước vẫn đang chạy JS cũ trỏ tới file này), lần sau thì xóa. Xóa `Logo VS.png` khi người dùng đồng ý.

### [LOW] `frontend/vite.config.ts:6`, `:24`; `LoginPage.tsx:140` – Số phiên bản đứng yên

Số phiên bản được đọc từ `frontend/package.json` (`0.1.0`). `deploy/deploy.cjs` không tăng số này khi triển khai. Kế hoạch đã biết (điểm tự chọn 8).
- **Rủi ro:** mọi bản production đều ghi "VERSION 0.1.0", người hỗ trợ không biết máy người dùng đang chạy bản nào. Số này hiện cả trước khi đăng nhập, nhưng rủi ro lộ thông tin trong mạng nội bộ là không đáng kể.
- **Sửa:** tăng `version` mỗi lần phát hành, hoặc nối thêm mã commit ngắn hay ngày build lúc build, ví dụ `define: { __APP_VERSION__: JSON.stringify(\`${version}+${sha}\`) }`, với `sha` lấy từ `git rev-parse --short HEAD`.

### [LOW] `backend/src/serve-web.ts:12` – Ảnh tạm và cache 1 giờ

Quyết định 12.3 ghi: có ảnh thật thì "thay file ở `frontend/public`, không sửa code". Nhưng `useStaticAssets(..., { maxAge: '1h' })` cho trình duyệt giữ `login-bg.webp`, `logo-vs-dark.png` tới 1 giờ.
- **Rủi ro:** sau khi thay ảnh thật, một số máy vẫn thấy ảnh tạm thêm tới 1 giờ. Chỉ gây hiểu nhầm lúc kiểm thử.
- **Sửa:** khi thay ảnh thì đổi tên file (ví dụ `login-bg-2.webp`) rồi sửa một dòng CSS. Cách khác là import ảnh qua Vite để tên file có mã băm.

---

## Đã kiểm, không có lỗi

- **Build, kiểu:** `define: { __APP_VERSION__ }` cùng khai báo ở `src/env.d.ts` qua `tsc` và `vite build`. Bản build không còn chuỗi `__APP_VERSION__`. `vitest.perf.config.ts` gộp cấu hình gốc nên cũng có `define`.
- **Tài sản khi chạy `--serve-web`:** `login-bg.webp`, `logo-vs.png`, `logo-vs-dark.png`, `logo-vs-sun.png`, `manifest.webmanifest` đều có trong `dist` ở gốc site. CSS giữ nguyên `url('/login-bg.webp')`. CSP mặc định của helmet cho phép ảnh cùng origin. Đường dẫn tuyệt đối từ gốc khớp với cách phục vụ của `serve-web.ts`.
- **Luồng đăng nhập (đã chạy trên Chrome headless với bản build và API giả):** sai mật khẩu hiện cảnh báo "Chưa đăng nhập được". Gửi form trống thì báo dưới từng ô, không gọi máy chủ. Tài khoản nhiều ĐVCS: hai ô khóa lại, mở ô ĐVCS, chọn rồi Vào làm việc thì về Trang chủ. "Quên mật khẩu?" chỉ mở hộp hướng dẫn, không gửi form. Phần logic `LoginForm`, `store/auth.ts`, `lib/api.ts`, `guards.tsx` không đổi: diff chỉ đổi nhãn, placeholder, biểu tượng, bỏ `withAsterisk`. Hành vi xác thực, phiên, cookie refresh giữ nguyên.
- **Bố cục:** không có tràn ngang (`scrollWidth` bằng chiều rộng) ở 320, 360, 375, 401, 414, 480, 600, 767, 768, 900, 961, 1024, 1101, 1280, 1366, 1440, 1920px, cả màn đăng nhập lẫn khung ứng dụng. Ở 360px, nút tài khoản (có Đăng xuất, Đổi ĐVCS) luôn nhìn thấy và bấm được. Chế độ tối, thanh bên rút gọn hiển thị đúng.
- **Bàn phím, focus:** thứ tự Tab của form là Tài khoản, Mật khẩu, Ghi nhớ, Quên mật khẩu, Đăng nhập. Thứ tự Tab của khung là Bỏ qua tới nội dung, logo, ĐVCS, tìm màn hình, Sáng, Tối, tài khoản, các nhóm ở thanh bên, Rút gọn, tab con. Vòng focus thấy rõ ở cả hai chế độ: xanh `#007185`/`#4fc3d6`, viền trắng ở thanh bên, vẽ vào trong ở dải tab. Liên kết bỏ qua hiện đè lên thanh trên.
- **Tương phản các cặp mới:** `--brand-ink` `#a4560a` trên trắng 5,37:1, trên `#f3f4f6` 4,88:1. Chữ chân trang `#a6a8ab` trên nền đăng nhập 7,0:1. Giờ `#c9cacc` 10,2:1. Dấu tích tối trên ô cam (autoContrast) thấy rõ.
- **CSS rò rỉ:** grep `frontend/src` không còn chỗ nào dùng các class đã xóa (`rail-divider`, `rail-item-brand`, `rail-brand`, `rail-logo-*`, `searchbar-scope`, `searchbar-go`, `login-art*`, `login-panel`, `login-logo`, `nav-account-icon`, `--search-btn*`). Mọi selector mới đều có tiền tố `login-`, `topbar-`, `nav-`, `scheme-`, `brand-`, `rail-`, `tab`, `app-`, không có selector theo thẻ HTML. Các class của khung không được dùng ở màn nào khác.
- **Bí mật, dữ liệu thật:** diff không có mật khẩu, chuỗi kết nối, tên khách, số PO. Ảnh mới không có chunk metadata (PNG chỉ có `IHDR/IDAT/IEND`, WebP chỉ `VP8`). Ảnh nền là hình khối trừu tượng, không có chữ.
- **Phụ thuộc:** commit không thêm gói mới nên không cần chạy `npm audit`.

## Ghi chú, không phải lỗi

- Màn đăng nhập có chữ tiếng Anh ("MES System", "Manufacturing Execution System", "Vietsun Group", "Version", "Warming Your Life"), khác CLAUDE.md mục 6 ("giao diện bằng tiếng Việt"). Mẫu đã duyệt ở kế hoạch 5.11 nên không tính là lỗi, nhưng nên ghi ngoại lệ này vào `10-giao-dien.md` ở 5.11.5.
- Comment ở `LoginPage.tsx:358` và Q4 ghi "viết hoa bằng CSS, trình đọc màn hình vẫn đọc chữ thường". Thực tế Chrome và Safari đưa chữ đã viết hoa vào cây trợ năng. Với chữ tiếng Việt thì gần như không ảnh hưởng cách đọc, chỉ nên sửa lời comment cho đúng.
- Ở máy 1366×768, chân trang (số phiên bản) nằm dưới mép màn hình, phải cuộn khoảng 60px. Nút Đăng nhập vẫn thấy ngay.

> Review Summary: examined 14 files, found 0 CRITICAL, 1 HIGH, 1 MEDIUM, 10 LOW findings. Top priority: ở chế độ sáng, viền ô nhập và ô tích còn 2,54:1 vì `gray-4` đổi mà `--app-input-line` chỉ áp ở chế độ tối (trái quyết định 12.3). Merge recommendation: **BLOCK** cho tới khi sửa HIGH-1 (một quy tắc CSS). Sau đó **APPROVE WITH SUGGESTIONS**, nên xem nhanh các màn theo MEDIUM-2 trước khi đẩy lên production.

## Sau khi sửa (13/10/2026)

- HIGH-1 đã sửa ở commit `bc31cb2`. Lint, 194 bài test frontend, build qua.
- MEDIUM-2 và các LOW để lại cho 5.11.4, 5.11.5.
- Không còn `CRITICAL`, `HIGH` mở.

## Lượt sửa theo phản hồi 13/10 (giao diện đăng nhập, vừa khung hình)

Phạm vi: thay đổi chưa commit trên nhánh `phase-5-11` (worktree `MES-wt-511`, gốc `bc31cb2`), 3 file: `frontend/src/theme/global.css` (khối đăng nhập), `frontend/src/features/auth/LoginPage.tsx`, `frontend/src/components/BrandMark.tsx`. Lý do sửa: người dùng phản hồi (1) chưa giống ảnh mẫu, (2) tràn màn hình laptop (1920×1080 phóng 125%, khung nhìn khoảng 1536×730).

Trọng tâm: CSS (độ đặc hiệu, thứ tự cascade giữa quy tắc mới và media query, quy tắc âm thầm không có tác dụng), bố cục ở các cỡ màn (chiều rộng lẻ do phóng to của Windows, màn rất thấp, rất cao, siêu rộng, thanh địa chỉ điện thoại với `dvh`), hỗ trợ trình duyệt (`:has`, `dvh`, `clamp` có phép cộng, chia độ dài cho số trong biến CSS), trợ năng (tương phản chữ trên nền sáng hơn, focus, giảm chuyển động), cách dùng prop của Mantine, độ phủ test.

Cách đo: bản build ra thư mục tạm (không đụng `frontend/dist`), máy chủ tĩnh kèm API giả (sai mật khẩu; tài khoản 3 ĐVCS có A00), Chrome 154 headless điều khiển qua DevTools Protocol. 34 khung nhìn từ 320×568 đến 3840×2000, mỗi khung 5 trạng thái: **ban đầu**, **ô trống** (bấm Đăng nhập khi chưa nhập, hiện 2 dòng lỗi dưới ô), **sai mật khẩu** (khung báo đỏ), **chọn ĐVCS**, **chưa chọn ĐVCS** (bấm Vào làm việc khi chưa chọn). Thêm một lượt quét chiều rộng 961–1920px và đo tương phản trên ảnh chụp đã ẩn chữ. Script đo nằm ở thư mục tạm của phiên review, không commit.

Kết luận agent: **APPROVE WITH SUGGESTIONS**. Không có CRITICAL hay HIGH. Nên sửa N1 và N2 trước khi đưa người dùng xem lại. Cả hai chỉ sửa CSS, cách sửa đã thử bằng cách chèn CSS vào trang và đo lại. N1 đúng là lỗi người dùng đã phản ánh, chỉ khác là nay chỉ còn ở trạng thái báo lỗi.

| # | Mức | Vị trí | Vấn đề | Xử lý đề xuất | Trạng thái |
|---|---|---|---|---|---|
| N1 | MEDIUM | `global.css:1018-1023`, `:1165`, `:828` | Trạng thái ban đầu đã vừa màn, nhưng khi báo lỗi dưới ô hay đang chọn ĐVCS thì trang vẫn cuộn: 1536×730 cuộn 1–8px, 1672×941 cuộn 5px, 1600×601 cuộn 30–59px, 1024×489 cuộn 49–70px | Thêm `[aria-invalid='true']` vào `:has()`; ở trạng thái gọn thì bỏ cả logo lẫn dòng chân thẻ | Đã sửa |
| N2 | MEDIUM | `global.css:1156`, `:982`, `:831`, `:837`, `:841` | Từ 1181 đến khoảng 1250px, khẩu hiệu chạm vào thẻ hoặc bị thẻ che ("quả" mất nửa), "MES SYSTEM" xuống hai dòng, đoạn mô tả dài 6 dòng | Đổi mốc `max-width: 1180px` thành `1280px` | Đã sửa |
| N3 | LOW | `global.css:1063`, `LoginPage.tsx:367` | `margin-top` của `.login-submit` không có tác dụng vì prop `mt={4}` thành style inline (đo được 4px ở mọi cỡ) | Bỏ `mt={4}` hoặc bỏ dòng CSS | Đã sửa (bỏ dòng CSS, giữ `mt={4}`) |
| N4 | LOW | `LoginPage.tsx:326` | `visibilityToggleIcon` là hàm viết thẳng trong JSX nên mỗi lần vẽ lại là một kiểu component mới, biểu tượng bị gỡ ra rồi gắn lại sau mỗi phím gõ | Đưa thành component ở cấp module | Đã sửa |
| N5 | LOW | `global.css:828`, `:831` | Kích thước tính theo `100dvh`: trên máy tính bảng nằm ngang (bố cục hai cột), cứ thanh địa chỉ ẩn hay hiện là cả thẻ đổi cỡ | Dùng `100svh` cho `--login-fit`, `--login-sun`; giữ `min-height: 100dvh` | Đã sửa |
| N6 | LOW | `global.css:1018`, `:1021` | `:has()` nằm ngoài mức hỗ trợ trình duyệt của bản build (Vite 8 nhắm tới `firefox114`). Firefox dưới 121 (ESR 115) bỏ cả quy tắc, chỉ hỏng nhẹ | Ghi nhận; hoặc gắn thuộc tính `data-*` từ React | Ghi nhận (`10-giao-dien.md` mục 11.2) |
| N7 | LOW | `global.css:893-901` | Cung cam (`::after`) cắt qua chữ "VIETSUN GROUP" ở chân trang khi màn rộng từ 1536px; chỗ giao nhau chỉ còn 3,2–3,4:1 với chữ 12px | Cho mask tắt sớm hơn, hoặc so lại với ảnh mẫu | Đã sửa |
| N8 | LOW | `frontend/src/test/login.test.tsx` | Chỉ đo tay trạng thái ban đầu, không có script đo bố cục trong repo, không có test biểu tượng mắt | Commit script đo hoặc ghi danh mục kiểm tay (cỡ × trạng thái) | Sửa một phần |

Lint/test (chạy trong worktree, không sửa file): `vitest run src/test/login.test.tsx` qua 16/16 bài, `eslint` hai file `.tsx` qua, `vite build` ra thư mục tạm qua. Theo tác giả: lint, 194 bài test frontend, build đều qua.

---

### Chi tiết

#### [MEDIUM] N1 `frontend/src/theme/global.css:1018-1023`, `:1165`, `:828` – Trạng thái báo lỗi, chọn ĐVCS vẫn làm trang cuộn

Số px phải cuộn (`scrollHeight - innerHeight`), 0 là vừa màn:

| Khung nhìn | Ban đầu | Ô trống | Sai mật khẩu | Chọn ĐVCS | Chưa chọn ĐVCS |
|---|---|---|---|---|---|
| 1672×941 (cỡ ảnh mẫu) | 0 | 5 | 0 | 0 | 0 |
| 1536×730 (máy người dùng) | 0 | 1 | 0 | 0 | 8 |
| 1366×768 | 0 | 2 | 0 | 0 | 2 |
| 1366×657 (1366×768 trừ thanh trình duyệt) | 0 | 0 | 0 | 0 | 17 |
| 1280×630 (1920×1080 phóng 150%) | 0 | 9 | 1 | 9 | 30 |
| 1600×601 | 0 | 38 | 30 | 38 | 59, thẻ lòi 3px |
| 1100–1180×700 | 0 | 0 | 0 | 10 | 31 |
| 1024×489 (1280×720 phóng 125%, đúng màn mà comment ở `:1163` nhắm tới) | 0 | 0 | 61, thẻ lòi 21px | 49 | 70, thẻ lòi 30px |
| 1366×520 | 0 | 0 | 10 | 18 | 39 |

Nguyên nhân:
- `:has(.login-reveal, [role='alert'])` không bắt được lỗi dưới ô. `InputError` của Mantine 9.7.1 không có `role="alert"`; Mantine chỉ đặt `aria-invalid="true"` và `data-error` trên ô (`@mantine/core/esm/components/Input/Input.mjs:75`, `:98`). Bấm Đăng nhập khi ô trống thì thêm khoảng 42px mà logo vẫn còn.
- Phần dư chỉ được tính cho trạng thái ban đầu. Trong khoảng cao 640–940px, thẻ và padding lớn thêm khoảng 1,02px cho mỗi 1px chiều cao màn (thẻ 481→700px, padding 116→204px). Vì vậy phần dư không tăng theo màn, đứng quanh 36–43px. Trạng thái nào cao hơn trạng thái ban đầu từ 43px trở lên thì tràn ở mọi chiều cao.
- Có một "vách" ở mốc 600px: 1600×600 vừa mọi trạng thái, cao thêm 1px (1600×601) thì cuộn 30–59px. Lý do là ở `--login-fit` = 0 (cao từ 640px trở xuống), padding vẫn 60/56px cùng logo và dòng chân thẻ, còn mốc 600px thì nằm thấp hơn mốc 640px.

- **Rủi ro:** đúng lỗi người dùng đã báo, chỉ khác là nay chỉ còn ở trạng thái báo lỗi. Trên Windows, thanh cuộn thường chiếm khoảng 17px nên bấm Đăng nhập với ô trống là cả trang xô ngang. Ở 1024×489, sau khi sai mật khẩu thì nút Đăng nhập chạm mép dưới màn. Bước chọn ĐVCS là đường đi bình thường của mọi tài khoản nhiều ĐVCS, mà vẫn cuộn 10px ở 1100–1180×700.
- **Sửa:** gộp lỗi dưới ô vào trạng thái gọn, và ở trạng thái gọn thì bỏ cả dòng chân thẻ:

  ```css
  /* Thay hai quy tắc ở dòng 1018-1023 */
  .login-card:has(.login-reveal, [role='alert'], [aria-invalid='true']) :is(.login-card-logo, .login-card-foot) {
    display: none;
  }
  .login-card:has(.login-reveal, [role='alert'], [aria-invalid='true']) .login-system {
    margin-top: 0;
  }
  ```

  Đã chèn đúng CSS này (cùng sửa N2) vào trang rồi đo lại 21 khung nhìn × 5 trạng thái. Kết quả: từ cao 601px trở lên không còn cuộn, trừ 1600×601 ở trạng thái chưa chọn ĐVCS (14px). Từ cao 520px trở xuống vẫn cuộn 10–70px khi có khung báo hay ô chọn ĐVCS, vì riêng khung báo đã cao khoảng 100px. Có hai cách cho dải này: (a) trong `@media (max-height: 520px)` bỏ thêm `.login-subtitle` ở trạng thái gọn và dùng khung báo một dòng; (b) ghi vào `10-giao-dien.md` là chấp nhận cuộn ở màn thấp hơn 520px. Nếu muốn có thêm phần dư thì giảm nhẹ hệ số ở cỡ lớn (ví dụ logo trong thẻ `44px + 26 * fit`) để thẻ lớn chậm hơn màn. Sửa xong thì đo lại đủ 5 trạng thái, không chỉ trạng thái ban đầu.

#### [MEDIUM] N2 `global.css:1156` (mốc 1180px), `:982`, `:831`, `:837`, `:841` – Khẩu hiệu chạm, bị thẻ che ở 1181–1250px

Quét chiều rộng, đo khoảng trống từ mép phải chữ khẩu hiệu tới mép trái thẻ (cột cách nhau 48–64px):

| Rộng | 1100 | 1180 | **1181** | **1200** | **1250** | 1280 | 1300 | 1536 |
|---|---|---|---|---|---|---|---|---|
| Khoảng trống (px) | 55 | 100 | **−2** | **7** | **34** | 46–56 | 57 | 180 |

Chụp màn 1181×700: chữ "Kiến tạo hiệu quả" chui dưới mép thẻ, chữ "quả" mất nửa (chỗ chồng lên nền trắng của thẻ, chữ cam chỉ còn 2,25:1). "MES SYSTEM" xuống hai dòng, đoạn mô tả dài 6 dòng trong cột rộng 167px. Nguyên nhân: từ 1181px trở lên, bố cục quay về bản rộng: thẻ 530px, lề phải cộng thêm `clamp(0px, 4.5vw, 78px)` (khoảng 53px), mặt trời `34vw` (khoảng 400px) đẩy `padding-left` của khẩu hiệu lên 254px. Trong khi đó khẩu hiệu đặt `white-space: nowrap` và rộng khoảng 228–250px.

- **Rủi ro:** khẩu hiệu của thương hiệu bị cắt ở các khung nhìn có thật: 1440×900 phóng 120% (1200px), 1920 phóng 160% (1200px), 1536 cộng thêm phóng to trình duyệt 125% (1229px), cửa sổ không phóng hết màn. Lượt đo 21 cỡ của tác giả không có cỡ nào trong dải này.
- **Sửa:** đổi `@media (max-width: 1180px)` thành `@media (max-width: 1280px)`. Không cần mốc `min-width` nên chiều rộng lẻ không lọt khe; 1280,5px dùng bản rộng thì vẫn còn trống 46px. Đã chèn thử quy tắc này rồi đo: từ 1181 đến 1279px còn trống 101–179px, không còn chồng chữ. Có thể đặt thêm `white-space: nowrap` cho `.login-kicker`.

#### [LOW] N3 `global.css:1063`, `LoginPage.tsx:367` – `margin-top` của nút đăng nhập không có tác dụng

Prop `mt={4}` của Mantine Box được đổi thành style inline (`@mantine/core/esm/core/Box/Box.mjs:31-37`, `parsedStyleProps.inlineStyles`). Style inline thắng `.login-submit { margin-top: calc(2px + 6 * var(--login-fit)) }`. Đo được `margin-top: 4px` ở mọi cỡ, trong khi CSS mong 8px ở màn cao từ 940px.
- **Rủi ro:** thêm một dòng CSS chết. Người sau chỉnh dòng này không thấy gì thay đổi. Cùng loại với LOW-8 lượt trước (`font-weight: 700`).
- **Sửa:** bỏ `mt={4}` khỏi `Button` để CSS nội suy có tác dụng (khi đó cần đo lại N1), hoặc bỏ dòng `margin-top` trong `.login-submit`.

#### [LOW] N4 `LoginPage.tsx:326` – Biểu tượng mắt là component viết thẳng trong JSX

Mantine gọi prop này như một component (`jsx(VisibilityToggleIcon, { reveal })`, `PasswordInput.mjs:101`). Hàm mũi tên viết thẳng trong JSX là một kiểu component mới sau mỗi lần `LoginForm` vẽ lại, mà `useForm` ở chế độ controlled thì vẽ lại sau mỗi phím gõ. Vì vậy SVG bị gỡ ra rồi gắn lại liên tục. Lint không bắt vì hàm không gán vào tên viết hoa.
- **Rủi ro:** chi phí nhỏ. Đây là mẫu React khuyên tránh: component có state đặt vào chỗ này sẽ mất state sau mỗi lần vẽ lại.
- **Sửa:** khai ở cấp module: `function PasswordEye({ reveal }: { reveal: boolean }) { return reveal ? <IconEye size={18} stroke={1.6} /> : <IconEyeOff size={18} stroke={1.6} />; }` rồi truyền `visibilityToggleIcon={PasswordEye}`.

#### [LOW] N5 `global.css:828`, `:831` – Kích thước theo `100dvh` đổi theo thanh địa chỉ

`dvh` đổi mỗi lần thanh địa chỉ của trình duyệt di động ẩn hay hiện. Ở bố cục một cột (từ 960px trở xuống) thì `--login-fit` cố định `0px` nên không sao. Máy tính bảng nằm ngang rộng hơn 960px (Android 1280×800) thì dùng bố cục hai cột với `--login-fit` theo `dvh`. Khi trang phải cuộn (các trạng thái ở N1), thanh địa chỉ ẩn đi, `dvh` tăng khoảng 56px, thẻ cộng padding lớn theo khoảng 57px (mặt trời cũng lớn theo). Trang vẫn tràn y như cũ mà bố cục thì nhảy trong lúc cuộn.
- **Rủi ro:** thẻ đổi cỡ, giật trong lúc cuộn trên máy tính bảng. Chỉ là trải nghiệm.
- **Sửa:** dùng `100svh` (khung nhìn nhỏ, không đổi theo thanh địa chỉ) cho `--login-fit` và `--login-sun`, giữ `min-height: 100dvh` cho `.login-shell`. `svh` được hỗ trợ ở cùng phiên bản trình duyệt với `dvh`. Trên máy tính để bàn, `svh` bằng `dvh`.

#### [LOW] N6 `global.css:1018`, `:1021` – `:has()` nằm ngoài mức hỗ trợ của bản build

Mặc định của Vite 8.3.4 (`baseline-widely-available`) là Chrome 111, Firefox 114, Safari 16.4. `:has()` chỉ có từ Firefox 121, nên Firefox ESR 115 (bản cuối cho Windows 7/8.1) bỏ cả quy tắc. Các phần khác đều nằm trong mức hỗ trợ: `dvh`, `clamp()` có phép cộng, chia độ dài cho số trong `calc`, `conic-gradient` làm mask, `aspect-ratio`. Ứng dụng đã dùng `:has` ở `global.css:1943` và `100dvh` ở `:181`, nên mức hỗ trợ thực tế không đổi.
- **Rủi ro:** thấp. Trình duyệt cũ vẫn giữ logo khi có khung báo hay đang chọn ĐVCS, trang cuộn thêm khoảng 60–130px tùy chiều cao màn. Không hỏng chức năng.
- **Sửa:** ghi nhận trong `10-giao-dien.md`. Nếu muốn bỏ hẳn phụ thuộc này, `LoginForm` gắn `data-compact` (khi đang chọn ĐVCS, có lỗi, có thông báo hay ô báo lỗi) lên `form`, rồi dời logo và dòng "MES - ..." vào trong `LoginForm` để chọn bằng selector anh em, không cần `:has`.

#### [LOW] N7 `global.css:893-901` – Cung cam cắt qua chữ chân trang

Mask `conic-gradient(#000 0deg 125deg, transparent 165deg)` để cung chạy gần tới đáy vòng. Ở 1536×730, 1672×941, 1920×969, cung đi ngang chữ "VIETSUN GROUP" (đã chụp màn). Đo trên ảnh đã ẩn chữ: phần lớn chân trang đạt 6,3:1, nhưng chỗ cung đi qua chỉ còn 3,2–3,4:1 với chữ 12px (cần 4,5:1).
- **Rủi ro:** thẩm mỹ, và đạt chuẩn tương phản không đều trên một đoạn chữ nhỏ.
- **Sửa:** so với ảnh mẫu. Nếu mẫu không có chỗ giao này thì cho mask tắt sớm hơn (ví dụ `#000 0deg 110deg, transparent 145deg`), hoặc giới hạn `--login-sun` theo khoảng cách tới chân trang.

#### [LOW] N8 `frontend/src/test/login.test.tsx` – Chưa có kiểm tra bố cục lặp lại được

Lượt đo 21 cỡ của tác giả là đo tay và chỉ ở trạng thái ban đầu, nên không thấy N1, N2. Test jsdom chạy với `css: false` nên không đo được bố cục. Thay đổi biểu tượng mắt cũng chưa có test.
- **Rủi ro:** lần chỉnh cỡ sau (5.11.4) có thể làm vỡ lại mà không ai biết.
- **Sửa:** commit một script đo (Chrome qua DevTools Protocol, không thêm gói, giống cách review này đã làm) vào `frontend/scripts/`, chạy tay trước khi đẩy. Script kiểm `scrollHeight <= innerHeight`, chữ khẩu hiệu không chồng thẻ, ở danh sách cỡ × 5 trạng thái. Ít nhất thì ghi danh mục kiểm tay này vào `12-du-lieu-mau-va-kiem-thu.md`. Thêm một bài test: ô mật khẩu đang ẩn thì nút hiện `tabler-icon-eye-off`, bấm vào thì `aria-pressed="true"` và đổi sang `tabler-icon-eye`.

---

### Đã kiểm, không có lỗi

- **`Stack gap="var(--login-gap)"`:** Mantine 9.7.1 coi chuỗi bắt đầu bằng `var(` là giá trị số (`isNumberLike`), còn `rem()` trả nguyên chuỗi không có dấu phẩy hay dấu cách. Kết quả là `--stack-gap: var(--login-gap)`, đo được 12–22px theo chiều cao màn. Lưu ý: nếu thêm giá trị dự phòng có dấu phẩy (`var(--login-gap, 12px)`) thì `rem()` sẽ tách theo dấu phẩy và làm hỏng giá trị.
- **Title, Text qua class:** `.login-card .login-title` (0,2,0) thắng `.m_8a5d1357` của Mantine; đo được 24–31px, đậm 600. `.login-subtitle` cùng độ đặc hiệu với `.m_b6d8b162` nhưng thắng vì `global.css` nạp sau CSS Mantine trong cùng một file (quy tắc từ review 5.7); đo được cỡ 14–15px, lề trên 4–8px.
- **`--login-fit`:** `calc(clamp(0px, 100dvh - 640px, 300px) / 300)` hợp lệ (độ dài chia số). Biến không đăng ký `@property` nên được thay nguyên chuỗi tại nơi dùng. Lightning CSS giữ nguyên khi nén. Đo được nội suy đúng: logo góc trên 58px ở cao 657px, 66px ở 730px, 90px từ 940px.
- **Cascade và media query:** padding của bố cục một cột ghi đè `max-height: 600px` và `max-width: 1180px` đúng như comment. `:has(...) .login-system` (0,3,0) thắng `margin-top` trong các media query như ý muốn. `.login-card-logo { display: none }` thắng `.brand-logo { display: flex }` nhờ đứng sau. `--input-bg` khai thẳng trên ô thắng giá trị Mantine khai ở wrapper (`.m_6c018570[data-variant='default']`) vì giá trị của chính phần tử luôn thắng giá trị kế thừa. Quy tắc viền 3:1 (0,6,0) không bị đụng. Lightning CSS gộp lưới một cột thành `grid-template` đúng thứ tự hàng, và viết media query theo cú pháp khoảng `(width<=1180px)`, Safari 16.4 đọc được.
- **Chiều rộng lẻ:** không có mốc `min-width` nên 960,5px rơi vào bố cục hai cột với quy tắc `max-width: 1180px`; đo 961px không có vấn đề.
- **Tương phản trên nền mới sáng hơn** (đo trên ảnh chụp đã ẩn chữ, 7 cỡ): giờ thấp nhất 5,15:1 (lượt trước 10,2:1, vẫn đạt AA), đoạn mô tả 6,9:1, "MES SYSTEM" 7,7:1, "Warming Your Life" 9,1:1, khẩu hiệu trắng 12,5:1, khẩu hiệu cam 5,6:1 (chữ lớn). Chân trang 6,3:1, trừ chỗ cung cam đi qua (N7).
- **Ô nhập nền xám:** viền `#8a9099` trên nền ô `#f7f8fa` đạt 3,03:1, trên thẻ trắng 3,22:1, đều từ 3:1 trở lên nhưng sát ngưỡng: làm nhạt `--app-section` hay `--app-input-line` thêm là tụt dưới 3:1. Chữ gợi ý `gray-5` `#6b7280` trên `#f7f8fa` đạt 4,55:1. Chế độ tối: viền 3,44:1, chữ gợi ý 5,21:1. Khi focus, nền ô chuyển trắng và viền xanh `#007185`, thấy rõ.
- **Giảm chuyển động:** không thêm hiệu ứng mới. Mặt trời vẫn tắt hiệu ứng khi máy đặt giảm chuyển động.
- **Lớp vẽ:** logo, giờ, chân trang đặt tuyệt đối không chồng lên thẻ ở cả 34 cỡ × 5 trạng thái. `.login-main { position: relative }` giữ thẻ nằm trên lớp đầu trang.
- **Hai điểm của lượt trước đã hết:** LOW-6 (giờ đè mặt trời; "MES SYSTEM" đè cung cam): giờ ẩn từ 720px trở xuống, từ 721 đến 960px thì cột 480px giữ giờ cách xa mặt trời, chữ khẩu hiệu luôn cách cung 57px. Ghi chú "1366×768 phải cuộn 60px": trạng thái ban đầu nay vừa màn.
- **Quy ước:** chữ giao diện tiếng Việt; viết hoa vẫn bằng CSS (Q4); nút vẫn chữ đen trên nền cam (Q1); "Quên mật khẩu?" vẫn dùng `--brand-ink`; CSS Mantine vẫn một file. Không có bí mật, dữ liệu thật, gói mới. `BrandMark` nhận thêm `string` không ảnh hưởng hai chỗ dùng ở `AppLayout.tsx:122-123`.

### Ghi chú, không phải lỗi

- Biểu tượng mắt nay theo trạng thái (đang ẩn thì mắt gạch chéo, giống ảnh mẫu), ngược với mặc định của Mantine (theo hành động). `aria-pressed` vẫn báo đúng trạng thái cho trình đọc màn hình. Có từ trước, không do lượt này: nút mắt không Tab tới được (Mantine đặt `tabIndex=-1`). Lúc chọn ĐVCS, `visibilityToggleButtonProps={{ disabled: true }}` thay cả object mặc định của theme, nên nhãn rơi về tiếng Anh "Toggle password visibility". Nên đổi thành `{ disabled: true, 'aria-label': 'Hiện hoặc ẩn mật khẩu' }`.
- Logo trong thẻ bị bỏ ở mọi lần báo lỗi, kể cả màn cao còn thừa chỗ (từ 940px). Đây là lựa chọn thiết kế; nếu muốn giữ logo trên màn cao thì bọc quy tắc trong `@media (max-height: 939px)`.
- Màn siêu rộng (3440×1305): giữa khẩu hiệu và thẻ trống 1835px. Muốn bố cục gọn hơn thì giới hạn bề rộng nội dung, ví dụ khoảng 1920px, đặt giữa. Việc này cần quyết định thiết kế.
- Vài comment mới tả "cái gì" thay vì "vì sao" (lớp phủ, vành, cung của mặt trời). Với chồng gradient khó đọc thì chấp nhận được, nhưng CLAUDE.md mục 6 ưu tiên "vì sao".
- Điện thoại nằm ngang 844×390: cuộn 100px ở trạng thái ban đầu, tới 225px khi chưa chọn ĐVCS. Trên điện thoại thì cuộn là bình thường.

> Review Summary: examined 3 files, found 0 CRITICAL, 0 HIGH, 2 MEDIUM, 6 LOW findings. Top priority: N1, trạng thái báo lỗi và chọn ĐVCS vẫn làm trang cuộn (1–8px ở 1536×730, 5px ở cỡ ảnh mẫu, 30–70px ở các dải 601–660px và từ 520px trở xuống) vì `:has()` không bắt lỗi dưới ô và phần dư chỉ tính cho trạng thái ban đầu. Merge recommendation: **APPROVE WITH SUGGESTIONS**. Nên sửa N1 và N2 (chỉ CSS, đã thử bằng cách chèn CSS và đo lại) trước khi đưa người dùng xem lại.

### Sau khi sửa (13/10/2026 tối)

Sửa trong cùng lượt người dùng yêu cầu "phải theo giống hình" (quyết định 12.4: font Inter, nút chữ trắng trên cam đậm `#D9730D`, chỉ ở màn đăng nhập).

- N1: `:has()` bắt thêm `[aria-invalid='true']`, bỏ cả logo lẫn dòng chân thẻ; mốc màn thấp đổi 600 → 640px; màn thấp hơn 640px bỏ thêm dòng tên hệ thống khi form dài thêm; padding trên, dưới ở cỡ lớn giảm (`36 * fit` thay `44 * fit`) để còn dư.
- N2: mốc `1180px` → `1280px`. Đo: từ 1181px khẩu hiệu cách thẻ ít nhất 59px.
- N3: bỏ `margin-top` trong `.login-submit`, giữ `mt={4}`.
- N4: `PasswordEye` ở cấp module. Kèm ghi chú: `visibilityToggleButtonProps` lúc chọn ĐVCS nhắc lại `aria-label` tiếng Việt.
- N5: `--login-fit`, `--login-sun` theo `100svh`; `min-height` giữ `100dvh`.
- N6: ghi trong `10-giao-dien.md` mục 11.2 (Firefox dưới 121 chỉ không bỏ được logo, trang cuộn).
- N7: mask cung cam `#000 0deg 110deg, transparent 145deg`, so với ảnh mẫu: cung tắt trước chữ chân trang như ảnh.
- N8: thêm test nút mắt (`login.test.tsx`: mắt gạch chéo khi ẩn, nhấn thì hiện mật khẩu, nhãn tiếng Việt). Đo bố cục vẫn làm tay (iframe nhiều cỡ trong trình duyệt, 5 trạng thái), chưa có script trong repo.
- Đo lại 16 khung từ 360×640 đến 2560×1305 (kể cả 960,5×599) × 5 trạng thái (ban đầu, bỏ trống ô, sai mật khẩu, chọn ĐVCS, chưa chọn ĐVCS): không cuộn dọc, ngang, không chồng nhau. Còn cuộn: một cột 960×599 khi chưa chọn ĐVCS (11px), màn thấp hơn 520px khi form dài thêm, điện thoại xoay ngang.
- Lint, 195 test frontend, build qua.

