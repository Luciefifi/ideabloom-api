import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { MailService } from '../src/modules/mail/mail.service';
import {
  ACCOUNT_LIMITS,
  type AccountLimits,
} from '../src/modules/auth/account-limits';
import { registerMobileUser, TEST_PASSWORD } from './utils/auth';
import { createTestApp } from './utils/create-test-app';
import { resetDatabase } from './utils/database';
import { FakeMailService } from './utils/fake-mail';

const API = '/api/v1';

// Same rules as production, with small numbers so the test is quick.
const limits: AccountLimits = {
  loginMaxFailures: 3,
  loginLockMs: 15 * 60_000,
  resetEmailsPerWindow: 2,
  resetEmailWindowMs: 60 * 60_000,
};

describe('Per-account limits (e2e)', () => {
  let app: INestApplication<App>;
  const mail = new FakeMailService();

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(ACCOUNT_LIMITS)
        .useValue(limits)
        .overrideProvider(MailService)
        .useValue(mail),
    );
    await resetDatabase(app);
    await registerMobileUser(app, { email: 'lucie@example.com' });
    await registerMobileUser(app, { email: 'other@example.com' });
  });

  afterAll(async () => {
    await app.close();
  });

  // Each attempt comes from a different (pretend) IP address, as an attacker
  // rotating IPs would do: the per-IP limit can't stop this, the per-account one can.
  let ip = 1;
  const login = (email: string, password: string) =>
    request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .set('X-Forwarded-For', `203.0.113.${ip++}`)
      .send({ email, password });

  it('pauses an account after repeated failures from many IPs, even for the right password', async () => {
    for (let i = 0; i < limits.loginMaxFailures; i++) {
      await login('lucie@example.com', 'guess-number-' + i).expect(401);
    }

    const res = await login('lucie@example.com', TEST_PASSWORD).expect(429);
    expect(res.body.message).toBe(
      'Too many failed attempts for this account. Please wait 15 minutes or reset your password.',
    );
  });

  it('does not affect other accounts', async () => {
    await login('other@example.com', TEST_PASSWORD).expect(200);
  });

  it('gives the same 429 for an email with no account', async () => {
    for (let i = 0; i < limits.loginMaxFailures; i++) {
      await login('nobody@example.com', 'guess').expect(401);
    }
    await login('nobody@example.com', 'guess').expect(429);
  });

  it('sends at most the allowed number of reset emails per hour, with the same response every time', async () => {
    for (let i = 0; i < limits.resetEmailsPerWindow + 2; i++) {
      await request(app.getHttpServer())
        .post(`${API}/auth/forgot-password`)
        .set('X-Forwarded-For', `198.51.100.${i}`)
        .send({ email: 'other@example.com' })
        .expect(202);
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(mail.sent.filter((m) => m.to === 'other@example.com')).toHaveLength(
      limits.resetEmailsPerWindow,
    );
  });
});
