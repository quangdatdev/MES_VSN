import { Inject, Injectable } from '@nestjs/common';
import { AppException, Errors } from '../../common/app.exception';
import { sqlErrorNumbers } from '../../common/db-errors';
import type { AuthUser } from '../../platform/auth/auth.types';
import { AuditService } from '../../platform/audit/audit.service';
import { inTransaction } from '../../platform/data/transaction';
import { HR_DB } from './hr.db';
import type { DepartmentTypeCreateDto, DepartmentTypeUpdateDto } from './hr.dto';
import { DepartmentRepository, HrCatalogRepository, type DepartmentTypeRow, type DepartmentTypeUsageRow } from './hr.repositories';
import type { HrDb } from './hr.types';

const invalid = (msg: string) => new AppException('VALIDATION_FAILED', msg, 422);
const isDuplicate = (e: unknown) => sqlErrorNumbers(e).some((n) => n === 2601 || n === 2627);
/** So tên không phân biệt hoa thường; giữ dấu (Phong khác Phòng) */
const sameName = (a: string, b: string) => a.normalize('NFC').toLocaleLowerCase('vi') === b.normalize('NFC').toLocaleLowerCase('vi');

const present = (t: DepartmentTypeRow) => ({
  id: t.Id,
  code: t.Code,
  name: t.Name,
  description: t.Description,
  levelOrder: t.LevelOrder,
  isFinalLevel: !!t.IsFinalLevel,
  sortOrder: t.SortOrder,
  isActive: !!t.IsActive,
  isSystem: !!t.IsSystem,
});
const presentUsage = (t: DepartmentTypeUsageRow) => ({ ...present(t), departmentCount: Number(t.DepartmentCount ?? 0) });

/**
 * Danh mục Loại phòng ban ở Quản trị › Danh mục hệ thống (task 5.8.9). Không xóa (ngừng dùng bằng IsActive), mã không sửa được.
 * Thêm, sửa giữ khóa cây phòng ban (cùng khóa với thêm, chuyển phòng ban): bật cấp cuối hay ngừng dùng không bị một lần thêm
 * phòng ban chen vào giữa lúc kiểm và lúc ghi. Mọi thay đổi ghi nhật ký.
 */
@Injectable()
export class DepartmentTypeService {
  constructor(
    @Inject(HR_DB) private readonly db: HrDb,
    private readonly departments: DepartmentRepository,
    private readonly catalog: HrCatalogRepository,
    private readonly audit: AuditService,
  ) {}

  private log(user: AuthUser, id: number, action: string, oldValue?: unknown, newValue?: unknown) {
    return this.audit.log({ userId: user.userId, username: user.username, branchCode: user.branchCode, entityType: 'DepartmentType', entityId: id, actionCode: action, oldValue, newValue, ip: user.ip });
  }

  async list() {
    return (await this.catalog.typesWithUsage()).map(presentUsage);
  }

  /** Hai loại trùng tên thì ô chọn loại ở Sơ đồ tổ chức có hai dòng giống nhau */
  private assertNameFree(all: DepartmentTypeRow[], name: string, exceptId?: number) {
    const other = all.find((t) => t.Id !== exceptId && sameName(t.Name, name));
    if (other) throw Errors.conflict(`Đã có loại ${other.Name} (${other.Code})${other.IsActive ? '' : ', đang ngừng dùng'}. Đặt tên khác${other.IsActive ? '' : ' hoặc dùng lại loại đó'}.`);
  }

  async create(user: AuthUser, dto: DepartmentTypeCreateDto) {
    const duplicate = () => Errors.conflict(`Mã ${dto.code} đã có (kể cả loại đã ngừng dùng). Chọn mã khác.`);
    let row: DepartmentTypeRow;
    try {
      row = await inTransaction(this.db, async (trx) => {
        await this.departments.lockTree(trx);
        const all = await this.catalog.types(trx);
        if (all.some((t) => t.Code === dto.code)) throw duplicate();
        this.assertNameFree(all, dto.name);
        return this.catalog.insertType(
          {
            Code: dto.code,
            Name: dto.name,
            Description: dto.description ?? null,
            LevelOrder: dto.levelOrder,
            IsFinalLevel: dto.isFinalLevel,
            SortOrder: dto.sortOrder ?? Math.max(0, ...all.map((t) => t.SortOrder)) + 10,
            IsActive: true,
            IsSystem: false,
            CreatedBy: user.userId,
          },
          trx,
        );
      });
    } catch (e) {
      if (isDuplicate(e)) throw duplicate();
      throw e;
    }
    const out = present(row);
    await this.log(user, row.Id, 'CREATE', undefined, out);
    return { ...out, departmentCount: 0 };
  }

  async update(user: AuthUser, id: number, dto: DepartmentTypeUpdateDto) {
    const change = await inTransaction(this.db, async (trx) => {
      await this.departments.lockTree(trx);
      const all = await this.catalog.types(trx);
      const cur = all.find((t) => t.Id === id);
      if (!cur) throw Errors.notFound('Loại phòng ban không có trong danh mục.');
      if (dto.code !== undefined && dto.code !== cur.Code) throw Errors.codeImmutable();
      const set: Parameters<HrCatalogRepository['updateType']>[1] = {};
      if (dto.name !== undefined && dto.name !== cur.Name) {
        this.assertNameFree(all, dto.name, id);
        set.Name = dto.name;
      }
      if (dto.description !== undefined && (dto.description ?? null) !== cur.Description) set.Description = dto.description ?? null;
      if (dto.levelOrder !== undefined && dto.levelOrder !== cur.LevelOrder) set.LevelOrder = dto.levelOrder;
      if (dto.sortOrder !== undefined && dto.sortOrder !== cur.SortOrder) set.SortOrder = dto.sortOrder;
      if (dto.isActive !== undefined && dto.isActive !== !!cur.IsActive) set.IsActive = dto.isActive;
      if (dto.isFinalLevel !== undefined && dto.isFinalLevel !== !!cur.IsFinalLevel) {
        if (dto.isFinalLevel) {
          const parents = await this.catalog.parentsOfType(id, trx);
          if (parents.length > 0) {
            const sample = parents.slice(0, 3).map((p) => `${p.Name} (${p.Code})`).join(', ');
            throw invalid(
              `Không bật cấp cuối được: ${parents.length} phòng ban loại ${cur.Name} đang có phòng ban con, kể cả phòng ban đã giải thể (${sample}${parents.length > 3 ? '…' : ''}). Chuyển các phòng ban con đi hoặc đổi loại các phòng ban đó trước.`,
            );
          }
        }
        set.IsFinalLevel = dto.isFinalLevel;
      }
      if (Object.keys(set).length === 0) return null;
      return { before: cur, after: await this.catalog.updateType(id, set, user.userId, trx) };
    });
    if (change) await this.log(user, id, 'UPDATE', present(change.before), present(change.after));
    const [row] = await this.catalog.typesWithUsage(id);
    return presentUsage(row!);
  }
}
