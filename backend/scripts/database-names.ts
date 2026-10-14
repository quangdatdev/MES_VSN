// Tên thư mục migration (backend/migrations/<Thư mục>) → tên database thật theo .env (DB_*_NAME). Một chỗ cho migrate,
// check-softkeys. Thư mục chưa khai thì báo lỗi, không lấy tên thư mục làm tên database: chạy với bộ database test mà quên khai
// thì migrate nhầm lên database thật cùng tên.
import { env } from '../src/config/env';

export const DATABASE_NAMES: Readonly<Record<string, string>> = {
  MES_Core: env.db.coreName,
  MES_Order: env.db.orderName,
  MES_Sewing: env.db.sewingName,
  MES_Cutting: env.db.cuttingName,
  MES_Hr: env.db.hrName,
  MES_Sync: env.db.syncName,
};

export function databaseNameOf(folder: string): string {
  const name = DATABASE_NAMES[folder];
  if (!name) throw new Error(`Thư mục migration ${folder} chưa khai tên database: thêm vào backend/scripts/database-names.ts và biến DB_*_NAME ở src/config/env.ts.`);
  return name;
}
