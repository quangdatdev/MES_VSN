# Review Phase 5.4 – Danh mục hệ thống

Phase 5.4 chạm migration `MES_Core`, seed và API `/admin/*`, nên review ngay khi xong phần code (CLAUDE.md mục 2). Agent chỉ đọc, không chạy migrate/seed/test ghi DB.

## Lượt 1 – 10/10/2026
Phạm vi: 25 file (`MES_Core/0003_catalog.sql`, `platform/catalog/*`, phần đọc danh mục của `platform/sync`, `org.service.ts`, `core.types.ts`, seed, script nạp BRAVO, `sales-order.service.ts`, `CatalogsPage.tsx` và các file frontend liên quan, `test/catalog.spec.ts`).

| Lượt | Kết luận agent | Phát hiện |
|---|---|---|
| 1 | BLOCK | 0 CRITICAL, 1 HIGH, 4 MEDIUM, 12 LOW |

Agent kiểm và xác nhận đúng: quyền 3 hành động trên mọi endpoint, không có endpoint xóa; `branchCode` khi thêm chuyền là cấu hình quản trị, tra lại `SysBranch`; không có SQL injection ở phần đọc bảng chép (tên bảng từ `SyncSource` + regex, cột từ `sys.columns`, `q` là tham số, LIKE thoát đúng); cache quyền và cache chuyền; nhật ký trong cùng transaction; migration chỉ thêm mới; seed không ghi đè; ranh giới module.

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| 1 | HIGH | Ngừng dùng một chuyền làm mọi lần lưu Xếp chuyền của kế hoạch có dòng trên chuyền đó trả 422 (kể cả dòng cũ không đổi); dòng đang may/đã xong bị kẹt; bảng dàn chuyền mất hàng; ô chọn trống; câu xác nhận nói sai | `OrgService` giữ cả chuyền đã ngừng (`includeInactive`), `assertLine` chỉ nhận chuyền đang dùng; lưu Xếp chuyền chỉ kiểm dòng mới hoặc dòng đổi chuyền; tên chuyền, bảng dàn chuyền (giữ hàng khi còn việc, ghi "đã ngừng"), Phân bổ màu cỡ hiện cả chuyền đã ngừng; ô chọn thêm chuyền hiện tại của dòng; câu xác nhận viết lại đúng hành vi | Đóng (test: lưu lại được, thêm dòng mới 422, board còn hàng) |
| 2 | MEDIUM | Ở đúng 768px cả cột trái và ô chọn danh mục cùng ẩn | Ẩn cột trái từ `47.99em`, bù đúng `hiddenFrom="sm"` | Đóng |
| 3 | MEDIUM | `reset:demo` không đưa chuyền, danh mục về như seed; kế hoạch mẫu có thể nằm trên chuyền đã ngừng | Reset bật lại chuyền, mục, ca mẫu đúng tên; phần tạo thêm ngừng dùng (không xóa) | Đóng |
| 4 | MEDIUM | Tên Đơn vị tính cho 100 ký tự nhưng `SalesOrder.UnitName` 20: chọn gợi ý thì 422 khó hiểu, script nạp có thể lỗi | Danh mục `UNIT` giới hạn tên 20 ký tự ở API và form (kèm ghi chú đổi tên không đổi đơn hàng cũ); script nạp cắt 20 | Đóng (test 422) |
| 5 | MEDIUM | Chưa có test phân quyền cho thay đổi cây tổ chức | Bài test: Trưởng chuyền phạm vi `LINE LIST` mất dữ liệu ngay trong cùng phiên khi ngừng chuyền | Đóng |
| 6 | LOW | Đổi tên, thứ tự chuyền cũng tăng phiên bản quyền | Chỉ tăng khi thêm chuyền hoặc bật/tắt | Đóng |
| 7 | LOW | Nhật ký danh mục thiếu IP | Thêm `ip` | Đóng |
| 8 | LOW | Hai người tạo cùng mã cùng lúc nhận 500 | Bắt lỗi trùng chỉ mục (2601/2627) → 409 | Đóng |
| 9 | LOW | `page` không có giới hạn trên | `@Max(1_000_000)` | Đóng |
| 10 | LOW | Bảng chép không còn cột dữ liệu sinh câu SQL hỏng; cột nhị phân hiện chuỗi rác | 404 có hướng dẫn; ô nhị phân hiện "(nhị phân)" | Đóng |
| 11 | LOW | Danh mục BRAVO `DM_NHANVIEN`, `DM_NGUOISUDUNG` có họ tên, tên đăng nhập BRAVO, không qua chính sách cột hay nhật ký đọc | Hiện chỉ vai trò Quản trị xem được; ghi vào mục Phát sinh: trước khi cấp `admin.catalog:view` cho vai trò khác cần danh sách trắng cột hoặc nhật ký đọc | Hoãn (ghi phase) |
| 12 | LOW | Seed sinh `admin.catalog:delete` dù không có endpoint | Như mọi tài nguyên khác (seed sinh đủ 5 hành động); không cấp cho vai trò nào | Hoãn (ghi phase) |
| 13 | LOW | `admin.catalog:update` gián tiếp đổi phạm vi quyền (ngừng chuyền làm người được giao chuyền mất dữ liệu; thêm chuyền mở rộng phạm vi theo cây) | Ghi rõ trong `seed-demo.md` và câu xác nhận trên màn hình; chỉ vai trò Quản trị có quyền này | Đóng (tài liệu) |
| 14 | LOW | `CatalogService` toàn cục lộ hàm ghi; nhiều `as any` | Tách `CatalogLookupService` (chỉ đọc) để export; service quản trị không export; bỏ `as any` (dùng `Updateable`) | Đóng |
| 15 | LOW | Khung danh mục không báo đang tải/lỗi; `aria-live` bao cả bảng; điện thoại không thấy lỗi đọc BRAVO; công tắc không khóa khi đang lưu | Dòng "Đang tải…"/Alert lỗi từng khung; bỏ `aria-live` ở vùng bảng; lỗi BRAVO hiện dưới ô chọn; công tắc khóa khi đang lưu | Đóng |
| 16 | LOW | Test đỏ trên máy chưa có `MES_Sync` | Bỏ qua phần danh mục BRAVO (có cảnh báo) khi chưa có | Đóng |
| 17 | LOW | `softkeys.json` chưa khai báo `SalesOrder.OrderType` → mã danh mục | Hiện chỉ là gợi ý (đơn hàng vẫn nhập tay được); khai báo khi BA chốt ràng buộc cứng | Hoãn (ghi phase) |

Sau khi sửa: test backend 123/123 (thêm 7 bài danh mục), frontend 19/19, lint và build qua.

## Lượt 2 – 10/10/2026
Phạm vi: 22 file (phần sửa sau lượt 1). Agent chạy `tsc --noEmit` hai phía và `npm run lint`, đều qua.

| Lượt | Kết luận agent | Phát hiện |
|---|---|---|
| 2 | APPROVE WITH SUGGESTIONS | 0 CRITICAL, 0 HIGH, 0 MEDIUM, 9 LOW; HIGH #1 và 4 MEDIUM lượt 1 đóng đúng |

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| L1 | LOW | Kiểm "dòng đổi chuyền" dùng dữ liệu đọc trước khi khóa kế hoạch | Kiểm trong transaction, so với dòng đọc dưới khóa | Đóng |
| L2 | LOW | Bật/tắt chuyền cùng lúc có thể bỏ sót lần tăng phiên bản quyền (so với giá trị đọc trước transaction) | Tăng mỗi khi có `isActive` trong yêu cầu | Đóng |
| L3 | LOW | Khi danh sách chuyền đang tải, mọi dòng bị ghi "(đã ngừng)" | Chỉ ghi khi danh sách đã tải xong (`useLinesState`) | Đóng |
| L4 | LOW | Phạm vi trỏ tới chuyền đã ngừng hiện số Id ở ngăn phân quyền người dùng | Nhóm "Đã ngừng dùng" hiện tên chuyền, quản trị bỏ chọn được | Đóng |
| L5 | LOW | `reset:demo` chưa đặt lại thứ tự, mô tả | Đặt lại theo seed | Đóng |
| L6 | LOW | Kiểu `Board.lines` thiếu `isActive` | Thêm | Đóng |
| L7 | LOW | Test: dọn phạm vi trỏ tới chuyền thử, kiểm nội dung lỗi, thiếu ca chuyển dòng, comment lệch | Dọn `SysUserRoleScope` trước; kiểm "đã ngừng dùng"; thêm chuyển sang chuyền đang dùng (200) và chuyển ngược vào chuyền đã ngừng (422) | Đóng |
| L8 | LOW | Tài liệu, chú thích lệch | Sửa số bài test, chú thích `isActive`, vị trí chú thích `useSave` | Đóng |
| L9 | LOW | Nhật ký sửa ca ghi `dto` thay vì phần đổi; tìm trên bảng không có cột chữ trả mọi dòng | Ghi `set`; trả rỗng | Đóng |

**Kết quả cuối:** không còn CRITICAL/HIGH/MEDIUM mở; LOW hoãn có lý do: #11 (dữ liệu cá nhân danh mục BRAVO, chỉ Quản trị xem), #12 (quyền xóa do seed sinh), #17 (khóa ngầm Loại đơn hàng, chờ BA). Test backend 123/123, frontend 19/19, lint và build qua. Phần sửa sau lượt 2 kiểm bằng test, chưa qua agent lượt 3.

## Lượt 3 – task 5.4.8: cây Nhà máy → Xưởng → Chuyền (10/10/2026)
Phạm vi: khoảng 36 file.
- Migration `MES_Core/0005_org_workshop.sql`.
- `platform/catalog/*`, `org.service.ts`, `core.types.ts`.
- Seed, reset-demo, `test/catalog.spec.ts`.
- Màn Chuyền may dạng cây, ô chọn chuyền gom theo xưởng (`lib/lines.ts`, `SheetGrid`, Xếp chuyền, Phân bổ màu cỡ, Kế hoạch chuẩn bị SX, phạm vi người dùng), `catalog-lines.test.tsx`.
- ADR 0010 và tài liệu thiết kế.

| Lượt | Kết luận agent | Phát hiện |
|---|---|---|
| 3 | APPROVE WITH SUGGESTIONS | 0 CRITICAL, 0 HIGH, 2 MEDIUM, 9 LOW |

Agent đã kiểm và xác nhận đúng:
- **Migration:** thứ tự lệnh và `GO` đúng; khóa ngoại ghép cộng CHECK chặn khác nhà máy, chuyền làm cha, xưởng lồng nhau, vòng lặp, đổi loại nút có con.
- **Đường ghi:** mọi đường ghi đặt `ParentOrgType`, `Path` đúng.
- **Khóa:** `sp_getapplock` theo transaction trên cả 4 đường ghi cây.
- **Quy tắc xưởng:** "chuyền đang dùng ở xưởng đang dùng" giữ đúng, kể cả khi hai người sửa cùng lúc.
- **Phân quyền:** tăng phiên bản quyền đúng chỗ; `startsWith` theo Path không nhầm tiền tố.
- **Dữ liệu nghiệp vụ:** khóa ngầm `LineCode` vẫn chỉ nhận chuyền.
- **Giao diện:** theo quy tắc UI/UX.

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| M1 | MEDIUM | `0005` được sửa CHECK (thiếu `ParentOrgType IS NOT NULL`: NULL cho UNKNOWN, CHECK coi là đạt) sau khi đã chạy. Lịch sử migration chỉ lưu tên file, nên database đã chạy bản đầu giữ CHECK lỗi | Bản đầu của 0005 chỉ từng chạy trên SQL Server local, chưa commit. Thêm `0006_org_path_guard.sql`: tạo lại `CK_SysOrgUnit_Level`, chạy được cả trên database đã đúng. Đã kiểm `sys.check_constraints` trên local | Đóng |
| M2 | MEDIUM | Chuyển chuyền giữa xưởng đổi phạm vi dữ liệu của người được giao cả xưởng, mà chỉ cần `admin.catalog:update`. Người vừa sửa danh mục vừa giữ phạm vi cả xưởng có thể tự nới phạm vi | Chuyển xưởng cần thêm `admin.permission:update`; người đang giữ phạm vi cả xưởng cũ hoặc mới nhận `403 SELF_ELEVATION_FORBIDDEN`. Ô Xưởng chỉ đọc kèm lý do khi thiếu quyền; lưu thì hỏi lại, nêu hậu quả | Đóng (test: thiếu quyền 403, có quyền mà giữ phạm vi 403, quản trị chuyển được; đã thử bỏ kiểm thì test đỏ) |
| L1 | LOW | Seed tìm xưởng theo mã, không lọc loại, không xét đang dùng | Chỉ lấy `WORKSHOP` đang dùng; mã xưởng mẫu đã bị nút khác dùng thì bỏ qua kèm cảnh báo; chuyền mẫu thiếu chỉ vào xưởng đang dùng | Đóng |
| L2 | LOW | Seed tạo xưởng mẫu và kéo chuyền vào cả khi người dùng đã tự chia xưởng | Chỉ tạo xưởng mẫu khi nhà máy chưa có xưởng nào đang dùng | Đóng |
| L3 | LOW | Database không giữ `Path` = Path cha + mã. Phân quyền theo Path, màn hình theo `ParentId`, lệch thì lộ dữ liệu | Trigger `TR_SysOrgUnit_PathMatchesParent` (0006), kiểm dữ liệu cũ trước khi tạo. Vì bảng có trigger INSERT, các lệnh chèn bỏ `OUTPUT` (SQL Server không cho), thêm rồi đọc lại theo mã | Đóng (test: chèn và sửa sai Path bị chặn) |
| L4 | LOW | Ô chọn gom theo tên xưởng (trùng tên bị gộp); phạm vi người dùng xếp nhóm khác thứ tự cây | Gom theo mã xưởng, trùng tên thì kèm mã; phạm vi người dùng xếp theo cây, nhóm kèm mã xưởng | Đóng (test) |
| L5 | LOW | Công tắc có tên đọc "Đang dùng" khi đang hiện "Ngừng dùng"; lý do khóa chỉ trong tooltip | Tên đọc theo trạng thái; lý do khóa qua `aria-describedby` | Đóng (test) |
| L6 | LOW | Mô tả chuyển xưởng không nói người được giao cả xưởng mới sẽ thấy dữ liệu; không hỏi lại | Thêm câu này; hỏi lại bằng `confirmAction` | Đóng (test) |
| L7 | LOW | Nhật ký chuyển xưởng ghi Id, thiếu mã xưởng cũ | Ghi `Workshop` (mã) ở cả giá trị cũ và mới, bỏ Id | Đóng (test) |
| L8 | LOW | Thiếu test: chuyền mới trong xưởng thấy ngay, PUT sang xưởng nhà máy khác hay Id không phải xưởng | Thêm cả hai; phần "ngừng xưởng thì phạm vi rỗng" đã gồm trong quy tắc không ngừng được xưởng còn chuyền | Đóng |
| L9 | LOW | `db-core.md` dòng `SysOrgUnit` còn mô tả khóa ngoại cũ như hiện hành | Ghi rõ là bản 0002–0004, trỏ xuống mục 5.4.8 | Đóng |

Sửa kèm sau khi xem trên trình duyệt:
- Nút mở, thu gọn và nút thêm chuyền trên dòng xưởng có tên đọc kèm mã xưởng: A01 và A02 cùng có "Xưởng 01" nên tên bị trùng.
- Nhà máy chưa có xưởng, chuyền thì báo "Nhà máy A04 chưa có xưởng, chuyền", không báo "không khớp bộ lọc".

**Kết quả cuối:**
- Không còn phát hiện mở.
- Test backend 143/143, frontend 54/54; lint, kiểm kiểu qua.
- Migration `0005`, `0006` và seed đã chạy trên SQL Server local.
- Phần sửa sau lượt 3 đã qua agent ở lượt 4 (bên dưới).

## Lượt 4 – phần sửa sau lượt 3 (10/10/2026)

Phạm vi: 0006 (trigger, CHECK), bỏ `OUTPUT` khi chèn `SysOrgUnit`, kiểm quyền chuyển chuyền (M2), seed và reset-demo, `lines.ts`, `ScopeEditor`, `StatusCell`, `LineDialog` và các test liên quan. Agent chỉ chạy lệnh không ghi DB (tsc, lint, vitest).

| Lượt | Kết luận agent | Phát hiện |
|---|---|---|
| 4 | APPROVE WITH SUGGESTIONS | 0 CRITICAL, 0 HIGH, 1 MEDIUM (test), 5 LOW |

Agent xác nhận M1, M2, L1–L9 của lượt 3 đã sửa đúng, không thấy lỗi mới ở code chạy thật. Đã kiểm thêm:
- trigger Path chỉ cần xét `inserted` (Path của cha thực chất không đổi được), cập nhật nhiều dòng vẫn đúng, không đụng trigger `TR_SysOrgUnit_CodeImmutable`;
- không còn `INSERT ... OUTPUT` trên `SysOrgUnit`; bắt lỗi trùng mã vẫn đúng;
- `assertAdminCeiling` dùng quyền đã tính sẵn ở guard, không vướng khóa cây; truy vấn phạm vi của chính người thao tác nghiêng về an toàn;
- chạy nối tiếp reset → seed đúng cho bốn trường hợp (có xưởng mẫu, chưa có, tự chia xưởng, mã xưởng mẫu bị chuyền dùng).

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| M1 | MEDIUM | Test chuyển xưởng không chứng minh việc đòi `admin.permission:update`: lần gọi đầu người thử đang giữ xưởng đích nên bỏ kiểm quyền vẫn ra 403. Chưa có ca chuyển ra khỏi xưởng đang giữ | Thêm xưởng thứ hai người thử không giữ: thiếu quyền thì 403 kèm "Thiếu quyền: admin.permission:update"; có quyền thì chuyển vào, chuyển ra xưởng đang giữ đều 403; đủ quyền, không giữ hai đầu thì chuyển được | Đóng (đã thử bỏ dòng kiểm quyền: test đỏ) |
| L1 | LOW | Trigger 0006 so `Path` theo collation không phân biệt hoa thường, `PermissionService` so phân biệt | Để migration sau (không sửa 0006 đã chạy). Hậu quả đóng an toàn: người được giao mất chuyền, không lộ dữ liệu, và chỉ xảy ra khi ghi tay vào DB | Để sau |
| L2 | LOW | Seed, reset-demo tìm chuyền mẫu theo mã mà không lọc `OrgType = 'LINE'`: xưởng tự tạo mang mã chuyền mẫu làm reset lỗi khó hiểu, seed lấy Id xưởng làm chuyền. Cảnh báo xưởng mẫu sai khi chính xưởng mẫu đang ngừng | Lọc `LINE`; mã bị đơn vị loại khác dùng thì bỏ qua kèm cảnh báo (phạm vi mẫu trỏ tới đơn vị thiếu cũng bỏ qua kèm cảnh báo). Cảnh báo xưởng mẫu tách hai trường hợp | Đóng (seed chạy lại "không có gì mới") |
| L3 | LOW | Test nhật ký chuyển xưởng xanh cả khi thiếu trường `Workshop`: `Path` mới đã chứa mã xưởng | Kiểm `Workshop` ở giá trị cũ và mới | Đóng |
| L4 | LOW | Dữ liệu thử gán cùng mã cho mọi xưởng; thứ tự, tên nhóm ở `ScopeEditor` chưa có test | Mã xưởng riêng theo từng xưởng; tách `scopeLineGroups` thành hàm thuần, test thứ tự cây, tên nhóm kèm mã, bỏ chuyền đã ngừng, lọc theo nhà máy | Đóng |
| L5 | LOW | Test bị ngắt giữa chừng để lại tài khoản `test.p54*` đang hoạt động, còn ngoại lệ quyền quản trị, mật khẩu nằm trong file test | `cleanup()` đầu và cuối lượt gỡ ngoại lệ, vai trò, phạm vi và khóa các tài khoản này | Đóng |

## Lượt 5 – ô chọn chuyền dạng cây (TreeSelect) và phần sửa lượt 4 (10/10/2026)

Phạm vi:
- Ô chọn chuyền dạng cây theo phản hồi người dùng (lưới dàn chuyền dài, khó tìm): `components/TreeSelect.tsx`, `lib/lines.ts`, `SheetGrid`, ô lọc chuyền ở Đơn hàng, Kế hoạch chuẩn bị SX, CSS `.tree-pick*`, test.
- Phần sửa lượt 4: `catalog.spec.ts`, `seed.ts`, `reset-demo.ts`, `scopeLineGroups`.

| Lượt | Kết luận agent | Phát hiện |
|---|---|---|
| 5 | BLOCK (vì #1, có từ trước); riêng phần mới: APPROVE WITH SUGGESTIONS | 0 CRITICAL, 1 HIGH, 4 MEDIUM, 10 LOW, 1 gợi ý |

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| 1 | HIGH | `npm run seed` (không cờ) gán lại vai trò, nhà máy đã bị quản trị thu hồi của tài khoản mẫu, không kèm phạm vi. Không phạm vi là không giới hạn, tức là nới quyền. Lỗi có từ trước, trái với CLAUDE.md mục 8 | Vai trò, nhà máy, phạm vi, ngoại lệ, cột riêng mẫu chỉ cho tài khoản mới hoặc `--sync-matrix` (reset-demo dùng cờ này) | Đóng (test `seed.spec.ts`; đã thử bỏ điều kiện: test đỏ) |
| 2 | MEDIUM | Thiếu đơn vị phạm vi thì seed bỏ qua phạm vi nhưng vẫn gán vai trò, thành không giới hạn | Tra đủ phạm vi trước khi gán vai trò; thiếu thì không gán, kèm cảnh báo | Đóng |
| 3 | MEDIUM | Đang gõ tìm, mũi tên trái nhảy lên dòng xưởng rồi thu gọn kết quả thay vì di con trỏ | Mũi tên trái, phải chỉ mở/thu gọn khi người dùng đã đi bằng mũi tên lên, xuống | Đóng (test) |
| 4 | MEDIUM | Gõ "01" ra mọi chuyền vì mã nhà máy A01 nằm trong mọi mã chuyền, xưởng | Tìm theo đầu từ: "01" ra Xưởng 01 và Chuyền 01; "x02", "l05" vẫn ra mã | Đóng (test; đã thử cách tìm cũ: test đỏ) |
| 5 | MEDIUM | Dòng đang đứng chữ trắng trên nền cam (~2:1), dấu tích cam trên nền trắng | Dòng đang đứng của mọi ô chọn dùng nền #007185 chữ trắng (~5,7:1) cả hai chế độ; dấu tích màu chữ liên kết | Đóng |
| 6 | LOW | Mở danh sách chỉ đặt chỉ số, không xóa dòng nổi cũ | Làm nổi đúng giá trị đang chọn | Đóng |
| 7 | LOW | Hẹn giờ của lượt trước ghi đè dòng người dùng vừa đi tới | Đánh số lượt; phím bấm thắng hẹn giờ cũ | Đóng |
| 8 | LOW | Esc giữ chữ đang gõ, mở lại thì kết quả bị thu gọn | Đóng danh sách thì ô về nhãn, nhóm về như lúc đầu | Đóng (test) |
| 9 | LOW | Danh sách rỗng khi chưa gõ vẫn báo "không khớp" | Tách "Chưa có chuyền nào" và "Không có chuyền khớp" | Đóng (test) |
| 10 | LOW | Giá trị không có trong danh sách thì ô hiện "Tất cả" trong khi đang lọc | Hiện mã | Đóng (test) |
| 11 | LOW | Danh sách ẩn vẫn giữ mọi nhóm mở; `lineOptions` tạo mảng mới mỗi lần vẽ | Đóng danh sách thì thu gọn lại; `useMemo` ở nơi gọi. Gõ một chữ khớp cả 400 chuyền tốn ~170 ms trong jsdom: chưa giới hạn số dòng | Đóng (phần giới hạn dòng để sau) |
| 12 | LOW | Test chưa kiểm aria-activedescendant, Esc, giá trị lạ, mũi tên khi đang tìm | Thêm 6 bài | Đóng |
| 13 | LOW | `cleanup()` không thu hồi phiên test.p54*, chỉ tăng phiên bản quyền khi xóa đơn vị | Thu hồi phiên, luôn tăng phiên bản quyền | Đóng |
| 14 | LOW | `stopEditing` gọi hai lần, chú thích sai | Bỏ hẹn giờ, sửa chú thích | Đóng |
| 15 | LOW | Ô "Tổ SX" nhưng danh sách ghi "chuyền" | Ghi "tổ" ở màn Kế hoạch chuẩn bị SX | Đóng |
| 16 | Gợi ý | Regex ký tự tổ hợp viết trực tiếp; seed chuyển chuyền vào xưởng mẫu không ghi vào thống kê | Viết dạng `̀-ͯ`, bỏ export thừa; thêm thống kê | Đóng |

Agent xác nhận đúng:
- thứ tự `openDropdown` rồi `setOpen`;
- `aria-activedescendant` ghi tay không xung đột React;
- lý do cần hẹn giờ (khung nổi gắn vào body sau layout effect);
- blur, chọn lại cùng giá trị, Esc trong popup dàn chuyền;
- truy cập: tên đọc dòng nhóm, `aria-selected`, listbox có nhãn;
- `lineOptions`, `scopeLineGroups`;
- phần sửa M1, L2, L3, L5 lượt 4.

## Lượt 6 – xác minh phần sửa lượt 5 và 5.3.10 (10/10/2026)

Agent: **APPROVE WITH SUGGESTIONS**. Mọi mục lượt 5 đã đóng đúng. Không có CRITICAL hay HIGH mới; có 1 MEDIUM, 4 LOW mới, đã sửa cả:

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| N1 | MEDIUM | `seed.spec.ts` chạy cả seed: trên DB đã nạp BRAVO, nhà máy chưa có đơn sẽ bị nạp đơn hàng giả mỗi lần chạy test | `runSeed({ coreOnly: true })`: chỉ MES_Core, bỏ mục 11, 12 | Đóng |
| N2 | LOW | Gán vai trò, phạm vi của một tài khoản không cùng transaction: lỗi giữa chừng để lại vai trò không phạm vi | Mỗi tài khoản một transaction; kiểm cả chiều phạm vi trước khi gán | Đóng |
| N3 | LOW | Cảnh báo thiếu đơn vị phạm vi không nói cách khắc phục | Ghi: gán ở màn Người dùng hoặc `npm run seed -- --sync-matrix` | Đóng |
| N4 | LOW | Lần đọc tên chi nhánh bắt đầu trước khi sửa nhà máy vẫn ghi tên cũ vào cache; màn Nhà máy không làm mới tên ở cột Chi nhánh | Bộ đếm thế hệ, sửa thì bỏ lần đọc đang chạy; màn Nhà máy làm mới `['me','branch-names']` | Đóng (test) |
| N5 | LOW | Luật lint NO_SYNC chỉ gắn cho module Đơn hàng, May | Ghi chú đầu `eslint.config.mjs`: module mới phải gắn | Đóng |

**Kết quả cuối task 5.4.8:**
- Không còn phát hiện CRITICAL, HIGH, MEDIUM mở.
- Để sau (LOW): so `Path` phân biệt hoa thường ở trigger (L1 lượt 4); giới hạn số dòng khi tìm trong danh sách rất dài (#11 lượt 5).
- Test:
  - backend: toàn bộ 159/159 trước phần sửa lượt 6; sau phần sửa, các bộ liên quan 20/20 (`catalog`, `seed`, `branch-names`);
  - frontend: 72/72;
  - lint, kiểm kiểu qua; `npm run seed` chạy lại "không có gì mới".
