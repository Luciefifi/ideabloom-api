import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { registerMobileUser } from './utils/auth';
import { createTestApp } from './utils/create-test-app';
import { resetDatabase } from './utils/database';

const API = '/api/v1';

interface MilestoneBody {
  id: string;
  title: string;
  dueDate: string | null;
  completedAt: string | null;
  isOverdue: boolean;
  position: number;
}
interface ProjectBody {
  id: string;
  progress: {
    percent: number;
    basis: string;
    completed: number;
    total: number;
  };
  milestones: { completed: number; total: number };
  milestoneList: MilestoneBody[];
}

describe('Milestones and project activity (e2e)', () => {
  let app: INestApplication<App>;
  let lucie: string;
  let other: string;
  let projectId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    lucie = (await registerMobileUser(app, { email: 'lucie@example.com' }))
      .accessToken;
    other = (await registerMobileUser(app, { email: 'other@example.com' }))
      .accessToken;
    projectId = (
      await as(lucie).post('/projects', { title: 'Garden app' }).expect(201)
    ).body.id as string;
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
      put: (path: string, body: object) =>
        auth(request(server).put(`${API}${path}`)).send(body),
      patch: (path: string, body: object) =>
        auth(request(server).patch(`${API}${path}`)).send(body),
      delete: (path: string) => auth(request(server).delete(`${API}${path}`)),
    };
  }

  const add = async (title: string, extra: object = {}) =>
    (
      await as(lucie)
        .post(`/projects/${projectId}/milestones`, { title, ...extra })
        .expect(201)
    ).body as ProjectBody;

  it('adds milestones in order and returns the updated project', async () => {
    await add('Design');
    const project = await add('Build', {
      dueDate: '2026-12-01',
      description: 'MVP',
    });

    expect(project.milestoneList.map((m) => [m.title, m.position])).toEqual([
      ['Design', 0],
      ['Build', 1],
    ]);
    expect(project.milestoneList[1]).toMatchObject({
      dueDate: '2026-12-01',
      completedAt: null,
    });
    expect(project.progress).toMatchObject({
      percent: 0,
      basis: 'milestones',
      total: 2,
    });
  });

  it('completing and reopening milestones updates progress', async () => {
    await add('One');
    await add('Two');
    const withThree = await add('Three');
    const [one, two] = withThree.milestoneList;

    await as(lucie)
      .patch(`/milestones/${one.id}`, { completed: true })
      .expect(200);
    const twoDone = (
      await as(lucie)
        .patch(`/milestones/${two.id}`, { completed: true })
        .expect(200)
    ).body as ProjectBody;
    expect(twoDone.progress).toMatchObject({
      percent: 67,
      completed: 2,
      total: 3,
    });
    expect(twoDone.milestones).toEqual({ completed: 2, total: 3 });
    expect(twoDone.milestoneList[0].completedAt).not.toBeNull();

    const reopened = (
      await as(lucie)
        .patch(`/milestones/${one.id}`, { completed: false })
        .expect(200)
    ).body as ProjectBody;
    expect(reopened.progress.percent).toBe(33);
    expect(reopened.milestoneList[0].completedAt).toBeNull();
  });

  it('edits and deletes a milestone', async () => {
    const [m] = (await add('Draft')).milestoneList;

    const edited = (
      await as(lucie)
        .patch(`/milestones/${m.id}`, { title: 'Final', dueDate: null })
        .expect(200)
    ).body as ProjectBody;
    expect(edited.milestoneList[0]).toMatchObject({
      title: 'Final',
      dueDate: null,
    });

    const after = (await as(lucie).delete(`/milestones/${m.id}`).expect(200))
      .body as ProjectBody;
    expect(after.milestoneList).toEqual([]);
    expect(after.progress.basis).toBe('none');
  });

  it('marks a past, unfinished milestone as overdue', async () => {
    const project = await add('Old', { dueDate: '2020-01-01' });
    expect(project.milestoneList[0].isOverdue).toBe(true);

    const done = (
      await as(lucie)
        .patch(`/milestones/${project.milestoneList[0].id}`, {
          completed: true,
        })
        .expect(200)
    ).body as ProjectBody;
    expect(done.milestoneList[0].isOverdue).toBe(false);
  });

  it('reorders milestones, but only with the complete list', async () => {
    await add('A');
    await add('B');
    const ids = (await add('C')).milestoneList.map((m) => m.id); // A, B, C

    const reordered = (
      await as(lucie)
        .put(`/projects/${projectId}/milestones/order`, {
          milestoneIds: [ids[2], ids[0], ids[1]],
        })
        .expect(200)
    ).body as ProjectBody;
    expect(reordered.milestoneList.map((m) => m.title)).toEqual([
      'C',
      'A',
      'B',
    ]);

    await as(lucie)
      .put(`/projects/${projectId}/milestones/order`, {
        milestoneIds: [ids[0], ids[1]],
      })
      .expect(400);
    await as(lucie)
      .put(`/projects/${projectId}/milestones/order`, {
        milestoneIds: [ids[0], ids[0], ids[1]],
      })
      .expect(400);
  });

  it.each([
    [{ title: '' }, 'Title is required'],
    [{ title: 'x', dueDate: '2026-13-01' }, 'must be a real calendar date'],
    [{ title: 'x', projectId: 'abc' }, 'property projectId should not exist'],
  ])('rejects %j', async (body, message) => {
    const res = await as(lucie)
      .post(`/projects/${projectId}/milestones`, body)
      .expect(400);
    expect(String(res.body.message)).toContain(message);
  });

  it('keeps a project history, newest first', async () => {
    const [m] = (await add('Launch')).milestoneList;
    await as(lucie).patch(`/milestones/${m.id}`, { completed: true });
    await as(lucie).patch(`/projects/${projectId}`, { status: 'in_progress' });

    const res = await as(lucie)
      .get(`/projects/${projectId}/activity`)
      .expect(200);
    const entries = res.body as {
      action: string;
      metadata: Record<string, string>;
    }[];

    expect(entries.map((e) => e.action)).toEqual([
      'status_changed',
      'milestone_completed',
      'milestone_added',
      'created',
    ]);
    expect(entries[1].metadata).toEqual({ milestone: 'Launch' });
  });

  describe('data isolation', () => {
    it("can't add to, change, reorder or see the history of another user's project", async () => {
      const [m] = (await add('Mine')).milestoneList;

      await as(other)
        .post(`/projects/${projectId}/milestones`, { title: 'X' })
        .expect(404);
      await as(other)
        .patch(`/milestones/${m.id}`, { completed: true })
        .expect(404);
      await as(other).delete(`/milestones/${m.id}`).expect(404);
      await as(other)
        .put(`/projects/${projectId}/milestones/order`, {
          milestoneIds: [m.id],
        })
        .expect(404);
      await as(other).get(`/projects/${projectId}/activity`).expect(404);

      const still = (await as(lucie).get(`/projects/${projectId}`).expect(200))
        .body as ProjectBody;
      expect(still.milestoneList.map((x) => [x.title, x.completedAt])).toEqual([
        ['Mine', null],
      ]);
    });
  });
});
