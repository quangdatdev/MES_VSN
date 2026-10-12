import 'reflect-metadata';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { sql, type Kysely } from 'kysely';
import { env } from '../src/config/env';
import type { CoreDatabase } from '../src/platform/database/core.types';
import { createDb } from '../src/platform/database/db';

// Task 5.10.4 (sửa theo review 5.10.15): thân migration MES_Core/0010 chạy trên database đã seed như máy đã cài trước Phase 5.10
// (vai trò chưa có quyền Sửa Phân bổ PO, tài nguyên chưa có bảng nguồn), dựng trong một transaction, kiểm rồi hủy cả transaction:
// database không đổi gì (kể cả database đã chạy 0010). Thân file chạy lại được.
describe('MES_Core/0010: cấp quyền Sửa Phân bổ PO cho máy đã cài', () => {
  let db: Kysely<CoreDatabase>;
  const FILE = resolve(__dirname, '../migrations/MES_Core/0010_grant_poallocation_update.sql');
  const batches = readFileSync(FILE, 'utf8')
    .split(/^\s*GO\s*$/gim)
    .map((b) => b.trim())
    .filter(Boolean);
  class Rollback extends Error {}

  beforeAll(() => {
    db = createDb<CoreDatabase>(env.db.coreName);
  });
  afterAll(() => db.destroy());

  it('cấp cho PLANNER và Toàn quyền (vai trò hệ thống), không trùng khi chạy lại, có nhật ký, đặt bảng nguồn, tăng phiên bản quyền', async () => {
    let checked = false;
    const run = db.transaction().execute(async (trx) => {
      const version = async () => Number((await trx.selectFrom('SysPermissionVersion').select('Version').where('Id', '=', 1).executeTakeFirstOrThrow()).Version);
      const perm = await trx.selectFrom('SysPermission').select('Id').where('Code', '=', 'order.poallocation:update').executeTakeFirstOrThrow();
      const roles = await trx.selectFrom('SysRole').select(['Id', 'Code']).where('Code', 'in', ['PLANNER', 'FULL_ACCESS', 'DIRECTOR']).execute();
      const roleId = (code: string) => roles.find((r) => r.Code === code)!.Id;
      // Như máy đã cài trước Phase 5.10: chưa ai có quyền Sửa, tài nguyên chưa có bảng nguồn
      await trx.deleteFrom('SysRolePermission').where('PermissionId', '=', perm.Id).execute();
      await trx.updateTable('SysResource').set({ SourceTable: null }).where('Code', '=', 'order.poallocation').execute();
      const lastAudit = String((await trx.selectFrom('SysAuditLog').select(sql<string>`MAX(Id)`.as('n')).executeTakeFirstOrThrow()).n ?? '0');
      const v0 = await version();

      const migrate = async () => {
        for (const b of batches) await sql.raw(b).execute(trx);
      };
      const granted = async () =>
        (await trx.selectFrom('SysRolePermission').select('RoleId').where('PermissionId', '=', perm.Id).execute()).map((r) => r.RoleId).sort((a, b) => a - b);

      await migrate();
      expect(await granted()).toEqual([roleId('PLANNER'), roleId('FULL_ACCESS')].sort((a, b) => a - b));
      expect((await trx.selectFrom('SysResource').select('SourceTable').where('Code', '=', 'order.poallocation').executeTakeFirstOrThrow()).SourceTable).toBe('PoAllocation');
      expect(await version()).toBe(v0 + 1);
      const logs = await trx.selectFrom('SysAuditLog').select(['Username', 'EntityType', 'EntityId', 'ActionCode', 'NewValue']).where('Id', '>', lastAudit).orderBy('Id').execute();
      expect(logs).toHaveLength(2);
      for (const l of logs) expect(l).toMatchObject({ Username: 'migrate', EntityType: 'SysRole', ActionCode: 'ROLE_PERMISSIONS' });
      expect(logs.map((l) => JSON.parse(l.NewValue!).role).sort()).toEqual(['FULL_ACCESS', 'PLANNER']);
      expect(JSON.parse(logs[0].NewValue!).added).toEqual(['order.poallocation:update']);

      // Chạy lại: không cấp trùng, không ghi thêm nhật ký cấp quyền (phiên bản vẫn tăng, vô hại)
      await migrate();
      expect(await granted()).toHaveLength(2);
      expect(await trx.selectFrom('SysAuditLog').select('Id').where('Id', '>', lastAudit).execute()).toHaveLength(2);
      checked = true;
      throw new Rollback();
    });
    await expect(run).rejects.toBeInstanceOf(Rollback);
    expect(checked).toBe(true);
  });

  it('database chưa seed (chưa có tài nguyên): không làm gì, không lỗi', async () => {
    const run = db.transaction().execute(async (trx) => {
      const v0 = Number((await trx.selectFrom('SysPermissionVersion').select('Version').where('Id', '=', 1).executeTakeFirstOrThrow()).Version);
      // Đổi mã tài nguyên trong transaction để thân migration không tìm thấy (như database mới), rồi hủy
      await trx.updateTable('SysResource').set({ Code: 'order.poallocation~' }).where('Code', '=', 'order.poallocation').execute();
      for (const b of batches) await sql.raw(b).execute(trx);
      expect(Number((await trx.selectFrom('SysPermissionVersion').select('Version').where('Id', '=', 1).executeTakeFirstOrThrow()).Version)).toBe(v0);
      throw new Rollback();
    });
    await expect(run).rejects.toBeInstanceOf(Rollback);
  });
});
