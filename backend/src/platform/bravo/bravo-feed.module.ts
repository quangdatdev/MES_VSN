import { Global, Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { BravoFeedService } from './bravo-feed.service';

/** Toàn cục để module nghiệp vụ đọc dữ liệu chép từ BRAVO qua BravoFeedService, không import lớp đồng bộ (ADR 0007). */
@Global()
@Module({
  imports: [SyncModule],
  providers: [BravoFeedService],
  exports: [BravoFeedService],
})
export class BravoFeedModule {}
