import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { AppException } from './app.exception';
import { isDeadlock } from './db-errors';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const traceId = randomUUID();

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
