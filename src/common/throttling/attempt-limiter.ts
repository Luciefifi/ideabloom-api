import { Injectable } from '@nestjs/common';

export interface LimitCheck {
  blocked: boolean;
  /** Milliseconds until the oldest counted attempt leaves the window (0 when not blocked). */
  retryAfterMs: number;
}

/** Above this many keys, expired entries are cleaned up so memory can't grow forever. */
const SWEEP_THRESHOLD = 10_000;

/**
 * Counts attempts per key (e.g. "login:lucie@example.com") in a sliding time
 * window: only attempts from the last `windowMs` count.
 *
 * Stored in memory, like the IP rate limits. That's fine for one API server;
 * counts reset when the API restarts. Running several API servers would need
 * a shared store (e.g. Redis).
 */
@Injectable()
export class AttemptLimiter {
  private readonly attempts = new Map<string, number[]>();

  check(key: string, limit: number, windowMs: number): LimitCheck {
    const recent = this.recent(key, windowMs);
    if (recent.length < limit) {
      return { blocked: false, retryAfterMs: 0 };
    }
    return { blocked: true, retryAfterMs: recent[0] + windowMs - Date.now() };
  }

  record(key: string, windowMs: number): void {
    const recent = this.recent(key, windowMs);
    recent.push(Date.now());
    this.attempts.set(key, recent);
    if (this.attempts.size > SWEEP_THRESHOLD) {
      this.sweep(windowMs);
    }
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }

  /** Forget everything (used by tests). */
  clear(): void {
    this.attempts.clear();
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
