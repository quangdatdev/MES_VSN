import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { AppException } from '../../common/app.exception';
import { isDeadlock } from '../../common/db-errors';
import { env } from '../../config/env';
import { AuditService } from '../../platform/audit/audit.service';
import { SourceFeedService } from '../../platform/feed/source-feed.service';
import { BravoOrderImportRepository } from './bravo-order-import.repository';

export interface OsmFactorySummary {
  /** Đơn nhận Nhà máy SX theo OSM (mới có, đổi, hoặc trước đó người dùng chọn) */
  updated: number;
  /** Đơn trước đó theo OSM mà nay OSM không còn: mở khóa sửa tay, giữ giá trị */
  unlocked: number;
  /** Đơn có danh sách nhà máy theo OSM dài quá cột (400 ký tự): không cập nhật; ProductId, tối đa 50 */
  tooLong: number[];
}

/** Bị SQL Server hủy vì khóa chéo (câu ghi ưu tiên thấp): thử lại sau 2 rồi 10 giây, như BravoOrderImportService */
const RETRY_DELAYS_MS = [2_000, 10_000];

/**
 * Nhà máy SX của đơn hàng theo OSM (quyết định 7.6): sau mỗi đợt đồng bộ có chép nguồn OSM hoặc sản phẩm BRAVO, và một lần lúc
 * khởi động. Chạy cả khi nạp đơn hàng tự động đang tắt (BRAVO_ORDER_IMPORT): chỉ cập nhật cột Nhà máy SX của đơn đã có. Chưa
 * đồng bộ OSM thì không làm gì. Đơn mới nạp từ BRAVO nhận Nhà máy SX theo OSM ngay ở bước nạp.
 */
@Injectable()
export class OsmFactoryService implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('OsmFactory');
  /** Lần cập nhật đang chạy, và lần đã xếp chờ chạy sau nó (như BravoOrderImportService) */
  private running: Promise<OsmFactorySummary | null> | null = null;
  private queued: Promise<OsmFactorySummary | null> | null = null;
  private stopped = false;

  constructor(
    private readonly feed: SourceFeedService,
    private readonly repo: BravoOrderImportRepository,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    if (env.osmFactoryUpdate) this.feed.onOsmFactorySynced(() => this.run());
  }

  onApplicationBootstrap() {
    if (!env.osmFactoryUpdate) {
      this.logger.log('Cập nhật Nhà máy SX theo OSM đang tắt (OSM_FACTORY_UPDATE=false).');
      return;
    }
    void this.run().catch((e) => {
      if (e instanceof AppException && e.code === 'SYNC_NOT_READY') this.logger.warn(`Cập nhật Nhà máy SX theo OSM lúc khởi động chưa được: ${e.message}`);
      else this.logger.error(`Cập nhật Nhà máy SX theo OSM lúc khởi động lỗi: ${(e as Error).message}`, (e as Error).stack);
    });
  }

  onApplicationShutdown() {
    this.stopped = true;
  }

  /** Một lần cập nhật; đang chạy thì xếp một lần sau nó. Chưa đồng bộ nguồn OSM thì trả null. */
  run(): Promise<OsmFactorySummary | null> {
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

  private start(): Promise<OsmFactorySummary | null> {
    const running: Promise<OsmFactorySummary | null> = this.withRetry().finally(() => {
      if (this.running === running) this.running = null;
    });
    this.running = running;
    return running;
  }

  private async withRetry(): Promise<OsmFactorySummary | null> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.once();
      } catch (e) {
        if (!isDeadlock(e) || attempt >= RETRY_DELAYS_MS.length || this.stopped) throw e;
        this.logger.warn(`Cập nhật Nhà máy SX theo OSM bị hủy vì khóa chéo với thao tác của người dùng, thử lại sau ${RETRY_DELAYS_MS[attempt] / 1000} giây.`);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }

  private async once(): Promise<OsmFactorySummary | null> {
    const factories = await this.feed.osmFactories();
    if (!factories) return null;
    // Ghép không ra đơn nào (sản phẩm BRAVO chưa chép, hoặc dữ liệu ghép lệch): không coi mọi đơn là "OSM không có" mà mở khóa hàng loạt
    if (factories.size === 0) {
      this.logger.warn('Bảng chép OSM có dữ liệu nhưng không ghép được sản phẩm BRAVO nào (số SO, mã hàng): chưa cập nhật Nhà máy SX.');
      return null;
    }
    const r = await this.repo.applyOsmFactories(factories);
    const summary: OsmFactorySummary = { updated: r.updated, unlocked: r.unlocked, tooLong: r.tooLong.slice(0, 50) };
    if (r.updated || r.unlocked) await this.audit.log({ userId: null, username: 'system', entityType: 'SalesOrder', actionCode: 'OSM_FACTORY_IMPORT', newValue: summary });
    if (r.tooLong.length) this.logger.warn(`${r.tooLong.length} đơn có danh sách nhà máy theo OSM dài quá 400 ký tự, chưa cập nhật (ProductId ${summary.tooLong.join(', ')}).`);
    this.logger.log(`Nhà máy SX theo OSM: ${factories.size} sản phẩm có trong OSM; ${r.updated} đơn cập nhật, ${r.unlocked} đơn không còn trong OSM (mở khóa sửa tay).`);
    return summary;
  }
}
