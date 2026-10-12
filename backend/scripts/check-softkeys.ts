// Kiểm bản ghi mồ côi theo khóa ngầm giữa các database (migrations/softkeys.json). CHỈ ĐỌC, không sửa dữ liệu.
// Dùng: npm run check:softkeys -w backend      (thoát mã 1 nếu có bản ghi mồ côi)
// FK vật lý chỉ có trong cùng database (CLAUDE.md mục 5); quan hệ giữa các database chỉ được bảo vệ bằng script này.
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { sql } from 'kysely';
import { env } from '../src/config/env';
import { createDb } from '../src/platform/database/db';

interface SoftKey {
  from: string;
  to: string;
  /** Điều kiện thêm ở bảng đích, ví dụ OrgType = 'LINE' (chỉ ký tự an toàn, xem SAFE_WHERE) */
  where?: string;
  /** Giá trị đích phải cùng nhà máy với dòng nguồn (bảng đích có BranchCode) */
  sameBranch?: boolean;
  /** Đích là SysCatalogItem: chỉ đối chiếu các mục của danh mục có mã này */
  catalog?: string;
  /** Giá trị nguồn là danh sách mã cách nhau dấu ngăn này (ví dụ ","): mỗi mã trong danh sách phải có ở đích */
  list?: string;
  nullable?: boolean;
}

const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/;
const SAFE_WHERE = /^[A-Za-z][A-Za-z0-9_]* = '[A-Z0-9_]+'$/;
const DB_NAMES: Record<string, string> = { MES_Core: env.db.coreName, MES_Order: env.db.orderName, MES_Sync: env.db.syncName, MES_Sewing: env.db.sewingName, MES_Hr: env.db.hrName };
const dbName = (folder: string) => DB_NAMES[folder] ?? folder;

function parse(ref: string) {
  const [database, table, column] = ref.split('.');
  if (![table, column].every((x) => IDENT.test(x ?? ''))) throw new Error(`Khóa ngầm không hợp lệ: ${ref}`);
  return { database: dbName(database), table, column };
}

async function main() {
  const file = JSON.parse(readFileSync(resolve(__dirname, '../migrations/softkeys.json'), 'utf8')) as { softKeys: SoftKey[] };
  const conns = new Map<string, ReturnType<typeof createDb<any>>>();
  const conn = (name: string) => conns.get(name) ?? conns.set(name, createDb<any>(name)).get(name)!;
  let orphans = 0;
  // Database chưa có trên máy này (ví dụ MES_Sync khi chưa làm đồng bộ): bỏ qua kèm cảnh báo, không treo chờ kết nối
  const available = new Map<string, boolean>();
  const isAvailable = async (name: string) => {
    if (!available.has(name)) {
      const r = await sql<{ ok: number }>`SELECT CASE WHEN DB_ID(${name}) IS NOT NULL AND HAS_DBACCESS(${name}) = 1 THEN 1 ELSE 0 END AS ok`.execute(conn(env.db.coreName));
      available.set(name, r.rows[0]?.ok === 1);
    }
    return available.get(name)!;
  };
  let skipped = 0;
  try {
    for (const k of file.softKeys) {
      if (k.where && !SAFE_WHERE.test(k.where)) throw new Error(`Điều kiện không được phép: ${k.where}`);
      if (k.catalog && (k.where || !k.to.endsWith('.SysCatalogItem.Code'))) throw new Error(`"catalog" chỉ dùng cho đích SysCatalogItem.Code, không kèm "where": ${k.from}`);
      const src = parse(k.from);
      const dst = parse(k.to);
      if (!(await isAvailable(src.database)) || !(await isAvailable(dst.database))) {
        console.warn(`  BỎ QUA ${k.from} → ${k.to}: chưa có database ${(await isAvailable(src.database)) ? dst.database : src.database} hoặc chưa được cấp quyền`);
        skipped++;
        continue;
      }
      // Lấy các giá trị khác nhau ở nguồn (kèm nhà máy nếu cần so cùng nhà máy), rồi đối chiếu với đích
      const pairs = (
        await sql<{ v: string | number; b: string | null }>`SELECT DISTINCT ${sql.ref(src.column)} AS v, ${k.sameBranch ? sql.ref('BranchCode') : sql`NULL`} AS b
          FROM dbo.${sql.table(src.table)} WHERE ${sql.ref(src.column)} IS NOT NULL`.execute(conn(src.database))
      ).rows
        .flatMap((p) => (k.list && typeof p.v === 'string' ? p.v.split(k.list).map((v) => ({ v: v.trim(), b: p.b })).filter((x) => x.v) : [p]));
      const targets = (
        await sql<{ v: string | number; b: string | null }>`SELECT ${sql.ref(dst.column)} AS v, ${k.sameBranch ? sql.ref('BranchCode') : sql`NULL`} AS b
          FROM dbo.${sql.table(dst.table)} ${
            k.catalog ? sql`WHERE CatalogId IN (SELECT Id FROM dbo.SysCatalog WHERE Code = ${k.catalog})` : k.where ? sql.raw(`WHERE ${k.where}`) : sql``
          }`.execute(conn(dst.database))
      ).rows;
      const known = new Set(targets.map((t) => `${String(t.v).toUpperCase()}|${t.b ?? ''}`));
      const missing = [...new Map(pairs.map((p) => [`${String(p.v).toUpperCase()}|${p.b ?? ''}`, p])).values()].filter((p) => !known.has(`${String(p.v).toUpperCase()}|${p.b ?? ''}`));
      orphans += missing.length;
      const label = `${k.from} → ${k.to}${k.where ? ` (${k.where})` : ''}${k.catalog ? ` (danh mục ${k.catalog})` : ''}${k.sameBranch ? ', cùng nhà máy' : ''}`;
      console.log(missing.length ? `  LỖI  ${label}: ${missing.length} giá trị mồ côi, ví dụ ${missing.slice(0, 5).map((m) => `${m.v}${m.b ? `@${m.b}` : ''}`).join(', ')}` : `  OK   ${label}`);
    }
  } finally {
    for (const c of conns.values()) await c.destroy();
  }
  console.log(orphans ? `Có ${orphans} giá trị mồ côi.` : 'Không có bản ghi mồ côi.');
  if (skipped) console.warn(`${skipped} khóa ngầm chưa kiểm vì thiếu database.`);
  if (orphans) process.exitCode = 1;
}

main().catch((e) => {
  console.error('Kiểm khóa ngầm lỗi:', e.message ?? e);
  process.exit(1);
});
