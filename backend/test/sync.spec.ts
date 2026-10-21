import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'kysely';
import request from 'supertest';
import { render, type Col, type SourceDef } from '../scripts/sync-gen';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { env } from '../src/config/env';
import { CORE_DB, type CoreDb } from '../src/platform/database/database.module';
import { createDb } from '../src/platform/database/db';
import { SYNC_DB } from '../src/platform/sync/sync.db';
import { SyncRepository } from '../src/platform/sync/sync.repository';
import { SyncService } from '../src/platform/sync/sync.service';
import type { SyncDb } from '../src/platform/sync/sync.types';

// Phase 5.2: đồng bộ qua database trung gian vào MES_Sync (quyết định 8.1).
// Cần MES_Sync đã migrate và seed (quyền admin.sync), xem docs/update_docs/09-dong-bo.md. Bài chép dữ liệu thật cần thêm
// DB_TRUNGGIAN_NAME cùng máy SQL Server (bài này kết nối thẳng tới database đó, không qua linked server); các bài về thủ tục
// chép dùng bảng mẫu tự tạo trong MES_Sync, không phụ thuộc BRAVO.
const withStaging = env.db.stagingName && !env.db.stagingServer ? it : it.skip;

describe('Phase 5.2: đồng bộ dữ liệu qua database trung gian', () => {
  let app: INestApplication;
  let syncDb: SyncDb;
  let core: CoreDb;
  let sync: SyncService;
  let admin: string;
  let planner: string;
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function tokenFor(username: string, branchCode: string) {
    const l = await api().post('/api/v1/auth/login').send({ username, password: env.demoPassword });
    const s = await api().post('/api/v1/auth/select-branch').set('Authorization', `Bearer ${l.body.preAuthToken}`).send({ branchCode });
    if (!s.body.accessToken) throw new Error(`Không chọn được ${branchCode} cho ${username}: ${JSON.stringify(s.body)}`);
    return s.body.accessToken as string;
  }
  const sources = async () => (await api().get('/api/v1/admin/sync/sources').set(auth(admin)).expect(200)).body as any[];
  const source = async (code: string) => (await sources()).find((s) => s.code === code);
  const latestRun = async (sourceId: number) => (await api().get(`/api/v1/admin/sync/runs?sourceId=${sourceId}`).set(auth(admin)).expect(200)).body.items[0];
  /** Bấm đồng bộ rồi chờ hàng đợi trong tiến trình test chạy xong */
  async function runAndWait(sourceId: number, full = false) {
    const r = await api().post('/api/v1/admin/sync/start').set(auth(admin)).send({ sourceIds: [sourceId], full }).expect(202);
    expect(r.body.queued).toBe(1);
    await sync.idle();
    return latestRun(sourceId);
  }
  const count = async (table: string, where = sql`1 = 1`) => (await sql<{ n: number }>`SELECT COUNT(*) AS n FROM ${sql.table(table)} WHERE ${where}`.execute(syncDb)).rows[0].n;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    syncDb = app.get<SyncDb>(SYNC_DB);
    core = app.get<CoreDb>(CORE_DB);
    sync = app.get(SyncService);
    if (!(await app.get(SyncRepository).databaseReady())) throw new Error(`Cần database ${env.db.syncName} đã tạo và migrate (docs/update_docs/09-dong-bo.md)`);
    await sync.idle();
    admin = await tokenFor('admin', 'A00');
    planner = await tokenFor('kehoach.a', 'A01');
  });

  afterAll(async () => {
    await sync.idle();
    await app.close();
  });

  it('người không có quyền Đồng bộ dữ liệu không xem và không chạy được', async () => {
    await api().get('/api/v1/admin/sync/sources').set(auth(planner)).expect(403);
    await api().get('/api/v1/admin/sync/runs?sourceId=1').set(auth(planner)).expect(403);
    await api().post('/api/v1/admin/sync/start').set(auth(planner)).send({}).expect(403);
  });

  it('có 18 nguồn BRAVO chia hai nhóm; nguồn không có cột thời gian chép toàn bộ mỗi lần', async () => {
    const bravo = (await sources()).filter((s) => s.system === 'BRAVO');
    expect(bravo.length).toBe(18);
    expect(new Set(bravo.map((s) => s.group))).toEqual(new Set(['CATALOG', 'ORDER']));
    expect(bravo.find((s) => s.code === 'BRAVO.DM_CHINHANH').mode).toBe('FULL');
    expect(bravo.find((s) => s.code === 'BRAVO.DM_SanPhamDonHang').mode).toBe('INCREMENTAL');
  });

  it('mất database MES_Sync sau khi đã chạy được: trả 503 SYNC_NOT_READY, không phải lỗi hệ thống', async () => {
    const repo = app.get(SyncRepository);
    const lost = Object.assign(new Error('Login failed for user'), { code: 'ELOGIN' });
    const list = jest.spyOn(repo, 'listSources').mockRejectedValueOnce(lost);
    const ready = jest.spyOn(repo, 'databaseReady').mockResolvedValueOnce(false);
    try {
      const r = await api().get('/api/v1/admin/sync/sources').set(auth(admin)).expect(503);
      expect(r.body.error.code).toBe('SYNC_NOT_READY');
    } finally {
      list.mockRestore();
      ready.mockRestore();
    }
    await api().get('/api/v1/admin/sync/sources').set(auth(admin)).expect(200);
  });

  it('dữ liệu gửi sai bị từ chối; nguồn không tồn tại trả 404', async () => {
    await api().post('/api/v1/admin/sync/start').set(auth(admin)).send({ sourceIds: ['abc'] }).expect(422);
    await api().post('/api/v1/admin/sync/start').set(auth(admin)).send({ sourceIds: [999999] }).expect(404);
  });

  // ---------- Thủ tục chép trên bảng mẫu (không phụ thuộc BRAVO) ----------
  describe('thủ tục chép sinh từ sync-gen, chạy trên bảng mẫu', () => {
    const stamp: Col[] = [
      { name: 'CreatedAt', type: 'datetime', len: 8, precision: 23, scale: 3, collation: null },
      { name: 'ModifiedAt', type: 'datetime', len: 8, precision: 23, scale: 3, collation: null },
    ];
    const KEY: SourceDef = { view: 'vTestSyncKey', name: 'Bảng mẫu có khóa', group: 'CATALOG', match: 'KEY', columns: ['K'], mode: 'INCREMENTAL' };
    const keyCols: Col[] = [
      { name: 'K', type: 'int', len: 4, precision: 10, scale: 0, collation: null },
      { name: 'Name', type: 'nvarchar', len: 100, precision: 0, scale: 0, collation: 'SQL_Latin1_General_CP1_CI_AS' },
      ...stamp,
    ];
    const PART: SourceDef = { view: 'vTestSyncPart', name: 'Bảng mẫu theo nhóm', group: 'ORDER', match: 'PARTITION', columns: ['P'], mode: 'INCREMENTAL' };
    const partCols: Col[] = [
      { name: 'P', type: 'int', len: 4, precision: 10, scale: 0, collation: null },
      { name: 'C', type: 'varchar', len: 10, precision: 0, scale: 0, collation: 'SQL_Latin1_General_CP1_CI_AS' },
      { name: 'Qty', type: 'int', len: 4, precision: 10, scale: 0, collation: null },
      ...stamp,
    ];
    // Như nguồn OSM: chép toàn bộ mỗi lần, theo nhóm (view có dòng trùng nguyên dòng)
    const FULLP: SourceDef = { view: 'vTestSyncFull', name: 'Bảng mẫu chép toàn bộ theo nhóm', group: 'ORDER', match: 'PARTITION', columns: ['P'], mode: 'FULL' };
    const fullCols: Col[] = [
      { name: 'P', type: 'int', len: 4, precision: 10, scale: 0, collation: null },
      { name: 'C', type: 'nvarchar', len: 20, precision: 0, scale: 0, collation: 'SQL_Latin1_General_CP1_CI_AS' },
    ];
    let keyId: number;
    let partId: number;
    let fullId: number;

    const batches = (text: string) => text.split(/^\s*GO\s*$/gim).map((b) => b.trim()).filter(Boolean);
    async function drop() {
      const ids = (await syncDb.selectFrom('SyncSource').select('Id').where('SystemCode', '=', 'TEST').execute()).map((r) => r.Id);
      if (ids.length) {
        await syncDb.updateTable('SyncSource').set({ LastRunId: null }).where('Id', 'in', ids).execute();
        await syncDb.deleteFrom('SyncRun').where('SyncSourceId', 'in', ids).execute();
        await syncDb.deleteFrom('SyncSource').where('Id', 'in', ids).execute();
      }
      for (const t of ['TestSyncKey', 'TestSyncPart', 'TestSyncFull']) {
        await sql.raw(`IF OBJECT_ID(N'bravo.usp_Sync_${t}', N'P') IS NOT NULL DROP PROCEDURE bravo.usp_Sync_${t}`).execute(syncDb);
        await sql.raw(`IF OBJECT_ID(N'bravo.src_${t}', N'SN') IS NOT NULL DROP SYNONYM bravo.src_${t}`).execute(syncDb);
        await sql.raw(`IF OBJECT_ID(N'bravo.${t}', N'U') IS NOT NULL DROP TABLE bravo.${t}`).execute(syncDb);
        await sql.raw(`IF OBJECT_ID(N'dbo.Src${t}', N'U') IS NOT NULL DROP TABLE dbo.Src${t}`).execute(syncDb);
      }
    }
    /** Ghi bảng nguồn mẫu; ngày truyền dạng chuỗi giờ nguồn để không bị đổi múi giờ */
    const at = (s: string | null) => (s ? sql`CAST(${s} AS DATETIME)` : sql`NULL`);

    beforeAll(async () => {
      await drop();
      await sql.raw(`CREATE TABLE dbo.SrcTestSyncKey (K INT NULL, Name NVARCHAR(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL, CreatedAt DATETIME NULL, ModifiedAt DATETIME NULL)`).execute(syncDb);
      await sql.raw(`CREATE TABLE dbo.SrcTestSyncPart (P INT NULL, C VARCHAR(10) COLLATE SQL_Latin1_General_CP1_CI_AS NULL, Qty INT NULL, CreatedAt DATETIME NULL, ModifiedAt DATETIME NULL)`).execute(syncDb);
      await sql.raw(`CREATE TABLE dbo.SrcTestSyncFull (P INT NULL, C NVARCHAR(10) COLLATE SQL_Latin1_General_CP1_CI_AS NULL)`).execute(syncDb);
      for (const b of [...batches(render(KEY, keyCols, 9001, 'TEST')), ...batches(render(PART, partCols, 9002, 'TEST')), ...batches(render(FULLP, fullCols, 9003, 'TEST'))]) await sql.raw(b).execute(syncDb);
      await sql.raw('CREATE SYNONYM bravo.src_TestSyncKey FOR dbo.SrcTestSyncKey').execute(syncDb);
      await sql.raw('CREATE SYNONYM bravo.src_TestSyncPart FOR dbo.SrcTestSyncPart').execute(syncDb);
      await sql.raw('CREATE SYNONYM bravo.src_TestSyncFull FOR dbo.SrcTestSyncFull').execute(syncDb);
      keyId = (await source('TEST.TestSyncKey')).id;
      partId = (await source('TEST.TestSyncPart')).id;
      fullId = (await source('TEST.TestSyncFull')).id;
    });

    afterAll(async () => {
      await sync.idle();
      await drop();
    });

    it('KEY: chép tăng dần thấy đổi chữ hoa/thường, dòng bị xóa bên nguồn, dòng không có ngày tháng', async () => {
      for (const [k, name] of [[1, 'a'], [2, 'b'], [3, 'c']] as const) {
        await sql`INSERT INTO dbo.SrcTestSyncKey VALUES (${k}, ${name}, ${at('2026-01-01T10:00:00')}, ${at('2026-01-01T10:00:00')})`.execute(syncDb);
      }
      const full = await runAndWait(keyId, true);
      expect(full).toMatchObject({ status: 'SUCCEEDED', mode: 'FULL', insertedCount: 3, targetCount: 3, newWatermarkAt: '2026-01-01T10:00:00' });

      await sql`UPDATE dbo.SrcTestSyncKey SET Name = N'B', ModifiedAt = ${at('2026-01-02T08:00:00')} WHERE K = 2`.execute(syncDb);
      await sql`DELETE FROM dbo.SrcTestSyncKey WHERE K = 3`.execute(syncDb);
      await sql`INSERT INTO dbo.SrcTestSyncKey VALUES (4, N'd', NULL, NULL)`.execute(syncDb);
      const inc = await runAndWait(keyId);
      expect(inc).toMatchObject({ status: 'SUCCEEDED', mode: 'INCREMENTAL', sinceAt: '2026-01-01T09:50:00', updatedCount: 1, insertedCount: 1, deletedCount: 1, newWatermarkAt: '2026-01-02T08:00:00' });
      const rows = (await sql<{ K: number; Name: string }>`SELECT K, Name FROM bravo.TestSyncKey ORDER BY K`.execute(syncDb)).rows;
      expect(rows).toEqual([{ K: 1, Name: 'a' }, { K: 2, Name: 'B' }, { K: 4, Name: 'd' }]);

      // Chạy lại không có gì đổi: không ghi dòng nào
      const again = await runAndWait(keyId);
      expect(again).toMatchObject({ status: 'SUCCEEDED', updatedCount: 0, insertedCount: 0, deletedCount: 0 });
    });

    it('KEY: lỗi giữa transaction thì không ghi gì, giữ mốc, nhả khóa để lần sau chạy được', async () => {
      const before = await source('TEST.TestSyncKey');
      const rowsBefore = await count('bravo.TestSyncKey');
      await sql.raw(`CREATE TRIGGER bravo.trg_TestSyncKey_Fail ON bravo.TestSyncKey AFTER INSERT, UPDATE AS THROW 50099, N'Lỗi thử giữa transaction', 1;`).execute(syncDb);
      try {
        await sql`INSERT INTO dbo.SrcTestSyncKey VALUES (5, N'e', ${at('2026-01-05T08:00:00')}, ${at('2026-01-05T08:00:00')})`.execute(syncDb);
        const failed = await runAndWait(keyId);
        expect(failed.status).toBe('FAILED');
        expect(failed.errorMessage).toMatch(/Lỗi thử giữa transaction \[lỗi 50099/);
        expect(await count('bravo.TestSyncKey')).toBe(rowsBefore);
        expect((await source('TEST.TestSyncKey')).watermarkAt).toBe(before.watermarkAt);
      } finally {
        await sql.raw('DROP TRIGGER bravo.trg_TestSyncKey_Fail').execute(syncDb);
      }
      const ok = await runAndWait(keyId);
      expect(ok).toMatchObject({ status: 'SUCCEEDED', insertedCount: 1, newWatermarkAt: '2026-01-05T08:00:00' });
    });

    it('KEY: view trả khóa NULL ở bước đối soát thì dừng, không xóa dòng nào', async () => {
      const before = await count('bravo.TestSyncKey');
      await sql`INSERT INTO dbo.SrcTestSyncKey VALUES (NULL, N'không khóa', ${at('2025-01-01T00:00:00')}, ${at('2025-01-01T00:00:00')})`.execute(syncDb);
      try {
        const run = await runAndWait(keyId);
        expect(run.status).toBe('FAILED');
        expect(run.errorMessage).toMatch(/thiếu khóa \(K\)/);
        expect(await count('bravo.TestSyncKey')).toBe(before);
      } finally {
        await sql`DELETE FROM dbo.SrcTestSyncKey WHERE K IS NULL`.execute(syncDb);
      }
    });

    it('KEY: chép tăng dần định xóa quá 20% bảng chép thì dừng; Chép lại toàn bộ thì xóa được', async () => {
      // 150 dòng ngày cũ: lần tăng dần đọc thêm nhờ đối soát (bảng chép chưa có)
      await sql.raw(`INSERT INTO dbo.SrcTestSyncKey (K, Name, CreatedAt, ModifiedAt)
        SELECT 1000 + n, N'loạt', '2025-01-01', '2025-01-01' FROM (SELECT TOP 150 ROW_NUMBER() OVER (ORDER BY (SELECT 1)) - 1 AS n FROM sys.all_objects) x`).execute(syncDb);
      const added = await runAndWait(keyId);
      expect(added).toMatchObject({ status: 'SUCCEEDED', insertedCount: 150 });
      const total = await count('bravo.TestSyncKey');

      await sql`DELETE FROM dbo.SrcTestSyncKey WHERE K >= 1000`.execute(syncDb);
      const blocked = await runAndWait(keyId);
      expect(blocked.status).toBe('FAILED');
      expect(blocked.errorMessage).toMatch(new RegExp(`xóa 150/${total} dòng`));
      expect(await count('bravo.TestSyncKey')).toBe(total);

      const full = await runAndWait(keyId, true);
      expect(full).toMatchObject({ status: 'SUCCEEDED', mode: 'FULL', deletedCount: 150 });
      expect(await count('bravo.TestSyncKey')).toBe(total - 150);
    });

    it('PARTITION: dòng đổi sang nhóm khác, nhóm bị xóa (kể cả nhóm có khóa NULL) đều phản ánh khi chép tăng dần', async () => {
      // Nhóm 1 và nhóm NULL có ngày cũ, nằm ngoài khoảng lùi 10 phút của mốc: chỉ bước đối soát số dòng mới thấy chúng đổi
      const seed: [number | null, string, number, string][] = [[1, 'a', 1, '2025-12-01T10:00:00'], [1, 'b', 2, '2025-12-01T10:00:00'], [2, 'a', 5, '2026-01-01T10:00:00'], [null, 'x', 9, '2025-12-01T10:00:00']];
      for (const [p, c, qty, d] of seed) {
        await sql`INSERT INTO dbo.SrcTestSyncPart VALUES (${p}, ${c}, ${qty}, ${at(d)}, ${at(d)})`.execute(syncDb);
      }
      const full = await runAndWait(partId, true);
      expect(full).toMatchObject({ status: 'SUCCEEDED', mode: 'FULL', readCount: 4, targetCount: 4 });

      // Dòng (1, b) chuyển sang nhóm 2; nhóm NULL bị xóa hẳn mà không dòng nào khác đổi ngày
      await sql`UPDATE dbo.SrcTestSyncPart SET P = 2, ModifiedAt = ${at('2026-01-03T09:00:00')} WHERE P = 1 AND C = 'b'`.execute(syncDb);
      await sql`DELETE FROM dbo.SrcTestSyncPart WHERE P IS NULL`.execute(syncDb);
      const inc = await runAndWait(partId);
      expect(inc).toMatchObject({ status: 'SUCCEEDED', mode: 'INCREMENTAL', targetCount: 3, newWatermarkAt: '2026-01-03T09:00:00' });
      const rows = (await sql<{ P: number | null; C: string; Qty: number }>`SELECT P, C, Qty FROM bravo.TestSyncPart ORDER BY P, C`.execute(syncDb)).rows;
      expect(rows).toEqual([{ P: 1, C: 'a', Qty: 1 }, { P: 2, C: 'a', Qty: 5 }, { P: 2, C: 'b', Qty: 2 }]);
    });

    it('PARTITION chép toàn bộ (như nguồn OSM): dòng trùng nguyên dòng vẫn chép đủ; nguồn bớt dòng thì bảng chép bớt; nguồn trả 0 dòng thì dừng, giữ dữ liệu', async () => {
      for (const [p, c] of [[1, 'ạ'], [1, 'ạ'], [2, 'b']] as const) await sql`INSERT INTO dbo.SrcTestSyncFull VALUES (${p}, ${c})`.execute(syncDb);
      expect(await runAndWait(fullId)).toMatchObject({ status: 'SUCCEEDED', mode: 'FULL', readCount: 3, targetCount: 3 });
      expect((await sql<{ C: string }>`SELECT TOP 1 C FROM bravo.TestSyncFull WHERE P = 1`.execute(syncDb)).rows[0].C).toBe('ạ');
      await sql`DELETE FROM dbo.SrcTestSyncFull WHERE P = 2`.execute(syncDb);
      expect(await runAndWait(fullId)).toMatchObject({ status: 'SUCCEEDED', mode: 'FULL', targetCount: 2 });
      await sql`DELETE FROM dbo.SrcTestSyncFull`.execute(syncDb);
      const empty = await runAndWait(fullId);
      expect(empty).toMatchObject({ status: 'FAILED' });
      expect(empty.errorMessage).toMatch(/0 dòng/);
      expect(await count('bravo.TestSyncFull')).toBe(2);
    });

    it('việc sau đồng bộ (onQueueDrained, ví dụ nạp đơn hàng) chạy một lần khi hàng đợi chạy hết, chỉ khi nguồn liên quan chép thành công', async () => {
      let calls = 0;
      sync.onQueueDrained(['TEST.TestSyncKey'], async () => {
        calls++;
      });
      await runAndWait(keyId);
      expect(calls).toBe(1);
      // Nguồn không liên quan: không chạy
      await runAndWait(partId);
      expect(calls).toBe(1);
      // Hai nguồn trong một lần bấm: một lần, sau khi cả hai đã chép
      const r = await api().post('/api/v1/admin/sync/start').set(auth(admin)).send({ sourceIds: [keyId, partId] }).expect(202);
      expect(r.body.queued).toBe(2);
      await sync.idle();
      expect(calls).toBe(2);
      // Nguồn liên quan chép lỗi: không chạy
      await sql.raw(`CREATE TRIGGER bravo.trg_TestSyncKey_Fail2 ON bravo.TestSyncKey AFTER INSERT, UPDATE, DELETE AS THROW 50099, N'Lỗi thử', 1;`).execute(syncDb);
      try {
        await sql`UPDATE dbo.SrcTestSyncKey SET Name = N'lỗi', ModifiedAt = ${at('2026-02-01T08:00:00')} WHERE K = 1`.execute(syncDb);
        expect(await runAndWait(keyId)).toMatchObject({ status: 'FAILED' });
        expect(calls).toBe(2);
      } finally {
        await sql.raw('DROP TRIGGER bravo.trg_TestSyncKey_Fail2').execute(syncDb);
      }
    });

    it('việc sau đồng bộ lỗi thì giữ cờ chờ: đợt đồng bộ sau (kể cả chỉ chép nguồn khác) chạy lại', async () => {
      const work = jest.fn().mockRejectedValueOnce(new Error('Lỗi thử của việc sau đồng bộ')).mockResolvedValue(undefined);
      sync.onQueueDrained(['TEST.TestSyncKey'], work);
      expect(await runAndWait(keyId)).toMatchObject({ status: 'SUCCEEDED' });
      expect(work).toHaveBeenCalledTimes(1);
      await runAndWait(partId);
      expect(work).toHaveBeenCalledTimes(2);
      // Đã chạy được thì hết chờ
      await runAndWait(partId);
      expect(work).toHaveBeenCalledTimes(2);
    });
  });

  // ---------- Dữ liệu thật của database trung gian ----------
  withStaging('chép toàn bộ rồi chép tăng dần: số dòng khớp view, lần sau lấy từ mốc lùi 10 phút, dòng giống hệt không ghi lại', async () => {
    const src = await source('BRAVO.DM_MuaKinhDoanh');
    const staging = createDb<any>(env.db.stagingName);
    try {
      // Mốc tính giống thủ tục: ép về DATETIME2(0) (làm tròn tới giây) rồi lấy lớn nhất
      const view = (
        await sql<{ n: number; mx: Date }>`SELECT (SELECT COUNT(*) FROM dbo.vDM_MuaKinhDoanh) AS n, MAX(x.v) AS mx FROM dbo.vDM_MuaKinhDoanh
          CROSS APPLY (VALUES (CAST(ModifiedAt AS DATETIME2(0))), (CAST(CreatedAt AS DATETIME2(0)))) x(v)`.execute(staging)
      ).rows[0];

      const full = await runAndWait(src.id, true);
      expect(full).toMatchObject({ status: 'SUCCEEDED', mode: 'FULL', sinceAt: null, readCount: view.n, targetCount: view.n });
      expect(await count('bravo.DM_MuaKinhDoanh')).toBe(view.n);
      const after = await source('BRAVO.DM_MuaKinhDoanh');
      expect(after.watermarkAt).toBe(view.mx.toISOString().slice(0, 19));

      const inc = await runAndWait(src.id);
      expect(inc.status).toBe('SUCCEEDED');
      expect(inc.mode).toBe('INCREMENTAL');
      expect(new Date(`${inc.sinceAt}Z`).getTime()).toBe(new Date(`${after.watermarkAt}Z`).getTime() - 10 * 60_000);
      expect(inc).toMatchObject({ insertedCount: 0, updatedCount: 0, deletedCount: 0 });
    } finally {
      await staging.destroy();
    }
  });

  withStaging('chép toàn bộ sửa lại dòng bị lệch và xóa dòng không còn bên nguồn', async () => {
    const src = await source('BRAVO.DM_MuaKinhDoanh');
    await runAndWait(src.id, true);
    const first = (await sql<{ SalesSeasonId: number; Name: string }>`SELECT TOP 1 SalesSeasonId, Name FROM bravo.DM_MuaKinhDoanh ORDER BY SalesSeasonId`.execute(syncDb)).rows[0];
    try {
      await sql`UPDATE bravo.DM_MuaKinhDoanh SET Name = N'lệch' WHERE SalesSeasonId = ${first.SalesSeasonId}`.execute(syncDb);
      await sql`INSERT INTO bravo.DM_MuaKinhDoanh (SalesSeasonId, Code, Name, SyncedAt) VALUES (-1, 'X', N'không có bên nguồn', SYSUTCDATETIME())`.execute(syncDb);
      const run = await runAndWait(src.id, true);
      expect(run).toMatchObject({ status: 'SUCCEEDED', updatedCount: 1, deletedCount: 1, insertedCount: 0 });
      const fixed = (await sql<{ Name: string }>`SELECT Name FROM bravo.DM_MuaKinhDoanh WHERE SalesSeasonId = ${first.SalesSeasonId}`.execute(syncDb)).rows[0];
      expect(fixed.Name).toBe(first.Name);
      expect(await count('bravo.DM_MuaKinhDoanh', sql`SalesSeasonId = -1`)).toBe(0);
    } finally {
      // Lỗi giữa chừng thì vẫn trả bảng chép về đúng nguồn
      await sql`DELETE FROM bravo.DM_MuaKinhDoanh WHERE SalesSeasonId = -1`.execute(syncDb);
      await runAndWait(src.id, true);
    }
  });

  it('lần chạy lỗi ghi rõ lý do và giữ nguyên mốc', async () => {
    const src = await source('BRAVO.DM_MauSac');
    const before = await syncDb.selectFrom('SyncSource').select(['ProcName', 'WatermarkAt', 'LastRunId']).where('Id', '=', src.id).executeTakeFirstOrThrow();
    let failedId: number | null = null;
    // Mốc biết trước, để "giữ nguyên" không đúng một cách tình cờ (NULL = NULL)
    await sql`UPDATE dbo.SyncSource SET ProcName = N'bravo.usp_Sync_KhongCo', WatermarkAt = CAST(${'2026-02-03T04:05:06'} AS DATETIME2(0)) WHERE Id = ${src.id}`.execute(syncDb);
    try {
      const run = await runAndWait(src.id);
      failedId = run.id;
      expect(run.status).toBe('FAILED');
      expect(run.errorMessage).toMatch(/Không tìm thấy thủ tục/);
      expect((await source('BRAVO.DM_MauSac')).watermarkAt).toBe('2026-02-03T04:05:06');
    } finally {
      // Trả nguồn về như trước, bỏ lần chạy lỗi giả để màn hình không hiện lỗi của test
      await syncDb.updateTable('SyncSource').set({ ProcName: before.ProcName, WatermarkAt: before.WatermarkAt, LastRunId: before.LastRunId }).where('Id', '=', src.id).execute();
      if (failedId) await syncDb.deleteFrom('SyncRun').where('Id', '=', String(failedId)).execute();
    }
  });

  it('nguồn đang chờ thì lần bấm sau bỏ qua nguồn đó, không chép chồng', async () => {
    const src = await source('BRAVO.DM_Size');
    const pending = await syncDb
      .insertInto('SyncRun')
      .values({ SyncSourceId: src.id, BatchId: '00000000-0000-0000-0000-000000000001', ModeCode: 'INCREMENTAL', StatusCode: 'QUEUED' })
      .output('inserted.Id')
      .executeTakeFirstOrThrow();
    try {
      // Lần chờ giả được xếp trước khi bấm nên lần bấm bị bỏ qua; sau đó hàng đợi chạy luôn lần giả này, chờ xong rồi xóa
      const r = await api().post('/api/v1/admin/sync/start').set(auth(admin)).send({ sourceIds: [src.id] }).expect(202);
      expect(r.body).toMatchObject({ queued: 0, skipped: [src.name] });
      // Bấm mà mọi nguồn bị bỏ qua vẫn quét hàng đợi: lần chờ không nằm im "Đang chờ"
      await sync.idle();
      const after = await syncDb.selectFrom('SyncRun').select('StatusCode').where('Id', '=', pending.Id).executeTakeFirstOrThrow();
      expect(['SUCCEEDED', 'FAILED']).toContain(after.StatusCode);
    } finally {
      await sync.idle();
      await syncDb.deleteFrom('SyncRun').where('Id', '=', pending.Id).execute();
    }
  });

  it('lần "đang chạy" mồ côi (tiến trình đã dừng, không ai giữ khóa) được đánh dấu lỗi khi bấm đồng bộ', async () => {
    const src = await source('BRAVO.DM_PhuongThucGiaoHang');
    const ghost = await syncDb
      .insertInto('SyncRun')
      .values({ SyncSourceId: src.id, BatchId: '00000000-0000-0000-0000-000000000002', ModeCode: 'INCREMENTAL', StatusCode: 'RUNNING' })
      .output('inserted.Id')
      .executeTakeFirstOrThrow();
    try {
      // Bấm đồng bộ một nguồn khác: trước khi xếp hàng, máy chủ dọn các lần mồ côi
      const other = await source('BRAVO.DM_CHINHANH');
      await api().post('/api/v1/admin/sync/start').set(auth(admin)).send({ sourceIds: [other.id] }).expect(202);
      await sync.idle();
      const row = await syncDb.selectFrom('SyncRun').select(['StatusCode', 'ErrorMessage']).where('Id', '=', ghost.Id).executeTakeFirstOrThrow();
      expect(row.StatusCode).toBe('FAILED');
      expect(row.ErrorMessage).toMatch(/bị ngắt giữa chừng/);
    } finally {
      await syncDb.deleteFrom('SyncRun').where('Id', '=', ghost.Id).execute();
    }
  });

  it('mỗi lần bấm ghi nhật ký hệ thống', async () => {
    const src = await source('BRAVO.DM_CHINHANH');
    const r = await api().post('/api/v1/admin/sync/start').set(auth(admin)).send({ sourceIds: [src.id] }).expect(202);
    await sync.idle();
    const log = await core.selectFrom('SysAuditLog').select(['ActionCode', 'NewValue']).where('EntityType', '=', 'SyncRun').where('EntityId', '=', r.body.batchId).executeTakeFirst();
    expect(log?.ActionCode).toBe('SYNC_START');
    expect(JSON.parse(log!.NewValue!).queued).toEqual(['BRAVO.DM_CHINHANH']);
  });
});
