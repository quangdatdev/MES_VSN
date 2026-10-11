import { Inject, Injectable } from '@nestjs/common';
import { AppException, Errors } from '../../common/app.exception';
import type { AuthUser } from '../../platform/auth/auth.types';
import { AuditService } from '../../platform/audit/audit.service';
import { inTransaction } from '../../platform/data/transaction';
import { SEWING_DB } from './sewing.db';
import type { PrepStepBatchDto, PrepStepCreateDto } from './sewing.dto';
import { PrepStepRepository, type PrepStepRow } from './sewing.repositories';
import type { SewingDb } from './sewing.types';

const present = (s: PrepStepRow) => ({
  id: s.Id,
  code: s.Code,
  name: s.Name,
  description: s.Description,
  planDays: s.PlanDays,
  performer: s.Performer,
  dataSource: s.DataSource,
  sortOrder: s.SortOrder,
  isActive: !!s.IsActive,
});

/**
 * Danh mục "Cấu hình chuẩn bị SX" (Quản trị › Danh mục hệ thống): các bước chuẩn bị, số ngày KH mặc định.
 * Dùng chung toàn công ty, không xóa (ngừng dùng bằng IsActive), mã không sửa được. Mọi thay đổi ghi nhật ký.
 */
@Injectable()
export class PrepStepService {
  constructor(
    @Inject(SEWING_DB) private readonly db: SewingDb,
    private readonly steps: PrepStepRepository,
    private readonly audit: AuditService,
  ) {}

  private log(user: AuthUser, id: number, action: string, oldValue?: unknown, newValue?: unknown) {
    return this.audit.log({ userId: user.userId, username: user.username, branchCode: user.branchCode, entityType: 'PrepStep', entityId: id, actionCode: action, oldValue, newValue, ip: user.ip });
  }

  async list() {
    return (await this.steps.all()).map(present);
  }

  async create(user: AuthUser, dto: PrepStepCreateDto) {
    if ((await this.steps.all()).some((s) => s.Code === dto.code)) throw new AppException('CONFLICT', `Mã ${dto.code} đã có trong danh mục.`, 409);
    const row = await this.steps.create({
      Code: dto.code,
      Name: dto.name,
      Description: dto.description || null,
      PlanDays: dto.planDays,
      Performer: dto.performer || null,
      DataSource: dto.dataSource || null,
      SortOrder: await this.steps.nextSortOrder(),
      IsActive: true,
      CreatedBy: user.userId,
    });
    const out = present(row);
    await this.log(user, row.Id, 'CREATE', undefined, out);
    return out;
  }

  /** Lưu nhiều bước một lần, trong một transaction: một dòng sai thì không lưu dòng nào. */
  async saveMany(user: AuthUser, dto: PrepStepBatchDto) {
    if (new Set(dto.items.map((i) => i.id)).size !== dto.items.length) throw new AppException('VALIDATION_FAILED', 'Một bước chỉ được gửi một lần.', 422);
    const changes = await inTransaction(this.db, async (trx) => {
      const out: { id: number; before: ReturnType<typeof present>; after: ReturnType<typeof present> }[] = [];
      for (const item of dto.items) {
        const cur = await this.steps.get(item.id, trx);
        if (!cur) throw Errors.notFound();
        const set: Parameters<PrepStepRepository['update']>[1] = {};
        if (item.name !== undefined && item.name !== cur.Name) set.Name = item.name;
        if (item.planDays !== undefined && item.planDays !== cur.PlanDays) set.PlanDays = item.planDays;
        if (item.performer !== undefined && (item.performer || null) !== cur.Performer) set.Performer = item.performer || null;
        if (item.dataSource !== undefined && (item.dataSource || null) !== cur.DataSource) set.DataSource = item.dataSource || null;
        if (item.description !== undefined && (item.description || null) !== cur.Description) set.Description = item.description || null;
        if (item.sortOrder !== undefined && item.sortOrder !== cur.SortOrder) set.SortOrder = item.sortOrder;
        if (item.isActive !== undefined && item.isActive !== !!cur.IsActive) set.IsActive = item.isActive;
        if (Object.keys(set).length === 0) continue;
        const after = await this.steps.update(item.id, set, user.userId, trx);
        out.push({ id: item.id, before: present(cur), after: present(after!) });
      }
      return out;
    });
    for (const c of changes) await this.log(user, c.id, 'UPDATE', c.before, c.after);
    return { updated: changes.length, items: await this.list() };
  }
}
