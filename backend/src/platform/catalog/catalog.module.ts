import { Global, Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { CatalogLookupService } from './catalog-lookup.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

/**
 * Danh mục hệ thống (Phase 5.4). Toàn cục để module nghiệp vụ lấy danh mục (đơn vị tính, loại đơn hàng) qua
 * CatalogLookupService (chỉ đọc); các hàm ghi của màn quản trị (CatalogService) không xuất ra ngoài.
 */
@Global()
@Module({
  imports: [SyncModule],
  controllers: [CatalogController],
  providers: [CatalogService, CatalogLookupService],
  exports: [CatalogLookupService],
})
export class CatalogModule {}
