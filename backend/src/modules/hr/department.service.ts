import { Inject, Injectable } from '@nestjs/common';
import { AppException, Errors } from '../../common/app.exception';
import { sqlErrorNumbers } from '../../common/db-errors';
import type { AuthUser } from '../../platform/auth/auth.types';
import { AuditService } from '../../platform/audit/audit.service';
import { CatalogLookupService } from '../../platform/catalog/catalog-lookup.service';
import { scopeOf } from '../../platform/data/base.repository';
import { inTransaction } from '../../platform/data/transaction';
import { BranchService } from '../../platform/permission/branch.service';
import { HR_DB } from './hr.db';
import type { DepartmentCreateDto, DepartmentDissolveDto, DepartmentUpdateDto } from './hr.dto';
import { DepartmentRepository, EmployeeRepository, HrCatalogRepository, type DepartmentNodeRow, type DepartmentTypeRow } from './hr.repositories';
import type { HrDb } from './hr.types';

const invalid = (msg: string) => new AppException('VALIDATION_FAILED', msg, 422);
const day = (d: Date | string | null | undefined): string | null => (d == null ? null : d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
/** Hôm nay theo giờ Việt Nam (máy chủ có thể đặt giờ UTC) */
const todayVN = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const MAX_PATH = 400;
const isDuplicate = (e: unknown) => sqlErrorNumbers(e).some((n) => n === 2601 || n === 2627);

export function presentDepartment(r: DepartmentNodeRow) {
  return {
    id: r.Id,
    code: r.Code,
    name: r.Name,
    nameEn: r.NameEn,
    departmentTypeId: r.DepartmentTypeId,
    typeCode: r.TypeCode,
    typeName: r.TypeName,
    levelOrder: r.LevelOrder,
    isFinalLevel: !!r.IsFinalLevel,
    parentId: r.ParentId,
    path: r.Path,
    managerEmployeeId: r.ManagerEmployeeId,
    managerCode: r.ManagerCode,
    managerName: r.ManagerName,
    branchCode: r.BranchCode,
    establishedDate: day(r.EstablishedDate),
    dissolvedDate: day(r.DissolvedDate),
    sortOrder: r.SortOrder,
    isActive: !!r.IsActive,
    activeEmployees: Number(r.ActiveEmployees ?? 0),
    createdAt: r.CreatedAt,
    modifiedAt: r.ModifiedAt,
  };
}

const presentType = (t: DepartmentTypeRow) => ({
  id: t.Id,
  code: t.Code,
  name: t.Name,
  levelOrder: t.LevelOrder,
  isFinalLevel: !!t.IsFinalLevel,
  isActive: !!t.IsActive,
});

/** Tên phòng ban kèm mã cho thông báo: "Phòng Kế toán (KT)" */
const label = (d: { Name: string; Code: string }) => `${d.Name} (${d.Code})`;

/**
 * Sơ đồ tổ chức (ADR 0012 mục 3). Quy tắc kiểm ở máy chủ, sửa các lỗi của bản Support-Web (KE-HOACH-MES-VSN.md mục 2.4):
 * mã không sửa được; cha mới không nằm trong nhánh con; giải thể bị chặn khi còn phòng ban con đang dùng hoặc nhân viên đang
 * làm; loại cấp cuối không có phòng ban con. Mọi thay đổi ghi nhật ký.
 */
@Injectable()
export class DepartmentService {
  constructor(
    @Inject(HR_DB) private readonly db: HrDb,
    private readonly repo: DepartmentRepository,
    private readonly employees: EmployeeRepository,
    private readonly catalog: HrCatalogRepository,
    private readonly branches: BranchService,
    private readonly lookup: CatalogLookupService,
    private readonly audit: AuditService,
  ) {}

  private log(user: AuthUser, id: number, action: string, oldValue?: unknown, newValue?: unknown) {
    return this.audit.log({ userId: user.userId, username: user.username, branchCode: user.branchCode, entityType: 'Department', entityId: id, actionCode: action, oldValue, newValue, ip: user.ip });
  }

  async tree(user: AuthUser, includeDissolved: boolean) {
    return { items: (await this.repo.tree(scopeOf(user), includeDissolved)).map(presentDepartment) };
  }

  /** Loại phòng ban và nhà máy cho các ô chọn của form */
  async options() {
    const names = await this.lookup.branchNames();
    // Chỉ nhà máy đang dùng (máy chủ từ chối nhà máy đã tắt); nhà máy đã tắt của một phòng ban vẫn hiện tên qua mã ở form
    const active = await Promise.all([...names].map(async ([code, name]) => ((await this.branches.findActiveByCode(code)) ? { code, name } : null)));
    return {
      types: (await this.catalog.types()).map(presentType),
      factories: active.filter((f): f is { code: string; name: string } => f !== null),
    };
  }

  async detail(user: AuthUser, id: number) {
    return presentDepartment(await this.repo.node(scopeOf(user), id));
  }

  /** Người quản lý: nhân viên đang làm khớp mã hoặc tên (tìm trên máy chủ, 20 người) */
  async managerOptions(user: AuthUser, q: string | undefined, selected: number | undefined) {
    const rows = await this.employees.pick(scopeOf(user), q, selected);
    return rows.map((r) => ({ id: r.Id, code: r.Code, fullName: r.FullName, departmentName: r.DepartmentName ?? null, isActive: r.EmploymentStatus === 1 }));
  }

  private async typeFor(id: number, db: HrDb): Promise<DepartmentTypeRow> {
    const t = await this.catalog.type(id, db);
    if (!t) throw invalid('Loại phòng ban không có trong danh mục.');
    if (!t.IsActive) throw invalid(`Loại ${t.Name} đã ngừng dùng, chọn loại khác.`);
    return t;
  }

  /** Cha đang dùng, không phải loại cấp cuối */
  private async parentFor(user: AuthUser, id: number, db: HrDb) {
    const p = await this.repo.node(scopeOf(user), id, 'view', db).catch((e) => {
      // Lỗi khác (mất kết nối, deadlock) ném tiếp, không đổi thành "không tồn tại" (review 5.8 L8)
      if (e instanceof AppException && e.code === 'NOT_FOUND') return null;
      throw e;
    });
    if (!p) throw invalid('Phòng ban cha không tồn tại.');
    if (!p.IsActive) throw invalid(`${label(p)} đã giải thể, không thêm phòng ban con vào được.`);
    if (p.IsFinalLevel) throw invalid(`${label(p)} thuộc loại ${p.TypeName} là cấp cuối, không có phòng ban con.`);
    return p;
  }

  /** Nhà máy của phòng ban: nhà máy thật đang dùng, không gắn đơn vị tổng hợp A00 (không gắn dữ liệu) */
  private async assertBranch(code: string) {
    const b = await this.branches.findActiveByCode(code);
    if (!b) throw invalid(`Không có nhà máy ${code} đang dùng.`);
    if (b.isAggregate) throw invalid(`${b.name} là đơn vị tổng hợp, không gắn phòng ban vào được.`);
  }

  private async assertManager(id: number, db: HrDb) {
    if (!(await this.employees.isActiveEmployee(id, db))) throw invalid('Người quản lý phải là nhân viên đang làm việc.');
  }

  async create(user: AuthUser, dto: DepartmentCreateDto) {
    const scope = scopeOf(user);
    if (dto.branchCode) await this.assertBranch(dto.branchCode);
    try {
      const id = await inTransaction(this.db, async (trx) => {
        await this.repo.lockTree(trx);
        await this.typeFor(dto.departmentTypeId, trx);
        if (await this.repo.codeTaken(dto.code, trx)) throw Errors.conflict(`Mã ${dto.code} đã có (kể cả phòng ban đã giải thể). Chọn mã khác.`);
        const parent = dto.parentId ? await this.parentFor(user, dto.parentId, trx) : null;
        const path = `${parent?.Path ?? '/'}${dto.code}/`;
        if (path.length > MAX_PATH) throw invalid('Cây quá sâu: đường dẫn của phòng ban vượt 400 ký tự. Rút ngắn mã hoặc đặt ở cấp cao hơn.');
        if (dto.managerEmployeeId) await this.assertManager(dto.managerEmployeeId, trx);
        return this.repo.insertNode(
          scope,
          {
            Code: dto.code,
            Name: dto.name,
            NameEn: dto.nameEn ?? null,
            DepartmentTypeId: dto.departmentTypeId,
            ParentId: parent?.Id ?? null,
            Path: path,
            ManagerEmployeeId: dto.managerEmployeeId ?? null,
            BranchCode: dto.branchCode ?? null,
            EstablishedDate: dto.establishedDate ?? null,
            DissolvedDate: null,
            SortOrder: dto.sortOrder ?? 0,
            IsActive: true,
          },
          trx,
        );
      });
      const out = await this.detail(user, id);
      await this.log(user, id, 'CREATE', undefined, out);
      return out;
    } catch (e) {
      if (isDuplicate(e)) throw Errors.conflict(`Mã ${dto.code} đã có. Chọn mã khác.`);
      throw e;
    }
  }

  /**
   * Sửa phòng ban, chỉ phần đã gửi. Đổi cha: cha mới đang dùng, không phải chính nó hay một nút trong nhánh của nó, rồi cập nhật
   * Path cả nhánh trong cùng transaction. Đổi loại sang cấp cuối khi còn phòng ban con thì bị chặn.
   */
  async update(user: AuthUser, id: number, dto: DepartmentUpdateDto) {
    const scope = scopeOf(user);
    const result = await inTransaction(this.db, async (trx) => {
      await this.repo.lockTree(trx);
      const before = await this.repo.node(scope, id, 'update', trx);
      if (dto.code !== undefined && dto.code !== before.Code) throw Errors.codeImmutable();
      // Chỉ kiểm nhà máy khi đổi: phòng ban của nhà máy đã tắt vẫn sửa được tên (review 5.8 L9)
      if (dto.branchCode && dto.branchCode !== before.BranchCode) await this.assertBranch(dto.branchCode);
      const set: Parameters<DepartmentRepository['updateNode']>[2] = {};
      if (dto.name !== undefined && dto.name !== before.Name) set.Name = dto.name;
      if (dto.nameEn !== undefined && (dto.nameEn ?? null) !== before.NameEn) set.NameEn = dto.nameEn ?? null;
      if (dto.sortOrder !== undefined && dto.sortOrder !== before.SortOrder) set.SortOrder = dto.sortOrder;
      if (dto.branchCode !== undefined && (dto.branchCode ?? null) !== before.BranchCode) set.BranchCode = dto.branchCode ?? null;
      if (dto.establishedDate !== undefined && (dto.establishedDate ?? null) !== day(before.EstablishedDate)) {
        const dissolved = day(before.DissolvedDate);
        if (dto.establishedDate && dissolved && dto.establishedDate > dissolved) throw invalid('Ngày thành lập không được sau ngày giải thể.');
        set.EstablishedDate = dto.establishedDate ?? null;
      }
      if (dto.managerEmployeeId !== undefined && (dto.managerEmployeeId ?? null) !== before.ManagerEmployeeId) {
        if (dto.managerEmployeeId) await this.assertManager(dto.managerEmployeeId, trx);
        set.ManagerEmployeeId = dto.managerEmployeeId ?? null;
      }
      if (dto.departmentTypeId !== undefined && dto.departmentTypeId !== before.DepartmentTypeId) {
        const t = await this.typeFor(dto.departmentTypeId, trx);
        if (t.IsFinalLevel && (await this.repo.anyChildren(id, trx))) throw invalid(`Loại ${t.Name} là cấp cuối, mà ${label(before)} đang có phòng ban con.`);
        set.DepartmentTypeId = dto.departmentTypeId;
      }

      const parentAfter = dto.parentId === undefined ? before.ParentId : (dto.parentId ?? null);
      let moved: { from: string; to: string; nodes: number } | null = null;
      if (parentAfter !== before.ParentId) {
        let newPath = `/${before.Code}/`;
        if (parentAfter !== null) {
          if (parentAfter === id) throw invalid('Phòng ban không làm cha của chính nó được.');
          const p = await this.parentFor(user, parentAfter, trx);
          if (p.Path.startsWith(before.Path)) throw invalid(`${label(p)} nằm trong nhánh của ${label(before)}, không làm phòng ban cha được.`);
          newPath = `${p.Path}${before.Code}/`;
        }
        const longest = await this.repo.longestPathUnder(before.Path, trx);
        if (longest - before.Path.length + newPath.length > MAX_PATH) throw invalid('Cây quá sâu: chuyển sang đây thì đường dẫn của phòng ban con vượt 400 ký tự.');
        const nodes = await this.repo.moveSubtree(scope, id, before.Path, newPath, parentAfter, trx);
        moved = { from: before.Path, to: newPath, nodes };
      }
      if (Object.keys(set).length) await this.repo.updateNode(scope, id, set, trx);
      return { before, set, moved };
    });
    const out = await this.detail(user, id);
    if (Object.keys(result.set).length || result.moved) {
      const old = presentDepartment(result.before);
      await this.log(user, id, 'UPDATE', old, { ...result.set, ...(result.moved ? { Path: result.moved.to, MovedNodes: result.moved.nodes } : {}) });
    }
    return out;
  }

  /**
   * Giải thể (xóa mềm). Chặn khi còn phòng ban con đang dùng hoặc nhân viên đang làm, nêu số lượng: ẩn phòng ban giải thể mà con
   * còn đang dùng thì con mất cha trên cây (lỗi số 5 của bản Support-Web).
   */
  async dissolve(user: AuthUser, id: number, dto: DepartmentDissolveDto) {
    const scope = scopeOf(user);
    const date = dto.dissolvedDate ?? todayVN();
    const before = await inTransaction(this.db, async (trx) => {
      await this.repo.lockTree(trx);
      const d = await this.repo.node(scope, id, 'update', trx);
      if (!d.IsActive) throw Errors.conflict(`${label(d)} đã giải thể.`);
      const established = day(d.EstablishedDate);
      if (established && date < established) throw invalid('Ngày giải thể không được trước ngày thành lập.');
      const children = await this.repo.activeChildren(id, trx);
      const people = await this.employees.activeIn(id, trx);
      if (children || people) {
        const parts = [children ? `${children} phòng ban con đang dùng` : null, people ? `${people} nhân viên đang làm việc` : null].filter(Boolean).join(' và ');
        const todo = [children ? 'giải thể hoặc chuyển các phòng ban con' : null, people ? 'chuyển nhân viên sang phòng ban khác' : null].filter(Boolean).join(', ');
        throw Errors.conflict(`${label(d)} còn ${parts}. Hãy ${todo} trước.`);
      }
      await this.repo.updateNode(scope, id, { IsActive: false, DissolvedDate: date }, trx);
      return d;
    });
    await this.log(user, id, 'DISSOLVE', { IsActive: true }, { IsActive: false, DissolvedDate: date, Code: before.Code });
    return this.detail(user, id);
  }

  /** Khôi phục phòng ban đã giải thể: cha (nếu có) phải đang dùng */
  async restore(user: AuthUser, id: number) {
    const scope = scopeOf(user);
    const before = await inTransaction(this.db, async (trx) => {
      await this.repo.lockTree(trx);
      const d = await this.repo.node(scope, id, 'update', trx);
      if (d.IsActive) throw Errors.conflict(`${label(d)} đang dùng.`);
      if (d.ParentId) {
        const p = await this.repo.node(scope, d.ParentId, 'view', trx);
        if (!p.IsActive) throw invalid(`Phòng ban cha ${label(p)} đã giải thể: khôi phục phòng ban cha trước.`);
      }
      await this.repo.updateNode(scope, id, { IsActive: true, DissolvedDate: null }, trx);
      return d;
    });
    await this.log(user, id, 'RESTORE', { IsActive: false, DissolvedDate: day(before.DissolvedDate) }, { IsActive: true, Code: before.Code });
    return this.detail(user, id);
  }
}
