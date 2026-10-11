import { MASK } from './fieldPolicy';

const num = new Intl.NumberFormat('vi-VN');
const money = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** YYYY-MM-DD → DD/MM/YYYY (ngày không có giờ, không đổi múi giờ). */
export const fmtDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Thời điểm (ISO) → "dd/mm/yyyy HH:mm" theo giờ máy, một kiểu cho mọi màn. Không dùng toLocaleString('vi-VN'): kiểu đó đặt
 * giờ trước ngày và đổi theo trình duyệt.
 */
export function fmtDateTime(iso: string | null | undefined, opts?: { seconds?: boolean }): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}${opts?.seconds ? `:${pad(d.getSeconds())}` : ''}`;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${time}`;
}

/** Số theo kiểu Việt Nam. Ô bị Che ("***") giữ nguyên; giá trị không phải số (cột bị Ẩn) ra chuỗi rỗng, không ra "NaN". */
export const fmtNum = (v: unknown) => (v === MASK ? MASK : typeof v === 'number' && Number.isFinite(v) ? num.format(v) : '');
export const fmtMoney = (v: unknown) => (v === MASK ? MASK : typeof v === 'number' && Number.isFinite(v) ? money.format(v) : '');

/**
 * Tổng một cột số. Có ô bị Che hoặc thiếu (cột bị Ẩn) thì trả null: không cộng thành NaN, cũng không đưa ra
 * một tổng sai mà người xem tưởng là đúng.
 */
export function sumOf(values: unknown[]): number | null {
  let s = 0;
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    s += v;
  }
  return s;
}

/**
 * Ngày gõ tay dạng dd/mm/yyyy (chấp nhận d/m/yyyy, dấu "/", "-" hoặc ".") → YYYY-MM-DD. Ngày không có thật thì null.
 * Không để trình duyệt tự đoán: new Date("05/12/2026") hiểu là 12/05.
 */
export function parseDmy(text: string): string | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(text);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Ngày hôm nay theo giờ máy (YYYY-MM-DD). */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Chuỗi truy vấn từ object, bỏ giá trị rỗng. */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}
