// Chạy migration .sql theo từng database: backend/migrations/<Database>/NNNN_ten.sql
// Dùng: npm run migrate            (tất cả database, rồi nạp dữ liệu hệ thống và tài khoản admin)
//       npm run migrate -- MES_Core (một database, không nạp dữ liệu)
// Chỉ chạy khi người dùng gọi lệnh; không tự chạy lúc khởi động ứng dụng.
import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { sql, type Kysely } from 'kysely';
import { env } from '../src/config/env';
import { createDb } from '../src/platform/database/db';
import type { CoreDatabase } from '../src/platform/database/core.types';
import { runSeed } from './seed';

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
 * Synonym của nguồn BRAVO trỏ tới view trong database trung gian (DB_TRUNGGIAN_NAME), qua linked server DB_TRUNGGIAN_SERVER khi
 * database đó ở máy khác (ADR 0007). Tạo lại mỗi lần migrate để đổi tên chỉ cần sửa .env, không cần migration mới; database
 * MES_Sync tạo lại cũng tự có synonym đúng. Thủ tục chép chỉ đọc qua synonym này.
 */
// Kysely<any>: script chạy DDL trên database bất kỳ, không có kiểu bảng
async function linkSyncSources(db: Kysely<any>) {
  const staging = env.db.stagingName;
  if (!staging) {
    console.warn(
      `  [${env.db.syncName}] chưa có DB_TRUNGGIAN_NAME trong .env${env.db.stagingServer ? ' (DB_TRUNGGIAN_SERVER cũng bị bỏ qua)' : ''}: bỏ qua tạo synonym, đồng bộ BRAVO sẽ báo lỗi khi chạy`,
    );
    return;
  }
  if (!/^[A-Za-z0-9_-]+$/.test(staging)) throw new Error('DB_TRUNGGIAN_NAME chỉ gồm chữ, số, gạch dưới, gạch ngang');
  const server = env.db.stagingServer;
  // Tên linked server có thể dạng MAY\INSTANCE
  if (server && !/^[A-Za-z0-9_.\\-]+$/.test(server)) throw new Error('DB_TRUNGGIAN_SERVER chỉ gồm chữ, số, gạch dưới, gạch ngang, dấu chấm, dấu \\.');
  // CREATE SYNONYM không kiểm đích: gõ sai tên linked server thì tới lúc đồng bộ mới lỗi, nên báo ngay ở đây
  if (server) {
    const ls = await sql<{ n: number }>`SELECT COUNT(*) AS n FROM sys.servers WHERE name = ${server} AND is_linked = 1 AND is_data_access_enabled = 1`.execute(db);
    if (!ls.rows[0]?.n) console.warn(`  [${env.db.syncName}] không thấy linked server ${server} (hoặc chưa bật Data Access): synonym vẫn tạo nhưng đồng bộ sẽ lỗi. Kiểm DB_TRUNGGIAN_SERVER.`);
  }
  const quote = (n: string) => `[${n.replace(/]/g, ']]')}]`;
  // Định dạng như sys.synonyms.base_object_name để so được với synonym đang có
  const prefix = `${server ? `${quote(server)}.` : ''}${quote(staging)}.[dbo].`;
  const rows = (
    await sql<{ SourceSynonym: string; SourceObject: string; Current: string | null }>`
      SELECT s.SourceSynonym, s.SourceObject, sy.base_object_name AS [Current]
      FROM dbo.SyncSource s LEFT JOIN sys.synonyms sy ON sy.object_id = OBJECT_ID(s.SourceSynonym)
      WHERE s.SystemCode = 'BRAVO'`.execute(db)
  ).rows;
  let changed = 0;
  for (const r of rows) {
    const [schema, name] = r.SourceSynonym.split('.');
    const target = `${prefix}${quote(r.SourceObject)}`;
    if (r.Current === target) continue;
    // Xóa và tạo trong một transaction: lượt đồng bộ chạy đúng lúc này không thấy synonym bị thiếu
    await db.transaction().execute(async (trx) => {
      await sql.raw(`IF OBJECT_ID(N'${r.SourceSynonym.replace(/'/g, "''")}', N'SN') IS NOT NULL DROP SYNONYM ${quote(schema)}.${quote(name)}`).execute(trx);
      await sql.raw(`CREATE SYNONYM ${quote(schema)}.${quote(name)} FOR ${target}`).execute(trx);
    });
    changed++;
  }
  console.log(`  [${env.db.syncName}] synonym tới ${server ? `${server}.` : ''}${staging}: ${changed === 0 ? 'đã đúng' : `tạo lại ${changed}`}`);
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

/**
 * Seed lỗi giữa chừng lần cài đầu thì lần chạy sau không tự cấp lại (seed chỉ cấp cho vai trò, tài khoản mới): kiểm admin đủ để
 * đăng nhập và quản trị. admin đã bị vô hiệu (đã có tài khoản quản trị riêng) thì không kiểm.
 */
async function adminProblems(): Promise<string[]> {
  const db = createDb<CoreDatabase>(env.db.coreName);
  try {
    const u = await db.selectFrom('SysUser').select(['Id', 'IsActive']).where('Username', '=', 'admin').executeTakeFirst();
    if (!u) return ['chưa có tài khoản admin'];
    if (!u.IsActive) return [];
    const out: string[] = [];
    const role = await db
      .selectFrom('SysUserRole as ur')
      .innerJoin('SysRole as r', 'r.Id', 'ur.RoleId')
      .select('r.Id')
      .where('ur.UserId', '=', u.Id)
      .where('r.Code', '=', 'ADMIN')
      .executeTakeFirst();
    if (!role) out.push('admin chưa có vai trò ADMIN');
    else {
      const perm = await db
        .selectFrom('SysRolePermission as rp')
        .innerJoin('SysPermission as p', 'p.Id', 'rp.PermissionId')
        .select('rp.Id')
        .where('rp.RoleId', '=', role.Id)
        .where('p.Code', '=', 'admin.user:view')
        .executeTakeFirst();
      if (!perm) out.push('vai trò ADMIN chưa có quyền vào màn Người dùng');
    }
    if (!(await db.selectFrom('SysUserBranch').select('Id').where('UserId', '=', u.Id).executeTakeFirst())) out.push('admin chưa được gán nhà máy nào');
    return out;
  } finally {
    await db.destroy();
  }
}

async function main() {
  const only = process.argv[2];
  const folders = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(resolve(root, d.name)))
    .map((d) => d.name)
    .filter((n) => !only || n === only)
    .sort();
  if (folders.length === 0) throw new Error('Không có thư mục migration phù hợp.');
  // Kiểm trước khi tạo bảng: thiếu mật khẩu thì tạo bảng xong cũng không có tài khoản đăng nhập
  if (!only && !env.demoPassword) throw new Error('Thiếu DEMO_PASSWORD trong backend/.env (mật khẩu ban đầu của tài khoản admin). Chưa chạy migration nào.');
  if (!only && env.isProd && env.demoPassword.length < 8) throw new Error('DEMO_PASSWORD phải dài ít nhất 8 ký tự khi NODE_ENV=production. Chưa chạy migration nào.');
  for (const f of folders) await migrate(f);
  if (only) {
    console.log('Chỉ migrate một database: chưa nạp dữ liệu hệ thống. Chạy npm run migrate (không tham số) để nạp.');
    return;
  }
  // Dữ liệu hệ thống (nhà máy, vai trò, quyền, menu, danh mục) và tài khoản admin, không dữ liệu mẫu: cài lần đầu chỉ cần
  // migrate là đăng nhập được. Chạy lại chỉ thêm phần còn thiếu, không cấp lại quyền đã thu hồi. Máy demo chạy thêm npm run seed.
  console.log('Nạp dữ liệu hệ thống và tài khoản admin:');
  try {
    await runSeed({ sampleData: false, by: 'scripts/migrate.ts' });
  } catch (e) {
    throw new Error(`Đã tạo bảng xong nhưng nạp dữ liệu hệ thống lỗi: ${(e as Error).message} Sửa nguyên nhân rồi chạy: npm run seed -- --sync-matrix`, { cause: e });
  }
  const problems = await adminProblems();
  if (problems.length) {
    console.warn(`Cảnh báo: ${problems.join('; ')}. Lần cài đầu thì chạy npm run seed -- --sync-matrix (đè ma trận quyền của các vai trò mẫu); cố ý đổi thì bỏ qua.`);
  }
}

// Chỉ tự chạy khi gọi thẳng file này: script, test nào import nhầm cũng không chạy migrate, seed lên database thật
if (require.main === module) {
  main().catch((e) => {
    console.error('Migration lỗi:', e.message ?? e);
    process.exit(1);
  });
}
