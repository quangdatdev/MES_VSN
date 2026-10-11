import { useCallback, useMemo } from 'react';
import { api } from './api';
import { qs } from './format';
import type { UrlPatch } from './useUrlParams';

/** Giá trị của một ô để lọc: chuỗi, số, ngày dạng YYYY-MM-DD; null là ô trống. */
export type FilterValue = string | number | null;
/** Bộ lọc của một cột (ADR 0011): chỉ giữ các giá trị đã chọn (in), hoặc bỏ các giá trị đã bỏ tích (notIn). */
export interface ColumnFilter {
  mode: 'in' | 'notIn';
  values: FilterValue[];
}
export type ColumnFilters = Record<string, ColumnFilter>;
export interface ValuesPage {
  values: FilterValue[];
  /** Còn giá trị chưa trả về (quá 500): gõ để thu hẹp */
  truncated: boolean;
}
export type LoadValues = (field: string, search: string) => Promise<ValuesPage>;

/** Số giá trị tối đa của một lần lọc (máy chủ chặn cùng mức). */
export const MAX_FILTER_VALUES = 500;
/**
 * Độ dài tối đa của `cf` sau khi mã hóa URL. Chữ Việt có dấu nở 2-3 lần khi mã hóa; dòng request quá dài thì máy chủ trả
 * 431 trước cả khi kiểm dữ liệu (review 5.6 M2). Máy chủ nhận tới 8.000 ký tự chưa mã hóa.
 */
export const MAX_FILTER_URL = 6000;
export const filterUrlLength = (filters: ColumnFilters) => encodeURIComponent(serializeColumnFilters(filters) ?? '').length;

const isValue = (v: unknown): v is FilterValue => v === null || typeof v === 'string' || typeof v === 'number';

/** Đọc `cf` trên URL. Link cũ, gõ tay sai dạng thì bỏ qua phần sai thay vì báo lỗi cả màn. */
export function parseColumnFilters(raw: string | null): ColumnFilters {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};
    const out: ColumnFilters = {};
    for (const [field, f] of Object.entries(data as Record<string, unknown>)) {
      if (typeof f !== 'object' || f === null) continue;
      const entry = f as Record<string, unknown>;
      const mode = Array.isArray(entry.in) ? 'in' : Array.isArray(entry.notIn) ? 'notIn' : null;
      if (!mode) continue;
      const values = (entry[mode] as unknown[]).filter(isValue);
      out[field] = { mode, values };
    }
    return out;
  } catch {
    return {};
  }
}

/** Dạng gửi máy chủ và ghi lên URL; không có bộ lọc nào thì undefined (bỏ khỏi URL). */
export function serializeColumnFilters(filters: ColumnFilters): string | undefined {
  const entries = Object.entries(filters);
  if (entries.length === 0) return undefined;
  return JSON.stringify(Object.fromEntries(entries.map(([field, f]) => [field, { [f.mode]: f.values }])));
}

/**
 * Bộ lọc theo cột của một lưới, giữ trên URL (F5, gửi link vẫn còn). Đổi bộ lọc thì về trang 1. Màn có hai lưới
 * (mã hàng và PO) dùng tên tham số riêng cho lưới thứ hai.
 */
export function useColumnFilters(url: URLSearchParams, patch: (values: UrlPatch) => void, key = 'cf', pageKey = 'page') {
  const raw = url.get(key);
  const filters = useMemo(() => parseColumnFilters(raw), [raw]);
  const param = useMemo(() => serializeColumnFilters(filters), [filters]);
  const setFilter = useCallback(
    (field: string, f: ColumnFilter | null) => {
      const next = { ...filters };
      if (f) next[field] = f;
      else delete next[field];
      patch({ [key]: serializeColumnFilters(next) ?? null, [pageKey]: null });
    },
    [filters, patch, key, pageKey],
  );
  const clear = useCallback(() => patch({ [key]: null, [pageKey]: null }), [patch, key, pageKey]);
  return { filters, param, setFilter, clear, active: param !== undefined };
}

/**
 * Hàm lấy giá trị cho popup lọc của một màn: gọi `<path>/values` kèm các bộ lọc đang áp (máy chủ tự bỏ bộ lọc của
 * chính cột đang mở), để danh sách chỉ gồm giá trị còn xuất hiện trong dữ liệu đã lọc.
 */
export function valuesLoader(path: string, params: Record<string, string | number | null | undefined>): LoadValues {
  return (field, search) => api<ValuesPage>(`${path}/values${qs({ ...params, field, search: search.trim() || undefined })}`);
}
