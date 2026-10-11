import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/app.exception';
import { sqlErrorNumbers } from '../../common/db-errors';
import type { AuthUser } from '../../platform/auth/auth.types';
import { AuditService } from '../../platform/audit/audit.service';
import { scopeOf } from '../../platform/data/base.repository';
import { EMAIL, EMPLOYEE_CODE, EMPLOYEE_FIELDS, fold, type EmployeeField } from './employee-fields';
import { EmployeeService, type EmployeeContext, type EmployeeInput } from './employee.service';
import { EmployeeRepository } from './hr.repositories';

/** Ô dài hơn mức này thì không phải dữ liệu của một ô (dán nhầm cả đoạn văn) */
const CELL_MAX = 1000;
const logger = new Logger('EmployeeImport');

/**
 * Ngày gõ hoặc dán từ Excel: dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, yyyy-mm-dd, hoặc số ngày kiểu Excel (ô định dạng ngày dán
 * thành số, từ 5 chữ số: 10000 là năm 1927). Ô chỉ có năm ("1990") không phải số ngày: trả null để báo lỗi, không thành ngày năm
 * 1905 (review 5.8 M3). Trả YYYY-MM-DD ghép thẳng từ số (không qua múi giờ), null khi không đọc được.
 */
export function parseDate(text: string): string | null {
  const s = text.trim();
  let y: number, m: number, d: number;
  let match: RegExpExecArray | null;
  if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if (/^\d{5,6}(\.\d+)?$/.test(s)) {
    // Số ngày kể từ 30/12/1899 theo cách đếm của Excel
    const serial = Math.floor(Number(s));
    const t = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    [y, m, d] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
  } else return null;
  if (y < 1900 || y > 2100) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const GENDER_WORDS: Record<string, number> = { nam: 1, '1': 1, m: 1, male: 1, nu: 2, '2': 2, f: 2, female: 2, khac: 3, '3': 3, other: 3 };
const STATUS_WORDS: Record<string, number> = {
  'dang lam viec': 1,
  'dang lam': 1,
  'lam viec': 1,
  '1': 1,
  active: 1,
  'nghi viec': 2,
  'da nghi viec': 2,
  'da nghi': 2,
  nghi: 2,
  '2': 2,
  inactive: 2,
};
const YES = new Set(['x', 'co', 'c', '1', 'true', 'yes', 'y', 'cho phep']);
const NO = new Set(['khong', 'k', '0', 'false', 'no', 'n', 'khong cho phep']);

/** Chữ của một ô: số, boolean (JSON) đổi sang chữ; ô quá dài thì cắt để không giữ cả đoạn văn trong bộ nhớ */
const cellText = (v: unknown): string => (v == null ? '' : typeof v === 'string' ? v.slice(0, CELL_MAX).trim() : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');

/** Dòng tiêu đề (người dùng dán cả hàng đầu của file mẫu): đa số ô trùng tên cột hoặc tên gọi khác của cột đó */
export function isHeaderRow(row: Record<string, unknown>): boolean {
  const filled = EMPLOYEE_FIELDS.filter((f) => cellText(row[f.key]) !== '');
  if (filled.length < 2) return false;
  // File mẫu ghi "Mã nhân viên *" cho cột bắt buộc: bỏ dấu * khi so
  const text = (f: EmployeeField) => fold(cellText(row[f.key]).replace(/\s*\*$/, ''));
  const named = filled.filter((f) => [f.label, ...(f.aliases ?? [])].some((n) => fold(n) === text(f)));
  return named.length >= Math.max(2, Math.ceil(filled.length * 0.6));
}

export interface ImportRow {
  /** Giá trị đã đọc, theo khóa JSON như form (null: bỏ trống) */
  input: EmployeeInput;
  /** Lỗi theo khóa trường */
  errors: Record<string, string>;
  /** Tên đã dò được, để người dùng đối chiếu (phòng ban, chức danh) */
  resolved: { departmentName?: string; jobTitleName?: string };
  header?: boolean;
}

/**
 * Đọc một dòng dán từ Excel thành giá trị của hồ sơ: chữ hoa cho mã, ngày nhiều định dạng, giới tính, tình trạng theo chữ hoặc số,
 * phòng ban theo mã hoặc tên (không dấu), chức danh theo mã hoặc tên trong số chức danh dùng được cho phòng ban.
 * Chưa kiểm trùng mã (cần cả lô) và các quy tắc của EmployeeService.checkRules.
 */
export function readRow(row: Record<string, unknown>, ctx: EmployeeContext, allowedTitles: (deptId: number) => { Id: number; Code: string; Name: string }[]): ImportRow {
  const input: EmployeeInput = {};
  const errors: Record<string, string> = {};
  const resolved: ImportRow['resolved'] = {};
  const set = (k: string, v: unknown) => ((input as Record<string, unknown>)[k] = v);
  for (const f of EMPLOYEE_FIELDS) {
    const raw = cellText(row[f.key]);
    if (raw === '') {
      if (f.required && f.key !== 'employmentStatus') errors[f.key] = 'Bắt buộc nhập.';
      continue;
    }
    const err = readCell(f, raw, set);
    if (err) errors[f.key] = err;
  }
  // Tình trạng bỏ trống: đang làm việc
  if (input.employmentStatus == null && !errors.employmentStatus) input.employmentStatus = 1;

  const deptText = cellText(row.departmentId);
  if (deptText) {
    const dept = findDepartment(ctx, deptText);
    if (typeof dept === 'string') errors.departmentId = dept;
    else {
      input.departmentId = dept.Id;
      resolved.departmentName = dept.Name;
    }
  }
  const titleText = cellText(row.jobTitleId);
  if (titleText) {
    const pool = input.departmentId ? allowedTitles(input.departmentId) : [...ctx.titles.values()].filter((t) => t.IsActive);
    const t = findByCodeOrName(pool, titleText);
    if (t === 'many') errors.jobTitleId = `Có nhiều chức danh tên "${titleText}", dùng mã chức danh.`;
    else if (t) {
      input.jobTitleId = t.Id;
      resolved.jobTitleName = t.Name;
    } else if (input.departmentId) errors.jobTitleId = `Chức danh "${titleText}" không dùng cho ${resolved.departmentName}.`;
    else if (!errors.departmentId) errors.jobTitleId = `Không có chức danh "${titleText}".`;
  }
  return { input, errors, resolved };
}

/** Đọc một ô (trừ phòng ban, chức danh): ghi giá trị qua `set`, trả lỗi nếu có */
function readCell(f: EmployeeField, raw: string, set: (k: string, v: unknown) => void): string | null {
  if (f.max && raw.length > f.max) return `Tối đa ${f.max} ký tự (đang có ${raw.length}).`;
  switch (f.type) {
    case 'code': {
      const code = raw.toUpperCase();
      if (!EMPLOYEE_CODE.test(code)) return 'Chỉ gồm chữ không dấu, số, dấu chấm, gạch dưới, gạch ngang.';
      set(f.key, code);
      return null;
    }
    case 'email':
      if (!EMAIL.test(raw)) return 'Email chưa đúng dạng (ví dụ ten@congty.vn).';
      set(f.key, raw);
      return null;
    case 'date': {
      const d = parseDate(raw);
      if (!d) return 'Ngày chưa đúng, nhập dạng dd/mm/yyyy.';
      set(f.key, d);
      return null;
    }
    case 'bool': {
      const w = fold(raw);
      if (YES.has(w)) set(f.key, true);
      else if (NO.has(w)) set(f.key, false);
      else return 'Nhập Có hoặc Không.';
      return null;
    }
    case 'gender': {
      const g = GENDER_WORDS[fold(raw)];
      if (!g) return 'Nhập Nam, Nữ hoặc Khác.';
      set(f.key, g);
      return null;
    }
    case 'status': {
      const s = STATUS_WORDS[fold(raw)];
      if (!s) return 'Nhập Đang làm việc hoặc Nghỉ việc.';
      set(f.key, s);
      return null;
    }
    case 'department':
    case 'jobTitle':
      return null;
    default:
      set(f.key, raw);
      return null;
  }
}

/** Mã đúng chữ (không phân biệt hoa thường) hoặc tên không dấu; 'many' khi nhiều mục trùng tên */
function findByCodeOrName<T extends { Code: string; Name: string }>(items: T[], text: string): T | 'many' | null {
  const byCode = items.find((x) => x.Code.toUpperCase() === text.toUpperCase());
  if (byCode) return byCode;
  const named = items.filter((x) => fold(x.Name) === fold(text));
  if (named.length) return named.length > 1 ? 'many' : named[0];
  // Dạng "[MÃ] tên" (file xuất), "MÃ - tên"
  const code = /^\[([^\]]+)\]/.exec(text)?.[1] ?? /^([A-Za-z0-9._-]+)\s+-\s+/.exec(text)?.[1];
  return (code && items.find((x) => x.Code.toUpperCase() === code.toUpperCase())) || null;
}

/** Phòng ban đang dùng theo mã, tên, hoặc dạng "[MÃ] tên", "MÃ - tên" (như ô chọn và file xuất hiện) */
function findDepartment(ctx: EmployeeContext, text: string) {
  const active = [...ctx.depts.values()].filter((d) => d.IsActive);
  const hit = findByCodeOrName(active, text);
  if (hit === 'many') return `Có nhiều phòng ban tên "${text}", dùng mã phòng ban.`;
  if (hit) return hit;
  const gone = [...ctx.depts.values()].find((d) => !d.IsActive && (d.Code === text.toUpperCase() || fold(d.Name) === fold(text)));
  return gone ? `${gone.Name} đã giải thể.` : `Không có phòng ban "${text}" đang dùng.`;
}

/**
 * Nhập hồ sơ nhân viên dán từ Excel (ADR 0012 mục 9). Xem trước: đọc, dò và kiểm mọi dòng, trả lỗi theo ô. Lưu: kiểm lại từ đầu
 * (không tin kết quả xem trước) rồi thêm từng dòng độc lập, dòng lỗi không chặn dòng khác.
 */
@Injectable()
export class EmployeeImportService {
  constructor(
    private readonly employees: EmployeeService,
    private readonly repo: EmployeeRepository,
    private readonly audit: AuditService,
  ) {}

  /** Đọc, dò và kiểm cả lô: lỗi theo ô, kể cả trùng mã trong lô và trong hệ thống */
  private async check(rows: Record<string, unknown>[]) {
    const ctx = await this.employees.loadContext();
    const allowed = (deptId: number) => this.employees.allowedTitles(ctx, deptId);
    const read = rows.map((r, i) => (i === 0 && isHeaderRow(r) ? ({ input: {}, errors: {}, resolved: {}, header: true } as ImportRow) : readRow(r, ctx, allowed)));
    for (const r of read) {
      if (r.header) continue;
      const keys = new Set(Object.keys(r.input));
      Object.assign(r.errors, Object.fromEntries(Object.entries(this.employees.checkRules(ctx, r.input, keys)).filter(([k]) => !r.errors[k])));
    }
    // Mã chấm công bỏ trống lấy theo mã nhân viên, nên kiểm trùng trên giá trị sẽ ghi
    const tkOf = (r: ImportRow) => r.input.timekeepingCode || r.input.code || null;
    const firstCode = new Map<string, number>();
    const firstTk = new Map<string, number>();
    read.forEach((r, i) => {
      if (r.header) return;
      const code = r.input.code;
      if (code && !r.errors.code) {
        if (firstCode.has(code)) r.errors.code = `Trùng mã với dòng ${firstCode.get(code)! + 1}.`;
        else firstCode.set(code, i);
      }
      const tk = tkOf(r);
      if (tk && !r.errors.timekeepingCode && !(r.input.timekeepingCode == null && r.errors.code)) {
        if (firstTk.has(tk)) r.errors.timekeepingCode = `Trùng mã chấm công với dòng ${firstTk.get(tk)! + 1}.`;
        else firstTk.set(tk, i);
      }
    });
    const taken = await this.repo.takenCodes([...firstCode.keys(), ...firstTk.keys()]);
    for (const r of read) {
      if (r.header) continue;
      if (r.input.code && !r.errors.code && taken.code.has(r.input.code)) r.errors.code = `Mã ${r.input.code} đã có trong hệ thống.`;
      const tk = tkOf(r);
      if (tk && !r.errors.timekeepingCode && taken.timekeeping.has(tk)) r.errors.timekeepingCode = `Mã chấm công ${tk} đã dùng cho nhân viên khác.`;
    }
    return { ctx, read };
  }

  /**
   * Cột người dùng không được sửa (chính sách cột) thì interceptor đã trả 403 trước khi tới đây; màn hình không đưa các cột đó vào
   * lưới nhập.
   */
  async preview(rows: Record<string, unknown>[]) {
    const { read } = await this.check(rows);
    return {
      // Lỗi dạng danh sách { field, message }: khóa trùng mã cột nhạy cảm (idNumber...) thì chính sách cột coi là đọc dữ liệu nhạy
      // cảm và ghi nhật ký đọc giả (review 5.8 L11)
      rows: read.map((r, i) => ({
        index: i,
        header: !!r.header,
        ok: !r.header && Object.keys(r.errors).length === 0,
        errors: Object.entries(r.errors).map(([field, message]) => ({ field, message })),
        resolved: r.resolved,
      })),
    };
  }

  /**
   * Thêm các dòng gửi lên (người dùng đã chọn), mỗi dòng một lần thêm. Dòng tiêu đề bỏ qua. Trả kết quả theo thứ tự dòng gửi lên.
   */
  async commit(user: AuthUser, rows: Record<string, unknown>[]) {
    const scope = scopeOf(user);
    const { read } = await this.check(rows);
    const results: { index: number; ok: boolean; id?: number; code?: string; message?: string; skipped?: boolean }[] = [];
    const created: { id: number; input: EmployeeInput }[] = [];
    for (const [i, r] of read.entries()) {
      if (r.header) {
        results.push({ index: i, ok: false, skipped: true, message: 'Dòng tiêu đề, bỏ qua.' });
        continue;
      }
      if (Object.keys(r.errors).length) {
        results.push({ index: i, ok: false, code: r.input.code ?? undefined, message: Object.values(r.errors).join(' ') });
        continue;
      }
      try {
        // Kiểm lại trong khóa chung của cây ngay lúc ghi (phòng ban, chức danh có thể vừa đổi sau lượt kiểm ở trên)
        const id = await this.employees.insert(scope, r.input);
        created.push({ id, input: r.input });
        results.push({ index: i, ok: true, id, code: r.input.code ?? undefined });
      } catch (e) {
        if (!(e instanceof AppException)) {
          // Không ghi giá trị ô (có thể là cột nhạy cảm), chỉ dòng, mã và mã lỗi SQL để lần ra nguyên nhân (review 5.8 M5)
          logger.error(`Dòng ${i + 1} (mã ${r.input.code ?? '?'}) không lưu được: SQL ${sqlErrorNumbers(e).join(',') || '-'} ${(e as Error)?.message ?? e}`);
        }
        results.push({ index: i, ok: false, code: r.input.code ?? undefined, message: e instanceof AppException ? e.message : 'Lỗi khi lưu dòng này, đã ghi lại để quản trị kiểm tra.' });
      }
    }
    if (created.length) {
      const who = { userId: user.userId, username: user.username, branchCode: user.branchCode, ip: user.ip };
      // Mỗi người một dòng CREATE (lọc nhật ký theo nhân viên vẫn thấy lúc được thêm), kèm một dòng IMPORT tổng
      const entries = await Promise.all(
        created.map(async (c) => ({ ...who, entityType: 'Employee', entityId: c.id, actionCode: 'CREATE', newValue: { ...(await this.employees.auditValue(c.input as Record<string, unknown>)), via: 'IMPORT' } })),
      );
      await this.audit.logMany([...entries, { ...who, entityType: 'Employee', entityId: null, actionCode: 'IMPORT', newValue: { count: created.length } }]);
    }
    return { created: created.length, failed: results.filter((r) => !r.ok && !r.skipped).length, results };
  }
}
