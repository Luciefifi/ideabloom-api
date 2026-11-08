export interface LimitCheck {
  blocked: boolean;
  /** Milliseconds until the oldest counted attempt leaves the window (0 when not blocked). */
  retryAfterMs: number;
}

/**
 * Counts attempts per key (e.g. "login:lucie@example.com") in a sliding time
 * window: only attempts from the last `windowMs` count.
 *
 * The app uses DatabaseAttemptLimiter, so the counts survive restarts and are
 * shared by every running copy of the API (on Vercel, copies start and stop on
 * demand). MemoryAttemptLimiter does the same in memory, for unit tests.
 */
export abstract class AttemptLimiter {
  abstract check(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<LimitCheck>;

  abstract record(key: string, windowMs: number): Promise<void>;

  abstract reset(key: string): Promise<void>;
}
