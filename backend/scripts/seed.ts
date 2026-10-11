// Seed MES_Core + MES_Order + MES_Sewing + MES_Hr (dữ liệu giả cho Demo). Chạy lại an toàn: chỉ thêm phần còn thiếu.
// Ma trận quyền, chính sách cột, phạm vi và ngoại lệ mẫu chỉ nạp cho vai trò, quyền, cột, người dùng vừa tạo trong lần chạy này,
// nên thứ đã đổi ở màn Admin không bị ghi đè ngầm. Muốn nạp lại đủ dữ liệu mẫu (reset-demo dùng cách này): --sync-matrix.
// Tên, đường dẫn, bảng nguồn của tài nguyên và menu hệ thống luôn đồng bộ theo seed-data.ts (do code quyết định).
// Dùng: npm run seed -w backend                          (cần DEMO_PASSWORD trong .env)
//       npm run seed -w backend -- --reset-passwords     (đặt lại mật khẩu tài khoản demo, thu hồi phiên của họ)
import * as argon2 from 'argon2';
import { sql } from 'kysely';
import { env } from '../src/config/env';
import { createDb } from '../src/platform/database/db';
import type { CoreDatabase } from '../src/platform/database/core.types';
import type { OrderDatabase } from '../src/modules/order/order.types';
import type { SewingDatabase } from '../src/modules/sewing/sewing.types';
import {
  ACTIONS,
  ACTION_LABEL,
  LETTER,
  LINE_COUNT,
  ROLE_ORDER,
  branches,
  catalogs,
  catalogSeedItems,
  groups,
  lineCode,
  resourceFields,
  resources,
  roleFieldPolicies,
  roles,
  scopeBindings,
  shifts,
  users,
  prepSteps,
  WORKSHOPS,
  workshopCode,
  workshopName,
  workshopOfLine,
} from './seed-data';
import { seedHrIfReady } from './hr-data';
import { seedOrders } from './seed-order';
import { hasSewingDb } from './sewing-data';

/** coreOnly: chỉ MES_Core (bỏ mục 11–13: đơn hàng giả, bước chuẩn bị SX, nhân sự giả), dùng trong test để không nạp dữ liệu giả vào DB demo */
export async function runSeed({ resetPasswords = false, syncMatrix = false, coreOnly = false }: { resetPasswords?: boolean; syncMatrix?: boolean; coreOnly?: boolean } = {}) {
  if (!env.demoPassword) {
    throw new Error('Thiếu DEMO_PASSWORD trong backend/.env (mật khẩu chung cho tài khoản demo).');
  }
  const db = createDb<CoreDatabase>(env.db.coreName);
  const stats: Record<string, number> = {};
  const bump = (k: string, n = 1) => (stats[k] = (stats[k] ?? 0) + n);

  try {
    // 1. Nhà máy
    const branchId = new Map<string, number>();
    for (const b of branches) {
      let row = await db.selectFrom('SysBranch').select('Id').where('Code', '=', b.code).executeTakeFirst();
      if (!row) {
        row = await db
          .insertInto('SysBranch')
          .values({ Code: b.code, Name: b.name, IsAggregate: b.isAggregate, SortOrder: b.sort, IsActive: true, IsSystem: true } as any)
          .output('inserted.Id')
          .executeTakeFirstOrThrow();
        bump('nhà máy');
      }
      branchId.set(b.code, row.Id);
    }

    // 2. Vai trò
    const roleId = new Map<string, number>();
    const newRoles = new Set<number>();
    for (const [i, r] of roles.entries()) {
      let row = await db.selectFrom('SysRole').select('Id').where('Code', '=', r.code).executeTakeFirst();
      if (!row) {
        row = await db
          .insertInto('SysRole')
          .values({ Code: r.code, Name: r.name, Description: r.description, SortOrder: (i + 1) * 10, IsActive: true, IsSystem: true } as any)
          .output('inserted.Id')
          .executeTakeFirstOrThrow();
        bump('vai trò');
        newRoles.add(row.Id);
      }
      roleId.set(r.code, row.Id);
    }

    // 3. Tài nguyên + quyền (mỗi tài nguyên × 5 hành động). Tên, bảng nguồn, phạm vi, thứ tự của tài nguyên hệ thống theo seed-data
    // (Quản trị nhân sự tạo dạng BRANCH ngày 10/10/2026, đổi sang SHARED ở Phase 5.8).
    const resId = new Map<string, number>();
    const permId = new Map<string, number>();
    const newPerms = new Set<number>();
    // Phạm vi dữ liệu là thuộc tính an ninh (CLAUDE.md mục 4.5): đổi thì báo và ghi chi tiết vào nhật ký SEED (review 5.8 L16)
    const scopeChanges: { resource: string; from: string; to: string }[] = [];
    for (const [i, r] of resources.entries()) {
      const module = r.code.split('.')[0];
      const scope = r.scope ?? (module === 'admin' ? 'SHARED' : 'BRANCH');
      let row = await db.selectFrom('SysResource').select(['Id', 'Name', 'SourceTable', 'ScopeType', 'IsSystem', 'SortOrder']).where('Code', '=', r.code).executeTakeFirst();
      if (!row) {
        row = await db
          .insertInto('SysResource')
          .values({
            Code: r.code,
            Name: r.name,
            ModuleCode: module,
            ScopeType: scope,
            SourceTable: r.table ?? null,
            SortOrder: (i + 1) * 10,
            IsActive: true,
            IsSystem: true,
          } as any)
          .output(['inserted.Id', 'inserted.Name', 'inserted.SourceTable', 'inserted.ScopeType', 'inserted.IsSystem', 'inserted.SortOrder'])
          .executeTakeFirstOrThrow();
        bump('tài nguyên');
      } else if (row.IsSystem && (row.Name !== r.name || row.SourceTable !== (r.table ?? null) || row.ScopeType !== scope || row.SortOrder !== (i + 1) * 10)) {
        if (row.ScopeType !== scope) {
          scopeChanges.push({ resource: r.code, from: row.ScopeType, to: scope });
          console.warn(`Đổi phạm vi dữ liệu của ${r.code}: ${row.ScopeType} → ${scope}.`);
        }
        await db.updateTable('SysResource').set({ Name: r.name, SourceTable: r.table ?? null, ScopeType: scope, SortOrder: (i + 1) * 10, ModifiedAt: new Date() }).where('Id', '=', row.Id).execute();
        bump('cập nhật tài nguyên');
      }
      resId.set(r.code, row.Id);
      for (const [j, a] of ACTIONS.entries()) {
        const code = `${r.code}:${a}`;
        let p = await db.selectFrom('SysPermission').select('Id').where('Code', '=', code).executeTakeFirst();
        if (!p) {
          p = await db
            .insertInto('SysPermission')
            .values({ Code: code, ResourceId: row.Id, ActionCode: a, Name: `${ACTION_LABEL[a]}: ${r.name}`, SortOrder: j, IsActive: true, IsSystem: true } as any)
            .output('inserted.Id')
            .executeTakeFirstOrThrow();
          bump('quyền');
          newPerms.add(p.Id);
        } else {
          await db.updateTable('SysPermission').set({ Name: `${ACTION_LABEL[a]}: ${r.name}` }).where('Id', '=', p.Id).where('IsSystem', '=', true).execute();
        }
        permId.set(code, p.Id);
      }
    }

    // 4. Menu: nhóm rồi mục lá (tên, thứ tự nhóm và tên, đường dẫn mục lá của menu hệ thống theo seed-data)
    const groupId = new Map<string, number>();
    for (const [i, g] of groups.entries()) {
      const code = `menu.${g.code}`;
      const existing = await db.selectFrom('SysMenu').select(['Id', 'Name', 'SortOrder', 'IsSystem']).where('Code', '=', code).executeTakeFirst();
      let id = existing?.Id;
      if (existing?.IsSystem && (existing.Name !== g.name || existing.SortOrder !== (i + 1) * 100)) {
        await db.updateTable('SysMenu').set({ Name: g.name, SortOrder: (i + 1) * 100, ModifiedAt: new Date() }).where('Id', '=', existing.Id).execute();
        bump('cập nhật menu');
      }
      if (id === undefined) {
        const inserted = await db
          .insertInto('SysMenu')
          .values({ Code: code, Name: g.name, Icon: g.icon, SortOrder: (i + 1) * 100, IsActive: true, IsSystem: true, IsMobile: false } as any)
          .output('inserted.Id')
          .executeTakeFirstOrThrow();
        id = inserted.Id;
        bump('menu');
      }
      groupId.set(g.code, id);
    }
    for (const [i, r] of resources.entries()) {
      const code = `menu.${r.code}`;
      const exists = await db.selectFrom('SysMenu').select(['Id', 'Name', 'Path', 'IsSystem']).where('Code', '=', code).executeTakeFirst();
      if (exists) {
        if (exists.IsSystem && (exists.Name !== r.name || exists.Path !== r.path)) {
          await db.updateTable('SysMenu').set({ Name: r.name, Path: r.path, SortOrder: (i + 1) * 10, ModifiedAt: new Date() }).where('Id', '=', exists.Id).execute();
          bump('cập nhật menu');
        }
        continue;
      }
      await db
        .insertInto('SysMenu')
        .values({
          Code: code,
          Name: r.name,
          ParentId: groupId.get(r.code.split('.')[0])!,
          Path: r.path,
          ResourceId: resId.get(r.code)!,
          IsMobile: !!r.mobile,
          SortOrder: (i + 1) * 10,
          IsActive: true,
          IsSystem: true,
        } as any)
        .execute();
      bump('menu');
    }

    // 5. Ma trận Role × quyền: chỉ cho vai trò/quyền mới, trừ khi --sync-matrix
    for (const r of resources) {
      for (const [idx, roleCode] of ROLE_ORDER.entries()) {
        for (const letter of r.matrix[idx] ?? '') {
          const pid = permId.get(`${r.code}:${LETTER[letter]}`)!;
          const rid = roleId.get(roleCode)!;
          if (!syncMatrix && !newRoles.has(rid) && !newPerms.has(pid)) continue;
          const has = await db.selectFrom('SysRolePermission').select('Id').where('RoleId', '=', rid).where('PermissionId', '=', pid).executeTakeFirst();
          if (!has) {
            await db.insertInto('SysRolePermission').values({ RoleId: rid, PermissionId: pid } as any).execute();
            bump('gán quyền');
          }
        }
      }
    }

    // 6. Cây tổ chức: nút nhà máy, xưởng, chuyền giả (Code cấm sửa; Path = Path cha + Code + '/'; ADR 0010).
    // Xưởng mẫu chỉ tạo khi nhà máy chưa có xưởng nào (database mới, hoặc seed trước MES_Core/0005): xưởng vừa tạo nhận các chuyền
    // mẫu của nó đang nằm thẳng dưới nhà máy. Nhà máy đã có xưởng đang dùng (mẫu hay tự chia ở màn Danh mục hệ thống) thì giữ nguyên
    // cách chia. Chỉ tính xưởng đang dùng: reset-demo ngừng xưởng tạo thêm, nếu xưởng mẫu chưa có thì seed sau đó vẫn tạo được.
    const orgId = new Map<string, number>();
    // SysOrgUnit có trigger kiểm Path (MES_Core/0006): SQL Server không cho INSERT ... OUTPUT trên bảng có trigger, nên thêm rồi đọc lại theo mã
    const addNode = async (values: Record<string, unknown>) => {
      await db.insertInto('SysOrgUnit').values(values as any).execute();
      return db.selectFrom('SysOrgUnit').select(['Id', 'Path']).where('Code', '=', values.Code as string).executeTakeFirstOrThrow();
    };
    for (const b of branches.filter((x) => !x.isAggregate)) {
      let f = await db.selectFrom('SysOrgUnit').select('Id').where('Code', '=', b.code).executeTakeFirst();
      if (!f) {
        f = await addNode({ Code: b.code, Name: b.name, OrgType: 'FACTORY', ParentId: null, ParentOrgType: null, BranchCode: b.code, Path: `/${b.code}/`, SortOrder: b.sort, IsActive: true, IsSystem: true });
        bump('đơn vị tổ chức');
      }
      orgId.set(b.code, f.Id);
      const anyWorkshop = await db.selectFrom('SysOrgUnit').select('Id').where('OrgType', '=', 'WORKSHOP').where('BranchCode', '=', b.code).where('IsActive', '=', true).executeTakeFirst();
      if (!anyWorkshop) {
        for (const [i, range] of (WORKSHOPS[b.code] ?? []).entries()) {
          const code = workshopCode(b.code, i + 1);
          // Xưởng mẫu đã có nhưng đang ngừng, hoặc mã đã bị một chuyền tự tạo dùng mất: bỏ qua xưởng này (chuyền của nó nằm
          // thẳng dưới nhà máy)
          const taken = await db.selectFrom('SysOrgUnit').select('OrgType').where('Code', '=', code).executeTakeFirst();
          if (taken) {
            console.warn(
              taken.OrgType === 'WORKSHOP'
                ? `Bỏ qua xưởng mẫu ${code}: xưởng đang ngừng dùng (bật lại ở Danh mục hệ thống › Chuyền may nếu cần).`
                : `Bỏ qua xưởng mẫu ${code}: mã đã dùng cho một đơn vị loại ${taken.OrgType}.`,
            );
            continue;
          }
          const created = await addNode({ Code: code, Name: workshopName(i + 1), OrgType: 'WORKSHOP', ParentId: f.Id, ParentOrgType: 'FACTORY', BranchCode: b.code, Path: `/${b.code}/${code}/`, SortOrder: i + 1, IsActive: true, IsSystem: true });
          bump('đơn vị tổ chức');
          for (let n = range.from; n <= range.to; n++) {
            const lc = lineCode(b.code, n);
            const moved = await db
              .updateTable('SysOrgUnit')
              .set({ ParentId: created.Id, ParentOrgType: 'WORKSHOP', Path: `${created.Path}${lc}/`, ModifiedAt: new Date() })
              .where('Code', '=', lc)
              .where('OrgType', '=', 'LINE')
              .where('ParentId', '=', f.Id)
              .executeTakeFirst();
            if (Number(moved.numUpdatedRows)) bump('chuyển chuyền vào xưởng mẫu', Number(moved.numUpdatedRows));
          }
        }
      }
      // Chuyền mẫu còn thiếu vào xưởng mẫu của nó khi xưởng đó có và đang dùng (chuyền đang dùng phải ở xưởng đang dùng)
      const workshops = new Map(
        (await db.selectFrom('SysOrgUnit').select(['Id', 'Code', 'Path']).where('OrgType', '=', 'WORKSHOP').where('BranchCode', '=', b.code).where('IsActive', '=', true).execute()).map((w) => [w.Code, w]),
      );
      for (const w of workshops.values()) orgId.set(w.Code, w.Id);
      for (let n = 1; n <= (LINE_COUNT[b.code] ?? 0); n++) {
        const code = lineCode(b.code, n);
        const taken = await db.selectFrom('SysOrgUnit').select(['Id', 'OrgType']).where('Code', '=', code).executeTakeFirst();
        // Mã chuyền mẫu đã bị một xưởng tự tạo dùng mất (API chỉ kiểm tiền tố nhà máy): bỏ qua, không lấy Id xưởng làm chuyền
        if (taken && taken.OrgType !== 'LINE') {
          console.warn(`Bỏ qua chuyền mẫu ${code}: mã đã dùng cho một đơn vị loại ${taken.OrgType}.`);
          continue;
        }
        let l: { Id: number } | undefined = taken;
        if (!l) {
          const k = workshopOfLine(b.code, n);
          const w = k ? workshops.get(workshopCode(b.code, k)) : undefined;
          l = await addNode({
            Code: code,
            Name: `Chuyền ${String(n).padStart(2, '0')}`,
            OrgType: 'LINE',
            ParentId: w ? w.Id : f.Id,
            ParentOrgType: w ? 'WORKSHOP' : 'FACTORY',
            BranchCode: b.code,
            Path: w ? `${w.Path}${code}/` : `/${b.code}/${code}/`,
            SortOrder: n,
            IsActive: true,
            IsSystem: true,
          });
          bump('đơn vị tổ chức');
        }
        orgId.set(code, l.Id);
      }
    }

    // 6b. Danh mục hệ thống: loại danh mục, mục và ca làm việc còn thiếu (không ghi đè thay đổi ở màn Danh mục hệ thống).
    // Danh mục theo nhà máy lấy tên nhà máy hiện tại trong DB (tên có thể đã đổi ở màn Nhà máy)
    const factories = await db.selectFrom('SysBranch').select(['Code as code', 'Name as name']).where('IsAggregate', '=', false).where('IsActive', '=', true).orderBy('SortOrder').orderBy('Code').execute();
    for (const [i, c] of catalogs.entries()) {
      let cat = await db.selectFrom('SysCatalog').select('Id').where('Code', '=', c.code).executeTakeFirst();
      if (!cat) {
        cat = await db
          .insertInto('SysCatalog')
          .values({ Code: c.code, Name: c.name, Description: c.description, SortOrder: (i + 1) * 10, IsActive: true, IsSystem: true } as any)
          .output('inserted.Id')
          .executeTakeFirstOrThrow();
        bump('danh mục');
      }
      for (const [j, [code, name]] of catalogSeedItems(c, factories).entries()) {
        const has = await db.selectFrom('SysCatalogItem').select('Id').where('CatalogId', '=', cat.Id).where('Code', '=', code).executeTakeFirst();
        if (has) continue;
        await db.insertInto('SysCatalogItem').values({ CatalogId: cat.Id, Code: code, Name: name, SortOrder: (j + 1) * 10, IsActive: true, IsSystem: false } as any).execute();
        bump('mục danh mục');
      }
    }
    for (const [i, [code, name, start, end, breakMinutes]] of shifts.entries()) {
      const has = await db.selectFrom('SysShift').select('Id').where('Code', '=', code).executeTakeFirst();
      if (has) continue;
      await db.insertInto('SysShift').values({ Code: code, Name: name, StartTime: start, EndTime: end, BreakMinutes: breakMinutes, SortOrder: (i + 1) * 10, IsActive: true, IsSystem: false } as any).execute();
      bump('ca làm việc');
    }

    // 7. Tài nguyên lọc theo chiều nào, qua cột nào. Tài nguyên hệ thống khai báo ở seed-data thì đồng bộ đúng như khai báo:
    // đổi bảng nguồn mà còn liên kết cũ trỏ tới cột không có sẽ làm truy vấn lỗi (review 5.1 #18).
    const dims = new Map((await db.selectFrom('SysScopeDimension').select(['Id', 'Code']).execute()).map((d) => [d.Code, d.Id]));
    for (const [res, map] of Object.entries(scopeBindings)) {
      const rid = resId.get(res)!;
      const wanted = new Map(Object.entries(map).map(([dim, column]) => {
        const did = dims.get(dim);
        if (!did) throw new Error(`Thiếu chiều phạm vi ${dim} (chạy migration MES_Core/0002 chưa?)`);
        return [did, column] as const;
      }));
      const current = await db.selectFrom('SysResourceScopeBinding').select(['Id', 'DimensionId', 'ColumnName']).where('ResourceId', '=', rid).execute();
      for (const c of current) {
        if (!wanted.has(c.DimensionId)) {
          await db.deleteFrom('SysResourceScopeBinding').where('Id', '=', c.Id).execute();
          bump('gỡ chiều phạm vi cũ');
        } else if (wanted.get(c.DimensionId) !== c.ColumnName) {
          await db.updateTable('SysResourceScopeBinding').set({ ColumnName: wanted.get(c.DimensionId)! }).where('Id', '=', c.Id).execute();
          bump('sửa chiều phạm vi');
        }
      }
      for (const [did, column] of wanted) {
        if (current.some((c) => c.DimensionId === did)) continue;
        await db.insertInto('SysResourceScopeBinding').values({ ResourceId: rid, DimensionId: did, ColumnName: column } as any).execute();
        bump('gắn chiều phạm vi');
      }
    }

    // 8. Cột đăng ký của tài nguyên (tên, cờ nhạy cảm, thứ tự của cột hệ thống theo seed-data)
    const newFields = new Set<string>();
    for (const [res, fields] of Object.entries(resourceFields)) {
      const rid = resId.get(res)!;
      for (const [i, [code, name, sensitive]] of fields.entries()) {
        const f = await db.selectFrom('SysResourceField').select(['Id', 'Name', 'IsSensitive', 'IsSystem', 'SortOrder']).where('ResourceId', '=', rid).where('Code', '=', code).executeTakeFirst();
        if (!f) {
          await db.insertInto('SysResourceField').values({ ResourceId: rid, Code: code, Name: name, IsSensitive: sensitive === 'S', SortOrder: (i + 1) * 10, IsActive: true, IsSystem: true } as any).execute();
          bump('cột');
          newFields.add(`${res}.${code}`);
        } else if (f.IsSystem && (f.Name !== name || !!f.IsSensitive !== (sensitive === 'S') || f.SortOrder !== (i + 1) * 10)) {
          await db.updateTable('SysResourceField').set({ Name: name, IsSensitive: sensitive === 'S', SortOrder: (i + 1) * 10 }).where('Id', '=', f.Id).execute();
        }
      }
    }

    // 9. Chính sách cột mẫu theo vai trò: chỉ cho vai trò/cột mới, trừ khi --sync-matrix
    for (const p of roleFieldPolicies) {
      const rid = roleId.get(p.role)!;
      if (!syncMatrix && !newRoles.has(rid) && !newFields.has(`${p.resource}.${p.field}`)) continue;
      const has = await db
        .selectFrom('SysFieldPolicy')
        .select('Id')
        .where('SubjectType', '=', 'ROLE')
        .where('SubjectId', '=', rid)
        .where('ResourceId', '=', resId.get(p.resource)!)
        .where('FieldCode', '=', p.field)
        .executeTakeFirst();
      if (!has) {
        await db.insertInto('SysFieldPolicy').values({ SubjectType: 'ROLE', SubjectId: rid, ResourceId: resId.get(p.resource)!, FieldCode: p.field, AccessLevel: p.level } as any).execute();
        bump('chính sách cột');
      }
    }

    // 10. Tài khoản demo; vai trò, nhà máy, phạm vi, ngoại lệ, cột riêng mẫu chỉ cho tài khoản mới (hoặc --sync-matrix):
    // quản trị đã thu hồi thì chạy lại không cấp lại. Gán lại vai trò mà thiếu phạm vi là nới thành không giới hạn (review 5.4.8 lượt 5)
    const hash = await argon2.hash(env.demoPassword, { type: argon2.argon2id });
    const userId = new Map<string, number>();
    for (const u of users) {
      let row = await db.selectFrom('SysUser').select('Id').where('Username', '=', u.username).executeTakeFirst();
      const isNew = !row;
      if (!row) {
        row = await db
          .insertInto('SysUser')
          .values({ Username: u.username, PasswordHash: hash, FullName: u.fullName, IsActive: true, FailedLoginCount: 0 } as any)
          .output('inserted.Id')
          .executeTakeFirstOrThrow();
        bump('tài khoản');
      } else if (resetPasswords) {
        await db.updateTable('SysUser').set({ PasswordHash: hash, FailedLoginCount: 0, LockedUntilAt: null }).where('Id', '=', row.Id).execute();
        await db.updateTable('SysUserSession').set({ RevokedAt: new Date() }).where('UserId', '=', row.Id).where('RevokedAt', 'is', null).execute();
        bump('đặt lại mật khẩu');
      }
      userId.set(u.username, row.Id);
      if (!isNew && !syncMatrix) continue;
      // Tra đủ phạm vi trước khi gán vai trò: thiếu đơn vị thì không gán (vai trò không kèm phạm vi là không giới hạn)
      const scopes = (u.scopes ?? []).map((s) => ({ ...s, oid: s.org ? orgId.get(s.org) : null }));
      const missing = scopes.filter((s) => s.oid === undefined || !dims.has(s.dimension)).map((s) => s.org ?? s.dimension);
      if (missing.length) {
        console.warn(
          `Không gán vai trò ${u.role} cho ${u.username}: thiếu ${missing.join(', ')} của phạm vi (xem cảnh báo ở trên). Có đơn vị rồi thì gán ở màn Người dùng hoặc chạy npm run seed -- --sync-matrix.`,
        );
        continue;
      }
      // Một tài khoản một transaction: lỗi giữa chừng không để lại vai trò mà thiếu phạm vi (không giới hạn)
      await db.transaction().execute(async (trx) => {
        let ur = await trx.selectFrom('SysUserRole').select('Id').where('UserId', '=', row.Id).where('RoleId', '=', roleId.get(u.role)!).executeTakeFirst();
        if (!ur) {
          ur = await trx.insertInto('SysUserRole').values({ UserId: row.Id, RoleId: roleId.get(u.role)! } as any).output('inserted.Id').executeTakeFirstOrThrow();
          bump('gán vai trò');
        }
        for (const bc of u.branches) {
          const has = await trx.selectFrom('SysUserBranch').select('Id').where('UserId', '=', row.Id).where('BranchId', '=', branchId.get(bc)!).executeTakeFirst();
          if (!has) {
            await trx.insertInto('SysUserBranch').values({ UserId: row.Id, BranchId: branchId.get(bc)!, IsDefault: bc === u.defaultBranch } as any).execute();
            bump('gán nhà máy');
          }
        }
        for (const s of scopes) {
          const did = dims.get(s.dimension)!;
          const oid = s.oid ?? null;
          let q = trx.selectFrom('SysUserRoleScope').select('Id').where('UserRoleId', '=', ur.Id).where('DimensionId', '=', did).where('ScopeMode', '=', s.mode);
          q = oid === null ? q.where('OrgUnitId', 'is', null) : q.where('OrgUnitId', '=', oid);
          if (!(await q.executeTakeFirst())) {
            await trx.insertInto('SysUserRoleScope').values({ UserRoleId: ur.Id, DimensionId: did, ScopeMode: s.mode, OrgUnitId: oid, ScopeValue: s.value ?? null } as any).execute();
            bump('phạm vi');
          }
        }
        for (const o of u.overrides ?? []) {
          const pid = permId.get(o.permission)!;
          const has = await trx.selectFrom('SysUserPermissionOverride').select('Id').where('UserId', '=', row.Id).where('PermissionId', '=', pid).executeTakeFirst();
          if (!has) {
            await trx
              .insertInto('SysUserPermissionOverride')
              .values({ UserId: row.Id, PermissionId: pid, Effect: o.effect, ValidToAt: o.validTo ? new Date(o.validTo) : null, Reason: o.reason } as any)
              .execute();
            bump('ngoại lệ');
          }
        }
        for (const f of u.fieldPolicies ?? []) {
          const rid = resId.get(f.resource)!;
          const has = await trx
            .selectFrom('SysFieldPolicy')
            .select('Id')
            .where('SubjectType', '=', 'USER')
            .where('SubjectId', '=', row.Id)
            .where('ResourceId', '=', rid)
            .where('FieldCode', '=', f.field)
            .executeTakeFirst();
          if (!has) {
            await trx
              .insertInto('SysFieldPolicy')
              .values({ SubjectType: 'USER', SubjectId: row.Id, ResourceId: rid, FieldCode: f.field, AccessLevel: f.level, ValidToAt: f.validTo ? new Date(f.validTo) : null, Reason: f.reason } as any)
              .execute();
            bump('cột riêng');
          }
        }
      });
    }

    if (!coreOnly) {
      // 11. Dữ liệu đơn hàng giả trong MES_Order: chỉ cho nhà máy chưa có đơn hàng nào
      const order = createDb<OrderDatabase>(env.db.orderName);
      try {
        const planner = userId.get('kehoach.a') ?? null;
        const plannerName = users.find((u) => u.username === 'kehoach.a')?.fullName ?? 'Kế hoạch';
        for (const b of branches.filter((x) => !x.isAggregate)) {
          const has = await order.selectFrom('SalesOrder').select('Id').where('BranchCode', '=', b.code).executeTakeFirst();
          if (has) continue;
          const s = await seedOrders(order, b.code, planner, plannerName);
          bump('đơn hàng', s.orders);
          bump('PO', s.pos);
          bump('kế hoạch xuất hàng', s.plans);
          bump('dòng dàn chuyền', s.lines);
        }
      } finally {
        await order.destroy();
      }

      // 12. Danh mục Cấu hình chuẩn bị SX trong MES_Sewing: chỉ thêm bước còn thiếu theo mã, không sửa bước đã có.
      // Máy chưa tạo MES_Sewing thì bỏ qua (không làm hỏng phần đã seed của MES_Core, MES_Order)
      const sewing = (await hasSewingDb()) ? createDb<SewingDatabase>(env.db.sewingName) : null;
      if (!sewing) console.warn(`Chưa có database ${env.db.sewingName}: bỏ qua danh mục Cấu hình chuẩn bị SX (xem docs/thiet-ke/db-sewing.md).`);
      else try {
        const have = new Set((await sewing.selectFrom('PrepStep').select('Code').execute()).map((r) => r.Code));
        for (const [i, st] of prepSteps.entries()) {
          if (have.has(st.code)) continue;
          await sewing
            .insertInto('PrepStep')
            .values({ Code: st.code, Name: st.name, PlanDays: st.planDays, Performer: st.performer, DataSource: st.dataSource, Description: null, SortOrder: (i + 1) * 10, IsActive: true, CreatedBy: null })
            .execute();
          bump('bước chuẩn bị SX');
        }
      } finally {
        await sewing.destroy();
      }

      // 13. Dữ liệu nhân sự giả trong MES_Hr: thêm phần còn thiếu theo mã; nhân viên chỉ khi bảng còn trống. Máy chưa tạo MES_Hr thì bỏ qua
      for (const [k, v] of Object.entries(await seedHrIfReady())) bump(k, v);
    }

    await sql`UPDATE dbo.SysPermissionVersion SET Version = Version + 1, ModifiedAt = SYSUTCDATETIME() WHERE Id = 1`.execute(db);
    // Seed cũng cấp quyền và đổi mật khẩu nên phải để lại dấu vết trong nhật ký.
    if (Object.keys(stats).length) {
      await db
        .insertInto('SysAuditLog')
        .values({ EntityType: 'System', ActionCode: 'SEED', NewValue: JSON.stringify({ by: 'scripts/seed.ts', syncMatrix, resetPasswords, stats, ...(scopeChanges.length ? { scopeChanges } : {}) }) } as any)
        .execute();
    }
    console.log('Seed xong:', Object.keys(stats).length ? stats : 'không có gì mới');
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  runSeed({ resetPasswords: process.argv.includes('--reset-passwords'), syncMatrix: process.argv.includes('--sync-matrix') }).catch((e) => {
    console.error('Seed lỗi:', e.message ?? e);
    process.exit(1);
  });
}
