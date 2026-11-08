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
# Then set JWT_ACCESS_SECRET in .env to a long random value:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

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
| `JWT_ACCESS_SECRET` | **yes** | none | Secret for signing access tokens, **at least 32 characters**, random, never committed |
| `JWT_ACCESS_TTL_SECONDS` | no | `900` | Access token lifetime (15 minutes) |
| `REFRESH_TOKEN_TTL_DAYS` | no | `30` | How long a login lasts |
| `REGISTRATION_ENABLED` | no | `true` | Set `false` to stop new sign-ups (e.g. in production after creating your account) |
| `PASSWORD_RESET_TTL_MINUTES` | no | `30` | How long a password reset link works |
| `WEB_APP_URL` | no | `http://localhost:3000` | Web app address, used to build links in emails |
| `SMTP_HOST` / `SMTP_PORT` | no | `localhost` / `1025` | Outgoing mail server (defaults = Mailpit) |
| `SMTP_SECURE` | no | `false` | Use TLS from the start (`true` for port 465 providers) |
| `SMTP_USER` / `SMTP_PASSWORD` | no | none | SMTP login, if your provider needs one |
| `MAIL_FROM` | no | `IdeaBloom <no-reply@ideabloom.local>` | Sender shown on emails |
| `RATE_LIMIT_DEFAULT` | no | `300` | Requests per minute per IP, all routes |
| `RATE_LIMIT_AUTH` | no | `5` | Requests per minute per IP for login and registration |
| `TRUST_PROXY` | no | `loopback` | Proxies trusted for the real visitor IP: `loopback`, `false`, or a hop count |
| `LOGIN_MAX_FAILURES` | no | `10` | Failed logins per email before that account's login is paused |
| `LOGIN_LOCK_MINUTES` | no | `15` | Window and pause length for failed logins |
| `PASSWORD_RESET_EMAILS_PER_HOUR` | no | `3` | Reset emails per email address per hour |

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

### Trying password reset locally

1. `POST /api/v1/auth/forgot-password` with your email (e.g. from Swagger).
2. Open Mailpit at <http://localhost:8025> and open the "Reset your IdeaBloom password" email.
3. Copy the `token` value from the link and call `POST /api/v1/auth/reset-password` with it.
   (From Milestone 1 web part, the link opens the web app's reset page directly.)

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

> **Generated columns** (e.g. `name_key`): TypeORM writes the database name into the migration's
> `typeorm_metadata` queries. Replace that hard-coded name with
> `const database = await queryRunner.getCurrentDatabase();` so the migration works on every database.

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
| `GET` | `/api/v1/health` | public | `200` when the API and database are up, `503` if the database is unreachable |
| `POST` | `/api/v1/auth/register` | public, rate-limited | Create an account and log in. `{ email, password, displayName }` |
| `POST` | `/api/v1/auth/login` | public, rate-limited | Log in. `{ email, password }` |
| `POST` | `/api/v1/auth/refresh` | refresh token | New access token; rotates the refresh token |
| `POST` | `/api/v1/auth/logout` | refresh token | End this session and clear cookies |
| `POST` | `/api/v1/auth/logout-all` | **login** | End every session on every device |
| `POST` | `/api/v1/auth/forgot-password` | public, rate-limited | Email a reset link. **Always** `202` with the same message |
| `POST` | `/api/v1/auth/reset-password` | public, rate-limited | `{ token, newPassword }`. One-time link; logs out all devices |
| `POST` | `/api/v1/auth/change-password` | **login**, rate-limited | `{ currentPassword, newPassword }`. Other devices are logged out; this one gets a fresh session |
| `GET` | `/api/v1/users/me` | **login** | The logged-in user's profile |
| `PATCH` | `/api/v1/users/me` | **login** | Update `displayName`, `bio` (empty → cleared), `timezone` (IANA, e.g. `Africa/Kigali`) |
| `GET` | `/api/v1/categories` | **login** | Your categories, A to Z, with `ideaCount`, `noteCount`, `resourceCount` |
| `POST` | `/api/v1/categories` | **login** | `{ name, color? }`; color is one of `lavender rose amber emerald sky teal orange slate` |
| `PATCH` / `DELETE` | `/api/v1/categories/:id` | **login** | Rename/recolour, or delete (its ideas stay, uncategorized) |
| `GET` | `/api/v1/tags` | **login** | Your tags, A to Z, with `ideaCount`, `noteCount`, `resourceCount` |
| `POST` | `/api/v1/tags` | **login** | `{ name }` (letters, numbers, spaces, `- _ . # +`; max 30) |
| `PATCH` / `DELETE` | `/api/v1/tags/:id` | **login** | Rename or delete (removed from every idea) |
| `GET` | `/api/v1/ideas` | **login** | Search, filter, sort, page (see below) |
| `POST` | `/api/v1/ideas` | **login** | Create. Only `title` is required (quick capture) |
| `GET` | `/api/v1/ideas/:id` | **login** | One idea with category, tags and links |
| `PATCH` | `/api/v1/ideas/:id` | **login** | Update only the fields sent; `tags` / `links` replace the lists when sent |
| `POST` | `/api/v1/ideas/:id/archive` · `/restore` | **login** | Archive (hidden from the default list) or restore |
| `DELETE` | `/api/v1/ideas/:id` | **login** | Delete permanently |
| `POST` | `/api/v1/ideas/:id/convert` | **login** | Turn an idea into a project (copies title, description, category, priority; idea becomes `converted`) |
| `GET` | `/api/v1/projects` | **login** | List: `scope=active` (default) or `all`, `status`, `priority`, `categoryId`, `search`, `sort` (`updatedAt` `createdAt` `title` `targetDate` `progress`), `order`, `page`, `pageSize` |
| `POST` | `/api/v1/projects` | **login** | Create. Only `title` is required |
| `GET` / `PATCH` / `DELETE` | `/api/v1/projects/:id` | **login** | One project (progress, milestones, related ideas) / update / delete (milestones go too; ideas stay; the source idea returns to `planned`) |
| `POST` | `/api/v1/projects/:id/ideas` | **login** | Link one of your ideas `{ ideaId }` |
| `DELETE` | `/api/v1/projects/:id/ideas/:ideaId` | **login** | Unlink (not allowed for the idea the project came from) |
| `POST` | `/api/v1/projects/:id/milestones` | **login** | Add a milestone `{ title, description?, dueDate? }` (goes last) |
| `PATCH` | `/api/v1/milestones/:id` | **login** | Edit, or `{ "completed": true | false }` to complete / reopen |
| `DELETE` | `/api/v1/milestones/:id` | **login** | Delete a milestone |
| `PUT` | `/api/v1/projects/:id/milestones/order` | **login** | `{ milestoneIds: [...] }`: every milestone once, in the new order |
| `GET` | `/api/v1/projects/:id/activity?limit=30` | **login** | The project's history, newest first (status changes, milestones added/completed…) |
| `GET` | `/api/v1/tasks` | **login** | Top-level tasks: `view` = `pending` (default) | `overdue` | `completed` | `all`; `projectId` (or `none`), `priority` (or `none`), `search`, `sort` (`dueDate` default, `priority`, `createdAt`, `updatedAt`, `completedAt`, `title`), `order`, `page`, `pageSize` |
| `POST` | `/api/v1/tasks` | **login** | Create `{ title, description?, status?, priority?, startDate?, dueDate?, projectId? }`, or a subtask with `parentTaskId` |
| `GET` / `PATCH` / `DELETE` | `/api/v1/tasks/:id` | **login** | One task with `subtaskList` / update (status `done` completes, `todo` reopens) / delete (subtasks too) |
| `GET` | `/api/v1/notes` | **login** | Your notes, pinned first: `search`, `categoryId` (or `none`), `tagId`, `ideaId`, `projectId`, `pinned`, `sort` (`updatedAt` default, `createdAt`, `title`, `relevance`), `order`, `page`, `pageSize`. Items have an `excerpt`, not the content |
| `POST` | `/api/v1/notes` | **login** | Create `{ title?, content?, isPinned?, categoryId?, tags?, ideaId? | projectId? }` (all optional) |
| `GET` / `PATCH` / `DELETE` | `/api/v1/notes/:id` | **login** | One note with its editor `content` / update (autosave) / delete |
| `GET` | `/api/v1/resources` | **login** | Your saved links: `search`, `type`, `categoryId` (or `none`), `tagId`, `ideaId`, `projectId`, `sort`, `order`, `page`, `pageSize` |
| `POST` | `/api/v1/resources` | **login** | Create `{ title, url, type?, description?, notes?, categoryId?, tags?, ideaId? | projectId? }` |
| `GET` / `PATCH` / `DELETE` | `/api/v1/resources/:id` | **login** | One resource (with `domain`, e.g. `youtube.com`) / update / delete |
| `GET` | `/api/v1/activity?limit=20` | **login** | Your recent activity, newest first |

### Ideas: fields and list options

Create/update body:

```json
{
  "title": "Plant watering app",
  "description": "Plain text, line breaks kept",
  "status": "inbox | exploring | planned",
  "priority": "low | medium | high | urgent | null",
  "categoryId": "uuid of one of YOUR categories | null",
  "tags": ["mobile", "health"],
  "links": [{ "url": "https://example.com", "label": "Article" }],
  "isFavorite": true
}
```

- `tags` are **names**: existing tags are re-used (case-insensitive), new ones are created.
- `converted` status is set only when an idea becomes a project (Milestone 3).
- Links must be `http(s)://` addresses (no `javascript:` etc.). Max 20 tags and 20 links.

List query (`GET /ideas`):

| Parameter | Values |
|---|---|
| `search` | Words in the title or description; partial words match (`gard` finds "garden"); title matches rank higher |
| `status` | `inbox` `exploring` `planned` `converted` |
| `priority` | `low` `medium` `high` `urgent` `none` |
| `categoryId` | a category id, or `none` |
| `tagId` | a tag id |
| `favorite` | `true` / `false` |
| `archived` | `false` (default), `true`, `all` |
| `sort` / `order` | `updatedAt` (default), `createdAt`, `title`, `priority`, `relevance` (default when searching) / `asc` `desc` |
| `page` / `pageSize` | default 1 / 20 (max 100) |

Response: `{ "data": [ …ideas with excerpt, tags, category, linkCount ], "meta": { "page", "pageSize", "total", "totalPages" } }`.
Category and tag lists include `ideaCount`.

### Authentication

Every route requires a login **unless it is marked `@Public()`**. An access token is accepted from:

- the `ib_access` **httpOnly cookie** (web app; set automatically by login/register/refresh), or
- an `Authorization: Bearer <accessToken>` header (mobile app, API tools).

| Token | Lifetime | Web (cookies) | Mobile (`X-Client: mobile` header) |
|---|---|---|---|
| Access token (JWT, HS256) | 15 min | `ib_access` cookie, path `/` | `accessToken` in the response body |
| Refresh token (random, stored hashed) | 30 days | `ib_refresh` cookie, path `/api/v1/auth` | `refreshToken` in the body; send it back as `{ "refreshToken": "..." }` |
| Session marker | 30 days | `ib_session=1` (no secret; lets the web app's routing know a session exists) | none |

Request and response examples:

```http
POST /api/v1/auth/register
Content-Type: application/json

{ "email": "lucie@example.com", "password": "correct horse battery staple", "displayName": "Lucie" }
```

```json
201 Created   (plus Set-Cookie: ib_access, ib_refresh, ib_session)
{ "user": { "id": "…", "email": "lucie@example.com", "displayName": "Lucie", "bio": null, "timezone": "UTC", "createdAt": "…" } }
```

With `X-Client: mobile`, the same response also contains `accessToken`, `accessTokenExpiresIn` and `refreshToken`, and no cookies are set.

Security behaviour:

- Passwords: at least 12 characters, at most 128, no symbol rules. Hashed with **argon2id**.
- Wrong password and unknown email return the **same** `401 Invalid email or password.`, in the same time.
- **Refresh token rotation**: every refresh revokes the used token. Re-using an old token (outside a 15-second
  two-tab grace window) is treated as theft and **ends that whole session**.
- Login, registration, forgot/reset/change password: 5 attempts per minute per IP (`429 Too many attempts…`).
- **Per-account limits** (independent of IP, so rotating or faking IPs doesn't help): after 10 failed logins
  in 15 minutes, that email's login is paused (`429`) even for the right password. A successful login
  resets the count. At most 3 reset emails per address per hour (extra requests get the same `202`, but no
  email). Both apply to unknown emails too, so they reveal nothing. Counts are kept in memory (reset on
  restart; several API servers would need a shared store such as Redis).
- **Password reset**: the link (`WEB_APP_URL/reset-password?token=…`) works once, expires after 30 minutes, and
  requesting a new one cancels older ones. Only a hash of the token is stored. The email is sent in the
  background, so the response time doesn't reveal whether the account exists.
- A wrong *current* password on change-password returns **400** (not 401), so clients don't mistake it for an
  expired session.
- After logout, the access token is no longer stored in the browser; a copied access token would still
  work until it expires (at most 15 minutes). That's the trade-off of stateless tokens.

Full, interactive documentation: `/api/docs` (disabled when `NODE_ENV=production`).

### Projects: rules

- Statuses: `not_started` `planning` `in_progress` `on_hold` `completed` `cancelled`. `completedAt` is set when the status
  becomes `completed`, and cleared if it's reopened.
- Dates `startDate` / `targetDate` are plain `YYYY-MM-DD` dates (no time zone). The target can't be before the start
  (checked in the API and by a database constraint).
- `isOverdue`: the target date has passed **in the user's time zone** and the project isn't completed/cancelled.
- `progress`: `{ percent, basis, completed, total }`. Completed projects are 100%. Otherwise tasks (from Milestone 4),
  else milestones, else 0% with basis `none`.
- Every milestone change returns the **whole updated project** (with new progress), so clients need one request.
- Milestones have `isOverdue` too (due date passed in your time zone, not completed).

### Tasks: rules

- Statuses `todo` `in_progress` `done`; "pending" = not done. `completedAt` is set when done.
- Subtasks: one level deep, always in the parent's project. Moving a task moves its subtasks; a subtask can't move alone.
- Completing a task completes its open subtasks; reopening doesn't reopen them.
- `isOverdue`: the due date has passed in the user's time zone and the task isn't done. The due date can't be before the start date.
- Default sort: due date (soonest first, undated last), then priority. Lists show top-level tasks with `subtasks: { completed, total }`.
- **Project progress** now uses top-level tasks when a project has any (else milestones). Projects include `tasks: { completed, total }`.
- Deleting a project deletes its tasks.

### Notes and resources: rules

- **Note content** is Tiptap editor JSON (`{ "type": "doc", "content": [...] }`). The API rebuilds it from a whitelist
  (`src/modules/notes/note-content.ts`): paragraphs, headings 1–3, bullet/numbered/task lists, quotes, code blocks,
  horizontal rules, line breaks; bold, italic, strike, underline, code, links. Anything else → **400**. Unknown
  attributes are dropped. Links must be `http(s)://` or `mailto:`. Max ~200 KB per note.
- The API extracts the plain text itself (search + `excerpt`); clients must render content with the editor, never as HTML.
- Autosave: sending the same content again changes nothing (not even "last edited"). Note edits aren't logged one by one
  in the activity feed (only created/deleted, and "Added note" on a project).
- **Resource urls** must be `http://` or `https://`. Types: `website` (default), `article`, `video`, `document`, `other`.
- **Attaching**: a note or resource belongs to at most ONE idea or ONE project (database CHECK). Sending `ideaId` detaches
  it from its project and vice versa; `null` detaches. Deleting the idea/project keeps it (unattached).
- Requests larger than **300 KB** are refused with **413** (standard error shape).

## Project structure

```
src/
├── main.ts                 Entry point: creates the app, applies setup, starts listening
├── app.module.ts           Root module: config, database, feature modules
├── app.setup.ts            Global setup shared by main.ts and tests (prefix, helmet, validation, errors, Swagger)
├── config/                 Environment validation and shared database options
├── common/                 Cross-cutting code (error filter, rate limits, pagination, database helpers)
├── database/
│   ├── data-source.ts      Data source used by the TypeORM CLI and test setup
│   └── migrations/         Migration files
└── modules/                One folder per feature
    ├── auth/               Login, tokens, cookies, global JwtAuthGuard, @Public/@CurrentUser
    ├── users/              User entity, profile endpoints
    ├── categories/         Categories (palette colours, case-insensitive unique names)
    ├── tags/               Tags
    ├── activity/           Activity log ("Recent activity")
    ├── ideas/              Ideas, links, search (PostgreSQL full-text), filters, archive, activity logging
    ├── projects/           Projects, milestones, idea conversion, related ideas, progress and overdue rules
    ├── tasks/              Tasks and subtasks, views (pending/overdue/completed), completion rules
    ├── notes/              Notes (Tiptap JSON), content sanitizer, autosave-friendly updates
    ├── resources/          Saved links with type, domain, notes
    ├── attachments/        Shared "attach to one idea or project" fields and rules
    ├── mail/               MailService (nodemailer → Mailpit in dev) and email templates
    └── health/             Health check
test/
├── setup/                  Jest global setup (runs migrations on the test DB)
├── utils/                  Test helpers (createTestApp, resetDatabase, auth helpers)
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
