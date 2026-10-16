import { Injectable } from '@nestjs/common';
import { CatalogLookupService } from '../../platform/catalog/catalog-lookup.service';
import { addCalendarDays } from '../../platform/catalog/work-calendar';
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

/** Một dòng dàn chuyền như Kế hoạch may cần (phase 5.16): thêm PO/Buy date, Giá CM, Kết thúc ra chuyền. */
export interface DayPlanLineFeed {
  id: number;
  planId: number;
  planNo: string;
  styleCode: string;
  productName: string;
  poBuyDate: string;
  cmPrice: number | null;
  lineCode: string;
  qty: number;
  startDate: string;
  /** Kết thúc ra chuyền (quyết định 14.1, Q4); dòng rất cũ chưa có thì Kết thúc vào chuyền + số ngày ra chuyền của lịch ĐVCS */
  endDate: string;
  statusCode: string;
  sortOrder: number;
  branchCode: string;
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
  constructor(
    private readonly lines: LinePlanLineRepository,
    private readonly catalogs: CatalogLookupService,
  ) {}

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

  /**
   * Dòng dàn chuyền cho Kế hoạch may (phase 5.16) của ĐVCS phiên (A00: mọi ĐVCS): dòng của các chuyền `lineCodes` đang chạy ở ngày
   * `activeOn` (Ngày vào chuyền ≤ ngày ≤ Kết thúc ra chuyền), hoặc không có `activeOn` thì mọi dòng của các chuyền đó; cộng dòng trong
   * `ids`. Như linesOf(): chỉ lọc ĐVCS, phạm vi người xem áp ở repository của module May.
   */
  async dayPlanLines(scope: Scope, filter: { lineCodes?: string[]; activeOn?: string; ids?: number[] }): Promise<DayPlanLineFeed[]> {
    const rows = await this.lines.dayPlanFeed(branchOf(scope), filter);
    const offsets = new Map<string, number>();
    for (const b of new Set(rows.filter((r) => !r.OutEndDate).map((r) => r.BranchCode))) offsets.set(b, (await this.catalogs.workCalendar(b)).outEndOffsetDays);
    const wanted = new Set(filter.ids ?? []);
    const lineSet = new Set((filter.lineCodes ?? []).map((c) => c.toUpperCase()));
    return rows
      .map((r) => ({
        id: r.Id,
        planId: r.ShipmentPlanId,
        planNo: r.PlanNo,
        styleCode: r.StyleCode,
        productName: r.ProductName,
        poBuyDate: r.PoBuyDate,
        cmPrice: r.CmPrice == null ? null : Number(r.CmPrice),
        lineCode: r.LineCode,
        qty: r.Qty,
        startDate: day(r.StartDate)!,
        endDate: day(r.OutEndDate) ?? addCalendarDays(day(r.EndDate)!, offsets.get(r.BranchCode) ?? 0),
        statusCode: r.StatusCode,
        sortOrder: r.SortOrder,
        branchCode: r.BranchCode,
        createdAt: r.CreatedAt,
      }))
      .filter((l) => wanted.has(l.id) || !filter.activeOn || !lineSet.has(l.lineCode.toUpperCase()) || (l.startDate <= filter.activeOn && l.endDate >= filter.activeOn));
  }

  /** Dấu phiên bản của linesOf(): đổi khi có dòng thêm, bớt hay sửa. Rẻ hơn đọc cả danh sách. */
  versionOf(scope: Scope): Promise<string> {
    return this.lines.feedVersion(branchOf(scope));
  }
}
