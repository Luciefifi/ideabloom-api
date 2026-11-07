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
To be added in M0 Step 2 (install, run, test, migrations, Docker).
