import 'reflect-metadata';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { env } from '../src/config/env';
import { CORE_DB, type CoreDb } from '../src/platform/database/database.module';
import { Authenticated, RequirePermission } from '../src/platform/auth/decorators';

// Ghép decorator ở class và method: @RequirePermission ở method phải thắng @Authenticated ở class.
@Authenticated()
@Controller('t2')
class MixedController {
  @RequirePermission('admin.user:view')
  @Get('mixed')
  mixed() {
    return { ok: true };
  }
}

// Các lỗi phát hiện khi review code Phase 1–4 (docs/review/phase-1-4.md). Mỗi test chứng minh lỗi đã được sửa.
describe('Review Phase 1–4: phiên đăng nhập, khóa tài khoản, tự nâng quyền (cần MES_Core đã migrate + seed)', () => {
  let app: INestApplication;
  let db: CoreDb;
  const api = () => request(app.getHttpServer());
  const PASSWORD = env.demoPassword;
  const TEST_PASSWORD = 'Review@12345';
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function cleanup() {
    const users = db.selectFrom('SysUser').select('Id').where('Username', 'like', 'rv.%');
    const roles = db.selectFrom('SysRole').select('Id').where('Code', 'like', 'RV[_]%');
    await db.deleteFrom('SysUserSession').where('UserId', 'in', users).execute();
    await db.deleteFrom('SysUserRole').where((eb) => eb.or([eb('UserId', 'in', users), eb('RoleId', 'in', roles)])).execute();
    await db.deleteFrom('SysUserBranch').where('UserId', 'in', users).execute();
    await db.deleteFrom('SysRolePermission').where('RoleId', 'in', roles).execute();
    await db.deleteFrom('SysUser').where('Username', 'like', 'rv.%').execute();
    await db.deleteFrom('SysRole').where('Code', 'like', 'RV[_]%').execute();
  }

  async function createUser(username: string, roleCodes: string[] = [], branchCodes: string[] = ['A01']) {
    const hash = await argon2.hash(TEST_PASSWORD, { type: argon2.argon2id });
    const u = await db
      .insertInto('SysUser')
      .values({ Username: username, PasswordHash: hash, FullName: `Thử ${username}`, IsActive: true, FailedLoginCount: 0 } as any)
      .output('inserted.Id')
      .executeTakeFirstOrThrow();
    for (const code of roleCodes) {
      const r = await db.selectFrom('SysRole').select('Id').where('Code', '=', code).executeTakeFirstOrThrow();
      await db.insertInto('SysUserRole').values({ UserId: u.Id, RoleId: r.Id } as any).execute();
    }
    for (const [i, code] of branchCodes.entries()) {
      const b = await db.selectFrom('SysBranch').select('Id').where('Code', '=', code).executeTakeFirstOrThrow();
      await db.insertInto('SysUserBranch').values({ UserId: u.Id, BranchId: b.Id, IsDefault: i === 0 } as any).execute();
    }
    await bumpVersion();
    return u.Id;
  }

  async function createRole(code: string, permissionCodes: string[]) {
    const r = await db
      .insertInto('SysRole')
      .values({ Code: code, Name: `Thử ${code}`, SortOrder: 999, IsActive: true, IsSystem: false } as any)
      .output('inserted.Id')
      .executeTakeFirstOrThrow();
    for (const p of permissionCodes) {
      const perm = await db.selectFrom('SysPermission').select('Id').where('Code', '=', p).executeTakeFirstOrThrow();
      await db.insertInto('SysRolePermission').values({ RoleId: r.Id, PermissionId: perm.Id } as any).execute();
    }
    await bumpVersion();
    return r.Id;
  }

  // Dữ liệu chuẩn bị ghi thẳng DB: báo cho cache quyền trong tiến trình test biết.
  const bumpVersion = () => db.updateTable('SysPermissionVersion').set((eb) => ({ Version: eb('Version', '+', 1 as any) } as any)).where('Id', '=', 1).execute();

  async function session(username: string, branchCode = 'A01', password = TEST_PASSWORD) {
    const agent = request.agent(app.getHttpServer());
    const l = await agent.post('/api/v1/auth/login').send({ username, password }).expect(200);
    const s = await agent
      .post('/api/v1/auth/select-branch')
      .set('Authorization', `Bearer ${l.body.preAuthToken}`)
      .send({ branchCode })
      .expect(200);
    return { agent, token: s.body.accessToken as string, preAuth: l.body.preAuthToken as string };
  }

  let admin: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule], controllers: [MixedController] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(CORE_DB);
    await cleanup();
    admin = (await session('admin', 'A01', PASSWORD)).token;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  describe('Đăng nhập và phiên', () => {
    it('nhiều lần sai gửi song song vẫn bị đếm đủ và khóa tài khoản', async () => {
      await createUser('rv.lock');
      const results = await Promise.all(
        Array.from({ length: env.loginMaxFailed * 3 }, () => api().post('/api/v1/auth/login').send({ username: 'rv.lock', password: 'sai-mat-khau' })),
      );
      expect(results.some((r) => r.status === 423)).toBe(true);
      // Mật khẩu đúng cũng bị chặn vì tài khoản đã khóa
      const ok = await api().post('/api/v1/auth/login').send({ username: 'rv.lock', password: TEST_PASSWORD });
      expect(ok.status).toBe(423);
      const row = await db.selectFrom('SysUser').select('LockedUntilAt').where('Username', '=', 'rv.lock').executeTakeFirstOrThrow();
      expect(row.LockedUntilAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('đăng xuất không cần access token còn hạn: cookie bị thu hồi, refresh sau đó 401', async () => {
      await createUser('rv.logout', ['PLANNER']);
      const { agent } = await session('rv.logout');
      await agent.post('/api/v1/auth/logout').expect(204); // không gửi Authorization
      await agent.post('/api/v1/auth/refresh').expect(401);
    });

    it('access token hết dùng được ngay khi phiên bị thu hồi (đăng xuất)', async () => {
      await createUser('rv.revoke', ['PLANNER']);
      const { agent, token } = await session('rv.revoke');
      await api().get('/api/v1/me').set(auth(token)).expect(200);
      await agent.post('/api/v1/auth/logout').expect(204);
      const r = await api().get('/api/v1/me').set(auth(token)).expect(401);
      expect(r.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('đặt lại mật khẩu: access token cũ và token tạm cũ không còn dùng được', async () => {
      const id = await createUser('rv.reset', ['PLANNER']);
      const { token } = await session('rv.reset');
      const pre = (await api().post('/api/v1/auth/login').send({ username: 'rv.reset', password: TEST_PASSWORD }).expect(200)).body.preAuthToken;

      await api().post(`/api/v1/admin/users/${id}/reset-password`).set(auth(admin)).send({ newPassword: 'Moi@123456' }).expect(200);

      await api().get('/api/v1/me').set(auth(token)).expect(401);
      await api().post('/api/v1/auth/select-branch').set(auth(pre)).send({ branchCode: 'A01' }).expect(401);
      // Đăng nhập bằng mật khẩu mới thì được
      await session('rv.reset', 'A01', 'Moi@123456');
    });

    it('X-Forwarded-For do client gửi không được tin và không làm hỏng nhật ký đăng nhập', async () => {
      const name = `rv.nouser.${Date.now()}`;
      await api().post('/api/v1/auth/login').set('X-Forwarded-For', 'x'.repeat(60)).send({ username: name, password: 'abc' }).expect(401);
      await api().post('/api/v1/auth/login').set('X-Forwarded-For', '10.9.9.9').send({ username: name, password: 'abc' }).expect(401);
      const rows = await db.selectFrom('SysAuditLog').select('IpAddress').where('Username', '=', name).where('ActionCode', '=', 'LOGIN_FAILED').execute();
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.IpAddress !== '10.9.9.9' && !String(r.IpAddress).includes('xxx'))).toBe(true);
    });

    it('@RequirePermission ở method thắng @Authenticated ở class', async () => {
      const { token } = await session('kehoach.a', 'A01', PASSWORD);
      const r = await api().get('/api/v1/t2/mixed').set(auth(token)).expect(403);
      expect(r.body.error.code).toBe('PERMISSION_DENIED');
      await api().get('/api/v1/t2/mixed').set(auth(admin)).expect(200);
    });
  });

  describe('Quản trị: không tự nâng quyền, không vượt quyền quản trị', () => {
    it('không tự bật lại vai trò mình đang giữ sau khi bị người khác tắt', async () => {
      const roleId = await createRole('RV_EXTRA', ['report.revenue:view']);
      await createUser('rv.admin2', ['ADMIN', 'RV_EXTRA']);
      expect((await api().delete(`/api/v1/admin/roles/${roleId}`).set(auth(admin)).expect(200)).body).toEqual({ removed: true });

      const { token } = await session('rv.admin2');
      const r = await api().put(`/api/v1/admin/roles/${roleId}`).set(auth(token)).send({ isActive: true }).expect(403);
      expect(r.body.error.code).toBe('SELF_ELEVATION_FORBIDDEN');
      // Người không giữ vai trò thì bật lại được
      await api().put(`/api/v1/admin/roles/${roleId}`).set(auth(admin)).send({ isActive: true }).expect(200);
    });

    it('người chỉ có quyền quản lý tài khoản không đặt lại được mật khẩu của admin', async () => {
      await createRole('RV_SUPPORT', ['admin.user:view', 'admin.user:update']);
      await createUser('rv.support', ['RV_SUPPORT']);
      const targetId = await createUser('rv.target');
      const adminId = (await db.selectFrom('SysUser').select('Id').where('Username', '=', 'admin').executeTakeFirstOrThrow()).Id;

      const { token } = await session('rv.support');
      const r = await api().post(`/api/v1/admin/users/${adminId}/reset-password`).set(auth(token)).send({ newPassword: 'Chiem@12345' }).expect(403);
      expect(r.body.error.code).toBe('SELF_ELEVATION_FORBIDDEN');
      await api().put(`/api/v1/admin/users/${adminId}`).set(auth(token)).send({ isActive: false }).expect(403);
      // Tài khoản không có quyền quản trị thì vẫn hỗ trợ được
      await api().post(`/api/v1/admin/users/${targetId}/reset-password`).set(auth(token)).send({ newPassword: 'Moi@123456' }).expect(200);
    });

    it('người có admin.permission:update không gán được vai trò quản trị cao hơn cho tài khoản phụ', async () => {
      await createRole('RV_HR', ['admin.user:view', 'admin.user:create', 'admin.permission:view', 'admin.permission:update']);
      await createUser('rv.hr', ['RV_HR']);
      const helperId = await createUser('rv.helper');
      const adminRole = (await db.selectFrom('SysRole').select('Id').where('Code', '=', 'ADMIN').executeTakeFirstOrThrow()).Id;
      const plannerRole = (await db.selectFrom('SysRole').select('Id').where('Code', '=', 'PLANNER').executeTakeFirstOrThrow()).Id;

      const { token } = await session('rv.hr');
      const r = await api().put(`/api/v1/admin/users/${helperId}/roles`).set(auth(token)).send({ roleIds: [adminRole] }).expect(403);
      expect(r.body.error.code).toBe('SELF_ELEVATION_FORBIDDEN');
      // Vai trò nghiệp vụ thì gán được (đúng việc của người quản lý phân quyền)
      await api().put(`/api/v1/admin/users/${helperId}/roles`).set(auth(token)).send({ roleIds: [plannerRole] }).expect(200);
    });

    it('admin không tự đặt lại mật khẩu của chính mình ở màn quản trị', async () => {
      const me = (await api().get('/api/v1/me').set(auth(admin))).body;
      const r = await api().post(`/api/v1/admin/users/${me.user.id}/reset-password`).set(auth(admin)).send({ newPassword: 'Moi@123456' }).expect(403);
      expect(r.body.error.code).toBe('SELF_ELEVATION_FORBIDDEN');
    });

    it('vô hiệu hóa rồi bật lại tài khoản: dùng lại được ngay, không kẹt cache "đã vô hiệu"', async () => {
      const id = await createUser('rv.toggle', ['PLANNER']);
      const first = await session('rv.toggle');
      await api().put(`/api/v1/admin/users/${id}`).set(auth(admin)).send({ isActive: false }).expect(200);
      await api().get('/api/v1/me').set(auth(first.token)).expect(401);
      await api().put(`/api/v1/admin/users/${id}`).set(auth(admin)).send({ isActive: true }).expect(200);
      const again = await session('rv.toggle');
      await api().get('/api/v1/me').set(auth(again.token)).expect(200);
    });

    it('không tắt được nhà máy mình đang làm việc', async () => {
      const a01 = await db.selectFrom('SysBranch').select('Id').where('Code', '=', 'A01').executeTakeFirstOrThrow();
      await api().put(`/api/v1/admin/branches/${a01.Id}`).set(auth(admin)).send({ isActive: false }).expect(409);
    });

    it('trường bắt buộc gửi null => 422, không phải 500', async () => {
      const id = await createUser('rv.null');
      const r = await api().put(`/api/v1/admin/users/${id}`).set(auth(admin)).send({ fullName: null }).expect(422);
      expect(r.body.error.code).toBe('VALIDATION_FAILED');
    });
  });
});
