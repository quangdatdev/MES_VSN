import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { Errors } from '../../common/app.exception';
import { env } from '../../config/env';
import { AuditService } from '../audit/audit.service';
import { CORE_DB, type CoreDb } from '../database/database.module';
import { BranchService, type BranchInfo } from '../permission/branch.service';
import type { AuthUser, JwtClaims, RequestContext } from './auth.types';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
/** Đổi mật khẩu thì giá trị này đổi theo; chỉ lấy một phần SHA-256 nên không lộ hash. */
const passwordMark = (passwordHash: string) => sha256(passwordHash).slice(0, 16);

export interface SelectBranchResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  branch: BranchInfo;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(CORE_DB) private readonly db: CoreDb,
    private readonly jwt: JwtService,
    private readonly branches: BranchService,
    private readonly audit: AuditService,
  ) {}

  async login(username: string, password: string, ctx: RequestContext) {
    const user = await this.db.selectFrom('SysUser').selectAll().where('Username', '=', username).executeTakeFirst();
    const now = new Date();

    if (!user || !user.IsActive) {
      // Vẫn băm một lần để thời gian phản hồi không lộ tài khoản có tồn tại hay không.
      await this.verify(await this.dummyHash(), password);
      await this.audit.log({ username, entityType: 'Auth', actionCode: 'LOGIN_FAILED', ip: ctx.ip, newValue: { reason: 'unknown_or_inactive' } });
      throw Errors.invalidCredentials();
    }
    if (user.LockedUntilAt && user.LockedUntilAt > now) {
      await this.audit.log({ userId: user.Id, username, entityType: 'Auth', actionCode: 'LOGIN_LOCKED', ip: ctx.ip });
      throw Errors.accountLocked(user.LockedUntilAt);
    }

    if (!(await this.verify(user.PasswordHash, password))) {
      // Tăng bộ đếm ngay trong DB: nhiều request song song vẫn bị đếm đủ, và nhánh sai không bao giờ gỡ khóa.
      const counted = await this.db
        .updateTable('SysUser')
        .set((eb) => ({ FailedLoginCount: eb('FailedLoginCount', '+', 1) }))
        .output('inserted.FailedLoginCount')
        .where('Id', '=', user.Id)
        .executeTakeFirstOrThrow();
      const failed = counted.FailedLoginCount;
      const lock = failed >= env.loginMaxFailed;
      const until = new Date(now.getTime() + env.loginLockMinutes * 60_000);
      if (lock) {
        await this.db.updateTable('SysUser').set({ FailedLoginCount: 0, LockedUntilAt: until }).where('Id', '=', user.Id).execute();
      }
      await this.audit.log({ userId: user.Id, username, entityType: 'Auth', actionCode: 'LOGIN_FAILED', ip: ctx.ip, newValue: { failed, locked: lock } });
      throw lock ? Errors.accountLocked(until) : Errors.invalidCredentials();
    }

    // Chỉ xóa bộ đếm khi tài khoản không bị khóa trong lúc đang kiểm mật khẩu.
    const cleared = await this.db
      .updateTable('SysUser')
      .set({ FailedLoginCount: 0, LockedUntilAt: null, LastLoginAt: now })
      .where('Id', '=', user.Id)
      .where((eb) => eb.or([eb('LockedUntilAt', 'is', null), eb('LockedUntilAt', '<=', now)]))
      .executeTakeFirst();
    if (Number(cleared.numUpdatedRows) === 0) {
      const locked = await this.db.selectFrom('SysUser').select('LockedUntilAt').where('Id', '=', user.Id).executeTakeFirst();
      throw Errors.accountLocked(locked?.LockedUntilAt ?? now);
    }

    const preAuthToken = await this.jwt.signAsync(
      { sub: user.Id, usr: user.Username, typ: 'pre', pwh: passwordMark(user.PasswordHash) } satisfies JwtClaims,
      { secret: env.jwtSecret, expiresIn: env.preAuthTtlSeconds },
    );
    const branches = await this.branches.listForUser(user.Id);
    await this.audit.log({ userId: user.Id, username: user.Username, entityType: 'Auth', actionCode: 'LOGIN', ip: ctx.ip });

    return {
      preAuthToken,
      user: { id: user.Id, fullName: user.FullName },
      branches: branches.map((b) => ({ code: b.code, name: b.name, isAggregate: b.isAggregate })),
    };
  }

  /**
   * Chọn (hoặc đổi) nhà máy. Dùng được với token tạm hoặc access token; luôn kiểm lại SysUserBranch.
   * Đổi nhà máy bằng access token thì thu hồi phiên hiện tại rồi tạo phiên mới (phiên đã thu hồi thì AuthGuard chặn từ trước).
   */
  async selectBranch(
    user: AuthUser,
    branchCode: string,
    ctx: RequestContext,
    previousRefreshToken?: string,
  ): Promise<SelectBranchResult> {
    const account = await this.db.selectFrom('SysUser').select(['IsActive', 'PasswordHash']).where('Id', '=', user.userId).executeTakeFirst();
    if (!account?.IsActive) throw Errors.unauthenticated('Tài khoản đã bị vô hiệu hóa.');
    if (user.tokenType === 'pre' && user.passwordMark !== passwordMark(account.PasswordHash)) {
      throw Errors.unauthenticated('Mật khẩu đã được đổi. Hãy đăng nhập lại.');
    }

    const branch = await this.branches.isAllowed(user.userId, branchCode);
    if (!branch) {
      await this.audit.log({
        userId: user.userId,
        username: user.username,
        entityType: 'Auth',
        actionCode: 'SELECT_BRANCH_DENIED',
        ip: ctx.ip,
        newValue: { branchCode },
      });
      throw Errors.branchNotAllowed();
    }

    if (user.sessionId) await this.revokeSession(user.sessionId, user.userId);
    if (previousRefreshToken) await this.revoke(previousRefreshToken, user.userId);

    const refreshToken = randomBytes(48).toString('base64url');
    const session = await this.db
      .insertInto('SysUserSession')
      .values({
        UserId: user.userId,
        RefreshTokenHash: sha256(refreshToken),
        BranchCode: branch.code,
        ExpiresAt: new Date(Date.now() + env.refreshTtlDays * 86_400_000),
        IpAddress: ctx.ip,
        UserAgent: ctx.userAgent?.slice(0, 255) ?? null,
      })
      .output('inserted.Id')
      .executeTakeFirstOrThrow();

    await this.audit.log({
      userId: user.userId,
      username: user.username,
      branchCode: branch.code,
      entityType: 'Auth',
      actionCode: 'SELECT_BRANCH',
      ip: ctx.ip,
    });
    return { ...(await this.issueAccess(user.userId, user.username, branch, String(session.Id))), refreshToken, branch };
  }

  async refresh(refreshToken: string, ctx: RequestContext): Promise<SelectBranchResult> {
    const oldHash = sha256(refreshToken);
    const session = await this.db.selectFrom('SysUserSession').selectAll().where('RefreshTokenHash', '=', oldHash).executeTakeFirst();
    const now = new Date();
    if (!session || session.RevokedAt || session.ExpiresAt <= now || !session.BranchCode) throw Errors.unauthenticated();

    const user = await this.db.selectFrom('SysUser').select(['Id', 'Username', 'IsActive']).where('Id', '=', session.UserId).executeTakeFirst();
    if (!user?.IsActive) throw Errors.unauthenticated();
    const branch = await this.branches.isAllowed(user.Id, session.BranchCode);
    if (!branch) throw Errors.branchNotAllowed();

    // Xoay refresh token mỗi lần dùng. Điều kiện theo hash cũ: hai request cùng dùng một token thì chỉ một cái thắng,
    // và phiên vừa bị thu hồi (đăng xuất chen giữa) không được cấp token mới.
    const next = randomBytes(48).toString('base64url');
    const rotated = await this.db
      .updateTable('SysUserSession')
      .set({
        RefreshTokenHash: sha256(next),
        ExpiresAt: new Date(now.getTime() + env.refreshTtlDays * 86_400_000),
        IpAddress: ctx.ip,
      })
      .where('Id', '=', session.Id)
      .where('RefreshTokenHash', '=', oldHash)
      .where('RevokedAt', 'is', null)
      .executeTakeFirst();
    if (Number(rotated.numUpdatedRows) !== 1) throw Errors.unauthenticated();
    return { ...(await this.issueAccess(user.Id, user.Username, branch, String(session.Id))), refreshToken: next, branch };
  }

  /** Đăng xuất theo cookie refresh, không cần access token còn hạn (máy dùng chung: người sau không vào được phiên cũ). */
  async logout(refreshToken: string | undefined, ctx: RequestContext) {
    if (!refreshToken) return;
    const session = await this.db
      .updateTable('SysUserSession')
      .set({ RevokedAt: new Date() })
      .output(['inserted.UserId', 'inserted.BranchCode'])
      .where('RefreshTokenHash', '=', sha256(refreshToken))
      .where('RevokedAt', 'is', null)
      .executeTakeFirst();
    if (!session) return;
    const user = await this.db.selectFrom('SysUser').select('Username').where('Id', '=', session.UserId).executeTakeFirst();
    await this.audit.log({
      userId: session.UserId,
      username: user?.Username ?? null,
      branchCode: session.BranchCode,
      entityType: 'Auth',
      actionCode: 'LOGOUT',
      ip: ctx.ip,
    });
  }

  private async revoke(refreshToken: string, userId: number) {
    await this.db
      .updateTable('SysUserSession')
      .set({ RevokedAt: new Date() })
      .where('RefreshTokenHash', '=', sha256(refreshToken))
      .where('UserId', '=', userId)
      .where('RevokedAt', 'is', null)
      .execute();
  }

  private async revokeSession(sessionId: string, userId: number) {
    await this.db
      .updateTable('SysUserSession')
      .set({ RevokedAt: new Date() })
      .where('Id', '=', sessionId)
      .where('UserId', '=', userId)
      .where('RevokedAt', 'is', null)
      .execute();
  }

  private async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  private dummy?: Promise<string>;
  private dummyHash(): Promise<string> {
    return (this.dummy ??= argon2.hash(randomBytes(16).toString('hex'), { type: argon2.argon2id }));
  }

  private async issueAccess(userId: number, username: string, branch: BranchInfo, sessionId: string) {
    const accessToken = await this.jwt.signAsync({ sub: userId, usr: username, typ: 'access', br: branch.code, sid: sessionId } satisfies JwtClaims, {
      secret: env.jwtSecret,
      expiresIn: env.accessTtlSeconds,
    });
    return { accessToken, expiresIn: env.accessTtlSeconds };
  }
}
