// Dữ liệu giả của module Đơn hàng (MES_Order) cho một nhà máy. Sinh xác định theo hạt giống: chạy lại cho cùng kết quả.
// Chuỗi: đơn hàng → PO + màu cỡ → kế hoạch xuất hàng → dàn chuyền (bảng Gantt) → phân màu cỡ cho chuyền.
import { sql, type Kysely } from 'kysely';
import type { OrderDatabase } from '../src/modules/order/order.types';
import { apportion, lineShares } from '../src/modules/order/order.util';
import { lineDates, nextWorkingDay, type WorkCalendar } from '../src/platform/catalog/work-calendar';
import { COLORS, CUSTOMERS, DESTINATIONS, LINE_COUNT, ORDER_COUNT, PRODUCTS, SCHEDULE_START, SIZES, STAFF, lineCode, prng } from './seed-data';

/** Ngày demo: tiến độ (đang sản xuất, lũy kế) tính theo mốc này để dữ liệu không đổi theo ngày chạy. */
const TODAY = '2026-10-09';
const SIZE_WEIGHT: Record<string, number> = { S: 15, M: 30, L: 30, XL: 18, XXL: 7 };

const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

/**
 * Nhà máy SX mẫu của đơn hàng (seed-data productionFactories, ADR 0013): A01 chia hai nhà máy; vài đơn của chi nhánh A02 may ở
 * nhà máy 1B (thuộc ĐVCS A01) để thấy kế hoạch xuất hàng lập cho đơn hàng của ĐVCS khác
 */
const factoryOf = (branch: string, i: number) => ((branch === 'A01' && i % 3 === 2) || (branch === 'A02' && i % 6 === 5) ? 'A01-B' : branch);

export async function seedOrders(db: Kysely<OrderDatabase>, branch: string, createdBy: number | null, plannerName: string, calendar: WorkCalendar) {
  const seed = [...branch].reduce((s, c) => s * 31 + c.charCodeAt(0), 7);
  const rnd = prng(seed);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
  const audit = { BranchCode: branch, CreatedBy: createdBy };
  const lines = Array.from({ length: LINE_COUNT[branch] ?? 0 }, (_, i) => lineCode(branch, i + 1));
  // Mỗi chuyền một con trỏ ngày: việc kế tiếp xếp sau việc trước để bảng dàn chuyền liền mạch
  const cursor = new Map(lines.map((l) => [l, addDays(SCHEDULE_START, -int(4, 9))]));
  const stats = { orders: 0, pos: 0, plans: 0, lines: 0 };

  for (let i = 0; i < (ORDER_COUNT[branch] ?? 0); i++) {
    const customer = CUSTOMERS[(i + branch.charCodeAt(2)) % CUSTOMERS.length];
    const [prodCode, productName] = pick(PRODUCTS);
    const initials = customer
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
    const styleCode = `${initials}${prodCode}-${int(2610, 2989)}`;
    const qty = 50 * int(40, 170);
    const unitPrice = Math.round((9 + rnd() * 33) * 100) / 100;
    const cmPrice = Math.round((1.6 + rnd() * 4.6) * 100) / 100;
    const shipDate = addDays('2026-11-02', i * 5 + int(0, 4));
    const syncedAt = new Date(`${addDays('2026-09-20', int(0, 18))}T0${int(1, 9)}:15:00Z`);

    const order = await db
      .insertInto('SalesOrder')
      .values({
        OrderNo: `~seed-${i}`,
        CustomerName: customer,
        StyleCode: styleCode,
        Season: pick(['FW26', 'SS27', 'FW27']),
        OrderType: rnd() < 0.7 ? 'SXXK' : 'GCND', // mã trong danh mục Loại đơn hàng
        ProductName: productName,
        StaffName: STAFF[i % STAFF.length],
        Qty: qty,
        UnitName: 'Chiếc',
        UnitPrice: unitPrice,
        CmPrice: cmPrice,
        SyncedAt: syncedAt,
        ShipDate: shipDate,
        StatusCode: 'NEW',
        ProductionFactoryCode: factoryOf(branch, i),
        ...audit,
      } as any)
      .output('inserted.Id')
      .executeTakeFirstOrThrow();
    stats.orders++;

    // PO + màu cỡ: tổng màu cỡ của các PO bằng số lượng đơn hàng
    const poCount = 1 + (i % 3);
    const poQty = apportion(qty, Array.from({ length: poCount }, () => 1));
    const colors = [...COLORS].sort(() => rnd() - 0.5).slice(0, 2 + (i % 2));
    const sizes = SIZES.slice(0, i % 4 === 0 ? 5 : 4);
    const colorWeights = colors.map(() => int(2, 6));
    const pos: { id: number; poNumber: string; colorSizes: { color: string; size: string; qty: number }[] }[] = [];
    for (let p = 0; p < poCount; p++) {
      const poNumber = `4500${String(((i + 1) * 7919 + p * 104729 + seed) % 1_000_000).padStart(6, '0')}`;
      const cells = colors.flatMap((c, ci) => sizes.map((s) => ({ color: c, size: s, w: colorWeights[ci] * SIZE_WEIGHT[s] })));
      const split = apportion(poQty[p], cells.map((c) => c.w));
      const confirmed = rnd() < 0.55;
      const po = await db
        .insertInto('SalesOrderPo')
        .values({
          SalesOrderId: order.Id,
          PoCode: `~seed-${i}-${p}`,
          PoNumber: poNumber,
          CustomerName: customer,
          StyleCode: styleCode,
          Qty: poQty[p],
          Destination: pick(DESTINATIONS),
          PackingListCode: rnd() < 0.5 ? `PKL-${branch}-${int(1000, 9999)}` : null,
          CustomsDeclarationNo: rnd() < 0.4 ? `30${int(100_000_000, 999_999_999)}` : null,
          SyncedAt: syncedAt,
          ShipDate: addDays(shipDate, -p * 3),
          StatusCode: confirmed ? 'CONFIRMED' : 'DRAFT',
          ConfirmedAt: confirmed ? new Date(syncedAt.getTime() + 86_400_000) : null,
          ConfirmedBy: confirmed ? createdBy : null,
          ...audit,
        } as any)
        .output('inserted.Id')
        .executeTakeFirstOrThrow();
      const colorSizes = cells.map((c, k) => ({ color: c.color, size: c.size, qty: split[k] }));
      await db
        .insertInto('SalesOrderPoColorSize')
        .values(colorSizes.map((c, k) => ({ SalesOrderPoId: po.Id, ColorName: c.color, SizeName: c.size, Qty: c.qty, SortOrder: k, ...audit })) as any)
        .execute();
      pos.push({ id: po.Id, poNumber, colorSizes });
      stats.pos++;
    }

    // Kế hoạch xuất hàng: phần lớn đơn hàng có kế hoạch; một số tách hai đợt
    if (i % 5 === 4) continue;
    const original = new Map<string, number>();
    for (const po of pos) for (const c of po.colorSizes) original.set(`${c.color}|${c.size}`, (original.get(`${c.color}|${c.size}`) ?? 0) + c.qty);
    const keys = [...original.keys()];
    const firstShare = i % 3 === 0 ? 0.6 : 1;
    const batches = firstShare < 1 && i % 2 === 0 ? [firstShare, 1 - firstShare] : [firstShare];
    let orderStatus = 'PLANNING';

    for (const bi of batches.keys()) {
      const planLines = keys.map((k, idx) => {
        const [color, size] = k.split('|');
        const total = original.get(k)!;
        const first = Math.floor(total * batches[0]);
        return { color, size, originalQty: total, planQty: bi === 0 ? first : total - first, sort: idx };
      });
      const planQty = planLines.reduce((s, l) => s + l.planQty, 0);
      if (planQty <= 0) continue;
      const planShip = addDays(shipDate, bi * 10);
      const plan = await db
        .insertInto('ShipmentPlan')
        .values({
          PlanNo: `~seed-${i}-${bi}`,
          SalesOrderId: order.Id,
          CustomerName: customer,
          StyleCode: styleCode,
          ProductName: productName,
          OrderType: null,
          PoBuyDate: `${pos[0].poNumber} / ${planShip.slice(8, 10)}-${planShip.slice(5, 7)}`,
          PlanQty: planQty,
          CmPrice: cmPrice,
          SyncedAt: syncedAt,
          ShipDate: planShip,
          PlannerName: plannerName,
          StatusCode: 'PLANNED',
          ...audit,
        } as any)
        .output('inserted.Id')
        .executeTakeFirstOrThrow();
      stats.plans++;
      await db.insertInto('ShipmentPlanPo').values(pos.map((p) => ({ ShipmentPlanId: plan.Id, SalesOrderPoId: p.id, ...audit })) as any).execute();
      await db
        .insertInto('ShipmentPlanColorSize')
        .values(planLines.map((l) => ({ ShipmentPlanId: plan.Id, ColorName: l.color, SizeName: l.size, OriginalQty: l.originalQty, PlanQty: l.planQty, SortOrder: l.sort, ...audit })) as any)
        .execute();

      // Dàn chuyền: 3/4 kế hoạch đã xếp chuyền, chia cho 1-3 chuyền
      if (i % 4 === 3 || bi > 0 || lines.length === 0) continue;
      const k = 1 + (i % 3);
      const picked = Array.from({ length: k }, (_, m) => lines[(i * 3 + m * 4) % lines.length]);
      // Nhà máy 1: chuyền 3 luôn có việc để demo Trưởng chuyền 3
      if (branch === 'A01' && i % 3 === 0 && !picked.includes('A01-L03')) picked[0] = 'A01-L03';
      const chosen = [...new Set(picked)];
      const lineQty = apportion(planQty, chosen.map(() => 1));
      // Màu cỡ của từng chuyền chia lần lượt: tổng mỗi màu cỡ trên các chuyền không vượt SL kế hoạch của màu cỡ (phase 5.13)
      const shares = lineShares(planLines.map((l) => l.planQty), lineQty);
      let started = false;
      for (const [m, code] of chosen.entries()) {
        const q = lineQty[m];
        if (q <= 0) continue;
        const avg = 50 * int(5, 12);
        const start = nextWorkingDay(calendar, addDays(cursor.get(code)!, int(0, 1)));
        const days = Math.ceil(q / avg);
        // Trước phase 5.12 lần rút này là "ngày nghỉ khác" nhập tay: giữ lần rút để các số ngẫu nhiên sau không đổi (dữ liệu mẫu như cũ)
        rnd();
        const dates = start && lineDates(calendar, start, days);
        if (!start || !dates) throw new Error(`Lịch làm việc của ${branch} không đủ ngày làm việc để xếp dàn chuyền mẫu.`);
        const end = dates.endDate;
        cursor.set(code, addDays(end, 1));
        const inProduction = start <= TODAY;
        started ||= inProduction;
        const allocated = start <= addDays(TODAY, 12);
        const line = await db
          .insertInto('ShipmentPlanLine')
          .values({
            ShipmentPlanId: plan.Id,
            LineCode: code,
            Qty: q,
            AvgOutput: avg,
            StartDate: start,
            ProductionDays: days,
            OffDays: dates.offDays,
            EndDate: end,
            OutStartDate: dates.outStartDate,
            OutEndDate: dates.outEndDate,
            WarehouseStartDate: dates.warehouseStartDate,
            WarehouseEndDate: dates.warehouseEndDate,
            StatusCode: inProduction ? 'IN_PRODUCTION' : allocated ? 'ALLOCATED' : 'PLANNED',
            SortOrder: m,
            ...audit,
          } as any)
          .output('inserted.Id')
          .executeTakeFirstOrThrow();
        stats.lines++;
        // Chuyền đã phân màu cỡ: mỗi màu cỡ có phần giao một dòng; PlanQty là SL KHXH của màu cỡ ở kế hoạch (phase 5.13)
        const given = planLines.map((l, n) => ({ l, n, qty: shares[m][n] })).filter((x) => (inProduction || allocated) && x.qty > 0);
        if (given.length) {
          await db
            .insertInto('ShipmentPlanLineColorSize')
            .values(given.map(({ l, n, qty }) => ({ ShipmentPlanLineId: line.Id, ColorName: l.color, SizeName: l.size, PlanQty: l.planQty, AssignedQty: qty, SortOrder: n, ...audit })) as any)
            .execute();
        }
      }
      // Lũy kế theo phần thời gian đã sản xuất tính đến ngày demo
      const lineRows = await db.selectFrom('ShipmentPlanLine').select(['StartDate', 'EndDate']).where('ShipmentPlanId', '=', plan.Id).execute();
      const from = lineRows.map((r) => (r.StartDate as Date).toISOString().slice(0, 10)).sort()[0];
      const to = lineRows.map((r) => (r.EndDate as Date).toISOString().slice(0, 10)).sort().at(-1)!;
      const frac = from && to ? Math.max(0, Math.min(1, daysBetween(from, TODAY) / Math.max(1, daysBetween(from, to)))) : 0;
      const sewn = Math.round(planQty * frac);
      await db
        .updateTable('ShipmentPlan')
        .set({
          StatusCode: started ? 'IN_PRODUCTION' : 'SCHEDULED',
          // LK cắt lấy từ màn Đồng bộ tiến độ cắt (quyết định 13.6): không điền số giả
          CutQty: 0,
          SewnQty: sewn,
          EndlineQty: Math.round(sewn * 0.92),
          FinishedQty: Math.round(sewn * 0.8),
        })
        .where('Id', '=', plan.Id)
        .execute();
      if (started) orderStatus = 'IN_PRODUCTION';
    }
    await db.updateTable('SalesOrder').set({ StatusCode: orderStatus as any }).where('Id', '=', order.Id).execute();
  }

  // Số chứng từ theo Id như khi tạo trên màn hình (PREFIX-<nhà máy>-<Id 6 số>)
  for (const [table, column, prefix] of [
    ['SalesOrder', 'OrderNo', 'DH'],
    ['SalesOrderPo', 'PoCode', 'PO'],
    ['ShipmentPlan', 'PlanNo', 'KH'],
  ] as const) {
    await sql`UPDATE dbo.${sql.table(table)} SET ${sql.ref(column)} = CONCAT(${prefix}, '-', BranchCode, '-', RIGHT('000000' + CAST(Id AS VARCHAR(10)), 6))
              WHERE BranchCode = ${branch} AND ${sql.ref(column)} LIKE '~%'`.execute(db);
  }
  return stats;
}
