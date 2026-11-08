# Deployment (API)

IdeaBloom runs on free plans (chosen 2026-11-08, see the decisions log in `docs/ARCHITECTURE.md`):

| Part | Where | Notes |
|---|---|---|
| API (this repo) | **Vercel**, Hobby plan | Runs as a Vercel Function in Frankfurt (`vercel.json`) |
| Database | **Neon**, Free plan | PostgreSQL in AWS Europe Central 1 (Frankfurt) |
| Emails | **Brevo**, Free plan | Password-reset emails over SMTP |
| Web app | **Vercel**, Hobby plan | See `ideabloom-web/docs/DEPLOYMENT.md` |

The owner creates the accounts and types every secret. Secrets never go in Git, in chat or in this file.

## Part 1: Database (Neon)

1. Sign in at https://neon.com (GitHub login is fine) and create a project:
   - name `ideabloom`, PostgreSQL version: the newest offered, region **AWS Europe Central 1 (Frankfurt)**.
2. Open **Connect** and copy two connection strings for the `neondb` database (keep them private):
   - **Pooled** (the host contains `-pooler`): for the API on Vercel. Many short-lived copies of the API share it.
   - **Direct** (turn "Connection pooling" off): for running migrations from your computer.

## Part 2: Create the tables (migrations, from your computer)

Run this from the `ideabloom-api` folder **on the release you're deploying** (`git switch main; git pull`), in
PowerShell. The variable set in the terminal wins over your `.env`, and only lasts for this window:

```powershell
$env:DATABASE_URL = "<Neon DIRECT connection string>"
npm run migration:show
npm run migration:run
Remove-Item Env:DATABASE_URL
```

`migration:show` should list every migration with `[ ]` first; after `migration:run`, all show `[X]`.
On every later release: run migrations the same way **before** the new version goes live (before merging to
`main`, since Vercel deploys `main` automatically). Never use `synchronize`.

## Part 3: Email (Brevo)

1. Sign in at https://www.brevo.com.
2. **Senders, domains & dedicated IPs → Senders**: add the address emails should come from (e.g. your Gmail) and
   verify it with the link Brevo sends.
3. **SMTP & API → SMTP**: note the **SMTP login** and create an **SMTP key** (this is the password; it is shown once).

## Part 4: The API on Vercel

1. In Vercel: **Add New → Project**, import `Luciefifi/ideabloom-api`. Vercel recognises NestJS; leave the build
   settings as they are.
2. Before the first deploy, open **Environment Variables** and add these for **Production** only:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` (also turns Swagger off) |
| `DATABASE_URL` | Neon **pooled** connection string |
| `JWT_ACCESS_SECRET` | A **new** random secret, at least 32 characters. Generate one in PowerShell: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`. Never reuse the development one |
| `WEB_APP_URL` | The web app address, e.g. `https://ideabloom-web.vercel.app` (update it once the web project exists) |
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` |
| `SMTP_SECURE` | `false` (port 587 upgrades to an encrypted connection) |
| `SMTP_USER` | Brevo SMTP login |
| `SMTP_PASSWORD` | Brevo SMTP key |
| `MAIL_FROM` | `IdeaBloom <the sender you verified>` |
| `TRUST_PROXY` | `1` (Vercel sets `X-Forwarded-For` itself and doesn't pass on what visitors send) |
| `REGISTRATION_ENABLED` | `true` at first; `false` once your account exists (Part 6) |

   The other variables (token lifetimes, rate limits) keep their defaults.
3. **Settings → Git**: the production branch is `main`. Pushes to other branches create *preview* deployments;
   they have no environment variables, so they stop at startup ("Invalid environment variables") and never
   touch the database. That's expected.
4. Deploy, then open `https://<your-api-project>.vercel.app/api/v1/health`: it should answer `{"status":"ok", ...}` with the database "up".

## Part 5: The web app

Follow `ideabloom-web/docs/DEPLOYMENT.md`. Then set `WEB_APP_URL` above to the real web address and redeploy the
API (**Deployments → … → Redeploy**), so reset emails link to the right place.

## Part 6: Before and after going live

- [ ] On the release commit: `npm ci && npm run build && npm test && npm run test:e2e` pass
- [ ] `npm audit --omit=dev` shows no high/critical issues
- [ ] Health check answers on the Vercel address
- [ ] Through the **web address**: register your account, log out, log in, reset your password by email (check
      the email arrives and the link opens the web app), change a setting
- [ ] Login cookies are `Secure` (browser dev tools → Application → Cookies)
- [ ] Then set `REGISTRATION_ENABLED=false` and redeploy, so nobody else can sign up
- [ ] Download your data from Settings now and then: Neon's free plan can only undo recent changes

## Good to know

- **Network and cookies**: the browser only talks to the web app; the web app forwards `/api/*` to this API, so
  login cookies stay first-party. Vercel serves HTTPS (with HSTS) on `*.vercel.app`.
- **IP-based rate limits** see the addresses Vercel uses for that forwarding, not each visitor's. The per-account
  limits (failed logins, reset emails) don't depend on IPs and are stored in the database, so they work fully.
- **Waking up**: Neon pauses the database when idle; the first request after a break takes a moment longer.
- **Logs**: Vercel → the API project → **Logs**. Errors are logged with details there, never sent to visitors.
  Free-plan logs are kept only for a short time.
- **Limits**: requests up to 4.5 MB (the API accepts 300 KB), 1 GB of database storage. Plenty for one person.
- The app needs `gen_random_uuid()` (built into PostgreSQL 13+); Neon has it.
- Don't expose the database elsewhere: only the API and your migrations use the connection strings.
