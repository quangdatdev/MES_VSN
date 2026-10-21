import type { Scope } from '../data/base.repository';

/** Một nhân viên trong danh bạ: chỉ phần cần cho ô chọn người phụ trách, không có thông tin cá nhân */
export interface EmployeeInfo {
  id: number;
  code: string;
  fullName: string;
  departmentCode: string | null;
  departmentName: string | null;
  /** false: đã nghỉ việc */
  isActive: boolean;
}

export interface EmployeeSearch {
  /** Mã hoặc tên, không phân biệt dấu, hoa thường; trống: mọi người đang làm (theo thứ tự dưới) */
  q?: string;
  /** Xếp trước nhân viên của các phòng ban thuộc ĐVCS này (người cùng nhà máy hay được chọn nhất) */
  branchCode?: string;
  limit: number;
}

/**
 * Nguồn danh bạ nhân viên (phase 5.18): nhân viên là dữ liệu của module Nhân sự (MES_Hr). Nền tảng không import module, nên module
 * Nhân sự cài interface này và đăng ký vào EmployeeDirectoryService lúc khởi động, như LineSource; module nghiệp vụ, phần quản trị chỉ
 * hỏi EmployeeDirectoryService.
 *
 * Hợp đồng:
 * - đọc theo quyền của người hỏi (tài nguyên `hr.directory` qua BaseRepository): không có quyền thì không có ai;
 * - `search` chỉ trả nhân viên đang làm việc, tối đa `limit`, xếp theo ĐVCS ưu tiên, tên, Id;
 * - `byIds` trả cả người đã nghỉ việc (để hiện người đã được chọn từ trước), bỏ qua Id không có.
 */
export interface EmployeeSource {
  search(scope: Scope, opts: EmployeeSearch): Promise<EmployeeInfo[]>;
  byIds(scope: Scope, ids: number[]): Promise<EmployeeInfo[]>;
}
