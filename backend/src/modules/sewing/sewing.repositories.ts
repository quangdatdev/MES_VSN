import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql, type Insertable, type RawBuilder, type SqlBool } from 'kysely';
import { BaseRepository, ChildRepository, type ListOptions, type Scope } from '../../platform/data/base.repository';
import { ResourceRegistry } from '../../platform/data/resource-registry';
import { inTransaction } from '../../platform/data/transaction';
import type { ScheduleLineFeed } from '../order/schedule-feed.service';
import type { PrepStatus } from './sewing.dto';
import { SEWING_DB } from './sewing.db';
import type { PrepStepTable, Row, SewingDb, SewingPrepStepTable, SewingPrepTable } from './sewing.types';

export type PrepStepRow = Row<PrepStepTable>;
export type SewingPrepRow = Row<SewingPrepTable>;
export type SewingPrepStepRow = Row<SewingPrepStepTable>;

const day = (d: Date | string) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const logger = new Logger('SewingPrepSync');
const SYNC_LOCK = 'MES_Sewing.SewingPrep.sync';
/**
 * Hai thời điểm là một: driver gửi tham số Date theo kiểu datetime cũ (chính xác 1/300 giây) nên giá trị lưu lệch tới vài
 * mili giây so với nguồn DATETIME2(3). Hai dòng dàn chuyền tạo cách nhau dưới 5 ms mà trùng Id thì không thể xảy ra.
 */
const sameInstant = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) < 5;

// ---------- Kế hoạch chuẩn bị SX (order.prep): một dòng dàn chuyền, lọc nhà máy và chuyền ----------

@Injectable()
export class SewingPrepRepository extends BaseRepository<SewingPrepRow> {
  protected readonly table = 'SewingPrep';
  protected readonly resource = 'order.prep';
  protected readonly searchColumns = ['StyleCode', 'CustomerName', 'ProductName', 'PlanNo'];
  protected readonly sortable = ['Id', 'StartDate', 'StyleCode', 'LineCode', 'CustomerName', 'BranchCode', 'SourceCreatedAt'];
  protected readonly defaultSort = 'BranchCode:asc,LineCode:asc,StyleCode:asc,StartDate:asc';

  constructor(@Inject(SEWING_DB) db: SewingDb, registry: ResourceRegistry) {
    super(db, registry);
  }

  /**
   * Số dòng bản chép của một nhà máy (null: mọi nhà máy), để đối chiếu với số dòng nguồn khi quyết định có chép lại không.
   * Việc của hệ thống, chỉ trả số đếm.
   */
  async copyCount(branchCode: string | null): Promise<number> {
    let qb = this.db.selectFrom('SewingPrep').select(sql<number>`COUNT(*)`.as('n'));
    if (branchCode !== null) qb = qb.where('BranchCode', '=', branchCode);
    return Number((await qb.executeTakeFirst())?.n ?? 0);
  }

  /**
   * Điều kiện lọc theo trạng thái của dòng, tính trong SQL từ danh mục bước và ngày đã nhập (cùng database), để phân trang
   * đúng. Cùng quy tắc với prepStatus() ở service: chưa đến ngày vào chuyền; đến ngày mà còn bước đang dùng chưa có TH;
   * đã có TH mọi bước.
   */
  statusFilter(status: PrepStatus, today: string) {
    const open = sql<SqlBool>`EXISTS (SELECT 1 FROM dbo.PrepStep s LEFT JOIN dbo.SewingPrepStep ps ON ps.PrepStepId = s.Id AND ps.SewingPrepId = SewingPrep.Id
      WHERE s.IsActive = 1 AND ps.DoneDate IS NULL)`;
    const due = sql<SqlBool>`SewingPrep.StartDate <= CAST(${today} AS DATE)`;
    return <Q extends { where: (...a: any[]) => Q }>(qb: Q): Q => {
      if (status === 'NOT_DUE') return qb.where(sql<SqlBool>`NOT (${due})`);
      if (status === 'NOT_READY') return qb.where(due).where(open);
      return qb.where(due).where(sql<SqlBool>`NOT ${open}`);
    };
  }

  /**
   * Thanh tuần: dòng có bước đang dùng đến hạn KH tới hết tuần (`to`) mà chưa có TH (kể cả việc tồn từ các tuần trước), cộng
   * dòng vào chuyền trong tuần [`from`, `to`]. KH = Ngày vào chuyền - số ngày KH như statusFilter.
   */
  weekFilter(from: string, to: string) {
    const dueUndone = sql<SqlBool>`EXISTS (SELECT 1 FROM dbo.PrepStep s LEFT JOIN dbo.SewingPrepStep ps ON ps.PrepStepId = s.Id AND ps.SewingPrepId = SewingPrep.Id
      WHERE s.IsActive = 1 AND ps.DoneDate IS NULL AND DATEADD(day, -COALESCE(ps.PlanDays, s.PlanDays), SewingPrep.StartDate) <= CAST(${to} AS DATE))`;
    const startsInWeek = sql<SqlBool>`SewingPrep.StartDate BETWEEN CAST(${from} AS DATE) AND CAST(${to} AS DATE)`;
    return <Q extends { where: (...a: any[]) => Q }>(qb: Q): Q => qb.where(sql<SqlBool>`(${startsInWeek} OR ${dueUndone})`);
  }

  /**
   * Số liệu trên đầu màn (task 5.5.8): số mã hàng (nhà máy + mã hàng) trong các dòng khớp bộ lọc của danh sách, và trong số
   * đó các mã có dòng:
   * - Đủ điều kiện V/C (như statusFilter READY);
   * - nguy cơ trễ hạn: bước đang dùng chưa có TH mà KH trong [hôm nay, hôm nay + 2];
   * - trễ hạn: Chưa đủ đk V/C và có bước trễ (TH sau KH, hoặc đã qua KH mà chưa có TH).
   * KH như statusFilter, weekFilter. SQL Server không cho truy vấn con trong hàm gộp nên tính cờ từng dòng trước rồi mới đếm.
   * Mã hàng so theo collation của database (không phân biệt hoa thường, bỏ khoảng trắng cuối) như bộ lọc Mã hàng.
   */
  async summary(scope: Scope, opts: Pick<ListOptions, 'q' | 'where' | 'searchExclude'>, today: string) {
    const day0 = sql`CAST(${today} AS DATE)`;
    const planDate = sql`DATEADD(day, -COALESCE(ps.PlanDays, s.PlanDays), SewingPrep.StartDate)`;
    const anyStep = (cond: RawBuilder<unknown>) =>
      sql<SqlBool>`EXISTS (SELECT 1 FROM dbo.PrepStep s LEFT JOIN dbo.SewingPrepStep ps ON ps.PrepStepId = s.Id AND ps.SewingPrepId = SewingPrep.Id
        WHERE s.IsActive = 1 AND ${cond})`;
    const due = sql`SewingPrep.StartDate <= ${day0}`;
    const open = anyStep(sql`ps.DoneDate IS NULL`);
    const flag = (cond: RawBuilder<unknown>) => sql<number>`CASE WHEN ${cond} THEN 1 ELSE 0 END`;
    const rows = (await this.filteredQuery(scope, opts)).select([
      'BranchCode',
      'StyleCode',
      flag(sql`${due} AND NOT ${open}`).as('Ready'),
      flag(anyStep(sql`ps.DoneDate IS NULL AND ${planDate} BETWEEN ${day0} AND DATEADD(day, 2, ${day0})`)).as('AtRisk'),
      flag(sql`${due} AND ${open} AND ${anyStep(sql`(ps.DoneDate > ${planDate} OR (ps.DoneDate IS NULL AND ${planDate} < ${day0}))`)}`).as('Late'),
    ]);
    const style = sql`CONCAT(r.BranchCode, '|', r.StyleCode)`;
    const count = (col: string) => sql<number>`COUNT(DISTINCT CASE WHEN ${sql.ref(`r.${col}`)} = 1 THEN ${style} END)`;
    const r = await this.db
      .selectFrom(rows.as('r'))
      .select([sql<number>`COUNT(DISTINCT ${style})`.as('total'), count('Ready').as('ready'), count('AtRisk').as('atRisk'), count('Late').as('late')])
      .executeTakeFirstOrThrow();
    return { total: Number(r.total), ready: Number(r.ready), atRisk: Number(r.atRisk), late: Number(r.late) };
  }

  /** Các dòng (trong `ids`) người dùng được sửa: để lưới khóa sẵn ô của dòng ngoài phạm vi sửa. A00 không sửa được gì. */
  async editableIds(scope: Scope, ids: number[]): Promise<Set<number>> {
    if (ids.length === 0 || scope.isAggregate) return new Set();
    const rows = await (await this.scopedIds(scope, 'update')).where('Id', 'in', ids).execute();
    return new Set(rows.map((r: { Id: number }) => r.Id));
  }

  /**
   * Chép dàn chuyền sang (quyết định 9.2): thêm dòng mới, cập nhật mã hàng, chuyền, số lượng, ngày vào chuyền đã đổi, xóa dòng
   * của dòng dàn chuyền đã bị bỏ (kèm ngày đã nhập). Việc của hệ thống khi mở màn, không theo quyền người xem: BranchCode
   * lấy từ dòng nguồn của máy chủ. `branchCode` null: mọi nhà máy (phiên ở đơn vị tổng hợp A00).
   * - Một lần chép tại một thời điểm (khóa ứng dụng, không khóa phạm vi trên bảng nên phiên A00 và phiên nhà máy không
   *   deadlock); nguồn đọc sau khi giữ khóa nên không dùng ảnh cũ.
   * - Dòng nguồn nhận diện bằng Id + nhà máy + kế hoạch + thời điểm tạo: Id được dùng lại sau khi xóa dữ liệu đơn hàng
   *   (reset:demo, load:bravo) thì là dòng khác, ngày đã nhập không bị gắn sang mã hàng khác.
   * - Nguồn trả rỗng mà bản chép còn dòng (nhầm database, đang nạp lại) thì không xóa gì.
   */
  async syncFromSchedule(branchCode: string | null, load: () => Promise<ScheduleLineFeed[]>): Promise<{ added: number; updated: number; removed: number; skipped?: boolean }> {
    return inTransaction(this.db, async (trx) => {
      const lock = await sql<{ r: number }>`DECLARE @r INT; EXEC @r = sp_getapplock @Resource = ${SYNC_LOCK}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000; SELECT @r AS r`.execute(trx);
      if ((lock.rows[0]?.r ?? -1) < 0) throw new Error('Đang có lần chép dàn chuyền khác, thử lại sau');
      const lines = await load();
      if (branchCode !== null && lines.some((l) => l.branchCode !== branchCode)) throw new Error('Dòng dàn chuyền khác nhà máy đang chép');
      let qb = trx.selectFrom('SewingPrep').select(['Id', 'ShipmentPlanLineId', 'ShipmentPlanId', 'PlanNo', 'CustomerName', 'StyleCode', 'ProductName', 'LineCode', 'LineQty', 'StartDate', 'BranchCode', 'SourceCreatedAt']);
      if (branchCode !== null) qb = qb.where('BranchCode', '=', branchCode);
      const existing = await qb.execute();
      if (lines.length === 0 && existing.length > 0) {
        logger.warn(`Nguồn dàn chuyền trả rỗng (${branchCode ?? 'mọi nhà máy'}) mà bản chép có ${existing.length} dòng: không xóa`);
        return { added: 0, updated: 0, removed: 0, skipped: true };
      }
      const byLine = new Map(existing.map((e) => [e.ShipmentPlanLineId, e]));
      const now = new Date();
      const snapshot = (l: ScheduleLineFeed) => ({
        ShipmentPlanId: l.planId,
        PlanNo: l.planNo,
        CustomerName: l.customerName,
        StyleCode: l.styleCode,
        ProductName: l.productName,
        LineCode: l.lineCode,
        LineQty: l.qty,
        StartDate: l.startDate,
        SourceCreatedAt: l.createdAt,
      });
      const added: Insertable<SewingPrepTable>[] = [];
      let updated = 0;
      for (const l of lines) {
        const e = byLine.get(l.id);
        const sameSource =
          !!e && e.BranchCode === l.branchCode && e.ShipmentPlanId === l.planId && (e.SourceCreatedAt === null || sameInstant(e.SourceCreatedAt, l.createdAt));
        if (!e || !sameSource) {
          // Không có, hoặc Id đã thuộc một dòng khác: dòng cũ (nếu có) bị xóa ở dưới, thêm dòng mới
          added.push({ ShipmentPlanLineId: l.id, ...snapshot(l), SourceSyncedAt: now, BranchCode: l.branchCode });
          continue;
        }
        byLine.delete(l.id);
        const same =
          e.PlanNo === l.planNo &&
          e.CustomerName === l.customerName &&
          e.StyleCode === l.styleCode &&
          e.ProductName === l.productName &&
          e.LineCode === l.lineCode &&
          e.LineQty === l.qty &&
          day(e.StartDate) === l.startDate &&
          e.SourceCreatedAt !== null;
        if (same) continue;
        await trx.updateTable('SewingPrep').set({ ...snapshot(l), SourceSyncedAt: now }).where('Id', '=', e.Id).execute();
        updated++;
      }
      const gone = new Set([...byLine.values()].map((e) => e.Id));
      // Dòng mới mà Id đang nằm ở bản chép của nhà máy khác (Id được dùng lại): dòng đó đã không còn nguồn, xóa trước khi thêm
      const addedIds = added.map((a) => a.ShipmentPlanLineId);
      for (let i = 0; i < addedIds.length; i += 1000) {
        const clash = await trx.selectFrom('SewingPrep').select('Id').where('ShipmentPlanLineId', 'in', addedIds.slice(i, i + 1000)).execute();
        for (const c of clash) gone.add(c.Id);
      }
      // Ngày theo bước của dòng bị bỏ xóa theo (ON DELETE CASCADE)
      const goneIds = [...gone];
      // Dòng bị xóa có dữ liệu người dùng đã nhập (ngày, số ngày chỉnh riêng) thì để lại dấu vết trong log máy chủ
      for (let i = 0; i < goneIds.length; i += 1000) {
        const used = await trx.selectFrom('SewingPrepStep').select('SewingPrepId').distinct().where('SewingPrepId', 'in', goneIds.slice(i, i + 1000)).execute();
        if (used.length) logger.warn(`Xóa ${used.length} dòng Kế hoạch chuẩn bị SX có dữ liệu đã nhập (dòng dàn chuyền nguồn đã bỏ hoặc đổi): Id ${used.map((u) => u.SewingPrepId).join(', ')}`);
      }
      for (let i = 0; i < goneIds.length; i += 1000) await trx.deleteFrom('SewingPrep').where('Id', 'in', goneIds.slice(i, i + 1000)).execute();
      // Chia lô: SQL Server giới hạn 2100 tham số mỗi câu
      for (let i = 0; i < added.length; i += 100) await trx.insertInto('SewingPrep').values(added.slice(i, i + 100)).execute();
      return { added: added.length, updated, removed: goneIds.length };
    });
  }
}

/** Ngày theo bước của một dòng: bảng con, phạm vi theo dòng cha (nhà máy, chuyền). */
@Injectable()
export class SewingPrepStepRepository extends ChildRepository<SewingPrepStepRow> {
  protected readonly table = 'SewingPrepStep';
  protected readonly parentKey = 'SewingPrepId';
  protected readonly orderBy = ['PrepStepId'];

  constructor(@Inject(SEWING_DB) db: SewingDb, parent: SewingPrepRepository) {
    super(db, parent);
  }
}

// ---------- Danh mục "Cấu hình chuẩn bị SX": dùng chung toàn công ty, quyền kiểm ở controller (admin.catalog) ----------

@Injectable()
export class PrepStepRepository {
  constructor(@Inject(SEWING_DB) private readonly db: SewingDb) {}

  /** Mọi bước (kể cả đã ngừng: lưới vẫn hiện đúng tên cho ngày đã nhập), theo thứ tự cột. */
  all(db: SewingDb = this.db): Promise<PrepStepRow[]> {
    return db.selectFrom('PrepStep').selectAll().orderBy('SortOrder').orderBy('Id').execute() as Promise<PrepStepRow[]>;
  }

  async get(id: number, db: SewingDb = this.db): Promise<PrepStepRow | undefined> {
    return (await db.selectFrom('PrepStep').selectAll().where('Id', '=', id).executeTakeFirst()) as PrepStepRow | undefined;
  }

  async create(values: Omit<PrepStepTable, 'Id' | 'IsSystem' | 'CreatedAt' | 'ModifiedAt' | 'ModifiedBy'>): Promise<PrepStepRow> {
    const res = await this.db.insertInto('PrepStep').values(values).output('inserted.Id').executeTakeFirstOrThrow();
    return (await this.get(res.Id))!;
  }

  async update(
    id: number,
    values: Partial<Pick<PrepStepTable, 'Name' | 'Description' | 'PlanDays' | 'Performer' | 'DataSource' | 'SortOrder' | 'IsActive'>>,
    userId: number,
    db: SewingDb = this.db,
  ): Promise<PrepStepRow | undefined> {
    await db.updateTable('PrepStep').set({ ...values, ModifiedAt: new Date(), ModifiedBy: userId }).where('Id', '=', id).execute();
    return this.get(id, db);
  }

  async nextSortOrder(): Promise<number> {
    const r = await this.db.selectFrom('PrepStep').select(sql<number>`COALESCE(MAX(SortOrder), 0)`.as('m')).executeTakeFirst();
    return Number(r?.m ?? 0) + 10;
  }
}
