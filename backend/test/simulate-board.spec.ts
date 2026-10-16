import { DEFAULT_WORK_CALENDAR, isOffDay, lineDates, productionDaysOf, type CalendarDay, type WorkCalendar } from '../src/platform/catalog/work-calendar';
import { assignedOf, cellKey, planBoard, type SimOrder, type SimPlan } from '../scripts/simulate-board';
import { lineShares } from '../src/modules/order/order.util';

// Không cần database: phần xếp lịch thuần của dàn chuyền mô phỏng (scripts/simulate-board.ts). Phần ghi DB: simulate-board.db.spec.ts
const TODAY = '2026-10-10';
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const lineCodes = (n: number, branch = 'A01') => Array.from({ length: n }, (_, i) => `${branch}-L${String(i + 1).padStart(2, '0')}`);
const LINES = lineCodes(12);

/** Đơn giả: số lượng 200–32.000 (có đơn vượt sức một chuyền), ngày xuất rải từ 4 tháng trước tới 3 tháng sau, một phần đã đóng lệnh */
function orders(n: number, closedEvery = 4, today = TODAY): SimOrder[] {
  return Array.from({ length: n }, (_, i) => {
    const qty = [200, 900, 1800, 3500, 6000, 13000, 2400, 700, 32000][i % 9] + i * 7;
    const colors = ['Navy', 'Black', 'Red'].slice(0, 1 + (i % 3));
    const sizes = ['S', 'M', 'L', 'XL'];
    const cells = colors.flatMap((color) => sizes.map((size) => ({ color, size, qty: 0 })));
    cells.forEach((c, k) => (c.qty = Math.floor(qty / cells.length) + (k < qty % cells.length ? 1 : 0)));
    return { id: i + 1, shipDate: addDays(today, -120 + ((i * 37) % 210)), closed: i % closedEvery === 0, cells };
  });
}

const allLines = (plans: SimPlan[]) => plans.flatMap((p) => p.lines.map((l) => ({ ...l, plan: p })));
const gapsOf = (bars: { lineCode: string; start: string; end: string }[], lines: string[]) =>
  lines.flatMap((line) => {
    const list = bars.filter((b) => b.lineCode === line).sort((a, b) => a.start.localeCompare(b.start));
    return list.slice(1).map((b, i) => ({ line, from: list[i].end, days: Math.round((Date.parse(b.start) - Date.parse(list[i].end)) / 86_400_000) - 1 }));
  });

describe('Dàn chuyền mô phỏng: xếp lịch', () => {
  const busy = [{ lineCode: 'A01-L03', start: addDays(TODAY, 3), end: addDays(TODAY, 9) }];
  const plans = planBoard({ branch: 'A01', today: TODAY, lines: LINES, orders: orders(400), busy });
  const bars = allLines(plans);

  it('không chồng lịch trên cùng chuyền, kể cả dòng có sẵn', () => {
    for (const line of LINES) {
      const list = [...bars.filter((b) => b.lineCode === line), ...busy.filter((b) => b.lineCode === line)].sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 1; i < list.length; i++) expect(list[i].start > list[i - 1].end).toBe(true);
    }
  });

  it('số ngày, ngày kết thúc, ra chuyền, nhập kho tính như màn Xếp chuyền; năng suất tối đa 700; không vào chuyền ngày Chủ nhật', () => {
    for (const b of bars) {
      expect(b.qty).toBeGreaterThan(0);
      expect(b.days).toBe(productionDaysOf(DEFAULT_WORK_CALENDAR, b.qty, b.avg));
      expect(b.days).toBeLessThanOrEqual(14);
      expect(b.avg).toBeLessThanOrEqual(700);
      const dates = lineDates(DEFAULT_WORK_CALENDAR, b.start, b.days)!;
      expect({ end: b.end, off: b.off, dates: b.dates }).toEqual({ end: dates.endDate, off: dates.offDays, dates });
      expect(new Date(`${b.start}T00:00:00Z`).getUTCDay()).not.toBe(0);
    }
  });

  it('theo lịch ĐVCS: không vào chuyền ngày nghỉ lễ, ngày tính theo lịch, Chủ nhật làm bù vào chuyền được', () => {
    // Nghỉ 10 ngày ngay sau hôm nay; Chủ nhật đầu tiên sau đợt nghỉ là ngày làm bù
    const days = new Map<string, CalendarDay>();
    for (let i = 2; i < 12; i++) days.set(addDays(TODAY, i), { date: addDays(TODAY, i), dayType: 'OFF', name: 'Nghỉ' });
    days.set('2026-10-25', { date: '2026-10-25', dayType: 'WORK', name: 'Làm bù' });
    const calendar: WorkCalendar = { ...DEFAULT_WORK_CALENDAR, days };
    const list = allLines(planBoard({ branch: 'A01', today: TODAY, lines: LINES, orders: orders(400), calendar }));
    expect(list.length).toBeGreaterThan(50);
    for (const b of list) {
      expect(isOffDay(calendar, b.start)).toBe(false);
      const dates = lineDates(calendar, b.start, b.days)!;
      expect({ end: b.end, off: b.off, dates: b.dates }).toEqual({ end: dates.endDate, off: dates.offDays, dates });
    }
    // Dòng chạy qua đợt nghỉ có số ngày nghỉ gồm cả đợt nghỉ
    expect(list.some((b) => b.start <= addDays(TODAY, 2) && b.end >= addDays(TODAY, 11) && b.off >= 10)).toBe(true);
  });

  it('trạng thái dòng theo ngày so với hôm nay; dòng đã vào chuyền thì đã giao đủ màu cỡ', () => {
    for (const b of bars) {
      if (b.end < TODAY) expect(b.status).toBe('DONE');
      else if (b.start <= TODAY) expect(b.status).toBe('IN_PRODUCTION');
      else expect(b.status).toBe(b.assign === 'none' ? 'PLANNED' : 'ALLOCATED');
      if (b.status === 'DONE' || b.status === 'IN_PRODUCTION') expect(b.assign).toBe('full');
    }
  });

  it('kế hoạch: SL các dòng không vượt SL kế hoạch, trạng thái theo dòng, hai đợt không vượt SL gốc, đợt sau không vào chuyền trước đợt đầu', () => {
    const byOrder = new Map<number, SimPlan[]>();
    for (const p of plans) byOrder.set(p.orderId, [...(byOrder.get(p.orderId) ?? []), p]);
    for (const p of plans) {
      expect(p.lines.reduce((s, l) => s + l.qty, 0)).toBeLessThanOrEqual(p.planQty);
      // Kế hoạch đã may xong thì đã xếp đủ SL (phần dư tách thành kế hoạch chưa xếp)
      if (p.status === 'DONE') expect(p.lines.reduce((s, l) => s + l.qty, 0)).toBe(p.planQty);
      expect(p.planQty).toBe(p.cells.reduce((s, c) => s + c.planQty, 0));
      const s = p.lines.map((l) => l.status);
      const want = !s.length ? 'PLANNED' : s.every((x) => x === 'DONE') ? 'DONE' : s.some((x) => x === 'DONE' || x === 'IN_PRODUCTION') ? 'IN_PRODUCTION' : 'SCHEDULED';
      expect(p.status).toBe(want);
    }
    for (const list of byOrder.values()) {
      expect(new Set(list.map((p) => p.batch)).size).toBe(list.length);
      list[0].cells.forEach((c, i) => expect(list.reduce((s, p) => s + p.cells[i].planQty, 0)).toBeLessThanOrEqual(c.originalQty));
      const [first, second] = [list.find((p) => p.batch === 0), list.find((p) => p.batch === 1)];
      if (first?.lines.length && second?.lines.length) {
        expect(second.lines.map((l) => l.start).sort()[0] >= first.lines.map((l) => l.start).sort()[0]).toBe(true);
      }
    }
  });

  it('kế hoạch chưa xếp chuyền ưu tiên đơn còn mở', () => {
    const closed = new Set(orders(400).filter((o) => o.closed).map((o) => o.id));
    for (const p of plans.filter((x) => !x.lines.length && x.batch === 0)) expect(closed.has(p.orderId)).toBe(false);
  });

  it('chạy lại cùng dữ liệu, cùng ngày cho cùng kết quả', () => {
    expect(planBoard({ branch: 'A01', today: TODAY, lines: LINES, orders: orders(400), busy })).toEqual(plans);
  });

  it('dòng có sẵn quá dài không đẩy thanh mô phỏng ra ngoài khoảng xếp', () => {
    const long = [{ lineCode: 'A01-L01', start: addDays(TODAY, -30), end: '2030-12-31' }];
    const out = allLines(planBoard({ branch: 'A01', today: TODAY, lines: LINES, orders: orders(400), busy: long }));
    expect(out.every((b) => b.start <= addDays(TODAY, 70))).toBe(true);
    expect(out.some((b) => b.lineCode === 'A01-L01' && b.end >= addDays(TODAY, -30))).toBe(false);
  });

  // Mỗi tình huống phải có ở mọi nhà máy, mọi ngày chạy (không nhờ hạt giống may mắn): rải 24 ngày trong năm × 6, 8, 12 chuyền
  const days = Array.from({ length: 24 }, (_, i) => addDays('2026-01-03', i * 15 + (i % 4)));
  it.each([6, 8, 12])('đủ tình huống với %i chuyền ở 24 ngày chạy khác nhau', (n) => {
    const lines = lineCodes(n);
    for (const today of days) {
      const ps = planBoard({ branch: 'A01', today, lines, orders: orders(n * 20, 4, today) });
      const bs = allLines(ps);
      const gaps = gapsOf(bs, lines);
      const has = {
        done: bs.some((b) => b.status === 'DONE'),
        sewing: bs.some((b) => b.status === 'IN_PRODUCTION'),
        allocatedFull: bs.some((b) => b.status === 'ALLOCATED' && b.assign === 'full'),
        allocatedPartial: bs.some((b) => b.status === 'ALLOCATED' && b.assign === 'partial'),
        plannedSoon: bs.some((b) => b.status === 'PLANNED' && b.start <= addDays(today, 10)),
        gap: gaps.some((g) => g.days >= 2),
        idleLine: gaps.some((g) => g.line === lines.at(-1) && g.days >= 7 && g.from >= addDays(today, -1)),
        multiLine: ps.some((p) => p.lines.length >= 2),
        partialSchedule: ps.some((p) => p.lines.length > 0 && p.lines.reduce((s, l) => s + l.qty, 0) < p.planQty),
        unscheduled: ps.some((p) => !p.lines.length),
        split: ps.some((p) => p.batch === 1),
        late: ps.some((p) => p.lines.length && p.status !== 'DONE' && p.shipDate < p.lines.map((l) => l.end).sort().at(-1)!),
      };
      expect({ today, ...has }).toEqual({ today, ...Object.fromEntries(Object.keys(has).map((k) => [k, true])) });
      const shortDone = ps.filter((p) => p.status === 'DONE' && p.lines.reduce((s, l) => s + l.qty, 0) !== p.planQty);
      expect({ today, shortDone: shortDone.length }).toEqual({ today, shortDone: 0 });
    }
  });

  it('nhà máy ít đơn: thu khoảng ngày để phần sắp tới vẫn có việc, vẫn có kế hoạch chưa xếp; không có chuyền thì chỉ lập kế hoạch chưa xếp', () => {
    const few = planBoard({ branch: 'A03', today: TODAY, lines: LINES.slice(0, 6), orders: orders(70, 1) });
    const fewBars = allLines(few);
    expect(fewBars.some((b) => b.status === 'IN_PRODUCTION')).toBe(true);
    expect(fewBars.filter((b) => b.start > TODAY).length).toBeGreaterThan(5);
    expect(few.some((p) => !p.lines.length)).toBe(true);
    const none = planBoard({ branch: 'A04', today: TODAY, lines: [], orders: orders(20) });
    expect(none.length).toBeGreaterThan(0);
    expect(none.every((p) => !p.lines.length && p.status === 'PLANNED')).toBe(true);
  });
});

describe('Dàn chuyền mô phỏng: màu cỡ', () => {
  const total = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

  it('giao đủ, chưa giao, một phần (các màu cỡ đầu giao đủ, sau chưa giao)', () => {
    expect(assignedOf([5, 3, 2], 'full')).toEqual([5, 3, 2]);
    expect(assignedOf([5, 3, 2], 'none')).toEqual([0, 0, 0]);
    expect(assignedOf([5, 3, 2, 4], 'partial')).toEqual([5, 3, 0, 0]);
    expect(assignedOf([0, 5, 0, 3, 2], 'partial')).toEqual([0, 5, 0, 3, 0]);
  });

  it('một phần luôn giao được ít nhất 1 và chưa đủ; quá nhỏ để chia thì giao đủ', () => {
    for (const share of [[10], [0, 7, 0], [2], [1, 1], [3, 0]]) {
      const out = assignedOf(share, 'partial');
      expect(total(out)).toBeGreaterThan(0);
      expect(total(out)).toBeLessThan(total(share));
      out.forEach((q, i) => expect(q).toBeLessThanOrEqual(share[i]));
    }
    expect(assignedOf([1], 'partial')).toEqual([1]);
    expect(assignedOf([0, 1, 0], 'partial')).toEqual([0, 1, 0]);
  });

  it('chia màu cỡ cho các dòng: mỗi dòng đúng SL dòng, mỗi màu cỡ cộng các dòng không vượt SL kế hoạch', () => {
    expect(lineShares([1, 1], [1, 1])).toEqual([
      [1, 0],
      [0, 1],
    ]);
    for (const [cells, qtys] of [
      [[7, 3, 5, 1], [6, 6, 4]],
      [[100, 0, 51], [50, 50]],
      [[13, 13, 13], [1, 1, 1, 1, 1]],
    ]) {
      const shares = lineShares(cells, qtys);
      shares.forEach((s, m) => expect(total(s)).toBe(qtys[m]));
      cells.forEach((c, i) => expect(total(shares.map((s) => s[i]))).toBeLessThanOrEqual(c));
    }
  });

  it('khóa màu cỡ so như SQL Server: không phân biệt hoa thường, khoảng trắng cuối, chữ dựng sẵn và tổ hợp', () => {
    expect(cellKey('Navy ', 'm')).toBe(cellKey('NAVY', 'M'));
    expect(cellKey('Đỏ'.normalize('NFD'), 'L')).toBe(cellKey('Đỏ'.normalize('NFC'), 'L'));
    expect(cellKey('Navy', 'M')).not.toBe(cellKey('Navy', 'L'));
  });
});
