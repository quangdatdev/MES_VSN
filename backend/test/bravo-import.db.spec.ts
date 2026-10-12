import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'kysely';
import { isDeadlock } from '../src/common/db-errors';
import { AppModule } from '../src/app.module';
import { BravoOrderImportRepository } from '../src/modules/order/bravo-order-import.repository';
import { planImport } from '../src/modules/order/bravo-order.mapping';
import { ORDER_DB } from '../src/modules/order/order.db';
import type { OrderDb } from '../src/modules/order/order.types';
import { CORE_DB, type CoreDb } from '../src/platform/database/database.module';
import type { BravoOrderSource, SourceCell, SourceOrder, SourcePo } from '../src/platform/sync/bravo-order-source';

// Nạp tăng dần đơn hàng BRAVO vào MES_Order (ADR 0013 mục 8), chạy trên database thật. Dữ liệu nguồn giả lập (không ghi vào
// MES_Sync), ProductId riêng của bài test: chỉ thêm, sửa đơn của bài này; dọn sạch khi xong.
const BASE = 990_000_000 + (process.pid % 1000) * 1000;
const T0 = new Date('2026-10-01T08:00:00Z');
const T1 = new Date('2026-10-05T08:00:00Z');

const order = (n: number, over: Partial<SourceOrder> = {}): SourceOrder => ({
  ProductId: BASE + n,
  BranchCode: 'A01',
  Name: `TEST-BRAVO-${n} | Áo`,
  StyleName: `TST-${n}`,
  ProductName: 'Áo thử nạp BRAVO',
  Unit: 'CHIEC',
  Qty: 100,
  EndDatePrice: null,
  ProductionTypeCode: 'SXXK',
  SyncedAt: T0,
  Customer: 'KH thử',
  Season: 'SS26',
  Staff: null,
  PoProductId: BASE + n,
  ...over,
});
const po = (n: number, no = 'P1', over: Partial<SourcePo> = {}): SourcePo => ({ ProductId: BASE + n, CustomerPONo: `T${n}-${no}`, Etd: new Date('2026-12-01T00:00:00Z'), SyncedAt: T0, Destination: 'US', ...over });
const cell = (n: number, no = 'P1', size = 'M', qty = 10, over: Partial<SourceCell> = {}): SourceCell => ({
  ProductId: BASE + n,
  CustomerPONo: `T${n}-${no}`,
  ColorId: 1,
  ColorName: 'Navy',
  ColorCode: 'C1',
  SizeCode: size,
  SizeType: 'REG',
  Qty: qty,
  ColorStt: 1,
  SizeStt: size === 'M' ? 1 : size === 'L' ? 2 : 3,
  SyncedAt: T0,
  ...over,
});
/** Cùng nội dung, mốc chép mới: như nguồn chép theo nhóm chép lại cả nhóm */
const recopied = (src: BravoOrderSource): BravoOrderSource => ({ ...src, pos: src.pos.map((p) => ({ ...p, SyncedAt: T1 })), cells: src.cells.map((c) => ({ ...c, SyncedAt: T1 })) });
const NO_WRITE = { newOrders: 0, updatedOrders: 0, baselined: 0, newPos: 0, updatedPos: 0, cellUpdates: 0 };

describe('Nạp tăng dần đơn hàng BRAVO vào MES_Order', () => {
  let app: INestApplication;
  let db: OrderDb;
  let core: CoreDb;
  let repo: BravoOrderImportRepository;
  let opts: Parameters<typeof planImport>[2];
  const run = (src: BravoOrderSource) => repo.apply((state) => planImport(src, state, opts));
  const orderOf = (n: number) => db.selectFrom('SalesOrder').selectAll().where('SourceProductId', '=', BASE + n).executeTakeFirstOrThrow();
  const posOf = async (n: number) => db.selectFrom('SalesOrderPo').selectAll().where('SalesOrderId', '=', (await orderOf(n)).Id).orderBy('Id').execute();
  const cellsOf = (poId: number) => db.selectFrom('SalesOrderPoColorSize').select(['ColorName', 'SizeName', 'Qty', 'CreatedBy']).where('SalesOrderPoId', '=', poId).orderBy('SortOrder').execute();

  /** Dọn cả đơn thử của lần chạy trước bị dừng giữa chừng (ProductId khác) để số đơn không bị thêm -2 */
  async function cleanup() {
    const ids = (await db.selectFrom('SalesOrder').select('Id').where('SourceProductId', '>=', 990_000_000).where('SourceProductId', '<', 991_000_000).execute()).map((r) => r.Id);
    for (let i = 0; i < ids.length; i += 1000) {
      const part = ids.slice(i, i + 1000);
      const poIds = (await db.selectFrom('SalesOrderPo').select('Id').where('SalesOrderId', 'in', part).execute()).map((r) => r.Id);
      for (let k = 0; k < poIds.length; k += 1000) await db.deleteFrom('SalesOrderPoColorSize').where('SalesOrderPoId', 'in', poIds.slice(k, k + 1000)).execute();
      await db.deleteFrom('SalesOrderPo').where('SalesOrderId', 'in', part).execute();
      await db.deleteFrom('SalesOrder').where('Id', 'in', part).execute();
    }
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    db = app.get<OrderDb>(ORDER_DB);
    core = app.get<CoreDb>(CORE_DB);
    repo = app.get(BravoOrderImportRepository);
    const factories = await core.selectFrom('SysProductionFactory').select('Code').where('IsActive', '=', true).execute();
    opts = { branches: ['A01'], unitNames: new Map([['CHIEC', 'Chiếc']]), activeFactories: new Set(factories.map((f) => f.Code)) };
    await cleanup();
  });

  afterEach(cleanup);

  afterAll(async () => {
    await app.close();
  });

  it('thêm đơn, PO, màu cỡ mới; giữ phần người dùng sửa khi BRAVO không đổi (kể cả khi nguồn chép lại với mốc mới); BRAVO đổi thì theo BRAVO', async () => {
    // Lần 1: ba đơn mới
    const first: BravoOrderSource = {
      orders: [order(1), order(2), order(3)],
      pos: [po(1), po(2), po(3)],
      cells: [cell(1), cell(1, 'P1', 'L', 20), cell(2), cell(3)],
    };
    const r1 = await run(first);
    expect(r1.applied).toMatchObject({ newOrders: 3, newPos: 0, updatedOrders: 0, cellUpdates: 0 });
    const o1 = await orderOf(1);
    expect(o1).toMatchObject({ OrderNo: 'TEST-BRAVO-1', CustomerName: 'KH thử', UnitName: 'Chiếc', StatusCode: 'NEW', BranchCode: 'A01', CreatedBy: null });
    expect(o1.SourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(o1.ProductionFactoryCode).toBe(opts.activeFactories.has('A01') ? 'A01' : null);
    const [p1] = await posOf(1);
    expect(p1.PoCode).toBe(`PO-A01-${String(p1.Id).padStart(6, '0')}`);
    expect(p1).toMatchObject({ PoNumber: 'T1-P1', Qty: 30, StatusCode: 'DRAFT', CreatedBy: null });
    expect(await cellsOf(p1.Id)).toEqual([
      { ColorName: 'Navy', SizeName: 'M', Qty: 10, CreatedBy: null },
      { ColorName: 'Navy', SizeName: 'L', Qty: 20, CreatedBy: null },
    ]);
    expect((await run(first)).applied).toMatchObject({ ...NO_WRITE, cellsKept: [] });

    // Người dùng sửa ở MES: đổi khách hàng đơn 1, bỏ Nhà máy SX; xác nhận PO đơn 2; sửa tay màu cỡ đơn 3
    await db.updateTable('SalesOrder').set({ CustomerName: 'Sửa tay', ProductionFactoryCode: null, ModifiedAt: new Date(), ModifiedBy: 1 }).where('Id', '=', o1.Id).execute();
    const [p2] = await posOf(2);
    await db.updateTable('SalesOrderPo').set({ StatusCode: 'CONFIRMED', ConfirmedAt: new Date(), ConfirmedBy: 1, ModifiedAt: new Date(), ModifiedBy: 1 }).where('Id', '=', p2.Id).execute();
    const [p3] = await posOf(3);
    await db.updateTable('SalesOrderPoColorSize').set({ CreatedBy: 1 }).where('SalesOrderPoId', '=', p3.Id).execute();

    // Lần 2: nguồn PO, màu cỡ chép lại với mốc mới (đơn 1 không đổi nội dung); đổi màu cỡ đơn 2, 3; thêm PO đơn 3; thêm đơn 4
    const second = recopied({
      orders: [order(1), order(2), order(3), order(4)],
      pos: [po(1), po(2), po(3), po(3, 'P2'), po(4)],
      cells: [cell(1), cell(1, 'P1', 'L', 20), cell(2, 'P1', 'M', 15), cell(3, 'P1', 'M', 15), cell(3, 'P2', 'S', 8), cell(4)],
    });
    const r2 = await run(second);
    expect(r2.applied).toMatchObject({ newOrders: 1, newPos: 1, updatedOrders: 0, updatedPos: 0, cellUpdates: 0 });
    expect(r2.applied.cellsKept.sort()).toEqual([p2.Id, p3.Id].sort());
    expect(await orderOf(1)).toMatchObject({ CustomerName: 'Sửa tay', ProductionFactoryCode: null });
    expect(await cellsOf(p2.Id)).toEqual([{ ColorName: 'Navy', SizeName: 'M', Qty: 10, CreatedBy: null }]);
    const p3s = await posOf(3);
    expect(p3s.map((p) => [p.PoNumber, p.Qty])).toEqual([
      ['T3-P1', 10],
      ['T3-P2', 8],
    ]);
    expect(p3s[1].PoCode).toBe(`PO-A01-${String(p3s[1].Id).padStart(6, '0')}`);

    // Lần 3: BRAVO đổi khách hàng đơn 1: theo BRAVO, giữ Nhà máy SX người dùng chọn; màu cỡ đơn 4 (chưa ai đụng) thay theo
    // BRAVO; ngày xuất PO đơn 4 đổi kéo theo ngày xuất của đơn
    const third: BravoOrderSource = {
      orders: [order(1, { Customer: 'KH đổi', SyncedAt: T1 }), order(2), order(3), order(4)],
      pos: [...second.pos.filter((p) => p.ProductId !== BASE + 4), po(4, 'P1', { Etd: new Date('2026-11-15T00:00:00Z'), SyncedAt: T1 })],
      cells: [...second.cells.filter((c) => c.ProductId !== BASE + 4), cell(4, 'P1', 'M', 4), cell(4, 'P1', 'L', 6)],
    };
    const r3 = await run(third);
    expect(r3.applied).toMatchObject({ newOrders: 0, newPos: 0, updatedOrders: 2, cellUpdates: 1, updatedPos: 1 });
    expect(await orderOf(1)).toMatchObject({ CustomerName: 'KH đổi', ProductionFactoryCode: null, ModifiedBy: 1 });
    const [p4] = await posOf(4);
    expect(p4).toMatchObject({ Qty: 10 });
    expect(p4.ShipDate.toISOString().slice(0, 10)).toBe('2026-11-15');
    expect((await orderOf(4)).ShipDate.toISOString().slice(0, 10)).toBe('2026-11-15');
    expect(await cellsOf(p4.Id)).toEqual([
      { ColorName: 'Navy', SizeName: 'M', Qty: 4, CreatedBy: null },
      { ColorName: 'Navy', SizeName: 'L', Qty: 6, CreatedBy: null },
    ]);

    // Chạy lại khi BRAVO không đổi: không ghi gì (PO giữ màu cỡ của MES vẫn được báo)
    const again = await run(recopied(third));
    expect(again.applied).toMatchObject(NO_WRITE);
    expect(again.applied.cellsKept).toHaveLength(2);
  });

  it('BRAVO đóng lệnh: đơn Mới thành Hoàn thành; đơn người dùng đã đổi trạng thái giữ trạng thái của MES', async () => {
    const src: BravoOrderSource = { orders: [order(1), order(2)], pos: [po(1), po(2)], cells: [cell(1), cell(2)] };
    await run(src);
    await db.updateTable('SalesOrder').set({ StatusCode: 'CANCELLED', ModifiedAt: new Date(), ModifiedBy: 1 }).where('Id', '=', (await orderOf(2)).Id).execute();
    const closed = { ...src, orders: [order(1, { EndDatePrice: T1 }), order(2, { EndDatePrice: T1 })] };
    expect((await run(closed)).applied).toMatchObject({ updatedOrders: 2 });
    expect((await orderOf(1)).StatusCode).toBe('DONE');
    expect((await orderOf(2)).StatusCode).toBe('CANCELLED');
  });

  it('người dùng sửa đơn, xác nhận PO đúng lúc bước nạp đang so: câu ghi kiểm lại, không đè phần vừa sửa', async () => {
    const src: BravoOrderSource = { orders: [order(1), order(2)], pos: [po(1), po(2)], cells: [cell(1), cell(2)] };
    await run(src);
    // Đơn 1 như nạp trước khi có dấu nội dung, chưa ai sửa: lần nạp sau sẽ ghi lại cột lấy từ BRAVO (không phải BRAVO đổi)
    await db.updateTable('SalesOrder').set({ SourceHash: null }).where('Id', '=', (await orderOf(1)).Id).execute();
    const [p2] = await posOf(2);
    const changed = { ...src, cells: [cell(1), cell(2, 'P1', 'M', 25)] };
    const r = await repo.apply(async (state) => {
      const plan = planImport(changed, state, opts);
      expect(plan.orderUpdates.map((u) => u.id)).toEqual([(await orderOf(1)).Id]);
      expect(plan.cellUpdates.map((u) => u.poId)).toEqual([p2.Id]);
      // Kết nối khác (như một request của người dùng) sửa đơn 1 và xác nhận PO đơn 2 sau khi đã so
      await db.updateTable('SalesOrder').set({ CustomerName: 'Vừa sửa', ModifiedAt: new Date(), ModifiedBy: 1 }).where('SourceProductId', '=', BASE + 1).execute();
      await db.updateTable('SalesOrderPo').set({ StatusCode: 'CONFIRMED', ConfirmedAt: new Date(), ConfirmedBy: 1, ModifiedAt: new Date(), ModifiedBy: 1 }).where('Id', '=', p2.Id).execute();
      return plan;
    });
    expect(r.applied).toMatchObject({ updatedOrders: 0, cellUpdates: 0, cellsKept: [p2.Id] });
    expect((await orderOf(1)).CustomerName).toBe('Vừa sửa');
    expect(await cellsOf(p2.Id)).toEqual([{ ColorName: 'Navy', SizeName: 'M', Qty: 10, CreatedBy: null }]);
  });

  it('khóa chéo với thao tác của người dùng: SQL Server hủy bước nạp (ưu tiên thấp), lỗi 1205 giữ nguyên, người dùng chạy tiếp', async () => {
    const src: BravoOrderSource = { orders: [order(1)], pos: [po(1)], cells: [cell(1)] };
    await run(src);
    const id = (await orderOf(1)).Id;
    // Chưa có dấu nội dung, chưa ai sửa: lần nạp sau ghi lại đơn 1, nên khóa dòng đơn 1
    await db.updateTable('SalesOrder').set({ SourceHash: null }).where('Id', '=', id).execute();
    let userLocked!: () => void;
    const locked = new Promise<void>((r) => (userLocked = r));
    // Như một request của người dùng: giữ khóa dòng đơn 1, rồi xin khóa mà bước nạp đang giữ
    const user = db.transaction().execute(async (u) => {
      await sql`SELECT Id FROM dbo.SalesOrder WITH (UPDLOCK, ROWLOCK) WHERE Id = ${id}`.execute(u);
      userLocked();
      await new Promise((r) => setTimeout(r, 1500));
      await sql`DECLARE @r INT; EXEC @r = sp_getapplock @Resource = 'MES_Order.BravoImport', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 12000; SELECT @r AS r`.execute(u);
      return 'xong';
    });
    const importing = repo.apply(async (state) => {
      await locked;
      return planImport(src, state, opts);
    });
    const [imp, usr] = await Promise.allSettled([importing, user]);
    expect(usr).toEqual({ status: 'fulfilled', value: 'xong' });
    expect(imp.status).toBe('rejected');
    expect(isDeadlock((imp as PromiseRejectedResult).reason)).toBe(true);
  });

  it('nhiều đơn, PO, ô hơn một lô ghi: mỗi PO nhận đúng màu cỡ của mình, số PO theo Id', async () => {
    const N = 130;
    const ns = Array.from({ length: N }, (_v, i) => i + 1);
    const src: BravoOrderSource = {
      orders: ns.map((n) => order(n)),
      pos: ns.map((n) => po(n)),
      cells: ns.flatMap((n) => [cell(n, 'P1', 'M', n), cell(n, 'P1', 'L', 1000 + n), cell(n, 'P1', 'XL', 2000 + n)]),
    };
    expect((await run(src)).applied).toMatchObject({ newOrders: N });
    const rows = await db
      .selectFrom('SalesOrder as o')
      .innerJoin('SalesOrderPo as p', 'p.SalesOrderId', 'o.Id')
      .select(['o.SourceProductId', 'p.Id', 'p.PoNumber', 'p.PoCode', 'p.Qty'])
      .where('o.SourceProductId', '>=', BASE + 1)
      .where('o.SourceProductId', '<=', BASE + N)
      .execute();
    expect(rows).toHaveLength(N);
    for (const r of rows) {
      const n = r.SourceProductId! - BASE;
      expect(r.PoNumber).toBe(`T${n}-P1`);
      expect(r.PoCode).toBe(`PO-A01-${String(r.Id).padStart(6, '0')}`);
      expect(r.Qty).toBe(3 * n + 3000);
    }
    const sample = rows.find((r) => r.SourceProductId === BASE + 127)!;
    expect((await cellsOf(sample.Id)).map((c) => [c.SizeName, c.Qty])).toEqual([
      ['M', 127],
      ['L', 1127],
      ['XL', 2127],
    ]);
    expect((await run(recopied(src))).applied).toMatchObject(NO_WRITE);
  });
});
