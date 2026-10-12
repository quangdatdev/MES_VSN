import { Errors } from '../src/common/app.exception';
import type { PoAllocationListRow } from '../src/modules/order/po-allocation.repository';
import { PoAllocationService } from '../src/modules/order/po-allocation.service';

// Không cần database: màn Phân bổ PO (task 5.9.12, Phase 5.10) dựng điều kiện, bỏ trường bị Ẩn/Che, sắp xếp mặc định, các trường
// suy ra từ Nhà máy SX theo mức của Nhà máy SX, luồng đổi Nhà máy SX (A00, ĐVCS khác, xem trước, Theo OSM, nhật ký)
const row = (over: Partial<PoAllocationListRow> = {}): PoAllocationListRow =>
  ({
    Id: '11',
    RowHash: Buffer.alloc(32),
    Brand: 'B1',
    Season: 'S1',
    PoNo: 'PO1',
    SoNo: 'SO1',
    ShipMode: 'SEA',
    StyleName: 'Áo thử',
    StyleNo: 'ST1',
    Color: 'Navy',
    EtdActualDate: new Date('2026-10-01T00:00:00Z'),
    EtdRevisedDate: null,
    OsmFactoryCode: 'VIET DUC',
    ProductionFactoryCode: 'VIET DUC',
    IsFactoryManual: false,
    IsInOsm: true,
    SyncedAt: new Date('2026-10-12T03:00:00Z'),
    CreatedAt: new Date(),
    CreatedBy: null,
    ModifiedAt: null,
    ModifiedBy: null,
    BranchCode: 'A01',
    ...over,
  }) as unknown as PoAllocationListRow;

type Level = 'HIDDEN' | 'MASKED' | 'READONLY' | 'EDITABLE';

/** `policy`: mức của từng cột với người xem; Ẩn, Che là không xem được nguyên giá trị */
function make(policy: Record<string, Level> = {}) {
  const repo = {
    list: jest.fn(async (_s: unknown, opts: any) => ({
      items: [row(), row({ Id: 12, PoNo: 'PO2', ProductionFactoryCode: 'MEKO', OsmFactoryCode: 'X', IsFactoryManual: true, IsInOsm: false, BranchCode: null })],
      total: 2,
      page: opts.page,
      pageSize: opts.pageSize,
    })),
    refreshState: jest.fn(async () => ({
      Id: 1,
      RefreshedAt: new Date('2026-10-12T03:05:00Z') as Date | null,
      SourceSyncedAt: new Date('2026-10-12T03:00:00Z') as Date | null,
      SourceRows: 20,
      PreviousRows: 30,
      InsertedRows: 0,
      UpdatedRows: 0,
      RemovedRows: 0,
      MissingManualRows: 0,
      KeptAbsentRows: 0,
      UnknownFactories: 0,
      MaxShrinkPercent: 20,
      SkippedReason: null as 'EMPTY' | 'SHRINK' | null,
    })),
    distinctValues: jest.fn(async (_s: unknown, _c: unknown, _o: unknown): Promise<{ rows: unknown[]; truncated: boolean }> => ({ rows: ['A01', null], truncated: false })),
    distinct: jest.fn(async (_s: unknown, col: string) => (col === 'Brand' ? ['B1'] : ['S1'])),
    countFor: jest.fn(async (_s: unknown, _o: unknown, _a: unknown) => 2),
    listAll: jest.fn(async (_s: unknown, _o: unknown) => [row(), row({ Id: 12, ProductionFactoryCode: 'LẠ', IsFactoryManual: true, IsInOsm: false, BranchCode: null })]),
    assertWritable: jest.fn(async (scope: { isAggregate: boolean }) => {
      if (scope.isAggregate) throw Errors.aggregateReadOnly();
    }),
    withWriteLock: jest.fn(async (work: (trx: unknown) => Promise<unknown>) => work({})),
    target: jest.fn(async (_s: unknown, _ids: number[], _trx: unknown) => ({
      found: 1,
      keys: 1,
      rows: 2,
      groups: [{ PoNo: 'PO1', SoNo: null, StyleNo: 'ST1', Color: 'Navy', ProductionFactoryCode: 'VIET DUC', IsFactoryManual: false, n: 2 }],
      otherBranch: 0,
      notWritable: 0,
      notVisible: 0,
      removable: 0,
    })),
    setManual: jest.fn(async (_s: unknown, _ids: number[], _code: string, _trx: unknown) => 2),
    resetToOsm: jest.fn(async (_s: unknown, _ids: number[], _trx: unknown) => ({ updated: 2, removed: 0 })),
  };
  const feed = { osmPoSourceActive: jest.fn(async () => true as boolean) };
  const levels = new Map(Object.entries(policy));
  const blind = (f: string) => levels.get(f) === 'HIDDEN' || levels.get(f) === 'MASKED';
  const fields = {
    unreadable: jest.fn(async (_u: unknown, _r: string, fs: string[]) => new Set(fs.filter(blind))),
    levels: jest.fn(async () => ({ fields: [], levels })),
  };
  const permissions = { accessOf: jest.fn(async () => ({})) };
  const catalogs = {
    productionFactories: jest.fn(async () => [
      { code: 'VIET DUC', name: 'Việt Đức', branchCode: 'A01', isActive: true },
      { code: 'MEKO', name: 'Meko', branchCode: null, isActive: true },
      { code: 'CU', name: 'Nhà máy cũ', branchCode: 'A01', isActive: false },
    ]),
    branchNames: jest.fn(async () => new Map([['A01', 'Vietsun Đà Nẵng']])),
  };
  const exporter = { csv: jest.fn(async (_u: unknown, _r: string, _c: { key: string }[], rows: unknown[], _f: string) => rows) };
  const audit = { log: jest.fn(async () => undefined) };
  const service = new PoAllocationService(repo as any, feed as any, fields as any, permissions as any, catalogs as any, exporter as any, audit as any);
  return { service, repo, feed, exporter, audit };
}
const access = { productionFactories: ['VIET DUC'] };
const user = { userId: 1, username: 'u', branchCode: 'A01', isAggregate: false, tokenType: 'access', access } as any;
const aggregate = { ...user, branchCode: 'A00', isAggregate: true } as any;
const query = (over: Record<string, unknown> = {}) => ({ page: 2, pageSize: 100, ...over }) as any;

/** Tên cột của một mục ORDER BY (biểu thức ĐVCS tra bảng JSON của danh mục) */
function orderCols(orderBy: { expr: { toOperationNode(): unknown }; dir: string }[]) {
  return orderBy.map((o) => {
    const node = JSON.stringify(o.expr.toOperationNode());
    if (node.includes('OPENJSON')) return 'BranchCode';
    const names = [...node.matchAll(/"name":"(\w+)"/g)].map((m) => m[1]);
    return names[names.length - 1];
  });
}

describe('Phân bổ PO (service)', () => {
  it('danh sách: ô tìm PO, SO; mặc định ETD-Revised mới lên trước, thứ tự phụ chỉ còn Id (repository thêm); STT liên tục theo trang', async () => {
    const { service, repo } = make();
    const res = await service.list(user, query({ q: 'PO' }));
    const opts = repo.list.mock.calls[0][1];
    expect(opts).toMatchObject({ page: 2, pageSize: 100, q: 'PO', searchExclude: [] });
    expect(orderCols(opts.orderBy)).toEqual(['EtdRevisedDate']);
    expect(opts.orderBy[0].dir).toBe('desc');
    expect(res.items.map((r) => [r.id, r.rowNo])).toEqual([
      [11, 101],
      [12, 102],
    ]);
    expect(res.items[0]).toMatchObject({ etdActual: '2026-10-01', etdRevised: null, factoryName: 'VIET DUC', osmFactoryName: 'VIET DUC', isFactoryManual: false, isInOsm: true, branchCode: 'A01' });
    expect(res.items[1]).toMatchObject({ factoryName: 'MEKO', osmFactoryName: 'X', isFactoryManual: true, isInOsm: false, branchCode: null });
    expect(res).toMatchObject({ syncedAt: new Date('2026-10-12T03:00:00Z'), sourceActive: true, lastRefresh: null });
  });

  it('lần làm mới gần nhất bị bỏ qua hoặc giữ dòng vắng thì trang trả cảnh báo (chỉ số đếm); chưa làm mới thì hỏi nguồn có bật không', async () => {
    const { service, repo, feed } = make();
    const kept = { ...(await repo.refreshState()), SkippedReason: 'SHRINK' as const, KeptAbsentRows: 7 };
    repo.refreshState.mockResolvedValueOnce(kept);
    expect((await service.list(user, query())).lastRefresh).toEqual({ at: kept.RefreshedAt, reason: 'SHRINK', sourceRows: 20, previousRows: 30, keptAbsent: 7, maxShrinkPercent: 20 });
    repo.refreshState.mockResolvedValueOnce({ ...kept, SourceSyncedAt: null, RefreshedAt: null, SkippedReason: null });
    feed.osmPoSourceActive.mockResolvedValueOnce(false);
    expect(await service.list(user, query())).toMatchObject({ syncedAt: null, sourceActive: false, lastRefresh: null });
  });

  it('trường bị Ẩn/Che: bỏ khỏi ô tìm và thứ tự; sắp xếp theo trường lạ hoặc bị che thì theo mặc định', async () => {
    const { service, repo } = make({ po: 'HIDDEN', so: 'MASKED', color: 'MASKED' });
    await service.list(user, query({ q: 'PO', sort: 'color:asc' }));
    const opts = repo.list.mock.calls[0][1];
    expect(opts.searchExclude).toEqual(['PoNo', 'SoNo']);
    expect(orderCols(opts.orderBy)).not.toEqual(expect.arrayContaining(['PoNo', 'SoNo', 'Color']));
    expect(orderCols(opts.orderBy)[0]).toBe('EtdRevisedDate');
    await service.list(user, query({ sort: 'Brand; DROP TABLE x:asc' }));
    expect(orderCols(repo.list.mock.calls[1][1].orderBy)[0]).toBe('EtdRevisedDate');
    await service.list(user, query({ sort: 'branchCode:asc' }));
    expect(orderCols(repo.list.mock.calls[2][1].orderBy)[0]).toBe('BranchCode');
    expect(repo.list.mock.calls[2][1].orderBy[0].dir).toBe('asc');
  });

  it('cột sắp xếp mặc định bị Ẩn/Che thì xếp theo cột mặc định kế tiếp xem được', async () => {
    const a = make({ etdRevised: 'HIDDEN' });
    await a.service.list(user, query());
    expect(orderCols(a.repo.list.mock.calls[0][1].orderBy)[0]).toBe('EtdActualDate');
    const b = make({ etdRevised: 'MASKED', etdActual: 'HIDDEN' });
    await b.service.list(user, query());
    expect(orderCols(b.repo.list.mock.calls[0][1].orderBy)[0]).toBe('Brand');
    expect(b.repo.list.mock.calls[0][1].orderBy[0].dir).toBe('asc');
  });

  it('trường suy ra từ Nhà máy SX: Nhà máy SX bị Ẩn thì không có, bị Che thì cũng che; không lọc, xếp, hỏi giá trị theo chúng được', async () => {
    const hidden = make({ factoryName: 'HIDDEN' });
    const res = await hidden.service.list(user, query({ sort: 'branchCode:asc' }));
    for (const f of ['branchCode', 'osmFactoryName', 'isFactoryManual', 'isInOsm']) expect(res.items.every((r) => !(f in r))).toBe(true);
    expect(orderCols(hidden.repo.list.mock.calls[0][1].orderBy)).not.toEqual(expect.arrayContaining(['BranchCode', 'OsmFactoryCode', 'IsFactoryManual', 'IsInOsm']));
    for (const field of ['branchCode', 'isFactoryManual', 'osmFactoryName']) {
      await expect(hidden.service.values(user, query({ field }))).rejects.toMatchObject({ code: 'FIELD_NOT_READABLE' });
    }
    const exported = (await hidden.service.export(user, query())) as unknown as Record<string, unknown>[];
    expect(hidden.exporter.csv.mock.calls[0][2].map((col) => col.key)).toEqual(['brand', 'season', 'po', 'so', 'shipMode', 'styleName', 'styleNo', 'color', 'etdActual', 'etdRevised', 'factoryName']);
    expect(exported[0]).not.toHaveProperty('branchCode');

    const masked = make({ factoryName: 'MASKED' });
    const items = (await masked.service.list(user, query())).items;
    expect(items.map((r) => [r.branchCode, r.osmFactoryName, r.isFactoryManual, r.isInOsm])).toEqual([
      ['***', '***', '***', '***'],
      [null, '***', '***', '***'],
    ]);
    expect(((await masked.service.export(user, query())) as unknown as Record<string, unknown>[]).map((r) => [r.branchName, r.manualText, r.inOsmText])).toEqual([
      ['***', '***', '***'],
      [null, '***', '***'],
    ]);
  });

  it('popup lọc: chỉ trường của danh sách trắng và xem được; ô trống là null; dấu nhập tay là số', async () => {
    const { service, repo } = make({ color: 'MASKED' });
    await expect(service.values(user, query({ field: 'color' }))).rejects.toMatchObject({ code: 'FIELD_NOT_READABLE' });
    await expect(service.values(user, query({ field: 'SyncRowId' }))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await service.values(user, query({ field: 'branchCode', search: 'A' }))).toEqual({ values: ['A01', null], truncated: false });
    expect(repo.distinctValues.mock.calls[0][2]).toMatchObject({ search: 'A', limit: 500 });
    repo.distinctValues.mockResolvedValueOnce({ rows: [true, false], truncated: false });
    expect((await service.values(user, query({ field: 'isFactoryManual' }))).values).toEqual([1, 0]);
  });

  it('gợi ý Brand, Season rỗng khi cột bị Ẩn/Che; nhà máy đang dùng (kèm ĐVCS) cho popup Đổi nhà máy SX', async () => {
    expect(await make().service.options(user)).toEqual({
      brands: ['B1'],
      seasons: ['S1'],
      factories: [
        { code: 'VIET DUC', name: 'Việt Đức', branchCode: 'A01' },
        { code: 'MEKO', name: 'Meko', branchCode: null },
      ],
    });
    expect(await make({ brand: 'MASKED', factoryName: 'HIDDEN' }).service.options(user)).toEqual({ brands: [], seasons: ['S1'], factories: [] });
  });

  it('xuất file ghi tên ĐVCS, cột Nhập tay, cột Còn trong OSM riêng (theo mức của isInOsm); quá 50.000 dòng thì báo lọc bớt', async () => {
    const { service, repo, exporter } = make();
    const rows = (await service.export(user, query())) as unknown as Record<string, unknown>[];
    expect(rows.map((r) => [r.branchName, r.manualText, r.inOsmText])).toEqual([
      ['Vietsun Đà Nẵng', null, 'Có'],
      [null, 'Nhập tay', 'Không'],
    ]);
    expect(exporter.csv.mock.calls[0][1]).toBe('order.poallocation');
    // Cột Còn trong OSM theo mức của chính isInOsm: Ẩn, Che riêng cột này thì bộ xuất bỏ, che cột đó, chữ Nhập tay không lộ gì
    expect(exporter.csv.mock.calls[0][2].find((c: { key: string }) => c.key === 'inOsmText')).toEqual({ key: 'inOsmText', label: 'Còn trong OSM', field: 'isInOsm' });
    expect(repo.listAll.mock.calls[0][1]).toMatchObject({ maxRows: 50_000 });
    repo.countFor.mockResolvedValueOnce(50_001);
    await expect(service.export(user, query())).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('đổi Nhà máy SX: A00 bị từ chối trước khi đọc gì; nhà máy phải đang dùng; xem trước không ghi, không giữ khóa ứng dụng', async () => {
    const { service, repo, audit } = make();
    await expect(service.setFactory(aggregate, { ids: [11], factoryName: 'MEKO' })).rejects.toMatchObject({ code: 'AGGREGATE_READ_ONLY' });
    expect(repo.withWriteLock).not.toHaveBeenCalled();
    await expect(service.setFactory(user, { ids: [11], factoryName: 'CU' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(service.setFactory(user, { ids: [11], factoryName: 'KHONG CO' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    repo.target.mockResolvedValueOnce({ ...(await repo.target(null, [], null)), removable: 1 });
    repo.target.mockClear();
    expect(await service.setFactory(user, { ids: [11, 11], dryRun: true })).toEqual({ rows: 2, keys: 1, removed: 0, removable: 1, dryRun: true });
    expect(repo.target.mock.calls[0].slice(1)).toEqual([[11]]);
    expect(repo.withWriteLock).not.toHaveBeenCalled();
    expect(repo.setManual).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('đổi Nhà máy SX: cột Nhà máy SX không Sửa được thì từ chối, kể cả khi chỉ xem trước', async () => {
    for (const level of ['READONLY', 'MASKED', 'HIDDEN'] as const) {
      const { service, repo } = make({ factoryName: level });
      await expect(service.setFactory(user, { ids: [11], dryRun: true })).rejects.toMatchObject({ code: 'FIELD_READONLY' });
      expect(repo.target).not.toHaveBeenCalled();
    }
  });

  it('đổi Nhà máy SX: dòng của ĐVCS khác, dòng không còn, ghi lệch số dòng thì báo lỗi, không ghi nhật ký', async () => {
    const { service, repo, audit } = make();
    const t = { found: 1, keys: 1, rows: 3, groups: [], otherBranch: 0, notWritable: 0, notVisible: 0, removable: 0 };
    repo.target.mockResolvedValueOnce({ ...t, otherBranch: 1, notWritable: 1 });
    await expect(service.setFactory(user, { ids: [11], factoryName: 'MEKO' })).rejects.toMatchObject({ code: 'FACTORY_OF_OTHER_BRANCH' });
    repo.target.mockResolvedValueOnce({ ...t, keys: 2 });
    await expect(service.setFactory(user, { ids: [11, 12], factoryName: 'MEKO' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // So từng dòng, không so hai số đếm: xem được mà không sửa được, hoặc sửa được mà không xem được, đều không ghi
    repo.target.mockResolvedValueOnce({ ...t, notWritable: 1 });
    await expect(service.setFactory(user, { ids: [11], dryRun: true })).rejects.toMatchObject({ code: 'SCOPE_DENIED' });
    repo.target.mockResolvedValueOnce({ ...t, notVisible: 1 });
    await expect(service.setFactory(user, { ids: [11], factoryName: 'MEKO' })).rejects.toMatchObject({ code: 'SCOPE_DENIED' });
    repo.setManual.mockResolvedValueOnce(1);
    await expect(service.setFactory(user, { ids: [11], factoryName: 'MEKO' })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('đổi Nhà máy SX: lưu mã của danh mục, "Theo OSM" bỏ nhập tay; nhật ký có khóa, nhà máy trước và sau', async () => {
    const { service, repo, audit } = make();
    expect(await service.setFactory(user, { ids: [11], factoryName: 'meko' })).toEqual({ rows: 2, keys: 1, removed: 0, removable: 0, dryRun: false });
    expect(repo.setManual.mock.calls[0].slice(1, 3)).toEqual([[11], 'MEKO']);
    expect(audit.log).toHaveBeenLastCalledWith(
      expect.objectContaining({
        username: 'u',
        branchCode: 'A01',
        entityType: 'PoAllocation',
        actionCode: 'PO_ALLOCATION_FACTORY',
        oldValue: { groups: [{ po: 'PO1', so: null, styleNo: 'ST1', color: 'Navy', factory: 'VIET DUC', manual: false, rows: 2 }] },
        newValue: { factory: 'MEKO', manual: true, rows: 2, keys: 1, removed: 0 },
      }),
    );
    repo.resetToOsm.mockResolvedValueOnce({ updated: 1, removed: 1 });
    expect(await service.setFactory(user, { ids: [11], factoryName: null })).toEqual({ rows: 2, keys: 1, removed: 1, removable: 0, dryRun: false });
    expect(audit.log).toHaveBeenLastCalledWith(expect.objectContaining({ newValue: { factory: null, manual: false, rows: 2, keys: 1, removed: 1 } }));
  });
});
