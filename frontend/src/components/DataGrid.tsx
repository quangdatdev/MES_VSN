import { ActionIcon, Button, Checkbox, Loader, Stack, Text, Tooltip } from '@mantine/core';
import { IconArrowAutofitWidth, IconArrowsSort, IconLock, IconSortAscending, IconSortDescending } from '@tabler/icons-react';
import { memo, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import type { ColumnFilter, ColumnFilters, FilterValue, LoadValues } from '../lib/columnFilter';
import { MASK, type FieldPolicy } from '../lib/fieldPolicy';
import { fmtDate, fmtDateTime, fmtMoney, fmtNum } from '../lib/format';
import { ColumnFilterButton } from './ColumnFilter';

export type CellFormat = 'text' | 'number' | 'money' | 'date' | 'datetime' | 'code';

export interface Column<T> {
  key: string;
  title: string;
  /** Mã cột trong chính sách cột; mặc định trùng `key`. Cột bị Ẩn thì không hiện. */
  field?: string | null;
  width?: number;
  minWidth?: number;
  /** Chữ dài hơn bề rộng này bị cắt kèm dấu "…", rê chuột xem đủ (tên khách hàng, tên sản phẩm). */
  maxWidth?: number;
  align?: 'left' | 'right' | 'center';
  format?: CellFormat;
  /** Tham số sort gửi server (trường JSON); không có thì cột không sắp xếp được. */
  sortKey?: string;
  /** Trường lọc theo giá trị (nút mũi tên trên tiêu đề, ADR 0011); máy chủ phải có trường này trong danh sách trắng của màn. */
  filterKey?: string;
  /** Chữ của một giá trị trong popup lọc (tên trạng thái, tên chuyền...); mặc định định dạng theo `format`. */
  filterLabel?: (v: string | number) => string;
  /** Tiêu đề nhóm ở tầng trên: các cột kề nhau cùng nhóm có chung một ô tiêu đề (ví dụ bước chuẩn bị › KH, TH). */
  group?: string;
  render?: (row: T) => ReactNode;
  /**
   * Gộp ô theo dòng như ô merge của Excel: số dòng ô này phủ (>1), 0 là ô đã gộp vào dòng trên (không vẽ); mặc định 1. Các dòng
   * của khối phải liền nhau theo thứ tự `rows` (lưới không tự sắp xếp); dòng được memo nên số dòng gộp đổi thì `columns` cũng
   * phải đổi (dựng cột trong useMemo phụ thuộc cách gộp).
   */
  rowSpan?: (row: T) => number;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  policy?: FieldPolicy;
  loading?: boolean;
  error?: string | null;
  /** Có thì dòng báo lỗi tải kèm nút "Thử lại" */
  onRetry?: () => void;
  empty?: ReactNode;
  /** STT bắt đầu từ (page - 1) * pageSize + 1 */
  indexOffset?: number;
  sort?: string;
  onSort?: (sort: string) => void;
  /** Bộ lọc theo cột đang áp (trên URL); cùng `onColumnFilter` và `loadValues` thì cột có `filterKey` có nút lọc. */
  columnFilters?: ColumnFilters;
  onColumnFilter?: (field: string, filter: ColumnFilter | null) => void;
  /** Lấy giá trị của một cột từ DB cho popup lọc */
  loadValues?: LoadValues;
  selectedKey?: string | number | null;
  onRowClick?: (row: T) => void;
  onRowDoubleClick?: (row: T) => void;
  /** Cột chọn nhiều dòng (ô "Chọn" trong mô tả giao diện) */
  checked?: (string | number)[];
  onCheck?: (keys: (string | number)[]) => void;
  footer?: ReactNode;
  /** Lưới kéo dài hết chiều cao còn lại của trang (mô tả giao diện: lưới full đến chân trang) */
  fill?: boolean;
  dense?: boolean;
  label: string;
  /** Khóa lưu độ rộng cột người dùng đã kéo (trên trình duyệt này); mặc định theo `label`. */
  widthKey?: string;
}

/**
 * Ô bị che theo chính sách cột: trông khác hẳn dữ liệu thật để người xem không nhầm là số 0 hay lỗi. Lý do hiện bằng
 * `title`, không dùng Tooltip: lưới có thể có hàng nghìn ô bị che, mỗi Tooltip chạy bộ định vị ở mọi lần vẽ.
 */
export function Masked() {
  return (
    <span className="cell-masked" title="Bị che theo phân quyền của bạn">
      <IconLock size={11} stroke={2} aria-hidden />
      {MASK}
    </span>
  );
}

/** Gắn chữ hiển thị cho giá trị trong popup lọc khi chữ đó lấy từ dữ liệu tải sau (tên chi nhánh, tên chuyền theo mã). */
export function withFilterLabels<T>(columns: Column<T>[], labels: Record<string, (v: string | number) => string>): Column<T>[] {
  return columns.map((c) => (labels[c.key] ? { ...c, filterLabel: labels[c.key] } : c));
}

const cell = (row: object, key: string) => (row as Record<string, unknown>)[key];

function formatValue(value: unknown, format: CellFormat | undefined): ReactNode {
  if (value === MASK) return <Masked />;
  if (value == null || value === '') return <span className="cell-empty">–</span>;
  switch (format) {
    case 'number':
      return fmtNum(value as number);
    case 'money':
      return fmtMoney(value as number);
    case 'date':
      return fmtDate(value as string);
    case 'datetime':
      return fmtDateTime(value as string);
    case 'code':
      return <span className="cell-code">{String(value)}</span>;
    default:
      return String(value);
  }
}

/** Chữ thuần của ô (để rê chuột xem đủ khi cột bị kéo hẹp); ô bị che, ô trống thì không có. */
function plainText(value: unknown, format: CellFormat | undefined): string | undefined {
  if (value == null || value === '' || value === MASK || typeof value === 'object') return undefined;
  if (format === 'number') return fmtNum(value);
  if (format === 'money') return fmtMoney(value);
  if (format === 'date') return fmtDate(String(value));
  if (format === 'datetime') return fmtDateTime(String(value));
  return String(value);
}

/** Chữ của một giá trị trong popup lọc: cột ngày giờ lọc theo ngày. Một hàm cho mỗi kiểu (nút lọc memo so theo hàm). */
const filterLabels = new Map<CellFormat | undefined, (v: Exclude<FilterValue, null>) => string>();
function defaultFilterLabel(format: CellFormat | undefined) {
  let label = filterLabels.get(format);
  if (!label) {
    label = (v) => (format === 'date' || format === 'datetime' ? fmtDate(String(v)) : format === 'number' || format === 'money' ? fmtNum(v) : String(v));
    filterLabels.set(format, label);
  }
  return label;
}

const alignOf = (c: { align?: 'left' | 'right' | 'center'; format?: CellFormat }) => c.align ?? (c.format === 'number' || c.format === 'money' ? 'right' : 'left');

/** Mũi tên lên/xuống chuyển sang dòng kề (dòng dữ liệu nào cũng có tabindex 0 hoặc -1; dòng báo lỗi, báo rỗng thì không) */
function moveFocus(e: KeyboardEvent<HTMLTableRowElement>, dir: 1 | -1) {
  e.preventDefault();
  const next = (dir === 1 ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling) as HTMLElement | null;
  if (next?.hasAttribute('tabindex')) next.focus();
}

/** Thao tác trên dòng, ổn định qua các lần vẽ (đọc hàm mới nhất của trang qua ref) */
interface RowEvents<T> {
  click: (row: T) => void;
  open: (row: T) => void;
  enter: (row: T) => void;
  toggle: (key: string | number) => void;
}

interface RowProps<T> {
  row: T;
  rowKey: string | number;
  /** Số thứ tự hiện ở cột STT */
  index: number;
  columns: Column<T>[];
  selected: boolean;
  tabbable: boolean;
  clickable: boolean;
  hasClick: boolean;
  hasOpen: boolean;
  /** Ô chọn của dòng; undefined: lưới không có cột chọn */
  check: boolean | undefined;
  fixed: boolean;
  events: RowEvents<T>;
}

function GridRowView<T extends object>({ row: r, rowKey: k, index, columns, selected, tabbable, clickable, hasClick, hasOpen, check, fixed, events }: RowProps<T>) {
  return (
    <tr
      data-selected={selected || undefined}
      aria-current={selected ? 'true' : undefined}
      data-clickable={clickable || undefined}
      onClick={hasClick ? () => events.click(r) : undefined}
      onDoubleClick={hasOpen ? () => events.open(r) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter') events.enter(r);
              if (e.key === ' ' && hasClick) {
                e.preventDefault();
                events.click(r);
              }
              if (e.key === 'ArrowDown') moveFocus(e, 1);
              if (e.key === 'ArrowUp') moveFocus(e, -1);
            }
          : undefined
      }
      tabIndex={clickable ? (tabbable ? 0 : -1) : undefined}
    >
      {check !== undefined && (
        // Bấm cả ô (không chỉ ô tích 16px) để chọn: dễ trúng, nhất là trên điện thoại
        <td
          className="grid-check"
          onClick={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) events.toggle(k);
          }}
        >
          <Checkbox size="sm" aria-label={`Chọn dòng ${index}`} checked={check} onChange={() => events.toggle(k)} />
        </td>
      )}
      <td className="grid-index">{index}</td>
      {columns.map((c) => {
        const span = c.rowSpan?.(r) ?? 1;
        if (span === 0) return null;
        const v = cell(r, c.key);
        const content = c.render ? (v === MASK ? <Masked /> : c.render(r)) : formatValue(v, c.format);
        return (
          <td
            key={c.key}
            data-col={c.key}
            rowSpan={span > 1 ? span : undefined}
            data-merged={span > 1 || undefined}
            style={{ textAlign: alignOf(c) }}
            data-num={c.format === 'number' || c.format === 'money' || undefined}
            // Cột đã kéo hẹp: chữ bị cắt ở mép ô, rê chuột xem đủ
            title={fixed && !c.render ? plainText(v, c.format) : undefined}
          >
            {c.maxWidth && !fixed ? (
              <span className="cell-clip" style={{ maxWidth: c.maxWidth }} title={typeof v === 'string' && v !== MASK ? v : undefined}>
                {content}
              </span>
            ) : (
              content
            )}
          </td>
        );
      })}
      {fixed && <td className="grid-filler" aria-hidden />}
    </tr>
  );
}

/**
 * Một dòng của lưới, chỉ vẽ lại khi dữ liệu dòng, trạng thái chọn hay tích, cột hoặc kiểu độ rộng đổi. Trang render lại
 * (gõ lọc, mở popup, cờ đang tải) thì không vẽ lại 100 dòng × mọi cột. Cột phải ổn định (khai báo ở cấp module hoặc
 * `useMemo`); cột có `render` đọc dữ liệu ngoài dòng thì `columns` phải đổi khi dữ liệu đó đổi.
 */
const GridRow = memo(GridRowView) as typeof GridRowView;

// ---------- Độ rộng cột ----------

const MIN_W = 48;
const MAX_W = 800;
const INDEX_W = 48;
// Cột STT rộng thêm khi đã kéo cột để chứa nút "Đặt lại độ rộng cột"
const INDEX_W_CUSTOM = 76;
const CHECK_W = 36;
const clampW = (w: number) => Math.round(Math.min(MAX_W, Math.max(MIN_W, w)));
type Widths = Record<string, number>;

/** Độ rộng đã lưu là tiện ích riêng của người xem trên trình duyệt này; đọc, ghi lỗi (chế độ riêng tư) thì coi như chưa kéo. */
function readWidths(key: string): Widths {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>)
        .filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]))
        .map(([k, v]) => [k, clampW(v)]),
    );
  } catch {
    return {};
  }
}

function writeWidths(key: string, widths: Widths) {
  try {
    if (Object.keys(widths).length) localStorage.setItem(key, JSON.stringify(widths));
    else localStorage.removeItem(key);
  } catch {
    // Không lưu được thì độ rộng chỉ giữ đến khi rời màn
  }
}

const setRef = <E,>(map: Map<string, E>, key: string, el: E | null) => {
  if (el) map.set(key, el);
  else map.delete(key);
};

/**
 * Lưới dữ liệu dùng chung của các màn nghiệp vụ: tiêu đề dính, cuộn dọc và ngang, chọn dòng, đúp chuột mở chi tiết,
 * phản chiếu chính sách cột (bỏ cột Ẩn, ô Che có kiểu riêng). Backend đã lọc; lưới chỉ hiển thị cho đúng.
 * Kéo mép phải tiêu đề để đổi độ rộng cột (bấm đúp: vừa nội dung); cột có `filterKey` có nút mũi tên mở popup lọc theo
 * giá trị, giá trị và kết quả lọc đều lấy từ DB.
 */
export function DataGrid<T extends object>(props: Props<T>) {
  const { columns, rows, rowKey, policy, loading, error, onRetry, empty, indexOffset = 0, sort, onSort, columnFilters, onColumnFilter, loadValues, selectedKey, onRowClick, onRowDoubleClick, checked, onCheck, footer, fill, dense, label, widthKey } = props;
  const visible = useMemo(() => columns.filter((c) => c.field === null || !policy || policy.visible(c.field ?? c.key)), [columns, policy]);
  const [sortField, sortDir] = (sort ?? '').split(':');
  const allKeys = rows.map(rowKey);
  const checkedSet = useMemo(() => new Set(checked ?? []), [checked]);
  const allChecked = !!checked && allKeys.length > 0 && allKeys.every((k) => checkedSet.has(k));
  const someChecked = !!checked && allKeys.some((k) => checkedSet.has(k));
  const clickable = !!(onRowClick || onRowDoubleClick);
  // Chỉ một dòng nhận Tab (dòng đang chọn, chưa chọn thì dòng đầu); mũi tên lên/xuống chuyển dòng. Lưới 50 dòng không còn là 50 lần Tab.
  const tabKey = selectedKey != null && allKeys.includes(selectedKey) ? selectedKey : allKeys[0];
  // Hàm do trang truyền vào thường viết tại chỗ: dòng gọi qua ref để prop của dòng giữ nguyên, dòng không đổi không vẽ lại
  const handlers = useRef({ onRowClick, onRowDoubleClick, onCheck, checked, onColumnFilter });
  handlers.current = { onRowClick, onRowDoubleClick, onCheck, checked, onColumnFilter };
  // Hàm đổi bộ lọc của từng cột, ổn định qua các lần vẽ (nút lọc memo)
  const filterChange = useRef(new Map<string, (f: ColumnFilter | null) => void>());
  const onFilterChange = (field: string) => {
    let fn = filterChange.current.get(field);
    if (!fn) {
      fn = (f) => handlers.current.onColumnFilter?.(field, f);
      filterChange.current.set(field, fn);
    }
    return fn;
  };
  const events = useMemo<RowEvents<T>>(
    () => ({
      click: (r) => handlers.current.onRowClick?.(r),
      open: (r) => handlers.current.onRowDoubleClick?.(r),
      enter: (r) => {
        const h = handlers.current;
        (h.onRowDoubleClick ?? h.onRowClick)?.(r);
      },
      toggle: (k) => {
        const { checked: list, onCheck: emit } = handlers.current;
        if (list && emit) emit(list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
      },
    }),
    [],
  );
  const grouped = visible.some((c) => c.group);
  const levelOf = (c: Column<T>) => (policy && c.field !== null ? policy.level(c.field ?? c.key) : undefined);

  // Độ rộng: chưa kéo cột nào thì bảng tự co theo nội dung như cũ; kéo rồi thì mọi cột có độ rộng cố định (table-layout:
  // fixed), cột đệm cuối hút phần thừa để cột vừa kéo đúng bằng chỗ thả chuột
  const storageKey = `mes.grid.widths:${widthKey ?? label}`;
  const [widths, setWidths] = useState<Widths>(() => readWidths(storageKey));
  const fixed = visible.some((c) => widths[c.key] != null);
  const tableRef = useRef<HTMLTableElement>(null);
  const thRefs = useRef(new Map<string, HTMLTableCellElement>());
  const colRefs = useRef(new Map<string, HTMLTableColElement>());
  const drag = useRef<{ key: string; startX: number; startW: number; base: Widths; width: number } | null>(null);
  const colWidth = (c: Column<T>, w: Widths = widths) => w[c.key] ?? c.width ?? Math.max(c.minWidth ?? 0, 120);
  const indexW = fixed ? INDEX_W_CUSTOM : INDEX_W;
  const totalWidth = (w: Widths) => (onCheck ? CHECK_W : 0) + INDEX_W_CUSTOM + visible.reduce((s, c) => s + colWidth(c, w), 0);
  // Độ rộng mới nhất kể cả khi chưa kịp vẽ lại: nhấn giữ phím mũi tên sinh nhiều lần keydown liền nhau
  const latest = useRef(widths);
  latest.current = widths;
  const saveWidths = (next: Widths) => {
    latest.current = next;
    setWidths(next);
    writeWidths(storageKey, next);
  };
  /** Độ rộng đang thấy của mọi cột: lần kéo đầu tiên giữ nguyên các cột khác như đang hiển thị. */
  const current = (): Widths => {
    const w = latest.current;
    if (visible.some((c) => w[c.key] != null)) return { ...w };
    // Làm tròn lên và cộng viền: tiêu đề vừa khít lúc tự co không bị cụt chữ khi chuyển sang độ rộng cố định
    return Object.fromEntries(
      visible.map((c) => {
        const measured = thRefs.current.get(c.key)?.getBoundingClientRect().width;
        return [c.key, clampW(measured ? Math.ceil(measured) + 2 : colWidth(c))];
      }),
    );
  };
  /** Độ rộng vừa nội dung dài nhất của cột (tiêu đề và các ô đang hiện). */
  const fitWidth = (key: string) => {
    const th = thRefs.current.get(key);
    const head = th?.querySelector<HTMLElement>('.grid-head-label');
    const filter = th?.querySelector<HTMLElement>('.grid-filter-btn');
    let w = (head?.scrollWidth ?? 0) + (filter ? filter.offsetWidth + 4 : 0) + 22;
    tableRef.current?.querySelectorAll<HTMLElement>('td[data-col]').forEach((td) => {
      if (td.dataset.col === key) w = Math.max(w, td.scrollWidth + 2);
    });
    return clampW(w);
  };
  const resizeTo = (key: string, width: number) => saveWidths({ ...current(), [key]: clampW(width) });

  const startDrag = (e: PointerEvent<HTMLSpanElement>, key: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const base = current();
    drag.current = { key, startX: e.clientX, startW: base[key], base, width: base[key] };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (!fixed) saveWidths(base);
  };
  // Trong lúc kéo chỉ đổi thẳng độ rộng của thẻ <col>, không vẽ lại cả lưới mỗi lần chuột nhích
  const moveDrag = (e: PointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    if (!d) return;
    d.width = clampW(d.startW + e.clientX - d.startX);
    const col = colRefs.current.get(d.key);
    if (col) col.style.width = `${d.width}px`;
    if (tableRef.current) tableRef.current.style.minWidth = `${totalWidth({ ...d.base, [d.key]: d.width })}px`;
  };
  const endDrag = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    saveWidths({ ...d.base, [d.key]: d.width });
  };
  const resizeKey = (e: KeyboardEvent<HTMLSpanElement>, key: string) => {
    const step = e.shiftKey ? 50 : 10;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const base = current();
      saveWidths({ ...base, [key]: clampW(base[key] + (e.key === 'ArrowRight' ? step : -step)) });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      resizeTo(key, fitWidth(key));
    }
  };

  const colSpan = visible.length + 1 + (onCheck ? 1 : 0) + (fixed ? 1 : 0);
  // Các cột kề nhau cùng nhóm gộp thành một khối ở tầng tiêu đề trên
  const runs: { group?: string; cols: Column<T>[] }[] = [];
  for (const c of visible) {
    const last = runs[runs.length - 1];
    if (c.group && last?.group === c.group) last.cols.push(c);
    else runs.push({ group: c.group, cols: [c] });
  }
  // Tiêu đề tầng dưới đọc kèm tên nhóm ("Họp đánh giá rủi ro: KH"): trình đọc màn hình không nối tiêu đề hai tầng được
  const headCell = (c: Column<T>, rowSpan?: number, name?: string) => {
    const active = c.sortKey && sortField === c.sortKey;
    const Icon = !active ? IconArrowsSort : sortDir === 'asc' ? IconSortAscending : IconSortDescending;
    const level = levelOf(c);
    const align = c.group && !rowSpan ? 'center' : alignOf(c);
    // Không sắp xếp, không lọc theo cột bị Che: lộ thứ tự hay giá trị (máy chủ cũng từ chối)
    const filterable = !!(c.filterKey && loadValues && onColumnFilter && level !== 'MASKED' && level !== 'HIDDEN');
    return (
      <th
        key={c.key}
        ref={(el) => setRef(thRefs.current, c.key, el)}
        rowSpan={rowSpan}
        aria-label={name}
        data-col={c.key}
        data-filtered={(c.filterKey && columnFilters?.[c.filterKey]) ? true : undefined}
        style={{ ...(fixed ? null : { width: c.width, minWidth: c.minWidth ?? c.width }), textAlign: align }}
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
      >
        <div className="grid-head" data-align={align}>
          <span className="grid-head-label">
            {c.sortKey && onSort && level !== 'MASKED' ? (
              <button type="button" className="grid-sort focus-ring" onClick={() => onSort(`${c.sortKey}:${active && sortDir === 'asc' ? 'desc' : 'asc'}`)}>
                {c.title}
                <Icon size={12} className="grid-sort-icon" data-active={active || undefined} />
              </button>
            ) : (
              c.title
            )}
            {level === 'READONLY' && (
              <Tooltip label="Bạn chỉ được xem cột này" openDelay={300}>
                <IconLock size={11} className="grid-head-lock" aria-label="chỉ đọc" />
              </Tooltip>
            )}
          </span>
          {filterable && (
            <ColumnFilterButton
              title={name ?? c.title}
              field={c.filterKey!}
              current={columnFilters?.[c.filterKey!]}
              others={Object.fromEntries(Object.entries(columnFilters ?? {}).filter(([k]) => k !== c.filterKey))}
              load={loadValues!}
              label={c.filterLabel ?? defaultFilterLabel(c.format)}
              onChange={onFilterChange(c.filterKey!)}
            />
          )}
        </div>
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label={`Độ rộng cột ${name ?? c.title}`}
          aria-valuemin={MIN_W}
          aria-valuemax={MAX_W}
          aria-valuenow={colWidth(c)}
          aria-valuetext={fixed ? `${colWidth(c)} px` : 'Tự co theo nội dung'}
          title="Kéo để đổi độ rộng cột, bấm đúp để vừa nội dung"
          tabIndex={0}
          className="grid-resize"
          onPointerDown={(e) => startDrag(e, c.key)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => resizeTo(c.key, fitWidth(c.key))}
          onKeyDown={(e) => resizeKey(e, c.key)}
        />
      </th>
    );
  };

  return (
    <div className="grid-wrap" data-fill={fill || undefined} data-refreshing={(loading && rows.length > 0) || undefined}>
      <div className="grid-scroll">
        <table
          ref={tableRef}
          className="grid"
          data-dense={dense || undefined}
          data-fixed={fixed || undefined}
          style={fixed ? { tableLayout: 'fixed', minWidth: totalWidth(widths) } : undefined}
          aria-label={label}
          aria-busy={loading || undefined}
        >
          {fixed && (
            <colgroup>
              {onCheck && <col style={{ width: CHECK_W }} />}
              <col style={{ width: indexW }} />
              {visible.map((c) => (
                <col key={c.key} ref={(el) => setRef(colRefs.current, c.key, el)} style={{ width: colWidth(c) }} />
              ))}
              <col />
            </colgroup>
          )}
          <thead>
            <tr className={grouped ? 'grid-head-group' : undefined}>
              {onCheck && (
                <th className="grid-check" rowSpan={grouped ? 2 : undefined}>
                  <Checkbox
                    size="sm"
                    aria-label="Chọn tất cả"
                    checked={allChecked}
                    indeterminate={!allChecked && someChecked}
                    onChange={() => onCheck(allChecked ? checked!.filter((k) => !allKeys.includes(k)) : [...new Set([...(checked ?? []), ...allKeys])])}
                  />
                </th>
              )}
              <th className="grid-index" rowSpan={grouped ? 2 : undefined} style={fixed ? { width: indexW } : undefined}>
                {fixed ? (
                  <span className="grid-index-head">
                    STT
                    <Tooltip label="Đặt lại độ rộng cột" openDelay={300}>
                      <ActionIcon variant="subtle" color="gray" size={24} aria-label="Đặt lại độ rộng cột" onClick={() => saveWidths({})}>
                        <IconArrowAutofitWidth size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </span>
                ) : (
                  'STT'
                )}
              </th>
              {grouped
                ? runs.map((run) =>
                    run.group ? (
                      <th key={`g-${run.cols[0].key}`} colSpan={run.cols.length} className="grid-group" title={run.group}>
                        {run.group}
                      </th>
                    ) : (
                      headCell(run.cols[0], 2)
                    ),
                  )
                : visible.map((c) => headCell(c))}
              {fixed && <th className="grid-filler" aria-hidden rowSpan={grouped ? 2 : undefined} />}
            </tr>
            {grouped && <tr className="grid-head-sub">{visible.filter((c) => c.group).map((c) => headCell(c, undefined, `${c.group}: ${c.title}`))}</tr>}
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const k = rowKey(r);
              return (
                <GridRow
                  key={k}
                  row={r}
                  rowKey={k}
                  index={indexOffset + i + 1}
                  columns={visible}
                  selected={selectedKey === k}
                  tabbable={k === tabKey}
                  clickable={clickable}
                  hasClick={!!onRowClick}
                  hasOpen={!!onRowDoubleClick}
                  check={onCheck ? checkedSet.has(k) : undefined}
                  fixed={fixed}
                  events={events}
                />
              );
            })}
            {error && (
              <tr>
                <td colSpan={colSpan}>
                  <Stack align="center" gap={8} py="lg" role="alert">
                    <Text ta="center" c="red" size="sm">{error}</Text>
                    {onRetry && (
                      <Button size="xs" variant="default" onClick={onRetry} loading={loading}>
                        Thử lại
                      </Button>
                    )}
                  </Stack>
                </td>
              </tr>
            )}
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="grid-empty">{empty ?? 'Chưa có dữ liệu.'}</td>
              </tr>
            )}
          </tbody>
        </table>
        {loading && rows.length === 0 && (
          <div className="grid-loading" role="status" aria-label="Đang tải">
            <Loader size="sm" color="brand" />
          </div>
        )}
      </div>
      {footer}
    </div>
  );
}
