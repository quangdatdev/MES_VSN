import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { AppException } from '../../common/app.exception';
import { CORE_DB, type CoreDb } from '../database/database.module';

export interface LineInfo {
  code: string;
  name: string;
  branchCode: string;
  /** false: chuyền đã ngừng dùng (màn Danh mục hệ thống); chỉ gặp khi hỏi kèm includeInactive */
  isActive: boolean;
  /** Xưởng của chuyền (ADR 0010), null khi chuyền nằm thẳng dưới nhà máy: để ô chọn chuyền gom theo xưởng */
  workshopCode: string | null;
  workshopName: string | null;
}

/**
 * Cây tổ chức (SysOrgUnit) cho module nghiệp vụ: module không đọc MES_Core trực tiếp mà hỏi qua service này.
 * Danh sách chuyền đổi rất ít (màn Danh mục hệ thống, sau này đồng bộ Nhân sự/GSD) nên cache ngắn.
 */
@Injectable()
export class OrgService {
  private cache: { at: number; lines: LineInfo[] } | null = null;
  private static readonly TTL_MS = 30_000;

  constructor(@Inject(CORE_DB) private readonly db: CoreDb) {}

  /**
   * Mọi chuyền, kể cả đã ngừng: dữ liệu cũ (kế hoạch đã xếp) vẫn phải hiện đúng tên chuyền.
   * Thứ tự theo cây: nhà máy, xưởng, chuyền; chuyền không thuộc xưởng xếp sau cùng của nhà máy.
   */
  private async all(): Promise<LineInfo[]> {
    if (this.cache && Date.now() - this.cache.at < OrgService.TTL_MS) return this.cache.lines;
    const rows = await this.db
      .selectFrom('SysOrgUnit as l')
      .leftJoin('SysOrgUnit as w', (j) => j.onRef('w.Id', '=', 'l.ParentId').on('w.OrgType', '=', 'WORKSHOP'))
      .select(['l.Code', 'l.Name', 'l.BranchCode', 'l.IsActive', 'w.Code as WorkshopCode', 'w.Name as WorkshopName'])
      .where('l.OrgType', '=', 'LINE')
      .orderBy('l.BranchCode')
      .orderBy(sql`CASE WHEN w.Id IS NULL THEN 1 ELSE 0 END`)
      .orderBy('w.SortOrder')
      .orderBy('w.Code')
      .orderBy('l.SortOrder')
      .orderBy('l.Code')
      .execute();
    this.cache = {
      at: Date.now(),
      lines: rows.map((r) => ({ code: r.Code, name: r.Name, branchCode: r.BranchCode, isActive: !!r.IsActive, workshopCode: r.WorkshopCode, workshopName: r.WorkshopName })),
    };
    return this.cache.lines;
  }

  /** Gọi sau khi thêm, sửa, ngừng chuyền (màn Danh mục hệ thống) để ô chọn chuyền thấy ngay. */
  invalidate() {
    this.cache = null;
  }

  /**
   * Chuyền của một nhà máy; đơn vị tổng hợp thì lấy mọi chuyền. Mặc định chỉ chuyền đang hoạt động (ô chọn chuyền);
   * includeInactive cho phần hiển thị dữ liệu đã có (tên chuyền, hàng của bảng dàn chuyền).
   */
  async lines(branchCode: string, isAggregate = false, { includeInactive = false }: { includeInactive?: boolean } = {}): Promise<LineInfo[]> {
    const all = (await this.all()).filter((l) => includeInactive || l.isActive);
    return isAggregate ? all : all.filter((l) => l.branchCode === branchCode);
  }

  /** Mã chuyền phải là chuyền đang hoạt động của đúng nhà máy (khóa ngầm LineCode → SysOrgUnit.Code). Dùng khi xếp việc mới vào chuyền. */
  async assertLine(branchCode: string, code: string): Promise<LineInfo> {
    const line = (await this.all()).find((l) => l.code === code && l.branchCode === branchCode && l.isActive);
    if (!line) throw new AppException('VALIDATION_FAILED', `Chuyền ${code} không thuộc nhà máy ${branchCode} hoặc đã ngừng dùng.`, 422);
    return line;
  }
}
