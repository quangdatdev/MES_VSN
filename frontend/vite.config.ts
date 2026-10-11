import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Dev: frontend chạy cổng 5173, API ở 3000. Proxy giúp cùng origin nên cookie refresh (SameSite=Strict) hoạt động.
// Thư viện dùng ngay lúc mở trang tách khỏi code ứng dụng: mỗi lần triển khai chỉ sửa code ứng dụng thì trình duyệt
// giữ nguyên bản đã lưu của các gói thư viện (tên file theo nội dung không đổi), chỉ tải lại phần ứng dụng.
// Không gom JS của Mantine: gom cả gói thì các thành phần chỉ màn khác dùng (ô chọn, ô số…) cũng bị tải ngay lúc mở trang
// (đo ngày 11/10/2026: thêm khoảng 37 kB gzip lần đầu). Thư viện chỉ màn nào đó mới dùng để Vite tự chia theo màn.
const nm = (pattern: string) => new RegExp(`[\\\\/]node_modules[\\\\/](${pattern})[\\\\/]`);
const VENDOR_GROUPS = [
  { name: 'vendor-react', test: nm('react|react-dom|scheduler|react-router|react-router-dom|cookie|set-cookie-parser') },
  // Chỉ TanStack Query: @tanstack/react-virtual là của lưới nhập, để đi theo màn có lưới nhập
  { name: 'vendor-query', test: nm('@tanstack[\\\\/](react-query|query-core)|zustand') },
];
// Không tách CSS của Mantine ra file riêng: file đó nạp sau CSS ứng dụng, các ghi đè trong global.css (cỡ nút, ô nhập,
// chữ) mất tác dụng ở bản build (review 5.7). CSS giữ một file theo đúng thứ tự import ở main.tsx.

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: { codeSplitting: { groups: VENDOR_GROUPS } },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Test màn hình dựng cả lưới lớn: chạy song song trên máy bận có thể quá 5 giây mặc định
    testTimeout: 15_000,
    css: false,
  },
});
