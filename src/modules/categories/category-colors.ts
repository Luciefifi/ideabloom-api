/**
 * Categories use a colour NAME from this fixed palette, never a raw hex value.
 * The web app maps each name to colours that match the design and pass
 * contrast checks, so a category can never be unreadable.
 */
export const CATEGORY_COLORS = [
  'lavender',
  'rose',
  'amber',
  'emerald',
  'sky',
  'teal',
  'orange',
  'slate',
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export const DEFAULT_CATEGORY_COLOR: CategoryColor = 'lavender';
