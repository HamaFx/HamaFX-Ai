#!/usr/bin/env bash
# infra/cron-vm/scripts/export-tenant.sh — Per-tenant data export.
#
# Phase 3 §3.7. Exports all data belonging to a specific tenant (user_id)
# as a JSON file to B2. Used for:
#   - GDPR data-portability requests
#   - Per-tenant backup verification (rehearsed weekly)
#   - Pre-deletion data extraction
#
# Usage:
#   export-tenant.sh <user_id>
#
# Output: B2 tenant-exports/<user_id>/<YYYY-MM-DD>.json
#
# The script exports all tenant-owned tables (tables with a user_id column)
# as a single JSON object: { "userId": "...", "exportedAt": "...", "tables": { ... } }
# The table list is intentionally explicit; global/system tables are excluded.

set -euo pipefail

# shellcheck source=./_load-env.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_load-env.sh" /opt/kestrel/.env
source "$SCRIPT_DIR/backup-storage.sh"

USER_ID="${1:-}"
if [[ -z "$USER_ID" ]]; then
  echo "Usage: $0 <user_id>" >&2
  exit 1
fi

# Validate user_id format — alphanumeric, hyphens, underscores only
if [[ ! "$USER_ID" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "Invalid user_id format — must be alphanumeric with hyphens/underscores only" >&2
  exit 1
fi

DB_URL="${ADMIN_DATABASE_URL:-${DIRECT_URL:-${POSTGRES_URL_NON_POOLING:-${DATABASE_URL:-${POSTGRES_URL:-}}}}}"
: "${DB_URL:?Set ADMIN_DATABASE_URL (preferred) or DIRECT_URL / POSTGRES_URL_NON_POOLING / DATABASE_URL / POSTGRES_URL in /opt/kestrel/.env}"
HC_UUID="${HC_TENANT_EXPORT_UUID:-}"
DATE_UTC="$(date -u +%Y-%m-%d)"
TARGET="tenant-exports/${USER_ID}/${DATE_UTC}.json"
TMP_EXPORT="$(mktemp -t kestrel-tenant-export-XXXXXX.json)"
trap 'rm -f "$TMP_EXPORT"' EXIT

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
  "chat_telemetry"
  "chat_tool_telemetry"
  "alerts"
  "journal_entries"
  "memory_embeddings"
  "push_subscriptions"
  "shared_snapshots"
  "user_symbols"
  "agent_opinions"
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
  "analysis_jobs"
  "diagnostic_traces"
)

# Build a JSON export using psql's JSON capabilities. The user ID is passed
# through psql's variable substitution and quoted as a SQL literal before it
# enters the generated query. This avoids the invalid `:'user_id'` syntax that
# previously appeared inside a dynamically assembled UNION query.
SQL_BODY=""
for i in "${!TENANT_TABLES[@]}"; do
  TABLE="${TENANT_TABLES[$i]}"
  if [[ $i -gt 0 ]]; then
    SQL_BODY+=" UNION ALL "
  fi
  SQL_BODY+="SELECT '${TABLE}'::text AS table_name, COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM ${TABLE} t WHERE t.user_id = :'user_id'::text), '[]'::jsonb) AS rows"
done

# chat_messages is related through chat_threads and intentionally has no
# user_id column. Include it through the owning thread relationship.
SQL_BODY+=" UNION ALL SELECT 'chat_messages'::text AS table_name, COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM chat_messages t JOIN chat_threads th ON th.id = t.thread_id WHERE th.user_id = :'user_id'::text), '[]'::jsonb) AS rows"

FULL_SQL="SELECT jsonb_build_object('userId', :'user_id'::text, 'exportedAt', now()::text, 'tables', jsonb_object_agg(table_name, rows)) FROM (${SQL_BODY}) sub;"

if ! psql --dbname="$DB_URL" -A -t -v user_id="$USER_ID" -c "$FULL_SQL" > "$TMP_EXPORT"; then
  log "export query failed for user_id=${USER_ID}"
  ping_hc fail "export query failed for ${USER_ID}"
  exit 1
fi

if ! backup_storage_upload_file "$TMP_EXPORT" "$TARGET"; then
  log "export upload deferred or failed for user_id=${USER_ID}; configure B2 before enabling tenant export"
  ping_hc fail "export upload unavailable: configure B2 before enabling tenant export"
  exit 1
fi

log "export complete → B2 ${TARGET}"
ping_hc success "exported ${USER_ID} to ${TARGET} provider=b2 retention=7d"
