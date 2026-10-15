import { Injectable } from '@nestjs/common';
import type { Scope } from '../../platform/data/base.repository';
import { ShipmentPlanFeedRepository } from './order.repositories';
import { day } from './order.util';

/** SL KHXH của một màu cỡ trong kế hoạch */
export interface ShipmentPlanColorSizeFeed {
  colorName: string;
  sizeName: string;
  planQty: number;
  sortOrder: number;
}

/** Một kế hoạch xuất hàng như module Cắt cần: đầu kế hoạch và SL KHXH theo màu cỡ (> 0). */
export interface ShipmentPlanFeedItem {
  id: number;
  planNo: string;
  customerName: string;
  styleCode: string;
  productName: string;
  poBuyDate: string;
  shipDate: string;
  planQty: number;
  branchCode: string;
  /** Thời điểm tạo: cùng Id, cùng ĐVCS mà khác thời điểm tạo là kế hoạch khác (Id được dùng lại sau khi xóa dữ liệu đơn hàng) */
  createdAt: Date;
  colorSizes: ShipmentPlanColorSizeFeed[];
}

/** ĐVCS của phiên (token do server cấp); đơn vị tổng hợp A00: mọi ĐVCS. Không nhận mã ĐVCS thô từ nơi gọi. */
const branchOf = (scope: Scope) => (scope.isAggregate ? null : scope.branchCode);

/**
 * API công khai của module Đơn hàng cho module Cắt (quyết định 13.2): module Cắt chép kế hoạch xuất hàng sang MES_Cutting khi
 * mở màn Đồng bộ tiến độ cắt. Đơn hàng không biết module Cắt; mọi kế hoạch đều có, không đòi đã xếp chuyền.
 */
@Injectable()
export class ShipmentPlanFeed {
  constructor(private readonly repo: ShipmentPlanFeedRepository) {}

  /** Kế hoạch của ĐVCS đang làm việc (A00: mọi ĐVCS) kèm màu cỡ. */
  async plansOf(scope: Scope): Promise<ShipmentPlanFeedItem[]> {
    const branch = branchOf(scope);
    const [plans, cells] = await Promise.all([this.repo.plans(branch), this.repo.colorSizes(branch)]);
    const byPlan = new Map<number, ShipmentPlanColorSizeFeed[]>();
    for (const c of cells) {
      const list = byPlan.get(c.ShipmentPlanId) ?? [];
      list.push({ colorName: c.ColorName, sizeName: c.SizeName, planQty: c.PlanQty, sortOrder: c.SortOrder });
      byPlan.set(c.ShipmentPlanId, list);
    }
    return plans.map((p) => ({
      id: p.Id,
      planNo: p.PlanNo,
      customerName: p.CustomerName,
      styleCode: p.StyleCode,
      productName: p.ProductName,
      poBuyDate: p.PoBuyDate,
      shipDate: day(p.ShipDate)!,
      planQty: p.PlanQty,
      branchCode: p.BranchCode,
      createdAt: p.CreatedAt,
      colorSizes: byPlan.get(p.Id) ?? [],
    }));
  }

  /** Dấu phiên bản của plansOf(): đổi khi có kế hoạch, màu cỡ thêm, bớt hay sửa. Rẻ hơn đọc cả danh sách. */
  versionOf(scope: Scope): Promise<string> {
    return this.repo.version(branchOf(scope));
  }

  /**
   * Kế hoạch còn tồn tại không: cùng Id, cùng ĐVCS và cùng thời điểm tạo (dung sai 5 ms: driver gửi Date theo kiểu datetime cũ
   * nên giá trị đã chép lệch vài mili giây). ĐVCS lấy từ bản chép của module gọi (do hệ thống ghi), không từ client.
   */
  async exists(plan: { id: number; branchCode: string; createdAt: Date }): Promise<boolean> {
    const at = await this.repo.createdAt(plan.id, plan.branchCode);
    return !!at && Math.abs(at.getTime() - plan.createdAt.getTime()) < 5;
  }

  /** LK cắt hiện có của các kế hoạch của ĐVCS phiên (A00: mọi ĐVCS), để module Cắt chỉ ghi dòng lệch (quyết định 13.6) */
  async cutQtyOf(scope: Scope): Promise<{ id: number; branchCode: string; createdAt: Date; cutQty: number }[]> {
    return (await this.repo.cutQtyOf(branchOf(scope))).map((r) => ({ id: r.Id, branchCode: r.BranchCode, createdAt: r.CreatedAt, cutQty: r.CutQty }));
  }

  /**
   * Ghi Lũy kế cắt vào cột LK cắt của Kế hoạch xuất hàng (quyết định 13.6). Số do module Cắt tính từ dữ liệu của nó; chỉ ghi kế hoạch
   * thuộc ĐVCS của phiên (A00: mọi ĐVCS). Trả số kế hoạch đã đổi.
   */
  setCutQty(scope: Scope, rows: { id: number; branchCode: string; createdAt: Date; cutQty: number }[]): Promise<number> {
    const branch = branchOf(scope);
    return this.repo.setCutQty(branch === null ? rows : rows.filter((r) => r.branchCode === branch));
  }
}
