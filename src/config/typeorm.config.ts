import type { DataSourceOptions } from 'typeorm';

/**
 * Database settings shared by the running app and the TypeORM CLI.
 *
 * `synchronize` is always false: TypeORM must never change the database schema
 * automatically. Every schema change goes through a migration file that we can
 * read, review and commit.
 */
export function baseDataSourceOptions(databaseUrl: string) {
  return {
    type: 'postgres',
    url: databaseUrl,
    synchronize: false,
    migrationsRun: false,
  } satisfies DataSourceOptions;
}
