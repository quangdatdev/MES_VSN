import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql, type Insertable, type RawBuilder } from 'kysely';
import { BaseRepository, ChildRepository, type Scope } from '../../platform/data/base.repository';
import type { FilterSpec } from '../../platform/data/column-filter';
import { ResourceRegistry } from '../../platform/data/resource-registry';
import { inTransaction } from '../../platform/data/transaction';
import type { ShipmentPlanFeedItem } from '../order/shipment-plan-feed.service';
import { CUTTING_DB } from './cutting.db';
import type { CuttingDb, CuttingPlanColorSizeTable, CuttingPlanDailyTable, CuttingPlanTable, Row } from './cutting.types';

export type CuttingPlanRow = Row<CuttingPlanTable>;
export type CuttingPlanColorSizeRow = Row<CuttingPlanColorSizeTable>;
export type CuttingPlanDailyRow = Row<CuttingPlanDailyTable>;
/** Dòng danh sách: bản chép kèm cột tính */
export type CuttingPlanListRow = CuttingPlanRow & { CutQty: number; LastCutDate: Date | null; StatusCode: string };

const logger = new Logger('CuttingPlanSync');
const SYNC_LOCK = 'MES_Cutting.CuttingPlan.sync';
const day = (d: Date | string) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
/** Hai thời điểm là một: driver gửi Date theo kiểu datetime cũ nên giá trị đã chép lệch vài mili giây so với nguồn DATETIME2(3) */
export const sameInstant = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) < 5;
/**
 * Khóa màu cỡ so như SQL Server với collation của database MES (không phân biệt hoa thường, bỏ khoảng trắng cuối): tên màu cỡ
 * chép từ MES_Order và gõ ở client phải khớp như UNIQUE trong database.
 */
export const cellKey = (color: string, size: string) => `${color.trimEnd().toLowerCase()}\u0000${size.trimEnd().toLowerCase()}`;

// Cột tính của danh sách (quyết định 13.3): Lũy kế mọi ngày, ngày cắt gần nhất, trạng thái. Tham chiếu CuttingPlan.Id của câu ngoài;
// kèm BranchCode để dùng chỉ mục phủ IX_CuttingPlanDaily_Branch (BranchCode, CuttingPlanId) INCLUDE (Qty, EntryDate)
const CUT_QTY = sql<number>`(SELECT COALESCE(SUM(CAST(d.Qty AS BIGINT)), 0) FROM dbo.CuttingPlanDaily d WHERE d.BranchCode = CuttingPlan.BranchCode AND d.CuttingPlanId = CuttingPlan.Id)`;
const LAST_CUT = sql<Date | null>`(SELECT MAX(d.EntryDate) FROM dbo.CuttingPlanDaily d WHERE d.BranchCode = CuttingPlan.BranchCode AND d.CuttingPlanId = CuttingPlan.Id)`;
const STATUS = sql<string>`(CASE WHEN CuttingPlan.SourceDeletedAt IS NOT NULL THEN 'SOURCE_DELETED' WHEN ${CUT_QTY} = 0 THEN 'NOT_STARTED' WHEN ${CUT_QTY} < CuttingPlan.PlanQty THEN 'CUTTING' ELSE 'DONE' END)`;
const DIFF = sql<number>`(${CUT_QTY} - CuttingPlan.PlanQty)`;

/** Cột lọc được theo giá trị (popup lọc theo cột): trường JSON → biểu thức máy chủ dựng */
export const CUTTING_FILTER: FilterSpec = {
  planNo: { expr: 'PlanNo', kind: 'text' },
  customerName: { expr: 'CustomerName', kind: 'text' },
  styleCode: { expr: 'StyleCode', kind: 'text' },
  productName: { expr: 'ProductName', kind: 'text' },
  poBuyDate: { expr: 'PoBuyDate', kind: 'text' },
  branchCode: { expr: 'BranchCode', kind: 'text' },
  shipDate: { expr: 'ShipDate', kind: 'date' },
  planQty: { expr: 'PlanQty', kind: 'number' },
  cutQty: { expr: CUT_QTY, kind: 'number' },
  diffQty: { expr: DIFF, kind: 'number' },
  lastCutDate: { expr: LAST_CUT, kind: 'date' },
  statusCode: { expr: STATUS, kind: 'text' },
  createdAt: { expr: 'SourceCreatedAt', kind: 'datetime' },
};

/** Sắp xếp theo trường JSON của màn: danh sách trắng, không nhận tên cột từ client */
export const CUTTING_SORT: Record<string, RawBuilder<unknown>> = {
  planNo: sql`CuttingPlan.PlanNo`,
  customerName: sql`CuttingPlan.CustomerName`,
  styleCode: sql`CuttingPlan.StyleCode`,
  productName: sql`CuttingPlan.ProductName`,
  poBuyDate: sql`CuttingPlan.PoBuyDate`,
  branchCode: sql`CuttingPlan.BranchCode`,
  shipDate: sql`CuttingPlan.ShipDate`,
  planQty: sql`CuttingPlan.PlanQty`,
  cutQty: CUT_QTY,
  diffQty: DIFF,
  lastCutDate: LAST_CUT,
  statusCode: STATUS,
  createdAt: sql`CuttingPlan.SourceCreatedAt`,
};

/** Cột tính thêm cho mỗi dòng danh sách */
export const listColumns = () => [CUT_QTY.as('CutQty'), LAST_CUT.as('LastCutDate'), STATUS.as('StatusCode')];

// ---------- Đồng bộ tiến độ cắt (cutting.progress): một dòng mỗi kế hoạch xuất hàng, lọc ĐVCS ----------

@Injectable()
export class CuttingPlanRepository extends BaseRepository<CuttingPlanRow> {
  protected readonly table = 'CuttingPlan';
  protected readonly resource = 'cutting.progress';
  protected readonly searchColumns = ['PlanNo', 'StyleCode', 'CustomerName', 'PoBuyDate', 'ProductName'];
  protected readonly sortable = ['Id', 'SourceCreatedAt'];
  protected readonly defaultSort = 'SourceCreatedAt:desc';

  constructor(@Inject(CUTTING_DB) db: CuttingDb, registry: ResourceRegistry) {
    super(db, registry);
  }

  /** Số bản chép còn nguồn của một ĐVCS (null: mọi ĐVCS), để đối chiếu với số kế hoạch nguồn. Việc của hệ thống, chỉ trả số đếm. */
  async copyCount(branchCode: string | null): Promise<number> {
    let qb = this.db.selectFrom('CuttingPlan').select(sql<number>`COUNT(*)`.as('n')).where('ShipmentPlanId', 'is not', null);
    if (branchCode !== null) qb = qb.where('BranchCode', '=', branchCode);
    return Number((await qb.executeTakeFirst())?.n ?? 0);
  }

  /**
   * Kế hoạch xuất hàng nguồn đang có số cắt không (chặn xóa kế hoạch, quyết định 13.4). Việc của hệ thống khi module Đơn hàng xóa
   * kế hoạch: nhận diện bằng Id + ĐVCS + thời điểm tạo của kế hoạch nguồn, không trả dữ liệu.
   */
  async sourceHasEntries(plan: { id: number; branchCode: string; createdAt: Date }): Promise<boolean> {
    const copies = await this.db
      .selectFrom('CuttingPlan')
      .select(['Id', 'SourceCreatedAt'])
      .where('ShipmentPlanId', '=', plan.id)
      .where('BranchCode', '=', plan.branchCode)
      .execute();
    const ids = copies.filter((c) => sameInstant(c.SourceCreatedAt, plan.createdAt)).map((c) => c.Id);
    if (!ids.length) return false;
    return !!(await this.db.selectFrom('CuttingPlanDaily').select('Id').where('CuttingPlanId', 'in', ids).executeTakeFirst());
  }

  /**
   * Chép kế hoạch xuất hàng sang (quyết định 13.2): thêm kế hoạch mới, cập nhật đầu kế hoạch và màu cỡ đã đổi. Kế hoạch nguồn không
   * còn: có số cắt thì giữ bản chép, đánh dấu SourceDeletedAt (số cắt không mất); chưa có thì xóa. Việc của hệ thống khi mở màn, không
   * theo quyền người xem: BranchCode lấy từ kế hoạch nguồn. `branchCode` null: mọi ĐVCS (phiên A00).
   * - Một lần chép tại một thời điểm (khóa ứng dụng); nguồn đọc sau khi giữ khóa nên không dùng ảnh cũ.
   * - Kế hoạch nhận diện bằng Id + ĐVCS + thời điểm tạo: Id được dùng lại sau khi xóa dữ liệu đơn hàng thì là kế hoạch khác.
   * - Phiên A00 mà nguồn trả rỗng trong khi bản chép còn kế hoạch (nhầm database, đang nạp lại) thì không đổi gì. Phiên một ĐVCS thì vẫn
   *   chép: ĐVCS xóa kế hoạch cuối cùng của mình thì bản chép phải đi theo (review 5.14.2–5.14.5 M4); số cắt đã nhập không bao giờ bị
   *   xóa ở đây (chỉ tách khỏi nguồn).
   */
  async syncFromPlans(branchCode: string | null, load: () => Promise<ShipmentPlanFeedItem[]>): Promise<{ added: number; updated: number; removed: number; detached: number; skipped?: boolean }> {
    return inTransaction(this.db, async (trx) => {
      const lock = await sql<{ r: number }>`DECLARE @r INT; EXEC @r = sp_getapplock @Resource = ${SYNC_LOCK}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000; SELECT @r AS r`.execute(trx);
      if ((lock.rows[0]?.r ?? -1) < 0) throw new Error('Đang có lần chép kế hoạch xuất hàng khác, thử lại sau');
      const plans = await load();
      if (branchCode !== null && plans.some((p) => p.branchCode !== branchCode)) throw new Error('Kế hoạch khác ĐVCS đang chép');
      let qb = trx
        .selectFrom('CuttingPlan')
        .select(['Id', 'ShipmentPlanId', 'SourceCreatedAt', 'PlanNo', 'CustomerName', 'StyleCode', 'ProductName', 'PoBuyDate', 'ShipDate', 'PlanQty', 'BranchCode'])
        .where('ShipmentPlanId', 'is not', null);
      if (branchCode !== null) qb = qb.where('BranchCode', '=', branchCode);
      const existing = await qb.execute();
      if (branchCode === null && plans.length === 0 && existing.length > 0) {
        logger.warn(`Nguồn kế hoạch xuất hàng trả rỗng (${branchCode ?? 'mọi ĐVCS'}) mà bản chép có ${existing.length} kế hoạch: không đổi gì`);
        return { added: 0, updated: 0, removed: 0, detached: 0, skipped: true };
      }
      const cells = new Map<number, CuttingPlanColorSizeRow[]>();
      const ids = existing.map((e) => e.Id);
      for (let i = 0; i < ids.length; i += 1000) {
        const rows = (await trx.selectFrom('CuttingPlanColorSize').selectAll().where('CuttingPlanId', 'in', ids.slice(i, i + 1000)).execute()) as CuttingPlanColorSizeRow[];
        for (const r of rows) cells.set(r.CuttingPlanId, [...(cells.get(r.CuttingPlanId) ?? []), r]);
      }
      const byPlan = new Map(existing.map((e) => [e.ShipmentPlanId!, e]));
      const now = new Date();
      const header = (p: ShipmentPlanFeedItem) => ({
        PlanNo: p.planNo,
        CustomerName: p.customerName,
        StyleCode: p.styleCode,
        ProductName: p.productName,
        PoBuyDate: p.poBuyDate,
        ShipDate: p.shipDate,
        PlanQty: p.planQty,
      });
      const cellRows = (planId: number, p: ShipmentPlanFeedItem): Insertable<CuttingPlanColorSizeTable>[] =>
        p.colorSizes.map((c) => ({ CuttingPlanId: planId, ColorName: c.colorName, SizeName: c.sizeName, PlanQty: c.planQty, SortOrder: c.sortOrder, BranchCode: p.branchCode }));
      const sameCells = (saved: CuttingPlanColorSizeRow[], p: ShipmentPlanFeedItem) => {
        if (saved.length !== p.colorSizes.length) return false;
        const sorted = [...saved].sort((a, b) => a.SortOrder - b.SortOrder || a.Id - b.Id);
        return p.colorSizes.every((c, i) => sorted[i].ColorName === c.colorName && sorted[i].SizeName === c.sizeName && sorted[i].PlanQty === c.planQty && sorted[i].SortOrder === c.sortOrder);
      };

      const added: ShipmentPlanFeedItem[] = [];
      let updated = 0;
      for (const p of plans) {
        const e = byPlan.get(p.id);
        if (!e || e.BranchCode !== p.branchCode || !sameInstant(e.SourceCreatedAt, p.createdAt)) {
          // Không có, hoặc Id đã thuộc một kế hoạch khác: bản chép cũ (nếu có) xử lý như kế hoạch đã mất nguồn ở dưới
          added.push(p);
          continue;
        }
        byPlan.delete(p.id);
        const h = header(p);
        const sameHeader =
          e.PlanNo === h.PlanNo &&
          e.CustomerName === h.CustomerName &&
          e.StyleCode === h.StyleCode &&
          e.ProductName === h.ProductName &&
          e.PoBuyDate === h.PoBuyDate &&
          day(e.ShipDate) === h.ShipDate &&
          e.PlanQty === h.PlanQty;
        const keepCells = sameCells(cells.get(e.Id) ?? [], p);
        if (sameHeader && keepCells) continue;
        if (!sameHeader) await trx.updateTable('CuttingPlan').set({ ...h, SourceSyncedAt: now, ModifiedAt: now }).where('Id', '=', e.Id).execute();
        if (!keepCells) {
          await trx.deleteFrom('CuttingPlanColorSize').where('CuttingPlanId', '=', e.Id).execute();
          const rows = cellRows(e.Id, p);
          for (let i = 0; i < rows.length; i += 200) await trx.insertInto('CuttingPlanColorSize').values(rows.slice(i, i + 200)).execute();
        }
        updated++;
      }

      // Bản chép mất nguồn: kế hoạch không còn, hoặc Id đã thuộc kế hoạch khác (sẽ thêm lại ở dưới, chỉ mục duy nhất trên ShipmentPlanId)
      const gone = [...byPlan.values()].map((e) => e.Id);
      const addedIds = added.map((a) => a.id);
      for (let i = 0; i < addedIds.length; i += 1000) {
        let clash = trx.selectFrom('CuttingPlan').select('Id').where('ShipmentPlanId', 'in', addedIds.slice(i, i + 1000));
        if (branchCode !== null) clash = clash.where('BranchCode', '<>', branchCode);
        for (const c of await clash.execute()) if (!gone.includes(c.Id)) gone.push(c.Id);
      }
      const withEntries = new Set<number>();
      for (let i = 0; i < gone.length; i += 1000) {
        const used = await trx.selectFrom('CuttingPlanDaily').select('CuttingPlanId').distinct().where('CuttingPlanId', 'in', gone.slice(i, i + 1000)).execute();
        for (const u of used) withEntries.add(u.CuttingPlanId);
      }
      const detach = gone.filter((id) => withEntries.has(id));
      const drop = gone.filter((id) => !withEntries.has(id));
      // Còn số cắt: giữ, bỏ liên kết nguồn (quyết định 13.2); màu cỡ giữ để vẫn xem được Kế hoạch lúc mất nguồn
      if (detach.length) logger.warn(`Kế hoạch xuất hàng nguồn không còn mà đã có số cắt, giữ bản chép: Id ${detach.join(', ')}`);
      for (let i = 0; i < detach.length; i += 1000) {
        await trx.updateTable('CuttingPlan').set({ ShipmentPlanId: null, SourceDeletedAt: now, ModifiedAt: now }).where('Id', 'in', detach.slice(i, i + 1000)).execute();
      }
      // Chưa có số cắt: xóa (màu cỡ xóa theo, ON DELETE CASCADE)
      for (let i = 0; i < drop.length; i += 1000) await trx.deleteFrom('CuttingPlan').where('Id', 'in', drop.slice(i, i + 1000)).execute();

      for (const p of added) {
        const r = await trx
          .insertInto('CuttingPlan')
          .values({ ShipmentPlanId: p.id, SourceCreatedAt: p.createdAt, ...header(p), SourceSyncedAt: now, BranchCode: p.branchCode })
          .output('inserted.Id')
          .executeTakeFirstOrThrow();
        const rows = cellRows(r.Id, p);
        for (let i = 0; i < rows.length; i += 200) await trx.insertInto('CuttingPlanColorSize').values(rows.slice(i, i + 200)).execute();
      }
      return { added: added.length, updated, removed: drop.length, detached: detach.length };
    });
  }

  /** Dòng của kế hoạch trong phạm vi của hành động (để giao diện ẩn nút): A00 không sửa, không xóa được gì. */
  async allowed(scope: Scope, id: number, action: 'update' | 'delete'): Promise<boolean> {
    if (scope.isAggregate) return false;
    return !!(await (await this.scopedIds(scope, action)).where('Id', '=', id).executeTakeFirst());
  }
}

/** SL KHXH theo màu cỡ của kế hoạch (bản chép), phạm vi theo dòng cha */
@Injectable()
export class CuttingPlanColorSizeRepository extends ChildRepository<CuttingPlanColorSizeRow> {
  protected readonly table = 'CuttingPlanColorSize';
  protected readonly parentKey = 'CuttingPlanId';

  constructor(@Inject(CUTTING_DB) db: CuttingDb, parent: CuttingPlanRepository) {
    super(db, parent);
  }
}

/** Số cắt theo ngày, phạm vi theo dòng cha */
@Injectable()
export class CuttingPlanDailyRepository extends ChildRepository<CuttingPlanDailyRow> {
  protected readonly table = 'CuttingPlanDaily';
  protected readonly parentKey = 'CuttingPlanId';
  protected readonly orderBy = ['EntryDate', 'Id'];

  constructor(@Inject(CUTTING_DB) db: CuttingDb, parent: CuttingPlanRepository) {
    super(db, parent);
  }
}
