import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * --serve-web: phục vụ giao diện đã build (`webDir` = frontend/dist) cùng địa chỉ với API.
 * Đường dẫn của ứng dụng một trang (React Router) đều trả index.html, trừ API và file trong /assets/.
 */
export function serveWeb(app: NestExpressApplication, webDir: string) {
  if (!existsSync(join(webDir, 'index.html'))) throw new Error(`Chưa có giao diện đã build ở ${webDir}. Chạy: npm run build`);
  app.useStaticAssets(webDir, { index: false, maxAge: '1h' });
  app.use((req: Request, res: Response, next: NextFunction) => {
    // File code của bản build khác (tab mở từ trước khi triển khai) không còn: trả 404 để trình duyệt báo lỗi tải,
    // giao diện tự tải lại trang; trả index.html thì trình duyệt nhận HTML thay cho JS, lỗi khó hiểu
    if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/assets/')) return next();
    res.sendFile(join(webDir, 'index.html'));
  });
}
