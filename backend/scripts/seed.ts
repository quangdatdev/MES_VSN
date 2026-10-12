// Seed MES_Core + MES_Order + MES_Sewing + MES_Hr (dữ liệu giả cho Demo). Chạy lại an toàn: chỉ thêm phần còn thiếu.
// Ma trận quyền, chính sách cột, phạm vi và ngoại lệ mẫu chỉ nạp cho vai trò, quyền, cột, người dùng vừa tạo trong lần chạy này,
// nên thứ đã đổi ở màn Admin không bị ghi đè ngầm. Muốn nạp lại đủ dữ liệu mẫu (reset-demo dùng cách này): --sync-matrix.
// Tên, đường dẫn, bảng nguồn của tài nguyên và menu hệ thống luôn đồng bộ theo seed-data.ts (do code quyết định).
// Dùng: npm run seed -w backend                          (cần DEMO_PASSWORD trong .env)
//       npm run seed -w backend -- --reset-passwords     (đặt lại mật khẩu tài khoản demo, thu hồi phiên của họ)
//       npm run seed -w backend -- --no-sample-data      (chỉ tài khoản admin, không đơn hàng giả, phòng ban và nhân viên giả; xem SEED_SAMPLE_DATA)
// npm run migrate tự gọi seed không dữ liệu mẫu sau khi tạo bảng: cài lần đầu chỉ cần migrate là đăng nhập được bằng admin.
import * as argon2 from 'argon2';
import { sql, type Kysely, type Transaction } from 'kysely';
import { env } from '../src/config/env';
import { createDb } from '../src/platform/database/db';
import type { CoreDatabase } from '../src/platform/database/core.types';
import type { OrderDatabase } from '../src/modules/order/order.types';
import type { SewingDatabase } from '../src/modules/sewing/sewing.types';
import {
  ACTIONS,
  ACTION_LABEL,
  FULL_ACCESS_ROLE,
  fullAccessLetters,
  LETTER,
  ROLE_ORDER,
  branches,
  catalogs,
  catalogSeedItems,
  groups,
  resourceFields,
  resources,
  roleFieldPolicies,
  roles,
  scopeBindings,
  shifts,
  users,
  prepSteps,
  productionFactories,
} from './seed-data';
import { syncBranchesFromBravo } from './bravo-branches';
import { seedHrIfReady } from './hr-data';
import { seedOrders } from './seed-order';
import { hasSewingDb } from './sewing-data';

/**
 * coreOnly: chỉ MES_Core (bỏ mục 11–13: đơn hàng giả, bước chuẩn bị SX, nhân sự giả), dùng trong test để không nạp dữ liệu giả vào DB demo.
 * sampleData = false (máy chủ dùng thật, npm run migrate): chỉ tạo tài khoản admin (10), bỏ đơn hàng giả (11), phòng ban và nhân viên
 * giả (13); giữ phần là cấu hình: danh mục bước chuẩn bị SX (12), loại phòng ban và chức danh dùng chung (13).
 */
export async function runSeed({
  resetPasswords = false,
  syncMatrix = false,
  coreOnly = false,
  sampleData = env.seedSampleData,
  by = 'scripts/seed.ts',
}: { resetPasswords?: boolean; syncMatrix?: boolean; coreOnly?: boolean; sampleData?: boolean; by?: string } = {}) {
  if (!env.demoPassword) {
    throw new Error('Thiếu DEMO_PASSWORD trong backend/.env (mật khẩu ban đầu của admin và tài khoản demo).');
  }
  // Máy chủ thật: mật khẩu ban đầu của admin ít nhất 8 ký tự, như màn Người dùng đòi khi đặt mật khẩu
  if (env.isProd && env.demoPassword.length < 8) throw new Error('DEMO_PASSWORD phải dài ít nhất 8 ký tự khi NODE_ENV=production.');
  const db = createDb<CoreDatabase>(env.db.coreName);
  const stats: Record<string, number> = {};
  const bump = (k: string, n = 1) => (stats[k] = (stats[k] ?? 0) + n);

  try {
    // 1. Đơn vị cơ sở (ADR 0013): đơn vị tổng hợp luôn có; ĐVCS mẫu chỉ khi có dữ liệu mẫu; rồi chép theo danh mục chi nhánh
    // BRAVO nếu MES_Sync đã đồng bộ (thêm mã còn thiếu, tên theo BRAVO)
    // ĐVCS tạo trong lần chạy này: chưa ai thu hồi được, gán cho cả tài khoản mẫu đã có (bước 10)
    const createdBranches = new Set<string>();
    /** Phép gán thêm cho tài khoản đã có, ghi vào nhật ký SEED (thay đổi phân quyền phải có nhật ký, CLAUDE.md mục 4.8) */
    const newGrants: { username: string; branches: string[]; roles?: string[] }[] = [];
    for (const b of branches.filter((x) => x.isAggregate || sampleData)) {
      const row = await db.selectFrom('SysBranch').select('Id').where('Code', '=', b.code).executeTakeFirst();
      if (!row) {
        await db.insertInto('SysBranch').values({ Code: b.code, Name: b.name, IsAggregate: b.isAggregate, SortOrder: b.sort, IsActive: true, IsSystem: true } as any).execute();
        bump('đơn vị cơ sở');
        createdBranches.add(b.code);
      }
    }
    try {
      const imported = await syncBranchesFromBravo(db);
      if (!imported) console.warn('Chưa có danh mục chi nhánh BRAVO trong MES_Sync: đơn vị cơ sở chưa chép từ BRAVO (đồng bộ xong sẽ tự chép).');
      else {
        for (const b of imported.added) createdBranches.add(b.code);
        if (imported.added.length) bump('đơn vị cơ sở từ BRAVO', imported.added.length);
        if (imported.updated.length) bump('đổi tên đơn vị cơ sở theo BRAVO', imported.updated.length);
      }
    } catch (e) {
      console.warn(`Không chép được đơn vị cơ sở từ BRAVO: ${(e as Error).message}`);
    }
    const branchId = new Map((await db.selectFrom('SysBranch').select(['Id', 'Code']).execute()).map((b) => [b.Code, b.Id]));

    // 2. Vai trò
    const roleId = new Map<string, number>();
    const newRoles = new Set<number>();
    for (const [i, r] of roles.entries()) {
      const found = await db.selectFrom('SysRole').select(['Id', 'IsSystem']).where('Code', '=', r.code).executeTakeFirst();
      // Toàn quyền chưa có thì tạo riêng ở bước 9b, trong một transaction cùng quyền, chính sách cột, phép gán, nhật ký (ADR 0014).
      // Có rồi mà do người dùng tự tạo trùng mã thì không đụng tới
      if (r.code === FULL_ACCESS_ROLE && !found?.IsSystem) {
        if (found) console.warn(`Đã có vai trò ${FULL_ACCESS_ROLE} do người dùng tạo (không phải vai trò hệ thống): seed không cấp quyền, không gán vai trò này. Đổi mã vai trò đó rồi chạy lại seed.`);
        continue;
      }
      let row: { Id: number } | undefined = found;
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

    // 4. Menu: nhóm rồi mục lá (tên, thứ tự của nhóm và mục lá, đường dẫn mục lá của menu hệ thống theo seed-data)
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
      const exists = await db.selectFrom('SysMenu').select(['Id', 'Name', 'Path', 'SortOrder', 'IsSystem']).where('Code', '=', code).executeTakeFirst();
      if (exists) {
        // Thứ tự cũng theo seed-data: thêm màn vào giữa nhóm (Phân bổ PO sau Thông tin đơn hàng) thì các màn sau lùi xuống, không
        // trùng thứ tự với màn mới (không có màn nào sửa thứ tự menu)
        if (exists.IsSystem && (exists.Name !== r.name || exists.Path !== r.path || exists.SortOrder !== (i + 1) * 10)) {
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

    // 5. Ma trận Role × quyền: chỉ cho vai trò/quyền mới, trừ khi --sync-matrix. Toàn quyền tính riêng (ADR 0014): chưa có thì
    // tạo ở bước 9b; có rồi thì nhận quyền mới, quyền quản trị chỉ khi ADMIN đang có (vòng ADMIN chạy trước trong cùng tài nguyên)
    for (const r of resources) {
      const perRole: [string, string][] = [...ROLE_ORDER.map((code, idx): [string, string] => [code, r.matrix[idx] ?? '']), [FULL_ACCESS_ROLE, fullAccessLetters(r)]];
      for (const [roleCode, letters] of perRole) {
        const rid = roleId.get(roleCode);
        if (rid === undefined) continue;
        for (const letter of letters) {
          const pid = permId.get(`${r.code}:${LETTER[letter]}`)!;
          if (!syncMatrix && !newRoles.has(rid) && !newPerms.has(pid)) continue;
          if (roleCode === FULL_ACCESS_ROLE && r.code.startsWith('admin.') && !(await adminRoleHas(db, pid))) continue;
          const has = await db.selectFrom('SysRolePermission').select('Id').where('RoleId', '=', rid).where('PermissionId', '=', pid).executeTakeFirst();
          if (!has) {
            await db.insertInto('SysRolePermission').values({ RoleId: rid, PermissionId: pid } as any).execute();
            bump('gán quyền');
          }
        }
      }
    }

    // 6. Cây tổ chức: chỉ nút gốc FACTORY của mỗi ĐVCS (Code cấm sửa; Path = '/' + Code + '/'; ADR 0010), phạm vi theo ĐVCS
    // dùng nút này. Chuyền may là bộ phận tích "Xưởng sản xuất" ở MES_Hr (phase 5.10): seedHr nạp xưởng, chuyền mẫu; không tạo
    // nút Xưởng, Chuyền ở SysOrgUnit nữa (nút cũ trên database đã cài giữ nguyên, MES_Core/0009 ngừng dùng).
    const orgId = new Map<string, number>();
    // Chỉ ĐVCS đang có (máy không dữ liệu mẫu chỉ có ĐVCS chép từ BRAVO): SysOrgUnit.BranchCode có khóa ngoại tới SysBranch
    for (const b of branches.filter((x) => !x.isAggregate && branchId.has(x.code))) {
      let f = await db.selectFrom('SysOrgUnit').select('Id').where('Code', '=', b.code).executeTakeFirst();
      if (!f) {
        // SysOrgUnit có trigger kiểm Path (MES_Core/0006): SQL Server không cho INSERT ... OUTPUT trên bảng có trigger, nên thêm rồi đọc lại theo mã
        await db.insertInto('SysOrgUnit').values({ Code: b.code, Name: b.name, OrgType: 'FACTORY', ParentId: null, ParentOrgType: null, BranchCode: b.code, Path: `/${b.code}/`, SortOrder: b.sort, IsActive: true, IsSystem: true } as any).execute();
        f = await db.selectFrom('SysOrgUnit').select('Id').where('Code', '=', b.code).executeTakeFirstOrThrow();
        bump('đơn vị tổ chức');
      }
      orgId.set(b.code, f.Id);
    }

    // 6b. Danh mục hệ thống: loại danh mục, mục và ca làm việc còn thiếu (không ghi đè thay đổi ở màn Danh mục hệ thống)
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
      for (const [j, [code, name]] of catalogSeedItems(c).entries()) {
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

    // 6c. Nhà máy SX mẫu (ADR 0013): chỉ khi có dữ liệu mẫu, chỉ thêm mã còn thiếu, ĐVCS của nhà máy phải đang có
    if (sampleData) {
      for (const [i, f] of productionFactories.entries()) {
        if (!branchId.has(f.branch)) continue;
        const has = await db.selectFrom('SysProductionFactory').select('Id').where('Code', '=', f.code).executeTakeFirst();
        if (has) continue;
        await db.insertInto('SysProductionFactory').values({ Code: f.code, Name: f.name, BranchCode: f.branch, SortOrder: (i + 1) * 10, IsActive: true, IsSystem: false }).execute();
        bump('nhà máy SX');
      }
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
      const rid = roleId.get(p.role);
      if (rid === undefined) continue;
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

    // 9b. Vai trò Toàn quyền (ADR 0014): tạo một lần, trong một transaction
    // Tài khoản được gán: như bước 10 (máy không dữ liệu mẫu chỉ có admin). --sync-matrix thì bước 10 gán (reset-demo xóa phép gán trước)
    const accounts = sampleData ? users : users.filter((x) => x.username === 'admin');
    const boot = await db.transaction().execute((trx) => bootstrapFullAccess(trx, { by, accounts, assign: !syncMatrix }));
    if (boot) {
      bump('vai trò');
      bump('gán quyền', boot.permissions);
      bump('chính sách cột', boot.fieldPolicies);
      if (boot.grantedTo.length) bump('gán vai trò', boot.grantedTo.length);
      for (const w of boot.skipped) console.warn(w);
    }
    const fullId = await db.selectFrom('SysRole').select('Id').where('Code', '=', FULL_ACCESS_ROLE).where('IsSystem', '=', true).executeTakeFirst();
    if (fullId) roleId.set(FULL_ACCESS_ROLE, fullId.Id);

    /** Gán vai trò không kèm phạm vi (vai trò gán thêm, ADR 0014); có rồi thì thôi. Trả true khi vừa gán */
    const addRole = async (uid: number, code: string, executor: Kysely<CoreDatabase> = db) => {
      const rid = roleId.get(code);
      if (rid === undefined) {
        console.warn(`Không gán vai trò ${code}: chưa có vai trò hệ thống mã này.`);
        return false;
      }
      if (await executor.selectFrom('SysUserRole').select('Id').where('UserId', '=', uid).where('RoleId', '=', rid).executeTakeFirst()) return false;
      await executor.insertInto('SysUserRole').values({ UserId: uid, RoleId: rid } as any).execute();
      bump('gán vai trò');
      return true;
    };

    // 10. Tài khoản demo; vai trò, nhà máy, phạm vi, ngoại lệ, cột riêng mẫu chỉ cho tài khoản mới (hoặc --sync-matrix):
    // quản trị đã thu hồi thì chạy lại không cấp lại. Gán lại vai trò mà thiếu phạm vi là nới thành không giới hạn (review 5.4.8 lượt 5)
    const hash = await argon2.hash(env.demoPassword, { type: argon2.argon2id });
    const userId = new Map<string, number>();
    // Chiều theo cây tổ chức (OrgType có giá trị: FACTORY) ghi OrgUnitId; chiều giá trị (LINE từ MES_Core/0009: mã bộ phận chuyền) ghi ScopeValue
    const dimByOrg = new Map((await db.selectFrom('SysScopeDimension').select(['Code', 'OrgType']).execute()).map((d) => [d.Code, d.OrgType !== null]));
    // Không dữ liệu mẫu: chỉ admin để đăng nhập lần đầu; người dùng thật tạo ở màn Người dùng
    for (const u of sampleData ? users : users.filter((x) => x.username === 'admin')) {
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
      if (!isNew && !syncMatrix) {
        // Chỉ ĐVCS vừa tạo ở lần chạy này (máy demo: migrate tạo admin chỉ có A00, seed sau đó mới thêm ĐVCS mẫu).
        // Thứ đã có từ trước thì quản trị có thể đã thu hồi: không cấp lại
        const newBranches = u.branches.filter((bc) => createdBranches.has(bc) && branchId.has(bc));
        if (newBranches.length) {
          const hasDefault = await db.selectFrom('SysUserBranch').select('Id').where('UserId', '=', row.Id).where('IsDefault', '=', true).executeTakeFirst();
          for (const bc of newBranches) {
            await db.insertInto('SysUserBranch').values({ UserId: row.Id, BranchId: branchId.get(bc)!, IsDefault: !hasDefault && bc === u.defaultBranch } as any).execute();
            bump('gán đơn vị cơ sở');
          }
        }
        if (newBranches.length) newGrants.push({ username: u.username, branches: newBranches });
        // Vai trò gán thêm của tài khoản đã có (Toàn quyền cho admin) gán ở bước 9b, chỉ lần tạo vai trò
        continue;
      }
      // Tra đủ phạm vi trước khi gán vai trò: thiếu đơn vị thì không gán (vai trò không kèm phạm vi là không giới hạn).
      // Chiều giá trị nhận mã ở `value` hoặc `org` (phạm vi chuyền mẫu ghi mã chuyền, trước 5.10 là nút cây tổ chức cùng mã); mã chưa
      // là chuyền đang dùng thì phạm vi vẫn ghi, chỉ không có tác dụng (đóng an toàn)
      const scopes = (u.scopes ?? []).map((s) =>
        dimByOrg.get(s.dimension) === false
          ? { ...s, oid: null, value: s.value ?? s.org ?? null }
          : { ...s, oid: s.org ? orgId.get(s.org) : null, value: s.value ?? null },
      );
      const missing = scopes.filter((s) => s.oid === undefined || !dims.has(s.dimension) || (s.mode === 'LIST' && s.oid === null && !s.value)).map((s) => s.org ?? s.value ?? s.dimension);
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
        // ĐVCS mẫu chưa có (máy không dữ liệu mẫu, BRAVO chưa đồng bộ) thì bỏ qua: gán sau ở màn Người dùng
        for (const bc of u.branches) {
          const bid = branchId.get(bc);
          if (bid === undefined) continue;
          const has = await trx.selectFrom('SysUserBranch').select('Id').where('UserId', '=', row.Id).where('BranchId', '=', bid).executeTakeFirst();
          if (!has) {
            await trx.insertInto('SysUserBranch').values({ UserId: row.Id, BranchId: bid, IsDefault: bc === u.defaultBranch } as any).execute();
            bump('gán đơn vị cơ sở');
          }
        }
        for (const s of scopes) {
          const did = dims.get(s.dimension)!;
          const oid = s.oid ?? null;
          let q = trx.selectFrom('SysUserRoleScope').select('Id').where('UserRoleId', '=', ur.Id).where('DimensionId', '=', did).where('ScopeMode', '=', s.mode);
          q = oid === null ? q.where('OrgUnitId', 'is', null) : q.where('OrgUnitId', '=', oid);
          q = s.value === null ? q.where('ScopeValue', 'is', null) : q.where('ScopeValue', '=', s.value);
          if (!(await q.executeTakeFirst())) {
            await trx.insertInto('SysUserRoleScope').values({ UserRoleId: ur.Id, DimensionId: did, ScopeMode: s.mode, OrgUnitId: oid, ScopeValue: s.value } as any).execute();
            bump('phạm vi');
          }
        }
        // Vai trò gán thêm (Toàn quyền, ADR 0014), cả khi --sync-matrix: cùng điều kiện với lần tạo vai trò, không nới quyền của
        // tài khoản quản trị đã bị giới hạn (vai trò chính có phạm vi) hay vô hiệu hóa
        for (const rc of u.extraRoles ?? []) {
          const blocked = await extraRoleBlocked(trx, row.Id, u.role);
          if (blocked) {
            console.warn(`Không gán vai trò ${rc} cho ${u.username}: ${blocked}. Gán ở Quản trị › Người dùng nếu cần.`);
            continue;
          }
          if (await addRole(row.Id, rc, trx)) newGrants.push({ username: u.username, branches: [], roles: [rc] });
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
      if (!sampleData) console.log('Không nạp dữ liệu mẫu: chỉ tạo tài khoản admin nếu chưa có; không tài khoản demo, đơn hàng giả, phòng ban và nhân viên giả.');
      // 11. Dữ liệu đơn hàng giả trong MES_Order: chỉ cho nhà máy chưa có đơn hàng nào
      if (sampleData) {
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

      // 13. Nhân sự trong MES_Hr: loại phòng ban, chức danh dùng chung luôn nạp; phòng ban, nhân viên giả chỉ khi có dữ liệu mẫu.
      // Thêm phần còn thiếu theo mã; nhân viên chỉ khi bảng còn trống. Máy chưa tạo MES_Hr thì bỏ qua
      for (const [k, v] of Object.entries(await seedHrIfReady({ sample: sampleData }))) bump(k, v);
    }

    await sql`UPDATE dbo.SysPermissionVersion SET Version = Version + 1, ModifiedAt = SYSUTCDATETIME() WHERE Id = 1`.execute(db);
    // Seed cũng cấp quyền và đổi mật khẩu nên phải để lại dấu vết trong nhật ký.
    if (Object.keys(stats).length) {
      await db
        .insertInto('SysAuditLog')
        .values({ EntityType: 'System', ActionCode: 'SEED', NewValue: JSON.stringify({ by, syncMatrix, resetPasswords, sampleData: !coreOnly && sampleData, stats, ...(scopeChanges.length ? { scopeChanges } : {}), ...(newGrants.length ? { newGrants } : {}) }) } as any)
        .execute();
    }
    console.log('Seed xong:', Object.keys(stats).length ? stats : 'không có gì mới');
  } finally {
    await db.destroy();
  }
}

/**
 * Lý do tài khoản không nhận vai trò gán thêm không phạm vi (ADR 0014), hoặc null khi được: phải đang hoạt động và đang giữ
 * vai trò chính không kèm phạm vi, còn hiệu lực. Tài khoản quản trị đã bị cố ý hạ quyền thì không nhận lại quyền qua seed.
 */
async function extraRoleBlocked(db: Kysely<CoreDatabase>, userId: number, mainRole: string): Promise<string | null> {
  const user = await db.selectFrom('SysUser').select('IsActive').where('Id', '=', userId).executeTakeFirst();
  if (!user?.IsActive) return 'tài khoản đã bị vô hiệu hóa';
  const now = new Date();
  const main = await db
    .selectFrom('SysUserRole as ur')
    .innerJoin('SysRole as r', 'r.Id', 'ur.RoleId')
    .select('ur.Id')
    .where('ur.UserId', '=', userId)
    .where('r.Code', '=', mainRole)
    .where((eb) => eb.or([eb('ur.ValidFromAt', 'is', null), eb('ur.ValidFromAt', '<=', now)]))
    .where((eb) => eb.or([eb('ur.ValidToAt', 'is', null), eb('ur.ValidToAt', '>', now)]))
    .where((eb) => eb.not(eb.exists(eb.selectFrom('SysUserRoleScope as s').select('s.Id').whereRef('s.UserRoleId', '=', 'ur.Id'))))
    .executeTakeFirst();
  return main ? null : `tài khoản không còn giữ ${mainRole} không giới hạn`;
}

/** ADMIN đang có quyền này trong DB (quyền quản trị của Toàn quyền không vượt ADMIN, ADR 0014) */
async function adminRoleHas(db: Kysely<CoreDatabase>, permissionId: number) {
  const row = await db
    .selectFrom('SysRolePermission as rp')
    .innerJoin('SysRole as r', 'r.Id', 'rp.RoleId')
    .select('rp.Id')
    .where('r.Code', '=', 'ADMIN')
    .where('rp.PermissionId', '=', permissionId)
    .executeTakeFirst();
  return !!row;
}

/**
 * Tạo vai trò Toàn quyền một lần (ADR 0014), trong transaction của bên gọi: vai trò, quyền (mọi hành động nghiệp vụ; quyền quản
 * trị chỉ những quyền ADMIN đang có trong DB, để người giữ ADMIN gán, sửa được vai trò này: trần quyền ADR 0004), chính sách cột,
 * phép gán cho tài khoản khai `extraRoles`, nhật ký, tăng phiên bản quyền. Lỗi giữa chừng thì không còn gì, lần seed sau làm lại.
 * Chỉ gán khi tài khoản đang hoạt động và đang giữ vai trò chính (ADMIN) không kèm phạm vi, còn hiệu lực: tài khoản quản trị đã
 * bị hạ quyền thì không nhận lại quyền qua đường này. Vai trò đã có thì không làm gì: quản trị gỡ rồi thì seed chạy lại không gán lại.
 */
export async function bootstrapFullAccess(
  trx: Transaction<CoreDatabase>,
  opts: { by?: string; accounts?: typeof users; assign?: boolean } = {},
) {
  const { by = 'scripts/seed.ts', accounts = users, assign = true } = opts;
  if (await trx.selectFrom('SysRole').select('Id').where('Code', '=', FULL_ACCESS_ROLE).executeTakeFirst()) return null;
  const def = roles.find((r) => r.code === FULL_ACCESS_ROLE)!;
  const role = await trx
    .insertInto('SysRole')
    .values({ Code: def.code, Name: def.name, Description: def.description, SortOrder: (roles.indexOf(def) + 1) * 10, IsActive: true, IsSystem: true } as any)
    .output('inserted.Id')
    .executeTakeFirstOrThrow();

  const byCode = new Map(resources.map((r) => [r.code, r]));
  const perms = await trx.selectFrom('SysPermission as p').innerJoin('SysResource as r', 'r.Id', 'p.ResourceId').select(['p.Id', 'p.Code', 'r.Code as ResourceCode']).execute();
  const adminRole = await trx.selectFrom('SysRole').select('Id').where('Code', '=', 'ADMIN').executeTakeFirst();
  const adminPerms = new Set(adminRole ? (await trx.selectFrom('SysRolePermission').select('PermissionId').where('RoleId', '=', adminRole.Id).execute()).map((p) => p.PermissionId) : []);
  const wanted = perms.filter((p) => {
    const r = byCode.get(p.ResourceCode);
    if (!r) return false;
    const action = p.Code.slice(p.Code.lastIndexOf(':') + 1);
    if (![...fullAccessLetters(r)].some((l) => LETTER[l] === action)) return false;
    return !r.code.startsWith('admin.') || adminPerms.has(p.Id);
  });
  for (let i = 0; i < wanted.length; i += 500) {
    await trx.insertInto('SysRolePermission').values(wanted.slice(i, i + 500).map((p) => ({ RoleId: role.Id, PermissionId: p.Id })) as any).execute();
  }

  const resourceId = new Map((await trx.selectFrom('SysResource').select(['Id', 'Code']).execute()).map((r) => [r.Code, r.Id]));
  const fields = new Set((await trx.selectFrom('SysResourceField').select(['ResourceId', 'Code']).execute()).map((f) => `${f.ResourceId}.${f.Code}`));
  const policies = roleFieldPolicies
    .filter((p) => p.role === FULL_ACCESS_ROLE && resourceId.has(p.resource) && fields.has(`${resourceId.get(p.resource)}.${p.field}`))
    .map((p) => ({ SubjectType: 'ROLE', SubjectId: role.Id, ResourceId: resourceId.get(p.resource)!, FieldCode: p.field, AccessLevel: p.level }));
  if (policies.length) await trx.insertInto('SysFieldPolicy').values(policies as any).execute();

  const grantedTo: string[] = [];
  const skipped: string[] = [];
  // --sync-matrix (reset-demo xóa phép gán trước): bước 10 gán, cùng điều kiện
  for (const u of assign ? accounts.filter((x) => x.extraRoles?.includes(FULL_ACCESS_ROLE)) : []) {
    const user = await trx.selectFrom('SysUser').select('Id').where('Username', '=', u.username).executeTakeFirst();
    if (!user) continue; // máy cài mới: tài khoản tạo ở bước 10, gán kèm vai trò chính
    const blocked = await extraRoleBlocked(trx, user.Id, u.role);
    if (blocked) {
      skipped.push(`Không gán vai trò Toàn quyền cho ${u.username}: ${blocked}. Gán ở Quản trị › Người dùng nếu cần.`);
      continue;
    }
    await trx.insertInto('SysUserRole').values({ UserId: user.Id, RoleId: role.Id } as any).execute();
    grantedTo.push(u.username);
  }

  await trx
    .insertInto('SysAuditLog')
    .values({
      EntityType: 'SysRole',
      EntityId: String(role.Id),
      ActionCode: 'SEED',
      NewValue: JSON.stringify({ by, role: FULL_ACCESS_ROLE, permissions: wanted.length, fieldPolicies: policies.length, grantedTo, ...(skipped.length ? { skipped } : {}) }),
    } as any)
    .execute();
  await sql`UPDATE dbo.SysPermissionVersion SET Version = Version + 1, ModifiedAt = SYSUTCDATETIME() WHERE Id = 1`.execute(trx);
  return { roleId: role.Id, permissions: wanted.length, fieldPolicies: policies.length, grantedTo, skipped };
}

if (require.main === module) {
  runSeed({
    resetPasswords: process.argv.includes('--reset-passwords'),
    syncMatrix: process.argv.includes('--sync-matrix'),
    ...(process.argv.includes('--no-sample-data') ? { sampleData: false } : {}),
  }).catch((e) => {
    console.error('Seed lỗi:', e.message ?? e);
    process.exit(1);
  });
}
