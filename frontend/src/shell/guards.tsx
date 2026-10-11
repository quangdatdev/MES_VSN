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
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  if (status === 'preauth') return <Navigate to="/select-branch" replace />;
  return <Outlet />;
}

/** Trang đăng nhập: đã đăng nhập thì vào thẳng ứng dụng. */
export function AnonymousOnly() {
  const status = useSession((s) => s.status);
  if (status === 'booting') return <Splash />;
  if (status === 'ready') return <Navigate to="/" replace />;
  if (status === 'preauth') return <Navigate to="/select-branch" replace />;
  return <Outlet />;
}

/** Chọn nhà máy: dùng được khi vừa đăng nhập (token tạm) hoặc khi đang đổi nhà máy. */
export function BranchAccess() {
  const status = useSession((s) => s.status);
  if (status === 'booting') return <Splash />;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return <Outlet />;
}
