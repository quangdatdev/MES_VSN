# Quy trình làm việc

File này nói cách làm việc trong dự án: chia phase và task, review code bằng agent `code-reviewer`, khi nào một việc được coi là xong, quy tắc an toàn khi dùng AI, skill của dự án, quy ước ngôn ngữ và cách giữ bộ tài liệu đúng với code. Đọc trước phiên làm việc đầu tiên, và mỗi khi bắt đầu một phase hay chuẩn bị báo cáo xong việc.

Trạng thái hiện tại của từng phase, việc còn chờ trên máy chủ, câu hỏi mở: [Trạng thái](02-trang-thai.md). File này không ghi trạng thái.

## 1. Làm việc theo phase

### Nguyên tắc

- Dự án chia thành phase (ví dụ 5.9) và task trong phase (ví dụ 5.9.13). **Chỉ làm việc thuộc phase đang `In progress`**, hoặc việc trưởng dự án giao trực tiếp; việc giao trực tiếp được ghi thành một task của phase phù hợp.
- Trước khi viết code: đọc [Trạng thái](02-trang-thai.md), file kế hoạch của phase, tài liệu của khối sẽ sửa và các quyết định liên quan ở [Quyết định](13-quyet-dinh.md). Điểm chưa rõ thì hỏi trưởng dự án, đưa phương án kèm đề xuất, rồi ghi câu trả lời vào mục "Chốt với người dùng".
- Tài liệu mâu thuẫn nhau, hoặc tài liệu nói khác code: báo trưởng dự án, không tự chọn bên nào.
- **Không làm ngoài phạm vi** (mục "Không làm" của phase). Thấy cần làm thêm thì ghi vào mục "Phát sinh" và hỏi.
- Chia việc lớn thành task 0,5–2 ngày, mỗi task có tiêu chí hoàn thành đo được (test nào qua, màn nào chạy được).
- Mỗi phase, mỗi task kết thúc ở trạng thái chạy được: build, lint qua, ứng dụng khởi động được. Không để dở dang.
- Hết phase thì **dừng**: cập nhật trạng thái, tóm tắt kết quả theo checklist review của phase, chờ trưởng dự án duyệt. Không tự sang phase kế tiếp.
- Trước khi chuyển `Ready for review`: chạy agent `code-reviewer` trên mọi file của phase (mục 2). Còn phát hiện `CRITICAL` hoặc `HIGH` chưa xử lý thì chưa được chuyển.

### Trạng thái

| Trạng thái | Nghĩa |
|---|---|
| `Not started` | Đã có kế hoạch, chưa bắt đầu |
| `In progress` | Đang làm |
| `Ready for review` | Code xong, test, review qua; chờ trưởng dự án duyệt |
| `Approved` | Trưởng dự án đã duyệt |
| `Blocked` | Dừng vì thiếu thông tin hoặc điều kiện (ghi rõ chờ gì) |

Trạng thái phase, phần còn lại, việc chờ trên máy chủ, câu hỏi chờ người dùng hoặc BA chỉ ghi ở [Trạng thái](02-trang-thai.md).

### File kế hoạch của một phase

Phase hoặc task lớn có một file kế hoạch riêng ở `docs/phases/phase-<số>-<ten-ngan>.md`, gồm:

| Mục | Nội dung |
|---|---|
| Dòng đầu | Trạng thái, ngày bắt đầu, quyết định liên quan |
| Mục tiêu | Yêu cầu của người dùng, viết lại thành điều kiểm được |
| Chốt với người dùng | Bảng `# \| Câu hỏi \| Chốt` (Q1, Q2…); thêm danh sách điểm tự chọn theo hướng hợp lý mà người dùng có thể đổi |
| Task | Bảng `# \| Việc \| Trạng thái`, số task dạng `<phase>.<n>`; cột Trạng thái ghi kết quả test, review, migration đã chạy hay chưa |
| Phạm vi review | Danh sách file, thư mục sẽ đưa cho `code-reviewer` |
| Không làm | Việc cố ý để ngoài phase |
| Rủi ro | Điều có thể làm chậm hoặc sai |
| Phát sinh | Việc thấy cần làm thêm, câu hỏi nảy ra trong lúc làm; gạch đi khi đã xử lý |

File kế hoạch là chỗ làm việc. Khi phase xong, nội dung còn giá trị lâu dài phải chuyển vào bộ tài liệu: quyết định vào [Quyết định](13-quyet-dinh.md), mô tả hệ thống vào tài liệu của khối, trạng thái và việc chờ vào [Trạng thái](02-trang-thai.md) (bảng ở mục 7).

### Nhiều phiên cùng làm, đánh số task

- Có thể có nhiều phiên (người hoặc AI) cùng sửa repo. Trước khi đặt số task mới, kiểm file kế hoạch phase và `git status` xem số đó đã có ai dùng chưa.
- Không `git checkout`, `git reset`, `git stash` hay ghi đè file có thay đổi chưa commit mà mình không tạo.
- Commit, push chỉ khi trưởng dự án bảo.

## 2. Review code bằng agent `code-reviewer`

Agent ở `.claude/agents/code-reviewer.md`. Mục đích: mỗi phase có một lượt review độc lập trước khi đưa trưởng dự án duyệt, tập trung vào phân quyền, lọc ĐVCS, bảo mật và đúng sai dữ liệu: phần lỗi khó thấy bằng mắt và đắt nếu lọt.

### Khi nào review

| Thời điểm | Phạm vi | Bắt buộc |
|---|---|---|
| Cuối mỗi phase hoặc task lớn, trước khi chuyển `Ready for review` | Mọi file thêm, sửa (mục "Phạm vi review" của file kế hoạch) | Có |
| Ngay khi sửa phần rủi ro cao, không đợi cuối phase | `backend/src/platform/auth`, `platform/data` (`BaseRepository`, Resource Registry), `platform/permission`, guard, API `/admin/*`, migration, script seed, reset, nạp dữ liệu | Có |
| Trước khi triển khai lên máy chủ dùng thật (UAT, Production) | Toàn bộ backend và migration | Có |
| Phase chạm phân quyền, kết nối hệ thống ngoài, máy chủ chính thức | Thêm một lượt review riêng về bảo mật | Có |
| Sau khi sửa theo một lượt review có nhiều phát hiện | Lượt "kiểm bản sửa" trên các file vừa sửa | Nên |
| Sửa giao diện thuần (màu, bố cục) | Không cần, trừ khi chạm logic ẩn hiện theo quyền | Không |

### Cách chạy

1. Lập danh sách file: lấy từ mục "Phạm vi review" của file kế hoạch; code nằm trong git nên có thể đối chiếu bằng `git status`, `git diff --name-only` (thư mục `docs/` không nằm trong git).
2. Gọi agent kèm: danh sách file, checklist của MES (dưới đây), các mục liên quan ở [Quyết định](13-quyet-dinh.md), yêu cầu **chỉ đọc, không sửa file**, trả kết quả theo mức.
3. Phiên chính kiểm chứng từng phát hiện (đọc code, chạy test) trước khi sửa. Phát hiện sai thì ghi "Không phải lỗi" kèm lý do.
4. Sửa xong chạy lại lint và test; phát hiện `CRITICAL`, `HIGH` thì thêm test chứng minh đã sửa khi làm được.
5. Ghi báo cáo vào `docs/review/phase-<số>.md` theo mẫu bên dưới; mỗi lần review là một mục "Lượt".
6. Khi báo cáo cho trưởng dự án, tóm tắt kết quả review (số phát hiện theo mức, đã xử lý thế nào, phần hoãn).

### Mức phát hiện và cổng chặn

| Mức | Cách xếp trong dự án | Xử lý |
|---|---|---|
| `CRITICAL` | Lộ hoặc mất dữ liệu diện rộng; vượt quyền không cần điều kiện đặc biệt (đọc dữ liệu ĐVCS khác, bỏ qua đăng nhập); lộ bí mật | Phải sửa trước khi chuyển trạng thái |
| `HIGH` | Vượt quyền hoặc sai dữ liệu trong tình huống thường gặp (ví dụ ĐVCS khác sửa được dữ liệu dùng chung mà ĐVCS khác dựa vào); lỗi đúng sai nghiêm trọng | Phải sửa trước khi chuyển trạng thái |
| `MEDIUM` | Lỗi trong tình huống hẹp, lộ gián tiếp (ví dụ sắp xếp theo cột bị Che làm lộ thứ tự giá trị), thiếu kiểm, hiệu năng đáng kể | Sửa ngay, hoặc ghi rõ "để task X" hay "không sửa" kèm lý do |
| `LOW` | Góp ý chất lượng code, test còn thiếu, chữ trên giao diện, trường hợp biên ít gặp | Như `MEDIUM` |

Kết luận của agent: `BLOCK` (còn `CRITICAL`/`HIGH`), `APPROVE WITH SUGGESTIONS`, `APPROVE`. Trưởng dự án duyệt danh sách `MEDIUM`/`LOW` hoãn hoặc không sửa cùng phase.

### Checklist riêng của MES

Đưa nguyên danh sách này cho agent mỗi lần review.

**Phân quyền và dữ liệu** ([Phân quyền](04-phan-quyen.md)):
- Mọi endpoint có `@Public`, `@Authenticated` hoặc `@RequirePermission`; quyền đúng hành động (đọc `view`, xuất file `export`, ghi `create`/`update`/`delete`).
- `BranchCode` chỉ lấy từ token (`AuthUser`, `scopeOf(user)`), không đọc từ body, query, header.
- Dữ liệu nghiệp vụ chỉ đi qua lớp con của `BaseRepository`/`ChildRepository`; không SQL thô hay điều kiện phân quyền tự viết trong controller, service.
- `getById`, update, delete, xuất file, popup giá trị cũng lọc ĐVCS và phạm vi; dòng ĐVCS khác hoặc ngoài phạm vi trả 404.
- `A00` đọc được; ghi dữ liệu theo ĐVCS bị từ chối (`AGGREGATE_READ_ONLY`); dữ liệu dùng chung chỉ ghi được ở `A00` khi quyết định cho phép.
- Tài nguyên mới khai trong `backend/scripts/seed-data.ts` (`ScopeType`, bảng nguồn, chiều phạm vi, cột đăng ký, cờ nhạy cảm); bảng dùng chung có cột `BranchCode` thì khai `originBranch`.
- Chính sách cột: dữ liệu trả về đi qua `FieldPolicyInterceptor` (`@FieldResource`) hoặc `FieldPolicyService.shape`; không sắp xếp, lọc, tìm, gợi ý theo cột Ẩn/Che; `FilterSpec` không có cột giá; xuất file qua `ExportService`; nhật ký không chứa cột nhạy cảm; dữ liệu lấy từ tài nguyên khác theo chính sách cột của tài nguyên nguồn.
- Không tự nâng quyền: không sửa vai trò, quyền, ĐVCS, phạm vi, trạng thái của chính mình; trần quyền `admin.*`; thao tác làm đổi phạm vi dữ liệu đòi `admin.permission:update`.
- Thay đổi phân quyền, đăng nhập, ghi dữ liệu quan trọng có `SysAuditLog`; đổi quyền hay phạm vi tăng phiên bản quyền trong cùng transaction.
- Ghi nhiều bước dùng transaction (`inTransaction`), khóa theo thứ tự đơn hàng → kế hoạch → dòng dàn chuyền → màu cỡ.
- Module không import phần bên trong module khác, không đọc `MES_Sync`; `npm run lint` qua.

**Database** ([Kiến trúc](03-kien-truc.md)):
- Schema chỉ đổi bằng migration mới (không sửa file đã chạy); tên PascalCase, tiếng Anh, số ít; `BranchCode VARCHAR(10)` có chỉ mục; bảng con có khóa ngoại ghép `(ParentId, BranchCode)`.
- Không xóa vật lý bảng danh mục; khóa ngoại vật lý chỉ trong cùng database; khóa ngầm khai trong `softkeys.json`, có chỉ mục.
- `UPDATE`, `DELETE` luôn có `WHERE`; không truy vấn trong vòng lặp với dữ liệu lớn; câu nhiều giá trị chia lô (SQL Server tối đa 2.100 tham số mỗi câu).
- Bảng có trigger không dùng `INSERT … OUTPUT`.
- Migration chạy được trên database đang có dữ liệu thật (giá trị cũ, thứ tự chạy, thời gian khóa bảng).

**Bảo mật chung:**
- Không mật khẩu, chuỗi kết nối, khóa bí mật trong code hay file commit (chỉ ở `.env`).
- Đầu vào kiểm bằng DTO (`ValidationPipe` `whitelist`); tên cột sắp xếp lấy từ danh sách trắng (`sortable`).
- Lỗi trả về không lộ chi tiết nội bộ; cookie phiên `httpOnly`, `SameSite`.

**Frontend** ([Giao diện](10-giao-dien.md)):
- Theo quy tắc UI/UX: thành phần dùng chung, không mất phần đang nhập, nút khóa nói lý do, trạng thái tải, lỗi, rỗng, cỡ chữ, tương phản, điện thoại.
- Lưới nhập dùng `SheetGrid`, lưới xem dùng `DataGrid`.
- Giao diện chỉ ẩn hiện, không là nơi duy nhất chặn quyền; nút ghi ẩn ở `A00` nhưng backend vẫn chặn.
- Không lưu token vào `localStorage`.
- Chữ tiếng Việt có dấu; thông báo lỗi nói rõ cách xử lý.

**TypeScript:** hạn chế `any` (lint không chặn `any` ở backend nên reviewer phải xem; chỗ nào giữ thì có lý do), Promise được `await`, không nuốt lỗi im lặng.

### Mẫu báo cáo `docs/review/phase-<số>.md`

```
# Review Phase <số> – <tên phase>
Phạm vi: <số file>, <thư mục, file>. Quyết định liên quan: <mục ở 13-quyet-dinh.md>

## Lượt <n> – <task, hoặc "kiểm bản sửa lượt n-1">
Kết luận agent: BLOCK / APPROVE WITH SUGGESTIONS / APPROVE (<số> CRITICAL, <số> HIGH, <số> MEDIUM, <số> LOW).
Phiên chính đã kiểm chứng: <phát hiện nào đúng, nào không>.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| H1 | HIGH | backend/src/...:42 | ... | Đã sửa, thêm test ... | Đóng |
| M1 | MEDIUM | ... | ... | Không phải lỗi: ... | Bỏ |
| L1 | LOW | ... | ... | Để task 5.x.y | Hoãn |

Sau khi sửa: lint, test (số bài qua, bộ database test đã dùng), build.
```

### Lưu ý về agent

- Agent được khai đủ công cụ `Read, Write, Edit, Bash, Glob, Grep`: "chỉ đọc" hiện chỉ là yêu cầu trong lời gọi, chưa bị cưỡng chế. Nên bỏ `Write`, `Edit` khỏi khai báo của agent.
- Agent tự chạy kiểm nhanh trước khi đọc code (`npm audit`, tìm chuỗi giống bí mật, `git log`), và đọc theo cỡ thay đổi: dưới 20 file đọc hết; 20–100 file đọc diff rồi đọc kỹ file rủi ro cao; trên 100 file thì yêu cầu thu hẹp phạm vi. Phạm vi một lượt review nên chia theo task để không vượt 100 file.
- Mỗi phát hiện của agent có dạng `[MỨC] file:dòng — mô tả`, kèm rủi ro và cách sửa; cuối có dòng tóm tắt và kết luận.

## 3. Định nghĩa "xong"

Một task chỉ được coi là xong khi đủ các điều sau:

- `npm run lint`, `npm run build` qua; test liên quan qua, đặc biệt test phân quyền và lọc ĐVCS. Luật phân quyền mới có bài test mới.
- Đúng quy ước code, database ([Kiến trúc](03-kien-truc.md)) và luật phân quyền ([Phân quyền](04-phan-quyen.md)): không SQL thô ngoài repository, không `BranchCode` từ client, endpoint có khai báo quyền, tài nguyên mới đã khai ở seed.
- Migration (nếu có): file đã tạo và đã qua review; đã chạy trên database được phép, hoặc đã ghi vào [Trạng thái](02-trang-thai.md) mục việc còn chờ trên máy chủ. Có khóa ngầm mới thì `npm run check:softkeys -w backend` qua.
- Đã qua `code-reviewer`, không còn `CRITICAL`/`HIGH` mở; `MEDIUM`/`LOW` đã sửa hoặc ghi lý do.
- Giao diện (nếu có): đã mở thử trên trình duyệt ở màn rộng và màn điện thoại, theo quy tắc ở [Giao diện](10-giao-dien.md).
- Tài liệu đã cập nhật theo bảng ở mục 7; quyết định mới đã ghi ở [Quyết định](13-quyet-dinh.md); trạng thái đã ghi ở [Trạng thái](02-trang-thai.md).
- Dữ liệu test, tài khoản test, bộ database test tạo ra trong lúc làm đã dọn.

## 4. An toàn khi dùng AI

### Database và migration

- AI **chỉ tạo file migration**; người duyệt và chạy. AI không tự chạy migration lên database dùng chung, trừ ngoại lệ đang có hiệu lực ở bảng dưới.
- Thao tác thử trên database thật (ví dụ chạy thử bước nạp đơn hàng BRAVO): chạy trong transaction rồi hủy (không ghi) trước, xem kết quả, rồi mới chạy thật khi được đồng ý.
- Cờ trong `.env` làm đổi hành vi máy chủ (ví dụ `BRAVO_ORDER_IMPORT`, `OSM_FACTORY_UPDATE`) chỉ bật, tắt khi trưởng dự án bảo.
- Script ghi đè dữ liệu có chốt chặn: thiếu `--yes` thì chỉ in mô tả; database không ở máy này thì từ chối trừ khi thêm `--allow-remote-db`; máy `SEED_SAMPLE_DATA=false` từ chối `reset:demo`, `load:bravo`, `sim:board`. Không thêm cờ để vượt chốt khi chưa được đồng ý. Chi tiết: [Vận hành](11-van-hanh.md).

### Bí mật

- Không đưa mật khẩu, chuỗi kết nối, khóa bí mật vào prompt, code, tài liệu hay file commit. Chúng chỉ nằm ở `backend/.env` (đã có trong `.gitignore`); `backend/.env.example` chỉ có tên biến và giá trị mẫu không bí mật.
- Không nhận mật khẩu qua khung chat: người dùng tự điền `backend/.env`. Không in nội dung `backend/.env` ra chat, log hay tài liệu.

### Dữ liệu thật và hệ thống ngoài

- Hệ thống ngoài (BRAVO, OSM, GSD) chỉ chạm ở lớp đồng bộ, chỉ đọc ([Quyết định](13-quyet-dinh.md) mục 8.1). BRAVO chỉ đọc view của database trung gian; không truy vấn database BRAVO thật dù tài khoản có quyền; không xóa, không sửa view ở database trung gian.
- Không chép dữ liệu thật (tên khách hàng, số PO, thông tin nhân viên) vào tài liệu, báo cáo, test; chỉ dùng số liệu tổng hợp (số dòng, số đơn).
- Kiểm giao diện có dữ liệu thật bằng script đọc trang (đếm dòng, cột trống), không chụp ảnh màn hình có tên khách hàng.
- Test và dữ liệu mẫu chỉ dùng dữ liệu giả.

### Hành động khó đảo ngược phải hỏi trước

Xóa dữ liệu, drop bảng, chạy `reset:demo`, `load:bravo` (xóa đơn hàng, kế hoạch rồi nạp lại) hay `sim:board --all` trên database có dữ liệu người dùng nhập, xóa database, push, deploy, đổi cấu hình máy chủ: hỏi trưởng dự án trước, kể cả khi đã được cho phép thao tác trên database đó.

### Chạy test

- Test backend chạy trên database thật và ghi, xóa dữ liệu. **Không chạy test trên database của máy chủ đang dùng.**
- Dùng bộ database test riêng: ghi đè `DB_CORE_NAME`, `DB_ORDER_NAME`, `DB_SEWING_NAME`, `DB_CUTTING_NAME`, `DB_HR_NAME`, `DB_SYNC_NAME` bằng biến môi trường của lần chạy (ví dụ bộ `MES_*_Test`; phiên khác đang dùng bộ đó thì đặt tên bộ riêng), migrate và seed dữ liệu mẫu vào bộ đó, chạy test, xong **xóa đúng bộ đó**. Cách làm chi tiết: [Dữ liệu mẫu và kiểm thử](12-du-lieu-mau-va-kiem-thu.md).
- Code do AI sinh phải qua lint và test trước khi coi là xong; phân quyền và lọc ĐVCS luôn có test.

### Khi công cụ chặn

Lệnh bị bộ phân quyền của công cụ chặn (kể cả lệnh trưởng dự án đã cho phép trước đó): dừng, đưa nguyên lệnh cho trưởng dự án chạy hoặc xin phép. Không đổi cách gọi để vượt qua, không tự sửa cấu hình quyền của công cụ, `CLAUDE.md` hay cấu hình agent.

### Ngoại lệ đang có hiệu lực

| Ngoại lệ | Phạm vi và giới hạn | Nguồn |
|---|---|---|
| AI được chạy migration, seed, thao tác trực tiếp trên database của máy chủ | Chỉ khi database máy chủ còn chứa dữ liệu demo, chưa chạy thật; dùng tài khoản do người dùng tự điền `backend/.env`. Hành động khó đảo ngược vẫn phải hỏi; công cụ chặn thì dừng | ADR 0013 mục "Mâu thuẫn với tài liệu đã có" |
| AI được chạy migration, seed, nạp dữ liệu BRAVO đã chép (`load:bravo`) trên SQL Server của máy người dùng | Chỉ các database MES trên máy đó; cấm xóa bất cứ gì trên database BRAVO thật và cấm xóa view ở database trung gian | Chỉ đạo của trưởng dự án khi làm phase 5.1–5.3 (module Đơn hàng, đồng bộ) |

Ngoại lệ không tự mở rộng sang database khác. Trưởng dự án rút lại thì quay về quy tắc chung.

## 5. Skill và agent của dự án

| Tên | Vị trí | Dùng khi | Lưu ý cho MES |
|---|---|---|---|
| `frontend-design` | `.claude/skills/frontend-design/SKILL.md` | **Bắt buộc** khi dựng mới hoặc sửa giao diện | Hướng thiết kế đã chốt (màu, chữ, bố cục ở [Quyết định](13-quyet-dinh.md) mục 12 và [Giao diện](10-giao-dien.md)) là "brief": skill quy định lời của brief luôn thắng. Dùng skill cho quy trình (lập kế hoạch, tự phê bình), mức chất lượng tối thiểu (chạy tới màn điện thoại, focus bàn phím, tương phản) và cách viết chữ trên giao diện (động từ rõ, lỗi nói cách sửa). Không tự đổi màu, font, bố cục |
| `senior-architect` | `.claude/skills/senior-architect/` | Cần quyết định kỹ thuật, so sánh phương án, vẽ sơ đồ kiến trúc, viết quyết định mới | Nội dung chung chung (script Python, ví dụ Postgres, Express): dùng phần `references/` làm khung cân nhắc; ràng buộc đã chốt của MES (SQL Server, NestJS, mỗi module một database, `BaseRepository`) thắng. Kết quả ghi vào [Quyết định](13-quyet-dinh.md) |
| `react-best-practices` | `.claude/skills/react-best-practices/` | Rà hoặc tối ưu hiệu năng frontend; viết màn có lưới lớn, ô lọc gõ liên tục, nhiều request song song | Phần Next.js, Server Components, SWR không áp dụng (ứng dụng là Vite một trang, dùng TanStack Query). Quy tắc hiệu năng đã rút ra cho MES ở [Giao diện](10-giao-dien.md) |
| `code-reviewer` (agent) | `.claude/agents/code-reviewer.md` | Review cuối phase, ngay khi sửa phần rủi ro cao, trước triển khai | Mục 2 |

## 6. Ngôn ngữ

- Trao đổi và tài liệu: tiếng Việt có đầy đủ dấu. Thuật ngữ kỹ thuật và định danh (tên bảng, cột, API, biến môi trường, hàm) giữ nguyên tiếng Anh, đặt trong backtick.
- Code: định danh, tên biến, tên bảng, cột tiếng Anh. Chữ trên giao diện và thông điệp lỗi API tiếng Việt có dấu, nói rõ chuyện gì xảy ra và cách xử lý. Comment tiếng Việt, chỉ giải thích "vì sao", không mô tả lại code.
- Thuật ngữ nghiệp vụ dùng thống nhất theo [Tổng quan](01-tong-quan.md) (ĐVCS, Nhà máy SX, PO, KHXH…). Trên giao diện, `SysBranch` luôn gọi là "Đơn vị cơ sở" (cột ngắn "ĐVCS"), không gọi là "nhà máy".

## 7. Cập nhật bộ tài liệu

### Nguyên tắc

- **Mỗi thông tin một chỗ.** Viết ở file sở hữu (bảng dưới); file khác cần thì dẫn link tương đối, không chép lại.
- Viết trạng thái hiện tại, thì hiện tại. Không kể lịch sử, không ghi "ngày X người dùng yêu cầu", không ghi lượt review; lịch sử nằm ở git và báo cáo review.
- Mọi khẳng định kiểm bằng code; dẫn vị trí code dạng `backend/src/platform/data/base.repository.ts`. Không chắc thì ghi "chưa rõ" kèm vị trí code.
- Không chép mật khẩu, chuỗi kết nối, giá trị thật trong `.env`, dữ liệu thật của nhà máy.
- Sửa code mà không sửa tài liệu tương ứng thì task chưa xong (mục 3).
- Thư mục `docs/` nằm trong `.gitignore`: tài liệu không có lịch sử trong git, sửa nhầm không lấy lại được bằng git. Sửa cẩn thận, giữ bản sao khi sửa lớn.

### Đổi gì thì sửa file nào

| Loại thay đổi | Code, cấu hình phải sửa | Tài liệu phải sửa |
|---|---|---|
| Thêm, sửa bảng, cột phân quyền ở `MES_Core` (người dùng, vai trò, quyền, phiên, nhật ký, menu, tài nguyên) | Migration `MES_Core/NNNN_*.sql`, `backend/src/platform/database/core.types.ts` | [04](04-phan-quyen.md) (bảng); [03](03-kien-truc.md) (danh sách migration) |
| Thêm, sửa bảng danh mục ở `MES_Core` (`SysBranch`, `SysOrgUnit`, `SysCatalog*`, `SysShift`, `SysProductionFactory`) | Migration `MES_Core`, `core.types.ts` | [05](05-quan-tri-he-thong.md); [03](03-kien-truc.md) (migration) |
| Thêm, sửa bảng, cột của module | Migration `MES_<Module>/NNNN_*.sql`, `<module>.types.ts` | File của module: [06](06-don-hang.md), [07](07-may.md), [08](08-nhan-su.md), [15](15-cat.md); [03](03-kien-truc.md) (migration) |
| Cột trỏ sang database khác (khóa ngầm) | `backend/migrations/softkeys.json`, chỉ mục cho cột | [03](03-kien-truc.md) (bảng khóa ngầm); file của khối |
| Thêm nguồn đồng bộ, đổi bảng chép | Cấu hình và chạy `backend/scripts/sync-gen.ts` (migration `MES_Sync` sinh tự động), `backend/scripts/source-databases.ts` nếu có database nguồn mới, `.env.example` | [09](09-dong-bo.md); [11](11-van-hanh.md) (biến môi trường); [03](03-kien-truc.md) (migration); file của module dùng dữ liệu |
| Thêm, sửa API | Controller, DTO, service | File của khối sở hữu API: [04](04-phan-quyen.md) (`/auth`), [05](05-quan-tri-he-thong.md) (`/admin/*`, `/admin/catalogs/*`, `/me/*`), [06](06-don-hang.md) (`/order/*`), [07](07-may.md) (`/sewing/*`), [15](15-cat.md) (`/cutting/*`), [08](08-nhan-su.md) (`/hr/*`), [09](09-dong-bo.md) (`/admin/sync/*`) |
| Đổi luật nghiệp vụ của một màn | Service, repository | File của khối |
| Thêm màn hình | `frontend/src/routes/registry.tsx`, màn ở `frontend/src/features/<khối>/`, tài nguyên ở `seed-data.ts` | File của khối (màn hình); [01](01-tong-quan.md) (menu và màn hình); [12](12-du-lieu-mau-va-kiem-thu.md) (ma trận quyền mẫu) |
| Thêm tài nguyên, quyền, cột đăng ký, cờ nhạy cảm | `backend/scripts/seed-data.ts` (`resources`, `scopeBindings`, `resourceFields`) | File của khối (quyền của màn); [12](12-du-lieu-mau-va-kiem-thu.md) (ma trận, chính sách cột mẫu) |
| Đổi vai trò mẫu, ma trận quyền mẫu, chính sách cột mẫu, tài khoản demo, phạm vi mẫu | `backend/scripts/seed-data.ts`, `seed.ts` | [12](12-du-lieu-mau-va-kiem-thu.md) |
| Đổi cơ chế phân quyền (`BaseRepository`, `PermissionService`, `FieldPolicyService`, guard, phiên) | `backend/src/platform/*` | [04](04-phan-quyen.md); [13](13-quyet-dinh.md) nếu đổi quyết định |
| Thêm mã lỗi API | `backend/src/common/app.exception.ts` | [04](04-phan-quyen.md) (mã lỗi) |
| Thêm, đổi biến môi trường | `backend/src/config/env.ts`, `backend/.env.example` | [11](11-van-hanh.md); file của khối dùng biến |
| Thêm lệnh npm, script | `package.json`, `backend/scripts/*` | [11](11-van-hanh.md); [12](12-du-lieu-mau-va-kiem-thu.md) nếu là seed, test; `CLAUDE.md` nếu là lệnh dùng hằng ngày |
| Đổi cách cài đặt, triển khai máy chủ | Script, cấu hình | [11](11-van-hanh.md) |
| Thêm thành phần dùng chung, đổi theme, quy tắc UI/UX, quy tắc hiệu năng frontend | `frontend/src/components/*`, `frontend/src/theme/*` | [10](10-giao-dien.md) |
| Quyết định kiến trúc mới, đổi quyết định | – | [13](13-quyet-dinh.md) (mục mới: áp dụng, lý do, phải nhớ, nguồn); file của khối liên quan; [03](03-kien-truc.md) nếu đổi kiến trúc; `CLAUDE.md` nếu là quy tắc bắt buộc |
| Thêm module nghiệp vụ | `backend/src/modules/<module>/`, `<module>.db.ts`, thư mục migration mới, khối luật lint trong `backend/eslint.config.mjs`, biến database trong `env.ts` | [03](03-kien-truc.md) (database, ranh giới module); [01](01-tong-quan.md); file tài liệu mới cho module; [README](README.md) (mục lục); [11](11-van-hanh.md) (biến môi trường) |
| Đổi cấu trúc thư mục | – | [03](03-kien-truc.md) |
| Thêm thuật ngữ | – | [01](01-tong-quan.md) |
| Trạng thái phase, task; việc còn chờ trên máy chủ; câu hỏi chờ người dùng hoặc BA | – | [02](02-trang-thai.md) |
| Đổi quy trình, cách review, quy tắc an toàn khi dùng AI, skill, agent | `.claude/agents/*`, `.claude/skills/*` | File này; `CLAUDE.md` |

### `CLAUDE.md`

`CLAUDE.md` ở gốc repo được AI đọc tự động mỗi phiên. Đó là kế hoạch tổng quan bản tóm tắt (khoảng 100 dòng): dự án và lộ trình, quy trình, kiến trúc, luật phân quyền, quy ước database và code, an toàn khi dùng AI, lệnh dùng hằng ngày; chi tiết dẫn sang bộ tài liệu này. Không ghi trạng thái vào `CLAUDE.md` (trạng thái chỉ ở [02](02-trang-thai.md)). Giữ nguyên số mục 4, 5, 6 và số luật trong mục 4 (code có comment trích "CLAUDE.md mục 4.5", "mục 4.8", "mục 5", "mục 6"). Đổi một quy tắc bắt buộc (phân quyền, an toàn khi dùng AI, quy trình phase) thì sửa cả `CLAUDE.md` và file sở hữu ở đây, giữ hai nơi cùng nội dung.
