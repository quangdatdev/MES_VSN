import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import type { AuthUser } from '../../platform/auth/auth.types';
import { CurrentUser, FieldResource, RequirePermission } from '../../platform/auth/decorators';
import { ColorSizeService } from './color-size.service';
import { CutRatioService } from './cut-ratio.service';
import { LinePlanService } from './line-plan.service';
import {
  AllocationDto,
  BoardQuery,
  CandidateQuery,
  ColorSizeLinesDto,
  CutRatioStyleQuery,
  CutRatioStyleValuesQuery,
  DraftQuery,
  LineSyncQuery,
  OrderListQuery,
  OrderValuesQuery,
  PoAllocationFactoryDto,
  PoAllocationQuery,
  PoAllocationValuesQuery,
  PoCreateDto,
  SalesOrderCmPriceDto,
  SalesOrderCreateDto,
  SalesOrderUpdateDto,
  ScheduleDto,
  ShipmentPlanCreateDto,
  ShipmentPlanUpdateDto,
} from './order.dto';
import { PoAllocationService } from './po-allocation.service';
import { SalesOrderService } from './sales-order.service';
import { ShipmentService } from './shipment.service';

const id = () => Param('id', ParseIntPipe);
const optionalId = (v: unknown) => (v === undefined || v === '' ? undefined : Number.isInteger(Number(v)) ? Number(v) : undefined);

// Route tĩnh (export, options...) khai báo trước route ":id" để không bị hiểu nhầm thành Id.

/** Thông tin đơn hàng (tài nguyên order.allocation). Chưa đồng bộ BRAVO: cho thêm, sửa tay. */
@Controller('order/sales-orders')
@FieldResource('order.allocation')
export class SalesOrderController {
  constructor(private readonly service: SalesOrderService) {}

  @Get() @RequirePermission('order.allocation:view')
  list(@CurrentUser() u: AuthUser, @Query() q: OrderListQuery) { return this.service.list(u, q); }

  @Get('options') @RequirePermission('order.allocation:view')
  options(@CurrentUser() u: AuthUser) { return this.service.options(u); }

  // Giá trị của một cột cho popup lọc theo cột (nút mũi tên trên tiêu đề lưới), ADR 0011
  @Get('values') @RequirePermission('order.allocation:view')
  values(@CurrentUser() u: AuthUser, @Query() q: OrderValuesQuery) { return this.service.values(u, q); }

  @Get('export') @RequirePermission('order.allocation:export')
  export(@CurrentUser() u: AuthUser, @Query() q: OrderListQuery) { return this.service.export(u, q); }

  @Get(':id') @RequirePermission('order.allocation:view')
  get(@CurrentUser() u: AuthUser, @id() oid: number) { return this.service.get(u, oid); }

  @Post() @RequirePermission('order.allocation:create')
  create(@CurrentUser() u: AuthUser, @Body() dto: SalesOrderCreateDto) { return this.service.create(u, dto); }

  @Put(':id') @RequirePermission('order.allocation:update')
  update(@CurrentUser() u: AuthUser, @id() oid: number, @Body() dto: SalesOrderUpdateDto) { return this.service.update(u, oid, dto); }

  // Sửa riêng Giá CM (quyết định 14.3): cả ĐVCS có kế hoạch xuất hàng của đơn; chính sách cột của cmPrice do FieldPolicyInterceptor kiểm
  @Put(':id/cm-price') @RequirePermission('order.allocation:update')
  updateCmPrice(@CurrentUser() u: AuthUser, @id() oid: number, @Body() dto: SalesOrderCmPriceDto) { return this.service.updateCmPrice(u, oid, dto); }

  @Delete(':id') @RequirePermission('order.allocation:delete')
  async remove(@CurrentUser() u: AuthUser, @id() oid: number) { await this.service.remove(u, oid); return { removed: true }; }
}

/**
 * Phân bổ PO (tài nguyên order.poallocation): phân bổ PO theo nhà máy SX lấy từ OSM (task 5.9.12); Nhà máy SX sửa tay được, giữ
 * qua các lần đồng bộ OSM (Phase 5.10).
 */
@Controller('order/po-allocations')
@FieldResource('order.poallocation')
export class PoAllocationController {
  constructor(private readonly service: PoAllocationService) {}

  @Get() @RequirePermission('order.poallocation:view')
  list(@CurrentUser() u: AuthUser, @Query() q: PoAllocationQuery) { return this.service.list(u, q); }

  @Get('options') @RequirePermission('order.poallocation:view')
  options(@CurrentUser() u: AuthUser) { return this.service.options(u); }

  @Get('values') @RequirePermission('order.poallocation:view')
  values(@CurrentUser() u: AuthUser, @Query() q: PoAllocationValuesQuery) { return this.service.values(u, q); }

  @Get('export') @RequirePermission('order.poallocation:export')
  export(@CurrentUser() u: AuthUser, @Query() q: PoAllocationQuery) { return this.service.export(u, q); }

  // Đổi Nhà máy SX cho mọi dòng cùng SO, PO, Style No, Màu với các dòng đã chọn; dryRun: chỉ hỏi số dòng sẽ bị áp
  @Put('factory') @RequirePermission('order.poallocation:update')
  setFactory(@CurrentUser() u: AuthUser, @Body() dto: PoAllocationFactoryDto) { return this.service.setFactory(u, dto); }
}

/** Cập nhật tỷ lệ cắt (tài nguyên order.po): mã hàng → PO → màu cỡ. */
@Controller('order/cut-ratio')
@FieldResource('order.po')
export class CutRatioController {
  constructor(private readonly service: CutRatioService) {}

  @Get('styles') @RequirePermission('order.po:view')
  styles(@CurrentUser() u: AuthUser, @Query() q: CutRatioStyleQuery) { return this.service.styles(u, q); }

  @Get('styles/values') @RequirePermission('order.po:view')
  styleValues(@CurrentUser() u: AuthUser, @Query() q: CutRatioStyleValuesQuery) { return this.service.styleValues(u, q); }

  @Get('pos') @RequirePermission('order.po:view')
  list(@CurrentUser() u: AuthUser, @Query('salesOrderId') so: string | undefined, @Query() q: OrderListQuery) { return this.service.list(u, optionalId(so), q); }

  @Get('pos/values') @RequirePermission('order.po:view')
  values(@CurrentUser() u: AuthUser, @Query('salesOrderId') so: string | undefined, @Query() q: OrderValuesQuery) { return this.service.values(u, optionalId(so), q); }

  @Get('pos/export') @RequirePermission('order.po:export')
  export(@CurrentUser() u: AuthUser, @Query('salesOrderId') so: string | undefined, @Query() q: OrderListQuery) { return this.service.export(u, optionalId(so), q); }

  @Get('pos/:id/color-sizes') @RequirePermission('order.po:view')
  colorSizes(@CurrentUser() u: AuthUser, @id() pid: number) { return this.service.colorSizeList(u, pid); }

  @Post('pos') @RequirePermission('order.po:create')
  create(@CurrentUser() u: AuthUser, @Body() dto: PoCreateDto) { return this.service.create(u, dto); }

  @Put('pos/:id/color-sizes') @RequirePermission('order.po:update')
  updateColorSizes(@CurrentUser() u: AuthUser, @id() pid: number, @Body() dto: ColorSizeLinesDto) { return this.service.updateColorSizes(u, pid, dto); }

  @Post('pos/:id/confirm') @HttpCode(200) @RequirePermission('order.po:update')
  confirm(@CurrentUser() u: AuthUser, @id() pid: number) { return this.service.setConfirmed(u, pid, true); }

  @Post('pos/:id/unconfirm') @HttpCode(200) @RequirePermission('order.po:update')
  unconfirm(@CurrentUser() u: AuthUser, @id() pid: number) { return this.service.setConfirmed(u, pid, false); }

  @Delete('pos/:id') @RequirePermission('order.po:delete')
  async remove(@CurrentUser() u: AuthUser, @id() pid: number) { await this.service.remove(u, pid); return { removed: true }; }
}

/** Kế hoạch xuất hàng (tài nguyên order.shipment). */
@Controller('order/shipment-plans')
@FieldResource('order.shipment')
export class ShipmentController {
  constructor(private readonly service: ShipmentService) {}

  @Get() @RequirePermission('order.shipment:view')
  list(@CurrentUser() u: AuthUser, @Query() q: OrderListQuery) { return this.service.list(u, q); }

  // Giá trị của một cột cho popup lọc theo cột (nút mũi tên trên tiêu đề lưới), ADR 0011
  @Get('values') @RequirePermission('order.shipment:view')
  values(@CurrentUser() u: AuthUser, @Query() q: OrderValuesQuery) { return this.service.values(u, q); }

  @Get('export') @RequirePermission('order.shipment:export')
  export(@CurrentUser() u: AuthUser, @Query() q: OrderListQuery) { return this.service.export(u, q); }

  // Popup "Chọn mã hàng" dùng khi tạo hoặc sửa kế hoạch
  @Get('candidates') @RequirePermission('order.shipment:view')
  candidates(@CurrentUser() u: AuthUser, @Query() q: CandidateQuery) { return this.service.candidates(u, q); }

  // Dữ liệu PO: áp chính sách cột của Cập nhật tỷ lệ cắt thay cho của kế hoạch. Interceptor áp theo tên khóa, mà hai tài
  // nguyên cùng có statusCode, shipDate, syncedAt: để @FieldResource của controller thì cột PO theo cả cột cùng tên của kế hoạch
  @Get('candidates/:id/pos') @RequirePermission('order.shipment:view') @FieldResource('order.po')
  candidatePos(@CurrentUser() u: AuthUser, @id() soId: number) { return this.service.candidatePos(u, soId); }

  @Get('draft') @RequirePermission('order.shipment:view')
  draft(@CurrentUser() u: AuthUser, @Query() q: DraftQuery) {
    const ids = (v?: string) => (v ? v.split(',').map(Number) : undefined);
    return this.service.draftFor(u, { salesOrderId: q.salesOrderId, poIds: ids(q.poIds), excludePlanId: q.excludePlanId, addPoIds: ids(q.addPoIds) });
  }

  @Get(':id') @RequirePermission('order.shipment:view')
  get(@CurrentUser() u: AuthUser, @id() pid: number) { return this.service.get(u, pid); }

  // Nút "Chọn mã hàng" của popup Sửa (phase 5.17): PO chưa lập kế hoạch của đơn, để thêm vào kế hoạch; chính sách cột của PO như trên
  @Get(':id/candidate-pos') @RequirePermission('order.shipment:update', 'order.po:view') @FieldResource('order.po')
  planCandidatePos(@CurrentUser() u: AuthUser, @id() pid: number) { return this.service.planCandidatePos(u, pid); }

  // Lưới "PO của kế hoạch" (task 5.9.14): cần cả quyền xem PO ở Cập nhật tỷ lệ cắt; chính sách cột của PO như candidates/:id/pos
  @Get(':id/pos') @RequirePermission('order.shipment:view', 'order.po:view') @FieldResource('order.po')
  pos(@CurrentUser() u: AuthUser, @id() pid: number) { return this.service.posOfPlan(u, pid); }

  @Post() @RequirePermission('order.shipment:create')
  create(@CurrentUser() u: AuthUser, @Body() dto: ShipmentPlanCreateDto) { return this.service.create(u, dto); }

  @Put(':id') @RequirePermission('order.shipment:update')
  update(@CurrentUser() u: AuthUser, @id() pid: number, @Body() dto: ShipmentPlanUpdateDto) { return this.service.update(u, pid, dto); }

  @Delete(':id') @RequirePermission('order.shipment:delete')
  async remove(@CurrentUser() u: AuthUser, @id() pid: number) { await this.service.remove(u, pid); return { removed: true }; }
}

/** Xếp chuyền (tài nguyên order.lineplan): danh sách kế hoạch, chi tiết dàn chuyền, bảng dàn chuyền. */
@Controller('order/line-plans')
@FieldResource('order.lineplan')
export class LinePlanController {
  constructor(private readonly service: LinePlanService) {}

  @Get() @RequirePermission('order.lineplan:view')
  list(@CurrentUser() u: AuthUser, @Query() q: OrderListQuery) { return this.service.list(u, q); }

  // Giá trị của một cột cho popup lọc theo cột (nút mũi tên trên tiêu đề lưới), ADR 0011
  @Get('values') @RequirePermission('order.lineplan:view')
  values(@CurrentUser() u: AuthUser, @Query() q: OrderValuesQuery) { return this.service.values(u, q); }

  @Get('export') @RequirePermission('order.lineplan:export')
  export(@CurrentUser() u: AuthUser, @Query() q: OrderListQuery) { return this.service.export(u, q); }

  @Get('board') @RequirePermission('order.lineplan:view')
  board(@CurrentUser() u: AuthUser, @Query() q: BoardQuery) { return this.service.board(u, q); }

  @Get(':id') @RequirePermission('order.lineplan:view')
  get(@CurrentUser() u: AuthUser, @id() pid: number) { return this.service.get(u, pid); }

  @Put(':id/lines') @RequirePermission('order.lineplan:update')
  saveLines(@CurrentUser() u: AuthUser, @id() pid: number, @Body() dto: ScheduleDto) { return this.service.saveLines(u, pid, dto); }
}

/**
 * Phân bổ màu cỡ (tài nguyên order.colorsize, bảng nguồn ShipmentPlanLine): mỗi dòng là một kế hoạch đã xếp chuyền, `:id` là Id
 * kế hoạch; popup chia màu cỡ của kế hoạch cho các chuyền đã xếp (phase 5.13).
 */
@Controller('order/color-size')
@FieldResource('order.colorsize')
export class ColorSizeController {
  constructor(private readonly service: ColorSizeService) {}

  @Get() @RequirePermission('order.colorsize:view')
  list(@CurrentUser() u: AuthUser, @Query() q: OrderListQuery) { return this.service.list(u, q); }

  // Giá trị của một cột cho popup lọc theo cột (nút mũi tên trên tiêu đề lưới), ADR 0011
  @Get('values') @RequirePermission('order.colorsize:view')
  values(@CurrentUser() u: AuthUser, @Query() q: OrderValuesQuery) { return this.service.values(u, q); }

  @Get('export') @RequirePermission('order.colorsize:export')
  export(@CurrentUser() u: AuthUser, @Query() q: OrderListQuery) { return this.service.export(u, q); }

  // Hệ thống khác lấy dòng dàn chuyền Đã phân màu cỡ đổi trong khoảng ngày: dữ liệu ra khỏi MES nên cần quyền xuất như xuất file
  @Get('sync') @RequirePermission('order.colorsize:export')
  sync(@CurrentUser() u: AuthUser, @Query() q: LineSyncQuery) { return this.service.sync(u, q); }

  @Get('sync/ids') @RequirePermission('order.colorsize:export')
  syncIds(@CurrentUser() u: AuthUser) { return this.service.syncIds(u); }

  @Get(':id') @RequirePermission('order.colorsize:view')
  get(@CurrentUser() u: AuthUser, @id() pid: number) { return this.service.get(u, pid); }

  @Put(':id') @RequirePermission('order.colorsize:update')
  save(@CurrentUser() u: AuthUser, @id() pid: number, @Body() dto: AllocationDto) { return this.service.save(u, pid, dto); }
}
