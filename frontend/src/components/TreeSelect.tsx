import { Combobox, InputBase, ScrollArea, useCombobox, VisuallyHidden, type InputBaseProps } from '@mantine/core';
import { IconCheck, IconChevronRight } from '@tabler/icons-react';
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { GroupedOption } from '../lib/lines';

// Ô chọn một giá trị, danh sách mở ra là cây nhóm thu gọn được (nhà máy, xưởng › chuyền). Gõ để tìm theo tên, mã hoặc tên
// nhóm, không cần gõ dấu. Dòng nhóm cũng là một dòng của danh sách nên mũi tên lên xuống đi qua được; Enter, mũi tên phải/trái
// để mở, thu gọn nhóm. Lựa chọn không có nhóm thì là danh sách phẳng như Select.

/** Giá trị của dòng nhóm, không trùng giá trị của lựa chọn */
const GROUP = '\u0000group:';
const SEP = '\u0001';
const INDENT = 18;

interface GroupNode {
  key: string;
  label: string;
  count: number;
  children: TreeNode[];
}
type TreeNode = { group: GroupNode; option?: undefined } | { option: GroupedOption; group?: undefined };
type Row =
  | { kind: 'group'; key: string; label: string; depth: number; count: number; open: boolean }
  | { kind: 'option'; option: GroupedOption; depth: number };

/** Bỏ dấu, chữ thường: gõ "xuong" vẫn tìm ra "Xưởng" */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

/**
 * Cụm đã gõ nằm ở đầu một từ của chữ tìm: "01" ra "Chuyền 01" nhưng không ra "A01-L05" (mã nhà máy có trong mọi mã chuyền,
 * xưởng); "x02" ra mã xưởng "A01-X02".
 */
function startsWord(text: string, query: string): boolean {
  for (let i = text.indexOf(query); i >= 0; i = text.indexOf(query, i + 1)) {
    if (i === 0 || !/[a-z0-9]/.test(text[i - 1])) return true;
  }
  return false;
}

const groupKey = (groups: string[], depth: number) => groups.slice(0, depth + 1).join(SEP);

/** Gom theo nhóm, giữ thứ tự xuất hiện của nhóm và lựa chọn */
function buildTree(options: GroupedOption[]): TreeNode[] {
  const root: TreeNode[] = [];
  const byKey = new Map<string, GroupNode>();
  for (const option of options) {
    const groups = option.groups ?? [];
    let level = root;
    for (let i = 0; i < groups.length; i++) {
      const key = groupKey(groups, i);
      let node = byKey.get(key);
      if (!node) {
        node = { key, label: groups[i], count: 0, children: [] };
        byKey.set(key, node);
        level.push({ group: node });
      }
      node.count++;
      level = node.children;
    }
    level.push({ option });
  }
  return root;
}

function flatten(nodes: TreeNode[], open: Set<string>, depth = 0, rows: Row[] = []): Row[] {
  for (const n of nodes) {
    if (n.option) {
      rows.push({ kind: 'option', option: n.option, depth });
      continue;
    }
    const isOpen = open.has(n.group.key);
    rows.push({ kind: 'group', key: n.group.key, label: n.group.label, depth, count: n.group.count, open: isOpen });
    if (isOpen) flatten(n.group.children, open, depth + 1, rows);
  }
  return rows;
}

/** Nhóm mở sẵn: nhóm chứa giá trị đang chọn, và nhóm duy nhất của một cấp (phải bấm mở thêm là thừa) */
function initialOpen(tree: TreeNode[], selected: GroupedOption | undefined): Set<string> {
  const open = new Set<string>();
  let level = tree;
  while (level.length === 1 && level[0].group) {
    open.add(level[0].group.key);
    level = level[0].group.children;
  }
  const groups = selected?.groups ?? [];
  groups.forEach((_, i) => open.add(groupKey(groups, i)));
  return open;
}

/** Đang tìm thì mở mọi nhóm có kết quả (nhóm không có kết quả không hiện nên mở hết là đủ) */
function allGroups(options: GroupedOption[]): Set<string> {
  const open = new Set<string>();
  for (const o of options) (o.groups ?? []).forEach((_, i, groups) => open.add(groupKey(groups, i)));
  return open;
}

type InputProps = Pick<InputBaseProps, 'label' | 'description' | 'error' | 'withAsterisk' | 'size' | 'variant' | 'className' | 'w' | 'disabled'>;
export interface TreeSelectProps extends InputProps {
  options: GroupedOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** Có nút xóa giá trị (ô lọc: xóa là "Tất cả") */
  clearable?: boolean;
  /** Đơn vị đếm cạnh tên nhóm, ví dụ "chuyền" */
  unit?: string;
  /** Gõ tìm mà không có lựa chọn khớp */
  nothingFoundMessage?: string;
  /** Danh sách rỗng khi chưa gõ gì (chưa có lựa chọn nào) */
  emptyMessage?: string;
  maxDropdownHeight?: number;
  autoFocus?: boolean;
  defaultDropdownOpened?: boolean;
  onDropdownClose?: () => void;
  'aria-label'?: string;
}

export function TreeSelect({
  options,
  value,
  onChange,
  placeholder,
  clearable,
  unit,
  nothingFoundMessage = 'Không có lựa chọn khớp.',
  emptyMessage = 'Chưa có lựa chọn nào.',
  maxDropdownHeight = 300,
  autoFocus,
  defaultDropdownOpened,
  onDropdownClose,
  'aria-label': ariaLabel,
  size = 'sm',
  ...input
}: TreeSelectProps) {
  const selected = options.find((o) => o.value === value);
  // Giá trị không có trong danh sách (link cũ, chuyền ngoài phạm vi): hiện mã, không để trống như chưa chọn
  const selectedLabel = selected?.label ?? value ?? '';
  const tree = useMemo(() => buildTree(options), [options]);
  // Khớp cả cụm đã gõ trong từng trường (tên, mã, tên nhóm, từ khóa), không ghép từ của trường này với trường khác:
  // gõ "xưởng 02" ra các chuyền của Xưởng 02, không lẫn "Chuyền 02" của Xưởng 01
  const texts = useMemo(() => options.map((o) => fold([o.label, o.value, ...(o.groups ?? []), o.keywords ?? ''].join('\n'))), [options]);
  const [search, setSearch] = useState(selectedLabel);
  const [open, setOpen] = useState(() => initialOpen(tree, selected));
  // Giá trị đổi từ ngoài (vừa chọn, xóa, dữ liệu tải lại): ô hiện nhãn mới
  const [labelShown, setLabelShown] = useState(selectedLabel);
  if (labelShown !== selectedLabel) {
    setLabelShown(selectedLabel);
    setSearch(selectedLabel);
  }
  // Dòng cần làm nổi sau khi vẽ lại (thư viện tìm dòng trong DOM): 'value' là giá trị đang chọn khi mở danh sách,
  // 'first' là kết quả đầu tiên khi gõ tìm (Enter là chọn), số là dòng nhóm vừa mở/thu gọn
  const pending = useRef<'value' | 'first' | number | null>(defaultDropdownOpened ? 'value' : null);
  // Lượt làm nổi gần nhất: hẹn giờ của lượt cũ không ghi đè dòng người dùng vừa đi tới
  const seq = useRef(0);
  // Người dùng đã đi bằng mũi tên lên xuống: từ đó mũi tên trái phải mới mở/thu gọn nhóm. Dòng tự làm nổi (khi gõ tìm, khi
  // mở) thì mũi tên trái phải vẫn di con trỏ trong ô gõ.
  const navigated = useRef(false);

  const combobox = useCombobox({
    defaultOpened: defaultDropdownOpened,
    onDropdownOpen: () => {
      setOpen(initialOpen(tree, selected));
      pending.current = 'value';
      navigated.current = false;
    },
    onDropdownClose: () => {
      onDropdownClose?.();
      // Esc hay rời ô khi đang gõ dở: ô về nhãn đang chọn, nhóm thu gọn như lúc đầu (danh sách ẩn vẫn được vẽ)
      setSearch(selectedLabel);
      setOpen(initialOpen(tree, selected));
      navigated.current = false;
      setTimeout(() => {
        combobox.resetSelectedOption();
        syncActive();
      }, 0);
    },
  });

  // Thư viện chỉ ghi aria-activedescendant khi chính nó di mũi tên lên xuống. Dòng đổi do gõ tìm, mở/thu gọn nhóm, mũi tên
  // trái phải thì ghi lại theo DOM để trình đọc màn hình đọc đúng dòng đang đứng.
  const syncActive = () => {
    const input = combobox.targetRef.current;
    if (!input) return;
    const list = document.getElementById(input.getAttribute('aria-controls') ?? '');
    const id = list?.querySelector('[data-combobox-selected]')?.id;
    if (id) input.setAttribute('aria-activedescendant', id);
    else input.removeAttribute('aria-activedescendant');
  };

  const terms = search === selectedLabel ? '' : fold(search).trim().replace(/\s+/g, ' ');
  const shown = useMemo(() => {
    if (!terms) return tree;
    return buildTree(options.filter((_, i) => startsWord(texts[i], terms)));
  }, [terms, tree, options, texts]);
  const rows = flatten(shown, open);

  useLayoutEffect(() => {
    const target = pending.current;
    if (target === null) return;
    pending.current = null;
    const index =
      target === 'first' ? rows.findIndex((r) => r.kind === 'option') : target === 'value' ? rows.findIndex((r) => r.kind === 'option' && r.option.value === value) : target;
    const run = () => {
      if (index >= 0) combobox.selectOption(index);
      else combobox.resetSelectedOption();
      syncActive();
    };
    const turn = ++seq.current;
    run();
    // Danh sách vừa mở có thể chưa vào DOM (khung nổi gắn vào body sau một nhịp): làm lại một lần
    window.setTimeout(() => {
      if (seq.current === turn) run();
    }, 0);
  });

  const toggle = (key: string, index: number) => {
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    pending.current = index;
  };

  const changeSearch = (text: string) => {
    const searching = text !== selectedLabel && fold(text).trim() !== '';
    setSearch(text);
    // Mở danh sách trước: lúc mở, danh sách đặt lại các nhóm mở sẵn, đang tìm thì phải mở hết
    combobox.openDropdown();
    setOpen(searching ? allGroups(options) : initialOpen(tree, selected));
    navigated.current = false;
    pending.current = searching ? 'first' : null;
    if (!searching) combobox.resetSelectedOption();
  };

  const submit = (v: string) => {
    if (v.startsWith(GROUP)) {
      const key = v.slice(GROUP.length);
      toggle(key, rows.findIndex((r) => r.kind === 'group' && r.key === key));
      return;
    }
    const option = options.find((o) => o.value === v);
    if (!option) return;
    if (option.value !== value) onChange(option.value);
    setSearch(option.label);
    combobox.closeDropdown();
  };

  // Mũi tên phải: mở nhóm, nhóm đã mở thì xuống dòng đầu của nhóm. Mũi tên trái: thu gọn nhóm, đang ở dòng con thì về dòng nhóm.
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Phím người dùng bấm thắng hẹn giờ làm nổi của lượt trước. Mũi tên lên xuống do thư viện xử lý sau hàm này: đọc dòng
    // đang đứng sau một nhịp
    seq.current++;
    window.setTimeout(syncActive, 0);
    if (!combobox.dropdownOpened) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') navigated.current = true;
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || !navigated.current) return;
    const i = combobox.getSelectedOptionIndex();
    const row = rows[i];
    if (!row) return;
    const right = e.key === 'ArrowRight';
    if (row.kind === 'group' && right !== row.open) {
      e.preventDefault();
      toggle(row.key, i);
    } else if (row.kind === 'group' && right) {
      e.preventDefault();
      combobox.selectOption(i + 1);
    } else if (!right && row.depth > 0) {
      e.preventDefault();
      for (let j = i - 1; j >= 0; j--) {
        const r = rows[j];
        if (r.kind === 'group' && r.depth < row.depth) {
          combobox.selectOption(j);
          break;
        }
      }
    }
  };

  const guides = (depth: number) =>
    Array.from({ length: depth }, (_, k) => <span key={k} className="tree-pick-guide" style={{ left: 14 + k * INDENT }} aria-hidden />);
  const listLabel = ariaLabel ?? (typeof input.label === 'string' ? input.label : undefined);

  return (
    <Combobox store={combobox} onOptionSubmit={submit} size={size} position="bottom-start" classNames={{ dropdown: 'tree-pick' }}>
      <Combobox.Target targetType="input" withExpandedAttribute>
        <InputBase
          {...input}
          size={size}
          value={search}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          onChange={(e) => changeSearch(e.currentTarget.value)}
          onFocus={(e) => {
            combobox.openDropdown();
            // Gõ là thay cả nhãn đang hiện, không phải xóa tay trước khi tìm
            e.currentTarget.select();
          }}
          onClick={(e) => {
            combobox.openDropdown();
            if (search === selectedLabel) e.currentTarget.select();
          }}
          onBlur={() => combobox.closeDropdown()}
          onKeyDown={onKeyDown}
          rightSection={clearable && value ? <Combobox.ClearButton onClear={() => onChange(null)} /> : <Combobox.Chevron />}
          rightSectionPointerEvents={clearable && value ? 'all' : 'none'}
        />
      </Combobox.Target>
      <Combobox.Dropdown hidden={input.disabled}>
        <Combobox.Options aria-label={listLabel}>
          <ScrollArea.Autosize mah={maxDropdownHeight} type="scroll" scrollbarSize={6} offsetScrollbars="y">
            {rows.map((row) =>
              row.kind === 'group' ? (
                <Combobox.Option key={GROUP + row.key} value={GROUP + row.key} className="tree-pick-row" data-group data-open={row.open || undefined} style={{ paddingLeft: 6 + row.depth * INDENT }}>
                  {guides(row.depth)}
                  <IconChevronRight size={16} className="tree-pick-chevron" aria-hidden />
                  <span className="tree-pick-label">{row.label}</span>
                  {/* Khoảng trắng để tên đọc của dòng tách "Xưởng 01" với "2 chuyền" (khung flex không vẽ khoảng trắng này) */}
                  {' '}
                  <span className="tree-pick-count">
                    {row.count}
                    {unit ? ` ${unit}` : ''}
                  </span>
                  <VisuallyHidden>{row.open ? ', đang mở' : ', đang thu gọn'}</VisuallyHidden>
                </Combobox.Option>
              ) : (
                <Combobox.Option
                  key={row.option.value}
                  value={row.option.value}
                  className="tree-pick-row"
                  active={row.option.value === value}
                  aria-selected={row.option.value === value}
                  data-checked={row.option.value === value || undefined}
                  style={{ paddingLeft: 8 + row.depth * INDENT }}
                >
                  {guides(row.depth)}
                  <span className="tree-pick-label">{row.option.label}</span>
                  {row.option.value === value && <IconCheck size={14} className="tree-pick-check" aria-hidden />}
                </Combobox.Option>
              ),
            )}
            {rows.length === 0 && <Combobox.Empty>{terms ? nothingFoundMessage : emptyMessage}</Combobox.Empty>}
          </ScrollArea.Autosize>
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
