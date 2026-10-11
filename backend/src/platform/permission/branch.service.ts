import { Inject, Injectable } from '@nestjs/common';
import { CORE_DB, type CoreDb } from '../database/database.module';

export interface BranchInfo {
  id: number;
  code: string;
  name: string;
  isAggregate: boolean;
}

@Injectable()
export class BranchService {
  private cache = new Map<string, { at: number; value: BranchInfo | null }>();
  private static readonly TTL_MS = 30_000;

  constructor(@Inject(CORE_DB) private readonly db: CoreDb) {}

  invalidate() {
    this.cache.clear();
  }

  /** Nhà máy đang hoạt động theo mã; cờ IsAggregate luôn lấy từ DB. */
  async findActiveByCode(code: string): Promise<BranchInfo | null> {
    const hit = this.cache.get(code);
    if (hit && Date.now() - hit.at < BranchService.TTL_MS) return hit.value;
    const row = await this.db
      .selectFrom('SysBranch')
      .select(['Id', 'Code', 'Name', 'IsAggregate'])
      .where('Code', '=', code)
      .where('IsActive', '=', true)
      .executeTakeFirst();
    const value = row ? { id: row.Id, code: row.Code, name: row.Name, isAggregate: !!row.IsAggregate } : null;
    this.cache.set(code, { at: Date.now(), value });
    return value;
  }

  async listForUser(userId: number): Promise<BranchInfo[]> {
    const rows = await this.db
      .selectFrom('SysUserBranch as ub')
      .innerJoin('SysBranch as b', 'b.Id', 'ub.BranchId')
      .select(['b.Id', 'b.Code', 'b.Name', 'b.IsAggregate', 'b.SortOrder'])
      .where('ub.UserId', '=', userId)
      .where('b.IsActive', '=', true)
      .orderBy('b.SortOrder')
      .orderBy('b.Code')
      .execute();
    return rows.map((r) => ({ id: r.Id, code: r.Code, name: r.Name, isAggregate: !!r.IsAggregate }));
  }

  async isAllowed(userId: number, code: string): Promise<BranchInfo | null> {
    const branch = await this.findActiveByCode(code);
    if (!branch) return null;
    const link = await this.db
      .selectFrom('SysUserBranch')
      .select('Id')
      .where('UserId', '=', userId)
      .where('BranchId', '=', branch.id)
      .executeTakeFirst();
    return link ? branch : null;
  }
}
