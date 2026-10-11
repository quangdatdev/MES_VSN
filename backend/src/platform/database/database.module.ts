import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Kysely } from 'kysely';
import { env } from '../../config/env';
import { createDb } from './db';
import type { CoreDatabase } from './core.types';

export const CORE_DB = 'CORE_DB';
export type CoreDb = Kysely<CoreDatabase>;

/** Kết nối MES_Core cho nền tảng. Mỗi module nghiệp vụ tự khai báo kết nối tới database riêng của nó. */
@Global()
@Module({
  providers: [{ provide: CORE_DB, useFactory: () => createDb<CoreDatabase>(env.db.coreName) }],
  exports: [CORE_DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(CORE_DB) private readonly core: CoreDb) {}

  async onApplicationShutdown() {
    await this.core.destroy();
  }
}
