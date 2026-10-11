import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class SyncStartDto {
  /** Bỏ trống: mọi nguồn đang bật */
  @IsOptional() @IsArray() @ArrayMaxSize(100) @Type(() => Number) @IsInt({ each: true }) @Min(1, { each: true }) sourceIds?: number[];
  /** true: chép lại toàn bộ (bỏ qua mốc), phát hiện được dòng đã bị xóa bên nguồn */
  @IsOptional() @IsBoolean() full?: boolean;
}

export class SyncRunsQuery {
  @Type(() => Number) @IsInt() @Min(1) sourceId!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 100;
}
