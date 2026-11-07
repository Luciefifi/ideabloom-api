import { INestApplication } from '@nestjs/common';
import { getOptionsToken } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { buildThrottlerOptions } from '../src/common/throttling/throttler.config';
import { createTestApp } from './utils/create-test-app';
import { resetDatabase } from './utils/database';

const AUTH_LIMIT = 3;

describe('Rate limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Same throttling rules as production, with a small auth limit so the test is quick.
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(getOptionsToken())
        .useValue(
          buildThrottlerOptions({ defaultLimit: 1000, authLimit: AUTH_LIMIT }),
        ),
    );
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const login = (ip: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', ip) // as the Next.js proxy would send it
      .send({ email: 'someone@example.com', password: 'guessing-password' });

  it('blocks repeated login attempts from the same visitor', async () => {
    for (let attempt = 0; attempt < AUTH_LIMIT; attempt++) {
      await login('203.0.113.10').expect(401);
    }

    const blocked = await login('203.0.113.10').expect(429);
    expect(blocked.body.message).toBe(
      'Too many attempts. Please wait a minute and try again.',
    );
  });

  it('counts each visitor separately (real IP read through the trusted proxy)', async () => {
    await login('198.51.100.20').expect(401);
  });

  it('does not apply the strict auth limit to normal routes', async () => {
    for (let i = 0; i < AUTH_LIMIT + 2; i++) {
      await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('X-Forwarded-For', '203.0.113.10')
        .expect(200);
    }
  });
});
