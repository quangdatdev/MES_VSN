# CLAUDE.md – MES Vietsun

Hệ thống MES (Manufacturing Execution System) cho Vietsun. File này là quy ước bắt buộc cho mọi người và AI làm việc trong repo. Đọc hết trước khi sửa code.

## 1. Tài liệu gốc (đọc trước)

| File | Nội dung |
|---|---|
| `docs/nguon/tong-quan-du-an.md` | Tổng quan dự án, phạm vi, luồng nghiệp vụ, kiến trúc, lộ trình 8 tuần |
| `docs/thiet-ke/de-xuat-phuong-an-nen-tang.html` | Phương án nền tảng: phân quyền 5 lớp, khung module, phạm vi Demo 2 ngày |
| `docs/thiet-ke/seed-demo.md` | Menu, Role, ma trận quyền, nhà máy, tài khoản mẫu, kịch bản kiểm thử (Demo) |
| `docs/thiet-ke/db-core.md` | Thiết kế bảng `MES_Core` |
| `docs/thiet-ke/db-order.md` | Thiết kế bảng `MES_Order` (module Đơn hàng) |
| `docs/thiet-ke/db-sewing.md` | Thiết kế `MES_Sewing` (module May): danh mục bước chuẩn bị, Kế hoạch chuẩn bị SX chép từ dàn chuyền (ADR 0009) |
| `docs/thiet-ke/db-hr.md` | Thiết kế `MES_Hr` (module Nhân sự): cây phòng ban, chức danh, hồ sơ nhân viên (ADR 0012) |
| `docs/thiet-ke/db-sync.md` | Thiết kế `MES_Sync`: bảng chép từ BRAVO, nhật ký đồng bộ, thủ tục chép tăng dần (ADR 0007) |
| `docs/thiet-ke/api-contract.md` | Hợp đồng API Demo (BE và FE làm theo) |
| `docs/phases/README.md` | **Kế hoạch chia phase và trạng thái hiện tại** – xem đầu tiên mỗi phiên làm việc |
| `docs/adr/` | Các quyết định kiến trúc đã chốt (ADR). Muốn đổi phải viết ADR mới, không sửa ngầm |
| `docs/review/README.md` | Quy trình review code bằng agent `code-reviewer`, checklist riêng của MES, mẫu báo cáo |
| `docs/thiet-ke/quy-tac-ui-ux.md` | Quy tắc UI/UX khi dựng hoặc sửa màn hình: thành phần dùng chung, không mất dữ liệu đang nhập, trạng thái, chữ, màu, điện thoại |
| `docs/nguon/BẢNG MÔ TẢ GIAO DIỆN MES - ĐƠN HÀNG.docx` | Mô tả giao diện module Đơn hàng (đầu vào cho thiết kế menu/màn hình) |

Khi tài liệu mâu thuẫn nhau: ADR > phương án nền tảng > tổng quan. Mâu thuẫn phải báo lại cho người dùng, không tự chọn.

## 1b. Hướng đi chính (tóm tắt)

- **Mục tiêu trước mắt:** Demo giao diện + phân quyền (2 ngày) để trình lãnh đạo và xin tài khoản AI nâng cấp. Có đăng nhập, chọn nhà máy, menu động, màn Admin phân quyền, và một màn dữ liệu giả (PO) cho phép nhập liệu để thấy dữ liệu tách theo nhà máy. Chưa có dữ liệu thật, chưa code nghiệp vụ module; tài liệu BA gửi sau.
- **Nhà máy:** mã ngắn `A01`, `A02`…; `A00` là đơn vị tổng hợp (xem tất cả, chỉ đọc). Mã cấm sửa, tên sửa được.
- **Giao diện:** Mantine, ưu tiên thân thiện, không cứng nhắc (ADR 0003).
- **Sau Demo:** nâng phân quyền (ẩn/che cột, ngoại lệ user), đồng bộ BRAVO/OSM/GSD, rồi các module Đơn hàng → Cắt → May → QMS → Hoàn thiện → Báo cáo (lộ trình 8 tuần trong `docs/nguon/tong-quan-du-an.md`).
- **Sơ đồ:** `docs/thiet-ke/so-do-kien-truc.html`.
- **Skill của dự án** (`.claude/skills/`): `frontend-design` – **bắt buộc dùng** khi dựng hoặc sửa giao diện để web đúng chuẩn thiết kế; `senior-architect` – dùng khi cần kiến trúc tổng quan, quyết định kỹ thuật, ADR, sơ đồ.
- **Agent của dự án** (`.claude/agents/`): `code-reviewer` – review code cuối mỗi phase và ngay khi sửa phần rủi ro cao (auth, phân quyền, `BaseRepository`, migration). Quy trình: `docs/review/README.md`.

| Phase | Nội dung | Trạng thái |
|---|---|---|
| 0 | Chốt nền móng: menu, Role mẫu, bảng `MES_Core`, hợp đồng API, công nghệ | Đã duyệt |
| 1 | Backend NestJS, đăng nhập, chọn nhà máy (kể cả `A00`), token mang `BranchCode`, API menu | Đã duyệt |
| 2 | Frontend Mantine: đăng nhập, chọn nhà máy, layout, menu động, responsive | Đã duyệt |
| 3 | Phân quyền động: `BaseRepository`, màn Admin, màn PO demo có nhập liệu, test ma trận | Đã duyệt |
| 4 | Hoàn thiện demo: kịch bản, chạy trên điện thoại, review code Phase 1–4 | Đã duyệt |
| 5 | Sau demo: nâng phân quyền, đồng bộ, các module nghiệp vụ. 5.1 Nâng phân quyền và 5.3 Module Đơn hàng xong, chờ duyệt; 5.2 Đồng bộ (chép + màn kiểm soát) xong, chờ duyệt; ánh xạ chờ BA; 5.4 Danh mục hệ thống xong, chờ duyệt; 5.5 Module May: Kế hoạch chuẩn bị SX xong, chờ duyệt; 5.6 Lưới xem dữ liệu (kéo cột, 100 dòng theo ngày tạo, lọc theo cột trong DB, ADR 0011) xong, chờ duyệt; 5.7 Tối ưu hiệu năng frontend xong, chờ duyệt; 5.8 Quản trị nhân sự (Sơ đồ tổ chức, Thông tin nhân sự) đang làm: đã migrate, seed, review 2 lượt, test qua; còn người dùng kiểm trên app thật, chốt M4 (`docs/phases/README.md`) | Chờ duyệt 5.1, 5.3, 5.2 (trừ 5.2.8), 5.4, 5.5, 5.6, 5.7 |

Chi tiết task và checklist review từng phase: `docs/phases/`. Trạng thái hiện tại: `docs/phases/README.md`.

## 2. Quy trình làm việc theo phase (QUAN TRỌNG)

- Dự án chia thành các phase trong `docs/phases/`. **Chỉ làm đúng phase đang `In progress`.**
- Hết phase thì **dừng lại**, cập nhật trạng thái trong `docs/phases/README.md`, tóm tắt kết quả theo checklist review của phase đó, và **chờ người dùng duyệt**. Không tự bắt đầu phase kế tiếp.
- Không làm thêm việc ngoài phạm vi phase (mục "Không làm" trong file phase). Thấy cần thì ghi vào mục "Phát sinh" của phase và hỏi.
- Mỗi phase kết thúc ở trạng thái chạy được (build qua, chạy được), không để dở dang.
- Việc lớn trong phase chia task nhỏ (0,5–2 ngày), mỗi task có tiêu chí hoàn thành.
- **Trước khi chuyển `Ready for review`, chạy agent `code-reviewer`** trên mọi file của phase (theo `docs/review/README.md`). Agent chỉ đọc và báo cáo; phiên chính kiểm chứng rồi sửa. Còn phát hiện `CRITICAL`/`HIGH` thì chưa được chuyển trạng thái. Kết quả ghi vào `docs/review/phase-<N>.md` và tóm tắt khi báo cáo cho người dùng.
- Sửa phần rủi ro cao (`platform/auth`, `platform/data`, guard, API `/admin/*`, migration, script reset/seed) thì review ngay, không đợi cuối phase.

## 3. Kiến trúc đã chốt

- **Frontend:** React + TypeScript + Vite, PWA. Giao diện chỉ **ẩn/hiện**, không phải nơi cưỡng chế quyền. UI dùng Mantine, thân thiện, không cứng nhắc (ADR 0003).
- **Backend:** Node.js + NestJS, Modular Monolith. Mỗi module: `controller → service → repository`.
- **Database:** SQL Server 2019/2022. **Mỗi module một database** (`MES_Core`, `MES_Order`, `MES_Cutting`, …). Nhóm `Sys*` ở `MES_Core`.
- **Hệ thống ngoài** (BRAVO, OSM, GSD): chỉ chạm ở lớp đồng bộ, chỉ đọc. BRAVO: **chỉ đọc view của database trung gian** (`DB_TRUNGGIAN_NAME`), không đọc thẳng database BRAVO; stored procedure trong `MES_Sync` chép tăng dần theo `ModifiedAt`/`CreatedAt` (ADR 0007).
- **Realtime:** WebSocket cho dữ liệu phát sinh trong MES (chưa làm trong giai đoạn Demo).

### Cấu trúc thư mục

```
/backend/src/platform     Platform Core: auth, authz, branch scope, org, audit, config
/backend/src/modules/*    Module nghiệp vụ (order, cutting, sewing, qms, finishing, report)
/backend/migrations/*     Migration theo từng database/module
/frontend/src/shell       App shell: login, chọn nhà máy, layout, menu động, Can, DataGrid
/frontend/src/modules/*   Màn hình từng module (lazy-load theo route)
/docs/nguon               Tài liệu đầu vào (tổng quan dự án, mô tả giao diện của BA)
/docs/thiet-ke            Thiết kế: seed, bảng MES_Core, hợp đồng API, sơ đồ, phương án nền tảng
/docs/adr                 Quyết định kiến trúc
/docs/phases              Kế hoạch và checklist review từng phase
/.claude/skills           Skill dùng cho dự án (frontend-design, senior-architect)
/.claude/agents           Agent dùng cho dự án (code-reviewer)
/docs/review              Quy trình và báo cáo review code từng phase
```

## 4. Quy tắc phân quyền (không được vi phạm)

1. **Backend cưỡng chế, frontend chỉ phản chiếu.** Ẩn nút ở UI không thay cho kiểm quyền ở API.
2. **Deny by default:** không có quyền được cấp rõ ràng thì từ chối.
3. **Mọi truy vấn dữ liệu nghiệp vụ đi qua repository nền tảng** (`BaseRepository`), nơi tự gắn điều kiện `BranchCode = <nhà máy của phiên>` (đơn vị tổng hợp `A00`: bỏ điều kiện khi đọc, từ chối khi ghi). Cấm SQL thô trong controller/service. Cấm module tự viết điều kiện phân quyền.
4. **`BranchCode` lấy từ token do server cấp**, không bao giờ nhận từ body/query/header của client.
5. Bảng nghiệp vụ theo nhà máy **bắt buộc** có cột `BranchCode` (có index). Bảng dùng chung toàn công ty phải đánh dấu rõ là "shared" trong Resource Registry; không đánh dấu thì repository từ chối chạy.
6. `getById`/update/delete cũng áp điều kiện nhà máy, không chỉ `list`.
7. Quyền đặt theo dạng `module.resource:action` (ví dụ `order.po:view`). Quyền, Role, Menu là **dữ liệu trong DB**, đổi qua màn Admin, không hardcode.
8. Thay đổi phân quyền và đăng nhập phải ghi `SysAuditLog`.
9. Mô hình đích đầy đủ 5 lớp (xem tài liệu nền tảng). Demo chỉ làm Role + Menu/hành động + nhà máy; các bảng cho phần còn lại tạo sẵn nhưng chưa có UI.
10. `A00` (`SysBranch.IsAggregate`) là đơn vị tổng hợp: xem tất cả nhà máy, **chỉ đọc**, không gắn dữ liệu. Cờ này do server tra từ DB, không tin client.

## 5. Quy ước database

- Tên bảng/cột: **PascalCase, không dấu, tiếng Anh, số ít** (`Ticket` không phải `Tickets`). Bảng con mang tiền tố bảng cha. Không lặp tên bảng vào tên cột (`Branch.Name`, không `Branch.BranchName`; riêng `BranchCode` là tên cột chuẩn đã chốt).
- Tiền tố `Sys` cho bảng lõi (tránh từ khóa `User`): `SysUser`, `SysRole`, `SysBranch`…
- Khóa chính `Id`. Khóa ngầm/ngoại `<TênBảngĐích>Id`. Ngày `…Date`, thời điểm `…At` (`DATETIME2`), cờ `Is…`, khoảng phút `…Minutes`.
- **Bảng danh mục:** `Id, Code, Name, Description, SortOrder, IsActive, IsSystem, CreatedAt, CreatedBy, ModifiedAt, ModifiedBy`.
- **Bảng giao dịch:** `Id`, cột nghiệp vụ, `BranchCode`, `CreatedAt, CreatedBy, ModifiedAt, ModifiedBy`.
- **`BranchCode`:** `VARCHAR(10)`, mã ngắn `A01`, `A02`…; **cấm sửa** sau khi tạo (chỉ sửa `Name`). `A00` là đơn vị tổng hợp, không gắn dữ liệu.
- **Không xóa vật lý** bảng danh mục, dùng `IsActive`. Không chèn dữ liệu đại diện cho "không có" (dùng `NULL`).
- **FK vật lý chỉ trong cùng một database.** Quan hệ giữa các database là **khóa ngầm**, phải khai báo trong file khóa ngầm, có index, và có script kiểm bản ghi mồ côi. Không giả định transaction chung giữa các database.
- Schema đổi **chỉ qua migration có version**, mỗi database một thư mục. Trước khi thêm tên bảng/cột, đối chiếu từ khóa dành riêng của SQL Server.

## 6. Quy ước code

- TypeScript strict. Backend và frontend dùng chung kiểu dữ liệu qua gói/thư mục `shared` khi cần, không copy tay.
- Module không import bên trong module khác. Giao tiếp qua service công khai hoặc sự kiện. Có lint ranh giới import.
- Mã lỗi và thông điệp API nhất quán; giao diện hiển thị tiếng Việt, mã định danh/tên biến dùng tiếng Anh.
- Comment chỉ khi giải thích "vì sao", không mô tả lại code.
- Khác biệt giữa nhà máy nằm trong bảng cấu hình, không rẽ nhánh `if (nhà máy)` trong code.

## 7. Quy tắc an toàn khi dùng AI

- AI **chỉ tạo file migration**, người duyệt và chạy. Không tự chạy migration lên DB dùng chung.
- Không đưa mật khẩu, chuỗi kết nối, dữ liệu thật của nhà máy vào prompt, code, hay file commit. Dùng `.env` (đã nằm trong `.gitignore`) và `.env.example`.
- Giai đoạn Demo chỉ dùng **dữ liệu giả**. Không kết nối BRAVO/OSM/GSD.
- Code do AI sinh ra phải qua lint + test trước khi coi là xong. Việc phân quyền và lọc `BranchCode` luôn có test.
- Hành động khó đảo ngược (xóa dữ liệu, drop bảng, push, deploy) phải hỏi người dùng trước.

## 8. Lệnh chạy dự án

Chạy từ thư mục gốc, trừ dòng ghi "(trong `backend`)". Cần Node.js 22 và SQL Server 2019/2022 (Express cũng được) đăng nhập bằng tài khoản SQL.

### 8.1 Cài đặt lần đầu

1. Tạo `backend/.env` từ `backend/.env.example`. Tối thiểu điền `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET` (chuỗi ngẫu nhiên dài), `DEMO_PASSWORD` (mật khẩu chung của tài khoản demo). Tên database mặc định `MES_Core`, `MES_Order`, `MES_Sewing`, `MES_Sync`. `DB_TRUNGGIAN_NAME` chỉ cần khi đồng bộ BRAVO; để trống thì migrate bỏ qua tạo synonym.
2. Chạy:

```
npm install                          # cài toàn bộ workspace (backend + frontend)
npx tsx scripts/probe-db.ts          # (trong backend, tùy chọn) kiểm kết nối SQL Server, liệt kê database; chỉ đọc
npm run migrate                      # tạo database nếu tài khoản có quyền rồi chạy migration mọi database (người chạy, không tự chạy khi khởi động)
npm run migrate -- MES_Core          # chỉ migrate một database
npm run seed                         # dữ liệu giả MES_Core + MES_Order; chạy lại chỉ thêm phần thiếu, không cấp lại quyền đã thu hồi
```

Tài khoản trong `.env` không tạo được database thì nhờ quản trị CSDL tạo trước và cấp `db_owner`, rồi chạy lại `npm run migrate`.

### 8.2 Chạy khi phát triển (hai cửa sổ terminal)

```
npm run dev:backend                  # NestJS watch, http://localhost:3000/api/v1
npm run dev:frontend                 # Vite, http://localhost:5173 (proxy /api sang backend)
```

Mở http://localhost:5173. Tài khoản demo: `admin`, `giamdoc`, `kehoach.a`, `truongchuyen.a`, `truongchuyen.b`, `ketoan`; mật khẩu là `DEMO_PASSWORD` (chi tiết: `docs/thiet-ke/seed-demo.md`).

### 8.3 Chạy bản demo (một cổng, mở được từ điện thoại trong LAN)

```
npm run reset:demo -- --yes          # đưa dữ liệu demo về ban đầu (thêm --bravo: đơn hàng thật từ MES_Sync)
npm run demo                         # build backend + frontend rồi chạy ở cổng PORT (mặc định 3000), in địa chỉ http://<IP máy>:3000
```

- Điện thoại và máy demo cùng Wi-Fi/LAN. Không vào được thì mở cổng tường lửa (PowerShell quyền Administrator): `New-NetFirewallRule -DisplayName "MES demo" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow`.
- Demo chạy HTTP nên để `COOKIE_SECURE=false`. Đã build sẵn thì chạy lại nhanh bằng `npm run start:demo -w backend`.

### 8.4 Dữ liệu

Các lệnh có `--yes` xóa/ghi đè dữ liệu và chỉ chạy với SQL Server trên chính máy này (database máy khác bị từ chối trừ khi thêm `--allow-remote-db`). Chạy thiếu `--yes` chỉ in mô tả việc sẽ làm.

```
npm run seed -- --reset-passwords    # đặt lại mật khẩu tài khoản demo, thu hồi phiên của họ
npm run seed -- --sync-matrix        # nạp lại đủ ma trận quyền, chính sách cột, phạm vi, ngoại lệ mẫu
npm run load:bravo -- --yes          # thay đơn hàng bằng dữ liệu BRAVO đã chép trong MES_Sync (--no-plans: không sinh dàn chuyền mô phỏng; xem db-order.md)
npm run sim:board -- --yes           # xếp lại dàn chuyền mô phỏng kín các chuyền quanh hôm nay, giữ kế hoạch người dùng lập/sửa (--all: xóa cả các kế hoạch đó)
npm run check:softkeys -w backend    # kiểm bản ghi mồ côi theo khóa ngầm giữa các database (chỉ đọc)
npx tsx scripts/sync-gen.ts <Bảng> --out migrations/MES_Sync/NNNN_x.sql  # (trong backend) sinh migration cho nguồn đồng bộ mới, xem docs/thiet-ke/db-sync.md
```

### 8.5 Kiểm tra

```
npm run lint
npm test                             # test backend (chạy trên DB thật, cần migrate + seed trước; xong nên reset:demo) và frontend
npm run build
npm run perf -w frontend             # đo hiệu năng vẽ bằng dữ liệu giả (phase 5.7), không nằm trong npm test
```

Phiên bản đã khóa: NestJS 11 và Kysely 0.28 (CommonJS), TypeScript 5.9. Không nâng NestJS 12/Kysely 0.29 khi chưa chuyển cả dự án sang ESM.

## 9. Định nghĩa "xong" cho một task

- Build và lint qua; test liên quan qua (đặc biệt test phân quyền/`BranchCode`).
- Đúng quy ước mục 4–6; không có SQL thô, không có BranchCode nhận từ client.
- Cập nhật tài liệu/ADR nếu thay đổi quyết định.
- Cập nhật trạng thái task trong file phase tương ứng.
- Code thuộc phase đã qua `code-reviewer`, không còn phát hiện `CRITICAL`/`HIGH` mở.

## 10. Ngôn ngữ

Trao đổi và tài liệu bằng tiếng Việt có đầy đủ dấu. Thuật ngữ kỹ thuật và định danh giữ nguyên tiếng Anh.
