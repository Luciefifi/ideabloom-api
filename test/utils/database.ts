import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Empties every table so each test starts from a clean, known state.
 * Only ever runs against the test database (global-setup enforces NODE_ENV=test).
 */
export async function resetDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  const tables = dataSource.entityMetadatas
    .map((entity) => `"${entity.tableName}"`)
    .join(', ');

  if (tables) {
    await dataSource.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }
}
