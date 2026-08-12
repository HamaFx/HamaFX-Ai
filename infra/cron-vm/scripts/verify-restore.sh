#!/usr/bin/env bash
# infra/cron-vm/scripts/verify-restore.sh — Weekly disaster-recovery rehearsal.
#
# B2 setup is intentionally deferred. Once configured, this script downloads
# the latest B2 database dump into a throwaway PostgreSQL container, restores
# it, checks critical rows/indexes, and removes all temporary state.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_load-env.sh" /opt/kestrel/.env
source "$SCRIPT_DIR/backup-storage.sh"

HC_UUID="${HC_VERIFY_RESTORE_UUID:-}"
TMP_DIR="$(mktemp -d -t kestrel-verify-XXXXXX)"
DUMP_GZ="${TMP_DIR}/latest.dump.gz"
DUMP="${TMP_DIR}/latest.dump"
CONTAINER='kestrel-verify-pg'
LOCAL_PG_PORT=55432
TARGET_DB='kestrel_verify'

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker image prune -f >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

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

log() { printf '%s [verify-restore] %s\n' "$(date -u +%FT%TZ)" "$*"; }

backup_storage_require
ping_hc start
LATEST="$(backup_storage_latest_db)"
if [[ -z "$LATEST" ]]; then
  log 'no database dumps in B2'
  ping_hc fail 'no database dumps available in B2'
  exit 1
fi

log "latest dump: B2 ${LATEST#kestrel:}"
backup_storage_download_file "${LATEST#kestrel:*/}" "$DUMP_GZ"
gunzip -c "$DUMP_GZ" > "$DUMP"

log 'starting throwaway postgres container'
docker run --rm -d \
  --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=verify \
  -e POSTGRES_USER=verify \
  -e POSTGRES_DB="$TARGET_DB" \
  -p "${LOCAL_PG_PORT}:5432" \
  pgvector/pgvector:pg16 >/dev/null

for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U verify >/dev/null 2>&1; then break; fi
  sleep 1
done
if ! docker exec "$CONTAINER" pg_isready -U verify >/dev/null 2>&1; then
  log 'postgres container did not become ready in 30 seconds'
  ping_hc fail 'postgres container not ready'
  exit 1
fi

docker exec "$CONTAINER" psql -U verify -d "$TARGET_DB" -c \
  'CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pgcrypto;' \
  >/dev/null

log 'running pg_restore'
if ! PGPASSWORD=verify pg_restore \
  --no-owner --no-privileges \
  -h 127.0.0.1 -p "$LOCAL_PG_PORT" -U verify -d "$TARGET_DB" \
  "$DUMP"; then
  log 'pg_restore failed'
  ping_hc fail "pg_restore failed for ${LATEST#kestrel:*/}"
  exit 1
fi

JOURNAL_ROWS="$(PGPASSWORD=verify psql -h 127.0.0.1 -p "$LOCAL_PG_PORT" -U verify -d "$TARGET_DB" -A -t -c 'SELECT COUNT(*) FROM journal_entries;' 2>/dev/null || echo 0)"
THREADS_ROWS="$(PGPASSWORD=verify psql -h 127.0.0.1 -p "$LOCAL_PG_PORT" -U verify -d "$TARGET_DB" -A -t -c 'SELECT COUNT(*) FROM chat_threads;' 2>/dev/null || echo 0)"
HNSW_INDEX_COUNT="$(PGPASSWORD=verify psql -h 127.0.0.1 -p "$LOCAL_PG_PORT" -U verify -d "$TARGET_DB" -A -t -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND indexdef ILIKE '%USING hnsw%';" 2>/dev/null || echo 0)"

log "journal_entries=$JOURNAL_ROWS chat_threads=$THREADS_ROWS hnsw_indexes=$HNSW_INDEX_COUNT"
if [[ "$JOURNAL_ROWS" =~ ^[0-9]+$ ]] && [[ "$THREADS_ROWS" =~ ^[0-9]+$ ]] && [[ "$HNSW_INDEX_COUNT" =~ ^[0-9]+$ ]] && (( HNSW_INDEX_COUNT > 0 )); then
  ping_hc success "journal=$JOURNAL_ROWS threads=$THREADS_ROWS hnsw=$HNSW_INDEX_COUNT provider=b2 retention=7d"
else
  ping_hc fail 'restore verification failed (rows or hnsw indexes missing)'
  exit 1
fi
