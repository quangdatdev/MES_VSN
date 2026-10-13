import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { networkInterfaces } from 'os';
import { resolve } from 'path';
import { AppModule } from './app.module';
import { configureApp } from './app.factory';
import { env } from './config/env';
import { serveWeb } from './serve-web';

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

  // --serve-web: phục vụ luôn giao diện đã build (frontend/dist) cùng địa chỉ với API (máy demo, máy chủ chạy pm2).
  const withWeb = process.argv.includes('--serve-web');
  if (withWeb) serveWeb(app, resolve(__dirname, '../../frontend/dist'));

  app.enableShutdownHooks();
  // pm2 trên Windows không gửi được SIGINT (tắt cứng tiến trình): deploy/ecosystem.config.cjs bật shutdown_with_message
  // nên `pm2 stop`, `restart` báo tắt qua tin nhắn. Đóng app để xong request đang chạy, đóng pool DB rồi mới thoát
  if (process.send) {
    let closing = false;
    process.on('message', (msg) => {
      if (msg !== 'shutdown' || closing) return;
      closing = true;
      console.log('Nhận lệnh tắt từ pm2: chờ request đang chạy xong rồi dừng.');
      void app.close().finally(() => process.exit(0));
    });
  }
  await app.listen(env.port, env.host);
  console.log(`MES backend chạy tại http://localhost:${env.port}/api/v1`);
  if (withWeb) {
    console.log(`Giao diện: http://localhost:${env.port}`);
    for (const ip of lanAddresses()) console.log(`  từ điện thoại/máy khác cùng mạng: http://${ip}:${env.port}`);
  }
}

bootstrap().catch((e) => {
  console.error('Không khởi động được backend:', e);
  process.exit(1);
});
