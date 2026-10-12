// Database nguồn mà lớp đồng bộ đọc view (ADR 0007): migrate.ts tạo synonym tới view, sync-gen.ts đọc cấu trúc cột của view.
// Tên database, linked server lấy từ .env, không ghi trong code.
import { env } from '../src/config/env';

export interface SourceDatabase {
  /** Hệ thống nguồn (SyncSource.SystemCode) */
  system: 'BRAVO' | 'OSM';
  name: () => string;
  server: () => string;
  nameVar: string;
  serverVar: string;
  /** Máy không khai database này thì tắt các nguồn đọc ở đây (không hiện, không báo lỗi khi "Đồng bộ tất cả"), có thì bật lại */
  optional?: boolean;
  /** Chỉ các view này đọc ở database này. Không khai báo: mọi view còn lại của hệ thống */
  views?: string[];
}

export const SOURCE_DATABASES: SourceDatabase[] = [
  { system: 'BRAVO', name: () => env.db.stagingName, server: () => env.db.stagingServer, nameVar: 'DB_TRUNGGIAN_NAME', serverVar: 'DB_TRUNGGIAN_SERVER' },
  // View gốc của database ứng dụng OSM (phân bổ PO theo nhà máy, task 5.9.12); vOSMDataFty nằm ở database OSM riêng (DB_OSM_NAME)
  {
    system: 'OSM',
    views: ['v_OSMData'],
    name: () => env.db.osmAppName,
    server: () => env.db.osmAppServer,
    nameVar: 'DB_OSM_APP_NAME',
    serverVar: 'DB_OSM_APP_SERVER',
    optional: true,
  },
  { system: 'OSM', name: () => env.db.osmName, server: () => env.db.osmServer, nameVar: 'DB_OSM_NAME', serverVar: 'DB_OSM_SERVER', optional: true },
];

/** Database nguồn của một view (tên view so không phân biệt hoa thường như SQL Server) */
export function sourceDatabaseOf(system: string, view: string): SourceDatabase | undefined {
  const own = SOURCE_DATABASES.filter((d) => d.system === system);
  return own.find((d) => d.views?.some((v) => v.toLowerCase() === view.toLowerCase())) ?? own.find((d) => !d.views);
}

/** Kiểm tên database, linked server trước khi ghép vào câu lệnh dưới dạng định danh */
export function assertSourceNames(src: SourceDatabase, name: string, server: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error(`${src.nameVar} chỉ gồm chữ, số, gạch dưới, gạch ngang`);
  // Tên linked server có thể dạng MAY\INSTANCE
  if (server && !/^[A-Za-z0-9_.\\-]+$/.test(server)) throw new Error(`${src.serverVar} chỉ gồm chữ, số, gạch dưới, gạch ngang, dấu chấm, dấu \\.`);
}
