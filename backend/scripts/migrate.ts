// Chạy migration .sql theo từng database: backend/migrations/<Database>/NNNN_ten.sql
// Dùng: npm run migrate            (tất cả database, rồi nạp dữ liệu hệ thống và tài khoản admin)
//       npm run migrate -- MES_Core (một database, không nạp dữ liệu)
//       npm run migrate -- --check  (chỉ kiểm mọi database đã có hoặc tạo được, đã được cấp quyền; không chạy migration)
// Chỉ chạy khi người dùng gọi lệnh; không tự chạy lúc khởi động ứng dụng.
import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { sql, type Kysely } from 'kysely';
import { env } from '../src/config/env';
import { createDb } from '../src/platform/database/db';
import type { CoreDatabase } from '../src/platform/database/core.types';
import { databaseNameOf } from './database-names';
import { runSeed } from './seed';
import { SOURCE_DATABASES, assertSourceNames, sourceDatabaseOf, type SourceDatabase } from './source-databases';

const root = resolve(__dirname, '../migrations');

function splitBatches(text: string): string[] {
  return text.split(/^\s*GO\s*$/gim).map((b) => b.trim()).filter(Boolean);
}

const COLLATION = /^[A-Za-z0-9_]+$/;

/** Collation của database (null: chưa có database) */
async function collationOf(master: Kysely<any>, name: string): Promise<string | null> {
  const r = await sql<{ c: string | null }>`SELECT CONVERT(NVARCHAR(128), DATABASEPROPERTYEX(${name}, 'Collation')) AS c`.execute(master);
  return r.rows[0]?.c ?? null;
}

/**
 * Tạo database nếu chưa có. Database tạo mới lấy collation của `collation` (collation của MES_Core): các module so khớp chuỗi
 * chép từ database khác (tên màu, cỡ chép từ MES_Order sang MES_Cutting), lệch collation thì trùng khóa, sai ký tự.
 */
async function ensureDatabase(name: string, collation: string | null) {
  const master = createDb<any>('master');
  try {
    const collate = collation && COLLATION.test(collation) ? ` COLLATE ${collation}` : '';
    await sql.raw(`IF DB_ID(N'${name.replace(/'/g, "''")}') IS NULL CREATE DATABASE [${name.replace(/]/g, ']]')}]${collate}`).execute(master);
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

/** Synonym của mọi database nguồn (linkSourceDatabase, scripts/source-databases.ts) */
// Kysely<any>: script chạy DDL trên database bất kỳ, không có kiểu bảng
async function linkSyncSources(db: Kysely<any>) {
  for (const s of SOURCE_DATABASES) await linkSourceDatabase(db, s);
}

/**
 * Synonym của các nguồn đọc ở một database nguồn (BRAVO: database trung gian DB_TRUNGGIAN_NAME; OSM: DB_OSM_NAME, view gốc
 * v_OSMData ở DB_OSM_APP_NAME) trỏ tới view trong database đó, qua linked server khi database ở máy khác (ADR 0007). Tạo lại
 * mỗi lần migrate để đổi tên chỉ cần sửa .env, không cần migration mới; database MES_Sync tạo lại cũng tự có synonym đúng.
 * Thủ tục chép chỉ đọc qua synonym này. `optional`: máy không khai database này thì tắt các nguồn của nó, có thì bật lại.
 */
async function linkSourceDatabase(db: Kysely<any>, src: SourceDatabase) {
  const staging = src.name();
  const server = src.server();
  const rows = (
    await sql<{ Code: string; SourceSynonym: string; SourceObject: string; Current: string | null }>`
      SELECT s.Code, s.SourceSynonym, s.SourceObject, sy.base_object_name AS [Current]
      FROM dbo.SyncSource s LEFT JOIN sys.synonyms sy ON sy.object_id = OBJECT_ID(s.SourceSynonym)
      WHERE s.SystemCode = ${src.system}`.execute(db)
  ).rows.filter((r) => sourceDatabaseOf(src.system, r.SourceObject) === src);
  if (!rows.length) return;
  const what = `nguồn ${src.system} ở ${src.nameVar} (${rows.map((r) => r.SourceObject).join(', ')})`;
  // Kiểm tên trước khi bật nguồn: tên sai dạng thì dừng, không để nguồn đã bật mà synonym còn trỏ chỗ cũ
  if (staging) assertSourceNames(src, staging, server);
  if (src.optional) await sql`UPDATE dbo.SyncSource SET IsActive = ${staging ? 1 : 0} WHERE Code IN (${sql.join(rows.map((r) => r.Code))})`.execute(db);
  if (!staging) {
    if (src.optional) {
      console.log(`  [${env.db.syncName}] chưa có ${src.nameVar} trong .env: tắt ${what} (khai báo rồi chạy lại migrate để bật)`);
      return;
    }
    console.warn(`  [${env.db.syncName}] chưa có ${src.nameVar} trong .env${server ? ` (${src.serverVar} cũng bị bỏ qua)` : ''}: bỏ qua tạo synonym, đồng bộ ${what} sẽ báo lỗi khi chạy`);
    return;
  }
  // CREATE SYNONYM không kiểm đích: gõ sai tên linked server thì tới lúc đồng bộ mới lỗi, nên báo ngay ở đây
  if (server) {
    const ls = await sql<{ n: number }>`SELECT COUNT(*) AS n FROM sys.servers WHERE name = ${server} AND is_linked = 1 AND is_data_access_enabled = 1`.execute(db);
    if (!ls.rows[0]?.n) console.warn(`  [${env.db.syncName}] không thấy linked server ${server} (hoặc chưa bật Data Access): synonym vẫn tạo nhưng đồng bộ sẽ lỗi. Kiểm ${src.serverVar}.`);
  }
  const quote = (n: string) => `[${n.replace(/]/g, ']]')}]`;
  // Định dạng như sys.synonyms.base_object_name để so được với synonym đang có
  const prefix = `${server ? `${quote(server)}.` : ''}${quote(staging)}.[dbo].`;
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
  console.log(`  [${env.db.syncName}] synonym ${src.system} tới ${server ? `${server}.` : ''}${staging}: ${changed === 0 ? 'đã đúng' : `tạo lại ${changed}`}`);
}

/**
 * Kiểm mọi database trước khi chạy migration nào: database chưa có mà không tạo được (tài khoản không có quyền CREATE DATABASE),
 * hoặc chưa được cấp quyền, thì dừng ngay, chưa database nào bị migrate dở (deploy.cjs gọi --check trước khi dừng bản cũ).
 * `create = false` (--check): không tạo gì, database chưa có chỉ kiểm tài khoản có quyền tạo, để chạy thử từ máy khác không để lại
 * database rỗng trên máy chủ.
 * Collation lệch MES_Core thì cảnh báo, không dừng (database cũ đã có dữ liệu, đổi collation là việc của quản trị CSDL).
 */
async function ensureDatabases(folders: string[], create: boolean): Promise<string[]> {
  const master = createDb<any>('master');
  const missing: string[] = [];
  let base: string | null;
  try {
    base = await collationOf(master, env.db.coreName);
    if (!create) {
      for (const f of folders) if ((await collationOf(master, databaseNameOf(f))) === null) missing.push(databaseNameOf(f));
      const r = await sql<{ ok: number | null }>`SELECT HAS_PERMS_BY_NAME(NULL, NULL, 'CREATE ANY DATABASE') AS ok`.execute(master);
      if (missing.length && r.rows[0]?.ok !== 1) {
        throw new Error(`Chưa có database ${missing.join(', ')} và tài khoản trong .env không có quyền tạo. Nhờ quản trị CSDL tạo (cùng collation với ${env.db.coreName}), cấp db_owner cho tài khoản ứng dụng, rồi chạy lại. Chưa chạy migration nào.`);
      }
    }
  } finally {
    await master.destroy();
  }
  if (create) for (const f of folders) await ensureDatabase(databaseNameOf(f), base);
  const check = createDb<any>('master');
  try {
    base ??= await collationOf(check, env.db.coreName);
    for (const f of folders) {
      const name = databaseNameOf(f);
      if (missing.includes(name)) continue;
      const r = await sql<{ ok: number | null }>`SELECT HAS_DBACCESS(${name}) AS ok`.execute(check);
      if (r.rows[0]?.ok !== 1) throw new Error(`Tài khoản trong .env chưa được cấp quyền vào database ${name}: nhờ quản trị CSDL cấp db_owner rồi chạy lại. Chưa chạy migration nào.`);
      const c = await collationOf(check, name);
      if (base && c && c !== base) console.warn(`Cảnh báo: database ${name} có collation ${c}, khác ${env.db.coreName} (${base}). Các database MES phải cùng collation (11-van-hanh.md).`);
    }
  } finally {
    await check.destroy();
  }
  return missing;
}

async function migrate(folder: string) {
  const name = databaseNameOf(folder);
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
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  // `npm run migrate --check` (thiếu `--`): npm nuốt cờ thành npm_config_check, script không thấy và sẽ migrate thật
  if (!checkOnly && process.env.npm_config_check) throw new Error('Cờ --check bị npm giữ lại: gõ npm run migrate -- --check. Chưa chạy migration nào.');
  const only = args.find((a) => !a.startsWith('--'));
  const folders = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(resolve(root, d.name)))
    .map((d) => d.name)
    .filter((n) => !only || n === only)
    .sort();
  if (folders.length === 0) throw new Error('Không có thư mục migration phù hợp.');
  // Kiểm trước khi tạo bảng: thiếu mật khẩu thì tạo bảng xong cũng không có tài khoản đăng nhập
  if (!only && !env.demoPassword) throw new Error('Thiếu DEMO_PASSWORD trong backend/.env (mật khẩu ban đầu của tài khoản admin). Chưa chạy migration nào.');
  if (!only && env.isProd && env.demoPassword.length < 8) throw new Error('DEMO_PASSWORD phải dài ít nhất 8 ký tự khi NODE_ENV=production. Chưa chạy migration nào.');
  const missing = await ensureDatabases(folders, !checkOnly);
  if (checkOnly) {
    const ready = folders.map(databaseNameOf).filter((n) => !missing.includes(n));
    console.log(`Đã có, đã được cấp quyền: ${ready.join(', ')}.${missing.length ? ` Chưa có, tài khoản tạo được khi migrate: ${missing.join(', ')}.` : ''} Chưa chạy migration nào, chưa tạo gì (--check).`);
    return;
  }
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
