import { Inject, Injectable, Logger } from '@nestjs/common';
import { CORE_DB, type CoreDb } from '../database/database.module';
import { SyncService } from '../sync/sync.service';
import { DEFAULT_WORK_CALENDAR, readWorkCalendars, type WorkCalendar } from './work-calendar';

export interface CatalogOption {
  code: string;
  name: string;
}

export interface CatalogEntry extends CatalogOption {
  isActive: boolean;
}

/** Nhà máy SX (quyết định 6.2) cho module nghiệp vụ: mã, tên, ĐVCS quản lý */
export interface FactoryEntry extends CatalogEntry {
  branchCode: string | null;
}

/**
 * Đọc danh mục cho module nghiệp vụ (chỉ đọc, cache ngắn). Tách khỏi CatalogService để module khác không gọi được
 * các hàm ghi của màn Quản trị › Danh mục hệ thống.
 */
@Injectable()
export class CatalogLookupService {
  private readonly logger = new Logger(CatalogLookupService.name);
  private cache = new Map<string, { at: number; items: CatalogEntry[] }>();
  private branches: { at: number; names: Map<string, string> } | null = null;
  private factories: { at: number; items: FactoryEntry[] } | null = null;
  private calendars: { at: number; byBranch: Map<string, WorkCalendar> } | null = null;
  /** Lần đọc lịch đang chạy: bảng dàn chuyền ở đơn vị tổng hợp hỏi lịch nhiều ĐVCS cùng lúc thì đọc chung một lần */
  private loadingCalendars: Promise<Map<string, WorkCalendar>> | null = null;
  /** Tăng mỗi lần sửa lịch làm việc: lần đọc bắt đầu trước khi sửa không ghi lịch cũ vào cache */
  private calendarGen = 0;
  /** Lần đọc tên chi nhánh đang chạy: các request đến cùng lúc khi cache hết hạn dùng chung, không mỗi request đọc một lần */
  private loadingBranches: Promise<Map<string, string>> | null = null;
  /** Lần đọc danh mục BRAVO trước có lỗi không: chỉ ghi cảnh báo khi đổi trạng thái, không mỗi 30 giây một lần */
  private bravoFailed = false;
  /** Tăng mỗi lần sửa nhà máy: lần đọc bắt đầu trước khi sửa không ghi tên cũ vào cache */
  private branchGen = 0;
  private static readonly TTL_MS = 30_000;

  constructor(
    @Inject(CORE_DB) private readonly db: CoreDb,
    private readonly sync: SyncService,
  ) {}

  /**
   * Tên chi nhánh theo mã đơn vị cơ sở, hiện thay mã (A01) ở cột Chi nhánh, ĐVCS của các màn: TenChiNhanh trong danh mục
   * chi nhánh BRAVO. Chưa chép được (máy chưa có MES_Sync) thì lấy tên ở Quản trị › Đơn vị cơ sở; tên đó cũng trống thì không
   * có trong danh sách (màn hình hiện mã). Chỉ các ĐVCS của MES (SysBranch, trừ đơn vị tổng hợp).
   */
  async branchNames(): Promise<Map<string, string>> {
    if (this.branches && Date.now() - this.branches.at < CatalogLookupService.TTL_MS) return this.branches.names;
    if (!this.loadingBranches) {
      const loading: Promise<Map<string, string>> = this.loadBranchNames(this.branchGen).finally(() => {
        if (this.loadingBranches === loading) this.loadingBranches = null;
      });
      this.loadingBranches = loading;
    }
    return this.loadingBranches;
  }

  /** Gọi sau khi sửa hoặc chép ĐVCS ở Quản trị › Đơn vị cơ sở */
  invalidateBranchNames() {
    this.branches = null;
    this.loadingBranches = null;
    this.branchGen++;
  }

  private async loadBranchNames(gen: number): Promise<Map<string, string>> {
    const own = await this.db.selectFrom('SysBranch').select(['Code', 'Name']).where('IsAggregate', '=', false).execute();
    const names = new Map<string, string>();
    for (const b of own) if (b.Name?.trim()) names.set(b.Code, b.Name.trim());
    const codes = new Set(own.map((b) => b.Code));
    try {
      for (const b of await this.sync.branchNames()) {
        const code = b.BranchCode?.trim();
        const name = b.TenChiNhanh?.trim();
        if (code && name && codes.has(code)) names.set(code, name);
      }
      if (this.bravoFailed) this.logger.log('Đã đọc lại được danh mục chi nhánh BRAVO.');
      this.bravoFailed = false;
    } catch (e) {
      if (!this.bravoFailed) this.logger.warn(`Chưa đọc được danh mục chi nhánh BRAVO, dùng tên ở Quản trị › Đơn vị cơ sở: ${(e as Error).message}`);
      this.bravoFailed = true;
    }
    if (gen === this.branchGen) this.branches = { at: Date.now(), names };
    return names;
  }

  /** Thêm branchName vào từng dòng (file xuất); màn hình tra tên qua /me/branch-names */
  async withBranchNames<T extends { branchCode: string }>(rows: T[]): Promise<(T & { branchName: string })[]> {
    const names = await this.branchNames();
    return rows.map((r) => ({ ...r, branchName: names.get(r.branchCode) ?? r.branchCode }));
  }

  /**
   * Mọi mục của một danh mục mã-tên (UNIT, ORDER_TYPE…) theo thứ tự hiển thị, kể cả mục đã ngừng: dữ liệu cũ
   * vẫn phải hiện đúng tên. Danh mục chưa có hoặc đã ngừng thì rỗng.
   */
  async items(catalogCode: string): Promise<CatalogEntry[]> {
    const hit = this.cache.get(catalogCode);
    if (hit && Date.now() - hit.at < CatalogLookupService.TTL_MS) return hit.items;
    const rows = await this.db
      .selectFrom('SysCatalogItem as i')
      .innerJoin('SysCatalog as c', 'c.Id', 'i.CatalogId')
      .select(['i.Code', 'i.Name', 'i.IsActive'])
      .where('c.Code', '=', catalogCode)
      .where('c.IsActive', '=', true)
      .orderBy('i.SortOrder')
      .orderBy('i.Code')
      .execute();
    const items = rows.map((r) => ({ code: r.Code, name: r.Name, isActive: !!r.IsActive }));
    this.cache.set(catalogCode, { at: Date.now(), items });
    return items;
  }

  /** Mục đang dùng (ô chọn, gợi ý khi nhập mới) */
  async activeItems(catalogCode: string): Promise<CatalogOption[]> {
    return (await this.items(catalogCode)).filter((i) => i.isActive).map(({ code, name }) => ({ code, name }));
  }

  /** Gọi sau khi sửa danh mục để gợi ý ở màn nghiệp vụ thấy ngay */
  invalidate(catalogCode: string) {
    this.cache.delete(catalogCode);
  }

  /** Mọi nhà máy SX theo thứ tự hiển thị, kể cả nhà máy đã ngừng (đơn hàng cũ vẫn hiện đúng tên) */
  async productionFactories(): Promise<FactoryEntry[]> {
    if (this.factories && Date.now() - this.factories.at < CatalogLookupService.TTL_MS) return this.factories.items;
    const rows = await this.db.selectFrom('SysProductionFactory').select(['Code', 'Name', 'BranchCode', 'IsActive']).orderBy('SortOrder').orderBy('Code').execute();
    const items = rows.map((r) => ({ code: r.Code, name: r.Name, branchCode: r.BranchCode, isActive: !!r.IsActive }));
    this.factories = { at: Date.now(), items };
    return items;
  }

  /** Gọi sau khi sửa danh mục Nhà máy SX */
  invalidateFactories() {
    this.factories = null;
  }

  /** Lịch làm việc của ĐVCS (phase 5.12); chưa cấu hình thì lịch mặc định (nghỉ Chủ nhật, lệch 3/3/2/5) */
  async workCalendar(branchCode: string): Promise<WorkCalendar> {
    if (this.calendars && Date.now() - this.calendars.at < CatalogLookupService.TTL_MS) return this.calendars.byBranch.get(branchCode) ?? DEFAULT_WORK_CALENDAR;
    if (!this.loadingCalendars) {
      const gen = this.calendarGen;
      const loading: Promise<Map<string, WorkCalendar>> = readWorkCalendars(this.db)
        .then((byBranch) => {
          if (gen === this.calendarGen) this.calendars = { at: Date.now(), byBranch };
          return byBranch;
        })
        .finally(() => {
          if (this.loadingCalendars === loading) this.loadingCalendars = null;
        });
      this.loadingCalendars = loading;
    }
    return (await this.loadingCalendars).get(branchCode) ?? DEFAULT_WORK_CALENDAR;
  }

  /** Gọi sau khi sửa lịch làm việc ở Danh mục hệ thống */
  invalidateWorkCalendars() {
    this.calendars = null;
    this.loadingCalendars = null;
    this.calendarGen++;
  }
}
