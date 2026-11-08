import { TitleRefDto } from '../../../common/dto/refs.dto';
import { ProjectSummaryDto } from '../../projects/dto/project.dto';

export const DEADLINE_KINDS = ['task', 'milestone', 'project'] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

export class DeadlineDto {
  /** What is due: a task, a milestone, or a project's target date. */
  kind: DeadlineKind;
  /** The task, milestone or project id. */
  id: string;
  title: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** The project it belongs to (for a project deadline: the project itself). */
  project: TitleRefDto | null;
}

export class WeekCountDto {
  /** The Monday that starts the week, 'YYYY-MM-DD'. */
  weekStart: string;
  count: number;
}

export class DashboardResponseDto {
  /** Today in your time zone, 'YYYY-MM-DD'. Everything below uses it. */
  today: string;
  /** Last day included in `deadlines.upcoming` (today + 13). */
  upcomingUntil: string;
  ideas: {
    /** Not archived and not converted into a project. */
    active: number;
    /** Not archived, per status. */
    byStatus: {
      inbox: number;
      exploring: number;
      planned: number;
      converted: number;
    };
  };
  projects: {
    /** Not completed or cancelled. */
    active: number;
    completed: number;
  };
  /** Top-level tasks (like the Tasks page). */
  tasks: {
    pending: number;
    overdue: number;
    dueToday: number;
  };
  deadlines: {
    /** Past their date and not done, oldest first (at most 10). */
    overdue: DeadlineDto[];
    /** Due today and in the next 13 days, soonest first (at most 20). */
    upcoming: DeadlineDto[];
  };
  /** Up to 5 active projects, most recently updated first. */
  activeProjects: ProjectSummaryDto[];
  /** Top-level tasks completed per week, 8 weeks, oldest first (weeks start Monday). */
  completedPerWeek: WeekCountDto[];
}
