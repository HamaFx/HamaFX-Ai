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
source "$(dirname "${BASH_SOURCE[0]}")/_load-env.sh" /opt/hamafx/.env

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
: "${DB_URL:?Set ADMIN_DATABASE_URL (preferred) or DIRECT_URL / POSTGRES_URL_NON_POOLING / DATABASE_URL / POSTGRES_URL in /opt/hamafx/.env}"

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
  "chat_messages"
  "chat_tool_telemetry"
  "chat_telemetry"
  "decision_signal_outcomes"
  "decision_signal_feedback"
  "decision_signals"
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

# Safety: refuse to delete the __system__ user.
if [[ "$USER_ID" == "__system__" ]]; then
  log "REFUSING to delete __system__ user — this is the system fallback account."
  exit 1
fi

if [[ -z "$CONFIRM" ]]; then
  log "DRY RUN — no data will be deleted. Use --confirm to actually delete."
  ping_hc start
fi

log "processing tenant deletion for user_id=${USER_ID} (${CONFIRM:-dry-run})"

TOTAL_ROWS=0
for TABLE in "${TENANT_TABLES[@]}"; do
  # Count rows for this tenant using psql variables (parameterized to prevent SQL injection).
  COUNT=$(psql --dbname="$DB_URL" -A -t -v user_id="$USER_ID" -c \
    "SELECT COUNT(*) FROM ${TABLE} WHERE user_id = :'user_id';" 2>/dev/null || echo 0)
  COUNT="${COUNT// /}"
  if [[ "$COUNT" =~ ^[0-9]+$ ]] && (( COUNT > 0 )); then
    log "  ${TABLE}: ${COUNT} rows"
    TOTAL_ROWS=$((TOTAL_ROWS + COUNT))
    if [[ -n "$CONFIRM" ]]; then
      psql --dbname="$DB_URL" -v user_id="$USER_ID" -c \
        "DELETE FROM ${TABLE} WHERE user_id = :'user_id';" >/dev/null 2>&1 || true
    fi
  fi
done

# Finally, soft-delete the user record itself (set deleted_at).
if [[ -n "$CONFIRM" ]]; then
  psql --dbname="$DB_URL" -v user_id="$USER_ID" -c \
    "UPDATE \"user\" SET \"deletedAt\" = now() WHERE id = :'user_id';" >/dev/null 2>&1 || true
  log "user ${USER_ID} soft-deleted (deletedAt = now())"
fi

log "total rows ${CONFIRM:-that would be }deleted: ${TOTAL_ROWS}"

if [[ -n "$CONFIRM" ]]; then
  ping_hc success "deleted ${TOTAL_ROWS} rows for ${USER_ID}"
else
  log "dry run complete — ${TOTAL_ROWS} rows would be deleted. Re-run with --confirm to proceed."
  ping_hc success "dry-run: ${TOTAL_ROWS} rows identified for ${USER_ID}"
fi
