import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { env } from '../src/config/env';
import { ORDER_DB } from '../src/modules/order/order.db';
import type { OrderDb } from '../src/modules/order/order.types';
import { MAX_FILTER_VALUES, parseColumnFilters, presentValues, type FilterSpec } from '../src/platform/data/column-filter';
import { CORE_DB, type CoreDb } from '../src/platform/database/database.module';

// Phase 5.6 – lưới xem dữ liệu: 100 dòng đầu theo ngày tạo, lọc theo giá trị của cột trên máy chủ (quyết định 11.2, 11.4).

describe('Lọc theo cột: đọc tham số cf', () => {
  const spec: FilterSpec = {
    customerName: { expr: 'CustomerName', kind: 'text' },
    qty: { expr: 'Qty', kind: 'number' },
    shipDate: { expr: 'ShipDate', kind: 'date' },
  };

  it('đọc in, notIn; chuỗi rỗng là ô trống; số dạng chuỗi đổi thành số; bỏ giá trị lặp', () => {
    expect(parseColumnFilters(JSON.stringify({ customerName: { in: ['A', '', null, 'A'] }, qty: { notIn: ['10', 20] } }), spec)).toEqual([
      { field: 'customerName', mode: 'in', values: ['A', null] },
      { field: 'qty', mode: 'notIn', values: [10, 20] },
    ]);
    expect(parseColumnFilters(undefined, spec)).toEqual([]);
  });

  it('từ chối JSON sai, cột ngoài danh sách trắng, dạng lạ, ngày không có thật, quá nhiều giá trị', () => {
    const bad = (raw: string) => expect(() => parseColumnFilters(raw, spec)).toThrow();
    bad('{');
    bad('[]');
    bad(JSON.stringify({ unitPrice: { in: [1] } }));
    bad(JSON.stringify({ customerName: { in: ['A'], notIn: ['B'] } }));
    bad(JSON.stringify({ customerName: { like: 'A' } }));
    bad(JSON.stringify({ customerName: { in: 'A' } }));
    bad(JSON.stringify({ customerName: { in: [{ x: 1 }] } }));
    bad(JSON.stringify({ customerName: { in: ['x'.repeat(201)] } }));
    bad(JSON.stringify({ qty: { in: ['abc'] } }));
    bad(JSON.stringify({ shipDate: { in: ['2026-02-30'] } }));
    bad('{"__proto__":{"in":["A"]}}');
    bad(JSON.stringify({ customerName: { in: Array.from({ length: MAX_FILTER_VALUES + 1 }, (_v, i) => `K${i}`) } }));
  });

  it('giá trị trả về: ngày dạng YYYY-MM-DD, ô trống (kể cả chỉ có khoảng trắng) gộp một và xếp cuối', () => {
    expect(presentValues([null, '', '   ', 'B', 'A'], 'text')).toEqual(['B', 'A', null]);
    expect(parseColumnFilters(JSON.stringify({ customerName: { notIn: ['  '] } }), spec)).toEqual([{ field: 'customerName', mode: 'notIn', values: [null] }]);
    expect(presentValues([new Date('2026-10-01T00:00:00Z'), null], 'date')).toEqual(['2026-10-01', null]);
    expect(presentValues(['3.50', 2], 'number')).toEqual([3.5, 2]);
  });
});

describe('Lọc theo cột và lưới 100 dòng theo ngày tạo (cần SQL Server)', () => {
  let app: INestApplication;
  let order: OrderDb;
  let core: CoreDb;
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const STYLE = 'TEST-CF-FIX';
  const CUST = { a: 'KHÁCH CF MỘT', b: 'KHÁCH CF HAI', other: 'KHÁCH CF NHÀ MÁY KHÁC' };
  const cf = (v: object) => encodeURIComponent(JSON.stringify(v));
  let admin: string;
  let planner: string;

  async function tokenFor(username: string, branchCode: string) {
    const l = await api().post('/api/v1/auth/login').send({ username, password: env.demoPassword });
    const s = await api().post('/api/v1/auth/select-branch').set('Authorization', `Bearer ${l.body.preAuthToken}`).send({ branchCode });
    if (!s.body.accessToken) throw new Error(`Không chọn được ${branchCode} cho ${username}: ${JSON.stringify(s.body)}`);
    return s.body.accessToken as string;
  }

  async function dropFixture() {
    const orders = order.selectFrom('SalesOrder').select('Id').where('StyleCode', '=', STYLE);
    const plans = order.selectFrom('ShipmentPlan').select('Id').where('SalesOrderId', 'in', orders);
    await order.deleteFrom('ShipmentPlanLine').where('ShipmentPlanId', 'in', plans).execute();
    await order.deleteFrom('ShipmentPlanPo').where('ShipmentPlanId', 'in', plans).execute();
    await order.deleteFrom('ShipmentPlan').where('SalesOrderId', 'in', orders).execute();
    await order.deleteFrom('SalesOrderPo').where('SalesOrderId', 'in', orders).execute();
    await order.deleteFrom('SalesOrder').where('StyleCode', '=', STYLE).execute();
  }

  async function createFixture() {
    await dropFixture();
    const id = async (table: string, values: object) => ((await order.insertInto(table as any).values(values as any).output('inserted.Id' as any).executeTakeFirstOrThrow()) as { Id: number }).Id;
    const so = (no: string, customer: string, season: string | null, branch: string, createdAt: string) =>
      id('SalesOrder', { OrderNo: no, CustomerName: customer, StyleCode: STYLE, Season: season, ProductName: 'Áo test', Qty: 100, UnitName: 'Chiếc', ShipDate: '2027-12-31', StatusCode: 'NEW', BranchCode: branch, CreatedAt: new Date(createdAt) });
    // Ngày tạo ở tương lai xa: chắc chắn đứng đầu danh sách mặc định (mới tạo lên trước)
    const first = await so('TEST-CF-1', CUST.a, 'FW26', 'A01', '2099-01-03T10:00:00Z');
    await so('TEST-CF-2', CUST.b, null, 'A01', '2099-01-02T10:00:00Z');
    await so('TEST-CF-3', CUST.b, '', 'A01', '2099-01-01T10:00:00Z');
    // 23:30 UTC ngày 31/12 là 06:30 ngày 01/01 giờ Việt Nam
    await so('TEST-CF-4', CUST.a, 'SS27', 'A01', '2098-12-31T23:30:00Z');
    const other = await so('TEST-CF-X', CUST.other, 'FW26', 'A02', '2099-01-04T10:00:00Z');
    const planId = await id('ShipmentPlan', { PlanNo: 'TEST-CF-P1', SalesOrderId: first, CustomerName: CUST.a, StyleCode: STYLE, ProductName: 'Áo test', PoBuyDate: 'TEST-CF', PlanQty: 100, ShipDate: '2027-12-31', PlannerName: 'Test', StatusCode: 'SCHEDULED', BranchCode: 'A01' });
    // Kế hoạch xuất hàng vẫn theo ĐVCS: kế hoạch của A02 để kiểm phạm vi ĐVCS của popup giá trị
    await id('ShipmentPlan', { PlanNo: 'TEST-CF-P2', SalesOrderId: other, CustomerName: CUST.other, StyleCode: STYLE, ProductName: 'Áo test', PoBuyDate: 'TEST-CF', PlanQty: 100, ShipDate: '2027-12-31', PlannerName: 'Test', StatusCode: 'PLANNED', BranchCode: 'A02' });
    await id('ShipmentPlanLine', { ShipmentPlanId: planId, LineCode: 'A01-L03', Qty: 100, AvgOutput: 100, StartDate: '2027-11-02', ProductionDays: 1, OffDays: 0, EndDate: '2027-11-02', StatusCode: 'PLANNED', SortOrder: 0, BranchCode: 'A01' });
    const poId = await id('SalesOrderPo', { SalesOrderId: first, PoCode: 'TEST-CF-PO', PoNumber: 'TEST-CF-PO', CustomerName: CUST.a, StyleCode: STYLE, Qty: 100, ShipDate: '2027-12-31', StatusCode: 'DRAFT', BranchCode: 'A01', CreatedAt: new Date('2099-01-05T00:00:00Z') });
    // Màn Tỷ lệ cắt chỉ có PO nằm trong kế hoạch xuất hàng của ĐVCS đang làm việc (quyết định 7.4)
    await id('ShipmentPlanPo', { ShipmentPlanId: planId, SalesOrderPoId: poId, BranchCode: 'A01' });
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    order = app.get<OrderDb>(ORDER_DB);
    core = app.get<CoreDb>(CORE_DB);
    await createFixture();
    admin = await tokenFor('admin', 'A01');
    planner = await tokenFor('kehoach.a', 'A01');
  });

  afterAll(async () => {
    await dropFixture();
    await app.close();
  });

  const list = (t: string, path: string) => api().get(path).set(auth(t)).expect(200).then((r) => r.body);

  it('mặc định 100 dòng đầu, mới tạo lên trước (dữ liệu chép từ BRAVO cùng thời điểm nạp thì theo Id giảm dần)', async () => {
    const body = await list(admin, '/api/v1/order/sales-orders');
    expect(body.pageSize).toBe(100);
    // Đơn hàng dùng chung toàn công ty (quyết định 7.2): có cả đơn của A02 khi đang ở A01
    expect(body.items.slice(0, 5).map((i: any) => i.orderNo)).toEqual(['TEST-CF-X', 'TEST-CF-1', 'TEST-CF-2', 'TEST-CF-3', 'TEST-CF-4']);
    const times = body.items.map((i: any) => new Date(i.createdAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    for (const path of ['/api/v1/order/shipment-plans', '/api/v1/order/line-plans', '/api/v1/order/color-size', '/api/v1/order/cut-ratio/pos', '/api/v1/order/cut-ratio/styles']) {
      const b = await list(admin, path);
      expect(b.pageSize).toBe(100);
      const t = b.items.map((i: any) => new Date(i.createdAt).getTime());
      expect(t).toEqual([...t].sort((a, c) => c - a));
    }
  });

  it('lọc in, notIn, ô trống chạy trong DB và kết hợp với dải lọc', async () => {
    const nos = async (q: string) => (await list(planner, `/api/v1/order/sales-orders?style=${STYLE}&${q}`)).items.map((i: any) => i.orderNo).sort();
    expect(await nos(`cf=${cf({ customerName: { in: [CUST.a] } })}`)).toEqual(['TEST-CF-1', 'TEST-CF-4']);
    expect(await nos(`cf=${cf({ customerName: { notIn: [CUST.a] } })}`)).toEqual(['TEST-CF-2', 'TEST-CF-3', 'TEST-CF-X']);
    // Season trống gồm cả NULL lẫn chuỗi rỗng
    expect(await nos(`cf=${cf({ season: { in: [null] } })}`)).toEqual(['TEST-CF-2', 'TEST-CF-3']);
    expect(await nos(`cf=${cf({ season: { notIn: [null] } })}`)).toEqual(['TEST-CF-1', 'TEST-CF-4', 'TEST-CF-X']);
    expect(await nos(`cf=${cf({ season: { notIn: ['FW26'] } })}`)).toEqual(['TEST-CF-2', 'TEST-CF-3', 'TEST-CF-4']);
    expect(await nos(`cf=${cf({ season: { in: ['FW26', null] }, customerName: { in: [CUST.b] } })}`)).toEqual(['TEST-CF-2', 'TEST-CF-3']);
    // Ngày tạo lọc theo ngày giờ Việt Nam
    expect(await nos(`cf=${cf({ createdAt: { in: ['2099-01-01'] } })}`)).toEqual(['TEST-CF-3', 'TEST-CF-4']);
    // Đơn hàng dùng chung (quyết định 7.2): đơn của ĐVCS khác lọc ra được
    expect(await nos(`cf=${cf({ customerName: { in: [CUST.other] } })}`)).toEqual(['TEST-CF-X']);
    const total = (await list(planner, `/api/v1/order/sales-orders?style=${STYLE}&cf=${cf({ customerName: { in: [CUST.a] } })}`)).total;
    expect(total).toBe(2);
  });

  it('giá trị cho popup lấy từ DB trong phạm vi được xem, theo các bộ lọc khác, tìm thu hẹp được', async () => {
    const values = async (t: string, q: string) => (await list(t, `/api/v1/order/sales-orders/values?style=${STYLE}&${q}`)) as { values: unknown[]; truncated: boolean };
    const all = await values(planner, 'field=customerName');
    // Đơn hàng dùng chung (quyết định 7.2): có cả khách của đơn ĐVCS khác
    expect(all.values).toEqual(expect.arrayContaining([CUST.a, CUST.b, CUST.other]));
    expect(all.truncated).toBe(false);
    // Kế hoạch xuất hàng vẫn theo ĐVCS: ở A01 không thấy khách của kế hoạch A02; A00 xem mọi ĐVCS
    const planCustomers = async (t: string) => (await list(t, '/api/v1/order/shipment-plans/values?field=customerName&search=CF')).values as unknown[];
    expect(await planCustomers(planner)).toContain(CUST.a);
    expect(await planCustomers(planner)).not.toContain(CUST.other);
    const agg = await tokenFor('admin', 'A00');
    expect(await planCustomers(agg)).toEqual(expect.arrayContaining([CUST.a, CUST.other]));
    // Cột trống có mục (Trống) ở cuối
    const seasons = (await values(planner, 'field=season')).values;
    expect(seasons[seasons.length - 1]).toBeNull();
    // Theo bộ lọc của cột khác, không theo bộ lọc của chính cột đó
    expect((await values(planner, `field=season&cf=${cf({ customerName: { in: [CUST.a] } })}`)).values).toEqual(['FW26', 'SS27']);
    expect((await values(planner, `field=customerName&cf=${cf({ customerName: { in: [CUST.a] } })}`)).values).toEqual(expect.arrayContaining([CUST.a, CUST.b]));
    expect((await values(planner, 'field=customerName&search=hai')).values).toEqual([CUST.b]);
    // Cột ngày: mới nhất lên trước như lưới
    expect((await values(planner, 'field=createdAt&search=01/2099')).values).toEqual(['2099-01-04', '2099-01-03', '2099-01-02', '2099-01-01']);
  });

  it('cột ngoài danh sách trắng, cột giá, JSON sai: 422', async () => {
    await api().get('/api/v1/order/sales-orders/values?field=unitPrice').set(auth(planner)).expect(422);
    await api().get('/api/v1/order/sales-orders/values?field=Id;DROP').set(auth(planner)).expect(422);
    await api().get(`/api/v1/order/sales-orders?cf=${cf({ unitPrice: { in: [1] } })}`).set(auth(planner)).expect(422);
    await api().get(`/api/v1/order/sales-orders?cf=${encodeURIComponent('{"customerName":')}`).set(auth(planner)).expect(422);
    // Quá dài: câu báo nói rõ cách sửa, không phải "Dữ liệu không hợp lệ."
    const long = await api().get(`/api/v1/order/sales-orders?cf=${encodeURIComponent(JSON.stringify({ customerName: { in: Array.from({ length: 60 }, (_v, i) => `K${i}`.padEnd(150, 'x')) } }))}`).set(auth(planner)).expect(422);
    expect(long.body.error.message).toMatch(/quá dài/);
  });

  it('cột bị Che: không có giá trị (403), bộ lọc theo cột đó bị bỏ qua', async () => {
    const tc = await tokenFor('truongchuyen.a', 'A01');
    // Trưởng chuyền: khách hàng ở Xếp chuyền và Phân bổ màu cỡ bị Che (seed)
    const res = await api().get('/api/v1/order/line-plans/values?field=customerName').set(auth(tc)).expect(403);
    expect(res.body.error.code).toBe('FIELD_NOT_READABLE');
    await api().get('/api/v1/order/color-size/values?field=customerName').set(auth(tc)).expect(403);
    const total = async (q: string) => (await list(tc, `/api/v1/order/color-size${q}`)).total as number;
    expect(await total(`?cf=${cf({ customerName: { in: ['KHONG-CO-KHACH-NAY'] } })}`)).toBe(await total(''));
    // Cột chuyền xem được: lọc được
    expect((await list(tc, '/api/v1/order/color-size/values?field=lineCode')).values).toEqual(['A01-L03']);
  });

  it('cột tính từ bảng cha, bảng con (khách hàng của dòng dàn chuyền, ngày bắt đầu SX của kế hoạch) lọc được', async () => {
    expect((await list(planner, `/api/v1/order/color-size/values?field=customerName&search=${encodeURIComponent('CF MỘT')}`)).values).toEqual([CUST.a]);
    const lines = await list(planner, `/api/v1/order/color-size?cf=${cf({ customerName: { in: [CUST.a] }, startDate: { in: ['2027-11-02'] } })}`);
    expect(lines.items.map((i: any) => i.styleCode)).toEqual([STYLE]);
    const plans = await list(planner, `/api/v1/order/line-plans?cf=${cf({ startDate: { in: ['2027-11-02'] }, styleCode: { in: [STYLE] } })}`);
    expect(plans.items.map((i: any) => i.planNo)).toEqual(['TEST-CF-P1']);
    expect((await list(planner, `/api/v1/order/line-plans/values?field=scheduledQty&cf=${cf({ styleCode: { in: [STYLE] } })}`)).values).toEqual([100]);
  });

  it('Danh mục hệ thống: ô tìm mục danh mục chạy trong DB', async () => {
    const units = (await list(admin, '/api/v1/admin/catalogs/items/UNIT')).items;
    expect(units.length).toBeGreaterThan(0);
    const unit = (await list(admin, `/api/v1/admin/catalogs/items/UNIT?q=${encodeURIComponent(units[0].code)}`)).items;
    expect(unit.map((i: any) => i.code)).toContain(units[0].code);
    expect((await list(admin, '/api/v1/admin/catalogs/items/UNIT?q=KHONG-CO-MUC-NAY')).items).toEqual([]);
  });

  it('danh sách người dùng mặc định 100 dòng, tài khoản mới tạo lên đầu', async () => {
    const body = await list(admin, '/api/v1/admin/users');
    expect(body.pageSize).toBe(100);
    const ids: number[] = body.items.map((u: any) => u.id);
    expect(ids.length).toBeGreaterThan(1);
    const created = await core.selectFrom('SysUser').select(['Id', 'CreatedAt']).where('Id', 'in', ids).execute();
    const at = new Map(created.map((u) => [u.Id, new Date(u.CreatedAt).getTime()]));
    const times = ids.map((id) => at.get(id)!);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('danh sách mã hàng ở Tỷ lệ cắt có phân trang và lọc theo cột', async () => {
    const page = await list(planner, `/api/v1/order/cut-ratio/styles?pageSize=1&cf=${cf({ styleCode: { in: [STYLE] } })}`);
    expect(page).toMatchObject({ total: 1, page: 1, pageSize: 1 });
    expect(page.items[0]).toMatchObject({ styleCode: STYLE, customerName: CUST.a, poCount: 1 });
    expect((await list(planner, `/api/v1/order/cut-ratio/styles/values?field=styleCode&search=TEST-CF`)).values).toEqual([STYLE]);
    expect((await list(planner, `/api/v1/order/cut-ratio/pos/values?field=poNumber&search=TEST-CF`)).values).toEqual(['TEST-CF-PO']);
  });
});
