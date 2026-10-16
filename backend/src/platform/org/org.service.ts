import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/app.exception';
import type { LineSource } from './line-source';

export interface LineInfo {
  code: string;
  name: string;
  branchCode: string;
  /** false: bộ phận tích "Xưởng sản xuất" đã giải thể; chỉ gặp khi hỏi kèm includeInactive (bỏ tích thì không còn trong danh sách) */
  isActive: boolean;
  /** Bộ phận cha của chuyền (phase 5.10; trước là xưởng của ADR 0010), null khi chuyền nằm ở gốc: để ô chọn chuyền gom nhóm */
  workshopCode: string | null;
  workshopName: string | null;
  /**
   * Các bộ phận cha từ gốc cây phòng ban tới bộ phận cha trực tiếp (phase 5.16: ô Đơn vị phòng ban của Kế hoạch may chọn một nhánh của
   * cây sơ đồ tổ chức). Không có: nguồn chỉ biết bộ phận cha trực tiếp.
   */
  ancestors?: { code: string; name: string }[];
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
  /** Tăng mỗi lần invalidate(): lần đọc bắt đầu trước đó (có thể đọc dữ liệu trước khi đổi) không được ghi vào cache */
  private generation = 0;
  /** Lần đọc đang chạy của lượt invalidate hiện tại: nhiều request cùng lúc chờ chung một lần đọc */
  private loading: { generation: number; lines: Promise<LineInfo[]> } | null = null;
  private static readonly TTL_MS = 30_000;

  /** Module Nhân sự đăng ký nguồn chuyền lúc khởi động; đăng ký lại thì thay nguồn cũ. */
  registerSource(source: LineSource) {
    this.source = source;
    this.invalidate();
  }

  /**
   * Mọi chuyền, kể cả đã ngừng: dữ liệu cũ (kế hoạch đã xếp) vẫn phải hiện đúng tên chuyền.
   * Chưa có nguồn đăng ký thì không có chuyền nào (đóng an toàn: phạm vi chiều LINE thành tập rỗng). Nguồn lỗi thì lỗi đi tiếp
   * tới bên gọi (request bị từ chối, không bao giờ thành "không giới hạn chuyền") và không được cache.
   */
  private all(): Promise<LineInfo[]> {
    if (this.cache && Date.now() - this.cache.at < OrgService.TTL_MS) return Promise.resolve(this.cache.lines);
    const generation = this.generation;
    if (this.loading?.generation === generation) return this.loading.lines;
    const lines = (this.source ? this.source.loadLines() : Promise.resolve([])).then(
      (loaded) => {
        // Bỏ tích một chuyền xong mà lần đọc cũ ghi đè cache thì chuyền đó còn trong phạm vi quyền thêm 30 giây
        if (generation === this.generation) this.cache = { at: Date.now(), lines: loaded };
        return loaded;
      },
    );
    const loading = { generation, lines };
    this.loading = loading;
    const done = () => {
      if (this.loading === loading) this.loading = null;
    };
    lines.then(done, done);
    return lines;
  }

  /**
   * Gọi sau khi ghi bộ phận (tích, bỏ tích, đổi ĐVCS, giải thể, khôi phục, đổi tên, đổi cha) để ô chọn chuyền thấy ngay.
   * Cache theo từng tiến trình: tiến trình khác thấy sau tối đa TTL_MS.
   */
  invalidate() {
    this.cache = null;
    this.generation++;
  }

  /**
   * Chuyền của một nhà máy; đơn vị tổng hợp thì lấy mọi chuyền. Mặc định chỉ chuyền đang hoạt động (ô chọn chuyền);
   * includeInactive cho phần hiển thị dữ liệu đã có (tên chuyền, hàng của bảng dàn chuyền).
   */
  async lines(branchCode: string, isAggregate = false, { includeInactive = false }: { includeInactive?: boolean } = {}): Promise<LineInfo[]> {
    const all = (await this.all()).filter((l) => includeInactive || l.isActive);
    return isAggregate ? all : all.filter((l) => l.branchCode === branchCode);
  }

  /**
   * Tên chuyền theo mã cho dữ liệu đã xếp, kể cả chuyền đã ngừng dùng. Tra trên mọi ĐVCS: chuyền đã chuyển sang ĐVCS khác vẫn hiện
   * đúng tên ở dữ liệu của ĐVCS cũ (tên chuyền không phải dữ liệu nhạy cảm; dòng nào được thấy vẫn do repository lọc). Mã không còn
   * là bộ phận chuyền nào (chuyền cũ trước phase 5.10, bộ phận đã bỏ tích "Xưởng sản xuất") là chuyền mồ côi: hiện mã kèm
   * "(chuyền cũ)", không báo lỗi.
   */
  async lineNamer(): Promise<(code: string) => string> {
    const names = new Map((await this.all()).map((l) => [l.code, l.name]));
    return (code) => names.get(code) ?? `${code} (chuyền cũ)`;
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
