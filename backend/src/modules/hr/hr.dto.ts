import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { DEPARTMENT_CODE, EMAIL, EMPLOYEE_CODE } from './employee-fields';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// Regex chặn dạng, IsISO8601 strict chặn ngày không có thật (30/02): để lọt thì SQL Server lỗi chuyển kiểu, trả 500
const DateOnly = () => Matches(DATE_ONLY, { message: 'Ngày dạng YYYY-MM-DD.' });
const RealDate = () => IsISO8601({ strict: true }, { message: 'Ngày không có thật.' });
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
/** Chuỗi rỗng là bỏ trống (null): ô xóa hết chữ gửi '' */
const blankToNull = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const upperCode = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() || null : value));
/** Như @IsOptional nhưng không cho null: cột NOT NULL thì null phải trả 422, không lọt xuống DB thành lỗi 500. */
const Optional = () => ValidateIf((_o, v) => v !== undefined);
/** Cột cho phép NULL: bỏ qua khi không gửi hoặc gửi null */
const Nullable = () => IsOptional();
const Text = (max: number) => [Nullable(), blankToNull(), IsString(), MaxLength(max, { message: `Tối đa ${max} ký tự.` })];
const apply = (...decorators: PropertyDecorator[]) => (target: object, key: string | symbol) => decorators.forEach((d) => d(target, key));

// ---------- Phòng ban ----------

export class DepartmentTreeQuery {
  /** 1: kèm phòng ban đã giải thể */
  @IsOptional() @IsIn(['0', '1']) includeDissolved?: '0' | '1';
}

export class ManagerOptionsQuery {
  @IsOptional() @IsString() @MaxLength(60) q?: string;
  /** Nhân viên đang chọn: luôn trả về dù không khớp q (ô hiện đúng tên) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) selected?: number;
}

/** Phòng ban mới. Mã tự viết hoa; cha bỏ trống là phòng ban gốc. */
export class DepartmentCreateDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(DEPARTMENT_CODE, { message: 'Mã gồm chữ hoa không dấu, số, gạch ngang; tối đa 20 ký tự.' })
  code!: string;
  @trim() @IsString() @MinLength(1, { message: 'Nhập tên phòng ban.' }) @MaxLength(255) name!: string;
  @apply(...Text(255)) nameEn?: string | null;
  @Type(() => Number) @IsInt() @Min(1) departmentTypeId!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) parentId?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) managerEmployeeId?: number | null;
  @IsOptional() @upperCode() @Matches(/^[A-Z0-9_-]{1,10}$/, { message: 'Mã nhà máy không hợp lệ.' }) branchCode?: string | null;
  @IsOptional() @DateOnly() @RealDate() establishedDate?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) sortOrder?: number;
}

/** Sửa phòng ban: chỉ gửi phần đã đổi. Mã không sửa được (gửi mã khác thì 422 CODE_IMMUTABLE). */
export class DepartmentUpdateDto {
  @Optional() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value)) @IsString() code?: string;
  @Optional() @trim() @IsString() @MinLength(1, { message: 'Nhập tên phòng ban.' }) @MaxLength(255) name?: string;
  @apply(...Text(255)) nameEn?: string | null;
  @Optional() @Type(() => Number) @IsInt() @Min(1) departmentTypeId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) parentId?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) managerEmployeeId?: number | null;
  @IsOptional() @upperCode() @Matches(/^[A-Z0-9_-]{1,10}$/, { message: 'Mã nhà máy không hợp lệ.' }) branchCode?: string | null;
  @IsOptional() @DateOnly() @RealDate() establishedDate?: string | null;
  @Optional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) sortOrder?: number;
}

export class DepartmentDissolveDto {
  /** Bỏ trống: hôm nay */
  @IsOptional() @DateOnly() @RealDate() dissolvedDate?: string;
}

// ---------- Loại phòng ban (Quản trị › Danh mục hệ thống) ----------

/** Khớp CK_DepartmentType_Code: chữ hoa ASCII, số, gạch dưới, gạch ngang */
const DEPARTMENT_TYPE_CODE = /^[A-Z0-9_-]{1,20}$/;
const upperTrim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value));

export class DepartmentTypeCreateDto {
  @upperTrim() @IsString() @Matches(DEPARTMENT_TYPE_CODE, { message: 'Mã gồm chữ hoa không dấu, số, gạch dưới, gạch ngang; tối đa 20 ký tự.' }) code!: string;
  @trim() @IsString() @MinLength(1, { message: 'Nhập tên loại phòng ban.' }) @MaxLength(100) name!: string;
  @apply(...Text(300)) description?: string | null;
  @Type(() => Number) @IsInt() @Min(0) @Max(99) levelOrder!: number;
  @IsBoolean() isFinalLevel!: boolean;
  /** Bỏ trống: xếp cuối */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) sortOrder?: number;
}

/** Sửa loại phòng ban: chỉ gửi phần đã đổi. Mã không sửa được (gửi mã khác thì 422 CODE_IMMUTABLE). */
export class DepartmentTypeUpdateDto {
  @Optional() @upperTrim() @IsString() code?: string;
  @Optional() @trim() @IsString() @MinLength(1, { message: 'Nhập tên loại phòng ban.' }) @MaxLength(100) name?: string;
  @apply(...Text(300)) description?: string | null;
  @Optional() @Type(() => Number) @IsInt() @Min(0) @Max(99) levelOrder?: number;
  @Optional() @IsBoolean() isFinalLevel?: boolean;
  @Optional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) sortOrder?: number;
  @Optional() @IsBoolean() isActive?: boolean;
}

// ---------- Nhân viên ----------

export class EmployeeListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize: number = 20;
  @IsOptional() @IsString() @MaxLength(60) q?: string;
  /** Phòng ban đang chọn trên cây: lấy cả nhánh con */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) departmentId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) jobTitleId?: number;
  @IsOptional() @Type(() => Number) @IsIn([1, 2]) status?: number;
}

/**
 * Thêm, sửa nhân viên. Thêm: máy chủ kiểm đủ trường bắt buộc (mã, tên, giới tính, phòng ban, chức danh). Sửa: chỉ gửi phần
 * đã đổi; cột bắt buộc không nhận null. Khóa trùng mã cột ở SysResourceField nên chính sách cột kiểm được dữ liệu gửi lên.
 */
export class EmployeeWriteDto {
  @Optional() @upperCode() @IsString({ message: 'Nhập mã nhân viên.' }) @Matches(EMPLOYEE_CODE, { message: 'Mã gồm chữ hoa không dấu, số, dấu chấm, gạch dưới, gạch ngang; tối đa 30 ký tự.' })
  code?: string;
  @IsOptional() @upperCode() @IsString() @Matches(EMPLOYEE_CODE, { message: 'Mã chấm công gồm chữ hoa không dấu, số, dấu chấm, gạch dưới, gạch ngang; tối đa 30 ký tự.' })
  timekeepingCode?: string | null;
  @Optional() @trim() @IsString() @MinLength(1, { message: 'Nhập tên nhân viên.' }) @MaxLength(255) fullName?: string;
  @apply(...Text(255)) fullNameEn?: string | null;
  @IsOptional() @blankToNull() @IsString() @MaxLength(150) @Matches(EMAIL, { message: 'Email chưa đúng dạng (ví dụ ten@congty.vn).' }) email?: string | null;
  @Optional() @Type(() => Number) @IsIn([1, 2, 3], { message: 'Giới tính không hợp lệ.' }) gender?: number;
  @Optional() @Type(() => Number) @IsInt() @Min(1) departmentId?: number;
  @Optional() @Type(() => Number) @IsInt() @Min(1) jobTitleId?: number;
  @Optional() @Type(() => Number) @IsIn([1, 2], { message: 'Tình trạng không hợp lệ.' }) employmentStatus?: number;
  @IsOptional() @DateOnly() @RealDate() startDate?: string | null;
  @IsOptional() @DateOnly() @RealDate() endDate?: string | null;
  @apply(...Text(255)) timekeepingName?: string | null;
  @apply(...Text(50)) cardCode?: string | null;
  @apply(...Text(100)) staffType?: string | null;
  @IsOptional() @IsBoolean() isTimekeepingAllowed?: boolean | null;
  @apply(...Text(255)) nickname?: string | null;
  @IsOptional() @DateOnly() @RealDate() birthDate?: string | null;
  @apply(...Text(255)) birthPlace?: string | null;
  @apply(...Text(255)) hometown?: string | null;
  @apply(...Text(100)) ethnicity?: string | null;
  @apply(...Text(100)) nationality?: string | null;
  @apply(...Text(50)) idNumber?: string | null;
  @apply(...Text(255)) idIssuePlace?: string | null;
  @apply(...Text(50)) contactPhone?: string | null;
  @apply(...Text(255)) contactPerson?: string | null;
  @apply(...Text(500)) currentAddress?: string | null;
}

/** Số dòng tối đa mỗi lần nhập: 500 dòng × 26 cột vừa giới hạn 512 KB của bộ đọc JSON */
export const IMPORT_MAX_ROWS = 500;

/**
 * Các dòng dán từ Excel, mỗi dòng là chữ theo khóa trường (EMPLOYEE_FIELDS). Kiểm từng ô ở service: dòng sai không làm hỏng
 * cả lần gửi, mà trả lỗi theo ô.
 */
export class EmployeeImportDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Chưa có dòng nào.' })
  @ArrayMaxSize(IMPORT_MAX_ROWS, { message: `Tối đa ${IMPORT_MAX_ROWS} dòng mỗi lần.` })
  @IsObject({ each: true })
  rows!: Record<string, unknown>[];
}
