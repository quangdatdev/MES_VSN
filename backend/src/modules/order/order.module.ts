import { Module } from '@nestjs/common';
import { BravoOrderImportRepository } from './bravo-order-import.repository';
import { BravoOrderImportService } from './bravo-order-import.service';
import { OsmFactoryService } from './osm-factory.service';
import { ColorSizeService } from './color-size.service';
import { CutRatioService } from './cut-ratio.service';
import { LineColorSizeFeed } from './line-color-size-feed.service';
import { LinePlanService } from './line-plan.service';
import { LineDayPlanGuards } from './line-day-plan-guard';
import { LineSupplyGuards } from './line-supply-guard';
import { ColorSizeController, CutRatioController, LinePlanController, PoAllocationController, SalesOrderController, ShipmentController } from './order.controller';
import { OrderDbLifecycle, orderDbProvider } from './order.db';
import {
  LineAllocationRepository,
  LineColorSizeFeedRepository,
  LineColorSizeRepository,
  LinePlanAllocationRepository,
  LinePlanLineRepository,
  LinePlanRepository,
  PlanColorSizeRepository,
  PlanPoRepository,
  PoColorSizeRepository,
  SalesOrderPoRepository,
  SalesOrderPriceRepository,
  SalesOrderRepository,
  ShipmentPlanFeedRepository,
  ShipmentPlanPriceRepository,
  ShipmentPlanRepository,
} from './order.repositories';
import { PoAllocationRefreshService } from './po-allocation-refresh.service';
import { PoAllocationRefreshRepository, PoAllocationRepository } from './po-allocation.repository';
import { PoAllocationService } from './po-allocation.service';
import { SalesOrderService } from './sales-order.service';
import { ScheduleFeed } from './schedule-feed.service';
import { ShipmentPlanDeleteGuards } from './shipment-plan-delete-guard';
import { ShipmentPlanFeed } from './shipment-plan-feed.service';
import { ShipmentService } from './shipment.service';

/**
 * Module Đơn hàng: 5 màn theo mô tả giao diện của BA, database MES_Order (ADR 0006), và màn Phân bổ PO (bảng làm việc chép từ dữ
 * liệu OSM đã đồng bộ, Nhà máy SX sửa tay được). Chỉ xuất API công khai cho module khác: ScheduleFeed (module May), ShipmentPlanFeed,
 * ShipmentPlanDeleteGuards, LineColorSizeFeed và LineSupplyGuards (module Cắt); LineDayPlanGuards (module May, Kế hoạch may).
 */
@Module({
  controllers: [SalesOrderController, PoAllocationController, ShipmentController, CutRatioController, LinePlanController, ColorSizeController],
  providers: [
    orderDbProvider,
    OrderDbLifecycle,
    SalesOrderRepository,
    SalesOrderPriceRepository,
    ShipmentPlanPriceRepository,
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
    ShipmentPlanFeedRepository,
    ShipmentPlanFeed,
    ShipmentPlanDeleteGuards,
    LineColorSizeFeedRepository,
    LineColorSizeFeed,
    LineSupplyGuards,
    LineDayPlanGuards,
    BravoOrderImportRepository,
    BravoOrderImportService,
    OsmFactoryService,
    PoAllocationRefreshService,
  ],
  // API công khai cho module khác: module May đọc dàn chuyền (ADR 0009); module Cắt đọc kế hoạch, chặn xóa kế hoạch (quyết định 13.2, 13.4),
  // đọc phân bổ màu cỡ theo chuyền và chặn giảm phần giao dưới số BTP đã cấp (quyết định 13.8); module May chặn Xếp chuyền giảm, bỏ dòng
  // dàn chuyền đã có Kế hoạch may (quyết định 14.2)
  exports: [ScheduleFeed, ShipmentPlanFeed, ShipmentPlanDeleteGuards, LineColorSizeFeed, LineSupplyGuards, LineDayPlanGuards],
})
export class OrderModule {}
