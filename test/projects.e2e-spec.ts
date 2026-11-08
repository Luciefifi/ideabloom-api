import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { Milestone } from '../src/modules/projects/entities/milestone.entity';
import { todayIn } from '../src/modules/projects/progress';
import { registerMobileUser } from './utils/auth';
import { createTestApp } from './utils/create-test-app';
import { resetDatabase } from './utils/database';

const API = '/api/v1';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

interface ProjectBody {
  id: string;
  title: string;
  status: string;
  startDate: string | null;
  targetDate: string | null;
  completedAt: string | null;
  isOverdue: boolean;
  progress: {
    percent: number;
    basis: string;
    completed: number;
    total: number;
  };
  milestones: { completed: number; total: number };
  sourceIdea: { id: string; title: string } | null;
  relatedIdeas: { id: string; title: string }[];
}

/** 'YYYY-MM-DD' n days from today (UTC). */
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe('Projects (e2e)', () => {
  let app: INestApplication<App>;
  let lucie: string;
  let lucieId: string;
  let other: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    const a = await registerMobileUser(app, { email: 'lucie@example.com' });
    lucie = a.accessToken;
    lucieId = a.user.id;
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

  const createProject = async (token: string, body: object) =>
    (await as(token).post('/projects', body).expect(201)).body as ProjectBody;

  const titles = async (token: string, query = '') =>
    (
      (await as(token).get(`/projects${query}`).expect(200)).body
        .data as ProjectBody[]
    ).map((p) => p.title);

  const addMilestones = (projectId: string, done: number, open: number) =>
    app
      .get(DataSource)
      .getRepository(Milestone)
      .insert(
        Array.from({ length: done + open }, (_, i) => ({
          projectId,
          userId: lucieId,
          title: `M${i}`,
          position: i,
          completedAt: i < done ? new Date() : null,
        })),
      );

  describe('creating and updating', () => {
    it('creates with just a title', async () => {
      const project = await createProject(lucie, { title: '  Garden app ' });

      expect(project).toMatchObject({
        title: 'Garden app',
        status: 'not_started',
        startDate: null,
        targetDate: null,
        isOverdue: false,
        progress: { percent: 0, basis: 'none', completed: 0, total: 0 },
        sourceIdea: null,
        relatedIdeas: [],
      });
    });

    it('stores plain dates exactly as sent (no time-zone shift)', async () => {
      const project = await createProject(lucie, {
        title: 'Dated',
        goals: 'Launch a beta',
        startDate: '2026-11-10',
        targetDate: '2026-12-31',
      });

      expect(project).toMatchObject({
        goals: 'Launch a beta',
        startDate: '2026-11-10',
        targetDate: '2026-12-31',
      });
    });

    it.each([
      [
        { title: 'x', startDate: '2026-12-31', targetDate: '2026-01-01' },
        "can't be before the start date",
      ],
      [
        { title: 'x', targetDate: '2026-02-30' },
        'must be a real calendar date',
      ],
      [
        { title: 'x', targetDate: '31/12/2026' },
        'must be a date like 2026-12-31',
      ],
      [{ title: 'x', status: 'done' }, 'Status must be one of'],
      [{ title: '' }, 'Title is required'],
    ])('rejects %j', async (body, message) => {
      const res = await as(lucie).post('/projects', body).expect(400);
      expect(String(res.body.message)).toContain(message);
    });

    it('also checks date order when only one date changes', async () => {
      const project = await createProject(lucie, {
        title: 'P',
        startDate: '2026-11-10',
      });

      await as(lucie)
        .patch(`/projects/${project.id}`, { targetDate: '2026-11-01' })
        .expect(400);
    });

    it('records when a project is completed, and clears it when reopened', async () => {
      const project = await createProject(lucie, { title: 'Finish me' });
      await addMilestones(project.id, 1, 3);

      const done = (
        await as(lucie)
          .patch(`/projects/${project.id}`, { status: 'completed' })
          .expect(200)
      ).body as ProjectBody;
      expect(done.completedAt).not.toBeNull();
      expect(done.progress.percent).toBe(100); // completed is always 100%

      const reopened = (
        await as(lucie)
          .patch(`/projects/${project.id}`, { status: 'in_progress' })
          .expect(200)
      ).body as ProjectBody;
      expect(reopened.completedAt).toBeNull();
      expect(reopened.progress).toMatchObject({
        percent: 25,
        basis: 'milestones',
      });
    });

    it("refuses another user's category", async () => {
      const theirs = (await as(other).post('/categories', { name: 'Theirs' }))
        .body as {
        id: string;
      };
      await as(lucie)
        .post('/projects', { title: 'P', categoryId: theirs.id })
        .expect(404);
    });
  });

  describe('listing', () => {
    beforeEach(async () => {
      const a = await createProject(lucie, {
        title: 'Alpha',
        targetDate: day(30),
      });
      await addMilestones(a.id, 1, 1); // 50%
      const b = await createProject(lucie, {
        title: 'Beta',
        status: 'in_progress',
      });
      await addMilestones(b.id, 3, 1); // 75%
      await createProject(lucie, { title: 'Gamma', targetDate: day(5) });
      await createProject(lucie, { title: 'Done', status: 'completed' });
      await createProject(lucie, { title: 'Dropped', status: 'cancelled' });
    });

    it('shows active projects by default, all with scope=all', async () => {
      expect((await titles(lucie)).sort()).toEqual(['Alpha', 'Beta', 'Gamma']);
      expect(await titles(lucie, '?scope=all')).toHaveLength(5);
      expect(await titles(lucie, '?status=completed')).toEqual(['Done']);
    });

    it.each([
      ['?sort=title', ['Alpha', 'Beta', 'Gamma']],
      ['?sort=targetDate', ['Gamma', 'Alpha', 'Beta']], // no date last
      ['?sort=progress', ['Beta', 'Alpha', 'Gamma']],
      ['?search=amm', ['Gamma']],
      ['?search=100%25', []], // "%" is a normal character, not a wildcard
    ])('%s', async (query, expected) => {
      expect(await titles(lucie, query)).toEqual(expected);
    });

    it('includes progress and milestone counts in the list', async () => {
      const res = await as(lucie).get('/projects?sort=title').expect(200);
      expect(res.body.data[1]).toMatchObject({
        title: 'Beta',
        progress: { percent: 75, basis: 'milestones', completed: 3, total: 4 },
        milestones: { completed: 3, total: 4 },
      });
      expect(res.body.meta).toMatchObject({ total: 3, page: 1 });
    });
  });

  describe('overdue', () => {
    it("uses the user's own time zone", async () => {
      await as(lucie).patch('/users/me', { timezone: 'Pacific/Kiritimati' }); // UTC+14
      const yesterdayThere = new Date(
        new Date(`${todayIn('Pacific/Kiritimati')}T00:00:00Z`).getTime() -
          86_400_000,
      )
        .toISOString()
        .slice(0, 10);

      const late = await createProject(lucie, {
        title: 'Late',
        targetDate: yesterdayThere,
      });
      const today = await createProject(lucie, {
        title: 'Due today',
        targetDate: todayIn('Pacific/Kiritimati'),
      });
      const done = await createProject(lucie, {
        title: 'Done late',
        status: 'completed',
        targetDate: yesterdayThere,
      });

      expect(late.isOverdue).toBe(true);
      expect(today.isOverdue).toBe(false);
      expect(done.isOverdue).toBe(false);
    });
  });

  describe('converting an idea', () => {
    it('creates a project from the idea and marks the idea as converted', async () => {
      const category = (await as(lucie).post('/categories', { name: 'Health' }))
        .body as {
        id: string;
      };
      const idea = (
        await as(lucie)
          .post('/ideas', {
            title: 'Plant app',
            description: 'Reminders',
            priority: 'high',
            categoryId: category.id,
          })
          .expect(201)
      ).body as { id: string };

      const project = (
        await as(lucie)
          .post(`/ideas/${idea.id}/convert`, { targetDate: '2026-12-31' })
          .expect(201)
      ).body as ProjectBody & {
        description: string;
        priority: string;
        category: { id: string };
      };

      expect(project).toMatchObject({
        title: 'Plant app',
        description: 'Reminders',
        priority: 'high',
        status: 'planning',
        targetDate: '2026-12-31',
        category: { id: category.id },
        sourceIdea: { id: idea.id, title: 'Plant app' },
      });
      expect(project.relatedIdeas.map((i) => i.id)).toEqual([idea.id]);

      const after = await as(lucie).get(`/ideas/${idea.id}`).expect(200);
      expect(after.body).toMatchObject({
        status: 'converted',
        project: { id: project.id, title: 'Plant app' },
      });

      const activity = await as(lucie).get('/activity').expect(200);
      expect(
        (activity.body as { entityType: string; action: string }[])
          .slice(0, 2)
          .map((a) => `${a.entityType}:${a.action}`),
      ).toEqual(['project:created', 'idea:converted']);

      // Can't convert twice, and the idea's status is now locked.
      await as(lucie).post(`/ideas/${idea.id}/convert`).expect(409);
      await as(lucie)
        .patch(`/ideas/${idea.id}`, { status: 'planned' })
        .expect(400);
    });

    it("can't convert another user's idea", async () => {
      const theirs = (await as(other).post('/ideas', { title: 'Theirs' }))
        .body as { id: string };
      await as(lucie).post(`/ideas/${theirs.id}/convert`).expect(404);
    });

    it('deleting the project returns the idea to "planned" and keeps it', async () => {
      const idea = (await as(lucie).post('/ideas', { title: 'Comeback' }))
        .body as { id: string };
      const project = (await as(lucie).post(`/ideas/${idea.id}/convert`))
        .body as ProjectBody;
      await addMilestones(project.id, 0, 2);

      await as(lucie).delete(`/projects/${project.id}`).expect(204);

      const after = await as(lucie).get(`/ideas/${idea.id}`).expect(200);
      expect(after.body).toMatchObject({ status: 'planned', project: null });
      const left = await app.get(DataSource).getRepository(Milestone).count();
      expect(left).toBe(0); // milestones deleted with the project
    });
  });

  describe('related ideas', () => {
    it('links and unlinks ideas (but not the idea it came from)', async () => {
      const source = (await as(lucie).post('/ideas', { title: 'Source' }))
        .body as { id: string };
      const project = (await as(lucie).post(`/ideas/${source.id}/convert`))
        .body as ProjectBody;
      const extra = (await as(lucie).post('/ideas', { title: 'Extra' }))
        .body as { id: string };

      const linked = (
        await as(lucie)
          .post(`/projects/${project.id}/ideas`, { ideaId: extra.id })
          .expect(201)
      ).body as ProjectBody;
      expect(linked.relatedIdeas.map((i) => i.title)).toEqual([
        'Extra',
        'Source',
      ]);

      const unlinked = (
        await as(lucie)
          .delete(`/projects/${project.id}/ideas/${extra.id}`)
          .expect(200)
      ).body as ProjectBody;
      expect(unlinked.relatedIdeas.map((i) => i.title)).toEqual(['Source']);

      await as(lucie)
        .delete(`/projects/${project.id}/ideas/${source.id}`)
        .expect(400);
    });

    it("can't link another user's idea, or link to another user's project", async () => {
      const mine = await createProject(lucie, { title: 'Mine' });
      const theirIdea = (await as(other).post('/ideas', { title: 'Theirs' }))
        .body as {
        id: string;
      };
      const myIdea = (await as(lucie).post('/ideas', { title: 'My idea' }))
        .body as {
        id: string;
      };
      const theirProject = await createProject(other, {
        title: 'Their project',
      });

      await as(lucie)
        .post(`/projects/${mine.id}/ideas`, { ideaId: theirIdea.id })
        .expect(404);
      await as(lucie)
        .post(`/projects/${theirProject.id}/ideas`, { ideaId: myIdea.id })
        .expect(404);
    });
  });

  describe('data isolation', () => {
    it("never shows, changes or deletes another user's project", async () => {
      const mine = await createProject(lucie, { title: 'Private project' });

      expect(await titles(other, '?scope=all')).toEqual([]);
      await as(other).get(`/projects/${mine.id}`).expect(404);
      await as(other)
        .patch(`/projects/${mine.id}`, { title: 'Hacked' })
        .expect(404);
      await as(other).delete(`/projects/${mine.id}`).expect(404);

      const still = await as(lucie).get(`/projects/${mine.id}`).expect(200);
      expect(still.body.title).toBe('Private project');
    });

    it('404 for a missing project, 400 for a malformed id, 401 without login', async () => {
      await as(lucie).get(`/projects/${MISSING_ID}`).expect(404);
      await as(lucie).get('/projects/abc').expect(400);
      await request(app.getHttpServer()).get(`${API}/projects`).expect(401);
    });
  });
});
