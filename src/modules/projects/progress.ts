import {
  CLOSED_PROJECT_STATUSES,
  type ProjectStatus,
} from './project.constants';

export interface Counts {
  completed: number;
  total: number;
}

export interface Progress {
  /** 0–100, rounded. */
  percent: number;
  /** What the percentage is based on, so the app can explain it. */
  basis: 'tasks' | 'milestones' | 'none';
  completed: number;
  total: number;
}

/**
 * How far along a project is (decision 6 in the project guide):
 *  1. A completed project is always 100%.
 *  2. Otherwise, completed tasks ÷ all tasks (top-level tasks, from Milestone 4).
 *  3. A project without tasks uses completed milestones ÷ all milestones.
 *  4. With neither, progress is 0% with basis "none".
 */
export function computeProgress(input: {
  status: ProjectStatus;
  tasks?: Counts;
  milestones: Counts;
}): Progress {
  const source: { basis: Progress['basis']; counts: Counts } =
    input.tasks && input.tasks.total > 0
      ? { basis: 'tasks', counts: input.tasks }
      : input.milestones.total > 0
        ? { basis: 'milestones', counts: input.milestones }
        : { basis: 'none', counts: { completed: 0, total: 0 } };

  const percent =
    input.status === 'completed'
      ? 100
      : source.counts.total === 0
        ? 0
        : Math.round((source.counts.completed / source.counts.total) * 100);

  return { percent, basis: source.basis, ...source.counts };
}

/** Today's date ("2026-11-08") in the user's time zone, not the server's. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  try {
    return format(timeZone);
  } catch {
    return format('UTC'); // unknown zone name: fall back safely
  }
}

/** Past its target date (in the user's time zone) and not finished. */
export function isOverdue(
  project: { status: ProjectStatus; targetDate: string | null },
  today: string,
): boolean {
  return (
    project.targetDate !== null &&
    project.targetDate < today && // 'YYYY-MM-DD' strings compare like dates
    !CLOSED_PROJECT_STATUSES.includes(project.status)
  );
}
