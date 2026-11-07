import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ActivityService } from '../src/modules/activity/activity.service';
import { registerMobileUser } from './utils/auth';
import { createTestApp } from './utils/create-test-app';
import { resetDatabase } from './utils/database';

const API = '/api/v1';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('Categories, tags and activity (e2e)', () => {
  let app: INestApplication<App>;
  let lucie: string; // access tokens
  let other: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    lucie = (await registerMobileUser(app, { email: 'lucie@example.com' }))
      .accessToken;
    other = (
      await registerMobileUser(app, {
        email: 'other@example.com',
        displayName: 'Other',
      })
    ).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  /** A request as a given user. */
  const as = (token: string) => ({
    get: (path: string) =>
      request(app.getHttpServer())
        .get(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`),
    post: (path: string, body: object) =>
      request(app.getHttpServer())
        .post(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body),
    patch: (path: string, body: object) =>
      request(app.getHttpServer())
        .patch(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body),
    delete: (path: string) =>
      request(app.getHttpServer())
        .delete(`${API}${path}`)
        .set('Authorization', `Bearer ${token}`),
  });

  describe('categories', () => {
    it('creates, lists (A to Z), renames, recolours and deletes', async () => {
      const created = await as(lucie)
        .post('/categories', { name: '  Learning ', color: 'sky' })
        .expect(201);
      expect(created.body).toMatchObject({ name: 'Learning', color: 'sky' });
      await as(lucie).post('/categories', { name: 'Business' }).expect(201);

      const list = await as(lucie).get('/categories').expect(200);
      expect((list.body as { name: string }[]).map((c) => c.name)).toEqual([
        'Business',
        'Learning',
      ]);
      expect(list.body[0].color).toBe('lavender'); // default colour

      const id = created.body.id as string;
      const updated = await as(lucie)
        .patch(`/categories/${id}`, { name: 'Study', color: 'emerald' })
        .expect(200);
      expect(updated.body).toMatchObject({ name: 'Study', color: 'emerald' });

      await as(lucie).delete(`/categories/${id}`).expect(204);
      const after = await as(lucie).get('/categories').expect(200);
      expect(after.body).toHaveLength(1);
    });

    it('rejects a duplicate name, whatever the capitalisation', async () => {
      await as(lucie).post('/categories', { name: 'Design' }).expect(201);

      const res = await as(lucie)
        .post('/categories', { name: 'DESIGN' })
        .expect(409);
      expect(res.body.message).toBe(
        'You already have a category named "DESIGN"',
      );
    });

    it('lets two different users have a category with the same name', async () => {
      await as(lucie).post('/categories', { name: 'Design' }).expect(201);
      await as(other).post('/categories', { name: 'Design' }).expect(201);
    });

    it.each([
      [{ name: '' }, 'Name is required'],
      [{ name: 'x'.repeat(51) }, 'Name must be at most 50 characters'],
      [{ name: 'Ok', color: '#ff0000' }, 'Color must be one of'],
      [{ name: 'Ok', userId: MISSING_ID }, 'property userId should not exist'],
    ])('rejects invalid input %j', async (body, message) => {
      const res = await as(lucie).post('/categories', body).expect(400);
      expect(String(res.body.message)).toContain(message);
    });

    it("never shows, changes or deletes another user's category", async () => {
      const mine = await as(lucie)
        .post('/categories', { name: 'Private' })
        .expect(201);
      const id = mine.body.id as string;

      expect((await as(other).get('/categories').expect(200)).body).toEqual([]);
      await as(other)
        .patch(`/categories/${id}`, { name: 'Hacked' })
        .expect(404);
      await as(other).delete(`/categories/${id}`).expect(404);

      const stillMine = await as(lucie).get('/categories').expect(200);
      expect(stillMine.body[0].name).toBe('Private');
    });

    it('returns 404 for a missing id and 400 for a malformed one', async () => {
      await as(lucie).patch(`/categories/${MISSING_ID}`, {}).expect(404);
      await as(lucie).delete('/categories/not-a-uuid').expect(400);
    });

    it('requires being logged in', async () => {
      await request(app.getHttpServer()).get(`${API}/categories`).expect(401);
    });
  });

  describe('tags', () => {
    it('creates (tidying spaces), lists, renames and deletes', async () => {
      const created = await as(lucie)
        .post('/tags', { name: '  web   design ' })
        .expect(201);
      expect(created.body.name).toBe('web design');
      await as(lucie).post('/tags', { name: 'ai' }).expect(201);

      const list = await as(lucie).get('/tags').expect(200);
      expect((list.body as { name: string }[]).map((t) => t.name)).toEqual([
        'ai',
        'web design',
      ]);

      const id = created.body.id as string;
      await as(lucie).patch(`/tags/${id}`, { name: 'ux' }).expect(200);
      await as(lucie).delete(`/tags/${id}`).expect(204);
      expect((await as(lucie).get('/tags')).body).toHaveLength(1);
    });

    it('accepts letters from any language', async () => {
      const res = await as(lucie)
        .post('/tags', { name: 'Ubuhinzi café #2' })
        .expect(201);
      expect(res.body.name).toBe('Ubuhinzi café #2');
    });

    it.each([
      [{ name: 'a, b' }, 'Tag names can use letters'],
      [{ name: '   ' }, 'Tag name is required'],
      [{ name: 'x'.repeat(31) }, 'at most 30 characters'],
    ])('rejects invalid input %j', async (body, message) => {
      const res = await as(lucie).post('/tags', body).expect(400);
      expect(String(res.body.message)).toContain(message);
    });

    it('rejects a duplicate name, whatever the capitalisation', async () => {
      await as(lucie).post('/tags', { name: 'Mobile' }).expect(201);
      await as(lucie).post('/tags', { name: 'mobile' }).expect(409);
    });

    it("never shows, renames or deletes another user's tag", async () => {
      const mine = await as(lucie)
        .post('/tags', { name: 'secret' })
        .expect(201);
      const id = mine.body.id as string;

      expect((await as(other).get('/tags')).body).toEqual([]);
      await as(other).patch(`/tags/${id}`, { name: 'hacked' }).expect(404);
      await as(other).delete(`/tags/${id}`).expect(404);
    });
  });

  describe('activity', () => {
    it("lists only the user's own activity, newest first, with a limit", async () => {
      const activity = app.get(ActivityService);
      const [lucieId, otherId] = await Promise.all([
        as(lucie).get('/users/me'),
        as(other).get('/users/me'),
      ]).then(([a, b]) => [a.body.id as string, b.body.id as string]);

      for (const summary of ['First idea', 'Second idea', 'Third idea']) {
        await activity.log(lucieId, {
          entityType: 'idea',
          entityId: MISSING_ID,
          action: 'created',
          summary,
        });
      }
      await activity.log(otherId, {
        entityType: 'idea',
        entityId: MISSING_ID,
        action: 'created',
        summary: 'Not yours',
      });

      const res = await as(lucie).get('/activity?limit=2').expect(200);

      expect((res.body as { summary: string }[]).map((a) => a.summary)).toEqual(
        ['Third idea', 'Second idea'],
      );
      expect(res.body[0]).toMatchObject({
        entityType: 'idea',
        action: 'created',
        metadata: {},
      });
    });

    it('validates the limit', async () => {
      await as(lucie).get('/activity?limit=500').expect(400);
    });
  });
});
