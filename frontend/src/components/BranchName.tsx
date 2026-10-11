import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../lib/api';
import type { Column } from './DataGrid';

interface BranchNameInfo {
  code: string;
  name: string;
}

/**
 * Tên chi nhánh theo mã nhà máy: TenChiNhanh của danh mục chi nhánh BRAVO (chưa có thì tên ở Quản trị › Nhà máy).
 * Cột, ô Chi nhánh hiện tên thay mã A01; chưa tải xong hoặc mã lạ thì hiện mã.
 */
export function useBranchName(): (code: string | null | undefined) => string {
  const q = useQuery({ queryKey: ['me', 'branch-names'], queryFn: () => api<BranchNameInfo[]>('/me/branch-names'), staleTime: 5 * 60_000 });
  const data = q.data;
  return useCallback((code) => (code ? data?.find((b) => b.code === code)?.name || code : ''), [data]);
}

/** Tên chi nhánh, rê chuột thấy mã (để đối chiếu với mã nhà máy trên thanh trên) */
function BranchLabel({ code, name }: { code: string | null | undefined; name: string }) {
  return name && name !== code ? <span title={code ?? undefined}>{name}</span> : <>{name}</>;
}

/** Ô Chi nhánh đứng riêng. Trong lưới dùng `withBranchNames`: một truy vấn cho cả trang, không phải mỗi ô một truy vấn. */
export function BranchName({ code }: { code: string | null | undefined }) {
  const name = useBranchName()(code);
  return <BranchLabel code={code} name={name} />;
}

/** Cột Chi nhánh (`branchCode`) của lưới hiện tên theo `branchName` của trang, kể cả chữ trong popup lọc theo cột */
export function withBranchNames<T extends object>(columns: Column<T>[], branchName: (code: string | null | undefined) => string): Column<T>[] {
  return columns.map((c) =>
    c.key === 'branchCode'
      ? {
          ...c,
          filterLabel: (v) => branchName(String(v)),
          render: (r) => {
            const code = (r as { branchCode?: string | null }).branchCode;
            return <BranchLabel code={code} name={branchName(code)} />;
          },
        }
      : c,
  );
}
