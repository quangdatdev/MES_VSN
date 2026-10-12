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
import { PoAllocationRefreshService, type RefreshOptions } from '../src/modules/order/po-allocation-refresh.service';
import { shrinkGuard } from '../src/modules/order/po-allocation.repository';
import { CORE_DB, type CoreDb } from '../src/platform/database/database.module';
import { SYNC_DB } from '../src/platform/sync/sync.db';
import { SyncRepository } from '../src/platform/sync/sync.repository';
import type { SyncDb } from '../src/platform/sync/sync.types';

// Bước làm mới bảng Phân bổ PO theo bảng chép OSM (task 5.10.2, sửa theo review 5.10.15), trên database thật đã migrate. Đồng bộ giả
// lập bằng cách sửa thẳng bảng chép osm.OSMData (Brand riêng của bài test), rồi chạy bước làm mới chỉ cho Brand đó; dọn sạch khi xong.
// Các bài chạy nối tiếp trên cùng dữ liệu.
const TAG = `TSTPR${process.pid % 100000}`;
const FTY_A = `${TAG}-A`;
const FTY_B = `${TAG}-B`;
const P = (n: number | string) => `${TAG}-P${n}`;
const d = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);
interface Line {
  po: string;
  so: string | null;
  styleNo: string;
  color: string;
  etd: string | null;
  fty: string | null;
}
const osmRow = (l: Line) => ({
  Brand: TAG,
  Season: 'SS26',
  PO: l.po,
  SO: l.so,
  'Ship mode': 'SEA',
  StyleName: `Áo ${l.styleNo}`,
  StyleNo: l.styleNo,
  Color: l.color,
  'ETD-Actual': d('2026-10-01'),
  'ETD-REVISED': d(l.etd),
  FtyName: l.fty,
  SyncedAt: new Date(),
  SyncRunId: null,
});

describe('Phân bổ PO: làm mới theo OSM', () => {
  let app: INestApplication;
  let syncDb: SyncDb;
  let orderDb: OrderDb;
  let core: CoreDb;
  let refresh: (opts?: Omit<RefreshOptions, 'brand'>) => ReturnType<PoAllocationRefreshService['refresh']>;

  /** Thay toàn bộ dòng của bài test trong bảng chép (như một lần đồng bộ FULL) */
  async function sync(lines: Line[]) {
    await sql`DELETE FROM osm.[OSMData] WHERE Brand = ${TAG}`.execute(syncDb);
    if (lines.length) await syncDb.insertInto('osm.OSMData' as never).values(lines.map(osmRow) as never).execute();
  }
  const rows = () =>
    orderDb
      .selectFrom('PoAllocation')
      .select(['Id', 'PoNo', 'EtdRevisedDate', 'OsmFactoryCode', 'ProductionFactoryCode', 'IsFactoryManual', 'IsInOsm'])
      .where('Brand', '=', TAG)
      .orderBy('PoNo')
      .orderBy('EtdRevisedDate')
      .execute();
  const of = async (po: string) => (await rows()).filter((r) => r.PoNo === po);
  const day = (v: Date | null) => (v ? v.toISOString().slice(0, 10) : null);
  const state = () => orderDb.selectFrom('PoAllocationRefresh').selectAll().where('Id', '=', 1).executeTakeFirstOrThrow();
  const lastAudit = async () =>
    JSON.parse(
      (
        await core
          .selectFrom('SysAuditLog')
          .select(['Username', 'NewValue'])
          .where('ActionCode', '=', 'PO_ALLOCATION_REFRESH')
          .where('NewValue', 'like', `%${TAG}%`)
          .orderBy('Id', 'desc')
          .executeTakeFirstOrThrow()
      ).NewValue!,
    );

  async function cleanup() {
    await sql`DELETE FROM osm.[OSMData] WHERE Brand LIKE 'TSTPR%'`.execute(syncDb);
    await orderDb.deleteFrom('PoAllocation').where('Brand', 'like', 'TSTPR%').execute();
  }

  // Dòng đệm giữ số dòng nguồn trên ngưỡng khi bài test bỏ vài dòng
  const fillers: Line[] = Array.from({ length: 10 }, (_, i) => ({ po: P(`F${i}`), so: `SF${i}`, styleNo: 'ST-F', color: 'Gray', etd: '2026-09-01', fty: FTY_A }));
  const base: Line[] = [
    // Một khóa SO, PO, Style No, Màu hai dòng (khác ETD)
    { po: P(1), so: 'S1', styleNo: 'ST-A', color: 'Navy', etd: '2026-11-01', fty: FTY_A },
    { po: P(1), so: 'S1', styleNo: 'ST-A', color: 'Navy', etd: '2026-11-15', fty: FTY_A },
    { po: P(2), so: 'S2', styleNo: 'ST-B', color: 'Red', etd: '2026-12-01', fty: FTY_A },
    { po: P(3), so: null, styleNo: 'ST-C', color: 'Black', etd: '2026-12-05', fty: FTY_A },
    { po: P(4), so: 'S4', styleNo: 'ST-D', color: 'White', etd: '2026-12-10', fty: FTY_A },
  ];
  // Nguồn sau lần đồng bộ thứ hai: P1 đổi ETD một dòng và FtyName cả hai; P2 đổi FtyName; P3, P4 không còn
  const second: Line[] = [{ ...base[0], etd: '2026-11-20', fty: `${TAG}-OSM` }, { ...base[1], fty: `${TAG}-OSM` }, { ...base[2], fty: FTY_B }, ...fillers];

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    syncDb = app.get<SyncDb>(SYNC_DB);
    orderDb = app.get<OrderDb>(ORDER_DB);
    core = app.get<CoreDb>(CORE_DB);
    if (!(await app.get(SyncRepository).databaseReady())) throw new Error(`Cần database ${env.db.syncName} đã tạo và migrate`);
    const service = app.get(PoAllocationRefreshService);
    refresh = (opts = {}) => service.refresh({ brand: TAG, ...opts });
    await cleanup();
  });

  afterAll(async () => {
    if (syncDb) await cleanup();
    await app?.close();
  });

  it('ngưỡng giảm: 20% mặc định, 100 là không chặn, 0 là giảm một dòng cũng giữ', () => {
    expect(shrinkGuard(80, 100, 20)).toBe(false);
    expect(shrinkGuard(79, 100, 20)).toBe(true);
    expect(shrinkGuard(1, 100, 100)).toBe(false);
    expect(shrinkGuard(99, 100, 0)).toBe(true);
    expect(shrinkGuard(100, 100, 0)).toBe(false);
  });

  it('lần đầu chép mọi dòng khác nhau, Nhà máy SX theo OSM; ghi trạng thái; tên nhà máy chưa có trong danh mục được đếm, ghi nhật ký', async () => {
    await sync([...base, ...fillers]);
    const r = await refresh();
    expect(r).toMatchObject({ reason: null, source: 15, inserted: 15, updated: 0, removed: 0, missing: 0, keptAbsent: 0, manual: 0, total: 15, maxShrinkPercent: 20 });
    expect(r!.unknownFactories).toEqual([FTY_A]);
    const p1 = await of(P(1));
    expect(p1.map((x) => [day(x.EtdRevisedDate), x.ProductionFactoryCode, x.OsmFactoryCode, x.IsFactoryManual, x.IsInOsm])).toEqual([
      ['2026-11-01', FTY_A, FTY_A, false, true],
      ['2026-11-15', FTY_A, FTY_A, false, true],
    ]);
    expect(await state()).toMatchObject({ SourceRows: 15, PreviousRows: 0, InsertedRows: 15, UpdatedRows: 0, RemovedRows: 0, KeptAbsentRows: 0, UnknownFactories: 1, MaxShrinkPercent: 20, SkippedReason: null });
    expect((await state()).SourceSyncedAt).toBeTruthy();
    expect(await lastAudit()).toMatchObject({ reason: null, inserted: 15, unknownFactories: 1, unknownFactoryNames: [FTY_A] });
  });

  it('nguồn không đổi thì không ghi lại dòng nào; chỉ dòng lệch giá trị được sửa', async () => {
    expect(await refresh()).toMatchObject({ reason: null, inserted: 0, updated: 0, removed: 0 });
    await orderDb.updateTable('PoAllocation').set({ ProductionFactoryCode: null }).where('Brand', '=', TAG).where('PoNo', '=', P(2)).execute();
    expect(await refresh()).toMatchObject({ reason: null, inserted: 0, updated: 1, removed: 0 });
    expect((await of(P(2)))[0].ProductionFactoryCode).toBe(FTY_A);
  });

  it('dòng nhập tay giữ nhà máy khi ETD, FtyName đổi; dòng thường đổi theo OSM; khóa vắng khỏi OSM thì giữ dòng nhập tay, xóa dòng thường', async () => {
    // Nhập tay như màn hình ghi (khóa P1 và P3)
    await orderDb.updateTable('PoAllocation').set({ ProductionFactoryCode: FTY_B, IsFactoryManual: true, ModifiedBy: 1, ModifiedAt: new Date() }).where('Brand', '=', TAG).where('PoNo', 'in', [P(1), P(3)]).execute();
    const p2Before = (await of(P(2)))[0].Id;
    await sync(second);
    expect(await refresh()).toMatchObject({ reason: null, source: 13, inserted: 3, updated: 0, removed: 4, missing: 1, total: 14 });

    const p1 = await of(P(1));
    expect(p1.map((x) => [day(x.EtdRevisedDate), x.ProductionFactoryCode, x.OsmFactoryCode, x.IsFactoryManual, x.IsInOsm])).toEqual([
      ['2026-11-15', FTY_B, `${TAG}-OSM`, true, true],
      ['2026-11-20', FTY_B, `${TAG}-OSM`, true, true],
    ]);
    const [p2] = await of(P(2));
    expect([p2.ProductionFactoryCode, p2.OsmFactoryCode, p2.IsFactoryManual]).toEqual([FTY_B, FTY_B, false]);
    // FtyName đổi thì dòng OSM là dòng khác (dấu khác): Id mới
    expect(p2.Id).not.toBe(p2Before);
    const [p3] = await of(P(3));
    expect([p3.ProductionFactoryCode, p3.IsFactoryManual, p3.IsInOsm]).toEqual([FTY_B, true, false]);
    expect(await of(P(4))).toEqual([]);
  });

  it('nguồn rỗng: bỏ qua cả lần làm mới, giữ thời điểm chép của dữ liệu, ghi trạng thái và nhật ký', async () => {
    const before = await rows();
    const syncedAt = (await state()).SourceSyncedAt;
    await sync([]);
    expect(await refresh()).toMatchObject({ reason: 'EMPTY', source: 0, before: 13 });
    expect(await rows()).toEqual(before);
    expect(await state()).toMatchObject({ SkippedReason: 'EMPTY', SourceRows: 0, PreviousRows: 13, SourceSyncedAt: syncedAt });
    expect(await lastAudit()).toMatchObject({ reason: 'EMPTY', source: 0, before: 13 });
  });

  it('nguồn giảm quá ngưỡng: vẫn thêm, sửa nhưng giữ dòng vắng (không xóa, không đánh dấu); màn Phân bổ PO cảnh báo', async () => {
    const before = await rows();
    // 13 dòng đang có trong OSM, nguồn còn 10 (dưới 80%): P1 (2 dòng), P2 vắng mà không bị đụng tới
    await sync(fillers);
    expect(await refresh()).toMatchObject({ reason: 'SHRINK', source: 10, before: 13, inserted: 0, updated: 0, removed: 0, missing: 0, keptAbsent: 3 });
    expect(await rows()).toEqual(before);
    expect(await state()).toMatchObject({ SkippedReason: 'SHRINK', KeptAbsentRows: 3, SourceRows: 10, PreviousRows: 13, MaxShrinkPercent: 20 });
    expect(await lastAudit()).toMatchObject({ reason: 'SHRINK', keptAbsent: 3, maxShrinkPercent: 20 });

    const api = () => request(app.getHttpServer());
    const l = await api().post('/api/v1/auth/login').send({ username: 'kehoach.a', password: env.demoPassword });
    const s = await api().post('/api/v1/auth/select-branch').set('Authorization', `Bearer ${l.body.preAuthToken}`).send({ branchCode: 'A01' });
    const page = (await api().get('/api/v1/order/po-allocations').query({ customer: TAG }).set('Authorization', `Bearer ${s.body.accessToken}`).expect(200)).body;
    expect(page.lastRefresh).toMatchObject({ reason: 'SHRINK', keptAbsent: 3, sourceRows: 10, previousRows: 13, maxShrinkPercent: 20 });
    expect(page.syncedAt).toBeTruthy();

    // Có dòng mới cùng lúc nguồn giảm (ngưỡng 10%: 11 < 13 x 90%): dòng mới vẫn được thêm
    await sync([...fillers, { po: P('N1'), so: 'SN1', styleNo: 'ST-N', color: 'Pink', etd: '2026-12-20', fty: FTY_A }]);
    expect(await refresh({ maxShrinkPercent: 10 })).toMatchObject({ reason: 'SHRINK', inserted: 1, removed: 0, keptAbsent: 3 });
    expect(await of(P('N1'))).toHaveLength(1);
    expect(await of(P(2))).toHaveLength(1);
  });

  it('ngưỡng 100 (quản trị cho qua có chủ đích): xóa dòng vắng như thường, hết cảnh báo', async () => {
    expect(await refresh({ maxShrinkPercent: 100 })).toMatchObject({ reason: null, removed: 1, missing: 2, keptAbsent: 0 });
    expect(await of(P(2))).toEqual([]);
    expect((await of(P(1))).map((x) => [x.ProductionFactoryCode, x.IsFactoryManual, x.IsInOsm])).toEqual([
      [FTY_B, true, false],
      [FTY_B, true, false],
    ]);
    expect(await state()).toMatchObject({ SkippedReason: null, KeptAbsentRows: 0, MaxShrinkPercent: 100 });
  });

  it('khóa nhập tay có lại trong OSM: dòng mới nhận nhà máy nhập tay, dòng giữ tạm bị bỏ', async () => {
    await sync([...fillers, { po: P('N1'), so: 'SN1', styleNo: 'ST-N', color: 'Pink', etd: '2026-12-20', fty: FTY_A }, { ...base[3], etd: '2027-01-05' }]);
    expect(await refresh()).toMatchObject({ reason: null, inserted: 1, removed: 1, missing: 0 });
    const p3 = await of(P(3));
    expect(p3.map((x) => [day(x.EtdRevisedDate), x.ProductionFactoryCode, x.OsmFactoryCode, x.IsFactoryManual, x.IsInOsm])).toEqual([['2027-01-05', FTY_B, FTY_A, true, true]]);
  });
});
