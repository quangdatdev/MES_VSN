import { Inject, Injectable } from '@nestjs/common';
import { sql, type Expression, type ExpressionBuilder, type Insertable, type SqlBool, type Updateable } from 'kysely';
import { Errors } from '../../common/app.exception';
import { BaseRepository, type Page, type Scope } from '../../platform/data/base.repository';
import { ResourceRegistry } from '../../platform/data/resource-registry';
import { HR_DB } from './hr.db';
import type { DepartmentTable, DepartmentTypeTable, EmployeeTable, HrDb, JobTitleTable, Row } from './hr.types';

export type DepartmentRow = Row<DepartmentTable>;
export type DepartmentTypeRow = Row<DepartmentTypeTable>;
export type JobTitleRow = Row<JobTitleTable>;
export type EmployeeRow = Row<EmployeeTable>;

/** Phòng ban kèm loại, người quản lý và số nhân viên đang làm (trực tiếp trong phòng ban) */
export type DepartmentNodeRow = DepartmentRow & {
  TypeCode: string;
  TypeName: string;
  LevelOrder: number;
  IsFinalLevel: boolean;
  ManagerCode: string | null;
  ManagerName: string | null;
  ActiveEmployees: number;
};

export type EmployeeListRow = EmployeeRow & { DepartmentCode: string; DepartmentName: string; JobTitleCode: string; JobTitleName: string };

/** Điều kiện "nằm trong nhánh có Path này" (kể cả chính nút): LEFT/RIGHT thay cho LIKE để mã không bị hiểu thành ký tự đại diện */
const underPath = (column: string, path: string) => sql<SqlBool>`LEFT(${sql.ref(column)}, ${path.length}) = ${path}`;

/**
 * Chữ tìm không phân biệt dấu, hoa thường, kể cả "đ" (collation AI không coi đ là d). Cột và chữ gõ cùng đổi đ → d rồi so
 * theo Latin1_General_100_CI_AI (bảng trọng số mới, đủ chữ tiếng Việt hai dấu). Không dùng chỉ mục: danh sách nhân viên một công ty vài nghìn dòng, quét được.
 */
export function foldedLike(column: Expression<unknown>, text: string) {
  const like = `%${text.trim().replace(/[đĐ]/g, 'd').replace(/[%_[]/g, (c) => `[${c}]`)}%`;
  return sql<SqlBool>`REPLACE(REPLACE(${column}, N'đ', N'd'), N'Đ', N'D') COLLATE Latin1_General_100_CI_AI LIKE ${like} COLLATE Latin1_General_100_CI_AI`;
}

// ---------- Phòng ban (hr.orgchart): dùng chung toàn công ty ----------

/**
 * Cây phòng ban (ADR 0012 mục 3). Đọc, ghi qua BaseRepository (tài nguyên hr.orgchart, SHARED): không có quyền thì không thấy gì.
 * Thêm, sửa không dùng create/update của nền tảng:
 * - bảng có trigger nên không INSERT ... OUTPUT được (thêm rồi đọc lại theo mã);
 * - BranchCode ở đây là thuộc tính "phòng ban của nhà máy nào", không phải cột phạm vi mà nền tảng tự đặt hoặc bỏ đi.
 * Service quyết định đúng các cột được ghi, không chuyển thẳng dữ liệu client gửi xuống.
 */
@Injectable()
export class DepartmentRepository extends BaseRepository<DepartmentRow> {
  protected readonly table = 'Department';
  protected readonly resource = 'hr.orgchart';

  constructor(@Inject(HR_DB) db: HrDb, registry: ResourceRegistry) {
    super(db, registry);
  }

  private nodes(db: HrDb) {
    return db
      .selectFrom('Department as d')
      .innerJoin('DepartmentType as t', 't.Id', 'd.DepartmentTypeId')
      .leftJoin('Employee as m', 'm.Id', 'd.ManagerEmployeeId')
      .selectAll('d')
      .select([
        't.Code as TypeCode',
        't.Name as TypeName',
        't.LevelOrder',
        't.IsFinalLevel',
        'm.Code as ManagerCode',
        'm.FullName as ManagerName',
        (eb) => eb.selectFrom('Employee as e').select(sql<number>`COUNT(*)`.as('n')).whereRef('e.DepartmentId', '=', 'd.Id').where('e.EmploymentStatus', '=', 1).as('ActiveEmployees'),
      ]);
  }

  /** Cả cây (phẳng, kèm ParentId); màn hình tự dựng cây. Thứ tự: cấp của loại, thứ tự, tên. */
  async tree(scope: Scope, includeDissolved: boolean): Promise<DepartmentNodeRow[]> {
    let qb = this.nodes(this.db as HrDb);
    if (!includeDissolved) qb = qb.where('d.IsActive', '=', true);
    qb = await this.scoped(qb, scope, 'view', 'd');
    return (await qb.orderBy('t.LevelOrder').orderBy('d.SortOrder').orderBy('d.Name').orderBy('d.Id').execute()) as DepartmentNodeRow[];
  }

  async node(scope: Scope, id: number, action: 'view' | 'update' = 'view', db: HrDb = this.db as HrDb): Promise<DepartmentNodeRow> {
    const qb = await this.scoped(this.nodes(db).where('d.Id', '=', id), scope, action, 'd');
    const row = await qb.executeTakeFirst();
    if (!row) throw Errors.notFound('Không tìm thấy phòng ban.');
    return row as DepartmentNodeRow;
  }

  /**
   * Phòng ban đang dùng cho ô chọn ở màn Thông tin nhân sự và để dò phòng ban khi nhập từ Excel. Cấu trúc cây là danh mục để
   * chọn, không theo quyền hr.orgchart (người chỉ có quyền Thông tin nhân sự vẫn chọn được phòng ban); quyền kiểm ở controller.
   */
  async pickList(db: HrDb = this.db as HrDb) {
    return db
      .selectFrom('Department as d')
      .innerJoin('DepartmentType as t', 't.Id', 'd.DepartmentTypeId')
      .select(['d.Id', 'd.Code', 'd.Name', 'd.ParentId', 'd.Path', 'd.IsActive', 't.LevelOrder', 'd.SortOrder'])
      .orderBy('t.LevelOrder')
      .orderBy('d.SortOrder')
      .orderBy('d.Name')
      .orderBy('d.Id')
      .execute();
  }

  /** Mã đã dùng chưa (kể cả phòng ban đã giải thể): mã duy nhất toàn bảng */
  async codeTaken(code: string, db: HrDb = this.db as HrDb): Promise<boolean> {
    return !!(await db.selectFrom('Department').select('Id').where('Code', '=', code).executeTakeFirst());
  }

  /** Thêm một phòng ban, trả Id. Có trigger nên không dùng OUTPUT: thêm rồi đọc lại theo mã (duy nhất). */
  async insertNode(scope: Scope, values: Omit<Insertable<DepartmentTable>, 'Id' | 'CreatedAt' | 'ModifiedAt' | 'ModifiedBy' | 'CreatedBy'>, db: HrDb): Promise<number> {
    await this.assertWritable(scope);
    if (this.grantsFor(scope, 'create').length === 0) throw Errors.scopeDenied();
    await db.insertInto('Department').values({ ...values, CreatedBy: scope.userId }).execute();
    return (await db.selectFrom('Department').select('Id').where('Code', '=', values.Code).executeTakeFirstOrThrow()).Id;
  }

  /** Sửa các cột service đã chọn của một phòng ban (không gồm Code, Path, ParentId: đổi cha dùng moveSubtree). */
  async updateNode(
    scope: Scope,
    id: number,
    set: Pick<Updateable<DepartmentTable>, 'Name' | 'NameEn' | 'DepartmentTypeId' | 'ManagerEmployeeId' | 'BranchCode' | 'EstablishedDate' | 'DissolvedDate' | 'SortOrder' | 'IsActive' | 'IsProductionWorkshop'>,
    db: HrDb,
  ): Promise<void> {
    await this.assertWritable(scope);
    const qb = await this.scoped(db.updateTable('Department').set({ ...set, ModifiedAt: new Date(), ModifiedBy: scope.userId }).where('Id', '=', id), scope, 'update');
    const res = await qb.executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) throw Errors.notFound('Không tìm thấy phòng ban.');
  }

  /**
   * Chuyển phòng ban (cả nhánh) sang cha mới: một câu UPDATE đổi Path của mọi nút trong nhánh và ParentId của chính nút, để
   * trigger kiểm Path thấy cây đã khớp sau câu lệnh.
   */
  async moveSubtree(scope: Scope, id: number, oldPath: string, newPath: string, parentId: number | null, db: HrDb): Promise<number> {
    await this.assertWritable(scope);
    const qb = await this.scoped(
      db
        .updateTable('Department')
        .set({
          Path: sql<string>`${newPath} + SUBSTRING(Path, ${oldPath.length + 1}, 400)`,
          ParentId: sql<number | null>`CASE WHEN Id = ${id} THEN ${parentId} ELSE ParentId END`,
          ModifiedAt: sql<Date>`CASE WHEN Id = ${id} THEN SYSUTCDATETIME() ELSE ModifiedAt END`,
          ModifiedBy: sql<number | null>`CASE WHEN Id = ${id} THEN ${scope.userId} ELSE ModifiedBy END`,
        })
        .where(underPath('Path', oldPath)),
      scope,
      'update',
    );
    return Number((await qb.executeTakeFirst()).numUpdatedRows);
  }

  /** Path dài nhất trong nhánh: chuyển nhánh sang cha có Path dài hơn thì Path mới không được vượt 400 ký tự */
  async longestPathUnder(path: string, db: HrDb = this.db as HrDb): Promise<number> {
    const r = await db.selectFrom('Department').select(sql<number>`MAX(LEN(Path))`.as('n')).where(underPath('Path', path)).executeTakeFirst();
    return Number(r?.n ?? 0);
  }

  async activeChildren(id: number, db: HrDb = this.db as HrDb): Promise<number> {
    const r = await db.selectFrom('Department').select(sql<number>`COUNT(*)`.as('n')).where('ParentId', '=', id).where('IsActive', '=', true).executeTakeFirstOrThrow();
    return Number(r.n);
  }

  async anyChildren(id: number, db: HrDb = this.db as HrDb): Promise<boolean> {
    return !!(await db.selectFrom('Department').select('Id').where('ParentId', '=', id).executeTakeFirst());
  }

  /**
   * Thay đổi cấu trúc cây (thêm, chuyển, giải thể, khôi phục) chạy nối tiếp: kiểm "cha đang dùng", "không còn con đang dùng" trong
   * transaction, nên hai người cùng thao tác không lách qua được.
   */
  async lockTree(db: HrDb): Promise<void> {
    const r = await sql<{ r: number }>`DECLARE @r INT; EXEC @r = sp_getapplock @Resource = 'MES_Hr.Department', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000; SELECT @r AS r`.execute(db);
    if ((r.rows[0]?.r ?? -1) < 0) throw Errors.conflict('Có người khác đang sửa sơ đồ tổ chức, thử lại sau.');
  }

  /**
   * Khóa chung trên cây cho lần ghi hồ sơ nhân viên (review 5.8 M1): nhiều người ghi nhân viên cùng lúc không chặn nhau, nhưng giải
   * thể, chuyển nhánh (khóa riêng) phải chờ. Nhờ vậy không có nhân viên đang làm lọt vào phòng ban vừa giải thể.
   */
  async lockTreeShared(db: HrDb): Promise<void> {
    const r = await sql<{ r: number }>`DECLARE @r INT; EXEC @r = sp_getapplock @Resource = 'MES_Hr.Department', @LockMode = 'Shared', @LockOwner = 'Transaction', @LockTimeout = 10000; SELECT @r AS r`.execute(db);
    if ((r.rows[0]?.r ?? -1) < 0) throw Errors.conflict('Có người khác đang sửa sơ đồ tổ chức, thử lại sau vài giây.');
  }

  /** Path của một phòng ban (lọc nhân viên cả nhánh), không nạp cả cây */
  async pathOf(id: number): Promise<string | null> {
    return (await (this.db as HrDb).selectFrom('Department').select('Path').where('Id', '=', id).executeTakeFirst())?.Path ?? null;
  }

  /** Phòng ban theo Id (đọc lại trong khóa khi ghi hồ sơ nhân viên) */
  async byIds(ids: number[], db: HrDb = this.db as HrDb) {
    if (!ids.length) return [];
    return db.selectFrom('Department').select(['Id', 'Code', 'Name', 'Path', 'IsActive']).where('Id', 'in', ids).execute();
  }
}

// ---------- Nhân viên (hr.employee): dùng chung toàn công ty ----------

export interface EmployeeFilter {
  q?: string;
  /** Path của phòng ban đang chọn: lấy cả nhánh con */
  departmentPath?: string;
  jobTitleId?: number;
  status?: number;
  /** Cột không được tìm theo (người dùng không được xem nguyên giá trị) */
  blind?: Set<string>;
}

@Injectable()
export class EmployeeRepository extends BaseRepository<EmployeeRow> {
  protected readonly table = 'Employee';
  protected readonly resource = 'hr.employee';
  protected readonly sortable = ['Id', 'Code', 'FullName', 'CreatedAt'];
  protected readonly defaultSort = 'Id:desc';

  constructor(@Inject(HR_DB) db: HrDb, registry: ResourceRegistry) {
    super(db, registry);
  }

  /** Điều kiện của bộ lọc màn hình (phòng ban gồm nhánh con, chức danh, tình trạng, chữ tìm) */
  private where(f: EmployeeFilter) {
    return <Q extends { where: (...a: any[]) => Q }>(qb: Q): Q => {
      if (f.departmentPath) {
        const path = f.departmentPath;
        qb = qb.where((eb: ExpressionBuilder<any, any>) => eb('Employee.DepartmentId', 'in', eb.selectFrom('Department').select('Department.Id').where(underPath('Department.Path', path))));
      }
      if (f.jobTitleId) qb = qb.where('Employee.JobTitleId', '=', f.jobTitleId);
      if (f.status) qb = qb.where('Employee.EmploymentStatus', '=', f.status);
      const text = f.q?.trim();
      if (text) {
        const cols = ['Code', 'TimekeepingCode', 'FullName', 'FullNameEn', 'Email'].filter((c) => !f.blind?.has(c));
        qb = qb.where((eb: ExpressionBuilder<any, any>) =>
          eb.or([
            ...cols.map((c) => foldedLike(sql.ref(`Employee.${c}`), text)),
            eb.exists(eb.selectFrom('JobTitle').select('JobTitle.Id').whereRef('JobTitle.Id', '=', 'Employee.JobTitleId').where(foldedLike(sql.ref('JobTitle.Name'), text))),
          ]),
        );
      }
      return qb;
    };
  }

  private names(eb: ExpressionBuilder<any, any>) {
    return [
      eb.selectFrom('Department').select('Department.Code').whereRef('Department.Id', '=', 'Employee.DepartmentId').as('DepartmentCode'),
      eb.selectFrom('Department').select('Department.Name').whereRef('Department.Id', '=', 'Employee.DepartmentId').as('DepartmentName'),
      eb.selectFrom('JobTitle').select('JobTitle.Code').whereRef('JobTitle.Id', '=', 'Employee.JobTitleId').as('JobTitleCode'),
      eb.selectFrom('JobTitle').select('JobTitle.Name').whereRef('JobTitle.Id', '=', 'Employee.JobTitleId').as('JobTitleName'),
    ];
  }

  page(scope: Scope, f: EmployeeFilter, page: number, pageSize: number): Promise<Page<EmployeeListRow>> {
    return this.list(scope, { page, pageSize, where: this.where(f), select: (eb) => this.names(eb) }) as Promise<Page<EmployeeListRow>>;
  }

  /** Mọi dòng khớp bộ lọc, cho xuất file (quyền export) */
  all(scope: Scope, f: EmployeeFilter): Promise<EmployeeListRow[]> {
    return this.listAll(scope, { where: this.where(f), select: (eb) => this.names(eb) }) as Promise<EmployeeListRow[]>;
  }

  async detail(scope: Scope, id: number): Promise<EmployeeListRow> {
    const qb = await this.scoped(this.db.selectFrom('Employee').selectAll('Employee').select((eb) => this.names(eb)).where('Employee.Id', '=', id), scope, 'view');
    const row = await qb.executeTakeFirst();
    if (!row) throw Errors.notFound('Không tìm thấy nhân viên.');
    return row as EmployeeListRow;
  }

  /**
   * Nhân viên đang làm khớp mã hoặc tên, cho ô Người quản lý ở Sơ đồ tổ chức (tối đa `limit`, tìm trên máy chủ). Theo quyền xem
   * hồ sơ nhân viên. `selected`: nhân viên đang chọn luôn có trong kết quả (kể cả đã nghỉ) để ô hiện đúng tên.
   */
  async pick(scope: Scope, q: string | undefined, selected: number | undefined, limit = 20) {
    const columns = ['Employee.Id', 'Employee.Code', 'Employee.FullName', 'Employee.EmploymentStatus'] as const;
    const withDept = (eb: ExpressionBuilder<any, any>) => eb.selectFrom('Department').select('Department.Name').whereRef('Department.Id', '=', 'Employee.DepartmentId').as('DepartmentName');
    let qb = this.db.selectFrom('Employee').select(columns).select(withDept).where('Employee.EmploymentStatus', '=', 1);
    const text = q?.trim();
    if (text) qb = qb.where((eb) => eb.or([foldedLike(sql.ref('Employee.Code'), text), foldedLike(sql.ref('Employee.FullName'), text)]));
    const rows = await (await this.scoped(qb, scope, 'view')).orderBy('Employee.FullName').orderBy('Employee.Id').offset(0).fetch(limit).execute();
    if (selected && !rows.some((r) => r.Id === selected)) {
      const own = await (await this.scoped(this.db.selectFrom('Employee').select(columns).select(withDept).where('Employee.Id', '=', selected), scope, 'view')).executeTakeFirst();
      if (own) rows.unshift(own);
    }
    return rows;
  }

  /** Nhân viên đang làm (để kiểm người quản lý phòng ban). Không theo quyền: chỉ trả có hay không. */
  async isActiveEmployee(id: number, db: HrDb = this.db as HrDb): Promise<boolean> {
    return !!(await db.selectFrom('Employee').select('Id').where('Id', '=', id).where('EmploymentStatus', '=', 1).executeTakeFirst());
  }

  async activeIn(departmentId: number, db: HrDb = this.db as HrDb): Promise<number> {
    const r = await db.selectFrom('Employee').select(sql<number>`COUNT(*)`.as('n')).where('DepartmentId', '=', departmentId).where('EmploymentStatus', '=', 1).executeTakeFirstOrThrow();
    return Number(r.n);
  }

  /**
   * Mã nhân viên, mã chấm công đã dùng (trong `codes`), trừ nhân viên `exceptId`. Mã chấm công so với cả hai cột: máy chấm công
   * nhận một mã, mã chấm công trống thì lấy theo mã nhân viên.
   */
  async takenCodes(codes: string[], exceptId?: number, db: HrDb = this.db as HrDb): Promise<{ code: Set<string>; timekeeping: Set<string> }> {
    const out = { code: new Set<string>(), timekeeping: new Set<string>() };
    const unique = [...new Set(codes.filter(Boolean))];
    for (let i = 0; i < unique.length; i += 500) {
      const chunk = unique.slice(i, i + 500);
      let qb = db.selectFrom('Employee').select(['Id', 'Code', 'TimekeepingCode']).where((eb) => eb.or([eb('Code', 'in', chunk), eb('TimekeepingCode', 'in', chunk)]));
      if (exceptId) qb = qb.where('Id', '<>', exceptId);
      for (const r of await qb.execute()) {
        out.code.add(r.Code.toUpperCase());
        if (r.TimekeepingCode) out.timekeeping.add(r.TimekeepingCode.toUpperCase());
      }
    }
    return out;
  }
}

// ---------- Danh mục của module: loại phòng ban, chức danh ----------
// Dùng chung toàn công ty, không có cột nhà máy nên không qua BaseRepository (như các danh mục khác: PrepStep, SysCatalogItem).
// Quyền kiểm ở controller: loại phòng ban sửa ở Quản trị › Danh mục hệ thống (admin.catalog); chức danh chưa có màn sửa.

export type DepartmentTypeUsageRow = DepartmentTypeRow & { DepartmentCount: number };

@Injectable()
export class HrCatalogRepository {
  constructor(@Inject(HR_DB) private readonly db: HrDb) {}

  types(db: HrDb = this.db): Promise<DepartmentTypeRow[]> {
    return db.selectFrom('DepartmentType').selectAll().orderBy('LevelOrder').orderBy('SortOrder').orderBy('Id').execute() as Promise<DepartmentTypeRow[]>;
  }

  async type(id: number, db: HrDb = this.db): Promise<DepartmentTypeRow | undefined> {
    return (await db.selectFrom('DepartmentType').selectAll().where('Id', '=', id).executeTakeFirst()) as DepartmentTypeRow | undefined;
  }

  /** Loại kèm số phòng ban đang dùng loại đó (chưa giải thể); có id thì chỉ một loại */
  typesWithUsage(id?: number, db: HrDb = this.db): Promise<DepartmentTypeUsageRow[]> {
    let qb = db
      .selectFrom('DepartmentType as t')
      .selectAll('t')
      .select((eb) =>
        eb.selectFrom('Department as d').select(sql<number>`COUNT(*)`.as('n')).whereRef('d.DepartmentTypeId', '=', 't.Id').where('d.IsActive', '=', true).as('DepartmentCount'),
      );
    if (id !== undefined) qb = qb.where('t.Id', '=', id);
    return qb.orderBy('t.LevelOrder').orderBy('t.SortOrder').orderBy('t.Id').execute() as Promise<DepartmentTypeUsageRow[]>;
  }

  /** Bảng có trigger nên không INSERT ... OUTPUT được: thêm rồi đọc lại theo mã */
  async insertType(values: Insertable<DepartmentTypeTable>, db: HrDb): Promise<DepartmentTypeRow> {
    await db.insertInto('DepartmentType').values(values).execute();
    return (await db.selectFrom('DepartmentType').selectAll().where('Code', '=', values.Code).executeTakeFirstOrThrow()) as DepartmentTypeRow;
  }

  async updateType(
    id: number,
    set: Pick<Updateable<DepartmentTypeTable>, 'Name' | 'Description' | 'LevelOrder' | 'IsFinalLevel' | 'SortOrder' | 'IsActive'>,
    userId: number,
    db: HrDb,
  ): Promise<DepartmentTypeRow> {
    await db.updateTable('DepartmentType').set({ ...set, ModifiedAt: new Date(), ModifiedBy: userId }).where('Id', '=', id).execute();
    return (await this.type(id, db))!;
  }

  /**
   * Phòng ban thuộc loại này đang có phòng ban con, tính cả dòng đã giải thể: khôi phục không kiểm lại cấp cuối, nên loại
   * thành cấp cuối khi còn con đã giải thể thì khôi phục con sẽ phá luật (cùng luật anyChildren khi đổi loại một phòng ban).
   */
  parentsOfType(typeId: number, db: HrDb): Promise<{ Code: string; Name: string }[]> {
    return db
      .selectFrom('Department as p')
      .select(['p.Code', 'p.Name'])
      .where('p.DepartmentTypeId', '=', typeId)
      .where((eb) => eb.exists(eb.selectFrom('Department as c').select('c.Id').whereRef('c.ParentId', '=', 'p.Id')))
      .orderBy('p.Path')
      .execute();
  }

  jobTitles(db: HrDb = this.db): Promise<JobTitleRow[]> {
    return db.selectFrom('JobTitle').selectAll().orderBy('SortOrder').orderBy('Name').orderBy('Id').execute() as Promise<JobTitleRow[]>;
  }

  async jobTitle(id: number, db: HrDb = this.db): Promise<JobTitleRow | undefined> {
    return (await db.selectFrom('JobTitle').selectAll().where('Id', '=', id).executeTakeFirst()) as JobTitleRow | undefined;
  }
}
