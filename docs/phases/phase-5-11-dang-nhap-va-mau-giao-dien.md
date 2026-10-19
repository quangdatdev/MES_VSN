# Phase 5.11 – Màn đăng nhập mới và đổi màu giao diện theo mẫu

**Trạng thái:** In progress (plan duyệt 12/10/2026, chốt Q1–Q8 theo đề xuất; bắt đầu 13/10/2026 trên nhánh `phase-5-11`, worktree `MES-wt-511`) · **Ngày lập:** 12/10/2026 · **Đầu vào:** hai ảnh mẫu người dùng gửi ngày 12/10/2026 ("ảnh mẫu Login" và "ảnh mẫu Kế hoạch xuất hàng") · **Quyết định liên quan:** `13-quyet-dinh.md` mục 6.6, 12.1, 12.2 (sẽ thêm mục 12.3)

## Tóm tắt

- **Chỉ đổi frontend.** Không đụng backend, API, database, phân quyền, seed. Không cần migrate, chỉ build lại frontend.
- **Màu:** nền trang chuyển sang xám nhạt và nội dung nằm trong thẻ trắng. Thanh trên đổi từ xám than sang trắng, logo chuyển lên thanh trên. Thanh bên giữ xám than. Cam logo `#F39830` giữ làm màu chủ đạo.
- **Đăng nhập:** bố cục mới theo mẫu (nền tối có ảnh nhà máy, mặt trời cam bên trái, thẻ đăng nhập bên phải). Luồng đăng nhập giữ nguyên, kể cả bước chọn ĐVCS.
- **Mức xáo trộn: thấp.** Vị trí menu, nút, phím tắt, các bước thao tác giữ nguyên; người dùng chỉ thấy màu và vài nhãn đổi. Rủi ro chính nằm ở CSS riêng của vài màn (dàn chuyền, Chuẩn bị SX, Nhân sự) và ở chế độ tối: phải rà từng màn (task 5.11.4).
- **Có 8 điểm cần chốt trước khi làm** (mục 4). Phần lớn là chỗ ảnh mẫu trái với quy tắc tương phản, quy tắc chữ đã ghi trong `10-giao-dien.md` mục 12. Mục 5 là các điểm tôi tự chọn; bạn không trả lời thì làm theo đó.
- **Thời điểm:** bắt đầu khi phiên làm 5.10 kết thúc (đã chốt 12/10/2026).

## 1. Mục tiêu và phạm vi

Trong phạm vi:
1. Màn đăng nhập giống ảnh mẫu Login.
2. Bộ màu (design system) của toàn ứng dụng theo ảnh mẫu Kế hoạch xuất hàng: thanh trên, thanh bên, dải menu con, nền trang, nút, ô nhập, lưới, phân trang.

Ngoài phạm vi (không làm trong phase này):
- Chức năng quên mật khẩu thật (tự đặt lại qua email, OTP): cần backend, xem Q3 và câu hỏi Q17 ở `02-trang-thai.md`.
- Bố cục bên trong từng màn nghiệp vụ. Ảnh mẫu Kế hoạch xuất hàng có tiêu đề, dải lọc, lưới, chân lưới gần giống màn hiện có (`WorkPage`, `DataGrid`), nên chỉ đổi màu.
- Đổi font, đổi màu logo.

## 2. Hiện tại và theo mẫu

| Phần | Hiện tại | Theo mẫu |
|---|---|---|
| Thanh trên | Xám than `#2B2C2D`, chữ trắng, cao 56px, nằm bên phải thanh bên | Trắng, chạy hết chiều ngang, chứa logo; viền dưới mảnh |
| Logo | Ở đầu thanh bên, đặt trên khung trắng | Ở góc trái thanh trên, không khung |
| Nhãn "MES - VSN" | Ô vuông cam nhỏ, chữ đen | Viên thuốc cam bo tròn, có biểu tượng nhà máy, chữ trắng |
| Nút ĐVCS | Trong suốt trên nền tối | Nền xám nhạt bo 8px, biểu tượng nhà máy |
| Ô tìm màn hình | Ô "Màn hình" bên trái, nút kính lúp cam bên phải | Ô trắng viền xám, kính lúp bên trái, phím "Ctrl K" bên phải |
| Nút sáng/tối | Một biểu tượng | Hai biểu tượng mặt trời, mặt trăng cạnh nhau; chế độ đang dùng tô cam |
| Nút tài khoản | "Xin chào" và họ tên | Thêm vòng tròn ảnh đại diện |
| Thanh bên | Có logo, mục đang mở có vạch cam | Bắt đầu dưới thanh trên, không logo; mỗi mục có mũi tên ">"; mục đang mở nền sáng hơn, vạch cam, biểu tượng cam |
| Dải menu con | Nền xám than `#3F4041`, chữ trắng | Nền sáng, chữ đậm; tab đang mở chữ cam, vạch cam dưới |
| Nền vùng nội dung | Trắng | Xám nhạt, nội dung nằm trong thẻ trắng bo góc |
| Nút chính | Nền cam, chữ đen | Nền cam, chữ trắng |
| Ô tích, phân trang | Xanh `#007185` | Cam |
| Màn đăng nhập | Trái: khối xám than, mặt trời. Phải: logo và form trên nền trắng | Nền ảnh nhà máy tối, mặt trời phát sáng, khẩu hiệu bên trái; thẻ trắng bên phải; ngày giờ, chân trang |

## 3. Thay đổi dự kiến

### 3.1 Bảng màu (token ở `frontend/src/theme/global.css` và `theme.ts`)

Chế độ sáng. Tỷ lệ tương phản tính theo công thức WCAG; sẽ đo lại bằng công cụ khi làm.

| Vai trò | Token | Hiện tại | Mới | Ghi chú |
|---|---|---|---|---|
| Nền trang (quanh thẻ nội dung) | `--app-bg` | `#FFFFFF` | `#F3F4F6` | |
| Thẻ, lưới, popup | `--app-surface` | `#FFFFFF` | `#FFFFFF` | Giữ |
| Dải lọc, tiêu đề cột | `--app-section` | `#F0F2F2` | `#F7F8FA` | |
| Rê chuột trên dòng | `--app-row-hover` | `#F7FAFA` | `#F5F7FA` | |
| Đường kẻ | `--app-line` | `#D5D9D9` | `#E5E7EB` | |
| Đường kẻ đậm | `--app-line-strong` | `#BBBFBF` | `#D1D5DB` | |
| Viền ô nhập | `--app-input-line` | `#888C8C` | `#8A9099` | Giữ ≥ 3:1 (3,2:1), xem điểm tự chọn 3 |
| Chữ | `--app-ink` | `#0F1111` | `#111827` | |
| Chữ phụ | `--app-ink-soft` | `#565959` | `#4B5563` | ≥ 4,5:1 trên cả nền `#F3F4F6` |
| Thanh trên | `--app-topbar` (mới) | dùng `--app-nav` | `#FFFFFF` | Kèm `--app-topbar-ink` `#111827` |
| Thanh bên | `--app-nav` | `#2B2C2D` | `#2B2C2D` | Giữ |
| Mục đang mở ở thanh bên | `--app-subnav` | `#3F4041` | `#3A3B3D` | |
| Dải menu con | `--app-tabbar` (mới) | dùng `--app-subnav` | `#F3F4F6` | Chữ `#111827` |
| Cam chủ đạo | `--brand` | `#F39830` | `#F39830` | Giữ (màu logo; cam trong mẫu gần như trùng) |
| Cam rê chuột, cam nhạt | `--brand-hover`, `--brand-soft` | `#E0851D`, `#FFF5EA` | Giữ | |
| Chữ màu cam | `--brand-ink` (mới) | – | `#A4560A` | 5,4:1 trên trắng, 4,9:1 trên `#F3F4F6`. Dùng cho tab đang mở, liên kết "Quên mật khẩu?" |
| Nút tìm màu cam | `--search-btn`, `--search-btn-hover` | `#F8B562` | Bỏ | Ô tìm mới không có nút cam |
| Thông tin, dòng đang chọn, vòng focus | `--link` | `#007185` | Giữ | Xem điểm tự chọn 4 |
| Thành công, cảnh báo, lỗi | `--success`, `--warning`, `--error` | | Giữ | |

Chế độ tối: giữ bảng tối hiện có, khai thêm `--app-topbar` `#151C24`, `--app-tabbar` `#0F1418`, `--brand-ink` `#FFB35C`. Logo trên thanh trên đổi sang bản chữ trắng (Q5).

Theme Mantine (`theme.ts`):
- Thang `gray` đổi sang xám trung tính khớp bảng trên.
- `Checkbox`, `Pagination`: màu `link` đổi sang `brand`. `Switch` giữ `teal`.
- Nút chính: màu chữ theo Q1. Nút phụ: nền trắng, viền `--app-line-strong`.
- Bo góc `sm` 4px lên 6px (ô nhập trong mẫu bo tròn hơn); `md` giữ 8px; thẻ nội dung 12px.
- Tiêu đề màn `h1` 21px lên 24px.
- Chiều cao ô nhập, nút, dòng lưới: theo Q2.

### 3.2 Khung ứng dụng (`frontend/src/shell/AppLayout.tsx`, CSS khung)

- Đổi khung từ "thanh bên cao hết màn, thanh trên bên phải" sang "thanh trên hết chiều ngang, bên dưới là thanh bên và nội dung".
- Thanh trên trắng, cao 64px, gồm: logo, nhãn MES - VSN, nút ĐVCS, vạch ngăn, ô tìm, vạch ngăn, nút sáng/tối, vạch ngăn, nút tài khoản. Tên đọc của nút ĐVCS, nút tài khoản giữ nguyên (test khung tìm theo tên đọc).
- Thanh bên rộng 224px lên 240px. Mũi tên ">" theo Q8; đề xuất chỉ để trang trí (`aria-hidden`), bấm vẫn mở màn đầu tiên của nhóm như hiện nay. Rút gọn còn 78px như cũ, logo không còn trong thanh bên nên bản rút gọn chỉ có biểu tượng.
- Nút sáng/tối thành hai nút cạnh nhau có `aria-pressed`. Chế độ đang dùng có nền nhạt và biểu tượng cam, không chỉ phân biệt bằng màu.
- Một lớp bọc thẻ trắng quanh `<Outlet />` trong `AppLayout`, không sửa code từng màn. Màn dùng `WorkPage` vẫn kéo kín tới chân trang.
- Vòng focus trên thanh trên, dải menu con: hiện là viền trắng (vì nền tối), phải đổi về vòng xanh như phần còn lại. Thanh bên vẫn tối nên giữ viền trắng.
- Điện thoại (≤ 767px): giữ thanh nút ở đáy. Thanh trên trắng, logo thu còn hình mặt trời. Thẻ trắng bỏ viền, bo góc để không mất bề ngang. ≤ 400px ẩn nhãn MES - VSN như cũ.
- `index.html` (`theme-color`), `manifest.webmanifest` (`theme_color`): `#2B2C2D` đổi sang màu thanh trên mới.

### 3.3 Màn đăng nhập (`frontend/src/features/auth/LoginPage.tsx`, CSS `.login-*`)

Bố cục theo mẫu:
- **Nền:** ảnh nhà máy chụp từ trên cao, phủ lớp tối. Mặt trời cam phát sáng ở mép trái vẽ bằng CSS (như hiện có, không dùng ảnh), kèm cung cam mảnh.
- **Góc trái trên:** logo bản nền tối. **Góc phải trên:** ngày và giờ theo đồng hồ máy người dùng, ví dụ "Thứ 7, 11/10/2026" và "08:45", cập nhật mỗi phút. Đồng hồ là thành phần riêng nên không làm form vẽ lại.
- **Giữa bên trái:** "MES SYSTEM" có vạch cam; "Kết nối dữ liệu" (trắng) và "Kiến tạo hiệu quả" (cam); đoạn mô tả ngắn.
- **Thẻ bên phải:** logo, "MES - MANUFACTURING EXECUTION SYSTEM", tiêu đề "Chào mừng trở lại", dòng "Đăng nhập để tiếp tục công việc của bạn.", ô "Tài khoản" (biểu tượng người), ô "Mật khẩu" (biểu tượng khóa, nút hiện mật khẩu), "Ghi nhớ đăng nhập", liên kết "Quên mật khẩu?", nút Đăng nhập, dòng chân "Hệ thống dành cho sản xuất VIETSUN".
- **Chân trang:** "VIETSUN GROUP", "MES SYSTEM", "VERSION x.y.z" bên trái; "Warming Your Life" bên phải. Vạch ngăn vẽ bằng CSS, không dùng ký tự "|".

Giữ nguyên toàn bộ hành vi đang có (`10-giao-dien.md` mục 5.4):
- Một form. Tài khoản nhiều ĐVCS: đúng mật khẩu thì hai ô khóa lại, ô chọn ĐVCS mở ngay trong thẻ, nút đổi thành "Vào làm việc"; có "Đăng nhập tài khoản khác".
- Điền sẵn tên đã nhớ, đọc giá trị trình duyệt tự điền lúc gửi, các thông báo lỗi, thông báo bị đẩy ra.
- Giữ `name` và `autocomplete` của hai ô, nên mật khẩu trình duyệt đã lưu vẫn tự điền.

Màn hẹp và chế độ tối:
- ≤ 1024px: bỏ đoạn mô tả, thu nhỏ khẩu hiệu.
- ≤ 860px: một cột, phía trên là dải logo và khẩu hiệu ngắn, thẻ ở dưới; mặt trời nhỏ lệch phải. Bề rộng 360px không cuộn ngang.
- Chế độ tối: nền vẫn tối; thẻ đổi sang nền tối của ứng dụng, logo trong thẻ dùng bản chữ trắng.

## 4. Cần chốt trước khi làm

Ảnh mẫu có vài chỗ trái với quy tắc đã ghi (`10-giao-dien.md` mục 12, `13-quyet-dinh.md` mục 12.2). Theo `CLAUDE.md`, gặp chỗ khác nhau thì báo lại, không tự chọn.

| # | Câu hỏi | Phương án | Đề xuất | Chốt |
|---|---|---|---|---|
| Q1 | Chữ và biểu tượng trên nền cam (nút chính, nhãn MES - VSN, trang đang chọn, dấu tích). Mẫu dùng chữ trắng trên `#F39830`: tương phản 2,3:1, dưới mức 4,5:1 của quy tắc C.1. Quyết định 12.2 chọn chữ đen chính vì lý do này | (a) Giữ chữ đen trên cam: 8,4:1, đạt chuẩn, khác mẫu ở màu chữ. (b) Chữ trắng đậm trên cam đậm hơn `#D9730D`: 3,3:1, chỉ đạt chuẩn cho chữ lớn; gần mẫu nhất mà vẫn đọc được. (c) Đúng mẫu: chữ trắng trên `#F39830`, 2,3:1, khó đọc dưới đèn xưởng, màn hình rẻ | (a) | Giữ chữ đen trên cam (a) |
| Q2 | Mật độ. Theo tỷ lệ trong ảnh, mẫu thưa hơn hiện tại (ô nhập khoảng 38px, dòng lưới khoảng 48px; hiện là 31px và khoảng 30px) | (a) Giữ mật độ hiện tại, chỉ đổi màu. (b) Theo mẫu: mỗi màn hiện ít hơn khoảng một phần ba số dòng, phải rà lại mọi lưới, lưới nhập, dàn chuyền | (a), vì người dùng MES xem nhiều dòng một lúc | Giữ mật độ hiện tại (a) |
| Q3 | "Quên mật khẩu?": hệ thống chưa có chức năng này (hiện chỉ quản trị viên đặt lại) | (a) Bấm vào mở hộp nhỏ "Liên hệ quản trị viên để đặt lại mật khẩu", không cần backend. (b) Bỏ liên kết. (c) Làm chức năng tự đặt lại: cần backend, email hoặc OTP, ngoài phạm vi | (a) | Hộp hướng dẫn liên hệ quản trị viên (a) |
| Q4 | Ngoại lệ quy tắc chữ cho riêng màn đăng nhập. Mẫu có nút "ĐĂNG NHẬP →" viết hoa kèm mũi tên, nhãn trang trí viết hoa ("MES SYSTEM", chân trang), ô nhập không có dấu * (quy tắc B.4: không viết hoa cả nhãn, không thêm "→" vào nút; D.1: ô bắt buộc có dấu *) | (a) Cho ngoại lệ ở màn đăng nhập: viết hoa bằng CSS (trình đọc màn hình vẫn đọc chữ thường), mũi tên là biểu tượng ẩn với trình đọc màn hình, bỏ dấu * (thiếu thì vẫn báo ngay dưới ô). (b) Giữ quy tắc: nút "Đăng nhập", có dấu * | (a), vì màn đăng nhập là màn thương hiệu | Cho ngoại lệ ở màn đăng nhập (a) |
| Q5 | Ảnh nền nhà máy, logo bản nền tối (chữ VIET màu trắng), file thiết kế gốc. Repo chưa có ảnh nền và logo nền tối. Ảnh nền trong ảnh mẫu không rõ nguồn nên không cắt ra dùng. Nếu ảnh mẫu được xuất từ file thiết kế (Figma, XD, PSD) thì file đó cho đúng mã màu, cỡ chữ, khoảng cách, và tách được ảnh | (a) Bạn gửi ảnh thật nhà máy Vietsun (được phép dùng), logo gốc dạng SVG hoặc PNG nền trong suốt, file thiết kế gốc nếu có. (b) Tôi tạo logo chữ trắng từ `logo-vs.png` (đổi phần chữ xám sang trắng), dùng nền tối không ảnh cho tới khi có ảnh, đo màu và kích thước bằng mắt trên ảnh mẫu | (a); trong lúc chờ thì làm theo (b), có ảnh thì thay file, không sửa code | (a); trong lúc chờ làm theo (b) |
| Q6 | Nhánh và số phase. Thời điểm đã chốt: bắt đầu khi phiên làm 5.10 kết thúc. Phase 5.10 đang có 4 worktree, nhánh nào cũng sửa `global.css` | (a) Tách nhánh mới `phase-5-11` từ `main` sau khi 5.10 đã gộp vào `main`. (b) Tách từ `phase-5-10` sau khi các worktree đã gộp vào nhánh này, nếu 5.10 chưa gộp `main` | (a); số phase 5.11 | Tách `phase-5-11` từ `main` sau khi 5.10 gộp `main` (a) |
| Q7 | Màu xanh lơ `#007185` đang dùng cho hộp thông tin, nhãn "Đang chọn", "Qua đêm", vòng focus, dòng đang đứng trong mọi ô chọn (nền xanh chữ trắng), thanh trên bảng dàn chuyền. Ảnh mẫu không có màu này | (a) Giữ xanh lơ làm màu phụ cho các chỗ trên; ô tích, phân trang đổi sang cam như mẫu. (b) Bỏ hẳn xanh lơ: dòng đang đứng trong ô chọn đổi sang nền cam nhạt chữ đen, vòng focus đổi sang cam đậm `#A4560A`, hộp thông tin sang xám; bảng dàn chuyền cần chọn màu khác (không dùng cam vì trùng màu cảnh báo, ô bắt buộc) | (a), vì cần một màu khác cam, và (b) phải rà thêm dàn chuyền | Giữ xanh lơ làm màu phụ (a) |
| Q8 | Mũi tên ">" cạnh mỗi nhóm ở thanh bên. Hiện bấm một nhóm là mở màn đầu tiên của nhóm, các màn con nằm ở dải menu con phía trên nội dung | (a) Chỉ để trang trí, hành vi giữ nguyên. (b) Rê chuột hoặc bấm mũi tên mở danh sách màn con bay ra bên phải thanh bên (thêm thành phần mới, cần test bàn phím, điện thoại) | (a) | Chỉ trang trí (a) |

## 5. Điểm tự chọn (bạn có thể đổi)

1. Giữ cam logo `#F39830`; cam trong mẫu gần như trùng.
2. Chữ màu cam dùng cam đậm `--brand-ink` `#A4560A`. Cam sáng như mẫu chỉ đạt 2,3:1 trên nền trắng.
3. Viền ô nhập giữ mức 3:1 (`#8A9099`) dù mẫu nhạt hơn (khoảng 1,5:1). Ô trắng nằm trên dải lọc xám nhạt, viền nhạt thì khó thấy ô ở đâu.
4. Màu xanh `#007185`: theo Q7.
5. Giữ font Source Sans 3: mẫu dùng font tương tự, font tự host chạy được khi không có Internet.
6. Nhãn "Ghi nhớ đăng nhập" theo mẫu, hành vi giữ nguyên: nhớ tên, nhờ trình duyệt lưu mật khẩu, không giữ phiên lâu hơn.
7. Ngày giờ ở màn đăng nhập lấy theo đồng hồ máy người dùng.
8. Phiên bản ở chân trang lấy từ `frontend/package.json`, hiện là `0.1.0` (mẫu ghi 1.0.0). Muốn hiện 1.0.0 thì nâng số phiên bản trong file đó.
9. Giữ tiếng Anh như mẫu cho "MES - MANUFACTURING EXECUTION SYSTEM", "MES SYSTEM", "Warming Your Life" (tên hệ thống, khẩu hiệu thương hiệu).
10. Giữ chế độ sáng/tối mặc định theo hệ điều hành như hiện nay. Máy đặt chế độ tối sẽ thấy bản tối, không giống ảnh mẫu (ảnh mẫu là bản sáng).
11. Dừng để bạn xem trên app sau task 5.11.3 (khung và màn đăng nhập xong), rồi mới rà toàn bộ các màn ở task 5.11.4. Tránh rà hết rồi mới phát hiện cần đổi hướng.
12. Ở bước chọn ĐVCS, thẻ đăng nhập giữ tiêu đề "Chào mừng trở lại", dòng dưới đổi thành "Xin chào, <họ tên>. Chọn đơn vị cơ sở để vào làm việc."

## 6. File sẽ sửa

| File | Thay đổi |
|---|---|
| `frontend/src/theme/global.css` | Token sáng, tối; CSS khung (thanh trên, thanh bên, dải menu con, thẻ nội dung, bản điện thoại); viết lại khối `.login-*`; bỏ CSS ô tìm cũ; sửa quy tắc vòng focus trên thanh trên, dải menu con |
| `frontend/src/theme/theme.ts` | Thang `gray`, màu chữ nút chính (Q1), `Checkbox`, `Pagination` sang `brand`, bo góc, cỡ `h1` |
| `frontend/src/shell/AppLayout.tsx` | Cấu trúc khung mới, logo lên thanh trên, mũi tên thanh bên, ô tìm, nút sáng/tối, ảnh đại diện, lớp bọc thẻ trắng |
| `frontend/src/shell/BranchSwitcher.tsx` | Kiểu nút trên nền sáng (chỉ class và biểu tượng, không đổi logic) |
| `frontend/src/components/BrandMark.tsx` | Bỏ khung trắng khi đặt trên nền sáng; bản chữ trắng cho nền tối |
| `frontend/src/features/auth/LoginPage.tsx` | Bố cục, nhãn, biểu tượng mới; đồng hồ; "Quên mật khẩu?"; chân trang. Phần xử lý form giữ nguyên |
| `frontend/public/` | Thêm logo nền tối, ảnh nền đăng nhập (WebP, khoảng 200 KB) |
| `frontend/index.html`, `frontend/public/manifest.webmanifest` | Màu `theme-color` |
| `frontend/vite.config.ts` | Đưa số phiên bản vào code (cho chân trang đăng nhập) |
| `frontend/src/test/login.test.tsx` | Sửa khoảng 15 chỗ tìm theo nhãn cũ ("Tên đăng nhập", "Nhớ tài khoản và mật khẩu", tiêu đề "Đăng nhập"); thêm bài cho "Quên mật khẩu?" |
| CSS riêng của từng màn trong `global.css` | Chỉ sửa chỗ lệch tìm ra khi rà (task 5.11.4) |

Không sửa: `backend/*`, `store/*`, `lib/api.ts`, route, menu, `DataGrid`, `SheetGrid` (trừ CSS), code các màn nghiệp vụ.

## 7. Ảnh hưởng và mức xáo trộn

| Đối tượng | Ảnh hưởng | Mức | Cách giảm |
|---|---|---|---|
| Người dùng cuối | Thấy giao diện khác: thanh trên trắng, logo lên thanh trên, nền xám quanh nội dung, vài nhãn ở màn đăng nhập đổi. Vị trí menu, nút, Ctrl K, các bước đăng nhập và chọn ĐVCS giữ nguyên, không phải học lại | Thấp | Báo trước cho người dùng demo |
| Mật khẩu trình duyệt đã lưu | Vẫn tự điền vì giữ `name`, `autocomplete` của hai ô | Không | Có test |
| Dữ liệu lưu trên trình duyệt | Giữ các khóa `mes.username`, `mes.nav.collapsed`, `mes.branch.*` | Không | |
| Backend, API, database, phân quyền, seed | Không đụng | Không | Không cần migrate, seed; triển khai chỉ cần build lại frontend |
| Các màn nghiệp vụ | Đổi màu qua token, không sửa code từng màn; nằm trong thẻ trắng | Thấp đến trung bình | Rà từng màn. Dàn chuyền, Chuẩn bị SX, Nhân sự, Danh mục có CSS riêng; `global.css` có 118 mã màu viết cứng |
| Chế độ tối | Phải khai đủ token mới cho chế độ tối, logo bản chữ trắng | Trung bình | Rà riêng chế độ tối ở mọi màn |
| Điện thoại | Thanh trên đổi màu, logo nhỏ lại; thanh nút ở đáy giữ nguyên | Thấp | Kiểm ở 360px |
| Test frontend | `login.test.tsx` phải sửa theo nhãn mới. Test khung tìm theo vai trò và tên đọc; giữ tên đọc thì không phải sửa | Thấp | |
| Việc song song (5.10) | 4 worktree cùng sửa `global.css` | Trung bình | Q6 |
| Hiệu năng | Không thêm thư viện. Ảnh nền chỉ tải ở màn đăng nhập | Thấp | Nén WebP; có nền màu thay thế khi ảnh chưa tải |

Rủi ro đã thấy khi đọc code:
- CSS riêng giả định thanh trên tối hoặc nền trang trắng. Ví dụ quy tắc `:is(.rail, .topbar, .tabbar) .focus-ring` cho viền focus trắng: không sửa thì vòng focus thành trắng trên nền trắng, người dùng bàn phím mất dấu.
- Lớp bọc thẻ trắng: màn dùng `height: 100%` (`WorkPage`) phải vẫn kéo kín tới chân trang; trên điện thoại trang cuộn theo nội dung.
- Popup, Spotlight, thông báo nằm ngoài thẻ nên không bị ảnh hưởng.

## 8. Các bước

| Task | Nội dung | Tiêu chí xong | Ước lượng |
|---|---|---|---|
| 5.11.0 | Chốt Q1–Q6; nhận tài sản hoặc dùng bản tạm (Q5); ghi quyết định 12.3 vào `13-quyet-dinh.md` | Bảng mục 4 có cột Chốt | – |
| 5.11.1 | Token màu, `theme.ts` cho cả sáng và tối; chưa đổi bố cục | Mọi màn đổi màu; tương phản đo đạt (trừ ngoại lệ đã chốt); lint, test qua | 0,5 ngày |
| 5.11.2 | Khung ứng dụng: `AppLayout`, `BranchSwitcher`, `BrandMark`, CSS khung, `theme-color` | Kiểm ở màn rộng, thanh bên rút gọn, 768px, 360px, sáng, tối, chỉ dùng bàn phím; test khung qua | 1 ngày |
| 5.11.3 | Màn đăng nhập: bố cục, đồng hồ, chân trang, "Quên mật khẩu?", tài sản ảnh | Luồng một ĐVCS, nhiều ĐVCS, lỗi, tự điền mật khẩu giữ nguyên; `login.test.tsx` qua; 360px; sáng, tối | 1 ngày |
| 5.11.4 | Rà từng màn: Trang chủ, nhóm Đơn hàng (kể cả dàn chuyền), Kế hoạch chuẩn bị SX, Nhân sự, Quản trị, Danh mục, Đồng bộ, trang lỗi; sửa chỗ lệch | Không còn chữ, viền dưới chuẩn; không còn mảng nền lệch màu ở cả sáng và tối | 1 ngày |
| 5.11.5 | Tài liệu, `code-reviewer`, `npm run lint && npm test && npm run build` | Không còn `CRITICAL`/`HIGH`; báo cáo ở `docs/review/phase-5-11.md` | 0,5 ngày |

Tổng khoảng 4 ngày làm việc. Mỗi task kết thúc ở trạng thái chạy được. Dựng giao diện dùng skill `frontend-design` theo quy định, với ảnh mẫu và quyết định 12.3 làm brief.

## 9. Kiểm tra trước khi báo xong

- `npm run lint && npm test && npm run build`.
- Đo tương phản tự động (Lighthouse mục Accessibility, script đọc màu) ở các màn chính, cả sáng và tối.
- Mở thử ở 1440px, 1024px, 768px, 360px; thanh bên rút gọn; chỉ dùng bàn phím (Tab, Ctrl K); trình duyệt tự điền mật khẩu.
- Không chụp ảnh màn hình có dữ liệu thật (`14-quy-trinh-lam-viec.md`).

## 10. Quay lui

Chỉ đổi frontend, không có migration: revert commit của phase rồi build lại là về giao diện cũ. Dữ liệu và phiên đăng nhập của người dùng không bị ảnh hưởng.

## 11. Tài liệu phải sửa khi làm

- `10-giao-dien.md`: mục 5.4 (nhãn và bố cục màn đăng nhập), 6.1 (bố cục khung), 11.1, 11.2 (token, theme), 12 (ngoại lệ đã chốt ở Q1, Q4 nếu có).
- `13-quyet-dinh.md`: thêm mục 12.3 "Design system theo mẫu 12/10/2026" (áp dụng, lý do, hệ quả); ghi rõ phần màu, bố cục khung của 12.1, 12.2 đã được thay; sửa tên nhãn ở mục 6.6.
- `02-trang-thai.md`: trạng thái phase.
- Comment đầu `global.css` hiện ghi token theo `docs/nguon/orange-cart-DESIGN.md`: đổi sang nguồn mới.
