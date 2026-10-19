# ADR 0011 – Lưới xem dữ liệu: 100 dòng theo ngày tạo, kéo giãn cột, lọc theo giá trị của cột trên máy chủ

**Trạng thái:** Proposed (chờ người dùng duyệt cùng Phase 5.6; cập nhật theo review 5.6) · **Ngày:** 10/10/2026

## Bối cảnh
Người dùng yêu cầu cho mọi màn xem dữ liệu (10/10/2026):
1. Người xem tự kéo được độ rộng cột.
2. Mặc định chỉ tải 100 dòng đầu, xếp theo ngày tạo. Muốn xem thêm thì sang trang.
3. Ô lọc, ô tìm phải truy vấn trong cơ sở dữ liệu, không lọc trên dữ liệu đang hiển thị.
4. Trên tiêu đề mỗi cột có mũi tên nhỏ. Bấm vào thì mở bộ lọc chọn giá trị của cột đó, như lưới DevExpress, Excel (ảnh `docs/nguon/filter-column-view.png`).

Hiện trạng trước khi sửa:
- Lưới dùng chung `DataGrid` co theo nội dung, không kéo được cột.
- Các màn Đơn hàng, May tải 50 dòng, xếp theo ngày xuất hoặc ngày vào chuyền.
- Danh sách mã hàng ở Tỷ lệ cắt không phân trang, tải mọi mã có PO.
- Dải lọc đã lọc trên máy chủ. Ba ô tìm ở Quản trị lọc trên trình duyệt: cây xưởng, chuyền; mục danh mục; nhóm nguồn đồng bộ.

## Quyết định

### 1. Lọc theo cột chạy trên máy chủ, danh sách trắng theo màn
- **Tham số:** client gửi `cf` dạng JSON `{"<trường JSON>": {"in": [...]}}` hoặc `{"notIn": [...]}`.
  - `null` là ô trống. Chuỗi rỗng cũng coi là trống.
  - Hai chế độ để popup không phải gửi hàng nghìn giá trị: "Chọn tất cả" rồi bỏ vài giá trị thì gửi `notIn` với vài giá trị bị bỏ.
- **Danh sách trắng:** mỗi service khai báo `FilterSpec`: trường JSON → biểu thức SQL do máy chủ dựng (tên cột, hoặc truy vấn con tới bảng cha, bảng con). Client chỉ gửi giá trị, giá trị đi qua tham số.
  - Trường ngoài danh sách, dạng sai, quá 500 giá trị: 422. SQL Server giới hạn 2.100 tham số mỗi câu.
- **Kiểu cột:**
  - `text`;
  - `number`;
  - `date`: cột `DATE`;
  - `day`: cột `DATETIME2` mà lưới hiện phần ngày như lưu, ví dụ ngày đồng bộ lấy từ BRAVO;
  - `datetime`: `CreatedAt` lưu UTC, lọc theo ngày giờ Việt Nam (UTC+7). Lưới hiện giờ theo múi giờ của máy người xem. Giả định mọi máy đặt giờ Việt Nam; máy đặt múi giờ khác có thể thấy ngày trên lưới lệch với ngày trong popup lọc ở các đơn tạo gần nửa đêm.
  - Ô chỉ có khoảng trắng coi như trống: SQL Server so `'   ' = ''` là đúng.
- **Không có cột giá:** đơn giá, thành tiền, giá CM, doanh số là cột nhạy cảm. Liệt kê giá trị của chúng là lộ giá mà không ghi `SysSensitiveReadLog`.
- **Chính sách cột:** cột bị Ẩn hoặc Che thì bộ lọc theo cột đó bị bỏ qua, như `readableQuery` (review 5.1 lượt 2 N3). Hỏi giá trị của cột đó thì trả 403 `FIELD_NOT_READABLE`.

### 2. Giá trị cho popup lấy từ DB, trong cùng phạm vi phân quyền
- **Endpoint:** `GET <danh sách>/values?field&search&<các bộ lọc đang áp>`.
- **Nơi chạy:** `BaseRepository.distinctValues(scope, cột của FilterSpec, …)`. Hàm tự dựng biểu thức từ cột, không nhận SQL tùy ý từ module. Hàm đi qua cùng `filtered()` của `list()`:
  - lọc nhà máy;
  - phạm vi L3;
  - ô tìm `q`;
  - bộ lọc nghiệp vụ.
- **Bộ lọc khác:** áp mọi bộ lọc khác. Bộ lọc của chính cột đang mở thì bỏ, như Excel, để người dùng chọn lại được.
- **Giới hạn:** tối đa 500 giá trị. Nhiều hơn thì báo `truncated`, người dùng gõ để thu hẹp. Ô tìm của popup cũng là LIKE trong DB. Cột ngày xếp mới nhất lên trước như lưới.
- **Độ dài `cf`:** máy chủ nhận tối đa 8.000 ký tự, quá thì 422 kèm câu nói cách sửa. Giao diện chặn trước khi chuỗi đã mã hóa URL vượt 6.000 ký tự: chữ Việt có dấu nở 2-3 lần, dòng request quá dài thì máy chủ trả 431. Đang tìm mà chữ gõ chưa kịp tìm thì chưa áp dụng được; Enter tìm ngay.
- **Module không tự viết điều kiện phân quyền:** biểu thức chỉ là cột hoặc truy vấn con nghiệp vụ.

### 3. Mặc định 100 dòng, mới tạo lên trước
- **Danh sách nghiệp vụ:** `pageSize` mặc định 100 (tối đa vẫn 200), sắp xếp `createdAt:desc`, rồi `Id` giảm dần.
  - Lưới có thêm cột **Ngày tạo**, để người xem thấy thứ tự đang dùng và lọc được theo ngày tạo.
  - Kế hoạch chuẩn bị SX: cột Ngày tạo là thời điểm tạo dòng dàn chuyền gốc (`SourceCreatedAt`), vì bản chép ở `MES_Sewing` được tạo lại khi chép. Thứ tự mặc định của màn này là ngoại lệ, xem dưới.
  - Danh sách mã hàng ở Tỷ lệ cắt: mã có PO mới tạo gần nhất lên đầu, có phân trang.
- **Quản trị:** người dùng, nhật ký, lịch sử đồng bộ, danh mục BRAVO cũng 100 dòng; người dùng xếp theo ngày tạo.
- **Ngoại lệ: Phân bổ PO** (task 5.9.12, ADR 0013 mục 10): dữ liệu chép từ OSM không có ngày tạo nên không có cột Ngày tạo; mặc định ETD-Revised mới nhất lên trước, cột đó bị Ẩn/Che thì theo cột mặc định kế tiếp người xem được xem.
- **Dữ liệu nạp từ BRAVO** (`load:bravo`): ngày tạo là lúc nạp, các dòng cùng lúc nạp xếp theo `Id` giảm dần. Khi BA chốt ánh xạ (5.2.8) có thể đổi sang ngày chứng từ BRAVO.

### 4. Kéo giãn cột là tiện ích riêng của người xem
- **Chưa kéo cột nào:** bảng co theo nội dung như cũ.
- **Kéo lần đầu:** mọi cột giữ độ rộng đang thấy. Bảng chuyển sang `table-layout: fixed` với `<colgroup>`; cột đệm cuối hút phần thừa.
- **Lưu độ rộng:** trong `localStorage` theo tên lưới, trên trình duyệt đó. Không lưu lên máy chủ: đây là tiện ích hiển thị, không phải dữ liệu dùng chung.
- **Cách đổi độ rộng:**
  - bấm đúp tay kéo để vừa nội dung;
  - phím mũi tên trên tay kéo để đổi bằng bàn phím;
  - nút ở ô STT để đặt lại như cũ.

### 5. Ô tìm ở Quản trị cũng hỏi máy chủ
- **Cây xưởng, chuyền:** `GET /admin/catalogs/lines?q&branch` lọc trong DB. Số chuyền đang dùng của xưởng vẫn đếm trên mọi chuyền. Popup thêm, sửa vẫn dùng cây đầy đủ (ô chọn xưởng, gợi ý mã kế tiếp).
- **Mục danh mục:** `GET /admin/catalogs/items/:code?q`.
- **Ngoại lệ: Kế hoạch chuẩn bị SX** (người dùng chốt 10/10/2026, task 5.5.7, theo ảnh mẫu):
  - thứ tự mặc định Chi nhánh → Tổ SX → Mã hàng → Ngày vào chuyền (các mã của cùng một tổ nằm liền nhau), không phải mới tạo lên trước; người chỉ xem vẫn bấm tiêu đề cột để sắp xếp;
  - người được sửa các bước dùng lưới nhập (`SheetGrid`, ADR 0008) để gõ ngày TH ngay trên bảng. Lưới nhập cũng có nút lọc theo cột trên tiêu đề (người dùng yêu cầu 10/10/2026): cùng nút, cùng popup (`ColumnFilterButton`), cùng các cột, cùng tham số `cf` trên URL và cùng nguồn giá trị `/values` với lưới xem; cột bị Che không có nút. Mở popup lọc thì lưới bỏ ô đang chọn, để chữ gõ trong popup không sửa ô của lưới.
- **Ngoại lệ:** nút nhóm ở màn Đồng bộ dữ liệu (Tất cả, Danh mục, Đơn hàng, Có lỗi) giữ trên trình duyệt. Đó là tab trên danh sách cố định 18 nguồn, tự tải lại mỗi 2 giây khi đang chạy, và cần đủ danh sách để đếm số trên từng tab. Không phải ô tìm dữ liệu.

## Hệ quả
- **Lợi:**
  - lọc đúng trên toàn bộ dữ liệu trong phạm vi, kể cả phần chưa tải;
  - màn mở nhanh vì chỉ tải 100 dòng;
  - một cơ chế dùng chung cho mọi màn (`FilterSpec`, `distinctValues`, `DataGrid`).
- **Chi phí:**
  - mỗi lần mở popup lọc là một truy vấn `SELECT DISTINCT TOP 501`;
  - cột tính từ bảng con (SL đã xếp, ngày bắt đầu SX) lọc bằng truy vấn con, chậm hơn cột thường;
  - chưa có index `(BranchCode, CreatedAt)`. Dữ liệu hiện vài nghìn dòng nên chưa cần; khi bảng lớn thì thêm qua migration.
- **Ràng buộc cho màn mới:**
  - lưới nghiệp vụ khai báo `FilterSpec` và đặt `filterKey` cho cột;
  - không đưa cột nhạy cảm vào danh sách trắng;
  - cột bị Che không có nút lọc (giao diện) và không có giá trị (máy chủ).
