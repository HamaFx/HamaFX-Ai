#!/usr/bin/env bash
# infra/cron-vm/scripts/backup-env.sh — Daily sync of /opt/hamafx/.env to GCP Secret Manager.
#
# PR-09: Production readiness — if the VM disk is lost, all secrets
# (DATABASE_URL, CRON_SECRET, 18+ HC_*_UUID values) must be recoverable.
# This script pushes the current env file to GCP Secret Manager daily.
#
# Runs daily at 02:00 UTC via hamafx-backup-env.timer.
# Requires: gcloud SDK installed, VM service account has roles/secretmanager.secretVersionAdder
#
# First-time setup (on the VM, as root or a user with gcloud access):
#   gcloud secrets create hamafx-vm-env --replication-policy=automatic
#   gcloud secrets add-iam-policy-binding hamafx-vm-env \
#     --member="serviceAccount:$(gcloud compute instances describe hamafx-cron \
#       --zone=us-central1-a --format='get(serviceAccounts[0].email)')" \
#     --role=roles/secretmanager.secretVersionAdder

set -euo pipefail

# shellcheck source=./_load-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/_load-env.sh" /opt/hamafx/.env

readonly SECRET_NAME="hamafx-vm-env"
readonly ENV_FILE="/opt/hamafx/.env"

HC_UUID="${HC_ENV_BACKUP_UUID:-}"

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

log() { printf '%s [backup-env] %s\n' "$(date -u +%FT%TZ)" "$*"; }

# ------------------------------------------------------------------ Validate
if [[ ! -f "$ENV_FILE" ]]; then
  log "ERROR: $ENV_FILE does not exist"
  ping_hc fail "env file missing"
  exit 1
fi

# Verify the env file is non-empty and has required keys
if ! grep -q 'DATABASE_URL' "$ENV_FILE"; then
  log "ERROR: DATABASE_URL not found in $ENV_FILE — refusing to backup incomplete env"
  ping_hc fail "env file missing DATABASE_URL"
  exit 1
fi

# Check if the secret exists in GCP Secret Manager
if ! gcloud secrets describe "$SECRET_NAME" --format='get(name)' >/dev/null 2>&1; then
  log "WARNING: GCP secret '$SECRET_NAME' does not exist — run the one-time setup first"
  log "  gcloud secrets create $SECRET_NAME --replication-policy=automatic"
  ping_hc fail "secret $SECRET_NAME not found in GCP Secret Manager"
  exit 1
fi

# ------------------------------------------------------------------ Push to Secret Manager
log "pushing $ENV_FILE to GCP Secret Manager ($SECRET_NAME)"

if ! gcloud secrets versions add "$SECRET_NAME" \
  --data-file="$ENV_FILE" \
  --quiet 2>&1; then
  log "ERROR: failed to push env file to GCP Secret Manager"
  ping_hc fail "gcloud secrets versions add failed"
  exit 1
fi

# ------------------------------------------------------------------ Verify
# Check that the latest version is retrievable (sanity check)
if gcloud secrets versions access latest --secret="$SECRET_NAME" 2>/dev/null | grep -q 'DATABASE_URL'; then
  log "verified: latest version contains DATABASE_URL"
else
  log "WARNING: could not verify latest secret version — check IAM permissions"
  ping_hc fail "secret version verification failed"
  exit 1
fi

log "env backup complete"
ping_hc success "env backed up to GCP Secret Manager ($SECRET_NAME)"
