# IdeaBloom API

> Your ideas, in full bloom.

The backend for **IdeaBloom**, a personal workspace for capturing ideas and growing them into projects,
tasks, milestones, notes and resources.

This API owns all business logic, authentication and data access. The web app
([ideabloom-web](https://github.com/Luciefifi/ideabloom-web)) and the future mobile app
([ideabloom-mobile](https://github.com/Luciefifi/ideabloom-mobile)) both use it.

## Tech stack

- [NestJS](https://nestjs.com/) + TypeScript
- PostgreSQL + TypeORM (with migrations)
- REST API with JWT authentication
- Swagger / OpenAPI documentation

## Status

🚧 Milestone 0 (Foundation) is in progress. Installation, development and testing instructions will
be added as the project is set up.

## Branches

| Branch | Purpose |
|---|---|
| `main` | Stable, tested code |
| `develop` | Integration branch |
| `feature/<name>` | New functionality, branched from `develop` |
| `fix/<name>` | Bug fixes |
| `release/<version>` | Release preparation |
