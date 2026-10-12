import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanPo, PlanPoList, ShipmentPlan } from '../features/order/api';
import ShipmentPage from '../features/order/ShipmentPage';
import { api } from '../lib/api';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

// Khung "PO của kế hoạch" dưới danh sách Kế hoạch xuất hàng (task 5.9.14), dữ liệu giả
const plan = {
  id: 7,
  planNo: 'KH-A01-000007',
  salesOrderId: 3,
  customerName: 'KHÁCH THỬ',
  styleCode: 'MA-THU-1',
  productName: 'Áo thử',
  poBuyDate: 'PO-THU / 30-06',
  branchCode: 'A01',
  syncedAt: '2026-10-10',
  shipDate: '2027-06-30',
  plannerName: 'Kế hoạch',
  planQty: 900,
  cutQty: 0,
  sewnQty: 0,
  endlineQty: 0,
  finishedQty: 0,
  statusCode: 'PLANNED',
  createdAt: '2026-10-12T01:00:00.000Z',
} as unknown as ShipmentPlan;

const po = (over: Partial<PlanPo> = {}): PlanPo => ({
  id: 1,
  poCode: 'PO-THU-1',
  poNumber: '4500001',
  destination: 'DE',
  shipDate: '2027-06-30',
  qty: 3000,
  statusCode: 'DRAFT',
  confirmedAt: null,
  confirmedQty: 0,
  unconfirmedQty: 3000,
  ...over,
});
const confirmed = po({ id: 2, poCode: 'PO-THU-2', poNumber: '4500002', qty: 200, statusCode: 'CONFIRMED', confirmedAt: '2026-10-10T03:00:00.000Z', confirmedQty: 200, unconfirmedQty: 0 });

function serve(pos: PlanPoList) {
  vi.mocked(api).mockImplementation((async (raw: string) => {
    const path = String(raw ?? '');
    if (path === '/me/branch-names') return [{ code: 'A01', name: 'Vietsun Phú Yên' }];
    if (path === '/order/sales-orders/options') return { customers: [], seasons: [], orderTypes: [], orderTypeNames: {}, units: [], factories: [] };
    if (path.startsWith('/order/shipment-plans?')) return { items: [plan], total: 1, page: 1, pageSize: 100 };
    if (path === '/order/shipment-plans/7/pos') return pos;
    throw new Error(`Chưa giả lập ${path}`);
  }) as unknown as typeof api);
}
const posCalls = () => vi.mocked(api).mock.calls.map((c) => String(c[0])).filter((p) => p.endsWith('/pos'));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider theme={theme} env="test">
      <ModalsProvider>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={['/order/shipment']}>
            <ShipmentPage />
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

const pane = () => screen.getByRole('table', { name: 'PO của kế hoạch' });
async function pickPlan() {
  fireEvent.click(await screen.findByText('KH-A01-000007'));
}

describe('Kế hoạch xuất hàng: PO của kế hoạch', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
  });

  it('chưa chọn kế hoạch thì hướng dẫn; chọn thì hiện PO, tổng đã xác nhận, chưa xác nhận và số kế hoạch lấy', async () => {
    signIn(['order.shipment:view', 'order.po:view']);
    serve({ items: [confirmed, po()], hiddenCount: 0 });
    renderPage();
    expect(await screen.findByText('Bấm một kế hoạch ở lưới trên để xem PO.')).toBeInTheDocument();
    expect(posCalls()).toEqual([]);
    await pickPlan();
    expect(await within(pane()).findByText('4500002')).toBeInTheDocument();
    expect(posCalls()).toEqual(['/order/shipment-plans/7/pos']);
    expect(screen.getByText('Đã xác nhận: 200 (1 PO)')).toBeInTheDocument();
    expect(screen.getByText('Chưa xác nhận: 3.000 (1 PO)')).toBeInTheDocument();
    expect(within(pane()).getAllByText('Đã xác nhận')).toHaveLength(1);
    expect(screen.getByText(/Số lượng là của cả PO; kế hoạch này lấy/)).toHaveTextContent('Tổng 2 PO: 3.200. Số lượng là của cả PO; kế hoạch này lấy 900.');
  });

  it('không có quyền xem PO: báo lý do, không gọi API', async () => {
    signIn(['order.shipment:view']);
    serve({ items: [], hiddenCount: 0 });
    renderPage();
    await pickPlan();
    expect(await screen.findByText('Bạn không được xem PO ở màn Cập nhật tỷ lệ cắt nên không thấy trạng thái xác nhận.')).toBeInTheDocument();
    expect(posCalls()).toEqual([]);
  });

  it('số lượng bị Che: không có tổng số lượng, chỉ đếm PO; Trạng thái bị Ẩn: bỏ cột suy ra và phần tóm tắt', async () => {
    signIn(['order.shipment:view', 'order.po:view'], { 'order.po': { qty: 'MASKED' } });
    serve({ items: [{ ...confirmed, qty: '***', confirmedQty: '***', unconfirmedQty: '***' }, { ...po(), qty: '***', confirmedQty: '***', unconfirmedQty: '***' }], hiddenCount: 0 });
    const first = renderPage();
    await pickPlan();
    expect(await screen.findByText('Đã xác nhận: 1 PO')).toBeInTheDocument();
    expect(screen.getByText('Chưa xác nhận: 1 PO')).toBeInTheDocument();
    expect(screen.getByText(/^2 PO\./)).toBeInTheDocument();
    first.unmount();

    vi.mocked(api).mockReset();
    signIn(['order.shipment:view', 'order.po:view'], { 'order.po': { statusCode: 'HIDDEN' } });
    const strip = ({ statusCode: _s, confirmedAt: _a, confirmedQty: _c, unconfirmedQty: _u, ...rest }: PlanPo) => rest;
    serve({ items: [strip(confirmed), strip(po())], hiddenCount: 0 });
    renderPage();
    await pickPlan();
    expect(await within(pane()).findByText('4500002')).toBeInTheDocument();
    const headers = within(pane()).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers.some((h) => h?.includes('Ngày xác nhận') || h?.includes('SL đã xác nhận') || h?.includes('Trạng thái'))).toBe(false);
    expect(screen.queryByText(/^Đã xác nhận:/)).not.toBeInTheDocument();
  });

  it('Trạng thái bị Che: không có phần tóm tắt đã xác nhận / chưa xác nhận, vẫn có tổng số lượng của cả PO', async () => {
    signIn(['order.shipment:view', 'order.po:view'], { 'order.po': { statusCode: 'MASKED' } });
    const masked = (p: PlanPo): PlanPo => ({ ...p, statusCode: '***', confirmedAt: '***', confirmedQty: '***', unconfirmedQty: '***' });
    serve({ items: [masked(confirmed), masked(po())], hiddenCount: 0 });
    renderPage();
    await pickPlan();
    expect(await screen.findByText(/^Tổng 2 PO:/)).toHaveTextContent('Tổng 2 PO: 3.200. Số lượng là của cả PO; kế hoạch này lấy 900.');
    expect(screen.queryByText(/^Đã xác nhận:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Chưa xác nhận:/)).not.toBeInTheDocument();
  });

  it('tải lỗi: báo lỗi, bấm Thử lại thì tải lại', async () => {
    signIn(['order.shipment:view', 'order.po:view']);
    let fail = true;
    serve({ items: [confirmed], hiddenCount: 0 });
    const ok = vi.mocked(api).getMockImplementation()!;
    vi.mocked(api).mockImplementation((async (raw: string, ...rest: unknown[]) => {
      if (String(raw).endsWith('/pos') && fail) throw new Error('mạng lỗi');
      return (ok as (...a: unknown[]) => unknown)(raw, ...rest);
    }) as unknown as typeof api);
    renderPage();
    await pickPlan();
    expect(await screen.findByText('Không tải được PO của kế hoạch.')).toBeInTheDocument();
    fail = false;
    fireEvent.click(within(pane()).getByRole('button', { name: 'Thử lại' }));
    expect(await within(pane()).findByText('4500002')).toBeInTheDocument();
    expect(posCalls()).toHaveLength(2);
  });

  it('PO ngoài phạm vi được xem: báo số PO không được xem', async () => {
    signIn(['order.shipment:view', 'order.po:view']);
    serve({ items: [po()], hiddenCount: 2 });
    const first = renderPage();
    await pickPlan();
    expect(await screen.findByText(/Còn 2 PO bạn không được xem\./)).toBeInTheDocument();
    first.unmount();

    vi.mocked(api).mockReset();
    serve({ items: [], hiddenCount: 3 });
    renderPage();
    await pickPlan();
    expect(await screen.findByText('Bạn không được xem 3 PO của kế hoạch này.')).toBeInTheDocument();
  });
});
