import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { AppException, Errors } from './app.exception';
import { isDeadlock } from './db-errors';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(caught: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    // Bộ đọc body (JSON giới hạn ở app.factory.ts, urlencoded mặc định của Nest) báo vượt cỡ bằng lỗi của body-parser, không phải
    // HttpException: không đổi thì thành 500
    const tooLarge = isBodyTooLarge(caught) ? caught : null;
    const exception = tooLarge ? Errors.payloadTooLarge(numberOrUndefined(tooLarge.limit)) : caught;
    const traceId = randomUUID();
    if (tooLarge) {
      // Giới hạn đặt sát mức cần: người dùng thật chạm tới là dấu hiệu cần nâng, nên để lại dấu vết (không ghi nội dung body)
      const req = http.getRequest<Request>();
      this.logger.warn(`[${traceId}] body vượt giới hạn ${String(tooLarge.limit)} byte (${String(tooLarge.length)} byte): ${req.method} ${req.originalUrl}`);
    }

    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Có lỗi hệ thống. Vui lòng thử lại sau.';
    let details: unknown = null;

    if (exception instanceof AppException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
      if (status >= 500) this.logger.error(`[${traceId}] ${code}: ${message}`);
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (status === 404) {
        code = 'NOT_FOUND';
        message = 'Không tìm thấy đường dẫn.';
      } else if (status === 429) {
        code = 'TOO_MANY_REQUESTS';
        message = 'Quá nhiều yêu cầu, vui lòng thử lại sau.';
      } else {
        code = 'BAD_REQUEST';
        message = typeof body === 'string' ? body : ((body as any)?.message ?? message);
      }
    } else if (isDeadlock(exception)) {
      // SQL Server chọn giao dịch này để hủy khi hai người lưu cùng dữ liệu: không mất gì, chỉ cần lưu lại (review 5.1 lượt 4 L3)
      status = 409;
      code = 'CONFLICT';
      message = 'Có người khác đang lưu cùng dữ liệu nên lần lưu này chưa thực hiện. Thử lại sau vài giây.';
      this.logger.warn(`[${traceId}] deadlock: ${(exception as Error).message}`);
    } else {
      this.logger.error(`[${traceId}] ${(exception as Error)?.stack ?? exception}`);
    }

    res.status(status).json({ error: { code, message, details }, traceId });
  }
}

function isBodyTooLarge(e: unknown): e is { type: string; limit?: unknown; length?: unknown } {
  return typeof e === 'object' && e !== null && (e as { type?: unknown }).type === 'entity.too.large';
}

const numberOrUndefined = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
