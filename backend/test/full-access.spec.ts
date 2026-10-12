import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { env } from '../src/config/env';

// Vai trò Toàn quyền (ADR 0014) gán cho tài khoản admin mẫu: ghi được nghiệp vụ, thấy cột giá; luật chung vẫn giữ (A00 chỉ đọc,
// không tự đổi quyền của mình); người chỉ giữ ADMIN gán, gỡ được vai trò này (trần quyền quản trị, ADR 0004).
// Cần MES_Core, MES_Order đã migrate, seed.
describe('Vai trò Toàn quyền (ADR 0014)', () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  // Mật khẩu tài khoản thử sinh mỗi lần chạy: test dừng giữa chừng thì tài khoản còn lại không ai biết mật khẩu
  const TEST_PASSWORD = `Fa@${randomBytes(12).toString('base64url')}9`;
  const STYLE = 'TEST-FULL-ACCESS';

  async function tokenFor(username: string, branchCode: string, password = env.demoPassword) {
    const l = await api().post('/api/v1/auth/login').send({ username, password });
    const s = await api().post('/api/v1/auth/select-branch').set('Authorization', `Bearer ${l.body.preAuthToken}`).send({ branchCode });
    if (!s.body.accessToken) throw new Error(`Không chọn được ${branchCode} cho ${username}: ${JSON.stringify(s.body)}`);
    return s.body.accessToken as string;
  }

  let admin: string;
  let roles: { id: number; code: string }[];
  let branches: { id: number; code: string }[];
  const roleId = (code: string) => roles.find((r) => r.code === code)!.id;
  const created: number[] = [];

  /** Tài khoản thử với các vai trò cho trước ở A01 (tạo hoặc bật lại); dọn ở afterAll */
  async function tempUser(username: string, roleCodes: string[]) {
    const res = await api().post('/api/v1/admin/users').set(auth(admin)).send({ username, fullName: `${username} (test)`, initialPassword: TEST_PASSWORD });
    const id = res.status === 201 ? (res.body.id as number) : (await api().get(`/api/v1/admin/users?q=${username}`).set(auth(admin))).body.items.find((u: any) => u.username === username).id;
    if (res.status !== 201) {
      await api().post(`/api/v1/admin/users/${id}/reset-password`).set(auth(admin)).send({ newPassword: TEST_PASSWORD }).expect(200);
      await api().put(`/api/v1/admin/users/${id}`).set(auth(admin)).send({ isActive: true, unlock: true }).expect(200);
    }
    created.push(id);
    await api().put(`/api/v1/admin/users/${id}/roles`).set(auth(admin)).send({ roleIds: roleCodes.map(roleId) }).expect(200);
    await api().put(`/api/v1/admin/users/${id}/branches`).set(auth(admin)).send({ branchIds: branches.filter((b) => b.code === 'A01').map((b) => b.id) }).expect(200);
    return id;
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    admin = await tokenFor('admin', 'A01');
    roles = (await api().get('/api/v1/admin/roles').set(auth(admin)).expect(200)).body;
    branches = (await api().get('/api/v1/admin/branches').set(auth(admin)).expect(200)).body;
  });

  afterAll(async () => {
    for (const id of created) {
      await api().put(`/api/v1/admin/users/${id}/roles`).set(auth(admin)).send({ roleIds: [] }).expect(200);
      await api().put(`/api/v1/admin/users/${id}`).set(auth(admin)).send({ isActive: false }).expect(200);
    }
    await app.close();
  });

  it('admin ghi được nghiệp vụ ở ĐVCS cụ thể, thấy cột giá; ở A00 vẫn chỉ đọc', async () => {
    const body = { customerName: 'KHÁCH TEST TOÀN QUYỀN', styleCode: STYLE, productName: 'Áo thử', qty: 10, shipDate: '2027-01-15', unitPrice: 5 };
    const so = (await api().post('/api/v1/order/sales-orders').set(auth(admin)).send(body).expect(201)).body;
    try {
      expect(so).toMatchObject({ branchCode: 'A01', unitPrice: 5 });
      const a00 = await tokenFor('admin', 'A00');
      expect((await api().post('/api/v1/order/sales-orders').set(auth(a00)).send(body).expect(403)).body.error.code).toBe('AGGREGATE_READ_ONLY');
      expect((await api().put(`/api/v1/order/sales-orders/${so.id}`).set(auth(a00)).send({ qty: 11 }).expect(403)).body.error.code).toBe('AGGREGATE_READ_ONLY');
    } finally {
      await api().delete(`/api/v1/order/sales-orders/${so.id}`).set(auth(admin)).expect(204);
    }
  });

  it('admin không tự sửa quyền, chính sách cột của vai trò Toàn quyền mình đang giữ', async () => {
    const full = roleId('FULL_ACCESS');
    // Gửi đúng tập quyền, mức cột đang có (không đổi gì): chốt chặn hỏng thì dữ liệu test cũng không bị xóa
    const current = (await api().get(`/api/v1/admin/roles/${full}/permissions`).set(auth(admin)).expect(200)).body.permissionIds;
    expect((await api().put(`/api/v1/admin/roles/${full}/permissions`).set(auth(admin)).send({ permissionIds: current }).expect(403)).body.error.code).toBe('SELF_ELEVATION_FORBIDDEN');
    const matrix = (await api().get('/api/v1/admin/permissions').set(auth(admin)).expect(200)).body;
    const resource = matrix.modules.flatMap((m: any) => m.resources).find((r: any) => r.code === 'order.allocation');
    const r = await api().put(`/api/v1/admin/roles/${full}/field-policies`).set(auth(admin)).send({ resourceId: resource.id, policies: [{ fieldCode: 'unitPrice', accessLevel: 'EDITABLE' }] });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('SELF_ELEVATION_FORBIDDEN');
  });

  it('người chỉ giữ ADMIN gán, gỡ được Toàn quyền cho người khác (quyền quản trị của Toàn quyền không vượt ADMIN)', async () => {
    await tempUser('test.full.admin', ['ADMIN']);
    const target = await tempUser('test.full.target', ['PLANNER']);
    const t = await tokenFor('test.full.admin', 'A01', TEST_PASSWORD);
    await api().put(`/api/v1/admin/users/${target}/roles`).set(auth(t)).send({ roleIds: [roleId('PLANNER'), roleId('FULL_ACCESS')] }).expect(200);
    const after = (await api().get(`/api/v1/admin/users?q=test.full.target`).set(auth(t))).body.items.find((u: any) => u.username === 'test.full.target');
    expect(after.roleIds).toContain(roleId('FULL_ACCESS'));
    await api().put(`/api/v1/admin/users/${target}/roles`).set(auth(t)).send({ roleIds: [roleId('PLANNER')] }).expect(200);
  });
});
