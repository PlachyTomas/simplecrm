# Phase 12 — Deployment artifacts

- `docker-compose.prod.yml` — Postgres + backend + frontend with Traefik
  labels for Coolify's Let's Encrypt-managed TLS. Backend auto-runs
  `alembic upgrade head` before `uvicorn` boots.
- `.env.example` — every env var the compose file references, with
  comments. `openssl rand -base64 …` hints next to secret slots.
- `scripts/backup_postgres.sh` — pg_dump → gzip → S3-compatible upload
  (Hetzner Object Storage), prunes older than `BACKUP_RETENTION_DAYS`.
  Suitable for Coolify's scheduled-task runner or a host-level cron at
  02:00 Europe/Prague.
- `docs/runbook.md` — first-time deploy, frontend on Cloudflare Pages,
  backup + restore, secret rotation for each secret type, rollback via
  Coolify's per-deploy images + `alembic downgrade`, monitoring
  (Sentry + UptimeRobot), and a 9-step smoke-test checklist.

Validated:
- YAML parses (`yaml.safe_load`); three services registered.
- Shell script passes `bash -n` syntax check.

Deferred: real deploy + Lighthouse audit require a VM + DNS, which this
sandbox can't provision. The runbook is the production SOP.
