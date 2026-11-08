import { IsISO8601, IsOptional, Matches, ValidateIf } from 'class-validator';

/**
 * An optional calendar date "YYYY-MM-DD" (no time, no time zone), or null to
 * clear it. Rejects formats like "31/12/2026" and impossible dates like
 * "2026-02-30".
 */
export function IsOptionalDate(): PropertyDecorator {
  return (target, key) => {
    IsOptional()(target, key);
    ValidateIf((_, value) => value !== null)(target, key);
    Matches(/^\d{4}-\d{2}-\d{2}$/, {
      message: `${String(key)} must be a date like 2026-12-31`,
    })(target, key);
    IsISO8601(
      { strict: true },
      { message: `${String(key)} must be a real calendar date` },
    )(target, key);
  };
}
