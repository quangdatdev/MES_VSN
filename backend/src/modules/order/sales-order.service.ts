import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../platform/auth/auth.types';
import { AuditService } from '../../platform/audit/audit.service';
import { CatalogLookupService } from '../../platform/catalog/catalog-lookup.service';
import { scopeOf } from '../../platform/data/base.repository';
import { allOf, assertFilterField, columnFilterWhere, columnValues, readableColumnFilters, type FilterSpec } from '../../platform/data/column-filter';
import { ExportService } from '../../platform/export/export.service';
import { FieldPolicyService } from '../../platform/permission/field-policy.service';
import { OrderListQuery, OrderValuesQuery, SalesOrderCreateDto, SalesOrderUpdateDto } from './order.dto';
import { SalesOrderRepository, type SalesOrderRow } from './order.repositories';
import { businessFilter, conflict, day, invalid, isReferenceError, num, readableQuery, sortOf } from './order.util';

const RESOURCE = 'order.allocation';
const SORT: Record<string, string> = {
  orderNo: 'OrderNo',
  customerName: 'CustomerName',
  styleCode: 'StyleCode',
  season: 'Season',
  qty: 'Qty',
  shipDate: 'ShipDate',
  syncedAt: 'SyncedAt',
  statusCode: 'StatusCode',
  branchCode: 'BranchCode',
  unitPrice: 'UnitPrice',
  amount: 'Amount',
  createdAt: 'CreatedAt',
};
/** Mặc định: đơn mới tạo lên đầu (100 dòng đầu, xem thêm thì sang trang). */
const DEFAULT_SORT = 'createdAt:desc';
/** Cột lọc được theo giá trị (nút mũi tên trên tiêu đề). Không có cột giá: cột nhạy cảm, liệt kê giá trị là lộ giá mà không ghi nhật ký đọc. */
const FILTER: FilterSpec = {
  orderNo: { expr: 'OrderNo', kind: 'text' },
  customerName: { expr: 'CustomerName', kind: 'text' },
  styleCode: { expr: 'StyleCode', kind: 'text' },
  season: { expr: 'Season', kind: 'text' },
  orderType: { expr: 'OrderType', kind: 'text' },
  productName: { expr: 'ProductName', kind: 'text' },
  branchCode: { expr: 'BranchCode', kind: 'text' },
  productionFactoryCode: { expr: 'ProductionFactoryCode', kind: 'text' },
  staffName: { expr: 'StaffName', kind: 'text' },
  qty: { expr: 'Qty', kind: 'number' },
  unitName: { expr: 'UnitName', kind: 'text' },
  syncedAt: { expr: 'SyncedAt', kind: 'day' },
  shipDate: { expr: 'ShipDate', kind: 'date' },
  statusCode: { expr: 'StatusCode', kind: 'text' },
  createdAt: { expr: 'CreatedAt', kind: 'datetime' },
};

/** Trường JSON trùng mã cột đăng ký ở SysResourceField (order.allocation) để chính sách cột áp đúng. */
export function presentSalesOrder(r: SalesOrderRow) {
  return {
    id: r.Id,
    orderNo: r.OrderNo,
    customerName: r.CustomerName,
    styleCode: r.StyleCode,
    season: r.Season,
    orderType: r.OrderType,
    productName: r.ProductName,
    staffName: r.StaffName,
    qty: r.Qty,
    unitName: r.UnitName,
    unitPrice: num(r.UnitPrice),
    amount: num(r.Amount),
    cmPrice: num(r.CmPrice),
    syncedAt: day(r.SyncedAt),
    shipDate: day(r.ShipDate),
    statusCode: r.StatusCode,
    branchCode: r.BranchCode,
    productionFactoryCode: r.ProductionFactoryCode,
    createdAt: r.CreatedAt,
    modifiedAt: r.ModifiedAt,
  };
}

const EXPORT_COLUMNS = [
  { key: 'orderNo', label: 'Số đơn' },
  { key: 'customerName', label: 'Khách hàng' },
  { key: 'styleCode', label: 'Mã hàng' },
  { key: 'season', label: 'Season' },
  { key: 'orderType', label: 'Loại' },
  { key: 'productName', label: 'Tên sản phẩm' },
  { key: 'branchName', label: 'Chi nhánh FOB', field: 'branchCode' },
  { key: 'productionFactoryCode', label: 'Nhà máy SX' },
  { key: 'staffName', label: 'Nhân viên lập' },
  { key: 'qty', label: 'Số lượng' },
  { key: 'unitName', label: 'Đơn vị tính' },
  { key: 'unitPrice', label: 'Đơn giá' },
  { key: 'amount', label: 'Thành tiền' },
  { key: 'cmPrice', label: 'Giá CM' },
  { key: 'syncedAt', label: 'Ngày đồng bộ' },
  { key: 'shipDate', label: 'Ngày xuất hàng' },
  { key: 'statusCode', label: 'Trạng thái' },
];

@Injectable()
export class SalesOrderService {
  constructor(
    private readonly repo: SalesOrderRepository,
    private readonly audit: AuditService,
    private readonly exporter: ExportService,
    private readonly fields: FieldPolicyService,
    private readonly catalogs: CatalogLookupService,
  ) {}

  /** Nhật ký không đi qua chính sách cột nên bỏ cột nhạy cảm (giá) trước khi ghi. */
  private async log(user: AuthUser, id: number, action: string, oldValue?: unknown, newValue?: unknown) {
    return this.audit.log({
      userId: user.userId,
      username: user.username,
      branchCode: user.branchCode,
      entityType: 'SalesOrder',
      entityId: id,
      actionCode: action,
      oldValue: await this.fields.redact(RESOURCE, oldValue),
      newValue: await this.fields.redact(RESOURCE, newValue),
      ip: user.ip,
    });
  }

  private async sort(user: AuthUser, sort: string | undefined) {
    return sortOf(SORT, await this.fields.safeSort(user, RESOURCE, sort, DEFAULT_SORT), DEFAULT_SORT);
  }

  /** Bộ lọc nghiệp vụ (dải lọc) và bộ lọc theo cột; `except`: cột đang mở popup lọc, không lọc theo chính nó. */
  private async where(user: AuthUser, q: OrderListQuery, except?: string) {
    const filters = await readableColumnFilters(this.fields, user, RESOURCE, q.cf, FILTER);
    return allOf(businessFilter(q, { season: 'Season' }), columnFilterWhere(filters, FILTER, except));
  }

  async list(user: AuthUser, query: OrderListQuery) {
    const q = await readableQuery(this.fields, user, RESOURCE, query);
    const page = await this.repo.list(scopeOf(user), {
      page: q.page,
      pageSize: q.pageSize,
      q: q.q,
      searchExclude: q.searchExclude,
      sort: await this.sort(user, q.sort),
      where: await this.where(user, q),
    });
    return { ...page, items: page.items.map(presentSalesOrder) };
  }

  /** Giá trị của một cột cho popup lọc theo cột, trong phạm vi người dùng và theo các bộ lọc khác đang áp. */
  async values(user: AuthUser, query: OrderValuesQuery) {
    const col = await assertFilterField(this.fields, user, RESOURCE, FILTER, query.field);
    const q = await readableQuery(this.fields, user, RESOURCE, query);
    return columnValues(this.repo, scopeOf(user), col, { q: q.q, searchExclude: q.searchExclude, where: await this.where(user, q, query.field), search: query.search });
  }

  /** Gợi ý cho ô lọc. Mảng chuỗi không đi qua chính sách cột được nên cột Ẩn hoặc Che trả rỗng tại đây (review 5.1 lượt 2 N3). */
  async options(user: AuthUser) {
    const scope = scopeOf(user);
    const blind = await this.fields.unreadable(user, RESOURCE, ['customerName', 'season', 'orderType', 'productionFactoryCode']);
    const [customers, seasons, used, types, units, factories] = await Promise.all([
      blind.has('customerName') ? [] : this.repo.distinct(scope, 'CustomerName'),
      blind.has('season') ? [] : this.repo.distinct(scope, 'Season'),
      blind.has('orderType') ? [] : this.repo.distinct(scope, 'OrderType'),
      this.catalogs.activeItems('ORDER_TYPE'),
      this.catalogs.activeItems('UNIT'),
      // Kể cả nhà máy đã ngừng: lưới vẫn hiện đúng tên cho đơn hàng cũ, ô chọn chỉ cho chọn nhà máy đang dùng
      blind.has('productionFactoryCode') ? [] : this.catalogs.productionFactories(),
    ]);
    // Loại: theo danh mục Loại đơn hàng trước, rồi các giá trị đã có trong dữ liệu mà danh mục chưa có (nhập tay, ngừng dùng)
    const orderTypes = blind.has('orderType') ? [] : [...new Set([...types.map((t) => t.code), ...used])];
    return {
      customers,
      seasons,
      orderTypes,
      orderTypeNames: blind.has('orderType') ? {} : Object.fromEntries(types.map((t) => [t.code, t.name])),
      units: units.map((u) => u.name),
      factories,
    };
  }

  /** Nhà máy SX phải là nhà máy đang dùng của danh mục Nhà máy SX; rỗng là bỏ chọn; giữ nguyên giá trị hiện tại của đơn thì không kiểm (nhà máy có thể đã ngừng) */
  private async factoryCode(code: string | null | undefined, current?: string | null): Promise<string | null> {
    if (!code) return null;
    if (code === current) return code;
    if (!(await this.catalogs.productionFactories()).some((f) => f.code === code && f.isActive)) {
      throw invalid(`Nhà máy SX "${code}" không có trong danh mục Nhà máy SX hoặc đã ngừng dùng.`);
    }
    return code;
  }

  async get(user: AuthUser, id: number) {
    return presentSalesOrder(await this.repo.getById(scopeOf(user), id));
  }

  async create(user: AuthUser, dto: SalesOrderCreateDto) {
    const row = await this.repo.createNumbered(
      scopeOf(user),
      {
        CustomerName: dto.customerName,
        StyleCode: dto.styleCode.toUpperCase(),
        Season: dto.season || null,
        OrderType: dto.orderType || null,
        ProductName: dto.productName,
        StaffName: dto.staffName || null,
        Qty: dto.qty,
        UnitName: dto.unitName || 'Chiếc',
        UnitPrice: dto.unitPrice ?? null,
        CmPrice: dto.cmPrice ?? null,
        ShipDate: dto.shipDate,
        StatusCode: dto.statusCode ?? 'NEW',
        ProductionFactoryCode: await this.factoryCode(dto.productionFactoryCode),
      },
      'OrderNo',
      'DH',
    );
    const out = presentSalesOrder(row);
    await this.log(user, row.Id, 'CREATE', undefined, out);
    return out;
  }

  async update(user: AuthUser, id: number, dto: SalesOrderUpdateDto) {
    const scope = scopeOf(user);
    const before = scope.isAggregate ? null : await this.repo.getById(scope, id, 'update');
    const set: Record<string, unknown> = {};
    if (dto.customerName !== undefined) set.CustomerName = dto.customerName;
    if (dto.styleCode !== undefined) set.StyleCode = dto.styleCode.toUpperCase();
    if (dto.season !== undefined) set.Season = dto.season || null;
    if (dto.orderType !== undefined) set.OrderType = dto.orderType || null;
    if (dto.productName !== undefined) set.ProductName = dto.productName;
    if (dto.staffName !== undefined) set.StaffName = dto.staffName || null;
    if (dto.qty !== undefined) set.Qty = dto.qty;
    if (dto.unitName !== undefined) set.UnitName = dto.unitName;
    if (dto.unitPrice !== undefined) set.UnitPrice = dto.unitPrice;
    if (dto.cmPrice !== undefined) set.CmPrice = dto.cmPrice;
    if (dto.shipDate !== undefined) set.ShipDate = dto.shipDate;
    if (dto.statusCode !== undefined) set.StatusCode = dto.statusCode;
    if (dto.productionFactoryCode !== undefined) set.ProductionFactoryCode = await this.factoryCode(dto.productionFactoryCode, before?.ProductionFactoryCode);
    const row = await this.repo.update(scope, id, set);
    const out = presentSalesOrder(row);
    await this.log(user, id, 'UPDATE', before && presentSalesOrder(before), out);
    return out;
  }

  async remove(user: AuthUser, id: number) {
    const scope = scopeOf(user);
    const before = scope.isAggregate ? null : await this.repo.getById(scope, id, 'delete');
    try {
      await this.repo.remove(scope, id);
    } catch (e) {
      if (isReferenceError(e)) throw conflict('Đơn hàng đã có PO hoặc kế hoạch xuất hàng nên không xóa được. Hãy xóa PO, kế hoạch trước hoặc đổi trạng thái sang Hủy.');
      throw e;
    }
    await this.log(user, id, 'DELETE', before && presentSalesOrder(before));
  }

  async export(user: AuthUser, query: OrderListQuery) {
    const q = await readableQuery(this.fields, user, RESOURCE, query);
    const rows = await this.repo.listAll(scopeOf(user), { q: q.q, searchExclude: q.searchExclude, sort: await this.sort(user, q.sort), where: await this.where(user, q) });
    // File xuất ghi tên nhà máy SX, tên chi nhánh như trên lưới; chính sách cột vẫn áp theo khóa productionFactoryCode
    const factoryName = new Map((await this.catalogs.productionFactories()).map((f) => [f.code, f.name]));
    const items = rows.map((r) => {
      const o = presentSalesOrder(r);
      return { ...o, productionFactoryCode: o.productionFactoryCode && (factoryName.get(o.productionFactoryCode) ?? o.productionFactoryCode) };
    });
    return this.exporter.csv(user, RESOURCE, EXPORT_COLUMNS, await this.catalogs.withBranchNames(items), `thong-tin-don-hang-${user.branchCode}.csv`);
  }
}
