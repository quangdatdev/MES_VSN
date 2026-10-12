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
import type { SyncDb } from '../src/platform/sync/sync.types';

// Đổi Nhà máy SX ở Phân bổ PO (task 5.10.4) trên database thật đã migrate, seed: quyền, A00, luật ĐVCS theo nhà máy (Phase 5.10 Q2),
// chính sách cột, áp theo khóa SO, PO, Style No, Màu (Q5), xem trước, "Theo OSM", nhật ký. Dữ liệu thử: Brand riêng của bài test ở
// bảng chép OSM, chép sang PoAllocation bằng bước làm mới; nhà máy thử thêm vào danh mục; dọn sạch khi xong.
const TAG = `TSTPW${process.pid % 100000}`;
const FA = `${TAG}-A`; // A01
const FB = `${TAG}-B`; // A01
const FREE = `${TAG}-FREE`; // chưa gắn ĐVCS
const F2 = `${TAG}-A02`; // A02
const OFF = `${TAG}-OFF`; // A01, ngừng dùng
const P = (n: number) => `${TAG}-P${n}`;
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const osm = (po: string, so: string | null, styleNo: string, color: string, etd: string, fty: string | null) => ({
  Brand: TAG,
  Season: 'SS26',
  PO: po,
  SO: so,
  'Ship mode': 'SEA',
  StyleName: `Áo ${styleNo}`,
  StyleNo: styleNo,
  Color: color,
  'ETD-Actual': d('2026-10-01'),
  'ETD-REVISED': d(etd),
  FtyName: fty,
  SyncedAt: new Date(),
  SyncRunId: null,
});
const SOURCE = [
  // K1: một khóa hai dòng
  osm(P(1), 'S1', 'ST-A', 'Navy', '2026-11-01', FA),
  osm(P(1), 'S1', 'ST-A', 'Navy', '2026-11-15', FA),
  // K2: nhà máy của ĐVCS khác
  osm(P(2), 'S2', 'ST-B', 'Red', '2026-11-02', F2),
  // K3: một khóa hai dòng, một dòng thuộc nhà máy của ĐVCS khác
  osm(P(3), 'S3', 'ST-C', 'Black', '2026-11-03', FA),
  osm(P(3), 'S3', 'ST-C', 'Black', '2026-11-04', F2),
  // K4 chưa có nhà máy (SO trống); K5 nhà máy chưa gắn ĐVCS; K6 tên OSM chưa vào danh mục
  osm(P(4), null, 'ST-D', 'White', '2026-11-05', null),
  osm(P(5), 'S5', 'ST-E', 'Blue', '2026-11-06', FREE),
  osm(P(6), 'S6', 'ST-F', 'Green', '2026-11-07', `${TAG}-OSM`),
];

describe('Phân bổ PO: đổi Nhà máy SX', () => {
  let app: INestApplication;
  let syncDb: SyncDb;
  let orderDb: OrderDb;
  let core: CoreDb;
  let planner: string;
  let plannerId: number;
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const put = (token: string, body: object) => api().put('/api/v1/order/po-allocations/factory').set(auth(token)).send(body);
  const rows = () =>
    orderDb
      .selectFrom('PoAllocation')
      .select(['Id', 'PoNo', 'EtdRevisedDate', 'OsmFactoryCode', 'ProductionFactoryCode', 'IsFactoryManual', 'IsInOsm', 'ModifiedBy'])
      .where('Brand', '=', TAG)
      .orderBy('PoNo')
      .orderBy('EtdRevisedDate')
      .execute();
  const of = async (po: string) => (await rows()).filter((r) => r.PoNo === po);
  const idOf = async (po: string, i = 0) => Number((await of(po))[i].Id);
  const refresh = () => app.get(PoAllocationRefreshService).refresh({ brand: TAG });

  async function tokenFor(username: string, branchCode: string) {
    const l = await api().post('/api/v1/auth/login').send({ username, password: env.demoPassword });
    const s = await api().post('/api/v1/auth/select-branch').set('Authorization', `Bearer ${l.body.preAuthToken}`).send({ branchCode });
    if (!s.body.accessToken) throw new Error(`Không chọn được ${branchCode} cho ${username}: ${JSON.stringify(s.body)}`);
    return s.body.accessToken as string;
  }

  async function cleanup() {
    await sql`DELETE FROM osm.[OSMData] WHERE Brand LIKE 'TSTPW%'`.execute(syncDb);
    await orderDb.deleteFrom('PoAllocation').where('Brand', 'like', 'TSTPW%').execute();
    await core.deleteFrom('SysProductionFactory').where('Code', 'like', 'TSTPW%').execute();
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    syncDb = app.get<SyncDb>(SYNC_DB);
    orderDb = app.get<OrderDb>(ORDER_DB);
    core = app.get<CoreDb>(CORE_DB);
    await cleanup();
    await core.insertInto('SysProductionFactory').values([
      { Code: FA, Name: 'Nhà máy thử A', BranchCode: 'A01', SortOrder: 9990, IsActive: true, IsSystem: false },
      { Code: FB, Name: 'Nhà máy thử B', BranchCode: 'A01', SortOrder: 9991, IsActive: true, IsSystem: false },
      { Code: FREE, Name: 'Nhà máy thử chưa gắn ĐVCS', BranchCode: null, SortOrder: 9992, IsActive: true, IsSystem: false },
      { Code: F2, Name: 'Nhà máy thử của A02', BranchCode: 'A02', SortOrder: 9993, IsActive: true, IsSystem: false },
      { Code: OFF, Name: 'Nhà máy thử ngừng dùng', BranchCode: 'A01', SortOrder: 9994, IsActive: false, IsSystem: false },
    ]).execute();
    // Nhà máy của phiên tính theo danh mục và cache theo phiên bản quyền (danh mục sửa ở màn Quản trị cũng tăng phiên bản)
    await sql`UPDATE dbo.SysPermissionVersion SET Version = Version + 1, ModifiedAt = SYSUTCDATETIME() WHERE Id = 1`.execute(core);
    app.get(CatalogLookupService).invalidateFactories();
    await syncDb.insertInto('osm.OSMData' as never).values(SOURCE as never).execute();
    expect(await refresh()).toMatchObject({ skipped: null, inserted: SOURCE.length });
    planner = await tokenFor('kehoach.a', 'A01');
    plannerId = (await core.selectFrom('SysUser').select('Id').where('Username', '=', 'kehoach.a').executeTakeFirstOrThrow()).Id;
  });

  afterAll(async () => {
    if (syncDb) await cleanup();
    await app?.close();
  });

  it('không có quyền Sửa thì 403; đơn vị tổng hợp A00 chỉ đọc', async () => {
    const id = await idOf(P(1));
    const director = await tokenFor('giamdoc', 'A01');
    expect((await put(director, { ids: [id], factoryName: FB }).expect(403)).body.error.code).toBe('PERMISSION_DENIED');
    const aggregate = await tokenFor('admin', 'A00');
    expect((await put(aggregate, { ids: [id], factoryName: FB }).expect(403)).body.error.code).toBe('AGGREGATE_READ_ONLY');
    expect((await put(aggregate, { ids: [id], dryRun: true }).expect(403)).body.error.code).toBe('AGGREGATE_READ_ONLY');
    expect((await of(P(1))).every((r) => r.ProductionFactoryCode === FA && !r.IsFactoryManual)).toBe(true);
  });

  it('xem trước (dryRun) trả số dòng, số khóa sẽ bị áp và không ghi', async () => {
    const res = await put(planner, { ids: [await idOf(P(1)), await idOf(P(1), 1), await idOf(P(4))], dryRun: true }).expect(200);
    expect(res.body).toEqual({ rows: 3, keys: 2, removed: 0, dryRun: true });
    expect((await rows()).some((r) => r.IsFactoryManual)).toBe(false);
  });

  it('một lần sửa áp cho mọi dòng cùng SO, PO, Style No, Màu; ghi người sửa và nhật ký', async () => {
    const res = await put(planner, { ids: [await idOf(P(1))], factoryName: FB.toLowerCase() }).expect(200);
    expect(res.body).toEqual({ rows: 2, keys: 1, removed: 0, dryRun: false });
    const p1 = await of(P(1));
    // Lưu đúng mã của danh mục; nhà máy theo OSM giữ để màn hiện cạnh giá trị nhập tay
    expect(p1.map((r) => [r.ProductionFactoryCode, r.OsmFactoryCode, r.IsFactoryManual, r.ModifiedBy])).toEqual([
      [FB, FA, true, plannerId],
      [FB, FA, true, plannerId],
    ]);
    const list = (await api().get('/api/v1/order/po-allocations').query({ customer: TAG, q: P(1) }).set(auth(planner)).expect(200)).body;
    expect(list.items.map((r: any) => [r.factoryName, r.osmFactoryName, r.isFactoryManual, r.branchCode])).toEqual([
      [FB, FA, true, 'A01'],
      [FB, FA, true, 'A01'],
    ]);
    const log = await core
      .selectFrom('SysAuditLog')
      .select(['Username', 'BranchCode', 'EntityType', 'OldValue', 'NewValue'])
      .where('ActionCode', '=', 'PO_ALLOCATION_FACTORY')
      .where('OldValue', 'like', `%${P(1)}%`)
      .orderBy('Id', 'desc')
      .executeTakeFirstOrThrow();
    expect(log).toMatchObject({ Username: 'kehoach.a', BranchCode: 'A01', EntityType: 'PoAllocation' });
    expect(JSON.parse(log.OldValue!)).toEqual({ groups: [{ po: P(1), so: 'S1', styleNo: 'ST-A', color: 'Navy', factory: FA, manual: false, rows: 2 }] });
    expect(JSON.parse(log.NewValue!)).toEqual({ factory: FB, manual: true, rows: 2, keys: 1, removed: 0 });
  });

  it('dòng có nhà máy của ĐVCS khác thì 403, kể cả khi chỉ một dòng cùng khóa như vậy; không ghi gì', async () => {
    const other = await put(planner, { ids: [await idOf(P(2))], factoryName: FB }).expect(403);
    expect(other.body.error).toMatchObject({ code: 'FACTORY_OF_OTHER_BRANCH', details: { rows: 1, total: 1 } });
    const mixed = await put(planner, { ids: [await idOf(P(3))], dryRun: true }).expect(403);
    expect(mixed.body.error).toMatchObject({ code: 'FACTORY_OF_OTHER_BRANCH', details: { rows: 1, total: 2 } });
    // Lẫn với dòng ghi được trong cùng lần gửi: không dòng nào được ghi
    await put(planner, { ids: [await idOf(P(4)), await idOf(P(3))], factoryName: FB }).expect(403);
    expect((await rows()).filter((r) => [P(2), P(3), P(4)].includes(r.PoNo!)).some((r) => r.IsFactoryManual)).toBe(false);
    // ĐVCS quản lý nhà máy đó thì sửa được
    const a02 = await tokenFor('admin', 'A02');
    expect((await put(a02, { ids: [await idOf(P(2))], dryRun: true }).expect(200)).body).toMatchObject({ rows: 1, keys: 1 });
  });

  it('dòng chưa có nhà máy, nhà máy chưa gắn ĐVCS hoặc chưa vào danh mục thì ĐVCS nào cũng sửa được', async () => {
    const res = await put(planner, { ids: [await idOf(P(4)), await idOf(P(5)), await idOf(P(6))], factoryName: FA }).expect(200);
    expect(res.body).toEqual({ rows: 3, keys: 3, removed: 0, dryRun: false });
    expect((await rows()).filter((r) => [P(4), P(5), P(6)].includes(r.PoNo!)).map((r) => [r.ProductionFactoryCode, r.IsFactoryManual])).toEqual([
      [FA, true],
      [FA, true],
      [FA, true],
    ]);
  });

  it('nhà máy mới phải đang dùng trong danh mục (ĐVCS nào cũng được); chọn sang ĐVCS khác thì sau đó ĐVCS này không sửa được nữa', async () => {
    const id = await idOf(P(6));
    for (const name of [`${TAG}-KHONG-CO`, OFF]) expect((await put(planner, { ids: [id], factoryName: name }).expect(422)).body.error.code).toBe('VALIDATION_FAILED');
    await put(planner, { ids: [id], factoryName: F2 }).expect(200);
    expect((await put(planner, { ids: [id], factoryName: FA }).expect(403)).body.error.code).toBe('FACTORY_OF_OTHER_BRANCH');
    const a02 = await tokenFor('admin', 'A02');
    await put(a02, { ids: [id], factoryName: FA }).expect(200);
  });

  it('"Theo OSM" bỏ nhập tay, Nhà máy SX trở lại giá trị OSM', async () => {
    const res = await put(planner, { ids: [await idOf(P(1), 1)], factoryName: null }).expect(200);
    expect(res.body).toEqual({ rows: 2, keys: 1, removed: 0, dryRun: false });
    expect((await of(P(1))).map((r) => [r.ProductionFactoryCode, r.IsFactoryManual])).toEqual([
      [FA, false],
      [FA, false],
    ]);
    await put(planner, { ids: [await idOf(P(4))], factoryName: null }).expect(200);
    expect((await of(P(4))).map((r) => [r.ProductionFactoryCode, r.IsFactoryManual])).toEqual([[null, false]]);
  });

  it('"Theo OSM" với dòng nhập tay không còn trong OSM thì xóa dòng đó', async () => {
    // P5 đang nhập tay; OSM bỏ P5 (các dòng khác giữ, trên ngưỡng 80%)
    await sql`DELETE FROM osm.[OSMData] WHERE Brand = ${TAG} AND PO = ${P(5)}`.execute(syncDb);
    expect(await refresh()).toMatchObject({ skipped: null, missing: 1, removed: 0 });
    const [kept] = await of(P(5));
    expect([kept.ProductionFactoryCode, kept.IsFactoryManual, kept.IsInOsm]).toEqual([FA, true, false]);
    const list = (await api().get('/api/v1/order/po-allocations').query({ customer: TAG, q: P(5) }).set(auth(planner)).expect(200)).body;
    expect(list.items[0]).toMatchObject({ isFactoryManual: true, isInOsm: false, osmFactoryName: FREE });
    expect((await put(planner, { ids: [Number(kept.Id)], factoryName: null }).expect(200)).body).toEqual({ rows: 1, keys: 1, removed: 1, dryRun: false });
    expect(await of(P(5))).toEqual([]);
    // Dòng đã xóa (hoặc đã đổi sau lần làm mới) thì 404 để người dùng tải lại
    expect((await put(planner, { ids: [Number(kept.Id)], factoryName: FA }).expect(404)).body.error.code).toBe('NOT_FOUND');
  });

  it('cột Nhà máy SX Chỉ đọc với vai trò thì 403 FIELD_READONLY', async () => {
    const admin = await tokenFor('admin', 'A01');
    const role = await core.selectFrom('SysRole').select('Id').where('Code', '=', 'PLANNER').executeTakeFirstOrThrow();
    const resource = await core.selectFrom('SysResource').select('Id').where('Code', '=', 'order.poallocation').executeTakeFirstOrThrow();
    const setPolicy = (level: string | null) =>
      api().put(`/api/v1/admin/roles/${role.Id}/field-policies`).set(auth(admin)).send({ resourceId: resource.Id, policies: [{ fieldCode: 'factoryName', accessLevel: level }] }).expect(200);
    await setPolicy('READONLY');
    try {
      expect((await put(planner, { ids: [await idOf(P(1))], factoryName: FB }).expect(403)).body.error.code).toBe('FIELD_READONLY');
      expect((await put(planner, { ids: [await idOf(P(1))], factoryName: null }).expect(403)).body.error.code).toBe('FIELD_READONLY');
    } finally {
      await setPolicy(null);
    }
    expect((await of(P(1))).some((r) => r.IsFactoryManual)).toBe(false);
  });

  it('dữ liệu gửi lên sai dạng thì 422', async () => {
    const id = await idOf(P(1));
    for (const body of [{ ids: [], factoryName: FA }, { ids: Array.from({ length: 501 }, (_, i) => i + 1), factoryName: FA }, { ids: [id] }, { ids: [id], factoryName: '' }, { ids: ['x'], factoryName: FA }]) {
      expect((await put(planner, body).expect(422)).body.error.code).toBe('VALIDATION_FAILED');
    }
  });
});
