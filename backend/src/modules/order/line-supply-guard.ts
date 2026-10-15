import { Injectable, Logger } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { LineColorSizeFeedRepository, type LineStyleAllocationRow } from './order.repositories';
import { colorSizeKey, conflict, someOf } from './order.util';

/** Số BTP đã cấp (mọi ngày) cho một chuyền, màu, cỡ của một mã hàng */
export interface SuppliedCell {
  lineCode: string;
  colorName: string;
  sizeName: string;
  qty: number;
}

/** Số đã cấp của một mã hàng ở các chuyền, trong một ĐVCS. Module giữ số cấp (module Cắt) đăng ký hàm này. */
export type SuppliedLookup = (branchCode: string, styleCode: string, lineCodes: string[]) => Promise<SuppliedCell[]>;

const keyOf = (line: string, color: string, size: string) => `${line.trim().toUpperCase()}\u0000${colorSizeKey(color, size)}`;

/**
 * Điểm đăng ký công khai của module Đơn hàng (quyết định 13.8, phase 5.15 Q12): phần giao ở Phân bổ màu cỡ không được giảm xuống dưới
 * số BTP đã cấp cho chuyền, màu, cỡ đó (cộng mọi kế hoạch cùng mã hàng). Module Cắt đăng ký hàm tra số đã cấp lúc khởi động; Phân bổ
 * màu cỡ, Xếp chuyền chụp phần giao trước khi ghi rồi kiểm sau khi ghi, trước commit. Đơn hàng không import module Cắt, như
 * ShipmentPlanDeleteGuards. Hai database không có transaction chung: lần cấp BTP đang lưu cùng lúc có thể lọt, module Cắt kiểm lại
 * phần giao sau khi ghi số cấp.
 */
@Injectable()
export class LineSupplyGuards {
  private readonly logger = new Logger(LineSupplyGuards.name);
  private readonly lookups: SuppliedLookup[] = [];

  constructor(private readonly repo: LineColorSizeFeedRepository) {}

  register(lookup: SuppliedLookup) {
    this.lookups.push(lookup);
  }

  /** Phần giao hiện có của một mã hàng ở các chuyền (đọc trong transaction đang giữ khóa kế hoạch) */
  snapshot(db: Kysely<any>, branchCode: string, styleCode: string, lineCodes: string[]): Promise<LineStyleAllocationRow[]> {
    return this.repo.totals(branchCode, { lineCodes: [...new Set(lineCodes)], styleCode }, db);
  }

  /**
   * Sau khi ghi (cùng transaction, trước commit): phần giao nào giảm so với `before` mà xuống dưới số đã cấp thì 409, transaction bỏ.
   * Chỉ xét ô giảm, để dữ liệu cũ đang lệch không chặn việc sửa ô khác. Không tra được số đã cấp thì cũng chặn (không biết chắc).
   * `showQty` false: câu báo không nêu số (người sửa không được xem số lượng).
   */
  async assertCovered(
    db: Kysely<any>,
    branchCode: string,
    styleCode: string,
    before: LineStyleAllocationRow[],
    opts: { lineName: (code: string) => string; showQty: boolean },
  ): Promise<void> {
    if (!this.lookups.length || !before.length) return;
    const lineCodes = [...new Set(before.map((b) => b.LineCode))];
    const after = new Map((await this.snapshot(db, branchCode, styleCode, lineCodes)).map((r) => [keyOf(r.LineCode, r.ColorName, r.SizeName), r.Qty]));
    const decreased = before.filter((b) => (after.get(keyOf(b.LineCode, b.ColorName, b.SizeName)) ?? 0) < b.Qty);
    if (!decreased.length) return;
    let supplied: SuppliedCell[];
    try {
      supplied = (await Promise.all(this.lookups.map((l) => l(branchCode, styleCode, lineCodes)))).flat();
    } catch (e) {
      this.logger.warn(`Không tra được số BTP đã cấp của mã hàng (${branchCode}): ${(e as Error)?.message ?? e}`);
      throw conflict('Chưa kiểm được số bán thành phẩm đã cấp cho chuyền (đang có người lưu số cấp cùng chuyền, hoặc module Cắt không phản hồi). Thử lại sau ít giây.');
    }
    const given = new Map<string, number>();
    for (const s of supplied) {
      const k = keyOf(s.lineCode, s.colorName, s.sizeName);
      given.set(k, (given.get(k) ?? 0) + s.qty);
    }
    const errors = decreased
      .filter((b) => (given.get(keyOf(b.LineCode, b.ColorName, b.SizeName)) ?? 0) > (after.get(keyOf(b.LineCode, b.ColorName, b.SizeName)) ?? 0))
      .map((b) => {
        const k = keyOf(b.LineCode, b.ColorName, b.SizeName);
        const label = `${opts.lineName(b.LineCode)}, ${b.ColorName}/${b.SizeName}`;
        return opts.showQty ? `${label}: đã cấp BTP ${given.get(k)}, phần giao mới ${after.get(k) ?? 0}` : label;
      });
    if (errors.length) {
      throw conflict(`Phần giao mới thấp hơn số bán thành phẩm đã cấp cho chuyền (${someOf(errors, 'mục')}). Giảm số cấp ở màn Xác nhận cấp BTP trước.`, errors);
    }
  }
}
