#!/usr/bin/env bash
# One-time bootstrap for the HamaFX-Ai worker on the cron VM.
#
# Idempotent: re-running upgrades Node / pnpm if needed and re-clones the
# repo if /opt/hamafx/app is missing. Existing checkouts are left alone so
# update.sh (PR-16) drives subsequent updates.
#
# Run with sudo:
#   gcloud compute scp infra/cron-vm/setup-worker.sh hamafx-cron:/tmp/ \
#     --zone=us-central1-a --project=hamafx-78845
#   gcloud compute ssh hamafx-cron --zone=us-central1-a --project=hamafx-78845 \
#     --command="sudo bash /tmp/setup-worker.sh"

set -euo pipefail

readonly REPO_URL="${REPO_URL:-https://github.com/HamaFx/HamaFX-Ai.git}"
readonly INSTALL_DIR="/opt/hamafx"
readonly APP_DIR="${INSTALL_DIR}/app"
readonly USER_NAME="hamafx"
readonly UNIT_FILE="${APP_DIR}/infra/cron-vm/units/hamafx-worker.service"
readonly TARGET_UNIT="/etc/systemd/system/hamafx-worker.service"

log()  { printf '%s [setup] %s\n' "$(date -u +%FT%TZ)" "$*"; }
warn() { printf '%s [setup][warn] %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }

require_root() {
  if [[ "$EUID" -ne 0 ]]; then
    echo "must run as root (use sudo)" >&2
    exit 1
  fi
}

ensure_user() {
  if ! id "$USER_NAME" >/dev/null 2>&1; then
    log "creating system user '$USER_NAME'"
    useradd --system --create-home --home-dir "${INSTALL_DIR}/home" \
      --shell /usr/sbin/nologin "$USER_NAME"
  fi
  install -d -o "$USER_NAME" -g "$USER_NAME" "$INSTALL_DIR"
}

ensure_node_pnpm() {
  if ! command -v node >/dev/null 2>&1 || ! node --version | grep -qE '^v2[0-9]\.'; then
    log "installing Node.js 20.x via NodeSource"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi
  if ! command -v pnpm >/dev/null 2>&1; then
    log "installing pnpm via corepack"
    corepack enable
    corepack prepare pnpm@9 --activate
  fi
}

ensure_repo() {
  if [[ ! -d "${APP_DIR}/.git" ]]; then
    log "cloning ${REPO_URL} into ${APP_DIR}"
    sudo -u "$USER_NAME" git clone --depth 1 "$REPO_URL" "$APP_DIR"
  else
    log "repo already present at ${APP_DIR} — leaving alone (update.sh drives updates)"
  fi
}

ensure_env_file() {
  local env_file="${INSTALL_DIR}/.env"
  if [[ ! -f "$env_file" ]]; then
    warn "${env_file} missing — write it before starting the worker:"
    warn "  PRODUCTION_URL=https://hama-fx-ai.vercel.app"
    warn "  CRON_SECRET=<...>"
    warn "  DATABASE_URL=<supabase pooler URL>"
    warn "  BIQUOTE_BASE_URL=https://biquote.io        (optional override)"
    warn "  HC_SIGNALR_UUID=<...>                      (optional, for healthchecks.io)"
    warn "  SENTRY_DSN=<...>                           (optional, for Sentry)"
    warn ""
    warn "  Phase 3 §3.9 — Secrets vault (optional, alternative to .env):"
    warn "  SECRETS_VAULT_PROVIDER=gcp-secret-manager   (fetch from GCP Secret Manager)"
    warn "  GCP_PROJECT_ID=<your-gcp-project>           (required when vault provider is gcp-secret-manager)"
    install -m 600 -o "$USER_NAME" -g "$USER_NAME" /dev/null "$env_file"
  fi
  chmod 600 "$env_file"
}

build_worker() {
  log "installing deps + building worker"
  cd "$APP_DIR"
  sudo -u "$USER_NAME" pnpm install --frozen-lockfile
  sudo -u "$USER_NAME" pnpm --filter @hamafx/worker build
}

install_unit() {
  if [[ ! -f "$UNIT_FILE" ]]; then
    echo "expected unit file at $UNIT_FILE — repo checkout incomplete?" >&2
    exit 1
  fi
  log "installing systemd unit -> ${TARGET_UNIT}"
  install -m 644 "$UNIT_FILE" "$TARGET_UNIT"
  systemctl daemon-reload
  systemctl enable hamafx-worker.service
  log "starting hamafx-worker.service"
  systemctl restart hamafx-worker.service
  sleep 2
  systemctl --no-pager status hamafx-worker.service || warn "service did not enter active state — check journalctl -u hamafx-worker"
}

main() {
  require_root
  ensure_user
  ensure_node_pnpm
  ensure_repo
  ensure_env_file
  build_worker
  install_unit
  log "done."
}

main "$@"
