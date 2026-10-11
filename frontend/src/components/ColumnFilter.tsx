import { Button, Checkbox, Group, Loader, Popover, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { IconChevronDown, IconFilterFilled, IconFilterOff, IconSearch } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { memo, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { ApiError } from '../lib/api';
import { filterUrlLength, MAX_FILTER_URL, MAX_FILTER_VALUES, type ColumnFilter, type ColumnFilters, type FilterValue, type LoadValues } from '../lib/columnFilter';
import { fmtNum } from '../lib/format';
import { ActionButton } from './ActionButton';

const BLANK = '(Trống)';
// So chuỗi không phân biệt hoa thường như SQL Server: giá trị trên URL "abc" vẫn khớp "ABC" máy chủ trả về
const keyOf = (v: FilterValue) => (v === null ? '\u0000' : typeof v === 'number' ? `n:${v}` : `s:${v.toLowerCase()}`);

/** Một giá trị trong popup (tối đa 500 giá trị): memo, tích một ô không vẽ lại cả danh sách */
const ValueOption = memo(function ValueOption({ value, text, checked, onToggle }: { value: FilterValue; text: string; checked: boolean; onToggle: (v: FilterValue) => void }) {
  return <Checkbox size="xs" label={text} checked={checked} onChange={() => onToggle(value)} />;
});

interface PanelProps {
  title: string;
  field: string;
  current?: ColumnFilter;
  /** Bộ lọc của các cột khác: cùng gửi trong một tham số, để biết bộ lọc sau khi áp dụng có quá dài không */
  others: ColumnFilters;
  load: LoadValues;
  label: (v: Exclude<FilterValue, null>) => string;
  onApply: (f: ColumnFilter | null) => void;
  onCancel: () => void;
}

/**
 * Nội dung popup lọc của một cột, kiểu bộ lọc của Excel: danh sách giá trị lấy từ DB (theo phạm vi và các bộ lọc khác
 * đang áp), "Chọn tất cả", ô tìm. Đang tìm thì Áp dụng chỉ giữ các giá trị đang tích trong kết quả tìm, như Excel.
 */
function ColumnFilterPanel({ title, field, current, others, load, label, onApply, onCancel }: PanelProps) {
  const [search, setSearch] = useState('');
  // Tự debounce (300 ms) để Enter đẩy chữ đang gõ đi tìm ngay, không phải chờ
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  // Chữ gõ chưa kịp tìm: danh sách đang hiện là của lần tìm trước, chưa áp dụng được (review 5.6 M1)
  const pending = search.trim() !== debounced;
  const [draft, setDraft] = useState<ColumnFilter>(current ?? { mode: 'notIn', values: [] });
  // Mỗi lần mở popup đọc lại từ DB: dữ liệu và các bộ lọc khác có thể đã đổi từ lần mở trước
  const openId = useId();
  const q = useQuery({
    queryKey: ['column-values', openId, field, debounced],
    queryFn: () => load(field, debounced),
    placeholderData: keepPreviousData,
    gcTime: 0,
    retry: false,
  });
  const values = useMemo(() => q.data?.values ?? [], [q.data]);
  const members = useMemo(() => new Set(draft.values.map(keyOf)), [draft.values]);
  const isChecked = (v: FilterValue) => (draft.mode === 'in') === members.has(keyOf(v));
  const searching = debounced !== '';
  const allChecked = values.length > 0 && values.every(isChecked);
  const someChecked = values.some(isChecked);

  const toggle = useCallback(
    (v: FilterValue) =>
      setDraft((d) => {
        const k = keyOf(v);
        return d.values.some((x) => keyOf(x) === k) ? { ...d, values: d.values.filter((x) => keyOf(x) !== k) } : { ...d, values: [...d.values, v] };
      }),
    [],
  );
  const toggleAll = () => {
    // Không tìm: chọn hết là bỏ lọc, bỏ hết là chưa chọn gì (kể cả giá trị chưa hiện vì quá 500)
    if (!searching) return setDraft(allChecked ? { mode: 'in', values: [] } : { mode: 'notIn', values: [] });
    const target = !allChecked;
    setDraft((d) => {
      const shown = new Set(values.map(keyOf));
      const rest = d.values.filter((x) => !shown.has(keyOf(x)));
      return { ...d, values: (d.mode === 'in') === target ? [...rest, ...values] : rest };
    });
  };

  const result: ColumnFilter | null = searching
    ? { mode: 'in', values: values.filter(isChecked) }
    : draft.mode === 'notIn' && draft.values.length === 0
      ? null
      : draft;
  const blocked = pending || q.isLoading || q.isPlaceholderData
    ? 'Đang tìm giá trị…'
    : q.error
      ? 'Chưa tải được giá trị của cột'
      : result?.mode === 'in' && result.values.length === 0
        ? 'Chọn ít nhất một giá trị'
        : result && (result.values.length > MAX_FILTER_VALUES || filterUrlLength({ ...others, [field]: result }) > MAX_FILTER_URL)
          ? 'Chọn quá nhiều giá trị. Gõ thêm vào ô tìm để thu hẹp, hoặc bỏ bớt giá trị.'
          : null;
  const apply = () => {
    if (!blocked) onApply(result);
  };

  return (
    <Stack gap={8}>
      <TextInput
        size="xs"
        data-autofocus
        placeholder="Tìm giá trị"
        aria-label={`Tìm giá trị của cột ${title}`}
        leftSection={<IconSearch size={14} />}
        rightSection={q.isFetching && values.length > 0 ? <Loader size={12} color="brand" /> : null}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          // Chữ vừa gõ chưa tìm: Enter tìm ngay; xem kết quả rồi Enter lần nữa để áp dụng
          if (pending) setDebounced(search.trim());
          else apply();
        }}
      />
      <div className="col-filter-list" role="group" aria-label={`Giá trị của cột ${title}`} aria-busy={q.isFetching || undefined} data-refreshing={q.isPlaceholderData || undefined}>
        {q.isLoading ? (
          <Group justify="center" py="md" role="status" aria-label="Đang tải giá trị">
            <Loader size="sm" color="brand" />
          </Group>
        ) : q.error ? (
          <Stack align="center" gap={6} py="sm" role="alert">
            <Text size="xs" c="red" ta="center">
              {q.error instanceof ApiError ? q.error.message : 'Không tải được giá trị của cột. Kiểm tra kết nối rồi thử lại.'}
            </Text>
            <Button size="xs" variant="default" onClick={() => void q.refetch()}>
              Thử lại
            </Button>
          </Stack>
        ) : values.length === 0 ? (
          <Text size="xs" c="dimmed" ta="center" py="sm">
            {searching ? 'Không có giá trị nào khớp.' : 'Không có giá trị nào.'}
          </Text>
        ) : (
          <>
            <Checkbox
              size="xs"
              className="col-filter-all"
              label={searching ? '(Chọn tất cả kết quả tìm)' : '(Chọn tất cả)'}
              checked={allChecked}
              indeterminate={!allChecked && someChecked}
              onChange={toggleAll}
            />
            {values.map((v) => (
              <ValueOption key={keyOf(v)} value={v} text={v === null ? BLANK : label(v)} checked={isChecked(v)} onToggle={toggle} />
            ))}
          </>
        )}
      </div>
      {q.data?.truncated && (
        <Text size="xs" c="dimmed">
          Chỉ hiện {fmtNum(values.length)} giá trị đầu. Gõ vào ô tìm để thu hẹp.
        </Text>
      )}
      <Group justify="space-between" gap={6} wrap="nowrap">
        {current ? (
          <Button size="xs" variant="subtle" color="gray" px={6} leftSection={<IconFilterOff size={14} />} onClick={() => onApply(null)}>
            Xóa lọc
          </Button>
        ) : (
          <span />
        )}
        <Group gap={6} wrap="nowrap">
          <Button size="xs" variant="default" onClick={onCancel}>
            Hủy
          </Button>
          <ActionButton size="xs" blockedReason={blocked} onClick={apply}>
            Áp dụng
          </ActionButton>
        </Group>
      </Group>
    </Stack>
  );
}

interface ButtonProps {
  title: string;
  field: string;
  current?: ColumnFilter;
  others: ColumnFilters;
  load: LoadValues;
  label: (v: Exclude<FilterValue, null>) => string;
  onChange: (f: ColumnFilter | null) => void;
}

/** Dòng nhắc các cột đang lọc theo giá trị ở dải lọc: tiêu đề cột có thể đã cuộn khuất. */
export function ColumnFilterNote({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <Text size="sm" c="dimmed" className="filter-note">
      Lọc theo cột: <b>{names.join(', ')}</b>
    </Text>
  );
}

/** Nút mũi tên trên tiêu đề cột; cột đang lọc thì thành phễu tô màu. Bấm mở popup chọn giá trị để lọc. */
function ColumnFilterButtonView({ title, field, current, others, load, label, onChange }: ButtonProps) {
  const [open, setOpen] = useState(false);
  const n = current?.values.length ?? 0;
  const name = !current
    ? `Lọc theo cột ${title}`
    : current.mode === 'in'
      ? `Đang lọc cột ${title}: giữ ${fmtNum(n)} giá trị`
      : `Đang lọc cột ${title}: bỏ ${fmtNum(n)} giá trị`;
  return (
    <Popover opened={open} onChange={setOpen} position="bottom-start" width={288} shadow="md" trapFocus returnFocus withinPortal>
      <Popover.Target>
        <Tooltip label={name} openDelay={300} disabled={open}>
          <button
            type="button"
            className="grid-filter-btn focus-ring"
            aria-label={name}
            aria-haspopup="dialog"
            aria-expanded={open}
            data-active={current ? true : undefined}
            onClick={() => setOpen((o) => !o)}
          >
            {current ? <IconFilterFilled size={12} /> : <IconChevronDown size={14} stroke={2.2} />}
          </button>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p={10} aria-label={`Lọc cột ${title}`}>
        {open && (
          <ColumnFilterPanel
            title={title}
            field={field}
            current={current}
            others={others}
            load={load}
            label={label}
            onApply={(f) => {
              setOpen(false);
              onChange(f);
            }}
            onCancel={() => setOpen(false)}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
}

const sameFilters = (a: ColumnFilters, b: ColumnFilters) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};

/**
 * Memo: tiêu đề lưới vẽ lại mỗi lần trang render (chọn dòng, mở popup), mỗi cột lọc được có một nút (Popover, Tooltip).
 * Nút chỉ vẽ lại khi tên cột, bộ lọc, hàm lấy giá trị hoặc cách hiện giá trị đổi; `others` so theo từng bộ lọc vì trang dựng
 * object mới mỗi lần. Hàm truyền vào phải ổn định (DataGrid giữ sẵn theo cột).
 */
export const ColumnFilterButton = memo(
  ColumnFilterButtonView,
  (a, b) => a.title === b.title && a.field === b.field && a.current === b.current && a.load === b.load && a.label === b.label && a.onChange === b.onChange && sameFilters(a.others, b.others),
);
