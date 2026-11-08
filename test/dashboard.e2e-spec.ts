import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import {
  addDays,
  lastWeekStarts,
} from '../src/modules/dashboard/dashboard-dates';
import { todayIn } from '../src/modules/projects/progress';
import { registerMobileUser } from './utils/auth';
import { createTestApp } from './utils/create-test-app';
import { resetDatabase } from './utils/database';

const API = '/api/v1';

interface Dashboard {
  today: string;
  upcomingUntil: string;
  ideas: { active: number; byStatus: Record<string, number> };
  projects: { active: number; completed: number };
  tasks: { pending: number; overdue: number; dueToday: number };
  deadlines: {
    overdue: { kind: string; title: string; date: string }[];
    upcoming: {
      kind: string;
      title: string;
      date: string;
      project: { title: string } | null;
    }[];
  };
  activeProjects: { title: string; progress: { percent: number } }[];
  completedPerWeek: { weekStart: string; count: number }[];
}

describe('Dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let lucie: string;
  let other: string;
  const today = () => todayIn('UTC');
  const day = (offset: number) => addDays(today(), offset);

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
    };
  }
  const create = async (token: string, path: string, body: object) =>
    (await as(token).post(path, body).expect(201)).body as {
      id: string;
      milestoneList?: { id: string }[];
    };
  const dashboard = async (token: string) =>
    (await as(token).get('/dashboard').expect(200)).body as Dashboard;

  it('works for a brand-new account (all zeros, 8 empty weeks)', async () => {
    const d = await dashboard(lucie);
    expect(d).toMatchObject({
      today: today(),
      upcomingUntil: day(13),
      ideas: {
        active: 0,
        byStatus: { inbox: 0, exploring: 0, planned: 0, converted: 0 },
      },
      projects: { active: 0, completed: 0 },
      tasks: { pending: 0, overdue: 0, dueToday: 0 },
      deadlines: { overdue: [], upcoming: [] },
      activeProjects: [],
    });
    expect(d.completedPerWeek).toEqual(
      lastWeekStarts(today(), 8).map((weekStart) => ({ weekStart, count: 0 })),
    );
  });

  it('counts ideas, projects and top-level tasks', async () => {
    await create(lucie, '/ideas', { title: 'A' });
    await create(lucie, '/ideas', { title: 'B', status: 'exploring' });
    const archived = await create(lucie, '/ideas', { title: 'Old' });
    await as(lucie).post(`/ideas/${archived.id}/archive`).expect(200);
    const toConvert = await create(lucie, '/ideas', { title: 'Big one' });
    await as(lucie).post(`/ideas/${toConvert.id}/convert`, {}).expect(201);

    const done = await create(lucie, '/projects', { title: 'Done project' });
    await as(lucie).patch(`/projects/${done.id}`, { status: 'completed' });

    const parent = await create(lucie, '/tasks', {
      title: 'Late',
      dueDate: day(-1),
    });
    await create(lucie, '/tasks', { title: 'Sub', parentTaskId: parent.id });
    await create(lucie, '/tasks', { title: 'Today', dueDate: day(0) });
    await create(lucie, '/tasks', { title: 'Done', status: 'done' });

    const d = await dashboard(lucie);
    expect(d.ideas).toEqual({
      active: 2,
      byStatus: { inbox: 1, exploring: 1, planned: 0, converted: 1 },
    });
    expect(d.projects).toEqual({ active: 1, completed: 1 }); // the converted idea's project
    expect(d.tasks).toEqual({ pending: 2, overdue: 1, dueToday: 1 });
  });

  it('lists deadlines: overdue first, then the next 14 days in date order', async () => {
    const p = await create(lucie, '/projects', {
      title: 'Garden app',
      targetDate: day(10),
    });
    await create(lucie, '/tasks', { title: 'Late task', dueDate: day(-3) });
    await create(lucie, '/tasks', {
      title: 'Done late task',
      dueDate: day(-2),
      status: 'done',
    });
    await create(lucie, '/tasks', {
      title: 'Due today',
      dueDate: day(0),
      projectId: p.id,
    });
    await create(lucie, '/tasks', { title: 'Too far', dueDate: day(14) });
    await as(lucie)
      .post(`/projects/${p.id}/milestones`, { title: 'Beta', dueDate: day(5) })
      .expect(201);

    const cancelled = await create(lucie, '/projects', {
      title: 'Dropped',
      targetDate: day(3),
    });
    await as(lucie).post(`/projects/${cancelled.id}/milestones`, {
      title: 'Never',
      dueDate: day(4),
    });
    await as(lucie).patch(`/projects/${cancelled.id}`, { status: 'cancelled' });

    const d = await dashboard(lucie);
    expect(d.deadlines.overdue.map((x) => x.title)).toEqual(['Late task']);
    expect(d.deadlines.upcoming).toEqual([
      {
        kind: 'task',
        id: expect.any(String) as string,
        title: 'Due today',
        date: day(0),
        project: { id: p.id, title: 'Garden app' },
      },
      expect.objectContaining({
        kind: 'milestone',
        title: 'Beta',
        date: day(5),
      }),
      expect.objectContaining({
        kind: 'project',
        title: 'Garden app',
        date: day(10),
      }),
    ]);
  });

  it('shows active projects with progress', async () => {
    const p = await create(lucie, '/projects', { title: 'Garden app' });
    const t = await create(lucie, '/tasks', { title: 'T', projectId: p.id });
    await create(lucie, '/tasks', { title: 'U', projectId: p.id });
    await as(lucie).patch(`/tasks/${t.id}`, { status: 'done' });

    const d = await dashboard(lucie);
    expect(d.activeProjects).toEqual([
      expect.objectContaining({
        title: 'Garden app',
        progress: expect.objectContaining({ percent: 50 }) as unknown,
      }),
    ]);
  });

  it('counts completed tasks per week (Monday start)', async () => {
    const a = await create(lucie, '/tasks', { title: 'This week' });
    const b = await create(lucie, '/tasks', { title: 'Weeks ago' });
    const c = await create(lucie, '/tasks', { title: 'Long ago' });
    for (const t of [a, b, c]) {
      await as(lucie).patch(`/tasks/${t.id}`, { status: 'done' });
    }
    const weeks = lastWeekStarts(today(), 8);
    const db = app.get(DataSource);
    await db.query(`UPDATE tasks SET completed_at = $2 WHERE id = $1`, [
      b.id,
      `${weeks[5]}T09:00:00Z`,
    ]);
    await db.query(`UPDATE tasks SET completed_at = $2 WHERE id = $1`, [
      c.id,
      `${addDays(weeks[0], -1)}T09:00:00Z`, // the Sunday before the chart starts
    ]);

    const counts = (await dashboard(lucie)).completedPerWeek.map(
      (w) => w.count,
    );
    expect(counts).toEqual([0, 0, 0, 0, 0, 1, 0, 1]);
  });

  it("uses the user's time zone for today", async () => {
    await as(lucie)
      .patch('/users/me', { timezone: 'Pacific/Kiritimati' })
      .expect(200);
    const d = await dashboard(lucie);
    expect(d.today).toBe(todayIn('Pacific/Kiritimati'));
    expect(d.upcomingUntil).toBe(addDays(d.today, 13));
  });

  it("never includes another user's data", async () => {
    await create(other, '/ideas', { title: 'Theirs' });
    const p = await create(other, '/projects', {
      title: 'Their project',
      targetDate: day(2),
    });
    await create(other, '/tasks', {
      title: 'Their task',
      dueDate: day(-1),
      projectId: p.id,
    });

    const d = await dashboard(lucie);
    expect(d.ideas.active).toBe(0);
    expect(d.projects.active).toBe(0);
    expect(d.tasks.pending).toBe(0);
    expect(d.deadlines).toEqual({ overdue: [], upcoming: [] });
    expect(d.activeProjects).toEqual([]);
  });

  it('requires login', async () => {
    await request(app.getHttpServer()).get(`${API}/dashboard`).expect(401);
  });
});
