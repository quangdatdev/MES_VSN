// Chạy migration .sql theo từng database: backend/migrations/<Database>/NNNN_ten.sql
// Dùng: npm run migrate            (tất cả database)
//       npm run migrate -- MES_Core (một database)
// Chỉ chạy khi người dùng gọi lệnh; không tự chạy lúc khởi động ứng dụng.
import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { sql, type Kysely } from 'kysely';
import { env } from '../src/config/env';
import { createDb } from '../src/platform/database/db';

const root = resolve(__dirname, '../migrations');

// Tên thư mục -> tên database thật (cấu hình qua .env)
function dbName(folder: string): string {
  if (folder === 'MES_Core') return env.db.coreName;
  if (folder === 'MES_Order') return env.db.orderName;
  if (folder === 'MES_Sewing') return env.db.sewingName;
  if (folder === 'MES_Hr') return env.db.hrName;
  if (folder === 'MES_Sync') return env.db.syncName;
  return folder;
}

function splitBatches(text: string): string[] {
  return text.split(/^\s*GO\s*$/gim).map((b) => b.trim()).filter(Boolean);
}

async function ensureDatabase(name: string) {
  const master = createDb<any>('master');
  try {
    await sql.raw(`IF DB_ID(N'${name.replace(/'/g, "''")}') IS NULL CREATE DATABASE [${name.replace(/]/g, ']]')}]`).execute(master);
  } catch (e) {
    // Tài khoản ứng dụng thường không có quyền tạo database: chỉ rõ việc cần làm thay vì lỗi quyền chung chung
    throw new Error(
      `Chưa có database ${name} và tài khoản trong .env không tạo được (${(e as Error).message}). ` +
        `Nhờ quản trị CSDL tạo database ${name}, cấp db_owner cho tài khoản ứng dụng, rồi chạy lại npm run migrate.`,
      { cause: e },
    );
  } finally {
    await master.destroy();
  }
}

/**
 * Synonym của nguồn BRAVO trỏ tới view trong database trung gian (DB_TRUNGGIAN_NAME). Tạo lại mỗi lần migrate để
 * đổi tên database trung gian chỉ cần sửa .env, không cần migration mới. Thủ tục chép chỉ đọc qua synonym này.
 */
// Kysely<any>: script chạy DDL trên database bất kỳ, không có kiểu bảng
async function linkSyncSources(db: Kysely<any>) {
  const staging = env.db.stagingName;
  if (!staging) {
    console.warn(`  [${env.db.syncName}] chưa có DB_TRUNGGIAN_NAME trong .env: bỏ qua tạo synonym, đồng bộ BRAVO sẽ báo lỗi khi chạy`);
    return;
  }
  if (!/^[A-Za-z0-9_-]+$/.test(staging)) throw new Error('DB_TRUNGGIAN_NAME chỉ gồm chữ, số, gạch dưới, gạch ngang');
  const rows = (
    await sql<{ SourceSynonym: string; SourceObject: string; Current: string | null }>`
      SELECT s.SourceSynonym, s.SourceObject, sy.base_object_name AS [Current]
      FROM dbo.SyncSource s LEFT JOIN sys.synonyms sy ON sy.object_id = OBJECT_ID(s.SourceSynonym)
      WHERE s.SystemCode = 'BRAVO'`.execute(db)
  ).rows;
  let changed = 0;
  for (const r of rows) {
    const [schema, name] = r.SourceSynonym.split('.');
    const quote = (n: string) => `[${n.replace(/]/g, ']]')}]`;
    const target = `${quote(staging)}.[dbo].${quote(r.SourceObject)}`;
    if (r.Current === target) continue;
    await sql.raw(`IF OBJECT_ID(N'${r.SourceSynonym.replace(/'/g, "''")}', N'SN') IS NOT NULL DROP SYNONYM ${quote(schema)}.${quote(name)}`).execute(db);
    await sql.raw(`CREATE SYNONYM ${quote(schema)}.${quote(name)} FOR ${target}`).execute(db);
    changed++;
  }
  console.log(`  [${env.db.syncName}] synonym tới ${staging}: ${changed === 0 ? 'đã đúng' : `tạo lại ${changed}`}`);
}

async function migrate(folder: string) {
  const name = dbName(folder);
  await ensureDatabase(name);
  const db = createDb<any>(name);
  try {
    await sql
      .raw(`IF OBJECT_ID(N'dbo.__MigrationHistory') IS NULL
            CREATE TABLE dbo.__MigrationHistory (
              FileName NVARCHAR(200) NOT NULL PRIMARY KEY,
              AppliedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME())`)
      .execute(db);
    const applied = new Set(
      (await sql<{ FileName: string }>`SELECT FileName FROM dbo.__MigrationHistory`.execute(db)).rows.map((r) => r.FileName),
    );
    const files = readdirSync(resolve(root, folder)).filter((f) => f.endsWith('.sql')).sort();
    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const batches = splitBatches(readFileSync(resolve(root, folder, file), 'utf8'));
      await db.transaction().execute(async (trx) => {
        for (const b of batches) await sql.raw(b).execute(trx);
        await sql`INSERT INTO dbo.__MigrationHistory (FileName) VALUES (${file})`.execute(trx);
      });
      console.log(`  [${name}] đã chạy ${file}`);
      ran++;
    }
    console.log(`[${name}] ${ran === 0 ? 'không có migration mới' : `${ran} migration đã chạy`}`);
    if (folder === 'MES_Sync') await linkSyncSources(db);
  } finally {
    await db.destroy();
  }
}

async function main() {
  const only = process.argv[2];
  const folders = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(resolve(root, d.name)))
    .map((d) => d.name)
    .filter((n) => !only || n === only);
  if (folders.length === 0) throw new Error('Không có thư mục migration phù hợp.');
  for (const f of folders) await migrate(f);
}

main().catch((e) => {
  console.error('Migration lỗi:', e.message ?? e);
  process.exit(1);
});
