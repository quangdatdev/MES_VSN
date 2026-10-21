import 'reflect-metadata';
import { sql, type Kysely, type Transaction } from 'kysely';
import { bootstrapFullAccess, runSeed } from '../scripts/seed';
import { LINE_COUNT, lineCode } from '../scripts/seed-data';
import { env } from '../src/config/env';
import type { CoreDatabase } from '../src/platform/database/core.types';
import { createDb } from '../src/platform/database/db';

// Seed chạy lại (không --sync-matrix) không được cấp lại quyền quản trị đã thu hồi: gán lại vai trò mà không kèm phạm vi là
// nới thành không giới hạn (review 5.4.8 lượt 5 #1). Cần MES_Core đã migrate, seed. Thử trên tài khoản mẫu truongchuyen.a
// (Trưởng chuyền, phạm vi chuyền A01-L03), xong thì trả lại đúng phép gán cũ.
// Mỗi lần runSeed đọc, ghi hàng trăm dòng: database ở máy khác chậm thì quá 30 giây mặc định. Bài quá giờ vẫn chạy tiếp ngầm
// (đặt phạm vi, gỡ vai trò của admin) và làm hỏng bài sau, nên chờ đủ lâu
jest.setTimeout(120_000);

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

  it('database đã seed trước khi có màn mới: seed chạy lại xếp menu đúng thứ tự seed-data (Phân bổ PO ngay sau Thông tin đơn hàng)', async () => {
    // Như máy chủ trước task 5.9.12: Kế hoạch xuất hàng giữ thứ tự cũ (20), màn mới chèn vào cũng nhận 20
    await core.updateTable('SysMenu').set({ SortOrder: 20 }).where('Code', 'in', ['menu.order.shipment', 'menu.order.poallocation']).execute();
    await runSeed({ coreOnly: true });
    const group = await core.selectFrom('SysMenu').select('Id').where('Code', '=', 'menu.order').executeTakeFirstOrThrow();
    const leaves = await core.selectFrom('SysMenu').select('Path').where('ParentId', '=', group.Id).orderBy('SortOrder').orderBy('Id').execute();
    expect(leaves.slice(0, 3).map((m) => m.Path)).toEqual(['/order/info', '/order/po-allocation', '/order/shipment']);
  });

  it('cây tổ chức chỉ còn nút gốc FACTORY của ĐVCS: seed không tạo nút Xưởng, Chuyền (chuyền may là bộ phận ở MES_Hr, phase 5.10)', async () => {
    const oldNodes = async () => Number((await core.selectFrom('SysOrgUnit').select(sql<number>`COUNT(*)`.as('n')).where('OrgType', 'in', ['WORKSHOP', 'LINE']).executeTakeFirstOrThrow()).n);
    // Như database đã cài trước 5.10 mà thiếu một chuyền mẫu: seed cũ tạo lại chuyền mẫu còn thiếu, seed mới thì không. Chuyền mẫu
    // cuối của A03 nằm thẳng dưới nhà máy (không là cha); còn phạm vi trỏ tới thì để nguyên
    const probe = lineCode('A03', LINE_COUNT.A03);
    const node = await core.selectFrom('SysOrgUnit').select('Id').where('Code', '=', probe).where('OrgType', '=', 'LINE').executeTakeFirst();
    const held = node && (await core.selectFrom('SysUserRoleScope').select('Id').where('OrgUnitId', '=', node.Id).executeTakeFirst());
    if (node && !held) await core.deleteFrom('SysOrgUnit').where('Id', '=', node.Id).execute();
    const before = await oldNodes();

    await runSeed({ coreOnly: true });

    expect(await oldNodes()).toBe(before);
    if (!held) expect(await core.selectFrom('SysOrgUnit').select('Id').where('Code', '=', probe).executeTakeFirst()).toBeUndefined();
    // Nút gốc của ĐVCS mẫu còn: phạm vi theo ĐVCS (chiều FACTORY) dùng các nút này
    const factories = await core.selectFrom('SysOrgUnit').select(['Code', 'Path', 'ParentId', 'BranchCode', 'IsActive']).where('OrgType', '=', 'FACTORY').where('Code', 'in', ['A01', 'A02', 'A03']).orderBy('Code').execute();
    expect(factories).toEqual(['A01', 'A02', 'A03'].map((c) => ({ Code: c, Path: `/${c}/`, ParentId: null, BranchCode: c, IsActive: true })));
  });

  describe('vai trò Toàn quyền (quyết định 5.1, 5.2)', () => {
    const roleOf = (code: string) => core.selectFrom('SysRole').select('Id').where('Code', '=', code).executeTakeFirst();
    const permsOf = async (roleId: number) =>
      (
        await core
          .selectFrom('SysRolePermission as rp')
          .innerJoin('SysPermission as p', 'p.Id', 'rp.PermissionId')
          .select('p.Code')
          .where('rp.RoleId', '=', roleId)
          .execute()
      ).map((r) => r.Code);
    const adminHas = async (roleId: number) =>
      !!(await core
        .selectFrom('SysUserRole as ur')
        .innerJoin('SysUser as u', 'u.Id', 'ur.UserId')
        .select('ur.Id')
        .where('u.Username', '=', 'admin')
        .where('ur.RoleId', '=', roleId)
        .executeTakeFirst());

    it('mọi quyền nghiệp vụ, quyền quản trị không vượt ADMIN (người giữ ADMIN gán được), mọi cột nhạy cảm được sửa; admin có vai trò này', async () => {
      const full = (await roleOf('FULL_ACCESS'))!;
      const admin = (await roleOf('ADMIN'))!;
      expect(full).toBeDefined();
      const all = (await core.selectFrom('SysPermission').select('Code').execute()).map((p) => p.Code);
      const fullPerms = new Set(await permsOf(full.Id));
      expect(all.filter((c) => !c.startsWith('admin.') && !fullPerms.has(c))).toEqual([]);
      const adminPerms = new Set(await permsOf(admin.Id));
      expect([...fullPerms].filter((c) => c.startsWith('admin.')).sort()).toEqual([...adminPerms].filter((c) => c.startsWith('admin.')).sort());
      const sensitive = await core.selectFrom('SysResourceField').select(['ResourceId', 'Code']).where('IsSensitive', '=', true).execute();
      const policies = await core.selectFrom('SysFieldPolicy').select(['ResourceId', 'FieldCode', 'AccessLevel']).where('SubjectType', '=', 'ROLE').where('SubjectId', '=', full.Id).execute();
      for (const f of sensitive) expect(policies.find((p) => p.ResourceId === f.ResourceId && p.FieldCode === f.Code)?.AccessLevel).toBe('EDITABLE');
      expect(await adminHas(full.Id)).toBe(true);
    });

    /**
     * Như database trước khi có vai trò Toàn quyền (quyết định 5.2), chạy trong một transaction rồi hủy: dữ liệu thật không đổi.
     * `prep` chỉnh trạng thái trước khi tạo vai trò (trong cùng transaction).
     */
    async function inRolledBack(prep: (trx: Transaction<CoreDatabase>) => Promise<void>, check: (trx: Transaction<CoreDatabase>, r: Awaited<ReturnType<typeof bootstrapFullAccess>>) => Promise<void>) {
      const rollback = new Error('rollback');
      await expect(
        core.transaction().execute(async (trx) => {
          const old = await trx.selectFrom('SysRole').select('Id').where('Code', '=', 'FULL_ACCESS').executeTakeFirst();
          if (old) {
            const assigned = trx.selectFrom('SysUserRole').select('Id').where('RoleId', '=', old.Id);
            await trx.deleteFrom('SysUserRoleScope').where('UserRoleId', 'in', assigned).execute();
            await trx.deleteFrom('SysUserRole').where('RoleId', '=', old.Id).execute();
            await trx.deleteFrom('SysRolePermission').where('RoleId', '=', old.Id).execute();
            await trx.deleteFrom('SysFieldPolicy').where('SubjectType', '=', 'ROLE').where('SubjectId', '=', old.Id).execute();
            await trx.deleteFrom('SysRole').where('Id', '=', old.Id).execute();
          }
          await prep(trx);
          await check(trx, await bootstrapFullAccess(trx, { by: 'test' }));
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    }

    it('máy đã cài: tạo vai trò, quyền, cột, gán admin, nhật ký, tăng phiên bản quyền trong một transaction; vai trò đã có thì không làm gì', async () => {
      const version = async (db: Kysely<CoreDatabase>) => Number((await db.selectFrom('SysPermissionVersion').select('Version').where('Id', '=', 1).executeTakeFirstOrThrow()).Version);
      const before = await version(core);
      await inRolledBack(
        async () => undefined,
        async (trx, r) => {
          expect(r).toMatchObject({ grantedTo: ['admin'], skipped: [] });
          const ur = await trx
            .selectFrom('SysUserRole as ur')
            .innerJoin('SysUser as u', 'u.Id', 'ur.UserId')
            .select('ur.Id')
            .where('u.Username', '=', 'admin')
            .where('ur.RoleId', '=', r!.roleId)
            .executeTakeFirst();
          expect(ur).toBeDefined();
          expect(r!.permissions).toBe((await trx.selectFrom('SysRolePermission').select('Id').where('RoleId', '=', r!.roleId).execute()).length);
          const log = await trx.selectFrom('SysAuditLog').select(['ActionCode', 'NewValue']).where('EntityType', '=', 'SysRole').where('EntityId', '=', String(r!.roleId)).executeTakeFirstOrThrow();
          expect(JSON.parse(log.NewValue!)).toMatchObject({ role: 'FULL_ACCESS', grantedTo: ['admin'] });
          expect(await version(trx)).toBe(before + 1);
          // Đã có vai trò: không tạo, không gán thêm
          expect(await bootstrapFullAccess(trx, { by: 'test' })).toBeNull();
        },
      );
    });

    it('quyền quản trị theo ADMIN đang có trong DB; admin bị hạ quyền (ADMIN có phạm vi) hoặc đang khóa thì không gán', async () => {
      await inRolledBack(
        async (trx) => {
          // Quản trị đã gỡ bớt một quyền của ADMIN: Toàn quyền tạo sau đó cũng không có quyền này
          const admin = await trx.selectFrom('SysRole').select('Id').where('Code', '=', 'ADMIN').executeTakeFirstOrThrow();
          const perm = await trx.selectFrom('SysPermission').select('Id').where('Code', '=', 'admin.sync:update').executeTakeFirstOrThrow();
          await trx.deleteFrom('SysRolePermission').where('RoleId', '=', admin.Id).where('PermissionId', '=', perm.Id).execute();
          // admin chỉ còn giữ ADMIN giới hạn theo một ĐVCS
          const ur = await trx
            .selectFrom('SysUserRole as ur')
            .innerJoin('SysUser as u', 'u.Id', 'ur.UserId')
            .select('ur.Id')
            .where('u.Username', '=', 'admin')
            .where('ur.RoleId', '=', admin.Id)
            .executeTakeFirstOrThrow();
          const dim = await trx.selectFrom('SysScopeDimension').select('Id').where('Code', '=', 'FACTORY').executeTakeFirstOrThrow();
          const unit = await trx.selectFrom('SysOrgUnit').select('Id').where('Code', '=', 'A01').executeTakeFirstOrThrow();
          await trx.insertInto('SysUserRoleScope').values({ UserRoleId: ur.Id, DimensionId: dim.Id, ScopeMode: 'LIST', OrgUnitId: unit.Id } as any).execute();
        },
        async (trx, r) => {
          expect(r!.grantedTo).toEqual([]);
          expect(r!.skipped[0]).toContain('không còn giữ ADMIN không giới hạn');
          const codes = (
            await trx.selectFrom('SysRolePermission as rp').innerJoin('SysPermission as p', 'p.Id', 'rp.PermissionId').select('p.Code').where('rp.RoleId', '=', r!.roleId).execute()
          ).map((p) => p.Code);
          expect(codes).not.toContain('admin.sync:update');
          expect(codes).toContain('admin.permission:update');
          expect(codes).toContain('order.allocation:delete');
        },
      );
      await inRolledBack(
        async (trx) => {
          await trx.updateTable('SysUser').set({ IsActive: false }).where('Username', '=', 'admin').execute();
        },
        async (_trx, r) => {
          expect(r!.grantedTo).toEqual([]);
          expect(r!.skipped[0]).toContain('đã bị vô hiệu hóa');
        },
      );
    });

    it('--sync-matrix gán lại Toàn quyền cho admin (ngoại lệ có chủ đích), trừ khi ADMIN của admin đã bị giới hạn phạm vi', async () => {
      const full = (await roleOf('FULL_ACCESS'))!;
      const adminId = (await core.selectFrom('SysUser').select('Id').where('Username', '=', 'admin').executeTakeFirstOrThrow()).Id;
      const adminRole = (await roleOf('ADMIN'))!;
      const main = await core.selectFrom('SysUserRole').select('Id').where('UserId', '=', adminId).where('RoleId', '=', adminRole.Id).executeTakeFirstOrThrow();
      const bumpVersion = () => sql`UPDATE dbo.SysPermissionVersion SET Version = Version + 1 WHERE Id = 1`.execute(core);
      const removeFull = async () => {
        await core.deleteFrom('SysUserRole').where('UserId', '=', adminId).where('RoleId', '=', full.Id).execute();
        await bumpVersion();
      };
      let scopeId: string | number | null = null;
      try {
        await removeFull();
        await runSeed({ coreOnly: true, syncMatrix: true });
        expect(await adminHas(full.Id)).toBe(true);
        // ADMIN của admin bị giới hạn theo một ĐVCS: không nới thêm bằng Toàn quyền không phạm vi
        const dim = await core.selectFrom('SysScopeDimension').select('Id').where('Code', '=', 'FACTORY').executeTakeFirstOrThrow();
        const unit = await core.selectFrom('SysOrgUnit').select('Id').where('Code', '=', 'A01').executeTakeFirstOrThrow();
        scopeId = (await core.insertInto('SysUserRoleScope').values({ UserRoleId: main.Id, DimensionId: dim.Id, ScopeMode: 'LIST', OrgUnitId: unit.Id } as any).output('inserted.Id').executeTakeFirstOrThrow()).Id;
        await removeFull();
        await runSeed({ coreOnly: true, syncMatrix: true });
        expect(await adminHas(full.Id)).toBe(false);
      } finally {
        if (scopeId !== null) await core.deleteFrom('SysUserRoleScope').where('Id', '=', Number(scopeId)).execute();
        if (!(await adminHas(full.Id))) await core.insertInto('SysUserRole').values({ UserId: adminId, RoleId: full.Id }).execute();
        await bumpVersion();
      }
    });

    it('máy đã cài trước khi có vai trò Toàn quyền: seed chạy lại (như npm run migrate) tạo vai trò ở bước riêng, gán cho admin, ghi nhật ký', async () => {
      const bumpVersion = () => sql`UPDATE dbo.SysPermissionVersion SET Version = Version + 1 WHERE Id = 1`.execute(core);
      try {
        // Xóa trong một transaction: hỏng giữa chừng thì không để lại vai trò mất phép gán, mất quyền
        await core.transaction().execute(async (trx) => {
          const old = await trx.selectFrom('SysRole').select('Id').where('Code', '=', 'FULL_ACCESS').executeTakeFirst();
          if (!old) return;
          const assigned = trx.selectFrom('SysUserRole').select('Id').where('RoleId', '=', old.Id);
          await trx.deleteFrom('SysUserRoleScope').where('UserRoleId', 'in', assigned).execute();
          await trx.deleteFrom('SysUserRole').where('RoleId', '=', old.Id).execute();
          await trx.deleteFrom('SysRolePermission').where('RoleId', '=', old.Id).execute();
          await trx.deleteFrom('SysFieldPolicy').where('SubjectType', '=', 'ROLE').where('SubjectId', '=', old.Id).execute();
          await trx.deleteFrom('SysRole').where('Id', '=', old.Id).execute();
        });
        await bumpVersion();
        await runSeed({ coreOnly: true, sampleData: false, by: 'test' });
        const full = await roleOf('FULL_ACCESS');
        expect(full).toBeDefined();
        expect(await adminHas(full!.Id)).toBe(true);
        const log = await core.selectFrom('SysAuditLog').select(['ActionCode', 'NewValue']).where('EntityType', '=', 'SysRole').where('EntityId', '=', String(full!.Id)).executeTakeFirst();
        expect(log?.ActionCode).toBe('SEED');
        const logged = JSON.parse(log!.NewValue!);
        expect(logged).toMatchObject({ role: 'FULL_ACCESS', grantedTo: ['admin'] });
        // Quyền, chính sách cột do bước tạo riêng cấp (không phải bước ma trận chung)
        expect(logged.permissions).toBe((await permsOf(full!.Id)).length);
        expect(logged.permissions).toBeGreaterThan(0);
        const policies = await core.selectFrom('SysFieldPolicy').select('Id').where('SubjectType', '=', 'ROLE').where('SubjectId', '=', full!.Id).execute();
        expect(logged.fieldPolicies).toBe(policies.length);
        expect(policies.length).toBeGreaterThan(0);
      } finally {
        // Bài hỏng giữa chừng: trả lại vai trò và phép gán cho admin để các bài sau, full-access.spec vẫn chạy được
        if (!(await roleOf('FULL_ACCESS'))) await core.transaction().execute((trx) => bootstrapFullAccess(trx, { by: 'test' }));
        const full = (await roleOf('FULL_ACCESS'))!;
        if (!(await adminHas(full.Id))) await core.insertInto('SysUserRole').values({ UserId: (await core.selectFrom('SysUser').select('Id').where('Username', '=', 'admin').executeTakeFirstOrThrow()).Id, RoleId: full.Id }).execute();
        await bumpVersion();
      }
    });

    it('quản trị gỡ Toàn quyền khỏi admin: seed chạy lại không gán lại', async () => {
      const full = (await roleOf('FULL_ACCESS'))!;
      const assignment = await core
        .selectFrom('SysUserRole as ur')
        .innerJoin('SysUser as u', 'u.Id', 'ur.UserId')
        .select(['ur.Id', 'ur.UserId', 'ur.RoleId', 'ur.ValidFromAt', 'ur.ValidToAt', 'ur.CreatedBy'])
        .where('u.Username', '=', 'admin')
        .where('ur.RoleId', '=', full.Id)
        .executeTakeFirstOrThrow();
      const bumpVersion = () => sql`UPDATE dbo.SysPermissionVersion SET Version = Version + 1 WHERE Id = 1`.execute(core);
      await core.deleteFrom('SysUserRole').where('Id', '=', assignment.Id).execute();
      await bumpVersion();
      try {
        await runSeed({ coreOnly: true });
        expect(await adminHas(full.Id)).toBe(false);
      } finally {
        if (!(await adminHas(full.Id))) {
          await core
            .insertInto('SysUserRole')
            .values({ UserId: assignment.UserId, RoleId: assignment.RoleId, ValidFromAt: assignment.ValidFromAt, ValidToAt: assignment.ValidToAt, CreatedBy: assignment.CreatedBy })
            .execute();
        }
        await bumpVersion();
      }
    });
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
