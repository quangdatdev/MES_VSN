// Test không tự nạp đơn hàng BRAVO (nạp tăng dần sau đồng bộ, lúc khởi động): bài test đồng bộ không kéo đơn thật vào
// MES_Order, kể cả máy đặt BRAVO_ORDER_IMPORT=true trong .env. Bài nạp gọi thẳng repository, service.
process.env.BRAVO_ORDER_IMPORT = 'false';
