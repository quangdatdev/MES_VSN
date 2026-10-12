import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
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

/** Như @IsOptional nhưng không cho null: cột NOT NULL thì null phải trả 422, không lọt xuống DB thành lỗi 500. */
const Optional = () => ValidateIf((_o, v) => v !== undefined);
/** Email bỏ trống ('' hoặc null) nghĩa là xóa email. */
const OptionalEmail = () => ValidateIf((_o, v) => v != null && v !== '');

export class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 100;
  @IsOptional() @IsString() @MaxLength(60) q?: string;
}

export class UserCreateDto {
  @Matches(/^[a-z0-9._-]{3,50}$/, { message: 'Tên đăng nhập gồm 3-50 ký tự thường, số, dấu chấm, gạch ngang hoặc gạch dưới.' })
  username!: string;
  @IsString() @MinLength(1) @MaxLength(150) fullName!: string;
  @IsOptional() @IsEmail({}, { message: 'Email không hợp lệ.' }) @MaxLength(150) email?: string;
  @IsString() @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự.' }) @MaxLength(100) initialPassword!: string;
}

export class UserUpdateDto {
  @Optional() @IsString() @MinLength(1) @MaxLength(150) fullName?: string;
  @OptionalEmail() @IsEmail({}, { message: 'Email không hợp lệ.' }) @MaxLength(150) email?: string | null;
  @Optional() @IsBoolean() isActive?: boolean;
  /** true: mở khóa tài khoản đang bị khóa tạm do đăng nhập sai */
  @Optional() @IsBoolean() unlock?: boolean;
}

export class ResetPasswordDto {
  @IsString() @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự.' }) @MaxLength(100) newPassword!: string;
}

export class UserRolesDto {
  @IsArray() @ArrayMaxSize(50) @IsInt({ each: true }) roleIds!: number[];
}

export class UserBranchesDto {
  @IsArray() @ArrayMaxSize(100) @IsInt({ each: true }) branchIds!: number[];
  @IsOptional() @IsInt() defaultBranchId?: number;
  /** Nhà máy SX được tích (ADR 0013). Không gửi: giữ nguyên danh sách đang có; null bị từ chối (không coi là xóa hết) */
  @Optional() @IsArray() @ArrayMaxSize(500) @IsInt({ each: true }) productionFactoryIds?: number[];
}

export class RoleCreateDto {
  @Matches(/^[A-Z][A-Z0-9_]{1,29}$/, { message: 'Mã vai trò viết hoa, gồm chữ, số, gạch dưới (2-30 ký tự).' }) code!: string;
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}

export class RoleUpdateDto {
  /** Khai báo để phát hiện việc cố sửa mã (trả CODE_IMMUTABLE). */
  @Optional() @IsString() code?: string;
  @Optional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string | null;
  @Optional() @IsBoolean() isActive?: boolean;
}

export class RolePermissionsDto {
  @IsArray() @ArrayMaxSize(2000) @IsInt({ each: true }) permissionIds!: number[];
}

export class BranchCreateDto {
  @Matches(/^[A-Z0-9]{1,10}$/, { message: 'Mã đơn vị cơ sở gồm chữ hoa không dấu, số (tối đa 10 ký tự); A00 dành cho đơn vị tổng hợp.' }) code!: string;
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}

export class BranchUpdateDto {
  @Optional() @IsString() code?: string;
  @Optional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string | null;
  @Optional() @IsBoolean() isActive?: boolean;
}

export class AuditQuery extends PageQuery {
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsString() @MaxLength(50) entityType?: string;
  @IsOptional() @Type(() => Number) @IsInt() userId?: number;
}

// ---- Phạm vi theo phép gán (L3), ngoại lệ theo người (L5), chính sách cột (L4) – ADR 0005 ----

export const SCOPE_MODES = ['ALL', 'ORG_SUBTREE', 'LIST', 'OWN'] as const;
export const ACCESS_LEVELS = ['HIDDEN', 'MASKED', 'READONLY', 'EDITABLE'] as const;

export class ScopeRowDto {
  @Matches(/^[A-Z][A-Z0-9_]{1,19}$/) dimension!: string;
  @IsIn(SCOPE_MODES) mode!: (typeof SCOPE_MODES)[number];
  @IsOptional() @IsInt() orgUnitId?: number | null;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) value?: string | null;
}

export class AssignmentScopeDto {
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ScopeRowDto) scopes!: ScopeRowDto[];
}

export class OverrideDto {
  @IsInt() permissionId!: number;
  @IsIn(['ALLOW', 'DENY']) effect!: 'ALLOW' | 'DENY';
  @IsOptional() @IsISO8601() validFromAt?: string | null;
  @IsOptional() @IsISO8601() validToAt?: string | null;
  @IsString() @MinLength(3, { message: 'Ghi lý do (tối thiểu 3 ký tự).' }) @MaxLength(255) reason!: string;
}

export class UserFieldPolicyDto {
  @IsInt() resourceId!: number;
  @Matches(/^[A-Za-z][A-Za-z0-9_]{0,59}$/) fieldCode!: string;
  @IsIn(ACCESS_LEVELS) accessLevel!: (typeof ACCESS_LEVELS)[number];
  @IsOptional() @IsISO8601() validFromAt?: string | null;
  @IsOptional() @IsISO8601() validToAt?: string | null;
  @IsString() @MinLength(3, { message: 'Ghi lý do (tối thiểu 3 ký tự).' }) @MaxLength(255) reason!: string;
}

export class RoleFieldPolicyRowDto {
  @Matches(/^[A-Za-z][A-Za-z0-9_]{0,59}$/) fieldCode!: string;
  /** null: bỏ khai báo, cột theo mặc định (thường: Sửa được, nhạy cảm: Ẩn) */
  @IsOptional() @IsIn(ACCESS_LEVELS) accessLevel?: (typeof ACCESS_LEVELS)[number] | null;
}

export class RoleFieldPoliciesDto {
  @IsInt() resourceId!: number;
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => RoleFieldPolicyRowDto) policies!: RoleFieldPolicyRowDto[];
}

export class FieldPolicyQuery {
  @Type(() => Number) @IsInt() resourceId!: number;
}

export class EffectiveQuery {
  /** Mã ĐVCS như SysBranch.Code (mã chép từ BRAVO không nhất thiết dạng A01) */
  @Matches(/^[A-Z0-9]{1,10}$/) branchCode!: string;
}
