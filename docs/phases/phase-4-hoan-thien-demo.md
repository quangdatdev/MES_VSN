# Phase 4 – Hoàn thiện demo

**Trạng thái:** Approved (09/10/2026) · **Ước lượng:** 0,75 ngày · **Phụ thuộc:** Phase 3 duyệt

## Mục tiêu
Bản demo ổn định, có kịch bản rõ ràng để trình lãnh đạo, chạy được ở máy demo hoặc UAT.

## Việc cần làm
| # | Task | Tiêu chí hoàn thành | Trạng thái |
|---|---|---|---|
| 4.1 | Hoàn thiện dữ liệu mẫu và 4 tài khoản demo | Đăng nhập được cả 4; họ tên đổi sang tên giả tự nhiên | Done |
| 4.2 | Kịch bản demo từng bước (≤10 phút) | `docs/kich-ban-demo.md` | Done |
| 4.3 | Script khởi tạo lại môi trường (đặt lại dữ liệu về trạng thái đầu) | `npm run reset:demo -- --yes` | Done |
| 4.4 | Chạy trên máy demo/UAT: build, cấu hình, HTTPS nội bộ nếu cần PWA | `npm run demo`: một cổng, in địa chỉ LAN. Đã thử qua IP LAN với giả lập điện thoại; **chưa thử điện thoại thật**. Chưa có HTTPS | Done (cần thử máy thật) |
| 4.5 | Rà lỗi giao diện, chính tả tiếng Việt, trạng thái rỗng/lỗi | Danh sách lỗi bên dưới, đã sửa hết | Done |
| 4.6 | Slide/tóm tắt 1 trang: đã có gì, chưa có gì, lộ trình tiếp theo | `docs/tom-tat-demo.md` | Done |
| 4.7 | Hướng dẫn chạy dự án trong `README.md` | `README.md` | Done |
| 4.8 | Review code Phase 1–4 bằng agent `code-reviewer` (Phase 1–3 được duyệt khi chưa có agent này) | Báo cáo `docs/review/phase-1-4.md`; không còn `CRITICAL`/`HIGH` mở; lint + test qua sau khi sửa | Done |

## Tiêu chí review
- [x] Đã review bằng `code-reviewer`, không còn `CRITICAL`/`HIGH` mở (task 4.8)
- [ ] Chạy kịch bản demo từ đầu đến cuối không lỗi, hai lần liên tiếp
- [ ] Demo trên điện thoại thật
- [ ] Nói rõ trong buổi demo: dữ liệu là giả, chưa có nghiệp vụ module
- [ ] Danh sách "chưa làm" khớp Phase 5

## Không làm
Tính năng mới. Chỉ sửa lỗi và đánh bóng.

## Kết quả
- **Tài khoản:** 4 tài khoản demo đăng nhập được; họ tên giả đổi thành tên tự nhiên (Phạm Quốc Hưng, Lê Thị Mai, Nguyễn Văn Tâm), cập nhật cả `seed-demo.md`.
- **Khởi tạo lại:** `npm run reset:demo -- --yes` (`backend/scripts/reset-demo.ts`): xóa PO và nạp lại 36 PO mẫu; đặt lại tên nhà máy, vai trò, ma trận quyền, 4 tài khoản (mật khẩu, mở khóa, vai trò, nhà máy); vô hiệu hóa người dùng/vai trò/nhà máy tạo thêm; thu hồi mọi phiên; ghi `DEMO_RESET` vào nhật ký. Thiếu `--yes` thì chỉ in mô tả, không làm gì. `seed.ts` tách thành hàm `runSeed` để dùng lại.
- **Chạy bản demo:** `npm run demo` build cả hai phần rồi chạy backend với `--serve-web`, phục vụ luôn giao diện cùng cổng, nghe trên mọi địa chỉ mạng và in địa chỉ LAN. Thêm `COOKIE_SECURE` (mặc định theo `NODE_ENV`); helmet không ép HTTPS khi cookie không bắt buộc HTTPS.
- **Kịch bản đã thử trên trình duyệt** (qua IP LAN, giả lập điện thoại 390px): đăng nhập, giữ phiên khi tải lại, thêm PO trên giao diện, ma trận phân quyền, bỏ quyền Xem PO của Kế hoạch thì phía điện thoại tải lại thấy "chưa có quyền", bật lại thì trở lại.
- **Kiểm tra:** lint sạch, backend 33 test, frontend 6 test, build qua.

### Review code Phase 1–4 (4.8)
- Ba lượt `code-reviewer` trên 85 file, báo cáo ở `docs/review/phase-1-4.md`. Tổng: 1 CRITICAL, 4 HIGH, 17 MEDIUM, 28 LOW. Mọi phát hiện đều đúng khi kiểm lại code.
- **Đã đóng mọi CRITICAL/HIGH**, mỗi lỗi có test:
  - đăng xuất khi token đã hết hạn;
  - vượt khóa đăng nhập bằng request song song;
  - giả IP qua `X-Forwarded-For`;
  - token cũ còn dùng được sau khi thu hồi phiên;
  - tự bật lại vai trò mình đang giữ.
- Quyết định mới (ADR 0004): access token mang `sid` của phiên; logout dùng cookie, không cần token; trần quyền quản trị `admin.*`; thay đổi phân quyền ghi audit và tăng version trong cùng transaction.
- `reset-demo` chỉ chạy với SQL Server trên chính máy demo; `seed` chạy lại không cấp lại quyền đã thu hồi (`--sync-matrix` để nạp đủ).
- Kiểm tra sau khi sửa: lint sạch; backend 46 test (13 test mới), frontend 12 test (6 test mới); build qua; thử lại trên trình duyệt.

### Lỗi giao diện đã sửa (4.5)
| Lỗi | Sửa |
|---|---|
| Trường bắt buộc nền vàng cố định, chữ khó đọc ở chế độ tối | Dùng biến màu có bản tối |
| Trên điện thoại, tab đang mở nằm khuất trong dải tab | Tự cuộn tab đang mở vào giữa |
| Chữ tắt avatar lấy hai từ cuối ("Lê Thị Mai" ra "TM") | Lấy chữ đầu họ và tên ("LM") |
| Màn PO bị từ chối quyền vẫn hiện "Nhà máy này chưa có PO" | Hiện đúng thông báo lỗi từ máy chủ |
| Thông báo sau khi thêm PO ghi "Đã lưu" trong khi nút là "Thêm PO" | Đổi thành "Đã thêm" |
| Màn Nhà máy trên điện thoại: nút Đổi tên bị đẩy ra ngoài màn | Thu hẹp cột tên |
| Trang 404 nhắc "menu bên trái", trên điện thoại menu ở dưới | Bỏ chữ "bên trái" |
| Màn Phân quyền mở ra vai trò của chính mình (không sửa được) | Mặc định chọn vai trò đầu tiên mình không giữ |

### Phát sinh
- Người dùng yêu cầu đổi toàn bộ màu, chữ, nút, ô nhập theo `docs/nguon/orange-cart-DESIGN.md` (ghi ở ADR 0003). Đã làm trong phase này vì chỉ là giao diện, không đổi chức năng.
- Mâu thuẫn tài liệu: `api-contract.md` yêu cầu trả 423 khi khóa tài khoản, còn checklist review yêu cầu không lộ tài khoản có tồn tại. Hiện giữ 423; chờ người dùng chọn.

### Còn lại cho người duyệt
- Chạy kịch bản `docs/kich-ban-demo.md` trên **điện thoại thật** và máy demo, hai lần liên tiếp (tiêu chí review). Có thể cần mở cổng tường lửa (lệnh trong `README.md`).
- Bảng ở các màn danh sách cuộn ngang trên điện thoại (chưa có dạng thẻ cho màn hẹp; đây là tính năng mới nên để Phase 5).
- Bộ test backend chạy trên database demo và để lại tài khoản `test.planner` đã vô hiệu; chạy `reset:demo` sau khi test.

## Phạm vi review (task 4.8)
Chia ba lượt để mỗi lượt dưới 20–40 file, đọc kỹ được:

| Lượt | File | Trọng tâm |
|---|---|---|
| 1 – Lõi phân quyền | `backend/src/platform/auth/*`, `platform/data/*`, `platform/permission/*`, `platform/me/*`, `common/*`, `config/env.ts`, `app.factory.ts`, `main.ts` | Bỏ qua xác thực, `BranchCode` từ client, token, cookie, deny by default, A00 |
| 2 – Quản trị, dữ liệu, database | `backend/src/platform/admin/*`, `platform/audit/*`, `modules/demo-po/*`, `migrations/**`, `scripts/*` | Tự nâng quyền, audit, lọc nhà máy ở getById/update/delete, SQL, migration, script reset |
| 3 – Frontend + test | `frontend/src/**` (bỏ qua theme/CSS), `backend/test/*`, `frontend/src/test/*` | Ẩn/hiện khớp backend, lưu token, xử lý lỗi; test có thật sự kiểm hành vi phân quyền |
