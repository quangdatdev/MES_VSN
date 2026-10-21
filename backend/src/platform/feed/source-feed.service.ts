import { Injectable } from '@nestjs/common';
import { BRAVO_ORDER_SOURCE_CODES, OSM_FACTORY_SOURCE_CODES, type BravoOrderSource } from '../sync/bravo-order-source';
import { OSM_PO_SOURCE, type OsmPoSourceRow } from '../sync/osm-po-source';
import { SyncService } from '../sync/sync.service';

export type { BravoOrderSource, SourceCell, SourceOrder, SourcePo } from '../sync/bravo-order-source';
export type { OsmPoSourceRow } from '../sync/osm-po-source';

/**
 * Cổng đọc dữ liệu nghiệp vụ chép từ hệ thống ngoài (BRAVO, OSM) cho module nghiệp vụ (quyết định 1.2: module không đọc MES_Sync,
 * không gọi phần bên trong lớp đồng bộ). Chỉ đọc; việc ghi vào database của module do module tự làm.
 */
@Injectable()
export class SourceFeedService {
  constructor(private readonly sync: SyncService) {}

  /** Đơn hàng, PO, màu cỡ BRAVO đã chép của các ĐVCS `branches`. Máy chưa có MES_Sync thì báo SYNC_NOT_READY. */
  orderSource(branches: string[]): Promise<BravoOrderSource> {
    return this.sync.bravoOrderSource(branches);
  }

  /** Chạy `work` một lần sau mỗi đợt đồng bộ có chép lại đơn hàng, PO, màu cỡ hoặc danh mục mà câu đọc đơn hàng dùng */
  onOrderSourceSynced(work: () => Promise<unknown>) {
    this.sync.onQueueDrained(BRAVO_ORDER_SOURCE_CODES, work);
  }

  /** Nhà máy SX theo OSM của từng sản phẩm BRAVO (ProductId → danh sách nhà máy); null khi chưa có, chưa đồng bộ nguồn OSM */
  osmFactories(): Promise<Map<number, string> | null> {
    return this.sync.osmFactories();
  }

  /** Chạy `work` một lần sau mỗi đợt đồng bộ có chép lại nguồn OSM hoặc sản phẩm BRAVO */
  onOsmFactorySynced(work: () => Promise<unknown>) {
    this.sync.onQueueDrained(OSM_FACTORY_SOURCE_CODES, work);
  }

  /**
   * Phân bổ PO theo nhà máy của OSM (view v_OSMData đã chép): mọi dòng khác nhau, cho bước làm mới bảng Phân bổ PO (task 5.10.2).
   * null khi chưa có bảng chép; máy chưa có MES_Sync thì báo SYNC_NOT_READY.
   */
  osmPoRows(): Promise<OsmPoSourceRow[] | null> {
    return this.sync.osmPoSource();
  }

  /** Nguồn Phân bổ PO theo OSM đang bật chưa (máy chủ chưa khai database ứng dụng OSM thì tắt). Chưa có MES_Sync: SYNC_NOT_READY */
  osmPoSourceActive(): Promise<boolean> {
    return this.sync.osmPoSourceActive();
  }

  /** Chạy `work` một lần sau mỗi đợt đồng bộ có chép lại nguồn Phân bổ PO theo OSM */
  onOsmPoSynced(work: () => Promise<unknown>) {
    this.sync.onQueueDrained([OSM_PO_SOURCE], work);
  }
}
