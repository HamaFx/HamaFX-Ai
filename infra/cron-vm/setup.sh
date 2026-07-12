#!/usr/bin/env bash
# infra/cron-vm/setup.sh — Bootstrap the hamafx-cron GCE VM.
#
# Phase 8 PR-15 — replaces the old `cron` daemon entirely with systemd
# timers. Idempotent: re-running upgrades the unit files and restarts
# every timer.
#
# What this script does:
#   - Installs curl + system packages.
#   - Drops every /etc/systemd/system/hamafx-*.{service,timer} from
#     infra/cron-vm/units/ into place.
#   - Enables every *.timer (services are oneshot, run when the timer
#     fires).
#   - Stops + masks the legacy `cron` daemon. The repo no longer ships a
#     crontab; if you need the manual-fallback paths (e.g. during a
#     worker outage) issue them with `curl -H "Authorization: Bearer
#     $CRON_SECRET" ...`.
#
# Usage (from your local machine):
#   gcloud compute scp -r infra/cron-vm hamafx-cron:/tmp/hamafx-cron --zone=us-central1-a
#   gcloud compute ssh hamafx-cron --zone=us-central1-a --command="sudo bash /tmp/hamafx-cron/setup.sh"

set -euo pipefail

readonly UNITS_DIR="$(dirname "$0")/units"
readonly TARGET_DIR="/etc/systemd/system"

log() { printf '%s [setup] %s\n' "$(date -u +%FT%TZ)" "$*"; }

if [[ "$EUID" -ne 0 ]]; then
  echo "must run as root (sudo bash setup.sh)" >&2
  exit 1
fi

log 'configuring journald storage limits'
cat > /etc/systemd/journald.conf.d/hamafx.conf <<'JOURNALD'
[Journal]
SystemMaxUse=500M
SystemKeepFree=2G
MaxFileSec=7day
JOURNALD
systemctl restart systemd-journald

log 'adding hamafx user to docker group (PR-17: verify-restore needs it)'
if id hamafx >/dev/null 2>&1; then
  usermod -aG docker hamafx || true
fi

log 'installing google-cloud CLI (gsutil) if not already present'
if ! command -v gsutil >/dev/null 2>&1; then
  apt-get install -y -qq apt-transport-https ca-certificates gnupg
  echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
    > /etc/apt/sources.list.d/google-cloud-sdk.list
  curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
    | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
  apt-get update -qq
  apt-get install -y -qq google-cloud-cli
fi

log 'installing sudoers entry for hamafx user (PR-16: self-update can restart the worker)'
if [[ -f "$(dirname "$0")/sudoers.d/hamafx" ]]; then
  install -m 440 -o root -g root \
    "$(dirname "$0")/sudoers.d/hamafx" /etc/sudoers.d/hamafx
  visudo -c -f /etc/sudoers.d/hamafx >/dev/null
fi

log 'making scripts executable'
chmod +x "$(dirname "$0")"/scripts/*.sh 2>/dev/null || true
chmod +x "$(dirname "$0")/update.sh" 2>/dev/null || true

log "creating /opt/hamafx (env file, deployed-sha pointer)"
mkdir -p /opt/hamafx
if [[ ! -f /opt/hamafx/.env ]]; then
  log 'WARNING: /opt/hamafx/.env missing — write it before timers fire:'
  cat <<'ENV_HINT'
  PRODUCTION_URL=https://hama-fx-ai.vercel.app
  CRON_SECRET=<your-cron-secret>
  DATABASE_URL=<supabase pooler URL>
  BIQUOTE_BASE_URL=https://biquote.io        # optional
  HC_SIGNALR_UUID=<...>                       # optional, for healthchecks.io
  HC_JOB_EMBEDDING_BACKFILL_UUID=<...>
  HC_JOB_BRIEFINGS_UUID=<...>
  HC_JOB_SNAPSHOTS_UUID=<...>
  HC_JOB_COT_UUID=<...>
  HC_JOB_FRED_ACTUALS_UUID=<...>
  HC_JOB_WEEKLY_REVIEW_UUID=<...>
  HC_LIGHT_NEWS_UUID=<...>
  HC_LIGHT_CALENDAR_UUID=<...>
  HC_LIGHT_ALERTS_UUID=<...>
  HC_LIGHT_WARM_CACHE_UUID=<...>
  HC_UPDATE_UUID=<...>
  HC_BACKUP_DB_UUID=<...>
  HC_BACKUP_JOURNAL_UUID=<...>
  HC_VERIFY_RESTORE_UUID=<...>
ENV_HINT
fi
chmod 600 /opt/hamafx/.env 2>/dev/null || true

log 'tearing down legacy cron'
if systemctl is-active --quiet cron 2>/dev/null; then
  systemctl stop cron || true
fi
if systemctl is-enabled --quiet cron 2>/dev/null; then
  systemctl disable cron || true
fi
# Remove any leftover hamafx entries from root's crontab.
crontab -l 2>/dev/null | grep -v 'hamafx' | crontab - 2>/dev/null || true

log 'logrotate config for /var/log/hamafx-cron.log (legacy log path)'
cat > /etc/logrotate.d/hamafx-cron <<'LOGROTATE'
/var/log/hamafx-cron.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
    create 0644 root root
}
LOGROTATE

log "installing systemd units from $UNITS_DIR"
for unit in "$UNITS_DIR"/hamafx-*.{service,timer}; do
  [[ -f "$unit" ]] || continue
  install -m 644 "$unit" "$TARGET_DIR/$(basename "$unit")"
done
systemctl daemon-reload

log 'enabling + starting timers'
for timer in "$UNITS_DIR"/hamafx-*.timer; do
  [[ -f "$timer" ]] || continue
  name="$(basename "$timer")"
  systemctl enable --now "$name"
done

# Worker `hamafx-worker.service` is a long-running unit (Type=simple), so
# enable + start it explicitly. Restart so unit-file changes take effect.
if [[ -f "$UNITS_DIR/hamafx-worker.service" ]]; then
  log 'enabling + (re)starting hamafx-worker.service'
  systemctl enable hamafx-worker.service
  systemctl restart hamafx-worker.service
fi

log 'done — current timer state:'
systemctl list-timers --all 'hamafx-*' --no-pager | head -30
