// Dữ liệu module May (MES_Sewing) cho các script seed, reset-demo, load-bravo.
import { sql, type Kysely } from 'kysely';
import { env } from '../src/config/env';
import { createDb } from '../src/platform/database/db';
import type { SewingDatabase } from '../src/modules/sewing/sewing.types';
import { assertDemoMachine } from './local-db';

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
  assertDemoMachine('xóa Kế hoạch chuẩn bị SX');
  if (!(await hasSewingDb())) return 0;
  const db = createDb<SewingDatabase>(env.db.sewingName);
  try {
    const r = await db.deleteFrom('SewingPrep').executeTakeFirst();
    return Number(r.numDeletedRows);
  } finally {
    await db.destroy();
  }
}

/** Bảng Kế hoạch may (MES_Sewing/0003, phase 5.16) đã có chưa: máy chưa chạy migration mới thì bỏ qua */
async function hasDayPlanTable(db: Kysely<SewingDatabase>): Promise<boolean> {
  const r = await sql<{ id: number | null }>`SELECT OBJECT_ID('dbo.SewingDayPlan') AS id`.execute(db);
  return r.rows[0]?.id != null;
}

/**
 * Như clearSewingPrep cho Kế hoạch may (phase 5.16): Id dòng dàn chuyền được đánh số lại nên kế hoạch theo ngày cũ không còn ứng với
 * dòng nào. Xóa hết (dòng của ngày xóa theo). Trả số bản ghi chuyền × ngày đã xóa.
 */
export async function clearSewingDayPlan(): Promise<number> {
  assertDemoMachine('xóa Kế hoạch may');
  if (!(await hasSewingDb())) return 0;
  const db = createDb<SewingDatabase>(env.db.sewingName);
  try {
    if (!(await hasDayPlanTable(db))) return 0;
    const r = await db.deleteFrom('SewingDayPlan').executeTakeFirst();
    return Number(r.numDeletedRows);
  } finally {
    await db.destroy();
  }
}

/**
 * Dòng dàn chuyền đã có kế hoạch theo ngày ở Kế hoạch may (Id → thời điểm tạo của dòng nguồn), để sim:board giữ kế hoạch của chúng
 * (Xếp chuyền không bỏ được dòng đã có số, quyết định 14.2). Đọc trước transaction của MES_Order như Kế hoạch chuẩn bị SX.
 */
export async function dayPlanLines(): Promise<Map<number, Date | null>> {
  if (!(await hasSewingDb())) return new Map();
  const db = createDb<SewingDatabase>(env.db.sewingName);
  try {
    if (!(await hasDayPlanTable(db))) return new Map();
    const rows = await db.selectFrom('SewingDayPlanItem').select(['ShipmentPlanLineId', 'SourceCreatedAt']).distinct().execute();
    return new Map(rows.map((r) => [r.ShipmentPlanLineId, r.SourceCreatedAt]));
  } finally {
    await db.destroy();
  }
}
