'use strict';
/**
 * Triển khai bản mới lên máy chủ Windows mà không hạ web (docs/update_docs/11-van-hanh.md, mục Cập nhật bản mới).
 *
 * Bản mới lấy từ git, cài gói, build trong thư mục riêng <root>\releases\<thời điểm> trong lúc bản cũ vẫn chạy. Chỉ bước
 * cuối mới trỏ junction <root>\current sang bản mới rồi `pm2 reload` (cluster: tiến trình mới nghe cổng xong mới tắt cũ).
 * Viết bằng Node, không bằng PowerShell 5.1: ConvertFrom-Json hỏng với `pm2 jlist` (khóa Path/PATH trùng),
 * Remove-Item -Recurse có thể đi xuyên junction xóa luôn thư mục đích, file .ps1 không BOM hỏng chữ tiếng Việt.
 * Hàm thuần nằm ở lib.cjs (có test: deploy.test.cjs).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const readline = require('readline');
const lib = require('./lib.cjs');

const { UserError, fail } = lib;
const REPO = path.resolve(__dirname, '..');
const readSelf = () => ['deploy.cjs', 'lib.cjs', 'ecosystem.config.cjs'].map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\0');
/** Script lúc bắt đầu chạy: git pull đổi script thì chạy lại bằng bản mới */
const SELF = readSelf();
/** Thư mục release đang làm dở: Ctrl+C lúc chưa build xong thì dọn (có .env) */
const pending = { dir: '', keep: false };

const step = (msg) => console.log(`\n==> ${msg}`);
const warn = (msg) => console.log(`Cảnh báo: ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- Chạy lệnh ----------------

/** Chạy chương trình không qua shell (git, node): tham số như ^, % không bị cmd hiểu sai */
function exec(file, args, { cwd = REPO, capture = false, env } = {}) {
  const r = spawnSync(file, args, { cwd, env: env ?? process.env, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', maxBuffer: 64 << 20 });
  if (r.error) fail(`Không chạy được ${file}: ${r.error.message}`);
  if (r.status !== 0) fail(`Lệnh lỗi (mã ${r.status}): ${file} ${args.join(' ')}${capture && r.stderr ? `\n${r.stderr.trim()}` : ''}`);
  return capture ? r.stdout.trim() : '';
}

const quote = (s) => {
  if (s.includes('"')) fail(`Đường dẫn, tên không được chứa dấu ": ${s}`);
  return /[\s&|<>^()%!]/.test(s) ? `"${s}"` : s;
};

/** npm, pm2 là file .cmd trên Windows: phải chạy qua shell */
function shell(line, { cwd = REPO, capture = false, allowFail = false } = {}) {
  const r = spawnSync(line, { cwd, shell: true, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', maxBuffer: 64 << 20 });
  if (r.error) fail(`Không chạy được: ${line}\n${r.error.message}`);
  if (r.status !== 0 && !allowFail) fail(`Lệnh lỗi (mã ${r.status}): ${line}${capture && r.stderr ? `\n${r.stderr.trim()}` : ''}`);
  return r;
}

/** Hỏi có/không. --yes là có; không có bàn phím hoặc Ctrl+C (readline tự đóng) là không */
async function confirm(o, question) {
  if (o.yes) return true;
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.on('close', () => resolve(''));
    rl.question(`${question} (y/N) `, resolve);
  });
  rl.close();
  return /^(y|yes|c|có|co)$/i.test(answer.trim());
}

function acquireLock(L) {
  try {
    fs.writeFileSync(L.lock, `${process.pid} ${new Date().toISOString()}\n`, { flag: 'wx' });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    fail(`Đang có lần triển khai khác (${L.lock}: ${fs.readFileSync(L.lock, 'utf8').trim()}). Chắc chắn không còn lần nào chạy thì xóa file đó rồi chạy lại.`);
  }
  let held = true;
  const release = () => {
    if (held) fs.rmSync(L.lock, { force: true });
    held = false;
  };
  process.on('exit', release);
  process.on('SIGINT', () => {
    if (pending.dir && !pending.keep) {
      try {
        lib.removeTree(pending.dir);
      } catch {
        // npm còn giữ file: lần triển khai sau dọn (thư mục có .commit, chưa .activated)
      }
    }
    release();
    process.exit(130);
  });
  return release;
}

// ---------------- pm2, kiểm sống, kiểm trước ----------------

function appName() {
  return require(path.join(__dirname, 'ecosystem.config.cjs')).apps[0].name;
}

function pm2Apps(o) {
  const r = shell(`${o.pm2} jlist`, { capture: true, allowFail: true });
  if (r.status !== 0) fail(`Không chạy được "${o.pm2} jlist". Máy đã cài pm2 chưa (npm install -g pm2)?\n${(r.stderr || '').trim()}`);
  // Daemon chưa chạy thì pm2 in thêm dòng "[PM2] ..." trước JSON
  const start = r.stdout.search(/\[\s*[{\]]/);
  const end = r.stdout.lastIndexOf(']');
  if (start < 0 || end < start) fail(`Không đọc được kết quả "${o.pm2} jlist".`);
  return JSON.parse(r.stdout.slice(start, end + 1)).map((p) => ({
    name: p.name,
    status: p.pm2_env?.status,
    mode: p.pm2_env?.exec_mode,
    script: p.pm2_env?.pm_exec_path ?? '',
    uptime: p.pm2_env?.pm_uptime ?? 0,
    restarts: p.pm2_env?.restart_time ?? 0,
  }));
}

/** managed: app chạy theo ecosystem trong <root> (cluster, script qua junction current); foreign: cùng tên nhưng chạy kiểu cũ */
function appState(o, L, name) {
  const apps = pm2Apps(o).filter((a) => a.name === name);
  if (!apps.length) return { kind: 'absent', online: false, uptime: 0, restarts: 0, apps };
  const script = path.join(L.current, 'backend', 'dist', 'main.js');
  const managed = apps.every((a) => a.mode === 'cluster_mode' && lib.samePath(a.script, script));
  return {
    kind: managed ? 'managed' : 'foreign',
    online: apps.some((a) => a.status === 'online'),
    uptime: Math.max(...apps.map((a) => a.uptime)),
    restarts: apps.reduce((s, a) => s + a.restarts, 0),
    apps,
  };
}

function probe(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    try {
      const req = http.get(url, { timeout: timeoutMs }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve(res.statusCode === 200 && body.includes('"ok"')));
      });
      req.on('timeout', () => req.destroy());
      req.on('error', () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

/**
 * Chờ kiểm sống ok rồi chờ thêm vài giây. Gọi ngay sau lệnh pm2: pm2 chạy lại tiến trình (số lần khởi động lại tăng) là
 * bản đang chết lúc khởi động, báo lỗi ngay thay vì chờ hết giờ; lên rồi chết ngay thì lần hỏi đầu có thể vẫn ok
 */
async function waitStable(o, L, name, url) {
  const crashed = (base) => {
    const s = appState(o, L, name);
    return s.restarts > base.restarts || !s.apps.some((a) => ['online', 'launching'].includes(a.status));
  };
  const base = appState(o, L, name);
  const until = Date.now() + 60_000;
  let healthy = false;
  while (!healthy && Date.now() < until) {
    healthy = await probe(url);
    if (!healthy) {
      if (crashed(base)) return false;
      await sleep(1000);
    }
  }
  if (!healthy) return false;
  await sleep(5000);
  return !crashed(base) && (await probe(url));
}

/** Kiểm trước khi chuyển bản: giao diện đã build, cấu hình .env hợp lệ với bản này (lỗi hay gặp nhất, bắt được mà không chạy app) */
function preflight(dir) {
  if (!fs.existsSync(path.join(dir, 'frontend', 'dist', 'index.html'))) fail(`Bản ${dir} thiếu frontend\\dist\\index.html.`);
  const envJs = path.join(dir, 'backend', 'dist', 'config', 'env.js');
  const r = spawnSync(process.execPath, ['-e', 'require(process.argv[1])', envJs], { cwd: path.join(dir, 'backend'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) {
    const line = (r.stderr || '').split(/\r?\n/).find((l) => /Error:/.test(l)) ?? (r.stderr || '').slice(0, 1000);
    fail(`Cấu hình .env không hợp lệ với bản này: ${line.trim()}`);
  }
}

/** Thư mục chứa .env (mật khẩu DB, JWT_SECRET) mà nhóm rộng đọc được thì cảnh báo; không tự đổi quyền (pm2 có thể chạy bằng tài khoản khác) */
function checkAcl(L) {
  if (process.platform !== 'win32') return;
  const r = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', "(Get-Acl -LiteralPath $env:MES_DEPLOY_ROOT).Access | ForEach-Object { try { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value } catch { '' } }"],
    { env: { ...process.env, MES_DEPLOY_ROOT: L.root }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (r.status !== 0) return;
  const broad = { 'S-1-1-0': 'Everyone', 'S-1-5-11': 'Authenticated Users', 'S-1-5-32-545': 'Users' };
  const found = [...new Set(r.stdout.split(/\r?\n/).map((s) => s.trim()))].filter((s) => broad[s]).map((s) => broad[s]);
  if (!found.length) return;
  const me = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
  warn(
    `${L.root} cho ${found.join(', ')} truy cập, trong đó có .env (mật khẩu DB, JWT_SECRET). Thu hẹp quyền (PowerShell quản trị; thêm tài khoản chạy pm2 nếu khác ${me}):\n` +
      `  icacls "${L.root}" /inheritance:r /grant:r *S-1-5-32-544:(OI)(CI)F *S-1-5-18:(OI)(CI)F "${me}":(OI)(CI)F`,
  );
}

/** Chép đúng nội dung commit ra thư mục, qua index tạm: không đổi HEAD, index hay file trong repo; không cần tar */
function exportCommit(L, commit, dest) {
  const index = path.join(L.tmp, `index-${process.pid}`);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    exec('git', ['-C', REPO, 'read-tree', commit], { env });
    exec('git', ['-C', REPO, 'checkout-index', '--all', '--force', `--prefix=${dest.replace(/\\/g, '/')}/`], { env });
  } finally {
    fs.rmSync(index, { force: true });
  }
}

async function ensureSharedEnv(o, L) {
  if (fs.existsSync(L.env)) return;
  const repoEnv = path.join(REPO, 'backend', '.env');
  if (fs.existsSync(repoEnv) && (await confirm(o, `Chưa có ${L.env}. Chép từ ${repoEnv}?`))) {
    fs.mkdirSync(path.dirname(L.env), { recursive: true });
    fs.copyFileSync(repoEnv, L.env);
    console.log(`Đã chép ${L.env}.`);
    return;
  }
  fail(`Chưa có ${L.env}: tạo file này (nội dung như backend\\.env của máy chủ) rồi chạy lại.`);
}

/** Nhánh cục bộ chậm hơn nhánh theo dõi (git pull chỉ cập nhật nhánh đang checkout) thì hỏi lại */
async function checkRefFresh(o) {
  const up = spawnSync('git', ['-C', REPO, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', `${o.ref}@{upstream}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (up.status !== 0) return;
  const upstream = up.stdout.trim();
  const behind = Number(exec('git', ['-C', REPO, 'rev-list', '--count', `${o.ref}..${upstream}`], { capture: true }));
  if (behind > 0 && !(await confirm(o, `Nhánh ${o.ref} ở máy này chậm hơn ${upstream} ${behind} commit. Vẫn triển khai ${o.ref} (muốn bản mới nhất thì --ref ${upstream})?`))) {
    fail('Đã dừng, chưa đụng tới bản đang chạy.');
  }
}

// ---------------- Lệnh ----------------

async function deploy(o, L, releaseLock) {
  for (const d of [L.releases, L.logs, L.tmp]) fs.mkdirSync(d, { recursive: true });
  await ensureSharedEnv(o, L);
  checkAcl(L);
  const name = appName();
  const url = lib.healthUrl(L.env);
  const prev = lib.currentRelease(L);
  let state = appState(o, L, name);

  // Kiểm trước khi build (mất vài phút): lần đầu có tiến trình khác giữ cổng thì app mới không lên được
  if (o.replace) {
    if (o.replace === name) fail(`--replace dùng cho app pm2 khác tên "${name}"; app "${name}" chạy kiểu cũ thì script tự thay.`);
    if (state.kind !== 'absent') fail(`pm2 đã có app "${name}": --replace chỉ dùng khi chưa có app này (lần đầu, bản cũ chạy bằng app tên khác).`);
    if (!pm2Apps(o).some((a) => a.name === o.replace)) fail(`pm2 không có app "${o.replace}".`);
  } else if (state.kind === 'absent' && (await probe(url))) {
    fail(`Có tiến trình đang trả lời ở ${url} mà pm2 chưa có app "${name}". Bản cũ chạy bằng pm2 tên khác thì thêm --replace <tên app đó>; chạy bằng dịch vụ Windows thì dừng dịch vụ trước.`);
  }

  step('Lấy mã nguồn');
  if (o.pull) {
    // Không dùng `git pull`: tiến trình pull còn giữ file pack trong lúc `git merge` con chạy gc tự động, Windows không cho
    // xóa pack cũ nên git hỏi "Unlink of file ... Should I try again?" mãi. Lệnh riêng thì mỗi lệnh tự nhả pack trước gc
    exec('git', ['-C', REPO, 'fetch']);
    exec('git', ['-C', REPO, 'merge', '--ff-only', '@{upstream}']);
    if (readSelf() !== SELF && !process.env.MES_DEPLOY_RERUN) {
      console.log('Script triển khai vừa đổi theo mã nguồn mới: chạy lại bằng bản mới.');
      releaseLock();
      const r = spawnSync(process.execPath, [__filename, ...process.argv.slice(2), '--no-pull'], { stdio: 'inherit', env: { ...process.env, MES_DEPLOY_RERUN: '1' } });
      process.exitCode = r.status ?? 1;
      return;
    }
  }
  if (o.ref !== 'HEAD') await checkRefFresh(o);
  const commit = exec('git', ['-C', REPO, 'rev-parse', '--verify', `${o.ref}^{commit}`], { capture: true });
  const subject = exec('git', ['-C', REPO, 'log', '-1', '--format=%h %s', commit], { capture: true });
  console.log(`Nhánh đang checkout: ${exec('git', ['-C', REPO, 'rev-parse', '--abbrev-ref', 'HEAD'], { capture: true })}`);
  console.log(`Bản cần triển khai: ${subject}${o.ref !== 'HEAD' ? ` (--ref ${o.ref})` : ''}`);
  if (prev && lib.releaseInfo(prev).sha === commit && !(await confirm(o, 'Bản đang chạy đã là commit này. Vẫn triển khai lại?'))) {
    console.log('Không có gì để triển khai.');
    return;
  }

  const base = path.join(L.releases, lib.stamp());
  let dir = base;
  for (let i = 2; fs.existsSync(dir); i++) dir = `${base}-${i}`;
  fs.mkdirSync(dir);
  pending.dir = dir;
  fs.writeFileSync(path.join(dir, lib.COMMIT_FILE), `${commit}\n${subject}\n`);

  /**
   * prepare: bản cũ chưa bị đụng; stopped: đã dừng bản cũ; switched: current trỏ bản mới; restoring: đang tự quay về bản
   * trước; restored: đã quay về, web chạy bản trước
   */
  let stage = 'prepare';
  const oldApp = o.replace || name;
  const guidance = () => {
    if (stage === 'switched') return `\n${L.current} đang trỏ bản mới. Kiểm "${o.pm2} status", log ở ${L.logs}; quay về bản trước: node deploy/deploy.cjs --root ${L.root} --rollback`;
    if (stage === 'restoring') return `\n${L.current} đã trỏ về bản trước nhưng nó chưa chạy ổn định. Kiểm "${o.pm2} status", log ở ${L.logs}.`;
    if (stage === 'stopped') return `\nBackend đang DỪNG, ${L.current} vẫn trỏ bản cũ. Sửa nguyên nhân rồi chạy lại, hoặc "${o.pm2} start ${oldApp}" để chạy bản cũ (database đã migrate thì cân nhắc phục hồi sao lưu).`;
    if (stage === 'prepare' && state.online) return '\nBản cũ vẫn chạy, chưa chuyển bản.';
    return '';
  };

  try {
    exportCommit(L, commit, dir);
    fs.copyFileSync(L.env, path.join(dir, 'backend', '.env'));
    console.log(`Thư mục bản mới: ${dir}`);

    const newKeys = lib.minus(lib.envKeys(path.join(dir, 'backend', '.env.example')), prev ? lib.envKeys(path.join(prev, 'backend', '.env.example')) : []);
    const missing = lib.minus(newKeys, lib.envKeys(L.env));
    if (prev && missing.length) warn(`bản này thêm biến môi trường mà ${L.env} chưa có: ${missing.join(', ')}. Xem backend/.env.example, 11-van-hanh.md.`);

    // Biết trước có migration mới không để hỏi ngay, không bắt chờ build xong
    const added = prev ? lib.minus(lib.migrationFiles(dir), lib.migrationFiles(prev)) : null;
    // Có migration mới: dừng bản cũ trước khi migrate (bản cũ có thể đọc sai schema mới, 11-van-hanh.md)
    const migrateStopped = (added === null || added.length > 0) && !o.onlineMigrate;
    const stopsOld = migrateStopped && (state.online || !!o.replace);
    if (added === null) console.log('Chưa có bản nào chạy theo cách này để so migration: coi như có migration mới.');
    else if (added.length) console.log(`Migration mới:\n${added.map((f) => `  ${f}`).join('\n')}`);
    if (added === null || added.length) {
      const how = !migrateStopped
        ? 'Migrate lúc bản cũ còn chạy (--online-migrate).'
        : stopsOld
          ? 'Bản cũ sẽ DỪNG trong lúc migrate (bản mới đã build sẵn), xong thì chạy bản mới.'
          : 'Chạy migrate rồi khởi động bản mới.';
      if (!(await confirm(o, `${how} Đã sao lưu các database MES chưa?`))) fail('Chưa sao lưu: dừng.');
    }

    step('Cài gói, build (bản cũ vẫn chạy)');
    shell('npm ci --include=dev --prefer-offline --no-audit --fund=false', { cwd: dir });
    shell('npm run build', { cwd: dir });
    preflight(dir);
    // Bản có database mới (ví dụ MES_Cutting) mà tài khoản không tạo được: dừng lúc bản cũ còn chạy, chưa migrate gì
    if (added === null || added.length) {
      step('Kiểm database (bản cũ vẫn chạy)');
      shell('npm run migrate -- --check', { cwd: dir });
    }
    const carried = lib.carryAssets(prev, dir);
    if (carried) console.log(`Giữ ${carried} file code giao diện của bản đang chạy cho tab đã mở.`);
    fs.writeFileSync(path.join(dir, lib.BUILT_MARK), new Date().toISOString());
    pending.keep = true;

    const eco = quote(L.ecosystem);
    const stoppedAt = Date.now();
    if (stopsOld) {
      step(`Dừng bản cũ để migrate (${oldApp})`);
      stage = 'stopped';
      shell(`${o.pm2} stop ${quote(oldApp)}`);
    }

    step(`Migrate, nạp dữ liệu hệ thống${state.online && !stopsOld ? ' (bản cũ vẫn chạy)' : ''}`);
    shell('npm run migrate', { cwd: dir });

    step('Chuyển sang bản mới');
    fs.copyFileSync(path.join(dir, 'deploy', 'ecosystem.config.cjs'), L.ecosystem);
    lib.pointCurrent(L, dir);
    stage = 'switched';
    const before = state.uptime;
    if (state.kind === 'managed') {
      shell(`${o.pm2} ${state.online && !stopsOld ? 'reload' : 'restart'} ${eco}`);
    } else {
      if (state.kind === 'foreign') shell(`${o.pm2} delete ${quote(name)}`);
      if (o.replace) shell(`${o.pm2} delete ${quote(o.replace)}`);
      shell(`${o.pm2} start ${eco}`);
      shell(`${o.pm2} save`);
    }

    if (!(await waitStable(o, L, name, url))) {
      // Không có migration mới thì bản trước chạy đúng với database hiện tại: tự quay về, web chỉ hạ trong lúc chờ
      if (!stopsOld && prev && lib.isActivated(prev)) {
        warn('bản mới không chạy ổn định: tự quay về bản trước.');
        fs.copyFileSync(L.env, path.join(prev, 'backend', '.env'));
        lib.pointCurrent(L, prev);
        stage = 'restoring';
        shell(`${o.pm2} restart ${eco}`);
        if (await waitStable(o, L, name, url)) {
          stage = 'restored';
          fail(`Bản mới ${subject} không chạy được; đã quay về ${lib.releaseInfo(prev).subject}. Xem log ở ${L.logs}.`);
        }
      }
      fail(`Bản đang trỏ tới chưa chạy ổn định (${url}). Xem log ở ${L.logs}.`);
    }
    fs.writeFileSync(path.join(dir, lib.ACTIVE_MARK), new Date().toISOString());
    stage = 'done';
    state = appState(o, L, name);
    if (state.kind !== 'managed') warn(`pm2 không lưu đường dẫn qua junction (${state.apps.map((a) => a.script).join(', ')}): lần sau reload sẽ không đổi bản.`);
    if (state.uptime <= before) warn('pm2 chưa khởi động lại tiến trình (thời điểm chạy không đổi).');
    console.log(`\nĐang chạy: ${subject}`);
    if (stopsOld) console.log(`Thời gian web gián đoạn: khoảng ${Math.round((Date.now() - stoppedAt) / 1000)} giây.`);
  } catch (e) {
    if (stage === 'prepare' && !lib.isBuilt(dir)) {
      try {
        lib.removeTree(dir);
      } catch {
        // Dọn ở lần sau (thư mục có .commit, chưa .activated)
      }
    }
    throw new UserError(`${e instanceof UserError ? e.message : (e.stack ?? e)}${guidance()}`);
  } finally {
    pending.dir = '';
    try {
      const removed = lib.cleanReleases(L, o.keep, [dir, prev, lib.currentRelease(L)], (d, e) => warn(`không xóa được ${d}: ${e.message}`));
      for (const n of removed) console.log(`Đã xóa bản cũ ${n}`);
    } catch (e) {
      warn(`không dọn được bản cũ: ${e.message}`);
    }
  }
}

async function rollback(o, L) {
  const cur = lib.currentRelease(L);
  if (!cur) fail(`Chưa có bản đang chạy ở ${L.current}.`);
  const target = lib.rollbackTarget(L, cur);
  if (!target) fail('Không còn bản nào đã chạy được trước bản đang chạy.');
  console.log(`Đang chạy: ${lib.releaseInfo(cur).subject}\nQuay về:  ${lib.releaseInfo(target).subject}`);
  const extra = lib.minus(lib.migrationFiles(cur), lib.migrationFiles(target));
  if (extra.length) {
    warn(`database đã chạy migration mà bản trước không có:\n${extra.map((f) => `  ${f}`).join('\n')}`);
    console.log('Không có migration lùi: bản trước có thể chạy sai với database hiện tại; cần thì phục hồi sao lưu.');
  }
  if (!(await confirm(o, 'Quay về bản trước?'))) fail('Đã hủy.');
  const name = appName();
  const state = appState(o, L, name);
  if (state.kind !== 'managed') fail(`pm2 chưa chạy app "${name}" theo ${L.ecosystem}.`);
  // Bản trước dùng cấu hình hiện tại (đổi qua --sync-env sau khi nó chạy), không dùng bản chép lúc nó được triển khai
  fs.copyFileSync(L.env, path.join(target, 'backend', '.env'));
  preflight(target);
  lib.pointCurrent(L, target);
  shell(`${o.pm2} ${state.online ? 'reload' : 'restart'} ${quote(L.ecosystem)}`);
  const url = lib.healthUrl(L.env);
  if (!(await waitStable(o, L, name, url))) fail(`Bản trước chưa chạy ổn định (${url}). Xem log ở ${L.logs}.`);
  console.log(`Đang chạy: ${lib.releaseInfo(target).subject}`);
}

/** Mỗi bản giữ một bản sao .env (backend tìm .env theo vị trí main.js): đổi cấu hình thì chép lại vào bản đang chạy */
async function syncEnv(o, L) {
  const cur = lib.currentRelease(L);
  if (!cur) fail(`Chưa có bản đang chạy ở ${L.current}.`);
  if (!fs.existsSync(L.env)) fail(`Chưa có ${L.env}.`);
  const name = appName();
  const state = appState(o, L, name);
  if (state.kind !== 'managed') fail(`pm2 chưa chạy app "${name}" theo ${L.ecosystem}.`);
  const target = path.join(cur, 'backend', '.env');
  const backup = `${target}.truoc`;
  const oldUrl = lib.healthUrl(target);
  fs.copyFileSync(target, backup);
  try {
    fs.copyFileSync(L.env, target);
    try {
      preflight(cur);
    } catch (e) {
      fs.copyFileSync(backup, target);
      fail(`${e.message}\nĐã giữ cấu hình cũ, chưa khởi động lại. Sửa ${L.env} rồi chạy lại.`);
    }
    shell(`${o.pm2} ${state.online ? 'reload' : 'restart'} ${quote(L.ecosystem)}`);
    if (!(await waitStable(o, L, name, lib.healthUrl(L.env)))) {
      fs.copyFileSync(backup, target);
      shell(`${o.pm2} restart ${quote(L.ecosystem)}`);
      const back = await waitStable(o, L, name, oldUrl);
      fail(`Backend không chạy ổn định với cấu hình mới; ${back ? 'đã trả lại cấu hình cũ' : 'trả lại cấu hình cũ cũng chưa lên'}. ${L.env} vẫn là bản mới: sửa lại. Xem log ở ${L.logs}.`);
    }
    console.log(`Backend đã chạy với cấu hình mới (${lib.releaseInfo(cur).subject}).`);
  } finally {
    fs.rmSync(backup, { force: true });
  }
}

async function status(o, L) {
  if (!fs.existsSync(L.marker)) return console.log(`${L.root} chưa phải thư mục triển khai.`);
  const cur = lib.currentRelease(L);
  console.log(`Thư mục triển khai: ${L.root}`);
  for (const n of lib.releaseNames(L).reverse()) {
    const dir = path.join(L.releases, n);
    const mark = cur && lib.samePath(cur, dir) ? '*' : ' ';
    const kind = lib.isActivated(dir) ? '' : lib.isBuilt(dir) ? '  (build xong, chưa chạy được)' : '  (build lỗi hoặc đang làm)';
    console.log(`${mark} ${n}  ${lib.releaseInfo(dir).subject}${kind}`);
  }
  if (!fs.existsSync(L.env)) return console.log(`Chưa có ${L.env}.`);
  const state = appState(o, L, appName());
  console.log(`pm2: ${state.kind === 'absent' ? 'chưa có app' : `${state.apps.map((a) => a.status).join(', ')} (${state.kind === 'managed' ? 'theo ecosystem' : 'chạy kiểu cũ'})`}`);
  console.log(`Kiểm sống ${lib.healthUrl(L.env)}: ${(await probe(lib.healthUrl(L.env))) ? 'ok' : 'không trả lời'}`);
}

async function main() {
  const o = lib.parseArgs(process.argv.slice(2), REPO);
  if (o.mode === 'help') return console.log(lib.USAGE);
  const L = lib.layout(o.root);
  if (o.mode === 'status') return status(o, L);
  if (o.mode === 'deploy') lib.prepareRoot(L);
  else lib.requireRoot(L);
  const releaseLock = acquireLock(L);
  if (o.mode === 'rollback') return rollback(o, L);
  if (o.mode === 'sync-env') return syncEnv(o, L);
  return deploy(o, L, releaseLock);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`\nLỗi: ${e instanceof UserError ? e.message : (e.stack ?? e)}`);
    process.exitCode = 1;
  });
}
