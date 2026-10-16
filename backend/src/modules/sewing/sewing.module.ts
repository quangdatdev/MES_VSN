import { Module } from '@nestjs/common';
import { OrderModule } from '../order/order.module';
import { PrepStepService } from './prep-step.service';
import { PrepService } from './prep.service';
import { SewingDayPlanItemRepository, SewingDayPlanRepository } from './sewing-plan.repositories';
import { SewingPlanService } from './sewing-plan.service';
import { PrepController, PrepStepController, SewingPlanController } from './sewing.controller';
import { SewingDbLifecycle, sewingDbProvider } from './sewing.db';
import { PrepStepRepository, SewingPrepRepository, SewingPrepStepRepository } from './sewing.repositories';

/**
 * Module May: Kế hoạch chuẩn bị SX (ADR 0009), Kế hoạch may (phase 5.16), database MES_Sewing. Đọc dàn chuyền qua ScheduleFeed của module
 * Đơn hàng; chặn Xếp chuyền bỏ, giảm dòng đã có Kế hoạch may qua LineDayPlanGuards (quyết định 14.2).
 */
@Module({
  imports: [OrderModule],
  controllers: [PrepController, PrepStepController, SewingPlanController],
  providers: [sewingDbProvider, SewingDbLifecycle, SewingPrepRepository, SewingPrepStepRepository, PrepStepRepository, PrepService, PrepStepService, SewingDayPlanRepository, SewingDayPlanItemRepository, SewingPlanService],
})
export class SewingModule {}
