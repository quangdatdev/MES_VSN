// Luật của popup "Phân màu cỡ cho chuyền" (phase 5.13), hàm thuần để kiểm bằng test (ô của lưới nhập không vẽ ở jsdom). Máy chủ
// kiểm lại cùng luật khi lưu (backend color-size.service.ts): một chuyền một màu cỡ một dòng; tổng giao của một màu cỡ trên mọi
// chuyền không vượt SL kế hoạch của màu cỡ; tổng giao của một chuyền không vượt SL đã xếp cho chuyền đó ở Xếp chuyền.
import { MASK } from '../../lib/fieldPolicy';
import { fmtDate, fmtNum } from '../../lib/format';
import type { AllocationCell, AllocationDetail, AllocationLine } from './api';

/** Một dòng của lưới nhập: phần giao của một chuyền cho một màu cỡ */
export interface EditRow {
  key: number;
  /** Id dòng dàn chuyền; null: chưa chọn chuyền */
  lineId: number | null;
  colorName: string;
  sizeName: string;
  /** null: ô trống (lưu là không giao) */
  assignedQty: number | null;
  /** Dòng của chuyền người xem không sửa được: chỉ hiện, không gửi lên, không xóa được */
  locked: boolean;
  /** Số lượng giao bị Che với người xem (chỉ ở lưới xem) */
  masked?: boolean;
  /** Dòng lưới vừa tạo (thêm, chèn, dán quá cuối), chưa có màu cỡ: `settleNew` chép màu cỡ của dòng ngay trên */
  fresh?: boolean;
}

type Detail = Pick<AllocationDetail, 'lines' | 'colorSizes' | 'rows'>;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** Khóa màu cỡ so như máy chủ: không phân biệt hoa thường, bỏ khoảng trắng hai đầu */
export const cellKey = (color: string, size: string) => `${color.trim().toLowerCase()}\u0000${size.trim().toLowerCase()}`;

let nextKey = 1;
const blank = (lineId: number | null, c?: AllocationCell): EditRow => ({ key: nextKey++, lineId, colorName: c?.colorName ?? '', sizeName: c?.sizeName ?? '', assignedQty: null, locked: false });

/** Chuyền duy nhất người xem sửa được (chọn sẵn cho dòng chưa giao: chỉ có một lựa chọn), không thì null */
export function onlyEditable(lines: AllocationLine[]): number | null {
  const editable = lines.filter((l) => l.editable);
  return editable.length === 1 ? editable[0].id : null;
}

/** Dòng lưới vừa tạo: chưa có màu cỡ, chuyền, số; `settleNew` điền màu cỡ theo vị trí của dòng */
export const freshRow = (): EditRow => ({ ...blank(null), fresh: true });

/**
 * Điền dòng vừa tạo theo vị trí: chép màu, cỡ của dòng ngay trên (dòng đầu lưới thì dòng ngay dưới), chuyền chọn sẵn khi người
 * dùng chỉ sửa được một chuyền. Màu cỡ không chọn được trên lưới nên dòng luôn thuộc màu cỡ của chỗ nó được chèn, dù chèn bằng
 * nút Thêm, menu chuột phải hay Shift+Enter. Dòng vừa tạo mà đã có chuyền hoặc số là dòng do dán quá cuối lưới: bỏ (không
 * biết màu cỡ của nó), trả số dòng bỏ để báo người dùng.
 */
export function settleNew(rows: EditRow[], lines: AllocationLine[]): { rows: EditRow[]; dropped: number } {
  if (!rows.some((r) => r.fresh)) return { rows, dropped: 0 };
  const out: EditRow[] = [];
  let dropped = 0;
  rows.forEach((r, i) => {
    if (!r.fresh) return void out.push(r);
    const src = out.at(-1) ?? rows.slice(i + 1).find((x) => !x.fresh);
    if (r.lineId !== null || r.assignedQty !== null || !src) return void dropped++;
    out.push({ key: r.key, lineId: onlyEditable(lines), colorName: src.colorName, sizeName: src.sizeName, assignedQty: null, locked: false });
  });
  return { rows: out, dropped };
}

/**
 * Màu cỡ của kế hoạch mất hết dòng người dùng sửa được sau một lần đổi (xóa nhiều dòng một lúc): màu cỡ không thêm lại được trên
 * lưới nên chặn lần đổi đó. Trả "màu / cỡ" của các màu cỡ bị mất.
 */
export function lostCells(before: EditRow[], next: EditRow[], d: Pick<AllocationDetail, 'colorSizes'>): string[] {
  const mine = (rows: EditRow[]) => new Set(rows.filter((r) => !r.locked).map((r) => cellKey(r.colorName, r.sizeName)));
  const had = mine(before);
  const has = mine(next);
  return d.colorSizes.filter((c) => had.has(cellKey(c.colorName, c.sizeName)) && !has.has(cellKey(c.colorName, c.sizeName))).map((c) => `${c.colorName} / ${c.sizeName}`);
}

/** Tách một màu cỡ cho chuyền khác: bản sao giữ màu, cỡ, bỏ chuyền và số lượng */
export const splitRow = (r: EditRow): EditRow => ({ ...r, key: nextKey++, lineId: null, assignedQty: null, locked: false });

/** Màu cỡ chưa có dòng sửa được thì thêm một dòng trống (người chỉ xem: chỉ khi màu cỡ chưa có dòng nào) */
function withBlank(out: EditRow[], cellRows: EditRow[], c: AllocationCell, lines: AllocationLine[]) {
  out.push(...cellRows);
  const canEdit = lines.some((l) => l.editable);
  if (canEdit ? !cellRows.some((r) => !r.locked) : cellRows.length === 0) out.push(blank(onlyEditable(lines), c));
}

/**
 * Dòng lưới lúc mở popup: theo thứ tự màu cỡ của kế hoạch, mỗi phần giao đã lưu một dòng (theo thứ tự chuyền); màu cỡ chưa giao có
 * một dòng trống. Phần giao của màu cỡ không còn trong kế hoạch xếp cuối để người dùng thấy và bỏ đi.
 */
export function initialRows(d: Detail): EditRow[] {
  const order = new Map(d.lines.map((l, i) => [l.id, i]));
  const editable = new Set(d.lines.filter((l) => l.editable).map((l) => l.id));
  const byCell = new Map<string, EditRow[]>();
  for (const r of [...d.rows].sort((a, b) => (order.get(a.lineId) ?? 0) - (order.get(b.lineId) ?? 0))) {
    const k = cellKey(r.colorName, r.sizeName);
    const row: EditRow = { key: nextKey++, lineId: r.lineId, colorName: r.colorName, sizeName: r.sizeName, assignedQty: num(r.assignedQty), locked: !editable.has(r.lineId), masked: r.assignedQty === MASK || undefined };
    byCell.set(k, [...(byCell.get(k) ?? []), row]);
  }
  const out: EditRow[] = [];
  for (const c of d.colorSizes) {
    const k = cellKey(c.colorName, c.sizeName);
    withBlank(out, byCell.get(k) ?? [], c, d.lines);
    byCell.delete(k);
  }
  for (const rest of byCell.values()) out.push(...rest);
  return out;
}

/**
 * Dòng cuối cùng người dùng sửa được của một màu cỡ có trong kế hoạch: không cho xóa, vì màu, cỡ không chọn lại được trên lưới
 * (dòng mới chỉ chép màu cỡ của dòng đang có). Không giao thì để trống số lượng giao.
 */
export function lastOfCell(rows: EditRow[], r: EditRow, d: Pick<AllocationDetail, 'colorSizes'>): boolean {
  const k = cellKey(r.colorName, r.sizeName);
  if (r.locked || !d.colorSizes.some((c) => cellKey(c.colorName, c.sizeName) === k)) return false;
  return !rows.some((x) => x.key !== r.key && !x.locked && cellKey(x.colorName, x.sizeName) === k);
}

/** Phần gửi lên: dòng của chuyền sửa được, đã chọn chuyền, có số lượng giao (dòng trống, dòng 0 là không giao) */
export function payload(rows: EditRow[]) {
  return rows
    .filter((r) => !r.locked && r.lineId !== null && (r.assignedQty ?? 0) > 0)
    .map((r) => ({ lineId: r.lineId as number, colorName: r.colorName, sizeName: r.sizeName, assignedQty: r.assignedQty as number }));
}

/** Dấu của phần gửi lên: biết đã đổi gì chưa (chọn sẵn chuyền cho dòng trống không tính là đổi) */
export const signature = (rows: EditRow[]) => JSON.stringify(payload(rows));

/** Vị trí của dòng trong khối gộp: `open` còn dòng cùng màu cỡ ngay dưới, `next` nối tiếp dòng ngay trên */
export interface MergeState {
  open: boolean;
  next: boolean;
  /** Số dòng của khối */
  size: number;
  /** Thứ tự của dòng trong khối, từ 0 */
  pos: number;
}

/**
 * Khối gộp ô của lưới, chỉ để hiển thị (dữ liệu vẫn mỗi chuyền một dòng): các dòng liền nhau cùng màu cỡ hiện Màu, Cỡ, SL KH,
 * Còn lại một lần như ô merge của Excel. Dòng chưa có đủ màu, cỡ không gộp. Dòng khóa (chuyền không sửa được) gộp chung với dòng
 * sửa được: bốn cột gộp đều chỉ đọc, cùng nền. Chỉ có dòng thuộc khối từ hai dòng trở lên.
 */
export function mergeRuns(rows: EditRow[]): Map<number, MergeState> {
  const keys = rows.map((r) => (r.colorName.trim() && r.sizeName.trim() ? cellKey(r.colorName, r.sizeName) : null));
  const out = new Map<number, MergeState>();
  for (let i = 0; i < rows.length; ) {
    let j = i + 1;
    while (keys[i] !== null && j < rows.length && keys[j] === keys[i]) j++;
    const size = j - i;
    if (size > 1) for (let pos = 0; pos < size; pos++) out.set(rows[i + pos].key, { open: pos < size - 1, next: pos > 0, size, pos });
    i = j;
  }
  return out;
}

/**
 * Lớp CSS của ô gộp ở lưới nhập. Lưới nhập vẽ từng dòng riêng (không có rowspan): chữ đặt ở dòng giữa khối, khối chẵn dòng thì
 * dời lên nửa dòng (`merge-half`), để chữ nằm giữa cả khối; các dòng khác ẩn chữ khỏi mắt (`merge-quiet`).
 */
export function mergeClass(m: MergeState | undefined): string | undefined {
  if (!m) return undefined;
  const mid = Math.floor(m.size / 2);
  const text = m.pos !== mid ? 'merge-quiet' : m.size % 2 === 0 ? 'merge-half' : undefined;
  return [m.open && 'merge-open', m.next && 'merge-next', text].filter(Boolean).join(' ');
}

/** Nhãn của từng chuyền: tên chuyền; một chuyền có hai dòng dàn chuyền trong kế hoạch thì kèm ngày vào chuyền để phân biệt */
export function lineLabels(lines: AllocationLine[]): Map<number, string> {
  const name = (l: AllocationLine, i: number) => l.lineName ?? (typeof l.lineCode === 'string' && l.lineCode !== MASK ? l.lineCode : `Chuyền thứ ${i + 1}`);
  const count = new Map<string, number>();
  lines.forEach((l, i) => count.set(name(l, i), (count.get(name(l, i)) ?? 0) + 1));
  return new Map(
    lines.map((l, i) => {
      const n = name(l, i);
      const start = typeof l.startDate === 'string' && l.startDate !== MASK ? fmtDate(l.startDate).slice(0, 5) : null;
      return [l.id, (count.get(n) ?? 0) > 1 && start ? `${n} (từ ${start})` : n];
    }),
  );
}

export interface CellState {
  cell: AllocationCell;
  /** SL kế hoạch của màu cỡ; null: bị Che, Ẩn */
  plan: number | null;
  /** Tổng giao trên mọi chuyền: mọi dòng đang có cộng phần của chuyền ngoài phạm vi xem */
  given: number;
  /** Phần của các dòng người dùng sửa được */
  mine: number;
  /** SL kế hoạch còn chưa giao; âm là vượt */
  left: number | null;
  over: boolean;
}

export interface LineState {
  line: AllocationLine;
  /** SL đã xếp cho chuyền; null: bị Che, Ẩn */
  plan: number | null;
  given: number;
  over: boolean;
}

export interface IssueGroup {
  /** Câu tóm tắt cho khung cảnh báo */
  text: string;
  /** Lý do khóa nút Lưu */
  reason: string;
  items?: string[];
}

export interface Analysis {
  cells: Map<string, CellState>;
  lines: Map<number, LineState>;
  /** Ô sai của từng dòng (theo key): chưa chọn chuyền hay lặp chuyền, màu cỡ không có, số lượng làm vượt */
  errors: Map<number, { line?: boolean; cell?: boolean; qty?: boolean }>;
  issues: IssueGroup[];
  /** Tổng giao của cả kế hoạch theo số đang nhập (gồm phần ngoài phạm vi xem) */
  total: number;
  /** Phần đã giao cho chuyền ngoài phạm vi xem */
  hidden: number;
}

/**
 * Tổng theo màu cỡ, theo chuyền và các lỗi của lưới đang nhập. Màu cỡ vượt chỉ tính khi dòng người dùng sửa được có góp phần
 * (như máy chủ): dữ liệu cũ của chuyền khác lệch không chặn việc lưu phần của mình.
 */
export function analyze(rows: EditRow[], d: Detail, labels: Map<number, string>): Analysis {
  const cells = new Map<string, CellState>(
    d.colorSizes.map((c) => [cellKey(c.colorName, c.sizeName), { cell: c, plan: num(c.qty), given: num(c.hiddenQty) ?? 0, mine: 0, left: null, over: false }]),
  );
  const lines = new Map<number, LineState>(d.lines.map((l) => [l.id, { line: l, plan: num(l.qty), given: 0, over: false }]));
  const hidden = d.colorSizes.reduce((s, c) => s + (num(c.hiddenQty) ?? 0), 0);
  const errors: Analysis['errors'] = new Map();
  const mark = (r: EditRow, f: 'line' | 'cell' | 'qty') => errors.set(r.key, { ...errors.get(r.key), [f]: true });
  let noLine = 0;
  let noCell = 0;
  const dup = new Set<string>();
  const seen = new Map<string, EditRow>();
  let total = hidden;
  for (const r of rows) {
    const q = r.assignedQty ?? 0;
    if (q <= 0) continue;
    total += q;
    const k = cellKey(r.colorName, r.sizeName);
    const c = r.colorName.trim() && r.sizeName.trim() ? cells.get(k) : undefined;
    if (c) {
      c.given += q;
      if (!r.locked) c.mine += q;
    } else if (!r.locked) {
      // Dòng khóa (chuyền người dùng không sửa được) có màu cỡ không còn trong kế hoạch: không sửa, không xóa được nên không chặn
      // việc lưu phần của mình (máy chủ cũng không xét dòng của chuyền khác)
      noCell++;
      mark(r, 'cell');
    }
    if (r.lineId === null) {
      noLine++;
      mark(r, 'line');
      continue;
    }
    const l = lines.get(r.lineId);
    if (l) l.given += q;
    if (r.locked || !c) continue;
    const dk = `${r.lineId}\u0000${k}`;
    const first = seen.get(dk);
    if (first) {
      dup.add(dk);
      mark(first, 'line');
      mark(r, 'line');
    } else seen.set(dk, r);
  }
  const overCells: string[] = [];
  for (const c of cells.values()) {
    c.left = c.plan === null ? null : c.plan - c.given;
    c.over = c.plan !== null && c.mine > 0 && c.given > c.plan;
    if (c.over) overCells.push(`${c.cell.colorName} / ${c.cell.sizeName}: giao ${fmtNum(c.given)}, SL kế hoạch ${fmtNum(c.plan)}`);
  }
  const overLines: string[] = [];
  for (const l of lines.values()) {
    l.over = l.line.editable && l.plan !== null && l.given > l.plan;
    if (l.over) overLines.push(`${labels.get(l.line.id)}: giao ${fmtNum(l.given)}, đã xếp ${fmtNum(l.plan)}`);
  }
  for (const r of rows) {
    if (r.locked || (r.assignedQty ?? 0) <= 0) continue;
    const over = cells.get(cellKey(r.colorName, r.sizeName))?.over || (r.lineId !== null && lines.get(r.lineId)?.over);
    if (over) mark(r, 'qty');
  }
  const issues: IssueGroup[] = [];
  if (noLine) issues.push({ text: `${noLine} dòng có số lượng giao nhưng chưa chọn chuyền.`, reason: 'Có dòng chưa chọn chuyền' });
  if (noCell) issues.push({ text: `${noCell} dòng chưa chọn màu, cỡ hoặc màu cỡ không còn trong kế hoạch. Chọn lại hoặc xóa dòng.`, reason: 'Có dòng chưa chọn màu, cỡ' });
  if (dup.size) issues.push({ text: `${dup.size} màu cỡ có hai dòng cho cùng một chuyền. Gộp thành một dòng.`, reason: 'Có màu cỡ nhập hai dòng cho cùng một chuyền' });
  if (overCells.length) issues.push({ text: `${overCells.length} màu cỡ giao nhiều hơn số lượng kế hoạch. Giảm lại trước khi lưu.`, reason: 'Có màu cỡ giao vượt số lượng kế hoạch', items: overCells });
  if (overLines.length) issues.push({ text: `${overLines.length} chuyền nhận nhiều hơn số lượng đã xếp ở Xếp chuyền. Giảm lại hoặc chuyển bớt cho chuyền khác.`, reason: 'Có chuyền giao vượt số lượng đã xếp', items: overLines });
  return { cells, lines, errors, issues, total, hidden };
}

/** Chia `total` theo tỷ lệ `weights`, làm tròn mà tổng vẫn đúng (phần dư lớn nhất được cộng trước), như máy chủ (order.util.ts) */
function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((s, v) => s + v, 0);
  for (const [, i] of raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0])) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

/** Chia số lượng theo màu cỡ cho nhiều chuyền lần lượt: tổng chuyền thứ i không vượt `caps[i]`, tổng mỗi màu cỡ không vượt `cells` */
export function lineShares(cells: number[], caps: number[]): number[][] {
  const left = [...cells];
  return caps.map((q) => {
    const share = apportion(Math.min(q, left.reduce((s, v) => s + v, 0)), left);
    share.forEach((s, i) => (left[i] -= s));
    return share;
  });
}

/**
 * Nút "Chia theo SL chuyền": phần chưa giao của mỗi màu cỡ (SL kế hoạch trừ phần của chuyền không sửa được, ngoài phạm vi xem)
 * chia lần lượt cho các chuyền sửa được theo SL đã xếp của từng chuyền: tổng mỗi chuyền không vượt SL chuyền, tổng mỗi màu cỡ
 * không vượt SL kế hoạch. Dòng của chuyền không sửa được giữ nguyên. null: thiếu số (bị Che, Ẩn) hoặc không có chuyền sửa được.
 */
export function propose(rows: EditRow[], d: Detail): EditRow[] | null {
  const editable = d.lines.filter((l) => l.editable);
  const caps = editable.map((l) => num(l.qty));
  const plans = d.colorSizes.map((c) => num(c.qty));
  if (!editable.length || caps.some((v) => v === null) || plans.some((v) => v === null)) return null;
  const lockedOf = new Map<string, EditRow[]>();
  const fixed = new Map(d.colorSizes.map((c) => [cellKey(c.colorName, c.sizeName), num(c.hiddenQty) ?? 0]));
  for (const r of rows) {
    if (!r.locked) continue;
    const k = cellKey(r.colorName, r.sizeName);
    lockedOf.set(k, [...(lockedOf.get(k) ?? []), r]);
    fixed.set(k, (fixed.get(k) ?? 0) + (r.assignedQty ?? 0));
  }
  const keys = d.colorSizes.map((c) => cellKey(c.colorName, c.sizeName));
  const shares = lineShares(
    keys.map((k, i) => Math.max(0, (plans[i] as number) - (fixed.get(k) ?? 0))),
    caps as number[],
  );
  const out: EditRow[] = [];
  d.colorSizes.forEach((c, n) => {
    const mine = editable.flatMap((l, m) => (shares[m][n] > 0 ? [{ key: nextKey++, lineId: l.id, colorName: c.colorName, sizeName: c.sizeName, assignedQty: shares[m][n], locked: false }] : []));
    withBlank(out, [...(lockedOf.get(keys[n]) ?? []), ...mine], c, d.lines);
    lockedOf.delete(keys[n]);
  });
  for (const rest of lockedOf.values()) out.push(...rest);
  return out;
}
