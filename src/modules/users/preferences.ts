/** App preferences stored in users.preferences (a jsonb column). */

export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

export const START_PAGES = ['dashboard', 'ideas', 'tasks'] as const;
export type StartPage = (typeof START_PAGES)[number];

export interface Preferences {
  theme: Theme;
  /** The page that opens after logging in. */
  startPage: StartPage;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  startPage: 'dashboard',
};

/** Known preferences with defaults; anything unknown or invalid in the stored JSON is ignored. */
export function toPreferences(
  stored: Record<string, unknown> | null,
): Preferences {
  const value = stored ?? {};
  return {
    theme: (THEMES as readonly unknown[]).includes(value.theme)
      ? (value.theme as Theme)
      : DEFAULT_PREFERENCES.theme,
    startPage: (START_PAGES as readonly unknown[]).includes(value.startPage)
      ? (value.startPage as StartPage)
      : DEFAULT_PREFERENCES.startPage,
  };
}
