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
  LinePlanLineRepository,
  LinePlanRepository,
  PlanColorSizeRepository,
  PlanPoRepository,
  PoColorSizeRepository,
  SalesOrderPoRepository,
  SalesOrderRepository,
  ShipmentPlanRepository,
} from './order.repositories';
import { PoAllocationRefreshService } from './po-allocation-refresh.service';
import { PoAllocationRefreshRepository, PoAllocationRepository } from './po-allocation.repository';
import { PoAllocationService } from './po-allocation.service';
import { SalesOrderService } from './sales-order.service';
import { ScheduleFeed } from './schedule-feed.service';
import { ShipmentService } from './shipment.service';

/**
 * Module Đơn hàng: 5 màn theo mô tả giao diện của BA, database MES_Order (ADR 0006), và màn Phân bổ PO (bảng làm việc chép từ dữ
 * liệu OSM đã đồng bộ, Nhà máy SX sửa tay được). Chỉ xuất ScheduleFeed cho module khác.
 */
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
    LinePlanAllocationRepository,
    LineAllocationRepository,
    LineColorSizeRepository,
    PoAllocationRepository,
    PoAllocationRefreshRepository,
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
    PoAllocationRefreshService,
  ],
  // API công khai cho module khác (module May đọc dàn chuyền, ADR 0009)
  exports: [ScheduleFeed],
})
export class OrderModule {}
