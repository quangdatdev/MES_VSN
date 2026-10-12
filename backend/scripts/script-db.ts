// Hàm dùng chung cho các script ghi dữ liệu demo (load-bravo-orders, simulate-board).
import type { Kysely } from 'kysely';
import { env } from '../src/config/env';
import type { HrDatabase } from '../src/modules/hr/hr.types';
import type { CoreDatabase } from '../src/platform/database/core.types';
import { createDb } from '../src/platform/database/db';
import { hrDbState } from './hr-data';

/**
 * Chèn theo lô vừa giới hạn của SQL Server (2.100 tham số, 1.000 dòng mỗi câu); trả các cột OUTPUT nếu cần.
 * Nhận Kysely<any> vì dùng chung cho nhiều bảng của nhiều database; kiểu dòng do nơi gọi chịu trách nhiệm.
 */
export async function insertAll(db: Kysely<any>, table: string, rows: Record<string, unknown>[], output?: string[]) {
  const out: any[] = [];
  if (!rows.length) return out;
  const per = Math.max(1, Math.min(1000, Math.floor(2000 / Object.keys(rows[0]).length)));
  for (let i = 0; i < rows.length; i += per) {
    const qb = db.insertInto(table).values(rows.slice(i, i + per));
    if (output) out.push(...(await qb.output(output.map((c) => `inserted.${c}` as any)).execute()));
    else await qb.execute();
  }
  return out;
}

/** Hôm nay theo giờ máy (không theo UTC): trạng thái đang may, đã xong tính theo ngày này */
export const localToday = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/**
 * Chuyền may đang dùng: bộ phận tích "Xưởng sản xuất", đang dùng (chưa giải thể), có ĐVCS ở MES_Hr (phase 5.10, cùng điều kiện
 * với nguồn chuyền HrLineSource của backend). Bộ phận bỏ tích hay đã giải thể không nhận việc mới nên không xếp vào.
 */
function productionLines(hr: Kysely<HrDatabase>) {
  return hr
    .selectFrom('Department')
    .select(['Code', 'BranchCode'])
    .where('IsProductionWorkshop', '=', true)
    .where('IsActive', '=', true)
    .where('BranchCode', 'is not', null)
    .orderBy('SortOrder')
    .orderBy('Code')
    .execute();
}

/**
 * Nhà máy đang dùng (không gồm đơn vị tổng hợp) và Id người lập mẫu đọc từ MES_Core; chuyền đang dùng của từng nhà máy đọc từ
 * MES_Hr. `hr`: kết nối MES_Hr có sẵn (test); không truyền thì mở rồi đóng ở đây. Chưa có MES_Hr hoặc chưa migrate thì không có
 * chuyền nào (dàn chuyền để trống), không dừng script.
 */
export async function readLines(core: Kysely<CoreDatabase>, hr?: Kysely<HrDatabase>) {
  const branches = (await core.selectFrom('SysBranch').select('Code').where('IsActive', '=', true).where('IsAggregate', '=', false).orderBy('Code').execute()).map((b) => b.Code);
  const planner = await core.selectFrom('SysUser').select('Id').where('Username', '=', 'kehoach.a').executeTakeFirst();
  let lineRows: { Code: string; BranchCode: string | null }[] = [];
  if (hr) {
    lineRows = await productionLines(hr);
  } else if ((await hrDbState()) === 'ready') {
    const own = createDb<HrDatabase>(env.db.hrName);
    try {
      lineRows = await productionLines(own);
    } finally {
      await own.destroy();
    }
  } else {
    console.warn(`Chưa có database ${env.db.hrName} (hoặc chưa chạy migration): không có chuyền may nào, dàn chuyền để trống.`);
  }
  return { branches, linesOf: (b: string) => lineRows.filter((l) => l.BranchCode === b).map((l) => l.Code), plannerId: planner?.Id ?? null };
}

/**
 * Số chứng từ theo Id như khi tạo trên màn hình: PREFIX-<nhà máy>-<Id 6 số>, Id hơn 6 số thì giữ nguyên
 * (như padStart(6) của BaseRepository), không cắt mất chữ số đầu.
 */
export const docNoSql = (prefix: string) =>
  `CONCAT('${prefix}-', BranchCode, '-', CASE WHEN Id > 999999 THEN CAST(Id AS VARCHAR(10)) ELSE RIGHT('000000' + CAST(Id AS VARCHAR(10)), 6) END)`;
