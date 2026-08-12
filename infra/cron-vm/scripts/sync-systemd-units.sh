#!/usr/bin/env bash
# Install Kestrel systemd units after a repository self-update.
#
# This file is installed as /usr/local/sbin/kestrel-sync-systemd-units with
# root ownership. It deliberately fetches the units from the fixed upstream
# repository into a root-owned temporary directory; it never installs units
# directly from the kestrel-writable checkout.

set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo 'kestrel-sync-systemd-units must run as root' >&2
  exit 1
fi

readonly REPO_URL='https://github.com/HamaFx/Kestrel.git'
readonly TARGET_DIR='/etc/systemd/system'
readonly MANAGED_UNITS=(
  kestrel-light-news.service kestrel-light-news.timer
  kestrel-light-calendar.service kestrel-light-calendar.timer
  kestrel-light-alerts.service kestrel-light-alerts.timer
  kestrel-light-warm-cache.service kestrel-light-warm-cache.timer
  kestrel-light-cleanup-uploads.service kestrel-light-cleanup-uploads.timer
  kestrel-backup-db.service kestrel-backup-db.timer
  kestrel-backup-journal.service kestrel-backup-journal.timer
  kestrel-verify-restore.service kestrel-verify-restore.timer
  kestrel-tenant-export.service kestrel-tenant-export.timer
  kestrel-tenant-delete.service kestrel-tenant-delete.timer
  kestrel-billing-dlq.service kestrel-billing-dlq.timer
  kestrel-disk-check.service kestrel-disk-check.timer
  kestrel-docker-prune.service kestrel-docker-prune.timer
  kestrel-update.service kestrel-update.timer
  kestrel-docker-autoheal.service kestrel-docker-autoheal.timer
  kestrel-webhook.service
)

STAGE_DIR="$(mktemp -d -p /run kestrel-unit-sync.XXXXXX)"
trap 'rm -rf "$STAGE_DIR"' EXIT
REPO_DIR="$STAGE_DIR/repo"
TREE_DIR="$STAGE_DIR/tree"
mkdir -p "$TREE_DIR"

git init -q "$REPO_DIR"
git -C "$REPO_DIR" remote add origin "$REPO_URL"
git -C "$REPO_DIR" fetch --quiet --depth=1 origin main
git -C "$REPO_DIR" archive FETCH_HEAD infra/cron-vm/units | tar -x -C "$TREE_DIR"
SOURCE_DIR="$TREE_DIR/infra/cron-vm/units"

[[ -d "$SOURCE_DIR" ]] || {
  echo "unit source directory not found in upstream main" >&2
  exit 1
}

# Refuse symlinks and reject unit files containing commands outside the small,
# expected service vocabulary before copying anything into systemd's directory.
for source in "$SOURCE_DIR"/*.service "$SOURCE_DIR"/*.timer; do
  [[ -f "$source" && ! -L "$source" ]] || {
    echo "invalid unit source: $source" >&2
    exit 1
  }
  case "$(basename "$source")" in
    *.timer)
      grep -Eq '^\[Timer\]$' "$source" || { echo "invalid timer: $source" >&2; exit 1; }
      ;;
    *.service)
      grep -Eq '^\[Service\]$' "$source" || { echo "invalid service: $source" >&2; exit 1; }
      ;;
  esac
  if grep -Eq '(^|[[:space:]])(ExecStart|ExecStartPre|ExecStartPost|ExecCondition|ExecStop|ExecStopPost)=' "$source"; then
    grep -Eq '^Exec(Start|StartPre|StartPost|Condition|Stop|StopPost)=(/usr/bin/(curl|python3|docker|bash|install)|/bin/(sh|sleep)|/opt/kestrel/scripts/[A-Za-z0-9_.-]+|/usr/local/sbin/[A-Za-z0-9_.-]+)' "$source" || {
      echo "unsupported command in unit: $source" >&2
      exit 1
    }
  fi
done

install -m 644 "$SOURCE_DIR"/*.service "$TARGET_DIR/"
install -m 644 "$SOURCE_DIR"/*.timer "$TARGET_DIR/"

# Remove managed units deleted from the repository. Never touch unrelated
# systemd units on the VM.
for unit in "${MANAGED_UNITS[@]}"; do
  if [[ ! -e "$SOURCE_DIR/$unit" ]]; then
    rm -f "$TARGET_DIR/$unit"
  fi
done

systemctl daemon-reload

# daemon-reload does not apply changed timer schedules to active timers.
for timer in "$SOURCE_DIR"/*.timer; do
  unit="$(basename "$timer")"
  if systemctl is-active --quiet "$unit"; then
    systemctl restart "$unit"
  fi
done
