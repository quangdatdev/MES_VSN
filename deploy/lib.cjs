'use strict';
/** Hàm thuần của deploy.cjs (không gọi git, npm, pm2): tách riêng để test (deploy/deploy.test.cjs) */
const fs = require('fs');
const path = require('path');

/** Bản build xong (npm ci, build qua) */
const BUILT_MARK = '.built';
/** Bản đã chạy được (kiểm sống ổn định sau khi chuyển): chỉ những bản này được giữ và được quay về */
const ACTIVE_MARK = '.activated';
/** Commit của bản; ghi ngay khi tạo thư mục, nên mọi thư mục do script tạo đều có */
const COMMIT_FILE = '.commit';
/** File code giao diện do chính bản này build ra (ngoài dist nên không bị phục vụ); bản sau chép lại để tab cũ còn chạy */
const ASSETS_FILE = '.assets.txt';
/** Đánh dấu thư mục triển khai: không có thì script không đụng tới thư mục đó */
const ROOT_MARK = '.mes-deploy';
const RELEASE_NAME = /^\d{8}-\d{6}(-\d+)?$/;
/** Thư mục được phép có sẵn khi lấy một thư mục làm thư mục triển khai lần đầu (người vận hành tạo shared\.env trước) */
const INIT_ENTRIES = new Set(['shared', 'logs', 'tmp']);

const USAGE = `Triển khai MES không hạ web (pm2 cluster + thư mục release).

  node deploy/deploy.cjs --root <thư mục>              git pull, build bản mới, migrate, chuyển bản
  node deploy/deploy.cjs --root <thư mục> --status     bản đang chạy, các bản còn giữ, trạng thái pm2
  node deploy/deploy.cjs --root <thư mục> --rollback   quay về bản chạy được gần nhất trước bản đang chạy (không migrate)
  node deploy/deploy.cjs --root <thư mục> --sync-env   đã sửa shared\\.env: chép vào bản đang chạy rồi pm2 reload

Tùy chọn:
  --ref <commit|nhánh|tag>   bản cần triển khai (mặc định HEAD sau khi pull; nhánh khác: origin/<nhánh>)
  --no-pull                  không git pull
  --online-migrate           có migration mới vẫn migrate khi bản cũ đang chạy (chỉ khi migration chỉ thêm bảng, cột)
  --replace <tên app pm2>    lần đầu: app pm2 cũ (khác tên "mes") đang giữ cổng, script gỡ nó lúc chuyển bản
  --keep <n>                 số bản đã chạy được giữ lại (mặc định 3, tối thiểu 2)
  --pm2 "<lệnh>"             lệnh gọi pm2 (mặc định pm2)
  --yes                      không hỏi xác nhận (đã sao lưu database)`;

class UserError extends Error {}
const fail = (msg) => {
  throw new UserError(msg);
};
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const isInside = (child, parent) => {
  const rel = path.relative(parent, child);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
};

function parseArgs(argv, repo) {
  const o = { root: '', ref: 'HEAD', pull: true, onlineMigrate: false, replace: '', keep: 3, pm2: 'pm2', yes: false, mode: 'deploy' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (!v || v.startsWith('--')) fail(`Thiếu giá trị sau ${a}.`);
      return v;
    };
    if (a === '--root') o.root = path.resolve(value());
    else if (a === '--ref') o.ref = value();
    else if (a === '--no-pull') o.pull = false;
    else if (a === '--online-migrate') o.onlineMigrate = true;
    else if (a === '--replace') o.replace = value();
    else if (a === '--keep') o.keep = Number(value());
    else if (a === '--pm2') o.pm2 = value();
    else if (a === '--yes') o.yes = true;
    else if (a === '--rollback') o.mode = 'rollback';
    else if (a === '--status') o.mode = 'status';
    else if (a === '--sync-env') o.mode = 'sync-env';
    else if (a === '--help' || a === '-h') o.mode = 'help';
    else fail(`Không hiểu tham số ${a}.\n\n${USAGE}`);
  }
  if (o.mode === 'help') return o;
  if (!o.root) fail(`Thiếu --root <thư mục triển khai>, ví dụ --root F:\\App\\MES-run.\n\n${USAGE}`);
  if (!Number.isInteger(o.keep) || o.keep < 2) fail('--keep phải là số nguyên từ 2 trở lên.');
  if (isInside(o.root, repo)) fail(`--root không được nằm trong thư mục mã nguồn ${repo}.`);
  if (isInside(repo, o.root)) fail(`--root không được chứa thư mục mã nguồn ${repo}.`);
  return o;
}

function layout(root) {
  return {
    root,
    releases: path.join(root, 'releases'),
    current: path.join(root, 'current'),
    env: path.join(root, 'shared', '.env'),
    logs: path.join(root, 'logs'),
    tmp: path.join(root, 'tmp'),
    ecosystem: path.join(root, 'ecosystem.config.cjs'),
    lock: path.join(root, 'deploy.lock'),
    marker: path.join(root, ROOT_MARK),
  };
}

/** Lấy thư mục làm thư mục triển khai: mới, trống, chỉ có shared\.env, hoặc đã đánh dấu. Có nội dung lạ thì từ chối */
function prepareRoot(L) {
  if (fs.existsSync(L.marker)) return false;
  if (fs.existsSync(L.root)) {
    const extra = fs.readdirSync(L.root).filter((n) => !INIT_ENTRIES.has(n));
    if (extra.length) {
      fail(`${L.root} đã có nội dung (${extra.slice(0, 5).join(', ')}) mà không phải thư mục triển khai (thiếu ${ROOT_MARK}). Chọn thư mục mới, hoặc thư mục chỉ có shared\\.env.`);
    }
  }
  fs.mkdirSync(L.root, { recursive: true });
  fs.writeFileSync(L.marker, 'Thư mục triển khai MES (deploy/deploy.cjs). Không xóa file này.\n');
  return true;
}

function requireRoot(L) {
  if (!fs.existsSync(L.marker)) fail(`${L.root} chưa phải thư mục triển khai (thiếu ${ROOT_MARK}): triển khai lần đầu trước.`);
}

/** Đọc .env theo cùng luật với dotenv (chú thích cuối dòng, ngoặc, export) để script và backend hiểu như nhau */
const ENV_LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;
function parseEnv(src) {
  const out = {};
  const text = src.replace(/\r\n?/gm, '\n');
  ENV_LINE.lastIndex = 0;
  let m;
  while ((m = ENV_LINE.exec(text)) !== null) {
    let v = (m[2] || '').trim();
    const quote = v[0];
    v = v.replace(/^(['"`])([\s\S]*)\1$/gm, '$2');
    if (quote === '"') v = v.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
    out[m[1]] = v;
  }
  return out;
}

/** Địa chỉ kiểm sống theo HOST, PORT của file .env (nghe mọi địa chỉ thì hỏi 127.0.0.1) */
function healthUrl(envFile) {
  const env = parseEnv(fs.readFileSync(envFile, 'utf8'));
  let host = !env.HOST || env.HOST === '0.0.0.0' || env.HOST === '::' ? '127.0.0.1' : env.HOST;
  if (host.includes(':')) host = `[${host}]`;
  return `http://${host}:${env.PORT || 3000}/api/v1/health`;
}

/** Khóa biến (kể cả dòng đã comment) trong file .env */
const envKeys = (file) => (fs.existsSync(file) ? [...fs.readFileSync(file, 'utf8').matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]) : []);

/** Xóa cây thư mục; junction (node_modules của workspace) chỉ gỡ liên kết, không đi vào thư mục đích */
function removeTree(p) {
  const st = fs.lstatSync(p);
  if (st.isSymbolicLink()) return fs.unlinkSync(p);
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(p)) removeTree(path.join(p, e));
    return fs.rmdirSync(p);
  }
  try {
    fs.unlinkSync(p);
  } catch (e) {
    if (e.code !== 'EPERM') throw e;
    fs.chmodSync(p, 0o666);
    fs.unlinkSync(p);
  }
}

/** Thư mục release mà junction current trỏ tới; chưa có thì null */
function currentRelease(L) {
  let st;
  try {
    st = fs.lstatSync(L.current);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  if (!st.isSymbolicLink()) fail(`${L.current} là thư mục thật, không phải junction. Đổi tên hoặc chuyển nó đi rồi chạy lại.`);
  let real;
  try {
    real = fs.realpathSync(L.current);
  } catch {
    return null;
  }
  if (!samePath(path.dirname(real), L.releases)) fail(`${L.current} trỏ ra ngoài ${L.releases} (${real}).`);
  return real;
}

/** Trỏ junction current sang release khác. Chỉ gỡ liên kết, không bao giờ xóa thư mục thật */
function pointCurrent(L, target) {
  let st = null;
  try {
    st = fs.lstatSync(L.current);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (st && !st.isSymbolicLink()) fail(`${L.current} là thư mục thật, không gỡ.`);
  if (st) fs.unlinkSync(L.current);
  fs.symlinkSync(target, L.current, 'junction');
}

function releaseInfo(dir) {
  const file = path.join(dir, COMMIT_FILE);
  if (!fs.existsSync(file)) return { sha: '', subject: '' };
  const [sha = '', subject = ''] = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  return { sha, subject };
}

/** Thư mục do script tạo (tên theo thời điểm, có .commit), xếp cũ trước. Thư mục khác trong releases không bao giờ bị đụng */
const releaseNames = (L) =>
  fs.existsSync(L.releases)
    ? fs
        .readdirSync(L.releases, { withFileTypes: true })
        .filter((d) => d.isDirectory() && RELEASE_NAME.test(d.name) && fs.existsSync(path.join(L.releases, d.name, COMMIT_FILE)))
        .map((d) => d.name)
        .sort()
    : [];
const hasMark = (dir, mark) => fs.existsSync(path.join(dir, mark));
const isBuilt = (dir) => hasMark(dir, BUILT_MARK);
const isActivated = (dir) => hasMark(dir, ACTIVE_MARK);

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Bản đã chạy được gần nhất trước bản đang chạy; bản build xong mà chưa từng chạy được thì bỏ qua */
function rollbackTarget(L, cur) {
  return releaseNames(L)
    .filter((n) => n < path.basename(cur) && isActivated(path.join(L.releases, n)))
    .map((n) => path.join(L.releases, n))
    .pop();
}

function migrationFiles(dir) {
  const base = path.join(dir, 'backend', 'migrations');
  const out = [];
  for (const db of fs.readdirSync(base, { withFileTypes: true })) {
    if (!db.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(base, db.name))) if (f.toLowerCase().endsWith('.sql')) out.push(`${db.name}/${f}`);
  }
  return out.sort();
}
const minus = (a, b) => a.filter((x) => !b.includes(x));

const assetDir = (release) => path.join(release, 'frontend', 'dist', 'assets');

/** Ghi danh sách file code của bản mới, rồi chép file code của bản đang chạy sang: tab mở từ trước vẫn tải được màn chưa mở */
function carryAssets(prev, next) {
  const own = fs.existsSync(assetDir(next)) ? fs.readdirSync(assetDir(next)) : [];
  fs.writeFileSync(path.join(next, ASSETS_FILE), own.join('\n'));
  const listFile = prev && path.join(prev, ASSETS_FILE);
  if (!listFile || !fs.existsSync(listFile)) return 0;
  let n = 0;
  for (const f of fs.readFileSync(listFile, 'utf8').split(/\r?\n/)) {
    if (!f || path.basename(f) !== f) continue;
    const src = path.join(assetDir(prev), f);
    const dst = path.join(assetDir(next), f);
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      fs.copyFileSync(src, dst);
      n++;
    }
  }
  return n;
}

/**
 * Giữ `keep` bản đã chạy được mới nhất và các bản trong `protect` (bản vừa làm, bản đang chạy, bản vừa chạy trước đó).
 * Bản build lỗi hoặc build xong mà chưa từng chạy được thì xóa. Trả danh sách đã xóa.
 */
function cleanReleases(L, keep, protect, onError = () => {}) {
  const names = releaseNames(L);
  const kept = new Set(names.filter((n) => isActivated(path.join(L.releases, n))).slice(-keep));
  const removed = [];
  for (const n of names) {
    const dir = path.join(L.releases, n);
    if (kept.has(n) || protect.some((p) => p && samePath(p, dir))) continue;
    try {
      removeTree(dir);
      removed.push(n);
    } catch (e) {
      onError(dir, e);
    }
  }
  return removed;
}

module.exports = {
  ACTIVE_MARK,
  ASSETS_FILE,
  BUILT_MARK,
  COMMIT_FILE,
  ROOT_MARK,
  USAGE,
  UserError,
  carryAssets,
  cleanReleases,
  currentRelease,
  envKeys,
  fail,
  healthUrl,
  isActivated,
  isBuilt,
  isInside,
  layout,
  migrationFiles,
  minus,
  parseArgs,
  parseEnv,
  pointCurrent,
  prepareRoot,
  releaseInfo,
  releaseNames,
  removeTree,
  requireRoot,
  rollbackTarget,
  samePath,
  stamp,
};
