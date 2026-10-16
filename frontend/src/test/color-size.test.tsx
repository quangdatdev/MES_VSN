import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Allocation, AllocationDetail, AllocationLine } from '../features/order/api';
import ColorSizePage from '../features/order/ColorSizePage';
import { analyze, freshRow, initialRows, lastOfCell, lineLabels, lineShares, lostCells, mergeClass, mergeRuns, payload, propose, settleNew, signature, splitRow, type EditRow } from '../features/order/colorSizeRules';
import { api } from '../lib/api';
import type { AccessLevel } from '../lib/types';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

// Phân bổ màu cỡ theo kế hoạch (phase 5.13). Ô của lưới nhập không vẽ ở jsdom: luật của popup kiểm qua hàm thuần
// (colorSizeRules.ts), màn kiểm qua phần ngoài lưới (ô Đã giao, chân popup, cảnh báo, nút) và nội dung gửi lên

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

const line = (id: number, code: string, qty: number, editable = true, extra: Partial<AllocationLine> = {}): AllocationLine => ({
  id,
  lineCode: code,
  lineName: `Chuyền ${code.slice(-2)}`,
  qty,
  avgOutput: 300,
  startDate: '2026-12-05',
  endDate: '2026-12-09',
  statusCode: 'PLANNED',
  assignedQty: 0,
  editable,
  ...extra,
});
const cell = (colorName: string, sizeName: string, qty: number, hiddenQty = 0) => ({ colorName, sizeName, qty, hiddenQty });
const CELLS = [cell('Đen', 'S', 100), cell('Đen', 'M', 100), cell('Trắng', 'S', 100)];
const detailOf = (lines: AllocationLine[], rows: AllocationDetail['rows'] = [], colorSizes = CELLS) => ({ lines, colorSizes, rows });
const row = (key: number, lineId: number | null, colorName: string, sizeName: string, assignedQty: number | null, locked = false): EditRow => ({ key, lineId, colorName, sizeName, assignedQty, locked });

describe('Luật popup phân màu cỡ (colorSizeRules)', () => {
  it('dòng lúc mở: theo thứ tự màu cỡ của kế hoạch, phần giao đã lưu mỗi chuyền một dòng, màu cỡ chưa giao một dòng trống; chỉ một chuyền sửa được thì chọn sẵn', () => {
    const two = initialRows(detailOf([line(1, 'A01-L03', 300), line(2, 'A01-L05', 300)], [
      { id: 9, lineId: 2, colorName: 'Đen', sizeName: 'S', assignedQty: 40 },
      { id: 8, lineId: 1, colorName: 'Đen', sizeName: 'S', assignedQty: 60 },
    ]));
    expect(two.map((r) => [r.colorName, r.sizeName, r.lineId, r.assignedQty])).toEqual([
      ['Đen', 'S', 1, 60],
      ['Đen', 'S', 2, 40],
      ['Đen', 'M', null, null],
      ['Trắng', 'S', null, null],
    ]);
    const one = initialRows(detailOf([line(1, 'A01-L03', 300)]));
    expect(one.map((r) => r.lineId)).toEqual([1, 1, 1]);
    // Chọn sẵn chuyền cho dòng trống không phải là đã đổi gì
    expect(signature(one)).toBe('[]');
  });

  it('chuyền xem được mà không sửa được: dòng khóa, không gửi lên; màu cỡ chỉ có dòng khóa thì thêm dòng trống để giao phần còn lại', () => {
    const rows = initialRows(detailOf([line(1, 'A01-L03', 300), line(2, 'A01-L05', 300, false)], [{ id: 7, lineId: 2, colorName: 'Đen', sizeName: 'S', assignedQty: 30 }]));
    expect(rows.map((r) => [r.sizeName, r.lineId, r.locked])).toEqual([
      ['S', 2, true],
      ['S', 1, false],
      ['M', 1, false],
      ['S', 1, false],
    ]);
    expect(payload(rows)).toEqual([]);
    const typed = rows.map((r, i) => (i === 1 ? { ...r, assignedQty: 70 } : r));
    expect(payload(typed)).toEqual([{ lineId: 1, colorName: 'Đen', sizeName: 'S', assignedQty: 70 }]);
  });

  it('tổng theo màu cỡ gồm dòng khóa và phần ngoài phạm vi xem; tổng theo chuyền không vượt SL đã xếp; chưa chọn chuyền, lặp, màu cỡ lạ', () => {
    const d = detailOf([line(1, 'A01-L03', 120), line(2, 'A01-L05', 300, false)], [], [cell('Đen', 'S', 100, 10), cell('Đen', 'M', 100), cell('Trắng', 'S', 100)]);
    const labels = lineLabels(d.lines);
    const rows = [
      row(1, 2, 'Đen', 'S', 30, true),
      row(2, 1, 'Đen', 'S', 61),
      row(3, 1, 'Đen', 'M', 60),
      row(4, null, 'Trắng', 'S', 5),
      row(5, 1, 'Đen', 'M', 1),
      row(6, 1, 'Tím', 'S', 2),
    ];
    const c = analyze(rows, d, labels);
    // Đen/S: 30 (khóa) + 61 + 10 (ngoài phạm vi) = 101 > 100; còn lại -1
    expect(c.cells.get('đen\u0000s')).toMatchObject({ given: 101, mine: 61, left: -1, over: true });
    // Chuyền 3: 61 + 60 + 1 (+ 2 của màu cỡ lạ) = 124 > 120
    expect(c.lines.get(1)).toMatchObject({ given: 124, over: true });
    expect(c.lines.get(2)).toMatchObject({ given: 30, over: false });
    expect(c.errors.get(2)).toEqual({ qty: true });
    expect(c.errors.get(4)).toEqual({ line: true });
    expect(c.errors.get(3)).toMatchObject({ line: true });
    expect(c.errors.get(5)).toMatchObject({ line: true });
    expect(c.errors.get(6)).toMatchObject({ cell: true });
    expect(c.issues.map((i) => i.reason)).toEqual([
      'Có dòng chưa chọn chuyền',
      'Có dòng chưa chọn màu, cỡ',
      'Có màu cỡ nhập hai dòng cho cùng một chuyền',
      'Có màu cỡ giao vượt số lượng kế hoạch',
      'Có chuyền giao vượt số lượng đã xếp',
    ]);
    expect(c.issues[3].items).toEqual(['Đen / S: giao 101, SL kế hoạch 100']);
    expect(c.issues[4].items).toEqual(['Chuyền 03: giao 124, đã xếp 120']);
    expect(c.total).toBe(30 + 61 + 60 + 5 + 1 + 2 + 10);
    expect(c.hidden).toBe(10);
  });

  it('dòng khóa có màu cỡ không còn trong kế hoạch không chặn lưu (không sửa, không xóa được); dòng mình sửa được thì chặn', () => {
    const d = detailOf([line(1, 'A01-L03', 300), line(2, 'A01-L05', 300, false)]);
    const labels = lineLabels(d.lines);
    expect(analyze([row(1, 2, 'Tím', 'XL', 20, true)], d, labels).issues).toEqual([]);
    expect(analyze([row(1, 1, 'Tím', 'XL', 20)], d, labels).issues.map((i) => i.reason)).toEqual(['Có dòng chưa chọn màu, cỡ']);
  });

  it('màu cỡ vượt chỉ do chuyền khác (người dùng không giao gì ở đó) thì không chặn lưu, như máy chủ', () => {
    const d = detailOf([line(1, 'A01-L03', 300), line(2, 'A01-L05', 300, false)], [], [cell('Đen', 'S', 100, 120)]);
    const c = analyze([row(1, 1, 'Đen', 'S', null)], d, lineLabels(d.lines));
    expect(c.cells.get('đen\u0000s')).toMatchObject({ left: -20, over: false });
    expect(c.issues).toEqual([]);
  });

  it('chia lần lượt theo SL chuyền: tổng mỗi chuyền không vượt SL đã xếp, mỗi màu cỡ không vượt phần chưa giao; giữ dòng khóa', () => {
    expect(lineShares([100, 100, 100], [200, 100])).toEqual([
      [67, 67, 66],
      [33, 33, 34],
    ]);
    const d = detailOf([line(1, 'A01-L03', 200), line(2, 'A01-L05', 150), line(3, 'A01-L07', 500, false)], [], [cell('Đen', 'S', 100, 20), cell('Đen', 'M', 100), cell('Trắng', 'S', 100)]);
    const locked = row(1, 3, 'Đen', 'M', 50, true);
    const next = propose([locked, row(2, 1, 'Đen', 'S', 5)], d)!;
    expect(next).not.toBeNull();
    expect(next.filter((r) => r.locked)).toEqual([locked]);
    const c = analyze(next, d, lineLabels(d.lines));
    expect(c.issues).toEqual([]);
    // Còn chưa giao: Đen/S 80, Đen/M 50, Trắng/S 100 = 230 ≤ 200 + 150: chia hết, chuyền 3 nhận đủ 200
    expect(c.lines.get(1)!.given).toBe(200);
    expect(c.lines.get(2)!.given).toBe(30);
    expect([...c.cells.values()].map((x) => x.left)).toEqual([0, 0, 0]);
    // Thiếu số (bị Che) thì không chia được
    expect(propose([], detailOf([line(1, 'A01-L03', 200, true, { qty: '***' })]))).toBeNull();
  });

  it('nhãn chuyền: chuyền có hai dòng dàn chuyền trong kế hoạch thì kèm ngày vào chuyền; tách dòng giữ màu cỡ, bỏ chuyền và số', () => {
    const labels = lineLabels([line(1, 'A01-L03', 100), line(2, 'A01-L03', 100, true, { startDate: '2026-12-20' }), line(3, 'A01-L05', 100, true, { lineName: undefined, lineCode: '***' })]);
    expect([...labels.values()]).toEqual(['Chuyền 03 (từ 05/12)', 'Chuyền 03 (từ 20/12)', 'Chuyền thứ 3']);
    const copy = splitRow(row(1, 1, 'Đen', 'S', 60, false));
    expect(copy).toMatchObject({ lineId: null, colorName: 'Đen', sizeName: 'S', assignedQty: null, locked: false });
    expect(copy.key).not.toBe(1);
  });

  it('gộp ô: dòng liền nhau cùng màu cỡ (không phân biệt hoa thường) thành một khối; cách dòng khác hoặc chưa chọn đủ màu, cỡ thì không gộp', () => {
    const rows = [
      row(1, 1, 'Đen', 'S', 60),
      row(2, 2, 'đen ', 's', 40),
      row(3, 3, 'Đen', 'S', 0),
      row(4, 1, 'Đen', 'M', 100),
      row(5, null, 'Đen', 'S', null),
      row(6, null, '', '', null),
      row(7, null, '', '', null),
    ];
    const m = mergeRuns(rows);
    expect([...m.entries()]).toEqual([
      [1, { open: true, next: false, size: 3, pos: 0 }],
      [2, { open: true, next: true, size: 3, pos: 1 }],
      [3, { open: false, next: true, size: 3, pos: 2 }],
    ]);
    // Chữ ở dòng giữa khối; khối chẵn dòng: dòng giữa dời lên nửa dòng
    expect([1, 2, 3, 4].map((k) => mergeClass(m.get(k)))).toEqual(['merge-open merge-quiet', 'merge-open merge-next', 'merge-next merge-quiet', undefined]);
    const two = mergeRuns([row(1, 1, 'Đen', 'S', 60), row(2, 2, 'Đen', 'S', 40)]);
    expect([1, 2].map((k) => mergeClass(two.get(k)))).toEqual(['merge-open merge-quiet', 'merge-next merge-half']);
    // Chỉ để hiển thị: phần gửi lên vẫn mỗi chuyền một dòng
    expect(payload(rows).map((r) => r.lineId)).toEqual([1, 2, 1]);
    // Dòng khóa gộp chung với dòng sửa được (bốn cột gộp đều chỉ đọc, cùng nền)
    const mixed = mergeRuns([row(1, 1, 'Đen', 'S', 30), row(2, 2, 'Đen', 'S', 20, true), row(3, 3, 'Đen', 'S', null)]);
    expect([...mixed.keys()]).toEqual([1, 2, 3]);
  });

  it('dòng vừa tạo chép màu cỡ của dòng ngay trên (dòng đầu: dòng dưới); dòng tạo do dán quá cuối (đã có chuyền, số) bị bỏ', () => {
    const lines = [line(1, 'A01-L03', 300)];
    const a = freshRow();
    const b = freshRow();
    const pasted = { ...freshRow(), lineId: 1, assignedQty: 30 };
    const out = settleNew([a, row(1, 1, 'Đen', 'S', 60), b, row(2, 1, 'Đen', 'M', 10), pasted], lines);
    expect(out.dropped).toBe(1);
    expect(out.rows.map((r) => [r.key, r.colorName, r.sizeName, r.lineId, r.assignedQty, r.fresh])).toEqual([
      [a.key, 'Đen', 'S', 1, null, undefined],
      [1, 'Đen', 'S', 1, 60, undefined],
      [b.key, 'Đen', 'S', 1, null, undefined],
      [2, 'Đen', 'M', 1, 10, undefined],
    ]);
    // Không có dòng vừa tạo thì giữ nguyên mảng (không vẽ lại)
    const same = [row(1, 1, 'Đen', 'S', 60)];
    expect(settleNew(same, lines).rows).toBe(same);
  });

  it('chặn lần đổi làm mất hết dòng sửa được của một màu cỡ (xóa nhiều dòng một lúc); dòng khóa còn lại không tính', () => {
    const d = detailOf([line(1, 'A01-L03', 300)]);
    const before = [row(1, 1, 'Đen', 'S', 60), row(2, 2, 'Đen', 'S', 40), row(3, 3, 'Đen', 'M', 0, true), row(4, 1, 'Đen', 'M', 10)];
    expect(lostCells(before, [before[2], before[3]], d)).toEqual(['Đen / S']);
    expect(lostCells(before, [before[0], before[2]], d)).toEqual(['Đen / M']);
    expect(lostCells(before, [before[1], before[3]], d)).toEqual([]);
  });

  it('dòng cuối cùng sửa được của một màu cỡ trong kế hoạch không xóa được (màu, cỡ không chọn lại được); màu cỡ lạ thì xóa được', () => {
    const d = detailOf([line(1, 'A01-L03', 300), line(2, 'A01-L05', 300, false)]);
    const rows = [row(1, 2, 'Đen', 'S', 30, true), row(2, 1, 'Đen', 'S', null), row(3, 1, 'Đen', 'M', 10), row(4, null, 'Đen', 'M', null), row(5, 1, 'Xanh', 'S', 5)];
    expect(rows.map((r) => lastOfCell(rows, r, d))).toEqual([false, true, false, false, false]);
  });
});

const listRow = {
  id: 41,
  planNo: 'KH-A01-000041',
  customerName: 'KHÁCH THỬ',
  styleCode: 'MA-THU-41',
  poBuyDate: 'PO-THU / 20-01',
  branchCode: 'A01',
  lineCode: ['A01-L03', 'A01-L05'],
  lineName: ['Chuyền 03', 'Chuyền 05'],
  startDate: '2026-12-05',
  avgOutput: 775,
  endDate: '2026-12-20',
  shipDate: '2027-01-20',
  qty: 300,
  assignedQty: 0,
  statusCode: 'PLANNED',
  createdAt: '2026-10-12T01:00:00.000Z',
} as Allocation;
const detail: AllocationDetail = {
  ...listRow,
  lines: [line(11, 'A01-L03', 200), line(12, 'A01-L05', 150)],
  colorSizes: CELLS,
  rows: [],
};
/** Bỏ một khóa như máy chủ làm với cột bị Ẩn */
const without = <T extends object>(o: T, key: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key)) as T;

function serve(d: AllocationDetail = detail, listItem: Allocation = listRow) {
  const writes: { path: string; method: string; body: unknown }[] = [];
  vi.mocked(api).mockImplementation((async (raw: string, opts?: { method?: string; body?: unknown }) => {
    const path = String(raw ?? '');
    if (opts?.method && opts.method !== 'GET') {
      writes.push({ path, method: opts.method, body: opts.body });
      return d;
    }
    if (path === '/me/branch-names') return [{ code: 'A01', name: 'Nhà máy 1' }];
    if (path === '/me/lines') return [{ code: 'A01-L03', name: 'Chuyền 03', branchCode: 'A01', isActive: true }];
    if (path === '/order/sales-orders/options') return { customers: [], seasons: [], orderTypes: [], orderTypeNames: {}, units: [], factories: [] };
    if (path.startsWith('/order/color-size?')) return { items: [listItem], total: 1, page: 1, pageSize: 100 };
    if (path === '/order/color-size/41') return d;
    throw new Error(`Chưa giả lập ${path}`);
  }) as unknown as typeof api);
  return { writes };
}

function signIn(permissions: string[], fieldPolicies: Record<string, Record<string, AccessLevel>> = {}) {
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

function renderPage() {
  render(
    <MantineProvider theme={theme} env="test">
      <ModalsProvider>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter initialEntries={['/order/color-size']}>
            <ColorSizePage />
          </MemoryRouter>
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>,
  );
}

async function openPopup() {
  renderPage();
  const cellOfStyle = await screen.findByText('MA-THU-41');
  // Một dòng mỗi kế hoạch: chuyền nối theo thứ tự dàn chuyền, NSBQ trung bình (máy chủ tính), trạng thái của cả kế hoạch
  const gridRow = cellOfStyle.closest('tr')!;
  expect(within(gridRow).getByText('Chuyền 03, Chuyền 05')).toHaveAttribute('title', 'A01-L03, A01-L05');
  expect(within(gridRow).getByText('775')).toBeInTheDocument();
  expect(within(gridRow).getByText('Chưa phân màu cỡ')).toBeInTheDocument();
  fireEvent.doubleClick(cellOfStyle);
  return screen.findByRole('dialog', { name: /MA-THU-41 \(KH-A01-000041\)/ });
}

describe('Màn Phân bổ màu cỡ (phase 5.13)', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
  });

  it('chia theo SL chuyền rồi lưu: tổng đã giao đổi theo, gửi phần giao từng chuyền theo Id dòng dàn chuyền', async () => {
    signIn(['order.colorsize:view', 'order.colorsize:update']);
    const { writes } = serve();
    const dialog = await openPopup();
    expect(await within(dialog).findByText(/sản phẩm của kế hoạch/)).toHaveTextContent('Đã giao 0 / 300 sản phẩm của kế hoạch');
    // Không còn khung theo dõi từng chuyền (người dùng bỏ 14/10: kế hoạch có thể nhiều chuyền)
    expect(within(dialog).queryByRole('list', { name: 'Số lượng giao theo chuyền' })).toBeNull();
    const save = within(dialog).getByRole('button', { name: 'Lưu thay đổi' });
    expect(save).toHaveAttribute('data-disabled');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Chia theo SL chuyền' }));
    // 300 sản phẩm của kế hoạch: chuyền 03 đủ 200, chuyền 05 nhận 100
    await waitFor(() => expect(within(dialog).getByText(/sản phẩm của kế hoạch/)).toHaveTextContent('Đã giao 300 / 300 sản phẩm của kế hoạch'));
    expect(within(dialog).getByLabelText('Đã giao')).toHaveValue('300');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    const sent = (writes[0].body as { rows: { lineId: number; colorName: string; sizeName: string; assignedQty: number }[] }).rows;
    expect(writes[0]).toMatchObject({ path: '/order/color-size/41', method: 'PUT' });
    expect(sent.reduce((s, r) => s + r.assignedQty, 0)).toBe(300);
    expect(sent.filter((r) => r.lineId === 11).reduce((s, r) => s + r.assignedQty, 0)).toBe(200);
    expect(new Set(sent.map((r) => r.lineId))).toEqual(new Set([11, 12]));
  });

  it('dữ liệu đang vượt (màu cỡ, chuyền): cảnh báo nêu từng mục, nút Lưu khóa kèm lý do', async () => {
    signIn(['order.colorsize:view', 'order.colorsize:update']);
    serve({
      ...detail,
      rows: [
        { id: 1, lineId: 11, colorName: 'Đen', sizeName: 'S', assignedQty: 80 },
        { id: 2, lineId: 12, colorName: 'Đen', sizeName: 'S', assignedQty: 30 },
      ],
    });
    const dialog = await openPopup();
    expect(await within(dialog).findByText('1 màu cỡ giao nhiều hơn số lượng kế hoạch. Giảm lại trước khi lưu.')).toBeInTheDocument();
    expect(within(dialog).getByText('Đen / S: giao 110, SL kế hoạch 100')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Lưu thay đổi' })).toHaveAttribute('data-disabled');
  });

  it('Số lượng giao bị Che: popup chỉ xem nói lý do; ô Đã giao hiện "***", chân popup không có tổng', async () => {
    signIn(['order.colorsize:view', 'order.colorsize:update'], { 'order.colorsize': { assignedQty: 'MASKED' } });
    serve({
      ...detail,
      assignedQty: '***',
      lines: detail.lines.map((l) => ({ ...l, assignedQty: '***' })),
      colorSizes: CELLS.map((c) => ({ ...c, hiddenQty: '***' })),
      rows: [{ id: 1, lineId: 11, colorName: 'Đen', sizeName: 'S', assignedQty: '***' }],
    });
    const dialog = await openPopup();
    expect(await within(dialog).findByText('Cột Số lượng giao chỉ đọc với bạn.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Đã giao')).toHaveValue('***');
    expect(within(dialog).queryByRole('button', { name: 'Lưu thay đổi' })).toBeNull();
    expect(within(dialog).queryByText(/sản phẩm của kế hoạch/)).toBeNull();
  });

  it('Số lượng giao bị Ẩn: ô Đã giao hiện "–", chân popup không có tổng; popup chỉ xem', async () => {
    signIn(['order.colorsize:view', 'order.colorsize:update'], { 'order.colorsize': { assignedQty: 'HIDDEN' } });
    serve({
      ...without(detail, 'assignedQty'),
      lines: detail.lines.map((l) => without(l, 'assignedQty')),
      colorSizes: CELLS.map((c) => without(c, 'hiddenQty')),
      rows: [without({ id: 1, lineId: 11, colorName: 'Đen', sizeName: 'S', assignedQty: 80 }, 'assignedQty')],
    });
    const dialog = await openPopup();
    expect(await within(dialog).findByText('Cột Số lượng giao chỉ đọc với bạn.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Đã giao')).toHaveValue('–');
    expect(within(dialog).queryByText(/sản phẩm của kế hoạch/)).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Lưu thay đổi' })).toBeNull();
  });

  it('SL đã xếp, SL kế hoạch bị Ẩn: vẫn nhập được, nút Chia theo SL chuyền khóa (thiếu số để chia)', async () => {
    signIn(['order.colorsize:view', 'order.colorsize:update'], { 'order.colorsize': { qty: 'HIDDEN' } });
    serve({
      ...without(detail, 'qty'),
      lines: detail.lines.map((l) => without(l, 'qty')),
      colorSizes: CELLS.map((c) => without(c, 'qty')),
      rows: [{ id: 1, lineId: 11, colorName: 'Đen', sizeName: 'S', assignedQty: 80 }],
    });
    const dialog = await openPopup();
    expect(await within(dialog).findByRole('button', { name: 'Chia theo SL chuyền' })).toHaveAttribute('data-disabled');
    expect(within(dialog).getByRole('button', { name: 'Lưu thay đổi' })).toBeInTheDocument();
  });

  it.each([
    ['Che', 'MASKED' as const, { ...detail, styleCode: '***' }, { ...listRow, styleCode: '***' }],
    ['Ẩn', 'HIDDEN' as const, without(detail, 'styleCode'), without(listRow, 'styleCode')],
  ])('Mã hàng bị %s: tiêu đề popup chỉ còn số kế hoạch', async (_name, level, d, item) => {
    signIn(['order.colorsize:view', 'order.colorsize:update'], { 'order.colorsize': { styleCode: level } });
    serve(d, item);
    renderPage();
    fireEvent.doubleClick(await screen.findByText('KHÁCH THỬ'));
    expect(await screen.findByRole('dialog', { name: 'Phân màu cỡ cho chuyền: KH-A01-000041' })).toBeInTheDocument();
  });

  it('người chỉ xem: lưới xem, nút Đóng, không có nút chia và lưu', async () => {
    signIn(['order.colorsize:view']);
    serve({ ...detail, rows: [{ id: 1, lineId: 11, colorName: 'Đen', sizeName: 'S', assignedQty: 80 }] });
    const dialog = await openPopup();
    expect(await within(dialog).findByRole('table', { name: 'Màu cỡ của các chuyền' })).toBeInTheDocument();
    // Nút X của popup cũng có tên "Đóng" (chỉ có nhãn): tìm theo chữ trên nút ở chân popup
    expect(within(dialog).getByText('Đóng').closest('button')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Lưu thay đổi' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Chia theo SL chuyền' })).toBeNull();
  });

  it('lưới xem: một màu cỡ tách cho hai chuyền thì ô Màu, Cỡ, SL KH gộp hai dòng bằng rowspan', async () => {
    signIn(['order.colorsize:view']);
    serve({
      ...detail,
      rows: [
        { id: 1, lineId: 11, colorName: 'Đen', sizeName: 'S', assignedQty: 60 },
        { id: 2, lineId: 12, colorName: 'Đen', sizeName: 'S', assignedQty: 40 },
      ],
    });
    const dialog = await openPopup();
    const table = await within(dialog).findByRole('table', { name: 'Màu cỡ của các chuyền' });
    const [first, second] = within(table).getAllByRole('row').slice(1);
    const cols = (tr: HTMLElement) => ['colorName', 'sizeName', 'planQty', 'lineId'].map((k) => tr.querySelector(`td[data-col="${k}"]`));
    expect(cols(first).map((td) => [td?.textContent, td?.getAttribute('rowspan')])).toEqual([
      ['Đen', '2'],
      ['S', '2'],
      ['100', '2'],
      ['Chuyền 03', null],
    ]);
    // Dòng thứ hai không có ô Màu, Cỡ, SL KH (đã gộp vào dòng trên)
    expect(cols(second).map((td) => td?.textContent ?? null)).toEqual([null, null, null, 'Chuyền 05']);
  });
});
