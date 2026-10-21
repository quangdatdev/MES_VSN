import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Scope } from '../../platform/data/base.repository';
import { EmployeeDirectoryService } from '../../platform/org/employee-directory.service';
import type { EmployeeInfo, EmployeeSearch, EmployeeSource } from '../../platform/org/employee-source';
import { EmployeeDirectoryRepository, type DirectoryRow } from './hr.repositories';

const info = (r: DirectoryRow): EmployeeInfo => ({
  id: r.Id,
  code: r.Code,
  fullName: r.FullName,
  departmentCode: r.DepartmentCode,
  departmentName: r.DepartmentName,
  isActive: r.EmploymentStatus === 1,
});

/**
 * Danh bạ nhân viên (phase 5.18): đăng ký vào EmployeeDirectoryService để module May (Tên cụm trưởng), phần quản trị (gắn nhân viên cho
 * tài khoản) tra nhân viên mà không import module Nhân sự. Đọc qua EmployeeDirectoryRepository (tài nguyên hr.directory) theo quyền của
 * người hỏi, không đọc thẳng bảng như HrLineSource (quyết định 16.3).
 */
@Injectable()
export class HrEmployeeSource implements EmployeeSource, OnModuleInit {
  constructor(
    private readonly repo: EmployeeDirectoryRepository,
    private readonly directory: EmployeeDirectoryService,
  ) {}

  onModuleInit() {
    this.directory.registerSource(this);
  }

  async search(scope: Scope, opts: EmployeeSearch): Promise<EmployeeInfo[]> {
    return (await this.repo.search(scope, opts)).map(info);
  }

  async byIds(scope: Scope, ids: number[]): Promise<EmployeeInfo[]> {
    return (await this.repo.byIds(scope, ids)).map(info);
  }
}
