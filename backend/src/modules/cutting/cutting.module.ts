import { Module } from '@nestjs/common';
import { OrderModule } from '../order/order.module';
import { CuttingProgressService } from './cutting-progress.service';
import { CuttingProgressController } from './cutting.controller';
import { CuttingDbLifecycle, cuttingDbProvider } from './cutting.db';
import { CuttingPlanColorSizeRepository, CuttingPlanDailyRepository, CuttingPlanRepository } from './cutting.repositories';

/**
 * Module Cắt: Đồng bộ tiến độ cắt, database MES_Cutting (quyết định 13.1). Đọc kế hoạch xuất hàng qua ShipmentPlanFeed và chặn xóa
 * kế hoạch đã có số cắt qua ShipmentPlanDeleteGuards của module Đơn hàng.
 */
@Module({
  imports: [OrderModule],
  controllers: [CuttingProgressController],
  providers: [cuttingDbProvider, CuttingDbLifecycle, CuttingPlanRepository, CuttingPlanColorSizeRepository, CuttingPlanDailyRepository, CuttingProgressService],
})
export class CuttingModule {}
