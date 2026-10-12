import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { sqlErrorNumbers } from '../../common/db-errors';
import { env } from '../../config/env';
import { CORE_DB, type CoreDb } from '../database/database.module';
import { readBravoOrderSource, readOsmFactories, readOsmFactoryLists } from './bravo-order-source';
import { readOsmPoSource, readOsmPoSourceActive } from './osm-po-source';
import { createSyncRunner, SYNC_DB } from './sync.db';
import type { SyncDb, SyncMode } from './sync.types';

/** Chưa có bảng vì chưa migrate (208) */
const NOT_MIGRATED = 208;
/** Trùng chỉ mục duy nhất: nguồn đã có một lần đang chờ hoặc đang chạy */
const DUPLICATE = new Set([2601, 2627]);

export const isNotMigrated = (e: unknown) => sqlErrorNumbers(e).includes(NOT_MIGRATED);
/** Không vào được database (bị gỡ, thu hồi quyền, mất kết nối): tedious báo lỗi đăng nhập/kết nối, không có mã SQL */
export const isConnectionLost = (e: unknown) => ['ELOGIN', 'ESOCKET', 'ETIMEOUT'].includes((e as { code?: string })?.code ?? '') || (e as Error)?.name === 'TimeoutError';
const isDuplicate = (e: unknown) => sqlErrorNumbers(e).some((n) => DUPLICATE.has(n));

/** Truy cập MES_Sync. Bảng hệ thống dùng chung toàn công ty, không theo nhà máy (ADR 0007). */
@Injectable()
export class SyncRepository {
  constructor(
    @Inject(SYNC_DB) private readonly db: SyncDb,
    @Inject(CORE_DB) private readonly core: CoreDb,
  ) {}

  /**
   * Hỏi qua kết nối MES_Core: MES_Sync đã có và tài khoản vào được chưa. Không thử thẳng vào MES_Sync vì khi chưa có,
   * lỗi trả về là lỗi đăng nhập chung chung, không phân biệt được với sai mật khẩu.
   */
  async databaseReady(): Promise<boolean> {
    const name = env.db.syncName;
    const r = await sql<{ ok: number }>`SELECT CASE WHEN DB_ID(${name}) IS NOT NULL AND HAS_DBACCESS(${name}) = 1 THEN 1 ELSE 0 END AS ok`.execute(this.core);
    return r.rows[0]?.ok === 1;
  }

  listSources() {
    return this.db
      .selectFrom('SyncSource as s')
      .leftJoin('SyncRun as r', 'r.Id', 's.LastRunId')
      .select([
        's.Id',
        's.Code',
        's.Name',
        's.Description',
        's.SystemCode',
        's.GroupCode',
        's.SourceObject',
        's.TargetTable',
        's.SyncModeCode',
        's.KeyColumns',
        's.OverlapMinutes',
        's.WatermarkAt',
        'r.Id as RunId',
        'r.StatusCode',
        'r.ModeCode',
        'r.SinceAt',
        'r.ReadCount',
        'r.InsertedCount',
        'r.UpdatedCount',
        'r.DeletedCount',
        'r.QueuedAt',
        'r.StartedAt',
        'r.FinishedAt',
        'r.ErrorMessage',
      ])
      .where('s.IsActive', '=', true)
      .orderBy('s.SortOrder')
      .orderBy('s.Id')
      .execute();
  }

  /** Lần thành công gần nhất của từng nguồn (thời điểm, số dòng đang có) và lần chép toàn bộ thành công gần nhất */
  async lastSuccess() {
    const latest = await this.db
      .selectFrom('SyncRun as r')
      .innerJoin(
        // Hằng (sql.lit), không tham số: SQL Server chỉ dùng chỉ mục lọc IX_SyncRun_Succeeded khi điều kiện là hằng
        (eb) => eb.selectFrom('SyncRun').select(['SyncSourceId', sql<string>`MAX(Id)`.as('MaxId')]).where('StatusCode', '=', sql.lit('SUCCEEDED')).groupBy('SyncSourceId').as('m'),
        (j) => j.onRef('m.MaxId', '=', 'r.Id'),
      )
      .select(['r.SyncSourceId', 'r.FinishedAt', 'r.TargetCount'])
      .execute();
    const full = await this.db
      .selectFrom('SyncRun')
      .select(['SyncSourceId', sql<Date>`MAX(FinishedAt)`.as('LastFullAt')])
      .where('StatusCode', '=', sql.lit('SUCCEEDED'))
      .where('ModeCode', '=', sql.lit('FULL'))
      .groupBy('SyncSourceId')
      .execute();
    const fullBy = new Map(full.map((f) => [f.SyncSourceId, f.LastFullAt]));
    return latest.map((r) => ({ ...r, LastFullAt: fullBy.get(r.SyncSourceId) ?? null }));
  }

  async listRuns(sourceId: number, page: number, pageSize: number) {
    const base = () => this.db.selectFrom('SyncRun').where('SyncSourceId', '=', sourceId);
    const total = await base().select(sql<number>`COUNT(*)`.as('n')).executeTakeFirstOrThrow();
    const rows = await base().selectAll().orderBy('Id', 'desc').offset((page - 1) * pageSize).fetch(pageSize).execute();
    return { total: Number(total.n), rows };
  }

  /**
   * Xếp hàng mỗi nguồn một lần chạy. Nguồn đã có lần đang chờ/đang chạy thì bỏ qua (chỉ mục duy nhất UX_SyncRun_Active
   * chặn ở DB, kể cả khi hai người bấm cùng lúc). Trả các nguồn đã xếp và các nguồn bị bỏ qua.
   */
  async enqueue(sourceIds: number[], mode: SyncMode, batchId: string, userId: number) {
    const queued: number[] = [];
    const skipped: number[] = [];
    for (const sourceId of sourceIds) {
      try {
        await this.db.transaction().execute(async (trx) => {
          const run = await trx
            .insertInto('SyncRun')
            .values({ SyncSourceId: sourceId, BatchId: batchId, ModeCode: mode, StatusCode: 'QUEUED', CreatedBy: userId })
            .output('inserted.Id')
            .executeTakeFirstOrThrow();
          // Chỉ đổi con trỏ tới lần chạy mới nhất; ModifiedAt/ModifiedBy của nguồn để dành cho thay đổi cấu hình
          await trx.updateTable('SyncSource').set({ LastRunId: run.Id }).where('Id', '=', sourceId).execute();
        });
        queued.push(sourceId);
      } catch (e) {
        if (!isDuplicate(e)) throw e;
        skipped.push(sourceId);
      }
    }
    return { queued, skipped };
  }

  /** Lần chạy đang chờ theo thứ tự xếp hàng */
  async queuedRunIds(): Promise<string[]> {
    const rows = await this.db.selectFrom('SyncRun').select('Id').where('StatusCode', '=', 'QUEUED').orderBy('Id').execute();
    return rows.map((r) => String(r.Id));
  }

  /** Chạy một lần đã xếp hàng trên kết nối riêng (sync.db.ts); thủ tục tự nhận việc, ghi kết quả hoặc lỗi vào SyncRun. */
  async execute(runId: string) {
    const runner = createSyncRunner();
    try {
      await sql`EXEC dbo.usp_SyncRun_Execute @RunId = ${runId}`.execute(runner);
    } finally {
      await runner.destroy();
    }
  }

  async recoverStale() {
    await sql`EXEC dbo.usp_SyncRun_RecoverStale`.execute(this.db);
  }

  /** Lần chạy không gọi được thủ tục (mất kết nối trước khi nhận việc): đánh dấu lỗi để hàng đợi không kẹt */
  async failIfQueued(runId: string, message: string) {
    await this.db
      .updateTable('SyncRun')
      .set({ StatusCode: 'FAILED', ErrorMessage: message.slice(0, 2000), FinishedAt: new Date(), ModifiedAt: new Date() })
      .where('Id', '=', runId)
      .where('StatusCode', '=', 'QUEUED')
      .execute();
  }

  /** Tên chi nhánh theo BRAVO (chỉ đọc) */
  branchNames() {
    return this.db.selectFrom('bravo.DM_CHINHANH').select(['BranchCode', 'TenChiNhanh']).execute();
  }

  /** Danh mục chi nhánh BRAVO đủ cột để chép thành Đơn vị cơ sở (chỉ đọc) */
  bravoBranches() {
    return this.db.selectFrom('bravo.DM_CHINHANH').select(['BranchCode', 'TenChiNhanh', 'TenDayDu']).orderBy('BranchCode').execute();
  }

  /**
   * Đơn hàng, PO, màu cỡ BRAVO đã chép của các ĐVCS `branches` (chỉ đọc). Kết nối riêng, không theo giới hạn 15 giây của pool
   * màn hình: bảng chép lớn dần theo năm
   */
  async bravoOrderSource(branches: string[]) {
    const reader = createSyncRunner();
    try {
      return await readBravoOrderSource(reader, branches);
    } finally {
      await reader.destroy();
    }
  }

  /** Nhà máy SX theo OSM của từng sản phẩm BRAVO (chỉ đọc) */
  osmFactories() {
    return readOsmFactories(this.db);
  }

  /** Các danh sách nhà máy khác nhau trong bảng chép OSM (chỉ đọc) */
  osmFactoryLists() {
    return readOsmFactoryLists(this.db);
  }

  /** Phân bổ PO theo OSM: mọi dòng khác nhau của bảng chép osm.OSMData (chỉ đọc); null khi chưa có bảng chép */
  osmPoSource() {
    return readOsmPoSource(this.db);
  }

  /** Nguồn đồng bộ Phân bổ PO theo OSM đang bật chưa (chỉ đọc) */
  osmPoSourceActive() {
    return readOsmPoSourceActive(this.db);
  }

  /** Mã nguồn và trạng thái của một lần chạy, để chạy việc nối tiếp khi nguồn chép xong */
  runOutcome(runId: string) {
    return this.db
      .selectFrom('SyncRun as r')
      .innerJoin('SyncSource as s', 's.Id', 'r.SyncSourceId')
      .select(['s.Code', 'r.StatusCode'])
      .where('r.Id', '=', runId)
      .executeTakeFirst();
  }

  /** Cột dữ liệu của bảng chép theo thứ tự trong bảng, bỏ cột kỹ thuật của lớp đồng bộ */
  async tableColumns(target: string) {
    const r = await sql<{ name: string; type: string }>`
      SELECT c.name, TYPE_NAME(c.system_type_id) AS type FROM sys.columns c
      WHERE c.object_id = OBJECT_ID(${target}) AND c.name NOT IN ('SyncRowId', 'SyncRunId', 'SyncedAt')
      ORDER BY c.column_id`.execute(this.db);
    return r.rows;
  }

  /**
   * Một trang dữ liệu của bảng chép (chỉ đọc). `target` và tên cột phải lấy từ SyncSource và sys.columns, không từ client:
   * chúng đi vào câu lệnh dưới dạng định danh. Tìm `q` trên các cột chữ.
   */
  async tableRows(target: string, columns: string[], textColumns: string[], orderBy: string[], q: string | undefined, page: number, pageSize: number) {
    const from = sql.table(target);
    const pattern = q ? `%${q.replace(/[%_[]/g, (c) => `[${c}]`)}%` : null;
    const where = !pattern ? sql`` : textColumns.length ? sql`WHERE ${sql.join(textColumns.map((c) => sql`${sql.ref(c)} LIKE ${pattern}`), sql` OR `)}` : sql`WHERE 1 = 0`;
    const total = await sql<{ n: number }>`SELECT COUNT(*) AS n FROM ${from} ${where}`.execute(this.db);
    const rows = await sql<Record<string, unknown>>`
      SELECT ${sql.join(columns.map((c) => sql.ref(c)))} FROM ${from} ${where}
      ORDER BY ${sql.join(orderBy.map((c) => sql.ref(c)))}
      OFFSET ${(page - 1) * pageSize} ROWS FETCH NEXT ${pageSize} ROWS ONLY`.execute(this.db);
    return { total: Number(total.rows[0]?.n ?? 0), rows: rows.rows };
  }
}
