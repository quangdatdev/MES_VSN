import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useSession } from '../store/session';
import { api, ApiError } from './api';
import { useColumnFilters, valuesLoader } from './columnFilter';
import { readable, type FieldPolicy } from './fieldPolicy';
import { qs } from './format';
import type { Paged } from './types';
import { pageOf, useClampPage, useUrlParams, type UrlPatch } from './useUrlParams';
import { useStableByKey } from './useStable';

/** Bộ lọc chung của các lưới theo mô tả giao diện. */
export interface OrderFilter {
  shipFrom: string;
  shipTo: string;
  customer: string;
  style: string;
  season: string;
  status: string;
  line: string;
  /** Tìm nhanh (số chứng từ, PO/Buy date...) */
  q: string;
  /** Ngày tạo phiếu từ, đến; Số lệnh cấp; Người lập (màn Xác nhận cấp BTP, phase 5.15). Màn khác để trống: không gửi lên máy chủ */
  createdFrom: string;
  createdTo: string;
  supplyNo: string;
  creator: string;
}

export const emptyFilter: OrderFilter = { shipFrom: '', shipTo: '', customer: '', style: '', season: '', status: '', line: '', q: '', createdFrom: '', createdTo: '', supplyNo: '', creator: '' };

export function filterParams(f: OrderFilter) {
  return {
    shipFrom: f.shipFrom,
    shipTo: f.shipTo,
    customer: f.customer.trim(),
    style: f.style.trim(),
    season: f.season,
    status: f.status,
    line: f.line,
    q: f.q.trim(),
    createdFrom: f.createdFrom,
    createdTo: f.createdTo,
    supplyNo: f.supplyNo.trim(),
    creator: f.creator.trim(),
  };
}


const FILTER_KEYS = Object.keys(emptyFilter) as (keyof OrderFilter)[];

/**
 * Bộ lọc chung: đọc từ URL lúc mở màn, giữ ở state, mỗi lần đổi thì ghi URL cùng lúc với các tham số khác (`extra`, ví dụ
 * về trang 1). Ô chữ tự chờ ngừng gõ (`DebouncedTextInput`) nên màn vẽ lại và gọi danh sách một lần mỗi lần đổi lọc.
 * Ô lọc đọc state chứ không đọc URL: URL đổi trong startTransition của React Router, đọc từ đó thì ô có thể nhận giá trị
 * chậm một nhịp (ghi đè chữ đang gõ, Xóa lọc không xóa được chữ trong ô).
 */
export function useUrlFilter(params: URLSearchParams, patch: (values: UrlPatch) => void) {
  const [filter, setState] = useState<OrderFilter>(() => FILTER_KEYS.reduce((f, k) => ({ ...f, [k]: params.get(k) ?? '' }), emptyFilter));
  const setFilter = useCallback(
    (f: OrderFilter, extra: UrlPatch = {}) => {
      setState(f);
      patch({ ...f, ...extra });
    },
    [patch],
  );
  return { filter, setFilter, filtered: Object.values(filter).some(Boolean) };
}

/**
 * Danh sách có phân trang, sắp xếp, lọc (debounce) cho một endpoint của module; trang, sắp xếp, bộ lọc nằm trên URL.
 * Mặc định 100 dòng đầu, mới tạo lên trước; xem thêm thì sang trang. Mọi bộ lọc (dải lọc và lọc theo cột) chạy trong DB.
 */
export function usePagedList<T>(key: string, path: string, defaultSort = 'createdAt:desc', pageSize = 100) {
  const branch = useSession((s) => s.branch?.code);
  const [url, patch] = useUrlParams();
  const page = pageOf(url);
  const sort = url.get('sort') || defaultSort;
  const { filter, setFilter, filtered } = useUrlFilter(url, patch);
  const cols = useColumnFilters(url, patch);
  // Giữ nguyên object bộ lọc khi nội dung không đổi: hàm lấy giá trị cho popup lọc (nút lọc memo) cũng giữ nguyên
  const rawParams = { ...filterParams(filter), cf: cols.param };
  const params = useStableByKey(rawParams, JSON.stringify(rawParams));
  const loadValues = useMemo(() => valuesLoader(path, params), [path, params]);
  const query = useQuery({
    // Tiền tố 'order' giữ như khi hàm còn ở features/order: Thông tin đơn hàng làm mới cả nhóm ['order'], hai màn Cắt dựa vào đó (N7)
    queryKey: ['order', key, branch, page, sort, params],
    queryFn: () => api<Paged<T>>(`${path}${qs({ page, pageSize, sort, ...params })}`),
    placeholderData: keepPreviousData,
  });
  useClampPage(query.data, page, pageSize, (p) => patch({ page: p > 1 ? p : null }));
  const changeFilter = (f: OrderFilter) => setFilter(f, { page: null });
  return {
    query,
    url,
    patch,
    page,
    setPage: (p: number) => patch({ page: p > 1 ? p : null }),
    pageSize,
    sort,
    setSort: (s: string) => patch({ sort: s === defaultSort ? null : s, page: null }),
    filter,
    /** Đang có bộ lọc (dải lọc hoặc theo cột): câu báo rỗng kèm nút Xóa lọc */
    filtered: filtered || cols.active,
    setFilter: changeFilter,
    clearFilter: () => {
      changeFilter(emptyFilter);
      cols.clear();
    },
    /** Props lọc theo cột cho DataGrid */
    grid: { columnFilters: cols.filters, onColumnFilter: cols.setFilter, loadValues },
    /** Cho dải lọc: tên các cột đang lọc (theo bảng tên cột của màn) và nút Xóa lọc */
    columnsOf: (names: Record<string, string>, policy?: FieldPolicy) => ({
      names: Object.keys(cols.filters)
        .filter((k) => readable(policy, k))
        .map((k) => names[k] ?? k),
      onClear: cols.clear,
    }),
    exportPath: `${path}/export${qs({ sort, ...params })}`,
    error: query.error ? (query.error instanceof ApiError ? query.error.message : 'Không tải được dữ liệu. Kiểm tra kết nối rồi thử lại.') : null,
  };
}
