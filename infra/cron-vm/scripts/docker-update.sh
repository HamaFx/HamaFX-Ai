#!/usr/bin/env bash
# infra/cron-vm/scripts/docker-update.sh — Self-update via git pull + Docker build.
#
# Runs every 5 minutes via hamafx-update.timer. Compares the local
# checkout's HEAD to origin/main; if they differ:
#   1. git reset --hard origin/main
#   2. docker compose build (uses layer cache — fast when only source changes)
#   3. docker compose up -d --force-recreate (restart with new image)
#   4. 30s health check — auto-rollback if unhealthy
#
# No GitHub Actions, no GHCR, no external registry. The image is built on the VM.
#
# Update time: ~5s (no-op) or ~30-120s (rebuild, depending on what changed).
# Docker layer caching means pnpm install only re-runs when pnpm-lock.yaml changes.

set -euo pipefail

readonly APP_DIR="/opt/hamafx/app"
readonly COMPOSE_FILE="/opt/hamafx/docker-compose.yml"
readonly LOCK_FILE="/opt/hamafx/.update.lock"
readonly SHA_FILE="/opt/hamafx/.deployed-sha"
readonly CONTAINER="hamafx-worker"

# Load HC_UPDATE_UUID safely
HC_UUID=''
if [[ -f /opt/hamafx/.env ]]; then
  HC_UUID=$(grep -E '^HC_UPDATE_UUID=' /opt/hamafx/.env | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
fi

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

log() { printf '%s [docker-update] %s\n' "$(date -u +%FT%TZ)" "$*"; }

# Single-instance guard
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log 'another update run is in flight — skipping'
  exit 0
fi

# Must run as hamafx (in docker group)
if [[ "$(whoami)" != "hamafx" ]]; then
  log "ERROR: must run as hamafx (saw $(whoami))"
  ping_hc fail "wrong user: $(whoami)"
  exit 1
fi

cd "$APP_DIR"

PREV_SHA="$(git rev-parse HEAD)"
git fetch --quiet origin main || {
  log "git fetch failed"
  ping_hc fail "git fetch failed"
  exit 1
}
NEW_SHA="$(git rev-parse origin/main)"

if [[ "$PREV_SHA" == "$NEW_SHA" ]]; then
  log "no change ($PREV_SHA) — exit"
  exit 0
fi

log "upgrading $PREV_SHA -> $NEW_SHA"

# Tag the current image for instant rollback before building
docker tag hamafx-worker:local hamafx-worker:rollback 2>/dev/null || true

git reset --hard "$NEW_SHA" >/dev/null

# Build the new image (Docker layer cache makes this fast)
log "building Docker image"
if ! docker compose -f "$COMPOSE_FILE" build --quiet 2>&1; then
  log "docker compose build failed — rolling back"
  git reset --hard "$PREV_SHA" >/dev/null
  ping_hc fail "build failed at $NEW_SHA"
  exit 1
fi

# Restart with the new image
log "restarting container"
if ! docker compose -f "$COMPOSE_FILE" up -d --force-recreate --no-deps worker 2>&1; then
  log "docker compose up failed — rolling back"
  docker tag hamafx-worker:rollback hamafx-worker:local 2>/dev/null || true
  docker compose -f "$COMPOSE_FILE" up -d --force-recreate --no-deps worker 2>/dev/null || true
  ping_hc fail "up failed at $NEW_SHA, rolled back"
  exit 1
fi

# Post-deploy health check (30s window)
HEALTH_WAIT_SEC=30
log "post-deploy health check — waiting ${HEALTH_WAIT_SEC}s"
sleep "$HEALTH_WAIT_SEC"

HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "unknown")
if [[ "$HEALTH_STATUS" != "healthy" ]]; then
  log "health check failed (status: $HEALTH_STATUS) — rolling back"
  docker tag hamafx-worker:rollback hamafx-worker:local 2>/dev/null || true
  git reset --hard "$PREV_SHA" >/dev/null
  docker compose -f "$COMPOSE_FILE" build --quiet 2>/dev/null || true
  docker compose -f "$COMPOSE_FILE" up -d --force-recreate --no-deps worker 2>/dev/null || true
  ping_hc fail "health check failed (status: $HEALTH_STATUS) at $NEW_SHA, rolled back to $PREV_SHA"
  exit 1
fi

# Success — record SHA
echo "$NEW_SHA" > "$SHA_FILE"
ENV_FILE='/opt/hamafx/.env'
if grep -q '^DEPLOYED_SHA=' "$ENV_FILE"; then
  sed -i "s|^DEPLOYED_SHA=.*|DEPLOYED_SHA=$NEW_SHA|" "$ENV_FILE"
else
  echo "DEPLOYED_SHA=$NEW_SHA" >> "$ENV_FILE"
fi

# Prune old images to reclaim disk
docker image prune -f >/dev/null 2>&1 || true

log "applied $NEW_SHA"
ping_hc success "applied $NEW_SHA"