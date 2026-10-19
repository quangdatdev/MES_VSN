# Review code bằng agent `code-reviewer`

Agent: `.claude/agents/code-reviewer.md`. Mục đích: mỗi phase có một lượt review độc lập trước khi đưa người dùng duyệt, tập trung vào phân quyền, lọc nhà máy và bảo mật — phần mà lỗi khó thấy bằng mắt và tốn kém nếu lọt.

## Khi nào review

| Thời điểm | Phạm vi | Bắt buộc |
|---|---|---|
| Cuối mỗi phase, trước khi chuyển `Ready for review` | Mọi file thêm/sửa trong phase (mục "Phạm vi review" của file phase) | Có |
| Ngay khi sửa phần rủi ro cao, không đợi cuối phase | `platform/auth`, `platform/data` (`BaseRepository`, Resource Registry), `PermissionGuard`, API `/admin/*`, migration, script reset/seed | Có |
| Trước khi triển khai lên máy UAT/Production | Toàn bộ backend + migration | Có |
| Sửa giao diện thuần (màu, bố cục) | Không cần, trừ khi chạm logic ẩn/hiện theo quyền | Không |

## Cách chạy

1. Phiên chính gọi agent `code-reviewer` với: danh sách file (dự án chưa có git nên không dùng `git diff`), checklist bên dưới, và yêu cầu **chỉ đọc, không sửa file**.
2. Agent trả kết quả theo mức `CRITICAL / HIGH / MEDIUM / LOW`.
3. Phiên chính kiểm chứng từng phát hiện (đọc code, chạy test) trước khi sửa: phát hiện sai thì ghi "không phải lỗi" kèm lý do.
4. Sửa xong chạy lại lint + test; với `CRITICAL/HIGH` thêm test chứng minh đã sửa nếu được.
5. Ghi báo cáo vào `docs/review/phase-<N>.md` theo mẫu bên dưới.

## Cổng chặn

- Còn `CRITICAL` hoặc `HIGH` chưa xử lý thì phase **không** được chuyển `Ready for review`.
- `MEDIUM` / `LOW`: sửa ngay, hoặc ghi rõ "để Phase X" / "không sửa" kèm lý do. Người dùng duyệt danh sách này cùng phase.

## Checklist riêng của MES (đưa cho agent mỗi lần review)

Phân quyền và dữ liệu (CLAUDE.md mục 4):
- Mọi endpoint có `@Public`, `@Authenticated` hoặc `@RequirePermission`; quyền đúng hành động (đọc `view`, ghi `create/update/delete`).
- `BranchCode` chỉ lấy từ token (`AuthUser`/`Scope`), không đọc từ body, query, header.
- Dữ liệu nghiệp vụ theo nhà máy chỉ đi qua `BaseRepository`; không SQL thô hay điều kiện phân quyền tự viết trong controller/service.
- `getById`, update, delete cũng lọc nhà máy; bản ghi nhà máy khác trả 404.
- `A00` (đơn vị tổng hợp) đọc được tất cả, mọi thao tác ghi bị từ chối.
- Tài nguyên mới khai báo trong `SysResource` (`ScopeType`, `SourceTable`).
- Không tự nâng quyền: không sửa vai trò/quyền/nhà máy/trạng thái của chính mình.
- Thay đổi phân quyền, đăng nhập, ghi dữ liệu có ghi `SysAuditLog`; đổi quyền tăng `PermissionVersion`.

Database (CLAUDE.md mục 5):
- Schema chỉ đổi qua migration; tên PascalCase, số ít; `BranchCode VARCHAR(10)` có index.
- Không xóa vật lý bảng danh mục; FK vật lý chỉ trong cùng database; khóa ngầm khai báo trong `softkeys.json`.
- `UPDATE/DELETE` luôn có `WHERE`; không N+1 trong vòng lặp với dữ liệu lớn.

Bảo mật chung:
- Không mật khẩu, chuỗi kết nối, khóa bí mật trong code hay file commit (chỉ `.env`).
- Đầu vào được kiểm (DTO + `ValidationPipe whitelist`); tên cột sắp xếp lấy từ danh sách trắng.
- Lỗi trả về không lộ chi tiết nội bộ; cookie phiên `httpOnly`, `sameSite`.

Frontend:
- Giao diện theo `docs/thiet-ke/quy-tac-ui-ux.md` (thành phần chung, không mất phần đang nhập, nút khóa nói lý do, trạng thái tải/lỗi/rỗng, cỡ chữ, tương phản, điện thoại).
- Giao diện chỉ ẩn/hiện, không là nơi duy nhất chặn quyền; nút ghi ẩn ở `A00` nhưng backend vẫn chặn.
- Không lưu token vào `localStorage`.
- Chữ hiển thị tiếng Việt có dấu, thông báo lỗi rõ cách xử lý.

TypeScript: hạn chế `any` (chỗ nào giữ lại phải có lý do), Promise được `await`, không bỏ qua lỗi im lặng.

## Mẫu báo cáo `docs/review/phase-<N>.md`

```
# Review Phase <N> – <ngày>
Phạm vi: <số file>, <danh sách thư mục/file>
Kết luận agent: BLOCK / APPROVE WITH SUGGESTIONS / APPROVE

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| 1 | HIGH | backend/src/...:42 | ... | Đã sửa, thêm test ... | Đóng |
| 2 | LOW | ... | ... | Để Phase 5.1 | Hoãn |
| 3 | MEDIUM | ... | ... | Không phải lỗi: ... | Bỏ |

Lint/test sau khi sửa: ...
```

## Khuyến nghị
- **Khởi tạo git và commit cuối mỗi phase.** Khi đó review theo `git diff` giữa hai phase, chính xác hơn liệt kê file bằng tay.
- **Bỏ `Write`, `Edit` khỏi `tools` của agent** để agent chỉ đọc và báo cáo. Hiện quy ước "chỉ đọc" mới nằm trong lời gọi, chưa được cưỡng chế.
