import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Errors } from '../../common/app.exception';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { CatalogLookupService } from '../catalog/catalog-lookup.service';
import { CORE_DB, type CoreDb } from '../database/database.module';
import { OrgService } from '../org/org.service';
import { BranchService } from '../permission/branch.service';
import { PermissionService } from '../permission/permission.service';
import { SyncService } from '../sync/sync.service';
import { BranchCreateDto, BranchUpdateDto } from './admin.dto';
import { bravoBranchCode, importBravoBranches } from './branch-import';

/** Nguồn đồng bộ danh mục chi nhánh BRAVO (MES_Sync/0002): chép xong thì cập nhật Đơn vị cơ sở */
const BRAVO_BRANCH_SOURCE = 'BRAVO.DM_CHINHANH';

/**
 * Quản trị › Đơn vị cơ sở (SysBranch, ADR 0013). Danh sách theo danh mục chi nhánh BRAVO, cộng đơn vị tổng hợp A00 của MES.
 * Mã, tên của ĐVCS có trong BRAVO sửa ở BRAVO; ở MES chỉ bật, tắt (ai được vào đâu).
 */
@Injectable()
export class AdminBranchesService implements OnModuleInit {
  private readonly logger = new Logger('Branches');

  constructor(
    @Inject(CORE_DB) private readonly db: CoreDb,
    private readonly audit: AuditService,
    private readonly branches: BranchService,
    private readonly permissions: PermissionService,
    private readonly catalogs: CatalogLookupService,
    private readonly sync: SyncService,
    private readonly org: OrgService,
  ) {}

  onModuleInit() {
    this.sync.onSucceeded(BRAVO_BRANCH_SOURCE, () => this.importFromBravo(null));
  }

  private log(actor: AuthUser, id: number, action: string, oldValue?: unknown, newValue?: unknown) {
    return this.audit.log({ userId: actor.userId, username: actor.username, branchCode: actor.branchCode, entityType: 'SysBranch', entityId: id, actionCode: action, oldValue, newValue });
  }

  /** Mã ĐVCS đang có trong danh mục chi nhánh BRAVO; null khi chưa đọc được MES_Sync (máy chưa có đồng bộ) */
  private async bravoCodes(): Promise<Set<string> | null> {
    try {
      return new Set((await this.sync.bravoBranches()).map(bravoBranchCode).filter((c): c is string => !!c));
    } catch {
      return null;
    }
  }

  async list() {
    const [rows, factories, bravo] = await Promise.all([
      this.db.selectFrom('SysBranch').selectAll().orderBy('SortOrder').orderBy('Code').execute(),
      this.db.selectFrom('SysProductionFactory').select(['Code', 'Name', 'BranchCode', 'IsActive']).orderBy('SortOrder').orderBy('Code').execute(),
      this.bravoCodes(),
    ]);
    return rows.map((b) => ({
      id: b.Id,
      code: b.Code,
      name: b.Name,
      description: b.Description,
      isAggregate: !!b.IsAggregate,
      isActive: !!b.IsActive,
      isSystem: !!b.IsSystem,
      // Đơn vị tổng hợp là của MES, không có trong BRAVO
      inBravo: b.IsAggregate || bravo === null ? null : bravo.has(b.Code.toUpperCase()),
      factories: factories.filter((f) => f.BranchCode === b.Code).map((f) => ({ code: f.Code, name: f.Name, isActive: !!f.IsActive })),
    }));
  }

  /**
   * Cập nhật ĐVCS theo danh mục chi nhánh BRAVO đã chép vào MES_Sync. `actor` null: chạy tự động sau khi đồng bộ danh mục
   * chi nhánh xong. Chưa có MES_Sync thì báo SYNC_NOT_READY.
   */
  async importFromBravo(actor: AuthUser | null) {
    const rows = await this.sync.bravoBranches();
    const result = await importBravoBranches(this.db, rows, actor?.userId ?? null);
    if (result.added.length || result.updated.length) {
      await this.audit.log({
        userId: actor?.userId ?? null,
        username: actor?.username ?? 'system',
        branchCode: actor?.branchCode ?? null,
        entityType: 'SysBranch',
        actionCode: 'BRANCH_IMPORT',
        newValue: { added: result.added, updated: result.updated },
        ip: actor?.ip ?? null,
      });
      this.branches.invalidate();
      this.catalogs.invalidateBranchNames();
      this.logger.log(`Đã cập nhật Đơn vị cơ sở theo BRAVO: thêm ${result.added.length}, đổi tên ${result.updated.length}.`);
    }
    // Nút gốc của cây tổ chức có thể vừa thêm hoặc đổi tên dù ĐVCS không đổi
    this.org.invalidate();
    return { rows: rows.length, ...result };
  }

  /** Thêm tay ĐVCS: chỉ dùng khi máy chưa có đồng bộ BRAVO (màn hình không còn nút này, ADR 0013) */
  async create(actor: AuthUser, dto: BranchCreateDto) {
    if (dto.code === 'A00') throw Errors.conflict('Mã A00 dành cho đơn vị tổng hợp.');
    const exists = await this.db.selectFrom('SysBranch').select('Id').where('Code', '=', dto.code).executeTakeFirst();
    if (exists) throw Errors.conflict('Mã đơn vị cơ sở đã được dùng.');
    const max = await this.db.selectFrom('SysBranch').select((eb) => eb.fn.max('SortOrder').as('m')).executeTakeFirst();
    const sortOrder = (max?.m ?? 0) + 10;
    const row = await this.db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('SysBranch')
        .values({ Code: dto.code, Name: dto.name.trim(), Description: dto.description ?? null, IsAggregate: false, SortOrder: sortOrder, IsActive: true, IsSystem: false, CreatedBy: actor.userId } as any)
        .output('inserted.Id')
        .executeTakeFirstOrThrow();
      // Nút gốc cây tổ chức như ĐVCS chép từ BRAVO: dùng được cho phạm vi vai trò, thêm xưởng, chuyền (review 5.9 lượt 2).
      // SysOrgUnit có trigger nên chèn không dùng OUTPUT
      await trx
        .insertInto('SysOrgUnit')
        .values({ Code: dto.code, Name: dto.name.trim(), OrgType: 'FACTORY', ParentId: null, ParentOrgType: null, BranchCode: dto.code, Path: `/${dto.code}/`, SortOrder: sortOrder, IsActive: true, IsSystem: false, CreatedBy: actor.userId } as any)
        .execute();
      return created;
    });
    await this.log(actor, row.Id, 'BRANCH_CREATE', undefined, { code: dto.code, name: dto.name });
    this.catalogs.invalidateBranchNames();
    this.org.invalidate();
    return { id: row.Id };
  }

  /**
   * Sửa tên, mô tả, trạng thái. Mã là khóa ngầm của mọi bảng dữ liệu nên cấm sửa. ĐVCS có trong BRAVO thì tên, tên đầy đủ
   * lấy theo BRAVO (lần cập nhật sau sẽ ghi đè), nên không sửa ở đây.
   */
  async update(actor: AuthUser, id: number, dto: BranchUpdateDto) {
    const before = await this.db.selectFrom('SysBranch').select(['Code', 'Name', 'Description', 'IsActive', 'IsAggregate']).where('Id', '=', id).executeTakeFirst();
    if (!before) throw Errors.notFound('Không tìm thấy đơn vị cơ sở.');
    if (dto.code !== undefined && dto.code !== before.Code) throw Errors.codeImmutable();
    if (dto.isActive === false && before.IsAggregate) throw Errors.conflict('Đơn vị tổng hợp không thể vô hiệu hóa.');
    // Tắt đơn vị đang làm việc thì chính mình bị đẩy ra ngay, không bật lại được từ phiên này.
    if (dto.isActive === false && before.Code === actor.branchCode) {
      throw Errors.conflict('Không tắt được đơn vị cơ sở bạn đang làm việc. Hãy đổi sang đơn vị khác rồi thao tác.');
    }
    const renaming = (dto.name !== undefined && dto.name.trim() !== before.Name) || (dto.description !== undefined && (dto.description?.trim() || null) !== before.Description);
    if (renaming && !before.IsAggregate && (await this.bravoCodes())?.has(before.Code.toUpperCase())) {
      throw Errors.conflict('Tên đơn vị cơ sở lấy theo danh mục chi nhánh BRAVO. Hãy sửa ở BRAVO rồi đồng bộ lại.');
    }

    const set: Record<string, unknown> = {};
    if (dto.name !== undefined) set.Name = dto.name.trim();
    if (dto.description !== undefined) set.Description = dto.description?.trim() || null;
    if (dto.isActive !== undefined) set.IsActive = dto.isActive;
    const activeChanged = dto.isActive !== undefined && dto.isActive !== !!before.IsActive;
    await this.db.transaction().execute(async (trx) => {
      await trx.updateTable('SysBranch').set({ ...set, ModifiedAt: new Date(), ModifiedBy: actor.userId } as any).where('Id', '=', id).execute();
      if (activeChanged) await this.permissions.bumpVersion(trx);
      await this.audit.logStrict(
        { userId: actor.userId, username: actor.username, branchCode: actor.branchCode, entityType: 'SysBranch', entityId: id, actionCode: 'BRANCH_UPDATE', oldValue: before, newValue: set },
        trx,
      );
    });
    this.branches.invalidate();
    this.catalogs.invalidateBranchNames();
    if (activeChanged) this.permissions.clearCache();
  }
}
