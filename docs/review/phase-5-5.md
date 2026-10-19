# Review Phase 5.5 – Kế hoạch chuẩn bị SX (10/10/2026)

**Phạm vi** (27 file):
- **Migration, cấu hình:** `MES_Sewing/0001`, `0002`, `MES_Core/0004`, `softkeys.json`, `check-softkeys.ts`, `env.ts`, `.env.example`, `migrate.ts`, `eslint.config.mjs` (backend).
- **Module May:** `modules/sewing/*`.
- **Module Đơn hàng:** `schedule-feed.service.ts`, hàm `feed()`/`feedVersion()` ở `order.repositories.ts`, `order.module.ts`, `app.module.ts`.
- **Nền tảng:** `ChildRepository.listByParents` (`platform/data/base.repository.ts`).
- **Script:** `seed-data.ts`, `seed.ts`, `sewing-data.ts`, `reset-demo.ts`, `load-bravo-orders.ts`.
- **Test:** `test/sewing.spec.ts`, `src/test/sewing.test.tsx`, `src/test/datagrid.test.tsx`.
- **Frontend:** `features/sewing/*`, `features/admin/PrepStepsPane.tsx`, `CatalogsPage.tsx`, `routes/registry.tsx`, `components/DataGrid.tsx` (tiêu đề 2 tầng), `global.css`, `lib/fieldPolicy.ts`.

Có migration, seed và phân quyền nên review là bắt buộc.

| Lượt | Kết luận agent | Phát hiện |
|---|---|---|
| 1 | BLOCK | 0 CRITICAL, 3 HIGH, 5 MEDIUM, 13 LOW |
| 2 | APPROVE WITH SUGGESTIONS | 0 CRITICAL, 0 HIGH, 1 MEDIUM, 13 LOW |

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| 1 | HIGH | Bản chép khớp dòng chỉ theo `ShipmentPlanLineId`. `reset:demo`, `load:bravo` đánh số lại Id của `MES_Order` nhưng không xóa bản chép, dẫn tới: ngày đã nhập gắn sang mã hàng khác; màn của nhà máy khác lỗi 500 (trùng khóa duy nhất); bước chép ở A00 có thể đưa dữ liệu nhà máy này vào dòng của nhà máy khác. Nguồn trả rỗng thì xóa sạch | Nhận diện nguồn bằng Id + nhà máy + kế hoạch + thời điểm tạo (migration `0002`; so với dung sai 5 ms vì driver gửi ngày giờ theo kiểu `datetime`). Xóa dòng cũ trùng Id ở nhà máy khác trước khi thêm. Nguồn rỗng thì không xóa. Hai script xóa bản chép (giữ danh mục bước) | Đóng (test: Id dùng lại, nguồn rỗng, nguồn lẫn nhà máy) |
| 2 | HIGH | Trưởng chuyền thấy tên khách hàng chưa che (quy tắc seed-demo §6, ADR 0006) | Thêm chính sách Che `customerName` cho LINE_LEADER; DB máy dev áp qua API quản trị | Đóng (test) |
| 3 | HIGH | Cột `steps` đặt mức Che làm màn lỗi trắng: danh mục bước trả dưới khóa `steps`, trùng mã cột | Danh mục bước trả dưới khóa `stepInfo`; frontend kiểm `Array.isArray` | Đóng (test backend, frontend) |
| 4 | MEDIUM | Xuất file trên khoảng 2.090 dòng vượt giới hạn 2.100 tham số | `ChildRepository.listByParents` chia lô 1.000 (dùng chung cho mọi module) | Đóng |
| 5 | MEDIUM | Mỗi lần đổi trang, lọc đều đọc toàn bộ dàn chuyền và khóa phạm vi trên bảng (nghi deadlock giữa A00 và nhà máy); nguồn đọc trước khi lấy khóa | Chỉ chép khi dấu phiên bản dàn chuyền đổi; khóa ứng dụng `sp_getapplock`; đọc nguồn sau khi giữ khóa | Đóng |
| 6 | MEDIUM | Đang sửa bảng Cấu hình chuẩn bị SX mà đổi danh mục khác thì mất phần sửa | Đổi danh mục qua `guardedLeave` | Đóng |
| 7 | MEDIUM | Tìm theo Số kế hoạch vẫn chạy khi cột này bị Ẩn/Che | Thêm vào danh sách không tìm | Đóng |
| 8 | MEDIUM | Thiếu test nhà máy khác, mức Che, giao diện | Thêm: nhà máy khác 404, Che `steps`, che tên khách, test giao diện màn và danh mục | Đóng |
| 9–21 | LOW | Ngày không có thật lọt kiểm tra (500); đọc danh mục ngoài transaction; trạng thái chi tiết tính cả bước ngừng dùng; popup dùng giờ máy người dùng; ô lọc không ẩn theo chính sách cột; seed hỏng khi chưa có `MES_Sewing`; thiếu index khóa ngầm; ép kiểu `never`; Thêm bước khi đang có bản nháp; chữ cam 4,3:1; nhãn đọc trên biểu tượng; chưa có lint ranh giới module; `linesOf` nhận mã nhà máy thô | Sửa cả 13 mục. Lint ranh giới: module May chỉ được dùng `OrderModule`, `schedule-feed.service`; module Đơn hàng không import module May. `linesOf` nhận `Scope` | Đóng |

Sửa thêm trong lúc chạy test: bước chép coi nhầm dòng là dòng mới vì thời điểm tạo lệch 1 ms (kiểu `datetime` của tham số). Lỗi này làm test chập chờn; đã sửa bằng so sánh có dung sai, và 3 lần chạy liên tiếp đều qua.

Trong lúc sửa, người dùng chuyển màn sang nhóm **Quản trị đơn hàng**:
- mã tài nguyên `sewing.prep` đổi thành `order.prep`, đường dẫn màn `/order/prep`;
- migration `MES_Core/0004` đổi tại chỗ để giữ quyền đã cấp;
- code, database, API vẫn thuộc module May (ADR 0009 mục 6).

Sau khi sửa: backend 136/136 test (9 file), frontend 42/42 (9 file); lint (có luật ranh giới mới), kiểm kiểu, build qua; `check:softkeys` không có mồ côi.

## Lượt 2

Agent xác nhận cả 3 HIGH, 5 MEDIUM của lượt 1 đã đóng. Phát hiện mới:

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| M1 | MEDIUM | `load:bravo` xóa bản chép sau khi nạp đơn hàng: lượt mở màn xen giữa chép theo dữ liệu mới, script xóa, rồi dấu phiên bản không đổi nên màn trống cho tới khi dàn chuyền đổi. `reset:demo` cùng lỗi | Hai script xóa bản chép trước khi nạp. Bước chép còn so số dòng bản chép với số dòng nguồn (trong dấu phiên bản): lệch thì chép lại dù dấu không đổi | Đóng (test: xóa bản chép ngoài luồng thì chép lại) |
| L1 | LOW | Dấu phiên bản dùng `CHECKSUM` theo collation không phân biệt hoa thường: đổi chỉ chữ hoa, thường không chép lại | `BINARY_CHECKSUM` | Đóng |
| L2 | LOW | Hai phiên cùng lúc thấy dấu mới thì cả hai chép (lần sau không đổi gì) | Chấp nhận ở quy mô demo; khóa ứng dụng đã bảo đảm không ghi trùng | Ghi nhận |
| L3 | LOW | Chép lỗi (hết thời gian chờ khóa, mất kết nối `MES_Order`) làm hỏng cả danh sách | Bắt lỗi, ghi log, vẫn trả bản chép hiện có; lần sau chép lại | Đóng (test) |
| L4 | LOW | Xóa dòng có ngày đã nhập mà không để lại dấu vết | Log cảnh báo kèm Id dòng | Đóng |
| L5 | LOW | Van chặn nguồn rỗng vẫn lưu dấu phiên bản, lần sau không kiểm lại | Bước chép trả `skipped`, không lưu dấu | Đóng (test) |
| L6 | LOW | Máy đã có `sewing.prep` mà chạy seed trước migration `MES_Core/0004` thì `sewing.prep` cũ nằm lại song song với `order.prep` | Thứ tự chuẩn là migrate rồi seed (CLAUDE.md mục 8); chỉ máy dev từng có `sewing.prep` và đã chạy đúng thứ tự | Ghi nhận |
| L7 | LOW | `order.prep` không gắn chiều Người tạo | Ghi vào ADR 0009 (chiều không gắn thì không áp, theo quy tắc chung) | Đóng |
| L8 | LOW | Luật lint ranh giới chỉ bắt đường dẫn `../order/*` | Thêm mẫu `**/modules/order/*`, `**/modules/sewing/*`; đã thử bằng file tạm | Đóng |
| L9 | LOW | Link cũ `/sewing/prep` báo 404 | Tự chuyển sang `/order/prep`, giữ bộ lọc | Đóng (test) |
| L10 | LOW | Bộ lọc của cột bị Ẩn/Che (còn trên URL) vẫn tính là đang lọc: hiện "Xóa lọc", câu rỗng sai | Chỉ tính bộ lọc có ô trên màn | Đóng (test) |
| L11 | LOW | Thiếu test: trùng Id ở nhà máy khác, đổi thông tin kế hoạch, không chép khi dấu không đổi | Thêm 2 test backend gom các trường hợp này | Đóng |
| L12 | LOW | `clearSewingPrep` không tự kiểm database trên máy này | Gọi `assertLocalDb` | Đóng |
| L13 | LOW | Tài liệu chưa ghi lượt 2 | Mục này | Đóng |

Kiểm test mới: gỡ phần so số dòng (M1) thì 2 test mới fail; trả lại thì qua.

Sau khi sửa: backend 138/138 test (9 file), frontend 44/44 (9 file); lint, kiểm kiểu, build qua. Không còn phát hiện CRITICAL/HIGH mở.

## Task 5.5.7 (10/10/2026): bố cục theo ảnh mẫu, nhập TH trên bảng

Phạm vi: `prep.service.ts`, `sewing.repositories.ts`, `sewing.dto.ts`, `sewing.controller.ts`, `base.repository.ts` (`ordered` nhiều cột, `lockMany`, `updateMany`), `audit.service.ts` (`logMany`), `app.factory.ts` (giới hạn body), `SheetGrid.tsx` (tiêu đề 2 tầng), `PrepPlanPage.tsx`, `WeekStrip.tsx`, `weeks.ts`, CSS, test.

### Lượt 1: BLOCK (1 HIGH, 7 MEDIUM, 11 LOW)

Agent xác nhận phân quyền, lọc nhà máy, lọc tuần/trạng thái/sắp xếp khi cột bị Ẩn/Che, công thức trạng thái ở SQL, service và giao diện khớp nhau; `ordered` giữ hành vi cũ; `SheetGrid` không đổi gì với các màn không có nhóm cột.

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| H1 | HIGH | Lưới nhập: bấm "Sửa chi tiết" thì thư viện bỏ ô đang chọn lúc nhấn chuột, nút bị khóa, không mở được popup (chỉ còn bấm đúp) | `SheetGrid` không báo "không có dòng" khi bấm ra ngoài; số thứ tự của dòng đang chọn có vạch nổi bật (`selectedKey`) | Đóng (thử trên trình duyệt: chọn ô rồi bấm nút, popup mở) |
| M1 | MEDIUM | Lưu xong xóa cả ô gõ thêm trong lúc lưu; lưới nháy lại ngày cũ trước khi tải lại xong | Gửi ảnh chụp nháp; tải lại xong mới bỏ đúng các ô đã gửi mà chưa sửa thêm (`afterSave`); tải lại lỗi thì giữ ô | Đóng (test) |
| M2 | MEDIUM | Lưu bị 404 (dòng không còn, ngoài phạm vi) thì kẹt: không biết ô nào hỏng, lần nào cũng 404 | Máy chủ trả `details.ids`; lưới bỏ ô nháp của các dòng đó, báo số ô bị bỏ, giữ phần còn lại | Đóng (test backend, test hàm `withoutCells`) |
| M3 | MEDIUM | Body JSON mặc định 100 KB, không đủ cho 5.000 ô | `useBodyParser('json', { limit: '1mb' })`; giao diện chặn quá 500 dòng hoặc 5.000 ô | Đóng (test body > 100 KB) |
| M4 | MEDIUM | Lưu nhiều dòng N+1 trong transaction giữ khóa | `lockMany` (một câu khóa mỗi lô), `updateMany` (gom theo ngày), bỏ gọi khi danh sách rỗng | Đóng |
| M5 | MEDIUM | Nhật ký ghi vào `MES_Core` trước khi commit: lần lưu bị hủy vẫn để lại nhật ký | Gom mục nhật ký, ghi `logMany` sau khi commit | Đóng |
| M6 | MEDIUM | Bấm đúp mở popup mà ô của lưới nền vẫn chọn: phím, chép, dán trong popup tác động lưới nền | Bỏ ô đang chọn của lưới trước khi mở popup | Đóng |
| M7 | MEDIUM | Thiếu test các nhánh mới | Thêm test: A00 có quyền sửa bị chặn, nhà máy khác và ngoài chuyền được giao 404 kèm Id, các bước bị Ẩn gửi lô bị chặn, Mã hàng bị Che không lộ trong câu 409, tuần kết hợp trạng thái, `ordered` nhiều cột ở repository, body lớn; hàm nháp ở giao diện | Đóng |
| L1 | LOW | Lưu nhiều dòng chỉ cần phạm vi sửa; khóa đặt lên Id client gửi trước khi xét phạm vi | `lockMany` lọc phạm vi trước khi khóa; dòng phải xem được (đọc bằng `view`) | Đóng |
| L2 | LOW | Deadlock (409 không có danh sách ô) vẫn báo "người khác vừa sửa" | Chỉ báo vậy khi có `details.cells` | Đóng |
| L3 | LOW | Popup sửa được cả dòng ngoài phạm vi sửa | Popup nhận `canEdit` của dòng | Đóng |
| L4 | LOW | Tuần bị giới hạn bởi khoảng ngày: dòng vào chuyền sau "Đến ngày" mà có việc đến hạn trong tuần bị ẩn | Chờ người dùng/BA xác nhận (ghi ở "Phát sinh" của phase) | Ghi nhận |
| L5 | LOW | Lưới rỗng khi chọn tuần chỉ có "Xem cả khoảng ngày" | Thêm "Xóa lọc" | Đóng |
| L6 | LOW | Tiêu đề 2 tầng: tên bước dài không xem được đủ; gộp nhóm theo tên; chiều cao lặp ở CSS | Ô tên nhóm nhận chuột (rê xem đủ tên); nhóm theo khóa (Id bước); chiều cao đặt trong code | Đóng |
| L7 | LOW | Nút tuần cao 36px trên điện thoại | 40px | Đóng |
| L8 | LOW | Chú thích màu ẩn trên điện thoại; ô TH trễ của lưới nhập không có chữ đọc riêng | Chú thích hiện mọi cỡ màn hình. Ô nhập của thư viện không gắn được chữ ẩn: chú thích dưới lưới giải thích | Đóng một phần |
| L9 | LOW | Mẫu mã nhà máy `^A\d{2}$` hẹp hơn `VARCHAR(10)` | `^[A-Za-z0-9_-]{1,10}$` (vẫn chỉ là bộ lọc trong phạm vi đọc) | Đóng |
| L10 | LOW | Ô ngày gõ dở rồi rời ô thành xóa ngày | Hành vi chung của `SheetGrid` ở mọi màn: để lượt sửa riêng | Ghi nhận |
| L11 | LOW | Mất quyền sửa giữa phiên thì không còn nút Bỏ thay đổi; tài liệu chưa khớp (Trạng thái "luôn ở cuối", ADR 0011) | Bỏ thay đổi hiện khi còn nháp; sửa file phase, ghi ngoại lệ vào ADR 0011 | Đóng |

### Lượt 2: APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 5 MEDIUM, 12 LOW)

Phạm vi thêm: đổi nhà máy tại chỗ (`BranchSwitcher.tsx`, `AppLayout.tsx`, `lib/branches.ts`, `store/auth.ts`). Agent đối chiếu lượt 1: H1, M2, M3, M5, M6, M7 và L1–L3, L5–L7, L9, L11 đóng; M1 và M4 còn một nhánh (MEDIUM 1, MEDIUM 2 dưới đây). Agent xác nhận `lockMany` lọc phạm vi trước khi khóa và kiểm lại sau khi khóa, A00 bị chặn trước mọi lần đọc; `updateMany` đi qua `base('update')`; nhật ký ghi sau commit không bị nhân đôi; sắp xếp nhiều cột không mở lỗ ở module khác.

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| M1 | MEDIUM | Đang lưu mà gõ ô về đúng ngày cũ thì ô rời khỏi nháp; lưu xong DB mang ngày vừa gửi, lựa chọn sau cùng mất | `withEdits` nhận các ô đang gửi (`inflight`): ô đang gửi mà giá trị mới khác giá trị gửi thì giữ trong nháp; lưu xong `afterSave` đặt ngày lúc bắt đầu sửa là ngày vừa gửi. Ẩn "Bỏ thay đổi" khi đang lưu | Đóng (test hàm) |
| M2 | MEDIUM | Thêm, xóa dòng con vẫn N+1 (mỗi dòng một lần kiểm cha và một câu INSERT/DELETE) | `ChildRepository.insertMany` (kiểm mọi dòng cha một câu mỗi lô qua `scopedIds('update')`, INSERT lô 100) và `removeMany` (`base('update')`, `Id IN` lô 500); cả hai chỉ chạy trong transaction, thiếu dòng thì 404 | Đóng (test thêm, sửa, xóa nhiều dòng một lần) |
| M3 | MEDIUM | Đổi nhà máy đặt `branch` trước khi nạp quyền: màn dựng lại theo menu, quyền cũ; nạp lỗi thì thanh trên cùng lệch với menu | `selectBranch` nạp `/me`, menu, quyền, chính sách cột bằng token mới rồi đổi phiên một lần. Nạp lỗi sau khi máy chủ đã đổi phiên thì kết thúc phiên kèm lý do (lúc đăng nhập thì chọn lại được). AppLayout gỡ màn cũ ngay lúc đổi phiên, chờ URL mới rồi mới mở màn (React Router đổi URL trong transition) | Đóng (test) |
| M4 | MEDIUM | Khóa `Outlet` theo mã nhà máy: tab khác đổi nhà máy làm mọi màn mất phần đang nhập, không hỏi | Khóa `Outlet` theo số lần người dùng tự đổi (`switchCount`), không theo mã nhà máy: tab khác đổi thì màn giữ nguyên, lệnh ghi bị chặn bằng `BRANCH_CHANGED` như trước. Màn chuẩn bị SX phải bỏ nháp thì báo bằng thông báo không tự đóng. Ghi quy tắc vào `quy-tac-ui-ux.md` | Đóng (test với AppLayout thật) |
| M5 | MEDIUM | Ô Đơn vị (A00) lấy nhà máy được gán, không phải nhà máy xem được; tài khoản chỉ gán A00 thì "Đang tải…" mãi | Lấy từ `/sewing/prep/values?field=branchCode` (nhà máy đang có dòng, cùng phạm vi); tách câu báo đang tải, lỗi, rỗng | Đóng (test backend; trình duyệt: `giamdoc` thấy đủ A01, A02, A03) |
| L1 | LOW | Chú thích "không deadlock" của `lockMany` chỉ đúng giữa các lần lưu với nhau | Sửa chú thích: đường ghi khác (chép lại) vẫn có thể deadlock, SQL Server hủy một bên, trả 409. Chưa đổi thứ tự khóa của bước chép, chưa bật READ_COMMITTED_SNAPSHOT (cần migration, để lượt riêng) | Đóng một phần |
| L2 | LOW | `updateMany` không chặn gọi ngoài transaction | Chặn như `lockMany`; bỏ Id trùng trước khi đếm | Đóng |
| L3 | LOW | Sửa một dòng (`update`) ghi nhật ký trước commit | Ghi sau `inTransaction` | Đóng |
| L4 | LOW | Giới hạn 1 MB áp cho mọi route JSON | Giảm còn 512 KB (5.000 ô khoảng 370 KB; test xác nhận mức tối đa vẫn được nhận). Nest chỉ cho một bộ đọc JSON chung nên chưa tách theo route | Đóng một phần |
| L5 | LOW | Nháp còn ô bằng ngày đã lưu (tải lại lỗi, người khác nhập trùng); `listKey` trong `onSuccess` là của lần vẽ trước | Mỗi khi dữ liệu mới tải về, `withoutSaved` bỏ các ô đó (trừ ô đang gửi). Biết tải lại lỗi bằng `invalidateQueries(..., { throwOnError: true })`, không dùng `listKey` | Đóng (test hàm) |
| L6 | LOW | `BranchSwitcher` dùng `pathname` lúc bấm | Đọc màn đang mở lúc có kết quả | Đóng |
| L7 | LOW | Ở lại màn sau khi đổi nhà máy thì giữ tham số URL của nhà máy cũ | Điều hướng lại đúng màn, không kèm tham số | Đóng (test; trình duyệt: bỏ `style=F81`) |
| L8 | LOW | Màn đang ở trang lỗi thì đổi nhà máy không gỡ lỗi | `resetKey` gồm cả số lần đổi nhà máy | Đóng |
| L9 | LOW | Mở từ menu tài khoản thì focus về nút tài khoản; "Thử lại" không Tab tới được; tên đọc của lựa chọn lặp | Mở danh sách: đặt focus vào nút nhà máy (thử trên trình duyệt: mũi tên, Enter, Esc làm việc với danh sách); bỏ `aria-label` của lựa chọn, đặt `aria-selected` cho nhà máy đang làm việc. "Thử lại" vẫn trong portal: câu báo hướng dẫn mở lại danh sách (mở lại là tải lại) | Đóng một phần |
| L10 | LOW | Thiếu test đổi nhà máy (còn thay đổi chưa lưu, lỗi), test nhật ký sau 200/409/404 | Thêm 3 test giao diện (hỏi lại khi còn thay đổi; máy chủ từ chối; nạp quyền lỗi; dựng lại màn khi tự đổi, giữ màn khi tab khác đổi) và test backend nhật ký | Đóng |
| L11 | LOW | Thay đổi đổi nhà máy chưa ghi ở "Phát sinh", `quy-tac-ui-ux.md`; `api-contract.md` thiếu `details.ids` | Đã ghi | Đóng |
| L12 | LOW | Lô 1.000 Id cộng tham số điều kiện phạm vi sát giới hạn 2.100 | Lô 500 (`BATCH`) cho `lockMany`, `updateMany`, `removeMany`, `insertMany` | Đóng |

Còn từ lượt 1: L4 (tuần bị giới hạn bởi khoảng ngày) chờ người dùng/BA xác nhận; L10 (ô ngày gõ dở) để lượt sửa riêng của `SheetGrid`.

Sau khi sửa: backend 184/184 test (14 file, gồm 2 file của phiên khác), frontend 94/94 (14 file); lint, kiểm kiểu, build frontend qua. Không còn phát hiện CRITICAL/HIGH mở.

### Lượt 3: APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 1 MEDIUM, 7 LOW)

Phạm vi: phần sửa sau lượt 2 và lọc theo cột trên tiêu đề lưới nhập (người dùng yêu cầu thêm). Agent xác nhận `insertMany`/`removeMany`/`updateMany` đúng phạm vi (A00 bị chặn, L3 qua dòng cha, bắt buộc transaction, đếm lệch thì 404); nhật ký sau commit; AppLayout không kẹt ở chỉ báo đang tải (bootstrap, đăng nhập lại, đổi hai lần liền); các nhánh nháp không mất ô, `withoutSaved` không lặp vẽ; thư viện bỏ qua phím, chép, dán khi không còn ô đang chọn nên mở popup lọc không sửa ô của lưới.

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| M1 | MEDIUM | Lớp tiêu đề hai tầng `overflow: hidden` vẫn cuộn được: focus nút lọc đang khuất (Shift+Tab, trả focus sau popup) làm tên bước, KH/TH lệch khỏi cột thật, dễ nhập TH vào nhầm bước | `overflow: clip` cho lớp tiêu đề; nút lọc nhận focus thì cuộn chính lưới cho cột hiện ra | Đóng (thử trên trình duyệt: focus nút lọc Ngày tạo, lớp tiêu đề không cuộn, ô tiêu đề trùng cột thật) |
| L1 | LOW | Nút lọc nằm sau lưới trong DOM (Tab ngược thứ tự nhìn); lưới không nhóm đặt nút trong tiêu đề thư viện, không Tab tới được, `stopPropagation` làm popup khác không đóng | Lớp tiêu đề đứng trước lưới trong DOM; lưới không nhóm mà có nút lọc cũng dùng lớp tiêu đề; bỏ `stopPropagation` | Đóng (test) |
| L2 | LOW | Request của màn cũ bị 401 trong lúc chính tab này đổi nhà máy (phiên cũ đã thu hồi): làm mới phiên, báo nhầm "từ một tab khác", có khi bị đăng xuất | `duringBranchSwitch` trong `api.ts`: 401 lúc đang đổi thì chờ đổi xong, báo `BRANCH_SWITCHED`, không làm mới phiên; hủy truy vấn đang chạy trước khi đổi | Đóng (test) |
| L3 | LOW | Đăng xuất trong lúc đang đổi: vẫn báo "Đã chuyển nhà máy"; phiên mới có thể còn trong cookie | `selectBranch` trả `false`, thu hồi nốt cookie hiện tại; không báo thành công | Đóng |
| L4 | LOW | Nạp quyền lỗi: thêm toast trái với lý do ở màn đăng nhập; "(mất kết nối)" cho mọi lỗi; ghi đè lý do đã có | Không toast khi phiên đã kết thúc; chỉ nói "mất kết nối" khi lỗi mạng; phiên đã kết thúc (nhà máy bị thu hồi) thì giữ lý do cũ | Đóng |
| L5 | LOW | Quy tắc "tab khác đổi nhà máy thì lệnh ghi bị chặn" chỉ đúng với request đầu tiên | Ghi rõ giới hạn trong `quy-tac-ui-ux.md`: màn có phần đang nhập gắn với dữ liệu nhà máy phải tự xử lý khi `branch` đổi (như Kế hoạch chuẩn bị SX). Chưa chặn mutation theo lần đổi ở mọi màn | Đóng một phần |
| L6 | LOW | `insertMany` cố định 100 dòng mỗi INSERT: bảng con từ 21 cột vượt 2.100 tham số | Số dòng mỗi lô tính theo số cột (tối đa 100, không quá 2.000 tham số), dùng chung cho `insert` | Đóng |
| L7 | LOW | Test chưa qua lô thứ hai trong DB; bài mới phụ thuộc bài trước; thiếu test nhánh không nhóm, `release()` | Bài mới tự dựng trạng thái đầu; thêm test lưới không nhóm (lớp tiêu đề đứng trước lưới). Chưa có test hơn 500 Id cùng một lần ghi (cần hơn 500 dòng dữ liệu thử) và test phím trong popup (jsdom không vẽ ô của thư viện): đã thử trên trình duyệt | Đóng một phần |

Sau khi sửa: backend sewing 20/20, frontend 98/98 (15 file); lint, kiểm kiểu, build frontend qua. Không còn phát hiện CRITICAL/HIGH mở.

## Task 5.5.8 – Số liệu trên đầu màn (10/10/2026)

Phạm vi: `GET /sewing/prep/summary` (`prep.service.ts` `summary`, `sync` dùng chung; `sewing.repositories.ts` `summary`; `sewing.controller.ts`), `BaseRepository.filteredQuery` (mới, `platform/data`), `PrepSummary.tsx`, chèn trong `PrepPlanPage.tsx`, CSS `prep-summary`, test `sewing.spec.ts` nhóm "số liệu trên đầu màn (5.5.8)", `sewing.test.tsx` 2 bài.

**Lượt 1:** APPROVE WITH SUGGESTIONS, 0 CRITICAL, 0 HIGH, 2 MEDIUM, 6 LOW.

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| M1 | MEDIUM | Đếm mã hàng khác nhau làm lộ các dòng có cùng mã hay không khi cột Mã hàng bị Ẩn/Che | Mã hàng bị Ẩn/Che: cả 4 số `null`, kiểm trước khi chép, lọc. Hiện chưa vai trò nào bị che cột này | Đóng (test `styleCode` MASKED). Chờ người dùng xác nhận cách xử lý |
| M2 | MEDIUM | Số cũ hiện mà không báo đang tải; lưới tải lỗi thì số của bộ lọc cũ ở lại | Số liệu tải song song với lưới, khóa theo bộ lọc; đang tải có vòng xoay và `aria-busy`, lần đầu Skeleton; lỗi thì "–" kèm nút thử lại | Đóng |
| L1 | LOW | Đổi trang, sắp xếp cũng tải lại số liệu | Khóa chỉ theo nhà máy + bộ lọc; tải lại sau lưu ngày TH, sửa popup (`refreshPrepSummary`, khóa riêng không dính `throwOnError` của luồng lưu) | Đóng |
| L2 | LOW | 4 truy vấn EXISTS mỗi dòng | Hoãn: dữ liệu hiện vài trăm dòng mỗi nhà máy; khi nhiều dòng thì gộp bằng `OUTER APPLY` | Hoãn |
| L3 | LOW | Test chưa phủ biên nguy cơ, điều kiện `due` của trễ hạn, nhánh chỉ có bước xong trễ, A00 hai nhà máy, chính sách cột, `week` | Nhóm test riêng 6 bài (dưới) | Đóng (còn thiếu `cf`, bước ngừng dùng: không bắt buộc) |
| L4 | LOW | Test dùng ngày cố định, hỏng theo ngày chạy | Dòng thử ngày theo hôm nay (hôm nay, + 60), bỏ `if` bỏ qua im lặng | Đóng |
| L5 | LOW | Lý do ô ẩn chỉ ở `title`; nhãn bị cắt không xem được; thiếu Tooltip cho nút ⓘ; chữ "trên lưới" dễ hiểu là trang đang xem | Popup ⓘ giải thích ô "–"; `dt` có `title`; dấu "–"; Tooltip; "khớp bộ lọc (mọi trang)" | Đóng |
| L6 | LOW | Biến `t` trùng alias; kiểu trả về `filteredQuery`; kiểu `opts` viết lại; collation | Đổi tên, khai kiểu, dùng `Pick<ListOptions,…>`, ghi chú collation | Đóng |

**Lượt 2:** APPROVE WITH SUGGESTIONS, 0 CRITICAL, 0 HIGH, 0 MEDIUM, 5 LOW (M1, M2, L1, L3–L6 lượt 1 xác nhận đã đóng).

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| A | LOW | Tooltip nằm trong `Popover.Target`: nút ⓘ mất `aria-expanded`, `aria-controls` | Tooltip bọc ngoài Target, popup có kiểm soát, tắt tooltip khi popup mở | Đóng (test `aria-expanded`) |
| B | LOW | Lưới và số liệu tải song song nên chép dàn chuyền hai lần cùng lúc (hồi quy do sửa M2) | `PrepService.sync` dùng chung lần chép đang chạy theo nhà máy | Đóng (test gọi cùng lúc chỉ chép 1 lần; tắt cơ chế thì test đỏ) |
| C | LOW | Tải lại lỗi khi đã có số: số cũ hiện như số mới | Nút "Số liệu chưa cập nhật, thử lại" | Đóng (test) |
| D | LOW | Làm mờ số khi tải lại: tương phản dưới 4,5:1 | Bỏ làm mờ, thay bằng vòng xoay nhỏ cạnh nút ⓘ | Đóng |
| E | LOW | Mã hàng bị Ẩn/Che vẫn chép, dựng bộ lọc rồi mới trả null | Kiểm chính sách cột trước | Đóng |

Sau khi sửa: backend 190/190 (14 bộ; `sewing.spec.ts` 26, nhóm 5.5.8 chạy riêng cũng qua), frontend 100/100; lint, kiểm kiểu, build frontend qua. Đối chiếu thủ công trên dữ liệu local: số của API khớp cách tự đếm từ danh sách ở A01, A01 lọc tuần, A00, Trưởng chuyền 3. Kiểm giao diện bằng Chrome headless (1366px, 360px, chế độ tối). Phần sửa sau lượt 2 kiểm bằng test, chưa qua agent lượt 3. Không còn CRITICAL/HIGH/MEDIUM mở.

**Sau lượt 2 (cùng ngày):** người dùng đổi giao diện dải số sang thẻ màu theo ảnh mẫu. Chỉ đổi JSX, CSS của `PrepSummary.tsx` (thêm dòng giải thích, ô biểu tượng, nạp chữ đậm 800), không đổi cách đếm hay luồng tải. Sau đó thu thẻ thấp lại theo yêu cầu (số và dòng giải thích chung một hàng). Kiểm lại: frontend 100/100, lint, build; Chrome headless 1366px (thẻ cao 58px, không cắt nhãn), 360px (2×2 cao 56px, không cuộn ngang), chế độ tối; tương phản chữ trắng trên cả hai đầu dải màu từ 4,52:1 trở lên.
