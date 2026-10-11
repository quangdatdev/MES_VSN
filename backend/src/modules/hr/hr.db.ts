import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { env } from '../../config/env';
import { createDb } from '../../platform/database/db';
import type { HrDatabase, HrDb } from './hr.types';

/** Module Nhân sự có database riêng (MES_Hr, ADR 0012); kết nối thuộc về module. */
export const HR_DB = 'HR_DB';
export const hrDbProvider = { provide: HR_DB, useFactory: () => createDb<HrDatabase>(env.db.hrName) };

@Injectable()
export class HrDbLifecycle implements OnApplicationShutdown {
  constructor(@Inject(HR_DB) private readonly db: HrDb) {}

  async onApplicationShutdown() {
    await this.db.destroy();
  }
}
