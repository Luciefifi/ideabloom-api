# IdeaBloom API

> Your ideas, in full bloom.

The backend for **IdeaBloom**, a personal workspace for capturing ideas and growing them into projects,
tasks, milestones, notes and resources.

This API owns all business logic, authentication and data access. The web app
([ideabloom-web](https://github.com/Luciefifi/ideabloom-web)) and the future mobile app
([ideabloom-mobile](https://github.com/Luciefifi/ideabloom-mobile)) both use it.

## Tech stack

| Concern | Technology |
|---|---|
| Framework | [NestJS 11](https://nestjs.com/) + TypeScript |
| Database | PostgreSQL 17 (Docker in development) |
| ORM / migrations | TypeORM 1.x |
| Validation | `class-validator` (request DTOs), `zod` (environment variables) |
| API docs | Swagger / OpenAPI at `/api/docs` |
| Security headers | `helmet` |
| Health checks | `@nestjs/terminus` |
| Tests | Jest + Supertest |

## Prerequisites

- **Node.js 22.13 or newer** (see `.nvmrc`)
- **npm** (comes with Node)
- **Docker Desktop**, running

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Create your local environment file
copy .env.example .env        # Windows (PowerShell/cmd)
# cp .env.example .env        # macOS / Linux

# 3. Start PostgreSQL (dev + test) and Mailpit in Docker
npm run db:up

# 4. Apply database migrations
npm run migration:run

# 5. Start the API in watch mode (restarts when you save a file)
npm run start:dev
```

Then open:

- Health check: <http://localhost:4000/api/v1/health>
- API docs (Swagger): <http://localhost:4000/api/docs>
- Mailpit inbox (emails sent by the API): <http://localhost:8025>

## Environment variables

Defined and validated in [`src/config/env.validation.ts`](src/config/env.validation.ts). The app will not
start if any are missing or invalid, and it lists every problem.

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development`, `test` or `production` |
| `PORT` | no | `4000` | Port the API listens on |
| `DATABASE_URL` | **yes** | none | PostgreSQL URL, e.g. `postgres://user:pass@localhost:5442/ideabloom` |

Files:

- `.env.example`: template, committed. Copy it to `.env`.
- `.env`: your local settings. **Ignored by Git.**
- `.env.test`: used automatically by tests. Committed, because it only points at the throwaway test database.

## Scripts

| Command | What it does |
|---|---|
| `npm run start:dev` | Run the API with auto-restart on file changes |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start:prod` | Run the compiled app (`node dist/main`) |
| `npm run db:up` / `db:down` | Start / stop the Docker services (data is kept) |
| `npm test` | Unit tests (`src/**/*.spec.ts`) |
| `npm run test:e2e` | Integration tests against the test database (`test/**/*.e2e-spec.ts`) |
| `npm run test:cov` | Unit tests with a coverage report |
| `npm run lint` / `lint:check` | ESLint (with / without auto-fix) |
| `npm run format` / `format:check` | Prettier (write / check only) |
| `npm run migration:generate -- src/database/migrations/<Name>` | Generate a migration from entity changes |
| `npm run migration:create -- src/database/migrations/<Name>` | Create an empty migration to write by hand |
| `npm run migration:run` | Apply pending migrations |
| `npm run migration:revert` | Undo the most recent migration |
| `npm run migration:show` | List migrations and whether each has run (`[X]`) or not (`[ ]`) |

## Docker services

Defined in [`docker-compose.yml`](docker-compose.yml). All ports are bound to `127.0.0.1` (this computer only).

| Service | Port | Purpose |
|---|---|---|
| `db` | 5442 | Development database (data persists in the `db-data` volume) |
| `db-test` | 5443 | Test database (in memory, empty on every restart) |
| `mailpit` | 1025 (SMTP), 8025 (web) | Catches outgoing emails in development |

Non-default ports are used so IdeaBloom doesn't clash with other PostgreSQL servers on the machine.

## Testing

```bash
npm run db:up        # the e2e tests need the test database
npm test             # unit tests
npm run test:e2e     # integration tests
```

Before the e2e tests run, the setup in [`test/setup/global-setup.ts`](test/setup/global-setup.ts) applies all
migrations to the test database. It refuses to run unless `NODE_ENV=test`, so the tests can never touch
your development data.

## Database migrations

TypeORM's automatic schema sync (`synchronize`) is **always off**. Every change to the database structure
is a migration file in `src/database/migrations/`, reviewed and committed like any other code.

Typical flow when you change an entity:

```bash
npm run migration:generate -- src/database/migrations/AddIdeasTable
# review the generated file!
npm run migration:run
```

## API conventions

- All routes are prefixed with **`/api/v1`**.
- Errors always use this shape:

  ```json
  {
    "statusCode": 404,
    "error": "Not Found",
    "message": "Cannot GET /api/v1/nope",
    "path": "/api/v1/nope",
    "timestamp": "2026-11-07T17:25:46.183Z"
  }
  ```

  For validation errors, `message` is an array of messages.
- Unknown fields in request bodies are rejected (`400 Bad Request`).

### Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/health` | none | `200` when the API and database are up, `503` if the database is unreachable |

Full, interactive documentation: `/api/docs` (disabled when `NODE_ENV=production`).

## Project structure

```
src/
├── main.ts                 Entry point: creates the app, applies setup, starts listening
├── app.module.ts           Root module: config, database, feature modules
├── app.setup.ts            Global setup shared by main.ts and tests (prefix, helmet, validation, errors, Swagger)
├── config/                 Environment validation and shared database options
├── common/                 Cross-cutting code (filters; later guards, decorators, pagination)
├── database/
│   ├── data-source.ts      Data source used by the TypeORM CLI and test setup
│   └── migrations/         Migration files
└── modules/                One folder per feature (health; later auth, users, ideas, ...)
test/
├── setup/                  Jest global setup (runs migrations on the test DB)
├── utils/                  Test helpers (createTestApp)
└── *.e2e-spec.ts           Integration tests
```

More detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Branches

| Branch | Purpose |
|---|---|
| `main` | Stable, tested code |
| `develop` | Integration branch |
| `feature/<name>` | New functionality, branched from `develop` |
| `fix/<name>` | Bug fixes |
| `release/<version>` | Release preparation |
