#!/usr/bin/env bash
# Exit successfully only when the deferred B2 backup integration is ready.
# systemd uses this as ExecCondition so backup jobs remain skipped, rather
# than failed, until the operator supplies B2 credentials.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_load-env.sh" /opt/kestrel/.env
source "$SCRIPT_DIR/backup-storage.sh"

if backup_storage_available; then
  exit 0
fi

# Exit 1 is a deliberate ExecCondition skip, not a job failure. Keep the
# reason in the journal so operators can see why the timer did not run.
printf '%s [backup-storage] B2 is not configured; backup/restore/export job skipped\n' \
  "$(date -u +%FT%TZ)" >&2
exit 1
