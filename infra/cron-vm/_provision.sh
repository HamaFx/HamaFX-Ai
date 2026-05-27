#!/usr/bin/env bash
# infra/cron-vm/_provision.sh — one-shot provisioner. Runs ON the VM after
# /tmp/hamafx-cron-stage and /tmp/hamafx-vm.env have been copied up.
#
# Idempotent — safe to re-run.

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly STAGE="${SCRIPT_DIR}"
readonly ENV_SRC='/tmp/hamafx-vm.env'
readonly INSTALL_DIR='/opt/hamafx'
readonly APP_DIR="${INSTALL_DIR}/app"
readonly REPO_URL='https://github.com/HamaFx/HamaFX-Ai.git'

log() { printf '%s [provision] %s\n' "$(date -u +%FT%TZ)" "$*"; }

if [[ "$EUID" -ne 0 ]]; then
  echo "must run as root (sudo bash _provision.sh)" >&2
  exit 1
fi

log 'creating /opt/hamafx and the hamafx system user (idempotent)'
install -d -m 755 "$INSTALL_DIR"
if ! id hamafx >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "${INSTALL_DIR}/home" \
    --shell /usr/sbin/nologin hamafx
fi
# Make sure hamafx owns the install dir so git clone + builds work as that user.
chown -R hamafx:hamafx "$INSTALL_DIR"

log 'installing /opt/hamafx/.env from the staged file (mode 600)'
install -m 600 -o hamafx -g hamafx "$ENV_SRC" "${INSTALL_DIR}/.env"

log 'installing prerequisite system packages'
apt-get update -qq
apt-get install -y -qq curl git logrotate sudo postgresql-client docker.io ca-certificates apt-transport-https gnupg

log 'enabling docker so the verify-restore timer can boot a throwaway pg'
systemctl enable --now docker
usermod -aG docker hamafx

log 'installing Node.js 20.x (skipped if already present at v20+)'
if ! command -v node >/dev/null 2>&1 || ! node --version | grep -qE '^v(20|21|22)\.'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

log 'installing pnpm via corepack (idempotent)'
corepack enable
corepack prepare pnpm@9 --activate

log 'installing google-cloud CLI for gsutil (idempotent)'
if ! command -v gsutil >/dev/null 2>&1; then
  echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
    > /etc/apt/sources.list.d/google-cloud-sdk.list
  curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
    | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
  apt-get update -qq
  apt-get install -y -qq google-cloud-cli
fi

log 'cloning the repo into /opt/hamafx/app (or fetching latest)'
if [[ -d "$APP_DIR/.git" ]]; then
  sudo -u hamafx git -C "$APP_DIR" fetch --quiet origin main
  sudo -u hamafx git -C "$APP_DIR" reset --hard origin/main
else
  rm -rf "$APP_DIR"
  sudo -u hamafx git clone --depth 1 "$REPO_URL" "$APP_DIR"
fi

log 'building the worker (pnpm install + filter build)'
cd "$APP_DIR"
sudo -u hamafx pnpm install --frozen-lockfile
sudo -u hamafx pnpm --filter @hamafx/worker build

log 'recording deployed SHA + appending DEPLOYED_SHA into /opt/hamafx/.env'
sha=$(sudo -u hamafx git -C "$APP_DIR" rev-parse HEAD)
echo "$sha" > "${INSTALL_DIR}/.deployed-sha"
chown hamafx:hamafx "${INSTALL_DIR}/.deployed-sha"

# Worker + jobs read DEPLOYED_SHA from /opt/hamafx/.env via the
# EnvironmentFile= directive. Append (or replace) the line.
ENV_FILE="${INSTALL_DIR}/.env"
if grep -q '^DEPLOYED_SHA=' "$ENV_FILE"; then
  sed -i "s|^DEPLOYED_SHA=.*|DEPLOYED_SHA=$sha|" "$ENV_FILE"
else
  echo "DEPLOYED_SHA=$sha" >> "$ENV_FILE"
fi

log 'running setup.sh (installs sudoers, all systemd units, enables timers)'
bash "$STAGE/setup.sh"

log 'final state — listing active timers + worker status'
systemctl list-timers --all 'hamafx-*' --no-pager | head -30
systemctl status hamafx-worker.service --no-pager | head -8

log 'done.'
