import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { env } from '../../config/env';
import { createDb } from '../../platform/database/db';
import type { SewingDatabase, SewingDb } from './sewing.types';

/** Module May có database riêng (MES_Sewing, quyết định 9.1); kết nối thuộc về module. */
export const SEWING_DB = 'SEWING_DB';
export const sewingDbProvider = { provide: SEWING_DB, useFactory: () => createDb<SewingDatabase>(env.db.sewingName) };

@Injectable()
export class SewingDbLifecycle implements OnApplicationShutdown {
  constructor(@Inject(SEWING_DB) private readonly db: SewingDb) {}

  async onApplicationShutdown() {
    await this.db.destroy();
  }
}
