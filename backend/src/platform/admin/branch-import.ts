import { sql, type Kysely } from 'kysely';
import type { CoreDatabase } from '../database/core.types';

/** Một dòng của danh mục chi nhánh BRAVO (MES_Sync.bravo.DM_CHINHANH) */
export interface BravoBranchRow {
  BranchCode: string | null;
  TenChiNhanh: string | null;
  TenDayDu: string | null;
}

export interface BranchImportResult {
  /** ĐVCS mới thêm vào MES */
  added: { code: string; name: string }[];
  /** ĐVCS đã có, đổi tên hoặc tên đầy đủ theo BRAVO */
  updated: { code: string; from: { name: string; description: string | null }; to: { name: string; description: string | null } }[];
  /** ĐVCS của MES (trừ đơn vị tổng hợp) không còn trong BRAVO: giữ nguyên, quản trị tự quyết bật hay tắt */
  missing: string[];
  /** Dòng BRAVO bỏ qua: mã sai dạng hoặc trùng mã đơn vị tổng hợp */
  skipped: string[];
}

/** Như cột SysBranch.Code (VARCHAR(10)): chữ hoa không dấu và số */
const CODE = /^[A-Z0-9]{1,10}$/;
const clip = (s: string | null | undefined, max: number) => {
  const t = s?.trim();
  return t ? t.slice(0, max) : null;
};

/** Mã ĐVCS lấy được từ một dòng BRAVO, null nếu sai dạng */
export const bravoBranchCode = (r: Pick<BravoBranchRow, 'BranchCode'>) => {
  const code = r.BranchCode?.trim().toUpperCase() ?? '';
  return CODE.test(code) ? code : null;
};

/**
 * Chép danh mục chi nhánh BRAVO thành Đơn vị cơ sở (SysBranch, ADR 0013): thêm mã chưa có, đổi tên ngắn (TenChiNhanh) và
 * tên đầy đủ (TenDayDu, cột Description) theo BRAVO. Không tắt ĐVCS vắng trong BRAVO và không đụng đơn vị tổng hợp: ai
 * được vào đâu do quản trị MES quyết. Dùng chung cho màn Quản trị, việc sau khi đồng bộ và script seed.
 * Mỗi ĐVCS chép về có nút gốc trong cây tổ chức (SysOrgUnit loại FACTORY, cùng mã, cùng tên): giới hạn vai trò theo ĐVCS
 * ở màn Người dùng chọn nút này (review 5.9 L3).
 * `rows` rỗng (chưa đồng bộ) thì không làm gì. Chạy trong một transaction, nối tiếp bằng khóa ứng dụng: bấm nút đúng lúc
 * việc tự chạy sau đồng bộ đang chạy thì lần sau chờ lần trước (review 5.9 L5).
 */
export async function importBravoBranches(db: Kysely<CoreDatabase>, rows: BravoBranchRow[], actorId: number | null): Promise<BranchImportResult> {
  const result: BranchImportResult = { added: [], updated: [], missing: [], skipped: [] };
  const wanted = new Map<string, { name: string; description: string | null }>();
  for (const r of rows) {
    const code = bravoBranchCode(r);
    if (!code) {
      result.skipped.push(r.BranchCode?.trim() || '(trống)');
      continue;
    }
    if (wanted.has(code)) continue;
    wanted.set(code, { name: clip(r.TenChiNhanh, 100) ?? clip(r.TenDayDu, 100) ?? code, description: clip(r.TenDayDu, 255) });
  }
  if (wanted.size === 0) return result;

  await db.transaction().execute(async (trx) => {
    const lock = await sql<{ r: number }>`DECLARE @r INT; EXEC @r = sp_getapplock @Resource = 'MES_Core.SysBranch.Import', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 30000; SELECT @r AS r`.execute(trx);
    if ((lock.rows[0]?.r ?? -1) < 0) throw new Error('Đang có lần cập nhật đơn vị cơ sở khác chạy, thử lại sau.');
    const current = await trx.selectFrom('SysBranch').select(['Id', 'Code', 'Name', 'Description', 'IsAggregate', 'SortOrder']).execute();
    const byCode = new Map(current.map((b) => [b.Code.toUpperCase(), b]));
    let sort = Math.max(0, ...current.map((b) => b.SortOrder));
    const now = new Date();
    for (const [code, v] of wanted) {
      const b = byCode.get(code);
      if (b?.IsAggregate) {
        result.skipped.push(code);
        continue;
      }
      if (!b) {
        sort += 10;
        await trx
          .insertInto('SysBranch')
          .values({ Code: code, Name: v.name, Description: v.description, IsAggregate: false, SortOrder: sort, IsActive: true, IsSystem: true, CreatedBy: actorId })
          .execute();
        result.added.push({ code, name: v.name });
      } else if (b.Name !== v.name || (b.Description ?? null) !== v.description) {
        await trx.updateTable('SysBranch').set({ Name: v.name, Description: v.description, ModifiedAt: now, ModifiedBy: actorId }).where('Id', '=', b.Id).execute();
        result.updated.push({ code: b.Code, from: { name: b.Name, description: b.Description }, to: v });
      }
    }
    result.missing = current.filter((b) => !b.IsAggregate && !wanted.has(b.Code.toUpperCase())).map((b) => b.Code);

    // Nút gốc của cây tổ chức: thêm nếu chưa có, đổi tên theo ĐVCS. SysOrgUnit có trigger nên chèn không dùng OUTPUT
    const nodes = await trx.selectFrom('SysOrgUnit').select(['Id', 'Code', 'Name']).where('OrgType', '=', 'FACTORY').execute();
    const nodeOf = new Map(nodes.map((n) => [n.Code.toUpperCase(), n]));
    const sortOf = new Map((await trx.selectFrom('SysBranch').select(['Code', 'SortOrder']).execute()).map((b) => [b.Code.toUpperCase(), b.SortOrder]));
    for (const [code, v] of wanted) {
      if (byCode.get(code)?.IsAggregate) continue;
      const node = nodeOf.get(code);
      if (!node) {
        await trx
          .insertInto('SysOrgUnit')
          .values({ Code: code, Name: v.name, OrgType: 'FACTORY', ParentId: null, ParentOrgType: null, BranchCode: code, Path: `/${code}/`, SortOrder: sortOf.get(code) ?? 0, IsActive: true, IsSystem: true, CreatedBy: actorId } as any)
          .execute();
      } else if (node.Name !== v.name) {
        await trx.updateTable('SysOrgUnit').set({ Name: v.name, ModifiedAt: now, ModifiedBy: actorId }).where('Id', '=', node.Id).execute();
      }
    }
  });
  return result;
}
