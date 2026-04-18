# SimpleCRM runbook

Operational playbook for the deployed app. Covers first-time deployment,
backups, secret rotation, and rollback.

## First-time deployment (Hetzner + Coolify)

1. Provision a Hetzner CX23 (2 vCPU / 4 GB) in `fsn1` or `nbg1`. Ubuntu
   22.04, no pre-installed software.
2. Install Coolify on the VM per the official docs:
   ```bash
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
   ```
3. Point DNS at the VM's public IP:
   - `app.simplecrm.cz` → web
   - `api.simplecrm.cz` → API
4. In Coolify, create a new project. Add this repo as a Docker-Compose
   resource pointing at `docker-compose.prod.yml`.
5. Paste env vars from `.env.example`:
   - `POSTGRES_PASSWORD = $(openssl rand -base64 32)`
   - `JWT_SECRET = $(openssl rand -base64 48)`
   - Google OAuth: create credentials at
     <https://console.cloud.google.com/apis/credentials>, set the redirect
     URI to `https://api.simplecrm.cz/api/v1/auth/google/callback`.
   - Hetzner Object Storage keys for backups.
6. Deploy. On first boot the backend auto-runs `alembic upgrade head`
   which seeds the default plans and creates the schema.
7. Smoke-test: open `https://app.simplecrm.cz`, sign in with Google,
   confirm onboarding modal appears and the trial countdown is correct.

## Frontend: Cloudflare Pages (recommended)

The Dockerfile in `docker-compose.prod.yml` is kept for single-host
deployments, but the recommended setup is Cloudflare Pages:

1. Connect the repo to Pages; set the build root to `frontend/`.
2. Build command: `pnpm install --frozen-lockfile && pnpm build`.
3. Output directory: `dist`.
4. Environment variables: `VITE_API_BASE_URL=https://api.simplecrm.cz`.

## Backups

- Script: `scripts/backup_postgres.sh`. Uses `pg_dump` → gzip → upload to
  Hetzner Object Storage, and prunes older than `BACKUP_RETENTION_DAYS`
  (default 7).
- Schedule via Coolify's scheduled-task feature at `0 2 * * *`
  (02:00 Europe/Prague). Verify a dump completed successfully at least
  every Monday morning.
- Restoration procedure:
  1. Spin up a fresh Postgres 16 with the same env.
  2. `aws --endpoint-url … s3 cp s3://simplecrm-backups/<latest>.sql.gz .`
  3. `gunzip <latest>.sql.gz && psql -U simplecrm -d simplecrm < <latest>.sql`
  4. Restart the backend to reconnect to the fresh DB.

## Secret rotation

- `JWT_SECRET` — rotating invalidates every active session and refresh
  token. Do this only when a secret is suspected leaked. Steps:
  1. `openssl rand -base64 48` → new value.
  2. Update in Coolify, redeploy the backend.
  3. Communicate the forced logout in the `#sales` Slack channel.
- `GOOGLE_CLIENT_SECRET` — rotate in the Google Cloud Console, paste the
  new value into Coolify, redeploy. No session impact.
- `POSTGRES_PASSWORD` — harder; requires an ALTER USER in Postgres and
  a backend redeploy. Schedule downtime (~1 minute) or use Coolify's
  rolling-restart feature.

## Rollback

- Coolify keeps per-deploy images; use its "Redeploy previous build"
  button for frontend and backend independently.
- If a migration shipped a breaking change: `alembic downgrade -1`
  against the DB, then redeploy the previous backend image.

## Monitoring

- Sentry (EU region) receives backend exceptions; frontend integration is
  a follow-up. Set `SENTRY_DSN` to enable — the code is ready.
- UptimeRobot polls `GET /api/v1/healthz` and `GET /api/v1/healthz/db`
  every minute; pages on 2 consecutive failures.
- Structured JSON logs come out of stdout (uvicorn + FastAPI defaults);
  Coolify ships them to its log viewer.

## Smoke test checklist

Run after any prod deploy:

1. `curl https://api.simplecrm.cz/api/v1/healthz` → `{"status":"ok"}`.
2. `curl https://api.simplecrm.cz/api/v1/healthz/db` → `{"status":"ok"}`.
3. Load `https://app.simplecrm.cz` — landing renders with no console
   errors.
4. Click "Vyzkoušet 30 dní zdarma" — Google login, create account.
5. Complete the onboarding modal with a real IČO (e.g. `27082440`
   Alza.cz) — ARES fills the fields.
6. Navigate to Firmy, create a second company, confirm it lands in the
   list. Open detail → tab through Přehled / Poznámky.
7. Navigate to Pipeline, drag a deal between stages, confirm the move
   persists on reload.
8. On the deal detail, use "Označit jako vyhráno" — deal stamps
   `closed_at`, company's last_order_at resets.
9. Log out → landing shows again; refresh cookies are cleared.
