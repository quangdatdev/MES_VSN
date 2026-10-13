// Cấu hình pm2 của máy chủ (Windows). deploy/deploy.cjs chép file này ra <DeployRoot> mỗi lần triển khai, pm2 đọc ở đó.
// Đường dẫn tính từ vị trí file (<DeployRoot>, thư mục thật) và chạy qua junction `current`: đổi bản chỉ cần trỏ lại
// `current` rồi `pm2 reload`. Không đặt biến môi trường ở đây: cấu hình, bí mật nằm trong backend\.env của từng bản.
const path = require('path');

const root = __dirname;

module.exports = {
  apps: [
    {
      name: 'mes',
      script: path.join(root, 'current', 'backend', 'dist', 'main.js'),
      args: '--serve-web',
      // Không đặt trong `current`: gỡ, tạo lại junction lúc chuyển bản không vướng thư mục làm việc của tiến trình cũ.
      // Backend tìm .env và giao diện theo vị trí thật của main.js, không theo thư mục làm việc
      cwd: root,
      // cluster: `pm2 reload` bật tiến trình mới, chờ nó nghe cổng rồi mới tắt tiến trình cũ, web không bị hạ.
      // Lúc reload pm2 tắt cứng tiến trình cũ (đã kiểm mã pm2 7.0.4): request nó đang xử lý đúng lúc đó bị cắt
      exec_mode: 'cluster',
      instances: 1,
      // Windows không gửi được SIGINT (pm2 sẽ tắt cứng): `pm2 stop`, `restart`, `delete` báo tắt qua tin nhắn,
      // main.ts đóng app êm (xong request đang chạy, đóng pool DB)
      shutdown_with_message: true,
      kill_timeout: 15000,
      // Tiến trình mới khởi động (Nest, kết nối DB) quá mốc này mà chưa nghe cổng thì pm2 vẫn tắt tiến trình cũ
      listen_timeout: 60000,
      // Một file log, không thêm số thứ tự tiến trình vào tên file như mặc định của cluster
      merge_logs: true,
      out_file: path.join(root, 'logs', 'mes-out.log'),
      error_file: path.join(root, 'logs', 'mes-error.log'),
      time: true,
    },
  ],
};
