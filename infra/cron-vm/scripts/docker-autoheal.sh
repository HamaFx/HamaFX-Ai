#!/usr/bin/env bash
# infra/cron-vm/scripts/docker-autoheal.sh
#
# Runs every minute via hamafx-docker-autoheal.timer.
# Checks if the hamafx-worker container is healthy.
# If unhealthy for 3 consecutive checks (3 minutes), restarts it.
#
# Docker's restart:unless-stopped handles crashes (exit code != 0),
# but does NOT restart unhealthy containers. This script fills that gap.

set -euo pipefail

readonly CONTAINER="hamafx-worker"
readonly STATE_FILE="/opt/hamafx/.autoheal-state"
readonly MAX_UNHEALTHY=3

log() { printf '%s [autoheal] %s\n' "$(date -u +%FT%TZ)" "$*"; }

# Read consecutive unhealthy count
count=0
[[ -f "$STATE_FILE" ]] && count=$(cat "$STATE_FILE" 2>/dev/null || echo 0)

HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "not-found")

if [[ "$HEALTH_STATUS" == "healthy" ]]; then
  echo 0 > "$STATE_FILE"
  exit 0
fi

if [[ "$HEALTH_STATUS" == "not-found" ]]; then
  log "container $CONTAINER not found — skipping"
  exit 0
fi

# Container is unhealthy or starting
count=$((count + 1))
echo "$count" > "$STATE_FILE"

if (( count >= MAX_UNHEALTHY )); then
  log "container unhealthy for $count consecutive checks — restarting"
  docker restart "$CONTAINER" 2>/dev/null || true
  echo 0 > "$STATE_FILE"
fi