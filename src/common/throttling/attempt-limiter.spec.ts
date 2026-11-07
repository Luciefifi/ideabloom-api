import { AttemptLimiter } from './attempt-limiter';

const MINUTE = 60_000;

describe('AttemptLimiter', () => {
  let limiter: AttemptLimiter;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-07T12:00:00Z') });
    limiter = new AttemptLimiter();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const fail = (key: string, times: number) => {
    for (let i = 0; i < times; i++) limiter.record(key, 15 * MINUTE);
  };

  it('allows attempts up to the limit, then blocks', () => {
    fail('login:a', 9);
    expect(limiter.check('login:a', 10, 15 * MINUTE).blocked).toBe(false);

    fail('login:a', 1);
    expect(limiter.check('login:a', 10, 15 * MINUTE)).toEqual({
      blocked: true,
      retryAfterMs: 15 * MINUTE,
    });
  });

  it('unblocks once old attempts leave the window (sliding window)', () => {
    fail('login:a', 10);
    jest.advanceTimersByTime(14 * MINUTE);
    expect(limiter.check('login:a', 10, 15 * MINUTE)).toEqual({
      blocked: true,
      retryAfterMs: 1 * MINUTE,
    });

    jest.advanceTimersByTime(1 * MINUTE + 1);
    expect(limiter.check('login:a', 10, 15 * MINUTE).blocked).toBe(false);
  });

  it('keeps keys separate', () => {
    fail('login:a', 10);

    expect(limiter.check('login:b', 10, 15 * MINUTE).blocked).toBe(false);
  });

  it('reset() clears one key', () => {
    fail('login:a', 10);
    fail('login:b', 10);

    limiter.reset('login:a');

    expect(limiter.check('login:a', 10, 15 * MINUTE).blocked).toBe(false);
    expect(limiter.check('login:b', 10, 15 * MINUTE).blocked).toBe(true);
  });
});
