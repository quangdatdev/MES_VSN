import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
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
} from './catalog.dto';
import { CatalogService } from './catalog.service';

const id = () => Param('id', ParseIntPipe);

/**
 * Quản trị › Danh mục hệ thống. Không có xóa: danh mục ngừng dùng bằng isActive = false. Chuyền may không còn ở đây
 * (phase 5.10): chuyền là bộ phận tích "Xưởng sản xuất" ở Nhân sự › Sơ đồ tổ chức.
 */
@Controller('admin/catalogs')
export class CatalogController {
  constructor(private readonly catalogs: CatalogService) {}

  @Get() @RequirePermission('admin.catalog:view')
  overview() { return this.catalogs.overview(); }

  // ---- Nhà máy SX, mỗi nhà máy thuộc một đơn vị cơ sở (ADR 0013) ----
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
