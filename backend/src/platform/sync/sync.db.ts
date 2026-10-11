import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { env } from '../../config/env';
import { createDb } from '../database/db';
import type { SyncDatabase, SyncDb } from './sync.types';

export const SYNC_DB = 'SYNC_DB';
/** Pool cho màn hình và hàng đợi: giới hạn thời gian mặc định, không mở được thì báo ngay */
export const syncDbProvider = { provide: SYNC_DB, useFactory: () => createDb<SyncDatabase>(env.db.syncName, { failFast: true }) };

/** Một lần chép lâu nhất được phép; quá thì đóng hẳn kết nối */
export const SYNC_RUN_TIMEOUT_MS = 60 * 60_000;

/**
 * Kết nối riêng cho một lần chép, đóng ngay khi xong hoặc quá giờ. Đóng kết nối là kết thúc phiên SQL: transaction dở
 * bị hủy, khóa ứng dụng của nguồn được nhả, usp_SyncRun_RecoverStale nhận ra lần chạy đó đã dừng. Hủy giữa chừng trên
 * kết nối của pool thì phiên vẫn sống và giữ khóa.
 */
export const createSyncRunner = () => createDb<SyncDatabase>(env.db.syncName, { requestTimeoutMs: SYNC_RUN_TIMEOUT_MS, failFast: true, poolMax: 1 });

@Injectable()
export class SyncDbLifecycle implements OnApplicationShutdown {
  constructor(@Inject(SYNC_DB) private readonly db: SyncDb) {}

  async onApplicationShutdown() {
    await this.db.destroy();
  }
}
