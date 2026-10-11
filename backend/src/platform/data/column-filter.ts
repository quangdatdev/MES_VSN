import { sql, type Expression, type ExpressionBuilder, type RawBuilder, type SqlBool } from 'kysely';
import { AppException } from '../../common/app.exception';
import type { AuthUser } from '../auth/auth.types';
import type { FieldPolicyService } from '../permission/field-policy.service';

/**
 * Lọc theo giá trị của cột (nút mũi tên trên tiêu đề lưới, kiểu Excel) – ADR 0011.
 * Client gửi `cf` dạng JSON {"<trường JSON>": {"in": [...]}} hoặc {"notIn": [...]}; null là ô trống.
 * Mỗi màn khai báo danh sách trắng (FilterSpec): trường JSON → biểu thức SQL do máy chủ dựng, không lấy gì từ client
 * ngoài giá trị (đi qua tham số). Danh sách giá trị để chọn cũng lấy từ DB, qua BaseRepository.distinctValues, trong
 * cùng phạm vi phân quyền và bộ lọc đang áp.
 */

/**
 * text: chuỗi (rỗng coi như trống); number; date: cột DATE; day: cột DATETIME2 mà lưới hiện phần ngày như lưu (thời
 * điểm đồng bộ lấy từ BRAVO); datetime: cột DATETIME2 lưu giờ UTC (CreatedAt), lọc theo ngày giờ Việt Nam như lưới hiện.
 */
export type FilterKind = 'text' | 'date' | 'day' | 'datetime' | 'number';
const DATE_KINDS: FilterKind[] = ['date', 'day', 'datetime'];

export interface FilterColumn {
  /** Tên cột của bảng chính, hoặc biểu thức máy chủ dựng sẵn (cột của bảng cha qua truy vấn con, tổng của bảng con). */
  expr: string | RawBuilder<unknown>;
  kind: FilterKind;
}
export type FilterSpec = Record<string, FilterColumn>;

export type FilterValue = string | number | null;
export interface ColumnFilter {
  field: string;
  mode: 'in' | 'notIn';
  values: FilterValue[];
}

/** Tổng số giá trị của mọi cột trong một lần lọc: SQL Server nhận tối đa 2.100 tham số mỗi câu, còn chừa cho phạm vi, bộ lọc khác. */
export const MAX_FILTER_VALUES = 500;
/** Độ dài tối đa của `cf` (chưa mã hóa URL). Giao diện chặn trước ở mức thấp hơn, tính theo chuỗi đã mã hóa. */
export const MAX_FILTER_LENGTH = 8000;
/** Số giá trị tối đa trả về cho popup lọc; nhiều hơn thì người dùng gõ để thu hẹp. */
export const VALUES_LIMIT = 500;
const MAX_TEXT = 200;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const FALSE = sql<SqlBool>`1 = 0`;

const invalid = (msg: string) => new AppException('VALIDATION_FAILED', msg, 422);
const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const realDate = (s: string) => {
  if (!DATE_ONLY.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

function normalize(v: unknown, kind: FilterKind, field: string): FilterValue {
  if (v === null) return null;
  const bad = () => invalid(`Giá trị lọc của cột "${field}" không hợp lệ.`);
  if (kind === 'number') {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (!Number.isFinite(n)) throw bad();
    return n;
  }
  if (typeof v !== 'string') throw bad();
  if (DATE_KINDS.includes(kind)) {
    if (!realDate(v)) throw bad();
    return v;
  }
  if (v.length > MAX_TEXT) throw bad();
  // SQL Server bỏ khoảng trắng cuối khi so sánh ('   ' = ''): ô chỉ có khoảng trắng cũng là ô trống
  return v.trim() === '' ? null : v;
}

/** Đọc tham số `cf`. Cột ngoài danh sách trắng, dạng sai, quá nhiều giá trị: 422. */
export function parseColumnFilters(raw: string | undefined, spec: FilterSpec): ColumnFilter[] {
  if (!raw) return [];
  if (raw.length > MAX_FILTER_LENGTH) throw invalid('Bộ lọc theo cột quá dài. Bỏ bớt giá trị đã chọn, hoặc dùng ô lọc phía trên lưới.');
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw invalid('Bộ lọc theo cột không đúng dạng.');
  }
  if (!isPlain(data)) throw invalid('Bộ lọc theo cột không đúng dạng.');
  const out: ColumnFilter[] = [];
  let total = 0;
  for (const [field, f] of Object.entries(data)) {
    const col = Object.prototype.hasOwnProperty.call(spec, field) ? spec[field] : undefined;
    if (!col) throw invalid(`Không lọc được theo cột "${field}".`);
    const keys = isPlain(f) ? Object.keys(f) : [];
    const mode = keys[0];
    if (keys.length !== 1 || (mode !== 'in' && mode !== 'notIn')) throw invalid('Bộ lọc theo cột không đúng dạng.');
    const values = (f as Record<string, unknown>)[mode];
    if (!Array.isArray(values)) throw invalid('Bộ lọc theo cột không đúng dạng.');
    total += values.length;
    if (total > MAX_FILTER_VALUES) throw invalid(`Bộ lọc theo cột chọn tối đa ${MAX_FILTER_VALUES} giá trị. Hãy bỏ bớt, hoặc dùng ô lọc phía trên lưới.`);
    const normalized = [...new Set(values.map((v) => normalize(v, col.kind, field)))];
    out.push({ field, mode, values: normalized });
  }
  return out;
}

/**
 * Bộ lọc theo cột của client, bỏ cột người dùng không được xem nguyên giá trị (Ẩn, Che): lọc theo giá trị bị che
 * rồi xem còn dòng nào là dò ra giá trị (như readableQuery, review 5.1 lượt 2 N3).
 */
export async function readableColumnFilters(fields: FieldPolicyService, user: AuthUser, resource: string, raw: string | undefined, spec: FilterSpec) {
  const filters = parseColumnFilters(raw, spec);
  if (filters.length === 0) return filters;
  const blind = await fields.unreadable(user, resource, filters.map((f) => f.field));
  return filters.filter((f) => !blind.has(f.field));
}

/** Biểu thức giá trị của cột: cột DATETIME2 (giờ UTC) đổi sang ngày theo giờ Việt Nam (UTC+7, không có giờ mùa hè). */
export function valueExpr(col: FilterColumn): RawBuilder<unknown> {
  const base = typeof col.expr === 'string' ? sql.ref(col.expr) : col.expr;
  if (col.kind === 'datetime') return sql`CAST(DATEADD(HOUR, 7, ${base}) AS DATE)`;
  return col.kind === 'day' ? sql`CAST(${base} AS DATE)` : base;
}

function condition(eb: ExpressionBuilder<any, any>, f: ColumnFilter, col: FilterColumn): Expression<SqlBool> {
  const v = valueExpr(col);
  const values = f.values.filter((x): x is string | number => x !== null);
  const blank = values.length !== f.values.length;
  const isBlank = col.kind === 'text' ? eb.or([eb(v, 'is', null), eb(v, '=', '')]) : eb(v, 'is', null);
  if (f.mode === 'in') {
    const parts: Expression<SqlBool>[] = [];
    if (values.length) parts.push(eb(v, 'in', values));
    if (blank) parts.push(isBlank);
    return parts.length ? eb.or(parts) : FALSE;
  }
  // notIn: bỏ các giá trị đã chọn. NOT IN gặp NULL thì không khớp, nên ô trống phải xét riêng
  if (blank) return values.length ? eb.and([eb.not(isBlank), eb(v, 'not in', values)]) : eb.not(isBlank);
  return values.length ? eb.or([isBlank, eb(v, 'not in', values)]) : sql<SqlBool>`1 = 1`;
}

/** Điều kiện WHERE của các bộ lọc theo cột (trừ cột `except`: popup lọc của một cột liệt kê giá trị theo các cột khác). */
export function columnFilterWhere(filters: ColumnFilter[], spec: FilterSpec, except?: string) {
  return <Q extends { where: (...a: any[]) => Q }>(qb: Q): Q => {
    for (const f of filters) if (f.field !== except) qb = qb.where((eb: ExpressionBuilder<any, any>) => condition(eb, f, spec[f.field]));
    return qb;
  };
}

const escapeLike = (s: string) => `%${s.replace(/[%_[]/g, (c) => `[${c}]`)}%`;

/**
 * Điều kiện tìm trong popup lọc (ô "Tìm giá trị"): chữ theo LIKE; ngày theo dạng dd/mm/yyyy như trên lưới; số bỏ dấu
 * chấm nghìn, dấu phẩy thập phân đổi thành dấu chấm (kiểu Việt Nam).
 */
export function valueSearch(col: FilterColumn, search: string | undefined) {
  const s = search?.trim();
  if (!s) return null;
  const v = valueExpr(col);
  if (col.kind === 'text') return (eb: ExpressionBuilder<any, any>) => eb(v, 'like', escapeLike(s));
  if (col.kind === 'number') {
    const n = s.replace(/[.\s]/g, '').replace(',', '.');
    return () => sql<SqlBool>`CONVERT(NVARCHAR(40), ${v}) LIKE ${escapeLike(n)}`;
  }
  return () => sql<SqlBool>`CONVERT(VARCHAR(10), ${v}, 103) LIKE ${escapeLike(s)}`;
}

/** Giá trị DB → JSON: ngày dạng YYYY-MM-DD, số là number, chuỗi rỗng là trống (null, xếp cuối như Excel). */
export function presentValues(rows: unknown[], kind: FilterKind): FilterValue[] {
  const out: FilterValue[] = [];
  let blank = false;
  for (const v of rows) {
    if (v == null || (typeof v === 'string' && v.trim() === '')) {
      blank = true;
      continue;
    }
    if (DATE_KINDS.includes(kind)) out.push(v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
    else if (kind === 'number') out.push(Number(v));
    else out.push(String(v));
  }
  return blank ? [...out, null] : out;
}

type Where = <Q extends { where: (...a: any[]) => Q }>(qb: Q) => Q;

/** Ghép nhiều điều kiện nghiệp vụ (bỏ qua phần không có). */
export function allOf(...parts: (Where | undefined | null)[]): Where {
  return <Q extends { where: (...a: any[]) => Q }>(qb: Q): Q => parts.reduce<Q>((q, p) => (p ? p(q) : q), qb);
}

/** Cột ngày xếp mới nhất lên trước như lưới: quá 500 ngày thì phần bị cắt là ngày cũ (review 5.6 L1). */
export const newestFirst = (col: FilterColumn) => DATE_KINDS.includes(col.kind);

/** Nguồn đọc giá trị: repository nền tảng (lọc nhà máy, phạm vi theo quyền). */
export interface DistinctSource<S> {
  distinctValues(
    scope: S,
    col: FilterColumn,
    opts: { q?: string; searchExclude?: string[]; where?: Where; search?: string; limit: number },
  ): Promise<{ rows: unknown[]; truncated: boolean }>;
}

/** Giá trị của một cột cho popup lọc, theo phạm vi và các bộ lọc khác đang áp (không tính bộ lọc của chính cột đó). */
export async function columnValues<S>(
  source: DistinctSource<S>,
  scope: S,
  col: FilterColumn,
  opts: { q?: string; searchExclude?: string[]; where?: Where; search?: string },
): Promise<{ values: FilterValue[]; truncated: boolean }> {
  const res = await source.distinctValues(scope, col, { q: opts.q, searchExclude: opts.searchExclude, where: opts.where, search: opts.search, limit: VALUES_LIMIT });
  return { values: presentValues(res.rows, col.kind), truncated: res.truncated };
}

/** Trường được hỏi giá trị phải nằm trong danh sách trắng và người dùng xem được nguyên giá trị. */
export async function assertFilterField(fields: FieldPolicyService, user: AuthUser, resource: string, spec: FilterSpec, field: string): Promise<FilterColumn> {
  const col = Object.prototype.hasOwnProperty.call(spec, field) ? spec[field] : undefined;
  if (!col) throw invalid(`Không lọc được theo cột "${field}".`);
  if ((await fields.unreadable(user, resource, [field])).size) {
    throw new AppException('FIELD_NOT_READABLE', 'Bạn không được xem nguyên giá trị của cột này nên không lọc theo cột này được.', 403);
  }
  return col;
}
