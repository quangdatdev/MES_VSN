import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { qs } from '../../lib/format';
import type { Paged } from '../../lib/types';
import { useCan } from '../../shell/permissions';
import type { Department, DepartmentOptions, EmployeeCard, EmployeeDetail, EmployeeOptions, LineHolders, ManagerOption } from './types';

// Dữ liệu nhân sự dùng chung toàn công ty (ADR 0012): khóa truy vấn không kèm nhà máy của phiên.
export const HR_KEYS = {
  tree: (all: boolean) => ['hr', 'departments', 'tree', all] as const,
  departments: ['hr', 'departments'] as const,
  department: (id: number) => ['hr', 'departments', 'detail', id] as const,
  deptOptions: ['hr', 'departments', 'options'] as const,
  managers: (q: string, selected: number | null) => ['hr', 'departments', 'managers', q, selected] as const,
  employeeOptions: ['hr', 'employees', 'options'] as const,
  employees: ['hr', 'employees', 'list'] as const,
  employeeList: (f: EmployeeQuery) => ['hr', 'employees', 'list', f] as const,
  employee: (id: number) => ['hr', 'employees', 'detail', id] as const,
};

export function useDepartmentTree(includeDissolved: boolean) {
  return useQuery({
    queryKey: HR_KEYS.tree(includeDissolved),
    queryFn: () => api<{ items: Department[] }>(`/hr/departments/tree${includeDissolved ? '?includeDissolved=1' : ''}`),
    placeholderData: keepPreviousData,
  });
}

export function useDepartment(id: number | null) {
  return useQuery({
    queryKey: HR_KEYS.department(id ?? 0),
    queryFn: () => api<Department>(`/hr/departments/${id}`),
    enabled: id != null,
  });
}

/** Ai đang được giao phạm vi chuyền theo mã này: hỏi ngay trước khi thêm, tích, khôi phục bộ phận chuyền may (không cache) */
export const fetchLineHolders = (code: string) => api<LineHolders>(`/hr/departments/line-holders${qs({ code })}`);

export function useDepartmentOptions() {
  return useQuery({ queryKey: HR_KEYS.deptOptions, queryFn: () => api<DepartmentOptions>('/hr/departments/options'), staleTime: 60_000 });
}

/** Ô Người quản lý: tìm trên máy chủ (20 người đang làm); người đang chọn luôn có trong danh sách */
export function useManagerOptions(q: string, selected: number | null, enabled: boolean) {
  const can = useCan('hr.employee:view');
  return useQuery({
    queryKey: HR_KEYS.managers(q.trim(), selected),
    queryFn: () => api<ManagerOption[]>(`/hr/departments/manager-options${qs({ q: q.trim(), selected })}`),
    enabled: enabled && can,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useEmployeeOptions() {
  return useQuery({ queryKey: HR_KEYS.employeeOptions, queryFn: () => api<EmployeeOptions>('/hr/employees/options'), staleTime: 60_000 });
}

export interface EmployeeQuery {
  departmentId: number | null;
  q: string;
  jobTitleId: number | null;
  status: number | null;
  page: number;
}

export const EMPLOYEE_PAGE_SIZE = 20;

export const employeeParams = (f: Omit<EmployeeQuery, 'page'>) => ({ departmentId: f.departmentId, q: f.q.trim(), jobTitleId: f.jobTitleId, status: f.status });

export function useEmployees(f: EmployeeQuery, enabled = true) {
  return useQuery({
    queryKey: HR_KEYS.employeeList(f),
    queryFn: () => api<Paged<EmployeeCard>>(`/hr/employees${qs({ ...employeeParams(f), page: f.page, pageSize: EMPLOYEE_PAGE_SIZE })}`),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useEmployee(id: number | null) {
  return useQuery({ queryKey: HR_KEYS.employee(id ?? 0), queryFn: () => api<EmployeeDetail>(`/hr/employees/${id}`), enabled: id != null });
}
