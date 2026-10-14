import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type RawBuilder, type SqlBool } from 'kysely';
import { BaseRepository, ChildRepository, type DataAction, type ListOptions, type Page, type Scope } from '../../platform/data/base.repository';
import { Errors } from '../../common/app.exception';
import { newestFirst, valueExpr, valueSearch, type FilterColumn, type FilterSpec } from '../../platform/data/column-filter';
import { ResourceRegistry } from '../../platform/data/resource-registry';
import { ORDER_DB } from './order.db';
import { escapeLike } from './order.util';
import type {
  OrderDb,
  Row,
  SalesOrderPoColorSizeTable,
  SalesOrderPoTable,
  SalesOrderTable,
  ShipmentPlanColorSizeTable,
  ShipmentPlanLineColorSizeTable,
  ShipmentPlanLineTable,
  ShipmentPlanPoTable,
  ShipmentPlanTable,
} from './order.types';

export type SalesOrderRow = Row<SalesOrderTable>;
export type SalesOrderPoRow = Row<SalesOrderPoTable>;
export type PoColorSizeRow = Row<SalesOrderPoColorSizeTable>;
export type ShipmentPlanRow = Row<ShipmentPlanTable>;
export type PlanColorSizeRow = Row<ShipmentPlanColorSizeTable>;
export type PlanPoRow = Row<ShipmentPlanPoTable>;
export type PlanLineRow = Row<ShipmentPlanLineTable>;
export type LineColorSizeRow = Row<ShipmentPlanLineColorSizeTable>;
export type LinePlanListRow = ShipmentPlanRow & { ScheduledQty: number; StartDate: Date | null; EndDate: Date | null; LineCount: number };
type Where = NonNullable<ListOptions['where']>;
/** Tổng SL giao theo màu cỡ (chỉ số tổng, không có dòng nào) */
export type AssignedByColorSize = { ColorName: string; SizeName: string; Qty: number };

/**
 * Tổng SL giao theo màu cỡ của các dòng dàn chuyền (bí danh l) của một kế hoạch, chưa lọc ĐVCS: repository gọi ghép
 * `branchOnly(…, 'l')`. Dòng giao 0 (đề xuất theo tỷ lệ của cách làm trước phase 5.13) không tính.
 */
const assignedByColorSizeQuery = (db: Kysely<any>, planId: number) =>
  db
    .selectFrom('ShipmentPlanLineColorSize as a')
    .innerJoin('ShipmentPlanLine as l', 'l.Id', 'a.ShipmentPlanLineId')
    .select(['a.ColorName', 'a.SizeName', sql<number>`SUM(a.AssignedQty)`.as('Qty')])
    .where('l.ShipmentPlanId', '=', planId)
    .where('a.AssignedQty', '>', 0)
    .groupBy(['a.ColorName', 'a.SizeName']);

// ---------- Thông tin đơn hàng (order.allocation) ----------

/**
 * Đơn hàng lấy hết từ BRAVO, dùng chung toàn công ty (SHARED, ADR 0013): BranchCode là Chi nhánh FOB, đơn nhập tay đóng dấu
 * ĐVCS của phiên. Popup Chọn mã hàng của kế hoạch xuất hàng lọc theo nhà máy SX thuộc ĐVCS của phiên (cột ProductionFactoryCode).
 */
@Injectable()
export class SalesOrderRepository extends BaseRepository<SalesOrderRow> {
  protected readonly table = 'SalesOrder';
  protected readonly resource = 'order.allocation';
  protected readonly originBranch = true;
  protected readonly productionFactoryColumn = 'ProductionFactoryCode';
  protected readonly searchColumns = ['OrderNo', 'StyleCode', 'CustomerName', 'ProductName'];
  protected readonly sortable = ['Id', 'OrderNo', 'CustomerName', 'StyleCode', 'Season', 'Qty', 'ShipDate', 'SyncedAt', 'StatusCode', 'BranchCode', 'UnitPrice', 'Amount', 'CreatedAt'];
  protected readonly defaultSort = 'CreatedAt:desc';

  constructor(@Inject(ORDER_DB) db: OrderDb, registry: ResourceRegistry) {
    super(db, registry);
  }

  /** Giá trị khác nhau để lọc (khách hàng, mùa), trong phạm vi người dùng được xem. */
  async distinct(scope: Scope, column: 'CustomerName' | 'Season' | 'StyleCode' | 'OrderType'): Promise<string[]> {
    const qb = await this.scoped(this.db.selectFrom('SalesOrder').select(column).distinct().where(column, 'is not', null), scope);
    return (await qb.orderBy(column).execute()).map((r: any) => r[column]);
  }
}

// ---------- Cập nhật tỷ lệ cắt (order.po) ----------

/** Chi nhánh FOB (ĐVCS nguồn) của đơn hàng chứa PO: PO nhập tay mang ĐVCS của người nhập, có thể khác ĐVCS của đơn */
export const poOrderBranchExpr = sql<string>`(SELECT o.BranchCode FROM dbo.SalesOrder o WHERE o.Id = SalesOrderPo.SalesOrderId)`;
/** 1 khi PO nằm trong kế hoạch xuất hàng nào đó (mọi ĐVCS): không xóa được */
export const poInPlanExpr = sql<number>`CASE WHEN EXISTS (SELECT 1 FROM dbo.ShipmentPlanPo spp WHERE spp.SalesOrderPoId = SalesOrderPo.Id) THEN 1 ELSE 0 END`;

/**
 * PO của đơn hàng: dùng chung như đơn hàng (ADR 0013); PO nhập tay đóng dấu ĐVCS của phiên. ĐVCS đưa PO vào kế hoạch xuất
 * hàng của mình thì sửa được tỷ lệ cắt của PO đó như ĐVCS nguồn (ADR 0013 mục 11).
 */
@Injectable()
export class SalesOrderPoRepository extends BaseRepository<SalesOrderPoRow> {
  protected readonly table = 'SalesOrderPo';
  protected readonly resource = 'order.po';
  protected readonly originBranch = true;
  protected readonly usedBy = { table: 'ShipmentPlanPo', column: 'SalesOrderPoId' };
  protected readonly searchColumns = ['PoCode', 'PoNumber', 'StyleCode', 'CustomerName'];
  protected readonly sortable = ['Id', 'PoCode', 'PoNumber', 'Qty', 'ShipDate', 'SyncedAt', 'StatusCode', 'CreatedAt'];
  protected readonly defaultSort = 'CreatedAt:desc';

  constructor(@Inject(ORDER_DB) db: OrderDb, registry: ResourceRegistry) {
    super(db, registry);
  }

  /**
   * Danh sách mã hàng của màn tỷ lệ cắt: gom PO theo đơn hàng (một dòng mỗi đơn, kể cả khi PO nhập tay mang ĐVCS khác ĐVCS
   * của đơn), trong phạm vi người dùng, có phân trang. Mã có PO mới tạo gần nhất lên đầu. `where` là điều kiện trên dòng PO
   * (trước khi gom), do service dựng. Chi nhánh là Chi nhánh FOB của đơn hàng.
   */
  async styles(scope: Scope, opts: { page: number; pageSize: number; where: NonNullable<ListOptions['where']> }) {
    let qb: any = this.db
      .selectFrom('SalesOrderPo')
      .select([
        'SalesOrderId',
        sql<string>`MAX(CustomerName)`.as('CustomerName'),
        sql<string>`MAX(StyleCode)`.as('StyleCode'),
        poOrderBranchExpr.as('BranchCode'),
        sql<number>`COUNT(*)`.as('PoCount'),
        sql<number>`SUM(CASE WHEN StatusCode = 'CONFIRMED' THEN 1 ELSE 0 END)`.as('ConfirmedCount'),
        sql<number>`SUM(Qty)`.as('Qty'),
        sql<Date>`MIN(ShipDate)`.as('ShipDate'),
        sql<Date>`MAX(CreatedAt)`.as('CreatedAt'),
      ])
      .groupBy('SalesOrderId');
    qb = opts.where(await this.scoped(qb, scope));
    const total = await this.db.selectFrom(qb.as('g')).select(sql<number>`COUNT(*)`.as('n')).executeTakeFirstOrThrow();
    const pageSize = Math.min(Math.max(1, Math.trunc(opts.pageSize) || 1), 200);
    const page = Math.max(1, Math.trunc(opts.page) || 1);
    const items = (await qb
      .orderBy(sql`MAX(CreatedAt)`, 'desc')
      .orderBy('SalesOrderId', 'desc')
      .offset((page - 1) * pageSize)
      .fetch(pageSize)
      .execute()) as {
      SalesOrderId: number;
      CustomerName: string;
      StyleCode: string;
      BranchCode: string;
      PoCount: number;
      ConfirmedCount: number;
      Qty: number;
      ShipDate: Date;
      CreatedAt: Date;
    }[];
    return { items, total: Number((total as { n: number }).n), page, pageSize };
  }

  /** PO đã nằm trong kế hoạch xuất hàng thì không xóa được (khóa ngoại cũng chặn, đây để báo lỗi dễ hiểu). */
  async usedInPlans(scope: Scope, poId: number, db: Kysely<any> = this.db): Promise<boolean> {
    const qb = await this.scoped(db.selectFrom('SalesOrderPo').select('Id').where('Id', '=', poId), scope, 'delete');
    const row = await qb
      .where(sql<boolean>`EXISTS (SELECT 1 FROM dbo.ShipmentPlanPo spp WHERE spp.SalesOrderPoId = SalesOrderPo.Id)`)
      .executeTakeFirst();
    return !!row;
  }
}

@Injectable()
export class PoColorSizeRepository extends ChildRepository<PoColorSizeRow> {
  protected readonly table = 'SalesOrderPoColorSize';
  protected readonly parentKey = 'SalesOrderPoId';

  constructor(@Inject(ORDER_DB) db: OrderDb, parent: SalesOrderPoRepository) {
    super(db, parent);
  }
}

// ---------- Kế hoạch xuất hàng (order.shipment) ----------

@Injectable()
export class ShipmentPlanRepository extends BaseRepository<ShipmentPlanRow> {
  protected readonly table = 'ShipmentPlan';
  protected readonly resource = 'order.shipment';
  protected readonly searchColumns = ['PlanNo', 'StyleCode', 'CustomerName', 'PoBuyDate', 'ProductName'];
  protected readonly sortable = ['Id', 'PlanNo', 'CustomerName', 'StyleCode', 'PoBuyDate', 'PlanQty', 'ShipDate', 'SyncedAt', 'StatusCode', 'CreatedAt'];
  protected readonly defaultSort = 'CreatedAt:desc';

  constructor(@Inject(ORDER_DB) db: OrderDb, registry: ResourceRegistry) {
    super(db, registry);
  }

  /**
   * Số lượng đã lập kế hoạch theo đơn hàng và màu cỡ (để tính "SL đã tạo KHXH", "SL còn lại").
   * Tính trên mọi kế hoạch của đơn hàng ở mọi ĐVCS, không theo phạm vi người xem: đơn hàng dùng chung toàn công ty, kế hoạch
   * lập ở ĐVCS nào cũng trừ vào cùng số lượng gốc (ADR 0013), và người chỉ thấy kế hoạch mình tạo cũng không được lập vượt
   * (review 5.1 #7). Chỉ trả tổng số, không trả dòng kế hoạch nào.
   */
  async plannedBySalesOrder(salesOrderIds: number[], excludePlanId?: number, db: Kysely<any> = this.db) {
    if (salesOrderIds.length === 0) return [];
    let qb: any = db
      .selectFrom('ShipmentPlanColorSize as cs')
      .innerJoin('ShipmentPlan as p', 'p.Id', 'cs.ShipmentPlanId')
      .select(['p.SalesOrderId', 'cs.ColorName', 'cs.SizeName', sql<number>`SUM(cs.PlanQty)`.as('PlanQty')])
      .where('p.SalesOrderId', 'in', salesOrderIds)
      .groupBy(['p.SalesOrderId', 'cs.ColorName', 'cs.SizeName']);
    if (excludePlanId) qb = qb.where('p.Id', '<>', excludePlanId);
    return (await qb.execute()) as { SalesOrderId: number; ColorName: string; SizeName: string; PlanQty: number }[];
  }

  /** Tổng số lượng đã xếp chuyền của một kế hoạch trong phạm vi sửa. */
  async scheduledQty(scope: Scope, planId: number, db: Kysely<any> = this.db): Promise<number> {
    const qb = await this.scoped(
      db.selectFrom('ShipmentPlan').select(sql<number>`(SELECT COALESCE(SUM(l.Qty), 0) FROM dbo.ShipmentPlanLine l WHERE l.ShipmentPlanId = ShipmentPlan.Id)`.as('n')).where('Id', '=', planId),
      scope,
      'update',
    );
    return Number(((await qb.executeTakeFirst()) as { n: number } | undefined)?.n ?? 0);
  }

  async hasSchedule(scope: Scope, planId: number, db: Kysely<any> = this.db): Promise<boolean> {
    const qb = await this.scoped(db.selectFrom('ShipmentPlan').select('Id').where('Id', '=', planId), scope);
    return !!(await qb.where(sql<boolean>`EXISTS (SELECT 1 FROM dbo.ShipmentPlanLine l WHERE l.ShipmentPlanId = ShipmentPlan.Id)`).executeTakeFirst());
  }

  /**
   * Tổng SL đã giao (Phân bổ màu cỡ) theo màu cỡ của mọi chuyền của kế hoạch: sửa SL KHXH không xuống dưới số này. Chỉ lọc
   * ĐVCS, không theo phạm vi người sửa (người sửa kế hoạch không cần quyền Phân bổ màu cỡ). Chỉ trả tổng.
   */
  async assignedByColorSize(scope: Scope, planId: number, db: Kysely<any> = this.db): Promise<AssignedByColorSize[]> {
    return (await (await this.branchOnly(assignedByColorSizeQuery(db, planId), scope, 'l')).execute()) as AssignedByColorSize[];
  }
}

@Injectable()
export class PlanColorSizeRepository extends ChildRepository<PlanColorSizeRow> {
  protected readonly table = 'ShipmentPlanColorSize';
  protected readonly parentKey = 'ShipmentPlanId';

  constructor(@Inject(ORDER_DB) db: OrderDb, parent: ShipmentPlanRepository) {
    super(db, parent);
  }
}

@Injectable()
export class PlanPoRepository extends ChildRepository<PlanPoRow> {
  protected readonly table = 'ShipmentPlanPo';
  protected readonly parentKey = 'ShipmentPlanId';
  protected readonly orderBy = ['Id'];

  constructor(@Inject(ORDER_DB) db: OrderDb, parent: ShipmentPlanRepository) {
    super(db, parent);
  }
}

// ---------- Xếp chuyền (order.lineplan): cùng bảng ShipmentPlan, quyền và cột riêng ----------

@Injectable()
export class LinePlanRepository extends BaseRepository<ShipmentPlanRow> {
  protected readonly table = 'ShipmentPlan';
  protected readonly resource = 'order.lineplan';
  protected readonly searchColumns = ['PlanNo', 'StyleCode', 'CustomerName', 'PoBuyDate'];
  protected readonly sortable = ['Id', 'PlanNo', 'CustomerName', 'StyleCode', 'PlanQty', 'ShipDate', 'SyncedAt', 'StatusCode', 'Revenue', 'CreatedAt'];
  protected readonly defaultSort = 'CreatedAt:desc';

  constructor(@Inject(ORDER_DB) db: OrderDb, registry: ResourceRegistry) {
    super(db, registry);
  }

  /** Danh sách kế hoạch kèm tổng đã xếp chuyền, ngày bắt đầu, kết thúc sản xuất (từ dòng dàn chuyền của chính kế hoạch). */
  listWithSchedule(scope: Scope, opts: ListOptions, action: DataAction = 'view'): Promise<Page<LinePlanListRow>> {
    return this.list(scope, { ...opts, select: () => LINE_PLAN_AGGREGATES }, action) as Promise<Page<LinePlanListRow>>;
  }

  listAllWithSchedule(scope: Scope, opts: Omit<ListOptions, 'page' | 'pageSize'>): Promise<LinePlanListRow[]> {
    return this.listAll(scope, { ...opts, select: () => LINE_PLAN_AGGREGATES }) as Promise<LinePlanListRow[]>;
  }
}

const LINE_PLAN_AGGREGATES = [
  sql<number>`(SELECT COALESCE(SUM(l.Qty), 0) FROM dbo.ShipmentPlanLine l WHERE l.ShipmentPlanId = ShipmentPlan.Id)`.as('ScheduledQty'),
  sql<Date | null>`(SELECT MIN(l.StartDate) FROM dbo.ShipmentPlanLine l WHERE l.ShipmentPlanId = ShipmentPlan.Id)`.as('StartDate'),
  sql<Date | null>`(SELECT MAX(l.EndDate) FROM dbo.ShipmentPlanLine l WHERE l.ShipmentPlanId = ShipmentPlan.Id)`.as('EndDate'),
  sql<number>`(SELECT COUNT(*) FROM dbo.ShipmentPlanLine l WHERE l.ShipmentPlanId = ShipmentPlan.Id)`.as('LineCount'),
];

@Injectable()
export class LinePlanLineRepository extends ChildRepository<PlanLineRow> {
  protected readonly table = 'ShipmentPlanLine';
  protected readonly parentKey = 'ShipmentPlanId';
  // Dòng dàn chuyền có cột chuyền: phạm vi chuyền của người xem áp cả ở màn Xếp chuyền (review 5.1 #5)
  protected readonly scopeColumns = { LINE: 'LineCode' };

  constructor(@Inject(ORDER_DB) db: OrderDb, parent: LinePlanRepository) {
    super(db, parent);
  }

  /**
   * Tổng số lượng và số dòng dàn chuyền của kế hoạch, trừ các dòng đã cho. Chỉ lọc nhà máy, không theo phạm vi chuyền:
   * người chỉ sửa được chuyền của mình vẫn không xếp vượt SL kế hoạch (review 5.1 lượt 2 N1). Chỉ trả số tổng.
   */
  async totalExcept(scope: Scope, planId: number, excludeIds: number[], db: Kysely<any> = this.db): Promise<{ qty: number; count: number }> {
    let qb: any = db
      .selectFrom('ShipmentPlanLine')
      .select([sql<number>`COALESCE(SUM(Qty), 0)`.as('Qty'), sql<number>`COUNT(*)`.as('N')])
      .where('ShipmentPlanId', '=', planId);
    qb = await this.branchOnly(qb, scope);
    if (excludeIds.length) qb = qb.where('Id', 'not in', excludeIds);
    const row = (await qb.executeTakeFirst()) as { Qty: number; N: number } | undefined;
    return { qty: Number(row?.Qty ?? 0), count: Number(row?.N ?? 0) };
  }

  /** Dòng dàn chuyền giao với khoảng ngày, cho bảng dàn chuyền (Gantt). */
  async inRange(scope: Scope, from: string, to: string, action: DataAction = 'view') {
    const ids = await this.scopedIds(scope, action);
    const rows = await this.db
      .selectFrom('ShipmentPlanLine as l')
      .innerJoin('ShipmentPlan as p', 'p.Id', 'l.ShipmentPlanId')
      .select(['l.Id', 'l.ShipmentPlanId', 'l.LineCode', 'l.Qty', 'l.AvgOutput', 'l.StartDate', 'l.EndDate', 'l.StatusCode', 'p.PlanNo', 'p.CustomerName', 'p.StyleCode', 'p.PoBuyDate', 'p.ShipDate', 'p.BranchCode'])
      .where('l.Id', 'in', ids)
      .where('l.StartDate', '<=', to)
      .where('l.EndDate', '>=', from)
      .orderBy('l.LineCode')
      .orderBy('l.StartDate')
      .execute();
    return rows;
  }

  /**
   * Mọi dòng dàn chuyền của một nhà máy (null: mọi nhà máy), cho module May chép sang MES_Sewing (ADR 0009).
   * Chỉ lọc nhà máy, không theo phạm vi người dùng: kết quả không trả thẳng cho người dùng, chỉ đi qua repository
   * của module May, nơi lọc nhà máy và chuyền theo quyền order.prep. Mã nhà máy lấy từ phiên do server cấp.
   */
  async feed(branchCode: string | null) {
    let qb = this.db
      .selectFrom('ShipmentPlanLine as l')
      .innerJoin('ShipmentPlan as p', 'p.Id', 'l.ShipmentPlanId')
      .select(['l.Id', 'l.ShipmentPlanId', 'l.LineCode', 'l.Qty', 'l.StartDate', 'l.BranchCode', 'l.CreatedAt', 'p.PlanNo', 'p.CustomerName', 'p.StyleCode', 'p.ProductName']);
    if (branchCode !== null) qb = qb.where('l.BranchCode', '=', branchCode);
    return qb.execute();
  }

  /**
   * Dấu phiên bản của các dòng feed() (số dòng + checksum các cột được chép): module May chỉ chép lại khi dấu đổi.
   * Cùng cách lọc nhà máy như feed(); không trả dữ liệu dòng nào.
   */
  async feedVersion(branchCode: string | null): Promise<string> {
    let qb = this.db
      .selectFrom('ShipmentPlanLine as l')
      .innerJoin('ShipmentPlan as p', 'p.Id', 'l.ShipmentPlanId')
      .select([
        sql<number>`COUNT(*)`.as('N'),
        // BINARY_CHECKSUM: đổi chỉ chữ hoa, chữ thường cũng đổi dấu (CHECKSUM theo collation không phân biệt hoa thường)
        sql<number>`CHECKSUM_AGG(BINARY_CHECKSUM(l.Id, l.ShipmentPlanId, l.LineCode, l.Qty, l.StartDate, l.BranchCode, l.CreatedAt, p.PlanNo, p.CustomerName, p.StyleCode, p.ProductName))`.as('C'),
      ]);
    if (branchCode !== null) qb = qb.where('l.BranchCode', '=', branchCode);
    const r = await qb.executeTakeFirst();
    return `${r?.N ?? 0}:${r?.C ?? 0}`;
  }
}

@Injectable()
export class LinePlanAllocationRepository extends ChildRepository<LineColorSizeRow> {
  protected readonly table = 'ShipmentPlanLineColorSize';
  protected readonly parentKey = 'ShipmentPlanLineId';

  constructor(@Inject(ORDER_DB) db: OrderDb, parent: LinePlanLineRepository) {
    super(db, parent);
  }
}

// ---------- Phân bổ màu cỡ (order.colorsize): bảng nguồn là dòng dàn chuyền, màn gom một dòng mỗi kế hoạch ----------

/**
 * Trạng thái phân màu cỡ của kế hoạch: tổng giao mọi chuyền so với SL kế hoạch (phase 5.13 Q4). Mã đủ là FULL, khác ALLOCATED của
 * dòng dàn chuyền (đã có phần giao), vì hai mã cùng nằm trong một kết quả popup
 */
export type AllocationStatus = 'PLANNED' | 'PARTIAL' | 'FULL';

/** Một dòng của màn Phân bổ màu cỡ: một kế hoạch có dòng dàn chuyền trong phạm vi (LineAllocationRepository.planQuery) */
export interface AllocationPlanRow {
  Id: number;
  PlanNo: string;
  CustomerName: string;
  StyleCode: string;
  PoBuyDate: string;
  BranchCode: string;
  ShipDate: Date;
  PlanQty: number;
  /** Mã chuyền của các dòng dàn chuyền trong phạm vi, nối bằng dấu phẩy theo thứ tự dàn chuyền */
  LineCodes: string;
  /** NSBQ của các dòng đó, cùng thứ tự */
  AvgOutputs: string;
  StartDate: Date;
  EndDate: Date;
  /** Lúc lưu dòng dàn chuyền đầu tiên (trong phạm vi): lúc kế hoạch hiện ở màn này */
  CreatedAt: Date;
  /** Tổng giao của mọi chuyền của kế hoạch */
  AssignedQty: number;
  StatusCode: AllocationStatus;
}

const allocationStatus = sql<AllocationStatus>`CASE WHEN r.AssignedQty <= 0 THEN 'PLANNED' WHEN r.AssignedQty < r.PlanQty THEN 'PARTIAL' ELSE 'FULL' END`;

/**
 * Cột lọc được theo giá trị trên bảng gom (bí danh r). Chuyền may có mặt để nằm trong danh sách trắng: lọc theo từng chuyền
 * bằng `hasLines` (chuỗi đã nối không so bằng được), giá trị của popup lọc bằng `planLineValues`. NSBQ là chuỗi liệt kê theo
 * chuyền (phase 5.13 Q3) nên không lọc, không sắp xếp.
 */
export const ALLOCATION_FILTER: FilterSpec = {
  customerName: { expr: 'r.CustomerName', kind: 'text' },
  styleCode: { expr: 'r.StyleCode', kind: 'text' },
  poBuyDate: { expr: 'r.PoBuyDate', kind: 'text' },
  branchCode: { expr: 'r.BranchCode', kind: 'text' },
  lineCode: { expr: 'r.LineCodes', kind: 'text' },
  startDate: { expr: 'r.StartDate', kind: 'date' },
  endDate: { expr: 'r.EndDate', kind: 'date' },
  shipDate: { expr: 'r.ShipDate', kind: 'date' },
  qty: { expr: 'r.PlanQty', kind: 'number' },
  assignedQty: { expr: 'r.AssignedQty', kind: 'number' },
  statusCode: { expr: allocationStatus, kind: 'text' },
  createdAt: { expr: 'r.CreatedAt', kind: 'datetime' },
};

/** Sắp xếp theo trường JSON của màn: danh sách trắng, không nhận tên cột từ client */
const ALLOCATION_SORT: Record<string, string | RawBuilder<unknown>> = {
  customerName: 'r.CustomerName',
  styleCode: 'r.StyleCode',
  lineCode: 'r.LineCodes',
  startDate: 'r.StartDate',
  endDate: 'r.EndDate',
  shipDate: 'r.ShipDate',
  qty: 'r.PlanQty',
  assignedQty: 'r.AssignedQty',
  statusCode: allocationStatus,
  createdAt: 'r.CreatedAt',
};

/**
 * "trường:chiều" theo danh sách trắng (trường lạ: mới tạo lên trước); thêm Id cuối để phân trang ổn định. any: câu trên bảng dẫn
 * xuất r dựng lúc chạy, Kysely không suy được kiểu cột của bảng dẫn xuất lồng hai tầng
 */
function allocationOrder(qb: any, sort: string) {
  const [field, dir] = sort.split(':');
  const known = Object.prototype.hasOwnProperty.call(ALLOCATION_SORT, field) ? ALLOCATION_SORT[field] : undefined;
  const expr = known ?? ALLOCATION_SORT.createdAt;
  return qb.orderBy(typeof expr === 'string' ? sql.ref(expr) : expr, known && dir === 'asc' ? 'asc' : 'desc').orderBy('r.Id', 'desc');
}

/**
 * Kế hoạch có ít nhất một chuyền đã chọn trong số chuyền của dòng gom: `in` là các mã được tích, `notIn` là các mã bị bỏ tích (còn
 * ít nhất một chuyền không bị bỏ). Hai cách chọn cùng một tập chuyền ở popup lọc cho cùng kết quả. Chuỗi mã đã nối tách bằng
 * STRING_SPLIT (MES_Order đòi compatibility level ≥ 130, migration 0007); mã chuyền theo mẫu ^[A-Z0-9-]{1,20}$ (ScheduleLineDto)
 * nên không chứa dấu phẩy.
 */
export function hasLines(codes: string[], mode: 'in' | 'notIn' = 'in'): Where {
  const values = codes.length ? sql.join(codes) : null;
  const hit = mode === 'in' ? (values ? sql`s.value IN (${values})` : sql`1 = 0`) : values ? sql`s.value NOT IN (${values})` : sql`1 = 1`;
  return (qb) => qb.where(sql<SqlBool>`EXISTS (SELECT 1 FROM STRING_SPLIT(r.LineCodes, ',') s WHERE ${hit})`);
}

const MAX_PAGE_SIZE = 200;
const MAX_VALUES = 1000;

@Injectable()
export class LineAllocationRepository extends BaseRepository<PlanLineRow> {
  protected readonly table = 'ShipmentPlanLine';
  protected readonly resource = 'order.colorsize';

  constructor(@Inject(ORDER_DB) db: OrderDb, registry: ResourceRegistry) {
    super(db, registry);
  }

  /**
   * Bảng gom một dòng mỗi kế hoạch có dòng dàn chuyền trong phạm vi của hành động (bí danh r). Phạm vi lọc trên dòng dàn chuyền
   * trước khi gom (như SalesOrderPoRepository.styles): chuyền, NSBQ (nối theo thứ tự dàn chuyền), ngày vào chuyền sớm nhất, kết
   * thúc muộn nhất chỉ tính các dòng đó. Cột của kế hoạch đọc theo khóa như cột kế hoạch cha của dòng dàn chuyền; dòng dàn chuyền
   * mang ĐVCS của kế hoạch (khóa ngoại ghép) nên kế hoạch cũng trong ĐVCS. Tổng giao tính mọi chuyền của kế hoạch, chỉ trả tổng
   * (như LinePlanLineRepository.totalExcept): kế hoạch phân đủ hay chưa không tùy phạm vi người xem. Trả any như allocationOrder.
   */
  private async planQuery(scope: Scope, action: DataAction, db: Kysely<any> = this.db): Promise<any> {
    const lines = await this.scoped(db.selectFrom('ShipmentPlanLine as l'), scope, action, 'l');
    const grouped = lines
      .select([
        'l.ShipmentPlanId',
        sql<string>`STRING_AGG(l.LineCode, ',') WITHIN GROUP (ORDER BY l.SortOrder, l.Id)`.as('LineCodes'),
        sql<string>`STRING_AGG(CAST(l.AvgOutput AS VARCHAR(12)), ',') WITHIN GROUP (ORDER BY l.SortOrder, l.Id)`.as('AvgOutputs'),
        sql<Date>`MIN(l.StartDate)`.as('StartDate'),
        sql<Date>`MAX(l.EndDate)`.as('EndDate'),
        sql<Date>`MIN(l.CreatedAt)`.as('CreatedAt'),
      ])
      .groupBy('l.ShipmentPlanId');
    const base = db
      .selectFrom(grouped.as('g'))
      .innerJoin('ShipmentPlan as p', 'p.Id', 'g.ShipmentPlanId')
      .select([
        'p.Id',
        'p.PlanNo',
        'p.CustomerName',
        'p.StyleCode',
        'p.PoBuyDate',
        'p.BranchCode',
        'p.ShipDate',
        'p.PlanQty',
        'g.LineCodes',
        'g.AvgOutputs',
        'g.StartDate',
        'g.EndDate',
        'g.CreatedAt',
        sql<number>`(SELECT COALESCE(SUM(a.AssignedQty), 0) FROM dbo.ShipmentPlanLineColorSize a INNER JOIN dbo.ShipmentPlanLine x ON x.Id = a.ShipmentPlanLineId WHERE x.ShipmentPlanId = p.Id)`.as('AssignedQty'),
      ]);
    return db.selectFrom(base.as('r')).selectAll('r').select(allocationStatus.as('StatusCode'));
  }

  /** Trang của màn Phân bổ màu cỡ. `sort`: "trường:chiều" (trường JSON, đã qua chính sách cột); `where`: lọc trên bảng gom */
  async planPage(scope: Scope, opts: { page: number; pageSize: number; sort: string; where?: Where }): Promise<Page<AllocationPlanRow>> {
    let qb = await this.planQuery(scope, 'view');
    if (opts.where) qb = opts.where(qb);
    const total = (await qb.clearSelect().select(sql<number>`COUNT(*)`.as('n')).executeTakeFirstOrThrow()) as { n: number };
    const pageSize = Math.min(Math.max(1, Math.trunc(opts.pageSize) || 1), MAX_PAGE_SIZE);
    const page = Math.max(1, Math.trunc(opts.page) || 1);
    const items = (await allocationOrder(qb, opts.sort)
      .offset((page - 1) * pageSize)
      .fetch(pageSize)
      .execute()) as AllocationPlanRow[];
    return { items, total: Number(total.n), page, pageSize };
  }

  /** Mọi dòng khớp lọc cho xuất file (phạm vi của quyền export), lấy tối đa `limit` + 1 dòng để bên gọi biết là vượt */
  async planAll(scope: Scope, opts: { sort: string; where?: Where; limit: number }): Promise<AllocationPlanRow[]> {
    let qb = await this.planQuery(scope, 'export');
    if (opts.where) qb = opts.where(qb);
    return (await allocationOrder(qb, opts.sort).offset(0).fetch(opts.limit + 1).execute()) as AllocationPlanRow[];
  }

  /** Một kế hoạch của màn; không có chuyền nào trong phạm vi của hành động thì 404 như không tồn tại */
  async planRow(scope: Scope, planId: number, action: DataAction = 'view', db: Kysely<any> = this.db): Promise<AllocationPlanRow> {
    const row = await (await this.planQuery(scope, action, db)).where('r.Id', '=', planId).executeTakeFirst();
    if (!row) throw Errors.notFound();
    return row as AllocationPlanRow;
  }

  /** Giá trị khác nhau của một cột của bảng gom cho popup lọc theo cột, theo phạm vi xem và các bộ lọc đang áp */
  async planValues(scope: Scope, col: FilterColumn, opts: { where?: Where; search?: string; limit: number }): Promise<{ rows: unknown[]; truncated: boolean }> {
    let qb = await this.planQuery(scope, 'view');
    if (opts.where) qb = opts.where(qb);
    const search = valueSearch(col, opts.search);
    if (search) qb = qb.where(search);
    const limit = Math.min(Math.max(1, Math.trunc(opts.limit) || 1), MAX_VALUES);
    const rows = (await qb
      .clearSelect()
      .select(valueExpr(col).as('v'))
      .distinct()
      .orderBy('v', newestFirst(col) ? 'desc' : 'asc')
      .offset(0)
      .fetch(limit + 1)
      .execute()) as { v: unknown }[];
    return { rows: rows.slice(0, limit).map((r) => r.v), truncated: rows.length > limit };
  }

  /** Mã từng chuyền (không phải chuỗi đã nối) trong phạm vi xem, của các kế hoạch khớp bộ lọc: giá trị popup lọc cột Chuyền may */
  async planLineValues(scope: Scope, opts: { where?: Where; search?: string; limit: number }): Promise<{ rows: unknown[]; truncated: boolean }> {
    let plans = await this.planQuery(scope, 'view');
    if (opts.where) plans = opts.where(plans);
    let qb = await this.scoped(this.db.selectFrom('ShipmentPlanLine as l'), scope, 'view', 'l');
    qb = qb.where('l.ShipmentPlanId', 'in', plans.clearSelect().select('r.Id'));
    const search = opts.search?.trim();
    if (search) qb = qb.where('l.LineCode', 'like', escapeLike(search));
    const limit = Math.min(Math.max(1, Math.trunc(opts.limit) || 1), MAX_VALUES);
    const rows = (await qb.select('l.LineCode as v').distinct().orderBy('v', 'asc').offset(0).fetch(limit + 1).execute()) as { v: unknown }[];
    return { rows: rows.slice(0, limit).map((r) => r.v), truncated: rows.length > limit };
  }

  /** Dòng dàn chuyền của một kế hoạch trong phạm vi của hành động, theo thứ tự dàn chuyền */
  async planLines(scope: Scope, planId: number, action: DataAction = 'view', db: Kysely<any> = this.db): Promise<PlanLineRow[]> {
    const qb = await this.scoped(db.selectFrom('ShipmentPlanLine').selectAll().where('ShipmentPlanId', '=', planId), scope, action);
    return (await qb.orderBy('SortOrder').orderBy('Id').execute()) as PlanLineRow[];
  }

  /**
   * SL KHXH theo màu cỡ của kế hoạch, cho popup Phân bổ màu cỡ: đọc như cột của kế hoạch cha khi kế hoạch có dòng dàn chuyền
   * trong phạm vi xem (người phân màu cỡ không cần quyền Kế hoạch xuất hàng), không thì rỗng.
   */
  async planColorSizes(scope: Scope, planId: number, db: Kysely<any> = this.db): Promise<PlanColorSizeRow[]> {
    const visible = await this.scoped(db.selectFrom('ShipmentPlanLine').select('ShipmentPlanId').where('ShipmentPlanId', '=', planId), scope, 'view');
    const qb = await this.branchOnly(db.selectFrom('ShipmentPlanColorSize').selectAll().where('ShipmentPlanId', 'in', visible), scope);
    return (await qb.orderBy('SortOrder').orderBy('Id').execute()) as PlanColorSizeRow[];
  }

  /**
   * Tổng SL giao theo màu cỡ của các chuyền khác của kế hoạch (ngoài `lineIds`). Chỉ lọc ĐVCS, không theo phạm vi chuyền: người
   * chỉ sửa được chuyền mình vẫn không giao vượt SL kế hoạch (như LinePlanLineRepository.totalExcept). Chỉ trả tổng.
   */
  async assignedOutside(scope: Scope, planId: number, lineIds: number[], db: Kysely<any> = this.db): Promise<AssignedByColorSize[]> {
    let qb = await this.branchOnly(assignedByColorSizeQuery(db, planId), scope, 'l');
    if (lineIds.length) qb = qb.where('l.Id', 'not in', lineIds);
    return (await qb.execute()) as AssignedByColorSize[];
  }
}

@Injectable()
export class LineColorSizeRepository extends ChildRepository<LineColorSizeRow> {
  protected readonly table = 'ShipmentPlanLineColorSize';
  protected readonly parentKey = 'ShipmentPlanLineId';

  constructor(@Inject(ORDER_DB) db: OrderDb, parent: LineAllocationRepository) {
    super(db, parent);
  }
}
