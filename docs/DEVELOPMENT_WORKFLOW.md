# Quy trình phát triển

| Mục | Nội dung |
|---|---|
| Mục đích | Quy trình nhận task, phạm vi và tiêu chí xong, review code, nhánh, PR, merge, xử lý xung đột, revert, hotfix, rollback, cập nhật tài liệu |
| Đối tượng | Dev, Tech Lead, AI agent |
| Nguồn quy tắc | Quy tắc an toàn, commit, hành động khó đảo ngược ở [AGENTS.md](../AGENTS.md) mục 7; Definition of Done ở [ENGINEERING_STANDARDS.md](ENGINEERING_STANDARDS.md) mục 10 |
| Ngày đối chiếu | 19/10/2026 (git `main` ở `98d19db`) |

Nhãn: **CURRENT** = đang làm như vậy, có bằng chứng; **APPROVED** = Tech Lead đã duyệt (19/10/2026), có thể chưa áp dụng hết. Mọi mục PROPOSED trước đây đã được Tech Lead duyệt ngày 19/10/2026.

## 1. Nhận task — CURRENT

- Chỉ làm task được giao hoặc thuộc phase đang `In progress`. Việc ngoài phạm vi, câu hỏi nảy ra: ghi vào [current/STATUS.md](current/STATUS.md) và hỏi.
- Trước khi viết code: đọc [STATUS](current/STATUS.md), tài liệu module của khối sẽ sửa, quyết định liên quan ở [13](update_docs/13-quyet-dinh.md). Điểm chưa rõ thì hỏi Tech Lead, đưa phương án kèm đề xuất, ghi câu trả lời vào STATUS.
- Có thể có nhiều phiên (người hoặc AI) cùng sửa repo: trước khi đặt số task mới, kiểm STATUS và `git status` xem số đó đã có ai dùng chưa.
- Tài liệu mâu thuẫn nhau hoặc nói khác code: báo Tech Lead, không tự chọn.

## 2. Phạm vi task và tiêu chí nghiệm thu

| Quy định | Trạng thái |
|---|---|
| Dự án chia phase (ví dụ 5.17) và task (ví dụ 5.17.2) | CURRENT |
| Task 0,5–2 ngày, có tiêu chí xong đo được (test nào qua, màn nào chạy được), kết thúc ở trạng thái chạy được (build, lint qua, ứng dụng khởi động) | CURRENT |
| Hết phase thì dừng, tóm tắt kết quả, chờ Tech Lead duyệt; không tự sang phase kế tiếp | CURRENT |
| Trạng thái phase: `Not started`, `In progress`, `Ready for review` (code xong, test, review qua), `Approved`, `Blocked` (ghi rõ chờ gì) | CURRENT |
| Trạng thái phase, việc chờ, câu hỏi mở chỉ ghi ở [current/STATUS.md](current/STATUS.md) | APPROVED (19/10/2026) |
| Không còn file kế hoạch riêng cho từng phase (`docs/phases/` đã xóa 19/10/2026; bản cũ: `git show 98d19db:docs/phases/<file>`) | APPROVED |
| Kế hoạch phase ghi trong [STATUS](current/STATUS.md) mục "Đang làm", theo khuôn ở mục 2.1 | APPROVED |

### 2.1 Khuôn kế hoạch phase trong STATUS — APPROVED

| Phần | Nội dung |
|---|---|
| Dòng đầu | Số phase, tên, trạng thái, ngày bắt đầu, nhánh, quyết định liên quan |
| Mục tiêu | Yêu cầu của người dùng viết thành điều kiểm được |
| Chốt với người dùng | Bảng `# \| Câu hỏi \| Chốt` (Q1, Q2…); điểm tự chọn theo hướng hợp lý mà người dùng có thể đổi |
| Task | Bảng `# \| Việc \| Trạng thái`, số task `<phase>.<n>`; trạng thái ghi kết quả test, review, migration đã chạy hay chưa |
| Phạm vi review | File, thư mục đưa cho `code-reviewer` |
| Không làm | Việc cố ý để ngoài phase |
| Rủi ro, phát sinh | Điều có thể làm chậm hoặc sai; việc thấy cần làm thêm, câu hỏi nảy ra (gạch khi đã xử lý) |

Xong phase: quyết định vào [13](update_docs/13-quyet-dinh.md), mô tả hệ thống vào tài liệu module, việc chờ và câu hỏi còn mở giữ ở STATUS; phần kế hoạch rút còn một dòng trong bảng trạng thái phase.

## 3. Code review — CURRENT

Agent `code-reviewer` (`.claude/agents/code-reviewer.md`). Checklist kỹ thuật của MES: [ENGINEERING_STANDARDS.md](ENGINEERING_STANDARDS.md) mục 3 (đưa nguyên checklist vào mỗi lần gọi).

### 3.1 Khi nào review

| Thời điểm | Phạm vi | Bắt buộc |
|---|---|---|
| Cuối mỗi phase hoặc task lớn, trước khi chuyển `Ready for review` | Mọi file thêm, sửa | Có |
| Ngay khi sửa phần rủi ro cao | `backend/src/platform/auth`, `platform/data`, `platform/permission`, guard, API `/admin/*`, migration, script seed, reset, nạp dữ liệu | Có |
| Trước khi triển khai lên máy chủ dùng thật | Toàn bộ backend và migration | Có |
| Phase chạm phân quyền, hệ thống ngoài, máy chủ chính thức | Thêm một lượt review riêng về bảo mật | Có |
| Sau khi sửa theo lượt review có nhiều phát hiện | Lượt "kiểm bản sửa" trên file vừa sửa | Nên |
| Sửa giao diện thuần (màu, bố cục) | Không cần, trừ khi chạm logic ẩn hiện theo quyền | Không |

### 3.2 Cách chạy

1. Lập danh sách file (`git status`, `git diff --name-only`). Một lượt không quá 100 file; chia theo task.
2. Gọi agent kèm danh sách file, checklist, các mục liên quan ở [13](update_docs/13-quyet-dinh.md), yêu cầu **chỉ đọc, không sửa file** (agent đang khai cả `Write`, `Edit`), trả kết quả theo mức.
3. Phiên chính kiểm chứng từng phát hiện (đọc code, chạy test) trước khi sửa; phát hiện sai ghi "Không phải lỗi" kèm lý do.
4. Sửa xong chạy lại lint, test; phát hiện `CRITICAL`, `HIGH` thì thêm test chứng minh đã sửa khi làm được.
5. Ghi báo cáo vào `docs/review/phase-<số>.md`, mỗi lần review một mục "Lượt"; tóm tắt cho Tech Lead (số phát hiện theo mức, đã xử lý, phần hoãn).

### 3.3 Mức và cổng chặn

| Mức | Nghĩa trong dự án | Xử lý |
|---|---|---|
| `CRITICAL` | Lộ hoặc mất dữ liệu diện rộng; vượt quyền không cần điều kiện đặc biệt; lộ bí mật | Sửa trước khi chuyển trạng thái |
| `HIGH` | Vượt quyền hoặc sai dữ liệu trong tình huống thường gặp; lỗi đúng sai nghiêm trọng | Sửa trước khi chuyển trạng thái |
| `MEDIUM` | Lỗi trong tình huống hẹp, lộ gián tiếp, thiếu kiểm, hiệu năng đáng kể | Sửa, hoặc ghi "để task X"/"không sửa" kèm lý do |
| `LOW` | Chất lượng code, test còn thiếu, chữ trên giao diện, trường hợp biên | Như `MEDIUM` |

Kết luận của agent: `BLOCK` (còn `CRITICAL`/`HIGH`), `APPROVE WITH SUGGESTIONS`, `APPROVE`. Tech Lead duyệt danh sách `MEDIUM`/`LOW` hoãn hoặc không sửa.

### 3.4 Mẫu báo cáo `docs/review/phase-<số>.md`

```
# Review Phase <số> – <tên phase>
Phạm vi: <số file>, <thư mục, file>. Quyết định liên quan: <mục ở 13-quyet-dinh.md>

## Lượt <n> – <task, hoặc "kiểm bản sửa lượt n-1">
Kết luận agent: BLOCK / APPROVE WITH SUGGESTIONS / APPROVE (<số> CRITICAL, <số> HIGH, <số> MEDIUM, <số> LOW).
Phiên chính đã kiểm chứng: <phát hiện nào đúng, nào không>.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| H1 | HIGH | backend/src/...:42 | ... | Đã sửa, thêm test ... | Đóng |

Sau khi sửa: lint, test (số bài qua, bộ database test đã dùng), build.
```

## 4. Nhánh, Develop, Pull Request, merge

### 4.1 Hiện trạng git — CURRENT

- Remote: `origin` (GitHub) là remote chính, máy chủ kéo code từ đây (Tech Lead xác nhận 19/10/2026); `githq5` là máy chủ Gitea nội bộ.
- Đến 19/10/2026 code được commit thẳng lên `main`; nhánh theo phase (`phase-5-10`, `phase-5-11`…) đã gộp cục bộ vào `main`, không có PR, không có tag. Ngày 19/10/2026 Tech Lead yêu cầu **tạm theo dõi trên `main`** cho đợt chuẩn hóa tài liệu.
- Chưa có CI, chưa có git hook; máy chủ triển khai từ commit đã push bằng `deploy/deploy.cjs`.

### 4.2 Mô hình nhánh — APPROVED (19/10/2026), áp dụng khi Tech Lead bảo bắt đầu

| Nhánh | Vai trò | Tách từ | Gộp về |
|---|---|---|---|
| `main` | Bản đã chạy trên máy chủ; triển khai từ đây | – | – |
| `develop` | Nhánh tích hợp; mọi task gộp vào đây trước | `main` | `main` khi phát hành |
| `feature/<phase>-<tên>` | Một nhánh mỗi task | `develop` | `develop` qua PR có CI và review |
| `hotfix/<tên>` | Sửa gấp lỗi trên bản đang chạy | `main` | Cả `main` và `develop` |

Không code trực tiếp trên `main` khi mô hình đã áp dụng.

### 4.3 Pull Request và điều kiện merge

| Quy định | Trạng thái |
|---|---|
| Gộp `feature/*` vào `develop` qua PR có CI và review | APPROVED (cùng mô hình nhánh) |
| Điều kiện merge: Definition of Done ([ENGINEERING_STANDARDS.md](ENGINEERING_STANDARDS.md) mục 10), không còn `CRITICAL`/`HIGH` mở | CURRENT (áp cho mọi task) |
| CI phải qua trước khi merge; các bước kiểm ở [ENGINEERING_STANDARDS.md](ENGINEERING_STANDARDS.md) mục 9 | APPROVED (CI chưa dựng: task T2) |
| Mô tả PR ghi: task, phạm vi, migration (có/không, chạy được khi bản cũ còn chạy không), link báo cáo review, kết quả lint/test/build, việc cần làm trên máy chủ | APPROVED |
| Tech Lead duyệt mọi PR vào `develop`, `main` | APPROVED |
| Bảo vệ nhánh `main`, `develop` trên GitHub: cấm push thẳng, cấm force push, bắt CI qua | APPROVED (chưa cấu hình: task T6) |
| Kiểu gộp: `feature/*` → `develop` bằng **squash** (một commit mỗi task); `develop` → `main` và `hotfix/*` bằng **merge commit** | APPROVED |

### 4.4 Commit

| Quy định | Trạng thái |
|---|---|
| Chỉ commit, push khi người dùng hoặc Tech Lead bảo | CURRENT ([AGENTS.md](../AGENTS.md) mục 7) |
| Không đưa bí mật, dữ liệu thật vào commit | CURRENT |
| Code phải commit, push trước khi triển khai: `deploy.cjs` chỉ triển khai commit | CURRENT ([11 Vận hành](update_docs/11-van-hanh.md)) |
| Mẫu message `<số task> <mô tả tiếng Việt có dấu>` (ví dụ `5.17.2 Kế hoạch xuất hàng: thêm PO khi Sửa`); commit squash của PR dùng cùng mẫu | APPROVED (lịch sử trước 19/10/2026 lẫn kiểu "Update", "Dieu chinh giao dien") |

### 4.5 Xung đột

| Quy định | Trạng thái |
|---|---|
| Không `git checkout`, `git reset`, `git stash` hay ghi đè thay đổi chưa commit mà mình không tạo | CURRENT ([AGENTS.md](../AGENTS.md) mục 7) |
| Xung đột khi gộp: người làm task tự giải quyết trên nhánh của mình, chạy lại lint, test, build; không bỏ phần của người khác khi chưa hỏi | APPROVED |
| Không `push --force` lên `main`, `develop` | APPROVED |
| Hai task cùng lấy một số migration: task gộp sau đổi sang số kế tiếp trước khi gộp | APPROVED |

## 5. Revert, hotfix, rollback

| Tình huống | Cách làm | Trạng thái |
|---|---|---|
| Bản mới lỗi sau khi chuyển trên máy chủ | `node deploy\deploy.cjs --root <thư mục> --rollback`: về bản đã chạy được gần nhất, không migrate | CURRENT (`deploy/deploy.cjs`) |
| Bản mới không chạy ổn định ngay sau khi chuyển, không có migration mới | `deploy.cjs` tự quay về bản trước | CURRENT |
| Đã chạy migration | Không có migration lùi; bản trước chỉ chạy được nếu migration chỉ thêm bảng, cột cho phép NULL hoặc có DEFAULT; còn lại phục hồi sao lưu | CURRENT |
| Sao lưu | `deploy.cjs` hỏi đã sao lưu khi có migration mới | CURRENT |
| Sửa gấp | Nhánh `hotfix/<tên>` từ `main`, gộp về `main` và `develop` | APPROVED, chưa áp dụng |
| Bỏ một commit đã push | `git revert` trên nhánh dùng chung, không viết lại lịch sử | APPROVED |

Chi tiết lệnh, các trường hợp triển khai: [11 Vận hành](update_docs/11-van-hanh.md).

## 6. Cập nhật tài liệu

### 6.1 Nguyên tắc — APPROVED (19/10/2026)

- **Mỗi thông tin một nguồn.** Viết ở tài liệu sở hữu (bảng 6.2); nơi khác chỉ dẫn link tương đối. Không còn cơ chế giữ hai nơi cùng nội dung giữa `CLAUDE.md` và tài liệu khác: quy tắc bắt buộc nằm ở `AGENTS.md`.
- Viết hiện trạng; lịch sử nằm ở git và báo cáo review. Mọi khẳng định kiểm bằng code, dẫn đường dẫn code; chưa chắc thì ghi NEEDS VERIFICATION.
- Sửa code mà không sửa tài liệu sở hữu thì task chưa xong.
- `docs/` đã đưa vào git từ commit `98d19db` (19/10/2026). Tài liệu cũ đã xóa (ADR, file phase, `thiet-ke/*.md`, `update_docs/01`, `02`, `03`, `14`…) lấy lại bằng `git show 98d19db:<đường dẫn>`.

### 6.2 Đổi gì thì sửa tài liệu nào

| Thay đổi | Tài liệu sở hữu |
|---|---|
| Quy tắc bắt buộc: phân quyền, ranh giới kiến trúc, an toàn khi dùng AI, lệnh dùng hằng ngày | `AGENTS.md` |
| Skill, agent của Claude Code | `CLAUDE.md` |
| Phạm vi nghiệp vụ, khối, menu và màn hình, thuật ngữ, công nghệ, cài đặt cơ bản | [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) |
| Layer, module, phụ thuộc, luật lint ranh giới, contract chung, danh sách database và migration, loại khóa ngầm, triển khai tổng quát, vấn đề kiến trúc chờ quyết | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Luồng đăng nhập, request, đọc ghi, xuyên module, đồng bộ, tác vụ nền, xử lý lỗi | [DATA_FLOWS.md](DATA_FLOWS.md) |
| Quy ước đặt tên, cấu trúc file, DTO, lỗi, truy cập database, tái sử dụng, tổ chức test | [CODE_CONVENTIONS.md](CODE_CONVENTIONS.md) |
| Tiêu chuẩn test, bảo mật, checklist review, migration, audit, phụ thuộc, CI, Definition of Done | [ENGINEERING_STANDARDS.md](ENGINEERING_STANDARDS.md) |
| Quy trình task, review, nhánh, PR, commit, rollback, bảng này | File này |
| Trạng thái, việc đang làm, việc chờ máy chủ, câu hỏi mở, nợ kỹ thuật, lỗi đã biết | [current/STATUS.md](current/STATUS.md) |
| Quyết định kiến trúc mới hoặc đổi quyết định | [13 Quyết định](update_docs/13-quyet-dinh.md) (mục mới: áp dụng, lý do, phải nhớ, nguồn); sửa tài liệu sở hữu liên quan |
| Cơ chế phân quyền chi tiết, bảng phân quyền `MES_Core`, API `/auth`, danh sách mã lỗi | [04](update_docs/04-phan-quyen.md) |
| Màn Quản trị, API `/admin/*`, `/admin/catalogs/*`, `/me/*`, bảng danh mục `MES_Core` | [05](update_docs/05-quan-tri-he-thong.md) |
| Module Đơn hàng (màn, luật, API `/order/*`, bảng, migration `MES_Order`) | [06](update_docs/06-don-hang.md) |
| Module May | [07](update_docs/07-may.md) |
| Module Nhân sự | [08](update_docs/08-nhan-su.md) |
| Đồng bộ, API `/admin/sync/*`, nguồn mới | [09](update_docs/09-dong-bo.md) |
| Module Cắt | [15](update_docs/15-cat.md) |
| Thành phần frontend dùng chung, theme, quy tắc UI/UX, quy tắc hiệu năng | [10](update_docs/10-giao-dien.md) |
| Biến môi trường, lệnh npm, script, migrate, seed, triển khai máy chủ, sự cố | [11](update_docs/11-van-hanh.md) |
| Dữ liệu seed, vai trò và ma trận mẫu, tài khoản demo, kịch bản demo, danh sách file test | [12](update_docs/12-du-lieu-mau-va-kiem-thu.md) |

Thay đổi chạm nhiều nơi:

| Thay đổi code | Sửa thêm |
|---|---|
| Thêm module nghiệp vụ | Bảng module, luật lint ở ARCHITECTURE; khối ở PROJECT_OVERVIEW; tài liệu module mới và [mục lục](update_docs/README.md); biến môi trường ở 11 |
| Thêm màn hình | Tài liệu module (màn); menu ở PROJECT_OVERVIEW; ma trận mẫu ở 12 |
| Thêm migration | Bảng migration ở ARCHITECTURE mục 6.2; tài liệu module nếu đổi bảng, cột |
| Thêm khóa ngầm | `softkeys.json`; tài liệu module; ARCHITECTURE mục 6.3 khi là loại quan hệ mới |
| Thêm mã lỗi | `backend/src/common/app.exception.ts`; danh sách ở 04 |

## 7. Skill và agent

Danh sách skill bắt buộc và cách dùng agent: `CLAUDE.md` (mục "Riêng cho Claude Code"). Quy trình review: mục 3 ở trên.
