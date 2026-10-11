import { AppException } from '../../common/app.exception';
import type { AuthUser } from '../../platform/auth/auth.types';
import type { FieldPolicyService } from '../../platform/permission/field-policy.service';
import type { OrderListQuery } from './order.dto';

/** Cột DATE về dạng Date lúc 00:00 UTC; trả chuỗi YYYY-MM-DD cho giao diện. */
export const day = (d: Date | string | null | undefined): string | null =>
  d == null ? null : d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);

export const num = (v: unknown): number | null => (v == null ? null : Number(v));

/** Sắp xếp từ tham số client (trường JSON) sang cột DB theo danh sách trắng. */
export function sortOf(map: Record<string, string>, sort: string | undefined, fallback: string): string {
  const [field, dir] = (sort ?? fallback).split(':');
  const column = map[field] ?? map[fallback.split(':')[0]];
  return `${column}:${dir === 'desc' ? 'desc' : 'asc'}`;
}

const escapeLike = (s: string) => `%${s.replace(/[%_[]/g, (c) => `[${c}]`)}%`;

type FilterColumns = { ship: string | null; customer: string | null; style: string | null; season: string | null; status: string | null };

/** Bộ lọc nghiệp vụ chung (ngày xuất hàng, khách hàng, mã hàng, mùa, trạng thái). Cột null: bảng không có, bỏ qua. */
export function businessFilter(q: OrderListQuery, columns: Partial<FilterColumns> = {}) {
  const c: FilterColumns = { ship: 'ShipDate', customer: 'CustomerName', style: 'StyleCode', season: null, status: 'StatusCode', ...columns };
  return <Q extends { where: (...a: any[]) => Q }>(qb: Q): Q => {
    if (c.ship && q.shipFrom) qb = qb.where(c.ship, '>=', q.shipFrom);
    if (c.ship && q.shipTo) qb = qb.where(c.ship, '<=', q.shipTo);
    if (c.customer && q.customer) qb = qb.where(c.customer, 'like', escapeLike(q.customer));
    if (c.style && q.style) qb = qb.where(c.style, 'like', escapeLike(q.style));
    if (c.season && q.season) qb = qb.where(c.season, '=', q.season);
    if (c.status && q.status) qb = qb.where(c.status, '=', q.status);
    return qb;
  };
}

export { escapeLike };

/** Tham số lọc của client → mã cột (trường JSON) nó lọc theo. */
const FILTER_FIELDS = {
  customer: 'customerName',
  style: 'styleCode',
  season: 'season',
  status: 'statusCode',
  line: 'lineCode',
  shipFrom: 'shipDate',
  shipTo: 'shipDate',
} as const;
type FilterParams = Partial<Record<keyof typeof FILTER_FIELDS, string>>;
/** Cột DB được tìm theo q → mã cột. */
const SEARCH_FIELDS: Record<string, string> = {
  CustomerName: 'customerName',
  StyleCode: 'styleCode',
  ProductName: 'productName',
  PoBuyDate: 'poBuyDate',
  PlanNo: 'planNo',
  OrderNo: 'orderNo',
  PoCode: 'poCode',
  PoNumber: 'poNumber',
};

/**
 * Bỏ bộ lọc và cột tìm kiếm theo cột người dùng không được xem nguyên giá trị (Ẩn, Che) của tài nguyên: lọc
 * "khách hàng chứa N" rồi xem còn dòng nào là dò ra được tên đã bị che (review 5.1 lượt 2 N3).
 */
export async function readableQuery<Q extends FilterParams>(
  fields: FieldPolicyService,
  user: AuthUser,
  resource: string,
  q: Q,
): Promise<Q & { searchExclude: string[] }> {
  const blind = await fields.unreadable(user, resource, [...new Set([...Object.values(FILTER_FIELDS), ...Object.values(SEARCH_FIELDS)])]);
  const out: Q = { ...q };
  for (const [param, field] of Object.entries(FILTER_FIELDS)) if (blind.has(field)) delete out[param as keyof typeof FILTER_FIELDS];
  return { ...out, searchExclude: Object.entries(SEARCH_FIELDS).filter(([, f]) => blind.has(f)).map(([c]) => c) };
}

/**
 * Ngày làm việc thứ n tính từ `start` (tính cả ngày bắt đầu), bỏ Chủ nhật như bảng dàn chuyền ("Ng" = nghỉ).
 * n = số ngày sản xuất + số ngày nghỉ khác.
 */
export function addWorkingDays(start: string, n: number): string {
  const d = new Date(`${start}T00:00:00Z`);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  // Tính theo tuần (6 ngày làm) rồi lặp phần lẻ (< 6 ngày): không lặp theo số ngày nên đầu vào lớn không làm treo máy chủ
  let left = Math.max(1, Math.trunc(n)) - 1;
  d.setUTCDate(d.getUTCDate() + Math.floor(left / 6) * 7);
  left %= 6;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0) left--;
  }
  return d.toISOString().slice(0, 10);
}

/** Số ngày sản xuất tối đa của một dòng dàn chuyền (chặn đầu vào vô lý trước khi tính ngày). */
export const MAX_PRODUCTION_DAYS = 366;

export const conflict = (msg: string) => new AppException('CONFLICT', msg, 409);
export const invalid = (msg: string, details: unknown = null) => new AppException('VALIDATION_FAILED', msg, 422, details);

/** Lỗi khóa ngoại khi xóa dòng đang được dùng: đổi thành thông báo dễ hiểu. */
export function isReferenceError(e: unknown) {
  return /REFERENCE constraint|FOREIGN KEY constraint/i.test((e as Error)?.message ?? '');
}

/** Gom số lượng theo màu cỡ, giữ thứ tự xuất hiện. */
export function byColorSize<T extends { ColorName: string; SizeName: string }>(rows: T[], qty: (r: T) => number) {
  const map = new Map<string, { colorName: string; sizeName: string; qty: number }>();
  for (const r of rows) {
    const k = `${r.ColorName}\u0000${r.SizeName}`;
    const cur = map.get(k) ?? { colorName: r.ColorName, sizeName: r.SizeName, qty: 0 };
    cur.qty += qty(r);
    map.set(k, cur);
  }
  return map;
}

export const csKey = (color: string, size: string) => `${color}\u0000${size}`;

/** Chia `total` theo tỷ lệ `weights`, làm tròn mà tổng vẫn đúng bằng `total` (phần dư lớn nhất được cộng trước). */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}
