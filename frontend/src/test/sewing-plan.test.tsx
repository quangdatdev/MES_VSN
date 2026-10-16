import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTime } from '../components/SheetGrid';
import SalesOrderPage from '../features/order/SalesOrderPage';
import type { SalesOrder } from '../features/order/api';
import SewingPlanPage from '../features/sewing/SewingPlanPage';
import type { SewingPlanDay, SewingPlanItem } from '../features/sewing/api';
import { ALL_DEPT, changes, deliveredOf, deptOptions, matchStyle, overPlan, remainOf, revenueOf, rowsOf, saveIssue, settle, totalRow, totalsOf } from '../features/sewing/sewingPlanRules';
import { api } from '../lib/api';
import type { LineInfo } from '../lib/types';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

// jsdom không đo được kích thước: cho khung lưới cao 400px để lưới được vẽ
vi.mock('@mantine/hooks', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@mantine/hooks')>();
  return { ...mod, useElementSize: () => ({ ref: { current: null }, width: 1600, height: 400 }) };
});

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

const item = (over: Partial<SewingPlanItem> = {}): SewingPlanItem => ({
  lineId: 11,
  lineCreatedAt: '2026-10-01T02:00:00.000Z',
  planId: 5,
  branchCode: 'A01',
  lineCode: 'A01-L03',
  lineName: 'Chuyền 03',
  styleCode: '30.008930-NTSO12606.0013',
  productName: 'Áo thun',
  poBuyDate: 'SS27',
  cmPrice: 6.24,
  startDate: '2026-09-12',
  endDate: '2026-10-14',
  planQty: 1917,
  deliveredQty: 620,
  remainQty: 1297,
  linemapQty: 180,
  dayQty: 200,
  planRevenue: 1123.2,
  startTime: '07:30',
  endTime: '17:10',
  otherBefore: 420,
  otherAfter: 0,
  saved: true,
  firstOfDay: false,
  locked: false,
  sourceGone: false,
  canEdit: true,
  ...over,
});

describe('Kế hoạch may: luật tính', () => {
  it('Đã giao = các ngày trước + số đang gõ; Còn lại = Tổng kế hoạch − Đã giao; Doanh số = linemap × Giá CM (không theo ảnh)', () => {
    const [r] = rowsOf([item()]);
    expect(deliveredOf(r)).toBe(620);
    expect(remainOf(r)).toBe(1297);
    expect(revenueOf(r)).toBe(1123.2);
    const typed = { ...r, dayQty: 250, linemapQty: 100 };
    expect(deliveredOf(typed)).toBe(670);
    expect(remainOf(typed)).toBe(1247);
    expect(revenueOf(typed)).toBe(624);
    // Cột bị Che: không tự tính, giữ "***" của máy chủ
    const [m] = rowsOf([item({ cmPrice: '***', planRevenue: '***', planQty: '***', remainQty: '***' })]);
    expect(revenueOf(m)).toBe('***');
    expect(remainOf(m)).toBe('***');
  });

  it('không giao vượt Tổng kế hoạch (cả ngày sau đã lập); chỉ chặn khi số tăng; thân lệnh chỉ ô đã sửa', () => {
    const [r] = rowsOf([item({ otherBefore: 1700, otherAfter: 17, dayQty: 200, planQty: 1917 })]);
    expect(overPlan(r)).toBe(false);
    expect(overPlan({ ...r, dayQty: 201 })).toBe(true);
    // Dòng đã vượt từ trước: giảm vẫn được
    const [old] = rowsOf([item({ otherBefore: 1800, otherAfter: 0, dayQty: 200, planQty: 1917 })]);
    expect(overPlan({ ...old, dayQty: 150 })).toBe(false);
    expect(saveIssue([r])).toBe('Chưa có thay đổi nào');
    expect(saveIssue([{ ...r, dayQty: 201 }])).toMatch(/vượt Tổng kế hoạch/);
    expect(saveIssue([{ ...r, dayQty: 1.5 }])).toMatch(/số nguyên/);
    expect(saveIssue([{ ...r, startTime: '7h3x' }])).toMatch(/hh:mm/);
    expect(saveIssue([{ ...r, startTime: '17:30', endTime: '08:00' }])).toBe('Đến giờ phải sau Từ giờ');
    expect(saveIssue([{ ...r, dayQty: 150 }])).toBeNull();
    expect(changes([{ ...r, dayQty: 150, endTime: '16:00' }])).toEqual([{ lineId: 11, lineCreatedAt: '2026-10-01T02:00:00.000Z', dayQty: 150, endTime: '16:00' }]);
    // Dòng không sửa được, dòng Tổng: không gửi
    const [ro] = rowsOf([item({ canEdit: false })]);
    expect(changes([{ ...ro, dayQty: 1 }, totalRow()])).toEqual([]);
  });

  it('dòng Tổng cộng các cột số, không cộng Giá CM; lưới mới bỏ dòng Tổng, không cho dán vào dòng khóa', () => {
    const rows = rowsOf([item(), item({ lineId: 12, styleCode: 'MA-02', planQty: 100, otherBefore: 0, dayQty: 50, linemapQty: 40, planRevenue: null, cmPrice: 1 })]);
    expect(totalsOf([...rows, totalRow()])).toMatchObject({ count: 2, planQty: 2017, deliveredQty: 670, remainQty: 1347, linemapQty: 220, dayQty: 250, planRevenue: 1163.2 });
    const locked = rowsOf([item({ lineId: 13, canEdit: false, dayQty: 5 })])[0];
    const next = settle([{ ...rows[0], dayQty: 1 }, { ...locked, dayQty: 999 }, totalRow()], [rows[0], locked]);
    expect(next.map((r) => [r.key, r.dayQty])).toEqual([
      ['11', 1],
      ['13', 5],
    ]);
    // Xóa ô giờ: về giờ mặc định
    expect(settle([{ ...rows[0], startTime: null }], [rows[0]])[0].startTime).toBe('07:30');
    // Ô Danh sách mã hàng: lọc theo mã hàng, tên sản phẩm; dòng Tổng luôn giữ
    expect(rows.filter((r) => matchStyle(r, 'ma-02')).map((r) => r.key)).toEqual(['12']);
    expect(matchStyle(totalRow(), 'không khớp')).toBe(true);
    expect(totalsOf(rows.filter((r) => matchStyle(r, 'MA-02')))).toMatchObject({ count: 1, planQty: 100 });
  });

  it('ô giờ đọc nhiều cách gõ; chữ lạ giữ nguyên để tô đỏ', () => {
    expect(parseTime('7:30')).toBe('07:30');
    expect(parseTime('7h30')).toBe('07:30');
    expect(parseTime('7h')).toBe('07:00');
    expect(parseTime('1710')).toBe('17:10');
    expect(parseTime('730')).toBe('07:30');
    expect(parseTime('17.10')).toBe('17:10');
    expect(parseTime('25:00')).toBe('25:00');
    expect(parseTime('abc')).toBe('abc');
    expect(parseTime('  ')).toBeNull();
  });

  it('ô Đơn vị phòng ban: cây sơ đồ tổ chức tới chuyền, mỗi nhóm có dòng "Cả <bộ phận>", dòng đầu là mọi chuyền', () => {
    const lines: LineInfo[] = [
      { code: 'A01-L01', name: 'Chuyền 01', branchCode: 'A01', workshopCode: 'A01-X01', workshopName: 'Xưởng 01', ancestors: [{ code: 'VDC', name: 'VDC' }, { code: 'A01-X01', name: 'Xưởng 01' }] },
      { code: 'A01-L02', name: 'Chuyền 02', branchCode: 'A01', workshopCode: 'A01-X01', workshopName: 'Xưởng 01', ancestors: [{ code: 'VDC', name: 'VDC' }, { code: 'A01-X01', name: 'Xưởng 01' }] },
      { code: 'A01-L07', name: 'Chuyền 07', branchCode: 'A01', workshopCode: 'A01-X02', workshopName: 'Xưởng 02', ancestors: [{ code: 'VDC', name: 'VDC' }, { code: 'A01-X02', name: 'Xưởng 02' }] },
    ];
    expect(deptOptions(lines).map((o) => [o.value, o.label, (o.groups ?? []).join(' › ')])).toEqual([
      [ALL_DEPT, 'Mọi chuyền của đơn vị cơ sở', ''],
      ['VDC', 'Cả VDC', 'VDC'],
      ['A01-X01', 'Cả Xưởng 01', 'VDC › Xưởng 01'],
      ['A01-L01', 'Chuyền 01', 'VDC › Xưởng 01'],
      ['A01-L02', 'Chuyền 02', 'VDC › Xưởng 01'],
      ['A01-X02', 'Cả Xưởng 02', 'VDC › Xưởng 02'],
      ['A01-L07', 'Chuyền 07', 'VDC › Xưởng 02'],
    ]);
  });
});

function signIn(permissions: string[], branch = { code: 'A01', name: 'Nhà máy 1', isAggregate: false }, fieldPolicies: Record<string, Record<string, 'HIDDEN' | 'MASKED' | 'READONLY' | 'EDITABLE'>> = {}) {
  useSession.getState().reset('anonymous');
  useSession.getState().set({
    status: 'ready',
    user: { id: 9, username: 'kehoach.a', fullName: 'Kế hoạch' },
    branch,
    roles: [],
    permissions: new Set(permissions),
    fieldPolicies,
  });
}

function serve(routes: (path: string, opts?: { method?: string; body?: unknown }) => unknown) {
  vi.mocked(api).mockImplementation((async (path: string, opts?: { method?: string; body?: unknown }) => routes(path ?? '', opts)) as unknown as typeof api);
}

function renderPage(ui: ReactNode, path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MantineProvider theme={theme} env="test">
      <ModalsProvider>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>,
  );
}

const dayOf = (over: Partial<SewingPlanDay> = {}, items = [item(), item({ lineId: 12, lineCode: 'A01-L05', lineName: 'Chuyền 05', styleCode: 'MA-02', planQty: 100, otherBefore: 0, dayQty: 50, linemapQty: null })]): SewingPlanDay => ({
  date: '2026-10-16',
  today: '2026-10-16',
  editableDay: true,
  lines: [
    { branchCode: 'A01', lineCode: 'A01-L03', lineName: 'Chuyền 03', locked: false, lockedAt: null, lockerName: null, version: '1', canEdit: true },
    { branchCode: 'A01', lineCode: 'A01-L05', lineName: 'Chuyền 05', locked: false, lockedAt: null, lockerName: null, version: '0', canEdit: true },
  ],
  items,
  ...over,
});

describe('Kế hoạch may: màn hình', () => {
  beforeEach(() => vi.mocked(api).mockReset());

  it('lưới theo ảnh: các cột, dòng Tổng (n); chưa đổi gì thì Cập nhật khóa; Chốt hỏi lại rồi gửi đúng ngày, đơn vị', async () => {
    signIn(['sewing.plan:view', 'sewing.plan:update', 'sewing.plan:create']);
    const sent: { path: string; body: unknown }[] = [];
    serve((path, opts) => {
      if (path.startsWith('/sewing/plan?')) return dayOf();
      if (opts?.method === 'POST') {
        sent.push({ path, body: opts.body });
        return { locked: 2 };
      }
      return [];
    });
    // Ô của lưới bảng tính không vẽ ở jsdom: nội dung ô kiểm ở các bài luật tính bên trên
    renderPage(<SewingPlanPage />, '/sewing/plan?date=2026-10-16&dept=A01-X01');
    expect(await screen.findByText('Chưa chốt')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Kế hoạch may theo chuyền, mã hàng' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cập nhật/ })).toHaveAttribute('data-disabled');
    expect(vi.mocked(api).mock.calls.some((c) => String(c[0]) === '/sewing/plan?date=2026-10-16&dept=A01-X01')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Chốt' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Khóa kế hoạch của 2 chuyền/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Chốt' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ path: '/sewing/plan/lock', body: { date: '2026-10-16', dept: 'A01-X01', versions: [{ line: 'A01-L03', version: '1' }, { line: 'A01-L05', version: '0' }] } });
  });

  it('ngày đã chốt: dải trạng thái nêu người chốt, Chốt khóa, Hủy chốt mở; ngày đã qua chỉ xem', async () => {
    signIn(['sewing.plan:view', 'sewing.plan:update']);
    const locked = dayOf({
      lines: dayOf().lines.map((l) => ({ ...l, locked: true, lockedAt: '2026-10-16T03:00:00.000Z', lockerName: 'Lê Thị Mai' })),
      items: dayOf().items.map((i) => ({ ...i, locked: true, canEdit: false })),
    });
    serve((path) => (path.startsWith('/sewing/plan?') ? locked : []));
    const first = renderPage(<SewingPlanPage />, '/sewing/plan?date=2026-10-16');
    expect(await screen.findByText('Đã chốt')).toBeInTheDocument();
    expect(screen.getByText(/bởi Lê Thị Mai/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chốt' })).toHaveAttribute('data-disabled');
    expect(screen.getByRole('button', { name: 'Hủy chốt' })).not.toHaveAttribute('data-disabled');
    first.unmount();

    serve((path) => (path.startsWith('/sewing/plan?') ? dayOf({ date: '2026-10-15', editableDay: false, items: dayOf().items.map((i) => ({ ...i, canEdit: false })) }) : []));
    renderPage(<SewingPlanPage />, '/sewing/plan?date=2026-10-15');
    expect(await screen.findByText(/Ngày đã qua, chỉ xem/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Thêm dòng/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Hủy chốt' })).toHaveAttribute('data-disabled');
  });

  it('chưa có quyền Thêm: chuyền chưa lập kế hoạch trong ngày (phiên bản 0) thì Chốt khóa kèm lý do', async () => {
    signIn(['sewing.plan:view', 'sewing.plan:update']);
    serve((path) => (path.startsWith('/sewing/plan?') ? dayOf() : []));
    renderPage(<SewingPlanPage />, '/sewing/plan?date=2026-10-16');
    expect(await screen.findByText('Chưa chốt')).toBeInTheDocument();
    const lock = screen.getByRole('button', { name: 'Chốt' });
    expect(lock).toHaveAttribute('data-disabled');
    fireEvent.focus(lock);
    expect(await screen.findByText(/chốt lần đầu cần quyền Thêm/)).toBeInTheDocument();
  });

  it('chỉ có quyền Xem: không Thêm dòng; Chốt, Cập nhật khóa kèm lý do; cột bị Ẩn báo ở đầu màn', async () => {
    signIn(['sewing.plan:view'], undefined, { 'sewing.plan': { cmPrice: 'HIDDEN', planRevenue: 'HIDDEN' } });
    serve((path) => (path.startsWith('/sewing/plan?') ? dayOf({ editableDay: false, items: dayOf().items.map((i) => ({ ...i, canEdit: false })) }) : []));
    renderPage(<SewingPlanPage />, '/sewing/plan?date=2026-10-16');
    expect(await screen.findByText('Chưa chốt')).toBeInTheDocument();
    expect(screen.getByText('2 cột ẩn')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Thêm dòng/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Chốt' })).toHaveAttribute('data-disabled');
    expect(screen.getByRole('button', { name: /Cập nhật/ })).toHaveAttribute('data-disabled');
  });
});

describe('Thông tin đơn hàng: sửa riêng Giá CM (quyết định 14.3)', () => {
  beforeEach(() => vi.mocked(api).mockReset());

  it('đơn của ĐVCS khác có kế hoạch ở ĐVCS này: Sửa mở popup chỉ có ô Giá CM, lưu qua /cm-price', async () => {
    signIn(['order.allocation:view', 'order.allocation:update'], undefined, { 'order.allocation': { cmPrice: 'EDITABLE' } });
    const order: SalesOrder = {
      id: 77,
      orderNo: 'DH-A02-000077',
      customerName: 'KHÁCH',
      styleCode: 'MA-77',
      season: null,
      orderType: null,
      productName: 'Áo',
      staffName: null,
      qty: 1000,
      unitName: 'Chiếc',
      cmPrice: 2.5,
      syncedAt: null,
      shipDate: '2027-01-01',
      statusCode: 'NEW',
      branchCode: 'A02',
      cmPriceEditable: true,
    };
    const puts: { path: string; body: unknown }[] = [];
    serve((path, opts) => {
      if (opts?.method === 'PUT') {
        puts.push({ path, body: opts.body });
        return { ...order, cmPrice: 3 };
      }
      if (path.startsWith('/order/sales-orders?')) return { items: [order], total: 1, page: 1, pageSize: 100 };
      if (path.startsWith('/order/sales-orders/options')) return { customers: [], seasons: [], orderTypes: [], orderTypeNames: {}, units: [], factories: [] };
      return [];
    });
    renderPage(<SalesOrderPage />, '/order/info');
    fireEvent.click(await screen.findByText('MA-77'));
    const edit = screen.getByRole('button', { name: /Sửa/ });
    expect(edit).not.toHaveAttribute('data-disabled');
    fireEvent.click(edit);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/chỉ sửa được Giá CM/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Khách hàng/)).toHaveAttribute('readonly');
    const price = within(dialog).getByLabelText('Giá CM (USD)');
    expect(price).not.toHaveAttribute('readonly');
    fireEvent.change(price, { target: { value: '3' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ path: '/order/sales-orders/77/cm-price', body: { cmPrice: 3 } });
  });
});
