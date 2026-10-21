import { Injectable } from '@nestjs/common';
import type { Scope } from '../data/base.repository';
import type { EmployeeInfo, EmployeeSearch, EmployeeSource } from './employee-source';

/** Tài nguyên của danh bạ nhân viên (seed-data.ts): Xem là được tra mã, tên, phòng ban của nhân viên ở các ô chọn người */
export const EMPLOYEE_DIRECTORY = 'hr.directory';

/**
 * Danh bạ nhân viên cho module nghiệp vụ và phần quản trị (phase 5.18): ô Tên cụm trưởng ở Phân cụm trưởng, ô gắn nhân viên cho tài
 * khoản. Module Nhân sự đăng ký nguồn (EmployeeSource) lúc khởi động. Chưa có nguồn thì không có ai (đóng an toàn, như OrgService).
 * Không cache: kết quả theo quyền của từng người hỏi và chữ tìm.
 */
@Injectable()
export class EmployeeDirectoryService {
  private source: EmployeeSource | null = null;

  /** Module Nhân sự đăng ký nguồn lúc khởi động; đăng ký lại thì thay nguồn cũ */
  registerSource(source: EmployeeSource) {
    this.source = source;
  }

  /** Người hỏi có quyền tra danh bạ không: không có thì ô chọn người nói lý do thay vì báo "không tìm thấy" */
  canSearch(scope: Scope): boolean {
    return (scope.access.grants.get(`${EMPLOYEE_DIRECTORY}:view`)?.length ?? 0) > 0;
  }

  search(scope: Scope, opts: EmployeeSearch): Promise<EmployeeInfo[]> {
    return this.source ? this.source.search(scope, opts) : Promise.resolve([]);
  }

  byIds(scope: Scope, ids: number[]): Promise<EmployeeInfo[]> {
    const unique = [...new Set(ids)];
    return this.source && unique.length ? this.source.byIds(scope, unique) : Promise.resolve([]);
  }
}
