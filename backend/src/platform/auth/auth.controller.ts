import { Body, Controller, HttpCode, HttpException, Post, Req, Res } from '@nestjs/common';
import { isIP } from 'net';
import type { Request, Response } from 'express';
import { Errors } from '../../common/app.exception';
import { env } from '../../config/env';
import { LoginDto, SelectBranchDto } from './auth.dto';
import { AuthService, type SelectBranchResult } from './auth.service';
import type { AuthUser, RequestContext } from './auth.types';
import { AllowPreAuth, Authenticated, CurrentUser, Public } from './decorators';

const COOKIE = 'mes_rt';
const COOKIE_PATH = '/api/v1/auth';

// req.ip chỉ đáng tin khi TRUST_PROXY khai báo đúng proxy; vẫn kiểm định dạng để chuỗi lạ không vào nhật ký.
const ctxOf = (req: Request): RequestContext => ({
  ip: req.ip && isIP(req.ip) ? req.ip : null,
  userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.username.trim(), dto.password, ctxOf(req));
  }

  @Authenticated()
  @AllowPreAuth()
  @Post('select-branch')
  @HttpCode(200)
  async selectBranch(
    @CurrentUser() user: AuthUser,
    @Body() dto: SelectBranchDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.selectBranch(user, dto.branchCode.trim(), ctxOf(req), req.cookies?.[COOKIE]);
    return this.respond(res, result);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[COOKIE];
    if (!token) throw Errors.unauthenticated();
    try {
      return this.respond(res, await this.auth.refresh(token, ctxOf(req)));
    } catch (e) {
      // Lỗi máy chủ (5xx) thì giữ cookie để thử lại được; chỉ xóa khi phiên thật sự không dùng được.
      if (e instanceof HttpException && e.getStatus() < 500) res.clearCookie(COOKIE, { path: COOKIE_PATH });
      throw e;
    }
  }

  /** Public: access token hết hạn vẫn phải đăng xuất được; phiên xác định bằng cookie refresh (SameSite=Strict). */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE, { path: COOKIE_PATH });
    await this.auth.logout(req.cookies?.[COOKIE], ctxOf(req));
  }

  private respond(res: Response, r: SelectBranchResult) {
    res.cookie(COOKIE, r.refreshToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: env.cookieSecure,
      path: COOKIE_PATH,
      maxAge: env.refreshTtlDays * 86_400_000,
    });
    return {
      accessToken: r.accessToken,
      expiresIn: r.expiresIn,
      branch: { code: r.branch.code, name: r.branch.name, isAggregate: r.branch.isAggregate },
    };
  }
}
