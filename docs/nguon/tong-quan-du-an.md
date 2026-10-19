# MES Vietsun – Tổng quan dự án

> Phiên bản 1.1 · 08/10/2026 · Người lập: Dev Lead dự án MES
> Trạng thái: đề xuất, chờ Ban lãnh đạo duyệt. Các tỷ lệ phần trăm và mốc độ trễ là ước lượng/mục tiêu thiết kế, sẽ hiệu chỉnh qua review hằng tuần.

---

## 1. Kết luận nhanh

| # | Vấn đề | Kết luận |
|---|---|---|
| 1 | Kiến trúc | Tách riêng khỏi GSD, theo Modular Monolith: React PWA + NestJS + SQL Server |
| 2 | Phân quyền | Giao diện chỉ ẩn/hiện; việc lọc dữ liệu theo nhà máy/chuyền do Backend thực hiện |
| 3 | Đồng bộ | BRAVO/OSM: Linked Server + Stored Procedure, trễ 10–15 phút + nút "Đồng bộ ngay". Dữ liệu phát sinh trong MES: realtime qua WebSocket |
| 4 | Hạ tầng | 2 server (UAT/Production), Nginx; triển khai qua VPN nội bộ và Wifi Site-to-Site, có phương án dự phòng public độc lập |
| 5 | Nguồn lực | Dev Lead (60%) + Dev FE (80%); BA viết tài liệu và triển khai pilot; BA/Dev nhiều năm kinh nghiệm review độc lập ở các mốc quan trọng |
| 6 | AI | 3 ghế Claude Team Standard (2 Dev + 1 BA): $60/tháng nếu trả năm, $75/tháng nếu trả tháng |
| 7 | Phạm vi | Giai đoạn 1 là pilot tại 1 nhà máy, 40 ngày làm việc (8 tuần); khả năng đáp ứng khoảng 65–75% |

---

## 2. Bối cảnh và mục tiêu

Ban lãnh đạo yêu cầu tập trung nguồn lực build nhanh hệ thống MES nhằm:

1. Có hệ thống cho các nhà máy ngoài Việt Đức vận hành và có số liệu để quản trị.
2. Kiểm thử kiến trúc mới trước khi đầu tư giá trị lớn cho dự án CNTT sắp tới.
3. Lấy số liệu từ khâu Kế hoạch → Cắt → May → Endline → Hoàn thiện để quản trị.

**Yêu cầu chung:** chạy được trên máy tính và điện thoại; dữ liệu realtime; module Đơn hàng & Kế hoạch tích hợp dữ liệu từ BRAVO và OSM để lấy PO chi tiết (tỷ lệ cắt), SO và số liệu phân bổ PO cho từng nhà máy.

## 3. Phạm vi giai đoạn 1

| Trong phạm vi | Ngoài phạm vi (làm sau) |
|---|---|
| Đơn hàng & Kế hoạch (PO chi tiết, phân bổ PO, xếp chuyền) | Nối dài quy trình đến WMS |
| Cắt (ghi nhận sản lượng, cấp BTP, quản lý in thêu) | Ghép cỡ sơ đồ và hạch toán cắt (nhập cắt theo cây cuộn), vì liên quan bảng cân đối và số liệu vải nhập kho |
| May (phân cụm, bấm năng suất, cân bằng chuyền) | Nghiệp vụ vòng ngoài của VSN-NT khác VDC |
| Endline / QMS (danh mục lỗi, kiểm Endline, báo cáo chất lượng) | EAM (HQ1 đang vận hành; triển khai nhà máy khác sau khi HQ5 vận hành xong ASM tại Việt Sun) |
| Hoàn thiện (tiến độ gấp xếp, đóng thùng, ở mức cơ bản) | Chạy đồng thời nhiều nhà máy |
| Báo cáo quản trị cốt lõi | |

**Định nghĩa "hoàn thành" đề xuất:** pilot chạy ổn định tại 1 nhà máy với luồng Cắt → May → Endline → Hoàn thiện, số liệu đối soát đạt ngưỡng thỏa thuận.

## 4. Luồng nghiệp vụ

Trục dữ liệu xuyên suốt: **PO → Phân bổ nhà máy → Xếp chuyền → Cắt → May (cụm) → Endline → Hoàn thiện → Đóng thùng → Xuất hàng**.

| Khối | Chức năng | Trạng thái |
|---|---|---|
| Công nghệ (GSD) | Phân tích GSD chuyền may, Kho cụm công đoạn, Bảng quy trình | Đã có, MES chỉ đọc |
| Công nghệ (GSD) | Cập nhật cụm, Sơ đồ chuyền / Phân công đoạn | Cần kết nối với MES |
| Nhân sự | Khai báo sơ đồ tổ chức, Thông tin nhân viên | Đã có, MES chỉ lấy về dùng |
| Đơn hàng | Phân bổ PO cho nhà máy, Kế hoạch xuất hàng, PO chi tiết, Xếp chuyền, Chia màu/cỡ cho chuyền | Build mới |
| Cắt | Đồng bộ tiến độ cắt, Xác nhận số lượng cấp BTP, Quản lý in thêu | Build mới |
| May | Kế hoạch may, Phân cụm trưởng (App Mobile), Bấm năng suất cụm (App Mobile), Biểu đồ cân bằng chuyền | Build mới |
| Hoàn thiện | Kế hoạch hoàn thiện, Tiến độ gấp xếp, Tiến độ đóng thùng | Build mới |
| Báo cáo quản trị | Kế hoạch chuẩn bị sản xuất; báo cáo tiến độ sản xuất, doanh thu nhà máy, sản lượng theo giờ | Build mới |
| QMS (Endline) | Danh mục lỗi, Kiểm Endline, Báo cáo chất lượng | Build mới |

---

## 5. Kiến trúc tổng quan

### 5.1 Quyết định chính

| Thành phần | Quyết định |
|---|---|
| **Frontend** | React + TypeScript + Vite, build PWA để cài lên màn hình điện thoại, không cần qua Store. Phân quyền ở giao diện chỉ ẩn/hiện; mức áp dụng phân quyền trên dữ liệu nằm ở Backend. |
| **Backend** | Node.js + NestJS. Phân quyền Role + Data Scope (nhà máy/chuyền), tự gắn điều kiện lọc ở repository dùng chung. Ghi log lịch sử các thay đổi quan trọng. |
| **Database** | SQL Server 2019/2022. Tách database theo từng module để dễ quản lý và backup. |
| **Server** | 2 server tách biệt UAT và Production. Production: Win10 hoặc Linux. Web server: Nginx. |
| **Đồng bộ và realtime** | Xem mục 6. |
| **Source code** | Modular Monolith, chia module để tách dần về sau. Không build tiếp trên GSD để đánh giá được kiến trúc mới và tránh ảnh hưởng dự án đang vận hành thực tế. |

### 5.2 Sơ đồ phân tầng

```
┌───────────────────────── Người dùng ─────────────────────────┐
│  Web PC (kế hoạch, báo cáo)      Mobile PWA (phân cụm, năng suất, Endline) │
└──────────────┬───────────────────────────────┬───────────────┘
               │ HTTPS REST                    │ WebSocket (realtime)
          ┌────▼───────────────────────────────▼────┐
          │                  Nginx                  │
          └────────────────────┬────────────────────┘
┌──────────────────────────────▼──────────────────────────────┐
│  Backend: Node.js + NestJS (Modular Monolith)               │
│  Gateway: Auth · Role + Data Scope · Validation · Audit log │
│  ┌────────┐ ┌─────┐ ┌─────┐ ┌──────────┐ ┌─────┐ ┌───────┐  │
│  │Đơn hàng│ │ Cắt │ │ May │ │Hoàn thiện│ │ QMS │ │Báo cáo│  │
│  │& KH    │ │     │ │     │ │          │ │     │ │       │  │
│  └────────┘ └─────┘ └─────┘ └──────────┘ └─────┘ └───────┘  │
│  Mỗi module: controller → service → repository              │
└──────────────────────────────┬──────────────────────────────┘
                               │ T-SQL
┌──────────────────────────────▼──────────────────────────────┐
│  SQL Server 2019/2022 – database tách theo module           │
│  Bảng nhận dữ liệu đồng bộ + bảng nghiệp vụ MES             │
└──────────────────────────────▲──────────────────────────────┘
                               │ Stored Procedure đọc qua Linked Server (chỉ-đọc)
                  ┌────────────┴─────────────┐
            [View BRAVO]               [View OSM]        [GSD]
```

### 5.3 Nguyên tắc để dễ sửa, bảo hành, bảo trì

| Nguyên tắc | Nội dung |
|---|---|
| Ranh giới module | Mỗi module có khuôn `controller → service → repository`; module không đọc trực tiếp dữ liệu của module khác |
| Cô lập hệ thống ngoài | BRAVO/OSM/GSD chỉ được chạm ở lớp đồng bộ; đổi cấu trúc nguồn thì chỉ sửa view hoặc Stored Procedure |
| Cấu hình theo nhà máy | Khác biệt giữa nhà máy nằm trong bảng cấu hình, không rẽ nhánh trong code |
| Phân quyền ở Backend | Giao diện chỉ ẩn/hiện; điều kiện lọc theo nhà máy/chuyền gắn tự động ở repository |
| Truy vết | Schema đổi qua migration có version; log lịch sử thay đổi quan trọng |
| Tri thức nằm trong repo | `CLAUDE.md`, ADR, runbook để người mới hoặc AI mới đọc là làm đúng quy ước |

---

## 6. Đồng bộ dữ liệu và realtime

| Loại dữ liệu | Cách thực hiện | Độ trễ |
|---|---|---|
| **Từ BRAVO/OSM** (PO, SO, PO chi tiết, phân bổ PO) | Linked Server đọc View đã phân quyền; Stored Procedure đổ vào bảng trên MES. Các lần sau chỉ lấy bản ghi có `ModifiedAt` sau thời điểm đồng bộ gần nhất để tránh lãng phí tài nguyên | 10–15 phút, kèm nút "Đồng bộ ngay" |
| **Phát sinh trong MES** (xếp chuyền, sản lượng Cắt/May/Endline/Hoàn thiện) | Ghi trực tiếp vào MES, đẩy sự kiện qua WebSocket | Realtime (mục tiêu dưới 1–2 giây, đo ở UAT) |

**Quy tắc sở hữu dữ liệu:**

| Dữ liệu | Nguồn sự thật | MES được sửa? |
|---|---|---|
| PO, SO, PO chi tiết, phân bổ PO | BRAVO / OSM | Không (chỉ đọc) |
| Quy trình, cụm công đoạn, sơ đồ chuyền | GSD | Không (chỉ đọc) |
| Xếp chuyền, sản lượng Cắt/May/Endline/Hoàn thiện | MES | Có, có audit log |

**Nút "Đồng bộ ngay":** kiểm tra quyền → kiểm tra có job đang chạy → chạy đồng bộ → trả kết quả về màn hình. Có khóa chống chạy chồng và giới hạn tần suất bấm để bảo vệ BRAVO. Màn hình hiển thị nhãn "Cập nhật lúc hh:mm" cho dữ liệu lấy từ ngoài.

---

## 7. Nguồn lực

### 7.1 Con người và quỹ thời gian

| Vai trò | Thời gian dành cho MES | Quỹ giờ (40 ngày × 8 giờ) | Trách nhiệm chính |
|---|---|---|---|
| **Dev Lead** | 60% (24 giờ/tuần) | 192 giờ | Thiết kế kiến trúc, schema, phân quyền, tích hợp BRAVO/OSM; dựng khung và khuôn module; chia task theo tài liệu BA; review PR; duyệt migration; deploy |
| **Dev FE** | 80% (32 giờ/tuần) | 256 giờ | Build giao diện và module nghiệp vụ theo task Dev Lead phân, trên khuôn có sẵn; viết test; sửa lỗi theo review |
| **BA** | Theo lịch bàn giao | — | Tài liệu nghiệp vụ đầy đủ, tiêu chí nghiệm thu, kịch bản UAT; trả lời câu hỏi nghiệp vụ; triển khai pilot (đào tạo, chạy song song, thu phản hồi) |
| **PMO / PMS** | Theo dõi hằng tuần | — | Đưa dự án lên PMS, theo dõi tiến độ và rủi ro, tổ chức review tuần |
| **Review độc lập** | Các mốc quan trọng (đề xuất tuần 2, 5, 7) | ~3–4 giờ/buổi | BA/Dev nhiều năm kinh nghiệm trong công ty review phân quyền, đồng bộ, truy vấn, bảo mật |

Tổng quỹ giờ phát triển: **448 giờ**. Dev Lead chỉ còn khoảng 38 giờ (gần 5 giờ/tuần) cho review và kiểm thử toàn bộ phần Dev FE làm ra, đây là điểm chặt nhất. Cần chia task nhỏ (0,5–2 ngày), có tiêu chí hoàn thành lấy từ tài liệu BA.

### 7.2 AI

| Tài khoản | Số ghế | Mục đích | Trả năm | Trả tháng |
|---|---|---|---|---|
| Claude Team Standard – Dev | 2 | Vibe code | $40/tháng | $50/tháng |
| Claude Team Standard – BA | 1 | Chuẩn hóa, tối ưu đầu ra tài liệu | $20/tháng | $25/tháng |
| **Tổng** | **3** | | **$60/tháng** (= $720/năm) | **$75/tháng** (= $900/năm) |

- Dự án 8 tuần (khoảng 2 tháng) trả theo tháng: khoảng $150.
- Nếu một Dev liên tục chạm trần usage: nâng riêng ghế đó lên Premium, tổng thành $175/tháng (trả tháng) hoặc $140/tháng (trả năm).
- Giá theo bảng giá tham chiếu, chưa gồm thuế, có thể khác theo khu vực; kiểm tra lại tại claude.ai/upgrade trước khi chốt.

**Quy tắc dùng AI an toàn:** AI chỉ tạo file migration, người duyệt và chạy; không đưa mật khẩu, chuỗi kết nối hay dữ liệu thật của nhà máy vào prompt; code do AI sinh ra luôn qua CI (lint, test) và review của người trước khi merge.

### 7.3 Triển khai tới nhà máy

| Phương án | Mô tả |
|---|---|
| **Ưu tiên** | Dùng VPN nội bộ và Wifi Site-to-Site hiện có để triển khai cho các nhà máy |
| **Dự phòng** | Nếu không triển khai nội bộ được: mở một source chạy độc lập, public, để hạn chế tối đa rủi ro bảo mật cho hệ thống lõi |

---

## 8. Lộ trình 8 tuần (review mỗi tuần)

| Tuần | Dev Lead | Dev FE | Tiêu chí review cuối tuần |
|---|---|---|---|
| 1 | Chốt kiến trúc, schema lõi, `CLAUDE.md`, repo, CI, môi trường | Khung web, UI kit, đăng nhập, admin | Kiến trúc được duyệt; CI chạy; đăng nhập hoạt động; BA bàn giao tài liệu Đơn hàng & Kế hoạch |
| 2 | Auth + Data Scope; kết nối BRAVO; cơ chế đồng bộ | Sync Monitor, danh mục; bắt đầu màn hình Đơn hàng | Đồng bộ BRAVO chạy tự động, có dữ liệu PO thật; BA bàn giao tài liệu Cắt |
| 3 | Kết nối OSM; domain Đơn hàng & Kế hoạch | Đơn hàng & Kế hoạch: PO, phân bổ, xếp chuyền | PO/SO từ BRAVO và OSM hiển thị trong MES; "Đồng bộ ngay" hoạt động; **kiểm tra vận tốc lần 1** |
| 4 | Domain Cắt; sự kiện giữa module | Cắt; dựng khung mobile PWA | Ghi nhận sản lượng Cắt theo PO/chuyền |
| 5 | Domain May; WebSocket | May: phân cụm, bấm năng suất trên điện thoại | Bấm năng suất cập nhật realtime lên dashboard; **kiểm tra vận tốc lần 2** |
| 6 | Domain Endline/QMS; kiểm thử realtime | Hoàn tất May; Endline trên mobile | Luồng Cắt → May → Endline chạy trọn vẹn trên UAT |
| 7 | View báo cáo; hỗ trợ UAT; đối soát số liệu | Hoàn thiện; báo cáo cốt lõi | UAT bắt đầu tại nhà máy pilot (BA triển khai); báo cáo đối soát được với số liệu hiện có |
| 8 | Ổn định, hiệu năng, sao lưu, runbook, bàn giao | Hoàn tất báo cáo; sửa lỗi UAT; kiểm thử | Nghiệm thu pilot; sao lưu và phục hồi thử xong; quyết định mở rộng |

**Khi tiến độ lệch:** nếu review tuần 3 cho thấy hoàn thành dưới khoảng 70% giờ kế hoạch hoặc đồng bộ chưa ổn định, xét lại phạm vi và cân nhắc bổ sung nguồn lực. Thứ tự cắt phạm vi: (1) báo cáo nâng cao, (2) Hoàn thiện ngoài mức nhập liệu cơ bản, (3) cân bằng chuyền nâng cao. **Không cắt:** phân quyền theo nhà máy, đồng bộ, test phần tính sản lượng và phân quyền, sao lưu và phục hồi.

## 9. Khả năng đáp ứng theo hạng mục (ước lượng)

| Hạng mục | Khả năng đáp ứng | Yếu tố quyết định |
|---|---|---|
| Kiến trúc, nền tảng, phân quyền | 85–90% | Chốt schema và `CLAUDE.md` sớm; Dev Lead giữ đủ 60% thời gian |
| Đồng bộ BRAVO + OSM | 70–75% | Có quyền đọc và dữ liệu mẫu trong tuần 1; chất lượng dữ liệu nguồn |
| Đơn hàng & Kế hoạch | 75–80% | Tài liệu BA đúng hạn; quy tắc ưu tiên BRAVO/OSM được chốt |
| Cắt | 75–80% | Phạm vi chỉ ghi nhận sản lượng |
| May + Mobile PWA | 65–70% | Công thức năng suất cụm và cân bằng chuyền được BA mô tả rõ |
| Endline / QMS | 65–70% | Danh mục lỗi và quy trình kiểm chốt sớm |
| Hoàn thiện (mức cơ bản) | 60–65% | Chỉ ở mức nhập liệu |
| Báo cáo quản trị | 50–60% | Chỉ báo cáo cốt lõi; số liệu phải đối soát xong |
| Review, kiểm thử, ổn định, deploy | 45–55% | Hạng mục dễ bị cắt nhất; tuần 8 giữ riêng cho ổn định |
| **Tổng thể pilot** | **65–75%** | Nếu làm đủ mọi module ở mức đầy đủ: khoảng 55–65% |

---

## 10. Điều kiện cần trước kick-off

**Nhân sự và tổ chức** (bắt buộc)

- [ ] Xác nhận Dev Lead dành 60% và Dev FE dành 80% thời gian suốt 8 tuần; việc khác của hai người được sắp xếp lại
- [ ] Chỉ định BA phụ trách, cam kết bàn giao tài liệu đúng lịch, trả lời câu hỏi trong 1 ngày làm việc
- [ ] Chỉ định Key user ở nhà máy pilot (tên cụ thể), tham gia review tuần và UAT
- [ ] Chỉ định đầu mối quản trị BRAVO (tạo view chỉ-đọc, Linked Server) và OSM
- [ ] Chỉ định đầu mối hạ tầng: 2 server UAT/Production, SQL Server, Nginx, VPN, sao lưu
- [ ] Lịch review tuần cố định (60 phút); dự án đã lên PMS
- [ ] Người review độc lập và lịch các buổi review

**Tài liệu (BA chuẩn bị)**

- [ ] Phạm vi giai đoạn 1 được ký duyệt, định nghĩa "hoàn thành", tiêu chí nghiệm thu pilot *(trước kick-off)*
- [ ] Quy trình nghiệp vụ tổng thể; đặc tả từng module theo mẫu thống nhất, có công thức tính (năng suất cụm, cân bằng chuyền, tỷ lệ cắt…) và tiêu chí nghiệm thu *(trước module bắt đầu ít nhất 1 tuần)*
- [ ] Danh mục và dữ liệu gốc: nhà máy, chuyền, công đoạn/cụm, danh mục lỗi, ca làm, đơn vị tính *(trước tuần 2)*
- [ ] Ma trận phân quyền: vai trò × chức năng × phạm vi nhà máy/chuyền *(trước tuần 2)*
- [ ] Đặc tả tích hợp BRAVO/OSM: danh sách view và trường cần lấy, khóa nghiệp vụ PO/SO, quy tắc ưu tiên khi hai nguồn khác nhau, dữ liệu mẫu thật đã ẩn danh *(muộn nhất hết tuần 1)*
- [ ] Mẫu báo cáo, kịch bản UAT, kế hoạch triển khai pilot *(trước tuần 6)*

**Kỹ thuật**

- [ ] Tài khoản chỉ đọc và view chỉ định trên BRAVO/OSM; Linked Server đã kiểm tra kết nối từ server MES
- [ ] 2 server (UAT/Production) và SQL Server sẵn sàng; kế hoạch sao lưu
- [ ] Repo, CI, môi trường Dev/UAT; `CLAUDE.md` bản đầu
- [ ] 3 tài khoản Claude đã cấp và chạy thử

**Quy tắc Go/No-go:** thiếu một trong các mục sau thì nên hoãn kick-off: xác nhận thời gian hai dev, BA và Key user được chỉ định, phạm vi được ký duyệt, đặc tả tích hợp kèm dữ liệu mẫu BRAVO/OSM.

---

## 11. Rủi ro chính

| Rủi ro | Mức | Cách giảm |
|---|---|---|
| Tài liệu BA trễ hoặc thiếu chi tiết (nhất là công thức tính) | Cao | Lịch bàn giao theo module, mẫu đặc tả thống nhất, không bắt đầu module khi chưa có tài liệu |
| Chậm quyền truy cập BRAVO/OSM, dữ liệu nguồn không sạch | Cao | Là điều kiện kick-off; dữ liệu mẫu trong tuần 1; đối soát sớm |
| Dev Lead quá tải (kiêm việc BRAVO), review không kịp | Cao | Xác nhận 60% thời gian; task nhỏ có tiêu chí rõ; review độc lập |
| Kiểm thử và ổn định bị cắt vì gấp | Cao | Tuần 8 dành riêng cho ổn định; danh sách "không cắt" |
| Phụ thuộc một người nắm kiến trúc | Trung bình | Ghi vào repo (`CLAUDE.md`, ADR, runbook); Dev FE nắm phần giao diện |
| Code do AI sinh ra lệch kiến trúc | Trung bình | Quy ước trong repo, CI, review của người, review độc lập |
| Hạn mức AI bị chặn giữa chừng (nhất là ghế Dev) | Trung bình | Theo dõi mức dùng từ tuần đầu; sẵn phương án nâng Premium cho ghế chạm trần |
| Kỳ vọng "realtime" quá rộng | Trung bình | Phân biệt hai luồng dữ liệu (mục 6) và hiển thị độ mới của dữ liệu |

---

## 12. Điểm cần xác nhận kỹ thuật

Các quyết định đã chốt ở mục 5 vẫn cần kiểm tra thêm những điểm sau trước khi viết DDL đầu tiên.

| Điểm | Vấn đề | Gợi ý |
|---|---|---|
| Win10 làm server Production | Windows 10 đã hết hỗ trợ từ tháng 10/2025 (trừ khi mua gói hỗ trợ mở rộng) và là bản dành cho máy trạm | Dùng Windows Server hoặc Linux |
| Tách database theo module | Báo cáo và truy vấn xuyên module phải đi cross-database; không có transaction chung; backup/restore cần đồng bộ thời điểm giữa các database | Chốt quy ước truy vấn chéo, nơi đặt báo cáo tổng hợp, kế hoạch backup đồng thời. Phương án nhẹ hơn: một database, mỗi module một schema, vẫn tách được sau |
| `ModifiedAt` và Linked Server | `ModifiedAt` không phát hiện được bản ghi bị xóa ở nguồn; truy vấn Linked Server dễ kéo cả bảng về nếu điều kiện lọc không được đẩy sang nguồn | Xác nhận cột này đáng tin trên view BRAVO/OSM; dùng `OPENQUERY` hoặc view lọc sẵn; đối soát định kỳ để bắt dữ liệu bị xóa |
| "OSM (database)" | Nếu đó là CSDL nội dung của SharePoint thì không nên đọc trực tiếp | Chỉ đọc qua bảng/view trung gian đã được chỉ định |
| PWA và Nginx | PWA chỉ cài và chạy offline được trên HTTPS; WebSocket qua Nginx cần cấu hình chuyển tiếp header `Upgrade`/`Connection` | Chuẩn bị chứng chỉ cho tên miền nội bộ; cấu hình WebSocket proxy; kiểm thử trên điện thoại thật qua VPN |
| Khóa ngoại vật lý hay khóa ngầm | Nhiều nhà máy cùng ghi dữ liệu, số liệu dùng để quản trị | Chốt trước dòng DDL đầu tiên; nếu không dùng khóa ngoại thật thì cần file khai báo khóa ngầm, linter schema và script kiểm bản ghi mồ côi chạy hằng đêm |
| Ghế AI | Giá và hạn mức có thể khác theo khu vực | Kiểm tra tại claude.ai/upgrade trước khi chốt; theo dõi mức dùng của ghế Dev |

## 13. Các điểm đề nghị Ban lãnh đạo quyết định

1. Duyệt hướng kiến trúc: tách riêng khỏi GSD, Modular Monolith.
2. Duyệt phạm vi và định nghĩa "hoàn thành": pilot ổn định tại 1 nhà máy trong 40 ngày.
3. Chỉ định nhà máy pilot, BA, Key user và các đầu mối cấp quyền truy cập.
4. Duyệt nguồn lực: 2 Dev theo quỹ giờ trên, review độc lập định kỳ, 3 ghế AI.
5. Chốt phương án triển khai tới nhà máy: VPN nội bộ là ưu tiên, phương án public độc lập là dự phòng.