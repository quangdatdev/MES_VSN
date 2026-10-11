import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

export type UrlPatch = Record<string, string | number | null | undefined>;

/**
 * Tham số trên URL của màn (trang, sắp xếp, bộ lọc, dòng đang chọn): tải lại trang hay gửi link vẫn giữ nguyên.
 * Ghi kiểu replace để không làm đầy lịch sử trình duyệt mỗi lần gõ lọc; giá trị rỗng thì bỏ khỏi URL.
 */
export function useUrlParams() {
  const [params, setParams] = useSearchParams();
  // Đọc qua ref: hai lần ghi liền nhau trước khi URL kịp đổi không đè mất nhau (hàm cập nhật của setSearchParams không xếp hàng như setState)
  const latest = useRef({ params, setParams });
  latest.current = { params, setParams };
  const patch = useCallback((values: UrlPatch) => {
    const { params: current, setParams: write } = latest.current;
    const next = new URLSearchParams(current);
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined || v === null || v === '') next.delete(k);
      else next.set(k, String(v));
    }
    if (next.toString() === current.toString()) return;
    latest.current = { params: next, setParams: write };
    write(next, { replace: true });
  }, []);
  return [params, patch] as const;
}

/** Số trang từ URL; giá trị lạ (chữ, số âm) về trang 1. `key`: tên tham số khi màn có hai lưới phân trang. */
export const pageOf = (params: URLSearchParams, key = 'page') => {
  const n = Math.floor(Number(params.get(key)));
  // Số vô lý (Infinity, 1e20) gõ tay trên URL: máy chủ từ chối, lưới không tự sửa được nên về trang 1
  return Number.isSafeInteger(n) && n > 0 && n <= 1_000_000 ? n : 1;
};

/** Trang trên URL vượt trang cuối (link cũ, vừa xóa dòng cuối trang cuối): về trang cuối thay vì báo bảng rỗng. */
export function useClampPage(data: { items: unknown[]; total: number } | undefined, page: number, pageSize: number, goTo: (page: number) => void) {
  useEffect(() => {
    if (data && data.total > 0 && data.items.length === 0 && page > 1) goTo(Math.max(1, Math.ceil(data.total / pageSize)));
  }, [data, page, pageSize, goTo]);
}
