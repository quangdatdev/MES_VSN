import { Body, Controller, Delete, Get, Param, ParseIntPipe, Put, Query } from '@nestjs/common';
import type { AuthUser } from '../../platform/auth/auth.types';
import { CurrentUser, FieldResource, RequirePermission } from '../../platform/auth/decorators';
import { CuttingProgressService } from './cutting-progress.service';
import { CuttingDayQuery, CuttingListQuery, CuttingSaveDto, CuttingValuesQuery } from './cutting.dto';

const id = () => Param('id', ParseIntPipe);

// Route tĩnh (values, export) khai báo trước route ":id" để không bị hiểu nhầm thành Id.

/** Đồng bộ tiến độ cắt (tài nguyên cutting.progress): một dòng mỗi kế hoạch xuất hàng của ĐVCS, số cắt theo ngày (quyết định 13). */
@Controller('cutting/progress')
@FieldResource('cutting.progress')
export class CuttingProgressController {
  constructor(private readonly service: CuttingProgressService) {}

  @Get() @RequirePermission('cutting.progress:view')
  list(@CurrentUser() u: AuthUser, @Query() q: CuttingListQuery) { return this.service.list(u, q); }

  // Giá trị của một cột cho popup lọc theo cột (ADR 0011)
  @Get('values') @RequirePermission('cutting.progress:view')
  values(@CurrentUser() u: AuthUser, @Query() q: CuttingValuesQuery) { return this.service.values(u, q); }

  @Get('export') @RequirePermission('cutting.progress:export')
  export(@CurrentUser() u: AuthUser, @Query() q: CuttingListQuery) { return this.service.export(u, q); }

  // Popup theo Ngày nhập liệu: Trong ngày của ngày đó, Lũy kế và +/- trên mọi ngày
  @Get(':id') @RequirePermission('cutting.progress:view')
  get(@CurrentUser() u: AuthUser, @id() pid: number, @Query() q: CuttingDayQuery) { return this.service.get(u, pid, q.date); }

  // Lưu số cắt trong ngày của các màu cỡ đã sửa (khóa dayQty theo chính sách cột "Trong ngày")
  @Put(':id') @RequirePermission('cutting.progress:update')
  save(@CurrentUser() u: AuthUser, @id() pid: number, @Body() dto: CuttingSaveDto) { return this.service.save(u, pid, dto); }

  // Xóa số cắt mọi ngày của kế hoạch, để xóa được kế hoạch xuất hàng (quyết định 13.4)
  @Delete(':id/entries') @RequirePermission('cutting.progress:delete')
  removeEntries(@CurrentUser() u: AuthUser, @id() pid: number) { return this.service.removeEntries(u, pid); }
}
