import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { isIP } from 'net';
import { Errors } from '../../common/app.exception';
import { env } from '../../config/env';
import { CORE_DB, type CoreDb } from '../database/database.module';
import { BranchService } from '../permission/branch.service';
import { accessStamp, PermissionService } from '../permission/permission.service';
import type { AuthUser, JwtClaims } from './auth.types';
import { ALLOW_PRE_AUTH, IS_PUBLIC, REQUIRE_PERMISSION } from './decorators';

/** Xác thực token. Gắn req.authUser; BranchCode lấy từ token do server cấp. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly permissions: PermissionService,
    private readonly branches: BranchService,
    @Inject(CORE_DB) private readonly db: CoreDb,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRE_PERMISSION, targets);
    if (!required?.length && this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request & { authUser?: AuthUser }>();
    const res = ctx.switchToHttp().getResponse<Response>();

    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw Errors.unauthenticated();

    let claims: JwtClaims;
    try {
      claims = await this.jwt.verifyAsync<JwtClaims>(token, { secret: env.jwtSecret });
    } catch (e) {
      throw (e as Error)?.name === 'TokenExpiredError' ? Errors.tokenExpired() : Errors.unauthenticated();
    }

    if (claims.typ === 'pre') {
      if (!this.reflector.getAllAndOverride<boolean>(ALLOW_PRE_AUTH, targets)) throw Errors.unauthenticated();
      req.authUser = { userId: Number(claims.sub), username: claims.usr, tokenType: 'pre', isAggregate: false, passwordMark: claims.pwh };
      return true;
    }

    if (claims.typ !== 'access' || !claims.br || !claims.sid) throw Errors.unauthenticated();

    // Phiên đã bị thu hồi (đăng xuất, đặt lại mật khẩu, vô hiệu hóa) thì access token còn hạn cũng không dùng được.
    const session = await this.db
      .selectFrom('SysUserSession')
      .select('Id')
      .where('Id', '=', claims.sid)
      .where('UserId', '=', Number(claims.sub))
      .where('RevokedAt', 'is', null)
      .executeTakeFirst();
    if (!session) throw Errors.unauthenticated('Phiên đăng nhập đã kết thúc. Hãy đăng nhập lại.');

    const version = await this.permissions.getVersion();
    // Nhà máy phải còn tồn tại và còn được cấp cho user; cờ tổng hợp tra từ DB.
    const branch = await this.branches.isAllowed(Number(claims.sub), claims.br);
    const access = await this.permissions.getAccess(Number(claims.sub), branch ?? { code: claims.br, isAggregate: false }, version);
    if (!access.active) throw Errors.unauthenticated('Tài khoản đã bị vô hiệu hóa.');
    if (!branch) throw Errors.branchNotAllowed();

    req.authUser = {
      userId: Number(claims.sub),
      username: claims.usr,
      tokenType: 'access',
      branchCode: branch.code,
      isAggregate: branch.isAggregate,
      sessionId: claims.sid,
      access,
      // req.ip chỉ đáng tin khi TRUST_PROXY khai báo đúng proxy; vẫn kiểm định dạng để chuỗi lạ không vào nhật ký.
      ip: req.ip && isIP(req.ip) ? req.ip : null,
    };
    res.setHeader('X-Permission-Version', accessStamp(access));
    return true;
  }
}
