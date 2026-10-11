// Dữ liệu module May (MES_Sewing) cho các script seed, reset-demo, load-bravo.
import { sql } from 'kysely';
import { env } from '../src/config/env';
import { createDb } from '../src/platform/database/db';
import type { SewingDatabase } from '../src/modules/sewing/sewing.types';
import { assertLocalDb } from './local-db';

/** Database MES_Sewing đã có chưa: máy chưa tạo thì các script bỏ qua phần module May thay vì hỏng cả lệnh. */
export async function hasSewingDb(): Promise<boolean> {
  const master = createDb<any>('master');
  try {
    const r = await sql<{ id: number | null }>`SELECT DB_ID(${env.db.sewingName}) AS id`.execute(master);
    return r.rows[0]?.id != null;
  } finally {
    await master.destroy();
  }
}

/**
 * Dữ liệu đơn hàng vừa bị xóa và đánh số lại (reset:demo, load:bravo): bản chép Kế hoạch chuẩn bị SX cùng ngày đã nhập
 * không còn ứng với dòng dàn chuyền nào. Xóa hết (ngày theo bước xóa theo), giữ danh mục bước. Trả số dòng đã xóa.
 */
export async function clearSewingPrep(): Promise<number> {
  assertLocalDb('xóa Kế hoạch chuẩn bị SX');
  if (!(await hasSewingDb())) return 0;
  const db = createDb<SewingDatabase>(env.db.sewingName);
  try {
    const r = await db.deleteFrom('SewingPrep').executeTakeFirst();
    return Number(r.numDeletedRows);
  } finally {
    await db.destroy();
  }
}
