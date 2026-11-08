import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ListProjectsQueryDto } from '../projects/dto/project.dto';
import { CLOSED_PROJECT_STATUSES } from '../projects/project.constants';
import { todayIn } from '../projects/progress';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { addDays, lastWeekStarts } from './dashboard-dates';
import type {
  DashboardResponseDto,
  DeadlineDto,
  DeadlineKind,
} from './dto/dashboard.dto';

const UPCOMING_DAYS = 14;
const WEEKS = 8;
const MAX_OVERDUE = 10;
const MAX_UPCOMING = 20;

/** A time zone PostgreSQL and Intl both understand, else UTC. */
function safeTimeZone(zone: string | null | undefined): string {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone ?? 'UTC' });
    return zone ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

interface DeadlineRow {
  kind: DeadlineKind;
  id: string;
  title: string;
  date: string;
  project_id: string | null;
  project_title: string | null;
}

/**
 * Everything due, from three tables: open top-level tasks, open milestones,
 * and target dates of projects that aren't finished. $1 = user, $2/$3 = date range.
 * Every part is filtered by user_id.
 */
const DEADLINES_SQL = `
  SELECT 'task' AS kind, t.id, t.title, t.due_date::text AS date,
         p.id AS project_id, p.title AS project_title
    FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
   WHERE t.user_id = $1 AND t.parent_task_id IS NULL AND t.status <> 'done'
     AND t.due_date >= $2 AND t.due_date <= $3
  UNION ALL
  SELECT 'milestone', m.id, m.title, m.due_date::text, p.id, p.title
    FROM milestones m JOIN projects p ON p.id = m.project_id
   WHERE m.user_id = $1 AND m.completed_at IS NULL
     AND p.status NOT IN ('completed', 'cancelled')
     AND m.due_date >= $2 AND m.due_date <= $3
  UNION ALL
  SELECT 'project', p.id, p.title, p.target_date::text, p.id, p.title
    FROM projects p
   WHERE p.user_id = $1 AND p.status NOT IN ('completed', 'cancelled')
     AND p.target_date >= $2 AND p.target_date <= $3
  ORDER BY date, kind, title
  LIMIT $4`;

@Injectable()
export class DashboardService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly projects: ProjectsService,
    private readonly users: UsersService,
  ) {}

  async get(userId: string): Promise<DashboardResponseDto> {
    const user = await this.users.findById(userId);
    const timeZone = safeTimeZone(user?.timezone);
    const today = todayIn(timeZone);
    const upcomingUntil = addDays(today, UPCOMING_DAYS - 1);
    const weeks = lastWeekStarts(today, WEEKS);

    const [ideas, projects, tasks, overdue, upcoming, activeProjects, perWeek] =
      await Promise.all([
        this.ideaCounts(userId),
        this.projectCounts(userId),
        this.taskCounts(userId, today),
        this.deadlines(userId, '0001-01-01', addDays(today, -1), MAX_OVERDUE),
        this.deadlines(userId, today, upcomingUntil, MAX_UPCOMING),
        this.projects.findAll(
          userId,
          Object.assign(new ListProjectsQueryDto(), {
            scope: 'active',
            sort: 'updatedAt',
            page: 1,
            pageSize: 5,
          }),
        ),
        this.completedPerWeek(userId, timeZone, weeks[0]),
      ]);

    return {
      today,
      upcomingUntil,
      ideas,
      projects,
      tasks,
      deadlines: { overdue, upcoming },
      activeProjects: activeProjects.data,
      completedPerWeek: weeks.map((weekStart) => ({
        weekStart,
        count: perWeek.get(weekStart) ?? 0,
      })),
    };
  }

  private async ideaCounts(
    userId: string,
  ): Promise<DashboardResponseDto['ideas']> {
    const rows: { status: string; count: number }[] =
      await this.dataSource.query(
        `SELECT status, COUNT(*)::int AS count FROM ideas
          WHERE user_id = $1 AND archived_at IS NULL GROUP BY status`,
        [userId],
      );
    const byStatus = { inbox: 0, exploring: 0, planned: 0, converted: 0 };
    for (const row of rows) {
      if (row.status in byStatus) {
        byStatus[row.status as keyof typeof byStatus] = Number(row.count);
      }
    }
    return {
      active: byStatus.inbox + byStatus.exploring + byStatus.planned,
      byStatus,
    };
  }

  private async projectCounts(
    userId: string,
  ): Promise<DashboardResponseDto['projects']> {
    const [row]: { active: number; completed: number }[] =
      await this.dataSource.query(
        `SELECT COUNT(*) FILTER (WHERE NOT (status = ANY($2)))::int AS active,
                COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
           FROM projects WHERE user_id = $1`,
        [userId, CLOSED_PROJECT_STATUSES],
      );
    return { active: Number(row.active), completed: Number(row.completed) };
  }

  private async taskCounts(
    userId: string,
    today: string,
  ): Promise<DashboardResponseDto['tasks']> {
    const [row]: { pending: number; overdue: number; due_today: number }[] =
      await this.dataSource.query(
        `SELECT COUNT(*)::int AS pending,
                COUNT(*) FILTER (WHERE due_date < $2)::int AS overdue,
                COUNT(*) FILTER (WHERE due_date = $2)::int AS due_today
           FROM tasks
          WHERE user_id = $1 AND parent_task_id IS NULL AND status <> 'done'`,
        [userId, today],
      );
    return {
      pending: Number(row.pending),
      overdue: Number(row.overdue),
      dueToday: Number(row.due_today),
    };
  }

  private async deadlines(
    userId: string,
    from: string,
    to: string,
    limit: number,
  ): Promise<DeadlineDto[]> {
    const rows: DeadlineRow[] = await this.dataSource.query(DEADLINES_SQL, [
      userId,
      from,
      to,
      limit,
    ]);
    return rows.map((row) => ({
      kind: row.kind,
      id: row.id,
      title: row.title,
      date: row.date,
      project:
        row.project_id && row.project_title
          ? { id: row.project_id, title: row.project_title }
          : null,
    }));
  }

  /** Completed top-level tasks per week (Monday start), in the user's time zone. */
  private async completedPerWeek(
    userId: string,
    timeZone: string,
    firstWeek: string,
  ): Promise<Map<string, number>> {
    const rows: { week: string; count: number }[] = await this.dataSource.query(
      `SELECT date_trunc('week', completed_at AT TIME ZONE $2)::date::text AS week,
              COUNT(*)::int AS count
         FROM tasks
        WHERE user_id = $1 AND parent_task_id IS NULL AND status = 'done'
          AND completed_at IS NOT NULL
          AND (completed_at AT TIME ZONE $2)::date >= $3::date
        GROUP BY 1`,
      [userId, timeZone, firstWeek],
    );
    return new Map(rows.map((r) => [r.week, Number(r.count)]));
  }
}
