import { Global, Module } from '@nestjs/common';
import { EmployeeDirectoryService } from './employee-directory.service';
import { OrgService } from './org.service';
import { UserDirectoryService } from './user-directory.service';

@Global()
@Module({ providers: [OrgService, UserDirectoryService, EmployeeDirectoryService], exports: [OrgService, UserDirectoryService, EmployeeDirectoryService] })
export class OrgModule {}
