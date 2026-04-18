#!/usr/bin/env bash
# Daily Postgres backup — runs pg_dump then uploads to S3-compatible object
# storage (Hetzner by default). Prune old backups past BACKUP_RETENTION_DAYS.
#
# Intended to be scheduled daily at 02:00 Europe/Prague via Coolify's
# scheduled tasks, or host-level cron:
#   0 2 * * *  /opt/simplecrm/scripts/backup_postgres.sh >> /var/log/simplecrm-backup.log 2>&1
#
# Requires: pg_dump + aws-cli (or mc). See docs/runbook.md.
set -euo pipefail

: "${POSTGRES_USER:?}"
: "${POSTGRES_PASSWORD:?}"
: "${POSTGRES_DB:?}"
: "${BACKUP_S3_ENDPOINT:?}"
: "${BACKUP_S3_BUCKET:?}"
: "${BACKUP_S3_ACCESS_KEY:?}"
: "${BACKUP_S3_SECRET_KEY:?}"
: "${BACKUP_RETENTION_DAYS:=7}"

POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"

timestamp=$(date -u +"%Y%m%dT%H%M%SZ")
filename="simplecrm-${timestamp}.sql.gz"
local_path="/tmp/${filename}"

echo "[$(date -u +%FT%TZ)] Dumping ${POSTGRES_DB} → ${local_path}"
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  --host="${POSTGRES_HOST}" \
  --port="${POSTGRES_PORT}" \
  --username="${POSTGRES_USER}" \
  --format=plain \
  --no-owner \
  --no-privileges \
  "${POSTGRES_DB}" | gzip -9 > "${local_path}"

echo "[$(date -u +%FT%TZ)] Uploading to s3://${BACKUP_S3_BUCKET}/${filename}"
AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY}" \
AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_KEY}" \
aws --endpoint-url "${BACKUP_S3_ENDPOINT}" s3 cp \
  "${local_path}" "s3://${BACKUP_S3_BUCKET}/${filename}"

rm -f "${local_path}"

# Prune anything older than retention.
echo "[$(date -u +%FT%TZ)] Pruning backups older than ${BACKUP_RETENTION_DAYS} days"
cutoff_iso=$(date -u -d "${BACKUP_RETENTION_DAYS} days ago" +"%Y%m%dT%H%M%SZ" 2>/dev/null \
  || date -u -v-"${BACKUP_RETENTION_DAYS}"d +"%Y%m%dT%H%M%SZ")

AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY}" \
AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_KEY}" \
aws --endpoint-url "${BACKUP_S3_ENDPOINT}" s3 ls "s3://${BACKUP_S3_BUCKET}/" \
  | awk '{print $4}' | grep -E '^simplecrm-[0-9]{8}T[0-9]{6}Z\.sql\.gz$' \
  | while read -r old; do
      # Extract "YYYYMMDDTHHMMSSZ" between "simplecrm-" and ".sql.gz"
      stamp="${old#simplecrm-}"
      stamp="${stamp%.sql.gz}"
      if [[ "${stamp}" < "${cutoff_iso}" ]]; then
        echo "  rm s3://${BACKUP_S3_BUCKET}/${old}"
        AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY}" \
        AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_KEY}" \
        aws --endpoint-url "${BACKUP_S3_ENDPOINT}" s3 rm \
          "s3://${BACKUP_S3_BUCKET}/${old}"
      fi
    done

echo "[$(date -u +%FT%TZ)] Done."
