/**
 * Calendar-day arithmetic on 'YYYY-MM-DD' strings. Days are treated as plain
 * dates (noon UTC internally), so time zones and daylight saving can't shift them.
 */

const toDate = (day: string) => new Date(`${day}T12:00:00Z`);
const toDay = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(day: string, days: number): string {
  const date = toDate(day);
  date.setUTCDate(date.getUTCDate() + days);
  return toDay(date);
}

/** The Monday of the week containing `day` (weeks start on Monday). */
export function mondayOf(day: string): string {
  const weekday = toDate(day).getUTCDay(); // 0 = Sunday … 6 = Saturday
  return addDays(day, weekday === 0 ? -6 : 1 - weekday);
}

/** The Mondays of the last `count` weeks, oldest first, ending with this week. */
export function lastWeekStarts(today: string, count: number): string[] {
  const thisWeek = mondayOf(today);
  return Array.from({ length: count }, (_, i) =>
    addDays(thisWeek, (i - count + 1) * 7),
  );
}
