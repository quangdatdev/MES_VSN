import { Injectable, Logger } from '@nestjs/common';

/** Kế hoạch sắp bị xóa, như module khác nhận diện (Id được dùng lại sau khi xóa dữ liệu đơn hàng nên kèm ĐVCS, thời điểm tạo) */
export interface ShipmentPlanRef {
  id: number;
  branchCode: string;
  createdAt: Date;
}

/** Trả lý do kế hoạch chưa xóa được (câu hiện cho người dùng), hoặc null nếu không có dữ liệu phụ thuộc */
export type ShipmentPlanDeleteGuard = (plan: ShipmentPlanRef) => Promise<string | null>;

/**
 * Điểm đăng ký công khai của module Đơn hàng (quyết định 13.4): module khác giữ dữ liệu theo kế hoạch xuất hàng ở database của mình
 * (module Cắt: số cắt) đăng ký hàm kiểm lúc khởi động; xóa kế hoạch gọi các hàm này trước. Đơn hàng không import module đó, như
 * SyncService.onSucceeded của nền tảng.
 */
@Injectable()
export class ShipmentPlanDeleteGuards {
  private readonly logger = new Logger(ShipmentPlanDeleteGuards.name);
  private readonly guards: ShipmentPlanDeleteGuard[] = [];

  register(guard: ShipmentPlanDeleteGuard) {
    this.guards.push(guard);
  }

  /**
   * Các lý do chặn xóa. Hàm kiểm lỗi (database của module kia không kết nối được) thì coi như chặn: không biết chắc còn dữ liệu
   * phụ thuộc hay không thì không xóa.
   */
  async reasonsFor(plan: ShipmentPlanRef): Promise<string[]> {
    const results = await Promise.all(
      this.guards.map((g) =>
        g(plan).catch((e: unknown) => {
          this.logger.error(`Không kiểm được dữ liệu phụ thuộc của kế hoạch ${plan.id} (${plan.branchCode}): ${(e as Error)?.message ?? e}`);
          return 'Chưa kiểm được dữ liệu phụ thuộc của kế hoạch (module khác không phản hồi). Thử lại sau.';
        }),
      ),
    );
    return results.filter((r): r is string => !!r);
  }
}
