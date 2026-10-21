import { Inject, Injectable } from '@nestjs/common';
import { AppException, Errors } from '../../common/app.exception';
import { sqlErrorNumbers } from '../../common/db-errors';
import type { AuthUser } from '../../platform/auth/auth.types';
import { AuditService } from '../../platform/audit/audit.service';
import { CatalogLookupService } from '../../platform/catalog/catalog-lookup.service';
import { scopeOf } from '../../platform/data/base.repository';
import { inTransaction } from '../../platform/data/transaction';
import { OrgService } from '../../platform/org/org.service';
import { BranchService } from '../../platform/permission/branch.service';
import { PermissionService, type LineSetChange } from '../../platform/permission/permission.service';
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
/** Ô chọn Chuyền may lọc theo ĐVCS đăng nhập nên chuyền phải có ĐVCS (database cũng chặn: CK_Department_ProductionWorkshopBranch) */
const NEED_BRANCH = 'Bộ phận tích "Xưởng sản xuất" phải thuộc một đơn vị cơ sở: chọn đơn vị cơ sở trước.';

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
    isProductionWorkshop: !!r.IsProductionWorkshop,
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
 * Sơ đồ tổ chức (quyết định 10.2). Quy tắc kiểm ở máy chủ, sửa các lỗi của bản Support-Web (KE-HOACH-MES-VSN.md mục 2.4):
 * mã không sửa được; cha mới không nằm trong nhánh con; giải thể bị chặn khi còn phòng ban con đang dùng hoặc nhân viên đang
 * làm; loại cấp cuối không có phòng ban con. Mọi thay đổi ghi nhật ký.
 *
 * Bộ phận tích "Xưởng sản xuất" là chuyền may (phase 5.10): phạm vi chiều LINE của Trưởng chuyền chỉ có tác dụng với chuyền đang
 * dùng, nên tích, bỏ tích, đổi ĐVCS, giải thể, khôi phục chuyền là đổi phạm vi dữ liệu mà không qua màn Phân quyền. Các thao tác
 * này đòi thêm admin.permission:update (như chuyển chuyền cũ giữa xưởng, mục 6.5), người làm không được đang giữ phạm vi chuyền
 * đó; sau khi lưu ghi nhật ký bắt buộc LINE_SET_CHANGE và tăng phiên bản quyền (PermissionService.recordLineSetChange).
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
    private readonly permissions: PermissionService,
    private readonly org: OrgService,
  ) {}

  private log(user: AuthUser, id: number, action: string, oldValue?: unknown, newValue?: unknown) {
    return this.audit.log({ userId: user.userId, username: user.username, branchCode: user.branchCode, entityType: 'Department', entityId: id, actionCode: action, oldValue, newValue, ip: user.ip });
  }

  /**
   * Thao tác làm đổi tập chuyền may: người làm phải có cả quyền sửa phân quyền (quyền Sơ đồ tổ chức đã kiểm ở controller), và
   * không được đang giữ phạm vi chuyền theo đúng mã đó (không tự đổi phạm vi của mình, CLAUDE.md mục 4.8).
   */
  private async assertCanChangeLines(user: AuthUser, action: string, code: string) {
    await this.permissions.assertAdminCeiling(user, ['admin.permission:update'], `${action} làm đổi phạm vi dữ liệu theo chuyền may, cần thêm quyền sửa phân quyền.`);
    if (await this.permissions.holdsLineScope(user.userId, code))
      throw Errors.selfElevation(`Bạn đang được giao phạm vi chuyền ${code} nên không tự đổi chuyền này (${action.toLowerCase()}). Nhờ quản trị viên khác làm.`);
  }

  /**
   * Gọi ngay sau khi transaction MES_Hr đã commit, ở mọi lần ghi phòng ban: xóa cache chuyền (đổi tên, cha, thứ tự của bộ phận cha
   * cũng đổi tên nhóm, thứ tự trong ô chọn chuyền). Phải trước bước tăng phiên bản quyền (recordLines) để quyền tính lại đọc tập
   * chuyền mới.
   */
  private afterWrite() {
    this.org.invalidate();
  }

  /**
   * Tập chuyền đã đổi: nhật ký LINE_SET_CHANGE và tăng phiên bản quyền trong một transaction MES_Core, sau commit của MES_Hr
   * (không có transaction chung). Tăng trước commit thì một request chen giữa có thể tính quyền theo tập chuyền cũ rồi giữ trong
   * cache dưới phiên bản mới. Lỗi thì PermissionService thử lại rồi báo lỗi kèm bộ phận đã lưu (màn hình hiện đúng dữ liệu).
   */
  private recordLines(user: AuthUser, change: LineSetChange, saved: ReturnType<typeof presentDepartment> | null) {
    return this.permissions.recordLineSetChange(user, change, { department: saved, departmentId: change.departmentId });
  }

  /**
   * Đọc lại bộ phận vừa lưu rồi ghi tập chuyền (nếu đổi). Đọc lại lỗi (lỗi thoáng qua của MES_Hr) thì vẫn ghi nhật ký
   * LINE_SET_CHANGE và tăng phiên bản quyền trước khi báo lỗi: dữ liệu đã lưu, phạm vi chuyền không được kẹt ở tập cũ.
   */
  private async savedWithLines(user: AuthUser, id: number, change: LineSetChange | null, onSaved?: (out: ReturnType<typeof presentDepartment>) => Promise<void>) {
    let out: ReturnType<typeof presentDepartment> | null = null;
    let readError: unknown = null;
    try {
      out = await this.detail(user, id);
      // Nhật ký phòng ban thường (cần dữ liệu đọc lại) ghi trước: tập chuyền lỗi sau đó thì nhật ký này vẫn còn
      if (onSaved) await onSaved(out);
    } catch (e) {
      readError = e;
    }
    if (change) await this.recordLines(user, change, out);
    if (readError) throw readError;
    return out!;
  }

  /** Người đang được giao phạm vi chuyền theo mã này: màn hình báo trước khi thêm, tích, khôi phục bộ phận làm họ thấy dữ liệu chuyền */
  async lineHolders(user: AuthUser, code: string) {
    // Quyền như chính thao tác: thêm hoặc sửa Sơ đồ tổ chức (controller đã đòi xem Sơ đồ tổ chức và sửa Phân quyền)
    const own = (await this.permissions.accessOf(user)).permissions;
    if (!own.has('hr.orgchart:create') && !own.has('hr.orgchart:update')) throw Errors.permissionDenied();
    return { code, holders: await this.permissions.lineScopeHolders(code) };
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
    const line = dto.isProductionWorkshop === true;
    if (line) await this.assertCanChangeLines(user, 'Thêm bộ phận tích "Xưởng sản xuất"', dto.code);
    if (line && !dto.branchCode) throw invalid(NEED_BRANCH);
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
            IsProductionWorkshop: line,
          },
          trx,
        );
      });
      this.afterWrite();
      const after = { isProductionWorkshop: true, branchCode: dto.branchCode ?? null, isActive: true };
      return await this.savedWithLines(user, id, line ? { departmentId: id, code: dto.code, operation: 'CREATE', before: null, after } : null, (out) =>
        this.log(user, id, 'CREATE', undefined, out),
      );
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
      // Chuyền may: đổi cờ (cả hai chiều) hay đổi ĐVCS của bộ phận đang tích là đổi tập chuyền; đổi tên, cha thì không
      const lineBefore = !!before.IsProductionWorkshop;
      const lineAfter = dto.isProductionWorkshop ?? lineBefore;
      const branchAfter = dto.branchCode === undefined ? before.BranchCode : (dto.branchCode ?? null);
      const branchChanged = branchAfter !== before.BranchCode;
      if (lineAfter !== lineBefore) await this.assertCanChangeLines(user, lineAfter ? 'Tích "Xưởng sản xuất"' : 'Bỏ tích "Xưởng sản xuất"', before.Code);
      else if (lineBefore && branchChanged) await this.assertCanChangeLines(user, 'Đổi đơn vị cơ sở của bộ phận là chuyền may', before.Code);
      if (lineAfter && !branchAfter) throw invalid(NEED_BRANCH);
      // Chỉ kiểm nhà máy khi đổi: phòng ban của nhà máy đã tắt vẫn sửa được tên (review 5.8 L9). Vừa tích thì ĐVCS giữ nguyên
      // cũng phải đang dùng: chuyền của ĐVCS đã tắt không chọn được ở đâu
      if (branchAfter && (branchChanged || (lineAfter && !lineBefore))) await this.assertBranch(branchAfter);
      const set: Parameters<DepartmentRepository['updateNode']>[2] = {};
      if (lineAfter !== lineBefore) set.IsProductionWorkshop = lineAfter;
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
      const lines: LineSetChange | null =
        lineAfter !== lineBefore || (lineBefore && branchChanged)
          ? {
              departmentId: id,
              code: before.Code,
              operation: lineAfter !== lineBefore ? (lineAfter ? 'TICK' : 'UNTICK') : 'BRANCH',
              before: { isProductionWorkshop: lineBefore, branchCode: before.BranchCode, isActive: !!before.IsActive },
              after: { isProductionWorkshop: lineAfter, branchCode: branchAfter, isActive: !!before.IsActive },
            }
          : null;
      return { before, set, moved, lines };
    });
    const changed = Object.keys(result.set).length > 0 || !!result.moved;
    if (changed) {
      this.afterWrite();
      const old = presentDepartment(result.before);
      await this.log(user, id, 'UPDATE', old, { ...result.set, ...(result.moved ? { Path: result.moved.to, MovedNodes: result.moved.nodes } : {}) });
    }
    return this.savedWithLines(user, id, result.lines);
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
      if (d.IsProductionWorkshop) await this.assertCanChangeLines(user, 'Giải thể bộ phận là chuyền may', d.Code);
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
    const line = !!before.IsProductionWorkshop;
    this.afterWrite();
    await this.log(user, id, 'DISSOLVE', { IsActive: true, IsProductionWorkshop: line }, { IsActive: false, DissolvedDate: date, Code: before.Code, IsProductionWorkshop: line });
    const state = (isActive: boolean) => ({ isProductionWorkshop: true, branchCode: before.BranchCode, isActive });
    return this.savedWithLines(user, id, line ? { departmentId: id, code: before.Code, operation: 'DISSOLVE', before: state(true), after: state(false) } : null);
  }

  /** Khôi phục phòng ban đã giải thể: cha (nếu có) phải đang dùng */
  async restore(user: AuthUser, id: number) {
    const scope = scopeOf(user);
    const before = await inTransaction(this.db, async (trx) => {
      await this.repo.lockTree(trx);
      const d = await this.repo.node(scope, id, 'update', trx);
      if (d.IsActive) throw Errors.conflict(`${label(d)} đang dùng.`);
      if (d.IsProductionWorkshop) await this.assertCanChangeLines(user, 'Khôi phục bộ phận là chuyền may', d.Code);
      if (d.ParentId) {
        const p = await this.repo.node(scope, d.ParentId, 'view', trx);
        if (!p.IsActive) throw invalid(`Phòng ban cha ${label(p)} đã giải thể: khôi phục phòng ban cha trước.`);
      }
      await this.repo.updateNode(scope, id, { IsActive: true, DissolvedDate: null }, trx);
      return d;
    });
    const line = !!before.IsProductionWorkshop;
    this.afterWrite();
    await this.log(user, id, 'RESTORE', { IsActive: false, DissolvedDate: day(before.DissolvedDate), IsProductionWorkshop: line }, { IsActive: true, Code: before.Code, IsProductionWorkshop: line });
    const state = (isActive: boolean) => ({ isProductionWorkshop: true, branchCode: before.BranchCode, isActive });
    return this.savedWithLines(user, id, line ? { departmentId: id, code: before.Code, operation: 'RESTORE', before: state(false), after: state(true) } : null);
  }
}
