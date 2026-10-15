import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { AppException, Errors } from '../../common/app.exception';
import type { AuthUser } from '../../platform/auth/auth.types';
import { AuditService } from '../../platform/audit/audit.service';
import { CatalogLookupService } from '../../platform/catalog/catalog-lookup.service';
import { addCalendarDays, lineDates, nonWorkingDays, presentCalendar } from '../../platform/catalog/work-calendar';
import { inTransaction } from '../../platform/data/transaction';
import { scopeOf } from '../../platform/data/base.repository';
import { allOf, assertFilterField, columnFilterWhere, columnValues, readableColumnFilters, type FilterSpec } from '../../platform/data/column-filter';
import { ExportService } from '../../platform/export/export.service';
import { OrgService } from '../../platform/org/org.service';
import { FieldPolicyService } from '../../platform/permission/field-policy.service';
import { ORDER_DB } from './order.db';
import { BoardQuery, OrderListQuery, OrderValuesQuery, ScheduleDto } from './order.dto';
import { LineSupplyGuards } from './line-supply-guard';
import { LinePlanAllocationRepository, LinePlanLineRepository, LinePlanRepository, type LinePlanListRow, type PlanLineRow } from './order.repositories';
import type { OrderDb } from './order.types';
import { assignedVisible, businessFilter, conflict, day, invalid, MAX_PRODUCTION_DAYS, num, readableQuery, someOf, sortOf } from './order.util';

const RESOURCE = 'order.lineplan';
const MAX_BOARD_DAYS = 190;
const SORT: Record<string, string> = {
  planNo: 'PlanNo',
  customerName: 'CustomerName',
  styleCode: 'StyleCode',
  planQty: 'PlanQty',
  revenue: 'Revenue',
  shipDate: 'ShipDate',
  syncedAt: 'SyncedAt',
  statusCode: 'StatusCode',
  createdAt: 'CreatedAt',
};
const DEFAULT_SORT = 'createdAt:desc';
const fromLines = (agg: 'sum' | 'start' | 'end') =>
  agg === 'sum'
    ? sql`(SELECT COALESCE(SUM(l.Qty), 0) FROM dbo.ShipmentPlanLine l WHERE l.ShipmentPlanId = ShipmentPlan.Id)`
    : agg === 'start'
      ? sql`(SELECT MIN(l.StartDate) FROM dbo.ShipmentPlanLine l WHERE l.ShipmentPlanId = ShipmentPlan.Id)`
      : sql`(SELECT MAX(l.EndDate) FROM dbo.ShipmentPlanLine l WHERE l.ShipmentPlanId = ShipmentPlan.Id)`;
/**
 * Cột lọc được theo giá trị. Cột tính từ dàn chuyền (SL đã xếp, ngày bắt đầu, kết thúc SX) lọc theo cùng biểu thức như
 * lưới. Không có giá CM, doanh số: cột nhạy cảm, liệt kê giá trị là lộ giá mà không ghi nhật ký đọc.
 */
const FILTER: FilterSpec = {
  planNo: { expr: 'PlanNo', kind: 'text' },
  customerName: { expr: 'CustomerName', kind: 'text' },
  styleCode: { expr: 'StyleCode', kind: 'text' },
  orderType: { expr: 'OrderType', kind: 'text' },
  branchCode: { expr: 'BranchCode', kind: 'text' },
  planQty: { expr: 'PlanQty', kind: 'number' },
  scheduledQty: { expr: fromLines('sum'), kind: 'number' },
  syncedAt: { expr: 'SyncedAt', kind: 'day' },
  startDate: { expr: fromLines('start'), kind: 'date' },
  endDate: { expr: fromLines('end'), kind: 'date' },
  shipDate: { expr: 'ShipDate', kind: 'date' },
  statusCode: { expr: 'StatusCode', kind: 'text' },
  createdAt: { expr: 'CreatedAt', kind: 'datetime' },
};

/** Trường JSON trùng mã cột đăng ký của order.lineplan (giá CM, doanh số là cột nhạy cảm). */
export function presentLinePlan(r: LinePlanListRow | (LinePlanListRow & Record<string, unknown>)) {
  const scheduled = Number(r.ScheduledQty ?? 0);
  return {
    id: r.Id,
    planNo: r.PlanNo,
    customerName: r.CustomerName,
    styleCode: r.StyleCode,
    orderType: r.OrderType,
    branchCode: r.BranchCode,
    poBuyDate: r.PoBuyDate,
    planQty: r.PlanQty,
    scheduledQty: scheduled,
    remainingQty: Math.max(0, r.PlanQty - scheduled),
    cmPrice: num(r.CmPrice),
    revenue: num(r.Revenue),
    syncedAt: day(r.SyncedAt),
    startDate: day(r.StartDate),
    endDate: day(r.EndDate),
    shipDate: day(r.ShipDate),
    statusCode: r.StatusCode,
    lineCount: Number(r.LineCount ?? 0),
    createdAt: r.CreatedAt,
  };
}

const presentLine = (l: PlanLineRow) => ({
  id: l.Id,
  lineCode: l.LineCode,
  qty: l.Qty,
  avgOutput: l.AvgOutput,
  startDate: day(l.StartDate),
  productionDays: l.ProductionDays,
  offDays: l.OffDays,
  endDate: day(l.EndDate),
  outStartDate: day(l.OutStartDate),
  outEndDate: day(l.OutEndDate),
  warehouseStartDate: day(l.WarehouseStartDate),
  warehouseEndDate: day(l.WarehouseEndDate),
  statusCode: l.StatusCode,
});

const EXPORT_COLUMNS = [
  { key: 'planNo', label: 'Số kế hoạch' },
  { key: 'customerName', label: 'Khách hàng' },
  { key: 'styleCode', label: 'Mã hàng' },
  { key: 'orderType', label: 'Loại đơn hàng' },
  { key: 'branchName', label: 'Chi nhánh', field: 'branchCode' },
  { key: 'planQty', label: 'SL kế hoạch' },
  { key: 'scheduledQty', label: 'SL đã xếp chuyền' },
  { key: 'remainingQty', label: 'SL còn lại' },
  { key: 'cmPrice', label: 'Giá CM' },
  { key: 'revenue', label: 'Doanh số' },
  { key: 'syncedAt', label: 'Ngày đồng bộ' },
  { key: 'startDate', label: 'Ngày bắt đầu SX' },
  { key: 'endDate', label: 'Ngày kết thúc SX' },
  { key: 'shipDate', label: 'Ngày xuất hàng' },
  { key: 'statusCode', label: 'Trạng thái' },
];

@Injectable()
export class LinePlanService {
  constructor(
    @Inject(ORDER_DB) private readonly db: OrderDb,
    private readonly plans: LinePlanRepository,
    private readonly lines: LinePlanLineRepository,
    private readonly allocations: LinePlanAllocationRepository,
    private readonly org: OrgService,
    private readonly audit: AuditService,
    private readonly exporter: ExportService,
    private readonly fields: FieldPolicyService,
    private readonly catalogs: CatalogLookupService,
    private readonly supplyGuards: LineSupplyGuards,
  ) {}

  private async sort(user: AuthUser, sort: string | undefined) {
    return sortOf(SORT, await this.fields.safeSort(user, RESOURCE, sort, DEFAULT_SORT), DEFAULT_SORT);
  }

  /** Bộ lọc nghiệp vụ và bộ lọc theo cột; `except`: cột đang mở popup lọc. */
  private async where(user: AuthUser, q: OrderListQuery, except?: string) {
    const filters = await readableColumnFilters(this.fields, user, RESOURCE, q.cf, FILTER);
    return allOf(businessFilter(q), columnFilterWhere(filters, FILTER, except));
  }

  async values(user: AuthUser, query: OrderValuesQuery) {
    const col = await assertFilterField(this.fields, user, RESOURCE, FILTER, query.field);
    const q = await readableQuery(this.fields, user, RESOURCE, query);
    return columnValues(this.plans, scopeOf(user), col, { q: q.q, searchExclude: q.searchExclude, where: await this.where(user, q, query.field), search: query.search });
  }

  async list(user: AuthUser, query: OrderListQuery) {
    const q = await readableQuery(this.fields, user, RESOURCE, query);
    const page = await this.plans.listWithSchedule(scopeOf(user), { page: q.page, pageSize: q.pageSize, q: q.q, searchExclude: q.searchExclude, sort: await this.sort(user, q.sort), where: await this.where(user, q) });
    return { ...page, items: page.items.map(presentLinePlan) };
  }

  async get(user: AuthUser, id: number) {
    const scope = scopeOf(user);
    const page = await this.plans.listWithSchedule(scope, { page: 1, pageSize: 1, where: (qb) => qb.where('Id', '=', id) });
    const plan = page.items[0];
    if (!plan) throw Errors.notFound();
    const lines = await this.lines.listByParent(scope, id);
    // Phạm vi xem có thể rộng hơn phạm vi sửa (nhiều vai trò): đánh dấu dòng sửa được để giao diện chỉ gửi các dòng đó (review lượt 3 P2)
    const editable = new Set((await this.lines.listByParents(scope, [id], 'update')).map((l) => l.Id));
    // Gồm cả chuyền đã ngừng dùng: dòng đã xếp vào chuyền đó vẫn hiện đúng tên; chuyền mồ côi hiện mã kèm "(chuyền cũ)"
    const lineName = await this.org.lineNamer();
    return {
      ...presentLinePlan(plan),
      lines: lines.map((l) => ({ ...presentLine(l), lineName: lineName(l.LineCode), editable: editable.has(l.Id) })),
      // Lịch làm việc của ĐVCS kế hoạch: giao diện tính trước các ngày khi gõ, cùng công thức với lúc lưu. Ngày đặc biệt từ dòng
      // vào chuyền sớm nhất (hoặc một năm trước hôm nay) trở đi là đủ: cách tính chỉ nhìn về sau ngày bắt đầu
      calendar: presentCalendar(await this.catalogs.workCalendar(plan.BranchCode), [addCalendarDays(new Date().toISOString().slice(0, 10), -366), ...lines.map((l) => day(l.StartDate)!)].sort()[0]),
    };
  }

  /**
   * Lưu bảng nhập liệu dàn chuyền của một kế hoạch: thêm, sửa, xóa dòng trong một transaction.
   * Người dùng chỉ nhập chuyền, số lượng, năng suất, ngày vào chuyền. Số ngày SX = làm tròn lên (số lượng / năng suất); số ngày
   * nghỉ, kết thúc vào chuyền, ngày ra chuyền, nhập kho tính theo lịch làm việc của ĐVCS (phase 5.12, work-calendar.ts), không
   * nhận từ client. Phân màu cỡ cho từng chuyền làm ở màn Phân bổ màu cỡ (phase 5.13): ở đây không đề xuất, chỉ giữ số lượng
   * của chuyền không dưới phần đã giao; dòng bị xóa thì phần giao của nó bị xóa theo.
   */
  async saveLines(user: AuthUser, id: number, dto: ScheduleDto) {
    const scope = scopeOf(user);
    await this.plans.assertWritable(scope);
    // Lịch theo ĐVCS của chính kế hoạch (không theo ĐVCS phiên): đúng cả khi tài nguyên đổi cách lọc ĐVCS. ĐVCS của kế hoạch
    // không sửa được, đọc trước transaction không lệch với lần khóa bên dưới
    const calendar = await this.catalogs.workCalendar((await this.plans.getById(scope, id, 'update')).BranchCode);
    const rows: { id?: number; values: Record<string, unknown> & { Qty: number } }[] = [];
    for (const [i, l] of dto.lines.entries()) {
      const productionDays = Math.ceil(l.qty / l.avgOutput);
      if (productionDays > MAX_PRODUCTION_DAYS) throw invalid(`Dòng ${i + 1}: số ngày sản xuất quá ${MAX_PRODUCTION_DAYS} ngày. Kiểm tra số lượng và năng suất.`);
      const dates = lineDates(calendar, l.startDate, productionDays);
      if (!dates) throw invalid(`Dòng ${i + 1}: lịch làm việc của đơn vị cơ sở không đủ ngày làm việc để tính ngày kết thúc. Kiểm tra Lịch làm việc ở Danh mục hệ thống.`);
      rows.push({
        id: l.id,
        values: {
          LineCode: l.lineCode,
          Qty: l.qty,
          AvgOutput: l.avgOutput,
          StartDate: l.startDate,
          ProductionDays: productionDays,
          OffDays: dates.offDays,
          EndDate: dates.endDate,
          OutStartDate: dates.outStartDate,
          OutEndDate: dates.outEndDate,
          WarehouseStartDate: dates.warehouseStartDate,
          WarehouseEndDate: dates.warehouseEndDate,
          SortOrder: i,
        },
      });
    }
    const before = await this.get(user, id);
    // Thông báo vượt số lượng không nêu con số khi người sửa không được xem SL kế hoạch, SL đã xếp (review lượt 3 P7)
    const blindQty = (await this.fields.unreadable(user, RESOURCE, ['planQty', 'scheduledQty'])).size > 0;
    const showAssigned = await assignedVisible(this.fields, user);
    const lineName = await this.org.lineNamer();
    await inTransaction(this.db, async (trx) => {
      // Khóa kế hoạch: hai lần lưu cùng lúc phải lần lượt, không cùng vượt SL kế hoạch hay nhân đôi dòng (review 5.1 #8).
      // Rồi khóa các dòng dàn chuyền trước khi chạm phân màu cỡ: cùng thứ tự kế hoạch → dòng → màu cỡ với màn
      // Phân bổ màu cỡ (khóa dòng rồi mới đọc màu cỡ), không deadlock khi hai màn lưu cùng lúc (review lượt 3 P4).
      await this.plans.lock(scope, id, 'update', trx);
      await this.lines.lockByParent(scope, id, trx);
      const plan = await this.plans.getById(scope, id, 'update', trx);
      // Dòng "của mình" = vừa sửa được vừa xem được. Phạm vi sửa có thể rộng hơn phạm vi xem (ngoại lệ Cho phép lấy
      // hợp mọi phép gán): dòng sửa được mà không thấy thì giao diện không gửi lên, không được coi là bị bỏ rồi xóa
      // (review 5.1 lượt 4 M1). Dòng đó tính vào phần "chuyền khác" như dòng ngoài phạm vi.
      const visible = new Set((await this.lines.listByParents(scope, [id], 'view', trx)).map((l) => l.Id));
      const existing = (await this.lines.listByParent(scope, id, 'update', trx)).filter((e) => visible.has(e.Id));
      const existingIds = new Set(existing.map((e) => e.Id));
      const unknown = rows.filter((r) => r.id !== undefined && !existingIds.has(r.id));
      if (unknown.length) throw invalid('Có dòng dàn chuyền không thuộc kế hoạch này.');
      // Chuyền phải đang dùng khi xếp việc mới vào: dòng mới, hoặc dòng chuyển sang chuyền khác. Dòng cũ giữ nguyên chuyền
      // thì không kiểm, để chuyền ngừng dùng sau khi đã xếp (thường là đã may xong) không khóa việc lưu cả kế hoạch.
      // So với dòng đọc dưới khóa kế hoạch: hai lần lưu cùng lúc không lách được bước kiểm này.
      for (const r of rows) {
        const old = r.id === undefined ? undefined : existing.find((e) => e.Id === r.id);
        if (!old || old.LineCode !== r.values.LineCode) await this.org.assertLine(scope.branchCode, r.values.LineCode as string);
      }
      // Dòng ở chuyền ngoài phạm vi của người sửa không gửi lên nhưng vẫn tính vào tổng và trạng thái (review 5.1 lượt 2 N1)
      const others = await this.lines.totalExcept(scope, id, [...existingIds], trx);
      const total = rows.reduce((s, r) => s + r.values.Qty, 0) + others.qty;
      if (total > plan.PlanQty) {
        if (blindQty) throw invalid('Tổng số lượng dàn chuyền (gồm cả chuyền khác bạn không quản lý) vượt số lượng kế hoạch.');
        const note = others.qty ? ` (gồm ${others.qty} đã xếp ở chuyền khác bạn không quản lý)` : '';
        throw invalid(`Tổng số lượng dàn chuyền ${total}${note} vượt số lượng kế hoạch ${plan.PlanQty}.`);
      }

      const keep = new Set(rows.filter((r) => r.id !== undefined).map((r) => r.id!));
      const removed = existing.filter((e) => !keep.has(e.Id));
      // Dòng đã vào chuyền hoặc đã xong thì không xóa, không chuyển sang chuyền khác
      const started = (s: string) => s === 'IN_PRODUCTION' || s === 'DONE';
      const lockedRemoved = removed.find((e) => started(e.StatusCode));
      if (lockedRemoved) throw conflict(`Dòng chuyền ${lockedRemoved.LineCode} đang may hoặc đã xong, không xóa được.`);
      const moved = rows.find((r) => r.id !== undefined && started(existing.find((e) => e.Id === r.id)!.StatusCode) && existing.find((e) => e.Id === r.id)!.LineCode !== r.values.LineCode);
      if (moved) throw conflict('Dòng đang may hoặc đã xong không chuyển sang chuyền khác được.');
      // Chuyền đã được giao màu cỡ (Phân bổ màu cỡ) không giảm số lượng xuống dưới phần đã giao (phase 5.13 Q2); chỉ xét dòng đang
      // giảm số lượng. Đọc dưới khóa kế hoạch: lần lưu phân màu cỡ cũng khóa kế hoạch trước, hai bên không chen nhau
      const assigned = new Map<number, number>();
      for (const a of await this.allocations.listByParents(scope, [...existingIds], 'update', trx)) assigned.set(a.ShipmentPlanLineId, (assigned.get(a.ShipmentPlanLineId) ?? 0) + a.AssignedQty);
      const shrunk = rows.filter((r) => r.id !== undefined && r.values.Qty < (assigned.get(r.id) ?? 0) && r.values.Qty < existing.find((e) => e.Id === r.id)!.Qty);
      if (shrunk.length) {
        const details = shrunk.map((r) => (showAssigned ? `${lineName(r.values.LineCode as string)}: đã giao ${assigned.get(r.id!)}, số lượng mới ${r.values.Qty}` : lineName(r.values.LineCode as string)));
        throw conflict(`Chuyền đã được giao màu cỡ nhiều hơn số lượng mới (${someOf(details, 'chuyền')}). Giảm phần giao ở màn Phân bổ màu cỡ trước.`, details);
      }
      // Phần giao theo mã hàng của các chuyền có dòng bị xóa hay chuyển chuyền (cộng mọi kế hoạch) trước khi ghi: không xuống dưới số
      // BTP đã cấp (phase 5.15)
      const supplyBefore = await this.supplyGuards.snapshot(trx, plan.BranchCode, plan.StyleCode, existing.map((e) => e.LineCode));
      for (const r of removed) await this.allocations.removeWhere(scope, { parentId: r.Id }, trx);
      await this.lines.removeWhere(scope, { parentId: id, ids: removed.map((r) => r.Id) }, trx);

      // Dòng ghi xong phải còn trong phạm vi xem của người lưu: không thêm hay chuyển dòng sang chuyền chỉ sửa được
      // mà không thấy (dòng sẽ biến khỏi màn hình của họ) – review 5.1 lượt 5
      const ensureVisible = async (lineId: number) => {
        try {
          await this.lines.getById(scope, lineId, 'view', trx);
        } catch (e) {
          if (e instanceof AppException && e.code === 'NOT_FOUND') throw Errors.scopeDenied();
          throw e;
        }
      };
      for (const r of rows) {
        if (r.id !== undefined) {
          await this.lines.updateRow(scope, r.id, r.values, trx);
          await ensureVisible(r.id);
        } else {
          await ensureVisible(await this.lines.insertOne(scope, id, { ...r.values, StatusCode: 'PLANNED' }, trx));
        }
      }
      await this.supplyGuards.assertCovered(trx, plan.BranchCode, plan.StyleCode, supplyBefore, { lineName, showQty: showAssigned });
      if (plan.StatusCode === 'PLANNED' || plan.StatusCode === 'SCHEDULED') {
        const status = rows.length + others.count ? 'SCHEDULED' : 'PLANNED';
        if (status !== plan.StatusCode) await this.plans.update(scope, id, { StatusCode: status }, trx);
      }
    });
    const after = await this.get(user, id);
    await this.audit.log({ userId: user.userId, username: user.username, branchCode: user.branchCode, entityType: 'ShipmentPlan', entityId: id, actionCode: 'LINE_SCHEDULE', oldValue: before.lines, newValue: after.lines, ip: user.ip });
    return after;
  }

  /** Bảng dàn chuyền: mỗi chuyền một hàng, mỗi ngày một cột; thanh là các dòng dàn chuyền giao với khoảng ngày. */
  async board(user: AuthUser, query: BoardQuery) {
    const scope = scopeOf(user);
    const q = await readableQuery(this.fields, user, RESOURCE, query);
    const days = (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000;
    if (days < 0 || days > MAX_BOARD_DAYS) throw invalid(`Khoảng ngày từ 1 đến ${MAX_BOARD_DAYS} ngày.`);
    const style = q.style?.trim().toUpperCase();
    const bars = (await this.lines.inRange(scope, q.from, q.to)).filter(
      (b) => (!style || b.StyleCode.toUpperCase().includes(style)) && (!q.customer || b.CustomerName.toLowerCase().includes(q.customer.toLowerCase())),
    );
    // Chuyền đã ngừng dùng vẫn có hàng khi còn việc trong khoảng ngày đang xem, để thanh cũ không biến mất. Chuyền mồ côi (mã không
    // còn là bộ phận chuyền nào, Q4 phase 5.10) không có hàng: bảng chỉ liệt kê chuyền đang có, thanh của nó không vẽ được
    const busy = new Set(bars.map((b) => b.LineCode));
    const lines = (await this.org.lines(scope.branchCode, scope.isAggregate, { includeInactive: true })).filter((l) => l.isActive || busy.has(l.code));
    // Ngày nghỉ theo lịch ĐVCS của từng chuyền (đơn vị tổng hợp xem chuyền của nhiều ĐVCS); ĐVCS phiên luôn có để tô tiêu đề
    const branches = [...new Set([...(scope.isAggregate ? [] : [scope.branchCode]), ...lines.map((l) => l.branchCode)])];
    const offDays = await Promise.all(branches.map(async (b) => [b, nonWorkingDays(await this.catalogs.workCalendar(b), q.from, q.to)] as const));
    return {
      from: q.from,
      to: q.to,
      nonWorkingDays: Object.fromEntries(offDays),
      lines: lines.map((l) => ({ code: l.code, name: l.name, branchCode: l.branchCode, isActive: l.isActive })),
      bars: bars.map((b) => ({
        id: b.Id,
        planId: b.ShipmentPlanId,
        planNo: b.PlanNo,
        lineCode: b.LineCode,
        startDate: day(b.StartDate),
        endDate: day(b.EndDate),
        qty: b.Qty,
        avgOutput: b.AvgOutput,
        customerName: b.CustomerName,
        styleCode: b.StyleCode,
        poBuyDate: b.PoBuyDate,
        shipDate: day(b.ShipDate),
        statusCode: b.StatusCode,
      })),
    };
  }

  async export(user: AuthUser, query: OrderListQuery) {
    const q = await readableQuery(this.fields, user, RESOURCE, query);
    const rows = await this.plans.listAllWithSchedule(scopeOf(user), { q: q.q, searchExclude: q.searchExclude, sort: await this.sort(user, q.sort), where: await this.where(user, q) });
    return this.exporter.csv(user, RESOURCE, EXPORT_COLUMNS, await this.catalogs.withBranchNames(rows.map(presentLinePlan)), `xep-chuyen-${user.branchCode}.csv`);
  }
}

