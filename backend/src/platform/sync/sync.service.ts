import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Errors } from '../../common/app.exception';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { UserDirectoryService } from '../org/user-directory.service';
import { SyncStartDto } from './sync.dto';
import { SYNC_RUN_TIMEOUT_MS } from './sync.db';
import { SyncRepository, isConnectionLost, isNotMigrated } from './sync.repository';

/** Mốc và mốc lọc là giờ của nguồn (BRAVO), lưu không kèm múi giờ: trả về dạng "YYYY-MM-DDTHH:mm:ss", không có Z. */
const sourceTime = (d: Date | null) => (d ? d.toISOString().slice(0, 19) : null);
const durationMs = (from: Date | null, to: Date | null) => (from && to ? to.getTime() - from.getTime() : null);
const CATALOG_GROUP = 'CATALOG';
const TEXT_TYPES = new Set(['varchar', 'nvarchar', 'char', 'nchar']);
/** Ô của bảng chép: ngày giờ của nguồn hiện nguyên giờ nguồn (không đổi múi giờ), bỏ "00:00" khi chỉ là ngày */
function cellValue(v: unknown): string | number | boolean | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const s = v.toISOString().slice(0, 19).replace('T', ' ');
    return s.endsWith(' 00:00:00') ? s.slice(0, 10) : s.slice(0, 16);
  }
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Buffer.isBuffer(v)) return '(nhị phân)';
  return String(v);
}

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger('Sync');
  private draining: Promise<void> | null = null;
  private again = false;
  /** Đã xác nhận MES_Sync tồn tại và vào được; chưa thì mỗi yêu cầu hỏi lại (rẻ, qua MES_Core) */
  private dbReady = false;
  private startup: Promise<void> = Promise.resolve();
  /** Việc chạy sau khi một nguồn chép thành công, theo mã nguồn (onSucceeded) */
  private readonly followUps = new Map<string, (() => Promise<unknown>)[]>();
  /** Việc chạy một lần khi hàng đợi chạy hết, nếu đã có nguồn liên quan chép thành công (onQueueDrained) */
  private readonly drainHooks: { codes: Set<string>; work: () => Promise<unknown>; pending: boolean }[] = [];

  constructor(
    private readonly repo: SyncRepository,
    private readonly audit: AuditService,
    private readonly users: UserDirectoryService,
  ) {}

  /** Khởi động: dọn lần chạy mồ côi rồi chạy tiếp hàng đợi còn lại. Chưa có MES_Sync thì chỉ ghi cảnh báo. */
  onModuleInit() {
    this.startup = (async () => {
      if (!(await this.repo.databaseReady())) {
        this.logger.warn('Chưa có database MES_Sync hoặc tài khoản chưa được cấp quyền: màn Đồng bộ chưa dùng được.');
        return;
      }
      this.dbReady = true;
      await this.repo.recoverStale();
      this.kick();
    })().catch((e) =>
      this.logger.warn(isNotMigrated(e) ? 'MES_Sync chưa chạy migration: màn Đồng bộ chưa dùng được.' : `Không dọn được hàng đợi đồng bộ: ${(e as Error).message}`),
    );
  }

  private async ready<T>(work: () => Promise<T>): Promise<T> {
    if (!this.dbReady) {
      if (!(await this.repo.databaseReady())) throw Errors.syncNotReady();
      this.dbReady = true;
    }
    try {
      return await work();
    } catch (e) {
      if (isNotMigrated(e)) throw Errors.syncNotReady();
      // Database bị gỡ hoặc thu hồi quyền sau khi đã chạy được: hỏi lại thay vì báo lỗi hệ thống chung chung
      if (isConnectionLost(e)) {
        this.dbReady = false;
        if (!(await this.repo.databaseReady().catch(() => false))) throw Errors.syncNotReady();
      }
      throw e;
    }
  }

  sources() {
    return this.ready(async () => {
      const [rows, ok] = await Promise.all([this.repo.listSources(), this.repo.lastSuccess()]);
      // Còn lần chờ mà tiến trình này không chạy hàng đợi (lỗi giữa chừng lần trước): chạy lại thay vì để "Đang chờ" mãi
      if (rows.some((r) => r.StatusCode === 'QUEUED')) this.kick();
      // Lần "đang chạy" đã quá giờ: phiên SQL lúc hủy có thể chưa đóng kịp để dọn ngay, dọn lại ở đây
      const overdue = Date.now() - SYNC_RUN_TIMEOUT_MS - 60_000;
      if (rows.some((r) => r.StatusCode === 'RUNNING' && r.StartedAt && r.StartedAt.getTime() < overdue)) {
        void this.repo.recoverStale().catch((e) => this.logger.error(`Không dọn được lần chạy quá giờ: ${(e as Error).message}`));
      }
      const success = new Map(ok.map((r) => [r.SyncSourceId, r]));
      return rows.map((r) => ({
        id: r.Id,
        code: r.Code,
        name: r.Name,
        description: r.Description,
        system: r.SystemCode,
        group: r.GroupCode,
        sourceObject: r.SourceObject,
        targetTable: r.TargetTable,
        mode: r.SyncModeCode,
        keyColumns: r.KeyColumns,
        overlapMinutes: r.OverlapMinutes,
        watermarkAt: sourceTime(r.WatermarkAt),
        lastSuccessAt: success.get(r.Id)?.FinishedAt ?? null,
        lastFullAt: success.get(r.Id)?.LastFullAt ?? null,
        targetCount: success.get(r.Id)?.TargetCount ?? null,
        lastRun: r.RunId
          ? {
              id: Number(r.RunId),
              status: r.StatusCode,
              mode: r.ModeCode,
              sinceAt: sourceTime(r.SinceAt),
              readCount: r.ReadCount,
              insertedCount: r.InsertedCount,
              updatedCount: r.UpdatedCount,
              deletedCount: r.DeletedCount,
              queuedAt: r.QueuedAt,
              startedAt: r.StartedAt,
              finishedAt: r.FinishedAt,
              durationMs: durationMs(r.StartedAt, r.FinishedAt),
              errorMessage: r.ErrorMessage,
            }
          : null,
      }));
    });
  }

  runs(sourceId: number, page: number, pageSize: number) {
    return this.ready(async () => {
      const { total, rows } = await this.repo.listRuns(sourceId, page, pageSize);
      const names = new Map<number, string>();
      for (const id of new Set(rows.map((r) => r.CreatedBy).filter((x): x is number => x != null))) names.set(id, await this.users.fullName(id));
      return {
        total,
        page,
        pageSize,
        items: rows.map((r) => ({
          id: Number(r.Id),
          batchId: r.BatchId,
          status: r.StatusCode,
          mode: r.ModeCode,
          sinceAt: sourceTime(r.SinceAt),
          prevWatermarkAt: sourceTime(r.PrevWatermarkAt),
          newWatermarkAt: sourceTime(r.NewWatermarkAt),
          readCount: r.ReadCount,
          insertedCount: r.InsertedCount,
          updatedCount: r.UpdatedCount,
          deletedCount: r.DeletedCount,
          targetCount: r.TargetCount,
          queuedAt: r.QueuedAt,
          startedAt: r.StartedAt,
          finishedAt: r.FinishedAt,
          durationMs: durationMs(r.StartedAt, r.FinishedAt),
          errorMessage: r.ErrorMessage,
          createdBy: r.CreatedBy == null ? null : (names.get(r.CreatedBy) ?? null),
        })),
      };
    });
  }

  /** Danh mục chép từ hệ thống ngoài (nguồn nhóm CATALOG) cho màn Danh mục hệ thống: chỉ xem, sửa ở hệ thống nguồn. */
  catalogs() {
    return this.ready(async () => {
      const [rows, ok] = await Promise.all([this.repo.listSources(), this.repo.lastSuccess()]);
      const success = new Map(ok.map((r) => [r.SyncSourceId, r]));
      return rows
        .filter((r) => r.GroupCode === CATALOG_GROUP)
        .map((r) => ({
          code: r.Code,
          name: r.Name,
          description: r.Description,
          system: r.SystemCode,
          sourceObject: r.SourceObject,
          rowCount: success.get(r.Id)?.TargetCount ?? null,
          lastSuccessAt: success.get(r.Id)?.FinishedAt ?? null,
          lastStatus: r.StatusCode,
        }));
    });
  }

  /** Tên chi nhánh (TenChiNhanh) theo mã đơn vị cơ sở, chép từ danh mục chi nhánh BRAVO */
  branchNames() {
    return this.ready(() => this.repo.branchNames());
  }

  /** Danh mục chi nhánh BRAVO (mã, tên ngắn, tên đầy đủ) để chép thành Đơn vị cơ sở (ADR 0013) */
  bravoBranches() {
    return this.ready(() => this.repo.bravoBranches());
  }

  /**
   * Đăng ký việc chạy mỗi khi nguồn `sourceCode` chép thành công trong tiến trình này (ví dụ cập nhật Đơn vị cơ sở theo
   * danh mục chi nhánh BRAVO). Việc lỗi chỉ ghi log, không làm hỏng lần đồng bộ đã xong.
   */
  onSucceeded(sourceCode: string, work: () => Promise<unknown>) {
    this.followUps.set(sourceCode, [...(this.followUps.get(sourceCode) ?? []), work]);
  }

  /**
   * Đăng ký việc chạy một lần khi hàng đợi đồng bộ của tiến trình này chạy hết, nếu từ lần trước có nguồn trong `sourceCodes`
   * chép thành công: một lần bấm Đồng bộ nhiều nguồn chỉ chạy một lần, sau khi mọi nguồn đã chép (ví dụ nạp đơn hàng cần
   * đủ đơn, PO, màu cỡ). Việc lỗi chỉ ghi log. Việc đang chạy thì lần đồng bộ bấm sau chờ tới khi xong.
   */
  onQueueDrained(sourceCodes: string[], work: () => Promise<unknown>) {
    this.drainHooks.push({ codes: new Set(sourceCodes), work, pending: false });
  }

  /** Đơn hàng, PO, màu cỡ BRAVO đã chép (chỉ đọc) của các ĐVCS `branches`, cho bước nạp vào MES_Order */
  bravoOrderSource(branches: string[]) {
    return this.ready(() => this.repo.bravoOrderSource(branches));
  }

  /** Nhà máy SX theo OSM của từng sản phẩm BRAVO; null khi chưa có, chưa đồng bộ nguồn OSM */
  osmFactories() {
    return this.ready(() => this.repo.osmFactories());
  }

  /** Các danh sách nhà máy khác nhau trong bảng chép OSM; null khi chưa có, chưa đồng bộ nguồn OSM */
  osmFactoryLists() {
    return this.ready(() => this.repo.osmFactoryLists());
  }

  private async followUp(runId: string) {
    if (this.followUps.size === 0 && this.drainHooks.length === 0) return;
    const run = await this.repo.runOutcome(runId);
    if (!run || run.StatusCode !== 'SUCCEEDED') return;
    for (const hook of this.drainHooks) if (hook.codes.has(run.Code)) hook.pending = true;
    for (const work of this.followUps.get(run.Code) ?? []) {
      await work().catch((e) => this.logger.error(`Việc sau khi chép ${run.Code} lỗi: ${(e as Error).message}`, (e as Error).stack));
    }
  }

  /** Việc lỗi thì giữ cờ chờ: lần hàng đợi chạy hết sau đó (đợt đồng bộ kế tiếp) thử lại */
  private async afterDrain() {
    for (const hook of this.drainHooks) {
      if (!hook.pending) continue;
      hook.pending = false;
      await hook.work().catch((e) => {
        hook.pending = true;
        this.logger.error(`Việc sau đồng bộ lỗi, thử lại ở đợt đồng bộ sau: ${(e as Error).message}`, (e as Error).stack);
      });
    }
  }

  /**
   * Phân bổ PO theo OSM: mọi dòng khác nhau của bảng chép, cho bước làm mới bảng Phân bổ PO của module Đơn hàng (task 5.10.2);
   * null khi chưa có bảng chép
   */
  osmPoSource() {
    return this.ready(() => this.repo.osmPoSource());
  }

  /** Nguồn đồng bộ Phân bổ PO theo OSM đang bật chưa (máy chưa khai database OSM thì migrate tắt nguồn) */
  osmPoSourceActive() {
    return this.ready(() => this.repo.osmPoSourceActive());
  }

  /** Một trang dữ liệu của bảng chép danh mục. Bảng lấy theo mã nguồn trong SyncSource, không nhận tên bảng từ client. */
  catalogRows(code: string, page: number, pageSize: number, q?: string) {
    return this.ready(async () => {
      const source = (await this.repo.listSources()).find((s) => s.Code === code && s.GroupCode === CATALOG_GROUP);
      if (!source || !/^bravo\.[A-Za-z0-9_]+$/.test(source.TargetTable)) throw Errors.notFound('Không có danh mục này.');
      const columns = await this.repo.tableColumns(source.TargetTable);
      const names = columns.map((c) => c.name);
      if (!names.length) throw Errors.notFound('Bảng chép của danh mục này chưa có hoặc không có cột dữ liệu. Chạy npm run migrate.');
      const keys = source.KeyColumns.split(',').map((k) => k.trim()).filter((k) => names.includes(k));
      const text = columns.filter((c) => TEXT_TYPES.has(c.type)).map((c) => c.name);
      const term = q?.trim() || undefined;
      const { total, rows } = await this.repo.tableRows(source.TargetTable, names, text, keys.length ? keys : names.slice(0, 1), term, page, pageSize);
      return {
        total,
        page,
        pageSize,
        columns: columns.map((c) => ({ name: c.name, type: c.type, key: keys.includes(c.name) })),
        rows: rows.map((r) => names.map((n) => cellValue(r[n]))),
      };
    });
  }

  /** Xếp hàng rồi trả ngay; việc chép chạy nền, màn hình theo dõi qua danh sách nguồn. */
  start(actor: AuthUser, dto: SyncStartDto) {
    return this.ready(async () => {
      try {
        await this.repo.recoverStale();
        const sources = await this.repo.listSources();
        const wanted = dto.sourceIds?.length ? [...new Set(dto.sourceIds)] : null;
        const picked = wanted ? sources.filter((s) => wanted.includes(s.Id)) : sources;
        if (wanted && picked.length !== wanted.length) throw Errors.notFound('Có nguồn không tồn tại hoặc đã tắt. Tải lại trang rồi chọn lại.');
        if (picked.length === 0) throw Errors.notFound('Chưa có nguồn đồng bộ nào đang bật.');

        const batchId = randomUUID();
        const mode = dto.full ? 'FULL' : 'INCREMENTAL';
        const { queued, skipped } = await this.repo.enqueue(picked.map((s) => s.Id), mode, batchId, actor.userId);
        const source = (id: number) => picked.find((s) => s.Id === id)!;
        await this.audit.log({
          userId: actor.userId,
          username: actor.username,
          branchCode: actor.branchCode,
          entityType: 'SyncRun',
          entityId: batchId,
          actionCode: 'SYNC_START',
          newValue: { mode, queued: queued.map((id) => source(id).Code), skipped: skipped.map((id) => source(id).Code) },
        });
        return { batchId, queued: queued.length, skipped: skipped.map((id) => source(id).Name) };
      } finally {
        // Luôn quét hàng đợi, kể cả khi lần bấm này lỗi giữa chừng hoặc mọi nguồn đều bị bỏ qua: không để lần chờ nằm im
        this.kick();
      }
    });
  }

  /** Một vòng chạy hàng đợi trong tiến trình này; gọi thêm khi đang chạy thì vòng sau quét lại hàng đợi. */
  private kick() {
    if (this.draining) {
      this.again = true;
      return;
    }
    this.again = false;
    this.draining = this.drain()
      .catch((e) => this.logger.error(`Hàng đợi đồng bộ dừng: ${(e as Error).message}`))
      .finally(() => {
        this.draining = null;
        if (this.again) this.kick();
      });
  }

  private async drain() {
    const tried = new Set<string>();
    for (;;) {
      const next = (await this.repo.queuedRunIds()).find((id) => !tried.has(id));
      if (!next) {
        await this.afterDrain();
        return;
      }
      tried.add(next);
      try {
        await this.repo.execute(next);
        await this.followUp(next).catch((e) => this.logger.error(`Không đọc được kết quả lần #${next}: ${(e as Error).message}`));
      } catch (e) {
        // Thủ tục tự ghi lỗi của việc chép; tới đây là lỗi kết nối hoặc quá giờ (kết nối riêng đã đóng, khóa đã nhả)
        const message = (e as Error).message;
        this.logger.error(`Lần đồng bộ #${next} lỗi: ${message}`);
        await this.repo.failIfQueued(next, `Không gọi được thủ tục đồng bộ: ${message}`).catch((err) => this.logger.error(`Không ghi được lỗi cho lần #${next}: ${(err as Error).message}`));
        await this.repo.recoverStale().catch((err) => this.logger.error(`Không dọn được lần chạy dở: ${(err as Error).message}`));
      }
    }
  }

  /** Cho test: chờ khởi động và hàng đợi trong tiến trình này chạy xong */
  async idle() {
    await this.startup;
    while (this.draining) await this.draining;
  }
}
