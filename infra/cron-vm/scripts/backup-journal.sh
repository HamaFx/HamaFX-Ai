#!/usr/bin/env bash
# infra/cron-vm/scripts/backup-journal.sh — Nightly journal-only export to B2.
#
# B2 setup is intentionally deferred. The script fails clearly until the
# operator configures the B2 account and installs rclone.
#
# Output: B2 journal/YYYY-MM-DD.json
# Retention: seven days, enforced by the B2 lifecycle policy.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_load-env.sh" /opt/kestrel/.env
source "$SCRIPT_DIR/backup-storage.sh"

JOURNAL_DB_URL="${DIRECT_URL:-${POSTGRES_URL_NON_POOLING:-${DATABASE_URL:-${POSTGRES_URL:-}}}}"
: "${JOURNAL_DB_URL:?Set DIRECT_URL (preferred) or POSTGRES_URL_NON_POOLING / DATABASE_URL / POSTGRES_URL}"

HC_UUID="${HC_BACKUP_JOURNAL_UUID:-}"
DATE_UTC="$(date -u +%Y-%m-%d)"
TARGET="journal/${DATE_UTC}.json"

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
log "exporting journal_entries → B2 ${TARGET}"

set -o pipefail
if ! psql "$JOURNAL_DB_URL" -A -t \
  -c "SELECT COALESCE(json_agg(j), '[]'::json) FROM journal_entries j;" \
  | backup_storage_upload_stream "$TARGET"; then
  log 'psql | B2 upload failed'
  ping_hc fail "psql/B2 upload failed at $DATE_UTC"
  exit 1
fi

ROW_COUNT="$(psql "$JOURNAL_DB_URL" -A -t -c 'SELECT COUNT(*) FROM journal_entries;' || echo '?')"
log "exported $ROW_COUNT rows provider=b2 retention=7d"
ping_hc success "rows=$ROW_COUNT target=$TARGET provider=b2 retention=7d"
