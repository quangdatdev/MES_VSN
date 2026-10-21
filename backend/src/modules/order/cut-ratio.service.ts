import { Inject, Injectable } from '@nestjs/common';
import { Errors } from '../../common/app.exception';
import type { AuthUser } from '../../platform/auth/auth.types';
import { AuditService } from '../../platform/audit/audit.service';
import { inTransaction } from '../../platform/data/transaction';
import { scopeOf } from '../../platform/data/base.repository';
import { allOf, assertFilterField, columnFilterWhere, columnValues, readableColumnFilters, type FilterSpec } from '../../platform/data/column-filter';
import { ExportService } from '../../platform/export/export.service';
import { FieldPolicyService } from '../../platform/permission/field-policy.service';
import { ORDER_DB } from './order.db';
import { ColorSizeLinesDto, CutRatioStyleQuery, CutRatioStyleValuesQuery, OrderListQuery, OrderValuesQuery, PoCreateDto } from './order.dto';
import { PoColorSizeRepository, poInPlanExpr, poOrderBranchExpr, SalesOrderPoRepository, SalesOrderRepository, type PoColorSizeRow, type SalesOrderPoRow } from './order.repositories';
import type { OrderDb } from './order.types';
import { businessFilter, conflict, csKey, day, escapeLike, invalid, isReferenceError, readableQuery, sortOf } from './order.util';

const RESOURCE = 'order.po';
const SORT: Record<string, string> = { poCode: 'PoCode', poNumber: 'PoNumber', qty: 'Qty', shipDate: 'ShipDate', syncedAt: 'SyncedAt', statusCode: 'StatusCode', createdAt: 'CreatedAt' };
const DEFAULT_SORT = 'createdAt:desc';
/** Cột lọc được theo giá trị của lưới PO */
const PO_FILTER: FilterSpec = {
  poCode: { expr: 'PoCode', kind: 'text' },
  poNumber: { expr: 'PoNumber', kind: 'text' },
  qty: { expr: 'Qty', kind: 'number' },
  syncedAt: { expr: 'SyncedAt', kind: 'day' },
  shipDate: { expr: 'ShipDate', kind: 'date' },
  destination: { expr: 'Destination', kind: 'text' },
  packingListCode: { expr: 'PackingListCode', kind: 'text' },
  customsDeclarationNo: { expr: 'CustomsDeclarationNo', kind: 'text' },
  statusCode: { expr: 'StatusCode', kind: 'text' },
  createdAt: { expr: 'CreatedAt', kind: 'datetime' },
};
/** Cột lọc được của danh sách mã hàng: lọc trên dòng PO trước khi gom (trạng thái tính sau khi gom nên không lọc ở đây). */
const STYLE_FILTER: FilterSpec = {
  customerName: { expr: 'CustomerName', kind: 'text' },
  styleCode: { expr: 'StyleCode', kind: 'text' },
  branchCode: { expr: poOrderBranchExpr, kind: 'text' },
};

export function presentPo(r: SalesOrderPoRow) {
  return {
    id: r.Id,
    salesOrderId: r.SalesOrderId,
    poCode: r.PoCode,
    poNumber: r.PoNumber,
    customerName: r.CustomerName,
    styleCode: r.StyleCode,
    qty: r.Qty,
    destination: r.Destination,
    packingListCode: r.PackingListCode,
    customsDeclarationNo: r.CustomsDeclarationNo,
    syncedAt: day(r.SyncedAt),
    shipDate: day(r.ShipDate),
    statusCode: r.StatusCode,
    confirmedAt: r.ConfirmedAt,
    branchCode: r.BranchCode,
    createdAt: r.CreatedAt,
  };
}

const presentColorSize = (r: PoColorSizeRow) => ({ id: r.Id, colorName: r.ColorName, sizeName: r.SizeName, qty: r.Qty });

function cleanLines(lines: ColorSizeLinesDto['lines']) {
  const seen = new Set<string>();
  for (const l of lines) {
    const k = csKey(l.colorName.toLowerCase(), l.sizeName.toLowerCase());
    if (seen.has(k)) throw invalid(`Màu ${l.colorName}, cỡ ${l.sizeName} bị lặp.`);
    seen.add(k);
  }
  return lines.map((l, i) => ({ ColorName: l.colorName, SizeName: l.sizeName.toUpperCase(), Qty: l.qty, SortOrder: i }));
}

const EXPORT_COLUMNS = [
  { key: 'poCode', label: 'Mã PO' },
  { key: 'poNumber', label: 'PO#' },
  { key: 'customerName', label: 'Khách hàng' },
  { key: 'styleCode', label: 'Mã hàng' },
  { key: 'qty', label: 'Số lượng' },
  { key: 'syncedAt', label: 'Ngày đồng bộ' },
  { key: 'shipDate', label: 'Ngày xuất hàng' },
  { key: 'destination', label: 'Đích đến' },
  { key: 'packingListCode', label: 'Mã PKL' },
  { key: 'customsDeclarationNo', label: 'Số tờ khai' },
  { key: 'statusCode', label: 'Trạng thái' },
];

@Injectable()
export class CutRatioService {
  constructor(
    @Inject(ORDER_DB) private readonly db: OrderDb,
    private readonly pos: SalesOrderPoRepository,
    private readonly colorSizes: PoColorSizeRepository,
    private readonly orders: SalesOrderRepository,
    private readonly audit: AuditService,
    private readonly exporter: ExportService,
    private readonly fields: FieldPolicyService,
  ) {}

  private async sort(user: AuthUser, sort: string | undefined) {
    return sortOf(SORT, await this.fields.safeSort(user, RESOURCE, sort, DEFAULT_SORT), DEFAULT_SORT);
  }

  /**
   * Điều kiện trên dòng PO của danh sách mã hàng: chỉ PO ĐVCS của phiên đang dùng (nằm trong kế hoạch xuất hàng của ĐVCS này,
   * hoặc PO nhập tay ở đây; quyết định 7.4), dải lọc, "PO do tôi lập", lọc theo cột.
   */
  private async styleWhere(user: AuthUser, q: CutRatioStyleQuery, except?: string) {
    const filters = await readableColumnFilters(this.fields, user, RESOURCE, q.cf, STYLE_FILTER);
    return allOf(
      this.pos.inUseHere(scopeOf(user)),
      <Q extends { where: (...a: any[]) => Q }>(qb: Q): Q => {
        if (q.shipFrom) qb = qb.where('ShipDate', '>=', q.shipFrom);
        if (q.shipTo) qb = qb.where('ShipDate', '<=', q.shipTo);
        if (q.customer) qb = qb.where('CustomerName', 'like', escapeLike(q.customer));
        if (q.style) qb = qb.where('StyleCode', 'like', escapeLike(q.style));
        if (q.createdBy === 'me') qb = qb.where('CreatedBy', '=', user.userId);
        return qb;
      },
      columnFilterWhere(filters, STYLE_FILTER, except),
    );
  }

  /** Điều kiện của lưới PO (của một mã hàng hoặc tất cả), cùng tập PO với danh sách mã hàng; `except`: cột đang mở popup lọc. */
  private async poWhere(user: AuthUser, salesOrderId: number | undefined, q: OrderListQuery, except?: string) {
    const filters = await readableColumnFilters(this.fields, user, RESOURCE, q.cf, PO_FILTER);
    return allOf(
      this.pos.inUseHere(scopeOf(user)),
      businessFilter(q),
      salesOrderId ? <Q extends { where: (...a: any[]) => Q }>(qb: Q): Q => qb.where('SalesOrderId', '=', salesOrderId) : null,
      columnFilterWhere(filters, PO_FILTER, except),
    );
  }

  async styleValues(user: AuthUser, query: CutRatioStyleValuesQuery) {
    const col = await assertFilterField(this.fields, user, RESOURCE, STYLE_FILTER, query.field);
    const q = await readableQuery(this.fields, user, RESOURCE, query);
    return columnValues(this.pos, scopeOf(user), col, { where: await this.styleWhere(user, q, query.field), search: query.search });
  }

  async values(user: AuthUser, salesOrderId: number | undefined, query: OrderValuesQuery) {
    const col = await assertFilterField(this.fields, user, RESOURCE, PO_FILTER, query.field);
    const q = await readableQuery(this.fields, user, RESOURCE, query);
    return columnValues(this.pos, scopeOf(user), col, { q: q.q, searchExclude: q.searchExclude, where: await this.poWhere(user, salesOrderId, q, query.field), search: query.search });
  }

  private log(user: AuthUser, id: number, action: string, oldValue?: unknown, newValue?: unknown) {
    return this.audit.log({ userId: user.userId, username: user.username, branchCode: user.branchCode, entityType: 'SalesOrderPo', entityId: id, actionCode: action, oldValue, newValue, ip: user.ip });
  }

  /** Danh sách mã hàng (gom PO theo đơn hàng), có phân trang. Trạng thái: xác nhận hết, một phần, hoặc chưa. */
  async styles(user: AuthUser, query: CutRatioStyleQuery) {
    const q = await readableQuery(this.fields, user, RESOURCE, query);
    const page = await this.pos.styles(scopeOf(user), { page: q.page, pageSize: q.pageSize, where: await this.styleWhere(user, q) });
    return { ...page, items: page.items.map((r) => ({
      salesOrderId: r.SalesOrderId,
      customerName: r.CustomerName,
      styleCode: r.StyleCode,
      branchCode: r.BranchCode,
      poCount: Number(r.PoCount),
      confirmedCount: Number(r.ConfirmedCount),
      qty: Number(r.Qty),
      shipDate: day(r.ShipDate),
      statusCode: Number(r.ConfirmedCount) === Number(r.PoCount) ? 'CONFIRMED' : Number(r.ConfirmedCount) > 0 ? 'PARTIAL' : 'DRAFT',
      createdAt: r.CreatedAt,
    })) };
  }

  async list(user: AuthUser, salesOrderId: number | undefined, query: OrderListQuery) {
    const q = await readableQuery(this.fields, user, RESOURCE, query);
    const page = await this.pos.list(scopeOf(user), {
      page: q.page,
      pageSize: q.pageSize,
      q: q.q,
      searchExclude: q.searchExclude,
      sort: await this.sort(user, q.sort),
      where: await this.poWhere(user, salesOrderId, q),
      select: () => [poInPlanExpr.as('InPlan')],
    });
    // Nút Xóa PO khóa sẵn với PO đã vào kế hoạch (máy chủ vẫn kiểm khi xóa)
    return { ...page, items: page.items.map((r) => ({ ...presentPo(r), inPlan: !!(r as SalesOrderPoRow & { InPlan?: number }).InPlan })) };
  }

  async colorSizeList(user: AuthUser, poId: number) {
    const scope = scopeOf(user);
    const po = await this.pos.getById(scope, poId);
    const lines = await this.colorSizes.listByParent(scope, poId);
    return { po: presentPo(po), lines: lines.map(presentColorSize) };
  }

  /**
   * "Thêm PO": PO BRAVO chưa có nên cho nhập tay, kèm màu cỡ. Chỉ thêm cho mã hàng đang có trên màn ở ĐVCS của phiên (có PO
   * trong kế hoạch xuất hàng của ĐVCS này hoặc PO nhập tay ở đây); PO mới mang ĐVCS của phiên (quyết định 7.4).
   */
  async create(user: AuthUser, dto: PoCreateDto) {
    const scope = scopeOf(user);
    // Lấy khách hàng, mã hàng từ đơn hàng: cần quyền xem Thông tin đơn hàng
    const order = await this.orders.getById(scope, dto.salesOrderId, 'view');
    await this.pos.assertWritable(scope);
    const here = await this.pos.list(scope, { page: 1, pageSize: 1, where: allOf(this.pos.inUseHere(scope), (qb) => qb.where('SalesOrderId', '=', order.Id)) });
    if (!here.total) throw invalid('Mã hàng này chưa có PO trong kế hoạch xuất hàng của đơn vị cơ sở đang làm việc. Lập kế hoạch xuất hàng trước rồi mới thêm PO.');
    const lines = cleanLines(dto.lines);
    let po: SalesOrderPoRow;
    try {
      po = await inTransaction(this.db, async (trx) => {
        const row = await this.pos.createNumbered(
          scope,
          {
            SalesOrderId: order.Id,
            PoNumber: dto.poNumber.toUpperCase(),
            CustomerName: order.CustomerName,
            StyleCode: order.StyleCode,
            Qty: lines.reduce((s, l) => s + l.Qty, 0),
            Destination: dto.destination || null,
            PackingListCode: dto.packingListCode || null,
            CustomsDeclarationNo: dto.customsDeclarationNo || null,
            ShipDate: dto.shipDate,
            StatusCode: 'DRAFT',
          },
          'PoCode',
          'PO',
          trx,
        );
        await this.colorSizes.insert(scope, row.Id, lines, trx);
        return row;
      });
    } catch (e) {
      // Đơn hàng vừa bị xóa, hoặc database chưa chạy MES_Order/0008 (PO tay khác ĐVCS của đơn vướng khóa ngoại ghép cũ)
      if (isReferenceError(e)) throw conflict('Không thêm được PO cho mã hàng này. Tải lại trang rồi thử lại; vẫn lỗi thì báo quản trị hệ thống.');
      throw e;
    }
    const out = presentPo(po);
    await this.log(user, po.Id, 'CREATE', undefined, { ...out, lines: dto.lines });
    return out;
  }

  /**
   * "Cập nhật": thay toàn bộ màu cỡ của PO và tính lại tổng số lượng. PO đã xác nhận thì phải hủy xác nhận trước. Khóa PO tới
   * hết transaction rồi mới đọc trạng thái: ĐVCS nguồn và các ĐVCS có PO trong kế hoạch cùng ghi được một PO (quyết định
   * 7.2), người xác nhận cùng lúc phải chờ (review 5.9.13 M1).
   */
  async updateColorSizes(user: AuthUser, poId: number, dto: ColorSizeLinesDto) {
    const scope = scopeOf(user);
    await this.pos.assertWritable(scope);
    // FieldPolicyInterceptor chỉ chặn khi body có qty; `lines: []` (xóa hết màu cỡ, đưa Số lượng PO về 0) không có, nên kiểm ở
    // đây, trước khi khóa PO (403 không cho dò Id PO), như lưu Phân bổ màu cỡ
    const level = (await this.fields.levels(scope.access, RESOURCE)).levels.get('qty');
    if (level && level !== 'EDITABLE') throw Errors.fieldReadonly(['qty'], ['Số lượng']);
    const lines = cleanLines(dto.lines);
    const { po, before } = await inTransaction(this.db, async (trx) => {
      await this.pos.lock(scope, poId, 'update', trx);
      const current = await this.pos.getById(scope, poId, 'update', trx);
      if (current.StatusCode === 'CONFIRMED') throw conflict('PO đã xác nhận tỷ lệ cắt. Bấm "Hủy xác nhận" trước khi sửa.');
      const old = await this.colorSizes.listByParent(scope, poId, 'view', trx);
      await this.colorSizes.removeWhere(scope, { parentId: poId }, trx);
      await this.colorSizes.insert(scope, poId, lines, trx);
      return { po: await this.pos.update(scope, poId, { Qty: lines.reduce((s, l) => s + l.Qty, 0) }, trx), before: old.map(presentColorSize) };
    });
    await this.log(user, poId, 'CUT_RATIO_UPDATE', before, dto.lines);
    return { po: presentPo(po), lines: (await this.colorSizes.listByParent(scope, poId)).map(presentColorSize) };
  }

  /** Xác nhận, hủy xác nhận: khóa PO rồi đọc lại trạng thái, như sửa màu cỡ (review 5.9.13 M1). */
  async setConfirmed(user: AuthUser, poId: number, confirmed: boolean) {
    const scope = scopeOf(user);
    const row = await inTransaction(this.db, async (trx) => {
      await this.pos.lock(scope, poId, 'update', trx);
      const current = await this.pos.getById(scope, poId, 'update', trx);
      if ((current.StatusCode === 'CONFIRMED') === confirmed) throw conflict(confirmed ? 'PO đã được xác nhận.' : 'PO chưa xác nhận.');
      if (confirmed && current.Qty <= 0) throw conflict('PO chưa có số lượng màu cỡ, không xác nhận được.');
      return this.pos.update(
        scope,
        poId,
        confirmed ? { StatusCode: 'CONFIRMED', ConfirmedAt: new Date(), ConfirmedBy: user.userId } : { StatusCode: 'DRAFT', ConfirmedAt: null, ConfirmedBy: null },
        trx,
      );
    });
    await this.log(user, poId, confirmed ? 'CUT_RATIO_CONFIRM' : 'CUT_RATIO_UNCONFIRM');
    return presentPo(row);
  }

  /** Khóa PO rồi mới kiểm trạng thái, xóa màu cỡ, xóa PO: cùng thứ tự khóa với sửa màu cỡ (review 5.9.13 lượt 9) */
  async remove(user: AuthUser, poId: number) {
    const scope = scopeOf(user);
    let current: SalesOrderPoRow;
    try {
      current = await inTransaction(this.db, async (trx) => {
        await this.pos.lock(scope, poId, 'delete', trx);
        const row = await this.pos.getById(scope, poId, 'delete', trx);
        if (row.StatusCode === 'CONFIRMED') throw conflict('PO đã xác nhận tỷ lệ cắt nên không xóa được. Hủy xác nhận trước.');
        if (await this.pos.usedInPlans(scope, poId, trx)) throw conflict('PO đã nằm trong kế hoạch xuất hàng nên không xóa được.');
        await this.colorSizes.removeWhere(scope, { parentId: poId }, trx, 'delete');
        await this.pos.remove(scope, poId, trx);
        return row;
      });
    } catch (e) {
      // Có người vừa đưa PO vào kế hoạch giữa lúc kiểm và lúc xóa
      if (isReferenceError(e)) throw conflict('PO đã nằm trong kế hoạch xuất hàng nên không xóa được.');
      throw e;
    }
    await this.log(user, poId, 'DELETE', presentPo(current));
  }

  async export(user: AuthUser, salesOrderId: number | undefined, query: OrderListQuery) {
    const q = await readableQuery(this.fields, user, RESOURCE, query);
    const rows = await this.pos.listAll(scopeOf(user), {
      q: q.q,
      searchExclude: q.searchExclude,
      sort: await this.sort(user, q.sort),
      where: await this.poWhere(user, salesOrderId, q),
    });
    return this.exporter.csv(user, RESOURCE, EXPORT_COLUMNS, rows.map(presentPo), `ty-le-cat-${user.branchCode}.csv`);
  }
}
