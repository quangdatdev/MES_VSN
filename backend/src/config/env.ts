import { config } from 'dotenv';
import { randomBytes } from 'crypto';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../.env'), quiet: true });

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : d;
};

const isProd = process.env.NODE_ENV === 'production';

/** Cờ true/false: để trống thì lấy mặc định; giá trị khác (0, no, yes...) báo lỗi thay vì đoán, kẻo gõ sai mà âm thầm làm ngược ý */
const flag = (name: string, d: boolean) => {
  const v = process.env[name]?.trim().toLowerCase();
  if (!v) return d;
  if (v === 'true' || v === 'false') return v === 'true';
  throw new Error(`${name} chỉ nhận true hoặc false (đang là "${process.env[name]}").`);
};

/** Số nguyên 0–100: để trống thì lấy mặc định; giá trị khác báo lỗi thay vì đoán */
const percent = (name: string, d: number) => {
  const v = process.env[name]?.trim();
  if (!v) return d;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error(`${name} chỉ nhận số nguyên từ 0 đến 100 (đang là "${process.env[name]}").`);
  return n;
};

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET là bắt buộc ở môi trường production.');
}

export const env = {
  isProd,
  port: num(process.env.PORT, 3000),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: num(process.env.DB_PORT, 1433),
    user: process.env.DB_USER ?? '',
    password: process.env.DB_PASSWORD ?? '',
    coreName: process.env.DB_CORE_NAME || 'MES_Core',
    orderName: process.env.DB_ORDER_NAME || 'MES_Order',
    // Module May (ADR 0009)
    sewingName: process.env.DB_SEWING_NAME || 'MES_Sewing',
    // Module Cắt: Đồng bộ tiến độ cắt (phase 5.14, quyết định 13.1)
    cuttingName: process.env.DB_CUTTING_NAME || 'MES_Cutting',
    // Module Nhân sự: phòng ban, chức danh, hồ sơ nhân viên (ADR 0012)
    hrName: process.env.DB_HR_NAME || 'MES_Hr',
    // Bảng chép dữ liệu từ hệ thống ngoài và nhật ký đồng bộ (ADR 0007)
    syncName: process.env.DB_SYNC_NAME || 'MES_Sync',
    // Database trung gian chứa view của BRAVO. MES chỉ đọc view ở đây, không đọc thẳng database BRAVO.
    stagingName: process.env.DB_TRUNGGIAN_NAME ?? '',
    // Database trung gian nằm ở SQL Server khác: tên linked server tới máy đó (synonym 4 phần). Cùng máy thì để trống.
    stagingServer: process.env.DB_TRUNGGIAN_SERVER?.trim() ?? '',
    // Database của OSM chứa view nhà máy sản xuất của đơn hàng (vOSMDataFty). MES chỉ đọc view, chép vào MES_Sync.osm
    osmName: process.env.DB_OSM_NAME?.trim() ?? '',
    // Database OSM ở SQL Server khác: tên linked server. Cùng máy thì để trống
    osmServer: process.env.DB_OSM_SERVER?.trim() ?? '',
    // Database ứng dụng OSM chứa view gốc phân bổ PO theo nhà máy (v_OSMData), chép vào MES_Sync.osm cho màn Phân bổ PO
    osmAppName: process.env.DB_OSM_APP_NAME?.trim() ?? '',
    // Database ứng dụng OSM ở SQL Server khác: tên linked server. Cùng máy thì để trống
    osmAppServer: process.env.DB_OSM_APP_SERVER?.trim() ?? '',
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
  },
  // Dev không có JWT_SECRET: dùng khóa tạm theo tiến trình (token mất hiệu lực khi khởi động lại).
  jwtSecret: process.env.JWT_SECRET || randomBytes(32).toString('hex'),
  accessTtlSeconds: num(process.env.JWT_ACCESS_TTL, 15 * 60),
  preAuthTtlSeconds: num(process.env.PRE_AUTH_TTL, 5 * 60),
  refreshTtlDays: num(process.env.REFRESH_TTL_DAYS, 7),
  loginMaxFailed: num(process.env.LOGIN_MAX_FAILED, 5),
  loginLockMinutes: num(process.env.LOGIN_LOCK_MINUTES, 15),
  demoPassword: process.env.DEMO_PASSWORD ?? '',
  // Seed có nạp dữ liệu mẫu (đơn hàng giả, phòng ban và nhân viên giả) không. Mặc định không khi NODE_ENV=production: máy chủ thật
  // quên đặt biến thì seed chạy lại về sau (sau khi pull) cũng không nạp dữ liệu giả
  seedSampleData: flag('SEED_SAMPLE_DATA', !isProd),
  // Backend tự nạp tăng dần đơn hàng BRAVO vào MES_Order sau mỗi đợt đồng bộ và lúc khởi động (ADR 0013 mục 8). Mặc định bật
  // trên máy dùng thật (không dữ liệu mẫu), tắt trên máy demo, máy test: đơn giả không bị trộn đơn thật, test không tự nạp;
  // máy demo nạp đơn BRAVO bằng npm run load:bravo
  bravoOrderImport: flag('BRAVO_ORDER_IMPORT', !flag('SEED_SAMPLE_DATA', !isProd)),
  // Cập nhật Nhà máy SX của đơn hàng theo OSM sau mỗi đợt đồng bộ và lúc khởi động (ADR 0013 mục 9). Mặc định bật, kể cả khi
  // nạp đơn hàng tự động tắt; test tắt (test/setup-env.ts) để bước này không chạy xen vào bài test
  osmFactoryUpdate: flag('OSM_FACTORY_UPDATE', true),
  // Làm mới bảng Phân bổ PO (MES_Order.PoAllocation) từ dữ liệu OSM đã chép sau mỗi đợt đồng bộ nguồn OSM.OSMData và lúc khởi
  // động (Phase 5.10). Mặc định bật; test tắt (test/setup-env.ts) để bước này không chạy xen vào bài test, bài test gọi thẳng
  poAllocationRefresh: flag('PO_ALLOCATION_REFRESH', true),
  // Bước làm mới Phân bổ PO không xóa dòng vắng khi nguồn ít hơn (100 - n)% số dòng đang có trong OSM (chép OSM lỗi, view tạm thiếu
  // dữ liệu): vẫn thêm, sửa, chỉ giữ dòng vắng và cảnh báo trên màn. 100: không chặn (quản trị đặt rồi khởi động lại khi OSM thật sự
  // bớt nhiều PO); 0: giảm một dòng cũng giữ
  poAllocationMaxShrinkPercent: percent('PO_ALLOCATION_MAX_SHRINK_PERCENT', 20),
  // Cookie refresh chỉ gửi qua HTTPS. Demo trong mạng nội bộ chạy HTTP thì để COOKIE_SECURE=false.
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProd,
  // Chỉ khai báo khi thật sự chạy sau reverse proxy (ví dụ "loopback" hoặc IP của Nginx). Mặc định không tin
  // X-Forwarded-For, vì client tự đặt được header này để giả IP trong nhật ký.
  trustProxy: process.env.TRUST_PROXY || false,
  host: process.env.HOST || '0.0.0.0',
};

if (isProd && env.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET phải dài ít nhất 32 ký tự ở môi trường production.');
}
