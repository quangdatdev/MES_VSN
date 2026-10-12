import { randomUUID } from 'crypto';
import { sql, type Expression, type ExpressionBuilder, type Kysely, type SelectQueryBuilder, type SqlBool } from 'kysely';
import { Errors } from '../../common/app.exception';
import type { AuthUser } from '../auth/auth.types';
import type { Condition, Grant, UserAccess } from '../permission/permission.service';
import { newestFirst, valueExpr, valueSearch, type FilterColumn } from './column-filter';
import type { ResourceInfo, ResourceRegistry } from './resource-registry';
import { inTransaction } from './transaction';

export type DataAction = 'view' | 'create' | 'update' | 'delete' | 'export';

/** Phạm vi dữ liệu của một request, luôn dựng từ AuthUser (token do server cấp, quyền do AuthGuard tính). */
export interface Scope {
  userId: number;
  branchCode: string;
  isAggregate: boolean;
  access: UserAccess;
}

export function scopeOf(user: AuthUser): Scope {
  if (user.tokenType !== 'access' || !user.branchCode || !user.access) throw Errors.unauthenticated();
  return { userId: user.userId, branchCode: user.branchCode, isAggregate: user.isAggregate, access: user.access };
}

export interface ListOptions {
  page: number;
  pageSize: number;
  q?: string;
  sort?: string;
  /** Điều kiện nghiệp vụ của màn hình (ngày, khách hàng, trạng thái). Không dùng để viết điều kiện phân quyền. */
  where?: <Q extends { where: (...a: any[]) => Q }>(qb: Q) => Q;
  /** Cột tính thêm cho mỗi dòng, ví dụ tổng của bảng con (biểu thức có alias). */
  select?: (eb: ExpressionBuilder<any, any>) => any[];
  /** Cột không tìm theo q: cột người dùng không được xem nguyên giá trị (tìm được là đoán được giá trị). */
  searchExclude?: string[];
  /**
   * Chỉ dòng của các nhà máy SX thuộc ĐVCS của phiên (ADR 0013 mục 11), theo cột `productionFactoryColumn` của repository
   * (danh sách mã cách nhau dấu phẩy: chỉ cần một mã thuộc ĐVCS). Danh sách nhà máy lấy từ quyền của phiên, không từ client.
   */
  assignedFactories?: boolean;
}

/** Tùy chọn của getById */
export interface GetOptions {
  /** Như ListOptions.assignedFactories */
  assignedFactories?: boolean;
}

const WRITE_ACTIONS: ReadonlySet<DataAction> = new Set(['create', 'update', 'delete']);

/** Cột do nền tảng quản lý, không bao giờ lấy từ dữ liệu module truyền vào (so không phân biệt hoa thường như SQL Server). */
const SYSTEM_COLUMNS = new Set(['id', 'branchcode', 'createdat', 'createdby', 'modifiedat', 'modifiedby']);
export const withoutSystemColumns = (values: Record<string, unknown>, extra: string[] = []) => {
  const drop = new Set([...SYSTEM_COLUMNS, ...extra.map((c) => c.toLowerCase())]);
  return Object.fromEntries(Object.entries(values).filter(([k]) => !drop.has(k.toLowerCase())));
};
const MAX_PAGE_SIZE = 200;
const MAX_EXPORT_ROWS = 10_000;
/**
 * Số Id mỗi câu khi ghi nhiều dòng: SQL Server giới hạn 2100 tham số mỗi câu, điều kiện phạm vi (nhà máy, chuyền, xưởng
 * của mọi phép gán) cũng chiếm tham số nên để dư.
 */
const BATCH = 500;
/** Số dòng mỗi câu INSERT nhiều dòng: mỗi ô một tham số, tối đa 100 dòng, không vượt 2000 tham số */
const insertBatch = (rows: Record<string, unknown>[]) => Math.max(1, Math.min(100, Math.floor(2000 / Math.max(1, ...rows.map((r) => Object.keys(r).length)))));
const FALSE = sql<SqlBool>`1 = 0`;

export interface Page<R> {
  items: R[];
  total: number;
  page: number;
  pageSize: number;
}

/** Bảng cha mà bảng con dựa vào để biết dòng nào nằm trong phạm vi. */
export interface ScopedParent {
  /** Phạm vi (các phép gán) của hành động trên tài nguyên gốc của chuỗi cha con. */
  grantsFor(scope: Scope, action: DataAction): Grant[];
  /** SELECT Id các dòng thỏa một phép gán (điều kiện của cả chuỗi cha con xét chung trong phép gán đó). */
  idsForGrant(scope: Scope, grant: Grant, db?: Kysely<any>): Promise<any>;
  getById(scope: Scope, id: number, action?: DataAction, db?: Kysely<any>): Promise<unknown>;
  /** SELECT Id các dòng trong phạm vi của hành động (để kiểm nhiều dòng cha một câu). */
  scopedIds(scope: Scope, action: DataAction, db?: Kysely<any>): Promise<any>;
  assertWritable(scope: Scope): Promise<void>;
  /** Dòng của bảng có lọc theo BranchCode của phiên không (BRANCH); bảng con lọc theo cùng cách với cha. */
  byBranch(scope: Scope): Promise<boolean>;
}

const valueOf = (row: Record<string, unknown>, column: string) => {
  const key = Object.keys(row).find((k) => k.toLowerCase() === column.toLowerCase());
  return key === undefined ? undefined : row[key];
};

/** Gộp giá trị mới vào dòng cũ theo tên cột không phân biệt hoa thường (như SQL Server), để kiểm phạm vi đúng giá trị sẽ ghi. */
function mergeRow(before: Record<string, unknown>, patch: Record<string, unknown>) {
  const out = { ...before };
  for (const [k, v] of Object.entries(patch)) {
    const existing = Object.keys(out).find((x) => x.toLowerCase() === k.toLowerCase());
    out[existing ?? k] = v;
  }
  return out;
}

function conditionExpr(eb: ExpressionBuilder<any, any>, c: Condition, column: string, scope: Scope): Expression<SqlBool> {
  if (c.kind === 'own') return eb(column, '=', scope.userId);
  if (c.kind === 'in' && c.values.length) return eb(column, 'in', c.values);
  return FALSE;
}

/** Giá trị của dòng (sau khi ghi) có thỏa các điều kiện không. `own` khớp khi người tạo là người đang thao tác. */
function rowSatisfies(row: Record<string, unknown>, conds: { c: Condition; column: string }[], scope: Scope) {
  return conds.every(({ c, column }) => {
    const v = valueOf(row, column);
    if (c.kind === 'own') return Number(v) === scope.userId;
    if (c.kind === 'in') return v != null && c.values.includes(String(v));
    return false;
  });
}

/**
 * Cổng duy nhất để module nghiệp vụ chạm bảng theo nhà máy (CLAUDE.md mục 4, ADR 0002, ADR 0005).
 *  - BRANCH: mọi thao tác tự thêm BranchCode của phiên; đơn vị tổng hợp (A00) đọc không lọc nhà máy, ghi bị từ chối.
 *  - Phạm vi L3: điều kiện sinh từ phạm vi của quyền đang dùng (view khi đọc; create, update, delete khi ghi),
 *    theo SysResourceScopeBinding. Không có quyền thì không thấy gì.
 *  - SHARED: không lọc nhà máy. Bảng dùng chung có cột BranchCode ghi ĐVCS nguồn (`originBranch`, ví dụ đơn hàng: Chi
 *    nhánh FOB): đọc không lọc, nhưng tạo thì đóng dấu ĐVCS của phiên, sửa, xóa chỉ dòng của ĐVCS đang làm việc (hoặc ĐVCS
 *    đang dùng dòng, `usedBy`), đơn vị tổng hợp chỉ đọc như BRANCH (ADR 0013).
 *  - Tài nguyên chưa khai báo ở SysResource: từ chối.
 * BranchCode khi tạo luôn lấy từ Scope, mọi giá trị client gửi bị ghi đè.
 * Kiểu dòng không bắt buộc có BranchCode: bảng SHARED (hồ sơ nhân viên) không có cột này. Lọc nhà máy theo ScopeType ở
 * SysResource, không theo kiểu TypeScript.
 */
export abstract class BaseRepository<R extends { Id: number }> implements ScopedParent {
  protected abstract readonly table: string;
  protected abstract readonly resource: string;
  /** Cột được tìm bằng LIKE khi có tham số q. */
  protected readonly searchColumns: string[] = [];
  /** Cột được phép sắp xếp (danh sách trắng, tránh chèn tên cột từ client). */
  protected readonly sortable: string[] = ['Id'];
  protected readonly defaultSort: string = 'Id:desc';
  /**
   * Bảng dùng chung (SHARED) nhưng có cột BranchCode ghi ĐVCS nguồn của dòng. Đọc không lọc ĐVCS (mọi ĐVCS xem được); ghi
   * như bảng theo ĐVCS: tạo mới thì BranchCode = ĐVCS của phiên (không nhận từ client), sửa, xóa chỉ dòng của ĐVCS đang
   * làm việc (dòng ĐVCS khác trả 404), ở đơn vị tổng hợp không ghi được. Người ĐVCS khác không đổi được dữ liệu dùng chung
   * mà ĐVCS khác dựa vào (ví dụ Nhà máy SX của đơn: review 5.9 H1), trừ ĐVCS đang dùng dòng (`usedBy`, ví dụ SL gốc của PO
   * nằm trong kế hoạch xuất hàng của ĐVCS đó).
   */
  protected readonly originBranch: boolean = false;
  /**
   * Bảng có ĐVCS nguồn mà ĐVCS khác dùng dòng của nó: bảng theo ĐVCS (cùng database, có cột BranchCode) trỏ tới dòng qua
   * cột `column`. ĐVCS có dòng trỏ tới (ví dụ PO nằm trong kế hoạch xuất hàng của ĐVCS đó: ShipmentPlanPo.SalesOrderPoId)
   * sửa, xóa được dòng như ĐVCS nguồn; `inUseHere` lọc màn hình theo cùng điều kiện (ADR 0013 mục 11).
   */
  protected readonly usedBy: { table: string; column: string } | null = null;
  /** Cột mã nhà máy SX của bảng, cho tùy chọn `assignedFactories` (ADR 0013). Không khai báo thì tùy chọn đó bị từ chối. */
  protected readonly productionFactoryColumn: string | null = null;

  // Kysely<any>: mỗi module truyền database riêng; tên bảng chỉ biết lúc chạy qua `table`.
  constructor(
    protected readonly db: Kysely<any>,
    private readonly registry: ResourceRegistry,
  ) {}

  private info(): Promise<ResourceInfo> {
    return this.registry.resolve(this.resource, this.table);
  }

  grantsFor(scope: Scope, action: DataAction): Grant[] {
    return scope.access.grants.get(`${this.resource}:${action}`) ?? [];
  }

  async byBranch(scope: Scope): Promise<boolean> {
    return (await this.info()).scope === 'BRANCH' && !scope.isAggregate;
  }

  /**
   * Giới hạn theo nhà máy SX thuộc ĐVCS của phiên (lấy từ quyền của phiên); ĐVCS chưa có nhà máy nào thì không thấy gì.
   * Cột nhà máy là danh sách mã cách nhau dấu phẩy (ADR 0013 mục 9, theo OSM): dòng hiện ra khi có ít nhất một mã thuộc ĐVCS.
   */
  private assigned<Q extends { where: (...a: any[]) => Q }>(qb: Q, scope: Scope, alias?: string): Q {
    if (!this.productionFactoryColumn) throw new Error(`${this.resource} không khai báo cột nhà máy SX (productionFactoryColumn)`);
    const factories = scope.access.productionFactories;
    const col = alias ? `${alias}.${this.productionFactoryColumn}` : this.productionFactoryColumn;
    if (!factories.length) return qb.where(FALSE);
    return qb.where(sql<SqlBool>`EXISTS (SELECT 1 FROM STRING_SPLIT(${sql.ref(col)}, ',') f WHERE f.value IN (${sql.join(factories)}))`);
  }

  /** Dòng có trong bảng `usedBy` của ĐVCS phiên (đơn vị tổng hợp: của bất kỳ ĐVCS nào). */
  private usedExpr(scope: Scope, alias?: string) {
    if (!this.usedBy) throw new Error(`${this.resource} không khai báo bảng dùng dòng (usedBy)`);
    const link = sql`${sql.ref(`usedby.${this.usedBy.column}`)} = ${sql.ref(`${alias ?? this.table}.Id`)}`;
    const from = sql`SELECT 1 FROM ${sql.table(this.usedBy.table)} usedby WHERE ${link}`;
    return scope.isAggregate ? sql<SqlBool>`EXISTS (${from})` : sql<SqlBool>`EXISTS (${from} AND usedby.BranchCode = ${scope.branchCode})`;
  }

  /**
   * Lọc của màn hình làm việc trên dòng dùng chung (ADR 0013 mục 11): dòng ĐVCS của phiên đang dùng (`usedBy`), hoặc dòng
   * người dùng nhập tay ở ĐVCS này (CreatedBy có giá trị; dòng nạp từ hệ thống nguồn để trống CreatedBy). Đơn vị tổng hợp:
   * của mọi ĐVCS. Không phải phân quyền (dòng vẫn đọc được ở màn khác); ghép vào `where` của danh sách. Cả hai loại dòng này
   * ĐVCS của phiên đều sửa được.
   */
  inUseHere(scope: Scope): <Q extends { where: (...a: any[]) => Q }>(qb: Q) => Q {
    if (!this.originBranch) throw new Error(`inUseHere chỉ dùng cho bảng có ĐVCS nguồn (${this.resource})`);
    const used = this.usedExpr(scope);
    const createdBy = sql.ref(`${this.table}.CreatedBy`);
    const entered = scope.isAggregate
      ? sql<SqlBool>`${createdBy} IS NOT NULL`
      : sql<SqlBool>`(${createdBy} IS NOT NULL AND ${sql.ref(`${this.table}.BranchCode`)} = ${scope.branchCode})`;
    return (qb) => qb.where(sql<SqlBool>`(${used} OR ${entered})`);
  }

  /** Lớp con dùng hàm này cho truy vấn riêng (thống kê, sinh số chứng từ) thay vì tự viết điều kiện phân quyền. */
  protected async scoped<Q extends { where: (...a: any[]) => Q }>(qb: Q, scope: Scope, action: DataAction = 'view', alias?: string): Promise<Q> {
    return this.limit(qb, scope, action, alias);
  }

  /**
   * Chỉ lọc nhà máy, bỏ qua phạm vi L3. Dùng cho số liệu kiểm ràng buộc trên cả nhà máy (ví dụ tổng số lượng đã lập
   * kế hoạch của một đơn hàng, để không lập vượt) – không dùng để trả dòng dữ liệu cho người dùng.
   */
  protected async branchOnly<Q extends { where: (...a: any[]) => Q }>(qb: Q, scope: Scope, alias?: string): Promise<Q> {
    const info = await this.info();
    return info.scope === 'BRANCH' && !scope.isAggregate ? qb.where(alias ? `${alias}.BranchCode` : 'BranchCode', '=', scope.branchCode) : qb;
  }

  private async limit<Q extends { where: (...a: any[]) => Q }>(qb: Q, scope: Scope, action: DataAction, alias?: string): Promise<Q> {
    const info = await this.info();
    const col = (c: string) => (alias ? `${alias}.${c}` : c);
    if (!scope.isAggregate && info.scope === 'BRANCH') qb = qb.where(col('BranchCode'), '=', scope.branchCode);
    else if (!scope.isAggregate && this.originBranch && WRITE_ACTIONS.has(action)) {
      // Ghi dòng dùng chung: ĐVCS nguồn, hoặc ĐVCS đang dùng dòng (usedBy)
      const usedBy = this.usedBy ? this.usedExpr(scope, alias) : null;
      qb = usedBy
        ? qb.where((eb: ExpressionBuilder<any, any>) => eb.or([eb(col('BranchCode'), '=', scope.branchCode), usedBy]))
        : qb.where(col('BranchCode'), '=', scope.branchCode);
    }

    const grants = this.grantsFor(scope, action);
    if (grants.length === 0) return qb.where(FALSE);
    // Chiều không gắn với tài nguyên này thì không áp (ví dụ phạm vi chuyền với bảng không có cột chuyền)
    const sets = grants.map((g) => g.conditions.filter((c) => info.bindings.has(c.dim)));
    if (sets.some((s) => s.length === 0)) return qb;
    return qb.where((eb: ExpressionBuilder<any, any>) =>
      eb.or(sets.map((conds) => eb.and(conds.map((c) => conditionExpr(eb, c, col(info.bindings.get(c.dim)!), scope))))),
    );
  }

  async idsForGrant(scope: Scope, grant: Grant, db: Kysely<any> = this.db) {
    const info = await this.info();
    let qb = db.selectFrom(this.table).select('Id');
    if (info.scope === 'BRANCH' && !scope.isAggregate) qb = qb.where('BranchCode', '=', scope.branchCode);
    const conds = grant.conditions.filter((c) => info.bindings.has(c.dim));
    if (conds.length) qb = qb.where((eb) => eb.and(conds.map((c) => conditionExpr(eb, c, info.bindings.get(c.dim)!, scope))));
    return qb;
  }

  /** Dòng (giá trị sau khi ghi) có nằm trong phạm vi của hành động không. Dùng cho thêm và sửa. */
  private async assertRowInScope(scope: Scope, action: DataAction, row: Record<string, unknown>) {
    const info = await this.info();
    const ok = this.grantsFor(scope, action).some((g) =>
      rowSatisfies(
        row,
        g.conditions.filter((c) => info.bindings.has(c.dim)).map((c) => ({ c, column: info.bindings.get(c.dim)! })),
        scope,
      ),
    );
    if (!ok) throw Errors.scopeDenied();
  }

  async assertWritable(scope: Scope) {
    const info = await this.info();
    if ((info.scope === 'BRANCH' || this.originBranch) && scope.isAggregate) throw Errors.aggregateReadOnly();
  }

  /** Câu SELECT Id của các dòng trong phạm vi của hành động. */
  async scopedIds(scope: Scope, action: DataAction, db: Kysely<any> = this.db) {
    return this.limit(db.selectFrom(this.table).select('Id'), scope, action);
  }

  /** `db`: truyền transaction khi đọc trong lúc đang giữ khóa, để không chiếm thêm kết nối của pool (review 5.1 N14). */
  async list(scope: Scope, opts: ListOptions, action: DataAction = 'view', db: Kysely<any> = this.db): Promise<Page<R>> {
    const counted = await this.filtered(db.selectFrom(this.table), scope, opts, action);
    const totalRow = await counted.select(sql<number>`COUNT(*)`.as('n')).executeTakeFirstOrThrow();
    const pageSize = Math.min(Math.max(1, Math.trunc(opts.pageSize) || 1), MAX_PAGE_SIZE);
    const page = Math.max(1, Math.trunc(opts.page) || 1);
    const rows = await this.filtered(db.selectFrom(this.table), scope, opts, action);
    const items = await this.ordered(rows, opts)
      .offset((page - 1) * pageSize)
      .fetch(pageSize)
      .execute();
    return { items: items as R[], total: Number(totalRow.n), page, pageSize };
  }

  /**
   * Các giá trị khác nhau của một cột trên các dòng trong phạm vi của hành động, khớp bộ lọc đang áp (popup lọc theo
   * cột, ADR 0011). Nhận cột của danh sách trắng (FilterSpec) và tự dựng biểu thức, không nhận SQL tùy ý từ module.
   * `search` là chữ người dùng gõ, đi qua tham số. Lấy thêm một dòng để biết còn giá trị nữa không.
   */
  async distinctValues(
    scope: Scope,
    col: FilterColumn,
    opts: Pick<ListOptions, 'q' | 'where' | 'searchExclude'> & { search?: string; limit: number },
    action: DataAction = 'view',
  ): Promise<{ rows: unknown[]; truncated: boolean }> {
    let qb = await this.filtered(this.db.selectFrom(this.table), scope, { q: opts.q, where: opts.where, searchExclude: opts.searchExclude, page: 1, pageSize: 1 }, action);
    const search = valueSearch(col, opts.search);
    if (search) qb = qb.where(search);
    const limit = Math.min(Math.max(1, Math.trunc(opts.limit) || 1), 1000);
    const rows = (await qb
      .select(valueExpr(col).as('v'))
      .distinct()
      .orderBy('v', newestFirst(col) ? 'desc' : 'asc')
      .offset(0)
      .fetch(limit + 1)
      .execute()) as { v: unknown }[];
    return { rows: rows.slice(0, limit).map((r) => r.v), truncated: rows.length > limit };
  }

  /** Toàn bộ dòng khớp điều kiện, cho xuất file (mặc định cần quyền export). */
  async listAll(scope: Scope, opts: Omit<ListOptions, 'page' | 'pageSize'>, action: DataAction = 'export'): Promise<R[]> {
    const rows = await this.filtered(this.db.selectFrom(this.table), scope, { ...opts, page: 1, pageSize: MAX_EXPORT_ROWS }, action);
    return (await this.ordered(rows, opts).offset(0).fetch(MAX_EXPORT_ROWS).execute()) as R[];
  }

  /**
   * Câu truy vấn trên các dòng khớp phạm vi, tìm kiếm, điều kiện như list(), chưa chọn cột: để lớp con đếm, thống kê trên
   * đúng tập dòng của danh sách mà không tự viết lại điều kiện phân quyền. Không dùng để trả dòng cho người dùng.
   */
  protected filteredQuery(scope: Scope, opts: Pick<ListOptions, 'q' | 'where' | 'searchExclude'>, action: DataAction = 'view'): Promise<SelectQueryBuilder<any, any, object>> {
    return this.filtered(this.db.selectFrom(this.table), scope, { ...opts, page: 1, pageSize: 1 }, action);
  }

  private async filtered(qb: any, scope: Scope, opts: ListOptions, action: DataAction) {
    qb = await this.limit(qb, scope, action);
    if (opts.assignedFactories) qb = this.assigned(qb, scope);
    const like = opts.q?.trim() ? `%${opts.q.trim().replace(/[%_[]/g, (c) => `[${c}]`)}%` : null;
    const columns = this.searchColumns.filter((c) => !opts.searchExclude?.some((x) => x.toLowerCase() === c.toLowerCase()));
    if (like && columns.length) qb = qb.where((eb: any) => eb.or(columns.map((c) => eb(c, 'like', like))));
    if (opts.where) qb = opts.where(qb);
    return qb;
  }

  /**
   * `sort`: "Cột:chiều", hoặc nhiều cặp cách nhau dấu phẩy ("BranchCode:asc,LineCode:asc"). Cột ngoài danh sách trắng bị
   * bỏ; không còn cột nào thì theo Id. Luôn thêm Id cuối cùng để thứ tự ổn định khi phân trang.
   */
  private ordered(qb: any, opts: Pick<ListOptions, 'sort' | 'select'>) {
    const parts = (opts.sort ?? this.defaultSort).split(',').slice(0, 6).map((p) => p.split(':'));
    const valid = parts.filter(([field]) => this.sortable.includes(field)).map(([field, dir]) => [field, dir === 'asc' ? 'asc' : 'desc'] as const);
    const order = valid.length ? valid : ([['Id', parts[0]?.[1] === 'asc' ? 'asc' : 'desc']] as const);
    let out = qb.selectAll(this.table);
    if (opts.select) out = out.select(opts.select);
    const seen = new Set<string>();
    for (const [field, dir] of order) {
      if (seen.has(field)) continue;
      seen.add(field);
      out = out.orderBy(`${this.table}.${field}`, dir);
    }
    if (!seen.has('Id')) out = out.orderBy(`${this.table}.Id`, 'desc');
    return out;
  }

  /** Dòng của nhà máy khác, hoặc ngoài phạm vi của hành động, trả 404 như không tồn tại. */
  async getById(scope: Scope, id: number, action: DataAction = 'view', db: Kysely<any> = this.db, opts: GetOptions = {}): Promise<R> {
    let qb = await this.limit(db.selectFrom(this.table).selectAll().where('Id', '=', id), scope, action);
    if (opts.assignedFactories) qb = this.assigned(qb, scope);
    const row = await qb.executeTakeFirst();
    if (!row) throw Errors.notFound();
    return row as R;
  }

  /**
   * Khóa một dòng (trong phạm vi của hành động) đến hết transaction, để hai người thao tác cùng lúc phải lần lượt
   * (ví dụ cùng lập kế hoạch cho một đơn hàng, cùng lưu dàn chuyền). Không ghi gì (UPDLOCK): người chỉ đọc vẫn đọc
   * được dòng đang khóa, trigger hay Change Tracking sau này không coi lần khóa là một lần sửa (review 5.1 lượt 2 N7).
   * Dòng ngoài phạm vi của hành động: 404 (transaction rollback, nhả khóa).
   */
  async lock(scope: Scope, id: number, action: DataAction, db: Kysely<any>): Promise<void> {
    await this.lockBranchRow(scope, id, db);
    await this.getById(scope, id, action, db);
  }

  /**
   * Khóa một dòng của nhà máy, không xét phạm vi L3: chỉ để xếp hàng khi kiểm ràng buộc trên cả nhà máy (ví dụ sửa
   * số lượng kế hoạch khóa đơn hàng gốc mà người sửa không cần quyền xem đơn hàng). Không trả dữ liệu.
   * Câu khóa chỉ có một tham chiếu bảng mang UPDLOCK: không giữ khóa S trong lúc chờ khóa U, tránh deadlock khi
   * transaction đang giữ khóa nâng lên khóa ghi (review 5.1 lượt 3 P3).
   * Id phải lấy từ dữ liệu máy chủ đã kiểm phạm vi (không nhận thẳng từ client): hàm không xét L3 nên trả 404 hay không
   * cũng là một cách dò dòng tồn tại. Khóa chỉ dùng cho đường ghi nên A00 bị từ chối ngay (review 5.1 lượt 4 L1, L2).
   */
  async lockBranchRow(scope: Scope, id: number, db: Kysely<any>): Promise<void> {
    if (!db.isTransaction) throw new Error('lock() chỉ dùng trong transaction');
    await this.assertWritable(scope);
    const byBranch = (await this.info()).scope === 'BRANCH' && !scope.isAggregate;
    const res = byBranch
      ? await sql<{ Id: number }>`SELECT Id FROM ${sql.table(this.table)} WITH (UPDLOCK, ROWLOCK) WHERE Id = ${id} AND BranchCode = ${scope.branchCode}`.execute(db)
      : await sql<{ Id: number }>`SELECT Id FROM ${sql.table(this.table)} WITH (UPDLOCK, ROWLOCK) WHERE Id = ${id}`.execute(db);
    if (res.rows.length === 0) throw Errors.notFound();
  }

  /**
   * Khóa nhiều dòng (trong phạm vi của hành động) đến hết transaction, cho lần ghi nhiều dòng một lúc (lưu cả bảng).
   * Id do client gửi nên lọc theo phạm vi trước rồi mới khóa (không đặt khóa lên dòng ngoài phạm vi), khóa một câu mỗi
   * lô theo thứ tự khóa chính, rồi kiểm lại phạm vi trên dòng đã khóa. Hai lần gọi hàm này chồng nhau thì xếp hàng; đường
   * ghi khác khóa theo thứ tự khác (ví dụ chép lại theo nguồn) vẫn có thể deadlock với nó: SQL Server hủy một bên (1205),
   * bên gọi trả 409 để người dùng lưu lại.
   * Trả các Id không khóa được (không có, nhà máy khác, ngoài phạm vi), để bên gọi báo lỗi và không ghi gì.
   */
  async lockMany(scope: Scope, ids: number[], action: DataAction, db: Kysely<any>): Promise<number[]> {
    if (!db.isTransaction) throw new Error('lockMany() chỉ dùng trong transaction');
    await this.assertWritable(scope);
    const wanted = [...new Set(ids)].sort((a, b) => a - b);
    const inScope = async (list: number[]) => {
      const found = new Set<number>();
      for (let i = 0; i < list.length; i += BATCH) {
        const rows = (await (await this.scopedIds(scope, action, db)).where('Id', 'in', list.slice(i, i + BATCH)).execute()) as { Id: number }[];
        for (const r of rows) found.add(r.Id);
      }
      return found;
    };
    const visible = await inScope(wanted);
    const allowed = wanted.filter((id) => visible.has(id));
    const byBranch = (await this.info()).scope === 'BRANCH' && !scope.isAggregate;
    const locked: number[] = [];
    for (let i = 0; i < allowed.length; i += BATCH) {
      const chunk = sql.join(allowed.slice(i, i + BATCH));
      const res = byBranch
        ? await sql<{ Id: number }>`SELECT Id FROM ${sql.table(this.table)} WITH (UPDLOCK, ROWLOCK) WHERE Id IN (${chunk}) AND BranchCode = ${scope.branchCode}`.execute(db)
        : await sql<{ Id: number }>`SELECT Id FROM ${sql.table(this.table)} WITH (UPDLOCK, ROWLOCK) WHERE Id IN (${chunk})`.execute(db);
      for (const r of res.rows) locked.push(r.Id);
    }
    // Dòng đổi phạm vi (ví dụ đổi chuyền) giữa lúc kiểm và lúc khóa: kiểm lại trên dòng đã khóa
    const still = await inScope(locked);
    return wanted.filter((id) => !still.has(id));
  }

  async create(scope: Scope, values: Record<string, unknown>, db: Kysely<any> = this.db): Promise<R> {
    await this.assertWritable(scope);
    const branch = (await this.info()).scope === 'BRANCH' || this.originBranch ? { BranchCode: scope.branchCode } : {};
    const row = { ...withoutSystemColumns(values), ...branch, CreatedBy: scope.userId };
    await this.assertRowInScope(scope, 'create', row);
    const inserted = await db.insertInto(this.table).values(row).output('inserted.Id').executeTakeFirstOrThrow();
    return this.getById(scope, (inserted as { Id: number }).Id, 'create', db);
  }

  /**
   * Tạo dòng có số chứng từ dạng PREFIX-<nhà máy>-<Id 6 chữ số>. Số lấy theo Id nên không phải đọc dữ liệu
   * của người khác (người chỉ thấy bản ghi của mình vẫn không sinh trùng số).
   */
  async createNumbered(scope: Scope, values: Record<string, unknown>, column: string, prefix: string, db: Kysely<any> = this.db): Promise<R> {
    // Số theo ĐVCS của phiên và câu cập nhật lọc BranchCode: tài nguyên dùng chung không ghi ĐVCS nguồn thì không dùng được
    if ((await this.info()).scope !== 'BRANCH' && !this.originBranch) throw new Error(`createNumbered chỉ dùng cho tài nguyên có BranchCode (${this.resource})`);
    if (!db.isTransaction) return inTransaction(this.db, (trx) => this.createNumbered(scope, values, column, prefix, trx));
    const temp = `~${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const row = await this.create(scope, { ...values, [column]: temp }, db);
    await db
      .updateTable(this.table)
      .set({ [column]: `${prefix}-${scope.branchCode}-${String(row.Id).padStart(6, '0')}` })
      .where('Id', '=', row.Id)
      .where('BranchCode', '=', scope.branchCode)
      .execute();
    return this.getById(scope, row.Id, 'create', db);
  }

  async update(scope: Scope, id: number, values: Record<string, unknown>, db: Kysely<any> = this.db): Promise<R> {
    await this.assertWritable(scope);
    // Không bao giờ cho đổi nhà máy, Id hay cột hệ thống qua đường cập nhật.
    const safe = withoutSystemColumns(values);
    const before = await this.getById(scope, id, 'update', db);
    // Sửa cột phạm vi (ví dụ chuyển sang chuyền khác) thì giá trị mới cũng phải nằm trong phạm vi được sửa
    await this.assertRowInScope(scope, 'update', mergeRow(before, safe));
    const qb = await this.limit(
      db.updateTable(this.table).set({ ...safe, ModifiedAt: new Date(), ModifiedBy: scope.userId }).where('Id', '=', id),
      scope,
      'update',
    );
    const res = await qb.executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) throw Errors.notFound();
    return this.getById(scope, id, 'update', db);
  }

  async remove(scope: Scope, id: number, db: Kysely<any> = this.db): Promise<void> {
    await this.assertWritable(scope);
    const qb = await this.limit(db.deleteFrom(this.table).where('Id', '=', id), scope, 'delete');
    const res = await qb.executeTakeFirst();
    if (Number(res.numDeletedRows) === 0) throw Errors.notFound();
  }
}

/**
 * Bảng con theo nhà máy (dòng màu cỡ của PO, dòng dàn chuyền...). Không có quyền riêng: dòng con nằm trong phạm vi
 * khi thỏa một phép gán của hành động, xét chung điều kiện của dòng cha và của chính dòng con trong phép gán đó
 * (ví dụ: dòng dàn chuyền thuộc kế hoạch được xem VÀ nằm ở chuyền được giao). Lọc ĐVCS theo đúng cách của cha: cha
 * theo ĐVCS thì kèm BranchCode của phiên; cha dùng chung (đơn hàng, PO, ADR 0013) thì không lọc. BranchCode của dòng mới
 * chép từ dòng cha (khóa ngoại ghép ở DB bảo đảm con cùng ĐVCS với cha; cha theo ĐVCS thì đó là ĐVCS của phiên). Khóa tới
 * cha và BranchCode do repository đặt, không lấy từ client.
 */
export abstract class ChildRepository<R extends { Id: number; BranchCode: string }> implements ScopedParent {
  protected abstract readonly table: string;
  /** Cột trỏ tới Id của bảng cha. */
  protected abstract readonly parentKey: string;
  protected readonly orderBy: string[] = ['SortOrder', 'Id'];
  /** Chiều phạm vi áp thẳng lên bảng con: chiều → cột (ví dụ LINE → LineCode của dòng dàn chuyền). */
  protected readonly scopeColumns: Record<string, string> = {};

  constructor(
    protected readonly db: Kysely<any>,
    protected readonly parent: ScopedParent,
  ) {}

  grantsFor(scope: Scope, action: DataAction): Grant[] {
    return this.parent.grantsFor(scope, action);
  }

  byBranch(scope: Scope): Promise<boolean> {
    return this.parent.byBranch(scope);
  }

  private ownConds(g: Grant) {
    return g.conditions.filter((c) => c.dim in this.scopeColumns).map((c) => ({ c, column: this.scopeColumns[c.dim] }));
  }

  async idsForGrant(scope: Scope, grant: Grant, db: Kysely<any> = this.db) {
    let qb = db.selectFrom(this.table).select('Id');
    if (await this.byBranch(scope)) qb = qb.where('BranchCode', '=', scope.branchCode);
    qb = qb.where(this.parentKey, 'in', await this.parent.idsForGrant(scope, grant, db));
    const conds = this.ownConds(grant);
    if (conds.length) qb = qb.where((eb) => eb.and(conds.map(({ c, column }) => conditionExpr(eb, c, column, scope))));
    return qb;
  }

  /** Dòng con thỏa ít nhất một phép gán của hành động. Không có phép gán nào thì không thấy gì. */
  private async base(scope: Scope, action: DataAction, db: Kysely<any>, qb: any) {
    const byBranch = await this.byBranch(scope);
    if (byBranch) qb = qb.where('BranchCode', '=', scope.branchCode);
    // Cha dùng chung có ĐVCS nguồn: ghi dòng con chỉ khi cha ghi được (cùng ĐVCS với phiên hoặc ĐVCS đang dùng cha), như sửa chính dòng cha
    else if (WRITE_ACTIONS.has(action) && !scope.isAggregate) qb = qb.where(this.parentKey, 'in', await this.parent.scopedIds(scope, action, db));
    const grants = this.grantsFor(scope, action);
    if (grants.length === 0) return qb.where(FALSE);
    const subs = await Promise.all([...new Set(grants)].map((g) => this.idsForGrant(scope, g, db)));
    return qb.where((eb: ExpressionBuilder<any, any>) => eb.or(subs.map((s) => eb('Id', 'in', s))));
  }

  /** Dòng con mới (hoặc sau khi sửa) phải thỏa điều kiện của chính nó trong một phép gán mà dòng cha cũng thỏa. */
  private async assertRowInScope(scope: Scope, action: DataAction, parentId: number, row: Record<string, unknown>, db: Kysely<any>) {
    if (Object.keys(this.scopeColumns).length === 0) return;
    for (const g of this.grantsFor(scope, action)) {
      if (!rowSatisfies(row, this.ownConds(g), scope)) continue;
      const hit = await (await this.parent.idsForGrant(scope, g, db)).where('Id', '=', parentId).executeTakeFirst();
      if (hit) return;
    }
    throw Errors.scopeDenied();
  }

  async scopedIds(scope: Scope, action: DataAction, db: Kysely<any> = this.db) {
    return this.base(scope, action, db, db.selectFrom(this.table).select('Id'));
  }

  /**
   * Khóa (UPDLOCK) mọi dòng con của một dòng cha trong nhà máy đến hết transaction. Gọi ngay sau khi khóa dòng cha và
   * trước khi chạm bảng cháu, để mọi đường ghi khóa theo một thứ tự cha → con → cháu (review 5.1 lượt 3 P4).
   */
  async lockByParent(scope: Scope, parentId: number, db: Kysely<any>): Promise<void> {
    if (!db.isTransaction) throw new Error('lock() chỉ dùng trong transaction');
    await this.assertWritable(scope);
    const table = sql.table(this.table);
    const parent = sql.ref(this.parentKey);
    await ((await this.byBranch(scope))
      ? sql`SELECT Id FROM ${table} WITH (UPDLOCK, ROWLOCK) WHERE ${parent} = ${parentId} AND BranchCode = ${scope.branchCode}`
      : sql`SELECT Id FROM ${table} WITH (UPDLOCK, ROWLOCK) WHERE ${parent} = ${parentId}`
    ).execute(db);
  }

  /** Chỉ lọc ĐVCS, bỏ qua phạm vi L3 (như BaseRepository.branchOnly): cho số liệu kiểm ràng buộc, không trả dòng. */
  protected async branchOnly<Q extends { where: (...a: any[]) => Q }>(qb: Q, scope: Scope): Promise<Q> {
    return (await this.byBranch(scope)) ? qb.where('BranchCode', '=', scope.branchCode) : qb;
  }

  assertWritable(scope: Scope) {
    return this.parent.assertWritable(scope);
  }

  async getById(scope: Scope, id: number, action: DataAction = 'view', db: Kysely<any> = this.db): Promise<R> {
    const row = await (await this.base(scope, action, db, db.selectFrom(this.table).selectAll().where('Id', '=', id))).executeTakeFirst();
    if (!row) throw Errors.notFound();
    return row as R;
  }

  /** Dòng con của các dòng cha (đã lọc phạm vi). Cha nằm ngoài phạm vi thì không có dòng nào. */
  async listByParents(scope: Scope, parentIds: number[], action: DataAction = 'view', db: Kysely<any> = this.db): Promise<R[]> {
    if (parentIds.length === 0) return [];
    // Chia lô: SQL Server giới hạn 2.100 tham số mỗi câu (xuất file vài nghìn dòng cha)
    const out: R[] = [];
    for (let i = 0; i < parentIds.length; i += 1000) {
      let qb = await this.base(scope, action, db, db.selectFrom(this.table).selectAll().where(this.parentKey, 'in', parentIds.slice(i, i + 1000)));
      for (const c of this.orderBy) qb = qb.orderBy(c);
      out.push(...((await qb.execute()) as R[]));
    }
    return out;
  }

  /** Dòng con của một dòng cha; cha không thấy được thì 404. */
  async listByParent(scope: Scope, parentId: number, action: DataAction = 'view', db: Kysely<any> = this.db): Promise<R[]> {
    await this.parent.getById(scope, parentId, action, db);
    return this.listByParents(scope, [parentId], action, db);
  }

  private values(scope: Scope, parentId: number, r: Record<string, unknown>, branchCode: string) {
    return { ...withoutSystemColumns(r, [this.parentKey]), [this.parentKey]: parentId, BranchCode: branchCode, CreatedBy: scope.userId };
  }

  /** BranchCode cho dòng con mới: của phiên khi cha theo ĐVCS, của dòng cha (đã đọc trong phạm vi) khi cha dùng chung */
  private async branchFor(scope: Scope, parentRow: unknown): Promise<string> {
    if (await this.byBranch(scope)) return scope.branchCode;
    const code = valueOf(parentRow as Record<string, unknown>, 'BranchCode');
    if (typeof code !== 'string' || !code) throw new Error(`Dòng cha của ${this.table} không có BranchCode`);
    return code;
  }

  async insert(scope: Scope, parentId: number, rows: Record<string, unknown>[], db: Kysely<any> = this.db): Promise<void> {
    if (rows.length === 0) return;
    await this.assertWritable(scope);
    const branch = await this.branchFor(scope, await this.parent.getById(scope, parentId, 'update', db));
    const values = rows.map((r) => this.values(scope, parentId, r, branch));
    for (const v of values) await this.assertRowInScope(scope, 'update', parentId, v, db);
    // Chia lô: SQL Server giới hạn 2100 tham số mỗi câu
    const per = insertBatch(values);
    for (let i = 0; i < values.length; i += per) await db.insertInto(this.table).values(values.slice(i, i + per)).execute();
  }

  /** Thêm một dòng con và trả Id (khi cần Id để tạo tiếp dòng cháu). */
  async insertOne(scope: Scope, parentId: number, row: Record<string, unknown>, db: Kysely<any> = this.db): Promise<number> {
    await this.assertWritable(scope);
    const branch = await this.branchFor(scope, await this.parent.getById(scope, parentId, 'update', db));
    const value = this.values(scope, parentId, row, branch);
    await this.assertRowInScope(scope, 'update', parentId, value, db);
    const res = await db.insertInto(this.table).values(value).output('inserted.Id').executeTakeFirstOrThrow();
    return (res as { Id: number }).Id;
  }

  async updateRow(scope: Scope, id: number, values: Record<string, unknown>, db: Kysely<any> = this.db): Promise<void> {
    await this.assertWritable(scope);
    const safe = withoutSystemColumns(values, [this.parentKey]);
    if (Object.keys(this.scopeColumns).length) {
      const before = (await this.getById(scope, id, 'update', db)) as Record<string, unknown>;
      await this.assertRowInScope(scope, 'update', Number(valueOf(before, this.parentKey)), mergeRow(before, safe), db);
    }
    const qb = await this.base(scope, 'update', db, db.updateTable(this.table).set({ ...safe, ModifiedAt: new Date(), ModifiedBy: scope.userId }).where('Id', '=', id));
    const res = await qb.executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) throw Errors.notFound();
  }

  /**
   * Thêm dòng con cho nhiều dòng cha một lần (lưu cả bảng): kiểm mọi dòng cha theo lô (phạm vi sửa), rồi INSERT theo lô.
   * Có dòng cha ngoài phạm vi thì 404, chưa thêm gì. Chỉ dùng trong transaction: lỗi giữa chừng thì bỏ cả lần ghi.
   */
  async insertMany(scope: Scope, rows: { parentId: number; values: Record<string, unknown> }[], db: Kysely<any>): Promise<void> {
    if (!db.isTransaction) throw new Error('insertMany() chỉ dùng trong transaction');
    if (rows.length === 0) return;
    await this.assertWritable(scope);
    // Mỗi dòng cha một BranchCode thì phải đọc từng cha: chưa có màn nào cần với bảng cha dùng chung
    if (!(await this.byBranch(scope))) throw new Error(`insertMany() chỉ dùng cho bảng con theo ĐVCS (${this.table})`);
    const parents = [...new Set(rows.map((r) => r.parentId))];
    let found = 0;
    for (let i = 0; i < parents.length; i += BATCH) {
      found += ((await (await this.parent.scopedIds(scope, 'update', db)).where('Id', 'in', parents.slice(i, i + BATCH)).execute()) as unknown[]).length;
    }
    if (found !== parents.length) throw Errors.notFound();
    const values = rows.map((r) => this.values(scope, r.parentId, r.values, scope.branchCode));
    for (const [i, v] of values.entries()) await this.assertRowInScope(scope, 'update', rows[i].parentId, v, db);
    const per = insertBatch(values);
    for (let i = 0; i < values.length; i += per) await db.insertInto(this.table).values(values.slice(i, i + per)).execute();
  }

  /**
   * Sửa cùng giá trị cho nhiều dòng con, một câu mỗi lô (lưu cả bảng). Phạm vi theo dòng cha như updateRow; bảng con có
   * cột phạm vi riêng thì sửa từng dòng để kiểm giá trị mới. Có dòng không sửa được thì 404. Chỉ dùng trong transaction:
   * lô đầu đã ghi rồi mới phát hiện thiếu thì phải bỏ được cả lần ghi.
   */
  async updateMany(scope: Scope, ids: number[], values: Record<string, unknown>, db: Kysely<any>): Promise<number> {
    if (!db.isTransaction) throw new Error('updateMany() chỉ dùng trong transaction');
    const unique = [...new Set(ids)];
    if (unique.length === 0) return 0;
    if (Object.keys(this.scopeColumns).length) {
      for (const id of unique) await this.updateRow(scope, id, values, db);
      return unique.length;
    }
    await this.assertWritable(scope);
    const safe = withoutSystemColumns(values, [this.parentKey]);
    let updated = 0;
    for (let i = 0; i < unique.length; i += BATCH) {
      const qb = await this.base(scope, 'update', db, db.updateTable(this.table).set({ ...safe, ModifiedAt: new Date(), ModifiedBy: scope.userId }).where('Id', 'in', unique.slice(i, i + BATCH)));
      updated += Number((await qb.executeTakeFirst()).numUpdatedRows);
    }
    if (updated !== unique.length) throw Errors.notFound();
    return updated;
  }

  /**
   * Xóa nhiều dòng con theo Id một lần (lưu cả bảng), phạm vi sửa theo dòng cha như removeWhere. Có dòng không xóa được
   * thì 404. Chỉ dùng trong transaction, như updateMany.
   */
  async removeMany(scope: Scope, ids: number[], db: Kysely<any>): Promise<number> {
    if (!db.isTransaction) throw new Error('removeMany() chỉ dùng trong transaction');
    const unique = [...new Set(ids)];
    if (unique.length === 0) return 0;
    await this.assertWritable(scope);
    let deleted = 0;
    for (let i = 0; i < unique.length; i += BATCH) {
      const qb = await this.base(scope, 'update', db, db.deleteFrom(this.table).where('Id', 'in', unique.slice(i, i + BATCH)));
      deleted += Number((await qb.executeTakeFirst()).numDeletedRows);
    }
    if (deleted !== unique.length) throw Errors.notFound();
    return deleted;
  }

  /**
   * Xóa các dòng con (theo Id, hoặc mọi dòng của một cha). Cha phải nằm trong phạm vi của `action`:
   * sửa (bỏ bớt dòng con) hoặc xóa (xóa luôn dòng cha).
   */
  async removeWhere(scope: Scope, by: { parentId: number; ids?: number[] }, db: Kysely<any> = this.db, action: 'update' | 'delete' = 'update'): Promise<number> {
    await this.assertWritable(scope);
    await this.parent.getById(scope, by.parentId, action, db);
    if (by.ids && by.ids.length === 0) return 0;
    let qb = db.deleteFrom(this.table).where(this.parentKey, '=', by.parentId);
    if (by.ids) qb = qb.where('Id', 'in', by.ids);
    const res = await (await this.base(scope, action, db, qb)).executeTakeFirst();
    return Number(res.numDeletedRows);
  }
}
