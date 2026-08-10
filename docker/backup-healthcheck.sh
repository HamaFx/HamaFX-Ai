#!/bin/sh
# Exit non-zero when the local backup volume has no recent successful dump.
set -eu
set -o pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
MAX_AGE_SECONDS="${BACKUP_MAX_AGE_SECONDS:-172800}"

case "$MAX_AGE_SECONDS" in
  ''|*[!0-9]*) echo "BACKUP_MAX_AGE_SECONDS must be a non-negative integer" >&2; exit 2 ;;
esac

latest_path=''
latest_mtime=0
for path in "$BACKUP_DIR"/*.dump.gz; do
  [ -f "$path" ] || continue
  mtime="$(stat -c '%Y' "$path" 2>/dev/null || echo 0)"
  if [ "$mtime" -gt "$latest_mtime" ]; then
    latest_mtime="$mtime"
    latest_path="$path"
  fi
done
if [ -z "$latest_path" ]; then
  echo 'no database backup found' >&2
  exit 1
fi

now="$(date +%s)"
age=$((now - latest_mtime))
if [ "$age" -lt 0 ]; then age=0; fi

if [ "$age" -gt "$MAX_AGE_SECONDS" ]; then
  echo "latest backup is stale age=${age}s max=${MAX_AGE_SECONDS}s file=$(basename "$latest_path")" >&2
  exit 1
fi

# pg_restore --list parses the custom archive without modifying the database.
# This catches truncated gzip output and malformed archives while keeping the
# healthcheck read-only. The backup image includes pg_restore.
if ! gzip -dc "$latest_path" | pg_restore --list >/dev/null 2>&1; then
  echo "latest backup failed archive validation file=$(basename "$latest_path")" >&2
  exit 1
fi

echo "latest backup is fresh and valid age=${age}s file=$(basename "$latest_path")"
