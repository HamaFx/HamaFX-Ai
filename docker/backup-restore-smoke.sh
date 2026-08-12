#!/usr/bin/env sh
# P3: Disposable Docker backup/restore smoke test.
#
# This intentionally exercises only db + backup. It does not build or start
# the application/worker images, so it is suitable for CI and local validation.
# The Compose project name can be overridden to isolate concurrent runs.

set -eu

# Never accept a caller-provided project name: cleanup below is destructive
# to this project's volumes. The shell PID makes concurrent local/CI runs
# independent without risking an operator's existing Compose project.
PROJECT_NAME="kestrel-backup-smoke-$$"
export COMPOSE_PROJECT_NAME="$PROJECT_NAME"

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
BASE_COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
cd "$ROOT_DIR"
# Compose's port sequence merge keeps the base mapping even with ports: [].
# Port 0 asks Docker for an ephemeral host port; the database remains
# reachable as `db` over the private network and no host collision can block
# the test.
POSTGRES_PUBLISHED_PORT='127.0.0.1:0'
export POSTGRES_PUBLISHED_PORT
compose() {
  docker compose -f "$BASE_COMPOSE_FILE" "$@"
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

# The caller must provide .env (normally via docker/init-secrets.sh). Keep the
# generated secrets out of logs and use a disposable project/volume namespace.
compose up -d db

for _ in $(seq 1 60); do
  if compose exec -T db pg_isready -U hamafx -d hamafx >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

compose exec -T db pg_isready -U hamafx -d hamafx >/dev/null

# Use a unique table name and a sentinel that proves the restored value came
# from the archive rather than the post-backup mutation.
compose exec -T db psql -v ON_ERROR_STOP=1 -U hamafx -d hamafx <<'SQL'
CREATE TABLE IF NOT EXISTS p3_backup_smoke (
  id integer PRIMARY KEY,
  marker text NOT NULL
);
INSERT INTO p3_backup_smoke (id, marker)
VALUES (1, 'before-backup')
ON CONFLICT (id) DO UPDATE SET marker = EXCLUDED.marker;
SQL

compose run --rm --no-deps backup /usr/local/bin/backup-db.sh --once
compose run --rm --no-deps backup /usr/local/bin/backup-healthcheck.sh

compose exec -T db psql -v ON_ERROR_STOP=1 -U hamafx -d hamafx \
  -c "UPDATE p3_backup_smoke SET marker = 'after-backup' WHERE id = 1;" >/dev/null

KESTREL_RESTORE_CONFIRM=YES "$ROOT_DIR/docker/restore-db.sh" latest

marker="$(compose exec -T db psql -At -U hamafx -d hamafx \
  -c 'SELECT marker FROM p3_backup_smoke WHERE id = 1;' | tr -d '\r')"
if [ "$marker" != 'before-backup' ]; then
  echo "backup restore verification failed: marker=$marker" >&2
  exit 1
fi

echo 'Docker backup/restore smoke test passed.'
