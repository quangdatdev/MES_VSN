import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'kysely';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { env } from '../src/config/env';
import { CatalogLookupService } from '../src/platform/catalog/catalog-lookup.service';
import { CORE_DB, type CoreDb } from '../src/platform/database/database.module';
import { SYNC_DB } from '../src/platform/sync/sync.db';
import { SyncRepository } from '../src/platform/sync/sync.repository';
import type { SyncDb } from '../src/platform/sync/sync.types';

// Màn Quản trị đơn hàng › Phân bổ PO (task 5.9.12), chạy trên database thật đã migrate (MES_Sync/0007) và seed. Dòng thử ghi
// thẳng vào bảng chép osm.OSMData với Brand riêng của bài test; nhà máy thử thêm vào danh mục Nhà máy SX; dọn sạch khi xong.
const TAG = `TSTPO${process.pid % 100000}`;
const FTY = `${TAG}-FTY`;
const FTY_FREE = `${TAG}-FREE`;
const d = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);
const line = (po: string, so: string | null, styleNo: string, color: string, etdRevised: string | null, fty: string | null, season = 'SS26') => ({
  Brand: TAG,
  Season: season,
  PO: po,
  SO: so,
  'Ship mode': 'SEA',
  StyleName: `Áo ${styleNo}`,
  StyleNo: styleNo,
  Color: color,
  'ETD-Actual': d('2026-10-01'),
  'ETD-REVISED': d(etdRevised),
  FtyName: fty,
  SyncedAt: new Date(),
  SyncRunId: null,
});

describe('Phân bổ PO (OSM)', () => {
  let app: INestApplication;
  let syncDb: SyncDb;
  let core: CoreDb;
  let planner: string;
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const list = async (params: Record<string, string> = {}) =>
    (await api().get('/api/v1/order/po-allocations').query({ customer: TAG, ...params }).set(auth(planner)).expect(200)).body as { items: any[]; total: number; syncedAt: string | null };
  const pos = (body: { items: any[] }) => body.items.map((r) => r.po);

  async function tokenFor(username: string, branchCode: string) {
    const l = await api().post('/api/v1/auth/login').send({ username, password: env.demoPassword });
    const s = await api().post('/api/v1/auth/select-branch').set('Authorization', `Bearer ${l.body.preAuthToken}`).send({ branchCode });
    if (!s.body.accessToken) throw new Error(`Không chọn được ${branchCode} cho ${username}: ${JSON.stringify(s.body)}`);
    return s.body.accessToken as string;
  }

  async function cleanup() {
    await sql`DELETE FROM osm.[OSMData] WHERE Brand LIKE 'TSTPO%'`.execute(syncDb);
    await core.deleteFrom('SysProductionFactory').where('Code', 'like', 'TSTPO%').execute();
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    syncDb = app.get<SyncDb>(SYNC_DB);
    core = app.get<CoreDb>(CORE_DB);
    if (!(await app.get(SyncRepository).databaseReady())) throw new Error(`Cần database ${env.db.syncName} đã tạo và migrate`);
    const table = await sql<{ id: number | null }>`SELECT OBJECT_ID(N'osm.OSMData', N'U') AS id`.execute(syncDb);
    if (table.rows[0]?.id == null) throw new Error(`${env.db.syncName} chưa có osm.OSMData: chạy npm run migrate (MES_Sync/0007)`);
    await cleanup();
    await core.insertInto('SysProductionFactory').values([
      { Code: FTY, Name: 'Nhà máy thử phân bổ PO', BranchCode: 'A01', SortOrder: 9990, IsActive: true, IsSystem: false },
      { Code: FTY_FREE, Name: 'Nhà máy thử chưa gắn ĐVCS', BranchCode: null, SortOrder: 9991, IsActive: true, IsSystem: false },
    ]).execute();
    app.get(CatalogLookupService).invalidateFactories();
    const rows = [
      line('P1', 'S1', 'ST-A', 'Navy', '2026-11-01', FTY),
      // Dòng trùng nguyên dòng như view OSM: chỉ tính một lần
      line('P1', 'S1', 'ST-A', 'Navy', '2026-11-01', FTY),
      line('P2', 'S2', 'ST-B', 'Red', '2026-12-01', FTY_FREE),
      line('P3', null, 'ST-C', 'Black', null, null, 'FW26'),
      // Tên nhà máy khác hoa thường, có khoảng trắng cuối: vẫn ra ĐVCS (so theo collation như danh mục)
      line('P4', 'S4', 'ST-D', 'White', '2026-10-15', `${FTY.toLowerCase()}  `),
    ];
    await syncDb.insertInto('osm.OSMData' as never).values(rows as never).execute();
    planner = await tokenFor('kehoach.a', 'A01');
  });

  afterAll(async () => {
    if (syncDb) await cleanup();
    await app?.close();
  });

  it('không có quyền xem thì 403; có quyền thì thấy dữ liệu dùng chung, dòng trùng tính một lần, ETD-Revised mới lên trước', async () => {
    const leader = await tokenFor('truongchuyen.a', 'A01');
    await api().get('/api/v1/order/po-allocations').set(auth(leader)).expect(403);
    const body = await list();
    expect(body.total).toBe(4);
    expect(pos(body)).toEqual(['P2', 'P1', 'P4', 'P3']);
    expect(body.items.map((r) => r.rowNo)).toEqual([1, 2, 3, 4]);
    expect(body.items[1]).toMatchObject({ brand: TAG, season: 'SS26', so: 'S1', shipMode: 'SEA', styleName: 'Áo ST-A', styleNo: 'ST-A', color: 'Navy', etdActual: '2026-10-01', etdRevised: '2026-11-01', factoryName: FTY, branchCode: 'A01' });
    // Đơn vị cơ sở theo danh mục Nhà máy SX: nhà máy chưa gắn ĐVCS, dòng không có nhà máy thì trống
    expect(body.items.map((r) => r.branchCode)).toEqual([null, 'A01', 'A01', null]);
    expect(body.syncedAt).toBeTruthy();
  });

  it('dải lọc: Season, mã hàng, PO hoặc SO; sắp xếp theo cột', async () => {
    expect(pos(await list({ season: 'FW26' }))).toEqual(['P3']);
    expect(pos(await list({ style: 'st-b' }))).toEqual(['P2']);
    expect(pos(await list({ q: 'S4' }))).toEqual(['P4']);
    expect(pos(await list({ q: 'P3' }))).toEqual(['P3']);
    expect(pos(await list({ sort: 'po:asc' }))).toEqual(['P1', 'P2', 'P3', 'P4']);
  });

  it('lọc theo cột, kể cả Đơn vị cơ sở (trống, loại trừ) và ngày', async () => {
    const cf = (v: unknown) => ({ cf: JSON.stringify(v) });
    expect(pos(await list(cf({ branchCode: { in: ['A01'] } })))).toEqual(['P1', 'P4']);
    expect(pos(await list(cf({ branchCode: { in: [null] } })))).toEqual(['P2', 'P3']);
    expect(pos(await list(cf({ branchCode: { notIn: ['A01'] } })))).toEqual(['P2', 'P3']);
    expect(pos(await list(cf({ etdRevised: { in: ['2026-12-01', null] } })))).toEqual(['P2', 'P3']);
    expect(pos(await list(cf({ color: { notIn: ['Navy'] }, so: { in: [null] } })))).toEqual(['P3']);
    await api().get('/api/v1/order/po-allocations').query(cf({ SyncRowId: { in: [1] } })).set(auth(planner)).expect(422);
  });

  it('giá trị cho popup lọc theo các bộ lọc khác, không theo chính cột đó', async () => {
    const values = async (field: string, params: Record<string, string> = {}) =>
      (await api().get('/api/v1/order/po-allocations/values').query({ customer: TAG, field, ...params }).set(auth(planner)).expect(200)).body;
    expect(await values('branchCode', { cf: JSON.stringify({ branchCode: { in: ['A01'] } }) })).toEqual({ values: ['A01', null], truncated: false });
    expect((await values('etdRevised')).values).toEqual(['2026-12-01', '2026-11-01', '2026-10-15', null]);
    expect((await values('po', { search: 'p2' })).values).toEqual(['P2']);
  });

  it('chính sách cột thật: Nhà máy SX bị Che cho vai trò Kế hoạch thì ĐVCS cũng bị che, không lọc, hỏi giá trị theo ĐVCS được', async () => {
    const admin = await tokenFor('admin', 'A01');
    const role = await core.selectFrom('SysRole').select('Id').where('Code', '=', 'PLANNER').executeTakeFirstOrThrow();
    const resource = await core.selectFrom('SysResource').select('Id').where('Code', '=', 'order.poallocation').executeTakeFirstOrThrow();
    const setPolicy = (level: string | null) =>
      api().put(`/api/v1/admin/roles/${role.Id}/field-policies`).set(auth(admin)).send({ resourceId: resource.Id, policies: [{ fieldCode: 'factoryName', accessLevel: level }] }).expect(200);
    await setPolicy('MASKED');
    try {
      const body = await list({ sort: 'po:asc', cf: JSON.stringify({ branchCode: { in: ['A01'] } }) });
      // Bộ lọc ĐVCS bị bỏ: đủ 4 dòng; ĐVCS có giá trị thì che, trống thì vẫn trống
      expect(pos(body)).toEqual(['P1', 'P2', 'P3', 'P4']);
      expect(body.items.map((r) => [r.factoryName, r.branchCode])).toEqual([
        ['***', '***'],
        ['***', null],
        [null, null],
        ['***', '***'],
      ]);
      await api().get('/api/v1/order/po-allocations/values').query({ customer: TAG, field: 'branchCode' }).set(auth(planner)).expect(403);
    } finally {
      await setPolicy(null);
    }
    expect((await list({ sort: 'po:asc' })).items[0].branchCode).toBe('A01');
  });

  it('gợi ý Brand, Season; xuất file có tên Đơn vị cơ sở', async () => {
    const options = (await api().get('/api/v1/order/po-allocations/options').set(auth(planner)).expect(200)).body;
    expect(options.brands).toContain(TAG);
    expect(options.seasons).toEqual(expect.arrayContaining(['SS26', 'FW26']));
    const res = await api().get('/api/v1/order/po-allocations/export').query({ customer: TAG, sort: 'po:asc' }).set(auth(planner)).buffer(true).parse((r, cb) => {
      let text = '';
      r.on('data', (c: Buffer) => (text += c.toString('utf8')));
      r.on('end', () => cb(null, text));
    }).expect(200);
    const lines = (res.body as string).replace(/^\uFEFF/, '').split('\r\n');
    expect(lines[0]).toBe('Brand,Season,PO,SO,Ship mode,Style name,Style No,Màu,ETD-Actual,ETD-Revised,Nhà máy SX,Đơn vị cơ sở');
    expect(lines).toHaveLength(5);
    expect(lines[1].startsWith(`${TAG},SS26,P1,S1,SEA,Áo ST-A,ST-A,Navy,2026-10-01,2026-11-01,${FTY},`)).toBe(true);
    expect(lines[1].endsWith(',')).toBe(false);
  });
});
