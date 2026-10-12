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
  OrderListQuery,
  OrderValuesQuery,
  PoCreateDto,
  SalesOrderCreateDto,
  SalesOrderUpdateDto,
  ScheduleDto,
  ShipmentPlanCreateDto,
  ShipmentPlanUpdateDto,
} from './order.dto';
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

  @Delete(':id') @HttpCode(204) @RequirePermission('order.allocation:delete')
  async remove(@CurrentUser() u: AuthUser, @id() oid: number) { await this.service.remove(u, oid); }
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

  @Delete('pos/:id') @HttpCode(204) @RequirePermission('order.po:delete')
  async remove(@CurrentUser() u: AuthUser, @id() pid: number) { await this.service.remove(u, pid); }
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

  @Get('candidates/:id/pos') @RequirePermission('order.shipment:view')
  candidatePos(@CurrentUser() u: AuthUser, @id() soId: number) { return this.service.candidatePos(u, soId); }

  @Get('draft') @RequirePermission('order.shipment:view')
  draft(@CurrentUser() u: AuthUser, @Query() q: DraftQuery) { return this.service.draftFor(u, q.salesOrderId, q.poIds.split(',').map(Number), q.excludePlanId); }

  @Get(':id') @RequirePermission('order.shipment:view')
  get(@CurrentUser() u: AuthUser, @id() pid: number) { return this.service.get(u, pid); }

  @Post() @RequirePermission('order.shipment:create')
  create(@CurrentUser() u: AuthUser, @Body() dto: ShipmentPlanCreateDto) { return this.service.create(u, dto); }

  @Put(':id') @RequirePermission('order.shipment:update')
  update(@CurrentUser() u: AuthUser, @id() pid: number, @Body() dto: ShipmentPlanUpdateDto) { return this.service.update(u, pid, dto); }

  @Delete(':id') @HttpCode(204) @RequirePermission('order.shipment:delete')
  async remove(@CurrentUser() u: AuthUser, @id() pid: number) { await this.service.remove(u, pid); }
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

/** Phân bổ màu cỡ (tài nguyên order.colorsize): mỗi dòng là một chuyền của một kế hoạch, lọc được theo chuyền. */
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

  @Get(':id') @RequirePermission('order.colorsize:view')
  get(@CurrentUser() u: AuthUser, @id() lid: number) { return this.service.get(u, lid); }

  @Put(':id') @RequirePermission('order.colorsize:update')
  save(@CurrentUser() u: AuthUser, @id() lid: number, @Body() dto: AllocationDto) { return this.service.save(u, lid, dto); }
}
