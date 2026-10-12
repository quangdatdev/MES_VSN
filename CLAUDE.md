# CLAUDE.md – MES Vietsun

Kế hoạch tổng quan và quy ước bắt buộc cho người và AI làm việc trong repo. Đây là bản tóm tắt; chi tiết viết theo code ở `docs/update_docs/`.

## 1. Dự án và tài liệu

- MES cho Vietsun (may mặc, nhiều nhà máy). Trục nghiệp vụ: Đơn hàng, PO (BRAVO) → Phân bổ PO (OSM) → Kế hoạch xuất hàng → Tỷ lệ cắt → Xếp chuyền → Chuẩn bị SX → Cắt → May → QMS → Hoàn thiện → Báo cáo.
- Lộ trình: Phase 0–4 Demo giao diện và phân quyền (đã duyệt). Phase 5: nâng phân quyền (5.1), đồng bộ BRAVO (5.2), Đơn hàng (5.3), Danh mục hệ thống (5.4), Kế hoạch chuẩn bị SX (5.5), lưới xem dữ liệu (5.6), hiệu năng frontend (5.7), Nhân sự (5.8), Đơn vị cơ sở và Nhà máy SX (5.9). Tiếp theo: Cắt, May, QMS, Hoàn thiện, Báo cáo (mới có menu, trang giữ chỗ).
- **Đơn vị cơ sở (ĐVCS)** theo danh mục chi nhánh BRAVO, lưu ở `SysBranch`, cột `BranchCode` (mã `A01`, `A02`…). `A00` là đơn vị tổng hợp: xem tất cả, chỉ đọc. Nhà máy SX là danh mục riêng, mỗi nhà máy thuộc một ĐVCS.
- **Đầu mỗi phiên đọc `docs/update_docs/02-trang-thai.md`**: trạng thái, việc chờ trên máy chủ, câu hỏi mở.

| Tài liệu trong `docs/update_docs/` | Đọc khi |
|---|---|
| `README.md`, `01-tong-quan.md` | Mới vào dự án: mục lục, thuật ngữ |
| `03-kien-truc.md`, `13-quyet-dinh.md` | Thêm module, bảng, API; trước khi đổi một quyết định |
| `04-phan-quyen.md` | Mọi việc chạm đăng nhập, quyền, `BaseRepository` |
| `05`–`09` | Quản trị, Đơn hàng, May, Nhân sự, Đồng bộ |
| `10-giao-dien.md` | Dựng, sửa màn hình |
| `11-van-hanh.md`, `12-du-lieu-mau-va-kiem-thu.md` | Cài đặt, biến môi trường, script, dữ liệu mẫu, test |
| `14-quy-trinh-lam-viec.md` | Quy trình phase, review, an toàn AI, đổi gì thì sửa tài liệu nào |

Tài liệu đầu vào (tổng quan dự án, mô tả giao diện của BA) ở `docs/nguon/`. `13-quyet-dinh.md` thắng các tài liệu khác. Tài liệu nói khác code hoặc khác yêu cầu của người dùng: báo lại, không tự chọn.

## 2. Quy trình làm việc theo phase

- Chỉ làm phase, task người dùng giao; việc ngoài phạm vi thì ghi vào `02-trang-thai.md` và hỏi. Hết phase thì dừng, tóm tắt, chờ duyệt.
- Task nhỏ 0,5–2 ngày, có tiêu chí xong, kết thúc ở trạng thái chạy được.
- **Chạy agent `code-reviewer`** trước khi chuyển `Ready for review`, và ngay khi sửa phần rủi ro cao (`platform/auth`, `platform/data`, guard, `/admin/*`, migration, seed, reset). Còn `CRITICAL`/`HIGH` thì chưa xong. Báo cáo ở `docs/review/phase-<N>.md`.
- Đổi code thì sửa đúng file tài liệu sở hữu (bảng ở `14-quy-trinh-lam-viec.md`), không chép sang file khác. Quyết định kiến trúc mới hoặc đổi quyết định: thêm mục vào `13-quyet-dinh.md` (áp dụng, lý do, hệ quả), không sửa ngầm.
- Skill: `frontend-design` **bắt buộc** khi dựng, sửa giao diện; `senior-architect` khi ra quyết định kiến trúc; `react-best-practices` khi tối ưu frontend.

## 3. Kiến trúc đã chốt

- **Backend:** Node.js 22 + NestJS 11, Modular Monolith. `backend/src/platform` (auth, phân quyền, `BaseRepository`, quản trị, danh mục, đồng bộ, nhật ký) và `backend/src/modules/<module>` (`order`, `sewing`, `hr`), mỗi module `controller → service → repository`.
- **Frontend:** React 19 + Vite + Mantine 9, thân thiện, không cứng nhắc. Khung `frontend/src/shell`, màn `frontend/src/features/<khối>`, dùng chung `frontend/src/components`. Giao diện chỉ ẩn/hiện.
- **Database:** SQL Server 2019/2022, mỗi module một database: `MES_Core` (bảng `Sys*`), `MES_Order`, `MES_Sewing`, `MES_Hr`, `MES_Sync` (bảng chép từ hệ thống ngoài).
- **Hệ thống ngoài** chỉ chạm ở lớp đồng bộ, chỉ đọc, chép vào `MES_Sync` khi quản trị bấm Đồng bộ. BRAVO: chỉ đọc view của database trung gian (`DB_TRUNGGIAN_NAME`), không đọc thẳng database BRAVO. OSM: đọc view. Module nghiệp vụ đọc dữ liệu đã chép qua `SourceFeedService`, `CatalogLookupService`, không đọc `MES_Sync`.
- Chưa có: WebSocket realtime, kết nối GSD, SSO.
- **Khóa phiên bản:** NestJS 11, Kysely 0.28 (CommonJS), TypeScript 5.9. Không nâng NestJS 12/Kysely 0.29 khi chưa chuyển cả dự án sang ESM.

## 4. Quy tắc phân quyền (không được vi phạm)

1. Backend cưỡng chế, frontend chỉ phản chiếu. Ẩn nút ở UI không thay cho kiểm quyền ở API.
2. **Deny by default:** endpoint phải khai báo `@Public`, `@Authenticated` hoặc `@RequirePermission('module.resource:action')`; không khai báo thì bị từ chối.
3. Mọi truy vấn dữ liệu nghiệp vụ đi qua repository kế thừa `BaseRepository`/`ChildRepository` (tự lọc `BranchCode`, phạm vi; chặn ghi ở `A00`). Cấm SQL thô trong controller, service; cấm module tự viết điều kiện phân quyền.
4. `BranchCode` của phiên lấy từ token do server cấp, không bao giờ nhận từ body, query, header.
5. Bảng theo ĐVCS bắt buộc có cột `BranchCode` (có index). Bảng dùng chung toàn công ty khai `ScopeType = 'SHARED'` trong `SysResource`; chưa khai báo thì repository từ chối chạy.
6. Lấy một dòng, sửa, xóa cũng áp điều kiện ĐVCS và phạm vi, không chỉ danh sách.
7. Quyền, vai trò, chính sách cột là dữ liệu trong DB (seed tạo, quản trị chỉnh ở màn Quản trị); menu hiện chỉ do seed quản lý. Không hardcode.
8. Thay đổi phân quyền và đăng nhập ghi `SysAuditLog`. Không ai tự đổi quyền của mình; chỉ cấp được quyền `admin.*` mà mình đang có.
9. Đủ 5 lớp: vai trò × tài nguyên × hành động; lọc ĐVCS; phạm vi theo phép gán (chuyền, người tạo…); chính sách cột Ẩn/Che/Chỉ đọc/Sửa được (áp cả khi xuất file); ngoại lệ theo người có hạn dùng.
10. `A00` (`SysBranch.IsAggregate`, server tra từ DB) chỉ đọc dữ liệu theo ĐVCS, kể cả với vai trò Toàn quyền, và không gắn dữ liệu.

Chi tiết: `04-phan-quyen.md`.

## 5. Quy ước database

- Tên bảng, cột PascalCase, tiếng Anh, không dấu, số ít; bảng con mang tiền tố bảng cha; tiền tố `Sys` ở `MES_Core`. `Id`, `<BảngĐích>Id`, ngày `…Date`, thời điểm `…At` (`DATETIME2(3)` UTC), cờ `Is…`. Đối chiếu từ khóa SQL Server trước khi đặt tên.
- Bảng danh mục: `Id, Code, Name, Description, SortOrder, IsActive, IsSystem, CreatedAt/By, ModifiedAt/By`; mã không sửa; không xóa vật lý mà dùng `IsActive`. Bảng giao dịch: `BranchCode VARCHAR(10)` (cấm sửa sau khi tạo) cùng `CreatedAt/By, ModifiedAt/By`. Dùng `NULL` cho "không có", không chèn dòng đại diện.
- Khóa ngoại vật lý chỉ trong cùng database. Quan hệ giữa các database là khóa ngầm: khai ở `backend/migrations/softkeys.json`, có index, kiểm bằng `npm run check:softkeys -w backend`. Không có transaction chung giữa các database.
- Schema chỉ đổi qua migration `backend/migrations/<Database>/NNNN_ten.sql`; file đã chạy thì không sửa, thêm file mới. Chi tiết: `03-kien-truc.md`.

## 6. Quy ước code

- TypeScript strict. Module không import phần bên trong module khác, giao tiếp qua service công khai (lint ranh giới có ở `backend/eslint.config.mjs`; frontend chưa có).
- Lỗi API dùng `AppException`/`Errors` với mã ổn định. Giao diện, thông điệp bằng tiếng Việt; định danh tiếng Anh.
- Khác biệt giữa ĐVCS, nhà máy nằm trong bảng cấu hình; không rẽ nhánh theo mã ĐVCS, không gắn cứng mã.
- Comment chỉ giải thích "vì sao".

## 7. An toàn khi dùng AI

- Không đưa mật khẩu, chuỗi kết nối, dữ liệu thật (tên khách, số PO) vào prompt, code, tài liệu, commit. Bí mật nằm ở `backend/.env`; người dùng tự điền, không nhận mật khẩu qua chat.
- AI tạo file migration; chỉ chạy lên database dùng chung khi người dùng cho phép (ngoại lệ đang hiệu lực: `14-quy-trinh-lam-viec.md`). Công cụ chặn thì dừng, đưa lệnh cho người dùng, không lách.
- Hỏi trước hành động khó đảo ngược: xóa dữ liệu, drop, push, deploy, `load:bravo`/`reset:demo` trên database thật. Chỉ commit khi người dùng yêu cầu.
- Hệ thống ngoài chỉ đọc; không đọc thẳng database BRAVO.
- Test backend chạy trên bộ database test riêng (đổi `DB_*_NAME` bằng biến môi trường), `--runInBand`, xong xóa bộ đó. Code AI viết phải qua lint, test; phân quyền và lọc `BranchCode` luôn có test.

## 8. Lệnh

Chạy ở thư mục gốc; cần Node.js 22, SQL Server 2019/2022 (tài khoản SQL). Biến môi trường, triển khai máy chủ: `11-van-hanh.md`. Tài khoản demo (`admin` có Toàn quyền, `quantri`, `giamdoc`, `kehoach.a`, `truongchuyen.a`, `truongchuyen.b`, `ketoan`, `nhansu`; mật khẩu `DEMO_PASSWORD`): `12-du-lieu-mau-va-kiem-thu.md`.

```
npm install                          # cài backend + frontend
npm run migrate                      # tạo database (nếu có quyền), chạy migration, nạp dữ liệu hệ thống + tài khoản admin
npm run migrate -- MES_Order         # chỉ một database, không nạp dữ liệu
npm run seed                         # máy demo: thêm dữ liệu mẫu (-- --sync-matrix: nạp lại ma trận quyền mẫu)
npm run dev:backend                  # http://localhost:3000/api/v1
npm run dev:frontend                 # http://localhost:5173 (proxy /api sang backend)
npm run lint && npm test && npm run build
npm run demo                         # build rồi chạy một cổng, mở được từ điện thoại trong LAN
npm run reset:demo -- --yes          # dữ liệu demo về ban đầu
npm run load:bravo -- --yes          # thay đơn hàng bằng dữ liệu BRAVO đã chép
npm run sim:board -- --yes           # xếp lại dàn chuyền mô phỏng
npm run check:softkeys -w backend    # kiểm bản ghi mồ côi giữa các database (chỉ đọc)
```

Lệnh có `--yes` chỉ chạy với SQL Server trên chính máy này (máy khác cần thêm `--allow-remote-db`); thiếu `--yes` thì chỉ in việc sẽ làm. Máy `SEED_SAMPLE_DATA=false` (máy dùng thật) từ chối `reset:demo`, `load:bravo`, `sim:board`. `npm test` chạy trên database ghi trong `.env` (xem mục 7).

## 9. Định nghĩa "xong"

- Build, lint, test liên quan qua, nhất là test phân quyền và `BranchCode`.
- Đúng mục 4–6: không SQL thô ngoài repository, không nhận `BranchCode` từ client.
- Đã sửa tài liệu sở hữu trong `docs/update_docs/`, trạng thái ở `02-trang-thai.md`, quyết định mới ở `13-quyet-dinh.md`.
- Đã qua `code-reviewer`, không còn `CRITICAL`/`HIGH` mở.

## 10. Ngôn ngữ

Trao đổi và tài liệu bằng tiếng Việt có đầy đủ dấu. Thuật ngữ kỹ thuật và định danh giữ nguyên tiếng Anh.
