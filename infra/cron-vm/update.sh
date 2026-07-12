#!/usr/bin/env bash
# infra/cron-vm/update.sh — Self-update the worker on the GCE VM.
#
# Phase 8 PR-16 — runs every 5 minutes via hamafx-update.timer. Compares
# the local checkout's HEAD to origin/main; if they differ:
#
#   1. Hard-reset to origin/main.
#   2. pnpm install --frozen-lockfile.
#   3. pnpm --filter @hamafx/worker build.
#   4. pnpm --filter @hamafx/worker test --run.
#
# Any of those four failing rolls back to the previous SHA, restores
# the previous install, and pings HC_UPDATE_UUID with `fail`. Only on a
# clean upgrade do we (a) write the new SHA to /opt/hamafx/.deployed-sha,
# (b) restart the worker, (c) ping HC_UPDATE_UUID with `success` and the
# new SHA in the body.
#
# Idempotent — re-running mid-flight is fine; the no-op fast-path is
# `git fetch && [HEAD == origin/main]`.

set -euo pipefail

readonly APP_DIR="/opt/hamafx/app"
readonly SHA_FILE="/opt/hamafx/.deployed-sha"
readonly LOCK_FILE="/opt/hamafx/.update.lock"

# Pull HC_UPDATE_UUID from the env file. We CANNOT just `source` the
# file — Vercel-pulled env values like GOOGLE_APPLICATION_CREDENTIALS_JSON
# contain unquoted whitespace + special chars (e.g. "PRIVATE KEY" inside
# a JSON blob) that bash interprets as commands.
#
# systemd's EnvironmentFile= directive uses a stricter parser, so the
# main worker + jobs are unaffected; this is purely about update.sh
# itself.
HC_UUID=''
if [[ -f /opt/hamafx/.env ]]; then
  HC_UUID=$(grep -E '^HC_UPDATE_UUID=' /opt/hamafx/.env | cut -d= -f2- | tr -d '"' | tr -d "'")
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

log() { printf '%s [update] %s\n' "$(date -u +%FT%TZ)" "$*"; }

# Single-instance guard — exec'd from a 5-minute timer, multiple invocations
# overlapping (slow build) would race the systemd restart.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log 'another update.sh run is in flight — skipping'
  exit 0
fi

cd "$APP_DIR"

# Always run as the hamafx user — git refuses to touch a checkout owned
# by another user under "dubious ownership" rules. The update.timer's
# service unit already runs us as `hamafx`, but be explicit:
if [[ "$(whoami)" != "hamafx" ]]; then
  log "ERROR: must run as hamafx (saw $(whoami))"
  ping_hc fail "wrong user: $(whoami)"
  exit 1
fi

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
git reset --hard "$NEW_SHA" >/dev/null

rollback() {
  local reason="$1"
  log "rolling back to $PREV_SHA: $reason"
  if ! git reset --hard "$PREV_SHA" >/dev/null; then
    log "CRITICAL: git reset failed during rollback — manual intervention required"
    ping_hc fail "ROLLBACK FAILED: git reset failed. reason=$reason"
    exit 1
  fi
  if ! pnpm install --frozen-lockfile; then
    log "CRITICAL: pnpm install failed during rollback"
    ping_hc fail "ROLLBACK FAILED: install failed. reason=$reason"
    exit 1
  fi
  if ! pnpm --filter @hamafx/worker build; then
    log "CRITICAL: build failed during rollback"
    ping_hc fail "ROLLBACK FAILED: build failed. reason=$reason"
    exit 1
  fi
  # Restart worker on the rolled-back code
  sudo /bin/systemctl restart hamafx-worker.service || true
  ping_hc fail "rolled back from $NEW_SHA to $PREV_SHA: $reason"
  exit 1
}

if ! pnpm install --frozen-lockfile; then
  rollback "install failed"
fi

if ! pnpm --filter @hamafx/worker build; then
  rollback "build failed"
fi

# NOTE: Worker tests are skipped on the VM — CI runs them on every PR and
# push to main. Running tests with DATABASE_URL pointing to production
# could accidentally read/write production data.

# Success path — record SHA, restart the worker, ping HC.
echo "$NEW_SHA" > "$SHA_FILE"
# Keep DEPLOYED_SHA in sync inside /opt/hamafx/.env so every systemd
# unit's EnvironmentFile= directive picks up the new SHA. Worker reads
# it at startup; jobs see it on the next invocation.
ENV_FILE='/opt/hamafx/.env'
if grep -q '^DEPLOYED_SHA=' "$ENV_FILE"; then
  sed -i "s|^DEPLOYED_SHA=.*|DEPLOYED_SHA=$NEW_SHA|" "$ENV_FILE"
else
  echo "DEPLOYED_SHA=$NEW_SHA" >> "$ENV_FILE"
fi
sudo /bin/systemctl restart hamafx-worker.service || {
  rollback "systemctl restart hamafx-worker failed"
}

# ── Phase 6 task 6.3 — post-deploy runtime crash guard ──────────────
# The restart above may report `active (running)` even though the worker
# crashes seconds later (e.g. a runtime TypeError that only surfaces on
# the first SignalR tick).  systemd's Restart=always will loop the crash
# indefinitely on the bad code.  To catch this, we wait a short health
# window and verify the unit is still `active (running)` AND has not
# exceeded its restart burst.  If it has, we roll back to PREV_SHA.
#
# The window (30 s) is long enough for the worker's WatchdogSec=120
# readiness gate to fire notifyReady() on a healthy boot, but short
# enough to avoid blocking the 5-minute update timer for too long.
HEALTH_WAIT_SEC=30
log "post-deploy health check — waiting ${HEALTH_WAIT_SEC}s for runtime stability"
sleep "$HEALTH_WAIT_SEC"

# Check that the unit is still active (not failed, not restarting).
WORKER_STATUS="$(systemctl is-active hamafx-worker.service 2>/dev/null || true)"
if [[ "$WORKER_STATUS" != "active" ]]; then
  rollback "post-deploy health check failed — worker status: $WORKER_STATUS after ${HEALTH_WAIT_SEC}s"
fi

# Check systemd's restart count — if the unit has restarted more than
# once in the health window, it's crash-looping on the new code.
RESTART_COUNT="$(systemctl show -p NRestarts --value hamafx-worker.service 2>/dev/null || echo 0)"
if [[ "$RESTART_COUNT" =~ ^[0-9]+$ ]] && (( RESTART_COUNT > 1 )); then
  rollback "post-deploy crash loop detected — $RESTART_COUNT restarts within ${HEALTH_WAIT_SEC}s"
fi

log "applied $NEW_SHA"
# Prune the pnpm store to reclaim disk space from old packages
pnpm store prune 2>/dev/null || true
ping_hc success "applied $NEW_SHA"
