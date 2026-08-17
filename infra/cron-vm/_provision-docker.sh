#!/usr/bin/env bash
# infra/cron-vm/_provision-docker.sh — Docker-based VM provisioner.
#
# Sets up the VM with:
#   1. Docker + docker-compose plugin
#   2. git (to clone repo for Docker build context)
#   3. GCP CLI (for VM provisioning and firewall management)
#   4. postgresql-client (pg_dump, psql for backups/tenant ops)
#   5. curl (for light crons)
#   6. /opt/kestrel/.env from staged file
#   7. Clones repo to /opt/kestrel/app (build context for Docker)
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
readonly PRIMARY_ENV_SRC='/tmp/kestrel-vm.env'
readonly LEGACY_ENV_SRC='/tmp/hamafx-vm.env'
ENV_SRC="$PRIMARY_ENV_SRC"
readonly INSTALL_DIR='/opt/kestrel'
readonly APP_DIR="${INSTALL_DIR}/app"
readonly REPO_URL='https://github.com/HamaFx/Kestrel.git'

log() { printf '%s [provision-docker] %s\n' "$(date -u +%FT%TZ)" "$*"; }

if [[ "$EUID" -ne 0 ]]; then
  echo "must run as root (sudo bash _provision-docker.sh)" >&2
  exit 1
fi

# Upgrade guard: move the old install into the new Kestrel location before
# creating/chowning it. The old system user and logical database names are
# intentionally preserved as compatibility identifiers until an operator
# performs a separate database/user migration.
# Stop the legacy Compose project before moving its checkout. The project
# label limits this to the former Kestrel deployment and avoids touching
# unrelated containers on the host.
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 && [[ -f /opt/hamafx/docker-compose.yml ]]; then
  log 'stopping legacy hamafx Docker Compose project'
  docker compose -p hamafx --project-directory /opt/hamafx down --remove-orphans 2>/dev/null || true
fi

if [[ -d /opt/hamafx ]]; then
  if [[ ! -e "$INSTALL_DIR" ]]; then
    log 'migrating legacy /opt/hamafx into /opt/kestrel'
    mv /opt/hamafx "$INSTALL_DIR"
  elif [[ -d "$INSTALL_DIR" ]]; then
    # A failed/partial earlier run may have created the destination. Move the
    # complete legacy tree when it is still empty instead of silently leaving
    # the old installation orphaned.
    if [[ -z "$(find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
      log 'reusing empty /opt/kestrel for legacy /opt/hamafx contents'
      rmdir "$INSTALL_DIR"
      mv /opt/hamafx "$INSTALL_DIR"
    else
      # Never merge two live checkouts destructively. A complete Kestrel tree
      # can safely be retried, but an incomplete destination is ambiguous and
      # must fail closed rather than booting a mixed installation.
      if [[ ! -f "$INSTALL_DIR/docker-compose.yml" || ! -d "$INSTALL_DIR/app" ]]; then
        log 'ERROR: /opt/kestrel is non-empty but incomplete while /opt/hamafx still exists' >&2
        log 'Resolve the partial install (or remove /opt/kestrel after backing it up), then rerun provisioning.' >&2
        exit 1
      fi
      log 'legacy /opt/hamafx remains in place; the existing complete Kestrel install will be reused'
    fi
  else
    log "ERROR: $INSTALL_DIR exists but is not a directory; refusing legacy migration" >&2
    exit 1
  fi
fi
if [[ ! -f "$ENV_SRC" && -f "$LEGACY_ENV_SRC" ]]; then
  ENV_SRC="$LEGACY_ENV_SRC"
fi

# Stop and remove only the old Kestrel-managed unit/container namespace. This
# prevents duplicate cron jobs and a port collision during the cutover.
for legacy_unit_path in /etc/systemd/system/hamafx-*; do
  [[ -e "$legacy_unit_path" ]] || continue
  legacy_unit="$(basename "$legacy_unit_path")"
  systemctl disable --now "$legacy_unit" 2>/dev/null || true
  rm -f "$legacy_unit_path"
done
rm -f /etc/systemd/journald.conf.d/hamafx.conf /etc/logrotate.d/hamafx-cron \
  /etc/sudoers.d/hamafx /usr/local/sbin/hamafx-sync-systemd-units
systemctl daemon-reload 2>/dev/null || true
docker rm -f hamafx-worker 2>/dev/null || true

log 'creating /opt/kestrel and the kestrel system user'
install -d -m 755 "$INSTALL_DIR"
if ! id kestrel >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "${INSTALL_DIR}/home" \
    --shell /usr/sbin/nologin kestrel
fi
chown -R kestrel:kestrel "$INSTALL_DIR"

log 'installing /opt/kestrel/.env from staged file (mode 600)'
if [[ -f "$ENV_SRC" ]]; then
  install -m 600 -o kestrel -g kestrel "$ENV_SRC" "${INSTALL_DIR}/.env"
else
  log "WARNING: $ENV_SRC not found — write /opt/kestrel/.env manually before starting"
fi

log 'installing prerequisite system packages'
apt-get update -qq
apt-get install -y -qq curl git logrotate sudo postgresql-client \
  ca-certificates apt-transport-https gnupg \
  docker.io docker-compose-v2

log 'enabling Docker (starts on boot, survives reboots)'
systemctl enable --now docker
usermod -aG docker kestrel

log 'installing Google Cloud CLI for VM provisioning'
if ! command -v gcloud >/dev/null 2>&1; then
  echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
    > /etc/apt/sources.list.d/google-cloud-sdk.list
  curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
    | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
  apt-get update -qq
  apt-get install -y -qq google-cloud-cli
fi

log 'ensuring GCP firewall rules (SSH only — port 8081 NOT exposed)'
GCP_PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID before provisioning the VM}"
if ! gcloud compute firewall-rules describe kestrel-allow-ssh --project="$GCP_PROJECT_ID" 2>/dev/null; then
  gcloud compute firewall-rules create kestrel-allow-ssh \
    --network default --allow tcp:22 --source-ranges 0.0.0.0/0 \
    --project "$GCP_PROJECT_ID" --quiet
fi

log 'cloning the repo into /opt/kestrel/app (Docker build context)'
if [[ -d "$APP_DIR/.git" ]]; then
  sudo -u kestrel git -C "$APP_DIR" fetch --quiet origin main
  sudo -u kestrel git -C "$APP_DIR" reset --hard origin/main
else
  rm -rf "$APP_DIR"
  sudo -u kestrel git clone --depth 1 "$REPO_URL" "$APP_DIR"
fi

log 'configuring journald storage limits'
cat > /etc/systemd/journald.conf.d/kestrel.conf <<'JOURNALD'
[Journal]
SystemMaxUse=500M
SystemKeepFree=2G
MaxFileSec=7day
JOURNALD
systemctl restart systemd-journald

log 'installing sudoers entry'
if [[ -f "${STAGE}/sudoers.d/kestrel" ]]; then
  install -m 440 -o root -g root "${STAGE}/sudoers.d/kestrel" /etc/sudoers.d/kestrel
  visudo -c -f /etc/sudoers.d/kestrel >/dev/null
fi

log 'copying docker-compose.yml to /opt/kestrel/'
install -m 644 -o kestrel -g kestrel \
  "${STAGE}/docker-compose.vm.yml" "${INSTALL_DIR}/docker-compose.yml"

log 'copying scripts to /opt/kestrel/scripts/'
install -d -m 755 -o kestrel -g kestrel "${INSTALL_DIR}/scripts"
for script in docker-update.sh docker-autoheal.sh webhook-listener.py \
  backup-db.sh backup-journal.sh backup-storage.sh backup-storage-ready.sh verify-restore.sh \
  delete-tenant.sh export-tenant.sh _load-env.sh; do
  if [[ -f "${STAGE}/scripts/${script}" ]]; then
    install -m 755 -o kestrel -g kestrel "${STAGE}/scripts/${script}" "${INSTALL_DIR}/scripts/"
  fi
done
chmod +x "${INSTALL_DIR}/scripts/"*.sh 2>/dev/null || true

# Keep the privileged unit synchronizer outside the kestrel-writable checkout.
# docker-update.sh may call it through the narrow sudoers rule.
if [[ -f "${STAGE}/scripts/sync-systemd-units.sh" ]]; then
  install -m 755 -o root -g root "${STAGE}/scripts/sync-systemd-units.sh" /usr/local/sbin/kestrel-sync-systemd-units
fi

log 'tearing down legacy cron'
systemctl stop cron 2>/dev/null || true
systemctl disable cron 2>/dev/null || true
crontab -l 2>/dev/null | grep -v 'kestrel' | crontab - 2>/dev/null || true

log 'logrotate config for legacy log path'
cat > /etc/logrotate.d/kestrel-cron <<'LOGROTATE'
/var/log/kestrel-cron.log {
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
  kestrel-light-news kestrel-light-calendar kestrel-light-alerts \
  kestrel-light-warm-cache kestrel-light-cleanup-uploads \
  kestrel-backup-db kestrel-backup-journal kestrel-verify-restore \
  kestrel-tenant-export kestrel-tenant-delete kestrel-billing-dlq \
  kestrel-disk-check kestrel-docker-prune \
  kestrel-update kestrel-docker-autoheal kestrel-webhook kestrel-health-alerts; do
  for ext in service timer; do
    [[ -f "${STAGE}/units/${unit}.${ext}" ]] && \
      install -m 644 "${STAGE}/units/${unit}.${ext}" "/etc/systemd/system/"
  done
done
systemctl daemon-reload

log 'enabling + starting timers'
for timer in \
  kestrel-light-news.timer kestrel-light-calendar.timer \
  kestrel-light-alerts.timer kestrel-light-warm-cache.timer \
  kestrel-light-cleanup-uploads.timer \
  kestrel-backup-db.timer kestrel-backup-journal.timer \
  kestrel-verify-restore.timer \
  kestrel-tenant-export.timer kestrel-tenant-delete.timer kestrel-billing-dlq.timer \
  kestrel-disk-check.timer kestrel-docker-prune.timer \
  kestrel-update.timer kestrel-docker-autoheal.timer kestrel-health-alerts.timer; do
  systemctl enable --now "$timer" 2>/dev/null || true
done

log 'generating webhook secret if not present'
if ! grep -q '^WEBHOOK_SECRET=' "${INSTALL_DIR}/.env" 2>/dev/null; then
  SECRET=$(openssl rand -hex 32)
  echo "WEBHOOK_SECRET=$SECRET" >> "${INSTALL_DIR}/.env"
  chmod 600 "${INSTALL_DIR}/.env"
  log "webhook secret generated and added to .env"
fi

log 'opening firewall port 9000 for GitHub webhooks'
if ! gcloud compute firewall-rules describe kestrel-webhook --project="$(gcloud config get-value project)" 2>/dev/null; then
  gcloud compute firewall-rules create kestrel-webhook \
    --network default --allow tcp:9000 \
    --source-ranges 140.82.112.0/20 \
    --target-tags kestrel-cron \
    --description 'GitHub webhook listener' \
    --quiet
  log 'firewall rule kestrel-webhook created'
fi

log 'enabling + starting webhook service (systemd direct, not socket)'
systemctl enable kestrel-webhook.service 2>/dev/null
systemctl start kestrel-webhook.service 2>/dev/null || log 'WARNING: webhook service failed to start (check journalctl -u kestrel-webhook.service)'

log 'building and starting the worker container (first build takes ~2-3 min)'
cd "$INSTALL_DIR"
sudo -u kestrel docker compose build 2>&1
sudo -u kestrel docker compose up -d 2>&1

log 'waiting for worker to become healthy (up to 120s)'
for i in $(seq 1 60); do
  status=$(docker inspect --format='{{.State.Health.Status}}' kestrel-worker 2>/dev/null || echo "not-found")
  if [[ "$status" == "healthy" ]]; then
    log "worker is healthy (after $((i*2))s)"
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    log "WARNING: worker not healthy after 120s — check: docker logs kestrel-worker"
  fi
  sleep 2
done

log 'final state'
echo "--- Timers ---"
systemctl list-timers --all 'kestrel-*' --no-pager | head -20
echo "--- Container ---"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

log 'done.'