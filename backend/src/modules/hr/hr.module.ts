import { Module } from '@nestjs/common';
import { DepartmentTypeService } from './department-type.service';
import { DepartmentService } from './department.service';
import { EmployeeImportService } from './employee-import.service';
import { EmployeeService } from './employee.service';
import { DepartmentController, DepartmentTypeController, EmployeeController } from './hr.controller';
import { HrDbLifecycle, hrDbProvider } from './hr.db';
import { DepartmentRepository, EmployeeRepository, HrCatalogRepository } from './hr.repositories';

/** Module Nhân sự: Sơ đồ tổ chức, Thông tin nhân sự, database MES_Hr (ADR 0012). Không phụ thuộc module nghiệp vụ khác. */
@Module({
  controllers: [DepartmentController, DepartmentTypeController, EmployeeController],
  providers: [hrDbProvider, HrDbLifecycle, DepartmentRepository, EmployeeRepository, HrCatalogRepository, DepartmentService, DepartmentTypeService, EmployeeService, EmployeeImportService],
})
export class HrModule {}
