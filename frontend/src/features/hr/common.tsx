import { Alert, Anchor, Badge, Button, Group, Select, Text, type ComboboxItem, type OptionsFilter, type SelectProps } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { ApiError } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { deptChoices, fold, type FlatDept } from './tree';

/** Lỗi tải kèm nút Thử lại: vùng trống mà không có lời nào thì người dùng tưởng chưa có dữ liệu */
export function LoadError({ error, what, onRetry, retrying }: { error: unknown; what: string; onRetry: () => void; retrying?: boolean }) {
  const text = error instanceof ApiError ? error.message : `Không tải được ${what}. Kiểm tra kết nối rồi thử lại.`;
  return (
    <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} py={8}>
      <Group justify="space-between" gap="sm" wrap="wrap">
        <Text size="sm">{text}</Text>
        <Button size="xs" variant="default" loading={retrying} onClick={onRetry}>
          Thử lại
        </Button>
      </Group>
    </Alert>
  );
}

// ---------- Kích thước khung kéo được (độ rộng cột trái, chiều cao khối cây), nhớ trên trình duyệt này ----------

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));

/** Kích thước lưu ở localStorage (bọc try: chế độ riêng tư, chặn lưu trữ thì vẫn chạy với giá trị mặc định) */
export function useStoredSize(key: string, initial: number, min: number, max: number) {
  const [size, setSize] = useState(() => {
    try {
      const v = Number(localStorage.getItem(key));
      return Number.isFinite(v) && v >= min && v <= max ? v : initial;
    } catch {
      return initial;
    }
  });
  const save = useCallback(
    (v: number) => {
      const next = clamp(v, min, max);
      setSize(next);
      try {
        localStorage.setItem(key, String(next));
      } catch {
        // Không lưu được thì chỉ mất ghi nhớ khi tải lại trang
      }
    },
    [key, min, max],
  );
  return [size, save] as const;
}

interface SplitterProps {
  /** Khung chứa biến CSS kích thước: lúc kéo chỉ đổi biến này, thả tay mới lưu (không vẽ lại cả màn mỗi lần chuột di) */
  target: RefObject<HTMLElement | null>;
  cssVar: string;
  /** vertical: thanh dọc đổi độ rộng cột; horizontal: thanh ngang đổi chiều cao khối trên */
  orientation: 'vertical' | 'horizontal';
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  label: string;
}

/** Thanh kéo đổi kích thước: chuột, chạm, hoặc Tab tới rồi dùng phím mũi tên (Home, End: nhỏ nhất, lớn nhất) */
export function Splitter({ target, cssVar, orientation, value, min, max, onCommit, label }: SplitterProps) {
  const drag = useRef<{ start: number; base: number; current: number } | null>(null);
  const pos = (e: PointerEvent) => (orientation === 'vertical' ? e.clientX : e.clientY);
  const end = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    delete document.body.dataset.resizing;
    onCommit(d.current);
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const less = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp';
    const more = orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown';
    const step = e.shiftKey ? 64 : 16;
    const next = e.key === less ? value - step : e.key === more ? value + step : e.key === 'Home' ? min : e.key === 'End' ? max : null;
    if (next === null) return;
    e.preventDefault();
    onCommit(clamp(next, min, max));
  };
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      title={label}
      className="hr-splitter focus-ring"
      data-orientation={orientation}
      onKeyDown={key}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { start: pos(e), base: value, current: value };
        document.body.dataset.resizing = orientation;
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.current = clamp(d.base + pos(e) - d.start, min, max);
        target.current?.style.setProperty(cssVar, `${d.current}px`);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    />
  );
}

// ---------- Ô chọn phòng ban ----------

type DeptSelectProps = Omit<SelectProps, 'data' | 'value' | 'onChange' | 'filter' | 'renderOption' | 'searchable'> & {
  departments: FlatDept[];
  value: number | null;
  onChange: (id: number | null) => void;
  /** Phòng ban không được chọn; cả nhánh của nó cũng bị bỏ */
  skip?: (d: FlatDept) => boolean;
};

/**
 * Ô chọn phòng ban dạng cây: lựa chọn theo thứ tự cây, thụt lề theo cấp; phòng ban có con cũng chọn được (khác ô chọn chuyền,
 * nơi nhóm chỉ để gom). Gõ không dấu để tìm theo tên, mã hoặc tên phòng ban cha; kết quả kèm đường dẫn cha để phân biệt hai
 * phòng ban cùng tên. Chỉ phòng ban đang dùng, trừ giá trị đang có.
 */
export function DepartmentSelect({ departments, value, onChange, skip, ...rest }: DeptSelectProps) {
  const choices = useMemo(() => deptChoices(departments, { skip, keep: value }), [departments, skip, value]);
  const [search, setSearch] = useState('');
  const { data, byValue } = useMemo(() => {
    // Tên trùng nhau (Bộ phận may của hai nhà máy): kèm mã để ô hiện đúng phòng ban đã chọn
    const count = new Map<string, number>();
    for (const c of choices) count.set(c.label, (count.get(c.label) ?? 0) + 1);
    const list: ComboboxItem[] = choices.map((c) => ({ value: c.value, label: (count.get(c.label) ?? 0) > 1 ? `${c.label} (${c.code})` : c.label }));
    return { data: list, byValue: new Map(choices.map((c) => [c.value, c])) };
  }, [choices]);
  const filter = useCallback<OptionsFilter>(
    ({ options, search: text }) => {
      const q = fold(text);
      return q ? options.filter((o) => 'value' in o && !!byValue.get(o.value)?.search.includes(q)) : options;
    },
    [byValue],
  );
  // Mở ô đang có giá trị thì Mantine đặt chữ tìm bằng nhãn của giá trị đó và không lọc: như vậy chưa phải đang tìm
  const selectedLabel = value == null ? undefined : data.find((o) => o.value === String(value))?.label;
  const searching = !!fold(search) && search !== selectedLabel;
  return (
    <Select
      {...rest}
      searchable
      data={data}
      value={value == null ? null : String(value)}
      onChange={(v) => onChange(v ? Number(v) : null)}
      onSearchChange={setSearch}
      filter={filter}
      maxDropdownHeight={320}
      comboboxProps={{ ...rest.comboboxProps, classNames: { dropdown: 'hr-dept-pick' } }}
      renderOption={({ option, checked }) => {
        const c = byValue.get(option.value);
        if (!c) return option.label;
        return (
          <span className="hr-dept-option" style={{ paddingLeft: searching ? 0 : c.depth * 16 }} data-checked={checked || undefined}>
            <span className="hr-dept-option-name">{c.label}</span>
            <span className="mono hr-dept-option-code">{c.code}</span>
            {searching && c.trail && <span className="hr-dept-option-trail">{c.trail}</span>}
          </span>
        );
      }}
    />
  );
}

// ---------- Khối thông tin chỉ xem ----------

/** Một mục thông tin: nhãn trên, giá trị dưới; trống thì "–" */
export function Fact({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  const empty = children == null || children === '' || children === false;
  return (
    <div className="hr-fact" data-wide={wide || undefined}>
      <dt>{label}</dt>
      <dd>{empty ? <span className="cell-empty">–</span> : children}</dd>
    </div>
  );
}

/** Đường dẫn cây từ gốc tới phòng ban đang xem; bấm tên phòng ban cha để chuyển tới */
export function Trail({ items, onPick }: { items: { id: number; name: string }[]; onPick: (id: number) => void }) {
  if (!items.length) return <Text size="sm" c="dimmed">Phòng ban gốc</Text>;
  return (
    <nav aria-label="Đường dẫn trong sơ đồ tổ chức" className="hr-trail">
      {items.map((a, i) => (
        <span key={a.id} className="hr-trail-step">
          {i > 0 && <span aria-hidden className="hr-trail-sep">›</span>}
          <Anchor component="button" type="button" size="sm" onClick={() => onPick(a.id)}>
            {a.name}
          </Anchor>
        </span>
      ))}
    </nav>
  );
}

export function DissolvedBadge({ date }: { date: string | null }) {
  return (
    <Badge size="sm" variant="light" color="gray">
      Đã giải thể{date ? ` ${fmtDate(date)}` : ''}
    </Badge>
  );
}
