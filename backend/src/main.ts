import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'fs';
import { networkInterfaces } from 'os';
import { join, resolve } from 'path';
import { AppModule } from './app.module';
import { configureApp } from './app.factory';
import { env } from './config/env';

/** Địa chỉ IPv4 trong mạng nội bộ, để mở từ điện thoại. */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n!.address);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  if (env.trustProxy) app.set('trust proxy', env.trustProxy);
  configureApp(app);

  // --serve-web: phục vụ luôn giao diện đã build (frontend/dist) cùng địa chỉ với API, dùng cho máy demo.
  const serveWeb = process.argv.includes('--serve-web');
  if (serveWeb) {
    const web = resolve(__dirname, '../../frontend/dist');
    if (!existsSync(join(web, 'index.html'))) throw new Error(`Chưa có giao diện đã build ở ${web}. Chạy: npm run build`);
    app.useStaticAssets(web, { index: false, maxAge: '1h' });
    // Đường dẫn của ứng dụng một trang (React Router) đều trả index.html, trừ API.
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      res.sendFile(join(web, 'index.html'));
    });
  }

  app.enableShutdownHooks();
  await app.listen(env.port, env.host);
  console.log(`MES backend chạy tại http://localhost:${env.port}/api/v1`);
  if (serveWeb) {
    console.log(`Giao diện: http://localhost:${env.port}`);
    for (const ip of lanAddresses()) console.log(`  từ điện thoại/máy khác cùng mạng: http://${ip}:${env.port}`);
  }
}

bootstrap().catch((e) => {
  console.error('Không khởi động được backend:', e);
  process.exit(1);
});
