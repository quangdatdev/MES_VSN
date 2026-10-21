// Chép Đơn vị cơ sở theo danh mục chi nhánh BRAVO cho các script (seed, nạp BRAVO). Ứng dụng làm việc này ở màn Quản trị ›
// Đơn vị cơ sở và sau mỗi lần đồng bộ danh mục chi nhánh (quyết định 6.1).
import { sql, type Kysely } from 'kysely';
import { env } from '../src/config/env';
import type { CoreDatabase } from '../src/platform/database/core.types';
import { createDb } from '../src/platform/database/db';
import { importBravoBranches, type BranchImportResult, type BravoBranchRow } from '../src/platform/admin/branch-import';

/** Danh mục chi nhánh BRAVO đã chép trong MES_Sync; null khi máy chưa có MES_Sync hoặc chưa đồng bộ danh mục này */
export async function readBravoBranches(): Promise<BravoBranchRow[] | null> {
  const master = createDb<any>('master');
  try {
    const r = await sql<{ id: number | null }>`SELECT DB_ID(${env.db.syncName}) AS id`.execute(master);
    if (r.rows[0]?.id == null) return null;
  } finally {
    await master.destroy();
  }
  const sync = createDb<any>(env.db.syncName);
  try {
    const rows = await sql<BravoBranchRow>`SELECT BranchCode, TenChiNhanh, TenDayDu FROM bravo.DM_CHINHANH`.execute(sync).catch(() => null);
    return rows?.rows.length ? rows.rows : null;
  } finally {
    await sync.destroy();
  }
}

/** Thêm, đổi tên ĐVCS theo BRAVO; trả null khi chưa có danh mục chi nhánh BRAVO để chép */
export async function syncBranchesFromBravo(core: Kysely<CoreDatabase>): Promise<BranchImportResult | null> {
  const rows = await readBravoBranches();
  if (!rows) return null;
  const result = await importBravoBranches(core, rows, null);
  if (result.added.length || result.updated.length) {
    await core
      .insertInto('SysAuditLog')
      .values({ EntityType: 'SysBranch', ActionCode: 'BRANCH_IMPORT', Username: 'system', NewValue: JSON.stringify({ by: 'scripts', added: result.added, updated: result.updated }) } as any)
      .execute();
  }
  return result;
}
