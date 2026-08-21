#!/usr/bin/env bash
# infra/cron-vm/scripts/delete-tenant.sh — Per-tenant data deletion.
#
# Phase 3 §3.7. Deletes all data belonging to a specific tenant (user_id).
# Used for:
#   - GDPR right-to-erasure requests
#   - Per-tenant deletion rehearsal (rehearsed weekly against a restored copy)
#
# Usage:
#   delete-tenant.sh <user_id> [--confirm]
#
# Without --confirm, the script runs in dry-run mode and only reports what
# would be deleted. With --confirm, it performs the actual deletion.
#
# SAFETY: This script requires ADMIN_DATABASE_URL (BYPASSRLS role) to ensure
# all tenant data is reached regardless of RLS policies. It also requires
# explicit --confirm to prevent accidental data loss.

set -euo pipefail

# shellcheck source=./_load-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/_load-env.sh" /opt/kestrel/.env

USER_ID="${1:-}"
CONFIRM=""
if [[ "${2:-}" == "--confirm" ]]; then
  CONFIRM="yes"
fi

if [[ -z "$USER_ID" ]]; then
  echo "Usage: $0 <user_id> [--confirm]" >&2
  exit 1
fi

# Validate user_id format — alphanumeric, hyphens, underscores only
if [[ ! "$USER_ID" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "Invalid user_id format — must be alphanumeric with hyphens/underscores only" >&2
  exit 1
fi

DB_URL="${ADMIN_DATABASE_URL:-${DIRECT_URL:-${POSTGRES_URL_NON_POOLING:-${DATABASE_URL:-${POSTGRES_URL:-}}}}}"
: "${DB_URL:?Set ADMIN_DATABASE_URL (preferred) or DIRECT_URL / POSTGRES_URL_NON_POOLING / DATABASE_URL / POSTGRES_URL in /opt/kestrel/.env}"

HC_UUID="${HC_TENANT_DELETE_UUID:-}"

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

log() { printf '%s [delete-tenant] %s\n' "$(date -u +%FT%TZ)" "$*"; }

# Tenant-owned tables ordered by FK dependency (children first).
# chat_messages depends on chat_threads, etc.
TENANT_TABLES=(
  "chat_tool_telemetry"
  "chat_telemetry"
  "diagnostic_traces"
  "agent_opinions"
  "memory_embeddings"
  "alerts"
  "journal_entries"
  "briefings_emitted"
  "daily_ai_spend"
  "push_subscriptions"
  "shared_snapshots"
  "notification_noise_state"
  "bot_links"
  "provider_tests"
  "portfolio_positions"
  "portfolio_settings"
  "user_symbols"
  "rate_limits"
  "audit_logs"
  "user_sessions"
  "user_settings"
  "chat_threads"
)

# Safety rehearsal: verify DB connectivity, then refuse the protected system
# identity. This proves the maintenance path can reach the database without
# ever inspecting or deleting a real tenant.
if [[ "$USER_ID" == "__system__" ]]; then
  if ! psql --dbname="$DB_URL" -A -t -c 'SELECT 1' >/dev/null 2>&1; then
    log 'SAFETY CHECK FAILED — database connectivity check failed'
    ping_hc fail 'safety-check: database connectivity failed'
    exit 1
  fi
  log "SAFETY CHECK PASSED — refusing to delete __system__ user (protected system account)."
  ping_hc success 'safety-check: database reachable and protected __system__ account was not deleted'
  exit 0
fi

if [[ -z "$CONFIRM" ]]; then
  log "DRY RUN — no data will be deleted. Use --confirm to actually delete."
  ping_hc start
fi

log "processing tenant deletion for user_id=${USER_ID} (${CONFIRM:-dry-run})"

TOTAL_ROWS=0

# chat_messages is owned by chat_threads and has no user_id column. Count and,
# when confirmed, remove it before deleting the owning threads (whose FK has
# ON DELETE CASCADE as a second safety net).
if ! MESSAGE_COUNT=$(psql --dbname="$DB_URL" -A -t -v user_id="$USER_ID" -c \
  "SELECT COUNT(*) FROM chat_messages WHERE thread_id IN (SELECT id FROM chat_threads WHERE user_id = :'user_id');" 2>/dev/null); then
  log 'ERROR: tenant deletion query failed for table chat_messages'
  ping_hc fail 'tenant deletion query failed for table chat_messages'
  exit 1
fi
MESSAGE_COUNT="${MESSAGE_COUNT// /}"
if [[ "$MESSAGE_COUNT" =~ ^[0-9]+$ ]] && (( MESSAGE_COUNT > 0 )); then
  log "  chat_messages: ${MESSAGE_COUNT} rows"
  TOTAL_ROWS=$((TOTAL_ROWS + MESSAGE_COUNT))
  if [[ -n "$CONFIRM" ]] && ! psql --dbname="$DB_URL" -v user_id="$USER_ID" -c \
    "DELETE FROM chat_messages WHERE thread_id IN (SELECT id FROM chat_threads WHERE user_id = :'user_id');" >/dev/null 2>&1; then
    log 'ERROR: tenant deletion failed for table chat_messages'
    ping_hc fail 'tenant deletion failed for table chat_messages'
    exit 1
  fi
fi

for TABLE in "${TENANT_TABLES[@]}"; do
  # Count rows for this tenant using psql variables (parameterized to prevent SQL injection).
  if ! COUNT=$(psql --dbname="$DB_URL" -A -t -v user_id="$USER_ID" -c \
    "SELECT COUNT(*) FROM ${TABLE} WHERE user_id = :'user_id';" 2>/dev/null); then
    log "ERROR: tenant deletion query failed for table ${TABLE}"
    ping_hc fail "tenant deletion query failed for table ${TABLE}"
    exit 1
  fi
  COUNT="${COUNT// /}"
  if [[ "$COUNT" =~ ^[0-9]+$ ]] && (( COUNT > 0 )); then
    log "  ${TABLE}: ${COUNT} rows"
    TOTAL_ROWS=$((TOTAL_ROWS + COUNT))
    if [[ -n "$CONFIRM" ]]; then
      if ! psql --dbname="$DB_URL" -v user_id="$USER_ID" -c \
        "DELETE FROM ${TABLE} WHERE user_id = :'user_id';" >/dev/null 2>&1; then
        log "ERROR: tenant deletion failed for table ${TABLE}"
        ping_hc fail "tenant deletion failed for table ${TABLE}"
        exit 1
      fi
    fi
  fi
done

# Finally, soft-delete the user record itself (set deleted_at).
if [[ -n "$CONFIRM" ]]; then
  if ! psql --dbname="$DB_URL" -v user_id="$USER_ID" -c \
    "UPDATE \"user\" SET \"deletedAt\" = now() WHERE id = :'user_id';" >/dev/null 2>&1; then
    log 'ERROR: tenant user soft-delete failed'
    ping_hc fail 'tenant user soft-delete failed'
    exit 1
  fi
  log "user ${USER_ID} soft-deleted (deletedAt = now())"
fi

log "total rows ${CONFIRM:-that would be }deleted: ${TOTAL_ROWS}"

if [[ -n "$CONFIRM" ]]; then
  ping_hc success "deleted ${TOTAL_ROWS} rows for ${USER_ID}"
else
  log "dry run complete — ${TOTAL_ROWS} rows would be deleted. Re-run with --confirm to proceed."
  ping_hc success "dry-run: ${TOTAL_ROWS} rows identified for ${USER_ID}"
fi
