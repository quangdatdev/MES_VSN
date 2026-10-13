'use strict';
// Test hàm thuần của deploy.cjs (node --test deploy/deploy.test.cjs): nhất là các chỗ xóa thư mục, junction.
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { afterEach, beforeEach, describe, it } = require('node:test');
const lib = require('./lib.cjs');

let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mes-deploy-'));
});
afterEach(() => {
  lib.removeTree(tmp);
});

const write = (file, text = '') => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** Thư mục triển khai giả có các bản theo tên, đánh dấu tùy chọn */
function makeRoot(releases) {
  const L = lib.layout(path.join(tmp, 'run'));
  lib.prepareRoot(L);
  for (const [name, marks] of Object.entries(releases)) {
    const dir = path.join(L.releases, name);
    write(path.join(dir, lib.COMMIT_FILE), `sha-${name}\n${name} tiêu đề\n`);
    write(path.join(dir, 'backend', 'dist', 'main.js'), '//');
    for (const m of marks) write(path.join(dir, m), 'x');
  }
  return L;
}

describe('parseArgs', () => {
  const repo = path.join(path.parse(process.cwd()).root, 'ma-nguon', 'MES');
  it('bắt buộc --root, --keep từ 2, không nằm trong hoặc chứa thư mục mã nguồn, không nhận tham số lạ', () => {
    assert.throws(() => lib.parseArgs([], repo), /Thiếu --root/);
    assert.throws(() => lib.parseArgs(['--root', path.join(repo, 'run')], repo), /không được nằm trong/);
    assert.throws(() => lib.parseArgs(['--root', path.dirname(path.dirname(repo))], repo), /không được chứa/);
    assert.throws(() => lib.parseArgs(['--root', 'X:/run', '--keep', '1'], repo), /--keep/);
    assert.throws(() => lib.parseArgs(['--root', 'X:/run', '--xoa'], repo), /Không hiểu tham số/);
    assert.throws(() => lib.parseArgs(['--root', 'X:/run', '--ref'], repo), /Thiếu giá trị/);
  });
  it('đọc chế độ và tùy chọn', () => {
    const o = lib.parseArgs(['--root', 'X:/run', '--rollback', '--yes', '--keep', '4', '--no-pull'], repo);
    assert.equal(o.mode, 'rollback');
    assert.equal(o.yes, true);
    assert.equal(o.keep, 4);
    assert.equal(o.pull, false);
    assert.equal(lib.parseArgs(['--root', 'X:/run', '--sync-env'], repo).mode, 'sync-env');
    assert.equal(lib.parseArgs(['--help'], repo).mode, 'help');
  });
});

describe('parseEnv, healthUrl', () => {
  it('đọc như dotenv: chú thích cuối dòng, ngoặc, export, CRLF', () => {
    const env = lib.parseEnv('PORT=3100 # cổng\r\nexport HOST="127.0.0.1"\r\n# DB_HOST=x\r\nJWT_SECRET=\'a#b\'\r\nEMPTY=\r\n');
    assert.deepEqual(env, { PORT: '3100', HOST: '127.0.0.1', JWT_SECRET: 'a#b', EMPTY: '' });
  });
  it('nghe mọi địa chỉ thì hỏi 127.0.0.1; IPv6 bọc ngoặc vuông; mặc định cổng 3000', () => {
    const url = (text) => {
      const f = path.join(tmp, '.env');
      fs.writeFileSync(f, text);
      return lib.healthUrl(f);
    };
    assert.equal(url(''), 'http://127.0.0.1:3000/api/v1/health');
    assert.equal(url('HOST=0.0.0.0\nPORT=3100 # cổng'), 'http://127.0.0.1:3100/api/v1/health');
    assert.equal(url('HOST=::'), 'http://127.0.0.1:3000/api/v1/health');
    assert.equal(url('HOST=::1'), 'http://[::1]:3000/api/v1/health');
    assert.equal(url('HOST=10.0.0.5'), 'http://10.0.0.5:3000/api/v1/health');
  });
});

describe('Xóa thư mục, junction', () => {
  it('removeTree chỉ gỡ junction, không đi vào thư mục đích', () => {
    const target = path.join(tmp, 'dich');
    write(path.join(target, 'quan-trong.txt'), 'giữ');
    const tree = path.join(tmp, 'cay');
    write(path.join(tree, 'node_modules', 'a.js'), '//');
    fs.symlinkSync(target, path.join(tree, 'node_modules', 'mes-backend'), 'junction');
    lib.removeTree(tree);
    assert.equal(fs.existsSync(tree), false);
    assert.equal(fs.readFileSync(path.join(target, 'quan-trong.txt'), 'utf8'), 'giữ');
  });

  it('pointCurrent tạo, trỏ lại junction; không gỡ thư mục thật tên current', () => {
    const L = makeRoot({ '20261013-090000': [], '20261013-100000': [] });
    lib.pointCurrent(L, path.join(L.releases, '20261013-090000'));
    assert.ok(lib.samePath(lib.currentRelease(L), path.join(L.releases, '20261013-090000')));
    lib.pointCurrent(L, path.join(L.releases, '20261013-100000'));
    assert.ok(lib.samePath(lib.currentRelease(L), path.join(L.releases, '20261013-100000')));
    assert.ok(fs.existsSync(path.join(L.releases, '20261013-090000', lib.COMMIT_FILE)));

    fs.unlinkSync(L.current);
    write(path.join(L.current, 'du-lieu.txt'), 'giữ');
    assert.throws(() => lib.pointCurrent(L, path.join(L.releases, '20261013-090000')), /thư mục thật/);
    assert.throws(() => lib.currentRelease(L), /thư mục thật/);
    assert.equal(fs.readFileSync(path.join(L.current, 'du-lieu.txt'), 'utf8'), 'giữ');
  });

  it('currentRelease từ chối junction trỏ ra ngoài releases', () => {
    const L = makeRoot({});
    fs.mkdirSync(path.join(tmp, 'ngoai'));
    fs.symlinkSync(path.join(tmp, 'ngoai'), L.current, 'junction');
    assert.throws(() => lib.currentRelease(L), /trỏ ra ngoài/);
  });
});

describe('Thư mục triển khai', () => {
  it('nhận thư mục mới, trống hoặc chỉ có shared; từ chối thư mục có nội dung lạ', () => {
    assert.equal(lib.prepareRoot(lib.layout(path.join(tmp, 'moi'))), true);
    const shared = lib.layout(path.join(tmp, 'co-shared'));
    write(shared.env, 'PORT=3000');
    assert.equal(lib.prepareRoot(shared), true);
    assert.equal(lib.prepareRoot(shared), false);
    const other = lib.layout(path.join(tmp, 'o-khac'));
    write(path.join(other.root, 'releases', 'du-lieu', 'a.txt'), 'giữ');
    assert.throws(() => lib.prepareRoot(other), /không phải thư mục triển khai/);
    assert.throws(() => lib.requireRoot(other), /chưa phải thư mục triển khai/);
    assert.ok(fs.existsSync(path.join(other.root, 'releases', 'du-lieu', 'a.txt')));
  });

  it('cleanReleases: giữ n bản đã chạy được mới nhất và bản được bảo vệ; xóa bản chưa từng chạy; không đụng thư mục lạ', () => {
    const { BUILT_MARK: B, ACTIVE_MARK: A } = lib;
    const L = makeRoot({
      '20261001-000000': [B, A],
      '20261002-000000': [B, A],
      '20261003-000000': [B],
      '20261004-000000': [],
      '20261005-000000': [B, A],
      '20261006-000000': [B, A],
      '20261007-000000': [B],
    });
    write(path.join(L.releases, 'ban-sao-tay', 'a.txt'), 'giữ');
    write(path.join(L.releases, '20261008-000000', 'khong-co-commit.txt'), 'giữ');
    const removed = lib.cleanReleases(L, 2, [path.join(L.releases, '20261007-000000'), path.join(L.releases, '20261002-000000')]);
    assert.deepEqual(removed, ['20261001-000000', '20261003-000000', '20261004-000000']);
    assert.deepEqual(lib.releaseNames(L), ['20261002-000000', '20261005-000000', '20261006-000000', '20261007-000000']);
    assert.ok(fs.existsSync(path.join(L.releases, 'ban-sao-tay', 'a.txt')));
    assert.ok(fs.existsSync(path.join(L.releases, '20261008-000000', 'khong-co-commit.txt')));
  });

  it('rollbackTarget bỏ qua bản build xong mà chưa từng chạy được', () => {
    const { BUILT_MARK: B, ACTIVE_MARK: A } = lib;
    const L = makeRoot({ '20261001-000000': [B, A], '20261002-000000': [B], '20261003-000000': [B, A], '20261004-000000': [B] });
    assert.ok(lib.samePath(lib.rollbackTarget(L, path.join(L.releases, '20261004-000000')), path.join(L.releases, '20261003-000000')));
    assert.ok(lib.samePath(lib.rollbackTarget(L, path.join(L.releases, '20261003-000000')), path.join(L.releases, '20261001-000000')));
    assert.equal(lib.rollbackTarget(L, path.join(L.releases, '20261001-000000')), undefined);
  });
});

describe('Bản build', () => {
  it('carryAssets chép file code chính bản đang chạy build ra, bỏ file trùng, tên lạ', () => {
    const prev = path.join(tmp, 'truoc');
    const next = path.join(tmp, 'sau');
    for (const f of ['a-1.js', 'b-1.js', 'c-0.js']) write(path.join(prev, 'frontend', 'dist', 'assets', f), `truoc ${f}`);
    write(path.join(prev, lib.ASSETS_FILE), ['a-1.js', 'b-1.js', '..\\..\\x.js', ''].join('\n'));
    write(path.join(next, 'frontend', 'dist', 'assets', 'b-1.js'), 'sau');
    write(path.join(next, 'frontend', 'dist', 'assets', 'a-2.js'), 'sau');
    assert.equal(lib.carryAssets(prev, next), 1);
    const assets = path.join(next, 'frontend', 'dist', 'assets');
    assert.deepEqual(fs.readdirSync(assets).sort(), ['a-1.js', 'a-2.js', 'b-1.js']);
    assert.equal(fs.readFileSync(path.join(assets, 'b-1.js'), 'utf8'), 'sau');
    assert.deepEqual(fs.readFileSync(path.join(next, lib.ASSETS_FILE), 'utf8').split('\n').sort(), ['a-2.js', 'b-1.js']);
    fs.mkdirSync(path.join(tmp, 'dau-tien'));
    assert.equal(lib.carryAssets(null, path.join(tmp, 'dau-tien')), 0);
  });

  it('migrationFiles, minus: file migration mới so với bản đang chạy', () => {
    const a = path.join(tmp, 'a');
    const b = path.join(tmp, 'b');
    write(path.join(a, 'backend', 'migrations', 'MES_Core', '0001_x.sql'));
    write(path.join(a, 'backend', 'migrations', 'softkeys.json'));
    write(path.join(b, 'backend', 'migrations', 'MES_Core', '0001_x.sql'));
    write(path.join(b, 'backend', 'migrations', 'MES_Hr', '0002_y.SQL'));
    assert.deepEqual(lib.minus(lib.migrationFiles(b), lib.migrationFiles(a)), ['MES_Hr/0002_y.SQL']);
  });

  it('stamp theo giờ máy, sắp xếp được theo chuỗi', () => {
    assert.equal(lib.stamp(new Date(2026, 9, 13, 9, 5, 7)), '20261013-090507');
  });
});
