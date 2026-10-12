import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import type { AuthUser } from '../../platform/auth/auth.types';
import { CurrentUser, FieldResource, RequirePermission } from '../../platform/auth/decorators';
import { DepartmentTypeService } from './department-type.service';
import { DepartmentService } from './department.service';
import { EmployeeImportService } from './employee-import.service';
import { EmployeeService } from './employee.service';
import { DepartmentCreateDto, DepartmentDissolveDto, DepartmentTreeQuery, DepartmentTypeCreateDto, DepartmentTypeUpdateDto, DepartmentUpdateDto, EmployeeImportDto, EmployeeListQuery, EmployeeWriteDto, ManagerOptionsQuery } from './hr.dto';

const id = () => Param('id', ParseIntPipe);

// Route tĩnh (tree, options, export, import...) khai báo trước route ":id" để không bị hiểu nhầm thành Id.

/** Sơ đồ tổ chức (tài nguyên hr.orgchart, dùng chung toàn công ty) */
@Controller('hr/departments')
export class DepartmentController {
  constructor(private readonly service: DepartmentService) {}

  @Get('tree') @RequirePermission('hr.orgchart:view')
  tree(@CurrentUser() u: AuthUser, @Query() q: DepartmentTreeQuery) { return this.service.tree(u, q.includeDissolved === '1'); }

  // Loại phòng ban và nhà máy cho các ô chọn của form
  @Get('options') @RequirePermission('hr.orgchart:view')
  options() { return this.service.options(); }

  // Ô Người quản lý: nhân viên đang làm, tìm trên máy chủ. Theo cả quyền xem hồ sơ nhân viên (repository lọc)
  @Get('manager-options') @RequirePermission('hr.orgchart:view')
  managerOptions(@CurrentUser() u: AuthUser, @Query() q: ManagerOptionsQuery) { return this.service.managerOptions(u, q.q, q.selected); }

  @Post() @RequirePermission('hr.orgchart:create')
  create(@CurrentUser() u: AuthUser, @Body() dto: DepartmentCreateDto) { return this.service.create(u, dto); }

  @Get(':id') @RequirePermission('hr.orgchart:view')
  get(@CurrentUser() u: AuthUser, @id() did: number) { return this.service.detail(u, did); }

  @Put(':id') @RequirePermission('hr.orgchart:update')
  update(@CurrentUser() u: AuthUser, @id() did: number, @Body() dto: DepartmentUpdateDto) { return this.service.update(u, did, dto); }

  // Giải thể là xóa mềm nên đi theo quyền sửa (không có quyền xóa)
  @Post(':id/dissolve') @RequirePermission('hr.orgchart:update')
  dissolve(@CurrentUser() u: AuthUser, @id() did: number, @Body() dto: DepartmentDissolveDto) { return this.service.dissolve(u, did, dto); }

  @Post(':id/restore') @RequirePermission('hr.orgchart:update')
  restore(@CurrentUser() u: AuthUser, @id() did: number) { return this.service.restore(u, did); }
}

/**
 * Danh mục Loại phòng ban: nằm ở Quản trị › Danh mục hệ thống nên dùng quyền danh mục (admin.catalog) như Cấu hình chuẩn bị SX
 * (người dùng chốt 12/10/2026, ngoại lệ ADR 0012 mục 6). Ô chọn loại ở Sơ đồ tổ chức vẫn lấy qua /hr/departments/options.
 */
@Controller('hr/department-types')
export class DepartmentTypeController {
  constructor(private readonly service: DepartmentTypeService) {}

  @Get() @RequirePermission('admin.catalog:view')
  list() { return this.service.list(); }

  @Post() @RequirePermission('admin.catalog:create')
  create(@CurrentUser() u: AuthUser, @Body() dto: DepartmentTypeCreateDto) { return this.service.create(u, dto); }

  @Put(':id') @RequirePermission('admin.catalog:update')
  update(@CurrentUser() u: AuthUser, @id() tid: number, @Body() dto: DepartmentTypeUpdateDto) { return this.service.update(u, tid, dto); }
}

/** Thông tin nhân sự (tài nguyên hr.employee, dùng chung toàn công ty). Chính sách cột áp cho mọi endpoint. */
@Controller('hr/employees')
@FieldResource('hr.employee')
export class EmployeeController {
  constructor(
    private readonly service: EmployeeService,
    private readonly importer: EmployeeImportService,
  ) {}

  @Get('options') @RequirePermission('hr.employee:view')
  options() { return this.service.options(); }

  @Get() @RequirePermission('hr.employee:view')
  list(@CurrentUser() u: AuthUser, @Query() q: EmployeeListQuery) { return this.service.list(u, q); }

  @Get('export') @RequirePermission('hr.employee:export')
  export(@CurrentUser() u: AuthUser, @Query() q: EmployeeListQuery) { return this.service.export(u, q); }

  // Nhập từ Excel: xem trước (kiểm, dò từng ô) rồi lưu các dòng được chọn; đều là thêm mới
  @Post('import/preview') @RequirePermission('hr.employee:create')
  importPreview(@Body() dto: EmployeeImportDto) { return this.importer.preview(dto.rows); }

  @Post('import/commit') @RequirePermission('hr.employee:create')
  importCommit(@CurrentUser() u: AuthUser, @Body() dto: EmployeeImportDto) { return this.importer.commit(u, dto.rows); }

  @Post() @RequirePermission('hr.employee:create')
  create(@CurrentUser() u: AuthUser, @Body() dto: EmployeeWriteDto) { return this.service.create(u, dto); }

  @Get(':id') @RequirePermission('hr.employee:view')
  get(@CurrentUser() u: AuthUser, @id() eid: number) { return this.service.detail(u, eid); }

  @Put(':id') @RequirePermission('hr.employee:update')
  update(@CurrentUser() u: AuthUser, @id() eid: number, @Body() dto: EmployeeWriteDto) { return this.service.update(u, eid, dto); }
}
