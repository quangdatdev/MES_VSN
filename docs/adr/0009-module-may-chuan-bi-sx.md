# ADR 0009 – Module May: database MES_Sewing, Kế hoạch chuẩn bị SX chép từ dàn chuyền

**Trạng thái:** Accepted (người dùng chốt 10/10/2026; duyệt cùng Phase 5.5) · **Ngày:** 10/10/2026

## Bối cảnh
Người dùng yêu cầu màn **Quản trị xưởng may › Kế hoạch chuẩn bị SX** theo file mẫu `docs/nguon/Copy of TNG TT CHUAN BI SX.xls`:
- **Cột cố định A–H:** STT, Chi nhánh, Tổ SX, Mã hàng, Loại mã, Số lượng chốt UD, HS Ưu đãi VC, Ngày vào chuyền.
- **Cặp cột KH, TH cho từng bước chuẩn bị:** các bước lấy từ danh mục **Cấu hình chuẩn bị SX** (`docs/nguon/danh-muc-cau-hinh-chuan-bi-san-xuat.png`).
- **Cột cuối:** Trạng thái.

Người dùng chốt:
- mỗi dòng là một dòng dàn chuyền;
- số ngày KH sửa ở danh mục và ở từng dòng;
- dữ liệu ở database mới `MES_Sewing`;
- Loại mã, Số lượng chốt UD, HS Ưu đãi VC nhập tay tạm.

Dòng dàn chuyền nằm ở `MES_Order.ShipmentPlanLine` (module Đơn hàng). CLAUDE.md đặt ba ràng buộc:
- mỗi module một database;
- module không đọc bảng của module khác, chỉ giao tiếp qua service công khai;
- dữ liệu theo nhà máy chỉ đi qua `BaseRepository`.

## Quyết định
1. **Database `MES_Sewing`** cho module May.
   - Quản trị CSDL tạo trước và cấp `db_owner` (tài khoản ứng dụng không có quyền `CREATE DATABASE`).
   - Tên cấu hình qua `DB_SEWING_NAME`.
2. **Bản chép dòng dàn chuyền** (`SewingPrep`):
   - Mỗi dòng dàn chuyền có một dòng chép mã hàng, chuyền, số lượng, ngày vào chuyền, cùng `BranchCode`, `LineCode`.
   - Lọc nhà máy, chuyền (`order.prep`: FACTORY → `BranchCode`, LINE → `LineCode`), phân trang, lọc trạng thái đều chạy trong `MES_Sewing` qua `BaseRepository`.
3. **Đọc dàn chuyền qua `ScheduleFeed`**, service công khai duy nhất module Đơn hàng xuất ra (`exports` của `OrderModule`):
   - Mỗi lần mở màn hoặc xuất file, module May chép lại theo nhà máy của phiên (A00: mọi nhà máy): thêm dòng mới, cập nhật dòng đã đổi, xóa dòng của dòng dàn chuyền đã bị bỏ.
   - Chỉ chép khi "dấu phiên bản" của dàn chuyền (số dòng + `BINARY_CHECKSUM` các cột được chép, phân biệt hoa thường) đổi, hoặc số dòng bản chép lệch số dòng nguồn (bản chép bị xóa ngoài luồng chép); đổi trang, lọc, sắp xếp không chép lại.
   - Bước chép là việc của hệ thống, không theo quyền người xem: `BranchCode` lấy từ dữ liệu nguồn của máy chủ, nhà máy lấy từ phiên (`ScheduleFeed` nhận `Scope`). Người dùng chỉ thấy dữ liệu qua repository của module May.
   - Một lần chép tại một thời điểm (`sp_getapplock`, không khóa phạm vi trên bảng nên phiên A00 và phiên nhà máy không deadlock); nguồn đọc sau khi giữ khóa.
   - Dòng nguồn nhận diện bằng Id + nhà máy + kế hoạch + thời điểm tạo (`SourceCreatedAt`, dung sai 5 ms vì driver gửi ngày giờ theo kiểu `datetime`): `reset:demo`, `load:bravo` đánh số lại Id của `MES_Order`, cùng Id mà khác dòng thì không gắn ngày đã nhập sang dòng mới. Hai script này xóa bản chép trước khi nạp dữ liệu đơn hàng (giữ danh mục bước).
   - Nguồn trả rỗng mà bản chép còn dòng (nhầm database, đang nạp lại) thì không xóa gì và không lưu dấu, lần mở màn sau kiểm lại.
   - Chép lỗi (hết thời gian chờ khóa, mất kết nối `MES_Order`): vẫn trả bản chép hiện có, ghi log máy chủ, lần sau chép lại.
4. **Danh mục bước `PrepStep`** nằm trong `MES_Sewing`:
   - dùng chung toàn công ty;
   - không xóa vật lý, mã bất biến (trigger);
   - quản lý ở Quản trị › Danh mục hệ thống, quyền `admin.catalog:*` như các danh mục khác.
5. **Ngày theo bước** (`SewingPrepStep`):
   - mỗi bước của một dòng lưu số ngày KH chỉnh riêng (NULL: theo danh mục) và ngày thực hiện;
   - bảng con có FK ghép `(SewingPrepId, BranchCode)`, xóa theo dòng cha.
6. **Màn nằm ở nhóm Quản trị đơn hàng** (người dùng chuyển 10/10/2026):
   - nhóm menu theo tiền tố mã tài nguyên, nên tài nguyên là `order.prep`, đường dẫn màn `/order/prep`;
   - code backend, database vẫn thuộc module May (`modules/sewing`, `MES_Sewing`), API giữ `/api/v1/sewing/prep`;
   - migration `MES_Core/0004` đổi mã `sewing.prep` → `order.prep` tại chỗ (giữ Id) để quyền, chính sách cột đã cấp không mất.
7. **Tính KH và trạng thái lúc đọc, không lưu sẵn:**
   - KH = Ngày vào chuyền − số ngày KH;
   - đổi danh mục hoặc ngày vào chuyền thì KH đổi theo ngay;
   - lọc theo trạng thái tính trong SQL (cùng database), quy tắc giống hàm ở service.

## Phương án đã cân nhắc
| Phương án | Lý do không chọn |
|---|---|
| Lưu ở `MES_Order` (cùng database với dàn chuyền) | Có FK vật lý tới dòng dàn chuyền, nhưng lệch quy ước "mỗi module một database"; người dùng chọn `MES_Sewing` |
| Không chép, đọc dòng dàn chuyền từ `MES_Order` rồi ghép dữ liệu May trong ứng dụng | Phân quyền theo `order.prep` phải chạy trên bảng của module khác; không phân trang, sắp xếp, lọc trạng thái trong SQL được |
| Đồng bộ bằng sự kiện khi lưu Xếp chuyền | Module Đơn hàng phải biết module May (phụ thuộc ngược); chưa có hạ tầng sự kiện. Chép khi mở màn đơn giản và luôn đúng |
| Lưu sẵn ngày KH | Phải tính lại mọi dòng khi đổi danh mục hay ngày vào chuyền |

## Hệ quả
- **Dòng dàn chuyền bị bỏ ở Xếp chuyền:** dòng chuẩn bị và ngày đã nhập bị xóa theo ở lần mở màn sau; dòng bị xóa có dữ liệu đã nhập thì log máy chủ ghi cảnh báo kèm Id. Lưu Xếp chuyền giữ nguyên Id dòng khi sửa, nên sửa số lượng, ngày, chuyền không làm mất ngày đã nhập.
- **Khóa ngầm** khai báo trong `migrations/softkeys.json`: `SewingPrep.ShipmentPlanLineId`, `ShipmentPlanId`, `LineCode`, `BranchCode`, `SewingPrepStep.BranchCode`. `npm run check:softkeys` kiểm mồ côi.
- **Chi phí mỗi lần mở màn:** một truy vấn dấu phiên bản; chỉ khi dàn chuyền đổi mới đọc lại và so sánh. Dấu đã chép giữ trong bộ nhớ của tiến trình máy chủ (chạy nhiều tiến trình thì mỗi tiến trình chép một lần). Nếu số dòng dàn chuyền rất lớn, cân nhắc chép tăng dần theo `ModifiedAt`.
- **Ranh giới module:** lint backend chặn module May import phần bên trong module Đơn hàng (chỉ `OrderModule`, `schedule-feed.service`) và chặn chiều ngược lại.
- **Chính sách cột:** cột "Các bước chuẩn bị" (`steps`) áp cho cả nhóm cột KH, TH và cột bước trong file xuất.
- **Phạm vi dữ liệu:** `order.prep` gắn chiều Nhà máy, Chuyền; không gắn chiều Người tạo (OWNER) vì dòng do hệ thống chép, không có người tạo. Theo quy tắc chung của `BaseRepository`, chiều không gắn thì không áp: vai trò được gán "Chỉ của mình" vẫn thấy theo nhà máy, chuyền.
- **Đường dẫn cũ** `/sewing/prep` (trước khi chuyển nhóm) tự chuyển sang `/order/prep`.
- **Chưa làm:**
  - tự lấy ngày TH từ module Kỹ thuật, Lab;
  - phân quyền nhập TH theo bộ phận;
  - trừ ngày nghỉ, ngày lễ khi tính KH.
