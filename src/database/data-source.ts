import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation';
import { baseDataSourceOptions } from '../config/typeorm.config';

/**
 * The data source used by the TypeORM command line (migrations) and by the
 * e2e test setup. The running Nest app does not use this file; it connects
 * through TypeOrmModule in AppModule.
 *
 * The CLI runs outside Nest, so it loads the .env file itself.
 */
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const env = validateEnv(process.env);

export default new DataSource({
  ...baseDataSourceOptions(env.DATABASE_URL),
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
});
