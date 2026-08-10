#!/bin/sh
# The named backup volume is created by Docker as root. Initialize only the
# mounted backup directory, then run the requested command as postgres.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
mkdir -p "$BACKUP_DIR"
chown postgres:postgres "$BACKUP_DIR"

if [ "$#" -eq 0 ]; then
  set -- /bin/sh /usr/local/bin/backup-db.sh
fi

exec su-exec postgres "$@"
