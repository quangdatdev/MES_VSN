import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CatalogsPage from '../features/admin/CatalogsPage';
import type { CatalogLines } from '../features/admin/types';
import { api } from '../lib/api';
import { lineOptions } from '../lib/lines';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

type Call = { path: string; method: string; body: unknown };
let calls: Call[] = [];

// Cây giả: A01 có Xưởng 01 (2 chuyền đang dùng), Xưởng 02 đã ngừng (1 chuyền đã ngừng), một chuyền thẳng dưới nhà máy
const tree: CatalogLines = {
  branches: [{ code: 'A01', name: 'Nhà máy 1', isActive: true }],
  workshops: [
    { id: 10, code: 'A01-X01', name: 'Xưởng 01', branchCode: 'A01', sortOrder: 1, isActive: true, activeLines: 2 },
    { id: 11, code: 'A01-X02', name: 'Xưởng 02', branchCode: 'A01', sortOrder: 2, isActive: false, activeLines: 0 },
  ],
  items: [
    { id: 1, code: 'A01-L01', name: 'Chuyền 01', branchCode: 'A01', workshopId: 10, sortOrder: 1, isActive: true },
    { id: 2, code: 'A01-L02', name: 'Chuyền 02', branchCode: 'A01', workshopId: 10, sortOrder: 2, isActive: true },
    { id: 3, code: 'A01-L03', name: 'Chuyền 03', branchCode: 'A01', workshopId: 11, sortOrder: 3, isActive: false },
    { id: 4, code: 'A01-L09', name: 'Chuyền mẫu', branchCode: 'A01', workshopId: null, sortOrder: 9, isActive: true },
  ],
};

/** Giả máy chủ lọc cây (GET lines?q=&branch=): trúng xưởng thì cả xưởng, trúng chuyền thì chuyền kèm xưởng chứa nó */
function filterTree(p: URLSearchParams): CatalogLines {
  const q = (p.get('q') ?? '').toLowerCase();
  const branch = p.get('branch');
  const hit = (x: { code: string; name: string }) => !q || x.code.toLowerCase().includes(q) || x.name.toLowerCase().includes(q);
  const inBranch = <T extends { branchCode: string }>(x: T) => !branch || x.branchCode === branch;
  const workshopHit = new Set(tree.workshops.filter((w) => inBranch(w) && hit(w)).map((w) => w.id));
  const items = tree.items.filter((l) => inBranch(l) && (hit(l) || (l.workshopId !== null && workshopHit.has(l.workshopId))));
  const workshops = tree.workshops.filter((w) => inBranch(w) && (workshopHit.has(w.id) || (!!q && items.some((l) => l.workshopId === w.id)) || !q));
  return { ...tree, workshops, items };
}

function serve() {
  vi.mocked(api).mockImplementation((async (path: string, opts?: { method?: string; body?: unknown }) => {
    const method = opts?.method ?? 'GET';
    if (method !== 'GET') {
      calls.push({ path, method, body: opts?.body });
      return { ok: true };
    }
    if (path === '/admin/catalogs') return { mes: [{ code: 'LINE', kind: 'line', name: 'Chuyền may', description: null, total: 4, active: 3 }], external: [], externalError: null };
    if (path === '/sewing/prep-steps') return [];
    if (path === '/admin/catalogs/lines') return tree;
    if (path.startsWith('/admin/catalogs/lines?')) return filterTree(new URLSearchParams(path.split('?')[1]));
    throw new Error(`Chưa giả đường ${path}`);
  }) as unknown as typeof api);
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider theme={theme} env="test">
      <ModalsProvider>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={['/admin/catalogs?c=LINE']}>
            <CatalogsPage />
          </MemoryRouter>
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>,
  );
}

function pick(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(within(screen.getByRole('listbox', { name: label })).getByRole('option', { name: option }));
}

beforeEach(() => {
  calls = [];
  serve();
  useSession.getState().set({
    status: 'ready',
    user: { id: 1, username: 'admin', fullName: 'Quản trị' },
    branch: { code: 'A01', name: 'Nhà máy 1', isAggregate: false },
    roles: [],
    permissions: new Set(['admin.catalog:view', 'admin.catalog:create', 'admin.catalog:update', 'admin.permission:update']),
  });
});

describe('Danh mục chuyền may dạng cây Nhà máy → Xưởng → Chuyền', () => {
  it('hiện nhà máy, xưởng kèm số chuyền đang dùng, chuyền trong xưởng và chuyền thẳng dưới nhà máy; thu gọn xưởng thì ẩn chuyền', async () => {
    renderPage();
    expect(await screen.findByText('A01 – Nhà máy 1')).toBeInTheDocument();
    expect(screen.getByText('Xưởng 01')).toBeInTheDocument();
    expect(screen.getByText('2 chuyền đang dùng')).toBeInTheDocument();
    expect(screen.getByText('Chuyền 02')).toBeInTheDocument();
    expect(screen.getByText('Chuyền mẫu')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn Xưởng 01 (A01-X01)' }));
    expect(screen.queryByText('Chuyền 02')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mở Xưởng 01 (A01-X01)' })).toHaveAttribute('aria-expanded', 'false');
    // Chuyền của xưởng khác và chuyền thẳng dưới nhà máy vẫn hiện
    expect(screen.getByText('Chuyền 03')).toBeInTheDocument();
    expect(screen.getByText('Chuyền mẫu')).toBeInTheDocument();
  });

  it('tìm theo chuyền: hiện chuyền kèm xưởng chứa nó, kể cả xưởng đang thu gọn', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Thu gọn Xưởng 01 (A01-X01)' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Tìm mã, tên xưởng hoặc chuyền' }), { target: { value: 'L02' } });
    // Tìm trong DB (máy chủ lọc), không lọc trên dữ liệu đã tải
    await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith('/admin/catalogs/lines?q=L02'));
    await waitFor(() => expect(screen.queryByText('Chuyền 01')).not.toBeInTheDocument());
    expect(screen.getByText('Chuyền 02')).toBeInTheDocument();
    expect(screen.getByText('Xưởng 01')).toBeInTheDocument();
    expect(screen.queryByText('Chuyền 01')).not.toBeInTheDocument();
    expect(screen.queryByText('Xưởng 02')).not.toBeInTheDocument();
    expect(screen.queryByText('Chuyền mẫu')).not.toBeInTheDocument();
  });

  it('xưởng còn chuyền đang dùng: gạt Ngừng dùng không gửi gì; chuyền đã ngừng trong xưởng đã ngừng cũng không bật lại được', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('switch', { name: 'Đang dùng: A01-X01' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Ngừng dùng: A01-L03' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls).toEqual([]);
    const blocked = screen.getByRole('switch', { name: 'Đang dùng: A01-X01' });
    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    // Lý do khóa đọc được, không chỉ nằm trong tooltip
    expect(blocked).toHaveAccessibleDescription(/Còn 2 chuyền đang dùng trong xưởng/);
  });

  it('thêm chuyền từ dòng xưởng: ô Xưởng chọn sẵn, gửi kèm workshopId', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm chuyền vào Xưởng 01 (A01-X01)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Thêm chuyền' });
    expect(within(dialog).getByRole('combobox', { name: 'Xưởng' })).toHaveValue('Xưởng 01 (A01-X01)');
    // Mã gợi ý tiếp theo số chuyền lớn nhất của nhà máy
    expect(within(dialog).getByRole('textbox', { name: /Mã chuyền/ })).toHaveValue('A01-L10');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thêm chuyền' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/admin/catalogs/lines', body: { branchCode: 'A01', code: 'A01-L10', workshopId: 10 } });
  });

  it('sửa chuyền: chỉ đổi tên thì không gửi xưởng; chuyển ra khỏi xưởng thì nói rõ hậu quả, hỏi lại rồi mới gửi workshopId null', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa A01-L01' }));
    let dialog = await screen.findByRole('dialog', { name: 'Sửa chuyền A01-L01' });
    // Xưởng đã ngừng không có trong danh sách để chuyển vào
    fireEvent.click(within(dialog).getByRole('combobox', { name: 'Xưởng' }));
    expect(screen.queryByRole('option', { name: /Xưởng 02/ })).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Tên chuyền/ }), { target: { value: 'Chuyền 01 mới' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).not.toHaveProperty('workshopId');

    fireEvent.click(await screen.findByRole('button', { name: 'Sửa A01-L02' }));
    dialog = await screen.findByRole('dialog', { name: 'Sửa chuyền A01-L02' });
    pick('Xưởng', 'Không thuộc xưởng (thẳng dưới đơn vị cơ sở)');
    expect(within(dialog).getByText(/ai được giao cả xưởng mới sẽ thấy và sửa được dữ liệu của chuyền/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
    const confirm = await screen.findByRole('dialog', { name: 'Chuyển chuyền A01-L02 ra thẳng dưới đơn vị cơ sở?' });
    expect(calls).toHaveLength(1);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Chuyển chuyền' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toMatchObject({ method: 'PUT', path: '/admin/catalogs/lines/2', body: { workshopId: null } });
  });

  it('không có quyền sửa phân quyền: ô Xưởng khi sửa chuyền chỉ đọc, nói lý do', async () => {
    useSession.getState().set({ permissions: new Set(['admin.catalog:view', 'admin.catalog:update']) });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa A01-L01' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sửa chuyền A01-L01' });
    expect(within(dialog).getByRole('combobox', { name: 'Xưởng' })).toHaveAttribute('readonly');
    expect(within(dialog).getByText(/cần quyền sửa phân quyền/)).toBeInTheDocument();
  });

  it('thêm xưởng: gợi ý mã, tên kế tiếp của nhà máy', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm xưởng' }));
    const dialog = await screen.findByRole('dialog', { name: 'Thêm xưởng' });
    expect(within(dialog).getByRole('textbox', { name: /Mã xưởng/ })).toHaveValue('A01-X03');
    expect(within(dialog).getByRole('textbox', { name: /Tên xưởng/ })).toHaveValue('Xưởng 03');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thêm xưởng' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/admin/catalogs/workshops', body: { branchCode: 'A01', code: 'A01-X03', name: 'Xưởng 03' } });
  });
});

describe('Lựa chọn chuyền theo cây xưởng', () => {
  // Mỗi xưởng một mã riêng như dữ liệu thật (Xưởng 01 → A01-X01)
  const line = (code: string, workshopName: string | null, branchCode = 'A01') => ({
    code,
    name: `Chuyền ${code.slice(-2)}`,
    branchCode,
    workshopCode: workshopName && `${branchCode}-X${workshopName.slice(-2)}`,
    workshopName,
  });
  const shape = (lines: ReturnType<typeof line>[]) => lineOptions(lines).map((o) => [o.value, o.groups ?? null]);

  it('chưa chia xưởng thì danh sách phẳng như cũ', () => {
    expect(lineOptions([line('A01-L01', null), line('A01-L02', null)])).toEqual([
      { value: 'A01-L01', label: 'Chuyền 01 (A01-L01)', groups: undefined, keywords: undefined },
      { value: 'A01-L02', label: 'Chuyền 02 (A01-L02)', groups: undefined, keywords: undefined },
    ]);
  });

  it('có xưởng thì gom theo xưởng, chuyền thẳng dưới nhà máy đứng ngoài nhóm; tìm được theo mã xưởng', () => {
    const options = lineOptions([line('A01-L01', 'Xưởng 01'), line('A01-L02', 'Xưởng 02'), line('A01-L03', null)]);
    expect(options.map((o) => [o.value, o.groups ?? null])).toEqual([
      ['A01-L01', ['Xưởng 01']],
      ['A01-L02', ['Xưởng 02']],
      ['A01-L03', null],
    ]);
    expect(options[1].keywords).toBe('A01-X02');
  });

  it('xem nhiều nhà máy thì thêm cấp chi nhánh ngoài cùng (tên chi nhánh kèm mã); nhà máy chưa chia xưởng cũng gom theo chi nhánh', () => {
    const lines = [line('A01-L01', 'Xưởng 01'), line('A01-L02', null), line('A02-L01', null, 'A02')];
    expect(shape(lines)).toEqual([
      ['A01-L01', ['Chi nhánh A01', 'Xưởng 01']],
      ['A01-L02', ['Chi nhánh A01']],
      ['A02-L01', ['Chi nhánh A02']],
    ]);
    // Đã có tên chi nhánh (TenChiNhanh); mã chưa có tên thì vẫn ghi mã
    const names: Record<string, string> = { A01: 'CN Một' };
    expect(lineOptions(lines, undefined, (c) => names[c] ?? c).map((o) => o.groups)).toEqual([['CN Một (A01)', 'Xưởng 01'], ['CN Một (A01)'], ['Chi nhánh A02']]);
  });

  it('hai xưởng trùng tên trong một nhà máy không bị gộp: tên nhóm kèm mã xưởng; khác nhà máy thì không cần', () => {
    const a = { code: 'A01-L01', name: 'Chuyền 01', branchCode: 'A01', workshopCode: 'A01-X01', workshopName: 'Xưởng may' };
    const b = { code: 'A01-L02', name: 'Chuyền 02', branchCode: 'A01', workshopCode: 'A01-X02', workshopName: 'Xưởng may' };
    const c = { code: 'A02-L01', name: 'Chuyền 01', branchCode: 'A02', workshopCode: 'A02-X01', workshopName: 'Xưởng may' };
    expect(lineOptions([a, b]).map((o) => o.groups)).toEqual([['Xưởng may (A01-X01)'], ['Xưởng may (A01-X02)']]);
    expect(lineOptions([a, c]).map((o) => o.groups)).toEqual([
      ['Chi nhánh A01', 'Xưởng may'],
      ['Chi nhánh A02', 'Xưởng may'],
    ]);
  });
});
