import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { registerMobileUser } from './utils/auth';
import { createTestApp } from './utils/create-test-app';
import { resetDatabase } from './utils/database';

const API = '/api/v1';

const text = (value: string) => ({ type: 'text', text: value });
const doc = (...paragraphs: string[]) => ({
  type: 'doc',
  content: paragraphs.map((p) => ({ type: 'paragraph', content: [text(p)] })),
});

interface NoteBody {
  id: string;
  title: string;
  excerpt?: string;
  content?: unknown;
  isPinned: boolean;
  tags: { name: string }[];
  idea: { id: string } | null;
  project: { id: string } | null;
  updatedAt: string;
}

interface ResourceBody {
  id: string;
  title: string;
  domain: string;
  type: string;
  idea: { id: string } | null;
  project: { id: string } | null;
}

describe('Notes and resources (e2e)', () => {
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

  function as(token: string) {
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
  }

  const note = async (token: string, body: object = {}) =>
    (await as(token).post('/notes', body).expect(201)).body as NoteBody;
  const resource = async (token: string, body: object) =>
    (await as(token).post('/resources', body).expect(201)).body as ResourceBody;
  const idea = async (token: string, title = 'Garden idea') =>
    (await as(token).post('/ideas', { title }).expect(201)).body as {
      id: string;
    };
  const project = async (token: string, title = 'Garden app') =>
    (await as(token).post('/projects', { title }).expect(201)).body as {
      id: string;
    };
  const noteTitles = async (token: string, query = '') =>
    (
      (await as(token).get(`/notes${query}`).expect(200)).body
        .data as NoteBody[]
    ).map((n) => n.title);

  describe('notes', () => {
    it('creates an empty "Untitled note" with no fields at all', async () => {
      expect(await note(lucie)).toMatchObject({
        title: 'Untitled note',
        content: { type: 'doc', content: [] },
        isPinned: false,
        tags: [],
        idea: null,
        project: null,
      });
    });

    it('saves editor content, cleans it, and searches its text', async () => {
      const created = await note(lucie, {
        title: 'Launch plan',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              attrs: { onclick: 'alert(1)' },
              content: [text('Order compost before spring')],
            },
          ],
        },
        tags: ['garden'],
      });
      expect(created.content).toEqual(doc('Order compost before spring'));

      expect(await noteTitles(lucie, '?search=compo')).toEqual(['Launch plan']);
      const list = await as(lucie).get('/notes').expect(200);
      expect(list.body.data[0]).toMatchObject({
        excerpt: 'Order compost before spring',
      });
      expect(list.body.data[0].content).toBeUndefined(); // lists stay light
    });

    it.each([
      [
        'a javascript: link',
        {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'x',
                  marks: [
                    { type: 'link', attrs: { href: 'javascript:alert(1)' } },
                  ],
                },
              ],
            },
          ],
        },
        'Links in notes must start with',
      ],
      [
        'an iframe',
        { type: 'doc', content: [{ type: 'iframe' }] },
        'Unsupported',
      ],
      [
        'HTML text',
        '<script>alert(1)</script>',
        'content must be an editor document',
      ],
    ])('rejects %s', async (_label, content, message) => {
      const res = await as(lucie).post('/notes', { content }).expect(400);
      expect(String(res.body.message)).toContain(message);
    });

    it('accepts long notes (over the 100 KB default) but refuses huge ones', async () => {
      const long = doc(...Array.from({ length: 30 }, () => 'a'.repeat(5000)));
      await as(lucie).post('/notes', { content: long }).expect(201);

      const huge = doc(...Array.from({ length: 45 }, () => 'a'.repeat(5000)));
      const res = await as(lucie).post('/notes', { content: huge }).expect(400);
      expect(res.body.message).toContain('too long');
    });

    it('refuses requests over 300 KB with the usual JSON error', async () => {
      const tooBig = doc(...Array.from({ length: 80 }, () => 'a'.repeat(5000)));
      const res = await as(lucie)
        .post('/notes', { content: tooBig })
        .expect(413);
      expect(res.body).toMatchObject({ statusCode: 413 });
    });

    it('autosave: unchanged content does not change "last edited"', async () => {
      const created = await note(lucie, { content: doc('Hello') });
      const same = (
        await as(lucie)
          .patch(`/notes/${created.id}`, { content: doc('Hello') })
          .expect(200)
      ).body as NoteBody;
      expect(same.updatedAt).toBe(created.updatedAt);

      const edited = (
        await as(lucie)
          .patch(`/notes/${created.id}`, { content: doc('Hello world') })
          .expect(200)
      ).body as NoteBody;
      expect(edited.content).toEqual(doc('Hello world'));
      expect(edited.updatedAt).not.toBe(created.updatedAt);
    });

    it('lists pinned notes first, then the most recently edited', async () => {
      await note(lucie, { title: 'Old' });
      await note(lucie, { title: 'Pinned', isPinned: true });
      await note(lucie, { title: 'New' });

      expect(await noteTitles(lucie)).toEqual(['Pinned', 'New', 'Old']);
      expect(await noteTitles(lucie, '?pinned=true')).toEqual(['Pinned']);
    });
  });

  describe('attaching to an idea or a project', () => {
    it('attaches to one at a time, filters by it, and is kept when it is deleted', async () => {
      const i = await idea(lucie);
      const p = await project(lucie);
      const n = await note(lucie, { title: 'Research', ideaId: i.id });
      expect(n.idea?.id).toBe(i.id);

      // Attaching to a project detaches from the idea.
      const moved = (
        await as(lucie).patch(`/notes/${n.id}`, { projectId: p.id }).expect(200)
      ).body as NoteBody;
      expect(moved).toMatchObject({ idea: null, project: { id: p.id } });
      expect(await noteTitles(lucie, `?projectId=${p.id}`)).toEqual([
        'Research',
      ]);

      await as(lucie)
        .post('/notes', { ideaId: i.id, projectId: p.id })
        .expect(400);

      await as(lucie).delete(`/projects/${p.id}`).expect(204);
      const kept = (await as(lucie).get(`/notes/${n.id}`).expect(200))
        .body as NoteBody;
      expect(kept.project).toBeNull();
    });

    it('shows "added" on the project timeline', async () => {
      const p = await project(lucie);
      await note(lucie, { title: 'Meeting notes', projectId: p.id });
      await resource(lucie, {
        title: 'Soil guide',
        url: 'https://example.com/soil',
        projectId: p.id,
      });

      const activity = await as(lucie)
        .get(`/projects/${p.id}/activity`)
        .expect(200);
      expect(
        (activity.body as { action: string }[]).map((a) => a.action),
      ).toEqual(expect.arrayContaining(['note_added', 'resource_added']));
    });
  });

  describe('resources', () => {
    it('saves a link with its domain, filters by type and searches notes', async () => {
      const r = await resource(lucie, {
        title: 'Calm design talk',
        url: 'https://www.youtube.com/watch?v=abc',
        type: 'video',
        notes: 'Great section about whitespace',
        tags: ['design'],
      });
      expect(r).toMatchObject({ domain: 'youtube.com', type: 'video' });
      await resource(lucie, {
        title: 'Tiptap docs',
        url: 'https://tiptap.dev',
      });

      const videos = await as(lucie).get('/resources?type=video').expect(200);
      expect(videos.body.meta.total).toBe(1);
      const found = await as(lucie)
        .get('/resources?search=whitesp')
        .expect(200);
      expect(found.body.data[0].title).toBe('Calm design talk');
    });

    it.each(['javascript:alert(1)', 'ftp://example.com/file', 'example.com'])(
      'rejects the url %s',
      async (url) => {
        await as(lucie).post('/resources', { title: 'x', url }).expect(400);
      },
    );

    it('counts notes and resources on tags and categories', async () => {
      const category = (
        await as(lucie)
          .post('/categories', { name: 'Garden', color: 'emerald' })
          .expect(201)
      ).body as { id: string };
      await note(lucie, { tags: ['soil'], categoryId: category.id });
      await resource(lucie, {
        title: 'x',
        url: 'https://example.com',
        tags: ['soil'],
        categoryId: category.id,
      });

      const tags = await as(lucie).get('/tags').expect(200);
      expect(tags.body[0]).toMatchObject({
        name: 'soil',
        ideaCount: 0,
        noteCount: 1,
        resourceCount: 1,
      });
      const categories = await as(lucie).get('/categories').expect(200);
      expect(categories.body[0]).toMatchObject({
        noteCount: 1,
        resourceCount: 1,
      });
    });
  });

  describe('data isolation', () => {
    it("never shows, changes or deletes another user's notes and resources", async () => {
      const n = await note(lucie, { title: 'Private note' });
      const r = await resource(lucie, {
        title: 'Private link',
        url: 'https://example.com',
      });

      expect((await as(other).get('/notes').expect(200)).body.data).toEqual([]);
      expect((await as(other).get('/resources').expect(200)).body.data).toEqual(
        [],
      );
      for (const path of [`/notes/${n.id}`, `/resources/${r.id}`]) {
        await as(other).get(path).expect(404);
        await as(other).patch(path, { title: 'Hacked' }).expect(404);
        await as(other).delete(path).expect(404);
      }
    });

    it("can't attach to another user's idea, project or category", async () => {
      const theirIdea = await idea(other);
      const theirProject = await project(other);
      const theirCategory = (
        await as(other)
          .post('/categories', { name: 'Theirs', color: 'sky' })
          .expect(201)
      ).body as { id: string };

      await as(lucie).post('/notes', { ideaId: theirIdea.id }).expect(404);
      await as(lucie)
        .post('/resources', {
          title: 'x',
          url: 'https://example.com',
          projectId: theirProject.id,
        })
        .expect(404);
      await as(lucie)
        .post('/notes', { categoryId: theirCategory.id })
        .expect(404);
    });
  });
});
