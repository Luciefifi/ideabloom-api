import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { Application } from 'express';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { Env } from './config/env.validation';
import { ACCESS_COOKIE } from './modules/auth/auth.constants';

export const API_PREFIX = 'api/v1';
export const DOCS_PATH = 'api/docs';

/** Largest JSON body accepted. Notes can be up to ~200 KB of editor JSON. */
export const JSON_BODY_LIMIT = '300kb';

/** Turns the TRUST_PROXY setting into the value Express expects. */
export function parseTrustProxy(value: string): boolean | number | string {
  if (value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value; // e.g. "loopback" or a list of IPs
}

/**
 * Global app configuration, used by main.ts AND by the e2e tests,
 * so the tests exercise exactly the same setup as the real server.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Every route starts with /api/v1. Versioning lets us change the API later
  // without breaking older clients (like an un-updated mobile app).
  app.setGlobalPrefix(API_PREFIX);

  // Behind the Next.js proxy, every request seems to come from the proxy.
  // Trusting it lets Express read the real visitor IP from X-Forwarded-For,
  // so rate limits apply per visitor instead of to everyone at once.
  (app.getHttpAdapter().getInstance() as Application).set(
    'trust proxy',
    parseTrustProxy(config.get('TRUST_PROXY', { infer: true })),
  );

  // Express accepts only 100 KB by default; long notes need a bit more.
  // Bigger requests are refused with 413 before reaching any route.
  (app as NestExpressApplication).useBodyParser('json', {
    limit: JSON_BODY_LIMIT,
  });

  // Sets secure HTTP headers (prevents clickjacking, MIME sniffing, etc.).
  app.use(helmet());

  // Reads cookies into request.cookies (the web app's login tokens).
  app.use(cookieParser());

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
      'REST API for IdeaBloom: ideas, projects, tasks, notes and resources.\n\n' +
        'To try protected endpoints here: call POST /auth/login. Swagger runs on the ' +
        'same origin, so the browser stores the login cookie automatically.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .addCookieAuth(ACCESS_COOKIE)
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(DOCS_PATH, app, document);
}
