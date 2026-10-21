import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'kysely';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { env } from '../src/config/env';
import { HR_DB } from '../src/modules/hr/hr.db';
import type { HrDb } from '../src/modules/hr/hr.types';
import { SEWING_DB } from '../src/modules/sewing/sewing.db';
import { seedClusterDemo } from '../scripts/cluster-data';
import type { SewingDb } from '../src/modules/sewing/sewing.types';
import { CORE_DB, type CoreDb } from '../src/platform/database/database.module';

// Phase 5.18 – Phân cụm trưởng. Cần MES_Core, MES_Hr, MES_Sewing đã migrate (MES_Core/0016, MES_Sewing/0005) và seed mẫu (chuyền A01-L03,
// A01-L05, A02-L01; tài khoản truongchuyen.a, truongchuyen.b phạm vi chuyền A01-L03). Test tự tạo nhân viên TST518-*, cụm mã hàng
// TEST-P518-*, tổ trưởng thử, gắn tạm hai tài khoản Trưởng chuyền với nhân viên thử; trả lại như cũ khi xong.
describe('Phase 5.18: Phân cụm trưởng', () => {
  let app: INestApplication;
  let core: CoreDb;
  let hr: HrDb;
  let sewing: SewingDb;
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const STYLE = 'TEST-P518-A';
  const STYLE_B = 'TEST-P518-B';
  const tokens = new Map<string, string>();
  const fx = { leader: 0, worker: 0, resigned: 0, l3: 0, l5: 0, a02: 0, c1: 0, c2: 0, c3: 0, b1: 0, l5c: 0 };
  /** Tổ do test tạo (máy chưa có dữ liệu mẫu Phân cụm trưởng): xóa khi xong */
  const createdTeams: number[] = [];
  /** Nhân viên của tài khoản trước khi test gắn tạm */
  const linkedBefore = new Map<string, number | null>();

  async function tokenFor(username: string, branchCode: string) {
    const key = `${username}@${branchCode}`;
    if (tokens.has(key)) return tokens.get(key)!;
    const l = await api().post('/api/v1/auth/login').send({ username, password: env.demoPassword });
    const s = await api().post('/api/v1/auth/select-branch').set('Authorization', `Bearer ${l.body.preAuthToken}`).send({ branchCode });
    if (!s.body.accessToken) throw new Error(`Không chọn được ${branchCode} cho ${username}: ${JSON.stringify(s.body)}`);
    tokens.set(key, s.body.accessToken);
    return s.body.accessToken as string;
  }

  const link = (username: string, employeeId: number | null) => core.updateTable('SysUser').set({ EmployeeId: employeeId }).where('Username', '=', username).execute();
  const bumpVersion = () => core.updateTable('SysPermissionVersion').set((eb) => ({ Version: eb('Version', '+', 1 as any) }) as any).where('Id', '=', 1).execute();

  async function team(branch: string, line: string) {
    const have = await sewing.selectFrom('SewingTeam').select('Id').where('BranchCode', '=', branch).where('LineCode', '=', line).executeTakeFirst();
    if (have) return have.Id;
    const r = await sewing.insertInto('SewingTeam').values({ LineCode: line, SourceSystem: 'DEMO', SourceKey: null, SourceSyncedAt: new Date(), BranchCode: branch, CreatedBy: null }).output('inserted.Id').executeTakeFirstOrThrow();
    createdTeams.push(r.Id);
    return r.Id;
  }

  async function cluster(teamId: number, branch: string, style: string, code: string, name: string, sort: number) {
    const r = await sewing
      .insertInto('SewingTeamCluster')
      .values({ SewingTeamId: teamId, StyleCode: style, StyleLabel: 'Trung bình/S27', Code: code, Name: name, SortOrder: sort, SourceKey: null, SourceSyncedAt: new Date(), LeaderEmployeeId: null, LeaderEmployeeCode: null, BranchCode: branch, CreatedBy: null })
      .output('inserted.Id')
      .executeTakeFirstOrThrow();
    return r.Id;
  }

  async function dropFixture() {
    await sewing.deleteFrom('SewingTeamCluster').where('StyleCode', 'like', 'TEST-P518%').execute();
    const emps = (await hr.selectFrom('Employee').select('Id').where('Code', 'like', 'TST518-%').execute()).map((e) => e.Id);
    if (emps.length) {
      await sewing.deleteFrom('SewingTeamLeader').where('EmployeeId', 'in', emps).execute();
      await sewing.updateTable('SewingTeamCluster').set({ LeaderEmployeeId: null, LeaderEmployeeCode: null }).where('LeaderEmployeeId', 'in', emps).execute();
      await core.updateTable('SysUser').set({ EmployeeId: null }).where('EmployeeId', 'in', emps).execute();
      await hr.deleteFrom('Employee').where('Id', 'in', emps).execute();
    }
    if (createdTeams.length) await sewing.deleteFrom('SewingTeam').where('Id', 'in', createdTeams).execute();
  }

  async function createFixture() {
    await dropFixture();
    const dept = await hr.selectFrom('Department').select('Id').where('Code', '=', 'A01-L03').executeTakeFirstOrThrow();
    const title = await hr.selectFrom('JobTitle').select('Id').where('Code', '=', 'CNM').executeTakeFirstOrThrow();
    const emp = async (code: string, fullName: string, status: 1 | 2) => {
      await hr
        .insertInto('Employee')
        .values({ Code: code, TimekeepingCode: code, FullName: fullName, Gender: 2, DepartmentId: dept.Id, JobTitleId: title.Id, EmploymentStatus: status, StartDate: '2020-01-01', EndDate: status === 2 ? '2026-01-31' : null, CreatedBy: null })
        .execute();
      return (await hr.selectFrom('Employee').select('Id').where('Code', '=', code).executeTakeFirstOrThrow()).Id;
    };
    fx.leader = await emp('TST518-1', 'Tổ Trưởng Thử', 1);
    fx.worker = await emp('TST518-2', 'Đặng Thị Thử Nghiệm', 1);
    fx.resigned = await emp('TST518-3', 'Người Đã Nghỉ Thử', 2);
    fx.l3 = await team('A01', 'A01-L03');
    fx.l5 = await team('A01', 'A01-L05');
    fx.a02 = await team('A02', 'A02-L01');
    for (const [t, b] of [
      [fx.l3, 'A01'],
      [fx.l5, 'A01'],
      [fx.a02, 'A02'],
    ] as const) {
      await sewing.insertInto('SewingTeamLeader').values({ SewingTeamId: t, EmployeeId: fx.leader, SourceKey: null, SourceSyncedAt: new Date(), BranchCode: b, CreatedBy: null }).execute();
    }
    // Thứ tự trên chuyền theo SortOrder, không theo thứ tự thêm
    fx.c2 = await cluster(fx.l3, 'A01', STYLE, 'TUI', 'Cụm túi', 20);
    fx.c1 = await cluster(fx.l3, 'A01', STYLE, 'BTP', 'Cấp BTP', 10);
    fx.c3 = await cluster(fx.l3, 'A01', STYLE, 'UI', 'Ủi', 30);
    fx.b1 = await cluster(fx.l3, 'A01', STYLE_B, 'BTP', 'Cấp BTP', 10);
    fx.l5c = await cluster(fx.l5, 'A01', STYLE, 'BTP', 'Cấp BTP', 10);
    for (const u of ['truongchuyen.a', 'truongchuyen.b', 'admin', 'kehoach.a']) {
      linkedBefore.set(u, (await core.selectFrom('SysUser').select('EmployeeId').where('Username', '=', u).executeTakeFirst())?.EmployeeId ?? null);
    }
    await link('truongchuyen.a', fx.leader);
    // Đã gắn nhân viên nhưng không phải tổ trưởng của tổ nào trong phạm vi
    await link('truongchuyen.b', fx.worker);
    await link('admin', null);
    await link('kehoach.a', null);
  }

  const teams = async (token: string) => (await api().get('/api/v1/sewing/cluster/teams').set(auth(token)).expect(200)).body;
  const detail = async (token: string, teamId: number, style = STYLE) => (await api().get(`/api/v1/sewing/cluster?teamId=${teamId}&style=${encodeURIComponent(style)}`).set(auth(token)).expect(200)).body;
  const save = (token: string, items: object[], teamId = fx.l3, style = STYLE) => api().put('/api/v1/sewing/cluster').set(auth(token)).send({ teamId, style, items });
  const leaderOf = async (id: number) => sewing.selectFrom('SewingTeamCluster').select(['LeaderEmployeeId', 'LeaderEmployeeCode']).where('Id', '=', id).executeTakeFirstOrThrow();

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    core = app.get<CoreDb>(CORE_DB);
    hr = app.get<HrDb>(HR_DB);
    sewing = app.get<SewingDb>(SEWING_DB);
    await createFixture();
  }, 60_000);

  afterAll(async () => {
    await dropFixture();
    for (const [u, id] of linkedBefore) await link(u, id);
    await app.close();
  });

  it('tổ trưởng chỉ thấy tổ mình, giao với phạm vi chuyền: tổ A01-L05 (ngoài phạm vi) và tổ của ĐVCS khác không hiện', async () => {
    const t = await tokenFor('truongchuyen.a', 'A01');
    const body = await teams(t);
    expect(body).toMatchObject({ linked: true, leader: true });
    expect(body.items).toEqual([expect.objectContaining({ id: fx.l3, branchCode: 'A01', lineCode: 'A01-L03', canEdit: true })]);
    expect(typeof body.items[0].lineName).toBe('string');
    // Tổ trưởng không xem được tổ khác dù đoán Id
    await api().get(`/api/v1/sewing/cluster/styles?teamId=${fx.l5}`).set(auth(t)).expect(404);
    await api().get(`/api/v1/sewing/cluster/styles?teamId=${fx.a02}`).set(auth(t)).expect(404);
  });

  it('người không phải tổ trưởng thấy mọi tổ trong phạm vi, chỉ xem, kèm lý do', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const body = await teams(planner);
    expect(body).toMatchObject({ linked: false, leader: false });
    const ids = body.items.map((x: any) => x.id);
    expect(ids).toEqual(expect.arrayContaining([fx.l3, fx.l5]));
    expect(ids).not.toContain(fx.a02);
    expect(body.items.every((x: any) => x.canEdit === false)).toBe(true);
    expect((await detail(planner, fx.l3)).readOnlyReason).toBe('Bạn chỉ được xem Phân cụm trưởng.');
    // Trưởng chuyền đã gắn nhân viên nhưng không là tổ trưởng: thấy tổ trong phạm vi chuyền, không sửa được
    const other = await tokenFor('truongchuyen.b', 'A01');
    const b = await teams(other);
    expect(b).toMatchObject({ linked: true, leader: false });
    expect(b.items.map((x: any) => x.id)).toEqual([fx.l3]);
    expect((await detail(other, fx.l3)).readOnlyReason).toBe('Chỉ tổ trưởng của tổ này mới phân cụm trưởng được.');
    const admin = await tokenFor('admin', 'A01');
    expect((await detail(admin, fx.l3)).readOnlyReason).toContain('chưa gắn với nhân viên');
  });

  it('mã hàng đã phân cụm cho tổ, cụm theo thứ tự trên chuyền, tổ trưởng của tổ', async () => {
    const t = await tokenFor('truongchuyen.a', 'A01');
    const styles = (await api().get(`/api/v1/sewing/cluster/styles?teamId=${fx.l3}`).set(auth(t)).expect(200)).body.items as any[];
    expect(styles.find((s) => s.styleCode === STYLE)).toEqual({ styleCode: STYLE, styleLabel: 'Trung bình/S27', clusters: 3, assigned: 0 });
    expect(styles.find((s) => s.styleCode === STYLE_B)).toMatchObject({ clusters: 1 });
    const d = await detail(t, fx.l3);
    expect(d).toMatchObject({ team: { id: fx.l3, lineCode: 'A01-L03' }, styleCode: STYLE, styleLabel: 'Trung bình/S27', canEdit: true, readOnlyReason: null, canSearch: true });
    expect(d.items.map((x: any) => [x.id, x.code, x.name])).toEqual([
      [fx.c1, 'BTP', 'Cấp BTP'],
      [fx.c2, 'TUI', 'Cụm túi'],
      [fx.c3, 'UI', 'Ủi'],
    ]);
    expect(d.items[0]).toMatchObject({ leaderEmployeeId: null, leaderCode: null, leaderName: null });
    expect(d.teamLeaders).toEqual(expect.arrayContaining([{ id: fx.leader, code: 'TST518-1', fullName: 'Tổ Trưởng Thử' }]));
    await api().get(`/api/v1/sewing/cluster?teamId=${fx.l3}&style=KHONG-CO`).set(auth(t)).expect(404);
  });

  it('tìm nhân viên cho ô Tên cụm trưởng: chỉ người đang làm, không phân biệt dấu; chỉ xem thì không gọi được', async () => {
    const t = await tokenFor('truongchuyen.a', 'A01');
    const find = async (q: string) => (await api().get(`/api/v1/sewing/cluster/employees?teamId=${fx.l3}&q=${encodeURIComponent(q)}`).set(auth(t)).expect(200)).body;
    const r = await find('tst518');
    expect(r.canSearch).toBe(true);
    const codes = r.items.map((x: any) => x.code);
    expect(codes).toEqual(expect.arrayContaining(['TST518-1', 'TST518-2']));
    expect(codes).not.toContain('TST518-3');
    expect((await find('dang thi thu')).items.map((x: any) => x.id)).toContain(fx.worker);
    expect(r.items.find((x: any) => x.id === fx.worker)).toEqual({ id: fx.worker, code: 'TST518-2', fullName: 'Đặng Thị Thử Nghiệm', departmentName: expect.any(String) });
    const planner = await tokenFor('kehoach.a', 'A01');
    await api().get(`/api/v1/sewing/cluster/employees?teamId=${fx.l3}`).set(auth(planner)).expect(403);
  });

  it('tổ trưởng lưu cụm trưởng: ghi Id và mã chụp, chỉ cụm đổi, nhật ký; bỏ cụm trưởng; gửi lại không đổi gì', async () => {
    const t = await tokenFor('truongchuyen.a', 'A01');
    const res = await save(t, [
      { id: fx.c1, leaderEmployeeId: fx.worker, previous: null },
      { id: fx.c2, leaderEmployeeId: fx.leader, previous: null },
      { id: fx.c3, leaderEmployeeId: null, previous: null },
    ]).expect(200);
    expect(res.body).toEqual({ saved: 2 });
    expect(await leaderOf(fx.c1)).toEqual({ LeaderEmployeeId: fx.worker, LeaderEmployeeCode: 'TST518-2' });
    expect(await leaderOf(fx.c3)).toEqual({ LeaderEmployeeId: null, LeaderEmployeeCode: null });
    const d = await detail(t, fx.l3);
    expect(d.items[0]).toMatchObject({ leaderEmployeeId: fx.worker, leaderCode: 'TST518-2', leaderName: 'Đặng Thị Thử Nghiệm', leaderActive: true });
    expect(typeof d.items[0].leaderDepartment).toBe('string');
    const styles = (await api().get(`/api/v1/sewing/cluster/styles?teamId=${fx.l3}`).set(auth(t)).expect(200)).body.items as any[];
    expect(styles.find((s) => s.styleCode === STYLE)).toMatchObject({ assigned: 2 });
    const logs = await core.selectFrom('SysAuditLog').select(['EntityId', 'NewValue']).where('EntityType', '=', 'SewingTeamCluster').where('EntityId', 'in', [String(fx.c1), String(fx.c2), String(fx.c3)]).execute();
    expect(logs.map((l) => Number(l.EntityId)).sort()).toEqual([fx.c1, fx.c2].sort());
    expect(JSON.parse(logs.find((l) => Number(l.EntityId) === fx.c1)!.NewValue!)).toMatchObject({ styleCode: STYLE, cluster: 'BTP', leaderEmployeeId: fx.worker, leaderCode: 'TST518-2' });
    expect((await save(t, [{ id: fx.c1, leaderEmployeeId: fx.worker, previous: fx.worker }]).expect(200)).body).toEqual({ saved: 0 });
    await save(t, [{ id: fx.c2, leaderEmployeeId: null, previous: fx.leader }]).expect(200);
    expect(await leaderOf(fx.c2)).toEqual({ LeaderEmployeeId: null, LeaderEmployeeCode: null });
  });

  it('không ghi gì khi: người khác vừa đổi (409), nhân viên đã nghỉ, không có (422), cụm ngoài mã hàng, tổ (404), gửi trùng (422)', async () => {
    const t = await tokenFor('truongchuyen.a', 'A01');
    // c1 đang là worker (bài trước); màn còn ảnh cũ (null)
    const conflict = await save(t, [
      { id: fx.c1, leaderEmployeeId: fx.leader, previous: null },
      { id: fx.c3, leaderEmployeeId: fx.leader, previous: null },
    ]).expect(409);
    expect(conflict.body.error.details.cells).toEqual([{ id: fx.c1, leaderEmployeeId: fx.worker }]);
    expect(await leaderOf(fx.c3)).toEqual({ LeaderEmployeeId: null, LeaderEmployeeCode: null });
    const resigned = await save(t, [{ id: fx.c3, leaderEmployeeId: fx.resigned, previous: null }]).expect(422);
    expect(resigned.body.error.message).toContain('Ủi');
    await save(t, [{ id: fx.c3, leaderEmployeeId: 999_999_999, previous: null }]).expect(422);
    const missing = await save(t, [
      { id: fx.b1, leaderEmployeeId: fx.leader, previous: null },
      { id: fx.l5c, leaderEmployeeId: fx.leader, previous: null },
    ]).expect(404);
    expect(missing.body.error.details.ids).toEqual([fx.b1, fx.l5c].sort((a, b) => a - b));
    await save(t, [
      { id: fx.c3, leaderEmployeeId: fx.leader, previous: null },
      { id: fx.c3, leaderEmployeeId: fx.worker, previous: null },
    ]).expect(422);
    await save(t, [{ id: fx.c3 }]).expect(422);
    expect(await leaderOf(fx.c3)).toEqual({ LeaderEmployeeId: null, LeaderEmployeeCode: null });
  });

  it('máy chủ chặn: không phải tổ trưởng, chưa gắn nhân viên, chỉ có quyền Xem, tổ ngoài phạm vi, A00', async () => {
    const item = [{ id: fx.c3, leaderEmployeeId: fx.worker, previous: null }];
    const other = await tokenFor('truongchuyen.b', 'A01');
    expect((await save(other, item).expect(403)).body.error.message).toBe('Chỉ tổ trưởng của tổ này mới phân cụm trưởng được.');
    const admin = await tokenFor('admin', 'A01');
    expect((await save(admin, item).expect(403)).body.error.message).toContain('chưa gắn với nhân viên');
    const planner = await tokenFor('kehoach.a', 'A01');
    expect((await save(planner, item).expect(403)).body.error.code).toBe('PERMISSION_DENIED');
    // Tổ trưởng của A01-L05 trong dữ liệu nhưng phạm vi chuyền chỉ có A01-L03: 404 như không có
    const t = await tokenFor('truongchuyen.a', 'A01');
    await save(t, [{ id: fx.l5c, leaderEmployeeId: fx.worker, previous: null }], fx.l5).expect(404);
    const agg = await tokenFor('admin', 'A00');
    const all = await teams(agg);
    expect(all.items.map((x: any) => x.id)).toEqual(expect.arrayContaining([fx.l3, fx.a02]));
    expect(all.items.every((x: any) => x.canEdit === false)).toBe(true);
    expect((await detail(agg, fx.l3)).readOnlyReason).toContain('tổng hợp');
    expect((await save(agg, item).expect(403)).body.error.code).toBe('AGGREGATE_READ_ONLY');
    expect(await leaderOf(fx.c3)).toEqual({ LeaderEmployeeId: null, LeaderEmployeeCode: null });
  });

  it('gỡ nhân viên khỏi tài khoản có hiệu lực ngay: hết là tổ trưởng, thấy mọi tổ trong phạm vi, chỉ xem', async () => {
    await link('truongchuyen.a', null);
    try {
      const t = await tokenFor('truongchuyen.a', 'A01');
      const body = await teams(t);
      expect(body).toMatchObject({ linked: false, leader: false });
      expect(body.items).toEqual([expect.objectContaining({ id: fx.l3, canEdit: false })]);
      await save(t, [{ id: fx.c3, leaderEmployeeId: fx.worker, previous: null }]).expect(403);
    } finally {
      await link('truongchuyen.a', fx.leader);
    }
  });

  it('chính sách cột Tên cụm trưởng: Chỉ đọc thì không lưu được; Ẩn thì không trả cụm trưởng, số cụm đã phân', async () => {
    const admin = await tokenFor('admin', 'A01');
    const roles = (await api().get('/api/v1/admin/roles').set(auth(admin))).body as { id: number; code: string }[];
    const matrix = (await api().get('/api/v1/admin/permissions').set(auth(admin))).body;
    const resourceId = matrix.modules.flatMap((m: any) => m.resources).find((r: any) => r.code === 'sewing.cluster').id;
    const role = roles.find((r) => r.code === 'LINE_LEADER')!.id;
    const policy = (level: string | null) => api().put(`/api/v1/admin/roles/${role}/field-policies`).set(auth(admin)).send({ resourceId, policies: [{ fieldCode: 'leaderEmployeeId', accessLevel: level }] }).expect(200);
    await policy('READONLY');
    try {
      tokens.delete('truongchuyen.a@A01');
      const ro = await tokenFor('truongchuyen.a', 'A01');
      expect((await save(ro, [{ id: fx.c3, leaderEmployeeId: fx.worker, previous: null }]).expect(403)).body.error.code).toBe('FIELD_READONLY');
      await policy('HIDDEN');
      tokens.delete('truongchuyen.a@A01');
      const hidden = await tokenFor('truongchuyen.a', 'A01');
      const d = await detail(hidden, fx.l3);
      expect(d.items[0]).not.toHaveProperty('leaderEmployeeId');
      expect(d.items[0]).not.toHaveProperty('leaderName');
      expect(d.items[0]).not.toHaveProperty('leaderCode');
      const styles = (await api().get(`/api/v1/sewing/cluster/styles?teamId=${fx.l3}`).set(auth(hidden)).expect(200)).body.items as any[];
      expect(styles.find((s) => s.styleCode === STYLE)).toMatchObject({ clusters: 3, assigned: null });
    } finally {
      await policy(null);
      tokens.delete('truongchuyen.a@A01');
    }
  });

  it('Quản trị › Người dùng gắn nhân viên cho tài khoản: chỉ người đang làm, không tự gắn cho mình, nhật ký; danh sách hiện nhân viên', async () => {
    const admin = await tokenFor('admin', 'A01');
    const uid = (await core.selectFrom('SysUser').select('Id').where('Username', '=', 'truongchuyen.b').executeTakeFirstOrThrow()).Id;
    const adminId = (await core.selectFrom('SysUser').select('Id').where('Username', '=', 'admin').executeTakeFirstOrThrow()).Id;
    const options = (await api().get('/api/v1/admin/users/employee-options?q=tst518').set(auth(admin)).expect(200)).body;
    expect(options.canSearch).toBe(true);
    expect(options.items.map((x: any) => x.code)).toEqual(expect.arrayContaining(['TST518-1', 'TST518-2']));
    expect(options.items.map((x: any) => x.code)).not.toContain('TST518-3');
    const set = (id: number, employeeId: number | null) => api().put(`/api/v1/admin/users/${id}/employee`).set(auth(admin)).send({ employeeId });
    // Một nhân viên một tài khoản (MES_Core/0017): tổ trưởng thử đang gắn với truongchuyen.a
    expect((await set(uid, fx.leader).expect(409)).body.error.message).toContain('truongchuyen.a');
    await link('truongchuyen.a', null);
    await set(uid, fx.leader).expect(200);
    expect((await core.selectFrom('SysUser').select('EmployeeId').where('Id', '=', uid).executeTakeFirstOrThrow()).EmployeeId).toBe(fx.leader);
    const log = await core.selectFrom('SysAuditLog').select(['OldValue', 'NewValue']).where('EntityType', '=', 'SysUser').where('EntityId', '=', String(uid)).where('ActionCode', '=', 'USER_EMPLOYEE').orderBy('Id', 'desc').executeTakeFirstOrThrow();
    expect(JSON.parse(log.OldValue!)).toEqual({ employeeId: fx.worker, code: 'TST518-2' });
    expect(JSON.parse(log.NewValue!)).toEqual({ employeeId: fx.leader, code: 'TST518-1' });
    const list = (await api().get('/api/v1/admin/users?q=truongchuyen.b').set(auth(admin)).expect(200)).body.items as any[];
    expect(list.find((u) => u.id === uid)).toMatchObject({ employeeId: fx.leader, employee: { id: fx.leader, code: 'TST518-1', fullName: 'Tổ Trưởng Thử', isActive: true } });
    // Có hiệu lực ngay ở Phân cụm trưởng: truongchuyen.b thành tổ trưởng A01-L03
    tokens.delete('truongchuyen.b@A01');
    expect(await teams(await tokenFor('truongchuyen.b', 'A01'))).toMatchObject({ leader: true });
    expect((await set(uid, fx.resigned).expect(422)).body.error.message).toContain('nghỉ việc');
    await set(uid, 999_999_999).expect(422);
    await api().put(`/api/v1/admin/users/${uid}/employee`).set(auth(admin)).send({}).expect(422);
    expect((await set(adminId, fx.leader).expect(403)).body.error.code).toBe('SELF_ELEVATION_FORBIDDEN');
    const planner = await tokenFor('kehoach.a', 'A01');
    await api().put(`/api/v1/admin/users/${uid}/employee`).set(auth(planner)).send({ employeeId: null }).expect(403);
    await api().get('/api/v1/admin/users/employee-options').set(auth(planner)).expect(403);
    await set(uid, null).expect(200);
    expect((await core.selectFrom('SysUser').select('EmployeeId').where('Id', '=', uid).executeTakeFirstOrThrow()).EmployeeId).toBeNull();
    await link('truongchuyen.b', fx.worker);
    await link('truongchuyen.a', fx.leader);
    tokens.delete('truongchuyen.b@A01');
  });

  it('chính sách cột Tên cụm trưởng bị Che: trả "***", không trả tên, mã, phòng ban, số cụm đã phân', async () => {
    const admin = await tokenFor('admin', 'A01');
    const roles = (await api().get('/api/v1/admin/roles').set(auth(admin))).body as { id: number; code: string }[];
    const matrix = (await api().get('/api/v1/admin/permissions').set(auth(admin))).body;
    const resourceId = matrix.modules.flatMap((m: any) => m.resources).find((r: any) => r.code === 'sewing.cluster').id;
    const role = roles.find((r) => r.code === 'LINE_LEADER')!.id;
    const policy = (level: string | null) => api().put(`/api/v1/admin/roles/${role}/field-policies`).set(auth(admin)).send({ resourceId, policies: [{ fieldCode: 'leaderEmployeeId', accessLevel: level }] }).expect(200);
    const t = await tokenFor('truongchuyen.a', 'A01');
    await save(t, [{ id: fx.c2, leaderEmployeeId: fx.worker, previous: null }]).expect(200);
    await policy('MASKED');
    try {
      tokens.delete('truongchuyen.a@A01');
      const masked = await tokenFor('truongchuyen.a', 'A01');
      const item = (await detail(masked, fx.l3)).items.find((x: any) => x.id === fx.c2);
      expect(item).toMatchObject({ leaderEmployeeId: '***' });
      expect(item).not.toHaveProperty('leaderName');
      expect(item).not.toHaveProperty('leaderCode');
      const styles = (await api().get(`/api/v1/sewing/cluster/styles?teamId=${fx.l3}`).set(auth(masked)).expect(200)).body.items as any[];
      expect(styles.find((s) => s.styleCode === STYLE)).toMatchObject({ assigned: null });
    } finally {
      await policy(null);
      tokens.delete('truongchuyen.a@A01');
      await save(await tokenFor('truongchuyen.a', 'A01'), [{ id: fx.c2, leaderEmployeeId: null, previous: fx.worker }]).expect(200);
    }
  });

  it('seed chạy lại không thêm gì và không gắn lại tài khoản quản trị đã gỡ nhân viên (review 5.18 M2, M3)', async () => {
    const before = (await core.selectFrom('SysUser').select('EmployeeId').where('Username', '=', 'totruong.a').executeTakeFirst())?.EmployeeId ?? null;
    await link('totruong.a', null);
    try {
      const teamsBefore = (await sewing.selectFrom('SewingTeam').select(sql<number>`COUNT(*)`.as('n')).executeTakeFirstOrThrow()).n;
      const stats = await seedClusterDemo(core as any, ['A01', 'A02', 'A03']);
      expect(stats).toEqual({});
      expect((await sewing.selectFrom('SewingTeam').select(sql<number>`COUNT(*)`.as('n')).executeTakeFirstOrThrow()).n).toBe(teamsBefore);
      expect((await core.selectFrom('SysUser').select('EmployeeId').where('Username', '=', 'totruong.a').executeTakeFirst())?.EmployeeId ?? null).toBeNull();
    } finally {
      await link('totruong.a', before);
    }
  });

  it('không có quyền tra Danh bạ nhân viên: ô chọn nói rõ, không chọn được cụm trưởng, vẫn bỏ được cụm trưởng', async () => {
    const role = await core.selectFrom('SysRole').select('Id').where('Code', '=', 'LINE_LEADER').executeTakeFirstOrThrow();
    const perm = await core.selectFrom('SysPermission').select('Id').where('Code', '=', 'hr.directory:view').executeTakeFirstOrThrow();
    await core.deleteFrom('SysRolePermission').where('RoleId', '=', role.Id).where('PermissionId', '=', perm.Id).execute();
    await bumpVersion();
    try {
      tokens.delete('truongchuyen.a@A01');
      const t = await tokenFor('truongchuyen.a', 'A01');
      expect((await detail(t, fx.l3)).canSearch).toBe(false);
      expect((await api().get(`/api/v1/sewing/cluster/employees?teamId=${fx.l3}&q=tst518`).set(auth(t)).expect(200)).body).toEqual({ canSearch: false, items: [] });
      expect((await save(t, [{ id: fx.c3, leaderEmployeeId: fx.worker, previous: null }]).expect(403)).body.error.message).toContain('Danh bạ nhân viên');
      await save(t, [{ id: fx.c1, leaderEmployeeId: null, previous: fx.worker }]).expect(200);
      expect(await leaderOf(fx.c1)).toEqual({ LeaderEmployeeId: null, LeaderEmployeeCode: null });
    } finally {
      await core.insertInto('SysRolePermission').values({ RoleId: role.Id, PermissionId: perm.Id } as any).execute();
      await bumpVersion();
      tokens.delete('truongchuyen.a@A01');
    }
  });
});
