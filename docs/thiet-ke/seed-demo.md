# Dữ liệu khởi tạo cho Demo (seed)

> Toàn bộ là **dữ liệu giả** để demo. Mã nhà máy theo quy ước `A00` (tổng hợp), `A01`, `A02`…; tên hiển thị sửa được ở màn Quản trị → Nhà máy. Mật khẩu không ghi trong repo: seed đọc từ biến môi trường `DEMO_PASSWORD` (xem `.env.example`).
> Nguồn menu: mục 4 `docs/nguon/tong-quan-du-an.md` và `docs/nguon/BẢNG MÔ TẢ GIAO DIỆN MES - ĐƠN HÀNG.docx` (năm màn Đơn hàng, quy ước lưới).
> `npm run migrate` tự chạy seed không dữ liệu mẫu (chỉ tài khoản `admin`) sau khi tạo bảng; máy demo chạy thêm `npm run seed`.
> Máy dùng thật: `SEED_SAMPLE_DATA=false` (mặc định khi `NODE_ENV=production`) hoặc `npm run seed -- --no-sample-data` bỏ tài khoản mẫu (chỉ `admin`), đơn hàng giả (mục 7), phòng ban và nhân viên giả. Vẫn nạp nhà máy, vai trò, quyền, menu, xưởng, chuyền, danh mục, cấu hình chuẩn bị SX, loại phòng ban và chức danh dùng chung. `reset:demo`, `load:bravo`, `sim:board` từ chối chạy khi `false`.
> Code nguồn: `backend/scripts/seed-data.ts` (giữ hai nơi đồng bộ khi sửa), `seed.ts`, `seed-order.ts`. Cập nhật 09/10/2026: thêm vai trò Kế toán, chuyền giả, cột đăng ký, chính sách cột, phạm vi và ngoại lệ mẫu, dữ liệu module Đơn hàng (thay PO demo – ADR 0006).

## 1. Cây menu (`SysMenu`) và tài nguyên (`SysResource`)

Menu 2 cấp, nhóm theo đúng thứ tự trong bảng dưới (đổi tên, thứ tự nhóm theo yêu cầu người dùng 10/10/2026). Mỗi mục cấp 2 gắn một tài nguyên; mục cấp 1 là nhóm, hiện khi có ít nhất một con được phép xem. Mỗi tài nguyên sinh 5 quyền: `view, create, update, delete, export` (mã `module.resource:action`). Tên, đường dẫn, bảng nguồn của tài nguyên hệ thống và tên, thứ tự của nhóm luôn đồng bộ theo seed.

| Nhóm | Mã tài nguyên | Tên menu | Đường dẫn | Bảng nguồn | Mobile |
|---|---|---|---|---|---|
| **Quản trị đơn hàng** `order` | `order.allocation` | Thông tin đơn hàng | `/order/info` | `SalesOrder` | |
| | `order.poallocation` | Phân bổ PO | `/order/po-allocation` | (bảng chép `MES_Sync.osm.OSMData`, task 5.9.12) | |
| | `order.shipment` | Kế hoạch xuất hàng | `/order/shipment` | `ShipmentPlan` | |
| | `order.po` | Cập nhật tỷ lệ cắt | `/order/cut-ratio` | `SalesOrderPo` | |
| | `order.lineplan` | Xếp chuyền | `/order/line-plan` | `ShipmentPlan` | |
| | `order.colorsize` | Phân bổ màu cỡ | `/order/color-size` | `ShipmentPlanLine` | |
| `order.prep` | V | VE | VUE | V | – | – |
| | `order.prep` | Kế hoạch chuẩn bị SX (Phase 5.5; dữ liệu ở module May) | `/order/prep` | | |
| **Quản trị nhà cắt** `cutting` | `cutting.progress` | Đồng bộ tiến độ cắt | `/cutting/progress` | | |
| | `cutting.supply` | Xác nhận cấp BTP | `/cutting/supply` | `CuttingSupply` | |
| | `cutting.embroidery` | Quản lý in thêu | `/cutting/embroidery` | | |
| **Quản trị xưởng may** `sewing` | `sewing.plan` | Kế hoạch may | `/sewing/plan` | | |
| | `sewing.cluster` | Phân cụm trưởng | `/sewing/cluster` | | ✔ |
| | `sewing.output` | Bấm năng suất cụm | `/sewing/output` | | ✔ |
| | `sewing.balance` | Biểu đồ cân bằng chuyền | `/sewing/balance` | | |
| **Quản trị chất lượng** `qms` | `qms.defect` | Danh mục lỗi | `/qms/defect` | | |
| | `qms.endline` | Kiểm Endline | `/qms/endline` | | ✔ |
| | `qms.report` | Báo cáo chất lượng | `/qms/report` | | |
| **Quản trị hoàn thiện** `finishing` | `finishing.plan` | Kế hoạch hoàn thiện | `/finishing/plan` | | |
| | `finishing.folding` | Tiến độ gấp xếp | `/finishing/folding` | | |
| | `finishing.packing` | Tiến độ đóng thùng | `/finishing/packing` | | |
| **Quản trị nhân sự** `hr` | `hr.orgchart` | Sơ đồ tổ chức | `/hr/org-chart` | `Department` (MES_Hr, SHARED) | |
| | `hr.employee` | Thông tin nhân sự | `/hr/employees` | `Employee` (MES_Hr, SHARED) | |
| **Báo cáo quản trị** `report` | `report.prepare` | Kế hoạch chuẩn bị sản xuất | `/report/prepare` | | |
| | `report.progress` | Tiến độ sản xuất | `/report/progress` | | |
| | `report.revenue` | Doanh thu nhà máy | `/report/revenue` | | |
| | `report.hourly` | Sản lượng theo giờ | `/report/hourly` | | |
| **Quản trị** `admin` | `admin.user` | Người dùng | `/admin/users` | | |
| | `admin.role` | Vai trò | `/admin/roles` | | |
| | `admin.permission` | Phân quyền | `/admin/permissions` | | |
| | `admin.fieldpolicy` | Chính sách cột | `/admin/field-policies` | | |
| | `admin.branch` | Nhà máy | `/admin/branches` | | |
| | `admin.audit` | Nhật ký hệ thống | `/admin/audit` | | |
| | `admin.sync` | Đồng bộ dữ liệu | `/admin/sync` | | Xem = theo dõi; Sửa = bấm đồng bộ (ADR 0007) |
| | `admin.catalog` | Danh mục hệ thống | `/admin/catalogs` | | Chuyền may, Đơn vị tính, Loại đơn hàng, Nhà máy sản xuất, Ca làm việc (thêm/sửa/ngừng dùng, không xóa); danh mục BRAVO chỉ xem (Phase 5.4). Lưu ý: ngừng hay thêm chuyền đổi phạm vi dữ liệu của người được giao theo chuyền/cây nhà máy |

Tổng: 33 tài nguyên × 5 hành động = 165 quyền. Màn có nội dung: 5 màn Đơn hàng và 6 màn Quản trị; các màn khác là trang giữ chỗ (đã phân quyền, chờ tài liệu nghiệp vụ).

## 2. Nhà máy (`SysBranch`) và cây tổ chức (`SysOrgUnit`)

| Code | Name | IsAggregate | Xưởng, chuyền giả (ADR 0010) |
|---|---|---|---|
| `A00` | Toàn công ty | ✔ | – |
| `A01` | Nhà máy 1 | | 12 chuyền `A01-L01` … `A01-L12` ("Chuyền 01"…): `A01-X01` "Xưởng 01" gồm L01–L06, `A01-X02` "Xưởng 02" gồm L07–L12 |
| `A02` | Nhà máy 2 | | 8 chuyền `A02-L01` … `A02-L08`: `A02-X01` gồm L01–L04, `A02-X02` gồm L05–L08 |
| `A03` | Nhà máy 3 | | 6 chuyền `A03-L01` … `A03-L06`, không chia xưởng (chuyền thẳng dưới nhà máy) |

`A00` là đơn vị tổng hợp: chọn `A00` thì xem dữ liệu của các nhà máy trong phạm vi, **chỉ đọc**. Không có dòng dữ liệu nào mang `BranchCode = 'A00'`. Mã chuyền cấm sửa; chuyền thật sẽ đồng bộ từ Nhân sự/GSD (5.2).

## 3. Vai trò (`SysRole`)

| Code | Tên | Mô tả |
|---|---|---|
| `ADMIN` | Quản trị hệ thống | Quản lý người dùng, vai trò, phân quyền; chỉ xem dữ liệu nghiệp vụ |
| `DIRECTOR` | Giám đốc | Xem và xuất mọi nghiệp vụ, kể cả Doanh thu; không tạo/sửa |
| `PLANNER` | Kế hoạch | Toàn quyền khối Đơn hàng; lập kế hoạch may và hoàn thiện |
| `LINE_LEADER` | Trưởng chuyền | Phân cụm, bấm năng suất, ghi tiến độ gấp xếp/đóng thùng; phân màu cỡ cho chuyền mình |
| `QC` | Kiểm hàng | Danh mục lỗi, kiểm Endline, báo cáo chất lượng |
| `ACCOUNTANT` | Kế toán | Xem và xuất đơn hàng, doanh thu; thấy giá nhưng không sửa |
| `HR` | Nhân sự | Quản lý sơ đồ tổ chức và hồ sơ nhân viên; không xem nghiệp vụ sản xuất (Phase 5.8, ADR 0012) |
| `FULL_ACCESS` | Toàn quyền | Mọi quyền xem, thêm, sửa, xóa, xuất file trên mọi màn nghiệp vụ; quyền quản trị bằng ADMIN đang có; mọi cột nhạy cảm Sửa được. Không có cột trong bảng ma trận dưới: quyền tính theo quy tắc này (`fullAccessLetters`, ADR 0014). Vẫn theo luật chung: ghi dữ liệu theo ĐVCS đang làm việc, không tự đổi quyền của mình |

## 4. Ma trận Role × Tài nguyên × Hành động

Ký hiệu: **V** xem · **C** thêm · **U** sửa · **D** xóa · **E** xuất file · `–` không có quyền. Không có quyền xem thì mọi hành động khác của tài nguyên cũng mất (ADR 0006).

| Tài nguyên | ADMIN | DIRECTOR | PLANNER | LINE_LEADER | QC | ACCOUNTANT | HR |
|---|---|---|---|---|---|---|---|
| `order.allocation` | V | VE | VCUDE | – | – | VE | – |
| `order.poallocation` | V | VE | VE | – | – | VE | – |
| `order.shipment` | V | VE | VCUDE | – | – | VE | – |
| `order.po` | V | VE | VCUDE | V | – | VE | – |
| `order.lineplan` | V | VE | VCUDE | V | – | VE | – |
| `order.colorsize` | V | VE | VCUDE | VU | – | VE | – |
| `cutting.progress` | V | VE | V | V | – | – | – |
| `cutting.supply` | V | VE | VCUDE | – | – | – | – |
| `cutting.embroidery` | V | VE | V | – | – | – | – |
| `sewing.plan` | V | VE | VCUE | V | – | – | – |
| `sewing.cluster` | V | VE | V | VCU | – | – | – |
| `sewing.output` | V | VE | V | VCU | V | – | – |
| `sewing.balance` | V | VE | V | V | – | – | – |
| `finishing.plan` | V | VE | VCUE | V | – | – | – |
| `finishing.folding` | V | VE | V | VCU | – | – | – |
| `finishing.packing` | V | VE | V | VCU | – | – | – |
| `qms.defect` | V | VE | V | V | VCUD | – | – |
| `qms.endline` | V | VE | V | V | VCUE | – | – |
| `qms.report` | V | VE | V | V | VE | – | – |
| `hr.orgchart` | V | VE | – | – | – | – | VCUE |
| `hr.employee` | V | VE | – | – | – | – | VCUE |
| `report.prepare` | V | VE | VE | – | – | – | – |
| `report.progress` | V | VE | VE | – | – | VE | – |
| `report.revenue` | V | VE | – | – | – | VE | – |
| `report.hourly` | V | VE | V | V | – | – | – |
| `admin.user` | VCUD | – | – | – | – | – | – |
| `admin.role` | VCUD | – | – | – | – | – | – |
| `admin.permission` | VU | – | – | – | – | – | – |
| `admin.fieldpolicy` | VU | – | – | – | – | – | – |
| `admin.branch` | VCU | – | – | – | – | – | – |
| `admin.audit` | VE | – | – | – | – | – | – |
| `admin.sync` | VU | – | – | – | – | – | – |
| `admin.catalog` | VCU | – | – | – | – | – | – |

## 5. Tài khoản mẫu – năm người mẫu của phương án nền tảng (mục 4.4) và quản trị

| Username | Họ tên | Role | Đơn vị cơ sở được chọn | Phạm vi, ngoại lệ, cột riêng, nhà máy SX |
|---|---|---|---|---|
| `admin` | Quản trị hệ thống | `ADMIN`, `FULL_ACCESS` (ADR 0014) | `A00`–`A03` | – |
| `quantri` | Ngô Văn Quân | `ADMIN` | `A00`–`A03` | Quản trị chỉ xem nghiệp vụ, cột giá Ẩn (minh họa tách nhiệm vụ, ADR 0004) |
| `giamdoc` | Phạm Quốc Hưng | `DIRECTOR` | `A00`, `A01` | – |
| `kehoach.a` | Lê Thị Mai | `PLANNER` | `A01` | Nhà máy SX: `A01`, `A01-B` (Phase 5.9) |
| `truongchuyen.a` | Nguyễn Văn Tâm | `LINE_LEADER` | `A01` | Chuyền: `A01-L03` (Trưởng chuyền 3) |
| `truongchuyen.b` | Hoàng Minh Bảo | `LINE_LEADER` | `A01` | Chuyền: `A01-L03`; **Allow** `order.shipment:view` đến 31/12/2026; **cột riêng** Giá CM ở Xếp chuyền: Chỉ đọc đến 31/12/2026 |
| `ketoan` | Đỗ Thu Hà | `ACCOUNTANT` | `A00`–`A03` | Nhà máy: `A01`, `A02` (ở `A03` không có quyền gì) |
| `nhansu` | Trịnh Thu Hằng | `HR` | `A00`–`A03` | – (dữ liệu nhân sự dùng chung toàn công ty, Phase 5.8) |

Mật khẩu chung là `DEMO_PASSWORD`. Họ tên là tên giả.

Nhà máy SX mẫu (Phase 5.9, ADR 0013, chỉ khi có dữ liệu mẫu): `A01` Nhà máy 1 và `A01-B` Nhà máy 1B thuộc ĐVCS `A01`; `A02`, `A03` thuộc ĐVCS cùng mã. Đơn hàng mẫu chọn sẵn Nhà máy SX (một phần đơn của A01 ở `A01-B`, vài đơn của chi nhánh A02 cũng may ở `A01-B`). Đơn vị cơ sở `A01`–`A03` mẫu chỉ tạo khi có dữ liệu mẫu; có `MES_Sync` thì seed chép thêm, đổi tên theo danh mục chi nhánh BRAVO.

## 6. Cột đăng ký và chính sách cột mẫu

Cột của các tài nguyên Đơn hàng được đăng ký trong `SysResourceField` (mã trùng trường JSON của API); `order.poallocation` (Phân bổ PO) đăng ký đủ 12 cột, không cột nào nhạy cảm. Cột nhạy cảm (mặc định **Ẩn** khi vai trò không khai báo): `order.allocation` → `unitPrice` (Đơn giá), `amount` (Thành tiền), `cmPrice` (Giá CM); `order.lineplan` → `cmPrice` (Giá CM), `revenue` (Doanh số).

| Vai trò | Thông tin đơn hàng | Xếp chuyền | Phân bổ màu cỡ | Cập nhật tỷ lệ cắt |
|---|---|---|---|---|
| `DIRECTOR`, `ACCOUNTANT` | Đơn giá, Thành tiền, Giá CM: Chỉ đọc | Giá CM, Doanh số: Chỉ đọc | – | – |
| `PLANNER` | Đơn giá, Thành tiền: Chỉ đọc; Giá CM: Sửa được | Giá CM, Doanh số: Chỉ đọc | – | – |
| `LINE_LEADER` | (không có quyền xem) | Khách hàng: **Che** (`***`); giá: Ẩn (mặc định) | Khách hàng: **Che** | Khách hàng: **Che** |
| `ADMIN`, `QC` | giá: Ẩn (mặc định) | giá: Ẩn (mặc định) | – | – |
| `FULL_ACCESS` | mọi cột nhạy cảm: Sửa được | mọi cột nhạy cảm: Sửa được | – | – |

Chính sách cột tính theo màn hình: tên khách hàng có ở ba màn Trưởng chuyền xem được nên phải che ở cả ba (ADR 0006). Cột bị Ẩn hoặc Che thì không lọc, không tìm, không gợi ý theo cột đó.

**Thông tin nhân sự** (`hr.employee`, Phase 5.8, ADR 0012):
- cột đăng ký: `email`, `birthPlace`, `hometown`, và 5 cột nhạy cảm `birthDate`, `idNumber`, `contactPhone`, `contactPerson`, `currentAddress`;
- `HR`, `FULL_ACCESS`: 5 cột nhạy cảm Sửa được; `DIRECTOR`: Che (`***`); vai trò khác: Ẩn (mặc định).

Dữ liệu nhân sự giả (`MES_Hr`): xem `docs/thiet-ke/db-hr.md`, mục Dữ liệu giả và reset.

## 7. Dữ liệu module Đơn hàng (`MES_Order`)

Sinh bằng `backend/scripts/seed-order.ts`, xác định theo hạt giống (chạy lại cho cùng kết quả), mốc ngày demo 09/10/2026. Khách hàng là tên hư cấu (Nordic Trail AB, Alpenhaus GmbH, Coastline Apparel Ltd, Sakura Sports KK, Maple Workwear Inc, Baltic Knit OÜ).

| | A01 | A02 | A03 |
|---|---|---|---|
| Đơn hàng | 16 | 10 | 8 |
| PO (1–3 PO mỗi đơn, 2–3 màu × 4–5 cỡ) | | tổng 65 | |
| Kế hoạch xuất hàng (khoảng 4/5 đơn, một số tách hai đợt) | | tổng 35 | |
| Dòng dàn chuyền (khoảng 3/4 kế hoạch, 1–3 chuyền) | | tổng 38 | |

Ở A01, chuyền 3 (`A01-L03`) luôn có việc để demo Trưởng chuyền 3. Dòng dàn chuyền đã vào chuyền trước ngày demo ở trạng thái Đang may; kế hoạch tương ứng có lũy kế cắt, may ra, Endline, hoàn thiện tỷ lệ với thời gian đã may.

Đưa dữ liệu về ban đầu: `npm run reset:demo -- --yes` (chỉ SQL Server trên máy này; từ chối khi `SEED_SAMPLE_DATA=false`).

## 8. Kịch bản kiểm thử phân quyền
Test tự động: `backend/test/auth.spec.ts`, `phase3.spec.ts`, `review-fixes.spec.ts`, `phase5.spec.ts`. Kịch bản thử tay: `docs/kich-ban-demo.md`, mục "Kiểm thử phân quyền".

| # | Kịch bản | Kết quả mong đợi |
|---|---|---|
| 1 | `kehoach.a` ở `A01` xem Kế hoạch xuất hàng | Chỉ kế hoạch của `A01` (từ Phase 5.9 Thông tin đơn hàng dùng chung, kiểm lọc ĐVCS trên kế hoạch) |
| 2 | `kehoach.a` gọi kế hoạch theo Id của dòng `A02` (xem, sửa, xóa) | 404 |
| 3 | `kehoach.a` gửi `branchCode=A02` | Bị bỏ qua |
| 4 | `kehoach.a` tạo đơn hàng | `BranchCode = A01` (Chi nhánh FOB), số `DH-A01-xxxxxx`; ĐVCS khác cũng thấy (đơn hàng dùng chung) |
| 5–6 | `giamdoc` đăng nhập; chọn `A02` | Danh sách `A00`, `A01`; chọn `A02` bị 403 `BRANCH_NOT_ALLOWED` |
| 7–8 | `giamdoc` ở `A00` | Thấy mọi nhà máy; ghi bị 403 `AGGREGATE_READ_ONLY` |
| 10–11 | `truongchuyen.a` | Báo cáo chỉ còn Sản lượng theo giờ, không có Quản trị; sửa tỷ lệ cắt 403 |
| 14 | `admin` bỏ `order.po:view` của `PLANNER` | `kehoach.a` mất menu Cập nhật tỷ lệ cắt và API 403 ngay lần tải kế tiếp |
| 15–17 | Tự sửa quyền mình; đổi mã nhà máy; audit | 403 `SELF_ELEVATION_FORBIDDEN`; 422 `CODE_IMMUTABLE`; có `SysAuditLog` |
| 19 | `truongchuyen.a` xem Phân bổ màu cỡ, bảng dàn chuyền | Chỉ chuyền 3; dòng chuyền khác 404 |
| 20 | Nam: Trưởng chuyền ở A01, Giám đốc ở A02 | Ở A02 không có quyền sửa của Trưởng chuyền; ở A01 không có Doanh thu |
| 21 | Phạm vi "chỉ của mình" | Không thấy, không sửa được đơn của người khác |
| 22 | `ketoan` ở `A00` / `A03` | Kế hoạch: chỉ thấy A01, A02; đơn hàng: thấy hết (dùng chung) / không có quyền gì |
| 27 | Chọn mã hàng khi lập kế hoạch xuất hàng (Phase 5.9) | Chỉ đơn có Nhà máy SX được tích, ở mọi ĐVCS; chưa được tích nhà máy nào thì trống; đơn ngoài danh sách: PO, lưới màu cỡ, tạo kế hoạch 404 |
| 28 | Người ở ĐVCS `A02` lập kế hoạch cho đơn của chi nhánh `A01` (nhà máy SX được tích) | Kế hoạch mang `A02` (`KH-A02-…`), phiên `A01` không thấy; SL đã lập của đơn cộng cả hai ĐVCS |
| 23 | Deny `order.allocation:view` cho `kehoach.a` | Mất menu, danh sách, xuất file, đường sửa; gỡ là có lại |
| 24 | `truongchuyen.b` | Có thêm Kế hoạch xuất hàng (Allow), thấy Giá CM ở Xếp chuyền (cột riêng) |
| 25 | Cột Ẩn, Che, Chỉ đọc | Ẩn: không có trong JSON và file xuất; Che: `***`; ghi vào cột Chỉ đọc: 403 `FIELD_READONLY` |
| 26 | Hai người cùng lập kế hoạch hết số lượng còn lại | Chỉ một người được |
