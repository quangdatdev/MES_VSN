import { Center, Loader } from '@mantine/core';
import { Suspense, useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ForbiddenPage, NotFoundPage } from '../features/errors/ErrorPages';
import { ModulePage } from '../features/module/ModulePage';
import { flattenLeaves, MODULE_PREFIXES } from '../shell/permissions';
import { useSession } from '../store/session';
import { pages } from './registry';

/**
 * Điểm vào cho mọi đường dẫn module. Menu trả về từ server đã lọc theo quyền xem, nên:
 * đường dẫn có trong menu => cho vào; thuộc một module nhưng không có trong menu => 403; còn lại => 404.
 */
/** Đường dẫn cũ của màn đã đổi chỗ (link gửi trước đây vẫn mở được) */
const MOVED: Record<string, string> = { '/sewing/prep': '/order/prep' };

export function FallbackRoute() {
  const { pathname, search } = useLocation();
  const menu = useSession((s) => s.menu);
  const leaf = useMemo(() => flattenLeaves(menu).find((l) => l.path === pathname), [menu, pathname]);

  if (MOVED[pathname]) return <Navigate to={`${MOVED[pathname]}${search}`} replace />;
  if (leaf) {
    const Page = pages[pathname];
    if (Page) {
      return (
        <Suspense fallback={<Center py="xl"><Loader color="brand" role="status" aria-label="Đang tải màn hình" /></Center>}>
          <Page />
        </Suspense>
      );
    }
    return <ModulePage leaf={leaf} />;
  }
  if (MODULE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return <ForbiddenPage />;
  return <NotFoundPage />;
}
