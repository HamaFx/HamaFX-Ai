#!/bin/sh
# Kestrel local Docker backup worker.
#
# Writes compressed custom-format PostgreSQL dumps to /backups. The directory
# is a named Docker volume so backups survive container recreation.

set -eu
set -o pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

case "$INTERVAL_SECONDS" in
  ''|*[!0-9]*) echo "BACKUP_INTERVAL_SECONDS must be a positive integer" >&2; exit 2 ;;
esac
case "$RETENTION_DAYS" in
  ''|*[!0-9]*) echo "BACKUP_RETENTION_DAYS must be a positive integer" >&2; exit 2 ;;
esac
if [ "$INTERVAL_SECONDS" -lt 1 ] || [ "$RETENTION_DAYS" -lt 1 ]; then
  echo "BACKUP_INTERVAL_SECONDS and BACKUP_RETENTION_DAYS must be >= 1" >&2
  exit 2
fi

mkdir -p "$BACKUP_DIR"
umask 077

log() {
  printf '%s [backup-db] %s\n' "$(date -u +%FT%TZ)" "$*"
}

prune_old_backups() {
  # The find expression is intentionally restricted to our generated suffix.
  # Never delete arbitrary files from the mounted volume.
  find "$BACKUP_DIR" -type f -name '*.dump.gz' -mtime "+$RETENTION_DAYS" -delete
}

run_backup() {
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  destination="$BACKUP_DIR/hamafx-$timestamp.dump.gz"
  temporary="$destination.tmp.$$"

  log "starting dump destination=$(basename "$destination")"
  rm -f "$temporary"

  if ! PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}" \
    pg_dump \
      --format=custom \
      --no-owner \
      --no-privileges \
      --host="${PGHOST:-db}" \
      --port="${PGPORT:-5432}" \
      --username="${POSTGRES_USER:-hamafx}" \
      --dbname="${POSTGRES_DB:-hamafx}" \
      | gzip > "$temporary"; then
    rm -f "$temporary"
    log 'pg_dump failed; no backup was published'
    return 1
  fi

  if [ ! -s "$temporary" ]; then
    rm -f "$temporary"
    log 'pg_dump produced an empty archive; no backup was published'
    return 1
  fi

  mv -f "$temporary" "$destination"
  prune_old_backups
  log "backup complete bytes=$(wc -c < "$destination" | tr -d ' ')"
}

if [ "${1:-}" = '--once' ]; then
  run_backup
  exit $?
fi

log "started interval=${INTERVAL_SECONDS}s retention=${RETENTION_DAYS}d"
while :; do
  run_backup || true
  sleep "$INTERVAL_SECONDS"
done
