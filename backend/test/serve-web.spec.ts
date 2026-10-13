import 'reflect-metadata';
import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { serveWeb } from '../src/serve-web';

// --serve-web (main.ts): tab mở từ bản build trước xin file code đã không còn thì nhận 404, không nhận index.html. Không cần database.

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

describe('Phục vụ giao diện đã build (--serve-web)', () => {
  let app: NestExpressApplication;
  let web: string;

  beforeAll(async () => {
    web = mkdtempSync(join(tmpdir(), 'mes-web-'));
    mkdirSync(join(web, 'assets'));
    writeFileSync(join(web, 'index.html'), '<!doctype html><title>MES</title>');
    writeFileSync(join(web, 'assets', 'app-abc123.js'), 'export const x = 1;');
    const mod = await Test.createTestingModule({ controllers: [PingController] }).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api/v1');
    serveWeb(app, web);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    rmSync(web, { recursive: true, force: true });
  });

  it('đường dẫn của ứng dụng một trang trả index.html', async () => {
    for (const path of ['/', '/order/info', '/admin/users?tab=1']) {
      const res = await request(app.getHttpServer()).get(path).expect(200);
      expect(res.text).toContain('<title>MES</title>');
    }
  });

  it('file code có thật trả đúng file', async () => {
    const res = await request(app.getHttpServer()).get('/assets/app-abc123.js').expect(200);
    expect(res.text).toBe('export const x = 1;');
    expect(res.headers['content-type']).toMatch(/javascript/);
  });

  it('file code không còn trả 404, không trả index.html', async () => {
    const res = await request(app.getHttpServer()).get('/assets/app-old999.js').expect(404);
    expect(res.text).not.toContain('<title>MES</title>');
  });

  it('API không bị trả index.html', async () => {
    await request(app.getHttpServer()).get('/api/v1/ping').expect(200, { ok: true });
    await request(app.getHttpServer()).get('/api/v1/khong-co').expect(404);
  });

  it('chưa build giao diện thì báo rõ', () => {
    const empty = mkdtempSync(join(tmpdir(), 'mes-web-empty-'));
    try {
      expect(() => serveWeb(app, empty)).toThrow('Chưa có giao diện đã build');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
