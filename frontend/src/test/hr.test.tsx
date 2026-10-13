import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { templateCsv } from '../features/hr/EmployeeImportModal';
import { allowedTitles } from '../features/hr/EmployeePanel';
import EmployeesPage from '../features/hr/EmployeesPage';
import OrgChartPage from '../features/hr/OrgChartPage';
import { buildTree, deptChoices, filterTree, subtreeIds } from '../features/hr/tree';
import type { Department, EmployeeCard, EmployeeDetail, EmployeeField, EmployeeOptions } from '../features/hr/types';
import { api, ApiError } from '../lib/api';
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
  isProductionWorkshop: false,
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

function renderPage(ui: ReactNode, path: string, qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
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
  const puts: unknown[] = [];
  /** Người đang được giao phạm vi chuyền theo mã (giả GET /hr/departments/line-holders) và các mã đã hỏi */
  let holders: Record<string, { username: string; fullName: string }[]> = {};
  const asked: string[] = [];
  const restores: string[] = [];
  /** Lần ghi kế tiếp: máy chủ lưu bộ phận nhưng chưa cập nhật được phân quyền theo chuyền */
  let failLineScope = false;
  /** Tải danh mục của form (loại phòng ban, ĐVCS) lỗi */
  let failOptions = false;
  beforeEach(() => {
    signIn(HR_ALL);
    view.mobile = false;
    items = [...DEPTS];
    posts.length = 0;
    puts.length = 0;
    holders = {};
    asked.length = 0;
    restores.length = 0;
    failLineScope = false;
    failOptions = false;
    vi.mocked(api).mockReset();
    vi.mocked(api).mockImplementation((async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path.startsWith('/hr/departments/line-holders')) {
        const code = new URLSearchParams(path.split('?')[1]).get('code')!;
        asked.push(code);
        return { code, holders: holders[code] ?? [] };
      }
      if (opts?.method === 'PUT' && path.startsWith('/hr/departments/')) {
        puts.push(opts.body);
        const id = Number(path.split('/').pop());
        const saved = { ...items.find((d) => d.id === id)!, ...(opts.body as Partial<Department>) };
        items = items.map((d) => (d.id === id ? saved : d));
        if (failLineScope) throw new ApiError(500, 'LINE_SCOPE_UPDATE_FAILED', `Đã lưu bộ phận ${saved.code} nhưng chưa cập nhật được phân quyền theo chuyền.`, { department: saved });
        return saved;
      }
      if (opts?.method === 'POST' && path.endsWith('/restore')) {
        const id = Number(path.split('/')[3]);
        const saved = { ...items.find((d) => d.id === id)!, isActive: true, dissolvedDate: null };
        restores.push(saved.code);
        items = items.map((d) => (d.id === id ? saved : d));
        return saved;
      }
      if (opts?.method === 'POST' && path === '/hr/departments') {
        posts.push(opts.body);
        const b = opts.body as { code: string; name: string; departmentTypeId: number; parentId: number | null };
        const parent = items.find((d) => d.id === b.parentId);
        const created = dept(9, b.code, b.name, b.parentId, `${parent?.path ?? '/'}${b.code}/`, b.departmentTypeId);
        items = [...items, created];
        return created;
      }
      if (path.startsWith('/hr/departments/tree')) return { items };
      if (path === '/hr/departments/options') {
        if (failOptions) throw new TypeError('Failed to fetch');
        return {
          types: TYPES,
          factories: [
            { code: 'A01', name: 'Nhà máy 1' },
            { code: 'A02', name: 'Nhà máy 2' },
          ],
        };
      }
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

  // ---------- Ô tích "Xưởng sản xuất" (phase 5.10, task 5.10.8): giao diện chỉ phản chiếu, máy chủ cưỡng chế ----------
  const LINE = () => dept(6, 'NM1-C01', 'Chuyền 01', 4, '/VSN/NM1/NM1-C01/', 5, { branchCode: 'A01', isProductionWorkshop: true });
  const workshopBox = () => screen.findByRole('checkbox', { name: 'Xưởng sản xuất' });

  it('ô tích "Xưởng sản xuất": thiếu quyền sửa Phân quyền thì khóa, nói lý do ngay dưới ô', async () => {
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=NM1');
    expect(await screen.findByRole('heading', { level: 2, name: 'Nhà máy 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    const box = await workshopBox();
    expect(box).toBeDisabled();
    expect(box).not.toBeChecked();
    expect(screen.getByText(/Hiện trong ô chọn Chuyền may của đơn vị cơ sở đã chọn/)).toBeInTheDocument();
    expect(screen.getByText(/Cần thêm quyền sửa Phân quyền/)).toBeInTheDocument();
    // Mô tả của ô tích hiện sẵn: không nằm trong .hr-cell (CSS ẩn mô tả, chỉ để trình đọc màn hình đọc, chú thích hiện bằng Tooltip)
    expect(screen.getByText(/Hiện trong ô chọn Chuyền may/).closest('.hr-cell')).toBeNull();
    expect(box).toHaveAccessibleDescription(/Cần thêm quyền sửa Phân quyền/);
  });

  it('đủ quyền: chưa chọn đơn vị cơ sở thì ô tích khóa; chọn rồi tích được, lưu chỉ gửi phần đã đổi, cây hiện dấu Xưởng SX', async () => {
    signIn([...HR_ALL, 'admin.permission:update']);
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=KT');
    expect(await screen.findByRole('heading', { level: 2, name: 'Phòng Kế toán' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    const box = await workshopBox();
    expect(box).toBeDisabled();
    expect(screen.getByText(/Chọn đơn vị cơ sở trước/)).toBeInTheDocument();
    expect(screen.queryByText(/Cần thêm quyền sửa Phân quyền/)).toBeNull();

    fireEvent.click(inputOf(/Đơn vị cơ sở/));
    fireEvent.click(await screen.findByRole('option', { name: 'A01 – Nhà máy 1' }));
    await waitFor(() => expect(box).toBeEnabled());
    fireEvent.click(box);
    expect(box).toBeChecked();
    fireEvent.click(document.querySelector<HTMLButtonElement>('form button[type="submit"]')!);

    await waitFor(() => expect(puts).toHaveLength(1));
    // Không ai đang được giao phạm vi chuyền KT: lưu ngay, không hỏi lại
    expect(asked).toEqual(['KT']);
    expect(puts[0]).toEqual({ branchCode: 'A01', isProductionWorkshop: true });
    expect((await screen.findAllByTitle('Xưởng sản xuất: hiện trong ô chọn Chuyền may của đơn vị cơ sở A01')).length).toBeGreaterThan(0);
    await waitFor(() => expect(within(node(3)!).getByText('Xưởng SX')).toBeInTheDocument());
    expect(within(node(2)!.querySelector('.hr-tree-row')!).queryByText('Xưởng SX')).toBeNull();
  });

  it('đang tích mà xóa đơn vị cơ sở: báo lỗi ở ô đơn vị cơ sở, không gửi; bỏ tích thì hết lỗi', async () => {
    signIn([...HR_ALL, 'admin.permission:update']);
    items = [...DEPTS, LINE()];
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=NM1-C01');
    expect(await screen.findByRole('heading', { level: 2, name: 'Chuyền 01' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Giải thể' })).not.toHaveAttribute('aria-disabled');
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    const box = await workshopBox();
    expect(box).toBeChecked();
    expect(box).toBeEnabled();
    // Nút xóa giá trị của ô chọn (không là điểm dừng của Tab nên tìm theo DOM)
    fireEvent.click(inputOf(/Đơn vị cơ sở/).closest('.mantine-Input-wrapper')!.querySelector('button')!);
    await waitFor(() => expect(inputOf(/Đơn vị cơ sở/)).toHaveValue(''));
    fireEvent.click(document.querySelector<HTMLButtonElement>('form button[type="submit"]')!);
    expect(await screen.findByText('Bộ phận tích "Xưởng sản xuất" phải có đơn vị cơ sở.')).toBeInTheDocument();
    expect(puts).toHaveLength(0);
    // Đang tích thì vẫn bỏ tích được dù chưa có đơn vị cơ sở
    expect(box).toBeEnabled();
    fireEvent.click(box);
    expect(screen.queryByText('Bộ phận tích "Xưởng sản xuất" phải có đơn vị cơ sở.')).toBeNull();
    fireEvent.click(document.querySelector<HTMLButtonElement>('form button[type="submit"]')!);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ branchCode: null, isProductionWorkshop: false });
  });

  it('bộ phận đã tích, người thiếu quyền sửa Phân quyền: có dấu trên cây, đầu khung; Giải thể khóa; ô đơn vị cơ sở chỉ đọc; đổi tên vẫn lưu', async () => {
    items = [...DEPTS, LINE()];
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=NM1-C01');
    expect(await screen.findByRole('heading', { level: 2, name: 'Chuyền 01' })).toBeInTheDocument();
    expect(screen.getAllByTitle('Xưởng sản xuất: hiện trong ô chọn Chuyền may của đơn vị cơ sở A01')).toHaveLength(2);
    expect(within(screen.getByRole('article')).getByText('Xưởng sản xuất')).toBeInTheDocument();
    expect(within(node(6)!).getByText('Xưởng SX')).toBeInTheDocument();
    expect(within(node(5)!).queryByText('Xưởng SX')).toBeNull();
    expect(screen.getByRole('button', { name: 'Giải thể' })).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    const box = await workshopBox();
    expect(box).toBeChecked();
    expect(box).toBeDisabled();
    expect(inputOf(/Đơn vị cơ sở/)).toHaveAttribute('readonly');
    fireEvent.change(inputOf(/Tên phòng ban/), { target: { value: 'Chuyền 01 mới' } });
    fireEvent.click(document.querySelector<HTMLButtonElement>('form button[type="submit"]')!);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ name: 'Chuyền 01 mới' });
  });

  // ---------- Sửa theo review 5.10.15: báo trước người sẽ thấy dữ liệu chuyền, hệ quả đổi ĐVCS, lỗi chưa cập nhật phân quyền ----------
  const dialog = () => screen.findByRole('dialog');

  it('tích bộ phận mà có người đang được giao phạm vi mã đó: hỏi lại, nêu số người và tên; Xem lại thì chưa lưu', async () => {
    signIn([...HR_ALL, 'admin.permission:update']);
    holders = { NM1: [{ username: 'tc.a', fullName: 'Nguyễn Văn A' }, { username: 'tc.b', fullName: 'Trần Thị B' }] };
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=NM1');
    expect(await screen.findByRole('heading', { level: 2, name: 'Nhà máy 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    fireEvent.click(await workshopBox());
    fireEvent.click(document.querySelector<HTMLButtonElement>('form button[type="submit"]')!);

    const ask = await dialog();
    expect(ask).toHaveTextContent('Lưu thay đổi của Nhà máy 1?');
    expect(ask).toHaveTextContent('2 người sẽ thấy dữ liệu chuyền này: Nguyễn Văn A (tc.a), Trần Thị B (tc.b). Họ đang được giao phạm vi chuyền NM1 ở màn Phân quyền.');
    fireEvent.click(within(ask).getByRole('button', { name: 'Xem lại' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(puts).toHaveLength(0);

    fireEvent.click(document.querySelector<HTMLButtonElement>('form button[type="submit"]')!);
    fireEvent.click(within(await dialog()).getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ isProductionWorkshop: true });
    expect(asked).toEqual(['NM1', 'NM1']);
  });

  it('thêm bộ phận tích sẵn: hỏi máy chủ theo mã vừa gõ (viết hoa) trước khi thêm', async () => {
    signIn([...HR_ALL, 'admin.permission:update']);
    holders = { 'NM1-C09': [{ username: 'tc.c', fullName: 'Lê Văn C' }] };
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=NM1');
    expect(await screen.findByRole('heading', { level: 2, name: 'Nhà máy 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thao tác với Nhà máy 1' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Thêm phòng ban con' }));
    await waitFor(() => expect(inputOf(/Mã phòng ban/)).toBeInTheDocument());
    fireEvent.change(inputOf(/Mã phòng ban/), { target: { value: 'nm1-c09' } });
    fireEvent.change(inputOf(/Tên phòng ban/), { target: { value: 'Chuyền 09' } });
    fireEvent.click(inputOf(/Loại phòng ban/));
    fireEvent.click(await screen.findByRole('option', { name: /Bộ phận/ }));
    fireEvent.click(await workshopBox());
    fireEvent.click(document.querySelector<HTMLButtonElement>('form button[type="submit"]')!);

    const ask = await dialog();
    expect(ask).toHaveTextContent('Thêm Chuyền 09?');
    expect(ask).toHaveTextContent('1 người sẽ thấy dữ liệu chuyền này: Lê Văn C (tc.c).');
    fireEvent.click(within(ask).getByRole('button', { name: 'Thêm phòng ban' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(asked).toEqual(['NM1-C09']);
    expect(posts[0]).toMatchObject({ code: 'NM1-C09', branchCode: 'A01', isProductionWorkshop: true });
  });

  it('đổi đơn vị cơ sở của chuyền: báo trước dàn chuyền ở đơn vị cơ sở cũ không còn hàng', async () => {
    signIn([...HR_ALL, 'admin.permission:update']);
    items = [...DEPTS, LINE()];
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=NM1-C01');
    expect(await screen.findByRole('heading', { level: 2, name: 'Chuyền 01' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    await workshopBox();
    fireEvent.click(inputOf(/Đơn vị cơ sở/));
    fireEvent.click(await screen.findByRole('option', { name: 'A02 – Nhà máy 2' }));
    fireEvent.click(document.querySelector<HTMLButtonElement>('form button[type="submit"]')!);

    const ask = await dialog();
    expect(ask).toHaveTextContent('Chuyền chuyển sang đơn vị cơ sở A02: kế hoạch đã xếp vào chuyền này ở A01 vẫn giữ mã chuyền nhưng không còn hàng trên bảng dàn chuyền của A01');
    // Chuyền vẫn là chuyền: không hỏi người được giao (danh sách người thấy không đổi)
    expect(asked).toEqual([]);
    fireEvent.click(within(ask).getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ branchCode: 'A02' });
  });

  it('khôi phục chuyền: báo trước người sẽ thấy lại dữ liệu chuyền; không ai thì khôi phục ngay', async () => {
    signIn([...HR_ALL, 'admin.permission:update']);
    items = [...DEPTS, LINE(), { ...dept(7, 'NM1-C02', 'Chuyền 02', 4, '/VSN/NM1/NM1-C02/', 5, { branchCode: 'A01', isProductionWorkshop: true }), isActive: false, dissolvedDate: '2026-10-01' }];
    holders = { 'NM1-C02': [{ username: 'tc.a', fullName: 'Nguyễn Văn A' }] };
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=NM1-C02&all=1');
    expect(await screen.findByRole('heading', { level: 2, name: 'Chuyền 02' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));
    const ask = await dialog();
    expect(ask).toHaveTextContent('Khôi phục Chuyền 02?');
    expect(ask).toHaveTextContent('1 người sẽ thấy dữ liệu chuyền này: Nguyễn Văn A (tc.a).');
    expect(restores).toEqual([]);
    fireEvent.click(within(ask).getByRole('button', { name: 'Khôi phục' }));
    await waitFor(() => expect(restores).toEqual(['NM1-C02']));
  });

  // ---------- Đơn vị cơ sở mặc định theo phòng ban cha, chọn tay lại được ----------
  const NM2 = () => dept(7, 'NM2', 'Nhà máy 2', 1, '/VSN/NM2/', 4, { branchCode: 'A02' });
  const submitForm = () => fireEvent.click(document.querySelector<HTMLButtonElement>('form button[type="submit"]')!);
  async function pickParent(name: RegExp) {
    fireEvent.click(inputOf(/Phòng ban cha/));
    fireEvent.click(await screen.findByRole('option', { name }));
  }

  it('sửa phòng ban chưa có đơn vị cơ sở: điền sẵn của phòng ban cha, ô tích mở; Hủy không hỏi; lưu được ngay', async () => {
    signIn([...HR_ALL, 'admin.permission:update']);
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=NM1-MAY');
    expect(await screen.findByRole('heading', { level: 2, name: 'Bộ phận may' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    const box = await workshopBox();
    expect(inputOf(/Đơn vị cơ sở/)).toHaveValue('A01 – Nhà máy 1');
    expect(inputOf(/Đơn vị cơ sở/)).toHaveAccessibleDescription('Mặc định lấy theo phòng ban cha Nhà máy 1; chọn lại được.');
    expect(box).toBeEnabled();
    expect(screen.queryByText(/Chọn đơn vị cơ sở trước/)).toBeNull();

    // Người dùng chưa sửa gì: Hủy đóng form luôn
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(document.querySelector('form')).toBeNull());
    expect(screen.queryByText('Bỏ các thay đổi chưa lưu?')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    await workshopBox();
    submitForm();
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ branchCode: 'A01' });
  });

  it('phòng ban cha thuộc đơn vị cơ sở đã ngừng dùng: không điền sẵn, không có gì để lưu', async () => {
    items = [...DEPTS, dept(7, 'NM9', 'Nhà máy 9', 1, '/VSN/NM9/', 4, { branchCode: 'A09' }), dept(8, 'NM9-MAY', 'Bộ phận may 9', 7, '/VSN/NM9/NM9-MAY/', 5)];
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=NM9-MAY');
    expect(await screen.findByRole('heading', { level: 2, name: 'Bộ phận may 9' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    await workshopBox();
    expect(inputOf(/Đơn vị cơ sở/)).toHaveValue('');
    expect(document.querySelector('form button[type="submit"]')).toHaveAttribute('aria-disabled', 'true');
  });

  it('thêm phòng ban: đơn vị cơ sở đổi theo phòng ban cha; chọn tay rồi thì đổi cha không đổi theo', async () => {
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=NM1');
    expect(await screen.findByRole('heading', { level: 2, name: 'Nhà máy 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thao tác với Nhà máy 1' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Thêm phòng ban con' }));
    await waitFor(() => expect(inputOf(/Đơn vị cơ sở/)).toHaveValue('A01 – Nhà máy 1'));

    await pickParent(/Khối văn phòng/);
    await waitFor(() => expect(inputOf(/Đơn vị cơ sở/)).toHaveValue(''));
    await pickParent(/^Nhà máy 1/);
    await waitFor(() => expect(inputOf(/Đơn vị cơ sở/)).toHaveValue('A01 – Nhà máy 1'));

    fireEvent.click(inputOf(/Đơn vị cơ sở/));
    fireEvent.click(await screen.findByRole('option', { name: 'A02 – Nhà máy 2' }));
    await pickParent(/Khối văn phòng/);
    await waitFor(() => expect(screen.getByText('Thuộc Công ty Vietsun › Khối văn phòng')).toBeInTheDocument());
    expect(inputOf(/Đơn vị cơ sở/)).toHaveValue('A02 – Nhà máy 2');

    fireEvent.change(inputOf(/Mã phòng ban/), { target: { value: 'VP-HC' } });
    fireEvent.change(inputOf(/Tên phòng ban/), { target: { value: 'Phòng Hành chính' } });
    fireEvent.click(inputOf(/Loại phòng ban/));
    fireEvent.click(await screen.findByRole('option', { name: 'Phòng' }));
    submitForm();
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ code: 'VP-HC', parentId: 2, branchCode: 'A02' });
  });

  it('chuyển chuyền sang phòng ban cha của đơn vị cơ sở khác: đơn vị cơ sở đổi theo, báo trước hệ quả ở đơn vị cơ sở cũ', async () => {
    signIn([...HR_ALL, 'admin.permission:update']);
    items = [...DEPTS, NM2(), LINE()];
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=NM1-C01');
    expect(await screen.findByRole('heading', { level: 2, name: 'Chuyền 01' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    await workshopBox();
    await pickParent(/^Nhà máy 2/);
    await waitFor(() => expect(inputOf(/Đơn vị cơ sở/)).toHaveValue('A02 – Nhà máy 2'));
    submitForm();

    const ask = await dialog();
    expect(ask).toHaveTextContent('Chuyền chuyển sang đơn vị cơ sở A02');
    fireEvent.click(within(ask).getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ parentId: 7, branchCode: 'A02' });
  });

  it('phòng ban có đơn vị cơ sở khác phòng ban cha (đã chọn tay từ trước): đổi cha không đổi đơn vị cơ sở', async () => {
    items = [...DEPTS, dept(8, 'VP-DP', 'Phòng điều phối', 2, '/VSN/VP/VP-DP/', 3, { branchCode: 'A02' })];
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=VP-DP');
    expect(await screen.findByRole('heading', { level: 2, name: 'Phòng điều phối' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    await workshopBox();
    await pickParent(/^Nhà máy 1/);
    await waitFor(() => expect(screen.getByText('Thuộc Công ty Vietsun › Nhà máy 1')).toBeInTheDocument());
    expect(inputOf(/Đơn vị cơ sở/)).toHaveValue('A02 – Nhà máy 2');
    submitForm();
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ parentId: 4 });
  });

  it('chuyển sang phòng ban cha không có đơn vị cơ sở: giữ đơn vị cơ sở đã lưu, chuyền không bị bắt chọn lại', async () => {
    signIn([...HR_ALL, 'admin.permission:update']);
    items = [...DEPTS, LINE()];
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=NM1-C01');
    expect(await screen.findByRole('heading', { level: 2, name: 'Chuyền 01' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    await workshopBox();
    await pickParent(/Khối văn phòng/);
    await waitFor(() => expect(screen.getByText('Thuộc Công ty Vietsun › Khối văn phòng')).toBeInTheDocument());
    expect(inputOf(/Đơn vị cơ sở/)).toHaveValue('A01 – Nhà máy 1');
    submitForm();
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ parentId: 2 });
  });

  it('thêm phòng ban: xóa tay đơn vị cơ sở rồi đổi cha thì vẫn để trống', async () => {
    items = [...DEPTS, NM2()];
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=NM1');
    expect(await screen.findByRole('heading', { level: 2, name: 'Nhà máy 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thao tác với Nhà máy 1' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Thêm phòng ban con' }));
    await waitFor(() => expect(inputOf(/Đơn vị cơ sở/)).toHaveValue('A01 – Nhà máy 1'));
    fireEvent.click(inputOf(/Đơn vị cơ sở/).closest('.mantine-Input-wrapper')!.querySelector('button')!);
    await waitFor(() => expect(inputOf(/Đơn vị cơ sở/)).toHaveValue(''));
    await pickParent(/^Nhà máy 2/);
    await waitFor(() => expect(screen.getByText('Thuộc Công ty Vietsun › Nhà máy 2')).toBeInTheDocument());
    expect(inputOf(/Đơn vị cơ sở/)).toHaveValue('');
  });

  it('đổi đơn vị cơ sở của phòng ban có con: báo trước các phòng ban con giữ đơn vị cơ sở hiện tại', async () => {
    items = [
      ...DEPTS,
      NM2(),
      dept(8, 'NM1-X1', 'Xưởng 1', 4, '/VSN/NM1/NM1-X1/', 3, { branchCode: 'A01' }),
      dept(10, 'NM1-X1-T1', 'Tổ 1', 8, '/VSN/NM1/NM1-X1/NM1-X1-T1/', 5, { branchCode: 'A01' }),
    ];
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=NM1-X1');
    expect(await screen.findByRole('heading', { level: 2, name: 'Xưởng 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    await workshopBox();
    await pickParent(/^Nhà máy 2/);
    await waitFor(() => expect(inputOf(/Đơn vị cơ sở/)).toHaveValue('A02 – Nhà máy 2'));
    submitForm();

    const ask = await dialog();
    expect(ask).toHaveTextContent('Chỉ Xưởng 1 chuyển sang đơn vị cơ sở A02; các phòng ban con giữ đơn vị cơ sở hiện tại, cần đổi thì sửa từng phòng ban.');
    fireEvent.click(within(ask).getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ parentId: 7, branchCode: 'A02' });
  });

  it('cache bị xóa khi đang sửa (đổi đơn vị cơ sở ở tab khác): form giữ phần đang nhập', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=KT', qc);
    expect(await screen.findByRole('heading', { level: 2, name: 'Phòng Kế toán' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    await waitFor(() => expect(inputOf(/Tên phòng ban/)).toHaveValue('Phòng Kế toán'));
    const optionLoads = () => vi.mocked(api).mock.calls.filter(([p]) => p === '/hr/departments/options').length;
    expect(optionLoads()).toBe(1);

    fireEvent.change(inputOf(/Tên phòng ban/), { target: { value: 'Phòng A' } });
    act(() => qc.clear());
    // Trang dựng lại (đổi cờ đang sửa) sau khi cache trống
    fireEvent.change(inputOf(/Tên phòng ban/), { target: { value: 'Phòng Kế toán' } });
    fireEvent.change(inputOf(/Tên phòng ban/), { target: { value: 'Phòng B' } });
    await waitFor(() => expect(optionLoads()).toBe(2));
    expect(inputOf(/Tên phòng ban/)).toHaveValue('Phòng B');
  });

  it('tải danh mục của form lỗi: báo lỗi kèm Thử lại, không dựng form trống; Hủy về khung xem', async () => {
    failOptions = true;
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=KT');
    expect(await screen.findByRole('heading', { level: 2, name: 'Phòng Kế toán' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    expect(await screen.findByText('Không tải được loại phòng ban, đơn vị cơ sở. Kiểm tra kết nối rồi thử lại.')).toBeInTheDocument();
    expect(document.querySelector('form')).toBeNull();

    failOptions = false;
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(inputOf(/Tên phòng ban/)).toHaveValue('Phòng Kế toán'));
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Phòng Kế toán' })).toBeInTheDocument();
    expect(document.querySelector('form')).toBeNull();
  });

  it('chuyền may, người thiếu quyền sửa Phân quyền: đổi phòng ban cha không đổi đơn vị cơ sở', async () => {
    items = [...DEPTS, NM2(), LINE()];
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=NM1-C01');
    expect(await screen.findByRole('heading', { level: 2, name: 'Chuyền 01' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    await workshopBox();
    await pickParent(/^Nhà máy 2/);
    await waitFor(() => expect(screen.getByText('Thuộc Công ty Vietsun › Nhà máy 2')).toBeInTheDocument());
    expect(inputOf(/Đơn vị cơ sở/)).toHaveValue('A01 – Nhà máy 1');
    submitForm();
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ parentId: 7 });
  });

  it('máy chủ đã lưu nhưng chưa cập nhật được phân quyền: hiện bộ phận đã lưu (form đóng), không coi như chưa lưu', async () => {
    signIn([...HR_ALL, 'admin.permission:update']);
    failLineScope = true;
    renderPage(<OrgChartPage />, '/hr/org-chart?dept=NM1');
    expect(await screen.findByRole('heading', { level: 2, name: 'Nhà máy 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    fireEvent.click(await workshopBox());
    fireEvent.click(document.querySelector<HTMLButtonElement>('form button[type="submit"]')!);
    await waitFor(() => expect(puts).toHaveLength(1));
    // Về khung xem với dữ liệu đã lưu: có dấu Xưởng sản xuất, không còn form
    await waitFor(() => expect(document.querySelector('form')).toBeNull());
    expect(within(screen.getByRole('article')).getByText('Xưởng sản xuất')).toBeInTheDocument();
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
