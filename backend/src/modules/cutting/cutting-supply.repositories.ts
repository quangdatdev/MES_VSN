import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type RawBuilder } from 'kysely';
import { AppException } from '../../common/app.exception';
import { BaseRepository, ChildRepository, type Scope } from '../../platform/data/base.repository';
import type { FilterSpec } from '../../platform/data/column-filter';
import { ResourceRegistry } from '../../platform/data/resource-registry';
import { CUTTING_DB } from './cutting.db';
import type { CuttingDb, CuttingSupplyLineTable, CuttingSupplyTable, Row } from './cutting.types';

export type CuttingSupplyRow = Row<CuttingSupplyTable>;
export type CuttingSupplyLineRow = Row<CuttingSupplyLineTable>;
/** Dòng lưới lệnh cấp: lệnh kèm tổng số cấp của lệnh */
export type CuttingSupplyListRow = CuttingSupplyRow & { DayQty: number };
/** Số đã cấp của một chuyền, màu, cỡ trong một Ngày cấp (cộng các dòng cùng khóa) */
export interface SuppliedRow {
  LineCode: string;
  ColorName: string;
  SizeName: string;
  SupplyDate: Date;
  Qty: number;
}

/** Tổng số cấp của lệnh (cột "Tổng SL cấp"); kèm BranchCode để dùng chỉ mục của bảng con */
const DAY_QTY = sql<number>`(SELECT COALESCE(SUM(CAST(l.Qty AS BIGINT)), 0) FROM dbo.CuttingSupplyLine l WHERE l.BranchCode = CuttingSupply.BranchCode AND l.CuttingSupplyId = CuttingSupply.Id)`;

/** Cột lọc được theo giá trị (popup lọc theo cột): trường JSON → biểu thức máy chủ dựng */
export const SUPPLY_FILTER: FilterSpec = {
  supplyNo: { expr: 'SupplyNo', kind: 'text' },
  supplyDate: { expr: 'SupplyDate', kind: 'date' },
  styleCode: { expr: 'StyleCode', kind: 'text' },
  branchCode: { expr: 'BranchCode', kind: 'text' },
  creatorName: { expr: 'CreatorName', kind: 'text' },
  confirmerName: { expr: 'ConfirmerName', kind: 'text' },
  note: { expr: 'Note', kind: 'text' },
  dayQty: { expr: DAY_QTY, kind: 'number' },
  statusCode: { expr: 'StatusCode', kind: 'text' },
  createdAt: { expr: 'CreatedAt', kind: 'datetime' },
};

/** Sắp xếp theo trường JSON của màn: danh sách trắng, không nhận tên cột từ client */
export const SUPPLY_SORT: Record<string, RawBuilder<unknown>> = {
  // Số lệnh theo năm rồi số thứ tự (chuỗi "NNN/ddMMyy/XBTP" so theo chữ thì sai thứ tự)
  supplyNo: sql`(CAST(CuttingSupply.SupplyYear AS BIGINT) * 100000000 + CuttingSupply.SupplySeq)`,
  supplyDate: sql`CuttingSupply.SupplyDate`,
  styleCode: sql`CuttingSupply.StyleCode`,
  branchCode: sql`CuttingSupply.BranchCode`,
  creatorName: sql`CuttingSupply.CreatorName`,
  confirmerName: sql`CuttingSupply.ConfirmerName`,
  note: sql`CuttingSupply.Note`,
  dayQty: DAY_QTY,
  statusCode: sql`CuttingSupply.StatusCode`,
  createdAt: sql`CuttingSupply.CreatedAt`,
};

export const supplyListColumns = () => [DAY_QTY.as('DayQty')];

/**
 * Khóa ứng dụng trong transaction đang mở (giữ tới commit, rollback). Hết thời gian chờ thì 409 (người dùng thử lại), transaction bỏ.
 * Tên khóa dựng từ ĐVCS của phiên và mã hàng (mã hàng client gửi chỉ dùng làm tên khóa, không đọc, ghi dữ liệu theo nó).
 */
async function appLock(trx: Kysely<any>, resource: string) {
  const r = await sql<{ r: number }>`DECLARE @r INT; EXEC @r = sp_getapplock @Resource = ${resource}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000; SELECT @r AS r`.execute(trx);
  if ((r.rows[0]?.r ?? -1) < 0) throw new AppException('CONFLICT', 'Đang có người lưu số cấp BTP của mã hàng này. Thử lại sau ít giây.', 409);
}

/** Thời gian chờ khóa (ms) của câu tra số đã cấp cho module Đơn hàng (review 5.15 M1) */
const QUICK_LOCK_MS = 3000;

// ---------- Xác nhận cấp BTP (cutting.supply): một lệnh mỗi ĐVCS, Ngày cấp, Mã hàng (quyết định 13.8) ----------

@Injectable()
export class CuttingSupplyRepository extends BaseRepository<CuttingSupplyRow> {
  protected readonly table = 'CuttingSupply';
  protected readonly resource = 'cutting.supply';
  protected readonly searchColumns = ['SupplyNo', 'StyleCode', 'CreatorName', 'ConfirmerName', 'Note'];
  protected readonly sortable = ['Id', 'CreatedAt'];
  protected readonly defaultSort = 'CreatedAt:desc';

  constructor(@Inject(CUTTING_DB) db: CuttingDb, registry: ResourceRegistry) {
    super(db, registry);
  }

  /**
   * Khóa ghi của các mã hàng trong ĐVCS (theo thứ tự, để hai lần lưu nhiều mã hàng không khóa chéo): lưu số cấp, xác nhận đọc số đã cấp
   * mọi ngày rồi mới ghi, hai người cùng mã hàng phải lần lượt để tổng không vượt (quyết định 3.10). Mã hàng so không phân biệt hoa thường.
   */
  async lockStyles(scope: Scope, styles: string[], trx: Kysely<any>) {
    await this.assertWritable(scope);
    const keys = [...new Set(styles.map((s) => s.trim().toUpperCase()))].sort();
    for (const s of keys) await appLock(trx, `MES_Cutting.CuttingSupply:${scope.branchCode}:${s}`);
  }

  /**
   * Số thứ tự kế tiếp của lệnh cấp trong ĐVCS và năm (quyết định 13.9). Giữ khóa ứng dụng tới hết transaction nên hai lần tạo không lấy
   * trùng số; đọc mọi lệnh của ĐVCS (kể cả ngoài phạm vi người lập), chỉ lấy số lớn nhất, không trả dòng nào.
   */
  async nextSeq(scope: Scope, year: number, trx: Kysely<any>): Promise<number> {
    await this.assertWritable(scope);
    await appLock(trx, `MES_Cutting.CuttingSupply.No:${scope.branchCode}`);
    const r = await trx
      .selectFrom('CuttingSupply')
      .select(sql<number>`COALESCE(MAX(SupplySeq), 0)`.as('n'))
      .where('BranchCode', '=', scope.branchCode)
      .where('SupplyYear', '=', year)
      .executeTakeFirst();
    return Number(r?.n ?? 0) + 1;
  }

  /** Lệnh của ĐVCS phiên ở một Ngày cấp cho các mã hàng (để gộp vào lệnh đã có, không tạo trùng); phạm vi xem của phiên */
  async ofDayStyles(scope: Scope, date: string, styles: string[], db: Kysely<any> = this.db): Promise<CuttingSupplyRow[]> {
    if (!styles.length) return [];
    const qb = await this.scoped(db.selectFrom('CuttingSupply').selectAll().where('SupplyDate', '=', date).where('StyleCode', 'in', [...new Set(styles)]), scope, 'view');
    return (await qb.execute()) as CuttingSupplyRow[];
  }

  /**
   * Số đã cấp theo chuyền, màu, cỡ, Ngày cấp của một mã hàng trong một ĐVCS (mọi lệnh), giới hạn chuyền nếu có. Số liệu kiểm ràng buộc,
   * tính Còn lại (như branchOnly): ĐVCS do service lấy từ phiên hoặc từ lệnh đã đọc trong phạm vi, chỉ trả số tổng.
   */
  async supplied(branchCode: string, styleCode: string, lineCodes?: string[], db: Kysely<any> = this.db): Promise<SuppliedRow[]> {
    if (lineCodes && !lineCodes.length) return [];
    let qb = db
      .selectFrom('CuttingSupplyLine as l')
      .innerJoin('CuttingSupply as s', (j) => j.onRef('s.Id', '=', 'l.CuttingSupplyId').onRef('s.BranchCode', '=', 'l.BranchCode'))
      .select(['l.LineCode', 'l.ColorName', 'l.SizeName', 's.SupplyDate', sql<number>`SUM(CAST(l.Qty AS BIGINT))`.as('Qty')])
      .where('s.BranchCode', '=', branchCode)
      .where('s.StyleCode', '=', styleCode)
      .groupBy(['l.LineCode', 'l.ColorName', 'l.SizeName', 's.SupplyDate']);
    if (lineCodes) qb = qb.where('l.LineCode', 'in', [...new Set(lineCodes)]);
    return ((await qb.execute()) as SuppliedRow[]).map((r) => ({ ...r, Qty: Number(r.Qty) }));
  }

  /**
   * Như `supplied` (mọi ngày cộng lại do bên gọi), nhưng chỉ chờ khóa dòng tối đa QUICK_LOCK_MS: dùng khi module Đơn hàng hỏi trong
   * transaction đang giữ khóa của nó (LineSupplyGuards). Hết giờ thì lỗi 1222, bên gọi trả 409 và nhả khóa; không dùng NOLOCK, READPAST
   * (đếm thiếu thì lọt giảm phần giao dưới số đã cấp). LOCK_TIMEOUT là thiết lập của kết nối: đặt lại trước khi trả kết nối về pool.
   */
  suppliedQuick(branchCode: string, styleCode: string, lineCodes: string[]): Promise<SuppliedRow[]> {
    return this.db.connection().execute(async (conn) => {
      await sql`SET LOCK_TIMEOUT ${sql.raw(String(QUICK_LOCK_MS))}`.execute(conn);
      try {
        return await this.supplied(branchCode, styleCode, lineCodes, conn);
      } finally {
        // Đặt lại lỗi thì không che lỗi gốc của câu tra; kết nối giữ 3 giây chờ khóa tới lần đặt lại sau (chỉ làm câu khác báo lỗi sớm)
        await sql`SET LOCK_TIMEOUT -1`.execute(conn).catch(() => undefined);
      }
    });
  }

  /**
   * Số lượng đồng bộ: Lũy kế cắt (Đồng bộ tiến độ cắt, mọi ngày) theo màu cỡ của mọi kế hoạch cùng mã hàng trong một ĐVCS, gồm kế hoạch
   * đã xóa mà còn số cắt (hàng đã cắt thật). Số tổng của hệ thống như `supplied`, đọc bảng của màn Đồng bộ tiến độ cắt cùng database.
   */
  async cutByStyle(branchCode: string, styleCodes: string[], db: Kysely<any> = this.db): Promise<{ StyleCode: string; ColorName: string; SizeName: string; Qty: number }[]> {
    if (!styleCodes.length) return [];
    const rows = await db
      .selectFrom('CuttingPlanDaily as d')
      .innerJoin('CuttingPlan as p', (j) => j.onRef('p.Id', '=', 'd.CuttingPlanId').onRef('p.BranchCode', '=', 'd.BranchCode'))
      .select(['p.StyleCode', 'd.ColorName', 'd.SizeName', sql<number>`SUM(CAST(d.Qty AS BIGINT))`.as('Qty')])
      .where('p.BranchCode', '=', branchCode)
      .where('p.StyleCode', 'in', [...new Set(styleCodes)])
      .groupBy(['p.StyleCode', 'd.ColorName', 'd.SizeName'])
      .execute();
    return rows.map((r) => ({ ...r, Qty: Number(r.Qty) }));
  }

  /**
   * Bỏ lệnh Chưa cấp không còn dòng nào (lần lưu đưa mọi ô của lệnh về 0): việc dọn của hệ thống sau khi ghi, không phải thao tác Xóa
   * của người dùng; chỉ lệnh của ĐVCS phiên trong `ids` (đã đọc trong phạm vi sửa).
   */
  async removeEmpty(scope: Scope, ids: number[], trx: Kysely<any>): Promise<number[]> {
    await this.assertWritable(scope);
    if (!ids.length) return [];
    const res = await sql<{ Id: number }>`DELETE s OUTPUT deleted.Id FROM dbo.CuttingSupply s
      WHERE s.BranchCode = ${scope.branchCode} AND s.StatusCode = 'PENDING' AND s.Id IN (${sql.join(ids)})
        AND NOT EXISTS (SELECT 1 FROM dbo.CuttingSupplyLine l WHERE l.CuttingSupplyId = s.Id AND l.BranchCode = s.BranchCode)`.execute(trx);
    return res.rows.map((r) => r.Id);
  }

  /** Lệnh trong phạm vi của hành động không (để giao diện ẩn nút): A00 không sửa, không xóa được gì. */
  async allowed(scope: Scope, id: number, action: 'update' | 'delete'): Promise<boolean> {
    if (scope.isAggregate) return false;
    return !!(await (await this.scopedIds(scope, action)).where('Id', '=', id).executeTakeFirst());
  }
}

/** Số cấp theo chuyền, màu, cỡ của lệnh, phạm vi theo lệnh */
@Injectable()
export class CuttingSupplyLineRepository extends ChildRepository<CuttingSupplyLineRow> {
  protected readonly table = 'CuttingSupplyLine';
  protected readonly parentKey = 'CuttingSupplyId';

  constructor(@Inject(CUTTING_DB) db: CuttingDb, parent: CuttingSupplyRepository) {
    super(db, parent);
  }
}
