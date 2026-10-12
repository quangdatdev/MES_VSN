// Dữ liệu module Nhân sự (MES_Hr, Phase 5.8) cho các script seed, reset-demo.
import { sql } from 'kysely';
import { env } from '../src/config/env';
import { createDb } from '../src/platform/database/db';
import type { HrDatabase, HrDb } from '../src/modules/hr/hr.types';
import { assertDemoMachine } from './local-db';
import { HR_FAMILY, HR_GIVEN, HR_MIDDLE, HR_PROVINCES, hrDepartmentTypes, hrDepartments, hrJobTitles, hrStaffing, prng } from './seed-data';

export type HrDbState = 'missing' | 'unmigrated' | 'ready';

/**
 * Tình trạng MES_Hr: chưa có (hoặc tài khoản chưa vào được), đã tạo mà chưa chạy migration, hay sẵn sàng. Quản trị CSDL tạo database
 * trống trước rồi mới migrate: giữa hai việc đó các script phải bỏ qua phần Nhân sự, không hỏng giữa chừng (review 5.8 M2).
 */
export async function hrDbState(): Promise<HrDbState> {
  const master = createDb<any>('master');
  try {
    const r = await sql<{ ok: number }>`SELECT CASE WHEN DB_ID(${env.db.hrName}) IS NOT NULL AND HAS_DBACCESS(${env.db.hrName}) = 1 THEN 1 ELSE 0 END AS ok`.execute(master);
    if (r.rows[0]?.ok !== 1) return 'missing';
  } finally {
    await master.destroy();
  }
  const db = createDb<any>(env.db.hrName);
  try {
    const t = await sql<{ n: number }>`SELECT CASE WHEN OBJECT_ID(N'dbo.Employee', N'U') IS NOT NULL AND OBJECT_ID(N'dbo.DepartmentType', N'U') IS NOT NULL THEN 1 ELSE 0 END AS n`.execute(db);
    return t.rows[0]?.n === 1 ? 'ready' : 'unmigrated';
  } finally {
    await db.destroy();
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, n: number) => iso(new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000));

/**
 * Nạp phần còn thiếu theo mã: loại phòng ban, phòng ban, chức danh (không sửa mục đã có, người dùng có thể đã sửa ở màn hình).
 * Nhân viên giả chỉ nạp khi bảng Employee còn trống: mã nhân viên sửa được nên không dò theo mã. Trả số dòng đã thêm.
 * `sample = false` (máy dùng thật): chỉ loại phòng ban và chức danh dùng chung, vì hai danh mục này chưa có màn sửa mà thiếu thì không
 * thêm được phòng ban, nhân viên nào; bỏ phòng ban mẫu, chức danh gắn với phòng ban mẫu, nhân viên giả.
 */
export async function seedHr(db: HrDb, { sample = true }: { sample?: boolean } = {}): Promise<Record<string, number>> {
  const stats: Record<string, number> = {};
  const bump = (k: string, n = 1) => (stats[k] = (stats[k] ?? 0) + n);

  const typeId = new Map((await db.selectFrom('DepartmentType').select(['Id', 'Code']).execute()).map((t) => [t.Code, t.Id]));
  for (const [i, [code, name, level, final]] of hrDepartmentTypes.entries()) {
    if (typeId.has(code)) continue;
    // Bảng có trigger: không dùng OUTPUT, thêm rồi đọc lại theo mã
    await db.insertInto('DepartmentType').values({ Code: code, Name: name, Description: null, LevelOrder: level, IsFinalLevel: final, SortOrder: (i + 1) * 10, IsActive: true, IsSystem: true, CreatedBy: null }).execute();
    typeId.set(code, (await db.selectFrom('DepartmentType').select('Id').where('Code', '=', code).executeTakeFirstOrThrow()).Id);
    bump('loại phòng ban');
  }

  const depts = new Map((await db.selectFrom('Department').select(['Id', 'Code', 'Path']).execute()).map((d) => [d.Code, d]));
  for (const [i, d] of hrDepartments.entries()) {
    if (!sample || depts.has(d.code)) continue;
    const parent = d.parent ? depts.get(d.parent) : undefined;
    // Phòng ban cha mẫu bị đổi hay không còn (người dùng sửa): bỏ qua phòng ban con mẫu thay vì gắn sai chỗ
    if (d.parent && !parent) {
      console.warn(`Bỏ qua phòng ban mẫu ${d.code}: không có phòng ban cha ${d.parent}.`);
      continue;
    }
    const path = `${parent?.Path ?? '/'}${d.code}/`;
    await db
      .insertInto('Department')
      .values({
        Code: d.code,
        Name: d.name,
        NameEn: d.nameEn ?? null,
        DepartmentTypeId: typeId.get(d.type)!,
        ParentId: parent?.Id ?? null,
        Path: path,
        ManagerEmployeeId: null,
        BranchCode: d.branch ?? null,
        EstablishedDate: d.established ?? null,
        DissolvedDate: d.dissolved ?? null,
        SortOrder: (i + 1) * 10,
        IsActive: !d.dissolved,
        IsProductionWorkshop: !!d.productionWorkshop,
        CreatedBy: null,
      })
      .execute();
    depts.set(d.code, await db.selectFrom('Department').select(['Id', 'Code', 'Path']).where('Code', '=', d.code).executeTakeFirstOrThrow());
    bump('phòng ban');
  }

  const titleId = new Map((await db.selectFrom('JobTitle').select(['Id', 'Code']).execute()).map((t) => [t.Code, t.Id]));
  for (const [i, [code, name, dept]] of hrJobTitles.entries()) {
    if (titleId.has(code)) continue;
    // Không có dữ liệu mẫu: phòng ban cùng mã (nếu có) là phòng ban thật, không gắn chức danh mẫu vào đó
    if (dept && (!sample || !depts.has(dept))) continue;
    await db.insertInto('JobTitle').values({ Code: code, Name: name, Description: null, DepartmentId: dept ? depts.get(dept)!.Id : null, SortOrder: (i + 1) * 10, IsActive: true, IsSystem: false, CreatedBy: null }).execute();
    titleId.set(code, (await db.selectFrom('JobTitle').select('Id').where('Code', '=', code).executeTakeFirstOrThrow()).Id);
    bump('chức danh');
  }

  if (!sample) return stats;
  const anyEmployee = await db.selectFrom('Employee').select('Id').executeTakeFirst();
  if (anyEmployee) return stats;
  // Một transaction: lỗi giữa chừng không để lại bảng nhân viên dở dang (lần seed sau thấy bảng có dòng thì không sinh tiếp)
  await db.transaction().execute((trx) => seedEmployees(trx, depts, titleId, bump));
  return stats;
}

async function seedEmployees(db: HrDb, depts: Map<string, { Id: number }>, titleId: Map<string, number>, bump: (k: string, n?: number) => void) {

  // Sinh xác định theo hạt giống: chạy lại trên database trống cho cùng kết quả
  const rnd = prng(58);
  const pick = <T>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];
  const between = (from: string, to: string) => addDays(from, Math.floor(rnd() * ((Date.parse(to) - Date.parse(from)) / 86_400_000)));
  let n = 1000;
  const managers: { dept: string; code: string }[] = [];
  for (const s of hrStaffing) {
    const dept = depts.get(s.department);
    const title = titleId.get(s.title);
    if (!dept || !title) continue;
    for (let k = 0; k < s.count; k++) {
      n++;
      const code = `NV${n}`;
      const gender = (rnd() < 0.62 ? 2 : 1) as 1 | 2;
      const fullName = `${pick(HR_FAMILY)} ${pick(HR_MIDDLE[gender])} ${pick(HR_GIVEN[gender])}`;
      const start = between('2010-01-01', '2025-06-30');
      // Vài người đã nghỉ việc (không phải người quản lý) để thử bộ lọc tình trạng
      const resigned = !(s.manager && k === 0) && n % 9 === 0;
      const office = !s.department.startsWith('NM');
      const province = pick(HR_PROVINCES);
      await db
        .insertInto('Employee')
        .values({
          Code: code,
          TimekeepingCode: code,
          FullName: fullName,
          FullNameEn: null,
          Email: office ? `${code.toLowerCase()}@vietsun.example` : null,
          Gender: gender,
          DepartmentId: dept.Id,
          JobTitleId: title,
          EmploymentStatus: resigned ? 2 : 1,
          StartDate: start,
          EndDate: resigned ? between('2025-07-01', '2026-09-30') : null,
          TimekeepingName: fullName.split(' ').slice(-2).join(' '),
          CardCode: `T${n}`,
          StaffType: rnd() < 0.85 ? 'Chính thức' : 'Thời vụ',
          IsTimekeepingAllowed: true,
          Nickname: null,
          BirthDate: between('1970-01-01', '2004-12-31'),
          BirthPlace: province,
          Hometown: pick(HR_PROVINCES),
          Ethnicity: 'Kinh',
          Nationality: 'Việt Nam',
          IdNumber: `999${String(Math.floor(rnd() * 1e9)).padStart(9, '0')}`,
          IdIssuePlace: 'Cục Cảnh sát QLHC về TTXH',
          ContactPhone: `0900${String(Math.floor(rnd() * 1e6)).padStart(6, '0')}`,
          ContactPerson: `${pick(HR_FAMILY)} ${pick(HR_GIVEN[1])} (người thân)`,
          CurrentAddress: `Số ${1 + Math.floor(rnd() * 200)}, Đường số ${1 + Math.floor(rnd() * 30)}, ${province}`,
          CreatedBy: null,
        })
        .execute();
      bump('nhân viên');
      if (s.manager && k === 0) managers.push({ dept: s.department, code });
    }
  }
  for (const m of managers) {
    const emp = await db.selectFrom('Employee').select('Id').where('Code', '=', m.code).executeTakeFirst();
    if (emp) await db.updateTable('Department').set({ ManagerEmployeeId: emp.Id }).where('Code', '=', m.dept).where('ManagerEmployeeId', 'is', null).execute();
  }
}

/** Seed phần Nhân sự khi MES_Hr đã tạo và đã chạy migration; chưa thì báo và bỏ qua (không làm hỏng phần đã seed của MES_Core) */
export async function seedHrIfReady({ sample = true }: { sample?: boolean } = {}): Promise<Record<string, number>> {
  const state = await hrDbState();
  if (state !== 'ready') {
    console.warn(
      state === 'missing'
        ? `Chưa có database ${env.db.hrName} (hoặc tài khoản chưa được cấp quyền): bỏ qua danh mục, dữ liệu nhân sự (xem docs/thiet-ke/db-hr.md).`
        : `Database ${env.db.hrName} chưa chạy migration: bỏ qua danh mục, dữ liệu nhân sự. Chạy npm run migrate rồi seed lại.`,
    );
    return {};
  }
  const db = createDb<HrDatabase>(env.db.hrName);
  try {
    return await seedHr(db, { sample });
  } finally {
    await db.destroy();
  }
}

/**
 * reset:demo: xóa toàn bộ dữ liệu nhân sự (loại phòng ban, phòng ban, chức danh, nhân viên) để seed nạp lại bản mẫu, Id đổi sau mỗi
 * lần. Chỉ máy demo (assertDemoMachine), như clearSewingPrep. Khi module khác có khóa ngầm EmployeeId thì phải xét lại. Trả số nhân viên
 * đã xóa.
 */
export async function clearHr(): Promise<number> {
  assertDemoMachine('xóa dữ liệu nhân sự');
  if ((await hrDbState()) !== 'ready') return 0;
  const db = createDb<HrDatabase>(env.db.hrName);
  try {
    return await db.transaction().execute(async (trx) => {
      // Phòng ban trỏ tới người quản lý, chức danh trỏ tới phòng ban: gỡ liên kết theo thứ tự rồi mới xóa
      await trx.updateTable('Department').set({ ManagerEmployeeId: null }).execute();
      const r = await trx.deleteFrom('Employee').executeTakeFirst();
      await trx.deleteFrom('JobTitle').execute();
      await trx.deleteFrom('Department').execute();
      await trx.deleteFrom('DepartmentType').execute();
      return Number(r.numDeletedRows);
    });
  } finally {
    await db.destroy();
  }
}
