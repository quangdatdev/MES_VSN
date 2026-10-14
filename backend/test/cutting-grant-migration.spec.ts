import 'reflect-metadata';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { sql, type Kysely, type Transaction } from 'kysely';
import { env } from '../src/config/env';
import type { CoreDatabase } from '../src/platform/database/core.types';
import { createDb } from '../src/platform/database/db';

// Task 5.14.1: thân migration MES_Core/0012 chạy trên database đã seed như máy đã cài trước phase 5.14 (Kế hoạch chỉ có Xem
// Đồng bộ tiến độ cắt), dựng trong một transaction, kiểm rồi hủy cả transaction: database không đổi gì.
describe('MES_Core/0012: cấp quyền Đồng bộ tiến độ cắt cho máy đã cài', () => {
  let db: Kysely<CoreDatabase>;
  const FILE = resolve(__dirname, '../migrations/MES_Core/0012_grant_cutting_progress.sql');
  const batches = readFileSync(FILE, 'utf8')
    .split(/^\s*GO\s*$/gim)
    .map((b) => b.trim())
    .filter(Boolean);
  class Rollback extends Error {}

  beforeAll(() => {
    db = createDb<CoreDatabase>(env.db.coreName);
  });
  afterAll(() => db.destroy());

  /** Dựng trạng thái máy đã cài trong transaction rồi trả các hàm đọc dùng cho từng bài */
  async function installed(trx: Transaction<CoreDatabase>, planner: string[]) {
    const perms = await trx
      .selectFrom('SysPermission as p')
      .innerJoin('SysResource as r', 'r.Id', 'p.ResourceId')
      .select(['p.Id', 'p.ActionCode'])
      .where('r.Code', '=', 'cutting.progress')
      .execute();
    const permIds = perms.map((p) => p.Id);
    const permOf = (action: string) => perms.find((p) => p.ActionCode === action)!.Id;
    const roles = await trx.selectFrom('SysRole').select(['Id', 'Code']).where('Code', 'in', ['PLANNER', 'FULL_ACCESS', 'DIRECTOR', 'LINE_LEADER']).execute();
    const roleId = (code: string) => roles.find((r) => r.Code === code)!.Id;
    // Ma trận cũ: Kế hoạch (theo tham số), Trưởng chuyền Xem; Giám đốc Xem, Xuất; Toàn quyền đủ năm hành động
    await trx.deleteFrom('SysRolePermission').where('PermissionId', 'in', permIds).execute();
    const rows: { RoleId: number; PermissionId: number }[] = [
      ...planner.map((a) => ({ RoleId: roleId('PLANNER'), PermissionId: permOf(a) })),
      { RoleId: roleId('LINE_LEADER'), PermissionId: permOf('view') },
      { RoleId: roleId('DIRECTOR'), PermissionId: permOf('view') },
      { RoleId: roleId('DIRECTOR'), PermissionId: permOf('export') },
      ...perms.map((p) => ({ RoleId: roleId('FULL_ACCESS'), PermissionId: p.Id })),
    ];
    await trx.insertInto('SysRolePermission').values(rows as any).execute();
    const actionsOf = async (code: string) =>
      (
        await trx
          .selectFrom('SysRolePermission as rp')
          .innerJoin('SysPermission as p', 'p.Id', 'rp.PermissionId')
          .select('p.ActionCode')
          .where('rp.RoleId', '=', roleId(code))
          .where('rp.PermissionId', 'in', permIds)
          .execute()
      )
        .map((r) => r.ActionCode)
        .sort();
    const lastAudit = String((await trx.selectFrom('SysAuditLog').select(sql<string>`MAX(Id)`.as('n')).executeTakeFirstOrThrow()).n ?? '0');
    const logsAfter = () =>
      trx.selectFrom('SysAuditLog').select(['Username', 'EntityType', 'EntityId', 'ActionCode', 'OldValue', 'NewValue']).where('Id', '>', lastAudit).orderBy('Id').execute();
    const version = async () => Number((await trx.selectFrom('SysPermissionVersion').select('Version').where('Id', '=', 1).executeTakeFirstOrThrow()).Version);
    const migrate = async () => {
      for (const b of batches) await sql.raw(b).execute(trx);
    };
    return { roleId, actionsOf, logsAfter, version, migrate };
  }

  /** Chạy thân bài trong transaction rồi hủy: database không đổi */
  async function inRollback(body: (trx: Transaction<CoreDatabase>) => Promise<void>) {
    let checked = false;
    const run = db.transaction().execute(async (trx) => {
      await body(trx);
      checked = true;
      throw new Rollback();
    });
    await expect(run).rejects.toBeInstanceOf(Rollback);
    expect(checked).toBe(true);
  }

  it('Kế hoạch đang có Xem: nhận Sửa, Xuất; vai trò khác không đổi; nhật ký như màn Vai trò; chạy lại không trùng', () =>
    inRollback(async (trx) => {
      const t = await installed(trx, ['view']);
      const v0 = await t.version();
      await t.migrate();
      expect(await t.actionsOf('PLANNER')).toEqual(['export', 'update', 'view']);
      expect(await t.actionsOf('FULL_ACCESS')).toEqual(['create', 'delete', 'export', 'update', 'view']);
      expect(await t.actionsOf('LINE_LEADER')).toEqual(['view']);
      expect(await t.actionsOf('DIRECTOR')).toEqual(['export', 'view']);
      expect(await t.version()).toBe(v0 + 1);
      const logs = await t.logsAfter();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ Username: 'migrate', EntityType: 'SysRole', EntityId: String(t.roleId('PLANNER')), ActionCode: 'ROLE_PERMISSIONS' });
      expect(JSON.parse(logs[0].OldValue!)).toEqual({ removed: [] });
      expect(JSON.parse(logs[0].NewValue!)).toEqual({ role: 'PLANNER', added: ['cutting.progress:export', 'cutting.progress:update'], by: 'MES_Core/0012_grant_cutting_progress.sql' });

      // Chạy lại: không cấp trùng, không ghi thêm nhật ký, không tăng phiên bản quyền
      await t.migrate();
      expect(await t.actionsOf('PLANNER')).toHaveLength(3);
      expect(await t.logsAfter()).toHaveLength(1);
      expect(await t.version()).toBe(v0 + 1);
    }));

  it('Kế hoạch đã bị gỡ Xem: không cấp gì (không sinh quyền mồ côi)', () =>
    inRollback(async (trx) => {
      const t = await installed(trx, []);
      const v0 = await t.version();
      await t.migrate();
      expect(await t.actionsOf('PLANNER')).toEqual([]);
      expect(await t.logsAfter()).toHaveLength(0);
      expect(await t.version()).toBe(v0);
    }));

  it('vai trò mã PLANNER không phải vai trò hệ thống: không cấp', () =>
    inRollback(async (trx) => {
      const t = await installed(trx, ['view']);
      await trx.updateTable('SysRole').set({ IsSystem: false } as any).where('Code', '=', 'PLANNER').execute();
      await t.migrate();
      expect(await t.actionsOf('PLANNER')).toEqual(['view']);
      expect(await t.logsAfter()).toHaveLength(0);
    }));

  it('database chưa seed (chưa có tài nguyên): không làm gì, không lỗi', () =>
    inRollback(async (trx) => {
      const v0 = Number((await trx.selectFrom('SysPermissionVersion').select('Version').where('Id', '=', 1).executeTakeFirstOrThrow()).Version);
      const lastAudit = String((await trx.selectFrom('SysAuditLog').select(sql<string>`MAX(Id)`.as('n')).executeTakeFirstOrThrow()).n ?? '0');
      const before = await trx.selectFrom('SysRolePermission').select(sql<number>`COUNT(*)`.as('n')).executeTakeFirstOrThrow();
      // Đổi mã tài nguyên trong transaction để thân migration không tìm thấy (như database mới), rồi hủy
      await trx.updateTable('SysResource').set({ Code: 'cutting.progress~' }).where('Code', '=', 'cutting.progress').execute();
      for (const b of batches) await sql.raw(b).execute(trx);
      expect(Number((await trx.selectFrom('SysPermissionVersion').select('Version').where('Id', '=', 1).executeTakeFirstOrThrow()).Version)).toBe(v0);
      expect(await trx.selectFrom('SysAuditLog').select('Id').where('Id', '>', lastAudit).execute()).toHaveLength(0);
      expect((await trx.selectFrom('SysRolePermission').select(sql<number>`COUNT(*)`.as('n')).executeTakeFirstOrThrow()).n).toBe(before.n);
    }));
});
