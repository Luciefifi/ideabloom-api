import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';

describe('Health and global setup (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health reports the API and database as up', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(res.body).toMatchObject({
      status: 'ok',
      info: { database: { status: 'up' } },
    });
  });

  it('returns the standard error shape for unknown routes', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .expect(404);

    expect(res.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: expect.any(String) as string,
      path: '/api/v1/does-not-exist',
      timestamp: expect.any(String) as string,
    });
  });

  it('answers invalid JSON with 400 (not a 500 crash)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ')
      .expect(400);

    expect(res.body).toMatchObject({ statusCode: 400, error: 'Bad Request' });
  });

  it('only serves routes under the /api/v1 prefix', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });

  it('sends security headers (helmet)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
