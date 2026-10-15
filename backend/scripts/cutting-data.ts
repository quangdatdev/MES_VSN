// Dữ liệu module Cắt (MES_Cutting) cho các script reset-demo, load-bravo, simulate-board (phase 5.14, quyết định 13.4).
import { sql } from 'kysely';
import { env } from '../src/config/env';
import type { Kysely } from 'kysely';
import type { CuttingDatabase } from '../src/modules/cutting/cutting.types';
import type { OrderDatabase } from '../src/modules/order/order.types';
import { createDb } from '../src/platform/database/db';
import { assertDemoMachine } from './local-db';

/** Database MES_Cutting đã có chưa: máy chưa tạo thì các script bỏ qua phần module Cắt thay vì hỏng cả lệnh. */
export async function hasCuttingDb(): Promise<boolean> {
  const master = createDb<any>('master');
  try {
    const r = await sql<{ id: number | null }>`SELECT DB_ID(${env.db.cuttingName}) AS id`.execute(master);
    return r.rows[0]?.id != null;
  } finally {
    await master.destroy();
  }
}

/**
 * Dữ liệu đơn hàng vừa bị xóa và đánh số lại (reset:demo, load:bravo): bản chép kế hoạch và số cắt đã nhập không còn ứng với kế hoạch
 * xuất hàng nào (Id kế hoạch mới có thể trùng Id cũ), lệnh cấp BTP không còn phân bổ màu cỡ nào. Xóa hết: số cắt trước (khóa ngoại
 * không xóa theo cha), rồi bản chép; lệnh cấp BTP (số cấp xóa theo lệnh). Trả số.
 */
export async function clearCutting(): Promise<{ plans: number; entries: number; supplies: number }> {
  assertDemoMachine('xóa dữ liệu Đồng bộ tiến độ cắt, Xác nhận cấp BTP');
  if (!(await hasCuttingDb())) return { plans: 0, entries: 0, supplies: 0 };
  const db = createDb<CuttingDatabase>(env.db.cuttingName);
  try {
    return await db.transaction().execute(async (trx) => {
      const entries = Number((await trx.deleteFrom('CuttingPlanDaily').executeTakeFirst()).numDeletedRows);
      const plans = Number((await trx.deleteFrom('CuttingPlan').executeTakeFirst()).numDeletedRows);
      const supplies = Number((await trx.deleteFrom('CuttingSupply').executeTakeFirst()).numDeletedRows);
      return { plans, entries, supplies };
    });
  } finally {
    await db.destroy();
  }
}

/**
 * Kế hoạch xuất hàng đang có số cắt (Id → thời điểm tạo của kế hoạch nguồn), để simulate-board không xóa (quyết định 13.4: muốn xóa
 * phải Xóa số cắt trước). Đọc trước transaction của MES_Order (hai database không có transaction chung).
 */
export async function plansWithCuts(): Promise<Map<number, Date>> {
  if (!(await hasCuttingDb())) return new Map();
  const db = createDb<CuttingDatabase>(env.db.cuttingName);
  try {
    const rows = await db
      .selectFrom('CuttingPlan as p')
      .select(['p.ShipmentPlanId', 'p.SourceCreatedAt'])
      .where('p.ShipmentPlanId', 'is not', null)
      .where((eb) => eb.exists(eb.selectFrom('CuttingPlanDaily as d').select('d.Id').whereRef('d.CuttingPlanId', '=', 'p.Id')))
      .execute();
    return new Map(rows.map((r) => [r.ShipmentPlanId!, r.SourceCreatedAt]));
  } finally {
    await db.destroy();
  }
}

/**
 * Kế hoạch xuất hàng có mã hàng đã cấp BTP ở ĐVCS của nó (Id → thời điểm tạo), để simulate-board không xóa: phần giao ở Phân bổ màu cỡ
 * không được giảm dưới số đã cấp (quyết định 13.8). Giữ theo mã hàng (rộng hơn theo chuyền) cho đơn giản. Đọc trước transaction của
 * MES_Order.
 */
export async function plansWithSupply(order: Kysely<OrderDatabase>): Promise<Map<number, Date>> {
  if (!(await hasCuttingDb())) return new Map();
  const db = createDb<CuttingDatabase>(env.db.cuttingName);
  try {
    const styles = await db.selectFrom('CuttingSupply').select(['BranchCode', 'StyleCode']).distinct().execute();
    const out = new Map<number, Date>();
    // 2 tham số mỗi cặp: dưới giới hạn 2.100 tham số của SQL Server
    for (let i = 0; i < styles.length; i += 500) {
      const chunk = styles.slice(i, i + 500);
      const rows = await order
        .selectFrom('ShipmentPlan')
        .select(['Id', 'CreatedAt'])
        .where((eb) => eb.or(chunk.map((s) => eb.and([eb('BranchCode', '=', s.BranchCode), eb('StyleCode', '=', s.StyleCode)]))))
        .execute();
      for (const r of rows) out.set(r.Id, r.CreatedAt);
    }
    return out;
  } finally {
    await db.destroy();
  }
}
