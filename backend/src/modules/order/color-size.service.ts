import { Inject, Injectable } from '@nestjs/common';
import { Errors } from '../../common/app.exception';
import type { AuthUser } from '../../platform/auth/auth.types';
import { AuditService } from '../../platform/audit/audit.service';
import { CatalogLookupService } from '../../platform/catalog/catalog-lookup.service';
import { inTransaction } from '../../platform/data/transaction';
import { scopeOf, type Scope } from '../../platform/data/base.repository';
import { allOf, assertFilterField, columnFilterWhere, columnValues, readableColumnFilters, type DistinctSource } from '../../platform/data/column-filter';
import { ExportService } from '../../platform/export/export.service';
import { OrgService } from '../../platform/org/org.service';
import { FieldPolicyService } from '../../platform/permission/field-policy.service';
import { LineSupplyGuards } from './line-supply-guard';
import { ORDER_DB } from './order.db';
import { AllocationDto, OrderListQuery, OrderValuesQuery } from './order.dto';
import {
  ALLOCATION_FILTER,
  hasLines,
  LineAllocationRepository,
  LineColorSizeRepository,
  ShipmentPlanRepository,
  type AllocationPlanRow,
  type AllocationStatus,
  type PlanColorSizeRow,
  type PlanLineRow,
} from './order.repositories';
import type { OrderDb } from './order.types';
import { businessFilter, colorSizeKey as cellKey, day, derived, invalid, readableQuery, someOf, withDerived } from './order.util';

const RESOURCE = 'order.colorsize';
const DEFAULT_SORT = 'createdAt:desc';
/** Số kế hoạch tối đa một lần xuất file: quá thì báo lọc bớt, không cắt im lặng */
const EXPORT_MAX = 10_000;
const STATUS_LABEL: Record<AllocationStatus, string> = { PLANNED: 'Chưa phân màu cỡ', PARTIAL: 'Phân một phần', FULL: 'Đã phân đủ' };

/**
 * Một dòng của danh sách: một kế hoạch có dòng dàn chuyền trong phạm vi xem (phase 5.13). Khóa trùng mã cột đăng ký của
 * order.colorsize để interceptor áp chính sách cột; chuyền, NSBQ là mảng theo thứ tự dàn chuyền.
 */
export function presentAllocationPlan(r: AllocationPlanRow, name: (code: string) => string | null) {
  const codes = r.LineCodes.split(',');
  const names = codes.map(name);
  return {
    id: r.Id,
    planNo: r.PlanNo,
    customerName: r.CustomerName,
    styleCode: r.StyleCode,
    poBuyDate: r.PoBuyDate,
    branchCode: r.BranchCode,
    lineCode: codes,
    // Tên chuyền suy ra được mã: mã bị Ẩn, Che thì không trả tên (review 5.1 lượt 2 N12)
    lineName: names.includes(null) ? undefined : (names as string[]),
    startDate: day(r.StartDate),
    avgOutput: r.AvgOutputs.split(',').map(Number),
    endDate: day(r.EndDate),
    shipDate: day(r.ShipDate),
    qty: r.PlanQty,
    assignedQty: Number(r.AssignedQty),
    statusCode: r.StatusCode,
    createdAt: r.CreatedAt,
  };
}

const EXPORT_COLUMNS = [
  { key: 'customerName', label: 'Khách hàng' },
  { key: 'styleCode', label: 'Mã hàng' },
  { key: 'poBuyDate', label: 'PO Buy date' },
  { key: 'branchName', label: 'Chi nhánh', field: 'branchCode' },
  { key: 'lineText', label: 'Chuyền may', field: 'lineCode' },
  { key: 'startDate', label: 'Ngày bắt đầu chuyền' },
  { key: 'avgOutputText', label: 'NSBQ chuyền', field: 'avgOutput' },
  { key: 'endDate', label: 'Ngày kết thúc chuyền' },
  { key: 'shipDate', label: 'Ngày xuất hàng' },
  { key: 'qty', label: 'Số lượng kế hoạch' },
  { key: 'assignedQty', label: 'Số lượng giao' },
  { key: 'statusText', label: 'Trạng thái', field: 'statusCode' },
];

type NextCell = { line: PlanLineRow; cell: PlanColorSizeRow; qty: number; sort: number };

@Injectable()
export class ColorSizeService {
  constructor(
    @Inject(ORDER_DB) private readonly db: OrderDb,
    private readonly lines: LineAllocationRepository,
    private readonly rows: LineColorSizeRepository,
    private readonly plans: ShipmentPlanRepository,
    private readonly org: OrgService,
    private readonly audit: AuditService,
    private readonly exporter: ExportService,
    private readonly fields: FieldPolicyService,
    private readonly catalogs: CatalogLookupService,
    private readonly supplyGuards: LineSupplyGuards,
  ) {}

  /**
   * Bộ lọc trên bảng gom một dòng mỗi kế hoạch: dải lọc (ngày xuất, khách hàng, mã hàng, trạng thái, chuyền) và lọc theo cột;
   * `except`: cột đang mở popup lọc. Chuyền lọc theo từng chuyền của kế hoạch, không theo chuỗi đã nối.
   */
  private async where(user: AuthUser, q: OrderListQuery, except?: string) {
    const filters = await readableColumnFilters(this.fields, user, RESOURCE, q.cf, ALLOCATION_FILTER);
    const line = except === 'lineCode' ? undefined : filters.find((f) => f.field === 'lineCode');
    return allOf(
      businessFilter(q, { ship: 'r.ShipDate', customer: 'r.CustomerName', style: 'r.StyleCode', status: null }),
      q.status ? columnFilterWhere([{ field: 'statusCode', mode: 'in', values: [q.status] }], ALLOCATION_FILTER) : null,
      q.line ? hasLines([q.line]) : null,
      line ? hasLines(line.values.filter((v): v is string => typeof v === 'string'), line.mode) : null,
      columnFilterWhere(
        filters.filter((f) => f.field !== 'lineCode'),
        ALLOCATION_FILTER,
        except,
      ),
    );
  }

  async values(user: AuthUser, query: OrderValuesQuery) {
    const col = await assertFilterField(this.fields, user, RESOURCE, ALLOCATION_FILTER, query.field);
    const q = await readableQuery(this.fields, user, RESOURCE, query);
    const source: DistinctSource<Scope> = {
      distinctValues: (scope, c, o) => (query.field === 'lineCode' ? this.lines.planLineValues(scope, o) : this.lines.planValues(scope, c, o)),
    };
    return columnValues(source, scopeOf(user), col, { where: await this.where(user, q, query.field), search: query.search });
  }

  /**
   * Tên chuyền theo mã, chuyền mồ côi hiện mã kèm "(chuyền cũ)" (OrgService.lineNamer). Tên chuyền không phải cột đăng ký nên khi mã chuyền
   * bị Ẩn hoặc Che thì không trả tên (tên suy ra được mã) – review 5.1 lượt 2 N12.
   */
  private async lineNames(user: AuthUser): Promise<(code: string) => string | null> {
    if ((await this.fields.unreadable(user, RESOURCE, ['lineCode'])).size) return () => null;
    return this.org.lineNamer();
  }

  async list(user: AuthUser, query: OrderListQuery) {
    const q = await readableQuery(this.fields, user, RESOURCE, query);
    const page = await this.lines.planPage(scopeOf(user), {
      page: q.page,
      pageSize: q.pageSize,
      sort: await this.fields.safeSort(user, RESOURCE, q.sort, DEFAULT_SORT),
      where: await this.where(user, q),
    });
    const name = await this.lineNames(user);
    return { ...page, items: page.items.map((r) => presentAllocationPlan(r, name)) };
  }

  /**
   * Popup "Phân màu cỡ cho chuyền" của một kế hoạch: chuyền trong phạm vi xem (sửa được hay không, SL đã xếp, SL đã giao), SL KHXH
   * theo màu cỡ của kế hoạch, phần giao của các chuyền đó. Phần giao của chuyền ngoài phạm vi xem chỉ có tổng theo màu cỡ
   * (`hiddenQty`, theo chính sách của cột Số lượng giao) để giao diện tính được phần còn lại.
   */
  async get(user: AuthUser, planId: number) {
    const scope = scopeOf(user);
    const plan = await this.lines.planRow(scope, planId);
    const [lines, editable, cells, policy] = await Promise.all([
      this.lines.planLines(scope, planId, 'view'),
      this.lines.planLines(scope, planId, 'update'),
      this.lines.planColorSizes(scope, planId),
      this.fields.levels(scope.access, RESOURCE),
    ]);
    const lineIds = lines.map((l) => l.Id);
    // Dòng giao 0 là đề xuất theo tỷ lệ của cách làm trước phase 5.13: không phải phần giao
    const rows = (await this.rows.listByParents(scope, lineIds, 'view')).filter((r) => r.AssignedQty > 0);
    const hidden = new Map((await this.lines.assignedOutside(scope, planId, lineIds)).map((h) => [cellKey(h.ColorName, h.SizeName), Number(h.Qty)]));
    const name = await this.lineNames(user);
    // Đơn vị tổng hợp chỉ đọc: không chuyền nào sửa được (máy chủ cũng chặn khi lưu)
    const canEdit = new Set(scope.isAggregate ? [] : editable.map((l) => l.Id));
    const assigned = new Map<number, number>();
    for (const r of rows) assigned.set(r.ShipmentPlanLineId, (assigned.get(r.ShipmentPlanLineId) ?? 0) + r.AssignedQty);
    return {
      ...presentAllocationPlan(plan, name),
      lines: lines.map((l) => ({
        id: l.Id,
        lineCode: l.LineCode,
        lineName: name(l.LineCode) ?? undefined,
        qty: l.Qty,
        avgOutput: l.AvgOutput,
        startDate: day(l.StartDate),
        endDate: day(l.EndDate),
        statusCode: l.StatusCode,
        assignedQty: assigned.get(l.Id) ?? 0,
        editable: canEdit.has(l.Id),
      })),
      colorSizes: cells.map((c) =>
        withDerived({ colorName: c.ColorName, sizeName: c.SizeName, qty: c.PlanQty }, { hiddenQty: derived(hidden.get(cellKey(c.ColorName, c.SizeName)) ?? 0, policy.levels.get('assignedQty')) }),
      ),
      rows: rows.map((r) => ({ id: r.Id, lineId: r.ShipmentPlanLineId, colorName: r.ColorName, sizeName: r.SizeName, assignedQty: r.AssignedQty })),
    };
  }

  /**
   * Lưu phân màu cỡ của một kế hoạch (phase 5.13): thay toàn bộ phần giao của các chuyền người dùng sửa được (vừa sửa được vừa
   * xem được, như Xếp chuyền); chuyền khác giữ nguyên và vẫn tính vào tổng. Luật: màu cỡ phải có trong kế hoạch; một chuyền một
   * màu cỡ một dòng; tổng giao của một màu cỡ trên mọi chuyền không vượt SL KHXH của nó; tổng giao của một chuyền không vượt SL
   * đã xếp cho chuyền đó (Q2). Khóa kế hoạch rồi mới đọc dòng dàn chuyền, phần giao: cùng thứ tự kế hoạch → dòng → màu cỡ với
   * Xếp chuyền và sửa kế hoạch xuất hàng.
   */
  async save(user: AuthUser, planId: number, dto: AllocationDto) {
    const scope = scopeOf(user);
    await this.lines.assertWritable(scope);
    // FieldPolicyInterceptor chỉ chặn khi body có assignedQty; `rows: []` (bỏ hết phần giao) không có, nên kiểm ở đây, trước khi
    // đọc kế hoạch (403 không cho dò Id kế hoạch)
    const level = (await this.fields.levels(scope.access, RESOURCE)).levels.get('assignedQty');
    if (level && level !== 'EDITABLE') throw Errors.fieldReadonly(['assignedQty'], ['Số lượng giao']);
    // Id kế hoạch từ client chỉ được dùng để khóa sau khi biết kế hoạch có chuyền người dùng sửa được (không thì 404 như không có)
    if (!(await this.lines.planLines(scope, planId, 'update')).length) throw Errors.notFound();
    // Thông báo vượt không nêu số khi người sửa không xem được số lượng (như Xếp chuyền, review lượt 3 P7)
    const blind = (await this.fields.unreadable(user, RESOURCE, ['qty'])).size > 0;
    const name = await this.lineNames(user);
    const log = await inTransaction(this.db, async (trx) => {
      await this.plans.lockBranchRow(scope, planId, trx);
      const visible = await this.lines.planLines(scope, planId, 'view', trx);
      const visibleIds = new Set(visible.map((l) => l.Id));
      const mine = (await this.lines.planLines(scope, planId, 'update', trx)).filter((l) => visibleIds.has(l.Id));
      if (!mine.length) throw Errors.notFound();
      const label = (l: PlanLineRow) => name(l.LineCode) ?? `thứ ${visible.findIndex((v) => v.Id === l.Id) + 1}`;
      const lineById = new Map(mine.map((l) => [l.Id, l]));
      const cells = new Map((await this.lines.planColorSizes(scope, planId, trx)).map((c) => [cellKey(c.ColorName, c.SizeName), c]));

      const next = new Map<string, NextCell>();
      const seen = new Set<string>();
      // Câu lỗi nêu chuyền, màu, cỡ: thứ tự gửi lên khác số thứ tự trên lưới (giao diện bỏ dòng trống, dòng 0, dòng khóa)
      for (const [i, r] of dto.rows.entries()) {
        const line = lineById.get(r.lineId);
        if (!line) throw invalid(`Màu ${r.colorName}, cỡ ${r.sizeName} được giao cho chuyền không thuộc kế hoạch này hoặc chuyền bạn không được phân màu cỡ.`);
        const ck = cellKey(r.colorName, r.sizeName);
        const cell = cells.get(ck);
        if (!cell) throw invalid(`Màu ${r.colorName}, cỡ ${r.sizeName} không có trong kế hoạch xuất hàng.`);
        const k = `${line.Id}\u0000${ck}`;
        if (seen.has(k)) throw invalid(`Chuyền ${label(line)}, màu ${cell.ColorName}, cỡ ${cell.SizeName} có hai dòng. Gộp thành một dòng.`);
        seen.add(k);
        if (r.assignedQty > 0) next.set(k, { line, cell, qty: r.assignedQty, sort: i });
      }

      // Tổng theo màu cỡ gồm phần của chuyền người dùng không sửa được (chỉ đọc tổng); màu cỡ người dùng không giao gì thì
      // không xét: dữ liệu cũ của chuyền khác lệch không chặn việc lưu phần của mình
      const others = new Map((await this.lines.assignedOutside(scope, planId, mine.map((l) => l.Id), trx)).map((o) => [cellKey(o.ColorName, o.SizeName), Number(o.Qty)]));
      const byCell = new Map<string, number>();
      const byLine = new Map<number, number>();
      for (const n of next.values()) {
        const ck = cellKey(n.cell.ColorName, n.cell.SizeName);
        byCell.set(ck, (byCell.get(ck) ?? 0) + n.qty);
        byLine.set(n.line.Id, (byLine.get(n.line.Id) ?? 0) + n.qty);
      }
      const errors: string[] = [];
      for (const [ck, mineQty] of byCell) {
        const cell = cells.get(ck)!;
        const other = others.get(ck) ?? 0;
        const total = mineQty + other;
        if (total <= cell.PlanQty) continue;
        const note = other ? ` (gồm ${other} ở chuyền khác)` : '';
        errors.push(blind ? `${cell.ColorName}/${cell.SizeName}` : `${cell.ColorName}/${cell.SizeName}: giao ${total}${note} > SL KH ${cell.PlanQty}`);
      }
      for (const line of mine) {
        const total = byLine.get(line.Id) ?? 0;
        if (total > line.Qty) errors.push(blind ? `Chuyền ${label(line)}` : `Chuyền ${label(line)}: giao ${total} > SL xếp chuyền ${line.Qty}`);
      }
      if (errors.length) throw invalid(`Số lượng giao vượt số lượng kế hoạch của màu cỡ hoặc số lượng đã xếp cho chuyền (${someOf(errors, 'mục')}).`, errors);

      // Dòng không đổi giữ nguyên; dòng đổi, dòng bỏ (cả dòng 0 của cách làm cũ) xóa rồi thêm lại theo lô: lưu cả bảng vài câu,
      // không một câu mỗi ô. Tên màu, cỡ ghi theo kế hoạch; PlanQty là bản chụp SL KHXH lúc lưu
      const current = await this.rows.listByParents(scope, [...lineById.keys()], 'update', trx);
      // Phần giao của các chuyền này theo mã hàng (cộng mọi kế hoạch) trước khi ghi: không giảm xuống dưới số BTP đã cấp (phase 5.15)
      const plan = await this.lines.planRow(scope, planId, 'view', trx);
      const supplyBefore = await this.supplyGuards.snapshot(trx, plan.BranchCode, plan.StyleCode, mine.map((l) => l.LineCode));
      const keep = new Set<string>();
      const had = new Set<string>();
      const drop: number[] = [];
      // Chuyền có phần giao đổi: thêm, bỏ, sửa số lượng giao. Dòng chỉ đổi thứ tự (phần giao các chuyền xen kẽ nhau theo
      // SortOrder) hay bản chụp SL KHXH thì vẫn ghi lại nhưng chuyền không tính là đổi; bỏ dòng 0 cũ cũng vậy
      const changed = new Set<number>();
      for (const c of current) {
        const k = `${c.ShipmentPlanLineId}\u0000${cellKey(c.ColorName, c.SizeName)}`;
        had.add(k);
        const n = next.get(k);
        const same = n && c.AssignedQty === n.qty && c.PlanQty === n.cell.PlanQty && c.SortOrder === n.sort && c.ColorName === n.cell.ColorName && c.SizeName === n.cell.SizeName;
        if (same) keep.add(k);
        else drop.push(c.Id);
        if (n ? c.AssignedQty !== n.qty : c.AssignedQty > 0) changed.add(c.ShipmentPlanLineId);
      }
      const insert = [...next]
        .filter(([k]) => !keep.has(k))
        .map(([k, n]) => {
          if (!had.has(k)) changed.add(n.line.Id);
          return { parentId: n.line.Id, values: { ColorName: n.cell.ColorName, SizeName: n.cell.SizeName, PlanQty: n.cell.PlanQty, AssignedQty: n.qty, SortOrder: n.sort } };
        });

      // Dòng dàn chuyền trước, phần giao sau: đúng thứ tự kế hoạch → dòng → màu cỡ. Trạng thái Chưa phân ↔ Đã phân màu cỡ theo phần
      // giao của chuyền (chỉ đổi giữa hai trạng thái này). Chuyền có phần giao đổi được ghi lại người, lúc sửa (ModifiedAt), để dàn
      // chuyền mô phỏng biết kế hoạch đã có người sửa, kể cả khi chỉ bớt phần giao
      for (const line of mine) {
        const flips = line.StatusCode === 'PLANNED' || line.StatusCode === 'ALLOCATED';
        const status = flips ? ((byLine.get(line.Id) ?? 0) > 0 ? 'ALLOCATED' : 'PLANNED') : line.StatusCode;
        if (status !== line.StatusCode || changed.has(line.Id)) await this.lines.update(scope, line.Id, { StatusCode: status }, trx);
      }
      await this.rows.removeMany(scope, drop, trx);
      await this.rows.insertMany(scope, insert, trx);
      await this.supplyGuards.assertCovered(trx, plan.BranchCode, plan.StyleCode, supplyBefore, { lineName: (c) => name(c) ?? 'Chuyền', showQty: !blind });
      const show = (lineId: number, colorName: string, sizeName: string, assignedQty: number) => ({ lineId, lineCode: lineById.get(lineId)!.LineCode, colorName, sizeName, assignedQty });
      return {
        before: current.filter((c) => c.AssignedQty > 0).map((c) => show(c.ShipmentPlanLineId, c.ColorName, c.SizeName, c.AssignedQty)),
        after: [...next.values()].sort((a, b) => a.sort - b.sort).map((n) => show(n.line.Id, n.cell.ColorName, n.cell.SizeName, n.qty)),
      };
    });
    await this.audit.log({ userId: user.userId, username: user.username, branchCode: user.branchCode, entityType: 'ShipmentPlan', entityId: planId, actionCode: 'COLOR_SIZE_ALLOCATE', oldValue: log.before, newValue: log.after, ip: user.ip });
    return this.get(user, planId);
  }

  async export(user: AuthUser, query: OrderListQuery) {
    const q = await readableQuery(this.fields, user, RESOURCE, query);
    const rows = await this.lines.planAll(scopeOf(user), { sort: await this.fields.safeSort(user, RESOURCE, q.sort, DEFAULT_SORT), where: await this.where(user, q), limit: EXPORT_MAX });
    if (rows.length > EXPORT_MAX) throw invalid(`Xuất tối đa ${EXPORT_MAX.toLocaleString('vi-VN')} kế hoạch một lần. Lọc bớt rồi xuất lại.`);
    const name = await this.lineNames(user);
    const items = rows.map((r) => {
      const o = presentAllocationPlan(r, name);
      return { ...o, lineText: (o.lineName ?? o.lineCode).join(', '), avgOutputText: o.avgOutput.join(', '), statusText: STATUS_LABEL[o.statusCode] };
    });
    return this.exporter.csv(user, RESOURCE, EXPORT_COLUMNS, await this.catalogs.withBranchNames(items), `phan-bo-mau-co-${user.branchCode}.csv`);
  }
}
