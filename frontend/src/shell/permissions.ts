// `lib`, `components` import file này (useCan, useCanWrite): chỉ được phụ thuộc `store/session` và kiểu ở `lib/types`, không thì sinh vòng import
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

/** Thao tác ghi chỉ có ở ĐVCS cụ thể (A00 chỉ đọc); vẫn để backend cưỡng chế. */
export function useCanWrite(permission: string) {
  const can = useCan(permission);
  const aggregate = useSession((s) => !!s.branch?.isAggregate);
  return can && !aggregate;
}
