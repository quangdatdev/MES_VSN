import { env } from '../src/config/env';
import { createDb } from '../src/platform/database/db';
import type { OrderDatabase } from '../src/modules/order/order.types';
import { clearSimulated, PLANNER_NAME, simulateBranch } from '../scripts/simulate-board';

// Phần ghi database của dàn chuyền mô phỏng (scripts/simulate-board.ts): cần SQL Server đã migrate. Mọi dòng nằm trong
// transaction được hủy ở cuối bài, không đổi dữ liệu.
const TODAY = '2026-10-10';
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const lineCodes = (n: number, branch: string) => Array.from({ length: n }, (_, i) => `${branch}-L${String(i + 1).padStart(2, '0')}`);

describe('Dàn chuyền mô phỏng: ghi database (rollback, không đổi dữ liệu)', () => {
  // Mã nhà máy giả: không trùng nhà máy thật, mọi dòng nằm trong transaction được hủy ở cuối
  const B = 'ZT1';
  const OTHER = 'ZT2';
  const LINES6 = lineCodes(6, B);
  const SRC = 2_100_000_000;
  const db = createDb<OrderDatabase>(env.db.orderName, { requestTimeoutMs: 120_000 });
  const ROLLBACK = new Error('rollback');
  afterAll(() => db.destroy());

  it('xóa đúng kế hoạch mô phỏng, giữ kế hoạch người dùng và mô phỏng đã sửa, trả trạng thái đơn, xếp mới hợp lệ', async () => {
    const run = db.transaction().execute(async (trx) => {
      const id = async (table: keyof OrderDatabase, values: object) =>
        ((await trx.insertInto(table).values(values as any).output('inserted.Id' as any).executeTakeFirstOrThrow()) as { Id: number }).Id;
      const sizes = ['S', 'M', 'L', 'XL'];
      const planLine = new Map<number, number>();
      /** Đơn có một hay hai PO; closed: mọi PO đã xác nhận bởi hệ thống như đơn đóng lệnh khi nạp BRAVO */
      const order = async (branch: string, n: number, o: { qty: number; ship: string; status: string; source?: number | null; closed?: boolean; colors?: string[][]; poNumber?: string }) => {
        const orderId = await id('SalesOrder', {
          OrderNo: `ZT-${n}`,
          CustomerName: 'KHÁCH TEST MÔ PHỎNG',
          StyleCode: `ZT-STYLE-${n}`,
          ProductName: 'Áo test',
          Qty: o.qty,
          UnitName: 'Chiếc',
          ShipDate: o.ship,
          StatusCode: o.status,
          SourceProductId: o.source === undefined ? SRC + n : o.source,
          BranchCode: branch,
        });
        for (const [k, colors] of (o.colors ?? [['Navy', 'Black']]).entries()) {
          const poId = await id('SalesOrderPo', {
            SalesOrderId: orderId,
            PoCode: `ZT-${n}-${k}`,
            PoNumber: o.poNumber ?? `ZTPO-${n}-${k}`,
            CustomerName: 'KHÁCH TEST MÔ PHỎNG',
            StyleCode: `ZT-STYLE-${n}`,
            Qty: o.qty,
            ShipDate: o.ship,
            StatusCode: o.closed ? 'CONFIRMED' : 'DRAFT',
            ConfirmedAt: o.closed ? new Date() : null,
            BranchCode: branch,
          });
          const cells = colors.flatMap((c) => sizes.map((s) => ({ c, s })));
          await trx
            .insertInto('SalesOrderPoColorSize')
            .values(cells.map((x, i) => ({ SalesOrderPoId: poId, ColorName: x.c, SizeName: x.s, Qty: Math.floor(o.qty / cells.length / (o.colors?.length ?? 1)), SortOrder: i, BranchCode: branch })) as any)
            .execute();
        }
        return orderId;
      };
      /** Kế hoạch có sẵn; `line` tạo cùng lúc kế hoạch, trừ khi `lineCreatedAt` (dòng người dùng thêm sau) */
      const plan = async (
        branch: string,
        orderId: number,
        no: string,
        planner: string,
        line?: { code: string; start: string; end: string; createdAt?: Date; modified?: boolean },
        modified = false,
      ) => {
        const planId = await id('ShipmentPlan', {
          PlanNo: no,
          CreatedAt: new Date(Date.parse(`${TODAY}T01:00:00Z`)),
          SalesOrderId: orderId,
          CustomerName: 'KHÁCH TEST MÔ PHỎNG',
          StyleCode: 'ZT',
          ProductName: 'Áo test',
          PoBuyDate: 'ZT / 01-01',
          PlanQty: 1000,
          ShipDate: addDays(TODAY, 30),
          PlannerName: planner,
          StatusCode: line ? 'SCHEDULED' : 'PLANNED',
          ModifiedAt: modified ? new Date() : null,
          BranchCode: branch,
        });
        if (line) {
          const lineId = await id('ShipmentPlanLine', {
            ShipmentPlanId: planId,
            LineCode: line.code,
            Qty: 500,
            AvgOutput: 100,
            StartDate: line.start,
            ProductionDays: 5,
            OffDays: 0,
            EndDate: line.end,
            StatusCode: 'ALLOCATED',
            SortOrder: 0,
            CreatedAt: line.createdAt ?? new Date(Date.parse(`${TODAY}T01:00:30Z`)),
            ModifiedAt: line.modified ? new Date() : null,
            BranchCode: branch,
          });
          planLine.set(planId, lineId);
          await id('ShipmentPlanLineColorSize', { ShipmentPlanLineId: lineId, ColorName: 'Navy', SizeName: 'M', PlanQty: 500, AssignedQty: 500, SortOrder: 0, BranchCode: branch });
        }
        return planId;
      };

      // Đơn ứng viên: còn mở, đóng lệnh; một đơn có "Navy" ở PO đầu và "NAVY " ở PO sau, số PO 40 ký tự
      for (let n = 1; n <= 30; n++) await order(B, n, { qty: 1000 + n * 150, ship: addDays(TODAY, n * 3 - 40), status: 'NEW' });
      for (let n = 31; n <= 35; n++) await order(B, n, { qty: 2500, ship: addDays(TODAY, -20), status: 'DONE', closed: true });
      const navy = await order(B, 36, { qty: 4000, ship: TODAY, status: 'NEW', colors: [['Navy'], ['NAVY ']], poNumber: 'P'.repeat(40) });
      // Không được chọn: đơn nhập tay người dùng đặt Hoàn thành; đơn BRAVO còn mở người dùng đặt Hoàn thành
      const manualDone = await order(B, 37, { qty: 3000, ship: TODAY, status: 'DONE', source: null });
      const userDone = await order(B, 38, { qty: 3000, ship: TODAY, status: 'DONE' });
      // Kế hoạch có sẵn
      const userPlan = await plan(B, await order(B, 39, { qty: 1000, ship: TODAY, status: 'PLANNING' }), 'ZT-USER', 'Người dùng test', { code: `${B}-L01`, start: addDays(TODAY, 3), end: addDays(TODAY, 9) });
      const closedOrder = await order(B, 40, { qty: 2000, ship: TODAY, status: 'IN_PRODUCTION', closed: true });
      await plan(B, closedOrder, 'ZT-SIM-A', PLANNER_NAME, { code: `${B}-L02`, start: addDays(TODAY, -5), end: TODAY });
      const openOrder = await order(B, 41, { qty: 2000, ship: TODAY, status: 'PLANNING' });
      await plan(B, openOrder, 'ZT-SIM-D', PLANNER_NAME);
      const touched = await plan(B, await order(B, 42, { qty: 1000, ship: TODAY, status: 'PLANNING' }), 'ZT-SIM-B', PLANNER_NAME, { code: `${B}-L03`, start: addDays(TODAY, 1), end: addDays(TODAY, 6) }, true);
      // Bốn cách nhận diện "người dùng đã sửa" còn lại: dòng có ModifiedAt; dòng thêm sau kế hoạch hơn 10 phút; phân màu cỡ
      // có ModifiedAt; dòng có dữ liệu ở Kế hoạch chuẩn bị SX (khớp Id và thời điểm tạo)
      const lineEdited = await plan(B, await order(B, 44, { qty: 1000, ship: TODAY, status: 'PLANNING' }), 'ZT-SIM-E', PLANNER_NAME, { code: `${B}-L04`, start: addDays(TODAY, 1), end: addDays(TODAY, 6), modified: true });
      const lineAdded = await plan(B, await order(B, 45, { qty: 1000, ship: TODAY, status: 'PLANNING' }), 'ZT-SIM-F', PLANNER_NAME, {
        code: `${B}-L05`,
        start: addDays(TODAY, 1),
        end: addDays(TODAY, 6),
        createdAt: new Date(Date.parse(`${TODAY}T01:11:00Z`)),
      });
      const allocEdited = await plan(B, await order(B, 46, { qty: 1000, ship: TODAY, status: 'PLANNING' }), 'ZT-SIM-G', PLANNER_NAME, { code: `${B}-L06`, start: addDays(TODAY, 1), end: addDays(TODAY, 6) });
      await trx.updateTable('ShipmentPlanLineColorSize').set({ ModifiedAt: new Date() }).where('ShipmentPlanLineId', '=', planLine.get(allocEdited)!).execute();
      const prepEdited = await plan(B, await order(B, 47, { qty: 1000, ship: TODAY, status: 'PLANNING' }), 'ZT-SIM-H', PLANNER_NAME, { code: `${B}-L06`, start: addDays(TODAY, 20), end: addDays(TODAY, 25) });
      // Bản chép cũ (thời điểm tạo khác) của một Id dòng: không được coi là đã nhập
      const prepStale = await plan(B, await order(B, 48, { qty: 1000, ship: TODAY, status: 'PLANNING' }), 'ZT-SIM-I', PLANNER_NAME, { code: `${B}-L05`, start: addDays(TODAY, 20), end: addDays(TODAY, 25) });
      const prepLines = new Map<number, Date | null>([
        [planLine.get(prepEdited)!, new Date(Date.parse(`${TODAY}T01:00:30Z`))],
        [planLine.get(prepStale)!, new Date(Date.parse('2026-01-01T00:00:00Z'))],
      ]);
      const other = await plan(OTHER, await order(OTHER, 43, { qty: 1000, ship: TODAY, status: 'PLANNING' }), 'ZT-SIM-C', PLANNER_NAME, { code: `${OTHER}-L01`, start: TODAY, end: addDays(TODAY, 4) });

      const planIds = async (branch: string) => (await trx.selectFrom('ShipmentPlan').select('Id').where('BranchCode', '=', branch).execute()).map((r) => r.Id);
      const statusOf = async (orderId: number) => (await trx.selectFrom('SalesOrder').select('StatusCode').where('Id', '=', orderId).executeTakeFirstOrThrow()).StatusCode;

      // 1. Xóa: chỉ kế hoạch mô phỏng chưa sửa của đúng nhà máy; đơn trả về trạng thái lúc nạp
      expect(await clearSimulated(trx, B, { prepLines })).toEqual({ removed: 3, kept: 5 });
      const keptIds = [userPlan, touched, lineEdited, lineAdded, allocEdited, prepEdited];
      expect((await planIds(B)).sort((a, b) => a - b)).toEqual(keptIds.sort((a, b) => a - b));
      expect(await planIds(OTHER)).toEqual([other]);
      expect(await statusOf(closedOrder)).toBe('DONE');
      expect(await statusOf(openOrder)).toBe('NEW');

      // 2. Xếp mới
      const stats = await simulateBranch(trx, { branch: B, lines: LINES6, today: TODAY, plannerId: null, prepLines });
      expect(stats).toMatchObject({ removed: 0, kept: 5 });
      expect(stats.plans).toBeGreaterThan(20);
      expect(await planIds(OTHER)).toEqual([other]);
      const plans = await trx.selectFrom('ShipmentPlan').selectAll().where('BranchCode', '=', B).execute();
      expect(plans.filter((p) => p.PlanNo.startsWith('~'))).toEqual([]);
      expect(plans.some((p) => p.Id === userPlan && p.PlanNo === 'ZT-USER')).toBe(true);
      expect(plans.some((p) => p.Id === touched && p.PlanNo === 'ZT-SIM-B')).toBe(true);
      expect(plans.filter((p) => p.SalesOrderId === manualDone || p.SalesOrderId === userDone)).toEqual([]);
      for (const p of plans) expect(p.PoBuyDate.length).toBeLessThanOrEqual(40);
      // Hai PO "Navy" và "NAVY " gộp một ô mỗi cỡ
      const navyPlans = plans.filter((p) => p.SalesOrderId === navy).map((p) => p.Id);
      expect(navyPlans.length).toBeGreaterThan(0);
      const navyCells = await trx.selectFrom('ShipmentPlanColorSize').select(['ShipmentPlanId', 'ColorName', 'SizeName']).where('ShipmentPlanId', 'in', navyPlans).execute();
      expect(navyCells.length).toBe(navyPlans.length * 4);

      // Dòng dàn chuyền: không chồng nhau (kể cả dòng có sẵn), phân màu cỡ khớp SL dòng và trạng thái
      const lines = await trx.selectFrom('ShipmentPlanLine').selectAll().where('BranchCode', '=', B).execute();
      const day = (d: Date) => d.toISOString().slice(0, 10);
      const bars = lines.map((l) => ({ lineCode: l.LineCode, start: day(l.StartDate as Date), end: day(l.EndDate as Date) }));
      for (const code of LINES6) {
        const list = bars.filter((b) => b.lineCode === code).sort((a, b) => a.start.localeCompare(b.start));
        for (let i = 1; i < list.length; i++) expect(list[i].start > list[i - 1].end).toBe(true);
      }
      const alloc = await trx.selectFrom('ShipmentPlanLineColorSize').selectAll().where('BranchCode', '=', B).execute();
      const planCells = await trx.selectFrom('ShipmentPlanColorSize').selectAll().where('BranchCode', '=', B).execute();
      for (const l of lines.filter((x) => !keptIds.includes(x.ShipmentPlanId))) {
        const rows = alloc.filter((a) => a.ShipmentPlanLineId === l.Id);
        expect(rows.reduce((s, a) => s + a.PlanQty, 0)).toBe(l.Qty);
        const assigned = rows.reduce((s, a) => s + a.AssignedQty, 0);
        rows.forEach((a) => expect(a.AssignedQty).toBeLessThanOrEqual(a.PlanQty));
        if (l.StatusCode === 'PLANNED') expect(assigned).toBe(0);
        else expect(assigned).toBeGreaterThan(0);
      }
      for (const p of plans.filter((x) => x.PlannerName === PLANNER_NAME && !keptIds.includes(x.Id))) {
        const own = lines.filter((l) => l.ShipmentPlanId === p.Id);
        expect(own.reduce((s, l) => s + l.Qty, 0)).toBeLessThanOrEqual(p.PlanQty);
        for (const c of planCells.filter((x) => x.ShipmentPlanId === p.Id)) {
          const used = alloc.filter((a) => own.some((l) => l.Id === a.ShipmentPlanLineId) && a.ColorName === c.ColorName && a.SizeName === c.SizeName);
          expect(used.reduce((s, a) => s + a.PlanQty, 0)).toBeLessThanOrEqual(c.PlanQty);
        }
      }
      // Đơn của kế hoạch mô phỏng mới mang trạng thái theo kế hoạch
      const newOrders = new Set(plans.filter((p) => p.PlannerName === PLANNER_NAME && !keptIds.includes(p.Id)).map((p) => p.SalesOrderId));
      const statuses = await trx.selectFrom('SalesOrder').select('StatusCode').where('Id', 'in', [...newOrders]).execute();
      expect(statuses.every((s) => ['PLANNING', 'IN_PRODUCTION', 'DONE'].includes(s.StatusCode))).toBe(true);

      // 3. --all: xóa cả kế hoạch mô phỏng đã sửa, kế hoạch người dùng lập vẫn giữ
      const swept = await clearSimulated(trx, B, { prepLines, all: true });
      expect(swept.kept).toBe(0);
      expect(await planIds(B)).toEqual([userPlan]);
      throw ROLLBACK;
    });
    // Lỗi khác ROLLBACK là một khẳng định bên trong transaction bị sai: ném lại để Jest báo đúng dòng
    await run.then(
      () => {
        throw new Error('transaction phải bị hủy');
      },
      (e) => {
        if (e !== ROLLBACK) throw e;
      },
    );
    expect(await db.selectFrom('SalesOrder').select('Id').where('BranchCode', 'in', [B, OTHER]).execute()).toEqual([]);
  }, 120_000);
});
