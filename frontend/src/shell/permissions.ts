import { useSession } from '../store/session';
import type { MenuNode } from '../lib/types';

/** Chỉ để ẩn/hiện giao diện. Backend mới là nơi cưỡng chế quyền. */
export function useCan(permission: string): boolean {
  return useSession((s) => s.permissions.has(permission));
}

/** Mã tài nguyên từ mã menu lá: menu.order.po -> order.po */
export const resourceOf = (menuCode: string) => menuCode.replace(/^menu\./, '');

export interface Leaf extends MenuNode {
  group: MenuNode;
}

export function flattenLeaves(menu: MenuNode[]): Leaf[] {
  return menu.flatMap((g) => g.children.filter((c) => c.path).map((c) => ({ ...c, group: g })));
}

export const MODULE_PREFIXES = ['/order', '/cutting', '/sewing', '/finishing', '/qms', '/hr', '/report', '/admin'];
