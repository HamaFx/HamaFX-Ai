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
  git reset --hard "$PREV_SHA" >/dev/null || true
  pnpm install --frozen-lockfile --silent || true
  pnpm --filter @hamafx/worker build --silent || true
  ping_hc fail "$reason at $NEW_SHA"
  exit 1
}

if ! pnpm install --frozen-lockfile; then
  rollback "install failed"
fi

if ! pnpm --filter @hamafx/worker build; then
  rollback "build failed"
fi

if ! pnpm --filter @hamafx/worker test -- --run; then
  rollback "tests failed"
fi

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

log "applied $NEW_SHA"
ping_hc success "applied $NEW_SHA"
