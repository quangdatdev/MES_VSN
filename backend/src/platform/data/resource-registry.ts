import { Inject, Injectable } from '@nestjs/common';
import { Errors } from '../../common/app.exception';
import { CORE_DB, type CoreDb } from '../database/database.module';

export type ScopeType = 'BRANCH' | 'SHARED';

export interface FieldInfo {
  code: string;
  name: string;
  isSensitive: boolean;
  sortOrder: number;
}

export interface ResourceInfo {
  id: number;
  code: string;
  name: string;
  scope: ScopeType;
  table: string | null;
  /** Chiều phạm vi → cột của bảng nguồn (SysResourceScopeBinding). Tài nguyên BRANCH luôn có FACTORY → BranchCode. */
  bindings: Map<string, string>;
  /** Cột đã đăng ký (SysResourceField), khóa trùng tên trường JSON mà API trả về. */
  fields: FieldInfo[];
}

/**
 * Danh bạ tài nguyên (SysResource): repository chỉ chạy khi tài nguyên đã khai báo
 * đúng phạm vi (BRANCH/SHARED) và đúng bảng nguồn. Chưa khai báo thì từ chối.
 */
@Injectable()
export class ResourceRegistry {
  private cache = new Map<string, { at: number; info: ResourceInfo | null }>();
  private static readonly TTL_MS = 30_000;

  constructor(@Inject(CORE_DB) private readonly db: CoreDb) {}

  invalidate() {
    this.cache.clear();
  }

  async info(code: string): Promise<ResourceInfo | null> {
    const hit = this.cache.get(code);
    if (hit && Date.now() - hit.at < ResourceRegistry.TTL_MS) return hit.info;
    const row = await this.db
      .selectFrom('SysResource')
      .select(['Id', 'Code', 'Name', 'ScopeType', 'SourceTable'])
      .where('Code', '=', code)
      .where('IsActive', '=', true)
      .executeTakeFirst();
    let info: ResourceInfo | null = null;
    if (row) {
      const bindings = await this.db
        .selectFrom('SysResourceScopeBinding as b')
        .innerJoin('SysScopeDimension as d', 'd.Id', 'b.DimensionId')
        .select(['d.Code', 'b.ColumnName'])
        .where('b.ResourceId', '=', row.Id)
        .execute();
      const fields = await this.db
        .selectFrom('SysResourceField')
        .select(['Code', 'Name', 'IsSensitive', 'SortOrder'])
        .where('ResourceId', '=', row.Id)
        .where('IsActive', '=', true)
        .orderBy('SortOrder')
        .orderBy('Id')
        .execute();
      const map = new Map(bindings.map((b) => [b.Code, b.ColumnName]));
      // Quên khai báo chiều nhà máy cũng không được mất lọc nhà máy (ADR 0005)
      if (row.ScopeType === 'BRANCH') map.set('FACTORY', 'BranchCode');
      info = {
        id: row.Id,
        code: row.Code,
        name: row.Name,
        scope: row.ScopeType,
        table: row.SourceTable,
        bindings: map,
        fields: fields.map((f) => ({ code: f.Code, name: f.Name, isSensitive: !!f.IsSensitive, sortOrder: f.SortOrder })),
      };
    }
    this.cache.set(code, { at: Date.now(), info });
    return info;
  }

  /** Tài nguyên phải khai báo đúng bảng nguồn thì repository mới được chạy. */
  async resolve(code: string, table: string): Promise<ResourceInfo> {
    const info = await this.info(code);
    if (!info || info.table !== table) throw Errors.resourceNotRegistered(code);
    return info;
  }

  async scopeFor(code: string, table: string): Promise<ScopeType> {
    return (await this.resolve(code, table)).scope;
  }
}
