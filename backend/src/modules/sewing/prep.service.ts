import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/app.exception';
import type { AuthUser } from '../../platform/auth/auth.types';
import { AuditService, type AuditEntry } from '../../platform/audit/audit.service';
import { CatalogLookupService } from '../../platform/catalog/catalog-lookup.service';
import { scopeOf } from '../../platform/data/base.repository';
import { allOf, assertFilterField, columnFilterWhere, columnValues, readableColumnFilters, type FilterSpec } from '../../platform/data/column-filter';
import { inTransaction } from '../../platform/data/transaction';
import { ExportService } from '../../platform/export/export.service';
import { OrgService } from '../../platform/org/org.service';
import { FieldPolicyService } from '../../platform/permission/field-policy.service';
import { ScheduleFeed } from '../order/schedule-feed.service';
import type { PrepDoneBatchDto, PrepListQuery, PrepStatus, PrepUpdateDto, PrepValuesQuery } from './sewing.dto';
import { SEWING_DB } from './sewing.db';
import { PrepStepRepository, SewingPrepRepository, SewingPrepStepRepository, type PrepStepRow, type SewingPrepRow, type SewingPrepStepRow } from './sewing.repositories';
import type { SewingDb } from './sewing.types';

const RESOURCE = 'order.prep';
const syncLogger = new Logger('SewingPrepSync');
// Ngày tạo của dòng là lúc tạo dòng dàn chuyền gốc (bản chép ở đây được tạo lại mỗi khi chép)
const SORT: Record<string, string> = { startDate: 'StartDate', styleCode: 'StyleCode', lineCode: 'LineCode', customerName: 'CustomerName', branchCode: 'BranchCode', createdAt: 'SourceCreatedAt' };
// Như ảnh mẫu (người dùng chốt 10/10/2026, task 5.5.7): các mã của cùng một tổ nằm liền nhau
const DEFAULT_SORT = 'branchCode:asc,lineCode:asc,styleCode:asc,startDate:asc';
/** Số ô TH tối đa mỗi lần lưu trên bảng */
const MAX_DONE_CELLS = 5000;
/** Cột lọc được theo giá trị. Trạng thái và các bước tính theo ngày hôm nay nên lọc bằng ô Trạng thái ở dải lọc. */
const FILTER: FilterSpec = {
  branchCode: { expr: 'BranchCode', kind: 'text' },
  lineCode: { expr: 'LineCode', kind: 'text' },
  styleCode: { expr: 'StyleCode', kind: 'text' },
  styleType: { expr: 'StyleType', kind: 'text' },
  confirmedQty: { expr: 'ConfirmedQty', kind: 'number' },
  priorityFactor: { expr: 'PriorityFactor', kind: 'number' },
  startDate: { expr: 'StartDate', kind: 'date' },
  createdAt: { expr: 'SourceCreatedAt', kind: 'datetime' },
};

export type StepState = 'DONE' | 'DONE_LATE' | 'OVERDUE' | 'PENDING';

const day = (d: Date | string | null | undefined): string | null => (d == null ? null : d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Thứ Hai và Chủ nhật của tuần chứa ngày `iso`. */
export const weekOf = (iso: string) => {
  const back = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  const from = addDays(iso, -back);
  return { from, to: addDays(from, 6) };
};
/** Hôm nay theo giờ Việt Nam (máy chủ có thể đặt giờ UTC). */
export const todayVN = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const escapeLike = (s: string) => `%${s.replace(/[%_[]/g, (c) => `[${c}]`)}%`;
const invalid = (msg: string) => new AppException('VALIDATION_FAILED', msg, 422);
const groupBy = <T, K>(items: T[], key: (t: T) => K) => {
  const m = new Map<K, T[]>();
  for (const t of items) m.set(key(t), [...(m.get(key(t)) ?? []), t]);
  return m;
};

/**
 * Một bước của một dòng. KH = Ngày vào chuyền - số ngày KH (chỉnh riêng, không thì theo danh mục), tính theo ngày lịch.
 * Trạng thái: xong đúng hạn (TH ≤ KH), xong trễ (TH > KH), trễ (chưa có TH, đã qua KH), chưa đến hạn.
 */
export function stepValue(startDate: string, step: Pick<PrepStepRow, 'PlanDays'>, saved: Pick<SewingPrepStepRow, 'PlanDays' | 'DoneDate'> | undefined, today: string) {
  const planDays = saved?.PlanDays ?? step.PlanDays;
  const planDate = addDays(startDate, -planDays);
  const doneDate = day(saved?.DoneDate);
  const state: StepState = doneDate ? (doneDate <= planDate ? 'DONE' : 'DONE_LATE') : today > planDate ? 'OVERDUE' : 'PENDING';
  return { planDays, custom: saved?.PlanDays != null, planDate, doneDate, state };
}

/**
 * Trạng thái vào chuyền của dòng (người dùng chốt 10/10/2026), chỉ xét bước đang dùng:
 * - Chưa đến ngày V/C: ngày vào chuyền sau hôm nay, nhập đủ TH hay chưa cũng vậy;
 * - Đủ điều kiện V/C: đã đến ngày, mọi bước có TH;
 * - Chưa đủ đk V/C: đã đến ngày, còn bước chưa có TH.
 */
export function prepStatus(startDate: string, states: StepState[], today: string): PrepStatus {
  if (startDate > today) return 'NOT_DUE';
  return states.every((s) => s === 'DONE' || s === 'DONE_LATE') ? 'READY' : 'NOT_READY';
}

const presentStep = (s: PrepStepRow) => ({
  id: s.Id,
  code: s.Code,
  name: s.Name,
  description: s.Description,
  planDays: s.PlanDays,
  performer: s.Performer,
  dataSource: s.DataSource,
  sortOrder: s.SortOrder,
  isActive: !!s.IsActive,
});

const EXPORT_FIXED = [
  { key: 'branchName', label: 'Chi nhánh', field: 'branchCode' },
  { key: 'lineCode', label: 'Tổ SX' },
  { key: 'styleCode', label: 'Mã hàng' },
  { key: 'styleType', label: 'Loại mã' },
  { key: 'confirmedQty', label: 'Số lượng chốt UD' },
  { key: 'priorityFactor', label: 'HS Ưu đãi VC' },
  { key: 'startDate', label: 'Ngày vào chuyền' },
  { key: 'statusCode', label: 'Trạng thái' },
];
export const STATUS_LABEL: Record<PrepStatus, string> = { NOT_DUE: 'Chưa đến ngày V/C', NOT_READY: 'Chưa đủ đk V/C', READY: 'Đủ điều kiện V/C' };

@Injectable()
export class PrepService {
  constructor(
    @Inject(SEWING_DB) private readonly db: SewingDb,
    private readonly repo: SewingPrepRepository,
    private readonly stepValues: SewingPrepStepRepository,
    private readonly steps: PrepStepRepository,
    private readonly feed: ScheduleFeed,
    private readonly audit: AuditService,
    private readonly exporter: ExportService,
    private readonly fields: FieldPolicyService,
    private readonly catalogs: CatalogLookupService,
    private readonly org: OrgService,
  ) {}

  /**
   * Dấu phiên bản dàn chuyền đã chép, theo nhà máy ('*': mọi nhà máy). Máy chủ chạy một tiến trình nên giữ trong bộ nhớ;
   * khởi động lại thì chép lại một lần. Dấu không đổi thì không chép (đổi trang, lọc, sắp xếp không phải chép lại).
   */
  private readonly synced = new Map<string, string>();
  /**
   * Lần chép đang chạy theo nhà máy: danh sách và số liệu tải song song khi mở màn, request đến sau chờ lần đang chạy thay
   * vì giữ thêm một kết nối chờ khóa rồi đọc lại cả dàn chuyền (review 5.5.8 lượt 2 B).
   */
  private readonly syncing = new Map<string, Promise<void>>();

  /** Chép dàn chuyền của nhà máy đang làm việc (A00: mọi nhà máy) trước khi đọc, để màn luôn theo Xếp chuyền (ADR 0009). */
  private sync(user: AuthUser): Promise<void> {
    const scope = scopeOf(user);
    const key = scope.isAggregate ? '*' : scope.branchCode;
    const running = this.syncing.get(key);
    if (running) return running;
    const job = this.syncOnce(user).finally(() => this.syncing.delete(key));
    this.syncing.set(key, job);
    return job;
  }

  private async syncOnce(user: AuthUser) {
    const scope = scopeOf(user);
    const branch = scope.isAggregate ? null : scope.branchCode;
    const key = branch ?? '*';
    try {
      const version = await this.feed.versionOf(scope);
      // Dấu như lần trước và số dòng bản chép bằng số dòng nguồn: không chép. Bản chép bị xóa ngoài luồng chép (script, khôi phục
      // database) thì số dòng lệch, chép lại
      if (this.synced.get(key) === version && (await this.repo.copyCount(branch)) === Number(version.split(':')[0])) return;
      const res = await this.repo.syncFromSchedule(branch, () => this.feed.linesOf(scope));
      if (!res.skipped) this.synced.set(key, version);
    } catch (e) {
      // Chép lỗi (hết thời gian chờ khóa, mất kết nối MES_Order): vẫn trả bản chép hiện có, lần sau chép lại
      this.synced.delete(key);
      syncLogger.warn(`Chưa chép được dàn chuyền (${key}): ${(e as Error)?.message ?? e}`);
    }
  }

  /**
   * Tên chuyền theo mã, kể cả chuyền đã giải thể. Mã không còn là bộ phận chuyền nào (chuyền cũ trước phase 5.10, bộ phận bỏ tích
   * "Xưởng sản xuất") là chuyền mồ côi: hiện mã kèm "(chuyền cũ)", không lỗi. Tên không phải cột đăng ký nên khi Tổ SX bị Ẩn hoặc
   * Che thì không trả (tên suy ra được mã), như Phân bổ màu cỡ.
   */
  private async lineNames(user: AuthUser): Promise<(code: string) => string | undefined> {
    if ((await this.fields.unreadable(user, RESOURCE, ['lineCode'])).size) return () => undefined;
    const scope = scopeOf(user);
    const names = new Map((await this.org.lines(scope.branchCode, scope.isAggregate, { includeInactive: true })).map((l) => [l.code, l.name]));
    return (code) => names.get(code) ?? `${code} (chuyền cũ)`;
  }

  private async activeSteps() {
    return (await this.steps.all()).filter((s) => s.IsActive);
  }

  private present(r: SewingPrepRow, steps: PrepStepRow[], saved: SewingPrepStepRow[], today: string) {
    const start = day(r.StartDate)!;
    const byStep = new Map(saved.map((v) => [v.PrepStepId, v]));
    const values = steps.map((s) => ({ stepId: s.Id, ...stepValue(start, s, byStep.get(s.Id), today) }));
    return {
      id: r.Id,
      branchCode: r.BranchCode,
      planNo: r.PlanNo,
      customerName: r.CustomerName,
      styleCode: r.StyleCode,
      productName: r.ProductName,
      lineCode: r.LineCode,
      lineQty: r.LineQty,
      startDate: start,
      styleType: r.StyleType,
      confirmedQty: r.ConfirmedQty,
      priorityFactor: r.PriorityFactor == null ? null : Number(r.PriorityFactor),
      createdAt: r.SourceCreatedAt,
      steps: values,
      // Bước đã ngừng dùng chỉ để hiển thị ngày đã nhập, không tính vào trạng thái (như danh sách và bộ lọc)
      statusCode: prepStatus(start, values.filter((_v, i) => steps[i].IsActive).map((v) => v.state), today),
    };
  }

  /**
   * Bộ lọc nghiệp vụ và bộ lọc theo cột. Cột người dùng không được xem nguyên giá trị (Ẩn, Che) thì không lọc, không
   * tìm theo nó. `except`: cột đang mở popup lọc, không lọc theo chính nó.
   */
  private async filter(user: AuthUser, q: PrepListQuery, today: string, except?: string) {
    const blind = await this.fields.unreadable(user, RESOURCE, ['customerName', 'styleCode', 'productName', 'planNo', 'lineCode', 'startDate', 'statusCode', 'styleType', 'steps']);
    const searchExclude = [
      ['CustomerName', 'customerName'],
      ['StyleCode', 'styleCode'],
      ['ProductName', 'productName'],
      ['PlanNo', 'planNo'],
    ]
      .filter(([, f]) => blind.has(f))
      .map(([c]) => c);
    const byStatus = q.status && !blind.has('statusCode') ? this.repo.statusFilter(q.status, today) : null;
    // Tuần: điều kiện "còn bước đến hạn chưa có TH" làm lộ ngày đã nhập, nên người không xem được các bước chỉ lọc theo
    // ngày vào chuyền trong tuần
    const week = q.week && !blind.has('startDate') ? weekOf(q.week) : null;
    const byWeek = week && !blind.has('steps') ? this.repo.weekFilter(week.from, week.to) : null;
    const columns = await readableColumnFilters(this.fields, user, RESOURCE, q.cf, FILTER);
    const business = <Q extends { where: (...a: any[]) => Q }>(qb: Q): Q => {
      if (q.startFrom && !blind.has('startDate')) qb = qb.where('StartDate', '>=', q.startFrom);
      if (q.startTo && !blind.has('startDate')) qb = qb.where('StartDate', '<=', q.startTo);
      if (q.customer && !blind.has('customerName')) qb = qb.where('CustomerName', 'like', escapeLike(q.customer));
      if (q.style && !blind.has('styleCode')) qb = qb.where('StyleCode', 'like', escapeLike(q.style));
      if (q.line && !blind.has('lineCode')) qb = qb.where('LineCode', '=', q.line);
      if (q.branch) qb = qb.where('BranchCode', '=', q.branch);
      if (q.styleType && !blind.has('styleType')) qb = qb.where('StyleType', '=', q.styleType);
      if (week) qb = byWeek ? byWeek(qb) : qb.where('StartDate', '>=', week.from).where('StartDate', '<=', week.to);
      return byStatus ? byStatus(qb) : qb;
    };
    const where = allOf(business, columnFilterWhere(columns, FILTER, except));
    return { where, searchExclude, sort: await this.sortOf(user, q.sort) };
  }

  /**
   * "trường:chiều", một hoặc nhiều cặp cách nhau dấu phẩy, sang cột của bảng. Trường lạ, hoặc bị Ẩn, Che thì bỏ: sắp xếp
   * theo cột không được xem cũng làm lộ giá trị (review 5.1 #2). Không còn trường nào thì theo mặc định.
   */
  private async sortOf(user: AuthUser, raw: string | undefined): Promise<string> {
    const parse = async (text: string) => {
      const parts = text.split(',').slice(0, 6).map((x) => x.split(':'));
      const blind = await this.fields.unreadable(user, RESOURCE, parts.map(([f]) => f));
      return parts.filter(([f]) => Object.prototype.hasOwnProperty.call(SORT, f) && !blind.has(f)).map(([f, d]) => `${SORT[f]}:${d === 'desc' ? 'desc' : 'asc'}`);
    };
    const asked = raw ? await parse(raw) : [];
    const chosen = asked.length ? asked : await parse(DEFAULT_SORT);
    return chosen.length ? chosen.join(',') : 'SourceCreatedAt:desc';
  }

  /** Giá trị của một cột cho popup lọc theo cột, theo phạm vi và các bộ lọc khác đang áp. */
  async values(user: AuthUser, q: PrepValuesQuery) {
    const col = await assertFilterField(this.fields, user, RESOURCE, FILTER, q.field);
    const f = await this.filter(user, q, todayVN(), q.field);
    return columnValues(this.repo, scopeOf(user), col, { q: q.q, searchExclude: f.searchExclude, where: f.where, search: q.search });
  }

  async list(user: AuthUser, q: PrepListQuery) {
    await this.sync(user);
    const scope = scopeOf(user);
    const today = todayVN();
    const [steps, f, lineName] = await Promise.all([this.activeSteps(), this.filter(user, q, today), this.lineNames(user)]);
    const page = await this.repo.list(scope, { page: q.page, pageSize: q.pageSize, q: q.q, searchExclude: f.searchExclude, sort: f.sort, where: f.where });
    const ids = page.items.map((r) => r.Id);
    const [saved, editable] = await Promise.all([this.stepValues.listByParents(scope, ids), this.repo.editableIds(scope, ids)]);
    const byPrep = groupBy(saved, (v) => v.SewingPrepId);
    // Danh mục bước để dưới khóa stepInfo: khóa steps là mã cột (chính sách cột Che sẽ biến nó thành "***").
    // canEdit: dòng nằm trong phạm vi sửa, để lưới khóa sẵn ô của dòng ngoài phạm vi (máy chủ vẫn kiểm khi lưu)
    return {
      ...page,
      today,
      stepInfo: steps.map(presentStep),
      items: page.items.map((r) => ({ ...this.present(r, steps, byPrep.get(r.Id) ?? [], today), lineName: lineName(r.LineCode), canEdit: editable.has(r.Id) })),
    };
  }

  /**
   * Số liệu trên đầu màn (task 5.5.8), đếm theo mã hàng trên đúng bộ lọc của danh sách, trừ ô Trạng thái: đang lọc một
   * trạng thái thì các số khác không về 0. Số nào suy ra từ cột người xem không được xem nguyên giá trị thì null:
   * - Mã hàng bị Ẩn/Che: cả 4 số (đếm mã hàng khác nhau trên vài dòng là biết các dòng có cùng mã không, review 5.5.8 M1);
   * - các bước hoặc Trạng thái bị Ẩn/Che: 3 số sau (suy ra từ ngày đã nhập).
   */
  async summary(user: AuthUser, q: PrepListQuery) {
    const today = todayVN();
    const blind = await this.fields.unreadable(user, RESOURCE, ['styleCode', 'steps', 'statusCode']);
    if (blind.has('styleCode')) return { today, total: null, ready: null, atRisk: null, late: null };
    await this.sync(user);
    const f = await this.filter(user, { ...q, status: undefined }, today);
    const s = await this.repo.summary(scopeOf(user), { q: q.q, searchExclude: f.searchExclude, where: f.where }, today);
    const shown = blind.size === 0;
    return { today, total: s.total, ready: shown ? s.ready : null, atRisk: shown ? s.atRisk : null, late: shown ? s.late : null };
  }

  /** Một dòng cho popup "Hướng dẫn, chỉ dẫn và điều chỉnh số ngày kế hoạch": kèm bước đã ngừng dùng mà dòng còn ngày đã nhập. */
  async get(user: AuthUser, id: number) {
    const scope = scopeOf(user);
    const row = await this.repo.getById(scope, id);
    const saved = await this.stepValues.listByParent(scope, id);
    const used = new Set(saved.map((v) => v.PrepStepId));
    const steps = (await this.steps.all()).filter((s) => s.IsActive || used.has(s.Id));
    const today = todayVN();
    const lineName = await this.lineNames(user);
    return { ...this.present(row, steps, saved, today), lineName: lineName(row.LineCode), stepInfo: steps.map(presentStep), today };
  }

  async update(user: AuthUser, id: number, dto: PrepUpdateDto) {
    const scope = scopeOf(user);
    const all = new Map((await this.steps.all()).map((s) => [s.Id, s]));
    const today = todayVN();
    for (const v of dto.steps ?? []) {
      const step = all.get(v.stepId);
      if (!step) throw invalid(`Bước chuẩn bị ${v.stepId} không có trong danh mục Cấu hình chuẩn bị SX.`);
      if (v.doneDate && v.doneDate > today) throw invalid(`${step.Name}: ngày thực hiện không được sau hôm nay.`);
    }
    if (new Set((dto.steps ?? []).map((v) => v.stepId)).size !== (dto.steps ?? []).length) throw invalid('Một bước chỉ được gửi một lần.');
    const { before, after } = await inTransaction(this.db, async (trx) => {
      await this.repo.lock(scope, id, 'update', trx);
      const before = await this.getIn(user, id, trx);
      const set: Record<string, unknown> = {};
      if (dto.styleType !== undefined) set.StyleType = dto.styleType || null;
      if (dto.confirmedQty !== undefined) set.ConfirmedQty = dto.confirmedQty;
      if (dto.priorityFactor !== undefined) set.PriorityFactor = dto.priorityFactor;
      if (Object.keys(set).length) await this.repo.update(scope, id, set, trx);
      if (dto.steps?.length) {
        const saved = new Map((await this.stepValues.listByParent(scope, id, 'update', trx)).map((v) => [v.PrepStepId, v]));
        const drop: number[] = [];
        const add: Record<string, unknown>[] = [];
        for (const v of dto.steps) {
          const cur = saved.get(v.stepId);
          // Số ngày bằng số mặc định của danh mục thì không lưu là chỉnh riêng: đổi danh mục sau này dòng vẫn theo
          const planDays = v.planDays === undefined ? (cur?.PlanDays ?? null) : v.planDays === all.get(v.stepId)!.PlanDays ? null : v.planDays;
          const doneDate = v.doneDate === undefined ? day(cur?.DoneDate) : v.doneDate || null;
          if (planDays == null && doneDate == null) {
            if (cur) drop.push(cur.Id);
          } else if (cur) {
            await this.stepValues.updateRow(scope, cur.Id, { PlanDays: planDays, DoneDate: doneDate }, trx);
          } else {
            add.push({ PrepStepId: v.stepId, PlanDays: planDays, DoneDate: doneDate });
          }
        }
        await this.stepValues.removeWhere(scope, { parentId: id, ids: drop }, trx);
        await this.stepValues.insert(scope, id, add, trx);
      }
      return { before, after: await this.getIn(user, id, trx) };
    });
    // Như saveDone: nhật ký ở MES_Core, ghi sau khi commit
    await this.audit.log({
      userId: user.userId,
      username: user.username,
      branchCode: user.branchCode,
      entityType: 'SewingPrep',
      entityId: id,
      actionCode: 'UPDATE',
      oldValue: await this.fields.redact(RESOURCE, before),
      newValue: await this.fields.redact(RESOURCE, after),
      ip: user.ip,
    });
    return after;
  }

  /**
   * Lưu các ô TH nhập trên bảng: nhiều dòng một transaction, chỉ đổi ngày TH (giữ số ngày KH chỉnh riêng). Ô mà người
   * khác vừa sửa (ngày trong DB khác `previous` và khác ngày mới gửi) thì không ghi gì cả, báo để tải lại.
   */
  async saveDone(user: AuthUser, dto: PrepDoneBatchDto) {
    const scope = scopeOf(user);
    const all = new Map((await this.steps.all()).map((s) => [s.Id, s]));
    const today = todayVN();
    if (new Set(dto.items.map((i) => i.id)).size !== dto.items.length) throw invalid('Một dòng chỉ được gửi một lần.');
    if (dto.items.reduce((n, i) => n + i.steps.length, 0) > MAX_DONE_CELLS) throw invalid(`Mỗi lần lưu tối đa ${MAX_DONE_CELLS.toLocaleString('vi-VN')} ô.`);
    for (const item of dto.items) {
      if (new Set(item.steps.map((v) => v.stepId)).size !== item.steps.length) throw invalid('Một bước chỉ được gửi một lần.');
      for (const v of item.steps) {
        const step = all.get(v.stepId);
        if (!step) throw invalid(`Bước chuẩn bị ${v.stepId} không có trong danh mục Cấu hình chuẩn bị SX.`);
        if (v.doneDate && v.doneDate > today) throw invalid(`${step.Name}: ngày thực hiện không được sau hôm nay.`);
      }
    }
    const blind = await this.fields.unreadable(user, RESOURCE, ['styleCode', 'lineCode']);
    const ids = dto.items.map((i) => i.id).sort((a, b) => a - b);
    const audits: AuditEntry[] = [];
    const result = await inTransaction(this.db, async (trx) => {
      // Khóa mọi dòng một lần, theo thứ tự Id (lọc phạm vi sửa trước khi khóa). Dòng phải xem được nữa: câu báo xung đột
      // nêu mã hàng. Dòng không còn (dàn chuyền đổi, chép lại) hoặc ngoài phạm vi thì không ghi gì, trả Id để lưới bỏ ô
      // nháp của các dòng đó (đều là Id người dùng gửi, cùng một câu 404 nên không dò được dòng tồn tại)
      const missing = new Set(await this.repo.lockMany(scope, ids, 'update', trx));
      const rows = new Map<number, SewingPrepRow>();
      const locked = ids.filter((id) => !missing.has(id));
      for (let i = 0; i < locked.length; i += 200) {
        const chunk = locked.slice(i, i + 200);
        const page = await this.repo.list(scope, { page: 1, pageSize: chunk.length, where: <Q extends { where: (...a: any[]) => Q }>(qb: Q): Q => qb.where('Id', 'in', chunk) }, 'view', trx);
        for (const r of page.items) rows.set(r.Id, r);
      }
      for (const id of locked) if (!rows.has(id)) missing.add(id);
      if (missing.size) {
        throw new AppException(
          'NOT_FOUND',
          `${missing.size} dòng không còn trong Kế hoạch chuẩn bị SX (dòng dàn chuyền đã bị bỏ hoặc đổi) hoặc ngoài phạm vi sửa của bạn nên chưa lưu gì.`,
          404,
          { ids: [...missing].sort((a, b) => a - b) },
        );
      }
      const saved = groupBy(await this.stepValues.listByParents(scope, ids, 'update', trx), (v) => v.SewingPrepId);
      const label = (id: number) => {
        const r = rows.get(id)!;
        return blind.size ? `dòng ${id}` : `${r.StyleCode} (${r.LineCode})`;
      };
      const conflicts: { id: number; stepId: number; doneDate: string | null; text: string }[] = [];
      const plans: { id: number; changes: { stepId: number; cur?: SewingPrepStepRow; from: string | null; to: string | null }[] }[] = [];
      for (const item of dto.items) {
        const byStep = new Map((saved.get(item.id) ?? []).map((v) => [v.PrepStepId, v]));
        const changes: (typeof plans)[number]['changes'] = [];
        for (const v of item.steps) {
          const cur = byStep.get(v.stepId);
          const from = day(cur?.DoneDate);
          const to = v.doneDate || null;
          if (from === to) continue;
          if (v.previous !== undefined && (v.previous || null) !== from) {
            conflicts.push({ id: item.id, stepId: v.stepId, doneDate: from, text: `${label(item.id)}, ${all.get(v.stepId)!.Name}` });
            continue;
          }
          changes.push({ stepId: v.stepId, cur, from, to });
        }
        if (changes.length) plans.push({ id: item.id, changes });
      }
      if (conflicts.length) {
        const more = conflicts.length > 3 ? ` và ${conflicts.length - 3} ô khác` : '';
        // details: các ô bị sửa kèm ngày hiện có, để lưới thay ô đó bằng ngày mới và giữ các ô khác đang nhập
        throw new AppException(
          'CONFLICT',
          `Ngày TH vừa được người khác sửa: ${conflicts.slice(0, 3).map((c) => c.text).join('; ')}${more}. Xem ngày mới rồi lưu lại.`,
          409,
          { cells: conflicts.map(({ id, stepId, doneDate }) => ({ id, stepId, doneDate })) },
        );
      }
      // Ghi theo lô cho cả bảng: thêm dòng con (ô chưa có), xóa dòng con (bỏ ngày TH), sửa gom theo ngày mới
      const byDate = new Map<string | null, number[]>();
      const drop: number[] = [];
      const add: { parentId: number; values: Record<string, unknown> }[] = [];
      for (const p of plans)
        for (const c of p.changes) {
          // Bước còn số ngày KH chỉnh riêng thì giữ dòng, chỉ bỏ ngày TH
          if (!c.cur) add.push({ parentId: p.id, values: { PrepStepId: c.stepId, PlanDays: null, DoneDate: c.to } });
          else if (c.to == null && c.cur.PlanDays == null) drop.push(c.cur.Id);
          else byDate.set(c.to, [...(byDate.get(c.to) ?? []), c.cur.Id]);
        }
      await this.stepValues.removeMany(scope, drop, trx);
      await this.stepValues.insertMany(scope, add, trx);
      for (const [date, stepRows] of byDate) await this.stepValues.updateMany(scope, stepRows, { DoneDate: date }, trx);
      for (const p of plans) {
        const r = rows.get(p.id)!;
        const snap = (key: 'from' | 'to') => ({
          styleCode: r.StyleCode,
          lineCode: r.LineCode,
          startDate: day(r.StartDate),
          steps: p.changes.map((c) => ({ stepId: c.stepId, step: all.get(c.stepId)!.Name, doneDate: c[key] })),
        });
        audits.push({
          userId: user.userId,
          username: user.username,
          branchCode: user.branchCode,
          entityType: 'SewingPrep',
          entityId: p.id,
          actionCode: 'UPDATE',
          oldValue: await this.fields.redact(RESOURCE, snap('from')),
          newValue: await this.fields.redact(RESOURCE, snap('to')),
          ip: user.ip,
        });
      }
      return { rows: plans.length, cells: plans.reduce((n, p) => n + p.changes.length, 0) };
    });
    // Nhật ký nằm ở MES_Core (database khác): ghi sau khi commit, để lần lưu bị hủy (deadlock, lỗi) không để lại nhật ký sai
    await this.audit.logMany(audits);
    return result;
  }

  /** Đọc lại trong transaction đang giữ khóa (không chiếm thêm kết nối của pool). */
  private async getIn(user: AuthUser, id: number, trx: Parameters<SewingPrepRepository['getById']>[3]) {
    const scope = scopeOf(user);
    const row = await this.repo.getById(scope, id, 'view', trx);
    const saved = await this.stepValues.listByParents(scope, [id], 'view', trx);
    const used = new Set(saved.map((v) => v.PrepStepId));
    const steps = (await this.steps.all(trx)).filter((s) => s.IsActive || used.has(s.Id));
    const today = todayVN();
    return { ...this.present(row, steps, saved, today), stepInfo: steps.map(presentStep), today };
  }

  async export(user: AuthUser, q: PrepListQuery) {
    await this.sync(user);
    const scope = scopeOf(user);
    const today = todayVN();
    const [steps, f] = await Promise.all([this.activeSteps(), this.filter(user, q, today)]);
    const rows = await this.repo.listAll(scope, { q: q.q, searchExclude: f.searchExclude, sort: f.sort, where: f.where });
    const saved = await this.stepValues.listByParents(scope, rows.map((r) => r.Id), 'export');
    const byPrep = groupBy(saved, (v) => v.SewingPrepId);
    // Cột bước gộp thành từng cặp KH, TH trong file; chính sách cột của "Các bước chuẩn bị" áp cho cả nhóm
    const stepsReadable = !(await this.fields.unreadable(user, RESOURCE, ['steps'])).has('steps');
    const stepColumns = stepsReadable ? steps.flatMap((s) => [{ key: `kh${s.Id}`, label: `${s.Name} - KH` }, { key: `th${s.Id}`, label: `${s.Name} - TH` }]) : [];
    const presented = await this.catalogs.withBranchNames(rows.map((r) => this.present(r, steps, byPrep.get(r.Id) ?? [], today)));
    const items = presented.map((o) => {
      const flat: Record<string, unknown> = { ...o, statusCode: STATUS_LABEL[o.statusCode] };
      if (stepsReadable) for (const v of o.steps) Object.assign(flat, { [`kh${v.stepId}`]: v.planDate, [`th${v.stepId}`]: v.doneDate });
      delete flat.steps;
      return flat;
    });
    const columns = [...EXPORT_FIXED, ...stepColumns];
    return this.exporter.csv(user, RESOURCE, columns, items, `ke-hoach-chuan-bi-sx-${user.branchCode}.csv`);
  }
}
