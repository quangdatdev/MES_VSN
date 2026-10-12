import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { AppException } from '../../common/app.exception';
import { isDeadlock } from '../../common/db-errors';
import { env } from '../../config/env';
import { AuditService } from '../../platform/audit/audit.service';
import { SourceFeedService } from '../../platform/feed/source-feed.service';
import { CatalogLookupService } from '../../platform/catalog/catalog-lookup.service';
import { BranchService } from '../../platform/permission/branch.service';
import { planImport } from './bravo-order.mapping';
import { BravoOrderImportRepository } from './bravo-order-import.repository';

/** Kết quả một lần nạp, ghi vào SysAuditLog (BRAVO_IMPORT) khi có ghi dữ liệu */
export interface BravoImportSummary {
  newOrders: number;
  newByBranch: Record<string, number>;
  updatedOrders: number;
  /** Đơn nạp trước migration 0006 mà người dùng đã sửa: chỉ ghi dấu nội dung làm mốc */
  baselined: number;
  newPos: number;
  updatedPos: number;
  cellUpdates: number;
  /** PO giữ màu cỡ của MES dù BRAVO đổi (đã xác nhận, đã vào kế hoạch, đã sửa tay); tối đa 50 Id đầu */
  cellsKept: { count: number; poIds: number[] };
  branchChanged: { count: number; productIds: number[] };
  goneOrders: number;
  gonePos: number;
  skippedNoPo: Record<string, number>;
  /** Đơn mới có danh sách nhà máy theo OSM dài quá cột: thêm với Nhà máy SX trống; ProductId, tối đa 50 */
  factoryTooLong: number[];
}

const MAX_IDS = 50;
/** Bị SQL Server hủy vì khóa chéo với thao tác của người dùng (bước nạp chịu thua, DEADLOCK_PRIORITY LOW): thử lại sau */
const RETRY_DELAYS_MS = [2_000, 10_000];

/**
 * Nạp tăng dần đơn hàng BRAVO vào MES_Order (ADR 0013 mục 8): sau mỗi đợt đồng bộ có chép nguồn đơn hàng, và một lần lúc
 * khởi động (lần đầu sau khi triển khai, đợt đồng bộ chạy lúc backend dừng). Thêm đơn, PO mới, cập nhật phần lấy từ BRAVO, giữ
 * phần MES tự quản (Nhà máy SX, đơn giá, kế hoạch, màu cỡ đã xác nhận). Không xóa gì. Quy tắc chi tiết ở planImport
 * (bravo-order.mapping.ts); khác `load:bravo` (xóa hết rồi nạp lại, chỉ máy demo). Tắt bằng BRAVO_ORDER_IMPORT=false.
 */
@Injectable()
export class BravoOrderImportService implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('BravoOrderImport');
  /** Lần nạp đang chạy, và lần nạp đã xếp chờ chạy sau nó (nhiều yêu cầu trong lúc chờ gộp làm một) */
  private running: Promise<BravoImportSummary | null> | null = null;
  private queued: Promise<BravoImportSummary | null> | null = null;
  private stopped = false;

  constructor(
    private readonly feed: SourceFeedService,
    private readonly repo: BravoOrderImportRepository,
    private readonly catalogs: CatalogLookupService,
    private readonly branches: BranchService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    if (env.bravoOrderImport) this.feed.onOrderSourceSynced(() => this.run());
  }

  onApplicationBootstrap() {
    if (!env.bravoOrderImport) {
      this.logger.log('Nạp đơn hàng BRAVO tự động đang tắt (BRAVO_ORDER_IMPORT=false, hoặc máy dùng dữ liệu mẫu).');
      return;
    }
    this.logger.log('Nạp đơn hàng BRAVO tự động đang bật: chạy lúc khởi động và sau mỗi đợt đồng bộ.');
    void this.run().catch((e) => {
      // Máy chưa có MES_Sync là trạng thái bình thường; lỗi khác thì cần xem stack
      if (e instanceof AppException && e.code === 'SYNC_NOT_READY') this.logger.warn(`Nạp đơn hàng BRAVO lúc khởi động chưa được: ${e.message}`);
      else this.logger.error(`Nạp đơn hàng BRAVO lúc khởi động lỗi: ${(e as Error).message}`, (e as Error).stack);
    });
  }

  onApplicationShutdown() {
    this.stopped = true;
  }

  /**
   * Một lần nạp. Đang có lần nạp chạy thì xếp một lần chạy sau nó (dữ liệu chép có thể vừa đổi) và trả kết quả của lần xếp
   * đó: lỗi của lần đó về đúng bên gọi (việc sau đồng bộ giữ cờ chờ để thử lại). Bảng chép chưa có đơn hàng nào (chưa đồng
   * bộ) thì không làm gì, trả null.
   */
  run(): Promise<BravoImportSummary | null> {
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

  private start(): Promise<BravoImportSummary | null> {
    const running: Promise<BravoImportSummary | null> = this.withRetry().finally(() => {
      if (this.running === running) this.running = null;
    });
    this.running = running;
    return running;
  }

  private async withRetry(): Promise<BravoImportSummary | null> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.once();
      } catch (e) {
        if (!isDeadlock(e) || attempt >= RETRY_DELAYS_MS.length || this.stopped) throw e;
        this.logger.warn(`Nạp đơn hàng BRAVO bị hủy vì khóa chéo với thao tác của người dùng, thử lại sau ${RETRY_DELAYS_MS[attempt] / 1000} giây.`);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }

  private async once(): Promise<BravoImportSummary | null> {
    const branches = await this.branches.activeCodes();
    const [src, units, osmFactories] = await Promise.all([this.feed.orderSource(branches), this.catalogs.items('UNIT'), this.feed.osmFactories()]);
    if (!src.orders.length) return null;
    const unitNames = new Map(units.map((u) => [u.code, u.name]));
    const started = Date.now();
    const { plan, applied } = await this.repo.apply((state) => planImport(src, state, { branches, unitNames, osmFactories }));
    const summary: BravoImportSummary = {
      newOrders: applied.newOrders,
      newByBranch: applied.newByBranch,
      updatedOrders: applied.updatedOrders,
      baselined: applied.baselined,
      newPos: applied.newPos,
      updatedPos: applied.updatedPos,
      cellUpdates: applied.cellUpdates,
      cellsKept: { count: applied.cellsKept.length, poIds: applied.cellsKept.slice(0, MAX_IDS) },
      branchChanged: { count: plan.branchChanged.length, productIds: plan.branchChanged.slice(0, MAX_IDS) },
      goneOrders: plan.goneOrders,
      gonePos: plan.gonePos,
      skippedNoPo: Object.fromEntries(plan.skipped),
      factoryTooLong: plan.factoryTooLong.slice(0, MAX_IDS),
    };
    // Nhật ký chỉ khi có ghi dữ liệu: PO giữ màu cỡ, đơn đổi chi nhánh tồn tại lâu dài, ghi mỗi đợt thì nhiễu (đã có trong log)
    if (summary.newOrders + summary.updatedOrders + summary.baselined + summary.newPos + summary.updatedPos + summary.cellUpdates > 0) {
      await this.audit.log({ userId: null, username: 'system', entityType: 'SalesOrder', actionCode: 'BRAVO_IMPORT', newValue: summary });
    }
    this.logger.log(
      `Nạp đơn hàng BRAVO (${Date.now() - started} ms): ${summary.newOrders} đơn mới, ${summary.updatedOrders} đơn cập nhật, ${summary.newPos} PO mới, ` +
        `${summary.updatedPos} PO cập nhật, ${summary.cellUpdates} PO thay màu cỡ, ${summary.cellsKept.count} PO giữ màu cỡ của MES, ` +
        `${summary.branchChanged.count} đơn BRAVO đổi chi nhánh, ${summary.goneOrders} đơn và ${summary.gonePos} PO không còn ở BRAVO` +
        (plan.factoryTooLong.length ? `, ${plan.factoryTooLong.length} đơn mới có danh sách nhà máy OSM dài quá 400 ký tự (để trống).` : '.'),
    );
    return summary;
  }
}
