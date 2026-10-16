import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AppException, Errors } from '../../common/app.exception';
import type { AuthUser } from '../../platform/auth/auth.types';
import { AuditService, type AuditEntry } from '../../platform/audit/audit.service';
import { scopeOf, type Scope } from '../../platform/data/base.repository';
import { inTransaction } from '../../platform/data/transaction';
import { OrgService, type LineInfo } from '../../platform/org/org.service';
import { UserDirectoryService } from '../../platform/org/user-directory.service';
import { FieldPolicyService } from '../../platform/permission/field-policy.service';
import { LineDayPlanGuards } from '../order/line-day-plan-guard';
import { ScheduleFeed, type DayPlanLineFeed } from '../order/schedule-feed.service';
import { todayVN } from './prep.service';
import type { SewingPlanLockDto, SewingPlanOptionsQuery, SewingPlanQuery, SewingPlanSaveDto } from './sewing-plan.dto';
import { appLock, sameInstant, SewingDayPlanItemRepository, SewingDayPlanRepository, type DayPlanTotal, type SewingDayPlanItemRow, type SewingDayPlanRow } from './sewing-plan.repositories';
import { SEWING_DB } from './sewing.db';
import type { SewingDb } from './sewing.types';

const RESOURCE = 'sewing.plan';
/** Giờ mặc định của một dòng (Q13: cố định tạm, dùng chung mọi ĐVCS) */
export const DEFAULT_START = '07:30';
export const DEFAULT_END = '17:10';

const day = (d: Date | string | null | undefined): string | null => (d == null ? null : d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
/** Cột TIME đọc ra là Date ngày 1970-01-01 theo UTC */
const hhmm = (d: Date | string | null | undefined): string | null => (d == null ? null : d instanceof Date ? d.toISOString().slice(11, 16) : String(d).slice(0, 5));
const num = (v: unknown): number | null => (v == null ? null : Number(v));
const invalid = (msg: string, details: unknown = null) => new AppException('VALIDATION_FAILED', msg, 422, details);
const conflict = (msg: string, details: unknown = null) => new AppException('CONFLICT', msg, 409, details);
/** Phiên bản của bản ghi chuyền × ngày: lần ghi gần nhất (chưa có bản ghi: "0") */
const versionOf = (h: SewingDayPlanRow | undefined) => (h ? String(new Date(h.ModifiedAt ?? h.CreatedAt).getTime()) : '0');
const lockOf = (branchCode: string) => `MES_Sewing.SewingDayPlan.${branchCode}`;
const BUSY = 'Đang có người cập nhật Kế hoạch may của đơn vị cơ sở này. Thử lại sau ít giây.';

/** Chuyền thuộc đơn vị phòng ban: chính chuyền, bộ phận cha trực tiếp hoặc một bộ phận cha trên cây (không có đơn vị: mọi chuyền) */
export const inDept = (l: LineInfo, dept: string | undefined) => !dept || l.code === dept || l.workshopCode === dept || !!l.ancestors?.some((a) => a.code === dept);

/** Doanh số kế hoạch = Kế hoạch theo linemap × Giá CM (quyết định 14.1); thiếu một trong hai thì không có */
export const planRevenue = (linemapQty: number | null, cmPrice: number | null) => (linemapQty == null || cmPrice == null ? null : Math.round(linemapQty * cmPrice * 100) / 100);

/**
 * Kế hoạch may (phase 5.16, quyết định 14.1, 14.2): kế hoạch theo ngày cho từng dòng dàn chuyền. Dòng lấy thẳng từ Xếp chuyền qua
 * ScheduleFeed lúc mở màn; số nhập, trạng thái chốt và bản chụp lưu ở MES_Sewing qua SewingDayPlanRepository (lọc ĐVCS, phạm vi chuyền).
 * Dòng dàn chuyền chưa có bản ghi cũng chỉ hiện khi giá trị (ĐVCS, chuyền) nằm trong phạm vi xem (`allows`).
 */
@Injectable()
export class SewingPlanService implements OnModuleInit {
  constructor(
    @Inject(SEWING_DB) private readonly db: SewingDb,
    private readonly days: SewingDayPlanRepository,
    private readonly items: SewingDayPlanItemRepository,
    private readonly feed: ScheduleFeed,
    private readonly guards: LineDayPlanGuards,
    private readonly org: OrgService,
    private readonly users: UserDirectoryService,
    private readonly fields: FieldPolicyService,
    private readonly audit: AuditService,
  ) {}

  /** Xếp chuyền không bỏ, không đổi chuyền dòng đã có số, không giảm dưới số đã giao (quyết định 14.2): Đơn hàng hỏi qua hàm này */
  onModuleInit() {
    this.guards.register((branchCode, lines) => this.days.usageQuick(branchCode, lines));
  }

  /** Chuyền (kể cả đã giải thể: dữ liệu cũ) của đơn vị chọn trong ĐVCS phiên (A00: mọi ĐVCS) */
  private async deptLines(scope: Scope, dept: string | undefined): Promise<LineInfo[]> {
    return (await this.org.lines(scope.branchCode, scope.isAggregate, { includeInactive: true })).filter((l) => inDept(l, dept));
  }

  /** Giá trị (ĐVCS, chuyền) có nằm trong phạm vi của hành động không: dòng dàn chuyền chưa có bản ghi ở Kế hoạch may */
  private async allowed(scope: Scope, action: 'view' | 'update', lines: { branchCode: string; lineCode: string }[]): Promise<Set<string>> {
    const out = new Set<string>();
    for (const key of new Set(lines.map((l) => `${l.branchCode}|${l.lineCode}`))) {
      const [branchCode, lineCode] = key.split('|');
      if (await this.days.allows(scope, action, { BranchCode: branchCode, LineCode: lineCode })) out.add(key);
    }
    return out;
  }

  /** Cột không được xem nguyên giá trị: số suy ra từ cột đó cũng không trả (Ẩn, Che do interceptor áp cho cột đã đăng ký) */
  private async blind(user: AuthUser) {
    return this.fields.unreadable(user, RESOURCE, ['lineCode', 'styleCode', 'planQty', 'deliveredQty', 'dayQty', 'cmPrice', 'linemapQty']);
  }

  /** Ngày xem được sửa không: không ở A00, có quyền Sửa, không trước hôm nay (giờ Việt Nam, Q9) */
  private editableDay(scope: Scope, date: string, today: string) {
    return !scope.isAggregate && (scope.access.grants.get(`${RESOURCE}:update`)?.length ?? 0) > 0 && date >= today;
  }

  /**
   * Lưới của một ngày: dòng dàn chuyền của các chuyền thuộc đơn vị đang chạy ở ngày đó (Ngày vào chuyền ≤ ngày ≤ Kết thúc ra chuyền),
   * dòng đã có bản ghi ở ngày đó, cộng dòng người dùng vừa thêm (`extra`). Ngày đã chốt hiện bản chụp; ngày chưa chốt hiện số mới nhất
   * của Xếp chuyền (Q11).
   */
  async get(user: AuthUser, q: SewingPlanQuery) {
    const scope = scopeOf(user);
    const today = todayVN();
    const lines = await this.deptLines(scope, q.dept);
    const codes = lines.map((l) => l.code);
    const headers = await this.days.ofDay(scope, q.date, codes, 'view');
    const saved = await this.items.listByParents(scope, headers.map((h) => h.Id), 'view');
    const source = await this.feed.dayPlanLines(scope, { lineCodes: codes, activeOn: q.date, ids: [...saved.map((s) => s.ShipmentPlanLineId), ...(q.extra ?? [])] });
    const inLines = new Set(codes);
    const visible = await this.allowed(scope, 'view', source);
    // Dòng thêm (`extra`) và dòng của bản ghi phải thuộc chuyền của đơn vị đang xem; dòng ngoài phạm vi xem không hiện
    const shown = source.filter((l) => inLines.has(l.lineCode) && visible.has(`${l.branchCode}|${l.lineCode}`));
    const editable = this.editableDay(scope, q.date, today) ? await this.allowed(scope, 'update', shown) : new Set<string>();
    const headerOf = new Map(headers.map((h) => [`${h.BranchCode}|${h.LineCode}`, h]));
    const totals = await this.days.totals(scope, shown.map((l) => ({ branchCode: l.branchCode, id: l.id, createdAt: l.createdAt })), q.date);
    const blind = await this.blind(user);
    const lineName = blind.has('lineCode') ? () => undefined : await this.org.lineNamer();
    const rows = this.merge(shown, saved, headers, totals).map((r) => {
      const h = headerOf.get(`${r.branchCode}|${r.lineCode}`);
      const canEdit = !h?.IsLocked && !r.sourceGone && editable.has(`${r.branchCode}|${r.lineCode}`);
      return this.present(r, h, blind, lineName, canEdit);
    });
    const lineCodes = [...new Set(rows.map((r) => `${r.branchCode}|${r.lineCode}`))];
    return {
      date: q.date,
      today,
      editableDay: this.editableDay(scope, q.date, today),
      lines: lineCodes.map((k) => {
        const [branchCode, lineCode] = k.split('|');
        const h = headerOf.get(k);
        return {
          branchCode,
          lineCode,
          lineName: lineName(lineCode),
          locked: !!h?.IsLocked,
          lockedAt: h?.LockedAt ?? null,
          lockerName: h?.LockerName ?? null,
          version: versionOf(h),
          canEdit: editable.has(k),
        };
      }),
      items: rows,
    };
  }

  /**
   * Ghép dòng nguồn với bản ghi của ngày. Bản ghi có Id dòng dàn chuyền khớp nguồn nhưng khác thời điểm tạo (Id được dùng lại), hoặc
   * không còn nguồn: hiện theo bản chụp, đánh dấu `sourceGone` (chỉ xem).
   */
  private merge(source: DayPlanLineFeed[], saved: SewingDayPlanItemRow[], headers: SewingDayPlanRow[], totals: DayPlanTotal[]) {
    const headerById = new Map(headers.map((h) => [h.Id, h]));
    const savedFor = (l: DayPlanLineFeed) => saved.find((s) => s.ShipmentPlanLineId === l.id && sameInstant(s.SourceCreatedAt, l.createdAt) && headerById.get(s.SewingDayPlanId)?.LineCode === l.lineCode);
    const totalFor = (branchCode: string, id: number, createdAt: Date) => totals.find((t) => t.lineId === id && t.branchCode === branchCode && sameInstant(t.createdAt, createdAt));
    const used = new Set<number>();
    const out = source.map((l) => {
      const s = savedFor(l);
      if (s) used.add(s.Id);
      return { branchCode: l.branchCode, lineCode: l.lineCode, source: l, saved: s, total: totalFor(l.branchCode, l.id, l.createdAt), sourceGone: false };
    });
    for (const s of saved) {
      if (used.has(s.Id)) continue;
      const h = headerById.get(s.SewingDayPlanId);
      if (!h) continue;
      out.push({ branchCode: s.BranchCode, lineCode: h.LineCode, source: undefined as unknown as DayPlanLineFeed, saved: s, total: undefined, sourceGone: true });
    }
    return out.sort((a, b) => a.lineCode.localeCompare(b.lineCode) || (day(a.source?.startDate ?? a.saved?.StartDate) ?? '').localeCompare(day(b.source?.startDate ?? b.saved?.StartDate) ?? '') || lineIdOf(a) - lineIdOf(b));
  }

  /** Một dòng của lưới; khóa trùng mã cột đăng ký để chính sách cột áp */
  private present(r: ReturnType<SewingPlanService['merge']>[number], h: SewingDayPlanRow | undefined, blind: Set<string>, lineName: (c: string) => string | undefined, canEdit: boolean) {
    const s = r.saved;
    // Ngày đã chốt hiện bản chụp; dòng chưa có trong bản chụp (Xếp chuyền thêm, đổi ngày sau khi chốt; Thêm dòng) hiện số mới nhất, chỉ
    // xem (review 5.16 H2)
    const live = (!h?.IsLocked && !r.sourceGone) || !s ? r.source : undefined;
    const planQty = live ? live.qty : Number(s!.PlanQty);
    const cmPrice = live ? live.cmPrice : num(s!.CmPrice);
    const dayQty = num(s?.DayQty);
    const linemapQty = num(s?.LinemapQty);
    const before = r.total?.before ?? 0;
    const delivered = before + (dayQty ?? 0);
    return {
      lineId: r.source?.id ?? s!.ShipmentPlanLineId,
      lineCreatedAt: r.source?.createdAt ?? s!.SourceCreatedAt,
      planId: r.source?.planId ?? s!.ShipmentPlanId,
      branchCode: r.branchCode,
      lineCode: r.lineCode,
      lineName: lineName(r.lineCode),
      styleCode: live ? live.styleCode : s!.StyleCode,
      // Tên sản phẩm không là cột đăng ký: không trả khi Mã hàng không xem được (suy ra được mã hàng)
      productName: blind.has('styleCode') ? undefined : live ? live.productName : s!.ProductName,
      poBuyDate: live ? live.poBuyDate : s!.PoBuyDate,
      cmPrice,
      startDate: live ? live.startDate : day(s!.StartDate),
      endDate: live ? live.endDate : day(s!.EndDate),
      planQty,
      deliveredQty: delivered,
      // Số suy ra: không xem được cột gốc thì không trả (chính sách cột chỉ áp cho chính cột đó)
      remainQty: blind.has('planQty') || blind.has('deliveredQty') ? null : planQty - delivered,
      linemapQty,
      dayQty,
      planRevenue: blind.has('cmPrice') || blind.has('linemapQty') ? null : planRevenue(linemapQty, cmPrice),
      startTime: hhmm(s?.StartTime) ?? DEFAULT_START,
      endTime: hhmm(s?.EndTime) ?? DEFAULT_END,
      // Để màn hình tính Đã giao, Còn lại, kiểm không giao vượt khi gõ: tổng các ngày trước, sau ngày đang xem
      otherBefore: blind.has('deliveredQty') || blind.has('dayQty') ? null : before,
      otherAfter: blind.has('deliveredQty') || blind.has('dayQty') || blind.has('planQty') ? null : (r.total?.after ?? 0),
      saved: !!s,
      // Chuyền chưa có bản ghi trong ngày: lần đầu lập cần quyền Thêm (giao diện khóa nút kèm lý do, không cần đọc mã chuyền bị Che)
      firstOfDay: !h,
      locked: !!h?.IsLocked,
      sourceGone: r.sourceGone,
      canEdit,
    };
  }

  /**
   * Dòng dàn chuyền của các chuyền thuộc đơn vị (mọi ngày), cho Thêm dòng: chuyền → mã hàng → PO/Buy date. Chỉ chuyền trong phạm vi xem.
   */
  async options(user: AuthUser, q: SewingPlanOptionsQuery) {
    const scope = scopeOf(user);
    const lines = await this.deptLines(scope, q.dept);
    const source = await this.feed.dayPlanLines(scope, { lineCodes: lines.map((l) => l.code) });
    const visible = await this.allowed(scope, 'view', source);
    const blind = await this.blind(user);
    const lineName = blind.has('lineCode') ? () => undefined : await this.org.lineNamer();
    return source
      .filter((l) => visible.has(`${l.branchCode}|${l.lineCode}`))
      .map((l) => ({
        lineId: l.id,
        lineCreatedAt: l.createdAt,
        branchCode: l.branchCode,
        lineCode: l.lineCode,
        lineName: lineName(l.lineCode),
        styleCode: l.styleCode,
        productName: blind.has('styleCode') ? undefined : l.productName,
        poBuyDate: l.poBuyDate,
        startDate: l.startDate,
        endDate: l.endDate,
        planQty: l.qty,
      }));
  }

  /** Ngày ghi được: không ở A00, không trước hôm nay (Q9) */
  private assertDay(scope: Scope, date: string) {
    if (scope.isAggregate) throw Errors.aggregateReadOnly();
    if (date < todayVN()) throw invalid('Không điều chỉnh được Kế hoạch may của ngày đã qua.');
  }

  /** Bản ghi chuyền × ngày (trong phạm vi sửa) phải chưa bị người khác ghi sau lúc mở màn; trả các chuyền lệch */
  private staleLines(headers: SewingDayPlanRow[], versions: { line: string; version: string }[] | undefined, lineCodes: Iterable<string>) {
    if (!versions) return [];
    const given = new Map(versions.map((v) => [v.line, v.version]));
    const byLine = new Map(headers.map((h) => [h.LineCode, h]));
    return [...new Set(lineCodes)].filter((c) => given.has(c) && given.get(c) !== versionOf(byLine.get(c)));
  }

  /**
   * Cập nhật (Q9, Q7): lưu số nhập của các dòng gửi lên cho ngày đã chọn, chụp lại các cột từ Xếp chuyền. Một transaction MES_Sewing, khóa
   * ứng dụng theo ĐVCS (hai người lưu hai ngày khác nhau của cùng dòng không cùng vượt Tổng kế hoạch). 422 không ghi dòng nào: ngày đã
   * qua, số sai, giờ sai, giao vượt; 404 kèm `details.ids`: dòng dàn chuyền không còn, ngoài phạm vi sửa; 409: chuyền đã chốt, người
   * khác vừa ghi.
   */
  async save(user: AuthUser, dto: SewingPlanSaveDto) {
    const scope = scopeOf(user);
    this.assertDay(scope, dto.date);
    await this.days.assertWritable(scope);
    if (new Set(dto.items.map((i) => i.lineId)).size !== dto.items.length) throw invalid('Một dòng dàn chuyền chỉ được gửi một lần.');
    const blindQty = (await this.fields.unreadable(user, RESOURCE, ['planQty', 'deliveredQty'])).size > 0;
    const { lineName, label } = await this.labels(user);
    const audits: AuditEntry[] = [];
    const result = await inTransaction(this.db, async (trx) => {
      await appLock(trx, lockOf(scope.branchCode), BUSY);
      const source = await this.feed.dayPlanLines(scope, { ids: dto.items.map((i) => i.lineId) });
      const byId = new Map(source.map((l) => [l.id, l]));
      const writable = await this.allowed(scope, 'update', source);
      const missing = dto.items
        .filter((i) => {
          const l = byId.get(i.lineId);
          return !l || !sameInstant(l.createdAt, new Date(i.lineCreatedAt)) || !writable.has(`${l.branchCode}|${l.lineCode}`);
        })
        .map((i) => i.lineId);
      if (missing.length) {
        throw new AppException('NOT_FOUND', `${missing.length} dòng không còn trong Xếp chuyền hoặc ngoài phạm vi sửa của bạn nên chưa lưu gì.`, 404, { ids: missing.sort((a, b) => a - b) });
      }
      const lineCodes = [...new Set(source.map((l) => l.lineCode))];
      let headers = await this.days.ofDay(scope, dto.date, lineCodes, 'update', trx);
      const stale = this.staleLines(headers, dto.versions, lineCodes);
      if (stale.length) throw conflict(`Kế hoạch may của ${lineName(stale)} vừa được người khác cập nhật. Tải lại rồi nhập tiếp.`, { lines: stale });
      const locked = headers.filter((h) => h.IsLocked);
      if (locked.length) throw conflict(`Kế hoạch may ngày này của ${lineName(locked.map((h) => h.LineCode))} đã chốt. Hủy chốt trước khi sửa.`, { lines: locked.map((h) => h.LineCode) });
      headers = await this.ensureHeaders(scope, dto.date, lineCodes, headers, trx);
      const headerOf = new Map(headers.map((h) => [h.LineCode, h]));
      const existing = await this.items.listByParents(scope, headers.map((h) => h.Id), 'update', trx);
      const totals = await this.days.totals(scope, source.map((l) => ({ branchCode: l.branchCode, id: l.id, createdAt: l.createdAt })), dto.date, trx);
      const over: string[] = [];
      const planned = new Map<number, number>();
      const add: { parentId: number; values: Record<string, unknown> }[] = [];
      const touched = new Set<number>();
      for (const i of dto.items) {
        const l = byId.get(i.lineId)!;
        const h = headerOf.get(l.lineCode)!;
        const cur = existing.find((e) => e.SewingDayPlanId === h.Id && e.ShipmentPlanLineId === l.id);
        // Id dàn chuyền được dùng lại (dòng khác): bản ghi cũ không thuộc dòng này, bỏ trước khi ghi
        const same = cur && sameInstant(cur.SourceCreatedAt, l.createdAt) ? cur : undefined;
        if (cur && !same) await this.items.removeMany(scope, [cur.Id], trx);
        const linemapQty = i.linemapQty === undefined ? num(same?.LinemapQty) : i.linemapQty;
        const dayQty = i.dayQty === undefined ? num(same?.DayQty) : i.dayQty;
        const startTime = i.startTime ?? hhmm(same?.StartTime) ?? DEFAULT_START;
        const endTime = i.endTime ?? hhmm(same?.EndTime) ?? DEFAULT_END;
        if (endTime <= startTime) throw invalid(`${label(l)}: Đến giờ phải sau Từ giờ.`);
        const t = totals.find((x) => x.lineId === l.id && sameInstant(x.createdAt, l.createdAt));
        const total = (t?.before ?? 0) + (t?.after ?? 0) + (dayQty ?? 0);
        planned.set(l.id, total);
        // Chỉ chặn khi tổng tăng: dòng đã vượt từ trước (dữ liệu cũ) vẫn giảm được số
        if (total > l.qty && (dayQty ?? 0) > (num(same?.DayQty) ?? 0)) over.push(blindQty ? label(l) : `${label(l)}: tổng giao ${total}, Tổng kế hoạch ${l.qty}`);
        const values = {
          ShipmentPlanLineId: l.id,
          SourceCreatedAt: l.createdAt,
          ShipmentPlanId: l.planId,
          StyleCode: l.styleCode,
          ProductName: l.productName,
          PoBuyDate: l.poBuyDate,
          CmPrice: l.cmPrice,
          StartDate: l.startDate,
          EndDate: l.endDate,
          PlanQty: l.qty,
          LinemapQty: linemapQty,
          DayQty: dayQty,
          StartTime: startTime,
          EndTime: endTime,
          SortOrder: l.sortOrder,
        };
        touched.add(h.Id);
        audits.push(this.entry(user, h.Id, 'UPDATE', same ? snapshotOf(same) : null, { lineId: l.id, styleCode: l.styleCode, lineCode: l.lineCode, linemapQty, dayQty, startTime, endTime }));
        if (same) await this.items.updateRow(scope, same.Id, values, trx);
        else add.push({ parentId: h.Id, values });
      }
      if (over.length) throw invalid(`Không giao vượt Tổng kế hoạch (${over.slice(0, 3).join('; ')}${over.length > 3 ? ` và ${over.length - 3} dòng khác` : ''}). Muốn giao thêm, tăng Số lượng ở Xếp chuyền trước.`, { lines: over });
      await this.items.insertMany(scope, add, trx);
      for (const id of touched) await this.days.update(scope, id, {}, trx);
      // Hai database không có transaction chung: Xếp chuyền có thể vừa giảm Số lượng, đổi chuyền, bỏ dòng; đọc lại sau khi ghi (quyết định
      // 14.2). Xếp chuyền đang ghi cùng dòng thì câu đọc chờ tới khi Xếp chuyền xong (hoặc Xếp chuyền hết giờ chờ, trả 409)
      const now = new Map((await this.feed.dayPlanLines(scope, { ids: source.map((l) => l.id) })).map((l) => [l.id, l]));
      const changed = source.find((l) => {
        const n = now.get(l.id);
        return !n || !sameInstant(n.createdAt, l.createdAt) || n.lineCode !== l.lineCode || (n.qty < l.qty && (planned.get(l.id) ?? 0) > n.qty);
      });
      if (changed) throw conflict(`Xếp chuyền vừa đổi dòng dàn chuyền của ${label(changed)}. Tải lại rồi nhập lại.`);
      return { saved: dto.items.length };
    });
    await this.audit.logMany(await Promise.all(audits.map(async (a) => ({ ...a, oldValue: await this.fields.redact(RESOURCE, a.oldValue), newValue: await this.fields.redact(RESOURCE, a.newValue) }))));
    return result;
  }

  /**
   * Tên dùng trong câu báo lỗi, theo chính sách cột (review 5.16 L4): Tổ SX không xem được thì không nêu chuyền; Mã hàng không xem được
   * thì nêu Id dòng dàn chuyền.
   */
  private async labels(user: AuthUser) {
    const blind = await this.fields.unreadable(user, RESOURCE, ['lineCode', 'styleCode']);
    const namer = await this.org.lineNamer();
    const one = (code: string) => (blind.has('lineCode') ? 'chuyền' : namer(code));
    return {
      lineName: (codes: string[]) => (blind.has('lineCode') ? `${codes.length} chuyền` : codes.map(namer).join(', ')),
      label: (l: DayPlanLineFeed) => (blind.size ? `dòng dàn chuyền ${l.id}` : `${one(l.lineCode)}, ${l.styleCode}`),
    };
  }

  /**
   * Bản ghi chuyền × ngày cho các chuyền chưa có (dưới khóa ứng dụng của ĐVCS nên không tạo trùng). Tạo bản ghi cần quyền Thêm của
   * Kế hoạch may (như lệnh cấp BTP, quyết định 13.10): lần đầu lập kế hoạch cho chuyền trong ngày.
   */
  private async ensureHeaders(scope: Scope, date: string, lineCodes: string[], headers: SewingDayPlanRow[], trx: SewingDb) {
    const todo = lineCodes.filter((c) => !headers.some((h) => h.LineCode === c));
    if (todo.length && !this.days.grantsFor(scope, 'create').length) {
      throw new AppException('PERMISSION_DENIED', 'Lập Kế hoạch may lần đầu cho chuyền trong ngày cần quyền Thêm ở Kế hoạch may.', 403);
    }
    const out = [...headers];
    for (const code of todo) out.push(await this.days.create(scope, { PlanDate: date, LineCode: code, IsLocked: false }, trx));
    return out;
  }

  /**
   * Chốt (Q10): khóa mọi chuyền đang hiện của đơn vị chọn trong ngày, trong phạm vi sửa. Chuyền chưa có bản ghi thì tạo cùng các dòng
   * đang chạy (ô nhập trống); dòng đã có thì chụp lại từ Xếp chuyền. Chuyền không có dòng nào thì bỏ qua.
   */
  async lock(user: AuthUser, dto: SewingPlanLockDto) {
    const scope = scopeOf(user);
    this.assertDay(scope, dto.date);
    await this.days.assertWritable(scope);
    const lines = await this.deptLines(scope, dto.dept);
    const { lineName } = await this.labels(user);
    const lockerName = await this.users.fullName(user.userId);
    const audits: AuditEntry[] = [];
    const result = await inTransaction(this.db, async (trx) => {
      await appLock(trx, lockOf(scope.branchCode), BUSY);
      const codes = lines.map((l) => l.code);
      let headers = await this.days.ofDay(scope, dto.date, codes, 'update', trx);
      const saved = await this.items.listByParents(scope, headers.map((h) => h.Id), 'update', trx);
      const source = await this.feed.dayPlanLines(scope, { lineCodes: codes, activeOn: dto.date, ids: saved.map((s) => s.ShipmentPlanLineId) });
      const writable = await this.allowed(scope, 'update', source);
      const mine = source.filter((l) => codes.includes(l.lineCode) && writable.has(`${l.branchCode}|${l.lineCode}`));
      const target = [...new Set([...mine.map((l) => l.lineCode), ...headers.filter((h) => saved.some((s) => s.SewingDayPlanId === h.Id)).map((h) => h.LineCode)])].filter(
        (c) => !headers.find((h) => h.LineCode === c)?.IsLocked,
      );
      const stale = this.staleLines(headers, dto.versions, target);
      if (stale.length) throw conflict(`Kế hoạch may của ${lineName(stale)} vừa được người khác cập nhật. Tải lại rồi chốt.`, { lines: stale });
      headers = await this.ensureHeaders(scope, dto.date, target, headers, trx);
      const add: { parentId: number; values: Record<string, unknown> }[] = [];
      for (const code of target) {
        const h = headers.find((x) => x.LineCode === code)!;
        for (const l of mine.filter((x) => x.lineCode === code)) {
          const cur = saved.find((s) => s.SewingDayPlanId === h.Id && s.ShipmentPlanLineId === l.id);
          const snapshot = {
            SourceCreatedAt: l.createdAt,
            ShipmentPlanId: l.planId,
            StyleCode: l.styleCode,
            ProductName: l.productName,
            PoBuyDate: l.poBuyDate,
            CmPrice: l.cmPrice,
            StartDate: l.startDate,
            EndDate: l.endDate,
            PlanQty: l.qty,
            SortOrder: l.sortOrder,
          };
          if (cur && sameInstant(cur.SourceCreatedAt, l.createdAt)) await this.items.updateRow(scope, cur.Id, snapshot, trx);
          else {
            if (cur) await this.items.removeMany(scope, [cur.Id], trx);
            add.push({ parentId: h.Id, values: { ShipmentPlanLineId: l.id, ...snapshot } });
          }
        }
        await this.days.update(scope, h.Id, { IsLocked: true, LockedAt: new Date(), LockedBy: user.userId, LockerName: lockerName }, trx);
        audits.push(this.entry(user, h.Id, 'LOCK', null, { date: dto.date, lineCode: code }));
      }
      await this.items.insertMany(scope, add, trx);
      return { locked: target.length };
    });
    await this.audit.logMany(audits);
    return result;
  }

  /** Hủy chốt: mở khóa các chuyền đang chốt của đơn vị chọn trong ngày, trong phạm vi sửa. Ngày đã qua không hủy được (Q9) */
  async unlock(user: AuthUser, dto: SewingPlanLockDto) {
    const scope = scopeOf(user);
    this.assertDay(scope, dto.date);
    await this.days.assertWritable(scope);
    const lines = await this.deptLines(scope, dto.dept);
    const { lineName } = await this.labels(user);
    const audits: AuditEntry[] = [];
    const result = await inTransaction(this.db, async (trx) => {
      await appLock(trx, lockOf(scope.branchCode), BUSY);
      const headers = (await this.days.ofDay(scope, dto.date, lines.map((l) => l.code), 'update', trx)).filter((h) => h.IsLocked);
      // Người khác vừa chốt lại, cập nhật sau lúc mở màn: hủy chốt theo ảnh cũ thì 409 (review 5.16 L9)
      const stale = this.staleLines(headers, dto.versions, headers.map((h) => h.LineCode));
      if (stale.length) throw conflict(`Kế hoạch may của ${lineName(stale)} vừa được người khác cập nhật. Tải lại rồi hủy chốt.`, { lines: stale });
      for (const h of headers) {
        await this.days.update(scope, h.Id, { IsLocked: false, LockedAt: null, LockedBy: null, LockerName: null }, trx);
        audits.push(this.entry(user, h.Id, 'UNLOCK', { date: dto.date, lineCode: h.LineCode, lockerName: h.LockerName, lockedAt: h.LockedAt }, null));
      }
      return { unlocked: headers.length };
    });
    await this.audit.logMany(audits);
    return result;
  }

  private entry(user: AuthUser, id: number, action: string, oldValue: unknown, newValue: unknown): AuditEntry {
    return { userId: user.userId, username: user.username, branchCode: user.branchCode, entityType: 'SewingDayPlan', entityId: id, actionCode: action, oldValue, newValue, ip: user.ip };
  }
}

const lineIdOf = (r: { source?: DayPlanLineFeed; saved?: SewingDayPlanItemRow }) => r.source?.id ?? r.saved?.ShipmentPlanLineId ?? 0;
const snapshotOf = (s: SewingDayPlanItemRow) => ({
  lineId: s.ShipmentPlanLineId,
  styleCode: s.StyleCode,
  linemapQty: num(s.LinemapQty),
  dayQty: num(s.DayQty),
  startTime: hhmm(s.StartTime),
  endTime: hhmm(s.EndTime),
});
