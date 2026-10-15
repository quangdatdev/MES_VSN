import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// Regex chặn dạng, IsISO8601 strict chặn ngày không có thật (30/02): để lọt thì SQL Server lỗi chuyển kiểu, trả 500
const DateOnly = () => Matches(DATE_ONLY, { message: 'Ngày dạng YYYY-MM-DD.' });
const RealDate = () => IsISO8601({ strict: true }, { message: 'Ngày không có thật.' });
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
/** Mã chuyền là mã bộ phận (quyết định 6.7), cùng mẫu với dòng dàn chuyền */
const LineCode = () => Matches(/^[A-Z0-9-]{1,20}$/, { message: 'Chọn chuyền sản xuất.' });

/** Số cấp tối đa của một chuyền, màu, cỡ trong một ngày (chặn gõ nhầm thừa số 0) */
export const MAX_SUPPLY_QTY = 1_000_000;
/** Số dòng tối đa mỗi lần lưu, mỗi lần tính lưới */
export const MAX_SUPPLY_ROWS = 2000;

/**
 * Trạng thái lệnh cấp (quyết định 13.8): Chưa cấp (chưa xác nhận); Cấp 1 phần, Cấp toàn phần tính lúc bấm Xác nhận cấp (còn dòng có
 * Số lượng còn lại > 0 hay không) rồi giữ nguyên.
 */
export const SUPPLY_STATUSES = ['PENDING', 'PARTIAL', 'FULL'] as const;
export type SupplyStatus = (typeof SUPPLY_STATUSES)[number];

/** Lưới lệnh cấp: dải lọc theo ảnh mẫu (Ngày tạo phiếu, Số lệnh cấp, Mã hàng, Người lập, Trạng thái) và lọc theo cột */
export class SupplyListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize: number = 100;
  @IsOptional() @IsString() @MaxLength(60) q?: string;
  @IsOptional() @IsString() @MaxLength(40) sort?: string;
  @IsOptional() @DateOnly() @RealDate() createdFrom?: string;
  @IsOptional() @DateOnly() @RealDate() createdTo?: string;
  @IsOptional() @IsString() @MaxLength(30) supplyNo?: string;
  @IsOptional() @IsString() @MaxLength(120) style?: string;
  @IsOptional() @IsString() @MaxLength(100) creator?: string;
  @IsOptional() @IsIn(SUPPLY_STATUSES) status?: SupplyStatus;
  /** Bộ lọc theo cột (JSON, ADR 0011) */
  @IsOptional() @IsString() @MaxLength(20000, { message: 'Bộ lọc theo cột quá dài.' }) cf?: string;
}

/** Popup lọc theo cột: giá trị của một cột theo các bộ lọc đang áp. */
export class SupplyValuesQuery extends SupplyListQuery {
  @IsString() @Matches(/^[a-zA-Z]{1,40}$/, { message: 'Cột lọc không hợp lệ.' }) field!: string;
  @IsOptional() @IsString() @MaxLength(60) search?: string;
}

/** Mã hàng đã phân màu cỡ cho một chuyền */
export class SupplyStylesQuery {
  @trim() @LineCode() line!: string;
}

/** Màu, cỡ đã phân cho một chuyền, một mã hàng */
export class SupplyColorSizesQuery extends SupplyStylesQuery {
  @trim() @IsString() @MinLength(1) @MaxLength(120) style!: string;
}

/**
 * Một dòng của lưới nhập: chuyền, mã hàng, màu, cỡ. Khóa line, style (không phải lineCode, styleCode) để chính sách cột của Chuyền,
 * Mã hàng không chặn việc chọn dòng: đây là khóa của ô, không phải giá trị người dùng sửa.
 */
export class SupplyCellKeyDto {
  @trim() @LineCode() line!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(120) style!: string;
  @IsString() @MinLength(1) @MaxLength(100) colorName!: string;
  @IsString() @MinLength(1) @MaxLength(20) sizeName!: string;
}

/** Tính lại lưới nhập theo Ngày cấp: số đã lưu của ngày đó, số đã cấp các ngày khác (đổi Ngày cấp, thêm dòng) */
export class SupplySheetDto {
  @DateOnly() @RealDate() date!: string;
  @IsArray() @ArrayMaxSize(MAX_SUPPLY_ROWS) @ValidateNested({ each: true }) @Type(() => SupplyCellKeyDto) items!: SupplyCellKeyDto[];
}

/** Số cấp trong ngày của một dòng: 0 hoặc null là xóa số của ngày đó. Khóa dayQty trùng mã cột để chính sách cột cưỡng chế. */
export class SupplyCellDto extends SupplyCellKeyDto {
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Number)
  @IsInt({ message: 'Số lượng cấp trong ngày là số nguyên.' })
  @Min(0, { message: 'Số lượng cấp trong ngày không được âm.' })
  @Max(MAX_SUPPLY_QTY)
  dayQty!: number | null;
}

/**
 * Lưu số cấp của một Ngày cấp (Thêm mới, Sửa): chỉ các ô đã sửa (hai người sửa hai ô khác nhau không ghi đè nhau). Dòng tự gom theo
 * mã hàng vào lệnh của (Ngày cấp, Mã hàng); chưa có lệnh thì tạo. `styles`: các mã hàng của form, để Ghi chú (khi gửi) áp cho lệnh của
 * từng mã hàng đó cả khi không ô nào đổi.
 */
export class SupplySaveDto {
  @DateOnly() @RealDate() date!: string;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(500) note?: string | null;
  @IsArray() @ArrayMaxSize(MAX_SUPPLY_ROWS) @ValidateNested({ each: true }) @Type(() => SupplyCellDto) items!: SupplyCellDto[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(120, { each: true }) styles!: string[];
}
