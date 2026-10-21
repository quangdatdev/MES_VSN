import { Inject, Injectable, Logger } from '@nestjs/common';
import { Errors } from '../../common/app.exception';
import type { AuthUser } from '../auth/auth.types';
import type { AccessLevel } from '../database/core.types';
import { ResourceRegistry } from '../data/resource-registry';
import { CORE_DB, type CoreDb } from '../database/database.module';
import { PermissionService, type UserAccess } from './permission.service';

export const MASK = '***';
/** Mức của một cột (Ẩn, Che, Chỉ đọc, Sửa được), cho module dựng cột suy ra theo cột nguồn */
export type { AccessLevel };
const RANK: Record<AccessLevel, number> = { HIDDEN: 0, MASKED: 1, READONLY: 2, EDITABLE: 3 };

export interface FieldMeta {
  code: string;
  name: string;
  isSensitive: boolean;
}

interface ResourceFields {
  fields: FieldMeta[];
  levels: Map<string, AccessLevel>;
}

interface Entry {
  version: string;
  roleKey: string;
  expiresAt: number | null;
  resources: Map<string, ResourceFields>;
}

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

/**
 * L4 – quyền theo cột (quyết định 3.7). Mức hiệu lực của một cột:
 *  1. chính sách theo người còn trong hạn dùng (thắng mọi Role);
 *  2. không có thì mức mở nhất trong các Role đang hiệu lực ở nhà máy của phiên (Sửa > Chỉ đọc > Che > Ẩn),
 *     Role không khai báo cột thì cột thường là Sửa được, cột nhạy cảm là Ẩn.
 * Cưỡng chế ở một chỗ cho xem, sửa và xuất file: bỏ cột Ẩn khỏi JSON, cột Che trả "***", ghi vào cột không Sửa được bị 403.
 */
@Injectable()
export class FieldPolicyService {
  private readonly logger = new Logger(FieldPolicyService.name);
  private cache = new Map<string, Entry>();

  constructor(
    @Inject(CORE_DB) private readonly db: CoreDb,
    private readonly permissions: PermissionService,
    private readonly registry: ResourceRegistry,
  ) {}

  clearCache() {
    this.cache.clear();
  }

  /** Mức của mọi cột đã đăng ký, theo tài nguyên. Dùng cho GET /me/field-policies và cho cưỡng chế. */
  async all(access: UserAccess): Promise<Map<string, ResourceFields>> {
    const key = `${access.userId}:${access.branchCode}`;
    const roleKey = access.roleIds.join(',');
    const hit = this.cache.get(key);
    if (hit && hit.version === access.version && hit.roleKey === roleKey && (hit.expiresAt === null || Date.now() < hit.expiresAt)) {
      return hit.resources;
    }
    const entry = await this.compute(access);
    this.cache.set(key, entry);
    return entry.resources;
  }

  async levels(access: UserAccess, resource: string): Promise<ResourceFields> {
    return (await this.all(access)).get(resource) ?? { fields: [], levels: new Map() };
  }

  private async compute(access: UserAccess): Promise<Entry> {
    const now = Date.now();
    const fields = await this.db
      .selectFrom('SysResourceField as f')
      .innerJoin('SysResource as r', 'r.Id', 'f.ResourceId')
      .select(['r.Code as ResourceCode', 'f.ResourceId', 'f.Code', 'f.Name', 'f.IsSensitive'])
      .where('f.IsActive', '=', true)
      .where('r.IsActive', '=', true)
      .orderBy('f.SortOrder')
      .orderBy('f.Id')
      .execute();
    const policies = await this.db
      .selectFrom('SysFieldPolicy')
      .select(['SubjectType', 'SubjectId', 'ResourceId', 'FieldCode', 'AccessLevel', 'ValidFromAt', 'ValidToAt'])
      .where((eb) =>
        eb.or([
          eb.and([eb('SubjectType', '=', 'USER'), eb('SubjectId', '=', access.userId)]),
          ...(access.roleIds.length ? [eb.and([eb('SubjectType', '=', 'ROLE'), eb('SubjectId', 'in', access.roleIds)])] : []),
        ]),
      )
      .execute();

    let expiresAt = access.expiresAt;
    const userPolicy = new Map<string, AccessLevel>();
    const rolePolicy = new Map<string, AccessLevel[]>();
    for (const p of policies) {
      const k = `${p.ResourceId}:${p.FieldCode.toLowerCase()}`;
      if (p.SubjectType === 'USER') {
        for (const t of [p.ValidFromAt?.getTime(), p.ValidToAt ? p.ValidToAt.getTime() + 1 : undefined]) {
          if (t !== undefined && t > now) expiresAt = expiresAt === null ? t : Math.min(expiresAt, t);
        }
        const live = (!p.ValidFromAt || p.ValidFromAt.getTime() <= now) && (!p.ValidToAt || p.ValidToAt.getTime() >= now);
        if (live) userPolicy.set(k, p.AccessLevel);
      } else {
        rolePolicy.set(`${k}:${p.SubjectId}`, [p.AccessLevel]);
      }
    }

    const resources = new Map<string, ResourceFields>();
    for (const f of fields) {
      const entry = resources.get(f.ResourceCode) ?? { fields: [], levels: new Map<string, AccessLevel>() };
      entry.fields.push({ code: f.Code, name: f.Name, isSensitive: !!f.IsSensitive });
      const k = `${f.ResourceId}:${f.Code.toLowerCase()}`;
      const fallback: AccessLevel = f.IsSensitive ? 'HIDDEN' : 'EDITABLE';
      let level = userPolicy.get(k);
      if (!level) {
        // Chỉ tính vai trò có quyền xem tài nguyên này: vai trò không liên quan (không khai báo cột nên theo mặc định
        // Sửa được) không được làm mở cột mà vai trò liên quan đã ẩn hoặc khóa (review 5.1 #6).
        // Không vai trò nào liên quan (ví dụ chỉ có Allow theo người) thì theo mặc định của cột.
        const relevant = access.roleIds.filter((rid) => access.rolePermissions.get(rid)?.has(`${f.ResourceCode}:view`));
        const perRole = relevant.map((rid) => rolePolicy.get(`${k}:${rid}`)?.[0] ?? fallback);
        level = perRole.length ? perRole.reduce((a, b) => (RANK[b] > RANK[a] ? b : a)) : fallback;
      }
      entry.levels.set(f.Code, level);
      resources.set(f.ResourceCode, entry);
    }
    return { version: access.version, roleKey: access.roleIds.join(','), expiresAt, resources };
  }

  /**
   * Lọc dữ liệu trả về theo chính sách cột: duyệt mọi object lồng nhau, khóa trùng mã cột đã đăng ký thì
   * bỏ (Ẩn) hoặc thay bằng "***" (Che). Cột nhạy cảm được trả nguyên thì ghi SysSensitiveReadLog.
   */
  async shape<T>(user: AuthUser, resource: string, data: T, mode: 'VIEW' | 'EXPORT' = 'VIEW'): Promise<T> {
    const access = await this.permissions.accessOf(user);
    const { fields, levels } = await this.levels(access, resource);
    if (fields.length === 0) return data;
    const sensitive = new Set(fields.filter((f) => f.isSensitive).map((f) => f.code));
    const revealed = new Set<string>();

    const walk = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(walk);
      if (!isPlain(v)) return v;
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) {
        const level = levels.get(k);
        if (level === 'HIDDEN') continue;
        if (level === 'MASKED') {
          out[k] = val == null ? val : MASK;
          continue;
        }
        if (level && sensitive.has(k) && val != null) revealed.add(k);
        out[k] = walk(val);
      }
      return out;
    };
    const shaped = walk(data) as T;

    if (revealed.size) {
      const count = Array.isArray(data) ? data.length : isPlain(data) && Array.isArray(data.items) ? data.items.length : 1;
      await this.logSensitive(user, resource, [...revealed], count, mode);
    }
    return shaped;
  }

  /**
   * Tham số sắp xếp "trường:chiều" của client: trường Ẩn hoặc Che thì bỏ, quay về mặc định.
   * Sắp xếp theo cột không được xem cũng làm lộ giá trị (biết dòng nào lớn nhất) (review 5.1 #2).
   */
  async safeSort(user: AuthUser, resource: string, sort: string | undefined, fallback: string): Promise<string> {
    if (!sort) return fallback;
    const field = sort.split(':')[0];
    return (await this.unreadable(user, resource, [field])).size ? fallback : sort;
  }

  /**
   * Các cột (trong danh sách) mà người dùng không được xem nguyên giá trị: Ẩn hoặc Che. Lọc, tìm hay gợi ý theo các
   * cột này cũng làm lộ giá trị (thử "khách hàng chứa N" xem còn dòng nào), nên module phải bỏ (review 5.1 lượt 2 N3).
   */
  async unreadable(user: AuthUser, resource: string, fields: string[]): Promise<Set<string>> {
    const { levels } = await this.levels(await this.permissions.accessOf(user), resource);
    return new Set(fields.filter((f) => levels.get(f) === 'HIDDEN' || levels.get(f) === 'MASKED'));
  }

  /**
   * Bỏ cột nhạy cảm của tài nguyên khỏi dữ liệu ghi nhật ký: màn Nhật ký hệ thống không đi qua chính sách cột
   * nên giá không được nằm trong đó (review 5.1 #3).
   */
  async redact<T>(resource: string, data: T): Promise<T> {
    const info = await this.registry.info(resource);
    const sensitive = new Set((info?.fields ?? []).filter((f) => f.isSensitive).map((f) => f.code));
    if (!sensitive.size || data == null) return data;
    const walk = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(walk);
      if (!isPlain(v)) return v;
      return Object.fromEntries(Object.entries(v).filter(([k]) => !sensitive.has(k)).map(([k, x]) => [k, walk(x)]));
    };
    return walk(data) as T;
  }

  /** Mã cột client gửi mà người dùng không được sửa (duyệt cả object lồng nhau, ví dụ các dòng màu cỡ). */
  async assertWritable(user: AuthUser, resource: string, body: unknown): Promise<void> {
    const access = await this.permissions.accessOf(user);
    const { fields, levels } = await this.levels(access, resource);
    if (levels.size === 0) return;
    const denied = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (!isPlain(v)) return;
      for (const [k, val] of Object.entries(v)) {
        const level = levels.get(k);
        if (val !== undefined && level && level !== 'EDITABLE') denied.add(k);
        walk(val);
      }
    };
    walk(body);
    if (denied.size) {
      const codes = [...denied].sort();
      throw Errors.fieldReadonly(codes, codes.map((c) => fields.find((f) => f.code === c)?.name ?? c));
    }
  }

  private async logSensitive(user: AuthUser, resource: string, fields: string[], count: number, mode: 'VIEW' | 'EXPORT') {
    try {
      await this.db
        .insertInto('SysSensitiveReadLog')
        .values({
          UserId: user.userId,
          Username: user.username.slice(0, 50),
          BranchCode: user.branchCode ?? null,
          ResourceCode: resource.slice(0, 60),
          FieldCodes: fields.sort().join(',').slice(0, 2000),
          RecordCount: count,
          ActionCode: mode,
          IpAddress: user.ip ?? null,
        })
        .execute();
    } catch (e) {
      this.logger.error(`Không ghi được nhật ký đọc dữ liệu nhạy cảm: ${(e as Error).message}`);
    }
  }
}
