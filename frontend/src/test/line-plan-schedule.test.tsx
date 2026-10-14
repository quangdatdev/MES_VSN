import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Board, LinePlan, LinePlanDetail } from '../features/order/api';
import LinePlanPage from '../features/order/LinePlanPage';
import { api } from '../lib/api';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

// Chi tiết dàn chuyền (phase 5.12): số ngày nghỉ, kết thúc vào chuyền, ra chuyền, nhập kho tự tính theo lịch ĐVCS, chỉ đọc.
// Ô của lưới nhập không vẽ ở jsdom: kiểm qua thanh xem trước (ngày kết thúc giao diện tính), cảnh báo, nội dung gửi lên

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

const plan = {
  id: 7,
  planNo: 'KH-A01-000007',
  customerName: 'KHÁCH THỬ',
  styleCode: 'MA-THU-1',
  orderType: 'SXXK',
  branchCode: 'A01',
  poBuyDate: 'PO-THU',
  planQty: 1000,
  scheduledQty: 1000,
  remainingQty: 0,
  cmPrice: 2.5,
  revenue: 2500,
  syncedAt: '2026-10-10',
  startDate: '2026-12-05',
  endDate: '2026-12-09',
  shipDate: '2027-01-20',
  statusCode: 'SCHEDULED',
  lineCount: 1,
  createdAt: '2026-10-12T01:00:00.000Z',
} as unknown as LinePlan;

/**
 * Dòng lưu trước khi quản trị đặt thứ Hai 07/12 là ngày nghỉ: máy chủ đã tính kết thúc 09/12 (một Chủ nhật). Theo lịch hiện tại
 * là 10/12, nghỉ 2 ngày: giao diện báo dòng cần tính lại.
 */
const line = {
  id: 11,
  lineCode: 'A01-L12',
  lineName: 'Chuyền 12',
  qty: 1000,
  avgOutput: 300,
  startDate: '2026-12-05',
  productionDays: 4,
  offDays: 1,
  endDate: '2026-12-09',
  outStartDate: '2026-12-09',
  outEndDate: '2026-12-12',
  warehouseStartDate: '2026-12-11',
  warehouseEndDate: '2026-12-18',
  statusCode: 'PLANNED',
  editable: true,
};
const calendar = { weeklyOffDays: [7], outStartOffsetDays: 3, outEndOffsetDays: 3, warehouseStartOffsetDays: 2, warehouseEndOffsetDays: 5, days: [{ date: '2026-12-07', dayType: 'OFF' as const, name: 'Nghỉ thử' }] };
const detail = { ...plan, lines: [line], calendar } as unknown as LinePlanDetail;
const board: Board = {
  from: '2026-11-30',
  to: '2026-12-20',
  lines: [{ code: 'A01-L12', name: 'Chuyền 12', branchCode: 'A01', isActive: true }],
  bars: [{ id: 11, planId: 7, planNo: plan.planNo, lineCode: 'A01-L12', startDate: '2026-12-05', endDate: '2026-12-09', qty: 1000, avgOutput: 300, customerName: 'KHÁCH THỬ', styleCode: 'MA-THU-1', poBuyDate: 'PO-THU', shipDate: '2027-01-20', statusCode: 'PLANNED' }],
  nonWorkingDays: { A01: [{ date: '2026-12-06', name: null }, { date: '2026-12-07', name: 'Nghỉ thử' }, { date: '2026-12-13', name: null }, { date: '2026-12-20', name: null }] },
};

function serve() {
  const writes: { path: string; method: string; body: unknown }[] = [];
  vi.mocked(api).mockImplementation((async (raw: string, opts?: { method?: string; body?: unknown }) => {
    const path = String(raw ?? '');
    if (opts?.method && opts.method !== 'GET') {
      writes.push({ path, method: opts.method, body: opts.body });
      return detail;
    }
    if (path === '/me/branch-names') return [{ code: 'A01', name: 'Nhà máy 1' }];
    if (path === '/me/lines') return [{ code: 'A01-L12', name: 'Chuyền 12', branchCode: 'A01', isActive: true }];
    if (path === '/order/sales-orders/options') return { customers: [], seasons: [], orderTypes: [], orderTypeNames: {}, units: [], factories: [] };
    if (path.startsWith('/order/line-plans?')) return { items: [plan], total: 1, page: 1, pageSize: 100 };
    if (path === '/order/line-plans/7') return detail;
    if (path.startsWith('/order/line-plans/board?')) return board;
    throw new Error(`Chưa giả lập ${path}`);
  }) as unknown as typeof api);
  return { writes };
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

async function openDetail() {
  render(
    <MantineProvider theme={theme} env="test">
      <ModalsProvider>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter initialEntries={['/order/line-plan']}>
            <LinePlanPage />
          </MemoryRouter>
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>,
  );
  fireEvent.doubleClick(await screen.findByText('MA-THU-1'));
  return screen.findByRole('dialog', { name: 'Chi tiết dàn chuyền: MA-THU-1 (KH-A01-000007)' });
}

describe('Chi tiết dàn chuyền: ngày tự tính theo lịch làm việc', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
  });

  it('ngày đã lưu khác lịch hiện tại: báo, cho Lưu; chỉ gửi chuyền, số lượng, năng suất, ngày bắt đầu; thanh xem trước theo lịch mới', async () => {
    signIn(['order.lineplan:view', 'order.lineplan:update']);
    const { writes } = serve();
    const dialog = await openDetail();
    expect(await within(dialog).findByText(/1 dòng có ngày đã lưu khác cách tính theo lịch làm việc hiện tại/)).toBeInTheDocument();
    // Thanh của kế hoạch đang mở vẽ theo ngày giao diện tính: 1000/300 = 4 ngày từ thứ Bảy 05/12, nghỉ Chủ nhật và thứ Hai 07/12
    expect(await within(dialog).findByRole('button', { name: /05\/12\/2026 đến 10\/12\/2026/ })).toBeInTheDocument();
    // Ngày nghỉ của lịch ĐVCS tô trên tiêu đề bảng, kèm tên ngày lễ
    expect(within(dialog).getByTitle('07/12/2026, Nghỉ thử')).toHaveAttribute('data-off');
    expect(within(dialog).getByTitle('08/12/2026')).not.toHaveAttribute('data-off');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cách tính ngày' }));
    expect(await screen.findByText('Bắt đầu ra chuyền = bắt đầu vào chuyền + 3; kết thúc ra chuyền = kết thúc vào chuyền + 3 ngày làm việc.')).toBeInTheDocument();
    expect(screen.getByText(/Số ngày nghỉ: Chủ nhật và ngày lễ, Tết trong lịch/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({ path: '/order/line-plans/7/lines', method: 'PUT', body: { lines: [{ id: 11, lineCode: 'A01-L12', qty: 1000, avgOutput: 300, startDate: '2026-12-05' }] } });
  });

  it('chỉ được xem: lưới hiện số máy chủ đã lưu với tên cột mới, không báo tính lại', async () => {
    signIn(['order.lineplan:view']);
    serve();
    const dialog = await openDetail();
    const grid = await within(dialog).findByRole('table', { name: 'Bảng nhập liệu dàn chuyền' });
    for (const title of ['Bắt đầu vào chuyền', 'Số ngày nghỉ', 'Kết thúc vào chuyền', 'Bắt đầu ra chuyền', 'Kết thúc ra chuyền', 'Bắt đầu nhập kho', 'Kết thúc nhập kho']) {
      expect(within(grid).getByRole('columnheader', { name: new RegExp(title) })).toBeInTheDocument();
    }
    const row = within(grid).getByText('Chuyền 12').closest('tr')!;
    // Kết thúc vào chuyền và Bắt đầu ra chuyền cùng 09/12
    expect(within(row).getAllByText('09/12/2026')).toHaveLength(2);
    expect(within(row).getByText('12/12/2026')).toBeInTheDocument();
    expect(within(row).getByText('18/12/2026')).toBeInTheDocument();
    expect(within(dialog).queryByText(/khác cách tính theo lịch/)).toBeNull();
  });
});
