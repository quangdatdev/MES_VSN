import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { env } from '../src/config/env';
import { ORDER_DB } from '../src/modules/order/order.db';
import type { OrderDb } from '../src/modules/order/order.types';
import { ScheduleFeed } from '../src/modules/order/schedule-feed.service';
import { todayVN } from '../src/modules/sewing/prep.service';
import { SEWING_DB } from '../src/modules/sewing/sewing.db';
import type { SewingDb } from '../src/modules/sewing/sewing.types';
import { CORE_DB, type CoreDb } from '../src/platform/database/database.module';

// Phase 5.16 – Kế hoạch may (quyết định 14.1–14.3). Cần MES_Core, MES_Order, MES_Hr, MES_Sewing đã migrate và seed mẫu (chuyền A01-L03,
// A01-L05, A02-L01). Test tự tạo đơn hàng (Chi nhánh FOB A02), kế hoạch xuất hàng của A01 đã xếp chuyền; xóa hết khi xong.
describe('Phase 5.16: Kế hoạch may', () => {
  let app: INestApplication;
  let order: OrderDb;
  let sewing: SewingDb;
  let core: CoreDb;
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const STYLE = 'TEST-P516-KHM';
  const L3 = 'A01-L03';
  const L5 = 'A01-L05';
  const TODAY = todayVN();
  const addDays = (iso: string, n: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const YESTERDAY = addDays(TODAY, -1);
  const TOMORROW = addDays(TODAY, 1);
  const fx = { order: 0, orderNoPlan: 0, plan: 0, planA02: 0, l3: 0, l5: 0, later: 0, old: 0, a02: 0 };
  const created = new Map<number, string>();
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
    const headers = sewing.selectFrom('SewingDayPlanItem').select('SewingDayPlanId').where('StyleCode', 'like', `${STYLE}%`);
    const ids = (await headers.execute()).map((h) => h.SewingDayPlanId);
    await sewing.deleteFrom('SewingDayPlanItem').where('StyleCode', 'like', `${STYLE}%`).execute();
    if (ids.length) await sewing.deleteFrom('SewingDayPlan').where('Id', 'in', ids).execute();
    // Bản ghi chuyền × ngày không còn dòng nào của các ngày thử (Chốt tạo cho chuyền thử)
    await sewing
      .deleteFrom('SewingDayPlan')
      .where('LineCode', 'in', [L3, L5, 'A02-L01'])
      .where('PlanDate', 'in', [YESTERDAY, TODAY, TOMORROW] as any)
      .where(({ not, exists, selectFrom }) => not(exists(selectFrom('SewingDayPlanItem as i').select('i.Id').whereRef('i.SewingDayPlanId', '=', 'SewingDayPlan.Id'))))
      .execute();
    const plans = (await order.selectFrom('ShipmentPlan').select('Id').where('StyleCode', 'like', `${STYLE}%`).execute()).map((p) => p.Id);
    if (plans.length) {
      await order.deleteFrom('ShipmentPlanLine').where('ShipmentPlanId', 'in', plans).execute();
      await order.deleteFrom('ShipmentPlan').where('Id', 'in', plans).execute();
    }
    await order.deleteFrom('SalesOrder').where('StyleCode', 'like', `${STYLE}%`).execute();
  }

  async function line(planId: number, branch: string, lineCode: string, qty: number, start: string, end: string, outEnd: string | null, sort: number) {
    const id = await insertId(order, 'ShipmentPlanLine', {
      ShipmentPlanId: planId,
      LineCode: lineCode,
      Qty: qty,
      AvgOutput: 50,
      StartDate: start,
      ProductionDays: 5,
      OffDays: 0,
      EndDate: end,
      OutStartDate: addDays(start, 3),
      OutEndDate: outEnd,
      StatusCode: 'PLANNED',
      SortOrder: sort,
      BranchCode: branch,
    });
    const r = await order.selectFrom('ShipmentPlanLine').select('CreatedAt').where('Id', '=', id).executeTakeFirstOrThrow();
    created.set(id, new Date(r.CreatedAt).toISOString());
    return id;
  }

  async function createFixture() {
    await dropFixture();
    const so = (no: string, cm: number | null) =>
      insertId(order, 'SalesOrder', { OrderNo: `TEST-P516-${no}`, CustomerName: 'KHÁCH TEST P516', StyleCode: STYLE, ProductName: 'Áo test kế hoạch may', Qty: 5000, UnitName: 'Chiếc', CmPrice: cm, ShipDate: '2027-12-31', StatusCode: 'PLANNING', BranchCode: 'A02' });
    // Đơn của A02 (Chi nhánh FOB) may ở A01: A01 có kế hoạch xuất hàng của đơn nên sửa được Giá CM (quyết định 14.3)
    fx.order = await so('SO1', 2.5);
    fx.orderNoPlan = await so('SO2', 1);
    const plan = (branch: string, no: string, qty: number) =>
      insertId(order, 'ShipmentPlan', {
        PlanNo: `TEST-P516-${no}`,
        SalesOrderId: fx.order,
        CustomerName: 'KHÁCH TEST P516',
        StyleCode: STYLE,
        ProductName: 'Áo test kế hoạch may',
        PoBuyDate: `PO516 / ${no}`,
        PlanQty: qty,
        CmPrice: 2.5,
        ShipDate: '2027-12-31',
        PlannerName: 'Test',
        StatusCode: 'SCHEDULED',
        BranchCode: branch,
      });
    fx.plan = await plan('A01', 'P1', 1000);
    fx.planA02 = await plan('A02', 'PA2', 100);
    fx.l3 = await line(fx.plan, 'A01', L3, 300, addDays(TODAY, -2), addDays(TODAY, 5), addDays(TODAY, 8), 0);
    fx.l5 = await line(fx.plan, 'A01', L5, 100, addDays(TODAY, -2), addDays(TODAY, 1), addDays(TODAY, 4), 1);
    // Vào chuyền sau 20 ngày: không có trong lưới của hôm nay, Thêm dòng được
    fx.later = await line(fx.plan, 'A01', L3, 200, addDays(TODAY, 20), addDays(TODAY, 25), addDays(TODAY, 28), 2);
    // Dòng rất cũ chưa có Kết thúc ra chuyền: ngày kết thúc = Kết thúc vào chuyền + số ngày ra chuyền của lịch (mặc định 3)
    fx.old = await line(fx.plan, 'A01', L5, 50, addDays(TODAY, -10), addDays(TODAY, -5), null, 3);
    fx.a02 = await line(fx.planA02, 'A02', 'A02-L01', 100, addDays(TODAY, -2), addDays(TODAY, 5), addDays(TODAY, 8), 0);
  }

  const item = (lineId: number, values: object) => ({ lineId, lineCreatedAt: created.get(lineId), ...values });
  const save = (token: string, date: string, items: object[], extra: object = {}) => api().put('/api/v1/sewing/plan').set(auth(token)).send({ date, items, ...extra });
  const view = async (token: string, date: string, query = '') => (await api().get(`/api/v1/sewing/plan?date=${date}${query}`).set(auth(token)).expect(200)).body;
  const rowOf = (body: any, lineId: number) => body.items.find((r: any) => r.lineId === lineId);

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    order = app.get<OrderDb>(ORDER_DB);
    sewing = app.get<SewingDb>(SEWING_DB);
    core = app.get<CoreDb>(CORE_DB);
    await createFixture();
  }, 60_000);

  afterAll(async () => {
    await dropFixture();
    await app.close();
  });

  it('ScheduleFeed.dayPlanLines: dòng đang chạy ở ngày, Kết thúc ra chuyền trống thì theo lịch, lọc ĐVCS theo phiên', async () => {
    const feed = app.get(ScheduleFeed);
    const scope = (branchCode: string, isAggregate = false) => ({ userId: 0, branchCode, isAggregate, access: {} as any });
    const today = await feed.dayPlanLines(scope('A01'), { lineCodes: [L3, L5], activeOn: TODAY });
    const mine = today.filter((l) => l.styleCode === STYLE).map((l) => l.id);
    expect(mine).toEqual(expect.arrayContaining([fx.l3, fx.l5]));
    expect(mine).not.toContain(fx.later);
    expect(mine).not.toContain(fx.old);
    const byId = await feed.dayPlanLines(scope('A01'), { ids: [fx.old, fx.a02] });
    expect(byId.map((l) => l.id)).toEqual([fx.old]);
    expect(byId[0]).toMatchObject({ endDate: addDays(TODAY, -2), poBuyDate: 'PO516 / P1', cmPrice: 2.5, qty: 50 });
    // Ngày cũ của dòng không có Kết thúc ra chuyền: lọc lại theo lịch
    expect((await feed.dayPlanLines(scope('A01'), { lineCodes: [L5], activeOn: addDays(TODAY, -3) })).map((l) => l.id)).toContain(fx.old);
    expect((await feed.dayPlanLines(scope('A01'), { lineCodes: [L5], activeOn: addDays(TODAY, -1) })).map((l) => l.id)).not.toContain(fx.old);
    expect((await feed.dayPlanLines(scope('A00', true), { ids: [fx.a02] }))[0]).toMatchObject({ branchCode: 'A02' });
  });

  it('lưới của ngày: dòng đang chạy theo đơn vị phòng ban, số từ Xếp chuyền, giờ mặc định; Thêm dòng qua options và extra', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const lines = (await api().get('/api/v1/me/lines').set(auth(planner)).expect(200)).body as { code: string; workshopCode: string | null; ancestors?: { code: string }[] }[];
    const l3 = lines.find((l) => l.code === L3)!;
    expect(l3.ancestors?.length).toBeGreaterThan(0);
    const all = await view(planner, TODAY);
    expect(all.editableDay).toBe(true);
    expect(rowOf(all, fx.l3)).toMatchObject({
      lineCode: L3,
      styleCode: STYLE,
      poBuyDate: 'PO516 / P1',
      cmPrice: 2.5,
      startDate: addDays(TODAY, -2),
      endDate: addDays(TODAY, 8),
      planQty: 300,
      deliveredQty: 0,
      remainQty: 300,
      linemapQty: null,
      dayQty: null,
      planRevenue: null,
      startTime: '07:30',
      endTime: '17:10',
      locked: false,
      canEdit: true,
    });
    expect(rowOf(all, fx.later)).toBeUndefined();
    expect(rowOf(all, fx.a02)).toBeUndefined();
    // Đơn vị là một nhánh của cây (bộ phận cha gốc nhất của L3): có L3; chọn chính chuyền L5 thì không có L3
    const root = l3.ancestors![0].code;
    expect(rowOf(await view(planner, TODAY, `&dept=${root}`), fx.l3)).toBeTruthy();
    const onlyL5 = await view(planner, TODAY, `&dept=${L5}`);
    expect(rowOf(onlyL5, fx.l3)).toBeUndefined();
    expect(rowOf(onlyL5, fx.l5)).toBeTruthy();
    // Thêm dòng: chọn trong mọi dòng dàn chuyền của chuyền, rồi tải lưới kèm extra
    const options = (await api().get(`/api/v1/sewing/plan/options?dept=${L3}`).set(auth(planner)).expect(200)).body as any[];
    expect(options.map((o) => o.lineId)).toEqual(expect.arrayContaining([fx.l3, fx.later]));
    expect(options.find((o) => o.lineId === fx.later)).toMatchObject({ styleCode: STYLE, poBuyDate: 'PO516 / P1', planQty: 200 });
    expect(rowOf(await view(planner, TODAY, `&extra=${fx.later}`), fx.later)).toMatchObject({ planQty: 200, canEdit: true });
    // Dòng của ĐVCS khác không thêm được
    expect(rowOf(await view(planner, TODAY, `&extra=${fx.a02}`), fx.a02)).toBeUndefined();
    await api().get(`/api/v1/sewing/plan?date=${TODAY}&dept=bad code`).set(auth(planner)).expect(422);
  });

  it('Cập nhật: lưu theo ngày, Đã giao cộng các ngày ≤ ngày xem, Doanh số = linemap × Giá CM; không giao vượt Tổng kế hoạch; giờ, ngày đã qua', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    await save(planner, TODAY, [item(fx.l3, { linemapQty: 180, dayQty: 200, startTime: '07:00', endTime: '16:30' }), item(fx.l5, { dayQty: 40 })]).expect(200);
    const t = await view(planner, TODAY);
    expect(rowOf(t, fx.l3)).toMatchObject({ linemapQty: 180, dayQty: 200, deliveredQty: 200, remainQty: 100, planRevenue: 450, startTime: '07:00', endTime: '16:30', saved: true, otherBefore: 0, otherAfter: 0 });
    // Ngày sau: Đã giao gồm hôm nay
    await save(planner, TOMORROW, [item(fx.l3, { dayQty: 50 })]).expect(200);
    const n = await view(planner, TOMORROW);
    expect(rowOf(n, fx.l3)).toMatchObject({ dayQty: 50, deliveredQty: 250, remainQty: 50, otherBefore: 200, startTime: '07:30' });
    expect(rowOf(await view(planner, TODAY), fx.l3)).toMatchObject({ deliveredQty: 200, otherAfter: 50 });
    // Không giao vượt (kể cả do ngày sau đã lập trước): 200 + 50 + 51 > 300
    const over = (await save(planner, TODAY, [item(fx.l3, { dayQty: 251 })]).expect(422)).body.error;
    expect(over.message).toContain('Xếp chuyền');
    await save(planner, TODAY, [item(fx.l3, { dayQty: 250 })]).expect(200);
    // Khóa không gửi thì giữ số đã lưu
    expect(rowOf(await view(planner, TODAY), fx.l3)).toMatchObject({ linemapQty: 180, dayQty: 250, startTime: '07:00' });
    await save(planner, TODAY, [item(fx.l3, { startTime: '17:00', endTime: '08:00' })]).expect(422);
    await save(planner, TODAY, [item(fx.l3, { dayQty: 1.5 })]).expect(422);
    await save(planner, TODAY, [item(fx.l3, { dayQty: -1 })]).expect(422);
    await save(planner, TODAY, [item(fx.l3, { dayQty: 1 }), item(fx.l3, { dayQty: 2 })]).expect(422);
    // Không điều chỉnh ngày đã qua (Q9)
    const past = await view(planner, YESTERDAY);
    expect(past.editableDay).toBe(false);
    expect(rowOf(past, fx.l3)).toMatchObject({ canEdit: false });
    expect((await save(planner, YESTERDAY, [item(fx.l3, { dayQty: 1 })]).expect(422)).body.error.message).toContain('ngày đã qua');
    // Dòng dàn chuyền khác thời điểm tạo (Id được dùng lại) hoặc ĐVCS khác: 404 kèm Id
    expect((await save(planner, TODAY, [{ lineId: fx.l3, lineCreatedAt: '2020-01-01T00:00:00.000Z', dayQty: 1 }]).expect(404)).body.error.details.ids).toEqual([fx.l3]);
    expect((await save(planner, TODAY, [item(fx.a02, { dayQty: 1 })]).expect(404)).body.error.details.ids).toEqual([fx.a02]);
  });

  it('người khác vừa cập nhật cùng chuyền cùng ngày: 409 theo phiên bản lúc mở màn', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const before = await view(planner, TODAY);
    const v = before.lines.find((l: any) => l.lineCode === L3).version;
    await save(planner, TODAY, [item(fx.l3, { linemapQty: 170 })], { versions: [{ line: L3, version: v }] }).expect(200);
    expect((await save(planner, TODAY, [item(fx.l3, { linemapQty: 160 })], { versions: [{ line: L3, version: v }] }).expect(409)).body.error.details.lines).toEqual([L3]);
  });

  it('Chốt: khóa ngày, giữ bản chụp khi Xếp chuyền đổi; sửa 409; Hủy chốt mở lại; ngày đã qua không chốt, không hủy', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const r = (await api().post('/api/v1/sewing/plan/lock').set(auth(planner)).send({ date: TODAY, dept: L3 }).expect(200)).body;
    expect(r.locked).toBe(1);
    const locked = await view(planner, TODAY);
    expect(locked.lines.find((l: any) => l.lineCode === L3)).toMatchObject({ locked: true });
    expect(locked.lines.find((l: any) => l.lineCode === L3).lockerName).toBeTruthy();
    expect(locked.lines.find((l: any) => l.lineCode === L5)).toMatchObject({ locked: false });
    expect(rowOf(locked, fx.l3)).toMatchObject({ locked: true, canEdit: false });
    expect((await save(planner, TODAY, [item(fx.l3, { dayQty: 10 })]).expect(409)).body.error.message).toContain('Hủy chốt');
    // Ngày đã chốt hiện bản chụp: đổi PO, Giá CM ở kế hoạch không đổi số của ngày đã chốt; ngày chưa chốt hiện số mới
    await order.updateTable('ShipmentPlan').set({ PoBuyDate: 'PO516 / ĐỔI' }).where('Id', '=', fx.plan).execute();
    try {
      expect(rowOf(await view(planner, TODAY), fx.l3)).toMatchObject({ poBuyDate: 'PO516 / P1' });
      expect(rowOf(await view(planner, TOMORROW), fx.l3)).toMatchObject({ poBuyDate: 'PO516 / ĐỔI' });
    } finally {
      await order.updateTable('ShipmentPlan').set({ PoBuyDate: 'PO516 / P1' }).where('Id', '=', fx.plan).execute();
    }
    // Chuyền đã chốt mà có dòng chưa có trong bản chụp (Thêm dòng, Xếp chuyền thêm sau khi chốt): hiện số mới nhất, chỉ xem (review H2)
    const withLater = await view(planner, TODAY, `&extra=${fx.later}`);
    expect(rowOf(withLater, fx.later)).toMatchObject({ planQty: 200, saved: false, canEdit: false });
    expect(rowOf(withLater, fx.l3)).toMatchObject({ locked: true });
    // Tổ SX Chỉ đọc không chặn lần ghi: khóa của phiên bản là `line` (review M1); chuyền đã chốt vẫn 409
    expect((await save(planner, TODAY, [item(fx.later, { dayQty: 1 })]).expect(409)).body.error.message).toContain('Hủy chốt');
    // Hủy chốt: sửa lại được
    expect((await api().post('/api/v1/sewing/plan/unlock').set(auth(planner)).send({ date: TODAY, dept: L3 }).expect(200)).body.unlocked).toBe(1);
    await save(planner, TODAY, [item(fx.l3, { dayQty: 200 })]).expect(200);
    await api().post('/api/v1/sewing/plan/lock').set(auth(planner)).send({ date: YESTERDAY }).expect(422);
    await api().post('/api/v1/sewing/plan/unlock').set(auth(planner)).send({ date: YESTERDAY }).expect(422);
    // Ngày đã qua đã chốt (dữ liệu cũ): không hủy được
    const h = await insertId(sewing, 'SewingDayPlan', { PlanDate: YESTERDAY, LineCode: L5, IsLocked: true, LockedAt: new Date(), LockedBy: null, LockerName: 'Test', BranchCode: 'A01' });
    try {
      await api().post('/api/v1/sewing/plan/unlock').set(auth(planner)).send({ date: YESTERDAY, dept: L5 }).expect(422);
      expect((await sewing.selectFrom('SewingDayPlan').select('IsLocked').where('Id', '=', h).executeTakeFirstOrThrow()).IsLocked).toBe(true);
    } finally {
      await sewing.deleteFrom('SewingDayPlan').where('Id', '=', h).execute();
    }
  });

  it('Xếp chuyền không giảm Số lượng dưới số đã giao, không bỏ, không đổi chuyền dòng đã có số ở Kế hoạch may (quyết định 14.2)', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const lp = (await api().get(`/api/v1/order/line-plans/${fx.plan}`).set(auth(planner)).expect(200)).body;
    const body = (change: (l: any) => any | null) => ({
      lines: lp.lines
        .map((l: any) => change({ id: l.id, lineCode: l.lineCode, qty: l.qty, avgOutput: l.avgOutput, startDate: l.startDate }))
        .filter(Boolean),
    });
    const put = (b: object) => api().put(`/api/v1/order/line-plans/${fx.plan}/lines`).set(auth(planner)).send(b);
    // L3 đã giao 200 (hôm nay) + 50 (ngày mai)
    expect((await put(body((l) => (l.id === fx.l3 ? { ...l, qty: 249 } : l))).expect(409)).body.error.message).toContain('Kế hoạch may');
    expect((await put(body((l) => (l.id === fx.l5 ? null : l))).expect(409)).body.error.message).toContain('Kế hoạch may');
    expect((await put(body((l) => (l.id === fx.l5 ? { ...l, lineCode: L3 } : l))).expect(409)).body.error.message).toContain('Kế hoạch may');
    // Giảm còn đúng số đã giao, tăng, bỏ dòng chưa có số: được
    await put(body((l) => (l.id === fx.l3 ? { ...l, qty: 250 } : l.id === fx.later ? null : l))).expect(200);
    await put(body((l) => (l.id === fx.l3 ? { ...l, qty: 300 } : l.id === fx.later ? null : l))).expect(200);
    expect(await order.selectFrom('ShipmentPlanLine').select('Qty').where('Id', '=', fx.l3).executeTakeFirstOrThrow()).toMatchObject({ Qty: 300 });
  });

  it('phân quyền: A00 chỉ đọc; Giám đốc không sửa; Trưởng chuyền chỉ thấy chuyền mình, không có giá; ĐVCS khác không thấy; lần đầu lập cần quyền Thêm', async () => {
    const agg = await tokenFor('admin', 'A00');
    const a = await view(agg, TODAY);
    expect(a.editableDay).toBe(false);
    expect(rowOf(a, fx.l3)).toMatchObject({ canEdit: false, dayQty: 200 });
    expect(rowOf(a, fx.a02)).toBeTruthy();
    expect((await save(agg, TODAY, [item(fx.l3, { dayQty: 1 })]).expect(403)).body.error.code).toBe('AGGREGATE_READ_ONLY');
    await api().post('/api/v1/sewing/plan/lock').set(auth(agg)).send({ date: TODAY }).expect(403);
    const director = await tokenFor('giamdoc', 'A01');
    expect(rowOf(await view(director, TODAY), fx.l3)).toMatchObject({ cmPrice: 2.5, canEdit: false });
    await save(director, TODAY, [item(fx.l3, { dayQty: 1 })]).expect(403);
    const leader = await tokenFor('truongchuyen.a', 'A01');
    const lv = await view(leader, TODAY);
    expect(rowOf(lv, fx.l3)).toBeTruthy();
    expect(rowOf(lv, fx.l5)).toBeUndefined();
    // Giá CM, Doanh số nhạy cảm: mặc định Ẩn với Trưởng chuyền
    expect(rowOf(lv, fx.l3).cmPrice).toBeUndefined();
    expect(rowOf(lv, fx.l3).planRevenue).toBeUndefined();
    await save(leader, TODAY, [item(fx.l3, { dayQty: 1 })]).expect(403);
    const other = await tokenFor('admin', 'A02');
    const ov = await view(other, TODAY);
    expect(rowOf(ov, fx.l3)).toBeUndefined();
    expect(rowOf(ov, fx.a02)).toBeTruthy();
    await save(other, TODAY, [item(fx.l3, { dayQty: 1 })]).expect(404);

    // Kế hoạch bị gỡ quyền Thêm: sửa được chuyền đã có bản ghi trong ngày, không lập lần đầu cho chuyền khác
    const admin = await tokenFor('admin', 'A01');
    const roles = (await api().get('/api/v1/admin/roles').set(auth(admin))).body as { id: number; code: string }[];
    const plannerRole = roles.find((r) => r.code === 'PLANNER')!.id;
    const perm = await core
      .selectFrom('SysPermission as p')
      .innerJoin('SysResource as r', 'r.Id', 'p.ResourceId')
      .select('p.Id')
      .where('r.Code', '=', 'sewing.plan')
      .where('p.ActionCode', '=', 'create')
      .executeTakeFirstOrThrow();
    await core.deleteFrom('SysRolePermission').where('RoleId', '=', plannerRole).where('PermissionId', '=', perm.Id).execute();
    await core.updateTable('SysPermissionVersion').set((eb) => ({ Version: eb('Version', '+', 1 as any) }) as any).where('Id', '=', 1).execute();
    try {
      tokens.delete('kehoach.a@A01');
      const p = await tokenFor('kehoach.a', 'A01');
      await save(p, TODAY, [item(fx.l3, { dayQty: 199 })]).expect(200);
      await save(p, addDays(TODAY, 2), [item(fx.l3, { dayQty: 1 })]).expect(403);
    } finally {
      await core.insertInto('SysRolePermission').values({ RoleId: plannerRole, PermissionId: perm.Id } as any).execute();
      await core.updateTable('SysPermissionVersion').set((eb) => ({ Version: eb('Version', '+', 1 as any) }) as any).where('Id', '=', 1).execute();
      tokens.delete('kehoach.a@A01');
    }
  });

  it('chính sách cột: Tổng kế hoạch bị Che thì Còn lại không trả, câu báo vượt không nêu số; Kế hoạch ngày xưởng giao Chỉ đọc thì không lưu được', async () => {
    const admin = await tokenFor('admin', 'A01');
    const roles = (await api().get('/api/v1/admin/roles').set(auth(admin))).body as { id: number; code: string }[];
    const matrix = (await api().get('/api/v1/admin/permissions').set(auth(admin))).body;
    const resourceId = matrix.modules.flatMap((m: any) => m.resources).find((r: any) => r.code === 'sewing.plan').id;
    const plannerRole = roles.find((r) => r.code === 'PLANNER')!.id;
    const policy = (fieldCode: string, level: string | null) =>
      api().put(`/api/v1/admin/roles/${plannerRole}/field-policies`).set(auth(admin)).send({ resourceId, policies: [{ fieldCode, accessLevel: level }] }).expect(200);
    await policy('planQty', 'MASKED');
    try {
      tokens.delete('kehoach.a@A01');
      const token = await tokenFor('kehoach.a', 'A01');
      expect(rowOf(await view(token, TODAY), fx.l3)).toMatchObject({ planQty: '***', remainQty: null, otherAfter: null, dayQty: 199 });
      const msg = (await save(token, TODAY, [item(fx.l3, { dayQty: 290 })]).expect(422)).body.error.message as string;
      expect(msg).not.toContain('300');
      await policy('dayQty', 'READONLY');
      tokens.delete('kehoach.a@A01');
      const ro = await tokenFor('kehoach.a', 'A01');
      expect((await save(ro, TODAY, [item(fx.l3, { dayQty: 1 })]).expect(403)).body.error.code).toBe('FIELD_READONLY');
      await save(ro, TODAY, [item(fx.l3, { linemapQty: 150 })]).expect(200);
    } finally {
      await policy('planQty', null);
      await policy('dayQty', null);
      tokens.delete('kehoach.a@A01');
    }
  });

  it('Giá CM: ĐVCS có kế hoạch của đơn sửa riêng Giá CM, kế hoạch đổi theo; không sửa được cột khác, đơn chưa có kế hoạch, A00 (quyết định 14.3)', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const list = (await api().get(`/api/v1/order/sales-orders?q=${STYLE}&pageSize=50`).set(auth(planner)).expect(200)).body.items as any[];
    expect(list.find((o) => o.id === fx.order)).toMatchObject({ branchCode: 'A02', cmPriceEditable: true });
    expect(list.find((o) => o.id === fx.orderNoPlan)).toMatchObject({ cmPriceEditable: false });
    const res = (await api().put(`/api/v1/order/sales-orders/${fx.order}/cm-price`).set(auth(planner)).send({ cmPrice: 3.2 }).expect(200)).body;
    expect(res).toMatchObject({ cmPrice: 3.2, cmPriceEditable: true });
    // Một đơn một giá: kế hoạch của mọi ĐVCS đổi theo, Doanh số Xếp chuyền tính lại
    const plans = await order.selectFrom('ShipmentPlan').select(['Id', 'CmPrice', 'Revenue']).where('SalesOrderId', '=', fx.order).execute();
    expect(plans.map((p) => Number(p.CmPrice))).toEqual([3.2, 3.2]);
    expect(Number(plans.find((p) => p.Id === fx.plan)!.Revenue)).toBe(3200);
    // Ngày chưa chốt của Kế hoạch may hiện giá mới; Doanh số = linemap × Giá CM
    expect(rowOf(await view(planner, TODAY), fx.l3)).toMatchObject({ cmPrice: 3.2, linemapQty: 150, planRevenue: 480 });
    await api().put(`/api/v1/order/sales-orders/${fx.order}/cm-price`).set(auth(planner)).send({ cmPrice: null }).expect(200);
    expect(Number((await order.selectFrom('ShipmentPlan').select('CmPrice').where('Id', '=', fx.plan).executeTakeFirstOrThrow()).CmPrice ?? -1)).toBe(-1);
    await api().put(`/api/v1/order/sales-orders/${fx.order}/cm-price`).set(auth(planner)).send({}).expect(422);
    await api().put(`/api/v1/order/sales-orders/${fx.order}/cm-price`).set(auth(planner)).send({ cmPrice: -1 }).expect(422);
    // Sửa cột khác của đơn ĐVCS khác vẫn 404; đơn chưa có kế hoạch ở A01: 404
    await api().put(`/api/v1/order/sales-orders/${fx.order}`).set(auth(planner)).send({ qty: 1 }).expect(404);
    await api().put(`/api/v1/order/sales-orders/${fx.orderNoPlan}/cm-price`).set(auth(planner)).send({ cmPrice: 2 }).expect(404);
    const agg = await tokenFor('admin', 'A00');
    expect((await api().put(`/api/v1/order/sales-orders/${fx.order}/cm-price`).set(auth(agg)).send({ cmPrice: 2 }).expect(403)).body.error.code).toBe('AGGREGATE_READ_ONLY');
    const director = await tokenFor('giamdoc', 'A01');
    await api().put(`/api/v1/order/sales-orders/${fx.order}/cm-price`).set(auth(director)).send({ cmPrice: 2 }).expect(403);
    // ĐVCS nguồn sửa Giá CM ở popup Sửa đơn: kế hoạch cũng đổi theo
    const source = await tokenFor('admin', 'A02');
    await api().put(`/api/v1/order/sales-orders/${fx.order}`).set(auth(source)).send({ cmPrice: 2.5 }).expect(200);
    expect(Number((await order.selectFrom('ShipmentPlan').select('CmPrice').where('Id', '=', fx.planA02).executeTakeFirstOrThrow()).CmPrice)).toBe(2.5);
  });

  it('nhật ký: Cập nhật, Chốt, Hủy chốt ghi SysAuditLog không kèm giá', async () => {
    const logs = await core
      .selectFrom('SysAuditLog')
      .select(['ActionCode', 'NewValue', 'OldValue'])
      .where('EntityType', '=', 'SewingDayPlan')
      .where('EventAt', '>', new Date(Date.now() - 10 * 60_000))
      .execute();
    const actions = new Set(logs.map((l) => l.ActionCode));
    expect(actions).toEqual(new Set(['UPDATE', 'LOCK', 'UNLOCK']));
    expect(logs.some((l) => (l.NewValue ?? '').includes('cmPrice'))).toBe(false);
  });
});
