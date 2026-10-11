/**
 * Khóa truy vấn dùng ở nhiều màn thuộc các nhóm khác nhau (Đơn hàng và Quản trị). Đặt ở `lib` để hai bên dùng chung một
 * hằng, không viết tay mỗi nơi một chuỗi.
 */

/**
 * Gợi ý của các ô lọc, ô nhập Đơn hàng: khách hàng, season, loại, đơn vị, nhà máy SX. Không nằm dưới `['order']`: ghi kế
 * hoạch, dàn chuyền, tỷ lệ cắt không đổi các giá trị này; chỉ ghi đơn hàng và sửa danh mục mới làm mới.
 */
export const ORDER_OPTIONS_KEY = ['order-options'] as const;
