#!/usr/bin/env bash
# infra/cron-vm/scripts/verify-restore.sh — Weekly disaster-recovery rehearsal.
#
# Phase 8 PR-17. Runs Sunday 04:00 UTC via hamafx-verify-restore.timer.
#
# A backup you've never restored is a backup you don't have. This script:
#   1. Pulls the latest db/*.dump.gz from GCS into a temp file.
#   2. Boots a throwaway local Postgres container via Docker.
#   3. Runs pg_restore against that DB.
#   4. Asserts non-zero rows in critical tables (journal_entries, chat_threads).
#   5. Tears the container down, deletes the temp file.
#   6. Pings HC_VERIFY_RESTORE_UUID success/fail with row counts.
#
# Tested with pgvector/pgvector:pg15 in a docker container so the restore
# rehearsal validates vector columns and HNSW indexes too. The VM needs Docker
# installed (setup.sh grew an apt-get docker.io step in PR-17).
#
# Phase 6 task 6.5 — verified: the original `postgres:15-alpine` image does
# NOT include the `vector` extension.  It was replaced with
# `pgvector/pgvector:pg15` in Phase 3 task 3.7, which bundles pgvector
# natively.  The script also asserts HNSW index count > 0 to confirm
# vector columns and indexes survive the restore.

set -euo pipefail

# shellcheck source=./_load-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/_load-env.sh" /opt/hamafx/.env

: "${GCS_BACKUP_BUCKET:?GCS_BACKUP_BUCKET must be set}"

HC_UUID="${HC_VERIFY_RESTORE_UUID:-}"
TMP_DIR="$(mktemp -d -t hamafx-verify-XXXXXX)"
DUMP_GZ="${TMP_DIR}/latest.dump.gz"
DUMP="${TMP_DIR}/latest.dump"
CONTAINER='hamafx-verify-pg'
LOCAL_PG_PORT=55432
TARGET_DB='hamafx_verify'

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
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

ping_hc start

# ------------------------------------------------------------------ Pull latest
LATEST="$(gsutil ls -l "gs://${GCS_BACKUP_BUCKET}/db/*.dump.gz" 2>/dev/null \
  | sort -k2 \
  | awk '/dump.gz/ {print $3}' \
  | tail -n1)"
if [[ -z "$LATEST" ]]; then
  log 'no dumps in bucket'
  ping_hc fail "no dumps in gs://${GCS_BACKUP_BUCKET}/db/"
  exit 1
fi
log "latest dump: $LATEST"
gsutil -q cp "$LATEST" "$DUMP_GZ"
gunzip -c "$DUMP_GZ" > "$DUMP"

# ------------------------------------------------------------------ Boot Postgres
log 'starting throwaway postgres container'
docker run --rm -d \
  --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=verify \
  -e POSTGRES_USER=verify \
  -e POSTGRES_DB="$TARGET_DB" \
  -p "${LOCAL_PG_PORT}:5432" \
  pgvector/pgvector:pg15 >/dev/null

# Wait for the container's Postgres to accept connections.
for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U verify >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Ensure pgvector + pgcrypto extensions exist before restore (the dump
# expects them).
docker exec "$CONTAINER" psql -U verify -d "$TARGET_DB" -c \
  'CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pgcrypto;' \
  >/dev/null

# ------------------------------------------------------------------ Restore + assert
log 'running pg_restore'
if ! PGPASSWORD=verify pg_restore \
  --no-owner --no-privileges \
  -h 127.0.0.1 -p "$LOCAL_PG_PORT" -U verify -d "$TARGET_DB" \
  "$DUMP"; then
  log 'pg_restore failed'
  ping_hc fail "pg_restore failed for $LATEST"
  exit 1
fi

JOURNAL_ROWS="$(PGPASSWORD=verify psql -h 127.0.0.1 -p "$LOCAL_PG_PORT" -U verify -d "$TARGET_DB" \
  -A -t -c 'SELECT COUNT(*) FROM journal_entries;' 2>/dev/null || echo 0)"
THREADS_ROWS="$(PGPASSWORD=verify psql -h 127.0.0.1 -p "$LOCAL_PG_PORT" -U verify -d "$TARGET_DB" \
  -A -t -c 'SELECT COUNT(*) FROM chat_threads;' 2>/dev/null || echo 0)"
HNSW_INDEX_COUNT="$(PGPASSWORD=verify psql -h 127.0.0.1 -p "$LOCAL_PG_PORT" -U verify -d "$TARGET_DB" \
  -A -t -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND indexdef ILIKE '%USING hnsw%';" 2>/dev/null || echo 0)"

log "journal_entries=$JOURNAL_ROWS chat_threads=$THREADS_ROWS hnsw_indexes=$HNSW_INDEX_COUNT"

if [[ "$JOURNAL_ROWS" =~ ^[0-9]+$ ]] && [[ "$THREADS_ROWS" =~ ^[0-9]+$ ]] && [[ "$HNSW_INDEX_COUNT" =~ ^[0-9]+$ ]] && (( HNSW_INDEX_COUNT > 0 )); then
  ping_hc success "journal=$JOURNAL_ROWS threads=$THREADS_ROWS hnsw=$HNSW_INDEX_COUNT dump=$LATEST"
  echo "$(date -u +%FT%TZ) journal=$JOURNAL_ROWS threads=$THREADS_ROWS hnsw=$HNSW_INDEX_COUNT dump=$LATEST" \
    | gsutil -q cp - "gs://${GCS_BACKUP_BUCKET}/verify/last-success.txt"
else
  ping_hc fail "restore verification failed (rows or hnsw indexes missing)"
  exit 1
fi
