#!/usr/bin/env sh
# Restore a selected local Docker backup into the Compose database.
#
# Usage:
#   ./docker/restore-db.sh latest
#   ./docker/restore-db.sh hamafx-20260810T030000Z.dump.gz
#
# The backup volume is mounted only in the backup image. This command uses a
# short-lived backup-image container to read the archive and connect to db over
# the private Compose network. It stops app/worker/backup writers, replaces the
# database contents, and starts the stack again only after pg_restore succeeds.

set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <backup filename | latest>" >&2
  exit 2
fi

case "$1" in
  latest)
    backup_path='$path'
    ;;
  *.dump.gz)
    case "$1" in
      */*|.*) echo 'backup filename must be a simple name inside the backup volume' >&2; exit 2 ;;
    esac
    backup_path="/var/lib/postgresql/backups/$1"
    ;;
  *)
    echo 'backup must be latest or a .dump.gz filename' >&2
    exit 2
    ;;
esac

# Resolve latest inside a short-lived backup image so the host never needs
# access to Docker's named-volume storage path. Timestamped filenames sort in
# chronological order, avoiding image-specific find/stat extensions.
if [ "$1" = latest ]; then
  backup_path="$(docker compose run --rm --no-deps backup sh -c "ls -1 /var/lib/postgresql/backups/*.dump.gz 2>/dev/null | sort | tail -n1" | tr -d '\r')"
  if [ -z "$backup_path" ]; then
    echo 'no local database backup found' >&2
    exit 1
  fi
fi

case "$backup_path" in
  /var/lib/postgresql/backups/*.dump.gz) ;;
  *) echo 'resolved backup path is outside the backup volume' >&2; exit 2 ;;
esac

if [ "${HAMAFX_RESTORE_CONFIRM:-}" != "YES" ]; then
  echo 'Restore replaces the current database. Re-run with HAMAFX_RESTORE_CONFIRM=YES.' >&2
  echo "Selected archive: $(basename "$backup_path")" >&2
  exit 2
fi

restore_succeeded=0
cleanup() {
  if [ "$restore_succeeded" -eq 1 ]; then
    docker compose start backup app worker >/dev/null 2>&1 || true
  else
    echo 'Restore did not complete. app, worker, and backup remain stopped.' >&2
    echo 'Inspect the database before restarting writers; run docker compose start db for recovery access.' >&2
  fi
}
trap cleanup EXIT

echo "Stopping application writers..."
docker compose stop app worker backup >/dev/null

echo "Restoring $(basename "$backup_path")..."
docker compose run --rm --no-deps backup sh -c \
  'set -o pipefail; export PGPASSWORD="$POSTGRES_PASSWORD"; gzip -dc "$1" | pg_restore --host="$PGHOST" --port="$PGPORT" --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname="$PGDATABASE" --username="$PGUSER"' \
  sh "$backup_path"
restore_succeeded=1
echo 'Restore completed; application services are restarting.'
