import { Inject, Injectable } from '@nestjs/common';
import { AppException, Errors } from '../../common/app.exception';
import { sqlErrorNumbers } from '../../common/db-errors';
import type { AuthUser } from '../../platform/auth/auth.types';
import { AuditService } from '../../platform/audit/audit.service';
import { scopeOf, type Scope } from '../../platform/data/base.repository';
import { inTransaction } from '../../platform/data/transaction';
import { ExportService, type ExportColumn } from '../../platform/export/export.service';
import { FieldPolicyService } from '../../platform/permission/field-policy.service';
import { EMPLOYEE_FIELDS, EMPLOYMENT_STATUSES, GENDERS, GROUP_LABEL } from './employee-fields';
import { HR_DB } from './hr.db';
import type { EmployeeListQuery, EmployeeWriteDto } from './hr.dto';
import { DepartmentRepository, EmployeeRepository, HrCatalogRepository, type EmployeeListRow, type EmployeeRow, type JobTitleRow } from './hr.repositories';
import type { HrDb } from './hr.types';

const RESOURCE = 'hr.employee';
const invalid = (msg: string, details: unknown = null) => new AppException('VALIDATION_FAILED', msg, 422, details);
const day = (d: Date | string | null | undefined): string | null => (d == null ? null : d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const isDuplicate = (e: unknown) => sqlErrorNumbers(e).some((n) => n === 2601 || n === 2627);
const DATE_KEYS = new Set(EMPLOYEE_FIELDS.filter((f) => f.type === 'date').map((f) => f.key));
const GENDER_LABEL = new Map<number, string>(GENDERS.map((g) => [g.value, g.label]));
const STATUS_LABEL = new Map<number, string>(EMPLOYMENT_STATUSES.map((s) => [s.value, s.label]));
/** Trường bắt buộc khi thêm hồ sơ */
const REQUIRED: [keyof EmployeeWriteDto, string][] = [
  ['code', 'mã nhân viên'],
  ['fullName', 'tên nhân viên'],
  ['gender', 'giới tính'],
  ['departmentId', 'phòng ban'],
  ['jobTitleId', 'chức danh'],
];

/** Phòng ban, chức danh nạp một lần cho cả lần kiểm (thêm một người hay nhập vài trăm dòng) */
export interface EmployeeContext {
  depts: Map<number, { Id: number; Code: string; Name: string; Path: string; IsActive: boolean }>;
  titles: Map<number, JobTitleRow>;
}

/** Giá trị của một hồ sơ theo khóa JSON (như EmployeeWriteDto) */
export type EmployeeInput = { [K in keyof EmployeeWriteDto]?: EmployeeWriteDto[K] | null };

/** Dòng DB sang khóa JSON theo EMPLOYEE_FIELDS: ngày dạng YYYY-MM-DD, cờ dạng boolean */
function fieldsOf(r: EmployeeRow) {
  const out: Record<string, unknown> = {};
  for (const f of EMPLOYEE_FIELDS) {
    const v = (r as Record<string, unknown>)[f.column];
    out[f.key] = DATE_KEYS.has(f.key) ? day(v as Date | null) : f.type === 'bool' ? (v == null ? null : !!v) : v;
  }
  return out;
}

export function presentEmployee(r: EmployeeListRow) {
  return {
    id: r.Id,
    ...fieldsOf(r),
    departmentCode: r.DepartmentCode,
    departmentName: r.DepartmentName,
    jobTitleName: r.JobTitleName,
    createdAt: r.CreatedAt,
    modifiedAt: r.ModifiedAt,
  };
}

/** Thẻ trong danh sách: không kèm giấy tờ, liên lạc (xem ở chi tiết, qua chính sách cột) */
function presentCard(r: EmployeeListRow) {
  return {
    id: r.Id,
    code: r.Code,
    timekeepingCode: r.TimekeepingCode,
    fullName: r.FullName,
    gender: r.Gender,
    departmentId: r.DepartmentId,
    departmentName: r.DepartmentName,
    jobTitleId: r.JobTitleId,
    jobTitleName: r.JobTitleName,
    employmentStatus: r.EmploymentStatus,
    startDate: day(r.StartDate),
    createdAt: r.CreatedAt,
  };
}

/**
 * Thông tin nhân sự (ADR 0012). Mã nhân viên sửa được, chỉ cấm trùng; mã chấm công để trống thì lấy theo mã nhân viên, cũng cấm
 * trùng. Chức danh phải dùng được cho phòng ban: chức danh chung, hoặc gắn với phòng ban đó hay một phòng ban cha của nó.
 */
@Injectable()
export class EmployeeService {
  constructor(
    @Inject(HR_DB) private readonly db: HrDb,
    private readonly repo: EmployeeRepository,
    private readonly departments: DepartmentRepository,
    private readonly catalog: HrCatalogRepository,
    private readonly fields: FieldPolicyService,
    private readonly exporter: ExportService,
    private readonly audit: AuditService,
  ) {}

  async loadContext(): Promise<EmployeeContext> {
    const [depts, titles] = await Promise.all([this.departments.pickList(), this.catalog.jobTitles()]);
    return {
      depts: new Map(depts.map((d) => [d.Id, { Id: d.Id, Code: d.Code, Name: d.Name, Path: d.Path, IsActive: !!d.IsActive }])),
      titles: new Map(titles.map((t) => [t.Id, t])),
    };
  }

  /** Chức danh đang dùng cho một phòng ban: chức danh chung, và chức danh gắn với phòng ban đó hoặc một phòng ban cha */
  allowedTitles(ctx: EmployeeContext, departmentId: number): JobTitleRow[] {
    const dept = ctx.depts.get(departmentId);
    if (!dept) return [];
    return [...ctx.titles.values()].filter((t) => {
      if (!t.IsActive) return false;
      if (t.DepartmentId == null) return true;
      const owner = ctx.depts.get(t.DepartmentId);
      return !!owner && dept.Path.startsWith(owner.Path);
    });
  }

  /** Ô chọn của màn: cây phòng ban, chức danh (màn tự lọc theo phòng ban), giới tính, tình trạng, các trường của hồ sơ */
  async options() {
    const [depts, titles] = await Promise.all([this.departments.pickList(), this.catalog.jobTitles()]);
    return {
      departments: depts.map((d) => ({ id: d.Id, code: d.Code, name: d.Name, parentId: d.ParentId, path: d.Path, isActive: !!d.IsActive })),
      jobTitles: titles.map((t) => ({ id: t.Id, code: t.Code, name: t.Name, departmentId: t.DepartmentId, isActive: !!t.IsActive })),
      genders: GENDERS,
      statuses: EMPLOYMENT_STATUSES,
      fields: EMPLOYEE_FIELDS.map(({ key, label, group, type, required, max }) => ({ key, label, group, type, required: !!required, max: max ?? null })),
      groups: GROUP_LABEL,
    };
  }

  private async filter(user: AuthUser, q: Pick<EmployeeListQuery, 'q' | 'departmentId' | 'jobTitleId' | 'status'>) {
    // Phòng ban không có (link cũ): không khớp nhân viên nào thay vì bỏ lọc
    const departmentPath = q.departmentId ? ((await this.departments.pathOf(q.departmentId)) ?? '/~/') : undefined;
    // Tìm theo cột người dùng không được xem nguyên giá trị cũng làm lộ giá trị (review 5.1 lượt 2 N3)
    const blind = (await this.fields.unreadable(user, RESOURCE, ['email'])).has('email') ? new Set(['Email']) : undefined;
    return { q: q.q, departmentPath, jobTitleId: q.jobTitleId, status: q.status, blind };
  }

  async list(user: AuthUser, q: EmployeeListQuery) {
    const page = await this.repo.page(scopeOf(user), await this.filter(user, q), q.page, q.pageSize);
    return { ...page, items: page.items.map(presentCard) };
  }

  async detail(user: AuthUser, id: number) {
    return presentEmployee(await this.repo.detail(scopeOf(user), id));
  }

  async export(user: AuthUser, q: EmployeeListQuery) {
    const rows = await this.repo.all(scopeOf(user), await this.filter(user, q));
    const data = rows.map((r) => ({
      ...presentEmployee(r),
      gender: GENDER_LABEL.get(r.Gender) ?? r.Gender,
      employmentStatus: STATUS_LABEL.get(r.EmploymentStatus) ?? r.EmploymentStatus,
      // Dạng "[MÃ] Tên" như lưới nhập nhận được: hai phòng ban cùng tên (Bộ phận may của hai nhà máy) vẫn dò đúng khi dán lại
      departmentId: `[${r.DepartmentCode}] ${r.DepartmentName}`,
      jobTitleId: `[${r.JobTitleCode}] ${r.JobTitleName}`,
      isTimekeepingAllowed: r.IsTimekeepingAllowed == null ? null : r.IsTimekeepingAllowed ? 'Có' : 'Không',
    }));
    // Cùng thứ tự, cùng tên cột với lưới nhập từ Excel: file xuất sửa xong dán lại được
    const columns: ExportColumn[] = EMPLOYEE_FIELDS.map((f) => ({ key: f.key, label: f.label }));
    return this.exporter.csv(user, RESOURCE, columns, data, `nhan-su-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  /**
   * Kiểm quy tắc trên giá trị sau khi ghi (`final`). `changed`: các khóa vừa đổi, để không chặn hồ sơ cũ chỉ vì phòng ban đã
   * giải thể hay chức danh đã ngừng mà người dùng không đụng tới. Trả lỗi theo trường (ô của lưới nhập, ô của form).
   */
  checkRules(ctx: EmployeeContext, final: EmployeeInput, changed: Set<string>): Record<string, string> {
    const errors: Record<string, string> = {};
    const status = final.employmentStatus ?? 1;
    const dept = final.departmentId ? ctx.depts.get(final.departmentId) : undefined;
    if (final.departmentId && !dept) errors.departmentId = 'Phòng ban không tồn tại.';
    else if (dept && !dept.IsActive && (changed.has('departmentId') || (changed.has('employmentStatus') && status === 1))) {
      errors.departmentId = `${dept.Name} đã giải thể, chọn phòng ban khác.`;
    }
    if (final.jobTitleId && (changed.has('jobTitleId') || changed.has('departmentId'))) {
      const t = ctx.titles.get(final.jobTitleId);
      if (!t) errors.jobTitleId = 'Chức danh không tồn tại.';
      else if (!t.IsActive) errors.jobTitleId = `Chức danh ${t.Name} đã ngừng dùng.`;
      else if (dept && !this.allowedTitles(ctx, dept.Id).some((x) => x.Id === t.Id)) errors.jobTitleId = `Chức danh ${t.Name} không dùng cho ${dept.Name}. Chọn lại chức danh.`;
    }
    if (status === 1 && final.endDate) errors.endDate = 'Nhân viên đang làm việc thì chưa có ngày nghỉ việc.';
    if (final.startDate && final.endDate && final.endDate < final.startDate) errors.endDate = 'Ngày nghỉ việc không được trước ngày bắt đầu làm việc.';
    return errors;
  }

  /** Mã nhân viên, mã chấm công đã có ở người khác: lỗi theo trường */
  async uniqueErrors(code: string, timekeeping: string, exceptId?: number, db?: HrDb): Promise<Record<string, string>> {
    const taken = await this.repo.takenCodes([code, timekeeping], exceptId, db);
    const errors: Record<string, string> = {};
    if (taken.code.has(code)) errors.code = `Mã ${code} đã có ở nhân viên khác.`;
    if (taken.timekeeping.has(timekeeping)) errors.timekeepingCode = `Mã chấm công ${timekeeping} đã dùng cho nhân viên khác.`;
    return errors;
  }

  /** Giá trị theo cột DB của các khóa được gửi */
  private columns(input: EmployeeInput): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of EMPLOYEE_FIELDS) {
      const v = input[f.key as keyof EmployeeInput];
      if (v !== undefined) out[f.column] = v;
    }
    return out;
  }

  /** Phòng ban, chức danh của một hồ sơ đọc lại trong khóa (đúng tại lúc ghi, không theo ảnh nạp trước) */
  private async freshContext(db: HrDb, departmentId: number | null | undefined, jobTitleId: number | null | undefined): Promise<EmployeeContext> {
    const title = jobTitleId ? await this.catalog.jobTitle(jobTitleId, db) : undefined;
    const ids = [departmentId, title?.DepartmentId].filter((x): x is number => x != null);
    const depts = await this.departments.byIds([...new Set(ids)], db);
    return {
      depts: new Map(depts.map((d) => [d.Id, { Id: d.Id, Code: d.Code, Name: d.Name, Path: d.Path, IsActive: !!d.IsActive }])),
      titles: new Map(title ? [[title.Id, title]] : []),
    };
  }

  /** Lỗi theo trường: chỉ trùng mã thì 409, còn lại 422 */
  private static fail(errors: Record<string, string>): never {
    const unique = Object.keys(errors).every((k) => k === 'code' || k === 'timekeepingCode');
    throw new AppException(unique ? 'CONFLICT' : 'VALIDATION_FAILED', Object.values(errors).join(' '), unique ? 409 : 422, { fields: errors });
  }

  /**
   * Thêm một hồ sơ (DTO hoặc dòng nhập đã dò). Dùng chung cho form và nhập từ Excel (mỗi dòng một lần gọi, dòng lỗi không chặn dòng
   * khác). Kiểm trong khóa chung của cây (review 5.8 M1): phòng ban, chức danh đọc lại tại lúc ghi; giải thể hay chuyển nhánh chen
   * vào thì phải chờ. Lỗi quy tắc trả 422 kèm lỗi theo trường, trùng mã 409.
   */
  async insert(scope: Scope, input: EmployeeInput): Promise<number> {
    const missing = REQUIRED.filter(([k]) => input[k] == null || input[k] === '');
    if (missing.length) throw invalid(`Còn thiếu ${missing.map(([, name]) => name).join(', ')}.`, { fields: Object.fromEntries(missing.map(([k]) => [k, 'Bắt buộc nhập.'])) });
    const values: EmployeeInput = { ...input, employmentStatus: input.employmentStatus ?? 1, timekeepingCode: input.timekeepingCode || input.code };
    const keys = new Set(Object.keys(values).filter((k) => values[k as keyof EmployeeInput] !== undefined));
    try {
      return await inTransaction(this.db, async (trx) => {
        await this.departments.lockTreeShared(trx);
        const ctx = await this.freshContext(trx, values.departmentId, values.jobTitleId);
        const errors = { ...this.checkRules(ctx, values, keys), ...(await this.uniqueErrors(values.code!, values.timekeepingCode!, undefined, trx)) };
        if (Object.keys(errors).length) EmployeeService.fail(errors);
        return (await this.repo.create(scope, this.columns(values), trx)).Id;
      });
    } catch (e) {
      if (isDuplicate(e)) throw new AppException('CONFLICT', `Mã ${values.code} hoặc mã chấm công ${values.timekeepingCode} vừa được người khác dùng.`, 409);
      throw e;
    }
  }

  /**
   * Giá trị ghi nhật ký: cột nhạy cảm không ghi giá trị (màn Nhật ký không đi qua chính sách cột) nhưng để dấu "(đã đổi)" để biết
   * giấy tờ, liên lạc nào bị sửa (review 5.8 L12).
   */
  async auditValue(value: Record<string, unknown> | undefined) {
    if (!value) return value;
    const kept = (await this.fields.redact(RESOURCE, value)) as Record<string, unknown>;
    for (const k of Object.keys(value)) if (!(k in kept) && value[k] != null) kept[k] = '(đã đổi)';
    return kept;
  }

  private async log(user: AuthUser, id: number, action: string, oldValue?: Record<string, unknown>, newValue?: Record<string, unknown>) {
    const [o, n] = await Promise.all([this.auditValue(oldValue), this.auditValue(newValue)]);
    await this.audit.log({ userId: user.userId, username: user.username, branchCode: user.branchCode, entityType: 'Employee', entityId: id, actionCode: action, oldValue: o, newValue: n, ip: user.ip });
  }

  async create(user: AuthUser, dto: EmployeeWriteDto) {
    const id = await this.insert(scopeOf(user), dto);
    const out = await this.detail(user, id);
    await this.log(user, id, 'CREATE', undefined, out);
    return out;
  }

  /**
   * Sửa hồ sơ, chỉ phần đã gửi. Đổi mã: chỉ cần chưa ai dùng (Id không đổi nên mọi liên kết giữ nguyên). Bỏ trống mã chấm công
   * thì lấy theo mã nhân viên (sau khi đổi).
   */
  async update(user: AuthUser, id: number, dto: EmployeeWriteDto) {
    const scope = scopeOf(user);
    let change: { old: EmployeeInput; patch: EmployeeInput } | null;
    try {
      change = await inTransaction(this.db, async (trx) => {
        // Khóa chung của cây như khi thêm (review 5.8 M1)
        await this.departments.lockTreeShared(trx);
        const before = await this.repo.getById(scope, id, 'update', trx);
        const old = fieldsOf(before) as EmployeeInput;
        const patch: EmployeeInput = {};
        for (const f of EMPLOYEE_FIELDS) {
          const k = f.key as keyof EmployeeInput;
          const v = dto[k as keyof EmployeeWriteDto];
          if (v === undefined) continue;
          if ((v ?? null) !== (old[k] ?? null)) (patch as Record<string, unknown>)[k] = v;
        }
        if (dto.timekeepingCode === null) {
          const fallback = patch.code ?? old.code;
          if (fallback !== old.timekeepingCode) patch.timekeepingCode = fallback;
          else delete patch.timekeepingCode;
        }
        if (Object.keys(patch).length === 0) return null;
        const final: EmployeeInput = { ...old, ...patch };
        const changed = new Set(Object.keys(patch));
        const errors = this.checkRules(await this.freshContext(trx, final.departmentId, final.jobTitleId), final, changed);
        if (changed.has('code') || changed.has('timekeepingCode')) Object.assign(errors, await this.uniqueErrors(final.code!, final.timekeepingCode!, id, trx));
        if (Object.keys(errors).length) EmployeeService.fail(errors);
        await this.repo.update(scope, id, this.columns(patch), trx);
        return { old, patch };
      });
    } catch (e) {
      if (isDuplicate(e)) throw Errors.conflict('Mã nhân viên hoặc mã chấm công vừa được người khác dùng.');
      throw e;
    }
    const out = await this.detail(user, id);
    if (change) {
      const { old, patch } = change;
      await this.log(user, id, 'UPDATE', Object.fromEntries(Object.keys(patch).map((k) => [k, old[k as keyof EmployeeInput] ?? null])), patch as Record<string, unknown>);
    }
    return out;
  }
}
