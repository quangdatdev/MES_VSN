// Cây phòng ban dựng ở trình duyệt từ danh sách phẳng (máy chủ trả kèm ParentId, Path). Cấu trúc nhỏ (vài trăm phòng ban) nên
// tính lại mỗi lần dữ liệu đổi.

export interface FlatDept {
  id: number;
  code: string;
  name: string;
  parentId: number | null;
  path: string;
  isActive: boolean;
}

export interface DeptTreeNode<T extends FlatDept> {
  item: T;
  children: DeptTreeNode<T>[];
}

/** Bỏ dấu, chữ thường, gộp khoảng trắng: gõ "ke toan" ra "Kế toán", "duc" ra "Đức" */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dựng cây theo thứ tự danh sách (máy chủ đã sắp). Nút có cha không nằm trong danh sách thành gốc (cha đã giải thể bị ẩn). */
export function buildTree<T extends FlatDept>(items: T[]): DeptTreeNode<T>[] {
  const nodes = new Map(items.map((i) => [i.id, { item: i, children: [] as DeptTreeNode<T>[] }]));
  const roots: DeptTreeNode<T>[] = [];
  for (const i of items) {
    const parent = i.parentId == null ? undefined : nodes.get(i.parentId);
    (parent ? parent.children : roots).push(nodes.get(i.id)!);
  }
  return roots;
}

/** Các phòng ban cha từ gốc xuống (không gồm chính nó) */
export function ancestorsOf<T extends FlatDept>(byId: Map<number, T>, id: number): T[] {
  const out: T[] = [];
  const seen = new Set<number>();
  for (let cur = byId.get(id)?.parentId ?? null; cur != null && !seen.has(cur); cur = byId.get(cur)?.parentId ?? null) {
    seen.add(cur);
    const p = byId.get(cur);
    if (!p) break;
    out.unshift(p);
  }
  return out;
}

/** Id của chính nó và mọi phòng ban trong nhánh (theo Path, như máy chủ) */
export function subtreeIds(items: FlatDept[], id: number): Set<number> {
  const root = items.find((i) => i.id === id);
  if (!root) return new Set([id]);
  return new Set(items.filter((i) => i.path.startsWith(root.path)).map((i) => i.id));
}

/**
 * Lọc cây theo chữ tìm (tên hoặc mã, không dấu): giữ nút khớp và đường đi tới nó. Trả cây đã lọc và các nút cần mở để thấy kết
 * quả.
 */
export function filterTree<T extends FlatDept>(roots: DeptTreeNode<T>[], query: string): { roots: DeptTreeNode<T>[]; open: Set<number> } {
  const q = fold(query);
  const open = new Set<number>();
  if (!q) return { roots, open };
  const walk = (list: DeptTreeNode<T>[]): DeptTreeNode<T>[] =>
    list.flatMap((n) => {
      const kids = walk(n.children);
      const hit = fold(n.item.name).includes(q) || n.item.code.toLowerCase().includes(q);
      if (!hit && kids.length === 0) return [];
      if (kids.length) open.add(n.item.id);
      return [{ item: n.item, children: kids }];
    });
  return { roots: walk(roots), open };
}

export interface DeptChoice {
  value: string;
  label: string;
  code: string;
  depth: number;
  /** Đường dẫn cha, hiện khi tìm để phân biệt hai phòng ban cùng tên ("Bộ phận may" của hai nhà máy) */
  trail: string;
  /** Chữ để tìm: tên, mã, tên các phòng ban cha (không dấu) */
  search: string;
}

/**
 * Lựa chọn phòng ban theo thứ tự cây, thụt lề theo cấp. `skip`: phòng ban không được chọn (chính nó và nhánh con khi chọn phòng
 * ban cha, phòng ban cấp cuối...), cả nhánh của nó cũng bị bỏ. Chỉ phòng ban đang dùng, trừ `keep` (giá trị đang có).
 */
export function deptChoices<T extends FlatDept>(items: T[], opts: { skip?: (d: T) => boolean; keep?: number | null } = {}): DeptChoice[] {
  const out: DeptChoice[] = [];
  const walk = (list: DeptTreeNode<T>[], depth: number, names: string[]) => {
    for (const n of list) {
      if (opts.skip?.(n.item)) continue;
      if (n.item.isActive || n.item.id === opts.keep) {
        out.push({
          value: String(n.item.id),
          label: n.item.name,
          code: n.item.code,
          depth,
          trail: names.join(' › '),
          search: fold([n.item.name, n.item.code, ...names].join(' ')),
        });
      }
      walk(n.children, depth + 1, [...names, n.item.name]);
    }
  };
  walk(buildTree(items), 0, []);
  return out;
}
