import { fmtNum } from '../../lib/format';

/** Dòng của lưới màu cỡ (sửa tỷ lệ cắt, thêm PO) */
export interface EditRow {
  key: number;
  colorName: string;
  sizeName: string;
  qty: number | null;
}

// Cùng quy tắc với máy chủ (order.rules.ts, order.dto.ts): cỡ tối đa 20 ký tự gồm chữ không dấu, số, dấu chấm, gạch, ngoặc,
// dấu cách; màu tối đa 100 ký tự; số lượng 0 đến 10 triệu; tối đa 300 dòng; Màu + Cỡ không lặp (không phân biệt hoa thường)
const SIZE_NAME = /^[A-Za-z0-9.\-/() ]{1,20}$/;
export const SIZE_RULE = 'Cỡ tối đa 20 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang, gạch chéo, ngoặc đơn và dấu cách (ví dụ "M", "32 SHORT", "2T(XS)").';
const MAX_COLOR = 100;
const MAX_QTY = 10_000_000;
const MAX_ROWS = 300;

export const blank = (r: EditRow) => !r.colorName.trim() && !r.sizeName.trim() && r.qty == null;
/** Nội dung lưới để biết đã đổi gì chưa (bỏ dòng trống, bỏ khóa dòng) */
export const signature = (rows: EditRow[]) => JSON.stringify(rows.filter((r) => !blank(r)).map((r) => [r.colorName, r.sizeName, r.qty]));

export interface ColorSizeCheck {
  /** Dòng sẽ gửi lên: đủ Màu, Cỡ, Số lượng (dòng trống hoàn toàn bị bỏ) */
  lines: { colorName: string; sizeName: string; qty: number }[];
  /** Tổng số lượng các dòng sẽ lưu */
  total: number;
  issues: string[];
  badSize: boolean;
  bad: { color: Set<number>; size: Set<number>; qty: Set<number> };
  /** Tập ô lỗi dạng chuỗi: cột lưới chỉ dựng lại khi tập này đổi */
  sig: string;
}

/** Kiểm lưới màu cỡ trước khi lưu: dòng thiếu ô, cỡ sai quy tắc, trùng Màu + Cỡ được nêu theo số dòng và tô đỏ ô. */
export function checkColorSize(rows: EditRow[]): ColorSizeCheck {
  const bad = { color: new Set<number>(), size: new Set<number>(), qty: new Set<number>() };
  const issues: string[] = [];
  const lines: ColorSizeCheck['lines'] = [];
  const seen = new Map<string, number>();
  let badSize = false;
  rows.forEach((r, i) => {
    if (blank(r)) return;
    const n = i + 1;
    const color = r.colorName.trim();
    const size = r.sizeName.trim();
    const missing: string[] = [];
    if (!color) {
      missing.push('Màu SP');
      bad.color.add(r.key);
    }
    if (!size) {
      missing.push('Cỡ sản phẩm');
      bad.size.add(r.key);
    }
    if (r.qty == null) {
      missing.push('Số lượng');
      bad.qty.add(r.key);
    }
    if (missing.length) issues.push(`Dòng ${n}: thiếu ${missing.join(', ')}`);
    if (color.length > MAX_COLOR) {
      issues.push(`Dòng ${n}: Màu SP dài quá ${MAX_COLOR} ký tự`);
      bad.color.add(r.key);
    }
    if (size && !SIZE_NAME.test(size)) {
      issues.push(`Dòng ${n}: cỡ "${size}" sai quy tắc`);
      bad.size.add(r.key);
      badSize = true;
    }
    if (r.qty != null && r.qty > MAX_QTY) {
      issues.push(`Dòng ${n}: số lượng tối đa ${fmtNum(MAX_QTY)}`);
      bad.qty.add(r.key);
    }
    if (!color || !size || r.qty == null) return;
    const k = `${color.toLowerCase()}|${size.toLowerCase()}`;
    const first = seen.get(k);
    if (first !== undefined) {
      issues.push(`Dòng ${n}: trùng Màu + Cỡ với dòng ${first} (${color} / ${size})`);
      bad.color.add(r.key);
      bad.size.add(r.key);
    } else seen.set(k, n);
    lines.push({ colorName: color, sizeName: size, qty: r.qty });
  });
  if (lines.length > MAX_ROWS) issues.unshift(`Tối đa ${MAX_ROWS} dòng màu cỡ, đang có ${lines.length} dòng`);
  const sig = [bad.color, bad.size, bad.qty].map((s) => [...s].join(',')).join('|');
  return { lines, total: lines.reduce((s, l) => s + l.qty, 0), issues, badSize, bad, sig };
}
