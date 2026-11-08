import pg from 'pg';
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
    // Hand TypeORM the driver ourselves: it otherwise loads `pg` in a way hosts
    // that copy only the files the code imports (Vercel) can't see, and the
    // deployed API fails with "Postgres package has not been found installed".
    driver: pg,
    url: databaseUrl,
    synchronize: false,
    migrationsRun: false,
    // Generate UUIDs with gen_random_uuid(), built into PostgreSQL 13+, and don't
    // try to CREATE EXTENSION (hosted databases often don't allow it).
    uuidExtension: 'pgcrypto',
    installExtensions: false,
  } satisfies DataSourceOptions;
}
