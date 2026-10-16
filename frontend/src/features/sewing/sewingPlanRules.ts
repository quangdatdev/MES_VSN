// Tính toán của màn Kế hoạch may (phase 5.16, quyết định 14.1, 14.2), tách khỏi giao diện để test. Máy chủ tính lại và kiểm khi lưu.
import { MASK } from '../../lib/fieldPolicy';
import type { GroupedOption } from '../../lib/lines';
import type { LineInfo } from '../../lib/types';
import type { SewingPlanItem } from './api';

/** Giờ mặc định (Q13), như máy chủ */
export const DEFAULT_START = '07:30';
export const DEFAULT_END = '17:10';
/** Dòng tổng ở cuối lưới (theo ảnh mẫu) */
export const TOTAL_KEY = 'total';
/** Giá trị của lựa chọn "mọi chuyền của đơn vị cơ sở" ở ô Đơn vị phòng ban */
export const ALL_DEPT = '*';

/** Một dòng của lưới: dữ liệu máy chủ cộng bốn ô nhập và số đã lưu của chúng (để biết ô nào đã sửa) */
export interface PlanRow {
  key: string;
  item: SewingPlanItem | null;
  linemapQty: number | null;
  dayQty: number | null;
  startTime: string | null;
  endTime: string | null;
  saved: { linemapQty: number | null; dayQty: number | null; startTime: string; endTime: string };
  /** Dòng tổng: không nhập */
  total?: boolean;
}

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const text = (v: unknown): string | null => (typeof v === 'string' && v !== MASK ? v : null);
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const rowKey = (i: Pick<SewingPlanItem, 'lineId'>) => String(i.lineId);

/** Dòng của lưới từ dữ liệu máy chủ; `keep`: số đang gõ của dòng chưa lưu (giữ khi tải lại) */
export function rowsOf(items: SewingPlanItem[], keep?: Map<string, PlanRow>): PlanRow[] {
  return items.map((item) => {
    const saved = { linemapQty: num(item.linemapQty), dayQty: num(item.dayQty), startTime: text(item.startTime) ?? DEFAULT_START, endTime: text(item.endTime) ?? DEFAULT_END };
    const draft = keep?.get(rowKey(item));
    const typed = draft && item.canEdit ? draft : null;
    return {
      key: rowKey(item),
      item,
      linemapQty: typed ? typed.linemapQty : saved.linemapQty,
      dayQty: typed ? typed.dayQty : saved.dayQty,
      startTime: typed ? typed.startTime : saved.startTime,
      endTime: typed ? typed.endTime : saved.endTime,
      saved,
    };
  });
}

/** Đã giao = tổng các ngày trước ngày đang xem + số đang gõ của ngày đó; không tính được thì theo máy chủ */
export function deliveredOf(r: PlanRow): number | string | null {
  const i = r.item;
  if (!i) return null;
  if (i.otherBefore != null && i.dayQty !== MASK) return i.otherBefore + (r.dayQty ?? 0);
  return i.deliveredQty === undefined ? null : (i.deliveredQty as number | string);
}

/** Còn lại = Tổng kế hoạch − Đã giao */
export function remainOf(r: PlanRow): number | string | null {
  const plan = num(r.item?.planQty);
  const delivered = deliveredOf(r);
  if (plan === null || typeof delivered !== 'number') return r.item?.remainQty === MASK ? MASK : null;
  return plan - delivered;
}

/**
 * Giao vượt Tổng kế hoạch (quyết định 14.2): tổng mọi ngày (trước, ngày đang xem, sau) quá Tổng kế hoạch. Như máy chủ, chỉ báo khi số
 * của ngày đang xem tăng (dòng đã vượt từ trước vẫn giảm được). Không đủ số (bị Che, Ẩn) thì để máy chủ kiểm.
 */
export function overPlan(r: PlanRow): boolean {
  const i = r.item;
  const plan = num(i?.planQty);
  if (!i || plan === null || i.otherBefore == null || i.otherAfter == null) return false;
  return i.otherBefore + i.otherAfter + (r.dayQty ?? 0) > plan && (r.dayQty ?? 0) > (r.saved.dayQty ?? 0);
}

/** Doanh số kế hoạch = Kế hoạch theo linemap × Giá CM (làm tròn 2 số lẻ như máy chủ) */
export function revenueOf(r: PlanRow): number | string | null {
  const cm = r.item?.cmPrice;
  if (cm === MASK || r.item?.planRevenue === MASK) return MASK;
  if (r.item?.planRevenue === undefined && cm === undefined) return null;
  if (typeof cm !== 'number' || r.linemapQty == null) return null;
  return Math.round(r.linemapQty * cm * 100) / 100;
}

/** Ô giờ sai: không phải HH:mm, hoặc Đến giờ không sau Từ giờ */
export const badTime = (v: string | null) => v !== null && !HHMM.test(v);
export const timesOutOfOrder = (r: PlanRow) => !!r.startTime && !!r.endTime && HHMM.test(r.startTime) && HHMM.test(r.endTime) && r.endTime <= r.startTime;
/** Số lẻ, số âm: máy chủ chỉ nhận số nguyên ≥ 0 */
export const badQty = (v: number | null) => v !== null && (!Number.isInteger(v) || v < 0);

/** Ô đã sửa của một dòng (khóa không đổi thì không gửi) */
export function changedFields(r: PlanRow) {
  const out: { linemapQty?: number | null; dayQty?: number | null; startTime?: string; endTime?: string } = {};
  if (r.linemapQty !== r.saved.linemapQty) out.linemapQty = r.linemapQty;
  if (r.dayQty !== r.saved.dayQty) out.dayQty = r.dayQty;
  const start = r.startTime ?? DEFAULT_START;
  const end = r.endTime ?? DEFAULT_END;
  if (start !== r.saved.startTime) out.startTime = start;
  if (end !== r.saved.endTime) out.endTime = end;
  return out;
}

/** Thân lệnh Cập nhật: chỉ dòng có ô đã sửa, chỉ ô đã sửa */
export function changes(rows: PlanRow[]) {
  return rows
    .filter((r) => !r.total && r.item?.canEdit)
    .map((r) => ({ r, c: changedFields(r) }))
    .filter(({ c }) => Object.keys(c).length > 0)
    .map(({ r, c }) => ({ lineId: r.item!.lineId, lineCreatedAt: r.item!.lineCreatedAt, ...c }));
}

/** Lý do chưa Cập nhật được (null: được) */
export function saveIssue(rows: PlanRow[]): string | null {
  const data = rows.filter((r) => !r.total && r.item?.canEdit);
  if (!changes(rows).length) return 'Chưa có thay đổi nào';
  if (data.some((r) => badQty(r.linemapQty) || badQty(r.dayQty))) return 'Số kế hoạch là số nguyên từ 0';
  if (data.some((r) => badTime(r.startTime) || badTime(r.endTime))) return 'Giờ nhập dạng hh:mm, ví dụ 07:30';
  if (data.some(timesOutOfOrder)) return 'Đến giờ phải sau Từ giờ';
  if (data.some(overPlan)) return 'Có dòng giao vượt Tổng kế hoạch (tô đỏ). Muốn giao thêm, tăng Số lượng ở Xếp chuyền trước';
  return null;
}

/** Tổng của một cột số; có ô bị Che thì "***", không có ô nào là số thì null */
function sum(values: (number | string | null | undefined)[]): number | string | null {
  if (values.some((v) => v === MASK)) return MASK;
  const nums = values.filter((v): v is number => typeof v === 'number');
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100 : null;
}

/** Các số của dòng Tổng (n dòng): Tổng kế hoạch, Đã giao, Còn lại, linemap, ngày xưởng giao, Doanh số; Giá CM không cộng */
export function totalsOf(rows: PlanRow[]) {
  const data = rows.filter((r) => !r.total);
  return {
    count: data.length,
    planQty: sum(data.map((r) => r.item?.planQty as number | string | undefined)),
    deliveredQty: sum(data.map(deliveredOf)),
    remainQty: sum(data.map(remainOf)),
    linemapQty: sum(data.map((r) => (r.item?.linemapQty === MASK ? MASK : r.linemapQty))),
    dayQty: sum(data.map((r) => (r.item?.dayQty === MASK ? MASK : r.dayQty))),
    planRevenue: sum(data.map(revenueOf)),
  };
}

/** Dòng Tổng ở cuối lưới (chỉ xem) */
export const totalRow = (): PlanRow => ({
  key: TOTAL_KEY,
  item: null,
  linemapQty: null,
  dayQty: null,
  startTime: null,
  endTime: null,
  saved: { linemapQty: null, dayQty: null, startTime: DEFAULT_START, endTime: DEFAULT_END },
  total: true,
});

/**
 * Nhận lưới mới từ SheetGrid: bỏ dòng Tổng, giữ nguyên dòng không sửa được (dán, kéo điền không lọt vào dòng khóa); ô giờ để trống
 * thì về giờ mặc định.
 */
export function settle(next: PlanRow[], prev: PlanRow[]): PlanRow[] {
  const before = new Map(prev.map((r) => [r.key, r]));
  return next
    .filter((r) => !r.total && before.has(r.key))
    .map((r) => {
      const old = before.get(r.key)!;
      if (!old.item?.canEdit) return old;
      return { ...r, startTime: r.startTime ?? DEFAULT_START, endTime: r.endTime ?? DEFAULT_END };
    });
}

/** Lọc dòng theo mã hàng (ô Danh sách mã hàng): không dấu, không phân biệt hoa thường */
export function matchStyle(r: PlanRow, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s || r.total) return true;
  const style = text(r.item?.styleCode)?.toLowerCase() ?? '';
  return style.includes(s) || (r.item?.productName ?? '').toLowerCase().includes(s);
}

/**
 * Lựa chọn của ô Đơn vị phòng ban: cây sơ đồ tổ chức tới chuyền (bộ phận cha từ gốc, `ancestors`). TreeSelect chỉ chọn được lá nên
 * mỗi nhóm có dòng đầu "Cả <bộ phận>" để chọn cả nhánh; dòng đầu danh sách là mọi chuyền của đơn vị cơ sở. Nhiều đơn vị cơ sở (A00)
 * thì thêm cấp đơn vị cơ sở ngoài cùng.
 */
export function deptOptions(lines: LineInfo[], branchName: (code: string) => string = (c) => c): GroupedOption[] {
  const manyBranches = new Set(lines.map((l) => l.branchCode)).size > 1;
  const chainOf = (l: LineInfo) => l.ancestors ?? (l.workshopCode ? [{ code: l.workshopCode, name: l.workshopName ?? l.workshopCode }] : []);
  // Hai bộ phận khác mã trùng tên: tên nhóm kèm mã để không gộp nhầm
  const codesOfName = new Map<string, Set<string>>();
  for (const l of lines) for (const a of chainOf(l)) codesOfName.set(a.name, (codesOfName.get(a.name) ?? new Set()).add(a.code));
  const groupName = (a: { code: string; name: string }) => ((codesOfName.get(a.name)?.size ?? 0) > 1 ? `${a.name} (${a.code})` : a.name);
  const out: GroupedOption[] = [{ value: ALL_DEPT, label: manyBranches ? 'Mọi chuyền' : 'Mọi chuyền của đơn vị cơ sở' }];
  const seen = new Set<string>();
  for (const l of lines) {
    const branch = manyBranches ? [branchName(l.branchCode) || l.branchCode] : [];
    const chain = chainOf(l);
    for (let i = 0; i < chain.length; i++) {
      const a = chain[i];
      if (seen.has(a.code)) continue;
      seen.add(a.code);
      const groups = [...branch, ...chain.slice(0, i + 1).map(groupName)];
      out.push({ value: a.code, label: `Cả ${a.name}`, groups, keywords: a.code });
    }
    out.push({ value: l.code, label: l.name, groups: [...branch, ...chain.map(groupName)].length ? [...branch, ...chain.map(groupName)] : undefined, keywords: l.code });
  }
  return out;
}
