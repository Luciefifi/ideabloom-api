import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProjectsService } from '../projects/projects.service';
import {
  CALENDAR_MAX_DAYS,
  CalendarEventKind,
  CalendarQueryDto,
  CalendarResponseDto,
} from './dto/calendar.dto';

interface EventRow {
  kind: CalendarEventKind;
  id: string;
  title: string;
  date: string;
  done: boolean;
  project_id: string | null;
  project_title: string | null;
  parent_id: string | null;
  parent_title: string | null;
}

/** A real calendar day ('2026-02-30' is not). */
function isRealDay(day: string): boolean {
  const date = new Date(`${day}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(day);
}

const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
      86_400_000,
  );

/**
 * Everything with a date between $2 and $3 for user $1: tasks (subtasks too),
 * milestones, and project start/target dates. Cancelled projects (and their
 * milestones) are left out, like on the dashboard. Every part filters by user_id.
 */
const EVENTS_SQL = `
  SELECT 'task' AS kind, t.id, t.title, t.due_date::text AS date,
         t.status = 'done' AS done,
         p.id AS project_id, p.title AS project_title,
         parent.id AS parent_id, parent.title AS parent_title
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN tasks parent ON parent.id = t.parent_task_id
   WHERE t.user_id = $1 AND t.due_date BETWEEN $2 AND $3
  UNION ALL
  SELECT 'milestone', m.id, m.title, m.due_date::text, m.completed_at IS NOT NULL,
         p.id, p.title, NULL, NULL
    FROM milestones m JOIN projects p ON p.id = m.project_id
   WHERE m.user_id = $1 AND p.status <> 'cancelled'
     AND m.due_date BETWEEN $2 AND $3
  UNION ALL
  SELECT 'project_start', p.id, p.title, p.start_date::text, p.status = 'completed',
         p.id, p.title, NULL, NULL
    FROM projects p
   WHERE p.user_id = $1 AND p.status <> 'cancelled'
     AND p.start_date BETWEEN $2 AND $3
  UNION ALL
  SELECT 'project_target', p.id, p.title, p.target_date::text, p.status = 'completed',
         p.id, p.title, NULL, NULL
    FROM projects p
   WHERE p.user_id = $1 AND p.status <> 'cancelled'
     AND p.target_date BETWEEN $2 AND $3
  ORDER BY date, kind, title
  LIMIT 1000`;

@Injectable()
export class CalendarService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly projects: ProjectsService,
  ) {}

  async find(
    userId: string,
    query: CalendarQueryDto,
  ): Promise<CalendarResponseDto> {
    const { from, to } = query;
    if (!isRealDay(from) || !isRealDay(to)) {
      throw new BadRequestException('from and to must be real calendar dates');
    }
    const days = daysBetween(from, to);
    if (days < 0) {
      throw new BadRequestException("to can't be before from");
    }
    if (days > CALENDAR_MAX_DAYS) {
      throw new BadRequestException(
        `Ask for at most ${CALENDAR_MAX_DAYS} days at a time`,
      );
    }

    const [today, rows] = await Promise.all([
      this.projects.today(userId),
      this.dataSource.query<EventRow[]>(EVENTS_SQL, [userId, from, to]),
    ]);

    return {
      from,
      to,
      today,
      events: rows.map((row) => ({
        kind: row.kind,
        id: row.id,
        title: row.title,
        date: row.date,
        done: row.done,
        overdue: !row.done && row.kind !== 'project_start' && row.date < today,
        project:
          row.project_id && row.project_title
            ? { id: row.project_id, title: row.project_title }
            : null,
        parent:
          row.parent_id && row.parent_title
            ? { id: row.parent_id, title: row.parent_title }
            : null,
      })),
    };
  }
}
