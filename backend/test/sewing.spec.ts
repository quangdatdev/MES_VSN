import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { env } from '../src/config/env';
import { ORDER_DB } from '../src/modules/order/order.db';
import type { OrderDb } from '../src/modules/order/order.types';
import { ScheduleFeed } from '../src/modules/order/schedule-feed.service';
import { prepStatus, stepValue, todayVN, weekOf } from '../src/modules/sewing/prep.service';
import { SEWING_DB } from '../src/modules/sewing/sewing.db';
import { CORE_DB, type CoreDb } from '../src/platform/database/database.module';
import { SewingPrepRepository } from '../src/modules/sewing/sewing.repositories';
import type { SewingDb } from '../src/modules/sewing/sewing.types';

// Phase 5.5 – Kế hoạch chuẩn bị SX (ADR 0009). Cần MES_Core, MES_Order, MES_Sewing đã migrate và seed.
// Test tự tạo một đơn hàng, một kế hoạch, 2 dòng dàn chuyền ở A01 (chuyền 3 vào chuyền đã qua, chuyền 5 vào chuyền còn xa),
// một bước chuẩn bị riêng; xóa hết khi xong.
describe('Phase 5.5: Kế hoạch chuẩn bị SX', () => {
  let app: INestApplication;
  let order: OrderDb;
  let sewing: SewingDb;
  let core: CoreDb;
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const STYLE = 'TEST-P55-FIX';
  const STEP = 'TEST-P55-STEP';
  const PAST = '2026-01-05';
  const FUTURE = '2027-09-01';
  const fx = { lineL03: 0, lineL05: 0, planId: 0 };
  const TEST_PASSWORD = 'Test@2026x';
  const tempUsers: number[] = [];

  async function tokenFor(username: string, branchCode: string) {
    const l = await api().post('/api/v1/auth/login').send({ username, password: env.demoPassword });
    const s = await api().post('/api/v1/auth/select-branch').set('Authorization', `Bearer ${l.body.preAuthToken}`).send({ branchCode });
    if (!s.body.accessToken) throw new Error(`Không chọn được ${branchCode} cho ${username}: ${JSON.stringify(s.body)}`);
    return s.body.accessToken as string;
  }

  async function dropFixture() {
    await sewing.deleteFrom('SewingPrep').where('StyleCode', '=', STYLE).execute();
    const steps = sewing.selectFrom('PrepStep').select('Id').where('Code', '=', STEP);
    await sewing.deleteFrom('SewingPrepStep').where('PrepStepId', 'in', steps).execute();
    await sewing.deleteFrom('PrepStep').where('Code', '=', STEP).execute();
    const orders = order.selectFrom('SalesOrder').select('Id').where('StyleCode', '=', STYLE).where('BranchCode', '=', 'A01');
    const plans = order.selectFrom('ShipmentPlan').select('Id').where('SalesOrderId', 'in', orders);
    await order.deleteFrom('ShipmentPlanLine').where('ShipmentPlanId', 'in', plans).execute();
    await order.deleteFrom('ShipmentPlan').where('SalesOrderId', 'in', orders).execute();
    await order.deleteFrom('SalesOrder').where('StyleCode', '=', STYLE).where('BranchCode', '=', 'A01').execute();
  }

  async function createFixture() {
    await dropFixture();
    const own = { BranchCode: 'A01', CreatedBy: null };
    const id = async (table: string, values: object) => ((await order.insertInto(table as any).values(values as any).output('inserted.Id' as any).executeTakeFirstOrThrow()) as { Id: number }).Id;
    const orderId = await id('SalesOrder', { OrderNo: 'TEST-P55', CustomerName: 'KHÁCH TEST P55', StyleCode: STYLE, ProductName: 'Áo test', Qty: 600, UnitName: 'Chiếc', ShipDate: '2027-12-31', StatusCode: 'PLANNING', ...own });
    fx.planId = await id('ShipmentPlan', { PlanNo: 'TEST-P55-1', SalesOrderId: orderId, CustomerName: 'KHÁCH TEST P55', StyleCode: STYLE, ProductName: 'Áo test', PoBuyDate: 'TEST', PlanQty: 600, ShipDate: '2027-12-31', PlannerName: 'Test', StatusCode: 'SCHEDULED', ...own });
    const line = (lineCode: string, start: string, sort: number) =>
      id('ShipmentPlanLine', { ShipmentPlanId: fx.planId, LineCode: lineCode, Qty: 300, AvgOutput: 300, StartDate: start, ProductionDays: 1, OffDays: 0, EndDate: start, StatusCode: 'PLANNED', SortOrder: sort, ...own });
    fx.lineL03 = await line('A01-L03', PAST, 0);
    fx.lineL05 = await line('A01-L05', FUTURE, 1);
  }

  const mine = async (token: string, extra = '') => (await api().get(`/api/v1/sewing/prep?style=${STYLE}&startFrom=2020-01-01&pageSize=50${extra}`).set(auth(token)).expect(200)).body;
  const rowOf = (body: any, lineCode: string) => body.items.find((r: any) => r.lineCode === lineCode);
  const lines = (body: any) => body.items.map((r: any) => r.lineCode);
  const done = (row: any, stepId: number) => row.steps.find((v: any) => v.stepId === stepId).doneDate;
  const saveDone = (token: string, items: object[]) => api().put('/api/v1/sewing/prep').set(auth(token)).send({ items });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    order = app.get<OrderDb>(ORDER_DB);
    sewing = app.get<SewingDb>(SEWING_DB);
    core = app.get<CoreDb>(CORE_DB);
    await createFixture();
  });

  /** Tài khoản thử một vai trò ở các nhà máy (tạo hoặc bật lại), có thể giới hạn chuyền; afterAll gỡ vai trò và khóa lại. */
  async function tempUser(username: string, role: string, branchCodes: string[], line?: string) {
    const admin = await tokenFor('admin', 'A01');
    const roles = (await api().get('/api/v1/admin/roles').set(auth(admin))).body as { id: number; code: string }[];
    const branches = (await api().get('/api/v1/admin/branches').set(auth(admin))).body as { id: number; code: string }[];
    const created = await api().post('/api/v1/admin/users').set(auth(admin)).send({ username, fullName: `${username} (test)`, initialPassword: TEST_PASSWORD });
    const id: number = created.status === 201 ? created.body.id : (await api().get(`/api/v1/admin/users?q=${username}`).set(auth(admin))).body.items.find((u: any) => u.username === username).id;
    if (created.status !== 201) {
      await api().post(`/api/v1/admin/users/${id}/reset-password`).set(auth(admin)).send({ newPassword: TEST_PASSWORD }).expect(200);
      await api().put(`/api/v1/admin/users/${id}`).set(auth(admin)).send({ isActive: true, unlock: true }).expect(200);
    }
    tempUsers.push(id);
    const roleId = roles.find((r) => r.code === role)!.id;
    await api().put(`/api/v1/admin/users/${id}/roles`).set(auth(admin)).send({ roleIds: [] }).expect(200);
    await api().put(`/api/v1/admin/users/${id}/roles`).set(auth(admin)).send({ roleIds: [roleId] }).expect(200);
    await api().put(`/api/v1/admin/users/${id}/branches`).set(auth(admin)).send({ branchIds: branchCodes.map((c) => branches.find((b) => b.code === c)!.id) }).expect(200);
    if (line) {
      // Phạm vi chuyền lưu theo mã bộ phận chuyền (phase 5.10)
      await api().put(`/api/v1/admin/users/${id}/roles/${roleId}/scope`).set(auth(admin)).send({ scopes: [{ dimension: 'LINE', mode: 'LIST', value: line }] }).expect(200);
    }
    return async (branchCode: string) => {
      const l = await api().post('/api/v1/auth/login').send({ username, password: TEST_PASSWORD });
      const sel = await api().post('/api/v1/auth/select-branch').set('Authorization', `Bearer ${l.body.preAuthToken}`).send({ branchCode });
      if (!sel.body.accessToken) throw new Error(`Không chọn được ${branchCode} cho ${username}: ${JSON.stringify(sel.body)}`);
      return sel.body.accessToken as string;
    };
  }

  /** Chính sách cột của vai trò Kế hoạch cho order.prep (null: bỏ) */
  async function plannerPolicy(field: string, level: string | null) {
    const admin = await tokenFor('admin', 'A01');
    const roles = (await api().get('/api/v1/admin/roles').set(auth(admin))).body as { id: number; code: string }[];
    const matrix = (await api().get('/api/v1/admin/permissions').set(auth(admin))).body;
    const resourceId = matrix.modules.flatMap((m: any) => m.resources).find((r: any) => r.code === 'order.prep').id;
    const planner = roles.find((r) => r.code === 'PLANNER')!.id;
    await api().put(`/api/v1/admin/roles/${planner}/field-policies`).set(auth(admin)).send({ resourceId, policies: [{ fieldCode: field, accessLevel: level }] }).expect(200);
  }

  afterAll(async () => {
    const admin = await tokenFor('admin', 'A01');
    for (const id of tempUsers) {
      await api().put(`/api/v1/admin/users/${id}/roles`).set(auth(admin)).send({ roleIds: [] }).expect(200);
      await api().put(`/api/v1/admin/users/${id}`).set(auth(admin)).send({ isActive: false }).expect(200);
    }
    await dropFixture();
    await app.close();
  });

  it('quy tắc KH và trạng thái: KH = ngày vào chuyền - số ngày (chỉnh riêng thắng danh mục)', () => {
    expect(stepValue('2026-10-10', { PlanDays: 2 }, undefined, '2026-10-01')).toMatchObject({ planDays: 2, custom: false, planDate: '2026-10-08', doneDate: null, state: 'PENDING' });
    expect(stepValue('2026-10-10', { PlanDays: 2 }, { PlanDays: 5, DoneDate: null }, '2026-10-06')).toMatchObject({ planDays: 5, custom: true, planDate: '2026-10-05', state: 'OVERDUE' });
    expect(stepValue('2026-10-10', { PlanDays: 0 }, { PlanDays: null, DoneDate: new Date('2026-10-10T00:00:00Z') }, '2026-10-20').state).toBe('DONE');
    expect(stepValue('2026-10-10', { PlanDays: 1 }, { PlanDays: null, DoneDate: new Date('2026-10-12T00:00:00Z') }, '2026-10-20').state).toBe('DONE_LATE');
    // Chưa đến ngày vào chuyền: nhập đủ TH hay chưa cũng là Chưa đến ngày V/C
    expect(prepStatus('2026-10-20', ['PENDING'], '2026-10-10')).toBe('NOT_DUE');
    expect(prepStatus('2026-10-20', ['DONE', 'DONE_LATE'], '2026-10-10')).toBe('NOT_DUE');
    // Đúng ngày vào chuyền là đã đến ngày
    expect(prepStatus('2026-10-10', ['DONE', 'DONE_LATE'], '2026-10-10')).toBe('READY');
    expect(prepStatus('2026-10-01', ['DONE', 'OVERDUE'], '2026-10-10')).toBe('NOT_READY');
    expect(prepStatus('2026-10-01', [], '2026-10-10')).toBe('READY');
    // Tuần thứ Hai – Chủ nhật
    expect(weekOf('2026-10-10')).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(weekOf('2026-10-05')).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(weekOf('2026-10-11')).toEqual({ from: '2026-10-05', to: '2026-10-11' });
  });

  it('mở màn chép dòng dàn chuyền sang; KH, trạng thái tính đúng; lọc trạng thái trong SQL khớp', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const body = await mine(planner);
    expect(body.total).toBe(2);
    expect(body.stepInfo.length).toBeGreaterThan(0);
    const past = rowOf(body, 'A01-L03');
    const future = rowOf(body, 'A01-L05');
    expect(past).toMatchObject({ startDate: PAST, planNo: 'TEST-P55-1', styleCode: STYLE, statusCode: 'NOT_READY', canEdit: true });
    expect(future.statusCode).toBe('NOT_DUE');
    const first = body.stepInfo[0];
    const v = future.steps.find((s: any) => s.stepId === first.id);
    const d = new Date(`${FUTURE}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - first.planDays);
    expect(v.planDate).toBe(d.toISOString().slice(0, 10));
    expect(lines(await mine(planner, '&status=NOT_READY'))).toEqual(['A01-L03']);
    expect(lines(await mine(planner, '&status=NOT_DUE'))).toEqual(['A01-L05']);
    expect((await mine(planner, '&status=READY')).total).toBe(0);
  });

  it('thanh tuần: dòng vào chuyền trong tuần, cộng việc đến hạn tới hết tuần mà chưa có TH; thứ tự mặc định theo tổ, mã hàng', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    expect(lines(await mine(planner))).toEqual(['A01-L03', 'A01-L05']);
    expect(lines(await mine(planner, '&sort=startDate:desc'))).toEqual(['A01-L05', 'A01-L03']);
    // Trường lạ thì về thứ tự mặc định, không lỗi
    expect(lines(await mine(planner, '&sort=bogus:asc,StartDate:desc'))).toEqual(['A01-L03', 'A01-L05']);
    // Tuần vào chuyền của chuyền 3 (thứ Hai 05/01/2026): chuyền 5 vào chuyền năm sau, chưa có việc đến hạn
    expect(lines(await mine(planner, '&week=2026-01-08'))).toEqual(['A01-L03']);
    // Tuần vào chuyền của chuyền 5: chuyền 3 còn việc tồn chưa nhập TH nên vẫn hiện
    expect(lines(await mine(planner, '&week=2027-09-01'))).toEqual(['A01-L03', 'A01-L05']);
    // Tuần kết hợp trạng thái: trong tuần vào chuyền của chuyền 5, chỉ chuyền 5 chưa đến ngày vào chuyền
    expect(lines(await mine(planner, '&week=2027-09-01&status=NOT_DUE'))).toEqual(['A01-L05']);
    expect(lines(await mine(planner, '&week=2027-09-01&status=NOT_READY'))).toEqual(['A01-L03']);
    expect((await mine(planner, '&week=2020-01-01')).total).toBe(0);
    await api().get('/api/v1/sewing/prep?week=2026-02-30').set(auth(planner)).expect(422);
  });

  it('sửa một dòng: cột nhập tay, số ngày chỉnh riêng, ngày thực hiện; số ngày bằng danh mục thì không tính chỉnh riêng; đủ TH là Hoàn thành', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const body = await mine(planner);
    const row = rowOf(body, 'A01-L03');
    const [s1, s2] = body.stepInfo;
    const today = todayVN();
    const res = await api()
      .put(`/api/v1/sewing/prep/${row.id}`)
      .set(auth(planner))
      .send({ styleType: 'Mã mới', confirmedQty: 280, priorityFactor: 1.25, steps: [{ stepId: s1.id, doneDate: today }, { stepId: s2.id, planDays: s2.planDays + 3 }] })
      .expect(200);
    expect(res.body).toMatchObject({ styleType: 'Mã mới', confirmedQty: 280, priorityFactor: 1.25 });
    const v1 = res.body.steps.find((s: any) => s.stepId === s1.id);
    const v2 = res.body.steps.find((s: any) => s.stepId === s2.id);
    expect(v1).toMatchObject({ doneDate: today, custom: false });
    expect(v2).toMatchObject({ planDays: s2.planDays + 3, custom: true });

    // Gửi lại đúng số của danh mục: bỏ chỉnh riêng; bỏ cả ngày thực hiện thì dòng con bị xóa
    await api().put(`/api/v1/sewing/prep/${row.id}`).set(auth(planner)).send({ steps: [{ stepId: s2.id, planDays: s2.planDays }, { stepId: s1.id, doneDate: null }] }).expect(200);
    expect(await sewing.selectFrom('SewingPrepStep').select('Id').where('SewingPrepId', '=', row.id).execute()).toHaveLength(0);

    // Nhập TH cho mọi bước đang dùng: Hoàn thành
    await api()
      .put(`/api/v1/sewing/prep/${row.id}`)
      .set(auth(planner))
      .send({ steps: body.stepInfo.map((s: any) => ({ stepId: s.id, doneDate: PAST })) })
      .expect(200);
    expect(rowOf(await mine(planner), 'A01-L03').statusCode).toBe('READY');
    expect(lines(await mine(planner, '&status=READY'))).toEqual(['A01-L03']);
    // Đủ TH thì hết việc tồn: tuần của chuyền 5 chỉ còn chuyền 5
    expect(lines(await mine(planner, '&week=2027-09-01'))).toEqual(['A01-L05']);
  });

  it('lưu ngày TH trên bảng: nhiều dòng một lần; ô người khác vừa sửa thì không ghi gì; bỏ TH vẫn giữ số ngày chỉnh riêng', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const body = await mine(planner);
    const l03 = rowOf(body, 'A01-L03');
    const l05 = rowOf(body, 'A01-L05');
    const [s1, s2] = body.stepInfo;
    const today = todayVN();
    const saved = await saveDone(planner, [
      { id: l05.id, steps: [{ stepId: s1.id, doneDate: today, previous: null }] },
      { id: l03.id, steps: [{ stepId: s1.id, doneDate: null, previous: PAST }] },
    ]).expect(200);
    expect(saved.body).toEqual({ rows: 2, cells: 2 });
    let after = await mine(planner);
    expect(done(rowOf(after, 'A01-L05'), s1.id)).toBe(today);
    expect(rowOf(after, 'A01-L03').statusCode).toBe('NOT_READY');

    // Ô của chuyền 5 đã có ngày (người khác vừa nhập) mà lần lưu này tưởng còn trống: không ghi gì, kể cả ô của chuyền 3
    const clash = await saveDone(planner, [
      { id: l03.id, steps: [{ stepId: s1.id, doneDate: PAST, previous: null }] },
      { id: l05.id, steps: [{ stepId: s1.id, doneDate: PAST, previous: null }] },
    ]).expect(409);
    expect(clash.body.error.message).toContain(STYLE);
    expect(clash.body.error.details).toEqual({ cells: [{ id: l05.id, stepId: s1.id, doneDate: today }] });
    after = await mine(planner);
    expect(done(rowOf(after, 'A01-L03'), s1.id)).toBeNull();
    expect(done(rowOf(after, 'A01-L05'), s1.id)).toBe(today);
    // Người khác đã nhập đúng ngày này: không phải xung đột, không có gì để ghi
    expect((await saveDone(planner, [{ id: l05.id, steps: [{ stepId: s1.id, doneDate: today, previous: null }] }]).expect(200)).body).toEqual({ rows: 0, cells: 0 });

    // Bỏ TH của bước có số ngày chỉnh riêng: giữ số ngày
    await api().put(`/api/v1/sewing/prep/${l05.id}`).set(auth(planner)).send({ steps: [{ stepId: s2.id, planDays: s2.planDays + 2, doneDate: today }] }).expect(200);
    await saveDone(planner, [{ id: l05.id, steps: [{ stepId: s2.id, doneDate: null }] }]).expect(200);
    expect(rowOf(await mine(planner), 'A01-L05').steps.find((v: any) => v.stepId === s2.id)).toMatchObject({ doneDate: null, custom: true, planDays: s2.planDays + 2 });

    // Kiểm đầu vào: ngày sau hôm nay, dòng gửi hai lần, bước gửi hai lần, bước không có, ngày không có thật, danh sách rỗng
    await saveDone(planner, [{ id: l03.id, steps: [{ stepId: s1.id, doneDate: '2099-01-01' }] }]).expect(422);
    await saveDone(planner, [{ id: l03.id, steps: [{ stepId: s1.id, doneDate: PAST }] }, { id: l03.id, steps: [{ stepId: s2.id, doneDate: PAST }] }]).expect(422);
    await saveDone(planner, [{ id: l03.id, steps: [{ stepId: s1.id, doneDate: PAST }, { stepId: s1.id, doneDate: null }] }]).expect(422);
    await saveDone(planner, [{ id: l03.id, steps: [{ stepId: 999999, doneDate: PAST }] }]).expect(422);
    await saveDone(planner, [{ id: l03.id, steps: [{ stepId: s1.id, doneDate: '2026-02-30' }] }]).expect(422);
    await saveDone(planner, []).expect(422);
    // Dòng không có (hoặc của nhà máy khác): 404, không ghi gì
    const gone = await saveDone(planner, [{ id: l03.id, steps: [{ stepId: s1.id, doneDate: PAST }] }, { id: 2147483000, steps: [{ stepId: s1.id, doneDate: PAST }] }]).expect(404);
    // Trả Id các dòng không lưu được để lưới bỏ ô nháp của chúng, giữ phần còn lại
    expect(gone.body.error.details).toEqual({ ids: [2147483000] });
    // Body lớn hơn mức 100 KB mặc định vẫn được nhận (ở đây 2.000 ô, bị từ chối vì bước không có chứ không vì quá lớn)
    const big = Array.from({ length: 10 }, (_, i) => ({ id: 2147483000 - i, steps: Array.from({ length: 200 }, (_x, k) => ({ stepId: 900000 + k, doneDate: PAST, previous: PAST })) }));
    expect(JSON.stringify({ items: big }).length).toBeGreaterThan(100 * 1024);
    await saveDone(planner, big).expect(422);
    expect(done(rowOf(await mine(planner), 'A01-L03'), s1.id)).toBeNull();

    await saveDone(planner, [{ id: l03.id, steps: [{ stepId: s1.id, doneDate: PAST, previous: null }] }]).expect(200);
    expect(rowOf(await mine(planner), 'A01-L03').statusCode).toBe('READY');
  });

  it('lưu trên bảng: thêm, sửa, xóa ô của nhiều dòng một lần; nhật ký mỗi dòng một mục sau khi lưu, lần bị 409 hay 404 không để lại nhật ký', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const start = await mine(planner);
    const s2 = start.stepInfo[1];
    const original = done(rowOf(start, 'A01-L03'), s2.id);
    // Tự dựng trạng thái đầu: chuyền 3 không có dòng con của bước 2 (lần lưu đầu phải thêm); chuyền 5 có, nhờ số ngày chỉnh
    // riêng (lần lưu đầu là sửa, lần bỏ TH vẫn giữ dòng)
    await sewing.deleteFrom('SewingPrepStep').where('SewingPrepId', '=', rowOf(start, 'A01-L03').id).where('PrepStepId', '=', s2.id).execute();
    await api().put(`/api/v1/sewing/prep/${rowOf(start, 'A01-L05').id}`).set(auth(planner)).send({ steps: [{ stepId: s2.id, planDays: s2.planDays + 2, doneDate: null }] }).expect(200);
    const body = await mine(planner);
    const l03 = rowOf(body, 'A01-L03');
    const l05 = rowOf(body, 'A01-L05');
    // Id nhật ký là BIGINT (chuỗi)
    const mark = String((await core.selectFrom('SysAuditLog').select((eb) => eb.fn.max('Id').as('m')).executeTakeFirst())?.m ?? '0');
    const logs = () =>
      core
        .selectFrom('SysAuditLog')
        .select(['EntityId', 'NewValue'])
        .where('EntityType', '=', 'SewingPrep')
        .where('EntityId', 'in', [String(l03.id), String(l05.id)])
        .where('Id', '>', mark)
        .orderBy('Id')
        .execute();
    const child = (id: number) => sewing.selectFrom('SewingPrepStep').select(['DoneDate', 'PlanDays']).where('SewingPrepId', '=', id).where('PrepStepId', '=', s2.id).executeTakeFirst();
    expect(await child(l03.id)).toBeUndefined();
    expect(await child(l05.id)).toBeDefined();
    const first = [
      { id: l03.id, steps: [{ stepId: s2.id, doneDate: PAST, previous: done(l03, s2.id) }] },
      { id: l05.id, steps: [{ stepId: s2.id, doneDate: PAST, previous: done(l05, s2.id) }] },
    ];
    expect((await saveDone(planner, first).expect(200)).body).toEqual({ rows: 2, cells: 2 });
    let after = await mine(planner);
    expect([done(rowOf(after, 'A01-L03'), s2.id), done(rowOf(after, 'A01-L05'), s2.id)]).toEqual([PAST, PAST]);
    let log = await logs();
    expect(log.map((l) => l.EntityId).sort()).toEqual([String(l03.id), String(l05.id)].sort());
    expect(JSON.parse(log[0].NewValue!).steps[0]).toMatchObject({ stepId: s2.id, doneDate: PAST });

    // Bỏ TH cả hai: chuyền 3 mất dòng con (xóa), chuyền 5 giữ dòng vì còn số ngày chỉnh riêng (sửa về trống)
    const cleared = [l03, l05].map((r) => ({ id: r.id, steps: [{ stepId: s2.id, doneDate: null, previous: PAST }] }));
    expect((await saveDone(planner, cleared).expect(200)).body).toEqual({ rows: 2, cells: 2 });
    expect(await child(l03.id)).toBeUndefined();
    expect(await child(l05.id)).toMatchObject({ DoneDate: null });
    expect((await logs()).length).toBe(4);

    // Xung đột (ngày lúc bắt đầu sửa đã cũ) và dòng không có: không ghi gì, không có nhật ký
    await saveDone(planner, [{ id: l03.id, steps: [{ stepId: s2.id, doneDate: PAST, previous: PAST }] }]).expect(409);
    await saveDone(planner, [{ id: l03.id, steps: [{ stepId: s2.id, doneDate: PAST, previous: null }] }, { id: 2147483000, steps: [{ stepId: s2.id, doneDate: PAST }] }]).expect(404);
    after = await mine(planner);
    expect(done(rowOf(after, 'A01-L03'), s2.id)).toBeNull();
    log = await logs();
    expect(log.length).toBe(4);
    // Trả ngày ban đầu cho các test sau
    await saveDone(planner, [{ id: l03.id, steps: [{ stepId: s2.id, doneDate: original, previous: null }] }]).expect(200);

    // Mức tối đa máy chủ nhận (500 dòng, 5.000 ô) vẫn dưới giới hạn body: bị từ chối vì bước không có, không phải vì quá lớn
    const max = Array.from({ length: 500 }, (_, i) => ({ id: 2147483000 - i, steps: Array.from({ length: 10 }, (_x, k) => ({ stepId: 2147480000 + k, doneDate: PAST, previous: PAST })) }));
    expect(JSON.stringify({ items: max }).length).toBeGreaterThan(300 * 1024);
    await saveDone(planner, max).expect(422);
  });

  it('kiểm đầu vào: ngày thực hiện sau hôm nay, bước không có, bước gửi hai lần, số ngày quá 365 đều 422', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const body = await mine(planner);
    const id = rowOf(body, 'A01-L05').id;
    const s = body.stepInfo[0].id;
    await api().put(`/api/v1/sewing/prep/${id}`).set(auth(planner)).send({ steps: [{ stepId: s, doneDate: '2099-01-01' }] }).expect(422);
    await api().put(`/api/v1/sewing/prep/${id}`).set(auth(planner)).send({ steps: [{ stepId: 999999, doneDate: PAST }] }).expect(422);
    await api().put(`/api/v1/sewing/prep/${id}`).set(auth(planner)).send({ steps: [{ stepId: s, doneDate: PAST }, { stepId: s, planDays: 1 }] }).expect(422);
    await api().put(`/api/v1/sewing/prep/${id}`).set(auth(planner)).send({ steps: [{ stepId: s, planDays: 366 }] }).expect(422);
  });

  it('phạm vi: Trưởng chuyền 3 chỉ thấy chuyền 3, không sửa được; A00 xem mọi nhà máy nhưng không ghi', async () => {
    const tc = await tokenFor('truongchuyen.a', 'A01');
    const seen = await mine(tc);
    expect(seen.items.map((r: any) => r.lineCode)).toEqual(['A01-L03']);
    await api().put(`/api/v1/sewing/prep/${seen.items[0].id}`).set(auth(tc)).send({ styleType: 'x' }).expect(403);
    expect(seen.items[0].canEdit).toBe(false);
    const step = seen.stepInfo[0].id;
    await saveDone(tc, [{ id: seen.items[0].id, steps: [{ stepId: step, doneDate: PAST }] }]).expect(403);
    const planner = await tokenFor('kehoach.a', 'A01');
    await api().get(`/api/v1/sewing/prep/${rowOf(await mine(planner), 'A01-L05').id}`).set(auth(tc)).expect(404);

    const gd = await tokenFor('giamdoc', 'A00');
    const all = await mine(gd);
    expect(all.total).toBe(2);
    expect(all.items.every((r: any) => r.canEdit === false)).toBe(true);
    await api().put(`/api/v1/sewing/prep/${all.items[0].id}`).set(auth(gd)).send({ styleType: 'x' }).expect(403);
    // Ô Đơn vị của phiên A00: lựa chọn là các nhà máy đang có dòng (phạm vi xem), không phải nhà máy được gán; chỉ một nhà máy
    const units = (await api().get(`/api/v1/sewing/prep/values?field=branchCode&style=${STYLE}`).set(auth(gd)).expect(200)).body.values;
    expect(units).toEqual(['A01']);
    expect((await mine(gd, '&branch=A01')).total).toBe(2);
    expect((await mine(gd, '&branch=A02')).total).toBe(0);
    await api().get('/api/v1/sewing/prep?branch=A01%27').set(auth(gd)).expect(422);
  });

  it('lưu trên bảng: A00 có quyền sửa vẫn bị chặn; dòng của nhà máy khác hoặc ngoài chuyền được giao thì 404 kèm Id, không ghi gì', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const body = await mine(planner);
    const l03 = rowOf(body, 'A01-L03');
    const step = body.stepInfo[0].id;
    const before = done(l03, step);
    const cell = [{ id: l03.id, steps: [{ stepId: step, doneDate: null }] }];

    const multi = await tempUser('test.p55.multi', 'PLANNER', ['A00', 'A01', 'A02']);
    const atA00 = await multi('A00');
    expect((await mine(atA00)).items.every((r: any) => r.canEdit === false)).toBe(true);
    expect((await saveDone(atA00, cell).expect(403)).body.error.code).toBe('AGGREGATE_READ_ONLY');
    // Phiên A02 gửi Id dòng của A01
    expect((await saveDone(await multi('A02'), cell).expect(404)).body.error.details).toEqual({ ids: [l03.id] });

    // Kế hoạch chỉ được giao chuyền 5: thấy, sửa được chuyền 5; gửi Id dòng chuyền 3 thì 404
    const line5 = await (await tempUser('test.p55.line', 'PLANNER', ['A01'], 'A01-L05'))('A01');
    const seen = await mine(line5);
    expect(seen.items.map((r: any) => [r.lineCode, r.canEdit])).toEqual([['A01-L05', true]]);
    expect((await saveDone(line5, cell).expect(404)).body.error.details).toEqual({ ids: [l03.id] });
    expect(done(rowOf(await mine(planner), 'A01-L03'), step)).toBe(before);
  });

  it('sắp xếp nhiều cột ở repository: cột ngoài danh sách trắng bị bỏ, cột trùng lấy lần đầu, luôn thêm Id cuối', () => {
    const calls: [string, string][] = [];
    const qb: any = { selectAll: () => qb, select: () => qb, orderBy: (c: string, d: string) => (calls.push([c, d]), qb) };
    const repo = app.get(SewingPrepRepository) as any;
    const order = (sort?: string) => {
      calls.length = 0;
      repo.ordered(qb, { sort });
      return [...calls];
    };
    expect(order('Foo:asc,LineCode:desc,LineCode:asc,StyleCode')).toEqual([['SewingPrep.LineCode', 'desc'], ['SewingPrep.StyleCode', 'desc'], ['SewingPrep.Id', 'desc']]);
    // Như trước khi có nhiều cột: một cột thì thêm Id giảm dần; cột lạ thì theo Id với chiều đã gửi
    expect(order('StartDate:asc')).toEqual([['SewingPrep.StartDate', 'asc'], ['SewingPrep.Id', 'desc']]);
    expect(order('Foo:asc')).toEqual([['SewingPrep.Id', 'asc']]);
    expect(order('Id:asc')).toEqual([['SewingPrep.Id', 'asc']]);
    expect(order('linecode:asc')).toEqual([['SewingPrep.Id', 'asc']]);
    expect(order(undefined)[0]).toEqual(['SewingPrep.BranchCode', 'asc']);
  });

  it('theo Xếp chuyền: đổi ngày vào chuyền thì KH đổi theo; dòng dàn chuyền bị bỏ thì dòng chuẩn bị mất theo', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    await order.updateTable('ShipmentPlanLine').set({ StartDate: '2027-10-01', EndDate: '2027-10-01' }).where('Id', '=', fx.lineL05).execute();
    const moved = rowOf(await mine(planner), 'A01-L05');
    expect(moved.startDate).toBe('2027-10-01');
    await order.deleteFrom('ShipmentPlanLine').where('Id', '=', fx.lineL05).execute();
    const after = await mine(planner);
    expect(after.items.map((r: any) => r.lineCode)).toEqual(['A01-L03']);
    expect(await sewing.selectFrom('SewingPrep').select('Id').where('ShipmentPlanLineId', '=', fx.lineL05).execute()).toHaveLength(0);
  });

  it('danh mục bước: chỉ quản trị thêm, sửa; bước mới thành cột mới, ngừng dùng thì mất cột', async () => {
    const admin = await tokenFor('admin', 'A01');
    const planner = await tokenFor('kehoach.a', 'A01');
    await api().post('/api/v1/sewing/prep-steps').set(auth(planner)).send({ code: STEP, name: 'Bước test', planDays: 3 }).expect(403);
    const created = (await api().post('/api/v1/sewing/prep-steps').set(auth(admin)).send({ code: STEP.toLowerCase(), name: ' Bước test ', planDays: 3, performer: 'Test' }).expect(201)).body;
    expect(created).toMatchObject({ code: STEP, name: 'Bước test', planDays: 3, isActive: true });
    await api().post('/api/v1/sewing/prep-steps').set(auth(admin)).send({ code: STEP, name: 'Trùng', planDays: 1 }).expect(409);
    expect((await mine(planner)).stepInfo.some((s: any) => s.id === created.id)).toBe(true);

    const saved = (await api().put('/api/v1/sewing/prep-steps').set(auth(admin)).send({ items: [{ id: created.id, planDays: 7, isActive: false }] }).expect(200)).body;
    expect(saved.updated).toBe(1);
    expect(saved.items.find((s: any) => s.id === created.id)).toMatchObject({ planDays: 7, isActive: false });
    expect((await mine(planner)).stepInfo.some((s: any) => s.id === created.id)).toBe(false);
    await api().put('/api/v1/sewing/prep-steps').set(auth(planner)).send({ items: [{ id: created.id, isActive: true }] }).expect(403);
  });

  it('chính sách cột: các bước Chỉ đọc thì không gửi được; bị Ẩn thì không có trong dữ liệu và file xuất', async () => {
    const admin = await tokenFor('admin', 'A01');
    const roles = (await api().get('/api/v1/admin/roles').set(auth(admin))).body as { id: number; code: string }[];
    const matrix = (await api().get('/api/v1/admin/permissions').set(auth(admin))).body;
    const resourceId = matrix.modules.flatMap((m: any) => m.resources).find((r: any) => r.code === 'order.prep').id;
    const planner = roles.find((r) => r.code === 'PLANNER')!.id;
    const policy = (level: string | null) =>
      api().put(`/api/v1/admin/roles/${planner}/field-policies`).set(auth(admin)).send({ resourceId, policies: [{ fieldCode: 'steps', accessLevel: level }] }).expect(200);
    // Chuyền 3 còn một bước chưa có TH (việc tồn), để thấy thanh tuần không dựa vào các bước khi người xem không được xem
    let t = await tokenFor('kehoach.a', 'A01');
    const before = await mine(t);
    const first = before.stepInfo[0].id;
    const row = before.items[0];
    await saveDone(t, [{ id: row.id, steps: [{ stepId: first, doneDate: null }] }]).expect(200);
    try {
      await policy('READONLY');
      t = await tokenFor('kehoach.a', 'A01');
      const res = await api().put(`/api/v1/sewing/prep/${row.id}`).set(auth(t)).send({ steps: [] }).expect(403);
      expect(res.body.error.code).toBe('FIELD_READONLY');
      expect((await saveDone(t, [{ id: row.id, steps: [{ stepId: first, doneDate: PAST }] }]).expect(403)).body.error.code).toBe('FIELD_READONLY');
      await api().put(`/api/v1/sewing/prep/${row.id}`).set(auth(t)).send({ styleType: 'Được sửa' }).expect(200);

      await policy('HIDDEN');
      t = await tokenFor('kehoach.a', 'A01');
      expect((await mine(t)).items[0].steps).toBeUndefined();
      const csv = await api().get(`/api/v1/sewing/prep/export?style=${STYLE}&startFrom=2020-01-01`).set(auth(t)).expect(200);
      expect(csv.text).not.toContain(' - KH');
      // Không xem được các bước: tuần chỉ lọc theo ngày vào chuyền; gửi các bước cũng bị chặn
      expect((await mine(t, '&week=2027-09-01')).total).toBe(0);
      expect(lines(await mine(t, '&week=2026-01-05'))).toEqual(['A01-L03']);
      expect((await saveDone(t, [{ id: row.id, steps: [{ stepId: first, doneDate: PAST }] }]).expect(403)).body.error.code).toBe('FIELD_READONLY');
    } finally {
      await policy(null);
    }
    t = await tokenFor('kehoach.a', 'A01');
    expect(lines(await mine(t, '&week=2027-09-01'))).toEqual(['A01-L03']);
    const pending = await api().get(`/api/v1/sewing/prep/export?style=${STYLE}&startFrom=2020-01-01`).set(auth(t)).expect(200);
    expect(pending.text).toContain('Chưa đủ đk V/C');
    await saveDone(t, [{ id: row.id, steps: [{ stepId: first, doneDate: PAST }] }]).expect(200);
    const csv = await api().get(`/api/v1/sewing/prep/export?style=${STYLE}&startFrom=2020-01-01`).set(auth(t)).expect(200);
    expect(csv.text).toContain('Ngày vào chuyền');
    expect(csv.text).toContain(' - KH');
    expect(csv.text).toContain('Đủ điều kiện V/C');
    // Trạng thái đứng ngay sau Ngày vào chuyền, trước các bước
    const head = csv.text.replace(/^\uFEFF/, '').split(/\r?\n/)[0];
    expect(head.indexOf('Trạng thái')).toBeGreaterThan(head.indexOf('Ngày vào chuyền'));
    expect(head.indexOf('Trạng thái')).toBeLessThan(head.indexOf(' - KH'));
  });

  it('Mã hàng bị Che: câu báo xung đột không nêu mã hàng, chỉ nêu số dòng', async () => {
    let t = await tokenFor('kehoach.a', 'A01');
    const body = await mine(t);
    const row = rowOf(body, 'A01-L03');
    const step = body.stepInfo[0].id;
    try {
      await plannerPolicy('styleCode', 'MASKED');
      t = await tokenFor('kehoach.a', 'A01');
      const res = await saveDone(t, [{ id: row.id, steps: [{ stepId: step, doneDate: null, previous: '2020-01-01' }] }]).expect(409);
      expect(res.body.error.message).toContain(`dòng ${row.id}`);
      expect(res.body.error.message).not.toContain(STYLE);
    } finally {
      await plannerPolicy('styleCode', null);
    }
  });

  it('chuyền mồ côi (mã không còn là bộ phận chuyền nào, Q4 phase 5.10): dòng hiện mã kèm "(chuyền cũ)", không lỗi; Tổ SX bị Che thì không trả tên', async () => {
    // Như dòng dàn chuyền gắn chuyền cũ A01-L01… trên máy chủ trước 5.10: mã không phải bộ phận nào
    const own = { BranchCode: 'A01', CreatedBy: null };
    const orphan = (
      (await order
        .insertInto('ShipmentPlanLine')
        .values({ ShipmentPlanId: fx.planId, LineCode: 'A01-T55X', Qty: 100, AvgOutput: 100, StartDate: FUTURE, ProductionDays: 1, OffDays: 0, EndDate: FUTURE, StatusCode: 'PLANNED', SortOrder: 9, ...own } as any)
        .output('inserted.Id' as any)
        .executeTakeFirstOrThrow()) as { Id: number }
    ).Id;
    try {
      let t = await tokenFor('kehoach.a', 'A01');
      const body = await mine(t);
      const row = rowOf(body, 'A01-T55X');
      expect(row).toMatchObject({ lineCode: 'A01-T55X', lineName: 'A01-T55X (chuyền cũ)' });
      const l03 = ((await api().get('/api/v1/me/lines').set(auth(t)).expect(200)).body as { code: string; name: string }[]).find((l) => l.code === 'A01-L03');
      expect(rowOf(body, 'A01-L03').lineName).toBe(l03!.name);
      expect((await api().get(`/api/v1/sewing/prep/${row.id}`).set(auth(t)).expect(200)).body.lineName).toBe('A01-T55X (chuyền cũ)');
      await api().get(`/api/v1/sewing/prep/export?style=${STYLE}&startFrom=2020-01-01`).set(auth(t)).expect(200);
      // Tên suy ra được mã: Tổ SX bị Che thì không trả tên
      try {
        await plannerPolicy('lineCode', 'MASKED');
        t = await tokenFor('kehoach.a', 'A01');
        const masked = (await mine(t)).items as any[];
        expect(masked.length).toBeGreaterThan(0);
        expect(masked.every((r) => r.lineCode === '***' && r.lineName === undefined)).toBe(true);
        expect((await api().get(`/api/v1/sewing/prep/${row.id}`).set(auth(t)).expect(200)).body).not.toHaveProperty('lineName');
      } finally {
        await plannerPolicy('lineCode', null);
      }
    } finally {
      // Lần mở màn sau chép lại theo dàn chuyền: bản chép của dòng này mất theo
      await order.deleteFrom('ShipmentPlanLine').where('Id', '=', orphan).execute();
    }
  });

  it('nhà máy khác: phiên A02 gọi dòng của A01 theo Id thì 404', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const row = (await mine(planner)).items[0];
    const other = await tokenFor('admin', 'A02');
    await api().get(`/api/v1/sewing/prep/${row.id}`).set(auth(other)).expect(404);
    expect((await mine(other)).total).toBe(0);
  });

  it('cột Các bước bị Che: danh sách vẫn chạy (danh mục bước ở stepInfo), ô bước là ***; Trưởng chuyền thấy tên khách bị che', async () => {
    const admin = await tokenFor('admin', 'A01');
    const roles = (await api().get('/api/v1/admin/roles').set(auth(admin))).body as { id: number; code: string }[];
    const matrix = (await api().get('/api/v1/admin/permissions').set(auth(admin))).body;
    const resourceId = matrix.modules.flatMap((m: any) => m.resources).find((r: any) => r.code === 'order.prep').id;
    const planner = roles.find((r) => r.code === 'PLANNER')!.id;
    const policy = (level: string | null) =>
      api().put(`/api/v1/admin/roles/${planner}/field-policies`).set(auth(admin)).send({ resourceId, policies: [{ fieldCode: 'steps', accessLevel: level }] }).expect(200);
    try {
      await policy('MASKED');
      const t = await tokenFor('kehoach.a', 'A01');
      const body = await mine(t);
      expect(Array.isArray(body.stepInfo)).toBe(true);
      expect(body.items[0].steps).toBe('***');
      expect((await api().get(`/api/v1/sewing/prep/${body.items[0].id}`).set(auth(t)).expect(200)).body.steps).toBe('***');
    } finally {
      await policy(null);
    }
    const tc = await tokenFor('truongchuyen.a', 'A01');
    expect((await mine(tc)).items[0].customerName).toBe('***');
  });

  it('Id dòng dàn chuyền được dùng lại cho dòng khác (tạo lúc khác): ngày đã nhập của dòng cũ không gắn sang dòng mới', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const before = rowOf(await mine(planner), 'A01-L03');
    expect(before.steps.some((v: any) => v.doneDate)).toBe(true);
    // Giả lập reset dữ liệu đơn hàng: cùng Id, nhưng là dòng tạo lúc khác
    await order.updateTable('ShipmentPlanLine').set({ CreatedAt: new Date(Date.UTC(2030, 0, 1)) } as any).where('Id', '=', fx.lineL03).execute();
    const after = rowOf(await mine(planner), 'A01-L03');
    expect(after.id).not.toBe(before.id);
    expect(after.steps.every((v: any) => v.doneDate === null)).toBe(true);
    expect(await sewing.selectFrom('SewingPrepStep').select('Id').where('SewingPrepId', '=', before.id).execute()).toHaveLength(0);
  });

  it('chỉ chép khi dàn chuyền đổi; bản chép bị xóa ngoài luồng chép thì chép lại; chép lỗi vẫn trả danh sách', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const repo = app.get(SewingPrepRepository);
    await mine(planner);
    const spy = jest.spyOn(repo, 'syncFromSchedule');
    try {
      await mine(planner, '&page=1');
      expect(spy).not.toHaveBeenCalled();
      // Script xóa bản chép mà dàn chuyền không đổi: số dòng bản chép lệch số dòng nguồn thì vẫn chép lại
      await sewing.deleteFrom('SewingPrep').where('StyleCode', '=', STYLE).where('BranchCode', '=', 'A01').execute();
      expect(rowOf(await mine(planner), 'A01-L03')).toBeDefined();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
    const fail = jest.spyOn(app.get(ScheduleFeed), 'versionOf').mockRejectedValueOnce(new Error('Mất kết nối MES_Order'));
    try {
      expect((await mine(planner)).total).toBe(1);
    } finally {
      fail.mockRestore();
    }
  });

  // Số liệu trên đầu màn (task 5.5.8). Dòng thử riêng, ngày tính theo hôm nay để không hỏng theo ngày chạy:
  // chuyền 3 của dữ liệu mẫu (vào chuyền đã qua), chuyền 6 (hôm nay + 60), chuyền 7 (hôm nay), và một dòng cùng mã hàng ở A02.
  describe('số liệu trên đầu màn (5.5.8)', () => {
    const today = todayVN();
    const plus = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    const FAR = plus(today, 60);
    const made = { lines: [] as number[], a02Order: 0, a02Plan: 0 };
    let steps: { id: number; planDays: number }[] = [];
    let rows: Record<string, any> = {};
    const kh = (row: any, stepId: number) => row.steps.find((v: any) => v.stepId === stepId).planDate as string;

    const summary = async (token: string, extra: Record<string, string> = {}) => {
      const q = new URLSearchParams({ style: STYLE, startFrom: '2020-01-01', startTo: FAR, ...extra });
      const r = (await api().get(`/api/v1/sewing/prep/summary?${q}`).set(auth(token)).expect(200)).body;
      return { total: r.total, ready: r.ready, atRisk: r.atRisk, late: r.late };
    };
    const put = async (token: string, row: any, values: object[]) => {
      await api().put(`/api/v1/sewing/prep/${row.id}`).set(auth(token)).send({ steps: values }).expect(200);
    };
    const clear = (token: string, row: any) => put(token, row, steps.map((s) => ({ stepId: s.id, planDays: null, doneDate: null })));
    /** Mọi bước có TH đúng hạn (TH = KH, không sau hôm nay) */
    const allDone = (row: any) => steps.map((s) => ({ stepId: s.id, doneDate: kh(row, s.id) < today ? kh(row, s.id) : today }));

    /** Dòng thử ở A02 (dropFixture chỉ dọn A01): dọn cả bản sót của lần chạy trước bị ngắt */
    async function dropA02() {
      const orders = order.selectFrom('SalesOrder').select('Id').where('StyleCode', '=', STYLE).where('BranchCode', '=', 'A02');
      const plans = order.selectFrom('ShipmentPlan').select('Id').where('SalesOrderId', 'in', orders);
      await order.deleteFrom('ShipmentPlanLine').where('ShipmentPlanId', 'in', plans).execute();
      await order.deleteFrom('ShipmentPlan').where('SalesOrderId', 'in', orders).execute();
      await order.deleteFrom('SalesOrder').where('StyleCode', '=', STYLE).where('BranchCode', '=', 'A02').execute();
    }

    beforeAll(async () => {
      await dropA02();
      const own = { BranchCode: 'A01', CreatedBy: null };
      const id = async (table: string, values: object) => ((await order.insertInto(table as any).values(values as any).output('inserted.Id' as any).executeTakeFirstOrThrow()) as { Id: number }).Id;
      const line = (planId: number, lineCode: string, start: string, sort: number, branch = own) =>
        id('ShipmentPlanLine', { ShipmentPlanId: planId, LineCode: lineCode, Qty: 300, AvgOutput: 300, StartDate: start, ProductionDays: 1, OffDays: 0, EndDate: start, StatusCode: 'PLANNED', SortOrder: sort, ...branch });
      made.lines.push(await line(fx.planId, 'A01-L06', FAR, 6), await line(fx.planId, 'A01-L07', today, 7));
      const a02 = { BranchCode: 'A02', CreatedBy: null };
      made.a02Order = await id('SalesOrder', { OrderNo: 'TEST-P55-A02', CustomerName: 'KHÁCH TEST P55', StyleCode: STYLE, ProductName: 'Áo test', Qty: 300, UnitName: 'Chiếc', ShipDate: '2027-12-31', StatusCode: 'PLANNING', ...a02 });
      made.a02Plan = await id('ShipmentPlan', { PlanNo: 'TEST-P55-A02', SalesOrderId: made.a02Order, CustomerName: 'KHÁCH TEST P55', StyleCode: STYLE, ProductName: 'Áo test', PoBuyDate: 'TEST', PlanQty: 300, ShipDate: '2027-12-31', PlannerName: 'Test', StatusCode: 'SCHEDULED', ...a02 });
      made.lines.push(await line(made.a02Plan, 'A02-L01', plus(today, 30), 0, a02));
      const planner = await tokenFor('kehoach.a', 'A01');
      const body = await mine(planner);
      steps = body.stepInfo;
      rows = { past: rowOf(body, 'A01-L03'), far: rowOf(body, 'A01-L06'), now: rowOf(body, 'A01-L07') };
      for (const r of Object.values(rows)) await clear(planner, r);
    });

    afterAll(async () => {
      const planner = await tokenFor('kehoach.a', 'A01');
      for (const r of Object.values(rows)) if (r) await clear(planner, r);
      await order.deleteFrom('ShipmentPlanLine').where('Id', 'in', made.lines).execute();
      await dropA02();
    });

    it('đếm theo mã hàng: 3 dòng một mã là 1; dòng đã vào chuyền chưa có TH là trễ hạn; ô Trạng thái không áp', async () => {
      const planner = await tokenFor('kehoach.a', 'A01');
      expect((await summary(planner)).total).toBe(1);
      expect(await summary(planner, { line: 'A01-L03' })).toEqual({ total: 1, ready: 0, atRisk: 0, late: 1 });
      // Đủ TH, một bước xong trễ: Đủ điều kiện V/C, không tính trễ hạn (chỉ dòng Chưa đủ đk V/C)
      await put(planner, rows.past, steps.map((s, i) => ({ stepId: s.id, doneDate: i === 0 ? plus(kh(rows.past, s.id), 1) : kh(rows.past, s.id) })));
      expect(await summary(planner, { line: 'A01-L03' })).toEqual({ total: 1, ready: 1, atRisk: 0, late: 0 });
      expect(await summary(planner, { line: 'A01-L03', status: 'NOT_DUE' })).toEqual({ total: 1, ready: 1, atRisk: 0, late: 0 });
      // Thu hẹp khoảng ngày thì số theo bộ lọc
      expect(await summary(planner, { startTo: '2020-12-31' })).toEqual({ total: 0, ready: 0, atRisk: 0, late: 0 });
      // Tuần đang chọn: số khớp với lưới (dòng chuyền 7 vào chuyền tuần này)
      const week = await mine(planner, `&week=${today}`);
      expect(week.total).toBeGreaterThan(0);
      expect((await summary(planner, { week: today })).total).toBe(1);
    });

    it('nguy cơ trễ hạn: KH chưa có TH trong [hôm nay, hôm nay + 2]; ngoài khoảng, hoặc đã có TH thì không; dòng chưa đến ngày V/C có bước quá hạn không tính trễ hạn', async () => {
      const planner = await tokenFor('kehoach.a', 'A01');
      const first = steps[0].id;
      // Chuyền 6 vào chuyền sau 60 ngày: chỉnh riêng số ngày của một bước để KH rơi vào từng mốc
      const at = async (k: number) => {
        await put(planner, rows.far, [{ stepId: first, planDays: 60 - k, doneDate: null }]);
        return summary(planner, { line: 'A01-L06' });
      };
      expect(await at(-1)).toEqual({ total: 1, ready: 0, atRisk: 0, late: 0 });
      expect((await at(0)).atRisk).toBe(1);
      expect((await at(2)).atRisk).toBe(1);
      expect((await at(3)).atRisk).toBe(0);
      await put(planner, rows.far, [{ stepId: first, planDays: 60, doneDate: today }]);
      expect((await summary(planner, { line: 'A01-L06' })).atRisk).toBe(0);
    });

    it('trễ hạn chỉ vì bước xong sau KH (không có bước quá hạn chưa làm) trên dòng Chưa đủ đk V/C', async () => {
      const planner = await tokenFor('kehoach.a', 'A01');
      const [open, late] = [steps[0].id, steps[1].id];
      // Chuyền 7 vào chuyền hôm nay: một bước KH hôm nay chưa làm (chưa quá hạn), các bước khác xong đúng hạn
      await put(planner, rows.now, [...allDone(rows.now).filter((v) => v.stepId !== open), { stepId: open, planDays: 0, doneDate: null }]);
      expect(await summary(planner, { line: 'A01-L07' })).toEqual({ total: 1, ready: 0, atRisk: 1, late: 0 });
      // Một bước khác xong sau KH: thành trễ hạn
      await put(planner, rows.now, [{ stepId: late, planDays: 2, doneDate: plus(today, -1) }]);
      expect(await summary(planner, { line: 'A01-L07' })).toEqual({ total: 1, ready: 0, atRisk: 1, late: 1 });
    });

    it('phạm vi: Trưởng chuyền 3 chỉ đếm chuyền 3; A00 đếm cùng mã hàng ở 2 nhà máy là 2', async () => {
      expect(await summary(await tokenFor('truongchuyen.a', 'A01'))).toEqual(await summary(await tokenFor('kehoach.a', 'A01'), { line: 'A01-L03' }));
      expect((await summary(await tokenFor('giamdoc', 'A00'))).total).toBe(2);
    });

    it('chính sách cột: Mã hàng bị Che thì không có số nào; Trạng thái hay các bước bị Ẩn/Che thì chỉ có Tổng', async () => {
      for (const [field, level, want] of [
        ['styleCode', 'MASKED', { total: null, ready: null, atRisk: null, late: null }],
        ['statusCode', 'HIDDEN', { total: 1, ready: null, atRisk: null, late: null }],
        ['steps', 'MASKED', { total: 1, ready: null, atRisk: null, late: null }],
      ] as const) {
        await plannerPolicy(field, level);
        try {
          expect(await summary(await tokenFor('kehoach.a', 'A01'))).toEqual(want);
        } finally {
          await plannerPolicy(field, null);
        }
      }
    });

    it('mở màn: danh sách và số liệu gọi cùng lúc chỉ chép dàn chuyền một lần', async () => {
      const planner = await tokenFor('kehoach.a', 'A01');
      // Thêm một dòng dàn chuyền: dấu phiên bản đổi, lần đọc kế tiếp phải chép
      made.lines.push(
        ((await order
          .insertInto('ShipmentPlanLine')
          .values({ ShipmentPlanId: fx.planId, LineCode: 'A01-L08', Qty: 300, AvgOutput: 300, StartDate: FAR, ProductionDays: 1, OffDays: 0, EndDate: FAR, StatusCode: 'PLANNED', SortOrder: 8, BranchCode: 'A01', CreatedBy: null } as any)
          .output('inserted.Id' as any)
          .executeTakeFirstOrThrow()) as { Id: number }).Id,
      );
      const spy = jest.spyOn(app.get(SewingPrepRepository), 'syncFromSchedule');
      try {
        const [list, sum] = await Promise.all([mine(planner), summary(planner)]);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(lines(list)).toContain('A01-L08');
        expect(sum.total).toBe(1);
      } finally {
        spy.mockRestore();
      }
    });
  });

  it('bản chép cũ cùng Id ở nhà máy khác bị thay, màn không lỗi; đổi thông tin kế hoạch thì bản chép đổi theo', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    const row = rowOf(await mine(planner), 'A01-L03');
    // Giả lập bản chép sót lại từ trước khi nạp lại dữ liệu: cùng Id dòng dàn chuyền nhưng thuộc A02
    await sewing.deleteFrom('SewingPrepStep').where('SewingPrepId', '=', row.id).execute();
    await sewing.updateTable('SewingPrep').set({ BranchCode: 'A02', LineCode: 'A02-L03' }).where('Id', '=', row.id).execute();
    expect(rowOf(await mine(planner), 'A01-L03')).toBeDefined();
    expect(await sewing.selectFrom('SewingPrep').select('Id').where('ShipmentPlanLineId', '=', fx.lineL03).where('BranchCode', '=', 'A02').execute()).toHaveLength(0);

    await order.updateTable('ShipmentPlan').set({ CustomerName: 'KHÁCH ĐỔI P55' }).where('Id', '=', fx.planId).execute();
    expect(rowOf(await mine(planner), 'A01-L03').customerName).toBe('KHÁCH ĐỔI P55');
  });

  it('chép: nguồn trả rỗng thì không xóa bản chép; nguồn lẫn nhà máy khác thì báo lỗi, không ghi gì', async () => {
    const repo = app.get(SewingPrepRepository);
    await sewing
      .insertInto('SewingPrep')
      .values({ ShipmentPlanLineId: -55, ShipmentPlanId: -55, PlanNo: 'TEST', CustomerName: 'TEST', StyleCode: STYLE, ProductName: 'TEST', LineCode: 'TST-L01', LineQty: 1, StartDate: PAST, SourceSyncedAt: new Date(), BranchCode: 'TST' } as any)
      .execute();
    expect(await repo.syncFromSchedule('TST', async () => [])).toEqual({ added: 0, updated: 0, removed: 0, skipped: true });
    expect(await sewing.selectFrom('SewingPrep').select('Id').where('BranchCode', '=', 'TST').execute()).toHaveLength(1);
    const stranger = { id: -56, planId: -56, planNo: 'X', customerName: 'X', styleCode: STYLE, productName: 'X', lineCode: 'A01-L01', qty: 1, startDate: PAST, branchCode: 'A01', createdAt: new Date() };
    await expect(repo.syncFromSchedule('TST', async () => [stranger])).rejects.toThrow();
    expect(await sewing.selectFrom('SewingPrep').select('Id').where('ShipmentPlanLineId', '=', -56).execute()).toHaveLength(0);
  });
});
