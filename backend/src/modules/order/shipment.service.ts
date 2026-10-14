import { Inject, Injectable } from '@nestjs/common';
import type { AuthUser } from '../../platform/auth/auth.types';
import { AuditService } from '../../platform/audit/audit.service';
import { CatalogLookupService } from '../../platform/catalog/catalog-lookup.service';
import { inTransaction } from '../../platform/data/transaction';
import { scopeOf, type Scope } from '../../platform/data/base.repository';
import { allOf, assertFilterField, columnFilterWhere, columnValues, readableColumnFilters, type FilterSpec } from '../../platform/data/column-filter';
import { ExportService } from '../../platform/export/export.service';
import { UserDirectoryService } from '../../platform/org/user-directory.service';
import { FieldPolicyService, MASK, type AccessLevel } from '../../platform/permission/field-policy.service';
import { ORDER_DB } from './order.db';
import { CandidateQuery, OrderListQuery, OrderValuesQuery, ShipmentPlanCreateDto, ShipmentPlanUpdateDto, type PlanLineQtyDto } from './order.dto';
import {
  PlanColorSizeRepository,
  PlanPoRepository,
  PoColorSizeRepository,
  SalesOrderPoRepository,
  SalesOrderRepository,
  ShipmentPlanRepository,
  type SalesOrderPoRow,
  type ShipmentPlanRow,
} from './order.repositories';
import type { OrderDb } from './order.types';
import { ShipmentPlanDeleteGuards } from './shipment-plan-delete-guard';
import { assignedVisible, businessFilter, byColorSize, colorSizeKey, conflict, csKey, day, derived, invalid, isReferenceError, readableQuery, someOf, sortOf, withDerived } from './order.util';

const RESOURCE = 'order.shipment';
const SORT: Record<string, string> = {
  planNo: 'PlanNo',
  customerName: 'CustomerName',
  styleCode: 'StyleCode',
  poBuyDate: 'PoBuyDate',
  planQty: 'PlanQty',
  shipDate: 'ShipDate',
  syncedAt: 'SyncedAt',
  statusCode: 'StatusCode',
  createdAt: 'CreatedAt',
};
const DEFAULT_SORT = 'createdAt:desc';
/** Cột lọc được theo giá trị (nút mũi tên trên tiêu đề lưới) */
const FILTER: FilterSpec = {
  planNo: { expr: 'PlanNo', kind: 'text' },
  customerName: { expr: 'CustomerName', kind: 'text' },
  styleCode: { expr: 'StyleCode', kind: 'text' },
  productName: { expr: 'ProductName', kind: 'text' },
  poBuyDate: { expr: 'PoBuyDate', kind: 'text' },
  branchCode: { expr: 'BranchCode', kind: 'text' },
  syncedAt: { expr: 'SyncedAt', kind: 'day' },
  shipDate: { expr: 'ShipDate', kind: 'date' },
  plannerName: { expr: 'PlannerName', kind: 'text' },
  planQty: { expr: 'PlanQty', kind: 'number' },
  cutQty: { expr: 'CutQty', kind: 'number' },
  sewnQty: { expr: 'SewnQty', kind: 'number' },
  endlineQty: { expr: 'EndlineQty', kind: 'number' },
  finishedQty: { expr: 'FinishedQty', kind: 'number' },
  statusCode: { expr: 'StatusCode', kind: 'text' },
  createdAt: { expr: 'CreatedAt', kind: 'datetime' },
};

export function presentPlan(r: ShipmentPlanRow) {
  return {
    id: r.Id,
    planNo: r.PlanNo,
    salesOrderId: r.SalesOrderId,
    customerName: r.CustomerName,
    styleCode: r.StyleCode,
    productName: r.ProductName,
    poBuyDate: r.PoBuyDate,
    branchCode: r.BranchCode,
    syncedAt: day(r.SyncedAt),
    shipDate: day(r.ShipDate),
    plannerName: r.PlannerName,
    planQty: r.PlanQty,
    cutQty: r.CutQty,
    sewnQty: r.SewnQty,
    endlineQty: r.EndlineQty,
    finishedQty: r.FinishedQty,
    statusCode: r.StatusCode,
    createdAt: r.CreatedAt,
  };
}

const EXPORT_COLUMNS = [
  { key: 'planNo', label: 'Số kế hoạch' },
  { key: 'customerName', label: 'Khách hàng' },
  { key: 'styleCode', label: 'Mã hàng' },
  { key: 'productName', label: 'Tên sản phẩm' },
  { key: 'poBuyDate', label: 'PO/Buy date' },
  { key: 'branchName', label: 'Chi nhánh', field: 'branchCode' },
  { key: 'syncedAt', label: 'Ngày đồng bộ' },
  { key: 'shipDate', label: 'Ngày xuất hàng' },
  { key: 'plannerName', label: 'Nhân viên lập' },
  { key: 'planQty', label: 'Số lượng KH' },
  { key: 'cutQty', label: 'LK cắt' },
  { key: 'sewnQty', label: 'LK May ra' },
  { key: 'endlineQty', label: 'LK Endline' },
  { key: 'finishedQty', label: 'LK Hoàn thiện' },
];

type Level = AccessLevel | undefined;

/**
 * Thứ tự PO: ngày xuất rồi số PO, chỉ theo cột người dùng xem được nguyên giá trị ở order.po. Xếp theo cột bị Ẩn/Che cũng lộ
 * thứ tự giá trị (review 5.1 #2, review 5.9.14 #1); không còn cột nào thì theo Id.
 */
function poSort(levels: Map<string, AccessLevel>) {
  const readable = (f: string) => levels.get(f) !== 'HIDDEN' && levels.get(f) !== 'MASKED';
  const parts = [readable('shipDate') && 'ShipDate:asc', readable('poNumber') && 'PoNumber:asc'].filter(Boolean);
  return parts.length ? parts.join(',') : 'Id:asc';
}

/**
 * Một dòng của lưới "PO của kế hoạch". Khóa trùng mã cột của order.po để interceptor áp chính sách cột. Cột suy ra theo cột
 * nguồn (như ĐVCS của Phân bổ PO): SL đã xác nhận, chưa xác nhận lộ cả Số lượng lẫn Trạng thái nên theo mức chặt hơn của hai
 * cột; Ngày xác nhận lộ Trạng thái nên theo cột đó. Bị Che thì luôn "***", kể cả khi giá trị trống hay bằng 0: để trống là
 * cho biết PO chưa xác nhận.
 */
export function presentPlanPo(r: SalesOrderPoRow, qtyLevel: Level, statusLevel: Level) {
  const confirmed = r.StatusCode === 'CONFIRMED';
  const out: Record<string, unknown> = {
    id: r.Id,
    poCode: r.PoCode,
    poNumber: r.PoNumber,
    destination: r.Destination,
    shipDate: day(r.ShipDate),
    qty: r.Qty,
    statusCode: r.StatusCode,
  };
  return withDerived(out, {
    confirmedAt: derived(r.ConfirmedAt, statusLevel),
    confirmedQty: derived(confirmed ? r.Qty : 0, qtyLevel, statusLevel),
    unconfirmedQty: derived(confirmed ? 0 : r.Qty, qtyLevel, statusLevel),
  });
}

interface DraftLine {
  colorName: string;
  sizeName: string;
  originalQty: number;
  plannedQty: number;
  remainingQty: number;
}

type PlanLine = DraftLine & { planQty: number };

/**
 * Một dòng màu cỡ của GET /:id (popup Sửa, khung Màu cỡ dưới danh sách, task 5.9.15), cột suy ra theo cột nguồn như
 * presentPlanPo: Số lượng gốc là SL màu cỡ của PO nên theo `qty` của order.po; SL đã tạo KHXH là SL KHXH của các kế hoạch
 * khác nên theo `planQty`; SL còn lại lộ cả hai nên theo mức chặt hơn. `planQty` do interceptor áp theo tên khóa.
 */
export function presentPlanLine(l: PlanLine, poQtyLevel: Level, planQtyLevel: Level) {
  return withDerived(
    { colorName: l.colorName, sizeName: l.sizeName, planQty: l.planQty },
    {
      originalQty: derived(l.originalQty, poQtyLevel),
      plannedQty: derived(l.plannedQty, planQtyLevel),
      remainingQty: derived(l.remainingQty, poQtyLevel, planQtyLevel),
    },
  );
}

@Injectable()
export class ShipmentService {
  constructor(
    @Inject(ORDER_DB) private readonly db: OrderDb,
    private readonly plans: ShipmentPlanRepository,
    private readonly planColorSizes: PlanColorSizeRepository,
    private readonly planPos: PlanPoRepository,
    private readonly orders: SalesOrderRepository,
    private readonly pos: SalesOrderPoRepository,
    private readonly poColorSizes: PoColorSizeRepository,
    private readonly users: UserDirectoryService,
    private readonly audit: AuditService,
    private readonly exporter: ExportService,
    private readonly fields: FieldPolicyService,
    private readonly catalogs: CatalogLookupService,
    private readonly deleteGuards: ShipmentPlanDeleteGuards,
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

  private log(user: AuthUser, id: number, action: string, oldValue?: unknown, newValue?: unknown) {
    return this.audit.log({ userId: user.userId, username: user.username, branchCode: user.branchCode, entityType: 'ShipmentPlan', entityId: id, actionCode: action, oldValue, newValue, ip: user.ip });
  }

  async list(user: AuthUser, query: OrderListQuery) {
    const q = await readableQuery(this.fields, user, RESOURCE, query);
    const page = await this.plans.list(scopeOf(user), { page: q.page, pageSize: q.pageSize, q: q.q, searchExclude: q.searchExclude, sort: await this.sort(user, q.sort), where: await this.where(user, q) });
    return { ...page, items: page.items.map(presentPlan) };
  }

  /** Kế hoạch kèm PO và màu cỡ, số chưa áp chính sách cột: dùng khi sửa (nhật ký ghi số thật). */
  private async detail(scope: Scope, id: number) {
    const plan = await this.plans.getById(scope, id);
    const [colorSizes, links] = await Promise.all([this.planColorSizes.listByParent(scope, id), this.planPos.listByParent(scope, id)]);
    const planned = await this.plannedMap(plan.SalesOrderId, id);
    return {
      ...presentPlan(plan),
      poIds: links.map((l) => l.SalesOrderPoId),
      lines: colorSizes.map((c): PlanLine => {
        const other = planned.get(csKey(c.ColorName, c.SizeName)) ?? 0;
        return { colorName: c.ColorName, sizeName: c.SizeName, originalQty: c.OriginalQty, plannedQty: other, remainingQty: Math.max(0, c.OriginalQty - other), planQty: c.PlanQty };
      }),
    };
  }

  /**
   * GET /:id. Khung Màu cỡ hiện cho mọi người xem kế hoạch, nên số lấy từ PO và từ kế hoạch khác phải theo chính sách cột của
   * cột nguồn (review 5.9.15 H1, H2). Không có quyền xem PO ở Cập nhật tỷ lệ cắt thì coi SL PO như bị Ẩn.
   * Lưới của popup (GET draft) chưa áp: chỉ người lập kế hoạch dùng (review 5.1 P7, N4).
   */
  async get(user: AuthUser, id: number) {
    const scope = scopeOf(user);
    const [plan, own, po] = await Promise.all([this.detail(scope, id), this.fields.levels(scope.access, RESOURCE), this.fields.levels(scope.access, 'order.po')]);
    const poQty: Level = scope.access.permissions.has('order.po:view') ? po.levels.get('qty') : 'HIDDEN';
    return { ...plan, lines: plan.lines.map((l) => presentPlanLine(l, poQty, own.levels.get('planQty'))) };
  }

  private async plannedMap(salesOrderId: number, excludePlanId?: number, db?: OrderDb) {
    const rows = await this.plans.plannedBySalesOrder([salesOrderId], excludePlanId, db);
    return new Map(rows.map((r) => [csKey(r.ColorName, r.SizeName), Number(r.PlanQty)]));
  }

  /**
   * Popup "Chọn mã hàng": đơn hàng kèm số lượng đã lập kế hoạch và còn lại. Chỉ đơn hàng có nhà máy SX thuộc ĐVCS của phiên
   * theo danh mục Nhà máy SX (ADR 0013 mục 11), đơn hàng có Chi nhánh FOB nào cũng được; đơn chưa chọn nhà máy SX không hiện. Dữ liệu đọc từ Thông tin đơn hàng nên đi qua
   * chính sách cột của tài nguyên đó (review 5.1 #4); SL còn lại suy ra được SL đơn hàng nên theo cùng mức.
   */
  async candidates(user: AuthUser, query: CandidateQuery) {
    const scope = scopeOf(user);
    const q = await readableQuery(this.fields, user, 'order.allocation', query);
    const filter = businessFilter({ ...q, page: 1, pageSize: 200 });
    // Đơn đã hoàn thành hoặc hủy không còn gì để lập: với dữ liệu BRAVO, 200 đơn đầu theo ngày xuất phần lớn là đơn đã đóng lệnh
    const page = await this.orders.list(scope, {
      page: 1,
      pageSize: 200,
      sort: 'ShipDate:asc',
      assignedFactories: true,
      where: (qb) => filter(qb).where('StatusCode', 'not in', ['DONE', 'CANCELLED']),
    });
    const planned = await this.plans.plannedBySalesOrder(page.items.map((o) => o.Id));
    const shaped = await this.fields.shape(
      user,
      'order.allocation',
      page.items.map((o) => ({
        salesOrderId: o.Id,
        orderNo: o.OrderNo,
        customerName: o.CustomerName,
        styleCode: o.StyleCode,
        productName: o.ProductName,
        branchCode: o.BranchCode,
        productionFactoryCode: o.ProductionFactoryCode,
        qty: o.Qty as number | typeof MASK | undefined,
        syncedAt: day(o.SyncedAt),
        shipDate: day(o.ShipDate),
      })),
    );
    return shaped.map(({ qty, ...rest }) => {
      const done = planned.filter((p) => p.SalesOrderId === rest.salesOrderId).reduce((s, p) => s + Number(p.PlanQty), 0);
      return { ...rest, orderQty: qty, plannedQty: done, remainingQty: typeof qty === 'number' ? Math.max(0, qty - done) : qty };
    });
  }

  /** Đơn hàng phải có nhà máy SX thuộc ĐVCS của phiên mới lập kế hoạch mới được (cùng điều kiện với popup Chọn mã hàng) */
  private assignedOrder(scope: Scope, salesOrderId: number, db?: OrderDb) {
    return this.orders.getById(scope, salesOrderId, 'view', db, { assignedFactories: true });
  }

  /** PO của đơn hàng cho popup chọn mã hàng: đi qua chính sách cột của Cập nhật tỷ lệ cắt (order.po). */
  async candidatePos(user: AuthUser, salesOrderId: number) {
    const scope = scopeOf(user);
    await this.assignedOrder(scope, salesOrderId);
    const { levels } = await this.fields.levels(scope.access, 'order.po');
    const page = await this.pos.list(scope, { page: 1, pageSize: 200, sort: poSort(levels), where: (qb) => qb.where('SalesOrderId', '=', salesOrderId) });
    return this.fields.shape(
      user,
      'order.po',
      page.items.map((p) => ({
        id: p.Id,
        poCode: p.PoCode,
        poNumber: p.PoNumber,
        qty: p.Qty,
        destination: p.Destination,
        syncedAt: day(p.SyncedAt),
        shipDate: day(p.ShipDate),
        statusCode: p.StatusCode,
      })),
    );
  }

  /**
   * Lưới "PO của kế hoạch" dưới danh sách kế hoạch (task 5.9.14): PO đã chọn khi lập kế hoạch và số lượng đã xác nhận, chưa
   * xác nhận. Xác nhận làm ở Cập nhật tỷ lệ cắt, theo cả PO, nên số là của cả PO (một PO có thể nằm trong nhiều kế hoạch).
   * Dữ liệu PO đi qua phạm vi và chính sách cột của order.po (ADR 0006; controller khai báo @FieldResource('order.po')).
   * `hiddenCount`: PO của kế hoạch nằm ngoài phạm vi người dùng được xem ở order.po.
   */
  async posOfPlan(user: AuthUser, planId: number) {
    const scope = scopeOf(user);
    // listByParent kiểm kế hoạch xem được (ĐVCS, phạm vi của order.shipment), không thì 404 như GET /:id
    const ids = [...new Set((await this.planPos.listByParent(scope, planId)).map((l) => l.SalesOrderPoId))];
    const { levels } = await this.fields.levels(scope.access, 'order.po');
    const rows = ids.length ? await this.pos.listAll(scope, { sort: poSort(levels), where: (qb) => qb.where('Id', 'in', ids) }, 'view') : [];
    return { items: rows.map((r) => presentPlanPo(r, levels.get('qty'), levels.get('statusCode'))), hiddenCount: ids.length - rows.length };
  }

  /**
   * Lưới màu cỡ của popup: SL gốc (các PO đã chọn), SL đã tạo KHXH (kế hoạch khác), SL còn lại.
   * `db`: trong lúc lập, sửa kế hoạch thì đọc bằng chính transaction đang giữ khóa (không chiếm thêm kết nối).
   */
  async draft(user: AuthUser, salesOrderId: number, poIds: number[], excludePlanId?: number, db?: OrderDb): Promise<DraftLine[]> {
    const scope = scopeOf(user);
    const page = await this.pos.list(scope, { page: 1, pageSize: 200, where: (qb) => qb.where('SalesOrderId', '=', salesOrderId).where('Id', 'in', poIds) }, 'view', db);
    if (page.items.length !== new Set(poIds).size) throw invalid('Có PO không thuộc mã hàng đã chọn hoặc bạn không được xem.');
    const original = byColorSize(await this.poColorSizes.listByParents(scope, poIds, 'view', db), (r) => r.Qty);
    const planned = await this.plannedMap(salesOrderId, excludePlanId, db);
    return [...original.values()].map((o) => {
      const done = planned.get(csKey(o.colorName, o.sizeName)) ?? 0;
      return { colorName: o.colorName, sizeName: o.sizeName, originalQty: o.qty, plannedQty: done, remainingQty: Math.max(0, o.qty - done) };
    });
  }

  /**
   * Lưới màu cỡ cho popup (GET draft): lập mới thì đơn hàng phải có nhà máy SX thuộc ĐVCS của phiên; sửa kế hoạch
   * (`excludePlanId`) thì kế hoạch phải xem được và đúng đơn hàng đó (đơn đổi nhà máy SX không khóa việc sửa kế hoạch đã lập).
   */
  async draftFor(user: AuthUser, salesOrderId: number, poIds: number[], excludePlanId?: number) {
    const scope = scopeOf(user);
    if (excludePlanId === undefined) await this.assignedOrder(scope, salesOrderId);
    else if ((await this.plans.getById(scope, excludePlanId)).SalesOrderId !== salesOrderId) throw invalid('Kế hoạch không thuộc mã hàng này.');
    return this.draft(user, salesOrderId, poIds, excludePlanId);
  }

  private checkLines(draft: DraftLine[], lines: PlanLineQtyDto[]) {
    const byKey = new Map(draft.map((d) => [csKey(d.colorName, d.sizeName), d]));
    const out = [];
    const errors: string[] = [];
    const seen = new Set<string>();
    for (const l of lines) {
      const k = csKey(l.colorName, l.sizeName);
      if (seen.has(k)) throw invalid(`Màu ${l.colorName}, cỡ ${l.sizeName} bị lặp.`);
      seen.add(k);
      const d = byKey.get(k);
      if (!d) throw invalid(`Màu ${l.colorName}, cỡ ${l.sizeName} không có trong các PO đã chọn.`);
      if (l.planQty > d.remainingQty) errors.push(`${l.colorName}/${l.sizeName}: SL KHXH ${l.planQty} > SL còn lại ${d.remainingQty}`);
      out.push({ ColorName: d.colorName, SizeName: d.sizeName, OriginalQty: d.originalQty, PlanQty: l.planQty });
    }
    if (errors.length) throw invalid('Số lượng kế hoạch vượt số lượng còn lại.', errors);
    if (!out.some((l) => l.PlanQty > 0)) throw invalid('Nhập số lượng kế hoạch cho ít nhất một màu cỡ.');
    return out.map((l, i) => ({ ...l, SortOrder: i }));
  }

  async create(user: AuthUser, dto: ShipmentPlanCreateDto) {
    const scope = scopeOf(user);
    const order = await this.assignedOrder(scope, dto.salesOrderId);
    // Cùng điều kiện với danh sách ứng viên: đơn đã xong hoặc đã hủy không lập thêm kế hoạch
    if (order.StatusCode === 'DONE' || order.StatusCode === 'CANCELLED') throw invalid('Đơn hàng đã hoàn thành hoặc đã hủy, không lập thêm kế hoạch.');
    const poIds = [...new Set(dto.poIds)];
    const plannerName = await this.users.fullName(user.userId);
    await this.plans.assertWritable(scope);
    const plan = await inTransaction(this.db, async (trx) => {
      // Khóa đơn hàng đến hết transaction: hai người (ở bất kỳ ĐVCS nào) cùng lập kế hoạch cho một đơn phải lần lượt,
      // người sau tính SL còn lại đã trừ kế hoạch của người trước (review 5.1 #7). Đọc lại sau khi khóa: nhà máy SX của đơn
      // có thể vừa đổi
      await this.orders.lock(scope, order.Id, 'view', trx);
      await this.assignedOrder(scope, order.Id, trx);
      const lines = this.checkLines(await this.draft(user, order.Id, poIds, undefined, trx), dto.lines);
      const row = await this.plans.createNumbered(
        scope,
        {
          SalesOrderId: order.Id,
          CustomerName: order.CustomerName,
          StyleCode: order.StyleCode,
          ProductName: order.ProductName,
          OrderType: order.OrderType,
          PoBuyDate: dto.poBuyDate,
          PlanQty: lines.reduce((s, l) => s + l.PlanQty, 0),
          // Giá CM chụp từ đơn hàng lúc lập; màn Xếp chuyền hiển thị theo chính sách cột của nó
          CmPrice: order.CmPrice,
          SyncedAt: order.SyncedAt,
          ShipDate: dto.shipDate ?? day(order.ShipDate),
          PlannerName: plannerName,
          StatusCode: 'PLANNED',
        },
        'PlanNo',
        'KH',
        trx,
      );
      await this.planPos.insert(scope, row.Id, poIds.map((id) => ({ SalesOrderPoId: id })), trx);
      await this.planColorSizes.insert(scope, row.Id, lines, trx);
      return row;
    });
    const out = presentPlan(plan);
    await this.log(user, plan.Id, 'CREATE', undefined, { ...out, poIds, lines: dto.lines });
    return out;
  }

  /** "Sửa": đổi PO/Buy date, ngày xuất, số lượng theo màu cỡ (trong giới hạn còn lại). */
  async update(user: AuthUser, id: number, dto: ShipmentPlanUpdateDto) {
    const scope = scopeOf(user);
    await this.plans.assertWritable(scope);
    const before = await this.detail(scope, id);
    const showAssigned = dto.lines ? await assignedVisible(this.fields, user) : false;
    const set: Record<string, unknown> = {};
    if (dto.poBuyDate !== undefined) set.PoBuyDate = dto.poBuyDate;
    if (dto.shipDate !== undefined) set.ShipDate = dto.shipDate;
    const plan = await inTransaction(this.db, async (trx) => {
      // Thứ tự khóa ở mọi đường: đơn hàng rồi kế hoạch (lưu dàn chuyền chỉ khóa kế hoạch). Khóa kế hoạch để đọc
      // SL đã xếp chuyền và ghi SL mới không chen được với lần lưu dàn chuyền đang chạy (review 5.1 lượt 2 N2).
      // Khóa đơn hàng chỉ để xếp hàng với người lập kế hoạch khác cho cùng đơn: không cần quyền xem đơn hàng (review lượt 3 P6)
      let lines: ReturnType<ShipmentService['checkLines']> | null = null;
      if (dto.lines) {
        await this.orders.lockBranchRow(scope, before.salesOrderId, trx);
        lines = this.checkLines(await this.draft(user, before.salesOrderId, before.poIds, id, trx), dto.lines);
        set.PlanQty = lines.reduce((s, l) => s + l.PlanQty, 0);
      }
      await this.plans.lock(scope, id, 'update', trx);
      const current = await this.plans.getById(scope, id, 'update', trx);
      if (lines) {
        const scheduled = await this.plans.scheduledQty(scope, id, trx);
        if ((set.PlanQty as number) < scheduled) throw conflict(`Kế hoạch đã xếp chuyền ${scheduled} sản phẩm, không giảm số lượng xuống dưới mức này được.`);
        // Màu cỡ đã giao cho chuyền ở Phân bổ màu cỡ: không giảm SL KHXH xuống dưới phần đã giao, không bỏ màu cỡ đã giao (phase
        // 5.13). Chỉ chặn khi SL mới nhỏ hơn SL đang có: kế hoạch cũ giao lệch vài sản phẩm (chia theo tỷ lệ trước 5.13) vẫn sửa được
        // các màu cỡ khác
        const planned = new Map(lines.map((l) => [colorSizeKey(l.ColorName, l.SizeName), l.PlanQty]));
        const saved = new Map((await this.planColorSizes.listByParent(scope, id, 'update', trx)).map((c) => [colorSizeKey(c.ColorName, c.SizeName), c.PlanQty]));
        const over = (await this.plans.assignedByColorSize(scope, id, trx)).filter((a) => {
          const k = colorSizeKey(a.ColorName, a.SizeName);
          const now = planned.get(k) ?? 0;
          return Number(a.Qty) > now && now < (saved.get(k) ?? 0);
        });
        if (over.length) {
          const details = over.map((a) => {
            const now = planned.get(colorSizeKey(a.ColorName, a.SizeName)) ?? 0;
            return showAssigned ? `${a.ColorName}/${a.SizeName}: đã giao ${a.Qty}, SL KHXH mới ${now}` : `${a.ColorName}/${a.SizeName}`;
          });
          throw conflict(`Màu cỡ đã giao cho chuyền nhiều hơn SL KHXH mới (${someOf(details, 'màu cỡ')}). Giảm phần giao ở màn Phân bổ màu cỡ trước.`, details);
        }
        await this.planColorSizes.removeWhere(scope, { parentId: id }, trx);
        await this.planColorSizes.insert(scope, id, lines, trx);
      }
      return Object.keys(set).length ? this.plans.update(scope, id, set, trx) : current;
    });
    const out = presentPlan(plan);
    await this.log(user, id, 'UPDATE', before, { ...out, lines: dto.lines });
    return out;
  }

  async remove(user: AuthUser, id: number) {
    const scope = scopeOf(user);
    const before = await this.plans.getById(scope, id, 'delete');
    // Dữ liệu ở module khác theo kế hoạch này (số cắt ở Đồng bộ tiến độ cắt, quyết định 13.4): kiểm trước, khác database nên ngoài
    // transaction; module đó tự kiểm lại kế hoạch còn tồn tại khi ghi
    const reasons = await this.deleteGuards.reasonsFor({ id, branchCode: before.BranchCode, createdAt: before.CreatedAt });
    if (reasons.length) throw conflict(reasons.join(' '));
    const scheduled = conflict('Kế hoạch đã được xếp chuyền nên không xóa được. Xóa dàn chuyền ở màn Xếp chuyền trước.');
    try {
      await inTransaction(this.db, async (trx) => {
        // Khóa kế hoạch trước khi kiểm và xóa: không chen giữa lần sửa hay lần lưu dàn chuyền đang chạy (review lượt 3 P5)
        await this.plans.lock(scope, id, 'delete', trx);
        if (await this.plans.hasSchedule(scope, id, trx)) throw scheduled;
        await this.planColorSizes.removeWhere(scope, { parentId: id }, trx, 'delete');
        await this.planPos.removeWhere(scope, { parentId: id }, trx, 'delete');
        await this.plans.remove(scope, id, trx);
      });
    } catch (e) {
      // Có người vừa xếp chuyền giữa lúc kiểm và lúc xóa
      if (isReferenceError(e)) throw scheduled;
      throw e;
    }
    await this.log(user, id, 'DELETE', presentPlan(before));
  }

  async export(user: AuthUser, query: OrderListQuery) {
    const q = await readableQuery(this.fields, user, RESOURCE, query);
    const rows = await this.plans.listAll(scopeOf(user), { q: q.q, searchExclude: q.searchExclude, sort: await this.sort(user, q.sort), where: await this.where(user, q) });
    return this.exporter.csv(user, RESOURCE, EXPORT_COLUMNS, await this.catalogs.withBranchNames(rows.map(presentPlan)), `ke-hoach-xuat-hang-${user.branchCode}.csv`);
  }
}
