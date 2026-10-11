import { Module } from '@nestjs/common';
import { AdminAccessService } from './admin-access.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminBranchesService } from './admin-branches.service';
import { AdminGrantsService } from './admin-grants.service';
import { AdminUsersService } from './admin-users.service';
import { AdminController } from './admin.controller';

@Module({
  controllers: [AdminController],
  providers: [AdminUsersService, AdminAccessService, AdminBranchesService, AdminAuditService, AdminGrantsService],
})
export class AdminModule {}
