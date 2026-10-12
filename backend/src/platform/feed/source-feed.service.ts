import { Injectable } from '@nestjs/common';
import { BRAVO_ORDER_SOURCE_CODES, OSM_FACTORY_SOURCE_CODES, type BravoOrderSource } from '../sync/bravo-order-source';
import type { OsmPoCriteria, OsmPoField, OsmPoSort } from '../sync/osm-po-source';
import { SyncService } from '../sync/sync.service';

export type { BravoOrderSource, SourceCell, SourceOrder, SourcePo } from '../sync/bravo-order-source';
export { OSM_PO_EXPORT_MAX, OSM_PO_FIELDS, OSM_PO_FILTER, type OsmPoCriteria, type OsmPoField, type OsmPoRow, type OsmPoSort } from '../sync/osm-po-source';

/**
 * Cổng đọc dữ liệu nghiệp vụ chép từ hệ thống ngoài (BRAVO, OSM) cho module nghiệp vụ (ADR 0007: module không đọc MES_Sync,
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
   * Phân bổ PO theo nhà máy của OSM (view v_OSMData đã chép, dòng trùng nguyên dòng tính một lần): một trang. Chưa đồng bộ
   * nguồn này thì trang rỗng, `syncedAt` null. Máy chưa có MES_Sync thì báo SYNC_NOT_READY.
   */
  osmPoPage(c: OsmPoCriteria, page: number, pageSize: number, sort: OsmPoSort[]) {
    return this.sync.osmPoPage(c, page, pageSize, sort);
  }

  /** Phân bổ PO theo OSM: giá trị của một trường cho popup lọc theo cột (không lọc theo chính trường đó) */
  osmPoValues(c: OsmPoCriteria, field: OsmPoField, search: string | undefined, limit: number) {
    return this.sync.osmPoValues(c, field, search, limit);
  }

  /** Phân bổ PO theo OSM: mọi dòng khớp điều kiện, cho xuất file (quá giới hạn thì 422) */
  osmPoAll(c: OsmPoCriteria, sort: OsmPoSort[]) {
    return this.sync.osmPoAll(c, sort);
  }

  /** Phân bổ PO theo OSM: các Brand, Season đang có, cho ô chọn ở dải lọc */
  osmPoOptions() {
    return this.sync.osmPoOptions();
  }
}
