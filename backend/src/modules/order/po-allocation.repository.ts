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
import type { OrderDatabase, OrderDb, PoAllocationTable, Row } from './order.types';

export type PoAllocationRow = Row<PoAllocationTable>;
/** Dòng của danh sách: thêm ĐVCS suy từ Nhà máy SX (cột tính, null khi nhà máy chưa gắn ĐVCS) */
export type PoAllocationListRow = PoAllocationRow & { BranchCode: string | null };

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

  /** Lần chép OSM gần nhất có trong bảng; null khi bảng chưa có dòng nào (chưa đồng bộ, chưa làm mới) */
  async lastSyncedAt(scope: Scope): Promise<Date | null> {
    const qb = await this.scoped(this.db.selectFrom('PoAllocation').select(sql<Date | null>`MAX(SyncedAt)`.as('at')), scope);
    return ((await qb.executeTakeFirst()) as { at: Date | null } | undefined)?.at ?? null;
  }

  /**
   * Chạy `work` trong một transaction có khóa ứng dụng của bảng (nối tiếp với bước làm mới theo OSM). Bước làm mới đang chạy lâu
   * thì báo 409 để người dùng thử lại.
   */
  async withWriteLock<T>(work: (trx: Kysely<any>) => Promise<T>): Promise<T> {
    return inTransaction(this.db, async (trx) => {
      if (!(await lockPoAllocation(trx, 10_000))) throw Errors.conflict('Dữ liệu Phân bổ PO đang được làm mới theo OSM. Thử lại sau ít phút.');
      return work(trx);
    });
  }

  /**
   * Phạm vi của một lần đổi Nhà máy SX: số dòng `ids` xem được, số khóa của chúng, các nhóm (khóa, nhà máy hiện tại) của mọi dòng
   * cùng khóa, số dòng trong đó có nhà máy của ĐVCS khác (luật do BaseRepository dựng) và số dòng ghi được.
   */
  async target(scope: Scope, ids: number[], db: Kysely<any>) {
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
    const writable = await count(await this.scoped(base(), scope, 'update'));
    return { found: rows.length, keys: Number(keys.n), rows: groups.reduce((s, g) => s + Number(g.n), 0), groups, otherBranch, writable };
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

export interface PoAllocationRefreshResult {
  /** Không làm gì: nguồn rỗng (EMPTY) hoặc ít hơn 80% số dòng đang có trong OSM (SHRINK) */
  skipped: 'EMPTY' | 'SHRINK' | null;
  /** Số dòng khác nhau của nguồn */
  source: number;
  /** Số dòng đang có trong OSM của bảng trước lần làm mới */
  before: number;
  inserted: number;
  removed: number;
  /** Dòng nhập tay mà OSM không còn dòng nào cùng khóa: giữ, đánh dấu không còn trong OSM */
  missing: number;
  /** Dòng nhập tay trước đó không còn trong OSM nay có lại */
  restored: number;
  /** Số dòng nhập tay sau lần làm mới */
  manual: number;
  total: number;
}

/** Nguồn ít hơn tỉ lệ này so với số dòng đang có trong OSM của bảng thì không làm mới (chép OSM lỗi, view tạm thiếu dữ liệu) */
export const REFRESH_MIN_RATIO = 0.8;

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
   * Một transaction có khóa ứng dụng của bảng: chốt an toàn rồi một câu theo tập. Nguồn gửi một tham số JSON vào bảng tạm (không
   * vượt 2.100 tham số; bảng tạm chỉ sống trong một câu nên mọi bước nằm trong cùng câu). Dòng có khóa SO, PO, Style No, Màu đang
   * nhập tay nhận nhà máy nhập tay, dòng khác nhận nhà máy theo OSM; dòng không còn trong OSM thì xóa, trừ dòng nhập tay mà OSM
   * không còn dòng nào cùng khóa (giữ, IsInOsm = 0). `brand`: chỉ xét dòng của Brand này, nguồn đã lọc sẵn (bài test dùng để không
   * đụng dòng khác trên database dùng chung, như productIds của applyOsmFactories).
   */
  async refresh(source: OsmPoSourceRow[], opts: { brand?: string } = {}): Promise<PoAllocationRefreshResult> {
    const brand = opts.brand ?? null;
    return inTransaction(this.db, async (trx) => {
      if (!(await lockPoAllocation(trx, 30_000))) throw new Error('Đang có người đổi Nhà máy SX ở Phân bổ PO hoặc lần làm mới khác chạy, thử lại sau.');
      const counted = await sql<{ n: number }>`SELECT COUNT(*) AS n FROM dbo.PoAllocation WHERE IsInOsm = 1 AND (${brand} IS NULL OR Brand = ${brand})`.execute(trx);
      const before = Number(counted.rows[0]?.n ?? 0);
      const rows = new Map<string, OsmPoSourceRow>();
      for (const r of source) if (brand === null || r.brand === brand) rows.set(poRowHash(r), r);
      const empty = { source: rows.size, before, inserted: 0, removed: 0, missing: 0, restored: 0, manual: 0, total: 0 };
      if (rows.size === 0) return { skipped: 'EMPTY', ...empty };
      if (rows.size < before * REFRESH_MIN_RATIO) return { skipped: 'SHRINK', ...empty };
      return { skipped: null, before, ...(await this.apply(trx, rows, brand)) };
    });
  }

  private async apply(trx: Kysely<any>, rows: Map<string, OsmPoSourceRow>, brand: string | null) {
    const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
    // DATETIME2 nhận dạng ISO không có Z (giờ UTC như cột)
    const at = (d: Date | null) => (d ? d.toISOString().slice(0, 23) : null);
    const json = JSON.stringify(
      [...rows].map(([h, r]) => [h, r.brand, r.season, r.po, r.so, r.shipMode, r.styleName, r.styleNo, r.color, day(r.etdActual), day(r.etdRevised), r.factoryName, at(r.syncedAt)]),
    );
    const res = await sql<Omit<PoAllocationRefreshResult, 'skipped' | 'before'>>`
SET NOCOUNT ON;
-- Khóa chéo với thao tác của người dùng thì SQL Server hủy bước làm mới (thử lại), không hủy thao tác của người dùng
SET DEADLOCK_PRIORITY LOW;
DECLARE @json NVARCHAR(MAX) = ${json};
DECLARE @brand NVARCHAR(50) = ${brand};
DECLARE @inserted INT = 0, @removed INT = 0, @missing INT = 0, @restored INT = 0;
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
  SyncedAt DATETIME2(3) NULL,
  ManualFactory NVARCHAR(255) COLLATE DATABASE_DEFAULT NULL
);
INSERT INTO #src (RowHash, Brand, Season, PoNo, SoNo, ShipMode, StyleName, StyleNo, Color, EtdActualDate, EtdRevisedDate, FtyName, SyncedAt)
SELECT CONVERT(VARBINARY(32), j.h, 2), j.b, j.se, j.po, j.so, j.sm, j.sn, j.st, j.c, j.ea, j.er, j.f, j.s
FROM OPENJSON(@json) WITH (
  h CHAR(64) '$[0]', b NVARCHAR(50) '$[1]', se NVARCHAR(50) '$[2]', po NVARCHAR(51) '$[3]', so NVARCHAR(50) '$[4]', sm NVARCHAR(50) '$[5]',
  sn NVARCHAR(59) '$[6]', st NVARCHAR(61) '$[7]', c NVARCHAR(82) '$[8]', ea DATE '$[9]', er DATE '$[10]', f NVARCHAR(255) '$[11]', s DATETIME2(3) '$[12]'
) j;
CREATE INDEX IX_src_Key ON #src (PoNo, SoNo, StyleNo, Color);

-- Bản đồ khóa → nhà máy nhập tay, lấy trước khi xóa dòng cũ: dòng nhập tay đổi dấu (ETD, FtyName đổi) truyền nhà máy cho dòng mới cùng khóa
SELECT PoNo, SoNo, StyleNo, Color, MAX(ProductionFactoryCode) AS Factory INTO #manual
FROM dbo.PoAllocation WHERE IsFactoryManual = 1 AND (@brand IS NULL OR Brand = @brand)
GROUP BY PoNo, SoNo, StyleNo, Color;
UPDATE s SET ManualFactory = m.Factory
FROM #src s JOIN #manual m ON EXISTS (SELECT s.PoNo, s.SoNo, s.StyleNo, s.Color INTERSECT SELECT m.PoNo, m.SoNo, m.StyleNo, m.Color);

-- Dòng vẫn có trong OSM
SELECT @restored = COUNT(*) FROM dbo.PoAllocation t JOIN #src s ON s.RowHash = t.RowHash WHERE t.IsInOsm = 0;
UPDATE t SET
  Brand = s.Brand, Season = s.Season, PoNo = s.PoNo, SoNo = s.SoNo, ShipMode = s.ShipMode, StyleName = s.StyleName, StyleNo = s.StyleNo,
  Color = s.Color, EtdActualDate = s.EtdActualDate, EtdRevisedDate = s.EtdRevisedDate, OsmFactoryCode = s.FtyName,
  ProductionFactoryCode = CASE WHEN s.ManualFactory IS NULL THEN s.FtyName ELSE s.ManualFactory END,
  IsFactoryManual = CASE WHEN s.ManualFactory IS NULL THEN 0 ELSE 1 END,
  IsInOsm = 1, SyncedAt = s.SyncedAt
FROM dbo.PoAllocation t JOIN #src s ON s.RowHash = t.RowHash;

-- Dòng mới của OSM
INSERT INTO dbo.PoAllocation (RowHash, Brand, Season, PoNo, SoNo, ShipMode, StyleName, StyleNo, Color, EtdActualDate, EtdRevisedDate,
  OsmFactoryCode, ProductionFactoryCode, IsFactoryManual, IsInOsm, SyncedAt)
SELECT s.RowHash, s.Brand, s.Season, s.PoNo, s.SoNo, s.ShipMode, s.StyleName, s.StyleNo, s.Color, s.EtdActualDate, s.EtdRevisedDate,
  s.FtyName, CASE WHEN s.ManualFactory IS NULL THEN s.FtyName ELSE s.ManualFactory END, CASE WHEN s.ManualFactory IS NULL THEN 0 ELSE 1 END, 1, s.SyncedAt
FROM #src s WHERE NOT EXISTS (SELECT 1 FROM dbo.PoAllocation t WHERE t.RowHash = s.RowHash);
SET @inserted = @@ROWCOUNT;

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

SELECT (SELECT COUNT(*) FROM #src) AS source, @inserted AS inserted, @removed AS removed, @missing AS missing, @restored AS restored,
  (SELECT COUNT(*) FROM dbo.PoAllocation WHERE IsFactoryManual = 1 AND (@brand IS NULL OR Brand = @brand)) AS manual,
  (SELECT COUNT(*) FROM dbo.PoAllocation WHERE @brand IS NULL OR Brand = @brand) AS total;
DROP TABLE #manual;
DROP TABLE #src;`.execute(trx);
    const r = res.rows[0];
    if (!r) throw new Error('Làm mới Phân bổ PO không trả kết quả.');
    return {
      source: Number(r.source),
      inserted: Number(r.inserted),
      removed: Number(r.removed),
      missing: Number(r.missing),
      restored: Number(r.restored),
      manual: Number(r.manual),
      total: Number(r.total),
    };
  }
}
