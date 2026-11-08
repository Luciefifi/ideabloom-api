import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { LessThan, Repository } from 'typeorm';
import { AttemptLimiter, type LimitCheck } from './attempt-limiter';
import { LimitAttempt } from './limit-attempt.entity';

/** Attempts older than this (or than the window, if longer) are deleted. */
const KEEP_MS = 24 * 60 * 60_000;

export const hashLimiterKey = (key: string) =>
  createHash('sha256').update(key).digest('hex');

/**
 * AttemptLimiter stored in PostgreSQL: the counts survive restarts and are
 * shared by every copy of the API that is running.
 */
@Injectable()
export class DatabaseAttemptLimiter extends AttemptLimiter {
  constructor(
    @InjectRepository(LimitAttempt)
    private readonly attempts: Repository<LimitAttempt>,
  ) {
    super();
  }

  async check(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<LimitCheck> {
    const now = Date.now();
    const row = await this.attempts
      .createQueryBuilder('attempt')
      .select('COUNT(*)::int', 'count')
      .addSelect('MIN(attempt.attemptedAt)', 'oldest')
      .where('attempt.keyHash = :keyHash', { keyHash: hashLimiterKey(key) })
      .andWhere('attempt.attemptedAt > :cutoff', {
        cutoff: new Date(now - windowMs),
      })
      .getRawOne<{ count: number; oldest: Date | null }>();

    if (!row || row.count < limit || !row.oldest) {
      return { blocked: false, retryAfterMs: 0 };
    }
    return {
      blocked: true,
      retryAfterMs: new Date(row.oldest).getTime() + windowMs - now,
    };
  }

  async record(key: string, windowMs: number): Promise<void> {
    const now = Date.now();
    await this.attempts.insert({
      keyHash: hashLimiterKey(key),
      attemptedAt: new Date(now),
    });
    // Housekeeping, so the table stays small: anything this old can't count any more.
    await this.attempts.delete({
      attemptedAt: LessThan(new Date(now - Math.max(KEEP_MS, windowMs))),
    });
  }

  async reset(key: string): Promise<void> {
    await this.attempts.delete({ keyHash: hashLimiterKey(key) });
  }
}
