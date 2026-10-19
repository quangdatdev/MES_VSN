# YC-012 – <Tên tính năng>

| Mục | Giá trị |
|---|---|
| Phiên bản | 1.2 (13/10/2026) |
| Trạng thái | Nháp / Chốt để làm |
| Người viết | <BA> |
| Khối, menu | Quản trị đơn hàng › … |
| Liên quan | YC-008; màn đang có: Kế hoạch xuất hàng |

## 1. Bối cảnh và mục tiêu
Ai dùng, hiện đang làm thế nào (Excel?), vướng ở đâu, xong thì đo được điều gì.

## 2. Phạm vi
- Làm: …
- Không làm lần này: …

## 3. Thuật ngữ mới
| Thuật ngữ | Nghĩa |

## 4. Ai được làm gì
| Vai trò | Xem | Thêm | Sửa | Xóa | Xuất file | Ghi chú |
- Dữ liệu riêng từng ĐVCS hay dùng chung toàn công ty? Đăng nhập A00 thì thấy gì?
- Trong một ĐVCS có giới hạn thêm không (chỉ chuyền mình, chỉ bản mình tạo…)?
- Cột nhạy cảm (giá, lương…): ai không được thấy, ai chỉ thấy dạng che?

## 5. Dữ liệu
| Mã | Tên trên màn | Ý nghĩa | Kiểu, độ dài | Bắt buộc | Nguồn | Sửa được khi | Ví dụ (giả) |
|---|---|---|---|---|---|---|---|
| D-01 | Số lượng KH | … | số nguyên | Có | Nhập tay / BRAVO view X cột Y / OSM / tính theo QT-02 | Trước khi chốt | 1.200 |
- Khóa không được trùng: …
- Bản ghi bị xóa hoặc đổi ở nguồn thì: …

## 6. Màn hình
### 6.1 <Tên màn>
- Menu; ảnh: ![](anh/man-1.png)
- Lưới: các cột (theo mã D-xx), sắp xếp mặc định, ô lọc
- Nút:
  | Nút | Hiện khi | Khóa khi (câu báo cho người dùng) | Làm gì |
- Form: kiểm nhập, thông báo lỗi
- Có dùng trên điện thoại không?

## 7. Quy tắc nghiệp vụ
### QT-01 <tên>
Điều kiện, công thức. Ví dụ bằng số: SL 1.200, năng suất 350/ngày → 4 ngày
(làm tròn lên), bỏ Chủ nhật.

## 8. Trạng thái (nếu có)
| Từ | Sang | Khi nào | Ai được chuyển |

## 9. Tiêu chí nghiệm thu
| Mã | Cho | Khi | Thì | Theo |
|---|---|---|---|---|
| TC-01 | Đơn 1.200 cái, NSBQ 350 | Lập kế hoạch | Số ngày SX = 4 | QT-01 |

## 10. Câu hỏi BA chưa chốt
| # | Câu hỏi | Chặn phần nào | Trả lời |

## 11. Lịch sử
| Phiên bản | Ngày | Đổi gì (theo mã) |
| 1.2 | 13/10/2026 | Sửa QT-03, thêm TC-07, bỏ D-05 |
