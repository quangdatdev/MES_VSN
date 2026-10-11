import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Không bật globals của vitest nên Testing Library không tự dọn DOM giữa các test.
afterEach(() => cleanup());

// Chạy cả bộ, các tệp test song song tranh CPU: màn có lưới lớn vẽ chậm hơn mốc 1 giây mặc định của findBy/waitFor.
// Mốc này chỉ là thời gian chờ tối đa, test vẫn qua ngay khi phần tử xuất hiện (phase 5.7, mục Phát sinh)
configure({ asyncUtilTimeout: 4000 });

// Mantine cần matchMedia và ResizeObserver, jsdom không có sẵn.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

// jsdom không có scrollIntoView (ô chọn gọi khi mở danh sách) và document.fonts (ô nhập nhiều dòng tự giãn theo phông chữ)
Element.prototype.scrollIntoView = () => {};
if (!document.fonts) Object.defineProperty(document, 'fonts', { configurable: true, value: { addEventListener: () => {}, removeEventListener: () => {} } });
