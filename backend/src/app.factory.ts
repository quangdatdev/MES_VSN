import { INestApplication, ValidationError, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppException } from './common/app.exception';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { env } from './config/env';

/** Cấu hình dùng chung cho main.ts và test e2e. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api/v1');
  // Lưu cả bảng (ngày TH của Kế hoạch chuẩn bị SX, tới 5.000 ô: khoảng 370 KB) vượt mức 100 KB mặc định của Express.
  // Áp cho mọi route JSON (Nest chỉ cho đặt một bộ đọc JSON chung) nên giữ sát mức cần, kể cả /auth/login
  (app as NestExpressApplication).useBodyParser('json', { limit: '512kb' });
  app.use(
    helmet({
      // Demo trong mạng nội bộ chạy HTTP: không ép trình duyệt chuyển sang HTTPS.
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: env.cookieSecure ? [] : null } },
      hsts: env.cookieSecure,
    }),
  );
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) =>
        new AppException(
          'VALIDATION_FAILED',
          'Dữ liệu không hợp lệ.',
          422,
          errors.map((e) => ({ field: e.property, messages: Object.values(e.constraints ?? {}) })),
        ),
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
