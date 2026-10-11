import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { templateCsv } from '../features/hr/EmployeeImportModal';
import { allowedTitles } from '../features/hr/EmployeePanel';
import EmployeesPage from '../features/hr/EmployeesPage';
import OrgChartPage from '../features/hr/OrgChartPage';
import { buildTree, deptChoices, filterTree, subtreeIds } from '../features/hr/tree';
import type { Department, EmployeeCard, EmployeeDetail, EmployeeField, EmployeeOptions } from '../features/hr/types';
import { api } from '../lib/api';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

// Phase 5.8 – Sơ đồ tổ chức, Thông tin nhân sự (ADR 0012)

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

// Bố cục điện thoại bật theo từng bài
const view = vi.hoisted(() => ({ mobile: false }));
vi.mock('../lib/useMobile', () => ({ useMobile: () => view.mobile }));

const dept = (id: number, code: string, name: string, parentId: number | null, path: string, typeId: number, extra: Partial<Department> = {}): Department => ({
  id,
  code,
  name,
  nameEn: null,
  departmentTypeId: typeId,
  typeCode: `T${typeId}`,
  typeName: ['', 'Công ty', 'Khối', 'Phòng', 'Nhà máy', 'Bộ phận'][typeId],
  levelOrder: typeId,
  isFinalLevel: typeId === 5,
  parentId,
  path,
  managerEmployeeId: null,
  managerCode: null,
  managerName: null,
  branchCode: null,
  establishedDate: null,
  dissolvedDate: null,
  sortOrder: id * 10,
  isActive: true,
  activeEmployees: 0,
  createdAt: '2026-10-11T00:00:00Z',
  modifiedAt: null,
  ...extra,
});

const DEPTS: Department[] = [
  dept(1, 'VSN', 'Công ty Vietsun', null, '/VSN/', 1),
  dept(2, 'VP', 'Khối văn phòng', 1, '/VSN/VP/', 2),
  dept(3, 'KT', 'Phòng Kế toán', 2, '/VSN/VP/KT/', 3, { activeEmployees: 4 }),
  dept(4, 'NM1', 'Nhà máy 1', 1, '/VSN/NM1/', 4, { branchCode: 'A01' }),
  dept(5, 'NM1-MAY', 'Bộ phận may', 4, '/VSN/NM1/NM1-MAY/', 5),
];
const TYPES = [1, 2, 3, 4, 5].map((id) => ({ id, code: `T${id}`, name: ['', 'Công ty', 'Khối', 'Phòng', 'Nhà máy', 'Bộ phận'][id], levelOrder: id, isFinalLevel: id === 5, isActive: true }));

const field = (key: string, label: string, type: EmployeeField['type'], required = false): EmployeeField => ({ key, label, group: 'general', type, required, max: type === 'text' ? 255 : null });
const FIELDS: EmployeeField[] = [
  field('code', 'Mã nhân viên', 'code', true),
  field('fullName', 'Tên nhân viên', 'text', true),
  field('gender', 'Giới tính', 'gender', true),
  field('departmentId', 'Phòng ban', 'department', true),
  field('jobTitleId', 'Chức danh', 'jobTitle', true),
  field('employmentStatus', 'Tình trạng', 'status', true),
  field('endDate', 'Ngày nghỉ việc', 'date'),
];
const OPTIONS: EmployeeOptions = {
  departments: DEPTS.map(({ id, code, name, parentId, path, isActive }) => ({ id, code, name, parentId, path, isActive })),
  jobTitles: [
    { id: 1, code: 'NV', name: 'Nhân viên', departmentId: null, isActive: true },
    { id: 2, code: 'KTV', name: 'Kế toán viên', departmentId: 3, isActive: true },
    { id: 3, code: 'CNM', name: 'Công nhân may', departmentId: 4, isActive: true },
  ],
  genders: [
    { value: 1, label: 'Nam' },
    { value: 2, label: 'Nữ' },
    { value: 3, label: 'Khác' },
  ],
  statuses: [
    { value: 1, label: 'Đang làm việc' },
    { value: 2, label: 'Nghỉ việc' },
  ],
  fields: FIELDS,
  groups: { general: 'Thông tin chung', timekeeping: 'Chấm công', personal: 'Thông tin cá nhân', contact: 'Giấy tờ và liên hệ' },
};
const card = (id: number, name: string, deptId: number, titleId: number): EmployeeCard => ({
  id,
  code: `NV${id}`,
  timekeepingCode: `NV${id}`,
  fullName: name,
  gender: 2,
  departmentId: deptId,
  departmentName: DEPTS.find((d) => d.id === deptId)!.name,
  jobTitleId: titleId,
  jobTitleName: OPTIONS.jobTitles.find((t) => t.id === titleId)!.name,
  employmentStatus: 1,
  startDate: null,
  createdAt: '2026-10-11T00:00:00Z',
});
const detailOf = (c: EmployeeCard): EmployeeDetail =>
  ({
    id: c.id,
    code: c.code,
    fullName: c.fullName,
    gender: c.gender,
    departmentId: c.departmentId,
    jobTitleId: c.jobTitleId,
    employmentStatus: 1,
    endDate: null,
    departmentCode: DEPTS.find((d) => d.id === c.departmentId)!.code,
    departmentName: c.departmentName,
    jobTitleName: c.jobTitleName,
    createdAt: c.createdAt,
    modifiedAt: null,
  }) as EmployeeDetail;

function signIn(permissions: string[]) {
  useSession.getState().reset('anonymous');
  useSession.getState().set({
    status: 'ready',
    user: { id: 5, username: 'nhansu', fullName: 'Nhân sự' },
    branch: { code: 'A00', name: 'Toàn công ty', isAggregate: true },
    roles: [],
    permissions: new Set(permissions),
    fieldPolicies: {},
  });
}

/** Ô nhập theo nhãn (Select của Mantine cũng là input, nhưng vai trò khác TextInput) */
const inputOf = (label: RegExp) => screen.getByLabelText(label, { selector: 'input' }) as HTMLInputElement;
/** Nút cây theo Id: tên đọc của nút gồm cả chữ của các nút con nên không tìm theo tên được */
const node = (id: number) => document.querySelector<HTMLElement>(`li[role="treeitem"][data-value="${id}"]`);

/** Đóng hộp hỏi bằng Tiếp tục sửa: số hộp đang mở đếm chung cả module, hộp còn mở thì hộp hỏi ở bài sau bị bỏ qua */
async function keepEditing() {
  fireEvent.click(await screen.findByRole('button', { name: 'Tiếp tục sửa' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Tiếp tục sửa' })).not.toBeInTheDocument());
}

function Url() {
  const l = useLocation();
  return <output data-testid="url">{l.search}</output>;
}

function renderPage(ui: ReactNode, path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider theme={theme} env="test">
      <ModalsProvider>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={[path]}>
            {ui}
            <Url />
          </MemoryRouter>
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>,
  );
}

const HR_ALL = ['hr.orgchart:view', 'hr.orgchart:create', 'hr.orgchart:update', 'hr.employee:view', 'hr.employee:create', 'hr.employee:update', 'hr.employee:export'];

describe('Cây phòng ban, chức danh theo phòng ban (hàm thuần)', () => {
  it('ô phòng ban cha không có chính nó và nhánh con; tìm không dấu giữ đường tới kết quả', () => {
    const own = subtreeIds(DEPTS, 2);
    expect([...own].sort()).toEqual([2, 3]);
    const choices = deptChoices(DEPTS, { skip: (d) => own.has(d.id) });
    expect(choices.map((c) => c.code)).toEqual(['VSN', 'NM1', 'NM1-MAY']);
    expect(choices.find((c) => c.code === 'NM1-MAY')).toMatchObject({ depth: 2, trail: 'Công ty Vietsun › Nhà máy 1' });
    const { roots, open } = filterTree(buildTree(DEPTS), 'ke toan');
    expect(roots[0].item.code).toBe('VSN');
    expect(roots[0].children.map((c) => c.item.code)).toEqual(['VP']);
    expect([...open].sort()).toEqual([1, 2]);
  });

  it('chức danh dùng được: chức danh chung, và chức danh của phòng ban hoặc phòng ban cha', () => {
    expect(allowedTitles(OPTIONS, 3).map((t) => t.code)).toEqual(['NV', 'KTV']);
    expect(allowedTitles(OPTIONS, 5).map((t) => t.code)).toEqual(['NV', 'CNM']);
    expect(allowedTitles(OPTIONS, null)).toEqual([]);
  });

  it('file mẫu: tiêu đề cùng thứ tự cột của lưới, cột bắt buộc có dấu *', () => {
    // Tình trạng bỏ trống là đang làm việc: file mẫu không đánh dấu bắt buộc, như lưới (review 5.8 lượt 2 L6)
    expect(templateCsv([FIELDS[5]])).toBe(`${String.fromCharCode(0xfeff)}Tình trạng\r\n`);
    expect(templateCsv(FIELDS.slice(0, 3))).toBe('﻿Mã nhân viên *,Tên nhân viên *,Giới tính *\r\n');
  });
});

describe('Sơ đồ tổ chức', () => {
  let items: Department[];
  const posts: unknown[] = [];
  beforeEach(() => {
    signIn(HR_ALL);
    view.mobile = false;
    items = [...DEPTS];
    posts.length = 0;
    vi.mocked(api).mockReset();
    vi.mocked(api).mockImplementation((async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (opts?.method === 'POST' && path === '/hr/departments') {
        posts.push(opts.body);
        const b = opts.body as { code: string; name: string; departmentTypeId: number; parentId: number | null };
        const parent = items.find((d) => d.id === b.parentId);
        const created = dept(9, b.code, b.name, b.parentId, `${parent?.path ?? '/'}${b.code}/`, b.departmentTypeId);
        items = [...items, created];
        return created;
      }
      if (path.startsWith('/hr/departments/tree')) return { items };
      if (path === '/hr/departments/options') return { types: TYPES, factories: [{ code: 'A01', name: 'Nhà máy 1' }] };
      if (path.startsWith('/hr/departments/manager-options')) return [];
      throw new Error(`Chưa giả lập ${path}`);
    }) as unknown as typeof api);
  });

  it('mở đúng phòng ban trên URL; thêm cùng cấp điền sẵn cha và loại, thêm con điền sẵn cha, loại trống', async () => {
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=KT');
    expect(await screen.findByRole('heading', { level: 2, name: 'Phòng Kế toán' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Đường dẫn trong sơ đồ tổ chức' })).toHaveTextContent('Công ty Vietsun›Khối văn phòng');
    expect(screen.getByText(/nhân viên đang làm trực tiếp/)).toHaveTextContent('4 nhân viên đang làm');

    fireEvent.click(screen.getByRole('button', { name: 'Thao tác với Phòng Kế toán' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Thêm phòng ban cùng cấp' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Thêm phòng ban' })).toBeInTheDocument();
    expect(screen.getByText('Thuộc Công ty Vietsun › Khối văn phòng')).toBeInTheDocument();
    await waitFor(() => expect(inputOf(/Loại phòng ban/)).toHaveValue('Phòng'));

    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Thao tác với Khối văn phòng' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Thêm phòng ban con' }));
    expect(await screen.findByText('Thuộc Công ty Vietsun › Khối văn phòng')).toBeInTheDocument();
    expect(inputOf(/Loại phòng ban/)).toHaveValue('');
  });

  it('phòng ban cấp cuối không thêm con được; giải thể khóa khi còn nhân viên đang làm', async () => {
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=KT');
    expect(await screen.findByRole('heading', { level: 2, name: 'Phòng Kế toán' })).toBeInTheDocument();
    const dissolve = screen.getByRole('button', { name: 'Giải thể' });
    expect(dissolve).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(node(4)!.querySelector('.hr-tree-toggle')!);
    fireEvent.click(await screen.findByRole('button', { name: 'Thao tác với Bộ phận may' }));
    expect(await screen.findByRole('menuitem', { name: /Thêm phòng ban con/ })).toBeDisabled();
  });

  it('lưu xong: chọn phòng ban vừa thêm, cây giữ các nút đang mở', async () => {
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=KT');
    expect(await screen.findByRole('heading', { level: 2, name: 'Phòng Kế toán' })).toBeInTheDocument();
    // Mở thêm Nhà máy 1 (không nằm trên đường tới phòng ban sẽ thêm)
    fireEvent.click(node(4)!.querySelector('.hr-tree-toggle')!);
    await waitFor(() => expect(node(5)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Thao tác với Phòng Kế toán' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Thêm phòng ban cùng cấp' }));
    await waitFor(() => expect(inputOf(/Mã phòng ban/)).toBeInTheDocument());
    fireEvent.change(inputOf(/Mã phòng ban/), { target: { value: 'kh' } });
    fireEvent.change(inputOf(/Tên phòng ban/), { target: { value: 'Phòng Kế hoạch' } });
    // Nút gửi của form (nút Thêm phòng ban ở đầu trang mở menu, trùng tên)
    fireEvent.click(document.querySelector<HTMLButtonElement>('form button[type="submit"]')!);

    expect(await screen.findByRole('heading', { level: 2, name: 'Phòng Kế hoạch' })).toBeInTheDocument();
    expect(posts[0]).toMatchObject({ code: 'KH', name: 'Phòng Kế hoạch', departmentTypeId: 3, parentId: 2 });
    expect(screen.getByTestId('url')).toHaveTextContent('dept=KH');
    await waitFor(() => expect(node(9)).toHaveAttribute('aria-selected', 'true'));
    // Nút đã mở trước khi lưu vẫn mở
    expect(node(5)).toBeInTheDocument();
  });

  it('thêm phòng ban con dưới phòng ban chưa có con: lưu xong mở nhánh, chọn phòng ban mới (review 5.8 lượt 2 M1)', async () => {
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=KT');
    expect(await screen.findByRole('heading', { level: 2, name: 'Phòng Kế toán' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thao tác với Phòng Kế toán' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Thêm phòng ban con' }));
    await waitFor(() => expect(inputOf(/Mã phòng ban/)).toBeInTheDocument());
    fireEvent.change(inputOf(/Mã phòng ban/), { target: { value: 'KT-TH' } });
    fireEvent.change(inputOf(/Tên phòng ban/), { target: { value: 'Tổ tổng hợp' } });
    fireEvent.click(inputOf(/Loại phòng ban/));
    fireEvent.click(await screen.findByRole('option', { name: /Bộ phận/ }));
    fireEvent.click(document.querySelector<HTMLButtonElement>('form button[type="submit"]')!);

    expect(await screen.findByRole('heading', { level: 2, name: 'Tổ tổng hợp' })).toBeInTheDocument();
    expect(posts[0]).toMatchObject({ code: 'KT-TH', parentId: 3 });
    await waitFor(() => expect(node(9)).toHaveAttribute('aria-selected', 'true'));
  });

  it('điện thoại: đổi tab giữa chừng không mất form đang sửa, vẫn hỏi trước khi bỏ (review 5.8 lượt 2 HIGH)', async () => {
    view.mobile = true;
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=KT');
    expect(await screen.findByRole('heading', { level: 2, name: 'Phòng Kế toán' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    await waitFor(() => expect(inputOf(/Tên phòng ban/)).toHaveValue('Phòng Kế toán'));
    fireEvent.change(inputOf(/Tên phòng ban/), { target: { value: 'Phòng Kế toán tổng hợp' } });

    fireEvent.click(screen.getByRole('radio', { name: 'Cây phòng ban' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Đang sửa' }));
    expect(inputOf(/Tên phòng ban/)).toHaveValue('Phòng Kế toán tổng hợp');

    fireEvent.click(screen.getByRole('radio', { name: 'Cây phòng ban' }));
    fireEvent.click(node(2)!.querySelector('.hr-tree-row')!);
    expect(await screen.findByText('Bỏ các thay đổi chưa lưu?')).toBeInTheDocument();
    await keepEditing();
  });
});

describe('Thông tin nhân sự', () => {
  const people = [card(10, 'Trần Thị Mai', 3, 2), card(11, 'Lê Văn Nam', 5, 3)];
  beforeEach(() => {
    signIn(HR_ALL);
    view.mobile = false;
    vi.mocked(api).mockReset();
    vi.mocked(api).mockImplementation((async (path: string, opts?: { method?: string; body?: Record<string, unknown> }) => {
      if (opts?.method === 'PUT') return { ...detailOf(people.find((p) => path.endsWith(`/${p.id}`))!), ...opts.body };
      if (path === '/hr/employees/options') return OPTIONS;
      if (path.startsWith('/hr/employees?') || path === '/hr/employees') return { items: people, total: people.length, page: 1, pageSize: 20 };
      const m = /^\/hr\/employees\/(\d+)$/.exec(path);
      if (m) return detailOf(people.find((p) => p.id === Number(m[1]))!);
      throw new Error(`Chưa giả lập ${path}`);
    }) as unknown as typeof api);
  });

  it('đổi phòng ban mà chức danh cũ không dùng được ở phòng mới thì bỏ chọn chức danh', async () => {
    renderPage(<EmployeesPage />, '/hr/employees?emp=10');
    expect(await screen.findByRole('heading', { level: 2, name: 'Trần Thị Mai' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    await waitFor(() => expect(inputOf(/Chức danh/)).toHaveValue('Kế toán viên'));
    fireEvent.click(inputOf(/^Phòng ban/));
    fireEvent.click(await screen.findByRole('option', { name: /Bộ phận may/ }));
    await waitFor(() => expect(inputOf(/Chức danh/)).toHaveValue(''));
  });

  it('đang sửa dở mà chọn nhân viên khác thì hỏi lại trước khi bỏ thay đổi', async () => {
    renderPage(<EmployeesPage />, '/hr/employees?emp=10');
    expect(await screen.findByRole('heading', { level: 2, name: 'Trần Thị Mai' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    await waitFor(() => expect(inputOf(/Tên nhân viên/)).toBeInTheDocument());
    fireEvent.change(inputOf(/Tên nhân viên/), { target: { value: 'Trần Thị Mai Anh' } });
    const list = screen.getByRole('list', { name: 'Danh sách nhân viên' });
    fireEvent.click(within(list).getByRole('button', { name: /Lê Văn Nam/ }));
    expect(await screen.findByText('Bỏ các thay đổi chưa lưu?')).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveTextContent('emp=10');
    await keepEditing();
  });
  it('điện thoại: sửa dở, sang tab Danh sách rồi quay lại vẫn còn phần đang nhập (review 5.8 lượt 2 HIGH)', async () => {
    view.mobile = true;
    renderPage(<EmployeesPage />, '/hr/employees?emp=10');
    expect(await screen.findByRole('heading', { level: 2, name: 'Trần Thị Mai' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    await waitFor(() => expect(inputOf(/Tên nhân viên/)).toBeInTheDocument());
    fireEvent.change(inputOf(/Tên nhân viên/), { target: { value: 'Trần Thị Mai Anh' } });

    fireEvent.click(screen.getByRole('radio', { name: 'Danh sách' }));
    fireEvent.click(within(screen.getByRole('list', { name: 'Danh sách nhân viên' })).getByRole('button', { name: /Lê Văn Nam/ }));
    expect(await screen.findByText('Bỏ các thay đổi chưa lưu?')).toBeInTheDocument();
    await keepEditing();
    fireEvent.click(screen.getByRole('radio', { name: 'Đang sửa' }));
    expect(inputOf(/Tên nhân viên/)).toHaveValue('Trần Thị Mai Anh');
  });

  it('bấm Thêm nhân viên lần nữa và bỏ thay đổi: form về trống, không còn hỏi lại (review 5.8 lượt 2 M2)', async () => {
    renderPage(<EmployeesPage />, '/hr/employees?dept=KT');
    expect(await screen.findByRole('button', { name: 'Thêm nhân viên vào Phòng Kế toán' })).toBeInTheDocument();
    // Nút ở đầu trang (nút gửi của form cũng tên Thêm nhân viên)
    const add = screen.getByRole('button', { name: 'Thêm nhân viên' });
    fireEvent.click(add);
    await waitFor(() => expect(inputOf(/Tên nhân viên/)).toBeInTheDocument());
    fireEvent.change(inputOf(/Tên nhân viên/), { target: { value: 'Người mới' } });

    fireEvent.click(add);
    fireEvent.click(await screen.findByRole('button', { name: 'Bỏ thay đổi' }));
    await waitFor(() => expect(inputOf(/Tên nhân viên/)).toHaveValue(''));
    fireEvent.click(within(screen.getByRole('list', { name: 'Danh sách nhân viên' })).getByRole('button', { name: /Lê Văn Nam/ }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Lê Văn Nam' })).toBeInTheDocument();
  });

  it('sửa xong giữ phòng ban đang lọc (review 5.8 lượt 2 M4)', async () => {
    renderPage(<EmployeesPage />, '/hr/employees?dept=VP&emp=10');
    expect(await screen.findByRole('heading', { level: 2, name: 'Trần Thị Mai' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    await waitFor(() => expect(inputOf(/Tên nhân viên/)).toBeInTheDocument());
    fireEvent.change(inputOf(/Tên nhân viên/), { target: { value: 'Trần Thị Mai Anh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith('/hr/employees/10', expect.objectContaining({ method: 'PUT', body: { fullName: 'Trần Thị Mai Anh' } })));
    expect(await screen.findByRole('button', { name: 'Sửa' })).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveTextContent('dept=VP');
    expect(screen.getByTestId('url')).toHaveTextContent('emp=10');
  });

  it('mở link có phòng ban: chỉ tải danh sách theo phòng ban đó, không tải cả công ty trước (review 5.8 lượt 2 M5)', async () => {
    renderPage(<EmployeesPage />, '/hr/employees?dept=KT');
    expect(await screen.findByRole('list', { name: 'Danh sách nhân viên' })).toBeInTheDocument();
    const lists = vi.mocked(api).mock.calls.map(([p]) => String(p)).filter((p) => p.startsWith('/hr/employees?'));
    expect(lists.length).toBeGreaterThan(0);
    expect(lists.every((p) => p.includes('departmentId=3'))).toBe(true);
  });
});
