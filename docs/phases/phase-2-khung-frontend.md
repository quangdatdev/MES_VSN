# Phase 2 – Khung frontend

**Trạng thái:** Approved (09/10/2026) · **Ước lượng:** 0,75 ngày · **Phụ thuộc:** Phase 0; chạy song song Phase 1, tích hợp thật khi API sẵn

## Mục tiêu
Ứng dụng React (Mantine) đẹp và thân thiện: đăng nhập, chọn nhà máy, layout với menu động theo quyền, trang trống cho từng module; dùng tốt trên PC và điện thoại. Mục tiêu là một bản demo gây ấn tượng, không phải giao diện khô cứng.

## Việc cần làm
| # | Task | Tiêu chí hoàn thành | Trạng thái |
|---|---|---|---|
| 2.1 | Dựng Vite + React + TS, Mantine, router; theme riêng (màu thương hiệu, Be Vietnam Pro, bo góc mềm, sáng/tối) — bắt buộc dùng skill `frontend-design` (`.claude/skills/`) | `npm run dev:frontend` chạy; theme gom về một file | Done |
| 2.2 | Lớp gọi API (token, refresh, 401/403 thống nhất, theo `docs/thiet-ke/api-contract.md`) | Một nơi duy nhất cấu hình | Done |
| 2.3 | Màn đăng nhập: bố cục có thương hiệu, hiện/ẩn mật khẩu, nhớ tên đăng nhập, lỗi rõ ràng | Dùng được trên điện thoại | Done |
| 2.4 | Màn chọn nhà máy dạng thẻ; `A00` "Toàn công ty" nổi bật; đổi nhà máy ở thanh trên | Chỉ hiện nhà máy được phép | Done |
| 2.5 | Layout: sidebar nhóm menu thu gọn được, header (nhà máy hiện tại, người dùng, đổi giao diện sáng/tối), breadcrumb, Spotlight tìm menu (Ctrl+K) | Đổi Role ⇒ menu đổi | Done |
| 2.6 | Route lazy theo module; trang module chưa làm có hình/hướng dẫn thân thiện thay vì trang trắng | Mỗi mục menu mở được | Done |
| 2.7 | Component `Can`, guard route, trang 403 | Vào đường dẫn không có quyền ⇒ trang 403 | Done |
| 2.8 | Responsive (drawer menu trên điện thoại) + PWA manifest | Dùng được ở 360px; chỉ có manifest và icon, chưa có service worker/offline | Done |
| 2.9 | Skeleton, trạng thái rỗng, toast, xác nhận khi xóa | Không có màn nào trắng hoặc đứng im | Done |
| 2.10 | ~~Chế độ mock khi API chưa xong~~ | Bỏ: backend đã chạy được nên không cần mock | Dropped |

## Tiêu chí review
- [ ] Luồng đăng nhập → chọn nhà máy → vào ứng dụng liền mạch
- [ ] Menu khớp `docs/thiet-ke/seed-demo.md`
- [ ] Giao diện mềm mại, thân thiện, đúng tiếng Việt có dấu; sáng/tối đều đẹp
- [ ] Dùng tốt trên điện thoại
- [ ] FE không giữ logic quyền riêng

## Không làm
Màn nghiệp vụ thật (trừ màn PO demo ở Phase 3), offline, thông báo đẩy.

## Rủi ro
Đánh bóng giao diện dễ ngốn thời gian ⇒ dựa vào component Mantine, tinh chỉnh ở theme và vài màn chính (đăng nhập, chọn nhà máy, layout), không tự dựng component.

## Kết quả
- Mantine 9 (không phải 7 như ADR ghi ban đầu; vẫn cùng họ API), React 19, Vite 8, React Router 7.
- Đã xem thực tế trên trình duyệt: đăng nhập, chọn nhà máy (kể cả `A00`), trang chủ, trang giữ chỗ hiện quyền thật, khôi phục phiên khi tải lại trang, bố cục điện thoại 390px.
- 6 test giao diện qua (guard route, `Can`, 403/404, chế độ tổng hợp), lint sạch, build qua.
- Điểm nhấn thiết kế: đường may chỉ vàng chạy một lần trên màn đăng nhập, nhãn nhà máy viền chỉ may; còn lại để yên.
- Chưa kiểm tra: chế độ tối trên mọi màn, và thao tác bằng bàn phím toàn diện.
