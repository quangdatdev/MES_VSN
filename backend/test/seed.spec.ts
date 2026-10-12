import 'reflect-metadata';
import { sql } from 'kysely';
import { runSeed } from '../scripts/seed';
import { env } from '../src/config/env';
import type { CoreDatabase } from '../src/platform/database/core.types';
import { createDb } from '../src/platform/database/db';

// Seed chạy lại (không --sync-matrix) không được cấp lại quyền quản trị đã thu hồi: gán lại vai trò mà không kèm phạm vi là
// nới thành không giới hạn (review 5.4.8 lượt 5 #1). Cần MES_Core đã migrate, seed. Thử trên tài khoản mẫu truongchuyen.a
// (Trưởng chuyền, phạm vi chuyền A01-L03), xong thì trả lại đúng phép gán cũ.
describe('Seed chạy lại', () => {
  const core = createDb<CoreDatabase>(env.db.coreName);
  afterAll(() => core.destroy());

  it('máy demo cài theo migrate rồi seed: admin (migrate tạo khi chỉ có A00) được gán các ĐVCS mẫu seed vừa thêm', async () => {
    const rows = await core
      .selectFrom('SysUserBranch as ub')
      .innerJoin('SysUser as u', 'u.Id', 'ub.UserId')
      .innerJoin('SysBranch as b', 'b.Id', 'ub.BranchId')
      .select('b.Code')
      .where('u.Username', '=', 'admin')
      .execute();
    expect(rows.map((r) => r.Code)).toEqual(expect.arrayContaining(['A00', 'A01', 'A02', 'A03']));
  });

  it('không gán lại vai trò, nhà máy đã thu hồi của tài khoản mẫu', async () => {
    const user = await core.selectFrom('SysUser').select('Id').where('Username', '=', 'truongchuyen.a').executeTakeFirstOrThrow();
    const roles = await core.selectFrom('SysUserRole').selectAll().where('UserId', '=', user.Id).execute();
    const scopes = roles.length ? await core.selectFrom('SysUserRoleScope').selectAll().where('UserRoleId', 'in', roles.map((r) => r.Id)).execute() : [];
    const branches = await core.selectFrom('SysUserBranch').selectAll().where('UserId', '=', user.Id).execute();
    expect(roles.length).toBeGreaterThan(0);
    expect(scopes.length).toBeGreaterThan(0);
    const bumpVersion = () => sql`UPDATE dbo.SysPermissionVersion SET Version = Version + 1 WHERE Id = 1`.execute(core);

    try {
      // Như quản trị gỡ vai trò và nhà máy trên màn Người dùng
      if (scopes.length) await core.deleteFrom('SysUserRoleScope').where('Id', 'in', scopes.map((s) => s.Id)).execute();
      await core.deleteFrom('SysUserRole').where('UserId', '=', user.Id).execute();
      await core.deleteFrom('SysUserBranch').where('UserId', '=', user.Id).execute();
      await bumpVersion();

      // Chỉ MES_Core: không nạp đơn hàng giả vào nhà máy chưa có đơn (DB đã nạp BRAVO)
      await runSeed({ coreOnly: true });

      expect(await core.selectFrom('SysUserRole').select('Id').where('UserId', '=', user.Id).execute()).toHaveLength(0);
      expect(await core.selectFrom('SysUserBranch').select('Id').where('UserId', '=', user.Id).execute()).toHaveLength(0);
    } finally {
      // Trả lại đúng phép gán cũ (Id mới: phạm vi trỏ theo vai trò vừa thêm lại)
      await core.deleteFrom('SysUserRoleScope').where('UserRoleId', 'in', core.selectFrom('SysUserRole').select('Id').where('UserId', '=', user.Id)).execute();
      await core.deleteFrom('SysUserRole').where('UserId', '=', user.Id).execute();
      await core.deleteFrom('SysUserBranch').where('UserId', '=', user.Id).execute();
      for (const r of roles) {
        const added = await core
          .insertInto('SysUserRole')
          .values({ UserId: r.UserId, RoleId: r.RoleId, ValidFromAt: r.ValidFromAt, ValidToAt: r.ValidToAt, CreatedBy: r.CreatedBy })
          .output('inserted.Id')
          .executeTakeFirstOrThrow();
        for (const s of scopes.filter((x) => x.UserRoleId === r.Id)) {
          await core
            .insertInto('SysUserRoleScope')
            .values({ UserRoleId: added.Id, DimensionId: s.DimensionId, ScopeMode: s.ScopeMode, OrgUnitId: s.OrgUnitId, ScopeValue: s.ScopeValue, CreatedBy: s.CreatedBy })
            .execute();
        }
      }
      for (const b of branches) await core.insertInto('SysUserBranch').values({ UserId: b.UserId, BranchId: b.BranchId, IsDefault: b.IsDefault, CreatedBy: b.CreatedBy }).execute();
      await bumpVersion();
    }
  });
});
