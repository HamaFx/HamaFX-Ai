#!/bin/sh
# Docker entrypoint — waits for Postgres, runs migrations, starts Next.js.
set -e

printf '%s\n' \
  '██╗  ██╗███████╗███████╗████████╗██████╗ ███████╗██╗' \
  '██║ ██╔╝██╔════╝██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║' \
  '█████╔╝ █████╗  ███████╗   ██║   ██████╔╝█████╗  ██║' \
  '██╔═██╗ ██╔══╝  ╚════██║   ██║   ██╔══██╗██╔══╝  ██║' \
  '██║  ██╗███████╗███████║   ██║   ██║  ██║███████╗███████╗' \
  '╚═╝  ╚═╝╚══════╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚══════╝' \
  ''
echo "Kestrel — AI trading copilot"

# Prefer a direct/non-pooled URL for migrations. Production deployments must
# provide DIRECT_URL or POSTGRES_URL_NON_POOLING. Local Docker Compose opts into
# the DATABASE_URL fallback explicitly because its `db:5432` URL is direct.
MIGRATION_DATABASE_URL=${DIRECT_URL:-${POSTGRES_URL_NON_POOLING:-}}
if [ -z "$MIGRATION_DATABASE_URL" ] && [ "$HAMAFX_LOCAL_DOCKER" = "true" ]; then
  MIGRATION_DATABASE_URL=${DATABASE_URL:-}
fi
if [ -z "$MIGRATION_DATABASE_URL" ]; then
  echo "[security] DIRECT_URL or POSTGRES_URL_NON_POOLING is required for runtime migrations." >&2
  exit 1
fi

# Wait for Postgres with a Node probe that reads the URI from the
# environment. This handles credentials, query parameters, IPv6 hosts, and
# non-default ports without brittle parsing or exposing the password in argv.
if [ -n "$MIGRATION_DATABASE_URL" ]; then
  echo "Waiting for Postgres..."
  until MIGRATION_DATABASE_URL="$MIGRATION_DATABASE_URL" node /app/runtime-migrate/wait-for-db.mjs >/dev/null 2>&1; do
    echo "  still waiting..."
    sleep 2
  done
  echo "Postgres is ready"

  # Run migrations before starting the application. This is deliberately
  # fail-closed: serving with a stale or partial schema is more dangerous
  # than refusing to boot.
  echo "Running database migrations..."
  cd /app
  MIGRATION_DATABASE_URL="$MIGRATION_DATABASE_URL" node /app/runtime-migrate/migrate-runtime.mjs
  echo "Migrations applied."
fi

echo "Starting Kestrel on port ${PORT:-3000}..."
exec node apps/web/server.js
