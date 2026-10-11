import type { ReactNode } from 'react';
import { useCan } from './permissions';

interface Props {
  permission: string;
  fallback?: ReactNode;
  children: ReactNode;
}

/** Ẩn phần giao diện khi thiếu quyền. Không thay thế việc kiểm quyền ở API. */
export function Can({ permission, fallback = null, children }: Props) {
  return useCan(permission) ? <>{children}</> : <>{fallback}</>;
}
