import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'kysely';
import request from 'supertest';
import { importBravoBranches } from '../src/platform/admin/branch-import';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { env } from '../src/config/env';
import { ORDER_DB } from '../src/modules/order/order.db';
import type { OrderDb } from '../src/modules/order/order.types';
import { CORE_DB, type CoreDb } from '../src/platform/database/database.module';
import { createDb } from '../src/platform/database/db';
import { CatalogLookupService } from '../src/platform/catalog/catalog-lookup.service';
import { productionDaysOf } from '../src/platform/catalog/work-calendar';
import { CatalogService } from '../src/platform/catalog/catalog.service';
import { SyncService } from '../src/platform/sync/sync.service';
import type { SyncDatabase } from '../src/platform/sync/sync.types';

// Phase 5.4: Quản trị › Danh mục hệ thống. Cần MES_Core đã migrate (0003) và seed (quyền admin.catalog, danh mục mẫu);
// phần danh mục BRAVO cần MES_Sync đã đồng bộ (chưa có thì bỏ qua phần đó). Dữ liệu thử mang mã TEST-P54 / A01-T54 / T54- /
// tài khoản test.p54, xóa (tài khoản thì vô hiệu hóa) khi xong.
describe('Phase 5.4: danh mục hệ thống', () => {
  let app: INestApplication;
  let core: CoreDb;
  let order: OrderDb;
  let admin: string;
  let planner: string;
  /** MES_Sync đã có và đã đồng bộ danh mục: chưa có thì bỏ qua các kiểm tra danh mục BRAVO */
  let externalReady = false;
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function tokenFor(username: string, branchCode: string) {
    const l = await api().post('/api/v1/auth/login').send({ username, password: env.demoPassword });
    const s = await api().post('/api/v1/auth/select-branch').set('Authorization', `Bearer ${l.body.preAuthToken}`).send({ branchCode });
    if (!s.body.accessToken) throw new Error(`Không chọn được ${branchCode} cho ${username}: ${JSON.stringify(s.body)}`);
    return s.body.accessToken as string;
  }

  /** Dữ liệu thử: xóa vật lý chỉ trong test (màn hình không có xóa). Cây tổ chức đổi thì tăng phiên bản quyền như service. */
  async function cleanup() {
    const orders = order.selectFrom('SalesOrder').select('Id').where('StyleCode', '=', 'TEST-P54-FIXTURE');
    const plans = order.selectFrom('ShipmentPlan').select('Id').where('SalesOrderId', 'in', orders);
    const lineIds = order.selectFrom('ShipmentPlanLine').select('Id').where('ShipmentPlanId', 'in', plans);
    await order.deleteFrom('ShipmentPlanLineColorSize').where('ShipmentPlanLineId', 'in', lineIds).execute();
    await order.deleteFrom('ShipmentPlanLine').where('ShipmentPlanId', 'in', plans).execute();
    await order.deleteFrom('ShipmentPlanColorSize').where('ShipmentPlanId', 'in', plans).execute();
    await order.deleteFrom('ShipmentPlanPo').where('ShipmentPlanId', 'in', plans).execute();
    await order.deleteFrom('ShipmentPlan').where('SalesOrderId', 'in', orders).execute();
    const pos = order.selectFrom('SalesOrderPo').select('Id').where('SalesOrderId', 'in', orders);
    await order.deleteFrom('SalesOrderPoColorSize').where('SalesOrderPoId', 'in', pos).execute();
    await order.deleteFrom('SalesOrderPo').where('SalesOrderId', 'in', orders).execute();
    await order.deleteFrom('SalesOrder').where('StyleCode', '=', 'TEST-P54-FIXTURE').execute();
    await core.deleteFrom('SysCatalogItem').where('Code', 'like', 'TEST-P54%').execute();
    // Nhà máy SX thử: gỡ gán của người dùng trước (khóa ngoại; bảng gán theo người không còn dùng nhưng còn dữ liệu cũ)
    const testFactories = core.selectFrom('SysProductionFactory').select('Id').where('Code', 'like', 'TEST-P54%');
    await core.deleteFrom('SysUserProductionFactory').where('ProductionFactoryId', 'in', testFactories).execute();
    await core.deleteFrom('SysProductionFactory').where('Code', 'like', 'TEST-P54%').execute();
    await core.deleteFrom('SysShift').where('Code', 'like', 'T54-%').execute();
    // Tài khoản Trưởng chuyền thử (leaderWith) của lần chạy bị ngắt: còn ngoại lệ ALLOW quyền quản trị và mật khẩu nằm trong
    // file test, nên gỡ hết và khóa lại trước khi chạy (DB demo mở được qua LAN)
    const testUsers = core.selectFrom('SysUser').select('Id').where('Username', 'like', 'test.p54%');
    const testRoles = core.selectFrom('SysUserRole').select('Id').where('UserId', 'in', testUsers);
    await core.deleteFrom('SysUserPermissionOverride').where('UserId', 'in', testUsers).execute();
    await core.deleteFrom('SysUserRoleScope').where('UserRoleId', 'in', testRoles).execute();
    await core.deleteFrom('SysUserRole').where('UserId', 'in', testUsers).execute();
    await core.updateTable('SysUser').set({ IsActive: false }).where('Username', 'like', 'test.p54%').execute();
    await core.updateTable('SysUserSession').set({ RevokedAt: new Date() }).where('UserId', 'in', testUsers).where('RevokedAt', 'is', null).execute();
    // Phạm vi người dùng trỏ tới xưởng, chuyền thử (lần chạy trước bị ngắt giữa chừng) phải xóa trước đơn vị.
    // Xưởng và chuyền con xóa cùng một câu lệnh (khóa ngoại tự trỏ kiểm cuối câu lệnh)
    const testUnits = core.selectFrom('SysOrgUnit').select('Id').where('Code', 'like', 'A0_-T54%');
    await core.deleteFrom('SysUserRoleScope').where('OrgUnitId', 'in', testUnits).execute();
    await core.deleteFrom('SysOrgUnit').where('Code', 'like', 'A0_-T54%').execute();
    // Đã ghi thẳng vào bảng quyền (ngoại lệ, vai trò, cây tổ chức): tăng phiên bản quyền như service
    await sql`UPDATE dbo.SysPermissionVersion SET Version = Version + 1 WHERE Id = 1`.execute(core);
  }

  /** Đơn hàng, kế hoạch riêng của một bài thử (số chứng từ `no`), mỗi chuyền một dòng dàn chuyền 100 chiếc đã phân màu cỡ */
  async function planOnLines(no: string, lineCodes: string[]) {
    const own = { BranchCode: 'A01', CreatedBy: (await core.selectFrom('SysUser').select('Id').where('Username', '=', 'kehoach.a').executeTakeFirstOrThrow()).Id };
    const head = { CustomerName: 'KHÁCH TEST P54', StyleCode: 'TEST-P54-FIXTURE' };
    const id = async (table: string, values: object) => ((await order.insertInto(table as any).values(values as any).output('inserted.Id' as any).executeTakeFirstOrThrow()) as { Id: number }).Id;
    const so = await id('SalesOrder', { ...head, OrderNo: no, ProductName: 'Áo test', Qty: 200, UnitName: 'Chiếc', ShipDate: '2026-12-31', StatusCode: 'PLANNING', ...own });
    const po = await id('SalesOrderPo', { ...head, SalesOrderId: so, PoCode: no, PoNumber: no, Qty: 200, ShipDate: '2026-12-31', StatusCode: 'DRAFT', ...own });
    await order.insertInto('SalesOrderPoColorSize').values({ SalesOrderPoId: po, ColorName: 'Đen', SizeName: 'M', Qty: 200, SortOrder: 0, ...own } as any).execute();
    const plan = await id('ShipmentPlan', { ...head, PlanNo: no, SalesOrderId: so, ProductName: 'Áo test', PoBuyDate: 'TEST', PlanQty: 200, ShipDate: '2026-12-31', PlannerName: 'Test', StatusCode: 'SCHEDULED', ...own });
    await order.insertInto('ShipmentPlanPo').values({ ShipmentPlanId: plan, SalesOrderPoId: po, ...own } as any).execute();
    await order.insertInto('ShipmentPlanColorSize').values({ ShipmentPlanId: plan, ColorName: 'Đen', SizeName: 'M', OriginalQty: 200, PlanQty: 200, SortOrder: 0, ...own } as any).execute();
    const planLines: number[] = [];
    for (const [i, code] of lineCodes.entries()) {
      const planLine = await id('ShipmentPlanLine', { ShipmentPlanId: plan, LineCode: code, Qty: 100, AvgOutput: 100, StartDate: '2026-12-01', ProductionDays: 1, OffDays: 0, EndDate: '2026-12-01', StatusCode: 'ALLOCATED', SortOrder: i, ...own });
      await order.insertInto('ShipmentPlanLineColorSize').values({ ShipmentPlanLineId: planLine, ColorName: 'Đen', SizeName: 'M', PlanQty: 100, AssignedQty: 100, SortOrder: 0, ...own } as any).execute();
      planLines.push(planLine);
    }
    return { plan, planLines };
  }

  /**
   * Tài khoản Trưởng chuyền thử chỉ làm ở A01, phạm vi cho trước (orgId: Id đơn vị theo mã). Trả token đã chọn A01 và hàm gỡ
   * (bỏ vai trò, vô hiệu hóa tài khoản) để gọi trong finally.
   */
  async function leaderWith(username: string, scopes: (orgId: (code: string) => number) => object[]) {
    const orgUnits = (await api().get('/api/v1/admin/scope-catalog').set(auth(admin)).expect(200)).body.orgUnits as { id: number; code: string }[];
    const orgId = (code: string) => orgUnits.find((o) => o.code === code)!.id;
    const roles = (await api().get('/api/v1/admin/roles').set(auth(admin)).expect(200)).body as { id: number; code: string }[];
    const branches = (await api().get('/api/v1/admin/branches').set(auth(admin)).expect(200)).body as { id: number; code: string }[];
    const leaderRole = roles.find((r) => r.code === 'LINE_LEADER')!.id;
    const created = await api().post('/api/v1/admin/users').set(auth(admin)).send({ username, fullName: `${username} (test)`, initialPassword: 'Test@2026x' });
    const uid = created.status === 201 ? (created.body.id as number) : (await api().get(`/api/v1/admin/users?q=${username}`).set(auth(admin))).body.items.find((u: any) => u.username === username).id;
    if (created.status !== 201) {
      await api().post(`/api/v1/admin/users/${uid}/reset-password`).set(auth(admin)).send({ newPassword: 'Test@2026x' }).expect(200);
      await api().put(`/api/v1/admin/users/${uid}`).set(auth(admin)).send({ isActive: true, unlock: true }).expect(200);
    }
    const done = async () => {
      // Ngoại lệ theo người (nếu bài thử có cấp) gỡ trước, để lần chạy sau tài khoản bắt đầu sạch
      const access = (await api().get(`/api/v1/admin/users/${uid}/access`).set(auth(admin)).expect(200)).body;
      for (const o of access.overrides) await api().delete(`/api/v1/admin/users/${uid}/overrides/${o.id}`).set(auth(admin)).expect(200);
      await api().put(`/api/v1/admin/users/${uid}/roles`).set(auth(admin)).send({ roleIds: [] }).expect(200);
      await api().put(`/api/v1/admin/users/${uid}`).set(auth(admin)).send({ isActive: false }).expect(200);
    };
    try {
      await api().put(`/api/v1/admin/users/${uid}/roles`).set(auth(admin)).send({ roleIds: [leaderRole] }).expect(200);
      await api().put(`/api/v1/admin/users/${uid}/branches`).set(auth(admin)).send({ branchIds: branches.filter((b) => b.code === 'A01').map((b) => b.id) }).expect(200);
      await api().put(`/api/v1/admin/users/${uid}/roles/${leaderRole}/scope`).set(auth(admin)).send({ scopes: scopes(orgId) }).expect(200);
      const l = await api().post('/api/v1/auth/login').send({ username, password: 'Test@2026x' });
      const token = (await api().post('/api/v1/auth/select-branch').set('Authorization', `Bearer ${l.body.preAuthToken}`).send({ branchCode: 'A01' })).body.accessToken as string;
      return { id: uid as number, token, done };
    } catch (e) {
      await done();
      throw e;
    }
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    core = app.get<CoreDb>(CORE_DB);
    order = app.get<OrderDb>(ORDER_DB);
    await cleanup();
    admin = await tokenFor('admin', 'A01');
    planner = await tokenFor('kehoach.a', 'A01');
    const o = (await api().get('/api/v1/admin/catalogs').set(auth(admin)).expect(200)).body;
    externalReady = !o.externalError && o.external.length > 0;
    if (!externalReady) console.warn(`Bỏ qua kiểm tra danh mục BRAVO: ${o.externalError ?? 'MES_Sync chưa có danh mục'}`);
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('chỉ người có quyền Danh mục hệ thống xem, thêm, sửa được; tổng quan có danh mục MES và danh mục BRAVO', async () => {
    await api().get('/api/v1/admin/catalogs').set(auth(planner)).expect(403);
    await api().post('/api/v1/admin/catalogs/items/UNIT').set(auth(planner)).send({ code: 'TEST-P54', name: 'x' }).expect(403);
    await api().get('/api/v1/admin/catalogs/external/BRAVO.DM_Size/rows').set(auth(planner)).expect(403);
    const o = (await api().get('/api/v1/admin/catalogs').set(auth(admin)).expect(200)).body;
    // Chuyền may không còn là danh mục hệ thống (phase 5.10): chuyền là bộ phận tích "Xưởng sản xuất" ở Nhân sự
    expect(o.mes.map((c: any) => c.code)).toEqual(['PROD_FACTORY', 'UNIT', 'ORDER_TYPE', 'SHIFT', 'WORK_CALENDAR']);
    expect(o.mes.find((c: any) => c.code === 'WORK_CALENDAR').kind).toBe('calendar');
    expect(o.mes.find((c: any) => c.code === 'PROD_FACTORY').kind).toBe('factory');
    // Danh sách ĐVCS cho ô chọn của Nhà máy SX: mọi ĐVCS trừ đơn vị tổng hợp, kèm trạng thái
    expect(o.branches.map((b: any) => b.code)).toEqual(expect.arrayContaining(['A01', 'A02', 'A03']));
    expect(o.branches.map((b: any) => b.code)).not.toContain('A00');
    expect(o.branches.find((b: any) => b.code === 'A01')).toMatchObject({ isActive: true, name: expect.any(String) });
    if (externalReady) expect(o.external.every((c: any) => c.code.startsWith('BRAVO.DM_'))).toBe(true);
  });

  it('danh mục đơn giản: mã chữ hoa, không trùng, không sửa được; ngừng dùng thì không còn trong gợi ý của Đơn hàng; có nhật ký', async () => {
    const created = await api().post('/api/v1/admin/catalogs/items/UNIT').set(auth(admin)).send({ code: ' test-p54 ', name: 'Thùng thử' }).expect(201);
    await api().post('/api/v1/admin/catalogs/items/UNIT').set(auth(admin)).send({ code: 'TEST-P54', name: 'Trùng' }).expect(409);
    await api().post('/api/v1/admin/catalogs/items/UNIT').set(auth(admin)).send({ code: 'TEST P54!', name: 'Sai mã' }).expect(422);
    // Đơn hàng lưu tên đơn vị trong cột 20 ký tự
    await api().post('/api/v1/admin/catalogs/items/UNIT').set(auth(admin)).send({ code: 'TEST-P54-LONG', name: 'Đơn vị có tên dài quá hai mươi ký tự' }).expect(422);
    await api().post('/api/v1/admin/catalogs/items/KHONG_CO').set(auth(admin)).send({ code: 'TEST-P54', name: 'x' }).expect(404);
    const id = created.body.id as number;
    const items = (await api().get('/api/v1/admin/catalogs/items/UNIT').set(auth(admin)).expect(200)).body.items;
    expect(items.find((i: any) => i.id === id)).toMatchObject({ code: 'TEST-P54', name: 'Thùng thử', isActive: true });

    expect((await api().put(`/api/v1/admin/catalogs/items/UNIT/${id}`).set(auth(admin)).send({ code: 'TEST-P54X' }).expect(422)).body.error.code).toBe('CODE_IMMUTABLE');
    // Mục của danh mục này không sửa được qua đường của danh mục khác
    await api().put(`/api/v1/admin/catalogs/items/ORDER_TYPE/${id}`).set(auth(admin)).send({ name: 'x' }).expect(404);
    await api().put(`/api/v1/admin/catalogs/items/UNIT/${id}`).set(auth(admin)).send({ name: 'Thùng thử 2' }).expect(200);
    const units = async () => (await api().get('/api/v1/order/sales-orders/options').set(auth(planner)).expect(200)).body.units as string[];
    expect(await units()).toContain('Thùng thử 2');
    await api().put(`/api/v1/admin/catalogs/items/UNIT/${id}`).set(auth(admin)).send({ isActive: false }).expect(200);
    expect(await units()).not.toContain('Thùng thử 2');

    const audit = (await api().get('/api/v1/admin/audit?entityType=SysCatalogItem&pageSize=5').set(auth(admin)).expect(200)).body.items;
    expect(audit.map((a: any) => a.actionCode)).toEqual(expect.arrayContaining(['CATALOG_ITEM_CREATE', 'CATALOG_ITEM_UPDATE']));
  });

  it('Loại đơn hàng gợi ý theo danh mục, kèm tên', async () => {
    const o = (await api().get('/api/v1/order/sales-orders/options').set(auth(planner)).expect(200)).body;
    expect(o.orderTypes).toEqual(expect.arrayContaining(['SXXK', 'GCND']));
    expect(o.orderTypeNames.SXXK).toBe('Sản xuất xuất khẩu');
  });

  it('chép ĐVCS từ BRAVO: bỏ qua mã sai dạng, mã trống, trùng đơn vị tổng hợp; chạy lại không đổi gì (quyết định 6.1)', async () => {
    const r = await importBravoBranches(core, [
      { BranchCode: 'A00', TenChiNhanh: 'Không được đè tổng hợp', TenDayDu: null },
      { BranchCode: 'sai mã!', TenChiNhanh: 'x', TenDayDu: null },
      { BranchCode: null, TenChiNhanh: 'x', TenDayDu: null },
    ], null);
    expect(r.added).toEqual([]);
    expect(r.updated).toEqual([]);
    expect(r.skipped).toEqual(expect.arrayContaining(['A00', 'sai mã!', '(trống)']));
    expect((await core.selectFrom('SysBranch').select('Name').where('Code', '=', 'A00').executeTakeFirstOrThrow()).Name).not.toBe('Không được đè tổng hợp');
    if (!externalReady) return;
    // Có MES_Sync: lần đầu chép theo BRAVO, lần sau không còn gì để thêm hay đổi; mỗi ĐVCS chép về có nút gốc trong cây tổ chức
    await api().post('/api/v1/admin/branches/import').set(auth(planner)).expect(403);
    const first = (await api().post('/api/v1/admin/branches/import').set(auth(admin)).expect(200)).body;
    expect(first.rows).toBeGreaterThan(0);
    const again = (await api().post('/api/v1/admin/branches/import').set(auth(admin)).expect(200)).body;
    expect(again).toMatchObject({ added: [], updated: [] });
    const list = (await api().get('/api/v1/admin/branches').set(auth(admin)).expect(200)).body as any[];
    const bravo = list.filter((b) => b.inBravo === true);
    expect(bravo.length).toBe(first.rows - first.skipped.length);
    const nodes = await core.selectFrom('SysOrgUnit').select('Code').where('OrgType', '=', 'FACTORY').execute();
    for (const b of bravo) expect(nodes.map((n) => n.Code)).toContain(b.code);
    // Tên ĐVCS theo BRAVO không sửa ở MES
    expect((await api().put(`/api/v1/admin/branches/${bravo[0].id}`).set(auth(admin)).send({ name: 'Đổi tên thử' }).expect(409)).body.error.message).toContain('BRAVO');
  });

  it('danh mục Nhà máy SX: mỗi nhà máy thuộc một ĐVCS (không phải đơn vị tổng hợp), mã không sửa được; có nhật ký (quyết định 6.2)', async () => {
    await api().post('/api/v1/admin/catalogs/factories').set(auth(planner)).send({ code: 'TEST-P54-G', name: 'x', branchCode: 'A01' }).expect(403);
    await api().post('/api/v1/admin/catalogs/factories').set(auth(admin)).send({ code: 'TEST-P54-G', name: 'Tổng hợp', branchCode: 'A00' }).expect(422);
    await api().post('/api/v1/admin/catalogs/factories').set(auth(admin)).send({ code: 'TEST-P54-G', name: 'Không có ĐVCS', branchCode: 'Z99' }).expect(422);
    // Mã là tên nhà máy theo OSM (có dấu, khoảng trắng, quyết định 6.2) nhưng không có dấu phẩy: đơn hàng lưu danh sách mã cách nhau dấu phẩy
    await api().post('/api/v1/admin/catalogs/factories').set(auth(admin)).send({ code: 'TEST,P54', name: 'Sai mã', branchCode: 'A01' }).expect(422);
    const created = (await api().post('/api/v1/admin/catalogs/factories').set(auth(admin)).send({ code: ' test-p54-g ', name: 'Nhà máy thử', branchCode: 'A01' }).expect(201)).body;
    await api().post('/api/v1/admin/catalogs/factories').set(auth(admin)).send({ code: 'TEST-P54-G', name: 'Trùng', branchCode: 'A01' }).expect(409);
    const list = (await api().get('/api/v1/admin/catalogs/factories?q=TEST-P54-G').set(auth(admin)).expect(200)).body;
    expect(list.find((f: any) => f.id === created.id)).toMatchObject({ code: 'TEST-P54-G', name: 'Nhà máy thử', branchCode: 'A01', isActive: true });
    expect((await api().put(`/api/v1/admin/catalogs/factories/${created.id}`).set(auth(admin)).send({ code: 'TEST-P54-H' }).expect(422)).body.error.code).toBe('CODE_IMMUTABLE');
    await api().put(`/api/v1/admin/catalogs/factories/${created.id}`).set(auth(admin)).send({ branchCode: 'A00' }).expect(422);
    await api().put(`/api/v1/admin/catalogs/factories/${created.id}`).set(auth(admin)).send({ branchCode: 'A02', name: 'Nhà máy thử 2' }).expect(200);
    // ĐVCS hiện các nhà máy SX của nó ở Quản trị › Đơn vị cơ sở
    const branches = (await api().get('/api/v1/admin/branches').set(auth(admin)).expect(200)).body as any[];
    expect(branches.find((b) => b.code === 'A02').factories.map((f: any) => f.code)).toContain('TEST-P54-G');
    const audit = (await api().get('/api/v1/admin/audit?entityType=SysProductionFactory&pageSize=5').set(auth(admin)).expect(200)).body.items;
    expect(audit.map((a: any) => a.actionCode)).toEqual(expect.arrayContaining(['FACTORY_CREATE', 'FACTORY_UPDATE']));
  });

  it('nhà máy SX trong quyền của phiên theo ĐVCS đăng nhập: thêm, đổi ĐVCS, ngừng nhà máy có hiệu lực ngay; không còn tích theo người (quyết định 6.3)', async () => {
    const codes = async () => ((await api().get('/api/v1/me').set(auth(planner)).expect(200)).body.productionFactories as any[]).map((x) => x.code);
    expect(await codes()).not.toContain('TEST-P54-U');
    const f = (await api().post('/api/v1/admin/catalogs/factories').set(auth(admin)).send({ code: 'TEST-P54-U', name: 'Nhà máy gán thử', branchCode: 'A01' }).expect(201)).body;
    expect(await codes()).toContain('TEST-P54-U');
    await api().put(`/api/v1/admin/catalogs/factories/${f.id}`).set(auth(admin)).send({ branchCode: 'A02' }).expect(200);
    expect(await codes()).not.toContain('TEST-P54-U');
    await api().put(`/api/v1/admin/catalogs/factories/${f.id}`).set(auth(admin)).send({ branchCode: 'A01' }).expect(200);
    expect(await codes()).toContain('TEST-P54-U');
    await api().put(`/api/v1/admin/catalogs/factories/${f.id}`).set(auth(admin)).send({ isActive: false }).expect(200);
    expect(await codes()).not.toContain('TEST-P54-U');
    // Ở ĐVCS khác thì không có nhà máy của A01
    const a02 = await tokenFor('admin', 'A02');
    expect(((await api().get('/api/v1/me').set(auth(a02)).expect(200)).body.productionFactories as any[]).map((x) => x.code)).not.toContain('A01');
    // Màn Người dùng không còn gán nhà máy theo người: danh sách không còn trường này, gửi lên thì bỏ qua
    const kh = (await api().get('/api/v1/admin/users?q=kehoach.a').set(auth(admin))).body.items.find((u: any) => u.username === 'kehoach.a');
    expect(kh.productionFactoryIds).toBeUndefined();
    await api().put(`/api/v1/admin/users/${kh.id}/branches`).set(auth(admin)).send({ branchIds: kh.branchIds, defaultBranchId: kh.defaultBranchId ?? undefined, productionFactoryIds: [f.id] }).expect(200);
    expect(await core.selectFrom('SysUserProductionFactory').select('Id').where('ProductionFactoryId', '=', f.id).executeTakeFirst()).toBeUndefined();
    await api().get('/api/v1/admin/users/production-factories').set(auth(admin)).expect(404);
  });

  it('Nhà máy SX của đơn hàng chọn từ danh mục Nhà máy SX: mã lạ hoặc nhà máy đã ngừng => 422, đơn cũ giữ nhà máy đã ngừng; theo chính sách cột', async () => {
    type Factory = { code: string; name: string; isActive: boolean; branchCode: string | null };
    const options = async () => (await api().get('/api/v1/order/sales-orders/options').set(auth(planner)).expect(200)).body.factories as Factory[];
    // Nhà máy SX ban đầu: chép từ danh mục cũ hoặc nhà máy mẫu của seed, cùng mã với ĐVCS
    expect((await options()).map((f) => f.code)).toEqual(expect.arrayContaining(['A01', 'A02']));
    const factory = (await api().post('/api/v1/admin/catalogs/factories').set(auth(admin)).send({ code: 'TEST-P54-F', name: 'Xưởng gia công thử', branchCode: 'A01' }).expect(201)).body;

    const base = { customerName: 'Khách thử P54', styleCode: 'TEST-P54-FIXTURE', productName: 'Áo thử', qty: 10, shipDate: '2026-12-01' };
    const so = (await api().post('/api/v1/order/sales-orders').set(auth(planner)).send({ ...base, productionFactoryCode: ' test-p54-f ' }).expect(201)).body;
    expect(so).toMatchObject({ branchCode: 'A01', productionFactoryCode: 'TEST-P54-F' });
    expect((await api().post('/api/v1/order/sales-orders').set(auth(planner)).send({ ...base, productionFactoryCode: 'KHONG-CO' }).expect(422)).body.error.message).toContain('Nhà máy SX');
    await api().post('/api/v1/order/sales-orders').set(auth(planner)).send({ ...base, productionFactoryCode: 'A01; DROP' }).expect(422);
    // Mã đơn vị chuyền (SysOrgUnit) không phải nhà máy SX
    await api().put(`/api/v1/order/sales-orders/${so.id}`).set(auth(planner)).send({ productionFactoryCode: 'A01-L01' }).expect(422);

    // Ngừng dùng: không chọn mới được; đơn đã chọn vẫn giữ, sửa trường khác được; gợi ý vẫn có tên để lưới hiện đúng
    await api().put(`/api/v1/admin/catalogs/factories/${factory.id}`).set(auth(admin)).send({ isActive: false }).expect(200);
    expect((await options()).find((f) => f.code === 'TEST-P54-F')).toMatchObject({ name: 'Xưởng gia công thử', isActive: false, branchCode: 'A01' });
    await api().post('/api/v1/order/sales-orders').set(auth(planner)).send({ ...base, productionFactoryCode: 'TEST-P54-F' }).expect(422);
    expect((await api().put(`/api/v1/order/sales-orders/${so.id}`).set(auth(planner)).send({ qty: 12 }).expect(200)).body).toMatchObject({ qty: 12, productionFactoryCode: 'TEST-P54-F' });
    // Client gửi đủ mọi trường (kể cả nhà máy hiện tại đã ngừng) vẫn lưu được
    await api().put(`/api/v1/order/sales-orders/${so.id}`).set(auth(planner)).send({ qty: 13, productionFactoryCode: 'TEST-P54-F' }).expect(200);
    expect((await api().put(`/api/v1/order/sales-orders/${so.id}`).set(auth(planner)).send({ productionFactoryCode: null }).expect(200)).body.productionFactoryCode).toBeNull();
    expect((await api().put(`/api/v1/order/sales-orders/${so.id}`).set(auth(planner)).send({ productionFactoryCode: 'A02' }).expect(200)).body.productionFactoryCode).toBe('A02');
    const list = (await api().get('/api/v1/order/sales-orders?q=TEST-P54-FIXTURE').set(auth(planner)).expect(200)).body;
    expect(list.items.find((r: any) => r.id === so.id).productionFactoryCode).toBe('A02');
    // File xuất ghi tên nhà máy như trên lưới
    const exportCsv = async () => (await api().get('/api/v1/order/sales-orders/export?q=TEST-P54-FIXTURE').set(auth(planner)).expect(200)).text;
    const csv = await exportCsv();
    expect(csv).toContain('Chi nhánh FOB');
    expect(csv).toContain('Nhà máy SX');
    const a02 = (await options()).find((f) => f.code === 'A02')!.name;
    expect(csv.split('\n').find((l) => l.includes(so.orderNo))).toContain(a02);
    // Chuỗi rỗng là bỏ chọn
    expect((await api().put(`/api/v1/order/sales-orders/${so.id}`).set(auth(planner)).send({ productionFactoryCode: '' }).expect(200)).body.productionFactoryCode).toBeNull();
    await api().put(`/api/v1/order/sales-orders/${so.id}`).set(auth(planner)).send({ productionFactoryCode: 'A02' }).expect(200);

    // Chính sách cột: Chỉ đọc thì không gửi lên được; Che thì hiện ***; Ẩn thì không có trong dữ liệu, file xuất; gợi ý rỗng khi Che, Ẩn
    const roleId = (await api().get('/api/v1/admin/roles').set(auth(admin)).expect(200)).body.find((r: any) => r.code === 'PLANNER').id;
    const matrix = (await api().get('/api/v1/admin/permissions').set(auth(admin)).expect(200)).body;
    const resourceId = matrix.modules.flatMap((m: any) => m.resources).find((r: any) => r.code === 'order.allocation').id;
    const setLevel = (level: string | null) =>
      api().put(`/api/v1/admin/roles/${roleId}/field-policies`).set(auth(admin)).send({ resourceId, policies: [{ fieldCode: 'productionFactoryCode', accessLevel: level }] }).expect(200);
    try {
      await setLevel('READONLY');
      const r = await api().put(`/api/v1/order/sales-orders/${so.id}`).set(auth(planner)).send({ productionFactoryCode: 'A01' }).expect(403);
      expect(r.body.error).toMatchObject({ code: 'FIELD_READONLY', details: { fields: ['productionFactoryCode'] } });
      await setLevel('MASKED');
      expect((await api().get(`/api/v1/order/sales-orders/${so.id}`).set(auth(planner)).expect(200)).body.productionFactoryCode).toBe('***');
      expect(await options()).toEqual([]);
      expect(await exportCsv()).not.toContain(a02);
      await setLevel('HIDDEN');
      expect((await api().get(`/api/v1/order/sales-orders/${so.id}`).set(auth(planner)).expect(200)).body).not.toHaveProperty('productionFactoryCode');
      expect(await options()).toEqual([]);
      expect(await exportCsv()).not.toContain('Nhà máy SX');
    } finally {
      await setLevel(null);
    }
  });

  it('danh mục chuyền may, xưởng cũ đã bỏ (phase 5.10): API cũ trả 404, không tạo nút nào ở cây tổ chức', async () => {
    const nodes = async () => Number((await core.selectFrom('SysOrgUnit').select(sql<number>`COUNT(*)`.as('n')).executeTakeFirstOrThrow()).n);
    const before = await nodes();
    await api().get('/api/v1/admin/catalogs/lines').set(auth(admin)).expect(404);
    await api().get('/api/v1/admin/catalogs/lines?q=A01&branch=A01').set(auth(admin)).expect(404);
    await api().post('/api/v1/admin/catalogs/lines').set(auth(admin)).send({ branchCode: 'A01', code: 'A01-T54', name: 'Chuyền thử' }).expect(404);
    await api().put('/api/v1/admin/catalogs/lines/1').set(auth(admin)).send({ isActive: false }).expect(404);
    await api().post('/api/v1/admin/catalogs/workshops').set(auth(admin)).send({ branchCode: 'A01', code: 'A01-T54W', name: 'Xưởng thử' }).expect(404);
    await api().put('/api/v1/admin/catalogs/workshops/1').set(auth(admin)).send({ isActive: false }).expect(404);
    expect(await nodes()).toBe(before);
  });

  it('ca làm việc: ca qua đêm tính đúng giờ làm; nghỉ không dài hơn ca; giờ sai dạng => 422', async () => {
    const created = await api()
      .post('/api/v1/admin/catalogs/shifts')
      .set(auth(admin))
      .send({ code: 't54-night', name: 'Ca đêm thử', startTime: '22:00', endTime: '06:00', breakMinutes: 30 })
      .expect(201);
    const shift = ((await api().get('/api/v1/admin/catalogs/shifts').set(auth(admin)).expect(200)).body as any[]).find((s) => s.id === created.body.id);
    expect(shift).toMatchObject({ code: 'T54-NIGHT', startTime: '22:00', endTime: '06:00', workMinutes: 450, overnight: true });
    await api().post('/api/v1/admin/catalogs/shifts').set(auth(admin)).send({ code: 'T54-SAME', name: 'x', startTime: '08:00', endTime: '08:00' }).expect(422);
    await api().post('/api/v1/admin/catalogs/shifts').set(auth(admin)).send({ code: 'T54-BAD', name: 'x', startTime: '8h', endTime: '17:00' }).expect(422);
    await api().put(`/api/v1/admin/catalogs/shifts/${created.body.id}`).set(auth(admin)).send({ breakMinutes: 480 }).expect(422);
    await api().put(`/api/v1/admin/catalogs/shifts/${created.body.id}`).set(auth(admin)).send({ endTime: '07:00', breakMinutes: 60 }).expect(200);
    const after = ((await api().get('/api/v1/admin/catalogs/shifts').set(auth(admin))).body as any[]).find((s) => s.id === created.body.id);
    expect(after).toMatchObject({ endTime: '07:00', breakMinutes: 60, workMinutes: 480 });
  });

  it('lịch làm việc theo ĐVCS: chỉ quyền danh mục; không cho đơn vị tổng hợp; đặt khoảng ngày cho nhiều ĐVCS, ghi đè, xóa theo khoảng; có nhật ký (phase 5.12)', async () => {
    const days = '/api/v1/admin/catalogs/work-calendars/days';
    const config = { weeklyOffDays: [7], outStartOffsetDays: 3, outEndOffsetDays: 3, warehouseStartOffsetDays: 2, warehouseEndOffsetDays: 5 };
    await api().get('/api/v1/admin/catalogs/work-calendars').set(auth(planner)).expect(403);
    await api().put('/api/v1/admin/catalogs/work-calendars/A01').set(auth(planner)).send(config).expect(403);
    await api().post(days).set(auth(planner)).send({ branchCodes: ['A01'], from: '2031-01-22', to: '2031-01-22', dayType: 'OFF' }).expect(403);
    await api().delete('/api/v1/admin/catalogs/work-calendars/A01/days?from=2031-01-01&to=2031-01-31').set(auth(planner)).expect(403);
    const before = (await api().get('/api/v1/admin/catalogs/work-calendars').set(auth(admin)).expect(200)).body;
    expect(before.defaults).toEqual({ ...config, productionRoundUpFrom: 0.5 });
    expect(before.items.map((i: any) => i.branchCode)).toEqual(expect.arrayContaining(['A01', 'A02', 'A03']));
    expect(before.items.map((i: any) => i.branchCode)).not.toContain('A00');
    const configured = new Set<string>(before.items.filter((i: any) => i.configured).map((i: any) => i.branchCode));
    const a03Before = before.items.find((i: any) => i.branchCode === 'A03');
    try {
      await api().put('/api/v1/admin/catalogs/work-calendars/A00').set(auth(admin)).send(config).expect(422);
      await api().post(days).set(auth(admin)).send({ branchCodes: ['A01', 'A00'], from: '2031-01-22', to: '2031-01-22', dayType: 'OFF' }).expect(422);
      await api().put('/api/v1/admin/catalogs/work-calendars/Z99').set(auth(admin)).send(config).expect(404);
      // Nghỉ cả tuần, ngày bắt đầu ra chuyền sau ngày kết thúc, ngày không có thật, khoảng ngược, khoảng quá dài, loại lạ
      await api().put('/api/v1/admin/catalogs/work-calendars/A03').set(auth(admin)).send({ ...config, weeklyOffDays: [1, 2, 3, 4, 5, 6, 7] }).expect(422);
      await api().put('/api/v1/admin/catalogs/work-calendars/A03').set(auth(admin)).send({ ...config, outStartOffsetDays: 4 }).expect(422);
      await api().put('/api/v1/admin/catalogs/work-calendars/A03').set(auth(admin)).send({ ...config, warehouseStartOffsetDays: 6 }).expect(422);
      await api().put('/api/v1/admin/catalogs/work-calendars/A03').set(auth(admin)).send({ ...config, outEndOffsetDays: 61 }).expect(422);
      await api().post(days).set(auth(admin)).send({ branchCodes: ['A01'], from: '2031-02-30', to: '2031-03-01', dayType: 'OFF' }).expect(422);
      await api().post(days).set(auth(admin)).send({ branchCodes: ['A01'], from: '2031-03-01', to: '2031-02-01', dayType: 'OFF' }).expect(422);
      await api().post(days).set(auth(admin)).send({ branchCodes: ['A01'], from: '2031-01-01', to: '2031-04-01', dayType: 'OFF' }).expect(422);
      await api().post(days).set(auth(admin)).send({ branchCodes: ['A01'], from: '2031-01-22', to: '2031-01-22', dayType: 'HALF' }).expect(422);
      await api().post(days).set(auth(admin)).send({ branchCodes: [], from: '2031-01-22', to: '2031-01-22', dayType: 'OFF' }).expect(422);
      // Năm ngoài 2000–2100 (DATE không nhận năm 0000: phải 422, không 500); xóa quá một năm một lần
      await api().post(days).set(auth(admin)).send({ branchCodes: ['A01'], from: '0000-01-01', to: '0000-01-02', dayType: 'OFF' }).expect(422);
      await api().delete('/api/v1/admin/catalogs/work-calendars/A01/days?from=0000-01-01&to=2031-01-01').set(auth(admin)).expect(422);
      await api().delete('/api/v1/admin/catalogs/work-calendars/A01/days?from=2030-01-01&to=2031-12-31').set(auth(admin)).expect(422);

      // Tết thử cho hai ĐVCS một lần; rồi đặt lại Chủ nhật 26/01/2031 của A01 thành làm bù (ghi đè ngày đã có)
      expect((await api().post(days).set(auth(admin)).send({ branchCodes: ['A01', 'A02'], from: '2031-01-22', to: '2031-01-28', dayType: 'OFF', name: ' Tết thử T54 ' }).expect(201)).body).toEqual({ count: 14 });
      await api().post(days).set(auth(admin)).send({ branchCodes: ['A01'], from: '2031-01-26', to: '2031-01-26', dayType: 'WORK', name: 'Làm bù T54' }).expect(201);
      const inRange = (list: any[]) => list.filter((d) => d.date >= '2031-01-22' && d.date <= '2031-01-28').map((d) => [d.date.slice(8), d.dayType, d.name]);
      const a01 = (await api().get('/api/v1/admin/catalogs/work-calendars/A01/days?year=2031').set(auth(admin)).expect(200)).body;
      expect(inRange(a01)).toEqual([
        ['22', 'OFF', 'Tết thử T54'],
        ['23', 'OFF', 'Tết thử T54'],
        ['24', 'OFF', 'Tết thử T54'],
        ['25', 'OFF', 'Tết thử T54'],
        ['26', 'WORK', 'Làm bù T54'],
        ['27', 'OFF', 'Tết thử T54'],
        ['28', 'OFF', 'Tết thử T54'],
      ]);
      const a02 = (await api().get('/api/v1/admin/catalogs/work-calendars/A02/days?year=2031').set(auth(admin)).expect(200)).body;
      expect(inRange(a02).map(([d, type]) => `${d}${type}`)).toEqual(['22OFF', '23OFF', '24OFF', '25OFF', '26OFF', '27OFF', '28OFF']);
      // Xóa theo khoảng chỉ ở A02; A01 giữ nguyên
      expect((await api().delete('/api/v1/admin/catalogs/work-calendars/A02/days?from=2031-01-22&to=2031-01-28').set(auth(admin)).expect(200)).body).toEqual({ removed: true, deleted: 7 });
      expect(inRange((await api().get('/api/v1/admin/catalogs/work-calendars/A02/days?year=2031').set(auth(admin))).body)).toEqual([]);
      // Xóa lại khoảng đã trống: không lỗi, số ngày đã xóa là 0
      expect((await api().delete('/api/v1/admin/catalogs/work-calendars/A02/days?from=2031-01-22&to=2031-01-28').set(auth(admin)).expect(200)).body).toEqual({ removed: true, deleted: 0 });
      expect(inRange((await api().get('/api/v1/admin/catalogs/work-calendars/A01/days?year=2031').set(auth(admin))).body)).toHaveLength(7);

      // Cấu hình A03: nghỉ thứ Bảy, Chủ nhật; số ngày cộng thêm riêng
      const a03 = { weeklyOffDays: [6, 7], outStartOffsetDays: 1, outEndOffsetDays: 2, warehouseStartOffsetDays: 1, warehouseEndOffsetDays: 1 };
      await api().put('/api/v1/admin/catalogs/work-calendars/A03').set(auth(admin)).send(a03).expect(200);
      const after = (await api().get('/api/v1/admin/catalogs/work-calendars').set(auth(admin)).expect(200)).body;
      expect(after.items.find((i: any) => i.branchCode === 'A03')).toMatchObject({ configured: true, ...a03 });
      expect(after.items.find((i: any) => i.branchCode === 'A01')).toMatchObject({ configured: true });
      // Lưu lại đúng cấu hình đang có: không ghi, không thêm nhật ký
      const auditCount = async () => Number((await core.selectFrom('SysAuditLog').select(sql<number>`COUNT(*)`.as('N')).where('EntityType', '=', 'SysWorkCalendar').executeTakeFirstOrThrow()).N);
      const n = await auditCount();
      await api().put('/api/v1/admin/catalogs/work-calendars/A03').set(auth(admin)).send(a03).expect(200);
      expect(await auditCount()).toBe(n);

      // Ngưỡng làm tròn Số ngày SX (MES_Core/0014): 0,01–1, tối đa 2 chữ số lẻ; không gửi thì giữ số đang có
      for (const bad of [0, 1.5, 0.555]) await api().put('/api/v1/admin/catalogs/work-calendars/A03').set(auth(admin)).send({ ...a03, productionRoundUpFrom: bad }).expect(422);
      await api().put('/api/v1/admin/catalogs/work-calendars/A03').set(auth(admin)).send({ ...a03, productionRoundUpFrom: 0.7 }).expect(200);
      await api().put('/api/v1/admin/catalogs/work-calendars/A03').set(auth(admin)).send({ ...a03, outEndOffsetDays: 3 }).expect(200);
      const rounded = (await api().get('/api/v1/admin/catalogs/work-calendars').set(auth(admin)).expect(200)).body.items.find((i: any) => i.branchCode === 'A03');
      expect(rounded).toMatchObject({ productionRoundUpFrom: 0.7, outEndOffsetDays: 3 });
      // Lịch mà Xếp chuyền dùng (CatalogLookupService, làm mới sau khi lưu) đọc đúng ngưỡng: 7,69 bỏ, 7,7 lên
      const a03Calendar = await app.get(CatalogLookupService).workCalendar('A03');
      expect(a03Calendar.productionRoundUpFrom).toBe(0.7);
      expect([productionDaysOf(a03Calendar, 769, 100), productionDaysOf(a03Calendar, 77, 10)]).toEqual([7, 8]);

      // Bảng dàn chuyền ở đơn vị tổng hợp: mỗi ĐVCS ngày nghỉ theo lịch riêng (2031-03-02 là Chủ nhật)
      await api().post(days).set(auth(admin)).send({ branchCodes: ['A02'], from: '2031-03-05', to: '2031-03-05', dayType: 'OFF', name: 'Nghỉ riêng T54' }).expect(201);
      const aggregate = await tokenFor('admin', 'A00');
      const board = (await api().get('/api/v1/order/line-plans/board?from=2031-03-02&to=2031-03-08').set(auth(aggregate)).expect(200)).body;
      expect(board.nonWorkingDays.A02).toEqual([
        { date: '2031-03-02', name: null },
        { date: '2031-03-05', name: 'Nghỉ riêng T54' },
      ]);
      expect(board.nonWorkingDays.A01).toEqual([{ date: '2031-03-02', name: null }]);

      const audit = (await api().get('/api/v1/admin/audit?entityType=SysWorkCalendar&pageSize=10').set(auth(admin)).expect(200)).body.items;
      expect(audit.map((a: any) => a.actionCode)).toEqual(expect.arrayContaining(['WORK_CALENDAR_UPDATE', 'WORK_CALENDAR_DAYS_SET', 'WORK_CALENDAR_DAYS_DELETE']));
    } finally {
      // Trả lịch như trước bài thử: ngày năm 2031, cấu hình A03, lịch do bài thử tạo mới
      await sql`DELETE FROM dbo.SysWorkCalendarDay WHERE CalendarDate BETWEEN '2031-01-01' AND '2031-12-31'`.execute(core);
      if (configured.has('A03')) {
        const { weeklyOffDays, outStartOffsetDays, outEndOffsetDays, warehouseStartOffsetDays, warehouseEndOffsetDays, productionRoundUpFrom } = a03Before;
        await api()
          .put('/api/v1/admin/catalogs/work-calendars/A03')
          .set(auth(admin))
          .send({ weeklyOffDays, outStartOffsetDays, outEndOffsetDays, warehouseStartOffsetDays, warehouseEndOffsetDays, productionRoundUpFrom })
          .expect(200);
      }
      for (const code of ['A01', 'A02', 'A03'].filter((c) => !configured.has(c))) {
        const cal = core.selectFrom('SysWorkCalendar').select('Id').where('BranchCode', '=', code);
        await core.deleteFrom('SysWorkCalendarDay').where('WorkCalendarId', 'in', cal).execute();
        await core.deleteFrom('SysWorkCalendar').where('BranchCode', '=', code).execute();
      }
      app.get(CatalogLookupService).invalidateWorkCalendars();
    }
  });

  it('danh mục BRAVO chỉ xem: đọc theo trang, tìm theo cột chữ; tên danh mục lạ hoặc không phải danh mục => 404', async () => {
    if (!externalReady) return;
    const page = (await api().get('/api/v1/admin/catalogs/external/BRAVO.DM_Size/rows?pageSize=5').set(auth(admin)).expect(200)).body;
    expect(page.total).toBeGreaterThan(5);
    expect(page.rows).toHaveLength(5);
    expect(page.columns.find((c: any) => c.key).name).toBe('SizeId');
    expect(page.columns.map((c: any) => c.name)).not.toContain('SyncRunId');
    const xl = (await api().get('/api/v1/admin/catalogs/external/BRAVO.DM_Size/rows?q=XL&pageSize=100').set(auth(admin)).expect(200)).body;
    const code = xl.columns.findIndex((c: any) => c.name === 'Code');
    expect(xl.total).toBeGreaterThan(0);
    expect(xl.total).toBeLessThan(page.total);
    expect(xl.rows.every((r: any[]) => r.some((v) => typeof v === 'string' && v.toUpperCase().includes('XL')) || String(r[code]).includes('XL'))).toBe(true);
    // Ký tự đặc biệt của LIKE được hiểu theo nghĩa đen
    expect((await api().get('/api/v1/admin/catalogs/external/BRAVO.DM_Size/rows?q=%25').set(auth(admin)).expect(200)).body.total).toBe(0);
    await api().get('/api/v1/admin/catalogs/external/BRAVO.DM_SanPhamDonHang/rows').set(auth(admin)).expect(404);
    await api().get(`/api/v1/admin/catalogs/external/${encodeURIComponent('BRAVO.DM_Size;DROP TABLE x')}/rows`).set(auth(admin)).expect(404);
  });

  it('chuyền mồ côi (mã không còn là bộ phận chuyền nào, Q4 phase 5.10): hiện mã kèm "(chuyền cũ)", không lỗi; dòng cũ lưu lại được, không xếp việc mới vào; bảng dàn chuyền không có hàng', async () => {
    // A01-T54B không phải bộ phận nào (như chuyền cũ A01-L01… trên máy chủ trước 5.10); A01-L12 là chuyền mẫu (bộ phận đã tích)
    const { plan, planLines: [orphan, normal] } = await planOnLines('TEST-P54', ['A01-T54B', 'A01-L12']);
    const l12 = ((await api().get('/api/v1/me/lines').set(auth(planner)).expect(200)).body as { code: string; name: string }[]).find((l) => l.code === 'A01-L12');
    expect(l12).toBeDefined();

    const detail = (await api().get(`/api/v1/order/line-plans/${plan}`).set(auth(planner)).expect(200)).body;
    expect(detail.lines.map((x: any) => [x.lineCode, x.lineName])).toEqual([
      ['A01-T54B', 'A01-T54B (chuyền cũ)'],
      ['A01-L12', l12!.name],
    ]);
    // Phân bổ màu cỡ (một dòng mỗi kế hoạch, phase 5.13): danh sách, chi tiết, file xuất không lỗi
    const items = (await api().get('/api/v1/order/color-size?pageSize=50&style=TEST-P54-FIXTURE').set(auth(planner)).expect(200)).body.items as any[];
    expect(items.find((i) => i.id === plan)).toMatchObject({ lineCode: ['A01-T54B', 'A01-L12'], lineName: ['A01-T54B (chuyền cũ)', l12!.name] });
    const allocation = (await api().get(`/api/v1/order/color-size/${plan}`).set(auth(planner)).expect(200)).body;
    expect(allocation.lines.map((x: any) => [x.id, x.lineName])).toEqual([
      [orphan, 'A01-T54B (chuyền cũ)'],
      [normal, l12!.name],
    ]);
    const csv = (await api().get('/api/v1/order/color-size/export?style=TEST-P54-FIXTURE').set(auth(planner)).expect(200)).text;
    expect(csv).toContain(`A01-T54B (chuyền cũ), ${l12!.name}`);

    // Lưu lại dòng cũ (không đổi chuyền) được; thêm việc mới hay chuyển dòng vào mã mồ côi thì không
    const keep = { id: orphan, lineCode: 'A01-T54B', qty: 100, avgOutput: 50, startDate: '2026-12-01' };
    const other = { id: normal, lineCode: 'A01-L12', qty: 100, avgOutput: 100, startDate: '2026-12-01' };
    await api().put(`/api/v1/order/line-plans/${plan}/lines`).set(auth(planner)).send({ lines: [keep, other] }).expect(200);
    const added = await api()
      .put(`/api/v1/order/line-plans/${plan}/lines`)
      .set(auth(planner))
      .send({ lines: [keep, other, { lineCode: 'A01-T54B', qty: 50, avgOutput: 50, startDate: '2026-12-03' }] })
      .expect(422);
    expect(added.body.error.message).toContain('A01-T54B');
    await api().put(`/api/v1/order/line-plans/${plan}/lines`).set(auth(planner)).send({ lines: [keep, { ...other, lineCode: 'A01-T54B' }] }).expect(422);

    // Bảng dàn chuyền chỉ liệt kê chuyền đang có: không có hàng cho mã mồ côi (thanh của nó không vẽ được), chuyền khác vẫn đủ
    const board = (await api().get('/api/v1/order/line-plans/board?from=2026-11-25&to=2026-12-10').set(auth(planner)).expect(200)).body;
    expect(board.lines.map((x: any) => x.code)).not.toContain('A01-T54B');
    expect(board.lines.map((x: any) => x.code)).toContain('A01-L12');
    expect(board.bars.some((b: any) => b.planId === plan && b.lineCode === 'A01-L12')).toBe(true);
  });

  it('database giữ đúng cấp của cây tổ chức cũ: chuyền không làm cha, xưởng chỉ dưới nhà máy, loại cha phải khớp, cùng nhà máy, không đổi loại nút đang có con', async () => {
    // Nút Xưởng, Chuyền không còn API tạo (phase 5.10) nhưng bảng và ràng buộc vẫn còn: thêm thẳng vào bảng, ở trạng thái ngừng dùng
    const base = { Name: 'x', BranchCode: 'A01', SortOrder: 0, IsActive: false, IsSystem: false };
    const insert = (v: object) => core.insertInto('SysOrgUnit').values({ ...base, ...v } as any).execute();
    const idOf = async (code: string) => (await core.selectFrom('SysOrgUnit').select('Id').where('Code', '=', code).executeTakeFirstOrThrow()).Id;
    const factory = await idOf('A01');
    await insert({ Code: 'A01-T54V', OrgType: 'WORKSHOP', ParentId: factory, ParentOrgType: 'FACTORY', Path: '/A01/A01-T54V/' });
    const ws = await idOf('A01-T54V');
    await insert({ Code: 'A01-T54E', OrgType: 'LINE', ParentId: ws, ParentOrgType: 'WORKSHOP', Path: '/A01/A01-T54V/A01-T54E/' });
    const line = await idOf('A01-T54E');
    await expect(insert({ Code: 'A01-T54E1', OrgType: 'LINE', ParentId: line, ParentOrgType: 'LINE', Path: '/A01/A01-T54V/A01-T54E/A01-T54E1/' })).rejects.toThrow(/CK_SysOrgUnit_Level/);
    // Khai cha là xưởng nhưng Id là một chuyền
    await expect(insert({ Code: 'A01-T54E2', OrgType: 'LINE', ParentId: line, ParentOrgType: 'WORKSHOP', Path: '/A01/A01-T54V/A01-T54E/A01-T54E2/' })).rejects.toThrow(/FK_SysOrgUnit_Parent/);
    await expect(insert({ Code: 'A01-T54V2', OrgType: 'WORKSHOP', ParentId: ws, ParentOrgType: 'WORKSHOP', Path: '/A01/A01-T54V/A01-T54V2/' })).rejects.toThrow(/CK_SysOrgUnit_Level/);
    // Có cha mà bỏ trống loại cha: khóa ngoại ghép sẽ không kiểm dòng này nên CHECK phải chặn
    await expect(insert({ Code: 'A01-T54E3', OrgType: 'LINE', ParentId: ws, ParentOrgType: null, Path: '/A01/A01-T54V/A01-T54E3/' })).rejects.toThrow(/CK_SysOrgUnit_Level/);
    await expect(insert({ Code: 'A02-T54E5', BranchCode: 'A02', OrgType: 'LINE', ParentId: ws, ParentOrgType: 'WORKSHOP', Path: '/A02/A01-T54V/A02-T54E5/' })).rejects.toThrow(/FK_SysOrgUnit_Parent/);
    await expect(core.updateTable('SysOrgUnit').set({ OrgType: 'LINE', ParentOrgType: 'FACTORY' }).where('Id', '=', ws).execute()).rejects.toThrow(/FK_SysOrgUnit_Parent/);
    // Path phải bằng Path của cha + mã (MES_Core/0006): phân quyền cả nhánh lọc theo Path. Trigger RAISERROR rồi ROLLBACK nên driver
    // ném mảng lỗi (kèm lỗi 3609), không phải một Error
    const dbError = async (write: Promise<unknown>) => {
      try {
        await write;
      } catch (e) {
        return (Array.isArray(e) ? e : [e]).map((x) => (x as Error)?.message).join(' | ');
      }
      throw new Error('Lệnh ghi không bị chặn');
    };
    expect(await dbError(insert({ Code: 'A01-T54E6', OrgType: 'LINE', ParentId: ws, ParentOrgType: 'WORKSHOP', Path: '/A01/A01-T54E6/' }))).toMatch(/ORG_PATH_MISMATCH/);
    expect(await dbError(core.updateTable('SysOrgUnit').set({ Path: '/A01/A01-T54E/' }).where('Id', '=', line).execute())).toMatch(/ORG_PATH_MISMATCH/);
    // Đúng cấp thì ghi được: các lần trên bị chặn đúng vì cấp, không vì lý do khác
    await insert({ Code: 'A01-T54E4', OrgType: 'LINE', ParentId: ws, ParentOrgType: 'WORKSHOP', Path: '/A01/A01-T54V/A01-T54E4/' });
  });

  it('cột Chi nhánh (Chi nhánh FOB) và file xuất ghi tên chi nhánh: TenChiNhanh của danh mục chi nhánh BRAVO, không ghi mã', async () => {
    const branchNames = (await api().get('/api/v1/me/branch-names').set(auth(planner)).expect(200)).body as { code: string; name: string }[];
    expect(branchNames.map((b) => b.code)).toEqual(expect.arrayContaining(['A01', 'A02', 'A03']));
    expect(branchNames.map((b) => b.code)).not.toContain('A00');
    const a01 = branchNames.find((b) => b.code === 'A01')!.name;
    expect(a01.trim()).not.toBe('');
    // Có MES_Sync: đúng tên chép từ BRAVO (chỉ đọc bảng chép)
    if (externalReady) {
      const sync = createDb<SyncDatabase>(env.db.syncName);
      try {
        const bravo = await sync.selectFrom('bravo.DM_CHINHANH').select('TenChiNhanh').where('BranchCode', '=', 'A01').executeTakeFirst();
        if (bravo?.TenChiNhanh?.trim()) expect(a01).toBe(bravo.TenChiNhanh.trim());
      } finally {
        await sync.destroy();
      }
    }
    const so = (await api().post('/api/v1/order/sales-orders').set(auth(planner)).send({ customerName: 'Khách thử P54', styleCode: 'TEST-P54-FIXTURE', productName: 'Áo thử', qty: 10, shipDate: '2026-12-01' }).expect(201)).body;
    const csv = (await api().get('/api/v1/order/sales-orders/export?q=TEST-P54-FIXTURE').set(auth(planner)).expect(200)).text;
    expect(csv.split('\n')[0]).toContain('Chi nhánh FOB');
    expect(csv.split('\n').find((l) => l.includes(so.orderNo))!.split(',')).toContain(a01);
  });

  it('nhà máy SX: chỉ quyền sửa danh mục thì sửa được tên, không thêm, đổi ĐVCS, bật/tắt được (cần quyền sửa phân quyền, review 5.9.13 M2)', async () => {
    const f = (await api().post('/api/v1/admin/catalogs/factories').set(auth(admin)).send({ code: 'TEST-P54-S', name: 'Nhà máy phạm vi thử', branchCode: 'A01' }).expect(201)).body;
    const matrix = (await api().get('/api/v1/admin/permissions').set(auth(admin)).expect(200)).body;
    const permissions = matrix.modules.flatMap((m: any) => m.resources).flatMap((r: any) => r.permissions) as { id: number; code: string }[];
    const permId = (code: string) => permissions.find((p) => p.code === code)!.id;
    const leader = await leaderWith('test.p54f', (orgId) => [{ dimension: 'FACTORY', mode: 'LIST', orgUnitId: orgId('A01') }]);
    try {
      const allow = (code: string) =>
        api().post(`/api/v1/admin/users/${leader.id}/overrides`).set(auth(admin)).send({ permissionId: permId(code), effect: 'ALLOW', reason: 'Thử phạm vi nhà máy (test)' }).expect(200);
      const put = (body: object) => api().put(`/api/v1/admin/catalogs/factories/${f.id}`).set(auth(leader.token)).send(body);
      await allow('admin.catalog:view');
      await allow('admin.catalog:create');
      await allow('admin.catalog:update');
      await put({ name: 'Nhà máy phạm vi thử 2' }).expect(200);
      // Gửi lại đúng ĐVCS đang có: không đổi gì nên không cần quyền sửa phân quyền
      await put({ branchCode: 'A01' }).expect(200);
      for (const body of [{ branchCode: 'A02' }, { isActive: false }]) {
        const e = (await put(body).expect(403)).body.error;
        expect(e.code).toBe('SELF_ELEVATION_FORBIDDEN');
        expect(e.message).toContain('Thiếu quyền: admin.permission:update');
      }
      await api().post('/api/v1/admin/catalogs/factories').set(auth(leader.token)).send({ code: 'TEST-P54-S2', name: 'x', branchCode: 'A01' }).expect(403);
      const row = await core.selectFrom('SysProductionFactory').select(['Name', 'BranchCode', 'IsActive']).where('Id', '=', f.id).executeTakeFirstOrThrow();
      expect(row).toEqual({ Name: 'Nhà máy phạm vi thử 2', BranchCode: 'A01', IsActive: true });
      await allow('admin.permission:view');
      await allow('admin.permission:update');
      await put({ branchCode: 'A02' }).expect(200);
    } finally {
      await leader.done();
    }
  });

  it('tên nhà máy mới trong OSM tự vào danh mục Nhà máy SX: so trùng không phân biệt hoa thường, bỏ tên quá dài, không bật lại mục đã ngừng (quyết định 6.2)', async () => {
    const catalogs = app.get(CatalogService);
    const spy = jest.spyOn(app.get(SyncService), 'osmFactoryLists');
    const codes = () => core.selectFrom('SysProductionFactory').select(['Code', 'Name', 'BranchCode', 'IsActive', 'Description']).where('Code', 'like', 'TEST-OSM%').orderBy('Code').execute();
    try {
      // Chưa đồng bộ OSM: không làm gì
      spy.mockResolvedValueOnce(null);
      expect(await catalogs.importOsmFactories()).toEqual({ added: [] });
      // Tên dài quá 100 ký tự (mã nhà máy) không thêm
      spy.mockResolvedValueOnce([' TEST-OSM-A , test-osm-a', 'TEST-OSM-B,TEST-OSM  C', `TEST-OSM-${'X'.repeat(100)}`]);
      expect((await catalogs.importOsmFactories()).added).toEqual(['TEST-OSM-A', 'TEST-OSM-B', 'TEST-OSM C']);
      expect(await codes()).toEqual([
        { Code: 'TEST-OSM C', Name: 'TEST-OSM C', BranchCode: null, IsActive: true, Description: 'Thêm tự động theo OSM' },
        { Code: 'TEST-OSM-A', Name: 'TEST-OSM-A', BranchCode: null, IsActive: true, Description: 'Thêm tự động theo OSM' },
        { Code: 'TEST-OSM-B', Name: 'TEST-OSM-B', BranchCode: null, IsActive: true, Description: 'Thêm tự động theo OSM' },
      ]);
      const audit = (await api().get('/api/v1/admin/audit?entityType=SysProductionFactory&pageSize=5').set(auth(admin)).expect(200)).body.items;
      expect(audit.some((a: any) => a.actionCode === 'FACTORY_IMPORT')).toBe(true);
      // Quản trị ngừng một mục; OSM vẫn có tên đó (khác hoa thường): không thêm trùng, không bật lại
      await core.updateTable('SysProductionFactory').set({ IsActive: false }).where('Code', '=', 'TEST-OSM-A').execute();
      spy.mockResolvedValueOnce(['test-osm-a,TEST-OSM-B']);
      expect(await catalogs.importOsmFactories()).toEqual({ added: [] });
      expect((await codes()).find((c) => c.Code === 'TEST-OSM-A')?.IsActive).toBe(false);
    } finally {
      spy.mockRestore();
      await core.deleteFrom('SysProductionFactory').where('Code', 'like', 'TEST-OSM%').execute();
    }
  });
});
