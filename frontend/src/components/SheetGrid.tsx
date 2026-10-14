import { ActionIcon, Text, Tooltip } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  createAddRowsComponent,
  createContextMenuComponent,
  createTextColumn,
  DataSheetGrid,
  keyColumn,
  type AddRowsComponentProps,
  type CellProps,
  type Column,
  type ContextMenuComponentProps,
  type ContextMenuItem,
  type DataSheetGridRef,
} from 'react-datasheet-grid';
import 'react-datasheet-grid/dist/style.css';
import { fmtDate, fmtNum, parseDmy } from '../lib/format';
import { useLeaveGuard } from '../lib/leaveGuard';
import type { GroupedOption } from '../lib/lines';
import { toastWarn } from '../lib/notify';
import { TreeSelect } from './TreeSelect';

// Lưới nhập liệu kiểu bảng tính (react-datasheet-grid): chọn vùng bằng chuột hoặc Shift + mũi tên, Ctrl+C / Ctrl+V với
// Excel, kéo góc ô để điền xuống, chuột phải để chèn, nhân bản, xóa dòng. Lưới xem (chỉ đọc) vẫn dùng DataGrid.

// any: dữ liệu riêng của cột (columnData) và kiểu giá trị dán khác nhau theo loại cột
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SheetColumn<T> = Partial<Column<T, any, any>> & {
  /**
   * Tiêu đề nhóm ở tầng trên: các cột kề nhau cùng nhóm có chung một ô (ví dụ bước chuẩn bị › KH, TH). Lưới có nhóm thì
   * mọi cột giữ đúng bề rộng `minWidth` để hai tầng tiêu đề thẳng cột.
   */
  group?: string;
  /** Khóa của nhóm khi hai nhóm kề nhau có thể trùng tên (ví dụ Id bước); mặc định là tên nhóm */
  groupKey?: string;
  /** Nút lọc theo cột trên tiêu đề (cột không thuộc nhóm) */
  headFilter?: HeadFilter;
};
/** Nút lọc theo cột do màn dựng sẵn (ColumnFilterButton); `active`: cột đang lọc (vạch dưới tiêu đề như lưới xem) */
export interface HeadFilter {
  node: ReactNode;
  active: boolean;
}
type Size = { minWidth?: number; basis?: number; grow?: number; maxWidth?: number };
interface CellOpts<T> extends Size {
  /** Ô bắt buộc tô vàng như ô nhập của form */
  required?: boolean;
  /** Ô không sửa được theo dòng (tô xám, dán và xóa bỏ qua) */
  disabled?: boolean | ((row: T) => boolean);
  /** Ô có giá trị sai (tô đỏ), ví dụ số lượng vượt số còn lại */
  error?: (row: T) => boolean;
  /** Class thêm cho ô theo dòng (ví dụ ô vừa đổi chưa lưu, ô làm trễ hạn) */
  className?: (row: T) => string | undefined;
  group?: string;
  groupKey?: string;
}

/**
 * Số nguyên gõ hoặc dán từ Excel tiếng Việt lẫn tiếng Anh: "1.234", "1,234", "1 234", "1.234,00" đều là 1234.
 * Số âm, số lẻ, chữ: null (ô trống) để người nhập thấy ngay ô chưa hợp lệ.
 */
export function parseQty(text: string): number | null {
  // \s của JavaScript gồm cả dấu cách không ngắt (Excel dùng để nhóm nghìn)
  let s = text.replace(/\s/g, '');
  const grouped = /^\d{1,3}([.,]\d{3})+$/;
  const zeroDecimals = /^(.*\d)[.,]0{1,2}$/.exec(s);
  if (zeroDecimals && !grouped.test(s)) s = zeroDecimals[1];
  const n = /^\d+$/.test(s) ? Number(s) : grouped.test(s) ? Number(s.replace(/[.,]/g, '')) : NaN;
  return Number.isSafeInteger(n) ? n : null;
}

/** Ngày gõ hoặc dán: dd/mm/yyyy (cả d/m/yyyy, dấu "-" hay "."), dd/mm (năm nay) hoặc yyyy-mm-dd. Sai: null. */
export function parseSheetDate(text: string): string | null {
  const s = text.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return parseDmy(`${iso[3]}/${iso[2]}/${iso[1]}`);
  const short = /^(\d{1,2})[/.-](\d{1,2})$/.exec(s);
  if (short) return parseDmy(`${short[1]}/${short[2]}/${new Date().getFullYear()}`);
  return parseDmy(s);
}

const numberCell = createTextColumn<number | null>({
  alignRight: true,
  deletedValue: null,
  parseUserInput: parseQty,
  parsePastedValue: parseQty,
  formatBlurredInput: (v) => (v == null ? '' : fmtNum(v)),
  formatInputOnFocus: (v) => (v == null ? '' : String(v)),
  // Chép ra số trơn để Excel ở máy nào cũng hiểu đúng
  formatForCopy: (v) => (v == null ? '' : String(v)),
});
const textCell = createTextColumn<string>({
  deletedValue: '',
  parseUserInput: (v) => v,
  parsePastedValue: (v) => v.replace(/[\n\r]+/g, ' ').trim(),
  formatBlurredInput: (v) => v ?? '',
  formatInputOnFocus: (v) => v ?? '',
  formatForCopy: (v) => v ?? '',
});
// Ngày chỉ ghi vào dòng khi Enter, Tab hoặc rời ô (Esc là bỏ): chữ gõ dở như "20/10" không bị hiểu thành ngày giữa chừng,
// và mỗi phím gõ không làm cả màn tính lại. Ô số, ô chữ vẫn ghi theo từng phím (tổng, số còn lại cập nhật khi đang gõ)
const dateCell = createTextColumn<string | null>({
  placeholder: 'dd/mm/yyyy',
  continuousUpdates: false,
  deletedValue: null,
  parseUserInput: parseSheetDate,
  parsePastedValue: parseSheetDate,
  formatBlurredInput: (v) => fmtDate(v),
  formatInputOnFocus: (v) => fmtDate(v),
  formatForCopy: (v) => fmtDate(v),
});

/**
 * Thêm tiêu đề, cỡ cột, tô ô bắt buộc/sai và khóa ô theo dòng. Khi dán quá cuối lưới, thư viện hỏi "ô có bị khóa không"
 * với dòng chưa tồn tại (rowData undefined): dòng mới tạo khi dán thì không khóa.
 */
function decorate<T>(column: SheetColumn<T>, title: string, o: CellOpts<T>): SheetColumn<T> {
  const { required, disabled, error, className, group, groupKey, minWidth, basis, grow, maxWidth } = o;
  const isDisabled = (row: T | undefined) => (row == null ? false : typeof disabled === 'function' ? disabled(row) : !!disabled);
  const stateClass = (row: T) => (error?.(row) ? 'sheet-error' : required && !isDisabled(row) ? 'sheet-required' : undefined);
  return {
    ...column,
    // Dấu * ở tiêu đề: ô bắt buộc không chỉ nhận ra bằng nền vàng
    title: required ? `${title} *` : title,
    group,
    groupKey,
    minWidth: minWidth ?? 90,
    basis: basis ?? minWidth ?? 90,
    grow: grow ?? 1,
    maxWidth,
    disabled: typeof disabled === 'function' ? ({ rowData }) => isDisabled(rowData) : !!disabled,
    cellClassName: ({ rowData }) => {
      const row = rowData as T | undefined;
      if (row == null) return undefined;
      return [stateClass(row), className?.(row)].filter(Boolean).join(' ') || undefined;
    },
  };
}

type Key<T, V> = { [K in keyof T]: T[K] extends V ? K : never }[keyof T] & string;
// any: cột của thư viện có kiểu giá trị ô riêng (số, chữ, ngày); keyColumn gắn cột đó vào một trường của dòng
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const byKey = <T extends object>(key: keyof T & string, column: SheetColumn<any>) => keyColumn<T>(key, column) as SheetColumn<T>;

/** Cột số nguyên (số lượng, năng suất…) */
export const sheetNumber = <T extends object>(key: Key<T, number | null>, title: string, o: CellOpts<T> = {}) =>
  decorate<T>(byKey<T>(key, numberCell), title, { minWidth: 100, ...o });

/** Cột chữ (màu, cỡ…) */
export const sheetText = <T extends object>(key: Key<T, string>, title: string, o: CellOpts<T> = {}) =>
  decorate<T>(byKey<T>(key, textCell), title, { minWidth: 120, ...o });

/** Cột ngày (lưu YYYY-MM-DD, hiện và gõ dd/mm/yyyy) */
export const sheetDate = <T extends object>(key: Key<T, string | null>, title: string, o: CellOpts<T> = {}) =>
  decorate<T>(byKey<T>(key, dateCell), title, { minWidth: 120, ...o });

function ReadonlyCell<T>({ rowData, columnData }: CellProps<T, (row: T) => ReactNode>) {
  return <span className="sheet-text">{columnData(rowData)}</span>;
}

/** Cột chỉ xem hoặc tự tính (tô xám, chép được, không dán vào được) */
export function sheetReadonly<T>(
  title: string,
  render: (row: T) => ReactNode,
  copy: (row: T) => string | number | null,
  o: Size & { align?: 'right'; group?: string; groupKey?: string; className?: (row: T) => string | undefined; headFilter?: HeadFilter } = {},
): SheetColumn<T> {
  return {
    title,
    group: o.group,
    groupKey: o.groupKey,
    headFilter: o.headFilter,
    component: ReadonlyCell as SheetColumn<T>['component'],
    columnData: render,
    disabled: true,
    minWidth: o.minWidth ?? 90,
    basis: o.basis ?? o.minWidth ?? 90,
    grow: o.grow ?? 1,
    maxWidth: o.maxWidth,
    cellClassName: o.align === 'right' || o.className
      ? ({ rowData }) => [o.align === 'right' ? 'sheet-right' : undefined, rowData == null ? undefined : o.className?.(rowData as T)].filter(Boolean).join(' ') || undefined
      : undefined,
    copyValue: ({ rowData }) => copy(rowData),
    pasteValue: ({ rowData }) => rowData,
    deleteValue: ({ rowData }) => rowData,
    isCellEmpty: () => false,
  };
}

/** groups: nhóm trong danh sách mở ra (ví dụ xưởng của chuyền), thu gọn được; dán và tìm vẫn theo mã, tên của lựa chọn */
export type SheetOption = GroupedOption;
interface SelectData<T> {
  options: (row: T) => SheetOption[];
  get: (row: T) => string | null;
  set: (row: T, value: string | null) => T;
  /** Đơn vị đếm cạnh tên nhóm, ví dụ "chuyền" */
  unit?: string;
  nothingFoundMessage?: string;
  emptyMessage?: string;
}

function SelectCell<T>({ rowData, setRowData, focus, stopEditing, columnData }: CellProps<T, SelectData<T> & { title: string }>) {
  const options = columnData.options(rowData);
  const value = columnData.get(rowData);
  if (!focus) return <span className="sheet-text">{options.find((o) => o.value === value)?.label ?? value ?? ''}</span>;
  // Gõ để lọc rồi Enter là chọn kết quả đầu, không phải dùng mũi tên
  return (
    <TreeSelect
      className="sheet-select"
      variant="unstyled"
      size="xs"
      aria-label={columnData.title}
      options={options}
      value={value}
      unit={columnData.unit}
      nothingFoundMessage={columnData.nothingFoundMessage}
      emptyMessage={columnData.emptyMessage}
      autoFocus
      defaultDropdownOpened
      // Chọn xong thì danh sách đóng (onDropdownClose) và ô thôi sửa; giá trị mới đã vào lưới trước đó
      onChange={(v) => setRowData(columnData.set(rowData, v))}
      onDropdownClose={() => stopEditing({ nextRow: false })}
    />
  );
}

/** Tìm lựa chọn khớp chữ dán vào: theo mã, theo nhãn, hoặc theo đuôi mã (dán "L03" vào chuyền "A01-L03") */
function matchOption(options: SheetOption[], text: string): SheetOption | undefined {
  const t = text.trim().toLowerCase();
  if (!t) return undefined;
  return (
    options.find((o) => o.value.toLowerCase() === t) ??
    options.find((o) => o.label.toLowerCase() === t) ??
    options.find((o) => o.value.toLowerCase().endsWith(`-${t}`) || o.label.toLowerCase().startsWith(`${t} (`))
  );
}

/** Cột chọn từ danh sách (chuyền…): Enter hoặc đúp chuột để mở danh sách, gõ để tìm; dán theo mã hoặc tên */
export function sheetSelect<T>(title: string, data: SelectData<T>, o: CellOpts<T> = {}): SheetColumn<T> {
  return decorate<T>(
    {
      component: SelectCell as SheetColumn<T>['component'],
      columnData: { ...data, title },
      // Danh sách nằm ngoài lưới (portal): lưới không được tự xử lý phím hay bỏ chọn ô khi bấm vào danh sách
      disableKeys: true,
      keepFocus: true,
      copyValue: ({ rowData }) => {
        const v = data.get(rowData);
        return data.options(rowData).find((x) => x.value === v)?.label ?? v;
      },
      // Không khớp lựa chọn nào thì giữ nguyên ô, không xóa mất giá trị đang có
      pasteValue: ({ rowData, value }) => {
        const hit = matchOption(data.options(rowData), String(value));
        return hit ? data.set(rowData, hit.value) : rowData;
      },
      deleteValue: ({ rowData }) => data.set(rowData, null),
      isCellEmpty: ({ rowData }) => !data.get(rowData),
    },
    title,
    { minWidth: 150, ...o },
  );
}

const MENU_LABEL: Record<string, string> = {
  INSERT_ROW_BELLOW: 'Chèn dòng bên dưới',
  DUPLICATE_ROW: 'Nhân bản dòng',
  DELETE_ROW: 'Xóa dòng',
  COPY: 'Sao chép (Ctrl+C)',
  CUT: 'Cắt (Ctrl+X)',
  PASTE: 'Dán (Ctrl+V)',
};
const ContextMenuBase = createContextMenuComponent((item: ContextMenuItem) => {
  if (item.type === 'DELETE_ROWS') return <>Xóa dòng {item.fromRow + 1} đến {item.toRow + 1}</>;
  if (item.type === 'DUPLICATE_ROWS') return <>Nhân bản dòng {item.fromRow + 1} đến {item.toRow + 1}</>;
  return <>{MENU_LABEL[item.type] ?? item.type}</>;
});
const AddRowsBase = createAddRowsComponent({ button: 'Thêm', unit: 'dòng' });
// Kiểu FC của React 19 trả ReactNode, lưới đòi ReactElement: bọc lại.
// Menu chuột phải định vị "fixed" theo con trỏ: đưa ra document.body, vì khung Modal có transform làm lệch vị trí "fixed"
const ContextMenu = (p: ContextMenuComponentProps) =>
  createPortal(
    <div className="sheet-menu-host">
      <ContextMenuBase {...p} />
    </div>,
    document.body,
  );
const AddRows = (p: AddRowsComponentProps) => <AddRowsBase {...p} />;
const GUTTER_W = 44;
const ROW_H = 32;
const GUTTER = { basis: GUTTER_W, grow: 0, shrink: 0 };
const HEAD = 34;
/** Tiêu đề hai tầng: tầng nhóm đủ hai dòng chữ, tầng dưới một dòng (KH, TH) */
const HEAD2_TOP = 36;
const HEAD2_BOTTOM = 26;
const HEAD2 = HEAD2_TOP + HEAD2_BOTTOM;

interface HeadCell {
  key: string;
  label: string;
  left: number;
  width: number;
  row: 'full' | 'top' | 'bottom';
  filter?: HeadFilter;
}

/** Vị trí các ô tiêu đề hai tầng theo bề rộng cột (cột không thuộc nhóm thì cao hết hai tầng) */
function headLayout(cols: { title: string; group?: string; groupKey?: string; width: number; filter?: HeadFilter }[]) {
  const cells: HeadCell[] = [];
  let x = 0;
  for (let i = 0; i < cols.length; ) {
    const c = cols[i];
    if (!c.group) {
      cells.push({ key: `c${i}`, label: c.title, left: x, width: c.width, row: 'full', filter: c.filter });
      x += c.width;
      i++;
      continue;
    }
    let j = i;
    let w = 0;
    const key = c.groupKey ?? c.group;
    for (; j < cols.length && cols[j].group && (cols[j].groupKey ?? cols[j].group) === key; j++) {
      cells.push({ key: `s${j}`, label: cols[j].title, left: x + w, width: cols[j].width, row: 'bottom' });
      w += cols[j].width;
    }
    cells.push({ key: `g${i}`, label: c.group, left: x, width: w, row: 'top' });
    x += w;
    i = j;
  }
  return { cells, total: x };
}

/**
 * Chỗ đặt nút lọc trên tiêu đề. Thư viện nghe phím trên cả trang khi còn ô đang chọn: mở popup lọc thì bỏ ô đang chọn,
 * để chữ gõ trong ô tìm của popup không sửa ô của lưới. Nút nhận focus (Tab) thì cuộn lưới cho cột của nút hiện ra.
 */
function HeadFilterSlot({ filter, release, reveal }: { filter: HeadFilter; release: () => void; reveal: () => void }) {
  return (
    <span
      className="sheet-filter"
      onMouseDown={release}
      onFocus={() => {
        release();
        reveal();
      }}
    >
      {filter.node}
    </span>
  );
}

/**
 * Lớp tiêu đề phủ lên tiêu đề của thư viện: tiêu đề hai tầng (thư viện chỉ có một tầng) và nút lọc theo cột. Không nhận
 * chuột (bấm vào vẫn là bấm vào tiêu đề bên dưới, chọn cả cột), trừ ô tên nhóm (rê chuột xem đủ tên bước dài) và nút
 * lọc. Chữ của lớp phủ ẩn với trình đọc màn hình: tiêu đề bên dưới đã ghép tên nhóm ("Bước: KH"); nút lọc thì đọc được.
 * Lớp nằm trước lưới trong DOM: Tab tới nút lọc trước các ô, đúng thứ tự nhìn.
 */
function GroupHeader({ layout, height, host, release }: { layout: ReturnType<typeof headLayout>; height: number; host: RefObject<HTMLDivElement | null>; release: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const grid = host.current?.querySelector<HTMLDivElement>('.dsg-container');
    if (!grid) return;
    const sync = () => {
      if (track.current) track.current.style.transform = `translateX(${-grid.scrollLeft}px)`;
    };
    const measure = () => setWidth(grid.clientWidth);
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    measure();
    sync();
    grid.addEventListener('scroll', sync, { passive: true });
    return () => {
      ro.disconnect();
      grid.removeEventListener('scroll', sync);
    };
  }, [host]);
  /** Cuộn chính lưới cho đoạn [left, left + width) của tiêu đề hiện ra; lớp tiêu đề chạy theo qua sự kiện cuộn */
  const reveal = (left: number, w: number) => {
    const grid = host.current?.querySelector<HTMLDivElement>('.dsg-container');
    if (!grid) return;
    const view = grid.clientWidth - GUTTER_W;
    if (left < grid.scrollLeft) grid.scrollLeft = left;
    else if (left + w > grid.scrollLeft + view) grid.scrollLeft = left + w - view;
  };
  return (
    <div className="sheet-head2" style={{ height, width: width || undefined }}>
      <div className="sheet-head2-cell" data-row="full" style={{ left: 0, width: GUTTER_W }} aria-hidden>
        STT
      </div>
      <div className="sheet-head2-clip" style={{ left: GUTTER_W }}>
        <div ref={track} className="sheet-head2-track" style={{ width: layout.total }}>
          {layout.cells.map((c) => (
            <div
              key={c.key}
              className="sheet-head2-cell"
              data-row={c.row}
              data-filter={c.filter ? true : undefined}
              data-filtered={c.filter?.active || undefined}
              style={{ left: c.left, width: c.width, ...(c.row === 'top' ? { top: 0, height: HEAD2_TOP } : c.row === 'bottom' ? { top: HEAD2_TOP, height: HEAD2_BOTTOM } : {}) }}
              title={c.row === 'top' ? c.label : undefined}
            >
              <span aria-hidden>{c.label}</span>
              {c.filter && <HeadFilterSlot filter={c.filter} release={release} reveal={() => reveal(c.left, c.width)} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Ô chọn gần nhất sau một lần đổi dữ liệu. Xóa dòng thì thư viện giữ nguyên chỉ số ô đang chọn mà không báo đổi ô: dòng đã nhớ
 * không còn thì nhớ dòng đang nằm ở chỉ số đó (đúng dòng người dùng thấy đang chọn), không có thì bỏ.
 */
export function keepAnchor<T>(last: { key: string | number; col: number } | null, next: T[], key: (row: T) => string | number, activeIndex: number | null) {
  if (!last || next.some((r) => key(r) === last.key)) return last;
  const row = activeIndex === null ? undefined : next[activeIndex];
  return row === undefined ? null : { key: key(row), col: last.col };
}

/** Các dòng bị bỏ đi trong lần đổi dữ liệu mà không được phép xóa (đang may, ngoài phạm vi sửa…) */
export function blockedDeletes<T>(before: T[], after: T[], key: (row: T) => string | number, canDelete: (row: T) => boolean): T[] {
  const kept = new Set(after.map(key));
  return before.filter((r) => !kept.has(key(r)) && !canDelete(r));
}

/**
 * Có createRow thì thêm, chèn, nhân bản, xóa dòng được và dán quá cuối lưới tự thêm dòng; không có thì số dòng cố định.
 * Thêm dòng được thì bắt buộc có duplicateRow trả bản sao mang khóa dòng mới (trùng rowKey làm hỏng việc chặn xóa dòng).
 */
type RowOps<T> = { createRow: () => T; duplicateRow: (row: T) => T } | { createRow?: undefined; duplicateRow?: undefined };

type SheetGridProps<T> = RowOps<T> & {
  /** Tên lưới cho trình đọc màn hình */
  label: string;
  value: T[];
  onChange: (rows: T[]) => void;
  columns: SheetColumn<T>[];
  rowKey: (row: T) => string | number;
  /** Dòng không được xóa (đang may, ngoài phạm vi sửa): nút xóa mờ, xóa bằng menu chuột phải bị chặn */
  canDeleteRow?: (row: T) => boolean;
  /** Lý do dòng không xóa được (nút xóa, thông báo) thay cho câu mặc định */
  deleteReason?: (row: T) => string;
  /**
   * Nút "Thêm N dòng" chèn dòng của createRow ngay dưới dòng vừa chọn (không thêm ở cuối lưới), rồi chọn ô nhập được đầu tiên
   * của dòng mới. Chưa chọn dòng nào thì nhắc chọn trước. Dùng khi dòng mới phải đứng cạnh dòng gốc (màn chép thông tin của
   * dòng ngay trên trong onChange)
   */
  addAtActive?: boolean;
  /** Hiện khi không có dòng nào và không thêm dòng được */
  empty?: ReactNode;
  /** STT bắt đầu từ (trang - 1) * cỡ trang + 1 */
  indexOffset?: number;
  /**
   * Dòng của ô vừa chọn (để nút trên màn làm việc với dòng đó). Bấm ra ngoài lưới (vào chính nút đó) thì thư viện bỏ ô
   * đang chọn, nhưng dòng vẫn được giữ: không báo null.
   */
  onActiveRowChange?: (row: T) => void;
  /** Dòng đang chọn của màn: số thứ tự có vạch nổi bật, cả khi ô đang chọn đã mất */
  selectedKey?: string | number | null;
  /** Bấm đúp vào ô chỉ xem hoặc số thứ tự của một dòng (ô nhập được thì bấm đúp là sửa ô) */
  onRowOpen?: (row: T) => void;
  /** Câu hướng dẫn dưới lưới thay cho câu mặc định */
  hint?: ReactNode;
};

/**
 * Thanh cuộn ngang riêng, đồng bộ với lưới. Thanh cuộn ngang gốc của lưới bị ẩn: khi lưới ít dòng (cao theo nội dung),
 * thanh cuộn gốc làm phép đo chiều cao của thư viện lệch một nhịp và lưới co giãn liên tục.
 */
function useHorizontalScroll(active: boolean) {
  const fillRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ scroll: 0, client: 0 });
  useEffect(() => {
    const grid = fillRef.current?.querySelector<HTMLDivElement>('.dsg-container');
    const bar = barRef.current;
    if (!active || !grid || !bar) return;
    const measure = () => setSize((s) => (s.scroll === grid.scrollWidth && s.client === grid.clientWidth ? s : { scroll: grid.scrollWidth, client: grid.clientWidth }));
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    if (grid.firstElementChild) ro.observe(grid.firstElementChild);
    const fromGrid = () => {
      if (bar.scrollLeft !== grid.scrollLeft) bar.scrollLeft = grid.scrollLeft;
    };
    const fromBar = () => {
      if (grid.scrollLeft !== bar.scrollLeft) grid.scrollLeft = bar.scrollLeft;
    };
    grid.addEventListener('scroll', fromGrid);
    bar.addEventListener('scroll', fromBar);
    measure();
    return () => {
      ro.disconnect();
      grid.removeEventListener('scroll', fromGrid);
      bar.removeEventListener('scroll', fromBar);
    };
  }, [active]);
  return { fillRef, barRef, overflow: size.scroll > size.client + 1, scrollWidth: size.scroll };
}

/** Lưới nhập liệu kiểu bảng tính, lấp đầy khung chứa (khung cha là flex cột có chiều cao) */
export function SheetGrid<T>({ label, value, onChange, columns, rowKey, createRow, duplicateRow, canDeleteRow, deleteReason, addAtActive, empty, indexOffset = 0, onActiveRowChange, selectedKey, onRowOpen, hint }: SheetGridProps<T>) {
  const { ref, height } = useElementSize();
  // Hàm do trang truyền vào thường viết tại chỗ: đọc qua ref để các prop đưa vào lưới giữ nguyên, ô không vẽ lại cả lưới
  const latest = useRef({ value, onChange, columns, rowKey, createRow, duplicateRow, canDeleteRow, deleteReason, onActiveRowChange, onRowOpen });
  latest.current = { value, onChange, columns, rowKey, createRow, duplicateRow, canDeleteRow, deleteReason, onActiveRowChange, onRowOpen };
  const activeRow = useRef<number | null>(null);
  // Ô chọn gần nhất: bấm nút Thêm (ngoài các ô) thì thư viện bỏ ô đang chọn, nút vẫn cần biết chèn dưới dòng nào
  const lastCell = useRef<{ key: string | number; col: number } | null>(null);
  // Chỉ dời dòng neo khi dữ liệu đã đổi thật: màn có thể từ chối lần đổi (xóa làm mất màu cỡ), khi đó dòng neo giữ nguyên.
  // Effect của lưới con chạy trước nên ô vừa báo đổi (handleActive) đã ghi neo hợp lệ
  useEffect(() => {
    lastCell.current = keepAnchor(lastCell.current, value, latest.current.rowKey, activeRow.current);
  }, [value]);
  const grid = useRef<DataSheetGridRef>(null);
  // Ô đang gõ dở chưa ghi vào dòng (ô ngày chỉ ghi khi Enter, Tab hoặc rời ô): vẫn tính là chưa lưu, để tải lại trang, đóng
  // tab hay rời màn bằng phím tắt cũng được hỏi lại. Hết khi ô ghi vào dòng, chuyển ô hoặc Esc
  const [typing, setTyping] = useState(false);
  useLeaveGuard(typing);

  const grouped = columns.some((c) => c.group);
  // Lớp tiêu đề của SheetGrid (phủ lên tiêu đề của thư viện) khi có nhóm cột hoặc có nút lọc trên tiêu đề. Nút lọc không
  // đặt trong tiêu đề của thư viện: nằm giữa hai mỏ neo Tab của thư viện thì không Tab tới được, và bấm vào là chọn cả cột
  const overlay = grouped || columns.some((c) => c.headFilter);
  /** Bỏ ô và vùng đang chọn (mở popup lọc, mở chi tiết dòng): phím gõ sau đó không tới lưới */
  const release = useCallback(() => {
    grid.current?.setSelection(null);
    grid.current?.setActiveCell(null);
  }, []);
  // Có lớp tiêu đề: mọi cột đúng bề rộng minWidth (lớp tiêu đề tính vị trí theo đó), tiêu đề bên dưới ghép tên nhóm cho
  // trình đọc màn hình
  const gridColumns = useMemo(
    () =>
      overlay
        ? columns.map(({ group, groupKey: _key, headFilter: _filter, ...c }) => {
            const w = c.minWidth ?? 90;
            return { ...c, title: group && typeof c.title === 'string' ? `${group}: ${c.title}` : c.title, basis: w, grow: 0, shrink: 0, minWidth: w, maxWidth: w };
          })
        : columns.map(({ group: _group, groupKey: _key, headFilter: _filter, ...c }) => c),
    [columns, overlay],
  );
  const layout = useMemo(
    () =>
      overlay
        ? headLayout(columns.map((c) => ({ title: typeof c.title === 'string' ? c.title : '', group: c.group, groupKey: c.groupKey, width: c.minWidth ?? 90, filter: c.group ? undefined : c.headFilter })))
        : null,
    [columns, overlay],
  );
  const gutter = useMemo(
    () => (indexOffset ? { ...GUTTER, component: ({ rowIndex }: CellProps<T, unknown>) => <span className="sheet-text">{indexOffset + rowIndex + 1}</span> } : GUTTER),
    [indexOffset],
  );
  const handleActive = useCallback(({ cell }: { cell: { row: number; col: number } | null }) => {
    activeRow.current = cell?.row ?? null;
    setTyping(false);
    const { onActiveRowChange: emit, value: rows, rowKey: key } = latest.current;
    const row = cell ? rows[cell.row] : undefined;
    if (row === undefined || !cell) return;
    lastCell.current = { key: key(row), col: cell.col };
    emit?.(row);
  }, []);
  const rowClassName = useMemo(
    () => (selectedKey == null ? undefined : ({ rowData }: { rowData: T }) => (latest.current.rowKey(rowData) === selectedKey ? 'sheet-row-selected' : undefined)),
    [selectedKey],
  );
  // Ô nhập được thì bấm đúp là sửa ô; ô chỉ xem (thư viện gắn dsg-cell-disabled) và cột số thứ tự thì mở dòng
  const openRow = (e: MouseEvent<HTMLDivElement>) => {
    const { onRowOpen: open, value: rows } = latest.current;
    const target = e.target as HTMLElement;
    if (!open || activeRow.current == null || target.closest('.dsg-row-header')) return;
    if (!target.closest('.dsg-cell-disabled, .dsg-cell-gutter')) return;
    const row = rows[activeRow.current];
    if (!row) return;
    // Thư viện nghe phím, chép, dán trên cả trang khi còn ô đang chọn: bỏ ô đang chọn để phím trong popup vừa mở không
    // di chuyển hay xóa ô của lưới bên dưới
    release();
    open(row);
  };
  const fixedRows = !createRow;
  const showEmpty = fixedRows && value.length === 0 && !!empty;
  const scroll = useHorizontalScroll(height > 0 && !showEmpty);

  // Cột nút xóa dính bên phải
  const stickyRight = useMemo(
    () =>
      fixedRows
        ? undefined
        : {
            basis: 40,
            grow: 0,
            shrink: 0,
            component: ({ rowData, deleteRow }: CellProps<T, unknown>) => {
              const allowed = latest.current.canDeleteRow?.(rowData) ?? true;
              const label = allowed ? 'Xóa dòng' : (latest.current.deleteReason?.(rowData) ?? 'Dòng đang may, đã xong hoặc ngoài phạm vi sửa nên không xóa được');
              // data-disabled thay cho disabled: nút vẫn nhận rê chuột, chạm và Tab để hiện lý do
              return (
                <Tooltip label={label} openDelay={300} multiline maw={260}>
                  <ActionIcon variant="subtle" color="red" size="md" m="auto" aria-label={label} data-disabled={!allowed || undefined} aria-disabled={!allowed || undefined} onClick={allowed ? deleteRow : undefined}>
                    <IconTrash size={15} />
                  </ActionIcon>
                </Tooltip>
              );
            },
          },
    [fixedRows],
  );

  const handleChange = useCallback((next: T[]) => {
    setTyping(false);
    const { value: before, onChange: emit, rowKey: key, canDeleteRow: canDelete, deleteReason: reason } = latest.current;
    const blocked = canDelete ? blockedDeletes(before, next, key, canDelete) : [];
    if (blocked.length) {
      toastWarn(reason ? reason(blocked[0]) : `${blocked.length} dòng đang may, đã xong hoặc ngoài phạm vi sửa của bạn nên không xóa được.`, 'Chưa xóa được');
      return;
    }
    emit(next);
  }, []);
  const gridRowKey = useCallback(({ rowData }: { rowData: T }) => String(latest.current.rowKey(rowData)), []);
  const gridDuplicate = useCallback(({ rowData }: { rowData: T }) => latest.current.duplicateRow?.(rowData) ?? { ...rowData }, []);
  const gridCreate = useCallback(() => latest.current.createRow!(), []);
  // Lưới tĩnh đọc addRowsComponent một lần: hàm chèn đọc dữ liệu mới nhất qua ref
  const addRows = useMemo(() => {
    if (!addAtActive) return AddRows;
    const insert = (count: number) => {
      const { value: rows, columns: cols, rowKey: key, createRow: create, onChange: emit } = latest.current;
      const at = lastCell.current ? rows.findIndex((r) => key(r) === lastCell.current?.key) : -1;
      if (at < 0 || !create) {
        toastWarn('Chọn một ô của dòng cần thêm rồi bấm Thêm: dòng mới chép thông tin của dòng đó và nằm ngay dưới.', 'Chưa chọn dòng');
        return;
      }
      const added = Array.from({ length: Math.max(1, count) }, () => create());
      emit([...rows.slice(0, at + 1), ...added, ...rows.slice(at + 1)]);
      // Chọn ô nhập được đầu tiên của dòng mới (ô chỉ đọc như màu, cỡ chép từ dòng gốc thì bỏ qua)
      const open = cols.findIndex((c) => !(typeof c.disabled === 'function' ? c.disabled({ rowData: added[0], rowIndex: at + 1 }) : c.disabled));
      const col = open >= 0 ? open : (lastCell.current?.col ?? 0);
      // Chọn ô ở dòng mới sau khi lưới nhận dữ liệu mới
      requestAnimationFrame(() => grid.current?.setActiveCell({ col, row: at + 1 }));
    };
    return (p: AddRowsComponentProps) => <AddRowsBase {...p} addRows={(n) => insert(n ?? 1)} />;
  }, [addAtActive]);

  // Enter trong ô của lưới không được gửi form chứa lưới (popup Thêm PO): ô "Thêm N dòng", Shift+Enter khi đang sửa ô
  const stopFormSubmit = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault();
  };
  // Gõ trong ô chữ, số, ngày của lưới. Không tính chữ tìm của ô chọn (chuyền, trạng thái: chọn xong mới ghi, chữ tìm không
  // phải dữ liệu) và ô tìm của popup lọc (nằm ngoài lưới trong DOM dù cùng cây React)
  const markTyping = (e: FormEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement && e.target.matches('.dsg-container input.dsg-input')) setTyping(true);
  };

  return (
    <div
      className="sheet-wrap"
      // Chiều cao dòng cho CSS (ô gộp dời chữ lên nửa dòng)
      style={{ '--sheet-row-h': `${ROW_H}px` } as CSSProperties}
      role="region"
      aria-label={label}
      onKeyDown={stopFormSubmit}
      onKeyDownCapture={(e) => e.key === 'Escape' && setTyping(false)}
      onInputCapture={markTyping}
      onDoubleClick={onRowOpen ? openRow : undefined}
    >
      <div ref={ref} className="sheet-body">
        {showEmpty ? (
          <div className="grid-empty">{empty}</div>
        ) : (
          height > 0 && (
            // Lưới nằm tuyệt đối trong khung: chiều cao lưới không đẩy ngược chiều cao khung (vòng lặp đo kích thước)
            <div ref={scroll.fillRef} className="sheet-fill">
              {layout && <GroupHeader layout={layout} height={grouped ? HEAD2 : HEAD} host={scroll.fillRef} release={release} />}
              <DataSheetGrid<T>
                ref={grid}
                className="sheet-root"
                value={value}
                onChange={handleChange}
                columns={gridColumns}
                rowKey={gridRowKey}
                height={height - (fixedRows ? 0 : 46) - (scroll.overflow ? 12 : 0)}
                rowHeight={ROW_H}
                headerRowHeight={grouped ? HEAD2 : HEAD}
                gutterColumn={gutter}
                onActiveCellChange={handleActive}
                rowClassName={rowClassName}
                stickyRightColumn={stickyRight}
                lockRows={fixedRows}
                createRow={fixedRows ? undefined : gridCreate}
                duplicateRow={gridDuplicate}
                addRowsComponent={fixedRows ? false : addRows}
                contextMenuComponent={ContextMenu}
              />
              <div ref={scroll.barRef} className="sheet-hscroll" hidden={!scroll.overflow} aria-hidden tabIndex={-1}>
                <div style={{ width: scroll.scrollWidth, height: 1 }} />
              </div>
            </div>
          )
        )}
      </div>
      <Text size="xs" c="dimmed" className="sheet-hint">
        {hint ?? <>Dán từ Excel: chọn ô đầu rồi Ctrl+V. Kéo ô vuông nhỏ ở góc vùng chọn để điền xuống.{fixedRows ? '' : ' Chuột phải để chèn, nhân bản hoặc xóa dòng.'}</>}
      </Text>
    </div>
  );
}
