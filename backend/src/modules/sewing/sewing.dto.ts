import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// Regex chặn dạng, IsISO8601 strict chặn ngày không có thật (30/02): để lọt thì SQL Server lỗi chuyển kiểu, trả 500
const DateOnly = () => Matches(DATE_ONLY, { message: 'Ngày dạng YYYY-MM-DD.' });
const RealDate = () => IsISO8601({ strict: true }, { message: 'Ngày không có thật.' });
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
/** Như @IsOptional nhưng không cho null: cột NOT NULL thì null phải trả 422, không lọt xuống DB thành lỗi 500. */
const Optional = () => ValidateIf((_o, v) => v !== undefined);
// Mã bước chuẩn bị: chữ hoa, số, dấu chấm, gạch dưới, gạch ngang (như mã danh mục)
const STEP_CODE = /^[A-Z0-9._-]{1,30}$/;

/**
 * Trạng thái vào chuyền của dòng (người dùng chốt 10/10/2026, task 5.5.7): chưa đến ngày vào chuyền; đã đến ngày mà còn
 * bước chưa nhập TH; đã nhập đủ TH.
 */
export const PREP_STATUSES = ['NOT_DUE', 'NOT_READY', 'READY'] as const;
export type PrepStatus = (typeof PREP_STATUSES)[number];

/**
 * Bộ lọc màn Kế hoạch chuẩn bị SX: ngày vào chuyền từ - đến, đơn vị (nhà máy, khi xem tổng hợp A00), tổ, mã hàng, loại mã,
 * trạng thái, tuần.
 */
export class PrepListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize: number = 100;
  @IsOptional() @IsString() @MaxLength(60) q?: string;
  @IsOptional() @IsString() @MaxLength(40) sort?: string;
  @IsOptional() @DateOnly() @RealDate() startFrom?: string;
  @IsOptional() @DateOnly() @RealDate() startTo?: string;
  @IsOptional() @IsString() @MaxLength(100) customer?: string;
  @IsOptional() @IsString() @MaxLength(120) style?: string;
  @IsOptional() @IsString() @MaxLength(20) line?: string;
  /** Lọc trong phạm vi đã xem được (phiên A00 xem một nhà máy), không đổi nhà máy của phiên */
  @IsOptional() @Matches(/^[A-Za-z0-9_-]{1,10}$/, { message: 'Mã nhà máy không hợp lệ.' }) branch?: string;
  @IsOptional() @IsString() @MaxLength(50) styleType?: string;
  @IsOptional() @IsIn(PREP_STATUSES) status?: PrepStatus;
  /**
   * Một ngày trong tuần đang chọn (thanh tuần T1…T53): dòng có bước đến hạn KH tới hết tuần (Chủ nhật) mà chưa nhập TH, cộng
   * dòng vào chuyền trong tuần (thứ Hai – Chủ nhật).
   */
  @IsOptional() @DateOnly() @RealDate() week?: string;
  /** Bộ lọc theo cột (JSON, ADR 0011) */
  @IsOptional() @IsString() @MaxLength(20000, { message: 'Bộ lọc theo cột quá dài.' }) cf?: string;
}

/** Popup lọc theo cột: giá trị của một cột theo các bộ lọc đang áp. */
export class PrepValuesQuery extends PrepListQuery {
  @IsString() @Matches(/^[a-zA-Z]{1,40}$/, { message: 'Cột lọc không hợp lệ.' }) field!: string;
  @IsOptional() @IsString() @MaxLength(60) search?: string;
}

/** Một bước của một dòng: số ngày KH chỉnh riêng (null: theo danh mục) và ngày thực hiện (null: chưa làm). */
export class PrepStepValueDto {
  @Type(() => Number) @IsInt() @Min(1) stepId!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) planDays?: number | null;
  @IsOptional() @DateOnly() @RealDate() doneDate?: string | null;
}

/** Sửa một dòng: cột nhập tay (Loại mã, Số lượng chốt UD, HS ưu đãi VC) và các bước. Chỉ gửi phần đã đổi. */
export class PrepUpdateDto {
  @IsOptional() @trim() @IsString() @MaxLength(50) styleType?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000_000) confirmedQty?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9_999_999) priorityFactor?: number | null;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PrepStepValueDto) steps?: PrepStepValueDto[];
}

/** Ngày TH của một bước khi nhập trên bảng. `previous`: ngày lúc tải bảng, để biết người khác vừa sửa ô này. */
export class PrepDoneDto {
  @Type(() => Number) @IsInt() @Min(1) stepId!: number;
  /** null: xóa ngày TH */
  @ValidateIf((_o, v) => v !== null) @DateOnly() @RealDate() doneDate!: string | null;
  @IsOptional() @DateOnly() @RealDate() previous?: string | null;
}

export class PrepDoneRowDto {
  @Type(() => Number) @IsInt() @Min(1) id!: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PrepDoneDto) steps!: PrepDoneDto[];
}

/** Lưu các ô TH đã nhập trên bảng, nhiều dòng một lần (một transaction). */
export class PrepDoneBatchDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => PrepDoneRowDto) items!: PrepDoneRowDto[];
}

// ---------- Danh mục "Cấu hình chuẩn bị SX" ----------

export class PrepStepCreateDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(STEP_CODE, { message: 'Mã gồm chữ hoa không dấu, số, dấu chấm, gạch dưới, gạch ngang; tối đa 30 ký tự.' })
  code!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(150) name!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(365) planDays!: number;
  @IsOptional() @trim() @IsString() @MaxLength(100) performer?: string | null;
  @IsOptional() @trim() @IsString() @MaxLength(500) dataSource?: string | null;
  @IsOptional() @trim() @IsString() @MaxLength(300) description?: string | null;
}

export class PrepStepUpdateItemDto {
  @Type(() => Number) @IsInt() @Min(1) id!: number;
  @Optional() @trim() @IsString() @MinLength(1) @MaxLength(150) name?: string;
  @Optional() @Type(() => Number) @IsInt() @Min(0) @Max(365) planDays?: number;
  @IsOptional() @trim() @IsString() @MaxLength(100) performer?: string | null;
  @IsOptional() @trim() @IsString() @MaxLength(500) dataSource?: string | null;
  @IsOptional() @trim() @IsString() @MaxLength(300) description?: string | null;
  @Optional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000) sortOrder?: number;
  @Optional() @IsBoolean() isActive?: boolean;
}

/** Lưu nhiều bước một lần (bảng danh mục sửa như bảng tính). */
export class PrepStepBatchDto {
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PrepStepUpdateItemDto) items!: PrepStepUpdateItemDto[];
}
