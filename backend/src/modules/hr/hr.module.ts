import { Module } from '@nestjs/common';
import { DepartmentTypeService } from './department-type.service';
import { DepartmentService } from './department.service';
import { EmployeeImportService } from './employee-import.service';
import { EmployeeService } from './employee.service';
import { DepartmentController, DepartmentTypeController, EmployeeController } from './hr.controller';
import { HrDbLifecycle, hrDbProvider } from './hr.db';
import { HrEmployeeSource } from './hr-employee-source';
import { HrLineSource } from './hr-line-source';
import { DepartmentRepository, EmployeeDirectoryRepository, EmployeeRepository, HrCatalogRepository } from './hr.repositories';

/**
 * Module Nhân sự: Sơ đồ tổ chức, Thông tin nhân sự, database MES_Hr (quyết định 10.1). Không phụ thuộc module nghiệp vụ khác.
 * Bộ phận tích "Xưởng sản xuất" là chuyền may, cấp cho nền tảng qua HrLineSource (phase 5.10); danh bạ nhân viên cấp qua HrEmployeeSource
 * (phase 5.18).
 */
@Module({
  controllers: [DepartmentController, DepartmentTypeController, EmployeeController],
  providers: [hrDbProvider, HrDbLifecycle, HrLineSource, HrEmployeeSource, DepartmentRepository, EmployeeRepository, EmployeeDirectoryRepository, HrCatalogRepository, DepartmentService, DepartmentTypeService, EmployeeService, EmployeeImportService],
})
export class HrModule {}
