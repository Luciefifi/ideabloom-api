import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

export const API_PREFIX = 'api/v1';
export const DOCS_PATH = 'api/docs';

/**
 * Global app configuration, used by main.ts AND by the e2e tests,
 * so the tests exercise exactly the same setup as the real server.
 */
export function configureApp(app: INestApplication): void {
  // Every route starts with /api/v1. Versioning lets us change the API later
  // without breaking older clients (like an un-updated mobile app).
  app.setGlobalPrefix(API_PREFIX);

  // Sets secure HTTP headers (prevents clickjacking, MIME sniffing, etc.).
  app.use(helmet());

  // Validates every incoming DTO. `whitelist` strips unknown fields and
  // `forbidNonWhitelisted` rejects requests that send them, so clients can't
  // sneak in fields like `userId`. `transform` converts plain JSON into DTO classes.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));

  // Lets Nest close database connections cleanly when the process stops.
  app.enableShutdownHooks();
}

/** Interactive API documentation at /api/docs (not exposed in production). */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('IdeaBloom API')
    .setDescription(
      'REST API for IdeaBloom: ideas, projects, tasks, notes and resources.',
    )
    .setVersion('0.1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(DOCS_PATH, app, document);
}
