import { Injectable } from '@nestjs/common';
import type { Scope } from '../../platform/data/base.repository';
import { LineColorSizeFeedRepository } from './order.repositories';

/** SL giao của một chuyền, mã hàng, màu, cỡ ở Phân bổ màu cỡ, cộng mọi kế hoạch xuất hàng của ĐVCS */
export interface LineColorSizeFeedItem {
  branchCode: string;
  lineCode: string;
  styleCode: string;
  productName: string;
  colorName: string;
  sizeName: string;
  planQty: number;
}

/** ĐVCS của phiên (token do server cấp); đơn vị tổng hợp A00: mọi ĐVCS. Không nhận mã ĐVCS thô từ nơi gọi. */
const branchOf = (scope: Scope) => (scope.isAggregate ? null : scope.branchCode);

/**
 * API công khai của module Đơn hàng cho màn Xác nhận cấp BTP của module Cắt (quyết định 13.8): Số lượng kế hoạch của một dòng cấp là
 * SL giao ở Phân bổ màu cỡ theo chuyền, mã hàng, màu, cỡ, cộng mọi kế hoạch (một mã hàng có thể ở nhiều kế hoạch, khác PO/Buy date).
 * Đọc thẳng lúc cần, không chép: màn chỉ tra theo một chuyền, một mã hàng. Đơn hàng không biết module Cắt.
 */
@Injectable()
export class LineColorSizeFeed {
  constructor(private readonly repo: LineColorSizeFeedRepository) {}

  /** Phân bổ của các chuyền (và một mã hàng nếu có) trong ĐVCS đang làm việc (A00: mọi ĐVCS), theo thứ tự chuyền, mã hàng, màu cỡ */
  async allocationsOf(scope: Scope, filter: { lineCodes: string[]; styleCode?: string }): Promise<LineColorSizeFeedItem[]> {
    const rows = await this.repo.totals(branchOf(scope), filter);
    return rows.map((r) => ({
      branchCode: r.BranchCode,
      lineCode: r.LineCode,
      styleCode: r.StyleCode,
      productName: r.ProductName,
      colorName: r.ColorName,
      sizeName: r.SizeName,
      planQty: r.Qty,
    }));
  }

  /** Mã hàng đã phân màu cỡ cho một chuyền của ĐVCS đang làm việc (A00: mọi ĐVCS) */
  async stylesOf(scope: Scope, lineCode: string): Promise<{ branchCode: string; styleCode: string; productName: string }[]> {
    return (await this.repo.styles(branchOf(scope), lineCode)).map((r) => ({ branchCode: r.BranchCode, styleCode: r.StyleCode, productName: r.ProductName }));
  }
}
