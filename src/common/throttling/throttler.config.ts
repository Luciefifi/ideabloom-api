import { ExecutionContext, SetMetadata } from '@nestjs/common';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';

const AUTH_RATE_LIMIT_KEY = 'authRateLimit';
const ONE_MINUTE_MS = 60_000;

/**
 * Applies the strict "auth" rate limit to a route (login, register,
 * password reset), to slow down password-guessing attacks.
 */
export const AuthRateLimit = () => SetMetadata(AUTH_RATE_LIMIT_KEY, true);

function hasAuthRateLimit(context: ExecutionContext): boolean {
  return (
    Reflect.getMetadata(AUTH_RATE_LIMIT_KEY, context.getHandler()) === true
  );
}

export interface RateLimits {
  /** Requests per minute per IP for every route. */
  defaultLimit: number;
  /** Requests per minute per IP for @AuthRateLimit() routes. */
  authLimit: number;
}

/**
 * Two limits are counted separately for each visitor IP:
 * - "default": a generous ceiling on every route
 * - "auth": a strict ceiling, only on routes marked @AuthRateLimit()
 */
export function buildThrottlerOptions(
  limits: RateLimits,
): ThrottlerModuleOptions {
  return {
    errorMessage: 'Too many attempts. Please wait a minute and try again.',
    throttlers: [
      { name: 'default', ttl: ONE_MINUTE_MS, limit: limits.defaultLimit },
      {
        name: 'auth',
        ttl: ONE_MINUTE_MS,
        limit: limits.authLimit,
        skipIf: (context) => !hasAuthRateLimit(context),
      },
    ],
  };
}
