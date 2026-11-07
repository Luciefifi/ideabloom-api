# IdeaBloom API: Architecture

## Where the API fits

```
 Browser ──► ideabloom-web (Next.js) ──/api/* rewrite──►  ideabloom-api (NestJS) ──► PostgreSQL
                                                            ▲
 Phone (later) ──► ideabloom-mobile (Expo) ── Bearer ───────┘
```

The API is the single owner of business rules and data. Clients only display data and collect input.
The web app reaches the API through a Next.js rewrite (same origin, httpOnly cookies). The mobile app
will call it directly with `Authorization: Bearer` tokens.

## How a request flows through NestJS

```
HTTP request
  → helmet (security headers)
  → global prefix /api/v1 → router finds the controller method
  → ThrottlerGuard (rate limits per visitor IP)
  → JwtAuthGuard (requires a valid access token unless the route is @Public())
  → ValidationPipe (checks DTOs, strips/rejects unknown fields)
  → Controller (HTTP only: reads params, calls the service, returns the result)
  → Service (business logic, authorization checks, database access)
  → Repository / TypeORM → PostgreSQL
  ← response JSON, or AllExceptionsFilter formats any error
```

Rules we follow:

- **Controllers stay thin.** No business logic or database queries in controllers.
- **Services own the logic.** That makes it testable without HTTP.
- **DTOs describe and validate input.** Never trust client data.
- **One module per feature** under `src/modules/<feature>/`:
  `<feature>.module.ts`, `<feature>.controller.ts`, `<feature>.service.ts`, `entities/`, `dto/`, `*.spec.ts`.

## Configuration

- `src/config/env.validation.ts` defines every environment variable with `zod`. Invalid configuration
  stops the app at startup with a readable list of problems.
- `ConfigModule` loads `.env` (or `.env.test` when `NODE_ENV=test`) and exposes a typed `ConfigService`.
- `src/config/typeorm.config.ts` holds database options shared by the app and the CLI.

## Database

- **PostgreSQL**, accessed through **TypeORM**.
- `synchronize: false` everywhere. Schema changes happen **only** through migrations in
  `src/database/migrations/`.
- The running app registers entities automatically (`autoLoadEntities`) when a feature module calls
  `TypeOrmModule.forFeature([...])`.
- The TypeORM CLI uses `src/database/data-source.ts`, which loads `.env` itself and finds entities and
  migrations by file pattern.

### Planned data model (from the approved plan)

Every user-owned table has a `user_id` column, and **every query is scoped by the logged-in user**.
Requests for another user's record return `404`, so the API doesn't reveal that the record exists.

| Entity | Notes |
|---|---|
| users, refresh_tokens | ✅ Milestone 1 (migration `CreateUsersAndRefreshTokens`) |
| password_reset_tokens | ✅ Milestone 1 (migration `CreatePasswordResetTokens`) |
| categories, tags, ideas, idea_links, activities | Milestone 2 (`archived_at` flag; statuses Inbox, Exploring, Planned, Converted) |
| projects, milestones | Milestone 3 |
| tasks (with one level of subtasks) | Milestone 4 |
| notes (Tiptap JSON + plain text), resources | Milestone 5 |

## Error handling

`AllExceptionsFilter` (`src/common/filters/`) turns every error into the same JSON shape:
`statusCode`, `error`, `message`, `path`, `timestamp`. Extra details from Nest are kept, such as the
health check's database status. Unexpected (non-HTTP) errors are logged on the server in full, but
the client only sees `"Internal server error"`, so internal details (SQL, paths) never leak.

## Authentication design

```
login/register ──► AuthService ──► PasswordService (argon2id)
                        │
                        └─► TokenService ──► access JWT (15 min, HS256, issuer/audience checked)
                                          └─► refresh token (random 256-bit, SHA-256 hash stored,
                                              familyId per login, rotated on every refresh)
AuthController ──► AuthCookieService (web: httpOnly cookies) or JSON body (mobile: X-Client: mobile)
JwtAuthGuard (global) ──► Bearer header OR ib_access cookie ──► request.user = { id }
```

- **Secure by default**: `JwtAuthGuard` is registered as a global guard; only `@Public()` routes skip it.
- **`@CurrentUser()`** gives controllers the user id from the verified token, never from the request body.
- **Rotation and reuse detection**: refresh claims the token atomically (`UPDATE … WHERE revoked_at IS NULL`).
  Presenting a revoked token more than 15 s after revocation revokes the whole family (likely theft).
  Within 15 s it's treated as two tabs racing, so it returns a plain 401 and doesn't wipe cookies.
- **Enumeration resistance**: same login error and same hashing work for unknown emails (dummy argon2 verify).
  Registration does reveal "email already exists" (unavoidable without email verification).
- **Known trade-off**: access tokens are stateless, so a copied access token stays valid until it
  expires (at most 15 min) even after logout or password change.

## Security baseline

- `helmet` security headers on every response; the `X-Powered-By` header is removed.
- Validation rejects unknown request fields (mass-assignment protection).
- Docker services listen on `127.0.0.1` only.
- No secrets in Git: `.env` is ignored; `.env.example` documents variables.
- Swagger is disabled in production.

## Testing strategy

| Layer | Tool | Location |
|---|---|---|
| Unit (services, helpers) | Jest | `src/**/*.spec.ts` |
| Integration / e2e (real HTTP + real test DB) | Jest + Supertest | `test/**/*.e2e-spec.ts` |

- `test/utils/create-test-app.ts` builds the app with the **same** `configureApp()` as production.
- `test/setup/global-setup.ts` runs migrations on the test database before e2e tests, and refuses to
  run unless `NODE_ENV=test`.
- From Milestone 1, every feature gets **data isolation tests** (user A cannot read or change user B's data).

## Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-11-07 | **NestJS 11** (not 12) | The NestJS 12 tooling needs Node ≥ 22.22.3. The development machine stays on Node 22.13 for compatibility with other projects. Plan: move to Node 24 + NestJS 12 before Node 22 support ends (April 2027). |
| 2026-11-07 | `@nestjs/config` 4, `@nestjs/terminus` 11, `@nestjs/typeorm` 11 | Their v12 releases are ES-module-only, aligned with NestJS 12, and Jest cannot load them on Node 22. |
| 2026-11-07 | TypeORM **1.x** | Current major version, supported by `@nestjs/typeorm` 11. |
| 2026-11-07 | npm `overrides`: `multer` ^2.5.0 | NestJS 11.2.8 pins multer 2.4.0, which has a high-severity DoS advisory (GHSA-q7qp-rjg7-q26m). 2.5.0 is the compatible fix. Remove the override once NestJS ships it. |
| 2026-11-07 | Ports 5442 / 5443 for Postgres | 5432 is already used on the development machine. |
| 2026-11-07 | `DATABASE_URL` (single URL) instead of separate host/user/password variables | One variable, and it matches what hosting providers give you. |
| 2026-11-07 | Custom JwtAuthGuard instead of Passport | Fewer moving parts and no "magic"; easy to read and unit test. |
| 2026-11-07 | `@nestjs/jwt` 11 (not 12) | v12 is ESM-only (same issue as other Nest 12 add-ons). |
| 2026-11-07 | Refresh tokens: opaque random + SHA-256 (not JWT, not argon2) | Revocable server-side; 256-bit random values don't need slow hashing. |
| 2026-11-07 | UUIDs via `gen_random_uuid()` (`uuidExtension: 'pgcrypto'`, `installExtensions: false`) | Built into PostgreSQL 13+. Avoids `CREATE EXTENSION`, which hosted databases often forbid. |
| 2026-11-07 | Two named throttlers (`default` 300/min, `auth` 5/min via `@AuthRateLimit()`) and `trust proxy` | Strict limits only where passwords are guessed; real client IP through the Next.js proxy. |
| 2026-11-07 | ESLint `no-unsafe-member-access` off in tests only | supertest bodies are `any`; assertions check values. App code stays strict. |
| 2026-11-07 | Change password lives at `POST /auth/change-password` (plan said `/users/me/password`) | It needs token/password services from AuthModule; UsersModule must not depend on AuthModule (circular). |
| 2026-11-07 | Reset email sent in the background (not awaited) | Equal response time for existing/unknown emails. Failures are logged. |
| 2026-11-07 | jsonb default written as `default: {}` | `() => "'{}'::jsonb"` made TypeORM generate a no-op ALTER in every migration. |
| 2026-11-07 | E2E tests replace MailService with `FakeMailService` | Tests don't depend on Mailpit and can read the reset link directly. |
| 2026-11-07 | Known dev-only audit warnings (`deepmerge`, `glob`, `minimatch` via Nest CLI / ESLint) | Only fixable with NestJS CLI 12. They affect build tools on the developer machine, not the running API. Revisit with the NestJS 12 upgrade. |
