import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { CompiledQuery, sql, type Compilable, type Kysely, type QueryResult } from 'kysely';
import { env } from '../../config/env';
import { factoryListFor } from '../../platform/catalog/factory-list';
import { createDb } from '../../platform/database/db';
import { inTransaction } from '../../platform/data/transaction';
import type { BuiltPo, ImportPlan, MesPo, MesState } from './bravo-order.mapping';
import type { OrderDatabase } from './order.types';

/** Số dòng mỗi câu theo số tham số một dòng: SQL Server giới hạn 2.100 tham số, 1.000 dòng VALUES mỗi câu */
const perBatch = (paramsPerRow: number) => Math.max(1, Math.min(1000, Math.floor(2000 / paramsPerRow)));
const chunks = <T>(rows: T[], size: number) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));
/** Số PO theo Id như BaseRepository.createNumbered: PO-<ĐVCS>-<Id 6 số>, Id hơn 6 số thì giữ nguyên */
const PO_NO = sql.raw(`CONCAT('PO-', BranchCode, '-', CASE WHEN Id > 999999 THEN CAST(Id AS VARCHAR(10)) ELSE RIGHT('000000' + CAST(Id AS VARCHAR(10)), 6) END)`);
const ORDER_BATCH = perBatch(20);
const PO_BATCH = perBatch(16);

/**
 * Chạy một câu ghi với DEADLOCK_PRIORITY LOW: khóa chéo với thao tác của người dùng thì SQL Server hủy bước nạp, không hủy
 * thao tác của người dùng. Mỗi câu đi qua sp_executesql nên SET đứng riêng hết tác dụng ngay khi câu đó xong (review 5.9.10
 * M4.1): gắn vào đầu từng câu.
 */
function low<R>(trx: Kysely<any>, query: Compilable<R> | CompiledQuery<R>): Promise<QueryResult<R>> {
  const c = 'compile' in query ? query.compile() : query;
  return trx.executeQuery(CompiledQuery.raw(`SET DEADLOCK_PRIORITY LOW; ${c.sql}`, [...c.parameters]) as CompiledQuery<R>);
}

/**
 * Khóa ứng dụng nối tiếp các lần nạp đơn hàng BRAVO: bước nạp tăng dần của backend và lệnh `load:bravo`. Chờ tối đa 10 giây:
 * lần nạp đang chạy lâu thì lần sau báo lỗi, bước nạp thử lại ở đợt sau.
 */
export async function lockBravoImport(trx: Kysely<any>) {
  const r = await sql<{ r: number }>`DECLARE @r INT; EXEC @r = sp_getapplock @Resource = 'MES_Order.BravoImport', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000; SELECT @r AS r`.execute(trx);
  if ((r.rows[0]?.r ?? -1) < 0) throw new Error('Đang có lần nạp đơn hàng BRAVO khác chạy, thử lại sau.');
}

export interface AppliedImport {
  newOrders: number;
  updatedOrders: number;
  /** Đơn chỉ được ghi dấu nội dung làm mốc (đơn nạp trước migration 0006 mà người dùng đã sửa) */
  baselined: number;
  newPos: number;
  updatedPos: number;
  cellUpdates: number;
  /** Id PO giữ màu cỡ của MES dù BRAVO đổi (đã xác nhận, đã vào kế hoạch, đã sửa tay) */
  cellsKept: number[];
  /** Đơn mới theo ĐVCS */
  newByBranch: Record<string, number>;
}

/**
 * Ghi đơn hàng nạp từ BRAVO vào MES_Order. Việc của hệ thống, không theo phiên người dùng: ghi mọi ĐVCS, BranchCode lấy từ
 * dữ liệu BRAVO (chi nhánh nhận đơn) hoặc từ đơn đã có, không từ client; CreatedBy để trống (đơn của hệ thống nguồn). Như
 * SewingPrepRepository (ADR 0009), không đi qua BaseRepository vì không có phạm vi phiên; người dùng xem, sửa qua repository
 * của màn hình như mọi đơn khác. Không xóa dòng nào.
 * Kết nối riêng (một kết nối, câu dài tới 2 phút) để không chiếm pool của màn hình.
 */
@Injectable()
export class BravoOrderImportRepository implements OnApplicationShutdown {
  private readonly db = createDb<OrderDatabase>(env.db.orderName, { poolMax: 1, requestTimeoutMs: 120_000 });

  async onApplicationShutdown() {
    await this.db.destroy();
  }

  /**
   * Trong một transaction có khóa ứng dụng: đọc trạng thái MES, `plan` so với BRAVO, ghi phần khác. Đọc trong khóa để hai
   * lần nạp không cùng thêm một đơn; câu ghi tự kiểm lại điều kiện để không đè phần người dùng vừa sửa trong lúc so.
   * inTransaction giữ lỗi gốc (1205 khi bị chọn hủy vì khóa chéo) để bên gọi biết mà thử lại.
   */
  async apply(plan: (state: MesState) => ImportPlan | Promise<ImportPlan>): Promise<{ plan: ImportPlan; applied: AppliedImport }> {
    return inTransaction(this.db, async (trx) => {
      await lockBravoImport(trx);
      const p = await plan(await this.state(trx));
      return { plan: p, applied: await this.write(trx, p) };
    });
  }

  /**
   * Cập nhật Nhà máy SX theo OSM (ADR 0013 mục 9) cho đơn nạp từ BRAVO: đơn có trong OSM nhận danh sách nhà máy theo OSM và
   * khóa sửa tay (IsFactoryFromOsm); đơn trước đó theo OSM mà nay OSM không còn thì mở khóa, giữ giá trị. Đơn chưa có trong OSM
   * giữ Nhà máy SX người dùng chọn. `factories`: ProductId → danh sách nhà máy (FtyName của OSM, chưa chuẩn hóa). Cùng khóa ứng
   * dụng với bước nạp đơn hàng: hai việc ghi SalesOrder không chạy chồng. `productIds`: chỉ xét các sản phẩm này (bài test dùng
   * để không đụng đơn khác trên database dùng chung).
   */
  async applyOsmFactories(factories: Map<number, string>, productIds?: number[]): Promise<{ updated: number; unlocked: number; tooLong: number[] }> {
    return inTransaction(this.db, async (trx) => {
      await lockBravoImport(trx);
      const only = productIds ? new Set(productIds) : null;
      const rows = (await trx.selectFrom('SalesOrder').select(['Id', 'SourceProductId', 'ProductionFactoryCode', 'IsFactoryFromOsm']).where('SourceProductId', 'is not', null).execute()).filter(
        (r) => !only || only.has(r.SourceProductId!),
      );
      const set: { id: number; code: string }[] = [];
      const unlock: number[] = [];
      const tooLong: number[] = [];
      for (const r of rows) {
        const { code, tooLong: long } = factoryListFor(factories.get(r.SourceProductId!));
        if (long) tooLong.push(r.SourceProductId!);
        else if (code) {
          if (code !== r.ProductionFactoryCode || !r.IsFactoryFromOsm) set.push({ id: r.Id, code });
        } else if (r.IsFactoryFromOsm) unlock.push(r.Id);
      }
      let updated = 0;
      for (const part of chunks(set, perBatch(2))) {
        const rows = sql.join(part.map((u) => sql`(${u.id}, ${u.code})`));
        const res = await low(
          trx,
          sql`UPDATE t SET t.ProductionFactoryCode = v.Code, t.IsFactoryFromOsm = 1 FROM dbo.SalesOrder t JOIN (VALUES ${rows}) AS v (Id, Code) ON v.Id = t.Id`.compile(trx),
        );
        updated += Number(res.numAffectedRows ?? 0);
      }
      let unlocked = 0;
      for (const ids of chunks(unlock, 1000)) {
        const res = await low(trx, trx.updateTable('SalesOrder').set({ IsFactoryFromOsm: false }).where('Id', 'in', ids));
        unlocked += Number(res.numAffectedRows ?? 0);
      }
      return { updated, unlocked, tooLong };
    });
  }

  private async state(trx: Kysely<OrderDatabase>): Promise<MesState> {
    const orders = await trx.selectFrom('SalesOrder').select(['Id', 'SourceProductId', 'BranchCode', 'OrderNo', 'CustomerName', 'StyleCode', 'SyncedAt', 'ModifiedBy', 'SourceHash']).execute();
    const pos = await trx
      .selectFrom('SalesOrderPo as p')
      .innerJoin('SalesOrder as o', 'o.Id', 'p.SalesOrderId')
      .select(['p.Id', 'p.SalesOrderId', 'p.PoNumber', 'p.ShipDate', 'p.Destination', 'p.StatusCode', 'p.CreatedBy', 'p.ModifiedBy'])
      // SQL Server không cho EXISTS đứng trong danh sách cột
      .select(sql<number>`CASE WHEN EXISTS (SELECT 1 FROM dbo.ShipmentPlanPo x WHERE x.SalesOrderPoId = p.Id) THEN 1 ELSE 0 END`.as('InPlan'))
      .where('o.SourceProductId', 'is not', null)
      // PO tay của ĐVCS khác ĐVCS của đơn (ADR 0013 mục 11) không ghép với PO BRAVO cùng số: PO BRAVO thuộc ĐVCS nhận đơn,
      // BRAVO có PO đó thì thêm PO mới, PO tay giữ nguyên (review 5.9.13 L4)
      .where((eb) => eb.or([eb('p.CreatedBy', 'is', null), eb('p.BranchCode', '=', eb.ref('o.BranchCode'))]))
      .execute();
    const cells = await trx
      .selectFrom('SalesOrderPoColorSize as c')
      .innerJoin('SalesOrderPo as p', 'p.Id', 'c.SalesOrderPoId')
      .innerJoin('SalesOrder as o', 'o.Id', 'p.SalesOrderId')
      .select(['c.SalesOrderPoId', 'c.ColorName', 'c.SizeName', 'c.Qty', 'c.CreatedBy'])
      .where('o.SourceProductId', 'is not', null)
      .orderBy('c.SalesOrderPoId')
      .orderBy('c.SortOrder')
      .orderBy('c.Id')
      .execute();
    const byPo = new Map<number, MesPo['cells']>();
    for (const c of cells) {
      const list = byPo.get(c.SalesOrderPoId) ?? [];
      list.push({ color: c.ColorName, size: c.SizeName, qty: c.Qty, createdBy: c.CreatedBy });
      byPo.set(c.SalesOrderPoId, list);
    }
    return {
      orders: orders.map((o) => ({ ...o, SourceProductId: o.SourceProductId ?? null })),
      pos: pos.map(({ InPlan, ...p }) => ({ ...p, inPlan: !!InPlan, cells: byPo.get(p.Id) ?? [] })),
    };
  }

  private async write(trx: Kysely<OrderDatabase>, plan: ImportPlan): Promise<AppliedImport> {
    const applied: AppliedImport = { newOrders: 0, updatedOrders: 0, baselined: 0, newPos: 0, updatedPos: 0, cellUpdates: 0, cellsKept: [...plan.cellsKept], newByBranch: {} };

    // Khóa trước mọi đơn đã có sẽ chạm tới (theo Id tăng dần), rồi mới thêm PO, sửa PO: cùng thứ tự với lập kế hoạch xuất hàng
    // (khóa đơn rồi đọc PO, màu cỡ của đơn), nên kế hoạch lập chen giữa chờ và thấy dữ liệu mới, không chụp màu cỡ cũ
    const touched = [
      ...new Set([...plan.orderUpdates.map((u) => u.id), ...plan.hashUpdates.map((u) => u.id), ...plan.newPos.map((x) => x.salesOrderId), ...plan.cellUpdates.map((u) => u.salesOrderId)]),
    ].sort((a, b) => a - b);
    for (const ids of chunks(touched, 1000)) {
      await low(trx, sql`SELECT Id FROM dbo.SalesOrder WITH (UPDLOCK, ROWLOCK) WHERE Id IN (${sql.join(ids)}) ORDER BY Id`.compile(trx));
    }

    // Đơn mới. OUTPUT không theo thứ tự VALUES: ghép lại theo SourceProductId
    const orderId = new Map<number, number>();
    for (const part of chunks(plan.newOrders, ORDER_BATCH)) {
      const out = await low(
        trx,
        trx
          .insertInto('SalesOrder')
          .values(
            part.map((o) => ({
              OrderNo: o.orderNo,
              ...o.fields,
              UnitPrice: null,
              CmPrice: null,
              SyncedAt: o.syncedAt,
              StatusCode: o.closed ? ('DONE' as const) : ('NEW' as const),
              SourceProductId: o.productId,
              SourceHash: o.hash,
              BranchCode: o.branchCode,
              ProductionFactoryCode: o.factoryCode,
              IsFactoryFromOsm: o.factoryFromOsm,
              CreatedBy: null,
            })),
          )
          .output(['inserted.Id', 'inserted.SourceProductId']),
      );
      for (const r of out.rows) orderId.set(r.SourceProductId!, r.Id);
    }
    for (const o of plan.newOrders) applied.newByBranch[o.branchCode] = (applied.newByBranch[o.branchCode] ?? 0) + 1;
    applied.newOrders = plan.newOrders.length;

    // PO của đơn mới và PO mới của đơn đã có
    const poList: { salesOrderId: number; branchCode: string; customer: string; style: string; closed: boolean; po: BuiltPo }[] = [
      ...plan.newOrders.flatMap((o) => o.pos.map((po) => ({ salesOrderId: orderId.get(o.productId)!, branchCode: o.branchCode, customer: o.fields.CustomerName, style: o.fields.StyleCode, closed: o.closed, po }))),
      ...plan.newPos,
    ];
    // Số tạm "~b<thứ tự>" để ghép OUTPUT với dòng nguồn, rồi đổi sang số theo Id; số tạm của màn hình là "~" + 24 ký tự hex
    const poId = new Map<string, number>();
    for (const [k, part] of chunks(poList, PO_BATCH).entries()) {
      const out = await low(
        trx,
        trx
          .insertInto('SalesOrderPo')
          .values(
            part.map((x, i) => ({
              SalesOrderId: x.salesOrderId,
              PoCode: `~b${k * PO_BATCH + i}`,
              PoNumber: x.po.poNumber,
              CustomerName: x.customer,
              StyleCode: x.style,
              Qty: x.po.qty,
              Destination: x.po.destination,
              PackingListCode: null,
              CustomsDeclarationNo: null,
              SyncedAt: x.po.syncedAt,
              ShipDate: x.po.shipDate,
              // Đơn đã đóng lệnh bên BRAVO: PO coi như đã xác nhận (khóa sửa màu cỡ)
              StatusCode: x.closed ? ('CONFIRMED' as const) : ('DRAFT' as const),
              ConfirmedAt: x.closed ? x.po.syncedAt : null,
              ConfirmedBy: null,
              BranchCode: x.branchCode,
              CreatedBy: null,
            })),
          )
          .output(['inserted.Id', 'inserted.PoCode']),
      );
      for (const r of out.rows) poId.set(r.PoCode, r.Id);
    }
    for (const ids of chunks([...poId.values()], 1000)) await low(trx, sql`UPDATE dbo.SalesOrderPo SET PoCode = ${PO_NO} WHERE Id IN (${sql.join(ids)})`.compile(trx));
    await this.insertCells(trx, poList.flatMap((x, i) => x.po.cells.map((c, k) => ({ SalesOrderPoId: poId.get(`~b${i}`)!, ColorName: c.color, SizeName: c.size, Qty: c.qty, SortOrder: k, BranchCode: x.branchCode, CreatedBy: null }))));
    applied.newPos = plan.newPos.length;

    // Cột lấy từ BRAVO của đơn đã có. Trạng thái tính trong câu ghi (không ghi lại trạng thái đọc lúc so): người dùng có thể
    // vừa đổi. Người dùng vừa sửa đơn trong lúc so (ModifiedBy có giá trị) thì chỉ ghi khi BRAVO đổi đơn (Force)
    for (const part of chunks(plan.orderUpdates, perBatch(14))) {
      const rows = sql.join(
        part.map(
          (u) =>
            sql`(${u.id}, ${u.fields.CustomerName}, ${u.fields.StyleCode}, ${u.fields.Season}, ${u.fields.OrderType}, ${u.fields.ProductName}, ${u.fields.StaffName}, ${u.fields.Qty}, ${u.fields.UnitName}, ${u.fields.ShipDate}, ${u.closed ? 1 : 0}, ${u.hash}, ${u.syncedAt}, ${u.force ? 1 : 0})`,
        ),
      );
      const res = await low(
        trx,
        sql`
          UPDATE t SET t.CustomerName = v.CustomerName, t.StyleCode = v.StyleCode, t.Season = v.Season, t.OrderType = v.OrderType,
                 t.ProductName = v.ProductName, t.StaffName = v.StaffName, t.Qty = v.Qty, t.UnitName = v.UnitName, t.ShipDate = v.ShipDate,
                 t.StatusCode = CASE WHEN v.Closed = 1 AND t.StatusCode = 'NEW' THEN 'DONE' ELSE t.StatusCode END,
                 t.SourceHash = v.SourceHash, t.SyncedAt = v.SyncedAt
          FROM dbo.SalesOrder t
          JOIN (VALUES ${rows}) AS v (Id, CustomerName, StyleCode, Season, OrderType, ProductName, StaffName, Qty, UnitName, ShipDate, Closed, SourceHash, SyncedAt, Force) ON v.Id = t.Id
          WHERE t.ModifiedBy IS NULL OR v.Force = 1`.compile(trx),
      );
      applied.updatedOrders += Number(res.numAffectedRows ?? 0);
    }
    for (const part of chunks(plan.hashUpdates, perBatch(3))) {
      const rows = sql.join(part.map((u) => sql`(${u.id}, ${u.hash}, ${u.closed ? 1 : 0})`));
      const res = await low(
        trx,
        sql`
          UPDATE t SET t.SourceHash = v.SourceHash, t.StatusCode = CASE WHEN v.Closed = 1 AND t.StatusCode = 'NEW' THEN 'DONE' ELSE t.StatusCode END
          FROM dbo.SalesOrder t JOIN (VALUES ${rows}) AS v (Id, SourceHash, Closed) ON v.Id = t.Id
          WHERE t.SourceHash IS NULL`.compile(trx),
      );
      applied.baselined += Number(res.numAffectedRows ?? 0);
    }

    // Màu cỡ: kiểm lại điều kiện ngay trong câu ghi (người dùng có thể vừa xác nhận, đưa vào kế hoạch, sửa tay). Dòng đơn đã
    // khóa ở đầu; câu ghi giữ khóa PO tới hết transaction: xác nhận, đưa vào kế hoạch chạy sau thì chờ và thấy màu cỡ mới
    for (const u of plan.cellUpdates) {
      const res = await low(
        trx,
        trx
          .updateTable('SalesOrderPo')
          .set({ Qty: u.qty })
          .where('Id', '=', u.poId)
          .where('StatusCode', '=', 'DRAFT')
          .where('ModifiedBy', 'is', null)
          .where((eb) =>
            eb.and([
              eb.not(eb.exists(eb.selectFrom('ShipmentPlanPo').select('Id').where('SalesOrderPoId', '=', u.poId))),
              eb.not(eb.exists(eb.selectFrom('SalesOrderPoColorSize').select('Id').where('SalesOrderPoId', '=', u.poId).where('CreatedBy', 'is not', null))),
            ]),
          )
          .output(['inserted.BranchCode']),
      );
      const branchCode = res.rows[0]?.BranchCode;
      if (!branchCode) {
        applied.cellsKept.push(u.poId);
        continue;
      }
      await low(trx, trx.deleteFrom('SalesOrderPoColorSize').where('SalesOrderPoId', '=', u.poId));
      await this.insertCells(trx, u.cells.map((c, k) => ({ SalesOrderPoId: u.poId, ColorName: c.color, SizeName: c.size, Qty: c.qty, SortOrder: k, BranchCode: branchCode, CreatedBy: null })));
      applied.cellUpdates++;
    }

    // Ngày xuất, nơi giao của PO nạp từ BRAVO: người dùng không sửa được trên màn hình, luôn theo BRAVO
    for (const part of chunks(plan.poUpdates, perBatch(4))) {
      const rows = sql.join(part.map((u) => sql`(${u.id}, ${u.shipDate}, ${u.destination}, ${u.syncedAt})`));
      const res = await low(
        trx,
        sql`
          UPDATE t SET t.ShipDate = v.ShipDate, t.Destination = v.Destination, t.SyncedAt = v.SyncedAt
          FROM dbo.SalesOrderPo t JOIN (VALUES ${rows}) AS v (Id, ShipDate, Destination, SyncedAt) ON v.Id = t.Id`.compile(trx),
      );
      applied.updatedPos += Number(res.numAffectedRows ?? 0);
    }
    return applied;
  }

  private async insertCells(trx: Kysely<OrderDatabase>, rows: { SalesOrderPoId: number; ColorName: string; SizeName: string; Qty: number; SortOrder: number; BranchCode: string; CreatedBy: null }[]) {
    for (const part of chunks(rows, perBatch(7))) await low(trx, trx.insertInto('SalesOrderPoColorSize').values(part));
  }
}
