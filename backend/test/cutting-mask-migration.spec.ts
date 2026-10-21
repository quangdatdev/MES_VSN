import 'reflect-metadata';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { sql, type Kysely, type Transaction } from 'kysely';
import { env } from '../src/config/env';
import type { CoreDatabase } from '../src/platform/database/core.types';
import { createDb } from '../src/platform/database/db';

// Task T16 (Q51): thân migration MES_Core/0015 chạy trên database đã seed như máy đã cài trước T16 (Trưởng chuyền chưa có chính sách
// cột Khách hàng ở Đồng bộ tiến độ cắt), dựng trong một transaction, kiểm rồi hủy cả transaction: database không đổi gì.
describe('MES_Core/0015: che Khách hàng ở Đồng bộ tiến độ cắt cho Trưởng chuyền trên máy đã cài', () => {
  let db: Kysely<CoreDatabase>;
  const FILE = resolve(__dirname, '../migrations/MES_Core/0015_mask_cutting_progress_customer.sql');
  const batches = readFileSync(FILE, 'utf8')
    .split(/^\s*GO\s*$/gim)
    .map((b) => b.trim())
    .filter(Boolean);
  class Rollback extends Error {}

  beforeAll(() => {
    db = createDb<CoreDatabase>(env.db.coreName);
  });
  afterAll(() => db.destroy());

  /** Dựng trạng thái máy đã cài trong transaction (không vai trò nào có chính sách cho cột này) rồi trả các hàm đọc */
  async function installed(trx: Transaction<CoreDatabase>) {
    const resourceId = (await trx.selectFrom('SysResource').select('Id').where('Code', '=', 'cutting.progress').executeTakeFirstOrThrow()).Id;
    await trx.deleteFrom('SysFieldPolicy').where('SubjectType', '=', 'ROLE').where('ResourceId', '=', resourceId).where('FieldCode', '=', 'customerName').execute();
    const roles = await trx.selectFrom('SysRole').select(['Id', 'Code']).where('Code', 'in', ['LINE_LEADER', 'PLANNER', 'DIRECTOR', 'FULL_ACCESS']).execute();
    const roleId = (code: string) => roles.find((r) => r.Code === code)!.Id;
    const levelOf = async (code: string) =>
      (
        await trx
          .selectFrom('SysFieldPolicy')
          .select('AccessLevel')
          .where('SubjectType', '=', 'ROLE')
          .where('SubjectId', '=', roleId(code))
          .where('ResourceId', '=', resourceId)
          .where('FieldCode', '=', 'customerName')
          .execute()
      ).map((p) => p.AccessLevel);
    const lastAudit = String((await trx.selectFrom('SysAuditLog').select(sql<string>`MAX(Id)`.as('n')).executeTakeFirstOrThrow()).n ?? '0');
    const logsAfter = () =>
      trx.selectFrom('SysAuditLog').select(['Username', 'EntityType', 'EntityId', 'ActionCode', 'OldValue', 'NewValue']).where('Id', '>', lastAudit).orderBy('Id').execute();
    const version = async () => Number((await trx.selectFrom('SysPermissionVersion').select('Version').where('Id', '=', 1).executeTakeFirstOrThrow()).Version);
    const migrate = async () => {
      for (const b of batches) await sql.raw(b).execute(trx);
    };
    return { resourceId, roleId, levelOf, logsAfter, version, migrate };
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

  it('Trưởng chuyền nhận mức Che; vai trò khác không đổi; nhật ký như màn Vai trò; chạy lại không trùng', () =>
    inRollback(async (trx) => {
      const t = await installed(trx);
      const v0 = await t.version();
      await t.migrate();
      expect(await t.levelOf('LINE_LEADER')).toEqual(['MASKED']);
      for (const code of ['PLANNER', 'DIRECTOR', 'FULL_ACCESS']) expect(await t.levelOf(code)).toEqual([]);
      expect(await t.version()).toBe(v0 + 1);
      const logs = await t.logsAfter();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ Username: 'migrate', EntityType: 'SysFieldPolicy', EntityId: String(t.roleId('LINE_LEADER')), ActionCode: 'ROLE_FIELD_POLICY' });
      expect(JSON.parse(logs[0].OldValue!)).toEqual({ role: 'LINE_LEADER', resourceId: t.resourceId, fields: { customerName: null } });
      expect(JSON.parse(logs[0].NewValue!)).toEqual({
        role: 'LINE_LEADER',
        resourceId: t.resourceId,
        fields: { customerName: 'MASKED' },
        by: 'MES_Core/0015_mask_cutting_progress_customer.sql',
      });

      // Chạy lại: không thêm trùng, không ghi thêm nhật ký, không tăng phiên bản quyền
      await t.migrate();
      expect(await t.levelOf('LINE_LEADER')).toEqual(['MASKED']);
      expect(await t.logsAfter()).toHaveLength(1);
      expect(await t.version()).toBe(v0 + 1);
    }));

  it('quản trị đã đặt mức khác cho Trưởng chuyền: giữ nguyên, không ghi nhật ký', () =>
    inRollback(async (trx) => {
      const t = await installed(trx);
      await trx
        .insertInto('SysFieldPolicy')
        .values({ SubjectType: 'ROLE', SubjectId: t.roleId('LINE_LEADER'), ResourceId: t.resourceId, FieldCode: 'customerName', AccessLevel: 'READONLY' } as any)
        .execute();
      const v0 = await t.version();
      await t.migrate();
      expect(await t.levelOf('LINE_LEADER')).toEqual(['READONLY']);
      expect(await t.logsAfter()).toHaveLength(0);
      expect(await t.version()).toBe(v0);
    }));

  it('vai trò mã LINE_LEADER không phải vai trò hệ thống: không thêm', () =>
    inRollback(async (trx) => {
      const t = await installed(trx);
      await trx.updateTable('SysRole').set({ IsSystem: false } as any).where('Code', '=', 'LINE_LEADER').execute();
      const v0 = await t.version();
      await t.migrate();
      expect(await t.levelOf('LINE_LEADER')).toEqual([]);
      expect(await t.logsAfter()).toHaveLength(0);
      expect(await t.version()).toBe(v0);
    }));

  it('database chưa seed (chưa có tài nguyên): không làm gì, không lỗi', () =>
    inRollback(async (trx) => {
      const v0 = Number((await trx.selectFrom('SysPermissionVersion').select('Version').where('Id', '=', 1).executeTakeFirstOrThrow()).Version);
      const lastAudit = String((await trx.selectFrom('SysAuditLog').select(sql<string>`MAX(Id)`.as('n')).executeTakeFirstOrThrow()).n ?? '0');
      const before = await trx.selectFrom('SysFieldPolicy').select(sql<number>`COUNT(*)`.as('n')).executeTakeFirstOrThrow();
      // Đổi mã tài nguyên trong transaction để thân migration không tìm thấy (như database mới), rồi hủy
      await trx.updateTable('SysResource').set({ Code: 'cutting.progress~' }).where('Code', '=', 'cutting.progress').execute();
      for (const b of batches) await sql.raw(b).execute(trx);
      expect(Number((await trx.selectFrom('SysPermissionVersion').select('Version').where('Id', '=', 1).executeTakeFirstOrThrow()).Version)).toBe(v0);
      expect(await trx.selectFrom('SysAuditLog').select('Id').where('Id', '>', lastAudit).execute()).toHaveLength(0);
      expect((await trx.selectFrom('SysFieldPolicy').select(sql<number>`COUNT(*)`.as('n')).executeTakeFirstOrThrow()).n).toBe(before.n);
    }));
});
