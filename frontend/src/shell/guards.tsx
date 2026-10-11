import { Center, Loader } from '@mantine/core';
import { Navigate, Outlet } from 'react-router-dom';
import { useSession } from '../store/session';

function Splash() {
  return (
    <Center h="100dvh">
      <Loader color="brand" role="status" aria-label="Đang tải" />
    </Center>
  );
}

/** Vùng cần đăng nhập và đã chọn nhà máy. */
export function RequireReady() {
  const status = useSession((s) => s.status);
  if (status === 'booting') return <Splash />;
  // Token tạm (chưa chọn nhà máy): bước chọn nhà máy nằm ở màn đăng nhập
  if (status === 'anonymous' || status === 'preauth') return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Trang đăng nhập (gồm bước chọn nhà máy): đã chọn nhà máy thì vào thẳng ứng dụng. */
export function AnonymousOnly() {
  const status = useSession((s) => s.status);
  if (status === 'booting') return <Splash />;
  if (status === 'ready') return <Navigate to="/" replace />;
  return <Outlet />;
}
