import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// Regex chặn dạng, IsISO8601 strict chặn ngày không có thật (30/02): để lọt thì SQL Server lỗi chuyển kiểu, trả 500
const DateOnly = () => Matches(DATE_ONLY, { message: 'Ngày dạng YYYY-MM-DD.' });
const RealDate = () => IsISO8601({ strict: true }, { message: 'Ngày không có thật.' });
/** Như @IsOptional nhưng không cho null: cột NOT NULL thì null phải trả 422, không lọt xuống DB thành lỗi 500. */
const Optional = () => ValidateIf((_o, v) => v !== undefined);
/** Mã bộ phận (MES_Hr.Department.Code): chữ hoa ASCII, số, gạch ngang */
const DEPT_CODE = /^[A-Z0-9-]{1,20}$/;
/** Giờ trong ngày "HH:mm" (không có ca qua đêm, Q13) */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Số dòng tối đa mỗi lần Cập nhật */
export const MAX_PLAN_ITEMS = 500;
/** Trần của số kế hoạch một dòng một ngày (sản phẩm) */
const MAX_QTY = 100_000_000;

const qty = () => [ValidateIf((_o, v) => v !== undefined && v !== null), Type(() => Number), IsInt({ message: 'Số lượng là số nguyên.' }), Min(0), Max(MAX_QTY)];
const apply = (decorators: PropertyDecorator[]): PropertyDecorator => (target, key) => decorators.forEach((d) => d(target, key));
const ids = () => Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean).map(Number) : Array.isArray(value) ? value.map(Number) : value));

/** Màn Kế hoạch may: một ngày, một đơn vị phòng ban (không có: mọi chuyền của ĐVCS phiên); `extra`: dòng dàn chuyền người dùng vừa thêm */
export class SewingPlanQuery {
  @DateOnly() @RealDate() date!: string;
  @IsOptional() @Matches(DEPT_CODE, { message: 'Mã đơn vị không hợp lệ.' }) dept?: string;
  @IsOptional() @ids() @IsArray() @ArrayMaxSize(200) @IsInt({ each: true }) @Min(1, { each: true }) extra?: number[];
}

/** Dòng dàn chuyền để Thêm dòng: chuyền → mã hàng → PO/Buy date, của các chuyền thuộc đơn vị */
export class SewingPlanOptionsQuery {
  @IsOptional() @Matches(DEPT_CODE, { message: 'Mã đơn vị không hợp lệ.' }) dept?: string;
}

/**
 * Số nhập của một dòng dàn chuyền trong ngày. Khóa không gửi thì giữ số đã lưu; null là xóa số. Khóa trùng mã cột (linemapQty, dayQty,
 * startTime, endTime) nên chính sách cột của sewing.plan áp khi ghi.
 */
export class SewingPlanItemDto {
  @Type(() => Number) @IsInt() @Min(1) lineId!: number;
  /** Thời điểm tạo của dòng dàn chuyền (Id được dùng lại sau khi nạp lại dữ liệu đơn hàng) */
  @IsISO8601({ strict: true }) lineCreatedAt!: string;
  @apply(qty()) linemapQty?: number | null;
  @apply(qty()) dayQty?: number | null;
  @Optional() @IsString() @Matches(HHMM, { message: 'Giờ dạng HH:mm.' }) startTime?: string;
  @Optional() @IsString() @Matches(HHMM, { message: 'Giờ dạng HH:mm.' }) endTime?: string;
}

/**
 * Phiên bản của bản ghi chuyền × ngày lúc mở màn: người khác vừa Cập nhật, Chốt cùng chuyền cùng ngày thì 409. Khóa `line` (không phải
 * `lineCode`, mã cột Tổ SX): chính sách cột của Tổ SX không chặn lần ghi (review 5.16 M1, như quyết định 13.10)
 */
export class SewingPlanLineVersionDto {
  @IsString() @MaxLength(20) line!: string;
  @IsString() @MaxLength(30) version!: string;
}

export class SewingPlanSaveDto {
  @DateOnly() @RealDate() date!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MAX_PLAN_ITEMS) @ValidateNested({ each: true }) @Type(() => SewingPlanItemDto) items!: SewingPlanItemDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => SewingPlanLineVersionDto) versions?: SewingPlanLineVersionDto[];
}

/** Chốt, Hủy chốt mọi chuyền đang hiện của đơn vị chọn trong một ngày */
export class SewingPlanLockDto {
  @DateOnly() @RealDate() date!: string;
  @IsOptional() @Matches(DEPT_CODE, { message: 'Mã đơn vị không hợp lệ.' }) dept?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => SewingPlanLineVersionDto) versions?: SewingPlanLineVersionDto[];
}
