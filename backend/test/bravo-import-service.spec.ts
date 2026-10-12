import { Logger } from '@nestjs/common';
import type { AppliedImport } from '../src/modules/order/bravo-order-import.repository';
import { BravoOrderImportService } from '../src/modules/order/bravo-order-import.service';
import type { ImportPlan } from '../src/modules/order/bravo-order.mapping';

// Không cần database: thử lại khi bị chọn hủy vì khóa chéo, xếp lần chạy sau (ADR 0013 mục 8, review 5.9.10 M4.2, L4.3)
const deadlock = () => Object.assign(new Error('Transaction was deadlocked on lock resources with another process and has been chosen as the deadlock victim.'), { number: 1205 });
const emptyPlan = (): ImportPlan => ({ newOrders: [], orderUpdates: [], hashUpdates: [], newPos: [], poUpdates: [], cellUpdates: [], cellsKept: [], branchChanged: [], factoryTooLong: [], goneOrders: 0, gonePos: 0, skipped: new Map() });
const applied = (over: Partial<AppliedImport> = {}): AppliedImport => ({ newOrders: 0, updatedOrders: 0, baselined: 0, newPos: 0, updatedPos: 0, cellUpdates: 0, cellsKept: [], newByBranch: {}, ...over });

function make(apply: jest.Mock) {
  const order = { ProductId: 1, BranchCode: 'A01' };
  const feed = { orderSource: jest.fn(async () => ({ orders: [order], pos: [], cells: [] })), onOrderSourceSynced: jest.fn(), osmFactories: jest.fn(async () => null) };
  const catalogs = { items: jest.fn(async () => []), productionFactories: jest.fn(async () => []) };
  const branches = { activeCodes: jest.fn(async () => ['A01']) };
  const audit = { log: jest.fn(async () => undefined) };
  return { service: new BravoOrderImportService(feed as any, { apply } as any, catalogs as any, branches as any, audit as any), audit };
}

describe('Nạp tăng dần đơn hàng BRAVO: chạy, thử lại', () => {
  beforeAll(() => Logger.overrideLogger(false));
  afterEach(() => jest.useRealTimers());

  it('bị SQL Server chọn hủy vì khóa chéo: thử lại sau 2 giây; lỗi khác thì báo ngay', async () => {
    jest.useFakeTimers();
    const apply = jest.fn().mockRejectedValueOnce(deadlock()).mockResolvedValueOnce({ plan: emptyPlan(), applied: applied({ newOrders: 1 }) });
    const { service, audit } = make(apply);
    const result = service.run();
    await jest.advanceTimersByTimeAsync(2_000);
    await expect(result).resolves.toMatchObject({ newOrders: 1 });
    expect(apply).toHaveBeenCalledTimes(2);
    expect(audit.log).toHaveBeenCalledTimes(1);

    const broken = jest.fn().mockRejectedValue(new Error('Lỗi ràng buộc'));
    await expect(make(broken).service.run()).rejects.toThrow('Lỗi ràng buộc');
    expect(broken).toHaveBeenCalledTimes(1);
  });

  it('không ghi gì thì không ghi nhật ký', async () => {
    const { service, audit } = make(jest.fn().mockResolvedValue({ plan: emptyPlan(), applied: applied() }));
    await service.run();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('gọi trong lúc đang nạp: xếp đúng một lần chạy sau, lỗi của lần đó về bên gọi (để việc sau đồng bộ thử lại)', async () => {
    let release!: () => void;
    const apply = jest
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (release = () => r({ plan: emptyPlan(), applied: applied() }))))
      .mockRejectedValueOnce(new Error('Lần sau lỗi'));
    const { service } = make(apply);
    const first = service.run();
    await new Promise((r) => setImmediate(r));
    const second = service.run();
    const third = service.run();
    expect(third).toBe(second);
    release();
    await expect(first).resolves.toBeTruthy();
    await expect(second).rejects.toThrow('Lần sau lỗi');
    expect(apply).toHaveBeenCalledTimes(2);
  });
});
