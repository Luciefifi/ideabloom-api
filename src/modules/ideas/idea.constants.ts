/**
 * Idea statuses. "converted" means the idea became a project; it is set only
 * by the conversion feature (Milestone 3), never chosen directly.
 */
export const IDEA_STATUSES = [
  'inbox',
  'exploring',
  'planned',
  'converted',
] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

/** Statuses a person can pick when creating or editing an idea. */
export const EDITABLE_IDEA_STATUSES = [
  'inbox',
  'exploring',
  'planned',
] as const satisfies readonly IdeaStatus[];

export const IDEA_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type IdeaPriority = (typeof IDEA_PRIORITIES)[number];

export const IDEA_TITLE_MAX = 200;
export const IDEA_DESCRIPTION_MAX = 10_000;
export const IDEA_MAX_TAGS = 20;
export const IDEA_MAX_LINKS = 20;
