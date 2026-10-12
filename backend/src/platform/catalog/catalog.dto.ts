import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

/** Như @IsOptional nhưng không cho null: cột NOT NULL thì null phải trả 422, không lọt xuống DB thành lỗi 500. */
const Optional = () => ValidateIf((_o, v) => v !== undefined);
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const upper = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value));
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const HHMM_MESSAGE = { message: 'Giờ dạng HH:mm, ví dụ 07:30.' };

// ---------- Danh mục đơn giản (Đơn vị tính, Loại đơn hàng…) ----------

export class CatalogItemCreateDto {
  /** Mã lưu vào dữ liệu nghiệp vụ nên chữ hoa, không dấu, không sửa được sau khi tạo */
  @upper() @Matches(/^[A-Z0-9._-]{1,30}$/, { message: 'Mã gồm chữ không dấu, số, dấu chấm, gạch (tối đa 30 ký tự).' }) code!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsOptional() @trim() @IsString() @MaxLength(300) description?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000) sortOrder?: number;
}

export class CatalogItemUpdateDto {
  /** Gửi kèm mã thì phải trùng mã cũ: mã không sửa được */
  @Optional() @upper() @IsString() code?: string;
  @Optional() @trim() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @trim() @IsString() @MaxLength(300) description?: string | null;
  @Optional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000) sortOrder?: number;
  @Optional() @IsBoolean() isActive?: boolean;
}

// ---------- Xưởng, chuyền may (cây Nhà máy → Xưởng → Chuyền, ADR 0010) ----------

/** null: chuyền nằm thẳng dưới nhà máy, không thuộc xưởng nào */
const WorkshopRef = () => ValidateIf((_o, v) => v !== undefined && v !== null);

export class LineCreateDto {
  @Matches(/^[A-Z0-9]{1,10}$/, { message: 'Chọn đơn vị cơ sở.' }) branchCode!: string;
  @upper() @Matches(/^[A-Z0-9-]{1,20}$/, { message: 'Mã chuyền gồm chữ không dấu, số, gạch ngang (tối đa 20 ký tự), ví dụ A01-L13.' }) code!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000) sortOrder?: number;
  @WorkshopRef() @IsInt() @Min(1) workshopId?: number | null;
}

export class LineUpdateDto {
  @Optional() @upper() @IsString() code?: string;
  @Optional() @trim() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @Optional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000) sortOrder?: number;
  @Optional() @IsBoolean() isActive?: boolean;
  /** Gửi khi chuyển chuyền sang xưởng khác (null: về thẳng dưới nhà máy); không gửi là giữ nguyên */
  @WorkshopRef() @IsInt() @Min(1) workshopId?: number | null;
}

export class WorkshopCreateDto {
  @Matches(/^[A-Z0-9]{1,10}$/, { message: 'Chọn đơn vị cơ sở.' }) branchCode!: string;
  @upper() @Matches(/^[A-Z0-9-]{1,20}$/, { message: 'Mã xưởng gồm chữ không dấu, số, gạch ngang (tối đa 20 ký tự), ví dụ A01-X03.' }) code!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000) sortOrder?: number;
}

export class WorkshopUpdateDto {
  @Optional() @upper() @IsString() code?: string;
  @Optional() @trim() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @Optional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000) sortOrder?: number;
  @Optional() @IsBoolean() isActive?: boolean;
}

// ---------- Ca làm việc ----------

export class ShiftCreateDto {
  @upper() @Matches(/^[A-Z0-9._-]{1,20}$/, { message: 'Mã ca gồm chữ không dấu, số, dấu chấm, gạch (tối đa 20 ký tự).' }) code!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsOptional() @trim() @IsString() @MaxLength(300) description?: string | null;
  @Matches(HHMM, HHMM_MESSAGE) startTime!: string;
  @Matches(HHMM, HHMM_MESSAGE) endTime!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(480) breakMinutes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000) sortOrder?: number;
}

export class ShiftUpdateDto {
  @Optional() @upper() @IsString() code?: string;
  @Optional() @trim() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @trim() @IsString() @MaxLength(300) description?: string | null;
  @Optional() @Matches(HHMM, HHMM_MESSAGE) startTime?: string;
  @Optional() @Matches(HHMM, HHMM_MESSAGE) endTime?: string;
  @Optional() @Type(() => Number) @IsInt() @Min(0) @Max(480) breakMinutes?: number;
  @Optional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000) sortOrder?: number;
  @Optional() @IsBoolean() isActive?: boolean;
}

/** Ô tìm của bảng cây xưởng, chuyền và nút chọn nhà máy: lọc trên máy chủ. */
export class CatalogLinesQuery {
  @IsOptional() @IsString() @MaxLength(60) q?: string;
  @IsOptional() @Matches(/^[A-Z0-9]{1,10}$/, { message: 'Mã nhà máy không hợp lệ.' }) branch?: string;
}

/** Ô tìm mã, tên của danh mục đơn giản: lọc trên máy chủ. */
export class CatalogItemsQuery {
  @IsOptional() @IsString() @MaxLength(60) q?: string;
}

// ---------- Nhà máy SX (ADR 0013) ----------

export class FactoryCreateDto {
  /** Mã lưu vào đơn hàng (SalesOrder.ProductionFactoryCode) nên chữ hoa, không dấu, không sửa được sau khi tạo */
  @upper() @Matches(/^[A-Z0-9._-]{1,30}$/, { message: 'Mã gồm chữ không dấu, số, dấu chấm, gạch (tối đa 30 ký tự).' }) code!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @upper() @Matches(/^[A-Z0-9]{1,10}$/, { message: 'Chọn đơn vị cơ sở.' }) branchCode!: string;
  @IsOptional() @trim() @IsString() @MaxLength(300) description?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000) sortOrder?: number;
}

export class FactoryUpdateDto {
  /** Gửi kèm mã thì phải trùng mã cũ: mã không sửa được */
  @Optional() @upper() @IsString() code?: string;
  @Optional() @trim() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @Optional() @upper() @Matches(/^[A-Z0-9]{1,10}$/, { message: 'Chọn đơn vị cơ sở.' }) branchCode?: string;
  @IsOptional() @trim() @IsString() @MaxLength(300) description?: string | null;
  @Optional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000) sortOrder?: number;
  @Optional() @IsBoolean() isActive?: boolean;
}

// ---------- Danh mục chép từ BRAVO (chỉ xem) ----------

export class ExternalRowsQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 100;
  @IsOptional() @IsString() @MaxLength(60) q?: string;
}
