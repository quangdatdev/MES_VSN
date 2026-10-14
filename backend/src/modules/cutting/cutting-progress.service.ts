import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppException } from '../../common/app.exception';
import type { AuthUser } from '../../platform/auth/auth.types';
import { AuditService } from '../../platform/audit/audit.service';
import { CatalogLookupService } from '../../platform/catalog/catalog-lookup.service';
import { scopeOf, type Scope } from '../../platform/data/base.repository';
import { allOf, assertFilterField, columnFilterWhere, columnValues, readableColumnFilters, type ColumnFilter } from '../../platform/data/column-filter';
import { inTransaction } from '../../platform/data/transaction';
import { ExportService } from '../../platform/export/export.service';
import { FieldPolicyService, MASK } from '../../platform/permission/field-policy.service';
import { ShipmentPlanDeleteGuards } from '../order/shipment-plan-delete-guard';
import { ShipmentPlanFeed } from '../order/shipment-plan-feed.service';
import { CUTTING_DB } from './cutting.db';
import { CUTTING_STATUSES, type CuttingListQuery, type CuttingSaveDto, type CuttingStatus, type CuttingValuesQuery } from './cutting.dto';
import {
  cellKey,
  CUTTING_FILTER,
  CUTTING_SORT,
  CuttingPlanColorSizeRepository,
  CuttingPlanDailyRepository,
  CuttingPlanRepository,
  listColumns,
  type CuttingPlanDailyRow,
  type CuttingPlanListRow,
  type CuttingPlanRow,
} from './cutting.repositories';
import type { CuttingDb } from './cutting.types';

const RESOURCE = 'cutting.progress';
const DEFAULT_SORT = 'createdAt:desc';
const syncLogger = new Logger('CuttingPlanSync');
export const STATUS_LABEL: Record<CuttingStatus, string> = { NOT_STARTED: 'Chưa cắt', CUTTING: 'Đang cắt', DONE: 'Đã cắt đủ', SOURCE_DELETED: 'Kế hoạch đã xóa' };
/** Câu chặn xóa kế hoạch xuất hàng (quyết định 13.4) */
export const DELETE_BLOCKED = 'Kế hoạch đã có số cắt ở Đồng bộ tiến độ cắt. Xóa số cắt của kế hoạch trước khi xóa kế hoạch.';
// +/- và Trạng thái suy ra từ SL kế hoạch và Lũy kế: một trong hai không được xem nguyên giá trị thì hai cột này cũng bị che
const DERIVED = ['diffQty', 'statusCode'];

const EXPORT_COLUMNS = [
  { key: 'planNo', label: 'Số kế hoạch' },
  { key: 'branchName', label: 'Chi nhánh', field: 'branchCode' },
  { key: 'customerName', label: 'Khách hàng' },
  { key: 'styleCode', label: 'Mã hàng' },
  { key: 'productName', label: 'Tên sản phẩm' },
  { key: 'poBuyDate', label: 'PO/Buy date' },
  { key: 'shipDate', label: 'Ngày xuất hàng' },
  { key: 'planQty', label: 'Số lượng KH' },
  { key: 'cutQty', label: 'Lũy kế cắt' },
  { key: 'diffQty', label: '+/-' },
  { key: 'lastCutDate', label: 'Ngày cắt gần nhất' },
  { key: 'statusText', label: 'Trạng thái', field: 'statusCode' },
];

const day = (d: Date | string | null | undefined): string | null => (d == null ? null : d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
/** Hôm nay theo giờ Việt Nam (máy chủ có thể đặt giờ UTC) */
export const todayVN = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const escapeLike = (s: string) => `%${s.replace(/[%_[]/g, (c) => `[${c}]`)}%`;
const invalid = (msg: string, details: unknown = null) => new AppException('VALIDATION_FAILED', msg, 422, details);
const conflict = (msg: string) => new AppException('CONFLICT', msg, 409);
const someOf = (items: string[], what: string) => (items.length > 3 ? `${items.slice(0, 3).join('; ')} và ${items.length - 3} ${what} khác` : items.join('; '));

/** Một dòng danh sách. Khóa trùng mã cột đăng ký của cutting.progress để interceptor áp chính sách cột. */
function presentPlan(r: CuttingPlanListRow, blindDerived: boolean) {
  const cutQty = Number(r.CutQty);
  return {
    id: r.Id,
    planNo: r.PlanNo,
    customerName: r.CustomerName,
    styleCode: r.StyleCode,
    productName: r.ProductName,
    poBuyDate: r.PoBuyDate,
    branchCode: r.BranchCode,
    shipDate: day(r.ShipDate),
    planQty: r.PlanQty,
    cutQty,
    diffQty: blindDerived ? MASK : cutQty - r.PlanQty,
    lastCutDate: day(r.LastCutDate),
    statusCode: blindDerived && r.StatusCode !== 'SOURCE_DELETED' ? MASK : r.StatusCode,
    sourceDeleted: r.SourceDeletedAt !== null,
    createdAt: r.SourceCreatedAt,
  };
}

@Injectable()
export class CuttingProgressService implements OnModuleInit {
  constructor(
    @Inject(CUTTING_DB) private readonly db: CuttingDb,
    private readonly repo: CuttingPlanRepository,
    private readonly cells: CuttingPlanColorSizeRepository,
    private readonly daily: CuttingPlanDailyRepository,
    private readonly feed: ShipmentPlanFeed,
    private readonly deleteGuards: ShipmentPlanDeleteGuards,
    private readonly audit: AuditService,
    private readonly exporter: ExportService,
    private readonly fields: FieldPolicyService,
    private readonly catalogs: CatalogLookupService,
  ) {}

  /** Kế hoạch xuất hàng đã có số cắt thì module Đơn hàng không xóa được (quyết định 13.4) */
  onModuleInit() {
    this.deleteGuards.register(async (plan) => ((await this.repo.sourceHasEntries(plan)) ? DELETE_BLOCKED : null));
  }

  /**
   * Dấu phiên bản kế hoạch xuất hàng đã chép, theo ĐVCS ('*': mọi ĐVCS). Máy chủ chạy một tiến trình nên giữ trong bộ nhớ; khởi động
   * lại thì chép lại một lần. Dấu không đổi thì không chép (đổi trang, lọc, sắp xếp không phải chép lại), như module May.
   */
  private readonly synced = new Map<string, string>();
  /** Lần chép đang chạy theo ĐVCS: request đến cùng lúc chờ lần đang chạy */
  private readonly syncing = new Map<string, Promise<void>>();

  /** Chép kế hoạch xuất hàng của ĐVCS đang làm việc (A00: mọi ĐVCS) trước khi đọc, để màn luôn theo Kế hoạch xuất hàng */
  private sync(user: AuthUser): Promise<void> {
    const scope = scopeOf(user);
    const key = scope.isAggregate ? '*' : scope.branchCode;
    const running = this.syncing.get(key);
    if (running) return running;
    const job = this.syncOnce(scope).finally(() => this.syncing.delete(key));
    this.syncing.set(key, job);
    return job;
  }

  private async syncOnce(scope: Scope) {
    const branch = scope.isAggregate ? null : scope.branchCode;
    const key = branch ?? '*';
    try {
      const version = await this.feed.versionOf(scope);
      // Dấu như lần trước và số bản chép còn nguồn bằng số kế hoạch: không chép. Bản chép bị xóa ngoài luồng chép thì số lệch, chép lại
      if (this.synced.get(key) === version && (await this.repo.copyCount(branch)) === Number(version.split(':')[0])) return;
      const res = await this.repo.syncFromPlans(branch, () => this.feed.plansOf(scope));
      if (!res.skipped) this.synced.set(key, version);
    } catch (e) {
      // Chép lỗi (hết thời gian chờ khóa, mất kết nối MES_Order): vẫn trả bản chép hiện có, lần sau chép lại
      this.synced.delete(key);
      syncLogger.warn(`Chưa chép được kế hoạch xuất hàng (${key}): ${(e as Error)?.message ?? e}`);
    }
  }

  /** SL kế hoạch hoặc Lũy kế bị Ẩn, Che: +/- và Trạng thái suy ra được chúng nên cũng che */
  private async blindDerived(user: AuthUser): Promise<boolean> {
    return (await this.fields.unreadable(user, RESOURCE, ['planQty', 'cutQty'])).size > 0;
  }

  /**
   * Bộ lọc của danh sách: dải lọc (ngày xuất, khách hàng, mã hàng, trạng thái) và lọc theo cột. Cột không được xem nguyên giá trị
   * thì không lọc, không tìm, không sắp xếp theo nó. `except`: cột đang mở popup lọc.
   */
  private async filter(user: AuthUser, q: CuttingListQuery, except?: string) {
    const blind = await this.fields.unreadable(user, RESOURCE, ['planNo', 'customerName', 'styleCode', 'productName', 'poBuyDate', 'shipDate', 'statusCode']);
    const derivedBlind = await this.blindDerived(user);
    const searchExclude = [
      ['PlanNo', 'planNo'],
      ['CustomerName', 'customerName'],
      ['StyleCode', 'styleCode'],
      ['ProductName', 'productName'],
      ['PoBuyDate', 'poBuyDate'],
    ]
      .filter(([, f]) => blind.has(f))
      .map(([c]) => c);
    let columns: ColumnFilter[] = await readableColumnFilters(this.fields, user, RESOURCE, q.cf, CUTTING_FILTER);
    if (derivedBlind) columns = columns.filter((f) => !DERIVED.includes(f.field));
    const status = q.status && CUTTING_STATUSES.includes(q.status) && !blind.has('statusCode') && (!derivedBlind || q.status === 'SOURCE_DELETED') ? q.status : null;
    const business = <Q extends { where: (...a: any[]) => Q }>(qb: Q): Q => {
      if (q.shipFrom && !blind.has('shipDate')) qb = qb.where('ShipDate', '>=', q.shipFrom);
      if (q.shipTo && !blind.has('shipDate')) qb = qb.where('ShipDate', '<=', q.shipTo);
      if (q.customer && !blind.has('customerName')) qb = qb.where('CustomerName', 'like', escapeLike(q.customer));
      if (q.style && !blind.has('styleCode')) qb = qb.where('StyleCode', 'like', escapeLike(q.style));
      return qb;
    };
    const byStatus = status ? columnFilterWhere([{ field: 'statusCode', mode: 'in', values: [status] }], CUTTING_FILTER) : null;
    return { where: allOf(business, byStatus, columnFilterWhere(columns, CUTTING_FILTER, except)), searchExclude, derivedBlind };
  }

  /** "trường:chiều" sang biểu thức của danh sách trắng; trường lạ, bị Ẩn, Che (hoặc suy ra từ cột bị che) thì theo mặc định */
  private async orderOf(user: AuthUser, raw: string | undefined, derivedBlind: boolean) {
    const parse = async (text: string) => {
      const parts = text.split(',').slice(0, 4).map((x) => x.split(':'));
      const blind = await this.fields.unreadable(user, RESOURCE, parts.map(([f]) => f));
      return parts
        .filter(([f]) => Object.prototype.hasOwnProperty.call(CUTTING_SORT, f) && !blind.has(f) && !(derivedBlind && DERIVED.includes(f)))
        .map(([f, d]) => ({ expr: CUTTING_SORT[f], dir: d === 'asc' ? ('asc' as const) : ('desc' as const) }));
    };
    const asked = raw ? await parse(raw) : [];
    return asked.length ? asked : await parse(DEFAULT_SORT);
  }

  async values(user: AuthUser, q: CuttingValuesQuery) {
    const col = await assertFilterField(this.fields, user, RESOURCE, CUTTING_FILTER, q.field);
    const f = await this.filter(user, q, q.field);
    if (f.derivedBlind && DERIVED.includes(q.field)) {
      throw new AppException('FIELD_NOT_READABLE', 'Bạn không được xem nguyên giá trị của cột này nên không lọc theo cột này được.', 403);
    }
    await this.sync(user);
    return columnValues(this.repo, scopeOf(user), col, { q: q.q, searchExclude: f.searchExclude, where: f.where, search: q.search });
  }

  async list(user: AuthUser, q: CuttingListQuery) {
    await this.sync(user);
    const f = await this.filter(user, q);
    const page = await this.repo.list(scopeOf(user), {
      page: q.page,
      pageSize: q.pageSize,
      q: q.q,
      searchExclude: f.searchExclude,
      where: f.where,
      select: listColumns,
      orderBy: await this.orderOf(user, q.sort, f.derivedBlind),
    });
    return { ...page, today: todayVN(), items: (page.items as CuttingPlanListRow[]).map((r) => presentPlan(r, f.derivedBlind)) };
  }

  /**
   * Popup một kế hoạch theo Ngày nhập liệu (quyết định 13.3): mỗi màu cỡ có Kế hoạch, Trong ngày (số của `date`), Lũy kế (mọi ngày),
   * +/- = Lũy kế − Kế hoạch. Đổi ngày chỉ đổi Trong ngày. Màu cỡ đã bị bỏ khỏi kế hoạch mà còn số cắt hiện cuối, Kế hoạch 0, chỉ đọc.
   */
  async get(user: AuthUser, id: number, date?: string) {
    const today = todayVN();
    const on = date ?? today;
    if (on > today) throw invalid('Ngày nhập liệu không được sau hôm nay.');
    await this.sync(user);
    const scope = scopeOf(user);
    const row = await this.repo.getById(scope, id);
    const [cells, entries, canEdit, canDelete, derivedBlind] = await Promise.all([
      this.cells.listByParent(scope, id),
      this.daily.listByParent(scope, id),
      this.repo.allowed(scope, id, 'update'),
      this.repo.allowed(scope, id, 'delete'),
      this.blindDerived(user),
    ]);
    return this.present(row, cells, entries, on, today, { canEdit: canEdit && row.SourceDeletedAt === null, canDelete, derivedBlind });
  }

  private async present(
    row: CuttingPlanRow,
    cells: { ColorName: string; SizeName: string; PlanQty: number }[],
    entries: CuttingPlanDailyRow[],
    on: string,
    today: string,
    opts: { canEdit: boolean; canDelete: boolean; derivedBlind: boolean },
  ) {
    const cut = new Map<string, number>();
    const ofDay = new Map<string, number>();
    const names = new Map<string, { colorName: string; sizeName: string }>();
    for (const e of entries) {
      const k = cellKey(e.ColorName, e.SizeName);
      cut.set(k, (cut.get(k) ?? 0) + e.Qty);
      if (day(e.EntryDate) === on) ofDay.set(k, e.Qty);
      if (!names.has(k)) names.set(k, { colorName: e.ColorName, sizeName: e.SizeName });
    }
    const item = (colorName: string, sizeName: string, planQty: number, inPlan: boolean) => {
      const k = cellKey(colorName, sizeName);
      const cutQty = cut.get(k) ?? 0;
      return { colorName, sizeName, inPlan, planQty, dayQty: ofDay.get(k) ?? null, cutQty, diffQty: opts.derivedBlind ? MASK : cutQty - planQty };
    };
    const planned = new Set(cells.map((c) => cellKey(c.ColorName, c.SizeName)));
    const items = [
      ...cells.map((c) => item(c.ColorName, c.SizeName, c.PlanQty, true)),
      ...[...names.entries()]
        .filter(([k]) => !planned.has(k))
        .sort(([, a], [, b]) => a.colorName.localeCompare(b.colorName) || a.sizeName.localeCompare(b.sizeName))
        .map(([, n]) => item(n.colorName, n.sizeName, 0, false)),
    ];
    const cutQty = [...cut.values()].reduce((n, v) => n + v, 0);
    const status: CuttingStatus = row.SourceDeletedAt !== null ? 'SOURCE_DELETED' : cutQty === 0 ? 'NOT_STARTED' : cutQty < row.PlanQty ? 'CUTTING' : 'DONE';
    const [named] = await this.catalogs.withBranchNames([{ branchCode: row.BranchCode }]);
    return {
      id: row.Id,
      planNo: row.PlanNo,
      branchCode: row.BranchCode,
      branchName: named.branchName,
      customerName: row.CustomerName,
      styleCode: row.StyleCode,
      productName: row.ProductName,
      poBuyDate: row.PoBuyDate,
      shipDate: day(row.ShipDate),
      planQty: row.PlanQty,
      cutQty,
      diffQty: opts.derivedBlind ? MASK : cutQty - row.PlanQty,
      statusCode: opts.derivedBlind && status !== 'SOURCE_DELETED' ? MASK : status,
      sourceDeleted: row.SourceDeletedAt !== null,
      date: on,
      today,
      entryDays: new Set(entries.map((e) => day(e.EntryDate))).size,
      canEdit: opts.canEdit,
      canDelete: opts.canDelete && entries.length > 0,
      items,
    };
  }

  /**
   * Lưu số cắt của một ngày (quyết định 13.3): chỉ các ô gửi lên; số > 0 ghi đè số của ngày đó, 0 hoặc null xóa. Ngày không được sau
   * hôm nay. Màu cỡ phải có trong kế hoạch. Kế hoạch đã mất nguồn thì chỉ đọc. Kế hoạch nguồn phải còn tồn tại (vừa bị xóa ở Kế hoạch
   * xuất hàng mà chưa chép lại thì 409, quyết định 13.4).
   */
  async save(user: AuthUser, id: number, dto: CuttingSaveDto) {
    const scope = scopeOf(user);
    const today = todayVN();
    if (dto.date > today) throw invalid('Ngày nhập liệu không được sau hôm nay.');
    const keys = dto.items.map((i) => cellKey(i.colorName, i.sizeName));
    if (new Set(keys).size !== keys.length) throw invalid('Một màu cỡ chỉ được gửi một lần.');
    await this.repo.assertWritable(scope);
    const current = await this.repo.getById(scope, id, 'update');
    if (current.SourceDeletedAt !== null || current.ShipmentPlanId === null) throw conflict('Kế hoạch xuất hàng đã bị xóa: số cắt chỉ xem được, không sửa.');
    if (!(await this.feed.exists({ id: current.ShipmentPlanId, branchCode: current.BranchCode, createdAt: current.SourceCreatedAt }))) {
      throw conflict('Kế hoạch xuất hàng vừa bị xóa nên không lưu được số cắt. Tải lại màn hình.');
    }
    const { before, after } = await inTransaction(this.db, async (trx) => {
      // Khóa kế hoạch: hai người lưu cùng lúc phải lần lượt (cùng một ô cùng ngày thì người sau ghi đè, có nhật ký)
      await this.repo.lock(scope, id, 'update', trx);
      const row = await this.repo.getById(scope, id, 'update', trx);
      if (row.SourceDeletedAt !== null) throw conflict('Kế hoạch xuất hàng đã bị xóa: số cắt chỉ xem được, không sửa.');
      const planned = new Map((await this.cells.listByParent(scope, id, 'update', trx)).map((c) => [cellKey(c.ColorName, c.SizeName), c]));
      const missing = dto.items.filter((i) => !planned.has(cellKey(i.colorName, i.sizeName))).map((i) => `${i.colorName}/${i.sizeName}`);
      if (missing.length) throw invalid(`Màu cỡ không có trong kế hoạch: ${someOf(missing, 'màu cỡ')}.`, { cells: missing });
      const ofDay = new Map(
        (await this.daily.listByParent(scope, id, 'update', trx)).filter((e) => day(e.EntryDate) === dto.date).map((e) => [cellKey(e.ColorName, e.SizeName), e]),
      );
      const drop: number[] = [];
      const add: Record<string, unknown>[] = [];
      const before: { colorName: string; sizeName: string; dayQty: number | null }[] = [];
      const after: typeof before = [];
      for (const i of dto.items) {
        const k = cellKey(i.colorName, i.sizeName);
        const cell = planned.get(k)!;
        const cur = ofDay.get(k);
        const next = i.dayQty ? i.dayQty : null;
        if ((cur?.Qty ?? null) === next) continue;
        before.push({ colorName: cell.ColorName, sizeName: cell.SizeName, dayQty: cur?.Qty ?? null });
        after.push({ colorName: cell.ColorName, sizeName: cell.SizeName, dayQty: next });
        // Tên màu cỡ lưu theo bản chép của kế hoạch, không theo chữ client gửi
        if (next === null) drop.push(cur!.Id);
        else if (cur) await this.daily.updateRow(scope, cur.Id, { Qty: next }, trx);
        else add.push({ ColorName: cell.ColorName, SizeName: cell.SizeName, EntryDate: dto.date, Qty: next });
      }
      await this.daily.removeMany(scope, drop, trx);
      await this.daily.insert(scope, id, add, trx);
      // Kiểm lại nguồn sau khi ghi, trước commit: thu hẹp khe giữa lần xóa kế hoạch xuất hàng (kiểm số cắt trước) và lần lưu này
      // (review 5.14.2–5.14.5 L16). Hai database không có transaction chung nên khe không bằng 0 (quyết định 13.4)
      if (after.length && !(await this.feed.exists({ id: current.ShipmentPlanId!, branchCode: current.BranchCode, createdAt: current.SourceCreatedAt }))) {
        throw conflict('Kế hoạch xuất hàng vừa bị xóa nên không lưu được số cắt. Tải lại màn hình.');
      }
      return { before, after };
    });
    // Nhật ký ở MES_Core (database khác): ghi sau khi commit
    if (after.length) {
      await this.audit.log({
        userId: user.userId,
        username: user.username,
        branchCode: user.branchCode,
        entityType: 'CuttingPlan',
        entityId: id,
        actionCode: 'UPDATE',
        oldValue: await this.fields.redact(RESOURCE, { planNo: current.PlanNo, date: dto.date, cells: before }),
        newValue: await this.fields.redact(RESOURCE, { planNo: current.PlanNo, date: dto.date, cells: after }),
        ip: user.ip,
      });
    }
    return this.get(user, id, dto.date);
  }

  /**
   * Xóa số cắt của một kế hoạch (mọi ngày), để xóa được kế hoạch xuất hàng (quyết định 13.4). Kế hoạch đã mất nguồn thì xóa luôn bản
   * chép (không còn gì để xem). Số cắt xóa trước, rõ ràng: khóa ngoại tới CuttingPlan không xóa theo cha.
   */
  async removeEntries(user: AuthUser, id: number) {
    const scope = scopeOf(user);
    await this.repo.assertWritable(scope);
    const res = await inTransaction(this.db, async (trx) => {
      await this.repo.lock(scope, id, 'delete', trx);
      const row = await this.repo.getById(scope, id, 'delete', trx);
      const entries = await this.daily.listByParent(scope, id, 'delete', trx);
      // Không còn số nào (bấm lại khi lưới chưa tải lại) và kế hoạch còn nguồn: không có gì để xóa, không ghi nhật ký
      if (!entries.length && row.SourceDeletedAt === null) return null;
      await this.daily.removeWhere(scope, { parentId: id }, trx, 'delete');
      const planRemoved = row.SourceDeletedAt !== null;
      if (planRemoved) {
        await this.cells.removeWhere(scope, { parentId: id }, trx, 'delete');
        await this.repo.remove(scope, id, trx);
      }
      return {
        planNo: row.PlanNo,
        removedDays: new Set(entries.map((e) => day(e.EntryDate))).size,
        removedQty: entries.reduce((n, e) => n + e.Qty, 0),
        removedRows: entries.length,
        planRemoved,
      };
    });
    if (!res) return { removedDays: 0, removedRows: 0, planRemoved: false };
    await this.audit.log({
      userId: user.userId,
      username: user.username,
      branchCode: user.branchCode,
      entityType: 'CuttingPlan',
      entityId: id,
      actionCode: 'DELETE_ENTRIES',
      oldValue: await this.fields.redact(RESOURCE, { planNo: res.planNo, days: res.removedDays, cutQty: res.removedQty, rows: res.removedRows }),
      newValue: { planRemoved: res.planRemoved },
      ip: user.ip,
    });
    return { removedDays: res.removedDays, removedRows: res.removedRows, planRemoved: res.planRemoved };
  }

  async export(user: AuthUser, q: CuttingListQuery) {
    await this.sync(user);
    const f = await this.filter(user, q);
    const rows = (await this.repo.listAll(scopeOf(user), {
      q: q.q,
      searchExclude: f.searchExclude,
      where: f.where,
      select: listColumns,
      orderBy: await this.orderOf(user, q.sort, f.derivedBlind),
    })) as CuttingPlanListRow[];
    const presented = await this.catalogs.withBranchNames(rows.map((r) => presentPlan(r, f.derivedBlind)));
    const items = presented.map((o) => ({ ...o, statusText: o.statusCode === MASK ? MASK : STATUS_LABEL[o.statusCode as CuttingStatus] }));
    return this.exporter.csv(user, RESOURCE, EXPORT_COLUMNS, items, `tien-do-cat-${user.branchCode}.csv`);
  }
}
