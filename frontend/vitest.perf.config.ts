import { mergeConfig } from 'vitest/config';
import base from './vite.config.ts';

// Phép đo hiệu năng bằng dữ liệu giả (phase 5.7): chạy riêng bằng `npm run perf -w frontend`, không nằm trong `npm test`.
// Số đo là thời gian React vẽ trong jsdom (bản phát triển), chỉ để so trước và sau trên cùng máy.
export default mergeConfig(base, {
  test: {
    include: ['src/perf/**/*.perf.tsx'],
    testTimeout: 120_000,
    fileParallelism: false,
    // Vitest mặc định ẩn console của test qua: phép đo in bảng kết quả bằng console
    silent: false,
  },
});
