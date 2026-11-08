import { addDays, lastWeekStarts, mondayOf } from './dashboard-dates';

describe('dashboard dates', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-11-08', 13)).toBe('2026-11-21');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it.each([
    ['2026-11-09', '2026-11-09'], // Monday
    ['2026-11-12', '2026-11-09'], // Thursday
    ['2026-11-15', '2026-11-09'], // Sunday belongs to the week before
    ['2027-01-01', '2026-12-28'], // across the new year
  ])('the week of %s starts on %s', (day, monday) => {
    expect(mondayOf(day)).toBe(monday);
  });

  it('lists the last weeks, oldest first, ending with this week', () => {
    expect(lastWeekStarts('2026-11-12', 3)).toEqual([
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
    ]);
  });
});
