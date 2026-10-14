import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { env } from '../../config/env';
import { createDb } from '../../platform/database/db';
import type { CuttingDatabase, CuttingDb } from './cutting.types';

/** Module Cắt có database riêng (MES_Cutting, quyết định 13.1); kết nối thuộc về module. */
export const CUTTING_DB = 'CUTTING_DB';
export const cuttingDbProvider = { provide: CUTTING_DB, useFactory: () => createDb<CuttingDatabase>(env.db.cuttingName) };

@Injectable()
export class CuttingDbLifecycle implements OnApplicationShutdown {
  constructor(@Inject(CUTTING_DB) private readonly db: CuttingDb) {}

  async onApplicationShutdown() {
    await this.db.destroy();
  }
}
