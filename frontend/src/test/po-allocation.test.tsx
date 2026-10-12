import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoAllocation, PoAllocationPage as Page } from '../features/order/api';
import PoAllocationPage from '../features/order/PoAllocationPage';
import { api } from '../lib/api';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

const row = (over: Partial<PoAllocation> = {}): PoAllocation => ({
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
  ...over,
});

function serve(page: Page) {
  vi.mocked(api).mockImplementation((async (raw: string) => {
    const path = String(raw ?? '');
    if (path === '/me/branch-names') return [{ code: 'A01', name: 'Vietsun Phú Yên' }];
    if (path === '/order/po-allocations/options') return { brands: ['WITT'], seasons: ['154'] };
    if (path.startsWith('/order/po-allocations?')) return page;
    throw new Error(`Chưa giả lập ${path}`);
  }) as unknown as typeof api);
}
const listCalls = () => vi.mocked(api).mock.calls.map((c) => String(c[0])).filter((p) => p.startsWith('/order/po-allocations?'));

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

function signIn(permissions: string[], fieldPolicies: Record<string, Record<string, 'HIDDEN' | 'MASKED' | 'READONLY' | 'EDITABLE'>> = {}) {
  useSession.getState().reset('anonymous');
  useSession.getState().set({
    status: 'ready',
    user: { id: 9, username: 'kehoach.a', fullName: 'Kế hoạch' },
    branch: { code: 'A01', name: 'Nhà máy 1', isAggregate: false },
    roles: [],
    permissions: new Set(permissions),
    fieldPolicies,
  });
}

describe('Phân bổ PO', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
  });

  it('hiện đủ cột của OSM, tên Đơn vị cơ sở, "–" khi nhà máy chưa gắn ĐVCS; mặc định ETD-Revised mới lên trước', async () => {
    signIn(['order.poallocation:view']);
    serve({ items: [row(), row({ rowNo: 2, po: 'PO-THU-2', factoryName: 'MEKO', branchCode: null })], total: 2, page: 1, pageSize: 100, syncedAt: '2026-10-12T03:00:00.000Z', sourceActive: true });
    renderPage();
    expect(await screen.findByText('PO-THU-2')).toBeInTheDocument();
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
    for (const title of ['Brand', 'Season', 'PO', 'SO', 'Ship mode', 'Style name', 'Style No', 'Màu', 'ETD-Actual', 'ETD-Revised', 'Nhà máy SX', 'Đơn vị cơ sở']) {
      expect(heads.some((h) => h.includes(title))).toBe(true);
    }
    const rows = screen.getAllByRole('row').slice(1);
    expect(await within(rows[0]).findByText('Vietsun Phú Yên')).toHaveAttribute('title', 'A01');
    expect(within(rows[1]).getAllByText('–').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/^Đồng bộ OSM lúc 12\/10\/2026/)).toBeInTheDocument();
    expect(listCalls()[0]).toContain('sort=etdRevised%3Adesc');
    // Chỉ xem: không có nút thêm, sửa, xóa; không có quyền xuất thì không có nút Xuất file
    expect(screen.queryByRole('button', { name: /Thêm|Sửa|Xóa$|Xuất file/ })).toBeNull();
  });

  it('chưa đồng bộ nguồn OSM: chỉ cách có dữ liệu, có link Đồng bộ dữ liệu khi được chạy đồng bộ', async () => {
    serve({ items: [], total: 0, page: 1, pageSize: 100, syncedAt: null, sourceActive: true });
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
    serve({ items: [], total: 0, page: 1, pageSize: 100, syncedAt: null, sourceActive: false });
    signIn(['order.poallocation:view', 'admin.sync:update']);
    renderPage();
    expect(await screen.findByText(/Máy chủ chưa được cấu hình để lấy dữ liệu này từ OSM/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Đồng bộ dữ liệu' })).toBeNull();
  });

  it('cột bị Ẩn thì không có cột, không có ô lọc; Nhà máy SX bị Che thì ĐVCS cũng bị che, không lọc được', async () => {
    signIn(['order.poallocation:view', 'order.poallocation:export'], { 'order.poallocation': { factoryName: 'MASKED', brand: 'HIDDEN' } });
    const r = row({ branchCode: '***', factoryName: '***' });
    delete (r as Partial<PoAllocation>).brand;
    serve({ items: [r], total: 1, page: 1, pageSize: 100, syncedAt: '2026-10-12T03:00:00.000Z', sourceActive: true });
    renderPage();
    expect(await screen.findByText('PO-THU-1')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /^Brand/ })).toBeNull();
    expect(screen.queryByText('Brand', { selector: 'label' })).toBeNull();
    expect(screen.getByText('Season', { selector: 'label' })).toBeInTheDocument();
    expect(screen.getAllByTitle('Bị che theo phân quyền của bạn')).toHaveLength(2);
    expect(screen.getByRole('columnheader', { name: /Đơn vị cơ sở/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lọc theo cột Đơn vị cơ sở' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Lọc theo cột Màu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xuất file/ })).toBeInTheDocument();
  });

  it('Nhà máy SX bị Ẩn thì không có cả cột Đơn vị cơ sở', async () => {
    signIn(['order.poallocation:view'], { 'order.poallocation': { factoryName: 'HIDDEN' } });
    const r = row();
    delete (r as Partial<PoAllocation>).factoryName;
    delete (r as Partial<PoAllocation>).branchCode;
    serve({ items: [r], total: 1, page: 1, pageSize: 100, syncedAt: '2026-10-12T03:00:00.000Z', sourceActive: true });
    renderPage();
    expect(await screen.findByText('PO-THU-1')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Nhà máy SX/ })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /Đơn vị cơ sở/ })).toBeNull();
    expect(screen.getByRole('button', { name: /2 cột ẩn/ })).toBeInTheDocument();
  });

  it('ETD-Revised bị Ẩn thì mặc định xếp theo ETD-Actual, như máy chủ', async () => {
    signIn(['order.poallocation:view'], { 'order.poallocation': { etdRevised: 'HIDDEN' } });
    serve({ items: [row()], total: 1, page: 1, pageSize: 100, syncedAt: '2026-10-12T03:00:00.000Z', sourceActive: true });
    renderPage();
    expect(await screen.findByText('PO-THU-1')).toBeInTheDocument();
    expect(listCalls()[0]).toContain('sort=etdActual%3Adesc');
  });
});
