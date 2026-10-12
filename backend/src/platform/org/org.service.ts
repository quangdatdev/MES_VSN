import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/app.exception';
import type { LineSource } from './line-source';

export interface LineInfo {
  code: string;
  name: string;
  branchCode: string;
  /** false: bộ phận bỏ tích "Xưởng sản xuất" hoặc đã giải thể; chỉ gặp khi hỏi kèm includeInactive */
  isActive: boolean;
  /** Bộ phận cha của chuyền (phase 5.10; trước là xưởng của ADR 0010), null khi chuyền nằm ở gốc: để ô chọn chuyền gom nhóm */
  workshopCode: string | null;
  workshopName: string | null;
}

/**
 * Danh sách chuyền may cho module nghiệp vụ: chuyền là bộ phận tích "Xưởng sản xuất" của module Nhân sự (phase 5.10),
 * module Nhân sự đăng ký nguồn (LineSource) lúc khởi động; module Đơn hàng, May chỉ hỏi qua service này.
 * Danh sách chuyền đổi rất ít nên cache ngắn; nơi đổi chuyền gọi invalidate().
 */
@Injectable()
export class OrgService {
  private cache: { at: number; lines: LineInfo[] } | null = null;
  private source: LineSource | null = null;
  private static readonly TTL_MS = 30_000;

  /** Module Nhân sự đăng ký nguồn chuyền lúc khởi động; đăng ký lại thì thay nguồn cũ. */
  registerSource(source: LineSource) {
    this.source = source;
    this.invalidate();
  }

  /**
   * Mọi chuyền, kể cả đã ngừng: dữ liệu cũ (kế hoạch đã xếp) vẫn phải hiện đúng tên chuyền.
   * Chưa có nguồn đăng ký thì không có chuyền nào (đóng an toàn: phạm vi chiều LINE thành tập rỗng).
   */
  private async all(): Promise<LineInfo[]> {
    if (this.cache && Date.now() - this.cache.at < OrgService.TTL_MS) return this.cache.lines;
    const lines = this.source ? await this.source.loadLines() : [];
    this.cache = { at: Date.now(), lines };
    return lines;
  }

  /** Gọi sau khi tích, bỏ tích, giải thể, khôi phục, đổi ĐVCS của bộ phận chuyền để ô chọn chuyền thấy ngay. */
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

  /** Mã các chuyền đang dùng ở mọi ĐVCS: phạm vi chiều LINE chỉ giữ các mã này (mã không còn là chuyền thì không có tác dụng). */
  async activeLineCodes(): Promise<Set<string>> {
    return new Set((await this.all()).filter((l) => l.isActive).map((l) => l.code));
  }

  /** Mã chuyền phải là chuyền đang hoạt động của đúng nhà máy (khóa ngầm LineCode → MES_Hr.Department.Code). Dùng khi xếp việc mới vào chuyền. */
  async assertLine(branchCode: string, code: string): Promise<LineInfo> {
    const line = (await this.all()).find((l) => l.code === code && l.branchCode === branchCode && l.isActive);
    if (!line) throw new AppException('VALIDATION_FAILED', `Chuyền ${code} không thuộc đơn vị cơ sở ${branchCode} hoặc đã ngừng dùng.`, 422);
    return line;
  }
}
