import { Module } from '@nestjs/common';
import { BravoOrderImportRepository } from './bravo-order-import.repository';
import { BravoOrderImportService } from './bravo-order-import.service';
import { OsmFactoryService } from './osm-factory.service';
import { ColorSizeService } from './color-size.service';
import { CutRatioService } from './cut-ratio.service';
import { LinePlanService } from './line-plan.service';
import { ColorSizeController, CutRatioController, LinePlanController, PoAllocationController, SalesOrderController, ShipmentController } from './order.controller';
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
import { PoAllocationService } from './po-allocation.service';
import { SalesOrderService } from './sales-order.service';
import { ScheduleFeed } from './schedule-feed.service';
import { ShipmentService } from './shipment.service';

/** Module Đơn hàng: 5 màn theo mô tả giao diện của BA, database MES_Order (ADR 0006), và màn Phân bổ PO đọc dữ liệu OSM đã chép. Chỉ xuất ScheduleFeed cho module khác. */
@Module({
  controllers: [SalesOrderController, PoAllocationController, ShipmentController, CutRatioController, LinePlanController, ColorSizeController],
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
    PoAllocationService,
    CutRatioService,
    ShipmentService,
    LinePlanService,
    ColorSizeService,
    ScheduleFeed,
    BravoOrderImportRepository,
    BravoOrderImportService,
    OsmFactoryService,
  ],
  // API công khai cho module khác (module May đọc dàn chuyền, ADR 0009)
  exports: [ScheduleFeed],
})
export class OrderModule {}
