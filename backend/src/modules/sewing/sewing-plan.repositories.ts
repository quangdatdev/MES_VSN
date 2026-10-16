import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { AppException } from '../../common/app.exception';
import { BaseRepository, ChildRepository, type DataAction, type Scope } from '../../platform/data/base.repository';
import { ResourceRegistry } from '../../platform/data/resource-registry';
import { SEWING_DB } from './sewing.db';
import type { Row, SewingDayPlanItemTable, SewingDayPlanTable, SewingDb } from './sewing.types';

export type SewingDayPlanRow = Row<SewingDayPlanTable>;
export type SewingDayPlanItemRow = Row<SewingDayPlanItemTable>;

/** Số tổng của một dòng dàn chuyền ở Kế hoạch may (cộng các ngày), theo Id + thời điểm tạo của dòng nguồn */
export interface DayPlanTotal {
  branchCode: string;
  lineId: number;
  createdAt: Date;
  /** Tổng Kế hoạch ngày xưởng giao các ngày trước ngày đang xem */
  before: number;
  /** Tổng các ngày sau ngày đang xem (đã lập trước) */
  after: number;
  /** Có ngày nào đã nhập số (linemap hoặc ngày xưởng giao) */
  hasEntries: boolean;
}

/** Thời gian chờ khóa của câu tra khi Xếp chuyền hỏi trong transaction đang giữ khóa của nó (như module Cắt) */
const QUICK_LOCK_MS = 3000;
/** Số Id mỗi câu (giới hạn 2.100 tham số của SQL Server) */
const CHUNK = 500;

/** Hai thời điểm là một (driver gửi Date theo kiểu datetime cũ, lệch vài mili giây so với DATETIME2(3)), như SewingPrep */
export const sameInstant = (a: Date, b: Date) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 5;

/**
 * Khóa ứng dụng trong transaction: hai lần ghi cùng ĐVCS xếp hàng. Không có khóa phạm vi trên bảng nên phiên đọc không bị chặn. Chờ
 * tối đa 10 giây, dưới thời gian chờ câu lệnh 15 giây của driver: hết giờ thì 409, không thành 500 (review 5.16 L7).
 */
export async function appLock(trx: Kysely<any>, resource: string, busy: string) {
  const r = await sql<{ r: number }>`DECLARE @r INT; EXEC @r = sp_getapplock @Resource = ${resource}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000; SELECT @r AS r`.execute(trx);
  if ((r.rows[0]?.r ?? -1) < 0) throw new AppException('CONFLICT', busy, 409);
}

/**
 * Kế hoạch may (sewing.plan, quyết định 14.1): một chuyền trong một ngày, giữ trạng thái chốt. Lọc ĐVCS và phạm vi chuyền (LINE →
 * LineCode) qua BaseRepository.
 */
@Injectable()
export class SewingDayPlanRepository extends BaseRepository<SewingDayPlanRow> {
  protected readonly table = 'SewingDayPlan';
  protected readonly resource = 'sewing.plan';
  protected readonly sortable = ['Id', 'PlanDate', 'LineCode'];
  protected readonly defaultSort = 'LineCode:asc';

  constructor(@Inject(SEWING_DB) db: SewingDb, registry: ResourceRegistry) {
    super(db, registry);
  }

  /** Bản ghi chuyền × ngày của các chuyền trong một ngày, trong phạm vi của hành động */
  async ofDay(scope: Scope, date: string, lineCodes: string[], action: DataAction = 'view', db: Kysely<any> = this.db): Promise<SewingDayPlanRow[]> {
    const out: SewingDayPlanRow[] = [];
    const codes = [...new Set(lineCodes)];
    for (let i = 0; i < codes.length; i += 200) {
      const chunk = codes.slice(i, i + 200);
      const page = await this.list(scope, { page: 1, pageSize: 200, sort: 'LineCode:asc', where: (qb) => qb.where('PlanDate', '=', date).where('LineCode', 'in', chunk) }, action, db);
      out.push(...page.items);
    }
    return out;
  }

  /**
   * Số tổng các ngày khác ngày đang xem của các dòng dàn chuyền (Đã giao, kiểm không giao vượt). Chỉ lọc ĐVCS, không theo phạm vi
   * chuyền: số kiểm ràng buộc, không trả dòng nào (như tổng dàn chuyền của Xếp chuyền). Dòng nguồn khớp theo Id + thời điểm tạo.
   */
  async totals(scope: Scope, lines: { branchCode: string; id: number; createdAt: Date }[], date: string, db: Kysely<any> = this.db): Promise<DayPlanTotal[]> {
    const ids = [...new Set(lines.map((l) => l.id))];
    const out: DayPlanTotal[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      let qb: any = db
        .selectFrom('SewingDayPlanItem as i')
        .innerJoin('SewingDayPlan as h', (j) => j.onRef('h.Id', '=', 'i.SewingDayPlanId').onRef('h.BranchCode', '=', 'i.BranchCode'))
        .select([
          'i.BranchCode',
          'i.ShipmentPlanLineId',
          'i.SourceCreatedAt',
          sql<number>`SUM(CASE WHEN h.PlanDate < CAST(${date} AS DATE) THEN COALESCE(i.DayQty, 0) ELSE 0 END)`.as('Before'),
          sql<number>`SUM(CASE WHEN h.PlanDate > CAST(${date} AS DATE) THEN COALESCE(i.DayQty, 0) ELSE 0 END)`.as('After'),
          sql<number>`MAX(CASE WHEN COALESCE(i.DayQty, 0) > 0 OR COALESCE(i.LinemapQty, 0) > 0 THEN 1 ELSE 0 END)`.as('HasEntries'),
        ])
        .where('i.ShipmentPlanLineId', 'in', ids.slice(i, i + CHUNK))
        .groupBy(['i.BranchCode', 'i.ShipmentPlanLineId', 'i.SourceCreatedAt']);
      qb = await this.branchOnly(qb, scope, 'i');
      for (const r of (await qb.execute()) as { BranchCode: string; ShipmentPlanLineId: number; SourceCreatedAt: Date; Before: number; After: number; HasEntries: number }[]) {
        out.push({ branchCode: r.BranchCode, lineId: r.ShipmentPlanLineId, createdAt: r.SourceCreatedAt, before: Number(r.Before), after: Number(r.After), hasEntries: Number(r.HasEntries) === 1 });
      }
    }
    return out.filter((t) => lines.some((l) => l.id === t.lineId && l.branchCode === t.branchCode && sameInstant(l.createdAt, t.createdAt)));
  }

  /**
   * Số đã lập mọi ngày của các dòng dàn chuyền một ĐVCS, cho Xếp chuyền (LineDayPlanGuards, quyết định 14.2). Việc của hệ thống: ĐVCS do
   * module Đơn hàng truyền từ kế hoạch đang lưu, không theo phạm vi người xem, chỉ trả số tổng. Chỉ chờ khóa dòng QUICK_LOCK_MS: Xếp chuyền
   * hỏi trong transaction đang giữ khóa của nó; hết giờ thì lỗi, Xếp chuyền trả 409 và nhả khóa. LOCK_TIMEOUT là thiết lập của kết
   * nối: đặt lại trước khi trả kết nối về pool.
   */
  usageQuick(branchCode: string, lines: { id: number; createdAt: Date }[]): Promise<{ lineId: number; deliveredQty: number; hasEntries: boolean }[]> {
    return this.db.connection().execute(async (conn) => {
      await sql`SET LOCK_TIMEOUT ${sql.raw(String(QUICK_LOCK_MS))}`.execute(conn);
      try {
        const ids = [...new Set(lines.map((l) => l.id))];
        const out: { lineId: number; deliveredQty: number; hasEntries: boolean }[] = [];
        for (let i = 0; i < ids.length; i += CHUNK) {
          const rows = await conn
            .selectFrom('SewingDayPlanItem')
            .select([
              'ShipmentPlanLineId',
              'SourceCreatedAt',
              sql<number>`SUM(COALESCE(DayQty, 0))`.as('Qty'),
              sql<number>`MAX(CASE WHEN COALESCE(DayQty, 0) > 0 OR COALESCE(LinemapQty, 0) > 0 THEN 1 ELSE 0 END)`.as('HasEntries'),
            ])
            .where('BranchCode', '=', branchCode)
            .where('ShipmentPlanLineId', 'in', ids.slice(i, i + CHUNK))
            .groupBy(['ShipmentPlanLineId', 'SourceCreatedAt'])
            .execute();
          for (const r of rows) {
            if (lines.some((l) => l.id === r.ShipmentPlanLineId && sameInstant(l.createdAt, r.SourceCreatedAt))) {
              out.push({ lineId: r.ShipmentPlanLineId, deliveredQty: Number(r.Qty), hasEntries: Number(r.HasEntries) === 1 });
            }
          }
        }
        return out;
      } finally {
        await sql`SET LOCK_TIMEOUT -1`.execute(conn).catch(() => undefined);
      }
    });
  }
}

/** Dòng dàn chuyền trong ngày của một chuyền: bảng con, phạm vi theo dòng cha (ĐVCS, chuyền). */
@Injectable()
export class SewingDayPlanItemRepository extends ChildRepository<SewingDayPlanItemRow> {
  protected readonly table = 'SewingDayPlanItem';
  protected readonly parentKey = 'SewingDayPlanId';

  constructor(@Inject(SEWING_DB) db: SewingDb, parent: SewingDayPlanRepository) {
    super(db, parent);
  }
}
