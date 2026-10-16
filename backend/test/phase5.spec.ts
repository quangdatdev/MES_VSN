import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'kysely';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { env } from '../src/config/env';
import { isDeadlock } from '../src/common/db-errors';
import { AllExceptionsFilter } from '../src/common/http-exception.filter';
import { HR_DB } from '../src/modules/hr/hr.db';
import { HrLineSource } from '../src/modules/hr/hr-line-source';
import type { HrDb } from '../src/modules/hr/hr.types';
import { ORDER_DB } from '../src/modules/order/order.db';
import type { OrderDb } from '../src/modules/order/order.types';
import { inTransaction } from '../src/platform/data/transaction';
import { CORE_DB, type CoreDb } from '../src/platform/database/database.module';
import { OrgService } from '../src/platform/org/org.service';
import { PermissionService } from '../src/platform/permission/permission.service';

// Phase 5.1 (L3 phạm vi theo phép gán, L4 cột, L5 ngoại lệ – ADR 0005) và module Đơn hàng (Phase 5.3, ADR 0006).
// Cần MES_Core + MES_Order đã migrate và seed. Đơn hàng có thể là dữ liệu giả của seed hoặc dữ liệu BRAVO (npm run load:bravo):
// test tự tạo đơn hàng riêng (FIXTURE_STYLE) cho phần cần giá CM hay kế hoạch chưa xếp chuyền, xóa khi xong.
describe('Phase 5: phạm vi, cột, ngoại lệ, module Đơn hàng', () => {
  let app: INestApplication;
  let core: CoreDb;
  const api = () => request(app.getHttpServer());
  const PASSWORD = env.demoPassword;
  const TEST_PASSWORD = 'Test@2026x';
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function tokenFor(username: string, branchCode: string, password = PASSWORD) {
    const l = await api().post('/api/v1/auth/login').send({ username, password });
    const s = await api().post('/api/v1/auth/select-branch').set('Authorization', `Bearer ${l.body.preAuthToken}`).send({ branchCode });
    if (!s.body.accessToken) throw new Error(`Không chọn được ${branchCode} cho ${username}: ${JSON.stringify(s.body)}`);
    return s.body.accessToken as string;
  }

  let admin: string;
  let roles: { id: number; code: string }[];
  let branches: { id: number; code: string }[];
  let permissions: { id: number; code: string }[];
  let resources: { id: number; code: string }[];
  let orgUnits: { id: number; code: string }[];
  const roleId = (code: string) => roles.find((r) => r.code === code)!.id;
  const permId = (code: string) => permissions.find((p) => p.code === code)!.id;
  const resId = (code: string) => resources.find((r) => r.code === code)!.id;
  const orgId = (code: string) => orgUnits.find((o) => o.code === code)!.id;
  const userId = async (username: string) => (await api().get(`/api/v1/admin/users?q=${username}`).set(auth(admin))).body.items.find((u: any) => u.username === username).id as number;
  const perms = async (t: string) => (await api().get('/api/v1/me/permissions').set(auth(t)).expect(200)).body.permissions as string[];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const setRolePolicy = (role: string, resource: string, field: string, level: string | null) =>
    api().put(`/api/v1/admin/roles/${roleId(role)}/field-policies`).set(auth(admin)).send({ resourceId: resId(resource), policies: [{ fieldCode: field, accessLevel: level }] }).expect(200);

  /** Tài khoản thử: tạo (hoặc bật lại), gán vai trò, ĐVCS, phạm vi. Trả Id; dọn bằng dropUser. */
  async function tempUser(
    username: string,
    roleCodes: string[],
    branchCodes: string[],
    scopes: Record<string, { dimension: string; mode: string; orgUnitId?: number; value?: string }[]> = {},
  ) {
    const created = await api().post('/api/v1/admin/users').set(auth(admin)).send({ username, fullName: `${username} (test)`, initialPassword: TEST_PASSWORD });
    const id = created.status === 201 ? (created.body.id as number) : await userId(username);
    if (created.status !== 201) {
      await api().post(`/api/v1/admin/users/${id}/reset-password`).set(auth(admin)).send({ newPassword: TEST_PASSWORD }).expect(200);
      await api().put(`/api/v1/admin/users/${id}`).set(auth(admin)).send({ isActive: true, unlock: true }).expect(200);
    }
    await api().put(`/api/v1/admin/users/${id}/roles`).set(auth(admin)).send({ roleIds: [] }).expect(200);
    await api().put(`/api/v1/admin/users/${id}/roles`).set(auth(admin)).send({ roleIds: roleCodes.map(roleId) }).expect(200);
    await api()
      .put(`/api/v1/admin/users/${id}/branches`)
      .set(auth(admin))
      .send({ branchIds: branches.filter((b) => branchCodes.includes(b.code)).map((b) => b.id) })
      .expect(200);
    for (const [role, rows] of Object.entries(scopes)) {
      await api().put(`/api/v1/admin/users/${id}/roles/${roleId(role)}/scope`).set(auth(admin)).send({ scopes: rows }).expect(200);
    }
    return id;
  }
  async function dropUser(id: number) {
    const access = (await api().get(`/api/v1/admin/users/${id}/access`).set(auth(admin))).body;
    for (const o of access.overrides) await api().delete(`/api/v1/admin/users/${id}/overrides/${o.id}`).set(auth(admin)).expect(204);
    await api().put(`/api/v1/admin/users/${id}/roles`).set(auth(admin)).send({ roleIds: [] }).expect(200);
    await api().put(`/api/v1/admin/users/${id}`).set(auth(admin)).send({ isActive: false }).expect(200);
  }

  /**
   * Đơn hàng riêng của test ở A01: PO 1 (Chưa xác nhận) 3.000 sp (2 màu × 3 cỡ × 500), PO 2 (Đã xác nhận) 200 sp màu Xanh,
   * giá CM 2,5. Kế hoạch 1 (1.200 sp) chưa xếp chuyền; kế hoạch 2 (600 sp, đang sản xuất) xếp ở chuyền 3 (đã phân màu cỡ)
   * và chuyền 5 (đang may). Còn 200 sp mỗi màu cỡ của PO 1 để lập thêm.
   */
  const FIXTURE_STYLE = 'TEST-P5-FIXTURE';
  /**
   * Nhà máy SX của đơn hàng test (danh sách như OSM): nhà máy F thuộc ĐVCS A01, nhà máy G thuộc A02 (khác Chi nhánh FOB A01 của
   * đơn). Lập kế hoạch được ở cả A01 và A02 (ADR 0013 mục 11)
   */
  const FIXTURE_FACTORY = 'TEST-P5-F';
  const FIXTURE_FACTORY_B = 'TEST-P5-G';
  const FIXTURE_FACTORIES = `${FIXTURE_FACTORY},${FIXTURE_FACTORY_B}`;
  const fixture = { orderId: 0, planId: 0, poId: 0, confirmedPoId: 0, factoryIds: [] as number[] };
  const COLORS = ['Đen', 'Trắng'];
  const SIZES = ['S', 'M', 'L'];
  const grid = <T>(f: (color: string, size: string, i: number) => T) => COLORS.flatMap((c, ci) => SIZES.map((s, si) => f(c, s, ci * SIZES.length + si)));

  async function dropFixture(order: OrderDb) {
    const orders = order.selectFrom('SalesOrder').select('Id').where('StyleCode', '=', FIXTURE_STYLE).where('BranchCode', '=', 'A01');
    const plans = order.selectFrom('ShipmentPlan').select('Id').where('SalesOrderId', 'in', orders);
    const lines = order.selectFrom('ShipmentPlanLine').select('Id').where('ShipmentPlanId', 'in', plans);
    const pos = order.selectFrom('SalesOrderPo').select('Id').where('SalesOrderId', 'in', orders);
    await order.deleteFrom('ShipmentPlanLineColorSize').where('ShipmentPlanLineId', 'in', lines).execute();
    await order.deleteFrom('ShipmentPlanLine').where('ShipmentPlanId', 'in', plans).execute();
    await order.deleteFrom('ShipmentPlanColorSize').where('ShipmentPlanId', 'in', plans).execute();
    await order.deleteFrom('ShipmentPlanPo').where('ShipmentPlanId', 'in', plans).execute();
    await order.deleteFrom('ShipmentPlan').where('SalesOrderId', 'in', orders).execute();
    await order.deleteFrom('SalesOrderPoColorSize').where('SalesOrderPoId', 'in', pos).execute();
    await order.deleteFrom('SalesOrderPo').where('SalesOrderId', 'in', orders).execute();
    await order.deleteFrom('SalesOrder').where('StyleCode', '=', FIXTURE_STYLE).where('BranchCode', '=', 'A01').execute();
  }

  async function createFixture(order: OrderDb) {
    await dropFixture(order); // bản sót của lần chạy trước bị ngắt giữa chừng
    const own = { BranchCode: 'A01', CreatedBy: await userId('kehoach.a') };
    const head = { CustomerName: 'KHÁCH TEST P5', StyleCode: FIXTURE_STYLE };
    const id = async (table: string, values: object) => ((await order.insertInto(table as any).values(values as any).output('inserted.Id' as any).executeTakeFirstOrThrow()) as { Id: number }).Id;
    fixture.orderId = await id('SalesOrder', { ...head, OrderNo: 'TEST-P5', ProductName: 'Áo test', Qty: 3000, UnitName: 'Chiếc', UnitPrice: 8, CmPrice: 2.5, ShipDate: '2027-06-30', StatusCode: 'PLANNING', ProductionFactoryCode: FIXTURE_FACTORIES, ...own });
    const poId = await id('SalesOrderPo', { ...head, SalesOrderId: fixture.orderId, PoCode: 'TEST-P5', PoNumber: 'TEST-P5', Qty: 3000, ShipDate: '2027-06-30', StatusCode: 'DRAFT', ...own });
    fixture.poId = poId;
    await order.insertInto('SalesOrderPoColorSize').values(grid((c, s, i) => ({ SalesOrderPoId: poId, ColorName: c, SizeName: s, Qty: 500, SortOrder: i, ...own })) as any).execute();
    fixture.confirmedPoId = await id('SalesOrderPo', { ...head, SalesOrderId: fixture.orderId, PoCode: 'TEST-P5-C', PoNumber: 'TEST-P5-C', Qty: 200, ShipDate: '2027-06-30', StatusCode: 'CONFIRMED', ConfirmedAt: new Date(), ConfirmedBy: own.CreatedBy, ...own });
    await order
      .insertInto('SalesOrderPoColorSize')
      .values(['S', 'M'].map((s, i) => ({ SalesOrderPoId: fixture.confirmedPoId, ColorName: 'Xanh', SizeName: s, Qty: 100, SortOrder: i, ...own })) as any)
      .execute();
    const plan = async (no: string, each: number, status: string) => {
      const planId = await id('ShipmentPlan', { ...head, PlanNo: no, SalesOrderId: fixture.orderId, ProductName: 'Áo test', PoBuyDate: 'TEST-P5 / 30-06', PlanQty: each * 6, CmPrice: 2.5, ShipDate: '2027-06-30', PlannerName: 'Test', StatusCode: status, ...own });
      await order.insertInto('ShipmentPlanPo').values({ ShipmentPlanId: planId, SalesOrderPoId: poId, ...own } as any).execute();
      await order.insertInto('ShipmentPlanColorSize').values(grid((c, s, i) => ({ ShipmentPlanId: planId, ColorName: c, SizeName: s, OriginalQty: 500, PlanQty: each, SortOrder: i, ...own })) as any).execute();
      return planId;
    };
    fixture.planId = await plan('TEST-P5-1', 200, 'PLANNED');
    const scheduled = await plan('TEST-P5-2', 100, 'IN_PRODUCTION');
    for (const [m, [lineCode, status]] of [['A01-L03', 'ALLOCATED'], ['A01-L05', 'IN_PRODUCTION']].entries()) {
      const lineId = await id('ShipmentPlanLine', { ShipmentPlanId: scheduled, LineCode: lineCode, Qty: 300, AvgOutput: 300, StartDate: '2026-11-02', ProductionDays: 1, OffDays: 0, EndDate: '2026-11-02', StatusCode: status, SortOrder: m, ...own });
      await order.insertInto('ShipmentPlanLineColorSize').values(grid((c, s, i) => ({ ShipmentPlanLineId: lineId, ColorName: c, SizeName: s, PlanQty: 50, AssignedQty: 50, SortOrder: i, ...own })) as any).execute();
    }
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    // Lắng nghe sẵn để các request chạy song song (kiểm tra tranh chấp) dùng chung một cổng
    await app.listen(0);
    core = app.get<CoreDb>(CORE_DB);
    admin = await tokenFor('admin', 'A01');
    roles = (await api().get('/api/v1/admin/roles').set(auth(admin))).body;
    branches = (await api().get('/api/v1/admin/branches').set(auth(admin))).body;
    const matrix = (await api().get('/api/v1/admin/permissions').set(auth(admin))).body;
    resources = matrix.modules.flatMap((m: any) => m.resources);
    permissions = resources.flatMap((r: any) => r.permissions);
    orgUnits = (await api().get('/api/v1/admin/scope-catalog').set(auth(admin))).body.orgUnits;
    // Nhà máy SX của đơn hàng test (tạo hoặc bật lại, gắn đúng ĐVCS): popup Chọn mã hàng ở A01 và A02 thấy đơn đó
    for (const [code, branchCode] of [[FIXTURE_FACTORY, 'A01'], [FIXTURE_FACTORY_B, 'A02']]) {
      const factories = (await api().get(`/api/v1/admin/catalogs/factories?q=${code}`).set(auth(admin)).expect(200)).body as { id: number; code: string }[];
      const existing = factories.find((f) => f.code === code);
      if (existing) {
        fixture.factoryIds.push(existing.id);
        await api().put(`/api/v1/admin/catalogs/factories/${existing.id}`).set(auth(admin)).send({ isActive: true, branchCode }).expect(200);
      } else {
        fixture.factoryIds.push((await api().post('/api/v1/admin/catalogs/factories').set(auth(admin)).send({ code, name: `Nhà máy test P5 ${branchCode}`, branchCode }).expect(201)).body.id);
      }
    }
    await createFixture(app.get<OrderDb>(ORDER_DB));
  });

  afterAll(async () => {
    await dropFixture(app.get<OrderDb>(ORDER_DB));
    for (const id of fixture.factoryIds) await api().put(`/api/v1/admin/catalogs/factories/${id}`).set(auth(admin)).send({ isActive: false }).expect(200);
    await app.close();
  });

  // ---------------- L3 ----------------
  describe('L3 – phạm vi theo phép gán', () => {
    it('Phân bổ màu cỡ gom một dòng mỗi kế hoạch (phase 5.13); Trưởng chuyền 3 chỉ thấy kế hoạch có chuyền 3, chỉ chuyền 3; kế hoạch không có chuyền 3 trả 404 khi xem và sửa', async () => {
      const tc = await tokenFor('truongchuyen.a', 'A01');
      const planner = await tokenFor('kehoach.a', 'A01');
      const mine = (await api().get('/api/v1/order/color-size?pageSize=200').set(auth(tc)).expect(200)).body;
      expect(mine.total).toBeGreaterThan(0);
      expect(new Set(mine.items.flatMap((i: any) => i.lineCode))).toEqual(new Set(['A01-L03']));

      const all = (await api().get('/api/v1/order/color-size?pageSize=200').set(auth(planner)).expect(200)).body;
      expect(all.total).toBeGreaterThan(mine.total);
      // Mỗi kế hoạch một dòng (id là Id kế hoạch)
      expect(new Set(all.items.map((i: any) => i.id)).size).toBe(all.items.length);
      // Kế hoạch xếp hai chuyền: một dòng, chuyền nối theo thứ tự dàn chuyền, NSBQ trung bình; SL kế hoạch, tổng giao, trạng
      // thái là của cả kế hoạch
      const fixturePlan = (await api().get(`/api/v1/order/color-size?pageSize=200&style=${FIXTURE_STYLE}`).set(auth(planner)).expect(200)).body.items;
      expect(fixturePlan).toHaveLength(1);
      expect(fixturePlan[0]).toMatchObject({ lineCode: ['A01-L03', 'A01-L05'], avgOutput: 300, qty: 600, assignedQty: 600, statusCode: 'FULL', startDate: '2026-11-02', endDate: '2026-11-02' });
      expect(fixturePlan[0].lineName).toHaveLength(2);
      expect(mine.items.find((i: any) => i.id === fixturePlan[0].id)).toMatchObject({ lineCode: ['A01-L03'], avgOutput: 300, qty: 600, assignedQty: 600 });
      // Lọc theo chuyền: kế hoạch có chuyền đó, cột chuyền vẫn đủ các chuyền; giá trị lọc là từng chuyền
      const cf = (v: object) => encodeURIComponent(JSON.stringify(v));
      const byLine = (await api().get(`/api/v1/order/color-size?style=${FIXTURE_STYLE}&line=A01-L05`).set(auth(planner)).expect(200)).body;
      expect(byLine.items.map((i: any) => i.lineCode)).toEqual([['A01-L03', 'A01-L05']]);
      expect((await api().get(`/api/v1/order/color-size?style=${FIXTURE_STYLE}&cf=${cf({ lineCode: { in: ['A01-L05'] } })}`).set(auth(planner)).expect(200)).body.total).toBe(1);
      // Bỏ tích chuyền 5 (notIn): kế hoạch còn chuyền 3 được tích nên vẫn hiện, như khi tích riêng chuyền 3; bỏ tích cả hai thì ẩn
      expect((await api().get(`/api/v1/order/color-size?style=${FIXTURE_STYLE}&cf=${cf({ lineCode: { notIn: ['A01-L05'] } })}`).set(auth(planner)).expect(200)).body.total).toBe(1);
      expect((await api().get(`/api/v1/order/color-size?style=${FIXTURE_STYLE}&cf=${cf({ lineCode: { in: ['A01-L03'] } })}`).set(auth(planner)).expect(200)).body.total).toBe(1);
      expect((await api().get(`/api/v1/order/color-size?style=${FIXTURE_STYLE}&cf=${cf({ lineCode: { notIn: ['A01-L03', 'A01-L05'] } })}`).set(auth(planner)).expect(200)).body.total).toBe(0);
      expect((await api().get(`/api/v1/order/color-size/values?field=lineCode&style=${FIXTURE_STYLE}`).set(auth(planner)).expect(200)).body.values).toEqual(['A01-L03', 'A01-L05']);
      // Trưởng chuyền lọc theo chuyền khác: không thấy gì (chỉ chuyền trong phạm vi xem được tính)
      expect((await api().get('/api/v1/order/color-size?line=A01-L05').set(auth(tc)).expect(200)).body.total).toBe(0);

      const other = all.items.find((i: any) => !i.lineCode.includes('A01-L03'));
      await api().get(`/api/v1/order/color-size/${other.id}`).set(auth(tc)).expect(404);
      await api().put(`/api/v1/order/color-size/${other.id}`).set(auth(tc)).send({ rows: [] }).expect(404);
    });

    it('phạm vi chuyền áp cả khi đọc dòng dàn chuyền qua màn Xếp chuyền (chi tiết và bảng dàn chuyền)', async () => {
      const tc = await tokenFor('truongchuyen.a', 'A01');
      const planner = await tokenFor('kehoach.a', 'A01');
      // Danh sách kế hoạch không có cột chuyền nên không lọc theo chuyền
      const plans = (await api().get('/api/v1/order/line-plans?pageSize=1').set(auth(tc)).expect(200)).body;
      expect(plans.total).toBe((await api().get('/api/v1/order/line-plans?pageSize=1').set(auth(planner))).body.total);
      const board = (await api().get('/api/v1/order/line-plans/board?from=2026-09-01&to=2026-12-31').set(auth(tc)).expect(200)).body;
      expect(board.bars.length).toBeGreaterThan(0);
      expect(new Set(board.bars.map((b: any) => b.lineCode))).toEqual(new Set(['A01-L03']));
      const full = (await api().get('/api/v1/order/line-plans/board?from=2026-09-01&to=2026-12-31').set(auth(planner))).body;
      const mixed = full.bars.find((b: any) => b.lineCode === 'A01-L03' && full.bars.some((x: any) => x.planId === b.planId && x.lineCode !== 'A01-L03'));
      if (mixed) {
        const detail = (await api().get(`/api/v1/order/line-plans/${mixed.planId}`).set(auth(tc)).expect(200)).body;
        expect(detail.lines.every((l: any) => l.lineCode === 'A01-L03')).toBe(true);
      }
    });

    it('Phân bổ màu cỡ (phase 5.13): Trưởng chuyền phân màu cỡ cho chuyền mình; tổng mỗi màu cỡ gồm cả chuyền khác không vượt SL kế hoạch; chuyền khác, màu cỡ lạ, lặp => 422', async () => {
      const tc = await tokenFor('truongchuyen.a', 'A01');
      const planner = await tokenFor('kehoach.a', 'A01');
      const row = (await api().get(`/api/v1/order/color-size?pageSize=1&style=${FIXTURE_STYLE}`).set(auth(tc))).body.items[0];
      const detail = (await api().get(`/api/v1/order/color-size/${row.id}`).set(auth(tc)).expect(200)).body;
      // Chỉ chuyền 3 (sửa được); SL KH là SL KHXH của kế hoạch; phần của chuyền 5 chỉ có tổng theo màu cỡ
      expect(detail.lines.map((l: any) => [l.lineCode, l.qty, l.assignedQty, l.editable])).toEqual([['A01-L03', 300, 300, true]]);
      expect(detail.colorSizes).toHaveLength(6);
      expect(detail.colorSizes.every((c: any) => c.qty === 100 && c.hiddenQty === 50)).toBe(true);
      expect(detail.rows).toHaveLength(6);
      const l3 = detail.lines[0].id;
      const l5 = (await api().get(`/api/v1/order/color-size/${row.id}`).set(auth(planner)).expect(200)).body.lines.find((l: any) => l.lineCode === 'A01-L05').id;
      const original = detail.rows.map((r: any) => ({ lineId: r.lineId, colorName: r.colorName, sizeName: r.sizeName, assignedQty: r.assignedQty }));
      const put = (rows: object[]) => api().put(`/api/v1/order/color-size/${row.id}`).set(auth(tc)).send({ rows });
      const [c0] = detail.colorSizes;
      expect([original[0].colorName, original[0].sizeName]).toEqual([c0.colorName, c0.sizeName]);
      try {
        // Màu cỡ đầu: 51 + 50 của chuyền 5 > 100 (tổng chuyền vẫn 300)
        const over = original.map((r: any, i: number) => ({ ...r, assignedQty: i === 0 ? 51 : i === 1 ? 49 : r.assignedQty }));
        const bad = (await put(over).expect(422)).body.error;
        expect(bad.code).toBe('VALIDATION_FAILED');
        expect(bad.details).toEqual([`${c0.colorName}/${c0.sizeName}: giao 101 (gồm 50 ở chuyền khác) > SL KH 100`]);
        await put([{ lineId: l3, colorName: 'Tím lạ', sizeName: 'S', assignedQty: 1 }]).expect(422);
        // Chuyền 5 ngoài phạm vi sửa của Trưởng chuyền 3
        await put([{ lineId: l5, colorName: c0.colorName, sizeName: c0.sizeName, assignedQty: 1 }]).expect(422);
        // Một chuyền một màu cỡ hai dòng (so không phân biệt hoa thường)
        await put([
          { lineId: l3, colorName: c0.colorName, sizeName: c0.sizeName, assignedQty: 1 },
          { lineId: l3, colorName: c0.colorName.toUpperCase(), sizeName: c0.sizeName.toLowerCase(), assignedQty: 1 },
        ]).expect(422);
        // Giảm phần giao: lưu được; tổng giao, trạng thái của cả kế hoạch; dòng giao 0 không lưu
        const less = original.map((r: any, i: number) => ({ ...r, assignedQty: i === 0 ? 30 : i === 1 ? 0 : r.assignedQty }));
        const ok = (await put(less).expect(200)).body;
        expect(ok).toMatchObject({ assignedQty: 530, statusCode: 'PARTIAL' });
        expect(ok.rows).toHaveLength(5);
        expect(ok.lines[0]).toMatchObject({ assignedQty: 230, statusCode: 'ALLOCATED' });
      } finally {
        await put(original).expect(200);
      }
    });

    it('Phân bổ màu cỡ (phase 5.13): một màu cỡ tách cho hai chuyền, số lượng khác nhau; tổng một chuyền vượt SL xếp chuyền => 422; bỏ hết phần giao của chuyền thì chuyền về Chưa phân màu cỡ', async () => {
      const planner = await tokenFor('kehoach.a', 'A01');
      const row = (await api().get(`/api/v1/order/color-size?pageSize=1&style=${FIXTURE_STYLE}`).set(auth(planner))).body.items[0];
      const detail = (await api().get(`/api/v1/order/color-size/${row.id}`).set(auth(planner)).expect(200)).body;
      expect(detail.lines.map((l: any) => [l.lineCode, l.editable])).toEqual([
        ['A01-L03', true],
        ['A01-L05', true],
      ]);
      expect(detail.colorSizes.every((c: any) => c.hiddenQty === 0)).toBe(true);
      const [l3, l5] = detail.lines.map((l: any) => l.id as number);
      const original = detail.rows.map((r: any) => ({ lineId: r.lineId, colorName: r.colorName, sizeName: r.sizeName, assignedQty: r.assignedQty }));
      const put = (rows: object[]) => api().put(`/api/v1/order/color-size/${row.id}`).set(auth(planner)).send({ rows });
      const [c0, c1] = detail.colorSizes;
      const cell = (lineId: number, c: any, assignedQty: number) => ({ lineId, colorName: c.colorName, sizeName: c.sizeName, assignedQty });
      const rest = original.filter((r: any) => ![c0, c1].some((c: any) => c.colorName === r.colorName && c.sizeName === r.sizeName));
      try {
        // Chuyền có phần giao đổi được ghi lúc sửa kể cả khi trạng thái giữ nguyên (chuyền 5 đang may), để dàn chuyền mô phỏng nhận
        // ra kế hoạch người dùng đã sửa; chuyền không đổi phần giao thì không
        const order = app.get<OrderDb>(ORDER_DB);
        await order.updateTable('ShipmentPlanLine').set({ ModifiedAt: null, ModifiedBy: null }).where('Id', 'in', [l3, l5]).execute();
        const first5 = original.findIndex((r: any) => r.lineId === l5);
        await put(original.map((r: any, i: number) => (i === first5 ? { ...r, assignedQty: r.assignedQty - 1 } : r))).expect(200);
        const stamped = new Map((await order.selectFrom('ShipmentPlanLine').select(['Id', 'ModifiedAt']).where('Id', 'in', [l3, l5]).execute()).map((l) => [l.Id, l.ModifiedAt]));
        expect(stamped.get(l5)).not.toBeNull();
        expect(stamped.get(l3)).toBeNull();
        // Màu cỡ đầu: chuyền 3 may 70, chuyền 5 may 30; màu cỡ thứ hai ngược lại: mỗi chuyền vẫn đủ 300
        const ok = (await put([...rest, cell(l3, c0, 70), cell(l5, c0, 30), cell(l3, c1, 30), cell(l5, c1, 70)]).expect(200)).body;
        const split = ok.rows.filter((r: any) => r.colorName === c0.colorName && r.sizeName === c0.sizeName).map((r: any) => [r.lineId, r.assignedQty]);
        expect(split).toEqual(expect.arrayContaining([[l3, 70], [l5, 30]]));
        expect(ok.statusCode).toBe('FULL');
        // Chuyền 3 nhận thêm 10 ở màu cỡ đầu (chuyền 5 bớt 10): màu cỡ vẫn 100 nhưng chuyền 3 thành 310 > 300
        const lineOver = (await put([...rest, cell(l3, c0, 80), cell(l5, c0, 20), cell(l3, c1, 30), cell(l5, c1, 70)]).expect(422)).body.error;
        expect(lineOver.details).toEqual([expect.stringMatching(/: giao 310 > SL xếp chuyền 300$/)]);
        // Bỏ hết phần giao của chuyền 3: chuyền 3 về Chưa phân màu cỡ, chuyền 5 đang may giữ trạng thái
        const only5 = (await put(original.filter((r: any) => r.lineId === l5)).expect(200)).body;
        expect(only5.lines.map((l: any) => [l.lineCode, l.assignedQty, l.statusCode])).toEqual([
          ['A01-L03', 0, 'PLANNED'],
          ['A01-L05', 300, 'IN_PRODUCTION'],
        ]);
        expect(only5.statusCode).toBe('PARTIAL');
      } finally {
        await put(original).expect(200);
      }
    });

    it('Phân bổ màu cỡ: kế hoạch xếp nhiều chuyền hiện NSBQ trung bình cộng các chuyền (làm tròn), lọc và sắp xếp được theo số đó; Trưởng chuyền chỉ tính chuyền mình', async () => {
      const planner = await tokenFor('kehoach.a', 'A01');
      const tc = await tokenFor('truongchuyen.a', 'A01');
      const list = (q: string, t = planner) => api().get(`/api/v1/order/color-size?pageSize=200&style=${FIXTURE_STYLE}${q}`).set(auth(t)).expect(200);
      const row = (await list('')).body.items[0];
      const detail = (await api().get(`/api/v1/order/color-size/${row.id}`).set(auth(planner)).expect(200)).body;
      const [l3, l5] = detail.lines.map((l: any) => l.id as number);
      const order = app.get<OrderDb>(ORDER_DB);
      const before = await order.selectFrom('ShipmentPlanLine').select(['Id', 'AvgOutput']).where('Id', 'in', [l3, l5]).execute();
      const cf = (v: object) => `&cf=${encodeURIComponent(JSON.stringify(v))}`;
      try {
        await order.updateTable('ShipmentPlanLine').set({ AvgOutput: 300 }).where('Id', '=', l3).execute();
        await order.updateTable('ShipmentPlanLine').set({ AvgOutput: 1001 }).where('Id', '=', l5).execute();
        // (300 + 1001) / 2 = 650,5 → 651: trung bình theo chuyền, không theo SL đã xếp
        expect((await list('')).body.items[0]).toMatchObject({ id: row.id, lineCode: ['A01-L03', 'A01-L05'], avgOutput: 651 });
        expect((await list('', tc)).body.items.find((i: any) => i.id === row.id)).toMatchObject({ lineCode: ['A01-L03'], avgOutput: 300 });
        expect((await list(cf({ avgOutput: { in: [651] } }))).body.total).toBe(1);
        expect((await list(cf({ avgOutput: { in: [300] } }))).body.total).toBe(0);
        expect((await api().get(`/api/v1/order/color-size/values?field=avgOutput&style=${FIXTURE_STYLE}`).set(auth(planner)).expect(200)).body.values).toEqual([651]);
        const asc = (await api().get('/api/v1/order/color-size?pageSize=200&sort=avgOutput:asc').set(auth(planner)).expect(200)).body.items.map((i: any) => i.avgOutput);
        expect(asc).toEqual([...asc].sort((a, b) => a - b));
        const desc = (await api().get('/api/v1/order/color-size?pageSize=200&sort=avgOutput:desc').set(auth(planner)).expect(200)).body.items.map((i: any) => i.avgOutput);
        expect(desc[0]).toBe(Math.max(...desc));
      } finally {
        for (const l of before) await order.updateTable('ShipmentPlanLine').set({ AvgOutput: l.AvgOutput }).where('Id', '=', l.Id).execute();
      }
    });

    it('Phân bổ màu cỡ (phase 5.13): chính sách cột theo người (Chuyền may Che, Số lượng giao Ẩn, Che, Chỉ đọc, Số lượng kế hoạch Ẩn); kế hoạch ĐVCS khác theo Id => 404', async () => {
      const id = await tempUser('test.alloccol', ['PLANNER'], ['A01', 'A02']);
      const setPolicy = (fieldCode: string, accessLevel: string) =>
        api().post(`/api/v1/admin/users/${id}/field-policies`).set(auth(admin)).send({ resourceId: resId('order.colorsize'), fieldCode, accessLevel, reason: 'Thử chính sách cột (test)' }).expect(200);
      const clearPolicies = async () => {
        const access = (await api().get(`/api/v1/admin/users/${id}/access`).set(auth(admin)).expect(200)).body;
        for (const p of access.fieldPolicies) await api().delete(`/api/v1/admin/users/${id}/field-policies/${p.id}`).set(auth(admin)).expect(204);
      };
      try {
        await clearPolicies();
        const t = await tokenFor('test.alloccol', 'A01', TEST_PASSWORD);
        const row = (await api().get(`/api/v1/order/color-size?style=${FIXTURE_STYLE}`).set(auth(t)).expect(200)).body.items[0];
        const detailOf = async () => (await api().get(`/api/v1/order/color-size/${row.id}`).set(auth(t)).expect(200)).body;
        // Kế hoạch của A01 xem, lưu khi đang làm việc ở A02 (cùng người, cùng quyền): 404 như không có
        const t2 = await tokenFor('test.alloccol', 'A02', TEST_PASSWORD);
        await api().get(`/api/v1/order/color-size/${row.id}`).set(auth(t2)).expect(404);
        await api().put(`/api/v1/order/color-size/${row.id}`).set(auth(t2)).send({ rows: [] }).expect(404);

        // Chuyền may bị Che: mã thành "***", không có tên chuyền (tên suy ra được mã), file xuất cũng che; không hỏi giá trị theo cột này
        await setPolicy('lineCode', 'MASKED');
        const masked = (await api().get(`/api/v1/order/color-size?style=${FIXTURE_STYLE}`).set(auth(t)).expect(200)).body.items[0];
        expect(masked.lineCode).toBe('***');
        expect(masked.lineName).toBeUndefined();
        expect((await detailOf()).lines.map((l: any) => [l.lineCode, l.lineName])).toEqual([
          ['***', undefined],
          ['***', undefined],
        ]);
        const csv = (await api().get(`/api/v1/order/color-size/export?style=${FIXTURE_STYLE}`).set(auth(t)).expect(200)).text;
        expect(csv).not.toContain('A01-L03');
        expect(csv.split(/\r?\n/).find((l) => l.includes(FIXTURE_STYLE))).toContain('***');
        expect((await api().get('/api/v1/order/color-size/values?field=lineCode').set(auth(t)).expect(403)).body.error.code).toBe('FIELD_NOT_READABLE');

        // NSBQ bị Che: "***" ở danh sách và file xuất; lọc theo cột bị bỏ, sắp xếp về mặc định, không hỏi giá trị; bị Ẩn thì không có cột
        await clearPolicies();
        await setPolicy('avgOutput', 'MASKED');
        const list = (q: string) => api().get(`/api/v1/order/color-size?pageSize=200${q}`).set(auth(t)).expect(200);
        expect((await list(`&style=${FIXTURE_STYLE}`)).body.items[0].avgOutput).toBe('***');
        const cfOut = encodeURIComponent(JSON.stringify({ avgOutput: { in: [-1] } }));
        expect((await list(`&style=${FIXTURE_STYLE}&cf=${cfOut}`)).body.total).toBe(1);
        const ids = async (q: string) => (await list(q)).body.items.map((i: any) => i.id);
        expect(await ids('&sort=avgOutput:asc')).toEqual(await ids(''));
        expect((await api().get('/api/v1/order/color-size/values?field=avgOutput').set(auth(t)).expect(403)).body.error.code).toBe('FIELD_NOT_READABLE');
        const csvOut = (await api().get(`/api/v1/order/color-size/export?style=${FIXTURE_STYLE}`).set(auth(t)).expect(200)).text;
        // Chỉ NSBQ đang bị Che nên dấu che trên dòng là của cột này
        expect(csvOut.split(/\r?\n/)[0]).toContain('NSBQ');
        expect(csvOut.split(/\r?\n/).find((l) => l.includes(FIXTURE_STYLE))).toContain('***');
        await clearPolicies();
        await setPolicy('avgOutput', 'HIDDEN');
        expect('avgOutput' in (await list(`&style=${FIXTURE_STYLE}`)).body.items[0]).toBe(false);
        expect((await api().get(`/api/v1/order/color-size/export?style=${FIXTURE_STYLE}`).set(auth(t)).expect(200)).text.split(/\r?\n/)[0]).not.toContain('NSBQ');

        // Số lượng giao bị Ẩn: không có tổng giao, phần của chuyền khác, phần giao; lưu có số lượng giao => 403
        await clearPolicies();
        await setPolicy('assignedQty', 'HIDDEN');
        const hidden = await detailOf();
        expect(hidden.assignedQty).toBeUndefined();
        expect(hidden.colorSizes.some((c: any) => 'hiddenQty' in c)).toBe(false);
        expect(hidden.rows.some((r: any) => 'assignedQty' in r)).toBe(false);
        expect(hidden.lines.some((l: any) => 'assignedQty' in l)).toBe(false);
        const [first] = hidden.colorSizes;
        const denied = await api()
          .put(`/api/v1/order/color-size/${row.id}`)
          .set(auth(t))
          .send({ rows: [{ lineId: hidden.lines[0].id, colorName: first.colorName, sizeName: first.sizeName, assignedQty: 1 }] })
          .expect(403);
        expect(denied.body.error.code).toBe('FIELD_READONLY');
        // Bị Che: "***" ở mọi chỗ, kể cả phần của chuyền khác
        await clearPolicies();
        await setPolicy('assignedQty', 'MASKED');
        const covered = await detailOf();
        expect(covered.assignedQty).toBe('***');
        expect(covered.colorSizes.every((c: any) => c.hiddenQty === '***')).toBe(true);
        expect(covered.rows.every((r: any) => r.assignedQty === '***')).toBe(true);
        // Chỉ đọc: bỏ hết phần giao bằng `rows: []` (body không có cột nào) cũng bị chặn, phần giao giữ nguyên
        await clearPolicies();
        await setPolicy('assignedQty', 'READONLY');
        const kept = (await detailOf()).rows;
        expect(kept.length).toBeGreaterThan(0);
        const wipe = await api().put(`/api/v1/order/color-size/${row.id}`).set(auth(t)).send({ rows: [] }).expect(403);
        expect(wipe.body.error.code).toBe('FIELD_READONLY');
        expect((await detailOf()).rows).toEqual(kept);

        // Số lượng kế hoạch bị Ẩn: không có SL kế hoạch, SL đã xếp; thông báo giao vượt không nêu số
        await clearPolicies();
        await setPolicy('qty', 'HIDDEN');
        const blind = await detailOf();
        expect(blind.qty).toBeUndefined();
        expect(blind.colorSizes.some((c: any) => 'qty' in c)).toBe(false);
        expect(blind.lines.some((l: any) => 'qty' in l)).toBe(false);
        // Chuyền 3: màu cỡ đầu 51 (cộng 50 của chuyền 5 > 100), màu cỡ thứ hai 49 để tổng chuyền vẫn 300
        const [c0, c1] = blind.colorSizes;
        const l3 = blind.lines.find((l: any) => l.lineCode === 'A01-L03').id as number;
        const is = (r: any, c: any) => r.colorName === c.colorName && r.sizeName === c.sizeName;
        const rows = blind.rows.map((r: any) => ({ lineId: r.lineId, colorName: r.colorName, sizeName: r.sizeName, assignedQty: r.lineId === l3 && is(r, c0) ? 51 : r.lineId === l3 && is(r, c1) ? 49 : r.assignedQty }));
        const bad = (await api().put(`/api/v1/order/color-size/${row.id}`).set(auth(t)).send({ rows }).expect(422)).body.error;
        expect(bad.details).toEqual([`${c0.colorName}/${c0.sizeName}`]);
        expect(bad.message).not.toMatch(/101|100/);
      } finally {
        await clearPolicies();
        await dropUser(id);
      }
    });

    it('Nam: Trưởng chuyền ở A01, Giám đốc ở A02 – quyền của phép gán này không rò sang phép gán kia', async () => {
      const id = await tempUser('test.nam', ['LINE_LEADER', 'DIRECTOR'], ['A01', 'A02'], {
        LINE_LEADER: [{ dimension: 'FACTORY', mode: 'LIST', orgUnitId: orgId('A01') }, { dimension: 'LINE', mode: 'LIST', value: 'A01-L03' }],
        DIRECTOR: [{ dimension: 'FACTORY', mode: 'LIST', orgUnitId: orgId('A02') }],
      });
      try {
        const atA01 = await perms(await tokenFor('test.nam', 'A01', TEST_PASSWORD));
        expect(atA01).toContain('order.colorsize:update');
        expect(atA01).not.toContain('report.revenue:view');

        const a02 = await tokenFor('test.nam', 'A02', TEST_PASSWORD);
        const atA02 = await perms(a02);
        expect(atA02).toContain('report.revenue:view');
        expect(atA02).not.toContain('order.colorsize:update');
        const line = (await api().get('/api/v1/order/color-size?pageSize=1').set(auth(a02)).expect(200)).body.items[0];
        expect(line.branchCode).toBe('A02');
        await api().put(`/api/v1/order/color-size/${line.id}`).set(auth(a02)).send({ rows: [] }).expect(403);

        // Thêm vai trò không làm mất phạm vi của vai trò cũ
        await api().put(`/api/v1/admin/users/${id}/roles`).set(auth(admin)).send({ roleIds: [roleId('LINE_LEADER'), roleId('DIRECTOR'), roleId('QC')] }).expect(200);
        const access = (await api().get(`/api/v1/admin/users/${id}/access`).set(auth(admin)).expect(200)).body;
        const leader = access.assignments.find((a: any) => a.roleCode === 'LINE_LEADER');
        expect(leader.scopes.map((s: any) => `${s.dimension}:${s.orgUnitCode ?? s.value}`).sort()).toEqual(['FACTORY:A01', 'LINE:A01-L03']);

        // Bỏ vai trò thì phạm vi bị xóa kèm audit
        await api().put(`/api/v1/admin/users/${id}/roles`).set(auth(admin)).send({ roleIds: [roleId('QC')] }).expect(200);
        const audit = (await api().get('/api/v1/admin/audit?entityType=SysUser&pageSize=5').set(auth(admin))).body.items;
        const last = audit.find((a: any) => a.actionCode === 'USER_ROLES');
        expect(JSON.parse(last.oldValue).removedScopes).toEqual(expect.arrayContaining(['LINE_LEADER/LINE:LIST:A01-L03']));
      } finally {
        await dropUser(id);
      }
    });

    it('phạm vi "chỉ bản ghi do mình tạo": không thấy, không sửa được đơn của người khác; thấy và sửa đơn của mình', async () => {
      const id = await tempUser('test.own', ['PLANNER'], ['A01'], { PLANNER: [{ dimension: 'OWNER', mode: 'OWN' }] });
      try {
        const t = await tokenFor('test.own', 'A01', TEST_PASSWORD);
        const before = (await api().get('/api/v1/order/sales-orders?pageSize=200').set(auth(t)).expect(200)).body;
        const khToken = await tokenFor('kehoach.a', 'A01');
        const othersId = (await api().get('/api/v1/order/sales-orders?pageSize=1').set(auth(khToken))).body.items[0].id;
        expect(before.items.some((i: any) => i.id === othersId)).toBe(false);
        await api().put(`/api/v1/order/sales-orders/${othersId}`).set(auth(t)).send({ qty: 1 }).expect(404);
        const mine = await api().post('/api/v1/order/sales-orders').set(auth(t)).send({ customerName: 'Khách OWN', styleCode: 'OWN-1', productName: 'Áo thử', qty: 5, shipDate: '2026-12-20' }).expect(201);
        const after = (await api().get('/api/v1/order/sales-orders?pageSize=200').set(auth(t))).body;
        expect(after.total).toBe(before.total + 1);
        await api().put(`/api/v1/order/sales-orders/${mine.body.id}`).set(auth(t)).send({ qty: 6 }).expect(200);
        await api().delete(`/api/v1/order/sales-orders/${mine.body.id}`).set(auth(t)).expect(204);
      } finally {
        await dropUser(id);
      }
    });

    it('popup lọc theo cột (/values) cũng theo phạm vi "chỉ bản ghi do mình tạo" (Phase 5.6)', async () => {
      const id = await tempUser('test.owncf', ['PLANNER'], ['A01'], { PLANNER: [{ dimension: 'OWNER', mode: 'OWN' }] });
      try {
        const t = await tokenFor('test.owncf', 'A01', TEST_PASSWORD);
        const kh = await tokenFor('kehoach.a', 'A01');
        const valuesOf = async (token: string, search: string) =>
          (await api().get(`/api/v1/order/sales-orders/values?field=customerName&search=${encodeURIComponent(search)}`).set(auth(token)).expect(200)).body.values;
        // Đơn của test do kehoach.a tạo: người chỉ xem bản ghi của mình không thấy cả tên khách hàng của đơn đó
        expect(await valuesOf(kh, 'KHÁCH TEST P5')).toEqual(['KHÁCH TEST P5']);
        expect(await valuesOf(t, 'KHÁCH TEST P5')).toEqual([]);
        const mine = await api().post('/api/v1/order/sales-orders').set(auth(t)).send({ customerName: 'Khách OWN CF', styleCode: 'OWN-CF', productName: 'Áo thử', qty: 5, shipDate: '2026-12-20' }).expect(201);
        try {
          expect(await valuesOf(t, 'OWN CF')).toEqual(['Khách OWN CF']);
        } finally {
          await api().delete(`/api/v1/order/sales-orders/${mine.body.id}`).set(auth(t)).expect(204);
        }
      } finally {
        await dropUser(id);
      }
    });

    it('phạm vi chuyền kiểu cũ (cả nhánh, danh sách theo nút cây tổ chức) không có tác dụng: thành rỗng, không thành không giới hạn (phase 5.10)', async () => {
      const id = await tempUser('test.subtree', ['LINE_LEADER'], ['A01']);
      const t = await tokenFor('test.subtree', 'A01', TEST_PASSWORD);
      const total = async (path: string) => (await api().get(path).set(auth(t)).expect(200)).body.total as number;
      const COLOR_SIZE = '/api/v1/order/color-size?pageSize=1';
      const PREP = `/api/v1/sewing/prep?style=${FIXTURE_STYLE}&startFrom=2020-01-01&pageSize=1`;
      try {
        // Không có dòng chiều chuyền: không giới hạn
        expect(await total(COLOR_SIZE)).toBeGreaterThan(1);
        expect(await total(PREP)).toBe(2);
        // Dòng kiểu cũ chỉ còn khi database chưa chạy MES_Core/0009 (API không ghi được nữa): ghi thẳng để kiểm đóng an toàn,
        // kể cả khi nút cây tổ chức đang bật và mang đúng mã một chuyền đang dùng (A01-L03)
        const ur = await core.selectFrom('SysUserRole').select('Id').where('UserId', '=', id).where('RoleId', '=', roleId('LINE_LEADER')).executeTakeFirstOrThrow();
        const dim = await core.selectFrom('SysScopeDimension').select('Id').where('Code', '=', 'LINE').executeTakeFirstOrThrow();
        const oldNode = await core.selectFrom('SysOrgUnit').select(['Id', 'IsActive']).where('Code', '=', 'A01-L03').executeTakeFirst();
        if (oldNode) await core.updateTable('SysOrgUnit').set({ IsActive: true }).where('Id', '=', oldNode.Id).execute();
        else {
          await core
            .insertInto('SysOrgUnit')
            .values({ Code: 'A01-L03', Name: 'Chuyền 03 (cũ)', OrgType: 'LINE', ParentId: orgId('A01'), ParentOrgType: 'FACTORY', BranchCode: 'A01', Path: '/A01/A01-L03/', SortOrder: 3, IsActive: true, IsSystem: false } as any)
            .execute();
        }
        const lineNode = (await core.selectFrom('SysOrgUnit').select('Id').where('Code', '=', 'A01-L03').executeTakeFirstOrThrow()).Id;
        try {
          for (const [mode, orgUnitId] of [['ORG_SUBTREE', orgId('A01')], ['LIST', orgId('A01')], ['LIST', lineNode], ['ORG_SUBTREE', lineNode]] as const) {
            await core.deleteFrom('SysUserRoleScope').where('UserRoleId', '=', ur.Id).execute();
            await core.insertInto('SysUserRoleScope').values({ UserRoleId: ur.Id, DimensionId: dim.Id, ScopeMode: mode, OrgUnitId: orgUnitId, ScopeValue: null } as any).execute();
            await app.get(PermissionService).bumpVersion();
            expect([mode, orgUnitId, await total(COLOR_SIZE), await total(PREP)]).toEqual([mode, orgUnitId, 0, 0]);
          }
        } finally {
          await core.deleteFrom('SysUserRoleScope').where('UserRoleId', '=', ur.Id).execute();
          if (oldNode) await core.updateTable('SysOrgUnit').set({ IsActive: oldNode.IsActive }).where('Id', '=', oldNode.Id).execute();
          else await core.deleteFrom('SysOrgUnit').where('Id', '=', lineNode).execute();
        }
        const bad = await api()
          .put(`/api/v1/admin/users/${id}/roles/${roleId('LINE_LEADER')}/scope`)
          .set(auth(admin))
          .send({ scopes: [{ dimension: 'LINE', mode: 'ORG_SUBTREE', orgUnitId: orgId('A01') }] })
          .expect(422);
        expect(bad.body.error.code).toBe('VALIDATION_FAILED');
      } finally {
        await dropUser(id);
      }
    });

    it('Trưởng chuyền chỉ thấy chuyền được giao ở Kế hoạch chuẩn bị SX; ở A00 chỉ đọc đúng chuyền đó (phạm vi chuyền theo mã bộ phận)', async () => {
      const PREP = `/api/v1/sewing/prep?style=${FIXTURE_STYLE}&startFrom=2020-01-01&pageSize=50`;
      const lines = async (t: string, path: string) => new Set((await api().get(path).set(auth(t)).expect(200)).body.items.map((i: any) => i.lineCode));
      expect(await lines(await tokenFor('truongchuyen.a', 'A01'), PREP)).toEqual(new Set(['A01-L03']));
      expect(await lines(await tokenFor('kehoach.a', 'A01'), PREP)).toEqual(new Set(['A01-L03', 'A01-L05']));

      const id = await tempUser('test.linea00', ['LINE_LEADER'], ['A00', 'A01'], { LINE_LEADER: [{ dimension: 'LINE', mode: 'LIST', value: 'A01-L03' }] });
      try {
        const a00 = await tokenFor('test.linea00', 'A00', TEST_PASSWORD);
        const seen = (await api().get('/api/v1/order/color-size?pageSize=200').set(auth(a00)).expect(200)).body;
        expect(seen.total).toBeGreaterThan(0);
        expect(new Set(seen.items.flatMap((i: any) => i.lineCode))).toEqual(new Set(['A01-L03']));
        await api().put(`/api/v1/order/color-size/${seen.items[0].id}`).set(auth(a00)).send({ rows: [] }).expect(403);
        expect(await lines(a00, PREP)).toEqual(new Set(['A01-L03']));
      } finally {
        await dropUser(id);
      }
    });

    it('/admin/scope-catalog trả chuyền từ bộ phận tích "Xưởng sản xuất" (kèm ĐVCS, nhóm); cây tổ chức chỉ còn nút ĐVCS', async () => {
      const catalog = (await api().get('/api/v1/admin/scope-catalog').set(auth(admin)).expect(200)).body;
      expect(catalog.orgUnits.length).toBeGreaterThan(0);
      expect(catalog.orgUnits.every((o: any) => o.orgType === 'FACTORY')).toBe(true);
      expect(catalog.dimensions.find((d: any) => d.code === 'LINE').orgType).toBeNull();
      const l03 = catalog.lines.find((l: any) => l.code === 'A01-L03');
      expect(l03).toMatchObject({ branchCode: 'A01', isActive: true, workshopCode: 'A01-X01' });
      // Bộ phận không tích (xưởng mẫu A01-X01) không phải chuyền
      expect(catalog.lines.some((l: any) => l.code === 'A01-X01')).toBe(false);
      const hrLines = await app.get<HrDb>(HR_DB).selectFrom('Department').select('Code').where('IsProductionWorkshop', '=', true).where('BranchCode', 'is not', null).execute();
      expect(new Set(catalog.lines.map((l: any) => l.code))).toEqual(new Set(hrLines.map((d) => d.Code)));
    });

    it('bỏ tích "Xưởng sản xuất" của bộ phận chuyền: Trưởng chuyền mất chuyền đó ngay khi phiên bản quyền tăng (thành rỗng, không thành không giới hạn)', async () => {
      const hr = app.get<HrDb>(HR_DB);
      const org = app.get(OrgService);
      const t = await tokenFor('truongchuyen.a', 'A01');
      const COLOR_SIZE = '/api/v1/order/color-size?pageSize=200';
      const PREP = `/api/v1/sewing/prep?style=${FIXTURE_STYLE}&startFrom=2020-01-01&pageSize=50`;
      expect((await api().get(COLOR_SIZE).set(auth(t)).expect(200)).body.total).toBeGreaterThan(0);
      // Nạp sẵn cache chuyền của OrgService (30 giây) để kiểm: tăng phiên bản quyền là đủ, tiến trình khác không gọi được invalidate()
      expect((await org.activeLineCodes()).has('A01-L03')).toBe(true);
      await hr.updateTable('Department').set({ IsProductionWorkshop: false }).where('Code', '=', 'A01-L03').execute();
      try {
        await app.get(PermissionService).bumpVersion();
        const after = (await api().get(COLOR_SIZE).set(auth(t)).expect(200)).body;
        expect(after.total).toBe(0);
        expect((await api().get(PREP).set(auth(t)).expect(200)).body.total).toBe(0);
        // Người không bị giới hạn chuyền vẫn thấy dòng của chuyền này (dữ liệu cũ còn mã)
        const planner = await tokenFor('kehoach.a', 'A01');
        expect((await api().get(COLOR_SIZE).set(auth(planner)).expect(200)).body.items.some((i: any) => i.lineCode.includes('A01-L03'))).toBe(true);
        // Phạm vi đã lưu vẫn còn, hiện là không còn tác dụng; lưu lại phép gán vẫn giữ được mã đó
        const tc = await userId('truongchuyen.a');
        const scopes = (await api().get(`/api/v1/admin/users/${tc}/access`).set(auth(admin)).expect(200)).body.assignments.find((a: any) => a.roleCode === 'LINE_LEADER').scopes;
        expect(scopes).toEqual([expect.objectContaining({ dimension: 'LINE', mode: 'LIST', value: 'A01-L03', orgUnitId: null, valueActive: false })]);
        await api().put(`/api/v1/admin/users/${tc}/roles/${roleId('LINE_LEADER')}/scope`).set(auth(admin)).send({ scopes: [{ dimension: 'LINE', mode: 'LIST', value: 'A01-L03' }] }).expect(200);
        // Gán mới mã đó (phép gán chưa có mã này) thì bị từ chối: không còn là chuyền
        const fresh = await tempUser('test.untick', ['LINE_LEADER'], ['A01']);
        try {
          const bad = await api().put(`/api/v1/admin/users/${fresh}/roles/${roleId('LINE_LEADER')}/scope`).set(auth(admin)).send({ scopes: [{ dimension: 'LINE', mode: 'LIST', value: 'A01-L03' }] }).expect(422);
          expect(bad.body.error.message).toContain('A01-L03');
        } finally {
          await dropUser(fresh);
        }
      } finally {
        await hr.updateTable('Department').set({ IsProductionWorkshop: true }).where('Code', '=', 'A01-L03').execute();
        org.invalidate();
        await app.get(PermissionService).bumpVersion();
      }
      expect(new Set((await api().get(COLOR_SIZE).set(auth(t)).expect(200)).body.items.flatMap((i: any) => i.lineCode))).toEqual(new Set(['A01-L03']));
    });

    it('phạm vi chuyền mã "~…" (MES_Core/0009 ghi cho phạm vi cũ vốn không có tác dụng): tập rỗng, không thành không giới hạn', async () => {
      const id = await tempUser('test.linetilde', ['LINE_LEADER'], ['A01'], { LINE_LEADER: [{ dimension: 'LINE', mode: 'LIST', value: 'A01-L03' }] });
      const core = app.get<CoreDb>(CORE_DB);
      try {
        // Bộ sửa phạm vi không nhận mã "~": ghi thẳng như migration 0009
        const ur = await core.selectFrom('SysUserRole').select('Id').where('UserId', '=', id).where('RoleId', '=', roleId('LINE_LEADER')).executeTakeFirstOrThrow();
        await core.updateTable('SysUserRoleScope').set({ ScopeValue: '~A01-L03' }).where('UserRoleId', '=', ur.Id).execute();
        await app.get(PermissionService).bumpVersion();
        const access = await app.get(PermissionService).getAccess(id, { code: 'A01', isAggregate: false });
        const grants = access.grants.get('order.colorsize:view') ?? [];
        expect(grants.length).toBeGreaterThan(0);
        for (const g of grants) expect(g.conditions).toContainEqual({ dim: 'LINE', kind: 'none' });
        const t = await tokenFor('test.linetilde', 'A01', TEST_PASSWORD);
        expect((await api().get('/api/v1/order/color-size?pageSize=200').set(auth(t)).expect(200)).body.total).toBe(0);
      } finally {
        await dropUser(id);
      }
    });

    it('nguồn chuyền lỗi (LineSource.loadLines ném lỗi): request của người bị giới hạn chuyền bị từ chối, không thành không giới hạn', async () => {
      const COLOR_SIZE = '/api/v1/order/color-size?pageSize=200';
      const t = await tokenFor('truongchuyen.a', 'A01');
      const org = app.get(OrgService);
      const spy = jest.spyOn(app.get(HrLineSource), 'loadLines').mockRejectedValue(new Error('Mất kết nối MES_Hr (giả lập)'));
      try {
        org.invalidate();
        await app.get(PermissionService).bumpVersion();
        const res = await api().get(COLOR_SIZE).set(auth(t));
        expect(res.status).toBe(500);
        expect(res.body.items).toBeUndefined();
      } finally {
        spy.mockRestore();
        org.invalidate();
        await app.get(PermissionService).bumpVersion();
      }
      // Lỗi không bị giữ trong cache: nguồn đọc lại được thì chạy lại bình thường
      expect(new Set((await api().get(COLOR_SIZE).set(auth(t)).expect(200)).body.items.flatMap((i: any) => i.lineCode))).toEqual(new Set(['A01-L03']));
    });

    it('Kế toán (phạm vi ĐVCS A01, A02): ở A00 chỉ đọc kế hoạch của hai ĐVCS này, ở A03 không có quyền; đơn hàng dùng chung thì thấy hết', async () => {
      const a00 = await tokenFor('ketoan', 'A00');
      const PLANS = '/api/v1/order/shipment-plans';
      const list = (await api().get(`${PLANS}?pageSize=200`).set(auth(a00)).expect(200)).body;
      expect(list.items.every((i: any) => ['A01', 'A02'].includes(i.branchCode))).toBe(true);
      const total = async (branch: string) => (await api().get(`${PLANS}?pageSize=1`).set(auth(await tokenFor('admin', branch))).expect(200)).body.total as number;
      expect(list.total).toBe((await total('A01')) + (await total('A02')));
      const gdToken = await tokenFor('giamdoc', 'A00');
      const director = (await api().get(`${PLANS}?pageSize=1`).set(auth(gdToken))).body;
      expect(director.total).toBeGreaterThan(list.total);
      // Thông tin đơn hàng không lọc theo ĐVCS (ADR 0013): phạm vi ĐVCS của kế toán không giới hạn đơn hàng
      const orders = async (t: string) => (await api().get('/api/v1/order/sales-orders?pageSize=1').set(auth(t)).expect(200)).body.total as number;
      expect(await orders(a00)).toBe(await orders(gdToken));
      const a03 = await tokenFor('ketoan', 'A03');
      expect(await perms(a03)).toEqual([]);
      await api().get('/api/v1/order/sales-orders').set(auth(a03)).expect(403);
    });

    it('tổ hợp phạm vi không hợp lệ => 422; không tự đặt phạm vi cho chính mình', async () => {
      const tc = await userId('truongchuyen.a');
      const r = await api()
        .put(`/api/v1/admin/users/${tc}/roles/${roleId('LINE_LEADER')}/scope`)
        .set(auth(admin))
        .send({ scopes: [{ dimension: 'LINE', mode: 'LIST', orgUnitId: orgId('A01') }] })
        .expect(422);
      expect(r.body.error.code).toBe('VALIDATION_FAILED');
      await api().put(`/api/v1/admin/users/${tc}/roles/${roleId('LINE_LEADER')}/scope`).set(auth(admin)).send({ scopes: [{ dimension: 'OWNER', mode: 'LIST', value: 'x' }] }).expect(422);
      // Chiều chuyền theo mã (phase 5.10): mã phải là bộ phận đang tích "Xưởng sản xuất", đúng hoa thường; không theo cả nhánh
      for (const bad of [
        { dimension: 'LINE', mode: 'LIST', value: 'A01' },
        { dimension: 'LINE', mode: 'LIST', value: 'A01-X01' },
        { dimension: 'LINE', mode: 'LIST', value: 'a01-l03' },
        { dimension: 'LINE', mode: 'LIST', value: 'KHONG-CO' },
        { dimension: 'LINE', mode: 'OWN' },
        { dimension: 'LINE', mode: 'ORG_SUBTREE', orgUnitId: orgId('A01') },
        { dimension: 'LINE', mode: 'ALL', value: 'A01-L03' },
      ]) {
        const res = await api().put(`/api/v1/admin/users/${tc}/roles/${roleId('LINE_LEADER')}/scope`).set(auth(admin)).send({ scopes: [bad] });
        expect([res.status, res.body.error?.code, bad]).toEqual([422, 'VALIDATION_FAILED', bad]);
      }
      const kept = (await api().get(`/api/v1/admin/users/${tc}/access`).set(auth(admin)).expect(200)).body.assignments.find((a: any) => a.roleCode === 'LINE_LEADER').scopes;
      expect(kept.map((s: any) => `${s.dimension}:${s.mode}:${s.value}:${s.valueName}:${s.valueActive}`)).toEqual(['LINE:LIST:A01-L03:Chuyền 03:true']);
      const me = (await api().get('/api/v1/me').set(auth(admin))).body.user.id;
      const self = await api().put(`/api/v1/admin/users/${me}/roles/${roleId('ADMIN')}/scope`).set(auth(admin)).send({ scopes: [] }).expect(403);
      expect(self.body.error.code).toBe('SELF_ELEVATION_FORBIDDEN');
    });
  });

  // ---------------- L5 ----------------
  describe('L5 – ngoại lệ theo người', () => {
    it('Deny xem chặn hẳn tài nguyên: mất menu, danh sách, xuất file và đường sửa; gỡ thì có lại; có audit', async () => {
      const kh = await userId('kehoach.a');
      const t = await tokenFor('kehoach.a', 'A01');
      const row = (await api().get('/api/v1/order/sales-orders?pageSize=1').set(auth(t)).expect(200)).body.items[0];
      await api().post(`/api/v1/admin/users/${kh}/overrides`).set(auth(admin)).send({ permissionId: permId('order.allocation:view'), effect: 'DENY', reason: 'Thử chặn tạm (test)' }).expect(200);
      const ov = (await api().get(`/api/v1/admin/users/${kh}/access`).set(auth(admin))).body.overrides.find((o: any) => o.permissionCode === 'order.allocation:view');
      try {
        expect((await api().get('/api/v1/order/sales-orders').set(auth(t)).expect(403)).body.error.code).toBe('PERMISSION_DENIED');
        await api().get('/api/v1/order/sales-orders/export').set(auth(t)).expect(403);
        await api().put(`/api/v1/order/sales-orders/${row.id}`).set(auth(t)).send({}).expect(403);
        const p = await perms(t);
        expect(p.filter((c) => c.startsWith('order.allocation:'))).toEqual([]);
        const menu = (await api().get('/api/v1/me/menu').set(auth(t))).body as any[];
        expect(menu.find((g) => g.code === 'menu.order').children.map((c: any) => c.code)).not.toContain('menu.order.allocation');
      } finally {
        await api().delete(`/api/v1/admin/users/${kh}/overrides/${ov.id}`).set(auth(admin)).expect(204);
      }
      await api().get('/api/v1/order/sales-orders').set(auth(t)).expect(200);
      const audit = (await api().get('/api/v1/admin/audit?entityType=SysUserPermissionOverride&pageSize=5').set(auth(admin))).body.items;
      expect(audit.map((a: any) => a.actionCode)).toEqual(expect.arrayContaining(['OVERRIDE_CREATE', 'OVERRIDE_DELETE']));
    });

    it('Allow theo người: Trưởng chuyền B xem được Kế hoạch xuất hàng; Allow đã hết hạn thì không', async () => {
      const b = await tokenFor('truongchuyen.b', 'A01');
      expect(await perms(b)).toContain('order.shipment:view');
      await api().get('/api/v1/order/shipment-plans?pageSize=1').set(auth(b)).expect(200);

      const a = await userId('truongchuyen.a');
      const t = await tokenFor('truongchuyen.a', 'A01');
      await api()
        .post(`/api/v1/admin/users/${a}/overrides`)
        .set(auth(admin))
        .send({ permissionId: permId('order.shipment:view'), effect: 'ALLOW', validToAt: '2026-01-01T00:00:00Z', reason: 'Ngoại lệ đã hết hạn (test)' })
        .expect(200);
      const ov = (await api().get(`/api/v1/admin/users/${a}/access`).set(auth(admin))).body.overrides[0];
      try {
        expect(await perms(t)).not.toContain('order.shipment:view');
      } finally {
        await api().delete(`/api/v1/admin/users/${a}/overrides/${ov.id}`).set(auth(admin)).expect(204);
      }
    });

    it('Allow ở A00 khi không có vai trò nào: có quyền nhưng không đọc được dữ liệu ĐVCS nào (đóng an toàn)', async () => {
      const id = await tempUser('test.allow', [], ['A00']);
      try {
        await api().post(`/api/v1/admin/users/${id}/overrides`).set(auth(admin)).send({ permissionId: permId('order.shipment:view'), effect: 'ALLOW', reason: 'Thử Allow ở A00 (test)' }).expect(200);
        const t = await tokenFor('test.allow', 'A00', TEST_PASSWORD);
        expect(await perms(t)).toContain('order.shipment:view');
        expect((await api().get('/api/v1/order/shipment-plans').set(auth(t)).expect(200)).body.total).toBe(0);
      } finally {
        await dropUser(id);
      }
    });

    it('ngoại lệ hẹn giờ tự có hiệu lực khi tới giờ, không cần đổi quyền; header phiên bản quyền đổi theo', async () => {
      const a = await userId('truongchuyen.a');
      const t = await tokenFor('truongchuyen.a', 'A01');
      const from = new Date(Date.now() + 2500).toISOString();
      await api().post(`/api/v1/admin/users/${a}/overrides`).set(auth(admin)).send({ permissionId: permId('order.shipment:view'), effect: 'ALLOW', validFromAt: from, reason: 'Hẹn giờ (test)' }).expect(200);
      const ov = (await api().get(`/api/v1/admin/users/${a}/access`).set(auth(admin))).body.overrides[0];
      try {
        const r1 = await api().get('/api/v1/order/shipment-plans').set(auth(t)).expect(403);
        await sleep(3000);
        const r2 = await api().get('/api/v1/order/shipment-plans').set(auth(t)).expect(200);
        expect(r2.headers['x-permission-version']).not.toBe(r1.headers['x-permission-version']);
      } finally {
        await api().delete(`/api/v1/admin/users/${a}/overrides/${ov.id}`).set(auth(admin)).expect(204);
      }
    });

    it('ngoại lệ bắt buộc lý do; không đặt cho chính mình', async () => {
      const kh = await userId('kehoach.a');
      await api().post(`/api/v1/admin/users/${kh}/overrides`).set(auth(admin)).send({ permissionId: permId('order.po:view'), effect: 'DENY', reason: '' }).expect(422);
      const me = (await api().get('/api/v1/me').set(auth(admin))).body.user.id;
      const r = await api().post(`/api/v1/admin/users/${me}/overrides`).set(auth(admin)).send({ permissionId: permId('report.revenue:view'), effect: 'ALLOW', reason: 'Tự cấp' }).expect(403);
      expect(r.body.error.code).toBe('SELF_ELEVATION_FORBIDDEN');
    });
  });

  // ---------------- L4 ----------------
  describe('L4 – quyền theo cột', () => {
    const firstPlan = async (username: string) => {
      const t = await tokenFor(username, 'A01');
      return (await api().get(`/api/v1/order/line-plans?pageSize=1&style=${FIXTURE_STYLE}`).set(auth(t))).body.items[0];
    };

    it('cột nhạy cảm mặc định Ẩn (không có trong JSON); Che trả ***; chính sách theo người thắng vai trò', async () => {
      const tc = await firstPlan('truongchuyen.a');
      expect(tc).not.toHaveProperty('cmPrice');
      expect(tc).not.toHaveProperty('revenue');
      expect(tc.customerName).toBe('***');
      const kh = await firstPlan('kehoach.a');
      expect(typeof kh.revenue).toBe('number');
      expect(typeof kh.cmPrice).toBe('number');
      expect(kh.customerName).not.toBe('***');
      // Trưởng chuyền B: cùng vai trò nhưng có chính sách riêng được xem giá CM đến 31/12
      const b = await firstPlan('truongchuyen.b');
      expect(typeof b.cmPrice).toBe('number');
      expect(b).not.toHaveProperty('revenue');
      const bToken = await tokenFor('truongchuyen.b', 'A01');
      const policies = (await api().get('/api/v1/me/field-policies').set(auth(bToken))).body.resources;
      expect(policies['order.lineplan']).toMatchObject({ cmPrice: 'READONLY', revenue: 'HIDDEN', customerName: 'MASKED' });
    });

    it('không sắp xếp được theo cột bị Ẩn (thứ tự giữ như mặc định)', async () => {
      const t = await tokenFor('truongchuyen.a', 'A01');
      const ids = async (qs: string) => (await api().get(`/api/v1/order/line-plans?pageSize=50${qs}`).set(auth(t)).expect(200)).body.items.map((i: any) => i.id);
      expect(await ids('&sort=revenue:desc')).toEqual(await ids(''));
      const kh = await tokenFor('kehoach.a', 'A01');
      const sorted = (await api().get('/api/v1/order/line-plans?pageSize=50&sort=revenue:desc').set(auth(kh))).body.items.map((i: any) => i.revenue ?? -1);
      expect(sorted).toEqual([...sorted].sort((a: number, b: number) => b - a));
    });

    it('lọc, tìm và gợi ý theo cột bị Che không dò được giá trị; cùng dữ liệu ở màn Tỷ lệ cắt cũng bị che', async () => {
      const tc = await tokenFor('truongchuyen.a', 'A01');
      const kh = await tokenFor('kehoach.a', 'A01');
      const total = async (t: string, path: string) => (await api().get(path).set(auth(t)).expect(200)).body.total as number;
      const customer = (await firstPlan('kehoach.a')).customerName as string;
      // Kế hoạch lọc được; Trưởng chuyền (khách hàng bị Che) gửi bộ lọc thì bị bỏ qua, kết quả như không lọc
      expect(await total(kh, '/api/v1/order/line-plans?customer=KHONG-CO-KHACH-NAY')).toBe(0);
      expect(await total(tc, '/api/v1/order/line-plans?customer=KHONG-CO-KHACH-NAY')).toBe(await total(tc, '/api/v1/order/line-plans'));
      expect(await total(tc, '/api/v1/order/color-size?customer=KHONG-CO-KHACH-NAY')).toBe(await total(tc, '/api/v1/order/color-size'));
      // Ô tìm nhanh không tìm trên cột bị Che
      expect(await total(kh, `/api/v1/order/line-plans?q=${encodeURIComponent(customer)}`)).toBeGreaterThan(0);
      expect(await total(tc, `/api/v1/order/line-plans?q=${encodeURIComponent(customer)}`)).toBe(0);
      const board = (await api().get('/api/v1/order/line-plans/board?from=2026-09-01&to=2026-12-31&customer=KHONG-CO-KHACH-NAY').set(auth(tc)).expect(200)).body;
      expect(board.bars.length).toBeGreaterThan(0);
      expect((await api().get('/api/v1/order/cut-ratio/pos?pageSize=1').set(auth(tc)).expect(200)).body.items[0].customerName).toBe('***');
      // Gợi ý khách hàng cho ô lọc: rỗng khi cột bị Che
      expect((await api().get('/api/v1/order/sales-orders/options').set(auth(kh)).expect(200)).body.customers.length).toBeGreaterThan(0);
      try {
        await setRolePolicy('PLANNER', 'order.allocation', 'customerName', 'MASKED');
        expect((await api().get('/api/v1/order/sales-orders/options').set(auth(kh)).expect(200)).body.customers).toEqual([]);
        // Lọc theo trạng thái khi cột trạng thái bị Che cũng bị bỏ qua
        expect(await total(kh, '/api/v1/order/line-plans?status=PLANNED')).toBeLessThan(await total(kh, '/api/v1/order/line-plans'));
        await setRolePolicy('PLANNER', 'order.lineplan', 'statusCode', 'MASKED');
        expect(await total(kh, '/api/v1/order/line-plans?status=PLANNED')).toBe(await total(kh, '/api/v1/order/line-plans'));
      } finally {
        await setRolePolicy('PLANNER', 'order.allocation', 'customerName', null);
        await setRolePolicy('PLANNER', 'order.lineplan', 'statusCode', null);
      }
    });

    it('ghi vào cột chỉ đọc => 403 FIELD_READONLY, kể cả trường nằm trong danh sách lồng; cột được sửa thì lưu', async () => {
      const t = await tokenFor('kehoach.a', 'A01');
      const row = (await api().get(`/api/v1/order/sales-orders/${fixture.orderId}`).set(auth(t)).expect(200)).body;
      const r = await api().put(`/api/v1/order/sales-orders/${row.id}`).set(auth(t)).send({ unitPrice: 1 }).expect(403);
      expect(r.body.error).toMatchObject({ code: 'FIELD_READONLY', details: { fields: ['unitPrice'] } });
      try {
        const ok = await api().put(`/api/v1/order/sales-orders/${row.id}`).set(auth(t)).send({ cmPrice: 9.99 }).expect(200);
        expect(ok.body.cmPrice).toBe(9.99);
      } finally {
        await api().put(`/api/v1/order/sales-orders/${row.id}`).set(auth(t)).send({ cmPrice: row.cmPrice }).expect(200);
      }
      try {
        await setRolePolicy('PLANNER', 'order.shipment', 'planQty', 'READONLY');
        const nested = await api()
          .post('/api/v1/order/shipment-plans')
          .set(auth(t))
          .send({ salesOrderId: 1, poIds: [1], poBuyDate: 'x', lines: [{ colorName: 'Đen', sizeName: 'M', planQty: 1 }] })
          .expect(403);
        expect(nested.body.error.details.fields).toEqual(['planQty']);
      } finally {
        await setRolePolicy('PLANNER', 'order.shipment', 'planQty', null);
      }
    });

    it('xuất file đi qua cùng chính sách cột (đọc, che, ẩn); trả cột nhạy cảm có ghi nhật ký đọc', async () => {
      const kh = await tokenFor('kehoach.a', 'A01');
      const csv = async () => {
        const text = (await api().get(`/api/v1/order/line-plans/export?style=${FIXTURE_STYLE}`).set(auth(kh)).expect(200)).text.replace(/^\uFEFF/, '');
        const [head, first] = text.split('\r\n');
        const cols = head.split(',');
        return { cols, value: (name: string) => first.split(',')[cols.indexOf(name)] };
      };
      try {
        const readonly = await csv();
        expect(Number(readonly.value('Doanh số'))).toBeGreaterThan(0);
        await setRolePolicy('PLANNER', 'order.lineplan', 'revenue', 'MASKED');
        expect((await csv()).value('Doanh số')).toBe('***');
        await setRolePolicy('PLANNER', 'order.lineplan', 'revenue', 'HIDDEN');
        expect((await csv()).cols).not.toContain('Doanh số');
      } finally {
        await setRolePolicy('PLANNER', 'order.lineplan', 'revenue', 'READONLY');
      }

      const count = async () => Number((await sql<{ n: number }>`SELECT COUNT(*) AS n FROM dbo.SysSensitiveReadLog`.execute(core)).rows[0].n);
      const before = await count();
      const gd = await tokenFor('giamdoc', 'A01');
      const gcsv = (await api().get('/api/v1/order/sales-orders/export').set(auth(gd)).expect(200)).text;
      expect(gcsv.split('\r\n')[0]).toContain('Đơn giá');
      expect(await count()).toBeGreaterThan(before);
      const last = (await sql<{ ActionCode: string; FieldCodes: string }>`SELECT TOP 1 ActionCode, FieldCodes FROM dbo.SysSensitiveReadLog ORDER BY Id DESC`.execute(core)).rows[0];
      expect(last.ActionCode).toBe('EXPORT');
      expect(last.FieldCodes).toContain('unitPrice');
    });

    it('nhật ký sửa đơn hàng không chứa giá (cột nhạy cảm)', async () => {
      const t = await tokenFor('kehoach.a', 'A01');
      const row = (await api().get(`/api/v1/order/sales-orders/${fixture.orderId}`).set(auth(t)).expect(200)).body;
      await api().put(`/api/v1/order/sales-orders/${row.id}`).set(auth(t)).send({ qty: row.qty }).expect(200);
      const audit = (await api().get('/api/v1/admin/audit?entityType=SalesOrder&pageSize=1').set(auth(admin))).body.items[0];
      expect(audit.newValue).not.toMatch(/unitPrice|amount|cmPrice/);
      expect(audit.oldValue).not.toMatch(/unitPrice|amount|cmPrice/);
    });

    it('vai trò không có quyền xem màn hình không làm mở cột mà vai trò liên quan đã ẩn', async () => {
      const id = await tempUser('test.multi', ['PLANNER', 'QC'], ['A01']);
      try {
        await setRolePolicy('PLANNER', 'order.allocation', 'staffName', 'HIDDEN');
        const t = await tokenFor('test.multi', 'A01', TEST_PASSWORD);
        const row = (await api().get('/api/v1/order/sales-orders?pageSize=1').set(auth(t)).expect(200)).body.items[0];
        expect(row).not.toHaveProperty('staffName');
      } finally {
        await setRolePolicy('PLANNER', 'order.allocation', 'staffName', null);
        await dropUser(id);
      }
    });

    it('đổi chính sách cột của vai trò có hiệu lực ngay, có audit; không sửa vai trò mình đang giữ', async () => {
      const t = await tokenFor('kehoach.a', 'A01');
      try {
        await setRolePolicy('PLANNER', 'order.lineplan', 'revenue', 'HIDDEN');
        const row = (await api().get(`/api/v1/order/line-plans?pageSize=1&style=${FIXTURE_STYLE}`).set(auth(t))).body.items[0];
        expect(row).not.toHaveProperty('revenue');
      } finally {
        await setRolePolicy('PLANNER', 'order.lineplan', 'revenue', 'READONLY');
      }
      expect(typeof (await api().get(`/api/v1/order/line-plans?pageSize=1&style=${FIXTURE_STYLE}`).set(auth(t))).body.items[0].revenue).toBe('number');
      const audit = (await api().get('/api/v1/admin/audit?entityType=SysFieldPolicy&pageSize=3').set(auth(admin))).body.items;
      expect(audit[0].actionCode).toBe('ROLE_FIELD_POLICY');
      const self = await api()
        .put(`/api/v1/admin/roles/${roleId('ADMIN')}/field-policies`)
        .set(auth(admin))
        .send({ resourceId: resId('order.lineplan'), policies: [{ fieldCode: 'revenue', accessLevel: 'READONLY' }] })
        .expect(403);
      expect(self.body.error.code).toBe('SELF_ELEVATION_FORBIDDEN');
      await api()
        .put(`/api/v1/admin/roles/${roleId('PLANNER')}/field-policies`)
        .set(auth(admin))
        .send({ resourceId: resId('order.lineplan'), policies: [{ fieldCode: 'revenue', accessLevel: 'HIDDEN' }, { fieldCode: 'revenue', accessLevel: 'MASKED' }] })
        .expect(422);
    });

    it('xem thử quyền của một người tại một nhà máy', async () => {
      const id = await userId('truongchuyen.a');
      const r = (await api().get(`/api/v1/admin/users/${id}/effective?branchCode=A01`).set(auth(admin)).expect(200)).body;
      const screen = r.screens.find((s: any) => s.code === 'order.colorsize');
      expect(screen.actions).toEqual(['view', 'update']);
      expect(screen.scope).toEqual(['Chuyền: A01-L03']);
      expect(r.fieldLevels['order.lineplan'].cmPrice).toBe('HIDDEN');
    });
  });

  // ---------------- Module Đơn hàng ----------------
  describe('Module Đơn hàng', () => {
    async function candidate(t: string, min: number) {
      const candidates = (await api().get(`/api/v1/order/shipment-plans/candidates?style=${FIXTURE_STYLE}`).set(auth(t)).expect(200)).body;
      const c = candidates.find((x: any) => x.salesOrderId === fixture.orderId && x.remainingQty > min);
      const pos = (await api().get(`/api/v1/order/shipment-plans/candidates/${c.salesOrderId}/pos`).set(auth(t)).expect(200)).body;
      const poIds = pos.map((p: any) => p.id);
      const draft = (await api().get(`/api/v1/order/shipment-plans/draft?salesOrderId=${c.salesOrderId}&poIds=${poIds.join(',')}`).set(auth(t)).expect(200)).body;
      return { c, poIds, line: draft.find((d: any) => d.remainingQty > min) };
    }

    it('Chọn mã hàng chỉ có đơn có nhà máy SX thuộc ĐVCS đăng nhập; ĐVCS khác: PO, lưới màu cỡ, tạo kế hoạch đều 404; gắn nhà máy vào ĐVCS thì thấy ngay (ADR 0013 mục 11)', async () => {
      const id = await tempUser('test.p59', ['PLANNER'], ['A03']);
      try {
        const t = await tokenFor('test.p59', 'A03', TEST_PASSWORD);
        const seen = async () => (await api().get(`/api/v1/order/shipment-plans/candidates?style=${FIXTURE_STYLE}`).set(auth(t)).expect(200)).body.some((x: any) => x.salesOrderId === fixture.orderId);
        expect(await seen()).toBe(false);
        await api().get(`/api/v1/order/shipment-plans/candidates/${fixture.orderId}/pos`).set(auth(t)).expect(404);
        await api().get(`/api/v1/order/shipment-plans/draft?salesOrderId=${fixture.orderId}&poIds=${fixture.confirmedPoId}`).set(auth(t)).expect(404);
        const body = { salesOrderId: fixture.orderId, poIds: [fixture.confirmedPoId], poBuyDate: 'P59', lines: [{ colorName: 'Xanh', sizeName: 'S', planQty: 1 }] };
        await api().post('/api/v1/order/shipment-plans').set(auth(t)).send(body).expect(404);
        // Vẫn xem được đơn hàng ở Thông tin đơn hàng: dữ liệu dùng chung, chỉ popup lập kế hoạch lọc theo nhà máy SX
        await api().get(`/api/v1/order/sales-orders/${fixture.orderId}`).set(auth(t)).expect(200);
        const codes = ((await api().get('/api/v1/me').set(auth(t)).expect(200)).body.productionFactories as any[]).map((f) => f.code);
        expect(codes).not.toContain(FIXTURE_FACTORY);
        expect(codes).not.toContain(FIXTURE_FACTORY_B);
        // Gắn một nhà máy của đơn vào A03: thấy ngay, không cần đăng nhập lại (danh mục tăng phiên bản quyền)
        await api().put(`/api/v1/admin/catalogs/factories/${fixture.factoryIds[1]}`).set(auth(admin)).send({ branchCode: 'A03' }).expect(200);
        try {
          expect(await seen()).toBe(true);
        } finally {
          await api().put(`/api/v1/admin/catalogs/factories/${fixture.factoryIds[1]}`).set(auth(admin)).send({ branchCode: 'A02' }).expect(200);
        }
        expect(await seen()).toBe(false);
      } finally {
        await dropUser(id);
      }
    });

    it('Nhà máy SX theo OSM là danh sách: một nhà máy trong danh sách thuộc ĐVCS thì thấy đơn ở Chọn mã hàng; không sửa tay được (409) (ADR 0013 mục 9)', async () => {
      const db = app.get<OrderDb>(ORDER_DB);
      const ORDER = `/api/v1/order/sales-orders/${fixture.orderId}`;
      await db.updateTable('SalesOrder').set({ ProductionFactoryCode: `KHÁC NHÀ MÁY,${FIXTURE_FACTORY}`, IsFactoryFromOsm: true }).where('Id', '=', fixture.orderId).execute();
      try {
        const kh = await tokenFor('kehoach.a', 'A01');
        const c = (await api().get(`/api/v1/order/shipment-plans/candidates?style=${FIXTURE_STYLE}`).set(auth(kh)).expect(200)).body.find((x: any) => x.salesOrderId === fixture.orderId);
        expect(c?.productionFactoryCode).toBe(`KHÁC NHÀ MÁY,${FIXTURE_FACTORY}`);
        // Đường getById của bộ lọc (PO của đơn để lập kế hoạch) cũng theo danh sách
        await api().get(`/api/v1/order/shipment-plans/candidates/${fixture.orderId}/pos`).set(auth(kh)).expect(200);
        // So mã không phân biệt hoa thường như collation
        await db.updateTable('SalesOrder').set({ ProductionFactoryCode: `khác nhà máy,${FIXTURE_FACTORY.toLowerCase()}` }).where('Id', '=', fixture.orderId).execute();
        expect((await api().get(`/api/v1/order/shipment-plans/candidates?style=${FIXTURE_STYLE}`).set(auth(kh)).expect(200)).body.some((x: any) => x.salesOrderId === fixture.orderId)).toBe(true);
        await db.updateTable('SalesOrder').set({ ProductionFactoryCode: `KHÁC NHÀ MÁY,${FIXTURE_FACTORY}` }).where('Id', '=', fixture.orderId).execute();
        const shown = (await api().get(ORDER).set(auth(kh)).expect(200)).body;
        expect(shown).toMatchObject({ factoryFromOsm: true });
        expect((await api().put(ORDER).set(auth(kh)).send({ productionFactoryCode: FIXTURE_FACTORY }).expect(409)).body.error.message).toMatch(/OSM/);
        // Lưu cả form gửi lại đúng giá trị đang có: không báo lỗi
        await api().put(ORDER).set(auth(kh)).send({ productionFactoryCode: `KHÁC NHÀ MÁY,${FIXTURE_FACTORY}`, qty: 3000 }).expect(200);
        // Danh sách không có nhà máy nào thuộc ĐVCS: không thấy
        await db.updateTable('SalesOrder').set({ ProductionFactoryCode: 'KHÁC NHÀ MÁY,NHÀ MÁY KHÁC 2' }).where('Id', '=', fixture.orderId).execute();
        expect((await api().get(`/api/v1/order/shipment-plans/candidates?style=${FIXTURE_STYLE}`).set(auth(kh)).expect(200)).body.some((x: any) => x.salesOrderId === fixture.orderId)).toBe(false);
      } finally {
        await db.updateTable('SalesOrder').set({ ProductionFactoryCode: FIXTURE_FACTORIES, IsFactoryFromOsm: false }).where('Id', '=', fixture.orderId).execute();
      }
    });

    it('đơn hàng, PO dùng chung: ĐVCS khác xem được nhưng không sửa, xóa, đổi Nhà máy SX; PO chưa vào kế hoạch của ĐVCS đó thì không thêm PO (422), sửa màu cỡ (404) (review 5.9 H1, ADR 0013 mục 11)', async () => {
      const id = await tempUser('test.p59w', ['PLANNER'], ['A02']);
      try {
        const t = await tokenFor('test.p59w', 'A02', TEST_PASSWORD);
        const ORDER = `/api/v1/order/sales-orders/${fixture.orderId}`;
        expect((await api().get(ORDER).set(auth(t)).expect(200)).body.branchCode).toBe('A01');
        await api().put(ORDER).set(auth(t)).send({ productionFactoryCode: null }).expect(404);
        await api().put(ORDER).set(auth(t)).send({ qty: 1 }).expect(404);
        await api().delete(ORDER).set(auth(t)).expect(404);
        // Đơn chưa có PO trong kế hoạch của A02: không thêm PO; màu cỡ, xác nhận tỷ lệ cắt chỉ sửa ở ĐVCS của PO
        await api()
          .post('/api/v1/order/cut-ratio/pos')
          .set(auth(t))
          .send({ salesOrderId: fixture.orderId, poNumber: 'P59W', shipDate: '2027-06-30', lines: [{ colorName: 'Đỏ', sizeName: 'M', qty: 1 }] })
          .expect(422);
        // Màn Tỷ lệ cắt của A02 không có PO của đơn
        expect((await api().get(`/api/v1/order/cut-ratio/styles?style=${FIXTURE_STYLE}`).set(auth(t)).expect(200)).body.items).toEqual([]);
        await api().put(`/api/v1/order/cut-ratio/pos/${fixture.confirmedPoId}/color-sizes`).set(auth(t)).send({ lines: [{ colorName: 'Xanh', sizeName: 'S', qty: 1 }] }).expect(404);
        await api().post(`/api/v1/order/cut-ratio/pos/${fixture.confirmedPoId}/unconfirm`).set(auth(t)).expect(404);
        await api().post(`/api/v1/order/cut-ratio/pos/${fixture.confirmedPoId}/confirm`).set(auth(t)).expect(404);
        await api().delete(`/api/v1/order/cut-ratio/pos/${fixture.confirmedPoId}`).set(auth(t)).expect(404);
        // PO nằm trong kế hoạch của A01, không phải của A02: A02 không sửa, không xác nhận được
        await api().put(`/api/v1/order/cut-ratio/pos/${fixture.poId}/color-sizes`).set(auth(t)).send({ lines: [{ colorName: 'Đen', sizeName: 'S', qty: 1 }] }).expect(404);
        await api().post(`/api/v1/order/cut-ratio/pos/${fixture.poId}/confirm`).set(auth(t)).expect(404);
        // Đơn vẫn nguyên
        const after = (await api().get(ORDER).set(auth(t)).expect(200)).body;
        expect(after).toMatchObject({ qty: 3000, productionFactoryCode: FIXTURE_FACTORIES });
      } finally {
        await dropUser(id);
      }
    });

    it('lập kế hoạch ở ĐVCS của phiên cho đơn hàng của ĐVCS khác; SL đã lập tính chung mọi ĐVCS; ĐVCS đó sửa được tỷ lệ cắt của PO trong kế hoạch (ADR 0013 mục 11)', async () => {
      const id = await tempUser('test.p59x', ['PLANNER'], ['A02']);
      try {
        const t = await tokenFor('test.p59x', 'A02', TEST_PASSWORD);
        const kh = await tokenFor('kehoach.a', 'A01');
        const me = (await api().get('/api/v1/me').set(auth(t)).expect(200)).body;
        const codes = me.productionFactories.map((f: any) => f.code);
        expect(codes).toContain(FIXTURE_FACTORY_B);
        expect(codes).not.toContain(FIXTURE_FACTORY);
        const { c, poIds, line } = await candidate(t, 10);
        expect(c).toMatchObject({ branchCode: 'A01', productionFactoryCode: FIXTURE_FACTORIES });
        const created = (await api()
          .post('/api/v1/order/shipment-plans')
          .set(auth(t))
          .send({ salesOrderId: c.salesOrderId, poIds, poBuyDate: 'P59X', lines: [{ colorName: line.colorName, sizeName: line.sizeName, planQty: 5 }] })
          .expect(201)).body;
        try {
          expect(created.branchCode).toBe('A02');
          expect(created.planNo).toMatch(/^KH-A02-\d{6}$/);
          // Sửa SL kế hoạch của đơn ĐVCS khác: khóa đơn theo Id, lưới màu cỡ theo kế hoạch đang sửa
          const edited = (await api()
            .put(`/api/v1/order/shipment-plans/${created.id}`)
            .set(auth(t))
            .send({ lines: [{ colorName: line.colorName, sizeName: line.sizeName, planQty: 6 }] })
            .expect(200)).body;
          expect(edited.planQty).toBe(6);
          const seen = (await api().get(`/api/v1/order/shipment-plans/candidates?style=${FIXTURE_STYLE}`).set(auth(kh))).body.find((x: any) => x.salesOrderId === c.salesOrderId);
          expect(seen.plannedQty).toBe(c.plannedQty + 6);
          // Kế hoạch theo ĐVCS: phiên A01 không thấy kế hoạch vừa lập ở A02
          await api().get(`/api/v1/order/shipment-plans/${created.id}`).set(auth(kh)).expect(404);

          // Tỷ lệ cắt ở A02: đúng các PO trong kế hoạch của A02, một dòng mã hàng, Chi nhánh FOB của đơn
          const styles = (await api().get(`/api/v1/order/cut-ratio/styles?style=${FIXTURE_STYLE}`).set(auth(t)).expect(200)).body.items.filter((s: any) => s.salesOrderId === c.salesOrderId);
          expect(styles).toHaveLength(1);
          expect(styles[0].branchCode).toBe('A01');
          const pos = (await api().get(`/api/v1/order/cut-ratio/pos?salesOrderId=${c.salesOrderId}&pageSize=200`).set(auth(t)).expect(200)).body.items;
          expect(pos.map((p: any) => p.id).sort()).toEqual([...poIds].sort());
          expect(pos.every((p: any) => p.inPlan === true)).toBe(true);
          // PO của đơn A01 trong kế hoạch A02: A02 hủy xác nhận, sửa màu cỡ, xác nhận lại được; đang trong kế hoạch nên không xóa
          await api().post(`/api/v1/order/cut-ratio/pos/${fixture.confirmedPoId}/unconfirm`).set(auth(t)).expect(200);
          const before = (await api().get(`/api/v1/order/cut-ratio/pos/${fixture.confirmedPoId}/color-sizes`).set(auth(t)).expect(200)).body.lines.map((l: any) => ({ colorName: l.colorName, sizeName: l.sizeName, qty: l.qty }));
          await api().put(`/api/v1/order/cut-ratio/pos/${fixture.confirmedPoId}/color-sizes`).set(auth(t)).send({ lines: before }).expect(200);
          await api().post(`/api/v1/order/cut-ratio/pos/${fixture.confirmedPoId}/confirm`).set(auth(t)).expect(200);
          const draftPo = pos.find((p: any) => p.statusCode === 'DRAFT');
          expect((await api().delete(`/api/v1/order/cut-ratio/pos/${draftPo.id}`).set(auth(t)).expect(409)).body.error.message).toMatch(/kế hoạch/);
          // Thêm PO tay ở A02 cho đơn của A01: PO mang ĐVCS A02, A02 sửa được, A01 không thấy, không sửa; mã hàng vẫn một dòng
          const added = (await api()
            .post('/api/v1/order/cut-ratio/pos')
            .set(auth(t))
            .send({ salesOrderId: c.salesOrderId, poNumber: 'P59X-TAY', shipDate: '2027-06-30', lines: [{ colorName: 'Đỏ', sizeName: 'M', qty: 3 }] })
            .expect(201)).body;
          try {
            expect(added.branchCode).toBe('A02');
            expect((await api().get(`/api/v1/order/cut-ratio/styles?style=${FIXTURE_STYLE}`).set(auth(t)).expect(200)).body.items.filter((s: any) => s.salesOrderId === c.salesOrderId)).toHaveLength(1);
            await api().put(`/api/v1/order/cut-ratio/pos/${added.id}/color-sizes`).set(auth(t)).send({ lines: [{ colorName: 'Đỏ', sizeName: 'M', qty: 4 }] }).expect(200);
            const a01 = (await api().get(`/api/v1/order/cut-ratio/pos?salesOrderId=${c.salesOrderId}&pageSize=200`).set(auth(kh)).expect(200)).body.items.map((p: any) => p.id);
            expect(a01).not.toContain(added.id);
            await api().put(`/api/v1/order/cut-ratio/pos/${added.id}/color-sizes`).set(auth(kh)).send({ lines: [{ colorName: 'Đỏ', sizeName: 'M', qty: 5 }] }).expect(404);
          } finally {
            await api().delete(`/api/v1/order/cut-ratio/pos/${added.id}`).set(auth(t)).expect(204);
          }
        } finally {
          await api().delete(`/api/v1/order/shipment-plans/${created.id}`).set(auth(t)).expect(204);
        }
        // Bỏ kế hoạch: A02 không còn thấy, không sửa được PO của đơn A01
        expect((await api().get(`/api/v1/order/cut-ratio/styles?style=${FIXTURE_STYLE}`).set(auth(t)).expect(200)).body.items).toEqual([]);
        await api().post(`/api/v1/order/cut-ratio/pos/${fixture.confirmedPoId}/unconfirm`).set(auth(t)).expect(404);
      } finally {
        await dropUser(id);
      }
    });

    it('Tỷ lệ cắt ở đơn vị tổng hợp: thấy PO trong kế hoạch của mọi ĐVCS và PO nhập tay; ghi bị từ chối (ADR 0013 mục 11)', async () => {
      const id = await tempUser('test.p59a', ['PLANNER'], ['A00']);
      try {
        const t = await tokenFor('test.p59a', 'A00', TEST_PASSWORD);
        const pos = (await api().get(`/api/v1/order/cut-ratio/pos?salesOrderId=${fixture.orderId}&pageSize=200`).set(auth(t)).expect(200)).body.items.map((p: any) => p.id);
        // PO trong kế hoạch của A01 và PO nhập tay (không vào kế hoạch nào)
        expect(pos).toEqual(expect.arrayContaining([fixture.poId, fixture.confirmedPoId]));
        const r = await api().put(`/api/v1/order/cut-ratio/pos/${fixture.poId}/color-sizes`).set(auth(t)).send({ lines: [{ colorName: 'Đen', sizeName: 'S', qty: 1 }] }).expect(403);
        expect(r.body.error.code).toBe('AGGREGATE_READ_ONLY');
        expect((await api().post(`/api/v1/order/cut-ratio/pos/${fixture.poId}/confirm`).set(auth(t)).expect(403)).body.error.code).toBe('AGGREGATE_READ_ONLY');
      } finally {
        await dropUser(id);
      }
    });

    it('Thêm PO cho mã hàng có PO nhập tay ở ĐVCS dù chưa có kế hoạch; PO tay của ĐVCS mình sửa được (ADR 0013 mục 11)', async () => {
      const id = await tempUser('test.p59m', ['PLANNER'], ['A02']);
      const db = app.get<OrderDb>(ORDER_DB);
      const created: number[] = [];
      try {
        const t = await tokenFor('test.p59m', 'A02', TEST_PASSWORD);
        const add = (poNumber: string) =>
          api().post('/api/v1/order/cut-ratio/pos').set(auth(t)).send({ salesOrderId: fixture.orderId, poNumber, shipDate: '2027-06-30', lines: [{ colorName: 'Đỏ', sizeName: 'M', qty: 2 }] });
        await add('P59M-1').expect(422);
        // PO tay A02 nhập trước đây (ví dụ khi đơn còn trong kế hoạch của A02): mã hàng hiện ở màn, thêm PO được
        const head = (await db.selectFrom('SalesOrder').select(['CustomerName', 'StyleCode']).where('Id', '=', fixture.orderId).executeTakeFirstOrThrow());
        const old = await db
          .insertInto('SalesOrderPo')
          .values({ ...head, SalesOrderId: fixture.orderId, PoCode: 'TEST-P59M', PoNumber: 'P59M-0', Qty: 0, ShipDate: '2027-06-30', StatusCode: 'DRAFT', BranchCode: 'A02', CreatedBy: id } as any)
          .output('inserted.Id')
          .executeTakeFirstOrThrow();
        created.push(old.Id);
        const styles = (await api().get(`/api/v1/order/cut-ratio/styles?style=${FIXTURE_STYLE}`).set(auth(t)).expect(200)).body.items;
        expect(styles.map((s: any) => s.salesOrderId)).toEqual([fixture.orderId]);
        const added = (await add('P59M-1').expect(201)).body;
        created.push(added.id);
        expect(added.branchCode).toBe('A02');
        await api().put(`/api/v1/order/cut-ratio/pos/${old.Id}/color-sizes`).set(auth(t)).send({ lines: [{ colorName: 'Đỏ', sizeName: 'L', qty: 3 }] }).expect(200);
        // Lưới PO của A02 chỉ có hai PO tay của A02, không có PO của A01
        const pos = (await api().get(`/api/v1/order/cut-ratio/pos?salesOrderId=${fixture.orderId}&pageSize=200`).set(auth(t)).expect(200)).body.items.map((p: any) => p.id);
        expect(pos.sort()).toEqual([...created].sort());
      } finally {
        for (const poId of created) {
          await db.deleteFrom('SalesOrderPoColorSize').where('SalesOrderPoId', '=', poId).execute();
          await db.deleteFrom('SalesOrderPo').where('Id', '=', poId).execute();
        }
        await dropUser(id);
      }
    });

    it('Kế hoạch xuất hàng: vượt còn lại, màu cỡ lặp => 422; tạo được, đã lập tăng; xóa được', async () => {
      const t = await tokenFor('kehoach.a', 'A01');
      const { c, poIds, line } = await candidate(t, 100);
      const body = (q: number, extra: object[] = []) => ({ salesOrderId: c.salesOrderId, poIds, poBuyDate: 'TEST / 01-12', lines: [{ colorName: line.colorName, sizeName: line.sizeName, planQty: q }, ...extra] });
      expect((await api().post('/api/v1/order/shipment-plans').set(auth(t)).send(body(line.remainingQty + 1)).expect(422)).body.error.code).toBe('VALIDATION_FAILED');
      await api().post('/api/v1/order/shipment-plans').set(auth(t)).send(body(1, [{ colorName: line.colorName, sizeName: line.sizeName, planQty: 1 }])).expect(422);
      const created = await api().post('/api/v1/order/shipment-plans').set(auth(t)).send(body(10)).expect(201);
      expect(created.body.planNo).toMatch(/^KH-A01-\d{6}$/);
      expect(created.body.planQty).toBe(10);
      try {
        const after = (await api().get(`/api/v1/order/shipment-plans/candidates?style=${FIXTURE_STYLE}`).set(auth(t))).body.find((x: any) => x.salesOrderId === c.salesOrderId);
        expect(after.plannedQty).toBe(c.plannedQty + 10);
        // Trưởng chuyền B chỉ có Allow xem, không tạo được
        const b = await tokenFor('truongchuyen.b', 'A01');
        await api().post('/api/v1/order/shipment-plans').set(auth(b)).send(body(1)).expect(403);
      } finally {
        await api().delete(`/api/v1/order/shipment-plans/${created.body.id}`).set(auth(t)).expect(204);
      }
    });

    it('hai người cùng lập kế hoạch hết SL còn lại của một màu cỡ cùng lúc: chỉ một người được', async () => {
      const t = await tokenFor('kehoach.a', 'A01');
      const { c, poIds, line } = await candidate(t, 10);
      const body = { salesOrderId: c.salesOrderId, poIds, poBuyDate: 'RACE', lines: [{ colorName: line.colorName, sizeName: line.sizeName, planQty: line.remainingQty }] };
      const results = await Promise.all([1, 2].map(() => api().post('/api/v1/order/shipment-plans').set(auth(t)).send(body)));
      const ok = results.filter((r) => r.status === 201);
      try {
        expect(ok).toHaveLength(1);
        expect(results.find((r) => r.status !== 201)!.status).toBe(422);
      } finally {
        for (const r of ok) await api().delete(`/api/v1/order/shipment-plans/${r.body.id}`).set(auth(t)).expect(204);
      }
    });

    it('Xếp chuyền: số ngày SX, số ngày nghỉ, kết thúc, ra chuyền, nhập kho tính theo lịch ĐVCS (phase 5.12); không đề xuất phân màu cỡ, không giảm chuyền, màu cỡ dưới phần đã giao (phase 5.13); chuyền nhà máy khác, số ngày quá lớn => 422', async () => {
      const t = await tokenFor('kehoach.a', 'A01');
      const plan = (await api().get(`/api/v1/order/line-plans?pageSize=200&style=${FIXTURE_STYLE}`).set(auth(t))).body.items.find((p: any) => p.id === fixture.planId && p.lineCount === 0);
      await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(t)).send({ lines: [{ lineCode: 'A02-L01', qty: 10, avgOutput: 10, startDate: '2026-12-05' }] }).expect(422);
      const slow = await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(t)).send({ lines: [{ lineCode: 'A01-L12', qty: 1000, avgOutput: 1, startDate: '2026-12-05' }] }).expect(422);
      expect(slow.body.error.message).toContain('366');
      const adminA01 = await tokenFor('admin', 'A01');
      const holiday = { branchCodes: ['A01'], from: '2026-12-07', to: '2026-12-07', dayType: 'OFF', name: 'Nghỉ thử P5' };
      try {
        // 2026-12-05 là thứ Bảy: 1000/300 = 3,33 => 3 ngày SX (phần lẻ dưới ngưỡng 0,5 của lịch mặc định) sau ngày bắt đầu: (CN nghỉ),
        // T2, T3, T4 => kết thúc 2026-12-09. Ra chuyền,
        // nhập kho cộng ngày lịch (lịch mặc định của ĐVCS mẫu: nghỉ Chủ nhật, 3/3/2/5). Số ngày nghỉ client gửi bị bỏ qua
        const saved = (await api()
          .put(`/api/v1/order/line-plans/${plan.id}/lines`)
          .set(auth(t))
          .send({ lines: [{ lineCode: 'A01-L12', qty: 1000, avgOutput: 300, startDate: '2026-12-05', offDays: 9 }] })
          .expect(200)).body;
        expect(saved.lines[0]).toMatchObject({
          lineCode: 'A01-L12',
          productionDays: 3,
          offDays: 1,
          endDate: '2026-12-09',
          outStartDate: '2026-12-08',
          outEndDate: '2026-12-12',
          warehouseStartDate: '2026-12-10',
          warehouseEndDate: '2026-12-17',
        });
        expect(saved.calendar).toMatchObject({ weeklyOffDays: [7], outStartOffsetDays: 3, outEndOffsetDays: 3, warehouseStartOffsetDays: 2, warehouseEndOffsetDays: 5, productionRoundUpFrom: 0.5 });
        // Quản trị đặt thứ Hai 07/12 là ngày nghỉ của A01: lần lưu sau tính theo lịch mới, chi tiết và bảng dàn chuyền thấy ngày đó
        await api().post('/api/v1/admin/catalogs/work-calendars/days').set(auth(adminA01)).send(holiday).expect(201);
        const detail = (await api().get(`/api/v1/order/line-plans/${plan.id}`).set(auth(t)).expect(200)).body;
        expect(detail.calendar.days).toContainEqual({ date: '2026-12-07', dayType: 'OFF', name: 'Nghỉ thử P5' });
        const resaved = (await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(t)).send({ lines: [{ id: saved.lines[0].id, lineCode: 'A01-L12', qty: 1000, avgOutput: 300, startDate: '2026-12-05' }] }).expect(200)).body;
        // Không gửi ngày, ô nhập không đổi: giữ ngày đã lưu (5.12.2), số ngày nghỉ đếm lại theo lịch mới. Giao diện tính lại bằng nút
        // "Tính lại theo công thức" rồi gửi ngày mới
        expect(resaved.lines[0]).toMatchObject({ offDays: 2, endDate: '2026-12-09', outStartDate: '2026-12-08' });
        const holidayBoard = (await api().get('/api/v1/order/line-plans/board?from=2026-12-01&to=2026-12-13').set(auth(t)).expect(200)).body;
        expect(holidayBoard.nonWorkingDays.A01).toEqual([
          { date: '2026-12-06', name: null },
          { date: '2026-12-07', name: 'Nghỉ thử P5' },
          { date: '2026-12-13', name: null },
        ]);
        await api().delete('/api/v1/admin/catalogs/work-calendars/A01/days?from=2026-12-07&to=2026-12-07').set(auth(adminA01)).expect(200);
        expect(saved.lines[0]).toMatchObject({ lineCode: 'A01-L12', productionDays: 3, endDate: '2026-12-09' });
        expect(saved.statusCode).toBe('SCHEDULED');
        // Lưu dàn chuyền không đề xuất phân màu cỡ (phase 5.13): kế hoạch hiện một dòng ở Phân bổ màu cỡ, chưa phân
        const alloc = (await api().get(`/api/v1/order/color-size/${plan.id}`).set(auth(t)).expect(200)).body;
        expect(alloc).toMatchObject({ lineCode: ['A01-L12'], qty: 1200, assignedQty: 0, statusCode: 'PLANNED', rows: [] });
        expect(alloc.colorSizes.map((c: any) => c.qty)).toEqual([200, 200, 200, 200, 200, 200]);
        const board = (await api().get('/api/v1/order/line-plans/board?from=2026-12-01&to=2026-12-31').set(auth(t)).expect(200)).body;
        expect(board.bars.some((b: any) => b.planId === plan.id && b.lineCode === 'A01-L12')).toBe(true);
        // 7 ngày làm sau thứ Hai = thứ Ba tuần sau (bỏ Chủ nhật)
        const week = (await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(t)).send({ lines: [{ id: saved.lines[0].id, lineCode: 'A01-L12', qty: 700, avgOutput: 100, startDate: '2026-12-07' }] }).expect(200)).body;
        expect(week.lines[0]).toMatchObject({ endDate: '2026-12-15', offDays: 1 });
        // Điều chỉnh tay (15/10/2026): ngày gửi lên được lưu, ngày thiếu theo công thức (10/12, 18/12, 12/12), số ngày nghỉ đếm tới
        // Kết thúc vào chuyền đã nhập (Chủ nhật 13/12, 20/12)
        const lineOf = (extra: Record<string, string>) => ({ lines: [{ id: saved.lines[0].id, lineCode: 'A01-L12', qty: 700, avgOutput: 100, startDate: '2026-12-07', ...extra }] });
        const manual = (await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(t)).send(lineOf({ endDate: '2026-12-20', outStartDate: '2026-12-09', warehouseEndDate: '2026-12-31' })).expect(200)).body;
        expect(manual.lines[0]).toMatchObject({ productionDays: 7, offDays: 2, endDate: '2026-12-20', outStartDate: '2026-12-09', outEndDate: '2026-12-18', warehouseStartDate: '2026-12-12', warehouseEndDate: '2026-12-31' });
        const before = await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(t)).send(lineOf({ endDate: '2026-12-06' })).expect(422);
        expect(before.body.error.message).toBe('Dòng 1: Kết thúc vào chuyền trước ngày bắt đầu vào chuyền.');
        await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(t)).send(lineOf({ outStartDate: '2026-12-14', warehouseStartDate: '2026-12-13' })).expect(422);
        // Kết thúc vào chuyền là cột "Ngày kết thúc SX" của chính sách cột: Chỉ đọc thì không gửi được (403), các ngày khác vẫn sửa
        try {
          await setRolePolicy('PLANNER', 'order.lineplan', 'endDate', 'READONLY');
          const ro = await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(t)).send(lineOf({ endDate: '2026-12-20' })).expect(403);
          expect(ro.body.error).toMatchObject({ code: 'FIELD_READONLY', details: { fields: ['endDate'] } });
          // Không gửi endDate, ô nhập không đổi: giữ Kết thúc vào chuyền đã chỉnh tay (20/12), không đè về công thức (review 5.12.2 H1)
          const kept = (await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(t)).send(lineOf({ outStartDate: '2026-12-11' })).expect(200)).body;
          expect(kept.lines[0]).toMatchObject({ endDate: '2026-12-20', offDays: 2, outStartDate: '2026-12-11', warehouseEndDate: '2026-12-31' });
          // Đổi năng suất: ngày không gửi tính lại theo công thức (700/50 = 14 ngày sau thứ Hai 07/12, nghỉ Chủ nhật 13, 20/12)
          const recalc = (await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(t)).send({ lines: [{ id: saved.lines[0].id, lineCode: 'A01-L12', qty: 700, avgOutput: 50, startDate: '2026-12-07' }] }).expect(200)).body;
          expect(recalc.lines[0]).toMatchObject({ endDate: '2026-12-23', offDays: 2, outStartDate: '2026-12-10', outEndDate: '2026-12-26', warehouseStartDate: '2026-12-12', warehouseEndDate: '2026-12-31' });
        } finally {
          await setRolePolicy('PLANNER', 'order.lineplan', 'endDate', null);
        }
        // Giao 100 mỗi màu cỡ (600) cho chuyền 12: Xếp chuyền không giảm chuyền xuống dưới 600, Kế hoạch xuất hàng không giảm màu cỡ
        // xuống dưới 100 hay bỏ màu cỡ đã giao (409); bỏ chuyền thì phần giao của nó bị xóa theo (finally)
        const l12 = alloc.lines[0].id;
        const given = (await api().put(`/api/v1/order/color-size/${plan.id}`).set(auth(t)).send({ rows: alloc.colorSizes.map((c: any) => ({ lineId: l12, colorName: c.colorName, sizeName: c.sizeName, assignedQty: 100 })) }).expect(200)).body;
        expect(given).toMatchObject({ assignedQty: 600, statusCode: 'PARTIAL' });
        const shrink = await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(t)).send({ lines: [{ id: l12, lineCode: 'A01-L12', qty: 599, avgOutput: 100, startDate: '2026-12-07' }] }).expect(409);
        expect(shrink.body.error.details).toEqual([expect.stringContaining('đã giao 600, số lượng mới 599')]);
        const cells = alloc.colorSizes.map((c: any, i: number) => ({ colorName: c.colorName, sizeName: c.sizeName, planQty: i === 0 ? 99 : 200 }));
        const cut = await api().put(`/api/v1/order/shipment-plans/${plan.id}`).set(auth(t)).send({ lines: cells }).expect(409);
        expect(cut.body.error.details).toEqual([`${cells[0].colorName}/${cells[0].sizeName}: đã giao 100, SL KHXH mới 99`]);
        await api().put(`/api/v1/order/shipment-plans/${plan.id}`).set(auth(t)).send({ lines: cells.slice(1) }).expect(409);
        // Kế hoạch cũ đang giao vượt một màu cỡ (chia theo tỷ lệ trước phase 5.13): sửa màu cỡ khác vẫn được, giảm đúng màu cỡ đó thì 409
        await app
          .get<OrderDb>(ORDER_DB)
          .updateTable('ShipmentPlanLineColorSize')
          .set({ AssignedQty: 250 })
          .where('ShipmentPlanLineId', '=', l12)
          .where('ColorName', '=', cells[0].colorName)
          .where('SizeName', '=', cells[0].sizeName)
          .execute();
        const raise = cells.map((c: any, i: number) => ({ ...c, planQty: i === 1 ? 210 : 200 }));
        await api().put(`/api/v1/order/shipment-plans/${plan.id}`).set(auth(t)).send({ lines: raise }).expect(200);
        await api()
          .put(`/api/v1/order/shipment-plans/${plan.id}`)
          .set(auth(t))
          .send({ lines: raise.map((c: any, i: number) => (i === 0 ? { ...c, planQty: 199 } : c)) })
          .expect(409);
        await api().put(`/api/v1/order/shipment-plans/${plan.id}`).set(auth(t)).send({ lines: cells.map((c: any) => ({ ...c, planQty: 200 })) }).expect(200);
        // Chuyền 12 đang giao 750 > SL chuyền 700 (dữ liệu cũ): lưu dàn chuyền giữ số lượng vẫn được, giảm tiếp thì 409
        const keepLine = { id: l12, lineCode: 'A01-L12', qty: 700, avgOutput: 100, startDate: '2026-12-07' };
        await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(t)).send({ lines: [keepLine] }).expect(200);
        const less = await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(t)).send({ lines: [{ ...keepLine, qty: 699 }] }).expect(409);
        expect(less.body.error.details).toEqual([expect.stringContaining('đã giao 750, số lượng mới 699')]);
      } finally {
        await api().delete(`/api/v1/admin/catalogs/work-calendars/A01/days?from=${holiday.from}&to=${holiday.to}`).set(auth(adminA01)).expect(200);
        const back = (await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(t)).send({ lines: [] }).expect(200)).body;
        expect(back.statusCode).toBe('PLANNED');
      }
    });

    it('Xếp chuyền: người chỉ sửa được một chuyền (xem được mọi chuyền nhờ vai trò khác) không xếp vượt SL kế hoạch, không làm mất trạng thái', async () => {
      const t = await tokenFor('kehoach.a', 'A01');
      const plan = (await api().get(`/api/v1/order/line-plans?pageSize=200&style=${FIXTURE_STYLE}`).set(auth(t))).body.items.find((p: any) => p.id === fixture.planId && p.lineCount === 0);
      // Kế hoạch giới hạn chuyền 3, Giám đốc xem mọi chuyền: phạm vi xem rộng hơn phạm vi sửa
      const id = await tempUser('test.line', ['PLANNER', 'DIRECTOR'], ['A01'], { PLANNER: [{ dimension: 'LINE', mode: 'LIST', value: 'A01-L03' }] });
      try {
        await api()
          .put(`/api/v1/order/line-plans/${plan.id}/lines`)
          .set(auth(t))
          .send({ lines: [{ lineCode: 'A01-L12', qty: plan.planQty - 100, avgOutput: 300, startDate: '2026-12-07' }] })
          .expect(200);
        const l3 = await tokenFor('test.line', 'A01', TEST_PASSWORD);
        const seen = (await api().get(`/api/v1/order/line-plans/${plan.id}`).set(auth(l3)).expect(200)).body.lines;
        expect(seen.map((l: any) => [l.lineCode, l.editable])).toEqual([['A01-L12', false]]);
        const line = (qty: number) => ({ lines: [{ lineCode: 'A01-L03', qty, avgOutput: 100, startDate: '2026-12-07' }] });
        const over = await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(l3)).send(line(200)).expect(422);
        expect(over.body.error.message).toContain('chuyền khác');
        await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(l3)).send(line(100)).expect(200);
        // Xóa dòng của mình: kế hoạch vẫn còn dòng ở chuyền khác nên giữ trạng thái đã xếp chuyền
        await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(l3)).send({ lines: [] }).expect(200);
        const after = (await api().get(`/api/v1/order/line-plans/${plan.id}`).set(auth(t)).expect(200)).body;
        expect(after.statusCode).toBe('SCHEDULED');
        expect(after.lines.map((l: any) => l.lineCode)).toEqual(['A01-L12']);
      } finally {
        await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(t)).send({ lines: [] }).expect(200);
        await dropUser(id);
      }
    });

    it('Xếp chuyền: dòng sửa được mà không xem được (ngoại lệ Cho phép) không bị xóa khi lưu; SL bị Che thì thông báo không nêu số', async () => {
      const t = await tokenFor('kehoach.a', 'A01');
      const plan = (await api().get(`/api/v1/order/line-plans?pageSize=200&style=${FIXTURE_STYLE}`).set(auth(t))).body.items.find((p: any) => p.id === fixture.planId && p.lineCount === 0);
      // Kế hoạch: chuyền 3 (xem và sửa); QC: chuyền 5 (không có quyền Xếp chuyền). Cho phép sửa theo người lấy hợp mọi phép gán
      // nên phạm vi sửa {3, 5} rộng hơn phạm vi xem {3}
      const id = await tempUser('test.m1', ['PLANNER', 'QC'], ['A01'], {
        PLANNER: [{ dimension: 'LINE', mode: 'LIST', value: 'A01-L03' }],
        QC: [{ dimension: 'LINE', mode: 'LIST', value: 'A01-L05' }],
      });
      const line = (lineCode: string, qty: number) => ({ lines: [{ lineCode, qty, avgOutput: 1000, startDate: '2026-12-07' }] });
      try {
        await api().post(`/api/v1/admin/users/${id}/overrides`).set(auth(admin)).send({ permissionId: permId('order.lineplan:update'), effect: 'ALLOW', reason: 'Phạm vi sửa rộng hơn phạm vi xem (test)' }).expect(200);
        await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(t)).send(line('A01-L05', 100)).expect(200);
        const u = await tokenFor('test.m1', 'A01', TEST_PASSWORD);
        expect((await api().get(`/api/v1/order/line-plans/${plan.id}`).set(auth(u)).expect(200)).body.lines).toEqual([]);
        await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(u)).send(line('A01-L03', 100)).expect(200);
        const after = (await api().get(`/api/v1/order/line-plans/${plan.id}`).set(auth(t)).expect(200)).body.lines.map((l: any) => `${l.lineCode}:${l.qty}`).sort();
        expect(after).toEqual(['A01-L03:100', 'A01-L05:100']);
        // Không thêm, không chuyển được dòng sang chuyền chỉ sửa được mà không thấy; lần lưu bị hủy cả (dòng chuyền 3 không mất)
        expect((await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(u)).send(line('A01-L05', 50)).expect(403)).body.error.code).toBe('SCOPE_DENIED');
        const mineLine = (await api().get(`/api/v1/order/line-plans/${plan.id}`).set(auth(u)).expect(200)).body.lines[0];
        const moved = { lines: [{ id: mineLine.id, lineCode: 'A01-L05', qty: 100, avgOutput: 1000, startDate: '2026-12-07' }] };
        expect((await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(u)).send(moved).expect(403)).body.error.code).toBe('SCOPE_DENIED');
        const still = (await api().get(`/api/v1/order/line-plans/${plan.id}`).set(auth(t)).expect(200)).body.lines.map((l: any) => `${l.lineCode}:${l.qty}`).sort();
        expect(still).toEqual(['A01-L03:100', 'A01-L05:100']);

        await setRolePolicy('PLANNER', 'order.lineplan', 'planQty', 'MASKED');
        const over = await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(u)).send(line('A01-L03', plan.planQty)).expect(422);
        expect(over.body.error.message).toContain('vượt số lượng kế hoạch');
        expect(over.body.error.message).not.toMatch(/\d/);
      } finally {
        await setRolePolicy('PLANNER', 'order.lineplan', 'planQty', null);
        await api().put(`/api/v1/order/line-plans/${plan.id}/lines`).set(auth(t)).send({ lines: [] }).expect(200);
        await dropUser(id);
      }
    });

    it('hai giao dịch khóa chéo nhau: lỗi deadlock gốc (1205) không bị lỗi rollback che mất; bộ lọc lỗi đổi thành 409', async () => {
      const order = app.get<OrderDb>(ORDER_DB);
      const [a, b] = (await sql<{ Id: number }>`SELECT TOP 2 Id FROM dbo.SalesOrder ORDER BY Id`.execute(order)).rows.map((r) => r.Id);
      const lockRow = (trx: OrderDb, id: number) => sql`SELECT Id FROM dbo.SalesOrder WITH (UPDLOCK, ROWLOCK) WHERE Id = ${id}`.execute(trx);
      let locked = 0;
      // Chờ cả hai bên giữ khóa đầu (tối đa 10 giây, để một bên lỗi sớm thì test báo sai chứ không treo)
      const until = Date.now() + 10_000;
      const bothLocked = () => new Promise<void>((resolve) => {
        const tick = () => (locked >= 2 || Date.now() > until ? resolve() : setTimeout(tick, 20));
        tick();
      });
      const run = (first: number, second: number) =>
        inTransaction(order, async (trx) => {
          await lockRow(trx, first);
          locked++;
          await bothLocked();
          await lockRow(trx, second);
        });
      const results = await Promise.allSettled([run(a, b), run(b, a)]);
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(failed).toHaveLength(1);
      expect(isDeadlock(failed[0].reason)).toBe(true);
      // Bộ lọc lỗi chung trả 409 cho lỗi này; driver ném mảng khi một request nhận nhiều lỗi
      const sent: { status?: number; body?: any } = {};
      const response = { status: (s: number) => ((sent.status = s), response), json: (b: unknown) => (sent.body = b) };
      new AllExceptionsFilter().catch(failed[0].reason, { switchToHttp: () => ({ getResponse: () => response }) } as never);
      expect(sent.status).toBe(409);
      expect(sent.body.error.code).toBe('CONFLICT');
      expect(isDeadlock([{ number: 50000 }, { number: 1205 }])).toBe(true);
      expect(isDeadlock({ number: 547 })).toBe(false);
    }, 30_000);

    it('Xếp chuyền: dòng đang may không xóa, không chuyển chuyền được (409)', async () => {
      const t = await tokenFor('kehoach.a', 'A01');
      const plans = (await api().get(`/api/v1/order/line-plans?pageSize=200&status=IN_PRODUCTION&style=${FIXTURE_STYLE}`).set(auth(t))).body.items;
      const detail = (await api().get(`/api/v1/order/line-plans/${plans[0].id}`).set(auth(t)).expect(200)).body;
      const running = detail.lines.find((l: any) => l.statusCode === 'IN_PRODUCTION');
      const keep = detail.lines.filter((l: any) => l.id !== running.id);
      await api().put(`/api/v1/order/line-plans/${plans[0].id}/lines`).set(auth(t)).send({ lines: keep.map(strip) }).expect(409);
      await api()
        .put(`/api/v1/order/line-plans/${plans[0].id}/lines`)
        .set(auth(t))
        .send({ lines: detail.lines.map((l: any) => strip(l.id === running.id ? { ...l, lineCode: 'A01-L12' } : l)) })
        .expect(409);
    });

    it('Cập nhật tỷ lệ cắt: PO đã xác nhận không sửa được (409); hủy xác nhận thì sửa được', async () => {
      const t = await tokenFor('kehoach.a', 'A01');
      const po = (await api().get(`/api/v1/order/cut-ratio/pos?pageSize=200&style=${FIXTURE_STYLE}`).set(auth(t))).body.items.find((p: any) => p.id === fixture.confirmedPoId && p.statusCode === 'CONFIRMED');
      const lines = (await api().get(`/api/v1/order/cut-ratio/pos/${po.id}/color-sizes`).set(auth(t)).expect(200)).body.lines.map((l: any) => ({ colorName: l.colorName, sizeName: l.sizeName, qty: l.qty }));
      expect((await api().put(`/api/v1/order/cut-ratio/pos/${po.id}/color-sizes`).set(auth(t)).send({ lines }).expect(409)).body.error.code).toBe('CONFLICT');
      await api().post(`/api/v1/order/cut-ratio/pos/${po.id}/unconfirm`).set(auth(t)).expect(200);
      try {
        const changed = lines.map((l: any, i: number) => (i === 0 ? { ...l, qty: l.qty + 5 } : l));
        const u = (await api().put(`/api/v1/order/cut-ratio/pos/${po.id}/color-sizes`).set(auth(t)).send({ lines: changed }).expect(200)).body;
        expect(u.po.qty).toBe(po.qty + 5);
        await api().put(`/api/v1/order/cut-ratio/pos/${po.id}/color-sizes`).set(auth(t)).send({ lines }).expect(200);
      } finally {
        await api().post(`/api/v1/order/cut-ratio/pos/${po.id}/confirm`).set(auth(t)).expect(200);
      }
    });

    it('PO#, cỡ dạng dữ liệu BRAVO (dấu cách, ngoặc, loại cỡ) lưu được; PO# có dấu, dài tới 192 ký tự lưu được; quá dài, xuống dòng, cỡ ký tự lạ => 422', async () => {
      const t = await tokenFor('kehoach.a', 'A01');
      const po = (poNumber: string, sizeName: string) => ({ salesOrderId: fixture.orderId, poNumber, shipDate: '2027-06-30', lines: [{ colorName: 'Đen', sizeName, qty: 1 }] });
      // Cột PO# là NVARCHAR(192) từ MES_Order/0007: chữ tiếng Việt lưu đúng
      const long = `PO Đặc biệt ${'x'.repeat(180)}`;
      expect(long.length).toBe(192);
      const vn = await api().post('/api/v1/order/cut-ratio/pos').set(auth(t)).send(po(long, 'M')).expect(201);
      expect(vn.body.poNumber).toBe(long.toUpperCase());
      await api().post('/api/v1/order/cut-ratio/pos').set(auth(t)).send(po(`${long}x`, 'M')).expect(422);
      await api().post('/api/v1/order/cut-ratio/pos').set(auth(t)).send(po('PO\n1', 'M')).expect(422);
      await api().post('/api/v1/order/cut-ratio/pos').set(auth(t)).send(po('PO-1', 'M+')).expect(422);
      const ok = await api().post('/api/v1/order/cut-ratio/pos').set(auth(t)).send(po('PO 12 (A), B/2', '32 SHORT')).expect(201);
      expect(ok.body.poNumber).toBe('PO 12 (A), B/2');
      const lines = (await api().get(`/api/v1/order/cut-ratio/pos/${ok.body.id}/color-sizes`).set(auth(t)).expect(200)).body.lines;
      expect(lines.map((l: any) => l.sizeName)).toEqual(['32 SHORT']);
      // PO tạo thêm nằm trong đơn hàng của test, afterAll xóa cùng fixture
    });
  });
});

/** Dòng dàn chuyền gửi lên: chỉ các trường của DTO. */
function strip(l: any) {
  return {
    id: l.id,
    lineCode: l.lineCode,
    qty: l.qty,
    avgOutput: l.avgOutput,
    startDate: l.startDate,
  };
}
