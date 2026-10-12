import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'kysely';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { env } from '../src/config/env';
import { ORDER_DB } from '../src/modules/order/order.db';
import type { OrderDb } from '../src/modules/order/order.types';
import { PoAllocationRefreshService } from '../src/modules/order/po-allocation-refresh.service';
import { CatalogLookupService } from '../src/platform/catalog/catalog-lookup.service';
import { CORE_DB, type CoreDb } from '../src/platform/database/database.module';
import { SYNC_DB } from '../src/platform/sync/sync.db';
import { SyncRepository } from '../src/platform/sync/sync.repository';
import type { SyncDb } from '../src/platform/sync/sync.types';

// Màn Quản trị đơn hàng › Phân bổ PO (task 5.9.12, Phase 5.10), chạy trên database thật đã migrate (MES_Sync/0007, MES_Order/0009)
// và seed. Dòng thử ghi thẳng vào bảng chép osm.OSMData với Brand riêng của bài test, rồi chạy bước làm mới (chỉ Brand đó) để chép
// sang MES_Order.PoAllocation; nhà máy thử thêm vào danh mục Nhà máy SX; dọn sạch khi xong.
const TAG = `TSTPO${process.pid % 100000}`;
const FTY = `${TAG}-FTY`;
const FTY_FREE = `${TAG}-FREE`;
const P = (n: number) => `${TAG}-P${n}`;
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
  let orderDb: OrderDb;
  let core: CoreDb;
  let planner: string;
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const list = async (params: Record<string, string> = {}) =>
    (await api().get('/api/v1/order/po-allocations').query({ customer: TAG, ...params }).set(auth(planner)).expect(200)).body as { items: any[]; total: number; syncedAt: string | null; sourceActive: boolean };
  /** Số PO bỏ tiền tố của bài test */
  const pos = (body: { items: any[] }) => body.items.map((r) => String(r.po).replace(`${TAG}-`, ''));

  async function tokenFor(username: string, branchCode: string) {
    const l = await api().post('/api/v1/auth/login').send({ username, password: env.demoPassword });
    const s = await api().post('/api/v1/auth/select-branch').set('Authorization', `Bearer ${l.body.preAuthToken}`).send({ branchCode });
    if (!s.body.accessToken) throw new Error(`Không chọn được ${branchCode} cho ${username}: ${JSON.stringify(s.body)}`);
    return s.body.accessToken as string;
  }

  async function cleanup() {
    await sql`DELETE FROM osm.[OSMData] WHERE Brand LIKE 'TSTPO%'`.execute(syncDb);
    await orderDb.deleteFrom('PoAllocation').where('Brand', 'like', 'TSTPO%').execute();
    await core.deleteFrom('SysProductionFactory').where('Code', 'like', 'TSTPO%').execute();
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    syncDb = app.get<SyncDb>(SYNC_DB);
    orderDb = app.get<OrderDb>(ORDER_DB);
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
      line(P(1), 'S1', 'ST-A', 'Navy', '2026-11-01', FTY),
      // Dòng trùng nguyên dòng như view OSM: chỉ tính một lần
      line(P(1), 'S1', 'ST-A', 'Navy', '2026-11-01', FTY),
      line(P(2), 'S2', 'ST-B', 'Red', '2026-12-01', FTY_FREE),
      line(P(3), null, 'ST-C', 'Black', null, null, 'FW26'),
      // Tên nhà máy khác hoa thường, có khoảng trắng cuối: vẫn ra ĐVCS (so theo collation như danh mục)
      line(P(4), 'S4', 'ST-D', 'White', '2026-10-15', `${FTY.toLowerCase()}  `),
    ];
    await syncDb.insertInto('osm.OSMData' as never).values(rows as never).execute();
    const refreshed = await app.get(PoAllocationRefreshService).refresh({ brand: TAG });
    expect(refreshed).toMatchObject({ skipped: null, source: 4, inserted: 4, total: 4 });
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
    expect(body.items[1]).toMatchObject({
      brand: TAG,
      season: 'SS26',
      po: P(1),
      so: 'S1',
      shipMode: 'SEA',
      styleName: 'Áo ST-A',
      styleNo: 'ST-A',
      color: 'Navy',
      etdActual: '2026-10-01',
      etdRevised: '2026-11-01',
      factoryName: FTY,
      branchCode: 'A01',
      // Phase 5.10: khóa dòng ổn định, nhà máy theo OSM, chưa nhập tay
      osmFactoryName: FTY,
      isFactoryManual: false,
      isInOsm: true,
    });
    expect(typeof body.items[1].id).toBe('number');
    expect(new Set(body.items.map((r) => r.id)).size).toBe(4);
    // Đơn vị cơ sở theo danh mục Nhà máy SX: nhà máy chưa gắn ĐVCS, dòng không có nhà máy thì trống
    expect(body.items.map((r) => r.branchCode)).toEqual([null, 'A01', 'A01', null]);
    expect(body.syncedAt).toBeTruthy();
    expect(body.sourceActive).toBe(true);
  });

  it('làm mới lần nữa với dữ liệu không đổi thì giữ nguyên Id của dòng', async () => {
    const before = (await list({ sort: 'po:asc' })).items.map((r) => r.id);
    expect(await app.get(PoAllocationRefreshService).refresh({ brand: TAG })).toMatchObject({ skipped: null, inserted: 0, removed: 0 });
    expect((await list({ sort: 'po:asc' })).items.map((r) => r.id)).toEqual(before);
  });

  it('dải lọc: Season, mã hàng, PO hoặc SO; sắp xếp theo cột', async () => {
    expect(pos(await list({ season: 'FW26' }))).toEqual(['P3']);
    expect(pos(await list({ style: 'st-b' }))).toEqual(['P2']);
    expect(pos(await list({ q: 'S4' }))).toEqual(['P4']);
    expect(pos(await list({ q: 'P3' }))).toEqual(['P3']);
    expect(pos(await list({ sort: 'po:asc' }))).toEqual(['P1', 'P2', 'P3', 'P4']);
    // ĐVCS (cột tính) sắp xếp được: trống lên trước khi tăng dần như SQL Server
    expect(pos(await list({ sort: 'branchCode:desc' })).slice(0, 2).sort()).toEqual(['P1', 'P4']);
  });

  it('lọc theo cột, kể cả Đơn vị cơ sở (trống, loại trừ), ngày và dấu nhập tay', async () => {
    const cf = (v: unknown) => ({ cf: JSON.stringify(v) });
    expect(pos(await list(cf({ branchCode: { in: ['A01'] } })))).toEqual(['P1', 'P4']);
    expect(pos(await list(cf({ branchCode: { in: [null] } })))).toEqual(['P2', 'P3']);
    expect(pos(await list(cf({ branchCode: { notIn: ['A01'] } })))).toEqual(['P2', 'P3']);
    expect(pos(await list(cf({ etdRevised: { in: ['2026-12-01', null] } })))).toEqual(['P2', 'P3']);
    expect(pos(await list(cf({ color: { notIn: ['Navy'] }, so: { in: [null] } })))).toEqual(['P3']);
    expect((await list(cf({ isFactoryManual: { in: [1] } }))).total).toBe(0);
    expect((await list(cf({ isFactoryManual: { in: [0] } }))).total).toBe(4);
    await api().get('/api/v1/order/po-allocations').query(cf({ SyncRowId: { in: [1] } })).set(auth(planner)).expect(422);
  });

  it('giá trị cho popup lọc theo các bộ lọc khác, không theo chính cột đó', async () => {
    const values = async (field: string, params: Record<string, string> = {}) =>
      (await api().get('/api/v1/order/po-allocations/values').query({ customer: TAG, field, ...params }).set(auth(planner)).expect(200)).body;
    expect(await values('branchCode', { cf: JSON.stringify({ branchCode: { in: ['A01'] } }) })).toEqual({ values: ['A01', null], truncated: false });
    expect((await values('etdRevised')).values).toEqual(['2026-12-01', '2026-11-01', '2026-10-15', null]);
    expect((await values('po', { search: 'p2' })).values).toEqual([P(2)]);
    expect((await values('isFactoryManual')).values).toEqual([0]);
  });

  it('chính sách cột thật: Nhà máy SX bị Che cho vai trò Kế hoạch thì ĐVCS, nhà máy theo OSM, dấu nhập tay cũng bị che', async () => {
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
      expect(body.items.map((r) => [r.factoryName, r.branchCode, r.osmFactoryName])).toEqual([
        ['***', '***', '***'],
        ['***', null, '***'],
        [null, null, null],
        ['***', '***', '***'],
      ]);
      expect(body.items.map((r) => r.isFactoryManual)).toEqual(['***', '***', '***', '***']);
      await api().get('/api/v1/order/po-allocations/values').query({ customer: TAG, field: 'branchCode' }).set(auth(planner)).expect(403);
      await api().get('/api/v1/order/po-allocations/values').query({ customer: TAG, field: 'isFactoryManual' }).set(auth(planner)).expect(403);
      // Không xem được nhà máy thì không có danh sách nhà máy để chọn
      expect((await api().get('/api/v1/order/po-allocations/options').set(auth(planner)).expect(200)).body.factories).toEqual([]);
    } finally {
      await setPolicy(null);
    }
    expect((await list({ sort: 'po:asc' })).items[0].branchCode).toBe('A01');
  });

  it('gợi ý Brand, Season, nhà máy đang dùng; xuất file có tên Đơn vị cơ sở và cột Nhập tay', async () => {
    const options = (await api().get('/api/v1/order/po-allocations/options').set(auth(planner)).expect(200)).body;
    expect(options.brands).toContain(TAG);
    expect(options.seasons).toEqual(expect.arrayContaining(['SS26', 'FW26']));
    expect(options.factories).toEqual(expect.arrayContaining([{ code: FTY, name: 'Nhà máy thử phân bổ PO', branchCode: 'A01' }, { code: FTY_FREE, name: 'Nhà máy thử chưa gắn ĐVCS', branchCode: null }]));
    const res = await api().get('/api/v1/order/po-allocations/export').query({ customer: TAG, sort: 'po:asc' }).set(auth(planner)).buffer(true).parse((r, cb) => {
      let text = '';
      r.on('data', (c: Buffer) => (text += c.toString('utf8')));
      r.on('end', () => cb(null, text));
    }).expect(200);
    const lines = (res.body as string).replace(new RegExp(`^${String.fromCharCode(0xfeff)}`), '').split('\r\n');
    expect(lines[0]).toBe('Brand,Season,PO,SO,Ship mode,Style name,Style No,Màu,ETD-Actual,ETD-Revised,Nhà máy SX,Đơn vị cơ sở,Nhập tay,Nhà máy SX theo OSM');
    expect(lines).toHaveLength(5);
    expect(lines[1].startsWith(`${TAG},SS26,${P(1)},S1,SEA,Áo ST-A,ST-A,Navy,2026-10-01,2026-11-01,${FTY},`)).toBe(true);
    expect(lines[1].endsWith(`,,${FTY}`)).toBe(true);
  });
});
