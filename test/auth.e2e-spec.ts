import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  parseSetCookies,
  registerMobileUser,
  TEST_PASSWORD,
} from './utils/auth';
import { createTestApp } from './utils/create-test-app';
import { resetDatabase } from './utils/database';

const API = '/api/v1';

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  describe('POST /auth/register', () => {
    const body = {
      email: '  Lucie@Example.COM ',
      password: TEST_PASSWORD,
      displayName: '  Lucie ',
    };

    it('creates the account, logs in with httpOnly cookies and returns a safe profile', async () => {
      const res = await request(server())
        .post(`${API}/auth/register`)
        .send(body)
        .expect(201);

      expect(res.body).toEqual({
        user: {
          id: expect.any(String) as string,
          email: 'lucie@example.com', // normalised
          displayName: 'Lucie', // trimmed
          bio: null,
          timezone: 'UTC',
          createdAt: expect.any(String) as string,
        },
      });
      // Browsers never see tokens in the body: only in httpOnly cookies.
      expect(JSON.stringify(res.body)).not.toMatch(/token|password/i);

      const cookies = parseSetCookies(res.headers['set-cookie']);
      expect(Object.keys(cookies).sort()).toEqual([
        'ib_access',
        'ib_refresh',
        'ib_session',
      ]);
      for (const cookie of Object.values(cookies)) {
        expect(cookie.attributes).toContain('httponly');
        expect(cookie.attributes).toContain('samesite=lax');
      }
      expect(cookies.ib_refresh.attributes).toContain('path=/api/v1/auth');
    });

    it('rejects a second account with the same email, whatever the case', async () => {
      await request(server())
        .post(`${API}/auth/register`)
        .send(body)
        .expect(201);

      const res = await request(server())
        .post(`${API}/auth/register`)
        .send({ ...body, email: 'LUCIE@example.com' })
        .expect(409);

      expect(res.body.message).toBe(
        'An account with this email already exists',
      );
    });

    it.each([
      [{ password: 'short' }, 'Password must be at least 12 characters'],
      [{ email: 'not-an-email' }, 'Enter a valid email address'],
      [{ displayName: '   ' }, 'Name is required'],
      [{ isAdmin: true }, 'property isAdmin should not exist'],
    ])('rejects invalid input %j', async (override, message) => {
      const res = await request(server())
        .post(`${API}/auth/register`)
        .send({ ...body, ...override })
        .expect(400);

      expect(res.body.message).toContain(message);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await registerMobileUser(app, { email: 'lucie@example.com' });
    });

    it('logs in with the right password (email is case-insensitive)', async () => {
      const res = await request(server())
        .post(`${API}/auth/login`)
        .send({ email: 'LUCIE@example.com', password: TEST_PASSWORD })
        .expect(200);

      expect(res.body.user.email).toBe('lucie@example.com');
      expect(parseSetCookies(res.headers['set-cookie'])).toHaveProperty(
        'ib_access',
      );
    });

    it('returns the same message for a wrong password and an unknown email', async () => {
      const wrongPassword = await request(server())
        .post(`${API}/auth/login`)
        .send({ email: 'lucie@example.com', password: 'wrong password!!' })
        .expect(401);
      const unknownEmail = await request(server())
        .post(`${API}/auth/login`)
        .send({ email: 'nobody@example.com', password: TEST_PASSWORD })
        .expect(401);

      expect(wrongPassword.body.message).toBe('Invalid email or password.');
      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
      expect(wrongPassword.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('protected routes', () => {
    it('refuses requests without a login', async () => {
      const res = await request(server()).get(`${API}/users/me`).expect(401);

      expect(res.body).toMatchObject({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Please log in to continue.',
      });
    });

    it('accepts the access cookie (web)', async () => {
      const agent = request.agent(server());
      await agent
        .post(`${API}/auth/register`)
        .send({
          email: 'web@example.com',
          password: TEST_PASSWORD,
          displayName: 'Web',
        })
        .expect(201);

      const res = await agent.get(`${API}/users/me`).expect(200);
      expect(res.body.email).toBe('web@example.com');
    });

    it('accepts a Bearer token (mobile), which gets tokens in the body and no cookies', async () => {
      const res = await request(server())
        .post(`${API}/auth/register`)
        .set('X-Client', 'mobile')
        .send({
          email: 'phone@example.com',
          password: TEST_PASSWORD,
          displayName: 'Phone',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        accessToken: expect.any(String) as string,
        refreshToken: expect.any(String) as string,
        accessTokenExpiresIn: 900,
      });
      expect(res.headers['set-cookie']).toBeUndefined();

      const me = await request(server())
        .get(`${API}/users/me`)
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
      expect(me.body.email).toBe('phone@example.com');
    });

    it('rejects a tampered access token', async () => {
      const { accessToken } = await registerMobileUser(app);
      const tampered = accessToken.slice(0, -2) + 'xx';

      await request(server())
        .get(`${API}/users/me`)
        .set('Authorization', `Bearer ${tampered}`)
        .expect(401);
    });
  });

  describe('data isolation', () => {
    it("only ever returns the logged-in user's own profile", async () => {
      const lucie = await registerMobileUser(app, {
        email: 'lucie@example.com',
      });
      const other = await registerMobileUser(app, {
        email: 'other@example.com',
        displayName: 'Other',
      });

      const lucieMe = await request(server())
        .get(`${API}/users/me`)
        .set('Authorization', `Bearer ${lucie.accessToken}`)
        .expect(200);
      const otherMe = await request(server())
        .get(`${API}/users/me`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(200);

      expect(lucieMe.body.id).toBe(lucie.user.id);
      expect(otherMe.body.id).toBe(other.user.id);
      expect(lucieMe.body.id).not.toBe(otherMe.body.id);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the refresh cookie and keeps the user logged in (web)', async () => {
      const agent = request.agent(server());
      const register = await agent.post(`${API}/auth/register`).send({
        email: 'web@example.com',
        password: TEST_PASSWORD,
        displayName: 'Web',
      });
      const before = parseSetCookies(register.headers['set-cookie']);

      const res = await agent.post(`${API}/auth/refresh`).expect(200);
      const after = parseSetCookies(res.headers['set-cookie']);

      expect(after.ib_refresh.value).not.toBe(before.ib_refresh.value);
      await agent.get(`${API}/users/me`).expect(200);
    });

    it('rotates tokens sent in the body (mobile)', async () => {
      const session = await registerMobileUser(app);

      const res = await request(server())
        .post(`${API}/auth/refresh`)
        .set('X-Client', 'mobile')
        .send({ refreshToken: session.refreshToken })
        .expect(200);

      expect(res.body.refreshToken).not.toBe(session.refreshToken);
      expect(res.body.user.id).toBe(session.user.id);
    });

    it('detects a replayed (stolen) refresh token and ends that whole session', async () => {
      const session = await registerMobileUser(app);
      const rotated = await request(server())
        .post(`${API}/auth/refresh`)
        .set('X-Client', 'mobile')
        .send({ refreshToken: session.refreshToken })
        .expect(200);

      // Pretend the rotation happened a while ago (outside the two-tab grace window).
      await app
        .get(DataSource)
        .query(
          `UPDATE refresh_tokens SET revoked_at = now() - interval '1 minute' WHERE revoked_at IS NOT NULL`,
        );

      // The attacker replays the old token…
      await request(server())
        .post(`${API}/auth/refresh`)
        .set('X-Client', 'mobile')
        .send({ refreshToken: session.refreshToken })
        .expect(401);

      // …and now even the legitimate newest token no longer works.
      await request(server())
        .post(`${API}/auth/refresh`)
        .set('X-Client', 'mobile')
        .send({ refreshToken: rotated.body.refreshToken as string })
        .expect(401);
    });

    it('rejects a request with no refresh token', async () => {
      await request(server()).post(`${API}/auth/refresh`).expect(401);
    });
  });

  describe('logout', () => {
    it('clears the cookies and ends the session', async () => {
      const agent = request.agent(server());
      const register = await agent.post(`${API}/auth/register`).send({
        email: 'web@example.com',
        password: TEST_PASSWORD,
        displayName: 'Web',
      });
      const oldRefresh = parseSetCookies(register.headers['set-cookie'])
        .ib_refresh.value;

      const res = await agent.post(`${API}/auth/logout`).expect(204);

      const cleared = parseSetCookies(res.headers['set-cookie']);
      for (const name of ['ib_access', 'ib_refresh', 'ib_session']) {
        expect(cleared[name].attributes).toMatch(/expires=thu, 01 jan 1970/);
      }
      await agent.get(`${API}/users/me`).expect(401);

      // The old refresh token is revoked server-side too.
      await request(server())
        .post(`${API}/auth/refresh`)
        .set('X-Client', 'mobile')
        .send({ refreshToken: oldRefresh })
        .expect(401);
    });

    it('logout-all ends the sessions on every device', async () => {
      const phone = await registerMobileUser(app);
      const laptop = await request(server())
        .post(`${API}/auth/login`)
        .set('X-Client', 'mobile')
        .send({ email: 'lucie@example.com', password: TEST_PASSWORD })
        .expect(200);

      await request(server())
        .post(`${API}/auth/logout-all`)
        .set('Authorization', `Bearer ${phone.accessToken}`)
        .expect(204);

      for (const refreshToken of [
        phone.refreshToken,
        laptop.body.refreshToken as string,
      ]) {
        await request(server())
          .post(`${API}/auth/refresh`)
          .set('X-Client', 'mobile')
          .send({ refreshToken })
          .expect(401);
      }
    });

    it('logout-all requires being logged in', async () => {
      await request(server()).post(`${API}/auth/logout-all`).expect(401);
    });
  });
});
