// Dàn chuyền mô phỏng: kế hoạch xuất hàng, dòng dàn chuyền và phân màu cỡ cho các đơn hàng chưa có kế hoạch, xếp kín
// mọi chuyền quanh hôm nay. BRAVO không có dàn chuyền (dữ liệu MES tự lập), dữ liệu seed chỉ có ít: script sinh để bảng
// dàn chuyền, Xếp chuyền, Phân bổ màu cỡ có đủ tình huống khi demo. Người lập "Lập tự động (mô phỏng)".
//
// Tình huống sinh ra (mỗi nhà máy đủ đơn đều có, không phụ thuộc may rủi):
//   - dòng dàn chuyền: đã xong, đang may, đã xếp và đã phân màu cỡ (đủ hoặc một phần), đã xếp chưa phân màu cỡ (có dòng
//     sát ngày vào chuyền); chuyền trống giữa hai việc, một chuyền chờ việc lâu ngay sau hôm nay; ngày nghỉ theo lịch ĐVCS;
//   - kế hoạch: một chuyền hay nhiều chuyền; xếp đủ hay chỉ xếp một phần; chưa xếp chuyền; đơn tách hai đợt xuất;
//     may xong sau ngày xuất.
// Đơn còn mở có ngày xuất thật gần hôm nay vào trước. Nhà máy thiếu đơn còn mở (dữ liệu BRAVO cũ) thì dùng cả đơn đã đóng
// lệnh, và ngày xuất của kế hoạch tính theo dàn chuyền (xong may + 7 ngày) khi ngày xuất thật không khớp lịch.
//
// Dùng: npm run sim:board -- --yes   Thay kế hoạch mô phỏng cũ của mọi nhà máy. Giữ nguyên kế hoạch người dùng lập và kế
// hoạch mô phỏng người dùng đã sửa (không xếp chồng lên dòng dàn chuyền của chúng). load:bravo gọi simulateBranch sau khi
// nạp đơn hàng. Chỉ SQL Server trên máy này.
import { sql, type Kysely } from 'kysely';
import { env } from '../src/config/env';
import type { CoreDatabase } from '../src/platform/database/core.types';
import { createDb } from '../src/platform/database/db';
import type { LineStatus, OrderDatabase, PlanStatus, SalesOrderStatus } from '../src/modules/order/order.types';
import type { SewingDatabase } from '../src/modules/sewing/sewing.types';
import { apportion, lineShares } from '../src/modules/order/order.util';
import { DEFAULT_WORK_CALENDAR, lineDates, nextWorkingDay, productionDaysOf, readWorkCalendars, type LineDates, type WorkCalendar } from '../src/platform/catalog/work-calendar';
import { assertDemoMachine } from './local-db';
import { docNoSql, insertAll, localToday, readLines } from './script-db';
import { prng } from './seed-data';
import { plansWithCuts, plansWithSupply } from './cutting-data';
import { dayPlanLines, hasSewingDb } from './sewing-data';

export const PLANNER_NAME = 'Lập tự động (mô phỏng)';
/** Khoảng xếp kín: lùi PAST_DAYS (thanh đã xong), tới hôm nay + AHEAD_DAYS (bảng mặc định xem tới hôm nay + 60) */
const PAST_DAYS = 42;
const AHEAD_DAYS = 70;
/** May xong trước ngày xuất bấy nhiêu ngày (hoàn thiện, đóng gói) */
const LEAD_DAYS = 7;
/** Đơn nhỏ hơn chỉ dùng khi nhà máy thiếu đơn: thanh 1–2 ngày khó đọc trên bảng */
const MIN_QTY = 600;
/** Năng suất mô phỏng 250–700 sp/ngày, mỗi thanh 2–14 ngày làm việc: một chuyền nhận tối đa bấy nhiêu, phần dư chờ xếp */
const MAX_AVG = 700;
const MAX_DAYS = 14;
/** Số kế hoạch "Chưa xếp chuyền" mỗi nhà máy, ngoài đợt sau của đơn tách đợt */
const UNSCHEDULED = 6;
/** Dòng dàn chuyền tạo sau kế hoạch quá bấy nhiêu phút là người dùng thêm ở Xếp chuyền (mô phỏng tạo cùng lúc) */
const TOUCH_MINUTES = 10;

/** Mức giao màu cỡ của một dòng dàn chuyền: đủ, một phần, chưa giao */
export type Assign = 'full' | 'partial' | 'none';

export interface SimCell {
  color: string;
  size: string;
  qty: number;
}
export interface SimOrder {
  id: number;
  /** Ngày xuất thật của đơn (YYYY-MM-DD) */
  shipDate: string;
  /** Đã đóng lệnh ở nguồn: chỉ dùng khi thiếu đơn còn mở */
  closed: boolean;
  /** Màu cỡ gộp trên mọi PO của đơn */
  cells: SimCell[];
}
/** Dòng dàn chuyền không do lần chạy này sinh (người dùng lập, mô phỏng đã sửa): không xếp chồng lên */
export interface BusyBar {
  lineCode: string;
  start: string;
  end: string;
}
export interface SimLine {
  lineCode: string;
  qty: number;
  avg: number;
  days: number;
  /** Số ngày nghỉ theo lịch ĐVCS, như màn Xếp chuyền tính */
  off: number;
  start: string;
  end: string;
  /** Ngày ra chuyền, nhập kho theo lịch ĐVCS */
  dates: LineDates;
  status: LineStatus;
  assign: Assign;
}
export interface SimPlan {
  orderId: number;
  /** 0: đợt đầu (hoặc cả đơn), 1: đợt sau của đơn tách hai đợt; 2, 3: phần dư chưa xếp chuyền của đợt 0, 1 */
  batch: number;
  cells: { color: string; size: string; originalQty: number; planQty: number }[];
  planQty: number;
  shipDate: string;
  lines: SimLine[];
  status: PlanStatus;
}
interface Job {
  order: SimOrder;
  /** 0, 1: hai đợt xuất; +2: phần dư chưa xếp của đợt đó */
  batch: number;
  cells: SimPlan['cells'];
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => ymd(new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const qtyOf = (cells: { qty: number }[]) => sum(cells.map((c) => c.qty));
const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
};
/** Khóa màu cỡ theo cách collation mặc định của SQL Server so sánh (không phân biệt hoa thường, bỏ khoảng trắng cuối) */
export const cellKey = (color: string, size: string) => `${color.normalize('NFC').toLowerCase().trimEnd()}\u0000${size.normalize('NFC').toLowerCase().trimEnd()}`;

/**
 * Xếp lịch mô phỏng cho một nhà máy (hàm thuần, xác định theo nhà máy và ngày): lần lượt lấy chuyền rảnh sớm nhất, giao
 * đơn kế tiếp, tới khi mọi chuyền kín tới hôm nay + AHEAD_DAYS hoặc hết đơn. Trạng thái dòng tính theo ngày so với hôm nay.
 */
export function planBoard({
  branch,
  today,
  lines,
  orders,
  busy = [],
  calendar = DEFAULT_WORK_CALENDAR,
}: {
  branch: string;
  today: string;
  lines: string[];
  orders: SimOrder[];
  busy?: BusyBar[];
  calendar?: WorkCalendar;
}): SimPlan[] {
  const noDays = () => new Error(`Lịch làm việc của ${branch} không đủ ngày làm việc để xếp dàn chuyền. Kiểm tra Danh mục hệ thống › Lịch làm việc.`);
  const workday = (d: string) => {
    const w = nextWorkingDay(calendar, d);
    if (!w) throw noDays();
    return w;
  };
  const rnd = prng([...`${branch}|${today}`].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7));
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  // Tình huống chính phải có ở mọi nhà máy: xảy ra theo xác suất, chưa gặp sau 3 lần đủ điều kiện thì ép
  const seen = new Set<string>();
  const tries = new Map<string, number>();
  const chance = (key: string, p: number) => {
    const n = (tries.get(key) ?? 0) + 1;
    tries.set(key, n);
    const hit = rnd() < p || (!seen.has(key) && n >= 3);
    if (hit) seen.add(key);
    return hit;
  };
  const plans: SimPlan[] = [];

  // Đơn còn mở có ngày xuất gần hôm nay vào trước; đơn đủ lớn trước, thiếu mới lấy đơn nhỏ hay đơn đã đóng lệnh
  const near = (o: SimOrder) => Math.abs(daysBetween(today, o.shipDate));
  const pool = orders.filter((o) => qtyOf(o.cells) > 0).sort((a, b) => Number(a.closed) - Number(b.closed) || near(a) - near(b) || a.id - b.id);
  const need = lines.length * Math.ceil((PAST_DAYS + AHEAD_DAYS) / 7);
  const rank = (o: SimOrder) => (qtyOf(o.cells) >= MIN_QTY ? 0 : 2) + (o.closed ? 1 : 0);
  const picked = [...pool].sort((a, b) => rank(a) - rank(b)).slice(0, need);
  const taken = new Set(picked);
  const toJob = (o: SimOrder): Job => ({ order: o, batch: 0, cells: o.cells.map((c) => ({ color: c.color, size: c.size, originalQty: c.qty, planQty: c.qty })) });

  // Việc cũ (ngày xuất sớm) vào các ô đã qua, việc mới vào các ô sắp tới
  const queue = picked.sort((a, b) => a.shipDate.localeCompare(b.shipDate) || a.id - b.id).map(toJob);
  // Nhà máy ít đơn (xếp hết vẫn chưa kín): giữ lại vài đơn mới nhất làm kế hoạch chưa xếp chuyền
  const reserved = pool.length <= need ? queue.splice(queue.length - Math.min(UNSCHEDULED, Math.floor(queue.length / 10))) : [];
  // Ít đơn thì thu khoảng ngày lại (khoảng 1/3 là đã qua) để phần sắp tới vẫn có việc. Ước mỗi việc ~475 sp/ngày
  const lineDays = sum(queue.map((j) => Math.min(MAX_DAYS, Math.max(2, Math.round(qtyOf(j.order.cells) / 475))) + 1)) / Math.max(1, lines.length);
  const past = Math.min(PAST_DAYS, Math.round(((lineDays * 7) / 6) * 0.35));
  const windowStart = addDays(today, -past);
  const windowEnd = addDays(today, AHEAD_DAYS);

  const unscheduled: Job[] = [];
  const cursor = new Map(lines.map((l) => [l, workday(addDays(windowStart, int(0, 5)))]));
  const busyOf = new Map<string, BusyBar[]>();
  for (const b of busy) push(busyOf, b.lineCode, b);
  /** Ngày vào chuyền sớm nhất của đợt đầu: đợt sau không vào chuyền trước đợt đầu */
  const firstStart = new Map<number, string>();
  // Một chuyền mỗi nhà máy chờ việc lâu ngay sau hôm nay (chuyền trống dài trên bảng)
  const idleLine = lines.length > 1 ? lines[lines.length - 1] : null;
  let idleDone = false;

  const lineState = (start: string, end: string): { status: LineStatus; assign: Assign } => {
    if (end < today) return { status: 'DONE', assign: 'full' };
    if (start <= today) return { status: 'IN_PRODUCTION', assign: 'full' };
    // Càng gần ngày vào chuyền càng nhiều dòng đã phân màu cỡ
    const ahead = daysBetween(today, start);
    const [full, part] = ahead <= 10 ? [0.7, 0.88] : ahead <= 28 ? [0.42, 0.62] : [0.2, 0.26];
    const r = rnd();
    const assign: Assign = r < full ? 'full' : r < part ? 'partial' : 'none';
    return { status: assign === 'none' ? 'PLANNED' : 'ALLOCATED', assign };
  };

  const finish = (job: Job, simLines: SimLine[]): SimPlan => {
    const planQty = sum(job.cells.map((c) => c.planQty));
    const status: PlanStatus = !simLines.length
      ? 'PLANNED'
      : simLines.every((l) => l.status === 'DONE')
        ? 'DONE'
        : simLines.some((l) => l.status === 'DONE' || l.status === 'IN_PRODUCTION')
          ? 'IN_PRODUCTION'
          : 'SCHEDULED';
    const end = simLines.map((l) => l.end).sort().at(-1);
    const real = job.order.shipDate;
    let shipDate: string;
    if (!end) shipDate = real > addDays(today, 14) ? real : addDays(today, int(21, 50));
    // May xong sau ngày xuất: kế hoạch trễ
    else if (status !== 'DONE' && chance('late', 0.08)) shipDate = addDays(end, -int(1, 3));
    // Ngày xuất thật khớp lịch thì giữ
    else if (real > end && real <= addDays(end, 30)) shipDate = real;
    else shipDate = addDays(end, LEAD_DAYS + int(0, 3));
    return { orderId: job.order.id, batch: job.batch, cells: job.cells, planQty, shipDate, lines: simLines, status };
  };

  while (queue.length) {
    const free = lines.filter((l) => cursor.get(l)! <= windowEnd).sort((a, b) => cursor.get(a)!.localeCompare(cursor.get(b)!) || a.localeCompare(b));
    if (!free.length) break;
    const job = queue.shift()!;
    // Đơn tách hai đợt xuất: đợt sau xếp chuyền sau vài việc, hoặc để chưa xếp chuyền
    if (job.batch === 0 && qtyOf(job.order.cells) >= 3000 && chance('split', 0.12)) {
      const share = 0.55 + rnd() * 0.15;
      const first = job.cells.map((c) => ({ ...c, planQty: Math.floor(c.planQty * share) }));
      const second: Job = { order: job.order, batch: 1, cells: job.cells.map((c, i) => ({ ...c, planQty: c.planQty - first[i].planQty })) };
      job.cells = first;
      if (rnd() < 0.5) unscheduled.push(second);
      else queue.splice(Math.min(queue.length, int(6, 12)), 0, second);
    }
    const planQty = sum(job.cells.map((c) => c.planQty));
    if (planQty <= 0) continue;

    // Đơn lớn chia 2–3 chuyền cùng rảnh trong vòng 3 ngày; nhà máy chưa có kế hoạch nhiều chuyền thì ép một kế hoạch vừa
    const lead = free[0];
    const want = planQty >= 12_000 ? 3 : planQty >= 5_000 ? 2 : 1;
    let chosen = [lead, ...free.slice(1).filter((l) => daysBetween(cursor.get(lead)!, cursor.get(l)!) <= 3)].slice(0, want);
    if (chosen.length > 1) seen.add('multi');
    else if (free.length > 1 && planQty >= 2000 && daysBetween(cursor.get(lead)!, cursor.get(free[1])!) <= 7 && chance('multi', 0)) chosen = [lead, free[1]];
    // Kế hoạch sắp tới: một số chỉ xếp một phần, phần còn lại chờ xếp
    const partial = cursor.get(lead)! > today && chance('partial', 0.12);
    const scheduled = partial ? Math.max(1, Math.round(planQty * (0.6 + rnd() * 0.25))) : planQty;
    const shares = apportion(scheduled, chosen.map(() => 0.8 + rnd() * 0.4)).map((q) => Math.min(q, MAX_AVG * MAX_DAYS));
    const simLines: SimLine[] = [];
    for (const [m, code] of chosen.entries()) {
      const qty = shares[m];
      if (qty <= 0) continue;
      let start = cursor.get(code)!;
      if (code === idleLine && !idleDone && start > today) {
        start = addDays(start, int(7, 12));
        idleDone = true;
      } else if (start > windowStart && rnd() < 0.18) start = addDays(start, int(2, 6));
      const after = job.batch === 1 ? firstStart.get(job.order.id) : undefined;
      if (after && start < after) start = after;
      // Số ngày SX tính như màn Xếp chuyền: SL / năng suất, làm tròn theo ngưỡng của lịch ĐVCS
      const target = Math.min(MAX_DAYS, Math.max(2, Math.ceil(qty / int(250, MAX_AVG))));
      const avg = Math.ceil(qty / target);
      const days = productionDaysOf(calendar, qty, avg);
      let end = '';
      let dates: LineDates;
      for (;;) {
        start = workday(start);
        const found = lineDates(calendar, start, days);
        if (!found) throw noDays();
        dates = found;
        end = dates.endDate;
        const hit = busyOf.get(code)?.find((b) => start <= b.end && end >= b.start);
        if (!hit) break;
        start = addDays(hit.end, 1);
      }
      // Dòng có sẵn dài đẩy việc ra ngoài khoảng: chuyền coi như kín, phần SL này chờ xếp
      if (start > windowEnd) {
        cursor.set(code, addDays(windowEnd, 1));
        continue;
      }
      cursor.set(code, addDays(end, 1));
      simLines.push({ lineCode: code, qty, avg, days, off: dates.offDays, start, end, dates, ...lineState(start, end) });
    }
    if (job.batch === 0 && simLines.length) firstStart.set(job.order.id, simLines.map((l) => l.start).sort()[0]);
    // Kế hoạch đã may xong mà còn SL chưa xếp (chuyền nhận tối đa MAX_AVG × MAX_DAYS, chuyền kín): thu kế hoạch về đúng SL đã
    // may, phần dư thành kế hoạch chưa xếp chuyền của cùng đơn. Không thì kế hoạch "Hoàn thành" mà còn SL chờ xếp
    const placed = sum(simLines.map((l) => l.qty));
    if (simLines.length && placed < planQty && simLines.every((l) => l.end < today)) {
      const keep = apportion(placed, job.cells.map((c) => c.planQty));
      unscheduled.push({ order: job.order, batch: job.batch + 2, cells: job.cells.map((c, i) => ({ ...c, planQty: c.planQty - keep[i] })) });
      job.cells = job.cells.map((c, i) => ({ ...c, planQty: keep[i] }));
    }
    plans.push(finish(job, simLines));
  }

  // Bảng nào cũng có đủ mức phân màu cỡ ở dòng sắp vào chuyền: chưa phân (có dòng sát ngày), phân đủ, phân một phần
  const future = plans.flatMap((p) => p.lines).filter((l) => l.start > today);
  future.sort((a, b) => a.start.localeCompare(b.start) || a.lineCode.localeCompare(b.lineCode));
  const set = (l: SimLine, assign: Assign) => Object.assign(l, { assign, status: assign === 'none' ? 'PLANNED' : 'ALLOCATED' });
  const fixed = new Set<SimLine>();
  const soon = future.filter((l) => l.start <= addDays(today, 10));
  if (soon.length) fixed.add(soon.find((l) => l.assign === 'none') ?? set(soon.at(-1)!, 'none'));
  for (const assign of ['full', 'partial'] as const) {
    const l = future.find((x) => x.assign === assign && !fixed.has(x)) ?? future.find((x) => !fixed.has(x));
    if (l) fixed.add(l.assign === assign ? l : set(l, assign));
  }

  // Chưa xếp chuyền: đợt sau của các đơn tách đợt, các đơn giữ lại, thêm vài đơn chưa dùng (ưu tiên đơn còn mở)
  const rest = [...queue, ...pool.filter((o) => !taken.has(o)).map(toJob)];
  const spare = [...reserved, ...rest.filter((j) => j.batch === 1), ...rest.filter((j) => j.batch === 0 && !j.order.closed), ...rest.filter((j) => j.batch === 0 && j.order.closed)];
  for (const job of [...unscheduled, ...spare.slice(0, UNSCHEDULED)]) if (sum(job.cells.map((c) => c.planQty)) > 0) plans.push(finish(job, []));
  return plans;
}

/** Số lượng giao theo màu cỡ của một dòng: đủ, chưa giao, hoặc một phần (các màu cỡ đầu giao đủ, các màu cỡ sau chưa giao). */
export function assignedOf(share: number[], assign: Assign): number[] {
  if (assign === 'none') return share.map(() => 0);
  if (assign === 'full' || sum(share) < 2) return [...share];
  const nonzero = share.filter((q) => q > 0).length;
  if (nonzero >= 2) {
    let seen = 0;
    const half = Math.ceil(nonzero / 2);
    return share.map((q) => (q > 0 && seen++ < half ? q : 0));
  }
  return share.map((q) => (q > 0 ? Math.max(1, Math.floor(q * 0.6)) : 0));
}

/**
 * Lũy kế các công đoạn sau (may, endline, hoàn thiện) theo phần thời gian đã may tới hôm nay. LK cắt luôn 0: lấy từ màn Đồng bộ tiến độ
 * cắt (quyết định 13.6), module Cắt ghi vào khi mở màn.
 */
function progress(plan: SimPlan, today: string) {
  if (!plan.lines.length) return { CutQty: 0, SewnQty: 0, EndlineQty: 0, FinishedQty: 0 };
  if (plan.status === 'DONE') return { CutQty: 0, SewnQty: plan.planQty, EndlineQty: plan.planQty, FinishedQty: plan.planQty };
  const scheduled = sum(plan.lines.map((l) => l.qty));
  const from = plan.lines.map((l) => l.start).sort()[0];
  const to = plan.lines.map((l) => l.end).sort().at(-1)!;
  const frac = Math.max(0, Math.min(1, daysBetween(from, today) / Math.max(1, daysBetween(from, to))));
  const sewn = Math.round(scheduled * frac);
  return {
    CutQty: 0,
    SewnQty: sewn,
    EndlineQty: Math.round(sewn * 0.92),
    FinishedQty: Math.round(sewn * 0.8),
  };
}

/** Đơn đã đóng lệnh khi nạp từ BRAVO: có PO và mọi PO "Đã xác nhận" bởi hệ thống (ConfirmedBy trống), xem load-bravo-orders.ts */
const closedAtLoad = (sourceProductId: number | null, pos: { StatusCode: string; ConfirmedBy: number | null }[]) =>
  sourceProductId !== null && pos.length > 0 && pos.every((p) => p.StatusCode === 'CONFIRMED' && p.ConfirmedBy === null);

/** Dòng dàn chuyền có dữ liệu ở Kế hoạch chuẩn bị SX: Id dòng → thời điểm tạo dòng lúc chép (khớp cả hai như syncFromSchedule) */
export type PrepLines = ReadonlyMap<number, Date | null>;
/** Kế hoạch đang có số cắt ở Đồng bộ tiến độ cắt: Id → thời điểm tạo của kế hoạch (đọc từ MES_Cutting, plansWithCuts) */
export type CutPlans = ReadonlyMap<number, Date>;

/**
 * Xóa kế hoạch mô phỏng của một nhà máy (kèm PO, màu cỡ, dòng dàn chuyền, phân màu cỡ) và trả đơn không còn kế hoạch
 * nào về trạng thái lúc nạp (closedAtLoad: Hoàn thành, còn lại: Mới). simulateBranch chỉ chọn đơn đang đúng trạng thái đó,
 * nên trạng thái trả về là trạng thái trước khi mô phỏng.
 * Giữ kế hoạch mô phỏng người dùng đã sửa (trừ khi `all`): kế hoạch, màu cỡ, dòng hay phân màu cỡ có ModifiedAt; dòng dàn
 * chuyền, phân màu cỡ thêm sau; dòng đã nhập ở Kế hoạch chuẩn bị SX (`prepLines`, đọc từ MES_Sewing).
 * Luôn giữ (kể cả `all`) kế hoạch đã có số cắt (`cutPlans`, đọc từ MES_Cutting): muốn xóa phải Xóa số cắt trước (quyết định 13.4); kế hoạch
 * có dòng dàn chuyền đã lập ở Kế hoạch may (`dayPlanLines`, đọc từ MES_Sewing): Xếp chuyền không bỏ được dòng đó (quyết định 14.2).
 */
export async function clearSimulated(
  trx: Kysely<OrderDatabase>,
  branch: string,
  { prepLines = new Map(), cutPlans = new Map(), dayPlanLines = new Map(), all = false }: { prepLines?: PrepLines; cutPlans?: CutPlans; dayPlanLines?: PrepLines; all?: boolean } = {},
) {
  const plans = await trx.selectFrom('ShipmentPlan').select(['Id', 'SalesOrderId', 'CreatedAt', 'ModifiedAt']).where('BranchCode', '=', branch).where('PlannerName', '=', PLANNER_NAME).execute();
  if (!plans.length) return { removed: 0, kept: 0 };
  const sim = () => trx.selectFrom('ShipmentPlan').select('Id').where('BranchCode', '=', branch).where('PlannerName', '=', PLANNER_NAME);
  const lines = await trx.selectFrom('ShipmentPlanLine').select(['Id', 'ShipmentPlanId', 'CreatedAt', 'ModifiedAt']).where('BranchCode', '=', branch).where('ShipmentPlanId', 'in', sim()).execute();
  // Phân màu cỡ người dùng sửa: dòng có ModifiedAt, hoặc dòng lưu sau lúc lập kế hoạch (màn Phân bổ màu cỡ lưu dòng đổi bằng cách
  // thêm lại, phase 5.13), như dòng dàn chuyền thêm sau
  const editedLines = await trx
    .selectFrom('ShipmentPlanLineColorSize as c')
    .innerJoin('ShipmentPlanLine as l', 'l.Id', 'c.ShipmentPlanLineId')
    .innerJoin('ShipmentPlan as p', 'p.Id', 'l.ShipmentPlanId')
    .select('l.ShipmentPlanId')
    .distinct()
    .where('c.BranchCode', '=', branch)
    .where((eb) => eb.or([eb('c.ModifiedAt', 'is not', null), eb(sql<number>`DATEDIFF(SECOND, p.CreatedAt, c.CreatedAt)`, '>', TOUCH_MINUTES * 60)]))
    .where('l.ShipmentPlanId', 'in', sim())
    .execute();
  const editedCells = await trx.selectFrom('ShipmentPlanColorSize').select('ShipmentPlanId').distinct().where('BranchCode', '=', branch).where('ModifiedAt', 'is not', null).where('ShipmentPlanId', 'in', sim()).execute();
  const created = new Map(plans.map((p) => [p.Id, p.CreatedAt.getTime()]));
  const inPrep = (l: { Id: number; CreatedAt: Date }) => prepLines.has(l.Id) && (prepLines.get(l.Id) == null || prepLines.get(l.Id)!.getTime() === l.CreatedAt.getTime());
  // Cùng Id mà khác thời điểm tạo (dung sai 5 ms như bản chép) là kế hoạch khác: số cắt đó không thuộc kế hoạch này
  const cut = plans.filter((p) => cutPlans.has(p.Id) && Math.abs(cutPlans.get(p.Id)!.getTime() - p.CreatedAt.getTime()) < 5).map((p) => p.Id);
  const planned = lines.filter((l) => dayPlanLines.has(l.Id) && (dayPlanLines.get(l.Id) == null || Math.abs(dayPlanLines.get(l.Id)!.getTime() - l.CreatedAt.getTime()) < 5)).map((l) => l.ShipmentPlanId);
  const touched = new Set<number>([...cut, ...planned, ...(all ? [] : [
    ...plans.filter((p) => p.ModifiedAt !== null).map((p) => p.Id),
    ...lines.filter((l) => l.ModifiedAt !== null || inPrep(l) || l.CreatedAt.getTime() - created.get(l.ShipmentPlanId)! > TOUCH_MINUTES * 60_000).map((l) => l.ShipmentPlanId),
    ...editedLines.map((r) => r.ShipmentPlanId),
    ...editedCells.map((r) => r.ShipmentPlanId),
  ])]);
  const drop = plans.filter((p) => !touched.has(p.Id));
  const dropIds = drop.map((p) => p.Id);
  const dropLines = lines.filter((l) => !touched.has(l.ShipmentPlanId)).map((l) => l.Id);
  for (let i = 0; i < dropLines.length; i += 1000) {
    await trx.deleteFrom('ShipmentPlanLineColorSize').where('BranchCode', '=', branch).where('ShipmentPlanLineId', 'in', dropLines.slice(i, i + 1000)).execute();
  }
  for (let i = 0; i < dropIds.length; i += 1000) {
    const ids = dropIds.slice(i, i + 1000);
    for (const table of ['ShipmentPlanLine', 'ShipmentPlanColorSize', 'ShipmentPlanPo'] as const) {
      await trx.deleteFrom(table).where('BranchCode', '=', branch).where('ShipmentPlanId', 'in', ids).execute();
    }
    await trx.deleteFrom('ShipmentPlan').where('BranchCode', '=', branch).where('PlannerName', '=', PLANNER_NAME).where('Id', 'in', ids).execute();
  }
  const orderIds = [...new Set(drop.map((p) => p.SalesOrderId))];
  for (let i = 0; i < orderIds.length; i += 1000) {
    await sql`
      UPDATE s SET StatusCode = CASE WHEN s.SourceProductId IS NOT NULL
          AND EXISTS (SELECT 1 FROM dbo.SalesOrderPo p WHERE p.SalesOrderId = s.Id)
          AND NOT EXISTS (SELECT 1 FROM dbo.SalesOrderPo p WHERE p.SalesOrderId = s.Id AND NOT (p.StatusCode = 'CONFIRMED' AND p.ConfirmedBy IS NULL))
        THEN 'DONE' ELSE 'NEW' END
      FROM dbo.SalesOrder s
      WHERE s.BranchCode = ${branch} AND s.StatusCode <> 'CANCELLED' AND s.Id IN (${sql.join(orderIds.slice(i, i + 1000))})
        AND NOT EXISTS (SELECT 1 FROM dbo.ShipmentPlan p WHERE p.SalesOrderId = s.Id)`.execute(trx);
  }
  return { removed: drop.length, kept: plans.length - drop.length };
}

/**
 * Xóa kế hoạch mô phỏng cũ rồi sinh lại cho một nhà máy, trong transaction của nơi gọi. `lines`: mã chuyền đang dùng của
 * nhà máy (bộ phận tích "Xưởng sản xuất" ở MES_Hr, đọc bằng readLines); `prepLines`, `cutPlans`, `dayPlanLines`, `all`: như clearSimulated.
 */
export async function simulateBranch(
  trx: Kysely<OrderDatabase>,
  {
    branch,
    lines,
    today,
    plannerId,
    prepLines,
    cutPlans,
    dayPlanLines,
    all,
    calendar,
  }: { branch: string; lines: string[]; today: string; plannerId: number | null; prepLines?: PrepLines; cutPlans?: CutPlans; dayPlanLines?: PrepLines; all?: boolean; calendar: WorkCalendar },
) {
  const { removed, kept } = await clearSimulated(trx, branch, { prepLines, cutPlans, dayPlanLines, all });
  const busy = (await trx.selectFrom('ShipmentPlanLine').select(['LineCode', 'StartDate', 'EndDate']).where('BranchCode', '=', branch).execute()).map((b) => ({
    lineCode: b.LineCode,
    start: ymd(b.StartDate as Date),
    end: ymd(b.EndDate as Date),
  }));
  // Đơn chưa có kế hoạch nào, đang đúng trạng thái lúc nạp (người dùng chưa tự đổi): xóa mô phỏng về sau trả lại đúng trạng thái
  const orders = await trx
    .selectFrom('SalesOrder as s')
    .select(['s.Id', 's.CustomerName', 's.StyleCode', 's.ProductName', 's.OrderType', 's.CmPrice', 's.SyncedAt', 's.ShipDate', 's.StatusCode', 's.SourceProductId'])
    .where('s.BranchCode', '=', branch)
    .where('s.StatusCode', 'in', ['NEW', 'DONE'])
    .where(({ not, exists, selectFrom }) => not(exists(selectFrom('ShipmentPlan as p').select('p.Id').whereRef('p.SalesOrderId', '=', 's.Id'))))
    .execute();
  const pos = await trx.selectFrom('SalesOrderPo').select(['Id', 'SalesOrderId', 'PoNumber', 'StatusCode', 'ConfirmedBy']).where('BranchCode', '=', branch).orderBy('ShipDate').orderBy('Id').execute();
  const cells = await trx
    .selectFrom('SalesOrderPoColorSize as c')
    .innerJoin('SalesOrderPo as p', 'p.Id', 'c.SalesOrderPoId')
    .select(['p.SalesOrderId', 'c.ColorName', 'c.SizeName', 'c.Qty'])
    .where('c.BranchCode', '=', branch)
    .orderBy('p.ShipDate')
    .orderBy('p.Id')
    .orderBy('c.SortOrder')
    .execute();
  const posOf = new Map<number, typeof pos>();
  for (const p of pos) push(posOf, p.SalesOrderId, p);
  // Gộp màu cỡ trên các PO theo cách bảng so trùng (UNIQUE dưới collation mặc định)
  const cellsOf = new Map<number, Map<string, SimCell>>();
  for (const c of cells) {
    const m = cellsOf.get(c.SalesOrderId) ?? new Map<string, SimCell>();
    const k = cellKey(c.ColorName, c.SizeName);
    const cur = m.get(k);
    if (cur) cur.qty += c.Qty;
    else m.set(k, { color: c.ColorName, size: c.SizeName, qty: c.Qty });
    cellsOf.set(c.SalesOrderId, m);
  }
  const candidates = orders.filter((o) => {
    const list = posOf.get(o.Id);
    return !!list && (o.StatusCode === 'DONE') === closedAtLoad(o.SourceProductId, list);
  });
  const info = new Map(candidates.map((o) => [o.Id, o]));
  const plans = planBoard({
    branch,
    today,
    lines,
    busy,
    calendar,
    orders: candidates.map((o) => ({ id: o.Id, shipDate: ymd(o.ShipDate as Date), closed: o.StatusCode === 'DONE', cells: [...(cellsOf.get(o.Id)?.values() ?? [])] })),
  });

  // Ghi theo lô: kế hoạch (số tạm "~đơn-đợt" duy nhất để ghép Id), rồi bảng con, dòng dàn chuyền, phân màu cỡ
  const audit = { BranchCode: branch, CreatedBy: plannerId };
  const tempNo = (p: SimPlan) => `~${p.orderId}-${p.batch}`;
  const planRows = await insertAll(
    trx,
    'ShipmentPlan',
    plans.map((p) => {
      const o = info.get(p.orderId)!;
      return {
        PlanNo: tempNo(p),
        SalesOrderId: o.Id,
        CustomerName: o.CustomerName,
        StyleCode: o.StyleCode,
        ProductName: o.ProductName,
        OrderType: o.OrderType,
        PoBuyDate: `${posOf.get(o.Id)![0].PoNumber.slice(0, 32)} / ${p.shipDate.slice(8, 10)}-${p.shipDate.slice(5, 7)}`,
        PlanQty: p.planQty,
        CmPrice: o.CmPrice,
        SyncedAt: o.SyncedAt,
        ShipDate: p.shipDate,
        PlannerName: PLANNER_NAME,
        ...progress(p, today),
        StatusCode: p.status,
        ...audit,
      };
    }),
    ['Id', 'PlanNo'],
  );
  const planId = new Map(planRows.map((r) => [r.PlanNo as string, r.Id as number]));
  const idOf = (p: SimPlan) => planId.get(tempNo(p))!;
  await insertAll(trx, 'ShipmentPlanPo', plans.flatMap((p) => posOf.get(p.orderId)!.map((po) => ({ ShipmentPlanId: idOf(p), SalesOrderPoId: po.Id, ...audit }))));
  await insertAll(
    trx,
    'ShipmentPlanColorSize',
    plans.flatMap((p) => p.cells.map((c, i) => ({ ShipmentPlanId: idOf(p), ColorName: c.color, SizeName: c.size, OriginalQty: c.originalQty, PlanQty: c.planQty, SortOrder: i, ...audit }))),
  );
  const lineRows = await insertAll(
    trx,
    'ShipmentPlanLine',
    plans.flatMap((p) =>
      p.lines.map((l, m) => ({
        ShipmentPlanId: idOf(p),
        LineCode: l.lineCode,
        Qty: l.qty,
        AvgOutput: l.avg,
        StartDate: l.start,
        ProductionDays: l.days,
        OffDays: l.off,
        EndDate: l.end,
        OutStartDate: l.dates.outStartDate,
        OutEndDate: l.dates.outEndDate,
        WarehouseStartDate: l.dates.warehouseStartDate,
        WarehouseEndDate: l.dates.warehouseEndDate,
        StatusCode: l.status,
        SortOrder: m,
        ...audit,
      })),
    ),
    ['Id', 'ShipmentPlanId', 'SortOrder'],
  );
  const lineId = new Map(lineRows.map((r) => [`${r.ShipmentPlanId}|${r.SortOrder}`, r.Id as number]));
  await insertAll(
    trx,
    'ShipmentPlanLineColorSize',
    plans.flatMap((p) => {
      const shares = lineShares(
        p.cells.map((c) => c.planQty),
        p.lines.map((l) => l.qty),
      );
      // Chỉ lưu phần giao > 0; PlanQty là SL KHXH của màu cỡ ở kế hoạch như lúc lưu ở màn Phân bổ màu cỡ (phase 5.13)
      return p.lines.flatMap((l, m) => {
        const assigned = assignedOf(shares[m], l.assign);
        return p.cells.flatMap((c, n) =>
          assigned[n] > 0 ? [{ ShipmentPlanLineId: lineId.get(`${idOf(p)}|${m}`), ColorName: c.color, SizeName: c.size, PlanQty: c.planQty, AssignedQty: assigned[n], SortOrder: n, ...audit }] : [],
        );
      });
    }),
  );

  // Trạng thái đơn theo các kế hoạch mô phỏng của đơn
  const byOrder = new Map<number, PlanStatus[]>();
  for (const p of plans) push(byOrder, p.orderId, p.status);
  const orderStatus = (s: PlanStatus[]): SalesOrderStatus =>
    s.every((x) => x === 'DONE') ? 'DONE' : s.some((x) => x === 'DONE' || x === 'IN_PRODUCTION') ? 'IN_PRODUCTION' : 'PLANNING';
  const groups = new Map<SalesOrderStatus, number[]>();
  for (const [id, s] of byOrder) push(groups, orderStatus(s), id);
  for (const [status, ids] of groups) {
    for (let i = 0; i < ids.length; i += 1000) {
      await trx.updateTable('SalesOrder').set({ StatusCode: status }).where('BranchCode', '=', branch).where('Id', 'in', ids.slice(i, i + 1000)).execute();
    }
  }
  await sql`UPDATE dbo.ShipmentPlan SET PlanNo = ${sql.raw(docNoSql('KH'))} WHERE BranchCode = ${branch} AND PlanNo LIKE '~%'`.execute(trx);
  // Đơn đang "Đã lập kế hoạch"/"Đang sản xuất" mà không có kế hoạch nào (người dùng xóa kế hoạch, hoặc tự đổi): không tự sửa
  // vì có thể là trạng thái người dùng đặt, chỉ báo
  const stuck = await trx
    .selectFrom('SalesOrder as s')
    .select((eb) => eb.fn.countAll<number>().as('N'))
    .where('s.BranchCode', '=', branch)
    .where('s.StatusCode', 'in', ['PLANNING', 'IN_PRODUCTION'])
    .where(({ not, exists, selectFrom }) => not(exists(selectFrom('ShipmentPlan as p').select('p.Id').whereRef('p.SalesOrderId', '=', 's.Id'))))
    .executeTakeFirst();
  return { removed, kept, plans: plans.length, lines: plans.reduce((s, p) => s + p.lines.length, 0), stuck: Number(stuck?.N ?? 0) };
}

/**
 * Dòng dàn chuyền có dữ liệu người dùng nhập ở Kế hoạch chuẩn bị SX (ngày theo bước, các ô nhập tay của dòng). Đọc trước
 * transaction của MES_Order (hai database không có transaction chung): ngày nhập trong lúc script chạy có thể mất.
 */
async function prepLines(): Promise<Map<number, Date | null>> {
  if (!(await hasSewingDb())) return new Map();
  const db = createDb<SewingDatabase>(env.db.sewingName);
  try {
    const rows = await db
      .selectFrom('SewingPrep as p')
      .select(['p.ShipmentPlanLineId', 'p.SourceCreatedAt'])
      .where((eb) => eb.or([eb('p.ModifiedAt', 'is not', null), eb.exists(eb.selectFrom('SewingPrepStep as s').select('s.Id').whereRef('s.SewingPrepId', '=', 'p.Id'))]))
      .execute();
    return new Map(rows.map((r) => [r.ShipmentPlanLineId, r.SourceCreatedAt]));
  } finally {
    await db.destroy();
  }
}

async function main() {
  assertDemoMachine('simulate-board');
  const all = process.argv.includes('--all');
  if (!process.argv.includes('--yes')) {
    console.log(
      [
        `Lệnh này thay các kế hoạch xuất hàng mô phỏng ("${PLANNER_NAME}") của mọi nhà máy trong ${env.db.orderName} (máy chủ ${env.db.host}):`,
        'xóa kế hoạch mô phỏng cũ cùng dàn chuyền, phân màu cỡ của chúng, rồi xếp lại kín các chuyền quanh hôm nay.',
        `- Chuyền: bộ phận tích "Xưởng sản xuất" đang dùng, có đơn vị cơ sở, trong ${env.db.hrName} (Nhân sự › Sơ đồ tổ chức).`,
        '- Giữ nguyên: kế hoạch người dùng lập; kế hoạch mô phỏng người dùng đã sửa ở Kế hoạch xuất hàng, Xếp chuyền, Phân bổ màu cỡ',
        '  hoặc đã nhập ở Kế hoạch chuẩn bị SX. Thêm --all để xóa cả các kế hoạch đó (kèm ngày chuẩn bị SX đã nhập).',
        '- Luôn giữ (kể cả --all) kế hoạch đã có số cắt ở Đồng bộ tiến độ cắt (muốn xóa thì Xóa số cắt ở màn đó trước), kế hoạch',
        '  có mã hàng đã cấp BTP ở Xác nhận cấp BTP, và kế hoạch có dòng dàn chuyền đã lập ở Kế hoạch may.',
        '- Đơn hàng của kế hoạch bị xóa trở về trạng thái lúc nạp (Mới, hoặc Hoàn thành nếu đã đóng lệnh ở BRAVO).',
        '- Chạy trong một transaction (vài chục giây): backend đang chạy thì các màn đơn hàng chờ tới khi xong.',
        'Chạy lại với: npm run sim:board -- --yes [--all]',
      ].join('\n'),
    );
    return;
  }
  const core = createDb<CoreDatabase>(env.db.coreName);
  const order = createDb<OrderDatabase>(env.db.orderName, { requestTimeoutMs: 10 * 60_000 });
  try {
    const { branches, linesOf, plannerId } = await readLines(core);
    const calendars = await readWorkCalendars(core);
    const prep = all ? new Map<number, Date | null>() : await prepLines();
    // Dòng đã có Kế hoạch may luôn giữ (kể cả --all): Xếp chuyền không bỏ được dòng đó (quyết định 14.2)
    const planned = await dayPlanLines();
    // Giữ cả kế hoạch có mã hàng đã cấp BTP (phần giao không giảm dưới số đã cấp, quyết định 13.8)
    const cuts = new Map([...(await plansWithCuts()), ...(await plansWithSupply(order))]);
    const today = localToday();
    const stats: Record<string, Record<string, number>> = {};
    let stuck = 0;
    await order.transaction().execute(async (trx) => {
      for (const branch of branches) {
        const s = await simulateBranch(trx, { branch, lines: linesOf(branch), today, plannerId, prepLines: prep, cutPlans: cuts, dayPlanLines: planned, all, calendar: calendars.get(branch) ?? DEFAULT_WORK_CALENDAR });
        stats[branch] = { 'kế hoạch cũ đã xóa': s.removed, 'giữ lại (người dùng đã sửa)': s.kept, 'kế hoạch mô phỏng': s.plans, 'dòng dàn chuyền': s.lines };
        stuck += s.stuck;
      }
    });
    console.log(`Đã xếp dàn chuyền mô phỏng (hôm nay ${today}):`);
    console.table(stats);
    if (stuck) console.warn(`Có ${stuck} đơn hàng ở trạng thái "Đã lập kế hoạch"/"Đang sản xuất" mà không có kế hoạch nào: kiểm tra ở Thông tin đơn hàng.`);
    // Nhật ký ở MES_Core ghi sau khi MES_Order đã commit (không có transaction chung giữa hai database): lỗi thì báo rõ
    await core
      .insertInto('SysAuditLog')
      .values({ EntityType: 'System', ActionCode: 'BOARD_SIMULATE', NewValue: JSON.stringify({ by: 'scripts/simulate-board.ts', today, all, stats }) } as any)
      .execute()
      .catch((e) => console.warn('Đã xếp xong nhưng chưa ghi được nhật ký hệ thống:', e.message ?? e));
  } finally {
    await core.destroy();
    await order.destroy();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Xếp dàn chuyền mô phỏng lỗi:', e.message ?? e);
    process.exit(1);
  });
}
