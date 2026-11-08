import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { registerMobileUser } from './utils/auth';
import { createTestApp } from './utils/create-test-app';
import { resetDatabase } from './utils/database';

const API = '/api/v1';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

interface IdeaBody {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  isFavorite: boolean;
  archivedAt: string | null;
  category: { id: string; name: string } | null;
  tags: { id: string; name: string }[];
  links: { url: string; label: string | null }[];
  excerpt?: string | null;
  linkCount?: number;
}

describe('Ideas (e2e)', () => {
  let app: INestApplication<App>;
  let lucie: string;
  let other: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    lucie = (await registerMobileUser(app, { email: 'lucie@example.com' }))
      .accessToken;
    other = (await registerMobileUser(app, { email: 'other@example.com' }))
      .accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const as = (token: string) => {
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const server = app.getHttpServer();
    return {
      get: (path: string) => auth(request(server).get(`${API}${path}`)),
      post: (path: string, body: object = {}) =>
        auth(request(server).post(`${API}${path}`)).send(body),
      patch: (path: string, body: object) =>
        auth(request(server).patch(`${API}${path}`)).send(body),
      delete: (path: string) => auth(request(server).delete(`${API}${path}`)),
    };
  };

  const createIdea = async (token: string, body: object) =>
    (await as(token).post('/ideas', body).expect(201)).body as IdeaBody;

  const listTitles = async (token: string, query = '') => {
    const res = await as(token).get(`/ideas${query}`).expect(200);
    return (res.body.data as IdeaBody[]).map((idea) => idea.title);
  };

  describe('creating', () => {
    it('captures an idea with just a title (quick capture)', async () => {
      const idea = await createIdea(lucie, { title: '  Plant watering app ' });

      expect(idea).toMatchObject({
        title: 'Plant watering app',
        description: null,
        status: 'inbox',
        priority: null,
        isFavorite: false,
        archivedAt: null,
        category: null,
        tags: [],
        links: [],
      });
    });

    it('creates an idea with everything, re-using and creating tags', async () => {
      const category = (
        await as(lucie).post('/categories', { name: 'Health' }).expect(201)
      ).body as { id: string };
      await as(lucie).post('/tags', { name: 'Mobile' }).expect(201);

      const idea = await createIdea(lucie, {
        title: 'Plant watering app',
        description: 'Reminds you\nwhen to water.',
        status: 'exploring',
        priority: 'high',
        categoryId: category.id,
        tags: ['mobile', 'garden', 'Garden', '  plants '],
        links: [
          { url: 'https://example.com/a', label: 'Article' },
          { url: 'http://example.com/b' },
        ],
        isFavorite: true,
      });

      expect(idea).toMatchObject({
        description: 'Reminds you\nwhen to water.',
        status: 'exploring',
        priority: 'high',
        isFavorite: true,
        category: { id: category.id, name: 'Health' },
        links: [
          { url: 'https://example.com/a', label: 'Article' },
          { url: 'http://example.com/b', label: null },
        ],
      });
      // Existing "Mobile" re-used (its spelling kept), duplicates merged, new ones created.
      expect(idea.tags.map((t) => t.name)).toEqual([
        'garden',
        'Mobile',
        'plants',
      ]);
      const tags = await as(lucie).get('/tags').expect(200);
      expect(tags.body).toHaveLength(3);
    });

    it.each([
      [{ title: '   ' }, 'Title is required'],
      [{ title: 'x'.repeat(201) }, 'Title must be at most 200 characters'],
      [{ title: 'Ok', status: 'converted' }, 'Status must be one of'],
      [{ title: 'Ok', priority: 'critical' }, 'Priority must be one of'],
      [
        { title: 'Ok', links: [{ url: 'javascript:alert(1)' }] },
        'Links must be full web addresses',
      ],
      [
        { title: 'Ok', links: [{ url: 'example.com' }] },
        'Links must be full web addresses',
      ],
      [{ title: 'Ok', tags: ['a,b'] }, 'Tag names can use letters'],
      [
        { title: 'Ok', tags: Array.from({ length: 21 }, (_, i) => `t${i}`) },
        'at most 20 tags',
      ],
      [{ title: 'Ok', userId: MISSING_ID }, 'property userId should not exist'],
    ])('rejects invalid input %j', async (body, message) => {
      const res = await as(lucie).post('/ideas', body).expect(400);
      expect(String(res.body.message)).toContain(message);
    });

    it("refuses another user's category", async () => {
      const theirs = (
        await as(other).post('/categories', { name: 'Theirs' }).expect(201)
      ).body as { id: string };

      const res = await as(lucie)
        .post('/ideas', { title: 'Sneaky', categoryId: theirs.id })
        .expect(404);
      expect(res.body.message).toBe('Category not found');
      expect(await listTitles(lucie)).toEqual([]); // nothing half-saved
    });
  });

  describe('reading and searching', () => {
    beforeEach(async () => {
      const design = (
        await as(lucie).post('/categories', { name: 'Design' }).expect(201)
      ).body as { id: string };
      await createIdea(lucie, {
        title: 'Garden planner',
        description: 'Plan vegetable beds by season',
        priority: 'low',
        tags: ['garden'],
      });
      await createIdea(lucie, {
        title: 'Portfolio website',
        description: 'Show my design work',
        priority: 'urgent',
        categoryId: design.id,
        isFavorite: true,
      });
      await createIdea(lucie, {
        title: 'Ubuhinzi bw’imboga',
        description: 'Guide for small farmers',
        status: 'planned',
      });
    });

    it('lists active ideas, newest change first, with page info', async () => {
      const res = await as(lucie).get('/ideas').expect(200);

      expect((res.body.data as IdeaBody[]).map((i) => i.title)).toEqual([
        'Ubuhinzi bw’imboga',
        'Portfolio website',
        'Garden planner',
      ]);
      expect(res.body.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 3,
        totalPages: 1,
      });
      expect(res.body.data[2]).toMatchObject({
        excerpt: 'Plan vegetable beds by season',
        linkCount: 0,
      });
    });

    it.each([
      ['?search=gard', ['Garden planner']], // partial word
      ['?search=season', ['Garden planner']], // matches the description
      ['?search=ubuhinzi', ['Ubuhinzi bw’imboga']], // Kinyarwanda
      ['?search=DESIGN%20work', ['Portfolio website']], // several words, any case
      ['?search=nothing-like-this', []],
    ])('search %s', async (query, expected) => {
      expect(await listTitles(lucie, query)).toEqual(expected);
    });

    it('ranks title matches above description matches', async () => {
      await createIdea(lucie, {
        title: 'Notes',
        description: 'a garden idea mentioned in passing',
      });
      expect(await listTitles(lucie, '?search=garden')).toEqual([
        'Garden planner',
        'Notes',
      ]);
    });

    it.each([
      ['?status=planned', ['Ubuhinzi bw’imboga']],
      ['?priority=urgent', ['Portfolio website']],
      ['?priority=none', ['Ubuhinzi bw’imboga']],
      ['?favorite=true', ['Portfolio website']],
      ['?categoryId=none', ['Ubuhinzi bw’imboga', 'Garden planner']],
    ])('filter %s', async (query, expected) => {
      expect(await listTitles(lucie, query)).toEqual(expected);
    });

    it('filters by category and by tag', async () => {
      const categories = await as(lucie).get('/categories').expect(200);
      const tags = await as(lucie).get('/tags').expect(200);

      expect(
        await listTitles(lucie, `?categoryId=${categories.body[0].id}`),
      ).toEqual(['Portfolio website']);
      expect(await listTitles(lucie, `?tagId=${tags.body[0].id}`)).toEqual([
        'Garden planner',
      ]);
      // Counts for the organise page.
      expect(categories.body[0].ideaCount).toBe(1);
      expect(tags.body[0].ideaCount).toBe(1);
    });

    it.each([
      [
        '?sort=title',
        ['Garden planner', 'Portfolio website', 'Ubuhinzi bw’imboga'],
      ],
      [
        '?sort=title&order=desc',
        ['Ubuhinzi bw’imboga', 'Portfolio website', 'Garden planner'],
      ],
      [
        '?sort=priority',
        ['Portfolio website', 'Garden planner', 'Ubuhinzi bw’imboga'],
      ],
      [
        '?sort=createdAt&order=asc',
        ['Garden planner', 'Portfolio website', 'Ubuhinzi bw’imboga'],
      ],
    ])('sort %s', async (query, expected) => {
      expect(await listTitles(lucie, query)).toEqual(expected);
    });

    it('pages through results', async () => {
      const page2 = await as(lucie)
        .get('/ideas?sort=title&pageSize=2&page=2')
        .expect(200);

      expect((page2.body.data as IdeaBody[]).map((i) => i.title)).toEqual([
        'Ubuhinzi bw’imboga',
      ]);
      expect(page2.body.meta).toEqual({
        page: 2,
        pageSize: 2,
        total: 3,
        totalPages: 2,
      });
    });

    it.each([
      '?status=done',
      '?sort=random',
      '?pageSize=500',
      '?categoryId=abc',
    ])('rejects invalid query %s', async (query) => {
      await as(lucie).get(`/ideas${query}`).expect(400);
    });
  });

  describe('updating', () => {
    it('updates only the fields sent, and can clear optional ones', async () => {
      const idea = await createIdea(lucie, {
        title: 'Draft',
        description: 'Old text',
        priority: 'low',
        tags: ['a', 'b'],
        links: [{ url: 'https://old.example' }],
      });

      const res = await as(lucie)
        .patch(`/ideas/${idea.id}`, {
          title: 'Final',
          description: '',
          priority: null,
          tags: ['b', 'c'],
          links: [{ url: 'https://new.example', label: 'New' }],
        })
        .expect(200);

      expect(res.body).toMatchObject({
        title: 'Final',
        description: null,
        priority: null,
        status: 'inbox',
        links: [{ url: 'https://new.example', label: 'New' }],
      });
      expect((res.body as IdeaBody).tags.map((t) => t.name)).toEqual([
        'b',
        'c',
      ]);
    });

    it('archives and restores; archived ideas leave the default list', async () => {
      const idea = await createIdea(lucie, { title: 'Old idea' });

      const archived = await as(lucie)
        .post(`/ideas/${idea.id}/archive`)
        .expect(200);
      expect(archived.body.archivedAt).not.toBeNull();
      expect(await listTitles(lucie)).toEqual([]);
      expect(await listTitles(lucie, '?archived=true')).toEqual(['Old idea']);
      expect(await listTitles(lucie, '?archived=all')).toEqual(['Old idea']);

      await as(lucie).post(`/ideas/${idea.id}/restore`).expect(200);
      expect(await listTitles(lucie)).toEqual(['Old idea']);
    });

    it('deleting a category keeps its ideas (uncategorized); deleting a tag removes it from ideas', async () => {
      const category = (
        await as(lucie).post('/categories', { name: 'Temp' }).expect(201)
      ).body as { id: string };
      const idea = await createIdea(lucie, {
        title: 'Keep me',
        categoryId: category.id,
        tags: ['temp'],
      });
      const tagId = idea.tags[0].id;

      await as(lucie).delete(`/categories/${category.id}`).expect(204);
      await as(lucie).delete(`/tags/${tagId}`).expect(204);

      const after = await as(lucie).get(`/ideas/${idea.id}`).expect(200);
      expect(after.body).toMatchObject({ category: null, tags: [] });
    });

    it('deletes permanently', async () => {
      const idea = await createIdea(lucie, {
        title: 'Bye',
        links: [{ url: 'https://x.example' }],
      });

      await as(lucie).delete(`/ideas/${idea.id}`).expect(204);

      await as(lucie).get(`/ideas/${idea.id}`).expect(404);
    });
  });

  describe('activity', () => {
    it('records what happened to an idea, newest first', async () => {
      const idea = await createIdea(lucie, { title: 'Tracked' });
      await as(lucie).patch(`/ideas/${idea.id}`, { status: 'exploring' });
      await as(lucie).patch(`/ideas/${idea.id}`, { isFavorite: true });
      await as(lucie).patch(`/ideas/${idea.id}`, { title: 'Tracked idea' });
      await as(lucie).post(`/ideas/${idea.id}/archive`);
      await as(lucie).post(`/ideas/${idea.id}/restore`);
      await as(lucie).delete(`/ideas/${idea.id}`);

      const res = await as(lucie).get('/activity').expect(200);
      const entries = res.body as {
        action: string;
        summary: string;
        metadata: object;
      }[];

      expect(entries.map((a) => a.action)).toEqual([
        'deleted',
        'restored',
        'archived',
        'updated',
        'favorited',
        'status_changed',
        'created',
      ]);
      expect(entries[0].summary).toBe('Tracked idea');
      expect(entries[5].metadata).toEqual({ from: 'inbox', to: 'exploring' });
    });

    it('records nothing when an update changes nothing', async () => {
      const idea = await createIdea(lucie, { title: 'Same', tags: ['x'] });
      await as(lucie).patch(`/ideas/${idea.id}`, {
        title: 'Same',
        tags: ['X'],
      });

      const res = await as(lucie).get('/activity').expect(200);
      expect(res.body).toHaveLength(1); // just "created"

      const after = await as(lucie).get(`/ideas/${idea.id}`).expect(200);
      expect(after.body.updatedAt).toBe(
        (idea as unknown as { updatedAt: string }).updatedAt,
      );
    });
  });

  describe('data isolation', () => {
    it("never shows, changes, archives or deletes another user's idea", async () => {
      const mine = await createIdea(lucie, { title: 'Private idea' });

      expect(await listTitles(other)).toEqual([]);
      expect(await listTitles(other, '?search=private')).toEqual([]);
      await as(other).get(`/ideas/${mine.id}`).expect(404);
      await as(other)
        .patch(`/ideas/${mine.id}`, { title: 'Hacked' })
        .expect(404);
      await as(other).post(`/ideas/${mine.id}/archive`).expect(404);
      await as(other).delete(`/ideas/${mine.id}`).expect(404);

      const still = await as(lucie).get(`/ideas/${mine.id}`).expect(200);
      expect(still.body).toMatchObject({
        title: 'Private idea',
        archivedAt: null,
      });
    });

    it("doesn't leak ideas through another user's tag id", async () => {
      const mine = await createIdea(lucie, {
        title: 'Tagged',
        tags: ['secret'],
      });

      expect(await listTitles(other, `?tagId=${mine.tags[0].id}`)).toEqual([]);
    });

    it('requires being logged in', async () => {
      await request(app.getHttpServer()).get(`${API}/ideas`).expect(401);
    });

    it('returns 404 for a missing idea and 400 for a malformed id', async () => {
      await as(lucie).get(`/ideas/${MISSING_ID}`).expect(404);
      await as(lucie).get('/ideas/not-a-uuid').expect(400);
    });
  });
});
