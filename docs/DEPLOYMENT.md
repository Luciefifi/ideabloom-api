# Deployment checklist (API)

IdeaBloom isn't deployed yet: the hosting choice will be made together (see the project guide). This list is what
any host needs, so nothing is forgotten when that happens.

## 1. Environment variables

The API checks them at startup (`src/config/env.validation.ts`) and refuses to start if one is invalid.

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` (also turns Swagger off) |
| `PORT` | Whatever the host gives you |
| `DATABASE_URL` | The production database, with TLS if the host offers it |
| `JWT_ACCESS_SECRET` | **New** random secret, at least 32 characters (e.g. `openssl rand -base64 48`). Never reuse the development one |
| `JWT_ACCESS_TTL_SECONDS` / `REFRESH_TOKEN_TTL_DAYS` | Defaults (900 / 30) are fine |
| `REGISTRATION_ENABLED` | `false` if only you should be able to sign up |
| `WEB_APP_URL` | The real web address (used in password-reset emails) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | A real email provider (Mailpit is for development only) |
| `TRUST_PROXY` | How many proxies sit in front of the API (see 2) |
| `RATE_LIMIT_*`, `LOGIN_*`, `PASSWORD_RESET_EMAILS_PER_HOUR` | Defaults are fine |

## 2. Network and cookies
- Serve the **web app and the API on the same site** (the web app forwards `/api/*` to the API), so the login cookies
  stay first-party. Use **HTTPS** everywhere: cookies are `Secure` in production.
- Next.js rewrites don't add the visitor's IP to `X-Forwarded-For`. Put a trusted proxy/load balancer in front that
  does, and set `TRUST_PROXY` to match; otherwise IP-based rate limits treat everyone as one visitor (the per-account
  limits still work).
- Don't expose PostgreSQL to the internet.

## 3. Database
- Run migrations on every deploy, **before** starting the new version: `npm run migration:run` (never `synchronize`).
- Turn on **automatic daily backups** and test a restore once.
- The app needs the `pgcrypto` extension (`gen_random_uuid`); most managed PostgreSQL services have it.

## 4. Before going live
- [ ] `npm ci && npm run build && npm test && npm run test:e2e` pass on the release commit
- [ ] `npm audit --omit=dev` shows no high/critical issues
- [ ] Health check `GET /api/v1/health` is used by the host to know the API is up
- [ ] Logs are kept (errors are logged with details on the server, never sent to clients)
- [ ] A test account can register, log in, reset its password by email and delete itself
