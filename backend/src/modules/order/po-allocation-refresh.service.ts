import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { AppException } from '../../common/app.exception';
import { isDeadlock } from '../../common/db-errors';
import { env } from '../../config/env';
import { AuditService } from '../../platform/audit/audit.service';
import { CatalogLookupService } from '../../platform/catalog/catalog-lookup.service';
import { splitFactories } from '../../platform/catalog/factory-list';
import { SourceFeedService, type OsmPoSourceRow } from '../../platform/feed/source-feed.service';
import { PoAllocationRefreshRepository, type PoAllocationRefreshResult } from './po-allocation.repository';

/** Bị SQL Server hủy vì khóa chéo (câu ghi ưu tiên thấp): thử lại sau 2 rồi 10 giây, như OsmFactoryService */
const RETRY_DELAYS_MS = [2_000, 10_000];
/** Số tên nhà máy lạ ghi vào log, nhật ký (đủ để người quản trị biết nhà máy nào cần thêm vào danh mục) */
const UNKNOWN_SAMPLE = 20;

export interface RefreshOptions {
  /** Chỉ xét dòng của Brand này (bài test trên database dùng chung, xem PoAllocationRefreshRepository.refresh) */
  brand?: string;
  /** Ghi đè PO_ALLOCATION_MAX_SHRINK_PERCENT (bài test) */
  maxShrinkPercent?: number;
}

export type PoAllocationRefreshSummary = PoAllocationRefreshResult & { unknownFactories: string[] };

/**
 * Làm mới bảng Phân bổ PO (MES_Order.PoAllocation) theo dữ liệu OSM đã chép (task 5.10.2): sau mỗi đợt đồng bộ có chép nguồn
 * OSM.OSMData, và một lần lúc khởi động. Đọc nguồn qua SourceFeedService (module không đọc MES_Sync). Chưa có bảng chép thì không
 * làm gì. Nhà máy SX nhập tay giữ nguyên, cột OSM cập nhật theo OSM (PoAllocationRefreshRepository). Nguồn rỗng thì bỏ qua; nguồn
 * giảm quá PO_ALLOCATION_MAX_SHRINK_PERCENT thì không xóa dòng vắng; cả hai ghi nhật ký và màn Phân bổ PO cảnh báo.
 */
@Injectable()
export class PoAllocationRefreshService implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('PoAllocation');
  /** Lần làm mới đang chạy, và lần đã xếp chờ chạy sau nó (như OsmFactoryService) */
  private running: Promise<PoAllocationRefreshSummary | null> | null = null;
  private queued: Promise<PoAllocationRefreshSummary | null> | null = null;
  private stopped = false;

  constructor(
    private readonly feed: SourceFeedService,
    private readonly repo: PoAllocationRefreshRepository,
    private readonly catalogs: CatalogLookupService,
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
  run(): Promise<PoAllocationRefreshSummary | null> {
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

  /** Làm mới ngay, không xếp hàng (bài test) */
  refresh(opts: RefreshOptions = {}): Promise<PoAllocationRefreshSummary | null> {
    return this.withRetry(opts);
  }

  private start(): Promise<PoAllocationRefreshSummary | null> {
    const running: Promise<PoAllocationRefreshSummary | null> = this.withRetry({}).finally(() => {
      if (this.running === running) this.running = null;
    });
    this.running = running;
    return running;
  }

  private async withRetry(opts: RefreshOptions): Promise<PoAllocationRefreshSummary | null> {
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

  /**
   * Tên nhà máy (FtyName, có thể là danh sách cách nhau dấu phẩy) của nguồn không có trong danh mục Nhà máy SX: luật ĐVCS theo nhà
   * máy coi các dòng đó là "nhà máy chưa gắn ĐVCS", ĐVCS nào cũng đổi được Nhà máy SX của chúng.
   */
  private async unknownFactories(source: OsmPoSourceRow[]): Promise<string[]> {
    const known = new Set((await this.catalogs.productionFactories()).map((f) => f.code.toUpperCase()));
    const unknown = new Map<string, string>();
    for (const r of source) for (const code of splitFactories(r.factoryName)) if (!known.has(code.toUpperCase())) unknown.set(code.toUpperCase(), code);
    return [...unknown.values()].sort((a, b) => a.localeCompare(b, 'vi'));
  }

  private async once(opts: RefreshOptions): Promise<PoAllocationRefreshSummary | null> {
    const all = await this.feed.osmPoRows();
    if (!all) return null;
    const source = opts.brand === undefined ? all : all.filter((r) => r.brand === opts.brand);
    const unknown = await this.unknownFactories(source);
    const maxShrinkPercent = opts.maxShrinkPercent ?? env.poAllocationMaxShrinkPercent;
    const r = await this.repo.refresh(source, { brand: opts.brand, maxShrinkPercent, unknownFactories: unknown.length });
    const summary: PoAllocationRefreshSummary = { ...r, unknownFactories: unknown };
    // Bảng còn trống và nguồn chưa có gì (máy chưa đồng bộ OSM lần nào): không có gì để báo
    if (r.reason === 'EMPTY' && r.before === 0) return summary;

    if (r.reason === 'EMPTY') {
      this.logger.warn('Không làm mới Phân bổ PO: bảng chép OSM không có dòng nào. Giữ nguyên dữ liệu; kiểm lại lần đồng bộ nguồn OSM.OSMData rồi đồng bộ lại.');
    } else if (r.reason === 'SHRINK') {
      this.logger.warn(
        `Phân bổ PO: bảng chép OSM chỉ có ${r.source} dòng, giảm quá ${r.maxShrinkPercent}% so với mốc ${r.before} dòng (lần làm mới đủ gần nhất); đã thêm, sửa nhưng giữ ${r.keptAbsent} dòng không còn trong OSM (lưới có thể có dòng cũ trùng dòng mới tới lần làm mới đủ). ` +
          'Kiểm lại OSM; OSM thật sự bớt nhiều PO thì đặt PO_ALLOCATION_MAX_SHRINK_PERCENT=100, khởi động lại rồi đồng bộ lại.',
      );
    }
    if (unknown.length) {
      this.logger.warn(
        `Phân bổ PO: ${unknown.length} tên nhà máy của OSM chưa có trong danh mục Nhà máy SX (${unknown.slice(0, UNKNOWN_SAMPLE).join(', ')}${unknown.length > UNKNOWN_SAMPLE ? ', …' : ''}); ` +
          'đơn vị cơ sở nào cũng đổi được Nhà máy SX của các dòng này.',
      );
    }
    if (r.reason || unknown.length || r.inserted || r.updated || r.removed || r.missing || r.restored) {
      await this.audit.log({
        userId: null,
        username: 'system',
        entityType: 'PoAllocation',
        actionCode: 'PO_ALLOCATION_REFRESH',
        newValue: { ...r, unknownFactories: unknown.length, unknownFactoryNames: unknown.slice(0, UNKNOWN_SAMPLE), ...(opts.brand ? { brand: opts.brand } : {}) },
      });
    }
    if (r.reason !== 'EMPTY') {
      this.logger.log(
        `Phân bổ PO theo OSM: ${r.source} dòng nguồn; thêm ${r.inserted}, sửa ${r.updated}, xóa ${r.removed}; ${r.missing} dòng nhập tay không còn trong OSM được giữ; ${r.manual} dòng nhập tay, ${r.total} dòng.`,
      );
    }
    return summary;
  }
}
