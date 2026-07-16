#!/usr/bin/env bash
# infra/cron-vm/deploy-worker.sh — Deploy worker from GitHub to Docker.
#
# Runs inside a systemd-run scope so it survives SSH disconnect.
# Usage:
#   sudo bash /opt/hamafx/scripts/deploy-worker.sh
#
# Workflow:
#   1. Fix git ownership (if needed)
#   2. git pull origin main
#   3. Update /opt/hamafx/.deployed-sha
#   4. docker compose build worker
#   5. docker compose up -d worker
#   6. Wait for health check
#
set -euo pipefail

readonly APP_DIR='/opt/hamafx/app'
readonly INSTALL_DIR='/opt/hamafx'
readonly SERVICE_NAME='worker'

log() { printf '%s [deploy-worker] %s\n' "$(date -u +%FT%TZ)" "$*"; }

if [[ "$EUID" -ne 0 ]]; then
  echo "must run as root (sudo bash deploy-worker.sh)" >&2
  exit 1
fi

# ── 1. Fix git ownership (common issue when git was run as root) ────────
log 'fixing git ownership'
chown -R hamafx:hamafx "$APP_DIR/.git"

# ── 2. Pull latest code ─────────────────────────────────────────────────
log 'pulling latest code from GitHub'
sudo -u hamafx git -C "$APP_DIR" fetch --quiet origin main
sudo -u hamafx git -C "$APP_DIR" reset --hard origin/main
NEW_SHA=$(sudo -u hamafx git -C "$APP_DIR" rev-parse HEAD)
log "HEAD is now at $NEW_SHA"

# ── 3. Update deployed SHA ──────────────────────────────────────────────
echo "$NEW_SHA" > "$INSTALL_DIR/.deployed-sha"
chmod 644 "$INSTALL_DIR/.deployed-sha"

# ── 4. Build the worker image ────────────────────────────────────────────
log 'building worker Docker image'
cd "$INSTALL_DIR"
sudo -u hamafx docker compose build "$SERVICE_NAME" 2>&1
log 'build complete'

# ── 5. Replace the running container ─────────────────────────────────────
log 'replacing old container'
sudo -u hamafx docker compose up -d "$SERVICE_NAME" 2>&1

# ── 6. Wait for health check ────────────────────────────────────────────
log 'waiting for container to become healthy (up to 120s)'
for i in $(seq 1 60); do
  status=$(sudo docker ps --filter "name=hamafx-worker" --format '{{.Status}}' 2>/dev/null)
  if echo "$status" | grep -q healthy; then
    log "container healthy after $((i*2))s"
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    log "WARNING: container not healthy after 120s — status=$status"
    sudo docker logs "hamafx-worker" --tail 10 2>/dev/null || true
    exit 1
  fi
  sleep 2
done

log "deploy complete — $NEW_SHA"
