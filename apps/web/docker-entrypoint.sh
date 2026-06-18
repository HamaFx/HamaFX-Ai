#!/bin/sh
# Docker entrypoint — waits for Postgres, runs migrations, starts Next.js.
set -e

echo "== HamaFX-Ai =="

# Wait for Postgres if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
  echo "Waiting for Postgres..."
  # Extract host and port from postgres:// URL
  PG_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:/]*\).*|\1|p')
  PG_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
  PG_PORT=${PG_PORT:-5432}

  until curl -s "http://${PG_HOST}:${PG_PORT}" >/dev/null 2>&1 || nc -z "$PG_HOST" "$PG_PORT" 2>/dev/null; do
    echo "  still waiting..."
    sleep 2
  done
  echo "Postgres is ready"

  # Run Drizzle migrations
  echo "Running database migrations..."
  cd /app
  npx drizzle-kit migrate --config packages/db/drizzle.config.ts 2>/dev/null || \
    echo "Warning: migration step skipped (drizzle-kit may not be available)"
fi

echo "Starting HamaFX-Ai on port ${PORT:-3000}..."
exec node apps/web/server.js