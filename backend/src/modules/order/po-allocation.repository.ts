import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { createHash } from 'crypto';
import { sql, type Kysely, type SqlBool } from 'kysely';
import { Errors } from '../../common/app.exception';
import { env } from '../../config/env';
import { CatalogLookupService } from '../../platform/catalog/catalog-lookup.service';
import { createDb } from '../../platform/database/db';
import { BaseRepository, type DataAction, type FactoryDirectory, type ListOptions, type Scope } from '../../platform/data/base.repository';
import { ResourceRegistry } from '../../platform/data/resource-registry';
import { inTransaction } from '../../platform/data/transaction';
import type { OsmPoSourceRow } from '../../platform/feed/source-feed.service';
import { ORDER_DB } from './order.db';
import type { OrderDatabase, OrderDb, PoAllocationRefreshTable, PoAllocationTable, Row } from './order.types';

export type PoAllocationRow = Row<PoAllocationTable>;
/** Dòng của danh sách: thêm ĐVCS suy từ Nhà máy SX (cột tính, null khi nhà máy chưa gắn ĐVCS) */
export type PoAllocationListRow = PoAllocationRow & { BranchCode: string | null };
/** Trạng thái lần làm mới gần nhất (bảng PoAllocationRefresh) */
export type PoAllocationRefreshState = Row<PoAllocationRefreshTable>;

/** Thời gian chờ khóa ứng dụng của lần đổi Nhà máy SX: bước làm mới đang chạy lâu hơn thì báo 409 */
export const WRITE_LOCK_TIMEOUT_MS = 10_000;

/**
 * Khóa ứng dụng nối tiếp lần ghi của người dùng (đổi Nhà máy SX) với bước làm mới theo OSM: hai việc cùng đọc bản đồ khóa nhập
 * tay rồi ghi, chạy chồng thì lần sau đè mất lần trước. Trả false khi chờ quá `timeoutMs`.
 */
async function lockPoAllocation(trx: Kysely<any>, timeoutMs: number): Promise<boolean> {
  const r = await sql<{ r: number }>`DECLARE @r INT; EXEC @r = sp_getapplock @Resource = 'MES_Order.PoAllocation', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = ${timeoutMs}; SELECT @r AS r`.execute(trx);
  return (r.rows[0]?.r ?? -1) >= 0;
}

/**
 * Dòng cùng khóa nhập tay (quyết định 5.10 Q5: SO, PO, Style No, Màu) với các dòng `ids`, kể cả chính chúng. So bằng INTERSECT:
 * hai ô cùng trống là bằng nhau (SO, Màu có thể trống), chữ so theo collation của cột như mọi phép so khác.
 */
const sameKeyAs = (ids: number[]) =>
  sql<SqlBool>`EXISTS (SELECT 1 FROM dbo.PoAllocation k WHERE k.Id IN (${sql.join(ids)}) AND EXISTS (SELECT k.PoNo, k.SoNo, k.StyleNo, k.Color INTERSECT SELECT PoAllocation.PoNo, PoAllocation.SoNo, PoAllocation.StyleNo, PoAllocation.Color))`;

/** Một nhóm dòng bị áp khi đổi Nhà máy SX: khóa và nhà máy hiện tại (cho nhật ký) */
export interface PoAllocationKeyGroup {
  PoNo: string | null;
  SoNo: string | null;
  StyleNo: string | null;
  Color: string | null;
  ProductionFactoryCode: string | null;
  IsFactoryManual: boolean;
  n: number;
}

/**
 * Phân bổ PO (order.poallocation, Phase 5.10): bảng dùng chung, ĐVCS giữ dòng suy từ Nhà máy SX (`factoryBranchWrite`, quyết định
 * 5.10 Q2): đọc không lọc ĐVCS; sửa chỉ dòng có nhà máy thuộc ĐVCS của phiên, chưa có nhà máy hoặc nhà máy chưa gắn ĐVCS; đơn vị
 * tổng hợp chỉ đọc. Điều kiện do BaseRepository dựng; lớp này chỉ thêm điều kiện nghiệp vụ (khóa SO, PO, Style No, Màu).
 */
@Injectable()
export class PoAllocationRepository extends BaseRepository<PoAllocationRow> {
  protected readonly table = 'PoAllocation';
  protected readonly resource = 'order.poallocation';
  protected readonly productionFactoryColumn = 'ProductionFactoryCode';
  protected readonly factoryBranchWrite = true;
  /** Ô "PO, SO" của dải lọc */
  protected readonly searchColumns = ['PoNo', 'SoNo'];
  /** Màn sắp xếp bằng ListOptions.orderBy (có cột tính ĐVCS); không nhận tên cột từ `sort` */
  protected readonly sortable = ['Id'];

  constructor(
    @Inject(ORDER_DB) db: OrderDb,
    registry: ResourceRegistry,
    private readonly catalogs: CatalogLookupService,
  ) {
    super(db, registry);
  }

  protected factoryDirectory(): FactoryDirectory {
    return this.catalogs;
  }

  /** Số dòng khớp điều kiện của danh sách (để chặn xuất file quá giới hạn trước khi đọc) */
  async countFor(scope: Scope, opts: Pick<ListOptions, 'q' | 'where' | 'searchExclude'>, action: DataAction = 'view'): Promise<number> {
    const qb = await this.filteredQuery(scope, opts, action);
    const r = (await qb.select(sql<number>`COUNT(*)`.as('n')).executeTakeFirstOrThrow()) as { n: number };
    return Number(r.n);
  }

  /** Các giá trị đang có của Brand, Season (ô chọn ở dải lọc), trong phạm vi xem */
  async distinct(scope: Scope, column: 'Brand' | 'Season'): Promise<string[]> {
    const qb = await this.scoped(this.db.selectFrom('PoAllocation').select(column).distinct().where(column, 'is not', null).where(column, '<>', ''), scope);
    return ((await qb.orderBy(column).execute()) as Record<string, string>[]).map((r) => r[column]);
  }

  /**
   * Trạng thái lần làm mới gần nhất (thời điểm chép OSM của dữ liệu, lần bị bỏ qua, dòng vắng phải giữ). Thông tin của cả bảng, không
   * phải dòng dữ liệu nên không theo phạm vi; null khi chưa có dòng trạng thái.
   */
  async refreshState(): Promise<PoAllocationRefreshState | null> {
    return ((await this.db.selectFrom('PoAllocationRefresh').selectAll().where('Id', '=', 1).executeTakeFirst()) as PoAllocationRefreshState | undefined) ?? null;
  }

  /**
   * Chạy `work` trong một transaction có khóa ứng dụng của bảng (nối tiếp với bước làm mới theo OSM). Bước làm mới đang chạy lâu
   * thì báo 409 để người dùng thử lại.
   */
  async withWriteLock<T>(work: (trx: Kysely<any>) => Promise<T>): Promise<T> {
    return inTransaction(this.db, async (trx) => {
      if (!(await lockPoAllocation(trx, WRITE_LOCK_TIMEOUT_MS))) throw Errors.conflict('Dữ liệu Phân bổ PO đang được làm mới theo OSM. Thử lại sau ít phút.');
      return work(trx);
    });
  }

  /**
   * Phạm vi của một lần đổi Nhà máy SX: số dòng `ids` xem được, số khóa của chúng, các nhóm (khóa, nhà máy hiện tại) của mọi dòng
   * cùng khóa xem được, và trong các dòng cùng khóa: số dòng có nhà máy của ĐVCS khác (luật do BaseRepository dựng), số dòng xem
   * được mà không sửa được, sửa được mà không xem được (hai số này phải bằng 0 thì mới ghi), số dòng không còn trong OSM (bị bỏ khi
   * chọn "Theo OSM"). `db`: transaction đang giữ khóa ứng dụng khi ghi; xem trước thì đọc thẳng, không khóa.
   */
  async target(scope: Scope, ids: number[], db: Kysely<any> = this.db) {
    const picked = await this.scoped(db.selectFrom('PoAllocation').select(['Id', 'PoNo', 'SoNo', 'StyleNo', 'Color']).where('Id', 'in', ids), scope);
    const rows = (await picked.execute()) as unknown[];
    const keys = (await db
      .selectFrom(
        (await this.scoped(db.selectFrom('PoAllocation').select(['PoNo', 'SoNo', 'StyleNo', 'Color']).distinct().where('Id', 'in', ids), scope)).as('k'),
      )
      .select(sql<number>`COUNT(*)`.as('n'))
      .executeTakeFirstOrThrow()) as { n: number };
    const grouped = await this.scoped(
      db
        .selectFrom('PoAllocation')
        .select(['PoNo', 'SoNo', 'StyleNo', 'Color', 'ProductionFactoryCode', 'IsFactoryManual', sql<number>`COUNT(*)`.as('n')])
        .where(sameKeyAs(ids))
        .groupBy(['PoNo', 'SoNo', 'StyleNo', 'Color', 'ProductionFactoryCode', 'IsFactoryManual']),
      scope,
    );
    const groups = (await grouped.execute()) as PoAllocationKeyGroup[];
    const count = async (qb: any) => Number(((await qb.executeTakeFirstOrThrow()) as { n: number }).n);
    const base = () => db.selectFrom('PoAllocation').select(sql<number>`COUNT(*)`.as('n')).where(sameKeyAs(ids));
    const otherBranch = await count(await this.otherBranchFactoryRows(await this.scoped(base(), scope), scope));
    const notWritable = await count((await this.scoped(base(), scope)).where('Id', 'not in', await this.scopedIds(scope, 'update', db)));
    const notVisible = await count((await this.scoped(base(), scope, 'update')).where('Id', 'not in', await this.scopedIds(scope, 'view', db)));
    const removable = await count((await this.scoped(base(), scope)).where('IsInOsm', '=', false));
    return { found: rows.length, keys: Number(keys.n), rows: groups.reduce((s, g) => s + Number(g.n), 0), groups, otherBranch, notWritable, notVisible, removable };
  }

  /** Nhập tay Nhà máy SX `code` cho mọi dòng cùng khóa với `ids` (trong phạm vi sửa); trả số dòng đã ghi */
  async setManual(scope: Scope, ids: number[], code: string, db: Kysely<any>): Promise<number> {
    const qb = await this.scoped(
      db.updateTable('PoAllocation').set({ ProductionFactoryCode: code, IsFactoryManual: true, ModifiedAt: new Date(), ModifiedBy: scope.userId }).where(sameKeyAs(ids)),
      scope,
      'update',
    );
    return Number((await qb.executeTakeFirst()).numUpdatedRows);
  }

  /**
   * Bỏ nhập tay ("Theo OSM") cho mọi dòng cùng khóa với `ids`: Nhà máy SX trở lại giá trị OSM; dòng chỉ còn vì nhập tay (không còn
   * trong OSM) thì xóa. Sửa trước, xóa sau: câu sửa tìm khóa qua chính các dòng `ids`, có thể là dòng sắp xóa.
   */
  async resetToOsm(scope: Scope, ids: number[], db: Kysely<any>): Promise<{ updated: number; removed: number }> {
    const upd = await this.scoped(
      db
        .updateTable('PoAllocation')
        .set({ ProductionFactoryCode: sql.ref('OsmFactoryCode'), IsFactoryManual: false, ModifiedAt: new Date(), ModifiedBy: scope.userId })
        .where(sameKeyAs(ids))
        .where('IsInOsm', '=', true),
      scope,
      'update',
    );
    const updated = Number((await upd.executeTakeFirst()).numUpdatedRows);
    const del = await this.scoped(db.deleteFrom('PoAllocation').where(sameKeyAs(ids)).where('IsInOsm', '=', false), scope, 'update');
    const removed = Number((await del.executeTakeFirst()).numDeletedRows);
    return { updated, removed };
  }
}

// ---------- Bước làm mới theo OSM (việc của hệ thống) ----------

/** Dấu của một dòng OSM: SHA-256 của 11 cột. Bỏ khoảng trắng cuối như phép so của SQL Server, để dấu không đổi qua lại khi nguồn gom dòng */
export function poRowHash(r: OsmPoSourceRow): string {
  const text = (v: string | null) => (v == null ? null : v.replace(/ +$/, ''));
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const values = [r.brand, r.season, r.po, r.so, r.shipMode, r.styleName, r.styleNo, r.color].map(text);
  return createHash('sha256')
    .update(JSON.stringify([...values, day(r.etdActual), day(r.etdRevised), text(r.factoryName)]), 'utf8')
    .digest('hex');
}

/** Lý do của lần làm mới không làm đủ: EMPTY nguồn rỗng (không làm gì), SHRINK nguồn giảm quá ngưỡng (không xóa dòng vắng) */
export type RefreshSkip = 'EMPTY' | 'SHRINK';

export interface PoAllocationRefreshResult {
  reason: RefreshSkip | null;
  /** Số dòng khác nhau của nguồn */
  source: number;
  /**
   * Mốc so: số dòng nguồn của lần làm mới đủ gần nhất (PoAllocationRefresh.BaselineRows); chưa có thì số dòng đang có trong OSM của
   * bảng. Không dùng số dòng đang có: ở lần giữ dòng vắng (SHRINK) số đó phình dần (dòng cũ còn, dòng đổi dấu được thêm)
   */
  before: number;
  inserted: number;
  /** Dòng còn trong OSM có Nhà máy SX, dấu nhập tay hoặc dấu "còn trong OSM" đổi (dòng không đổi thì không ghi lại) */
  updated: number;
  removed: number;
  /** Dòng nhập tay mà OSM không còn dòng nào cùng khóa: giữ, đánh dấu không còn trong OSM */
  missing: number;
  /** Dòng nhập tay trước đó không còn trong OSM nay có lại */
  restored: number;
  /** Dòng không còn trong OSM mà không xóa, không đánh dấu vì nguồn giảm quá ngưỡng (SHRINK) */
  keptAbsent: number;
  /** Số dòng nhập tay sau lần làm mới */
  manual: number;
  total: number;
  /** Ngưỡng giảm (%) đã áp */
  maxShrinkPercent: number;
}

/** Nguồn ít hơn (100 - phần trăm)% mốc so thì không xóa dòng vắng (chép OSM lỗi, view tạm thiếu dữ liệu) */
export const shrinkGuard = (source: number, before: number, maxShrinkPercent: number) => source * 100 < before * (100 - maxShrinkPercent);

/**
 * Ghi bảng Phân bổ PO theo dữ liệu OSM đã chép (task 5.10.2). Việc của hệ thống, không theo phiên người dùng (như
 * BravoOrderImportRepository): không đi qua BaseRepository, không đổi ModifiedAt/By (người nhập tay). Kết nối riêng (một kết nối,
 * câu dài tới 2 phút) để không chiếm pool của màn hình.
 */
@Injectable()
export class PoAllocationRefreshRepository implements OnApplicationShutdown {
  private readonly db = createDb<OrderDatabase>(env.db.orderName, { poolMax: 1, requestTimeoutMs: 120_000 });

  async onApplicationShutdown() {
    await this.db.destroy();
  }

  /**
   * Một transaction có khóa ứng dụng của bảng: chốt an toàn, một câu theo tập, rồi ghi trạng thái (PoAllocationRefresh). Nguồn gửi
   * một tham số JSON vào bảng tạm (không vượt 2.100 tham số; bảng tạm chỉ sống trong một câu nên mọi bước nằm trong cùng câu).
   *  - Dòng có khóa SO, PO, Style No, Màu đang nhập tay nhận nhà máy nhập tay, dòng khác nhận nhà máy theo OSM; chỉ ghi dòng đổi.
   *  - Dòng không còn trong OSM thì xóa, trừ dòng nhập tay mà OSM không còn dòng nào cùng khóa (giữ, IsInOsm = 0).
   *  - Nguồn rỗng: không làm gì. Nguồn giảm quá `maxShrinkPercent` so với mốc (số dòng nguồn của lần làm mới đủ gần nhất): vẫn
   *    thêm, sửa, nhưng không xóa, không đánh dấu dòng vắng; mốc giữ nguyên, nên OSM trở lại cỡ cũ thì lần sau làm đủ, dọn dòng vắng.
   * `brand`: chỉ xét dòng của Brand này, nguồn đã lọc sẵn (bài test dùng để không đụng dòng khác trên database dùng chung, như
   * productIds của applyOsmFactories). `unknownFactories`: số tên nhà máy của nguồn không có trong danh mục, ghi vào trạng thái.
   */
  async refresh(source: OsmPoSourceRow[], opts: { brand?: string; maxShrinkPercent: number; unknownFactories?: number }): Promise<PoAllocationRefreshResult> {
    const brand = opts.brand ?? null;
    const percent = opts.maxShrinkPercent;
    return inTransaction(this.db, async (trx) => {
      if (!(await lockPoAllocation(trx, 30_000))) throw new Error('Đang có người đổi Nhà máy SX ở Phân bổ PO hoặc lần làm mới khác chạy, thử lại sau.');
      const baseline = (await trx.selectFrom('PoAllocationRefresh').select('BaselineRows').where('Id', '=', 1).executeTakeFirst())?.BaselineRows ?? null;
      const before =
        baseline ??
        Number((await sql<{ n: number }>`SELECT COUNT(*) AS n FROM dbo.PoAllocation WHERE IsInOsm = 1 AND (${brand} IS NULL OR Brand = ${brand})`.execute(trx)).rows[0]?.n ?? 0);
      const rows = new Map<string, OsmPoSourceRow>();
      for (const r of source) if (brand === null || r.brand === brand) rows.set(poRowHash(r), r);
      const unknown = opts.unknownFactories ?? 0;
      if (rows.size === 0) {
        const r: PoAllocationRefreshResult = { reason: 'EMPTY', source: 0, before, inserted: 0, updated: 0, removed: 0, missing: 0, restored: 0, keptAbsent: 0, manual: 0, total: 0, maxShrinkPercent: percent };
        // Máy chưa đồng bộ OSM lần nào (bảng còn trống): không có gì để báo
        if (before > 0) await this.saveState(trx, r, null, unknown);
        return r;
      }
      const guard = shrinkGuard(rows.size, before, percent);
      const applied = await this.apply(trx, rows, brand, guard);
      const r: PoAllocationRefreshResult = { reason: guard ? 'SHRINK' : null, before, ...applied, maxShrinkPercent: percent };
      const syncedAt = [...rows.values()].reduce<Date | null>((m, x) => (x.syncedAt && (!m || x.syncedAt > m) ? x.syncedAt : m), null);
      await this.saveState(trx, r, syncedAt, unknown);
      return r;
    });
  }

  /** Ghi trạng thái lần làm mới (một dòng). `syncedAt` null: giữ thời điểm chép của dữ liệu đang có (lần bị bỏ qua) */
  private async saveState(trx: Kysely<any>, r: PoAllocationRefreshResult, syncedAt: Date | null, unknownFactories: number) {
    const values = {
      RefreshedAt: new Date(),
      SourceRows: r.source,
      PreviousRows: r.before,
      InsertedRows: r.inserted,
      UpdatedRows: r.updated,
      RemovedRows: r.removed,
      MissingManualRows: r.missing,
      KeptAbsentRows: r.keptAbsent,
      UnknownFactories: unknownFactories,
      MaxShrinkPercent: r.maxShrinkPercent,
      SkippedReason: r.reason,
      ...(syncedAt ? { SourceSyncedAt: syncedAt } : {}),
      // Mốc chỉ đổi ở lần làm đủ: lần bị bỏ qua, lần giữ dòng vắng không được nâng, hạ mốc
      ...(r.reason === null ? { BaselineRows: r.source } : {}),
    };
    const res = await trx.updateTable('PoAllocationRefresh').set(values).where('Id', '=', 1).executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) await trx.insertInto('PoAllocationRefresh').values({ Id: 1, ...values }).execute();
  }

  /** `guard`: nguồn giảm quá ngưỡng, không xóa, không đánh dấu dòng vắng (chỉ đếm) */
  private async apply(trx: Kysely<any>, rows: Map<string, OsmPoSourceRow>, brand: string | null, guard: boolean) {
    const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    const json = JSON.stringify(
      [...rows].map(([h, r]) => [h, r.brand, r.season, r.po, r.so, r.shipMode, r.styleName, r.styleNo, r.color, day(r.etdActual), day(r.etdRevised), r.factoryName]),
    );
    const res = await sql<Omit<PoAllocationRefreshResult, 'reason' | 'before' | 'maxShrinkPercent'>>`
SET NOCOUNT ON;
-- Khóa chéo với thao tác của người dùng thì SQL Server hủy bước làm mới (thử lại), không hủy thao tác của người dùng
SET DEADLOCK_PRIORITY LOW;
DECLARE @json NVARCHAR(MAX) = ${json};
DECLARE @brand NVARCHAR(50) = ${brand};
DECLARE @guard BIT = ${guard ? 1 : 0};
DECLARE @inserted INT = 0, @updated INT = 0, @removed INT = 0, @missing INT = 0, @restored INT = 0, @kept INT = 0;
CREATE TABLE #src (
  RowHash VARBINARY(32) NOT NULL PRIMARY KEY,
  Brand NVARCHAR(50) COLLATE DATABASE_DEFAULT NULL,
  Season NVARCHAR(50) COLLATE DATABASE_DEFAULT NULL,
  PoNo NVARCHAR(51) COLLATE DATABASE_DEFAULT NULL,
  SoNo NVARCHAR(50) COLLATE DATABASE_DEFAULT NULL,
  ShipMode NVARCHAR(50) COLLATE DATABASE_DEFAULT NULL,
  StyleName NVARCHAR(59) COLLATE DATABASE_DEFAULT NULL,
  StyleNo NVARCHAR(61) COLLATE DATABASE_DEFAULT NULL,
  Color NVARCHAR(82) COLLATE DATABASE_DEFAULT NULL,
  EtdActualDate DATE NULL,
  EtdRevisedDate DATE NULL,
  FtyName NVARCHAR(255) COLLATE DATABASE_DEFAULT NULL,
  ManualFactory NVARCHAR(255) COLLATE DATABASE_DEFAULT NULL
);
INSERT INTO #src (RowHash, Brand, Season, PoNo, SoNo, ShipMode, StyleName, StyleNo, Color, EtdActualDate, EtdRevisedDate, FtyName)
SELECT CONVERT(VARBINARY(32), j.h, 2), j.b, j.se, j.po, j.so, j.sm, j.sn, j.st, j.c, j.ea, j.er, j.f
FROM OPENJSON(@json) WITH (
  h CHAR(64) '$[0]', b NVARCHAR(50) '$[1]', se NVARCHAR(50) '$[2]', po NVARCHAR(51) '$[3]', so NVARCHAR(50) '$[4]', sm NVARCHAR(50) '$[5]',
  sn NVARCHAR(59) '$[6]', st NVARCHAR(61) '$[7]', c NVARCHAR(82) '$[8]', ea DATE '$[9]', er DATE '$[10]', f NVARCHAR(255) '$[11]'
) j;
CREATE INDEX IX_src_Key ON #src (PoNo, SoNo, StyleNo, Color);

-- Bản đồ khóa → nhà máy nhập tay, lấy trước khi xóa dòng cũ: dòng nhập tay đổi dấu (ETD, FtyName đổi) truyền nhà máy cho dòng mới cùng khóa
SELECT PoNo, SoNo, StyleNo, Color, MAX(ProductionFactoryCode) AS Factory INTO #manual
FROM dbo.PoAllocation WHERE IsFactoryManual = 1 AND (@brand IS NULL OR Brand = @brand)
GROUP BY PoNo, SoNo, StyleNo, Color;
UPDATE s SET ManualFactory = m.Factory
FROM #src s JOIN #manual m ON EXISTS (SELECT s.PoNo, s.SoNo, s.StyleNo, s.Color INTERSECT SELECT m.PoNo, m.SoNo, m.StyleNo, m.Color);

-- Dòng vẫn có trong OSM (cùng dấu nên cột OSM không đổi): chỉ ghi dòng có nhà máy, dấu nhập tay hoặc dấu "còn trong OSM" đổi, để lần
-- làm mới không ghi lại (và khóa) cả bảng. EXCEPT so được cả giá trị trống
SELECT @restored = COUNT(*) FROM dbo.PoAllocation t JOIN #src s ON s.RowHash = t.RowHash WHERE t.IsInOsm = 0;
UPDATE t SET
  ProductionFactoryCode = CASE WHEN s.ManualFactory IS NULL THEN s.FtyName ELSE s.ManualFactory END,
  IsFactoryManual = CASE WHEN s.ManualFactory IS NULL THEN 0 ELSE 1 END,
  IsInOsm = 1
FROM dbo.PoAllocation t JOIN #src s ON s.RowHash = t.RowHash
WHERE EXISTS (
  SELECT t.ProductionFactoryCode, t.IsFactoryManual, t.IsInOsm
  EXCEPT SELECT CASE WHEN s.ManualFactory IS NULL THEN s.FtyName ELSE s.ManualFactory END, CAST(CASE WHEN s.ManualFactory IS NULL THEN 0 ELSE 1 END AS BIT), CAST(1 AS BIT)
);
SET @updated = @@ROWCOUNT;

-- Dòng mới của OSM
INSERT INTO dbo.PoAllocation (RowHash, Brand, Season, PoNo, SoNo, ShipMode, StyleName, StyleNo, Color, EtdActualDate, EtdRevisedDate,
  OsmFactoryCode, ProductionFactoryCode, IsFactoryManual, IsInOsm)
SELECT s.RowHash, s.Brand, s.Season, s.PoNo, s.SoNo, s.ShipMode, s.StyleName, s.StyleNo, s.Color, s.EtdActualDate, s.EtdRevisedDate,
  s.FtyName, CASE WHEN s.ManualFactory IS NULL THEN s.FtyName ELSE s.ManualFactory END, CASE WHEN s.ManualFactory IS NULL THEN 0 ELSE 1 END, 1
FROM #src s WHERE NOT EXISTS (SELECT 1 FROM dbo.PoAllocation t WHERE t.RowHash = s.RowHash);
SET @inserted = @@ROWCOUNT;

IF @guard = 1
  -- Nguồn giảm bất thường: dòng vắng giữ nguyên, chỉ đếm những dòng lẽ ra bị xóa hoặc đánh dấu
  SELECT @kept = COUNT(*) FROM dbo.PoAllocation t
  WHERE (@brand IS NULL OR t.Brand = @brand)
    AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.RowHash = t.RowHash)
    AND (t.IsInOsm = 1 OR EXISTS (SELECT 1 FROM #src s WHERE EXISTS (SELECT s.PoNo, s.SoNo, s.StyleNo, s.Color INTERSECT SELECT t.PoNo, t.SoNo, t.StyleNo, t.Color)));
ELSE
BEGIN
  -- Dòng không còn trong OSM: nhập tay mà OSM không còn dòng nào cùng khóa thì giữ, đánh dấu; còn lại xóa
  UPDATE t SET IsInOsm = 0
  FROM dbo.PoAllocation t
  WHERE t.IsInOsm = 1 AND t.IsFactoryManual = 1 AND (@brand IS NULL OR t.Brand = @brand)
    AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.RowHash = t.RowHash)
    AND NOT EXISTS (SELECT 1 FROM #src s WHERE EXISTS (SELECT s.PoNo, s.SoNo, s.StyleNo, s.Color INTERSECT SELECT t.PoNo, t.SoNo, t.StyleNo, t.Color));
  SET @missing = @@ROWCOUNT;
  DELETE t FROM dbo.PoAllocation t
  WHERE (@brand IS NULL OR t.Brand = @brand)
    AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.RowHash = t.RowHash)
    AND (t.IsFactoryManual = 0 OR EXISTS (SELECT 1 FROM #src s WHERE EXISTS (SELECT s.PoNo, s.SoNo, s.StyleNo, s.Color INTERSECT SELECT t.PoNo, t.SoNo, t.StyleNo, t.Color)));
  SET @removed = @@ROWCOUNT;
END;

SELECT (SELECT COUNT(*) FROM #src) AS source, @inserted AS inserted, @updated AS updated, @removed AS removed, @missing AS missing,
  @restored AS restored, @kept AS keptAbsent,
  (SELECT COUNT(*) FROM dbo.PoAllocation WHERE IsFactoryManual = 1 AND (@brand IS NULL OR Brand = @brand)) AS manual,
  (SELECT COUNT(*) FROM dbo.PoAllocation WHERE @brand IS NULL OR Brand = @brand) AS total;
DROP TABLE #manual;
DROP TABLE #src;`.execute(trx);
    const r = res.rows[0];
    if (!r) throw new Error('Làm mới Phân bổ PO không trả kết quả.');
    return {
      source: Number(r.source),
      inserted: Number(r.inserted),
      updated: Number(r.updated),
      removed: Number(r.removed),
      missing: Number(r.missing),
      restored: Number(r.restored),
      keptAbsent: Number(r.keptAbsent),
      manual: Number(r.manual),
      total: Number(r.total),
    };
  }
}
