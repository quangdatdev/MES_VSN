import { Button, Group, Select } from '@mantine/core';
import { IconFilterOff, IconSearch } from '@tabler/icons-react';
import { useMemo, type ReactNode } from 'react';
import { readable, type FieldPolicy } from '../lib/fieldPolicy';
import { LINE_EMPTY, LINE_NOT_FOUND, lineOptions } from '../lib/lines';
import { emptyFilter, type OrderFilter } from '../lib/pagedList';
import type { LineInfo } from '../lib/types';
import { useBranchName } from './BranchName';
import { ColumnFilterNote } from './ColumnFilter';
import { DateField } from './DateField';
import { DebouncedAutocomplete, DebouncedTextInput } from './DebouncedInput';
import { statusOptions, type StatusMap } from './StatusBadge';
import { TreeSelect } from './TreeSelect';

// Mảng rỗng dùng chung khi chưa có dữ liệu: mảng mới mỗi lần vẽ làm danh sách chọn tính lại liên tục
const NO_STRINGS: string[] = [];
const NO_LINES: LineInfo[] = [];

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
