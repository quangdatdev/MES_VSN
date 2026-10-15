import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { AppException, Errors } from '../../common/app.exception';
import type { AuthUser } from '../../platform/auth/auth.types';
import { AuditService } from '../../platform/audit/audit.service';
import { CatalogLookupService } from '../../platform/catalog/catalog-lookup.service';
import { scopeOf, type Scope } from '../../platform/data/base.repository';
import { allOf, assertFilterField, columnFilterWhere, columnValues, readableColumnFilters } from '../../platform/data/column-filter';
import { inTransaction } from '../../platform/data/transaction';
import { ExportService } from '../../platform/export/export.service';
import { OrgService } from '../../platform/org/org.service';
import { UserDirectoryService } from '../../platform/org/user-directory.service';
import { FieldPolicyService, MASK } from '../../platform/permission/field-policy.service';
import { LineColorSizeFeed, type LineColorSizeFeedItem } from '../order/line-color-size-feed.service';
import { LineSupplyGuards } from '../order/line-supply-guard';
import { todayVN } from './cutting-progress.service';
import { SUPPLY_STATUSES, type SupplyCellKeyDto, type SupplyListQuery, type SupplySaveDto, type SupplySheetDto, type SupplyStatus, type SupplyValuesQuery } from './cutting-supply.dto';
import {
  CuttingSupplyLineRepository,
  CuttingSupplyRepository,
  SUPPLY_FILTER,
  SUPPLY_SORT,
  supplyListColumns,
  type CuttingSupplyLineRow,
  type CuttingSupplyListRow,
  type CuttingSupplyRow,
} from './cutting-supply.repositories';
import { CUTTING_DB } from './cutting.db';
import { cellKey } from './cutting.repositories';
import type { CuttingDb } from './cutting.types';

const RESOURCE = 'cutting.supply';
const DEFAULT_SORT = 'createdAt:desc';
export const SUPPLY_STATUS_LABEL: Record<SupplyStatus, string> = { PENDING: 'Chưa cấp', PARTIAL: 'Cấp 1 phần', FULL: 'Cấp toàn phần' };

const EXPORT_COLUMNS = [
  { key: 'createdDate', label: 'Ngày tạo phiếu', field: 'createdAt' },
  { key: 'supplyDate', label: 'Ngày cấp' },
  { key: 'supplyNo', label: 'Số lệnh cấp' },
  { key: 'branchName', label: 'Chi nhánh', field: 'branchCode' },
  { key: 'styleCode', label: 'Mã hàng' },
  { key: 'dayQty', label: 'Tổng SL cấp' },
  { key: 'creatorName', label: 'Người lập' },
  { key: 'confirmerName', label: 'Người cấp' },
  { key: 'statusText', label: 'Trạng thái', field: 'statusCode' },
  { key: 'note', label: 'Ghi chú' },
];

const day = (d: Date | string | null | undefined): string | null => (d == null ? null : d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
/** Ngày theo giờ Việt Nam của một thời điểm UTC (Ngày tạo phiếu) */
const vnDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
const escapeLike = (s: string) => `%${s.replace(/[%_[]/g, (c) => `[${c}]`)}%`;
const invalid = (msg: string, details: unknown = null) => new AppException('VALIDATION_FAILED', msg, 422, details);
const conflict = (msg: string, details: unknown = null) => new AppException('CONFLICT', msg, 409, details);
const someOf = (items: string[], what: string) => (items.length > 3 ? `${items.slice(0, 3).join('; ')} và ${items.length - 3} ${what} khác` : items.join('; '));
/** Mã hàng so như collation của database (không phân biệt hoa thường, bỏ khoảng trắng cuối) */
const styleKey = (s: string) => s.trimEnd().toLowerCase();
const lineKey = (line: string, color: string, size: string) => `${line.trim().toUpperCase()}\u0000${cellKey(color, size)}`;
/** Số lệnh cấp "NNN/ddMMyy/XBTP" theo Ngày cấp (quyết định 13.9) */
export const supplyNoOf = (seq: number, date: string) => `${String(seq).padStart(3, '0')}/${date.slice(8, 10)}${date.slice(5, 7)}${date.slice(2, 4)}/XBTP`;

/** Một dòng của lưới chi tiết, số thô trước khi áp chính sách cột */
interface SheetRow {
  lineCode: string;
  styleCode: string;
  productName: string | null;
  colorName: string;
  sizeName: string;
  /** Có trong Phân bổ màu cỡ của chuyền */
  inPlan: boolean;
  planQty: number;
  syncQty: number;
  suppliedQty: number;
  dayQty: number | null;
  remainQty: number;
  /** Số đã cấp (mọi ngày) cho các chuyền khác cùng mã hàng, màu, cỡ: giao diện kiểm tổng cấp không vượt Số lượng đồng bộ */
  otherLinesQty: number;
}

/** Số liệu của một mã hàng trong một ĐVCS dùng để tính lưới và kiểm khi lưu */
interface StyleFigures {
  /** Phân bổ màu cỡ theo chuyền, màu, cỡ */
  plan: Map<string, LineColorSizeFeedItem>;
  /** Đã cấp mọi ngày theo chuyền, màu, cỡ */
  total: Map<string, number>;
  /** Đã cấp theo chuyền, màu, cỡ trong từng ngày: `${ngày}|${khóa}` */
  ofDay: Map<string, number>;
  /** Đã cấp mọi chuyền, mọi ngày theo màu cỡ */
  byCell: Map<string, number>;
  /** Lũy kế cắt theo màu cỡ */
  cut: Map<string, number>;
  productName: string | null;
  styleCode: string | null;
}

@Injectable()
export class CuttingSupplyService implements OnModuleInit {
  constructor(
    @Inject(CUTTING_DB) private readonly db: CuttingDb,
    private readonly repo: CuttingSupplyRepository,
    private readonly lines: CuttingSupplyLineRepository,
    private readonly feed: LineColorSizeFeed,
    private readonly supplyGuards: LineSupplyGuards,
    private readonly org: OrgService,
    private readonly users: UserDirectoryService,
    private readonly audit: AuditService,
    private readonly exporter: ExportService,
    private readonly fields: FieldPolicyService,
    private readonly catalogs: CatalogLookupService,
  ) {}

  /**
   * Phân bổ màu cỡ không giảm xuống dưới số BTP đã cấp (phase 5.15 Q12): Đơn hàng hỏi số đã cấp qua điểm đăng ký này, trong transaction
   * đang giữ khóa ở MES_Order. Lần lưu số cấp cùng chuyền có thể đang giữ khóa ở MES_Cutting và chờ đọc lại phân bổ: vòng chờ qua hai
   * database SQL Server không phát hiện được, nên câu tra chỉ chờ khóa ngắn (`suppliedQuick`); hết giờ thì Đơn hàng trả 409, nhả khóa
   * (review 5.15 M1).
   */
  onModuleInit() {
    this.supplyGuards.register(async (branchCode, styleCode, lineCodes) =>
      (await this.repo.suppliedQuick(branchCode, styleCode, lineCodes)).map((r) => ({ lineCode: r.LineCode, colorName: r.ColorName, sizeName: r.SizeName, qty: r.Qty })),
    );
  }

  /** Tên chuyền theo mã; mã chuyền bị Ẩn, Che thì không trả tên (tên suy ra được mã), như Phân bổ màu cỡ */
  private async lineNames(user: AuthUser): Promise<(code: string) => string | null> {
    if ((await this.fields.unreadable(user, RESOURCE, ['lineCode'])).size) return () => null;
    return this.org.lineNamer();
  }

  // ---------- Lưới lệnh cấp ----------

  /** Dải lọc theo ảnh mẫu và lọc theo cột. Cột không được xem nguyên giá trị thì không lọc, không tìm theo nó. */
  private async filter(user: AuthUser, q: SupplyListQuery, except?: string) {
    const blind = await this.fields.unreadable(user, RESOURCE, ['supplyNo', 'styleCode', 'creatorName', 'confirmerName', 'note', 'statusCode']);
    const searchExclude = [
      ['SupplyNo', 'supplyNo'],
      ['StyleCode', 'styleCode'],
      ['CreatorName', 'creatorName'],
      ['ConfirmerName', 'confirmerName'],
      ['Note', 'note'],
    ]
      .filter(([, f]) => blind.has(f))
      .map(([c]) => c);
    const columns = await readableColumnFilters(this.fields, user, RESOURCE, q.cf, SUPPLY_FILTER);
    const status = q.status && SUPPLY_STATUSES.includes(q.status) && !blind.has('statusCode') ? q.status : null;
    const business = <Q extends { where: (...a: any[]) => Q }>(qb: Q): Q => {
      // Ngày tạo phiếu theo giờ Việt Nam; CreatedAt lưu UTC
      if (q.createdFrom) qb = qb.where('CreatedAt', '>=', new Date(`${q.createdFrom}T00:00:00+07:00`));
      if (q.createdTo) qb = qb.where('CreatedAt', '<', new Date(new Date(`${q.createdTo}T00:00:00+07:00`).getTime() + 86_400_000));
      if (q.supplyNo && !blind.has('supplyNo')) qb = qb.where('SupplyNo', 'like', escapeLike(q.supplyNo));
      if (q.style && !blind.has('styleCode')) qb = qb.where('StyleCode', 'like', escapeLike(q.style));
      if (q.creator && !blind.has('creatorName')) qb = qb.where('CreatorName', 'like', escapeLike(q.creator));
      return qb;
    };
    const byStatus = status ? columnFilterWhere([{ field: 'statusCode', mode: 'in', values: [status] }], SUPPLY_FILTER) : null;
    return { where: allOf(business, byStatus, columnFilterWhere(columns, SUPPLY_FILTER, except)), searchExclude };
  }

  /** "trường:chiều" sang biểu thức của danh sách trắng; trường lạ, bị Ẩn, Che thì theo mặc định */
  private async orderOf(user: AuthUser, raw: string | undefined) {
    const parse = async (text: string) => {
      const parts = text.split(',').slice(0, 4).map((x) => x.split(':'));
      const blind = await this.fields.unreadable(user, RESOURCE, parts.map(([f]) => f));
      return parts
        .filter(([f]) => Object.prototype.hasOwnProperty.call(SUPPLY_SORT, f) && !blind.has(f))
        .map(([f, d]) => ({ expr: SUPPLY_SORT[f], dir: d === 'asc' ? ('asc' as const) : ('desc' as const) }));
    };
    const asked = raw ? await parse(raw) : [];
    return asked.length ? asked : await parse(DEFAULT_SORT);
  }

  private present(r: CuttingSupplyRow, dayQty?: number) {
    return {
      id: r.Id,
      supplyNo: r.SupplyNo,
      supplyDate: day(r.SupplyDate),
      styleCode: r.StyleCode,
      branchCode: r.BranchCode,
      creatorName: r.CreatorName,
      confirmerName: r.ConfirmerName,
      confirmedAt: r.ConfirmedAt,
      note: r.Note,
      statusCode: r.StatusCode as SupplyStatus,
      ...(dayQty === undefined ? {} : { dayQty }),
      createdAt: r.CreatedAt,
    };
  }

  async values(user: AuthUser, q: SupplyValuesQuery) {
    const col = await assertFilterField(this.fields, user, RESOURCE, SUPPLY_FILTER, q.field);
    const f = await this.filter(user, q, q.field);
    return columnValues(this.repo, scopeOf(user), col, { q: q.q, searchExclude: f.searchExclude, where: f.where, search: q.search });
  }

  async list(user: AuthUser, q: SupplyListQuery) {
    const f = await this.filter(user, q);
    const page = await this.repo.list(scopeOf(user), {
      page: q.page,
      pageSize: q.pageSize,
      q: q.q,
      searchExclude: f.searchExclude,
      where: f.where,
      select: supplyListColumns,
      orderBy: await this.orderOf(user, q.sort),
    });
    return { ...page, today: todayVN(), items: (page.items as CuttingSupplyListRow[]).map((r) => this.present(r, Number(r.DayQty))) };
  }

  async export(user: AuthUser, q: SupplyListQuery) {
    const f = await this.filter(user, q);
    const rows = (await this.repo.listAll(scopeOf(user), { q: q.q, searchExclude: f.searchExclude, where: f.where, select: supplyListColumns, orderBy: await this.orderOf(user, q.sort) })) as CuttingSupplyListRow[];
    const presented = await this.catalogs.withBranchNames(rows.map((r) => this.present(r, Number(r.DayQty))));
    const items = presented.map((o) => ({ ...o, createdDate: vnDay(o.createdAt), statusText: SUPPLY_STATUS_LABEL[o.statusCode] }));
    return this.exporter.csv(user, RESOURCE, EXPORT_COLUMNS, items, `lenh-cap-btp-${user.branchCode}.csv`);
  }

  // ---------- Số liệu của lưới chi tiết ----------

  /**
   * Số liệu của một mã hàng trong ĐVCS `branchCode` (quyết định 13.8): Phân bổ màu cỡ của các chuyền (cộng mọi kế hoạch), số đã cấp mọi
   * chuyền mọi ngày, Lũy kế cắt theo màu cỡ. `scope`: phiên, cho API của Đơn hàng (A00 đọc mọi ĐVCS rồi lọc theo ĐVCS của lệnh).
   */
  private async figures(scope: Scope, branchCode: string, style: string, lineCodes: string[], db: Kysely<any> = this.db): Promise<StyleFigures> {
    const [plans, supplied, cut] = await Promise.all([
      this.feed.allocationsOf(scope, { lineCodes: [...new Set(lineCodes)], styleCode: style }),
      this.repo.supplied(branchCode, style, undefined, db),
      this.repo.cutByStyle(branchCode, [style], db),
    ]);
    const plan = new Map<string, LineColorSizeFeedItem>();
    for (const p of plans) if (p.branchCode === branchCode) plan.set(lineKey(p.lineCode, p.colorName, p.sizeName), p);
    const total = new Map<string, number>();
    const ofDay = new Map<string, number>();
    const byCell = new Map<string, number>();
    for (const s of supplied) {
      const k = lineKey(s.LineCode, s.ColorName, s.SizeName);
      total.set(k, (total.get(k) ?? 0) + s.Qty);
      const dk = `${day(s.SupplyDate)}|${k}`;
      ofDay.set(dk, (ofDay.get(dk) ?? 0) + s.Qty);
      const ck = cellKey(s.ColorName, s.SizeName);
      byCell.set(ck, (byCell.get(ck) ?? 0) + s.Qty);
    }
    const first = [...plan.values()][0] ?? null;
    return { plan, total, ofDay, byCell, cut: new Map(cut.map((c) => [cellKey(c.ColorName, c.SizeName), c.Qty])), productName: first?.productName ?? null, styleCode: first?.styleCode ?? null };
  }

  /** Các dòng (chuyền, mã hàng, màu, cỡ) của lưới theo Ngày cấp `date`, số thô */
  private async rowsFor(scope: Scope, branchCode: string, date: string, keys: SupplyCellKeyDto[], db: Kysely<any> = this.db): Promise<SheetRow[]> {
    const byStyle = new Map<string, { style: string; lines: Set<string> }>();
    for (const k of keys) {
      const g = byStyle.get(styleKey(k.style)) ?? { style: k.style, lines: new Set<string>() };
      g.lines.add(k.line);
      byStyle.set(styleKey(k.style), g);
    }
    const figs = new Map<string, StyleFigures>();
    for (const [sk, g] of byStyle) figs.set(sk, await this.figures(scope, branchCode, g.style, [...g.lines], db));
    return keys.map((k) => {
      const f = figs.get(styleKey(k.style))!;
      const lk = lineKey(k.line, k.colorName, k.sizeName);
      const p = f.plan.get(lk);
      const total = f.total.get(lk) ?? 0;
      const dayQty = f.ofDay.get(`${date}|${lk}`) ?? null;
      const suppliedQty = total - (dayQty ?? 0);
      const planQty = p?.planQty ?? 0;
      const ck = cellKey(k.colorName, k.sizeName);
      return {
        lineCode: k.line,
        styleCode: p?.styleCode ?? f.styleCode ?? k.style,
        productName: p?.productName ?? f.productName,
        colorName: p?.colorName ?? k.colorName,
        sizeName: p?.sizeName ?? k.sizeName,
        inPlan: !!p,
        planQty,
        syncQty: f.cut.get(ck) ?? 0,
        suppliedQty,
        dayQty,
        remainQty: planQty - suppliedQty - (dayQty ?? 0),
        otherLinesQty: (f.byCell.get(ck) ?? 0) - total,
      };
    });
  }

  /** Áp chính sách cột cho cột tính: Còn lại suy ra từ SL kế hoạch, đã cấp, trong ngày; số chuyền khác suy ra từ đã cấp */
  private async presentRows(user: AuthUser, rows: SheetRow[]) {
    const blind = await this.fields.unreadable(user, RESOURCE, ['planQty', 'suppliedQty', 'dayQty', 'syncQty']);
    const name = await this.lineNames(user);
    const remainBlind = blind.has('planQty') || blind.has('suppliedQty') || blind.has('dayQty');
    const otherBlind = blind.has('suppliedQty');
    return rows.map((r) => ({
      ...r,
      lineName: name(r.lineCode) ?? undefined,
      remainQty: remainBlind ? MASK : r.remainQty,
      otherLinesQty: otherBlind ? MASK : r.otherLinesQty,
    }));
  }

  /**
   * Lệnh của các mã hàng ở Ngày cấp. `locked`: lệnh đã xác nhận, dòng của mã hàng đó chỉ xem (khóa không phải mã cột nên không bị che
   * khi Trạng thái bị Che, Ẩn: review 5.15 M3).
   */
  private async suppliesOf(scope: Scope, date: string, styles: string[]) {
    return (await this.repo.ofDayStyles(scope, date, styles)).map((s) => ({
      id: s.Id,
      supplyNo: s.SupplyNo,
      styleCode: s.StyleCode,
      statusCode: s.StatusCode as SupplyStatus,
      locked: s.StatusCode !== 'PENDING',
      note: s.Note,
    }));
  }

  /**
   * Tính lưới nhập theo Ngày cấp (Thêm mới, Sửa, đổi Ngày cấp, thêm dòng): số đã lưu của ngày đó ở cột Trong ngày, số các ngày khác ở cột
   * Đã cấp; SL kế hoạch, SL đồng bộ không theo ngày. Đơn vị tổng hợp không nhập được nên không có lưới nhập.
   */
  async sheet(user: AuthUser, dto: SupplySheetDto) {
    const scope = scopeOf(user);
    await this.repo.assertWritable(scope);
    const today = todayVN();
    if (dto.date > today) throw invalid('Ngày cấp không được sau hôm nay.');
    const rows = await this.rowsFor(scope, scope.branchCode, dto.date, dto.items);
    const supplies = await this.suppliesOf(scope, dto.date, [...new Set(rows.map((r) => r.styleCode))]);
    // Dòng của mã hàng có lệnh đã xác nhận ở ngày này: chỉ xem (cờ theo dòng để giao diện không phải so mã hàng, có thể bị che)
    const locked = new Set(supplies.filter((s) => s.locked).map((s) => styleKey(s.styleCode)));
    const shown = (await this.presentRows(user, rows)).map((r, i) => ({ ...r, locked: locked.has(styleKey(rows[i].styleCode)) }));
    return { date: dto.date, today, rows: shown, supplies };
  }

  /** Chi tiết một lệnh: các dòng của lệnh theo Ngày cấp của lệnh */
  async get(user: AuthUser, id: number) {
    const scope = scopeOf(user);
    const row = await this.repo.getById(scope, id);
    const lines = await this.lines.listByParent(scope, id);
    const date = day(row.SupplyDate)!;
    const rows = await this.rowsFor(
      scope,
      row.BranchCode,
      date,
      lines.map((l) => ({ line: l.LineCode, style: row.StyleCode, colorName: l.ColorName, sizeName: l.SizeName })),
    );
    const [canUpdate, canDelete] = await Promise.all([this.repo.allowed(scope, id, 'update'), this.repo.allowed(scope, id, 'delete')]);
    const pending = row.StatusCode === 'PENDING';
    const [named] = await this.catalogs.withBranchNames([this.present(row)]);
    return {
      ...named,
      today: todayVN(),
      rows: await this.presentRows(user, rows),
      canEdit: canUpdate && pending,
      canDelete: canDelete && pending,
      canConfirm: canUpdate && pending,
      canUnconfirm: canUpdate && !pending,
    };
  }

  // ---------- Ô chọn của form ----------

  /** Mã hàng đã phân màu cỡ cho chuyền (Phân bổ màu cỡ) */
  async styles(user: AuthUser, line: string) {
    return this.feed.stylesOf(scopeOf(user), line);
  }

  /** Màu, cỡ đã phân cho chuyền và mã hàng */
  async colorSizes(user: AuthUser, line: string, style: string) {
    const rows = await this.feed.allocationsOf(scopeOf(user), { lineCodes: [line], styleCode: style });
    return rows.map((r) => ({ colorName: r.colorName, sizeName: r.sizeName }));
  }

  // ---------- Ghi ----------

  /**
   * Lưu số cấp của Ngày cấp (quyết định 13.8): chỉ các ô gửi lên; số > 0 ghi đè số của ngày đó, 0 hoặc null xóa. Ô gom theo mã hàng vào
   * lệnh (ĐVCS, Ngày cấp, Mã hàng); chưa có thì tạo lệnh mới (cần quyền Thêm) với số lệnh tự sinh. Lệnh đã xác nhận không sửa được (409).
   * Ô tăng số phải có trong Phân bổ màu cỡ của chuyền; tổng cấp mọi ngày không vượt SL kế hoạch (Còn lại ≥ 0); tổng cấp mọi chuyền của
   * màu cỡ không vượt Lũy kế cắt (Q5). Chỉ chặn ô tăng số: số kế hoạch giảm sau khi cấp thì vẫn giảm được số đã cấp.
   */
  async save(user: AuthUser, dto: SupplySaveDto) {
    const scope = scopeOf(user);
    await this.repo.assertWritable(scope);
    const today = todayVN();
    if (dto.date > today) throw invalid('Ngày cấp không được sau hôm nay.');
    const keys = dto.items.map((i) => `${styleKey(i.style)}\u0001${lineKey(i.line, i.colorName, i.sizeName)}`);
    if (new Set(keys).size !== keys.length) throw invalid('Một chuyền, mã hàng, màu, cỡ chỉ được gửi một lần.');
    const branch = scope.branchCode;
    const name = await this.lineNames(user);
    const label = (line: string, color: string, size: string) => `${name(line) ?? 'Chuyền'}, ${color}/${size}`;
    const blindQty = (await this.fields.unreadable(user, RESOURCE, ['planQty', 'syncQty', 'suppliedQty'])).size > 0;
    const creatorName = await this.users.fullName(user.userId);

    // Phân bổ màu cỡ (MES_Order) đọc trước transaction của MES_Cutting: tên mã hàng, màu, cỡ ghi theo phân bổ, không theo chữ client gửi
    const groups = new Map<string, { style: string; items: SupplySaveDto['items'] }>();
    for (const s of dto.styles) if (!groups.has(styleKey(s))) groups.set(styleKey(s), { style: s.trim(), items: [] });
    for (const i of dto.items) {
      const g = groups.get(styleKey(i.style)) ?? { style: i.style, items: [] };
      g.items.push(i);
      groups.set(styleKey(i.style), g);
    }
    const plans = new Map<string, Map<string, LineColorSizeFeedItem>>();
    for (const [sk, g] of groups) {
      const rows = g.items.length ? await this.feed.allocationsOf(scope, { lineCodes: [...new Set(g.items.map((i) => i.line))], styleCode: g.style }) : [];
      plans.set(sk, new Map(rows.filter((r) => r.branchCode === branch).map((r) => [lineKey(r.lineCode, r.colorName, r.sizeName), r])));
      // Mã hàng theo phân bổ (đúng chữ hoa thường đã lưu ở kế hoạch)
      if (rows[0]) g.style = rows[0].styleCode;
    }

    const res = await inTransaction(this.db, async (trx) => {
      const styles = [...groups.values()].map((g) => g.style);
      await this.repo.lockStyles(scope, styles, trx);
      const existing = new Map((await this.repo.ofDayStyles(scope, dto.date, styles, trx)).map((s) => [styleKey(s.StyleCode), s]));
      type Change = { line: string; colorName: string; sizeName: string; cur: number | null; next: number | null; increased: boolean };
      const work: { sk: string; style: string; supply: CuttingSupplyRow | undefined; changes: Change[]; noteChanged: boolean; figs: StyleFigures }[] = [];
      const overPlan: string[] = [];
      const overCut: string[] = [];
      const missing: string[] = [];
      for (const [sk, g] of groups) {
        const figs = await this.figures(scope, branch, g.style, g.items.map((i) => i.line), trx);
        const plan = plans.get(sk)!;
        const supply = existing.get(sk);
        const changes: Change[] = [];
        const delta = new Map<string, number>();
        for (const i of g.items) {
          const lk = lineKey(i.line, i.colorName, i.sizeName);
          const p = plan.get(lk);
          const cur = figs.ofDay.get(`${dto.date}|${lk}`) ?? null;
          const next = i.dayQty ? i.dayQty : null;
          if (cur === next) continue;
          const increased = (next ?? 0) > (cur ?? 0);
          const colorName = p?.colorName ?? i.colorName;
          const sizeName = p?.sizeName ?? i.sizeName;
          changes.push({ line: i.line, colorName, sizeName, cur, next, increased });
          const ck = cellKey(colorName, sizeName);
          delta.set(ck, (delta.get(ck) ?? 0) + (next ?? 0) - (cur ?? 0));
          // Dòng không còn trong Phân bổ màu cỡ (phân bổ bỏ sau khi cấp): chỉ giảm được số (review 5.15 M2)
          if (increased && !p) missing.push(label(i.line, colorName, sizeName));
          else if (increased) {
            const all = (figs.total.get(lk) ?? 0) - (cur ?? 0) + (next ?? 0);
            if (all > p!.planQty) overPlan.push(blindQty ? label(i.line, colorName, sizeName) : `${label(i.line, colorName, sizeName)}: cấp ${all} > SL kế hoạch ${p!.planQty}`);
          }
        }
        // Tổng cấp mọi chuyền của màu cỡ không vượt số đã cắt (Q5); chỉ xét màu cỡ có ô tăng trong lần lưu này
        for (const c of changes.filter((x) => x.increased)) {
          const ck = cellKey(c.colorName, c.sizeName);
          if (!delta.has(ck)) continue;
          const after = (figs.byCell.get(ck) ?? 0) + delta.get(ck)!;
          const cut = figs.cut.get(ck) ?? 0;
          if (delta.get(ck)! > 0 && after > cut) overCut.push(blindQty ? `${g.style}, ${c.colorName}/${c.sizeName}` : `${g.style}, ${c.colorName}/${c.sizeName}: cấp ${after} > SL đồng bộ ${cut}`);
          delta.delete(ck);
        }
        const note = dto.note === undefined ? undefined : dto.note?.trim() || null;
        const noteChanged = note !== undefined && !!supply && (supply.Note ?? null) !== note;
        if (supply && supply.StatusCode !== 'PENDING' && (changes.length || noteChanged)) {
          throw conflict(`Lệnh cấp ${supply.SupplyNo} (mã hàng ${supply.StyleCode}) đã xác nhận cấp: Hủy duyệt trước khi sửa.`);
        }
        work.push({ sk, style: g.style, supply, changes, noteChanged, figs });
      }
      if (missing.length) throw invalid(`Chưa có trong Phân bổ màu cỡ của chuyền: ${someOf(missing, 'dòng')}. Dòng đã bỏ khỏi phân bổ chỉ giảm được số.`, { cells: missing });
      if (overPlan.length) throw invalid(`Số lượng còn lại âm: tổng cấp vượt số lượng kế hoạch ở ${someOf(overPlan, 'dòng')}.`, { cells: overPlan });
      if (overCut.length) throw invalid(`Tổng cấp vượt số lượng đã cắt (số lượng đồng bộ) ở ${someOf(overCut, 'màu cỡ')}.`, { cells: overCut });

      const note = dto.note === undefined ? undefined : dto.note?.trim() || null;
      const touched: number[] = [];
      const logs: { id: number; supplyNo: string; styleCode: string; created: boolean; noteBefore: string | null; cells: { before: unknown[]; after: unknown[] } }[] = [];
      for (const w of work) {
        let supply = w.supply;
        let created = false;
        if (!supply && w.changes.some((c) => c.next !== null)) {
          // Lệnh mới: cần quyền Thêm (lưu số cấp là quyền Sửa)
          if (!this.repo.grantsFor(scope, 'create').length) throw Errors.permissionDenied();
          const year = Number(dto.date.slice(0, 4));
          const seq = await this.repo.nextSeq(scope, year, trx);
          supply = await this.repo.create(
            scope,
            { SupplyNo: supplyNoOf(seq, dto.date), SupplyYear: year, SupplySeq: seq, SupplyDate: dto.date, StyleCode: w.style, Note: note ?? null, StatusCode: 'PENDING', CreatorName: creatorName },
            trx,
          );
          created = true;
        }
        if (!supply) continue;
        const current = new Map((await this.lines.listByParent(scope, supply.Id, 'update', trx)).map((l) => [lineKey(l.LineCode, l.ColorName, l.SizeName), l] as const));
        const add: Record<string, unknown>[] = [];
        const drop: number[] = [];
        let sort = Math.max(-1, ...[...current.values()].map((l) => l.SortOrder));
        for (const c of w.changes) {
          const row = current.get(lineKey(c.line, c.colorName, c.sizeName));
          if (c.next === null) {
            if (row) drop.push(row.Id);
          } else if (row) await this.lines.updateRow(scope, row.Id, { Qty: c.next }, trx);
          else add.push({ LineCode: c.line, ColorName: c.colorName, SizeName: c.sizeName, Qty: c.next, SortOrder: ++sort });
        }
        await this.lines.removeMany(scope, drop, trx);
        await this.lines.insert(scope, supply.Id, add, trx);
        if (!created && (w.changes.length || w.noteChanged)) await this.repo.update(scope, supply.Id, w.noteChanged ? { Note: note } : {}, trx);
        touched.push(supply.Id);
        const show = (c: Change, qty: number | null) => ({ lineCode: c.line, colorName: c.colorName, sizeName: c.sizeName, dayQty: qty });
        if (created || w.changes.length || w.noteChanged) {
          logs.push({
            id: supply.Id,
            supplyNo: supply.SupplyNo,
            styleCode: supply.StyleCode,
            created,
            noteBefore: created ? null : (w.supply?.Note ?? null),
            cells: { before: w.changes.map((c) => show(c, c.cur)), after: w.changes.map((c) => show(c, c.next)) },
          });
        }
      }
      const removed = new Set(await this.repo.removeEmpty(scope, touched, trx));

      // Kiểm lại Phân bổ màu cỡ sau khi ghi, trước commit: lần lưu Phân bổ màu cỡ, Xếp chuyền chen giữa có thể vừa giảm phần giao (hai
      // database không có transaction chung, quyết định 13.8). Chỉ xét ô tăng số
      for (const w of work) {
        const inc = w.changes.filter((c) => c.increased);
        if (!inc.length) continue;
        // Lần lưu Phân bổ màu cỡ, Xếp chuyền đang giữ khóa lâu: 409 "thử lại" thay vì 500 khi hết giờ chờ (review 5.15 N1)
        const fresh = await this.figures(scope, branch, w.style, inc.map((c) => c.line), trx).catch((e: unknown) => {
          if (e instanceof AppException) throw e;
          throw conflict('Chưa đọc lại được Phân bổ màu cỡ (đang có người lưu Phân bổ màu cỡ hoặc Xếp chuyền). Thử lại sau ít giây.');
        });
        const short = inc.filter((c) => {
          const lk = lineKey(c.line, c.colorName, c.sizeName);
          return (fresh.total.get(lk) ?? 0) > (fresh.plan.get(lk)?.planQty ?? 0);
        });
        if (short.length) throw conflict(`Phân bổ màu cỡ vừa thay đổi nên không lưu được (${someOf(short.map((c) => label(c.line, c.colorName, c.sizeName)), 'dòng')}). Tải lại rồi nhập lại.`);
      }
      return { logs, removed };
    });

    for (const l of res.logs) {
      const removed = res.removed.has(l.id);
      await this.audit.log({
        userId: user.userId,
        username: user.username,
        branchCode: user.branchCode,
        entityType: 'CuttingSupply',
        entityId: l.id,
        actionCode: l.created ? 'CREATE' : removed ? 'DELETE' : 'UPDATE',
        oldValue: l.created ? null : await this.fields.redact(RESOURCE, { supplyNo: l.supplyNo, styleCode: l.styleCode, date: dto.date, note: l.noteBefore, cells: l.cells.before }),
        newValue: removed ? { emptied: true } : await this.fields.redact(RESOURCE, { supplyNo: l.supplyNo, styleCode: l.styleCode, date: dto.date, note: dto.note, cells: l.cells.after }),
        ip: user.ip,
      });
    }
    const styles = [...new Set(dto.items.map((i) => i.style).concat(dto.styles))];
    return {
      saved: res.logs.map((l) => ({ id: l.id, supplyNo: l.supplyNo, styleCode: l.styleCode, created: l.created, removed: res.removed.has(l.id) })),
      ...(await this.sheet(user, { date: dto.date, items: dto.items.map(({ line, style, colorName, sizeName }) => ({ line, style, colorName, sizeName })) }).then((s) => ({
        ...s,
        supplies: s.supplies.filter((x) => styles.some((st) => styleKey(st) === styleKey(x.styleCode))),
      }))),
    };
  }

  /**
   * Xác nhận cấp: ghi người cấp, lúc cấp; trạng thái tính lúc này rồi giữ nguyên (Q7): mọi dòng của lệnh có Còn lại = 0 (cấp hết SL kế
   * hoạch của chuyền, màu, cỡ tính cả các ngày khác) thì Cấp toàn phần, không thì Cấp 1 phần.
   */
  async confirm(user: AuthUser, id: number) {
    const scope = scopeOf(user);
    await this.repo.assertWritable(scope);
    const before = await this.repo.getById(scope, id, 'update');
    const confirmerName = await this.users.fullName(user.userId);
    const out = await inTransaction(this.db, async (trx) => {
      await this.repo.lockStyles(scope, [before.StyleCode], trx);
      await this.repo.lock(scope, id, 'update', trx);
      const row = await this.repo.getById(scope, id, 'update', trx);
      if (row.StatusCode !== 'PENDING') throw conflict(`Lệnh cấp ${row.SupplyNo} đã được xác nhận.`);
      const lines = await this.lines.listByParent(scope, id, 'update', trx);
      const rows = await this.rowsFor(
        scope,
        row.BranchCode,
        day(row.SupplyDate)!,
        lines.map((l) => ({ line: l.LineCode, style: row.StyleCode, colorName: l.ColorName, sizeName: l.SizeName })),
        trx,
      );
      const status: SupplyStatus = rows.every((r) => r.remainQty <= 0) ? 'FULL' : 'PARTIAL';
      await this.repo.update(scope, id, { StatusCode: status, ConfirmedAt: new Date(), ConfirmedBy: user.userId, ConfirmerName: confirmerName }, trx);
      return { row, status };
    });
    await this.audit.log({
      userId: user.userId,
      username: user.username,
      branchCode: user.branchCode,
      entityType: 'CuttingSupply',
      entityId: id,
      actionCode: 'CONFIRM',
      oldValue: { supplyNo: out.row.SupplyNo, statusCode: 'PENDING' },
      newValue: { supplyNo: out.row.SupplyNo, statusCode: out.status, confirmerName },
      ip: user.ip,
    });
    return this.get(user, id);
  }

  /** Hủy duyệt: về Chưa cấp, bỏ người cấp; lệnh sửa, xóa được lại */
  async unconfirm(user: AuthUser, id: number) {
    const scope = scopeOf(user);
    await this.repo.assertWritable(scope);
    const out = await inTransaction(this.db, async (trx) => {
      await this.repo.lock(scope, id, 'update', trx);
      const row = await this.repo.getById(scope, id, 'update', trx);
      if (row.StatusCode === 'PENDING') throw conflict(`Lệnh cấp ${row.SupplyNo} chưa được xác nhận.`);
      await this.repo.update(scope, id, { StatusCode: 'PENDING', ConfirmedAt: null, ConfirmedBy: null, ConfirmerName: null }, trx);
      return row;
    });
    await this.audit.log({
      userId: user.userId,
      username: user.username,
      branchCode: user.branchCode,
      entityType: 'CuttingSupply',
      entityId: id,
      actionCode: 'UNCONFIRM',
      oldValue: { supplyNo: out.SupplyNo, statusCode: out.StatusCode, confirmerName: out.ConfirmerName },
      newValue: { supplyNo: out.SupplyNo, statusCode: 'PENDING' },
      ip: user.ip,
    });
    return this.get(user, id);
  }

  /** Xóa lệnh Chưa cấp cùng mọi số cấp của lệnh */
  async remove(user: AuthUser, id: number) {
    const scope = scopeOf(user);
    await this.repo.assertWritable(scope);
    const style = (await this.repo.getById(scope, id, 'delete')).StyleCode;
    const out = await inTransaction(this.db, async (trx) => {
      // Khóa mã hàng trước khóa dòng như lưu số cấp, xác nhận: không khóa chéo với lần lưu cùng lệnh
      await this.repo.lockStyles(scope, [style], trx);
      await this.repo.lock(scope, id, 'delete', trx);
      const row = await this.repo.getById(scope, id, 'delete', trx);
      if (row.StatusCode !== 'PENDING') throw conflict(`Lệnh cấp ${row.SupplyNo} đã xác nhận cấp: Hủy duyệt trước khi xóa.`);
      const lines: CuttingSupplyLineRow[] = await this.lines.listByParent(scope, id, 'delete', trx);
      await this.lines.removeWhere(scope, { parentId: id }, trx, 'delete');
      await this.repo.remove(scope, id, trx);
      return { row, lines };
    });
    await this.audit.log({
      userId: user.userId,
      username: user.username,
      branchCode: user.branchCode,
      entityType: 'CuttingSupply',
      entityId: id,
      actionCode: 'DELETE',
      oldValue: await this.fields.redact(RESOURCE, {
        supplyNo: out.row.SupplyNo,
        styleCode: out.row.StyleCode,
        date: day(out.row.SupplyDate),
        cells: out.lines.map((l) => ({ lineCode: l.LineCode, colorName: l.ColorName, sizeName: l.SizeName, dayQty: l.Qty })),
      }),
      newValue: null,
      ip: user.ip,
    });
    return { removed: true };
  }
}
