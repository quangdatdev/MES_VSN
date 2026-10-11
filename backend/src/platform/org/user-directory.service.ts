import { Inject, Injectable } from '@nestjs/common';
import { CORE_DB, type CoreDb } from '../database/database.module';

/** Tên hiển thị của tài khoản MES cho module nghiệp vụ (ví dụ "Nhân viên lập"), không để module đọc MES_Core trực tiếp. */
@Injectable()
export class UserDirectoryService {
  private cache = new Map<number, { at: number; name: string }>();
  private static readonly TTL_MS = 60_000;

  constructor(@Inject(CORE_DB) private readonly db: CoreDb) {}

  async fullName(userId: number): Promise<string> {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < UserDirectoryService.TTL_MS) return hit.name;
    const row = await this.db.selectFrom('SysUser').select(['FullName', 'Username']).where('Id', '=', userId).executeTakeFirst();
    const name = row?.FullName || row?.Username || `#${userId}`;
    this.cache.set(userId, { at: Date.now(), name });
    return name;
  }
}
