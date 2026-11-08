export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** "Pending" = not done yet. */
export const PENDING_TASK_STATUSES: readonly TaskStatus[] = [
  'todo',
  'in_progress',
];

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_VIEWS = ['pending', 'overdue', 'completed', 'all'] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

export const TASK_TITLE_MAX = 200;
export const TASK_DESCRIPTION_MAX = 10_000;
export const MAX_SUBTASKS = 50;
