# Review task T18 – API đồng bộ dòng dàn chuyền Đã phân màu cỡ cho hệ thống khác

Phạm vi: `GET /api/v1/order/color-size/sync`, `GET /api/v1/order/color-size/sync/ids` (người dùng yêu cầu gấp 20/10/2026, thay cho view ở `DB_TRUNGGIAN`, [STATUS](../current/STATUS.md) Q53). File: `backend/src/modules/order/order.dto.ts` (`LineSyncQuery`), `order.repositories.ts` (`LineAllocationRepository.changedLines`, `allocatedIds`), `color-size.service.ts` (`sync`, `syncIds`), `order.controller.ts`, `backend/test/phase5.spec.ts` (mục "Đồng bộ dòng dàn chuyền Đã phân màu cỡ"), [06](../update_docs/06-don-hang.md), [STATUS](../current/STATUS.md). Luật: [AGENTS.md](../../AGENTS.md) mục 3.3, 3.5, 4.

Thiết kế: dùng tài nguyên có sẵn `order.colorsize` (bảng `ShipmentPlanLine`), quyền `export` (dữ liệu ra khỏi MES như xuất file), đọc qua `scoped(..., 'export', 'l')` của `BaseRepository`, trả qua `FieldPolicyInterceptor`. Bên gọi đăng nhập bằng tài khoản MES, không thêm cơ chế xác thực mới.

## Lượt 1 – bản đầu

Kết luận agent: REQUEST CHANGES (0 CRITICAL, 1 HIGH, 6 MEDIUM, 7 LOW). Lượt này có cả phần bảo mật (luồng ra hệ thống ngoài, [DEVELOPMENT_WORKFLOW](../DEVELOPMENT_WORKFLOW.md) mục 3.1).
Phiên chính đã kiểm chứng: H1 đúng (lọc `ALLOCATED` làm mất dòng vừa rời trạng thái); M3 đúng (Kysely gửi `Date` dạng `TYPES.DateTime`, tedious ném `Out of range` khi năm < 1753); M4 đúng (`permission.service.ts` bỏ mọi quyền khác khi thiếu `:view`); M5 đúng.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| H1 | HIGH | `order.repositories.ts` (`allocatedChanged`) | Chỉ trả dòng `ALLOCATED`: dòng bỏ hết phần giao (về `PLANNED`), dòng bị xóa không bao giờ được báo; bên nhận giữ số cũ | Câu đổi theo thời gian lấy mọi trạng thái (`changedLines`); dòng không `ALLOCATED` trả Id ở `removedIds`. Thêm `GET /sync/ids` (Id mọi dòng `ALLOCATED` trong phạm vi xuất) để đối chiếu dòng bị xóa. Báo xóa tức thì cần bảng ghi dòng xóa (migration): ghi Q53 | Đóng (phần báo xóa tức thì hoãn) |
| M1 | MEDIUM | Toàn task | Viết code trước khi có quyết định cho chiều MES → bên ngoài (`AGENTS.md` mục 3.5) | Người dùng chốt 21/10/2026: đẩy dữ liệu ra ngoài qua API của MES, tài khoản MES với vai trò sẵn có; ghi [13](../update_docs/13-quyet-dinh.md) mục 8.6 | Đóng |
| M2 | MEDIUM | `color-size.service.ts` (`sync`) | Không phân trang: quá 10.000 dòng thì 422 | Nợ N11 ở STATUS (phân trang theo `(changedAt, Id)`); bên gọi thu hẹp khoảng ngày | Hoãn |
| M3 | MEDIUM | `color-size.service.ts` (`syncInstant`) | `from` năm < 1753 gây 500 | `from` kéo lên mốc sàn `2000-01-01` UTC (`SYNC_FLOOR`); test `from=1752-12-31` → 200. `0001-01-01` bị `IsISO8601({ strict: true })` trả 422 | Đóng |
| M4 | MEDIUM | `docs/current/STATUS.md` mục 3 | Hướng dẫn "vai trò chỉ có quyền `export`" sẽ bị 403 | Sửa: cần `:view` và `:export`; người dùng 21/10 chọn vai trò sẵn có, không tạo vai trò riêng; ghi cả ở 06 | Đóng |
| M5 | MEDIUM | `color-size.service.ts` (`sync`) | `outStartDate`, `outEndDate` không theo chính sách cột, suy ra được Ngày kết thúc | Dùng `derived(…, mức của endDate)` + `withDerived`; test `endDate` Ẩn thì không có hai ngày ra chuyền | Đóng |
| M6 | MEDIUM | Triển khai | Mật khẩu, token, dữ liệu đi qua HTTP nếu máy chủ chưa có HTTPS | Người dùng 21/10/2026 chấp nhận HTTP trong mạng nội bộ; ghi [13](../update_docs/13-quyet-dinh.md) mục 8.6 và hướng dẫn cho bên gọi | Đóng (chấp nhận rủi ro) |
| L1 | LOW | `color-size.service.ts` | Biên `[from, to)` lệch mili giây do tham số `datetime` | `to` mặc định tròn giây; tài liệu: dùng nguyên chuỗi `to`, upsert theo `id`, lấy chồng vài phút được | Đóng |
| L2 | LOW | `color-size.service.ts` | Phụ thuộc giờ máy, mức cô lập đọc (`READ_COMMITTED_SNAPSHOT`) | Ghi tài liệu (lấy chồng vài phút, upsert); trạng thái `is_read_committed_snapshot_on` của `MES_Order`: NEEDS VERIFICATION | Ghi nhận |
| L3 | LOW | Tài liệu | Đổi tên chuyền ở Nhân sự, thu hẹp phạm vi tài khoản, `reset:demo`/`load:bravo`/`sim:board` (Id mới) không được báo | Ghi ở 06 (dòng `GET /sync`) | Đóng |
| L4 | LOW | `phase5.spec.ts` | Thiếu test: `lineCode` Ẩn/Che thì không có `lineName`, đường ghi thật làm đổi dòng, năm < 1753 | Thêm: `lineCode` Che, `endDate` Ẩn; `PUT /order/color-size/:id` với `rows: []` → dòng vào `removedIds`, rời `/sync/ids`; mốc sàn. Phạm vi `LINE`/`OWNER` với quyền `export`, trường hợp quá 10.000 dòng: chưa thêm | Đóng một phần |
| L5 | LOW | `order.repositories.ts` (`lineChangedAt`) | Quét toàn bảng `ShipmentPlanLine` mỗi lần gọi | Nợ N11 (chỉ mục `ModifiedAt`, `CreatedAt` + điều kiện lọc trước, cần migration) | Hoãn |
| L6 | LOW | 06, STATUS | Tài liệu không khớp nhau ("chuyển Đang may", "lấy với `from` thật sớm") | Sửa cả hai | Đóng |
| L7 | LOW | Thiết kế | Nhật ký cột nhạy cảm ghi `VIEW`; đăng nhập lại mỗi 15 phút; mọi vai trò có `order.colorsize:export` đều kéo được dữ liệu | Refresh cần cookie `HttpOnly`, khó dùng ở máy với máy: hướng dẫn cho bên gọi bảo dùng lại `accessToken` tới khi hết hạn rồi đăng nhập lại. Hệ quả của quyền ghi ở [13](../update_docs/13-quyet-dinh.md) mục 8.6. `order.colorsize` không có cột nhạy cảm | Ghi nhận |

Sau khi sửa (20/10/2026), bộ database test `MES_*_T514`:
- `npm run lint -w backend`, `npm run build -w backend`: qua.
- `npx jest --runInBand test/phase5.spec.ts`: 57/57 qua (5 bài của T18).
- Cả bộ backend (`npx jest --runInBand`) chạy trước lượt sửa này: 37/37 bộ, 427 bài qua, 2 bỏ qua (bài đồng bộ cần database trung gian cùng máy). Chưa chạy lại cả bộ sau lượt sửa: phần sửa chỉ ở `color-size.service.ts`, `order.repositories.ts` (hàm mới), `order.controller.ts` (route mới), `phase5.spec.ts`.
