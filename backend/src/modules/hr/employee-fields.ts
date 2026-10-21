import type { EmployeeTable } from './hr.types';

/**
 * Các trường của hồ sơ nhân viên, định nghĩa một chỗ cho API, kiểm tra, nhập từ Excel và xuất file (quyết định 10.5, 10.6). Màn
 * hình nhận danh sách này qua /hr/employees/options để dựng form, lưới nhập và file mẫu theo cùng thứ tự, cùng tên.
 * `key` là khóa JSON của API, trùng mã cột đăng ký ở SysResourceField (chính sách cột).
 */
export type EmployeeFieldType = 'code' | 'text' | 'email' | 'date' | 'bool' | 'gender' | 'status' | 'department' | 'jobTitle';
export type EmployeeFieldGroup = 'general' | 'timekeeping' | 'personal' | 'contact';

export interface EmployeeField {
  key: string;
  column: keyof EmployeeTable & string;
  label: string;
  group: EmployeeFieldGroup;
  type: EmployeeFieldType;
  required?: boolean;
  /** Độ dài tối đa (theo cột) */
  max?: number;
  /** Tên cột khác thường gặp trong file Excel (Support-Web, máy chấm công), để nhận ra dòng tiêu đề khi dán */
  aliases?: string[];
}

export const GROUP_LABEL: Record<EmployeeFieldGroup, string> = {
  general: 'Thông tin chung',
  timekeeping: 'Chấm công',
  personal: 'Thông tin cá nhân',
  contact: 'Giấy tờ và liên hệ',
};

export const EMPLOYEE_FIELDS: EmployeeField[] = [
  { key: 'code', column: 'Code', label: 'Mã nhân viên', group: 'general', type: 'code', required: true, max: 30, aliases: ['Mã NV', 'Manv', 'Employee code'] },
  { key: 'timekeepingCode', column: 'TimekeepingCode', label: 'Mã chấm công', group: 'general', type: 'code', max: 30, aliases: ['Mã CC', 'Mã máy chấm công'] },
  { key: 'fullName', column: 'FullName', label: 'Tên nhân viên', group: 'general', type: 'text', required: true, max: 255, aliases: ['Họ tên', 'Họ và tên', 'Hoten'] },
  { key: 'fullNameEn', column: 'FullNameEn', label: 'Tên tiếng Anh', group: 'general', type: 'text', max: 255, aliases: ['Họ tên tiếng Anh', 'English name'] },
  { key: 'email', column: 'Email', label: 'Email', group: 'general', type: 'email', max: 150, aliases: ['Thư điện tử'] },
  { key: 'gender', column: 'Gender', label: 'Giới tính', group: 'general', type: 'gender', required: true, aliases: ['Phái'] },
  { key: 'departmentId', column: 'DepartmentId', label: 'Phòng ban', group: 'general', type: 'department', required: true, aliases: ['Mã phòng ban', 'Bộ phận', 'Đơn vị'] },
  { key: 'jobTitleId', column: 'JobTitleId', label: 'Chức danh', group: 'general', type: 'jobTitle', required: true, aliases: ['Chức vụ', 'Vị trí'] },
  { key: 'employmentStatus', column: 'EmploymentStatus', label: 'Tình trạng', group: 'general', type: 'status', required: true, aliases: ['Tình trạng nhân viên', 'Trạng thái'] },
  { key: 'startDate', column: 'StartDate', label: 'Ngày bắt đầu làm việc', group: 'general', type: 'date', aliases: ['Ngày vào làm', 'Ngày vào'] },
  { key: 'endDate', column: 'EndDate', label: 'Ngày nghỉ việc', group: 'general', type: 'date', aliases: ['Ngày nghỉ'] },
  { key: 'timekeepingName', column: 'TimekeepingName', label: 'Tên chấm công', group: 'timekeeping', type: 'text', max: 255 },
  { key: 'cardCode', column: 'CardCode', label: 'Mã thẻ', group: 'timekeeping', type: 'text', max: 50, aliases: ['Số thẻ'] },
  { key: 'staffType', column: 'StaffType', label: 'Loại nhân viên', group: 'timekeeping', type: 'text', max: 100, aliases: ['Loại'] },
  { key: 'isTimekeepingAllowed', column: 'IsTimekeepingAllowed', label: 'Cho phép chấm công', group: 'timekeeping', type: 'bool', aliases: ['Cho phép'] },
  { key: 'nickname', column: 'Nickname', label: 'Tên thường gọi', group: 'personal', type: 'text', max: 255 },
  { key: 'birthDate', column: 'BirthDate', label: 'Ngày sinh', group: 'personal', type: 'date' },
  { key: 'birthPlace', column: 'BirthPlace', label: 'Nơi sinh', group: 'personal', type: 'text', max: 255 },
  { key: 'hometown', column: 'Hometown', label: 'Nguyên quán', group: 'personal', type: 'text', max: 255, aliases: ['Quê quán'] },
  { key: 'ethnicity', column: 'Ethnicity', label: 'Dân tộc', group: 'personal', type: 'text', max: 100 },
  { key: 'nationality', column: 'Nationality', label: 'Quốc tịch', group: 'personal', type: 'text', max: 100 },
  { key: 'idNumber', column: 'IdNumber', label: 'Số CMND/CCCD', group: 'contact', type: 'text', max: 50, aliases: ['CCCD', 'CMND', 'Số CCCD', 'Số CMND'] },
  { key: 'idIssuePlace', column: 'IdIssuePlace', label: 'Nơi cấp', group: 'contact', type: 'text', max: 255 },
  { key: 'contactPhone', column: 'ContactPhone', label: 'Điện thoại liên lạc', group: 'contact', type: 'text', max: 50, aliases: ['Điện thoại', 'Số điện thoại', 'SĐT'] },
  { key: 'contactPerson', column: 'ContactPerson', label: 'Người liên hệ', group: 'contact', type: 'text', max: 255 },
  { key: 'currentAddress', column: 'CurrentAddress', label: 'Địa chỉ hiện tại', group: 'contact', type: 'text', max: 500, aliases: ['Địa chỉ', 'Chỗ ở hiện tại'] },
];

export const FIELD_BY_KEY = new Map(EMPLOYEE_FIELDS.map((f) => [f.key, f]));

export const GENDERS = [
  { value: 1, label: 'Nam' },
  { value: 2, label: 'Nữ' },
  { value: 3, label: 'Khác' },
] as const;

export const EMPLOYMENT_STATUSES = [
  { value: 1, label: 'Đang làm việc' },
  { value: 2, label: 'Nghỉ việc' },
] as const;

/** Mã nhân viên, mã chấm công: chữ hoa không dấu, số, dấu chấm, gạch dưới, gạch ngang (khớp CHECK ở MES_Hr/0001) */
export const EMPLOYEE_CODE = /^[A-Z0-9._-]{1,30}$/;
/** Mã phòng ban: chữ hoa không dấu, số, gạch ngang (mã nằm trong Path, khớp CHECK ở MES_Hr/0001) */
export const DEPARTMENT_CODE = /^[A-Z0-9-]{1,20}$/;
/**
 * Email đủ dạng tên@miền.đuôi, chỉ ký tự ASCII in được (cột VARCHAR làm mất dấu nếu có chữ tiếng Việt); không kiểm sâu hơn (dữ
 * liệu chép từ hệ thống cũ)
 */
export const EMAIL = /^[!-?A-~]+@[!-?A-~]+\.[!-?A-~]+$/;

/** Bỏ dấu, chữ thường, gộp khoảng trắng: "Phòng  Kế toán" và "phong ke toan" là một. Dùng so tên khi nhập từ Excel. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
