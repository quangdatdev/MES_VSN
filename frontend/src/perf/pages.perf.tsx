import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, describe, it, vi } from 'vitest';
import FieldPoliciesPage from '../features/admin/FieldPoliciesPage';
import PermissionsPage from '../features/admin/PermissionsPage';
import UsersPage from '../features/admin/UsersPage';
import SalesOrderPage from '../features/order/SalesOrderPage';
import PrepPlanPage from '../features/sewing/PrepPlanPage';
import { api } from '../lib/api';
import { measure, printResults, record, settle, Shell, signIn } from './measure';

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

function serve(routes: (path: string) => unknown) {
  vi.mocked(api).mockImplementation((async (path: string) => routes(path ?? '')) as unknown as typeof api);
}

const paged = <T,>(items: T[]) => ({ items, total: items.length * 3, page: 1, pageSize: 100 });

/** Gõ từng ký tự vào ô, mỗi ký tự là một lần đo; chờ debounce và truy vấn xong (không tính) */
async function typeInto(input: HTMLElement, text: string) {
  const out = [];
  for (let i = 1; i <= text.length; i++) out.push(await measure(() => fireEvent.change(input, { target: { value: text.slice(0, i) } })));
  await settle(450);
  return out;
}

afterEach(() => vi.mocked(api).mockReset());

describe('Màn thật với dữ liệu giả', () => {
  afterAll(() => printResults('Các màn'));

  it('Thông tin đơn hàng: gõ ô lọc Mã hàng, bấm chọn dòng', async () => {
    signIn(['order.allocation:view', 'order.allocation:create', 'order.allocation:update']);
    const orders = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      orderNo: `DH-A01-${String(i + 1).padStart(6, '0')}`,
      customerName: `KHÁCH GIẢ ${i % 7}`,
      styleCode: `MA-${1000 + i}`,
      season: 'FW26',
      orderType: 'SXXK',
      productName: `Sản phẩm giả ${i}`,
      staffName: 'Người lập',
      qty: 1000 + i,
      unitName: 'Chiếc',
      unitPrice: 4.5,
      amount: 4500,
      cmPrice: 1.2,
      syncedAt: '2026-10-01',
      shipDate: '2026-11-15',
      statusCode: 'NEW',
      branchCode: 'A01',
      productionFactoryCode: null,
      createdAt: '2026-10-01T02:00:00.000Z',
    }));
    serve((p) =>
      p.startsWith('/order/sales-orders/options')
        ? { customers: [], seasons: ['FW26'], orderTypes: [], orderTypeNames: {}, units: ['Chiếc'], factories: [] }
        : p.startsWith('/order/sales-orders')
          ? paged(orders)
          : p.startsWith('/me/branch-names')
            ? [{ code: 'A01', name: 'Nhà máy 1' }]
            : [],
    );
    render(
      <Shell path="/order/info">
        <SalesOrderPage />
      </Shell>,
    );
    await screen.findByText('DH-A01-000100', {}, { timeout: 15000 });
    record('Thông tin đơn hàng: mỗi phím gõ ô Mã hàng', await typeInto(screen.getByLabelText('Mã hàng'), 'MA-10'));
    const rows = within(screen.getByRole('table', { name: 'Danh sách đơn hàng' })).getAllByRole('row').slice(1);
    const clicks = [];
    for (const i of [2, 9, 30, 60]) clicks.push(await measure(() => fireEvent.click(rows[i])));
    record('Thông tin đơn hàng: bấm chọn dòng', clicks);
  });

  it('Kế hoạch chuẩn bị SX (chế độ xem, 16 bước): gõ ô lọc, bấm chọn dòng', async () => {
    signIn(['order.prep:view']);
    const steps = Array.from({ length: 16 }, (_, i) => ({ id: i + 1, code: `CB${i + 1}`, name: `Bước giả ${i + 1}`, description: null, planDays: i, performer: null, dataSource: null, sortOrder: i, isActive: true }));
    const items = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      branchCode: 'A01',
      planNo: `KH-${i}`,
      customerName: 'KHÁCH GIẢ',
      styleCode: `MA-${2000 + i}`,
      productName: 'Áo giả',
      lineCode: `A01-L0${(i % 9) + 1}`,
      lineQty: 500,
      startDate: '2026-10-20',
      styleType: null,
      confirmedQty: null,
      priorityFactor: null,
      steps: steps.map((s) => ({ stepId: s.id, planDays: s.planDays, custom: false, planDate: '2026-10-10', doneDate: s.id % 3 ? '2026-10-09' : null, state: 'DONE' })),
      statusCode: 'NOT_DUE',
      createdAt: '2026-10-01T02:00:00.000Z',
      canEdit: false,
    }));
    serve((p) =>
      p.startsWith('/sewing/prep/summary')
        ? { today: '2026-10-11', total: 100, ready: 1, atRisk: 2, late: 3 }
        : p.startsWith('/sewing/prep')
          ? { ...paged(items), today: '2026-10-11', stepInfo: steps }
          : p.startsWith('/me/branch-names')
            ? [{ code: 'A01', name: 'Nhà máy 1' }]
            : [],
    );
    render(
      <Shell path="/order/prep?week=all">
        <PrepPlanPage />
      </Shell>,
    );
    await screen.findByText('MA-2099', {}, { timeout: 15000 });
    record('Kế hoạch chuẩn bị SX: mỗi phím gõ ô Mã hàng', await typeInto(screen.getByLabelText('Mã hàng'), 'MA-20'));
    const rows = within(screen.getByRole('table', { name: 'Kế hoạch chuẩn bị SX' })).getAllByRole('row').slice(2);
    const clicks = [];
    for (const i of [2, 9, 30, 60]) clicks.push(await measure(() => fireEvent.click(rows[i])));
    record('Kế hoạch chuẩn bị SX: bấm chọn dòng', clicks);
  });

  it('Chính sách cột (30 cột × 10 vai trò): đổi một ô', async () => {
    signIn(['admin.fieldpolicy:view', 'admin.fieldpolicy:update']);
    const fields = Array.from({ length: 30 }, (_, i) => ({ code: `f${i}`, name: `Cột giả ${i}`, description: null, isSensitive: i % 10 === 0 }));
    const roles = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, code: `R${i}`, name: `Vai trò ${i}` }));
    serve((p) =>
      p.startsWith('/admin/resource-fields')
        ? [{ id: 1, code: 'order.allocation', name: 'Thông tin đơn hàng', fields }]
        : p.startsWith('/admin/field-policies')
          ? { resource: { id: 1, code: 'order.allocation', name: 'Thông tin đơn hàng' }, fields, roles, policies: [] }
          : [],
    );
    render(
      <Shell path="/admin/field-policies">
        <FieldPoliciesPage />
      </Shell>,
    );
    await screen.findAllByLabelText('Cột giả 29 với Vai trò 9', {}, { timeout: 15000 });
    const changes = [];
    for (const [f, r] of [
      [1, 1],
      [5, 3],
      [12, 7],
      [20, 9],
    ]) {
      fireEvent.click(screen.getAllByLabelText(`Cột giả ${f} với Vai trò ${r}`)[0]);
      const option = await screen.findByRole('option', { name: 'Che' });
      changes.push(await measure(() => fireEvent.click(option)));
    }
    record('Chính sách cột: đổi một ô', changes);
  });

  it('Phân quyền (50 màn × 5 hành động): tích một ô', async () => {
    signIn(['admin.permission:view', 'admin.permission:update']);
    const actions = ['view', 'create', 'update', 'delete', 'export'];
    let pid = 1;
    const modules = Array.from({ length: 10 }, (_, m) => ({
      code: `m${m}`,
      name: `Nhóm ${m}`,
      resources: Array.from({ length: 5 }, (_, r) => ({ id: m * 10 + r, code: `m${m}.r${r}`, name: `Màn ${m}-${r}`, scopeType: 'BRANCH' as const, permissions: actions.map((a) => ({ id: pid++, code: `m${m}.r${r}:${a}`, action: a })) })),
    }));
    serve((p) =>
      p === '/admin/roles'
        ? [{ id: 1, code: 'PLANNER', name: 'Kế hoạch', description: null, isActive: true, isSystem: false, permissionCount: 0, userCount: 0 }]
        : p === '/admin/permissions'
          ? { actions, modules }
          : p.startsWith('/admin/roles/1/permissions')
            ? { permissionIds: [1, 2, 3, 10, 20, 30] }
            : [],
    );
    render(
      <Shell path="/admin/permissions">
        <PermissionsPage />
      </Shell>,
    );
    await screen.findByLabelText('Kế hoạch – Nhóm 9 – Màn 9-4: Xem', {}, { timeout: 15000 });
    const ticks = [];
    for (const [m, r, a] of [
      [0, 1, 'Xem'],
      [3, 2, 'Sửa'],
      [6, 4, 'Xóa'],
      [9, 0, 'Thêm'],
      [2, 2, 'Xuất file'],
    ] as const)
      ticks.push(await measure(() => fireEvent.click(screen.getByLabelText(`Kế hoạch – Nhóm ${m} – Màn ${m}-${r}: ${a}`))));
    record('Phân quyền: tích một ô', ticks);
  });

  it('Người dùng (100 dòng): gõ ô tìm', async () => {
    signIn(['admin.user:view', 'admin.user:update', 'admin.permission:update']);
    const users = Array.from({ length: 100 }, (_, i) => ({ id: i + 10, username: `nguoi.dung${i}`, fullName: `Người dùng giả ${i}`, email: null, isActive: true, isLocked: false, lastLoginAt: null, roleIds: [1, 2], branchIds: [1], defaultBranchId: 1 }));
    serve((p) =>
      p.startsWith('/admin/users')
        ? paged(users)
        : p === '/admin/roles'
          ? [
              { id: 1, code: 'PLANNER', name: 'Kế hoạch', description: null, isActive: true, isSystem: false, permissionCount: 0, userCount: 0 },
              { id: 2, code: 'QC', name: 'Chất lượng', description: null, isActive: true, isSystem: false, permissionCount: 0, userCount: 0 },
            ]
          : p === '/admin/branches'
            ? [{ id: 1, code: 'A01', name: 'Nhà máy 1', isActive: true, isAggregate: false }]
            : [],
    );
    render(
      <Shell path="/admin/users">
        <UsersPage />
      </Shell>,
    );
    await screen.findByText('nguoi.dung99', {}, { timeout: 15000 });
    record('Người dùng: mỗi phím gõ ô tìm', await typeInto(screen.getByLabelText('Tìm người dùng'), 'nguoi'));
  });
});
