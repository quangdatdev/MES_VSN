import { QueryClient } from '@tanstack/react-query';

/** Một cache dùng chung; xóa sạch khi phiên kết thúc hoặc đổi nhà máy để người sau không thấy dữ liệu người trước. */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 15_000 } },
});
