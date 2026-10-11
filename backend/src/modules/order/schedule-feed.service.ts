import { Injectable } from '@nestjs/common';
import type { Scope } from '../../platform/data/base.repository';
import { LinePlanLineRepository } from './order.repositories';
import { day } from './order.util';

/** Một dòng dàn chuyền như module khác cần biết: mã hàng, chuyền, số lượng, ngày vào chuyền. */
export interface ScheduleLineFeed {
  id: number;
  planId: number;
  planNo: string;
  customerName: string;
  styleCode: string;
  productName: string;
  lineCode: string;
  qty: number;
  startDate: string;
  branchCode: string;
  /** Thời điểm tạo dòng: cùng Id mà khác thời điểm tạo là dòng khác (Id được dùng lại sau khi xóa dữ liệu đơn hàng) */
  createdAt: Date;
}

/** Nhà máy của phiên (token do server cấp); đơn vị tổng hợp A00: mọi nhà máy. Không nhận mã nhà máy thô từ nơi gọi. */
const branchOf = (scope: Scope) => (scope.isAggregate ? null : scope.branchCode);

/**
 * API công khai của module Đơn hàng cho module khác (CLAUDE.md mục 6: giao tiếp qua service công khai, không đọc bảng
 * của module khác). Module May dùng để chép dàn chuyền sang Kế hoạch chuẩn bị SX (ADR 0009).
 */
@Injectable()
export class ScheduleFeed {
  constructor(private readonly lines: LinePlanLineRepository) {}

  /** Dòng dàn chuyền của nhà máy đang làm việc (A00: mọi nhà máy). */
  async linesOf(scope: Scope): Promise<ScheduleLineFeed[]> {
    const rows = await this.lines.feed(branchOf(scope));
    return rows.map((r) => ({
      id: r.Id,
      planId: r.ShipmentPlanId,
      planNo: r.PlanNo,
      customerName: r.CustomerName,
      styleCode: r.StyleCode,
      productName: r.ProductName,
      lineCode: r.LineCode,
      qty: r.Qty,
      startDate: day(r.StartDate)!,
      branchCode: r.BranchCode,
      createdAt: r.CreatedAt,
    }));
  }

  /** Dấu phiên bản của linesOf(): đổi khi có dòng thêm, bớt hay sửa. Rẻ hơn đọc cả danh sách. */
  versionOf(scope: Scope): Promise<string> {
    return this.lines.feedVersion(branchOf(scope));
  }
}
