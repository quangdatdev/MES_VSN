import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { env } from '../src/config/env';
import { fold } from '../src/modules/hr/employee-fields';
import { isHeaderRow, parseDate } from '../src/modules/hr/employee-import.service';
import { HR_DB } from '../src/modules/hr/hr.db';
import type { HrDb } from '../src/modules/hr/hr.types';
import { CORE_DB, type CoreDb } from '../src/platform/database/database.module';

// Phase 5.8 – Sơ đồ tổ chức, Thông tin nhân sự (ADR 0012). Cần MES_Core, MES_Hr đã migrate và seed (vai trò Nhân sự, tài khoản nhansu).
// Test tự tạo phòng ban mã TST-…, chức danh TST-…, nhân viên mã TST…, loại phòng ban mã TST_…; xóa hết khi xong.
describe('Phase 5.8: Quản trị nhân sự', () => {
  let app: INestApplication;
  let hr: HrDb;
  const api = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const tokens = new Map<string, string>();
  const fx = { type: 0, finalType: 0, root: 0, a: 0, a1: 0, b: 0, common: 0, onlyA: 0, onlyB: 0, newType: 0 };

  async function tokenFor(username: string, branchCode: string) {
    const key = `${username}@${branchCode}`;
    if (tokens.has(key)) return tokens.get(key)!;
    const l = await api().post('/api/v1/auth/login').send({ username, password: env.demoPassword });
    const s = await api().post('/api/v1/auth/select-branch').set('Authorization', `Bearer ${l.body.preAuthToken}`).send({ branchCode });
    if (!s.body.accessToken) throw new Error(`Không chọn được ${branchCode} cho ${username}: ${JSON.stringify(s.body)}`);
    tokens.set(key, s.body.accessToken);
    return s.body.accessToken as string;
  }
  const hrUser = () => tokenFor('nhansu', 'A00');

  /**
   * Tài khoản thử chỉ có vai trò Quản trị hệ thống (xem nghiệp vụ, không ghi): tài khoản admin mẫu có thêm vai trò Toàn quyền
   * (ADR 0014) nên không dùng để kiểm "chỉ có quyền xem". Dọn ở afterAll.
   */
  const VIEWER = 'test.hrview';
  let viewerId = 0;
  async function viewOnly() {
    const key = `${VIEWER}@A00`;
    if (tokens.has(key)) return tokens.get(key)!;
    const admin = await tokenFor('admin', 'A00');
    const roles = (await api().get('/api/v1/admin/roles').set(auth(admin)).expect(200)).body as { id: number; code: string }[];
    const branches = (await api().get('/api/v1/admin/branches').set(auth(admin)).expect(200)).body as { id: number; code: string }[];
    // Mật khẩu sinh mỗi lần chạy: test dừng giữa chừng thì tài khoản ADMIN còn lại không ai biết mật khẩu
    const password = `Hv@${randomBytes(12).toString('base64url')}9`;
    const created = await api().post('/api/v1/admin/users').set(auth(admin)).send({ username: VIEWER, fullName: 'Chỉ xem (test)', initialPassword: password });
    viewerId = created.status === 201 ? created.body.id : (await api().get(`/api/v1/admin/users?q=${VIEWER}`).set(auth(admin))).body.items.find((u: any) => u.username === VIEWER).id;
    if (created.status !== 201) {
      await api().post(`/api/v1/admin/users/${viewerId}/reset-password`).set(auth(admin)).send({ newPassword: password }).expect(200);
      await api().put(`/api/v1/admin/users/${viewerId}`).set(auth(admin)).send({ isActive: true, unlock: true }).expect(200);
    }
    await api().put(`/api/v1/admin/users/${viewerId}/roles`).set(auth(admin)).send({ roleIds: roles.filter((r) => r.code === 'ADMIN').map((r) => r.id) }).expect(200);
    await api().put(`/api/v1/admin/users/${viewerId}/branches`).set(auth(admin)).send({ branchIds: branches.filter((b) => b.code === 'A00').map((b) => b.id) }).expect(200);
    const l = await api().post('/api/v1/auth/login').send({ username: VIEWER, password });
    const t = (await api().post('/api/v1/auth/select-branch').set('Authorization', `Bearer ${l.body.preAuthToken}`).send({ branchCode: 'A00' })).body.accessToken as string;
    tokens.set(key, t);
    return t;
  }

  async function dropFixture() {
    const tst = (eb: any) => eb('Code', 'like', 'TST%');
    await hr.updateTable('Department').set({ ManagerEmployeeId: null }).where(tst).execute();
    await hr.deleteFrom('Employee').where(tst).execute();
    await hr.deleteFrom('JobTitle').where(tst).execute();
    await hr.deleteFrom('Department').where(tst).execute();
    await hr.deleteFrom('DepartmentType').where(tst).execute();
  }

  const createDept = (token: string, body: object) => api().post('/api/v1/hr/departments').set(auth(token)).send(body);
  const createEmp = (token: string, body: object) => api().post('/api/v1/hr/employees').set(auth(token)).send(body);
  const pathOf = async (id: number) => (await hr.selectFrom('Department').select('Path').where('Id', '=', id).executeTakeFirstOrThrow()).Path;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    hr = app.get<HrDb>(HR_DB);
    await dropFixture();
    const types = await hr.selectFrom('DepartmentType').select(['Id', 'IsFinalLevel']).where('IsActive', '=', true).execute();
    fx.type = types.find((t) => !t.IsFinalLevel)!.Id;
    fx.finalType = types.find((t) => t.IsFinalLevel)!.Id;
    const t = await hrUser();
    fx.root = (await createDept(t, { code: 'TST-ROOT', name: 'Gốc test', departmentTypeId: fx.type }).expect(201)).body.id;
    fx.a = (await createDept(t, { code: 'TST-A', name: 'Phòng A test', departmentTypeId: fx.type, parentId: fx.root }).expect(201)).body.id;
    fx.a1 = (await createDept(t, { code: 'TST-A1', name: 'Tổ A1 test', departmentTypeId: fx.finalType, parentId: fx.a }).expect(201)).body.id;
    fx.b = (await createDept(t, { code: 'TST-B', name: 'Phòng B test', departmentTypeId: fx.type, parentId: fx.root }).expect(201)).body.id;
    const title = async (code: string, name: string, departmentId: number | null) => {
      await hr.insertInto('JobTitle').values({ Code: code, Name: name, Description: null, DepartmentId: departmentId, SortOrder: 0, IsActive: true, IsSystem: false, CreatedBy: null }).execute();
      return (await hr.selectFrom('JobTitle').select('Id').where('Code', '=', code).executeTakeFirstOrThrow()).Id;
    };
    fx.common = await title('TST-CHUNG', 'Chức danh chung test', null);
    fx.onlyA = await title('TST-RIENG-A', 'Chỉ phòng A test', fx.a);
    fx.onlyB = await title('TST-RIENG-B', 'Chỉ phòng B test', fx.b);
  });

  afterAll(async () => {
    await dropFixture();
    if (viewerId) {
      const admin = await tokenFor('admin', 'A00');
      await api().put(`/api/v1/admin/users/${viewerId}/roles`).set(auth(admin)).send({ roleIds: [] }).expect(200);
      await api().put(`/api/v1/admin/users/${viewerId}`).set(auth(admin)).send({ isActive: false }).expect(200);
    }
    await app.close();
  });

  it('đọc ngày nhiều định dạng, nhận dòng tiêu đề, so tên không dấu', () => {
    expect(parseDate('05/03/2024')).toBe('2024-03-05');
    expect(parseDate('5-3-2024')).toBe('2024-03-05');
    expect(parseDate('2024-03-05')).toBe('2024-03-05');
    expect(parseDate('45356')).toBe('2024-03-05');
    expect(parseDate('31/02/2024')).toBeNull();
    expect(parseDate('03/2024')).toBeNull();
    // Ô chỉ có năm không phải số ngày kiểu Excel (review 5.8 M3)
    expect(parseDate('1990')).toBeNull();
    expect(fold('  Phòng  Kế TOÁN Đức ')).toBe('phong ke toan duc');
    expect(isHeaderRow({ code: 'Mã NV', fullName: 'Họ và tên', gender: 'Giới tính', departmentId: 'Phòng ban' })).toBe(true);
    expect(isHeaderRow({ code: 'Mã nhân viên *', fullName: 'Tên nhân viên *', email: 'Email' })).toBe(true);
    expect(isHeaderRow({ code: 'NV1', fullName: 'Nguyễn Văn A', gender: 'Nam', departmentId: 'KT' })).toBe(false);
  });

  it('không có quyền thì 403 (deny by default); chỉ có quyền xem thì không ghi được', async () => {
    const planner = await tokenFor('kehoach.a', 'A01');
    await api().get('/api/v1/hr/departments/tree').set(auth(planner)).expect(403);
    await api().get('/api/v1/hr/employees').set(auth(planner)).expect(403);
    await api().get('/api/v1/hr/employees/options').set(auth(planner)).expect(403);
    const admin = await viewOnly();
    await api().get('/api/v1/hr/departments/tree').set(auth(admin)).expect(200);
    await createDept(admin, { code: 'TST-X', name: 'X', departmentTypeId: fx.type }).expect(403);
    await api().put(`/api/v1/hr/departments/${fx.a}`).set(auth(admin)).send({ name: 'Đổi' }).expect(403);
    await api().post(`/api/v1/hr/departments/${fx.b}/dissolve`).set(auth(admin)).send({}).expect(403);
    await createEmp(admin, { code: 'TST900', fullName: 'X', gender: 1, departmentId: fx.a, jobTitleId: fx.common }).expect(403);
    await api().post('/api/v1/hr/employees/import/commit').set(auth(admin)).send({ rows: [{ code: 'TST901' }] }).expect(403);
    // Quản trị không có quyền xuất file nhân sự; Giám đốc có
    await api().get('/api/v1/hr/employees/export').set(auth(admin)).expect(403);
    const director = await tokenFor('giamdoc', 'A00');
    await api().get('/api/v1/hr/employees/export').set(auth(director)).expect(200);
  });

  it('thêm phòng ban: mã viết hoa, trùng mã 409, sai dạng 422, cha cấp cuối 422; Path theo cây; không gắn A00', async () => {
    const t = await hrUser();
    expect(await pathOf(fx.a1)).toBe('/TST-ROOT/TST-A/TST-A1/');
    await createDept(t, { code: 'tst-a', name: 'Trùng', departmentTypeId: fx.type }).expect(409);
    await createDept(t, { code: 'TST A', name: 'Sai', departmentTypeId: fx.type }).expect(422);
    await createDept(t, { code: 'TST-UNDER-FINAL', name: 'Dưới cấp cuối', departmentTypeId: fx.finalType, parentId: fx.a1 }).expect(422);
    await createDept(t, { code: 'TST-A00', name: 'Gắn A00', departmentTypeId: fx.type, parentId: fx.root, branchCode: 'A00' }).expect(422);
    const withBranch = await createDept(t, { code: 'tst-c', name: 'Phòng C test', departmentTypeId: fx.type, parentId: fx.root, branchCode: 'A01' }).expect(201);
    expect(withBranch.body).toMatchObject({ code: 'TST-C', branchCode: 'A01', path: '/TST-ROOT/TST-C/', isActive: true });
  });

  it('sửa phòng ban: không đổi mã; cha không là chính nó hay nhánh con; chuyển nhánh cập nhật Path cả nhánh', async () => {
    const t = await hrUser();
    const put = (id: number, body: object) => api().put(`/api/v1/hr/departments/${id}`).set(auth(t)).send(body);
    expect((await put(fx.a, { code: 'TST-AA' }).expect(422)).body.error.code).toBe('CODE_IMMUTABLE');
    await put(fx.a, { parentId: fx.a }).expect(422);
    await put(fx.a, { parentId: fx.a1 }).expect(422);
    // Loại cấp cuối khi đang có phòng ban con
    await put(fx.a, { departmentTypeId: fx.finalType }).expect(422);
    await put(fx.a, { parentId: fx.b, name: 'Phòng A (đã chuyển)' }).expect(200);
    expect(await pathOf(fx.a)).toBe('/TST-ROOT/TST-B/TST-A/');
    expect(await pathOf(fx.a1)).toBe('/TST-ROOT/TST-B/TST-A/TST-A1/');
    // Lên làm gốc rồi về chỗ cũ
    await put(fx.a, { parentId: null }).expect(200);
    expect(await pathOf(fx.a1)).toBe('/TST-A/TST-A1/');
    await put(fx.a, { parentId: fx.root }).expect(200);
    expect(await pathOf(fx.a1)).toBe('/TST-ROOT/TST-A/TST-A1/');
  });

  it('nhân viên: thêm, trùng mã/mã chấm công 409, chức danh ngoài phạm vi phòng ban 422, đổi mã giữ Id', async () => {
    const t = await hrUser();
    // Chức danh của phòng A dùng được cho tổ A1 (phòng ban con)
    const e1 = (await createEmp(t, { code: 'tst001', fullName: 'Nguyễn Đức Test', gender: 1, departmentId: fx.a1, jobTitleId: fx.onlyA }).expect(201)).body;
    expect(e1).toMatchObject({ code: 'TST001', timekeepingCode: 'TST001', employmentStatus: 1, departmentName: 'Tổ A1 test', jobTitleName: 'Chỉ phòng A test' });
    await createEmp(t, { code: 'TST001', fullName: 'Trùng', gender: 2, departmentId: fx.b, jobTitleId: fx.common }).expect(409);
    await createEmp(t, { code: 'TST002', timekeepingCode: 'tst001', fullName: 'Trùng mã chấm công', gender: 2, departmentId: fx.b, jobTitleId: fx.common }).expect(409);
    const out = await createEmp(t, { code: 'TST002', fullName: 'Sai chức danh', gender: 2, departmentId: fx.b, jobTitleId: fx.onlyA }).expect(422);
    expect(out.body.error.details.fields.jobTitleId).toBeTruthy();
    await createEmp(t, { code: 'TST002', fullName: 'Thiếu phòng ban', gender: 2, jobTitleId: fx.common }).expect(422);
    await createEmp(t, { code: 'TST002', fullName: 'Đang làm mà có ngày nghỉ', gender: 2, departmentId: fx.b, jobTitleId: fx.common, endDate: '2026-01-01' }).expect(422);
    const e2 = (await createEmp(t, { code: 'TST002', fullName: 'Trần Thị Thử', gender: 2, departmentId: fx.b, jobTitleId: fx.onlyB, idNumber: '999000111222' }).expect(201)).body;

    // Đổi mã: Id giữ nguyên; mã chấm công không tự đổi theo; trùng mã người khác thì 409
    const put = (id: number, body: object) => api().put(`/api/v1/hr/employees/${id}`).set(auth(t)).send(body);
    await put(e1.id, { code: 'TST002' }).expect(409);
    const renamed = (await put(e1.id, { code: 'TST001-MOI' }).expect(200)).body;
    expect(renamed).toMatchObject({ id: e1.id, code: 'TST001-MOI', timekeepingCode: 'TST001' });
    // Bỏ trống mã chấm công: lấy theo mã nhân viên
    expect((await put(e1.id, { timekeepingCode: '' }).expect(200)).body.timekeepingCode).toBe('TST001-MOI');
    // Đổi phòng ban mà chức danh cũ không dùng được ở phòng mới: 422, giữ nguyên
    await put(e2.id, { departmentId: fx.a }).expect(422);
    await put(e2.id, { departmentId: fx.a, jobTitleId: fx.common }).expect(200);
    // Nghỉ việc kèm ngày nghỉ; đang làm thì không có ngày nghỉ
    await put(e2.id, { employmentStatus: 2, endDate: '2026-09-30' }).expect(200);
    await put(e2.id, { employmentStatus: 1 }).expect(422);
    await put(e2.id, { employmentStatus: 1, endDate: null }).expect(200);
    // Nhật ký có mã cũ, mã mới; không có cột nhạy cảm (màn Nhật ký không đi qua chính sách cột)
    const audit = JSON.stringify((await api().get('/api/v1/admin/audit?entityType=Employee&pageSize=50').set(auth(await tokenFor('admin', 'A00'))).expect(200)).body);
    expect(audit).toContain('TST001-MOI');
    expect(audit).not.toContain('999000111222');
    // Cột nhạy cảm không có giá trị nhưng có dấu đã đổi (review 5.8 L12)
    expect(audit).toContain('(đã đổi)');
  });

  it('danh sách: lọc phòng ban gồm nhánh con, tình trạng; tìm không dấu kể cả chữ đ', async () => {
    const t = await hrUser();
    const list = async (qs: string) => (await api().get(`/api/v1/hr/employees?pageSize=50&${qs}`).set(auth(t)).expect(200)).body;
    const codes = (b: any) => b.items.map((x: any) => x.code).filter((c: string) => c.startsWith('TST')).sort();
    expect(codes(await list(`departmentId=${fx.root}`))).toEqual(['TST001-MOI', 'TST002']);
    expect(codes(await list(`departmentId=${fx.a1}`))).toEqual(['TST001-MOI']);
    expect(codes(await list(`departmentId=${fx.b}`))).toEqual([]);
    expect(codes(await list(`departmentId=${fx.root}&q=nguyen duc`))).toEqual(['TST001-MOI']);
    expect(codes(await list(`departmentId=${fx.root}&q=thu`))).toEqual(['TST002']);
    expect(codes(await list(`departmentId=${fx.root}&q=tst002`))).toEqual(['TST002']);
    // Tìm theo tên chức danh
    expect(codes(await list(`departmentId=${fx.root}&q=chuc danh chung`))).toEqual(['TST002']);
    expect(codes(await list(`departmentId=${fx.root}&status=2`))).toEqual([]);
    // Thẻ trong danh sách không kèm giấy tờ, liên lạc
    expect((await list(`departmentId=${fx.root}`)).items[0].idNumber).toBeUndefined();
  });

  it('dữ liệu dùng chung: Nhân sự ở phiên một nhà máy vẫn thấy, sửa được hồ sơ toàn công ty', async () => {
    const atA01 = await tokenFor('nhansu', 'A01');
    const body = (await api().get(`/api/v1/hr/employees?departmentId=${fx.root}&pageSize=50`).set(auth(atA01)).expect(200)).body;
    expect(body.items.map((x: any) => x.code)).toEqual(expect.arrayContaining(['TST001-MOI', 'TST002']));
    const id = (await hr.selectFrom('Employee').select('Id').where('Code', '=', 'TST002').executeTakeFirstOrThrow()).Id;
    await api().put(`/api/v1/hr/employees/${id}`).set(auth(atA01)).send({ nickname: 'Thử ở A01' }).expect(200);
  });

  it('cột nhạy cảm: Nhân sự thấy, Giám đốc thấy ***, Quản trị không thấy; file xuất cũng vậy', async () => {
    const id = (await hr.selectFrom('Employee').select('Id').where('Code', '=', 'TST002').executeTakeFirstOrThrow()).Id;
    const get = async (token: string) => (await api().get(`/api/v1/hr/employees/${id}`).set(auth(token)).expect(200)).body;
    expect((await get(await hrUser())).idNumber).toBe('999000111222');
    expect((await get(await tokenFor('giamdoc', 'A00'))).idNumber).toBe('***');
    expect('idNumber' in (await get(await viewOnly()))).toBe(false);
    // Toàn quyền (ADR 0014): thấy cột nhạy cảm
    expect((await get(await tokenFor('admin', 'A00'))).idNumber).toBe('999000111222');
    const csv = await api().get(`/api/v1/hr/employees/export?departmentId=${fx.root}`).set(auth(await tokenFor('giamdoc', 'A00'))).expect(200);
    expect(csv.text).toContain('Số CMND/CCCD');
    expect(csv.text).not.toContain('999000111222');
    expect(csv.text).toContain('***');
    // Nhân sự xuất file thấy CCCD, có ghi nhật ký đọc dữ liệu nhạy cảm kiểu xuất file
    const core = app.get<CoreDb>(CORE_DB);
    const before = Number((await core.selectFrom('SysSensitiveReadLog').select((eb) => eb.fn.countAll().as('n')).where('ResourceCode', '=', 'hr.employee').where('ActionCode', '=', 'EXPORT').executeTakeFirstOrThrow()).n);
    const own = await api().get(`/api/v1/hr/employees/export?departmentId=${fx.root}`).set(auth(await hrUser())).expect(200);
    expect(own.text).toContain('999000111222');
    const after = Number((await core.selectFrom('SysSensitiveReadLog').select((eb) => eb.fn.countAll().as('n')).where('ResourceCode', '=', 'hr.employee').where('ActionCode', '=', 'EXPORT').executeTakeFirstOrThrow()).n);
    expect(after).toBe(before + 1);
    // Giám đốc không sửa được cột bị Che (và cũng không có quyền sửa)
    await api().put(`/api/v1/hr/employees/${id}`).set(auth(await tokenFor('giamdoc', 'A00'))).send({ idNumber: '1' }).expect(403);
  });

  it('giải thể: chặn khi còn phòng ban con hoặc nhân viên đang làm, nêu số lượng; khôi phục cần cha đang dùng', async () => {
    const t = await hrUser();
    const dissolve = (id: number) => api().post(`/api/v1/hr/departments/${id}/dissolve`).set(auth(t)).send({});
    const blockedA = await dissolve(fx.a).expect(409);
    expect(blockedA.body.error.message).toContain('1 phòng ban con đang dùng');
    const blockedA1 = await dissolve(fx.a1).expect(409);
    expect(blockedA1.body.error.message).toContain('1 nhân viên đang làm việc');
    // Chuyển nhân viên đi rồi giải thể từ dưới lên
    const idOf = async (code: string) => (await hr.selectFrom('Employee').select('Id').where('Code', '=', code).executeTakeFirstOrThrow()).Id;
    const moveToB = async (code: string) => api().put(`/api/v1/hr/employees/${await idOf(code)}`).set(auth(t)).send({ departmentId: fx.b, jobTitleId: fx.common }).expect(200);
    await moveToB('TST001-MOI');
    await dissolve(fx.a1).expect(201);
    // TST002 vẫn đang làm ở phòng A (bài nhân viên chuyển sang)
    expect((await dissolve(fx.a).expect(409)).body.error.message).toContain('1 nhân viên đang làm việc');
    await moveToB('TST002');
    await dissolve(fx.a).expect(201);
    const tree = async (all: boolean) => (await api().get(`/api/v1/hr/departments/tree${all ? '?includeDissolved=1' : ''}`).set(auth(t)).expect(200)).body.items.map((d: any) => d.code);
    expect(await tree(false)).not.toContain('TST-A');
    expect(await tree(true)).toEqual(expect.arrayContaining(['TST-A', 'TST-A1']));
    // Thêm con vào phòng ban đã giải thể; khôi phục con khi cha còn giải thể
    await createDept(t, { code: 'TST-A2', name: 'Con của A đã giải thể', departmentTypeId: fx.finalType, parentId: fx.a }).expect(422);
    await api().post(`/api/v1/hr/departments/${fx.a1}/restore`).set(auth(t)).expect(422);
    await api().post(`/api/v1/hr/departments/${fx.a}/restore`).set(auth(t)).expect(201);
    await api().post(`/api/v1/hr/departments/${fx.a1}/restore`).set(auth(t)).expect(201);
    // Phòng ban đã giải thể không nhận nhân viên mới
    await dissolve(fx.a1).expect(201);
    await createEmp(t, { code: 'TST003', fullName: 'Vào phòng đã giải thể', gender: 1, departmentId: fx.a1, jobTitleId: fx.common }).expect(422);
  });

  it('nhập từ Excel: bỏ dòng tiêu đề, lỗi theo ô (trùng trong lô, trong hệ thống, ngày sai, phòng ban lạ), lưu từng dòng độc lập', async () => {
    const t = await hrUser();
    const rows = [
      { code: 'Mã nhân viên', fullName: 'Tên nhân viên', gender: 'Giới tính', departmentId: 'Phòng ban', jobTitleId: 'Chức danh' },
      { code: 'tst101', fullName: 'Lê Văn Một', gender: 'nam', departmentId: 'TST-B', jobTitleId: 'chuc danh chung test', startDate: '01/02/2024' },
      { code: 'TST102', fullName: 'Phạm Thị Hai', gender: 'Nữ', departmentId: 'Phòng B test', jobTitleId: 'TST-RIENG-B', birthDate: '31/02/1990' },
      { code: 'TST101', fullName: 'Trùng trong lô', gender: 'Nam', departmentId: 'TST-B', jobTitleId: 'TST-CHUNG' },
      { code: 'TST002', fullName: 'Trùng hệ thống', gender: 'Nam', departmentId: 'TST-B', jobTitleId: 'TST-CHUNG' },
      { code: 'TST104', fullName: 'Phòng ban lạ', gender: 'Nam', departmentId: 'KHONG-CO', jobTitleId: 'TST-CHUNG' },
      { code: 'TST105', fullName: 'Nghỉ việc', gender: '2', departmentId: '[TST-B] Phòng B test', jobTitleId: 'TST-CHUNG', employmentStatus: 'Nghỉ việc', endDate: '2026-05-31', isTimekeepingAllowed: 'Không' },
    ];
    const preview = (await api().post('/api/v1/hr/employees/import/preview').set(auth(t)).send({ rows }).expect(201)).body.rows;
    // Lỗi dạng danh sách { field, message } (review 5.8 L11)
    const err = (i: number, field: string) => preview[i].errors.find((e: any) => e.field === field)?.message as string | undefined;
    expect(preview[0].header).toBe(true);
    expect(preview[1]).toMatchObject({ ok: true, resolved: { departmentName: 'Phòng B test', jobTitleName: 'Chức danh chung test' } });
    expect(err(2, 'birthDate')).toBeTruthy();
    expect(err(3, 'code')).toContain('dòng 2');
    expect(err(4, 'code')).toContain('đã có');
    expect(err(5, 'departmentId')).toBeTruthy();
    expect(preview[6].ok).toBe(true);

    rows[2].birthDate = '28/02/1990';
    const res = (await api().post('/api/v1/hr/employees/import/commit').set(auth(t)).send({ rows }).expect(201)).body;
    expect(res.created).toBe(3);
    expect(res.failed).toBe(3);
    expect(res.results[0].skipped).toBe(true);
    const saved = await hr.selectFrom('Employee').select(['Code', 'StartDate', 'EmploymentStatus', 'IsTimekeepingAllowed']).where('Code', 'in', ['TST101', 'TST102', 'TST105']).orderBy('Code').execute();
    expect(saved.map((s) => s.Code)).toEqual(['TST101', 'TST102', 'TST105']);
    expect(saved[0].StartDate?.toISOString().slice(0, 10)).toBe('2024-02-01');
    expect(saved[2]).toMatchObject({ EmploymentStatus: 2, IsTimekeepingAllowed: false });
    await api().post('/api/v1/hr/employees/import/preview').set(auth(t)).send({ rows: [] }).expect(422);
  });

  it('người quản lý: chỉ nhân viên đang làm; ô chọn tìm trên máy chủ', async () => {
    const t = await hrUser();
    const opts = (await api().get('/api/v1/hr/departments/manager-options?q=le van mot').set(auth(t)).expect(200)).body;
    const one = opts.find((o: any) => o.code === 'TST101');
    expect(one).toBeTruthy();
    await api().put(`/api/v1/hr/departments/${fx.b}`).set(auth(t)).send({ managerEmployeeId: one.id }).expect(200);
    expect((await api().get(`/api/v1/hr/departments/${fx.b}`).set(auth(t)).expect(200)).body).toMatchObject({ managerCode: 'TST101', managerName: 'Lê Văn Một' });
    const gone = (await hr.selectFrom('Employee').select('Id').where('Code', '=', 'TST105').executeTakeFirstOrThrow()).Id;
    await api().put(`/api/v1/hr/departments/${fx.b}`).set(auth(t)).send({ managerEmployeeId: gone }).expect(422);
  });

  // ---------- Loại phòng ban (task 5.8.9): sửa ở Quản trị › Danh mục hệ thống, quyền admin.catalog ----------
  const TYPES = '/api/v1/hr/department-types';

  it('loại phòng ban: chỉ quyền danh mục hệ thống thêm, sửa; mã viết hoa, không đổi; trùng mã, trùng tên 409; dùng được ngay', async () => {
    const admin = await tokenFor('admin', 'A00');
    for (const [user, branch] of [['nhansu', 'A00'], ['giamdoc', 'A00'], ['kehoach.a', 'A01']] as const) {
      const other = await tokenFor(user, branch);
      await api().get(TYPES).set(auth(other)).expect(403);
      await api().post(TYPES).set(auth(other)).send({ code: 'TST_X', name: 'X test', levelOrder: 1, isFinalLevel: false }).expect(403);
    }
    const created = (await api().post(TYPES).set(auth(admin)).send({ code: ' tst_to ', name: 'Tổ test', description: '  ', levelOrder: 5, isFinalLevel: false }).expect(201)).body;
    expect(created).toMatchObject({ code: 'TST_TO', name: 'Tổ test', description: null, levelOrder: 5, isFinalLevel: false, isActive: true, isSystem: false, departmentCount: 0 });
    fx.newType = created.id;
    await api().post(TYPES).set(auth(admin)).send({ code: 'TST TO', name: 'Sai mã test', levelOrder: 1, isFinalLevel: false }).expect(422);
    await api().post(TYPES).set(auth(admin)).send({ code: 'TST_TO', name: 'Trùng mã test', levelOrder: 1, isFinalLevel: false }).expect(409);
    // Trùng tên không phân biệt hoa thường; khác dấu là tên khác
    await api().post(TYPES).set(auth(admin)).send({ code: 'TST_TO2', name: 'TỔ TEST', levelOrder: 1, isFinalLevel: false }).expect(409);
    await api().put(`${TYPES}/${created.id}`).set(auth(admin)).send({ code: 'TST_KHAC' }).expect(422);
    await api().put(`${TYPES}/${created.id}`).set(auth(await hrUser())).send({ name: 'Đổi tên test' }).expect(403);
    const renamed = (await api().put(`${TYPES}/${created.id}`).set(auth(admin)).send({ code: 'tst_to', name: 'Tổ sản xuất test', levelOrder: 6 }).expect(200)).body;
    expect(renamed).toMatchObject({ code: 'TST_TO', name: 'Tổ sản xuất test', levelOrder: 6 });
    // Ô chọn loại ở Sơ đồ tổ chức có ngay loại mới, thêm phòng ban với loại mới được
    const t = await hrUser();
    const options = (await api().get('/api/v1/hr/departments/options').set(auth(t)).expect(200)).body.types;
    expect(options).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id, name: 'Tổ sản xuất test', isActive: true })]));
    await createDept(t, { code: 'TST-LOAI-P', name: 'Cha loại mới test', departmentTypeId: created.id, parentId: fx.root }).expect(201);
  });

  it('loại phòng ban: bật cấp cuối bị chặn khi có phòng ban con, kể cả đã giải thể; ngừng dùng giữ phòng ban cũ; ghi nhật ký', async () => {
    const admin = await tokenFor('admin', 'A00');
    const t = await hrUser();
    const deptId = async (code: string) => (await hr.selectFrom('Department').select('Id').where('Code', '=', code).executeTakeFirstOrThrow()).Id;
    const p = await deptId('TST-LOAI-P');
    const c = (await createDept(t, { code: 'TST-LOAI-C', name: 'Con loại mới test', departmentTypeId: fx.type, parentId: p }).expect(201)).body.id;
    await api().post(`/api/v1/hr/departments/${c}/dissolve`).set(auth(t)).send({}).expect(201);
    const blocked = await api().put(`${TYPES}/${fx.newType}`).set(auth(admin)).send({ isFinalLevel: true }).expect(422);
    expect(blocked.body.error.message).toContain('Cha loại mới test (TST-LOAI-P)');
    // Cha đổi sang loại khác thì loại mới không còn phòng ban có con: bật được, rồi phòng ban loại này không nhận con
    await api().put(`/api/v1/hr/departments/${p}`).set(auth(t)).send({ departmentTypeId: fx.type }).expect(200);
    expect((await api().put(`${TYPES}/${fx.newType}`).set(auth(admin)).send({ isFinalLevel: true }).expect(200)).body.isFinalLevel).toBe(true);
    const leaf = (await createDept(t, { code: 'TST-LOAI-L', name: 'Lá loại mới test', departmentTypeId: fx.newType, parentId: fx.root }).expect(201)).body.id;
    await createDept(t, { code: 'TST-LOAI-L1', name: 'Con của lá test', departmentTypeId: fx.type, parentId: leaf }).expect(422);
    const row = async () => (await api().get(TYPES).set(auth(admin)).expect(200)).body.find((x: any) => x.id === fx.newType);
    expect(await row()).toMatchObject({ isFinalLevel: true, departmentCount: 1 });

    // Ngừng dùng: phòng ban mới không chọn được loại này; phòng ban đang dùng vẫn sửa được
    await api().put(`${TYPES}/${fx.newType}`).set(auth(admin)).send({ isActive: false }).expect(200);
    await createDept(t, { code: 'TST-LOAI-M', name: 'Loại đã ngừng test', departmentTypeId: fx.newType, parentId: fx.root }).expect(422);
    await api().put(`/api/v1/hr/departments/${leaf}`).set(auth(t)).send({ name: 'Lá đổi tên test' }).expect(200);
    expect(await row()).toMatchObject({ isActive: false, departmentCount: 1 });
    // Trùng tên với loại đã ngừng vẫn bị chặn (dùng lại loại đó)
    expect((await api().post(TYPES).set(auth(admin)).send({ code: 'TST_TO3', name: 'tổ sản xuất TEST', levelOrder: 1, isFinalLevel: false }).expect(409)).body.error.message).toContain('ngừng dùng');

    const audit = JSON.stringify((await api().get('/api/v1/admin/audit?entityType=DepartmentType&pageSize=50').set(auth(admin)).expect(200)).body);
    expect(audit).toContain('TST_TO');
    expect(audit).toContain('Tổ sản xuất test');
  });
});
