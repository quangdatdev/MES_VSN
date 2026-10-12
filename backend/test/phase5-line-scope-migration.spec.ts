import 'reflect-metadata';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { sql, type Kysely } from 'kysely';
import { env } from '../src/config/env';
import type { CoreDatabase } from '../src/platform/database/core.types';
import { createDb } from '../src/platform/database/db';

// Task 5.10.9: nội dung migration MES_Core/0009 (phạm vi chiều Chuyền theo mã) chạy trên dữ liệu phạm vi kiểu cũ dựng trong một
// transaction, kiểm kết quả rồi hủy cả transaction: database không đổi gì (kể cả database đã chạy 0009). Thân file chạy lại được.
describe('MES_Core/0009: phạm vi chuyền theo nút cây tổ chức chuyển sang mã chuyền', () => {
  let db: Kysely<CoreDatabase>;
  const FILE = resolve(__dirname, '../migrations/MES_Core/0009_line_scope_by_code.sql');
  const batches = readFileSync(FILE, 'utf8')
    .split(/^\s*GO\s*$/gim)
    .map((b) => b.trim())
    .filter(Boolean);
  class Rollback extends Error {}

  beforeAll(() => {
    db = createDb<CoreDatabase>(env.db.coreName);
  });
  afterAll(() => db.destroy());

  const version = async (x: Kysely<CoreDatabase>) => String((await x.selectFrom('SysPermissionVersion').select('Version').where('Id', '=', 1).executeTakeFirstOrThrow()).Version);

  it('LIST theo nút -> mã; cả nhánh -> các chuyền đang dùng; dòng vốn không có tác dụng -> "~mã"; bỏ trùng; chiều khác giữ nguyên; ngừng nút; nhật ký; tăng phiên bản', async () => {
    const versionBefore = await version(db);
    let checked = false;
    const run = db.transaction().execute(async (trx) => {
      // ---- Dữ liệu kiểu cũ (như trước 0009) ----
      await trx.updateTable('SysScopeDimension').set({ OrgType: 'LINE' }).where('Code', '=', 'LINE').execute();
      const dims = new Map((await trx.selectFrom('SysScopeDimension').select(['Id', 'Code']).execute()).map((d) => [d.Code, d.Id]));
      const a01 = await trx.selectFrom('SysOrgUnit').select(['Id', 'Path', 'OrgType']).where('OrgType', '=', 'FACTORY').where('Code', '=', 'A01').executeTakeFirstOrThrow();
      // SysOrgUnit có trigger: không INSERT ... OUTPUT, thêm rồi đọc lại theo mã
      const node = async (code: string, orgType: 'WORKSHOP' | 'LINE', parent: { Id: number; Path: string; OrgType: string }, isActive = true) => {
        await trx
          .insertInto('SysOrgUnit')
          .values({ Code: code, Name: code, OrgType: orgType, ParentId: parent.Id, ParentOrgType: parent.OrgType, BranchCode: 'A01', Path: `${parent.Path}${code}/`, SortOrder: 0, IsActive: isActive, IsSystem: false } as any)
          .execute();
        return trx.selectFrom('SysOrgUnit').select(['Id', 'Path', 'OrgType']).where('Code', '=', code).executeTakeFirstOrThrow();
      };
      const x1 = await node('TM9-X1', 'WORKSHOP', a01);
      const l1 = await node('TM9-L1', 'LINE', x1);
      await node('TM9-L2', 'LINE', x1);
      const l3 = await node('TM9-L3', 'LINE', x1, false);
      const x2 = await node('TM9-X2', 'WORKSHOP', a01);
      const x3 = await node('TM9-X3', 'WORKSHOP', a01, false);
      await node('TM9-L4', 'LINE', x3);

      const roleId = async (code: string) => (await trx.selectFrom('SysRole').select('Id').where('Code', '=', code).executeTakeFirstOrThrow()).Id;
      const users = new Map<string, number>();
      const assign = async (username: string, role: string) => {
        if (!users.has(username)) {
          const u = await trx.insertInto('SysUser').values({ Username: username, PasswordHash: 'x', FullName: username, IsActive: true, FailedLoginCount: 0 } as any).output('inserted.Id').executeTakeFirstOrThrow();
          users.set(username, u.Id);
        }
        return (await trx.insertInto('SysUserRole').values({ UserId: users.get(username)!, RoleId: await roleId(role) } as any).output('inserted.Id').executeTakeFirstOrThrow()).Id;
      };
      const scope = (ur: number, dim: string, mode: string, orgUnitId: number | null, value: string | null = null) =>
        trx.insertInto('SysUserRoleScope').values({ UserRoleId: ur, DimensionId: dims.get(dim)!, ScopeMode: mode, OrgUnitId: orgUnitId, ScopeValue: value } as any).execute();

      const urList = await assign('tm9.list', 'LINE_LEADER');
      await scope(urList, 'LINE', 'LIST', l1.Id); // chuyền đang dùng
      await scope(urList, 'LINE', 'LIST', l3.Id); // chuyền đã ngừng: mã chuyền (Nhân sự tạo lại cùng mã thì có tác dụng, như bật lại chuyền)
      await scope(urList, 'LINE', 'LIST', a01.Id); // nút không phải chuyền: vốn không có tác dụng
      const urSub = await assign('tm9.sub', 'LINE_LEADER');
      await scope(urSub, 'LINE', 'ORG_SUBTREE', x1.Id);
      await scope(urSub, 'LINE', 'LIST', l1.Id); // trùng với nhánh
      const urEmpty = await assign('tm9.empty', 'LINE_LEADER');
      await scope(urEmpty, 'LINE', 'ORG_SUBTREE', x2.Id); // nhánh không có chuyền
      const urStopped = await assign('tm9.stopped', 'LINE_LEADER');
      await scope(urStopped, 'LINE', 'ORG_SUBTREE', x3.Id); // gốc đã ngừng (có chuyền đang dùng bên dưới)
      const urMixed = await assign('tm9.mixed', 'LINE_LEADER');
      await scope(urMixed, 'LINE', 'LIST', null, 'TM9-L1'); // dòng theo mã đã có
      await scope(urMixed, 'LINE', 'LIST', l1.Id);
      await scope(urMixed, 'FACTORY', 'LIST', a01.Id);
      const urOther = await assign('tm9.mixed', 'PLANNER');
      await scope(urOther, 'LINE', 'ALL', null);
      await scope(urOther, 'OWNER', 'OWN', null);
      const urFactory = await assign('tm9.factory', 'LINE_LEADER');
      await scope(urFactory, 'LINE', 'ORG_SUBTREE', a01.Id); // cả ĐVCS

      // Tập chuyền PermissionService trước 0009 tính cho "cả ĐVCS A01": mọi nút chuyền đang dùng trong nhánh
      const a01Lines = (await trx.selectFrom('SysOrgUnit').select(['Code', 'Path']).where('OrgType', '=', 'LINE').where('IsActive', '=', true).execute())
        .filter((u) => u.Path.startsWith(a01.Path))
        .map((u) => u.Code)
        .sort();
      expect(a01Lines).toEqual(expect.arrayContaining(['TM9-L1', 'TM9-L2', 'TM9-L4']));
      const maxAudit = Number((await trx.selectFrom('SysAuditLog').select((eb) => eb.fn.max('Id').as('m')).executeTakeFirst())?.m ?? 0);
      const versionInside = await version(trx);

      // ---- Chạy thân migration ----
      for (const b of batches) await sql.raw(b).execute(trx);

      // ---- Kiểm ----
      const lineValues = async (ur: number) => {
        const rows = await trx.selectFrom('SysUserRoleScope').select(['ScopeMode', 'OrgUnitId', 'ScopeValue']).where('UserRoleId', '=', ur).where('DimensionId', '=', dims.get('LINE')!).execute();
        expect(rows.every((r) => (r.ScopeMode === 'LIST' && r.OrgUnitId === null) || r.ScopeMode === 'ALL')).toBe(true);
        return rows.map((r) => (r.ScopeMode === 'ALL' ? 'ALL' : r.ScopeValue!)).sort();
      };
      expect(await lineValues(urList)).toEqual(['TM9-L1', 'TM9-L3', '~A01'].sort());
      expect(await lineValues(urSub)).toEqual(['TM9-L1', 'TM9-L2']);
      expect(await lineValues(urEmpty)).toEqual(['~TM9-X2']);
      expect(await lineValues(urStopped)).toEqual(['~TM9-X3']);
      expect(await lineValues(urMixed)).toEqual(['TM9-L1']);
      expect(await lineValues(urOther)).toEqual(['ALL']);
      expect(await lineValues(urFactory)).toEqual(a01Lines);
      // Chiều khác giữ nguyên
      const others = await trx.selectFrom('SysUserRoleScope').select(['UserRoleId', 'DimensionId', 'ScopeMode', 'OrgUnitId']).where('UserRoleId', 'in', [urMixed, urOther]).where('DimensionId', '!=', dims.get('LINE')!).execute();
      expect(others.map((o) => `${o.UserRoleId}:${o.DimensionId}:${o.ScopeMode}:${o.OrgUnitId}`).sort()).toEqual(
        [`${urMixed}:${dims.get('FACTORY')}:LIST:${a01.Id}`, `${urOther}:${dims.get('OWNER')}:OWN:null`].sort(),
      );
      // Không còn phạm vi chuyền theo nút; chiều LINE là chiều giá trị; nút xưởng, chuyền đã ngừng, nút ĐVCS giữ nguyên
      expect(await trx.selectFrom('SysUserRoleScope').select('Id').where('DimensionId', '=', dims.get('LINE')!).where('OrgUnitId', 'is not', null).execute()).toEqual([]);
      expect((await trx.selectFrom('SysScopeDimension').select('OrgType').where('Code', '=', 'LINE').executeTakeFirstOrThrow()).OrgType).toBeNull();
      expect(await trx.selectFrom('SysOrgUnit').select('Code').where('OrgType', 'in', ['LINE', 'WORKSHOP']).where('IsActive', '=', true).execute()).toEqual([]);
      expect((await trx.selectFrom('SysOrgUnit').select('IsActive').where('Id', '=', a01.Id).executeTakeFirstOrThrow()).IsActive).toBe(true);
      // Nhật ký: mỗi phép gán bị đổi một dòng (phép gán chỉ có ALL, OWN thì không), chiều LINE, nút bị ngừng; phiên bản +1
      const audit = await trx.selectFrom('SysAuditLog').select(['EntityType', 'EntityId', 'ActionCode', 'OldValue', 'NewValue', 'Username']).where('Id', '>', maxAudit as any).execute();
      expect(audit.every((a) => a.Username === 'system')).toBe(true);
      const scopeLogs = audit.filter((a) => a.ActionCode === 'USER_ROLE_SCOPE' && [...users.values()].map(String).includes(a.EntityId!));
      expect(scopeLogs).toHaveLength(6);
      const listLog = scopeLogs.find((a) => a.EntityId === String(users.get('tm9.list')))!;
      expect(JSON.parse(listLog.OldValue!).scopes.sort()).toEqual(['LINE:LIST:A01', 'LINE:LIST:TM9-L1', 'LINE:LIST:TM9-L3']);
      expect(JSON.parse(listLog.NewValue!)).toMatchObject({ role: 'LINE_LEADER', by: 'MES_Core/0009' });
      expect(JSON.parse(listLog.NewValue!).scopes.sort()).toEqual(['LINE:LIST:TM9-L1', 'LINE:LIST:TM9-L3', 'LINE:LIST:~A01'].sort());
      expect(audit.filter((a) => a.ActionCode === 'SCOPE_DIMENSION_UPDATE').map((a) => JSON.parse(a.NewValue!))).toEqual([{ code: 'LINE', orgType: null, by: 'MES_Core/0009' }]);
      const retired = JSON.parse(audit.find((a) => a.ActionCode === 'ORG_UNIT_RETIRE')!.NewValue!);
      expect(retired.lines).toEqual(expect.arrayContaining(['TM9-L1', 'TM9-L2', 'TM9-L4']));
      expect(retired.lines).not.toContain('TM9-L3');
      expect(retired.workshops).toEqual(expect.arrayContaining(['TM9-X1', 'TM9-X2']));
      expect(Number(await version(trx))).toBe(Number(versionInside) + 1);
      checked = true;
      throw new Rollback();
    });
    await expect(run).rejects.toBeInstanceOf(Rollback);
    expect(checked).toBe(true);
    // Đã hủy: database như trước
    expect(await version(db)).toBe(versionBefore);
    expect(await db.selectFrom('SysOrgUnit').select('Id').where('Code', 'like', 'TM9-%').execute()).toEqual([]);
    expect(await db.selectFrom('SysUser').select('Id').where('Username', 'like', 'tm9.%').execute()).toEqual([]);
  });
});
