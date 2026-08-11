#!/usr/bin/env bash
# Install HamaFX systemd units after a repository self-update.
#
# This file is installed as /usr/local/sbin/hamafx-sync-systemd-units with
# root ownership. It deliberately fetches the units from the fixed upstream
# repository into a root-owned temporary directory; it never installs units
# directly from the hamafx-writable checkout.

set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo 'hamafx-sync-systemd-units must run as root' >&2
  exit 1
fi

readonly REPO_URL='https://github.com/HamaFx/HamaFX-Ai.git'
readonly TARGET_DIR='/etc/systemd/system'
readonly MANAGED_UNITS=(
  hamafx-light-news.service hamafx-light-news.timer
  hamafx-light-calendar.service hamafx-light-calendar.timer
  hamafx-light-alerts.service hamafx-light-alerts.timer
  hamafx-light-warm-cache.service hamafx-light-warm-cache.timer
  hamafx-light-cleanup-uploads.service hamafx-light-cleanup-uploads.timer
  hamafx-backup-db.service hamafx-backup-db.timer
  hamafx-backup-journal.service hamafx-backup-journal.timer
  hamafx-verify-restore.service hamafx-verify-restore.timer
  hamafx-tenant-export.service hamafx-tenant-export.timer
  hamafx-tenant-delete.service hamafx-tenant-delete.timer
  hamafx-billing-dlq.service hamafx-billing-dlq.timer
  hamafx-disk-check.service hamafx-disk-check.timer
  hamafx-docker-prune.service hamafx-docker-prune.timer
  hamafx-update.service hamafx-update.timer
  hamafx-docker-autoheal.service hamafx-docker-autoheal.timer
  hamafx-webhook.service
)

STAGE_DIR="$(mktemp -d -p /run hamafx-unit-sync.XXXXXX)"
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
    grep -Eq '^Exec(Start|StartPre|StartPost|Condition|Stop|StopPost)=(/usr/bin/(curl|python3|docker|bash|install)|/bin/(sh|sleep)|/opt/hamafx/scripts/[A-Za-z0-9_.-]+|/usr/local/sbin/[A-Za-z0-9_.-]+)' "$source" || {
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
