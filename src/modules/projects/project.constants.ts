export const PROJECT_STATUSES = [
  'not_started',
  'planning',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Finished projects: hidden from the default list, never "overdue". */
export const CLOSED_PROJECT_STATUSES: readonly ProjectStatus[] = [
  'completed',
  'cancelled',
];

export const PROJECT_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number];

export const PROJECT_TITLE_MAX = 200;
export const PROJECT_TEXT_MAX = 10_000;
export const MILESTONE_TITLE_MAX = 200;
export const MILESTONE_DESCRIPTION_MAX = 2_000;
export const PROJECT_MAX_MILESTONES = 100;
