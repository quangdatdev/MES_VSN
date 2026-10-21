import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { AdminAccessService } from './admin-access.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminBranchesService } from './admin-branches.service';
import { AdminGrantsService } from './admin-grants.service';
import { AdminUsersService } from './admin-users.service';
import { AdminController } from './admin.controller';

@Module({
  // Đơn vị cơ sở chép từ danh mục chi nhánh BRAVO trong MES_Sync (quyết định 6.1)
  imports: [SyncModule],
  controllers: [AdminController],
  providers: [AdminUsersService, AdminAccessService, AdminBranchesService, AdminAuditService, AdminGrantsService],
})
export class AdminModule {}
