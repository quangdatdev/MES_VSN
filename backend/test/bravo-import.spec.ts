import { buildOrders, planImport, type MesOrder, type MesPo, type MesState } from '../src/modules/order/bravo-order.mapping';
import { normalizeFactories, splitFactories } from '../src/platform/catalog/factory-list';
import type { BravoOrderSource, SourceCell, SourceOrder, SourcePo } from '../src/platform/sync/bravo-order-source';

// Không cần database: so dữ liệu BRAVO với MES_Order của bước nạp tăng dần (quyết định 7.7)
const T0 = new Date('2026-10-01T08:00:00Z');
const T1 = new Date('2026-10-05T08:00:00Z');

const order = (over: Partial<SourceOrder> = {}): SourceOrder => ({
  ProductId: 1,
  BranchCode: 'A01',
  Name: 'SO-1 | Áo',
  StyleName: 'ST-1',
  ProductName: 'Áo khoác',
  Unit: 'CHIEC',
  Qty: 30,
  EndDatePrice: null,
  ProductionTypeCode: 'SXXK',
  SyncedAt: T0,
  Customer: 'KH1',
  Season: 'SS26',
  Staff: 'Lan',
  PoProductId: 1,
  ...over,
});
const po = (over: Partial<SourcePo> = {}): SourcePo => ({ ProductId: 1, CustomerPONo: 'PO1', Etd: new Date('2026-11-01T00:00:00Z'), SyncedAt: T0, Destination: 'US', ...over });
const cell = (over: Partial<SourceCell> = {}): SourceCell => ({
  ProductId: 1,
  CustomerPONo: 'PO1',
  ColorId: 10,
  ColorName: 'Navy',
  ColorCode: 'C10',
  SizeCode: 'M',
  SizeType: 'REG',
  Qty: 10,
  ColorStt: 1,
  SizeStt: 1,
  SyncedAt: T0,
  ...over,
});
const source = (over: Partial<BravoOrderSource> = {}): BravoOrderSource => ({
  orders: [order()],
  pos: [po()],
  cells: [cell(), cell({ SizeCode: 'L', SizeStt: 2, Qty: 20 })],
  ...over,
});
const units = new Map([['CHIEC', 'Chiếc']]);
// Nhà máy SX theo OSM (quyết định 7.6): sản phẩm 1 có trong OSM, danh sách hai nhà máy
const opts = { branches: ['A01', 'A02'], unitNames: units, osmFactories: new Map([[1, 'VIET DUC, VSN-DN']]) as Map<number, string> | null };

/** Trạng thái MES đúng như vừa nạp `src` (có dấu nội dung): so lại phải không còn gì để ghi */
function stateOf(src: BravoOrderSource, over: { order?: Partial<MesOrder>; po?: Partial<MesPo> } = {}): MesState {
  const { built } = buildOrders(src, (o) => `SO-${o.ProductId}`, units);
  const orders: MesOrder[] = built.map((o, i) => ({
    Id: 100 + i,
    SourceProductId: o.productId,
    BranchCode: o.branchCode,
    OrderNo: o.orderNo,
    CustomerName: o.fields.CustomerName,
    StyleCode: o.fields.StyleCode,
    SyncedAt: o.syncedAt,
    ModifiedBy: null,
    SourceHash: o.hash,
    ...over.order,
  }));
  const pos: MesPo[] = built.flatMap((o, i) =>
    o.pos.map((p, k) => ({
      Id: 1000 + i * 10 + k,
      SalesOrderId: 100 + i,
      PoNumber: p.poNumber,
      ShipDate: new Date(`${p.shipDate}T00:00:00Z`),
      Destination: p.destination,
      StatusCode: 'DRAFT',
      CreatedBy: null,
      ModifiedBy: null,
      inPlan: false,
      cells: p.cells.map((c) => ({ ...c, createdBy: null })),
      ...over.po,
    })),
  );
  return { orders, pos };
}
const counts = (p: ReturnType<typeof planImport>) => ({
  newOrders: p.newOrders.length,
  orderUpdates: p.orderUpdates.length,
  hashUpdates: p.hashUpdates.length,
  newPos: p.newPos.length,
  poUpdates: p.poUpdates.length,
  cellUpdates: p.cellUpdates.length,
  cellsKept: p.cellsKept.length,
});
const NOTHING = { newOrders: 0, orderUpdates: 0, hashUpdates: 0, newPos: 0, poUpdates: 0, cellUpdates: 0, cellsKept: 0 };

describe('Nạp tăng dần đơn hàng BRAVO: so với MES_Order', () => {
  it('danh sách nhà máy theo OSM: tách theo dấu phẩy, bỏ khoảng trắng, bỏ mã trùng (không phân biệt hoa thường), giữ thứ tự', () => {
    expect(splitFactories(' VIET DUC ,VSN-DN,, viet duc,HÙNG  DŨNG ')).toEqual(['VIET DUC', 'VSN-DN', 'HÙNG DŨNG']);
    expect(normalizeFactories('VIET DUC , VSN-DN')).toBe('VIET DUC,VSN-DN');
    expect(normalizeFactories(' , ')).toBeNull();
    expect(normalizeFactories(null)).toBeNull();
  });

  it('đơn mới có danh sách nhà máy OSM dài quá cột (400 ký tự): vẫn thêm đơn, Nhà máy SX để trống, báo lại (không lỗi cả lần nạp)', () => {
    const long = Array.from({ length: 50 }, (_v, i) => `NHÀ MÁY SỐ ${i}`).join(',');
    const plan = planImport(source(), { orders: [], pos: [] }, { ...opts, osmFactories: new Map([[1, long]]) });
    expect(plan.newOrders.map((o) => [o.factoryCode, o.factoryFromOsm])).toEqual([[null, false]]);
    expect(plan.factoryTooLong).toEqual([1]);
  });

  it('sản phẩm mới có PO: thêm đơn kèm dấu nội dung; Nhà máy SX theo OSM (khóa sửa tay), OSM chưa có thì để trống; số đơn trùng thì thêm -2', () => {
    const src = source({ orders: [order(), order({ ProductId: 2, BranchCode: 'A02', PoProductId: 2 })], pos: [po(), po({ ProductId: 2 })], cells: [cell(), cell({ ProductId: 2 })] });
    const manual: MesOrder = { ...stateOf(source()).orders[0], Id: 5, SourceProductId: null, SourceHash: null, OrderNo: 'so-1' };
    const plan = planImport(src, { orders: [manual], pos: [] }, opts);
    expect(plan.newOrders.map((o) => [o.productId, o.orderNo, o.factoryCode, o.factoryFromOsm])).toEqual([
      [1, 'SO-1-2', 'VIET DUC,VSN-DN', true],
      [2, 'SO-1', null, false],
    ]);
    expect(planImport(src, { orders: [], pos: [] }, { ...opts, osmFactories: null }).newOrders.map((o) => o.factoryCode)).toEqual([null, null]);
    expect(plan.newOrders[0].fields).toMatchObject({ CustomerName: 'KH1', UnitName: 'Chiếc', Qty: 30, ShipDate: '2026-11-01' });
    expect(plan.newOrders[0].hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('chạy lại khi BRAVO không đổi: không ghi gì', () => {
    const src = source();
    expect(counts(planImport(src, stateOf(src), opts))).toEqual(NOTHING);
  });

  it('nguồn PO, màu cỡ chép lại cả nhóm với mốc mới nhưng nội dung không đổi: không ghi gì, giữ phần người dùng sửa (review H1)', () => {
    const edited = stateOf(source(), { order: { CustomerName: 'Sửa tay', ModifiedBy: 7 } });
    const recopied = source({ pos: [po({ SyncedAt: T1 })], cells: [cell({ SyncedAt: T1 }), cell({ SizeCode: 'L', SizeStt: 2, Qty: 20, SyncedAt: T1 })] });
    expect(counts(planImport(recopied, edited, opts))).toEqual(NOTHING);
  });

  it('đổi tên ở danh mục Đơn vị tính của MES (hay đổi cách ánh xạ): dấu nội dung không đổi, không ghi đè đơn (review M4.3)', () => {
    const src = source();
    const edited = stateOf(src, { order: { CustomerName: 'Sửa tay', ModifiedBy: 7 } });
    const renamed = { ...opts, unitNames: new Map([['CHIEC', 'Cái']]) };
    expect(counts(planImport(src, edited, renamed))).toEqual(NOTHING);
    expect(counts(planImport(src, edited, { ...opts, unitNames: new Map() }))).toEqual(NOTHING);
  });

  it('sản phẩm chưa có PO: chưa nạp, đếm theo ĐVCS', () => {
    const plan = planImport(source({ pos: [], cells: [] }), { orders: [], pos: [] }, opts);
    expect(plan.newOrders).toHaveLength(0);
    expect(plan.skipped.get('A01')).toBe(1);
  });

  it('BRAVO đổi đơn (dấu nội dung khác): ghi đè cột lấy từ BRAVO kể cả khi người dùng đã sửa ở MES; Nhà máy SX, số đơn, giá không nằm trong phần ghi', () => {
    const edited = stateOf(source(), { order: { CustomerName: 'Sửa tay', ModifiedBy: 7 } });
    const changed = source({ orders: [order({ Customer: 'KH mới', SyncedAt: T1 })] });
    const plan = planImport(changed, edited, opts);
    expect(plan.orderUpdates).toHaveLength(1);
    expect(plan.orderUpdates[0]).toMatchObject({ id: 100, force: true, syncedAt: T1, closed: false });
    expect(plan.orderUpdates[0].fields.CustomerName).toBe('KH mới');
    expect(plan.orderUpdates[0].hash).not.toBe(edited.orders[0].SourceHash);
    for (const k of ['ProductionFactoryCode', 'OrderNo', 'UnitPrice', 'CmPrice', 'BranchCode', 'StatusCode']) expect(plan.orderUpdates[0].fields).not.toHaveProperty(k);
  });

  it('đơn nạp trước khi có dấu nội dung: chưa ai sửa thì theo BRAVO; đã sửa thì chỉ lấy dấu làm mốc, giữ phần người dùng sửa', () => {
    const src = source();
    const fresh = planImport(src, stateOf(src, { order: { SourceHash: null } }), opts);
    expect(fresh.orderUpdates).toEqual([expect.objectContaining({ id: 100, force: false })]);
    expect(fresh.hashUpdates).toHaveLength(0);

    const edited = planImport(src, stateOf(src, { order: { SourceHash: null, ModifiedBy: 7 } }), opts);
    expect(edited.orderUpdates).toHaveLength(0);
    expect(edited.hashUpdates).toEqual([{ id: 100, hash: buildOrders(src, () => 'X', units).built[0].hash, closed: false }]);
  });

  it('PO, màu cỡ đổi ở BRAVO: dấu nội dung đổi theo ngày xuất của đơn; ngày xuất PO theo BRAVO', () => {
    const edited = stateOf(source(), { order: { ModifiedBy: 7 } });
    const later = source({ pos: [po({ Etd: new Date('2026-10-20T00:00:00Z'), SyncedAt: T1 })] });
    const plan = planImport(later, edited, opts);
    expect(plan.orderUpdates[0]).toMatchObject({ force: true });
    expect(plan.orderUpdates[0].fields.ShipDate).toBe('2026-10-20');
    expect(plan.poUpdates).toEqual([{ id: 1000, shipDate: '2026-10-20', destination: 'US', syncedAt: T1 }]);
  });

  it('BRAVO đóng lệnh: dấu nội dung đổi, cờ đóng lệnh đi kèm (trạng thái Mới → Hoàn thành tính trong câu ghi)', () => {
    const closed = source({ orders: [order({ EndDatePrice: T1 })] });
    const plan = planImport(closed, stateOf(source()), opts);
    expect(plan.orderUpdates).toEqual([expect.objectContaining({ id: 100, closed: true, force: true })]);
  });

  it('PO mới của đơn đã có: thêm, bản chụp khách hàng, mã hàng theo đơn; PO nhập tay trùng số PO được ghép, không thêm trùng', () => {
    const src = source({ pos: [po(), po({ CustomerPONo: 'po2' })], cells: [cell(), cell({ CustomerPONo: 'po2', Qty: 5 })] });
    const plan = planImport(src, stateOf(source({ cells: [cell()] })), opts);
    expect(plan.newPos).toHaveLength(1);
    expect(plan.newPos[0]).toMatchObject({ salesOrderId: 100, branchCode: 'A01', customer: 'KH1', style: 'ST-1', closed: false });
    expect(plan.newPos[0].po).toMatchObject({ poNumber: 'po2', qty: 5 });

    const withManual = stateOf(source({ cells: [cell()] }));
    withManual.pos.push({ ...withManual.pos[0], Id: 2000, PoNumber: 'PO2', CreatedBy: 9, cells: [{ color: 'Navy', size: 'M', qty: 5, createdBy: 9 }] });
    expect(planImport(src, withManual, opts).newPos).toHaveLength(0);
  });

  it('số PO lưu ở cột VARCHAR mất dấu ("(trống)" thành "(tr?ng)") vẫn ghép đúng; hai PO cùng số sau khi làm sạch ghép lần lượt', () => {
    const src = source({ pos: [po({ CustomerPONo: ' ' }), po({ CustomerPONo: 'A  B' }), po({ CustomerPONo: 'A B' })], cells: [cell({ CustomerPONo: ' ' }), cell({ CustomerPONo: 'A  B' }), cell({ CustomerPONo: 'A B' })] });
    const state = stateOf(src);
    expect(state.pos.map((p) => p.PoNumber)).toEqual(['(trống)', 'A B', 'A B']);
    state.pos[0].PoNumber = '(tr?ng)';
    const plan = planImport(src, state, opts);
    expect(plan.newPos).toHaveLength(0);
    expect(plan.gonePos).toBe(0);
  });

  it('màu cỡ ghép với PO như SQL Server: chỉ dấu cách cuối bỏ qua; khoảng trắng đầu, tab, xuống dòng cuối là PO khác (không gộp SL)', () => {
    const src = source({ pos: [po({ CustomerPONo: 'PO1' }), po({ CustomerPONo: ' PO1' })], cells: [cell({ CustomerPONo: 'PO1 ', Qty: 10 }), cell({ CustomerPONo: ' PO1', Qty: 5 })] });
    expect(buildOrders(src, () => 'X', units).built[0].pos.map((p) => p.qty)).toEqual([10, 5]);
    const crlf = source({ pos: [po({ CustomerPONo: 'PO1' }), po({ CustomerPONo: 'PO1\r\n' })], cells: [cell({ CustomerPONo: 'PO1', Qty: 10 }), cell({ CustomerPONo: 'PO1\r\n', Qty: 5 })] });
    expect(buildOrders(crlf, () => 'X', units).built[0].pos.map((p) => p.qty)).toEqual([10, 5]);
  });

  it('PO người dùng tự thêm được ghép theo số PO: giữ ngày xuất, nơi giao người dùng nhập (review L4.4)', () => {
    const src = source();
    const state = stateOf(src, { po: { CreatedBy: 9, ShipDate: new Date('2026-12-24T00:00:00Z'), Destination: 'JP' } });
    expect(planImport(src, state, opts).poUpdates).toHaveLength(0);
  });

  it('màu cỡ đổi: thay khi PO chưa xác nhận, chưa vào kế hoạch, người dùng chưa đụng tới; còn lại giữ của MES', () => {
    const before = source({ cells: [cell()] });
    const after = source({ cells: [cell({ Qty: 12 })] });
    expect(planImport(after, stateOf(before), opts).cellUpdates).toEqual([{ poId: 1000, salesOrderId: 100, cells: [{ color: 'Navy', size: 'M', qty: 12 }], qty: 12 }]);
    const touched: Partial<MesPo>[] = [
      { StatusCode: 'CONFIRMED' },
      { inPlan: true },
      { cells: [{ color: 'Navy', size: 'M', qty: 10, createdBy: 3 }] },
      // Người dùng lưu lưới màu cỡ rỗng (không còn ô nào mang CreatedBy) hoặc xác nhận rồi hủy: PO có ModifiedBy (review L1)
      { cells: [], ModifiedBy: 3 },
      { ModifiedBy: 3 },
    ];
    for (const over of touched) {
      const plan = planImport(after, stateOf(before, { po: over }), opts);
      expect(plan.cellUpdates).toHaveLength(0);
      expect(plan.cellsKept).toEqual([1000]);
    }
  });

  it('không xóa gì: đơn, PO nạp từ BRAVO không còn thì chỉ đếm; PO nhập tay, đơn của ĐVCS đang tắt không đếm', () => {
    const state = stateOf(source({ pos: [po(), po({ CustomerPONo: 'PO2' })], cells: [cell(), cell({ CustomerPONo: 'PO2' })] }));
    state.pos.push({ ...state.pos[0], Id: 3000, PoNumber: 'TAY', CreatedBy: 9 });
    state.orders.push({ ...state.orders[0], Id: 300, SourceProductId: 77, OrderNo: 'X' }, { ...state.orders[0], Id: 301, SourceProductId: 78, BranchCode: 'A09', OrderNo: 'Y' });
    const plan = planImport(source(), state, opts);
    expect(plan.gonePos).toBe(1);
    expect(plan.goneOrders).toBe(1);
  });

  it('BRAVO đổi chi nhánh nhận đơn: ĐVCS ở MES bất biến, không cập nhật đơn đó', () => {
    const state = stateOf(source(), { order: { SourceHash: 'cũ' } });
    const moved = source({ orders: [order({ BranchCode: 'A02', Customer: 'Khác' })] });
    const plan = planImport(moved, state, opts);
    expect(plan.branchChanged).toEqual([1]);
    expect(counts(plan)).toEqual(NOTHING);
  });
});
