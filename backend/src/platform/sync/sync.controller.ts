import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, RequirePermission } from '../auth/decorators';
import { SyncRunsQuery, SyncStartDto } from './sync.dto';
import { SyncService } from './sync.service';

/** Màn Đồng bộ dữ liệu: chép view của database trung gian vào MES_Sync (quyết định 8.1, 8.4). */
@Controller('admin/sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('sources') @RequirePermission('admin.sync:view')
  sources() { return this.sync.sources(); }

  @Get('runs') @RequirePermission('admin.sync:view')
  runs(@Query() q: SyncRunsQuery) { return this.sync.runs(q.sourceId, q.page, q.pageSize); }

  @Post('start') @HttpCode(202) @RequirePermission('admin.sync:update')
  start(@CurrentUser() a: AuthUser, @Body() dto: SyncStartDto) { return this.sync.start(a, dto); }
}
