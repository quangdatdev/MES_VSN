import { presentPlanPo, ShipmentService } from '../src/modules/order/shipment.service';
import type { SalesOrderPoRow } from '../src/modules/order/order.repositories';

// Không cần database: lưới "PO của kế hoạch" (task 5.9.14) tính SL đã xác nhận, chưa xác nhận và áp mức cột của cột nguồn
const po = (over: Partial<SalesOrderPoRow> = {}): SalesOrderPoRow =>
  ({
    Id: 1,
    SalesOrderId: 9,
    PoCode: 'PO-1',
    PoNumber: '4500001',
    CustomerName: 'K',
    StyleCode: 'S',
    Qty: 300,
    Destination: 'DE',
    PackingListCode: null,
    CustomsDeclarationNo: null,
    SyncedAt: null,
    ShipDate: new Date('2027-06-30T00:00:00Z'),
    StatusCode: 'DRAFT',
    ConfirmedAt: null,
    ConfirmedBy: null,
    BranchCode: 'A01',
    CreatedAt: new Date(),
    CreatedBy: null,
    ModifiedAt: null,
    ModifiedBy: null,
    ...over,
  }) as SalesOrderPoRow;
const confirmed = po({ Id: 2, StatusCode: 'CONFIRMED', ConfirmedAt: new Date('2026-10-10T03:00:00Z'), Qty: 200 });

describe('PO của kế hoạch (service)', () => {
  it('SL đã xác nhận, chưa xác nhận theo cả PO; ngày xuất dạng YYYY-MM-DD', () => {
    expect(presentPlanPo(po(), undefined, undefined)).toEqual({
      id: 1,
      poCode: 'PO-1',
      poNumber: '4500001',
      destination: 'DE',
      shipDate: '2027-06-30',
      qty: 300,
      statusCode: 'DRAFT',
      confirmedAt: null,
      confirmedQty: 0,
      unconfirmedQty: 300,
    });
    expect(presentPlanPo(confirmed, 'READONLY', 'EDITABLE')).toMatchObject({ confirmedAt: new Date('2026-10-10T03:00:00Z'), confirmedQty: 200, unconfirmedQty: 0 });
  });

  it('cột suy ra theo mức chặt hơn của Số lượng và Trạng thái; bị Che thì luôn "***" (để trống, số 0 là lộ trạng thái)', () => {
    const keys = (o: Record<string, unknown>) => ['confirmedAt', 'confirmedQty', 'unconfirmedQty'].map((k) => (k in o ? o[k] : 'absent'));
    expect(keys(presentPlanPo(po(), 'MASKED', undefined))).toEqual([null, '***', '***']);
    expect(keys(presentPlanPo(po(), undefined, 'MASKED'))).toEqual(['***', '***', '***']);
    expect(keys(presentPlanPo(po(), 'HIDDEN', 'MASKED'))).toEqual(['***', 'absent', 'absent']);
    expect(keys(presentPlanPo(confirmed, undefined, 'HIDDEN'))).toEqual(['absent', 'absent', 'absent']);
  });

  it('đọc PO đã gắn với kế hoạch theo quyền xem; PO ngoài phạm vi đếm ở hiddenCount; kế hoạch không gắn PO thì không đọc PO', async () => {
    const planPos = { listByParent: jest.fn(async (_s: unknown, planId: number) => (planId === 5 ? [{ SalesOrderPoId: 1 }, { SalesOrderPoId: 2 }, { SalesOrderPoId: 2 }, { SalesOrderPoId: 3 }] : [])) };
    const pos = { listAll: jest.fn(async (_s: unknown, _o: { sort: string }, _a: string) => [confirmed, po()]) };
    const fields = { levels: jest.fn(async () => ({ fields: [], levels: new Map([['qty', 'MASKED']]) })) };
    const service = new ShipmentService(null as any, null as any, null as any, planPos as any, null as any, pos as any, null as any, null as any, null as any, null as any, fields as any, null as any);
    const user = { userId: 1, username: 'u', branchCode: 'A01', isAggregate: false, tokenType: 'access', access: {} } as any;

    const res = await service.posOfPlan(user, 5);
    expect(res.hiddenCount).toBe(1);
    expect(res.items.map((r) => [r.id, r.confirmedQty])).toEqual([
      [2, '***'],
      [1, '***'],
    ]);
    const [, opts, action] = pos.listAll.mock.calls[0];
    expect(action).toBe('view');
    expect(opts.sort).toBe('ShipDate:asc,PoNumber:asc');
    expect(fields.levels).toHaveBeenCalledWith(user.access, 'order.po');

    expect(await service.posOfPlan(user, 6)).toEqual({ items: [], hiddenCount: 0 });
    expect(pos.listAll).toHaveBeenCalledTimes(1);
  });

  it('thứ tự chỉ theo cột xem được: Ngày xuất, PO# bị Ẩn/Che thì bỏ khỏi thứ tự; không còn cột nào thì theo Id', async () => {
    const sortWith = async (policy: Record<string, string>) => {
      const planPos = { listByParent: jest.fn(async () => [{ SalesOrderPoId: 1 }]) };
      const pos = { listAll: jest.fn(async (_s: unknown, _o: { sort: string }, _a: string) => [po()]) };
      const fields = { levels: jest.fn(async () => ({ fields: [], levels: new Map(Object.entries(policy)) })) };
      const service = new ShipmentService(null as any, null as any, null as any, planPos as any, null as any, pos as any, null as any, null as any, null as any, null as any, fields as any, null as any);
      await service.posOfPlan({ userId: 1, branchCode: 'A01', isAggregate: false, tokenType: 'access', access: {} } as any, 5);
      return pos.listAll.mock.calls[0][1].sort;
    };
    expect(await sortWith({ shipDate: 'READONLY' })).toBe('ShipDate:asc,PoNumber:asc');
    expect(await sortWith({ shipDate: 'HIDDEN' })).toBe('PoNumber:asc');
    expect(await sortWith({ poNumber: 'MASKED' })).toBe('ShipDate:asc');
    expect(await sortWith({ shipDate: 'MASKED', poNumber: 'HIDDEN' })).toBe('Id:asc');
  });
});
