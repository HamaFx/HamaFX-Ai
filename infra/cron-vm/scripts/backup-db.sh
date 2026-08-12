#!/usr/bin/env bash
# infra/cron-vm/scripts/backup-db.sh — Nightly Postgres logical dump to B2.
#
# B2 setup is intentionally deferred. The script fails clearly until the
# operator configures BACKUP_PROVIDER=b2, B2_BUCKET, B2_KEY_ID,
# B2_APPLICATION_KEY, and installs rclone.
#
# Output: B2 db/YYYY-MM-DD.dump.gz
# Retention: seven days, enforced by the B2 lifecycle policy configured when
# the account is connected. The dated object names also make retention
# auditable and avoid accidental overwrites.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_load-env.sh" /opt/kestrel/.env
source "$SCRIPT_DIR/backup-storage.sh"

DB_DUMP_URL="${DIRECT_URL:-${POSTGRES_URL_NON_POOLING:-${DATABASE_URL:-${POSTGRES_URL:-}}}}"
: "${DB_DUMP_URL:?Set DIRECT_URL (preferred) or POSTGRES_URL_NON_POOLING / DATABASE_URL / POSTGRES_URL in /opt/kestrel/.env}"

HC_UUID="${HC_BACKUP_DB_UUID:-}"
DATE_UTC="$(date -u +%Y-%m-%d)"
TARGET="db/${DATE_UTC}.dump.gz"

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

ping_hc start
START=$(date +%s)

if [[ "$DB_DUMP_URL" == *"pooler"* ]] || [[ "$DB_DUMP_URL" == *"pgbouncer"* ]]; then
  log "WARNING: Using pooled connection for pg_dump — set DIRECT_URL for reliable backups"
fi

log "dumping → B2 ${TARGET}"
set -o pipefail
if ! pg_dump --format=custom --no-owner --no-privileges --dbname="$DB_DUMP_URL" \
  | gzip --rsyncable \
  | backup_storage_upload_stream "$TARGET"; then
  log 'pg_dump | gzip | B2 upload failed'
  ping_hc fail "pg_dump pipeline failed at $DATE_UTC"
  exit 1
fi

DURATION=$(( $(date +%s) - START ))
SIZE_BYTES="$(backup_storage_size "$TARGET" 2>/dev/null || echo 0)"
log "done provider=b2 target=${TARGET} size=${SIZE_BYTES:-0}B duration=${DURATION}s retention=7d"
ping_hc success "size=${SIZE_BYTES:-0}B duration=${DURATION}s target=${TARGET} provider=b2 retention=7d"
