# Review màn đăng nhập và màu theo logo – 11/10/2026

Phạm vi: 8 file frontend: `features/auth/LoginPage.tsx`, `store/auth.ts`, `store/session.ts`, `shell/guards.tsx`, `App.tsx`, `theme/theme.ts`, `theme/global.css` (khối Đăng nhập, token màu), `test/login.test.tsx`, `test/shell.test.tsx`. Đã xóa `features/auth/BranchPickerPage.tsx`. API backend không đổi.
Kết luận agent: APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 2 MEDIUM, 11 LOW)

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| 1 | MEDIUM | `LoginPage.tsx` (BranchStep), `store/auth.ts` (selectBranch) | Bỏ dở bước chọn nhà máy chỉ xóa store, không thu hồi cookie refresh. Máy chủ có thể đã cấp cookie khi select-branch thành công nhưng `/me` lỗi; người sau trên máy dùng chung tải lại trang là vào phiên đó. Đây là lỗi thoái lui so với nút "Dùng tài khoản khác" cũ có gọi `logout()`. | `selectBranch`: lỗi lúc nạp quyền mà đang `preauth` thì gọi `/auth/logout` ngay. Nút "Đăng nhập tài khoản khác" gọi `logout()`. Lỗi 401 dùng `endSession`. Thêm 2 test. | Đóng |
| 2 | MEDIUM | `test/login.test.tsx` | Thiếu test: đọc mật khẩu trình duyệt tự điền, không lưu mật khẩu, 0 nhà máy, lỗi khác 401, `AnonymousOnly` với `preauth`, sai mật khẩu. | Thêm 9 test vào `login.test.tsx` và 1 test vào `shell.test.tsx`. | Đóng |
| 3 | LOW | `LoginPage.tsx` | Mọi lỗi 401 đều báo "hết hạn", kể cả khi mật khẩu vừa đổi hoặc tài khoản bị khóa. | Chỉ `TOKEN_EXPIRED` báo hết hạn; còn lại hiện thông điệp máy chủ trả. Có test. | Đóng |
| 4 | LOW | `store/auth.ts` | `mes.branch` lưu theo máy: người sau được chọn sẵn nhà máy của người trước. | Lưu theo người (`mes.branch.<userId>`), thêm `pendingUserId` vào session. Có test. | Đóng |
| 5 | LOW | `LoginPage.tsx` | Nhãn "Nhớ tài khoản và mật khẩu" hứa nhiều hơn: bỏ tích không xóa mật khẩu trình duyệt đã lưu. | Không sửa: người dùng yêu cầu bỏ chú thích, nhãn theo đúng lời người dùng. Đã báo người dùng. | Bỏ |
| 6 | LOW | `global.css` | Điện thoại 320–360px: mặt trời có thể đè lên dòng phụ đề. | Thu mặt trời còn 180px, lệch phải hơn; chữ nằm trên lớp mặt trời. Đã xem ở 320px. | Đóng |
| 7 | LOW | `LoginPage.tsx` | Liên kết "Đăng nhập tài khoản khác" nhỏ, khó chạm. | Đổi sang `Button variant="subtle"` cỡ md, rộng hết khung. | Đóng |
| 8 | LOW | `LoginPage.tsx` | Tiêu đề tab không đổi theo bước; thông báo hết hạn dùng `role="status"`. | Mỗi bước đặt tiêu đề riêng; thông báo dùng `role="alert"`. Không thêm `aria-describedby` cho nút: tiêu đề bước và ô Nhà máy đứng ngay trên nút. | Đóng |
| 9 | LOW | `LoginPage.tsx` | Từ 7 nhà máy trở lên, ô chọn có tìm kiếm tự mở danh sách khi focus. | `openOnFocus={false}`. | Đóng |
| 10 | LOW | `LoginPage.tsx` | Token tạm hết hạn thì mất tên đăng nhập vừa gõ. | Giữ tên vừa gõ tới khi vào được ứng dụng hoặc bấm đổi tài khoản. Có test. | Đóng |
| 11 | LOW | `store/auth.ts` | `fetchBranchChoices` thành code chết. | Đã xóa. | Đóng |
| 12 | LOW | `App.tsx` | Link cũ `/select-branch` ra trang 404. | Chuyển về Trang chủ. | Đóng |
| 13 | LOW | `global.css`, `quy-tac-ui-ux.md` | Còn màu sọc vàng cũ `#ffb84d`; quy tắc A.1 ghi "nút chính (vàng)". | Đổi sang `#f8b562`, sửa chữ thành "cam". | Đóng |

Lint/test sau khi sửa: `tsc`, `eslint` qua; frontend 144 test qua; `npm run build` qua. Một lần chạy cả bộ có 1 test lỗi ở `column-filter.test.tsx`; chạy riêng 3 lần và chạy lại cả bộ đều qua. Lỗi do máy bận (đang chạy hai dev server), không liên quan màn đăng nhập.
