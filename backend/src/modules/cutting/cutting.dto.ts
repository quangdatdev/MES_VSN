import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// Regex chặn dạng, IsISO8601 strict chặn ngày không có thật (30/02): để lọt thì SQL Server lỗi chuyển kiểu, trả 500
const DateOnly = () => Matches(DATE_ONLY, { message: 'Ngày dạng YYYY-MM-DD.' });
const RealDate = () => IsISO8601({ strict: true }, { message: 'Ngày không có thật.' });

/** Số cắt tối đa của một màu cỡ trong một ngày (chặn gõ nhầm thừa số 0, giữ trong INT khi cộng lũy kế) */
export const MAX_DAY_QTY = 1_000_000;
/** Số màu cỡ tối đa mỗi lần lưu */
export const MAX_SAVE_CELLS = 2000;

/**
 * Trạng thái của kế hoạch trên màn, tính lúc đọc (quyết định 13.3): chưa cắt; đang cắt (0 < Lũy kế < KH); đã cắt đủ (Lũy kế ≥ KH);
 * kế hoạch xuất hàng nguồn đã bị xóa mà còn số cắt.
 */
export const CUTTING_STATUSES = ['NOT_STARTED', 'CUTTING', 'DONE', 'SOURCE_DELETED'] as const;
export type CuttingStatus = (typeof CUTTING_STATUSES)[number];

/** Bộ lọc màn Đồng bộ tiến độ cắt, cùng tên tham số với các lưới Đơn hàng (giao diện dùng chung bộ lọc trên URL). */
export class CuttingListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize: number = 100;
  @IsOptional() @IsString() @MaxLength(60) q?: string;
  @IsOptional() @IsString() @MaxLength(40) sort?: string;
  @IsOptional() @DateOnly() @RealDate() shipFrom?: string;
  @IsOptional() @DateOnly() @RealDate() shipTo?: string;
  @IsOptional() @IsString() @MaxLength(100) customer?: string;
  @IsOptional() @IsString() @MaxLength(120) style?: string;
  @IsOptional() @IsIn(CUTTING_STATUSES) status?: CuttingStatus;
  /** Bộ lọc theo cột (JSON, ADR 0011) */
  @IsOptional() @IsString() @MaxLength(20000, { message: 'Bộ lọc theo cột quá dài.' }) cf?: string;
}

/** Popup lọc theo cột: giá trị của một cột theo các bộ lọc đang áp. */
export class CuttingValuesQuery extends CuttingListQuery {
  @IsString() @Matches(/^[a-zA-Z]{1,40}$/, { message: 'Cột lọc không hợp lệ.' }) field!: string;
  @IsOptional() @IsString() @MaxLength(60) search?: string;
}

/** Popup một kế hoạch: Ngày nhập liệu đang xem (mặc định hôm nay) */
export class CuttingDayQuery {
  @IsOptional() @DateOnly() @RealDate() date?: string;
}

/** Số cắt trong ngày của một màu cỡ: 0 hoặc null là xóa số của ngày đó. Khóa dayQty trùng mã cột để chính sách cột cưỡng chế. */
export class CuttingCellDto {
  @IsString() @MinLength(1) @MaxLength(100) colorName!: string;
  @IsString() @MinLength(1) @MaxLength(20) sizeName!: string;
  @ValidateIf((_o, v) => v !== null) @Type(() => Number) @IsInt({ message: 'Số lượng trong ngày là số nguyên.' }) @Min(0, { message: 'Số lượng trong ngày không được âm.' }) @Max(MAX_DAY_QTY) dayQty!: number | null;
}

/** Lưu số cắt của một ngày: chỉ gửi các ô đã sửa (hai người sửa hai ô khác nhau không ghi đè nhau). */
export class CuttingSaveDto {
  @DateOnly() @RealDate() date!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MAX_SAVE_CELLS) @ValidateNested({ each: true }) @Type(() => CuttingCellDto) items!: CuttingCellDto[];
}
