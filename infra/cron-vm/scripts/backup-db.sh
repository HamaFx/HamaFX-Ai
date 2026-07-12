#!/usr/bin/env bash
# infra/cron-vm/scripts/backup-db.sh — Nightly Postgres logical dump to GCS.
#
# Phase 8 PR-17. Runs at 03:00 UTC via hamafx-backup-db.timer.
#
# Output: gs://hamafx-backups-${PROJECT_ID}/db/YYYY-MM-DD.dump.gz
# Format: pg_dump --format=custom (binary, idempotent restore via pg_restore).
# Compression: gzip on stdin streaming — no /tmp staging, so a 1G dump
# only needs disk for the active stream.
# Retention: 30 days, enforced by the bucket lifecycle rule (PR-17 setup).

set -euo pipefail

# shellcheck source=./_load-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/_load-env.sh" /opt/hamafx/.env

DB_DUMP_URL="${DIRECT_URL:-${POSTGRES_URL_NON_POOLING:-${DATABASE_URL:-${POSTGRES_URL:-}}}}"
: "${DB_DUMP_URL:?Set DIRECT_URL (preferred) or POSTGRES_URL_NON_POOLING / DATABASE_URL / POSTGRES_URL in /opt/hamafx/.env}"
: "${GCS_BACKUP_BUCKET:?GCS_BACKUP_BUCKET must be set (e.g. hamafx-backups-hamafx-78845)}"

HC_UUID="${HC_BACKUP_DB_UUID:-}"
DATE_UTC="$(date -u +%Y-%m-%d)"
TARGET="gs://${GCS_BACKUP_BUCKET}/db/${DATE_UTC}.dump.gz"

ping_hc() {
  local status="${1:-success}"
  local body="${2:-}"
  [[ -z "$HC_UUID" ]] && return 0
  local url="https://hc-ping.com/$HC_UUID"
  [[ "$status" != "success" ]] && url="$url/$status"
  if [[ -n "$body" ]]; then
    curl -fsS -m 5 --data "$body" "$url" >/dev/null 2>&1 || true
  else
    curl -fsS -m 5 "$url" >/dev/null 2>&1 || true
  fi
}

log() { printf '%s [backup-db] %s\n' "$(date -u +%FT%TZ)" "$*"; }

# Start ping is fire-and-forget so the dump can run concurrently.
ping_hc start

START=$(date +%s)
# Warn if using a pooled connection — pg_dump through PgBouncer can produce
# inconsistent dumps or fail. Set DIRECT_URL for reliable backups.
if [[ "$DB_DUMP_URL" == *"pooler"* ]] || [[ "$DB_DUMP_URL" == *"pgbouncer"* ]]; then
  log "WARNING: Using pooled connection for pg_dump — set DIRECT_URL for reliable backups"
fi

log "dumping → $TARGET"

set -o pipefail
if ! pg_dump --format=custom --no-owner --no-privileges --dbname="$DB_DUMP_URL" \
  | gzip --rsyncable \
  | gsutil -q cp - "$TARGET"; then
  log 'pg_dump | gzip | gsutil failed'
  ping_hc fail "pg_dump pipeline failed at $DATE_UTC"
  exit 1
fi

DURATION=$(( $(date +%s) - START ))

# `gsutil stat` to confirm the object exists + report its size.
SIZE_BYTES="$(gsutil stat "$TARGET" 2>/dev/null | awk '/Content-Length/ {print $2}' || echo 0)"

log "done size=${SIZE_BYTES}B duration=${DURATION}s"
ping_hc success "size=${SIZE_BYTES}B duration=${DURATION}s target=${TARGET}"
