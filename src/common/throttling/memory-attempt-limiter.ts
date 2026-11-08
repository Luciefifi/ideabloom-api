import { AttemptLimiter, type LimitCheck } from './attempt-limiter';

/** Above this many keys, expired entries are cleaned up so memory can't grow forever. */
const SWEEP_THRESHOLD = 10_000;

/**
 * AttemptLimiter kept in memory: counts reset when the process restarts and
 * aren't shared between processes. Used by unit tests; the app uses
 * DatabaseAttemptLimiter.
 */
export class MemoryAttemptLimiter extends AttemptLimiter {
  private readonly attempts = new Map<string, number[]>();

  check(key: string, limit: number, windowMs: number): Promise<LimitCheck> {
    const recent = this.recent(key, windowMs);
    if (recent.length < limit) {
      return Promise.resolve({ blocked: false, retryAfterMs: 0 });
    }
    return Promise.resolve({
      blocked: true,
      retryAfterMs: recent[0] + windowMs - Date.now(),
    });
  }

  record(key: string, windowMs: number): Promise<void> {
    const recent = this.recent(key, windowMs);
    recent.push(Date.now());
    this.attempts.set(key, recent);
    if (this.attempts.size > SWEEP_THRESHOLD) {
      this.sweep(windowMs);
    }
    return Promise.resolve();
  }

  reset(key: string): Promise<void> {
    this.attempts.delete(key);
    return Promise.resolve();
  }

  private recent(key: string, windowMs: number): number[] {
    const cutoff = Date.now() - windowMs;
    const recent = (this.attempts.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length === 0) {
      this.attempts.delete(key);
    }
    return recent;
  }

  private sweep(windowMs: number): void {
    for (const key of [...this.attempts.keys()]) {
      this.recent(key, windowMs);
    }
  }
}
