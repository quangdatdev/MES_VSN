import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import CatalogsPage from '../features/admin/CatalogsPage';
import { api } from '../lib/api';
import { today } from '../lib/format';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

// Lịch làm việc theo ĐVCS (phase 5.12): cấu hình tuần, số ngày cộng thêm, ngày nghỉ lễ gom theo đợt, đặt ngày từ lịch năm

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

const YEAR = Number(today().slice(0, 4));
const config = { weeklyOffDays: [7], outStartOffsetDays: 3, outEndOffsetDays: 3, warehouseStartOffsetDays: 2, warehouseEndOffsetDays: 5, productionRoundUpFrom: 0.5 };
const overview = {
  mes: [{ code: 'WORK_CALENDAR', kind: 'calendar', name: 'Lịch làm việc', description: 'Ngày nghỉ của từng đơn vị cơ sở.', total: 2, active: 1 }],
  external: [],
  externalError: null,
  branches: [],
};
const calendars = {
  defaults: config,
  items: [
    { branchCode: 'A01', branchName: 'VSN', branchActive: true, configured: true, dayCount: 10, ...config },
    { branchCode: 'A02', branchName: 'Nhà máy 2', branchActive: true, configured: false, dayCount: 0, ...config },
    { branchCode: 'A09', branchName: 'Đơn vị đã ngừng', branchActive: false, configured: true, dayCount: 10, ...config },
  ],
};
/** Tết 9 ngày liền nhau cùng tên là một đợt; một Chủ nhật làm bù */
const daysOf = (year: number) => [
  ...Array.from({ length: 9 }, (_, i) => ({ id: i + 1, date: `${year}-02-${String(14 + i).padStart(2, '0')}`, dayType: 'OFF', name: 'Tết Nguyên đán (thử)' })),
  { id: 20, date: `${year}-11-15`, dayType: 'WORK', name: null },
];

function signIn(permissions: string[], branch = 'A01') {
  useSession.getState().reset('anonymous');
  useSession.getState().set({
    status: 'ready',
    user: { id: 1, username: 'quantri', fullName: 'Quản trị' },
    branch: { code: branch, name: branch, isAggregate: false },
    roles: [],
    permissions: new Set(permissions),
  });
}

function mockApi() {
  const calls: { path: string; method: string; body: unknown }[] = [];
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation((async (path: string, opts?: { method?: string; body?: unknown }) => {
    const method = opts?.method ?? 'GET';
    if (method !== 'GET') {
      calls.push({ path, method, body: opts?.body });
      return method === 'DELETE' ? { deleted: 9 } : { count: 1 };
    }
    if (path === '/admin/catalogs') return overview;
    if (path === '/admin/catalogs/work-calendars') return calendars;
    const m = /work-calendars\/A0\d\/days\?year=(\d+)/.exec(path);
    if (m) return daysOf(Number(m[1]));
    return [];
  }) as unknown as typeof api);
  return { calls };
}

function renderPane() {
  return render(
    <MantineProvider theme={theme} env="test">
      <ModalsProvider>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter initialEntries={['/admin/catalogs?c=WORK_CALENDAR']}>
            <CatalogsPage />
          </MemoryRouter>
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>,
  );
}

const dmy = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

describe('Danh mục Lịch làm việc', () => {
  it('mở theo ĐVCS đăng nhập; ngày nghỉ lễ gom theo đợt; xóa cả đợt sau khi xác nhận', async () => {
    signIn(['admin.catalog:view', 'admin.catalog:update']);
    const { calls } = mockApi();
    renderPane();
    expect(await screen.findByRole('heading', { name: 'Lịch làm việc' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Đơn vị cơ sở' })).toHaveValue('VSN (A01)'));
    expect(screen.getByText('Lịch riêng')).toBeInTheDocument();

    const tet = `${dmy(`${YEAR}-02-14`)} – ${dmy(`${YEAR}-02-22`)}`;
    const row = (await screen.findByText(tet)).closest('tr')!;
    expect(within(row).getByText('9')).toBeInTheDocument();
    expect(within(row).getByText('Tết Nguyên đán (thử)')).toBeInTheDocument();
    const work = screen.getByText(dmy(`${YEAR}-11-15`)).closest('tr')!;
    expect(within(work).getByText('Làm bù')).toBeInTheDocument();
    // Lịch năm: ô ngày lễ đọc được loại, tên
    expect(screen.getByRole('button', { name: new RegExp(`${dmy(`${YEAR}-02-16`)}: nghỉ, Tết Nguyên đán`) })).toHaveAttribute('data-kind', 'holiday');

    fireEvent.click(within(row).getByRole('button', { name: `Xóa ${tet}` }));
    const confirm = await screen.findByRole('dialog', { name: 'Xóa “Tết Nguyên đán (thử)”?' });
    expect(calls).toHaveLength(0);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Xóa' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ path: `/admin/catalogs/work-calendars/A01/days?from=${YEAR}-02-14&to=${YEAR}-02-22`, method: 'DELETE', body: undefined });
  });

  it('cấu hình tuần: thêm nghỉ thứ Bảy rồi lưu; số ngày cộng thêm làm bắt đầu sau kết thúc thì không gửi', async () => {
    signIn(['admin.catalog:view', 'admin.catalog:update']);
    const { calls } = mockApi();
    renderPane();
    const sunday = await screen.findByRole('checkbox', { name: 'Nghỉ Chủ nhật' });
    expect(sunday).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Nghỉ Thứ Bảy' })).not.toBeChecked();

    const outStart = screen.getByRole('textbox', { name: 'Bắt đầu ra chuyền' });
    fireEvent.change(outStart, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));
    expect(await screen.findByText(/số ngày của "Kết thúc" phải từ số ngày của "Bắt đầu" trở lên/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    fireEvent.change(outStart, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Nghỉ Thứ Bảy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ path: '/admin/catalogs/work-calendars/A01', method: 'PUT', body: { ...config, weeklyOffDays: [6, 7] } });
  });

  it('ngưỡng làm tròn Số ngày SX: ví dụ theo ngưỡng đang nhập, lưu cùng cấu hình', async () => {
    signIn(['admin.catalog:view', 'admin.catalog:update']);
    const { calls } = mockApi();
    renderPane();
    const roundUp = await screen.findByRole('textbox', { name: 'Làm tròn lên khi phần lẻ từ' });
    expect(screen.getByText('7,3 → 7 ngày; 7,5 → 8 ngày; 7,8 → 8 ngày')).toBeInTheDocument();
    fireEvent.change(roundUp, { target: { value: '0,8' } });
    expect(await screen.findByText('7,3 → 7 ngày; 7,5 → 7 ngày; 7,8 → 8 ngày')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ path: '/admin/catalogs/work-calendars/A01', method: 'PUT', body: { ...config, productionRoundUpFrom: 0.8 } });
  });

  it('ngưỡng làm tròn gõ từng ký tự từ ô trống: giữ được các bước gõ dở "0," "0,7" "0,70", lưu ra số (review 5.12.3 H1)', async () => {
    signIn(['admin.catalog:view', 'admin.catalog:update']);
    const { calls } = mockApi();
    renderPane();
    const roundUp = await screen.findByRole('textbox', { name: 'Làm tròn lên khi phần lẻ từ' });
    for (const step of ['', '0', '0,', '0,3']) fireEvent.change(roundUp, { target: { value: step } });
    expect(roundUp).toHaveValue('0,3');
    expect(await screen.findByText('7,3 → 8 ngày; 7,5 → 8 ngày; 7,8 → 8 ngày')).toBeInTheDocument();
    for (const step of ['0,', '0,7', '0,70']) fireEvent.change(roundUp, { target: { value: step } });
    expect(roundUp).toHaveValue('0,70');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: 'PUT', body: { productionRoundUpFrom: 0.7 } });
  });

  it('bấm một ngày trên lịch năm: popup đặt ngày điền sẵn ngày đó, gửi ĐVCS đang xem', async () => {
    signIn(['admin.catalog:view', 'admin.catalog:update']);
    const { calls } = mockApi();
    renderPane();
    const day = `${YEAR}-03-02`;
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`${dmy(day)}: `) }));
    const dialog = await screen.findByRole('dialog', { name: 'Đặt ngày nghỉ, làm bù' });
    expect(within(dialog).getByRole('textbox', { name: 'Tên' })).toHaveValue('');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Tên' }), { target: { value: ' Nghỉ bảo trì ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ path: '/admin/catalogs/work-calendars/days', method: 'POST', body: { branchCodes: ['A01'], from: day, to: day, dayType: 'OFF', name: 'Nghỉ bảo trì' } });
  });

  it('ĐVCS đã ngừng dùng: chỉ xem và xóa ngày, không thêm, không lưu cấu hình', async () => {
    signIn(['admin.catalog:view', 'admin.catalog:update'], 'A09');
    mockApi();
    renderPane();
    const tet = `${dmy(`${YEAR}-02-14`)} – ${dmy(`${YEAR}-02-22`)}`;
    const row = (await screen.findByText(tet)).closest('tr')!;
    expect(within(row).getByRole('button', { name: `Xóa ${tet}` })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm ngày nghỉ, làm bù' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lưu cấu hình' })).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(`${dmy(`${YEAR}-02-16`)}: `) })).toBeNull();
  });

  it('chỉ có quyền xem: không có nút thêm, xóa, lưu; ô ngày không bấm được', async () => {
    signIn(['admin.catalog:view']);
    mockApi();
    renderPane();
    await screen.findByText(`${dmy(`${YEAR}-02-14`)} – ${dmy(`${YEAR}-02-22`)}`);
    expect(screen.queryByRole('button', { name: 'Thêm ngày nghỉ, làm bù' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Xóa / })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lưu cấu hình' })).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(`${dmy(`${YEAR}-02-16`)}: `) })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Nghỉ Chủ nhật' })).toBeDisabled();
  });
});
