import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HrModule } from './modules/hr/hr.module';
import { OrderModule } from './modules/order/order.module';
import { SewingModule } from './modules/sewing/sewing.module';
import { CuttingModule } from './modules/cutting/cutting.module';
import { AdminModule } from './platform/admin/admin.module';
import { AuditModule } from './platform/audit/audit.module';
import { AuthModule } from './platform/auth/auth.module';
import { SourceFeedModule } from './platform/feed/source-feed.module';
import { CatalogModule } from './platform/catalog/catalog.module';
import { DataModule } from './platform/data/data.module';
import { DatabaseModule } from './platform/database/database.module';
import { ExportModule } from './platform/export/export.module';
import { MeModule } from './platform/me/me.module';
import { OrgModule } from './platform/org/org.module';
import { PermissionModule } from './platform/permission/permission.module';
import { SyncModule } from './platform/sync/sync.module';

@Module({
  imports: [DatabaseModule, PermissionModule, AuditModule, DataModule, OrgModule, ExportModule, AuthModule, MeModule, AdminModule, SyncModule, SourceFeedModule, CatalogModule, OrderModule, SewingModule, CuttingModule, HrModule],
  controllers: [HealthController],
})
export class AppModule {}
