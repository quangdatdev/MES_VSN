# Tổng quan hệ thống MES Vietsun

File này cho biết MES Vietsun là gì, đang có những phần nào, chưa có phần nào, và giải nghĩa các thuật ngữ dùng trong toàn bộ tài liệu. Đọc đầu tiên khi mới vào dự án.

## Hệ thống là gì

MES (Manufacturing Execution System) cho Vietsun, công ty may mặc nhiều nhà máy. Trục dữ liệu nghiệp vụ:

```
Đơn hàng, PO (BRAVO) → Phân bổ PO cho nhà máy (OSM) → Kế hoạch xuất hàng → Tỷ lệ cắt → Xếp chuyền, phân màu cỡ
  → Chuẩn bị sản xuất → Cắt → May → Endline (QMS) → Hoàn thiện → Đóng thùng → Xuất hàng
```

- Chạy trên trình duyệt máy tính và điện thoại, cùng một bộ code (giao diện co giãn theo màn hình; có manifest PWA nhưng chưa có service worker).
- Dữ liệu gốc về đơn hàng, PO, phân bổ PO nằm ở hệ thống ngoài (BRAVO, OSM). MES chép về và chỉ đọc nguồn, không ghi ngược.
- Dữ liệu phát sinh trong MES (kế hoạch, xếp chuyền, tỷ lệ cắt, chuẩn bị SX, nhân sự) do MES quản lý, có nhật ký.
- Phân quyền chặt theo đơn vị cơ sở, chuyền, cột dữ liệu; backend cưỡng chế, giao diện chỉ ẩn/hiện ([Phân quyền](04-phan-quyen.md)).

## Các khối đang có

| Khối | Nội dung | Tài liệu |
|---|---|---|
| Nền tảng | Đăng nhập, chọn ĐVCS, menu động theo quyền, phân quyền 5 lớp, nhật ký, xuất file | [Kiến trúc](03-kien-truc.md), [Phân quyền](04-phan-quyen.md) |
| Quản trị | Người dùng, Vai trò, Phân quyền, Chính sách cột, Đơn vị cơ sở, Danh mục hệ thống, Nhật ký | [Quản trị hệ thống](05-quan-tri-he-thong.md) |
| Đơn hàng | Thông tin đơn hàng, Phân bổ PO, Kế hoạch xuất hàng, Cập nhật tỷ lệ cắt, Xếp chuyền, Phân bổ màu cỡ; nạp đơn hàng từ BRAVO, dàn chuyền mô phỏng | [Đơn hàng](06-don-hang.md) |
| May | Kế hoạch chuẩn bị SX (đặt trong nhóm menu Quản trị đơn hàng), danh mục Cấu hình chuẩn bị SX | [May](07-may.md) |
| Nhân sự | Sơ đồ tổ chức (kể cả chuyền may: bộ phận tích "Xưởng sản xuất"), Thông tin nhân sự, nhập nhân viên từ Excel, danh mục Loại phòng ban | [Nhân sự](08-nhan-su.md) |
| Đồng bộ | Chép view BRAVO (qua database trung gian) và OSM vào `MES_Sync`, màn Đồng bộ dữ liệu | [Đồng bộ](09-dong-bo.md) |

## Menu và màn hình

Menu lấy từ database theo quyền của người dùng (`SysMenu`, `SysResource`). Đường dẫn nào chưa có màn thật thì hiện **trang giữ chỗ** cho biết quyền của người dùng ở màn đó (`frontend/src/features/module/ModulePage.tsx`). Danh sách dưới đây theo `backend/scripts/seed-data.ts` (`resources`) và `frontend/src/routes/registry.tsx`.

| Nhóm menu | Màn | Mã tài nguyên | Đường dẫn | Tình trạng |
|---|---|---|---|---|
| Quản trị đơn hàng | Thông tin đơn hàng | `order.allocation` | `/order/info` | Đã có |
| | Phân bổ PO | `order.poallocation` | `/order/po-allocation` | Đã có (xem; sửa Nhà máy SX) |
| | Kế hoạch xuất hàng | `order.shipment` | `/order/shipment` | Đã có |
| | Cập nhật tỷ lệ cắt | `order.po` | `/order/cut-ratio` | Đã có |
| | Xếp chuyền | `order.lineplan` | `/order/line-plan` | Đã có |
| | Phân bổ màu cỡ | `order.colorsize` | `/order/color-size` | Đã có |
| | Kế hoạch chuẩn bị SX | `order.prep` | `/order/prep` | Đã có (code, dữ liệu thuộc module May) |
| Quản trị nhà cắt | Đồng bộ tiến độ cắt | `cutting.progress` | `/cutting/progress` | Đã có (phase 5.14, [Module Cắt](15-cat.md)) |
| | Xác nhận cấp BTP | `cutting.supply` | `/cutting/supply` | Đã có (phase 5.15, [Module Cắt](15-cat.md)) |
| | Quản lý in thêu | `cutting.embroidery` | `/cutting/embroidery` | Trang giữ chỗ |
| Quản trị xưởng may | Kế hoạch may, Phân cụm trưởng, Bấm năng suất cụm, Biểu đồ cân bằng chuyền | `sewing.*` | `/sewing/*` | Kế hoạch may có màn thật (phase 5.16, [May](07-may.md)); các màn còn lại là trang giữ chỗ |
| Quản trị chất lượng | Danh mục lỗi, Kiểm Endline, Báo cáo chất lượng | `qms.*` | `/qms/*` | Trang giữ chỗ |
| Quản trị hoàn thiện | Kế hoạch hoàn thiện, Tiến độ gấp xếp, Tiến độ đóng thùng | `finishing.*` | `/finishing/*` | Trang giữ chỗ |
| Quản trị nhân sự | Sơ đồ tổ chức | `hr.orgchart` | `/hr/org-chart` | Đã có |
| | Thông tin nhân sự | `hr.employee` | `/hr/employees` | Đã có |
| Báo cáo quản trị | Kế hoạch chuẩn bị sản xuất, Tiến độ sản xuất, Doanh thu nhà máy, Sản lượng theo giờ | `report.*` | `/report/*` | Trang giữ chỗ |
| Quản trị | Người dùng, Vai trò, Phân quyền, Chính sách cột, Đơn vị cơ sở, Danh mục hệ thống, Nhật ký hệ thống, Đồng bộ dữ liệu | `admin.*` | `/admin/*` | Đã có |

Trang chủ (`/`) và màn đăng nhập (`/login`) nằm ngoài menu. Đường dẫn cũ `/sewing/prep` tự chuyển sang `/order/prep`.

## Hệ thống ngoài

| Hệ thống | Vai trò với MES | Cách kết nối |
|---|---|---|
| BRAVO (ERP) | Nguồn đơn hàng, PO, màu cỡ, danh mục (chi nhánh, khách hàng, sản phẩm…) | Chỉ đọc view của **database trung gian** (`DB_TRUNGGIAN_NAME`), không đọc thẳng database BRAVO. Thủ tục trong `MES_Sync` chép về (phần lớn nguồn chép tăng dần), chạy khi quản trị bấm Đồng bộ; chưa có lịch tự chạy ([Đồng bộ](09-dong-bo.md)) |
| OSM | Nhà máy SX của từng đơn hàng (`vOSMDataFty`), phân bổ PO theo nhà máy (`v_OSMData`) | Chỉ đọc view, chép vào `MES_Sync.osm` |
| GSD | Quy trình, cụm công đoạn, sơ đồ chuyền | Chưa kết nối |
| Hệ thống nhân sự có sẵn | Không dùng: MES tự quản dữ liệu nhân sự (ADR 0012) | – |

## Chưa có (ngoài phạm vi hiện tại)

- Các module Cắt (trừ Đồng bộ tiến độ cắt), May (trừ Kế hoạch chuẩn bị SX), QMS, Hoàn thiện, Báo cáo: mới có menu và quyền mẫu, chưa có màn.
- Realtime qua WebSocket cho dữ liệu phát sinh trong MES.
- Kết nối GSD; ánh xạ đơn hàng BRAVO theo đặc tả chính thức của BA (đang dùng giả định tạm, xem [Đơn hàng](06-don-hang.md)).
- SSO/AD, ủy quyền tạm thời, luồng phê duyệt, kiểm tra tách nhiệm vụ.
- Giới hạn tần suất đăng nhập (rate limit), phát hiện dùng lại refresh token, hạn tuyệt đối của phiên.
- Màn tự đổi mật khẩu, bắt đổi mật khẩu lần đầu.
- Danh mục Chức danh sửa trên màn hình (hiện chỉ có dữ liệu seed).

Việc đang chờ và câu hỏi mở: [Trạng thái](02-trang-thai.md).

## Thuật ngữ

### Tổ chức và dữ liệu theo đơn vị

| Thuật ngữ | Nghĩa trong MES |
|---|---|
| **Đơn vị cơ sở (ĐVCS)** | Đơn vị ghi nhận dữ liệu, theo danh mục chi nhánh của BRAVO (`DM_CHINHANH`). Lưu ở bảng `SysBranch`, mã ngắn `A01`, `A02`…; cột `BranchCode` của mọi bảng nghiệp vụ là mã ĐVCS. Người dùng chọn một ĐVCS khi đăng nhập, đổi được ở thanh trên. Mã không sửa được, tên sửa được. Tên bảng, cột vẫn giữ chữ "Branch" (ADR 0013) |
| **`A00` – đơn vị tổng hợp** | ĐVCS đặc biệt (`SysBranch.IsAggregate = 1`): xem dữ liệu của mọi ĐVCS, **chỉ đọc** với dữ liệu theo ĐVCS, không gắn dữ liệu. Muốn ghi thì chọn một ĐVCS cụ thể |
| **Nhà máy SX** | Nhà máy sản xuất thực tế, danh mục riêng `SysProductionFactory`; mỗi nhà máy thuộc một ĐVCS. Mã là tên nhà máy theo OSM (ví dụ `VIET DUC`). Khác với ĐVCS: một ĐVCS có thể có nhiều nhà máy SX |
| **Chi nhánh FOB** | Nhãn trên màn hình cho `BranchCode` của đơn hàng: ĐVCS nhận đơn ở BRAVO, hoặc ĐVCS của người nhập tay |
| **ĐVCS nguồn** | ĐVCS sở hữu một dòng dữ liệu dùng chung (đơn hàng, PO). Dữ liệu dùng chung đọc được ở mọi ĐVCS nhưng chỉ ĐVCS nguồn ghi được, trừ ngoại lệ PO trong kế hoạch ([Phân quyền](04-phan-quyen.md)) |
| **Chuyền may (Tổ SX)** | Bộ phận được tích "Xưởng sản xuất" ở Nhân sự › Sơ đồ tổ chức (`MES_Hr.Department.IsProductionWorkshop`), thuộc một ĐVCS. Mã chuyền là mã bộ phận; dữ liệu nghiệp vụ gắn vào chuyền qua `LineCode`. Ô chọn chuyền gom theo bộ phận cha (thường là xưởng). Phạm vi của Trưởng chuyền lưu theo mã chuyền ([Quyết định](13-quyet-dinh.md) mục 6.7) |
| **Chuyền cũ (mồ côi)** | Mã chuyền trên dữ liệu đã xếp mà không còn là bộ phận chuyền nào (chuyền của danh mục chuyền trước đây, bộ phận đã bỏ tích): vẫn giữ mã, hiện "<mã> (chuyền cũ)", không nhận việc mới |
| **Phòng ban** | Cây tổ chức của module Nhân sự (`MES_Hr.Department`), có nút cấp công ty không thuộc ĐVCS nào (ADR 0012). Cây `SysOrgUnit` của phần quản trị chỉ còn nút ĐVCS (cho phạm vi theo ĐVCS) |

### Nghiệp vụ đơn hàng và sản xuất

| Thuật ngữ | Nghĩa trong MES |
|---|---|
| **Đơn hàng** (`SalesOrder`) | Một đơn theo mã hàng của khách, chép từ BRAVO hoặc nhập tay. Dùng chung toàn công ty |
| **PO** (`SalesOrderPo`) | Lệnh giao hàng của khách thuộc một đơn hàng: số lượng, ngày xuất, đích đến, chia theo **màu cỡ** (`SalesOrderPoColorSize`) |
| **Mã hàng** | Mã kiểu sản phẩm (style) của đơn hàng |
| **Màu cỡ** | Tổ hợp màu × cỡ; số lượng của PO, kế hoạch, chuyền đều chia theo màu cỡ |
| **Phân bổ PO** | PO, màu nào của đơn nào (SO, mã hàng) về nhà máy SX nào, ngày xuất theo OSM (view `v_OSMData`, không có cột số lượng). Màn hiện dữ liệu chép từ OSM; Nhà máy SX sửa tay được ("Nhập tay"), giữ qua các lần đồng bộ ([Đơn hàng](06-don-hang.md)) |
| **Kế hoạch xuất hàng (KHXH)** (`ShipmentPlan`) | Kế hoạch của một ĐVCS cho một đơn hàng: chọn PO, số lượng theo màu cỡ (**SL KHXH**), ngày xuất. Theo ĐVCS lập |
| **Tỷ lệ cắt** | Số lượng theo màu cỡ của từng PO, được xác nhận ở màn Cập nhật tỷ lệ cắt (PO "Đã xác nhận" thì khóa) |
| **Xếp chuyền, dàn chuyền** | Gán kế hoạch xuất hàng cho chuyền theo khoảng ngày (`ShipmentPlanLine`), xem dạng thanh trên lịch; **NSBQ** là năng suất bình quân của chuyền |
| **Kế hoạch chuẩn bị SX** | Các bước chuẩn bị (mẫu, NPL, thiết kế chuyền…) trước ngày **vào chuyền (V/C)** của từng dòng dàn chuyền: ngày **KH** (kế hoạch) tính từ ngày V/C, ngày **TH** (thực hiện) người dùng nhập |
| **BTP** | Bán thành phẩm (dùng ở module Cắt, chưa làm) |

### Phân quyền

| Thuật ngữ | Nghĩa trong MES |
|---|---|
| **Tài nguyên** (`SysResource`) | Một màn hoặc nhóm dữ liệu, mã dạng `module.resource` (ví dụ `order.po`). Khai báo phạm vi `BRANCH` (theo ĐVCS) hoặc `SHARED` (dùng chung) và bảng nguồn |
| **Quyền** | `module.resource:action`, hành động là `view`, `create`, `update`, `delete`, `export` (chữ tắt trong ma trận mẫu: V, C, U, D, E) |
| **Vai trò** | Tập quyền gán cho người dùng. Vai trò hệ thống không xóa được. **Toàn quyền** (`FULL_ACCESS`) là vai trò có mọi quyền nghiệp vụ và quản trị (ADR 0014) |
| **Phạm vi** | Giới hạn dữ liệu theo phép gán vai trò: theo chuyền/xưởng, theo danh sách giá trị, theo người tạo |
| **Chính sách cột** | Mức của từng cột nhạy cảm theo vai trò hoặc người: **Ẩn**, **Che** (trả `***`), **Chỉ đọc**, **Sửa được** |
| **Ngoại lệ theo người** | Cho thêm hoặc cấm một quyền với riêng một người, có hạn dùng, bắt buộc lý do |
| **Trần quyền quản trị** | Người quản trị chỉ cấp được quyền `admin.*` mà chính mình đang có, không tự đổi quyền của mình |
| **Phiên bản quyền** | Số đếm (`SysPermissionVersion`) tăng khi quyền đổi, để bộ nhớ đệm quyền của mọi phiên tải lại |

### Kỹ thuật

| Thuật ngữ | Nghĩa trong MES |
|---|---|
| **`BaseRepository`** | Lớp truy vấn dùng chung ở `backend/src/platform/data`, tự gắn điều kiện ĐVCS, phạm vi, kiểm quyền ghi. Mọi truy vấn nghiệp vụ phải đi qua đây |
| **Bảng dùng chung (SHARED)** | Bảng không lọc theo ĐVCS khi đọc (đơn hàng, PO, nhân sự, danh mục) |
| **Khóa ngầm** | Quan hệ giữa hai database khác nhau (không có khóa ngoại vật lý), khai báo ở `backend/migrations/softkeys.json`, kiểm bằng `npm run check:softkeys -w backend` |
| **Database trung gian** | Database chứa view BRAVO dành cho MES (`DB_TRUNGGIAN_NAME`); MES chỉ đọc ở đây |
| **Bảng chép** | Bảng trong `MES_Sync` (schema `bravo`, `osm`) chứa bản chép của view nguồn |
| **Nạp tăng dần** | Bước backend đưa đơn hàng BRAVO đã chép vào `MES_Order` sau mỗi đợt đồng bộ (bật/tắt bằng `BRAVO_ORDER_IMPORT`) |
