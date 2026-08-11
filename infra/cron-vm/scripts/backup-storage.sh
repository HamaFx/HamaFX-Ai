#!/usr/bin/env bash
# Shared storage adapter for VM backups and tenant exports.
#
# Backblaze B2 is intentionally opt-in: the account and credentials are
# configured later by the operator. Call backup_storage_available before a
# scheduled job starts so a missing account is reported clearly without
# attempting the retired GCS path.

set -euo pipefail

backup_storage_available() {
  [[ "${BACKUP_PROVIDER:-b2}" == 'b2' ]] || return 1
  [[ -n "${B2_BUCKET:-}" ]] || return 1
  [[ -n "${B2_KEY_ID:-}" ]] || return 1
  [[ -n "${B2_APPLICATION_KEY:-}" ]] || return 1
  command -v rclone >/dev/null 2>&1 || return 1
}

backup_storage_require() {
  if ! backup_storage_available; then
    echo 'B2 backup storage is not configured; create the B2 account, set BACKUP_PROVIDER=b2/B2_BUCKET/B2_KEY_ID/B2_APPLICATION_KEY, and install rclone' >&2
    return 1
  fi

  # Configure an in-memory rclone remote. Credentials never need to be
  # written to an rclone config file on disk.
  export RCLONE_CONFIG_HAMAFX_TYPE=b2
  export RCLONE_CONFIG_HAMAFX_ACCOUNT="$B2_KEY_ID"
  export RCLONE_CONFIG_HAMAFX_KEY="$B2_APPLICATION_KEY"
}

backup_remote() {
  printf 'hamafx:%s/%s' "$B2_BUCKET" "$1"
}

backup_storage_upload_stream() {
  local target="$1"
  backup_storage_require
  rclone rcat "$(backup_remote "$target")"
}

backup_storage_upload_file() {
  local source="$1"
  local target="$2"
  backup_storage_require
  rclone copyto "$source" "$(backup_remote "$target")"
}

backup_storage_download_file() {
  local target="$1"
  local destination="$2"
  backup_storage_require
  rclone copyto "$(backup_remote "$target")" "$destination"
}

backup_storage_latest_db() {
  backup_storage_require
  rclone lsf --files-only "$(backup_remote 'db')" \
    | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.dump\.gz$' \
    | sort \
    | tail -n 1 \
    | while IFS= read -r name; do backup_remote "db/$name"; done
}

backup_storage_size() {
  local target="$1"
  backup_storage_require
  rclone size --json "$(backup_remote "$target")" \
    | sed -n 's/.*"bytes"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p'
}
