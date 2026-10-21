# AGENTS.md – MES Vietsun

Quy tắc bắt buộc cho người và AI coding agent (Claude Code, Codex…) khi làm việc trong repo. File này là **nguồn duy nhất** của các quy tắc dưới đây; tài liệu khác chỉ dẫn link. `CLAUDE.md` import file này.

Số mục 3–6 và số luật trong mục 4 được comment trong code trích dạng "CLAUDE.md mục 4.5": đó là số mục của file này. Không đổi số các mục đó.

## 1. Mục đích và phạm vi repository

- MES cho Vietsun (may mặc, nhiều nhà máy): Đơn hàng, Phân bổ PO, Kế hoạch xuất hàng, Tỷ lệ cắt, Xếp chuyền, Phân bổ màu cỡ, Chuẩn bị SX, Cắt (tiến độ cắt, cấp BTP), May (Kế hoạch may), Nhân sự, Quản trị, Đồng bộ BRAVO/OSM. QMS, Hoàn thiện, Báo cáo mới có menu, trang giữ chỗ.
- Repo gồm `backend/` (NestJS), `frontend/` (React), `deploy/` (triển khai máy chủ), `docs/` (tài liệu). Tổng quan: [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md).
- Đơn vị cơ sở (ĐVCS) theo danh mục chi nhánh BRAVO, lưu ở `SysBranch`, cột `BranchCode`. `A00` là đơn vị tổng hợp.

## 2. Đọc gì, khi nào

| Khi | Đọc |
|---|---|
| Đầu mỗi phiên, trước khi nhận task | [docs/current/STATUS.md](docs/current/STATUS.md): trạng thái, việc đang làm dở, việc chờ, câu hỏi mở. Tránh làm lại việc đã làm |
| Mới vào dự án | [PROJECT_OVERVIEW](docs/PROJECT_OVERVIEW.md) → [ARCHITECTURE](docs/ARCHITECTURE.md) → [DATA_FLOWS](docs/DATA_FLOWS.md) |
| Viết, sửa code | [CODE_CONVENTIONS](docs/CODE_CONVENTIONS.md), tài liệu module của khối sẽ sửa ([mục lục](docs/update_docs/README.md)) |
| Thêm module, bảng, API; đổi cấu trúc | [ARCHITECTURE](docs/ARCHITECTURE.md), [13 Quyết định](docs/update_docs/13-quyet-dinh.md) |
| Chạm đăng nhập, quyền, `BaseRepository` | Mục 4 dưới đây, [04 Phân quyền](docs/update_docs/04-phan-quyen.md) |
| Test, migration, bảo mật, Definition of Done | [ENGINEERING_STANDARDS](docs/ENGINEERING_STANDARDS.md) |
| Nhận task, review, nhánh, cập nhật tài liệu | [DEVELOPMENT_WORKFLOW](docs/DEVELOPMENT_WORKFLOW.md) |
| Cài đặt, biến môi trường, script, máy chủ | [11 Vận hành](docs/update_docs/11-van-hanh.md) |

## 3. Kiến trúc cần bảo vệ

1. Modular Monolith: `backend/src/platform` (nền tảng) và `backend/src/modules/<module>` (`order`, `sewing`, `cutting`, `hr`), mỗi module `controller → service → repository`. Mỗi module nghiệp vụ một database: `MES_Core` (bảng `Sys*`), `MES_Order`, `MES_Sewing`, `MES_Cutting`, `MES_Hr`, `MES_Sync`.
2. Module chỉ dùng API công khai của module khác, không import phần bên trong. Nền tảng không import module: module cấp dữ liệu cho nền tảng bằng cách đăng ký vào service của nền tảng (như `LineSource`). Luật lint ở `backend/eslint.config.mjs`; thêm module thì thêm khối luật.
3. Hệ thống ngoài chỉ chạm ở lớp đồng bộ, chỉ đọc, chép vào `MES_Sync` khi quản trị bấm Đồng bộ. BRAVO: chỉ đọc view của database trung gian (`DB_TRUNGGIAN_NAME`), không đọc thẳng database BRAVO. Module nghiệp vụ đọc dữ liệu đã chép qua `SourceFeedService`, `CatalogLookupService`, không đọc `MES_Sync`.
4. Khóa phiên bản: NestJS 11, Kysely 0.28 (CommonJS). Không nâng NestJS 12, Kysely 0.29 khi chưa chuyển cả dự án sang ESM. TypeScript: đã duyệt chuẩn hóa sang 6.0.3, làm ở task riêng ([STATUS](docs/current/STATUS.md)).
5. Thay thư viện truy cập dữ liệu, thêm thư viện lớn, đổi một quyết định ở [13 Quyết định](docs/update_docs/13-quyet-dinh.md): phải có quyết định mới được duyệt trước khi viết code.

Mô tả chi tiết và mức cưỡng chế: [ARCHITECTURE](docs/ARCHITECTURE.md) mục 4, 7.

## 4. Luật phân quyền (không được vi phạm)

1. Backend cưỡng chế, frontend chỉ phản chiếu. Ẩn nút ở giao diện không thay cho kiểm quyền ở API.
2. **Deny by default:** endpoint phải khai báo `@Public`, `@Authenticated` hoặc `@RequirePermission('module.resource:action')`; không khai báo thì bị từ chối.
3. Mọi truy vấn dữ liệu nghiệp vụ đi qua repository kế thừa `BaseRepository`/`ChildRepository` (tự lọc `BranchCode`, phạm vi; chặn ghi ở `A00`). Cấm SQL thô trong controller, service; cấm module tự viết điều kiện phân quyền. Mảnh biểu thức `` sql`…` `` (cột tính, điều kiện, sắp xếp) dựng trong service rồi truyền cho repository không tính là SQL thô; service không tự chạy câu truy vấn. Các chỗ lệch hiện có là nợ kỹ thuật, không lấy làm mẫu ([ARCHITECTURE](docs/ARCHITECTURE.md) mục 10).
4. `BranchCode` của phiên lấy từ token do server cấp, không bao giờ nhận từ body, query, header. `branchCode` trong body của `POST /auth/select-branch` là yêu cầu chọn, server kiểm `SysUserBranch` rồi mới cấp token. Mã ĐVCS gửi lên như một giá trị dữ liệu (ĐVCS của phòng ban, của Nhà máy SX, lịch làm việc của ĐVCS nào ở API quản trị, danh mục) không bao giờ được dùng làm phạm vi của phiên.
5. Bảng theo ĐVCS bắt buộc có cột `BranchCode` (có index). Mỗi tài nguyên phải có dòng `SysResource` đúng bảng nguồn và đúng `ScopeType` (`BRANCH` hoặc `SHARED` cho bảng dùng chung toàn công ty; seed mặc định `BRANCH`): thiếu hoặc sai bảng nguồn thì repository từ chối chạy (500 `RESOURCE_NOT_REGISTERED`).
6. Lấy một dòng, sửa, xóa, xuất file, giá trị popup lọc cũng áp điều kiện ĐVCS và phạm vi, không chỉ danh sách.
7. Quyền, vai trò, phạm vi, chính sách cột, ngoại lệ là dữ liệu trong `MES_Core` (seed tạo, quản trị chỉnh ở màn Quản trị); menu chỉ do seed quản lý. Không hardcode.
8. Thay đổi phân quyền và đăng nhập ghi `SysAuditLog`. Không ai tự đổi quyền của mình; chỉ cấp được quyền `admin.*` mà mình đang có.
9. Đủ 5 lớp: vai trò × tài nguyên × hành động; lọc ĐVCS; phạm vi theo phép gán (chuyền, người tạo…); chính sách cột Ẩn/Che/Chỉ đọc/Sửa được (áp cả khi xuất file); ngoại lệ theo người có hạn dùng.
10. `A00` (`SysBranch.IsAggregate`, server tra từ DB) đọc dữ liệu theo ĐVCS theo phạm vi của phép gán, không ghi được dữ liệu theo ĐVCS kể cả với vai trò Toàn quyền, và không gắn dữ liệu.

Chi tiết từng lớp: [04 Phân quyền](docs/update_docs/04-phan-quyen.md). Luồng kiểm trong một request: [DATA_FLOWS](docs/DATA_FLOWS.md) mục 2.

## 5. Quy ước database (bắt buộc)

- Tên bảng, cột theo [CODE_CONVENTIONS](docs/CODE_CONVENTIONS.md) mục 1.1; bảng danh mục, bảng giao dịch có đủ cột chuẩn; `BranchCode VARCHAR(10)` cấm sửa sau khi tạo; dùng `NULL` cho "không có".
- Danh mục không xóa vật lý, mã không sửa.
- Khóa ngoại vật lý chỉ trong cùng database. Quan hệ giữa các database là khóa ngầm: khai ở `backend/migrations/softkeys.json`, có index, kiểm bằng `npm run check:softkeys -w backend`. Không có transaction chung giữa các database.
- Schema chỉ đổi qua migration mới `backend/migrations/<Database>/NNNN_ten.sql`; file đã chạy thì không sửa.

Chi tiết: [CODE_CONVENTIONS](docs/CODE_CONVENTIONS.md) mục 6, [ENGINEERING_STANDARDS](docs/ENGINEERING_STANDARDS.md) mục 6.

## 6. Quy ước code (bắt buộc)

- TypeScript strict. Module không import phần bên trong module khác, giao tiếp qua API công khai (lint ranh giới chỉ có ở backend).
- Lỗi API dùng `AppException`/`Errors` với mã ổn định. Giao diện, thông điệp lỗi bằng tiếng Việt có dấu; định danh tiếng Anh.
- Khác biệt giữa ĐVCS, nhà máy nằm trong bảng cấu hình; không rẽ nhánh theo mã ĐVCS, không gắn cứng mã.
- Comment chỉ giải thích "vì sao".

Chi tiết, ví dụ đúng/sai: [CODE_CONVENTIONS](docs/CODE_CONVENTIONS.md).

## 7. An toàn khi dùng AI

- Không đưa mật khẩu, chuỗi kết nối, khóa bí mật, dữ liệu thật (tên khách, số PO, thông tin nhân viên) vào prompt, code, tài liệu, commit, test. Bí mật chỉ ở `backend/.env` (đã ignore); người dùng tự điền, không nhận mật khẩu qua chat, không in nội dung `.env`.
- AI chỉ tạo file migration; chỉ chạy lên database dùng chung khi được cho phép hoặc thuộc ngoại lệ dưới đây. Thao tác thử trên database thật: chạy trong transaction rồi hủy trước, xem kết quả, rồi mới chạy thật khi được đồng ý.
- Cờ trong `.env` làm đổi hành vi máy chủ (`BRAVO_ORDER_IMPORT`, `OSM_FACTORY_UPDATE`…) chỉ bật, tắt khi Tech Lead bảo.
- Hỏi trước hành động khó đảo ngược: xóa dữ liệu, drop, xóa database, `reset:demo`, `load:bravo`, `sim:board --all` trên database có dữ liệu người dùng, push, deploy, đổi cấu hình máy chủ. Chỉ commit khi người dùng yêu cầu.
- Không `git checkout`, `git reset`, `git stash` hay ghi đè file có thay đổi chưa commit mà mình không tạo.
- Hệ thống ngoài chỉ đọc: không truy vấn database BRAVO thật dù tài khoản có quyền; không xóa, không sửa view ở database trung gian.
- Test backend ghi dữ liệu vào database trong `.env`: chạy trên bộ database test riêng ([ENGINEERING_STANDARDS](docs/ENGINEERING_STANDARDS.md) mục 1.3), xong xóa đúng bộ đó.
- Công cụ chặn một lệnh: dừng, đưa nguyên lệnh cho người dùng, không đổi cách gọi để vượt qua, không tự sửa cấu hình quyền của công cụ hay file quy tắc này.

Ngoại lệ đang hiệu lực (Tech Lead xác nhận 19/10/2026 vẫn còn hiệu lực):

| Ngoại lệ | Giới hạn |
|---|---|
| AI được chạy migration, seed, thao tác trực tiếp trên database của máy chủ | Chỉ khi database máy chủ còn là dữ liệu demo; dùng tài khoản do người dùng điền ở `backend/.env`; hành động khó đảo ngược vẫn phải hỏi; công cụ chặn thì dừng |
| AI được chạy migration, seed, `load:bravo` trên SQL Server của máy người dùng | Chỉ các database MES trên máy đó; cấm xóa bất cứ gì trên database BRAVO thật và view ở database trung gian |

Ngoại lệ không tự mở rộng sang database khác. Tech Lead rút lại thì quay về quy tắc chung.

## 8. Lệnh đã xác minh

Có trong `package.json` (gốc, `backend`, `frontend`) ngày 19/10/2026 (`typecheck` thêm 21/10/2026). Chạy ở thư mục gốc; cần Node.js 22, SQL Server 2019/2022.

```
npm install                          # cài backend + frontend
npm run migrate                      # tạo database (nếu có quyền), chạy migration, nạp dữ liệu hệ thống + tài khoản admin
npm run migrate -- MES_Order         # chỉ một database, không nạp dữ liệu
npm run migrate -- --check           # chỉ kiểm quyền, database; không tạo, không chạy migration
npm run seed                         # máy demo: dữ liệu mẫu (-- --sync-matrix: nạp lại ma trận quyền mẫu)
npm run dev:backend                  # http://localhost:3000/api/v1
npm run dev:frontend                 # http://localhost:5173 (proxy /api sang backend)
npm run lint                         # backend, frontend, deploy; --max-warnings 0
npm run typecheck                    # kiểm kiểu backend src, scripts, test (tsc --noEmit)
npm test                             # backend (Jest, ghi database trong .env), frontend (Vitest), deploy
npm run build                        # backend rồi frontend (frontend gồm tsc --noEmit)
npm run check:softkeys -w backend    # kiểm bản ghi mồ côi giữa các database (chỉ đọc)
npm run reset:demo -- --yes          # dữ liệu demo về ban đầu
npm run load:bravo -- --yes          # thay đơn hàng bằng dữ liệu BRAVO đã chép
npm run sim:board -- --yes           # xếp lại dàn chuyền mô phỏng
```

- PowerShell 5.1 không có `&&`: chạy từng lệnh, hoặc nối bằng `;`.
- Lệnh có `--yes` chỉ chạy với SQL Server trên chính máy này (máy khác cần thêm `--allow-remote-db`); thiếu `--yes` thì chỉ in việc sẽ làm; máy `SEED_SAMPLE_DATA=false` hoặc `NODE_ENV=production` từ chối `reset:demo`, `load:bravo`, `sim:board`.
- Tài khoản demo và mật khẩu `DEMO_PASSWORD`: [PROJECT_OVERVIEW](docs/PROJECT_OVERVIEW.md) mục 7. Lệnh khác (`perf`, `test:deploy`, `deploy.cjs`): [11 Vận hành](docs/update_docs/11-van-hanh.md).

## 9. Kiểm thử và báo cáo kết quả

- Một việc chỉ xong khi đạt Definition of Done ở [ENGINEERING_STANDARDS](docs/ENGINEERING_STANDARDS.md) mục 10. Luật phân quyền, lọc `BranchCode` mới luôn có test.
- Khi báo cáo: liệt kê đúng file đã đổi; lệnh đã chạy và kết quả thật (số bài qua, hỏng, kèm output khi hỏng); bước nào bỏ qua và vì sao; bộ database test đã dùng và đã xóa chưa; việc còn chờ đã ghi vào [STATUS](docs/current/STATUS.md).
- Không nói "đã kiểm" khi chưa chạy. Kết luận chưa đủ bằng chứng ghi **NEEDS VERIFICATION**.

## 10. Khi thiếu thông tin hoặc tài liệu mâu thuẫn

- Không suy đoán về công nghệ, module, API, luồng nghiệp vụ, lệnh chạy. Đọc code trước; vẫn không rõ thì hỏi, kèm phương án và đề xuất.
- Code là căn cứ cho hiện trạng; [13 Quyết định](docs/update_docs/13-quyet-dinh.md) là căn cứ cho quy tắc và ý định. Tài liệu nói khác code, hoặc hai tài liệu nói khác nhau: báo lại, không tự chọn bên nào.
- Chỉ làm việc được giao. Việc ngoài phạm vi, câu hỏi nảy ra: ghi vào [STATUS](docs/current/STATUS.md) và hỏi.
- Đề xuất mới chưa duyệt ghi **PROPOSED**, không biến thành quy tắc.

## 11. Ngôn ngữ

Trao đổi và tài liệu bằng tiếng Việt có đầy đủ dấu. Thuật ngữ kỹ thuật và định danh giữ nguyên tiếng Anh, đặt trong backtick.
