import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { env } from '../src/config/env';
import { AppException } from '../src/common/app.exception';
import { BaseRepository } from '../src/platform/data/base.repository';
import { ResourceRegistry } from '../src/platform/data/resource-registry';
import { ORDER_DB } from '../src/modules/order/order.db';
import type { OrderDb } from '../src/modules/order/order.types';
import { PermissionService } from '../src/platform/permission/permission.service';

// Kịch bản 1-4, 7, 8, 10, 11, 14-17 trong docs/thiet-ke/seed-demo.md mục 7 (5, 6, 9, 12, 13, 18 nằm ở auth.spec.ts).
// Từ Phase 5.3 chạy trên module Đơn hàng (thay PO demo). Từ Phase 5.9 (ADR 0013) Thông tin đơn hàng dùng chung toàn công ty:
// lọc theo đơn vị cơ sở (ĐVCS) kiểm trên Kế hoạch xuất hàng; đơn hàng kiểm việc không lọc và đóng dấu ĐVCS khi tạo.
describe('Phase 3: lọc BranchCode, quản trị phân quyền (cần MES_Core + MES_Order đã migrate + seed)', () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());
  const PASSWORD = env.demoPassword;
  const TEST_USER = 'test.planner';
  const TEST_PASSWORD = 'Test@2026x';

  async function tokenFor(username: string, branchCode: string, password = PASSWORD) {
    const l = await api().post('/api/v1/auth/login').send({ username, password });
    const s = await api()
      .post('/api/v1/auth/select-branch')
      .set('Authorization', `Bearer ${l.body.preAuthToken}`)
      .send({ branchCode });
    return s.body.accessToken as string;
  }
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  let admin: string;
  let planner: string; // kehoach.a ở A01
  let roles: { id: number; code: string }[];
  let branches: { id: number; code: string; name: string }[];

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    admin = await tokenFor('admin', 'A01');
    planner = await tokenFor('kehoach.a', 'A01');
    roles = (await api().get('/api/v1/admin/roles').set(auth(admin))).body;
    branches = (await api().get('/api/v1/admin/branches').set(auth(admin))).body;
  });

  afterAll(async () => {
    await app.close();
  });

  const ORDERS = '/api/v1/order/sales-orders';
  const PLANS = '/api/v1/order/shipment-plans';
  const listPo = (t: string, qs = 'pageSize=200') => api().get(`${ORDERS}?${qs}`).set(auth(t));
  const listPlans = (t: string, qs = 'pageSize=200') => api().get(`${PLANS}?${qs}`).set(auth(t));
  const newOrder = (style: string, extra: Record<string, unknown> = {}) => ({ customerName: 'Khách thử', styleCode: style, productName: 'Áo thử', qty: 10, shipDate: '2026-12-01', ...extra });
  const roleId = (code: string) => roles.find((r) => r.code === code)!.id;

  describe('Lọc theo đơn vị cơ sở', () => {
    it('1. kehoach.a ở A01 chỉ thấy kế hoạch xuất hàng của A01', async () => {
      const r = await listPlans(planner).expect(200);
      expect(r.body.total).toBeGreaterThan(0);
      expect(r.body.items.every((i: any) => i.branchCode === 'A01')).toBe(true);
    });

    it('2. gọi theo Id của kế hoạch ĐVCS khác => 404', async () => {
      const a02 = await tokenFor('admin', 'A02');
      const other = (await listPlans(a02)).body.items[0];
      expect(other.branchCode).toBe('A02');
      const r = await api().get(`${PLANS}/${other.id}`).set(auth(planner)).expect(404);
      expect(r.body.error.code).toBe('NOT_FOUND');
      // sửa/xóa dòng ĐVCS khác cũng như không tồn tại
      await api().put(`${PLANS}/${other.id}`).set(auth(planner)).send({ poBuyDate: 'X' }).expect(404);
      await api().delete(`${PLANS}/${other.id}`).set(auth(planner)).expect(404);
      // và dòng đó vẫn còn nguyên
      await api().get(`${PLANS}/${other.id}`).set(auth(a02)).expect(200);
    });

    it('3. branchCode do client gửi (query, body) bị bỏ qua', async () => {
      const r = await listPlans(planner, 'pageSize=100&branchCode=A02').expect(200);
      expect(r.body.items.every((i: any) => i.branchCode === 'A01')).toBe(true);
      const c = await api()
        .post(ORDERS)
        .set(auth(planner))
        .send(newOrder('T-3', { branchCode: 'A02' }))
        .expect(201);
      expect(c.body.branchCode).toBe('A01');
      await api().delete(`${ORDERS}/${c.body.id}`).set(auth(planner)).expect(204);
    });

    it('4. đơn hàng dùng chung (ADR 0013): tạo mới mang ĐVCS của phiên làm Chi nhánh FOB, ĐVCS khác cũng thấy', async () => {
      const c = await api()
        .post(ORDERS)
        .set(auth(planner))
        .send(newOrder('T-4', { qty: 25 }))
        .expect(201);
      expect(c.body.branchCode).toBe('A01');
      expect(c.body.orderNo).toMatch(/^DH-A01-\d{6}$/);
      try {
        const a02 = await tokenFor('admin', 'A02');
        expect((await listPo(a02, `pageSize=100&q=${c.body.orderNo}`)).body.items).toHaveLength(1);
        const a01 = await tokenFor('admin', 'A01');
        expect((await listPo(a01, 'pageSize=1')).body.total).toBe((await listPo(a02, 'pageSize=1')).body.total);
        await api().put(`${ORDERS}/${c.body.id}`).set(auth(planner)).send({ qty: 30, statusCode: 'PLANNING' }).expect(200);
      } finally {
        await api().delete(`${ORDERS}/${c.body.id}`).set(auth(planner)).expect(204);
      }
    });

    it('dữ liệu sai bị từ chối 422 (qty âm, ngày sai)', async () => {
      await api().post(ORDERS).set(auth(planner)).send(newOrder('X', { qty: -1 })).expect(422);
      await api().post(ORDERS).set(auth(planner)).send(newOrder('X', { shipDate: 'khong-phai-ngay' })).expect(422);
    });

    it('mã hàng nhận chữ tiếng Việt, dấu cách như dữ liệu BRAVO; xuống dòng, ký tự ẩn, quá 120 ký tự => 422', async () => {
      for (const bad of ['ÁO\nSƠ MI', 'ÁO‮SƠ MI', 'A'.repeat(121)]) {
        await api().post(ORDERS).set(auth(planner)).send(newOrder(bad)).expect(422);
      }
      const c = await api().post(ORDERS).set(auth(planner)).send(newOrder('  Áo sơ mi (test) 2/3 ')).expect(201);
      try {
        // Lưu chữ hoa, bỏ khoảng trắng đầu cuối như mã hàng nhập tay trước đây
        expect(c.body.styleCode).toBe('ÁO SƠ MI (TEST) 2/3');
      } finally {
        await api().delete(`${ORDERS}/${c.body.id}`).set(auth(planner)).expect(204);
      }
    });
  });

  describe('Đơn vị tổng hợp A00', () => {
    it('7. giamdoc ở A00 thấy kế hoạch của mọi ĐVCS', async () => {
      const director = await tokenFor('giamdoc', 'A00');
      const all = (await listPlans(director)).body;
      const totals: number[] = [];
      for (const b of branches.filter((x) => !x.code.startsWith('A00'))) {
        const t = await tokenFor('admin', b.code);
        if (t) totals.push((await listPlans(t)).body.total);
      }
      expect(all.total).toBe(totals.reduce((a, b) => a + b, 0));
      // Đếm theo nhà máy, không theo trang đầu: thứ tự trang phụ thuộc dữ liệu đang có (seed hay BRAVO)
      expect(totals.filter((n) => n > 0).length).toBeGreaterThan(1);
    });

    it('8. ghi ở A00 => 403 AGGREGATE_READ_ONLY (người có quyền ghi)', async () => {
      // Tài khoản tạm có vai trò Kế hoạch và được chọn A00 + A01
      const created = await api()
        .post('/api/v1/admin/users')
        .set(auth(admin))
        .send({ username: TEST_USER, fullName: 'Kế hoạch (test)', initialPassword: TEST_PASSWORD });
      let id = created.body.id as number;
      if (created.status === 409) {
        id = (await api().get(`/api/v1/admin/users?q=${TEST_USER}`).set(auth(admin))).body.items[0].id;
        await api().post(`/api/v1/admin/users/${id}/reset-password`).set(auth(admin)).send({ newPassword: TEST_PASSWORD }).expect(200);
        await api().put(`/api/v1/admin/users/${id}`).set(auth(admin)).send({ isActive: true, unlock: true }).expect(200);
      }
      await api().put(`/api/v1/admin/users/${id}/roles`).set(auth(admin)).send({ roleIds: [roleId('PLANNER')] }).expect(200);
      await api()
        .put(`/api/v1/admin/users/${id}/branches`)
        .set(auth(admin))
        .send({ branchIds: branches.filter((b) => ['A00', 'A01'].includes(b.code)).map((b) => b.id) })
        .expect(200);

      const t = await tokenFor(TEST_USER, 'A00', TEST_PASSWORD);
      expect((await listPo(t)).status).toBe(200);
      const body = newOrder('T-8');
      const calls = [
        () => api().post(ORDERS).set(auth(t)).send(body),
        () => api().put(`${ORDERS}/1`).set(auth(t)).send({ qty: 2 }),
        () => api().delete(`${ORDERS}/1`).set(auth(t)),
      ];
      for (const call of calls) {
        const r = await call().expect(403);
        expect(r.body.error.code).toBe('AGGREGATE_READ_ONLY');
      }

      await api().put(`/api/v1/admin/users/${id}`).set(auth(admin)).send({ isActive: false }).expect(200);
      // tài khoản bị vô hiệu thì token cũ cũng hết tác dụng
      await listPo(t).expect(401);
    });
  });

  describe('Quyền theo vai trò', () => {
    it('10. truongchuyen.a: Báo cáo chỉ còn Sản lượng theo giờ, không có Quản trị', async () => {
      const t = await tokenFor('truongchuyen.a', 'A01');
      const menu = (await api().get('/api/v1/me/menu').set(auth(t)).expect(200)).body as any[];
      const report = menu.find((g) => g.code === 'menu.report');
      expect(report.children.map((c: any) => c.code)).toEqual(['menu.report.hourly']);
      expect(menu.find((g) => g.code === 'menu.admin')).toBeUndefined();
    });

    it('11. truongchuyen.a sửa PO (tỷ lệ cắt) => 403', async () => {
      const t = await tokenFor('truongchuyen.a', 'A01');
      const row = (await api().get('/api/v1/order/cut-ratio/pos?pageSize=1').set(auth(t)).expect(200)).body.items[0];
      const r = await api().put(`/api/v1/order/cut-ratio/pos/${row.id}/color-sizes`).set(auth(t)).send({ lines: [] }).expect(403);
      expect(r.body.error.code).toBe('PERMISSION_DENIED');
      // không có quyền xem Thông tin đơn hàng thì cũng không đọc được
      await listPo(t).expect(403);
    });

    it('người không có quyền quản trị không gọi được API admin', async () => {
      await api().get('/api/v1/admin/users').set(auth(planner)).expect(403);
      await api().get('/api/v1/admin/audit').set(auth(planner)).expect(403);
    });
  });

  describe('Quản trị phân quyền (có hiệu lực ngay, có audit)', () => {
    it('14 + 17. bỏ order.po:view của PLANNER => kehoach.a mất menu và API ngay lần kế tiếp; có audit', async () => {
      const plannerRole = roleId('PLANNER');
      const matrix = (await api().get('/api/v1/admin/permissions').set(auth(admin)).expect(200)).body;
      const po = matrix.modules.flatMap((m: any) => m.resources).find((r: any) => r.code === 'order.po');
      const viewId = po.permissions.find((p: any) => p.action === 'view').id;
      const current: number[] = (await api().get(`/api/v1/admin/roles/${plannerRole}/permissions`).set(auth(admin))).body.permissionIds;
      expect(current).toContain(viewId);

      try {
        const without = current.filter((id) => id !== viewId);
        const put = await api().put(`/api/v1/admin/roles/${plannerRole}/permissions`).set(auth(admin)).send({ permissionIds: without }).expect(200);
        expect(put.body).toEqual({ added: 0, removed: 1 });

        const r = await api().get('/api/v1/order/cut-ratio/pos').set(auth(planner)).expect(403);
        expect(r.body.error.code).toBe('PERMISSION_DENIED');
        const menu = (await api().get('/api/v1/me/menu').set(auth(planner)).expect(200)).body as any[];
        const order = menu.find((g) => g.code === 'menu.order');
        expect(order.children.find((c: any) => c.code === 'menu.order.po')).toBeUndefined();
        // header phiên bản đã đổi để frontend tải lại menu
        const me = await api().get('/api/v1/me/permissions').set(auth(planner));
        expect(me.body.permissions).not.toContain('order.po:view');
      } finally {
        await api().put(`/api/v1/admin/roles/${plannerRole}/permissions`).set(auth(admin)).send({ permissionIds: current }).expect(200);
      }
      await api().get('/api/v1/order/cut-ratio/pos').set(auth(planner)).expect(200);

      const audit = (await api().get('/api/v1/admin/audit?entityType=SysRole&pageSize=5').set(auth(admin)).expect(200)).body;
      expect(audit.items.some((a: any) => a.actionCode === 'ROLE_PERMISSIONS')).toBe(true);
      const logins = (await api().get('/api/v1/admin/audit?q=LOGIN&pageSize=5').set(auth(admin)).expect(200)).body;
      expect(logins.total).toBeGreaterThan(0);
    });

    it('15. admin không tự sửa quyền/vai trò của chính mình => SELF_ELEVATION_FORBIDDEN', async () => {
      const r = await api().put(`/api/v1/admin/roles/${roleId('ADMIN')}/permissions`).set(auth(admin)).send({ permissionIds: [] }).expect(403);
      expect(r.body.error.code).toBe('SELF_ELEVATION_FORBIDDEN');

      const me = (await api().get('/api/v1/me').set(auth(admin))).body;
      const r2 = await api().put(`/api/v1/admin/users/${me.user.id}/roles`).set(auth(admin)).send({ roleIds: [] }).expect(403);
      expect(r2.body.error.code).toBe('SELF_ELEVATION_FORBIDDEN');
      const r3 = await api().put(`/api/v1/admin/users/${me.user.id}`).set(auth(admin)).send({ isActive: false }).expect(403);
      expect(r3.body.error.code).toBe('SELF_ELEVATION_FORBIDDEN');
    });

    it('16. đổi tên ĐVCS không có trong BRAVO được (ĐVCS theo BRAVO thì 409), đổi mã bị từ chối CODE_IMMUTABLE', async () => {
      const a03 = (await api().get('/api/v1/admin/branches').set(auth(admin))).body.find((b: any) => b.code === 'A03');
      const newName = 'Nhà máy Ba (thử)';
      if (a03.inBravo) {
        const r = await api().put(`/api/v1/admin/branches/${a03.id}`).set(auth(admin)).send({ name: newName }).expect(409);
        expect(r.body.error.message).toContain('BRAVO');
        expect((await api().put(`/api/v1/admin/branches/${a03.id}`).set(auth(admin)).send({ code: 'A09' }).expect(422)).body.error.code).toBe('CODE_IMMUTABLE');
        return;
      }
      try {
        await api().put(`/api/v1/admin/branches/${a03.id}`).set(auth(admin)).send({ name: newName }).expect(200);
        const list = (await api().get('/api/v1/admin/branches').set(auth(admin))).body as any[];
        expect(list.find((b) => b.code === 'A03').name).toBe(newName);
        const mine = (await api().get('/api/v1/me/branches').set(auth(admin))).body as any[];
        expect(mine.find((b) => b.code === 'A03').name).toBe(newName);

        const r = await api().put(`/api/v1/admin/branches/${a03.id}`).set(auth(admin)).send({ code: 'A09' }).expect(422);
        expect(r.body.error.code).toBe('CODE_IMMUTABLE');
      } finally {
        await api().put(`/api/v1/admin/branches/${a03.id}`).set(auth(admin)).send({ name: a03.name }).expect(200);
      }
    });

    it('không tạo được ĐVCS A00 hoặc vô hiệu hóa đơn vị tổng hợp', async () => {
      await api().post('/api/v1/admin/branches').set(auth(admin)).send({ code: 'A00', name: 'Giả' }).expect(409);
      const a00 = branches.find((b) => b.code === 'A00')!;
      await api().put(`/api/v1/admin/branches/${a00.id}`).set(auth(admin)).send({ isActive: false }).expect(409);
    });

    it('vai trò hệ thống không xóa được', async () => {
      await api().delete(`/api/v1/admin/roles/${roleId('QC')}`).set(auth(admin)).expect(409);
    });
  });

  describe('Resource Registry', () => {
    const scopeFor = async (branchCode = 'A01') => {
      const access = await app.get(PermissionService).getAccess(1, { code: branchCode, isAggregate: false });
      return { userId: 1, branchCode, isAggregate: false, access };
    };

    it('tài nguyên khai báo bảng nguồn khác thì repository từ chối', async () => {
      class Rogue extends BaseRepository<any> {
        protected readonly table = 'SalesOrderPo';
        protected readonly resource = 'order.allocation'; // bảng nguồn khai báo là SalesOrder
      }
      const repo = new Rogue(app.get<OrderDb>(ORDER_DB), app.get(ResourceRegistry));
      const scope = await scopeFor();
      await expect(repo.list(scope, { page: 1, pageSize: 10 })).rejects.toBeInstanceOf(AppException);
      await expect(repo.getById(scope, 1)).rejects.toMatchObject({ code: 'RESOURCE_NOT_REGISTERED' });
    });

    it('tài nguyên không tồn tại cũng bị từ chối', async () => {
      class Ghost extends BaseRepository<any> {
        protected readonly table = 'SalesOrder';
        protected readonly resource = 'khong.ton.tai';
      }
      const repo = new Ghost(app.get<OrderDb>(ORDER_DB), app.get(ResourceRegistry));
      await expect(repo.getById(await scopeFor(), 1)).rejects.toMatchObject({ code: 'RESOURCE_NOT_REGISTERED' });
    });
  });
});
