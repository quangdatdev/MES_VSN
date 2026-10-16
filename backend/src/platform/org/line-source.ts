import type { LineInfo } from './org.service';

/**
 * Nguồn danh sách chuyền may (phase 5.10): chuyền là bộ phận được tích "Xưởng sản xuất" của module Nhân sự (MES_Hr).
 * Nền tảng không import module, nên module Nhân sự cài interface này và đăng ký vào OrgService lúc khởi động;
 * module Đơn hàng, May vẫn chỉ hỏi OrgService.
 *
 * Hợp đồng:
 * - trả mọi bộ phận đang tích, kể cả đã giải thể (`isActive = false`), để dữ liệu cũ còn hiện tên; bộ phận bỏ tích không
 *   còn là chuyền (dữ liệu gắn mã đó thành chuyền mồ côi, OrgService.lineNamer);
 * - `branchCode` là ĐVCS của bộ phận (bắt buộc khi được tích), không bao giờ là đơn vị tổng hợp;
 * - `workshopCode`/`workshopName` là bộ phận cha (để ô chọn gom nhóm), `null` khi bộ phận nằm ở gốc;
 * - `ancestors`: các bộ phận cha từ gốc cây tới bộ phận cha trực tiếp (rỗng khi nằm ở gốc);
 * - thứ tự: ĐVCS, nhóm, thứ tự hiển thị, mã.
 */
export interface LineSource {
  loadLines(): Promise<LineInfo[]>;
}
