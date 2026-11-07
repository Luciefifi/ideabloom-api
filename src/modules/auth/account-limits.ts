import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../../config/env.validation';

/**
 * Limits per ACCOUNT (email address), on top of the per-IP rate limits.
 * They still work when an attacker changes or fakes their IP address.
 */
export interface AccountLimits {
  loginMaxFailures: number;
  loginLockMs: number;
  resetEmailsPerWindow: number;
  resetEmailWindowMs: number;
}

export const ACCOUNT_LIMITS = Symbol('ACCOUNT_LIMITS');

const MINUTE_MS = 60_000;

export const accountLimitsProvider: Provider = {
  provide: ACCOUNT_LIMITS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): AccountLimits => ({
    loginMaxFailures: config.get('LOGIN_MAX_FAILURES', { infer: true }),
    loginLockMs: config.get('LOGIN_LOCK_MINUTES', { infer: true }) * MINUTE_MS,
    resetEmailsPerWindow: config.get('PASSWORD_RESET_EMAILS_PER_HOUR', {
      infer: true,
    }),
    resetEmailWindowMs: 60 * MINUTE_MS,
  }),
};

export const loginLimiterKey = (email: string) => `login:${email}`;
export const resetEmailLimiterKey = (email: string) => `reset-email:${email}`;
