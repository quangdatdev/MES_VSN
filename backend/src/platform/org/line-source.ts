import type { LineInfo } from './org.service';

/**
 * Nguồn danh sách chuyền may (phase 5.10): chuyền là bộ phận được tích "Xưởng sản xuất" của module Nhân sự (MES_Hr).
 * Nền tảng không import module, nên module Nhân sự cài interface này và đăng ký vào OrgService lúc khởi động;
 * module Đơn hàng, May vẫn chỉ hỏi OrgService.
 *
 * Hợp đồng:
 * - trả mọi chuyền, kể cả đã ngừng (`isActive = false`: bỏ tích hoặc bộ phận giải thể), để dữ liệu cũ còn hiện tên;
 * - `branchCode` là ĐVCS của bộ phận (bắt buộc khi được tích), không bao giờ là đơn vị tổng hợp;
 * - `workshopCode`/`workshopName` là bộ phận cha (để ô chọn gom nhóm), `null` khi bộ phận nằm ở gốc;
 * - thứ tự: ĐVCS, nhóm, thứ tự hiển thị, mã.
 */
export interface LineSource {
  loadLines(): Promise<LineInfo[]>;
}
