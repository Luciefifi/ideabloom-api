import dataSource from '../../src/database/data-source';

/**
 * Runs ONCE before all e2e tests: connects to the test database and applies
 * every migration, so tests run against the real, current schema.
 */
export default async function globalSetup(): Promise<void> {
  // Jest sets NODE_ENV=test automatically. If it has been overridden, the app
  // would load .env and the tests could modify the DEVELOPMENT database. Stop.
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      `E2E tests must run with NODE_ENV=test (got "${process.env.NODE_ENV}").`,
    );
  }

  try {
    await dataSource.initialize();
  } catch (error) {
    throw new Error(
      'Could not connect to the test database (localhost:5443).\n' +
        'Is Docker running? Start the databases with:  npm run db:up\n' +
        `Original error: ${(error as Error).message}`,
    );
  }

  try {
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}
