import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Chạy một việc (thường là làm mới dữ liệu) sau khi popup đã đóng hẳn. Gọi ngay lúc popup còn mở thì TanStack tải lại cả
 * truy vấn của chính popup (chi tiết, bảng dàn chuyền…) rồi bỏ đi. Chạy trong effect của trang thì popup đã gỡ: truy vấn
 * của popup chỉ bị đánh dấu cũ, truy vấn đang hiện trên trang mới tải lại.
 */
export function useAfterClose(fn: () => unknown) {
  const latest = useRef(fn);
  latest.current = fn;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (tick) void latest.current();
  }, [tick]);
  return useCallback(() => setTick((t) => t + 1), []);
}
