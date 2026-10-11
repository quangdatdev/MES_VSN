import { Module } from '@nestjs/common';
import { ColorSizeService } from './color-size.service';
import { CutRatioService } from './cut-ratio.service';
import { LinePlanService } from './line-plan.service';
import { ColorSizeController, CutRatioController, LinePlanController, SalesOrderController, ShipmentController } from './order.controller';
import { OrderDbLifecycle, orderDbProvider } from './order.db';
import {
  LineAllocationRepository,
  LineColorSizeRepository,
  LinePlanAllocationRepository,
  LinePlanColorSizeRepository,
  LinePlanLineRepository,
  LinePlanRepository,
  PlanColorSizeRepository,
  PlanPoRepository,
  PoColorSizeRepository,
  SalesOrderPoRepository,
  SalesOrderRepository,
  ShipmentPlanRepository,
} from './order.repositories';
import { SalesOrderService } from './sales-order.service';
import { ScheduleFeed } from './schedule-feed.service';
import { ShipmentService } from './shipment.service';

/** Module Đơn hàng: 5 màn theo mô tả giao diện của BA, database MES_Order (ADR 0006). Chỉ xuất ScheduleFeed cho module khác. */
@Module({
  controllers: [SalesOrderController, ShipmentController, CutRatioController, LinePlanController, ColorSizeController],
  providers: [
    orderDbProvider,
    OrderDbLifecycle,
    SalesOrderRepository,
    SalesOrderPoRepository,
    PoColorSizeRepository,
    ShipmentPlanRepository,
    PlanColorSizeRepository,
    PlanPoRepository,
    LinePlanRepository,
    LinePlanLineRepository,
    LinePlanColorSizeRepository,
    LinePlanAllocationRepository,
    LineAllocationRepository,
    LineColorSizeRepository,
    SalesOrderService,
    CutRatioService,
    ShipmentService,
    LinePlanService,
    ColorSizeService,
    ScheduleFeed,
  ],
  // API công khai cho module khác (module May đọc dàn chuyền, ADR 0009)
  exports: [ScheduleFeed],
})
export class OrderModule {}
