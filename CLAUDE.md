# IdeaBloom API: Claude Code Guide

This repo is the **backend** of IdeaBloom (NestJS + PostgreSQL + TypeORM + JWT, REST).
It owns all business logic, authorization and data access.

**Full project context:** the shared guide at `../CLAUDE.md` (decisions, milestones, progress log) and
the brief at `../docs/PROJECT_BRIEF.md`. Claude Code loads `../CLAUDE.md` automatically when started
inside this folder. At the start of a session, check its progress log to see where we are.

## Rules (repeated here in case this repo is used on its own)
- **Never** `git commit`, `git push`, force-push or pull with rebase. **Never** add Claude attribution or
  Co-authored-by lines. The owner commits and pushes everything.
- Never work on `main`. Use `feature/*` or `fix/*` branches from `develop`.
- Plan first and wait for approval before major changes. Explain decisions in simple English.
- `synchronize: false` always; database changes only through migrations. Ask before destructive DB operations.
- Every owned record is scoped by `user_id`; other users' records return 404. Add isolation tests.
- After each step, add an entry to the progress log in `../CLAUDE.md` (repo + branch + what's next).

## Commands
- `npm run db:up` / `npm run db:down`: Docker Postgres (dev :5442, test :5443) and Mailpit (:8025)
- `npm run start:dev`: API at http://localhost:4000/api/v1, Swagger at /api/docs
- `npm test` (unit), `npm run test:e2e` (needs `db:up`), `npm run lint:check`, `npm run format:check`, `npm run build`
- Migrations: `npm run migration:generate -- src/database/migrations/<Name>`, `migration:run`,
  `migration:revert`, `migration:show`

## Conventions
- Feature modules live in `src/modules/<feature>/` (module, controller, service, entities/, dto/, specs).
- Global setup is in `src/app.setup.ts` and shared with tests via `test/utils/create-test-app.ts`.
- New env vars go in `src/config/env.validation.ts`, `.env.example`, `.env.test` and the README table.
- Stay on the NestJS **11** family. Don't install v12 of `@nestjs/*` add-ons (they're ESM-only and
  break Jest on Node 22). Pin with `@^11` / `@nestjs/config@^4`. See `docs/ARCHITECTURE.md` decisions log.
- Update the README endpoint table and Swagger decorators when adding endpoints.
- Every route requires login by default (global JwtAuthGuard). Mark public routes with `@Public()`;
  get the user with `@CurrentUser() user: AuthUser`. Never take a user id from the request body.
- Every query on user-owned data must filter by the current user's id; return 404 for other users' records.
  Add an isolation test (user A can't see/change user B's data) for every new resource.
- Use `@AuthRateLimit()` on endpoints where credentials/tokens can be guessed.
  Per-account limits live in `AttemptLimiter` + `ACCOUNT_LIMITS` (override that provider in e2e tests;
  `.env.test` sets them very high).
- e2e tests: `createTestApp()`, `resetDatabase(app)` in `beforeEach`, and helpers in `test/utils/auth.ts`.
  Override MailService with `FakeMailService` (`test/utils/fake-mail.ts`) when a flow sends email.
- After `migration:generate`, check the SQL for unrelated no-op statements (e.g. ALTER of unchanged defaults).
- Generated columns: replace the hard-coded database name in `typeorm_metadata` queries with
  `const database = await queryRunner.getCurrentDatabase();` (in up AND down), then verify no drift with
  `npx typeorm-ts-node-commonjs migration:generate -d src/database/data-source.ts --dr src/database/migrations/Probe`.
- Ownership lookups: use `findOwned(userId, id)` (throws 404) from CategoriesService/TagsService; use
  `ParseUUIDPipe` on `:id` params. Log user actions with `ActivityService.log()`.
- Generate migrations with `migration:generate`, then review the SQL, test `migration:revert` on the test DB
  (`NODE_ENV=test`), and run `npm run format`.
- Tag-name lists in DTOs: `@IsTagNames(max, 'An item')`. Category/tag/idea/project shapes in responses: `common/dto/refs.dto.ts`.
- Notes/resources attachments: `AttachmentFieldsDto` + `resolveAttachment()` (`modules/attachments`).
- jsonb values come back with re-ordered keys: compare with `isDeepStrictEqual`, never `JSON.stringify`.
- Note content must go through `sanitizeNoteContent()`; never store or return client-sent HTML.
- Raw SQL: always parameterised ($1…); table/column names only from code constants, never from the request. Don't
  pass parameters a query doesn't use (PostgreSQL can't infer their type).
- e2e tests must not import files that use class-validator decorators before the app is created; put shared constants
  in plain files (e.g. `search.constants.ts`).
