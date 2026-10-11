import { Global, Module } from '@nestjs/common';
import { OrgService } from './org.service';
import { UserDirectoryService } from './user-directory.service';

@Global()
@Module({ providers: [OrgService, UserDirectoryService], exports: [OrgService, UserDirectoryService] })
export class OrgModule {}
