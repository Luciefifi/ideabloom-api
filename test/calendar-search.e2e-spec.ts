import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { addDays } from '../src/modules/dashboard/dashboard-dates';
import { todayIn } from '../src/modules/projects/progress';
import {
  HIGHLIGHT_END as E,
  HIGHLIGHT_START as S,
} from '../src/modules/search/search.constants';
import { registerMobileUser } from './utils/auth';
import { createTestApp } from './utils/create-test-app';
import { resetDatabase } from './utils/database';

const API = '/api/v1';

interface CalendarEvent {
  kind: string;
  title: string;
  date: string;
  done: boolean;
  overdue: boolean;
  project: { title: string } | null;
  parent: { title: string } | null;
}

interface Group {
  type: string;
  total: number;
  items: {
    id: string;
    title: string;
    snippet: string | null;
    status?: string;
    archived?: boolean;
    project?: { title: string } | null;
    url?: string;
  }[];
}

describe('Calendar and search (e2e)', () => {
  let app: INestApplication<App>;
  let lucie: string;
  let other: string;
  const day = (offset: number) => addDays(todayIn('UTC'), offset);

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
    (await as(token).post(path, body).expect(201)).body as { id: string };

  describe('GET /calendar', () => {
    const range = `?from=${day(-10)}&to=${day(20)}`;
    const events = async (token: string) =>
      (
        (await as(token).get(`/calendar${range}`).expect(200)).body as {
          events: CalendarEvent[];
        }
      ).events;

    it('shows tasks (subtasks too), milestones and project dates in date order', async () => {
      const p = await create(lucie, '/projects', {
        title: 'Garden app',
        startDate: day(-5),
        targetDate: day(15),
      });
      const parent = await create(lucie, '/tasks', {
        title: 'Calendar component',
        dueDate: day(2),
        projectId: p.id,
      });
      await create(lucie, '/tasks', {
        title: 'Month view',
        dueDate: day(1),
        parentTaskId: parent.id,
      });
      await create(lucie, '/tasks', { title: 'Late', dueDate: day(-1) });
      await create(lucie, '/tasks', {
        title: 'Done late',
        dueDate: day(-2),
        status: 'done',
      });
      await create(lucie, '/tasks', { title: 'Too far', dueDate: day(30) });
      await as(lucie)
        .post(`/projects/${p.id}/milestones`, {
          title: 'Beta',
          dueDate: day(8),
        })
        .expect(201);

      const result = await events(lucie);
      expect(
        result.map((e) => [e.kind, e.title, e.date, e.done, e.overdue]),
      ).toEqual([
        ['project_start', 'Garden app', day(-5), false, false], // starts are never overdue
        ['task', 'Done late', day(-2), true, false],
        ['task', 'Late', day(-1), false, true],
        ['task', 'Month view', day(1), false, false],
        ['task', 'Calendar component', day(2), false, false],
        ['milestone', 'Beta', day(8), false, false],
        ['project_target', 'Garden app', day(15), false, false],
      ]);
      const subtask = result.find((e) => e.title === 'Month view');
      expect(subtask).toMatchObject({
        parent: { title: 'Calendar component' },
        project: { title: 'Garden app' },
      });
    });

    it('leaves out cancelled projects and their milestones', async () => {
      const p = await create(lucie, '/projects', {
        title: 'Dropped',
        targetDate: day(3),
      });
      await as(lucie).post(`/projects/${p.id}/milestones`, {
        title: 'Never',
        dueDate: day(4),
      });
      await as(lucie).patch(`/projects/${p.id}`, { status: 'cancelled' });
      expect(await events(lucie)).toEqual([]);
    });

    it.each([
      ['?from=2026-11-01', 'to must be a date'],
      ['?from=2026-11-30&to=2026-11-01', "to can't be before from"],
      ['?from=2026-01-01&to=2026-03-31', 'at most 45 days'],
      ['?from=2026-02-30&to=2026-03-02', 'real calendar dates'],
    ])('rejects %s', async (query, message) => {
      const res = await as(lucie).get(`/calendar${query}`).expect(400);
      expect(String(res.body.message)).toContain(message);
    });

    it("never shows another user's dates", async () => {
      await create(other, '/tasks', { title: 'Theirs', dueDate: day(1) });
      expect(await events(lucie)).toEqual([]);
    });
  });

  describe('GET /search', () => {
    const search = async (token: string, query: string) =>
      (
        (await as(token).get(`/search?${query}`).expect(200)).body as {
          groups: Group[];
        }
      ).groups;
    const group = (groups: Group[], type: string) =>
      groups.find((g) => g.type === type) as Group;

    beforeEach(async () => {
      const p = await create(lucie, '/projects', {
        title: 'Garden booking app',
        goals: 'Gardeners book plots in under a minute.',
      });
      await create(lucie, '/ideas', {
        title: 'Community garden idea',
        description: 'Neighbours share tools and plots in the garden.',
      });
      const archived = await create(lucie, '/ideas', {
        title: 'Old garden calendar',
      });
      await as(lucie).post(`/ideas/${archived.id}/archive`).expect(200);
      await create(lucie, '/tasks', {
        title: 'Order garden hoses',
        projectId: p.id,
      });
      await create(lucie, '/notes', {
        title: 'Interview notes',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Most gardeners book on Sunday evening after dinner.',
                },
              ],
            },
          ],
        },
      });
      await create(lucie, '/resources', {
        title: 'Garden planning guide',
        url: 'https://example.com/garden',
        description: 'How to plan a shared garden.',
      });
    });

    it('finds matches in every kind of item, grouped in a fixed order', async () => {
      const groups = await search(lucie, 'q=gard');
      expect(groups.map((g) => [g.type, g.total])).toEqual([
        ['idea', 1], // the archived idea is left out
        ['project', 1],
        ['task', 1],
        ['note', 1], // matched inside the note's text ("gardeners")
        ['resource', 1],
      ]);
      expect(group(groups, 'task').items[0]).toMatchObject({
        status: 'todo',
        project: { title: 'Garden booking app' },
      });
      expect(group(groups, 'resource').items[0].url).toBe(
        'https://example.com/garden',
      );
    });

    it('marks matching words with special characters, never HTML', async () => {
      const groups = await search(lucie, 'q=gard&types=idea,note');
      const idea = group(groups, 'idea').items[0];
      expect(idea.title).toBe(`Community ${S}garden${E} idea`);
      expect(idea.snippet).toContain(`${S}garden${E}`);
      expect(idea.snippet).not.toMatch(/<\/?b>/);

      const note = group(groups, 'note').items[0];
      expect(note.title).toBe('Interview notes');
      expect(note.snippet).toContain(`${S}gardeners${E}`);
    });

    it('can include archived ideas and limit the types', async () => {
      const groups = await search(
        lucie,
        'q=garden&types=idea&includeArchived=true',
      );
      expect(groups).toHaveLength(1);
      expect(
        group(groups, 'idea')
          .items.map((i) => i.archived)
          .sort(),
      ).toEqual([false, true]);
    });

    it('ranks title matches first and respects the limit', async () => {
      await create(lucie, '/ideas', {
        title: 'Tools',
        description: 'Something about a garden.',
      });
      const ideas = group(
        await search(lucie, 'q=garden&types=idea&limit=1'),
        'idea',
      );
      expect(ideas.total).toBe(2);
      expect(ideas.items.map((i) => i.title)).toEqual([
        `Community ${S}garden${E} idea`,
      ]);
    });

    it('handles searches with nothing searchable, and rejects empty ones', async () => {
      const groups = await search(lucie, `q=${encodeURIComponent('!!! ???')}`);
      expect(groups.every((g) => g.total === 0)).toBe(true);
      await as(lucie).get('/search?q=%20%20').expect(400);
      await as(lucie).get('/search?q=x&types=idea,secret').expect(400);
    });

    it("never finds another user's items", async () => {
      const groups = await search(other, 'q=garden');
      expect(groups.every((g) => g.total === 0 && g.items.length === 0)).toBe(
        true,
      );
    });
  });
});
