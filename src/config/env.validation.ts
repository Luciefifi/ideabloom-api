import { z } from 'zod';

/**
 * The single source of truth for which environment variables the API needs.
 *
 * Every variable is checked once at startup. If something is missing or invalid,
 * the app refuses to start and prints a clear list of problems, instead of
 * crashing later with a confusing error deep inside the code.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: 'DATABASE_URL must be a postgres:// connection URL',
  }),

  // --- Authentication ---
  // Secret used to sign access tokens. Anyone who knows it can forge logins,
  // so it must be long, random and never committed.
  JWT_ACCESS_SECRET: z
    .string({ error: 'JWT_ACCESS_SECRET is required' })
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900), // 15 min
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  // Set to false in production after creating your own account.
  REGISTRATION_ENABLED: z.stringbool().default(true),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).default(30),

  // --- Web app & email ---
  // Where the web app runs; used to build links in emails (password reset).
  WEB_APP_URL: z.url().default('http://localhost:3000'),
  // Outgoing email. Defaults point at Mailpit from docker-compose.yml.
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_SECURE: z.stringbool().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('IdeaBloom <no-reply@ideabloom.local>'),

  // --- Rate limiting (requests per minute, per visitor IP) ---
  RATE_LIMIT_DEFAULT: z.coerce.number().int().min(1).default(300),
  RATE_LIMIT_AUTH: z.coerce.number().int().min(1).default(5),

  // Which proxies to trust for the visitor's real IP (X-Forwarded-For).
  // "loopback" = the Next.js app on the same machine. "false" = trust none.
  // A number = trust that many proxy hops (common on hosting platforms).
  TRUST_PROXY: z.string().default('loopback'),
});

export type Env = z.infer<typeof envSchema>;

/** Used by ConfigModule (app) and by the TypeORM CLI data source (migrations). */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${problems}`);
  }

  return result.data;
}
