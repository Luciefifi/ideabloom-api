import { MemoryAttemptLimiter } from './memory-attempt-limiter';

const MINUTE = 60_000;

describe('MemoryAttemptLimiter', () => {
  let limiter: MemoryAttemptLimiter;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-07T12:00:00Z') });
    limiter = new MemoryAttemptLimiter();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const fail = async (key: string, times: number) => {
    for (let i = 0; i < times; i++) await limiter.record(key, 15 * MINUTE);
  };

  it('allows attempts up to the limit, then blocks', async () => {
    await fail('login:a', 9);
    expect((await limiter.check('login:a', 10, 15 * MINUTE)).blocked).toBe(
      false,
    );

    await fail('login:a', 1);
    expect(await limiter.check('login:a', 10, 15 * MINUTE)).toEqual({
      blocked: true,
      retryAfterMs: 15 * MINUTE,
    });
  });

  it('unblocks once old attempts leave the window (sliding window)', async () => {
    await fail('login:a', 10);
    jest.advanceTimersByTime(14 * MINUTE);
    expect(await limiter.check('login:a', 10, 15 * MINUTE)).toEqual({
      blocked: true,
      retryAfterMs: 1 * MINUTE,
    });

    jest.advanceTimersByTime(1 * MINUTE + 1);
    expect((await limiter.check('login:a', 10, 15 * MINUTE)).blocked).toBe(
      false,
    );
  });

  it('keeps keys separate', async () => {
    await fail('login:a', 10);

    expect((await limiter.check('login:b', 10, 15 * MINUTE)).blocked).toBe(
      false,
    );
  });

  it('reset() clears one key', async () => {
    await fail('login:a', 10);
    await fail('login:b', 10);

    await limiter.reset('login:a');

    expect((await limiter.check('login:a', 10, 15 * MINUTE)).blocked).toBe(
      false,
    );
    expect((await limiter.check('login:b', 10, 15 * MINUTE)).blocked).toBe(
      true,
    );
  });
});
