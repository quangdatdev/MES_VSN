// Cài lại dữ liệu MES trên một máy: xóa mọi bảng, thủ tục trong các database MES rồi chạy lại migration và seed, như lúc mới cài.
// Dùng khi máy chủ đã dính dữ liệu thử, dữ liệu mẫu và cần bắt đầu lại từ đầu. Tài khoản ứng dụng chỉ có db_owner, không xóa, tạo
// được database, nên xóa từng đối tượng bên trong database thay vì DROP DATABASE.
// Dùng: npm run reinstall                               (chỉ in việc sẽ làm, không đổi gì)
//       npm run reinstall -- --yes --backup F:\Backup   (sao lưu từng database vào thư mục trên máy SQL Server rồi cài lại)
//       thêm --with-sync       cài lại cả MES_Sync (mất bảng chép BRAVO, nhật ký đồng bộ, synonym tạo tay qua linked server)
//       thêm --no-sample-data  không nạp dữ liệu mẫu kể cả khi .env không đặt SEED_SAMPLE_DATA=false
// Dừng ứng dụng trước (pm2 stop mes), xong thì khởi động lại. Seed tạo lại tài khoản (admin...) với mật khẩu DEMO_PASSWORD.
import { sql, type Kysely } from 'kysely';
import { env } from '../src/config/env';
import { createDb } from '../src/platform/database/db';
import type { CoreDatabase } from '../src/platform/database/core.types';
import { isLocalDb } from './local-db';
import { dbName, migrate, migrationFolders } from './migrate';
import { runSeed } from './seed';

const q = (n: string) => `[${n.replace(/]/g, ']]')}]`;
const lit = (s: string) => `N'${s.replace(/'/g, "''")}'`;

const DROP: Record<string, string> = { V: 'VIEW', P: 'PROCEDURE', U: 'TABLE', FN: 'FUNCTION', IF: 'FUNCTION', TF: 'FUNCTION', SN: 'SYNONYM', SO: 'SEQUENCE' };

/**
 * Xóa mọi đối tượng do migration tạo trong database đang kết nối (kể cả bảng lịch sử migration), giữ nguyên database, user, quyền.
 * Khóa ngoại trước (bảng tham chiếu chéo nhau), view và thủ tục trước bảng, hàm sau bảng (ràng buộc, cột tính có thể gọi hàm).
 * Schema để lại: migration tạo schema theo kiểu "chưa có thì tạo". Trả số đối tượng đã xóa.
 */
// Kysely<any>: xóa đối tượng của database bất kỳ, không có kiểu bảng
export async function dropAllObjects(db: Kysely<any>): Promise<number> {
  const fks = (await sql<{ s: string; t: string; n: string }>`
    SELECT OBJECT_SCHEMA_NAME(parent_object_id) AS s, OBJECT_NAME(parent_object_id) AS t, name AS n FROM sys.foreign_keys`.execute(db)).rows;
  for (const f of fks) await sql.raw(`ALTER TABLE ${q(f.s)}.${q(f.t)} DROP CONSTRAINT ${q(f.n)}`).execute(db);
  const objs = (await sql<{ s: string; n: string; type: string }>`
    SELECT SCHEMA_NAME(schema_id) AS s, name AS n, RTRIM(type) AS type FROM sys.objects
    WHERE is_ms_shipped = 0 AND RTRIM(type) IN ('V', 'P', 'U', 'FN', 'IF', 'TF', 'SN', 'SO')
    ORDER BY CASE RTRIM(type) WHEN 'V' THEN 1 WHEN 'P' THEN 2 WHEN 'U' THEN 3 WHEN 'SN' THEN 5 WHEN 'SO' THEN 6 ELSE 4 END, name`.execute(db)).rows;
  for (const o of objs) await sql.raw(`DROP ${DROP[o.type]} ${q(o.s)}.${q(o.n)}`).execute(db);
  const types = (await sql<{ s: string; n: string }>`SELECT SCHEMA_NAME(schema_id) AS s, name AS n FROM sys.types WHERE is_user_defined = 1`.execute(db)).rows;
  for (const t of types) await sql.raw(`DROP TYPE ${q(t.s)}.${q(t.n)}`).execute(db);
  return fks.length + objs.length + types.length;
}

/** Số bảng, số dòng của database (để in trước khi xóa) */
async function sizeOf(name: string) {
  const db = createDb<any>(name, { failFast: true });
  try {
    const r = await sql<{ tables: number; rows: number }>`
      SELECT COUNT(DISTINCT t.object_id) AS tables, ISNULL(SUM(p.rows), 0) AS rows
      FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
      WHERE t.is_ms_shipped = 0`.execute(db);
    return r.rows[0];
  } finally {
    await db.destroy();
  }
}

/** Database chưa có hoặc tài khoản chưa vào được: dừng trước khi xóa bất cứ thứ gì */
async function missingDatabases(names: string[]): Promise<string[]> {
  const master = createDb<any>('master', { failFast: true });
  try {
    const out: string[] = [];
    for (const n of names) {
      const r = await sql<{ ok: number }>`SELECT CASE WHEN DB_ID(${n}) IS NOT NULL AND HAS_DBACCESS(${n}) = 1 THEN 1 ELSE 0 END AS ok`.execute(master);
      if (r.rows[0]?.ok !== 1) out.push(n);
    }
    return out;
  } finally {
    await master.destroy();
  }
}

/** Đường dẫn nằm trên máy SQL Server (Windows), không phải máy chạy lệnh */
async function backup(name: string, dir: string, stamp: string): Promise<string> {
  const file = `${dir.replace(/[\\/]+$/, '')}\\${name}_truoc_cai_lai_${stamp}.bak`;
  const db = createDb<any>(name, { requestTimeoutMs: 0 });
  try {
    await sql.raw(`BACKUP DATABASE ${q(name)} TO DISK = ${lit(file)} WITH COPY_ONLY, INIT, CHECKSUM`).execute(db);
  } catch (e) {
    throw new Error(
      `Không sao lưu được ${name} vào ${file} (${(e as Error).message}). Thư mục phải có sẵn trên máy SQL Server và tài khoản chạy dịch vụ SQL Server ghi được vào đó. Chưa xóa gì.`,
      { cause: e },
    );
  } finally {
    await db.destroy();
  }
  return file;
}

async function main() {
  const argv = process.argv;
  const yes = argv.includes('--yes');
  const withSync = argv.includes('--with-sync');
  const bi = argv.indexOf('--backup');
  const backupDir = bi >= 0 ? argv[bi + 1] : undefined;
  if (bi >= 0 && (!backupDir || backupDir.startsWith('--'))) throw new Error('Thiếu thư mục sau --backup, ví dụ: --backup F:\\Backup');
  const sampleData = argv.includes('--no-sample-data') ? false : env.seedSampleData;

  if (!isLocalDb(env.db.host) && !argv.includes('--allow-remote-db')) {
    throw new Error(`DB_HOST=${env.db.host} không phải SQL Server trên máy này. Chạy lệnh trên chính máy chủ MES, hoặc thêm --allow-remote-db nếu chắc chắn.`);
  }
  // Seed cần mật khẩu này để tạo lại tài khoản: thiếu thì dừng trước khi xóa, kẻo cài xong không ai đăng nhập được
  if (!env.demoPassword) throw new Error('Thiếu DEMO_PASSWORD trong backend/.env (mật khẩu của các tài khoản seed tạo lại). Chưa xóa gì.');

  const targets = migrationFolders()
    .filter((f) => withSync || f !== 'MES_Sync')
    .map((folder) => ({ folder, name: dbName(folder) }));
  const missing = await missingDatabases(targets.map((t) => t.name));
  if (missing.length) {
    throw new Error(`Chưa có hoặc chưa vào được database: ${missing.join(', ')}. Nhờ quản trị CSDL tạo và cấp db_owner cho ${env.db.user}. Chưa xóa gì.`);
  }

  console.log(`Máy SQL Server: ${env.db.host}. Các database sẽ bị xóa sạch rồi tạo lại bảng, nạp lại dữ liệu hệ thống:`);
  for (const t of targets) {
    const s = await sizeOf(t.name);
    console.log(`  - ${t.name}: ${s.tables} bảng, ${s.rows} dòng`);
  }
  if (!withSync) console.log(`  Giữ nguyên ${env.db.syncName} (dữ liệu chép từ BRAVO). Thêm --with-sync để cài lại cả database này.`);
  else console.log(`  ${env.db.syncName}: synonym tạo tay qua linked server (không dùng DB_TRUNGGIAN_NAME) sẽ mất, phải tạo lại sau.`);
  console.log(
    sampleData
      ? '  Seed NẠP dữ liệu mẫu (đơn hàng giả, phòng ban và nhân viên giả). Máy dùng thật: đặt SEED_SAMPLE_DATA=false hoặc thêm --no-sample-data.'
      : '  Seed không nạp dữ liệu mẫu: chỉ nhà máy, vai trò, quyền, menu, tài khoản, danh mục, loại phòng ban, chức danh dùng chung.',
  );
  console.log(backupDir ? `  Sao lưu trước vào ${backupDir} (trên máy SQL Server).` : '  KHÔNG sao lưu (thêm --backup <thư mục> để sao lưu trước).');
  if (!yes) {
    console.log('Dừng ứng dụng trước (pm2 stop mes), rồi chạy lại với: npm run reinstall -- --yes --backup <thư mục>');
    return;
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  const backups: string[] = [];
  if (backupDir) {
    for (const t of targets) {
      backups.push(await backup(t.name, backupDir, stamp));
      console.log(`Đã sao lưu ${t.name}: ${backups.at(-1)}`);
    }
  }

  // Mỗi database xóa trong một transaction: lỗi giữa chừng thì database đó còn nguyên. Chạy lại lệnh là làm tiếp được
  for (const t of targets) {
    const db = createDb<any>(t.name, { requestTimeoutMs: 0 });
    try {
      const n = await db.transaction().execute((trx) => dropAllObjects(trx));
      console.log(`Đã xóa ${n} đối tượng trong ${t.name}.`);
    } finally {
      await db.destroy();
    }
  }
  for (const t of targets) await migrate(t.folder);
  await runSeed({ sampleData });

  const core = createDb<CoreDatabase>(env.db.coreName);
  try {
    await core
      .insertInto('SysAuditLog')
      .values({ EntityType: 'System', ActionCode: 'REINSTALL', NewValue: JSON.stringify({ by: 'scripts/reinstall.ts', databases: targets.map((t) => t.name), backups, sampleData }) } as any)
      .execute();
  } finally {
    await core.destroy();
  }

  console.log(
    [
      'Đã cài lại xong.',
      '  - Đăng nhập bằng admin, mật khẩu là DEMO_PASSWORD trong backend/.env. Đổi mật khẩu admin, khóa tài khoản mẫu không dùng ngay.',
      '  - Khởi động lại ứng dụng: pm2 restart mes',
      ...(withSync ? [] : [`  - ${env.db.syncName} giữ nguyên: nhật ký đồng bộ cũ ghi người chạy theo Id tài khoản cũ. Kiểm: npm run check:softkeys -w backend`]),
    ].join('\n'),
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Cài lại lỗi:', e.message ?? e);
    process.exit(1);
  });
}
