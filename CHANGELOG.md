# Changelog: IdeaBloom API

All notable changes, newest first. Versions follow [semantic versioning](https://semver.org):
`MAJOR.MINOR.PATCH`. Each release is an annotated Git tag on `main`.

## [1.0.0] - unreleased

### Added
- **Preferences** in `PATCH /users/me` (`preferences.theme`: light/dark/system, `preferences.startPage`:
  dashboard/ideas/tasks), merged with what is saved and returned on every user response.
- **Signed-in devices**: `GET /auth/sessions` (short device label, signed in, last active, "this device") and
  `DELETE /auth/sessions/:id` to sign one device out.
- **Download my data**: `GET /users/me/export` (all your content as JSON; no password, token or search data).
- **Delete my account**: `DELETE /auth/account` (password + `"DELETE"`), removing everything you own.
- Access tokens carry the session id (`sid`) so "this device" can be recognised.

### Changed
- Sessions store only a short device label (e.g. "Chrome on Windows"); the full browser string is no longer
  stored (migration `RefreshTokenDeviceLabel` converts existing sessions, then removes it).

### Fixed
- Saving one preference no longer resets the others (undefined fields from validation were overwriting them).

## [0.8.0] - 2026-11-08
### Added
- `GET /calendar`: tasks (with subtasks), milestones and project start/target dates with done/overdue.
- `GET /search`: global full-text search across ideas, projects, tasks, notes and resources, ranked, with
  highlight markers (private-use characters, never HTML). Search indexes for projects and tasks.

## [0.7.0] - 2026-11-08
### Added
- `GET /dashboard`: counts, deadlines (overdue + next 14 days), active projects with progress, tasks completed per week.

## [0.6.0] - 2026-11-08
### Added
- Notes (Tiptap JSON, whitelisted and rebuilt by the API, plain-text search) and resources (saved links),
  attachable to one idea or project; tag/category usage counts include them.
- JSON body limit 300 KB.
### Fixed
- Oversized requests returned 500 instead of 413.

## [0.5.0] - 2026-11-08
### Added
- Tasks and subtasks: views (pending/overdue/completed/all), completion rules, project progress from tasks.

## [0.4.0] - 2026-11-08
### Added
- Projects and milestones, converting an idea into a project, related ideas, progress and overdue in your time zone.

## [0.3.0] - 2026-11-08
### Added
- Categories, tags and ideas (full-text search, filters, archive, favourites, links) and the activity log.

## [0.2.1] - 2026-11-07
### Fixed
- Per-account limits for failed logins and password-reset emails (independent of IP address).

## [0.2.0] - 2026-11-07
### Added
- Accounts: register, login, refresh with rotation and reuse detection, logout (one or all devices), password
  reset by email, change password, profile.

## [0.1.0] - 2026-11-07
### Added
- Project foundation: NestJS 11, PostgreSQL + TypeORM migrations, configuration checks, health check, Swagger,
  security headers, consistent error format.
