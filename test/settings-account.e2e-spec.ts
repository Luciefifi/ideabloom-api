import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { registerMobileUser, TEST_PASSWORD } from './utils/auth';
import { createTestApp } from './utils/create-test-app';
import { resetDatabase } from './utils/database';

const API = '/api/v1';
const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

interface Session {
  id: string;
  device: string;
  current: boolean;
  signedInAt: string;
  lastActiveAt: string;
}

describe('Settings and account (e2e)', () => {
  let app: INestApplication<App>;
  let lucie: string;
  let lucieId: string;
  let other: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    const session = await registerMobileUser(app, {
      email: 'lucie@example.com',
    });
    lucie = session.accessToken;
    lucieId = session.user.id;
    other = (await registerMobileUser(app, { email: 'other@example.com' }))
      .accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const as = (token: string) => ({
    get: (path: string) =>
      request(server())
        .get(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`),
    post: (path: string, body: object = {}) =>
      request(server())
        .post(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body),
    patch: (path: string, body: object) =>
      request(server())
        .patch(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body),
    delete: (path: string, body?: object) =>
      request(server())
        .delete(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body),
  });

  /** Logs in like a web browser (cookies); later requests send those cookies. */
  const login = async (userAgent: string) => {
    const res = await request(server())
      .post(`${API}/auth/login`)
      .set('User-Agent', userAgent)
      .send({ email: 'lucie@example.com', password: TEST_PASSWORD })
      .expect(200);
    const cookies = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
    const withCookie = (r: request.Test) => r.set('Cookie', cookies);
    return {
      get: (path: string) => withCookie(request(server()).get(`${API}${path}`)),
      delete: (path: string) =>
        withCookie(request(server()).delete(`${API}${path}`)),
      refresh: () => withCookie(request(server()).post(`${API}/auth/refresh`)),
    };
  };

  describe('preferences', () => {
    it('defaults to the system theme and the dashboard', async () => {
      const me = await as(lucie).get('/users/me').expect(200);
      expect(me.body.preferences).toEqual({
        theme: 'system',
        startPage: 'dashboard',
      });
    });

    it('saves one preference without forgetting the others', async () => {
      await as(lucie)
        .patch('/users/me', { preferences: { startPage: 'tasks' } })
        .expect(200);
      const res = await as(lucie)
        .patch('/users/me', { preferences: { theme: 'dark' } })
        .expect(200);
      expect(res.body.preferences).toEqual({
        theme: 'dark',
        startPage: 'tasks',
      });
    });

    it.each([
      [{ theme: 'neon' }, 'Theme must be one of'],
      [{ startPage: 'settings' }, 'Start page must be one of'],
      [{ isAdmin: true }, 'should not exist'],
    ])('rejects %j', async (preferences, message) => {
      const res = await as(lucie)
        .patch('/users/me', { preferences })
        .expect(400);
      expect(String(res.body.message)).toContain(message);
    });
  });

  describe('signed-in devices', () => {
    it('lists devices with short labels and marks this one', async () => {
      await login(SAFARI_IPHONE);
      const laptop = await login(CHROME_WINDOWS);

      const res = await laptop.get('/auth/sessions').expect(200);
      const sessions = res.body as Session[];
      expect(sessions.map((s) => [s.device, s.current])).toEqual([
        ['Chrome on Windows', true], // most recently active first
        ['Safari on iOS', false],
        ['IdeaBloom mobile app', false], // the registration
      ]);

      // Only the short label is stored, never the full browser string.
      const stored: { device_label: string }[] = await app
        .get(DataSource)
        .query('SELECT device_label FROM refresh_tokens');
      expect(JSON.stringify(stored)).not.toContain('AppleWebKit');
    });

    it('signs another device out', async () => {
      const phone = await login(SAFARI_IPHONE);
      const laptop = await login(CHROME_WINDOWS);
      const sessions = (await laptop.get('/auth/sessions')).body as Session[];
      const phoneSession = sessions.find((s) => s.device === 'Safari on iOS');

      await laptop.delete(`/auth/sessions/${phoneSession?.id}`).expect(204);

      // The phone can no longer refresh its session; the laptop still can.
      await phone.refresh().expect(401);
      await laptop.refresh().expect(200);
      const after = (await laptop.get('/auth/sessions')).body as Session[];
      expect(after.map((s) => s.device)).not.toContain('Safari on iOS');
    });

    it("can't sign out another user's device", async () => {
      const sessions = (await as(other).get('/auth/sessions'))
        .body as Session[];
      await as(lucie).delete(`/auth/sessions/${sessions[0].id}`).expect(404);
      expect((await as(other).get('/auth/sessions')).body).toHaveLength(1);
    });
  });

  describe('download my data', () => {
    it('exports everything you created, and nothing secret or from others', async () => {
      const idea = await as(lucie)
        .post('/ideas', {
          title: 'Garden app',
          tags: ['garden'],
          links: [{ url: 'https://example.com' }],
        })
        .expect(201);
      await as(lucie).post('/notes', { title: 'Plan' }).expect(201);
      await as(lucie).post('/tasks', { title: 'Buy seeds' }).expect(201);
      await as(other).post('/ideas', { title: 'Their idea' }).expect(201);

      const res = await as(lucie).get('/users/me/export').expect(200);
      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename="ideabloom-export-\d{4}-\d{2}-\d{2}\.json"$/,
      );
      const data = res.body as Record<string, unknown[]> & {
        profile: Record<string, unknown>;
      };
      expect(data).toMatchObject({ format: 'ideabloom-export', version: 1 });
      expect(data.profile).toMatchObject({ email: 'lucie@example.com' });
      expect(data.ideas).toHaveLength(1);
      expect(data.ideas[0]).toMatchObject({
        id: (idea.body as { id: string }).id,
        title: 'Garden app',
      });
      expect(data.ideaTags).toHaveLength(1);
      expect(data.ideaLinks).toHaveLength(1);
      expect(data.notes).toHaveLength(1);
      expect(data.tasks).toHaveLength(1);
      expect(data.activity.length).toBeGreaterThan(0);

      const text = JSON.stringify(res.body);
      expect(text).not.toContain('password');
      expect(text).not.toContain('search_vector');
      expect(text).not.toContain('token');
      expect(text).not.toContain('Their idea');
    });
  });

  describe('delete my account', () => {
    it('needs the right password and the word DELETE', async () => {
      const wrong = await as(lucie)
        .delete('/auth/account', {
          password: 'not my password',
          confirm: 'DELETE',
        })
        .expect(400);
      expect(wrong.body.message).toBe('Your password is incorrect.');

      const unconfirmed = await as(lucie)
        .delete('/auth/account', { password: TEST_PASSWORD, confirm: 'delete' })
        .expect(400);
      expect(String(unconfirmed.body.message)).toContain(
        'Type DELETE to confirm',
      );

      await as(lucie).get('/users/me').expect(200); // still there
    });

    it('removes the account and everything in it, and nothing of anyone else', async () => {
      const project = (
        await as(lucie).post('/projects', { title: 'Garden app' }).expect(201)
      ).body as { id: string };
      await as(lucie)
        .post(`/projects/${project.id}/milestones`, { title: 'Beta' })
        .expect(201);
      await as(lucie)
        .post('/tasks', { title: 'T', projectId: project.id })
        .expect(201);
      await as(lucie)
        .post('/ideas', { title: 'I', tags: ['x'] })
        .expect(201);
      await as(lucie).post('/notes', { title: 'N' }).expect(201);
      await as(lucie)
        .post('/resources', { title: 'R', url: 'https://example.com' })
        .expect(201);
      await as(other).post('/ideas', { title: 'Keep me' }).expect(201);

      await as(lucie)
        .delete('/auth/account', { password: TEST_PASSWORD, confirm: 'DELETE' })
        .expect(204);

      const db = app.get(DataSource);
      for (const table of [
        'users',
        'refresh_tokens',
        'categories',
        'tags',
        'ideas',
        'projects',
        'milestones',
        'tasks',
        'notes',
        'resources',
        'activities',
      ]) {
        const column = table === 'users' ? 'id' : 'user_id';
        const [{ count }] = await db.query<{ count: number }[]>(
          `SELECT COUNT(*)::int AS count FROM ${table} WHERE ${column} = $1`,
          [lucieId],
        );
        expect([table, count]).toEqual([table, 0]);
      }
      await request(server())
        .post(`${API}/auth/login`)
        .send({ email: 'lucie@example.com', password: TEST_PASSWORD })
        .expect(401);
      const theirs = await as(other).get('/ideas').expect(200);
      expect(theirs.body.data[0].title).toBe('Keep me');
    });
  });
});
