import { lazy, type ComponentType } from 'react';

type PageModule = Promise<{ default: ComponentType }>;

/** Code của từng màn, tải khi cần (dynamic import) */
const loaders: Record<string, () => PageModule> = {
  '/order/info': () => import('../features/order/SalesOrderPage'),
  '/order/po-allocation': () => import('../features/order/PoAllocationPage'),
  '/order/shipment': () => import('../features/order/ShipmentPage'),
  '/order/cut-ratio': () => import('../features/order/CutRatioPage'),
  '/order/line-plan': () => import('../features/order/LinePlanPage'),
  '/order/color-size': () => import('../features/order/ColorSizePage'),
  // Màn của nhóm Quản trị đơn hàng, code và dữ liệu thuộc module May (ADR 0009)
  '/order/prep': () => import('../features/sewing/PrepPlanPage'),
  // Quản trị nhân sự (ADR 0012)
  '/hr/org-chart': () => import('../features/hr/OrgChartPage'),
  '/hr/employees': () => import('../features/hr/EmployeesPage'),
  '/admin/users': () => import('../features/admin/UsersPage'),
  '/admin/roles': () => import('../features/admin/RolesPage'),
  '/admin/permissions': () => import('../features/admin/PermissionsPage'),
  '/admin/field-policies': () => import('../features/admin/FieldPoliciesPage'),
  '/admin/branches': () => import('../features/admin/BranchesPage'),
  '/admin/audit': () => import('../features/admin/AuditPage'),
  '/admin/sync': () => import('../features/admin/SyncPage'),
  '/admin/catalogs': () => import('../features/admin/CatalogsPage'),
};

/**
 * Đăng ký màn hình thật theo đường dẫn menu. Đường dẫn nào chưa đăng ký sẽ hiện trang giữ chỗ (ModulePage).
 * Mỗi màn nạp lười (React.lazy) để không làm nặng lần tải đầu.
 */
export const pages: Record<string, ComponentType> = Object.fromEntries(Object.entries(loaders).map(([path, load]) => [path, lazy(load)]));

/**
 * Tải trước code của một màn mà chưa vẽ: lúc mở trang (song song với khôi phục phiên, nạp quyền) và khi rê chuột hoặc Tab
 * tới liên kết của màn. Bấm vào thì màn hiện ngay, không chờ tải code sau khi đã có quyền. Lỗi tải để React.lazy báo khi
 * màn thật sự được mở.
 */
export function preloadPage(path: string | null | undefined) {
  const load = path ? loaders[path] : undefined;
  if (load) void load().catch(() => undefined);
}
