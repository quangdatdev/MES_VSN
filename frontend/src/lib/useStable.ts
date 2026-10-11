import { useRef } from 'react';

/**
 * Giữ nguyên tham chiếu của `value` tới khi `key` đổi. Dùng cho giá trị dựng mới mỗi lần vẽ nhưng nội dung ít đổi (bộ lọc
 * gửi máy chủ, các dòng xem trước), để component memo ở dưới không vẽ lại khi nội dung không đổi.
 */
export function useStableByKey<T>(value: T, key: string): T {
  const ref = useRef({ key, value });
  if (ref.current.key !== key) ref.current = { key, value };
  return ref.current.value;
}
