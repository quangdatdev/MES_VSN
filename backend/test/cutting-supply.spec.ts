import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { env } from '../src/config/env';
import { todayVN } from '../src/modules/cutting/cutting-progress.service';
import { supplyNoOf } from '../src/modules/cutting/cutting-supply.service';
import { CUTTING_DB } from '../src/modules/cutting/cutting.db';
import type { CuttingDb } from '../src/modules/cutting/cutting.types';
import { LineColorSizeFeed } from '../src/modules/order/line-color-size-feed.service';
import { ORDER_DB } from '../src/modules/order/order.db';
import type { OrderDb } from '../src/modules/order/order.types';
import { CORE_DB, type CoreDb } from '../src/platform/database/database.module';

// Phase 5.15 – Xác nhận cấp BTP (quyết định 13.8–13.10). Cần MES_Core, MES_Order, MES_Hr, MES_Cutting đã migrate và seed mẫu (chuyền
// A01-L03, A01-L05). Test tự tạo đơn hàng, kế hoạch đã xếp chuyền và phân màu cỡ, số cắt; xóa hết khi xong.
describe('Phase 5.15: Xác nhận cấp BTP', () => {
  let app: INestApplication;
  let order: OrderDb;
  let cutting: CuttingDb;
  let core: CoreDb;
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const STYLE = 'TEST-P515-BTP';
  const STYLE2 = 'TEST-P515-BTP2';
  const L3 = 'A01-L03';
  const L5 = 'A01-L05';
  const fx = { order: 0, orderA02: 0, p1: 0, p2: 0, p3: 0, pA02: 0, p1L3: 0, p1L5: 0 };
  const TODAY = todayVN();
  const addDays = (iso: string, n: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const YESTERDAY = addDays(TODAY, -1);
  const TOMORROW = addDays(TODAY, 1);
  const tokens = new Map<string, string>();

  async function tokenFor(username: string, branchCode: string) {
    const key = `${username}@${branchCode}`;
    if (tokens.has(key)) return tokens.get(key)!;
    const l = await api().post('/api/v1/auth/login').send({ username, password: env.demoPassword });
    const s = await api().post('/api/v1/auth/select-branch').set('Authorization', `Bearer ${l.body.preAuthToken}`).send({ branchCode });
    if (!s.body.accessToken) throw new Error(`Không chọn được ${branchCode} cho ${username}: ${JSON.stringify(s.body)}`);
    tokens.set(key, s.body.accessToken);
    return s.body.accessToken as string;
  }

  const insertId = async (db: any, table: string, values: object) => ((await db.insertInto(table).values(values).output('inserted.Id').executeTakeFirstOrThrow()) as { Id: number }).Id;

  async function dropFixture() {
    const supplies = cutting.selectFrom('CuttingSupply').select('Id').where('StyleCode', 'like', `${STYLE}%`);
    await cutting.deleteFrom('CuttingSupplyLine').where('CuttingSupplyId', 'in', supplies).execute();
    await cutting.deleteFrom('CuttingSupply').where('StyleCode', 'like', `${STYLE}%`).execute();
    const copies = cutting.selectFrom('CuttingPlan').select('Id').where('StyleCode', 'like', `${STYLE}%`);
    await cutting.deleteFrom('CuttingPlanDaily').where('CuttingPlanId', 'in', copies).execute();
    await cutting.deleteFrom('CuttingPlan').where('StyleCode', 'like', `${STYLE}%`).execute();
    const plans = (await order.selectFrom('ShipmentPlan').select('Id').where('StyleCode', 'like', `${STYLE}%`).execute()).map((p) => p.Id);
    if (plans.length) {
      const lines = order.selectFrom('ShipmentPlanLine').select('Id').where('ShipmentPlanId', 'in', plans);
      await order.deleteFrom('ShipmentPlanLineColorSize').where('ShipmentPlanLineId', 'in', lines).execute();
      await order.deleteFrom('ShipmentPlanLine').where('ShipmentPlanId', 'in', plans).execute();
      await order.deleteFrom('ShipmentPlanColorSize').where('ShipmentPlanId', 'in', plans).execute();
      await order.deleteFrom('ShipmentPlan').where('Id', 'in', plans).execute();
    }
    await order.deleteFrom('SalesOrder').where('StyleCode', 'like', `${STYLE}%`).execute();
  }

  /** Kế hoạch đã xếp chuyền: mỗi chuyền một dòng dàn chuyền, phân màu cỡ theo `cells` */
  async function plan(branch: string, orderId: number, no: string, style: string, lines: { line: string; cells: [string, string, number][] }[]) {
    const all = lines.flatMap((l) => l.cells);
    const byCell = new Map<string, number>();
    for (const [c, s, q] of all) byCell.set(`${c}|${s}`, (byCell.get(`${c}|${s}`) ?? 0) + q);
    const qty = [...byCell.values()].reduce((n, q) => n + q, 0);
    const id = await insertId(order, 'ShipmentPlan', {
      PlanNo: `TEST-P515-${no}`,
      SalesOrderId: orderId,
      CustomerName: 'KHÁCH TEST P515',
      StyleCode: style,
      ProductName: 'Áo test cấp BTP',
      PoBuyDate: `PO515 / ${no}`,
      PlanQty: qty,
      ShipDate: '2027-12-31',
      PlannerName: 'Test',
      StatusCode: 'SCHEDULED',
      BranchCode: branch,
    });
    let sort = 0;
    for (const [k, q] of byCell) {
      const [color, size] = k.split('|');
      await insertId(order, 'ShipmentPlanColorSize', { ShipmentPlanId: id, ColorName: color, SizeName: size, OriginalQty: q, PlanQty: q, SortOrder: sort++, BranchCode: branch });
    }
    const lineIds: number[] = [];
    for (const [m, l] of lines.entries()) {
      const lq = l.cells.reduce((n, [, , q]) => n + q, 0);
      const lineId = await insertId(order, 'ShipmentPlanLine', {
        ShipmentPlanId: id,
        LineCode: l.line,
        Qty: lq,
        AvgOutput: 100,
        StartDate: '2027-11-02',
        ProductionDays: 1,
        OffDays: 0,
        EndDate: '2027-11-02',
        StatusCode: 'ALLOCATED',
        SortOrder: m,
        BranchCode: branch,
      });
      lineIds.push(lineId);
      for (const [i, [color, size, q]] of l.cells.entries()) {
        await insertId(order, 'ShipmentPlanLineColorSize', { ShipmentPlanLineId: lineId, ColorName: color, SizeName: size, PlanQty: byCell.get(`${color}|${size}`), AssignedQty: q, SortOrder: i, BranchCode: branch });
      }
    }
    return { id, lineIds };
  }

  /** Số cắt của kế hoạch (bản chép ở MES_Cutting như màn Đồng bộ tiến độ cắt tạo) */
  async function cuts(planId: number, rows: [string, string, number][], date = YESTERDAY) {
    const p = await order.selectFrom('ShipmentPlan').selectAll().where('Id', '=', planId).executeTakeFirstOrThrow();
    let copy = await cutting.selectFrom('CuttingPlan').select('Id').where('ShipmentPlanId', '=', planId).executeTakeFirst();
    if (!copy) {
      copy = {
        Id: await insertId(cutting, 'CuttingPlan', {
          ShipmentPlanId: planId,
          SourceCreatedAt: p.CreatedAt,
          PlanNo: p.PlanNo,
          CustomerName: p.CustomerName,
          StyleCode: p.StyleCode,
          ProductName: p.ProductName,
          PoBuyDate: p.PoBuyDate,
          ShipDate: p.ShipDate,
          PlanQty: p.PlanQty,
          SourceSyncedAt: new Date(),
          BranchCode: p.BranchCode,
        }),
      };
    }
    for (const [color, size, qty] of rows) {
      await insertId(cutting, 'CuttingPlanDaily', { CuttingPlanId: copy.Id, ColorName: color, SizeName: size, EntryDate: date, Qty: qty, BranchCode: p.BranchCode });
    }
  }

  async function createFixture() {
    await dropFixture();
    const so = (branch: string, style: string) =>
      insertId(order, 'SalesOrder', { OrderNo: `TEST-P515-${branch}-${style.slice(-4)}`, CustomerName: 'KHÁCH TEST P515', StyleCode: style, ProductName: 'Áo test cấp BTP', Qty: 5000, UnitName: 'Chiếc', ShipDate: '2027-12-31', StatusCode: 'PLANNING', BranchCode: branch });
    fx.order = await so('A01', STYLE);
    fx.orderA02 = await so('A02', STYLE);
    const o2 = await so('A01', STYLE2);
    // Một mã hàng ở hai kế hoạch (khác PO/Buy date) cùng chuyền L3: SL kế hoạch của dòng cấp cộng hai kế hoạch (Q4)
    const p1 = await plan('A01', fx.order, 'P1', STYLE, [
      { line: L3, cells: [['RED', 'S', 100], ['RED', 'M', 100]] },
      { line: L5, cells: [['RED', 'S', 50]] },
    ]);
    fx.p1 = p1.id;
    [fx.p1L3, fx.p1L5] = p1.lineIds;
    fx.p2 = (await plan('A01', fx.order, 'P2', STYLE, [{ line: L3, cells: [['RED', 'S', 40]] }])).id;
    fx.p3 = (await plan('A01', o2, 'P3', STYLE2, [{ line: L3, cells: [['GREEN', 'L', 10]] }])).id;
    fx.pA02 = (await plan('A02', fx.orderA02, 'PA2', STYLE, [{ line: 'A02-L01', cells: [['RED', 'S', 70]] }])).id;
    // Số đã cắt (SL đồng bộ) theo mã hàng, màu, cỡ: cộng mọi kế hoạch
    await cuts(fx.p1, [['RED', 'S', 120], ['RED', 'M', 60]]);
    await cuts(fx.p2, [['RED', 'S', 30]]);
    await cuts(fx.p3, [['GREEN', 'L', 10]]);
  }

  const key = (line: string, colorName: string, sizeName: string, style = STYLE) => ({ line, style, colorName, sizeName });
  const cell = (line: string, colorName: string, sizeName: string, dayQty: number | null, style = STYLE) => ({ ...key(line, colorName, sizeName, style), dayQty });
  const save = (token: string, date: string, items: object[], extra: object = {}) =>
    api()
      .put('/api/v1/cutting/supply')
      .set(auth(token))
      .send({ date, items, styles: [...new Set(items.map((i: any) => i.style))].concat(items.length ? [] : [STYLE]), ...extra });
  const sheet = async (token: string, date: string, items: object[]) => (await api().post('/api/v1/cutting/supply/sheet').set(auth(token)).send({ date, items }).expect(200)).body;
  const rowOf = (body: any, line: string, colorName: string, sizeName: string) => body.rows.find((r: any) => r.lineCode === line && r.colorName === colorName && r.sizeName === sizeName);
  const supplyOf = (date: string, style = STYLE) => cutting.selectFrom('CuttingSupply').selectAll().where('StyleCode', '=', style).where('SupplyDate', '=', date as any).where('BranchCode', '=', 'A01').executeTakeFirst();
  const list = async (token: string, extra = '') => (await api().get(`/api/v1/cutting/supply?style=${STYLE}&pageSize=50${extra}`).set(auth(token)).expect(200)).body;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    order = app.get<OrderDb>(ORDER_DB);
    cutting = app.get<CuttingDb>(CUTTING_DB);
    core = app.get<CoreDb>(CORE_DB);
    await createFixture();
  }, 60_000);

  afterAll(async () => {
    await dropFixture();
    await app.close();
  });

  it('LineColorSizeFeed: cộng phân bổ mọi kế hoạch cùng mã hàng theo chuyền, màu, cỡ; lọc ĐVCS theo phiên, A00 thấy mọi ĐVCS', async () => {
    const feed = app.get(LineColorSizeFeed);
    const scope = (branchCode: string, isAggregate = false) => ({ userId: 0, branchCode, isAggregate, access: {} as any });
    const a01 = await feed.allocationsOf(scope('A01'), { lineCodes: [L3, L5], styleCode: STYLE });
    expect(a01.map((r) => [r.lineCode, r.colorName, r.sizeName, r.planQty])).toEqual([
      [L3, 'RED', 'S', 140],
      [L3, 'RED', 'M', 100],
      [L5, 'RED', 'S', 50],
    ]);
    expect((await feed.allocationsOf(scope('A01'), { lineCodes: ['A02-L01'], styleCode: STYLE })).length).toBe(0);
    expect((await feed.allocationsOf(scope('A00', true), { lineCodes: ['A02-L01'], styleCode: STYLE }))[0]).toMatchObject({ branchCode: 'A02', planQty: 70 });
    expect((await feed.stylesOf(scope('A01'), L3)).map((s) => s.styleCode)).toEqual(expect.arrayContaining([STYLE, STYLE2]));
  });

  it('ô chọn của form: mã hàng theo chuyền, màu cỡ theo chuyền + mã hàng', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const styles = (await api().get(`/api/v1/cutting/supply/options/styles?line=${L5}`).set(auth(planner)).expect(200)).body;
    expect(styles.map((s: any) => s.styleCode)).toContain(STYLE);
    expect(styles.map((s: any) => s.styleCode)).not.toContain(STYLE2);
    const cs = (await api().get(`/api/v1/cutting/supply/options/color-sizes?line=${L3}&style=${STYLE}`).set(auth(planner)).expect(200)).body;
    expect(cs).toEqual([
      { colorName: 'RED', sizeName: 'S' },
      { colorName: 'RED', sizeName: 'M' },
    ]);
    await api().get('/api/v1/cutting/supply/options/styles?line=bad code').set(auth(planner)).expect(422);
  });

  it('lưới nhập: SL kế hoạch theo chuyền, SL đồng bộ theo mã hàng màu cỡ; lưu theo Ngày cấp, gom một lệnh mỗi ngày mỗi mã hàng', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const keys = [key(L3, 'RED', 'S'), key(L3, 'RED', 'M'), key(L5, 'RED', 'S')];
    const s0 = await sheet(planner, TODAY, keys);
    expect(rowOf(s0, L3, 'RED', 'S')).toMatchObject({ planQty: 140, syncQty: 150, suppliedQty: 0, dayQty: null, remainQty: 140, otherLinesQty: 0, inPlan: true });
    expect(rowOf(s0, L3, 'RED', 'M')).toMatchObject({ planQty: 100, syncQty: 60, remainQty: 100 });
    expect(rowOf(s0, L5, 'RED', 'S')).toMatchObject({ planQty: 50, syncQty: 150 });
    expect(s0.supplies).toEqual([]);

    // Hai chuyền cùng mã hàng cùng ngày: một lệnh
    const r1 = (await save(planner, TODAY, [cell(L3, 'RED', 'S', 50), cell(L5, 'RED', 'S', 30)], { note: 'Cấp đợt 1' }).expect(200)).body;
    expect(r1.saved).toHaveLength(1);
    expect(r1.saved[0]).toMatchObject({ styleCode: STYLE, created: true, removed: false });
    const today = (await supplyOf(TODAY))!;
    expect(today.SupplyNo).toBe(supplyNoOf(today.SupplySeq, TODAY));
    expect(today.SupplyNo).toMatch(/^\d{3}\/\d{6}\/XBTP$/);
    expect(today).toMatchObject({ StatusCode: 'PENDING', Note: 'Cấp đợt 1', ConfirmedBy: null });
    expect(today.CreatorName).toBeTruthy();
    // Ngày khác: lệnh khác, số kế tiếp
    await save(planner, YESTERDAY, [cell(L3, 'RED', 'S', 20)]).expect(200);
    const yday = (await supplyOf(YESTERDAY))!;
    expect(yday.Id).not.toBe(today.Id);
    if (yday.SupplyYear === today.SupplyYear) expect(yday.SupplySeq).toBe(today.SupplySeq + 1);
    // Lưu thêm cùng ngày, cùng mã hàng: gộp vào lệnh đã có
    await save(planner, TODAY, [cell(L3, 'RED', 'M', 10)]).expect(200);
    expect((await cutting.selectFrom('CuttingSupply').select('Id').where('StyleCode', '=', STYLE).where('SupplyDate', '=', TODAY as any).execute()).length).toBe(1);
    expect((await cutting.selectFrom('CuttingSupplyLine').select('Id').where('CuttingSupplyId', '=', today.Id).execute()).length).toBe(3);

    // Đã cấp = các ngày khác; Trong ngày = Ngày cấp đang xem; Còn lại = KH − đã cấp − trong ngày (Q3)
    const s1 = await sheet(planner, TODAY, keys);
    expect(rowOf(s1, L3, 'RED', 'S')).toMatchObject({ planQty: 140, suppliedQty: 20, dayQty: 50, remainQty: 70, otherLinesQty: 30 });
    expect(s1.supplies).toEqual([expect.objectContaining({ id: today.Id, statusCode: 'PENDING' })]);
    // Đổi Ngày cấp: chỉ Đã cấp, Trong ngày, Còn lại đổi theo ngày; SL kế hoạch, SL đồng bộ giữ
    const s2 = await sheet(planner, YESTERDAY, keys);
    expect(rowOf(s2, L3, 'RED', 'S')).toMatchObject({ planQty: 140, syncQty: 150, suppliedQty: 50, dayQty: 20, remainQty: 70 });
    expect(rowOf(s2, L5, 'RED', 'S')).toMatchObject({ suppliedQty: 30, dayQty: null });

    // Lưới lệnh cấp và chi tiết
    const body = await list(planner);
    const row = body.items.find((r: any) => r.id === today.Id);
    expect(row).toMatchObject({ supplyNo: today.SupplyNo, supplyDate: TODAY, styleCode: STYLE, branchCode: 'A01', statusCode: 'PENDING', dayQty: 90, note: 'Cấp đợt 1', confirmerName: null });
    const d = (await api().get(`/api/v1/cutting/supply/${today.Id}`).set(auth(planner)).expect(200)).body;
    expect(d).toMatchObject({ supplyNo: today.SupplyNo, supplyDate: TODAY, canEdit: true, canDelete: true, canConfirm: true, canUnconfirm: false });
    expect(d.rows.map((r: any) => [r.lineCode, r.colorName, r.sizeName, r.dayQty])).toEqual([
      [L3, 'RED', 'S', 50],
      [L5, 'RED', 'S', 30],
      [L3, 'RED', 'M', 10],
    ]);
    expect(d.rows[0].lineName).toBeTruthy();
    const logs = await core.selectFrom('SysAuditLog').select('ActionCode').where('EntityType', '=', 'CuttingSupply').where('EntityId', '=', String(today.Id)).execute();
    expect(logs.map((l) => l.ActionCode).sort()).toEqual(['CREATE', 'UPDATE']);
  });

  it('kiểm khi lưu: Còn lại âm, vượt SL đồng bộ, ngoài phân bổ, ngày tương lai, số âm, gửi trùng; giảm số luôn được', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    // L5 RED/S: KH 50, đã cấp 30 hôm nay → 51 là vượt
    expect((await save(planner, TODAY, [cell(L5, 'RED', 'S', 51)]).expect(422)).body.error.message).toContain('Số lượng còn lại âm');
    // RED/S đã cắt 150, đã cấp 50 + 20 + 30 = 100: L3 hôm nay 50 → 110 thì tổng 160 > 150 (L3 vẫn trong KH 140)
    expect((await save(planner, TODAY, [cell(L3, 'RED', 'S', 110)]).expect(422)).body.error.message).toContain('số lượng đồng bộ');
    expect((await save(planner, TODAY, [cell(L5, 'RED', 'M', 5)]).expect(422)).body.error.message).toContain('Phân bổ màu cỡ');
    await save(planner, TOMORROW, [cell(L3, 'RED', 'S', 1)]).expect(422);
    await save(planner, TODAY, [cell(L3, 'RED', 'S', -1)]).expect(422);
    await save(planner, TODAY, [cell(L3, 'RED', 'S', 1), cell(L3, 'red', 's', 2)]).expect(422);
    // Không lần nào ghi
    expect((await sheet(planner, TODAY, [key(L3, 'RED', 'S')])).rows[0].dayQty).toBe(50);
    // Kế hoạch giảm sau khi cấp: vẫn giảm được số đã cấp
    await order.updateTable('ShipmentPlanLineColorSize').set({ AssignedQty: 10 }).where('ShipmentPlanLineId', '=', fx.p1L5).execute();
    try {
      const s = await sheet(planner, TODAY, [key(L5, 'RED', 'S')]);
      expect(s.rows[0]).toMatchObject({ planQty: 10, dayQty: 30, remainQty: -20 });
      await save(planner, TODAY, [cell(L5, 'RED', 'S', 31)]).expect(422);
      await save(planner, TODAY, [cell(L5, 'RED', 'S', 25)]).expect(200);
      await save(planner, TODAY, [cell(L5, 'RED', 'S', 30)]).expect(422);
    } finally {
      await order.updateTable('ShipmentPlanLineColorSize').set({ AssignedQty: 50 }).where('ShipmentPlanLineId', '=', fx.p1L5).execute();
    }
    // Phân bổ của dòng bị bỏ hẳn sau khi cấp: dòng vẫn giảm được số, tăng thì 422 (review 5.15 M2)
    await order.updateTable('ShipmentPlanLineColorSize').set({ AssignedQty: 0 }).where('ShipmentPlanLineId', '=', fx.p1L5).execute();
    try {
      expect((await sheet(planner, TODAY, [key(L5, 'RED', 'S')])).rows[0]).toMatchObject({ inPlan: false, planQty: 0, dayQty: 25 });
      await save(planner, TODAY, [cell(L5, 'RED', 'S', 20)]).expect(200);
      expect((await save(planner, TODAY, [cell(L5, 'RED', 'S', 21)]).expect(422)).body.error.message).toContain('Phân bổ màu cỡ');
    } finally {
      await order.updateTable('ShipmentPlanLineColorSize').set({ AssignedQty: 50 }).where('ShipmentPlanLineId', '=', fx.p1L5).execute();
    }
    await save(planner, TODAY, [cell(L5, 'RED', 'S', 30)]).expect(200);
  });

  it('Xác nhận cấp: Cấp 1 phần khi còn dòng có Còn lại > 0, Cấp toàn phần khi hết; lệnh đã xác nhận không sửa, không xóa; Hủy duyệt mở lại', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const today = (await supplyOf(TODAY))!;
    const c = (await api().post(`/api/v1/cutting/supply/${today.Id}/confirm`).set(auth(planner)).expect(200)).body;
    expect(c).toMatchObject({ statusCode: 'PARTIAL', canEdit: false, canDelete: false, canConfirm: false, canUnconfirm: true });
    expect(c.confirmerName).toBeTruthy();
    await api().post(`/api/v1/cutting/supply/${today.Id}/confirm`).set(auth(planner)).expect(409);
    // Lưới nhập đánh dấu dòng của lệnh đã xác nhận (giao diện không tự so Trạng thái, Mã hàng có thể bị che)
    const locked = await sheet(planner, TODAY, [key(L3, 'RED', 'S'), key(L3, 'GREEN', 'L', STYLE2)]);
    expect(locked.rows.map((r: any) => r.locked)).toEqual([true, false]);
    expect(locked.supplies[0]).toMatchObject({ id: today.Id, locked: true });
    expect((await save(planner, TODAY, [cell(L3, 'RED', 'S', 49)]).expect(409)).body.error.message).toContain('Hủy duyệt');
    // Ghi chú cũng là sửa lệnh
    await save(planner, TODAY, [], { note: 'khác', styles: [STYLE] }).expect(409);
    await api().delete(`/api/v1/cutting/supply/${today.Id}`).set(auth(planner)).expect(409);
    const u = (await api().post(`/api/v1/cutting/supply/${today.Id}/unconfirm`).set(auth(planner)).expect(200)).body;
    expect(u).toMatchObject({ statusCode: 'PENDING', confirmerName: null, canEdit: true });
    await api().post(`/api/v1/cutting/supply/${today.Id}/unconfirm`).set(auth(planner)).expect(409);

    // Cấp đủ L3 RED/S ở lệnh hôm qua (KH 140: hôm nay 50 + hôm qua 90), thêm số cắt cho đủ: lệnh hôm qua chỉ có dòng này → Cấp toàn phần
    await cuts(fx.p1, [['RED', 'S', 100]], TODAY);
    await save(planner, YESTERDAY, [cell(L3, 'RED', 'S', 90)]).expect(200);
    const yday = (await supplyOf(YESTERDAY))!;
    expect((await api().post(`/api/v1/cutting/supply/${yday.Id}/confirm`).set(auth(planner)).expect(200)).body.statusCode).toBe('FULL');
    const log = await core.selectFrom('SysAuditLog').select(['ActionCode', 'NewValue']).where('EntityType', '=', 'CuttingSupply').where('EntityId', '=', String(yday.Id)).orderBy('Id', 'desc').executeTakeFirstOrThrow();
    expect(log.ActionCode).toBe('CONFIRM');
    await api().post(`/api/v1/cutting/supply/${yday.Id}/unconfirm`).set(auth(planner)).expect(200);
    // Lọc theo trạng thái, số lệnh
    expect((await list(planner, '&status=PENDING')).items.some((r: any) => r.id === yday.Id)).toBe(true);
    expect((await list(planner, `&supplyNo=${encodeURIComponent(yday.SupplyNo)}`)).items.map((r: any) => r.id)).toEqual([yday.Id]);
  });

  it('đưa mọi ô của lệnh về 0 thì lệnh tự bỏ; Xóa lệnh Chưa cấp xóa cả số cấp', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const yday = (await supplyOf(YESTERDAY))!;
    const r = (await save(planner, YESTERDAY, [cell(L3, 'RED', 'S', 0)]).expect(200)).body;
    expect(r.saved[0]).toMatchObject({ id: yday.Id, removed: true });
    expect(await supplyOf(YESTERDAY)).toBeUndefined();
    await save(planner, YESTERDAY, [cell(L3, 'RED', 'S', 5)]).expect(200);
    const again = (await supplyOf(YESTERDAY))!;
    expect((await api().delete(`/api/v1/cutting/supply/${again.Id}`).set(auth(planner)).expect(200)).body).toEqual({ removed: true });
    expect(await supplyOf(YESTERDAY)).toBeUndefined();
    expect(await cutting.selectFrom('CuttingSupplyLine').select('Id').where('CuttingSupplyId', '=', again.Id).executeTakeFirst()).toBeUndefined();
  });

  it('số lệnh không trùng khi hai lần tạo lệnh chạy cùng lúc', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    await Promise.all([save(planner, TODAY, [cell(L3, 'GREEN', 'L', 3, STYLE2)]).expect(200), save(planner, YESTERDAY, [cell(L3, 'RED', 'M', 2)]).expect(200)]);
    const a = (await supplyOf(TODAY, STYLE2))!;
    const b = (await supplyOf(YESTERDAY))!;
    expect(a.SupplyNo).not.toBe(b.SupplyNo);
    if (a.SupplyYear === b.SupplyYear) expect(a.SupplySeq).not.toBe(b.SupplySeq);
    await api().delete(`/api/v1/cutting/supply/${a.Id}`).set(auth(planner)).expect(200);
    await api().delete(`/api/v1/cutting/supply/${b.Id}`).set(auth(planner)).expect(200);
  });

  it('Phân bổ màu cỡ, Xếp chuyền không giảm phần giao xuống dưới số BTP đã cấp (Q12)', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    // L5 RED/S đã cấp 30 (hôm nay): giao 20 thì 409, giao 30 được
    const put = (assigned: number) =>
      api()
        .put(`/api/v1/order/color-size/${fx.p1}`)
        .set(auth(planner))
        .send({
          rows: [
            { lineId: fx.p1L3, colorName: 'RED', sizeName: 'S', assignedQty: 100 },
            { lineId: fx.p1L3, colorName: 'RED', sizeName: 'M', assignedQty: 100 },
            { lineId: fx.p1L5, colorName: 'RED', sizeName: 'S', assignedQty: assigned },
          ],
        });
    expect((await put(20).expect(409)).body.error.message).toContain('Xác nhận cấp BTP');
    await put(30).expect(200);
    await put(50).expect(200);
    // Xếp chuyền bỏ dòng L5 (phân màu cỡ của dòng bị xóa theo): 409
    const lp = (await api().get(`/api/v1/order/line-plans/${fx.p1}`).set(auth(planner)).expect(200)).body;
    const keep = lp.lines.filter((l: any) => l.lineCode === L3).map((l: any) => ({ id: l.id, lineCode: l.lineCode, qty: l.qty, avgOutput: l.avgOutput, startDate: l.startDate }));
    expect((await api().put(`/api/v1/order/line-plans/${fx.p1}/lines`).set(auth(planner)).send({ lines: keep }).expect(409)).body.error.message).toContain('Xác nhận cấp BTP');
    expect(await order.selectFrom('ShipmentPlanLine').select('Id').where('Id', '=', fx.p1L5).executeTakeFirst()).toBeTruthy();
  });

  it('phân quyền: A00 chỉ đọc; Giám đốc không sửa; Trưởng chuyền không xem; ĐVCS khác 404; tạo lệnh mới cần quyền Thêm', async () => {
    const today = (await supplyOf(TODAY))!;
    const agg = await tokenFor('admin', 'A00');
    expect((await list(agg)).items.some((r: any) => r.id === today.Id)).toBe(true);
    const d = (await api().get(`/api/v1/cutting/supply/${today.Id}`).set(auth(agg)).expect(200)).body;
    expect(d).toMatchObject({ canEdit: false, canConfirm: false, canDelete: false });
    expect(rowOf(d, L3, 'RED', 'S')).toMatchObject({ planQty: 140, dayQty: 50 });
    expect((await save(agg, TODAY, [cell(L3, 'RED', 'S', 1)]).expect(403)).body.error.code).toBe('AGGREGATE_READ_ONLY');
    await api().post('/api/v1/cutting/supply/sheet').set(auth(agg)).send({ date: TODAY, items: [key(L3, 'RED', 'S')] }).expect(403);
    await api().post(`/api/v1/cutting/supply/${today.Id}/confirm`).set(auth(agg)).expect(403);
    const director = await tokenFor('giamdoc', 'A01');
    await list(director);
    await save(director, TODAY, [cell(L3, 'RED', 'S', 1)]).expect(403);
    // Lấy token trước khi dựng request: supertest dùng chung server, lần đăng nhập xong sẽ đóng server của request đang dựng
    const leader = await tokenFor('truongchuyen.a', 'A01');
    await api().get('/api/v1/cutting/supply').set(auth(leader)).expect(403);
    const other = await tokenFor('admin', 'A02');
    await api().get(`/api/v1/cutting/supply/${today.Id}`).set(auth(other)).expect(404);
    await api().delete(`/api/v1/cutting/supply/${today.Id}`).set(auth(other)).expect(404);

    // Kế hoạch bị gỡ quyền Thêm: vẫn sửa được lệnh đã có, không tạo được lệnh mới
    const admin = await tokenFor('admin', 'A01');
    const roles = (await api().get('/api/v1/admin/roles').set(auth(admin))).body as { id: number; code: string }[];
    const planner = roles.find((r) => r.code === 'PLANNER')!.id;
    const perms = await core
      .selectFrom('SysPermission as p')
      .innerJoin('SysResource as r', 'r.Id', 'p.ResourceId')
      .select('p.Id')
      .where('r.Code', '=', 'cutting.supply')
      .where('p.ActionCode', '=', 'create')
      .executeTakeFirstOrThrow();
    await core.deleteFrom('SysRolePermission').where('RoleId', '=', planner).where('PermissionId', '=', perms.Id).execute();
    await core.updateTable('SysPermissionVersion').set((eb) => ({ Version: eb('Version', '+', 1 as any) }) as any).where('Id', '=', 1).execute();
    try {
      tokens.delete('kehoach.a@A01');
      const p = await tokenFor('kehoach.a', 'A01');
      await save(p, TODAY, [cell(L3, 'RED', 'S', 51)]).expect(200);
      await save(p, YESTERDAY, [cell(L3, 'RED', 'S', 1)]).expect(403);
    } finally {
      await core.insertInto('SysRolePermission').values({ RoleId: planner, PermissionId: perms.Id } as any).execute();
      await core.updateTable('SysPermissionVersion').set((eb) => ({ Version: eb('Version', '+', 1 as any) }) as any).where('Id', '=', 1).execute();
      tokens.delete('kehoach.a@A01');
    }
    await save(await tokenFor('kehoach.a', 'A01'), TODAY, [cell(L3, 'RED', 'S', 50)]).expect(200);
  });

  it('chính sách cột: SL kế hoạch bị Che thì Còn lại che; Số lượng cấp trong ngày Chỉ đọc thì không lưu được', async () => {
    const admin = await tokenFor('admin', 'A01');
    const roles = (await api().get('/api/v1/admin/roles').set(auth(admin))).body as { id: number; code: string }[];
    const matrix = (await api().get('/api/v1/admin/permissions').set(auth(admin))).body;
    const resourceId = matrix.modules.flatMap((m: any) => m.resources).find((r: any) => r.code === 'cutting.supply').id;
    const planner = roles.find((r) => r.code === 'PLANNER')!.id;
    const policy = (fieldCode: string, level: string | null) =>
      api().put(`/api/v1/admin/roles/${planner}/field-policies`).set(auth(admin)).send({ resourceId, policies: [{ fieldCode, accessLevel: level }] }).expect(200);
    await policy('planQty', 'MASKED');
    try {
      tokens.delete('kehoach.a@A01');
      const token = await tokenFor('kehoach.a', 'A01');
      const s = await sheet(token, TODAY, [key(L3, 'RED', 'S')]);
      expect(s.rows[0]).toMatchObject({ planQty: '***', remainQty: '***', dayQty: 50, syncQty: 250 });
      // Thông báo vượt không nêu số khi không xem được số lượng
      const msg = (await save(token, TODAY, [cell(L3, 'RED', 'S', 200)]).expect(422)).body.error.message as string;
      expect(msg).not.toContain('140');
      await policy('dayQty', 'READONLY');
      tokens.delete('kehoach.a@A01');
      const ro = await tokenFor('kehoach.a', 'A01');
      expect((await save(ro, TODAY, [cell(L3, 'RED', 'S', null)]).expect(403)).body.error.code).toBe('FIELD_READONLY');
    } finally {
      await policy('planQty', null);
      await policy('dayQty', null);
      tokens.delete('kehoach.a@A01');
    }
  });

  it('xuất file theo chính sách cột', async () => {
    const director = await tokenFor('giamdoc', 'A01');
    const res = await api().get(`/api/v1/cutting/supply/export?style=${STYLE}`).set(auth(director)).expect(200);
    const text = res.text ?? res.body?.toString('utf8');
    expect(text).toContain('Số lệnh cấp');
    expect(text).toContain('Chưa cấp');
  });
});
