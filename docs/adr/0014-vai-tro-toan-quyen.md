# ADR 0014 – Vai trò Toàn quyền, gán cho tài khoản admin

**Trạng thái:** Proposed (làm theo yêu cầu người dùng ngày 12/10/2026) · **Ngày:** 12/10/2026

Thay một phần ADR 0004: phần "tách nhiệm vụ" không còn áp cho **tài khoản** `admin`. Vai trò ADMIN giữ nguyên.

## Bối cảnh
Người dùng cần một vai trò được thêm, sửa, xóa mọi thứ và phân quyền. Trên máy chủ (12/10/2026), cách làm tạm hiện tại vẫn bị chặn ở nhiều chỗ:
- vai trò tự tạo "Admin có quyền Edit" thiếu mọi quyền Xóa, Xuất file; ở các màn Quản trị chỉ có quyền Xem;
- vai trò đó không có chính sách cột, nên cột giá, giấy tờ nhân viên bị Ẩn (mặc định của cột nhạy cảm);
- tài khoản `admin` chỉ có ADMIN: chỉ xem dữ liệu nghiệp vụ (ADR 0004). Không tự gán thêm vai trò cho chính mình được, và ba tài khoản còn lại không có quyền phân quyền, nên không ai gán thêm vai trò cho `admin` qua màn hình được.

Chốt (AskUserQuestion, 12/10/2026):
- mọi quyền, **giữ luật an toàn** của hệ thống;
- gán luôn cho tài khoản `admin`.

## Quyết định

### Quyền của vai trò
Vai trò hệ thống `FULL_ACCESS` "Toàn quyền" (`scripts/seed-data.ts`, `fullAccessLetters`):
- **Nghiệp vụ:** mọi hành động (Xem, Thêm, Sửa, Xóa, Xuất file) trên mọi tài nguyên. Kể cả hành động chưa màn nào có (ví dụ xóa phòng ban) và tài nguyên thêm sau: seed cấp quyền mới cho vai trò này như các vai trò mẫu.
- **Quản trị (`admin.*`):** quyền quản trị của ADMIN theo seed, **trừ những quyền ADMIN không còn có trong database** lúc cấp (phần giao). Theo trần quyền quản trị (ADR 0004), người giữ ADMIN mới gán, sửa được vai trò này; quản trị đã gỡ bớt quyền của ADMIN thì Toàn quyền cũng không có quyền đó.
- **Cột:** mọi cột nhạy cảm (giá, doanh số, giấy tờ nhân viên) **Sửa được**. Cột tính sẵn (Thành tiền, Doanh số) vẫn không nhập được. Chính sách cột lấy mức rộng nhất giữa các vai trò, nên người có thêm vai trò khác vẫn thấy đủ.
- **Phạm vi:** không kèm phạm vi (chuyền, người tạo), nên thấy mọi dòng trong ĐVCS đang làm việc, ở mọi ĐVCS người đó được gán.

### Tạo và gán
- Seed tạo vai trò **một lần**, trong một transaction (`bootstrapFullAccess`): vai trò, quyền, chính sách cột, phép gán, nhật ký `SEED` (`SysAuditLog`, `EntityType = SysRole`), tăng phiên bản quyền. Lỗi giữa chừng thì không còn gì, lần seed sau làm lại.
- **Máy đã cài:** gán cho `admin` khi tạo vai trò, chỉ khi tài khoản đang hoạt động **và** đang giữ ADMIN không kèm phạm vi, còn hiệu lực. Tài khoản quản trị đã bị cố ý hạ quyền (gỡ ADMIN, giới hạn phạm vi, khóa) thì không nhận lại quyền qua đường này; seed in cảnh báo, ghi lý do vào nhật ký.
- **Máy cài mới:** gán khi tạo tài khoản `admin`, cùng vai trò ADMIN.
- Vai trò đã có thì seed không làm lại: quản trị gỡ Toàn quyền khỏi `admin` rồi thì seed chạy lại không gán lại.
- **Ngoại lệ có chủ đích:** `npm run seed -- --sync-matrix` và `npm run reset:demo` nạp lại đúng mẫu nên **gán lại** Toàn quyền cho `admin` đã bị gỡ, như mọi phép gán mẫu khác. Vẫn cùng điều kiện trên: `admin` đã bị vô hiệu hóa, hoặc vai trò ADMIN của `admin` đang bị giới hạn phạm vi, thì không gán (không nới quyền).
- Máy đã có vai trò tự tạo trùng mã `FULL_ACCESS` (không phải vai trò hệ thống): seed cảnh báo, không cấp quyền, không gán vai trò đó. Đổi mã vai trò tự tạo rồi chạy lại seed.

### Luật an toàn giữ nguyên với mọi vai trò, kể cả Toàn quyền
- **Đơn vị tổng hợp `A00`:** không ghi được dữ liệu theo ĐVCS (đơn hàng, PO, kế hoạch, dàn chuyền…). Muốn ghi thì chọn một ĐVCS cụ thể. Dữ liệu dùng chung không gắn ĐVCS (phòng ban, hồ sơ nhân viên, danh mục) vẫn ghi được ở `A00`, như vai trò Nhân sự.
- **Ghi theo ĐVCS:** bảng theo ĐVCS chỉ ghi dòng của ĐVCS đang làm việc. Đơn hàng, PO dùng chung ghi theo ADR 0013 (ĐVCS nguồn, hoặc ĐVCS có PO trong kế hoạch).
- **Không tự đổi quyền của mình** ở màn quản trị (vai trò, ĐVCS, mật khẩu, quyền và chính sách cột của vai trò mình giữ): nhờ một tài khoản quản trị khác.

## Hệ quả
- Tài khoản `admin` vừa phân quyền vừa sửa được dữ liệu nghiệp vụ. Đây là tài khoản rất mạnh: đặt mật khẩu mạnh, ít người dùng chung. Mọi thao tác ghi nhật ký như các tài khoản khác.
- Vai trò ADMIN vẫn chỉ xem nghiệp vụ. Người cần quản trị mà không sửa nghiệp vụ thì chỉ gán ADMIN.
- Người giữ ADMIN (hoặc Toàn quyền) gán được Toàn quyền cho người khác ở Quản trị › Người dùng. Nên có ít nhất hai tài khoản giữ quyền phân quyền, để sửa được quyền của nhau.
- Toàn quyền là vai trò hệ thống: không tắt, không xóa được ở màn Vai trò; muốn bớt thì gỡ khỏi người dùng, hoặc bỏ quyền trong ma trận. Bỏ quyền trong ma trận thì quyền của tài nguyên thêm sau vẫn được seed cấp.
- Sau này ai bớt quyền `admin.*` của ADMIN mà không bớt ở Toàn quyền thì người chỉ giữ ADMIN không gán, sửa được Toàn quyền nữa (trần quyền). Bớt ở cả hai vai trò.
- Máy demo: tài khoản mẫu `quantri` chỉ có ADMIN, dùng minh họa "quản trị chỉ xem, cột giá bị Ẩn" (`docs/kich-ban-demo.md`), vì `admin` nay thấy, sửa được mọi thứ. Test kiểm "chỉ có quyền xem" dùng tài khoản thử chỉ có ADMIN.
- Triển khai lên máy chủ: chạy `npm run migrate` (chạy cả seed) hoặc `npm run seed`. `.env` cần `DEMO_PASSWORD` như mọi lần seed; mật khẩu `admin` đã có không đổi.
