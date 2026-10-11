import { Module } from '@nestjs/common';
import { OrderModule } from '../order/order.module';
import { PrepStepService } from './prep-step.service';
import { PrepService } from './prep.service';
import { PrepController, PrepStepController } from './sewing.controller';
import { SewingDbLifecycle, sewingDbProvider } from './sewing.db';
import { PrepStepRepository, SewingPrepRepository, SewingPrepStepRepository } from './sewing.repositories';

/** Module May: Kế hoạch chuẩn bị SX, database MES_Sewing (ADR 0009). Đọc dàn chuyền qua ScheduleFeed của module Đơn hàng. */
@Module({
  imports: [OrderModule],
  controllers: [PrepController, PrepStepController],
  providers: [sewingDbProvider, SewingDbLifecycle, SewingPrepRepository, SewingPrepStepRepository, PrepStepRepository, PrepService, PrepStepService],
})
export class SewingModule {}
