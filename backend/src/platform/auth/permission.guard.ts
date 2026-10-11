import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Errors } from '../../common/app.exception';
import { PermissionService } from '../permission/permission.service';
import type { AuthUser } from './auth.types';
import { AUTHENTICATED, IS_PUBLIC, REQUIRE_PERMISSION } from './decorators';

/**
 * Deny by default: endpoint phải khai báo @Public, @Authenticated hoặc @RequirePermission.
 * Endpoint không khai báo bị từ chối (ENDPOINT_NOT_DECLARED) để không bao giờ lọt quyền do quên.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    // @RequirePermission ở method luôn thắng @Public/@Authenticated đặt ở class, để không lọt quyền khi ghép decorator.
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRE_PERMISSION, targets);
    const hasRequired = !!required && required.length > 0;
    if (!hasRequired && this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const user = ctx.switchToHttp().getRequest<{ authUser?: AuthUser }>().authUser;
    if (!user) throw Errors.unauthenticated();

    if (!hasRequired && this.reflector.getAllAndOverride<boolean>(AUTHENTICATED, targets)) return true;
    if (!hasRequired) throw Errors.endpointNotDeclared();
    if (user.tokenType !== 'access') throw Errors.unauthenticated();

    const access = await this.permissions.accessOf(user);
    if (!required.every((code) => access.permissions.has(code))) throw Errors.permissionDenied();
    return true;
  }
}
