# Vận hành: cài đặt, cấu hình, lệnh và triển khai

File này mô tả cách cài, cấu hình (`backend/.env`), chạy, migrate, seed, các script dữ liệu, triển khai lên máy chủ Windows và cập nhật bản mới.
Đọc khi cài máy mới, khi chạy một lệnh lần đầu, trước khi đụng tới database dùng chung, hoặc khi gặp lỗi lúc khởi động.
Nội dung dữ liệu do seed nạp, kịch bản demo và cách chạy test: [Dữ liệu mẫu và kiểm thử](12-du-lieu-mau-va-kiem-thu.md).

## Yêu cầu

| Thành phần | Yêu cầu |
|---|---|
| Node.js | 22 (LTS, x64). Gói cài theo `package-lock.json` ở gốc (npm workspaces `backend`, `frontend`) |
| SQL Server | 2019 hoặc 2022 (Express dùng được cho dev, demo). Bật chế độ đăng nhập Mixed Mode và giao thức TCP/IP |
| Tài khoản SQL | Đăng nhập bằng tài khoản SQL (`DB_USER`, `DB_PASSWORD`), không dùng Windows Authentication. Cần `db_owner` trên 6 database của MES; có quyền `CREATE DATABASE` thì migrate tự tạo database |
| Mạng | `npm install`/`npm ci` cần ra được npm registry |

Kết nối SQL Server qua thư viện `tedious` (`backend/src/platform/database/db.ts`): code chỉ truyền `DB_HOST` và `DB_PORT`, không truyền tên instance. Instance có tên (ví dụ `SQLEXPRESS`) phải đặt cổng TCP tĩnh và khai cổng đó ở `DB_PORT`; dạng `MAY\INSTANCE` ở `DB_HOST` không kết nối được.

## Cài đặt lần đầu (máy dev, máy demo)

1. Tạo `backend/.env` từ `backend/.env.example`. Tối thiểu điền `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET` (chuỗi ngẫu nhiên dài), `DEMO_PASSWORD`. Tên database để mặc định.
2. Chạy ở thư mục gốc:

```
npm install
npx tsx scripts/probe-db.ts      # (trong backend, tùy chọn) kiểm kết nối, liệt kê database; chỉ đọc
npm run migrate                  # tạo database nếu được, chạy migration, nạp dữ liệu hệ thống và tài khoản admin
npm run seed                     # máy demo: thêm tài khoản demo và dữ liệu mẫu
```

3. Chạy khi phát triển hoặc chạy bản demo (mục [Chạy khi phát triển](#chay-khi-phat-trien), [Chạy bản demo](#chay-ban-demo-mot-cong-qua-lan)).

Tài khoản trong `.env` không tạo được database thì nhờ quản trị CSDL tạo trước 6 database (cùng collation), cấp `db_owner` cho tài khoản đó, rồi chạy lại `npm run migrate`.

## Biến môi trường

### Cách nạp

- Backend và mọi script đọc `backend/.env` qua `backend/src/config/env.ts` (đường dẫn tính theo vị trí file code, không theo thư mục đang đứng).
- Biến đã có trong môi trường của tiến trình **thắng** giá trị trong `.env` (dotenv không ghi đè). Dùng cách này để trỏ tạm sang bộ database khác (xem [Bộ database test riêng](12-du-lieu-mau-va-kiem-thu.md#bo-database-test-rieng)).
- Cờ `SEED_SAMPLE_DATA`, `BRAVO_ORDER_IMPORT`, `OSM_FACTORY_UPDATE`, `PO_ALLOCATION_REFRESH` chỉ nhận `true` hoặc `false` (không phân biệt hoa thường) hoặc để trống. Giá trị khác (`0`, `yes`…) làm backend và mọi script dừng ngay với lỗi "… chỉ nhận true hoặc false". `PO_ALLOCATION_MAX_SHRINK_PERCENT` chỉ nhận số nguyên 0–100 hoặc để trống; giá trị khác làm dừng với lỗi "… chỉ nhận số nguyên từ 0 đến 100".
- `env.ts` kiểm lúc nạp: `NODE_ENV=production` mà thiếu `JWT_SECRET` hoặc `JWT_SECRET` dưới 32 ký tự thì dừng. Kiểm này chạy cả với `npm run migrate`, `npm run seed`, `npm test`.
- Frontend không có biến môi trường: gọi API theo đường dẫn tương đối `/api/v1` (`frontend/src/lib/api.ts`).

### Bảng biến

| Biến | Bắt buộc | Mặc định | Tác dụng |
|---|---|---|---|
| `NODE_ENV` | Không | (trống) | `production`: bắt buộc `JWT_SECRET` ≥ 32 ký tự và `DEMO_PASSWORD` ≥ 8 ký tự; `COOKIE_SECURE` mặc định bật; `SEED_SAMPLE_DATA` mặc định `false`; `reset:demo`, `load:bravo`, `sim:board` từ chối chạy. Chỉ đặt trong `backend/.env`, không đặt thành biến môi trường của Windows (xem [Cài ứng dụng](#cai-ung-dung)) |
| `DB_HOST` | Không | `localhost` | Máy SQL Server (tên máy hoặc IP, không kèm tên instance) |
| `DB_PORT` | Không | `1433` | Cổng TCP của SQL Server |
| `DB_USER` | Có | (trống) | Tài khoản SQL |
| `DB_PASSWORD` | Có | (trống) | Mật khẩu tài khoản SQL |
| `DB_ENCRYPT` | Không | tắt | `true` thì mã hóa kết nối tới SQL Server; giá trị khác là tắt |
| `DB_TRUST_CERT` | Không | bật | Tin chứng chỉ của SQL Server; chỉ `false` mới tắt |
| `DB_CORE_NAME` | Không | `MES_Core` | Tên database lõi |
| `DB_ORDER_NAME` | Không | `MES_Order` | Tên database module Đơn hàng |
| `DB_SEWING_NAME` | Không | `MES_Sewing` | Tên database module May |
| `DB_CUTTING_NAME` | Không | `MES_Cutting` | Tên database module Cắt (phase 5.14) |
| `DB_HR_NAME` | Không | `MES_Hr` | Tên database module Nhân sự |
| `DB_SYNC_NAME` | Không | `MES_Sync` | Tên database đồng bộ |
| `DB_TRUNGGIAN_NAME` | Khi đồng bộ BRAVO | (trống) | Database trung gian chứa view BRAVO. Trống thì migrate bỏ qua tạo synonym BRAVO (đồng bộ BRAVO sẽ lỗi khi chạy). Chỉ chữ, số, `_`, `-` |
| `DB_TRUNGGIAN_SERVER` | Không | (trống) | Tên linked server khi database trung gian ở SQL Server khác (synonym 4 phần). Cùng máy để trống |
| `DB_OSM_NAME` | Không | (trống) | Database OSM chứa view `vOSMDataFty` (Nhà máy SX của đơn hàng). Trống thì migrate tắt nguồn này |
| `DB_OSM_SERVER` | Không | (trống) | Linked server tới database OSM |
| `DB_OSM_APP_NAME` | Không | (trống) | Database ứng dụng OSM chứa view `v_OSMData` (màn Phân bổ PO). Trống thì migrate tắt nguồn này |
| `DB_OSM_APP_SERVER` | Không | (trống) | Linked server tới database ứng dụng OSM |
| `PORT` | Không | `3000` | Cổng backend (và giao diện khi chạy `--serve-web`) |
| `HOST` | Không | `0.0.0.0` | Địa chỉ lắng nghe. Sau reverse proxy cùng máy: `127.0.0.1` |
| `JWT_SECRET` | Có khi `production` | khóa ngẫu nhiên mỗi lần chạy | Khóa ký token. Không đặt (chỉ dev) thì token cấp trước đó mất hiệu lực mỗi lần backend khởi động lại. Tạo: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_ACCESS_TTL` | Không | `900` (giây) | Thời hạn access token |
| `PRE_AUTH_TTL` | Không | `300` (giây) | Thời hạn token tạm giữa bước mật khẩu và bước chọn ĐVCS |
| `REFRESH_TTL_DAYS` | Không | `7` | Thời hạn phiên và cookie refresh |
| `LOGIN_MAX_FAILED` | Không | `5` | Số lần sai mật khẩu liên tiếp thì khóa tạm |
| `LOGIN_LOCK_MINUTES` | Không | `15` | Thời gian khóa tạm |
| `DEMO_PASSWORD` | Có cho `migrate` (chạy đủ), `seed`, `reset:demo` | (trống) | Mật khẩu ban đầu của `admin` và các tài khoản demo. ≥ 8 ký tự khi `production`. Test backend đăng nhập tài khoản mẫu bằng giá trị này |
| `SEED_SAMPLE_DATA` | Không | `true`; `false` khi `production` | `npm run seed` có nạp dữ liệu mẫu không (tài khoản demo, ĐVCS mẫu, đơn hàng giả, phòng ban, nhân viên giả). `false` thì `reset:demo`, `load:bravo`, `sim:board` từ chối chạy |
| `BRAVO_ORDER_IMPORT` | Không | ngược với `SEED_SAMPLE_DATA` | Backend tự nạp tăng dần đơn hàng BRAVO (đã chép ở `MES_Sync`) vào `MES_Order` lúc khởi động và sau mỗi đợt đồng bộ ([Đơn hàng](06-don-hang.md)). Máy dùng thật mặc định bật, máy demo mặc định tắt |
| `OSM_FACTORY_UPDATE` | Không | `true` | Cập nhật Nhà máy SX của đơn hàng theo OSM lúc khởi động và sau mỗi đợt đồng bộ OSM ([Đơn hàng](06-don-hang.md)) |
| `PO_ALLOCATION_REFRESH` | Không | `true` | Làm mới bảng Phân bổ PO (`MES_Order.PoAllocation`) từ dữ liệu OSM đã chép, lúc khởi động và sau mỗi đợt đồng bộ nguồn `OSM.OSMData`; giữ Nhà máy SX nhập tay ([Đơn hàng](06-don-hang.md)). Tắt thì màn Phân bổ PO không nhận dữ liệu OSM mới |
| `PO_ALLOCATION_MAX_SHRINK_PERCENT` | Không | `20` | Chốt của bước làm mới Phân bổ PO: bảng chép OSM ít hơn mốc (số dòng nguồn của lần làm mới đủ gần nhất, [Đơn hàng](06-don-hang.md)) quá bao nhiêu % thì vẫn thêm, sửa nhưng không xóa dòng vắng, màn cảnh báo. `100`: không chặn; `0`: giảm một dòng cũng giữ. Cách cho qua: [Xử lý sự cố](#xu-ly-su-co-thuong-gap) |
| `COOKIE_SECURE` | Không | bật khi `production`, tắt khi khác | Cookie refresh chỉ gửi qua HTTPS; cũng bật HSTS và `upgrade-insecure-requests` của helmet (`backend/src/app.factory.ts`). Chỉ `true` là bật. Chạy HTTP thì phải là `false` |
| `TRUST_PROXY` | Không | không tin | Chỉ đặt khi chạy sau reverse proxy: tên như `loopback` hoặc IP/subnet của proxy, cách nhau dấu phẩy. Giá trị được chuyển nguyên chuỗi cho Express (`trust proxy`), không dùng dạng số hop hay `true` |

Bài test backend luôn đặt `BRAVO_ORDER_IMPORT=false`, `OSM_FACTORY_UPDATE=false` và `PO_ALLOCATION_REFRESH=false` (`backend/test/setup-env.ts`).

Bảng trên theo `backend/src/config/env.ts`. `backend/.env.example` chưa có đủ các biến trong bảng: lỗi đã biết, task T11 ở [Trạng thái](../current/STATUS.md).

## Lệnh npm

### Ở thư mục gốc

| Lệnh | Việc làm |
|---|---|
| `npm install` | Cài gói cho cả hai workspace |
| `npm run dev:backend` | Backend chế độ watch (`nest start --watch`), `http://localhost:3000/api/v1` |
| `npm run dev:frontend` | Vite dev server cổng 5173, chuyển `/api` sang `http://localhost:3000` |
| `npm run build` | Build backend (`backend/dist`) rồi frontend (`frontend/dist`) |
| `npm run lint` | ESLint backend (`src`, `scripts`, `test`), frontend (`src`) rồi script triển khai (`deploy`, cấu hình `deploy/eslint.config.mjs`), không chấp nhận cảnh báo. Có luật ranh giới module ([Kiến trúc](../ARCHITECTURE.md) mục 4) |
| `npm test` | Test backend (Jest), frontend (Vitest) rồi `test:deploy`; phần trước lỗi thì dừng |
| `npm run test:deploy` | `node --test deploy/deploy.test.cjs`: hàm thuần của script triển khai (junction, dọn bản cũ, chọn bản quay về, đọc `.env`) trên thư mục tạm; không cần database, pm2 |
| `npm run migrate` | Migrate mọi database rồi nạp dữ liệu hệ thống ([Migrate](#migrate)) |
| `npm run migrate -- MES_Core` | Chỉ migrate một database, không nạp dữ liệu |
| `npm run migrate -- --check` | Chỉ kiểm: database đã có thì đã được cấp quyền, chưa có thì tài khoản có quyền tạo; không tạo database, không chạy migration ([Migrate](#migrate), bước 3). Phải có `--` trước `--check` (thiếu thì lệnh dừng, không migrate) |
| `npm run seed` | Nạp dữ liệu (thêm phần thiếu) ([Seed](#seed)); tham số đặt sau `--` |
| `npm run reset:demo -- --yes` | Đưa dữ liệu demo về ban đầu ([reset:demo](#resetdemo)) |
| `npm run load:bravo -- --yes` | Thay đơn hàng giả bằng đơn hàng BRAVO đã chép ([load:bravo](#loadbravo)) |
| `npm run sim:board -- --yes` | Xếp lại dàn chuyền mô phỏng ([sim:board](#simboard)) |
| `npm run demo` | `npm run build` rồi `start:demo` của backend |

### Trong `backend`

Gọi bằng `npm run <lệnh> -w backend` ở gốc, hoặc `npm run <lệnh>` trong thư mục `backend`.

| Lệnh | Việc làm |
|---|---|
| `build` | `nest build` theo `backend/tsconfig.build.json` (chỉ `src`, xóa `dist` trước khi build) |
| `start` | `node dist/main.js`: chỉ API |
| `start:dev` | `nest start --watch` |
| `start:demo` | `node dist/main.js --serve-web`: API và giao diện đã build cùng một cổng |
| `lint` | `eslint src scripts test --max-warnings 0` |
| `test` | `jest --runInBand` (chạy tuần tự, trên database thật) |
| `migrate`, `seed`, `reset:demo`, `load:bravo`, `sim:board` | Script trong `backend/scripts`, chạy bằng `tsx` (không cần build) |
| `check:softkeys` | Kiểm bản ghi mồ côi theo khóa ngầm ([Script kiểm tra](#script-kiem-tra-va-cong-cu)) |

Script không có lệnh npm, chạy trong thư mục `backend`: `npx tsx scripts/probe-db.ts`, `npx tsx scripts/sync-gen.ts …`.

### Trong `frontend`

| Lệnh | Việc làm |
|---|---|
| `dev` | Vite, cổng 5173, `host: true` (máy khác trong LAN mở được `http://<IP>:5173`) |
| `build` | `tsc --noEmit` rồi `vite build` ra `frontend/dist` |
| `lint` | `eslint src --max-warnings 0` |
| `test` | `vitest run --passWithNoTests` (jsdom, không cần backend) |
| `perf` | `vitest run --config vitest.perf.config.ts`: đo hiệu năng vẽ, không nằm trong `npm test` ([Đo hiệu năng](12-du-lieu-mau-va-kiem-thu.md#do-hieu-nang)) |

<a id="migrate"></a>

## Migrate

`backend/scripts/migrate.ts`. Chỉ chạy khi có người gọi lệnh, backend không tự migrate lúc khởi động. Danh sách file migration và nội dung, cơ chế: [Kiến trúc](../ARCHITECTURE.md) mục 6.2.

### Việc lệnh làm

1. Chạy đủ (không tham số): kiểm `DEMO_PASSWORD` có giá trị (≥ 8 ký tự khi `production`) **trước** khi chạm database. Thiếu thì dừng, chưa chạy migration nào.
2. Lấy các thư mục trong `backend/migrations`, xếp theo tên: `MES_Core`, `MES_Cutting`, `MES_Hr`, `MES_Order`, `MES_Sewing`, `MES_Sync`. Tên thư mục đổi sang tên database thật theo `DB_*_NAME`, bảng ánh xạ ở `backend/scripts/database-names.ts`; thư mục chưa khai thì dừng (không lấy tên thư mục làm tên database).
3. Kiểm mọi database **trước khi chạy migration nào**: tạo database nếu chưa có (`IF DB_ID(...) IS NULL CREATE DATABASE … COLLATE <collation của MES_Core>`); tài khoản không có quyền tạo, hoặc chưa được cấp quyền vào database (`HAS_DBACCESS`), thì dừng, báo nhờ quản trị CSDL tạo và cấp `db_owner`, chưa database nào bị migrate. Database có collation khác `MES_Core` thì in cảnh báo (không dừng): các database MES phải cùng collation vì tên màu, cỡ chép giữa các database được so khớp theo collation. `npm run migrate -- --check` chỉ kiểm, không tạo database (chưa có thì kiểm tài khoản có quyền `CREATE ANY DATABASE`) rồi dừng; `deploy.cjs` gọi trước khi dừng bản cũ.
4. Với từng database:
   - tạo bảng theo dõi `dbo.__MigrationHistory (FileName NVARCHAR(200) PRIMARY KEY, AppliedAt DATETIME2(3))` nếu chưa có;
   - chạy các file `.sql` chưa có trong bảng theo dõi, theo thứ tự tên file. Mỗi file tách lô theo dòng chỉ có `GO`, chạy **trong một transaction** cùng câu ghi tên file vào `__MigrationHistory`. File lỗi thì không ghi gì của file đó; các file trước đã chạy giữ nguyên;
   - riêng `MES_Sync`: tạo lại synonym nguồn đồng bộ (mục dưới).
5. Nạp dữ liệu hệ thống: gọi `runSeed({ sampleData: false })` của `backend/scripts/seed.ts` (không dữ liệu mẫu, kể cả trên máy demo). Lỗi ở bước này thì báo "Đã tạo bảng xong nhưng nạp dữ liệu hệ thống lỗi", sửa nguyên nhân rồi chạy `npm run seed -- --sync-matrix`.
6. Kiểm tài khoản `admin` dùng được: có tài khoản, có vai trò `ADMIN`, vai trò `ADMIN` có `admin.user:view`, có ít nhất một ĐVCS. `admin` đã bị vô hiệu thì bỏ qua. Thiếu thì in "Cảnh báo: …" và gợi ý `npm run seed -- --sync-matrix` (chỉ nên chạy ở lần cài đầu; cố ý đổi quyền thì bỏ qua).

Chỉ lưu tên file: sửa một file đã chạy không có tác dụng, phải thêm file mới. Không có migration lùi; quay lại bản cũ bằng bản sao lưu database.

### Chạy một database

`npm run migrate -- MES_Order` chỉ chạy thư mục đó (tên thư mục, không phải tên database thật), không kiểm `DEMO_PASSWORD`, không nạp dữ liệu hệ thống. Muốn nạp thì chạy lại `npm run migrate` không tham số.

### Synonym nguồn đồng bộ

Sau mỗi lần migrate `MES_Sync`, hàm `linkSyncSources` tạo lại synonym của thủ tục chép trỏ tới view nguồn, theo `.env` (cấu hình nguồn trong `backend/scripts/source-databases.ts`). Đổi tên database nguồn hay linked server chỉ cần sửa `.env` rồi chạy lại `npm run migrate`, không cần migration mới.

| Database nguồn | Biến | Không khai biến |
|---|---|---|
| Database trung gian BRAVO | `DB_TRUNGGIAN_NAME`, `DB_TRUNGGIAN_SERVER` | Cảnh báo, bỏ qua tạo synonym; đồng bộ BRAVO báo lỗi khi chạy |
| Database ứng dụng OSM (view `v_OSMData`) | `DB_OSM_APP_NAME`, `DB_OSM_APP_SERVER` | Tắt nguồn (`SyncSource.IsActive = 0`); khai báo rồi migrate lại thì bật |
| Database OSM (view `vOSMDataFty`) | `DB_OSM_NAME`, `DB_OSM_SERVER` | Như trên |

- Tên database chỉ gồm chữ, số, `_`, `-`; tên linked server thêm được `.` và `\`. Sai dạng thì dừng trước khi bật nguồn.
- Synonym có dạng `[server].[database].[dbo].[view]` khi có linked server, `[database].[dbo].[view]` khi cùng máy. Chỉ tạo lại synonym có đích khác, xóa và tạo trong một transaction.
- Khai linked server mà không thấy trong `sys.servers` (hoặc chưa bật Data Access) thì cảnh báo, synonym vẫn tạo nhưng đồng bộ sẽ lỗi.

Nguồn, thủ tục chép, linked server: [Đồng bộ](09-dong-bo.md).

<a id="seed"></a>

## Seed

`backend/scripts/seed.ts` (hàm `runSeed`), dữ liệu khai trong `backend/scripts/seed-data.ts`. Nội dung từng phần: [Dữ liệu mẫu và kiểm thử](12-du-lieu-mau-va-kiem-thu.md).

| Lệnh | Việc làm |
|---|---|
| `npm run seed` | Nạp dữ liệu hệ thống; nạp thêm dữ liệu mẫu khi `SEED_SAMPLE_DATA` là `true` |
| `npm run seed -- --no-sample-data` | Như trên nhưng không dữ liệu mẫu, bất kể `SEED_SAMPLE_DATA` |
| `npm run seed -- --reset-passwords` | Thêm: đặt lại mật khẩu các tài khoản trong danh sách seed về `DEMO_PASSWORD`, mở khóa, thu hồi mọi phiên của họ. Không dữ liệu mẫu thì chỉ tài khoản `admin` |
| `npm run seed -- --sync-matrix` | Thêm: nạp lại đủ ma trận quyền, chính sách cột của vai trò mẫu, phạm vi, ngoại lệ, cột riêng của tài khoản mẫu (chỉ thêm dòng còn thiếu, không xóa dòng đang có) |

Seed cần `DEMO_PASSWORD` (≥ 8 ký tự khi `production`).

### Chạy lại an toàn: chỉ thêm phần thiếu

- **Theo code, luôn đồng bộ** (ghi đè mỗi lần chạy, chỉ với bản ghi hệ thống `IsSystem = 1`): tên, bảng nguồn, phạm vi dữ liệu (`ScopeType`), thứ tự của tài nguyên; tên quyền; tên, thứ tự nhóm menu; tên, đường dẫn, thứ tự mục menu; tên, cờ nhạy cảm, thứ tự cột đăng ký; liên kết chiều phạm vi của tài nguyên (thêm, sửa, gỡ đúng như khai báo). Đổi `ScopeType` thì in cảnh báo và ghi vào nhật ký.
- **Chỉ thêm khi còn thiếu, không ghi đè thay đổi ở màn hình**: ĐVCS, vai trò, quyền, menu, đơn vị tổ chức, danh mục, mục danh mục, ca làm việc, Nhà máy SX mẫu, bước chuẩn bị SX, loại phòng ban, phòng ban, chức danh; nhân viên giả chỉ khi bảng `Employee` còn trống; đơn hàng giả chỉ cho ĐVCS chưa có đơn hàng nào.
- **Không cấp lại quyền đã thu hồi** (trừ khi `--sync-matrix`):
  - ma trận quyền chỉ gán cho vai trò hoặc quyền vừa tạo trong lần chạy này;
  - chính sách cột mẫu chỉ cho vai trò hoặc cột vừa tạo;
  - vai trò, ĐVCS, phạm vi, ngoại lệ, cột riêng mẫu chỉ cho tài khoản vừa tạo. Tài khoản mẫu đã có chỉ nhận thêm ĐVCS vừa được tạo trong chính lần chạy này (ví dụ máy demo cài bằng `migrate` rồi `seed`: `admin` có `A00` trước, nhận `A01`–`A03` khi seed tạo chúng);
  - vai trò Toàn quyền gán cho `admin` lúc seed tạo vai trò (máy đã cài), lúc tạo tài khoản `admin` (máy cài mới) hoặc khi `--sync-matrix`; vai trò đã có thì không gán lại ([Dữ liệu mẫu › Vai trò Toàn quyền](12-du-lieu-mau-va-kiem-thu.md#vai-tro-toan-quyen)).
- Một tài khoản mẫu thiếu nút ĐVCS cho phạm vi (ví dụ chưa có `A02` cho phạm vi của `ketoan`) thì không gán vai trò cho tài khoản đó (vai trò không kèm phạm vi là không giới hạn), in cảnh báo. Phạm vi chuyền ghi theo mã (`A01-L03` của `truongchuyen.a`, `truongchuyen.b`) kể cả khi mã chưa là chuyền đang dùng: chưa có tác dụng tới khi có bộ phận đó.
- Database `MES_Sewing`, `MES_Hr` chưa có hoặc chưa migrate thì bỏ qua phần của database đó, kèm cảnh báo; phần `MES_Core`, `MES_Order` vẫn nạp.
- Có `MES_Sync` đã đồng bộ danh mục chi nhánh BRAVO (`bravo.DM_CHINHANH`) thì seed chép thêm ĐVCS, đổi tên ĐVCS theo BRAVO.
- Cuối lần chạy: tăng `SysPermissionVersion` (giao diện nạp lại quyền ở request kế tiếp), ghi một dòng `SysAuditLog` `ActionCode = 'SEED'` khi có thay đổi.

## Script dữ liệu demo

Ba lệnh dưới **xóa hoặc ghi đè dữ liệu**, chỉ dành cho máy demo. Chốt chặn chung: [Chốt chặn an toàn](#chot-chan-an-toan-cua-script). Thiếu `--yes` thì chỉ in mô tả việc sẽ làm.

<a id="resetdemo"></a>

### reset:demo

`backend/scripts/reset-demo.ts`. `npm run reset:demo -- --yes [--bravo]`. Cần `DEMO_PASSWORD`; `MES_Hr` đã tạo mà chưa migrate thì dừng trước khi chạm `MES_Core`.

1. `MES_Core`, trong một transaction:
   - ĐVCS mẫu và ĐVCS có trong danh mục chi nhánh BRAVO đã chép được bật lại; ĐVCS mẫu về tên mẫu, trừ mã có trong BRAVO (giữ tên BRAVO); ĐVCS khác bị tắt;
   - vai trò mẫu về tên, mô tả, bật lại; vai trò khác bị tắt; xóa gán quyền và chính sách cột của vai trò mẫu;
   - tài khoản mẫu: xóa phạm vi, ngoại lệ, cột riêng, vai trò, ĐVCS, Nhà máy SX đã gán; đặt lại họ tên, bật, mở khóa; tài khoản khác bị vô hiệu; thu hồi **mọi** phiên;
   - Nhà máy SX mẫu về tên, ĐVCS; nhà máy tạo thêm bị ngừng (giữ nhà máy do đồng bộ OSM tự thêm); mục danh mục mẫu, ca mẫu về như seed, mục, ca tạo thêm bị ngừng;
   - xóa hết Lịch làm việc (`SysWorkCalendar`, `SysWorkCalendarDay`); seed ở bước 5 nạp lại lịch mẫu cho các ĐVCS mẫu.
2. Xóa toàn bộ Kế hoạch chuẩn bị SX (`clearSewingPrep`, danh mục bước giữ nguyên) và Kế hoạch may (`clearSewingDayPlan`) trong `MES_Sewing`; xóa toàn bộ dữ liệu `MES_Cutting` (`clearCutting`, một transaction của `MES_Cutting`: số cắt, bản chép kế hoạch, lệnh cấp BTP cùng số cấp). Database chưa có, hoặc chưa có bảng Kế hoạch may, thì bỏ qua phần đó (`backend/scripts/sewing-data.ts`, `cutting-data.ts`).
3. Xóa toàn bộ dữ liệu đơn hàng trong `MES_Order` (đơn, PO, màu cỡ, kế hoạch, dàn chuyền, phân màu cỡ), đặt lại bộ đếm Id. Hai bảng Phân bổ PO (`PoAllocation`, `PoAllocationRefresh`) giữ nguyên.
4. Xóa loại phòng ban, phòng ban (kể cả xưởng, chuyền may), chức danh, nhân viên trong `MES_Hr`; seed ở bước 5 nạp lại, gồm xưởng, chuyền may mẫu.
5. `runSeed({ resetPasswords: true, syncMatrix: true })`: nạp lại đủ dữ liệu mẫu, mật khẩu demo.
6. `--bravo`: gọi `load:bravo` thay đơn hàng giả bằng đơn hàng BRAVO.
7. Ghi `SysAuditLog` `DEMO_RESET`. Nhật ký cũ giữ nguyên. Không có transaction chung giữa các database: bước 1 xong trước rồi mới đụng `MES_Sewing`, `MES_Cutting`, `MES_Order`, `MES_Hr` (theo thứ tự đó).

Ở `MES_Core`, chỉ xóa vật lý phép gán của tài khoản, vai trò mẫu và Lịch làm việc; bản ghi khác chỉ bị tắt hoặc đặt lại.

<a id="loadbravo"></a>

### load:bravo

`backend/scripts/load-bravo-orders.ts`. `npm run load:bravo -- --yes [--no-plans]`. Thay **toàn bộ** đơn hàng trong `MES_Order` (kể cả đơn nhập tay) bằng đơn hàng, PO, màu cỡ đọc từ bảng chép BRAVO trong `MES_Sync` (không đọc database trung gian). Không đụng bảng Phân bổ PO. Ánh xạ dùng chung với bước nạp tăng dần, luật nghiệp vụ: [Đơn hàng](06-don-hang.md).

- Cần `MES_Sync` đã đồng bộ các nguồn đơn hàng (`bravo.DM_SanPhamDonHang` có dữ liệu), không thì dừng và nhắc đồng bộ trước.
- Chép thêm ĐVCS theo danh mục chi nhánh BRAVO trước khi nạp.
- Lấy khóa nạp của backend (`MES_Order.BravoImport`: chờ lần nạp tăng dần đang chạy, tối đa 10 giây, hết giờ thì dừng), xóa dữ liệu đơn hàng rồi nạp lại trong một transaction của `MES_Order` (mỗi câu tối đa 10 phút). Sau khi lấy khóa, trước khi xóa dữ liệu đơn hàng, xóa Kế hoạch chuẩn bị SX, Kế hoạch may (`clearSewingPrep`, `clearSewingDayPlan`) và dữ liệu Cắt (`clearCutting`: số cắt, bản chép kế hoạch, lệnh cấp BTP) trên kết nối riêng của `MES_Sewing`, `MES_Cutting`: các bước này tự commit, không được hủy theo khi transaction đơn hàng lỗi (`backend/scripts/load-bravo-orders.ts`).
- Nhà máy SX theo dữ liệu OSM đã chép; chưa có OSM thì tạm lấy Nhà máy SX cùng mã với chi nhánh nhận đơn (nếu đang dùng).
- Mặc định sinh dàn chuyền mô phỏng (như `sim:board`, chuyền đọc từ `MES_Hr`); `--no-plans` bỏ phần này.
- In bảng thống kê theo ĐVCS, ghi `SysAuditLog` `BRAVO_LOAD`, và nhắc: database giờ có dữ liệu thật, backend nghe mọi địa chỉ, tài khoản demo dùng chung `DEMO_PASSWORD`. Nên đặt `HOST=127.0.0.1` hoặc đổi `DEMO_PASSWORD` mạnh rồi `npm run seed -- --reset-passwords`.

Máy dùng thật không dùng lệnh này: backend tự nạp tăng dần (`BRAVO_ORDER_IMPORT`).

<a id="simboard"></a>

### sim:board

`backend/scripts/simulate-board.ts`. `npm run sim:board -- --yes [--all]`. Xếp lại dàn chuyền mô phỏng kín các chuyền quanh hôm nay (theo giờ máy), người lập "Lập tự động (mô phỏng)". Luật xếp: [Đơn hàng](06-don-hang.md).

- Chuyền: bộ phận tích "Xưởng sản xuất", chưa giải thể, có ĐVCS, đọc từ `MES_Hr` (`readLines`, `backend/scripts/script-db.ts`). Chưa có `MES_Hr` hoặc chưa migrate thì không có chuyền nào, dàn chuyền để trống (cảnh báo, không dừng).
- Xóa kế hoạch mô phỏng cũ cùng PO, SL màu cỡ, dàn chuyền, phân màu cỡ của chúng; giữ kế hoạch người dùng lập và kế hoạch mô phỏng người dùng đã sửa (ở Kế hoạch xuất hàng, Xếp chuyền, Phân bổ màu cỡ, hoặc đã nhập ở Kế hoạch chuẩn bị SX).
- `--all`: xóa cả các kế hoạch mô phỏng người dùng đã sửa (kèm ngày chuẩn bị SX đã nhập của các kế hoạch đó).
- Luôn giữ, kể cả `--all`: kế hoạch đã có số cắt ở Đồng bộ tiến độ cắt (`plansWithCuts`), kế hoạch có mã hàng đã cấp BTP ở ĐVCS của nó (`plansWithSupply`), kế hoạch có dòng dàn chuyền đã có bản ghi ở Kế hoạch may (`dayPlanLines`). Các dữ liệu này đọc từ `MES_Cutting`, `MES_Sewing` trước transaction của `MES_Order` (`backend/scripts/cutting-data.ts`, `sewing-data.ts`).
- Đơn hàng của kế hoạch bị xóa trở về trạng thái lúc nạp.
- Một transaction trên `MES_Order` (vài chục giây; màn đơn hàng đang mở phải chờ); xong ghi `SysAuditLog` `BOARD_SIMULATE`.

<a id="script-kiem-tra-va-cong-cu"></a>

## Script kiểm tra và công cụ

| Lệnh (thư mục) | Việc làm |
|---|---|
| `npm run check:softkeys -w backend` (gốc) | Chỉ đọc. Đối chiếu khóa ngầm giữa các database theo `backend/migrations/softkeys.json`; in OK/LỖI từng khóa, thoát mã 1 khi có bản ghi mồ côi; database chưa có thì bỏ qua kèm cảnh báo. Dòng dàn chuyền, Kế hoạch chuẩn bị SX gắn mã chuyền không là bộ phận nào ở `MES_Hr` (chuyền của danh mục chuyền cũ) được báo mồ côi ([Quyết định](13-quyet-dinh.md) mục 6.7). Danh sách khóa: chính `backend/migrations/softkeys.json` (loại quan hệ: [Kiến trúc](../ARCHITECTURE.md) mục 6.3) |
| `node deploy/deploy.cjs --root <thư mục> […]` (gốc) | Triển khai bản mới lên máy chủ không hạ web; `--status`, `--rollback`, `--sync-env`. Không cần build trước, không dùng `tsx`. Chi tiết: [Cập nhật bản mới](#cap-nhat-ban-moi-len-may-chu) |
| `npx tsx scripts/probe-db.ts` (`backend`) | Chỉ đọc. Kết nối `master`, in phiên bản SQL Server, danh sách database người dùng, tên database lõi, đơn hàng và tài khoản sẽ dùng (không in mật khẩu) |
| `npx tsx scripts/sync-gen.ts [<Bảng>…] [--procs-only] --out migrations/MES_Sync/NNNN_ten.sql` (`backend`) | Đọc cấu trúc cột của view nguồn (qua linked server nếu có), sinh migration `MES_Sync` cho nguồn đồng bộ. Không tên bảng: mọi nguồn; `--procs-only`: chỉ sinh lại thủ tục chép. Dùng `--out`, không dùng `> file` (PowerShell 5.1 ghi UTF-16, hỏng chữ tiếng Việt). Cách thêm nguồn: [Đồng bộ](09-dong-bo.md) |

<a id="chot-chan-an-toan-cua-script"></a>

## Chốt chặn an toàn của script

| Chốt | Ở đâu | Áp cho |
|---|---|---|
| Thiếu `--yes` thì chỉ in mô tả, không làm gì | từng script | `reset:demo`, `load:bravo`, `sim:board` |
| Từ chối khi `NODE_ENV=production` | `assertLocalDb` (`backend/scripts/local-db.ts`) | như trên, và các hàm xóa `clearSewingPrep`, `clearSewingDayPlan`, `clearHr`, `clearCutting` (qua `assertDemoMachine`) |
| Chỉ SQL Server trên chính máy này: `DB_HOST` (bỏ phần `\instance`) là `localhost`, `127.0.0.1`, `::1`, `.`, `(local)` hoặc tên máy. Máy khác thì từ chối, trừ khi thêm `--allow-remote-db` | `assertLocalDb` | như trên |
| Từ chối khi `SEED_SAMPLE_DATA=false` (máy dùng thật) | `assertDemoMachine` (`local-db.ts`) | như trên |
| Kiểm trước cả lời mô tả: máy dùng thật nhận lỗi, không nhận hướng dẫn chạy lại với `--yes` | `main()` của từng script | như trên |
| Không tự chạy khi bị import (`require.main === module`) | `migrate.ts`, `seed.ts`, `load-bravo-orders.ts`, `simulate-board.ts`, `sync-gen.ts` | test import hàm không kích hoạt script |
| Thiếu `DEMO_PASSWORD` thì dừng trước khi tạo bảng | `migrate.ts`, `seed.ts`, `reset-demo.ts` | |
| Hàm dùng chung cho script ghi dữ liệu: chèn theo lô vừa giới hạn tham số SQL Server | `backend/scripts/script-db.ts` | `load:bravo`, `sim:board` |

Lưu ý:

- SQL Server cùng máy với ứng dụng (máy chủ thật) thì chốt "chỉ máy này" không chặn được; chốt thật sự là `NODE_ENV=production` và `SEED_SAMPLE_DATA=false` trong `backend/.env` của máy chủ.
- `npm test` **không có chốt nào**: test backend ghi, sửa dữ liệu trên đúng các database trong `.env`. Không chạy trên database dùng thật; dùng bộ database test riêng.
- `npm run seed -- --sync-matrix` và `--reset-passwords` chạy được trên máy chủ (không bị chặn), nhưng `--sync-matrix` thêm lại quyền mẫu đã thu hồi ở màn Phân quyền.

<a id="chay-khi-phat-trien"></a>

## Chạy khi phát triển

Hai cửa sổ terminal ở thư mục gốc:

```
npm run dev:backend      # http://localhost:3000/api/v1
npm run dev:frontend     # http://localhost:5173
```

Mở `http://localhost:5173`. Vite chuyển `/api` sang cổng 3000 nên giao diện và API cùng origin, cookie refresh (`SameSite=Strict`) hoạt động. Tài khoản demo, mật khẩu: [Tài khoản demo](12-du-lieu-mau-va-kiem-thu.md#tai-khoan-demo).

<a id="chay-ban-demo-mot-cong-qua-lan"></a>

## Chạy bản demo một cổng qua LAN

```
npm run reset:demo -- --yes      # đưa dữ liệu demo về ban đầu (--bravo: đơn hàng BRAVO đã chép)
npm run demo                     # build rồi chạy backend --serve-web ở cổng PORT
```

- `--serve-web` (`backend/src/serve-web.ts`, gọi từ `main.ts`): backend phục vụ luôn `frontend/dist` cùng cổng với API. File tĩnh lưu đệm 1 giờ; mọi đường dẫn GET không bắt đầu bằng `/api/` hay `/assets/` trả `index.html` (React Router). File trong `/assets/` không có thì trả 404 (không trả `index.html`): giao diện biết là thiếu file code và tự tải lại trang ([Giao diện](10-giao-dien.md), mục Nạp lười). Chưa build giao diện thì dừng với lỗi "Chưa có giao diện đã build ở … Chạy: npm run build".
- Màn hình in `http://localhost:<PORT>` và `http://<IP LAN>:<PORT>` của từng card mạng.
- Đã build sẵn thì chạy lại nhanh bằng `npm run start:demo -w backend`.
- Điện thoại cùng Wi-Fi/LAN với máy demo. Không vào được thì mở cổng tường lửa (PowerShell quyền Administrator):
  `New-NetFirewallRule -DisplayName "MES demo" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow`
- Demo chạy HTTP nên để `COOKIE_SECURE=false` (mặc định khi không đặt `NODE_ENV=production`).
- Ứng dụng có `manifest.webmanifest` nhưng chưa có service worker; cài như ứng dụng trên điện thoại cần HTTPS.

## Triển khai máy chủ Windows

Phần này chỉ giữ các bước phụ thuộc code. Linked server, tài khoản đọc phía BRAVO/OSM và các lỗi riêng của nguồn: [Đồng bộ](09-dong-bo.md). Việc còn chờ trên máy chủ: [Trạng thái](../current/STATUS.md).

`deploy/huong-dan.html` là bản hướng dẫn rút gọn cho người vận hành máy chủ. Quy trình triển khai chính thức là file này (mục này và [Cập nhật bản mới lên máy chủ](#cap-nhat-ban-moi-len-may-chu)): hai bản nói khác nhau thì theo file này. Điểm `huong-dan.html` có mà file này chưa kiểm: thư mục triển khai phải nằm trên ổ NTFS gắn trên chính máy chủ, không phải ổ mạng, vì script tạo junction (NEEDS VERIFICATION: `deploy/lib.cjs`, `fs.symlinkSync(…, 'junction')`).

<a id="chuan-bi-sql-server"></a>

### Chuẩn bị SQL Server

1. SQL Server 2019/2022, Mixed Mode, bật TCP/IP với cổng cố định (Express mặc định tắt TCP/IP).
2. Quản trị CSDL tạo 6 database (`MES_Core`, `MES_Order`, `MES_Sewing`, `MES_Cutting`, `MES_Hr`, `MES_Sync`, hoặc tên đặt ở `DB_*_NAME`) và một login SQL cho ứng dụng, cấp `db_owner` trên cả 6 database. Login này không cần `sysadmin` hay quyền tạo database. Thiếu một database mà login không tạo được thì migrate dừng trước khi chạy migration nào.
3. Nếu đồng bộ BRAVO/OSM: tạo linked server và ánh xạ login (xem [Đồng bộ](09-dong-bo.md)).

<a id="cai-ung-dung"></a>

### Cài ứng dụng

1. Cài Node.js 22 LTS x64 (`node -v` ra `v22.x`), Git, pm2 (`npm install -g pm2@7.0.4`: bản máy chủ đang dùng, đã diễn tập).
2. Lấy mã nguồn bằng git (máy chủ: `F:\App\MES_VSN`). Thư mục này chỉ để lấy code; ứng dụng chạy từ thư mục triển khai riêng nằm ngoài nó (máy chủ: `F:\App\MES-run`), mỗi lần cập nhật một bản build mới ([Cập nhật bản mới](#cap-nhat-ban-moi-len-may-chu)).
3. Tạo `F:\App\MES-run\shared\.env`, bản `.env` duy nhất của máy chủ (script triển khai chép vào `backend\.env` của từng bản build):
   - `NODE_ENV=production`, `SEED_SAMPLE_DATA=false` (ghi rõ dù đã là mặc định của `production`);
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` của login ứng dụng;
   - `JWT_SECRET` ngẫu nhiên ≥ 32 ký tự; `DEMO_PASSWORD` mạnh, ≥ 8 ký tự (mật khẩu ban đầu của `admin`);
   - `PORT`, `HOST`, `COOKIE_SECURE`, `TRUST_PROXY` theo cách phục vụ ([Cổng, cookie, HTTPS](#cong-cookie-https));
   - biến nguồn đồng bộ `DB_TRUNGGIAN_*`, `DB_OSM_*` nếu dùng.
   Chỉ tài khoản quản trị Windows và tài khoản chạy pm2 được đọc thư mục `F:\App\MES-run` (mỗi bản build giữ một bản sao `.env`). Script cảnh báo kèm lệnh `icacls` khi Everyone, Authenticated Users hoặc Users đọc được.
4. `NODE_ENV=production` chỉ đặt trong `.env`, **không** đặt thành biến môi trường của Windows: khi đó `npm ci` bỏ các gói devDependencies (`@nestjs/cli`, `typescript`, `tsx`…) nên `npm run build` và các script (`migrate`, `seed` chạy bằng `tsx`) hỏng. Script triển khai cài kèm devDependencies (`--include=dev`) nên không bị, chạy `npm ci` bằng tay thì bị.
5. Ở `F:\App\MES_VSN`: `node deploy\deploy.cjs --root F:\App\MES-run`. Script tạo bản build, hỏi đã sao lưu database chưa, `npm run migrate`, tạo app `mes` trong pm2 và `pm2 save` (từng bước, kể cả máy đang chạy theo cách cũ: [Quy trình theo trường hợp](#quy-trinh-theo-truong-hop), A).
6. Kết quả `npm run migrate` (in trong lúc chạy script) phải có cả 6 database báo đã chạy (hoặc "không có migration mới"), rồi dòng "Nạp dữ liệu hệ thống và tài khoản admin". Máy chủ có ĐVCS `A00` (cộng ĐVCS chép từ BRAVO nếu `MES_Sync` đã đồng bộ), vai trò, quyền, menu, danh mục, ca làm việc, danh mục bước chuẩn bị SX, loại phòng ban, chức danh dùng chung và tài khoản `admin` (vai trò Quản trị hệ thống và Toàn quyền, chỉ được chọn `A00` cùng các ĐVCS mã `A01`–`A03` nếu có); không có tài khoản demo, ĐVCS mẫu, đơn hàng hay nhân viên giả. Xưởng, chuyền mẫu chỉ tạo khi có ĐVCS mang mã `A01`–`A03` ([Dữ liệu mẫu](12-du-lieu-mau-va-kiem-thu.md)). Không cần chạy `npm run seed` trên máy chủ.
7. Đăng nhập `admin` bằng `DEMO_PASSWORD`. Không tài khoản nào tự đổi được mật khẩu, vai trò hay ĐVCS của chính mình, nên:
   - tạo tài khoản quản trị riêng (vai trò Quản trị hệ thống) ở Quản trị › Người dùng, đăng nhập bằng tài khoản đó rồi vô hiệu hóa `admin` hoặc gán ĐVCS cho `admin`; nên có ít nhất hai tài khoản giữ quyền phân quyền để sửa được quyền của nhau; hoặc
   - đổi `DEMO_PASSWORD` trong `.env` rồi chạy `npm run seed -- --reset-passwords` (máy không dữ liệu mẫu: chỉ đổi mật khẩu `admin`, thu hồi phiên của `admin`).
8. Đồng bộ lần đầu (ngoài giờ làm việc): Quản trị › Đồng bộ dữ liệu, chép các nguồn ([Đồng bộ](09-dong-bo.md)). Đồng bộ xong danh mục chi nhánh BRAVO thì backend tự thêm, đổi tên ĐVCS; đồng bộ xong nguồn đơn hàng thì backend tự nạp đơn hàng (`BRAVO_ORDER_IMPORT` mặc định bật); đồng bộ xong nguồn "Phân bổ PO theo nhà máy (OSM)" thì backend tự làm mới bảng Phân bổ PO (`PO_ALLOCATION_REFRESH` mặc định bật). ĐVCS mới chưa gán cho ai: gán ở Quản trị › Người dùng.

<a id="chay-bang-pm2"></a>

### Chạy bằng pm2

pm2 giữ backend chạy, tự chạy lại khi lỗi. Cấu hình ở `deploy/ecosystem.config.cjs`; script triển khai chép ra `F:\App\MES-run\ecosystem.config.cjs` và pm2 đọc ở đó (đường dẫn tính theo vị trí file đó).

| Tùy chọn | Giá trị | Vì sao |
|---|---|---|
| `name` | `mes` | Tên app trong pm2; script triển khai đọc tên từ file này |
| `script`, `args` | `F:\App\MES-run\current\backend\dist\main.js`, `--serve-web` | Chạy qua junction `current`: đổi bản chỉ cần trỏ lại junction rồi reload. `backend\.env` và `frontend\dist` được tìm theo vị trí thật của `main.js` (trong `releases\…`), không theo thư mục làm việc |
| `cwd` | `F:\App\MES-run` | Không nằm trong `current`, để gỡ, tạo lại junction lúc chuyển bản không vướng tiến trình cũ |
| `exec_mode`, `instances` | `cluster`, 1 | `pm2 reload` bật tiến trình mới, chờ nó nghe cổng rồi mới tắt tiến trình cũ |
| `shutdown_with_message`, `kill_timeout` | `true`, 15 giây | Windows không gửi được SIGINT. `pm2 stop`, `restart`, `delete` báo tắt qua tin nhắn: backend (`main.ts`) đóng app, chờ request đang chạy xong, đóng pool DB rồi thoát; quá 15 giây thì pm2 tắt cứng. Riêng `pm2 reload` tắt cứng tiến trình cũ (mục Cập nhật bản mới) |
| `listen_timeout` | 60 giây | Tiến trình mới chưa nghe cổng sau mốc này thì pm2 vẫn tắt tiến trình cũ |
| `merge_logs`, `out_file`, `error_file` | `F:\App\MES-run\logs\mes-out.log`, `mes-error.log` | Log là stdout/stderr của Nest (gồm log nạp đơn hàng BRAVO, cập nhật Nhà máy SX theo OSM lúc khởi động), có giờ (`time`). pm2 không tự cắt log: cài `pm2 install pm2-logrotate` nếu cần |

- pm2 lưu danh sách app ở `PM2_HOME` (mặc định `%USERPROFILE%\.pm2`) của tài khoản Windows chạy lệnh: chạy `deploy.cjs` và `pm2` bằng cùng một tài khoản.
- Tự chạy khi khởi động máy: `pm2 startup` không hỗ trợ Windows. Cho pm2 chạy `pm2 resurrect` lúc khởi động bằng tài khoản ở trên; `pm2 resurrect` dựng lại theo danh sách đã `pm2 save` (script tự `save` khi tạo app `mes`). Cách làm: [Quy trình theo trường hợp](#quy-trinh-theo-truong-hop), A bước 7.
- Lệnh hay dùng: `pm2 status`, `pm2 logs mes`, `pm2 reload mes` (không gián đoạn), `pm2 restart mes` (gián đoạn vài giây).

<a id="cong-cookie-https"></a>

### Cổng, cookie, HTTPS

- Backend nghe `HOST:PORT` (mặc định `0.0.0.0:3000`). Mở cổng cho người dùng: `New-NetFirewallRule -DisplayName "MES 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow`.
- Cookie phiên `mes_rt`: `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`, hạn `REFRESH_TTL_DAYS`, `Secure` theo `COOKIE_SECURE` (`backend/src/platform/auth/auth.controller.ts`). Cơ chế phiên: [Phân quyền](04-phan-quyen.md).
- **Chạy HTTP** (chưa có chứng chỉ): đặt `COOKIE_SECURE=false`. Để mặc định của `production` (bật) mà chạy HTTP thì trình duyệt không lưu cookie: tải lại trang mất phiên, hết hạn access token (15 phút) phải đăng nhập lại.
- **Chạy HTTPS**: backend không tự phục vụ TLS. Đặt reverse proxy (Nginx, IIS ARR…) nhận HTTPS và chuyển tới backend; khi đó `HOST=127.0.0.1` (proxy cùng máy), `TRUST_PROXY=loopback` (hoặc IP của proxy) để nhật ký ghi đúng IP người dùng, `COOKIE_SECURE=true` (bật luôn HSTS). Không đặt `TRUST_PROXY` khi không có proxy: client tự đặt được `X-Forwarded-For` để giả IP.
- Repo chưa có cấu hình proxy mẫu.

### Kiểm tra sau khi cài

- `http://<máy chủ>:3000/api/v1/health` trả `{"status":"ok"}` (không cần đăng nhập; chỉ cho biết tiến trình còn sống).
- Từ máy khác, điện thoại cùng mạng: mở `http://<máy chủ>:3000`, đăng nhập, chọn ĐVCS, tải lại trang vẫn còn phiên.
- Màn Đồng bộ dữ liệu: các nguồn thành công; lần chép tăng dần thứ hai chạy nhanh, đọc ít dòng.
- `pm2 status`: app `mes` mode `cluster`, `online`; `node deploy\deploy.cjs --root F:\App\MES-run --status` báo "theo ecosystem", kiểm sống ok.
- Khởi động lại máy: pm2 tự lên, app `mes` chạy lại.
- Sao lưu chạy được ít nhất một lần và đã thử phục hồi.

### Không chạy trên máy chủ

| Lệnh | Vì sao |
|---|---|
| `npm run reset:demo`, `load:bravo`, `sim:board` | Xóa, ghi đè dữ liệu. Bị chặn khi có `NODE_ENV=production` hoặc `SEED_SAMPLE_DATA=false` |
| `npm test` | Test backend ghi vào chính các database trong `.env` |
| `npm run seed -- --sync-matrix` | Thêm lại quyền, chính sách cột mẫu đã thu hồi ở màn Phân quyền (chỉ dùng khi migrate báo thiếu quyền của `admin` ở lần cài đầu) |
| `npm run dev:backend`, `dev:frontend` | Chế độ phát triển |
| Sửa bảng, thủ tục bằng tay | Mọi thay đổi schema đi qua migration có người duyệt |

### Sao lưu và giờ hệ thống

- Sao lưu full hằng ngày và sao lưu log định kỳ cho database ở chế độ phục hồi FULL; `MES_Sync` có thể để SIMPLE vì chép lại được từ nguồn. SQL Server Express không có SQL Agent: lập lịch sao lưu bằng Task Scheduler; Express giới hạn 10 GB mỗi database.
- Máy chủ đặt múi giờ UTC+7, đồng bộ giờ NTP: "hôm nay" của dàn chuyền, Kế hoạch chuẩn bị SX và mốc đồng bộ tính theo giờ máy.
- Bản sao lưu từ SQL Server mới hơn không phục hồi được xuống 2019/2022: cài mới bằng migrate rồi đồng bộ lại.

<a id="cap-nhat-ban-moi-len-may-chu"></a>

## Cập nhật bản mới lên máy chủ

Dùng `deploy/deploy.cjs` (Node, chạy ở thư mục mã nguồn `F:\App\MES_VSN`, bằng tài khoản Windows chạy pm2). Web không phải dừng trong lúc cài gói, build. Thứ tự **migrate trước khi chạy code mới** vẫn giữ: code mới có thể đọc bảng, cột mà chỉ migration mới tạo; seed trong `migrate` thêm tài nguyên, quyền, menu cho màn mới; lúc khởi động backend tự chạy nạp đơn hàng BRAVO, cập nhật Nhà máy SX, làm mới Phân bổ PO, các bước này cần schema mới.

```
node deploy\deploy.cjs --root F:\App\MES-run              # git pull, build bản mới, migrate, chuyển bản
node deploy\deploy.cjs --root F:\App\MES-run --status     # bản đang chạy, các bản còn giữ, pm2, kiểm sống
node deploy\deploy.cjs --root F:\App\MES-run --rollback   # quay về bản trước (không migrate)
node deploy\deploy.cjs --root F:\App\MES-run --sync-env   # đã sửa shared\.env: chép vào bản đang chạy rồi pm2 reload
```

Tùy chọn: `--ref <commit|nhánh|tag>` (mặc định `HEAD` sau khi pull; nhánh khác: `origin/<nhánh>`), `--no-pull`, `--online-migrate`, `--replace <tên app pm2 cũ>` (chỉ khi pm2 chưa có app `mes`), `--keep <n>` (số bản đã chạy được giữ lại, mặc định 3, tối thiểu 2), `--pm2 "<lệnh>"` (mặc định `pm2`), `--yes` (không hỏi; dùng khi đã sao lưu). `--help` in đủ.

<a id="quy-trinh-theo-truong-hop"></a>

### Quy trình theo trường hợp

Máy chủ: Node.js 22, pm2 7.0.4 (bản đã diễn tập), mã nguồn ở `F:\App\MES_VSN`, thư mục triển khai `F:\App\MES-run`. Mọi lệnh chạy ở `F:\App\MES_VSN` bằng tài khoản Windows chạy pm2. Code phải được commit, push trước: script chỉ triển khai commit, file chưa commit không lên máy chủ.

| Trường hợp | Lệnh | Web |
|---|---|---|
| A. Chạy mới (lần đầu chuyển sang `deploy.cjs`, hoặc máy mới) | `node deploy\deploy.cjs --root F:\App\MES-run` | Gián đoạn một lần (dừng bản cũ, migrate, khởi động) |
| B. Sửa code, không có file migration mới | `node deploy\deploy.cjs --root F:\App\MES-run` | Không gián đoạn |
| C1. Cập nhật CSDL, cách mặc định | `node deploy\deploy.cjs --root F:\App\MES-run` | Gián đoạn trong lúc migrate và khởi động |
| C2. Cập nhật CSDL chỉ thêm bảng, thêm cột cho phép NULL hoặc có DEFAULT | `node deploy\deploy.cjs --root F:\App\MES-run --online-migrate` | Không gián đoạn |

#### A. Chạy mới

Máy chủ đang chạy MES bằng pm2 theo cách cũ (từ `F:\App\MES_VSN`):
1. Chọn lúc ngoài giờ làm việc. Sao lưu các database MES.
2. Kiểm: `node -v` (`v22.x`), `pm2 -v` (`7.0.4`), `pm2 ls` (ghi lại tên app MES đang chạy), `git -C F:\App\MES_VSN status` (không có file sửa dở).
3. `cd F:\App\MES_VSN`, `git pull --ff-only`: lần này phải pull bằng tay để có thư mục `deploy\`.
4. Tạo thư mục triển khai và cấu hình (PowerShell quản trị). Thư mục chỉ cho quản trị và tài khoản chạy pm2 đọc, vì chứa `.env`:

   ```
   New-Item -ItemType Directory F:\App\MES-run\shared
   Copy-Item F:\App\MES_VSN\backend\.env F:\App\MES-run\shared\.env
   icacls F:\App\MES-run /inheritance:r /grant:r "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" "${env:USERDOMAIN}\${env:USERNAME}:(OI)(CI)F"
   ```

   pm2 chạy bằng tài khoản khác tài khoản đang đăng nhập thì thêm tài khoản đó vào lệnh `icacls`. Bỏ qua bước chép `.env` cũng được: script hỏi chép.
5. Chạy `node deploy\deploy.cjs --root F:\App\MES-run`:
   - app cũ tên `mes`: chạy nguyên lệnh;
   - app cũ tên khác: thêm `--replace <tên app cũ>`;
   - bản cũ chạy bằng dịch vụ Windows (NSSM…): dừng, gỡ dịch vụ trước.

   Script hỏi "Đã sao lưu các database MES chưa?" (lần đầu chưa có bản để so migration nên luôn hỏi): trả lời `y`. Build mất vài phút, web cũ vẫn chạy. Sau đó script dừng app cũ, migrate, xóa app cũ, tạo app `mes` theo `ecosystem.config.cjs`, `pm2 save`. Web gián đoạn từ lúc dừng tới lúc app mới lên; script in thời gian gián đoạn.
6. Kiểm:
   - `pm2 ls`: app `mes`, mode `cluster`, `online`;
   - `node deploy\deploy.cjs --root F:\App\MES-run --status`: "theo ecosystem", kiểm sống ok;
   - mở web, đăng nhập, tải lại trang vẫn còn phiên;
   - `F:\App\MES-run\logs\mes-error.log` không có lỗi khởi động.
7. Tự chạy khi khởi động máy: script đã `pm2 save` danh sách app mới.
   - Máy chủ đang tự chạy pm2 bằng `pm2 resurrect` (Task Scheduler, pm2-installer…): giữ nguyên.
   - Cách đang dùng gọi thẳng `pm2 start F:\App\MES_VSN\…`: đổi thành `pm2 resurrect`.
   - Chưa có cách nào: tạo tác vụ chạy lúc khởi động máy bằng tài khoản chạy pm2 (gợi ý, chưa thử trên máy chủ; `/RP *` hỏi mật khẩu ngay tại máy chủ):

     ```
     schtasks /Create /TN "MES pm2 resurrect" /SC ONSTART /DELAY 0001:00 /RL HIGHEST /RU "<MÁY>\<tài khoản>" /RP * /TR "C:\Users\<tài khoản>\AppData\Roaming\npm\pm2.cmd resurrect"
     ```

   Thử bằng cách khởi động lại máy ngoài giờ, rồi kiểm như bước 6.
8. Trong `F:\App\MES_VSN`, `node_modules`, `backend\dist`, `frontend\dist`, `backend\.env` không còn dùng, xóa được.

Máy mới hoàn toàn: cài Node.js 22, Git, `npm install -g pm2@7.0.4`; chuẩn bị SQL Server, database, login ([Chuẩn bị SQL Server](#chuan-bi-sql-server)); `git clone` vào `F:\App\MES_VSN`; tạo `F:\App\MES-run\shared\.env` theo [Cài ứng dụng](#cai-ung-dung) bước 3 (thay vì chép), khóa quyền như bước 4 ở trên; rồi làm bước 5–7 (không có app cũ). Sau đó làm tiếp [Cài ứng dụng](#cai-ung-dung) bước 6–8 (kiểm kết quả migrate, tài khoản `admin`, đồng bộ lần đầu).

#### B. Sửa code (không thêm file migration)

1. Máy dev: `npm run lint`, test liên quan, `npm run build` qua; commit, push.
2. Máy chủ: `cd F:\App\MES_VSN`, `node deploy\deploy.cjs --root F:\App\MES-run`. Script không hỏi gì: pull, build (web chạy bình thường), migrate (chỉ nạp dữ liệu hệ thống: quyền, menu cho màn mới), `pm2 reload`. Web không gián đoạn.
3. Kiểm dòng cuối "Đang chạy: <commit> <tiêu đề>", mở màn có thay đổi. Người dùng tải lại trang (F5) để nhận giao diện mới.
4. Thông báo khác:
   - "Cảnh báo: bản này thêm biến môi trường…": thêm biến vào `F:\App\MES-run\shared\.env` rồi `--sync-env`;
   - "Cấu hình .env không hợp lệ…": sửa `shared\.env` rồi chạy lại, bản đang chạy không bị đụng;
   - "Bản mới … không chạy được; đã quay về …": web đang chạy bản trước, xem `logs\mes-error.log`, sửa code rồi triển khai lại;
   - lỗi phát hiện sau khi đã chuyển: `node deploy\deploy.cjs --root F:\App\MES-run --rollback`.

#### C. Cập nhật CSDL (thêm bảng, thêm cột)

1. Máy dev: thêm file migration mới `backend/migrations/<Database>/NNNN_ten.sql` (số tiếp theo, không sửa file đã chạy, quy ước ở [Quy ước code](../CODE_CONVENTIONS.md) mục 6.3), chạy thử trên bộ database test riêng ([Dữ liệu mẫu và kiểm thử](12-du-lieu-mau-va-kiem-thu.md#bo-database-test-rieng)), commit cùng code dùng bảng, cột mới, push.
2. Chọn cách chạy:

   | Migration chỉ có | Cách | Vì sao |
   |---|---|---|
   | Thêm bảng mới | C2 | Code cũ không biết bảng mới |
   | Thêm cột cho phép NULL, hoặc có DEFAULT | C2 | Code cũ đọc bằng `selectAll` chỉ nhận thêm cột rỗng; câu ghi của code cũ không nêu cột mới vẫn chạy |
   | Thêm cột NOT NULL không DEFAULT | C1 | Câu ghi của code cũ thiếu giá trị cho cột mới, lỗi trong lúc chạy chồng |
   | Đổi tên, xóa, đổi kiểu cột; xóa, đổi tên bảng; thêm ràng buộc mà dữ liệu code cũ ghi có thể vi phạm | C1 | Code cũ đọc, ghi theo cấu trúc cũ |
   | Chép, sửa dữ liệu có sẵn; điền dữ liệu vào cột mới | C1 | Code cũ có thể ghi đè; cột mới có dữ liệu thì code cũ trả ra qua `selectAll` mà chưa có chính sách cột |
   | Thêm chỉ mục trên bảng lớn | C1, ngoài giờ | Tạo chỉ mục khóa bảng tới khi xong |
   | Ghi chú "chỉ chạy cùng bản build mới" (như `MES_Core/0009`) | C1 | Bản cũ hiểu sai dữ liệu sau migration |

   Không chắc thì chọn C1.
3. Máy chủ, ngoài giờ nếu C1: chạy lệnh của C1 hoặc C2 ở bảng đầu mục. Script liệt kê file migration mới và hỏi "Đã sao lưu các database MES chưa?" ngay, trước khi build: kiểm danh sách đúng là các file định chạy, sao lưu, trả lời `y`.
   - C1: build (web chạy) → dừng app → migrate → chạy bản mới. Script in thời gian gián đoạn.
   - C2: build → migrate khi bản cũ vẫn chạy → `pm2 reload`.
4. Đọc kết quả migrate in ra: database nào chạy file nào, có cảnh báo không. Kiểm màn dùng bảng, cột mới.
5. Migrate lỗi: mỗi file chạy trong một transaction, file lỗi không để lại gì, các file chạy trước nó giữ nguyên.
   - C2: bản cũ vẫn chạy, chưa chuyển.
   - C1: backend đang dừng. Sửa migration rồi chạy lại, hoặc `pm2 start mes` để chạy lại bản cũ (thêm bảng, thêm cột cho phép NULL thì bản cũ vẫn chạy được; còn lại cân nhắc phục hồi sao lưu).
6. Quay về bản trước sau khi đã thêm bảng, cột (`--rollback`): script cảnh báo database đã chạy migration mà bản trước không có. Chỉ thêm bảng, cột cho phép NULL hoặc có DEFAULT thì trả lời `y` được; không có migration lùi, bảng, cột mới để lại.

### Thư mục triển khai

```
F:\App\MES-run\
  releases\20261013-153000\   mỗi lần triển khai một thư mục: code đúng commit, node_modules, bản build, backend\.env
  current                     junction tới bản đang chạy
  shared\.env                 bản .env duy nhất của máy chủ
  ecosystem.config.cjs        cấu hình pm2 (chép từ deploy\ của bản mới)
  logs\                       log của pm2
  deploy.lock                 chỉ có khi đang triển khai: một lần một lúc
  .mes-deploy                 đánh dấu thư mục triển khai
```

Mỗi bản có `.commit` (commit, tiêu đề; ghi ngay khi tạo thư mục), `.built` (build xong), `.activated` (đã chạy ổn định sau khi chuyển), `.assets.txt` (file code giao diện do bản đó build). Script chỉ đụng tới thư mục trong `releases` có tên theo thời điểm và có `.commit`; không làm gì với thư mục chưa có `.mes-deploy` mà đã có nội dung khác ngoài `shared`, `logs`, `tmp` (chặn gõ nhầm `--root`), cũng không nhận `--root` nằm trong hoặc chứa `F:\App\MES_VSN`.

Cách cũ (dừng pm2, `npm ci`, build, chạy lại) phải hạ web vì `npm ci` xóa `node_modules` mà tiến trình đang giữ khóa file (gói native `argon2`), còn build xóa `dist` đang phục vụ. Nay bản mới cài gói, build ở thư mục khác trong lúc bản cũ chạy; chỉ bước chuyển mới chạm tiến trình đang chạy. Mỗi bản có `node_modules` riêng (vài trăm MB).

### Việc script làm

1. Kiểm trước: không có `deploy.lock`; có `shared\.env` (chưa có thì hỏi chép từ `F:\App\MES_VSN\backend\.env`); `pm2 jlist` chạy được. `F:\App\MES-run` cho Everyone, Authenticated Users hoặc Users truy cập thì in cảnh báo kèm lệnh `icacls` thu hẹp quyền (script không tự đổi quyền vì pm2 có thể chạy bằng tài khoản khác). Chưa có app `mes` trong pm2 mà có tiến trình khác trả lời ở `HOST:PORT` thì dừng ngay, trước khi build (xem [Quy trình theo trường hợp](#quy-trinh-theo-truong-hop), A).
2. `git fetch` rồi `git merge --ff-only @{upstream}` (trừ `--no-pull`). Không dùng `git pull`: trên Windows tiến trình `git pull` còn giữ file pack trong lúc gc tự động của `git merge` con xóa pack cũ, git hỏi `Unlink of file ... Should I try again?` mãi (sự cố 21/10/2026). Lấy mã làm đổi chính script triển khai (`deploy\*.cjs`) thì chạy lại bằng bản mới (với `--no-pull`). `--ref` là nhánh cục bộ chậm hơn nhánh nó theo dõi thì hỏi lại (chỉ nhánh đang checkout được cập nhật; muốn bản mới nhất của nhánh khác thì `--ref origin/<nhánh>`). In nhánh đang checkout và commit sẽ triển khai.
3. Chép đúng nội dung commit ra `releases\<thời điểm>` qua index tạm của git: không đổi `HEAD`, index hay file trong `F:\App\MES_VSN`; file chưa commit không lên máy chủ. Bản đang chạy đã là commit đó thì hỏi có triển khai lại không. Chép `shared\.env` vào `backend\.env` của bản mới; bản mới thêm biến vào `backend/.env.example` mà `shared\.env` chưa có thì in cảnh báo (không dừng).
4. So file migration với bản đang chạy. Có file mới (hoặc chưa có bản nào chạy theo cách này để so) thì hỏi "Đã sao lưu các database MES chưa?" **trước khi build**. Không đồng ý, bấm Ctrl+C, hoặc chạy không có bàn phím mà thiếu `--yes`: dừng, xóa thư mục bản mới.
5. `npm ci --include=dev --prefer-offline`, `npm run build` trong bản mới, rồi kiểm trước khi chuyển: có `frontend\dist\index.html`, và nạp `backend\dist\config\env.js` với `.env` vừa chép (bắt lỗi cấu hình như cờ sai dạng, thiếu `JWT_SECRET` khi `production`, mà không chạy app). Lỗi thì xóa bản mới; bản cũ không bị đụng. Có file migration mới thì chạy thêm `npm run migrate -- --check` (bản cũ vẫn chạy): mọi database đã có hoặc tạo được, đã được cấp quyền; thiếu database mà tài khoản không tạo được (ví dụ `MES_Cutting` lần đầu) thì dừng ở đây, chưa migrate gì, bản cũ vẫn chạy.
6. Chép file code giao diện của bản đang chạy (`frontend\dist\assets` do chính nó build, danh sách ở `.assets.txt`) sang bản mới, bỏ qua file trùng: tab trình duyệt mở từ trước vẫn mở được màn chưa mở. Chỉ giữ một thế hệ; tab cũ hơn thì giao diện tự tải lại trang khi thiếu file ([Giao diện](10-giao-dien.md), mục Nạp lười).
7. Migrate bằng `npm run migrate` của bản mới (luôn chạy, vì seed):
   - không có file migration mới: migrate khi bản cũ vẫn chạy, rồi `pm2 reload`. **Web không gián đoạn**;
   - có file migration mới: `pm2 stop` bản cũ → migrate → chuyển → `pm2 restart`. Web gián đoạn trong lúc migrate và khởi động (diễn tập với migrate rỗng, pm2 gọi qua `npx`: khoảng 20 giây). Script in thời gian gián đoạn;
   - `--online-migrate`: có file mới vẫn migrate khi bản cũ còn chạy rồi reload. Chỉ dùng cho migration nằm trong bảng chọn ở [Quy trình theo trường hợp](#quy-trinh-theo-truong-hop), C (thêm bảng, thêm cột cho phép NULL hoặc có DEFAULT);
   - migrate lỗi: không chuyển bản. Nhánh không dừng thì bản cũ vẫn chạy. Nhánh có dừng thì backend đang dừng: sửa nguyên nhân rồi chạy lại, hoặc phục hồi sao lưu rồi `pm2 start mes` để chạy bản cũ. Đọc kết quả migrate như khi cài: database nào chạy file nào, có cảnh báo synonym hay "Cảnh báo: admin chưa…" không.
8. Chuyển: chép `ecosystem.config.cjs` của bản mới ra `F:\App\MES-run`, trỏ junction `current` sang bản mới (chỉ gỡ liên kết, không bao giờ xóa thư mục thật; `current` là thư mục thật thì dừng), `pm2 reload` hoặc `restart`. App `mes` chưa có hoặc đang chạy kiểu cũ (không cluster, script không qua `current`): xóa app cũ, `pm2 start ecosystem.config.cjs`, `pm2 save`.
9. Chờ `/api/v1/health` (theo `HOST`, `PORT` của `shared\.env`, đọc như `dotenv`) trả ok, tối đa 60 giây, rồi chờ thêm 5 giây xem pm2 có phải chạy lại tiến trình không. Ổn định thì ghi `.activated`, in commit đang chạy. Không ổn định (pm2 chạy lại tiến trình là báo ngay, không chờ hết giờ):
   - nhánh không dừng bản cũ (không có migration mới) và bản trước đã từng chạy được: **tự quay về** bản trước (chép `shared\.env`, trỏ `current`, `pm2 restart`), báo lỗi kèm tên hai bản. Lúc `pm2 reload` bản mới chết, pm2 vẫn để tiến trình cũ phục vụ tới hết `listen_timeout` (60 giây) rồi mới tắt; diễn tập với bản lỗi lúc khởi động: web hạ khoảng 13 giây;
   - nhánh có migration mới, hoặc lần đầu: báo lỗi kèm việc cần làm (database đã migrate nên không tự quay về).
   Lỗi ở bất kỳ bước nào sau khi đã dừng bản cũ hoặc đã trỏ `current` thì thông báo nói rõ backend đang dừng hay `current` đang trỏ đâu, kèm lệnh xử lý tiếp.
10. Dọn: giữ `--keep` bản đã chạy được mới nhất, luôn giữ bản vừa làm, bản đang chạy và bản vừa chạy trước đó; bản build lỗi hoặc build xong mà chưa từng chạy được thì xóa.

Giới hạn khi reload:
- `pm2 reload` tắt **cứng** tiến trình cũ ngay khi tiến trình mới nghe cổng: pm2 chỉ báo tắt qua tin nhắn với `stop`, `restart`, `delete` (đã đọc mã pm2 7.0.4). Request tiến trình cũ đang xử lý đúng lúc đó (thường vài phần nghìn giây) bị cắt, người dùng bấm lại; transaction chưa commit được SQL Server rollback. Diễn tập: gọi `/api/v1/health` 10 lần mỗi giây suốt ba lần triển khai bằng reload (4.177 lần), không lần nào lỗi.
- Đợt đồng bộ, nạp đơn hàng đang chạy ở tiến trình cũ bị cắt giữa chừng (rollback); tiến trình mới dọn lần chạy mồ côi và chạy lại các việc lúc khởi động. Nên triển khai lúc không có ai bấm Đồng bộ.
- Hai tiến trình chạy chồng vài giây: các việc lúc khởi động (nạp BRAVO, Nhà máy SX theo OSM, làm mới Phân bổ PO, thêm ĐVCS) khóa bằng `sp_getapplock` nên không chạy chồng; dọn lần đồng bộ mồ côi dựa vào khóa session nên không đánh lỗi oan lần tiến trình cũ đang chạy.

Sau khi chuyển: xem `F:\App\MES-run\logs\mes-error.log`, đăng nhập thử màn có thay đổi. Người dùng tải lại trang để nhận giao diện mới. Quyền đổi do seed (phiên bản quyền tăng) có hiệu lực ở request kế tiếp, không cần đăng nhập lại; `JWT_SECRET` không đổi nên phiên cũ vẫn dùng được.

Màn mới: seed cấp quyền theo ma trận cho vai trò mẫu và Toàn quyền (quyền vừa tạo). Vai trò người dùng tự tạo không nhận quyền mới: quản trị cấp ở Quản trị › Phân quyền.

### Quay về bản trước, đổi biến môi trường

- `--rollback`: về bản **đã từng chạy được** (`.activated`) gần nhất trước bản đang chạy, bỏ qua bản build xong mà chưa chạy được; không migrate. Bản đích nhận `shared\.env` hiện hành (cấu hình đổi bằng `--sync-env` sau khi nó chạy vẫn giữ), được kiểm cấu hình như bước 5, rồi trỏ `current`, `pm2 reload`. Bản đang chạy có file migration mà bản đích không có thì cảnh báo và hỏi lại: không có migration lùi, bản trước có thể chạy sai với database hiện tại (cần thì phục hồi sao lưu). Chỉ quay được về bản còn giữ.
- Đổi biến môi trường: sửa `F:\App\MES-run\shared\.env` rồi `--sync-env`: chép vào `backend\.env` của bản đang chạy, kiểm cấu hình như bước 5 (sai thì giữ cấu hình cũ, không khởi động lại), `pm2 reload`, kiểm sống như bước 9; không ổn định thì trả lại cấu hình cũ, `pm2 restart`, báo lỗi (`shared\.env` vẫn là bản mới: sửa lại). Không sửa `current\backend\.env` trực tiếp: lần triển khai sau chép đè từ `shared`.
- `--sync-env` không chạy migrate. Đổi biến nguồn đồng bộ (`DB_TRUNGGIAN_*`, `DB_OSM_*`) thì synonym chỉ đổi theo sau khi migrate ([Migrate](#migrate), mục Synonym nguồn đồng bộ), nên chạy `node deploy\deploy.cjs --root F:\App\MES-run --no-pull` thay cho `--sync-env` (cùng commit đang chạy thì trả lời `y` khi script hỏi "Vẫn triển khai lại?"): script build lại bản đó, chạy `npm run migrate` rồi `pm2 reload` (`deploy/deploy.cjs`).

### Thứ tự bắt buộc với chuyền may

Chuyền là bộ phận tích "Xưởng sản xuất" ở `MES_Hr`:
- `MES_Hr/0002_department_production_workshop.sql` và `MES_Core/0009_line_scope_by_code.sql` phải chạy **trước** khi khởi động bản build đọc chuyền từ `MES_Hr`. Thiếu `0002` thì nguồn chuyền (`HrLineSource`) lỗi SQL: ô chọn chuyền, Xếp chuyền, Phân bổ màu cỡ, Kế hoạch chuẩn bị SX, danh mục phạm vi và mọi request của người có phạm vi chuyền trả 500.
- `MES_Core/0009` chỉ chạy cùng bản build đó, khi backend đã dừng: bản build cũ coi chiều không có `OrgType` là chiều giá trị chung, nhận mọi mã đã lưu mà không kiểm mã còn là chuyền đang dùng. `0009` chạy trong một transaction; phép gán nào sẽ mất hết phạm vi chuyền thì dừng (`THROW 50091`), không đổi gì.
- `deploy.cjs` chạy `npm run migrate` không tham số (chạy cả hai) và tự dừng bản cũ vì đây là file migration mới. **Không** dùng `--online-migrate` cho bản này.
- Chuyền của danh mục cũ không tự chép sang bộ phận: dữ liệu đã xếp vào chuyền cũ còn mã, hiện "(chuyền cũ)", `check:softkeys` báo mồ côi; Trưởng chuyền được giao chuyền cũ không thấy chuyền nào tới khi có bộ phận cùng mã hoặc được gán lại. Tích "Xưởng sản xuất", gán phạm vi chuyền cần người có `admin.permission:update` ([Nhân sự](08-nhan-su.md)).

<a id="xu-ly-su-co-thuong-gap"></a>

## Xử lý sự cố thường gặp

| Hiện tượng, thông báo | Nguyên nhân | Cách xử lý |
|---|---|---|
| `JWT_SECRET là bắt buộc ở môi trường production.` hoặc `… phải dài ít nhất 32 ký tự …` (cả khi chạy `migrate`, `seed`, `npm test`) | `.env` có `NODE_ENV=production` | Đặt `JWT_SECRET` ≥ 32 ký tự trong `.env` |
| `SEED_SAMPLE_DATA chỉ nhận true hoặc false …` (tương tự `BRAVO_ORDER_IMPORT`, `OSM_FACTORY_UPDATE`, `PO_ALLOCATION_REFRESH`) | Giá trị cờ khác `true`/`false` | Sửa thành `true`, `false` hoặc để trống |
| `PO_ALLOCATION_MAX_SHRINK_PERCENT chỉ nhận số nguyên từ 0 đến 100 …` | Giá trị ngưỡng sai dạng | Sửa thành số nguyên 0–100 hoặc để trống (20) |
| Màn Phân bổ PO cảnh báo "Dữ liệu OSM chưa được làm mới" | Lần làm mới gần nhất gặp bảng chép OSM rỗng, nên bỏ qua, lưới vẫn là dữ liệu lần trước | Kiểm lần đồng bộ nguồn `OSM.OSMData` (Quản trị › Đồng bộ dữ liệu, `F:\App\MES-run\logs\mes-out.log`, `mes-error.log`) rồi đồng bộ lại |
| Màn Phân bổ PO cảnh báo "Dữ liệu OSM có thể chưa khớp": giữ lại N dòng không còn trong OSM; "OSM có N dòng; lần làm mới đủ gần nhất có M dòng" | Bảng chép OSM ít hơn mốc (số dòng nguồn của lần làm mới đủ gần nhất) quá `PO_ALLOCATION_MAX_SHRINK_PERCENT` (mặc định 20%): bước làm mới vẫn thêm, sửa nhưng không xóa dòng vắng; lưới có thể có cả dòng cũ lẫn dòng mới của cùng PO. Mốc không đổi tới lần làm mới đủ | Kiểm OSM trước. OSM tạm thiếu dữ liệu rồi trở lại cỡ cũ: đồng bộ lại là đủ, lần làm mới sau tự làm đủ và dọn dòng vắng. OSM thật sự bớt nhiều PO (không có cờ "cho qua một lần"): đặt `PO_ALLOCATION_MAX_SHRINK_PERCENT=100` trong `F:\App\MES-run\shared\.env`, chạy `node deploy\deploy.cjs --root F:\App\MES-run --sync-env`, đồng bộ lại nguồn `OSM.OSMData`; lần làm đủ đó đặt mốc mới. Xong thì trả biến về giá trị cũ (để trống là 20) rồi `--sync-env` lần nữa, để chốt còn tác dụng ở các lần sau. Cách xử lý này chỉ hiện trên màn cho người có `admin.sync:update` |
| `Thiếu DEMO_PASSWORD …`, `DEMO_PASSWORD phải dài ít nhất 8 ký tự …` | Thiếu mật khẩu ban đầu | Đặt `DEMO_PASSWORD` trong `.env` |
| `Chưa có database X và tài khoản trong .env không tạo được …` | Login không có quyền tạo database | Quản trị CSDL tạo database, cấp `db_owner`, chạy lại `npm run migrate` |
| `Đã tạo bảng xong nhưng nạp dữ liệu hệ thống lỗi …` | Seed lỗi sau migrate | Sửa nguyên nhân trong thông báo, chạy `npm run seed -- --sync-matrix` |
| `Cảnh báo: admin chưa có vai trò ADMIN …` / `… chưa được gán nhà máy nào` | Seed lần đầu lỗi giữa chừng | Lần cài đầu: `npm run seed -- --sync-matrix`. Cố ý đổi thì bỏ qua |
| Migrate in `chưa có DB_TRUNGGIAN_NAME …` hoặc `không thấy linked server …` | Thiếu hoặc sai biến nguồn đồng bộ, linked server chưa tạo, chưa bật Data Access | Sửa `.env` hoặc linked server, chạy lại `npm run migrate` ([Đồng bộ](09-dong-bo.md)) |
| Không kết nối được SQL Server, `DB_HOST` dạng `MAY\SQLEXPRESS` | Code không truyền tên instance | Đặt cổng TCP tĩnh cho instance, `DB_HOST=MAY`, `DB_PORT=<cổng>` |
| Backend dừng: `Chưa có giao diện đã build ở …` | Chạy `--serve-web` khi chưa build frontend | `npm run build` |
| `deploy.cjs`: `Đang có lần triển khai khác (…deploy.lock…)` | Lần triển khai khác đang chạy, hoặc lần trước bị tắt ngang (đóng cửa sổ) | Chắc không còn lần nào chạy thì xóa `F:\App\MES-run\deploy.lock`, chạy lại |
| `deploy.cjs`: `Có tiến trình đang trả lời ở … mà pm2 chưa có app "mes"` | Backend cũ chạy bằng app pm2 tên khác hoặc dịch vụ Windows | `--replace <tên app pm2 cũ>`, hoặc dừng dịch vụ ([Quy trình theo trường hợp](#quy-trinh-theo-truong-hop), A) |
| `deploy.cjs`: `Chưa sao lưu: dừng, chưa đụng tới bản đang chạy.` | Bản mới có file migration mới mà trả lời không, hoặc chạy không có bàn phím (lịch, script) thiếu `--yes` | Sao lưu các database MES rồi chạy lại |
| `deploy.cjs`: `… đã có nội dung (…) mà không phải thư mục triển khai (thiếu .mes-deploy)` | `--root` trỏ vào thư mục đang dùng cho việc khác (gõ nhầm) | Kiểm `--root`. Lần đầu dùng thư mục mới, trống, hoặc chỉ có `shared\.env` |
| `deploy.cjs` dừng ở bước `Kiểm database`: `Chưa có database … và tài khoản trong .env không tạo được` hoặc `… chưa được cấp quyền vào database …` | Bản mới có database mới (ví dụ `MES_Cutting`, phase 5.14) mà login ứng dụng không có quyền `CREATE DATABASE`, hoặc chưa được cấp quyền | Bản cũ vẫn chạy, chưa migrate gì. Nhờ quản trị CSDL tạo database (cùng collation với `MES_Core`), cấp `db_owner`, rồi chạy lại |
| `deploy.cjs`: `Cấu hình .env không hợp lệ với bản này: …` | `shared\.env` sai với bản mới (cờ sai dạng, thiếu biến bắt buộc…); bắt ở bước kiểm trước khi chuyển | Sửa `shared\.env` theo lỗi rồi chạy lại. Bản đang chạy không bị đụng (`--sync-env`: giữ cấu hình cũ) |
| `deploy.cjs`: `Bản mới … không chạy được; đã quay về …` | Bản mới chết lúc khởi động; script đã tự quay về bản trước | Xem `F:\App\MES-run\logs\mes-error.log`, sửa code rồi triển khai lại. Bản lỗi bị dọn ở lần sau |
| `deploy.cjs`: `Bản đang trỏ tới chưa chạy ổn định (…)` | Bản mới không lên ở nhánh có migration mới hoặc lần đầu (không tự quay về), hoặc quay về cũng không lên | Làm theo dòng hướng dẫn kèm theo (backend đang dừng hay `current` đang trỏ đâu); xem `logs\mes-error.log`; `--rollback` khi database còn hợp với bản trước |
| `deploy.cjs`: `Cảnh báo: … cho Everyone, Authenticated Users, Users truy cập …` | Thư mục triển khai kế thừa quyền của ổ đĩa | Chạy lệnh `icacls` script in ra (PowerShell quản trị), thêm tài khoản chạy pm2 nếu khác |
| `deploy.cjs`: `… là thư mục thật, không phải junction` | Có người tạo hoặc chép thư mục `current` bằng tay | Đổi tên thư mục đó, chạy lại; script chỉ gỡ junction, không xóa thư mục thật |
| `deploy.cjs`: `Cảnh báo: pm2 không lưu đường dẫn qua junction …` | Bản pm2 lưu đường dẫn thật (`releases\…`) thay vì `current\…`: lần reload sau sẽ chạy lại bản cũ (pm2 7.0.4 lưu đúng) | `pm2 delete mes`, chạy lại `deploy.cjs`; vẫn bị thì nâng pm2 |
| Sau khi triển khai, mở một màn thì trang tự tải lại | Tab mở từ trước hai lần triển khai, file code của màn đã bị dọn | Bình thường: trang tải bản mới. Tải lại rồi vẫn báo lỗi tải màn (giao diện không tải lại lần hai trong 10 giây) thì kiểm `frontend\dist\assets` của bản đang chạy, `logs\mes-error.log` |
| Tải lại trang thì mất phiên; 15 phút phải đăng nhập lại | Chạy HTTP mà `COOKIE_SECURE` đang bật (mặc định khi `production`) | `COOKIE_SECURE=false` tới khi có HTTPS |
| Đăng nhập đúng mật khẩu vẫn bị từ chối (423) | Khóa tạm sau `LOGIN_MAX_FAILED` lần sai | Chờ `LOGIN_LOCK_MINUTES`, hoặc quản trị mở khóa ở Quản trị › Người dùng › Sửa thông tin › Mở khóa. Máy demo: `npm run seed -- --reset-passwords` (đặt lại mật khẩu, mở khóa tài khoản mẫu) |
| Điện thoại không mở được địa chỉ LAN | Khác mạng, tường lửa, hoặc `HOST=127.0.0.1` | Cùng Wi-Fi, mở cổng tường lửa, `HOST` để trống hoặc `0.0.0.0` |
| `DB_HOST=… không phải SQL Server trên máy này …` | `reset:demo`, `load:bravo`, `sim:board` với database máy khác | Kiểm `.env`. Chắc chắn là database demo thì thêm `--allow-remote-db` |
| `Không chạy … khi NODE_ENV=production.` / `Máy này không dùng dữ liệu mẫu (SEED_SAMPLE_DATA=false) …` | Script dữ liệu demo trên máy dùng thật | Đúng thiết kế, không chạy trên máy này |
| `reset:demo`: `Database MES_Hr đã tạo nhưng chưa chạy migration.` | Database trống | `npm run migrate` rồi chạy lại |
| `load:bravo`: `Bảng chép BRAVO trong MES_Sync chưa có dữ liệu …` | Chưa đồng bộ nguồn đơn hàng | Đồng bộ ở Quản trị › Đồng bộ dữ liệu rồi chạy lại |
| Seed cảnh báo `Chưa có database MES_Sewing …` / `… MES_Hr …` | Database chưa tạo hoặc chưa migrate | Tạo, migrate rồi seed lại |
| Đổi quyền xong màn chưa đổi | Giao diện nạp lại quyền ở request kế tiếp | Tải lại trang; backend đã kiểm quyền mới ngay |
| Sau khi cập nhật code, chính sách cột mẫu mới chưa có trên máy demo | Seed không ghi đè, chỉ thêm cho vai trò, cột mới | `npm run reset:demo -- --yes` hoặc `npm run seed -- --sync-matrix` |
| Trang trắng sau khi sửa code (bản demo) | `frontend/dist` cũ | `npm run demo` (build lại) |
| `sync-gen` ra file hỏng chữ tiếng Việt | Dùng `> file` trong PowerShell 5.1 | Dùng `--out <file>` |
