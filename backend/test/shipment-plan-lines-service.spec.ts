import { presentPlanLine, ShipmentService } from '../src/modules/order/shipment.service';

// Không cần database: màu cỡ của GET /shipment-plans/:id (khung Màu cỡ, task 5.9.15) áp mức cột của cột nguồn
const line = { colorName: 'Red', sizeName: '36', originalQty: 30, plannedQty: 10, remainingQty: 20, planQty: 12 };
const keys = (o: Record<string, unknown>) => ['originalQty', 'plannedQty', 'remainingQty'].map((k) => (k in o ? o[k] : 'absent'));

describe('Màu cỡ của kế hoạch (service)', () => {
  it('Số lượng gốc theo SL của PO, SL đã tạo KHXH theo SL KHXH, SL còn lại theo mức chặt hơn của hai cột', () => {
    expect(presentPlanLine(line, undefined, undefined)).toEqual(line);
    expect(keys(presentPlanLine(line, 'READONLY', 'EDITABLE'))).toEqual([30, 10, 20]);
    expect(keys(presentPlanLine(line, 'MASKED', undefined))).toEqual(['***', 10, '***']);
    expect(keys(presentPlanLine(line, undefined, 'MASKED'))).toEqual([30, '***', '***']);
    expect(keys(presentPlanLine(line, 'HIDDEN', 'MASKED'))).toEqual(['absent', '***', 'absent']);
    expect(keys(presentPlanLine(line, undefined, 'HIDDEN'))).toEqual([30, 'absent', 'absent']);
    // SL KHXH để interceptor áp theo tên khóa
    expect(presentPlanLine(line, 'HIDDEN', 'HIDDEN')).toEqual({ colorName: 'Red', sizeName: '36', planQty: 12 });
  });

  it('GET /:id: không có quyền xem PO thì SL PO như bị Ẩn; mức cột đọc của order.shipment và order.po', async () => {
    const plans = {
      getById: jest.fn(async () => ({ Id: 5, PlanNo: 'KH-A01-000005', SalesOrderId: 9, SyncedAt: null, ShipDate: null, PlanQty: 12 })),
      plannedBySalesOrder: jest.fn(async () => [{ ColorName: 'Red', SizeName: '36', PlanQty: 10 }]),
    };
    const planColorSizes = { listByParent: jest.fn(async () => [{ ColorName: 'Red', SizeName: '36', OriginalQty: 30, PlanQty: 12 }]) };
    const planPos = { listByParent: jest.fn(async () => [{ SalesOrderPoId: 1 }]) };
    const policy: Record<string, Map<string, string>> = { 'order.shipment': new Map(), 'order.po': new Map() };
    const fields = { levels: jest.fn(async (_a: unknown, resource: string) => ({ fields: [], levels: policy[resource] })) };
    const service = new ShipmentService(null as any, plans as any, planColorSizes as any, planPos as any, null as any, null as any, null as any, null as any, null as any, null as any, fields as any, null as any, null as any);
    const userWith = (permissions: string[]) => ({ userId: 1, username: 'u', branchCode: 'A01', isAggregate: false, tokenType: 'access', access: { permissions: new Set(permissions) } }) as any;

    const full = await service.get(userWith(['order.shipment:view', 'order.po:view']), 5);
    expect(full.poIds).toEqual([1]);
    expect(full.lines).toEqual([line]);
    // SL đã tạo KHXH là của kế hoạch khác: bỏ chính kế hoạch đang xem
    // SL đã tạo KHXH chỉ tính kế hoạch dùng chung PO của kế hoạch này (quyết định 15.3)
    expect(plans.plannedBySalesOrder).toHaveBeenCalledWith([9], { excludePlanId: 5, sharingPoIds: [1] }, undefined);

    const noPo = await service.get(userWith(['order.shipment:view']), 5);
    expect(keys(noPo.lines[0])).toEqual(['absent', 10, 'absent']);

    policy['order.shipment'] = new Map([['planQty', 'MASKED']]);
    policy['order.po'] = new Map([['qty', 'READONLY']]);
    const masked = await service.get(userWith(['order.shipment:view', 'order.po:view']), 5);
    expect(keys(masked.lines[0])).toEqual([30, '***', '***']);
    expect(fields.levels.mock.calls.map((c) => c[1])).toEqual(expect.arrayContaining(['order.shipment', 'order.po']));
  });
});
