import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrepStepsPane } from '../features/admin/PrepStepsPane';
import PrepPlanPage, { afterSave, cellKey, draftItems, liveStatus, withEdits, withoutCells, withoutSaved, type Draft } from '../features/sewing/PrepPlanPage';
import type { PrepPage, PrepStep } from '../features/sewing/api';
import { api } from '../lib/api';
import { isoWeekOf, mondayOf, sundayOf, weekMonday, weeksInYear } from '../lib/weeks';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

const STEPS: PrepStep[] = [
  { id: 1, code: 'CB01', name: 'Họp đánh giá rủi ro', description: null, planDays: 0, performer: 'P.Công nghệ', dataSource: 'Ngày họp', sortOrder: 10, isActive: true },
  { id: 2, code: 'CB02', name: 'Ngày gửi mẫu PP', description: null, planDays: 2, performer: 'NV Kỹ thuật', dataSource: 'Kế hoạch mẫu', sortOrder: 20, isActive: true },
];

const page = (steps: PrepPage['items'][number]['steps']): PrepPage => ({
  items: [
    {
      id: 7,
      branchCode: 'A01',
      planNo: 'KH-A01-000001',
      customerName: 'KHÁCH THỬ',
      styleCode: 'MA-THU-01',
      productName: 'Áo thử',
      lineCode: 'A01-L03',
      lineQty: 300,
      startDate: '2026-10-08',
      styleType: null,
      confirmedQty: null,
      priorityFactor: null,
      steps,
      statusCode: 'NOT_READY',
      createdAt: '2026-10-01T02:00:00.000Z',
      canEdit: true,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 100,
  today: '2026-10-10',
  stepInfo: STEPS,
});

function serve(routes: (path: string) => unknown) {
  vi.mocked(api).mockImplementation((async (path: string) => routes(path ?? '')) as unknown as typeof api);
}
const listCalls = () => vi.mocked(api).mock.calls.map((c) => String(c[0])).filter((p) => p.startsWith('/sewing/prep?'));

function renderPage(ui: ReactNode, path = '/order/prep') {
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

describe('Kế hoạch chuẩn bị SX', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    // Chỉ giả ngày (thứ Bảy 10/10/2026, tuần T41), hẹn giờ vẫn chạy thật
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T09:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('tuần ISO như file mẫu: T41 năm 2026 là 05/10 – 11/10; năm 2026 có 53 tuần; đầu tháng 1 có thể thuộc năm trước', () => {
    expect(isoWeekOf('2026-10-10')).toEqual({ year: 2026, week: 41 });
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
    expect(sundayOf('2026-10-05')).toBe('2026-10-11');
    expect(weekMonday(2026, 41)).toBe('2026-10-05');
    expect(weekMonday(2026, 1)).toBe('2025-12-29');
    expect(weeksInYear(2026)).toBe(53);
    expect(weeksInYear(2025)).toBe(52);
    expect(isoWeekOf('2027-01-01')).toEqual({ year: 2026, week: 53 });
  });

  it('trạng thái theo ngày TH đang hiện; ô TH vừa nhập gom theo dòng, kèm ngày lúc bắt đầu sửa', () => {
    expect(liveStatus('2026-10-20', [null], '2026-10-10')).toBe('NOT_DUE');
    expect(liveStatus('2026-10-20', ['2026-10-01'], '2026-10-10')).toBe('NOT_DUE');
    expect(liveStatus('2026-10-10', ['2026-10-01', '2026-10-02'], '2026-10-10')).toBe('READY');
    expect(liveStatus('2026-10-01', ['2026-10-01', null], '2026-10-10')).toBe('NOT_READY');
    const draft: Draft = new Map([
      [cellKey(7, 1), { value: '2026-10-05', previous: null, label: 'x' }],
      [cellKey(7, 2), { value: null, previous: '2026-10-01', label: 'x' }],
      [cellKey(9, 1), { value: '2026-10-06', previous: null, label: 'y' }],
    ]);
    expect(draftItems(draft)).toEqual([
      { id: 7, steps: [{ stepId: 1, doneDate: '2026-10-05', previous: null }, { stepId: 2, doneDate: null, previous: '2026-10-01' }] },
      { id: 9, steps: [{ stepId: 1, doneDate: '2026-10-06', previous: null }] },
    ]);
  });

  it('nháp ô TH: sửa về ngày đã lưu thì hết nháp; lưu xong giữ ô gõ thêm trong lúc lưu; bỏ đúng ô xung đột, đúng dòng không còn', () => {
    let d: Draft = withEdits(new Map(), [
      { key: cellKey(7, 1), value: '2026-10-05', saved: null, label: 'a' },
      { key: cellKey(7, 2), value: null, saved: '2026-10-01', label: 'a' },
      { key: cellKey(9, 1), value: '2026-10-06', saved: null, label: 'b' },
    ]);
    // Sửa tiếp một ô: ngày lúc bắt đầu sửa giữ nguyên; sửa về ngày đã lưu: bỏ khỏi nháp
    d = withEdits(d, [
      { key: cellKey(7, 1), value: '2026-10-07', saved: null, label: 'a' },
      { key: cellKey(7, 2), value: '2026-10-01', saved: '2026-10-01', label: 'a' },
    ]);
    expect([...d.keys()]).toEqual([cellKey(7, 1), cellKey(9, 1)]);
    expect(d.get(cellKey(7, 1))).toMatchObject({ value: '2026-10-07', previous: null });

    const sent = new Map(d);
    // Trong lúc lưu: gõ thêm ô 9:1 và một ô mới 9:2
    const typed = withEdits(d, [
      { key: cellKey(9, 1), value: '2026-10-08', saved: null, label: 'b' },
      { key: cellKey(9, 2), value: '2026-10-02', saved: null, label: 'b' },
    ]);
    const saved = afterSave(typed, sent);
    expect([...saved.keys()]).toEqual([cellKey(9, 1), cellKey(9, 2)]);
    // Ô sửa tiếp: lần lưu sau so với ngày vừa lưu, không báo xung đột sai
    expect(saved.get(cellKey(9, 1))).toMatchObject({ value: '2026-10-08', previous: '2026-10-06' });
    // Chưa tải lại được: giữ cả ô đã gửi, ngày lúc bắt đầu sửa là ngày vừa lưu
    expect(afterSave(sent, sent, true).get(cellKey(7, 1))).toMatchObject({ value: '2026-10-07', previous: '2026-10-07' });

    expect([...withoutCells(typed, [], [{ id: 9, stepId: 2 }]).keys()]).toEqual([cellKey(7, 1), cellKey(9, 1)]);
    expect([...withoutCells(typed, [9]).keys()]).toEqual([cellKey(7, 1)]);
  });

  it('nháp ô TH: sửa về ngày cũ trong lúc đang lưu vẫn giữ (lưu xong là ngày vừa gửi); dữ liệu mới tải về bỏ ô đã trùng ngày lưu', () => {
    // DB: 05/10. Gõ 07/10 rồi bấm Lưu; trong lúc chờ gõ lại 05/10
    const sent: Draft = withEdits(new Map(), [{ key: cellKey(7, 1), value: '2026-10-07', saved: '2026-10-05', label: 'a' }]);
    const back = withEdits(sent, [{ key: cellKey(7, 1), value: '2026-10-05', saved: '2026-10-05', label: 'a' }], sent);
    expect(back.get(cellKey(7, 1))).toMatchObject({ value: '2026-10-05', previous: '2026-10-05' });
    // Lưu xong (DB 07/10): ô còn trong nháp, lần lưu sau đổi từ 07/10 về 05/10
    expect(afterSave(back, sent).get(cellKey(7, 1))).toMatchObject({ value: '2026-10-05', previous: '2026-10-07' });
    // Không có lần lưu nào đang chạy: sửa về ngày đã lưu thì bỏ như cũ
    expect(withEdits(sent, [{ key: cellKey(7, 1), value: '2026-10-05', saved: '2026-10-05', label: 'a' }]).size).toBe(0);
    // Không ô nào đổi: trả lại đúng nháp cũ (màn không vẽ lại)
    expect(withEdits(sent, [{ key: cellKey(7, 1), value: '2026-10-07', saved: '2026-10-05', label: 'a' }, { key: cellKey(7, 2), value: null, saved: null, label: 'a' }])).toBe(sent);

    const rows = page([
      { stepId: 1, planDays: 0, custom: false, planDate: '2026-10-08', doneDate: '2026-10-07', state: 'DONE' },
      { stepId: 2, planDays: 2, custom: false, planDate: '2026-10-06', doneDate: null, state: 'OVERDUE' },
    ]).items;
    const draft: Draft = new Map([
      [cellKey(7, 1), { value: '2026-10-07', previous: null, label: 'a' }],
      [cellKey(7, 2), { value: '2026-10-09', previous: null, label: 'a' }],
      [cellKey(9, 1), { value: '2026-10-07', previous: null, label: 'b' }],
    ]);
    // 7:1 đã bằng ngày lưu thì bỏ; 7:2 còn khác; dòng 9 không có trong trang này thì giữ
    expect([...withoutSaved(draft, rows).keys()]).toEqual([cellKey(7, 2), cellKey(9, 1)]);
    // Ô đang gửi lưu thì để afterSave xử lý; không bỏ ô nào thì trả đúng nháp cũ
    expect(withoutSaved(draft, rows, new Map([[cellKey(7, 1), draft.get(cellKey(7, 1))!]]))).toBe(draft);
  });

  it('người chỉ xem: lưới xem, tiêu đề 2 tầng, Trạng thái ngay sau Ngày vào chuyền, TH sau ngày KH có chữ báo; mặc định tuần này và từ đầu năm', async () => {
    signIn(['order.prep:view']);
    serve((path) => (path.startsWith('/sewing/prep') ? page([
      { stepId: 1, planDays: 0, custom: false, planDate: '2026-10-08', doneDate: '2026-10-09', state: 'DONE_LATE' },
      { stepId: 2, planDays: 3, custom: true, planDate: '2026-10-05', doneDate: null, state: 'OVERDUE' },
    ]) : []));
    renderPage(<PrepPlanPage />);
    const table = await screen.findByRole('table', { name: 'Kế hoạch chuẩn bị SX' });
    expect(await within(table).findByText('Chưa đủ đk V/C')).toBeInTheDocument();
    const rows = within(table).getAllByRole('row');
    const heads = within(rows[0]).getAllByRole('columnheader').map((c) => c.textContent ?? '');
    expect(heads).toEqual(expect.arrayContaining(['Họp đánh giá rủi ro', 'Ngày gửi mẫu PP']));
    const start = heads.findIndex((h) => h.startsWith('Ngày vào chuyền'));
    expect(heads[start + 1]).toMatch(/^Trạng thái/);
    expect(within(table).getByText(/Xong sau ngày KH:/)).toBeInTheDocument();
    expect(within(table).getByText(/số ngày chỉnh riêng/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xem chi tiết/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Lưu thay đổi/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^T41:/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^T45:.*ngoài khoảng ngày/ })).toHaveAttribute('aria-pressed', 'false');
    expect(listCalls().at(-1)).toContain('week=2026-10-05');
    expect(listCalls().at(-1)).toContain('startFrom=2026-01-01');
    expect(listCalls().at(-1)).toContain('startTo=2026-11-01');
  });

  it('người được sửa các bước: lưới nhập, Lưu thay đổi khóa khi chưa nhập gì; chú thích có ô vừa nhập chưa lưu', async () => {
    signIn(['order.prep:view', 'order.prep:update']);
    serve((path) => (path.startsWith('/sewing/prep') ? page([
      { stepId: 1, planDays: 0, custom: false, planDate: '2026-10-08', doneDate: null, state: 'OVERDUE' },
      { stepId: 2, planDays: 2, custom: false, planDate: '2026-10-06', doneDate: null, state: 'OVERDUE' },
    ]) : []));
    renderPage(<PrepPlanPage />);
    expect(await screen.findByRole('region', { name: 'Kế hoạch chuẩn bị SX' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Kế hoạch chuẩn bị SX' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Lưu thay đổi/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('button', { name: /Bỏ thay đổi/ })).not.toBeInTheDocument();
    expect(await screen.findByText('Vừa nhập, chưa lưu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sửa chi tiết/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('các bước bị Che: lưới xem dù được sửa, ô bước là ***', async () => {
    signIn(['order.prep:view', 'order.prep:update'], { 'order.prep': { steps: 'MASKED' } });
    serve((path) => (path.startsWith('/sewing/prep') ? page('***') : []));
    renderPage(<PrepPlanPage />);
    const table = await screen.findByRole('table', { name: 'Kế hoạch chuẩn bị SX' });
    // Các bước bị Che gộp thành một cột "***" (không phải hai cột KH, TH mỗi bước toàn ô che)
    expect(await within(table).findByText('***')).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: /Các bước chuẩn bị/ })).toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: /: KH$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Lưu thay đổi/ })).not.toBeInTheDocument();
  });

  it('số liệu trên đầu màn (5.5.8): 4 thẻ theo đúng bộ lọc của lưới trừ Trạng thái, mỗi thẻ có dòng giải thích; nút ⓘ nói cách đếm', async () => {
    signIn(['order.prep:view']);
    serve((path) =>
      path.startsWith('/sewing/prep/summary')
        ? { today: '2026-10-10', total: 58, ready: 3, atRisk: 0, late: 54 }
        : path.startsWith('/sewing/prep')
          ? page([{ stepId: 1, planDays: 0, custom: false, planDate: '2026-10-08', doneDate: null, state: 'OVERDUE' }])
          : [],
    );
    renderPage(<PrepPlanPage />, '/order/prep?status=NOT_READY&line=A01-L03');
    const strip = await screen.findByRole('region', { name: 'Số liệu theo bộ lọc đang chọn' });
    await within(strip).findByText('58');
    const item = (label: string) => within(strip).getByText(label).closest('.prep-summary-item') as HTMLElement;
    expect(item('Tổng đơn hàng').querySelector('dd')).toHaveTextContent('58');
    expect(item('Đủ điều kiện V/C').querySelector('dd')).toHaveTextContent('3');
    expect(item('Nguy cơ trễ hạn').querySelector('dd')).toHaveTextContent('0');
    expect(item('Trễ hạn')).toHaveTextContent('Chưa đủ đk, bước quá KH');
    expect(item('Trễ hạn').querySelector('dd')).toHaveTextContent('54');
    // Cùng bộ lọc với lưới (tuần, khoảng ngày, chuyền), không gửi Trạng thái
    const sent = vi.mocked(api).mock.calls.map((c) => String(c[0])).filter((p) => p.startsWith('/sewing/prep/summary'));
    expect(sent.at(-1)).toContain('week=2026-10-05');
    expect(sent.at(-1)).toContain('line=A01-L03');
    expect(sent.at(-1)).toContain('startFrom=2026-01-01');
    expect(sent.at(-1)).not.toContain('status=');
    expect(listCalls().at(-1)).toContain('status=NOT_READY');
    // Mở màn chỉ gọi số liệu một lần, song song với lưới
    expect(sent).toHaveLength(1);
    const info = screen.getByRole('button', { name: 'Cách đếm các số liệu' });
    fireEvent.click(info);
    expect(await screen.findByText(/Một mã hàng may trên nhiều chuyền tính là 1/)).toBeInTheDocument();
    // Nút mở popup có trạng thái mở/đóng cho trình đọc màn hình
    expect(info).toHaveAttribute('aria-expanded', 'true');
  });

  it('số liệu: người không được xem các bước chỉ thấy Tổng, các ô khác "–" kèm lý do; tải lỗi thì có nút thử lại', async () => {
    signIn(['order.prep:view'], { 'order.prep': { steps: 'HIDDEN' } });
    serve((path) => (path.startsWith('/sewing/prep/summary') ? { today: '2026-10-10', total: 12, ready: null, atRisk: null, late: null } : path.startsWith('/sewing/prep') ? page('***') : []));
    const first = renderPage(<PrepPlanPage />);
    const strip = await screen.findByRole('region', { name: 'Số liệu theo bộ lọc đang chọn' });
    await within(strip).findByText('12');
    const late = within(strip).getByText('Trễ hạn').closest('.prep-summary-item')!.querySelector('dd')!;
    expect(late).toHaveTextContent('–');
    expect(within(late).getByTitle('Ẩn theo phân quyền của bạn')).toBeInTheDocument();
    // Lý do cũng có trong popup cách đếm (bàn phím, màn cảm ứng không xem được title)
    fireEvent.click(screen.getByRole('button', { name: 'Cách đếm các số liệu' }));
    expect(await screen.findByText(/số bạn không được xem theo phân quyền/)).toBeInTheDocument();
    first.unmount();

    serve((path) => {
      if (path.startsWith('/sewing/prep/summary')) throw new Error('mất kết nối');
      return path.startsWith('/sewing/prep') ? page('***') : [];
    });
    const second = renderPage(<PrepPlanPage />);
    expect(await screen.findByRole('button', { name: /Chưa tải được số liệu, thử lại/ }, { timeout: 3000 })).toBeInTheDocument();
    second.unmount();

    // Đã có số rồi tải lại bị lỗi (quay lại tab, sau khi lưu): số đang hiện là số cũ, phải báo
    let fail = false;
    serve((path) => {
      if (path.startsWith('/sewing/prep/summary')) {
        if (fail) throw new Error('mất kết nối');
        return { today: '2026-10-10', total: 12, ready: 1, atRisk: 0, late: 2 };
      }
      return path.startsWith('/sewing/prep') ? page('***') : [];
    });
    renderPage(<PrepPlanPage />);
    await within(await screen.findByRole('region', { name: 'Số liệu theo bộ lọc đang chọn' })).findByText('12');
    fail = true;
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    expect(await screen.findByRole('button', { name: /Số liệu chưa cập nhật, thử lại/ }, { timeout: 3000 })).toBeInTheDocument();
    act(() => focusManager.setFocused(undefined));
  });

  it('lọc trên URL theo cột bị Ẩn không tính là đang lọc; không xem được ngày vào chuyền thì không có thanh tuần', async () => {
    signIn(['order.prep:view'], { 'order.prep': { customerName: 'HIDDEN', startDate: 'HIDDEN' } });
    serve((path) => (path.startsWith('/sewing/prep') ? { ...page([]), items: [], total: 0 } : []));
    renderPage(<PrepPlanPage />, '/order/prep?customer=ABC&startFrom=2026-10-01');
    expect(await screen.findByText(/Chưa có dòng dàn chuyền nào/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Xóa lọc/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Tuần năm/ })).not.toBeInTheDocument();
    expect(listCalls().at(-1)).not.toContain('week=');
  });

  it('danh mục bước: người chỉ xem thấy bảng chỉ đọc; người sửa thấy bảng sửa được, Lưu khóa khi chưa đổi gì', async () => {
    serve(() => STEPS);
    signIn(['admin.catalog:view']);
    const viewer = renderPage(<PrepStepsPane />);
    expect(await screen.findByRole('table', { name: 'Cấu hình chuẩn bị SX' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Lưu thay đổi/ })).not.toBeInTheDocument();
    viewer.unmount();

    signIn(['admin.catalog:view', 'admin.catalog:update', 'admin.catalog:create']);
    renderPage(<PrepStepsPane />);
    expect(await screen.findByRole('region', { name: 'Cấu hình chuẩn bị SX' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lưu thay đổi/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: /Thêm bước/ })).not.toHaveAttribute('aria-disabled');
  });
});
