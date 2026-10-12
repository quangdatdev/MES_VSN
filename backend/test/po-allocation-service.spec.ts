import { PoAllocationService } from '../src/modules/order/po-allocation.service';
import type { OsmPoCriteria, OsmPoRow, OsmPoSort } from '../src/platform/feed/source-feed.service';

// Không cần database: màn Phân bổ PO (task 5.9.12) dựng điều kiện, bỏ trường bị Ẩn/Che, sắp xếp mặc định, ĐVCS theo danh mục
const row = (over: Partial<OsmPoRow> = {}): OsmPoRow => ({
  brand: 'B1',
  season: 'S1',
  po: 'PO1',
  so: 'SO1',
  shipMode: 'SEA',
  styleName: 'Áo thử',
  styleNo: 'ST1',
  color: 'Navy',
  etdActual: new Date('2026-10-01T00:00:00Z'),
  etdRevised: null,
  factoryName: 'VIET DUC',
  branchCode: 'A01',
  ...over,
});

type Level = 'HIDDEN' | 'MASKED' | 'READONLY' | 'EDITABLE';

/** `policy`: mức của từng cột với người xem; Ẩn, Che là không xem được nguyên giá trị */
function make(policy: Record<string, Level> = {}) {
  const feed = {
    osmPoPage: jest.fn(async (_c: OsmPoCriteria, page: number, pageSize: number, _sort: OsmPoSort[]) => ({
      total: 2,
      page,
      pageSize,
      rows: [row(), row({ po: 'PO2', factoryName: null, branchCode: null })],
      syncedAt: new Date('2026-10-12T03:00:00Z'),
      sourceActive: true,
    })),
    osmPoValues: jest.fn(async (_c: OsmPoCriteria, _field: string, _search: string | undefined, _limit: number) => ({ rows: ['A01', null], truncated: false })),
    osmPoAll: jest.fn(async (_c: OsmPoCriteria, _sort: OsmPoSort[]) => [row(), row({ factoryName: 'LẠ', branchCode: null })]),
    osmPoOptions: jest.fn(async () => ({ brands: ['B1'], seasons: ['S1'] })),
  };
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
    ]),
    branchNames: jest.fn(async () => new Map([['A01', 'Vietsun Đà Nẵng']])),
  };
  const exporter = { csv: jest.fn(async (_u: unknown, _r: string, _c: { key: string }[], rows: unknown[], _f: string) => rows) };
  const service = new PoAllocationService(feed as any, fields as any, permissions as any, catalogs as any, exporter as any);
  return { service, feed, exporter };
}
const user = { userId: 1, username: 'u', branchCode: 'A01', tokenType: 'access' } as any;
const query = (over: Record<string, unknown> = {}) => ({ page: 2, pageSize: 100, ...over }) as any;
const ALL = ['etdRevised', 'etdActual', 'brand', 'season', 'po', 'so', 'shipMode', 'styleName', 'styleNo', 'color', 'factoryName', 'branchCode'];

describe('Phân bổ PO (service)', () => {
  it('dải lọc: Brand, Season so bằng; mã hàng tìm trong StyleNo, StyleName; PO, SO; ĐVCS chỉ của nhà máy đã gắn', async () => {
    const { service, feed } = make();
    const res = await service.list(user, query({ customer: ' B1 ', season: 'S1', style: 'ST', q: 'PO', cf: JSON.stringify({ branchCode: { in: ['A01', null] } }) }));
    const [c, page, pageSize, sort] = feed.osmPoPage.mock.calls[0];
    expect(c.equals).toEqual([
      { field: 'brand', value: 'B1' },
      { field: 'season', value: 'S1' },
    ]);
    expect(c.contains).toEqual([
      { text: 'ST', fields: ['styleNo', 'styleName'] },
      { text: 'PO', fields: ['po', 'so'] },
    ]);
    expect(c.factoryBranches).toEqual([{ code: 'VIET DUC', branchCode: 'A01' }]);
    expect(c.filters).toEqual([{ field: 'branchCode', mode: 'in', values: ['A01', null] }]);
    expect([page, pageSize]).toEqual([2, 100]);
    // Mặc định ETD-Revised mới lên trước, thứ tự phụ theo mọi cột còn lại
    expect(sort.map((s) => s.field)).toEqual(ALL);
    expect(sort[0]).toEqual({ field: 'etdRevised', dir: 'desc' });
    // STT liên tục theo trang (khóa dòng của lưới), ngày dạng YYYY-MM-DD
    expect(res.items.map((r) => r.rowNo)).toEqual([101, 102]);
    expect(res.items[0]).toMatchObject({ etdActual: '2026-10-01', etdRevised: null, branchCode: 'A01' });
    expect(res).toMatchObject({ syncedAt: new Date('2026-10-12T03:00:00Z'), sourceActive: true });
  });

  it('trường bị Ẩn/Che: bỏ lọc, tìm, sắp xếp theo trường đó; mã hàng chỉ tìm ở trường còn xem được', async () => {
    const { service, feed } = make({ brand: 'HIDDEN', styleName: 'MASKED', po: 'HIDDEN', so: 'MASKED', color: 'MASKED' });
    await service.list(user, query({ customer: 'B1', style: 'ST', q: 'PO', sort: 'color:asc', cf: JSON.stringify({ color: { in: ['Navy'] }, shipMode: { in: ['SEA'] } }) }));
    const [c, , , sort] = feed.osmPoPage.mock.calls[0];
    expect(c.equals).toEqual([]);
    expect(c.contains).toEqual([{ text: 'ST', fields: ['styleNo'] }]);
    expect(c.filters).toEqual([{ field: 'shipMode', mode: 'in', values: ['SEA'] }]);
    // Cột không xem được không quyết định thứ tự: không là cột sắp xếp, không ở thứ tự phụ
    expect(sort.map((s) => s.field)).toEqual(['etdRevised', 'etdActual', 'season', 'shipMode', 'styleNo', 'factoryName', 'branchCode']);
  });

  it('cột sắp xếp mặc định bị Ẩn/Che thì xếp theo cột mặc định kế tiếp xem được', async () => {
    const a = make({ etdRevised: 'HIDDEN' });
    await a.service.list(user, query({ sort: 'etdRevised:desc' }));
    expect(a.feed.osmPoPage.mock.calls[0][3][0]).toEqual({ field: 'etdActual', dir: 'desc' });
    const b = make({ etdRevised: 'MASKED', etdActual: 'HIDDEN' });
    await b.service.list(user, query());
    expect(b.feed.osmPoPage.mock.calls[0][3][0]).toEqual({ field: 'brand', dir: 'asc' });
    expect(b.feed.osmPoPage.mock.calls[0][3].map((s) => s.field)).not.toEqual(expect.arrayContaining(['etdRevised']));
  });

  it('sắp xếp theo trường của danh sách trắng; trường lạ theo mặc định', async () => {
    const { service, feed } = make();
    await service.list(user, query({ sort: 'po:asc' }));
    await service.list(user, query({ sort: 'Brand; DROP TABLE x:asc' }));
    expect(feed.osmPoPage.mock.calls[0][3][0]).toEqual({ field: 'po', dir: 'asc' });
    expect(feed.osmPoPage.mock.calls[1][3][0]).toEqual({ field: 'etdRevised', dir: 'desc' });
  });

  it('Đơn vị cơ sở suy ra từ Nhà máy SX: Nhà máy SX bị Ẩn thì không có ĐVCS, bị Che thì ĐVCS cũng bị che, không lọc, xếp, hỏi giá trị được', async () => {
    const hidden = make({ factoryName: 'HIDDEN' });
    const res = await hidden.service.list(user, query({ sort: 'branchCode:asc', cf: JSON.stringify({ branchCode: { in: ['A01'] } }) }));
    expect(res.items.every((r) => !('branchCode' in r))).toBe(true);
    const [c, , , sort] = hidden.feed.osmPoPage.mock.calls[0];
    expect(c.filters).toEqual([]);
    expect(sort.map((s) => s.field)).not.toContain('branchCode');
    await expect(hidden.service.values(user, query({ field: 'branchCode' }))).rejects.toMatchObject({ code: 'FIELD_NOT_READABLE' });
    const exported = (await hidden.service.export(user, query())) as unknown as Record<string, unknown>[];
    expect(hidden.exporter.csv.mock.calls[0][2].map((col) => col.key)).not.toContain('branchName');
    expect(exported[0]).not.toHaveProperty('branchCode');

    const masked = make({ factoryName: 'MASKED' });
    expect((await masked.service.list(user, query())).items.map((r) => r.branchCode)).toEqual(['***', null]);
    expect(((await masked.service.export(user, query())) as unknown as Record<string, unknown>[]).map((r) => r.branchName)).toEqual(['***', null]);
  });

  it('popup lọc: chỉ trường của danh sách trắng và xem được; ô trống là null', async () => {
    const { service, feed } = make({ factoryName: 'MASKED' });
    await expect(service.values(user, query({ field: 'factoryName' }))).rejects.toMatchObject({ code: 'FIELD_NOT_READABLE' });
    await expect(service.values(user, query({ field: 'SyncRowId' }))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await service.values(user, query({ field: 'color', search: 'N' }))).toEqual({ values: ['A01', null], truncated: false });
    expect(feed.osmPoValues).toHaveBeenCalledWith(expect.anything(), 'color', 'N', 500);
  });

  it('gợi ý Brand, Season rỗng khi cột bị Ẩn/Che', async () => {
    expect(await make().service.options(user)).toEqual({ brands: ['B1'], seasons: ['S1'] });
    expect(await make({ brand: 'MASKED' }).service.options(user)).toEqual({ brands: [], seasons: ['S1'] });
  });

  it('xuất file ghi tên ĐVCS; nhà máy chưa gắn ĐVCS thì để trống', async () => {
    const { service, exporter } = make();
    const rows = (await service.export(user, query())) as unknown as Record<string, unknown>[];
    expect(rows.map((r) => r.branchName)).toEqual(['Vietsun Đà Nẵng', null]);
    expect(exporter.csv.mock.calls[0][1]).toBe('order.poallocation');
    expect(exporter.csv.mock.calls[0][2].map((col) => col.key)).toContain('branchName');
  });
});
