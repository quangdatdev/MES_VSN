import { ActionIcon, Menu, Tree, useTree, type TreeNodeData } from '@mantine/core';
import { IconBuildingFactory2, IconChevronRight, IconDots } from '@tabler/icons-react';
import { memo, useCallback, useMemo, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { buildTree, filterTree, type DeptTreeNode, type FlatDept } from './tree';

export type TreeDept = FlatDept & { activeEmployees?: number; branchCode?: string | null; isFinalLevel?: boolean };

interface Props<T extends TreeDept> {
  items: T[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Các nút đang mở (giữ ở trang: tải lại cây sau khi lưu không bị thu gọn) */
  expanded: Record<string, boolean>;
  onExpandedChange: (next: Record<string, boolean>) => void;
  /** Chữ tìm (không dấu, theo tên hoặc mã): đang tìm thì mở mọi nhánh có kết quả */
  search: string;
  label: string;
  /** Mục của menu ⋯ (chuột phải) trên một nút; không truyền thì không có menu */
  menu?: (item: T) => ReactNode;
  /** Không có kết quả tìm, hoặc cây rỗng */
  empty: ReactNode;
}

const toData = <T extends TreeDept>(nodes: DeptTreeNode<T>[]): TreeNodeData[] => nodes.map((n) => ({ value: String(n.item.id), label: n.item.name, children: toData(n.children) }));

/**
 * Cây phòng ban dùng chung cho Sơ đồ tổ chức (có menu thêm phòng ban con, cùng cấp) và Thông tin nhân sự (lọc nhân viên).
 * Bàn phím: mũi tên lên xuống để đi, phải trái để mở, thu gọn; Enter để chọn; Shift+F10 hoặc phím menu để mở menu của nút.
 * Bấm tên để chọn, bấm mũi tên để mở hay thu gọn (không mở/thu khi chỉ muốn xem một phòng ban).
 */
export function DepartmentTree<T extends TreeDept>({ items, selectedId, onSelect, expanded, onExpandedChange, search, label, menu, empty }: Props<T>) {
  const byId = useMemo(() => new Map(items.map((i) => [String(i.id), i])), [items]);
  const roots = useMemo(() => buildTree(items), [items]);
  const filtered = useMemo(() => filterTree(roots, search), [roots, search]);
  const data = useMemo(() => toData(filtered.roots), [filtered]);
  const searching = !!search.trim();
  // Đang tìm: mở các nhánh có kết quả, không ghi đè các nút người dùng đã mở (xóa chữ tìm là về như cũ)
  const shown = useMemo(() => (searching ? Object.fromEntries([...filtered.open].map((id) => [String(id), true])) : expanded), [searching, filtered, expanded]);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const tree = useTree({
    expandedState: shown,
    onExpandedStateChange: (next) => {
      if (!searching) onExpandedChange(next);
    },
    selectedState: selectedId == null ? [] : [String(selectedId)],
  });

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('[role=treeitem]');
    const value = li?.dataset.value;
    if (!value) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      onSelect(Number(value));
    } else if (menu && (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) {
      e.preventDefault();
      setMenuFor(value);
    }
  };

  const renderNode = useCallback(
    ({ node, expanded: open, hasChildren, elementProps, selected }: { node: TreeNodeData; expanded: boolean; hasChildren: boolean; elementProps: Record<string, unknown> & { className: string; onClick: (e: MouseEvent) => void }; selected: boolean }) => {
      const item = byId.get(node.value);
      if (!item) return null;
      return (
        <DeptRow
          item={item}
          open={open}
          hasChildren={hasChildren}
          selected={selected}
          elementClass={elementProps.className}
          style={elementProps.style as CSSProperties}
          onToggle={() => tree.toggleExpanded(node.value)}
          onPick={() => onSelect(item.id)}
          menu={menu}
          menuOpen={menuFor === node.value}
          onMenu={(o) => setMenuFor(o ? node.value : null)}
        />
      );
    },
    [byId, tree, onSelect, menu, menuFor],
  );

  if (data.length === 0) return <div className="hr-tree-empty">{empty}</div>;
  return (
    <Tree
      className="hr-tree"
      aria-label={label}
      data={data}
      tree={tree}
      levelOffset={18}
      expandOnClick={false}
      selectOnClick={false}
      allowRangeSelection={false}
      onKeyDown={onKeyDown}
      renderNode={renderNode as never}
    />
  );
}

interface RowProps<T extends TreeDept> {
  item: T;
  open: boolean;
  hasChildren: boolean;
  selected: boolean;
  elementClass: string;
  style: CSSProperties;
  onToggle: () => void;
  onPick: () => void;
  menu?: (item: T) => ReactNode;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
}

/** Một dòng của cây: mũi tên mở/thu, tên, nhà máy (nếu gắn), số người đang làm, nút ⋯ */
const DeptRow = memo(function DeptRow<T extends TreeDept>({ item, open, hasChildren, selected, elementClass, style, onToggle, onPick, menu, menuOpen, onMenu }: RowProps<T>) {
  const count = item.activeEmployees;
  return (
    <div
      className={`${elementClass} hr-tree-row`}
      style={style}
      data-selected={selected || undefined}
      data-inactive={!item.isActive || undefined}
      onClick={(e) => {
        e.stopPropagation();
        onPick();
        (e.currentTarget.closest('[role=treeitem]') as HTMLElement | null)?.focus();
      }}
      onContextMenu={
        menu
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onMenu(true);
            }
          : undefined
      }
    >
      <span
        className="hr-tree-toggle"
        data-open={open || undefined}
        aria-hidden
        onClick={(e) => {
          if (!hasChildren) return;
          e.stopPropagation();
          onToggle();
        }}
      >
        {hasChildren && <IconChevronRight size={15} />}
      </span>
      <span className="hr-tree-name" title={`${item.name} (${item.code})`}>
        {item.name}
      </span>
      {!item.isActive && <span className="hr-tree-tag">Đã giải thể</span>}
      {item.branchCode && (
        <span className="hr-tree-factory" title={`Thuộc nhà máy ${item.branchCode}`}>
          <IconBuildingFactory2 size={13} stroke={1.7} aria-hidden />
          {item.branchCode}
        </span>
      )}
      {count != null && count > 0 && (
        <span className="hr-tree-count" title={`${count} nhân viên đang làm (trực tiếp trong phòng ban)`}>
          {count}
        </span>
      )}
      {menu && (
        <Menu opened={menuOpen} onChange={onMenu} position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              className="hr-tree-more"
              // Không là điểm dừng của Tab (cây dài thì Tab qua rất nhiều nút): bàn phím mở menu bằng Shift+F10 trên nút cây
              tabIndex={-1}
              aria-label={`Thao tác với ${item.name}`}
              onClick={(e) => e.stopPropagation()}
            >
              <IconDots size={15} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown onClick={(e) => e.stopPropagation()}>{menu(item)}</Menu.Dropdown>
        </Menu>
      )}
    </div>
  );
}) as <T extends TreeDept>(p: RowProps<T>) => ReactNode;
