import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { env } from '../src/config/env';
import { todayVN } from '../src/modules/cutting/cutting-progress.service';
import { CUTTING_DB } from '../src/modules/cutting/cutting.db';
import { CuttingPlanRepository } from '../src/modules/cutting/cutting.repositories';
import type { CuttingDb } from '../src/modules/cutting/cutting.types';
import { ORDER_DB } from '../src/modules/order/order.db';
import type { OrderDb } from '../src/modules/order/order.types';
import { ShipmentPlanFeed } from '../src/modules/order/shipment-plan-feed.service';
import { CORE_DB, type CoreDb } from '../src/platform/database/database.module';

// Phase 5.14 – Đồng bộ tiến độ cắt (quyết định 13). Cần MES_Core, MES_Order, MES_Cutting đã migrate và seed mẫu.
// Test tự tạo một đơn hàng, kế hoạch ở A01 (chưa xếp chuyền) và A02; xóa hết khi xong.
describe('Phase 5.14: Đồng bộ tiến độ cắt', () => {
  let app: INestApplication;
  let order: OrderDb;
  let cutting: CuttingDb;
  let core: CoreDb;
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const STYLE = 'TEST-P514-CUT';
  const fx = { orderA01: 0, orderA02: 0, planA01: 0, planA02: 0 };
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

  async function dropFixture() {
    const plans = await order
      .selectFrom('ShipmentPlan')
      .select('Id')
      .where('StyleCode', 'like', `${STYLE}%`)
      .execute();
    const copies = cutting.selectFrom('CuttingPlan').select('Id').where('StyleCode', 'like', `${STYLE}%`);
    await cutting.deleteFrom('CuttingPlanDaily').where('CuttingPlanId', 'in', copies).execute();
    await cutting.deleteFrom('CuttingPlan').where('StyleCode', 'like', `${STYLE}%`).execute();
    const ids = plans.map((p) => p.Id);
    if (ids.length) {
      await order.deleteFrom('ShipmentPlanColorSize').where('ShipmentPlanId', 'in', ids).execute();
      await order.deleteFrom('ShipmentPlan').where('Id', 'in', ids).execute();
    }
    await order.deleteFrom('SalesOrder').where('StyleCode', 'like', `${STYLE}%`).execute();
  }

  const insertId = async (table: string, values: object) => ((await order.insertInto(table as any).values(values as any).output('inserted.Id' as any).executeTakeFirstOrThrow()) as { Id: number }).Id;

  /** Kế hoạch xuất hàng có màu cỡ, chưa xếp chuyền */
  async function plan(branch: string, orderId: number, suffix: string, cells: [string, string, number][]) {
    const qty = cells.reduce((n, [, , q]) => n + q, 0);
    const id = await insertId('ShipmentPlan', {
      PlanNo: `TEST-P514-${suffix}`,
      SalesOrderId: orderId,
      CustomerName: 'KHÁCH TEST P514',
      StyleCode: `${STYLE}-${suffix}`,
      ProductName: 'Áo test cắt',
      PoBuyDate: 'PO514 / 15-11',
      PlanQty: qty,
      ShipDate: '2027-12-31',
      PlannerName: 'Test',
      StatusCode: 'PLANNED',
      BranchCode: branch,
    });
    let sort = 0;
    for (const [color, size, q] of cells) {
      await insertId('ShipmentPlanColorSize', { ShipmentPlanId: id, ColorName: color, SizeName: size, OriginalQty: q, PlanQty: q, SortOrder: sort++, BranchCode: branch });
    }
    return id;
  }

  async function createFixture() {
    await dropFixture();
    const so = (branch: string) =>
      insertId('SalesOrder', { OrderNo: `TEST-P514-${branch}`, CustomerName: 'KHÁCH TEST P514', StyleCode: `${STYLE}-${branch}`, ProductName: 'Áo test cắt', Qty: 5000, UnitName: 'Chiếc', ShipDate: '2027-12-31', StatusCode: 'PLANNING', BranchCode: branch });
    fx.orderA01 = await so('A01');
    fx.orderA02 = await so('A02');
    fx.planA01 = await plan('A01', fx.orderA01, 'A', [
      ['DUSTED BLUE_401', '(REG) XS', 100],
      ['DUSTED BLUE_401', '(REG) S', 200],
      ['PERFORMANCE', '(REG) M', 300],
    ]);
    fx.planA02 = await plan('A02', fx.orderA02, 'B', [['RED', 'L', 50]]);
  }

  const list = async (token: string, extra = '') => (await api().get(`/api/v1/cutting/progress?style=${STYLE}&pageSize=50${extra}`).set(auth(token)).expect(200)).body;
  const rowOf = (body: any, planNo: string) => body.items.find((r: any) => r.planNo === planNo);
  const copyId = async (shipmentPlanId: number) => (await cutting.selectFrom('CuttingPlan').select('Id').where('ShipmentPlanId', '=', shipmentPlanId).executeTakeFirstOrThrow()).Id;
  const detail = async (token: string, id: number, date?: string) => (await api().get(`/api/v1/cutting/progress/${id}${date ? `?date=${date}` : ''}`).set(auth(token)).expect(200)).body;
  const save = (token: string, id: number, date: string, items: object[]) => api().put(`/api/v1/cutting/progress/${id}`).set(auth(token)).send({ date, items });
  const planCutQty = async (id: number) => (await order.selectFrom('ShipmentPlan').select('CutQty').where('Id', '=', id).executeTakeFirstOrThrow()).CutQty;
  const cell = (body: any, color: string, size: string) => body.items.find((i: any) => i.colorName === color && i.sizeName === size);

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

  it('ShipmentPlanFeed: kế hoạch chưa xếp chuyền có trong feed, lọc ĐVCS theo phiên, A00 thấy mọi ĐVCS; dấu phiên bản đổi khi sửa SL màu cỡ', async () => {
    const feed = app.get(ShipmentPlanFeed);
    const scope = (branchCode: string, isAggregate = false) => ({ userId: 0, branchCode, isAggregate, access: {} as any });
    const a01 = await feed.plansOf(scope('A01'));
    const mine = a01.find((p) => p.id === fx.planA01)!;
    expect(mine).toMatchObject({ planNo: 'TEST-P514-A', planQty: 600, branchCode: 'A01', shipDate: '2027-12-31' });
    expect(mine.colorSizes.map((c) => [c.colorName, c.sizeName, c.planQty])).toEqual([
      ['DUSTED BLUE_401', '(REG) XS', 100],
      ['DUSTED BLUE_401', '(REG) S', 200],
      ['PERFORMANCE', '(REG) M', 300],
    ]);
    expect(a01.some((p) => p.id === fx.planA02)).toBe(false);
    const all = await feed.plansOf(scope('A00', true));
    expect(all.some((p) => p.id === fx.planA02)).toBe(true);
    const v0 = await feed.versionOf(scope('A01'));
    await order.updateTable('ShipmentPlanColorSize').set({ PlanQty: 101 }).where('ShipmentPlanId', '=', fx.planA01).where('SizeName', '=', '(REG) XS').execute();
    expect(await feed.versionOf(scope('A01'))).not.toBe(v0);
    await order.updateTable('ShipmentPlanColorSize').set({ PlanQty: 100 }).where('ShipmentPlanId', '=', fx.planA01).where('SizeName', '=', '(REG) XS').execute();
    expect(await feed.versionOf(scope('A01'))).toBe(v0);
  });

  it('danh sách: kế hoạch chưa xếp chuyền có một dòng, chỉ ĐVCS của phiên; A00 thấy mọi ĐVCS', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const body = await list(planner);
    const row = rowOf(body, 'TEST-P514-A');
    expect(row).toMatchObject({ customerName: 'KHÁCH TEST P514', poBuyDate: 'PO514 / 15-11', branchCode: 'A01', planQty: 600, cutQty: 0, diffQty: -600, statusCode: 'NOT_STARTED', lastCutDate: null });
    expect(rowOf(body, 'TEST-P514-B')).toBeUndefined();
    const agg = await list(await tokenFor('admin', 'A00'));
    expect(rowOf(agg, 'TEST-P514-B')).toMatchObject({ branchCode: 'A02', planQty: 50 });
  });

  it('popup: màu cỡ theo kế hoạch; ngày tương lai 422; kế hoạch ĐVCS khác 404', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const id = await copyId(fx.planA01);
    const d = await detail(planner, id);
    expect(d).toMatchObject({ planNo: 'TEST-P514-A', branchCode: 'A01', planQty: 600, cutQty: 0, diffQty: -600, date: TODAY, canEdit: true, canDelete: false, sourceDeleted: false });
    expect(d.branchName).toBeTruthy();
    expect(d.items).toEqual([
      { colorName: 'DUSTED BLUE_401', sizeName: '(REG) XS', inPlan: true, planQty: 100, dayQty: null, cutQty: 0, diffQty: -100 },
      { colorName: 'DUSTED BLUE_401', sizeName: '(REG) S', inPlan: true, planQty: 200, dayQty: null, cutQty: 0, diffQty: -200 },
      { colorName: 'PERFORMANCE', sizeName: '(REG) M', inPlan: true, planQty: 300, dayQty: null, cutQty: 0, diffQty: -300 },
    ]);
    await api().get(`/api/v1/cutting/progress/${id}?date=${TOMORROW}`).set(auth(planner)).expect(422);
    // Kế hoạch A02 xem từ phiên A01: như không tồn tại
    await list(await tokenFor('admin', 'A00'));
    await api().get(`/api/v1/cutting/progress/${await copyId(fx.planA02)}`).set(auth(planner)).expect(404);
  });

  it('lưu theo ngày: Trong ngày theo ngày đang xem, Lũy kế và +/- trên mọi ngày; 0 là xóa; có nhật ký', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const id = await copyId(fx.planA01);
    await save(planner, id, YESTERDAY, [
      { colorName: 'DUSTED BLUE_401', sizeName: '(REG) XS', dayQty: 60 },
      { colorName: 'PERFORMANCE', sizeName: '(REG) M', dayQty: 300 },
    ]).expect(200);
    // Tên gõ khác hoa thường, thừa khoảng trắng cuối vẫn khớp màu cỡ của kế hoạch (như UNIQUE trong database)
    const saved = (await save(planner, id, TODAY, [{ colorName: 'dusted blue_401 ', sizeName: '(reg) xs', dayQty: 40 }]).expect(200)).body;
    expect(saved.date).toBe(TODAY);
    expect(cell(saved, 'DUSTED BLUE_401', '(REG) XS')).toMatchObject({ dayQty: 40, cutQty: 100, diffQty: 0 });

    const y = await detail(planner, id, YESTERDAY);
    expect(cell(y, 'DUSTED BLUE_401', '(REG) XS')).toMatchObject({ dayQty: 60, cutQty: 100, diffQty: 0 });
    expect(cell(y, 'PERFORMANCE', '(REG) M')).toMatchObject({ dayQty: 300, cutQty: 300, diffQty: 0 });
    expect(cell(y, 'DUSTED BLUE_401', '(REG) S')).toMatchObject({ dayQty: null, cutQty: 0, diffQty: -200 });
    expect(y).toMatchObject({ cutQty: 400, diffQty: -200, statusCode: 'CUTTING', entryDays: 2 });
    const older = await detail(planner, id, addDays(TODAY, -5));
    expect(cell(older, 'DUSTED BLUE_401', '(REG) XS')).toMatchObject({ dayQty: null, cutQty: 100 });

    const row = rowOf(await list(planner), 'TEST-P514-A');
    expect(row).toMatchObject({ cutQty: 400, diffQty: -200, statusCode: 'CUTTING', lastCutDate: TODAY });

    // 0 xóa số của ngày đó
    await save(planner, id, TODAY, [{ colorName: 'DUSTED BLUE_401', sizeName: '(REG) XS', dayQty: 0 }]).expect(200);
    expect(cell(await detail(planner, id, TODAY), 'DUSTED BLUE_401', '(REG) XS')).toMatchObject({ dayQty: null, cutQty: 60 });
    expect(await cutting.selectFrom('CuttingPlanDaily').select('Id').where('CuttingPlanId', '=', id).where('EntryDate', '=', TODAY as any).execute()).toHaveLength(0);
    // Cột LK cắt của Kế hoạch xuất hàng theo Lũy kế sau mỗi lần lưu (quyết định 13.6): 60 + 300
    expect(await planCutQty(fx.planA01)).toBe(360);

    const logs = await core.selectFrom('SysAuditLog').select(['ActionCode', 'NewValue']).where('EntityType', '=', 'CuttingPlan').where('EntityId', '=', String(id)).orderBy('Id', 'desc').execute();
    expect(logs.length).toBeGreaterThanOrEqual(3);
    expect(JSON.parse(logs[0].NewValue!)).toMatchObject({ planNo: 'TEST-P514-A', date: TODAY, cells: [{ colorName: 'DUSTED BLUE_401', sizeName: '(REG) XS', dayQty: null }] });
  });

  describe('Lũy kế không vượt Kế hoạch của màu cỡ (quyết định 13.7)', () => {
    let planId = 0;
    let id = 0;
    let planner = '';
    const s = { colorName: 'NAVY', sizeName: 'S' };
    const m = { colorName: 'NAVY', sizeName: 'M' };
    const setPlan = (q: number) => order.updateTable('ShipmentPlanColorSize').set({ PlanQty: q }).where('ShipmentPlanId', '=', planId).where('SizeName', '=', 'S').execute();
    const qtyOf = async (date: string) => {
      const d = await detail(planner, id, date);
      return { s: cell(d, 'NAVY', 'S'), m: cell(d, 'NAVY', 'M') };
    };

    beforeEach(async () => {
      planner = await tokenFor('kehoach.a', 'A01');
      planId = await plan('A01', fx.orderA01, 'E', [['NAVY', 'S', 100], ['NAVY', 'M', 50]]);
      await list(planner);
      id = await copyId(planId);
      await save(planner, id, YESTERDAY, [{ ...s, dayQty: 60 }]).expect(200);
    });

    afterEach(async () => {
      // Dọn cả số cắt trước: xóa thẳng kế hoạch nguồn còn số cắt thì bản chép bị giữ lại (quyết định 13.2)
      await cutting.deleteFrom('CuttingPlanDaily').where('CuttingPlanId', '=', id).execute();
      await cutting.deleteFrom('CuttingPlan').where('Id', '=', id).execute();
      await order.deleteFrom('ShipmentPlanColorSize').where('ShipmentPlanId', '=', planId).execute();
      await order.deleteFrom('ShipmentPlan').where('Id', '=', planId).execute();
    });

    it('tăng số làm vượt thì 422, nêu màu cỡ không nêu số, không ghi ô nào của lần lưu; vừa đủ Kế hoạch thì được; ngày khác cũng tính mọi ngày', async () => {
      await save(planner, id, TODAY, [{ ...s, dayQty: 40 }]).expect(200);
      const over = await save(planner, id, TODAY, [{ ...m, dayQty: 5 }, { ...s, dayQty: 41 }]).expect(422);
      expect(over.body.error.message).toBe('Lũy kế vượt Kế hoạch ở NAVY/S. Muốn cắt thêm, điều chỉnh Kế hoạch xuất hàng trước.');
      expect(over.body.error.details).toEqual({ cells: ['NAVY/S'] });
      const t = await qtyOf(TODAY);
      expect(t.s).toMatchObject({ dayQty: 40, cutQty: 100, diffQty: 0 });
      expect(t.m).toMatchObject({ dayQty: null, cutQty: 0 });
      await save(planner, id, addDays(TODAY, -3), [{ ...s, dayQty: 1 }]).expect(422);
      expect(await planCutQty(planId)).toBe(100);
    });

    it('kế hoạch giảm sau khi cắt: ô đã vượt giảm được (cả xóa ô), tăng thì không; tăng kế hoạch rồi lưu ngay không cần tải lại popup', async () => {
      await save(planner, id, TODAY, [{ ...s, dayQty: 40 }]).expect(200);
      // Popup không tải lại: lần lưu tự chép kế hoạch mới
      await setPlan(80);
      await save(planner, id, TODAY, [{ ...s, dayQty: 30 }]).expect(200);
      await save(planner, id, TODAY, [{ ...s, dayQty: 31 }]).expect(422);
      expect((await qtyOf(TODAY)).s).toMatchObject({ planQty: 80, dayQty: 30, cutQty: 90, diffQty: 10 });
      await save(planner, id, TODAY, [{ ...s, dayQty: null }]).expect(200);
      expect((await qtyOf(TODAY)).s).toMatchObject({ dayQty: null, cutQty: 60 });
      await setPlan(150);
      await save(planner, id, TODAY, [{ ...s, dayQty: 90 }]).expect(200);
      expect(await planCutQty(planId)).toBe(150);
    });

    it('hai người lưu cùng lúc hai ngày khác nhau: không cùng vượt (một lần 200, một lần 422)', async () => {
      // Hôm qua 60; mỗi lần riêng lẻ 60 + 30 = 90 ≤ 100, cả hai thì 120
      const res = await Promise.all([save(planner, id, TODAY, [{ ...s, dayQty: 30 }]), save(planner, id, addDays(TODAY, -2), [{ ...s, dayQty: 30 }])]);
      expect(res.map((r) => r.status).sort()).toEqual([200, 422]);
      expect((await qtyOf(TODAY)).s).toMatchObject({ cutQty: 90 });
    });
  });

  it('lưu khi kế hoạch nguồn vừa bị xóa mà chưa có số cắt (bản chép bị dọn lúc chép lại): 409, không phải 404', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const planId = await plan('A01', fx.orderA01, 'F', [['OLIVE', 'L', 20]]);
    await list(planner);
    const id = await copyId(planId);
    await order.deleteFrom('ShipmentPlanColorSize').where('ShipmentPlanId', '=', planId).execute();
    await order.deleteFrom('ShipmentPlan').where('Id', '=', planId).execute();
    await save(planner, id, TODAY, [{ colorName: 'OLIVE', sizeName: 'L', dayQty: 1 }]).expect(409);
    await save(planner, id, TODAY, [{ colorName: 'OLIVE', sizeName: 'L', dayQty: 1 }]).expect(404);
  });

  it('kiểm đầu vào: ngày tương lai, số âm, số lẻ, màu cỡ ngoài kế hoạch, gửi trùng: 422, không ghi gì', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const id = await copyId(fx.planA01);
    const xs = { colorName: 'DUSTED BLUE_401', sizeName: '(REG) XS' };
    await save(planner, id, TOMORROW, [{ ...xs, dayQty: 1 }]).expect(422);
    await save(planner, id, TODAY, [{ ...xs, dayQty: -1 }]).expect(422);
    await save(planner, id, TODAY, [{ ...xs, dayQty: 1.5 }]).expect(422);
    await save(planner, id, TODAY, [{ colorName: 'KHÔNG CÓ', sizeName: 'XS', dayQty: 1 }]).expect(422);
    await save(planner, id, TODAY, [{ ...xs, dayQty: 1 }, { ...xs, dayQty: 2 }]).expect(422);
    expect(cell(await detail(planner, id, TODAY), xs.colorName, xs.sizeName).dayQty).toBeNull();
  });

  it('phân quyền: A00 chỉ đọc; Giám đốc không sửa; Kế hoạch không Xóa số cắt; ĐVCS khác 404', async () => {
    const id = await copyId(fx.planA01);
    const cellXs = [{ colorName: 'DUSTED BLUE_401', sizeName: '(REG) XS', dayQty: 1 }];
    const agg = await tokenFor('admin', 'A00');
    expect((await detail(agg, id)).canEdit).toBe(false);
    expect((await save(agg, id, TODAY, cellXs).expect(403)).body.error.code).toBe('AGGREGATE_READ_ONLY');
    await save(await tokenFor('giamdoc', 'A01'), id, TODAY, cellXs).expect(403);
    const planner = await tokenFor('kehoach.a', 'A01');
    await api().delete(`/api/v1/cutting/progress/${id}/entries`).set(auth(planner)).expect(403);
    await save(planner, await copyId(fx.planA02), TODAY, [{ colorName: 'RED', sizeName: 'L', dayQty: 1 }]).expect(404);
    // Trưởng chuyền chỉ xem (ma trận mẫu)
    await save(await tokenFor('truongchuyen.a', 'A01'), id, TODAY, cellXs).expect(403);
  });

  it('chính sách cột: SL KH bị Che thì +/- và Trạng thái cũng che, không lọc, không sắp xếp theo +/-', async () => {
    const admin = await tokenFor('admin', 'A01');
    const roles = (await api().get('/api/v1/admin/roles').set(auth(admin))).body as { id: number; code: string }[];
    const matrix = (await api().get('/api/v1/admin/permissions').set(auth(admin))).body;
    const resourceId = matrix.modules.flatMap((m: any) => m.resources).find((r: any) => r.code === 'cutting.progress').id;
    const planner = roles.find((r) => r.code === 'PLANNER')!.id;
    const policy = (level: string | null) =>
      api().put(`/api/v1/admin/roles/${planner}/field-policies`).set(auth(admin)).send({ resourceId, policies: [{ fieldCode: 'planQty', accessLevel: level }] }).expect(200);
    await policy('MASKED');
    try {
      tokens.delete('kehoach.a@A01');
      const token = await tokenFor('kehoach.a', 'A01');
      const row = rowOf(await list(token), 'TEST-P514-A');
      expect(row).toMatchObject({ planQty: '***', diffQty: '***', statusCode: '***', cutQty: 360 });
      const d = await detail(token, await copyId(fx.planA01));
      expect(cell(d, 'PERFORMANCE', '(REG) M')).toMatchObject({ planQty: '***', diffQty: '***', cutQty: 300 });
      await api().get('/api/v1/cutting/progress/values?field=diffQty').set(auth(token)).expect(403);
      // Trong ngày Chỉ đọc: gửi dayQty bị chặn ở interceptor (403), kể cả gửi null
      await api().put(`/api/v1/admin/roles/${planner}/field-policies`).set(auth(admin)).send({ resourceId, policies: [{ fieldCode: 'dayQty', accessLevel: 'READONLY' }] }).expect(200);
      tokens.delete('kehoach.a@A01');
      const ro = await tokenFor('kehoach.a', 'A01');
      expect((await save(ro, await copyId(fx.planA01), TODAY, [{ colorName: 'PERFORMANCE', sizeName: '(REG) M', dayQty: null }]).expect(403)).body.error.code).toBe('FIELD_READONLY');
      const cf = encodeURIComponent(JSON.stringify({ diffQty: { in: [-240] } }));
      expect(rowOf(await list(token, `&cf=${cf}`), 'TEST-P514-A')).toBeTruthy();
    } finally {
      await policy(null);
      await api().put(`/api/v1/admin/roles/${planner}/field-policies`).set(auth(admin)).send({ resourceId, policies: [{ fieldCode: 'dayQty', accessLevel: null }] }).expect(200);
      tokens.delete('kehoach.a@A01');
    }
  });

  it('màu cỡ bị bỏ khỏi kế hoạch mà còn số cắt: vẫn hiện, Kế hoạch 0, không sửa được', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const id = await copyId(fx.planA01);
    await order.deleteFrom('ShipmentPlanColorSize').where('ShipmentPlanId', '=', fx.planA01).where('ColorName', '=', 'PERFORMANCE').execute();
    try {
      const d = await detail(planner, id, YESTERDAY);
      expect(cell(d, 'PERFORMANCE', '(REG) M')).toMatchObject({ inPlan: false, planQty: 0, dayQty: 300, cutQty: 300, diffQty: 300 });
      expect(d.items[d.items.length - 1].colorName).toBe('PERFORMANCE');
      await save(planner, id, YESTERDAY, [{ colorName: 'PERFORMANCE', sizeName: '(REG) M', dayQty: 1 }]).expect(422);
    } finally {
      await insertId('ShipmentPlanColorSize', { ShipmentPlanId: fx.planA01, ColorName: 'PERFORMANCE', SizeName: '(REG) M', OriginalQty: 300, PlanQty: 300, SortOrder: 2, BranchCode: 'A01' });
    }
  });

  it('không xóa được kế hoạch xuất hàng đã có số cắt (409); Xóa số cắt rồi thì xóa được', async () => {
    const admin = await tokenFor('admin', 'A01');
    const id = await copyId(fx.planA01);
    const blocked = await api().delete(`/api/v1/order/shipment-plans/${fx.planA01}`).set(auth(admin)).expect(409);
    expect(blocked.body.error.message).toContain('Xóa số cắt');
    expect(await order.selectFrom('ShipmentPlan').select('Id').where('Id', '=', fx.planA01).executeTakeFirst()).toBeTruthy();

    const d = await detail(admin, id);
    expect(d.canDelete).toBe(true);
    const removed = (await api().delete(`/api/v1/cutting/progress/${id}/entries`).set(auth(admin)).expect(200)).body;
    expect(removed).toMatchObject({ removedDays: 1, planRemoved: false });
    expect(await cutting.selectFrom('CuttingPlanDaily').select('Id').where('CuttingPlanId', '=', id).execute()).toHaveLength(0);
    expect(await planCutQty(fx.planA01)).toBe(0);
    const log = await core.selectFrom('SysAuditLog').select('ActionCode').where('EntityType', '=', 'CuttingPlan').where('EntityId', '=', String(id)).orderBy('Id', 'desc').executeTakeFirstOrThrow();
    expect(log.ActionCode).toBe('DELETE_ENTRIES');

    await api().delete(`/api/v1/order/shipment-plans/${fx.planA01}`).set(auth(admin)).expect(204);
    // Lần mở màn sau: kế hoạch không còn, bản chép chưa có số cắt thì bị xóa
    expect(rowOf(await list(admin), 'TEST-P514-A')).toBeUndefined();
    expect(await cutting.selectFrom('CuttingPlan').select('Id').where('Id', '=', id).executeTakeFirst()).toBeUndefined();
  });

  it('kế hoạch nguồn mất mà còn số cắt (xóa ngoài màn Kế hoạch xuất hàng): giữ số, "Kế hoạch đã xóa", chỉ đọc; Xóa số cắt xóa luôn bản chép', async () => {
    const admin = await tokenFor('admin', 'A01');
    const planId = await plan('A01', fx.orderA01, 'C', [['GREEN', 'M', 80]]);
    await list(admin);
    const id = await copyId(planId);
    await save(admin, id, TODAY, [{ colorName: 'GREEN', sizeName: 'M', dayQty: 30 }]).expect(200);
    // Mất nguồn ngoài luồng xóa của màn (script, chen giữa lúc kiểm và lúc xóa)
    await order.deleteFrom('ShipmentPlanColorSize').where('ShipmentPlanId', '=', planId).execute();
    await order.deleteFrom('ShipmentPlan').where('Id', '=', planId).execute();
    // Lần lưu chép lại trước: kế hoạch nguồn không còn mà có số cắt thì bản chép bị tách khỏi nguồn, 409
    await save(admin, id, TODAY, [{ colorName: 'GREEN', sizeName: 'M', dayQty: 31 }]).expect(409);

    const row = rowOf(await list(admin), 'TEST-P514-C');
    expect(row).toMatchObject({ statusCode: 'SOURCE_DELETED', sourceDeleted: true, cutQty: 30 });
    const kept = await cutting.selectFrom('CuttingPlan').select(['ShipmentPlanId', 'SourceDeletedAt']).where('Id', '=', id).executeTakeFirstOrThrow();
    expect(kept.ShipmentPlanId).toBeNull();
    expect(kept.SourceDeletedAt).not.toBeNull();
    const d = await detail(admin, id);
    expect(d).toMatchObject({ canEdit: false, canDelete: true, sourceDeleted: true });
    expect(cell(d, 'GREEN', 'M')).toMatchObject({ planQty: 80, dayQty: 30, cutQty: 30 });
    await save(admin, id, TODAY, [{ colorName: 'GREEN', sizeName: 'M', dayQty: 31 }]).expect(409);

    const removed = (await api().delete(`/api/v1/cutting/progress/${id}/entries`).set(auth(admin)).expect(200)).body;
    expect(removed).toMatchObject({ planRemoved: true });
    expect(rowOf(await list(admin), 'TEST-P514-C')).toBeUndefined();
  });

  it('chép lại: ĐVCS không còn kế hoạch nào thì bản chép chưa có số cắt bị dọn, có số thì tách khỏi nguồn; phiên A00 gặp nguồn rỗng thì không đổi gì', async () => {
    const repo = app.get(CuttingPlanRepository);
    // ĐVCS giả chỉ có trong MES_Cutting (khóa ngầm, không có khóa ngoại vật lý): không đụng dữ liệu của ĐVCS thật
    const BR = 'ZT514';
    const row = (shipmentPlanId: number) => ({
      ShipmentPlanId: shipmentPlanId,
      SourceCreatedAt: new Date('2026-01-01T00:00:00Z'),
      PlanNo: `TEST-P514-Z${shipmentPlanId}`,
      CustomerName: 'KHÁCH TEST P514',
      StyleCode: `${STYLE}-Z`,
      ProductName: 'Áo test cắt',
      PoBuyDate: 'PO514',
      ShipDate: '2027-12-31',
      PlanQty: 10,
      SourceSyncedAt: new Date(),
      BranchCode: BR,
    });
    const ins = async (v: ReturnType<typeof row>) => (await cutting.insertInto('CuttingPlan').values(v).output('inserted.Id').executeTakeFirstOrThrow()).Id;
    const empty = await ins(row(-91));
    const withCut = await ins(row(-92));
    await cutting.insertInto('CuttingPlanDaily').values({ CuttingPlanId: withCut, ColorName: 'X', SizeName: 'M', EntryDate: '2026-10-01', Qty: 5, BranchCode: BR }).execute();
    try {
      expect(await repo.syncFromPlans(null, async () => [])).toMatchObject({ skipped: true });
      expect(await cutting.selectFrom('CuttingPlan').select('Id').where('BranchCode', '=', BR).execute()).toHaveLength(2);
      expect(await repo.syncFromPlans(BR, async () => [])).toMatchObject({ removed: 1, detached: 1 });
      expect(await cutting.selectFrom('CuttingPlan').select('Id').where('Id', '=', empty).executeTakeFirst()).toBeUndefined();
      const kept = await cutting.selectFrom('CuttingPlan').select(['ShipmentPlanId', 'SourceDeletedAt']).where('Id', '=', withCut).executeTakeFirstOrThrow();
      expect(kept.ShipmentPlanId).toBeNull();
      expect(kept.SourceDeletedAt).not.toBeNull();
    } finally {
      await cutting.deleteFrom('CuttingPlanDaily').where('BranchCode', '=', BR).execute();
      await cutting.deleteFrom('CuttingPlan').where('BranchCode', '=', BR).execute();
    }
  });

  it('LK cắt của Kế hoạch xuất hàng lệch (sửa ngoài luồng, lần ghi sau khi lưu bị lỗi): lần mở màn sau đối chiếu lại theo Lũy kế (quyết định 13.6)', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const planId = await plan('A01', fx.orderA01, 'D', [['BLUE', 'S', 40]]);
    await list(planner);
    await save(planner, await copyId(planId), TODAY, [{ colorName: 'BLUE', sizeName: 'S', dayQty: 12 }]).expect(200);
    expect(await planCutQty(planId)).toBe(12);
    await order.updateTable('ShipmentPlan').set({ CutQty: 999 }).where('Id', '=', planId).execute();
    // Không cần kế hoạch đổi: mỗi lần mở màn đều đối chiếu, chỉ ghi dòng lệch
    await list(planner);
    expect(await planCutQty(planId)).toBe(12);
    // Màn Kế hoạch xuất hàng đọc đúng cột này
    const shipment = (await api().get(`/api/v1/order/shipment-plans?style=${STYLE}-D&pageSize=10`).set(auth(planner)).expect(200)).body;
    expect(shipment.items.find((r: any) => r.id === planId)?.cutQty).toBe(12);
  });

  it('xuất file theo chính sách cột', async () => {
    const res = await api().get(`/api/v1/cutting/progress/export?style=${STYLE}`).set(auth(await tokenFor('giamdoc', 'A01'))).expect(200);
    const text = res.text ?? res.body?.toString('utf8');
    expect(text).toContain('Lũy kế cắt');
    expect(text).toContain('+/-');
  });
});
