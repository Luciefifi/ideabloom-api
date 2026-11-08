import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AttemptLimiter } from '../src/common/throttling/attempt-limiter';
import { createTestApp } from './utils/create-test-app';
import { resetDatabase } from './utils/database';

const MINUTE = 60_000;
const WINDOW = 15 * MINUTE;
const START = new Date('2026-11-08T12:00:00Z').getTime();

describe('Database attempt limiter (e2e)', () => {
  let app: INestApplication;
  let limiter: AttemptLimiter;
  let now = START;

  beforeAll(async () => {
    app = await createTestApp();
    limiter = app.get(AttemptLimiter);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    now = START;
    // Only the limiter's clock is moved; the database driver keeps working normally.
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const fail = async (key: string, times: number) => {
    for (let i = 0; i < times; i++) await limiter.record(key, WINDOW);
  };

  it('allows attempts up to the limit, then blocks', async () => {
    await fail('login:a', 2);
    expect((await limiter.check('login:a', 3, WINDOW)).blocked).toBe(false);

    await fail('login:a', 1);
    expect(await limiter.check('login:a', 3, WINDOW)).toEqual({
      blocked: true,
      retryAfterMs: WINDOW,
    });
  });

  it('unblocks once old attempts leave the window (sliding window)', async () => {
    await fail('login:a', 3);

    now += 14 * MINUTE;
    expect(await limiter.check('login:a', 3, WINDOW)).toEqual({
      blocked: true,
      retryAfterMs: 1 * MINUTE,
    });

    now += 1 * MINUTE;
    expect((await limiter.check('login:a', 3, WINDOW)).blocked).toBe(false);
  });

  it('keeps keys separate, and reset() clears only one key', async () => {
    await fail('login:a', 3);
    await fail('login:b', 3);
    expect((await limiter.check('login:c', 3, WINDOW)).blocked).toBe(false);

    await limiter.reset('login:a');

    expect((await limiter.check('login:a', 3, WINDOW)).blocked).toBe(false);
    expect((await limiter.check('login:b', 3, WINDOW)).blocked).toBe(true);
  });

  it('remembers attempts across an API restart (what Vercel needs)', async () => {
    await fail('login:a', 3);

    const restarted = await createTestApp();
    try {
      const fresh = restarted.get(AttemptLimiter);
      expect((await fresh.check('login:a', 3, WINDOW)).blocked).toBe(true);
    } finally {
      await restarted.close();
    }
  });

  it('stores only a hash of the key, never the email itself', async () => {
    await limiter.record('login:lucie@example.com', WINDOW);

    const rows: { key_hash: string }[] = await app
      .get(DataSource)
      .query('SELECT key_hash FROM limit_attempts');
    expect(rows).toHaveLength(1);
    expect(rows[0].key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].key_hash).not.toContain('lucie');
  });

  it('deletes attempts older than a day when recording new ones', async () => {
    await fail('login:old', 2);

    now += 24 * 60 * MINUTE + 1;
    await limiter.record('login:new', WINDOW);

    const [{ count }]: { count: number }[] = await app
      .get(DataSource)
      .query('SELECT COUNT(*)::int AS count FROM limit_attempts');
    expect(count).toBe(1);
  });
});
