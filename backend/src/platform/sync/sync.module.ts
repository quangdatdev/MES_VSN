import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncDbLifecycle, syncDbProvider } from './sync.db';
import { SyncRepository } from './sync.repository';
import { SyncService } from './sync.service';

/** Đồng bộ dữ liệu từ hệ thống ngoài qua database trung gian vào MES_Sync (ADR 0007, Phase 5.2). */
@Module({
  controllers: [SyncController],
  providers: [syncDbProvider, SyncDbLifecycle, SyncRepository, SyncService],
  // Màn Danh mục hệ thống xem danh mục chép từ BRAVO qua SyncService (chỉ đọc)
  exports: [SyncService],
})
export class SyncModule {}
