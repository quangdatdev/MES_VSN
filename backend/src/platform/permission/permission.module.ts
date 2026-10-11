import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BranchService } from './branch.service';
import { FieldPolicyInterceptor } from './field-policy.interceptor';
import { FieldPolicyService } from './field-policy.service';
import { PermissionService } from './permission.service';

@Global()
@Module({
  providers: [PermissionService, BranchService, FieldPolicyService, { provide: APP_INTERCEPTOR, useClass: FieldPolicyInterceptor }],
  exports: [PermissionService, BranchService, FieldPolicyService],
})
export class PermissionModule {}
