# Giao diện (frontend)

Khung frontend và mọi phần dùng chung: công nghệ, cấu trúc `frontend/src`, khởi động, route, phiên đăng nhập phía trình duyệt, layout và menu động, đổi ĐVCS, phản chiếu quyền, gọi API, thành phần và tiện ích dùng chung, theme, quy tắc UI/UX, quy tắc hiệu năng, đo hiệu năng, test.
Đọc trước khi dựng hoặc sửa bất kỳ màn hình nào. Nội dung nghiệp vụ của từng màn nằm ở tài liệu module (`05`–`09`, `15`); cơ chế quyền phía máy chủ ở [Phân quyền](04-phan-quyen.md).

## 1. Công nghệ

| Gói | Phiên bản (`frontend/package.json`) | Dùng để |
|---|---|---|
| `react`, `react-dom` | `^19.3.0` | Giao diện; `StrictMode` bật ở `main.tsx` |
| `typescript` | `~6.0.3` | `strict: true` (`frontend/tsconfig.json`) |
| `vite` + `@vitejs/plugin-react` | `^8.3.4` (Rolldown), `^6.1.2` | Dev server, build |
| `@mantine/core`, `hooks`, `form`, `dates`, `modals`, `notifications`, `spotlight` | `^9.7.1` | Thành phần giao diện, form, popup, thông báo, tìm màn hình (Ctrl+K), ô ngày (ADR 0003) |
| `@tabler/icons-react` | `^3.49.0` | Biểu tượng, import theo tên từng icon |
| `@tanstack/react-query` | `^5.104.1` | Dữ liệu từ máy chủ |
| `zustand` | `^5.0.15` | Store phiên |
| `react-router-dom` | `^7.18.4` | Route (`BrowserRouter`) |
| `react-datasheet-grid` | `4.11.6` (khóa cứng) | Lưới nhập kiểu bảng tính, bọc trong `SheetGrid` (ADR 0008). `package.json` gốc có `overrides` buộc `react-resize-detector` dùng `react`/`react-dom` `^19.0.0`; nâng React thì chạy `npm ls react react-dom` để chắc chỉ còn một bản. Gói này còn import `findDOMNode` (React 19 đã bỏ) nhưng chỉ trong nhánh thành phần lớp mà lưới không dùng; bản build production đã kiểm (ADR 0008) |
| `dayjs` | `^1.11.23` | Locale `vi` cho `@mantine/dates` |
| `@fontsource/source-sans-3`, `@fontsource/jetbrains-mono` | `^5.3.0` | Font tự host, không cần Internet |
| `@fontsource/inter` | `^5.3.0` | Font riêng màn đăng nhập (quyết định 12.4), import trong `LoginPage.tsx`, chỉ bộ Latin và tiếng Việt |
| `mantine-datatable` | `^9.4.0` | Có trong `dependencies` nhưng không file nào import. Lưới xem là `DataGrid` tự dựng |
| `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` | `^5.0.3`, `^16.3.3`, `^7.0.1`, `^29.1.1` | Test |
| `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks` | `^10.12.0`, `^8.71.1`, `^7.1.1` | Lint |

- **PWA:** chỉ có `frontend/public/manifest.webmanifest` (tên "MES Vietsun", tên ngắn "MES", `display: standalone`, `theme_color` và `background_color` `#ffffff`, `lang: vi`, một biểu tượng `icon-192.png` 192×192) và `<link rel="manifest">` trong `frontend/index.html`. Chưa có service worker, chưa chạy offline.
- `frontend/index.html`: `lang="vi"`, `viewport-fit=cover` (chừa vạch Home của iPhone cho thanh menu ở đáy), hai thẻ `theme-color` theo `prefers-color-scheme` (`#ffffff` khi sáng, `#151c24` khi tối, cùng màu thanh trên `--app-topbar`), biểu tượng tab `/icon-192.png`, `<meta name="description">`.
- Frontend không dùng biến môi trường (`import.meta.env`). Gốc API cố định `/api/v1` (`frontend/src/lib/api.ts`). Số phiên bản đưa vào lúc build bằng `define` của Vite (mục 2, Cấu hình).

## 2. Cấu trúc `frontend/src`

| Thư mục, file | Nội dung |
|---|---|
| `main.tsx` | Nạp CSS theo thứ tự, tải trước code của màn theo URL, dựng `App` |
| `App.tsx` | Provider và cây route gốc |
| `routes/` | `registry.tsx`: bảng đường dẫn → màn, nạp lười. `FallbackRoute.tsx`: quyết định mở màn, trang giữ chỗ, 403, 404 |
| `shell/` | `AppLayout.tsx` (khung), `BranchSwitcher.tsx` (đổi ĐVCS), `guards.tsx`, `Can.tsx`, `permissions.ts` (`useCan`, `flattenLeaves`, `MODULE_PREFIXES`), `menuIcons.ts` |
| `store/` | `session.ts` (store Zustand của phiên), `auth.ts` (đăng nhập, chọn/đổi ĐVCS, khôi phục phiên, đăng xuất) |
| `lib/` | Gọi API, React Query, định dạng, tham số URL, hộp xác nhận, chặn rời màn, tự phục hồi khi thiếu file code của màn, tính ngày theo lịch làm việc… (mục 10) |
| `components/` | Thành phần dùng chung (mục 9) |
| `features/<nhóm>/` | Màn hình: `auth`, `home`, `errors`, `module` (trang giữ chỗ), `order`, `sewing`, `cutting`, `hr`, `admin` |
| `theme/` | `theme.ts` (theme Mantine), `global.css` (token màu, CSS khung và thành phần) |
| `test/` | Test Vitest và `setup.ts` |
| `perf/` | Phép đo hiệu năng, chạy riêng |
| `env.d.ts` | Khai kiểu hằng `__APP_VERSION__` (Vite thay lúc build, xem Cấu hình) |
| `modules/` | Chỉ có `.gitkeep`, không dùng (màn hình nằm ở `features/`) |

Quy ước trong `features/<nhóm>/` (bố cục file chung: [Quy ước code](../CODE_CONVENTIONS.md) mục 2.2):
- Mỗi màn một file `XxxPage.tsx` với `export default` (bảng nạp lười cần default export).
- `api.ts`: kiểu dữ liệu API của nhóm; nhóm `hr` có thêm các hook `useQuery` và bảng khóa `HR_KEYS`. Nhóm có nhiều kiểu thì thêm `types.ts` (`admin`, `hr`).
- Luật tính thuần (không React) nằm ở file riêng để test không cần dựng màn: `features/order/cutRatioRules.ts`, `colorSizeRules.ts`, `linePlanRules.ts`, `scheduleDates.ts`; `features/cutting/cuttingProgressRules.ts`, `cuttingSupplyRules.ts`; `features/sewing/sewingPlanRules.ts`.
- `common.tsx`: phần dùng chung trong nhóm, ví dụ `features/order/common.tsx` (`usePagedList`, `OrderFilters`, `useCanWrite`, `useOriginLock`, `useLines`, `loadError`, `StatusBadge`, `ExportButton`, `EmptyState`), `features/admin/common.tsx` (`FilterBar`, `IconAction`, `escapeToClose`, `LoadError`, `SkeletonRows`, `EmptyRow`), `features/hr/common.tsx` (`useStoredSize`, `Splitter`, `FieldCell`, `WorkshopBadge`: dấu bộ phận là chuyền may, chữ "Xưởng sản xuất" kèm biểu tượng kim chỉ như menu May, không chỉ bằng màu; giải thích bằng `title`, không dùng Tooltip vì lặp trên mọi dòng cây; bản `short` "Xưởng SX" cho dòng cây).
- Kiểu dữ liệu API viết tay ở frontend (`lib/types.ts`, `features/*/api.ts`, `features/*/types.ts`); chưa có gói `shared` với backend.
- Có import chéo giữa các nhóm:
  - `features/admin/CatalogsPage.tsx` dùng `../hr/api`, `../hr/tree`, `../sewing/api`; `features/admin/PrepStepsPane.tsx` dùng `../sewing/api`;
  - màn Cắt (`features/cutting/CuttingProgressPage.tsx`, `CuttingSupplyPage.tsx`) và Kế hoạch may (`features/sewing/SewingPlanPage.tsx`) dùng `../order/common` (`usePagedList`, `useCanWrite`, `useLines`, `loadError`, `EmptyState`, `ExportButton`…); `CuttingSupplyPage.tsx` dùng thêm `../order/api` (`emptyFilter`, `OrderFilter`). `features/order/common.tsx`, `features/order/api.ts` vì vậy là thư viện dùng chung trên thực tế ([Kiến trúc](../ARCHITECTURE.md) mục 5.3, 10).
- Lint frontend không có luật ranh giới import.

### Cấu hình

| File | Nội dung chính |
|---|---|
| `frontend/vite.config.ts` | Dev cổng 5173, `host: true`, proxy `/api` → `http://localhost:3000` để frontend và API cùng origin (cookie refresh `SameSite=Strict` chạy được). `define: { __APP_VERSION__ }` lấy `version` của `frontend/package.json`, hiện ở chân màn đăng nhập ("Version …"); kiểu khai ở `src/env.d.ts`. Build tách hai chunk thư viện: `vendor-react` (react, react-dom, scheduler, react-router) và `vendor-query` (TanStack Query, zustand), để sửa code ứng dụng không làm đổi tên file thư viện đã lưu trong trình duyệt. Không gom JS của Mantine, không tách CSS của Mantine (mục 13). Phần `test`: `jsdom`, `setupFiles: ['./src/test/setup.ts']`, `testTimeout` 15 giây, `css: false` |
| `frontend/vitest.perf.config.ts` | Kế thừa `vite.config.ts`; chỉ chạy `src/perf/**/*.perf.tsx`, tuần tự (`fileParallelism: false`), `testTimeout` 120 giây, không ẩn console |
| `frontend/eslint.config.js` | `@eslint/js` và `typescript-eslint` bản recommended; `react-hooks/rules-of-hooks` (error), `react-hooks/exhaustive-deps` (warn), `@typescript-eslint/no-unused-vars` (error, bỏ qua tham số bắt đầu bằng `_`). Lệnh `lint` chạy `--max-warnings 0` nên cảnh báo cũng làm hỏng lint |
| `frontend/tsconfig.json` | `strict`, `moduleResolution: bundler`, `jsx: react-jsx`, `noEmit`; `types` gồm `vite/client`, `vitest/globals`, `@testing-library/jest-dom`; `include` gồm `src` và `vite.config.ts` |

Lệnh trong `frontend/package.json`: `dev` (Vite), `build` (`tsc --noEmit && vite build`, ra `frontend/dist`), `lint` (`eslint src --max-warnings 0`), `test` (`vitest run --passWithNoTests`), `perf`. Từ thư mục gốc: `npm run dev:frontend`, `npm run lint`, `npm test`, `npm run build`. Cài đặt, chạy bản build qua backend: [Vận hành](11-van-hanh.md).

## 3. Khởi động

`frontend/src/main.tsx`:
1. Import CSS theo đúng thứ tự: font (Source Sans 3 các nét 400, 600, 700, 800; JetBrains Mono 400, 600) → `@mantine/core/styles.css` → `@mantine/notifications/styles.css` → `@mantine/spotlight/styles.css` → `@mantine/dates/styles.css` → `theme/global.css`. `global.css` phải đứng cuối để ghi đè được CSS của Mantine.
2. `preloadPage(window.location.pathname)`: mở thẳng một màn (F5, link) thì tải code của màn song song với khôi phục phiên và nạp quyền.
3. Dựng `<App />` trong `StrictMode`.

`frontend/src/App.tsx`:
- Thứ tự provider: `MantineProvider` (`theme`, `defaultColorScheme="auto"`) → `DatesProvider` (locale `vi`, tuần bắt đầu thứ Hai) → `QueryClientProvider` → `ModalsProvider` (nhãn "Đồng ý", "Hủy") → `Notifications` (góc trên phải) và `BrowserRouter`. `QueryClientProvider` nằm ngoài `ModalsProvider` để nội dung popup mở bằng `modals.*` dùng được `useQuery`.
- `useEffect` gọi `bootstrap()` một lần (mục 5.3).

## 4. Route

### 4.1 Cây route

| Đường dẫn | Bọc bởi | Hiện |
|---|---|---|
| `/login` | `AnonymousOnly` | `LoginPage` (`features/auth/LoginPage.tsx`) |
| `/select-branch` | – | Chuyển về `/` (link cũ; chọn ĐVCS nay nằm ở màn đăng nhập) |
| `/` | `RequireReady` → `AppLayout` | `HomePage` (`features/home/HomePage.tsx`) |
| `*` | `RequireReady` → `AppLayout` | `FallbackRoute` |

Guard (`shell/guards.tsx`) đọc `status` của store phiên:

| `status` | `RequireReady` | `AnonymousOnly` |
|---|---|---|
| `booting` | Loader toàn màn | Loader toàn màn |
| `anonymous`, `preauth` | Chuyển `/login` | Hiện màn đăng nhập |
| `ready` | Hiện nội dung | Chuyển `/` |

### 4.2 Nạp lười và quyết định mở màn

- `routes/registry.tsx`:
  - `loaders`: đường dẫn → `() => import('../features/...')`.
  - `pages`: bản `React.lazy` của từng loader, bọc `withChunkRecovery` (`lib/chunkReload.ts`). Không tải được file code của màn (tab mở từ trước khi triển khai bản mới, file cũ đã bị thay; nhận theo thông điệp lỗi tải module của Chrome, Edge, Firefox, Safari và lỗi tải CSS của Vite):
    - mất mạng (`navigator.onLine` là false): chờ sự kiện `online` rồi tải lại code của màn, màn hiện vòng chờ;
    - `GET /api/v1/health` trả ok: tải lại trang một lần để nhận bản mới; không tải lại lần hai trong 10 giây (mốc ở `sessionStorage` khóa `mes.chunkReloadAt`, không đọc được thì cũng không tải lại);
    - máy chủ không trả lời trong 5 giây (đang dừng để migrate) hoặc lỗi khác (bug khi chạy code của màn): ném lỗi cho `PageErrorBoundary`. Nút "Thử lại" ở đó không tải lại được code (`React.lazy` nhớ lỗi), nút "Tải lại trang" thì được.
    Phía máy chủ: [Vận hành › Cập nhật bản mới](11-van-hanh.md#cap-nhat-ban-moi-len-may-chu).
  - `preloadPage(path)`: gọi loader trước mà chưa vẽ, lỗi tải bị nuốt (để `React.lazy` báo khi màn thật sự mở; không tải lại trang khi chỉ rê chuột). Gọi lúc khởi động và khi rê chuột hoặc Tab tới nút nhóm ở thanh bên, tab menu con, ô màn hình ở Trang chủ.
- `routes/FallbackRoute.tsx`, xét theo thứ tự:
  1. Đường dẫn cũ trong `MOVED` (`/sewing/prep` → `/order/prep`): chuyển, giữ query string.
  2. Đường dẫn là một mục lá của menu phiên: có trong `pages` thì vẽ trong `Suspense` (Loader khi đang tải code); chưa đăng ký thì `ModulePage` (trang giữ chỗ).
  3. Đường dẫn bắt đầu bằng một tiền tố trong `MODULE_PREFIXES` (`/order`, `/cutting`, `/sewing`, `/finishing`, `/qms`, `/hr`, `/report`, `/admin`) mà không có trong menu: `ForbiddenPage` (403).
  4. Còn lại: `NotFoundPage` (404).
- So khớp chính xác `pathname === path`; không có route con, không có tham số trên path. Trạng thái của màn (trang, sắp xếp, lọc, dòng chọn) nằm ở query string (mục 10).
- Frontend không giữ bảng quyền theo route: vào được màn hay không chỉ dựa vào menu máy chủ trả (máy chủ đã lọc theo quyền xem). Máy chủ vẫn kiểm quyền ở từng API.

### 4.3 Bảng màn hình

Tên màn là tên menu do seed đặt (`backend/scripts/seed-data.ts`, mảng `resources`).

| Đường dẫn | Màn | File | Tài liệu |
|---|---|---|---|
| `/order/info` | Thông tin đơn hàng | `features/order/SalesOrderPage.tsx` | [Đơn hàng](06-don-hang.md) |
| `/order/po-allocation` | Phân bổ PO | `features/order/PoAllocationPage.tsx` | [Đơn hàng](06-don-hang.md) |
| `/order/shipment` | Kế hoạch xuất hàng | `features/order/ShipmentPage.tsx` | [Đơn hàng](06-don-hang.md) |
| `/order/cut-ratio` | Cập nhật tỷ lệ cắt | `features/order/CutRatioPage.tsx` | [Đơn hàng](06-don-hang.md) |
| `/order/line-plan` | Xếp chuyền | `features/order/LinePlanPage.tsx` (bảng dàn chuyền `LineBoard.tsx`) | [Đơn hàng](06-don-hang.md) |
| `/order/color-size` | Phân bổ màu cỡ | `features/order/ColorSizePage.tsx` | [Đơn hàng](06-don-hang.md) |
| `/order/prep` | Kế hoạch chuẩn bị SX (nhóm Quản trị đơn hàng, dữ liệu module May, ADR 0009) | `features/sewing/PrepPlanPage.tsx` | [May](07-may.md) |
| `/cutting/progress` | Đồng bộ tiến độ cắt | `features/cutting/CuttingProgressPage.tsx` | [Cắt](15-cat.md) |
| `/cutting/supply` | Xác nhận cấp BTP | `features/cutting/CuttingSupplyPage.tsx` | [Cắt](15-cat.md) |
| `/sewing/plan` | Kế hoạch may | `features/sewing/SewingPlanPage.tsx` | [May](07-may.md) |
| `/hr/org-chart` | Sơ đồ tổ chức | `features/hr/OrgChartPage.tsx` | [Nhân sự](08-nhan-su.md) |
| `/hr/employees` | Thông tin nhân sự | `features/hr/EmployeesPage.tsx` | [Nhân sự](08-nhan-su.md) |
| `/admin/users` | Người dùng | `features/admin/UsersPage.tsx` (`UserAccessDrawer.tsx`, `UserBranchesDialog.tsx`) | [Quản trị hệ thống](05-quan-tri-he-thong.md) |
| `/admin/roles` | Vai trò | `features/admin/RolesPage.tsx` | [Quản trị hệ thống](05-quan-tri-he-thong.md) |
| `/admin/permissions` | Phân quyền | `features/admin/PermissionsPage.tsx` | [Quản trị hệ thống](05-quan-tri-he-thong.md) |
| `/admin/field-policies` | Chính sách cột | `features/admin/FieldPoliciesPage.tsx` | [Quản trị hệ thống](05-quan-tri-he-thong.md) |
| `/admin/branches` | Đơn vị cơ sở | `features/admin/BranchesPage.tsx` | [Quản trị hệ thống](05-quan-tri-he-thong.md) |
| `/admin/catalogs` | Danh mục hệ thống (khung Cấu hình chuẩn bị SX là `PrepStepsPane.tsx`, khung Lịch làm việc là `WorkCalendarPane.tsx`) | `features/admin/CatalogsPage.tsx` | [Quản trị hệ thống](05-quan-tri-he-thong.md), [May](07-may.md) |
| `/admin/audit` | Nhật ký hệ thống | `features/admin/AuditPage.tsx` | [Quản trị hệ thống](05-quan-tri-he-thong.md) |
| `/admin/sync` | Đồng bộ dữ liệu | `features/admin/SyncPage.tsx` | [Đồng bộ](09-dong-bo.md) |

Các mục menu còn lại chưa đăng ký trong `routes/registry.tsx`, mở ra `ModulePage`: `/cutting/embroidery` (Quản lý in thêu), `/sewing/cluster` (Phân cụm trưởng), `/sewing/output` (Bấm năng suất cụm), `/sewing/balance` (Biểu đồ cân bằng chuyền) và mọi mục của nhóm `qms` (Quản trị chất lượng), `finishing` (Quản trị hoàn thiện), `report` (Báo cáo quản trị). Danh sách đầy đủ: [Tổng quan](../PROJECT_OVERVIEW.md) mục 2.2.

### 4.4 Thêm một màn mới

1. Máy chủ: tài nguyên, quyền `module.resource:action`, mục menu (đường dẫn, nhóm) trong DB, khai ở seed `backend/scripts/seed-data.ts` (mảng `groups`, `resources`), xem [Phân quyền](04-phan-quyen.md) và [Quản trị hệ thống](05-quan-tri-he-thong.md). Mã menu lá theo quy ước `menu.<mã tài nguyên>`.
2. Tạo `features/<nhóm>/XxxPage.tsx` (default export), dựng bằng `WorkPage` + `DataGrid` hoặc `SheetGrid`.
3. Thêm một dòng vào `loaders` của `routes/registry.tsx` với đúng đường dẫn menu.
4. Module mới: thêm tiền tố vào `MODULE_PREFIXES` (`shell/permissions.ts`) để đường dẫn không được phép báo 403 thay vì 404. Nhóm menu có biểu tượng mới: thêm vào `shell/menuIcons.ts`.
5. Viết test trong `frontend/src/test/`.

## 5. Phiên đăng nhập phía trình duyệt

Phía máy chủ (token, cookie, thu hồi phiên, `A00`, ĐVCS được gán): [Phân quyền](04-phan-quyen.md). Mục này chỉ nói trình duyệt làm gì.

### 5.1 Store phiên (`store/session.ts`)

Store Zustand `useSession`, chỉ nằm trong bộ nhớ (không lưu `localStorage`). Quyền, menu trong store chỉ để ẩn hiện.

| Trường | Ý nghĩa |
|---|---|
| `status` | `booting` (đang khôi phục), `anonymous`, `preauth` (đã qua mật khẩu, có token tạm, chưa chọn ĐVCS), `ready` |
| `accessToken` | Access token đang dùng |
| `preAuthToken` | Token tạm của bước chọn ĐVCS |
| `choices` | ĐVCS tài khoản được chọn, trả về lúc đăng nhập |
| `pendingName`, `pendingUserId` | Họ tên, id người vừa qua bước mật khẩu (lời chào, chọn sẵn ĐVCS lần trước) |
| `notice` | Lý do phiên vừa kết thúc, hiện ở màn đăng nhập |
| `user`, `branch`, `roles` | Từ `GET /me`; `branch.isAggregate` là đơn vị tổng hợp `A00` |
| `productionFactories` | Nhà máy SX thuộc ĐVCS của phiên (từ `GET /me`) |
| `menu` | Cây menu từ `GET /me/menu` |
| `permissions` | `Set` mã quyền từ `GET /me/permissions` |
| `permissionVersion`, `permissionStamp` | Phiên bản quyền; `permissionStamp` dùng để so với header `X-Permission-Version` |
| `fieldPolicies` | Mức từng cột theo tài nguyên, từ `GET /me/field-policies` |
| `switchCount` | Số lần người dùng tự đổi ĐVCS trong phiên (mục 6.4) |
| `set(patch)`, `reset(status, notice)` | Ghi một phần; xóa về rỗng |

### 5.2 Token và dữ liệu lưu trên trình duyệt

- Access token và token tạm chỉ ở store. Tải lại trang là mất; phiên khôi phục bằng cookie refresh.
- Cookie refresh `mes_rt` do máy chủ đặt (`HttpOnly`, `SameSite=Strict`, path `/api/v1/auth`), JavaScript không đọc được. Mọi request gửi `credentials: 'include'`.
- Mật khẩu không do ứng dụng lưu. Khi người dùng tích "Ghi nhớ đăng nhập", màn đăng nhập xin trình duyệt lưu qua `navigator.credentials.store(new PasswordCredential(...))` (Chrome, Edge); trình duyệt khác tự hỏi theo cách riêng.
- `localStorage` chỉ giữ tiện ích của người xem. Mọi lần đọc, ghi bọc `try/catch`: chế độ riêng tư, bị chặn lưu trữ thì dùng giá trị mặc định.

| Khóa | Nội dung | Nơi ghi |
|---|---|---|
| `mes.username` | Tên đăng nhập đã nhớ | `features/auth/LoginPage.tsx` |
| `mes.branch.<userId>` | ĐVCS người này làm việc lần trước trên máy này (theo từng người vì máy trong xưởng dùng chung) | `store/auth.ts` |
| `mes.nav.collapsed` | Thanh bên đang rút gọn | `shell/AppLayout.tsx` |
| `mes.grid.widths:<label hoặc widthKey>` | Độ rộng cột đã kéo của một lưới | `components/DataGrid.tsx` |
| `hr.orgchart.side`, `hr.employees.side`, `hr.employees.tree` | Kích thước khung ở màn Nhân sự | `features/hr/common.tsx` (`useStoredSize`) |
| Khóa mặc định của Mantine | Chế độ sáng/tối | `MantineProvider` |

### 5.3 Khôi phục phiên khi mở trang

`bootstrap()` (`store/auth.ts`):
1. `refreshSession()` gọi `POST /auth/refresh` bằng cookie.
2. Thành công thì `loadAccess()`: gọi song song `/me`, `/me/menu`, `/me/permissions`, `/me/field-policies`, ghi vào store một lần với `status = 'ready'`. Kết quả về muộn mà phiên đã đăng xuất hoặc đã đổi sang ĐVCS khác thì bỏ.
3. Hỏng ở bước nào cũng `reset('anonymous')`.

### 5.4 Màn đăng nhập một form

`features/auth/LoginPage.tsx`, không có trang chọn ĐVCS riêng.
1. **Nhập tên, mật khẩu** (ô "Tài khoản", "Mật khẩu"). Tên đã nhớ thì điền sẵn, con trỏ vào thẳng ô mật khẩu. Lúc bấm gửi, form đọc lại giá trị đang nằm trong ô (`FormData`), vì mật khẩu trình duyệt tự điền có lúc chưa báo cho React. "Quên mật khẩu?" chỉ mở Popover hướng dẫn liên hệ quản trị viên (chưa có tự đặt lại mật khẩu).
2. **Gửi.** `login()` gọi `POST /auth/login` (không gửi token, không tự làm mới) rồi ghi store: `status = 'preauth'`, token tạm, danh sách ĐVCS, tên, id.
3. **Ghi nhớ đăng nhập.** Có tích: lưu tên vào `mes.username` và xin trình duyệt lưu mật khẩu. Bỏ tích: xóa tên đã nhớ; mật khẩu trình duyệt đã lưu trước đó vẫn còn.
4. **Theo số ĐVCS được gán:**
   - 0: về `anonymous`, báo "Tài khoản chưa có đơn vị cơ sở".
   - 1: vào thẳng (`selectBranch`).
   - Nhiều hơn 1: hai ô trên khóa lại (ô Tài khoản kèm dấu tích xanh; ô mật khẩu xóa giá trị, chỉ hiện dấu che), ô chọn "Đơn vị cơ sở" mở ra ngay dưới. Chọn sẵn ĐVCS lần trước của đúng người này nếu vẫn được vào. `A00` có biểu tượng con mắt và dòng "Xem mọi đơn vị, chỉ đọc". Ô có tìm kiếm khi trên 6 lựa chọn. Hai nút "Vào làm việc" và "Đăng nhập tài khoản khác" (gọi `logout()` để thu hồi cookie nếu máy chủ đã cấp).
5. **Lỗi:**
   - `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED` (kèm giờ mở khóa từ `details.until`), `VALIDATION_FAILED`, lỗi mạng: câu riêng. Mã khác: thông điệp máy chủ trả.
   - Lỗi 401 khi chọn ĐVCS (token tạm hết hạn, mật khẩu vừa đổi, tài khoản bị khóa): `endSession(...)` về bước mật khẩu, tên vẫn giữ trên form. `TOKEN_EXPIRED` báo "Phiên đăng nhập đã hết hạn", mã khác hiện câu của máy chủ.
6. `notice` của store (bị đẩy ra, đăng xuất chưa báo được máy chủ) hiện thành Alert màu cam.

### 5.5 Chọn và đổi ĐVCS (`selectBranch`)

`selectBranch(branch, applied?)` (`store/auth.ts`), dùng ở màn đăng nhập và ở `BranchSwitcher`. Client gửi mã ĐVCS muốn chọn; máy chủ kiểm tài khoản có được gán ĐVCS đó và cấp token mang `BranchCode`.
1. Đang `ready`: hủy các truy vấn đang chạy (`queryClient.cancelQueries()`); phần còn lại chạy trong `duringBranchSwitch` (mục 8.2).
2. `POST /auth/select-branch` với `{ branchCode }`. Lúc `preauth` dùng token tạm và không tự làm mới; lúc `ready` dùng token hiện tại, tự làm mới nếu hết hạn.
3. Nạp `/me`, menu, quyền, chính sách cột bằng access token mới (chưa ghi store). Xong mới `queryClient.clear()` và ghi store một lần, kèm `switchCount + 1`: màn đang mở không bị vẽ lại theo quyền của ĐVCS cũ.
4. Lưu `mes.branch.<userId>`, gọi `applied()` ngay trong cùng lần đổi phiên; trả `true`.
5. Lỗi khi nạp quyền:
   - đang `ready`: `endSession("Đã chuyển sang … nhưng chưa tải được menu và quyền… Hãy đăng nhập lại.")`, vì máy chủ đã chuyển phiên;
   - đang `preauth`: gọi `/auth/logout` để thu hồi cookie vừa cấp (máy dùng chung), rồi ném lỗi để màn đăng nhập báo.
6. Đăng xuất xảy ra giữa chừng: gọi `/auth/logout` lần nữa (cookie lúc này là của phiên mới) và trả `false`.

### 5.6 Quyền đổi trên máy chủ

Mọi response có header `X-Permission-Version`. `lib/api.ts` chuyển giá trị cho hàm đăng ký ở `store/auth.ts`: khác `permissionStamp` đang giữ (và không đang đổi ĐVCS, không đang nạp) thì `loadAccess()` rồi `queryClient.invalidateQueries()`. Menu, quyền, chính sách cột và dữ liệu đang hiện tự cập nhật, không phải đăng nhập lại.

### 5.7 Đăng xuất và kết thúc phiên

- `logout()` (`store/auth.ts`): `POST /auth/logout` không kèm token (máy chủ nhận phiên qua cookie, nên vẫn thu hồi được khi access token đã hết hạn) → `queryClient.clear()` → `reset('anonymous')`. Mạng lỗi thì vẫn xóa phía trình duyệt và để `notice` nhắc đóng trình duyệt nếu là máy dùng chung.
- Menu tài khoản › Đăng xuất đi qua `guardedLeave` (hỏi lại nếu còn thay đổi chưa lưu) rồi về `/login`.
- `endSession(notice)` (`lib/api.ts`): xóa bộ đệm truy vấn, `reset('anonymous', notice)`, gọi `/auth/logout` không chờ. Dùng khi phiên kết thúc ngoài ý người dùng (mục 8.2).

## 6. Khung ứng dụng

### 6.1 Bố cục (`shell/AppLayout.tsx`)

Kích thước, màu theo `theme/global.css` (khối "Khung ứng dụng"); hướng thiết kế: [Quyết định](13-quyet-dinh.md) mục 12.3.

- **Thanh trên** (`header.topbar`, cao 64px, chạy hết chiều ngang, nền sáng `--app-topbar`, viền dưới mảnh), từ trái sang:
  - logo (`BrandMark` cao 50px, về Trang chủ) trong ô rộng 240px bằng thanh bên để logo thẳng cột với menu;
  - nhãn "MES - VSN" (`.brand-chip`: viên cam, chữ đen, biểu tượng nhà máy);
  - nút ĐVCS (`BranchSwitcher`, mục 6.4);
  - ô tìm màn hình (chữ "Tìm màn hình theo tên, ví dụ: "Xếp chuyền"", phím `Ctrl K`) mở Spotlight;
  - hai nút sáng, tối (chế độ đang dùng có nền cam nhạt, `aria-pressed`);
  - menu tài khoản ("Xin chào" và họ tên; mở ra: họ tên, vai trò, "Đổi đơn vị cơ sở", "Đăng xuất").
- **Thanh bên** (`nav.rail`, nằm dưới thanh trên, rộng 240px, rút gọn còn 78px, nhớ ở `mes.nav.collapsed`, nền xám than `--app-nav`): không có logo; một nút cho mỗi nhóm menu (mở màn đầu tiên của nhóm), mũi tên ">" chỉ để trang trí. Nhóm đang mở có nền `--app-subnav`, vạch cam bên trái, biểu tượng cam. Nhóm có biểu tượng `settings` (Quản trị) nằm cuối thanh, các nhóm nghiệp vụ ở trên. Nút tròn rút gọn, mở rộng nằm trên mép phải thanh bên; khi rút gọn chỉ còn biểu tượng, rê chuột hoặc Tab tới thì ô dài ra và tên hiện dưới biểu tượng.
- **Dải menu con** (`nav.tabbar`, cao 48px, nền `--app-tabbar`): tên nhóm đang mở và các màn lá của nhóm; tab đang mở chữ cam đậm `--brand-ink` và vạch cam dưới. Đang ở Trang chủ hoặc trang không thuộc nhóm nào thì một tab "Trang chủ". Màn hẹp: dải cuộn ngang, tự đưa tab đang mở vào tầm nhìn.
- **Vùng nội dung** `main#main` (`.app-main`): một thẻ trắng (`--app-surface`, viền, bo 12px) trên nền xám `--app-bg`, cuộn bên trong thẻ; bọc `PageErrorBoundary`.
- **Bàn phím:** lối tắt "Bỏ qua tới nội dung chính" (ẩn tới khi Tab tới); Spotlight (`@mantine/spotlight`, phím `mod + K`) liệt kê Trang chủ và mọi màn lá, mô tả là tên nhóm.
- **Tên tab trình duyệt:** "<tên màn> – MES Vietsun", "Trang chủ – MES Vietsun", màn đăng nhập "Đăng nhập – MES Vietsun".
- **Màn hẹp, điện thoại** (`global.css`):
  - ≤1280px: ô logo co theo logo, không còn rộng bằng thanh bên;
  - ≤1100px: nút tài khoản chỉ còn biểu tượng người dùng;
  - ≤960px: ô tìm thành nút biểu tượng;
  - ≤767px: thanh bên thành thanh nút ở đáy màn hình (54px cộng vùng an toàn), ẩn nhãn, mũi tên, nút rút gọn; thanh trên 52px, logo đầy đủ đổi sang hình mặt trời (cao 34px), ẩn vạch ngăn và biểu tượng của nhãn "MES - VSN"; chỉ còn nút chuyển sang chế độ màu kia; dải menu con 44px; vùng nội dung bỏ khung thẻ; ô nhập và nút cao 40px;
  - ≤400px: bỏ nhãn "MES - VSN", dòng chữ phụ và biểu tượng của nút ĐVCS, để nút tài khoản (có Đăng xuất) luôn nhìn thấy.

### 6.2 Menu động

- Menu là `MenuNode[]` (`code`, `name`, `icon`, `path`, `isMobile`, `children`) từ `GET /me/menu`. Máy chủ đã lọc: mục lá hiện khi có `<tài nguyên>:view`, nhóm hiện khi còn ít nhất một con. Frontend không lọc thêm.
- `flattenLeaves(menu)` (`shell/permissions.ts`) lấy các mục lá có `path` của menu hai tầng (nhóm → màn), kèm nhóm cha. Dùng cho thanh bên, dải tab, Spotlight, Trang chủ và `FallbackRoute`.
- `resourceOf(menuCode)` bỏ tiền tố `menu.` (`menu.order.po` → `order.po`); chỉ `ModulePage` dùng để tra quyền.
- Biểu tượng: máy chủ trả tên, `shell/menuIcons.ts` ánh xạ sang Tabler; tên lạ dùng `IconPoint`.

| Tên trong DB | Biểu tượng | Nhóm dùng (seed) |
|---|---|---|
| `clipboard-list` | `IconClipboardList` | Quản trị đơn hàng |
| `scissors` | `IconScissors` | Quản trị nhà cắt |
| `needle-thread` | `IconNeedleThread` | Quản trị xưởng may |
| `shield-check` | `IconShieldCheck` | Quản trị chất lượng |
| `package` | `IconPackage` | Quản trị hoàn thiện |
| `users` | `IconUsers` | Quản trị nhân sự |
| `chart-bar` | `IconChartBar` | Báo cáo quản trị |
| `settings` | `IconSettings` | Quản trị (đặt cuối thanh bên) |
| `factory` | `IconBuildingFactory2` | Chưa nhóm nào dùng |

### 6.3 Rời màn từ khung

Mọi lối rời màn của khung (logo, nút nhóm, tab, Spotlight, đổi ĐVCS, đăng xuất) đi qua `guardedLeave` (mục 10.2). Chọn lại chính màn đang mở thì không làm gì. Ctrl, Shift, Alt, Meta + bấm hoặc nút chuột giữa vẫn mở tab mới như liên kết thường.

### 6.4 Đổi ĐVCS ở thanh trên (`shell/BranchSwitcher.tsx`)

- Nút ghi "Đơn vị cơ sở <mã>" (hoặc "Tổng hợp, chỉ đọc") và tên ĐVCS. Bấm mở danh sách thả xuống ngay tại chỗ (Combobox), chia nhóm "Tổng hợp" và "Đơn vị cơ sở"; ĐVCS đang làm việc có dấu tích. Danh sách tải mới mỗi lần mở bằng `useBranchChoices` (`lib/branches.ts`, `GET /me/branches`, `staleTime` 30 giây), có trạng thái đang tải, lỗi kèm "Thử lại", rỗng.
- Menu tài khoản › "Đổi đơn vị cơ sở" mở cùng danh sách (đợi menu đóng xong mới đặt focus vào nút ĐVCS).
- Chọn ĐVCS khác: `guardedLeave` → `selectBranch`. Trong `applied`:
  - màn đang mở có trong menu mới (hoặc là Trang chủ): ở lại đường dẫn đó nhưng bỏ query string (bộ lọc của ĐVCS cũ);
  - không có: về `/`;
  - điều hướng mang `state.branchSwitch = switchCount`.
- `AppLayout` giữ `shown` (lần đổi đang hiển thị). `switchCount` đã tăng mà điều hướng tương ứng chưa tới: hiện Loader thay cho màn cũ. Điều hướng tới: `<Outlet key={shown} />` dựng màn từ đầu. `PageErrorBoundary` đặt lại theo `pathname|shown`.
- Thành công: thông báo "Đã chuyển đơn vị cơ sở" (`A00`: "Bạn đang xem tổng hợp mọi đơn vị cơ sở, chỉ đọc."). Lỗi: thông báo lỗi, trừ khi phiên đã kết thúc (lý do hiện ở màn đăng nhập).
- **Tab khác đổi ĐVCS** (cookie refresh dùng chung giữa các tab): `switchCount` không tăng, màn không dựng lại, phần đang nhập còn nguyên; request đầu tiên phát hiện việc đổi bị chặn bằng `BRANCH_CHANGED` (mục 8.2). Sau đó phiên đã ở ĐVCS mới, nên màn có phần nháp gắn với dữ liệu của ĐVCS (Id dòng, nháp trên lưới) phải tự bỏ nháp khi `branch` đổi và báo bằng thông báo không tự đóng `toastWarn(..., true)`, như `features/sewing/PrepPlanPage.tsx`.

### 6.5 Trang chủ, trang giữ chỗ, trang lỗi

- `features/home/HomePage.tsx`: lời chào theo giờ, vai trò, ĐVCS; ở `A00` có Alert "chỉ đọc". Các màn được dùng xếp theo nhóm menu: màn đã có nội dung lên trước, ghi "Dùng được"; màn giữ chỗ ghi "Đã phân quyền, chờ tài liệu nghiệp vụ"; màn dùng trên điện thoại (`isMobile`) ghi thêm. Nhắc Ctrl + K.
- `features/module/ModulePage.tsx`: màn có trong menu nhưng chưa dựng. Hiện năm hành động Xem, Thêm, Sửa, Xóa, Xuất file và người dùng có hành động nào (`<tài nguyên>:<hành động>`); ở `A00` chỉ Xem, Xuất file có thể bật.
- `features/errors/ErrorPages.tsx`:
  - `ForbiddenPage` (403), `NotFoundPage` (404), mỗi trang có nút về Trang chủ.
  - `PageErrorBoundary`: một màn lỗi khi vẽ thì chỉ màn đó báo lỗi, có Thử lại, Tải lại trang, Về trang chủ; menu và thanh trên vẫn dùng được. Đổi màn thì tự thử vẽ lại.

## 7. Phản chiếu quyền

Frontend chỉ ẩn, hiện, khóa để người dùng thấy đúng những gì mình được làm. Máy chủ là nơi cưỡng chế: ẩn nút không thay cho kiểm quyền ở API, và mọi giá trị gửi lên vẫn bị máy chủ kiểm (CLAUDE.md mục 4). Cơ chế quyền, chính sách cột, phạm vi, `A00`: [Phân quyền](04-phan-quyen.md).

| Công cụ | File | Dùng khi |
|---|---|---|
| `useCan(code)` | `shell/permissions.ts` | Kiểm một quyền `module.resource:action` có trong `permissions` của phiên |
| `<Can permission fallback>` | `shell/Can.tsx` | Bọc phần giao diện chỉ hiện khi có quyền |
| `useCanWrite(code)` | `features/order/common.tsx` | Có quyền và phiên không phải `A00` (tổng hợp chỉ đọc) |
| `useOriginLock(what)` | `features/order/common.tsx` | Đơn hàng, PO dùng chung toàn công ty nhưng chỉ ghi ở ĐVCS nguồn: trả lý do khóa nút ghi khi dòng thuộc ĐVCS khác (ADR 0013) |
| `useFieldPolicy(resource)` | `lib/fieldPolicy.ts` | Mức từng cột của tài nguyên: `level(f)`, `visible(f)`, `editable(f)`, danh sách `hidden`, `masked`, `readonly`. Cột không khai báo là `EDITABLE` |
| `MASK` (`'***'`), kiểu `Masked<T>`, `LEVEL_LABEL` | `lib/fieldPolicy.ts` | Giá trị bị Che do máy chủ trả; nhãn tiếng Việt của bốn mức |
| `onlyEditable(policy, body)` | `lib/fieldPolicy.ts` | Bỏ trường không được sửa khỏi body (hiện chưa màn nào dùng) |
| Prop `policy` của `DataGrid` | `components/DataGrid.tsx` | Bỏ cột Ẩn; ô `***` vẽ bằng `Masked`; tiêu đề cột Chỉ đọc có khóa nhỏ; cột Che không sắp xếp, không lọc theo cột |
| `PolicyHint` | `components/PolicyHint.tsx` | Chip "N cột ẩn, N cột che, N cột chỉ đọc" mở danh sách cột bị giới hạn |
| `WorkPage` | `components/WorkPage.tsx` | Tự hiện dòng nhắc chế độ tổng hợp `A00` |
| `ActionButton` với `blockedReason` | `components/ActionButton.tsx` | Nút bị khóa nói rõ lý do (thiếu quyền, `A00`, ĐVCS khác, chưa chọn dòng…) |

- Cột bị Ẩn không có trong dữ liệu máy chủ trả; cột bị Che đã là `***`. `fmtNum`, `fmtMoney` giữ nguyên `***` và trả chuỗi rỗng cho giá trị không phải số (không ra `NaN`); `sumOf` trả `null` khi có ô Che hoặc thiếu, để không hiện một tổng sai.
- Ô bị Che trông khác hẳn dữ liệu thật (nền gạch chéo nhạt, biểu tượng khóa), rê chuột thấy "Bị che theo phân quyền của bạn".

## 8. Gọi API

### 8.1 `lib/api.ts`

- `api<T>(path, opts)`: `fetch('/api/v1' + path)` với `credentials: 'include'`, `Authorization: Bearer <accessToken>` khi có token, body JSON khi có `body`. Tùy chọn:
  - `method`: `GET` (mặc định), `POST`, `PUT`, `DELETE`;
  - `body`;
  - `token`: ghi đè token (token tạm khi chọn ĐVCS); `null` là không gửi;
  - `noRefresh`: không tự làm mới khi 401 (dùng cho login, logout, select-branch lúc `preauth`).
- Kết quả: 204 trả `undefined`; còn lại đọc chữ của body rồi `JSON.parse` (body rỗng là `null`).
  - Lỗi đọc vỏ `{ error: { code, message, details }, traceId }` của máy chủ thành `ApiError(status, code, message, details)`. Body là JSON nhưng thiếu vỏ, hoặc body rỗng: `code = 'ERROR'`, câu "Có lỗi xảy ra. Vui lòng thử lại.".
  - Body không phải JSON (ví dụ proxy trả trang HTML khi 502): `JSON.parse` ném `SyntaxError`, không phải `ApiError`, nên `toastError` báo "Không kết nối được máy chủ. Thử lại sau." dù máy chủ có trả lời. Đây là lỗi đã biết: [Trạng thái](../current/STATUS.md) mục 8.1.
  - Lỗi mạng là `TypeError` của `fetch`, không phải `ApiError`.
- `download(path, fallbackName)`: tải file máy chủ sinh (CSV xuất theo chính sách cột), cùng cách xử lý phiên như `api()`; tên file lấy từ `Content-Disposition`. Lỗi mà body không đọc được JSON thì `ApiError` mã `ERROR`, câu "Không tải được file. Thử lại sau.".
- `api()` không nhận `AbortSignal`: lật trang nhanh thì request cũ vẫn chạy tới cuối.

### 8.2 Xử lý phiên trong mỗi request

Hàm nội bộ `sendAuthed` dùng chung cho `api()` và `download()`.

| Tình huống | Xử lý |
|---|---|
| 401 trong lúc chính tab này đang đổi ĐVCS (`duringBranchSwitch`) | Chờ đổi xong, ném `ApiError(409, 'BRANCH_SWITCHED')` "Bạn vừa đổi đơn vị cơ sở nên thao tác này chưa được gửi…". Không làm mới phiên |
| 401, phiên `ready`, không `noRefresh`, không ghi đè token | `refreshSession()`: một lời gọi `POST /auth/refresh` dùng chung khi nhiều request cùng hết hạn |
| Làm mới ra ĐVCS khác ĐVCS đang hiển thị (tab khác đã đổi) | Xóa bộ đệm, nạp lại menu và quyền (`onBranchChanged`), **không gửi lại** request (nó được tạo khi màn còn ở ĐVCS cũ), ném `ApiError(409, 'BRANCH_CHANGED')` "Phiên đã chuyển sang … từ một tab khác…" |
| Làm mới được | Gửi lại request một lần với token mới |
| Làm mới hỏng, hoặc gửi lại vẫn 401 | `endSession('Phiên đăng nhập đã kết thúc. Hãy đăng nhập lại.')` |
| 403 `BRANCH_NOT_ALLOWED` khi phiên `ready` | `endSession(...)`: ĐVCS đang làm việc không còn được cấp hoặc đã tạm tắt |
| Có header `X-Permission-Version` | Báo cho `store/auth.ts` (mục 5.6) |
| 403 khác (`PERMISSION_DENIED`, `AGGREGATE_READ_ONLY`, `SCOPE_DENIED`, `FIELD_READONLY`…), 4xx, 5xx | Ném `ApiError` cho màn tự hiển thị |

`BRANCH_SWITCHED` và `BRANCH_CHANGED` do frontend tự tạo; máy chủ không trả hai mã này. Mã lỗi của máy chủ: [Phân quyền](04-phan-quyen.md) và `backend/src/common/app.exception.ts`.

### 8.3 Hiển thị lỗi và thông báo

- `lib/notify.ts`:
  - `toastOk(message, title = 'Đã lưu')`;
  - `toastWarn(message, title, sticky)`: màu cam, tự đóng sau 8 giây, `sticky` thì không tự đóng (dùng khi phần người dùng vừa nhập đã mất mà họ không bấm gì);
  - `toastError(e, title)`: màu đỏ, 10 giây. `ApiError` hiện thông điệp máy chủ, thêm cách xử lý cho `FIELD_READONLY`, `SCOPE_DENIED`; lỗi khác "Không kết nối được máy chủ. Thử lại sau.".
- Lỗi tải của lưới: truyền chữ vào `error` và hàm vào `onRetry` của `DataGrid`. Helper theo nhóm: `loadError(e, fallback)` (`features/order/common.tsx`, màn Cắt, Kế hoạch may cũng dùng), `LoadError` (`features/admin/common.tsx`, `features/hr/common.tsx`), `loadErrorText` (`features/admin/common.tsx`).

### 8.4 React Query

- Một `queryClient` (`lib/queryClient.ts`): `retry: false`, `refetchOnWindowFocus: false`, `staleTime` 15 giây. Xóa sạch (`clear()`) khi đăng xuất, kết thúc phiên, đổi ĐVCS, hoặc làm mới phiên ra ĐVCS khác: người sau, ĐVCS sau không thấy dữ liệu cũ.
- Khóa truy vấn bắt đầu bằng tên nhóm: `['order', …]`, `['sewing', …]`, `['admin', …]`, `['hr', …]` (bảng `HR_KEYS` ở `features/hr/api.ts`), `['me', …]` (`['me', 'branches']`, `['me', 'branch-names']`, `['me', 'lines', branch]`), `['column-values', …]` (popup lọc).
  - Dữ liệu theo ĐVCS đưa mã ĐVCS vào khóa, ví dụ `usePagedList`: `['order', key, branch, page, sort, params]`.
  - Dữ liệu dùng chung toàn công ty (Nhân sự) không kèm ĐVCS.
- Khóa dùng ở nhiều nhóm đặt ở `lib/queryKeys.ts`: `ORDER_OPTIONS_KEY = ['order-options']` (gợi ý của ô lọc Đơn hàng: khách hàng, season, loại, đơn vị, nhà máy SX). Khóa này không nằm dưới `['order']` để lưu kế hoạch, dàn chuyền, tỷ lệ cắt không làm mới nó; chỉ ghi đơn hàng và sửa danh mục mới làm mới. Khóa dùng chung khác: `PREP_STEPS_KEY` (`features/admin/PrepStepsPane.tsx`).
- Lật trang, đổi lọc: `placeholderData: keepPreviousData`, lưới giữ dữ liệu cũ (mờ đi, có vạch chạy) thay vì nháy trống.
- Sau khi lưu trong popup: đóng popup rồi mới làm mới, bằng `useAfterClose` (mục 10); chỉ làm mới khóa bị ảnh hưởng, không cả nhóm.
- Các chỗ code còn lệch quy tắc khóa truy vấn ở mục này: [Trạng thái](../current/STATUS.md) mục 6 (N7).

## 9. Thành phần dùng chung (`components/`)

| Thành phần | Dùng khi |
|---|---|
| `DataGrid` | Lưới xem dữ liệu của màn nghiệp vụ |
| `ColumnFilterButton`, `ColumnFilterNote` | Lọc theo giá trị của cột (mũi tên trên tiêu đề), dòng nhắc "Lọc theo cột: …" |
| `SheetGrid` | Lưới nhập kiểu bảng tính |
| `TreeSelect` | Ô chọn một giá trị, danh sách là cây nhóm (chuyền theo bộ phận cha, ĐVCS) |
| `DebouncedTextInput`, `DebouncedAutocomplete` | Ô tìm, ô lọc chữ |
| `DateField` | Ô ngày dd/mm/yyyy |
| `WorkPage` | Khung màn nghiệp vụ |
| `PageHeader`, `PageTitle` | Tiêu đề màn quản trị; tiêu đề có chú thích |
| `Pager` | Chân bảng, phân trang |
| `ActionButton` | Nút có thể bị khóa kèm lý do |
| `PolicyHint` | Báo cột bị giới hạn theo chính sách cột |
| `useBranchName`, `withBranchNames`, `BranchName` | Hiện tên chi nhánh thay mã ĐVCS |
| `BrandMark` | Logo Vietsun |

### 9.1 `DataGrid` – lưới xem

`components/DataGrid.tsx`. Tiêu đề dính, cuộn dọc và ngang trong khung, cột STT, chọn dòng, đúp chuột mở chi tiết, chọn nhiều dòng, sắp xếp, lọc theo cột, kéo độ rộng cột, phản chiếu chính sách cột. Màn quản trị (Người dùng, Nhật ký, Đơn vị cơ sở, Danh mục…) dùng bảng HTML `.dense-table` trong `.table-frame`, không dùng `DataGrid`.

Cột (`Column<T>`):

| Thuộc tính | Ý nghĩa |
|---|---|
| `key`, `title` | Trường của dòng; tiêu đề |
| `field` | Mã cột trong chính sách cột, mặc định bằng `key`; `null` là cột không theo chính sách |
| `width`, `minWidth`, `maxWidth` | Bề rộng; `maxWidth`: chữ dài cắt kèm "…", rê chuột xem đủ |
| `align` | Mặc định phải cho `number`, `money`, trái cho còn lại |
| `format` | `text`, `number`, `money` (2 số lẻ), `date`, `datetime`, `code` (chữ mono) |
| `sortKey` | Tham số sắp xếp gửi máy chủ; không có thì cột không sắp xếp |
| `filterKey`, `filterLabel` | Trường lọc theo giá trị (phải có trong danh sách trắng của máy chủ, ADR 0011); chữ hiện của một giá trị trong popup |
| `group` | Tiêu đề nhóm tầng trên; các cột kề nhau cùng nhóm chung một ô |
| `render(row)` | Vẽ ô tùy ý |
| `rowSpan(row)` | Gộp ô theo dòng như ô merge của Excel: số dòng ô phủ (>1, ô có `data-merged`, giữa theo chiều dọc), 0 là ô đã gộp vào dòng trên (không vẽ). Thứ tự `rows` phải đúng thứ tự hiện (lưới không tự sắp xếp). Ví dụ: lưới xem của popup Phân màu cỡ |

Props chính:

| Prop | Ý nghĩa |
|---|---|
| `columns`, `rows`, `rowKey`, `label` | Bắt buộc. `label` là tên lưới cho trình đọc màn hình và khóa lưu độ rộng |
| `policy` | Kết quả `useFieldPolicy(resource)` |
| `loading`, `error`, `onRetry`, `empty` | Trạng thái: đang tải (chưa có dòng: vòng quay; đã có dòng: giữ dòng, mờ đi), lỗi kèm "Thử lại", câu khi rỗng (mặc định "Chưa có dữ liệu.") |
| `indexOffset` | STT bắt đầu từ `(trang - 1) * cỡ trang + 1` |
| `sort`, `onSort` | Chuỗi `<sortKey>:asc` hoặc `<sortKey>:desc`; bấm tiêu đề đảo chiều |
| `columnFilters`, `onColumnFilter`, `loadValues` | Đủ cả ba thì cột có `filterKey` có nút lọc |
| `selectedKey`, `onRowClick`, `onRowDoubleClick` | Dòng đang chọn; bấm; đúp chuột |
| `checked`, `onCheck` | Cột ô tích chọn nhiều dòng (bấm cả ô, không chỉ ô tích 16px) |
| `footer` | Thường là `Pager` |
| `fill`, `dense` | Kéo lưới kín tới chân trang; mật độ cao |
| `widthKey` | Khóa lưu độ rộng khi hai lưới cùng `label` (hiện chưa màn nào dùng) |

Hành vi quan trọng:
- **Bàn phím:** chỉ một dòng nhận Tab (dòng đang chọn, chưa chọn thì dòng đầu); mũi tên lên, xuống chuyển dòng; Enter gọi `onRowDoubleClick` (không có thì `onRowClick`); Space gọi `onRowClick`.
- **Độ rộng cột (ADR 0011):**
  - chưa kéo cột nào: bảng tự co theo nội dung;
  - kéo lần đầu: mọi cột giữ độ rộng đang thấy, bảng chuyển `table-layout: fixed` với `<colgroup>`, cột đệm cuối hút phần thừa; chữ dài cắt ở mép ô, rê chuột xem đủ;
  - tay kéo ở mép phải tiêu đề (48–800px); bấm đúp: vừa nội dung; phím mũi tên trái, phải trên tay kéo: ±10px (Shift: ±50px); Enter: vừa nội dung;
  - lưu ở `localStorage` khóa `mes.grid.widths:<widthKey ?? label>`; nút ở ô STT đặt lại;
  - trong lúc kéo chỉ đổi thẳng độ rộng thẻ `<col>`, không vẽ lại lưới.
- **Chính sách cột:** bỏ cột Ẩn; ô `***` vẽ bằng `Masked` (kể cả cột có `render`); cột Chỉ đọc có khóa trên tiêu đề; cột Che không có nút sắp xếp, không có nút lọc.
- **Tiêu đề hai tầng:** cột có `group` gộp thành một ô nhóm; tiêu đề tầng dưới đọc kèm tên nhóm cho trình đọc màn hình ("Họp đánh giá rủi ro: KH").
- **Vẽ lại:** mỗi dòng là `GridRow = memo(...)`, chỉ vẽ lại khi dữ liệu dòng, trạng thái chọn hay tích, cột hoặc kiểu độ rộng đổi. Hàm `onRowClick`, `onRowDoubleClick`, `onCheck`, `onColumnFilter` đọc qua ref nên trang viết hàm tại chỗ được. `columns` phải ổn định (mục 13).
- Xuất thêm: `Masked` (ô bị Che), `withFilterLabels(columns, labels)` (gắn chữ hiện cho giá trị trong popup lọc khi chữ đó tải sau, ví dụ tên chuyền).

**100 dòng theo ngày tạo (ADR 0011).** `DataGrid` không tự tải dữ liệu; trang gửi `page`, `pageSize` 100 và `sort` mặc định `createdAt:desc`.
- Màn Đơn hàng và hai màn Cắt dùng `usePagedList(key, path, defaultSort = 'createdAt:desc', pageSize = 100)` (`features/order/common.tsx`): trang, sắp xếp, dải lọc, lọc theo cột trên URL; trả `query`, `grid` (props lọc theo cột cho `DataGrid`), `columnsOf(names, policy)` (tên các cột đang lọc cho dải lọc), `exportPath`, `error`.
- Màn khác khai hằng `PAGE_SIZE = 100` (`CutRatioPage`, `PrepPlanPage`, `UsersPage`, `AuditPage`…) dùng chung cho truy vấn, `useClampPage` và `Pager`.
- Lưới nghiệp vụ có cột "Ngày tạo" (`format: 'datetime'`, `sortKey` và `filterKey` là `createdAt`).
- Ngoại lệ: Phân bổ PO (dữ liệu OSM không có ngày tạo), Kế hoạch chuẩn bị SX (thứ tự mặc định do máy chủ đặt), danh sách nhân viên (thẻ, 20 mỗi trang), Kế hoạch may (lưới nhập `SheetGrid` theo một ngày, không phân trang). Chi tiết ở tài liệu module.

### 9.2 Lọc theo cột (`components/ColumnFilter.tsx`, `lib/columnFilter.ts`)

Lọc kiểu Excel trên giá trị của một cột, chạy trong DB (ADR 0011). Máy chủ khai báo danh sách trắng và endpoint `<danh sách>/values`; không đưa cột giá, cột nhạy cảm vào.

- **Dạng bộ lọc:** `ColumnFilter = { mode: 'in' | 'notIn', values: (string | number | null)[] }`; `null` là ô trống, hiện "(Trống)". Nhiều cột gộp thành `ColumnFilters`, gửi lên và ghi URL ở tham số `cf` dạng JSON `{"<trường>": {"in": [...]}}` hoặc `{"notIn": [...]}`.
- **`useColumnFilters(url, patch, key = 'cf', pageKey = 'page')`:** đọc, ghi `cf` trên URL (F5, gửi link vẫn còn); trả `filters`, `param` (chuỗi gửi máy chủ), `setFilter(field, f | null)`, `clear()`, `active`. Đổi bộ lọc thì về trang 1. Màn có hai lưới dùng tên tham số riêng cho lưới thứ hai. `parseColumnFilters` bỏ phần sai dạng trên URL thay vì báo lỗi.
- **`valuesLoader(path, params)`:** hàm `LoadValues` gọi `<path>/values?field&search&<các bộ lọc đang áp>`; máy chủ bỏ bộ lọc của chính cột đang mở, nên danh sách chỉ gồm giá trị còn xuất hiện trong dữ liệu đã lọc theo các cột khác.
- **Nút lọc (`ColumnFilterButton`):** mũi tên nhỏ trên tiêu đề; cột đang lọc thành phễu tô màu, tiêu đề có vạch dưới; tên đọc nói rõ "Đang lọc cột …: giữ/bỏ N giá trị". Bấm mở Popover (giữ focus trong popup, đóng thì trả focus). Nút memo, chỉ vẽ lại khi tên cột, bộ lọc, hàm lấy giá trị, hàm hiện giá trị hoặc bộ lọc của cột khác đổi.
- **Popup:**
  - mỗi lần mở đọc lại giá trị từ DB (khóa truy vấn có id riêng của lần mở, `gcTime: 0`);
  - tối đa 500 giá trị (`MAX_FILTER_VALUES`); máy chủ báo `truncated` thì nhắc gõ để thu hẹp;
  - ô tìm chờ ngừng gõ 300 ms; Enter khi chữ chưa kịp tìm là tìm ngay, Enter lần nữa là áp dụng;
  - mặc định "Chọn tất cả" (`notIn` rỗng). Bỏ tích vài giá trị gửi `notIn`; đang tìm thì Áp dụng chỉ giữ các giá trị đang tích trong kết quả tìm (`in`), như Excel;
  - so giá trị không phân biệt hoa thường, như SQL Server; ô chỉ có khoảng trắng coi như trống (SQL Server so `'   ' = ''` là đúng);
  - cột ngày giờ (`CreatedAt`, lưu UTC) lọc theo ngày giờ Việt Nam (UTC+7), lưới hiện giờ theo múi giờ của máy người xem: giả định mọi máy đặt giờ Việt Nam, máy khác múi giờ có thể thấy ngày trên lưới lệch ngày trong popup ở các dòng tạo gần nửa đêm (ADR 0011);
  - nút Áp dụng bị khóa kèm lý do khi đang tìm hoặc tải, tải lỗi, chưa chọn giá trị nào, chọn quá 500 giá trị hoặc chuỗi `cf` sau mã hóa URL quá 6.000 ký tự (`MAX_FILTER_URL`; chữ Việt có dấu nở 2–3 lần, máy chủ trả 431 nếu dòng request quá dài);
  - "Xóa lọc" khi cột đang lọc; "Hủy" đóng không đổi.
- **`ColumnFilterNote names`:** dòng "Lọc theo cột: …" ở dải lọc, vì tiêu đề cột có thể đã cuộn khuất. Nút "Xóa lọc" của dải lọc phải xóa cả lọc theo cột.

### 9.3 `SheetGrid` – lưới nhập kiểu bảng tính

`components/SheetGrid.tsx`, bọc `react-datasheet-grid` (ADR 0008). Dùng cho mọi lưới nhập; lưới chỉ xem, cột bị Che vẫn dùng `DataGrid` để giữ cách hiện `***`.

- **Thao tác:** chọn vùng bằng chuột hoặc Shift + mũi tên; Ctrl+C, Ctrl+V qua lại với Excel; kéo ô vuông nhỏ ở góc vùng chọn để điền xuống; menu chuột phải tiếng Việt (chèn dòng bên dưới, nhân bản, xóa dòng, sao chép, cắt, dán). Không có hoàn tác (Ctrl+Z); hủy bằng nút Hủy của màn.
- **Hàm dựng cột:**

| Hàm | Cột | Ghi chú |
|---|---|---|
| `sheetNumber(key, title, opts)` | Số nguyên | Gõ hoặc dán "1.234", "1,234", "1 234", "1.234,00" đều là 1234 (`parseQty`); số âm, số lẻ, chữ thành ô trống. Chép ra số trơn. Ghi theo từng phím |
| `sheetText(key, title, opts)` | Chữ | Dán nhiều dòng gộp thành một dòng |
| `sheetDate(key, title, opts)` | Ngày | Lưu `YYYY-MM-DD`, hiện và gõ dd/mm/yyyy; nhận d/m/yyyy (dấu `/`, `-`, `.`), dd/mm (năm nay), yyyy-mm-dd (`parseSheetDate`). Chỉ ghi khi Enter, Tab hoặc rời ô; Esc là bỏ |
| `sheetTime(key, title, opts)` | Giờ trong ngày | Lưu "HH:mm"; nhận "7:30", "07.30", "7h30", "7h", "730", "1710" (`parseTime`); chữ không đọc được giữ nguyên để màn tô đỏ, chặn lưu. Chỉ ghi khi Enter, Tab hoặc rời ô. Dùng ở Kế hoạch may |
| `sheetSelect(title, { options, get, set, unit, … }, opts)` | Chọn từ danh sách | Enter hoặc đúp chuột mở `TreeSelect`, gõ để lọc, Enter chọn kết quả đầu. Dán theo mã, theo nhãn hoặc theo đuôi mã ("L03" → "A01-L03"); không khớp thì giữ nguyên ô. Chép ra nhãn |
| `sheetReadonly(title, render, copy, opts)` | Chỉ xem, tự tính | Tô xám, chép được, không dán vào được |

- **Tùy chọn ô (`opts`):** `required` (nền vàng và dấu `*` ở tiêu đề), `disabled` (cả cột hoặc theo dòng; ô khóa không nhận dán, xóa), `error(row)` (tô đỏ), `className(row)`, `minWidth`, `basis`, `grow`, `maxWidth`, `group`/`groupKey` (tiêu đề hai tầng). Nút lọc theo cột trên tiêu đề là `headFilter` (`{ node, active }`: nút `ColumnFilterButton` do màn dựng sẵn và cờ đang lọc), truyền qua tùy chọn của `sheetReadonly` hoặc gán thẳng vào cột; cột thuộc nhóm không có nút lọc.
- **Props:**

| Prop | Ý nghĩa |
|---|---|
| `label`, `value`, `onChange`, `columns`, `rowKey` | Bắt buộc |
| `createRow`, `duplicateRow` | Đi cặp. Có thì thêm, chèn, nhân bản, xóa dòng được, có dòng "Thêm N dòng" và cột nút xóa dính bên phải, dán quá cuối tự thêm dòng. Không có thì số dòng cố định, dán thừa bị bỏ. `duplicateRow` phải trả bản sao mang khóa dòng mới |
| `canDeleteRow(row)`, `deleteReason(row)` | Dòng không được xóa (đang may, ngoài phạm vi sửa): nút xóa mờ kèm lý do; xóa bằng menu bị chặn, cả lần đổi bị bỏ và báo `toastWarn` (`blockedDeletes`). `deleteReason` thay câu lý do mặc định |
| `addAtActive` | Nút "Thêm N dòng" chèn dòng của `createRow` ngay dưới dòng vừa chọn thay vì thêm ở cuối, rồi chọn ô nhập được đầu tiên của dòng mới; chưa chọn dòng thì nhắc. Dòng vừa chọn được nhớ cả khi bấm nút làm lưới bỏ ô đang chọn; dòng đó bị xóa thì nhớ dòng đang ở chỉ số ô đang chọn (`keepAnchor`). Màn muốn dòng mới chép thông tin của dòng gốc thì điền trong `onChange` theo vị trí (dòng ngay trên), vì `createRow` không biết chỗ chèn (popup Phân màu cỡ: `settleNew`) |
| `empty` | Hiện khi không có dòng và không thêm dòng được |
| `indexOffset` | STT bắt đầu từ |
| `rowLabel(row, index)` | Nhãn ô STT thay cho số (trả `undefined` thì hiện số), ví dụ "-" ở dòng Tổng ghim đầu lưới của popup Đồng bộ tiến độ cắt (dùng kèm `indexOffset={-1}` để màu cỡ đầu tiên là 1) |
| `onActiveRowChange(row)`, `selectedKey` | Dòng của ô vừa chọn (cho nút trên màn); dòng đang chọn có vạch và chữ đậm ở STT |
| `onRowOpen(row)` | Đúp chuột vào ô chỉ xem hoặc STT (ô nhập được thì đúp là sửa ô) |
| `hint` | Câu hướng dẫn dưới lưới thay câu mặc định |

- **Cột chỉ đọc ở lần vẽ đầu:** `react-datasheet-grid` 4.x xuất `DataSheetGrid` là bản tĩnh (`StaticDataSheetGrid`), nên `columns`, `createRow`, `duplicateRow`, `rowKey`, `rowClassName` truyền sau lần vẽ đầu bị bỏ qua. Dữ liệu đổi trong lúc nhập mà ô cần (tổng, lỗi chéo dòng) đọc qua `ref`; lưới vẽ lại mọi ô đang hiện mỗi lần `value` đổi nên ô theo dữ liệu mới. Ví dụ: popup Phân màu cỡ (`ColorSizePage.tsx`, `checkRef`). Các màn còn dựng lại cột (Cập nhật tỷ lệ cắt) đang chờ sửa: [Trạng thái](../current/STATUS.md) mục Lỗi đã biết.
- **Không mất dữ liệu:** chữ đang gõ dở trong ô (chưa ghi vào dòng) cũng tính là chưa lưu (`useLeaveGuard`); hết khi ô ghi, chuyển ô hoặc Esc. Chữ tìm của ô chọn và ô tìm của popup lọc không tính.
- Enter trong ô không gửi form chứa lưới (ví dụ popup Thêm PO). Popup có lưới nhập tắt "Esc để đóng", vì Esc trong lưới là thoát sửa ô.
- Mở popup lọc hoặc mở chi tiết dòng thì lưới bỏ ô đang chọn, để phím gõ trong popup không sửa ô bên dưới (thư viện nghe phím trên cả trang).
- **Bố cục:** lưới lấp đầy khung chứa (khung cha phải là flex cột có chiều cao), đặt tuyệt đối trong khung. Thanh cuộn ngang gốc bị ẩn, dùng thanh cuộn riêng đồng bộ (thanh gốc làm phép đo chiều cao của thư viện lệch, lưới co giãn liên tục); viền khung vẽ bằng `outline`, không dùng `border`, cùng lý do (ADR 0008). Firefox ẩn cả hai thanh cuộn: cuộn dọc bằng bánh xe hoặc phím. Có nhóm cột hoặc nút lọc thì một lớp tiêu đề phủ lên tiêu đề của thư viện và mọi cột giữ đúng `minWidth`. Menu chuột phải đưa ra `document.body` (khung Modal có `transform` làm lệch vị trí `fixed`).
- **Truy cập:** vùng lưới có `role="region"` và nhãn; ô của thư viện không có nhãn riêng.

### 9.4 `TreeSelect` – ô chọn dạng cây

`components/TreeSelect.tsx`. Ô chọn một giá trị; lựa chọn không có nhóm thì là danh sách phẳng như `Select`. Cột chọn của `SheetGrid` dùng sẵn.

- Lựa chọn (`GroupedOption`, `lib/lines.ts`): `value`, `label`, `groups` (các nhóm từ ngoài vào trong, ví dụ chi nhánh, bộ phận cha), `keywords` (chữ tìm thêm).
- Props: `options`, `value`, `onChange`, `placeholder`, `clearable` (xóa là "Tất cả"), `unit` (đơn vị đếm cạnh tên nhóm, ví dụ "chuyền"), `nothingFoundMessage`, `emptyMessage`, `maxDropdownHeight` (300), `autoFocus`, `defaultDropdownOpened`, `onDropdownClose`, `aria-label`, cùng `label`, `description`, `error`, `withAsterisk`, `size`, `variant`, `className`, `w`, `disabled`.
- **Tìm không dấu:** bỏ dấu và đổi `đ` thành `d`, không phân biệt hoa thường; cụm đã gõ phải nằm ở đầu một từ của tên, mã, tên nhóm hoặc từ khóa ("01" ra "Chuyền 01" nhưng không ra "A01-L05"); không ghép từ của trường này với trường khác ("xưởng 02" chỉ ra chuyền của Xưởng 02). Focus vào ô là bôi đen nhãn để gõ thay luôn.
- **Nhóm:** thu gọn được; mở sẵn nhóm chứa giá trị đang chọn và nhóm duy nhất của một cấp; đang tìm thì mở mọi nhóm có kết quả, Enter chọn kết quả đầu. Dòng nhóm có số lựa chọn.
- **Bàn phím:** mũi tên lên, xuống đi qua cả dòng nhóm; Enter trên dòng nhóm là mở/thu gọn; sau khi đã đi bằng mũi tên lên xuống, mũi tên phải mở nhóm (đã mở thì xuống dòng đầu), mũi tên trái thu gọn hoặc về dòng nhóm cha. Trình đọc màn hình đọc đúng dòng đang đứng (`aria-activedescendant` ghi lại theo DOM).
- Giá trị không có trong danh sách (link cũ, chuyền ngoài phạm vi): ô hiện mã, không để trống.
- **`lineOptions(lines, label?, branchName?)`** (`lib/lines.ts`) dựng lựa chọn chuyền may (bộ phận tích "Xưởng sản xuất", nguồn `/me/lines`) theo thứ tự API: mọi chuyền nằm ở gốc cây phòng ban thì phẳng; có bộ phận cha thì nhóm theo bộ phận cha, chuyền ở gốc đứng sau cùng ngoài nhóm; nhiều chi nhánh (`A00`) thì thêm cấp chi nhánh ngoài cùng; hai bộ phận cha trùng tên trong một ĐVCS thì tên nhóm kèm mã. Tìm được theo mã bộ phận cha (`keywords`).
- **`lineNameLabel(lines)`**: nhãn ngắn cho ô đã chọn là tên chuyền; hai chuyền trùng tên thì kèm mã. Mã bộ phận do Nhân sự đặt, không có dạng cố định, nên không cắt mã lấy "số chuyền".
- `ORPHAN_LINE_SUFFIX` (`"(chuyền cũ)"`): đuôi nhãn máy chủ gắn cho chuyền mồ côi (mã không còn là bộ phận nào); màn hình không thêm "(đã ngừng)" cho nhãn này. Câu dùng sẵn: `LINE_NOT_FOUND`, `LINE_EMPTY`.

### 9.5 `DebouncedTextInput`, `DebouncedAutocomplete`

`components/DebouncedInput.tsx`. Ô tìm, ô lọc chữ: chữ đang gõ giữ trong ô, gõ phím chỉ vẽ lại ô, không vẽ lại cả màn và lưới.

- Đẩy giá trị ra (`onChange`) sau khi ngừng gõ `TYPING_DELAY` = 300 ms; Enter hoặc rời ô thì đẩy ngay; chữ không đổi thì không gọi. `DebouncedAutocomplete`: chọn một gợi ý thì đẩy ngay.
- Giá trị đổi từ ngoài (Xóa lọc, mở link, Back) thì ô hiện giá trị mới và bỏ lượt đẩy đang chờ. Chữ vừa đẩy đi quay về chậm qua `value` (React Router đổi URL trong `startTransition`) thì không coi là đổi từ ngoài, chữ người dùng đang gõ thêm được giữ.
- Bên nhận phải lưu nguyên chữ ô đẩy ra; chỉ cắt khoảng trắng, viết hoa… lúc dựng truy vấn. Giá trị quay về khác chữ đã đẩy sẽ bị coi là đổi từ ngoài và ghi đè chữ đang gõ.
- Hook gốc `useDebouncedText(value, onCommit, delay)` trả `{ text, change, flush }`.

### 9.6 `DateField`

`components/DateField.tsx`, bọc `DateInput` của Mantine. Luôn hiện và gõ dd/mm/yyyy bất kể ngôn ngữ trình duyệt (bộ đọc `parseDmy`, không để trình duyệt đoán). Giá trị trao đổi là chuỗi `YYYY-MM-DD` như API; xóa ngày thì `onChange('')`. Có nút xóa. Lịch đang mở thì Esc chỉ đóng lịch, không đóng popup chứa ô.

### 9.7 `WorkPage`, `PageHeader`, `PageTitle`

- `WorkPage` (`components/WorkPage.tsx`): khung màn nghiệp vụ. Props `title`, `subtitle` (chú thích), `actions` (nút), `filters` (dải lọc nền xám ngay dưới tiêu đề), `aggregateNote` (mặc định `true`), `children`. Thân trang kéo kín tới chân trang (`.work-body` flex cột) để lưới `fill` có cuộn dọc, ngang trong khung. Ở `A00` tự hiện "Đang xem tổng hợp mọi đơn vị cơ sở, chỉ đọc…"; màn dữ liệu vẫn sửa được ở `A00` (Chính sách cột, Nhân sự) đặt `aggregateNote={false}`. Điện thoại: trang cao theo nội dung, lưới cao tối thiểu 60% màn hình.
- `PageHeader` (`components/PageHeader.tsx`): tiêu đề, chú thích, nút; dùng ở các màn Quản trị (không có dòng nhắc `A00` vì dữ liệu quản trị vẫn sửa được ở đơn vị tổng hợp). Dải lọc của màn quản trị là `FilterBar` (`features/admin/common.tsx`).
- `PageTitle` (`components/PageTitle.tsx`): `h1` của màn. Chú thích "màn này dùng để làm gì" không chiếm dòng riêng: rê chuột, chạm tiêu đề hoặc Tab tới nút biểu tượng thông tin thì hiện; trình đọc màn hình đọc ngay sau tiêu đề. Chú thích chỉ là chữ, không đặt link, nút.

### 9.8 Các thành phần nhỏ

- **`Pager`** (`components/Pager.tsx`): props `page`, `pageSize`, `total`, `onPage`, `extra`. Hiện "Hiển thị a-b trong N dòng"; chỉ có thanh phân trang khi trên một trang; trang vượt trang cuối không hiện số vô lý. Đi kèm `useClampPage` (mục 10).
- **`ActionButton`** (`components/ActionButton.tsx`): `Button` của Mantine thêm `blockedReason`. Có lý do thì nút trông như bị khóa (`data-disabled`, `aria-disabled`), bấm không làm gì, rê chuột, chạm hoặc Tab tới thì Tooltip nói lý do. Không dùng `disabled` vì nút disabled không nhận chuột, chạm, Tab. Luôn bọc Tooltip (tắt khi không có lý do) để đổi khóa, mở không dựng lại nút và không mất focus. Nút chỉ có biểu tượng trong màn quản trị: `IconAction` (`features/admin/common.tsx`) cùng cơ chế.
- **`PolicyHint`** (`components/PolicyHint.tsx`): props `policy`, `names` (mã cột → tên hiện trên màn; cột không có tên thì không nhắc). Popover liệt kê cột Ẩn, Che, Chỉ đọc và nhắc nhờ quản trị viên ở Chính sách cột.
- **Tên chi nhánh** (`components/BranchName.tsx`):
  - `useBranchName()` trả hàm mã → tên, từ `GET /me/branch-names` (tên chi nhánh của danh mục BRAVO, chưa có thì tên ở Quản trị › Đơn vị cơ sở; `staleTime` 5 phút); chưa tải xong hoặc mã lạ thì trả mã;
  - `withBranchNames(columns, branchName)`: cột `branchCode` hiện tên (rê chuột thấy mã) cả trong ô và trong popup lọc, một truy vấn cho cả trang;
  - `BranchName` (component đứng riêng) hiện chưa màn nào dùng.
- **`BrandMark`** (`components/BrandMark.tsx`), ảnh ở `frontend/public`, đều nền trong suốt:
  - `variant="full"` (mặc định), `tone="auto"` (mặc định): đặt cả `/logo-vs.png` (chữ xám) và `/logo-vs-dark.png` (chữ trắng), CSS (`.brand-logo-light`, `.brand-logo-dark`) chọn theo chế độ màu nên mở trang ở chế độ tối không nháy bản sáng; ảnh bị ẩn có `loading="lazy"` nên không tải;
  - `tone="dark"`: luôn bản chữ trắng `/logo-vs-dark.png` (nền màn đăng nhập luôn tối);
  - `variant="mark"`: chỉ hình mặt trời `/logo-vs-sun.png`;
  - `height` (số px hoặc giá trị CSS, ví dụ `var(--login-logo-h)` để logo co theo khung hình), `className`.
  - Dùng ở thanh trên (logo đầy đủ cao 50px; điện thoại hình mặt trời cao 34px) và màn đăng nhập (góc trái `tone="dark"`, trong thẻ đăng nhập).

## 10. Tiện ích (`lib/`)

| File | Xuất | Dùng khi |
|---|---|---|
| `api.ts` | `api`, `download`, `ApiError`, `refreshSession`, `endSession`, `duringBranchSwitch`, `onPermissionVersionChange`, `onBranchChanged` | Gọi API (mục 8) |
| `chunkReload.ts` | `withChunkRecovery`, `recoverFromChunkError`, `isChunkLoadError` | Tự phục hồi khi không tải được file code của màn (mục 4.2) |
| `queryClient.ts` | `queryClient` | Bộ đệm truy vấn dùng chung |
| `queryKeys.ts` | `ORDER_OPTIONS_KEY` | Khóa truy vấn dùng ở nhiều nhóm |
| `types.ts` | `Branch`, `UserInfo`, `RoleInfo`, `MenuNode`, `LoginResponse`, `SelectBranchResponse`, `ProductionFactory`, `MeResponse`, `PermissionsResponse`, `Paged<T>`, `AccessLevel`, `FieldPoliciesResponse`, `LineInfo` | Kiểu dữ liệu dùng chung |
| `branches.ts` | `useBranchChoices(enabled)` | ĐVCS tài khoản được chọn (`GET /me/branches`), kể cả `A00` nếu được gán. Đây là ĐVCS được gán, không phải ĐVCS xem được: ô lọc theo ĐVCS lấy giá trị từ dữ liệu (`/values?field=branchCode`) |
| `fieldPolicy.ts` | `useFieldPolicy`, `MASK`, `Masked<T>`, `LEVEL_LABEL`, `FieldPolicy`, `onlyEditable` | Phản chiếu chính sách cột (mục 7) |
| `columnFilter.ts` | `useColumnFilters`, `valuesLoader`, `parseColumnFilters`, `serializeColumnFilters`, `filterUrlLength`, `MAX_FILTER_VALUES`, `MAX_FILTER_URL`, kiểu `ColumnFilter(s)`, `FilterValue`, `LoadValues`, `ValuesPage` | Lọc theo cột (mục 9.2) |
| `confirm.tsx` | `confirmAction`, `confirmDiscard` | Hộp xác nhận (mục 10.1) |
| `leaveGuard.ts` | `useLeaveGuard`, `guardedLeave` | Chặn rời màn khi chưa lưu (mục 10.2) |
| `afterClose.ts` | `useAfterClose(fn)` | Làm mới dữ liệu sau khi popup đã đóng hẳn |
| `useUrlParams.ts` | `useUrlParams`, `pageOf`, `useClampPage`, `UrlPatch` | Trạng thái màn trên URL |
| `useStable.ts` | `useStableByKey(value, key)` | Giữ nguyên tham chiếu khi nội dung không đổi |
| `useMobile.ts` | `useMobile()` | Màn hình dưới 768px (`max-width: 47.99em`, cùng mốc với CSS): popup lớn `fullScreen` |
| `format.ts` | `fmtDate`, `fmtDateTime`, `fmtNum`, `fmtMoney`, `sumOf`, `parseDmy`, `today`, `addDays`, `qs` | Định dạng, đọc ngày, dựng query string |
| `weeks.ts` | `mondayOf`, `sundayOf`, `isoWeekOf`, `weekMonday`, `weeksInYear` | Tuần ISO 8601 (bắt đầu thứ Hai, tuần 1 chứa thứ Năm đầu năm), tính theo UTC; dùng cho thanh tuần T1…T53 của Kế hoạch chuẩn bị SX |
| `lines.ts` | `GroupedOption`, `lineOptions`, `lineNameLabel`, `ORPHAN_LINE_SUFFIX`, `LINE_NOT_FOUND`, `LINE_EMPTY` | Lựa chọn, nhãn chuyền may cho `TreeSelect` (mục 9.4) |
| `workCalendar.ts` | `toCalendar`, `isOffDay`, `lineDates`, `offDaysBetween`, `datesOrderError`, `productionDaysOf`, `offsetsInOrder`, `WEEKDAYS`, `maskOf`, `isoWeekday`, `DATE_KEYS`, kiểu `WorkCalendar`, `WorkCalendarJson`, `CalendarDay`, `CalendarOffsets`, `LineDates` | Lịch làm việc theo ĐVCS: bản sao hàm tính ngày của máy chủ (`backend/src/platform/catalog/work-calendar.ts`), hai bản chạy chung bộ ca `backend/test/fixtures/work-calendar-cases.json`. Chi tiết dàn chuyền (`LinePlanPage.tsx`, `features/order/scheduleDates.ts`) tính trước ngày khi gõ; khung Lịch làm việc (`WorkCalendarPane.tsx`) dùng thứ trong tuần, số ngày SX. Khi lưu, máy chủ tính lại và kết quả của máy chủ là chuẩn |
| `notify.ts` | `toastOk`, `toastWarn`, `toastError` | Thông báo (mục 8.3) |

Chi tiết các tiện ích hay dùng:
- **`useUrlParams()`** trả `[params, patch]`. `patch({ k: v })` ghi kiểu `replace` (không làm đầy lịch sử trình duyệt mỗi lần gõ lọc); giá trị rỗng, `null` thì bỏ khỏi URL; đọc qua ref nên hai lần ghi liền nhau không đè mất nhau. `pageOf(params, key = 'page')`: số trang 1…1.000.000, giá trị lạ về 1. `useClampPage(data, page, pageSize, goTo)`: trang trên URL vượt trang cuối (link cũ, vừa xóa dòng cuối) thì về trang cuối thay vì báo bảng rỗng.
- **`useAfterClose(fn)`** trả hàm kích hoạt; `fn` chạy trong effect sau lần vẽ kế tiếp, lúc popup đã gỡ. Gọi làm mới ngay khi popup còn mở thì TanStack tải lại cả truy vấn của chính popup rồi bỏ đi.
- **`useStableByKey(value, key)`** giữ nguyên tham chiếu `value` tới khi `key` đổi (thường `key = JSON.stringify(value)`); dùng cho object bộ lọc gửi máy chủ để hàm `loadValues` và component memo không đổi khi nội dung không đổi.
- **Định dạng** (`format.ts`):
  - `fmtDate`: `YYYY-MM-DD` → `DD/MM/YYYY`, không đổi múi giờ;
  - `fmtDateTime(iso, { seconds })`: "dd/mm/yyyy HH:mm" theo giờ máy, một kiểu cho mọi màn (không dùng `toLocaleString`, kiểu đó đặt giờ trước ngày và đổi theo trình duyệt);
  - `fmtNum`, `fmtMoney`: kiểu Việt Nam (`vi-VN`), `fmtMoney` 2 số lẻ;
  - `parseDmy`: dd/mm/yyyy (cả d/m/yyyy, dấu `/`, `-`, `.`) → `YYYY-MM-DD`, ngày không có thật trả `null`;
  - `today()` theo giờ máy, `addDays` theo UTC, `qs(params)` bỏ giá trị rỗng.

### 10.1 Hộp xác nhận (`lib/confirm.tsx`)

- `confirmAction({ title, consequence, confirmLabel, cancelLabel = 'Giữ lại', danger = true, onConfirm })`: `consequence` nói điều sẽ xảy ra; nút hành động mang đúng tên việc ("Xóa đơn hàng"), màu đỏ khi `danger`; nút giữ lại bên trái. Không dùng `window.confirm` hay `modals.openConfirmModal` trực tiếp.
- `confirmDiscard(dirty, discard, consequence?)`: chưa đổi gì thì làm ngay; có thay đổi thì hỏi "Bỏ các thay đổi chưa lưu?" với "Bỏ thay đổi" / "Tiếp tục sửa". Dùng cho nút Hủy, dấu x, Esc của popup có nhập liệu và các thao tác làm mất phần đang nhập (đổi dòng, chọn lại).
- Mantine bắt Esc trên cả cửa sổ, nên Esc đóng hộp xác nhận cũng tới popup bên dưới. `confirm.tsx` đếm hộp đang mở và đánh dấu lần Esc xảy ra khi còn hộp mở (listener `keydown` ở pha capture, đăng ký lúc nạp module); trong lúc đó `confirmDiscard` không làm gì. Popup quản trị dùng `escapeToClose(close)` (`features/admin/common.tsx`) thay cho `closeOnEscape` của Mantine: Esc chỉ đóng popup qua `close` khi không bấm trong ô chọn đang mở.

### 10.2 Không mất dữ liệu đang nhập

| Lớp | Cách làm |
|---|---|
| Popup | Theme đặt `closeOnClickOutside: false` cho mọi `Modal`: bấm nhầm ra nền mờ không đóng. Hủy, dấu x, Esc đi qua `confirmDiscard` |
| Rời màn | `useLeaveGuard(dirty)` (`lib/leaveGuard.ts`) đăng ký màn đang có thay đổi chưa lưu vào một tập toàn cục; còn nguồn nào thì gắn `beforeunload` (tải lại trang, đóng tab trình duyệt tự hỏi). `guardedLeave(leave)` gọi `confirmDiscard(còn nguồn, leave)`; khung dùng cho menu, tab, Spotlight, đổi ĐVCS, đăng xuất (mục 6.3). Cờ gỡ khi `dirty` về `false` hoặc màn bị gỡ (cleanup của `useLeaveGuard`); `guardedLeave` không tự gỡ cờ |
| Lưới nhập | Chữ gõ dở trong ô `SheetGrid` tính là chưa lưu (mục 9.3) |
| Đổi ĐVCS ở tab khác | Màn không dựng lại; lệnh ghi bị chặn bằng `BRANCH_CHANGED` (mục 6.4) |
| Giới hạn | Ứng dụng dùng `BrowserRouter` (không phải data router) nên không có `useBlocker`: nút Back của trình duyệt chưa chặn được |

## 11. Theme và CSS

### 11.1 `theme/theme.ts`

- **Màu** (ADR 0003, [Quyết định](13-quyet-dinh.md) mục 12.2, 12.3): chủ đạo lấy từ logo Vietsun.

| Thang Mantine | Màu chuẩn (shade 6) | Dùng cho |
|---|---|---|
| `brand` | `#f39830` (cam logo) | `primaryColor`; nút chính, vạch đánh dấu, ô tích, phân trang |
| `charcoal` | `#4d4e4e` (shade 8 `#2b2c2d` trùng màu thanh bên `--app-nav`) | Xám than của chữ logo; badge vai trò, mã ĐVCS, loại phòng ban |
| `link` | `#007185` | Màu phụ: liên kết (`Anchor`), hộp thông tin, badge trạng thái, nút phụ dạng `subtle` |
| `teal`, `red`, `orange` | `#067d62`, `#b12704`, `#cc5500` | Thành công, lỗi, cảnh báo |
| `gray` | `#4b5563` | Xám trung tính, ghi đè thang mặc định: shade 1 `#f3f4f6` là nền trang, 6 là chữ phụ (`dimmed`), 9 `#111827` là chữ |
| `dark` | | Ghi đè thang mặc định cho chế độ tối |

- `primaryShade` `{ light: 6, dark: 5 }`, `autoContrast: true`, `luminanceThreshold: 0.35`, `black: '#111827'`.
- **Chữ:** Source Sans 3 (thân, tiêu đề), JetBrains Mono (mã, số; class `.mono`). Riêng màn đăng nhập dùng Inter (quyết định 12.4, đặt lại `--mantine-font-family` trên `.login-shell`). Cỡ `xs` 12px, `sm` 13px, `md` 14px, `lg` 16px, `xl` 18px; `h1` 24px, `h2` 18px, `h3` 16px, `h4` 14px, đậm 700.
- **Bo góc:** thang `xs` 2px, `sm` 6px, `md` 8px, `lg` 12px, `xl` 16px; mặc định `sm` (6px); `Paper`, `Modal`, `Menu`, `Button` `md` (8px); `Badge`, `Checkbox` `xs` (2px). Bóng đổ `shadows` `xs`–`xl` theo xám `#111827`.
- `cursorType: 'pointer'`, `respectReducedMotion: true` (bỏ hiệu ứng khi máy đặt giảm chuyển động).
- **Mặc định thành phần:**
  - `Button`: cỡ `sm`, bo `md`, nét chữ 600. Nút chính (filled, màu `brand`): nền cam `#f39830`, chữ `#111827` (chữ trắng trên cam chỉ đạt 2,3:1), viền và màu di chuột `#e0851d`. Nút `variant="default"`: viền `--app-line-strong`, chữ `--app-ink`; riêng `color="red"` giữ chữ đỏ. Riêng nút chính màn đăng nhập: chữ trắng trên cam đậm `--login-cta` (`#d9730d`), đặt qua prop `vars` ở `LoginPage.tsx` (quyết định 12.4);
  - ô nhập cỡ `sm`; nút xóa giá trị của `Select`, `MultiSelect`, `DateInput`, `DateTimePicker`, nút hiện mật khẩu, nút đóng của `Modal`, `Drawer`, `Notification` có `aria-label` tiếng Việt;
  - `Checkbox` màu `brand`, bo `xs` (dấu tích tối nhờ `autoContrast`), `Pagination` màu `brand`; `Switch` màu `teal`;
  - `Modal`: giữa màn, bo `md`, nền mờ 0,45, `closeOnClickOutside: false`;
  - `Menu`: bo `md`, bóng `md`; `Badge`: bo `xs`, không viết hoa, đậm; `Tooltip` trễ 200 ms; `Anchor` màu `link.6`.
- Chế độ sáng/tối: `defaultColorScheme="auto"` theo hệ điều hành; nút ở thanh trên đổi tay.

### 11.2 `theme/global.css`

- **Token** trên `:root`:
  - nền, chữ, đường kẻ: `--app-bg` (nền trang), `--app-surface` (thẻ), `--app-section`, `--app-row-hover`, `--app-line`, `--app-line-strong`, `--app-input-line`, `--app-ink`, `--app-ink-soft`;
  - khung: `--app-topbar`, `--app-topbar-ink` (thanh trên), `--app-tabbar` (dải menu con), `--app-nav`, `--app-subnav`, `--app-nav-ink`, `--app-nav-ink-soft` (thanh bên);
  - màu: `--brand`, `--brand-hover`, `--brand-soft`, `--brand-ink` (chữ màu cam đậm, vì cam logo làm chữ trên nền trắng chỉ đạt 2,3:1), `--link`, `--link-hover`, `--focus-glow`, `--success`, `--warning`, `--error`, `--field-required-bg`, `--field-required-line`;
  - bóng: `--elev-1`, `--elev-2`;
  - chế độ tối định nghĩa lại dưới `:root[data-mantine-color-scheme='dark']`. Token riêng của từng khối khai cạnh khối đó (`--login-*` của màn đăng nhập, `--prep-*`, `--week-range-*` của Kế hoạch chuẩn bị SX, `--dsg-*` của lưới nhập).
- **Ghi đè Mantine:** ô nhập, nút cao 31px (điện thoại 40px); chữ badge, chữ lỗi, mô tả dưới ô tối thiểu 12px; viền ô nhập và ô tích chưa tích dùng `--app-input-line` để đạt 3:1 ở cả hai chế độ (mặc định của Mantine thấp hơn); chữ gợi ý trong ô ở chế độ tối sáng hơn mặc định; vòng focus xanh `--link` kèm quầng `--focus-glow` (class `.focus-ring` và các phần tử Mantine), trên nền xám than của thanh bên dùng viền trắng.
- **Quy ước ô nhập** (theo mô tả giao diện của BA): `.field-required` nền vàng là bắt buộc, `.field-readonly` nền xám là chỉ đọc, đỏ là sai.
- **Các khối CSS lớn:** khung ứng dụng (thanh bên, thanh trên, dải menu con, bản điện thoại), đăng nhập (`.login-*`), bảng mật độ cao (`.table-frame`, `.dense-table`), trang làm việc (`.work-page`, `.work-head`, `.work-filters`, `.work-body`, `.split-pane`, `.split-rows`, `.split-stack`: hai khung chồng ở cột phải của Cập nhật tỷ lệ cắt, từ 1024px hàng có chiều cao tối thiểu 170/210px, lưới trong khung co và tự cuộn bên trong để khung trên không tràn đè tiêu đề khung dưới, lưới nhập giữ sàn 160px, khung lỗi nhập `.sheet-issues` không co, cao tối đa 96px; đang sửa màu cỡ thì khung dưới chiếm 3/5; hẹp hơn 1024px thì `.split-pane` cao theo nội dung, mỗi lưới 320px đến 70vh tự cuộn bên trong, vùng chính cuộn; `.split-rows`: lưới chính trên, lưới chi tiết của dòng đang chọn dưới, như Kế hoạch xuất hàng › PO của kế hoạch), lưới dùng chung (`.grid-*`), lưới nhập (`.sheet-*`, biến `--dsg-*`), ô chọn dạng cây (`.tree-pick*`), cùng CSS riêng của bảng dàn chuyền, Danh mục hệ thống (gồm Lịch làm việc `.wcal-*`), Kế hoạch chuẩn bị SX, dòng Tổng của Đồng bộ tiến độ cắt (`.cut-total`), Xác nhận cấp BTP (`.supply-*`), Kế hoạch may (`.plan-*`), Nhân sự.
- **Mốc bề rộng:** 1280px, 1100px, 960px (thanh trên bớt dần phần phụ, mục 6.1), 1023px (khung chia đôi chuyển một cột), 767px (điện thoại; vài chỗ viết `47.99em` để khớp `hiddenFrom="sm"` của Mantine, cùng mốc với `useMobile`), 400px (điện thoại hẹp); `pointer: coarse` (tay kéo cột, dòng cây lớn hơn); `hover: none`.
- **Màn đăng nhập** (`.login-*`): nền luôn tối ở cả hai chế độ màu (ảnh `frontend/public/login-bg.webp` dưới lớp phủ xám than, mặt trời vẽ bằng CSS ở `.login-sun`), thẻ đăng nhập theo chế độ màu của ứng dụng; `.login-shell` đặt lại font Inter và khai màu nút chính `--login-cta`, `--login-cta-hover` (quyết định 12.4); chân trang có số phiên bản `__APP_VERSION__`.
- **Màn đăng nhập co theo khung hình:** cỡ ở màn cao từ 940px đúng ảnh mẫu (`docs/screens/VIETSUN MES Login Portal.png`, 1672×941). Màn thấp hơn thu nhỏ liên tục theo biến `--login-fit` (0px khi cao từ 640px trở xuống, 1px khi cao từ 940px, tính theo `svh` để thanh địa chỉ ẩn hiện không làm thẻ đổi cỡ; mỗi cỡ viết `calc(cỡ gọn + chênh lệch × var(--login-fit))`), để thẻ nằm gọn trong laptop 1366×768 hay 1920×1080 phóng 125%. Logo, đồng hồ, chân trang đặt tuyệt đối ở các góc. Khẩu hiệu bên trái là giá trị cốt lõi (`CORE_VALUES` trong `LoginPage.tsx`, danh sách `.login-values`, chữ đầu `.login-values-initial` màu cam; quyết định 12.4); một cột thì nằm ngang, mặt trời thu nhỏ đẩy lên góc trên để không đè chữ. Các mốc khác: bề rộng 1280px (thẻ 440px, mặt trời nhỏ lại), 960px (một cột), 720px (ẩn đồng hồ, tránh đè mặt trời), 480px; chiều cao 640px (bỏ logo trong thẻ, dòng chân thẻ), 520px; một cột thấp hơn 760px, 680px (bỏ logo trong thẻ, rồi khẩu hiệu). Form dài thêm (đang chọn ĐVCS, khung báo lỗi `role="alert"`, lỗi dưới ô `aria-invalid`) thì bỏ logo trong thẻ và dòng chân thẻ; màn thấp hơn 640px bỏ thêm dòng tên hệ thống (`:has`, Firefox từ 121; trình duyệt cũ hơn chỉ không bỏ được, trang cuộn). Mốc chiều cao không kèm `min-width` vì màn phóng to có bề rộng lẻ (960,5px) sẽ lọt khe giữa hai mốc. Số đo trên trình duyệt với 5 trạng thái (ban đầu, bỏ trống ô, sai mật khẩu, chọn ĐVCS, chưa chọn ĐVCS; NEEDS VERIFICATION: không kiểm được từ code, cần đo lại trên trình duyệt): hai cột không cuộn từ chiều cao 585px trở lên, một cột không cuộn ở 360×640 trở lên (riêng 960×599 lố 11px khi chưa chọn ĐVCS); dưới 520px và điện thoại xoay ngang thì cuộn khi form dài thêm.
- **Thứ tự nạp:** CSS của Mantine và `global.css` nạp ở `main.tsx` và gom một file khi build; `global.css` thắng nhờ đứng sau (mục 13). CSS của `react-datasheet-grid` được import trong `SheetGrid.tsx` nên đi theo code của màn có lưới nhập; ghi đè của nó trong `global.css` viết kèm `.sheet-wrap` (đặc hiệu cao hơn quy tắc của thư viện).

## 12. Quy tắc UI/UX

Đối chiếu trước khi báo xong một màn. Agent `code-reviewer` dùng danh sách này khi review giao diện. Thành phần nào dùng cho việc nào: mục 9, 10.

**A. Nhất quán, phân cấp**
1. Mỗi màn, popup, ngăn kéo có tối đa một nút chính (cam). Nút phụ `variant="default"`.
2. Nút xóa `variant="default" color="red"`; nút xác nhận trong hộp hỏi xóa màu đỏ.
3. Chữ nút: tạo mới "Thêm <đối tượng>" (cả nút mở popup và nút gửi); lưu khi sửa "Lưu thay đổi"; đóng popup "Hủy", hoặc "Đóng" khi chỉ xem; giữ lại trong hộp hỏi xóa "Giữ lại".
4. Footer popup: Hủy bên trái nút chính, cả nhóm canh phải.
5. Một khái niệm một tên, một trường một cách viết ở mọi màn (ví dụ "PO/Buy date"). Trạng thái: "Đang dùng / Ngừng dùng" cho danh mục, vai trò, ĐVCS; "Hoạt động / Đã khóa / Khóa tạm" cho người dùng.
6. Bộ lọc đặt ở dải lọc ngay dưới tiêu đề, cùng thứ tự giữa các màn, có "Xóa lọc" (xóa cả lọc theo cột).

**B. Chữ**
1. Tối thiểu 12px cho mọi chữ.
2. Số canh phải, `tabular-nums`, phân cách nghìn kiểu Việt Nam (`fmtNum`).
3. Ngày `dd/mm/yyyy`, thời điểm `dd/mm/yyyy HH:mm` (`fmtDate`, `fmtDateTime`).
4. Viết hoa đầu câu, không viết hoa cả nhãn; không nối chuỗi "A · B · C"; không thêm "→" vào nút.
5. Không lộ mã kỹ thuật (tên bảng, mã quyền, lệnh `npm`); cần cho IT thì đưa vào tooltip. Thuật ngữ nghiệp vụ theo tài liệu BA.
6. Đoạn văn dưới khoảng 80 ký tự mỗi dòng (`maw` cho Alert, đoạn giới thiệu).

**C. Màu, tương phản**
1. Chữ ≥ 4,5:1; viền ô nhập và vòng focus ≥ 3:1 ở cả chế độ sáng và tối.
2. Cam `#F39830` chỉ làm nền hoặc vạch, không làm chữ trên nền trắng; chữ màu cam dùng `--brand-ink`.
3. Trạng thái không chỉ bằng màu: luôn kèm chữ hoặc biểu tượng.
4. Màu trong code dùng biến (`--app-*`, `var(--mantine-color-<màu>-text)`); màu hex cứng phải khai thêm giá trị cho chế độ tối.

**D. Form, nhập liệu**
1. Mọi ô có nhãn hiển thị (không chỉ placeholder); ô bắt buộc có `withAsterisk`. Vàng là bắt buộc, xám là chỉ đọc, đỏ là sai.
2. Lỗi hiện ngay dưới ô (hoặc tô đỏ ô lưới), nói rõ cách sửa (ví dụ "Đen / M: còn lại 120, đang nhập 150"); kiểm khi rời ô (`validateInputOnBlur`), không đợi bấm Lưu.
3. Nút Lưu có `loading`; khóa khi chưa đổi gì hoặc còn lỗi, kèm lý do (`ActionButton`).
4. Không làm mất phần đang nhập (mục 10.2).
5. Không điền sẵn giá trị trông như người dùng đã nhập; chỉ điền giá trị suy ra từ dữ liệu (ví dụ số lượng còn lại).
6. Mã không đổi được sau khi tạo: ô `readOnly` + `field-readonly` + mô tả lý do, không dùng `disabled`.
7. Form Nhân sự đặt chú thích của ô trong tooltip (`FieldCell`, `features/hr/common.tsx`) để các ô cùng hàng thẳng nhau. Ngoại lệ: ô tích có lý do khóa quan trọng (ô "Xưởng sản xuất" ở Sơ đồ tổ chức) không qua `FieldCell`, hiện mô tả và lý do khóa ngay dưới ô (kèm biểu tượng khóa) để đọc được ngay, kể cả trên điện thoại.

**E. Trạng thái**
1. Mỗi vùng dữ liệu có đủ: đang tải (Skeleton hoặc Loader, không hiện "0 dòng", không nháy trống, không nhảy bố cục), lỗi kèm "Thử lại", rỗng (phân biệt "không khớp bộ lọc" kèm "Xóa lọc" với "chưa có gì" kèm gợi ý bước tiếp; `EmptyState` ở `features/order/common.tsx`), có dữ liệu (đổi trang, lọc giữ dữ liệu cũ kèm dấu hiệu đang tải).
2. Thông báo thành công nêu đối tượng ("Đã xóa đơn hàng SO-…"); thông báo lỗi giữ lâu hơn.
3. Thao tác nguy hiểm (xóa, khóa tài khoản, ngừng dùng, chép lại từ đầu) hỏi lại bằng `confirmAction`, nêu hậu quả.

**F. Điều hướng, bàn phím**
1. Trạng thái danh sách (bộ lọc, trang, sắp xếp, tab, dòng chọn) nằm trên URL qua `useUrlParams` (ghi `replace`), nên F5 và gửi link giữ ngữ cảnh. Màn dùng `useUrlFilter`, `usePagedList` (Đơn hàng, Cắt) chỉ đọc bộ lọc từ URL lúc mở màn. Ngoại lệ hiện có: `features/sewing/SewingPlanPage.tsx` (ngày, đơn vị) và `features/admin/CatalogsPage.tsx` (danh mục đang chọn, tham số `c`) dùng thẳng `useSearchParams` của React Router, cũng ghi `replace`.
2. Mọi điều khiển tới được bằng bàn phím; vòng focus nhìn rõ.
3. Nút chỉ có biểu tượng có `aria-label` và Tooltip cùng chữ.
4. Tên đọc của nút chứa chữ đang hiển thị (WCAG 2.5.3).

**G. Bảng**
1. Tiêu đề cột dính khi cuộn (bảng mật độ cao đặt trong khung `data-fill`: `.table-frame[data-fill]`, `.grid-wrap[data-fill]`); có chỉ báo sắp xếp; phân trang có tổng số dòng.
2. Chữ dài cắt gọn, rê chuột xem đủ; ô trống ghi "–".
3. Dòng đang chọn nổi bật; mất chọn khi dòng không còn trong danh sách sau lọc, đổi trang; nút Sửa, Xóa lấy dữ liệu mới nhất của dòng, không dùng bản chụp cũ.
4. Lưới xem tải 100 dòng, mới tạo lên trước, có cột "Ngày tạo" (mục 9.1).
5. Lọc, tìm luôn chạy trong DB, không lọc mảng đã tải về. Cột có giá trị lặp lại (mã, tên, trạng thái, ngày, số lượng) đặt `filterKey`; không đưa cột giá, cột nhạy cảm vào lọc theo cột. Cột tính trên trình duyệt hoặc theo ngày hôm nay thì lọc bằng ô ở dải lọc.
6. Ô lặp nhiều lần (ô Che, ô trạng thái) dùng `title` thay cho Tooltip của Mantine.

**H. Điện thoại, chạm**
1. Dùng được ở bề rộng 360px, không cuộn ngang cả trang; bảng cuộn ngang trong khung. Lưới CSS dùng `minmax(0, 1fr)`, không dùng `1fr`.
2. Vùng chạm ≥ 24×24px; trên điện thoại ô nhập, nút cao 40px (CSS chung).
3. Popup lớn toàn màn hình trên điện thoại: `fullScreen={useMobile()}`.

**I. Ngữ nghĩa, truy cập**
1. Mỗi màn một `h1` (`PageTitle`), mục con `h2`, `h3` theo thứ tự.
2. Phần tử bấm được là `button` hoặc `a`, không dùng `div` có `onClick`.
3. Ô tích trong ma trận có nhãn đọc được (vai trò, màn hình, hành động).
4. Hiệu ứng tôn trọng `prefers-reduced-motion` (theme và CSS chung đã bật).

## 13. Quy tắc hiệu năng

Vấn đề chính của frontend là vẽ lại thừa, không phải mạng hay kích thước gói. Các quy tắc dưới đây đã áp cho mọi màn hiện có; màn mới phải giữ.

1. **Ô lọc, ô tìm giữ chữ đang gõ cục bộ.** Dùng `DebouncedTextInput`, `DebouncedAutocomplete` (mục 9.5); không đặt chữ đang gõ ở state của cả màn. Ô lọc đọc state của màn, không đọc thẳng URL (URL đổi trong `startTransition` nên giá trị về chậm một nhịp). Ví dụ: `useUrlFilter` trong `features/order/common.tsx` giữ bộ lọc ở state, mỗi lần đổi ghi URL và về trang 1 trong cùng một lần ghi.
2. **`columns` ổn định.** Khai báo ở cấp module hoặc `useMemo`; mảng rỗng khi chưa có dữ liệu dùng hằng cấp module (`NO_LINES`, `NO_POS`, `NO_DEPTS`…), không viết `?? []` tại chỗ. Cột có `render` đọc dữ liệu ngoài dòng (tên chi nhánh, tên chuyền, chính sách cột) thì đưa dữ liệu đó vào phụ thuộc của `columns`, nếu không ô sẽ hiện giá trị cũ (dòng của `DataGrid` memo). Cột Chi nhánh dùng `withBranchNames`.
3. **Memo theo dòng.** `DataGrid` đã memo từng dòng và đọc hàm của trang qua ref. Bảng, ma trận lớn tự dựng thì tách dòng hoặc ô thành component `memo` nhận prop kiểu nguyên thủy, hàm đổi ô ổn định (`useCallback` với hàm cập nhật state). Ví dụ: `PolicyCell` (`features/admin/FieldPoliciesPage.tsx`), `ResourceRow`, `Tick` (`PermissionsPage.tsx`), `UserRow` (`UsersPage.tsx`), `BoardRow`, `LineBoard` (`features/order/LineBoard.tsx`), `WeekStrip`, `PrepSummary`, `DeptRow`, `Card`.
4. **Hàm lấy giá trị lọc ổn định.** `loadValues` dựng bằng `useMemo` theo object bộ lọc đã qua `useStableByKey`, để nút lọc (memo) không vẽ lại.
5. **State ở component nhỏ nhất cần nó.** Lưới đang sửa trong một khung của màn (ví dụ sửa màu cỡ ở Cập nhật tỷ lệ cắt) là component con giữ các dòng; trang chỉ nhận cờ "đã đổi" để hỏi lại khi rời.
6. **Không Tooltip Mantine trong ô lặp nhiều lần.** Mỗi Tooltip chạy bộ định vị ở mọi lần vẽ kể cả khi đóng; dùng `title` (như `Masked`).
7. **`useAfterClose` sau khi lưu trong popup.** Đóng popup rồi mới làm mới; chỉ làm mới các khóa bị ảnh hưởng, chỉ chờ khóa danh sách đang hiện.
8. **Ô ngày của lưới nhập ghi khi Enter, Tab hoặc rời ô** (`continuousUpdates: false`); ô số, ô chữ ghi theo từng phím để tổng, số còn lại cập nhật khi đang gõ.
9. **Gọi song song.** Dữ liệu đã biết khóa (id trên URL) thì tải song song, không chờ nối tiếp; `fetchAccess` gọi bốn API quyền bằng `Promise.all`.
10. **Popup chỉ mount khi mở**; tab ít dùng trong ngăn kéo chỉ mount khi mở lần đầu.
11. **Gói tải:**
    - route nạp lười theo màn, `preloadPage` tải trước khi rê chuột, Tab tới liên kết;
    - icon Tabler, thành phần Mantine import theo tên;
    - chỉ gom `vendor-react` và `vendor-query`; không gom cả JS Mantine vào một gói (các thành phần chỉ màn khác dùng sẽ bị tải ngay lúc mở trang);
    - **cấm tách CSS của Mantine ra file riêng:** file đó nạp sau CSS ứng dụng nên các ghi đè trong `global.css` (cỡ nút, ô nhập, chữ) mất tác dụng ở bản build. CSS giữ một file theo đúng thứ tự import ở `main.tsx`.
12. **Không làm** (chưa cần): ảo hóa `DataGrid` (lưới đã phân trang 100 dòng), bật React Compiler (đổi chuỗi build, cần quyết định mới ở [13-quyet-dinh.md](13-quyet-dinh.md)).

## 14. Đo hiệu năng

- Lệnh: `npm run perf -w frontend` (cấu hình `frontend/vitest.perf.config.ts`). Không nằm trong `npm test`.
- File trong `frontend/src/perf/`:
  - `measure.tsx`: khung giống ứng dụng (`Shell`: Mantine `env="test"`, `ModalsProvider`, `QueryClient` riêng, `MemoryRouter`, bọc `Profiler`), `measure(fn)` (thời gian React vẽ và số lần commit trong một thao tác), `record`, `printResults` (in bảng Markdown ra console: trung vị, tổng, số commit), `signIn(permissions, fieldPolicies)` (đặt store phiên giả), `settle(ms)`;
  - `datagrid.perf.tsx`: `DataGrid` 100 dòng × 18 cột và 100 dòng × 41 cột với 32 ô Che mỗi dòng: dựng lưới, bấm chọn dòng, trang vẽ lại vì state khác;
  - `filter.perf.tsx`: popup lọc theo cột 500 giá trị, tích một giá trị;
  - `pages.perf.tsx`: màn thật với dữ liệu giả (`vi.mock('../lib/api')`): Thông tin đơn hàng, Kế hoạch chuẩn bị SX (gõ ô lọc, bấm chọn dòng), Chính sách cột 30 cột × 10 vai trò (đổi một ô), Phân quyền 50 màn × 5 hành động (tích một ô), Người dùng 100 dòng (gõ ô tìm).
- Số đo là thời gian React vẽ trong jsdom bằng bản phát triển (`actualDuration` của `Profiler`), chỉ để so trước và sau trên cùng máy, cùng lúc; không phải thời gian thật trên trình duyệt (bản production nhanh hơn nhiều lần). Không cần database, không đăng nhập.
- Kích thước gói: chạy `npm run build -w frontend` và xem kích thước file trong `frontend/dist/assets`.

## 15. Test frontend

- **Công cụ:** Vitest + Testing Library + `@testing-library/jest-dom`, môi trường jsdom (cấu hình ở phần `test` của `frontend/vite.config.ts`). Không cần database, không gọi API thật.
- **Chạy:** `npm test -w frontend` (`vitest run`); một file: `npx vitest run src/test/<file>` trong thư mục `frontend`. `npm test` ở gốc chạy backend (cần database), frontend rồi `test:deploy`; cách chạy chung và bộ database test: [Dữ liệu mẫu và kiểm thử](12-du-lieu-mau-va-kiem-thu.md).
- **`src/test/setup.ts`:**
  - nạp matcher của jest-dom;
  - `afterEach(cleanup)`: không bật `globals` của Vitest nên Testing Library không tự dọn DOM; test import `describe`, `it`, `expect`, `vi` từ `vitest`;
  - `asyncUtilTimeout` 4 giây cho `findBy`, `waitFor` (chạy cả bộ song song thì màn có lưới lớn vẽ chậm);
  - giả `window.matchMedia`, `ResizeObserver`, `Element.prototype.scrollIntoView`, `document.fonts` (jsdom không có).
- **Tổ chức:** mọi test nằm ở `frontend/src/test/` (thư mục phẳng, [Quy ước code](../CODE_CONVENTIONS.md) mục 8), tên `*.test.ts` hoặc `*.test.tsx`, mỗi file một chủ đề; luật tính thuần (`*Rules.ts`, `lib/workCalendar.ts`…) được kiểm bằng gọi hàm, không dựng màn (ví dụ `cutting-progress-rules.test.ts`, `work-calendar.test.ts`). Danh sách file và nội dung từng file: [Dữ liệu mẫu và kiểm thử › Frontend (Vitest)](12-du-lieu-mau-va-kiem-thu.md#frontend-vitest).
- **Cách viết thường dùng:**
  - đặt phiên thẳng vào store: `useSession.getState().set({ status: 'ready', user, branch, permissions: new Set([...]), menu, fieldPolicies })`, và `reset('anonymous')` trong `beforeEach`;
  - bọc `MantineProvider theme={theme}` (thêm `env="test"` để tắt hiệu ứng), `MemoryRouter`, và khi cần `QueryClientProvider` (client mới, `retry: false`), `ModalsProvider`;
  - giả API bằng `vi.mock('../lib/api', ...)` thay `api` bằng `vi.fn()` rồi trả dữ liệu theo đường dẫn; test cách `lib/api.ts` xử lý phiên (`session.test.ts`) thì giả `fetch` bằng `vi.stubGlobal('fetch', ...)`;
  - jsdom không đo được kích thước nên `SheetGrid` không vẽ lưới; test lưới nhập giả `useElementSize` của `@mantine/hooks` (`sheet-typing.test.tsx`, `sheet-filter.test.tsx`, `sewing-plan.test.tsx`). Ô của thư viện vẫn không vẽ ở jsdom: hành vi trong ô kiểm bằng hàm thuần (`parseQty`, `parseSheetDate`, `blockedDeletes`) hoặc trên trình duyệt thật.
- Test chỉ kiểm giao diện phản chiếu đúng. Việc cưỡng chế quyền và lọc `BranchCode` được test ở backend.
