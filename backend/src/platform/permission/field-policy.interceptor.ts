import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, mergeMap, of, type Observable } from 'rxjs';
import type { AuthUser } from '../auth/auth.types';
import { FIELD_RESOURCE } from '../auth/decorators';
import { FieldPolicyService } from './field-policy.service';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/** Cưỡng chế chính sách cột cho endpoint có @FieldResource: kiểm dữ liệu gửi lên trước, lọc dữ liệu trả về sau. */
@Injectable()
export class FieldPolicyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly fields: FieldPolicyService,
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const resource = this.reflector.getAllAndOverride<string>(FIELD_RESOURCE, [ctx.getHandler(), ctx.getClass()]);
    if (!resource || ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<{ method: string; body?: unknown; authUser?: AuthUser }>();
    const user = req.authUser;
    if (!user || user.tokenType !== 'access') return next.handle();
    if (WRITE_METHODS.has(req.method) && req.body) await this.fields.assertWritable(user, resource, req.body);
    return next
      .handle()
      .pipe(mergeMap((data) => (data && typeof data === 'object' && !(data instanceof StreamableFile) ? from(this.fields.shape(user, resource, data)) : of(data))));
  }
}
