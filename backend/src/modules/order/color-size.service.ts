import { Inject, Injectable } from '@nestjs/common';
import type { AuthUser } from '../../platform/auth/auth.types';
import { AuditService } from '../../platform/audit/audit.service';
import { CatalogLookupService } from '../../platform/catalog/catalog-lookup.service';
import { inTransaction } from '../../platform/data/transaction';
import { scopeOf } from '../../platform/data/base.repository';
import { allOf, assertFilterField, columnFilterWhere, columnValues, readableColumnFilters, type FilterSpec } from '../../platform/data/column-filter';
import { ExportService } from '../../platform/export/export.service';
import { OrgService } from '../../platform/org/org.service';
import { FieldPolicyService } from '../../platform/permission/field-policy.service';
import { ORDER_DB } from './order.db';
import { AllocationDto, OrderListQuery, OrderValuesQuery } from './order.dto';
import { assignedExpr, LineAllocationRepository, LineColorSizeRepository, planExpr, withPlanFilter, type AllocationListRow, type LineColorSizeRow } from './order.repositories';
import type { OrderDb } from './order.types';
import { csKey, day, invalid, readableQuery, sortOf } from './order.util';

const RESOURCE = 'order.colorsize';
const SORT: Record<string, string> = { lineCode: 'LineCode', startDate: 'StartDate', endDate: 'EndDate', qty: 'Qty', avgOutput: 'AvgOutput', statusCode: 'StatusCode', createdAt: 'CreatedAt' };
const DEFAULT_SORT = 'createdAt:desc';
/** Cột lọc được theo giá trị. Khách hàng, mã hàng, PO/Buy date, ngày xuất hàng lấy từ kế hoạch cha như lưới. */
const FILTER: FilterSpec = {
  customerName: { expr: planExpr('CustomerName'), kind: 'text' },
  styleCode: { expr: planExpr('StyleCode'), kind: 'text' },
  poBuyDate: { expr: planExpr('PoBuyDate'), kind: 'text' },
  branchCode: { expr: 'BranchCode', kind: 'text' },
  lineCode: { expr: 'LineCode', kind: 'text' },
  startDate: { expr: 'StartDate', kind: 'date' },
  avgOutput: { expr: 'AvgOutput', kind: 'number' },
  endDate: { expr: 'EndDate', kind: 'date' },
  shipDate: { expr: planExpr('ShipDate'), kind: 'date' },
  qty: { expr: 'Qty', kind: 'number' },
  assignedQty: { expr: assignedExpr, kind: 'number' },
  statusCode: { expr: 'StatusCode', kind: 'text' },
  createdAt: { expr: 'CreatedAt', kind: 'datetime' },
};

export function presentAllocation(r: AllocationListRow, lineName?: string | null) {
  return {
    id: r.Id,
    planId: r.ShipmentPlanId,
    planNo: r.PlanNo,
    customerName: r.CustomerName,
    styleCode: r.StyleCode,
    poBuyDate: r.PoBuyDate,
    branchCode: r.BranchCode,
    lineCode: r.LineCode,
    lineName: lineName === null ? undefined : (lineName ?? r.LineCode),
    startDate: day(r.StartDate),
    avgOutput: r.AvgOutput,
    endDate: day(r.EndDate),
    shipDate: day(r.PlanShipDate),
    qty: r.Qty,
    assignedQty: Number(r.AssignedQty ?? 0),
    statusCode: r.StatusCode,
    createdAt: r.CreatedAt,
  };
}

const presentRow = (r: LineColorSizeRow) => ({ id: r.Id, colorName: r.ColorName, sizeName: r.SizeName, planQty: r.PlanQty, assignedQty: r.AssignedQty });

const EXPORT_COLUMNS = [
  { key: 'customerName', label: 'Khách hàng' },
  { key: 'styleCode', label: 'Mã hàng' },
  { key: 'poBuyDate', label: 'PO Buy date' },
  { key: 'branchName', label: 'Chi nhánh', field: 'branchCode' },
  { key: 'lineCode', label: 'Chuyền may' },
  { key: 'startDate', label: 'Ngày bắt đầu chuyền' },
  { key: 'avgOutput', label: 'NSBQ chuyền' },
  { key: 'endDate', label: 'Ngày kết thúc chuyền' },
  { key: 'shipDate', label: 'Ngày xuất hàng' },
  { key: 'qty', label: 'Số lượng kế hoạch' },
  { key: 'assignedQty', label: 'Số lượng đã giao' },
  { key: 'statusCode', label: 'Trạng thái' },
];

@Injectable()
export class ColorSizeService {
  constructor(
    @Inject(ORDER_DB) private readonly db: OrderDb,
    private readonly lines: LineAllocationRepository,
    private readonly rows: LineColorSizeRepository,
    private readonly org: OrgService,
    private readonly audit: AuditService,
    private readonly exporter: ExportService,
    private readonly fields: FieldPolicyService,
    private readonly catalogs: CatalogLookupService,
  ) {}

  private async sort(user: AuthUser, sort: string | undefined) {
    return sortOf(SORT, await this.fields.safeSort(user, RESOURCE, sort, DEFAULT_SORT), DEFAULT_SORT);
  }

  /** Bộ lọc của dòng dàn chuyền (trạng thái, chuyền, lọc theo cột); `except`: cột đang mở popup lọc. */
  private async where(user: AuthUser, q: OrderListQuery, except?: string) {
    const filters = await readableColumnFilters(this.fields, user, RESOURCE, q.cf, FILTER);
    return allOf(
      <Q extends { where: (...a: any[]) => Q }>(qb: Q): Q => {
        if (q.status) qb = qb.where('StatusCode', '=', q.status);
        if (q.line) qb = qb.where('LineCode', '=', q.line);
        return qb;
      },
      columnFilterWhere(filters, FILTER, except),
    );
  }

  private plan(q: OrderListQuery) {
    return { shipFrom: q.shipFrom, shipTo: q.shipTo, customer: q.customer, style: q.style };
  }

  async values(user: AuthUser, query: OrderValuesQuery) {
    const col = await assertFilterField(this.fields, user, RESOURCE, FILTER, query.field);
    const q = await readableQuery(this.fields, user, RESOURCE, query);
    const where = withPlanFilter({ where: await this.where(user, q, query.field), plan: this.plan(q) });
    return columnValues(this.lines, scopeOf(user), col, { where, search: query.search });
  }

  /**
   * Tên chuyền theo mã, chuyền mồ côi hiện mã kèm "(chuyền cũ)" (OrgService.lineNamer). Tên chuyền không phải cột đăng ký nên khi mã chuyền
   * bị Ẩn hoặc Che thì không trả tên (tên suy ra được mã) – review 5.1 lượt 2 N12.
   */
  private async lineNames(user: AuthUser): Promise<(code: string) => string | null> {
    if ((await this.fields.unreadable(user, RESOURCE, ['lineCode'])).size) return () => null;
    return this.org.lineNamer(user.branchCode!, user.isAggregate);
  }

  async list(user: AuthUser, query: OrderListQuery) {
    const q = await readableQuery(this.fields, user, RESOURCE, query);
    const page = await this.lines.listWithPlan(scopeOf(user), {
      page: q.page,
      pageSize: q.pageSize,
      sort: await this.sort(user, q.sort),
      where: await this.where(user, q),
      plan: this.plan(q),
    });
    const name = await this.lineNames(user);
    return { ...page, items: page.items.map((r) => presentAllocation(r, name(r.LineCode))) };
  }

  async get(user: AuthUser, id: number) {
    const scope = scopeOf(user);
    const line = await this.lines.getWithPlan(scope, id);
    const rows = await this.rows.listByParent(scope, id);
    return { ...presentAllocation(line, (await this.lineNames(user))(line.LineCode)), rows: rows.map(presentRow) };
  }

  /**
   * Lưu số lượng giao theo màu cỡ của một dòng dàn chuyền. Màu cỡ và SL kế hoạch do màn Xếp chuyền đề xuất,
   * ở đây chỉ nhập số lượng giao: không thêm màu cỡ lạ, mỗi ô không vượt SL kế hoạch của ô đó (review 5.1 #10).
   */
  async save(user: AuthUser, id: number, dto: AllocationDto) {
    const scope = scopeOf(user);
    await this.lines.assertWritable(scope);
    const before = await this.get(user, id);
    await inTransaction(this.db, async (trx) => {
      await this.lines.lock(scope, id, 'update', trx);
      const line = await this.lines.getById(scope, id, 'update', trx);
      const current = await this.rows.listByParent(scope, id, 'update', trx);
      const byKey = new Map(current.map((r) => [csKey(r.ColorName.toLowerCase(), r.SizeName.toLowerCase()), r]));
      const seen = new Set<string>();
      const errors: string[] = [];
      for (const r of dto.rows) {
        const k = csKey(r.colorName.toLowerCase(), r.sizeName.toLowerCase());
        if (seen.has(k)) throw invalid(`Màu ${r.colorName}, cỡ ${r.sizeName} bị lặp.`);
        seen.add(k);
        const row = byKey.get(k);
        if (!row) throw invalid(`Màu ${r.colorName}, cỡ ${r.sizeName} không có trong kế hoạch của chuyền này.`);
        if (r.assignedQty > row.PlanQty) errors.push(`${row.ColorName}/${row.SizeName}: giao ${r.assignedQty} > SL KH ${row.PlanQty}`);
      }
      if (errors.length) throw invalid('Số lượng giao vượt số lượng kế hoạch của màu cỡ.', errors);
      const next = new Map(dto.rows.map((r) => [csKey(r.colorName.toLowerCase(), r.sizeName.toLowerCase()), r.assignedQty]));
      let assigned = 0;
      for (const [k, row] of byKey) {
        // Màu cỡ không gửi lên thì coi là giao 0
        const qty = next.get(k) ?? 0;
        assigned += qty;
        if (qty !== row.AssignedQty) await this.rows.updateRow(scope, row.Id, { AssignedQty: qty }, trx);
      }
      if (line.StatusCode === 'PLANNED' || line.StatusCode === 'ALLOCATED') {
        const status = assigned > 0 ? 'ALLOCATED' : 'PLANNED';
        if (status !== line.StatusCode) await this.lines.update(scope, id, { StatusCode: status }, trx);
      }
    });
    const after = await this.get(user, id);
    await this.audit.log({ userId: user.userId, username: user.username, branchCode: user.branchCode, entityType: 'ShipmentPlanLine', entityId: id, actionCode: 'COLOR_SIZE_ALLOCATE', oldValue: before.rows, newValue: after.rows, ip: user.ip });
    return after;
  }

  async export(user: AuthUser, query: OrderListQuery) {
    const q = await readableQuery(this.fields, user, RESOURCE, query);
    const rows = await this.lines.listAllWithPlan(scopeOf(user), {
      sort: await this.sort(user, q.sort),
      where: await this.where(user, q),
      plan: this.plan(q),
    });
    const name = await this.lineNames(user);
    return this.exporter.csv(user, RESOURCE, EXPORT_COLUMNS, await this.catalogs.withBranchNames(rows.map((r) => presentAllocation(r, name(r.LineCode)))), `phan-bo-mau-co-${user.branchCode}.csv`);
  }
}
