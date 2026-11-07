import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { API_PREFIX, configureApp, DOCS_PATH, setupSwagger } from './app.setup';
import { Env } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  configureApp(app);

  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';
  if (!isProduction) {
    setupSwagger(app);
  }

  const port = config.get('PORT', { infer: true });
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`IdeaBloom API running at http://localhost:${port}/${API_PREFIX}`);
  if (!isProduction) {
    logger.log(`API docs at http://localhost:${port}/${DOCS_PATH}`);
  }
}

void bootstrap();
