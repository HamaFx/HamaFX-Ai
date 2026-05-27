# Source-helper for /opt/hamafx/.env. Bash's `source` treats values as
# shell — values like Vercel-pulled GOOGLE_APPLICATION_CREDENTIALS_JSON
# blobs contain whitespace + literal "PRIVATE KEY" that bash then tries
# to execute. systemd's EnvironmentFile= uses a stricter parser; this
# helper mimics it for scripts that aren't necessarily systemd-spawned.
#
# Usage:
#   readonly HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "$HERE/_load-env.sh" /opt/hamafx/.env

_load_hamafx_env() {
  local file="${1:-/opt/hamafx/.env}"
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip comments + blank lines.
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    # Split on the FIRST '=' only.
    local key="${line%%=*}"
    local value="${line#*=}"
    # Strip surrounding single/double quotes if present (Vercel doesn't
    # quote, but operator-edited values might).
    if [[ "$value" =~ ^\".*\"$ ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" =~ ^\'.*\'$ ]]; then
      value="${value:1:${#value}-2}"
    fi
    # Skip non-A-Z key shapes (in case of something weird in the file).
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    # `printf -v` is the safe way to assign without re-evaluating the value.
    printf -v "$key" '%s' "$value"
    export "$key"
  done < "$file"
}

_load_hamafx_env "$@"
