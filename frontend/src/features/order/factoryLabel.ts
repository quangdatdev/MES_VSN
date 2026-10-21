/**
 * Nhà máy SX của đơn hàng: một hoặc nhiều mã nhà máy cách nhau dấu phẩy, theo OSM ("VIET DUC,VSN-DN"; quyết định 7.6). Hiện
 * bằng tên trong danh mục Nhà máy SX, cách nhau dấu phẩy và khoảng trắng; mã không có trong danh mục thì hiện nguyên mã.
 */
export function factoryLabel(list: string, names: Map<string, string>): string {
  return list
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => names.get(c) ?? c)
    .join(', ');
}
