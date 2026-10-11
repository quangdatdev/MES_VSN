import { Inject, Injectable } from '@nestjs/common';
import { Errors } from '../../common/app.exception';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { CatalogLookupService } from '../catalog/catalog-lookup.service';
import { CORE_DB, type CoreDb } from '../database/database.module';
import { BranchService } from '../permission/branch.service';
import { PermissionService } from '../permission/permission.service';
import { BranchCreateDto, BranchUpdateDto } from './admin.dto';

@Injectable()
export class AdminBranchesService {
  constructor(
    @Inject(CORE_DB) private readonly db: CoreDb,
    private readonly audit: AuditService,
    private readonly branches: BranchService,
    private readonly permissions: PermissionService,
    private readonly catalogs: CatalogLookupService,
  ) {}

  private log(actor: AuthUser, id: number, action: string, oldValue?: unknown, newValue?: unknown) {
    return this.audit.log({ userId: actor.userId, username: actor.username, branchCode: actor.branchCode, entityType: 'SysBranch', entityId: id, actionCode: action, oldValue, newValue });
  }

  async list() {
    const rows = await this.db.selectFrom('SysBranch').selectAll().orderBy('SortOrder').orderBy('Code').execute();
    return rows.map((b) => ({ id: b.Id, code: b.Code, name: b.Name, description: b.Description, isAggregate: !!b.IsAggregate, isActive: !!b.IsActive, isSystem: !!b.IsSystem }));
  }

  async create(actor: AuthUser, dto: BranchCreateDto) {
    if (dto.code === 'A00') throw Errors.conflict('Mã A00 dành cho đơn vị tổng hợp.');
    const exists = await this.db.selectFrom('SysBranch').select('Id').where('Code', '=', dto.code).executeTakeFirst();
    if (exists) throw Errors.conflict('Mã nhà máy đã được dùng.');
    const max = await this.db.selectFrom('SysBranch').select((eb) => eb.fn.max('SortOrder').as('m')).executeTakeFirst();
    const row = await this.db
      .insertInto('SysBranch')
      .values({ Code: dto.code, Name: dto.name.trim(), Description: dto.description ?? null, IsAggregate: false, SortOrder: (max?.m ?? 0) + 10, IsActive: true, IsSystem: false, CreatedBy: actor.userId } as any)
      .output('inserted.Id')
      .executeTakeFirstOrThrow();
    await this.log(actor, row.Id, 'BRANCH_CREATE', undefined, { code: dto.code, name: dto.name });
    this.catalogs.invalidateBranchNames();
    return { id: row.Id };
  }

  /** Chỉ sửa được tên, mô tả, trạng thái. Mã là khóa ngầm của mọi bảng dữ liệu nên cấm sửa. */
  async update(actor: AuthUser, id: number, dto: BranchUpdateDto) {
    const before = await this.db.selectFrom('SysBranch').select(['Code', 'Name', 'Description', 'IsActive', 'IsAggregate']).where('Id', '=', id).executeTakeFirst();
    if (!before) throw Errors.notFound('Không tìm thấy nhà máy.');
    if (dto.code !== undefined && dto.code !== before.Code) throw Errors.codeImmutable();
    if (dto.isActive === false && before.IsAggregate) throw Errors.conflict('Đơn vị tổng hợp không thể vô hiệu hóa.');
    // Tắt nhà máy đang làm việc thì chính mình bị đẩy ra ngay, không bật lại được từ phiên này.
    if (dto.isActive === false && before.Code === actor.branchCode) {
      throw Errors.conflict('Không tắt được nhà máy bạn đang làm việc. Hãy đổi sang nhà máy khác rồi thao tác.');
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
    // Tên ở đây là tên dự phòng của cột Chi nhánh khi BRAVO chưa có
    this.catalogs.invalidateBranchNames();
    if (activeChanged) this.permissions.clearCache();
  }
}
