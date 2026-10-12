import { Injectable } from '@nestjs/common';
import { BRAVO_ORDER_SOURCE_CODES, type BravoOrderSource } from '../sync/bravo-order-source';
import { SyncService } from '../sync/sync.service';

export type { BravoOrderSource, SourceCell, SourceOrder, SourcePo } from '../sync/bravo-order-source';

/**
 * Cổng đọc dữ liệu nghiệp vụ chép từ BRAVO cho module nghiệp vụ (ADR 0007: module không đọc MES_Sync, không gọi phần bên
 * trong lớp đồng bộ). Chỉ đọc; việc ghi vào database của module do module tự làm.
 */
@Injectable()
export class BravoFeedService {
  constructor(private readonly sync: SyncService) {}

  /** Đơn hàng, PO, màu cỡ BRAVO đã chép của các ĐVCS `branches`. Máy chưa có MES_Sync thì báo SYNC_NOT_READY. */
  orderSource(branches: string[]): Promise<BravoOrderSource> {
    return this.sync.bravoOrderSource(branches);
  }

  /** Chạy `work` một lần sau mỗi đợt đồng bộ có chép lại đơn hàng, PO, màu cỡ hoặc danh mục mà câu đọc đơn hàng dùng */
  onOrderSourceSynced(work: () => Promise<unknown>) {
    this.sync.onQueueDrained(BRAVO_ORDER_SOURCE_CODES, work);
  }
}
