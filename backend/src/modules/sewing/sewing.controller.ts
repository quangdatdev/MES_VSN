import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import type { AuthUser } from '../../platform/auth/auth.types';
import { CurrentUser, FieldResource, RequirePermission } from '../../platform/auth/decorators';
import { PrepStepService } from './prep-step.service';
import { PrepService } from './prep.service';
import { PrepDoneBatchDto, PrepListQuery, PrepStepBatchDto, PrepStepCreateDto, PrepUpdateDto, PrepValuesQuery } from './sewing.dto';

const id = () => Param('id', ParseIntPipe);

// Route tĩnh (export) khai báo trước route ":id" để không bị hiểu nhầm thành Id.

/** Kế hoạch chuẩn bị SX (tài nguyên order.prep): mỗi dòng là một dòng dàn chuyền, lọc theo nhà máy và chuyền. */
@Controller('sewing/prep')
@FieldResource('order.prep')
export class PrepController {
  constructor(private readonly service: PrepService) {}

  @Get() @RequirePermission('order.prep:view')
  list(@CurrentUser() u: AuthUser, @Query() q: PrepListQuery) { return this.service.list(u, q); }

  // Giá trị của một cột cho popup lọc theo cột (nút mũi tên trên tiêu đề lưới), ADR 0011
  @Get('values') @RequirePermission('order.prep:view')
  values(@CurrentUser() u: AuthUser, @Query() q: PrepValuesQuery) { return this.service.values(u, q); }

  // Số liệu trên đầu màn (Tổng đơn hàng, Đủ điều kiện V/C, Nguy cơ trễ hạn, Trễ hạn), cùng bộ lọc với danh sách
  @Get('summary') @RequirePermission('order.prep:view')
  summary(@CurrentUser() u: AuthUser, @Query() q: PrepListQuery) { return this.service.summary(u, q); }

  @Get('export') @RequirePermission('order.prep:export')
  export(@CurrentUser() u: AuthUser, @Query() q: PrepListQuery) { return this.service.export(u, q); }

  // Ngày TH nhập trên bảng, nhiều dòng một lần (bấm Lưu thay đổi). Chính sách cột "Các bước" áp như sửa một dòng
  @Put() @RequirePermission('order.prep:update')
  saveDone(@CurrentUser() u: AuthUser, @Body() dto: PrepDoneBatchDto) { return this.service.saveDone(u, dto); }

  @Get(':id') @RequirePermission('order.prep:view')
  get(@CurrentUser() u: AuthUser, @id() pid: number) { return this.service.get(u, pid); }

  @Put(':id') @RequirePermission('order.prep:update')
  update(@CurrentUser() u: AuthUser, @id() pid: number, @Body() dto: PrepUpdateDto) { return this.service.update(u, pid, dto); }
}

/** Danh mục "Cấu hình chuẩn bị SX" ở Quản trị › Danh mục hệ thống: cùng quyền với các danh mục khác (admin.catalog). */
@Controller('sewing/prep-steps')
export class PrepStepController {
  constructor(private readonly service: PrepStepService) {}

  @Get() @RequirePermission('admin.catalog:view')
  list() { return this.service.list(); }

  @Post() @RequirePermission('admin.catalog:create')
  create(@CurrentUser() u: AuthUser, @Body() dto: PrepStepCreateDto) { return this.service.create(u, dto); }

  @Put() @RequirePermission('admin.catalog:update')
  saveMany(@CurrentUser() u: AuthUser, @Body() dto: PrepStepBatchDto) { return this.service.saveMany(u, dto); }
}
