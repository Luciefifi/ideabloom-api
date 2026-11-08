export const SEARCH_TYPES = [
  'idea',
  'project',
  'task',
  'note',
  'resource',
] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/**
 * Highlighted words in search titles and snippets are wrapped in these two
 * characters (from Unicode's private-use area), never in HTML tags.
 * Clients turn them into their own highlight (e.g. <mark>) safely.
 */
export const HIGHLIGHT_START = '';
export const HIGHLIGHT_END = '';
