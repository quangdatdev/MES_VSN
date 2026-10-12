import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MAX_COLOR_SIZE_ROWS, SIZE_NAME } from './order.rules';

/** Như @IsOptional nhưng không cho null: cột NOT NULL thì null phải trả 422, không lọt xuống DB thành lỗi 500. */
const Optional = () => ValidateIf((_o, v) => v !== undefined);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DateOnly = () => Matches(DATE_ONLY, { message: 'Ngày dạng YYYY-MM-DD.' });
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
// Mã hàng thật của BRAVO có chữ tiếng Việt, dấu cách, ngoặc: chặn ký tự điều khiển, định dạng ẩn (đảo chiều chữ…), ngắt dòng.
// Đổi chữ hoa trước khi kiểm để độ dài đo đúng giá trị được lưu (NVARCHAR(120), MaxLength đếm theo UTF-16 như SQL Server)
const STYLE_CODE = /^[^\p{C}\p{Zl}\p{Zp}]+$/u;
const styleCode = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value));
// PO# lưu NVARCHAR(192) (MES_Order/0007): có chữ tiếng Việt, dấu cách, ngoặc; chặn ký tự điều khiển, định dạng ẩn, ngắt dòng
const PO_NUMBER = /^[^\p{C}\p{Zl}\p{Zp}]+$/u;
// Đổi chữ hoa trước khi kiểm (như mã hàng): MaxLength đếm theo UTF-16 như NVARCHAR, đúng giá trị được lưu
const poNumber = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value));
// Nhà máy SX (SysProductionFactory.Code, tên nhà máy theo OSM, ADR 0013 mục 9); chuỗi rỗng là bỏ chọn. Nhận cả danh sách cách
// nhau dấu phẩy (như cột) để lưu cả form gửi lại đúng giá trị đang có; giá trị mới phải là một mã của danh mục (service kiểm)
const FACTORY_CODE = /^[^\p{C}]{0,400}$/u;

export const SALES_ORDER_STATUSES = ['NEW', 'PLANNING', 'IN_PRODUCTION', 'DONE', 'CANCELLED'] as const;
export const PLAN_STATUSES = ['PLANNED', 'SCHEDULED', 'IN_PRODUCTION', 'DONE'] as const;
export const LINE_STATUSES = ['PLANNED', 'ALLOCATED', 'IN_PRODUCTION', 'DONE'] as const;

/** Bộ lọc theo cột (JSON, ADR 0011): chặn chuỗi dài vô lý trước khi parse; quá 8.000 ký tự thì parseColumnFilters báo rõ. */
export const ColumnFilterParam = () => MaxLength(20000, { message: 'Bộ lọc theo cột quá dài.' });
/** Tên trường JSON của cột được hỏi giá trị; còn phải nằm trong danh sách trắng của màn. */
export const FilterFieldParam = () => Matches(/^[a-zA-Z]{1,40}$/, { message: 'Cột lọc không hợp lệ.' });

/** Bộ lọc chung của các lưới (theo mô tả giao diện: ngày xuất hàng từ - đến, khách hàng, mã hàng). Mặc định 100 dòng đầu. */
export class OrderListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize: number = 100;
  @IsOptional() @IsString() @MaxLength(60) q?: string;
  @IsOptional() @IsString() @MaxLength(40) sort?: string;
  @IsOptional() @DateOnly() shipFrom?: string;
  @IsOptional() @DateOnly() shipTo?: string;
  @IsOptional() @IsString() @MaxLength(100) customer?: string;
  @IsOptional() @IsString() @MaxLength(120) style?: string;
  @IsOptional() @IsString() @MaxLength(20) season?: string;
  @IsOptional() @IsString() @MaxLength(20) status?: string;
  @IsOptional() @IsString() @MaxLength(20) line?: string;
  @IsOptional() @IsString() @ColumnFilterParam() cf?: string;
}

/** Popup lọc theo cột: giá trị của một cột theo các bộ lọc đang áp, `search` thu hẹp danh sách. */
export class OrderValuesQuery extends OrderListQuery {
  @IsString() @FilterFieldParam() field!: string;
  @IsOptional() @IsString() @MaxLength(60) search?: string;
}

// ---------- Phân bổ PO (OSM, task 5.9.12) ----------

/**
 * Bộ lọc của màn Phân bổ PO, cùng tên tham số với các lưới Đơn hàng (giao diện dùng chung bộ lọc trên URL): `customer` là Brand,
 * `season` là Season, `style` tìm trong Style No, Style name, `q` tìm trong PO, SO. Độ dài theo cột của view OSM v_OSMData.
 */
export class PoAllocationQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize: number = 100;
  @IsOptional() @IsString() @MaxLength(60) q?: string;
  @IsOptional() @IsString() @MaxLength(40) sort?: string;
  @IsOptional() @IsString() @MaxLength(50) customer?: string;
  @IsOptional() @IsString() @MaxLength(50) season?: string;
  @IsOptional() @IsString() @MaxLength(120) style?: string;
  @IsOptional() @IsString() @ColumnFilterParam() cf?: string;
}

export class PoAllocationValuesQuery extends PoAllocationQuery {
  @IsString() @FilterFieldParam() field!: string;
  @IsOptional() @IsString() @MaxLength(60) search?: string;
}

// Mã nhà máy SX của danh mục (tên theo OSM, MES_Core/0008): không dấu phẩy, không ký tự điều khiển
const FACTORY_NAME = /^[^\p{C},]+$/u;

/**
 * Đổi Nhà máy SX ở Phân bổ PO (task 5.10.4). `ids`: dòng đang thấy (máy chủ áp cho mọi dòng cùng SO, PO, Style No, Màu).
 * `factoryName`: mã nhà máy của danh mục (trùng mã cột đã đăng ký nên chính sách cột của Nhà máy SX tự áp); null là "Theo OSM";
 * bỏ trống chỉ được khi `dryRun` (hỏi trước số dòng sẽ bị áp). Không đặt khóa trùng mã cột khác (po, so, color…).
 */
export class PoAllocationFactoryDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Chọn ít nhất một dòng.' })
  @ArrayMaxSize(500, { message: 'Mỗi lần đổi tối đa 500 dòng.' })
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids!: number[];
  @ValidateIf((o: { factoryName?: unknown; dryRun?: boolean }) => o.factoryName !== null && (o.factoryName !== undefined || !o.dryRun))
  @trim()
  @IsString({ message: 'Chọn nhà máy SX, hoặc "Theo OSM" để bỏ nhập tay.' })
  @MinLength(1, { message: 'Chọn nhà máy SX, hoặc "Theo OSM" để bỏ nhập tay.' })
  @MaxLength(100)
  @Matches(FACTORY_NAME, { message: 'Mã nhà máy SX không hợp lệ.' })
  factoryName?: string | null;
  @IsOptional() @IsBoolean() dryRun?: boolean;
}

// ---------- Thông tin đơn hàng ----------

export class SalesOrderCreateDto {
  @trim() @IsString() @MinLength(1) @MaxLength(100) customerName!: string;
  @styleCode() @IsString() @MinLength(1) @MaxLength(120) @Matches(STYLE_CODE, { message: 'Mã hàng không được chứa xuống dòng hay ký tự ẩn.' }) styleCode!: string;
  @IsOptional() @trim() @IsString() @MaxLength(20) season?: string;
  @IsOptional() @trim() @IsString() @MaxLength(30) orderType?: string;
  @trim() @IsString() @MinLength(1) @MaxLength(150) productName!: string;
  @IsOptional() @trim() @IsString() @MaxLength(100) staffName?: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(100_000_000) qty!: number;
  @IsOptional() @trim() @IsString() @MinLength(1) @MaxLength(20) unitName?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100_000_000) unitPrice?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100_000_000) cmPrice?: number | null;
  @IsISO8601({ strict: true }) @DateOnly() shipDate!: string;
  @IsOptional() @IsIn(SALES_ORDER_STATUSES) statusCode?: (typeof SALES_ORDER_STATUSES)[number];
  @IsOptional() @trim() @IsString() @Matches(FACTORY_CODE, { message: 'Mã nhà máy sản xuất không hợp lệ.' }) productionFactoryCode?: string | null;
}

export class SalesOrderUpdateDto {
  @Optional() @trim() @IsString() @MinLength(1) @MaxLength(100) customerName?: string;
  @Optional() @styleCode() @IsString() @MinLength(1) @MaxLength(120) @Matches(STYLE_CODE, { message: 'Mã hàng không được chứa xuống dòng hay ký tự ẩn.' }) styleCode?: string;
  @IsOptional() @trim() @IsString() @MaxLength(20) season?: string | null;
  @IsOptional() @trim() @IsString() @MaxLength(30) orderType?: string | null;
  @Optional() @trim() @IsString() @MinLength(1) @MaxLength(150) productName?: string;
  @IsOptional() @trim() @IsString() @MaxLength(100) staffName?: string | null;
  @Optional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000_000) qty?: number;
  @Optional() @trim() @IsString() @MinLength(1) @MaxLength(20) unitName?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100_000_000) unitPrice?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100_000_000) cmPrice?: number | null;
  @Optional() @IsISO8601({ strict: true }) @DateOnly() shipDate?: string;
  @Optional() @IsIn(SALES_ORDER_STATUSES) statusCode?: (typeof SALES_ORDER_STATUSES)[number];
  @IsOptional() @trim() @IsString() @Matches(FACTORY_CODE, { message: 'Mã nhà máy sản xuất không hợp lệ.' }) productionFactoryCode?: string | null;
}

// ---------- Màu cỡ (dùng chung) ----------

export class ColorSizeQtyDto {
  @trim() @IsString() @MinLength(1) @MaxLength(100) colorName!: string;
  @trim() @Matches(SIZE_NAME, { message: 'Cỡ tối đa 20 ký tự (chữ, số, dấu chấm, gạch, ngoặc).' }) sizeName!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(10_000_000) qty!: number;
}

export class ColorSizeLinesDto {
  @IsArray() @ArrayMaxSize(MAX_COLOR_SIZE_ROWS) @ValidateNested({ each: true }) @Type(() => ColorSizeQtyDto) lines!: ColorSizeQtyDto[];
}

// ---------- Cập nhật tỷ lệ cắt (PO) ----------

export class CutRatioStyleQuery {
  @IsOptional() @DateOnly() shipFrom?: string;
  @IsOptional() @DateOnly() shipTo?: string;
  @IsOptional() @IsString() @MaxLength(100) customer?: string;
  @IsOptional() @IsString() @MaxLength(120) style?: string;
  /** "Người lập": chỉ PO do chính mình tạo */
  @IsOptional() @IsIn(['me']) createdBy?: 'me';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize: number = 100;
  @IsOptional() @IsString() @ColumnFilterParam() cf?: string;
}

export class CutRatioStyleValuesQuery extends CutRatioStyleQuery {
  @IsString() @FilterFieldParam() field!: string;
  @IsOptional() @IsString() @MaxLength(60) search?: string;
}

export class PoCreateDto {
  @Type(() => Number) @IsInt() salesOrderId!: number;
  @poNumber() @IsString() @MinLength(1, { message: 'Nhập PO#.' }) @MaxLength(192, { message: 'PO# tối đa 192 ký tự.' }) @Matches(PO_NUMBER, { message: 'PO# không được có xuống dòng hay ký tự ẩn.' }) poNumber!: string;
  @IsOptional() @trim() @IsString() @MaxLength(60) destination?: string;
  @IsOptional() @trim() @IsString() @MaxLength(30) packingListCode?: string;
  @IsOptional() @trim() @IsString() @MaxLength(30) customsDeclarationNo?: string;
  @IsISO8601({ strict: true }) @DateOnly() shipDate!: string;
  @IsArray() @ArrayMinSize(1, { message: 'Nhập ít nhất một dòng màu cỡ.' }) @ArrayMaxSize(MAX_COLOR_SIZE_ROWS) @ValidateNested({ each: true }) @Type(() => ColorSizeQtyDto) lines!: ColorSizeQtyDto[];
}

// ---------- Kế hoạch xuất hàng ----------

export class CandidateQuery {
  @IsOptional() @DateOnly() shipFrom?: string;
  @IsOptional() @DateOnly() shipTo?: string;
  @IsOptional() @IsString() @MaxLength(100) customer?: string;
  @IsOptional() @IsString() @MaxLength(120) style?: string;
}

export class DraftQuery {
  @Type(() => Number) @IsInt() salesOrderId!: number;
  /** Id PO, ngăn bằng dấu phẩy */
  @Matches(/^\d+(,\d+){0,99}$/, { message: 'Chọn ít nhất một PO.' }) poIds!: string;
  @IsOptional() @Type(() => Number) @IsInt() excludePlanId?: number;
}

export class PlanLineQtyDto {
  @trim() @IsString() @MinLength(1) @MaxLength(100) colorName!: string;
  @trim() @IsString() @MinLength(1) @MaxLength(20) sizeName!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(10_000_000) planQty!: number;
}

export class ShipmentPlanCreateDto {
  @Type(() => Number) @IsInt() salesOrderId!: number;
  @IsArray() @ArrayMinSize(1, { message: 'Chọn ít nhất một PO.' }) @ArrayMaxSize(100) @IsInt({ each: true }) poIds!: number[];
  @trim() @IsString() @MinLength(1, { message: 'Nhập PO/Buy date.' }) @MaxLength(40) poBuyDate!: string;
  @IsOptional() @IsISO8601({ strict: true }) @DateOnly() shipDate?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MAX_COLOR_SIZE_ROWS) @ValidateNested({ each: true }) @Type(() => PlanLineQtyDto) lines!: PlanLineQtyDto[];
}

export class ShipmentPlanUpdateDto {
  @Optional() @trim() @IsString() @MinLength(1) @MaxLength(40) poBuyDate?: string;
  @Optional() @IsISO8601({ strict: true }) @DateOnly() shipDate?: string;
  @Optional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MAX_COLOR_SIZE_ROWS) @ValidateNested({ each: true }) @Type(() => PlanLineQtyDto) lines?: PlanLineQtyDto[];
}

// ---------- Xếp chuyền ----------

export class ScheduleLineDto {
  @IsOptional() @Type(() => Number) @IsInt() id?: number;
  @trim() @Matches(/^[A-Z0-9-]{1,20}$/, { message: 'Chọn chuyền.' }) lineCode!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(10_000_000) qty!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) avgOutput!: number;
  @IsISO8601({ strict: true }) @DateOnly() startDate!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) offDays?: number;
  @IsOptional() @IsISO8601({ strict: true }) @DateOnly() outStartDate?: string | null;
  @IsOptional() @IsISO8601({ strict: true }) @DateOnly() outEndDate?: string | null;
  @IsOptional() @IsISO8601({ strict: true }) @DateOnly() warehouseStartDate?: string | null;
  @IsOptional() @IsISO8601({ strict: true }) @DateOnly() warehouseEndDate?: string | null;
}

export class ScheduleDto {
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ScheduleLineDto) lines!: ScheduleLineDto[];
}

export class BoardQuery {
  @IsISO8601({ strict: true }) @DateOnly() from!: string;
  @IsISO8601({ strict: true }) @DateOnly() to!: string;
  @IsOptional() @IsString() @MaxLength(120) style?: string;
  @IsOptional() @IsString() @MaxLength(100) customer?: string;
}

// ---------- Phân bổ màu cỡ ----------

/** Chỉ nhận số lượng giao cho các màu cỡ đã có của dòng dàn chuyền; SL kế hoạch lấy từ dữ liệu, không lấy từ client. */
export class AllocationRowDto {
  @trim() @IsString() @MinLength(1) @MaxLength(100) colorName!: string;
  @trim() @Matches(SIZE_NAME, { message: 'Cỡ tối đa 20 ký tự (chữ, số, dấu chấm, gạch, ngoặc).' }) sizeName!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(10_000_000) assignedQty!: number;
}

export class AllocationDto {
  @IsArray() @ArrayMaxSize(MAX_COLOR_SIZE_ROWS) @ValidateNested({ each: true }) @Type(() => AllocationRowDto) rows!: AllocationRowDto[];
}
