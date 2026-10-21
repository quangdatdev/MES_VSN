import 'reflect-metadata';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { env } from '../src/config/env';
import { CORE_DB, type CoreDb } from '../src/platform/database/database.module';
import { RequirePermission } from '../src/platform/auth/decorators';

// Controller chỉ dùng trong test để chứng minh "deny by default".
@Controller('t')
class TestController {
  @Get('undeclared')
  undeclared() {
    return { ok: true };
  }

  @RequirePermission('admin.user:view')
  @Get('admin-only')
  adminOnly() {
    return { ok: true };
  }
}

describe('Xác thực, chọn nhà máy, phân quyền (cần MES_Core đã migrate + seed)', () => {
  let app: INestApplication;
  let db: CoreDb;
  const api = () => request(app.getHttpServer());
  const PASSWORD = env.demoPassword;

  function login(username: string, password = PASSWORD) {
    return api().post('/api/v1/auth/login').send({ username, password });
  }

  async function accessFor(username: string, branchCode: string) {
    const l = await login(username);
    const s = await api()
      .post('/api/v1/auth/select-branch')
      .set('Authorization', `Bearer ${l.body.preAuthToken}`)
      .send({ branchCode });
    return { l, s, token: s.body.accessToken as string };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule], controllers: [TestController] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(CORE_DB);
  });

  afterAll(async () => {
    await app.close();
  });

  it('health là public', async () => {
    await api().get('/api/v1/health').expect(200);
  });

  it('không token => 401 UNAUTHENTICATED', async () => {
    const r = await api().get('/api/v1/me').expect(401);
    expect(r.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('sai mật khẩu => 401 INVALID_CREDENTIALS', async () => {
    const r = await login('kehoach.a', 'sai-mat-khau').expect(401);
    expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('thiếu dữ liệu => 422 VALIDATION_FAILED', async () => {
    const r = await api().post('/api/v1/auth/login').send({}).expect(422);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('body JSON vượt 512 KB => 413 PAYLOAD_TOO_LARGE theo khuôn lỗi chung, không phải 500', async () => {
    const r = await api()
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ username: 'kehoach.a', password: 'x'.repeat(600 * 1024) }))
      .expect(413);
    expect(r.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(r.body.error.message).toMatch(/512 KB/);
    expect(r.body.error.details).toEqual({ limitBytes: 512 * 1024 });
    expect(r.body.traceId).toBeTruthy();
  });

  it('login đúng trả token tạm và danh sách nhà máy được phép', async () => {
    const r = await login('kehoach.a').expect(200);
    expect(r.body.preAuthToken).toBeTruthy();
    expect(r.body.branches.map((b: any) => b.code)).toEqual(['A01']);
  });

  it('token tạm không gọi được API dữ liệu', async () => {
    const l = await login('kehoach.a');
    await api().get('/api/v1/me').set('Authorization', `Bearer ${l.body.preAuthToken}`).expect(401);
  });

  it('chọn nhà máy được phép => access token mang BranchCode', async () => {
    const { s, token } = await accessFor('kehoach.a', 'A01');
    expect(s.status).toBe(200);
    expect(s.body.branch).toEqual({ code: 'A01', name: expect.any(String), isAggregate: false });
    const me = await api().get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.branch.code).toBe('A01');
    expect(me.body.roles.map((r: any) => r.code)).toEqual(['PLANNER']);
    expect(me.headers['x-permission-version']).toBeTruthy();
  });

  it('chọn nhà máy không được phép => 403 BRANCH_NOT_ALLOWED (A02 và cả A00)', async () => {
    for (const code of ['A02', 'A00', 'ZZZ']) {
      const { s } = await accessFor('kehoach.a', code);
      expect(s.status).toBe(403);
      expect(s.body.error.code).toBe('BRANCH_NOT_ALLOWED');
    }
  });

  it('giamdoc chọn được A00 (tổng hợp) và A01, không chọn được A02', async () => {
    const l = await login('giamdoc');
    expect(l.body.branches.map((b: any) => b.code)).toEqual(['A00', 'A01']);
    const a00 = await accessFor('giamdoc', 'A00');
    expect(a00.s.body.branch.isAggregate).toBe(true);
    const a02 = await accessFor('giamdoc', 'A02');
    expect(a02.s.status).toBe(403);
  });

  it('menu lọc theo quyền: Trưởng chuyền chỉ có Sản lượng theo giờ, không có Quản trị', async () => {
    const { token } = await accessFor('truongchuyen.a', 'A01');
    const menu = await api().get('/api/v1/me/menu').set('Authorization', `Bearer ${token}`).expect(200);
    const groups = menu.body.map((g: any) => g.code);
    expect(groups).toEqual(expect.arrayContaining(['menu.order', 'menu.sewing', 'menu.qms']));
    expect(groups).not.toContain('menu.admin');
    // Quản trị nhân sự chỉ cấp cho Quản trị hệ thống và Giám đốc
    expect(groups).not.toContain('menu.hr');
    // Trưởng chuyền chỉ thấy "Sản lượng theo giờ" trong khối Báo cáo, không thấy Doanh thu
    const report = menu.body.find((g: any) => g.code === 'menu.report');
    expect(report.children.map((c: any) => c.code)).toEqual(['menu.report.hourly']);
    const order = menu.body.find((g: any) => g.code === 'menu.order');
    expect(order.children.map((c: any) => c.code)).not.toContain('menu.order.allocation');
  });

  it('admin thấy nhóm Quản trị; Giám đốc thấy Doanh thu', async () => {
    const admin = await accessFor('admin', 'A01');
    const m1 = await api().get('/api/v1/me/menu').set('Authorization', `Bearer ${admin.token}`).expect(200);
    expect(m1.body.map((g: any) => g.code)).toContain('menu.admin');
    const gd = await accessFor('giamdoc', 'A00');
    const m2 = await api().get('/api/v1/me/menu').set('Authorization', `Bearer ${gd.token}`).expect(200);
    const report = m2.body.find((g: any) => g.code === 'menu.report');
    expect(report.children.map((c: any) => c.code)).toContain('menu.report.revenue');
    // Quản trị nhân sự: hai màn, đứng trước Báo cáo quản trị
    for (const m of [m1.body, m2.body]) {
      const codes = m.map((g: any) => g.code);
      expect(m.find((g: any) => g.code === 'menu.hr').children.map((c: any) => c.code)).toEqual(['menu.hr.orgchart', 'menu.hr.employee']);
      expect(codes.indexOf('menu.hr')).toBeLessThan(codes.indexOf('menu.report'));
    }
  });

  it('quyền của Trưởng chuyền đúng ma trận', async () => {
    const { token } = await accessFor('truongchuyen.a', 'A01');
    const r = await api().get('/api/v1/me/permissions').set('Authorization', `Bearer ${token}`).expect(200);
    expect(r.body.permissions).toContain('sewing.output:create');
    expect(r.body.permissions).toContain('order.po:view');
    expect(r.body.permissions).not.toContain('order.po:update');
    expect(r.body.permissions).not.toContain('report.revenue:view');
  });

  it('deny by default: endpoint không khai báo quyền bị từ chối', async () => {
    const { token } = await accessFor('admin', 'A01');
    const r = await api().get('/api/v1/t/undeclared').set('Authorization', `Bearer ${token}`).expect(403);
    expect(r.body.error.code).toBe('ENDPOINT_NOT_DECLARED');
  });

  it('@RequirePermission: thiếu quyền 403, đủ quyền 200', async () => {
    const planner = await accessFor('kehoach.a', 'A01');
    const denied = await api().get('/api/v1/t/admin-only').set('Authorization', `Bearer ${planner.token}`).expect(403);
    expect(denied.body.error.code).toBe('PERMISSION_DENIED');
    const admin = await accessFor('admin', 'A01');
    await api().get('/api/v1/t/admin-only').set('Authorization', `Bearer ${admin.token}`).expect(200);
  });

  it('refresh token xoay vòng, logout thu hồi phiên', async () => {
    const agent = request.agent(app.getHttpServer());
    const l = await agent.post('/api/v1/auth/login').send({ username: 'kehoach.a', password: PASSWORD });
    const s = await agent
      .post('/api/v1/auth/select-branch')
      .set('Authorization', `Bearer ${l.body.preAuthToken}`)
      .send({ branchCode: 'A01' })
      .expect(200);
    expect(String(s.headers['set-cookie'])).toContain('HttpOnly');

    const r1 = await agent.post('/api/v1/auth/refresh').expect(200);
    expect(r1.body.branch.code).toBe('A01');

    await agent.post('/api/v1/auth/logout').set('Authorization', `Bearer ${r1.body.accessToken}`).expect(204);
    await agent.post('/api/v1/auth/refresh').expect(401);
  });

  it('đăng nhập sai quá ngưỡng => khóa tạm 423', async () => {
    const name = `test.lock.${Date.now()}`;
    const hash = await argon2.hash('Dung@12345', { type: argon2.argon2id });
    await db.insertInto('SysUser').values({ Username: name, PasswordHash: hash, FullName: 'Test khóa', IsActive: true, FailedLoginCount: 0 } as any).execute();
    try {
      let last: request.Response | undefined;
      for (let i = 0; i < env.loginMaxFailed; i++) last = await login(name, 'sai');
      expect(last!.status).toBe(423);
      expect(last!.body.error.code).toBe('ACCOUNT_LOCKED');
      const afterLock = await login(name, 'Dung@12345');
      expect(afterLock.status).toBe(423);
    } finally {
      await db.deleteFrom('SysUser').where('Username', '=', name).execute();
    }
  });
});
