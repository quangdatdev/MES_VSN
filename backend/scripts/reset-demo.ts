// Đưa dữ liệu demo về trạng thái ban đầu trước mỗi buổi demo.
// Dùng: npm run reset:demo -- --yes            (đơn hàng giả của seed)
//       npm run reset:demo -- --yes --bravo    (đơn hàng thật nạp từ bảng chép BRAVO trong MES_Sync, xem load-bravo-orders.ts)
// Chỉ dùng cho database demo có dữ liệu giả. KHÔNG chạy lên database thật hoặc dùng chung.
//
// Việc script làm:
//  - MES_Order: xóa toàn bộ dữ liệu đơn hàng (đơn, PO, kế hoạch, dàn chuyền, phân màu cỡ), nạp lại dữ liệu mẫu.
//  - MES_Hr: xóa loại phòng ban, phòng ban, chức danh, nhân viên rồi nạp lại dữ liệu nhân sự giả (Id đổi).
//  - MES_Core: tên nhà máy, vai trò, ma trận quyền, chính sách cột của vai trò mẫu, danh mục hệ thống (xưởng, chuyền, đơn vị tính,
//    loại đơn hàng, nhà máy sản xuất, ca làm việc), tài khoản demo (họ tên, mật khẩu,
//    vai trò, phạm vi, ngoại lệ, cột riêng, nhà máy) về như seed; nhà máy, vai trò, người dùng tạo thêm khi demo bị
//    vô hiệu hóa (không xóa vật lý); thu hồi mọi phiên đăng nhập.
//  - Nhật ký SysAuditLog giữ nguyên (chỉ ghi thêm), có thêm một dòng DEMO_RESET.
import { env } from '../src/config/env';
import { createDb } from '../src/platform/database/db';
import type { CoreDatabase } from '../src/platform/database/core.types';
import type { OrderDatabase } from '../src/modules/order/order.types';
import { clearHr, hrDbState } from './hr-data';
import { clearOrderData, loadBravoOrders } from './load-bravo-orders';
import { assertLocalDb } from './local-db';
import { clearSewingPrep } from './sewing-data';
import { runSeed } from './seed';
import { LINE_COUNT, WORKSHOPS, branches, catalogSeedItems, catalogs, lineCode, roles, shifts, users, workshopCode, workshopName, workshopOfLine } from './seed-data';

async function main() {
  assertLocalDb('reset-demo');
  if (!process.argv.includes('--yes')) {
    console.log(
      [
        'Lệnh này đưa dữ liệu demo về ban đầu:',
        `  - xóa mọi dữ liệu đơn hàng trong ${env.db.orderName} rồi nạp lại dữ liệu mẫu (--bravo: dữ liệu thật từ ${env.db.syncName});`,
        `  - xóa Kế hoạch chuẩn bị SX trong ${env.db.sewingName} (ngày đã nhập; danh mục bước giữ nguyên);`,
        `  - xóa loại phòng ban, phòng ban, chức danh, hồ sơ nhân viên trong ${env.db.hrName} rồi nạp lại dữ liệu nhân sự giả;`,
        `  - đặt lại nhà máy, vai trò, quyền, chính sách cột và tài khoản demo trong ${env.db.coreName} (máy chủ ${env.db.host});`,
        '  - vô hiệu hóa người dùng, vai trò, nhà máy tạo thêm; thu hồi mọi phiên đăng nhập.',
        'Chỉ dùng cho database demo. Chạy lại với: npm run reset:demo -- --yes',
      ].join('\n'),
    );
    return;
  }
  if (!env.demoPassword) throw new Error('Thiếu DEMO_PASSWORD trong backend/.env.');
  // Kiểm trước khi chạm MES_Core: database đã tạo mà chưa migrate thì dừng ngay, không để demo mất ma trận quyền giữa chừng
  if ((await hrDbState()) === 'unmigrated') {
    throw new Error(`Database ${env.db.hrName} đã tạo nhưng chưa chạy migration. Chạy npm run migrate trước, rồi chạy lại lệnh này.`);
  }

  const core = createDb<CoreDatabase>(env.db.coreName);
  const order = createDb<OrderDatabase>(env.db.orderName);
  try {
    const branchCodes = branches.map((b) => b.code);
    const roleCodes = roles.map((r) => r.code);
    const usernames = users.map((u) => u.username);
    const now = new Date();

    await core.transaction().execute(async (trx) => {
      for (const b of branches) {
        await trx.updateTable('SysBranch').set({ Name: b.name, IsActive: true, ModifiedAt: now }).where('Code', '=', b.code).execute();
      }
      await trx.updateTable('SysBranch').set({ IsActive: false, ModifiedAt: now }).where('Code', 'not in', branchCodes).execute();

      for (const r of roles) {
        await trx.updateTable('SysRole').set({ Name: r.name, Description: r.description, IsActive: true, ModifiedAt: now }).where('Code', '=', r.code).execute();
      }
      await trx.updateTable('SysRole').set({ IsActive: false, ModifiedAt: now }).where('Code', 'not in', roleCodes).execute();
      // Xóa gán quyền và chính sách cột của vai trò mẫu; seed nạp lại đúng ma trận trong seed-data.ts
      const seedRoleIds = trx.selectFrom('SysRole').select('Id').where('Code', 'in', roleCodes);
      await trx.deleteFrom('SysRolePermission').where('RoleId', 'in', seedRoleIds).execute();
      await trx.deleteFrom('SysFieldPolicy').where('SubjectType', '=', 'ROLE').where('SubjectId', 'in', seedRoleIds).execute();

      const seedUserIds = trx.selectFrom('SysUser').select('Id').where('Username', 'in', usernames);
      // Phạm vi trước phép gán (không có xóa dây chuyền ở DB), rồi ngoại lệ và cột riêng của tài khoản mẫu
      await trx
        .deleteFrom('SysUserRoleScope')
        .where('UserRoleId', 'in', trx.selectFrom('SysUserRole').select('Id').where('UserId', 'in', seedUserIds))
        .execute();
      await trx.deleteFrom('SysUserPermissionOverride').where('UserId', 'in', seedUserIds).execute();
      await trx.deleteFrom('SysFieldPolicy').where('SubjectType', '=', 'USER').where('SubjectId', 'in', seedUserIds).execute();
      await trx.deleteFrom('SysUserRole').where('UserId', 'in', seedUserIds).execute();
      await trx.deleteFrom('SysUserBranch').where('UserId', 'in', seedUserIds).execute();
      for (const u of users) {
        await trx
          .updateTable('SysUser')
          .set({ FullName: u.fullName, IsActive: true, FailedLoginCount: 0, LockedUntilAt: null, ModifiedAt: now })
          .where('Username', '=', u.username)
          .execute();
      }
      await trx.updateTable('SysUser').set({ IsActive: false, ModifiedAt: now }).where('Username', 'not in', usernames).execute();
      await trx.updateTable('SysUserSession').set({ RevokedAt: now }).where('RevokedAt', 'is', null).execute();

      // Danh mục hệ thống về như seed: xưởng, chuyền, mục danh mục, ca mẫu bật lại đúng tên; phần tạo thêm khi demo ngừng dùng
      // (không xóa). Chuyền mẫu về đúng xưởng mẫu (xưởng mẫu chưa có thì seed bên dưới tạo rồi nhận chuyền). Kế hoạch mẫu xếp vào
      // chuyền mẫu nên chuyền mẫu phải đang dùng; chuyền tạo thêm ngừng trước xưởng tạo thêm (chuyền đang dùng phải ở xưởng đang dùng).
      const workshopCodes = Object.entries(WORKSHOPS).flatMap(([b, list]) => list.map((_, i) => workshopCode(b, i + 1)));
      for (const code of workshopCodes) {
        const n = Number(code.slice(-2));
        await trx.updateTable('SysOrgUnit').set({ Name: workshopName(n), Description: null, SortOrder: n, IsActive: true, ModifiedAt: now }).where('Code', '=', code).where('OrgType', '=', 'WORKSHOP').execute();
      }
      const parents = new Map((await trx.selectFrom('SysOrgUnit').select(['Id', 'Code', 'Path', 'OrgType']).where('OrgType', 'in', ['FACTORY', 'WORKSHOP']).execute()).map((u) => [u.Code, u]));
      const lineCodes: string[] = [];
      for (const b of branches) {
        for (let n = 1; n <= (LINE_COUNT[b.code] ?? 0); n++) {
          const code = lineCode(b.code, n);
          lineCodes.push(code);
          const w = workshopOfLine(b.code, n);
          const parent = (w ? parents.get(workshopCode(b.code, w)) : undefined) ?? parents.get(b.code);
          const place = parent ? { ParentId: parent.Id, ParentOrgType: parent.OrgType, Path: `${parent.Path}${code}/` } : {};
          // Chỉ đơn vị loại chuyền: mã chuyền mẫu có thể bị một xưởng tự tạo dùng mất (API chỉ kiểm tiền tố nhà máy)
          await trx.updateTable('SysOrgUnit').set({ Name: `Chuyền ${code.slice(-2)}`, Description: null, SortOrder: n, IsActive: true, ...place, ModifiedAt: now }).where('Code', '=', code).where('OrgType', '=', 'LINE').execute();
        }
      }
      await trx.updateTable('SysOrgUnit').set({ IsActive: false, ModifiedAt: now }).where('OrgType', '=', 'LINE').where('Code', 'not in', lineCodes).execute();
      await trx.updateTable('SysOrgUnit').set({ IsActive: false, ModifiedAt: now }).where('OrgType', '=', 'WORKSHOP').where('Code', 'not in', workshopCodes).execute();
      const seedFactories = branches.filter((b) => !b.isAggregate);
      for (const c of catalogs) {
        const cat = await trx.selectFrom('SysCatalog').select('Id').where('Code', '=', c.code).executeTakeFirst();
        if (!cat) continue;
        const items = catalogSeedItems(c, seedFactories);
        for (const [j, [code, name]] of items.entries()) {
          await trx.updateTable('SysCatalogItem').set({ Name: name, Description: null, SortOrder: (j + 1) * 10, IsActive: true, ModifiedAt: now }).where('CatalogId', '=', cat.Id).where('Code', '=', code).execute();
        }
        const keep = items.map(([code]) => code);
        await trx.updateTable('SysCatalogItem').set({ IsActive: false, ModifiedAt: now }).where('CatalogId', '=', cat.Id).where('Code', 'not in', keep).execute();
      }
      for (const [i, [code, name, start, end, breakMinutes]] of shifts.entries()) {
        await trx
          .updateTable('SysShift')
          .set({ Name: name, Description: null, StartTime: start, EndTime: end, BreakMinutes: breakMinutes, SortOrder: (i + 1) * 10, IsActive: true, ModifiedAt: now })
          .where('Code', '=', code)
          .execute();
      }
      await trx.updateTable('SysShift').set({ IsActive: false, ModifiedAt: now }).where('Code', 'not in', shifts.map(([code]) => code as string)).execute();
    });

    // Không có transaction chung giữa hai database: làm MES_Order sau khi MES_Core đã xong.
    // Id dòng dàn chuyền sẽ được đánh số lại: bản chép Kế hoạch chuẩn bị SX cũ không còn đúng dòng nào (ADR 0009). Xóa trước dữ
    // liệu đơn hàng (lượt mở màn xen giữa chỉ chép lại dòng cũ, dấu phiên bản đổi sau khi nạp)
    console.log(`Đã xóa ${await clearSewingPrep()} dòng Kế hoạch chuẩn bị SX trong ${env.db.sewingName} (danh mục bước giữ nguyên).`);
    await order.transaction().execute((trx) => clearOrderData(trx));
    console.log(`Đã xóa dữ liệu đơn hàng trong ${env.db.orderName}.`);
    console.log(`Đã xóa ${await clearHr()} hồ sơ nhân viên và sơ đồ tổ chức trong ${env.db.hrName} (seed nạp lại bản mẫu).`);

    await runSeed({ resetPasswords: true, syncMatrix: true });
    // Seed vừa nạp đơn hàng giả cho mọi nhà máy; nạp BRAVO xóa chúng rồi thay bằng dữ liệu thật
    if (process.argv.includes('--bravo')) await loadBravoOrders();

    await core
      .insertInto('SysAuditLog')
      .values({ EntityType: 'System', ActionCode: 'DEMO_RESET', NewValue: JSON.stringify({ by: 'scripts/reset-demo.ts' }) } as any)
      .execute();
    console.log('Đã đưa dữ liệu demo về ban đầu. Mọi người cần đăng nhập lại.');
  } finally {
    await core.destroy();
    await order.destroy();
  }
}

main().catch((e) => {
  console.error('Khởi tạo lại lỗi:', e.message ?? e);
  process.exit(1);
});
