import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import type { AuthUser } from '../../platform/auth/auth.types';
import { CurrentUser, FieldResource, RequirePermission } from '../../platform/auth/decorators';
import { CuttingProgressService } from './cutting-progress.service';
import { SupplyColorSizesQuery, SupplyListQuery, SupplySaveDto, SupplySheetDto, SupplyStylesQuery, SupplyValuesQuery } from './cutting-supply.dto';
import { CuttingSupplyService } from './cutting-supply.service';
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

/**
 * Xác nhận cấp BTP (tài nguyên cutting.supply, quyết định 13.8): lệnh cấp theo ĐVCS, Ngày cấp, Mã hàng; số cấp theo ngày, chuyền, màu,
 * cỡ. Lưu số cấp, Xác nhận cấp, Hủy duyệt là quyền Sửa; tạo lệnh mới khi lưu cần thêm quyền Thêm.
 */
@Controller('cutting/supply')
@FieldResource('cutting.supply')
export class CuttingSupplyController {
  constructor(private readonly service: CuttingSupplyService) {}

  @Get() @RequirePermission('cutting.supply:view')
  list(@CurrentUser() u: AuthUser, @Query() q: SupplyListQuery) { return this.service.list(u, q); }

  @Get('values') @RequirePermission('cutting.supply:view')
  values(@CurrentUser() u: AuthUser, @Query() q: SupplyValuesQuery) { return this.service.values(u, q); }

  @Get('export') @RequirePermission('cutting.supply:export')
  export(@CurrentUser() u: AuthUser, @Query() q: SupplyListQuery) { return this.service.export(u, q); }

  // Ô chọn của form: mã hàng theo chuyền, màu cỡ theo chuyền + mã hàng (Phân bổ màu cỡ)
  @Get('options/styles') @RequirePermission('cutting.supply:view')
  styles(@CurrentUser() u: AuthUser, @Query() q: SupplyStylesQuery) { return this.service.styles(u, q.line); }

  @Get('options/color-sizes') @RequirePermission('cutting.supply:view')
  colorSizes(@CurrentUser() u: AuthUser, @Query() q: SupplyColorSizesQuery) { return this.service.colorSizes(u, q.line, q.style); }

  // Tính lưới nhập theo Ngày cấp (không ghi gì); POST vì danh sách dòng dài
  @Post('sheet') @HttpCode(200) @RequirePermission('cutting.supply:view')
  sheet(@CurrentUser() u: AuthUser, @Body() dto: SupplySheetDto) { return this.service.sheet(u, dto); }

  // Lưu số cấp của Ngày cấp (khóa dayQty theo chính sách cột "Số lượng cấp trong ngày")
  @Put() @RequirePermission('cutting.supply:update')
  save(@CurrentUser() u: AuthUser, @Body() dto: SupplySaveDto) { return this.service.save(u, dto); }

  @Get(':id') @RequirePermission('cutting.supply:view')
  get(@CurrentUser() u: AuthUser, @id() sid: number) { return this.service.get(u, sid); }

  @Post(':id/confirm') @HttpCode(200) @RequirePermission('cutting.supply:update')
  confirm(@CurrentUser() u: AuthUser, @id() sid: number) { return this.service.confirm(u, sid); }

  @Post(':id/unconfirm') @HttpCode(200) @RequirePermission('cutting.supply:update')
  unconfirm(@CurrentUser() u: AuthUser, @id() sid: number) { return this.service.unconfirm(u, sid); }

  @Delete(':id') @RequirePermission('cutting.supply:delete')
  remove(@CurrentUser() u: AuthUser, @id() sid: number) { return this.service.remove(u, sid); }
}
