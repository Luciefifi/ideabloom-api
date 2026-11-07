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
