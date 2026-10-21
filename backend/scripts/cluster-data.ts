// Dữ liệu giả lập của màn Phân cụm trưởng (phase 5.18) cho seed, reset-demo: tổ, tổ trưởng, cụm theo mã hàng thay cho dữ liệu GSD tới khi
// nối GSD (SourceSystem = 'DEMO'), cùng nhân viên tổ trưởng mẫu và việc gắn tài khoản mẫu với nhân viên (SysUser.EmployeeId).
import { sql, type Kysely } from 'kysely';
import { env } from '../src/config/env';
import { createDb } from '../src/platform/database/db';
import type { CoreDatabase } from '../src/platform/database/core.types';
import type { HrDatabase } from '../src/modules/hr/hr.types';
import type { OrderDatabase } from '../src/modules/order/order.types';
import type { SewingDatabase } from '../src/modules/sewing/sewing.types';
import { hrDbState } from './hr-data';
import { assertDemoMachine } from './local-db';
import { clusterDemo, HR_FAMILY, HR_GIVEN, HR_MIDDLE, hrDepartments, hrStaffing, users } from './seed-data';
import { hasSewingDb } from './sewing-data';

/** Số mã hàng mỗi tổ mẫu (lấy mã đã xếp vào chuyền ở Xếp chuyền, mới nhất trước; thiếu thì sinh mã mẫu) */
const STYLES_PER_TEAM = 3;

/** Bảng của Phân cụm trưởng (MES_Sewing/0005) đã có chưa: máy chưa chạy migration mới thì bỏ qua */
async function hasClusterTables(db: Kysely<SewingDatabase>): Promise<boolean> {
  const r = await sql<{ id: number | null }>`SELECT OBJECT_ID('dbo.SewingTeam') AS id`.execute(db);
  return r.rows[0]?.id != null;
}

/** Tên công nhân mẫu thứ n: sinh xác định để seed chạy lại trên database trống cho cùng tên */
function workerName(n: number): { fullName: string; gender: 1 | 2 } {
  const gender = (n % 3 === 0 ? 1 : 2) as 1 | 2;
  const family = HR_FAMILY[(n * 7) % HR_FAMILY.length];
  const middle = HR_MIDDLE[gender][(n * 5) % HR_MIDDLE[gender].length];
  const given = HR_GIVEN[gender][(n * 11) % HR_GIVEN[gender].length];
  return { fullName: `${family} ${middle} ${given}`, gender };
}

/** Cụm của mã hàng thứ k ở tổ thứ i: 8–10 cụm, giữ cụm đầu (Cấp BTP) và cụm cuối (Ủi), bớt vài cụm giữa cho các mã khác nhau */
function clustersFor(i: number, k: number): [string, string][] {
  const all = clusterDemo.clusters;
  const drop = (i + k) % 3;
  const middle = all.slice(1, -1).filter((_, j) => !(drop > 0 && (j === 2 || (drop > 1 && j === 5))));
  return [all[0], ...middle, all[all.length - 1]];
}

/** Nhân viên mẫu của Phân cụm trưởng: tổ trưởng (`clusterDemo.leaders`) và công nhân theo chuyền (mã NV21xx) */
function demoEmployees() {
  return [
    ...clusterDemo.leaders.map((e) => ({ ...e, title: 'TT' })),
    ...Object.entries(clusterDemo.workers).flatMap(([department, count], li) =>
      Array.from({ length: count }, (_, k) => {
        const n = li * 20 + k + 1;
        return { code: `NV${2100 + n}`, ...workerName(n), department, title: 'CNM' };
      }),
    ),
  ];
}

/** Mã nhân viên do seed sinh: 40 nhân viên giả của hr-data.ts (NV1001…, theo hrStaffing) cộng nhân viên mẫu của Phân cụm trưởng */
function seededCodes(): Set<string> {
  const total = hrStaffing.reduce((n, s) => n + s.count, 0);
  return new Set([...Array.from({ length: total }, (_, i) => `NV${1001 + i}`), ...demoEmployees().map((e) => e.code)]);
}

/**
 * Nạp dữ liệu mẫu của Phân cụm trưởng, chỉ thêm phần còn thiếu (chạy lại an toàn, review 5.18 M2, M3):
 * 1. nhân viên mẫu theo mã, ở chuyền mẫu đang dùng, chỉ khi bảng nhân viên chỉ có nhân viên do seed sinh (có người nhập thật thì không
 *    thêm người giả vào danh sách nhân sự);
 * 2. gắn tài khoản mẫu với nhân viên khi tài khoản chưa gắn ai, nhân viên chưa gắn tài khoản khác, và: nhân viên vừa tạo ở lần chạy này,
 *    tài khoản vừa tạo, hoặc `--sync-matrix`. Quản trị đã gỡ thì chạy lại không gắn lại (như bước 10 của seed);
 * 3. mỗi chuyền mẫu (khai ở seed-data, không phải chuyền người dùng thêm) đang dùng, chưa có tổ: tổ, tổ trưởng theo
 *    `clusterDemo.teamLeaders` (không có thì tổ không có tổ trưởng), 3 mã hàng × 8–10 cụm; tổ của tài khoản mẫu có sẵn cụm trưởng cho vài
 *    cụm của mã đầu (thấy dữ liệu đã lưu), các cụm khác để trống cho người thử tự phân.
 * Máy chưa có MES_Sewing, MES_Hr hoặc chưa chạy MES_Sewing/0005 thì bỏ qua kèm cảnh báo.
 */
export async function seedClusterDemo(
  core: Kysely<CoreDatabase>,
  sampleBranches: string[],
  { syncMatrix = false, newUsers = new Set<string>() }: { syncMatrix?: boolean; newUsers?: Set<string> } = {},
): Promise<Record<string, number>> {
  const stats: Record<string, number> = {};
  const bump = (k: string, n = 1) => (stats[k] = (stats[k] ?? 0) + n);
  if (!(await hasSewingDb()) || (await hrDbState()) !== 'ready') {
    console.warn(`Chưa có ${env.db.sewingName} hoặc ${env.db.hrName} sẵn sàng: bỏ qua dữ liệu mẫu Phân cụm trưởng.`);
    return stats;
  }
  const sewing = createDb<SewingDatabase>(env.db.sewingName);
  const hr = createDb<HrDatabase>(env.db.hrName);
  const order = createDb<OrderDatabase>(env.db.orderName);
  try {
    if (!(await hasClusterTables(sewing))) {
      console.warn(`${env.db.sewingName} chưa chạy migration 0005 (Phân cụm trưởng): bỏ qua dữ liệu mẫu. Chạy npm run migrate rồi seed lại.`);
      return stats;
    }
    const sampleLines = new Set(hrDepartments.filter((d) => d.productionWorkshop).map((d) => d.code));
    const lines = (
      await hr
        .selectFrom('Department')
        .select(['Id', 'Code', 'BranchCode'])
        .where('IsProductionWorkshop', '=', true)
        .where('IsActive', '=', true)
        .where('BranchCode', 'in', sampleBranches.length ? sampleBranches : [''])
        .orderBy('BranchCode')
        .orderBy('Code')
        .execute()
    ).filter((l) => sampleLines.has(l.Code));
    const lineByCode = new Map(lines.map((l) => [l.Code, l]));
    const titles = new Map((await hr.selectFrom('JobTitle').select(['Id', 'Code']).execute()).map((t) => [t.Code, t.Id]));

    // 1. Nhân viên mẫu theo mã, chỉ khi danh sách nhân sự toàn là dữ liệu do seed sinh
    const wanted = demoEmployees();
    const seeded = seededCodes();
    const foreign = (await hr.selectFrom('Employee').select('Code').execute()).filter((e) => !seeded.has(e.Code)).length;
    const have = new Set((await hr.selectFrom('Employee').select('Code').where('Code', 'in', wanted.map((w) => w.code)).execute()).map((r) => r.Code));
    const created = new Set<string>();
    if (foreign > 0 && wanted.some((w) => !have.has(w.code))) {
      console.warn(`${env.db.hrName} có ${foreign} nhân viên ngoài dữ liệu mẫu: không thêm nhân viên mẫu của Phân cụm trưởng. Gắn nhân viên cho tài khoản ở Quản trị › Người dùng.`);
    }
    for (const w of foreign > 0 ? [] : wanted) {
      const dept = lineByCode.get(w.department);
      const title = titles.get(w.title);
      if (have.has(w.code) || !dept || !title) continue;
      await hr
        .insertInto('Employee')
        .values({
          Code: w.code,
          TimekeepingCode: w.code,
          FullName: w.fullName,
          Gender: w.gender,
          DepartmentId: dept.Id,
          JobTitleId: title,
          EmploymentStatus: 1,
          StartDate: '2019-03-01',
          TimekeepingName: w.fullName.split(' ').slice(-2).join(' '),
          StaffType: 'Chính thức',
          IsTimekeepingAllowed: true,
          Ethnicity: 'Kinh',
          Nationality: 'Việt Nam',
          CreatedBy: null,
        })
        .execute();
      created.add(w.code);
      bump('nhân viên mẫu (Phân cụm trưởng)');
    }
    const employees = new Map(
      (await hr.selectFrom('Employee').select(['Id', 'Code', 'DepartmentId', 'EmploymentStatus']).where('Code', 'in', wanted.map((w) => w.code)).execute()).map((e) => [e.Code, e]),
    );

    // 2. Tài khoản mẫu ↔ nhân viên
    for (const u of users.filter((x) => x.employee)) {
      const emp = employees.get(u.employee!);
      if (!emp || emp.EmploymentStatus !== 1 || !(created.has(u.employee!) || newUsers.has(u.username) || syncMatrix)) continue;
      const taken = await core.selectFrom('SysUser').select('Id').where('EmployeeId', '=', emp.Id).executeTakeFirst();
      if (taken) continue;
      const r = await core.updateTable('SysUser').set({ EmployeeId: emp.Id, ModifiedAt: new Date() }).where('Username', '=', u.username).where('EmployeeId', 'is', null).executeTakeFirst();
      if (Number(r.numUpdatedRows)) bump('gắn tài khoản với nhân viên');
    }

    // 3. Tổ, tổ trưởng, cụm
    const teams = new Set((await sewing.selectFrom('SewingTeam').select(['BranchCode', 'LineCode']).execute()).map((t) => `${t.BranchCode}|${t.LineCode}`));
    const now = new Date();
    for (const [i, line] of lines.entries()) {
      const branch = line.BranchCode!;
      if (teams.has(`${branch}|${line.Code}`)) continue;
      const styles = await order
        .selectFrom('ShipmentPlanLine as l')
        .innerJoin('ShipmentPlan as p', (j) => j.onRef('p.Id', '=', 'l.ShipmentPlanId').onRef('p.BranchCode', '=', 'l.BranchCode'))
        .select('p.StyleCode')
        .select(sql<Date>`MAX(l.StartDate)`.as('LastStart'))
        .where('l.BranchCode', '=', branch)
        .where('l.LineCode', '=', line.Code)
        .groupBy('p.StyleCode')
        .orderBy(sql`MAX(l.StartDate)`, 'desc')
        .orderBy('p.StyleCode')
        .offset(0)
        .fetch(STYLES_PER_TEAM)
        .execute()
        .then((rows) => rows.map((r) => r.StyleCode))
        .catch(() => [] as string[]);
      for (let k = styles.length; k < STYLES_PER_TEAM; k++) styles.push(`${line.Code}-MH${k + 1}`);

      await sewing.transaction().execute(async (trx) => {
        const team = await trx
          .insertInto('SewingTeam')
          .values({ LineCode: line.Code, SourceSystem: 'DEMO', SourceKey: null, SourceSyncedAt: now, BranchCode: branch, CreatedBy: null })
          .output('inserted.Id')
          .executeTakeFirstOrThrow();
        // Chỉ tổ trưởng khai sẵn: không tự chọn người của ĐVCS (có thể là nhân viên văn phòng, người dùng nhập), review 5.18 M3
        const leaderIds = (clusterDemo.teamLeaders[line.Code] ?? []).map((c) => employees.get(c)?.Id).filter((x): x is number => x != null);
        for (const id of leaderIds) {
          await trx.insertInto('SewingTeamLeader').values({ SewingTeamId: team.Id, EmployeeId: id, SourceKey: null, SourceSyncedAt: now, BranchCode: branch, CreatedBy: null }).execute();
          bump('tổ trưởng mẫu');
        }
        // Cụm trưởng có sẵn: công nhân mẫu của chuyền, cho vài cụm của mã đầu (tổ của tài khoản mẫu)
        const workers = [...employees.values()].filter((e) => e.DepartmentId === line.Id && e.EmploymentStatus === 1 && e.Code.startsWith('NV21'));
        const rows = styles.flatMap((style, k) =>
          clustersFor(i, k).map(([code, name], j) => {
            const leader = k === 0 && j < 3 ? workers[j] : undefined;
            return {
              SewingTeamId: team.Id,
              StyleCode: style,
              StyleLabel: `${clusterDemo.levels[(i + k) % clusterDemo.levels.length]}/${clusterDemo.seasons[(i + k) % clusterDemo.seasons.length]}`,
              Code: code,
              Name: name,
              SortOrder: (j + 1) * 10,
              SourceKey: null,
              SourceSyncedAt: now,
              LeaderEmployeeId: leader?.Id ?? null,
              LeaderEmployeeCode: leader?.Code ?? null,
              BranchCode: branch,
              CreatedBy: null,
            };
          }),
        );
        await trx.insertInto('SewingTeamCluster').values(rows).execute();
        bump('tổ mẫu (Phân cụm trưởng)');
        bump('cụm mẫu', rows.length);
      });
    }
    return stats;
  } finally {
    await Promise.all([sewing.destroy(), hr.destroy(), order.destroy()]);
  }
}

/**
 * reset:demo: xóa toàn bộ tổ, tổ trưởng, cụm của Phân cụm trưởng (dòng con xóa theo), vì nhân viên bị xóa và đánh số lại (clearHr); seed
 * nạp lại bản mẫu. Chỉ máy demo. Trả số tổ đã xóa.
 */
export async function clearClusterData(): Promise<number> {
  assertDemoMachine('xóa dữ liệu Phân cụm trưởng');
  if (!(await hasSewingDb())) return 0;
  const db = createDb<SewingDatabase>(env.db.sewingName);
  try {
    if (!(await hasClusterTables(db))) return 0;
    const r = await db.deleteFrom('SewingTeam').executeTakeFirst();
    return Number(r.numDeletedRows);
  } finally {
    await db.destroy();
  }
}
