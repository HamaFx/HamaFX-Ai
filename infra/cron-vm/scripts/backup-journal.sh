#!/usr/bin/env bash
# infra/cron-vm/scripts/backup-journal.sh — Nightly journal-only export.
#
# Phase 8 PR-17 belt-and-suspenders. If pg_dump's custom format ever
# breaks, the human-readable JSON file still has every trade. 90-day
# retention, lifecycle-managed.
#
# Output: gs://hamafx-backups-${PROJECT_ID}/journal/YYYY-MM-DD.json

set -euo pipefail

# shellcheck source=./_load-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/_load-env.sh" /opt/hamafx/.env

JOURNAL_DB_URL="${DIRECT_URL:-${POSTGRES_URL_NON_POOLING:-${DATABASE_URL:-${POSTGRES_URL:-}}}}"
: "${JOURNAL_DB_URL:?Set DIRECT_URL (preferred) or POSTGRES_URL_NON_POOLING / DATABASE_URL / POSTGRES_URL}"
: "${GCS_BACKUP_BUCKET:?GCS_BACKUP_BUCKET must be set}"

HC_UUID="${HC_BACKUP_JOURNAL_UUID:-}"
DATE_UTC="$(date -u +%Y-%m-%d)"
TARGET="gs://${GCS_BACKUP_BUCKET}/journal/${DATE_UTC}.json"

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

log() { printf '%s [backup-journal] %s\n' "$(date -u +%FT%TZ)" "$*"; }

ping_hc start
log "exporting journal_entries → $TARGET"

# `psql` with -A -t -c gives unaligned, tuples-only output — perfect for
# streaming `json_agg` straight into gsutil. Empty table case yields
# the literal string `null` which we coerce to `[]`.
set -o pipefail
if ! psql "$JOURNAL_DB_URL" -A -t \
  -c "SELECT COALESCE(json_agg(j), '[]'::json) FROM journal_entries j;" \
  | gsutil -q cp - "$TARGET"; then
  log 'psql | gsutil failed'
  ping_hc fail "psql/gsutil failed at $DATE_UTC"
  exit 1
fi

# Quick row count for the ping body.
ROW_COUNT="$(psql "$JOURNAL_DB_URL" -A -t -c 'SELECT COUNT(*) FROM journal_entries;' || echo '?')"
log "exported $ROW_COUNT rows"
ping_hc success "rows=$ROW_COUNT target=$TARGET"
