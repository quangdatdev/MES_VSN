import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, RequirePermission } from '../auth/decorators';
import {
  CatalogItemCreateDto,
  CatalogItemsQuery,
  CatalogItemUpdateDto,
  ExternalRowsQuery,
  FactoryCreateDto,
  FactoryUpdateDto,
  ShiftCreateDto,
  ShiftUpdateDto,
  WorkCalendarDaysDto,
  WorkCalendarRangeQuery,
  WorkCalendarUpdateDto,
  WorkCalendarYearQuery,
} from './catalog.dto';
import { CatalogService } from './catalog.service';

const id = () => Param('id', ParseIntPipe);

/**
 * Quản trị › Danh mục hệ thống. Không có xóa (trừ ngày đặc biệt của lịch làm việc): danh mục ngừng dùng bằng isActive = false. Chuyền may không còn ở đây
 * (phase 5.10): chuyền là bộ phận tích "Xưởng sản xuất" ở Nhân sự › Sơ đồ tổ chức.
 */
@Controller('admin/catalogs')
export class CatalogController {
  constructor(private readonly catalogs: CatalogService) {}

  @Get() @RequirePermission('admin.catalog:view')
  overview() { return this.catalogs.overview(); }

  // ---- Nhà máy SX, mỗi nhà máy thuộc một đơn vị cơ sở (quyết định 6.2) ----
  @Get('factories') @RequirePermission('admin.catalog:view')
  factories(@Query() q: CatalogItemsQuery) { return this.catalogs.factories(q.q); }

  @Post('factories') @RequirePermission('admin.catalog:create')
  createFactory(@CurrentUser() a: AuthUser, @Body() dto: FactoryCreateDto) { return this.catalogs.createFactory(a, dto); }

  @Put('factories/:id') @RequirePermission('admin.catalog:update')
  async updateFactory(@CurrentUser() a: AuthUser, @id() fid: number, @Body() dto: FactoryUpdateDto) { await this.catalogs.updateFactory(a, fid, dto); return { ok: true }; }

  // ---- Ca làm việc ----
  @Get('shifts') @RequirePermission('admin.catalog:view')
  shifts() { return this.catalogs.shifts(); }

  @Post('shifts') @RequirePermission('admin.catalog:create')
  createShift(@CurrentUser() a: AuthUser, @Body() dto: ShiftCreateDto) { return this.catalogs.createShift(a, dto); }

  @Put('shifts/:id') @RequirePermission('admin.catalog:update')
  async updateShift(@CurrentUser() a: AuthUser, @id() sid: number, @Body() dto: ShiftUpdateDto) { await this.catalogs.updateShift(a, sid, dto); return { ok: true }; }

  // ---- Lịch làm việc theo đơn vị cơ sở (phase 5.12). Xóa ngày đặc biệt là sửa lịch nên dùng quyền sửa ----
  @Get('work-calendars') @RequirePermission('admin.catalog:view')
  workCalendars() { return this.catalogs.workCalendars(); }

  @Put('work-calendars/:branchCode') @RequirePermission('admin.catalog:update')
  async updateWorkCalendar(@CurrentUser() a: AuthUser, @Param('branchCode') code: string, @Body() dto: WorkCalendarUpdateDto) {
    await this.catalogs.updateWorkCalendar(a, code, dto);
    return { ok: true };
  }

  @Get('work-calendars/:branchCode/days') @RequirePermission('admin.catalog:view')
  workCalendarDays(@Param('branchCode') code: string, @Query() q: WorkCalendarYearQuery) { return this.catalogs.workCalendarDays(code, q.year); }

  @Post('work-calendars/days') @RequirePermission('admin.catalog:update')
  setWorkCalendarDays(@CurrentUser() a: AuthUser, @Body() dto: WorkCalendarDaysDto) { return this.catalogs.setWorkCalendarDays(a, dto); }

  @Delete('work-calendars/:branchCode/days') @RequirePermission('admin.catalog:update')
  deleteWorkCalendarDays(@CurrentUser() a: AuthUser, @Param('branchCode') code: string, @Query() q: WorkCalendarRangeQuery) {
    return this.catalogs.deleteWorkCalendarDays(a, code, q.from, q.to);
  }

  // ---- Danh mục chép từ BRAVO: chỉ xem ----
  @Get('external/:code/rows') @RequirePermission('admin.catalog:view')
  externalRows(@Param('code') code: string, @Query() q: ExternalRowsQuery) { return this.catalogs.externalRows(code, q.page, q.pageSize, q.q); }

  // ---- Danh mục đơn giản (Đơn vị tính, Loại đơn hàng…) ----
  @Get('items/:code') @RequirePermission('admin.catalog:view')
  items(@Param('code') code: string, @Query() q: CatalogItemsQuery) { return this.catalogs.items(code, q.q); }

  @Post('items/:code') @RequirePermission('admin.catalog:create')
  createItem(@CurrentUser() a: AuthUser, @Param('code') code: string, @Body() dto: CatalogItemCreateDto) { return this.catalogs.createItem(a, code, dto); }

  @Put('items/:code/:id') @RequirePermission('admin.catalog:update')
  async updateItem(@CurrentUser() a: AuthUser, @Param('code') code: string, @id() iid: number, @Body() dto: CatalogItemUpdateDto) {
    await this.catalogs.updateItem(a, code, iid, dto);
    return { ok: true };
  }
}
