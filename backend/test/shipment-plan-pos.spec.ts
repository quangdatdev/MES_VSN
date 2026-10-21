import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { env } from '../src/config/env';
import { ORDER_DB } from '../src/modules/order/order.db';
import type { OrderDb } from '../src/modules/order/order.types';

// Lưới "PO của kế hoạch" dưới danh sách Kế hoạch xuất hàng (task 5.9.14), chạy trên database thật đã migrate và seed. Đơn hàng,
// PO, kế hoạch của bài thử ghi thẳng vào MES_Order ở A01 với mã hàng riêng; nhà máy SX thử thêm vào danh mục; dọn khi xong.
const STYLE = 'TEST-SPP-FIXTURE';
const FACTORY = 'TEST-SPP-F';
const TEST_PASSWORD = 'Test@2026x';

describe('Kế hoạch xuất hàng: PO của kế hoạch', () => {
  let app: INestApplication;
  let order: OrderDb;
  let admin: string;
  let planner: string;
  let roles: { id: number; code: string }[];
  let resources: { id: number; code: string }[];
  let permissions: { id: number; code: string }[];
  let factoryId = 0;
  const fx = { orderId: 0, planId: 0, draftPo: 0, confirmedPo: 0, systemPo: 0, freePo: 0, freeConfirmedPo: 0 };
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const roleId = (code: string) => roles.find((r) => r.code === code)!.id;
  const resId = (code: string) => resources.find((r) => r.code === code)!.id;
  const permId = (code: string) => permissions.find((p) => p.code === code)!.id;
  const userId = async (username: string) => (await api().get(`/api/v1/admin/users?q=${username}`).set(auth(admin))).body.items.find((u: any) => u.username === username).id as number;
  const setRolePolicy = (role: string, resource: string, field: string, level: string | null) =>
    api().put(`/api/v1/admin/roles/${roleId(role)}/field-policies`).set(auth(admin)).send({ resourceId: resId(resource), policies: [{ fieldCode: field, accessLevel: level }] }).expect(200);
  const posOf = async (token: string, planId = fx.planId) => (await api().get(`/api/v1/order/shipment-plans/${planId}/pos`).set(auth(token)).expect(200)).body as { items: any[]; hiddenCount: number };

  async function tokenFor(username: string, branchCode: string, password = env.demoPassword) {
    const l = await api().post('/api/v1/auth/login').send({ username, password });
    const s = await api().post('/api/v1/auth/select-branch').set('Authorization', `Bearer ${l.body.preAuthToken}`).send({ branchCode });
    if (!s.body.accessToken) throw new Error(`Không chọn được ${branchCode} cho ${username}: ${JSON.stringify(s.body)}`);
    return s.body.accessToken as string;
  }

  const id = async (table: string, values: object) => ((await order.insertInto(table as any).values(values as any).output('inserted.Id' as any).executeTakeFirstOrThrow()) as { Id: number }).Id;
  const head = { CustomerName: 'KHÁCH TEST SPP', StyleCode: STYLE, BranchCode: 'A01' };

  /** Kế hoạch ở A01 gắn các PO `poIds`; `createdBy`: người lập (phạm vi "chỉ bản ghi do mình tạo") */
  async function plan(no: string, poIds: number[], createdBy: number) {
    const planId = await id('ShipmentPlan', { ...head, PlanNo: no, SalesOrderId: fx.orderId, ProductName: 'Áo test', PoBuyDate: 'SPP / 30-06', PlanQty: 900, CmPrice: 2, ShipDate: '2027-06-30', PlannerName: 'Test', StatusCode: 'PLANNED', CreatedBy: createdBy });
    for (const poId of poIds) await order.insertInto('ShipmentPlanPo').values({ ShipmentPlanId: planId, SalesOrderPoId: poId, BranchCode: 'A01', CreatedBy: createdBy } as any).execute();
    return planId;
  }

  async function po(no: string, qty: number, shipDate: string, confirmed: boolean, createdBy: number | null, confirmedBy: number | null = null) {
    return id('SalesOrderPo', {
      ...head,
      SalesOrderId: fx.orderId,
      PoCode: no,
      PoNumber: no,
      Qty: qty,
      Destination: 'DE',
      ShipDate: shipDate,
      StatusCode: confirmed ? 'CONFIRMED' : 'DRAFT',
      ConfirmedAt: confirmed ? new Date('2026-10-10T03:00:00Z') : null,
      ConfirmedBy: confirmedBy,
      CreatedBy: createdBy,
    });
  }

  async function dropFixture() {
    const orders = order.selectFrom('SalesOrder').select('Id').where('StyleCode', '=', STYLE);
    const plans = order.selectFrom('ShipmentPlan').select('Id').where('SalesOrderId', 'in', orders);
    await order.deleteFrom('ShipmentPlanPo').where('ShipmentPlanId', 'in', plans).execute();
    await order.deleteFrom('ShipmentPlan').where('SalesOrderId', 'in', orders).execute();
    await order.deleteFrom('SalesOrderPo').where('SalesOrderId', 'in', orders).execute();
    await order.deleteFrom('SalesOrder').where('StyleCode', '=', STYLE).execute();
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    order = app.get<OrderDb>(ORDER_DB);
    admin = await tokenFor('admin', 'A01');
    roles = (await api().get('/api/v1/admin/roles').set(auth(admin))).body;
    const matrix = (await api().get('/api/v1/admin/permissions').set(auth(admin))).body;
    resources = matrix.modules.flatMap((m: any) => m.resources);
    permissions = resources.flatMap((r: any) => r.permissions);
    // Nhà máy SX của A01 cho đơn thử: popup Chọn mã hàng ở A01 mở được PO của đơn
    const found = ((await api().get(`/api/v1/admin/catalogs/factories?q=${FACTORY}`).set(auth(admin)).expect(200)).body as { id: number; code: string }[]).find((f) => f.code === FACTORY);
    if (found) {
      factoryId = found.id;
      await api().put(`/api/v1/admin/catalogs/factories/${found.id}`).set(auth(admin)).send({ isActive: true, branchCode: 'A01' }).expect(200);
    } else {
      factoryId = (await api().post('/api/v1/admin/catalogs/factories').set(auth(admin)).send({ code: FACTORY, name: 'Nhà máy test PO của kế hoạch', branchCode: 'A01' }).expect(201)).body.id;
    }
    await dropFixture();
    const kh = await userId('kehoach.a');
    fx.orderId = await id('SalesOrder', { ...head, OrderNo: 'TEST-SPP', ProductName: 'Áo test', Qty: 3700, UnitName: 'Chiếc', ShipDate: '2027-06-30', StatusCode: 'PLANNING', ProductionFactoryCode: FACTORY, CreatedBy: kh });
    // PO chưa xác nhận nạp từ hệ thống nguồn (CreatedBy trống), PO người dùng xác nhận, PO BRAVO đã đóng lệnh (xác nhận bởi hệ thống)
    fx.draftPo = await po('TEST-SPP-1', 3000, '2027-06-30', false, null);
    fx.confirmedPo = await po('TEST-SPP-2', 200, '2027-05-31', true, kh, kh);
    fx.systemPo = await po('TEST-SPP-3', 500, '2027-06-30', true, null);
    fx.planId = await plan('TEST-SPP-PLAN', [fx.draftPo, fx.confirmedPo, fx.systemPo], kh);
    // Hai PO chưa vào kế hoạch nào: popup chọn PO (Thêm mới, "Chọn mã hàng" khi Sửa) chỉ có hai PO này (quyết định 15.2)
    fx.freePo = await po('TEST-SPP-7', 100, '2027-06-30', false, null);
    fx.freeConfirmedPo = await po('TEST-SPP-8', 100, '2027-05-31', true, kh, kh);
    planner = await tokenFor('kehoach.a', 'A01');
  });

  afterAll(async () => {
    if (order) await dropFixture();
    if (factoryId) await api().put(`/api/v1/admin/catalogs/factories/${factoryId}`).set(auth(admin)).send({ isActive: false }).expect(200);
    await app?.close();
  });

  it('PO của kế hoạch theo ngày xuất, số PO; SL đã xác nhận, chưa xác nhận tính theo cả PO', async () => {
    const body = await posOf(planner);
    expect(body.hiddenCount).toBe(0);
    expect(body.items.map((r) => [r.poNumber, r.statusCode, r.qty, r.confirmedQty, r.unconfirmedQty])).toEqual([
      ['TEST-SPP-2', 'CONFIRMED', 200, 200, 0],
      ['TEST-SPP-1', 'DRAFT', 3000, 0, 3000],
      ['TEST-SPP-3', 'CONFIRMED', 500, 500, 0],
    ]);
    expect(body.items[0]).toMatchObject({ id: fx.confirmedPo, poCode: 'TEST-SPP-2', destination: 'DE', shipDate: '2027-05-31', confirmedAt: '2026-10-10T03:00:00.000Z' });
    expect(body.items[1].confirmedAt).toBeNull();
  });

  it('kế hoạch theo ĐVCS: ĐVCS khác không thấy (404), đơn vị tổng hợp xem được; kế hoạch không có thì 404', async () => {
    // Lấy token trước: supertest mở cổng tạm cho từng request, request lồng trong request đang dựng thì cổng đã đóng
    const [a02, a00] = [await tokenFor('admin', 'A02'), await tokenFor('giamdoc', 'A00')];
    await api().get(`/api/v1/order/shipment-plans/${fx.planId}/pos`).set(auth(a02)).expect(404);
    expect((await posOf(a00)).items).toHaveLength(3);
    await api().get('/api/v1/order/shipment-plans/999999999/pos').set(auth(planner)).expect(404);
  });

  it('không có quyền xem PO (Cập nhật tỷ lệ cắt) thì 403, dù xem được kế hoạch', async () => {
    const kh = await userId('kehoach.a');
    await api().post(`/api/v1/admin/users/${kh}/overrides`).set(auth(admin)).send({ permissionId: permId('order.po:view'), effect: 'DENY', reason: 'Thử chặn xem PO (test)' }).expect(200);
    const ov = (await api().get(`/api/v1/admin/users/${kh}/access`).set(auth(admin))).body.overrides.find((o: any) => o.permissionCode === 'order.po:view');
    try {
      await api().get(`/api/v1/order/shipment-plans/${fx.planId}`).set(auth(planner)).expect(200);
      expect((await api().get(`/api/v1/order/shipment-plans/${fx.planId}/pos`).set(auth(planner)).expect(403)).body.error.code).toBe('PERMISSION_DENIED');
    } finally {
      await api().delete(`/api/v1/admin/users/${kh}/overrides/${ov.id}`).set(auth(admin)).expect(200);
    }
    await posOf(planner);
  });

  it('chính sách cột của PO: Số lượng bị Che thì hai cột SL cũng che; Trạng thái bị Ẩn thì bỏ cả Ngày xác nhận và hai cột SL', async () => {
    await setRolePolicy('PLANNER', 'order.po', 'qty', 'MASKED');
    try {
      const body = await posOf(planner);
      expect(body.items.map((r) => [r.qty, r.confirmedQty, r.unconfirmedQty])).toEqual(Array(3).fill(['***', '***', '***']));
      expect(body.items.map((r) => r.statusCode)).toEqual(['CONFIRMED', 'DRAFT', 'CONFIRMED']);
    } finally {
      await setRolePolicy('PLANNER', 'order.po', 'qty', null);
    }
    await setRolePolicy('PLANNER', 'order.po', 'statusCode', 'HIDDEN');
    try {
      const body = await posOf(planner);
      for (const r of body.items) {
        expect(r).not.toHaveProperty('statusCode');
        expect(r).not.toHaveProperty('confirmedAt');
        expect(r).not.toHaveProperty('confirmedQty');
        expect(r).not.toHaveProperty('unconfirmedQty');
      }
      expect(body.items.map((r) => r.qty)).toEqual([200, 3000, 500]);
    } finally {
      await setRolePolicy('PLANNER', 'order.po', 'statusCode', null);
    }
  });

  it('popup chọn PO chỉ có PO chưa nằm trong kế hoạch nào, cả khi Thêm mới và "Chọn mã hàng" khi Sửa (quyết định 15.2)', async () => {
    const created = (await api().get(`/api/v1/order/shipment-plans/candidates/${fx.orderId}/pos`).set(auth(planner)).expect(200)).body as any[];
    expect(created.map((p) => p.poNumber)).toEqual(['TEST-SPP-8', 'TEST-SPP-7']);
    const edit = (await api().get(`/api/v1/order/shipment-plans/${fx.planId}/candidate-pos`).set(auth(planner)).expect(200)).body as any[];
    expect(edit.map((p) => p.id)).toEqual([fx.freeConfirmedPo, fx.freePo]);
    expect(edit[0]).toMatchObject({ statusCode: 'CONFIRMED', qty: 100, shipDate: '2027-05-31' });
    // Kế hoạch ĐVCS khác: 404; không có quyền xem PO: 403. Lấy token trước (xem bài kế hoạch theo ĐVCS)
    const a02 = await tokenFor('admin', 'A02');
    await api().get(`/api/v1/order/shipment-plans/${fx.planId}/candidate-pos`).set(auth(a02)).expect(404);
    const kh = await userId('kehoach.a');
    await api().post(`/api/v1/admin/users/${kh}/overrides`).set(auth(admin)).send({ permissionId: permId('order.po:view'), effect: 'DENY', reason: 'Thử chặn xem PO (test)' }).expect(200);
    const ov = (await api().get(`/api/v1/admin/users/${kh}/access`).set(auth(admin))).body.overrides.find((o: any) => o.permissionCode === 'order.po:view');
    try {
      await api().get(`/api/v1/order/shipment-plans/${fx.planId}/candidate-pos`).set(auth(planner)).expect(403);
    } finally {
      await api().delete(`/api/v1/admin/users/${kh}/overrides/${ov.id}`).set(auth(admin)).expect(200);
    }
  });

  it('Ngày xuất bị Ẩn thì không xếp theo ngày xuất (lộ thứ tự ngày): xếp theo PO#, cả popup Chọn mã hàng', async () => {
    await setRolePolicy('PLANNER', 'order.po', 'shipDate', 'HIDDEN');
    try {
      expect((await posOf(planner)).items.map((r) => r.poNumber)).toEqual(['TEST-SPP-1', 'TEST-SPP-2', 'TEST-SPP-3']);
      const candidates = (await api().get(`/api/v1/order/shipment-plans/candidates/${fx.orderId}/pos`).set(auth(planner)).expect(200)).body as any[];
      expect(candidates.map((p) => p.poNumber)).toEqual(['TEST-SPP-7', 'TEST-SPP-8']);
      expect(candidates[0]).not.toHaveProperty('shipDate');
      const edit = (await api().get(`/api/v1/order/shipment-plans/${fx.planId}/candidate-pos`).set(auth(planner)).expect(200)).body as any[];
      expect(edit.map((p) => p.poNumber)).toEqual(['TEST-SPP-7', 'TEST-SPP-8']);
    } finally {
      await setRolePolicy('PLANNER', 'order.po', 'shipDate', null);
    }
  });

  it('cột cùng tên của Kế hoạch xuất hàng bị Ẩn không làm mất cột của PO (lưới PO của kế hoạch và popup Chọn mã hàng)', async () => {
    await setRolePolicy('PLANNER', 'order.shipment', 'statusCode', 'HIDDEN');
    await setRolePolicy('PLANNER', 'order.shipment', 'shipDate', 'HIDDEN');
    try {
      const body = await posOf(planner);
      expect(body.items.map((r) => [r.statusCode, r.shipDate])).toEqual([
        ['CONFIRMED', '2027-05-31'],
        ['DRAFT', '2027-06-30'],
        ['CONFIRMED', '2027-06-30'],
      ]);
      const candidates = (await api().get(`/api/v1/order/shipment-plans/candidates/${fx.orderId}/pos`).set(auth(planner)).expect(200)).body as any[];
      expect(candidates.find((p) => p.id === fx.freeConfirmedPo)).toMatchObject({ statusCode: 'CONFIRMED', shipDate: '2027-05-31' });
      // Lưới kế hoạch vẫn theo chính sách của Kế hoạch xuất hàng
      const plans = (await api().get(`/api/v1/order/shipment-plans?style=${STYLE}`).set(auth(planner)).expect(200)).body.items as any[];
      expect(plans[0]).not.toHaveProperty('statusCode');
    } finally {
      await setRolePolicy('PLANNER', 'order.shipment', 'statusCode', null);
      await setRolePolicy('PLANNER', 'order.shipment', 'shipDate', null);
    }
  });

  it('PO ngoài phạm vi được xem ở Cập nhật tỷ lệ cắt (chỉ bản ghi do mình tạo) không hiện, đếm ở hiddenCount', async () => {
    const username = 'test.spp.own';
    const created = await api().post('/api/v1/admin/users').set(auth(admin)).send({ username, fullName: `${username} (test)`, initialPassword: TEST_PASSWORD });
    const uid = created.status === 201 ? (created.body.id as number) : await userId(username);
    if (created.status !== 201) {
      await api().post(`/api/v1/admin/users/${uid}/reset-password`).set(auth(admin)).send({ newPassword: TEST_PASSWORD }).expect(200);
      await api().put(`/api/v1/admin/users/${uid}`).set(auth(admin)).send({ isActive: true, unlock: true }).expect(200);
    }
    try {
      const branches = (await api().get('/api/v1/admin/branches').set(auth(admin))).body as { id: number; code: string }[];
      await api().put(`/api/v1/admin/users/${uid}/roles`).set(auth(admin)).send({ roleIds: [roleId('PLANNER')] }).expect(200);
      await api().put(`/api/v1/admin/users/${uid}/branches`).set(auth(admin)).send({ branchIds: branches.filter((b) => b.code === 'A01').map((b) => b.id) }).expect(200);
      await api().put(`/api/v1/admin/users/${uid}/roles/${roleId('PLANNER')}/scope`).set(auth(admin)).send({ scopes: [{ dimension: 'OWNER', mode: 'OWN' }] }).expect(200);
      // Kế hoạch do người này lập, gắn một PO của họ và hai PO của người khác
      const mine = await po('TEST-SPP-4', 100, '2027-06-30', false, uid);
      const ownPlan = await plan('TEST-SPP-OWN', [mine, fx.draftPo, fx.confirmedPo], uid);
      const body = await posOf(await tokenFor(username, 'A01', TEST_PASSWORD), ownPlan);
      expect(body.items.map((r) => r.id)).toEqual([mine]);
      expect(body.hiddenCount).toBe(2);
    } finally {
      await api().put(`/api/v1/admin/users/${uid}/roles`).set(auth(admin)).send({ roleIds: [] }).expect(200);
      await api().put(`/api/v1/admin/users/${uid}`).set(auth(admin)).send({ isActive: false }).expect(200);
    }
  });
});
