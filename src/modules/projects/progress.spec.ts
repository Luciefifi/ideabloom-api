import { computeProgress, isOverdue, todayIn } from './progress';

describe('computeProgress', () => {
  const none = { completed: 0, total: 0 };

  it('uses milestones when there are no tasks', () => {
    expect(
      computeProgress({
        status: 'in_progress',
        milestones: { completed: 3, total: 5 },
      }),
    ).toEqual({ percent: 60, basis: 'milestones', completed: 3, total: 5 });
  });

  it('prefers tasks over milestones when tasks exist', () => {
    expect(
      computeProgress({
        status: 'in_progress',
        tasks: { completed: 1, total: 4 },
        milestones: { completed: 3, total: 3 },
      }),
    ).toEqual({ percent: 25, basis: 'tasks', completed: 1, total: 4 });
  });

  it('is 0% with basis "none" when there is nothing to count', () => {
    expect(
      computeProgress({ status: 'planning', tasks: none, milestones: none }),
    ).toEqual({ percent: 0, basis: 'none', completed: 0, total: 0 });
  });

  it('is always 100% for a completed project', () => {
    expect(
      computeProgress({
        status: 'completed',
        milestones: { completed: 1, total: 4 },
      }).percent,
    ).toBe(100);
    expect(
      computeProgress({ status: 'completed', milestones: none }).percent,
    ).toBe(100);
  });

  it('rounds to whole percent', () => {
    expect(
      computeProgress({
        status: 'planning',
        milestones: { completed: 1, total: 3 },
      }).percent,
    ).toBe(33);
  });
});

describe('todayIn', () => {
  // 22:30 UTC on 8 November is already 9 November in Kigali (UTC+2).
  const lateEvening = new Date('2026-11-08T22:30:00Z');

  it.each([
    ['UTC', '2026-11-08'],
    ['Africa/Kigali', '2026-11-09'],
    ['America/New_York', '2026-11-08'],
  ])('%s → %s', (zone, expected) => {
    expect(todayIn(zone, lateEvening)).toBe(expected);
  });

  it('falls back to UTC for an unknown zone', () => {
    expect(todayIn('Mars/Olympus', lateEvening)).toBe('2026-11-08');
  });
});

describe('isOverdue', () => {
  const today = '2026-11-08';

  it.each([
    [{ status: 'in_progress' as const, targetDate: '2026-11-07' }, true],
    [{ status: 'in_progress' as const, targetDate: '2026-11-08' }, false], // due today
    [{ status: 'in_progress' as const, targetDate: null }, false],
    [{ status: 'completed' as const, targetDate: '2026-01-01' }, false],
    [{ status: 'cancelled' as const, targetDate: '2026-01-01' }, false],
    [{ status: 'on_hold' as const, targetDate: '2026-01-01' }, true],
  ])('%j → %s', (project, expected) => {
    expect(isOverdue(project, today)).toBe(expected);
  });
});
