import { Badge, Button, Group, List, Select, Stack } from '@mantine/core';
import { IconDownload, IconFilterOff, IconSearch } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useBranchName } from '../../components/BranchName';
import { ColumnFilterNote } from '../../components/ColumnFilter';
import { DateField } from '../../components/DateField';
import { DebouncedAutocomplete, DebouncedTextInput } from '../../components/DebouncedInput';
import { TreeSelect } from '../../components/TreeSelect';
import { api, ApiError, download } from '../../lib/api';
import { useColumnFilters, valuesLoader } from '../../lib/columnFilter';
import type { FieldPolicy } from '../../lib/fieldPolicy';
import { qs } from '../../lib/format';
import { LINE_EMPTY, LINE_NOT_FOUND, lineOptions } from '../../lib/lines';
import { toastError } from '../../lib/notify';
import { pageOf, useClampPage, useUrlParams, type UrlPatch } from '../../lib/useUrlParams';
import { ORDER_OPTIONS_KEY } from '../../lib/queryKeys';
import { useStableByKey } from '../../lib/useStable';
import type { LineInfo, Paged } from '../../lib/types';
import { useCan } from '../../shell/permissions';
import { useSession } from '../../store/session';
import { emptyFilter, type FactoryOption, type OrderFilter } from './api';

type StatusMap = Record<string, { label: string; color: string }>;

export const SALES_STATUS: StatusMap = {
  NEW: { label: 'Mới', color: 'gray' },
  PLANNING: { label: 'Đã lập kế hoạch', color: 'link' },
  IN_PRODUCTION: { label: 'Đang sản xuất', color: 'orange' },
  DONE: { label: 'Hoàn thành', color: 'teal' },
  CANCELLED: { label: 'Đã hủy', color: 'red' },
};
export const PLAN_STATUS: StatusMap = {
  PLANNED: { label: 'Chưa xếp chuyền', color: 'gray' },
  SCHEDULED: { label: 'Đã xếp chuyền', color: 'link' },
  IN_PRODUCTION: { label: 'Đang sản xuất', color: 'orange' },
  DONE: { label: 'Hoàn thành', color: 'teal' },
};
export const PO_STATUS: StatusMap = {
  DRAFT: { label: 'Chưa xác nhận', color: 'gray' },
  PARTIAL: { label: 'Xác nhận một phần', color: 'orange' },
  CONFIRMED: { label: 'Đã xác nhận', color: 'teal' },
};
export const LINE_STATUS: StatusMap = {
  PLANNED: { label: 'Chưa phân màu cỡ', color: 'gray' },
  ALLOCATED: { label: 'Đã phân màu cỡ', color: 'link' },
  IN_PRODUCTION: { label: 'Đang may', color: 'orange' },
  DONE: { label: 'Đã xong', color: 'teal' },
};

export function StatusBadge({ map, code }: { map: StatusMap; code: string }) {
  const s = map[code] ?? { label: code, color: 'gray' };
  return (
    <Badge size="sm" variant="light" color={s.color}>
      {s.label}
    </Badge>
  );
}

export const statusOptions = (map: StatusMap) => Object.entries(map).map(([value, s]) => ({ value, label: s.label }));

// Mảng rỗng dùng chung khi chưa có dữ liệu: mảng mới mỗi lần vẽ làm cột lưới, danh sách chọn tính lại liên tục
const NO_STRINGS: string[] = [];
const NO_NAMES: Record<string, string> = {};
const NO_FACTORIES: FactoryOption[] = [];
const NO_LINES: LineInfo[] = [];


/** Khách hàng để gợi ý trong ô lọc; người không xem được Thông tin đơn hàng vẫn gõ tay được. */
export function useCustomers() {
  const can = useCan('order.allocation:view');
  const branch = useSession((s) => s.branch?.code);
  const q = useQuery({
    queryKey: [...ORDER_OPTIONS_KEY, branch],
    queryFn: () =>
      api<{ customers: string[]; seasons: string[]; orderTypes: string[]; orderTypeNames: Record<string, string>; units: string[]; factories: FactoryOption[] }>('/order/sales-orders/options'),
    enabled: can,
    staleTime: 60_000,
  });
  const d = q.data;
  // Loại đơn hàng, đơn vị tính, nhà máy sản xuất theo Quản trị › Danh mục hệ thống (Loại kèm các giá trị đã có trong dữ liệu)
  return {
    customers: d?.customers ?? NO_STRINGS,
    seasons: d?.seasons ?? NO_STRINGS,
    orderTypes: d?.orderTypes ?? NO_STRINGS,
    orderTypeNames: d?.orderTypeNames ?? NO_NAMES,
    units: d?.units ?? NO_STRINGS,
    factories: d?.factories ?? NO_FACTORIES,
  };
}

export function useLinesState() {
  const branch = useSession((s) => s.branch?.code);
  const q = useQuery({ queryKey: ['me', 'lines', branch], queryFn: () => api<LineInfo[]>('/me/lines'), staleTime: 60_000 });
  return { lines: q.data ?? NO_LINES, loaded: q.isSuccess };
}

export function useLines() {
  return useLinesState().lines;
}

interface FilterProps {
  value: OrderFilter;
  onChange: (f: OrderFilter) => void;
  customers?: string[];
  seasons?: string[];
  statuses?: StatusMap;
  lines?: LineInfo[];
  /** Ẩn bộ lọc ngày xuất hàng (màn không có cột này) */
  noShipDate?: boolean;
  /** Ô tìm nhanh theo số chứng từ, PO/Buy date... */
  search?: { label: string; placeholder: string };
  /** Chính sách cột của màn: cột bị Ẩn hoặc Che thì không có ô lọc theo cột đó (máy chủ cũng bỏ qua bộ lọc này). */
  policy?: FieldPolicy;
  /** Ô lọc riêng của màn (ví dụ Người lập), đặt trước nút Xóa lọc */
  extra?: ReactNode;
  /** Ô lọc riêng đang khác mặc định: vẫn hiện Xóa lọc */
  extraActive?: boolean;
  /** Xóa lọc đặt lại cả ô lọc riêng */
  onClearExtra?: () => void;
  /** Bộ lọc theo cột của lưới (nút mũi tên trên tiêu đề): hiện tên cột đang lọc, Xóa lọc xóa luôn */
  columns?: { names: string[]; onClear: () => void };
}


/** Cột xem được nguyên giá trị (không Ẩn, không Che) thì mới lọc được theo nó. */
export const readable = (policy: FieldPolicy | undefined, field: string) => !policy || (policy.level(field) !== 'HIDDEN' && policy.level(field) !== 'MASKED');

/** Dải lọc theo mô tả giao diện: Ngày xuất hàng từ - đến, Khách hàng, Mã hàng, Season, Trạng thái, Chuyền. */
export function OrderFilters({ value, onChange, customers, seasons, statuses, lines, noShipDate, search, policy, extra, extraActive, onClearExtra, columns }: FilterProps) {
  const set = (patch: Partial<OrderFilter>) => onChange({ ...value, ...patch });
  const dirty = Object.values(value).some(Boolean) || !!extraActive || !!columns?.names.length;
  const branchName = useBranchName();
  const lineChoices = useMemo(() => lineOptions(lines ?? NO_LINES, undefined, branchName), [lines, branchName]);
  return (
    <Group gap="sm" align="flex-end" wrap="wrap" className="filter-bar">
      {!noShipDate && readable(policy, 'shipDate') && (
        <Group gap={6} align="flex-end" wrap="nowrap">
          <DateField label="Ngày xuất hàng từ" value={value.shipFrom} onChange={(v) => set({ shipFrom: v })} w={150} />
          <DateField label="đến" value={value.shipTo} onChange={(v) => set({ shipTo: v })} minDate={value.shipFrom || undefined} w={150} />
        </Group>
      )}
      {readable(policy, 'customerName') && <DebouncedAutocomplete label="Khách hàng" placeholder="Tất cả" data={customers ?? NO_STRINGS} limit={50} value={value.customer} onChange={(v) => set({ customer: v })} w={200} />}
      {readable(policy, 'styleCode') && <DebouncedTextInput label="Mã hàng" placeholder="Gõ một phần mã" leftSection={<IconSearch size={14} />} value={value.style} onChange={(v) => set({ style: v })} w={170} />}
      {search && <DebouncedTextInput label={search.label} placeholder={search.placeholder} value={value.q} onChange={(v) => set({ q: v })} w={190} />}
      {seasons && readable(policy, 'season') && <Select label="Season" placeholder="Tất cả" data={seasons} value={value.season || null} onChange={(v) => set({ season: v ?? '' })} clearable w={120} />}
      {statuses && readable(policy, 'statusCode') && <Select label="Trạng thái" placeholder="Tất cả" data={statusOptions(statuses)} value={value.status || null} onChange={(v) => set({ status: v ?? '' })} clearable w={180} />}
      {lines && readable(policy, 'lineCode') && <TreeSelect label="Chuyền" placeholder="Tất cả" options={lineChoices} value={value.line || null} onChange={(v) => set({ line: v ?? '' })} clearable unit="chuyền" nothingFoundMessage={LINE_NOT_FOUND} emptyMessage={LINE_EMPTY} w={190} />}
      {extra}
      {columns && <ColumnFilterNote names={columns.names} />}
      {dirty && (
        <Button
          variant="subtle"
          color="gray"
          leftSection={<IconFilterOff size={15} />}
          onClick={() => {
            onChange(emptyFilter);
            onClearExtra?.();
            columns?.onClear();
          }}
        >
          Xóa lọc
        </Button>
      )}
    </Group>
  );
}

export function filterParams(f: OrderFilter) {
  return { shipFrom: f.shipFrom, shipTo: f.shipTo, customer: f.customer.trim(), style: f.style.trim(), season: f.season, status: f.status, line: f.line, q: f.q.trim() };
}


const FILTER_KEYS = Object.keys(emptyFilter) as (keyof OrderFilter)[];

/**
 * Bộ lọc chung: đọc từ URL lúc mở màn, giữ ở state, mỗi lần đổi thì ghi URL cùng lúc với các tham số khác (`extra`, ví dụ
 * về trang 1). Ô chữ tự chờ ngừng gõ (`DebouncedTextInput`) nên màn vẽ lại và gọi danh sách một lần mỗi lần đổi lọc.
 * Ô lọc đọc state chứ không đọc URL: URL đổi trong startTransition của React Router, đọc từ đó thì ô có thể nhận giá trị
 * chậm một nhịp (ghi đè chữ đang gõ, Xóa lọc không xóa được chữ trong ô).
 */
export function useUrlFilter(params: URLSearchParams, patch: (values: UrlPatch) => void) {
  const [filter, setState] = useState<OrderFilter>(() => FILTER_KEYS.reduce((f, k) => ({ ...f, [k]: params.get(k) ?? '' }), emptyFilter));
  const setFilter = useCallback(
    (f: OrderFilter, extra: UrlPatch = {}) => {
      setState(f);
      patch({ ...f, ...extra });
    },
    [patch],
  );
  return { filter, setFilter, filtered: Object.values(filter).some(Boolean) };
}

/**
 * Danh sách có phân trang, sắp xếp, lọc (debounce) cho một endpoint của module; trang, sắp xếp, bộ lọc nằm trên URL.
 * Mặc định 100 dòng đầu, mới tạo lên trước; xem thêm thì sang trang. Mọi bộ lọc (dải lọc và lọc theo cột) chạy trong DB.
 */
export function usePagedList<T>(key: string, path: string, defaultSort = 'createdAt:desc', pageSize = 100) {
  const branch = useSession((s) => s.branch?.code);
  const [url, patch] = useUrlParams();
  const page = pageOf(url);
  const sort = url.get('sort') || defaultSort;
  const { filter, setFilter, filtered } = useUrlFilter(url, patch);
  const cols = useColumnFilters(url, patch);
  // Giữ nguyên object bộ lọc khi nội dung không đổi: hàm lấy giá trị cho popup lọc (nút lọc memo) cũng giữ nguyên
  const rawParams = { ...filterParams(filter), cf: cols.param };
  const params = useStableByKey(rawParams, JSON.stringify(rawParams));
  const loadValues = useMemo(() => valuesLoader(path, params), [path, params]);
  const query = useQuery({
    queryKey: ['order', key, branch, page, sort, params],
    queryFn: () => api<Paged<T>>(`${path}${qs({ page, pageSize, sort, ...params })}`),
    placeholderData: keepPreviousData,
  });
  useClampPage(query.data, page, pageSize, (p) => patch({ page: p > 1 ? p : null }));
  const changeFilter = (f: OrderFilter) => setFilter(f, { page: null });
  return {
    query,
    url,
    patch,
    page,
    setPage: (p: number) => patch({ page: p > 1 ? p : null }),
    pageSize,
    sort,
    setSort: (s: string) => patch({ sort: s === defaultSort ? null : s, page: null }),
    filter,
    /** Đang có bộ lọc (dải lọc hoặc theo cột): câu báo rỗng kèm nút Xóa lọc */
    filtered: filtered || cols.active,
    setFilter: changeFilter,
    clearFilter: () => {
      changeFilter(emptyFilter);
      cols.clear();
    },
    /** Props lọc theo cột cho DataGrid */
    grid: { columnFilters: cols.filters, onColumnFilter: cols.setFilter, loadValues },
    /** Cho dải lọc: tên các cột đang lọc (theo bảng tên cột của màn) và nút Xóa lọc */
    columnsOf: (names: Record<string, string>, policy?: FieldPolicy) => ({
      names: Object.keys(cols.filters)
        .filter((k) => readable(policy, k))
        .map((k) => names[k] ?? k),
      onClear: cols.clear,
    }),
    exportPath: `${path}/export${qs({ sort, ...params })}`,
    error: query.error ? (query.error instanceof ApiError ? query.error.message : 'Không tải được dữ liệu. Kiểm tra kết nối rồi thử lại.') : null,
  };
}

/** Lý do nút thao tác theo dòng bị khóa khi chưa chọn dòng nào */
export const PICK_ROW = 'Chọn một dòng trong lưới trước';

/** Thông báo lỗi tải của một truy vấn: máy chủ nói rõ thì dùng câu đó, không thì câu dự phòng. */
export const loadError = (e: unknown, fallback: string) => (e ? (e instanceof ApiError ? e.message : fallback) : null);

/** Câu báo lưới rỗng: đang lọc thì nói không có gì khớp, kèm nút Xóa lọc; chưa lọc thì câu hướng dẫn. */
export function EmptyState({ filtered, what, hint, onClear }: { filtered: boolean; what: string; hint: ReactNode; onClear: () => void }) {
  if (!filtered) return <>{hint}</>;
  return (
    <Stack align="center" gap={8}>
      <span>Không có {what} nào khớp bộ lọc.</span>
      <Button size="xs" variant="default" leftSection={<IconFilterOff size={14} />} onClick={onClear}>
        Xóa lọc
      </Button>
    </Stack>
  );
}

/** Các dòng có vấn đề trong thông báo: tối đa 5 dòng, phần còn lại gộp thành "và N dòng khác". */
export function IssueList({ items, max = 5 }: { items: string[]; max?: number }) {
  return (
    <List size="sm" spacing={2} mt={4}>
      {items.slice(0, max).map((t, i) => (
        <List.Item key={i}>{t}</List.Item>
      ))}
      {items.length > max && <List.Item>và {items.length - max} dòng khác</List.Item>}
    </List>
  );
}

export function ExportButton({ resource, path, fileName }: { resource: string; path: string; fileName: string }) {
  const can = useCan(`${resource}:export`);
  const [busy, setBusy] = useState(false);
  if (!can) return null;
  return (
    <Button
      variant="default"
      leftSection={<IconDownload size={15} />}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await download(path, fileName);
        } catch (e) {
          toastError(e, 'Chưa xuất được file');
        } finally {
          setBusy(false);
        }
      }}
    >
      Xuất file
    </Button>
  );
}

/** Thao tác ghi chỉ có ở nhà máy cụ thể (A00 chỉ đọc); vẫn để backend cưỡng chế. */
export function useCanWrite(permission: string) {
  const can = useCan(permission);
  const aggregate = useSession((s) => !!s.branch?.isAggregate);
  return can && !aggregate;
}
