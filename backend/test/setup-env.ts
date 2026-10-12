// Test không tự nạp đơn hàng BRAVO (nạp tăng dần sau đồng bộ, lúc khởi động): bài test đồng bộ không kéo đơn thật vào
// MES_Order, kể cả máy đặt BRAVO_ORDER_IMPORT=true trong .env. Bài nạp gọi thẳng repository, service.
process.env.BRAVO_ORDER_IMPORT = 'false';
// Cập nhật Nhà máy SX theo OSM lúc khởi động app test không chạy xen (mở khóa đơn thử không có trong OSM); bài test gọi thẳng
process.env.OSM_FACTORY_UPDATE = 'false';
// Làm mới bảng Phân bổ PO lúc khởi động, sau đồng bộ không chạy xen (xóa dòng thử không có trong bảng chép); bài test gọi thẳng
process.env.PO_ALLOCATION_REFRESH = 'false';
