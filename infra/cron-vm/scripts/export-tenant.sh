#!/usr/bin/env bash
# infra/cron-vm/scripts/export-tenant.sh — Per-tenant data export.
#
# Phase 3 §3.7. Exports all data belonging to a specific tenant (user_id)
# as a JSON file to GCS. Used for:
#   - GDPR data-portability requests
#   - Per-tenant backup verification (rehearsed weekly)
#   - Pre-deletion data extraction
#
# Usage:
#   export-tenant.sh <user_id>
#
# Output: gs://${GCS_BACKUP_BUCKET}/tenant-exports/<user_id>/<YYYY-MM-DD>.json
#
# The script exports all tenant-owned tables (tables with a user_id column)
# as a single JSON object: { "userId": "...", "exportedAt": "...", "tables": { ... } }

set -euo pipefail

# shellcheck source=./_load-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/_load-env.sh" /opt/hamafx/.env

USER_ID="${1:-}"
if [[ -z "$USER_ID" ]]; then
  echo "Usage: $0 <user_id>" >&2
  exit 1
fi

DB_URL="${ADMIN_DATABASE_URL:-${DIRECT_URL:-${POSTGRES_URL_NON_POOLING:-${DATABASE_URL:-${POSTGRES_URL:-}}}}}"
: "${DB_URL:?Set ADMIN_DATABASE_URL (preferred) or DIRECT_URL / POSTGRES_URL_NON_POOLING / DATABASE_URL / POSTGRES_URL in /opt/hamafx/.env}"
: "${GCS_BACKUP_BUCKET:?GCS_BACKUP_BUCKET must be set}"

HC_UUID="${HC_TENANT_EXPORT_UUID:-}"
DATE_UTC="$(date -u +%Y-%m-%d)"
TARGET="gs://${GCS_BACKUP_BUCKET}/tenant-exports/${USER_ID}/${DATE_UTC}.json"

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

log() { printf '%s [export-tenant] %s\n' "$(date -u +%FT%TZ)" "$*"; }

ping_hc start
log "exporting tenant data for user_id=${USER_ID} → ${TARGET}"

# List of tenant-owned tables (tables with a user_id column).
# Keep in sync with packages/db/src/schema/*.ts.
TENANT_TABLES=(
  "chat_threads"
  "chat_messages"
  "chat_telemetry"
  "chat_tool_telemetry"
  "alerts"
  "journal_entries"
  "memory_embeddings"
  "push_subscriptions"
  "shared_snapshots"
  "user_symbols"
  "agent_opinions"
  "decision_signals"
  "decision_signal_outcomes"
  "decision_signal_feedback"
  "portfolio_positions"
  "portfolio_settings"
  "notification_noise_state"
  "bot_links"
  "provider_tests"
  "briefings_emitted"
  "daily_ai_spend"
  "user_sessions"
  "rate_limits"
  "audit_logs"
  "user_settings"
)

# Build a JSON export using psql's JSON capabilities.
# Each table is exported as a JSON array keyed by table name.
SQL_HEADER="SELECT json_build_object('userId', '${USER_ID}', 'exportedAt', now()::text, 'tables', jsonb_object_agg(table_name, rows)) FROM ("
SQL_BODY=""
for i in "${!TENANT_TABLES[@]}"; do
  TABLE="${TENANT_TABLES[$i]}"
  if [[ $i -gt 0 ]]; then
    SQL_BODY+=" UNION ALL "
  fi
  SQL_BODY+="SELECT '${TABLE}' AS table_name, COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM ${TABLE} t WHERE t.user_id = '${USER_ID}'), '[]'::jsonb) AS rows"
done
SQL_FOOTER=") sub;"

FULL_SQL="${SQL_HEADER}${SQL_BODY}${SQL_FOOTER}"

if ! psql --dbname="$DB_URL" -A -t -c "$FULL_SQL" | gsutil -q cp - "$TARGET"; then
  log "export failed for user_id=${USER_ID}"
  ping_hc fail "export failed for ${USER_ID}"
  exit 1
fi

log "export complete → ${TARGET}"
ping_hc success "exported ${USER_ID} to ${TARGET}"
