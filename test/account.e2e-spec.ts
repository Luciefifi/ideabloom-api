import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { MailService } from '../src/modules/mail/mail.service';
import {
  parseSetCookies,
  registerMobileUser,
  TEST_PASSWORD,
} from './utils/auth';
import { createTestApp } from './utils/create-test-app';
import { resetDatabase } from './utils/database';
import { extractResetToken, FakeMailService } from './utils/fake-mail';

const API = '/api/v1';
const NEW_PASSWORD = 'a brand new long password';
const GENERIC_FORGOT_MESSAGE =
  "If an account exists for that email, we've sent a link to reset the password.";

describe('Account: password reset, profile, password change (e2e)', () => {
  let app: INestApplication<App>;
  const mail = new FakeMailService();

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(MailService).useValue(mail),
    );
  });

  beforeEach(async () => {
    await resetDatabase(app);
    mail.clear();
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const login = (password: string) =>
    request(server())
      .post(`${API}/auth/login`)
      .set('X-Client', 'mobile')
      .send({ email: 'lucie@example.com', password });

  async function requestResetToken(): Promise<string> {
    await request(server())
      .post(`${API}/auth/forgot-password`)
      .send({ email: 'lucie@example.com' })
      .expect(202);
    const email = await mail.waitForEmailTo('lucie@example.com');
    return extractResetToken(email);
  }

  describe('POST /auth/forgot-password', () => {
    it('emails a one-time reset link to an existing account', async () => {
      await registerMobileUser(app);

      const res = await request(server())
        .post(`${API}/auth/forgot-password`)
        .send({ email: 'LUCIE@example.com' })
        .expect(202);

      expect(res.body.message).toBe(GENERIC_FORGOT_MESSAGE);
      const email = await mail.waitForEmailTo('lucie@example.com');
      expect(email.subject).toBe('Reset your IdeaBloom password');
      expect(email.text).toContain(
        'http://localhost:3000/reset-password?token=',
      );

      // Only the hash is stored, never the token from the email.
      const token = extractResetToken(email);
      const rows: { token_hash: string }[] = await app
        .get(DataSource)
        .query('SELECT token_hash FROM password_reset_tokens');
      expect(rows).toHaveLength(1);
      expect(rows[0].token_hash).not.toBe(token);
    });

    it('gives the same answer for an unknown email and sends nothing', async () => {
      const res = await request(server())
        .post(`${API}/auth/forgot-password`)
        .send({ email: 'nobody@example.com' })
        .expect(202);

      expect(res.body.message).toBe(GENERIC_FORGOT_MESSAGE);
      await sleep(200);
      expect(mail.sent).toHaveLength(0);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('sets the new password and logs out every device', async () => {
      const session = await registerMobileUser(app);
      const token = await requestResetToken();

      const res = await request(server())
        .post(`${API}/auth/reset-password`)
        .send({ token, newPassword: NEW_PASSWORD })
        .expect(200);

      expect(res.body.message).toBe(
        'Your password has been reset. You can now log in.',
      );
      await login(TEST_PASSWORD).expect(401);
      await login(NEW_PASSWORD).expect(200);
      await request(server())
        .post(`${API}/auth/refresh`)
        .set('X-Client', 'mobile')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
    });

    it('works only once', async () => {
      await registerMobileUser(app);
      const token = await requestResetToken();

      await request(server())
        .post(`${API}/auth/reset-password`)
        .send({ token, newPassword: NEW_PASSWORD })
        .expect(200);
      const second = await request(server())
        .post(`${API}/auth/reset-password`)
        .send({ token, newPassword: 'yet another long password' })
        .expect(400);

      expect(second.body.message).toBe(
        'This reset link is invalid or has expired. Please request a new one.',
      );
    });

    it('rejects an expired link', async () => {
      await registerMobileUser(app);
      const token = await requestResetToken();
      await app
        .get(DataSource)
        .query(
          `UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'`,
        );

      await request(server())
        .post(`${API}/auth/reset-password`)
        .send({ token, newPassword: NEW_PASSWORD })
        .expect(400);
    });

    it('only the newest link works after asking twice', async () => {
      await registerMobileUser(app);
      const first = await requestResetToken();
      mail.clear();
      const second = await requestResetToken();

      await request(server())
        .post(`${API}/auth/reset-password`)
        .send({ token: first, newPassword: NEW_PASSWORD })
        .expect(400);
      await request(server())
        .post(`${API}/auth/reset-password`)
        .send({ token: second, newPassword: NEW_PASSWORD })
        .expect(200);
    });

    it('rejects a made-up token and a too-short password', async () => {
      await request(server())
        .post(`${API}/auth/reset-password`)
        .send({ token: 'made-up', newPassword: NEW_PASSWORD })
        .expect(400);

      const weak = await request(server())
        .post(`${API}/auth/reset-password`)
        .send({ token: 'whatever', newPassword: 'short' })
        .expect(400);
      expect(weak.body.message).toContain(
        'Password must be at least 12 characters',
      );
    });
  });

  describe('PATCH /users/me', () => {
    it('updates name, bio and time zone', async () => {
      const { accessToken } = await registerMobileUser(app);

      const res = await request(server())
        .patch(`${API}/users/me`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          displayName: '  Lucie F. ',
          bio: 'Building things.',
          timezone: 'Africa/Kigali',
        })
        .expect(200);

      expect(res.body).toMatchObject({
        displayName: 'Lucie F.',
        bio: 'Building things.',
        timezone: 'Africa/Kigali',
      });

      const me = await request(server())
        .get(`${API}/users/me`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(me.body.timezone).toBe('Africa/Kigali');
    });

    it('clears the bio when an empty string is sent', async () => {
      const { accessToken } = await registerMobileUser(app);
      const auth = { Authorization: `Bearer ${accessToken}` };
      await request(server())
        .patch(`${API}/users/me`)
        .set(auth)
        .send({ bio: 'Something' });

      const res = await request(server())
        .patch(`${API}/users/me`)
        .set(auth)
        .send({ bio: '   ' })
        .expect(200);

      expect(res.body.bio).toBeNull();
    });

    it.each([
      [{ timezone: 'Mars/Olympus' }, 'Choose a valid time zone'],
      [{ displayName: '' }, 'Name is required'],
      [{ email: 'new@example.com' }, 'property email should not exist'],
      [{ bio: 'x'.repeat(501) }, 'Bio must be at most 500 characters'],
    ])('rejects %j', async (body, message) => {
      const { accessToken } = await registerMobileUser(app);

      const res = await request(server())
        .patch(`${API}/users/me`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body)
        .expect(400);

      expect(res.body.message).toContain(message);
    });

    it("only changes the logged-in user's own profile", async () => {
      const lucie = await registerMobileUser(app, {
        email: 'lucie@example.com',
      });
      const other = await registerMobileUser(app, {
        email: 'other@example.com',
        displayName: 'Other',
      });

      await request(server())
        .patch(`${API}/users/me`)
        .set('Authorization', `Bearer ${lucie.accessToken}`)
        .send({ displayName: 'Changed' })
        .expect(200);

      const otherMe = await request(server())
        .get(`${API}/users/me`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(200);
      expect(otherMe.body.displayName).toBe('Other');
    });

    it('requires being logged in', async () => {
      await request(server())
        .patch(`${API}/users/me`)
        .send({ displayName: 'X' })
        .expect(401);
    });
  });

  describe('POST /auth/change-password', () => {
    it('changes the password, keeps this device logged in and logs out the others', async () => {
      const otherDevice = await registerMobileUser(app);
      const agent = request.agent(server());
      await agent
        .post(`${API}/auth/login`)
        .send({ email: 'lucie@example.com', password: TEST_PASSWORD })
        .expect(200);

      const res = await agent
        .post(`${API}/auth/change-password`)
        .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD })
        .expect(200);

      expect(parseSetCookies(res.headers['set-cookie'])).toHaveProperty(
        'ib_refresh',
      );
      await agent.get(`${API}/users/me`).expect(200);
      await agent.post(`${API}/auth/refresh`).expect(200);

      await request(server())
        .post(`${API}/auth/refresh`)
        .set('X-Client', 'mobile')
        .send({ refreshToken: otherDevice.refreshToken })
        .expect(401);
      await login(TEST_PASSWORD).expect(401);
      await login(NEW_PASSWORD).expect(200);
    });

    it('rejects a wrong current password with 400 (not 401)', async () => {
      const { accessToken } = await registerMobileUser(app);

      const res = await request(server())
        .post(`${API}/auth/change-password`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'not my password',
          newPassword: NEW_PASSWORD,
        })
        .expect(400);

      expect(res.body.message).toBe('Your current password is incorrect.');
    });

    it('rejects reusing the same password', async () => {
      const { accessToken } = await registerMobileUser(app);

      await request(server())
        .post(`${API}/auth/change-password`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD })
        .expect(400);
    });

    it('requires being logged in', async () => {
      await request(server())
        .post(`${API}/auth/change-password`)
        .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD })
        .expect(401);
    });
  });
});
