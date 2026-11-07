import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

export const TEST_PASSWORD = 'correct horse battery staple';

export interface TestUserInput {
  email?: string;
  password?: string;
  displayName?: string;
}

export interface MobileSession {
  user: { id: string; email: string; displayName: string };
  accessToken: string;
  refreshToken: string;
}

/** Registers a user as the mobile app would, returning tokens for Bearer auth. */
export async function registerMobileUser(
  app: INestApplication<App>,
  input: TestUserInput = {},
): Promise<MobileSession> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .set('X-Client', 'mobile')
    .send({
      email: input.email ?? 'lucie@example.com',
      password: input.password ?? TEST_PASSWORD,
      displayName: input.displayName ?? 'Lucie',
    })
    .expect(201);

  return res.body as MobileSession;
}

/** Parses Set-Cookie headers into { name: { value, attributes } }. */
export function parseSetCookies(
  header: string | string[] | undefined,
): Record<string, { value: string; attributes: string }> {
  const list = Array.isArray(header) ? header : header ? [header] : [];
  return Object.fromEntries(
    list.map((cookie) => {
      const [pair, ...attributes] = cookie.split(';');
      const index = pair.indexOf('=');
      return [
        pair.slice(0, index).trim(),
        {
          value: decodeURIComponent(pair.slice(index + 1)),
          attributes: attributes.join(';').toLowerCase(),
        },
      ];
    }),
  );
}
