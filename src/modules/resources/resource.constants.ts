export const RESOURCE_TYPES = [
  'website',
  'article',
  'video',
  'document',
  'other',
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const RESOURCE_TITLE_MAX = 200;
export const RESOURCE_URL_MAX = 2000;
export const RESOURCE_DESCRIPTION_MAX = 2000;
export const RESOURCE_NOTES_MAX = 10_000;
