import { hostname } from 'os';
import { env } from '../src/config/env';

/** SQL Server nằm trên chính máy này (bỏ phần tên instance sau dấu \). */
export function isLocalDb(host: string): boolean {
  const name = host.split('\\')[0].trim().toLowerCase();
  return ['localhost', '127.0.0.1', '::1', '.', '(local)', hostname().toLowerCase()].includes(name);
}

/** Script ghi đè dữ liệu chỉ chạy trên máy demo: .env chép từ máy UAT/dùng chung sẽ trỏ tới SQL Server khác. */
export function assertLocalDb(script: string) {
  if (env.isProd) throw new Error(`Không chạy ${script} khi NODE_ENV=production.`);
  if (!isLocalDb(env.db.host) && !process.argv.includes('--allow-remote-db')) {
    throw new Error(
      `DB_HOST=${env.db.host} không phải SQL Server trên máy này. ${script} chỉ dành cho máy demo. ` +
        'Nếu chắc chắn đây là database demo, chạy lại với --allow-remote-db.',
    );
  }
}

/**
 * Script sinh hay xóa dữ liệu mẫu (reset:demo, load:bravo, sim:board): như assertLocalDb, thêm máy phải dùng dữ liệu mẫu. Máy đặt
 * SEED_SAMPLE_DATA=false (hoặc NODE_ENV=production) là máy dùng thật, các lệnh này xóa đơn hàng, hồ sơ thật.
 */
export function assertDemoMachine(script: string) {
  assertLocalDb(script);
  if (!env.seedSampleData) throw new Error(`Máy này không dùng dữ liệu mẫu (SEED_SAMPLE_DATA=false): không chạy ${script}.`);
}
