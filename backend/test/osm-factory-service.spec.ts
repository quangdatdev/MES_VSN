import { Logger } from '@nestjs/common';
import { OsmFactoryService } from '../src/modules/order/osm-factory.service';

// Không cần database: bước cập nhật Nhà máy SX theo OSM (ADR 0013 mục 9, review OSM M4, L2)
const deadlock = () => Object.assign(new Error('chosen as the deadlock victim'), { number: 1205 });

function make(factories: Map<number, string> | null, apply: jest.Mock) {
  const feed = { osmFactories: jest.fn(async () => factories), onOsmFactorySynced: jest.fn() };
  const audit = { log: jest.fn(async () => undefined) };
  return { service: new OsmFactoryService(feed as any, { applyOsmFactories: apply } as any, audit as any), feed, audit };
}

describe('Cập nhật Nhà máy SX theo OSM', () => {
  beforeAll(() => Logger.overrideLogger(false));
  afterEach(() => jest.useRealTimers());

  it('chưa đồng bộ OSM, hoặc ghép không ra sản phẩm nào: không ghi gì (không mở khóa hàng loạt)', async () => {
    const apply = jest.fn();
    expect(await make(null, apply).service.run()).toBeNull();
    expect(await make(new Map(), apply).service.run()).toBeNull();
    expect(apply).not.toHaveBeenCalled();
  });

  it('có thay đổi thì ghi nhật ký; không đổi gì thì không ghi', async () => {
    const changed = make(new Map([[1, 'A,B']]), jest.fn().mockResolvedValue({ updated: 2, unlocked: 1, tooLong: [] }));
    expect(await changed.service.run()).toEqual({ updated: 2, unlocked: 1, tooLong: [] });
    expect(changed.audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionCode: 'OSM_FACTORY_IMPORT' }));
    const same = make(new Map([[1, 'A,B']]), jest.fn().mockResolvedValue({ updated: 0, unlocked: 0, tooLong: [] }));
    await same.service.run();
    expect(same.audit.log).not.toHaveBeenCalled();
  });

  it('bị hủy vì khóa chéo thì thử lại sau 2 giây; gọi lúc đang chạy thì xếp đúng một lần sau', async () => {
    jest.useFakeTimers();
    const apply = jest.fn().mockRejectedValueOnce(deadlock()).mockResolvedValue({ updated: 1, unlocked: 0, tooLong: [] });
    const { service } = make(new Map([[1, 'A']]), apply);
    const first = service.run();
    const second = service.run();
    expect(service.run()).toBe(second);
    await jest.advanceTimersByTimeAsync(2_000);
    await expect(first).resolves.toMatchObject({ updated: 1 });
    await expect(second).resolves.toMatchObject({ updated: 1 });
    expect(apply).toHaveBeenCalledTimes(3);
  });
});
