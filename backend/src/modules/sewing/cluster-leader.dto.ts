import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';

/** Số cụm tối đa mỗi lần Lưu (một mã hàng của một tổ có vài chục cụm) */
export const MAX_CLUSTER_ITEMS = 200;

const apply = (decorators: PropertyDecorator[]): PropertyDecorator => (target, key) => decorators.forEach((d) => d(target, key));
/** Bắt buộc có mặt: Id nhân viên (số nguyên dương) hoặc null (không có cụm trưởng) */
const EmployeeRef = () => apply([ValidateIf((_o, v) => v !== null), Type(() => Number), IsInt({ message: 'Nhân viên không hợp lệ.' }), Min(1)]);

export class ClusterTeamQuery {
  @Type(() => Number) @IsInt() @Min(1) teamId!: number;
}

/** Cụm của một mã hàng ở tổ */
export class ClusterDetailQuery extends ClusterTeamQuery {
  @IsString() @MinLength(1) @MaxLength(120) style!: string;
}

/** Tìm nhân viên cho ô Tên cụm trưởng: trống là danh sách đầu (người của ĐVCS của tổ trước) */
export class ClusterEmployeeQuery extends ClusterTeamQuery {
  @IsOptional() @IsString() @MaxLength(60) q?: string;
}

/**
 * Cụm trưởng của một cụm. Khóa `leaderEmployeeId` trùng mã cột đăng ký nên chính sách cột của sewing.cluster áp khi ghi (cột không ở mức
 * Sửa được thì 403 FIELD_READONLY). `previous`: cụm trưởng lúc mở màn; người khác vừa đổi cụm này sang người khác thì 409.
 */
export class ClusterLeaderItemDto {
  @Type(() => Number) @IsInt() @Min(1) id!: number;
  @EmployeeRef() leaderEmployeeId!: number | null;
  @EmployeeRef() previous!: number | null;
}

export class ClusterLeaderSaveDto {
  @Type(() => Number) @IsInt() @Min(1) teamId!: number;
  @IsString() @MinLength(1) @MaxLength(120) style!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MAX_CLUSTER_ITEMS) @ValidateNested({ each: true }) @Type(() => ClusterLeaderItemDto) items!: ClusterLeaderItemDto[];
}
