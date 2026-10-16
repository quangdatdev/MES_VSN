import { Injectable, Logger } from '@nestjs/common';
import { conflict, someOf } from './order.util';

/** Số đã lập ở Kế hoạch may cho một dòng dàn chuyền (cộng mọi ngày) */
export interface DayPlanUsage {
  lineId: number;
  /** Tổng Kế hoạch ngày xưởng giao mọi ngày */
  deliveredQty: number;
  /** Có ngày nào đã nhập số (linemap hoặc ngày xưởng giao) */
  hasEntries: boolean;
}

/**
 * Số đã lập của các dòng dàn chuyền trong một ĐVCS. Dòng nhận diện bằng Id + thời điểm tạo (Id được dùng lại sau khi nạp lại dữ liệu
 * đơn hàng). Module giữ Kế hoạch may (module May) đăng ký hàm này.
 */
export type DayPlanLookup = (branchCode: string, lines: { id: number; createdAt: Date }[]) => Promise<DayPlanUsage[]>;

/** Một dòng dàn chuyền đang lưu ở Xếp chuyền: số lượng, chuyền trước và sau khi lưu (`next` không có: dòng bị bỏ) */
export interface LineChange {
  id: number;
  createdAt: Date;
  lineCode: string;
  qty: number;
  next?: { lineCode: string; qty: number };
}

/**
 * Điểm đăng ký công khai của module Đơn hàng (quyết định 14.2, phase 5.16 Q7, Q12): Tổng kế hoạch của Kế hoạch may là Số lượng của dòng
 * dàn chuyền, nên Xếp chuyền không giảm Số lượng (kể cả bỏ dòng) xuống dưới tổng đã giao, không bỏ, không đổi chuyền dòng đã có số ở Kế
 * hoạch may. Module May đăng ký hàm tra lúc khởi động; Đơn hàng không import module May, như LineSupplyGuards.
 * Hai database không có transaction chung: Xếp chuyền tra sau khi ghi dòng dàn chuyền, trước commit (đang giữ khóa ghi: lần Cập nhật Kế
 * hoạch may đọc lại dòng dàn chuyền phải chờ tới khi Xếp chuyền xong); lần Cập nhật của Kế hoạch may đọc lại Số lượng, chuyền sau khi ghi.
 */
@Injectable()
export class LineDayPlanGuards {
  private readonly logger = new Logger(LineDayPlanGuards.name);
  private readonly lookups: DayPlanLookup[] = [];

  register(lookup: DayPlanLookup) {
    this.lookups.push(lookup);
  }

  /**
   * 409 khi có dòng bị bỏ hoặc đổi chuyền mà đã có số ở Kế hoạch may, hoặc Số lượng mới dưới tổng đã giao. Chỉ xét dòng có thay đổi đó.
   * Không tra được thì cũng chặn (không biết chắc). `showQty` false: câu báo không nêu số.
   */
  async assertKept(branchCode: string, changes: LineChange[], opts: { lineName: (code: string) => string; showQty: boolean }): Promise<void> {
    const risky = changes.filter((c) => !c.next || c.next.lineCode !== c.lineCode || c.next.qty < c.qty);
    if (!this.lookups.length || !risky.length) return;
    let usage: DayPlanUsage[];
    try {
      usage = (await Promise.all(this.lookups.map((l) => l(branchCode, risky.map((c) => ({ id: c.id, createdAt: c.createdAt })))))).flat();
    } catch (e) {
      this.logger.warn(`Không tra được số đã lập ở Kế hoạch may (${branchCode}): ${(e as Error)?.message ?? e}`);
      throw conflict('Chưa kiểm được số đã lập ở Kế hoạch may (đang có người cập nhật Kế hoạch may cùng chuyền, hoặc module May không phản hồi). Thử lại sau ít giây.');
    }
    const byLine = new Map<number, DayPlanUsage>();
    for (const u of usage) {
      const cur = byLine.get(u.lineId);
      byLine.set(u.lineId, { lineId: u.lineId, deliveredQty: (cur?.deliveredQty ?? 0) + u.deliveredQty, hasEntries: !!cur?.hasEntries || u.hasEntries });
    }
    const errors: string[] = [];
    for (const c of risky) {
      const u = byLine.get(c.id);
      if (!u?.hasEntries && !u?.deliveredQty) continue;
      const name = opts.lineName(c.lineCode);
      if (!c.next) errors.push(`${name}: đã có số ở Kế hoạch may, không bỏ dòng được`);
      else if (c.next.lineCode !== c.lineCode) errors.push(`${name}: đã có số ở Kế hoạch may, không đổi chuyền được`);
      else if (c.next.qty < u.deliveredQty) errors.push(opts.showQty ? `${name}: đã giao ${u.deliveredQty}, số lượng mới ${c.next.qty}` : `${name}: số lượng mới thấp hơn số đã giao`);
    }
    if (errors.length) {
      throw conflict(`Dòng dàn chuyền đã có kế hoạch theo ngày ở Kế hoạch may (${someOf(errors, 'dòng')}). Giảm, bỏ số ở màn Kế hoạch may trước.`, errors);
    }
  }
}
