import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, RequirePermission } from '../auth/decorators';
import { AdminAccessService } from './admin-access.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminBranchesService } from './admin-branches.service';
import { AdminGrantsService } from './admin-grants.service';
import { AdminUsersService } from './admin-users.service';
import {
  AssignmentScopeDto,
  AuditQuery,
  EffectiveQuery,
  FieldPolicyQuery,
  OverrideDto,
  RoleFieldPoliciesDto,
  UserFieldPolicyDto,
  BranchCreateDto,
  BranchUpdateDto,
  PageQuery,
  ResetPasswordDto,
  RoleCreateDto,
  RolePermissionsDto,
  RoleUpdateDto,
  UserBranchesDto,
  UserCreateDto,
  UserRolesDto,
  UserUpdateDto,
} from './admin.dto';

const id = () => Param('id', ParseIntPipe);

@Controller('admin')
export class AdminController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly access: AdminAccessService,
    private readonly branches: AdminBranchesService,
    private readonly audit: AdminAuditService,
    private readonly grants: AdminGrantsService,
  ) {}

  // ---- Người dùng ----
  @Get('users') @RequirePermission('admin.user:view')
  listUsers(@Query() q: PageQuery) { return this.users.list(q); }

  @Post('users') @RequirePermission('admin.user:create')
  createUser(@CurrentUser() a: AuthUser, @Body() dto: UserCreateDto) { return this.users.create(a, dto); }

  @Put('users/:id') @RequirePermission('admin.user:update')
  async updateUser(@CurrentUser() a: AuthUser, @id() uid: number, @Body() dto: UserUpdateDto) { await this.users.update(a, uid, dto); return { ok: true }; }

  @Post('users/:id/reset-password') @HttpCode(200) @RequirePermission('admin.user:update')
  async resetPassword(@CurrentUser() a: AuthUser, @id() uid: number, @Body() dto: ResetPasswordDto) { await this.users.resetPassword(a, uid, dto); return { ok: true }; }

  @Put('users/:id/roles') @RequirePermission('admin.permission:update')
  async setUserRoles(@CurrentUser() a: AuthUser, @id() uid: number, @Body() dto: UserRolesDto) { await this.users.setRoles(a, uid, dto); return { ok: true }; }

  @Put('users/:id/branches') @RequirePermission('admin.permission:update')
  async setUserBranches(@CurrentUser() a: AuthUser, @id() uid: number, @Body() dto: UserBranchesDto) { await this.users.setBranches(a, uid, dto); return { ok: true }; }

  // ---- Phạm vi, ngoại lệ, cột riêng của một người (L3, L5, L4 theo người) ----
  @Get('users/:id/access') @RequirePermission('admin.user:view')
  userAccess(@id() uid: number) { return this.grants.userAccess(uid); }

  @Get('users/:id/effective') @RequirePermission('admin.user:view')
  effective(@id() uid: number, @Query() q: EffectiveQuery) { return this.grants.effective(uid, q.branchCode); }

  @Put('users/:id/roles/:roleId/scope') @RequirePermission('admin.permission:update')
  async setScope(@CurrentUser() a: AuthUser, @id() uid: number, @Param('roleId', ParseIntPipe) roleId: number, @Body() dto: AssignmentScopeDto) {
    await this.grants.setAssignmentScope(a, uid, roleId, dto);
    return { ok: true };
  }

  @Post('users/:id/overrides') @HttpCode(200) @RequirePermission('admin.permission:update')
  async upsertOverride(@CurrentUser() a: AuthUser, @id() uid: number, @Body() dto: OverrideDto) { await this.grants.upsertOverride(a, uid, dto); return { ok: true }; }

  @Delete('users/:id/overrides/:overrideId') @HttpCode(204) @RequirePermission('admin.permission:update')
  async removeOverride(@CurrentUser() a: AuthUser, @id() uid: number, @Param('overrideId', ParseIntPipe) oid: number) { await this.grants.removeOverride(a, uid, oid); }

  @Post('users/:id/field-policies') @HttpCode(200) @RequirePermission('admin.fieldpolicy:update')
  async upsertUserField(@CurrentUser() a: AuthUser, @id() uid: number, @Body() dto: UserFieldPolicyDto) { await this.grants.upsertUserFieldPolicy(a, uid, dto); return { ok: true }; }

  @Delete('users/:id/field-policies/:policyId') @HttpCode(204) @RequirePermission('admin.fieldpolicy:update')
  async removeUserField(@CurrentUser() a: AuthUser, @id() uid: number, @Param('policyId', ParseIntPipe) pid: number) { await this.grants.removeUserFieldPolicy(a, uid, pid); }

  // ---- Danh mục phạm vi, cột ----
  @Get('scope-catalog') @RequirePermission('admin.user:view')
  scopeCatalog() { return this.grants.catalog(); }

  @Get('resource-fields') @RequirePermission('admin.fieldpolicy:view')
  resourceFields() { return this.grants.resourceFields(); }

  @Get('field-policies') @RequirePermission('admin.fieldpolicy:view')
  fieldPolicies(@Query() q: FieldPolicyQuery) { return this.grants.fieldPolicyMatrix(q.resourceId); }

  @Put('roles/:id/field-policies') @RequirePermission('admin.fieldpolicy:update')
  setRoleFieldPolicies(@CurrentUser() a: AuthUser, @id() rid: number, @Body() dto: RoleFieldPoliciesDto) { return this.grants.setRoleFieldPolicies(a, rid, dto); }

  // ---- Vai trò và quyền ----
  @Get('roles') @RequirePermission('admin.role:view')
  listRoles() { return this.access.listRoles(); }

  @Post('roles') @RequirePermission('admin.role:create')
  createRole(@CurrentUser() a: AuthUser, @Body() dto: RoleCreateDto) { return this.access.createRole(a, dto); }

  @Put('roles/:id') @RequirePermission('admin.role:update')
  async updateRole(@CurrentUser() a: AuthUser, @id() rid: number, @Body() dto: RoleUpdateDto) { await this.access.updateRole(a, rid, dto); return { ok: true }; }

  @Delete('roles/:id') @HttpCode(204) @RequirePermission('admin.role:delete')
  async deleteRole(@CurrentUser() a: AuthUser, @id() rid: number) { await this.access.deleteRole(a, rid); }

  @Get('roles/:id/permissions') @RequirePermission('admin.permission:view')
  async rolePermissions(@id() rid: number) { return { permissionIds: await this.access.getRolePermissions(rid) }; }

  @Put('roles/:id/permissions') @RequirePermission('admin.permission:update')
  setRolePermissions(@CurrentUser() a: AuthUser, @id() rid: number, @Body() dto: RolePermissionsDto) { return this.access.setRolePermissions(a, rid, dto); }

  @Get('permissions') @RequirePermission('admin.permission:view')
  listPermissions() { return this.access.listPermissions(); }

  @Get('menus') @RequirePermission('admin.permission:view')
  listMenus() { return this.access.listMenus(); }

  // ---- Đơn vị cơ sở (ADR 0013) ----
  @Get('branches') @RequirePermission('admin.branch:view')
  listBranches() { return this.branches.list(); }

  /** Cập nhật ĐVCS theo danh mục chi nhánh BRAVO đã đồng bộ (cũng tự chạy sau mỗi lần đồng bộ danh mục chi nhánh) */
  @Post('branches/import') @HttpCode(200) @RequirePermission('admin.branch:update')
  importBranches(@CurrentUser() a: AuthUser) { return this.branches.importFromBravo(a); }

  @Post('branches') @RequirePermission('admin.branch:create')
  createBranch(@CurrentUser() a: AuthUser, @Body() dto: BranchCreateDto) { return this.branches.create(a, dto); }

  @Put('branches/:id') @RequirePermission('admin.branch:update')
  async updateBranch(@CurrentUser() a: AuthUser, @id() bid: number, @Body() dto: BranchUpdateDto) { await this.branches.update(a, bid, dto); return { ok: true }; }

  // ---- Nhật ký ----
  @Get('audit') @RequirePermission('admin.audit:view')
  listAudit(@Query() q: AuditQuery) { return this.audit.list(q); }
}
