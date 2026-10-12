import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoAllocation, PoAllocationFactoryResult, PoAllocationPage as Page } from '../features/order/api';
import PoAllocationPage from '../features/order/PoAllocationPage';
import { api, ApiError } from '../lib/api';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

const row = (over: Partial<PoAllocation> = {}): PoAllocation => ({
  id: 101,
  rowNo: 1,
  brand: 'WITT',
  season: '154',
  po: 'PO-THU-1',
  so: 'SO-THU-1',
  shipMode: 'SEA',
  styleName: 'Áo thử',
  styleNo: 'ST-THU-1',
  color: 'Stone',
  etdActual: '2026-03-06',
  etdRevised: null,
  factoryName: 'VSN-PY',
  branchCode: 'A01',
  isFactoryManual: false,
  osmFactoryName: 'VSN-PY',
  isInOsm: true,
  ...over,
});
const synced = { syncedAt: '2026-10-12T03:00:00.000Z', sourceActive: true, lastRefresh: null };
const FACTORIES = [
  { code: 'VSN-PY', name: 'VSN-PY', branchCode: 'A01' },
  { code: 'VIET DUC', name: 'Việt Đức', branchCode: 'A02' },
  { code: 'MEKO', name: 'MEKO', branchCode: null },
];

type Put = { ids: number[]; factoryName?: string | null; dryRun?: boolean };
/** Giả lập máy chủ; `put` trả kết quả (hoặc ném lỗi) của PUT /order/po-allocations/factory */
function serve(page: Page, put: (body: Put) => PoAllocationFactoryResult = (b) => ({ rows: 3, keys: 2, removed: 0, removable: 0, dryRun: !!b.dryRun })) {
  vi.mocked(api).mockImplementation((async (raw: string, opts?: { method?: string; body?: unknown }) => {
    const path = String(raw ?? '');
    if (path === '/me/branch-names') return [{ code: 'A01', name: 'Vietsun Phú Yên' }, { code: 'A02', name: 'Vietsun Đà Nẵng' }];
    if (path === '/order/po-allocations/options') return { brands: ['WITT'], seasons: ['154'], factories: FACTORIES };
    if (path.startsWith('/order/po-allocations?')) return page;
    if (path === '/order/po-allocations/factory' && opts?.method === 'PUT') return put(opts.body as Put);
    throw new Error(`Chưa giả lập ${path}`);
  }) as unknown as typeof api);
}
const listCalls = () => vi.mocked(api).mock.calls.map((c) => String(c[0])).filter((p) => p.startsWith('/order/po-allocations?'));
const putBodies = () => vi.mocked(api).mock.calls.filter((c) => String(c[0]) === '/order/po-allocations/factory').map((c) => (c[1] as { body: Put }).body);

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider theme={theme} env="test">
      <ModalsProvider>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={['/order/po-allocation']}>
            <PoAllocationPage />
          </MemoryRouter>
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>,
  );
}

function signIn(permissions: string[], fieldPolicies: Record<string, Record<string, 'HIDDEN' | 'MASKED' | 'READONLY' | 'EDITABLE'>> = {}, aggregate = false) {
  useSession.getState().reset('anonymous');
  useSession.getState().set({
    status: 'ready',
    user: { id: 9, username: 'kehoach.a', fullName: 'Kế hoạch' },
    branch: aggregate ? { code: 'A00', name: 'Tổng hợp', isAggregate: true } : { code: 'A01', name: 'Nhà máy 1', isAggregate: false },
    roles: [],
    permissions: new Set(permissions),
    fieldPolicies,
  });
}
const EDIT = ['order.poallocation:view', 'order.poallocation:update'];
const changeButton = () => screen.getByRole('button', { name: 'Đổi nhà máy SX' });

describe('Phân bổ PO', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
  });

  it('hiện đủ cột của OSM, tên Đơn vị cơ sở, "–" khi nhà máy chưa gắn ĐVCS; mặc định ETD-Revised mới lên trước', async () => {
    signIn(['order.poallocation:view']);
    serve({ items: [row(), row({ id: 102, rowNo: 2, po: 'PO-THU-2', factoryName: 'MEKO', osmFactoryName: 'MEKO', branchCode: null })], total: 2, page: 1, pageSize: 100, ...synced });
    renderPage();
    expect(await screen.findByText('PO-THU-2')).toBeInTheDocument();
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
    for (const title of ['Brand', 'Season', 'PO', 'SO', 'Ship mode', 'Style name', 'Style No', 'Màu', 'ETD-Actual', 'ETD-Revised', 'Nhà máy SX', 'Nhập tay', 'Đơn vị cơ sở']) {
      expect(heads.some((h) => h.includes(title))).toBe(true);
    }
    const rows = screen.getAllByRole('row').slice(1);
    expect(await within(rows[0]).findByText('Vietsun Phú Yên')).toHaveAttribute('title', 'A01');
    expect(within(rows[1]).getAllByText('–').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/^Đồng bộ OSM lúc 12\/10\/2026/)).toBeInTheDocument();
    expect(listCalls()[0]).toContain('sort=etdRevised%3Adesc');
    // Chỉ có quyền xem: không có nút đổi nhà máy, không có ô tích; không có quyền xuất thì không có nút Xuất file
    expect(screen.queryByRole('button', { name: /Đổi nhà máy SX|Xuất file/ })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('dòng nhập tay: vạch ở ô Nhà máy SX, huy hiệu Nhập tay, nhà máy theo OSM khi khác, dòng không còn trong OSM', async () => {
    signIn(['order.poallocation:view']);
    serve({
      items: [
        row({ factoryName: 'MEKO', isFactoryManual: true, osmFactoryName: 'VSN-PY', branchCode: null }),
        row({ id: 102, rowNo: 2, po: 'PO-THU-2', factoryName: 'MEKO', isFactoryManual: true, osmFactoryName: 'VSN-PY', isInOsm: false, branchCode: null }),
        row({ id: 103, rowNo: 3, po: 'PO-THU-3' }),
      ],
      total: 3,
      page: 1,
      pageSize: 100,
      ...synced,
    });
    renderPage();
    expect(await screen.findByText('PO-THU-3')).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Nhập tay')).toBeInTheDocument();
    expect(within(rows[0]).getByText('OSM: VSN-PY')).toBeInTheDocument();
    expect(within(rows[0]).getByTitle(/Nhập tay: đồng bộ OSM lại vẫn giữ/)).toHaveTextContent('MEKO');
    expect(within(rows[1]).getByText('Không còn trong OSM')).toBeInTheDocument();
    expect(within(rows[1]).queryByText(/^OSM:/)).toBeNull();
    expect(within(rows[2]).queryByText('Nhập tay')).toBeNull();
    // Cột Nhập tay lọc được theo giá trị
    expect(screen.getByRole('button', { name: 'Lọc theo cột Nhập tay' })).toBeInTheDocument();
  });

  it('chưa đồng bộ nguồn OSM: chỉ cách có dữ liệu, có link Đồng bộ dữ liệu khi được chạy đồng bộ', async () => {
    serve({ items: [], total: 0, page: 1, pageSize: 100, syncedAt: null, sourceActive: true, lastRefresh: null });
    signIn(['order.poallocation:view', 'admin.sync:update']);
    const { unmount } = renderPage();
    expect(await screen.findByText('Chưa có dữ liệu phân bổ PO từ OSM.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đồng bộ dữ liệu' })).toHaveAttribute('href', '/admin/sync');
    expect(screen.queryByText(/Đồng bộ OSM lúc/)).toBeNull();
    unmount();
    signIn(['order.poallocation:view']);
    const second = renderPage();
    expect(await screen.findByText(/Nhờ quản trị viên chạy đồng bộ nguồn/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Đồng bộ dữ liệu' })).toBeNull();
    second.unmount();
    // Máy chủ chưa khai database OSM của nguồn: nguồn tắt, màn Đồng bộ không có nguồn này nên nhờ IT
    serve({ items: [], total: 0, page: 1, pageSize: 100, syncedAt: null, sourceActive: false, lastRefresh: null });
    signIn(['order.poallocation:view', 'admin.sync:update']);
    renderPage();
    expect(await screen.findByText(/Máy chủ chưa được cấu hình để lấy dữ liệu này từ OSM/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Đồng bộ dữ liệu' })).toBeNull();
  });

  it('cột bị Ẩn thì không có cột, không có ô lọc; Nhà máy SX bị Che thì ĐVCS, Nhập tay cũng bị che, không lọc được, không đổi được', async () => {
    signIn([...EDIT, 'order.poallocation:export'], { 'order.poallocation': { factoryName: 'MASKED', brand: 'HIDDEN' } });
    const r = row({ branchCode: '***', factoryName: '***', isFactoryManual: '***', osmFactoryName: '***', isInOsm: '***' });
    delete (r as Partial<PoAllocation>).brand;
    serve({ items: [r], total: 1, page: 1, pageSize: 100, ...synced });
    renderPage();
    expect(await screen.findByText('PO-THU-1')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /^Brand/ })).toBeNull();
    expect(screen.queryByText('Brand', { selector: 'label' })).toBeNull();
    expect(screen.getByText('Season', { selector: 'label' })).toBeInTheDocument();
    expect(screen.getAllByTitle('Bị che theo phân quyền của bạn')).toHaveLength(3);
    expect(screen.getByRole('columnheader', { name: /Đơn vị cơ sở/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lọc theo cột Đơn vị cơ sở' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lọc theo cột Nhập tay' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Lọc theo cột Màu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xuất file/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đổi nhà máy SX' })).toBeNull();
  });

  it('Nhà máy SX bị Ẩn thì không có cả cột Đơn vị cơ sở, Nhập tay', async () => {
    signIn(['order.poallocation:view'], { 'order.poallocation': { factoryName: 'HIDDEN' } });
    const r = row();
    for (const k of ['factoryName', 'branchCode', 'isFactoryManual', 'osmFactoryName', 'isInOsm'] as const) delete (r as Partial<PoAllocation>)[k];
    serve({ items: [r], total: 1, page: 1, pageSize: 100, ...synced });
    renderPage();
    expect(await screen.findByText('PO-THU-1')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Nhà máy SX/ })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /Đơn vị cơ sở/ })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /Nhập tay/ })).toBeNull();
    expect(screen.getByRole('button', { name: /3 cột ẩn/ })).toBeInTheDocument();
  });

  it('ETD-Revised bị Ẩn thì mặc định xếp theo ETD-Actual, như máy chủ', async () => {
    signIn(['order.poallocation:view'], { 'order.poallocation': { etdRevised: 'HIDDEN' } });
    serve({ items: [row()], total: 1, page: 1, pageSize: 100, ...synced });
    renderPage();
    expect(await screen.findByText('PO-THU-1')).toBeInTheDocument();
    expect(listCalls()[0]).toContain('sort=etdActual%3Adesc');
  });

  it('đổi nhà máy SX: chưa tích dòng thì nút khóa nói lý do; tích dòng, xem trước số dòng bị áp, chọn nhà máy gom theo ĐVCS rồi lưu', async () => {
    signIn(EDIT);
    serve({ items: [row(), row({ id: 102, rowNo: 2, po: 'PO-THU-2' })], total: 2, page: 1, pageSize: 100, ...synced });
    renderPage();
    expect(await screen.findByText('PO-THU-2')).toBeInTheDocument();
    expect(changeButton()).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn dòng 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn dòng 2' }));
    expect(screen.getByText(/Đã chọn/)).toHaveTextContent('Đã chọn 2 dòng');
    await waitFor(() => expect(changeButton()).not.toHaveAttribute('aria-disabled'));
    fireEvent.click(changeButton());

    const dialog = await screen.findByRole('dialog', { name: 'Đổi nhà máy SX' });
    expect(await within(dialog).findByText(/Sẽ áp cho/)).toHaveTextContent('Sẽ áp cho 3 dòng (2 nhóm SO/PO/Style/Màu).');
    expect(putBodies()[0]).toEqual({ ids: [101, 102], dryRun: true });
    const save = within(dialog).getByRole('button', { name: 'Đổi nhà máy SX' });
    expect(save).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(within(dialog).getByRole('combobox', { name: 'Nhà máy' }));
    const listbox = screen.getByRole('listbox', { name: 'Nhà máy' });
    // ĐVCS đang làm việc trước, rồi ĐVCS khác, nhà máy chưa gắn ĐVCS cuối
    const text = listbox.textContent ?? '';
    const at = (s: string) => text.indexOf(s);
    expect(at('Vietsun Phú Yên')).toBeGreaterThanOrEqual(0);
    expect(at('Vietsun Phú Yên')).toBeLessThan(at('Vietsun Đà Nẵng'));
    expect(at('Vietsun Đà Nẵng')).toBeLessThan(at('Chưa gắn đơn vị cơ sở'));
    fireEvent.click(within(listbox).getByRole('option', { name: 'Việt Đức (VIET DUC)' }));
    await waitFor(() => expect(save).not.toHaveAttribute('aria-disabled'));
    fireEvent.click(save);
    await waitFor(() => expect(putBodies()).toHaveLength(2));
    expect(putBodies()[1]).toEqual({ ids: [101, 102], factoryName: 'VIET DUC' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('"Theo OSM (bỏ nhập tay)" báo trước số dòng sẽ bị bỏ và gửi factoryName null', async () => {
    signIn(EDIT);
    serve({ items: [row({ isFactoryManual: true, factoryName: 'MEKO' })], total: 1, page: 1, pageSize: 100, ...synced }, (b) => ({ rows: 3, keys: 2, removed: 0, removable: 2, dryRun: !!b.dryRun }));
    renderPage();
    expect(await screen.findByText('PO-THU-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn dòng 1' }));
    fireEvent.click(changeButton());
    const dialog = await screen.findByRole('dialog', { name: 'Đổi nhà máy SX' });
    await within(dialog).findByText(/Sẽ áp cho/);
    expect(within(dialog).queryByText(/sẽ bị bỏ khỏi Phân bổ PO/)).toBeNull();
    fireEvent.click(within(dialog).getByRole('radio', { name: /Theo OSM/ }));
    expect(within(dialog).queryByRole('combobox', { name: 'Nhà máy' })).toBeNull();
    expect(within(dialog).getByText('2 dòng nhập tay không còn trong OSM sẽ bị bỏ khỏi Phân bổ PO.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đổi nhà máy SX' }));
    await waitFor(() => expect(putBodies()).toHaveLength(2));
    expect(putBodies()[1]).toEqual({ ids: [101], factoryName: null });
  });

  it('máy chủ từ chối (dòng thuộc nhà máy của ĐVCS khác): popup nói lý do, nút lưu khóa; "Thử lại" hỏi lại máy chủ', async () => {
    signIn(EDIT);
    let calls = 0;
    serve({ items: [row()], total: 1, page: 1, pageSize: 100, ...synced }, (b) => {
      calls++;
      if (calls === 1) throw new ApiError(403, 'FACTORY_OF_OTHER_BRANCH', 'Có 1/2 dòng (cùng SO, PO, Style No, Màu với dòng đã chọn) đang thuộc nhà máy SX của đơn vị cơ sở khác.');
      return { rows: 1, keys: 1, removed: 0, removable: 0, dryRun: !!b.dryRun };
    });
    renderPage();
    expect(await screen.findByText('PO-THU-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn dòng 1' }));
    fireEvent.click(changeButton());
    const dialog = await screen.findByRole('dialog', { name: 'Đổi nhà máy SX' });
    expect(await within(dialog).findByText(/đang thuộc nhà máy SX của đơn vị cơ sở khác/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Đổi nhà máy SX' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thử lại' }));
    expect(await within(dialog).findByText(/Sẽ áp cho/)).toHaveTextContent('Sẽ áp cho 1 dòng (1 nhóm SO/PO/Style/Màu).');
    expect(putBodies().filter((b) => b.dryRun)).toHaveLength(2);
  });

  it('lần làm mới gần nhất giữ dòng vắng hoặc bị bỏ qua thì màn cảnh báo, nhờ báo quản trị kiểm OSM', async () => {
    signIn(['order.poallocation:view']);
    serve({
      items: [row()],
      total: 1,
      page: 1,
      pageSize: 100,
      ...synced,
      lastRefresh: { at: '2026-10-12T03:05:00.000Z', reason: 'SHRINK', sourceRows: 18000, previousRows: 25000, keptAbsent: 7000, maxShrinkPercent: 20 },
    });
    const { unmount } = renderPage();
    expect(await screen.findByText('PO-THU-1')).toBeInTheDocument();
    expect(screen.getByText(/giữ lại 7\.000 dòng không còn trong OSM vì số dòng giảm quá 20%\. Báo quản trị kiểm OSM\./)).toBeInTheDocument();
    unmount();
    serve({ items: [row()], total: 1, page: 1, pageSize: 100, ...synced, lastRefresh: { at: '2026-10-12T03:05:00.000Z', reason: 'EMPTY', sourceRows: 0, previousRows: 25000, keptAbsent: 0, maxShrinkPercent: 20 } });
    const second = renderPage();
    expect(await screen.findByText(/bị bỏ qua vì bảng chép OSM không có dòng nào/)).toBeInTheDocument();
    second.unmount();
    serve({ items: [row()], total: 1, page: 1, pageSize: 100, ...synced });
    renderPage();
    expect(await screen.findByText('PO-THU-1')).toBeInTheDocument();
    expect(screen.queryByText(/Báo quản trị kiểm OSM/)).toBeNull();
  });

  it('đơn vị tổng hợp A00: không có nút đổi, không có ô tích; cột Nhà máy SX Chỉ đọc thì nút khóa nói lý do', async () => {
    signIn(EDIT, {}, true);
    serve({ items: [row()], total: 1, page: 1, pageSize: 100, ...synced });
    const { unmount } = renderPage();
    expect(await screen.findByText('PO-THU-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đổi nhà máy SX' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    unmount();
    signIn(EDIT, { 'order.poallocation': { factoryName: 'READONLY' } });
    renderPage();
    expect(await screen.findByText('PO-THU-1')).toBeInTheDocument();
    expect(changeButton()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
