import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

/** Như @IsOptional nhưng không cho null: cột NOT NULL thì null phải trả 422, không lọt xuống DB thành lỗi 500. */
const Optional = () => ValidateIf((_o, v) => v !== undefined);
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const upper = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value));
// Mã nhà máy SX so khớp với danh sách theo OSM đã tách (factory-list.ts): gộp khoảng trắng như khi tách
const factoryCode = () => Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().toUpperCase() : value));
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const HHMM_MESSAGE = { message: 'Giờ dạng HH:mm, ví dụ 07:30.' };
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = { message: 'Ngày dạng YYYY-MM-DD.' };
const BRANCH_CODE = /^[A-Z0-9]{1,10}$/;

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

/** Ô tìm mã, tên của danh mục đơn giản: lọc trên máy chủ. */
export class CatalogItemsQuery {
  @IsOptional() @IsString() @MaxLength(60) q?: string;
}

// ---------- Nhà máy SX (quyết định 6.2) ----------

export class FactoryCreateDto {
  /**
   * Mã lưu vào đơn hàng (SalesOrder.ProductionFactoryCode, danh sách cách nhau dấu phẩy) nên không có dấu phẩy, không sửa được
   * sau khi tạo. Mã là tên nhà máy theo OSM (quyết định 6.2): có khoảng trắng, chữ tiếng Việt
   */
  @factoryCode() @Matches(/^[^,\p{C}]{1,100}$/u, { message: 'Mã tối đa 100 ký tự, không có dấu phẩy (thường là tên nhà máy theo OSM).' }) code!: string;
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

// ---------- Lịch làm việc theo ĐVCS (phase 5.12) ----------

export class WorkCalendarUpdateDto {
  /** Thứ nghỉ hằng tuần theo ISO (1 = thứ Hai … 7 = Chủ nhật); phải còn ít nhất một ngày làm việc */
  @IsArray() @ArrayMaxSize(6, { message: 'Phải còn ít nhất một ngày làm việc trong tuần.' }) @ArrayUnique() @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true })
  weeklyOffDays!: number[];
  @Type(() => Number) @IsInt() @Min(0) @Max(60) outStartOffsetDays!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(60) outEndOffsetDays!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(60) warehouseStartOffsetDays!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(60) warehouseEndOffsetDays!: number;
  // Tùy chọn: giao diện cũ chưa tải lại không gửi thì giữ ngưỡng đang có (MES_Core/0014)
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Ngưỡng làm tròn là số từ 0,01 đến 1, tối đa 2 chữ số lẻ.' }) @Min(0.01, { message: 'Ngưỡng làm tròn là số từ 0,01 đến 1, tối đa 2 chữ số lẻ.' }) @Max(1, { message: 'Ngưỡng làm tròn là số từ 0,01 đến 1, tối đa 2 chữ số lẻ.' }) productionRoundUpFrom?: number;
}

export class WorkCalendarDaysDto {
  /** Áp cùng lúc cho nhiều ĐVCS (ví dụ nghỉ Tết toàn công ty) */
  @IsArray() @ArrayMinSize(1, { message: 'Chọn ít nhất một đơn vị cơ sở.' }) @ArrayMaxSize(50) @ArrayUnique() @Matches(BRANCH_CODE, { each: true, message: 'Mã đơn vị cơ sở không hợp lệ.' })
  branchCodes!: string[];
  @Matches(DATE_ONLY, DATE_MESSAGE) from!: string;
  @Matches(DATE_ONLY, DATE_MESSAGE) to!: string;
  @IsIn(['OFF', 'WORK'], { message: 'Chọn Nghỉ hoặc Làm bù.' }) dayType!: 'OFF' | 'WORK';
  @IsOptional() @trim() @IsString() @MaxLength(100) name?: string | null;
}

export class WorkCalendarYearQuery {
  @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year!: number;
}

export class WorkCalendarRangeQuery {
  @Matches(DATE_ONLY, DATE_MESSAGE) from!: string;
  @Matches(DATE_ONLY, DATE_MESSAGE) to!: string;
}
