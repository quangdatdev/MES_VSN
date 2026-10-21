import { Global, Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { SourceFeedService } from './source-feed.service';

/** Toàn cục để module nghiệp vụ đọc dữ liệu chép từ BRAVO, OSM qua SourceFeedService, không import lớp đồng bộ (quyết định 1.2). */
@Global()
@Module({
  imports: [SyncModule],
  providers: [SourceFeedService],
  exports: [SourceFeedService],
})
export class SourceFeedModule {}
