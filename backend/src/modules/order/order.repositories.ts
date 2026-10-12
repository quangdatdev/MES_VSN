import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { BaseRepository, ChildRepository, type DataAction, type ListOptions, type Page, type Scope } from '../../platform/data/base.repository';
import { Errors } from '../../common/app.exception';
import { ResourceRegistry } from '../../platform/data/resource-registry';
import { ORDER_DB } from './order.db';
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
export type AllocationListRow = PlanLineRow & {
  PlanNo: string;
  CustomerName: string;
  StyleCode: string;
  PoBuyDate: string;
  PlanShipDate: Date;
  AssignedQty: number;
};

// ---------- Thông tin đơn hàng (order.allocation) ----------

/**
 * Đơn hàng lấy hết từ BRAVO, dùng chung toàn công ty (SHARED, ADR 0013): BranchCode là Chi nhánh FOB, đơn nhập tay đóng dấu
 * ĐVCS của phiên. Popup Chọn mã hàng của kế hoạch xuất hàng lọc theo nhà máy SX được tích (cột ProductionFactoryCode).
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

/** PO của đơn hàng: dùng chung như đơn hàng (ADR 0013); PO nhập tay đóng dấu ĐVCS của phiên */
@Injectable()
export class SalesOrderPoRepository extends BaseRepository<SalesOrderPoRow> {
  protected readonly table = 'SalesOrderPo';
  protected readonly resource = 'order.po';
  protected readonly originBranch = true;
  protected readonly searchColumns = ['PoCode', 'PoNumber', 'StyleCode', 'CustomerName'];
  protected readonly sortable = ['Id', 'PoCode', 'PoNumber', 'Qty', 'ShipDate', 'SyncedAt', 'StatusCode', 'CreatedAt'];
  protected readonly defaultSort = 'CreatedAt:desc';

  constructor(@Inject(ORDER_DB) db: OrderDb, registry: ResourceRegistry) {
    super(db, registry);
  }

  /**
   * Danh sách mã hàng của màn tỷ lệ cắt: gom PO theo đơn hàng, trong phạm vi người dùng, có phân trang. Mã có PO mới
   * tạo gần nhất lên đầu. `where` là điều kiện trên dòng PO (trước khi gom), do service dựng.
   */
  async styles(scope: Scope, opts: { page: number; pageSize: number; where: NonNullable<ListOptions['where']> }) {
    let qb: any = this.db
      .selectFrom('SalesOrderPo')
      .select([
        'SalesOrderId',
        'CustomerName',
        'StyleCode',
        'BranchCode',
        sql<number>`COUNT(*)`.as('PoCount'),
        sql<number>`SUM(CASE WHEN StatusCode = 'CONFIRMED' THEN 1 ELSE 0 END)`.as('ConfirmedCount'),
        sql<number>`SUM(Qty)`.as('Qty'),
        sql<Date>`MIN(ShipDate)`.as('ShipDate'),
        sql<Date>`MAX(CreatedAt)`.as('CreatedAt'),
      ])
      .groupBy(['SalesOrderId', 'CustomerName', 'StyleCode', 'BranchCode']);
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
  async usedInPlans(scope: Scope, poId: number): Promise<boolean> {
    const qb = await this.scoped(this.db.selectFrom('SalesOrderPo').select('Id').where('Id', '=', poId), scope, 'delete');
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
export class LinePlanColorSizeRepository extends ChildRepository<PlanColorSizeRow> {
  protected readonly table = 'ShipmentPlanColorSize';
  protected readonly parentKey = 'ShipmentPlanId';

  constructor(@Inject(ORDER_DB) db: OrderDb, parent: LinePlanRepository) {
    super(db, parent);
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

// ---------- Phân bổ màu cỡ (order.colorsize): bảng chính là dòng dàn chuyền, lọc được theo chuyền ----------

@Injectable()
export class LineAllocationRepository extends BaseRepository<PlanLineRow> {
  protected readonly table = 'ShipmentPlanLine';
  protected readonly resource = 'order.colorsize';
  protected readonly searchColumns = ['LineCode'];
  protected readonly sortable = ['Id', 'LineCode', 'StartDate', 'EndDate', 'Qty', 'AvgOutput', 'StatusCode', 'CreatedAt'];
  protected readonly defaultSort = 'CreatedAt:desc';

  constructor(@Inject(ORDER_DB) db: OrderDb, registry: ResourceRegistry) {
    super(db, registry);
  }

  /** Dòng dàn chuyền kèm thông tin kế hoạch (khách hàng, mã hàng, PO/Buy date) và tổng đã phân màu cỡ. */
  listWithPlan(scope: Scope, opts: ListOptions & { plan?: PlanFilter }, action: DataAction = 'view'): Promise<Page<AllocationListRow>> {
    return this.list(scope, { ...opts, where: withPlanFilter(opts), select: () => ALLOCATION_COLUMNS }, action) as Promise<Page<AllocationListRow>>;
  }

  listAllWithPlan(scope: Scope, opts: Omit<ListOptions, 'page' | 'pageSize'> & { plan?: PlanFilter }): Promise<AllocationListRow[]> {
    return this.listAll(scope, { ...opts, where: withPlanFilter(opts), select: () => ALLOCATION_COLUMNS }) as Promise<AllocationListRow[]>;
  }

  async getWithPlan(scope: Scope, id: number, action: DataAction = 'view'): Promise<AllocationListRow> {
    const page = await this.listWithPlan(scope, { page: 1, pageSize: 1, where: (qb) => qb.where('Id', '=', id) }, action);
    if (!page.items[0]) throw Errors.notFound();
    return page.items[0];
  }
}

export interface PlanFilter {
  shipFrom?: string;
  shipTo?: string;
  customer?: string;
  style?: string;
}

/** Lọc nghiệp vụ theo cột của kế hoạch cha (ngày xuất, khách hàng, mã hàng). */
export function withPlanFilter(opts: Pick<ListOptions, 'where'> & { plan?: PlanFilter }) {
  return <Q extends { where: (...a: any[]) => Q }>(qb: Q): Q => {
    if (opts.where) qb = opts.where(qb);
    const f = opts.plan;
    if (!f || !(f.shipFrom || f.shipTo || f.customer || f.style)) return qb;
    return qb.where((eb: any) => {
      let sub = eb.selectFrom('ShipmentPlan as p').select('p.Id');
      if (f.shipFrom) sub = sub.where('p.ShipDate', '>=', f.shipFrom);
      if (f.shipTo) sub = sub.where('p.ShipDate', '<=', f.shipTo);
      if (f.customer) sub = sub.where('p.CustomerName', 'like', `%${f.customer.replace(/[%_[]/g, (c) => `[${c}]`)}%`);
      if (f.style) sub = sub.where('p.StyleCode', 'like', `%${f.style.replace(/[%_[]/g, (c) => `[${c}]`)}%`);
      return eb('ShipmentPlanId', 'in', sub);
    });
  };
}

/** Cột của kế hoạch cha cho mỗi dòng dàn chuyền (truy vấn con theo khóa), dùng cả cho lọc theo cột. */
export const planExpr = (col: string) => sql`(SELECT p.${sql.ref(col)} FROM dbo.ShipmentPlan p WHERE p.Id = ShipmentPlanLine.ShipmentPlanId)`;
/** Tổng số lượng đã giao (phân màu cỡ) của mỗi dòng dàn chuyền. */
export const assignedExpr = sql<number>`(SELECT COALESCE(SUM(a.AssignedQty), 0) FROM dbo.ShipmentPlanLineColorSize a WHERE a.ShipmentPlanLineId = ShipmentPlanLine.Id)`;
const planCol = (col: string, as: string) => planExpr(col).as(as);
const ALLOCATION_COLUMNS = [
  planCol('PlanNo', 'PlanNo'),
  planCol('CustomerName', 'CustomerName'),
  planCol('StyleCode', 'StyleCode'),
  planCol('PoBuyDate', 'PoBuyDate'),
  planCol('ShipDate', 'PlanShipDate'),
  assignedExpr.as('AssignedQty'),
];

@Injectable()
export class LineColorSizeRepository extends ChildRepository<LineColorSizeRow> {
  protected readonly table = 'ShipmentPlanLineColorSize';
  protected readonly parentKey = 'ShipmentPlanLineId';

  constructor(@Inject(ORDER_DB) db: OrderDb, parent: LineAllocationRepository) {
    super(db, parent);
  }
}
