import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CandidatePo, PlanLine, ShipmentPlan, ShipmentPlanDetail } from '../features/order/api';
import ShipmentPage from '../features/order/ShipmentPage';
import { api } from '../lib/api';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

// Lưới nhập thật cần kích thước khung (jsdom không có): giả bằng danh sách chữ để đọc Số lượng gốc, SL KHXH từng màu cỡ
vi.mock('../components/SheetGrid', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../components/SheetGrid')>();
  return {
    ...mod,
    SheetGrid: ({ value }: { value: { colorName: string; sizeName: string; originalQty: number; planQty: number | null }[] }) => (
      <ul aria-label="Lưới SL KHXH">
        {value.map((r) => (
          <li key={`${r.colorName}/${r.sizeName}`}>{`${r.colorName}/${r.sizeName}: gốc ${r.originalQty}, KHXH ${r.planQty ?? 'trống'}`}</li>
        ))}
      </ul>
    ),
  };
});

// Nút "Chọn mã hàng" của popup Sửa (phase 5.17): thêm PO chưa lập kế hoạch, Số lượng gốc cộng dồn, SL KHXH giữ nguyên
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
  planQty: 12,
  cutQty: 0,
  sewnQty: 0,
  endlineQty: 0,
  finishedQty: 0,
  statusCode: 'PLANNED',
  createdAt: '2026-10-12T01:00:00.000Z',
} as unknown as ShipmentPlan;

const line = (over: Partial<PlanLine> = {}): PlanLine => ({ colorName: 'Red', sizeName: '36', originalQty: 30, plannedQty: 0, remainingQty: 30, planQty: 12, ...over });
const freePo: CandidatePo = { id: 5, poCode: 'PO-THU-5', poNumber: '4500005', qty: 20, destination: 'DE', syncedAt: null, shipDate: '2027-06-30', statusCode: 'DRAFT' } as CandidatePo;

function serve() {
  vi.mocked(api).mockImplementation((async (raw: string, opts?: { method?: string }) => {
    const path = String(raw ?? '');
    if (path === '/me/branch-names') return [{ code: 'A01', name: 'Vietsun Phú Yên' }];
    if (path === '/order/sales-orders/options') return { customers: [], seasons: [], orderTypes: [], orderTypeNames: {}, units: [], factories: [] };
    if (path.startsWith('/order/shipment-plans?')) return { items: [plan], total: 1, page: 1, pageSize: 100 };
    if (path === '/order/shipment-plans/7' && opts?.method === 'PUT') return plan;
    if (path === '/order/shipment-plans/7') return { ...plan, poIds: [1], lines: [line()] } satisfies ShipmentPlanDetail;
    if (path === '/order/shipment-plans/7/candidate-pos') return [freePo];
    if (path.startsWith('/order/shipment-plans/draft?')) {
      const q = new URLSearchParams(path.split('?')[1]);
      // Máy chủ lấy PO của kế hoạch; PO 5 thêm Red/36 20 và một màu cỡ mới Blue/36 20
      return q.get('addPoIds') === '5'
        ? [line({ originalQty: 50, remainingQty: 50 }), line({ colorName: 'Blue', originalQty: 20, remainingQty: 20, planQty: 0 })]
        : [line()];
    }
    throw new Error(`Chưa giả lập ${path}`);
  }) as unknown as typeof api);
}
const calls = () => vi.mocked(api).mock.calls.map((c) => [String(c[0]), c[1]] as const);

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

function signIn(permissions: string[]) {
  useSession.getState().reset('anonymous');
  useSession.getState().set({
    status: 'ready',
    user: { id: 9, username: 'kehoach.a', fullName: 'Kế hoạch' },
    branch: { code: 'A01', name: 'Nhà máy 1', isAggregate: false },
    roles: [],
    permissions: new Set(permissions),
    fieldPolicies: {},
  });
}

async function openEdit() {
  fireEvent.click(await screen.findByText('KH-A01-000007'));
  fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
  return screen.findByRole('dialog', { name: 'Sửa kế hoạch KH-A01-000007' });
}

describe('Kế hoạch xuất hàng: thêm PO khi sửa', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
  });

  it('Chọn mã hàng chỉ có PO chưa lập kế hoạch; thêm thì Số lượng gốc cộng dồn, SL KHXH giữ nguyên, Lưu gửi PO thêm kèm lưới', async () => {
    signIn(['order.shipment:view', 'order.shipment:update', 'order.po:view']);
    serve();
    renderPage();
    const dialog = await openEdit();
    expect(await within(dialog).findByText('Red/36: gốc 30, KHXH 12')).toBeInTheDocument();
    expect(within(dialog).getByText('1 PO của kế hoạch')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Chọn mã hàng' }));
    const picker = await screen.findByRole('dialog', { name: 'Thêm PO vào kế hoạch KH-A01-000007' });
    expect(within(picker).getByDisplayValue('MA-THU-1')).toBeInTheDocument();
    const confirm = within(picker).getByRole('button', { name: 'Xác nhận' });
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(await within(picker).findByText('4500005'));
    expect(confirm).not.toHaveAttribute('aria-disabled');
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Thêm PO vào kế hoạch KH-A01-000007' })).not.toBeInTheDocument());

    expect(await within(dialog).findByText('Red/36: gốc 50, KHXH 12')).toBeInTheDocument();
    expect(within(dialog).getByText('Blue/36: gốc 20, KHXH trống')).toBeInTheDocument();
    expect(within(dialog).getByText('1 PO của kế hoạch + 1 PO thêm')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(calls().some(([p, o]) => p === '/order/shipment-plans/7' && (o as { method?: string })?.method === 'PUT')).toBe(true));
    const put = calls().find(([p, o]) => p === '/order/shipment-plans/7' && (o as { method?: string })?.method === 'PUT')!;
    expect((put[1] as { body: { addPoIds: number[]; lines: unknown[] } }).body).toMatchObject({
      addPoIds: [5],
      basePoIds: [1],
      lines: [
        { colorName: 'Red', sizeName: '36', planQty: 12 },
        { colorName: 'Blue', sizeName: '36', planQty: 0 },
      ],
    });
  });

  it('Bỏ PO vừa thêm thì lưới về như cũ, Lưu khóa vì chưa có thay đổi', async () => {
    signIn(['order.shipment:view', 'order.shipment:update', 'order.po:view']);
    serve();
    renderPage();
    const dialog = await openEdit();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Chọn mã hàng' }));
    const picker = await screen.findByRole('dialog', { name: 'Thêm PO vào kế hoạch KH-A01-000007' });
    fireEvent.click(await within(picker).findByText('4500005'));
    fireEvent.click(within(picker).getByRole('button', { name: 'Xác nhận' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Bỏ PO vừa thêm' }));
    expect(await within(dialog).findByText('Red/36: gốc 30, KHXH 12')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Lưu thay đổi' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('không có quyền xem PO ở Cập nhật tỷ lệ cắt thì nút Chọn mã hàng khóa, không gọi API PO', async () => {
    signIn(['order.shipment:view', 'order.shipment:update']);
    serve();
    renderPage();
    const dialog = await openEdit();
    await within(dialog).findByText('Red/36: gốc 30, KHXH 12');
    const button = within(dialog).getByRole('button', { name: 'Chọn mã hàng' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(screen.queryByRole('dialog', { name: 'Thêm PO vào kế hoạch KH-A01-000007' })).not.toBeInTheDocument();
    expect(calls().some(([p]) => p.endsWith('/candidate-pos'))).toBe(false);
  });
});
