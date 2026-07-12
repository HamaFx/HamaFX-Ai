#!/usr/bin/env bash
# infra/cron-vm/_provision-docker.sh — Docker-based VM provisioner.
#
# Sets up the VM with:
#   1. Docker + docker-compose plugin
#   2. git (to clone repo for Docker build context)
#   3. GCP CLI (gsutil for backups)
#   4. postgresql-client (pg_dump, psql for backups/tenant ops)
#   5. curl (for light crons)
#   6. /opt/hamafx/.env from staged file
#   7. Clones repo to /opt/hamafx/app (build context for Docker)
#   8. docker-compose.yml + scripts
#   9. systemd timers (reduced set — no heavy job timers)
#  10. Builds and starts the worker container
#
# NO Node.js or pnpm on the host — they live inside Docker build stages.
# NO GitHub Actions or external registry — image is built on the VM.
#
# Idempotent — safe to re-run.

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly STAGE="${SCRIPT_DIR}"
readonly ENV_SRC='/tmp/hamafx-vm.env'
readonly INSTALL_DIR='/opt/hamafx'
readonly APP_DIR="${INSTALL_DIR}/app"
readonly REPO_URL='https://github.com/HamaFx/HamaFX-Ai.git'

log() { printf '%s [provision-docker] %s\n' "$(date -u +%FT%TZ)" "$*"; }

if [[ "$EUID" -ne 0 ]]; then
  echo "must run as root (sudo bash _provision-docker.sh)" >&2
  exit 1
fi

log 'creating /opt/hamafx and the hamafx system user'
install -d -m 755 "$INSTALL_DIR"
if ! id hamafx >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "${INSTALL_DIR}/home" \
    --shell /usr/sbin/nologin hamafx
fi
chown -R hamafx:hamafx "$INSTALL_DIR"

log 'installing /opt/hamafx/.env from staged file (mode 600)'
if [[ -f "$ENV_SRC" ]]; then
  install -m 600 -o hamafx -g hamafx "$ENV_SRC" "${INSTALL_DIR}/.env"
else
  log "WARNING: $ENV_SRC not found — write /opt/hamafx/.env manually before starting"
fi

log 'installing prerequisite system packages'
apt-get update -qq
apt-get install -y -qq curl git logrotate sudo postgresql-client \
  ca-certificates apt-transport-https gnupg \
  docker.io docker-compose-v2

log 'enabling Docker (starts on boot, survives reboots)'
systemctl enable --now docker
usermod -aG docker hamafx

log 'installing google-cloud CLI (gsutil) for backups'
if ! command -v gsutil >/dev/null 2>&1; then
  echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
    > /etc/apt/sources.list.d/google-cloud-sdk.list
  curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
    | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
  apt-get update -qq
  apt-get install -y -qq google-cloud-cli
fi

log 'ensuring GCP firewall rules (SSH only — port 8081 NOT exposed)'
if ! gcloud compute firewall-rules describe hamafx-allow-ssh --project=hamafx-78845 2>/dev/null; then
  gcloud compute firewall-rules create hamafx-allow-ssh \
    --network default --allow tcp:22 --source-ranges 0.0.0.0/0 \
    --project hamafx-78845 --quiet
fi

log 'cloning the repo into /opt/hamafx/app (Docker build context)'
if [[ -d "$APP_DIR/.git" ]]; then
  sudo -u hamafx git -C "$APP_DIR" fetch --quiet origin main
  sudo -u hamafx git -C "$APP_DIR" reset --hard origin/main
else
  rm -rf "$APP_DIR"
  sudo -u hamafx git clone --depth 1 "$REPO_URL" "$APP_DIR"
fi

log 'configuring journald storage limits'
cat > /etc/systemd/journald.conf.d/hamafx.conf <<'JOURNALD'
[Journal]
SystemMaxUse=500M
SystemKeepFree=2G
MaxFileSec=7day
JOURNALD
systemctl restart systemd-journald

log 'installing sudoers entry'
if [[ -f "${STAGE}/sudoers.d/hamafx" ]]; then
  install -m 440 -o root -g root "${STAGE}/sudoers.d/hamafx" /etc/sudoers.d/hamafx
  visudo -c -f /etc/sudoers.d/hamafx >/dev/null
fi

log 'copying docker-compose.yml to /opt/hamafx/'
install -m 644 -o hamafx -g hamafx \
  "${STAGE}/docker-compose.vm.yml" "${INSTALL_DIR}/docker-compose.yml"

log 'copying scripts to /opt/hamafx/scripts/'
install -d -m 755 -o hamafx -g hamafx "${INSTALL_DIR}/scripts"
for script in docker-update.sh docker-autoheal.sh \
  backup-db.sh backup-journal.sh verify-restore.sh \
  delete-tenant.sh export-tenant.sh _load-env.sh; do
  if [[ -f "${STAGE}/scripts/${script}" ]]; then
    install -m 755 -o hamafx -g hamafx "${STAGE}/scripts/${script}" "${INSTALL_DIR}/scripts/"
  fi
done
chmod +x "${INSTALL_DIR}/scripts/"*.sh 2>/dev/null || true

log 'tearing down legacy cron'
systemctl stop cron 2>/dev/null || true
systemctl disable cron 2>/dev/null || true
crontab -l 2>/dev/null | grep -v 'hamafx' | crontab - 2>/dev/null || true

log 'logrotate config for legacy log path'
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

log 'installing systemd units (reduced set — no heavy job timers, no worker.service)'
for unit in \
  hamafx-light-news hamafx-light-calendar hamafx-light-alerts \
  hamafx-light-warm-cache hamafx-light-cleanup-uploads \
  hamafx-backup-db hamafx-backup-journal hamafx-verify-restore \
  hamafx-tenant-export hamafx-tenant-delete \
  hamafx-disk-check hamafx-docker-prune \
  hamafx-update hamafx-docker-autoheal; do
  for ext in service timer; do
    [[ -f "${STAGE}/units/${unit}.${ext}" ]] && \
      install -m 644 "${STAGE}/units/${unit}.${ext}" "/etc/systemd/system/"
  done
done
systemctl daemon-reload

log 'enabling + starting timers'
for timer in \
  hamafx-light-news.timer hamafx-light-calendar.timer \
  hamafx-light-alerts.timer hamafx-light-warm-cache.timer \
  hamafx-light-cleanup-uploads.timer \
  hamafx-backup-db.timer hamafx-backup-journal.timer \
  hamafx-verify-restore.timer \
  hamafx-tenant-export.timer hamafx-tenant-delete.timer \
  hamafx-disk-check.timer hamafx-docker-prune.timer \
  hamafx-update.timer hamafx-docker-autoheal.timer; do
  systemctl enable --now "$timer" 2>/dev/null || true
done

log 'building and starting the worker container (first build takes ~2-3 min)'
cd "$INSTALL_DIR"
sudo -u hamafx docker compose build 2>&1
sudo -u hamafx docker compose up -d 2>&1

log 'waiting for worker to become healthy (up to 120s)'
for i in $(seq 1 60); do
  status=$(docker inspect --format='{{.State.Health.Status}}' hamafx-worker 2>/dev/null || echo "not-found")
  if [[ "$status" == "healthy" ]]; then
    log "worker is healthy (after $((i*2))s)"
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    log "WARNING: worker not healthy after 120s — check: docker logs hamafx-worker"
  fi
  sleep 2
done

log 'final state'
echo "--- Timers ---"
systemctl list-timers --all 'hamafx-*' --no-pager | head -20
echo "--- Container ---"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

log 'done.'