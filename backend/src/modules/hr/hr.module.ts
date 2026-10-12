import { Module } from '@nestjs/common';
import { DepartmentTypeService } from './department-type.service';
import { DepartmentService } from './department.service';
import { EmployeeImportService } from './employee-import.service';
import { EmployeeService } from './employee.service';
import { DepartmentController, DepartmentTypeController, EmployeeController } from './hr.controller';
import { HrDbLifecycle, hrDbProvider } from './hr.db';
import { HrLineSource } from './hr-line-source';
import { DepartmentRepository, EmployeeRepository, HrCatalogRepository } from './hr.repositories';

/**
 * Module Nhân sự: Sơ đồ tổ chức, Thông tin nhân sự, database MES_Hr (ADR 0012). Không phụ thuộc module nghiệp vụ khác.
 * Bộ phận tích "Xưởng sản xuất" là chuyền may, cấp cho nền tảng qua HrLineSource (phase 5.10).
 */
@Module({
  controllers: [DepartmentController, DepartmentTypeController, EmployeeController],
  providers: [hrDbProvider, HrDbLifecycle, HrLineSource, DepartmentRepository, EmployeeRepository, HrCatalogRepository, DepartmentService, DepartmentTypeService, EmployeeService, EmployeeImportService],
})
export class HrModule {}
