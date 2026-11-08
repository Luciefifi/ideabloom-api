import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { todayIn } from '../src/modules/projects/progress';
import { registerMobileUser } from './utils/auth';
import { createTestApp } from './utils/create-test-app';
import { resetDatabase } from './utils/database';

const API = '/api/v1';

interface TaskBody {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  dueDate: string | null;
  completedAt: string | null;
  isOverdue: boolean;
  project: { id: string; title: string } | null;
  parentTaskId: string | null;
  subtasks: { completed: number; total: number };
  subtaskList: { id: string; title: string; status: string }[];
}

/** 'YYYY-MM-DD' n days from today in UTC (the test user's time zone). */
const day = (offset: number) =>
  new Date(
    new Date(`${todayIn('UTC')}T00:00:00Z`).getTime() + offset * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);

describe('Tasks (e2e)', () => {
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

  const task = async (token: string, body: object) =>
    (await as(token).post('/tasks', body).expect(201)).body as TaskBody;
  const project = async (token: string, title = 'Garden app') =>
    (await as(token).post('/projects', { title }).expect(201)).body as {
      id: string;
    };
  const titles = async (token: string, query = '') =>
    (
      (await as(token).get(`/tasks${query}`).expect(200)).body
        .data as TaskBody[]
    ).map((t) => t.title);

  describe('creating', () => {
    it('creates a standalone task with just a title', async () => {
      expect(await task(lucie, { title: '  Buy seeds ' })).toMatchObject({
        title: 'Buy seeds',
        status: 'todo',
        priority: null,
        dueDate: null,
        project: null,
        parentTaskId: null,
        subtasks: { completed: 0, total: 0 },
        subtaskList: [],
      });
    });

    it('creates subtasks inside the parent task’s project', async () => {
      const p = await project(lucie);
      const parent = await task(lucie, { title: 'Launch', projectId: p.id });

      const sub = await task(lucie, {
        title: 'Write post',
        parentTaskId: parent.id,
      });
      expect(sub).toMatchObject({
        parentTaskId: parent.id,
        project: { id: p.id },
      });

      const withSub = (await as(lucie).get(`/tasks/${parent.id}`).expect(200))
        .body as TaskBody;
      expect(withSub.subtaskList.map((s) => s.title)).toEqual(['Write post']);
      expect(withSub.subtasks).toEqual({ completed: 0, total: 1 });
    });

    it.each([
      [
        { title: 'x', startDate: '2026-12-31', dueDate: '2026-01-01' },
        "can't be before the start date",
      ],
      [{ title: 'x', dueDate: '2026-02-30' }, 'must be a real calendar date'],
      [{ title: 'x', status: 'finished' }, 'Status must be one of'],
      [{ title: '' }, 'Title is required'],
    ])('rejects %j', async (body, message) => {
      const res = await as(lucie).post('/tasks', body).expect(400);
      expect(String(res.body.message)).toContain(message);
    });

    it('keeps subtasks one level deep and in the parent’s project', async () => {
      const p = await project(lucie);
      const parent = await task(lucie, { title: 'Parent' });
      const child = await task(lucie, {
        title: 'Child',
        parentTaskId: parent.id,
      });

      const deeper = await as(lucie)
        .post('/tasks', { title: 'Grandchild', parentTaskId: child.id })
        .expect(400);
      expect(deeper.body.message).toBe(
        "Subtasks can't have their own subtasks.",
      );

      await as(lucie)
        .post('/tasks', {
          title: 'Elsewhere',
          parentTaskId: parent.id,
          projectId: p.id,
        })
        .expect(400);
    });
  });

  describe('views, filters and sorting', () => {
    beforeEach(async () => {
      const p = await project(lucie);
      await task(lucie, { title: 'Late', dueDate: day(-2), priority: 'low' });
      await task(lucie, { title: 'Today', dueDate: day(0), projectId: p.id });
      await task(lucie, {
        title: 'Soon urgent',
        dueDate: day(3),
        priority: 'urgent',
      });
      await task(lucie, {
        title: 'Soon low',
        dueDate: day(3),
        priority: 'low',
      });
      await task(lucie, { title: 'Someday' });
      await task(lucie, {
        title: 'Doing',
        status: 'in_progress',
        dueDate: day(10),
      });
      await task(lucie, {
        title: 'Done already',
        status: 'done',
        dueDate: day(-5),
      });
    });

    it('pending: soonest due first, same day by priority, undated last', async () => {
      expect(await titles(lucie)).toEqual([
        'Late',
        'Today',
        'Soon urgent',
        'Soon low',
        'Doing',
        'Someday',
      ]);
    });

    it.each([
      ['?view=overdue', ['Late']], // "Today" is due, not overdue
      ['?view=completed', ['Done already']], // done is never overdue
      [
        '?view=all&sort=title',
        [
          'Doing',
          'Done already',
          'Late',
          'Someday',
          'Soon low',
          'Soon urgent',
          'Today',
        ],
      ],
      ['?projectId=none&search=soon', ['Soon urgent', 'Soon low']],
      ['?priority=urgent', ['Soon urgent']],
      [
        '?sort=priority',
        ['Soon urgent', 'Late', 'Soon low', 'Today', 'Doing', 'Someday'],
      ],
    ])('%s', async (query, expected) => {
      expect(await titles(lucie, query)).toEqual(expected);
    });

    it('marks overdue tasks', async () => {
      const res = await as(lucie).get('/tasks').expect(200);
      const late = (res.body.data as TaskBody[]).find(
        (t) => t.title === 'Late',
      );
      const today = (res.body.data as TaskBody[]).find(
        (t) => t.title === 'Today',
      );
      expect(late?.isOverdue).toBe(true);
      expect(today?.isOverdue).toBe(false);
    });

    it('filters by project', async () => {
      const projects = await as(lucie).get('/projects').expect(200);
      expect(
        await titles(lucie, `?projectId=${projects.body.data[0].id}`),
      ).toEqual(['Today']);
    });
  });

  describe('completing and moving', () => {
    it('completing a task completes its open subtasks; reopening does not reopen them', async () => {
      const parent = await task(lucie, { title: 'Parent' });
      const a = await task(lucie, { title: 'A', parentTaskId: parent.id });
      await task(lucie, { title: 'B', parentTaskId: parent.id });
      await as(lucie).patch(`/tasks/${a.id}`, { status: 'done' }).expect(200);

      const done = (
        await as(lucie)
          .patch(`/tasks/${parent.id}`, { status: 'done' })
          .expect(200)
      ).body as TaskBody;
      expect(done.completedAt).not.toBeNull();
      expect(done.subtaskList.map((s) => s.status)).toEqual(['done', 'done']);

      const reopened = (
        await as(lucie)
          .patch(`/tasks/${parent.id}`, { status: 'todo' })
          .expect(200)
      ).body as TaskBody;
      expect(reopened.completedAt).toBeNull();
      expect(reopened.subtaskList.map((s) => s.status)).toEqual([
        'done',
        'done',
      ]);
    });

    it('moving a task to another project moves its subtasks; subtasks can’t move alone', async () => {
      const p1 = await project(lucie, 'One');
      const p2 = await project(lucie, 'Two');
      const parent = await task(lucie, { title: 'Parent', projectId: p1.id });
      const sub = await task(lucie, { title: 'Sub', parentTaskId: parent.id });

      await as(lucie)
        .patch(`/tasks/${parent.id}`, { projectId: p2.id })
        .expect(200);
      const movedSub = (await as(lucie).get(`/tasks/${sub.id}`).expect(200))
        .body as TaskBody;
      expect(movedSub.project?.id).toBe(p2.id);

      await as(lucie)
        .patch(`/tasks/${sub.id}`, { projectId: p1.id })
        .expect(400);
    });

    it('deleting a task deletes its subtasks', async () => {
      const parent = await task(lucie, { title: 'Parent' });
      const sub = await task(lucie, { title: 'Sub', parentTaskId: parent.id });

      await as(lucie).delete(`/tasks/${parent.id}`).expect(204);
      await as(lucie).get(`/tasks/${sub.id}`).expect(404);
    });
  });

  describe('project progress', () => {
    it('comes from top-level tasks once a project has tasks, else from milestones', async () => {
      const p = await project(lucie);
      await as(lucie).post(`/projects/${p.id}/milestones`, { title: 'M1' });
      const ms = (await as(lucie).get(`/projects/${p.id}`)).body
        .milestoneList[0].id as string;
      await as(lucie).patch(`/milestones/${ms}`, { completed: true });

      let res = await as(lucie).get(`/projects/${p.id}`).expect(200);
      expect(res.body.progress).toMatchObject({
        percent: 100,
        basis: 'milestones',
      });

      const t1 = await task(lucie, { title: 'T1', projectId: p.id });
      await task(lucie, { title: 'T2', projectId: p.id });
      await task(lucie, { title: 'T3', projectId: p.id });
      await task(lucie, { title: 'Subtask', parentTaskId: t1.id }); // doesn't count
      await as(lucie).patch(`/tasks/${t1.id}`, { status: 'done' });

      res = await as(lucie).get(`/projects/${p.id}`).expect(200);
      expect(res.body.progress).toEqual({
        percent: 33,
        basis: 'tasks',
        completed: 1,
        total: 3,
      });
      expect(res.body.tasks).toEqual({ completed: 1, total: 3 });

      const list = await as(lucie).get('/projects').expect(200);
      expect(list.body.data[0].progress.basis).toBe('tasks');
    });

    it('task completions appear on the project timeline; deleting the project deletes its tasks', async () => {
      const p = await project(lucie);
      const t = await task(lucie, { title: 'Ship it', projectId: p.id });
      await as(lucie).patch(`/tasks/${t.id}`, { status: 'done' });

      const activity = await as(lucie)
        .get(`/projects/${p.id}/activity`)
        .expect(200);
      expect(activity.body[0]).toMatchObject({
        action: 'task_completed',
        metadata: { task: 'Ship it' },
      });

      await as(lucie).delete(`/projects/${p.id}`).expect(204);
      await as(lucie).get(`/tasks/${t.id}`).expect(404);
    });
  });

  describe('data isolation', () => {
    it("never shows, changes or deletes another user's tasks", async () => {
      const mine = await task(lucie, { title: 'Private task' });

      expect(await titles(other, '?view=all')).toEqual([]);
      await as(other).get(`/tasks/${mine.id}`).expect(404);
      await as(other)
        .patch(`/tasks/${mine.id}`, { status: 'done' })
        .expect(404);
      await as(other).delete(`/tasks/${mine.id}`).expect(404);
    });

    it("can't add a subtask under, or a task into, another user's task or project", async () => {
      const theirTask = await task(other, { title: 'Theirs' });
      const theirProject = await project(other, 'Their project');
      const mine = await task(lucie, { title: 'Mine' });

      await as(lucie)
        .post('/tasks', { title: 'x', parentTaskId: theirTask.id })
        .expect(404);
      await as(lucie)
        .post('/tasks', { title: 'x', projectId: theirProject.id })
        .expect(404);
      await as(lucie)
        .patch(`/tasks/${mine.id}`, { projectId: theirProject.id })
        .expect(404);
    });
  });
});
