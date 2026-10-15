import { Module } from '@nestjs/common';
import { OrderModule } from '../order/order.module';
import { CuttingProgressService } from './cutting-progress.service';
import { CuttingSupplyLineRepository, CuttingSupplyRepository } from './cutting-supply.repositories';
import { CuttingSupplyService } from './cutting-supply.service';
import { CuttingProgressController, CuttingSupplyController } from './cutting.controller';
import { CuttingDbLifecycle, cuttingDbProvider } from './cutting.db';
import { CuttingPlanColorSizeRepository, CuttingPlanDailyRepository, CuttingPlanRepository } from './cutting.repositories';

/**
 * Module Cắt: Đồng bộ tiến độ cắt, Xác nhận cấp BTP, database MES_Cutting (quyết định 13.1, 13.8). Đọc kế hoạch xuất hàng qua
 * ShipmentPlanFeed, chặn xóa kế hoạch đã có số cắt qua ShipmentPlanDeleteGuards; đọc phân bổ màu cỡ theo chuyền qua LineColorSizeFeed,
 * chặn giảm phần giao dưới số BTP đã cấp qua LineSupplyGuards của module Đơn hàng.
 */
@Module({
  imports: [OrderModule],
  controllers: [CuttingProgressController, CuttingSupplyController],
  providers: [
    cuttingDbProvider,
    CuttingDbLifecycle,
    CuttingPlanRepository,
    CuttingPlanColorSizeRepository,
    CuttingPlanDailyRepository,
    CuttingProgressService,
    CuttingSupplyRepository,
    CuttingSupplyLineRepository,
    CuttingSupplyService,
  ],
})
export class CuttingModule {}
