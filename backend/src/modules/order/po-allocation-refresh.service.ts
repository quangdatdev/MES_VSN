import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { AppException } from '../../common/app.exception';
import { isDeadlock } from '../../common/db-errors';
import { env } from '../../config/env';
import { AuditService } from '../../platform/audit/audit.service';
import { SourceFeedService } from '../../platform/feed/source-feed.service';
import { PoAllocationRefreshRepository, REFRESH_MIN_RATIO, type PoAllocationRefreshResult } from './po-allocation.repository';

/** Bị SQL Server hủy vì khóa chéo (câu ghi ưu tiên thấp): thử lại sau 2 rồi 10 giây, như OsmFactoryService */
const RETRY_DELAYS_MS = [2_000, 10_000];

/**
 * Làm mới bảng Phân bổ PO (MES_Order.PoAllocation) theo dữ liệu OSM đã chép (task 5.10.2): sau mỗi đợt đồng bộ có chép nguồn
 * OSM.OSMData, và một lần lúc khởi động. Đọc nguồn qua SourceFeedService (module không đọc MES_Sync). Chưa có bảng chép thì không
 * làm gì. Nhà máy SX nhập tay giữ nguyên, cột OSM cập nhật theo OSM (PoAllocationRefreshRepository).
 */
@Injectable()
export class PoAllocationRefreshService implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('PoAllocation');
  /** Lần làm mới đang chạy, và lần đã xếp chờ chạy sau nó (như OsmFactoryService) */
  private running: Promise<PoAllocationRefreshResult | null> | null = null;
  private queued: Promise<PoAllocationRefreshResult | null> | null = null;
  private stopped = false;

  constructor(
    private readonly feed: SourceFeedService,
    private readonly repo: PoAllocationRefreshRepository,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    if (env.poAllocationRefresh) this.feed.onOsmPoSynced(() => this.run());
  }

  onApplicationBootstrap() {
    if (!env.poAllocationRefresh) {
      this.logger.log('Làm mới Phân bổ PO theo OSM đang tắt (PO_ALLOCATION_REFRESH=false).');
      return;
    }
    void this.run().catch((e) => {
      if (e instanceof AppException && e.code === 'SYNC_NOT_READY') this.logger.warn(`Làm mới Phân bổ PO lúc khởi động chưa được: ${e.message}`);
      else this.logger.error(`Làm mới Phân bổ PO lúc khởi động lỗi: ${(e as Error).message}`, (e as Error).stack);
    });
  }

  onApplicationShutdown() {
    this.stopped = true;
  }

  /** Một lần làm mới; đang chạy thì xếp một lần sau nó. Chưa có bảng chép OSM thì trả null. */
  run(): Promise<PoAllocationRefreshResult | null> {
    if (this.queued) return this.queued;
    if (!this.running) return this.start();
    const queued = this.running
      .catch(() => undefined)
      .then(() => {
        this.queued = null;
        return this.start();
      });
    this.queued = queued;
    return queued;
  }

  /**
   * Làm mới ngay, không xếp hàng. `brand`: chỉ xét dòng của Brand này (bài test trên database dùng chung không đụng dòng khác,
   * xem PoAllocationRefreshRepository.refresh).
   */
  refresh(opts: { brand?: string } = {}): Promise<PoAllocationRefreshResult | null> {
    return this.withRetry(opts);
  }

  private start(): Promise<PoAllocationRefreshResult | null> {
    const running: Promise<PoAllocationRefreshResult | null> = this.withRetry({}).finally(() => {
      if (this.running === running) this.running = null;
    });
    this.running = running;
    return running;
  }

  private async withRetry(opts: { brand?: string }): Promise<PoAllocationRefreshResult | null> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.once(opts);
      } catch (e) {
        if (!isDeadlock(e) || attempt >= RETRY_DELAYS_MS.length || this.stopped) throw e;
        this.logger.warn(`Làm mới Phân bổ PO bị hủy vì khóa chéo với thao tác của người dùng, thử lại sau ${RETRY_DELAYS_MS[attempt] / 1000} giây.`);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }

  private async once(opts: { brand?: string }): Promise<PoAllocationRefreshResult | null> {
    const source = await this.feed.osmPoRows();
    if (!source) return null;
    const r = await this.repo.refresh(source, opts);
    if (r.skipped) {
      // Bảng còn trống và nguồn chưa có gì (máy chưa đồng bộ OSM lần nào): không có gì để báo
      if (r.skipped === 'EMPTY' && r.before === 0) return r;
      const why =
        r.skipped === 'EMPTY'
          ? 'bảng chép OSM không có dòng nào'
          : `bảng chép OSM chỉ có ${r.source} dòng, ít hơn ${REFRESH_MIN_RATIO * 100}% số dòng đang có (${r.before})`;
      this.logger.warn(`Không làm mới Phân bổ PO: ${why}. Giữ nguyên dữ liệu; kiểm lại lần đồng bộ nguồn OSM.OSMData rồi đồng bộ lại.`);
      await this.audit.log({ userId: null, username: 'system', entityType: 'PoAllocation', actionCode: 'PO_ALLOCATION_REFRESH', newValue: { ...r, ...opts } });
      return r;
    }
    if (r.inserted || r.removed || r.missing || r.restored) {
      await this.audit.log({ userId: null, username: 'system', entityType: 'PoAllocation', actionCode: 'PO_ALLOCATION_REFRESH', newValue: { ...r, ...opts } });
    }
    this.logger.log(
      `Phân bổ PO theo OSM: ${r.source} dòng nguồn; thêm ${r.inserted}, xóa ${r.removed}; ${r.missing} dòng nhập tay không còn trong OSM được giữ; ${r.manual} dòng nhập tay, ${r.total} dòng.`,
    );
    return r;
  }
}
