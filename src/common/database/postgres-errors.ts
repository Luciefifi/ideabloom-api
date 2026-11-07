import { QueryFailedError } from 'typeorm';

/** PostgreSQL error code for "unique constraint violated". */
const UNIQUE_VIOLATION = '23505';

/**
 * True when a database write failed because of a unique index (e.g. a second
 * category with the same name). The index is the real guarantee: two requests
 * at the same moment can't both succeed.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string }).code === UNIQUE_VIOLATION
  );
}
