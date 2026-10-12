import { Inject, Injectable } from '@nestjs/common';
import { Errors } from '../../common/app.exception';
import type { AuthUser } from '../auth/auth.types';
import { CORE_DB, type CoreDb } from '../database/database.module';
import { BranchService } from '../permission/branch.service';
import { FieldPolicyService } from '../permission/field-policy.service';
import { accessStamp, PermissionService } from '../permission/permission.service';

export interface MenuNode {
  code: string;
  name: string;
  icon: string | null;
  path: string | null;
  isMobile: boolean;
  children: MenuNode[];
}

@Injectable()
export class MeService {
  constructor(
    @Inject(CORE_DB) private readonly db: CoreDb,
    private readonly permissions: PermissionService,
    private readonly branches: BranchService,
    private readonly fields: FieldPolicyService,
  ) {}

  /** Đơn vị cơ sở user được phép chọn (dùng khi đổi ĐVCS). */
  async branchList(user: AuthUser) {
    const list = await this.branches.listForUser(user.userId);
    return list.map((b) => ({ code: b.code, name: b.name, isAggregate: b.isAggregate }));
  }

  async profile(user: AuthUser) {
    const row = await this.db.selectFrom('SysUser').select(['Id', 'Username', 'FullName']).where('Id', '=', user.userId).executeTakeFirst();
    if (!row) throw Errors.unauthenticated();
    const branch = await this.db
      .selectFrom('SysBranch')
      .select(['Code', 'Name', 'IsAggregate'])
      .where('Code', '=', user.branchCode!)
      .executeTakeFirst();
    // Chỉ các vai trò đang có hiệu lực ở nhà máy của phiên (phép gán có thể giới hạn nhà máy, có hạn dùng)
    const access = await this.permissions.accessOf(user);
    const roles = access.roleIds.length
      ? await this.db.selectFrom('SysRole').select(['Code', 'Name']).where('Id', 'in', access.roleIds).orderBy('SortOrder').execute()
      : [];
    // Nhà máy SX thuộc ĐVCS của phiên (ADR 0013 mục 11): giao diện nói rõ popup Chọn mã hàng lọc theo các nhà máy này
    const factories = access.productionFactories.length
      ? await this.db.selectFrom('SysProductionFactory').select(['Code', 'Name', 'BranchCode']).where('Code', 'in', access.productionFactories).orderBy('SortOrder').orderBy('Code').execute()
      : [];
    return {
      user: { id: row.Id, username: row.Username, fullName: row.FullName },
      branch: branch ? { code: branch.Code, name: branch.Name, isAggregate: !!branch.IsAggregate } : null,
      roles: roles.map((r) => ({ code: r.Code, name: r.Name })),
      productionFactories: factories.map((f) => ({ code: f.Code, name: f.Name, branchCode: f.BranchCode })),
      permissionVersion: Number(access.version),
    };
  }

  /** Quyền tại nhà máy của phiên (phép gán có thể chỉ hiệu lực ở một số nhà máy), kèm ngoại lệ theo người. */
  async permissionList(user: AuthUser) {
    const access = await this.permissions.accessOf(user);
    return { version: Number(access.version), stamp: accessStamp(access), permissions: [...access.permissions].sort() };
  }

  /** Mức của từng cột theo tài nguyên, để giao diện ẩn cột, hiện ***, khóa ô. Chỉ để phản chiếu, backend vẫn lọc. */
  async fieldPolicies(user: AuthUser) {
    const access = await this.permissions.accessOf(user);
    const all = await this.fields.all(access);
    const resources: Record<string, Record<string, string>> = {};
    for (const [code, entry] of all) {
      if (!access.permissions.has(`${code}:view`)) continue;
      resources[code] = Object.fromEntries(entry.levels);
    }
    return { version: Number(access.version), resources };
  }

  /** Menu lá hiện khi user có <resource>:view; nhóm cha hiện khi còn ít nhất một con. */
  async menu(user: AuthUser): Promise<MenuNode[]> {
    const state = await this.permissions.accessOf(user);
    const rows = await this.db
      .selectFrom('SysMenu as m')
      .leftJoin('SysResource as res', 'res.Id', 'm.ResourceId')
      .select(['m.Id', 'm.Code', 'm.Name', 'm.ParentId', 'm.Path', 'm.Icon', 'm.IsMobile', 'm.SortOrder', 'res.Code as ResourceCode', 'res.IsActive as ResourceActive'])
      .where('m.IsActive', '=', true)
      .orderBy('m.SortOrder')
      .orderBy('m.Id')
      .execute();

    const build = (parentId: number | null): MenuNode[] => {
      const out: MenuNode[] = [];
      for (const r of rows.filter((x) => x.ParentId === parentId)) {
        const children = build(r.Id);
        const isLeaf = r.ResourceCode != null;
        const visible = isLeaf
          ? !!r.ResourceActive && state.permissions.has(`${r.ResourceCode}:view`)
          : children.length > 0;
        if (!visible) continue;
        out.push({ code: r.Code, name: r.Name, icon: r.Icon, path: r.Path, isMobile: !!r.IsMobile, children });
      }
      return out;
    };
    return build(null);
  }
}
