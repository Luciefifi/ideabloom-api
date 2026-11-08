import { Matches } from 'class-validator';
import { TitleRefDto } from '../../../common/dto/refs.dto';

export const CALENDAR_MAX_DAYS = 45;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class CalendarQueryDto {
  /** First day, 'YYYY-MM-DD'. @example "2026-10-26" */
  @Matches(DAY, { message: 'from must be a date like 2026-11-01' })
  from: string;

  /** Last day (included), 'YYYY-MM-DD'. At most 45 days after `from`. @example "2026-12-06" */
  @Matches(DAY, { message: 'to must be a date like 2026-11-30' })
  to: string;
}

export const CALENDAR_EVENT_KINDS = [
  'task',
  'milestone',
  'project_start',
  'project_target',
] as const;
export type CalendarEventKind = (typeof CALENDAR_EVENT_KINDS)[number];

export class CalendarEventDto {
  kind: CalendarEventKind;
  /** The task, milestone or project id. */
  id: string;
  title: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** Task done / milestone completed / project completed. */
  done: boolean;
  /** Not done and the date has passed (in your time zone). Project starts are never overdue. */
  overdue: boolean;
  /** The project it belongs to (for project events: the project itself). */
  project: TitleRefDto | null;
  /** For subtasks: the parent task. */
  parent: TitleRefDto | null;
}

export class CalendarResponseDto {
  from: string;
  to: string;
  /** Today in your time zone. */
  today: string;
  /** Sorted by date, then kind, then title. */
  events: CalendarEventDto[];
}
