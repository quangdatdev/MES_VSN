// Kiểm tra kết nối và liệt kê database (chỉ đọc). Không in mật khẩu.
import { sql } from 'kysely';
import { createDb } from '../src/platform/database/db';
import { env } from '../src/config/env';

(async () => {
  const db = createDb<any>('master');
  try {
    const v = await sql<{ v: string }>`SELECT CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(50)) AS v, @@SERVERNAME AS s`.execute(db);
    console.log('Kết nối OK. Phiên bản:', v.rows[0]);
    const dbs = await sql<{ name: string }>`SELECT name FROM sys.databases WHERE name NOT IN ('master','tempdb','model','msdb') ORDER BY name`.execute(db);
    console.log('Database người dùng:', dbs.rows.map((r) => r.name));
    console.log('Dự kiến dùng:', env.db.coreName, '(lõi),', env.db.orderName, '(đơn hàng), user =', env.db.user);
  } catch (e: any) {
    console.error('Không kết nối được:', e.message ?? e);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
