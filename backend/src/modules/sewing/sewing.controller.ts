import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import type { AuthUser } from '../../platform/auth/auth.types';
import { CurrentUser, FieldResource, RequirePermission } from '../../platform/auth/decorators';
import { ClusterDetailQuery, ClusterEmployeeQuery, ClusterLeaderSaveDto, ClusterTeamQuery } from './cluster-leader.dto';
import { ClusterLeaderService } from './cluster-leader.service';
import { PrepStepService } from './prep-step.service';
import { PrepService } from './prep.service';
import { SewingPlanLockDto, SewingPlanOptionsQuery, SewingPlanQuery, SewingPlanSaveDto } from './sewing-plan.dto';
import { SewingPlanService } from './sewing-plan.service';
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

  // Giá trị của một cột cho popup lọc theo cột (nút mũi tên trên tiêu đề lưới), quyết định 11.3
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

/**
 * Kế hoạch may (tài nguyên sewing.plan, phase 5.16): kế hoạch theo ngày cho từng dòng dàn chuyền. Cập nhật, Chốt, Hủy chốt dùng quyền
 * Sửa; lần đầu lập kế hoạch cho chuyền trong ngày cần thêm quyền Thêm (service kiểm).
 */
@Controller('sewing/plan')
@FieldResource('sewing.plan')
export class SewingPlanController {
  constructor(private readonly service: SewingPlanService) {}

  @Get() @RequirePermission('sewing.plan:view')
  get(@CurrentUser() u: AuthUser, @Query() q: SewingPlanQuery) { return this.service.get(u, q); }

  // Dòng dàn chuyền của các chuyền thuộc đơn vị, cho Thêm dòng (chuyền → mã hàng → PO/Buy date)
  @Get('options') @RequirePermission('sewing.plan:view')
  options(@CurrentUser() u: AuthUser, @Query() q: SewingPlanOptionsQuery) { return this.service.options(u, q); }

  @Put() @RequirePermission('sewing.plan:update')
  save(@CurrentUser() u: AuthUser, @Body() dto: SewingPlanSaveDto) { return this.service.save(u, dto); }

  @Post('lock') @HttpCode(200) @RequirePermission('sewing.plan:update')
  lock(@CurrentUser() u: AuthUser, @Body() dto: SewingPlanLockDto) { return this.service.lock(u, dto); }

  @Post('unlock') @HttpCode(200) @RequirePermission('sewing.plan:update')
  unlock(@CurrentUser() u: AuthUser, @Body() dto: SewingPlanLockDto) { return this.service.unlock(u, dto); }
}

/**
 * Phân cụm trưởng (tài nguyên sewing.cluster, phase 5.18): tổ trưởng chọn cụm trưởng cho từng cụm của mã hàng ở tổ mình. Sửa là lưu cụm
 * trưởng; điều kiện người lưu là tổ trưởng của tổ do service kiểm.
 */
@Controller('sewing/cluster')
@FieldResource('sewing.cluster')
export class ClusterLeaderController {
  constructor(private readonly service: ClusterLeaderService) {}

  // Ô Chọn tổ
  @Get('teams') @RequirePermission('sewing.cluster:view')
  teams(@CurrentUser() u: AuthUser) { return this.service.teamList(u); }

  // Ô Chọn mã hàng: mã hàng đã phân cụm cho tổ
  @Get('styles') @RequirePermission('sewing.cluster:view')
  styles(@CurrentUser() u: AuthUser, @Query() q: ClusterTeamQuery) { return this.service.styles(u, q); }

  // Ô Tên cụm trưởng: chỉ cần khi sửa
  @Get('employees') @RequirePermission('sewing.cluster:update')
  employees(@CurrentUser() u: AuthUser, @Query() q: ClusterEmployeeQuery) { return this.service.employees(u, q); }

  @Get() @RequirePermission('sewing.cluster:view')
  detail(@CurrentUser() u: AuthUser, @Query() q: ClusterDetailQuery) { return this.service.detail(u, q); }

  @Put() @RequirePermission('sewing.cluster:update')
  save(@CurrentUser() u: AuthUser, @Body() dto: ClusterLeaderSaveDto) { return this.service.save(u, dto); }
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
